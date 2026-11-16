/**
 * Монітор розрахунків — копії документів договорів на контролі на Google Диску.
 *
 * A web app that runs as the user who opens it (manifest: executeAs
 * USER_ACCESSING), in the same Google Cloud project as the site, so the site and
 * this script are one app for Google Drive and share one folder. Each user opens
 * it once from the site (Settings → Google Drive, ?uid=<their Firebase uid>); it
 * remembers the uid, creates the folders and installs that user's own 6-hour
 * trigger. Every run reads the public site data (data/tracked/*.json), where a
 * contract is marked for its owners and recipients by sha256("monitor:" + uid),
 * and files the documents:
 *
 *   Монітор розрахунків /                         (shared with the site's exports)
 *     Договори на контролі /
 *       <організація> (<ЄДРПОУ>) /
 *         № <номер> від <дата> — <предмет> /
 *           1. Договір            signed contract and its other documents
 *           2. Зміни й додатки    annexes and additional agreements
 *           3. Закупівля          tender documents
 *       Поділилися зі мною / <організація> / <договір> / …
 *       Реєстр договорів на контролі   (Google Sheet: price, paid, left, links)
 *
 * Why a script: Prozorro's file storage sends no CORS headers, so a web page
 * cannot download the files. Drive is reached through its REST API with the
 * drive.file scope only: it sees just the files this app (site + script) created.
 * Each document is downloaded once (remembered by its id and date).
 */

var SITE = 'https://kovalenkoserhii2107-maker.github.io/spendings/';
var ROOT = 'Монітор розрахунків';
var SECTION = 'Договори на контролі';
var SHARED = 'Поділилися зі мною';
var SHEET = 'Реєстр договорів на контролі';
var PARTS = { contract: '1. Договір', changes: '2. Зміни й додатки', tender: '3. Закупівля' };
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
  // Google lets people tick permissions one by one; without "run when you are not present"
  // (script.scriptapp) the 6-hour copies cannot run, so ask for all of them at once.
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  PropertiesService.getUserProperties().setProperty('uid', uid);
  var section = sectionFolder_();
  ensureTriggers_();
  return page_(en ? 'Google Drive is connected' : 'Google Диск підключено',
    en ? 'The folder “Монітор розрахунків / Договори на контролі” is ready. Documents of your contracts appear there within a few minutes, sorted by organisation and contract, then every 6 hours. You can close this tab.'
       : 'Папка «Монітор розрахунків / Договори на контролі» готова. Документи ваших договорів зʼявляться в ній за кілька хвилин — за організаціями й договорами, далі оновлюватимуться кожні 6 годин. Цю вкладку можна закрити.',
    { url: 'https://drive.google.com/drive/folders/' + section, label: en ? 'Open the folder' : 'Відкрити папку' });
}

