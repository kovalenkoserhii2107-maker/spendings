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
    importFailed: 'не збережено: {list}', gTitle: 'Банківські гарантії', gHint: 'Гарантії договору: строк і сума; за 30 днів до кінця строку — нагадування експерту.', gKind: 'Вид', gBank: 'Банк', gNumber: 'Номер', gAmount: 'Сума', gUntil: 'Діє до',
    g_performance: 'Виконання договору', g_advance: 'Повернення авансу', g_bid: 'Тендерна пропозиція', g_warranty: 'Гарантійний період', gNone: 'Гарантій ще не внесено.', gClose: 'Закрити', gReopen: 'Відкрити',
    gSt_expired: 'строк минув', gSt_soon: 'спливає через {n} дн.', gSt_closed: 'закрито', gExpiring: 'Гарантія «{kind}» {bank} спливає {date}', gExpired: 'Гарантія «{kind}» {bank} спливла {date}', workTitle: 'Робота експерта', tasks: 'Завдання', journal: 'Журнал дій', taskWhat: 'Що зробити', taskDue: 'До якої дати', taskWho: 'Хто', taskDone: 'Виконано',
    noTasks: 'Завдань немає.', noLog: 'Записів ще немає.', add: 'Додати', remove: 'Прибрати', logDate: 'Дата', logKind: 'Дія', logWhat: 'Що зроблено', logDone: 'виконано', fromSheet: 'з таблиці',
    kind_VISIT: 'VISIT — виїзд на об’єкт', kind_PROCUREMENT_ANALYSE: 'PROCUREMENT ANALYSE — аналіз закупівлі', kind_COST_VERIFICATION: 'COST VERIFICATION — перевірка вартості',
    kind_CONSULTING: 'CONSULTING — консультування', kind_RISK_MANAGEMENT: 'RISK MANAGEMENT — управління ризиками', kind_EX_POST_REVIEW: 'EX-POST REVIEW — перевірка після', kind_other: 'Інше',
    xTitle: 'Вивантажити в робочу таблицю', xLead: 'Монітор бере ваш файл і вписує свої дані лише в клітинки без формул: аркуші, колонки, назви, формули, списки, оформлення й посилання лишаються ті самі. Оцінки ризиків з монітора й записи журналу йдуть як є; дані Prozorro — за обраним правилом. Excel перерахує формули при відкритті.',
    xMode_blank: 'Лише доповнити', xMode_blankHint: 'Дані Prozorro вписуються тільки в порожні клітинки; заповнене вами лишається.',
    xMode_update: 'Оновити з Prozorro', xMode_updateHint: 'Статуси, дати, учасники, договір, АМКУ й ДАСУ замінюються свіжими з Prozorro, якщо відрізняються.',
    xSaved: 'Заповнити «{name}» (завантажено {at})', xNoSaved: 'На цьому пристрої таблицю ще не завантажували — оберіть файл.', xPick: 'Обрати файл таблиці',
    xWorking: 'Заповнюю таблицю…', xReading: 'Читаю дані договорів на контролі…', xDone: 'Готово: вписано клітинок — {n}. Файл завантажено.',
    xRows: 'Субпроєктів у файлі: {sp}; закупівель із даними Prozorro: {tn}; тижнів журналу: {w}.', xKept: 'Не змінено: заповнених вами — {kept}, з формулами — {formula}.',
    xMissing: 'Немає у файлі ({n}): {list}', xNoWeek: 'Записів журналу без свого тижня в таблиці: {n}.',
    mark_td: 'ТД перевірено', mark_assist: 'Супровід', mark_monitor: 'Моніторинг', markHint: 'Відмітка команди (стовпці TD Checking / Tender Assistance / Tender Monitoring)', xJournal: 'Журнал', xTasks: 'Завдання', overall: 'Загальна оцінка: {n}', overallHint: 'За формулою робочої таблиці (стовпець M)', acceptHints: 'Прийняти підказки ({n})', from_own: 'оцінка експерта', from_table: 'з таблиці', from_hint: 'підказка — не прийнята', from_none: 'немає даних', orphans: 'Виплати в Payments без рядка в SPs: {list}', thousand: 'тис. грн', subvTitle: 'Субвенція за розпорядженням КМУ', subvBudgetTitle: 'Субвенція громаді за програмою {prog}', subvBudgetNote: 'Цю програму КМУ розподіляє лише по громадах: сума — на всі її проєкти в громаді.', subvOrder: 'Розпорядження № {n}', subvResolution: 'Постанова № {n}', subvOriginal: 'Початково, {date}', subvEdition: 'Ред. {date}',
    adeqTitle: 'Достатність субвенції цього року', adeqTable: 'у таблиці: {s}', adeqTableNeed: 'Додаткова потреба за таблицею', adeqNoTracked: 'У таблиці: {s}. Щоб монітор оцінив сам, відстежуйте договори субпроєкту.',
    adeqDiff: 'Таблиця каже «{table}», за даними монітора — «{ours}». Варто перевірити.', adeqHint: 'Сума за відстежуваними договорами субпроєкту ({n}): прогноз робіт до 31 грудня на частку кредиту проти залишку субвенції.',
    subvTableEmpty: 'У таблиці субвенцію на рік не заповнено; за чинною редакцією розпорядження — {order}.',
    subvTableDiff: 'У таблиці субвенція на рік {table}, у чинній редакції розпорядження — {order}.', h_subvDropped: 'проєкт вилучено з розподілу субвенції (ред. {date})', h_subvToken: 'субвенцію зменшено з {from} до символічної 1 тис. (ред. {date})', h_subvTokenOnly: 'у розподілі лише символічна 1 тис. (ред. {date})', h_subvCut: 'субвенцію зменшено з {from} до {to} (ред. {date})', autoLinked: 'прив’язано автоматично', candTitle: 'Можливі закупівлі за назвою', candHint: 'Знайдено за назвою субпроєкту; прив’яжіть ті, що стосуються його.',
    refreshDone: 'Оновлено: з ID у таблиці {linked}, знайдено за назвою {auto}, є варіанти для підтвердження {cand}, не знайдено {none}, лише англ. назва {noName}', refreshN: 'Оновити з Prozorro ({n})', pickExpert: 'Оберіть експерта: оновлюються лише його субпроєкти',
    trackAll: 'Відстежувати мої з таблиці ({n})', trackConfirm: 'Поставити на відстеження договори й закупівлі ваших {n} субпроєктів? Діючі договори — на контроль, закупівлі без договору — до підписання.',
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
    importFailed: 'not saved: {list}', gTitle: 'Bank guarantees', gHint: "The contract's guarantees: term and amount; the expert is reminded 30 days before the end.", gKind: 'Kind', gBank: 'Bank', gNumber: 'Number', gAmount: 'Amount', gUntil: 'Valid until',
    g_performance: 'Performance', g_advance: 'Advance repayment', g_bid: 'Bid security', g_warranty: 'Warranty period', gNone: 'No guarantees entered yet.', gClose: 'Close', gReopen: 'Reopen',
    gSt_expired: 'expired', gSt_soon: 'ends in {n} days', gSt_closed: 'closed', gExpiring: '{kind} guarantee {bank} ends {date}', gExpired: '{kind} guarantee {bank} ended {date}', workTitle: "Expert's work", tasks: 'Tasks', journal: 'Activity log', taskWhat: 'What to do', taskDue: 'Due', taskWho: 'Who', taskDone: 'Done',
    noTasks: 'No tasks.', noLog: 'No entries yet.', add: 'Add', remove: 'Remove', logDate: 'Date', logKind: 'Action', logWhat: 'What was done', logDone: 'done', fromSheet: 'from the table',
    kind_VISIT: 'VISIT', kind_PROCUREMENT_ANALYSE: 'PROCUREMENT ANALYSE', kind_COST_VERIFICATION: 'COST VERIFICATION',
    kind_CONSULTING: 'CONSULTING', kind_RISK_MANAGEMENT: 'RISK MANAGEMENT', kind_EX_POST_REVIEW: 'EX-POST REVIEW', kind_other: 'Other',
    xTitle: 'Export to the working table', xLead: "The monitor takes your file and writes its data only into cells without formulas: sheets, columns, names, formulas, lists, formatting and links stay the same. The monitor's risk ratings and journal go in as they are; Prozorro data by the rule you choose. Excel recalculates the formulas on opening.",
    xMode_blank: 'Fill in only', xMode_blankHint: 'Prozorro data go only into empty cells; what you filled in stays.',
    xMode_update: 'Update from Prozorro', xMode_updateHint: 'Statuses, dates, bidders, contract, AMCU and SASU are replaced with fresh Prozorro data where they differ.',
    xSaved: 'Fill in “{name}” (uploaded {at})', xNoSaved: 'No table uploaded on this device yet: pick the file.', xPick: 'Pick the table file',
    xWorking: 'Filling in the table…', xReading: 'Reading the contracts on control…', xDone: 'Done: {n} cells written. The file is downloaded.',
    xRows: 'Sub-projects in the file: {sp}; procurements with Prozorro data: {tn}; journal weeks: {w}.', xKept: 'Left as they are: filled in by you {kept}, with formulas {formula}.',
    xMissing: 'Not in the file ({n}): {list}', xNoWeek: 'Journal entries with no week of their own in the table: {n}.',
    mark_td: 'TD checked', mark_assist: 'Assistance', mark_monitor: 'Monitoring', markHint: "The team's mark (TD Checking / Tender Assistance / Tender Monitoring columns)", xJournal: 'Journal', xTasks: 'Tasks', overall: 'Overall rating: {n}', overallHint: 'By the working table formula (column M)', acceptHints: 'Accept hints ({n})', from_own: "expert's rating", from_table: 'from the table', from_hint: 'hint — not accepted', from_none: 'no data', orphans: 'Payments with no row in SPs: {list}', thousand: 'thousand UAH', subvTitle: 'Subvention by the CMU order', subvBudgetTitle: 'Subvention to the community under {prog}', subvBudgetNote: 'The CMU spreads this programme by community only: the amount covers all its projects there.', subvOrder: 'Order No. {n}', subvResolution: 'Resolution No. {n}', subvOriginal: 'Original, {date}', subvEdition: 'Ed. {date}',
    adeqTitle: "This year's subvention adequacy", adeqTable: 'table: {s}', adeqTableNeed: 'Additional needs per the table', adeqNoTracked: 'Table: {s}. Track the sub-project\'s contracts for the monitor to estimate it.',
    adeqDiff: 'The table says “{table}”, the monitor\'s data say “{ours}”. Worth checking.', adeqHint: "Sum over the sub-project's tracked contracts ({n}): works forecast to 31 December times the loan share, against the subvention left.",
    subvTableEmpty: 'The table has no subvention for the year; the order in force has {order}.',
    subvTableDiff: 'The table has {table} of subvention for the year; the order in force has {order}.', h_subvDropped: 'project dropped from the subvention (ed. {date})', h_subvToken: 'subvention cut from {from} to a token 1 thousand (ed. {date})', h_subvTokenOnly: 'only a token 1 thousand in the order (ed. {date})', h_subvCut: 'subvention cut from {from} to {to} (ed. {date})', autoLinked: 'linked automatically', candTitle: 'Possible procurements by name', candHint: 'Found by the sub-project name; link the ones that belong to it.',
    refreshDone: 'Refreshed: with ids in the table {linked}, found by name {auto}, candidates to confirm {cand}, not found {none}, English name only {noName}', refreshN: 'Refresh from Prozorro ({n})', pickExpert: 'Choose an expert: only their sub-projects are refreshed',
    trackAll: 'Track mine from the table ({n})', trackConfirm: 'Put the contracts and procurements of your {n} sub-projects on control? Contracts in force go on control, procurements without a contract until it is signed.',
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
  loadSubvention().then(() => { if (location.hash.startsWith('#/registry')) softRender(); });
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
  ['amcu_td_status', /^Complaint Review Status/], ['amcu_eval_status', /^Complaint Review Status/], ['contract_link', /^Link to the Contract/], ['paid', /^Total Amount Paid to Date/], ['paid_eib', /Paid to Date \(EIB/], ['paid_local', /Paid to Date \(Local/],
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
    const tt = { codes, _row: sps.indexOf(r) + 1 };
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
async function importFile(file) {
  if (REG.busy) return;
  REG.busy = 'import';
  try {
    setStatus(rt('importing'));
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const { rows, tenders, orphans } = parseWorkbook(XLSX, wb);
    // The file itself stays on this device: the export fills it in, cell by cell.
    idbPut('template', { name: file.name, at: new Date().toISOString(), bytes: buf });
    const res = await cloud.importRegistry(rows, { file: file.name.slice(0, 200), rows: rows.length, tenders, orphans }, (n, total) => setStatus(rt('saving', { n, total })));
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
  if (!tids.length && !((r.link || {}).off || []).length) {
    const found = await findByName(r);
    if (found) {
      cand = found.cand;
      if (found.auto.length) { tids = found.auto; link = { tids: found.auto, off: [], auto: found.auto }; }
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
  toast(msg, { sticky: true });
}

// The works contract of a sub-project: the latest signed one of its linked procedures.
function mainContract(r) {
  const cs = [];
  for (const t0 of ((r.pz || {}).tenders || [])) for (const c of t0.contracts || []) if (c.status === 'active' || c.status === 'terminated') cs.push({ c, t0 });
  cs.sort((a, b) => (b.c.signed || '').localeCompare(a.c.signed || ''));
  return cs[0] || null;
}

// ---- risk hints ------------------------------------------------------------------------------

// Paid share of the contract: the table's own figure, else what the Payments sheet says was paid
// for the works over the contract price (Prozorro, or the table's).
function paidShare(r) {
  const tt = r.t || {};
  if (tt.paid_pct != null) return pctOf(tt.paid_pct);
  const m = mainContract(r);
  const value = (m && m.c.value && m.c.value.amount) || tt.contract_value || tt.contract_sum;
  return r.paid != null && value ? Math.round((r.paid / value) * 100) : null;
}

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
  const paidPct = paidShare(r);
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
const SCORE_KEYS = RISK_KEYS.slice(0, 8);
// Weights of the risk matrix (row 14 of the SPs sheet).
const WEIGHT = { r1: 1, r2: 1.5, r3: 1.5, r4: 1.5, r5: 1, r6: 1, r7: 1.5, r8: 1 };

// A rating 1–3 suggested from the hints, only where the app has something to judge by; price
// checks (2) and the contractor's legal status (6) stay with the expert.
function suggestedScores(r) {
  const risk = allRisk(r), tt = r.t || {};
  const read = !!(r.pz && r.pz.at);
  const known = { r1: !!mainContract(r), r3: !!subvMatch(r) || !!tt.funding, r4: paidShare(r) != null, r5: !!mainContract(r), r7: read, r8: read };
  const out = {};
  for (const k of SCORE_KEYS) {
    const items = risk[k] || [];
    out[k] = items.some((x) => x.level === 'high') ? 3 : items.some((x) => x.level === 'medium') ? 2 : known[k] ? 1 : null;
  }
  return out;
}
// The rating in use for each criterion: set in the app, else the table's, else the suggestion.
function scoresOf(r) {
  const tt = r.t || {}, own = r.scores || {}, sug = suggestedScores(r), out = {}, from = {};
  for (const k of SCORE_KEYS) {
    if (own[k] != null) { out[k] = own[k]; from[k] = 'own'; } else if (tt[k] != null) { out[k] = Number(tt[k]); from[k] = 'table'; } else if (sug[k] != null) { out[k] = sug[k]; from[k] = 'hint'; } else out[k] = null;
  }
  return { scores: out, from };
}
// Overall Rating exactly as the workbook's column M computes it (blank ratings count as 0).
function overallRating(sc) {
  if (SCORE_KEYS.every((k) => sc[k] == null)) return null;
  const v = (k) => Number(sc[k]) || 0;
  const crit = ['r2', 'r3', 'r4', 'r7'].map(v);
  const c3 = crit.filter((x) => x === 3).length, c2 = crit.filter((x) => x === 2).length;
  if (c3 >= 1 || c2 >= 3) return 3;
  const avg = SCORE_KEYS.reduce((s, k) => s + v(k) * WEIGHT[k], 0) / 10;
  if (avg >= 1.8) return 3;
  if (c2 >= 1 || SCORE_KEYS.some((k) => v(k) === 3) || avg >= 1.4) return 2;
  return 1;
}
const worst = (risk) => { const l = Object.values(risk || {}).flat().map((x) => x.level); return l.includes('high') ? 'high' : l.includes('medium') ? 'medium' : l.length ? 'low' : null; };

// ---- subvention by the CMU orders (data/subvention.json, from the sync) ------------------------

let SUBV = null;
async function loadSubvention() {
  if (SUBV) return SUBV;
  try { SUBV = await getJSON('data/subvention.json', ver()); } catch (e) { SUBV = { decrees: [], projects: [] }; }
  SUBV.projects = SUBV.projects || [];
  return SUBV;
}
const REGION_OF = { OD: 'Одеська', MY: 'Миколаївська', KS: 'Херсонська', KV: 'Київська', LV: 'Львівська', VN: 'Вінницька', VO: 'Волинська',
  DP: 'Дніпропетровська', ZH: 'Житомирська', ZP: 'Запорізька', PL: 'Полтавська', KH: 'Харківська', CH: 'Чернігівська', CV: 'Чернівецька',
  KM: 'Хмельницька', RV: 'Рівненська', SM: 'Сумська', TR: 'Тернопільська', IF: 'Івано-Франківська', KR: 'Кіровоградська', ZK: 'Закарпатська', CK: 'Черкаська' };
// Ukrainian to Latin (the 2010 official table), then both sides folded so that "Vesnyane" and
// "Vesniane", "Mykhailivka" and "Mihailivka" meet.
const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia' };
const fold = (s) => s.replace(/[’'`ʼ]/g, '').replace(/ss/g, 's').replace(/y/g, 'i').replace(/i([aeu])/g, '$1').replace(/kh/g, 'h').replace(/ts/g, 'c').replace(/[^a-z0-9 ]+/g, ' ');
const latin = (s) => fold(String(s || '').toLowerCase().replace(/[а-яіїєґ]/g, (c) => TR[c] != null ? TR[c] : c));
const EN_COMMON = new Set('reconstruction overhaul construction building buildings street village oblast region district council facility protective civil defense defence radiation shelter water supply network system school lyceum kindergarten address house boiler sewage pumping station repair repairs major capital communal enterprise institution establishment center centre hospital office territory community settlement purpose'.split(' '));
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return d[b.length];
}
// Place names: "Kuyalnyk" in English, "Куяльницької" in the order; the same stem is enough when
// they share a long enough beginning.
function sameStem(w, x) {
  if (isNum(w) || isNum(x)) return w === x;
  const n = Math.min(w.length, x.length);
  if (n < 4) return false;
  let i = 0;
  while (i < n && w[i] === x[i]) i++;
  return i >= Math.max(4, Math.round(n * 0.75)) || (n >= 5 && lev(w, x) <= Math.floor(n / 5));
}
// The sub-project's line in the CMU order: by its Ukrainian name, or by the proper names and
// numbers of its English one. The region (from the code) breaks ties.
function subvMatch(r) {
  if (!SUBV || !SUBV.projects.length) return null;
  if (r._subv !== undefined) return r._subv;
  const tt = r.t || {};
  const region = REGION_OF[(r.code || '').slice(0, 2)];
  // Only the sub-project's own programme, where the file has it.
  const progs = new Set(SUBV.projects.map((p) => p.programme));
  const pool = SUBV.projects.filter((p) => !tt.programme || !progs.has(tt.programme) || p.programme === tt.programme);
  let best = null;
  // English names: the proper names and numbers, the beneficiary's place name too.
  const enTokens = tt.name_en ? fold((tt.name_en + ' ' + String(tt.beneficiary || '').replace(/\b(?:village|city|settlement|town)\s+council\b/ig, '')).toLowerCase()).split(/\s+/).filter((w) => (w.length >= 5 && !EN_COMMON.has(w) && !BEN_COMMON.has(w)) || /^\d+$/.test(w)) : [];
  for (const p of pool.filter((x) => x.name)) {
    let score = 0;
    if (tt.name_uk) score = nameMatch(tt.name_uk, p.name).score;
    else if (enTokens.length) {
      const pt = latin(p.name).split(/\s+/).filter(Boolean);
      const hit = [...new Set(enTokens)].filter((w) => pt.some((x) => sameStem(w, x)));
      score = hit.length / new Set(enTokens).size;
      // Several proper names or a well / house number in common are enough on their own.
      const nums = hit.filter((w) => /^\d{3,}$/.test(w)).length;
      if (hit.length >= 3 || (nums && hit.length >= 2)) score = Math.max(score, 0.6);
    }
    if (region && (p.region || '').startsWith(region)) score += 0.1;
    if (!best || score > best.score) best = { score, p };
  }
  r._subv = best && best.score >= (tt.name_uk ? 0.8 : 0.6) ? best.p : null;
  // Programmes spread by budget only: the beneficiary's budget line, shared by its projects.
  if (!r._subv) r._subv = budgetMatch(r, pool.filter((x) => !x.name), region);
  return r._subv;
}

const BUDGET_COMMON = new Set('бюджет територіальної громади міської селищної сільської міста обласний області району районний'.split(' '));
const BEN_COMMON = new Set('village city settlement council councils territorial community department capital construction road management state military regional administration oblast district executive committee of the and for housing communal services education culture youth sport healthcare'.split(' '));
const stem = (w) => w.slice(0, Math.max(5, Math.min(7, w.length - 2)));
function budgetMatch(r, lines, region) {
  if (!lines.length) return null;
  const tt = r.t || {};
  const buyer = (((r.pz || {}).tenders || [])[0] || {}).buyer_name || '';
  const text = buyer ? latin(buyer) : fold(String(tt.beneficiary || '').toLowerCase());
  const skip = ['silsk', 'selishch', 'misk', 'rada', 'oblasn', 'derzhavn', 'administrac', 'viddil', 'upravlin', 'departament', 'vikonavch', 'komitet'];
  const words = text.split(/\s+/).filter((w) => w.length >= 5 && !BEN_COMMON.has(w) && !skip.some((c) => w.startsWith(c)));
  // A regional administration (or its department) is the oblast budget.
  const oblast = /oblast state|regional state|\boblast\b.*administration|oblasn\w* (?:derzhavn|viisk)|\boda\b/i.test(text + ' ' + (tt.beneficiary || ''));
  const regionStem = region ? region.slice(0, -2) : '';
  if (oblast && regionStem) {
    const ob = lines.find((p) => /^Обласний бюджет/.test(p.budget) && p.budget.includes(regionStem));
    if (ob) return Object.assign({ level: 'budget' }, ob);
  }
  const inRegion = lines.filter((p) => !region || (p.region || '').startsWith(region) || p.budget.includes(regionStem));
  for (const p of inRegion) {
    if (/^Обласний бюджет/.test(p.budget)) continue;
    const bw = latin(p.budget).split(/\s+/).filter((w) => w.length >= 5 && !BUDGET_COMMON.has(w) && !skip.some((c) => w.startsWith(c)) && !/^(budzhet|terit|hromad|oblast)/.test(w));
    if (words.length && bw.some((x) => words.some((w) => sameStem(w, x)))) return Object.assign({ level: 'budget' }, p);
  }
  return null;
}
const spNameUk = (r) => (r.t || {}).name_uk || ((subvMatch(r) || {}).name || '');
const fmtK = (x) => ni.format(x) + ' ' + rt('thousand');
const edDate = (d) => fdate(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8));

// Funding gap hints from the order's editions: cut, cut to a token, dropped.
function subvRisk(r) {
  const p = subvMatch(r);
  if (!p || !SUBV) return [];
  const dec = (SUBV.decrees || []).find((d) => d.nreg === p.nreg) || { editions: Object.keys(p.amounts).sort() };
  const eds = dec.editions || [];
  const last = eds[eds.length - 1];
  const vals = eds.map((e) => p.amounts[e]).filter((v) => v != null);
  const max = Math.max(...vals);
  const now = p.amounts[last];
  if (now == null) return [{ level: 'high', text: rt('h_subvDropped', { date: edDate(last) }) }];
  if (now <= 1 && max > 1) return [{ level: 'high', text: rt('h_subvToken', { from: fmtK(max), date: edDate(last) }) }];
  if (now <= 1) return [{ level: 'medium', text: rt('h_subvTokenOnly', { date: edDate(last) }) }];
  if (now < max - 0.5) return [{ level: 'medium', text: rt('h_subvCut', { from: fmtK(max), to: fmtK(now), date: edDate(last) }) }];
  return [];
}
function allRisk(r) {
  const extra = subvRisk(r);
  if (!extra.length) return r.risk || {};
  const out = Object.assign({}, r.risk || {});
  out.r3 = (out.r3 || []).concat(extra);
  return out;
}

function subventionCard(r) {
  const p = subvMatch(r);
  if (!p) return null;
  const dec = (SUBV.decrees || []).find((d) => d.nreg === p.nreg) || {};
  const eds = dec.editions || Object.keys(p.amounts).sort();
  const tt = r.t || {};
  const last = p.amounts[eds[eds.length - 1]];
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, p.level === 'budget' ? rt('subvBudgetTitle', { prog: p.programme || '' }) : rt('subvTitle')), ext(dec.url || '#', rt(/-п$/.test(p.nreg || '') ? 'subvResolution' : 'subvOrder', { n: (p.nreg || '').replace(/-(\d{4})-[рп]$/, ' ($1)') }))),
    h('p', { class: 'muted small' }, join([p.budget, p.region])), p.name ? h('p', { class: 'small' }, p.name) : h('p', { class: 'small muted' }, rt('subvBudgetNote')),
    h('div', { class: 'scroll' }, h('table', null,
      h('thead', null, h('tr', null, eds.map((e, i) => h('th', { class: 'r' }, i ? rt('subvEdition', { date: edDate(e) }) : rt('subvOriginal', { date: edDate(e) }))))),
      h('tbody', null, h('tr', null, eds.map((e, i) => {
        const v = p.amounts[e], prev = i ? p.amounts[eds[i - 1]] : null;
        const cls = v == null ? 'faint' : prev != null && v < prev - 0.5 ? 'bad' : prev != null && v > prev + 0.5 ? 'ok' : '';
        return h('td', { class: 'r num ' + cls }, v == null ? '—' : fmtK(v));
      }))))),
    // Only a project's own line compares with the table; a community's sum covers all its projects.
    p.name && last != null && !(+tt.subv_year > 0)
      ? h('p', { class: 'muted small', style: 'margin-top:10px' }, rt('subvTableEmpty', { order: money(last * 1000) }))
      : p.name && last != null && Math.abs(+tt.subv_year - last * 1000) > 1000
        ? h('p', { class: 'notice small', style: 'margin-top:10px' }, rt('subvTableDiff', { table: money(+tt.subv_year), order: money(last * 1000) })) : null,
    p.name ? adequacyOfSp(r, last) : null);
}
// The sub-project's funding for the year: the subvention in force against what its tracked contracts
// will still need from the loan by 31 December, beside what the table says.
const ADEQ_RX = { adequate: /^adequ/i, insufficient: /^insuff/i, suspended: /^susp/i, excess: /^excess/i };
function adequacyData(r, last) {
  const tids = new Set(spTids(r));
  const rows = (state.trackedIndex.items || []).filter((x) => tids.has(x.tid) && x.funding);
  if (!rows.length || last == null) return null;
  const year = last * 1000;
  const need = rows.reduce((x, f) => x + (f.funding.need || 0), 0);
  const left = year - rows.reduce((x, f) => x + (f.funding.eib_paid_year || 0), 0);
  const status = rows.some((f) => f.funding.status === 'suspended') ? 'suspended' : need > left + 1 ? 'insufficient'
    : rows.every((f) => f.funding.status === 'excess') ? 'excess' : 'adequate';
  return { rows, need, left, status };
}
function adequacyOfSp(r, last) {
  const tt = r.t || {};
  const ad = adequacyData(r, last);
  if (!ad) return tt.funding ? h('p', { class: 'small muted', style: 'margin-top:10px' }, rt('adeqNoTracked', { s: tt.funding })) : null;
  const { rows, need, left, status } = ad;
  const table = Object.keys(ADEQ_RX).find((k) => ADEQ_RX[k].test(String(tt.funding || '').trim()));
  const cls = { insufficient: 'high', suspended: 'high', excess: 'low', adequate: 'ok' }[status];
  return h('div', { style: 'margin-top:12px' },
    h('div', { class: 'row' }, h('b', null, rt('adeqTitle')), h('span', { class: 'sev ' + cls }, t('fa.st.' + status)),
      tt.funding ? h('span', { class: 'tag' }, rt('adeqTable', { s: tt.funding })) : null),
    kv([[t('fa.left'), money(left)], [t('fa.need'), money(need)], [t('fa.gap'), need > left ? h('b', { class: 'bad' }, money(need - left)) : null],
      [rt('adeqTableNeed'), tt.extra_need != null && tt.extra_need !== '' ? money(+tt.extra_need || 0) : null]]),
    table && table !== status ? h('p', { class: 'notice small' }, rt('adeqDiff', { table: t('fa.st.' + table), ours: t('fa.st.' + status) })) : null,
    h('p', { class: 'muted small' }, rt('adeqHint', { n: rows.length })));
}

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
  const own = REG.access.expert ? rows.filter((r) => (r.t || {}).expert === REG.access.expert) : [];
  // Prozorro is read only for the chosen expert's sub-projects: all 400+ would take half an hour.
  const ofExpert = () => (REGF.expert ? rows.filter((r) => (r.t || {}).expert === REGF.expert) : []);
  const refreshBtn = h('button', { class: 'btn', onclick: () => {
    const list = ofExpert();
    if (!list.length) { toast(rt('pickExpert'), { bad: true }); return; }
    refreshMany(list);
  } });
  const drawRefresh = () => { const n = ofExpert().length; fill(refreshBtn, icon('refresh'), n ? rt('refreshN', { n }) : rt('refresh')); refreshBtn.title = n ? REGF.expert : rt('pickExpert'); };
  drawRefresh();
  const head = pageHead(rt('eyebrow'), titleGrad(rt('title1'), rt('title2')),
    meta ? rt('imported', { at: ftime(meta.at && meta.at.toDate ? meta.at.toDate().toISOString() : meta.at), by: meta.byName || '—', n: meta.rows }) : rt('noTable'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => file.click() }, icon('cloud'), rt('upload')), file,
      rows.length ? h('button', { class: 'btn', onclick: () => exportDialog() }, icon('download'), rt('export')) : null,
      rows.length ? refreshBtn : null,
      // Only an expert's own sub-projects, into their own tracking, whatever the filters show.
      own.length ? h('button', { class: 'btn btn-dark', onclick: () => { if (confirm(rt('trackConfirm', { n: own.length }))) trackAll(own); } }, icon('star'), rt('trackAll', { n: own.length })) : null, status));
  const orphans = Object.entries((meta && meta.orphans) || {});
  const orphanNote = orphans.length ? h('p', { class: 'notice small section' }, rt('orphans', { list: orphans.map(([c, v]) => c + ' — ' + money(v)).join(', ') })) : null;
  if (!rows.length) return [head];
  const experts = [...new Set(rows.map((r) => (r.t || {}).expert).filter(Boolean))].sort();
  const progs = [...new Set(rows.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  const tests = {
    nolink: (r) => !spTids(r).length, linked: (r) => spTids(r).length > 0,
    risk: (r) => ['high', 'medium'].includes(worst(allRisk(r))), nocontract: (r) => !mainContract(r),
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
  const set = (k) => (e) => { REGF[k] = e.target.value; REGF.page = 0; draw(); if (k === 'expert') drawRefresh(); };
  const q = h('input', { class: 'input', type: 'search', value: REGF.q, placeholder: rt('search'), 'aria-label': rt('search'), oninput: () => { REGF.q = q.value; REGF.page = 0; draw(); } });
  draw();
  return [head, orphanNote, h('div', { class: 'table-card section' },
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
          : ((r.pz || {}).cand || []).length ? h('span', { class: 'tag warn' }, rt('candidates', { n: r.pz.cand.length })) : h('span', { class: 'tag' }, rt('notLinked'))),
        td(L.k, { class: 'w-party' }, m ? [h('div', { class: 'cell-main' }, ((m.c.suppliers || [])[0] || {}).name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null]))]
          : tt.contractor ? tt.contractor : h('span', { class: 'faint' }, '—')),
        td(L.g, { class: 'num' }, join([pctOf(tt.pct) != null ? pctOf(tt.pct) + '%' : null, paidShare(r) != null ? rt('paidShort', { pct: paidShare(r) }) : null]) || '—'),
        td(L.r, null, riskChips(allRisk(r))));
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
      h('h1', { class: 'org-title' + (String(tt.name_uk || tt.name_en || '').length > 90 ? ' long' : '') }, tt.name_uk || tt.name_en || r.code),
      tt.name_uk && tt.name_en ? h('p', { class: 'muted' }, tt.name_en) : null,
      h('div', { class: 'chips' }, tt.expert ? h('span', { class: 'tag' }, tt.expert) : null, tt.funding ? h('span', { class: 'tag' }, tt.funding) : null,
        worst(allRisk(r)) ? h('span', { class: 'sev ' + worst(allRisk(r)) }, rt('colRisk')) : null)),
    h('div', { class: 'org-actions' }, h('div', { class: 'row' }, back, tt.dream ? ext(/^http/.test(tt.dream) ? tt.dream : dreamUrl(tt.dream.match(/DREAM-UA-\S+/) ? tt.dream.match(/DREAM-UA-\S+/)[0] : tt.dream), 'DREAM', 'btn') : null)));
  return [head,
    h('div', { class: 'grid-2 section' }, tableCard(r), risksCard(r)),
    workCard(r),
    guaranteesCard(r),
    subventionCard(r),
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
      [rt('subvention'), join([+tt.subv_year > 0 ? money(+tt.subv_year) : null, +tt.subv_paid > 0 ? rt('subvPaid', { sum: money(+tt.subv_paid) }) : null, +tt.subv_util > 0 ? pct(tt.subv_util) : null])],
      [rt('progress'), join([tt.start ? fdate(tt.start) : null, tt.completion ? '→ ' + fdate(tt.completion) : null, tt.pct != null ? pct(tt.pct) : null])],
      [rt('paidSheet'), r.paid != null ? money(r.paid) : null],
      [rt('comment'), tt.comment ? h('div', null, tt.comment, tt.upd ? h('div', { class: 'cell-sub' }, fdate(tt.upd)) : null) : null],
      [rt('next'), tt.next ? join([tt.next.who, tt.next.what, tt.next.date && fdate(tt.next.date)]) : null],
    ]),
    (tt.log || []).length ? [h('h3', { class: 'card-sub', style: 'margin-top:12px' }, rt('weekly')),
      h('div', { class: 'explain' }, tt.log.slice().reverse().map((x) => h('div', null, h('b', null, x.week.replace(/\s*\(.*/, '') + ' · '), join([x.who, x.what]), x.done ? ' ✓' : '')))] : null);
}

