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
    risks: 'Підказки до матриці ризиків', risksHint: 'Одна матриця субпроєкту: підказки з Prozorro, таблиці й договорів на контролі (ціни, змови, оплати, підрядник, правила програми); оцінку ставить експерт.',
    note: 'Нотатка команди', saveNote: 'Зберегти', saved: 'Збережено', payments: 'Платежі в Казначействі', loadPayments: 'Показати платежі замовника підряднику',
    paidSum: 'Сплачено {sum} ({n} платежів) з {from}', noPayments: 'Платежів не знайдено', tablePaid: 'За аркушем Payments: {sum}',
    updated: 'оновлено {at}', never: 'ще не оновлювалось', noAccess: 'Реєстр доступний лише учасникам команди.',
    sheetTender: 'Закупівля', sheetStatus: 'Статус', sheetBidders: 'Учасники', sheetContract: 'Договір', sheetPaid: 'Сплачено', sheetRules: 'Правила програми',
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
    mark_td: 'ТД перевірено', mark_assist: 'Супровід', mark_monitor: 'Моніторинг', markHint: 'Відмітка команди (стовпці TD Checking / Tender Assistance / Tender Monitoring)', xJournal: 'Журнал', xTasks: 'Завдання', overall: 'Загальна оцінка: {n}', overallHint: 'За формулою робочої таблиці (стовпець M)', acceptHints: 'Прийняти підказки ({n})', from_own: 'оцінка експерта', from_table: 'з таблиці', from_hint: 'підказка — не прийнята', from_none: 'немає даних', orphans: 'Виплати в Payments без рядка в SPs: {list}', orphansTitle: 'Оплати без субпроєкту: {n} кодів на {sum}', orphansText: 'На аркуші Payments є суми оплат за цими кодами, але на аркуші SPs рядка з таким кодом немає, тож монітор не може віднести їх до жодного субпроєкту. Можливо, субпроєкт прибрали з SPs або код записано інакше (наприклад, «_A» замість «-A»). Варто додати рядок у SPs або виправити код у Payments.',
    lvl0: 'немає', lvl1: 'низький', lvl2: 'середній', lvl3: 'високий', cancel: 'Скасувати',
    stTitle: 'Стан субпроєкту', stPct: '% виконання', stUpd: 'Дата оновлення', stComment: 'Коментар', stSave: 'Зберегти', stContract: 'Договір підряду', stDates: 'Строки', stStart: 'початок {date}', stEnd: 'завершення {date}',
    stPaid: 'Оплачено (Payments)', stUpdApp: 'оновлено {date} · {who}', stUpdTable: 'з таблиці, оновлено {date}', stTableWas: 'У таблиці було (оновлено {date})',
    addSp: 'Додати субпроєкт', editSp: 'Редагувати', spAdd: 'Додати', manualTag: 'додано вручну', addSpHint: 'Субпроєкт, якого ще немає в таблиці. Код — як у таблиці (OD08_05); при вивантаженні в таблицю такий рядок треба додати в SPs самому — монітор рядків не додає.',
    f_code: 'Код', f_programme: 'Програма', f_batch: 'Пул (Batch)', f_office: 'Офіс', f_name_uk: 'Назва (укр)', f_name_en: 'Назва (англ)', f_expert: 'Експерт', f_beneficiary: 'Замовник / кінцевий бенефіціар', f_beneficiary_id: 'ЄДРПОУ замовника', f_pz: 'Закупівлі в Prozorro (необов’язково)',
    spCodeBad: 'Код має бути як OD08_05 або OD08_05-A', spExists: 'Субпроєкт {code} уже є', spNameNeeded: 'Вкажіть назву', spAdded: 'Додано {code}', spSaved: 'Збережено {code}',
    linkTitle: 'Прив’язати закупівлю вручну', linkHint: 'Вставте ідентифікатор або посилання Prozorro — можна кілька. Монітор перевірить, що закупівля існує, прив’яже її й одразу завантажить дані.', linkPh: 'UA-2026-01-01-000000-a або посилання prozorro.gov.ua', linkBad: 'Не бачу ідентифікатора виду UA-2026-01-01-000000-a', linkEmpty: 'Вставте ідентифікатор закупівлі', linkChecking: 'Перевіряю в Prozorro…', linkNotFound: 'не знайдено в Prozorro: {list}', linkLoading: 'Прив’язано, завантажую дані…', linkDone: 'Прив’язано: {list}', thousand: 'тис. грн', subvTitle: 'Субвенція за розпорядженням КМУ', subvBudgetTitle: 'Субвенція громаді за програмою {prog}', subvBudgetNote: 'Цю програму КМУ розподіляє лише по громадах: сума — на всі її проєкти в громаді.', subvOrder: 'Розпорядження № {n}', subvResolution: 'Постанова № {n}', subvOriginal: 'Початково, {date}', subvEdition: 'Ред. {date}',
    adeqTitle: 'Достатність субвенції цього року', adeqTable: 'у таблиці: {s}', adeqTableNeed: 'Додаткова потреба за таблицею', adeqNoTracked: 'У таблиці: {s}. Щоб монітор оцінив сам, відстежуйте договори субпроєкту.',
    adeqDiff: 'Таблиця каже «{table}», за даними монітора — «{ours}». Варто перевірити.', adeqHint: 'Сума за відстежуваними договорами субпроєкту ({n}): прогноз робіт до 31 грудня на частку кредиту проти залишку субвенції.',
    subvTableEmpty: 'У таблиці субвенцію на рік не заповнено; за чинною редакцією розпорядження — {order}.',
    subvTableDiff: 'У таблиці субвенція на рік {table}, у чинній редакції розпорядження — {order}.', h_subvDropped: 'проєкт вилучено з розподілу субвенції (ред. {date})', h_subvToken: 'субвенцію зменшено з {from} до символічної 1 тис. (ред. {date})', h_subvTokenOnly: 'у розподілі лише символічна 1 тис. (ред. {date})', h_subvCut: 'субвенцію зменшено з {from} до {to} (ред. {date})', autoLinked: 'прив’язано автоматично', candTitle: 'Можливі закупівлі за назвою', linkAll: 'Прив’язати всі ({n})', candHint: 'Знайдено за назвою субпроєкту; прив’яжіть ті, що стосуються його.',
    refreshDone: 'Оновлено: з ID у таблиці {linked}, знайдено за назвою {auto}, є варіанти для підтвердження {cand}, не знайдено {none}, лише англ. назва {noName}', refreshN: 'Оновити з Prozorro ({n})', pickExpert: 'Оберіть експерта: оновлюються лише його субпроєкти',
    trackAll: 'Відстежувати мої з таблиці ({n})', trackConfirm: 'Поставити на відстеження договори й закупівлі ваших {n} субпроєктів? Діючі договори — на контроль, закупівлі без договору — до підписання.',
    tracking: 'Відстеження: {n} з {total}, додано {added}…', trackDone: 'На відстеження додано {added}, уже було {already}, не вдалося {failed}',
    denied: 'Немає дозволу на запис у реєстр — перевірте, що ви увійшли акаунтом зі списку доступу.', refreshFailed: 'Не оновилось субпроєктів: {n}',
    xSheet: 'Монітор', xTenders: 'Закупівлі', paidShort: 'опл. {pct}%', subvention: 'Субвенція', subvPaid: 'сплачено {sum}', paidSheet: 'Оплачено (аркуш Payments)',
    comment: 'Коментар', next: 'Наступна дія', tableScore: 'оцінка з таблиці',
    pfOpen: "Зведення портфеля",
    pfEyebrow: "Показники угоди ЄІБ–ПРООН",
    pfTitle1: "Зведення",
    pfTitle2: "портфеля",
    pfLead: "Показники результату 2 «Відповідність і якість субпроєктів» (угода ЄІБ–ПРООН від 25.02.2026) за реєстром, журналом експертів і перевірками правил програми.",
    pfBack: "← Субпроєкти",
    pfExport: "Вивантажити xlsx",
    pfAll: "Увесь час",
    pf_k21: "Невідповідності, усунені заходами",
    pf_k22: "Субпроєкти з перевіркою проєкту й вартості",
    pf_k23: "Антикорупційні перевірки підрядників",
    pf_k24: "Виїзні перевірки (spot checks)",
    pf_k25: "Тендери на роботи під моніторингом",
    pf_k26: "Тендери, що відповідають вимогам ЄІБ",
    pfTarget: "ціль: {n}",
    pfTargetPct: "ціль: не менше {n}%",
    pfSub26: "Відповідають {n} з {of} завершених; не перевірено (немає дат у таблиці) — {na}.",
    pfSub25: "Усі закупівлі робіт у таблиці за роком оголошення; з відміткою Tender Monitoring — {m}.",
    pfSub24: "Записи VISIT у журналі (у монітора й у тижневих стовпцях таблиці). На об’єктах, що будуються, менше 2 виїздів — {n}.",
    pfSub23: "Закупівлі з відміткою AC Assessment в аркуші Tenders.",
    pfSub22: "{n} з {of} субпроєктів: запис COST VERIFICATION у журналі або відмітка Price Verification. Для нових субпроєктів оберіть їхній пул (Batch).",
    pfSub21: "Рахуються завдання експертів за рік: виконано {n} з {of}.",
    pfHint: "Відповідність тендерів рахується за правилами, спільними для всіх редакцій: строк подання (20 днів для робіт; для технагляду й консультанта 15, а в ПВУ і НКПВУ з 13.07.2026 — 20) за датами оголошення й розкриття з таблиці та підписання договору не раніше ніж через 5 днів після рішення. Для закупівель на контролі додаються перевірки монітора (забезпечення пропозиції тощо). Порушення правил ранніх редакцій показано як «перевірити» й не зменшує відсоток.",
    pfOverview: "Портфель",
    pfSps: "Субпроєктів",
    pfBuilding: "Будуються (договір робіт підписано, не завершено)",
    pfRatings: "Загальна оцінка ризику",
    pfR3: "високий — {n}",
    pfR2: "середній — {n}",
    pfR1: "низький — {n}",
    pfRnone: "без оцінки — {n}",
    pfFunding: "Достатність фінансування (таблиця)",
    pfTendersAll: "Закупівлі за період",
    pfTendersLine: "{n} оголошено, {fin} завершено",
    pfBadTitle: "Тендери з порушеннями правил: {n}",
    pfNoBad: "Порушень за даними не видно.",
    pfKind: "Тип",
    pfIssued: "Оголошено",
    pfWhy: "Що не так",
    pfR_period: "строк подання {days} дн. замість {min}",
    pfR_standstill: "договір підписано через {days} дн. після рішення",
    pfR_bid_security: "забезпечення пропозиції не за правилами",
    pfR_method: "процедура не відповідає порогу",
    pfR_eligibility: "країна реєстрації учасника",
    pfR_direct: "неконкурентна процедура — потрібна відсутність заперечень ЄІБ",
    pfFewVisits: "Об’єкти з менш ніж 2 виїздами: {n}",
    pfFewVisitsHint: "Угода вимагає щонайменше 2 виїзних перевірок на субпроєкт (3–4 на великих). Рахуються всі записи VISIT.",
    pfOversight: "Технагляд та інженер-консультант",
    pfNoTs: "Будуються без закупівлі технагляду: {n}",
    pfNoCsc: "Від €3 млн без інженера-консультанта: {n}",
    pfOversightHint: "За аркушем Tenders (тип TS / IC) і прив’язаними закупівлями Prozorro; вартість субпроєкту — Total Investment Cost.",
    pfXTitle: "Зведення портфеля — {y}",
    pfXSub: "Монітор розрахунків, {date}; субпроєктів: {n}",
    pfXId: "№",
    pfXIndicator: "Показник",
    pfXValue: "Значення",
    pfXNum: "Чисельник",
    pfXDen: "Знаменник",
    pfXTarget: "Ціль",
    pfXName: "Назва",
    pfXStatus: "Статус",
    pfXOpening: "Розкриття",
    pfXDays: "Днів подання",
    pfXAward: "Рішення",
    pfXContract: "Договір",
    pfXStandstill: "Днів до договору",
    pfXVerdict: "Висновок",
    pfXOpen: "триває",
    pfV_ok: "відповідає",
    pfV_bad: "порушення",
    pfV_na: "не перевірено",
    pfToCheck: "перевірити",
    pfXVisitsY: "Виїздів за період",
    pfXVisitsAll: "Виїздів усього",
    pfXCost: "Перевірка вартості",
    pfXTs: "Технагляд",
    pfXCsc: "Інженер-консультант",
    pfXRating: "Оцінка",
    pfYes: "так", pfAnyBatch: "Усі пули",
    colStage: "Етап", riskShort: "ризик {n}",
    newsNone2: "Монітор ще не веде договорів цього субпроєкту: вони стають на контроль самі, коли менеджер субпроєкту відкриває застосунок.",
    sigEyebrow: "Сигнали",
    sigTitle1: "Що змінилось",
    sigTitle2: "по субпроєктах",
    sigLead: "Нове на договорах і закупівлях, які монітор веде, і те, що з даних субпроєкту треба зробити: прострочення, оплати ЄІБ, що чекають, прострочені завдання.",
    sigMine: "Мої ({who})",
    sigAll: "Усі субпроєкти",
    sigMore: "і ще {n} — у субпроєкті",
    sigNone: "Нових сигналів немає.",
    sigTask: "прострочене завдання: {text}",
    autoNote2: "Оновлюються автоматично субпроєкти, де менеджер — {who}: те, що триває (закупівля, діючі договори), а завершене знімається само.",
    autoDone2: "Автоконтроль: додано {added}, знято завершених {removed}",
    autoStatus2: "Автоконтроль ({n} субпроєктів): додано {added}, знято {removed}, не вдалося {failed}",
    managerTag: "Менеджер: {who}",
    takeOver: "Взяти на себе",
    takeOverHint: "Субпроєкт стане вашим: монітор оновлюватиме його у вашому застосунку",
    takenOver: "{code} тепер ваш — монітор його оновлює",
    pAuto: "стане на контроль сам",
    pNotMine: "оновлює менеджер субпроєкту",
    pTitle: "Закупівлі субпроєкту",
    pNone: "не знайдено",
    pCscNotNeeded: "не потрібен (до €3 млн)",
    pSigned: "договір {what}",
    pRunning: "триває тендер",
    pNoContractYet: "договору ще немає",
    pProcN: "процедур: {n}",
    pNoChecks: "немає даних для перевірки",
    pBad: "порушення в {n} з {of}",
    pAllOk: "усі {n} відповідають",
    pAttempt: "Спроба {n} з {of}",
    pSheetOnly: "лише в таблиці",
    pDossier: "Досьє",
    pUnlinkHint: "Закупівля не стосується субпроєкту",
    pMethod: "Процедура",
    pExpected: "Очікувана вартість",
    pDates: "Оголошено → розкриття",
    pDays: "{n} дн.",
    pBids: "Пропозицій",
    pRejected: "відхилено {n}",
    pContract: "Договір",
    pTo: "до {date}",
    pChanges: "змін: {n}",
    pNoContractEnded: "договору немає — процедура не відбулась",
    pNoContract: "договору ще немає",
    pMarks: "Відмітки команди:",
    pSasu: "ДАСУ: моніторинг",
    pSasuViol: "ДАСУ: порушення",
    pAmcu: "АМКУ: скарг {n}, відкритих {open}",
    pAc: "AC перевірено",
    pPrice: "Ціну перевірено",
    pAdd: "Додати закупівлю",
    pfHow: "Як рахуються показники",
    dataMenu: "Дані",
    uploadHint: "Compliance Working Table (.xlsx): оновлює реєстр, нічого не стирає",
    exportHint: "Вписати дані монітора у вашу робочу таблицю",
    fAttention: "Потребують уваги",
    fLate: "Прострочені",
    fSignals: "Нові сигнали",
    fHigh: "Високий ризик",
    anyStage: "Усі етапи",
    sortBy: "Сортування",
    sort_code: "За кодом",
    sort_attention: "Спершу ті, що потребують уваги",
    sort_risk: "За ризиком",
    sort_late: "За простроченням",
    sort_visit: "Давно не було виїзду",
    mrdUpload: "Реєстр оплат Мінрозвитку",
    mrdUploadHint: "Завантажити реєстр оплат з коштів позики ЄІБ (xlsx Мінрозвитку)",
    mrdSaving: "Зберігаю оплати: субпроєкт {n} з {total}…",
    mrdDone: "Реєстр оплат: записано субпроєктів {n} (у файлі {found}, немає в реєстрі {missing})",
    mrdDelta: "нових записів {added}, оновлено {changed}",
    mrdBy: "завантажив {who}",
    mrdTitle: "Оплати ЄІБ за реєстром Мінрозвитку",
    mrdNone: "Реєстр оплат Мінрозвитку ще не завантажено: там оплати з коштів позики ЄІБ (рахунки в Укрексімбанку), яких Казначейство не показує.",
    mrdAsOf: "завантажено {date} {file}",
    mrdPaid: "Сплачено",
    mrdEib: "ЄІБ {sum}",
    mrdLocal: "місцевий бюджет {sum}",
    mrdPct: "{pct}% ціни робіт",
    mrdLast: "Остання оплата",
    mrdWaitingL: "Чекають оплати",
    mrdWaitingV: "{n}, найдовше {days} дн.",
    mrdNoWaiting: "немає",
    mrdSpeed: "Швидкість за рік",
    mrdSpeedV: "медіана {med} дн. від отримання документів до оплати ({n} оплат, довше 30 днів — {slow})",
    mrdTerm: "Строк дії договору робіт",
    mrdAfterTerm: "оплат після строку: {n} — перевірте додаткові угоди",
    mrdContracts: "Договори",
    mrdOrg: "Виконавець",
    mrdSum: "Сума (ЄІБ + місцевий)",
    mrdGuarantee: "Гарантія",
    mrdPcr: "Результати торгів в ЄІБ",
    mrdNoPcrShort: "не надіслано",
    mrdTo: "до {date}",
    mrdPayments: "Оплати ({n})",
    mrdReceived: "Отримано від КБ",
    mrdPaidOn: "Сплачено",
    mrdDays: "Днів",
    mrdWhat: "Призначення",
    mrdEibCol: "ЄІБ",
    mrdLocalCol: "Місцевий",
    mrdNote: "Акт / коментар",
    mrdWait: "чекає {n} дн.",
    mrdK_works: "виконані роботи",
    mrdK_ts: "технагляд",
    mrdK_csc: "інженер-консультант",
    mrdK_advance: "аванс",
    mrdK_advance_close: "закриття авансу",
    mrdK_refund: "повернення",
    mrdK_other: "інше",
    mrdHint: "Дані реєстру Мінрозвитку, як їх завантажила команда. Днів — від отримання документів від кінцевого бенефіціара до оплати.",
    h_mrdWaiting: "оплат ЄІБ чекають {n}, найдовше {days} дн.",
    h_mrdSlow: "оплат довше 30 днів: {n} з {of} за рік",
    h_mrdAfterTerm: "оплати робіт після строку договору ({date}): {n}",
    h_mrdNoPcr: "результати торгів не надіслано в ЄІБ, а оплати є",
    pfMrd: "Оплати ЄІБ (реєстр Мінрозвитку)",
    pfMrdSpeed: "Від документів до оплати",
    pfMrdSpeedV: "{n} оплат за період: медіана {med} дн., 9 з 10 — до {p90} дн.",
    pfMrdWaiting: "Чекають довше 14 днів: {n}",
    pfMrdAfterTerm: "Оплати робіт після строку договору: {n}",
    pfMrdNoPcr: "Результати торгів не надіслано в ЄІБ: {n}",
    pfMrdHint: "Субпроєктів у реєстрі оплат: {n}. Затримки оплат угода ЄІБ–ПРООН просить повідомляти ЄІБ, Мінфіну й Мінрозвитку.",
    fromContract: "договір {who}: {why}",
    lateBy: "прострочено {n} дн.",
    stepFailed: "невдалих: {n}",
    stepRunning: "триває {n} дн.",
    autoProgress: "Автоконтроль: субпроєкт {n} з {total}, додано {added}…",
    autoDone: "На контроль автоматично додано договорів і закупівель: {added}",
    autoStatus: "Автоконтроль ({n} субпроєктів): додано {added}, не вдалося {failed}",
    autoNote: "Договори субпроєктів {who} ставляться на контроль автоматично раз на добу.",
    autoRun: "Перевірити зараз",
    colWork: "Робота експерта",
    signedOn: "договір від {date}",
    newSignals: "нових сигналів: {n}",
    lastVisit: "виїзд {date}",
    noVisit: "виїздів не було",
    stage_prep: "Підготовка",
    stage_tender: "Тендер",
    stage_retender: "Повторний тендер",
    stage_contract: "Договір підписано",
    stage_works: "Будівництво",
    stage_done: "Завершено",
    stage_suspended: "Призупинено",
    stage_withdrawn: "Ініційовано вилучення",
    tab_overview: "Огляд",
    tab_procurement: "Закупівлі",
    tab_contracts: "Договори",
    tab_finance: "Фінансування",
    tab_work: "Робота",
    stageTitle: "Шлях субпроєкту",
    step_subvention: "Субвенція",
    step_tender: "Тендер на роботи",
    step_contract: "Договір підряду",
    step_works: "Будівництво",
    step_done: "Завершення",
    stepSubv: "у розподілі КМУ: {sum}",
    stepTenders: "закупівель робіт: {n}",
    stageFromTable: "Етап — за статусом субпроєкту в таблиці.",
    stageFromData: "Етап — за даними Prozorro й таблиці (новішими за статус у таблиці).",
    newsTitle: "Нове з договорів на контролі",
    newsNone: "Жоден договір субпроєкту ще не на контролі — поставте його у вкладці «Договори».",
    newsQuiet: "На контролі {n}; нових сигналів після постановки немає.",
    noContracts: "Договорів у прив’язаних закупівлях ще немає.",
    contractsHint: "Договори всіх прив’язаних закупівель: роботи, технагляд, інженер-консультант. На контролі монітор щодня бачить платежі, акти, зміни й правила програми.",
    role_works: "Роботи",
    role_ts: "Технагляд",
    role_csc: "Інженер-консультант",
    role_author: "Авторський нагляд",
    role_design: "Проєктування",
    role_other: "Інше",
    rulesBad: "порушень правил: {n}",
    checksTitle: "Перевірка закупівель за правилами програми",
    checksHint: "За датами аркуша Tenders: строк подання й підписання договору; для закупівель на контролі — і перевірки монітора. Деталі — у досьє договору.",
    fInvest: "Вартість інвестицій",
    fEib: "Фінансування ЄІБ",
    fContract: "Вартість договору будівництва",
    fSubvYear: "Субвенція цього року (таблиця)",
    fFunding: "Достатність фінансування",
    fNeed: "додаткова потреба {sum}",
    pfMissing: "немає",
    pfXSheet1: "Показники",
    pfXSheet2: "Тендери",
    pfXSheet3: "Субпроєкти",
    pfXFile: "Зведення портфеля {y} {date}",
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
    risks: 'Hints for the risk matrix', risksHint: "One matrix for the sub-project: hints from Prozorro, the table and the contracts on control (prices, collusion, payments, contractor, programme rules); the expert sets the rating.",
    note: 'Team note', saveNote: 'Save', saved: 'Saved', payments: 'Treasury payments', loadPayments: "Show the beneficiary's payments to the contractor",
    paidSum: '{sum} paid ({n} payments) since {from}', noPayments: 'No payments found', tablePaid: 'Payments sheet: {sum}',
    updated: 'updated {at}', never: 'not refreshed yet', noAccess: 'The registry is open to team members only.',
    sheetTender: 'Procurement', sheetStatus: 'Status', sheetBidders: 'Bidders', sheetContract: 'Contract', sheetPaid: 'Paid', sheetRules: 'Programme rules',
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
    mark_td: 'TD checked', mark_assist: 'Assistance', mark_monitor: 'Monitoring', markHint: "The team's mark (TD Checking / Tender Assistance / Tender Monitoring columns)", xJournal: 'Journal', xTasks: 'Tasks', overall: 'Overall rating: {n}', overallHint: 'By the working table formula (column M)', acceptHints: 'Accept hints ({n})', from_own: "expert's rating", from_table: 'from the table', from_hint: 'hint — not accepted', from_none: 'no data', orphans: 'Payments with no row in SPs: {list}', orphansTitle: 'Payments with no sub-project: {n} codes, {sum}', orphansText: 'The Payments sheet has payments under these codes, but the SPs sheet has no row with such a code, so the monitor cannot put them to any sub-project. The sub-project may have been taken off SPs or the code is written differently (e.g. “_A” instead of “-A”). Add the row to SPs or correct the code in Payments.',
    lvl0: 'none', lvl1: 'low', lvl2: 'medium', lvl3: 'high', cancel: 'Cancel',
    stTitle: 'Sub-project status', stPct: '% of completion', stUpd: 'Update date', stComment: 'Comment', stSave: 'Save', stContract: 'Works contract', stDates: 'Dates', stStart: 'start {date}', stEnd: 'completion {date}',
    stPaid: 'Paid (Payments)', stUpdApp: 'updated {date} · {who}', stUpdTable: 'from the table, updated {date}', stTableWas: 'The table had (updated {date})',
    addSp: 'Add a sub-project', editSp: 'Edit', spAdd: 'Add', manualTag: 'added by hand', addSpHint: "A sub-project the table does not have yet. The code as in the table (OD08_05); when exporting, add such a row to SPs yourself: the monitor does not add rows.",
    f_code: 'Code', f_programme: 'Programme', f_batch: 'Batch', f_office: 'Office', f_name_uk: 'Name (Ukrainian)', f_name_en: 'Name (English)', f_expert: 'Expert', f_beneficiary: 'Promoter / final beneficiary', f_beneficiary_id: "Promoter's EDRPOU", f_pz: 'Prozorro procurements (optional)',
    spCodeBad: 'The code must look like OD08_05 or OD08_05-A', spExists: 'Sub-project {code} already exists', spNameNeeded: 'Give a name', spAdded: 'Added {code}', spSaved: 'Saved {code}',
    linkTitle: 'Link a procurement by hand', linkHint: 'Paste a Prozorro ID or link, several at once if needed. The monitor checks the procurement exists, links it and loads its data at once.', linkPh: 'UA-2026-01-01-000000-a or a prozorro.gov.ua link', linkBad: 'No ID like UA-2026-01-01-000000-a found', linkEmpty: 'Paste a procurement ID', linkChecking: 'Checking in Prozorro…', linkNotFound: 'not found in Prozorro: {list}', linkLoading: 'Linked, loading the data…', linkDone: 'Linked: {list}', thousand: 'thousand UAH', subvTitle: 'Subvention by the CMU order', subvBudgetTitle: 'Subvention to the community under {prog}', subvBudgetNote: 'The CMU spreads this programme by community only: the amount covers all its projects there.', subvOrder: 'Order No. {n}', subvResolution: 'Resolution No. {n}', subvOriginal: 'Original, {date}', subvEdition: 'Ed. {date}',
    adeqTitle: "This year's subvention adequacy", adeqTable: 'table: {s}', adeqTableNeed: 'Additional needs per the table', adeqNoTracked: 'Table: {s}. Track the sub-project\'s contracts for the monitor to estimate it.',
    adeqDiff: 'The table says “{table}”, the monitor\'s data say “{ours}”. Worth checking.', adeqHint: "Sum over the sub-project's tracked contracts ({n}): works forecast to 31 December times the loan share, against the subvention left.",
    subvTableEmpty: 'The table has no subvention for the year; the order in force has {order}.',
    subvTableDiff: 'The table has {table} of subvention for the year; the order in force has {order}.', h_subvDropped: 'project dropped from the subvention (ed. {date})', h_subvToken: 'subvention cut from {from} to a token 1 thousand (ed. {date})', h_subvTokenOnly: 'only a token 1 thousand in the order (ed. {date})', h_subvCut: 'subvention cut from {from} to {to} (ed. {date})', autoLinked: 'linked automatically', candTitle: 'Possible procurements by name', linkAll: 'Link all ({n})', candHint: 'Found by the sub-project name; link the ones that belong to it.',
    refreshDone: 'Refreshed: with ids in the table {linked}, found by name {auto}, candidates to confirm {cand}, not found {none}, English name only {noName}', refreshN: 'Refresh from Prozorro ({n})', pickExpert: 'Choose an expert: only their sub-projects are refreshed',
    trackAll: 'Track mine from the table ({n})', trackConfirm: 'Put the contracts and procurements of your {n} sub-projects on control? Contracts in force go on control, procurements without a contract until it is signed.',
    tracking: 'Tracking: {n} of {total}, {added} added…', trackDone: '{added} added to tracking, {already} already there, {failed} failed',
    denied: 'No permission to write to the registry — check you are signed in with an account on the access list.', refreshFailed: 'Not refreshed: {n} sub-projects',
    xSheet: 'Monitor', xTenders: 'Procurements', paidShort: 'paid {pct}%', subvention: 'Subvention', subvPaid: 'paid {sum}', paidSheet: 'Paid (Payments sheet)',
    comment: 'Comment', next: 'Next action', tableScore: 'rating from the table',
    pfOpen: "Portfolio summary",
    pfEyebrow: "EIB–UNDP agreement indicators",
    pfTitle1: "Portfolio",
    pfTitle2: "summary",
    pfLead: "Output 2 indicators \"Sub-Project Compliance and Quality Assurance\" (EIB–UNDP agreement of 25.02.2026), from the registry, the experts' journal and the programme rule checks.",
    pfBack: "← Sub-projects",
    pfExport: "Download xlsx",
    pfAll: "All time",
    pf_k21: "Non-compliance cases resolved",
    pf_k22: "Sub-projects with design and unit cost checks",
    pf_k23: "Anti-corruption assessments of contractors",
    pf_k24: "Spot checks",
    pf_k25: "Works tenders monitored",
    pf_k26: "Tenders compliant with EIB requirements",
    pfTarget: "target: {n}",
    pfTargetPct: "target: at least {n}%",
    pfSub26: "{n} of {of} completed are compliant; not checked (no dates in the table): {na}.",
    pfSub25: "All works procurements in the table by the year announced; marked Tender Monitoring: {m}.",
    pfSub24: "VISIT entries in the journal (the monitor's and the table's weekly columns). Sites under construction with fewer than 2 visits: {n}.",
    pfSub23: "Procurements ticked AC Assessment in the Tenders sheet.",
    pfSub22: "{n} of {of} sub-projects: a COST VERIFICATION entry or Price Verification ticked. For newly selected ones pick their batch.",
    pfSub21: "Counted as the experts' tasks of the year: {n} of {of} done.",
    pfHint: "Tender compliance is judged by the rules every edition shares: the bid period (20 days for works; 15 for supervision and the consulting engineer, 20 under URP and ERP from 13 Jul 2026) from the table's notice and opening dates, and signing no sooner than 5 days after the award. Procurements on control add the monitor's checks (bid security and others). A broken rule of an earlier edition is shown as worth checking and does not lower the share.",
    pfOverview: "Portfolio",
    pfSps: "Sub-projects",
    pfBuilding: "Under construction (works contract signed, not finished)",
    pfRatings: "Overall risk rating",
    pfR3: "high — {n}",
    pfR2: "medium — {n}",
    pfR1: "low — {n}",
    pfRnone: "not rated — {n}",
    pfFunding: "Funding adequacy (table)",
    pfTendersAll: "Procurements in the period",
    pfTendersLine: "{n} announced, {fin} completed",
    pfBadTitle: "Tenders breaking the rules: {n}",
    pfNoBad: "Nothing broken seen in the data.",
    pfKind: "Type",
    pfIssued: "Announced",
    pfWhy: "What is wrong",
    pfR_period: "bid period {days} days instead of {min}",
    pfR_standstill: "contract signed {days} days after the award",
    pfR_bid_security: "bid security against the rules",
    pfR_method: "procedure below its threshold",
    pfR_eligibility: "bidder's country of registration",
    pfR_direct: "non-competitive procedure — needs the EIB's no-objection",
    pfFewVisits: "Sites with fewer than 2 visits: {n}",
    pfFewVisitsHint: "The agreement asks for at least 2 spot checks per sub-project (3–4 on large ones). All VISIT entries count.",
    pfOversight: "Technical supervision and consulting engineer",
    pfNoTs: "Under construction with no supervision procurement: {n}",
    pfNoCsc: "From €3M with no consulting engineer: {n}",
    pfOversightHint: "By the Tenders sheet (type TS / IC) and the linked Prozorro procurements; the sub-project cost is Total Investment Cost.",
    pfXTitle: "Portfolio summary — {y}",
    pfXSub: "Spending monitor, {date}; sub-projects: {n}",
    pfXId: "No",
    pfXIndicator: "Indicator",
    pfXValue: "Value",
    pfXNum: "Numerator",
    pfXDen: "Denominator",
    pfXTarget: "Target",
    pfXName: "Name",
    pfXStatus: "Status",
    pfXOpening: "Opening",
    pfXDays: "Bid days",
    pfXAward: "Award",
    pfXContract: "Contract",
    pfXStandstill: "Days to contract",
    pfXVerdict: "Verdict",
    pfXOpen: "ongoing",
    pfV_ok: "compliant",
    pfV_bad: "broken",
    pfV_na: "not checked",
    pfToCheck: "to check",
    pfXVisitsY: "Visits in the period",
    pfXVisitsAll: "Visits in all",
    pfXCost: "Cost check",
    pfXTs: "Supervision",
    pfXCsc: "Consulting engineer",
    pfXRating: "Rating",
    pfYes: "yes", pfAnyBatch: "All batches",
    colStage: "Stage", riskShort: "risk {n}",
    newsNone2: "The monitor follows no contract of this sub-project yet: they go on control by themselves when its manager opens the app.",
    sigEyebrow: "Signals",
    sigTitle1: "What changed",
    sigTitle2: "by sub-project",
    sigLead: "News on the contracts and procurements the monitor follows, and what the sub-project's data say needs doing: lateness, EIB payments waiting, overdue tasks.",
    sigMine: "Mine ({who})",
    sigAll: "All sub-projects",
    sigMore: "and {n} more — in the sub-project",
    sigNone: "No new signals.",
    sigTask: "overdue task: {text}",
    autoNote2: "Sub-projects managed by {who} are kept up to date automatically: what is alive (the procurement, contracts in force) is followed, and what ended leaves by itself.",
    autoDone2: "Auto control: {added} added, {removed} ended removed",
    autoStatus2: "Auto control ({n} sub-projects): {added} added, {removed} removed, {failed} failed",
    managerTag: "Manager: {who}",
    takeOver: "Take over",
    takeOverHint: "The sub-project becomes yours: the monitor keeps it up to date in your app",
    takenOver: "{code} is yours now — the monitor keeps it up to date",
    pAuto: "goes on control by itself",
    pNotMine: "kept up to date by the sub-project's manager",
    pTitle: "The sub-project's procurements",
    pNone: "not found",
    pCscNotNeeded: "not needed (under €3M)",
    pSigned: "contract {what}",
    pRunning: "tender under way",
    pNoContractYet: "no contract yet",
    pProcN: "procedures: {n}",
    pNoChecks: "nothing to check yet",
    pBad: "broken in {n} of {of}",
    pAllOk: "all {n} compliant",
    pAttempt: "Attempt {n} of {of}",
    pSheetOnly: "in the table only",
    pDossier: "Dossier",
    pUnlinkHint: "The procurement is not about this sub-project",
    pMethod: "Procedure",
    pExpected: "Expected value",
    pDates: "Announced → opening",
    pDays: "{n} days",
    pBids: "Bids",
    pRejected: "{n} rejected",
    pContract: "Contract",
    pTo: "to {date}",
    pChanges: "changes: {n}",
    pNoContractEnded: "no contract — the procedure failed",
    pNoContract: "no contract yet",
    pMarks: "Team's marks:",
    pSasu: "SASU: monitoring",
    pSasuViol: "SASU: violation",
    pAmcu: "AMCU: {n} complaints, {open} open",
    pAc: "AC checked",
    pPrice: "Price checked",
    pAdd: "Add a procurement",
    pfHow: "How the indicators are counted",
    dataMenu: "Data",
    uploadHint: "Compliance Working Table (.xlsx): updates the registry, erases nothing",
    exportHint: "Write the monitor's data into your working table",
    fAttention: "Need attention",
    fLate: "Late",
    fSignals: "New signals",
    fHigh: "High risk",
    anyStage: "All stages",
    sortBy: "Sort",
    sort_code: "By code",
    sort_attention: "Needing attention first",
    sort_risk: "By risk",
    sort_late: "By lateness",
    sort_visit: "Longest without a visit",
    mrdUpload: "Mindev payments register",
    mrdUploadHint: "Upload the register of payments from the EIB loan (Mindev's xlsx)",
    mrdSaving: "Saving payments: sub-project {n} of {total}…",
    mrdDone: "Payments register: {n} sub-projects written ({found} in the file, {missing} not in the registry)",
    mrdDelta: "{added} new records, {changed} updated",
    mrdBy: "uploaded by {who}",
    mrdTitle: "EIB payments by Mindev's register",
    mrdNone: "The Mindev payments register is not uploaded yet: it has the payments from the EIB loan (Ukreximbank accounts), which the Treasury does not show.",
    mrdAsOf: "uploaded {date} {file}",
    mrdPaid: "Paid",
    mrdEib: "EIB {sum}",
    mrdLocal: "local budget {sum}",
    mrdPct: "{pct}% of the works price",
    mrdLast: "Last payment",
    mrdWaitingL: "Waiting for payment",
    mrdWaitingV: "{n}, longest {days} days",
    mrdNoWaiting: "none",
    mrdSpeed: "Speed over the year",
    mrdSpeedV: "median {med} days from documents received to payment ({n} payments, over 30 days: {slow})",
    mrdTerm: "Works contract term",
    mrdAfterTerm: "payments after the term: {n} — check the addendums",
    mrdContracts: "Contracts",
    mrdOrg: "Contractor",
    mrdSum: "Amount (EIB + local)",
    mrdGuarantee: "Guarantee",
    mrdPcr: "Tender results to the EIB",
    mrdNoPcrShort: "not sent",
    mrdTo: "to {date}",
    mrdPayments: "Payments ({n})",
    mrdReceived: "Received from the FB",
    mrdPaidOn: "Paid",
    mrdDays: "Days",
    mrdWhat: "Purpose",
    mrdEibCol: "EIB",
    mrdLocalCol: "Local",
    mrdNote: "Act / comment",
    mrdWait: "waiting {n} days",
    mrdK_works: "works done",
    mrdK_ts: "supervision",
    mrdK_csc: "consulting engineer",
    mrdK_advance: "advance",
    mrdK_advance_close: "advance closing",
    mrdK_refund: "refund",
    mrdK_other: "other",
    mrdHint: "Mindev's register as the team uploaded it. Days run from the final beneficiary's documents received to the payment.",
    h_mrdWaiting: "{n} EIB payments waiting, longest {days} days",
    h_mrdSlow: "payments over 30 days: {n} of {of} in the year",
    h_mrdAfterTerm: "works paid after the contract term ({date}): {n}",
    h_mrdNoPcr: "tender results not sent to the EIB, yet payments made",
    pfMrd: "EIB payments (Mindev register)",
    pfMrdSpeed: "From documents to payment",
    pfMrdSpeedV: "{n} payments in the period: median {med} days, 9 in 10 within {p90} days",
    pfMrdWaiting: "Waiting over 14 days: {n}",
    pfMrdAfterTerm: "Works paid after the contract term: {n}",
    pfMrdNoPcr: "Tender results not sent to the EIB: {n}",
    pfMrdHint: "Sub-projects in the payments register: {n}. The EIB–UNDP agreement asks for payment delays to be reported to the EIB, the MoF and Mindev.",
    fromContract: "contract {who}: {why}",
    lateBy: "{n} days late",
    stepFailed: "failed: {n}",
    stepRunning: "running {n} days",
    autoProgress: "Auto control: sub-project {n} of {total}, {added} added…",
    autoDone: "Put on control automatically: {added} contracts and procurements",
    autoStatus: "Auto control ({n} sub-projects): {added} added, {failed} failed",
    autoNote: "Contracts of {who}'s sub-projects go on control automatically once a day.",
    autoRun: "Check now",
    colWork: "Expert's work",
    signedOn: "contract of {date}",
    newSignals: "new signals: {n}",
    lastVisit: "visit {date}",
    noVisit: "no visits yet",
    stage_prep: "Preparation",
    stage_tender: "Tender",
    stage_retender: "Re-tender",
    stage_contract: "Contract signed",
    stage_works: "Construction",
    stage_done: "Completed",
    stage_suspended: "Suspended",
    stage_withdrawn: "Withdrawal initiated",
    tab_overview: "Overview",
    tab_procurement: "Procurement",
    tab_contracts: "Contracts",
    tab_finance: "Funding",
    tab_work: "Work",
    stageTitle: "The sub-project's road",
    step_subvention: "Subvention",
    step_tender: "Works tender",
    step_contract: "Works contract",
    step_works: "Construction",
    step_done: "Completion",
    stepSubv: "in the CMU distribution: {sum}",
    stepTenders: "works procurements: {n}",
    stageFromTable: "Stage from the sub-project's status in the table.",
    stageFromData: "Stage from Prozorro and the table (newer than the status in the table).",
    newsTitle: "News from the contracts on control",
    newsNone: "No contract of the sub-project is on control yet — put one there in the Contracts tab.",
    newsQuiet: "{n} on control; no new signals since.",
    noContracts: "No contracts in the linked procurements yet.",
    contractsHint: "Contracts of every linked procurement: works, supervision, consulting engineer. On control the monitor sees payments, acts, changes and the programme rules every day.",
    role_works: "Works",
    role_ts: "Supervision",
    role_csc: "Consulting engineer",
    role_author: "Author's supervision",
    role_design: "Design",
    role_other: "Other",
    rulesBad: "rules broken: {n}",
    checksTitle: "Procurements against the programme rules",
    checksHint: "By the Tenders sheet dates: bid period and contract signing; procurements on control add the monitor's checks. Details are in the contract's dossier.",
    fInvest: "Total investment cost",
    fEib: "EIB financing",
    fContract: "Construction contract value",
    fSubvYear: "This year's subvention (table)",
    fFunding: "Funding adequacy",
    fNeed: "additional need {sum}",
    pfMissing: "missing",
    pfXSheet1: "Indicators",
    pfXSheet2: "Tenders",
    pfXSheet3: "Sub-projects",
    pfXFile: "Portfolio summary {y} {date}",
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
  // The team shares one base: its lists open up to everyone on it.
  if (REG.access && typeof applyScope === 'function') applyScope();
  loadSubvention().then(() => { if (/^#\/(registry|$)|^$/.test(location.hash)) softRender(); });
  // The registry also names the sub-projects of the tracked list: that page redraws too.
  if (REG.access) cloud.watchRegistry((r) => { REG.rows = r.rows; REG.meta = r.meta; autoTrackSoon(); if (/^#\/(registry|tracked\/?$|$)|^$/.test(location.hash)) softRender(); });
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
    toast(msg, failed.length ? { bad: true, sticky: true } : { long: true });
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
const myManager = () => (REG.access && REG.access.expert) || DEFAULT_MANAGER;
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
      for (const p of trackPicks(pz)) {
        if (isTracked(p.cid) || off.has(p.cid)) continue;
        // A procurement already followed turns into its contract by itself.
        const t0 = (pz.tenders || []).find((x) => x.tid === p.info.tid);
        if (!p.cid.startsWith('tn') && t0 && isTracked('tn' + t0.id)) continue;
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
function mainContract(r) {
  const cs = [];
  for (const t0 of ((r.pz || {}).tenders || [])) {
    if (!isWorksTender(t0)) continue;
    for (const c of t0.contracts || []) if (c.status === 'active' || c.status === 'terminated') cs.push({ c, t0 });
  }
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

// A rating 1–3 suggested from the hints, only where the app has something to judge by: the
// sub-project's own data and the ratings of its contracts on control.
function suggestedScores(r) {
  const risk = allRisk(r), tt = r.t || {};
  const read = !!(r.pz && r.pz.at);
  const known = { r1: !!mainContract(r), r3: !!subvMatch(r) || !!tt.funding, r4: paidShare(r) != null, r5: !!mainContract(r), r7: read, r8: read };
  // A criterion the monitor rated on a contract on control is known even when all is well there.
  for (const x of spTracked(r)) for (const k of Object.keys((x.matrix || {}).scores || {})) known[k] = true;
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
  const extra = subvRisk(r), fromContracts = contractHints(r), fromMrd = mrdHints(r);
  if (!extra.length && !Object.keys(fromContracts).length && !Object.keys(fromMrd).length) return r.risk || {};
  const out = Object.assign({}, r.risk || {});
  if (extra.length) out.r3 = (out.r3 || []).concat(extra);
  for (const src of [fromContracts, fromMrd]) for (const [k, list] of Object.entries(src)) out[k] = (out[k] || []).concat(list);
  return out;
}
// One matrix, the sub-project's: what the monitor rated on its contracts on control (prices,
// collusion, payments, the contractor's standing, the programme rules) comes in as hints to it.
function contractHints(r) {
  const out = {};
  for (const x of spTracked(r)) {
    const mx = x.matrix;
    if (!mx) continue;
    const who = x.number ? '№ ' + x.number : x.tid;
    for (const [k, v] of Object.entries(mx.scores || {})) {
      if (v < 2) continue;
      const why = ((mx.why || {})[k] || []).map((w) => (typeof udWhy === 'function' ? udWhy(w) : w)).join(', ');
      (out[k] = out[k] || []).push({ level: v === 3 ? 'high' : 'medium', text: rt('fromContract', { who, why: why || rt('lvl' + v) }), contract: x.key });
    }
  }
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

const REGF = { expert: null, programme: '', stage: '', which: '', sort: 'code', q: '', page: 0 };

function registryPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  if (!REG.access) return [h('div', { class: 'card empty section' }, rt('noAccess'))];
  if (REGF.expert == null) REGF.expert = myManager();
  const rows = [...REG.rows.values()];
  const status = h('span', { class: 'muted small', id: 'reg-status' }, REG.status ? h('span', { class: REG.status.bad ? 'bad' : '' }, REG.status.text) : null);
  const file = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => file.files[0] && importFile(file.files[0]) });
  const mrdFile = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => mrdFile.files[0] && importMrd(mrdFile.files[0]) });
  const meta = REG.meta;
  // Prozorro is read only for the chosen expert's sub-projects: all 400+ would take half an hour.
  const ofExpert = () => (REGF.expert ? rows.filter((r) => spManager(r) === REGF.expert) : []);
  const refreshBtn = h('button', { class: 'btn', onclick: () => {
    const list = ofExpert();
    if (!list.length) { toast(rt('pickExpert'), { bad: true }); return; }
    refreshMany(list);
  } });
  const drawRefresh = () => { const n = ofExpert().length; fill(refreshBtn, icon('refresh'), n ? rt('refreshN', { n }) : rt('refresh')); refreshBtn.title = n ? REGF.expert : rt('pickExpert'); };
  drawRefresh();
  // One visible action (Prozorro), the rest of the data work in one menu.
  const dataMenu = actionMenu(rt('dataMenu'), [
    [rt('upload'), () => file.click(), 'upload', rt('uploadHint')],
    rows.length ? [rt('mrdUpload'), () => mrdFile.click(), 'upload', rt('mrdUploadHint')] : null,
    rows.length ? [rt('export'), () => exportDialog(), 'download', rt('exportHint')] : null,
    [rt('addSp'), () => addSpDialog(null), 'plus', null],
  ], 'db');
  const lead = h('span', null, meta ? rt('imported', { at: ftime(meta.at && meta.at.toDate ? meta.at.toDate().toISOString() : meta.at), by: meta.byName || '—', n: meta.rows }) : rt('noTable'),
    h('span', { class: 'lead-sub' }, rt('autoNote2', { who: myManager() }), ' ',
      h('button', { class: 'linkish', type: 'button', onclick: () => autoTrack(true) }, rt('autoRun'))));
  const head = pageHead(rt('eyebrow'), titleGrad(rt('title1'), rt('title2')), lead,
    h('div', { class: 'head-actions' }, rows.length ? refreshBtn : null, dataMenu, file, mrdFile, status));
  const orphans = Object.entries((meta && meta.orphans) || {});
  // Payments the table's Payments sheet has under codes its SPs sheet has no row for.
  const orphanNote = orphans.length ? h('details', { class: 'notice small section orphans' },
    h('summary', null, rt('orphansTitle', { n: orphans.length, sum: money(orphans.reduce((a, [, v]) => a + v, 0)) })),
    h('p', null, rt('orphansText')),
    h('ul', null, orphans.sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => h('li', null, h('b', null, c), ' — ' + money(v))))) : null;
  if (!rows.length) return [head];
  const experts = [...new Set(rows.map(spManager).concat([myManager()]).filter(Boolean))].sort();
  const progs = [...new Set(rows.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  // What each row is, worked out once per drawing: stage, news, risk, the expert's work.
  const facts = new Map(rows.map((r) => {
    const st = spStage(r), news = spNews(spTracked(r)), wk = spWork(r), f = mrdFacts(r);
    const overdueTask = wk.next && wk.next.due && wk.next.due < today();
    const waiting = f ? f.waiting.filter((x) => x.days > 14).length : 0;
    return [r.code, { st, news, wk, rating: overallRating(scoresOf(r).scores), overdueTask, waiting,
      attention: !!(st.late || news.signals.length || overdueTask || waiting) }];
  }));
  const F = (r) => facts.get(r.code);
  const tests = {
    attention: (r) => F(r).attention, late: (r) => !!F(r).st.late, signals: (r) => F(r).news.signals.length > 0,
    high: (r) => F(r).rating === 3, nolink: (r) => !spTids(r).length, nocontract: (r) => ['prep', 'tender', 'retender'].includes(F(r).st.stage),
  };
  const SORTS = {
    code: (a, b) => a.code.localeCompare(b.code),
    attention: (a, b) => (F(b).attention - F(a).attention) || ((F(b).rating || 0) - (F(a).rating || 0)) || a.code.localeCompare(b.code),
    risk: (a, b) => ((F(b).rating || 0) - (F(a).rating || 0)) || a.code.localeCompare(b.code),
    late: (a, b) => ((F(b).st.late || 0) - (F(a).st.late || 0)) || a.code.localeCompare(b.code),
    visit: (a, b) => String(F(a).wk.lastVisit || '').localeCompare(String(F(b).wk.lastVisit || '')) || a.code.localeCompare(b.code),
  };
  if (!SORTS[REGF.sort]) REGF.sort = 'code';
  // The filters of the fields first; the quick chips count within them.
  function base() {
    const words = REGF.q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const tt = r.t || {};
      if (REGF.expert && spManager(r) !== REGF.expert) return false;
      if (REGF.programme && tt.programme !== REGF.programme) return false;
      if (REGF.stage && F(r).st.stage !== REGF.stage) return false;
      if (words.length) {
        const m = mainContract(r);
        const text = [r.code, tt.name_uk, tt.name_en, tt.beneficiary, tt.contractor, m && (m.c.suppliers || []).map((s) => s.name + ' ' + s.code).join(' ')].join(' ').toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    });
  }
  const list = h('div'), chipsBox = h('div', { class: 'chips-row' });
  const draw = () => {
    const pool = base();
    if (REGF.which && !tests[REGF.which]) REGF.which = '';
    const shown = (REGF.which ? pool.filter(tests[REGF.which]) : pool).sort(SORTS[REGF.sort]);
    const count = (k) => pool.filter(tests[k]).length;
    fill(chipsBox, pills([['', rt('all'), pool.length], ['attention', rt('fAttention'), count('attention')], ['late', rt('fLate'), count('late')], ['signals', rt('fSignals'), count('signals')],
      ['high', rt('fHigh'), count('high')], ['nolink', rt('fNoLink'), count('nolink')], ['nocontract', rt('fNoContract'), count('nocontract')]]
      .filter((p) => p[0] === '' || p[2] || p[0] === REGF.which), REGF.which, (v) => { REGF.which = v; REGF.page = 0; draw(); }));
    pagedList(list, shown, REGF.page, { noSum: true }, (p) => { REGF.page = p; draw(); }, registryTable);
  };
  const set = (k) => (e) => { REGF[k] = e.target.value; REGF.page = 0; draw(); if (k === 'expert') drawRefresh(); };
  const q = h('input', { class: 'input grow', type: 'search', value: REGF.q, placeholder: rt('search'), 'aria-label': rt('search'), oninput: () => { REGF.q = q.value; REGF.page = 0; draw(); } });
  draw();
  return [head, orphanNote, h('div', { class: 'table-card section' },
    filterBar(q, [
      select([['', rt('anyStage')]].concat(STAGES.map((x) => [x, rt('stage_' + x)])), REGF.stage, set('stage'), rt('colStage')),
      select([['', rt('anyExpert')]].concat(experts.map((x) => [x, x])), REGF.expert, set('expert'), rt('colExpert')),
      select([['', rt('anyProgramme')]].concat(progs.map((x) => [x, x])), REGF.programme, set('programme'), 'Programme'),
      select(Object.keys(SORTS).map((k) => [k, rt('sort_' + k)]), REGF.sort, set('sort'), rt('sortBy'))], [REGF.stage, REGF.expert, REGF.programme].filter(Boolean).length),
    chipsBox,
    list)];
}

function riskChips(risk) {
  const items = RISK_KEYS.flatMap((k) => ((risk || {})[k] || []).map((x) => ({ k, level: x.level, text: x.text })));
  if (!items.length) return h('span', { class: 'faint' }, '—');
  const top = items.sort((a, b) => ['high', 'medium', 'low'].indexOf(a.level) - ['high', 'medium', 'low'].indexOf(b.level)).slice(0, 2);
  return [top.map((x) => h('div', { class: 'risk-line' }, h('span', { class: 'sev ' + x.level }, rt(x.k).replace(/^\d\.\s*/, '')), h('span', { class: 'risk-text' }, x.text))), items.length > 2 ? h('div', { class: 'faint small' }, '+' + (items.length - 2)) : null];
}

// ---- the sub-project as the main object ---------------------------------------------------------
//
// Monitoring goes from a sub-project to its procurements (works, supervision, consulting engineer) and
// their contracts. The stage says where a sub-project is on that road; the contracts on control under
// it bring their signals here.
const STAGES = ['prep', 'tender', 'retender', 'contract', 'works', 'done', 'suspended', 'withdrawn'];
const STAGE_OF_STATUS = { 'Not started': 'prep', 'Ongoing tender': 'tender', 'Re-tender': 'retender', 'Preparation for construction': 'contract',
  'Ongoing construction': 'works', Completed: 'done', Commissioned: 'done', Suspended: 'suspended', 'Withdrawal initiated': 'withdrawn' };
const RUN = ['active.enquiries', 'active.tendering', 'active.pre-qualification', 'active.pre-qualification.stand-still', 'active.auction', 'active.qualification', 'active.awarded', 'active'];
function spStage(r) {
  const tt = r.t || {}, works = (r.tenders || []).filter((x) => tKind(x.kind) === 'works');
  const pzWorks = ((r.pz || {}).tenders || []).filter((t0) => isWorksTender(t0));
  const m = mainContract(r);
  const signed = m || works.some((x) => x.status === 'Contract Signed') || !!(tt.contract_date || tt.contractor || tt.contract_sum);
  const pct = pctOf(spStatus(r).pct);
  let data = null;
  if (pct != null && pct >= 100) data = 'done';
  else if (pct > 0) data = 'works';
  else if (signed) data = 'contract';
  else if (pzWorks.some((t0) => RUN.includes(t0.status)) || works.some((x) => ['Ongoing', 'Evaluation', 'Awarded'].includes(x.status))) data = 'tender';
  else if (works.length || pzWorks.length) data = 'retender';
  const table = STAGE_OF_STATUS[tt.status] || null;
  // The table's own status unless the data show the sub-project further along (they are newer).
  const order = (s) => ['prep', 'tender', 'retender', 'contract', 'works', 'done'].indexOf(s);
  const stage = table && ['suspended', 'withdrawn'].includes(table) ? table : (data && order(data) > order(table || 'prep') ? data : table || data || 'prep');
  // Late: the contractual completion date passed with the works unfinished.
  const end = tt.completion || (m && m.c.end) || null;
  const late = end && end < today() && !['done', 'withdrawn'].includes(stage) && (pct == null || pct < 100) && ['contract', 'works', 'suspended'].includes(stage) ? dayDiff(end, today()) : null;
  const failed = works.filter((x) => /No Bids|All Rejected|Cancel/i.test(x.status || '')).length;
  const lastIssued = works.map((x) => x.issued).filter(Boolean).sort().pop() || null;
  return { stage, from: table && stage === table ? 'table' : 'data', pct, end, late, failed, lastIssued,
    signed: m ? m.c.signed : (works.find((x) => x.status === 'Contract Signed') || {}).contract_date || tt.contract_date || null };
}
const stageChip = (st) => h('span', { class: 'stage st-' + st.stage }, rt('stage_' + st.stage));
// Contracts and procurements on control that belong to this sub-project (by its Prozorro ids).
function spTracked(r) {
  const tids = new Set(spTids(r));
  return ((state.trackedIndex || {}).items || []).filter((x) => tids.has(x.tid) && onTeamList(x.key));
}
// What is new there: signals since the contract was taken on control, and the alerts of the list.
function spNews(rows) {
  const signals = rows.flatMap((x) => (x.signals || []).filter((g) => !g.base).map((g) => Object.assign({ row: x }, g)));
  const alerts = [...new Set(rows.flatMap((x) => x.alerts || []).filter((a) => a !== 'risk'))];
  return { signals, alerts };
}
// The expert's side: the next task and the last visit.
function spWork(r) {
  const next = ((r.work || {}).tasks || []).filter((x) => !x.done).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0] || null;
  const visits = activities(r).filter((a) => a.kind === 'VISIT' && a.date).map((a) => a.date).sort();
  return { next, lastVisit: visits[visits.length - 1] || null, visits: visits.length };
}

function registryTable(rows) {
  if (!rows.length) return h('div', { class: 'empty' }, t('qs.none'));
  const L = { c: rt('colCode'), s: rt('colSp'), st: rt('colStage'), k: rt('colContract'), g: rt('colProgress'), r: rt('colRisk'), w: rt('colWork') };
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile reg-table' },
    h('colgroup', null, ['c', 's', 'st', 'k', 'g', 'r', 'w'].map((k) => h('col', { class: 'rc-' + k }))),
    h('thead', null, h('tr', null, [L.c, L.s, L.st, L.k, L.g, L.r, L.w].map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => {
      const tt = r.t || {};
      const m = mainContract(r);
      const tids = spTids(r);
      const st = spStage(r), news = spNews(spTracked(r)), wk = spWork(r);
      const rating = overallRating(scoresOf(r).scores);
      const open = () => { location.hash = '#/registry/' + encodeURIComponent(r.code); };
      return h('tr', { class: 'click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
        td(L.c, { class: 'num' }, h('b', null, r.code), h('div', { class: 'cell-sub' }, join([tt.programme, tt.batch && 'B' + tt.batch])), spManager(r) ? h('div', { class: 'cell-sub clamp1' + (isMine(r) ? ' mine' : '') }, spManager(r)) : null, tt.manual ? h('div', { class: 'cell-sub' }, rt('manualTag')) : null),
        td(L.s, { class: 'w-text' }, h('div', { class: 'clamp' }, tt.name_uk || tt.name_en || '—'), h('div', { class: 'cell-sub clamp1' }, tt.beneficiary || '')),
        td(L.st, null, stageChip(st), st.late ? h('div', { class: 'cell-sub bad' }, rt('lateBy', { n: st.late })) : null,
          !tids.length ? h('div', { class: 'cell-sub' }, ((r.pz || {}).cand || []).length ? h('span', { class: 'warn-text' }, rt('candidates', { n: r.pz.cand.length })) : rt('notLinked'))
            : st.signed && ['contract', 'works'].includes(st.stage) ? h('div', { class: 'cell-sub' }, rt('signedOn', { date: fdate(st.signed) })) : null),
        td(L.k, { class: 'w-party' }, m ? [h('div', { class: 'cell-main clamp1' }, ((m.c.suppliers || [])[0] || {}).name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null]))]
          : tt.contractor ? tt.contractor : h('span', { class: 'faint' }, '—')),
        td(L.g, { class: 'num' }, join([st.pct != null ? st.pct + '%' : null, paidShare(r) != null ? rt('paidShort', { pct: paidShare(r) }) : null]) || '—'),
        td(L.r, null, h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
          rating ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][rating], title: rt('overall', { n: rating }) }, rt('riskShort', { n: rating })) : null,
          news.signals.length ? h('span', { class: 'sev high' }, rt('newSignals', { n: news.signals.length })) : null,
          news.alerts.slice(0, 2).map((a) => h('span', { class: 'tag' }, t('tra.' + a))))),
        td(L.w, { class: 'small' }, wk.next ? h('div', { class: wk.next.due && wk.next.due < today() ? 'bad' : '' }, h('b', null, wk.next.due ? fdate(wk.next.due) : '—'), ' ', h('span', { class: 'clamp1' }, wk.next.text)) : null,
          h('div', { class: 'cell-sub' }, wk.lastVisit ? rt('lastVisit', { date: fdate(wk.lastVisit) }) : rt('noVisit'))));
    }))));
}