function page_(title, text, link) {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:40px 20px;background:#EEF2F7;color:#1C1C1E}' +
    'main{max-width:520px;margin:0 auto;background:#fff;border-radius:24px;padding:28px;box-shadow:0 1px 3px rgba(15,23,42,.08)}' +
    'small{display:block;color:#5B5F66;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px;margin-bottom:6px}' +
    'h1{font-size:24px;margin:0 0 10px}a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:999px;background:#000;color:#fff;text-decoration:none;font-weight:700}</style>' +
    '<main><small>Монітор розрахунків</small><h1>' + esc_(title) + '</h1><p>' + esc_(text) + '</p>' +
    (link ? '<a href="' + esc_(link.url) + '" target="_blank" rel="noopener">' + esc_(link.label) + '</a>' : '') + '</main>';
  return HtmlService.createHtmlOutput(html).setTitle('Монітор розрахунків — ' + title);
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

// The one-off run after connecting; ensureTriggers_ removes it on the next connect.
function syncSoon() {
  syncAll();
}

// ---- copying ------------------------------------------------------------------------------

function syncAll() {
  var started = Date.now();
  var props = PropertiesService.getUserProperties();
  var uid = props.getProperty('uid');
  if (!uid) { Logger.log('Не підключено: відкрийте веб-застосунок із додатка.'); return; }
  var me = hash_(uid);
  var index = getJson_(SITE + 'data/tracked/index.json?v=' + started);
  var rows = (index.items || []).filter(function (r) { return (r.viewers || []).indexOf(me) >= 0; });
  var section = sectionFolder_();
  retype_(props);
  var copied = 0, pending = 0;
  rows.forEach(function (row) {
    var own = !row.owners || row.owners.indexOf(me) >= 0;
    row._section = own ? 'Мої' : SHARED;
    var base = own ? section : folder_(section, SHARED);
    var dir = folder_(folder_(base, orgFolderName_(row)), contractFolderName_(row));
    row._folder = 'https://drive.google.com/drive/folders/' + dir;
    if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
    var snap;
    try {
      snap = getJson_(SITE + 'data/tracked/' + row.key + '.json?v=' + started);
    } catch (e) {
      Logger.log('Не прочитано ' + row.key + ': ' + e);
      return;
    }
    var docs = ((snap.contract || {}).docs || []).map(function (d) { return [isChange_(d) ? 'changes' : 'contract', d]; })
      .concat(((snap.tender || {}).docs || []).map(function (d) { return ['tender', d]; }));
    var subs = {};
    docs.forEach(function (x) {
      var part = x[0], d = x[1];
      if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
      var key = 'doc:' + uid.slice(0, 6) + ':' + (d.id || d.url) + ':' + (d.date || '');
      if (props.getProperty(key)) return;
      try {
        var res = UrlFetchApp.fetch(d.url, { muteHttpExceptions: true, followRedirects: true });
        if (res.getResponseCode() !== 200) { Logger.log('HTTP ' + res.getResponseCode() + ' ' + d.title); return; }
        subs[part] = subs[part] || folder_(dir, PARTS[part]);
        var id = upload_(res.getBlob(), fileName_(d), subs[part], 'Prozorro: ' + (d.id || '') + '\n' + d.url);
        props.setProperty(key, id);
        copied++;
      } catch (e) {
        Logger.log('Не скопійовано ' + d.title + ': ' + e);
      }
    });
  });
  writeRegister_(section, rows);
  Logger.log('Договорів: ' + rows.length + '; скопійовано документів: ' + copied +
    (pending ? '; решту буде скопійовано наступного запуску' : ''));
  return copied;
}

// Annexes and additional agreements go to their own folder.
function isChange_(d) {
  return d.type === 'contractAnnexe' || /(^|[^а-яіїєґ])(ду(?=[\s\d№_.-])|д\/у|дод\.?\s*угод|додатков|змін)/i.test(d.title || '');
}

function writeRegister_(section, rows) {
  var head = ['Розділ', 'Замовник', 'Постачальник', '№ договору', 'Підписано', 'Діє до', 'Статус', 'Ціна, грн',
    'Сплачено, грн', 'Лишилось, грн', 'Прострочено, грн', 'Остання зміна', 'Prozorro', 'Папка з документами'];
  var lines = [head].concat(rows.map(function (r) {
    var t = r.totals || {};
    return [r._section || '', r.buyer_name || '', r.supplier_name || '', r.number || '', r.signed || '', r.end || '', r.status || '',
      t.value || 0, t.paid || 0, t.left || 0, t.overdue || 0, (r.changed_at || '') + ' ' + ((r.last_event || {}).type || ''),
      'https://prozorro.gov.ua/tender/' + r.tid, r._folder || ''];
  }));
  var csv = lines.map(function (l) {
    return l.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  var blob = Utilities.newBlob(csv, 'text/csv', SHEET + '.csv');
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('register');
  if (id && alive_(id)) {
    var res = drive_('patch', 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', blob, true);
    if (res.getResponseCode() === 200) return;
  }
  id = createSheet_(csv, SHEET, section);
  props.setProperty('register', id);
}

// ---- Google Drive REST, drive.file scope ---------------------------------------------------

function drive_(method, url, payload, raw) {
  var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (payload != null) {
    if (raw) { opt.payload = payload; opt.contentType = payload.getContentType() || 'application/octet-stream'; }
    else { opt.payload = JSON.stringify(payload); opt.contentType = 'application/json'; }
  }
  return UrlFetchApp.fetch(url, opt);
}

// "Монітор розрахунків / Договори на контролі": the site may have made the root already.
function sectionFolder_() {
  var props = PropertiesService.getUserProperties();
  var id = props.getProperty('section');
  if (id && alive_(id)) return id;
  var root = find_(ROOT, null) || folder_('root', ROOT);
  id = folder_(root, SECTION);
  props.setProperty('section', id);
  return id;
}

function alive_(id) {
  var res = drive_('get', 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=trashed');
  return res.getResponseCode() === 200 && !JSON.parse(res.getContentText()).trashed;
}

function find_(name, parent) {
  var q = "name = '" + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER_MIME + "' and trashed = false" +
    (parent ? " and '" + parent + "' in parents" : '');
  var res = drive_('get', 'https://www.googleapis.com/drive/v3/files?fields=files(id)&spaces=drive&q=' + encodeURIComponent(q));
  var found = JSON.parse(res.getContentText()).files || [];
  return found.length ? found[0].id : null;
}

function folder_(parent, name) {
  var id = find_(name, parent);
  if (id) return id;
  var res = drive_('post', 'https://www.googleapis.com/drive/v3/files?fields=id', { name: name, mimeType: FOLDER_MIME, parents: [parent] });
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText()).id;
}

// Upload in two steps: the content as it is (a Blob goes to UrlFetchApp untouched,
// so large PDFs do not blow up memory), then the name, folder and description.
function upload_(blob, name, parent, description) {
  blob.setContentType(mimeOf_(name, blob));
  var res = drive_('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id', blob, true);
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var id = JSON.parse(res.getContentText()).id;
  var meta = { name: name };
  if (description) meta.description = description;
  res = drive_('patch', 'https://www.googleapis.com/drive/v3/files/' + id + '?addParents=' + parent + '&removeParents=root&fields=id', meta);
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return id;
}

// Prozorro's storage often answers "text/plain" for PDFs and Word files; Drive then
// shows them as text. The extension of the document's title is more reliable.
var MIME = {
  pdf: 'application/pdf', doc: 'application/msword', rtf: 'application/rtf', txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  xml: 'application/xml', html: 'text/html', htm: 'text/html'
};
function mimeOf_(name, blob) {
  var ext = (String(name || '').match(/\.([A-Za-z0-9]+)$/) || [])[1];
  if (ext && MIME[ext.toLowerCase()]) return MIME[ext.toLowerCase()];
  var t = blob ? blob.getContentType() : '';
  return t && t !== 'text/plain' ? t : 'application/octet-stream';
}

// Once per user: copies made before the fix were stored as "text/plain". Drive cannot
// change a file's type in place, so they go to the bin and are copied again.
function retype_(props) {
  if (props.getProperty('retyped')) return;
  var all = props.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('doc:') !== 0) return;
    var res = drive_('get', 'https://www.googleapis.com/drive/v3/files/' + all[key] + '?fields=name,mimeType,trashed');
    if (res.getResponseCode() !== 200) return;
    var f = JSON.parse(res.getContentText());
    if (f.trashed || f.mimeType !== 'text/plain' || mimeOf_(f.name) === 'text/plain') return;
    drive_('patch', 'https://www.googleapis.com/drive/v3/files/' + all[key], { trashed: true });
    props.deleteProperty(key);
  });
  props.setProperty('retyped', '1');
}

// A small CSV turned into a Google Sheet: conversion happens only in a one-request upload.
function createSheet_(csv, name, parent) {
  var b = 'monitor' + Date.now();
  var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name: name, parents: [parent], mimeType: 'application/vnd.google-apps.spreadsheet' }) +
    '\r\n--' + b + '\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n' + csv + '\r\n--' + b + '--';
  var res = drive_('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    Utilities.newBlob(body, 'multipart/related; boundary=' + b), true);
  if (res.getResponseCode() !== 200) throw new Error('Drive ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText()).id;
}

// ---- helpers ------------------------------------------------------------------------------

function hash_(uid) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'monitor:' + uid, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function getJson_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' ' + url);
  return JSON.parse(res.getContentText('UTF-8'));
}

function clean_(s, n) {
  return String(s || '').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, n);
}

// The organisation the contract was picked from: the buyer, or the supplier.
function orgFolderName_(r) {
  var name = r.org && r.org === r.supplier ? r.supplier_name : r.buyer_name;
  return clean_(name || r.org || '—', 90) + (r.org ? ' (' + r.org + ')' : '');
}

function contractFolderName_(r) {
  return clean_('№ ' + (r.number || '—') + (r.signed ? ' від ' + r.signed.split('-').reverse().join('.') : '') +
    (r.title ? ' — ' + r.title : ''), 120);
}

function fileName_(d) {
  var day = (d.date || '').slice(0, 10);
  return clean_((day ? day + ' ' : '') + (d.title || 'document'), 200);
}
