// Registry access, reading the team table, Prozorro per sub-project, keeping "my" sub-projects up to date.
// ---- access ----------------------------------------------------------------------------------

async function registryInit() {
  if (!cloud || !state.user) { REG.access = null; return; }
  REG.access = await cloud.registryAccess();
  // Whose sub-projects are "mine": the name chosen in Settings, else the access list's, else the default.
  REG.profile = REG.access ? await cloud.myProfile() : null;
  if (REG.access && cloud.setPubExtra) cloud.setPubExtra(pubExtraFor);
  // The team shares one base: its lists open up to everyone on it.
  if (REG.access && typeof applyScope === 'function') applyScope();
  loadSubvention().then(() => { if (/^#\/(sp|portfolio|$)|^$/.test(location.hash)) softRender(); });
  // The registry also names the sub-projects of the tracked list: that page redraws too.
  // The team's journal of every sub-project: tasks for the bell, visits for the portfolio, the export.
  if (REG.access && cloud.watchAllEntries) cloud.watchAllEntries((by) => { if (by) { REG.entries = by; if (/^#\/(sp|portfolio|reminders|$)|^$/.test(location.hash)) softRender(); } });
  if (REG.access) cloud.watchRegistry((r) => { r.rows.forEach(applyOverrides); REG.rows = r.rows; REG.meta = r.meta; autoTrackSoon(); if (cloud.republish) cloud.republish(); if (/^#\/(sp|portfolio|signals|reminders|$)|^$/.test(location.hash)) softRender(); });
  softRender();
}
const hasRegistry = () => !!REG.access;
// The passport edited in the app (registry/{code}.overrides) stands over the table's values: a new
// upload of the table changes r.t, never the edits. r.tTable keeps what the table says.
function applyOverrides(r) {
  if (!r || r._ovFor === r.t) return;
  const table = r.t || {};
  Object.defineProperty(r, 'tTable', { value: table, configurable: true, writable: true });
  r.t = r.overrides && Object.keys(r.overrides).length ? Object.assign({}, table, r.overrides) : table;
  Object.defineProperty(r, '_ovFor', { value: r.t, configurable: true, writable: true });
}

// ---- reading the xlsx ------------------------------------------------------------------------

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('xlsx'));
    document.head.append(s);
  });
}

const LATIN = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X' };
// "OD05В_01" (Cyrillic В) and "OD05B_01" are the same sub-project.
// "KV05A_06_A" is the "-A" line of KV05A_06 written with an underscore.
const normCode = (s) => String(s || '').trim().toUpperCase().replace(/[АВСЕНІКМОРТХ]/g, (c) => LATIN[c]).replace(/^([A-Z]{2}\d{2}[A-Z]?_\d{2})_([A-Z])$/, '$1-$2');
const codesOf = (s) => String(s || '').split(/[\s,;]+/).map(normCode).filter((x) => /^[A-Z]{2}\d{2}[A-Z]?_\d{2}/.test(x));
const PZ_ID = /UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]/g;
// A DREAM project ID wherever it is written: alone, in a link with or without "https://", with "/profile".
const dreamId = (s) => ((String(s || '').match(/DREAM-UA-\d{6}-[0-9A-Z]{8}/i) || [])[0] || '').toUpperCase().replace(/^DREAM-UA/, 'DREAM-UA');
// The sub-project's DREAM project: the table's, else one a linked procurement names.
const spDream = (r) => dreamId((r.t || {}).dream) || (((r.pz || {}).tenders || []).find((x) => x.dream_id) || {}).dream_id || '';

function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    // Excel keeps days; the Date may sit a few minutes or hours off midnight (time zones, old offsets).
    const d = new Date(v.getTime() + 12 * 3600e3);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || /^#(REF|N\/A|VALUE|DIV\/0|NAME)!?/.test(s)) return null;
    return s.slice(0, 2000);
  }
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  return v;
}

// Columns of the SPs sheet, found by their headers (two header rows: Ukrainian and English).
const SP_COLS = [
  ['code', /^(ID|Код)\b/], ['status', /SP status/], ['programme', /PROGRAMME/], ['office', /OFFICE/],
  ['name_en', /Sub-Project Name \(ENG\)/], ['name_uk', /Sub-Project Name \(UKR\)/], ['batch', /Batch/], ['expert', /UNDP TA specialists/],
  ['beneficiary_id', /Final Beneficiary\s*ID|КОД ЄДРПОУ/], ['beneficiary', /Promoter \/ Final Beneficiary/],
  ['rating', /Overall Rating|Загальна оцінка/i],
  ['r1', /^1\. Contract Amendments/], ['r2', /^2\. Cost and Price/], ['r3', /^3\. Funding Gap/], ['r4', /^4\. Payment Delays/],
  ['r5', /^5\. Contractor performance/], ['r6', /^6\. Contractor bankruptcy/], ['r7', /^7\. Conclusions of SASU/], ['r8', /^8\. AMCU decisions/],
  ['invest_eur', /Total Investment Cost/], ['eib_eur', /EIB Financing excl/], ['contract_value', /Construction Contract Value/],
  ['eib_uah', /EIB Co-\s*Financing, UAH/], ['subv_year', /Current-Year Subvention/], ['funding', /Funding Adequacy Status/],
  ['extra_need', /Anticipated Additional Funding/], ['subv_paid', /Total Subvention Paid/], ['subv_paid_year', /Subvention Paid in/],
  ['paid_pct', /Contract Paid %/], ['subv_util', /% of Subvention Util/], ['dream', /DREAM/], ['proc_status', /Status of the procedure/],
  ['pz_link', /Prozorro Link/], ['tenders_n', /## of tenders/], ['amcu', /AMCU Complaints/], ['sasu', /SASU Monitoring/],
  ['contractor_id', /Contractor ID|ЄДРПОУ Підрядника/], ['contractor', /^Підрядник|Contractor$/],
  ['contract_sum', /Сума договору/], ['co_eib', /Співфінансування ЄІБ/], ['co_local', /Співфінансування КБ/],
  ['contract_date', /Дата укладення договору/], ['contract_term', /Строк дії договору/], ['completion', /Contractual date of completion/],
  ['start', /Date of works start/], ['pct', /% of completion/], ['upd', /Update date/], ['comment', /Coments|Коментарі/], ['size', /SIZE of SP/],
];
// The Tenders sheet, one row per procedure.
const TN_COLS = [
  ['sp', /^SP ID/], ['analyst', /^Analyst/], ['name', /Name of the tender/], ['kind', /W\/TS\/IC/], ['status', /Status of the tender/],
  ['method', /Procurement method/], ['pz', /Prozorro ID/], ['est', /Estimated Value/], ['issued', /Tender Issuing Date/], ['opening', /Tender opening Date/],
  ['qr', /^Q&R/], ['amcu_td', /AMCU Complaints concerning the TD/], ['auction', /Auction Date/], ['bidders_n', /## of bidders/], ['bidders', /^Bidders/],
  ['award', /Award decision date/], ['ac', /^AC Assessment/], ['ac_flag', /^AC Flag/], ['price', /^Price Verification$/], ['price_flag', /Price Verification Flag/],
  ['amcu_eval', /AMCU Complaints concerning the evaluation/], ['sasu', /^SASU Monitoring/], ['obs', /observation on procurement/],
  ['contractor', /Contractor Name \(ukr\)/], ['contractor_id', /^Contractor ID/], ['contract_no', /^Contract Number/], ['contract_date', /^Date of the Contract\s*$/],
  ['contract_end', /Date of the Contract end/], ['contract_total', /Total .ontract amount/], ['co_eib', /^EIB Co-Financing, UAH/],
  ['mods', /# of Contract Modifications/], ['mk_td', /^TD Checking/], ['mk_assist', /^Tender Assistance/], ['mk_monitor', /^Tender Monitoring/],
  ['amcu_td_status', /^Complaint Review Status/], ['amcu_eval_status', /^Complaint Review Status/], ['contract_link', /^Link to the Contract/], ['eval_date', /evaluation report issuance date/i], ['eval_report', /^Tender evaluation report$/i],
  ['contractor_en', /Contractor Name \(eng\)/], ['duration', /duration months/i], ['co_local', /^Local and other Co-Financing/], ['mods_link', /^Links to Contract Modifications/],
  ['exec_obs', /observation on contract execution/i], ['paid', /^Total Amount Paid to Date/], ['paid_eib', /Paid to Date \(EIB/], ['paid_local', /Paid to Date \(Local/],
];

function mapHeaders(labels, spec) {
  const out = {};
  for (const [key, rx] of spec) {
    const i = labels.findIndex((l, j) => l && rx.test(l) && !Object.values(out).includes(j));
    if (i >= 0) out[key] = i;
  }
  return out;
}

function parseWorkbook(XLSX, wb) {
  // A cell's hyperlink, if it has one: "тендер" may hide the procurement's whole address.
  const linkAt = (name, i, c) => {
    const ws = wb.Sheets[name];
    if (!ws || c == null || !ws['!ref']) return '';
    const base = XLSX.utils.decode_range(ws['!ref']).s;
    const cell = ws[XLSX.utils.encode_cell({ r: base.r + i, c: base.c + c })];
    return (cell && cell.l && cell.l.Target) || '';
  };
  const rowsOf = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) : null);
  const sps = rowsOf('SPs');
  if (!sps) throw new Error(rt('importBad'));
  const hi = sps.findIndex((r) => r && String(r[2] || '').trim() === 'ID' && /SP status/.test(String(r[3] || '')));
  if (hi < 0) throw new Error(rt('importBad'));
  const width = Math.max(sps[hi].length, (sps[hi - 1] || []).length);
  const labels = [], groups = [];
  for (let i = 0; i < width; i++) {
    const uk = String((sps[hi - 1] || [])[i] || '').replace(/\s+/g, ' ').trim();
    const en = String(sps[hi][i] || '').replace(/\s+/g, ' ').trim();
    labels.push(/^\d\. /.test(uk) ? uk : (en || uk));
    groups.push(uk);
  }
  const col = mapHeaders(labels, SP_COLS);
  // The weekly log: "Week NN (dates)" over EXPERT / Activity / ☑.
  const weeks = [];
  groups.forEach((g, i) => { if (/^Week \d+/.test(g) && /EXPERT/i.test(labels[i])) weeks.push({ label: g, i }); });
  const ca = labels.findIndex((l, i) => l === 'CA' && /NEXT ACTIVITY/.test(groups[i] || ''));
  const out = new Map();
  for (let ri = hi + 1; ri < sps.length; ri++) {
    const r = sps[ri];
    if (!r) continue;
    const codes = codesOf(r[col.code]);
    if (!codes.length) continue;
    const tt = { codes, _row: ri + 1 };
    for (const [key] of SP_COLS) if (col[key] != null && key !== 'code') { const v = cellValue(r[col[key]]); if (v != null && v !== '') tt[key] = v; }
    const pzLink = [tt.pz_link || '', linkAt('SPs', ri, col.pz_link)].join(' ');
    const ids = [...new Set(pzLink.match(PZ_ID) || [])];
    if (ids.length) tt.pz_ids = ids;
    const dream = dreamId([tt.dream || '', linkAt('SPs', ri, col.dream)].join(' '));
    if (dream) tt.dream = dream;
    if (ca >= 0 && (r[ca] || r[ca + 1])) tt.next = { who: cellValue(r[ca]), what: cellValue(r[ca + 1]), date: cellValue(r[ca + 2]) };
    const log = [];
    for (const w of weeks) {
      const who = cellValue(r[w.i]), what = cellValue(r[w.i + 1]);
      if (who || what) log.push({ week: w.label, who, what, done: r[w.i + 2] === true || r[w.i + 2] === 'TRUE' });
    }
    // All the weeks: the portfolio summary counts the visits and checks of the year.
    if (log.length) tt.log = log;
    out.set(codes[0], { code: codes[0], t: tt, tenders: [], paid: null });
  }
  const byCode = (c) => out.get(c) || out.get(c.replace(/-A$/, '')) || [...out.values()].find((x) => x.t.codes.includes(c));
  let tendersN = 0;
  const tn = rowsOf('Tenders');
  if (tn) {
    const th = tn.findIndex((r) => r && String(r[0] || '').trim() === 'SP ID');
    if (th >= 0) {
      const tcol = mapHeaders(tn[th].map((x) => String(x || '').replace(/\s+/g, ' ').trim()), TN_COLS);
      for (let ri = th + 1; ri < tn.length; ri++) {
        const r = tn[ri];
        if (!r) continue;
        const code = codesOf(r[tcol.sp])[0];
        const sp = code && byCode(code);
        if (!sp) continue;
        const row = {};
        for (const [key] of TN_COLS) if (tcol[key] != null && key !== 'sp') { const v = cellValue(r[tcol[key]]); if (v != null && v !== '' && v !== false) row[key] = v; }
        const ids = [String(row.pz || ''), linkAt('Tenders', ri, tcol.pz), linkAt('Tenders', ri, tcol.contract_link), linkAt('Tenders', ri, tcol.contract_no)].join(' ').match(PZ_ID);
        if (ids) row.pz = ids[0];
        sp.tenders.push(row);
        tendersN++;
      }
    }
  }
  // Payments: totals per code (A–C, E–G, "-A" lines add to their sub-project) and, lower down,
  // the 2026 cash payments (E: code, F: amount). Codes the SPs sheet has no row for are reported.
  const pay = rowsOf('Payments');
  const orphans = {};
  if (pay) {
    for (const r of pay) {
      for (const k of [0, 4]) {
        const code = codesOf(r[k])[0];
        if (!code) continue;
        const sp = byCode(code);
        const label = String(r[k + 1] || '');
        if (/проплат/i.test(label) && typeof r[k + 2] === 'number') {
          if (!sp) { orphans[code] = Math.round(((orphans[code] || 0) + r[k + 2]) * 100) / 100; continue; }
          sp.paid = Math.round(((sp.paid || 0) + r[k + 2]) * 100) / 100;
          if (code !== sp.code) sp.paid_parts = Object.assign(sp.paid_parts || {}, { [code]: r[k + 2] });
        } else if (k === 4 && typeof r[5] === 'number' && sp) {
          sp.paid_2026 = Math.round(((sp.paid_2026 || 0) + r[5]) * 100) / 100;
        }
      }
    }
  }
  return { rows: [...out.values()], tenders: tendersN, orphans };
}

// The upload's progress lives in REG, not in the page: Firestore snapshots redraw the page
// while it goes on.
function setStatus(text, bad) {
  REG.status = text ? { text, bad: !!bad } : null;
  const el = document.getElementById('reg-status');
  if (el) fill(el, text ? h('span', { class: bad ? 'bad' : '' }, text) : '');
}
// The fields of the table a change of which is worth showing before an upload.
const DIFF_FIELDS = ['status', 'pct', 'upd', 'completion', 'contractor', 'contract_sum', 'contract_value', 'funding', 'subv_year', 'expert', 'comment', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
const diffVal = (v) => (v == null || v === '' ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? JSON.stringify(v) : String(v).trim());
// What an upload of the table would change, before anything is written: one's own new sub-projects,
// one's own that change (field by field; the app's ratings and edits stay as they are), the rest of
// the mission in numbers.
function importDiff(rows) {
  const me = myManager(), seen = new Set();
  const out = { mineNew: [], mineChanged: [], othersNew: 0, othersChanged: 0, same: 0, gone: [] };
  for (const row of rows) {
    const id = cloud && cloud.regId ? cloud.regId(row.code) : row.code;
    seen.add(id);
    const old = REG.rows.get(id) || [...REG.rows.values()].find((x) => x.code === row.code);
    const expert = (row.t || {}).expert || '';
    const mine = expert === me || (old && isMine(old));
    if (!old) { if (mine) out.mineNew.push(row); else out.othersNew++; continue; }
    const before = old.tTable || old.t || {}, after = row.t || {};
    const changes = DIFF_FIELDS.filter((k) => diffVal(before[k]) !== diffVal(after[k])).map((k) => ({ k, from: before[k], to: after[k],
      // A rating set in the app stands over the table's: the table's new value is shown, not taken.
      kept: /^r\d$/.test(k) && (old.scores || {})[k] != null,
      over: (old.overrides || {})[k] != null }));
    const cleared = Object.keys(before).filter((k) => diffVal(before[k]) !== '' && diffVal(after[k]) === '' && !DIFF_FIELDS.includes(k)).length;
    if (!changes.length && !cleared) { out.same++; continue; }
    if (mine) out.mineChanged.push({ r: old, row, changes, cleared });
    else out.othersChanged++;
  }
  out.gone = [...REG.rows.values()].filter((x) => !seen.has(cloud && cloud.regId ? cloud.regId(x.code) : x.code) && !(x.t || {}).manual).map((x) => x.code);
  return out;
}
async function importFile(file) {
  if (REG.busy) return;
  let XLSX, buf, parsed;
  try {
    setStatus(rt('importing'));
    XLSX = await loadXlsx();
    buf = await file.arrayBuffer();
    parsed = parseWorkbook(XLSX, XLSX.read(buf, { type: 'array', cellDates: true }));
  } catch (e) {
    setStatus((e && e.message) || String(e), true);
    toast((e && e.message) || String(e), { bad: true, sticky: true });
    return;
  }
  setStatus('');
  const { rows, tenders, orphans } = parsed;
  const d = importDiff(rows);
  const fmtV = (k, v) => (v == null || v === '' ? '—' : k === 'pct' ? (pctOf(v) != null ? pctOf(v) + '%' : String(v)) : /sum|value|subv/.test(k) && toNum(v) != null ? money(toNum(v)) : v instanceof Date ? fdate(v.toISOString().slice(0, 10)) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fdate(String(v).slice(0, 10)) : String(v).slice(0, 160));
  const go = h('button', { class: 'btn btn-dark', onclick: async () => {
    go.disabled = true;
    closeSheet();
    REG.busy = 'import';
    try {
      // The file itself stays on this device: the export fills it in, cell by cell.
      idbPut('template', { name: file.name, at: new Date().toISOString(), bytes: buf });
      const res = await cloud.importRegistry(rows, { file: file.name.slice(0, 200), rows: rows.length, tenders, orphans,
        diff: { mineNew: d.mineNew.length, mineChanged: d.mineChanged.length, othersNew: d.othersNew, othersChanged: d.othersChanged, same: d.same } },
      (n, total) => setStatus(rt('saving', { n, total })));
      const failed = (res && res.failed) || [];
      // What changed in one's own sub-projects goes into their journals and signals.
      for (const x of d.mineChanged) {
        const text = x.changes.filter((c) => !/^r\d$/.test(c.k)).slice(0, 6).map((c) => rt('dfLine', { f: (/^r\d$/.test(c.k) ? rt(c.k) : rt('df_' + c.k)), from: fmtV(c.k, c.from), to: fmtV(c.k, c.to) })).join('; ');
        if (text) cloud.addEntry(x.r.code, { kind: 'CHANGE', text: rt('dfEntry', { text }).slice(0, 4000), target: 'sp', day: today(), who: rt('tlSystem'), done: true }).catch(() => {});
      }
      const msg = rt('importDone', { n: rows.length - failed.length, t: tenders }) + (failed.length ? ' · ' + rt('importFailed', { list: failed.slice(0, 10).join(', ') }) : '');
      setStatus(msg, failed.length > 0);
      toast(msg, failed.length ? { bad: true, sticky: true } : { long: true });
      if (d.mineNew.length) setTimeout(() => autoTrack(true).catch(() => {}), 3000);
    } catch (e) {
      console.error('registry import', e);
      const msg = (e && e.code === 'permission-denied') ? rt('denied') : (e && e.message) || String(e);
      setStatus(msg, true);
      toast(msg, { bad: true, sticky: true });
    } finally {
      REG.busy = null;
    }
  } }, icon('check'), rt('dfSave'));
  sheet(h('h2', { class: 'card-title' }, rt('dfTitle', { file: file.name })),
    h('p', { class: 'muted small' }, rt('dfLead')),
    h('div', { class: 'proc-sums' },
      h('div', { class: 'proc-sum ' + (d.mineNew.length ? 'run' : 'na') }, h('small', null, rt('dfMineNew')), h('b', null, String(d.mineNew.length))),
      h('div', { class: 'proc-sum ' + (d.mineChanged.length ? 'warn' : 'na') }, h('small', null, rt('dfMineChanged')), h('b', null, String(d.mineChanged.length))),
      h('div', { class: 'proc-sum na' }, h('small', null, rt('dfOthers')), h('b', null, rt('dfOthersV', { c: d.othersChanged, n: d.othersNew }))),
      h('div', { class: 'proc-sum ok' }, h('small', null, rt('dfSame')), h('b', null, String(d.same)))),
    d.mineNew.length ? h('div', { class: 'section' }, h('h3', { class: 'card-sub' }, rt('dfMineNewTitle', { n: d.mineNew.length })),
      h('div', { class: 'chips' }, d.mineNew.map((x) => h('span', { class: 'tag ok' }, x.code)))) : null,
    d.mineChanged.length ? h('div', { class: 'section' }, h('h3', { class: 'card-sub' }, rt('dfMineChangedTitle')),
      d.mineChanged.map((x) => h('details', { class: 'howto small df-sp' }, h('summary', null, h('b', null, x.r.code), ' · ', rt('dfN', { n: x.changes.length + x.cleared })),
        h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' }, h('tbody', null, x.changes.map((c) => h('tr', null, td('', null, (/^r\d$/.test(c.k) ? rt(c.k) : rt('df_' + c.k))), td('', { class: 'faint' }, fmtV(c.k, c.from)), td('', null, '→ ', h('b', null, fmtV(c.k, c.to))),
          td('', { class: 'small faint' }, c.kept ? rt('dfKept') : c.over ? rt('dfOver') : '')))))),
        x.cleared ? h('p', { class: 'faint' }, rt('dfCleared', { n: x.cleared })) : null))) : null,
    d.gone.length ? h('p', { class: 'small warn-text section' }, rt('dfGone', { n: d.gone.length, list: d.gone.slice(0, 12).join(', ') })) : null,
    h('p', { class: 'faint small section' }, rt('dfKeepsApp')),
    h('div', { class: 'row', style: 'margin-top:12px' }, go, h('button', { class: 'btn', onclick: closeSheet }, rt('cancel'))));
}

// ---- Prozorro --------------------------------------------------------------------------------

// Procurement ids of a sub-project: the ones the team linked, and those named in the table.
function spTids(r) {
  const ids = new Set((r.link && r.link.tids) || []);
  ((r.t || {}).pz_ids || []).forEach((x) => ids.add(x));
  (r.tenders || []).forEach((x) => x.pz && ids.add(x.pz));
  ((r.link && r.link.off) || []).forEach((x) => ids.delete(x));
  return [...ids];
}

// A sub-project with no Prozorro id in the table is looked up by its Ukrainian name. Its works
// procurement is linked by itself when the title starts like the name and holds nearly all its
// words; the rest (supervision, design, look-alikes) waits in pz.cand for the expert to confirm.
const nameWords = (s) => String(s || '').toLowerCase().replace(/[’'`ʼ]/g, '').replace(/[^0-9a-zа-яіїєґ]+/g, ' ').trim().split(' ').filter((w) => w.length > 2 || /^\d+$/.test(w));
const isNum = (w) => /^\d+$/.test(w);
function nameMatch(spName, title) {
  const all = nameWords(objectName(spName, 60)), tall = nameWords(objectName(title, 60));
  const a = all.filter((w) => !isNum(w)).slice(0, 14), tw = tall.filter((w) => !isNum(w)), b = new Set(tw);
  let score = a.length ? a.filter((w) => b.has(w)).length / a.length : 0;
  let head = a.length >= 4 && a.slice(0, 4).join(' ') === tw.slice(0, 4).join(' ');
  // School, lyceum, station and house numbers must agree: lyceum No. 1 is not lyceum No. 2. Only when
  // the other title gives small numbers of its own (a shorter title may just stop earlier).
  const na = all.filter(isNum), nb = new Set(tall.filter(isNum));
  if (na.some((x) => !nb.has(x)) && [...nb].some((x) => x.length <= 3 && !na.includes(x))) { score *= 0.4; head = false; }
  return { score, head };
}
async function findByName(r) {
  const name = spNameUk(r);
  const words = objectName(name || '').split(/\s+/);
  if (words.join(' ').length < 12) return null;
  // The long query first; if it finds nothing that starts like the name, a shorter one.
  const seen = new Map();
  for (const n of [12, 7]) {
    const d = await pzProxy({ action: 'search', kind: 'tenders', text: words.slice(0, n).join(' ') });
    (d.items || []).forEach((x) => seen.set(x.tid, x));
    if ([...seen.values()].some((x) => nameMatch(name, x.title).head) || words.length <= 7) break;
  }
  const cand = [...seen.values()].map((x) => {
    const m = nameMatch(name, x.title);
    // A title that starts with the object's name is the works procurement itself; services name
    // it later ("Технічний нагляд за об'єктом «…»").
    return { tid: x.tid, title: (x.title || '').slice(0, 300), status: x.status, value: x.value, buyer_name: x.buyer_name || '', role: m.head ? 'works' : relRole(x.title), score: Math.round(m.score * 100) / 100, head: m.head };
  }).filter((x) => x.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 15);
  const auto = cand.filter((x) => x.role === 'works' && x.head && x.score >= 0.8 && x.status !== 'cancelled').map((x) => x.tid);
  return { cand, auto };
}

async function refreshSp(r) {
  let tids = spTids(r), cand = null, link = null;
  // The other procurements for the object are looked for every time (design, supervision, a new
  // works tender); only a sub-project with nothing linked gets the works tender linked by itself.
  if (spNameUk(r)) {
    const found = await findByName(r);
    if (found) {
      const off = (r.link || {}).off || [];
      cand = found.cand.filter((x) => !off.includes(x.tid));
      if (!tids.length && !off.length && found.auto.length) { tids = found.auto; link = { tids: found.auto, off: [], auto: found.auto }; }
    }
  }
  const tenders = [];
  for (const tid of tids) {
    try { tenders.push((await pzProxy({ action: 'tender', tid })).tender); } catch (e) { tenders.push({ tid, error: e.message.slice(0, 200) }); }
  }
  tenders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pz = { at: new Date().toISOString(), tenders };
  if (cand) pz.cand = cand.filter((x) => !tids.includes(x.tid));
  const patch = { pz, risk: riskHints(Object.assign({}, r, { pz })) };
  if (link) patch.link = link;
  await cloud.updateRegistry(r.code, patch);
  // What changed since the last reading goes into the journal now, not only after the next sync.
  if (typeof logPzChanges === 'function') logPzChanges(r, r.pz, pz).catch(() => {});
  return pz;
}

// What of a sub-project goes on control: its signed contracts in force, and procurements
// still under way that have none yet (they turn into their contract when it is signed).
// The works contracts stay on control once finished too: risk 4 (the EIB's payments) is rated for
// finished sub-projects as well.
function trackPicks(pz, r) {
  const picks = [];
  for (const t0 of (pz && pz.tenders) || []) {
    if (t0.error || !/^\d{8,10}$/.test(t0.buyer || '')) continue;
    const works = r ? procRole(r, t0) === 'works' : isWorksTender(t0);
    const active = (t0.contracts || []).filter((c) => c.status === 'active' || (works && ['terminated', 'complete'].includes(c.status)));
    const signed = (t0.contracts || []).some((c) => c.status === 'active' || c.status === 'terminated');
    for (const c of active) {
      const sup = (c.suppliers || [])[0] || {};
      picks.push({ cid: c.id, info: { org: t0.buyer, tid: t0.tid, sp: '', signed: c.signed || '', title: c.title || t0.title || '', number: c.number || '', buyer: t0.buyer_name || '', supplier: sup.name || '' } });
    }
    if (!signed && t0.id && !['unsuccessful', 'cancelled', 'complete'].includes(t0.status)) {
      picks.push({ cid: 'tn' + t0.id, info: { org: t0.buyer, tid: t0.tid, sp: '', title: t0.title || '', number: '', buyer: t0.buyer_name || '', supplier: '' } });
    }
  }
  return picks;
}

// "Track everything of these": Prozorro is read again where it was not read this week.
async function trackAll(rows) {
  if (REG.busy) return;
  REG.busy = 'track';
  let n = 0, added = 0, already = 0, failed = 0;
  try {
    for (const r of rows) {
      n++;
      setStatus(rt('tracking', { n, total: rows.length, added }));
      const tids = spTids(r);
      if (!tids.length) continue;
      let pz = r.pz;
      const fresh = pz && pz.at && Date.now() - new Date(pz.at).getTime() < 7 * 864e5 && tids.every((x) => (pz.tenders || []).some((y) => y.tid === x));
      if (!fresh) {
        try { pz = await refreshSp(r); } catch (e) { failed++; continue; }
      }
      for (const p of trackPicks(pz, r)) {
        if (isTracked(p.cid)) { already++; continue; }
        try { await cloud.track(p.cid, p.info); added++; } catch (e) { failed++; console.error('registry track', r.code, p.cid, e); }
      }
    }
  } finally {
    REG.busy = null;
  }
  if (added) nudgeSync();
  setStatus(rt('trackDone', { added, already, failed }), failed > 0);
  toast(rt('trackDone', { added, already, failed }), { long: true });
}

// ---- who keeps a sub-project, and keeping it up to date ----------------------------------------
//
// Each sub-project has a manager: the table's expert, or whoever took it over in the app
// (registry/{code}.work.manager). Everyone on the team sees every sub-project; only its manager's
// app keeps it up to date. For the signed-in user (by default Maksym Kasap when the account has no
// expert of its own), once a day: Prozorro is read again where it is a week old, and what is alive
// is followed by the sync — the procurement under way (until it ends) and the contracts in force
// (works, supervision, consulting engineer). What ended leaves by itself: a failed or cancelled
// procurement at once, a finished or terminated contract 90 days on (the last payments). A
// sub-project given to someone else leaves this user's list too. One taken off by hand stays off
// (work.noTrack).
const DEFAULT_MANAGER = 'Maksym Kasap';
const AUTO_EVERY_H = 20;
const KEEP_AFTER_END_D = 90;
const myManager = () => (REG.profile && REG.profile.expert) || (REG.access && REG.access.expert) || DEFAULT_MANAGER;
const spManager = (r) => ((r.work || {}).manager) || (r.t || {}).expert || '';
const isMine = (r) => spManager(r) === myManager();
let autoTimer = null;
function autoTrackSoon() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => autoTrack().catch((e) => console.error('auto track', e)), 4000);
}
// With Prozorro ids, or a Ukrainian name to find its works procurement by (as "Refresh from Prozorro" does).
function autoRows() {
  return [...REG.rows.values()].filter((r) => isMine(r) && spStage(r).stage !== 'withdrawn' && (spTids(r).length || spNameUk(r)));
}
// Followed items of this user that should go: their sub-project is someone else's, or they ended.
function endedPicks() {
  const out = [];
  for (const id of state.mine.tracked.keys()) {
    const row = trackedRow(id);
    if (!row) continue;
    const r = spOfTid(row.tid);
    if (!r) continue;  // one's own pick outside the registry stays as it is
    if (!isMine(r)) { out.push(id); continue; }
    if (row.kind === 'tender' && ['unsuccessful', 'cancelled'].includes(row.tender_status)) { out.push(id); continue; }
    // The works contracts of one's own sub-projects stay, finished or not (risk 4 is rated on them).
    const t0 = ((r.pz || {}).tenders || []).find((x) => x.tid === row.tid);
    if (t0 ? procRole(r, t0) === 'works' : worksTids(r).has(row.tid)) continue;
    const end = row.end || row.signed;
    if (['terminated', 'complete'].includes(row.status) && end && addDays(end, KEEP_AFTER_END_D) < today()) out.push(id);
  }
  return out;
}
async function autoTrack(force, only) {
  if (!REG.access || !cloud || !state.user || !state.mine.ready || REG.busy || !REG.rows.size) return;
  let last = 0;
  try { last = Number(localStorage.getItem('autoTrackAt') || 0); } catch (e) { /* private window */ }
  if (!force && Date.now() - last < AUTO_EVERY_H * 3600e3) return;
  const rows = only ? [only] : autoRows();
  REG.busy = 'auto';
  let added = 0, removed = 0, failed = 0, n = 0;
  try {
    for (const r of rows) {
      n++;
      if (n % 5 === 1) setStatus(rt('autoProgress', { n, total: rows.length, added }));
      const tids = spTids(r);
      let pz = r.pz;
      const fresh = pz && pz.at && Date.now() - new Date(pz.at).getTime() < 7 * 864e5 && (tids.length || (pz.tenders || []).length) && tids.every((x) => (pz.tenders || []).some((y) => y.tid === x));
      if (!fresh) {
        try { pz = await refreshSp(r); } catch (e) { failed++; continue; }
      }
      const off = new Set(((r.work || {}).noTrack) || []);
      for (const p of trackPicks(pz, r)) {
        if (isTracked(p.cid) || off.has(p.cid)) continue;
        // A procurement already followed turns into its first contract by itself; the contracts of
        // its other lots are taken on control each by itself.
        const t0 = (pz.tenders || []).find((x) => x.tid === p.info.tid);
        if (!p.cid.startsWith('tn') && t0 && isTracked('tn' + t0.id)) {
          const follows = (trackedRow('tn' + t0.id) || {}).contract_id;
          if (!follows || follows === p.cid) continue;
        }
        try { await cloud.track(p.cid, p.info); added++; } catch (e) { failed++; console.error('auto track', r.code, p.cid, e); }
      }
    }
    for (const id of endedPicks()) {
      try { await cloud.untrack(id); removed++; } catch (e) { failed++; }
    }
    if (!only) try { localStorage.setItem('autoTrackAt', String(Date.now())); } catch (e) { /* private window */ }
  } finally {
    REG.busy = null;
  }
  if (added || removed) { nudgeSync(); toast(rt('autoDone2', { added, removed }), { long: true }); }
  setStatus(rt('autoStatus2', { added, removed, failed, n: rows.length }), failed > 0);
}
// What the public list pub/{hash} carries of one contract on control, for the sync: the sub-project,
// its EIB programme, what the procurement buys and the EIB's part paid by Mindev's register (for the
// sub-project's payments of that kind). The user agreed to publish the sums (26.11.2026).
const PROG_KEY = { 'URP III': 'urp3', URP3: 'urp3', URP: 'urp', UERP: 'uerp' };
const MRD_KINDS = { works: ['works', 'advance', 'advance_close', 'other'], ts: ['ts'], csc: ['csc'] };
function pubExtraFor(cid, t) {
  const r = t && t.tid ? spOfTid(t.tid) : null;
  if (!r) return null;
  const t0 = ((r.pz || {}).tenders || []).find((x) => x.tid === t.tid);
  const role = t0 ? procRole(r, t0) : null;
  const prog = PROG_KEY[String((r.t || {}).programme || '').trim().toUpperCase()] || null;
  let eib = null;
  const kinds = MRD_KINDS[role];
  if (r.mrd && kinds) eib = Math.round((r.mrd.payments || []).filter((x) => x.paid && kinds.includes(x.kind)).reduce((a, x) => a + (x.eib || 0), 0) * 100) / 100;
  return { subp: /^[A-Z]{2}\d{1,2}[A-Z]?_\d{2}$/.test(r.code) ? r.code : null, prog, role, eib_paid: eib };
}
// Settings: whose sub-projects are mine (the team table's expert names).
function expertCard() {
  const names = [...new Set([...REG.rows.values()].map(spManager).concat([myManager(), DEFAULT_MANAGER]).filter(Boolean))].sort();
  const note = h('span', { class: 'muted small' });
  const sel = select(names.map((x) => [x, x]), myManager(), async (e) => {
    const v = e.target.value;
    try {
      await cloud.saveExpert(v);
      REG.profile = Object.assign({}, REG.profile, { expert: v });
      REGF.expert = v;
      fill(note, rt('expertSaved', { n: [...REG.rows.values()].filter(isMine).length }));
      autoTrack(true).catch(() => {});
    } catch (err) { fill(note, h('span', { class: 'bad' }, err.message)); }
  }, rt('expertLabel'));
  return h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, rt('expertTitle')), sel, h('p', { class: 'muted small' }, rt('expertHint')), note);
}
// Settings: how the eight risks are rated (the team's rules of 20.11.2026) and the programme's rules.
function methodCard() {
  return h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('methodTitle')),
    h('p', { class: 'muted small' }, rt('methodLead')),
    h('div', { class: 'method-list' }, RISK_KEYS.map((k) => h('details', { class: 'howto' },
      h('summary', null, h('b', null, rt(k)), KEY_RISKS.includes(k) ? h('span', { class: 'tag' }, rt('keyRisk')) : null),
      h('p', { class: 'muted small' }, rt('rule_' + k))))),
    h('p', { class: 'muted small', style: 'margin-top:10px' }, rt('methodPig')));
}
// Take a sub-project over: it becomes this user's to keep up to date (and leaves its former manager's list).
async function takeOver(r) {
  await saveWork(r, (w) => { w.manager = myManager(); w.managerAt = today(); w.managerBy = (state.user && (state.user.displayName || state.user.email)) || ''; });
  toast(rt('takenOver', { code: r.code }));
  autoTrack(true, Object.assign({}, r, { work: Object.assign({}, r.work, { manager: myManager() }) })).catch(() => {});
}
// Taken off control by hand: kept off for the sub-project (called by the dossier's "remove").
function regNoTrack(cid, tid) {
  if (!REG.access || !tid) return;
  const r = [...REG.rows.values()].find((x) => spTids(x).includes(tid));
  if (!r) return;
  saveWork(r, (w) => { w.noTrack = [...new Set((w.noTrack || []).concat([cid]))].slice(-200); }).catch(() => {});
}