// ---- one sub-project ------------------------------------------------------------------------

const SP_TABS = ['overview', 'procurement', 'contracts', 'finance', 'work'];
function registryCard(code, tab) {
  const r = REG.rows.get(code) || [...REG.rows.values()].find((x) => x.code === code);
  if (!REG.access) return registryPage();
  if (!r) return [h('div', { class: 'card empty section' }, REG.rows.size ? t('pz.notFound') : t('ui.loading'))];
  const tt = r.t || {};
  tab = SP_TABS.includes(tab) ? tab : 'overview';
  const st = spStage(r), tracked = spTracked(r), news = spNews(tracked);
  const head = h('div', { class: 'org-head section' },
    h('div', null,
      // Where one is: the list, then this sub-project (a breadcrumb, not a back button far away).
      h('nav', { class: 'crumbs', 'aria-label': rt('nav') }, h('a', { href: '#/' }, rt('nav')), h('span', { 'aria-hidden': 'true' }, '/'), h('span', null, join([r.code, tt.programme, tt.batch && 'Batch ' + tt.batch, tt.office]))),
      h('h1', { class: 'org-title' + (String(tt.name_uk || tt.name_en || '').length > 90 ? ' long' : '') }, tt.name_uk || tt.name_en || r.code),
      tt.name_uk && tt.name_en ? h('p', { class: 'muted' }, tt.name_en) : null,
      h('div', { class: 'chips' }, stageChip(st),
        h('span', { class: 'tag' + (isMine(r) ? ' ok' : '') }, rt('managerTag', { who: spManager(r) || '—' })),
        !isMine(r) ? h('button', { class: 'btn btn-sm', onclick: () => takeOver(r), title: rt('takeOverHint') }, rt('takeOver')) : null, tt.funding ? h('span', { class: 'tag' }, tt.funding) : null,
        overallRating(scoresOf(r).scores) ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][overallRating(scoresOf(r).scores)] }, rt('overall', { n: overallRating(scoresOf(r).scores) })) : null,
        tt.manual ? h('span', { class: 'tag warn' }, rt('manualTag')) : null)),
    h('div', { class: 'org-actions' }, h('div', { class: 'row' }, spDream(r) ? ext(dreamUrl(spDream(r)), 'DREAM', 'btn') : null, tt.manual ? h('button', { class: 'btn', onclick: () => addSpDialog(r) }, rt('editSp')) : null)));
  // One sub-project, its parts as tabs: where it stands, its procurements, its contracts, its money,
  // the expert's work. The address keeps the tab (#/registry/CODE/contracts).
  const count = { procurement: spTids(r).length || (r.tenders || []).length, contracts: spContracts(r).length, work: ((r.work || {}).tasks || []).filter((x) => !x.done).length };
  const tabs = h('nav', { class: 'section-tabs pills sp-tabs', 'aria-label': rt('nav') }, SP_TABS.map((k) => h('a', { href: '#/registry/' + encodeURIComponent(r.code) + '/' + k, class: k === tab ? 'on' : '' },
    rt('tab_' + k), count[k] ? h('em', { class: 'count' }, count[k]) : null, k === 'overview' && news.signals.length ? h('em', { class: 'count red' }, news.signals.length) : null)));
  const body = {
    overview: () => [stageCard(r, st), statusCard(r), newsCard(tracked, news), h('div', { class: 'section' }, risksCard(r))],
    procurement: () => procurementTab(r),
    contracts: () => [contractsCard(r), guaranteesCard(r), paymentsCard(r)],
    finance: () => [mrdCard(r), subventionCard(r), financeFactsCard(r)],
    work: () => [workCard(r), noteCard(r)],
  }[tab]();
  return [head, tabs].concat(body);
}

