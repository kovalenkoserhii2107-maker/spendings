// Sub-project registry: the team's compliance working table (Compliance_Working_Table.xlsx)
// kept in the app, private to the people in registryAccess. The table is uploaded as it is;
// the app links each sub-project to its Prozorro procedures, reads what Prozorro says of them
// (contracts, changes, complaints, State Audit), suggests risk ratings and gives the filled
// columns back as xlsx. Uses app.js helpers (h, t, fill, money, ...). Code: pages/registry.js.

const REG = { access: undefined, rows: new Map(), meta: null, busy: null };
const RG = {
  uk: {
    nav: 'Субпроєкти', eyebrow: 'Реєстр субпроєктів ЄІБ', title1: 'Субпроєкти', title2: 'на моніторингу',
    upload: 'Завантажити таблицю', export: 'Вивантажити xlsx', refresh: 'Оновити з Prozorro', refreshing: 'Оновлення {n} з {total}…',
    imported: 'Таблиця від {at}, завантажив {by}: {n} субпроєктів', noTable: 'Таблицю ще не завантажено. Оберіть файл Compliance Working Table (.xlsx).',
    importing: 'Читаю таблицю…', saving: 'Зберігаю {n} з {total}…', importDone: 'Завантажено {n} субпроєктів, закупівель {t}',
    importBad: 'У файлі немає аркуша SPs з рядком заголовків «ID / SP status».',
    all: 'Усі', mine: 'Мої', anyExpert: 'Усі експерти', anyProgramme: 'Усі програми', search: 'Код, назва, замовник, підрядник',
    fNoLink: 'Без Prozorro', fLinked: 'З Prozorro', fRisk: 'Є ризики', fNoContract: 'Без договору',
    colCode: 'Код', colSp: 'Субпроєкт', colExpert: 'Експерт', colPz: 'Prozorro', colContract: 'Договір', colProgress: 'Виконання / оплата', colRisk: 'Ризики',
    notLinked: 'не прив’язано', candidates: 'знайдено варіантів: {n}',
    fromTable: 'З таблиці', finance: 'Фінансування', progress: 'Прогрес', procurement: 'Закупівлі в таблиці', weekly: 'Останні дії експертів',
    pz: 'Prozorro', pzHint: 'Закупівлі цього субпроєкту в Prozorro. Ідентифікатори з таблиці підтягуються самі; інші можна знайти за назвою й прив’язати.',
    findByName: 'Шукати за назвою', addId: 'Додати UA-…', link: 'Прив’язати', unlink: 'Відв’язати', linked: 'Прив’язано',
    risks: 'Підказки до матриці ризиків', risksHint: 'Підказки з Prozorro й таблиці; оцінку ставить експерт.',
    note: 'Нотатка команди', saveNote: 'Зберегти', saved: 'Збережено', payments: 'Платежі в Казначействі', loadPayments: 'Показати платежі замовника підряднику',
    paidSum: 'Сплачено {sum} ({n} платежів) з {from}', noPayments: 'Платежів не знайдено', tablePaid: 'За аркушем Payments: {sum}',
    updated: 'оновлено {at}', never: 'ще не оновлювалось', noAccess: 'Реєстр доступний лише учасникам команди.',
    sheetTender: 'Закупівля', sheetStatus: 'Статус', sheetBidders: 'Учасники', sheetContract: 'Договір', sheetPaid: 'Сплачено',
    r1: '1. Зміни договору', r2: '2. Перевірка ціни', r3: '3. Нестача фінансування', r4: '4. Затримки оплат', r5: '5. Підрядник на інших субпроєктах',
    r6: '6. Банкрутство / статус підрядника', r7: '7. Висновки ДАСУ', r8: '8. Рішення АМКУ', rx: 'Інше',
    h_changes: '{n} змін договору ({types})', h_manyChanges: 'багато змін: {n}', h_sasuViol: 'ДАСУ виявила порушення ({ids})', h_sasuActive: 'моніторинг ДАСУ триває',
    h_amcu: 'скарг до АМКУ: {n}, відкритих {open}, задоволених {sat}', h_contractorElse: 'той самий підрядник: {list}', h_contractorTrouble: 'проблеми на {list}',
    h_failed: 'невдалих тендерів: {n}', h_overdue: 'строк завершення {date} минув, виконано {pct}%', h_stale: 'коментар не оновлювався {days} дн.',
    h_funding: 'статус фінансування: {s}', h_disq: 'відхилено учасників: {n}', h_single: 'одна пропозиція', h_noContract: 'договору ще немає',
    h_paidGap: 'оплачено {paid}% при виконанні {pct}%',
    importFailed: 'не збережено: {list}',
    trackAll: 'Відстежувати все з таблиці', trackConfirm: 'Поставити на відстеження договори й закупівлі {n} показаних субпроєктів? Діючі договори — на контроль, закупівлі без договору — до підписання.',
    tracking: 'Відстеження: {n} з {total}, додано {added}…', trackDone: 'На відстеження додано {added}, уже було {already}, не вдалося {failed}',
    denied: 'Немає дозволу на запис у реєстр — перевірте, що ви увійшли акаунтом зі списку доступу.', refreshFailed: 'Не оновилось субпроєктів: {n}',
    xSheet: 'Монітор', xTenders: 'Закупівлі', paidShort: 'опл. {pct}%', subvention: 'Субвенція', subvPaid: 'сплачено {sum}', paidSheet: 'Оплачено (аркуш Payments)',
    comment: 'Коментар', next: 'Наступна дія', tableScore: 'оцінка з таблиці',
  },
  en: {
    nav: 'Sub-projects', eyebrow: 'EIB sub-project registry', title1: 'Sub-projects', title2: 'under monitoring',
    upload: 'Upload the table', export: 'Download xlsx', refresh: 'Refresh from Prozorro', refreshing: 'Refreshing {n} of {total}…',
    imported: 'Table of {at}, uploaded by {by}: {n} sub-projects', noTable: 'No table uploaded yet. Choose the Compliance Working Table file (.xlsx).',
    importing: 'Reading the table…', saving: 'Saving {n} of {total}…', importDone: '{n} sub-projects uploaded, {t} procurements',
    importBad: 'The file has no SPs sheet with an "ID / SP status" header row.',
    all: 'All', mine: 'Mine', anyExpert: 'All experts', anyProgramme: 'All programmes', search: 'Code, name, beneficiary, contractor',
    fNoLink: 'No Prozorro', fLinked: 'With Prozorro', fRisk: 'With risks', fNoContract: 'No contract',
    colCode: 'Code', colSp: 'Sub-project', colExpert: 'Expert', colPz: 'Prozorro', colContract: 'Contract', colProgress: 'Progress / paid', colRisk: 'Risks',
    notLinked: 'not linked', candidates: '{n} candidates found',
    fromTable: 'From the table', finance: 'Funding', progress: 'Progress', procurement: 'Procurements in the table', weekly: 'Latest expert actions',
    pz: 'Prozorro', pzHint: "This sub-project's procurements in Prozorro. Ids from the table come in by themselves; others can be found by name and linked.",
    findByName: 'Search by name', addId: 'Add UA-…', link: 'Link', unlink: 'Unlink', linked: 'Linked',
    risks: 'Hints for the risk matrix', risksHint: 'Hints from Prozorro and the table; the expert sets the rating.',
    note: 'Team note', saveNote: 'Save', saved: 'Saved', payments: 'Treasury payments', loadPayments: "Show the beneficiary's payments to the contractor",
    paidSum: '{sum} paid ({n} payments) since {from}', noPayments: 'No payments found', tablePaid: 'Payments sheet: {sum}',
    updated: 'updated {at}', never: 'not refreshed yet', noAccess: 'The registry is open to team members only.',
    sheetTender: 'Procurement', sheetStatus: 'Status', sheetBidders: 'Bidders', sheetContract: 'Contract', sheetPaid: 'Paid',
    r1: '1. Contract amendments', r2: '2. Cost and price', r3: '3. Funding gap', r4: '4. Payment delays', r5: '5. Contractor on other sub-projects',
    r6: '6. Contractor bankruptcy / status', r7: '7. SASU conclusions', r8: '8. AMCU decisions', rx: 'Other',
    h_changes: '{n} contract changes ({types})', h_manyChanges: 'many changes: {n}', h_sasuViol: 'SASU found a violation ({ids})', h_sasuActive: 'SASU monitoring under way',
    h_amcu: 'AMCU complaints: {n}, open {open}, upheld {sat}', h_contractorElse: 'same contractor: {list}', h_contractorTrouble: 'trouble on {list}',
    h_failed: 'failed tenders: {n}', h_overdue: 'completion date {date} passed, {pct}% done', h_stale: 'comment not updated for {days} days',
    h_funding: 'funding status: {s}', h_disq: 'bidders rejected: {n}', h_single: 'single bid', h_noContract: 'no contract yet',
    h_paidGap: '{paid}% paid at {pct}% done',
    importFailed: 'not saved: {list}',
    trackAll: 'Track everything in the table', trackConfirm: 'Put the contracts and procurements of the {n} shown sub-projects on control? Contracts in force go on control, procurements without a contract until it is signed.',
    tracking: 'Tracking: {n} of {total}, {added} added…', trackDone: '{added} added to tracking, {already} already there, {failed} failed',
    denied: 'No permission to write to the registry — check you are signed in with an account on the access list.', refreshFailed: 'Not refreshed: {n} sub-projects',
    xSheet: 'Monitor', xTenders: 'Procurements', paidShort: 'paid {pct}%', subvention: 'Subvention', subvPaid: 'paid {sum}', paidSheet: 'Paid (Payments sheet)',
    comment: 'Comment', next: 'Next action', tableScore: 'rating from the table',
  },
};
function rt(key, vars) {
  let s = (RG[LANG] || RG.uk)[key] || RG.uk[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}

// ---- access ----------------------------------------------------------------------------------

async function registryInit() {
  if (!cloud || !state.user) { REG.access = null; return; }
  REG.access = await cloud.registryAccess();
  if (REG.access) cloud.watchRegistry((r) => { REG.rows = r.rows; REG.meta = r.meta; if (location.hash.startsWith('#/registry')) softRender(); });
  softRender();
}
const hasRegistry = () => !!REG.access;

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
const normCode = (s) => String(s || '').trim().toUpperCase().replace(/[АВСЕНІКМОРТХ]/g, (c) => LATIN[c]);
const codesOf = (s) => String(s || '').split(/[\s,;]+/).map(normCode).filter((x) => /^[A-Z]{2}\d{2}[A-Z]?_\d{2}/.test(x));
const PZ_ID = /UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]/g;

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
  ['rating', /Overall Rating/],
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
  ['mods', /# of Contract Modifications/], ['paid', /^Total Amount Paid to Date/], ['paid_eib', /Paid to Date \(EIB/], ['paid_local', /Paid to Date \(Local/],
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
  for (const r of sps.slice(hi + 1)) {
    const codes = codesOf(r[col.code]);
    if (!codes.length) continue;
    const tt = { codes };
    for (const [key] of SP_COLS) if (col[key] != null && key !== 'code') { const v = cellValue(r[col[key]]); if (v != null && v !== '') tt[key] = v; }
    if (tt.pz_link) tt.pz_ids = [...new Set(String(tt.pz_link).match(PZ_ID) || [])];
    if (ca >= 0 && (r[ca] || r[ca + 1])) tt.next = { who: cellValue(r[ca]), what: cellValue(r[ca + 1]), date: cellValue(r[ca + 2]) };
    const log = [];
    for (const w of weeks) {
      const who = cellValue(r[w.i]), what = cellValue(r[w.i + 1]);
      if (who || what) log.push({ week: w.label, who, what, done: r[w.i + 2] === true || r[w.i + 2] === 'TRUE' });
    }
    if (log.length) tt.log = log.slice(-8);
    out.set(codes[0], { code: codes[0], t: tt, tenders: [], paid: null });
  }
  const byCode = (c) => out.get(c) || out.get(c.replace(/-A$/, '')) || [...out.values()].find((x) => x.t.codes.includes(c));
  let tendersN = 0;
  const tn = rowsOf('Tenders');
  if (tn) {
    const th = tn.findIndex((r) => r && String(r[0] || '').trim() === 'SP ID');
    if (th >= 0) {
      const tcol = mapHeaders(tn[th].map((x) => String(x || '').replace(/\s+/g, ' ').trim()), TN_COLS);
      for (const r of tn.slice(th + 1)) {
        const code = codesOf(r[tcol.sp])[0];
        const sp = code && byCode(code);
        if (!sp) continue;
        const row = {};
        for (const [key] of TN_COLS) if (tcol[key] != null && key !== 'sp') { const v = cellValue(r[tcol[key]]); if (v != null && v !== '' && v !== false) row[key] = v; }
        const ids = String(row.pz || '').match(PZ_ID);
        if (ids) row.pz = ids[0];
        sp.tenders.push(row);
        tendersN++;
      }
    }
  }
  const pay = rowsOf('Payments');
  if (pay) {
    for (const r of pay) {
      for (const k of [0, 4]) {
        const code = codesOf(r[k])[0];
        const sp = code && byCode(code);
        if (sp && /проплат/i.test(String(r[k + 1] || '')) && typeof r[k + 2] === 'number') sp.paid = Math.round(((sp.paid || 0) + r[k + 2]) * 100) / 100;
      }
    }
  }
  return { rows: [...out.values()], tenders: tendersN };
}