function risksCard(r) {
  const { scores, from } = scoresOf(r);
  const sug = suggestedScores(r);
  const overall = overallRating(scores);
  const save = (patch) => cloud.updateRegistry(r.code, { scores: Object.assign({}, r.scores || {}, patch) });
  const pending = SCORE_KEYS.filter((k) => sug[k] != null && from[k] === 'hint');
  return h('div', { class: 'card pad' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('risks')),
      overall ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][overall], title: rt('overallHint') }, rt('overall', { n: overall })) : null),
    h('p', { class: 'muted small' }, rt('risksHint')),
    pending.length ? h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn btn-sm btn-dark', onclick: () => save(Object.fromEntries(pending.map((k) => [k, sug[k]]))) }, icon('check'), rt('acceptHints', { n: pending.length }))) : null,
    h('div', { class: 'checklist' }, RISK_KEYS.map((k) => {
      const items = (allRisk(r) || {})[k] || [];
      if (k === 'rx' && !items.length) return null;
      const score = scores[k];
      const lv = k === 'rx' ? (items.some((x) => x.level === 'high') ? 'bad' : 'warn') : score === 3 ? 'bad' : score === 2 ? 'warn' : score === 1 ? 'ok' : 'na';
      const pick = k !== 'rx' ? select([['', '–'], ['1', '1'], ['2', '2'], ['3', '3']], score != null ? String(score) : '', (e) => save({ [k]: e.target.value ? Number(e.target.value) : null }), rt(k)) : null;
      if (pick) { pick.classList.add('select-sm', 'score-pick'); pick.title = rt('from_' + (from[k] || 'none')); }
      return h('div', { class: 'chk ' + lv },
        pick || h('span', { class: 'chk-ico' }, '!'),
        h('div', null, h('b', null, rt(k)), h('div', { class: 'small muted' }, items.length ? items.map((x) => x.text).join(' · ') : '—'),
          from[k] && from[k] !== 'own' ? h('div', { class: 'faint small' }, rt('from_' + from[k])) : null));
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
        h('b', null, t0 ? t0.title : tid), ((r.link || {}).auto || []).includes(tid) ? h('span', { class: 'tag', style: 'margin-left:6px' }, rt('autoLinked')) : null,
        h('div', { class: 'cell-sub' }, join([tid, t0 && label('pzs.', t0.status), t0 && label('pzt.', t0.method), t0 && t0.value ? money(t0.value.amount, t0.value.currency) : null,
          t0 && t0.bids != null ? t('pz.bids') + ': ' + t0.bids : null, t0 && t0.date ? fdate(t0.date) : null])),
        t0 && t0.error ? h('div', { class: 'small bad' }, t0.error) : null,
        t0 ? h('div', { class: 'chips', style: 'margin:6px 0 0' },
          t0.sasu && t0.sasu.n ? h('span', { class: 'sev ' + (t0.sasu.violation ? 'high' : 'medium') }, 'ДАСУ ' + (t0.sasu.violation ? '⚠' : '…')) : null,
          t0.complaints && t0.complaints.n ? h('span', { class: 'sev medium' }, 'АМКУ ' + t0.complaints.n) : null,
          t0.dream_id ? ext(dreamUrl(t0.dream_id), 'DREAM') : null) : null,
        marksRow(r, tid),
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
  const cands = (pz.cand || []).filter((x) => !tids.includes(x.tid));
  fill(box, tids.length ? h('div', { class: 'qs-list' }, tids.map(tenderBlock)) : h('p', { class: 'muted small' }, rt('notLinked')),
    cands.length ? [h('h3', { class: 'card-sub', style: 'margin-top:14px' }, rt('candTitle')), h('p', { class: 'muted small' }, rt('candHint')),
      h('div', { class: 'qs-list' }, cands.map((x) => h('div', { class: 'qs-row' },
        h('div', null, h('span', { class: 'tag' }, t('rel.role.' + x.role)), ' ', h('b', null, x.title),
          h('div', { class: 'cell-sub' }, join([x.tid, x.buyer_name, label('pzs.', x.status), x.value ? money(x.value.amount, x.value.currency) : null]))),
        h('div', { class: 'qs-side' }, ext(pzUrl(x.tid), 'Prozorro'), h('button', { class: 'btn btn-sm btn-dark', onclick: () => save([...new Set(linkIds.concat(x.tid))], off.filter((y) => y !== x.tid)) }, rt('link'))))))] : null);
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

// ---- the expert's work: tasks, weekly journal, marks on procurements --------------------------
//
// Kept in registry/{code}.work for the team: {tasks: [{id, text, due, who, done}], log: [{id, date,
// kind, text, who, done}], marks: {tid: {td, assist, monitor}}}.

// The journal's kinds are the workbook's own "Activity" list, so they go back into it as they are.
const WORK_KINDS = ['VISIT', 'PROCUREMENT ANALYSE', 'COST VERIFICATION', 'CONSULTING', 'RISK MANAGEMENT', 'EX-POST REVIEW'];
const OLD_KIND = { td: 'PROCUREMENT ANALYSE', assist: 'CONSULTING', monitor: 'RISK MANAGEMENT', visit: 'VISIT', request: 'CONSULTING', meeting: 'CONSULTING', report: 'EX-POST REVIEW', other: '' };
const activityOf = (k) => (WORK_KINDS.includes(k) ? k : OLD_KIND[k] || '');
const kindLabel = (k) => { const a = activityOf(k); return a ? rt('kind_' + a.replace(/\W+/g, '_')) : rt('kind_other'); };
const myExpert = () => (REG.access && REG.access.expert) || (state.user && (state.user.displayName || state.user.email)) || '';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function saveWork(r, change) {
  const w = JSON.parse(JSON.stringify(r.work || {}));
  w.tasks = w.tasks || []; w.log = w.log || []; w.marks = w.marks || {}; w.guarantees = w.guarantees || [];
  change(w);
  return cloud.updateRegistry(r.code, { work: w });
}
// ISO week and its days, written as the table's weekly columns are ("Week 47 (16.11-22.11)").
function weekOf(day) {
  const d = new Date(day + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  const thu = new Date(mon); thu.setUTCDate(mon.getUTCDate() + 3);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((thu - jan1) / 864e5 + 1) / 7);
  const f = (x) => String(x.getUTCDate()).padStart(2, '0') + '.' + String(x.getUTCMonth() + 1).padStart(2, '0');
  return { n, label: `Week ${n} (${f(mon)}-${f(sun)})` };
}
function marksRow(r, tid) {
  const m = (((r.work || {}).marks || {})[tid]) || {};
  return h('div', { class: 'chips', style: 'margin:6px 0 0' }, ['td', 'assist', 'monitor'].map((k) => h('button', {
    class: 'tag mark' + (m[k] ? ' ok' : ''), type: 'button', title: rt('markHint'),
    onclick: () => saveWork(r, (w) => { w.marks[tid] = Object.assign({}, w.marks[tid], { [k]: !m[k] }); }),
  }, (m[k] ? '✓ ' : '') + rt('mark_' + k))));
}
// Tasks due for me (mine or nobody's) by today: for the bell.
function dueTasks(within = 0) {
  if (!REG.access) return [];
  const me = myExpert(), until = addDays(today(), within), out = [];
  for (const r of REG.rows.values()) {
    for (const x of ((r.work || {}).tasks || [])) {
      if (!x.done && x.due && x.due <= until && (!x.who || x.who === me)) out.push(Object.assign({ code: r.code, name: (r.t || {}).name_uk || (r.t || {}).name_en || '' }, x));
    }
    // A guarantee ending within 30 days (or already ended and not closed) is a task of the sub-project's expert.
    if ((r.t || {}).expert && (r.t || {}).expert !== me && me) continue;
    for (const g of ((r.work || {}).guarantees || [])) {
      if (!g.closed && g.until && g.until <= addDays(until, 30)) {
        out.push({ code: r.code, name: (r.t || {}).name_uk || (r.t || {}).name_en || '', due: addDays(g.until, -30) < today() ? g.until : addDays(g.until, -30),
          text: rt(g.until < today() ? 'gExpired' : 'gExpiring', { kind: rt('g_' + g.kind), date: fdate(g.until), bank: g.bank || '' }), guarantee: true });
      }
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
function workCard(r) {
  const w = r.work || {}, tt = r.t || {};
  const experts = [...new Set([...REG.rows.values()].map((x) => (x.t || {}).expert).filter(Boolean).concat([myExpert()]))].sort();
  // Tasks
  const tText = h('input', { class: 'input', placeholder: rt('taskWhat'), 'aria-label': rt('taskWhat') });
  const tDue = h('input', { class: 'input', type: 'date', value: addDays(today(), 7), 'aria-label': rt('taskDue') });
  const tWho = select(experts.map((x) => [x, x]), tt.expert || myExpert(), () => {}, rt('taskWho'));
  const tasks = (w.tasks || []).slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
  // Journal
  const jDate = h('input', { class: 'input', type: 'date', value: today(), 'aria-label': rt('logDate') });
  const jKind = select(WORK_KINDS.map((k) => [k, kindLabel(k)]), 'VISIT', () => {}, rt('logKind'));
  const jText = h('input', { class: 'input', placeholder: rt('logWhat'), 'aria-label': rt('logWhat') });
  const jDone = h('input', { type: 'checkbox', checked: true });
  const entries = (w.log || []).map((x) => Object.assign({ mine: true }, x))
    .concat((tt.log || []).map((x) => ({ date: null, week: x.week, who: x.who, text: x.what, done: x.done, table: true })))
    .sort((a, b) => String(b.date || b.week || '').localeCompare(String(a.date || a.week || '')));
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('workTitle')),
    h('div', { class: 'grid-2' },
      h('div', null,
        h('h3', { class: 'card-sub' }, rt('tasks')),
        tasks.length ? h('div', { class: 'work-list' }, tasks.map((x) => h('div', { class: 'work-item' + (x.done ? ' done' : '') },
          h('input', { type: 'checkbox', checked: x.done || null, 'aria-label': rt('taskDone'), onchange: (e) => saveWork(r, (ww) => { const it = ww.tasks.find((y) => y.id === x.id); if (it) Object.assign(it, { done: e.target.checked, doneAt: today() }); }) }),
          h('div', null, h('div', null, x.text), h('div', { class: 'cell-sub' }, x.due ? h('span', { class: !x.done && x.due < today() ? 'bad' : '' }, fdate(x.due)) : null, x.who ? (x.due ? ' · ' : '') + x.who : null)),
          h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: () => saveWork(r, (ww) => { ww.tasks = ww.tasks.filter((y) => y.id !== x.id); }) }, icon('x'))))) : h('p', { class: 'muted small' }, rt('noTasks')),
        h('div', { class: 'work-form' }, tText, tDue, tWho, h('button', { class: 'btn btn-sm btn-dark', onclick: () => {
          if (!tText.value.trim()) return;
          saveWork(r, (ww) => ww.tasks.push({ id: uid(), text: tText.value.trim().slice(0, 500), due: tDue.value || null, who: tWho.value || '', done: false, by: myExpert(), at: today() }));
        } }, rt('add')))),
      h('div', null,
        h('h3', { class: 'card-sub' }, rt('journal')),
        h('div', { class: 'work-form j' }, jDate, jKind, jText, h('label', { class: 'chk-opt' }, jDone, rt('logDone')), h('button', { class: 'btn btn-sm btn-dark', onclick: () => {
          if (!jText.value.trim()) return;
          saveWork(r, (ww) => ww.log.push({ id: uid(), date: jDate.value || today(), kind: jKind.value, text: jText.value.trim().slice(0, 1000), who: myExpert(), done: jDone.checked }));
        } }, rt('add'))),
        entries.length ? h('div', { class: 'work-list' }, entries.slice(0, 40).map((x) => h('div', { class: 'work-item' },
          h('span', { class: 'work-week num' }, x.date ? fdate(x.date) : (x.week || '').replace(/\s*\(.*/, '')),
          h('div', null, h('div', null, x.kind ? h('b', null, kindLabel(x.kind) + ' · ') : null, x.text || '—', x.done ? ' ✓' : ''),
            h('div', { class: 'cell-sub' }, join([x.date ? weekOf(x.date).label : x.week, x.who, x.table ? rt('fromSheet') : null]))),
          x.mine ? h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: () => saveWork(r, (ww) => { ww.log = ww.log.filter((y) => y.id !== x.id); }) }, icon('x')) : h('span')))) : h('p', { class: 'muted small' }, rt('noLog')))));
}

// Bank guarantees the team keeps for a sub-project: bid, performance, advance repayment, warranty.
const G_KINDS = ['performance', 'advance', 'bid', 'warranty'];
function guaranteesCard(r) {
  const list = (((r.work || {}).guarantees) || []).slice().sort((a, b) => String(a.until || '9').localeCompare(String(b.until || '9')));
  const kind = select(G_KINDS.map((k) => [k, rt('g_' + k)]), 'performance', () => {}, rt('gKind'));
  const bank = h('input', { class: 'input', placeholder: rt('gBank'), 'aria-label': rt('gBank') });
  const number = h('input', { class: 'input', placeholder: rt('gNumber'), 'aria-label': rt('gNumber') });
  const amount = h('input', { class: 'input', type: 'number', min: 0, step: 'any', inputmode: 'decimal', placeholder: rt('gAmount'), 'aria-label': rt('gAmount') });
  const until = h('input', { class: 'input', type: 'date', 'aria-label': rt('gUntil') });
  const state_ = (g) => (g.closed ? 'closed' : !g.until ? '' : g.until < today() ? 'expired' : g.until <= addDays(today(), 30) ? 'soon' : 'ok');
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('gTitle')), h('p', { class: 'muted small' }, rt('gHint')),
    list.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('gKind'), rt('gBank'), rt('gAmount'), rt('gUntil'), ''].map((x) => h('th', null, x)))),
      h('tbody', null, list.map((g) => {
        const st = state_(g);
        return h('tr', null,
          td(rt('gKind'), null, h('b', null, rt('g_' + g.kind)), g.number ? h('div', { class: 'cell-sub' }, '№ ' + g.number) : null),
          td(rt('gBank'), { class: 'w-party' }, g.bank || '—'),
          td(rt('gAmount'), { class: 'num' }, g.amount != null ? money(g.amount) : '—'),
          td(rt('gUntil'), null, g.until ? h('span', { class: st === 'expired' ? 'bad' : '' }, fdate(g.until)) : '—',
            st && st !== 'ok' ? h('div', null, h('span', { class: 'sev ' + (st === 'expired' ? 'high' : st === 'soon' ? 'medium' : 'low') }, rt('gSt_' + st, { n: g.until ? Math.max(0, Math.round((new Date(g.until) - new Date(today())) / 864e5)) : '' }))) : null),
          td('', { class: 'r' }, h('div', { class: 'row', style: 'justify-content:flex-end' },
            h('button', { class: 'btn btn-sm', onclick: () => saveWork(r, (w) => { const x = w.guarantees.find((y) => y.id === g.id); if (x) x.closed = !x.closed; }) }, g.closed ? rt('gReopen') : rt('gClose')),
            h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: () => saveWork(r, (w) => { w.guarantees = w.guarantees.filter((y) => y.id !== g.id); }) }, icon('x')))));
      })))) : h('p', { class: 'muted small' }, rt('gNone')),
    h('div', { class: 'work-form g' }, kind, bank, number, amount, h('label', { class: 'wf-field' }, h('span', null, rt('gUntil')), until), h('button', { class: 'btn btn-sm btn-dark', onclick: () => {
      if (!until.value && !amount.value) return;
      saveWork(r, (w) => w.guarantees.push({ id: uid(), kind: kind.value, bank: bank.value.trim().slice(0, 200), number: number.value.trim().slice(0, 60),
        amount: amount.value ? Number(amount.value) : null, until: until.value || null, by: myExpert(), at: today() }));
    } }, rt('add'))));
}
// Guarantees of the sub-project a contract on control belongs to (for its card).
const guaranteesOfTid = (tid) => { const r = REG.access ? [...REG.rows.values()].find((x) => spTids(x).includes(tid)) : null; return r ? ((r.work || {}).guarantees || []) : null; };

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

