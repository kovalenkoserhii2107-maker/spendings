'use strict';

// A static site: the data files under data/ are refreshed by a scheduled
// GitHub Actions run (sync/sync.py); live search talks to the portal directly.
// Everything shown comes from an external API, so the UI is built with DOM
// nodes and text only — never innerHTML.

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  return el;
}

// replaceChildren() would print null/false as text; this skips them.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

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
const PAGE = 50;

const state = { index: null, feed: null, search: null };
const app = document.getElementById('app');

// ---- formatting ----------------------------------------------------------------

const nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ni = new Intl.NumberFormat('ru-RU');
function money(amount, currency) {
  if (amount == null) return '—';
  return nf.format(amount) + (currency && currency !== 'UAH' ? ' ' + currency : ' ₴');
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

// ---- site data --------------------------------------------------------------------

async function getJSON(path, version) {
  const res = await fetch(`${path}?v=${encodeURIComponent(version || Date.now())}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'Данные ещё не подготовлены' : `Ошибка загрузки (${res.status})`);
  return res.json();
}

async function loadIndex() {
  state.index = await getJSON('data/index.json');
  return state.index;
}

async function loadFeed() {
  state.feed = await getJSON('data/feed.json', state.index && state.index.generated_at);
  return state.feed;
}

const kindCache = new Map();
function loadKind(org, kind) {
  // One organisation's records of one kind: a file per year, cached per data version.
  const key = `${org.edrpou}:${kind}:${state.index.generated_at}`;
  if (!kindCache.has(key)) {
    const years = (org.files || {})[kind] || [];
    kindCache.set(key, Promise.all(years.map((y) => getJSON(`data/org/${org.edrpou}/${kind}-${y}.json`, state.index.generated_at)))
      .then((parts) => parts.flat().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.ext_id).localeCompare(String(a.ext_id)))));
  }
  return kindCache.get(key);
}

function repoName() {
  if (state.index && state.index.repo) return state.index.repo;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const first = location.pathname.split('/')[1];
  return m && first ? `${m[1]}/${first}` : '';
}
const ghLink = (path, label) => (repoName()
  ? h('a', { href: `https://github.com/${repoName()}/${path}`, target: '_blank', rel: 'noopener noreferrer' }, label)
  : h('b', null, label));

// "Read" marks live in this browser only: the site has no accounts.
function getSeen() {
  try { return localStorage.getItem('seen') || ''; } catch (e) { return ''; }
}
function setSeen(value) {
  try { localStorage.setItem('seen', value); } catch (e) { /* private mode: marks just do not persist */ }
}
const isNew = (item) => item.is_event && item.first_seen_at > getSeen();

// ---- the portal, straight from the browser -----------------------------------------------

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

const join = (parts, sep = ' · ') => parts.filter((p) => p != null && String(p).trim() !== '').map((p) => String(p).trim()).join(sep);

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

// ---- shell -----------------------------------------------------------------------

function unreadCount() {
  return state.feed ? state.feed.items.filter(isNew).length : 0;
}

function shell(route, page) {
  const link = (href, label, key, badge) => h('a', { href, class: route === key ? 'on' : '' }, label, badge);
  const n = unreadCount();
  const last = state.index && state.index.runs && state.index.runs[0];
  return h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), h('span', null, 'Монитор расходов')),
      h('nav', { class: 'nav' },
        link('#/feed', 'Лента', 'feed', h('span', { class: 'badge', id: 'unread', hidden: !n }, n)),
        link('#/orgs', 'Организации', 'orgs'),
        link('#/search', 'Поиск', 'search'),
        link('#/about', 'Как это работает', 'about')),
      h('div', { class: 'spacer' }),
      h('div', { class: 'me' },
        h('div', { class: 'muted small' }, 'Данные обновлены'),
        h('div', { class: 'name' }, last ? ftime(last.finished_at) : '—'))),
    h('main', { class: 'main' }, page));
}

function setUnreadBadge() {
  const b = document.getElementById('unread');
  if (!b) return;
  const n = unreadCount();
  b.textContent = n;
  b.hidden = !n;
}

// ---- shared pieces ------------------------------------------------------------------