// The upload's progress lives in REG, not in the page: Firestore snapshots redraw the page
// while it goes on.
function setStatus(text, bad) {
  REG.status = text ? { text, bad: !!bad } : null;
  const el = document.getElementById('reg-status');
  if (el) fill(el, text ? h('span', { class: bad ? 'bad' : '' }, text) : '');
}
async function importFile(file) {
  if (REG.busy) return;
  REG.busy = 'import';
  try {
    setStatus(rt('importing'));
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const { rows, tenders } = parseWorkbook(XLSX, wb);
    const res = await cloud.importRegistry(rows, { file: file.name.slice(0, 200), rows: rows.length, tenders }, (n, total) => setStatus(rt('saving', { n, total })));
    const failed = (res && res.failed) || [];
    const msg = rt('importDone', { n: rows.length - failed.length, t: tenders }) + (failed.length ? ' · ' + rt('importFailed', { list: failed.slice(0, 10).join(', ') }) : '');
    setStatus(msg, failed.length > 0);
    toast(msg, failed.length ? { sticky: true } : undefined);
  } catch (e) {
    console.error('registry import', e);
    const msg = (e && e.code === 'permission-denied') ? rt('denied') : (e && e.message) || String(e);
    setStatus(msg, true);
    toast(msg, { bad: true, sticky: true });
  } finally {
    REG.busy = null;
  }
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

async function refreshSp(r) {
  const tenders = [];
  for (const tid of spTids(r)) {
    try { tenders.push((await pzProxy({ action: 'tender', tid })).tender); } catch (e) { tenders.push({ tid, error: e.message.slice(0, 200) }); }
  }
  tenders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const pz = { at: new Date().toISOString(), tenders };
  await cloud.updateRegistry(r.code, { pz, risk: riskHints(Object.assign({}, r, { pz })) });
  return pz;
}

// What of a sub-project goes on control: its signed contracts in force, and procurements
// still under way that have none yet (they turn into their contract when it is signed).
function trackPicks(pz) {
  const picks = [];
  for (const t0 of (pz && pz.tenders) || []) {
    if (t0.error || !/^\d{8,10}$/.test(t0.buyer || '')) continue;
    const active = (t0.contracts || []).filter((c) => c.status === 'active');
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
      for (const p of trackPicks(pz)) {
        if (isTracked(p.cid)) { already++; continue; }
        try { await cloud.track(p.cid, p.info); added++; } catch (e) { failed++; console.error('registry track', r.code, p.cid, e); }
      }
    }
  } finally {
    REG.busy = null;
  }
  if (added) nudgeSync();
  setStatus(rt('trackDone', { added, already, failed }), failed > 0);
  toast(rt('trackDone', { added, already, failed }), { sticky: true });
}