// The road of a sub-project, from the subvention to commissioning, with the dates the data know.
function stageCard(r, st) {
  const tt = r.t || {}, works = (r.tenders || []).filter((x) => tKind(x.kind) === 'works').sort((a, b) => String(a.issued || '').localeCompare(String(b.issued || '')));
  const sv = subvMatch(r);
  const m = mainContract(r);
  const steps = [
    ['subvention', sv ? rt('stepSubv', { sum: fmtK((sv.amounts || {})[(sv.editions || []).slice(-1)[0]] || 0) }) : null, !!sv],
    ['tender', works.length ? join([rt('stepTenders', { n: works.length }), st.failed ? rt('stepFailed', { n: st.failed }) : null, works[works.length - 1].issued ? fdate(works[works.length - 1].issued) : null,
      ['tender', 'retender'].includes(st.stage) && st.lastIssued ? rt('stepRunning', { n: dayDiff(st.lastIssued, today()) }) : null]) : null, works.length > 0],
    ['contract', st.signed ? join([fdate(st.signed), m && ((m.c.suppliers || [])[0] || {}).name]) : null, !!st.signed],
    ['works', join([tt.start ? rt('stStart', { date: fdate(tt.start) }) : null, st.pct != null ? st.pct + '%' : null]), st.pct > 0 || !!tt.start],
    ['done', st.end ? join([rt('stEnd', { date: fdate(st.end) }), st.late ? rt('lateBy', { n: st.late }) : null]) : null, st.stage === 'done'],
  ];
  const at = { prep: 0, tender: 1, retender: 1, contract: 2, works: 3, done: 4 }[st.stage];
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('stageTitle')),
    h('ol', { class: 'sp-road' }, steps.map(([k, text, done], i) => h('li', { class: (done || (at != null && i < at) ? 'done' : '') + (i === at ? ' now' : '') + (k === 'done' && st.late ? ' late' : '') },
      h('b', null, rt('step_' + k)), text ? h('span', { class: 'small muted' }, text) : null))),
    ['suspended', 'withdrawn'].includes(st.stage) ? h('p', { class: 'notice small' }, rt('stage_' + st.stage)) : null,
    h('p', { class: 'muted small' }, rt(st.from === 'table' ? 'stageFromTable' : 'stageFromData')));
}