function itemsTable(items, opts) {
  if (!items.length) return h('div', { class: 'empty' }, h('b', null, opts.emptyTitle || 'Ничего не найдено'), opts.emptyText || 'Попробуйте изменить условия.');
  const rows = items.map((it) => {
    const incoming = it.kind === 'transaction' && it.role === 'recipient';
    return h('tr', { class: 'click' + (opts.marks && isNew(it) ? ' new' : ''), tabindex: 0, onclick: () => openDetail(it), onkeydown: (e) => { if (e.key === 'Enter') openDetail(it); } },
      h('td', { class: 'num' }, fdate(it.date)),
      h('td', null, h('span', { class: 'tag ' + it.kind }, KIND[it.kind].one), ROLES_FOR[it.kind] && ROLE[it.role] ? h('div', { class: 'muted small' }, ROLE[it.role]) : null),
      opts.showOrg && h('td', { class: 'mid' }, h('a', { href: '#/org/' + it.org_edrpou, onclick: (e) => e.stopPropagation() }, it.org_name)),
      h('td', { class: 'mid' }, it.cp_name || (it.cp_edrpou ? 'ЄДРПОУ ' + it.cp_edrpou : '—'), it.cp_name && it.cp_edrpou ? h('div', { class: 'muted small num' }, it.cp_edrpou) : null),
      h('td', { class: 'wide' }, h('div', { class: 't' }, it.title || '—')),
      h('td', { class: 'r num' + (incoming ? ' in' : '') }, it.amount == null ? '' : (incoming ? '+' : '') + money(it.amount, it.currency)));
  });
  return h('div', { class: 'tablewrap' }, h('table', null,
    h('thead', null, h('tr', null,
      h('th', null, 'Дата'), h('th', null, 'Тип'), opts.showOrg && h('th', null, 'Организация'),
      h('th', null, 'Контрагент'), h('th', null, 'Описание'), h('th', { class: 'r' }, 'Сумма'))),
    h('tbody', null, rows)));
}

// A filtered list shown a page at a time, with its total and UAH sum.
function pagedList(box, items, page, opts, onPage) {
  const total = items.length;
  const sum = items.reduce((acc, i) => acc + (i.currency === 'UAH' && i.amount != null ? i.amount : 0), 0);
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  fill(box,
    itemsTable(items.slice(page * PAGE, (page + 1) * PAGE), opts),
    total ? h('div', { class: 'foot' },
      h('div', null, `${ni.format(from)}–${ni.format(to)} из ${ni.format(total)}`, opts.noSum ? '' : ` · на сумму ${money(sum)}`),
      h('div', { class: 'row' },
        opts.csv && h('button', { onclick: () => csvDownload(items, opts.csv) }, 'Скачать CSV'),
        opts.extra,
        h('button', { disabled: page === 0, onclick: () => onPage(page - 1) }, '← Назад'),
        h('button', { disabled: to >= total, onclick: () => onPage(page + 1) }, 'Вперёд →'))) : opts.extra && h('div', { class: 'foot' }, h('span'), opts.extra));
}