// ---- the team's workbook, filled in ------------------------------------------------------------
//
// The export is the team's own file: the one uploaded last on this device (or one picked now),
// with the monitor's data written into its cells and nothing else touched. The archive is opened
// as it is and only the cells' XML is edited: formulas (shared and array ones too), styles, lists,
// hyperlinks, comments, the link to the other workbook — all stay byte for byte. Excel is asked to
// recalculate on opening, so the Overall Rating follows the scores.

function idb() {
  return new Promise((ok, bad) => {
    const q = indexedDB.open('monitor-files', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('files');
    q.onsuccess = () => ok(q.result);
    q.onerror = () => bad(q.error);
  });
}
async function idbPut(key, val) {
  try {
    const db = await idb();
    await new Promise((ok, bad) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(val, key); tx.oncomplete = ok; tx.onerror = () => bad(tx.error); });
  } catch (e) { console.warn('file store', e); }
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((ok, bad) => { const q = db.transaction('files').objectStore('files').get(key); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); });
  } catch (e) { return null; }
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const excelDay = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;

// One worksheet's XML with cells set in place. `set(ref, value, how)`: value is a number, a
// string, true/false or { day: 'YYYY-MM-DD' }; how is 'blank' (only into an empty cell),
// 'update' (also over a different value) or 'force' (the same, for what the monitor itself keeps).
function sheetPatch(xml, sst) {
  const rowsAt = new Map();
  const rx = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let m;
  while ((m = rx.exec(xml))) rowsAt.set(+m[1], [m.index, m.index + m[0].length]);
  // The style a new cell takes: the same column's in the nearest row that has it.
  let styles = null;
  const styleNear = (letters, row) => {
    if (!styles) {
      styles = {};
      for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)" s="(\d+)"/g)) (styles[c[1]] = styles[c[1]] || []).push([+c[2], c[3]]);
    }
    let best = null;
    for (const [r, s] of styles[letters] || []) if (!best || Math.abs(r - row) < Math.abs(best[0] - row)) best = [r, s];
    return best ? best[1] : null;
  };
  const changes = new Map();
  const stat = { set: 0, formula: 0, kept: 0, same: 0, norow: 0 };
  const read = (attrs, inner) => {
    const t = (attrs.match(/\st="([^"]+)"/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (t === 'inlineStr') return xmlUnesc((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || ['', ''])[1]);
    if (v == null) return null;
    if (t === 's') return sst[+v];
    if (t === 'b') return v === '1';
    if (t === 'str' || t === 'e') return xmlUnesc(v);
    return +v;
  };
  const cellXml = (ref, attrs, value) => {
    const keep = (attrs || '').replace(/\s(?:r|t)="[^"]*"/g, '');
    if (typeof value === 'boolean') return `<c r="${ref}"${keep} t="b"><v>${value ? 1 : 0}</v></c>`;
    if (typeof value === 'number') return `<c r="${ref}"${keep}><v>${value}</v></c>`;
    if (value && value.day) return `<c r="${ref}"${keep}><v>${excelDay(value.day)}</v></c>`;
    return `<c r="${ref}"${keep} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  };
  const same = (a, b) => (b && b.day ? typeof a === 'number' && Math.abs(a - excelDay(b.day)) < 1 : typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) < 0.005
    : typeof b === 'boolean' ? a === b : String(a == null ? '' : a).trim() === String(b).trim());
  return {
    stat,
    set(ref, value, how) {
      if (value == null || value === '' || (typeof value === 'number' && !isFinite(value))) return;
      const row = +ref.match(/\d+/)[0];
      if (!rowsAt.has(row)) { stat.norow++; return; }
      if (!changes.has(row)) changes.set(row, new Map());
      changes.get(row).set(ref, { value, how: how || 'blank' });
    },
    out() {
      const parts = [];
      let at = 0;
      for (const row of [...changes.keys()].sort((a, b) => a - b)) {
        const [a, b] = rowsAt.get(row);
        let x = xml.slice(a, b);
        if (x.endsWith('/>')) x = x.slice(0, -2) + '></row>';
        for (const [ref, { value, how }] of changes.get(row)) {
          const cm = x.match(new RegExp(`<c r="${ref}"(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</c>)`));
          if (cm) {
            const attrs = cm[1] || '', inner = cm[2] || '';
            if (/<f[\s>/]/.test(inner)) { stat.formula++; continue; }
            const old = read(attrs, inner);
            if (same(old, value)) { stat.same++; continue; }
            const empty = old == null || old === '' || old === false;
            if (!empty && how === 'blank') { stat.kept++; continue; }
            x = x.slice(0, cm.index) + cellXml(ref, attrs, value) + x.slice(cm.index + cm[0].length);
          } else {
            // A cell the row does not have yet: in its column's place, with the column's style.
            const letters = ref.match(/^[A-Z]+/)[0], n = colNum(letters);
            const sn = styleNear(letters, row);
            const style = sn ? ` s="${sn}"` : '';
            let pos = x.lastIndexOf('</row>');
            for (const c of x.matchAll(/<c r="([A-Z]+)\d+"/g)) if (colNum(c[1]) > n) { pos = c.index; break; }
            x = x.slice(0, pos) + cellXml(ref, style, value) + x.slice(pos);
          }
          stat.set++;
        }
        parts.push(xml.slice(at, a), x);
        at = b;
      }
      parts.push(xml.slice(at));
      return parts.join('');
    },
  };
}

// Prozorro's state of a procedure in the workbook's words (its "tender status" list).
function tableStatus(t0, c) {
  if (c && (c.status === 'active' || c.status === 'terminated')) return 'Contract Signed';
  const s = (t0 && t0.status) || '';
  if (/^active\.(enquiries|tendering)$/.test(s)) return 'Ongoing';
  if (/^active\.(pre-qualification|auction|qualification)/.test(s)) return 'Evaluation';
  if (s === 'active.awarded') return 'Awarded';
  if (s === 'complete') return 'Contract Signed';
  if (s === 'unsuccessful') return t0.bids ? 'All Rejected' : 'No Bids';
  if (s === 'cancelled') return 'Cancelled';
  return null;
}
const tableMethod = (t0) => (!t0 || !t0.method ? null : /^(reporting|negotiation)/.test(t0.method) ? 'Direct Contract' : 'Tender');
const tableSasu = (list) => {
  const xs = (list || []).filter(Boolean);
  return xs.some((x) => x.violation) ? 'Negative' : xs.some((x) => x.active) ? 'Ongoing' : xs.some((x) => x.n) ? 'Positive' : null;
};
const tableAmcu = (cs) => (cs && cs.n ? (cs.open ? 'Ongoing' : cs.satisfied ? 'Satisfied' : 'Not satisfied') : null);
const FUNDING_WORD = { adequate: 'Adequate', insufficient: 'Insufficient', suspended: 'Suspended', excess: 'Excess Funding' };

async function fillWorkbook(buf, mode, onStep) {
  const XLSX = await loadXlsx();
  const CFB = XLSX.CFB;
  const u8 = new Uint8Array(buf);
  const wb = XLSX.read(u8, { type: 'array', cellDates: true, sheets: ['SPs', 'Tenders', 'Dropdowns'] });
  const z = CFB.read(u8, { type: 'array' });
  const dec = new TextDecoder(), enc = new TextEncoder();
  const entry = (p) => CFB.find(z, '/' + p.replace(/^\//, ''));
  const text = (p) => dec.decode(entry(p).content);
  const put = (p, s) => { const e = entry(p); e.content = enc.encode(s); e.size = e.content.length; };
  const wbx = text('xl/workbook.xml'), rels = text('xl/_rels/workbook.xml.rels');
  const partOf = (name) => {
    const sh = [...wbx.matchAll(/<sheet [^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`name="${xmlEsc(name)}"`));
    const rid = sh && (sh.match(/r:id="([^"]+)"/) || [])[1];
    const rel = rid && [...rels.matchAll(/<Relationship [^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`Id="${rid}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    return target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target) : null;
  };
  const sst = entry('xl/sharedStrings.xml') ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlUnesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
  const how = mode === 'update' ? 'update' : 'blank';
  const ref = (r, c) => XLSX.utils.encode_cell({ r, c });
  const report = { sps: 0, tenders: 0, missing: [], weeks: 0, noWeek: 0, sheets: {} };

  // Initials of the experts as the workbook's own lists give them (Dropdowns J → L).
  const initials = {};
  if (wb.Sheets.Dropdowns) {
    const dd = XLSX.utils.sheet_to_json(wb.Sheets.Dropdowns, { header: 1, defval: null });
    dd.forEach((row) => { if (row[9] && row[11] && row[9] !== 'EXPERTS') initials[String(row[9]).trim()] = String(row[11]).trim(); });
  }
  const initialsOf = (name) => initials[String(name || '').trim()] || String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('').slice(0, 3);

  // Tracked snapshots for the procedures on control: auction and award dates, bidders, complaints.
  onStep && onStep(rt('xReading'));
  const byTid = {};
  for (const x of state.trackedIndex.items || []) if (x.tid && !byTid[x.tid]) byTid[x.tid] = x.key;
  const snaps = {};
  await Promise.all(Object.entries(byTid).map(async ([tid, key]) => { try { snaps[tid] = await loadTracked(key); } catch (e) { /* not written yet */ } }));

  // ---- SPs ----
  const spPath = partOf('SPs');
  const sps = XLSX.utils.sheet_to_json(wb.Sheets.SPs, { header: 1, raw: true, defval: null });
  const base = XLSX.utils.decode_range(wb.Sheets.SPs['!ref']).s.r;
  const hi = sps.findIndex((r) => r && String(r[2] || '').trim() === 'ID' && /SP status/.test(String(r[3] || '')));
  if (!spPath || hi < 0) throw new Error(rt('importBad'));
  const width = Math.max(sps[hi].length, (sps[hi - 1] || []).length);
  const labels = [], groups = [];
  for (let i = 0; i < width; i++) {
    const uk = String((sps[hi - 1] || [])[i] || '').replace(/\s+/g, ' ').trim();
    const en = String(sps[hi][i] || '').replace(/\s+/g, ' ').trim();
    labels.push(/^\d\. /.test(uk) ? uk : (en || uk));
    groups.push(uk);
  }
  const col = mapHeaders(labels, SP_COLS);
  const weeks = {};
  groups.forEach((g, i) => { if (/^Week \d+/.test(g) && /EXPERT/i.test(labels[i])) weeks[g] = i; });
  const sp = sheetPatch(text(spPath), sst);
  const seen = new Set();
  sps.forEach((row, i) => {
    if (i <= hi || !row) return;
    const codes = codesOf(row[col.code]);
    const r = codes.length && (REG.rows.get(codes[0]) || [...REG.rows.values()].find((x) => x.code === codes[0]));
    if (!r) return;
    seen.add(r.code);
    report.sps++;
    const R = base + i;
    const at = (key) => (col[key] != null ? ref(R, col[key]) : null);
    const setK = (key, v, h2) => { const a = at(key); if (a) sp.set(a, v, h2 || how); };
    // The expert's ratings are kept in the monitor: they go in as they are there.
    for (const k of UD_KEYS) if ((r.scores || {})[k] != null) setK(k, +r.scores[k], 'force');
    const tids = spTids(r);
    if (tids.length) setK('pz_link', tids.join('\n'), 'blank');
    const pzT = ((r.pz || {}).tenders || []).filter((x) => !x.error);
    const m = mainContract(r);
    const main = m ? m.t0 : pzT[0];
    if (main) setK('proc_status', tableStatus(main, m && m.c));
    setK('amcu', tableAmcu(pzT.reduce((acc, x) => { const c = x.complaints || {}; return { n: acc.n + (c.n || 0), open: acc.open + (c.open || 0), satisfied: acc.satisfied + (c.satisfied || 0) }; }, { n: 0, open: 0, satisfied: 0 })));
    setK('sasu', tableSasu(pzT.map((x) => x.sasu)));
    if (m) {
      const sup = (m.c.suppliers || [])[0] || {};
      setK('contractor', sup.name);
      if (m.c.start) setK('start', { day: m.c.start }, 'blank');
    }
    const pSub = subvMatch(r);
    const ad = pSub && pSub.name ? adequacyData(r, pSub.amounts[Object.keys(pSub.amounts).sort().pop()]) : null;
    if (ad) {
      setK('funding', FUNDING_WORD[ad.status]);
      setK('extra_need', Math.round(Math.max(0, ad.need - ad.left)));
    }
    // The journal, into its week's EXPERT / Activity / ☑ — where that week is still empty.
    const used = new Set();
    for (const x of ((r.work || {}).log || []).slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const w = weekOf(x.date).label;
      const c0 = weeks[w];
      if (c0 == null) { report.noWeek++; continue; }
      if (used.has(w)) continue;
      used.add(w);
      const cur = [row[c0], row[c0 + 1]];
      if (cur.some((v) => v != null && v !== '')) continue;
      sp.set(ref(R, c0), initialsOf(x.who), 'blank');
      if (activityOf(x.kind)) sp.set(ref(R, c0 + 1), activityOf(x.kind), 'blank');
      if (x.done) sp.set(ref(R, c0 + 2), true, 'blank');
      report.weeks++;
    }
  });
  report.missing = [...REG.rows.keys()].filter((c) => !seen.has(c));
  put(spPath, sp.out());
  report.sheets.SPs = sp.stat;

  // ---- Tenders ----
  const tnPath = partOf('Tenders');
  if (tnPath && wb.Sheets.Tenders) {
    const tn = XLSX.utils.sheet_to_json(wb.Sheets.Tenders, { header: 1, raw: true, defval: null });
    const tbase = XLSX.utils.decode_range(wb.Sheets.Tenders['!ref']).s.r;
    const th = tn.findIndex((r) => r && String(r[0] || '').trim() === 'SP ID');
    if (th >= 0) {
      const tcol = mapHeaders(tn[th].map((x) => String(x || '').replace(/\s+/g, ' ').trim()), TN_COLS);
      const tp = sheetPatch(text(tnPath), sst);
      tn.forEach((row, i) => {
        if (i <= th || !row) return;
        const code = codesOf(row[tcol.sp])[0];
        const tid = (String(row[tcol.pz] || '').match(PZ_ID) || [])[0];
        const r = code && (REG.rows.get(code) || REG.rows.get(code.replace(/-A$/, '')));
        if (!r || !tid) return;
        const t0 = ((r.pz || {}).tenders || []).find((x) => x.tid === tid && !x.error);
        const s = snaps[tid];
        const R = tbase + i;
        const setT = (key, v, h2) => { if (tcol[key] != null) tp.set(ref(R, tcol[key]), v, h2 || how); };
        const mk = ((r.work || {}).marks || {})[tid] || {};
        if (mk.td) setT('mk_td', true, 'force');
        if (mk.assist) setT('mk_assist', true, 'force');
        if (mk.monitor) setT('mk_monitor', true, 'force');
        if (!t0 && !s) return;
        report.tenders++;
        const st = (s && s.tender) || {};
        const c = ((t0 && t0.contracts) || []).find((x) => x.status === 'active') || ((t0 && t0.contracts) || []).find((x) => x.status === 'terminated') || (s && s.contract) || null;
        setT('status', tableStatus(t0 || st, c));
        setT('method', tableMethod(t0 || st));
        const issued = (t0 && t0.date) || st.date, opening = (t0 && t0.deadline) || st.deadline;
        if (issued) setT('issued', { day: issued });
        if (opening) setT('opening', { day: opening });
        const bids = t0 ? t0.bids : st.bids;
        if (bids != null) setT('bidders_n', bids);
        const u = (s && s.undp) || {};
        if ((u.timeline || {}).auction) setT('auction', { day: u.timeline.auction });
        if ((u.timeline || {}).award) setT('award', { day: u.timeline.award });
        const names = ((u.bidders || {}).list || []).map((x) => x.name).filter(Boolean);
        if (names.length) setT('bidders', names.join('\n'));
        if (st.questions_count != null) setT('qr', st.questions_count);
        const cp = u.complaints || {};
        const amcuOf = (x) => (x && x.n ? { n: x.n, open: x.open, satisfied: x.upheld } : null);
        if ((cp.tender || {}).n) { setT('amcu_td', cp.tender.n); setT('amcu_td_status', tableAmcu(amcuOf(cp.tender))); }
        if ((cp.award || {}).n) { setT('amcu_eval', cp.award.n); setT('amcu_eval_status', tableAmcu(amcuOf(cp.award))); }
        setT('sasu', tableSasu([t0 && t0.sasu]) || (s && (s.sasu || []).length ? tableSasu([{ n: s.sasu.length, violation: s.sasu.some((x) => x.violation), active: s.sasu.some((x) => /active|draft/.test(x.status || '')) }]) : null));
        if (c) {
          const sup = (c.suppliers || [])[0] || {};
          setT('contract_link', 'https://prozorro.gov.ua/tender/' + tid);
          setT('contractor', sup.name);
          setT('contractor_id', sup.code && /^\d+$/.test(sup.code) ? +sup.code : sup.code);
          setT('contract_no', c.number);
          if (c.signed) setT('contract_date', { day: c.signed });
          if (c.end) setT('contract_end', { day: c.end });
          if (c.value && c.value.amount) setT('contract_total', c.value.amount);
          const nch = typeof c.changes === 'number' ? c.changes : Array.isArray(c.changes) ? c.changes.length : null;
          if (nch != null) setT('mods', nch);
        }
      });
      put(tnPath, tp.out());
      report.sheets.Tenders = tp.stat;
    }
  }
  // Excel recalculates everything on opening (the rating follows the scores).
  let w2 = wbx;
  w2 = /<calcPr[^>]*fullCalcOnLoad=/.test(w2) ? w2.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : /<calcPr/.test(w2) ? w2.replace('<calcPr', '<calcPr fullCalcOnLoad="1"') : w2.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  put('xl/workbook.xml', w2);
  const out = CFB.write(z, { fileType: 'zip', type: 'array', compression: true });
  return { bytes: out, report };
}

