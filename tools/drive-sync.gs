/**
 * Монітор розрахунків — копії документів договорів на контролі на Google Диску.
 *
 * A web app that runs as the user who opens it (manifest: executeAs
 * USER_ACCESSING). Each user opens it once from the site (Settings → Google Drive,
 * ?uid=<their Firebase uid>); it remembers the uid and installs that user's own
 * 6-hour trigger. Every run reads the public site data (data/tracked/*.json) and
 * copies the documents of the contracts this user follows into their Drive:
 *
 *   Монітор розрахунків — договори на контролі /
 *       <замовник> — № <номер> від <дата> / Договір/    signed contract, annexes …
 *                                          / Закупівля/  tender documents
 *       Реєстр договорів на контролі   (Google Sheet: price, paid, left, links)
 *
 * Why a script: Prozorro's file storage sends no CORS headers, so a web page
 * cannot download the files. Drive is reached through its REST API with the
 * drive.file scope only: the script sees just the files it created itself.
 * Each document is downloaded once (remembered by its id and date).
 */

var SITE = 'https://kovalenkoserhii2107-maker.github.io/spendings/';
var ROOT = 'Монітор розрахунків — договори на контролі';
var SHEET = 'Реєстр договорів на контролі';
var FOLDER_MIME = 'application/vnd.google-apps.folder';
var TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script stops a run at 6 minutes

// ---- the page the user opens from the site ----------------------------------------------

function doGet(e) {
  var p = (e && e.parameter) || {};
  var en = p.lang === 'en';
  var uid = String(p.uid || '');
  if (!/^[A-Za-z0-9]{20,64}$/.test(uid)) {
    return page_(en ? 'Open this from the app' : 'Відкрийте це з додатка',
      en ? 'Use Settings → Google Drive → Connect in “Монітор розрахунків”.'
         : 'Натисніть «Підключити Google Диск» у «Налаштуваннях» додатка «Монітор розрахунків».', null);
  }
  var props = PropertiesService.getUserProperties();
  props.setProperty('uid', uid);
  var root = rootFolder_();
  ensureTriggers_();
  return page_(en ? 'Google Drive is connected' : 'Google Диск підключено',
    en ? 'Documents of the contracts you follow will appear in this folder within a few minutes, then every 6 hours. You can close this tab.'
       : 'Документи договорів, які ви відстежуєте, зʼявляться в цій папці за кілька хвилин, далі — кожні 6 годин. Цю вкладку можна закрити.',
    { url: 'https://drive.google.com/drive/folders/' + root, label: en ? 'Open the folder' : 'Відкрити папку' });
}

function page_(title, text, link) {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:40px 20px;background:#EEF2F7;color:#1C1C1E}' +
    'main{max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 1px 3px rgba(15,23,42,.08)}' +
    'h1{font-size:24px;margin:0 0 10px}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:999px;background:#000;color:#fff;text-decoration:none;font-weight:700}</style>' +
    '<main><h1>' + esc_(title) + '</h1><p>' + esc_(text) + '</p>' +
    (link ? '<a href="' + esc_(link.url) + '" target="_blank" rel="noopener">' + esc_(link.label) + '</a>' : '') + '</main>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

// One 6-hour trigger per user, plus a one-off run right after connecting.
function ensureTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    var fn = tr.getHandlerFunction();
    if (fn === 'syncAll' || fn === 'syncSoon') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('syncSoon').timeBased().after(10 * 1000).create();
}

function syncSoon() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'syncSoon') ScriptApp.deleteTrigger(tr);
  });
  syncAll();
}

// ---- copying ------------------------------------------------------------------------------

function syncAll() {
  var started = Date.now();
  var props = PropertiesService.getUserProperties();
  var uid = props.getProperty('uid');
  if (!uid) { Logger.log('Не підключено: відкрийте веб-застосунок із додатка.'); return; }
  var index = getJson_(SITE + 'data/tracked/index.json?v=' + started);
  var rows = (index.items || []).filter(function (r) { return (r.followers || []).indexOf(uid) >= 0; });
  var root = rootFolder_();
  var copied = 0, pending = 0;
  rows.forEach(function (row) {
    var dir = folder_(root, folderName_(row));
    row._folder = 'https://drive.google.com/drive/folders/' + dir;
    if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
    var snap;
    try {
      snap = getJson_(SITE + 'data/tracked/' + row.key + '.json?v=' + started);
    } catch (e) {
      Logger.log('Не прочитано ' + row.key + ': ' + e);
      return;
    }
    [['Договір', (snap.contract || {}).docs || []], ['Закупівля', (snap.tender || {}).docs || []]].forEach(function (g) {
      if (!g[1].length) return;
      var sub = folder_(dir, g[0]);
      g[1].forEach(function (d) {
        if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
        var key = 'doc:' + (d.id || d.url) + ':' + (d.date || '');
        if (props.getProperty(key)) return;
        try {
          var res = UrlFetchApp.fetch(d.url, { muteHttpExceptions: true, followRedirects: true });
          if (res.getResponseCode() !== 200) { Logger.log('HTTP ' + res.getResponseCode() + ' ' + d.title); return; }
          var id = upload_(res.getBlob(), fileName_(d), sub, 'Prozorro: ' + (d.id || '') + '\n' + d.url);
          props.setProperty(key, id);
          copied++;
        } catch (e) {
          Logger.log('Не скопійовано ' + d.title + ': ' + e);
        }
      });
    });
  });
  writeRegister_(root, rows);
  Logger.log('Договорів: ' + rows.length + '; скопійовано документів: ' + copied +
    (pending ? '; решту буде скопійовано наступного запуску' : ''));
  return copied;
}