async function refreshMany(rows) {
  if (REG.busy) return;
  REG.busy = 'refresh';
  let n = 0, failed = 0, linked = 0, auto = 0, cand = 0, none = 0, noName = 0;
  for (const r of rows) {
    n++;
    setStatus(rt('refreshing', { n, total: rows.length }));
    const had = spTids(r).length > 0;
    if (!had && !spNameUk(r)) { noName++; continue; }
    try {
      const pz = await refreshSp(r);
      if (had) linked++;
      else if ((pz.tenders || []).length) auto++;
      else if ((pz.cand || []).length) cand++;
      else none++;
    } catch (e) { failed++; console.error('registry refresh', r.code, e); }
  }
  REG.busy = null;
  const msg = rt('refreshDone', { linked, auto, cand, none, noName }) + (failed ? ' · ' + rt('refreshFailed', { n: failed }) : '');
  setStatus(msg, !!failed);
  toast(msg, { long: true });
}

// The works contract of a sub-project: the latest signed one of its linked procedures.
// Only a works procurement counts: design, expertise or supervision firms are not the contractor.
// What a procedure buys: the team's Tenders sheet says it first (W, TS, IC), else Prozorro's code and title.
// One classifier of what a procedure buys: the team's Tenders sheet first (W/TS/IC/AN/D); then a
// service named in the title — supervision, the consulting engineer, author's supervision — whatever
// object it names ("Технічний нагляд за капітальним ремонтом …" is supervision); then Prozorro's own
// category or a construction code; then design and the rest by the title.
function procRole(r, t0, x) {
  if (x === undefined && t0) x = (r.tenders || []).find((y) => y.pz === t0.tid) || null;
  const sheet = x && roleOfSheet(x.kind);
  if (sheet) return sheet;
  if (!t0) return 'other';
  const title = t0.title || '';
  if (/технічн\S*\s+нагляд/i.test(title)) return 'ts';
  if (/інженер\S*[\s\-‐–]*консультант|консультаційн\S*\s+послуг/i.test(title)) return 'csc';
  if (/авторськ\S*\s+нагляд/i.test(title)) return 'author';
  if (t0.category === 'works' || isWorksTender(t0)) return 'works';
  return prozorro_role(title);
}
// Only the works procurement is rated (the team's decision of 23.11.2026): it is what the sub-project
// is. Supervision, the consulting engineer, design and the rest are shown, for information only.
function worksTids(r) {
  if (r._wt && r._wt.pz === r.pz && r._wt.tn === r.tenders) return r._wt.set;
  const set = new Set(((r.pz || {}).tenders || []).filter((t0) => procRole(r, t0) === 'works').map((t0) => t0.tid));
  for (const x of r.tenders || []) if (x.pz && roleOfSheet(x.kind) === 'works') set.add(x.pz);
  Object.defineProperty(r, '_wt', { value: { pz: r.pz, tn: r.tenders, set }, configurable: true, writable: true });
  return set;
}
// Mindev's payments for the works: the works done and the advance; supervision, the engineer and refunds are not.
const NOT_WORKS_PAY = ['ts', 'csc', 'refund'];
// The sub-project's current works contract and the procedure it came from: the one basis of its risk
// matrix, progress, payments and the SPs row of the team's table. A tender #1 → contract #1 ended →
// tender #2 → contract #2 sub-project is judged on #2 alone; while #2 is still being tendered, on that
// tender (its procurement checks) — the ended contract no longer brings its State Audit findings,
// complaints, amendments, contractor or debts in.
//   mode: contract (in force) | retender (a new works tender after the last contract ended) | tender
//   (the first one, no contract yet) | complete | terminated (ended early, nothing new yet) | sheet
//   (the table knows a works contract Prozorro is not linked for)
const isEarlyEnd = (c) => !!(c && c.status === 'terminated' && (String(c.termination || '').trim()
  || (c.paid != null && c.value && c.value.amount && c.paid < c.value.amount * 0.9)));