function csvDownload(items, name) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Дата', 'Тип', 'Роль', 'Контрагент', 'ЄДРПОУ контрагента', 'Сумма', 'Валюта', 'Описание', 'ID']];
  for (const i of items) lines.push([i.date, KIND[i.kind].one, ROLE[i.role] || '', i.cp_name, i.cp_edrpou, i.amount == null ? '' : String(i.amount).replace('.', ','), i.currency, i.title, i.ext_id]);
  const blob = new Blob(['﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function select(options, value, onchange) {
  return h('select', { onchange, value }, options.map(([v, label]) => h('option', { value: v }, label)));
}

// ---- detail drawer ---------------------------------------------------------------------

function closeDetail() {
  document.querySelectorAll('.scrim, .drawer').forEach((n) => n.remove());
  document.removeEventListener('keydown', escClose);
}
function escClose(e) {
  if (e.key === 'Escape') closeDetail();
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
  return /^UA-/.test(id)
    ? h('a', { href: 'https://prozorro.gov.ua/tender/' + encodeURIComponent(id), target: '_blank', rel: 'noopener noreferrer' }, id)
    : id;
}

function address(a) {
  if (!a) return null;
  return [a.regionName, a.district, a.city, a.street, a.house, a.office && 'оф. ' + a.office].filter(Boolean).join(', ');
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
      ['Договор', d.contractId],
      ['Закупка Prozorro', prozorro(d.contractNumber)],
    ]));
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
      ['Организационно-правовая форма', d.orgPravForm],
    ]));
  } else {
    const people = (d.contractors || []).map((c) => h('div', null, party(c.name, c.identifier), address(c.address) ? h('div', { class: 'muted small' }, address(c.address)) : null));
    out.push(kv([
      ['Номер', d.documentNumber],
      ['Дата документа', fdate(d.documentDate)],
      ['Опубликован', fdate(d.signDate)],
      ['Заказчик (ЄДРПОУ)', d.edrpou],
      ['Контрагенты', people.length ? people : null],
      ['Предмет', d.subject],
      ['Срок действия', d.noTerm ? 'бессрочный' : d.fromDate || d.toDate ? `${fdate(d.fromDate)} — ${fdate(d.toDate)}` : null],
      ['НДС в сумме', d.pdvAmount != null ? money(d.pdvAmount, d.currency) : null],
      ['Эквивалент в гривне', d.currencyAmountUAH != null ? money(d.currencyAmountUAH) : null],
      ['Тендер', kind === 'contract' ? (d.tender ? 'да' : 'нет') : null],
      ['Основание без тендера', d.tender ? null : d.reason],
      ['Тендер Prozorro', prozorro(d.idTenderProzorro)],
      ['Сумма изменения', d.amountIncrease != null ? money(d.amountIncrease, d.currency) : null],
      ['Основание допсоглашения', (d.reasonTypes || []).map((r) => r.name || r.reasonName || r.id).filter((x) => x != null).join(', ') || null],
      ['ID родительского договора', d.parentId],
    ]));
    if ((d.specifications || []).length) {
      out.push(h('section', null, h('h3', null, 'Спецификация'), h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Наименование'), h('th', null, 'CPV'), h('th', { class: 'r' }, 'Кол-во'), h('th', { class: 'r' }, 'Цена'))),
        h('tbody', null, d.specifications.map((s) => h('tr', null,
          h('td', null, s.specificationName || '—'), h('td', { class: 'num' }, s.cpvCode || '—'),
          h('td', { class: 'r num' }, s.itemCount != null ? `${ni.format(s.itemCount)} ${s.itemDimension || ''}` : '—'),
          h('td', { class: 'r num' }, s.itemCost != null ? money(s.itemCost, d.currency) : '—'))))))));
    }
  }
  out.push(h('section', null, h('details', null, h('summary', { class: 'muted' }, 'Все поля записи'), h('pre', null, JSON.stringify(d, null, 2)))));
  return out;
}

function openDetail(item) {
  closeDetail();
  const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Подробности' },
    h('button', { class: 'close', onclick: closeDetail, 'aria-label': 'Закрыть' }, '✕'),
    h('span', { class: 'tag ' + item.kind }, KIND[item.kind].one),
    ROLES_FOR[item.kind] && ROLE[item.role] ? h('span', { class: 'muted small' }, '  ' + ROLE[item.role]) : null,
    h('h2', null, item.cp_name || item.org_name || KIND[item.kind].one),
    item.amount != null ? h('div', { class: 'amount num' }, money(item.amount, item.currency)) : h('div', { style: 'height:12px' }),
    detailBody(item.kind, item.data || {}));
  document.body.append(h('div', { class: 'scrim', onclick: closeDetail }), drawer);
  document.addEventListener('keydown', escClose);
}

// ---- feed -------------------------------------------------------------------------------

function syncBar() {
  const idx = state.index;
  const last = idx.runs && idx.runs[0];
  return h('div', { class: 'card syncbar' },
    h('span', null, h('span', { class: 'dot' }),
      last ? `Последняя проверка: ${ftime(last.finished_at)}` + (last.orgs_failed ? ` (с ошибками: ${last.orgs_failed})` : '') : 'Проверок ещё не было'),
    h('span', { class: 'muted' }, 'Проверка идёт автоматически каждые 6 часов'),
    idx.treasury_last_load ? h('span', { class: 'muted' }, `Данные Казначейства на портале: по ${fdate(idx.treasury_last_load)}`) : null,
    h('span', { class: 'grow' }),
    ghLink('actions/workflows/sync.yml', 'Проверить сейчас на GitHub'));
}