async function refreshMany(rows) {
  if (REG.busy) return;
  REG.busy = 'refresh';
  let n = 0, failed = 0;
  for (const r of rows) {
    n++;
    setStatus(rt('refreshing', { n, total: rows.length }));
    if (!spTids(r).length) continue;
    try { await refreshSp(r); } catch (e) { failed++; console.error('registry refresh', r.code, e); }
  }
  REG.busy = null;
  setStatus(failed ? rt('refreshFailed', { n: failed }) : '', !!failed);
}

// The works contract of a sub-project: the latest signed one of its linked procedures.
function mainContract(r) {
  const cs = [];
  for (const t0 of ((r.pz || {}).tenders || [])) for (const c of t0.contracts || []) if (c.status === 'active' || c.status === 'terminated') cs.push({ c, t0 });
  cs.sort((a, b) => (b.c.signed || '').localeCompare(a.c.signed || ''));
  return cs[0] || null;
}

// ---- risk hints ------------------------------------------------------------------------------

const daysSince = (d) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 864e5) : null);
const pctOf = (x) => (x == null ? null : x <= 1.5 ? Math.round(x * 100) : Math.round(x));
const TROUBLE = /призупин|розірв|не викону|зупинен|terminated|suspend/i;

function riskHints(r) {
  const out = {};
  const add = (k, level, text) => { (out[k] = out[k] || []).push({ level, text }); };
  const tt = r.t || {};
  const pzT = (r.pz || {}).tenders || [];
  const main = mainContract(r);
  if (main && main.c.changes) {
    const types = (main.c.change_types || []).map((x) => label('pzr.', x) || x).join(', ');
    add('r1', main.c.changes >= 5 ? 'medium' : 'low', rt('h_changes', { n: main.c.changes, types }));
  }
  for (const t0 of pzT) {
    if (t0.sasu && t0.sasu.violation) add('r7', 'high', rt('h_sasuViol', { ids: (t0.sasu.ids || []).join(', ') }));
    else if (t0.sasu && t0.sasu.active) add('r7', 'medium', rt('h_sasuActive'));
    if (t0.complaints && t0.complaints.n) add('r8', t0.complaints.open ? 'medium' : 'low', rt('h_amcu', { n: t0.complaints.n, open: t0.complaints.open, sat: t0.complaints.satisfied }));
    if (t0.disqualified) add('rx', 'low', t0.tid + ': ' + rt('h_disq', { n: t0.disqualified }));
  }
  const failed = (r.tenders || []).filter((x) => /No Bids|All Rejected|Cancel/i.test(x.status || '')).length
    + pzT.filter((x) => x.status === 'unsuccessful' && !(r.tenders || []).some((y) => y.pz === x.tid)).length;
  if (failed >= 2) add('rx', 'medium', rt('h_failed', { n: failed }));
  if (/Insufficient|Suspended/i.test(tt.funding || '')) add('r3', 'medium', rt('h_funding', { s: tt.funding }));
  const pct = pctOf(tt.pct);
  if (tt.completion && tt.completion < today() && pct != null && pct < 100) add('rx', 'high', rt('h_overdue', { date: fdate(tt.completion), pct }));
  const paidPct = pctOf(tt.paid_pct);
  if (paidPct != null && pct != null && paidPct > pct + 15) add('r4', 'medium', rt('h_paidGap', { paid: paidPct, pct }));
  const stale = daysSince(tt.upd);
  if (stale != null && stale > 30) add('rx', 'low', rt('h_stale', { days: stale }));
  // The same contractor on other sub-projects: where works stopped or contracts ended early.
  const sup = main && ((main.c.suppliers || [])[0] || {}).code;
  if (sup) {
    const others = [...REG.rows.values()].filter((x) => x.code !== r.code && (((mainContract(x) || {}).c || {}).suppliers || []).some((s) => s.code === sup));
    if (others.length) {
      add('r5', 'low', rt('h_contractorElse', { list: others.map((x) => x.code).join(', ') }));
      const bad = others.filter((x) => TROUBLE.test((x.t || {}).comment || '') || ((mainContract(x) || {}).c || {}).status === 'terminated');
      if (bad.length) add('r5', 'medium', rt('h_contractorTrouble', { list: bad.map((x) => x.code).join(', ') }));
    }
  }
  return out;
}
const RISK_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'rx'];
const worst = (risk) => { const l = Object.values(risk || {}).flat().map((x) => x.level); return l.includes('high') ? 'high' : l.includes('medium') ? 'medium' : l.length ? 'low' : null; };