function primaryWorks(r) {
  if (r._pw && r._pw.pz === r.pz && r._pw.tn === r.tenders && r._pw.t === r.t) return r._pw.v;
  const sheetOf = (t0) => (r.tenders || []).find((y) => y.pz === t0.tid) || null;
  const rowOf = (c) => (c && ((state.trackedIndex || {}).items || []).find((y) => y.key === c.id || y.contract_id === c.id)) || null;
  const works = ((r.pz || {}).tenders || []).filter((t0) => !t0.error && procRole(r, t0) === 'works');
  const cs = [];
  for (const t0 of works) for (const c of t0.contracts || []) if (['active', 'complete', 'terminated'].includes(c.status)) cs.push({ c, t0 });
  cs.sort((a, b) => String(b.c.signed || '').localeCompare(String(a.c.signed || '')));
  const running = works.filter((t0) => RUN.includes(t0.status) && !(t0.contracts || []).some((c) => c.status === 'active'))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
  const live = cs.find((x) => x.c.status === 'active') || null;
  const last = cs[0] || null;
  let v = null;
  const of = (mode, c, t0, extra) => Object.assign({ mode, contract: c, tender: t0, trackedRow: rowOf(c), sheetRow: t0 ? sheetOf(t0) : null }, extra || {});
  if (live) v = of('contract', live.c, live.t0);
  else if (running && (!last || String(running.date || '') >= String(last.c.signed || ''))) v = of(last ? 'retender' : 'tender', null, running, { prev: last });
  else if (last) v = of(isEarlyEnd(last.c) ? 'terminated' : 'complete', last.c, last.t0);
  else {
    // No contract in Prozorro: the newest works procedure there, else the table's works row.
    const t0 = works.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    const x = (r.tenders || []).filter((y) => tKind(y.kind) === 'works').sort((a, b) => String(b.issued || '').localeCompare(String(a.issued || '')))[0];
    if (t0) v = of('tender', null, t0);
    else if (x || (r.t || {}).contractor) v = { mode: 'sheet', contract: null, tender: null, trackedRow: null, sheetRow: x || null };
  }
  Object.defineProperty(r, '_pw', { value: { pz: r.pz, tn: r.tenders, t: r.t, v }, configurable: true, writable: true });
  return v;
}
// The procedure the risks are rated on (a set, as the checks ask "is this procedure counted").
function primaryTids(r) {
  const pw = primaryWorks(r);
  return new Set(pw && pw.tender ? [pw.tender.tid] : []);
}
// Everything else of the sub-project: supervision, the consulting engineer, author's supervision,
// design, the rest — and the earlier works procedures (failed, cancelled, their contract ended).
// Shown, for information; never rated.
function additionalProcurements(r) {
  const main = primaryTids(r);
  return procItems(r).filter((it) => !(it.tid && main.has(it.tid))).map((it) => Object.assign({}, it, { previous: it.role === 'works' }));
}
// Mindev's payments of one contract: its own (the register keeps the contract above them), or, for
// a register read before that was kept, those of its kind made while it was the sub-project's.
function mrdPaysOf(r, role, c) {
  const pays = mrdPayments(r.mrd).filter((x) => (MRD_KINDS[role] || []).includes(x.kind));
  if (!c) return pays;
  const no = normNo(c.number);
  if (pays.some((x) => x.contract)) return pays.filter((x) => !x.contract || normNo(x.contract) === no);
  const own = ((r.mrd || {}).contracts || []).filter((x) => x.role === role && x.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (own.length < 2) return pays;
  const mine = own.findIndex((x) => normNo(x.number) === no);
  if (mine < 0) return pays;
  const from = own[mine].date, to = own[mine + 1] ? own[mine + 1].date : '9999';
  return pays.filter((x) => { const d = x.received || x.paid || ''; return !d || (d >= from && d < to); });
}
function mainContract(r) {
  const pw = primaryWorks(r);
  return pw && pw.contract ? { c: pw.contract, t0: pw.tender } : null;
}
