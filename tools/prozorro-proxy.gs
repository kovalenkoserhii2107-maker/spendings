/**
 * Монітор розрахунків — пошук у Prozorro для сайту.
 *
 * Prozorro sends no CORS headers, so the site cannot ask it from the browser. This web
 * app (executed as its owner, open to anyone) forwards a few read-only requests:
 *
 *   ?action=search&kind=tenders|contracts&buyer=EDRPOU|supplier=EDRPOU|text=...&page=N
 *   ?action=tender&tid=UA-2026-10-15-007639-a     a procedure with its contracts, compacted
 *
 * Nothing else is fetched: no arbitrary URLs, no writes. Code: pages/tools/prozorro-proxy.gs.
 */
var SITE = 'https://prozorro.gov.ua/api';
var API = 'https://public-api.prozorro.gov.ua/api/2.5';
var TID = /^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.action === 'search') out = search_(p);
    else if (p.action === 'tender') out = tender_(String(p.tid || ''));
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