// ---- list ------------------------------------------------------------------------------------

const REGF = { expert: null, programme: '', which: '', q: '', page: 0 };

function registryPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  if (!REG.access) return [h('div', { class: 'card empty section' }, rt('noAccess'))];
  if (REGF.expert == null) REGF.expert = REG.access.expert || '';
  const rows = [...REG.rows.values()];
  const status = h('span', { class: 'muted small', id: 'reg-status' }, REG.status ? h('span', { class: REG.status.bad ? 'bad' : '' }, REG.status.text) : null);
  const file = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => file.files[0] && importFile(file.files[0]) });
  const meta = REG.meta;
  const head = pageHead(rt('eyebrow'), titleGrad(rt('title1'), rt('title2')),
    meta ? rt('imported', { at: ftime(meta.at && meta.at.toDate ? meta.at.toDate().toISOString() : meta.at), by: meta.byName || '—', n: meta.rows }) : rt('noTable'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => file.click() }, icon('cloud'), rt('upload')), file,
      rows.length ? h('button', { class: 'btn', onclick: () => exportXlsx(filtered()) }, icon('download'), rt('export')) : null,
      rows.length ? h('button', { class: 'btn', onclick: () => refreshMany(filtered()) }, icon('refresh'), rt('refresh')) : null,
      rows.length ? h('button', { class: 'btn btn-dark', onclick: () => { const list = filtered(); if (confirm(rt('trackConfirm', { n: list.length }))) trackAll(list); } }, icon('star'), rt('trackAll')) : null, status));
  if (!rows.length) return [head];
  const experts = [...new Set(rows.map((r) => (r.t || {}).expert).filter(Boolean))].sort();
  const progs = [...new Set(rows.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  const tests = {
    nolink: (r) => !spTids(r).length, linked: (r) => spTids(r).length > 0,
    risk: (r) => ['high', 'medium'].includes(worst(r.risk)), nocontract: (r) => !mainContract(r),
  };
  function filtered() {
    const words = REGF.q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const tt = r.t || {};
      if (REGF.expert && tt.expert !== REGF.expert) return false;
      if (REGF.programme && tt.programme !== REGF.programme) return false;
      if (REGF.which && !tests[REGF.which](r)) return false;
      if (words.length) {
        const m = mainContract(r);
        const text = [r.code, tt.name_uk, tt.name_en, tt.beneficiary, tt.contractor, m && (m.c.suppliers || []).map((s) => s.name + ' ' + s.code).join(' ')].join(' ').toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }
  const list = h('div');
  const draw = () => pagedList(list, filtered(), REGF.page, { noSum: true }, (p) => { REGF.page = p; draw(); }, registryTable);
  const set = (k) => (e) => { REGF[k] = e.target.value; REGF.page = 0; draw(); };
  const q = h('input', { class: 'input', type: 'search', value: REGF.q, placeholder: rt('search'), 'aria-label': rt('search'), oninput: () => { REGF.q = q.value; REGF.page = 0; draw(); } });
  draw();
  return [head, h('div', { class: 'table-card section' },
    h('div', { class: 'table-tools' },
      pills([['', rt('all')], ['nolink', rt('fNoLink')], ['linked', rt('fLinked')], ['nocontract', rt('fNoContract')], ['risk', rt('fRisk')]], REGF.which, (v) => { REGF.which = v; REGF.page = 0; draw(); }),
      select([['', rt('anyExpert')]].concat(experts.map((x) => [x, x])), REGF.expert, set('expert'), rt('colExpert')),
      select([['', rt('anyProgramme')]].concat(progs.map((x) => [x, x])), REGF.programme, set('programme'), 'Programme'),
      q),
    list)];
}

function riskChips(risk) {
  const items = RISK_KEYS.flatMap((k) => ((risk || {})[k] || []).map((x) => ({ k, level: x.level, text: x.text })));
  if (!items.length) return h('span', { class: 'faint' }, '—');
  const top = items.sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level)).slice(0, 2);
  return [top.map((x) => h('div', { class: 'small' }, h('span', { class: 'sev ' + x.level }, rt(x.k).replace(/^\d\.\s*/, '')), ' ', x.text)), items.length > 2 ? h('div', { class: 'faint small' }, '+' + (items.length - 2)) : null];
}

