/**
 * Монітор розрахунків — пошук у Prozorro для сайту.
 *
 * Prozorro sends no CORS headers, so the site cannot ask it from the browser. This web
 * app (executed as its owner, open to anyone) forwards a few read-only requests:
 *
 *   ?action=search&kind=tenders|contracts&buyer=EDRPOU|supplier=EDRPOU|text=...  (filters below)
 *   ?action=tender&tid=UA-2026-10-15-007639-a     a procedure with its contracts, compacted
 *   ?action=nudge                                   "something was just put on control": start
 *                                                   the site's sync now instead of waiting
 *   ?action=status                                  is the token there and accepted by GitHub;
 *                                                   installs the 10-minute check if it is missing
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
    else if (p.action === 'status') out = status_();
    else out = { error: 'unknown action' };
  } catch (err) {
    out = { error: String(err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Search sorts and filters, as prozorro.gov.ua names them.
var SORTS = { date_desc: ['dateCreated', 'desc'], date_asc: ['dateCreated', 'asc'], value_desc: ['value.amount', 'desc'], value_asc: ['value.amount', 'asc'] };
var DAY = /^\d{4}-\d{2}-\d{2}$/;
var WANT = 20;        // rows per answer when a period is set
var SCAN_PAGES = 10;  // pages read per answer at most when filtering by period

// ?action=search: one answer of results. Filters: buyer|supplier (EDRPOU), text (words, CPV
// code), status, proc_type (comma lists), vmin/vmax (expected value), eib=1 (EIB-funded),
// sort (date_desc|date_asc|value_desc|value_asc), from/to (YYYY-MM-DD, by the date in the
// procurement id), cursor (from the previous answer's `next`). The search shows at most 1000
// results (50 pages); a period older than the newest 1000 is looked up from the oldest end.
function search_(p) {
  var kind = p.kind === 'contracts' ? 'contracts' : 'tenders';
  var body = [], subject = false;
  ['buyer', 'supplier'].forEach(function (k) {
    var v = String(p[k] || '');
    if (/^\d{8,10}$/.test(v)) { body.push(k + '[]=' + v); subject = true; }
  });
  if (p.text) { body.push('text=' + encodeURIComponent(String(p.text).slice(0, 200))); subject = true; }
  if (p.eib === '1') { body.push('funders[]=33000'); subject = true; }
  if (!subject) return { error: 'empty query' };
  list_(p.status, /^[a-z.]{3,40}$/).forEach(function (v) { body.push('status[]=' + v); });
  list_(p.proc_type, /^[A-Za-z.]{3,40}$/).forEach(function (v) { body.push('proc_type[]=' + v); });
  if (num_(p.vmin) != null) body.push('value[amount][start]=' + num_(p.vmin));
  if (num_(p.vmax) != null) body.push('value[amount][end]=' + num_(p.vmax));
  var sortKey = SORTS[p.sort] ? p.sort : 'date_desc';
  var sort = SORTS[sortKey].slice();
  if (kind === 'contracts' && sort[0] === 'dateCreated') sort[0] = 'dateSigned';
  var from = DAY.test(p.from || '') ? p.from : '', to = DAY.test(p.to || '') ? p.to : '';
  var cursor = Math.max(1, Math.min(50, parseInt(p.cursor || p.page || '1', 10) || 1));
  var cache = {};
  function get(n, order) {
    var key = order + n;
    if (!cache[key]) cache[key] = page_(kind, body.concat(['sort_by=' + sort[0], 'order=' + order]), n);
    return cache[key];
  }
  var first = get(1, sort[1]);
  var lastPage = Math.max(1, Math.min(50, Math.ceil(first.total / 20)));
  var capped = first.total >= 1000;
  if (!from && !to) {
    var pg = get(cursor, sort[1]);
    return { total: first.total, capped: capped, items: pg.items, next: cursor < lastPage ? cursor + 1 : null };
  }
  var inRange = function (r) { return (!from || r.date >= from) && (!to || r.date <= to); };
  var out = [], n = cursor, done = false, order = sort[1];
  if (sort[0] !== 'value.amount') {
    // By date: jump to the first page that reaches the period, read on until it is passed.
    var desc = order === 'desc';
    var reaches = function (pg) { var x = pg.items[pg.items.length - 1]; return !x || (desc ? (!to || x.date <= to) : (!from || x.date >= from)); };
    if (!p.cursor) {
      if (!reaches(get(lastPage, order))) {
        if (!capped) return { total: 0, items: [], next: null };
        // The period is older (or newer) than the 1000 shown: look from the other end.
        order = desc ? 'asc' : 'desc';
        desc = !desc;
        if (!reaches(get(lastPage, order))) return { total: 0, items: [], next: null, gap: true };
      }
      var lo = 1, hi = lastPage;
      while (lo < hi) { var mid = Math.floor((lo + hi) / 2); if (reaches(get(mid, order))) hi = mid; else lo = mid + 1; }
      n = lo;
    } else if (p.order === 'asc' || p.order === 'desc') {
      order = p.order;
      desc = order === 'desc';
    }
    for (; n <= lastPage && out.length < WANT; n++) {
      var items = get(n, order).items;
      for (var i = 0; i < items.length; i++) {
        var d = items[i].date;
        if (desc ? (from && d < from) : (to && d > to)) { done = true; break; }
        if (inRange(items[i])) out.push(items[i]);
      }
      if (done) break;
    }
  } else {
    // By value: read on, keeping the rows of the period.
    for (var k = 0; n <= lastPage && k < SCAN_PAGES && out.length < WANT; n++, k++) {
      get(n, order).items.forEach(function (r) { if (inRange(r)) out.push(r); });
    }
  }
  var more = !done && n <= lastPage;
  return { total: null, capped: capped && !done && n > lastPage, items: out, next: more ? n : null, order: order };
}

function list_(v, re) {
  return String(v || '').split(',').filter(function (x) { return re.test(x); }).slice(0, 10);
}

function num_(v) {
  var x = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(x) && x >= 0 ? x : null;
}

function page_(kind, body, n) {
  var res = UrlFetchApp.fetch(SITE + '/search/' + kind + '?page=' + n,
    { method: 'post', payload: body.join('&'), contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Prozorro ' + res.getResponseCode());
  var d = JSON.parse(res.getContentText());
  var items = (d.data || []).map(function (r) {
    var pe = r.procuringEntity || r.buyer || {};
    var sup = (r.suppliers || [])[0] || {};
    var tid = r.tenderID || String(r.contractID || '').replace(/-[a-z]\d+$/, '');
    return {
      tid: tid,
      cid: r.contractID || '',
      date: tid.slice(3, 13),
      title: r.title || '',
      status: r.status || '',
      value: r.value ? { amount: r.value.amount, currency: r.value.currency } : null,
      buyer_name: (pe.identifier && pe.identifier.legalName) || pe.name || '',
      buyer: (pe.identifier && pe.identifier.id) || '',
      supplier_name: (sup.identifier && sup.identifier.legalName) || sup.name || '',
      supplier: (sup.identifier && sup.identifier.id) || '',
    };
  });
  return { total: d.total || 0, items: items };
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
    var changes = (x.changes || []).filter(function (ch) { return ch.status === 'active'; });
    return {
      id: x.id, cid: x.contractID, number: x.contractNumber || '', title: x.title || '', status: x.status,
      signed: day_(x.dateSigned), start: day_((x.period || {}).startDate), end: day_((x.period || {}).endDate),
      value: x.value ? { amount: x.value.amount, currency: x.value.currency } : null,
      suppliers: (x.suppliers || []).map(org_),
      changes: changes.length, last_change: changes.length ? day_(changes[changes.length - 1].dateSigned || changes[changes.length - 1].date) : null,
      change_types: changes.reduce(function (acc, ch) { (ch.rationaleTypes || []).forEach(function (r) { if (acc.indexOf(r) < 0) acc.push(r); }); return acc; }, []),
    };
  });
  var buyer = org_(t.procuringEntity);
  // Complaints to the Antimonopoly Committee: of the procedure and of its awards.
  var complaints = (t.complaints || []).concat((t.awards || []).reduce(function (acc, a) { return acc.concat(a.complaints || []); }, []))
    .filter(function (c) { return c.type === 'complaint'; });
  var open = ['draft', 'pending', 'accepted'];
  var cls = (((t.items || [])[0] || {}).classification) || {};
  var dream = DREAM.exec([t.title || '', t.description || ''].join(' '));
  return {
    tender: {
      id: t.id, tid: t.tenderID, title: t.title || '', status: t.status, method: t.procurementMethodType || '',
      // The day from the procedure id (UA-2026-05-06-...) when the record has no dateCreated.
      date: day_(t.dateCreated) || (/^UA-\d{4}-\d{2}-\d{2}/.test(t.tenderID || '') ? t.tenderID.slice(3, 13) : ''),
      value: t.value ? { amount: t.value.amount, currency: t.value.currency } : null,
      deadline: day_((t.tenderPeriod || {}).endDate), cpv: cls.id ? cls.id + ' ' + (cls.description || '') : '',
      // works / services / goods: the procurement's own word on what it buys.
      category: t.mainProcurementCategory || '',
      buyer: buyer.code, buyer_name: buyer.name,
      funders: (t.funders || []).map(function (f) { return { code: (f.identifier || {}).id || '', name: f.name || '' }; }),
      bids: t.numberOfBids != null ? t.numberOfBids : (t.bids || []).length || null,
      disqualified: (t.awards || []).filter(function (a) { return a.status === 'unsuccessful'; }).length,
      complaints: { n: complaints.length, open: complaints.filter(function (c) { return open.indexOf(c.status) >= 0; }).length,
                    satisfied: complaints.filter(function (c) { return c.status === 'satisfied' || c.status === 'resolved'; }).length },
      sasu: sasu_(t.id),
      dream_id: dream ? 'DREAM-UA-' + dream[1] + '-' + dream[2].toUpperCase() : '',
      contracts: contracts,
    },
  };
}

var DREAM = /DREAM\s*[-‐‑–]\s*UA\s*[-‐‑–]\s*(\d{6})\s*[-‐‑–]\s*([0-9A-Za-z]{8})/;
var AUDIT = 'https://audit-api.prozorro.gov.ua/api/2.5';

// State Audit Service monitorings of a procedure: how many, any violation found, any going on.
function sasu_(id) {
  try {
    var list = JSON.parse(UrlFetchApp.fetch(AUDIT + '/tenders/' + id + '/monitorings', { muteHttpExceptions: true }).getContentText() || '{}').data || [];
    if (!list.length) return { n: 0 };
    var full = UrlFetchApp.fetchAll(list.map(function (m) { return { url: AUDIT + '/monitorings/' + m.id, muteHttpExceptions: true }; }));
    var out = { n: list.length, violation: false, active: false, ids: [] };
    full.forEach(function (res) {
      try {
        var m = JSON.parse(res.getContentText()).data || {};
        out.ids.push(m.monitoring_id || m.id);
        if ((m.conclusion || {}).violationOccurred) out.violation = true;
        if (m.status === 'active' || m.status === 'draft') out.active = true;
      } catch (e) { /* skip one */ }
    });
    return out;
  } catch (e) {
    return null;
  }
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

// Whether starting the sync can work: the token is set and GitHub accepts it for the
// workflow; the 10-minute check is installed (once) if it is not yet.
function status_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkNew'; });
  if (!hasTrigger) {
    setupTrigger();
    hasTrigger = true;
  }
  var github = null;
  if (token) {
    github = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/sync.yml', {
      muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    }).getResponseCode();
  }
  var last = Number(props.getProperty('lastStart') || 0);
  return { token: !!token, github: github, trigger: hasTrigger, lastStart: last ? new Date(last).toISOString() : null };
}
