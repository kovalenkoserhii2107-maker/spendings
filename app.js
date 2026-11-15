'use strict';

// Монитор расчётов: рабочее место комплаенс-аналитика поверх открытых данных
// spending.gov.ua. Файлы в data/ обновляет GitHub Actions (sync/sync.py), он же
// сверяет договоры с актами и платежами (sync/analysis.py). Поиск ходит на
// портал прямо из браузера. Всё, что показывается, пришло извне, поэтому
// интерфейс собирается из DOM-узлов и текста, без innerHTML.

// ---- DOM ------------------------------------------------------------------------

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// replaceChildren() would print null/false as text; this skips them.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

const ICONS = {
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  alert: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  building: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 10h.01', 'M15 10h.01', 'M9 14h.01', 'M15 14h.01'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  ext: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  check: ['M20 6 9 17l-5-5'],
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// ---- dictionaries -----------------------------------------------------------------

const KIND = {
  transaction: { one: 'Платёж', many: 'Платежи' },
  contract: { one: 'Договор', many: 'Договоры' },
  act: { one: 'Акт', many: 'Акты' },
  addendum: { one: 'Допсоглашение', many: 'Допсоглашения' },
  peny: { one: 'Штраф', many: 'Штрафы' },
  liability: { one: 'Обязательство', many: 'Обязательства' },
  report: { one: 'Отчёт', many: 'Отчёты' },
};
const ROLE = { payer: 'исходящий', recipient: 'входящий', disposer: 'заказчик', contractor: 'исполнитель' };
const DOC_ROLES = [['disposer', 'Организация — заказчик'], ['contractor', 'Организация — исполнитель']];
const ROLES_FOR = {
  transaction: [['payer', 'Исходящие (организация платит)'], ['recipient', 'Входящие (организация получает)']],
  contract: DOC_ROLES, act: DOC_ROLES, addendum: DOC_ROLES, peny: DOC_ROLES,
};
const SEV = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const FLAG = {
  overpaid: ['Переплата', 'high'],
  price_up: ['Рост цены', 'medium'],
  acts_over: ['Акты > договора', 'medium'],
  no_tender: ['Без Prozorro', 'medium'],
  paid_before: ['Оплата до договора', 'medium'],
  split: ['Дробление?', 'medium'],
  paid_over_acts: ['Оплата > актов', 'low'],
  late: ['Поздняя публикация', 'low'],
};
const SIGNAL_TYPES = {
  overpaid: 'Переплата по договору',
  price_up: 'Рост цены допсоглашением',
  acts_over: 'Акты больше договора',
  no_tender: 'Крупный договор без Prozorro',
  paid_before: 'Оплата до даты договора',
  split: 'Возможное дробление',
  no_contract: 'Оплата без опубликованного договора',
  paid_over_acts: 'Оплата больше актов',
  late: 'Поздняя публикация',
  concentration: 'Концентрация на контрагенте',
};
const PAGE = 50;

const state = { index: null, feed: null, signals: null, search: null };
const app = document.getElementById('app');

// ---- formatting ------------------------------------------------------------------------

const nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const ni = new Intl.NumberFormat('ru-RU');
function money(amount, currency) {
  if (amount == null) return '—';
  return nf.format(amount) + (currency && currency !== 'UAH' ? ' ' + currency : ' ₴');
}
function mshort(x) {
  if (x == null) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return nf1.format(x / 1e9) + ' млрд ₴';
  if (a >= 1e6) return nf1.format(x / 1e6) + ' млн ₴';
  if (a >= 1e4) return ni.format(Math.round(x / 1e3)) + ' тыс ₴';
  return money(x);
}
function fdate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function ftime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
const today = () => new Date().toISOString().slice(0, 10);
const join = (parts, sep = ' · ') => parts.filter((p) => p != null && String(p).trim() !== '').map((p) => String(p).trim()).join(sep);
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

function toast(text, bad) {
  let box = document.querySelector('.toasts');
  if (!box) document.body.append((box = h('div', { class: 'toasts', role: 'status' })));
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, text);
  box.append(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

// ---- site data ----------------------------------------------------------------------------

async function getJSON(path, version) {
  const res = await fetch(`${path}?v=${encodeURIComponent(version || Date.now())}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'Данные ещё не подготовлены' : `Ошибка загрузки (${res.status})`);
  return res.json();
}
const ver = () => state.index && state.index.generated_at;

async function loadAll() {
  state.index = await getJSON('data/index.json');
  const [feed, signals] = await Promise.all([
    getJSON('data/feed.json', ver()).catch(() => ({ items: [] })),
    getJSON('data/signals.json', ver()).catch(() => ({ items: [] })),
  ]);
  state.feed = feed;
  state.signals = signals;
}

const cache = new Map();
function cached(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
const orgByCode = (code) => (state.index.orgs || []).find((o) => o.edrpou === code);

function loadKind(org, kind) {
  // One organisation's records of one kind: a file per year, cached per data version.
  return cached(`${org.edrpou}:${kind}:${ver()}`, () => {
    const years = (org.files || {})[kind] || [];
    return Promise.all(years.map((y) => getJSON(`data/org/${org.edrpou}/${kind}-${y}.json`, ver())))
      .then((parts) => parts.flat().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.ext_id).localeCompare(String(a.ext_id))));
  });
}
function loadAnalysis(org) {
  return cached(`${org.edrpou}:analysis:${ver()}`, () => getJSON(`data/org/${org.edrpou}/analysis.json`, ver()));
}
async function findRecords(org, kind, extIds) {
  const want = new Set(extIds.map(String));
  return (await loadKind(org, kind)).filter((i) => want.has(String(i.ext_id))).map((i) => Object.assign({ org_name: org.name, org_edrpou: org.edrpou }, i));
}

function repoName() {
  if (state.index && state.index.repo) return state.index.repo;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const first = location.pathname.split('/')[1];
  return m && first ? `${m[1]}/${first}` : '';
}
const ghUrl = (path) => (repoName() ? `https://github.com/${repoName()}/${path}` : null);
function ghLink(path, label, cls) {
  const url = ghUrl(path);
  return url ? h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, label) : h('b', null, label);
}
const ext = (href, label, cls) => h('a', { class: cls || 'btn btn-sm', href, target: '_blank', rel: 'noopener noreferrer' }, label, icon('ext'));

// "Read" marks live in this browser only: the site has no accounts.
function getSeen() {
  try { return localStorage.getItem('seen') || ''; } catch (e) { return ''; }
}
function setSeen(value) {
  try { localStorage.setItem('seen', value); } catch (e) { /* private mode: marks just do not persist */ }
}
const isNew = (item) => item.is_event && item.first_seen_at > getSeen();
const unreadCount = () => (state.feed ? state.feed.items.filter(isNew).length : 0);
const riskCount = () => (state.signals ? state.signals.items.filter((s) => s.severity !== 'low').length : 0);

// ---- the portal, straight from the browser --------------------------------------------------

const API = 'https://api.spending.gov.ua/api';
const DOC_PATHS = { contract: '/v2/disposers/contracts', act: '/v2/disposers/acts', addendum: '/v2/disposers/addendums', peny: '/v2/disposers/peny' };

async function portal(path, params) {
  let res;
  try {
    res = await fetch(API + path + (params ? '?' + qs(params) : ''));
  } catch (e) {
    // The portal sends no CORS headers with its error answers, so a rejected
    // request and an unreachable portal look the same from here.
    throw new Error('Портал не ответил или отклонил запрос. Проверьте код и период и попробуйте ещё раз.');
  }
  if (!res.ok) throw new Error(`Портал ответил ошибкой ${res.status}`);
  return res.json();
}

async function portalTransactions(code, role, from, to) {
  const out = [];
  for (let a = from; a <= to; a = addDays(a, 92)) {  // the portal allows 92 days per request
    const b = addDays(a, 91) < to ? addDays(a, 91) : to;
    out.push(...(await portal('/v2/api/transactions/', { [role === 'payer' ? 'payers_edrpous' : 'recipt_edrpous']: code, startdate: a, enddate: b }) || []));
  }
  return out;
}

async function portalDocuments(kind, code, role, from, to) {
  // A response holds at most ~1000 records; `count` above the number returned
  // means the list was cut, and the date range is halved until every piece fits.
  const res = await portal(DOC_PATHS[kind], { [role === 'disposer' ? 'disposerId' : 'contractorId']: code, signDateFrom: from, signDateTo: to });
  const docs = res.documents || [];
  if (!res.moreThenCount && (res.count || 0) <= docs.length) return { docs, truncated: false };
  if (from >= to) return { docs, truncated: true };
  const mid = addDays(from, Math.floor(daysBetween(from, to) / 2));
  const a = await portalDocuments(kind, code, role, from, mid);
  const b = await portalDocuments(kind, code, role, addDays(mid, 1), to);
  return { docs: a.docs.concat(b.docs), truncated: a.truncated || b.truncated };
}

async function portalLiabilities(code, from, to) {
  const out = [];
  for (let a = from; a <= to; a = addDays(a, 92)) {
    const b = addDays(a, 91) < to ? addDays(a, 91) : to;
    out.push(...(await portal('/v2/liabilities/fu', { payer_edrpou: code, startdater: a, enddater: b }) || []));
  }
  return out;
}

async function portalReports(code) {
  const out = [];
  for (let page = 0; page < 20; page++) {
    const res = await portal(`/v2/api/reports/${encodeURIComponent(code)}/page`, { page, size: 200 });
    out.push(...(res.content || []));
    if (page + 1 >= (res.totalPages || 0)) break;
  }
  return out;
}

let reportDicts = null;
function loadReportDicts() {
  if (!reportDicts) {
    reportDicts = Promise.all([portal('/v2/api/reports/report_types/'), portal('/v2/api/reports/periods/')])
      .then(([types, periods]) => ({
        types: Object.fromEntries(types.map((t) => [t.id, t.shortName || t.name])),
        periods: Object.fromEntries(periods.map((p) => [p.id, p.name])),
      }))
      .catch(() => ({ types: {}, periods: {} }));
  }
  return reportDicts;
}

// Mirrors normalize() in sync/spending.py: the same columns for the same record.
function normalize(kind, raw, code, names, dicts) {
  const day = (v) => (v || '').slice(0, 10) || null;
  if (kind === 'transaction') {
    const isPayer = raw.payer_edrpou === code;
    const other = isPayer ? 'recipt' : 'payer';
    return {
      ext_id: String(raw.id), date: day(raw.trans_date), amount: raw.amount, currency: raw.currency || 'UAH',
      role: isPayer ? 'payer' : 'recipient', cp_edrpou: raw[other + '_edrpou'], cp_name: raw[other + '_name'], title: raw.payment_details || '',
    };
  }
  if (DOC_PATHS[kind]) {
    const isDisposer = raw.edrpou === code;
    const people = raw.contractors || [];
    const ids = people.map((c) => c.identifier).filter((i) => i && i !== 'HIDDEN');
    const number = raw.documentNumber;
    const specs = join((raw.specifications || []).slice(0, 3).map((s) => s.specificationName), '; ');
    const title = kind === 'contract' ? join([number && '№ ' + number, raw.subject])
      : kind === 'addendum' ? join([number ? 'Допсоглашение № ' + number : 'Допсоглашение', raw.subject])
        : kind === 'act' ? join([number ? 'Акт № ' + number : 'Акт', specs])
          : number ? 'Штрафная санкция № ' + number : 'Штрафная санкция';
    return {
      ext_id: String(raw.id), date: day(raw.signDate || raw.documentDate), amount: raw.amount, currency: raw.currency || 'UAH',
      role: isDisposer ? 'disposer' : 'contractor',
      cp_edrpou: isDisposer ? ids[0] || null : raw.edrpou,
      cp_name: isDisposer ? join(people.map((c) => c.name), ', ') || null : (names || {})[raw.edrpou] || null,
      title,
    };
  }
  if (kind === 'liability') {
    return {
      ext_id: `${raw.system_key_fu}-${day(raw.dater) || ''}-${raw.nr}`, date: day(raw.dater), amount: raw.s, currency: raw.currency || 'UAH',
      role: 'payer', cp_edrpou: null, cp_name: null,
      title: join([raw.kekv && `КЕКВ ${raw.kekv} ${raw.kekv_name || ''}`, raw.contractNumber && 'договор ' + raw.contractNumber, raw.note]),
    };
  }
  return {
    ext_id: String(raw.reportId), date: day(raw.publishDate || raw.createDate), amount: null, currency: null,
    role: 'owner', cp_edrpou: null, cp_name: null,
    title: join([(dicts && dicts.types[raw.reportTypeId]) || 'Отчёт', dicts && dicts.periods[raw.periodId], raw.progKlasCod]),
  };
}

// ---- shell -------------------------------------------------------------------------------------

function shell(route, page) {
  const link = (href, label, key, ico, badge) => h('a', { href, class: route === key ? 'on' : '' }, icon(ico), label, badge);
  const risks = riskCount();
  const unread = unreadCount();
  const last = state.index.runs && state.index.runs[0];
  const failed = last && last.orgs_failed;
  return [
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('header', { class: 'top' }, h('div', { class: 'wrap top-inner' },
      h('a', { class: 'brand', href: '#/' },
        h('span', { class: 'brand-mark' }, icon('chart')),
        h('span', null, h('b', null, 'Монитор расчётов'), h('small', null, 'Договоры · Акты · Платежи'))),
      h('nav', { class: 'nav', 'aria-label': 'Разделы' },
        link('#/', 'Обзор', 'home', 'chart'),
        link('#/signals', 'Сигналы', 'signals', 'alert', risks ? h('em', { class: 'count red' }, risks) : null),
        link('#/contracts', 'Договоры', 'contracts', 'file'),
        link('#/orgs', 'Организации', 'orgs', 'building'),
        link('#/feed', 'Лента', 'feed', 'bell', unread ? h('em', { class: 'count', id: 'unread' }, unread) : null),
        link('#/search', 'Поиск', 'search', 'search'),
        link('#/method', 'Методика', 'method', 'book')),
      h('div', { class: 'top-meta' },
        h('span', { class: 'chip' + (failed ? ' warn' : ''), title: last ? 'Последняя проверка портала: ' + ftime(last.finished_at) : '' }, h('i'), last ? ftime(last.finished_at).slice(0, 5) + ' ' + ftime(last.finished_at).slice(11) : 'Проверок не было'),
        ghUrl('actions/workflows/sync.yml')
          ? h('a', { class: 'btn btn-dark', href: ghUrl('actions/workflows/sync.yml'), target: '_blank', rel: 'noopener noreferrer', title: 'Запустить обновление на GitHub' }, icon('refresh'), h('span', null, 'Обновить'))
          : null))),
    h('main', { class: 'page' }, h('div', { class: 'wrap' }, page)),
  ];
}

function pageHead(eyebrow, title, lead, side) {
  return h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null),
    side || null);
}

// ---- shared pieces ------------------------------------------------------------------------

function select(options, value, onchange) {
  const el = h('select', { class: 'select', onchange }, options.map(([v, label]) => h('option', { value: v }, label)));
  el.value = value;
  return el;
}

function pills(options, value, onpick) {
  const box = h('div', { class: 'pills', role: 'tablist' });
  const draw = (cur) => fill(box, options.map(([v, label, count]) => h('button', {
    class: v === cur ? 'on' : '', role: 'tab', 'aria-selected': v === cur, onclick: () => { draw(v); onpick(v); },
  }, label, count != null ? h('em', { class: 'count' }, count) : null)));
  draw(value);
  return box;
}

function itemsTable(items, opts) {
  if (!items.length) return h('div', { class: 'empty' }, h('b', null, opts.emptyTitle || 'Ничего не найдено'), opts.emptyText || 'Попробуйте изменить условия.');
  const rows = items.map((it) => {
    const incoming = it.kind === 'transaction' && it.role === 'recipient';
    return h('tr', { class: 'click' + (opts.marks && isNew(it) ? ' new' : ''), tabindex: 0, onclick: () => openRecord(it), onkeydown: (e) => { if (e.key === 'Enter') openRecord(it); } },
      h('td', { class: 'num' }, fdate(it.date)),
      h('td', null, h('span', { class: 'kind ' + it.kind }, KIND[it.kind].one), ROLES_FOR[it.kind] && ROLE[it.role] ? h('div', { class: 'cell-sub' }, ROLE[it.role]) : null),
      opts.showOrg && h('td', { class: 'w-party' }, h('a', { href: '#/org/' + it.org_edrpou, onclick: (e) => e.stopPropagation() }, it.org_name)),
      h('td', { class: 'w-party' }, h('div', { class: 'cell-main' }, it.cp_name || (it.cp_edrpou ? 'ЄДРПОУ ' + it.cp_edrpou : '—')), it.cp_name && it.cp_edrpou ? h('div', { class: 'cell-sub num' }, it.cp_edrpou) : null),
      h('td', { class: 'w-text' }, h('div', { class: 'clamp' }, it.title || '—')),
      h('td', { class: 'r num' + (incoming ? ' in' : '') }, it.amount == null ? '' : (incoming ? '+' : '') + money(it.amount, it.currency)));
  });
  return h('div', { class: 'scroll' }, h('table', null,
    h('thead', null, h('tr', null,
      h('th', null, 'Дата'), h('th', null, 'Тип'), opts.showOrg && h('th', null, 'Организация'),
      h('th', null, 'Контрагент'), h('th', null, 'Описание'), h('th', { class: 'r' }, 'Сумма'))),
    h('tbody', null, rows)));
}

// A filtered list shown a page at a time, with its total and UAH sum.
function pagedList(box, items, page, opts, onPage, render) {
  const total = items.length;
  const sum = items.reduce((acc, i) => acc + (i.currency === 'UAH' && i.amount != null ? i.amount : 0), 0);
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const slice = items.slice(page * PAGE, (page + 1) * PAGE);
  fill(box,
    (render || itemsTable)(slice, opts),
    total ? h('div', { class: 'foot' },
      h('div', null, `${ni.format(from)}–${ni.format(to)} из ${ni.format(total)}`, opts.noSum ? '' : ` · на сумму ${money(opts.sum != null ? opts.sum : sum)}`),
      h('div', { class: 'row' },
        opts.csv && h('button', { class: 'btn btn-sm', onclick: () => (opts.csvRows || csvItems)(items, opts.csv) }, 'Скачать CSV'),
        opts.extra,
        h('button', { class: 'btn btn-sm', disabled: page === 0, onclick: () => onPage(page - 1) }, '← Назад'),
        h('button', { class: 'btn btn-sm', disabled: to >= total, onclick: () => onPage(page + 1) }, 'Вперёд →'))) : null);
}

function csvDownload(lines, name) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const dec = (x) => (x == null ? '' : String(x).replace('.', ','));
function csvItems(items, name) {
  const lines = [['Дата', 'Тип', 'Роль', 'Контрагент', 'ЄДРПОУ контрагента', 'Сумма', 'Валюта', 'Описание', 'ID']];
  for (const i of items) lines.push([i.date, KIND[i.kind].one, ROLE[i.role] || '', i.cp_name, i.cp_edrpou, dec(i.amount), i.currency, i.title, i.ext_id]);
  csvDownload(lines, name);
}

function kv(pairs) {
  const dl = h('dl', { class: 'kv' });
  for (const [label, value] of pairs) {
    if (value == null || value === '' || value === false) continue;
    dl.append(h('dt', null, label), h('dd', null, value));
  }
  return dl;
}
function party(name, code) {
  if (!name && !code) return null;
  return [name || '', code && code !== 'HIDDEN' ? ` (${code})` : code === 'HIDDEN' ? ' (код скрыт)' : ''].join('');
}
function prozorro(id) {
  if (!id) return null;
  return /^UA-/.test(id) ? h('a', { href: 'https://prozorro.gov.ua/tender/' + encodeURIComponent(id), target: '_blank', rel: 'noopener noreferrer' }, id) : id;
}
function address(a) {
  if (!a) return null;
  return [a.regionName, a.district, a.city, a.street, a.house, a.office && 'оф. ' + a.office].filter(Boolean).join(', ');
}
// Lookups an analyst runs on a counterparty: company card, owners, court cases, sanctions.
function partyLinks(code) {
  if (!code || !/^\d{8}$/.test(code)) return null;
  return h('div', { class: 'links' },
    ext('https://clarity-project.info/edr/' + code, 'Clarity Project'),
    ext('https://youcontrol.com.ua/catalog/company_details/' + code + '/', 'YouControl'),
    ext('https://opendatabot.ua/c/' + code, 'Opendatabot'));
}

function sevTag(sev) {
  return h('span', { class: 'sev ' + sev }, SEV[sev]);
}
// A price rise above the 10% limit is high risk; below it, medium.
const flagSev = (c, f) => (f === 'price_up' && c.value0 && c.price_up / c.value0 > 0.1 ? 'high' : (FLAG[f] || [])[1] || '');
function flagChips(c, flags) {
  if (!flags || !flags.length) return h('span', { class: 'faint small' }, '—');
  return h('div', { class: 'flags' }, flags.map((f) => h('span', { class: 'flag ' + flagSev(c, f) }, (FLAG[f] || [f])[0])));
}
function payBar(c) {
  const base = Math.max(c.value || 0, c.paid || 0, c.acts_sum || 0) || 1;
  const over = c.value && c.paid > c.value + 1;
  return h('div', null,
    h('div', { class: 'bar' + (over ? ' over' : ''), title: `Акты ${money(c.acts_sum)} · Оплачено ${money(c.paid)}` },
      h('i', { class: 'acts', style: `width:${Math.min(100, (c.acts_sum / base) * 100)}%` }),
      h('i', { style: `width:${Math.min(100, (c.paid / base) * 100)}%` })),
    h('div', { class: 'bar-label' }, h('span', null, c.value ? Math.round((c.paid / c.value) * 100) + '% оплачено' : '—'), h('span', null, c.acts.length ? c.acts.length + ' акт.' : '')));
}

// ---- record and contract sheets -----------------------------------------------------------------

function closeSheet() {
  document.querySelectorAll('.scrim, .sheet').forEach((n) => n.remove());
  document.removeEventListener('keydown', escClose);
}
function escClose(e) {
  if (e.key === 'Escape') closeSheet();
}
function sheet(...content) {
  closeSheet();
  const body = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': 'Закрыть' }, icon('x')), content);
  document.body.append(h('div', { class: 'scrim', onclick: closeSheet }), body);
  document.addEventListener('keydown', escClose);
  body.focus();
  return body;
}

function detailBody(kind, d) {
  const out = [];
  if (kind === 'transaction') {
    out.push(kv([
      ['Дата оплаты', fdate(d.trans_date)],
      ['Плательщик', party(d.payer_name, d.payer_edrpou)],
      ['Счёт плательщика', d.payer_account],
      ['Получатель', party(d.recipt_name, d.recipt_edrpou)],
      ['Счёт получателя', d.recipt_account],
      ['Назначение платежа', d.payment_details],
      ['Документ', d.doc_number ? `№ ${d.doc_number} от ${fdate(d.doc_date)}` : null],
      ['КЕКВ', d.kekv],
      ['КПК', d.kpk],
      ['Код бюджета', d.budgetCode],
      ['Источник данных', d.source_name],
      ['Закупка Prozorro', prozorro(d.contractNumber)],
    ]));
    const code = d.recipt_edrpou && /^\d{8}$/.test(d.recipt_edrpou) ? d.recipt_edrpou : null;
    if (code) out.push(h('section', null, h('h3', null, 'Проверить получателя'), partyLinks(code)));
  } else if (kind === 'liability') {
    out.push(kv([
      ['Плательщик', party(d.payer_name, d.payer_edrpou)],
      ['Документ', d.ndoc ? `№ ${d.ndoc} от ${fdate(d.datedoc)}` : null],
      ['Дата регистрации', fdate(d.dater)],
      ['Срок', d.dateterm ? fdate(d.dateterm) : null],
      ['Бюджет', d.minfin_name],
      ['Код бюджета', d.budgetCode],
      ['КВК', join([d.kvk, d.kvk_name], ' — ')],
      ['КПК', join([d.kpk, d.kpk_name], ' — ')],
      ['КЕКВ', join([d.kekv, d.kekv_name], ' — ')],
      ['Номер договора', d.contractNumber],
      ['Договор Prozorro', d.prozorroContractId],
      ['Примечание', d.note],
    ]));
    const box = h('div');
    const btn = h('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        btn.disabled = true;
        try {
          const items = await portal('/v2/liabilities/ff', { system_key_fu: d.system_key_fu }) || [];
          fill(box, items.length
            ? h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'Дата'), h('th', null, '№'), h('th', null, 'Получатель'), h('th', { class: 'r' }, 'Сумма'))),
              h('tbody', null, items.map((f) => h('tr', null,
                h('td', { class: 'num' }, fdate(f.datedocf)), h('td', null, f.ndocf || '—'),
                h('td', { class: 'num' }, f.recipt_edrpou || '—'), h('td', { class: 'r num' }, money(f.s, f.currency))))))
            : h('div', { class: 'muted' }, 'Финансовых обязательств нет.'));
        } catch (e) {
          btn.disabled = false;
          toast(e.message, true);
        }
      },
    }, 'Показать финансовые обязательства');
    box.append(btn);
    out.push(h('section', null, h('h3', null, 'Финансовые обязательства'), box));
  } else if (kind === 'report') {
    out.push(kv([
      ['Дата публикации', fdate(d.publishDate)],
      ['Создан', d.createDate],
      ['Бюджет', d.budget === 'LOCAL' ? 'местный' : d.budget === 'STATE' ? 'государственный' : d.budget],
      ['Фонд', d.fund === 'SPECIAL' ? 'специальный' : d.fund === 'GENERAL' ? 'общий' : d.fund],
      ['Ведомственная классификация', join([d.vidKlasCod, d.vidKlas], ' — ')],
      ['Программная классификация', join([d.progKlasCod, d.progKlas], ' — ')],
      ['Подписал', join([d.lname, d.fname, d.mname], ' ')],
    ]));
  } else {
    const people = (d.contractors || []).map((c) => h('div', null, party(c.name, c.identifier), address(c.address) ? h('div', { class: 'cell-sub' }, address(c.address)) : null));
    out.push(kv([
      ['Номер', d.documentNumber],
      ['Дата документа', fdate(d.documentDate)],
      ['Опубликован', fdate(d.signDate)],
      ['Заказчик (ЄДРПОУ)', d.edrpou],
      ['Контрагенты', people.length ? people : null],
      ['Предмет', d.subject],
      ['Срок действия', d.noTerm ? 'бессрочный' : d.fromDate || d.toDate ? `${fdate(d.fromDate)} — ${fdate(d.toDate)}` : null],
      ['НДС в сумме', d.pdvAmount != null ? money(d.pdvAmount, d.currency) : null],
      ['Тендер', kind === 'contract' ? (d.tender ? 'да' : 'нет') : null],
      ['Основание без тендера', d.tender ? null : d.reason],
      ['Тендер Prozorro', prozorro(d.idTenderProzorro)],
      ['Сумма изменения', d.amountIncrease != null ? money(d.amountIncrease, d.currency) : null],
    ]));
    if ((d.specifications || []).length) {
      out.push(h('section', null, h('h3', null, 'Спецификация'), h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Наименование'), h('th', null, 'CPV'), h('th', { class: 'r' }, 'Кол-во'), h('th', { class: 'r' }, 'Цена'))),
        h('tbody', null, d.specifications.map((s) => h('tr', null,
          h('td', null, s.specificationName || '—'), h('td', { class: 'num' }, s.cpvCode || '—'),
          h('td', { class: 'r num' }, s.itemCount != null ? `${ni.format(s.itemCount)} ${s.itemDimension || ''}` : '—'),
          h('td', { class: 'r num' }, s.itemCost != null ? money(s.itemCost, d.currency) : '—'))))))));
    }
  }
  out.push(h('section', null, h('details', null, h('summary', null, 'Все поля записи'), h('pre', null, JSON.stringify(d, null, 2)))));
  return out;
}