function registryTable(rows) {
  if (!rows.length) return h('div', { class: 'empty' }, t('qs.none'));
  const L = { c: rt('colCode'), s: rt('colSp'), e: rt('colExpert'), p: rt('colPz'), k: rt('colContract'), g: rt('colProgress'), r: rt('colRisk') };
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null, [L.c, L.s, L.e, L.p, L.k, L.g, L.r].map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => {
      const tt = r.t || {};
      const m = mainContract(r);
      const tids = spTids(r);
      const last = ((r.pz || {}).tenders || [])[0];
      const open = () => { location.hash = '#/registry/' + encodeURIComponent(r.code); };
      return h('tr', { class: 'click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
        td(L.c, { class: 'num' }, h('b', null, r.code), h('div', { class: 'cell-sub' }, join([tt.programme, tt.batch && 'B' + tt.batch]))),
        td(L.s, { class: 'w-text' }, h('div', { class: 'clamp' }, tt.name_uk || tt.name_en || '—'), h('div', { class: 'cell-sub clamp1' }, tt.beneficiary || '')),
        td(L.e, null, tt.expert || '—'),
        td(L.p, null, tids.length ? [h('div', { class: 'cell-main num' }, tids.length > 1 ? `${tids.length} × UA-…` : tids[0]), last ? pzStatus(last.status) : h('span', { class: 'faint small' }, rt('never')),
          trackPicks(r.pz).some((p) => isTracked(p.cid)) ? h('span', { class: 'tag pz' }, t('tr.onControl')) : null]
          : h('span', { class: 'tag' }, rt('notLinked'))),
        td(L.k, { class: 'w-party' }, m ? [h('div', { class: 'cell-main' }, ((m.c.suppliers || [])[0] || {}).name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null]))]
          : tt.contractor ? tt.contractor : h('span', { class: 'faint' }, '—')),
        td(L.g, { class: 'num' }, join([pctOf(tt.pct) != null ? pctOf(tt.pct) + '%' : null, pctOf(tt.paid_pct) != null ? rt('paidShort', { pct: pctOf(tt.paid_pct) }) : null]) || '—'),
        td(L.r, null, riskChips(r.risk)));
    }))));
}

// ---- one sub-project ------------------------------------------------------------------------