function feedPage() {
  const f = { kind: '', org: '', page: 0 };
  const list = h('div');
  const all = state.feed.items;
  const orgSel = select([['', 'Все организации']].concat(state.index.orgs.map((o) => [o.edrpou, o.name])), '', () => { f.org = orgSel.value; f.page = 0; draw(); });
  const kindSel = select([['', 'Все типы']].concat(Object.entries(KIND).map(([k, v]) => [k, v.many])), '', () => { f.kind = kindSel.value; f.page = 0; draw(); });
  const readBtn = h('button', { onclick: () => { if (all.length) setSeen(all[0].first_seen_at); setUnreadBadge(); draw(); } }, 'Отметить всё прочитанным');

  function draw() {
    if (!state.index.orgs.length) {
      fill(list, h('div', { class: 'empty' }, h('b', null, 'Список слежения пуст'), 'Добавьте организации — как это сделать, описано в разделе ', h('a', { href: '#/orgs' }, '«Организации»'), '.'));
      return;
    }
    const items = all.filter((i) => (!f.kind || i.kind === f.kind) && (!f.org || i.org_edrpou === f.org));
    pagedList(list, items, f.page, {
      showOrg: true, marks: true, noSum: true,
      emptyTitle: 'Новых событий пока нет',
      emptyText: 'Здесь появятся новые платежи, договоры, акты и отчёты организаций из списка слежения — те, что найдены после первой загрузки истории.',
    }, (p) => { f.page = p; draw(); });
  }
  draw();
  return h('div', { class: 'stack' },
    h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Лента'), h('div', { class: 'sub' }, 'Новые записи по организациям из списка слежения')),
      readBtn),
    syncBar(),
    h('div', { class: 'card' }, h('div', { class: 'filters' }, kindSel, orgSel), list));
}

// ---- organisations -----------------------------------------------------------------------

function syncTag(o) {
  if (o.status === 'error') return h('span', { class: 'tag err', title: o.error || '' }, 'ошибка');
  if (o.status === 'ok') return h('span', { class: 'tag ok' }, 'актуально');
  return h('span', { class: 'tag' }, 'ожидает');
}

function howToAdd() {
  return h('div', { class: 'card pad' },
    h('h2', null, 'Как добавить или убрать организацию'),
    h('ol', { class: 'steps' },
      h('li', null, 'Откройте ', ghLink('actions/workflows/sync.yml', 'страницу запуска на GitHub'), ' (нужен вход в GitHub с доступом к репозиторию).'),
      h('li', null, 'Нажмите ', h('b', null, 'Run workflow'), ', впишите код ЄДРПОУ в поле «Добавить организацию» или «Убрать организацию» и подтвердите.'),
      h('li', null, 'Через несколько минут сайт обновится: история организации загрузится, новые записи начнут попадать в ленту.')),
    h('div', { class: 'muted small' }, 'Другой способ — отредактировать файл списка: ', ghLink('edit/main/data/orgs.json', 'data/orgs.json'), '.'));
}

