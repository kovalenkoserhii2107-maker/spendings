/**
 * Монітор розрахунків — пошук у Prozorro для сайту.
 *
 * Prozorro sends no CORS headers, so the site cannot ask it from the browser. This web
 * app (executed as its owner, open to anyone) forwards a few read-only requests:
 *
 *   ?action=search&kind=tenders|contracts&buyer=EDRPOU|supplier=EDRPOU|text=...&page=N
 *   ?action=tender&tid=UA-2026-10-15-007639-a     a procedure with its contracts, compacted
 *   ?action=nudge                                   "something was just put on control": start
 *                                                   the site's sync now instead of waiting
 *
 * GitHub runs scheduled workflows unreliably, so this script also checks every 10 minutes
 * (checkNew, a time trigger set up once with setupTrigger) whether users picked contracts or
 * organisations the site has not read yet, and starts the sync workflow for them. That needs
 * a GitHub token with "Actions: read and write" on the repository, kept in the Script
 * Properties as GITHUB_TOKEN; without it the script only searches.
 *
 * Nothing else is fetched: no arbitrary URLs, no writes besides starting that workflow.
 * Code: pages/tools/prozorro-proxy.gs.
 */
var REPO = 'kovalenkoserhii2107-maker/spendings';
var SITE_DATA = 'https://kovalenkoserhii2107-maker.github.io/spendings/data/';
var PUB = 'https://firestore.googleapis.com/v1/projects/spending-monitor-2122b/databases/(default)/documents/pub?pageSize=300';
var MIN_GAP_MS = 3 * 60 * 1000;   // no more than one start every 3 minutes
var SENT_TTL_MS = 40 * 60 * 1000; // a pick already sent waits this long for its run
var SITE = 'https://prozorro.gov.ua/api';
var API = 'https://public-api.prozorro.gov.ua/api/2.5';
var TID = /^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.action === 'search') out = search_(p);
    else if (p.action === 'tender') out = tender_(String(p.tid || ''));
    else if (p.action === 'nudge') out = checkNew_();
    else out = { error: 'unknown action' };
  } catch (err) {
    out = { error: String(err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function search_(p) {
  var kind = p.kind === 'contracts' ? 'contracts' : 'tenders';
  var page = Math.max(1, Math.min(50, parseInt(p.page || '1', 10) || 1));
  var body = [];
  ['buyer', 'supplier'].forEach(function (k) {
    var v = String(p[k] || '');
    if (/^\d{8,10}$/.test(v)) body.push(k + '[]=' + v);
  });
  if (p.text) body.push('text=' + encodeURIComponent(String(p.text).slice(0, 200)));
  if (!body.length) return { error: 'empty query' };
  var res = UrlFetchApp.fetch(SITE + '/search/' + kind + '?page=' + page,
    { method: 'post', payload: body.join('&'), contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: 'Prozorro ' + res.getResponseCode() };
  var d = JSON.parse(res.getContentText());
  var items = (d.data || []).map(function (r) {
    var pe = r.procuringEntity || r.buyer || {};
    var sup = (r.suppliers || [])[0] || {};
    return {
      tid: r.tenderID || String(r.contractID || '').replace(/-[a-z]\d+$/, ''),
      cid: r.contractID || '',
      title: r.title || '',
      status: r.status || '',
      value: r.value ? { amount: r.value.amount, currency: r.value.currency } : null,
      buyer_name: (pe.identifier && pe.identifier.legalName) || pe.name || '',
      supplier_name: (sup.identifier && sup.identifier.legalName) || sup.name || '',
    };
  });
  return { total: d.total || items.length, page: page, items: items };
}

function org_(o) {
  o = o || {};
  var id = o.identifier || {};
  return { name: id.legalName || o.name || '', code: id.id || '' };
}

function day_(v) {
  return v ? String(v).slice(0, 10) : null;
}

function tender_(tid) {
  if (!TID.test(tid)) return { error: 'bad tender id' };
  var sum = UrlFetchApp.fetch(SITE + '/tenders/' + tid + '/summary', { muteHttpExceptions: true });
  if (sum.getResponseCode() !== 200) return { error: 'Prozorro ' + sum.getResponseCode() };
  var id = JSON.parse(sum.getContentText()).id;
  var t = JSON.parse(UrlFetchApp.fetch(API + '/tenders/' + id).getContentText()).data;
  var refs = (t.contracts || []).filter(function (c) { return c.status !== 'cancelled' || c.dateSigned; });
  var full = UrlFetchApp.fetchAll(refs.map(function (c) { return { url: API + '/contracts/' + c.id, muteHttpExceptions: true }; }));
  var contracts = refs.map(function (c, i) {
    var x = c;
    try { if (full[i].getResponseCode() === 200) x = JSON.parse(full[i].getContentText()).data; } catch (e) { /* keep the short copy */ }
    return {
      id: x.id, cid: x.contractID, number: x.contractNumber || '', title: x.title || '', status: x.status,
      signed: day_(x.dateSigned), start: day_((x.period || {}).startDate), end: day_((x.period || {}).endDate),
      value: x.value ? { amount: x.value.amount, currency: x.value.currency } : null,
      suppliers: (x.suppliers || []).map(org_),
    };
  });
  var buyer = org_(t.procuringEntity);
  return {
    tender: {
      id: t.id, tid: t.tenderID, title: t.title || '', status: t.status, method: t.procurementMethodType || '',
      date: day_(t.dateCreated), value: t.value ? { amount: t.value.amount, currency: t.value.currency } : null,
      buyer: buyer.code, buyer_name: buyer.name,
      funders: (t.funders || []).map(function (f) { return { code: (f.identifier || {}).id || '', name: f.name || '' }; }),
      contracts: contracts,
    },
  };
}

// ---- starting the site's sync -----------------------------------------------------------------

function checkNew() {
  checkNew_();
}

// Run once from the editor: a check every 10 minutes.
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkNew') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkNew').timeBased().everyMinutes(10).create();
}

function checkNew_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  if (!token) return { started: false, reason: 'no token' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { started: false, reason: 'busy' };
  try {
    if (Date.now() - Number(props.getProperty('lastStart') || 0) < MIN_GAP_MS) return { started: false, reason: 'just started' };
    var pub = pubLists_();
    var tracked = getJson_(SITE_DATA + 'tracked/index.json?v=' + Date.now());
    var index = getJson_(SITE_DATA + 'index.json?v=' + Date.now());
    var haveKeys = (tracked.items || []).map(function (r) { return r.key; });
    var haveOrgs = (index.orgs || []).map(function (o) { return o.edrpou; });
    var sent = JSON.parse(props.getProperty('sent') || '{}');
    var now = Date.now();
    Object.keys(sent).forEach(function (k) { if (now - sent[k] > SENT_TTL_MS) delete sent[k]; });
    var newKeys = pub.keys.filter(function (k) { return haveKeys.indexOf(k) < 0 && !sent[k]; });
    var newOrgs = pub.orgs.filter(function (k) { return haveOrgs.indexOf(k) < 0 && !sent['org:' + k]; });
    if (!newKeys.length && !newOrgs.length) return { started: false, reason: 'nothing new' };
    var mode = newOrgs.length ? 'full' : 'tracked';
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/sync.yml/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ ref: 'main', inputs: { mode: mode } }),
    });
    if (res.getResponseCode() !== 204) return { started: false, reason: 'GitHub ' + res.getResponseCode() };
    newKeys.forEach(function (k) { sent[k] = now; });
    newOrgs.forEach(function (k) { sent['org:' + k] = now; });
    props.setProperties({ sent: JSON.stringify(sent), lastStart: String(now) });
    return { started: true, mode: mode, contracts: newKeys.length, orgs: newOrgs.length };
  } finally {
    lock.releaseLock();
  }
}

function getJson_(url) {
  return JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText() || '{}');
}

// What users follow, from the anonymous public lists (codes and contract ids only).
function pubLists_() {
  var keys = {}, orgs = {}, url = PUB;
  while (url) {
    var page = getJson_(url);
    (page.documents || []).forEach(function (d) {
      var f = d.fields || {};
      ((f.tracked || {}).arrayValue || {}).values && f.tracked.arrayValue.values.forEach(function (v) {
        var cid = (((v.mapValue || {}).fields || {}).cid || {}).stringValue;
        if (cid) keys[cid] = 1;
      });
      ((f.orgs || {}).arrayValue || {}).values && f.orgs.arrayValue.values.forEach(function (v) {
        var code = (((v.mapValue || {}).fields || {}).edrpou || {}).stringValue;
        if (code) orgs[code] = 1;
      });
    });
    url = page.nextPageToken ? PUB + '&pageToken=' + page.nextPageToken : null;
  }
  return { keys: Object.keys(keys), orgs: Object.keys(orgs) };
}