function openRecord(item) {
  sheet(
    h('span', { class: 'kind ' + item.kind }, KIND[item.kind].one),
    h('h2', null, item.cp_name || item.org_name || KIND[item.kind].one),
    h('div', { class: 'sub' }, join([item.org_name, fdate(item.date), item.amount != null ? money(item.amount, item.currency) : null])),
    detailBody(item.kind, item.data || {}));
}

async function openRecords(org, kind, extIds, title, text) {
  const box = h('div', null, h('div', { class: 'empty' }, 'Загрузка…'));
  sheet(h('span', { class: 'kind ' + kind }, KIND[kind].many), h('h2', null, title), text ? h('div', { class: 'sub' }, text) : null, h('section', null, box));
  try {
    const items = await findRecords(org, kind, extIds);
    fill(box, h('div', { class: 'table-card' }, itemsTable(items, { emptyText: 'Записи не найдены.' })));
  } catch (e) {
    fill(box, h('div', { class: 'empty' }, e.message));
  }
}

const SIGNAL_HELP = {
  overpaid: 'Сумма платежей Казначейства, в назначении которых указан этот договор, больше цены договора с учётом допсоглашений.',
  price_up: 'Допсоглашение увеличило цену договора. Закон о публичных закупках (ст. 41) допускает рост цены за единицу товара не более чем на 10%.',
  acts_over: 'Сумма опубликованных актов превышает цену договора.',
  no_tender: 'Договор выше порога закупочных процедур, но без процедуры в Prozorro. Проверьте основание: в военное время часть закупок проводится по исключениям.',
  paid_before: 'Платёж по договору прошёл раньше даты его заключения.',
  split: 'Несколько договоров с одним поставщиком на однородный предмет за 30 дней, каждый ниже порога, а вместе — выше.',
  paid_over_acts: 'Оплачено больше, чем подтверждено актами. Это может быть предоплата или поставка по накладным, которые на портале не публикуются.',
  late: 'Договор опубликован позже 5 рабочих дней после заключения.',
};

