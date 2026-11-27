// The export centre: the team's Compliance Working Table rebuilt from the app, three ways —
//   a new .xlsx in the exact columns, headings and formulas of its SPs and Tenders sheets (no
//   template needed), plus Red Flags & Risks and Portfolio KPIs;
//   rows copied to the clipboard as Excel rows (TSV), to paste over the ID cell of any report;
//   the analyst's own file filled in (fillWorkbook, in src/excel.js).
// One reckoning of a row (spRowValues, tenderRowValues) serves all three.
'use strict';

// The SPs sheet as the team keeps it: column, field, heading (Ukrainian row 15, English row 16).
const SP_LAYOUT = [
  ['A', 'n', '#', '#'], ['B', 'nn', '##', '##'], ['C', 'code', 'Код', 'ID '], ['D', 'status', 'Статус', 'SP status'], ['E', 'programme', 'Програма', 'PROGRAMME'],
  ['F', 'office', 'Офіс', 'OFFICE'], ['G', 'name_en', 'Назва Субпроєкту', 'Sub-Project Name (ENG)'], ['H', 'name_uk', 'Назва Субпроєкту', 'Sub-Project Name (UKR)'],
  ['I', 'batch', 'Пул', 'Batch'], ['J', 'expert', 'Спеціалісти від ПРООН', 'UNDP TA specialists'], ['K', 'beneficiary', 'Замовник / Кінцевий бенефіціар', 'Promoter / Final Beneficiary'],
  ['L', 'beneficiary_id', 'Замовник / Кінцевий бенефіціар\nКОД ЄДРПОУ', 'Promoter / Final Beneficiary\nID'], ['M', 'rating', 'Overall Rating', 'Загальна оцінка'],
  ['N', 'r1', '1. Contract Amendments Compliance', ''], ['O', 'r2', '2. Cost and Price Verification', ''], ['P', 'r3', '3. Funding Gap', ''], ['Q', 'r4', '4. Payment Delays', ''],
  ['R', 'r5', '5. Contractor performance under other UERP/URP contracts', ''], ['S', 'r6', '6. Contractor bankruptcy or other loss of legal status', ''],
  ['T', 'r7', '7. Conclusions of SASU monitoring', ''], ['U', 'r8', '8. AMCU decisions on procurement complaints', ''],
  ['V', 'invest_eur', 'Загальна сума інвестицій вкл. ПДВ, ЄВРО', 'Total Investment Cost inc. VAT, EUR'], ['W', 'eib_eur', 'Фінансування ЄІБ без ПДВ, євро', 'EIB Financing excl. VAT, EUR'],
  ['X', 'contract_value', 'Вартість будівельних робіт за Договором підряду, вкл. ПДВ, грн', 'Construction Contract Value incl. VAT, UAH'],
  ['Y', 'eib_uah', 'Частка фінансування ЄІБ, грн.', 'EIB Co-   Financing, UAH'], ['Z', 'subv_year', 'Субвенція на поточний рік, грн', 'Current-Year Subvention, UAH'],
  ['AA', 'funding', 'Статус достатності фінансування', 'Funding Adequacy Status'], ['AB', 'extra_need', 'Очікувана потреба у додатковому фінансуванні, грн', 'Anticipated Additional Funding Needs, UAH'],
  ['AC', 'subv_paid', 'Оплачено із субвенції за весь період, грн', 'Total Subvention Paid, UAH'], ['AD', 'subv_paid_year', 'Оплачено із субвенції у поточному році, грн', 'Subvention Paid in {y}, UAH'],
  ['AE', 'paid_pct', '', 'Contract Paid %'], ['AF', 'subv_util', '', '% of Subvention Util.'], ['AG', 'dream', 'Посилання на систему DREAM', 'Link to the DREAM system'],
  ['AH', 'proc_status', 'Статус процедури закупівлі', 'Status of the procedure'], ['AI', 'pz_link', 'Посилання на закупівлю в Prozorro', 'Prozorro Link'],
  ['AJ', 'tenders_n', 'кількість тендерів', '## of tenders'], ['AK', 'amcu', 'Скарги до АМКУ', 'AMCU Complaints'], ['AL', 'sasu', 'Моніторинг ДАСУ', 'SASU Monitoring'],
  ['AM', 'contractor', 'Підрядник', 'Contractor'], ['AN', 'contractor_id', 'ЄДРПОУ Підрядника', 'Contractor ID'], ['AO', 'contract_sum', 'Сума договору', ''],
  ['AP', 'co_eib', 'Співфінансування ЄІБ', ''], ['AQ', 'co_local', 'Співфінансування КБ', ''], ['AR', 'contract_date', 'Дата укладення договору', ''],
  ['AS', 'contract_term', 'Строк дії договору', ''], ['AT', 'completion', 'Дата завершення робіт за Договором', 'Contractual date of completion'],
  ['AU', 'start', 'Дата початку / відновлення робіт', 'Date of works start / resumption'], ['AV', 'pct', '% виконання', '% of completion'],
  ['AW', 'upd', 'Дата оновлення коментаря\n(обрати)', 'Update date'], ['AX', 'comment', 'Коментарі', 'Coments'], ['AY', 'size', '', 'SIZE of SP'], ['AZ', '', '', ''], ['BA', '', '', ''],
  ['BB', 'next_ca', 'NEXT ACTIVITY', 'CA'], ['BC', 'next_act', '', 'Activity'], ['BD', 'next_date', '', 'DATE'], ['BE', 'next_done', '', '☑'],
];
const SP_GROUPS = { C: 'SUB-PROJECT', M: 'RISK MATRIX', V: 'FINANCE', AG: 'PROCUREMENT', AM: 'CONTRACT', AU: 'PROJECT PROGRESS' };
const SP_WEIGHTS = { N: 1, O: 1.5, P: 1.5, Q: 1.5, R: 1, S: 1, T: 1.5, U: 1 };
// The weekly columns from BF on, as the team's sheet has them: from ISO week 21 of 2026 (its Monday),
// week after week to the last week of the year (52 or 53), the next year's weeks after them.
const WEEKS_FROM = '2026-05-18';
// The Tenders sheet: column, field, heading (row 5); the stages above (row 4).
const TN_LAYOUT = [
  ['A', 'sp', 'SP ID'], ['B', 'programme', 'Programme'], ['C', 'region', 'Region'], ['D', 'analyst', 'Analyst'], ['E', 'name', 'Name of the tender'], ['F', 'kind', 'W/TS/IC'],
  ['G', 'status', 'Status of the tender procedure'], ['H', 'method', 'Procurement method'], ['I', 'pz', 'Prozorro ID'], ['J', 'mk_td', 'TD Checking'], ['K', 'mk_assist', 'Tender Assistance'],
  ['L', 'mk_monitor', 'Tender Monitoring'], ['M', 'est', 'Estimated Value acc. to the Procurement Plan, UAH incl VAT'], ['N', 'issued', 'Tender Issuing Date'], ['O', 'opening', 'Tender opening Date'],
  ['P', 'length', 'Length of the tender'], ['Q', 'qr', 'Q&R'], ['R', 'amcu_td', 'AMCU Complaints concerning the TD'], ['S', 'amcu_td_status', 'Complaint Review Status'],
  ['T', 'auction', 'Auction Date \n(if there are 2 or more bidders)'], ['U', 'bidders_n', '## of bidders'], ['V', 'bidders', 'Bidders'], ['W', 'eval_report', 'Tender evaluation report'],
  ['X', 'eval_date', 'Tender evaluation report issuance date'], ['Y', 'award', 'Award decision date'], ['Z', 'ac', 'AC Assessment'], ['AA', 'ac_flag', 'AC Flag'], ['AB', 'price', 'Price Verification'],
  ['AC', 'price_flag', 'Price Verification Flag'], ['AD', 'amcu_eval', 'AMCU Complaints concerning the evaluation'], ['AE', 'amcu_eval_status', 'Complaint Review Status'],
  ['AF', 'sasu', 'SASU Monitoring'], ['AG', 'obs', 'Any other observation on procurement process'], ['AH', 'contract_link', 'Link to the Contract'], ['AI', 'contractor', 'Contractor Name (ukr)'],
  ['AJ', 'contractor_en', 'Contractor Name (eng)'], ['AK', 'contractor_id', 'Contractor ID'], ['AL', 'contract_no', 'Contract Number'], ['AM', 'contract_date', 'Date of the Contract '],
  ['AN', 'contract_end', 'Date of the Contract end'], ['AO', 'duration', 'Contract (works) duration\nmonths'], ['AP', 'contract_total', 'Total Сontract amount with VAT, UAH'],
  ['AQ', 'co_eib', 'EIB Co-Financing, UAH'], ['AR', 'co_local', 'Local and other Co-Financing, UAH'], ['AS', 'mods', '# of Contract Modifications'], ['AT', 'mods_link', 'Links to Contract Modifications'],
  ['AU', 'exec_obs', 'Any other observation on contract execution process'], ['AV', 'paid', 'Total Amount Paid to Date'], ['AW', 'paid_eib', 'Amount Paid to Date (EIB Co-Financing)'],
  ['AX', 'paid_local', 'Amount Paid to Date (Local  budget)'], ['AY', 'adj', 'Total Contract Price Adjustment'], ['AZ', 'adj_eib', 'EIB Co-Financing. UAH Contract Price Adjustment'],
  ['BA', 'adj_local', 'Local and other Co-Financing, UAH Contract Price Adjustment'], ['BB', 'adj2', 'Total Contract Price Adjustment'], ['BC', 'adj2_eib', 'EIB Co-Financing. UAH Contract Price Adjustment'],
  ['BD', 'adj2_local', 'Local and other Co-Financing, UAH Contract Price Adjustment'],
];
const TN_STAGES = { I: 'Tender Issuing Stage', R: 'AMCU', T: 'Evaluation Stage', AH: 'Contract Stage' };
const KIND_LETTER = { works: 'W', ts: 'TS', csc: 'IC', author: 'AN', design: 'D' };
const RATING_FORMULA = (n) => `IF(COUNTBLANK(N${n}:U${n})=8,"",IF(OR(COUNTIF(O${n}:Q${n},3)+COUNTIF(T${n},3)>=1,COUNTIF(O${n}:Q${n},2)+COUNTIF(T${n},2)>=3),3,`
  + `IF(SUMPRODUCT(N${n}:U${n},N$14:U$14)/SUM(N$14:U$14)>=1.8,3,IF(OR(COUNTIF(O${n}:Q${n},2)+COUNTIF(T${n},2)>=1,COUNTIF(N${n}:U${n},3)>=1,SUMPRODUCT(N${n}:U${n},N$14:U$14)/SUM(N$14:U$14)>=1.4),2,1))))`;