// News from the contracts on control under the sub-project: their signals since taken on control.
function newsCard(tracked, news) {
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('newsTitle')), h('a', { class: 'btn btn-sm', href: '#/signals' }, t('nav.signals'))),
    !tracked.length ? h('p', { class: 'muted small' }, rt('newsNone2'))
      : news.signals.length ? h('div', { class: 'ev-feed' }, news.signals.slice(0, 12).map((g) => h('a', { class: 'ev-row', href: '#/tracked/' + g.row.key },
        h('span', { class: 'num' }, fdate(String(g.since || '').slice(0, 10))), h('span', null, h('b', null, t('sig.' + g.type + '.title')), ' · ', g.row.number ? '№ ' + g.row.number : g.row.tid))))
        : h('p', { class: 'muted small' }, rt('newsQuiet', { n: tracked.length })));
}

// Every contract of the sub-project's procurements: on control or not, with what the monitor knows.
function spContracts(r) {
  const out = [];
  for (const t0 of ((r.pz || {}).tenders || [])) {
    for (const c of t0.contracts || []) if (c.status !== 'cancelled') out.push({ t0, c });
  }
  return out.sort((a, b) => String(b.c.signed || '').localeCompare(String(a.c.signed || '')));
}
function contractsCard(r) {
  const list = spContracts(r);
  const rowOf = (id) => ((state.trackedIndex || {}).items || []).find((x) => x.key === id || x.contract_id === id);
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('tab_contracts')),
    list.length ? h('div', { class: 'qs-contracts' }, list.map(({ t0, c }) => {
      const row = rowOf(c.id), sup = (c.suppliers || [])[0] || {};
      const role = isWorksTender(t0) ? 'works' : prozorro_role(t0.title);
      return h('div', { class: 'qs-contract' },
        h('div', null,
          h('b', null, join([rt('role_' + role), c.number ? '№ ' + c.number : null, c.signed ? fdate(c.signed) : null])),
          h('div', { class: 'cell-sub' }, join([sup.name, c.value ? money(c.value.amount, c.value.currency) : null, label('pzc.', c.status)])),
          row ? h('div', { class: 'cell-sub' }, join([row.totals ? rt('paidShort', { pct: row.totals.value ? Math.round(((row.totals.paid_total || row.totals.paid || 0) / row.totals.value) * 100) : 0 }) : null,
            row.late_days ? t('ud.overdue', { n: row.late_days }) : null, (row.rules && row.rules.bad || []).length ? rt('rulesBad', { n: row.rules.bad.length }) : null])) : null),
        row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + row.key }, rt('pDossier')) : c.status === 'active' ? h('span', { class: 'faint small' }, isMine(r) ? rt('pAuto') : rt('pNotMine')) : null);
    })) : h('p', { class: 'muted small' }, rt('noContracts')),
    h('p', { class: 'muted small' }, rt('contractsHint')));
}
const prozorro_role = (title) => (/технічн\S*\s+нагляд/i.test(title || '') ? 'ts' : /інженер\S*[\s-]*консультант|консультаційн/i.test(title || '') ? 'csc' : /авторськ\S*\s+нагляд/i.test(title || '') ? 'author' : /про[еє]кт/i.test(title || '') ? 'design' : 'other');

// The money in figures from the table: investment, the loan's part, contract, paid, this year's subvention.
function financeFactsCard(r) {
  const tt = r.t || {};
  const num = (x) => (x == null || x === '' ? null : typeof x === 'number' ? x : Number(String(x).replace(/\s/g, '').replace(',', '.')));
  return h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('finance')),
    kv([
      [rt('fInvest'), num(tt.invest_eur) != null ? money(num(tt.invest_eur), 'EUR') : null],
      [rt('fEib'), num(tt.eib_eur) != null ? money(num(tt.eib_eur), 'EUR') : null],
      [rt('fContract'), num(tt.contract_value) != null ? money(num(tt.contract_value)) : null],
      [rt('paidSheet'), r.paid != null ? money(r.paid) : null],
      [rt('fSubvYear'), num(tt.subv_year) != null ? money(num(tt.subv_year)) : null],
      [rt('fFunding'), join([tt.funding, num(tt.extra_need) ? rt('fNeed', { sum: money(num(tt.extra_need)) }) : null])],
    ]));
}