async function openContract(org, contractId) {
  const body = sheet(h('div', { class: 'empty' }, 'Загрузка досье…'));
  let a;
  try {
    a = await loadAnalysis(org);
  } catch (e) {
    fill(body, h('div', { class: 'empty' }, e.message));
    return;
  }
  const c = a.contracts.find((x) => x.id === String(contractId));
  if (!c) {
    fill(body, h('div', { class: 'empty' }, 'Договор не найден в данных.'));
    return;
  }
  const rest = c.value - c.paid;
  const events = [
    { d: c.date, cls: '', label: 'Договор заключён', amount: c.value0 },
    c.published && { d: c.published, cls: '', label: 'Опубликован на портале' + (c.late_days > 5 ? ` · через ${c.late_days} раб. дн.` : '') },
    ...c.addendums.map((x) => ({ d: x.date, cls: 'add', label: `Допсоглашение № ${x.number || '—'}` + (x.type === 1 ? ` · +${money(x.delta)}` : x.type === 0 ? ` · −${money(x.delta)}` : ''), amount: x.amount, kind: 'addendum', ext: x.ext_id })),
    ...c.acts.map((x) => ({ d: x.date, cls: 'act', label: `Акт № ${x.number || '—'}`, amount: x.amount, kind: 'act', ext: x.ext_id })),
    ...c.payments.map((x) => ({ d: x.date, cls: 'pay', label: 'Платёж Казначейства', amount: x.amount, kind: 'transaction', ext: x.ext_id })),
  ].filter(Boolean).sort((x, y) => (x.d || '').localeCompare(y.d || ''));
  const clickEv = async (ev) => {
    const [rec] = await findRecords(org, ev.kind, [ev.ext]);
    if (rec) openRecord(rec);
  };
  const contractClose = h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': 'Закрыть' }, icon('x'));
  fill(body,
    contractClose,
    h('div', { class: 'chips', style: 'margin-top:0' }, h('span', { class: 'kind contract' }, 'Договор'), c.role === 'contractor' ? h('span', { class: 'tag' }, 'организация — исполнитель') : null),
    h('h2', null, `№ ${c.number || '—'} от ${fdate(c.date)}`),
    h('div', { class: 'sub' }, join([c.party_name, c.party_code]), h('br'), c.subject),
    h('div', { class: 'money-row' },
      h('div', null, h('small', null, 'Цена договора'), h('b', { class: 'num' }, mshort(c.value)), c.value !== c.value0 ? h('div', { class: 'cell-sub' }, 'было ' + mshort(c.value0)) : null),
      h('div', null, h('small', null, 'Акты'), h('b', { class: 'num' }, mshort(c.acts_sum))),
      h('div', { class: c.flags.includes('overpaid') ? 'bad' : '' }, h('small', null, 'Оплачено'), h('b', { class: 'num' }, mshort(c.paid)), h('div', { class: 'cell-sub' }, 'за период загрузки')),
      h('div', { class: rest < -1 ? 'bad' : '' }, h('small', null, rest < -1 ? 'Переплата' : 'Остаток'), h('b', { class: 'num' }, mshort(Math.abs(rest))))),
    h('section', null, payBar(c)),
    c.flags.length ? h('section', null, h('h3', null, 'Сигналы'), h('div', { class: 'explain' },
      c.flags.map((f) => h('div', { class: flagSev(c, f) }, h('b', null, (FLAG[f] || [f])[0] + '. '), SIGNAL_HELP[f] || '')))) : null,
    h('section', null, h('h3', null, 'Хронология расчётов'),
      events.length ? h('div', { class: 'timeline' }, events.map((ev) => h('div', {
        class: 'ev ' + ev.cls + (ev.ext ? ' click' : ''), onclick: ev.ext ? () => clickEv(ev) : null,
      }, h('span', { class: 'd num' }, fdate(ev.d)), h('span', null, ev.label), h('span', { class: 'num' }, ev.amount != null ? money(ev.amount) : '')))) : h('div', { class: 'muted' }, 'Событий нет.'),
      !c.payments.length ? h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Платежей с этим договором в назначении не найдено за загруженный период (платежи — с даты добавления организации минус 92 дня).') : null),
    h('section', null, h('h3', null, 'Условия'), kv([
      ['Срок действия', c.from || c.to ? `${fdate(c.from)} — ${c.to ? fdate(c.to) : 'бессрочно'}` : null],
      ['Процедура', c.tender ? 'тендер' : 'без тендера'],
      ['Основание', c.tender ? null : c.reason],
      ['Prozorro', prozorro(c.prozorro)],
      ['CPV', c.cpv],
    ])),
    c.party_code ? h('section', null, h('h3', null, 'Проверить контрагента'), partyLinks(c.party_code)) : null,
    h('section', null, h('button', {
      class: 'btn btn-sm', onclick: async () => {
        const [rec] = await findRecords(org, 'contract', [c.ext_id]);
        if (rec) openRecord(rec);
      },
    }, 'Карточка договора с портала')));
}

// ---- signals ---------------------------------------------------------------------------------

function openSignal(s) {
  const org = orgByCode(s.org_edrpou);
  if (!org) return;
  if (s.contract) openContract(org, s.contract);
  else if (s.type === 'no_contract') openRecords(org, 'transaction', s.ext_ids, s.party || 'Платежи без договора', s.text);
  else if (s.type === 'late') location.hash = `#/org/${org.edrpou}/contracts/late`;
  else location.hash = `#/org/${org.edrpou}/contracts`;
}

function signalCard(s, showOrg) {
  return h('article', {
    class: 'sig ' + s.severity, tabindex: 0, onclick: () => openSignal(s), onkeydown: (e) => { if (e.key === 'Enter') openSignal(s); },
  },
    h('div', { class: 'meta' }, sevTag(s.severity), h('span', null, SIGNAL_TYPES[s.type] || s.type), showOrg ? h('b', null, s.org_name) : null),
    h('h3', null, s.party || s.title),
    h('p', { class: 'text' }, s.party ? s.title + '. ' + s.text : s.text),
    h('div', { class: 'side' },
      s.amount != null ? h('span', { class: 'amount num' }, mshort(s.amount)) : h('span'),
      s.date ? h('span', { class: 'faint small' }, fdate(s.date)) : null,
      h('span', { class: 'btn btn-sm' }, s.contract ? 'Досье' : 'Открыть', icon('arrow'))));
}

function signalsPage(preset) {
  const all = state.signals.items;
  const f = { sev: preset || 'risk', type: '', org: '', q: '' };
  const list = h('div', { class: 'sig-list' });
  const counts = { risk: all.filter((s) => s.severity !== 'low').length, high: 0, medium: 0, low: 0 };
  for (const s of all) counts[s.severity]++;
  const types = [...new Set(all.map((s) => s.type))];

  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const items = all.filter((s) => (f.sev === 'all' || (f.sev === 'risk' ? s.severity !== 'low' : s.severity === f.sev))
      && (!f.type || s.type === f.type) && (!f.org || s.org_edrpou === f.org)
      && (!words.length || words.every((w) => [s.title, s.text, s.party, s.org_name].join(' ').toLowerCase().includes(w))));
    fill(list, items.length ? items.slice(0, 300).map((s) => signalCard(s, true))
      : h('div', { class: 'card empty' }, h('b', null, all.length ? 'По этим условиям сигналов нет' : 'Сигналов пока нет'), all.length ? 'Измените фильтр.' : 'Они появятся после первой сверки данных.'),
    items.length > 300 ? h('p', { class: 'muted small' }, `Показаны первые 300 из ${items.length}. Уточните фильтр.`) : null);
  }
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Контрагент, текст', oninput: () => { f.q = q.value; draw(); } });
  draw();
  return [
    pageHead('Сигналы риска', [h('span', null, 'Что проверить '), h('span', { class: 'grad' }, 'в первую очередь')],
      'Расхождения между договорами, актами и платежами и признаки нарушений закупочных правил. Это поводы для проверки, а не вывод о нарушении.'),
    h('div', { class: 'filters' },
      pills([['risk', 'Высокий и средний', counts.risk], ['high', 'Высокий', counts.high], ['medium', 'Средний', counts.medium], ['low', 'Низкий', counts.low], ['all', 'Все', all.length]], f.sev, (v) => { f.sev = v; draw(); }),
      select([['', 'Все типы']].concat(types.map((t) => [t, SIGNAL_TYPES[t] || t])), '', (e) => { f.type = e.target.value; draw(); }),
      state.index.orgs.length > 1 ? select([['', 'Все организации']].concat(state.index.orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; draw(); }) : null,
      q),
    list,
  ];
}