function writeRegister_(root, rows) {
  var head = ['Замовник', 'Постачальник', '№ договору', 'Підписано', 'Діє до', 'Статус', 'Ціна, грн', 'Сплачено, грн',
    'Лишилось, грн', 'Прострочено, грн', 'Остання зміна', 'Prozorro', 'Папка з документами', 'Нотатка'];
  var lines = [head].concat(rows.map(function (r) {
    var t = r.totals || {};
    return [r.buyer_name || '', r.supplier_name || '', r.number || '', r.signed || '', r.end || '', r.status || '',
      t.value || 0, t.paid || 0, t.left || 0, t.overdue || 0, (r.changed_at || '') + ' ' + ((r.last_event || {}).type || ''),
      'https://prozorro.gov.ua/tender/' + r.tid, r._folder || '', r.note || ''];
  }));
  var csv = lines.map(function (l) {
    return l.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  var blob = Utilities.newBlob(csv, 'text/csv', SHEET + '.csv');
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('sheet');
  if (id) {
    var res = drive_('patch', 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', blob, true);
    if (res.getResponseCode() === 200) return;
  }
  id = upload_(blob, SHEET, root, '', 'application/vnd.google-apps.spreadsheet');
  props.setProperty('sheet', id);
}

// ---- Google Drive REST, drive.file scope ---------------------------------------------------

function drive_(method, url, payload, raw) {
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (payload != null) {
    if (raw) { opt.payload = payload.getBytes(); opt.contentType = payload.getContentType(); }
    else { opt.payload = JSON.stringify(payload); opt.contentType = 'application/json'; }
  }
  return UrlFetchApp.fetch(url, opt);
}

function rootFolder_() {
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('root');
  if (id && alive_(id)) return id;
  id = folder_('root', ROOT);
  props.setProperty('root', id);
  return id;
}

function alive_(id) {
  var res = drive_('get', 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=trashed');
  return res.getResponseCode() === 200 && !JSON.parse(res.getContentText()).trashed;
}

function folder_(parent, name) {
  var q = "name = '" + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER_MIME +
    "' and '" + parent + "' in parents and trashed = false";
  var res = drive_('get', 'https://www.googleapis.com/drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q));
  var found = JSON.parse(res.getContentText()).files || [];
  if (found.length) return found[0].id;
  res = drive_('post', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: name, mimeType: FOLDER_MIME, parents: [parent] });
  return JSON.parse(res.getContentText()).id;
}

function upload_(blob, name, parent, description, asType) {
  var b = 'monitor' + Date.now();
  var meta = { name: name, parents: [parent] };
  if (description) meta.description = description;
  if (asType) meta.mimeType = asType;
  var head = Utilities.newBlob('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
    '\r\n--' + b + '\r\nContent-Type: ' + (blob.getContentType() || 'application/octet-stream') + '\r\n\r\n').getBytes();
  var tail = Utilities.newBlob('\r\n--' + b + '--').getBytes();
  var body = Utilities.newBlob(head.concat(blob.getBytes()).concat(tail), 'multipart/related; boundary=' + b);
  var res = drive_('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', body, true);
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText()).id;
}

// ---- helpers ------------------------------------------------------------------------------

function getJson_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' ' + url);
  return JSON.parse(res.getContentText('UTF-8'));
}

function folderName_(r) {
  var who = (r.buyer_name || r.buyer || '').replace(/\s+/g, ' ').slice(0, 80);
  return (who + ' — № ' + (r.number || '—') + (r.signed ? ' від ' + r.signed : '')).replace(/[\\/]/g, '-');
}

function fileName_(d) {
  var day = (d.date || '').slice(0, 10);
  return ((day ? day + ' ' : '') + (d.title || 'document')).replace(/[\\/]/g, '-');
}