// Where the sub-project stands: the table's PROJECT PROGRESS columns (% of completion, Update date,
// Coments), kept up to date here. An edit is kept apart from the table's own values, so uploading
// the table again does not undo it unless the table's update date is newer.
function spStatus(r) {
  const tt = r.t || {}, st = (r.work || {}).status;
  const mine = st && (!tt.upd || String(st.upd || '') >= String(tt.upd));
  return mine ? { pct: st.pct, upd: st.upd, comment: st.comment, by: st.by, app: true } : { pct: tt.pct, upd: tt.upd, comment: tt.comment, app: false };
}
function statusCard(r) {
  const tt = r.t || {}, s = spStatus(r);
  const m = mainContract(r);
  const sup = m ? (m.c.suppliers || [])[0] || {} : {};
  const view = h('div', { class: 'st-edit' });
  const pctIn = h('input', { class: 'input', type: 'number', min: 0, max: 100, step: 1, inputmode: 'numeric', 'aria-label': rt('stPct') });
  pctIn.value = s.pct != null ? pctOf(s.pct) : '';
  const dayIn = h('input', { class: 'input', type: 'date', 'aria-label': rt('stUpd') });
  dayIn.value = today();
  const textIn = h('textarea', { class: 'input', rows: 10, maxlength: 4000, 'aria-label': rt('stComment') });
  textIn.value = s.comment || '';
  const msg = h('span', { class: 'small muted' });
  const saveBtn = h('button', { class: 'btn btn-sm btn-dark', onclick: async () => {
    const p = pctIn.value === '' ? null : Math.max(0, Math.min(100, Number(pctIn.value))) / 100;
    saveBtn.disabled = true;
    try {
      await saveWork(r, (w) => { w.status = { pct: p, upd: dayIn.value || today(), comment: textIn.value.trim().slice(0, 4000), by: myExpert(), at: new Date().toISOString() }; });
      toast(rt('saved'));
    } catch (e) { fill(msg, h('span', { class: 'bad' }, e.message)); } finally { saveBtn.disabled = false; }
  } }, icon('check'), rt('stSave'));
  const paid = paidShare(r);
  const card = h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('stTitle')),
      s.upd ? h('span', { class: 'faint small' }, rt(s.app ? 'stUpdApp' : 'stUpdTable', { date: fdate(s.upd), who: s.by || '' })) : null),
    h('div', { class: 'grid-2 st-grid' },
      kv([
        [t('eib.buyer'), join([tt.beneficiary, tt.beneficiary_id])],
        [rt('finance'), join([tt.invest_eur != null ? 'Invest ' + ni.format(tt.invest_eur) + ' €' : null, tt.eib_eur != null ? 'EIB ' + ni.format(tt.eib_eur) + ' €' : null])],
        [rt('stContract'), m ? h('span', null, h('b', null, sup.name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null, m.c.end ? '→ ' + fdate(m.c.end) : null])))
          : tt.contractor || null],
        [rt('stDates'), join([tt.start ? rt('stStart', { date: fdate(tt.start) }) : null, tt.completion ? rt('stEnd', { date: fdate(tt.completion) }) : null])],
        [rt('stPaid'), join([r.paid != null ? money(r.paid) : null, paid != null ? rt('paidShort', { pct: paid }) : null])],
        [rt('subvention'), join([+tt.subv_year > 0 ? money(+tt.subv_year) : null, +tt.subv_paid > 0 ? rt('subvPaid', { sum: money(+tt.subv_paid) }) : null])],
        [rt('next'), tt.next ? join([tt.next.who, tt.next.what, tt.next.date && fdate(tt.next.date)]) : null],
      ]),
      view));
  const was = s.app && tt.comment && tt.comment !== s.comment ? h('details', { class: 'small muted st-was' }, h('summary', null, rt('stTableWas', { date: tt.upd ? fdate(tt.upd) : '—' })), h('div', null, tt.comment)) : null;
  // First what it says; the form only on "Edit".
  const showView = () => fill(view,
    h('div', { class: 'st-row' },
      h('div', { class: 'field' }, h('span', null, rt('stPct')), h('b', { class: 'st-val num' }, s.pct != null ? pctOf(s.pct) + '%' : '—')),
      h('div', { class: 'field' }, h('span', null, rt('stUpd')), h('b', { class: 'st-val num' }, s.upd ? fdate(s.upd) : '—'))),
    h('div', { class: 'field' }, h('span', null, rt('stComment')), h('div', { class: 'st-text' }, s.comment || h('span', { class: 'muted' }, '—'))),
    was,
    h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: showEdit }, rt('editSp'))));
  const showEdit = () => {
    fill(view,
      h('div', { class: 'st-row' }, h('label', { class: 'field' }, h('span', null, rt('stPct')), pctIn), h('label', { class: 'field' }, h('span', null, rt('stUpd')), dayIn)),
      h('label', { class: 'field' }, h('span', null, rt('stComment')), textIn),
      was,
      h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn btn-sm', onclick: () => { pctIn.value = s.pct != null ? pctOf(s.pct) : ''; dayIn.value = today(); textIn.value = s.comment || ''; showView(); } }, rt('cancel')), msg));
    // As tall as what is written (up to a screen), the cursor at its end.
    requestAnimationFrame(() => { textIn.style.height = Math.min(window.innerHeight * 0.7, Math.max(240, textIn.scrollHeight + 4)) + 'px'; textIn.focus(); textIn.setSelectionRange(textIn.value.length, textIn.value.length); });
  };
  showView();
  return card;
}

// A sub-project the table does not have yet, added by hand (and its fields edited the same way).
const SP_CODE = /^[A-Z]{2}\d{2}[A-Z]?_\d{2}(-[A-Z])?$/;
function addSpDialog(r0) {
  const tt0 = (r0 && r0.t) || {};
  const experts = [...new Set([...REG.rows.values()].map((x) => (x.t || {}).expert).filter(Boolean).concat([myExpert()]))].filter(Boolean).sort();
  const progs = [...new Set(['URP III', 'URP', 'UERP'].concat([...REG.rows.values()].map((x) => (x.t || {}).programme).filter(Boolean)))];
  const inp = (key, ph, v) => { const el = h('input', { class: 'input', placeholder: ph || '', 'aria-label': rt('f_' + key) }); el.value = v || ''; return el; };
  const code = inp('code', 'OD08_05', r0 && r0.code);
  if (r0) code.disabled = true;
  const prog = select(progs.map((x) => [x, x]), tt0.programme || 'URP III', () => {}, rt('f_programme'));
  const batch = inp('batch', '8', tt0.batch), office = inp('office', 'Odesa', tt0.office);
  const nameUk = inp('name_uk', '', tt0.name_uk), nameEn = inp('name_en', '', tt0.name_en);
  const expert = select(experts.map((x) => [x, x]), tt0.expert || REG.access.expert || myExpert(), () => {}, rt('f_expert'));
  const ben = inp('beneficiary', '', tt0.beneficiary), benId = inp('beneficiary_id', '', tt0.beneficiary_id);
  const pz = inp('pz', 'UA-2026-…', '');
  const msg = h('div', { class: 'small' });
  const f = (key, el) => h('label', { class: 'field' }, h('span', null, rt('f_' + key)), el);
  const save = h('button', { class: 'btn btn-dark', onclick: async () => {
    const c = normCode(code.value);
    if (!SP_CODE.test(c)) { fill(msg, h('span', { class: 'bad' }, rt('spCodeBad'))); return; }
    if (!r0 && REG.rows.has(c)) { fill(msg, h('span', { class: 'bad' }, rt('spExists', { code: c }))); return; }
    if (!nameUk.value.trim() && !nameEn.value.trim()) { fill(msg, h('span', { class: 'bad' }, rt('spNameNeeded'))); return; }
    save.disabled = true;
    try {
      const t = Object.assign({}, tt0, { codes: [c], programme: prog.value, batch: batch.value.trim(), office: office.value.trim(), name_uk: nameUk.value.trim(), name_en: nameEn.value.trim(),
        expert: expert.value, beneficiary: ben.value.trim(), beneficiary_id: benId.value.trim(), manual: true });
      const ids = [...new Set(String(pz.value).match(PZ_ID) || [])];
      const patch = { code: c, t };
      if (ids.length) patch.link = { tids: [...new Set(((r0 && r0.link && r0.link.tids) || []).concat(ids))], off: [] };
      await cloud.updateRegistry(c, patch);
      closeSheet();
      location.hash = '#/registry/' + encodeURIComponent(c);
      toast(rt(r0 ? 'spSaved' : 'spAdded', { code: c }));
    } catch (e) { fill(msg, h('span', { class: 'bad' }, (e && e.code === 'permission-denied') ? rt('denied') : e.message)); save.disabled = false; }
  } }, rt(r0 ? 'stSave' : 'spAdd'));
  sheet(h('h2', { class: 'card-title' }, rt(r0 ? 'editSp' : 'addSp')), h('p', { class: 'muted small' }, rt('addSpHint')),
    h('div', { class: 'sp-form' }, f('code', code), f('programme', prog), f('batch', batch), f('office', office),
      h('div', { class: 'wide' }, f('name_uk', nameUk)), h('div', { class: 'wide' }, f('name_en', nameEn)), f('expert', expert), f('beneficiary_id', benId),
      h('div', { class: 'wide' }, f('beneficiary', ben)), r0 ? null : h('div', { class: 'wide' }, f('pz', pz))),
    h('div', { class: 'row', style: 'margin-top:12px' }, save), msg);
}

// A rating 1–3 as a coloured square; a click opens the four choices in their own colours
// (– none, 1 low green, 2 medium amber, 3 high red).
function scorePicker(score, onpick, label, title) {
  const wrap = h('div', { class: 'score-wrap' });
  const btn = h('button', { type: 'button', class: 'score-pick s' + (score || 0), 'aria-label': label, 'aria-haspopup': 'true', title }, score != null ? String(score) : '–');
  const close = (e) => { if (!e || !wrap.contains(e.target)) { const m = wrap.querySelector('.score-menu'); if (m) m.remove(); document.removeEventListener('click', close, true); } };
  btn.onclick = (e) => {
    e.preventDefault();
    if (wrap.querySelector('.score-menu')) { close(); return; }
    wrap.append(h('div', { class: 'score-menu', role: 'menu' }, [null, 1, 2, 3].map((v) => h('button', {
      type: 'button', role: 'menuitem', class: 'score-opt s' + (v || 0) + ((score || null) === v ? ' on' : ''),
      onclick: (ev) => { ev.preventDefault(); close(); onpick(v); },
    }, v == null ? '–' : String(v), h('small', null, rt('lvl' + (v || 0)))))));
    setTimeout(() => document.addEventListener('click', close, true));
  };
  wrap.append(btn);
  return wrap;
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
      const pick = k !== 'rx' ? scorePicker(score, (v) => save({ [k]: v }), rt(k), rt('from_' + (from[k] || 'none'))) : null;
      return h('div', { class: 'chk ' + lv },
        pick || h('span', { class: 'chk-ico' }, '!'),
        h('div', null, h('b', null, rt(k)), h('div', { class: 'small muted' }, items.length ? items.map((x) => x.text).join(' · ') : '—'),
          from[k] && from[k] !== 'own' ? h('div', { class: 'faint small' }, rt('from_' + from[k])) : null));
    })));
}

// ---- the Procurement tab -------------------------------------------------------------------------
//
// Everything bought for the sub-project, in the order the work goes: works, technical supervision,
// consulting engineer, then the rest; within each, the procedures one after another (a failed tender,
// a cancelled one, the one with a contract). One card per procedure joins what Prozorro says and what
// the team's Tenders sheet keeps. Possible procurements and adding one by hand come last, folded.
const PROC_ROLES = ['works', 'ts', 'csc', 'design', 'other'];
const roleOfSheet = (k) => ({ works: 'works', ts: 'ts', csc: 'csc' })[tKind(k)] || null;
function procItems(r) {
  const byTid = Object.fromEntries((((r.pz || {}).tenders) || []).map((x) => [x.tid, x]));
  const rows = r.tenders || [];
  const items = spTids(r).map((tid) => {
    const t0 = byTid[tid] || null, x = rows.find((y) => y.pz === tid) || null;
    const role = (x && roleOfSheet(x.kind)) || (t0 && (isWorksTender(t0) ? 'works' : prozorro_role(t0.title))) || 'other';
    return { tid, t0, x, role, day: (t0 && t0.date) || (x && x.issued) || '' };
  });
  // Rows of the sheet with no Prozorro id: they are part of the story too.
  for (const x of rows.filter((y) => !y.pz)) items.push({ tid: null, t0: null, x, role: roleOfSheet(x.kind) || 'other', day: x.issued || '' });
  for (const role of PROC_ROLES) {
    const list = items.filter((i) => i.role === role).sort((a, b) => String(a.day).localeCompare(String(b.day)));
    list.forEach((i, n) => { i.attempt = n + 1; i.of = list.length; });
  }
  return items;
}
// One procedure: what it is, how it went, what came of it, what the rules say, what the team did.
function procItem(r, it, save, linkIds, off) {
  const { t0, x, tid } = it;
  const c = t0 ? ((t0.contracts || []).filter((k) => k.status !== 'cancelled').sort((a, b) => String(b.signed || '').localeCompare(String(a.signed || '')))[0] || null) : null;
  const sup = c ? (c.suppliers || [])[0] || {} : null;
  const issued = (t0 && t0.date) || (x && x.issued), opening = (t0 && t0.deadline) || (x && x.opening);
  const bids = t0 && t0.bids != null ? t0.bids : x && x.bidders_n != null ? x.bidders_n : null;
  const v = tenderVerdict(r, x || { kind: { works: 'W', ts: 'TS', csc: 'IC' }[it.role], pz: tid });
  const srv = serverRules(tid);
  const row = tid ? ((state.trackedIndex || {}).items || []).find((y) => y.tid === tid && (!c || y.key === c.id || y.contract_id === c.id)) : null;
  const org = t0 ? { edrpou: t0.buyer, name: t0.buyer_name, role: 'buyer' } : null;
  const flags = [
    t0 && t0.sasu && t0.sasu.n ? h('span', { class: 'sev ' + (t0.sasu.violation ? 'high' : 'medium') }, t0.sasu.violation ? rt('pSasuViol') : rt('pSasu')) : null,
    t0 && t0.complaints && t0.complaints.n ? h('span', { class: 'sev ' + (t0.complaints.open ? 'medium' : '') }, rt('pAmcu', { n: t0.complaints.n, open: t0.complaints.open || 0 })) : null,
    x && x.ac === true ? h('span', { class: 'tag ok' }, rt('pAc')) : null,
    x && x.price === true ? h('span', { class: 'tag ok' }, rt('pPrice')) : null,
    ((r.link || {}).auto || []).includes(tid) ? h('span', { class: 'tag' }, rt('autoLinked')) : null,
  ].filter(Boolean);
  const verdict = v.k ? h('div', { class: 'proc-verdict' }, h('span', { class: 'faint small' }, rt('sheetRules') + ':'), verdictCell(v)) : null;
  return h('article', { class: 'proc' + (c ? ' has-contract' : t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? ' off' : '') },
    h('header', { class: 'proc-head' },
      h('div', { class: 'proc-id' },
        it.of > 1 ? h('span', { class: 'proc-n' }, rt('pAttempt', { n: it.attempt, of: it.of })) : null,
        t0 ? pzStatus(t0.status) : x && x.status ? h('span', { class: 'pz-st run' }, x.status) : null,
        tid ? h('a', { class: 'num proc-tid', href: pzUrl(tid), target: '_blank', rel: 'noopener noreferrer' }, tid) : h('span', { class: 'faint' }, rt('pSheetOnly'))),
      h('div', { class: 'proc-actions' },
        row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + row.key }, rt('pDossier'))
          : c && ['active'].includes(c.status) ? h('span', { class: 'faint small' }, isMine(r) ? rt('pAuto') : rt('pNotMine')) : null,
        tid ? actionMenu('', [[rt('unlink'), () => save(linkIds.filter((y) => y !== tid), [...new Set(off.concat(tid))]), 'x', rt('pUnlinkHint')]], 'more') : null)),
    h('div', { class: 'proc-title clamp' }, (t0 && t0.title) || (x && x.name) || '—'),
    h('dl', { class: 'proc-facts' },
      h('div', null, h('dt', null, rt('pMethod')), h('dd', null, (t0 && t0.method ? label('pzt.', t0.method) : x && x.method) || '—')),
      h('div', null, h('dt', null, rt('pExpected')), h('dd', { class: 'num' }, t0 && t0.value ? money(t0.value.amount, t0.value.currency) : x && x.est != null ? money(x.est) : '—')),
      h('div', null, h('dt', null, rt('pDates')), h('dd', { class: 'num' }, issued || opening ? join([issued && fdate(issued), opening && '→ ' + fdate(opening)]) : '—',
        issued && opening ? h('small', null, ' · ' + rt('pDays', { n: dayDiff(issued, opening) })) : null)),
      h('div', null, h('dt', null, rt('pBids')), h('dd', null, bids != null ? join([String(bids), t0 && t0.disqualified ? rt('pRejected', { n: t0.disqualified }) : null]) : '—')),
      h('div', { class: 'wide' }, h('dt', null, rt('pContract')), h('dd', null, c ? h('span', null, h('b', null, party(sup.name, sup.code)), ' · ', join([c.number ? '№ ' + c.number : null, c.signed ? fdate(c.signed) : null,
        c.value ? money(c.value.amount, c.value.currency) : null, c.end ? rt('pTo', { date: fdate(c.end) }) : null, c.changes ? rt('pChanges', { n: c.changes }) : null, label('pzc.', c.status)]))
        : x && x.contractor ? join([x.contractor, x.contract_no && '№ ' + x.contract_no, x.contract_total != null ? money(x.contract_total) : null])
        : h('span', { class: 'faint' }, t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? rt('pNoContractEnded') : rt('pNoContract')))),
      x && x.paid != null ? h('div', null, h('dt', null, rt('sheetPaid')), h('dd', { class: 'num' }, money(x.paid))) : null),
    flags.length || verdict || (srv && srv.bad.length) ? h('div', { class: 'proc-checks' }, flags, verdict) : null,
    tid ? h('footer', { class: 'proc-foot' }, h('span', { class: 'faint small' }, rt('pMarks')), marksRow(r, tid)) : null);
}
function procurementTab(r) {
  const pz = r.pz || {};
  const tids = spTids(r);
  const linkIds = (r.link && r.link.tids) || [];
  const off = (r.link && r.link.off) || [];
  const save = (tidsNew, offNew) => cloud.updateRegistry(r.code, { link: { tids: tidsNew, off: offNew } });
  const items = procItems(r);
  const status = h('span', { class: 'muted small' });
  const refresh = h('button', { class: 'btn btn-sm', onclick: async (e) => { e.currentTarget.disabled = true; fill(status, t('ui.loading')); try { await refreshSp(r); fill(status, ''); } catch (err) { fill(status, err.message); e.currentTarget.disabled = false; } } }, icon('refresh'), rt('refresh'));
  // The summary: per role, how many procedures and what came of them; the rules in one line.
  const invest = Number((r.t || {}).invest_eur || 0);
  const sumOf = (role) => {
    const list = items.filter((i) => i.role === role);
    const signed = list.map((i) => i.t0 && (i.t0.contracts || []).find((k) => ['active', 'terminated', 'complete'].includes(k.status))).find(Boolean)
      || list.map((i) => i.x && i.x.status === 'Contract Signed' && i.x).find(Boolean);
    const running = list.some((i) => i.t0 && RUN.includes(i.t0.status));
    const text = !list.length ? (role === 'csc' && invest && invest < 3e6 ? rt('pCscNotNeeded') : rt('pNone'))
      : signed ? rt('pSigned', { what: signed.number ? '№ ' + signed.number : signed.contract_no ? '№ ' + signed.contract_no : '' }) : running ? rt('pRunning') : rt('pNoContractYet');
    const cls = !list.length ? (role === 'ts' || (role === 'csc' && invest >= 3e6) ? 'warn' : 'na') : signed ? 'ok' : running ? 'run' : 'warn';
    return h('div', { class: 'proc-sum ' + cls }, h('small', null, rt('role_' + role)), h('b', null, text), list.length ? h('span', { class: 'faint small' }, rt('pProcN', { n: list.length })) : null);
  };
  const verdicts = items.filter((i) => i.x || i.t0).map((i) => tenderVerdict(r, i.x || { kind: { works: 'W', ts: 'TS', csc: 'IC' }[i.role], pz: i.tid })).filter((v) => v.k);
  const bad = verdicts.filter((v) => v.verdict === 'bad').length;
  const summary = h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('pTitle')),
      h('div', { class: 'row' }, h('span', { class: 'faint small' }, pz.at ? rt('updated', { at: ftime(pz.at) }) : rt('never')), refresh, status)),
    h('div', { class: 'proc-sums' }, sumOf('works'), sumOf('ts'), sumOf('csc'),
      h('div', { class: 'proc-sum ' + (bad ? 'bad' : verdicts.length ? 'ok' : 'na') }, h('small', null, rt('sheetRules')),
        h('b', null, !verdicts.length ? rt('pNoChecks') : bad ? rt('pBad', { n: bad, of: verdicts.length }) : rt('pAllOk', { n: verdicts.length })))));
  const groups = PROC_ROLES.map((role) => {
    const list = items.filter((i) => i.role === role);
    if (!list.length) return null;
    return h('section', { class: 'card pad section proc-group' },
      h('h2', { class: 'card-title' }, rt('role_' + role), h('span', { class: 'count-inline' }, list.length)),
      h('div', { class: 'proc-list' }, list.map((it) => procItem(r, it, save, linkIds, off))));
  });
  // Possible procurements found by the sub-project's name: open when nothing is linked yet.
  const cands = (pz.cand || []).filter((x) => !tids.includes(x.tid));
  const candBox = cands.length ? h('details', { class: 'card pad section fold', open: !items.length || null },
    h('summary', null, h('h2', { class: 'card-title' }, rt('candTitle'), h('span', { class: 'count-inline' }, cands.length))),
    h('p', { class: 'muted small' }, rt('candHint')),
    cands.length > 1 ? h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn btn-sm btn-dark', onclick: async (e) => {
      e.currentTarget.disabled = true;
      const all = cands.map((x) => x.tid);
      await save([...new Set(linkIds.concat(all))], off.filter((y) => !all.includes(y)));
      await refreshSp(Object.assign({}, r, { link: { tids: [...new Set(linkIds.concat(all))], off: off.filter((y) => !all.includes(y)) } }));
    } }, rt('linkAll', { n: cands.length }))) : null,
    h('div', { class: 'qs-list' }, cands.map((x) => h('div', { class: 'qs-row' },
      h('div', null, h('span', { class: 'tag' }, t('rel.role.' + x.role)), ' ', h('span', { class: 'clamp' }, x.title),
        h('div', { class: 'cell-sub' }, join([x.tid, x.buyer_name, label('pzs.', x.status), x.value ? money(x.value.amount, x.value.currency) : null]))),
      h('div', { class: 'qs-side' }, ext(pzUrl(x.tid), 'Prozorro'), h('button', { class: 'btn btn-sm btn-dark', onclick: () => save([...new Set(linkIds.concat(x.tid))], off.filter((y) => y !== x.tid)) }, rt('link'))))))) : null;
  // Adding one by hand: by its id, or searching Prozorro by the sub-project's name.
  const idInput = h('input', { class: 'input grow', placeholder: rt('linkPh'), 'aria-label': rt('linkTitle') });
  const linkMsg = h('div', { class: 'small' });
  const linkBtn = h('button', { class: 'btn btn-dark', onclick: async () => {
    const ids = [...new Set(String(idInput.value).match(PZ_ID) || [])].filter((x) => !tids.includes(x));
    if (!ids.length) { fill(linkMsg, h('span', { class: 'bad' }, String(idInput.value).trim() ? rt('linkBad') : rt('linkEmpty'))); return; }
    linkBtn.disabled = true;
    fill(linkMsg, rt('linkChecking'));
    try {
      const ok = [], badIds = [];
      for (const id of ids) {
        try { const d = await pzProxy({ action: 'tender', tid: id }); (d && d.tender && !d.tender.error ? ok : badIds).push(id); } catch (e) { badIds.push(id); }
      }
      if (!ok.length) { fill(linkMsg, h('span', { class: 'bad' }, rt('linkNotFound', { list: badIds.join(', ') }))); return; }
      const next = { tids: [...new Set(linkIds.concat(ok))], off: off.filter((y) => !ok.includes(y)) };
      await save(next.tids, next.off);
      fill(linkMsg, rt('linkLoading'));
      await refreshSp(Object.assign({}, r, { link: next }));
      idInput.value = '';
      fill(linkMsg, h('span', null, rt('linkDone', { list: ok.join(', ') }), badIds.length ? h('span', { class: 'bad' }, ' · ' + rt('linkNotFound', { list: badIds.join(', ') })) : null));
    } catch (e) {
      fill(linkMsg, h('span', { class: 'bad' }, (e && e.message) || String(e)));
    } finally { linkBtn.disabled = false; }
  } }, rt('link'));
  idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') linkBtn.click(); });
  const find = h('div');
  const searchByName = async () => {
    const q = objectName((r.t || {}).name_uk || '').split(/\s+/).slice(0, 12).join(' ');
    if (q.length < 12) { fill(find, h('p', { class: 'muted small' }, t('qs.none'))); return; }
    fill(find, h('p', { class: 'muted small' }, t('ui.loading')));
    try {
      const d = await pzProxy({ action: 'search', kind: 'tenders', text: q });
      const found = (d.items || []).filter((x) => !tids.includes(x.tid));
      fill(find, found.length ? h('div', { class: 'qs-list' }, found.map((x) => h('div', { class: 'qs-row' },
        h('div', null, h('span', { class: 'clamp' }, x.title), h('div', { class: 'cell-sub' }, join([x.tid, x.buyer_name, label('pzs.', x.status), x.value ? money(x.value.amount, x.value.currency) : null]))),
        h('div', { class: 'qs-side' }, ext(pzUrl(x.tid), 'Prozorro'), h('button', { class: 'btn btn-sm btn-dark', onclick: () => save([...new Set(linkIds.concat(x.tid))], off.filter((y) => y !== x.tid)) }, rt('link'))))))
        : h('p', { class: 'muted small' }, t('qs.none')));
    } catch (e) { fill(find, h('p', { class: 'small bad' }, e.message)); }
  };
  const addBox = h('details', { class: 'card pad section fold', open: !items.length && !cands.length ? true : null },
    h('summary', null, h('h2', { class: 'card-title' }, icon('plus'), rt('pAdd'))),
    h('p', { class: 'muted small' }, rt('linkHint')),
    h('div', { class: 'row add-row' }, idInput, linkBtn, h('button', { class: 'btn', onclick: searchByName }, icon('search'), rt('findByName'))),
    linkMsg, find);
  return [summary, items.length ? null : h('div', { class: 'card empty section' }, rt('notLinked'))].concat(groups, [candBox, addBox]);
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
    if (spManager(r) && spManager(r) !== myManager()) continue;
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
  const experts = [...new Set([...REG.rows.values()].map(spManager).filter(Boolean).concat([myExpert()]))].sort();
  // Tasks
  const tText = h('input', { class: 'input', placeholder: rt('taskWhat'), 'aria-label': rt('taskWhat') });
  const tDue = h('input', { class: 'input', type: 'date', value: addDays(today(), 7), 'aria-label': rt('taskDue') });
  const tWho = select(experts.map((x) => [x, x]), spManager(r) || myExpert(), () => {}, rt('taskWho'));
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