// ---- overview ----------------------------------------------------------------------------------

function ring(share) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  svg.setAttribute('viewBox', '0 0 36 36');
  const mk = (stroke, dash) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '18'); c.setAttribute('cy', '18'); c.setAttribute('r', '15.9');
    c.setAttribute('fill', 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', '3.6');
    c.setAttribute('stroke-linecap', 'round');
    if (dash != null) { c.setAttribute('stroke-dasharray', `${dash} 100`); c.setAttribute('transform', 'rotate(-90 18 18)'); }
    return c;
  };
  svg.append(mk('#E6EAF0'), mk('#1A7F37', Math.max(0, Math.min(100, share * 100))));
  return svg;
}

function overviewPage() {
  const orgs = state.index.orgs;
  if (!orgs.length) {
    return [pageHead('Монитор расчётов', [h('span', null, 'Расчёты по договорам — '), h('span', { class: 'grad' }, 'под контролем.')]), howToAdd()];
  }
  const sum = (key) => orgs.reduce((a, o) => a + ((o.totals || {})[key] || 0), 0);
  const value = sum('value'), paid = sum('paid'), acts = sum('acts'), unmatched = sum('unmatched_sum'), contracts = sum('contracts');
  const share = paid + unmatched ? paid / (paid + unmatched) : 0;
  const sig = state.signals.items;
  const high = sig.filter((s) => s.severity === 'high');
  const medium = sig.filter((s) => s.severity === 'medium');
  const top = sig.filter((s) => s.severity !== 'low').slice(0, 3);
  const byType = {};
  for (const s of sig) if (s.severity !== 'low') byType[s.type] = (byType[s.type] || 0) + 1;
  const last = state.index.runs && state.index.runs[0];
  const week = state.feed.items.filter((i) => i.first_seen_at && (Date.now() - new Date(i.first_seen_at)) < 7 * 86400000).length;

  return [
    pageHead('Комплаенс · расчёты по договорам',
      [h('span', null, 'Расчёты по договорам — '), h('span', { class: 'grad' }, 'под контролем.')],
      `Каждый платёж Казначейства сверяется с договором, актами и допсоглашениями. Отслеживается ${orgs.length} ${plural(orgs.length, 'организация', 'организации', 'организаций')}; проверка портала — каждые 6 часов.`),
    h('div', { class: 'bento' },
      h('div', { class: 'focus' },
        h('small', null, 'Главное сейчас'),
        h('h2', null, high.length ? `${high.length} ${plural(high.length, 'сигнал', 'сигнала', 'сигналов')} высокого риска` : medium.length ? `${medium.length} ${plural(medium.length, 'сигнал', 'сигнала', 'сигналов')} требуют проверки` : 'Существенных расхождений нет'),
        h('p', null, high.length || medium.length ? 'Начните с них: переплаты, рост цены выше лимита, оплаты без опубликованного договора.' : 'Новые платежи и договоры проверяются автоматически при каждом обновлении.'),
        h('div', { class: 'rows' }, Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => h('div', {
          class: 'row', onclick: () => { location.hash = '#/signals'; },
        }, SIGNAL_TYPES[t] || t, h('b', null, n)))),
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/signals' }, 'Разобрать сигналы', icon('arrow')))),
      h('div', { class: 'stat tint-violet' }, h('small', null, 'Договоров на сумму'), h('b', { class: 'num' }, mshort(value)), h('span', { class: 'sub' }, `${ni.format(contracts)} ${plural(contracts, 'договор', 'договора', 'договоров')}, актов на ${mshort(acts)}`)),
      h('div', { class: 'stat tint-blue' }, h('small', null, 'Оплачено по договорам'), h('b', { class: 'num' }, mshort(paid)), h('span', { class: 'sub' }, 'платежи, сверенные с договорами')),
      h('div', { class: 'stat' }, h('small', null, 'Покрытие сверки'), h('div', { class: 'ring' }, ring(share), h('div', null, h('b', { class: 'num' }, Math.round(share * 100) + '%'), h('div', { class: 'sub' }, 'оплат поставщикам привязано к договорам')))),
      h('div', { class: 'stat tint-yellow' }, h('small', null, 'Без опубликованного договора'), h('b', { class: 'num' }, mshort(unmatched)), h('span', { class: 'sub' }, `за ${week ? 'период загрузки' : 'период загрузки'}`))),
    top.length ? h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Приоритетные сигналы'), h('a', { class: 'btn btn-sm', href: '#/signals' }, 'Все сигналы', icon('arrow'))),
      h('div', { class: 'sig-list' }, top.map((s) => signalCard(s, orgs.length > 1)))) : null,
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Организации'), h('a', { class: 'btn btn-sm', href: '#/orgs' }, 'Список слежения', icon('arrow'))),
      orgGrid(orgs.slice(0, 6))),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Новое с последних проверок'), h('a', { class: 'btn btn-sm', href: '#/feed' }, 'Лента', icon('arrow'))),
      h('div', { class: 'table-card' }, itemsTable(state.feed.items.slice(0, 8), {
        showOrg: orgs.length > 1, marks: true, emptyTitle: 'Новых записей пока нет',
        emptyText: `Сюда попадают платежи и документы, появившиеся после первой загрузки. Последняя проверка: ${last ? ftime(last.finished_at) : '—'}.`,
      }))),
  ];
}