function registryCard(code) {
  const r = REG.rows.get(code) || [...REG.rows.values()].find((x) => x.code === code);
  if (!REG.access) return registryPage();
  if (!r) return [h('div', { class: 'card empty section' }, REG.rows.size ? t('pz.notFound') : t('ui.loading'))];
  const tt = r.t || {};
  const back = h('a', { class: 'btn btn-sm', href: '#/registry' }, '← ' + rt('nav'));
  const head = h('div', { class: 'org-head section' },
    h('div', null,
      h('div', { class: 'eyebrow' }, join([r.code, tt.programme, tt.batch && 'Batch ' + tt.batch, tt.office])),
      h('h1', { class: 'org-title' }, tt.name_uk || tt.name_en || r.code),
      tt.name_uk && tt.name_en ? h('p', { class: 'muted' }, tt.name_en) : null,
      h('div', { class: 'chips' }, tt.expert ? h('span', { class: 'tag' }, tt.expert) : null, tt.funding ? h('span', { class: 'tag' }, tt.funding) : null,
        worst(r.risk) ? h('span', { class: 'sev ' + worst(r.risk) }, rt('colRisk')) : null)),
    h('div', { class: 'org-actions' }, h('div', { class: 'row' }, back, tt.dream ? ext(/^http/.test(tt.dream) ? tt.dream : dreamUrl(tt.dream.match(/DREAM-UA-\S+/) ? tt.dream.match(/DREAM-UA-\S+/)[0] : tt.dream), 'DREAM', 'btn') : null)));
  return [head,
    h('div', { class: 'grid-2 section' }, tableCard(r), risksCard(r)),
    pzCard(r),
    (r.tenders || []).length ? sheetTendersCard(r) : null,
    paymentsCard(r),
    noteCard(r)];
}

function tableCard(r) {
  const tt = r.t || {};
  const pct = (x) => (x == null ? null : pctOf(x) + '%');
  return h('div', { class: 'card pad' },
    h('h2', { class: 'card-title' }, rt('fromTable')),
    kv([
      [t('eib.buyer'), join([tt.beneficiary, tt.beneficiary_id])],
      [rt('finance'), join([tt.invest_eur != null ? 'Invest ' + ni.format(tt.invest_eur) + ' €' : null, tt.eib_eur != null ? 'EIB ' + ni.format(tt.eib_eur) + ' €' : null])],
      [rt('subvention'), join([tt.subv_year != null ? money(tt.subv_year) : null, tt.subv_paid != null ? rt('subvPaid', { sum: money(tt.subv_paid) }) : null, tt.subv_util != null ? pct(tt.subv_util) : null])],
      [rt('progress'), join([tt.start ? fdate(tt.start) : null, tt.completion ? '→ ' + fdate(tt.completion) : null, tt.pct != null ? pct(tt.pct) : null])],
      [rt('paidSheet'), r.paid != null ? money(r.paid) : null],
      [rt('comment'), tt.comment ? h('div', null, tt.comment, tt.upd ? h('div', { class: 'cell-sub' }, fdate(tt.upd)) : null) : null],
      [rt('next'), tt.next ? join([tt.next.who, tt.next.what, tt.next.date && fdate(tt.next.date)]) : null],
    ]),
    (tt.log || []).length ? [h('h3', { class: 'card-sub', style: 'margin-top:12px' }, rt('weekly')),
      h('div', { class: 'explain' }, tt.log.slice().reverse().map((x) => h('div', null, h('b', null, x.week.replace(/\s*\(.*/, '') + ' · '), join([x.who, x.what]), x.done ? ' ✓' : '')))] : null);
}

function risksCard(r) {
  const tt = r.t || {};
  return h('div', { class: 'card pad' },
    h('h2', { class: 'card-title' }, rt('risks')), h('p', { class: 'muted small' }, rt('risksHint')),
    h('div', { class: 'checklist' }, RISK_KEYS.map((k) => {
      const items = (r.risk || {})[k] || [];
      const score = k !== 'rx' ? tt[k] : null;
      if (k === 'rx' && !items.length) return null;
      // No hint and no rating in the table: nothing known, not "fine".
      const lv = items.some((x) => x.level === 'high') ? 'bad' : items.some((x) => x.level === 'medium') ? 'warn' : items.length ? 'warn' : score != null ? 'ok' : 'na';
      return h('div', { class: 'chk ' + lv },
        h('span', { class: 'chk-ico', title: score != null ? rt('tableScore') : '' }, score != null ? String(score) : items.length ? '!' : '–'),
        h('div', null, h('b', null, rt(k)), h('div', { class: 'small muted' }, items.length ? items.map((x) => x.text).join(' · ') : '—')));
    })));
}

function pzCard(r) {
  const box = h('div');
  const status = h('span', { class: 'muted small' });
  const tids = spTids(r);
  const pz = r.pz || {};
  const linkIds = (r.link && r.link.tids) || [];
  const off = (r.link && r.link.off) || [];
  const save = (tidsNew, offNew) => cloud.updateRegistry(r.code, { link: { tids: tidsNew, off: offNew } });
  const byTid = Object.fromEntries((pz.tenders || []).map((x) => [x.tid, x]));
  const tenderBlock = (tid) => {
    const t0 = byTid[tid];
    const org = t0 ? { edrpou: t0.buyer, name: t0.buyer_name, role: 'buyer' } : null;
    return h('div', { class: 'qs-row' },
      h('div', null,
        h('b', null, t0 ? t0.title : tid),
        h('div', { class: 'cell-sub' }, join([tid, t0 && label('pzs.', t0.status), t0 && label('pzt.', t0.method), t0 && t0.value ? money(t0.value.amount, t0.value.currency) : null,
          t0 && t0.bids != null ? t('pz.bids') + ': ' + t0.bids : null, t0 && t0.date ? fdate(t0.date) : null])),
        t0 && t0.error ? h('div', { class: 'small bad' }, t0.error) : null,
        t0 ? h('div', { class: 'chips', style: 'margin:6px 0 0' },
          t0.sasu && t0.sasu.n ? h('span', { class: 'sev ' + (t0.sasu.violation ? 'high' : 'medium') }, 'ДАСУ ' + (t0.sasu.violation ? '⚠' : '…')) : null,
          t0.complaints && t0.complaints.n ? h('span', { class: 'sev medium' }, 'АМКУ ' + t0.complaints.n) : null,
          t0.dream_id ? ext(dreamUrl(t0.dream_id), 'DREAM') : null) : null,
        t0 && (t0.contracts || []).length ? h('div', { class: 'qs-contracts' }, t0.contracts.map((c) => h('div', { class: 'qs-contract' },
          h('div', null, h('b', null, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
            h('div', { class: 'cell-sub' }, join([(c.suppliers || []).map((x) => party(x.name, x.code)).join(', '), c.value ? money(c.value.amount, c.value.currency) : null, label('pzc.', c.status),
              c.end ? '→ ' + fdate(c.end) : null, c.changes ? t('eib.changes') + ': ' + c.changes : null]))),
          c.status !== 'cancelled' && org ? trackButton(org, t0, c) : null))) : null),
      h('div', { class: 'qs-side' }, ext(pzUrl(tid), 'Prozorro'),
        h('button', { class: 'btn btn-sm', onclick: () => save(linkIds.filter((x) => x !== tid), [...new Set(off.concat(tid))]) }, rt('unlink'))));
  };
  const find = h('div');
  const idInput = h('input', { class: 'input', placeholder: 'UA-2026-01-01-000000-a', 'aria-label': rt('addId') });
  const searchByName = async () => {
    const tt = r.t || {};
    const q = objectName(tt.name_uk || '').split(/\s+/).slice(0, 12).join(' ');
    if (q.length < 12) { fill(find, h('p', { class: 'muted small' }, t('qs.none'))); return; }
    fill(find, h('p', { class: 'muted small' }, t('ui.loading')));
    try {
      const d = await pzProxy({ action: 'search', kind: 'tenders', text: q });
      const items = (d.items || []).filter((x) => !tids.includes(x.tid));
      fill(find, items.length ? h('div', { class: 'qs-list' }, items.map((x) => h('div', { class: 'qs-row' },
        h('div', null, h('b', null, x.title), h('div', { class: 'cell-sub' }, join([x.tid, x.buyer_name, label('pzs.', x.status), x.value ? money(x.value.amount, x.value.currency) : null]))),
        h('div', { class: 'qs-side' }, ext(pzUrl(x.tid), 'Prozorro'), h('button', { class: 'btn btn-sm btn-dark', onclick: () => save([...new Set(linkIds.concat(x.tid))], off.filter((y) => y !== x.tid)) }, rt('link'))))))
        : h('p', { class: 'muted small' }, t('qs.none')));
    } catch (e) { fill(find, h('p', { class: 'small bad' }, e.message)); }
  };
  fill(box, tids.length ? h('div', { class: 'qs-list' }, tids.map(tenderBlock)) : h('p', { class: 'muted small' }, rt('notLinked')));
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('pz')),
      h('div', { class: 'row' }, h('span', { class: 'faint small' }, pz.at ? rt('updated', { at: ftime(pz.at) }) : rt('never')),
        tids.length ? h('button', { class: 'btn btn-sm btn-dark', onclick: async (e) => { e.target.disabled = true; fill(status, t('ui.loading')); try { await refreshSp(r); fill(status, ''); } catch (err) { fill(status, err.message); e.target.disabled = false; } } }, icon('refresh'), rt('refresh')) : null, status)),
    h('p', { class: 'muted small' }, rt('pzHint')),
    box,
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn btn-sm', onclick: searchByName }, icon('search'), rt('findByName')),
      idInput, h('button', { class: 'btn btn-sm', onclick: () => {
        const id = (idInput.value.match(PZ_ID) || [])[0];
        if (id) save([...new Set(linkIds.concat(id))], off.filter((y) => y !== id));
      } }, rt('addId'))),
    find);
}