// The weekly columns as the sheet heads them ("Week 47 (16.11-22.11)"), each with its Monday.
function weekList(year) {
  const last = Math.max(year || 0, +today().slice(0, 4)), out = [];
  for (const d = new Date(WEEKS_FROM + 'T12:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 7)) {
    const thu = new Date(d); thu.setUTCDate(d.getUTCDate() + 3);
    if (thu.getUTCFullYear() > last) break;
    const mon = d.toISOString().slice(0, 10);
    out.push({ mon, label: weekOf(mon).label });
  }
  return out;
}
const weekLabels = (year) => weekList(year).map((x) => x.label);
const expertInitials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('').slice(0, 3);
const numOrNull = (x) => { const n = toNum(x); return n == null ? null : n; };
const day = (d) => (d ? { day: String(d instanceof Date ? d.toISOString() : d).slice(0, 10) } : null);

// One sub-project's row: field → value (number, {day}, {f, v} for a formula, text, true/false).
// The current works contract (primaryWorks) gives the procedure, AMCU, SASU, contractor and money.
function spRowValues(r) {
  const tt = r.t || {}, v = {};
  const sc = scoresOf(r);
  Object.assign(v, { code: r.code, status: tt.status, programme: tt.programme, office: tt.office, name_en: tt.name_en, name_uk: tt.name_uk, batch: tt.batch != null ? numOrNull(tt.batch) ?? tt.batch : null,
    expert: spManager(r), beneficiary: tt.beneficiary, beneficiary_id: edrCode(tt.beneficiary_id), size: tt.size });
  // The ratings set in the app or kept in the table; a hint not accepted stays out of the team's table.
  for (const k of SCORE_KEYS) if (sc.scores[k] != null && sc.from[k] !== 'hint') v[k] = Number(sc.scores[k]);
  v.rating = overallRating(Object.fromEntries(SCORE_KEYS.map((k) => [k, v[k] != null ? v[k] : null])));
  const pw = primaryWorks(r), c = pw && pw.contract, t0 = pw && pw.tender, row = pw && pw.trackedRow;
  Object.assign(v, { invest_eur: numOrNull(tt.invest_eur), eib_eur: numOrNull(tt.eib_eur), eib_uah: numOrNull(tt.eib_uah), extra_need: numOrNull(tt.extra_need),
    subv_paid: numOrNull(tt.subv_paid), subv_paid_year: numOrNull(tt.subv_paid_year) });
  v.contract_value = (c && c.value && c.value.amount) || numOrNull(tt.contract_value);
  // The subvention in force by the CMU order; the year's adequacy on the current contract's need.
  const sv = subvMatch(r), am = sv ? sv.amounts || {} : {}, eds = sv ? sv.editions || Object.keys(am).sort() : [];
  const nowK = eds.length ? am[eds[eds.length - 1]] : null;
  v.subv_year = sv && sv.name && nowK != null ? Math.round(nowK * 1000) : numOrNull(tt.subv_year);
  const ad = sv && sv.name && nowK != null ? adequacyData(r, nowK) : null;
  v.funding = ad ? FUNDING_WORD[ad.status] : tt.funding;
  if (ad) v.extra_need = Math.round(Math.max(0, ad.need - ad.left));
  const paid = paidShare(r);
  v.paid_pct = paid != null ? paid / 100 : numOrNull(tt.paid_pct);
  v.subv_util = v.subv_year ? (v.subv_paid_year || 0) / v.subv_year : null;
  const dream = spDream(r);
  if (dream) v.dream = { f: `HYPERLINK("${dreamUrl(dream)}","${dream}")`, v: dream };
  const tids = spTids(r);
  if (tids.length) {
    const go = (t0 && t0.tid) || tids[0];
    v.pz_link = { f: `HYPERLINK("https://prozorro.gov.ua/tender/${go}",${tids.map((x) => '"' + x + '"').join('&CHAR(10)&')})`, v: tids.join('\n') };
  }
  const works = ((r.pz || {}).tenders || []).filter((x) => !x.error && procRole(r, x) === 'works');
  v.tenders_n = works.length || (r.tenders || []).filter((x) => tKind(x.kind) === 'works').length || null;
  const pzW = t0 ? [t0] : [];
  if (t0) v.proc_status = tableStatus(t0, c);
  const cs = pzW.reduce((acc, x) => { const k = x.complaints || {}; return { n: acc.n + (k.n || 0), open: acc.open + (k.open || 0), satisfied: acc.satisfied + (k.satisfied || 0) }; }, { n: 0, open: 0, satisfied: 0 });
  v.amcu = tableAmcu(cs) || tt.amcu;
  v.sasu = tableSasu(pzW.map((x) => x.sasu)) || tt.sasu;
  const sup = c ? (c.suppliers || [])[0] || {} : {};
  v.contractor = sup.name || tt.contractor;
  v.contractor_id = edrCode(sup.code || tt.contractor_id);
  v.contract_sum = (c && c.value && c.value.amount) || numOrNull(tt.contract_sum);
  v.co_eib = numOrNull(tt.co_eib); v.co_local = numOrNull(tt.co_local);
  v.contract_date = day((c && c.signed) || tt.contract_date);
  v.contract_term = tt.contract_term instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(tt.contract_term || '')) ? day(tt.contract_term) : tt.contract_term;
  v.completion = day((c && c.end) || tt.completion);
  v.start = day(tt.start || (c && c.start));
  // Progress and the comment as the expert keeps them in the app (when newer than the table's).
  const s = spStatus(r);
  v.pct = pctOf(s.pct) != null ? pctOf(s.pct) / 100 : null;
  v.upd = day(s.upd);
  v.comment = s.comment || null;
  const nx = typeof nextActivity === 'function' ? nextActivity(r) : null;
  if (nx) Object.assign(v, { next_ca: expertInitials(nx.who), next_act: nx.what, next_date: day(nx.date), next_done: false });
  else if (tt.next) Object.assign(v, { next_ca: tt.next.who, next_act: tt.next.what, next_date: day(tt.next.date) });
  // The journal by week: each week's experts and activities joined ("VISIT; COST VERIFICATION").
  v.weeks = {};
  for (const a of activities(r)) {
    if (!a.date) continue;
    const w = weekOf(a.date).label;
    const g = v.weeks[w] = v.weeks[w] || { who: new Set(), kinds: new Set(), done: true };
    g.who.add(expertInitials(a.who)); g.kinds.add(a.kind); g.done = g.done && a.done !== false;
  }
  return v;
}