// ---- contracts ---------------------------------------------------------------------------------

function contractsTable(rows, opts) {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, 'Договоров не найдено'), 'Измените фильтр.');
  return h('div', { class: 'scroll' }, h('table', null,
    h('thead', null, h('tr', null,
      h('th', null, 'Договор'), opts.showOrg && h('th', null, 'Организация'), h('th', null, 'Контрагент'), h('th', null, 'Предмет'),
      h('th', { class: 'r' }, 'Цена'), h('th', { class: 'r' }, 'Оплачено'), h('th', null, 'Сверка'), h('th', null, 'Сигналы'))),
    h('tbody', null, rows.map((c) => h('tr', {
      class: 'click', tabindex: 0, onclick: () => openContract(c._org, c.id), onkeydown: (e) => { if (e.key === 'Enter') openContract(c._org, c.id); },
    },
      h('td', null, h('div', { class: 'cell-main' }, '№ ' + (c.number || '—')), h('div', { class: 'cell-sub num' }, fdate(c.date))),
      opts.showOrg && h('td', { class: 'w-party' }, c._org.name),
      h('td', { class: 'w-party' }, h('div', { class: 'cell-main' }, c.party_name || '—'), c.party_code ? h('div', { class: 'cell-sub num' }, c.party_code) : null),
      h('td', { class: 'w-text' }, h('div', { class: 'clamp' }, c.subject || '—')),
      h('td', { class: 'r num' }, money(c.value), c.value !== c.value0 ? h('div', { class: 'cell-sub' }, 'было ' + money(c.value0)) : null),
      h('td', { class: 'r num' + (c.flags.includes('overpaid') ? ' in' : '') }, c.paid ? money(c.paid) : h('span', { class: 'faint' }, '—')),
      h('td', null, payBar(c)),
      // Late publication marks most contracts of some disposers; it stays a filter, not row noise.
      h('td', null, flagChips(c, opts.flag === 'late' ? c.flags : c.flags.filter((x) => x !== 'late'))))))));
}