function orgsPage() {
  const orgs = state.index.orgs;
  const n = (o, kind) => {
    const c = o.stats.filter((s) => s.kind === kind).reduce((a, s) => a + s.count, 0);
    return c ? ni.format(c) : '—';
  };
  const newBy = {};
  for (const i of state.feed.items) if (isNew(i)) newBy[i.org_edrpou] = (newBy[i.org_edrpou] || 0) + 1;
  const list = orgs.length
    ? h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Организация'), h('th', { class: 'r' }, 'Платежи'), h('th', { class: 'r' }, 'Договоры'),
        h('th', { class: 'r' }, 'Акты'), h('th', { class: 'r' }, 'Обязательства'), h('th', { class: 'r' }, 'Отчёты'), h('th', null, 'Состояние'), h('th', null, 'Проверено'))),
      h('tbody', null, orgs.map((o) => h('tr', { class: 'click', onclick: () => { location.hash = '#/org/' + o.edrpou; } },
        h('td', { class: 'wide' }, h('a', { href: '#/org/' + o.edrpou }, o.name), ' ', newBy[o.edrpou] ? h('span', { class: 'badge' }, '+' + newBy[o.edrpou]) : null,
          h('div', { class: 'muted small' }, 'ЄДРПОУ ' + o.edrpou + (o.note ? ' · ' + o.note : ''))),
        h('td', { class: 'r num' }, n(o, 'transaction')), h('td', { class: 'r num' }, n(o, 'contract')), h('td', { class: 'r num' }, n(o, 'act')),
        h('td', { class: 'r num' }, n(o, 'liability')), h('td', { class: 'r num' }, n(o, 'report')),
        h('td', null, syncTag(o)), h('td', { class: 'muted small num' }, ftime(o.last_sync_at)))))))
    : h('div', { class: 'empty' }, h('b', null, 'Список слежения пуст'), 'Добавьте первую организацию по инструкции ниже.');
  return h('div', { class: 'stack' },
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'Организации'), h('div', { class: 'sub' }, 'Список слежения'))),
    h('div', { class: 'card' }, list),
    howToAdd());
}

function orgPage(code, startKind) {
  const org = state.index.orgs.find((o) => o.edrpou === code);
  if (!org) return h('div', { class: 'empty' }, h('b', null, 'Организации нет в списке слежения'), h('a', { href: '#/orgs' }, 'К списку'));
  const f = { kind: KIND[startKind] ? startKind : 'transaction', role: '', q: '', from: '', to: '', min: '', page: 0 };
  const list = h('div');
  const tabsBox = h('div');
  const filtersBox = h('div');
  const c = org.card || {};
  const counts = {};
  for (const s of org.stats) counts[s.kind] = (counts[s.kind] || 0) + s.count;

  async function draw() {
    fill(list, h('div', { class: 'empty' }, 'Загрузка…'));
    let all;
    try {
      all = await loadKind(org, f.kind);
    } catch (e) {
      fill(list, h('div', { class: 'empty error' }, e.message));
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
    });
    pagedList(list, items.map((i) => Object.assign({ org_name: org.name }, i)), f.page, {
      marks: true, csv: `spending-${org.edrpou}-${f.kind}`, noSum: f.kind === 'report',
      emptyTitle: 'Записей нет', emptyText: 'По этим условиям ничего не найдено.',
    }, (p) => { f.page = p; draw(); });
  }

  function drawControls() {
    fill(tabsBox, h('div', { class: 'tabs', role: 'tablist' }, Object.entries(KIND).map(([k, v]) => h('button', {
      class: f.kind === k ? 'on' : '', role: 'tab', 'aria-selected': f.kind === k,
      onclick: () => { Object.assign(f, { kind: k, role: '', page: 0 }); history.replaceState(null, '', `#/org/${code}/${k}`); drawControls(); draw(); },
    }, v.many, h('span', { class: 'n' }, counts[k] ? ni.format(counts[k]) : '0')))));
    const q = h('input', { type: 'search', placeholder: 'контрагент, назначение, номер', value: f.q });
    const from = h('input', { type: 'date', value: f.from });
    const to = h('input', { type: 'date', value: f.to });
    const min = h('input', { type: 'number', min: 0, step: 'any', placeholder: '0', value: f.min, style: 'width:120px' });
    const role = ROLES_FOR[f.kind] ? select([['', 'Любая роль']].concat(ROLES_FOR[f.kind]), f.role, () => {}) : null;
    fill(filtersBox, h('form', {
      class: 'filters',
      onsubmit: (e) => { e.preventDefault(); Object.assign(f, { q: q.value.trim(), from: from.value, to: to.value, min: min.value, role: role ? role.value : '', page: 0 }); draw(); },
    },
      h('label', { class: 'f grow' }, 'Поиск', q),
      role && h('label', { class: 'f' }, 'Роль', role),
      h('label', { class: 'f' }, 'С', from), h('label', { class: 'f' }, 'По', to),
      f.kind !== 'report' && h('label', { class: 'f' }, 'Сумма от', min),
      h('button', { class: 'primary', type: 'submit' }, 'Показать')));
  }

  const tile = (kind, role, label) => {
    const s = org.stats.find((x) => x.kind === kind && x.role === role);
    return h('div', { class: 'card tile' }, h('div', { class: 'v num' }, money(s && s.sum ? s.sum : 0)),
      h('div', { class: 'l' }, label + (s && s.first ? ` с ${fdate(s.first)}` : '')));
  };
  drawControls();
  draw();
  return h('div', { class: 'stack' },
    h('div', { class: 'head' },
      h('div', null, h('div', { class: 'muted small' }, h('a', { href: '#/orgs' }, '← Организации')), h('h1', null, org.name),
        h('div', { class: 'sub' }, 'ЄДРПОУ ' + org.edrpou, ' · ', syncTag(org), org.last_sync_at ? ` · проверено ${ftime(org.last_sync_at)}` : ''))),
    org.status === 'error' && org.error ? h('div', { class: 'notice' }, 'Часть данных не обновилась: ' + org.error) : null,
    h('div', { class: 'tiles' },
      tile('transaction', 'payer', 'Исходящие платежи'),
      tile('transaction', 'recipient', 'Входящие платежи'),
      tile('contract', 'disposer', 'Договоры как заказчик'),
      tile('contract', 'contractor', 'Договоры как исполнитель')),
    h('div', { class: 'card pad' }, kv([
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
    ])),
    h('div', { class: 'card' }, tabsBox, filtersBox, list));
}