// One procedure's Tenders row: the team's own row (if any) brought up to date from Prozorro and the
// monitor's snapshot.
function tenderRowValues(r, it, snap) {
  const x = it.x || {}, t0 = it.t0, tid = it.tid, tt = r.t || {};
  const v = {};
  for (const [, key] of TN_LAYOUT) if (x[key] != null && x[key] !== '') v[key] = x[key] instanceof Date ? day(x[key]) : x[key];
  Object.assign(v, { sp: r.code, programme: tt.programme, region: tt.office, analyst: v.analyst || spManager(r), kind: v.kind || KIND_LETTER[it.role] || null });
  if (tid) v.pz = { f: `HYPERLINK("https://prozorro.gov.ua/tender/${tid}","${tid}")`, v: tid };
  const mk = ((r.work || {}).marks || {})[tid] || {};
  for (const k of ['td', 'assist', 'monitor']) v['mk_' + k] = !!(mk[k] || x['mk_' + k] === true);
  if (t0) {
    const c = (t0.contracts || []).find((k) => k.status === 'active') || (t0.contracts || []).find((k) => k.status === 'terminated') || null;
    v.name = v.name || t0.title;
    v.status = tableStatus(t0, c) || v.status;
    v.method = tableMethod(t0) || v.method;
    if (t0.value && t0.value.amount) v.est = v.est || t0.value.amount;
    if (t0.date) v.issued = day(t0.date);
    if (t0.deadline) v.opening = day(t0.deadline);
    if (t0.bids != null) v.bidders_n = t0.bids;
    if (t0.sasu) v.sasu = tableSasu([t0.sasu]) || v.sasu;
    if (c) {
      const sup = (c.suppliers || [])[0] || {};
      Object.assign(v, { contract_link: 'https://prozorro.gov.ua/tender/' + tid, contractor: sup.name || v.contractor, contractor_id: edrCode(sup.code || v.contractor_id),
        contract_no: c.number || v.contract_no, contract_date: day(c.signed) || v.contract_date, contract_end: day(c.end) || v.contract_end,
        contract_total: (c.value && c.value.amount) || v.contract_total, mods: c.changes != null ? c.changes : v.mods });
      if (c.signed && c.end) v.duration = Math.round(dayDiff(c.signed, c.end) / 30.44 * 10) / 10;
    }
  }
  const u = (snap && snap.undp) || {};
  if ((u.timeline || {}).auction) v.auction = day(u.timeline.auction);
  if ((u.timeline || {}).award) v.award = day(u.timeline.award);
  const names = ((u.bidders || {}).list || []).map((b) => b.name).filter(Boolean);
  if (names.length) v.bidders = names.join('\n');
  const cp = u.complaints || {};
  const amcuOf = (k) => (k && k.n ? { n: k.n, open: k.open, satisfied: k.upheld } : null);
  if ((cp.tender || {}).n) { v.amcu_td = cp.tender.n; v.amcu_td_status = tableAmcu(amcuOf(cp.tender)); }
  if ((cp.award || {}).n) { v.amcu_eval = cp.award.n; v.amcu_eval_status = tableAmcu(amcuOf(cp.award)); }
  const tot = (snap && snap.totals) || {};
  if (snap && snap.kind === 'contract') {
    v.paid = tot.paid_total || tot.paid || v.paid;
    if (tot.paid_eib != null) { v.paid_eib = tot.paid_eib; v.paid_local = tot.paid; }
  }
  if (v.issued && v.opening && /tender/i.test(String(v.method || ''))) v.length = dayDiff(v.issued.day, v.opening.day);
  return v;
}