// The rules' verdict on one procurement of the sheet: compliant, broken (why) or not checked.
function verdictCell(v) {
  if (!v.k) return h('span', { class: 'faint' }, '—');
  const notes = v.found.filter((f) => f.st !== 'ok').map((f) => rt('pfR_' + f.key, f) + (f.st === 'check' ? ' (' + rt('pfToCheck') + ')' : ''));
  return [h('span', { class: 'sev ' + (v.verdict === 'bad' ? 'high' : v.verdict === 'ok' ? 'ok' : '') }, rt('pfV_' + v.verdict)), notes.length ? h('div', { class: 'cell-sub' }, notes.join('; ')) : null];
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
    if (value && value.f) return `<c r="${ref}"${keep} t="str"><f>${xmlEsc(value.f)}</f><v>${xmlEsc(value.v || '')}</v></c>`;
    return `<c r="${ref}"${keep} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  };
  const same = (a, b) => (b && b.f ? String(a == null ? '' : a).trim() === String(b.v || '').trim() : b && b.day ? typeof a === 'number' && Math.abs(a - excelDay(b.day)) < 1 : typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) < 0.005
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
    // Links as links: one procurement opens itself; several open the works one, all named.
    if (tids.length) {
      const works = ((r.pz || {}).tenders || []).find((x) => tids.includes(x.tid) && isWorksTender(x));
      const go = (works && works.tid) || tids[0];
      setK('pz_link', { f: `HYPERLINK("https://prozorro.gov.ua/tender/${go}",${tids.map((x) => '"' + x + '"').join('&CHAR(10)&')})`, v: tids.join('\n') }, 'blank');
      const n = ((r.pz || {}).tenders || []).filter((x) => tids.includes(x.tid) && isWorksTender(x)).length;
      setK('tenders_n', n || tids.length, 'blank');
    }
    const dream = spDream(r);
    if (dream) setK('dream', { f: `HYPERLINK("${dreamUrl(dream)}","${dream}")`, v: dream }, 'blank');
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
    // The progress kept in the monitor, when newer than the file's.
    const st = (r.work || {}).status;
    if (st && (!r.t.upd || String(st.upd || '') >= String(r.t.upd))) {
      if (st.pct != null) setK('pct', st.pct, 'force');
      if (st.upd) setK('upd', { day: st.upd }, 'force');
      if (st.comment) setK('comment', st.comment, 'force');
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

// ---- portfolio summary -------------------------------------------------------------------------
//
// The EIB–UNDP agreement of 25.02.2026 (Annex A, Output 2 "Sub-Project Compliance and Quality
// Assurance") measures the team by six indicators. They are counted here from the registry: the
// table's Tenders sheet (dates, method, AC Assessment, Price Verification), the experts' journal
// (in the app and the table's weekly columns), tasks, and the programme rules the sync checks for
// procurements on control. Tender compliance is judged by the rules any edition shares (tender
// period 20/15 days, signing 5 days after the award at the earliest), at the edition's strictness
// as sync/rules.py decides it: a broken rule of an earlier edition is only "to check".
const PF = { year: String(new Date().getFullYear()), expert: '', programme: '', batch: '' };
const KPI_TARGET = { k21: 80, k22: 60, k23: 55, k24: 80, k25: 100, k26: { 2026: 70, 2027: 75 } };
const KPI_FINAL = { k23: 110, k24: 160, k25: 200, k26: 80 };
const EDITION_FROM = { urp3_2026: '2026-11-02', urp3_2024: '2024-08-20', urp_2024: '2024-05-03', urp_2026: '2026-07-13' };  // as sync/rules.py
const PROC_KEYS = ['period', 'standstill', 'bid_security', 'method', 'eligibility'];  // rules of the procedure itself
const DONE_ST = ['Contract Signed', 'No Bids', 'All Rejected', 'Cancelled'];
const progKey = (p) => (/III|\b3\b/.test(p || '') ? 'urp3' : /UERP|\bERP\b|НКПВУ/i.test(p || '') ? 'uerp' : /URP|ПВУ/i.test(p || '') ? 'urp' : null);
const tKind = (k) => (/^(Ad_)?W$/i.test(k || '') ? 'works' : /^TS$/i.test(k || '') ? 'ts' : /^IC$/i.test(k || '') ? 'csc' : null);
const dayDiff = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 864e5) : null);
function editionOf(prog, day) {
  if (prog === 'urp3') { const ed = day >= EDITION_FROM.urp3_2026 ? 'urp3_2026' : 'urp3_2024'; return { ed, strict: day >= EDITION_FROM[ed] }; }
  if (prog) return day >= EDITION_FROM.urp_2026 ? { ed: 'urp_2026', strict: true } : { ed: 'urp_2024', strict: day >= EDITION_FROM.urp_2024 };
  return { ed: null, strict: false };
}
// What the sync found for a procedure on control, by its Prozorro id.
function serverRules(tid) {
  if (!tid) return null;
  const rows = ((state.trackedIndex || {}).items || []).filter((x) => x.tid === tid && x.rules);
  if (!rows.length) return null;
  return { bad: [...new Set(rows.flatMap((x) => x.rules.bad || []))], strict: rows.some((x) => x.rules.strict) };
}
// One procedure of the Tenders sheet: its year, whether it is finished, and its verdict.
function tenderVerdict(r, x) {
  const k = tKind(x.kind);
  const pz = ((r.pz || {}).tenders || []).find((t0) => t0.tid === x.pz) || {};
  const issued = x.issued || pz.date || null, opening = x.opening || pz.deadline || null;
  const day = String(issued || opening || x.award || x.contract_date || '');
  const prog = progKey((r.t || {}).programme), { ed, strict } = editionOf(prog, day);
  const direct = /direct/i.test(x.method || '') || /^(reporting|negotiation)/.test(pz.method || '');
  const found = [];
  const days = dayDiff(issued, opening);
  if (k && !direct && days != null && days >= 0) { const min = k === 'works' || ed === 'urp_2026' ? 20 : 15; found.push({ key: 'period', st: days >= min ? 'ok' : strict ? 'bad' : 'check', days, min }); }
  const ss = dayDiff(x.award, x.contract_date);
  if (!direct && ss != null && ss >= 0) { const bids = Number(x.bidders_n || pz.bids || 0); found.push({ key: 'standstill', st: ss >= 5 ? 'ok' : bids > 1 ? 'bad' : 'check', days: ss }); }
  if (direct) found.push({ key: 'direct', st: 'check' });
  const srv = serverRules(x.pz);
  for (const key of (srv && srv.bad) || []) if (PROC_KEYS.includes(key) && !found.some((f) => f.key === key && f.st === 'bad')) found.push({ key, st: 'bad', server: true });
  const verdict = found.some((f) => f.st === 'bad') ? 'bad' : found.some((f) => f.st === 'ok') ? 'ok' : 'na';
  const done = DONE_ST.includes(x.status) || ['complete', 'unsuccessful', 'cancelled'].includes(pz.status);
  return { r, x, k, year: day.slice(0, 4), done, verdict, found, issued, opening };
}
// The experts' activities: the app's journal and the table's weekly columns, the same entry once.
function activities(r) {
  const out = [], seen = new Set();
  for (const x of ((r.work || {}).log || [])) {
    const kind = activityOf(x.kind);
    if (!x.date) continue;
    seen.add(weekOf(x.date).label + '|' + (x.who || '') + '|' + kind);
    out.push({ date: x.date, kind, who: x.who || '', src: 'app' });
  }
  const yr = String(((REG.meta || {}).at && REG.meta.at.toDate ? REG.meta.at.toDate().toISOString() : (REG.meta || {}).at) || today()).slice(0, 4);
  for (const x of ((r.t || {}).log || [])) {
    const kind = WORK_KINDS.find((k) => String(x.what || '').toUpperCase().startsWith(k)) || '';
    if (!kind || seen.has(x.week + '|' + (x.who || '') + '|' + kind)) continue;
    const m = /\((\d{2})\.(\d{2})/.exec(x.week || '');
    out.push({ date: m ? `${yr}-${m[2]}-${m[1]}` : null, kind, who: x.who || '', src: 'table' });
  }
  return out;
}
const inYear = (d, y) => y === 'all' || String(d || '').startsWith(y);
function portfolioData() {
  const all = [...REG.rows.values()];
  const rows = all.filter((r) => (!PF.expert || spManager(r) === PF.expert) && (!PF.programme || (r.t || {}).programme === PF.programme) && (!PF.batch || String((r.t || {}).batch) === PF.batch));
  const y = PF.year;
  const tenders = rows.flatMap((r) => (r.tenders || []).map((x) => tenderVerdict(r, x)));
  const acts = rows.flatMap((r) => activities(r).map((a) => Object.assign({ r }, a)));
  const tasks = rows.flatMap((r) => ((r.work || {}).tasks || []).map((x) => Object.assign({ r }, x)));
  // 2.6: finished procedures of the year with a verdict.
  const fin = tenders.filter((v) => v.done && inYear(v.year, y) && v.k);
  const judged = fin.filter((v) => v.verdict !== 'na'), okN = judged.filter((v) => v.verdict === 'ok').length;
  // 2.2: sub-projects with a cost or design check (journal COST VERIFICATION, or Price Verification ticked).
  const costChecked = rows.filter((r) => activities(r).some((a) => a.kind === 'COST VERIFICATION') || (r.tenders || []).some((x) => x.price === true));
  const yTasks = tasks.filter((x) => inYear(x.at || x.due, y));
  const works = (r) => (r.tenders || []).filter((x) => tKind(x.kind) === 'works');
  // Sub-projects being built: a works contract signed and not finished.
  const done100 = (r) => { const p = pctOf((spStatus(r) || {}).pct != null ? spStatus(r).pct : (r.t || {}).pct); return p != null && p >= 100; };
  const building = rows.filter((r) => works(r).some((x) => x.status === 'Contract Signed') && !done100(r));
  const visitsAll = (r) => activities(r).filter((a) => a.kind === 'VISIT').length;
  const fewVisits = building.filter((r) => visitsAll(r) < 2);
  const noTs = building.filter((r) => !(r.tenders || []).some((x) => tKind(x.kind) === 'ts') && !((r.pz || {}).tenders || []).some((t0) => /технічн\S*\s+нагляд/i.test(t0.title || '')));
  const noCsc = rows.filter((r) => Number((r.t || {}).invest_eur || 0) >= 3e6 && works(r).some((x) => x.status === 'Contract Signed')
    && !(r.tenders || []).some((x) => tKind(x.kind) === 'csc') && !((r.pz || {}).tenders || []).some((t0) => /інженер\S*[\s-]*консультант/i.test(t0.title || '')));
  const kpi = {
    k21: { n: yTasks.filter((x) => x.done).length, of: yTasks.length },
    k22: { n: costChecked.length, of: rows.length },
    k23: { n: tenders.filter((v) => v.x.ac === true && inYear(v.x.award || v.x.contract_date || v.year, y)).length },
    k24: { n: acts.filter((a) => a.kind === 'VISIT' && inYear(a.date, y)).length },
    k25: { n: tenders.filter((v) => v.k === 'works' && inYear(v.year, y)).length, marked: tenders.filter((v) => v.k === 'works' && inYear(v.year, y) && v.x.mk_monitor === true).length },
    k26: { n: okN, of: judged.length, na: fin.length - judged.length, fin: fin.length },
  };
  const ratings = { 1: 0, 2: 0, 3: 0, none: 0 };
  rows.forEach((r) => { const o = overallRating(scoresOf(r).scores); ratings[o || 'none']++; });
  const funding = {};
  rows.forEach((r) => { const f = (r.t || {}).funding; if (f) funding[f] = (funding[f] || 0) + 1; });
  // The EIB's payments by the Mindev register: speed in the period, waiting now, after the term, no results to the EIB.
  const facts = rows.map((r) => ({ r, f: mrdFacts(r) })).filter((x) => x.f);
  const pays = facts.flatMap(({ r, f }) => (r.mrd.payments || []).filter((x) => x.paid && inYear(x.paid, y) && f.lag(x) != null && f.lag(x) >= 0 && f.lag(x) < 400).map((x) => f.lag(x)));
  const mrd = facts.length ? {
    sps: facts.length, asOf: facts.map((x) => x.f.asOf).sort().pop(), n: pays.length, med: median(pays), p90: pays.length ? pays.slice().sort((a, b) => a - b)[Math.floor(pays.length * 0.9)] : null,
    waiting: facts.filter((x) => x.f.waiting.some((w) => w.days > 14)).map((x) => ({ r: x.r, days: Math.max(...x.f.waiting.map((w) => w.days)), n: x.f.waiting.length })).sort((a, b) => b.days - a.days),
    afterTerm: facts.filter((x) => x.f.afterTerm.length).map((x) => x.r), noPcr: facts.filter((x) => x.f.noPcr).map((x) => x.r),
  } : null;
  return { all, rows, tenders, fin, judged, bad: fin.filter((v) => v.verdict === 'bad'), kpi, building, fewVisits, noTs, noCsc, ratings, funding, acts, costChecked, mrd };
}
const kpiTarget = (k, y) => (y === 'all' ? KPI_FINAL[k] || (typeof KPI_TARGET[k] === 'number' ? KPI_TARGET[k] : null) : typeof KPI_TARGET[k] === 'object' ? KPI_TARGET[k][y] || KPI_FINAL[k] : KPI_TARGET[k]);
function portfolioPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  if (!REG.access) return [h('div', { class: 'card empty section' }, rt('noAccess'))];
  const all = [...REG.rows.values()];
  const years = [...new Set([String(new Date().getFullYear()), ...all.flatMap((r) => (r.tenders || []).map((x) => String(x.issued || '').slice(0, 4)))].filter((x) => /^20\d\d$/.test(x) && x >= '2024'))].sort();
  const experts = [...new Set(all.map(spManager).filter(Boolean))].sort();
  const progs = [...new Set(all.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  const batches = [...new Set(all.map((r) => (r.t || {}).batch).filter((x) => x != null && x !== '').map(String))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const box = h('div');
  const draw = () => fill(box, portfolioBody(portfolioData()));
  const set = (k) => (e) => { PF[k] = e.target.value; draw(); };
  draw();
  return [pageHead(rt('pfEyebrow'), titleGrad(rt('pfTitle1'), rt('pfTitle2')), rt('pfLead'),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-dark', onclick: () => exportPortfolio(portfolioData()) }, icon('download'), rt('pfExport')))),
  h('div', { class: 'table-card section' }, h('div', { class: 'table-tools' },
    pills(years.map((x) => [x, x]).concat([['all', rt('pfAll')]]), PF.year, (v) => { PF.year = v; draw(); }),
    select([['', rt('anyExpert')]].concat(experts.map((x) => [x, x])), PF.expert, set('expert'), rt('colExpert')),
    select([['', rt('anyProgramme')]].concat(progs.map((x) => [x, x])), PF.programme, set('programme'), 'Programme'),
    select([['', rt('pfAnyBatch')]].concat(batches.map((x) => [x, 'Batch ' + x])), PF.batch, set('batch'), 'Batch'))),
  box];
}
function portfolioBody(d) {
  const y = PF.year, k = d.kpi;
  const pct = (n, of) => (of ? Math.round((n / of) * 100) : null);
  const tile = (key, value, unit, sub, target, good) => h('div', { class: 'card pad kpi' + (good == null ? '' : good ? ' kpi-ok' : ' kpi-low') },
    h('div', { class: 'kpi-head' }, h('span', { class: 'kpi-id' }, key.replace('k', '').replace(/^(\d)/, '$1.')), h('small', null, rt('pf_' + key))),
    h('b', { class: 'num kpi-val' }, value == null ? '—' : ni.format(value) + (unit || '')),
    target != null ? h('div', { class: 'kpi-target' }, rt(unit === '%' ? 'pfTargetPct' : 'pfTarget', { n: target })) : null,
    target != null && value != null ? h('div', { class: 'kpi-bar' }, h('span', { style: `width:${Math.min(100, Math.round((value / target) * 100))}%` })) : null,
    sub ? h('div', { class: 'small muted' }, sub) : null);
  const t26 = kpiTarget('k26', y), v26 = pct(k.k26.n, k.k26.of);
  const t21 = KPI_TARGET.k21, v21 = pct(k.k21.n, k.k21.of), v22 = pct(k.k22.n, k.k22.of);
  const n = (key) => kpiTarget(key, y);
  const spLink = (r) => h('a', { href: '#/registry/' + encodeURIComponent(r.code) }, r.code);
  const reasons = (v) => v.found.filter((f) => f.st === 'bad').map((f) => rt('pfR_' + f.key, f)).join('; ');
  return [
    h('div', { class: 'kpi-grid section' },
      tile('k26', v26, '%', rt('pfSub26', { n: k.k26.n, of: k.k26.of, na: k.k26.na }), t26, v26 == null ? null : v26 >= t26),
      tile('k25', k.k25.n, '', rt('pfSub25', { m: k.k25.marked }), n('k25'), null),
      tile('k24', k.k24.n, '', rt('pfSub24', { n: d.fewVisits.length }), n('k24'), null),
      tile('k23', k.k23.n, '', rt('pfSub23'), n('k23'), null),
      tile('k22', v22, '%', rt('pfSub22', { n: k.k22.n, of: k.k22.of }), KPI_TARGET.k22, v22 == null ? null : v22 >= KPI_TARGET.k22),
      tile('k21', v21, '%', rt('pfSub21', { n: k.k21.n, of: k.k21.of }), t21, v21 == null ? null : v21 >= t21)),
    h('details', { class: 'howto section' }, h('summary', null, rt('pfHow')), h('p', { class: 'muted small' }, rt('pfHint'))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pfOverview')),
      kv([
        [rt('pfSps'), String(d.rows.length)],
        [rt('pfBuilding'), String(d.building.length)],
        [rt('pfRatings'), join([rt('pfR3', { n: d.ratings[3] }), rt('pfR2', { n: d.ratings[2] }), rt('pfR1', { n: d.ratings[1] }), d.ratings.none ? rt('pfRnone', { n: d.ratings.none }) : null])],
        [rt('pfFunding'), Object.keys(d.funding).length ? Object.entries(d.funding).map(([f, c]) => f + ': ' + c).join(' · ') : null],
        [rt('pfTendersAll'), rt('pfTendersLine', { n: d.tenders.filter((v) => inYear(v.year, y)).length, fin: d.fin.length })],
      ])),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pfBadTitle', { n: d.bad.length })),
      d.bad.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, [rt('colCode'), rt('pfKind'), 'Prozorro', rt('pfIssued'), rt('pfWhy')].map((x) => h('th', null, x)))),
        h('tbody', null, d.bad.map((v) => h('tr', null, h('td', null, spLink(v.r)), h('td', null, v.x.kind || ''), h('td', { class: 'num' }, v.x.pz ? h('a', { href: pzUrl(v.x.pz), target: '_blank', rel: 'noopener noreferrer' }, v.x.pz) : '—'),
          h('td', { class: 'num' }, fdate(v.issued)), h('td', null, reasons(v))))))) : h('p', { class: 'muted small' }, rt('pfNoBad'))),
    d.mrd ? h('div', { class: 'card pad section' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('pfMrd')), h('span', { class: 'muted small' }, rt('mrdAsOf', { date: fdate(d.mrd.asOf), file: '' }))),
      kv([
        [rt('pfMrdSpeed'), d.mrd.n ? rt('pfMrdSpeedV', { n: d.mrd.n, med: d.mrd.med, p90: d.mrd.p90 }) : '—'],
        [rt('pfMrdWaiting', { n: d.mrd.waiting.length }), d.mrd.waiting.length ? h('div', { class: 'chips' }, d.mrd.waiting.map((x) => h('a', { class: 'tag' + (x.days > 30 ? ' warn' : ''), href: '#/registry/' + encodeURIComponent(x.r.code) + '/finance' }, x.r.code + ' · ' + rt('mrdWait', { n: x.days })))) : '—'],
        [rt('pfMrdAfterTerm', { n: d.mrd.afterTerm.length }), d.mrd.afterTerm.length ? h('div', { class: 'chips' }, d.mrd.afterTerm.map((r) => h('a', { class: 'tag', href: '#/registry/' + encodeURIComponent(r.code) + '/finance' }, r.code))) : '—'],
        [rt('pfMrdNoPcr', { n: d.mrd.noPcr.length }), d.mrd.noPcr.length ? h('div', { class: 'chips' }, d.mrd.noPcr.map((r) => h('a', { class: 'tag', href: '#/registry/' + encodeURIComponent(r.code) + '/finance' }, r.code))) : '—'],
      ]), h('p', { class: 'muted small' }, rt('pfMrdHint', { n: d.mrd.sps }))) : null,
    h('div', { class: 'grid-2 section' },
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, rt('pfFewVisits', { n: d.fewVisits.length })), h('p', { class: 'muted small' }, rt('pfFewVisitsHint')),
        d.fewVisits.length ? h('div', { class: 'chips' }, d.fewVisits.map((r) => h('a', { class: 'tag', href: '#/registry/' + encodeURIComponent(r.code), title: (r.t || {}).name_uk || '' }, r.code))) : h('p', { class: 'muted small' }, '—')),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, rt('pfOversight')),
        h('p', { class: 'small' }, h('b', null, rt('pfNoTs', { n: d.noTs.length }))), d.noTs.length ? h('div', { class: 'chips' }, d.noTs.map((r) => h('a', { class: 'tag', href: '#/registry/' + encodeURIComponent(r.code) }, r.code))) : null,
        h('p', { class: 'small', style: 'margin-top:10px' }, h('b', null, rt('pfNoCsc', { n: d.noCsc.length }))), d.noCsc.length ? h('div', { class: 'chips' }, d.noCsc.map((r) => h('a', { class: 'tag', href: '#/registry/' + encodeURIComponent(r.code) }, r.code))) : null,
        h('p', { class: 'muted small', style: 'margin-top:10px' }, rt('pfOversightHint')))),
  ];
}
// The summary as a workbook for the operational report: the indicators, the procedures, the sub-projects.
async function exportPortfolio(d) {
  const y = PF.year, k = d.kpi;
  const head = { bold: true, fill: 'DDEBF7', border: true, wrap: true, valign: 'center' }, cell = { border: true, wrap: true }, num = { border: true, fmt: '#,##0' }, pc = { border: true, fmt: '0%' };
  const date = { border: true, fmt: 'dd.mm.yy' };
  const D = (v) => (v ? { v, s: date, day: true } : { v: null, s: date });
  const ratio = (n, of) => (of ? n / of : null);
  const kpiRows = [
    ['2.1', rt('pf_k21'), ratio(k.k21.n, k.k21.of), k.k21.n, k.k21.of, KPI_TARGET.k21 / 100, true],
    ['2.2', rt('pf_k22'), ratio(k.k22.n, k.k22.of), k.k22.n, k.k22.of, KPI_TARGET.k22 / 100, true],
    ['2.3', rt('pf_k23'), k.k23.n, null, null, kpiTarget('k23', y), false],
    ['2.4', rt('pf_k24'), k.k24.n, null, null, kpiTarget('k24', y), false],
    ['2.5', rt('pf_k25'), k.k25.n, k.k25.marked, null, kpiTarget('k25', y), false],
    ['2.6', rt('pf_k26'), ratio(k.k26.n, k.k26.of), k.k26.n, k.k26.of, kpiTarget('k26', y) / 100, true],
  ];
  const s1 = [[{ v: rt('pfXTitle', { y: y === 'all' ? rt('pfAll') : y }), s: { bold: true, size: 16 } }], [{ v: rt('pfXSub', { date: fdate(today()), n: d.rows.length }), s: { size: 10, color: '6B7280' } }], [],
    [rt('pfXId'), rt('pfXIndicator'), rt('pfXValue'), rt('pfXNum'), rt('pfXDen'), rt('pfXTarget')].map((v) => ({ v, s: head }))]
    .concat(kpiRows.map(([id, name, v, a, b, tg, isPct]) => [{ v: id, s: cell }, { v: name, s: cell }, { v, s: isPct ? pc : num }, { v: a, s: num }, { v: b, s: num }, { v: tg, s: isPct ? pc : num }]));
  const s2 = [[rt('colCode'), rt('pfKind'), rt('pfXName'), 'Prozorro', rt('pfXStatus'), rt('pfIssued'), rt('pfXOpening'), rt('pfXDays'), rt('pfXAward'), rt('pfXContract'), rt('pfXStandstill'), rt('pfXVerdict'), rt('pfWhy')].map((v) => ({ v, s: head }))]
    .concat(d.tenders.filter((v) => inYear(v.year, y)).map((v) => {
      const per = v.found.find((f) => f.key === 'period'), ss = v.found.find((f) => f.key === 'standstill');
      return [{ v: v.r.code, s: cell }, { v: v.x.kind || '', s: cell }, { v: v.x.name || '', s: cell }, v.x.pz ? { v: v.x.pz, f: `HYPERLINK("${pzUrl(v.x.pz)}","${v.x.pz}")`, s: { border: true, color: '0563C1' } } : { v: null, s: cell },
        { v: v.x.status || '', s: cell }, D(v.issued), D(v.opening), { v: per ? per.days : null, s: num }, D(v.x.award), D(v.x.contract_date), { v: ss ? ss.days : null, s: num },
        { v: rt('pfV_' + v.verdict) + (v.done ? '' : ' · ' + rt('pfXOpen')), s: Object.assign({}, cell, v.verdict === 'bad' ? { fill: 'FCE4D6' } : v.verdict === 'ok' ? { fill: 'E2EFDA' } : {}) },
        { v: v.found.filter((f) => f.st !== 'ok').map((f) => rt('pfR_' + f.key, f) + (f.st === 'check' ? ' (' + rt('pfToCheck') + ')' : '')).join('; '), s: cell }];
    }));
  const s3 = [[rt('colCode'), rt('pfXName'), rt('colExpert'), 'Programme', 'Batch', rt('pfXVisitsY'), rt('pfXVisitsAll'), rt('pfXCost'), rt('pfXTs'), rt('pfXCsc'), rt('pfXRating')].map((v) => ({ v, s: head }))]
    .concat(d.rows.slice().sort((a, b) => a.code.localeCompare(b.code)).map((r) => {
      const acts = activities(r), v = acts.filter((a) => a.kind === 'VISIT');
      return [{ v: r.code, s: cell }, { v: (r.t || {}).name_uk || (r.t || {}).name_en || '', s: cell }, { v: spManager(r), s: cell }, { v: (r.t || {}).programme || '', s: cell }, { v: (r.t || {}).batch != null ? String(r.t.batch) : '', s: cell },
        { v: v.filter((a) => inYear(a.date, y)).length, s: num }, { v: v.length, s: num }, { v: d.costChecked.includes(r) ? rt('pfYes') : '', s: cell },
        { v: d.noTs.includes(r) ? rt('pfMissing') : '', s: cell }, { v: d.noCsc.includes(r) ? rt('pfMissing') : '', s: cell }, { v: overallRating(scoresOf(r).scores), s: num }];
    }));
  const files = xlsxBook([
    { name: rt('pfXSheet1'), rows: s1, widths: [6, 60, 12, 12, 12, 12] },
    { name: rt('pfXSheet2'), rows: s2, widths: [12, 6, 50, 24, 14, 11, 11, 8, 11, 11, 8, 14, 50], freeze: { row: 1, col: 1 }, filter: `A1:M${Math.max(2, s2.length)}` },
    { name: rt('pfXSheet3'), rows: s3, widths: [12, 50, 20, 10, 8, 10, 10, 12, 10, 10, 8], freeze: { row: 1, col: 1 }, filter: `A1:K${Math.max(2, s3.length)}` },
  ]);
  const blob = await xlsxBlob(files);
  const a = h('a', { href: URL.createObjectURL(blob), download: rt('pfXFile', { y: y === 'all' ? 'all' : y, date: today() }) + '.xlsx' });
  document.body.append(a); a.click(); a.remove();
}

// ---- the Mindev payments register ---------------------------------------------------------------
//
// Mindev's register of payments from the EIB loan (Ukreximbank project accounts, which the Treasury
// does not show): per sub-project its contracts (works, supervision, consulting engineer: number,
// dates, term, contractor, bank guarantee, when the tender results went to the EIB) and every payment
// request with its way through Mindev and the Ministry of Finance or the bank. Uploaded in the browser
// by a team member, kept in registry/{code}.mrd (it carries bank accounts and personal tax numbers:
// private, like the table). Sheets differ by programme; columns are found by their headers.
const MRD_COLS = [
  ['code', /Шифр|ID Субпро|^шифр/i], ['purpose', /Призначення платежу/i],
  ['eib', /Спеціальний фонд|спец\.?\s*фонд|Субвенція \(без ПДВ\)/i], ['vat', /загального фонду/i], ['local', /Місцевий бюдж|місцевого бюджету|Власні кошти/i],
  ['number', /Номер договору/i], ['date', /Дата заключення/i], ['term', /Строк дії/i], ['org', /Організація/i], ['guarantee', /Банківська гарантія/i],
  ['pcr', /результатів торгів/i], ['received', /Дата отримання від КБ/i], ['sent', /Дата нав?ленн|Дата направленн/i],
  ['comment', /Коментарі|Примітка Мінрегіону/i], ['approved', /Підписання, повернення/i], ['paid', /Дата здійснення оплати/i], ['note', /^Примітка\s*$/i],
];
const mrdNum = (v) => (typeof v === 'number' ? v : v == null ? null : (/^-?\d[\d\s]*([.,]\d+)?/.exec(String(v).trim()) || [])[0] ? Number(/^-?\d[\d\s]*([.,]\d+)?/.exec(String(v).trim())[0].replace(/\s/g, '').replace(',', '.')) : null);
function mrdDate(v) {
  const ok = (y) => y >= 2015 && y <= 2031;
  if (v instanceof Date && !isNaN(v)) { const d = cellValue(v); return ok(+d.slice(0, 4)) ? d : null; }
  const all = [...String(v || '').matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)].map((m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`).filter((d) => ok(+d.slice(0, 4)));
  return all.sort().pop() || null;
}
const mrdRole = (p) => (/технічн/.test(p) ? 'ts' : /інженер|консульт/.test(p) ? 'csc' : /підряд|робіт/.test(p) ? 'works' : 'other');
const mrdKind = (p) => (/закриття авансу/.test(p) ? 'advance_close' : /аванс|попередн/.test(p) ? 'advance' : /повернення/.test(p) ? 'refund' : /технічн/.test(p) ? 'ts' : /інженер|консульт/.test(p) ? 'csc' : /робот|робіт/.test(p) ? 'works' : 'other');
function parseMrd(XLSX, wb) {
  const out = new Map();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    // Some sheets claim 16 384 columns: only the first 60 hold anything.
    const range = XLSX.utils.decode_range(ws['!ref']);
    range.e.c = Math.min(range.e.c, 60);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range });
    if (rows.length < 4) continue;
    const width = Math.max(...rows.slice(0, 3).map((r) => (r || []).length));
    const heads = Array.from({ length: width }, (_, i) => [0, 1, 2].map((k) => String((rows[k] || [])[i] || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / '));
    const col = {};
    for (const [key, rx] of MRD_COLS) { const i = heads.findIndex((x) => rx.test(x)); if (i >= 0) col[key] = i; }
    if (col.code == null || col.purpose == null || col.eib == null) continue;
    for (const r of rows.slice(2)) {
      if (!r) continue;
      const code = codesOf(String(r[col.code] || '').replace(/\s+/g, ''))[0];
      if (!code) continue;
      const p = String(r[col.purpose] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!p || /^загальна вартість/.test(p)) continue;
      const at = (k) => (col[k] != null ? r[col[k]] : null);
      const sp = out.get(code) || { sheet: name, contracts: [], payments: [] };
      out.set(code, sp);
      const eib = mrdNum(at('eib')), local = (mrdNum(at('local')) || 0) + (mrdNum(at('vat')) || 0);
      if (/^вартість проекту/.test(p)) {
        const g = at('guarantee');
        const gp = typeof g === 'number' ? (g < 1 ? Math.round(g * 1000) / 10 : null) : (/(\d+(?:[.,]\d+)?)\s*%/.exec(String(g || '')) || [])[1];
        const pcr = at('pcr');
        sp.contracts.push({ role: mrdRole(p), number: String(at('number') || '').slice(0, 80), date: mrdDate(at('date')), term: mrdDate(at('term')),
          org: String(at('org') || '').replace(/\s+/g, ' ').slice(0, 200), guarantee: gp != null ? Number(String(gp).replace(',', '.')) : null,
          // null: the sheet has no such column (older pools); "": the column is there and empty.
          pcr: col.pcr == null ? null : pcr instanceof Date ? cellValue(pcr) : String(pcr || '').replace(/\s+/g, ' ').slice(0, 60), eib: eib || 0, local: local || 0 });
      } else if (eib || local) {
        sp.payments.push({ kind: mrdKind(p), eib: eib || 0, local: local || 0, received: mrdDate(at('received')), sent: mrdDate(at('sent')), approved: mrdDate(at('approved')), paid: mrdDate(at('paid')),
          comment: String(at('comment') || '').replace(/\s+/g, ' ').slice(0, 300), note: String(at('note') || '').replace(/\s+/g, ' ').slice(0, 200) });
      }
    }
  }
  // Repeated contract rows (the main contract and its addendum blocks) once each.
  for (const sp of out.values()) {
    const seen = new Set();
    sp.contracts = sp.contracts.filter((c) => { const k = [c.role, c.number, Math.round(c.eib)].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    sp.payments = sp.payments.sort((a, b) => String(a.paid || a.received || '').localeCompare(String(b.paid || b.received || ''))).slice(-200);
  }
  return out;
}
async function importMrd(file) {
  if (REG.busy) return;
  REG.busy = 'mrd';
  try {
    setStatus(rt('importing'));
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const found = parseMrd(XLSX, wb);
    const regCode = (c) => (REG.rows.has(c) ? c : REG.rows.has(c.replace(/-A$/, '')) ? c.replace(/-A$/, '') : null);
    const at = new Date().toISOString(), fileName = file.name.slice(0, 200);
    // Several file codes of one sub-project ("-A" lines) go together.
    const bySp = new Map();
    let missing = 0;
    for (const [code, sp] of found) {
      const rc = regCode(code);
      if (!rc) { missing++; continue; }
      const cur = bySp.get(rc) || { sheet: sp.sheet, contracts: [], payments: [] };
      cur.contracts.push(...sp.contracts.map((c) => Object.assign({ code }, c)));
      cur.payments.push(...sp.payments.map((x) => Object.assign({ code }, x)));
      bySp.set(rc, cur);
    }
    // One base that grows: what the new file has is added or brought up to date; what an earlier
    // file had and this one does not stays (a later register may leave out old rows).
    let n = 0, failed = 0, added = 0, changed = 0;
    for (const [rc, fresh] of bySp) {
      n++;
      if (n % 10 === 1) setStatus(rt('mrdSaving', { n, total: bySp.size }));
      const merged = mergeMrd((REG.rows.get(rc) || {}).mrd, fresh, { at, file: fileName, by: myExpert() });
      added += merged.added; changed += merged.changed;
      if (!merged.added && !merged.changed && (REG.rows.get(rc) || {}).mrd) continue;
      try { await cloud.updateRegistry(rc, { mrd: merged.mrd }); } catch (e) { failed++; console.error('mrd', rc, e); if (e && e.code === 'permission-denied') throw e; }
    }
    const msg = rt('mrdDone', { n: bySp.size - failed, found: found.size, missing }) + ' · ' + rt('mrdDelta', { added, changed });
    setStatus(msg, failed > 0);
    toast(msg, { long: true });
  } catch (e) {
    console.error('mrd import', e);
    const msg = (e && e.code === 'permission-denied') ? rt('denied') : (e && e.message) || String(e);
    setStatus(msg, true);
    toast(msg, { bad: true, sticky: true });
  } finally {
    REG.busy = null;
  }
}
// A payment is the same one in two registers when its sub-project code, purpose, amounts and the
// day its documents came in agree; a contract, by its code, role and number.
const mrdPayKey = (x) => [x.code, x.kind, Math.round((x.eib || 0) * 100), Math.round((x.local || 0) * 100), x.received || '', String(x.note || '').slice(0, 40)].join('|');
const mrdConKey = (c) => [c.code, c.role, c.number || Math.round(c.eib || 0)].join('|');
function mergeMrd(old, fresh, upload) {
  let added = 0, changed = 0;
  const merge = (list, add, key) => {
    const out = new Map((list || []).map((x) => [key(x), x]));
    for (const x of add) {
      const k = key(x), was = out.get(k);
      if (!was) { out.set(k, x); added++; continue; }
      const next = Object.assign({}, was);
      for (const [f, v] of Object.entries(x)) if (v !== null && v !== '' && v !== undefined && v !== was[f]) next[f] = v;
      if (JSON.stringify(next) !== JSON.stringify(was)) changed++;
      out.set(k, next);
    }
    return [...out.values()];
  };
  const contracts = merge((old || {}).contracts, fresh.contracts, mrdConKey);
  const payments = merge((old || {}).payments, fresh.payments, mrdPayKey)
    .sort((a, b) => String(a.paid || a.received || '').localeCompare(String(b.paid || b.received || ''))).slice(-300);
  const uploads = (((old || {}).uploads) || []).concat([{ at: upload.at, file: upload.file, by: upload.by }]).slice(-12);
  return { added, changed, mrd: { at: upload.at, file: upload.file, by: upload.by, first: (old || {}).first || (old || {}).at || upload.at, sheet: fresh.sheet, contracts, payments, uploads } };
}

// What the register says is worth a look: payments waiting, slow ones, works paid after the
// contract's term, works contracts whose tender results the EIB never got.
function mrdFacts(r) {
  const m = r.mrd;
  if (!m) return null;
  const pays = m.payments || [], works = (m.contracts || []).filter((c) => c.role === 'works');
  const asOf = String(m.at || today()).slice(0, 10);
  const lag = (x) => (x.received && x.paid ? dayDiff(x.received, x.paid) : null);
  const waiting = pays.filter((x) => x.received && !x.paid && dayDiff(x.received, asOf) <= 180).map((x) => Object.assign({ days: dayDiff(x.received, asOf) }, x));
  const year = pays.filter((x) => x.paid && x.paid >= addDays(asOf, -365) && lag(x) != null && lag(x) >= 0);
  const slow = year.filter((x) => lag(x) > 30);
  const term = works.map((c) => c.term).filter(Boolean).sort().pop() || null;
  const afterTerm = term ? pays.filter((x) => x.kind === 'works' && x.paid && x.paid > term) : [];
  const noPcr = works.length && pays.some((x) => x.paid) && works.every((c) => c.pcr === '');
  const sum = (k, f) => pays.filter(f || (() => true)).reduce((a, x) => a + (x[k] || 0), 0);
  const value = works.reduce((a, c) => a + (c.eib || 0) + (c.local || 0), 0);
  const paidWorks = sum('eib', (x) => x.paid && ['works', 'advance'].includes(x.kind)) + sum('local', (x) => x.paid && ['works', 'advance'].includes(x.kind));
  return { asOf, file: m.file, waiting, slow, year, term, afterTerm, noPcr, value, paidEib: sum('eib', (x) => x.paid), paidLocal: sum('local', (x) => x.paid),
    paidPct: value ? Math.round((paidWorks / value) * 100) : null, last: pays.filter((x) => x.paid).map((x) => x.paid).sort().pop() || null, lag };
}
function mrdHints(r) {
  const f = mrdFacts(r), out = {};
  if (!f) return out;
  const add = (k, level, text) => (out[k] = out[k] || []).push({ level, text });
  const long = f.waiting.filter((x) => x.days > 14);
  if (long.length) add('r4', long.some((x) => x.days > 30) ? 'high' : 'medium', rt('h_mrdWaiting', { n: long.length, days: Math.max(...long.map((x) => x.days)) }));
  if (f.slow.length) add('r4', 'medium', rt('h_mrdSlow', { n: f.slow.length, of: f.year.length }));
  if (f.afterTerm.length) add('rx', 'medium', rt('h_mrdAfterTerm', { n: f.afterTerm.length, date: fdate(f.term) }));
  if (f.noPcr) add('rx', 'medium', rt('h_mrdNoPcr'));
  return out;
}
function mrdCard(r) {
  const f = mrdFacts(r), m = r.mrd;
  const file = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => file.files[0] && importMrd(file.files[0]) });
  const upload = h('button', { class: 'btn btn-sm', onclick: () => file.click() }, icon('cloud'), rt('mrdUpload'));
  if (!f) return h('div', { class: 'card pad section' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('mrdTitle')), h('div', { class: 'row' }, upload, file)), h('p', { class: 'muted small' }, rt('mrdNone')));
  const kindL = (k) => rt('mrdK_' + k);
  const pays = (m.payments || []).slice().reverse();
  return h('div', { class: 'card pad section' },
    // Loading a new register is in the list's "Data" menu; here only when there is none yet.
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('mrdTitle')), h('span', { class: 'muted small' }, join([rt('mrdAsOf', { date: fdate(f.asOf), file: f.file || '' }), m.by ? rt('mrdBy', { who: m.by }) : null]))),
    kv([
      [rt('mrdPaid'), join([rt('mrdEib', { sum: money(f.paidEib) }), rt('mrdLocal', { sum: money(f.paidLocal) }), f.paidPct != null ? rt('mrdPct', { pct: f.paidPct }) : null])],
      [rt('mrdLast'), f.last ? fdate(f.last) : null],
      [rt('mrdWaitingL'), f.waiting.length ? h('span', { class: f.waiting.some((x) => x.days > 14) ? 'bad' : '' }, rt('mrdWaitingV', { n: f.waiting.length, days: Math.max(...f.waiting.map((x) => x.days)) })) : rt('mrdNoWaiting')],
      [rt('mrdSpeed'), f.year.length ? rt('mrdSpeedV', { med: median(f.year.map(f.lag)), n: f.year.length, slow: f.slow.length }) : null],
      [rt('mrdTerm'), f.term ? h('span', { class: f.afterTerm.length ? 'bad' : '' }, join([fdate(f.term), f.afterTerm.length ? rt('mrdAfterTerm', { n: f.afterTerm.length }) : null])) : null],
    ]),
    h('h3', { class: 'card-sub', style: 'margin-top:14px' }, rt('mrdContracts')),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('pfKind'), rt('sheetContract'), rt('mrdOrg'), rt('mrdSum'), rt('mrdGuarantee'), rt('mrdPcr')].map((x) => h('th', null, x)))),
      h('tbody', null, (m.contracts || []).map((c) => h('tr', null,
        td(rt('pfKind'), null, rt('role_' + (c.role === 'other' ? 'other' : c.role))),
        td(rt('sheetContract'), { class: 'num' }, join([c.number && '№ ' + c.number, c.date && fdate(c.date), c.term && rt('mrdTo', { date: fdate(c.term) })])),
        td(rt('mrdOrg'), { class: 'w-party' }, c.org || '—'),
        td(rt('mrdSum'), { class: 'num' }, join([money(c.eib), c.local ? '+ ' + money(c.local) : null])),
        td(rt('mrdGuarantee'), { class: 'num' }, c.guarantee != null ? h('span', { class: c.guarantee > 5 ? 'bad' : '' }, ni.format(c.guarantee) + '%') : '—'),
        td(rt('mrdPcr'), null, c.pcr ? c.pcr : c.pcr === '' && c.role === 'works' ? h('span', { class: 'warn-text' }, rt('mrdNoPcrShort')) : '—')))))),
    h('h3', { class: 'card-sub', style: 'margin-top:14px' }, rt('mrdPayments', { n: pays.length })),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('mrdReceived'), rt('mrdPaidOn'), rt('mrdDays'), rt('mrdWhat'), rt('mrdEibCol'), rt('mrdLocalCol'), rt('mrdNote')].map((x) => h('th', null, x)))),
      h('tbody', null, pays.slice(0, 60).map((x) => {
        const d = f.lag(x), wait = !x.paid && x.received ? dayDiff(x.received, f.asOf) : null;
        return h('tr', { class: !x.paid ? 'row-warn' : '' },
          td(rt('mrdReceived'), { class: 'num' }, fdate(x.received)), td(rt('mrdPaidOn'), { class: 'num' }, x.paid ? fdate(x.paid) : h('span', { class: 'warn-text' }, rt('mrdWait', { n: wait != null ? wait : '?' }))),
          td(rt('mrdDays'), { class: 'num' + (d > 30 ? ' bad' : '') }, d != null ? String(d) : '—'), td(rt('mrdWhat'), null, kindL(x.kind)),
          td(rt('mrdEibCol'), { class: 'num' }, money(x.eib)), td(rt('mrdLocalCol'), { class: 'num' }, x.local ? money(x.local) : '—'),
          td(rt('mrdNote'), { class: 'w-text small' }, join([x.note, x.comment && x.comment !== 'опрацьовано' ? x.comment : null])));
      })))),
    h('p', { class: 'muted small' }, rt('mrdHint')));
}
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