function exportDialog() {
  const box = h('div', { class: 'x-actions' });
  const modeSel = h('div', { class: 'x-modes' },
    ['blank', 'update'].map((m, i) => h('label', { class: 'x-mode' }, h('input', { type: 'radio', name: 'xmode', value: m, checked: i === 0 }), h('span', null, h('b', null, rt('xMode_' + m)), h('div', { class: 'small muted' }, rt('xMode_' + m + 'Hint'))))));
  const mode = () => (modeSel.querySelector('input:checked') || {}).value || 'blank';
  const status = h('div', { class: 'small x-status' });
  const run = async (name, bufP) => {
    fill(status, rt('xWorking'));
    try {
      const { bytes, report } = await fillWorkbook(await bufP, mode(), (msg) => fill(status, msg));
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = h('a', { href: URL.createObjectURL(blob), download: String(name).replace(/\.xlsx$/i, '') + ' (монітор ' + today() + ').xlsx' });
      document.body.append(a); a.click(); a.remove();
      const st = report.sheets.SPs || {}, tt = report.sheets.Tenders || {};
      fill(status, h('div', { class: 'x-report' },
        h('b', null, rt('xDone', { n: (st.set || 0) + (tt.set || 0) })),
        h('div', null, rt('xRows', { sp: report.sps, tn: report.tenders, w: report.weeks })),
        h('div', { class: 'muted' }, rt('xKept', { kept: (st.kept || 0) + (tt.kept || 0), formula: (st.formula || 0) + (tt.formula || 0) })),
        report.missing.length ? h('div', { class: 'muted' }, rt('xMissing', { n: report.missing.length, list: report.missing.slice(0, 12).join(', ') })) : null,
        report.noWeek ? h('div', { class: 'muted' }, rt('xNoWeek', { n: report.noWeek })) : null));
    } catch (e) {
      console.error('export', e);
      fill(status, h('span', { class: 'bad' }, (e && e.message) || String(e)));
    }
  };
  const pick = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => pick.files[0] && run(pick.files[0].name, pick.files[0].arrayBuffer()) });
  sheet(h('h2', { class: 'card-title' }, rt('xTitle')), h('p', { class: 'muted small' }, rt('xLead')), modeSel, box, pick, status);
  (async () => {
    const saved = await idbGet('template');
    fill(box,
      saved ? h('button', { class: 'btn btn-dark', onclick: () => run(saved.name, Promise.resolve(saved.bytes)) }, icon('download'), rt('xSaved', { name: saved.name, at: fdate(String(saved.at).slice(0, 10)) })) : h('p', { class: 'small muted' }, rt('xNoSaved')),
      h('button', { class: 'btn', onclick: () => pick.click() }, icon('cloud'), rt('xPick')));
  })();
}