function contractsBrowser(orgs, presetFlag) {
  const box = h('div', null, h('div', { class: 'empty' }, 'Загрузка сверки…'));
  const f = { q: '', flag: presetFlag || '', sort: 'date', page: 0 };
  let all = [];
  const list = h('div');
  const showOrg = orgs.length > 1;

  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    let rows = all.filter((c) => (!f.flag || (f.flag === 'any' ? c.flags.some((x) => x !== 'late') : f.flag === 'unpaid' ? !c.paid : c.flags.includes(f.flag)))
      && (!words.length || words.every((w) => [c.number, c.party_name, c.party_code, c.subject, c._org.name].join(' ').toLowerCase().includes(w))));
    if (f.sort === 'value') rows = rows.slice().sort((a, b) => b.value - a.value);
    else if (f.sort === 'gap') rows = rows.slice().sort((a, b) => (b.paid - b.value) - (a.paid - a.value));
    else if (f.sort === 'paid') rows = rows.slice().sort((a, b) => b.paid - a.paid);
    const total = rows.reduce((s, c) => s + c.value, 0);
    pagedList(list, rows, f.page, {
      showOrg, flag: f.flag, sum: total, csv: 'contracts-reconciliation',
      csvRows: (items, name) => {
        const lines = [['Организация', 'Номер', 'Дата', 'Опубликован', 'Контрагент', 'ЄДРПОУ', 'Предмет', 'Цена начальная', 'Цена', 'Акты', 'Оплачено', 'Разница', 'Сигналы', 'Prozorro']];
        for (const c of items) lines.push([c._org.name, c.number, c.date, c.published, c.party_name, c.party_code, c.subject, dec(c.value0), dec(c.value), dec(c.acts_sum), dec(c.paid), dec(Math.round((c.value - c.paid) * 100) / 100), c.flags.map((x) => (FLAG[x] || [x])[0]).join(', '), c.prozorro]);
        csvDownload(lines, name);
      },
    }, (p) => { f.page = p; draw(); }, contractsTable);
  }

  (async () => {
    try {
      const parts = await Promise.all(orgs.map(async (o) => (await loadAnalysis(o)).contracts.map((c) => Object.assign({ _org: o }, c))));
      all = parts.flat().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const cnt = (fl) => all.filter((c) => c.flags.includes(fl)).length;
      const q = h('input', { class: 'input', type: 'search', placeholder: 'Номер, контрагент, предмет', oninput: () => { f.q = q.value; f.page = 0; draw(); } });
      fill(box, h('div', { class: 'table-card' },
        h('div', { class: 'table-tools' },
          pills([['', 'Все', all.length], ['any', 'С сигналами', all.filter((c) => c.flags.some((x) => x !== 'late')).length],
            ['overpaid', 'Переплата', cnt('overpaid')], ['price_up', 'Рост цены', cnt('price_up')], ['no_tender', 'Без Prozorro', cnt('no_tender')],
            ['split', 'Дробление', cnt('split')], ['paid_before', 'Оплата до договора', cnt('paid_before')], ['late', 'Поздняя публикация', cnt('late')]].filter((p, i) => i < 2 || p[2]),
          f.flag, (v) => { f.flag = v; f.page = 0; draw(); }),
          q,
          select([['date', 'Сначала новые'], ['value', 'По цене'], ['paid', 'По оплатам'], ['gap', 'По переплате']], f.sort, (e) => { f.sort = e.target.value; f.page = 0; draw(); })),
        list));
      draw();
    } catch (e) {
      fill(box, h('div', { class: 'card empty' }, e.message));
    }
  })();
  return box;
}

function contractsPage() {
  return [
    pageHead('Сверка договоров', [h('span', null, 'Договор, акты, оплаты — '), h('span', { class: 'grad' }, 'в одной строке')],
      'Платёж привязывается к договору, если в назначении указаны его номер и дата. Чёрная полоса — оплачено, сиреневая — подтверждено актами, относительно цены договора.'),
    contractsBrowser(state.index.orgs),
  ];
}

// ---- organisations ---------------------------------------------------------------------------------

function syncChip(o) {
  if (o.status === 'error') return h('span', { class: 'chip bad', title: o.error || '' }, h('i'), 'ошибка обновления');
  return h('span', { class: 'chip' }, h('i'), 'обновлено ' + ftime(o.last_sync_at));
}

function orgGrid(orgs) {
  if (!orgs.length) return h('div', { class: 'card empty' }, h('b', null, 'Список слежения пуст'), 'Добавьте первую организацию по инструкции ниже.');
  return h('div', { class: 'org-grid' }, orgs.map((o) => {
    const t = o.totals || {};
    const s = o.signals || {};
    return h('a', { class: 'org-card', href: '#/org/' + o.edrpou },
      h('div', { class: 'chips', style: 'margin:0' },
        s.high ? h('span', { class: 'sev high' }, s.high + ' высок.') : null,
        s.medium ? h('span', { class: 'sev medium' }, s.medium + ' сред.') : null,
        !s.high && !s.medium ? h('span', { class: 'tag ok' }, 'без существенных сигналов') : null),
      h('div', null, h('h3', null, o.name), h('div', { class: 'cell-sub' }, 'ЄДРПОУ ' + o.edrpou + (o.note ? ' · ' + o.note : ''))),
      h('div', { class: 'facts' },
        h('div', null, h('small', null, 'Договоры'), h('b', { class: 'num' }, mshort(t.value))),
        h('div', null, h('small', null, 'Оплачено'), h('b', { class: 'num' }, mshort(t.paid))),
        h('div', null, h('small', null, 'Без договора'), h('b', { class: 'num' }, mshort(t.unmatched_sum)))));
  }));
}

function howToAdd() {
  return h('div', { class: 'card pad section' },
    h('div', { class: 'eyebrow' }, 'Список слежения'),
    h('h2', { style: 'margin:6px 0 12px;font-size:21px;font-weight:800' }, 'Как добавить или убрать организацию'),
    h('ol', { class: 'steps' },
      h('li', null, 'Откройте ', ghLink('actions/workflows/sync.yml', 'страницу запуска на GitHub'), ' (нужен вход в GitHub с доступом к репозиторию).'),
      h('li', null, 'Нажмите ', h('b', null, 'Run workflow'), ', впишите код ЄДРПОУ в поле «Добавить организацию» или «Убрать организацию» и подтвердите.'),
      h('li', null, 'Через несколько минут загрузится история организации, и сверка появится на сайте.')),
    h('p', { class: 'muted small', style: 'margin-top:12px' }, 'Другой способ — отредактировать файл списка ', ghLink('edit/main/data/orgs.json', 'data/orgs.json'), '.'));
}

function orgsPage() {
  return [
    pageHead('Список слежения', [h('span', null, 'Организации '), h('span', { class: 'grad' }, 'под наблюдением')],
      'По каждой — сверка договоров с актами и платежами, сигналы риска и лента новых записей.'),
    orgGrid(state.index.orgs),
    howToAdd(),
  ];
}

const ORG_TABS = [['contracts', 'Сверка договоров'], ['signals', 'Сигналы'], ['transaction', 'Платежи'], ['act', 'Акты'], ['addendum', 'Допсоглашения'], ['liability', 'Обязательства'], ['report', 'Отчёты'], ['profile', 'Профиль']];

function orgPage(code, tab, preset) {
  const org = orgByCode(code);
  if (!org) return h('div', { class: 'card empty' }, h('b', null, 'Организации нет в списке слежения'), h('a', { href: '#/orgs' }, 'К списку'));
  tab = ORG_TABS.some((t) => t[0] === tab) ? tab : 'contracts';
  const c = org.card || {};
  const t = org.totals || {};
  const counts = {};
  for (const s of org.stats) counts[s.kind] = (counts[s.kind] || 0) + s.count;
  const sigs = state.signals.items.filter((s) => s.org_edrpou === code);
  const body = h('div');

  function show(name) {
    tab = name;
    history.replaceState(null, '', `#/org/${code}/${name}`);
    fill(tabsBox, tabs());
    if (name === 'contracts') fill(body, contractsBrowser([org], preset));
    else if (name === 'signals') fill(body, sigs.length ? h('div', { class: 'sig-list' }, sigs.map((s) => signalCard(s, false))) : h('div', { class: 'card empty' }, h('b', null, 'Сигналов нет')));
    else if (name === 'profile') fill(body, profile());
    else fill(body, recordsBrowser(org, name));
    preset = null;
  }
  const tabs = () => h('div', { class: 'tabs', role: 'tablist' }, ORG_TABS.map(([k, label]) => h('button', {
    class: tab === k ? 'on' : '', role: 'tab', 'aria-selected': tab === k, onclick: () => show(k),
  }, label, k === 'signals' ? h('span', { class: 'n' }, sigs.length) : k === 'contracts' ? h('span', { class: 'n' }, ni.format(counts.contract || 0)) : KIND[k] ? h('span', { class: 'n' }, ni.format(counts[k] || 0)) : null)));
  const tabsBox = h('div');

  function profile() {
    return h('div', { class: 'card pad' }, kv([
      ['Заметка', org.note],
      ['Форма', c.orgForm],
      ['Тип', (c.orgType || []).join(', ')],
      ['КВЕД', c.kved],
      ['Адрес', address(c.address)],
      ['Руководитель', c.director ? join([c.director.lastName, c.director.firstName, c.director.middleName], ' ') : null],
      ['Телефон', c.phone],
      ['E-mail', c.email],
      ['Главный распорядитель', c.generalDisposer && c.generalDisposer.edrpou !== org.edrpou ? party(c.generalDisposer.fullName, c.generalDisposer.edrpou) : null],
      ['На портале с', c.registrationDate ? fdate(c.registrationDate) : null],
      ['Карточка', org.card ? null : 'На spending.gov.ua нет карточки этой организации — она не распорядитель средств. Платежи и договоры с её участием всё равно отслеживаются.'],
      ['Проверить в реестрах', partyLinks(org.edrpou)],
    ]));
  }

  const view = [
    h('div', { class: 'org-head' },
      h('div', null, h('div', { class: 'eyebrow' }, h('a', { href: '#/orgs', style: 'text-decoration:none' }, '← Организации')), h('h1', { style: 'margin-top:8px;font-weight:800;line-height:1.06;letter-spacing:-.035em' }, org.name),
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, 'ЄДРПОУ ' + org.edrpou), syncChip(org),
          (org.signals || {}).high ? h('span', { class: 'sev high' }, org.signals.high + ' высокого риска') : null)),
      partyLinks(org.edrpou)),
    org.status === 'error' && org.error ? h('div', { class: 'notice section' }, 'Часть данных не обновилась: ' + org.error) : null,
    h('div', { class: 'tiles section' },
      h('div', { class: 'stat tint-violet' }, h('small', null, 'Договоры как заказчик'), h('b', { class: 'num' }, mshort(t.value)), h('span', { class: 'sub' }, `${ni.format(t.contracts || 0)} шт.`)),
      h('div', { class: 'stat' }, h('small', null, 'Подтверждено актами'), h('b', { class: 'num' }, mshort(t.acts))),
      h('div', { class: 'stat tint-blue' }, h('small', null, 'Оплачено по договорам'), h('b', { class: 'num' }, mshort(t.paid)), h('span', { class: 'sub' }, `${ni.format(t.matched || 0)} ${plural(t.matched || 0, 'платёж', 'платежа', 'платежей')} сверено`)),
      h('div', { class: 'stat tint-yellow' }, h('small', null, 'Оплаты без договора'), h('b', { class: 'num' }, mshort(t.unmatched_sum)), h('span', { class: 'sub' }, 'за период загрузки'))),
    tabsBox,
    body,
  ];
  show(tab);
  return view;
}