// ---- signals by sub-project ----------------------------------------------------------------------
//
// One feed for the team: what changed on the contracts the monitor follows (since it started following
// them), and what the sub-project's own data say needs doing (late, payments waiting, overdue tasks),
// by sub-project, newest first. Mine by default, all on a click.
const SIGF = { scope: 'mine' };
function spSignalRows() {
  const out = [];
  for (const r of REG.rows.values()) {
    const news = spNews(spTracked(r)), st = spStage(r), wk = spWork(r), f = mrdFacts(r);
    const items = news.signals.map((g) => ({ at: String(g.since || '').slice(0, 10), level: g.severity, text: t('sig.' + g.type + '.title'), who: g.row.number ? '№ ' + g.row.number : g.row.tid, href: '#/tracked/' + g.row.key }));
    if (st.late) items.push({ at: st.end, level: 'high', text: rt('lateBy', { n: st.late }), href: '#/registry/' + encodeURIComponent(r.code) + '/overview' });
    const waiting = f ? f.waiting.filter((x) => x.days > 14) : [];
    if (waiting.length) items.push({ at: waiting.map((x) => x.received).sort().pop(), level: waiting.some((x) => x.days > 30) ? 'high' : 'medium', text: rt('h_mrdWaiting', { n: waiting.length, days: Math.max(...waiting.map((x) => x.days)) }), href: '#/registry/' + encodeURIComponent(r.code) + '/finance' });
    if (wk.next && wk.next.due && wk.next.due < today()) items.push({ at: wk.next.due, level: 'medium', text: rt('sigTask', { text: wk.next.text }), href: '#/registry/' + encodeURIComponent(r.code) + '/work' });
    if (items.length) out.push({ r, st, items: items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))) });
  }
  return out.sort((a, b) => String(b.items[0].at || '').localeCompare(String(a.items[0].at || '')));
}
function spSignalCount() {
  if (!REG.access || !REG.rows.size) return 0;
  return spSignalRows().filter((x) => isMine(x.r)).reduce((a, x) => a + x.items.filter((i) => i.level === 'high').length, 0);
}
function spSignalsPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  const box = h('div');
  const draw = () => {
    const all = spSignalRows(), mine = all.filter((x) => isMine(x.r));
    const list = SIGF.scope === 'mine' ? mine : all;
    fill(box, h('div', { class: 'section' }, pills([['mine', rt('sigMine', { who: myManager() }), mine.length], ['all', rt('sigAll'), all.length]], SIGF.scope, (v) => { SIGF.scope = v; draw(); })),
      list.length ? list.map(({ r, st, items }) => h('div', { class: 'card pad section sig-sp' },
        h('div', { class: 'card-head' },
          h('a', { class: 'sig-sp-title', href: '#/registry/' + encodeURIComponent(r.code) + '/overview' }, h('b', null, r.code), ' ', h('span', { class: 'clamp1' }, (r.t || {}).name_uk || (r.t || {}).name_en || '')),
          h('div', { class: 'row' }, stageChip(st), h('span', { class: 'tag' + (isMine(r) ? ' ok' : '') }, spManager(r) || '—'))),
        h('div', { class: 'ev-feed' }, items.slice(0, 8).map((i) => h('a', { class: 'ev-row' + (i.level === 'high' ? ' bad' : ''), href: i.href },
          h('span', { class: 'num' }, i.at ? fdate(i.at) : '—'), h('span', null, h('b', null, i.text), i.who ? ' · ' + i.who : '')))),
        items.length > 8 ? h('p', { class: 'muted small' }, rt('sigMore', { n: items.length - 8 })) : null))
        : h('div', { class: 'card empty section' }, rt('sigNone')));
  };
  draw();
  return [pageHead(rt('sigEyebrow'), titleGrad(rt('sigTitle1'), rt('sigTitle2')), rt('sigLead')), box];
}