// ---- live search -----------------------------------------------------------------------------

function searchPage() {
  const s = state.search || (state.search = { edrpou: '', kind: 'transaction', role: 'both', from: addDays(today(), -30), to: today(), res: null, page: 0 });
  const out = h('div');
  const code = h('input', { type: 'text', inputmode: 'numeric', placeholder: '8 цифр', maxlength: 12, required: true, pattern: '\\s*\\d{8,10}\\s*', value: s.edrpou });
  const from = h('input', { type: 'date', required: true, value: s.from });
  const to = h('input', { type: 'date', required: true, value: s.to });
  const roleBox = h('span');
  let roleSel = null;
  const drawRole = () => {
    const opts = ROLES_FOR[kindSel.value];
    roleSel = opts ? select([['both', 'Любая роль']].concat(opts), opts.some((o) => o[0] === s.role) ? s.role : 'both', () => {}) : null;
    fill(roleBox, roleSel ? h('label', { class: 'f' }, 'Роль организации', roleSel) : '');
  };
  const kindSel = select(Object.entries(KIND).map(([k, v]) => [k, v.many]), s.kind, drawRole);
  drawRole();
  const go = h('button', { class: 'primary', type: 'submit' }, 'Найти');

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
    const names = kind in DOC_PATHS ? await getJSON('data/names.json', state.index.generated_at).catch(() => ({})) : {};
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
      fill(out, h('div', { class: 'empty' }, h('b', null, 'Поиск по порталу'), 'Найдите платежи, договоры, акты, обязательства и отчёты любой организации — даже если её нет в списке слежения. Запрос идёт из вашего браузера прямо на spending.gov.ua.'));
      return;
    }
    const tracked = state.index.orgs.some((o) => o.edrpou === s.edrpou);
    const box = h('div');
    pagedList(box, res.items, s.page, {
      csv: `spending-${s.edrpou}-${s.kind}`, noSum: s.kind === 'report',
      emptyText: 'По этим условиям на портале ничего нет.',
      extra: tracked ? h('a', { class: 'btn', href: '#/org/' + s.edrpou }, 'Открыть в списке слежения') : h('a', { class: 'btn', href: '#/orgs' }, 'Как добавить в слежение'),
    }, (p) => { s.page = p; draw(); });
    fill(out, res.truncated ? h('div', { class: 'notice', style: 'margin:12px 14px 0' }, 'За один из дней записей больше, чем отдаёт портал, — список может быть неполным.') : null, box);
  }

  const form = h('form', {
    class: 'filters',
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
        fill(out, h('div', { class: 'empty error' }, err.message));
      } finally {
        go.disabled = false;
      }
    },
  },
    h('label', { class: 'f' }, 'Код ЄДРПОУ', code),
    h('label', { class: 'f' }, 'Что ищем', kindSel),
    roleBox,
    h('label', { class: 'f' }, 'С', from), h('label', { class: 'f' }, 'По', to), go);
  draw();
  return h('div', { class: 'stack' },
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'Поиск'), h('div', { class: 'sub' }, 'Запрос напрямую к spending.gov.ua по коду организации'))),
    h('div', { class: 'card' }, form, out));
}