function recordsBrowser(org, kind) {
  const f = { role: '', q: '', from: '', to: '', min: '', page: 0 };
  const list = h('div', null, h('div', { class: 'empty' }, 'Загрузка…'));
  async function draw() {
    let all;
    try {
      all = await loadKind(org, kind);
    } catch (e) {
      fill(list, h('div', { class: 'empty' }, e.message));
      return;
    }
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const min = f.min === '' ? null : Number(f.min);
    const items = all.filter((i) => {
      if (f.role && i.role !== f.role) return false;
      if (f.from && (i.date || '') < f.from) return false;
      if (f.to && (i.date || '9') > f.to) return false;
      if (min != null && !((i.amount || 0) >= min)) return false;
      if (words.length) {
        const text = [i.title, i.cp_name, i.cp_edrpou, i.ext_id].filter(Boolean).join(' ').toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    }).map((i) => Object.assign({ org_name: org.name, org_edrpou: org.edrpou }, i));
    pagedList(list, items, f.page, { marks: true, csv: `spending-${org.edrpou}-${kind}`, noSum: kind === 'report', emptyTitle: 'Записей нет', emptyText: 'По этим условиям ничего не найдено.' }, (p) => { f.page = p; draw(); });
  }
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Контрагент, назначение, номер' });
  const from = h('input', { class: 'input', type: 'date' });
  const to = h('input', { class: 'input', type: 'date' });
  const min = h('input', { class: 'input', type: 'number', min: 0, step: 'any', placeholder: '0', style: 'width:120px' });
  const role = ROLES_FOR[kind] ? select([['', 'Любая роль']].concat(ROLES_FOR[kind]), '', () => {}) : null;
  draw();
  return h('div', { class: 'table-card' },
    h('form', {
      class: 'table-tools',
      onsubmit: (e) => { e.preventDefault(); Object.assign(f, { q: q.value.trim(), from: from.value, to: to.value, min: min.value, role: role ? role.value : '', page: 0 }); draw(); },
    },
      h('label', { class: 'field', style: 'flex:1;min-width:200px' }, h('span', null, 'Поиск'), q),
      role && h('label', { class: 'field' }, h('span', null, 'Роль'), role),
      h('label', { class: 'field' }, h('span', null, 'С'), from), h('label', { class: 'field' }, h('span', null, 'По'), to),
      kind !== 'report' && h('label', { class: 'field' }, h('span', null, 'Сумма от'), min),
      h('button', { class: 'btn btn-dark', type: 'submit' }, 'Показать')),
    list);
}

// ---- feed ---------------------------------------------------------------------------------------

function feedPage() {
  const f = { kind: '', org: '', page: 0 };
  const all = state.feed.items;
  const list = h('div');
  function draw() {
    const items = all.filter((i) => (!f.kind || i.kind === f.kind) && (!f.org || i.org_edrpou === f.org));
    pagedList(list, items, f.page, {
      showOrg: state.index.orgs.length > 1, marks: true, noSum: true,
      emptyTitle: 'Новых записей пока нет',
      emptyText: 'Здесь появятся платежи, договоры, акты и отчёты, опубликованные после первой загрузки организации.',
    }, (p) => { f.page = p; draw(); });
  }
  draw();
  const readBtn = h('button', { class: 'btn', onclick: () => { if (all.length) setSeen(all[0].first_seen_at); render(); } }, icon('check'), 'Отметить прочитанным');
  return [
    pageHead('Лента', [h('span', null, 'Новое '), h('span', { class: 'grad' }, 'на портале')], 'Записи, найденные при плановых проверках. Новые отмечены жёлтой полосой; отметка хранится в этом браузере.', readBtn),
    h('div', { class: 'table-card' },
      h('div', { class: 'table-tools' },
        pills([['', 'Все']].concat(Object.entries(KIND).map(([k, v]) => [k, v.many])), '', (v) => { f.kind = v; f.page = 0; draw(); }),
        state.index.orgs.length > 1 ? select([['', 'Все организации']].concat(state.index.orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; f.page = 0; draw(); }) : null),
      list),
  ];
}

// ---- live search ---------------------------------------------------------------------------------

function searchPage() {
  const s = state.search || (state.search = { edrpou: '', kind: 'transaction', role: 'both', from: addDays(today(), -30), to: today(), res: null, page: 0 });
  const out = h('div');
  const code = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '8 цифр', maxlength: 12, required: true, pattern: '\\s*\\d{8,10}\\s*', value: s.edrpou });
  const from = h('input', { class: 'input', type: 'date', required: true, value: s.from });
  const to = h('input', { class: 'input', type: 'date', required: true, value: s.to });
  const roleBox = h('span');
  let roleSel = null;
  const drawRole = () => {
    const opts = ROLES_FOR[kindSel.value];
    roleSel = opts ? select([['both', 'Любая роль']].concat(opts), opts.some((o) => o[0] === s.role) ? s.role : 'both', () => {}) : null;
    fill(roleBox, roleSel ? h('label', { class: 'field' }, h('span', null, 'Роль организации'), roleSel) : '');
  };
  const kindSel = select(Object.entries(KIND).map(([k, v]) => [k, v.many]), s.kind, drawRole);
  drawRole();
  const go = h('button', { class: 'btn btn-dark', type: 'submit' }, icon('search'), 'Найти');

  async function run() {
    const { edrpou, kind, from: a, to: b } = s;
    if (a > b) throw new Error('Дата «с» позже даты «по»');
    const limit = kind === 'transaction' ? 366 : 731;
    if (kind !== 'report' && daysBetween(a, b) > limit) throw new Error(kind === 'transaction' ? 'Для платежей период поиска — не больше года' : 'Период поиска — не больше двух лет');
    const roles = !ROLES_FOR[kind] ? [''] : s.role === 'both' ? ROLES_FOR[kind].map((r) => r[0]) : [s.role];
    let raws = [];
    let truncated = false;
    for (const role of roles) {
      if (kind === 'transaction') raws = raws.concat(await portalTransactions(edrpou, role, a, b));
      else if (DOC_PATHS[kind]) {
        const r = await portalDocuments(kind, edrpou, role, a, b);
        raws = raws.concat(r.docs);
        truncated = truncated || r.truncated;
      } else if (kind === 'liability') raws = await portalLiabilities(edrpou, a, b);
      else {
        // The portal rejects this request for a code that is not a registered
        // disposer; from the browser that is indistinguishable from "no reports".
        raws = await portalReports(edrpou).catch(() => []);
      }
    }
    const names = kind in DOC_PATHS ? await getJSON('data/names.json', ver()).catch(() => ({})) : {};
    const dicts = kind === 'report' ? await loadReportDicts() : null;
    const seen = new Set();
    let items = [];
    for (const raw of raws) {
      const n = normalize(kind, raw, edrpou, names, dicts);
      if (seen.has(n.ext_id)) continue;
      seen.add(n.ext_id);
      items.push(Object.assign(n, { kind, data: raw }));
    }
    if (kind === 'report') items = items.filter((i) => (i.date || '') >= a && (i.date || '9') <= b);
    items.sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.ext_id.localeCompare(x.ext_id));
    return { items, truncated };
  }

  function draw() {
    const res = s.res;
    if (!res) {
      fill(out, h('div', { class: 'empty' }, h('b', null, 'Проверка любой организации'), 'Платежи, договоры, акты, обязательства и отчёты прямо с портала — даже если организации нет в списке слежения.'));
      return;
    }
    const tracked = orgByCode(s.edrpou);
    const box = h('div');
    pagedList(box, res.items, s.page, {
      csv: `spending-${s.edrpou}-${s.kind}`, noSum: s.kind === 'report', emptyText: 'По этим условиям на портале ничего нет.',
      extra: tracked ? h('a', { class: 'btn btn-sm', href: '#/org/' + s.edrpou }, 'Открыть сверку') : h('a', { class: 'btn btn-sm', href: '#/orgs' }, 'Как добавить в слежение'),
    }, (p) => { s.page = p; draw(); });
    fill(out, res.truncated ? h('div', { class: 'notice', style: 'margin:14px 16px 0' }, 'За один из дней записей больше, чем отдаёт портал, — список может быть неполным.') : null, box);
  }

  const form = h('form', {
    class: 'table-tools',
    onsubmit: async (e) => {
      e.preventDefault();
      Object.assign(s, { edrpou: code.value.trim(), kind: kindSel.value, role: roleSel ? roleSel.value : 'both', from: from.value, to: to.value, page: 0 });
      fill(out, h('div', { class: 'empty' }, 'Запрашиваем портал… Поиск по исполнителю может занять до минуты.'));
      go.disabled = true;
      try {
        s.res = await run();
        draw();
      } catch (err) {
        s.res = null;
        fill(out, h('div', { class: 'empty' }, err.message));
      } finally {
        go.disabled = false;
      }
    },
  },
    h('label', { class: 'field' }, h('span', null, 'Код ЄДРПОУ'), code),
    h('label', { class: 'field' }, h('span', null, 'Что ищем'), kindSel),
    roleBox,
    h('label', { class: 'field' }, h('span', null, 'С'), from), h('label', { class: 'field' }, h('span', null, 'По'), to), go);
  draw();
  return [
    pageHead('Поиск по порталу', [h('span', null, 'Проверка '), h('span', { class: 'grad' }, 'любого контрагента')], 'Запрос идёт из вашего браузера напрямую на spending.gov.ua.'),
    h('div', { class: 'table-card' }, form, out),
  ];
}

