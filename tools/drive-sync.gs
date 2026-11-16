/**
 * Монітор розрахунків — копії документів договорів на контролі на Google Диску.
 *
 * Runs in the user's own Google account (script.google.com), so it can write to
 * their Drive and download from Prozorro, which a web page cannot (no CORS).
 * Every 6 hours it reads the public site data (data/tracked/*.json), and for each
 * contract on control:
 *   Монітор розрахунків / Договори на контролі / <замовник> — № <номер> від <дата> /
 *       Договір/     signed contract, annexes, other contract documents
 *       Закупівля/   tender documents
 * Each Prozorro document is downloaded once (remembered by its id), so new
 * versions and new documents are added and nothing is copied twice.
 * The sheet "Реєстр договорів на контролі" in the same folder lists every
 * contract with its price, payments, what is left and a link to its folder.
 *
 * Setup: paste this file into a new Apps Script project, run setup() once and
 * allow access. setup() installs the 6-hour trigger and runs the first copy.
 */

var SITE = 'https://kovalenkoserhii2107-maker.github.io/spendings/';
var ROOT = 'Монітор розрахунків';
var TRACKED = 'Договори на контролі';
var SHEET = 'Реєстр договорів на контролі';
var TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script stops a run at 6 minutes

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(6).create();
  syncAll();
}

function syncAll() {
  var started = Date.now();
  var props = PropertiesService.getUserProperties();
  var index = getJson_(SITE + 'data/tracked/index.json?v=' + started);
  var base = folder_(folder_(DriveApp.getRootFolder(), ROOT), TRACKED);
  var rows = [];
  var copied = 0, pending = 0;
  (index.items || []).forEach(function (row) {
    var dir = folder_(base, folderName_(row));
    rows.push(row);
    row._folder = dir.getUrl();
    if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
    var snap;
    try {
      snap = getJson_(SITE + 'data/tracked/' + row.key + '.json?v=' + started);
    } catch (e) {
      Logger.log('Не прочитано ' + row.key + ': ' + e);
      return;
    }
    var groups = [['Договір', (snap.contract || {}).docs || []], ['Закупівля', (snap.tender || {}).docs || []]];
    groups.forEach(function (g) {
      var sub = folder_(dir, g[0]);
      g[1].forEach(function (d) {
        if (Date.now() - started > TIME_LIMIT_MS) { pending++; return; }
        var key = 'doc:' + (d.id || d.url) + ':' + (d.date || '');
        if (props.getProperty(key)) return;
        try {
          var res = UrlFetchApp.fetch(d.url, { muteHttpExceptions: true, followRedirects: true });
          if (res.getResponseCode() !== 200) { Logger.log('HTTP ' + res.getResponseCode() + ' ' + d.title); return; }
          var blob = res.getBlob().setName(fileName_(d));
          var file = sub.createFile(blob);
          file.setDescription('Prozorro: ' + (d.id || '') + '\n' + d.url);
          props.setProperty(key, file.getId());
          copied++;
        } catch (e) {
          Logger.log('Не скопійовано ' + d.title + ': ' + e);
        }
      });
    });
  });
  writeRegister_(folder_(DriveApp.getRootFolder(), ROOT), base, rows);
  Logger.log('Скопійовано документів: ' + copied + (pending ? '; решту буде скопійовано наступного запуску' : ''));
}

function writeRegister_(root, base, rows) {
  var files = base.getFilesByName(SHEET);
  var ss = files.hasNext() ? SpreadsheetApp.open(files.next()) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET);
    DriveApp.getFileById(ss.getId()).moveTo(base);
  }
  var sh = ss.getSheets()[0];
  var head = ['Замовник', 'Постачальник', '№ договору', 'Підписано', 'Діє до', 'Статус', 'Ціна, ₴', 'Сплачено, ₴',
    'Лишилось, ₴', 'Прострочено, ₴', 'Остання зміна', 'Prozorro', 'Папка з документами', 'Нотатка'];
  var data = rows.map(function (r) {
    var t = r.totals || {};
    var ev = r.last_event || {};
    return [r.buyer_name || '', r.supplier_name || '', r.number || '', r.signed || '', r.end || '', r.status || '',
      t.value || 0, t.paid || 0, t.left || 0, t.overdue || 0, (r.changed_at || '') + ' ' + (ev.type || ''),
      'https://prozorro.gov.ua/tender/' + r.tid, r._folder || '', r.note || ''];
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (data.length) sh.getRange(2, 1, data.length, head.length).setValues(data);
  sh.getRange(2, 7, Math.max(1, data.length), 4).setNumberFormat('#,##0.00');
  sh.setFrozenRows(1);
}

function getJson_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' ' + url);
  return JSON.parse(res.getContentText('UTF-8'));
}

function folder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function folderName_(r) {
  var who = (r.buyer_name || r.buyer || '').replace(/\s+/g, ' ').slice(0, 80);
  return (who + ' — № ' + (r.number || '—') + (r.signed ? ' від ' + r.signed : '')).replace(/[\\/]/g, '-');
}

function fileName_(d) {
  var day = (d.date || '').slice(0, 10);
  return ((day ? day + ' ' : '') + (d.title || 'document')).replace(/[\\/]/g, '-');
}