// ---- about ------------------------------------------------------------------------------------------

function aboutPage() {
  const runs = state.index.runs || [];
  const trigger = { schedule: 'по расписанию', workflow_dispatch: 'вручную', push: 'после изменения файлов', local: 'с компьютера' };
  return h('div', { class: 'stack' },
    h('div', { class: 'head' }, h('h1', null, 'Как это работает')),
    h('div', { class: 'card pad' },
      h('p', { style: 'margin-top:0' }, 'Сайт показывает открытые данные портала ', h('a', { href: 'https://spending.gov.ua', target: '_blank', rel: 'noopener noreferrer' }, 'spending.gov.ua'),
        ': платежи через Казначейство, договоры, акты, допсоглашения, штрафы, бюджетные обязательства и отчёты организаций из списка слежения.'),
      h('ul', { class: 'steps' },
        h('li', null, 'Каждые 6 часов GitHub Actions опрашивает портал и обновляет файлы с данными. Записи, которых раньше не было, попадают в ленту.'),
        h('li', null, 'У сайта нет входа и пользователей: его видит любой, у кого есть ссылка. Отметка «прочитано» хранится в вашем браузере.'),
        h('li', null, 'Платежи загружаются за 92 дня до добавления организации и копятся дальше. Договоры и акты — за всё время, а если документов одного типа больше 5000 — за последний год.'),
        h('li', null, 'Поиск обращается к порталу напрямую из браузера и работает для любой организации.'))),
    howToAdd(),
    h('div', { class: 'card pad' }, h('h2', null, 'Последние проверки'),
      runs.length ? h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Начало'), h('th', null, 'Окончание'), h('th', null, 'Запуск'), h('th', null, 'Результат'), h('th', { class: 'r' }, 'Организаций'), h('th', { class: 'r' }, 'Новых записей'))),
        h('tbody', null, runs.map((r) => h('tr', null,
          h('td', { class: 'num' }, ftime(r.started_at)), h('td', { class: 'num' }, ftime(r.finished_at)),
          h('td', null, trigger[r.trigger] || r.trigger),
          h('td', null, r.orgs_failed ? h('span', { class: 'tag err' }, `с ошибками (${r.orgs_failed})`) : h('span', { class: 'tag ok' }, 'успешно')),
          h('td', { class: 'r num' }, r.orgs_total), h('td', { class: 'r num' }, r.new_items)))))) : h('div', { class: 'muted' }, 'Проверок ещё не было.'),
      h('div', { class: 'muted small', style: 'margin-top:10px' }, 'Журнал всех запусков — ', ghLink('actions', 'на GitHub'), '.')));
}

// ---- router ------------------------------------------------------------------------------------------

function render() {
  closeDetail();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = parts[0] || 'feed';
  let page, key = route;
  if (route === 'orgs') page = orgsPage();
  else if (route === 'org' && /^\d+$/.test(parts[1] || '')) { page = orgPage(parts[1], parts[2]); key = 'orgs'; }
  else if (route === 'search') page = searchPage();
  else if (route === 'about') page = aboutPage();
  else { page = feedPage(); key = 'feed'; }
  fill(app, shell(key, page));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

async function boot() {
  try {
    await loadIndex();
    await loadFeed();
    render();
  } catch (e) {
    fill(app, h('div', { class: 'boot' }, h('b', null, 'Данные пока недоступны. '), e.message, '. Первая загрузка появится после первого запуска обновления на GitHub.'));
  }
}
boot();

// Pick up a fresh data set without a manual reload.
setInterval(async () => {
  const before = state.index && state.index.generated_at;
  try {
    await loadIndex();
    if (state.index.generated_at !== before) {
      await loadFeed();
      if (!document.querySelector('.drawer')) render();
    }
  } catch (e) { /* offline or mid-deploy: keep what is shown */ }
}, 10 * 60 * 1000);