// ---- methodology ------------------------------------------------------------------------------------

const REGISTRIES = [
  ['spending.gov.ua (Є-Data)', 'Договоры, акты, допсоглашения, штрафы распорядителей и платежи Казначейства по ним.', 'подключён', 'https://spending.gov.ua'],
  ['Prozorro', 'Тендер, договор и его изменения, а по завершении — отчёт о выполнении с фактически оплаченной суммой. Сверка «цена → оплачено» по закупкам.', 'открытый API', 'https://prozorro.gov.ua'],
  ['ЄДР (Минюст)', 'Учредители, конечные бенефициары, руководитель, статус (прекращение, банкротство) контрагента. Открытые данные, обновление еженедельно.', 'открытые данные', 'https://usr.minjust.gov.ua'],
  ['Реестр санкций СНБО', 'Есть ли контрагент или его владельцы под санкциями.', 'открытый API', 'https://drs.nsdc.gov.ua'],
  ['НАПК: декларации и реестр коррупционеров', 'Связи распорядителя и поставщика, конфликт интересов, лица, привлечённые к ответственности.', 'открытый API', 'https://public.nazk.gov.ua'],
  ['Реестр судебных решений', 'Споры по договорам, взыскание долгов, уголовные производства с участием контрагента.', 'поиск на сайте', 'https://reyestr.court.gov.ua'],
  ['Единый реестр должников', 'Открытые исполнительные производства против контрагента.', 'поиск на сайте', 'https://erb.minjust.gov.ua'],
  ['Open Budget', 'Исполнение бюджета по программам (КПКВК): сопоставление оплат с плановыми назначениями.', 'открытый API', 'https://openbudget.gov.ua'],
];

function methodPage() {
  const rows = [
    ['overpaid', 'Высокий', 'Платежи по договору больше его цены с учётом допсоглашений.'],
    ['price_up', 'Высокий / средний', 'Допсоглашение увеличило цену; выше 10% — высокий риск.'],
    ['no_contract', 'Средний / низкий', 'Оплаты поставщикам (КЕКВ 2210–2282, 3xxx) без опубликованного договора; от 50 000 ₴ — средний.'],
    ['no_tender', 'Средний', 'Договор от 200 000 ₴ (работы — от 1 500 000 ₴) без процедуры в Prozorro.'],
    ['split', 'Средний', 'Два и более договора с одним поставщиком по одной группе CPV за 30 дней, каждый ниже порога, вместе — выше.'],
    ['paid_before', 'Средний', 'Первый платёж раньше даты договора.'],
    ['acts_over', 'Средний', 'Сумма актов больше цены договора.'],
    ['paid_over_acts', 'Низкий', 'Оплачено больше, чем подтверждено актами.'],
    ['late', 'Низкий', 'Договор опубликован позже 5 рабочих дней после заключения.'],
    ['concentration', 'Низкий', 'Один контрагент получает 30% и больше суммы договоров.'],
  ];
  const runs = state.index.runs || [];
  const trigger = { schedule: 'по расписанию', workflow_dispatch: 'вручную', push: 'после изменения файлов', local: 'с компьютера' };
  return [
    pageHead('Методика', [h('span', null, 'Как считаются '), h('span', { class: 'grad' }, 'сигналы')],
      'Данные — открытые реестры, без входа и личных данных. Каждые 6 часов GitHub Actions забирает новые записи с портала и заново сверяет договоры.'),
    h('div', { class: 'card pad' },
      h('h2', { style: 'font-size:19px;font-weight:800;margin-bottom:6px' }, 'Как платёж привязывается к договору'),
      h('p', { class: 'muted' }, 'Из назначения платежа берутся номер и дата договора («дог. №127 від 16.06.2026»). Платёж засчитывается договору, если совпадают номер и дата, а при нескольких совпадениях — ещё и получатель. Платежи без такой ссылки или со ссылкой на неопубликованный договор попадают в «Оплаты без договора». Цена договора — последняя цена из допсоглашений.')),
    h('div', { class: 'table-card section' }, h('div', { class: 'scroll' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Сигнал'), h('th', null, 'Уровень'), h('th', null, 'Правило'))),
      h('tbody', null, rows.map(([type, sev, rule]) => h('tr', null, h('td', { class: 'cell-main' }, SIGNAL_TYPES[type]), h('td', { class: 'nowrap' }, sev), h('td', null, rule))))))),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Реестры для проверки расчётов')),
      h('div', { class: 'reg' }, REGISTRIES.map(([name, what, status, url]) => h('a', { class: 'card pad', href: url, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none' },
        h('b', null, name), h('span', { class: 'muted small' }, what), h('span', { class: 'tag' + (status === 'подключён' ? ' ok' : '') }, status))))),
    howToAdd(),
    h('div', { class: 'table-card section' },
      h('div', { class: 'table-tools' }, h('b', null, 'Последние проверки'), h('span', { class: 'faint small' }, ghLink('actions', 'журнал на GitHub'))),
      runs.length ? h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Начало'), h('th', null, 'Окончание'), h('th', null, 'Запуск'), h('th', null, 'Результат'), h('th', { class: 'r' }, 'Новых записей'))),
        h('tbody', null, runs.map((r) => h('tr', null,
          h('td', { class: 'num' }, ftime(r.started_at)), h('td', { class: 'num' }, ftime(r.finished_at)),
          h('td', null, trigger[r.trigger] || r.trigger),
          h('td', null, r.orgs_failed ? h('span', { class: 'sev high' }, `ошибки: ${r.orgs_failed}`) : h('span', { class: 'tag ok' }, 'успешно')),
          h('td', { class: 'r num' }, r.new_items)))))) : h('div', { class: 'empty' }, 'Проверок ещё не было.')),
  ];
}

// ---- router ------------------------------------------------------------------------------------------

function render() {
  closeSheet();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = parts[0] || '';
  let page, key = route;
  if (route === 'signals') page = signalsPage(parts[1]);
  else if (route === 'contracts') page = contractsPage();
  else if (route === 'orgs') page = orgsPage();
  else if (route === 'org' && /^\d+$/.test(parts[1] || '')) { page = orgPage(parts[1], parts[2], parts[3]); key = 'orgs'; }
  else if (route === 'feed') page = feedPage();
  else if (route === 'search') page = searchPage();
  else if (route === 'method') page = methodPage();
  else { page = overviewPage(); key = 'home'; }
  fill(app, shell(key, page));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

async function boot() {
  try {
    await loadAll();
    render();
  } catch (e) {
    fill(app, h('div', { class: 'boot' }, h('b', null, 'Данные пока недоступны. '), e.message, '. Они появятся после первого обновления на GitHub.'));
  }
}
boot();

// Pick up a fresh data set without a manual reload.
setInterval(async () => {
  const before = ver();
  try {
    const idx = await getJSON('data/index.json');
    if (idx.generated_at !== before) {
      await loadAll();
      if (!document.querySelector('.sheet')) render();
    }
  } catch (e) { /* offline or mid-deploy: keep what is shown */ }
}, 10 * 60 * 1000);