function sheetTendersCard(r) {
  return h('div', { class: 'table-card section' },
    h('div', { class: 'table-tools' }, h('b', null, rt('procurement'))),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('sheetTender'), rt('sheetStatus'), rt('sheetBidders'), rt('sheetContract'), rt('sheetPaid')].map((x) => h('th', null, x)))),
      h('tbody', null, r.tenders.map((x) => h('tr', null,
        td(rt('sheetTender'), { class: 'w-text' }, h('div', { class: 'clamp' }, x.name || '—'), h('div', { class: 'cell-sub num' }, join([x.pz ? h('a', { href: pzUrl(x.pz), target: '_blank', rel: 'noopener noreferrer' }, x.pz) : null, x.kind, x.method]))),
        td(rt('sheetStatus'), null, join([x.status, x.issued && fdate(x.issued), x.opening && '→ ' + fdate(x.opening)])),
        td(rt('sheetBidders'), { class: 'w-text' }, join([x.bidders_n, x.bidders && String(x.bidders).replace(/\n/g, ', ')])),
        td(rt('sheetContract'), { class: 'w-party' }, join([x.contractor, x.contract_no && '№ ' + x.contract_no, x.contract_total != null ? money(x.contract_total) : null])),
        td(rt('sheetPaid'), { class: 'num' }, x.paid != null ? money(x.paid) : '—')))))));
}