// ---- the values as cells and as text ------------------------------------------------------------
const DATE_FMT = 'dd.mm.yyyy';
function asCell(v, fmt) {
  if (v == null || v === '') return { v: null, s: { border: true } };
  if (v.day) return { v: v.day, day: true, s: { border: true, fmt: DATE_FMT } };
  if (v.f) return { v: v.v, f: v.f, s: { border: true, color: '1155CC' } };
  if (typeof v === 'number') return { v, s: { border: true, fmt: fmt || (Number.isInteger(v) ? '#,##0' : '#,##0.00') } };
  if (typeof v === 'boolean') return { v, s: { border: true } };
  return { v: String(v), s: { border: true, wrap: true } };
}
const asText = (v) => (v == null || v === '' ? '' : v.day ? fdate(v.day) : v.f ? String(v.v || '') : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE')
  : typeof v === 'number' ? String(v).replace('.', ',') : String(v));
const tsvCell = (s) => (/[\t\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const PCT_KEYS = new Set(['paid_pct', 'subv_util', 'pct']);

// The SPs rows from the ID column on (C → the last week), as text for the clipboard.
function spTsv(rows, year) {
  const weeks = weekLabels(year || +today().slice(0, 4));
  return rows.map((r) => {
    const v = spRowValues(r);
    const cells = SP_LAYOUT.slice(2).map(([, k]) => (PCT_KEYS.has(k) && typeof v[k] === 'number' ? Math.round(v[k] * 100) + '%' : asText(v[k])));
    for (const w of weeks) { const g = v.weeks[w]; cells.push(g ? [...g.who].filter(Boolean).join('; ') : '', g ? [...g.kinds].join('; ') : '', g && g.done ? 'TRUE' : ''); }
    return cells.map(tsvCell).join('\t');
  }).join('\n');
}
async function tenderTsv(rows) {
  const out = [];
  for (const r of rows) for (const it of procItems(r)) {
    const row = it.tid ? rowFor({ tid: it.tid }) : null;
    const snap = row ? await loadTracked(row.key).catch(() => null) : null;
    const v = tenderRowValues(r, it, snap);
    out.push(TN_LAYOUT.map(([, k]) => tsvCell(asText(v[k]))).join('\t'));
  }
  return out.join('\n');
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(rt('cpDone', { what })); }
  catch (e) {
    // No clipboard (an old browser, no permission): the text in a box to copy by hand.
    const ta = h('textarea', { class: 'input', rows: 10, readonly: true }); ta.value = text;
    sheet(h('h2', { class: 'card-title' }, rt('cpManual')), h('p', { class: 'muted small' }, rt('cpManualHint')), ta);
    requestAnimationFrame(() => { ta.focus(); ta.select(); });
  }
}
// The Red Flag card of a sub-project: its 2s and 3s with the facts, as text for the MS Form.
function redFlagText(r) {
  const sc = scoresOf(r), notes = r.scoreNotes || {}, risk = allRisk(r) || {};
  const lines = [`${r.code} — ${(r.t || {}).name_uk || (r.t || {}).name_en || ''}`, rt('rfBasis', { b: basisLine(r) }), rt('rfOverall', { n: overallRating(sc.scores) || '—' })];
  for (const k of SCORE_KEYS) if (sc.scores[k] >= 2) lines.push(`${rt(k)}: ${sc.scores[k]} — ${(notes[k] && notes[k].text) || (risk[k] || []).map((x) => x.text).join('; ') || '—'}`);
  lines.push(rt('rfBy', { who: myExpert(), date: fdate(today()) }));
  return lines.join('\n');
}
// The header's "Copy for Excel ▾".
function copyMenuFor(r) {
  return actionMenu(rt('cpMenu'), [
    [rt('cpSpRow'), () => copyText(spTsv([r]), rt('cpSpRowWhat')), 'copy', rt('cpSpRowHint')],
    [rt('cpTnRows'), async () => copyText(await tenderTsv([r]), rt('cpTnRowsWhat')), 'copy', rt('cpTnRowsHint')],
    [rt('cpRedFlag'), () => copyText(redFlagText(r), rt('cpRedFlagWhat')), 'copy', rt('cpRedFlagHint')],
  ], 'copy');
}

// ---- a new workbook ---------------------------------------------------------------------------------
async function buildWorkbook(rows, onStep) {
  const year = +today().slice(0, 4);
  const wl = weekList(year), weeks = wl.map((x) => x.label);
  const head = { bold: true, fill: 'DDEBF7', border: true, wrap: true, valign: 'center' };
  const grp = { bold: true, fill: 'BDD7EE', border: true };
  // SPs: rows 1–13 empty as in the team's sheet, 14 groups and weights, 15 Ukrainian, 16 English, data from 17.
  const s1 = Array.from({ length: 13 }, () => []);
  const r14 = SP_LAYOUT.map(([c]) => (SP_WEIGHTS[c] != null ? { v: SP_WEIGHTS[c], s: grp } : SP_GROUPS[c] ? { v: SP_GROUPS[c], s: grp } : { v: null }));
  const r15 = SP_LAYOUT.map(([, , uk]) => ({ v: uk || null, s: head }));
  const r16 = SP_LAYOUT.map(([, , , en]) => ({ v: (en || '').replace('{y}', year) || null, s: head }));
  for (const { mon, label: w } of wl) { r14.push({ v: monthName(mon.slice(0, 7)).split(' ')[0].toUpperCase(), s: grp }, { v: null }, { v: null }); r15.push({ v: w, s: head }, { v: null, s: head }, { v: null, s: head }); r16.push({ v: 'EXPERT', s: head }, { v: 'Activity', s: head }, { v: '☑', s: head }); }
  s1.push(r14, r15, r16);
  rows.forEach((r, i) => {
    const n = 17 + i, v = spRowValues(r);
    const cells = SP_LAYOUT.map(([c, k]) => {
      if (k === 'n') return asCell(i + 1);
      if (k === 'rating') return { v: v.rating, f: RATING_FORMULA(n), s: { border: true, bold: true } };
      if (k === 'subv_util') return { v: v.subv_util, f: `IF(Z${n}=0,"",AD${n}/Z${n})`, s: { border: true, fmt: '0%' } };
      return asCell(v[k], PCT_KEYS.has(k) ? '0%' : null);
    });
    for (const w of weeks) { const g = v.weeks[w]; cells.push(asCell(g ? [...g.who].filter(Boolean).join('; ') : null), asCell(g ? [...g.kinds].join('; ') : null), asCell(g && g.done ? true : null)); }
    s1.push(cells);
  });
  onStep && onStep(rt('xReading'));
  // Tenders: row 2 the counts of the marks, 4 the stages, 5 the headings, data from 6.
  const s2 = [[{ v: 'Ongoing Tenders for Works Procurement', s: { bold: true, size: 14 } }], TN_LAYOUT.map(([c]) => (['J', 'K', 'L', 'Z', 'AB'].includes(c) ? { v: null, f: `COUNTIF(${c}6:${c}5000,TRUE)` } : { v: null })), [],
    TN_LAYOUT.map(([c]) => (TN_STAGES[c] ? { v: TN_STAGES[c], s: grp } : { v: null })), TN_LAYOUT.map(([, , t]) => ({ v: t, s: head }))];
  let tn = 0;
  for (const r of rows) for (const it of procItems(r)) {
    const row = it.tid ? rowFor({ tid: it.tid }) : null;
    const snap = row ? await loadTracked(row.key).catch(() => null) : null;
    const v = tenderRowValues(r, it, snap);
    const n = 6 + tn++;
    s2.push(TN_LAYOUT.map(([c, k]) => (k === 'length' ? { v: v.length != null ? v.length : null, f: `IF(H${n}="Tender",IF(N${n}<>"",O${n}-N${n},""),"")`, s: { border: true } } : asCell(v[k]))));
  }
  // Red Flags & Risks: every 2 and 3 with its fact, source and sign-off, for the consolidated Risk Matrix.
  const s3 = [[rt('colCode'), rt('pfXName'), rt('colExpert'), rt('rfCriterion'), rt('rfScore'), rt('rfFrom'), rt('rfFact'), rt('rfFacts'), rt('rfBasisCol'), rt('rfSignoff'), rt('rfDate')].map((x) => ({ v: x, s: head }))];
  for (const r of rows) {
    const sc = scoresOf(r), notes = r.scoreNotes || {}, so = r.signoff || {}, risk = allRisk(r) || {};
    for (const k of SCORE_KEYS) {
      if (!(sc.scores[k] >= 2) || sc.from[k] === 'hint') continue;
      const s = so[k];
      s3.push([asCell(r.code), asCell((r.t || {}).name_uk || (r.t || {}).name_en), asCell(spManager(r)), asCell(rt(k)), { v: sc.scores[k], s: { border: true, bold: true, fill: sc.scores[k] === 3 ? 'FCE4D6' : 'FFF2CC' } },
        asCell(rt('from_' + sc.from[k])), asCell(notes[k] && notes[k].text), asCell((risk[k] || []).map((x) => x.text).join('; ')), asCell(basisLine(r)),
        asCell(s ? (s.ok ? rt('signoffOk', { who: s.ok, date: fdate(String(s.okAt || '').slice(0, 10)) }) : rt('signoffWait', { who: s.by || '—', date: fdate(String(s.at || '').slice(0, 10)) })) : null),
        asCell(day((notes[k] && notes[k].at) || null))]);
    }
  }
  // Portfolio KPIs of the EIB–UNDP agreement (Output 2) for these sub-projects.
  const keep = new Set(rows.map((r) => r.code));
  const was = Object.assign({}, PF);
  Object.assign(PF, { expert: '', programme: '', batch: '' });
  const d = portfolioData(keep);
  Object.assign(PF, was);
  const k = d.kpi;
  const ratio = (a, b) => (b ? a / b : null);
  const s4 = [[{ v: rt('xKpiTitle', { n: keep.size, date: fdate(today()) }), s: { bold: true, size: 14 } }], [],
    [rt('pfXId'), rt('pfXIndicator'), rt('pfXValue'), rt('pfXNum'), rt('pfXDen')].map((x) => ({ v: x, s: head })),
    ...[['2.1', 'pf_k21', ratio(k.k21.n, k.k21.of), k.k21.n, k.k21.of, '0%'], ['2.2', 'pf_k22', ratio(k.k22.n, k.k22.of), k.k22.n, k.k22.of, '0%'], ['2.3', 'pf_k23', k.k23.n, null, null],
      ['2.4', 'pf_k24', k.k24.n, null, null], ['2.5', 'pf_k25', k.k25.n, k.k25.marked, null], ['2.6', 'pf_k26', ratio(k.k26.n, k.k26.of), k.k26.n, k.k26.of, '0%']]
      .map(([id, key, val, a, b, fmt]) => [asCell(id), asCell(rt(key)), asCell(val, fmt), asCell(a), asCell(b)]),
    [], [{ v: rt('xKpiNote'), s: { color: '6B7280' } }]];
  const widths1 = SP_LAYOUT.map(([, k]) => ({ name_en: 40, name_uk: 40, beneficiary: 30, comment: 60, contractor: 30, pz_link: 26 }[k] || 12)).concat(weeks.flatMap(() => [8, 16, 4]));
  return xlsxBlob(xlsxBook([
    { name: 'SPs', rows: s1, widths: widths1, freeze: { row: 16, col: 3 } },
    { name: 'Tenders', rows: s2, widths: TN_LAYOUT.map(([, k]) => ({ name: 40, bidders: 30, obs: 40, exec_obs: 40, contractor: 30 }[k] || 13)), freeze: { row: 5, col: 1 } },
    { name: 'Red Flags & Risks', rows: s3, widths: [12, 40, 20, 34, 8, 16, 60, 60, 40, 30, 12], freeze: { row: 1, col: 1 } },
    { name: 'Portfolio KPIs', rows: s4, widths: [6, 70, 12, 12, 12] },
  ]));
}

// ---- the centre ---------------------------------------------------------------------------------
// Which sub-projects: one's own (recommended), the whole mission, or those the list shows now.
function exportCentre() {
  const all = [...REG.rows.values()];
  const scopes = { mine: all.filter(isMine), all, shown: REG.shown && REG.shown.length ? REG.shown : all.filter(isMine) };
  const pick = h('div', { class: 'x-modes' }, [['mine', rt('xsMine', { n: scopes.mine.length })], ['all', rt('xsAll', { n: scopes.all.length })], ['shown', rt('xsShown', { n: scopes.shown.length })]]
    .map(([v, text], i) => h('label', { class: 'x-mode' }, h('input', { type: 'radio', name: 'xscope', value: v, checked: i === 0 }), h('span', null, h('b', null, text)))));
  const scope = () => scopes[(pick.querySelector('input:checked') || {}).value || 'mine'].slice().sort((a, b) => a.code.localeCompare(b.code));
  const status = h('div', { class: 'small x-status' });
  const run = async (btn, fn) => { btn.disabled = true; fill(status, rt('xWorking')); try { await fn(); fill(status, ''); } catch (e) { console.error('export', e); fill(status, h('span', { class: 'bad' }, e.message)); } finally { btn.disabled = false; } };
  const newBtn = h('button', { class: 'btn btn-dark', onclick: () => run(newBtn, async () => {
    const rows = scope();
    const blob = await buildWorkbook(rows, (m) => fill(status, m));
    const a = h('a', { href: URL.createObjectURL(blob), download: rt('xNewFile', { date: today(), n: rows.length }) + '.xlsx' });
    document.body.append(a); a.click(); a.remove();
    fill(status, rt('xNewDone', { n: rows.length }));
  }) }, icon('download'), rt('xNew'));
  const cpSp = h('button', { class: 'btn', onclick: () => run(cpSp, async () => copyText(spTsv(scope()), rt('cpSpRowsWhat', { n: scope().length }))) }, icon('copy'), rt('cpSpRows'));
  const cpTn = h('button', { class: 'btn', onclick: () => run(cpTn, async () => copyText(await tenderTsv(scope()), rt('cpTnRowsWhat'))) }, icon('copy'), rt('cpTnRows'));
  sheet(h('h2', { class: 'card-title' }, rt('xcTitle')), h('p', { class: 'muted small' }, rt('xcLead')),
    h('h3', { class: 'card-sub' }, rt('xcScope')), pick,
    h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('xcNew')), h('p', { class: 'muted small' }, rt('xcNewHint')), h('div', { class: 'row' }, newBtn)),
    h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('xcCopy')), h('p', { class: 'muted small' }, rt('xcCopyHint')), h('div', { class: 'row' }, cpSp, cpTn)),
    h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('xcFill')), h('p', { class: 'muted small' }, rt('xcFillHint')), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => exportDialog() }, icon('upload'), rt('xcFillBtn')))),
    status);
}