function paymentsCard(r) {
  const box = h('div');
  const m = mainContract(r);
  if (!m) return null;
  const sup = (m.c.suppliers || [])[0] || {};
  const run = async () => {
    fill(box, h('p', { class: 'muted small' }, t('ui.loading')));
    try {
      const from = m.c.signed || addDays(today(), -365);
      const out = [];
      for (let a = from; a <= today(); a = addDays(a, 92)) {
        const b = addDays(a, 91) < today() ? addDays(a, 91) : today();
        out.push(...((await portal('/v2/api/transactions/', { payers_edrpous: m.t0.buyer, recipt_edrpous: sup.code, startdate: a, enddate: b })) || []));
      }
      const sum = out.reduce((s, x) => s + Number(x.amount || 0), 0);
      fill(box, out.length ? [h('p', { class: 'small' }, rt('paidSum', { sum: money(sum), n: out.length, from: fdate(from) })),
        h('div', { class: 'explain' }, out.sort((a, b) => (a.trans_date || '').localeCompare(b.trans_date || '')).map((x) => h('div', null,
          h('span', { class: 'num' }, fdate((x.trans_date || '').slice(0, 10)) + ' · ' + money(Number(x.amount || 0))), h('span', { class: 'faint small' }, ' · ' + String(x.payment_details || '').slice(0, 200)))))]
        : h('p', { class: 'muted small' }, rt('noPayments')));
    } catch (e) { fill(box, h('p', { class: 'small bad' }, e.message)); }
  };
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('payments')), r.paid != null ? h('span', { class: 'faint small' }, rt('tablePaid', { sum: money(r.paid) })) : null),
    sup.code ? h('button', { class: 'btn btn-sm', onclick: run }, icon('money'), rt('loadPayments')) : null, box);
}

function noteCard(r) {
  const area = h('textarea', { class: 'input', rows: 3, style: 'width:100%;min-height:80px;padding:10px', maxlength: 4000 });
  area.value = r.note || '';
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('note')), r.updatedByName ? h('span', { class: 'faint small' }, join([r.updatedByName, r.updatedAt && r.updatedAt.toDate ? ftime(r.updatedAt.toDate().toISOString()) : null])) : null),
    area, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn btn-sm btn-dark', onclick: async () => { await cloud.updateRegistry(r.code, { note: area.value.slice(0, 4000) }); toast(rt('saved')); } }, rt('saveNote'))));
}

// ---- xlsx out ---------------------------------------------------------------------------------

async function exportXlsx(rows) {
  const XLSX = await loadXlsx();
  const head = ['SP ID', 'Sub-Project Name (UKR)', 'UNDP TA specialists', 'Promoter ID (Prozorro)', 'Prozorro Link', 'Status of the procedure (Prozorro)', '## of tenders',
    'AMCU Complaints', 'SASU Monitoring', 'Contractor', 'Contractor ID', 'Contract Number', 'Сума договору', 'Дата укладення договору', 'Дата завершення (договір)',
    '# of Contract Modifications', 'Risk hints', 'Prozorro checked'];
  const data = [head].concat(rows.map((r) => {
    const tt = r.t || {};
    const pzT = (r.pz || {}).tenders || [];
    const m = mainContract(r);
    const sup = m ? (m.c.suppliers || [])[0] || {} : {};
    const sasu = pzT.some((x) => x.sasu && x.sasu.violation) ? 'Negative' : pzT.some((x) => x.sasu && x.sasu.active) ? 'Ongoing' : pzT.some((x) => x.sasu && x.sasu.n) ? 'Positive' : '';
    const amcu = pzT.reduce((s, x) => s + ((x.complaints || {}).n || 0), 0);
    const hints = RISK_KEYS.flatMap((k) => ((r.risk || {})[k] || []).map((x) => rt(k).replace(/^(\d)\..*/, '$1') + ': ' + x.text)).join('; ');
    return [r.code, tt.name_uk || '', tt.expert || '', (pzT[0] || {}).buyer || '', spTids(r).map((x) => 'https://prozorro.gov.ua/tender/' + x).join('\n'),
      pzT[0] ? label('pzs.', pzT[0].status) : '', spTids(r).length || '', amcu || '', sasu, sup.name || '', sup.code || '', m ? m.c.number || '' : '',
      m && m.c.value ? m.c.value.amount : '', m ? m.c.signed || '' : '', m ? m.c.end || '' : '', m ? m.c.changes || 0 : '', hints, (r.pz || {}).at ? (r.pz.at || '').slice(0, 10) : ''];
  }));
  const tn = [['SP ID', 'Prozorro ID', 'Title', 'Status', 'Method', 'Value', 'Bids', 'Disqualified', 'AMCU', 'SASU', 'Contract', 'Contractor', 'Contractor ID', 'Signed', 'End', 'Contract value', 'Changes']];
  rows.forEach((r) => ((r.pz || {}).tenders || []).forEach((x) => {
    const cs = (x.contracts || []).length ? x.contracts : [null];
    cs.forEach((c) => tn.push([r.code, x.tid, x.title || '', label('pzs.', x.status) || x.status || '', label('pzt.', x.method) || '', x.value ? x.value.amount : '', x.bids != null ? x.bids : '',
      x.disqualified || '', (x.complaints || {}).n || '', x.sasu ? (x.sasu.violation ? 'violation' : x.sasu.active ? 'ongoing' : x.sasu.n ? 'done' : '') : '',
      c ? c.number || '' : '', c ? ((c.suppliers || [])[0] || {}).name || '' : '', c ? ((c.suppliers || [])[0] || {}).code || '' : '', c ? c.signed || '' : '', c ? c.end || '' : '',
      c && c.value ? c.value.amount : '', c ? c.changes || 0 : '']));
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), rt('xSheet'));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tn), rt('xTenders'));
  XLSX.writeFile(wb, 'registry-' + today() + '.xlsx');
}
