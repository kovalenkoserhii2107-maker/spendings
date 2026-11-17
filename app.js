'use strict';

// Монітор розрахунків — робоче місце комплаєнс-аналітика поверх відкритих даних
// spending.gov.ua. Файли в data/ оновлює GitHub Actions (sync/sync.py), він же
// звіряє договори з актами й платежами (sync/analysis.py). Вхід, спільна база
// (Firestore) і вивантаження на Google Диск — у cloud.js (Firebase).
// Усе, що показується, прийшло ззовні, тому інтерфейс збирається з DOM-вузлів
// і тексту, без innerHTML.

const APP = { version: '__VERSION__', build: '__BUILD__' };

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
  bank: ['M3 21h18', 'M3 10h18', 'M12 3 3 8h18z', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8'],
  building: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 10h.01', 'M15 10h.01', 'M9 14h.01', 'M15 14h.01'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  ext: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  check: ['M20 6 9 17l-5-5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  drive: ['M12 2 2 19h20L12 2z', 'M7 12h10', 'M2 19l5-7', 'M22 19l-5-7'],
  db: ['M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z', 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  money: ['M2 6h20v12H2z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 12h.01', 'M18 12h.01'],
  phone: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
  cloud: ['M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 11 4 4 0 0 1 17.5 19z', 'M12 12v5', 'M9.5 14.5 12 12l2.5 2.5'],
  star: ['M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'],
  tender: ['M9 2h6v4H9z', 'M15 4h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3', 'M9 12h6', 'M9 16h4'],
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
// The multi-colour Google "G" required on sign-in buttons.
function googleMark() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  for (const [color, d] of [
    ['#EA4335', 'M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.7 17.8 9.5 24 9.5z'],
    ['#4285F4', 'M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 7-9.9 7-17.1z'],
    ['#FBBC05', 'M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z'],
    ['#34A853', 'M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2.2 1.5-5 2.3-8.6 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z'],
  ]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', color);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// The UP&D mark: the same picture as icon.svg and the app icons.
function logo() {
  return h('img', { class: 'brand-mark', src: 'icon.svg', alt: 'UP&D', width: 36, height: 36 });
}

// ---- language ---------------------------------------------------------------------

const LANGS = ['uk', 'en'];
let LANG = (() => {
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS.includes(saved)) return saved;
  } catch (e) { /* storage blocked */ }
  return /^(uk|ru)/i.test(navigator.language || '') ? 'uk' : 'en';
})();

// t('key', {n: 3}) looks the key up in i18n.js; a function entry gets the vars.
function t(key, vars) {
  const all = window.I18N || {};
  let v = (all[LANG] || {})[key];
  if (v == null) v = (all.uk || {})[key];
  if (v == null) return key;
  if (typeof v === 'function') return v(vars || {}, helpers());
  return vars ? String(v).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : v;
}
function setLang(lang) {
  if (!LANGS.includes(lang) || lang === LANG) return;
  LANG = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem('lang', lang); } catch (e) { /* storage blocked */ }
  if (cloud && state.user) cloud.saveLang(lang).catch(() => {});
  buildFormatters();
  render();
}
function langSwitch() {
  return h('div', { class: 'lang', role: 'group', 'aria-label': t('lang.label') },
    LANGS.map((l) => h('button', { class: l === LANG ? 'on' : '', 'aria-pressed': l === LANG, onclick: () => setLang(l) }, l.toUpperCase())));
}

// ---- formatting ------------------------------------------------------------------------

let nf, nf1, ni;
function buildFormatters() {
  const loc = LANG === 'uk' ? 'uk-UA' : 'en-GB';
  nf = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  nf1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  ni = new Intl.NumberFormat(loc);
}
buildFormatters();
function money(amount, currency) {
  if (amount == null) return '—';
  return nf.format(amount) + (currency && currency !== 'UAH' ? ' ' + currency : ' ₴');
}
function mshort(x) {
  if (x == null) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return t('fmt.bn', { n: nf1.format(x / 1e9) });
  if (a >= 1e6) return t('fmt.m', { n: nf1.format(x / 1e6) });
  if (a >= 1e4) return t('fmt.k', { n: ni.format(Math.round(x / 1e3)) });
  return money(x);
}
function fdate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function ftime(iso) {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d)) return String(iso);
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
// Ukrainian plural form: 1 / 2-4 / 5+.
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
const helpers = () => ({ money, mshort, fdate, plural, ni, nf1 });

function toast(text, opts) {
  opts = opts || {};
  let box = document.querySelector('.toasts');
  if (!box) document.body.append((box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const el = h('div', { class: 'toast' + (opts.bad ? ' bad' : '') }, h('span', null, text),
    opts.action ? h('button', { class: 'toast-btn', onclick: () => { el.remove(); opts.action.run(); } }, opts.action.label) : null,
    opts.link ? h('a', { class: 'toast-btn', href: opts.link.href, target: '_blank', rel: 'noopener noreferrer' }, opts.link.label) : null);
  box.append(el);
  if (!opts.sticky) setTimeout(() => el.remove(), opts.bad ? 7000 : opts.link ? 9000 : 3500);
  return el;
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

// ---- state and site data ----------------------------------------------------------------------------

const state = {
  index: null, feed: null, signals: null, search: null, user: undefined, reviews: new Map(), trackedIndex: { items: [] }, cloudError: null, dataError: null,
  // The signed-in user's own lists (Firestore, private) and everything the site has synced.
  mine: { orgs: new Map(), tracked: new Map(), shared: new Map(), ready: false },
  all: { orgs: [], feed: [], signals: [] },
};
const app = document.getElementById('app');
let cloud = null;

async function getJSON(path, version) {
  const res = await fetch(`${path}?v=${encodeURIComponent(version || Date.now())}`);
  if (!res.ok) throw new Error(res.status === 404 ? t('err.noData') : t('err.load', { status: res.status }));
  return res.json();
}
const ver = () => state.index && state.index.generated_at;

async function loadAll() {
  state.index = await getJSON('data/index.json');
  const [feed, signals, trackedIndex] = await Promise.all([
    getJSON('data/feed.json', ver()).catch(() => ({ items: [] })),
    getJSON('data/signals.json', ver()).catch(() => ({ items: [] })),
    getJSON('data/tracked/index.json', ver()).catch(() => ({ items: [] })),
  ]);
  state.trackedIndex = trackedIndex;
  // The app follows payments under contracts: other checks stay in the data, not on screen.
  state.all = { orgs: state.index.orgs || [], feed: feed.items || [], signals: (signals.items || []).filter((s) => PAY_SIGNALS.includes(s.type)) };
  applyScope();
}

// Each user sees only the organisations in their own list, and the feed and signals of those.
function applyScope() {
  if (!state.index) return;
  const mineOrg = (code) => state.mine.orgs.has(code);
  state.index.orgs = state.all.orgs.filter((o) => mineOrg(o.edrpou));
  state.feed = { items: state.all.feed.filter((i) => mineOrg(i.org_edrpou)) };
  state.signals = { items: state.all.signals.filter((x) => mineOrg(x.org_edrpou)) };
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
  return m && first ? `${m[1]}/${first}` : 'kovalenkoserhii2107-maker/spendings';
}
// Sole traders' codes come masked ("xxxxxxxxxx") in Treasury payments: show real codes only.
const realCode = (c) => (c && /^\d{8,10}$/.test(String(c)) ? String(c) : null);
const ghUrl = (path) => `https://github.com/${repoName()}/${path}`;
const ghLink = (path, label, cls) => h('a', { class: cls, href: ghUrl(path), target: '_blank', rel: 'noopener noreferrer' }, label);
const ext = (href, label, cls) => h('a', { class: cls || 'btn btn-sm', href, target: '_blank', rel: 'noopener noreferrer' }, label, icon('ext'));

// "Read" marks live in this browser only.
function getSeen() {
  try { return localStorage.getItem('seen') || ''; } catch (e) { return ''; }
}
function setSeen(value) {
  try { localStorage.setItem('seen', value); } catch (e) { /* private mode: marks just do not persist */ }
}
const isNew = (item) => item.is_event && item.first_seen_at > getSeen();
const unreadCount = () => (state.feed ? state.feed.items.filter(isNew).length : 0);
const isOpenSignal = (s) => !['resolved', 'false_positive'].includes(reviewOf(s).status);
const riskCount = () => (state.signals ? state.signals.items.filter((s) => s.severity !== 'low' && isOpenSignal(s)).length : 0);

// ---- dictionaries -----------------------------------------------------------------

const KINDS = ['transaction', 'contract', 'act', 'addendum', 'peny', 'liability', 'report'];
const kindOne = (k) => t('kind.' + k);
const kindMany = (k) => t('kinds.' + k);
const roleLabel = (r) => t('role.' + r);
const ROLES_FOR = {
  transaction: ['payer', 'recipient'],
  contract: ['disposer', 'contractor'], act: ['disposer', 'contractor'], addendum: ['disposer', 'contractor'], peny: ['disposer', 'contractor'],
};
const roleOptions = (kind) => (ROLES_FOR[kind] || []).map((r) => [r, t('roleopt.' + r)]);
const PAY_SIGNALS = ['overpaid', 'paid_before', 'paid_over_acts', 'no_contract'];
const PAY_FLAGS = ['overpaid', 'paid_before', 'paid_over_acts'];
const payFlags = (c) => c.flags.filter((f) => PAY_FLAGS.includes(f));
const lastPay = (c) => (c.payments.length ? c.payments[c.payments.length - 1].date || '' : '');
function orgSignalCounts(code) {
  const out = { high: 0, medium: 0, low: 0 };
  for (const s of state.signals.items) if (s.org_edrpou === code && isOpenSignal(s)) out[s.severity]++;
  return out;
}
const FLAG_SEV = { overpaid: 'high', price_up: 'medium', acts_over: 'medium', no_tender: 'medium', paid_before: 'medium', split: 'medium', paid_over_acts: 'low', late: 'low' };
const REVIEW_STATUS = ['new', 'in_progress', 'resolved', 'false_positive'];
const PAGE = 50;

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
    throw new Error(t('err.portal'));
  }
  if (!res.ok) throw new Error(t('err.portalStatus', { status: res.status }));
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
        types: Object.fromEntries(types.map((x) => [x.id, x.shortName || x.name])),
        periods: Object.fromEntries(periods.map((p) => [p.id, p.name])),
      }))
      .catch(() => ({ types: {}, periods: {} }));
  }
  return reportDicts;
}

// Mirrors normalize() in sync/spending.py; titles are built in the reader's language.
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
    return {
      ext_id: String(raw.id), date: day(raw.signDate || raw.documentDate), amount: raw.amount, currency: raw.currency || 'UAH',
      role: isDisposer ? 'disposer' : 'contractor',
      cp_edrpou: isDisposer ? ids[0] || null : raw.edrpou,
      cp_name: isDisposer ? join(people.map((c) => c.name), ', ') || null : (names || {})[raw.edrpou] || null,
      title: docTitle(kind, raw),
    };
  }
  if (kind === 'liability') {
    return {
      ext_id: `${raw.system_key_fu}-${day(raw.dater) || ''}-${raw.nr}`, date: day(raw.dater), amount: raw.s, currency: raw.currency || 'UAH',
      role: 'payer', cp_edrpou: null, cp_name: null, title: liabilityTitle(raw),
    };
  }
  return {
    ext_id: String(raw.reportId), date: day(raw.publishDate || raw.createDate), amount: null, currency: null,
    role: 'owner', cp_edrpou: null, cp_name: null,
    title: join([(dicts && dicts.types[raw.reportTypeId]) || kindOne('report'), dicts && dicts.periods[raw.periodId], raw.progKlasCod]),
  };
}
function docTitle(kind, d) {
  const n = d.documentNumber;
  if (kind === 'contract') return join([n && '№ ' + n, d.subject]);
  if (kind === 'addendum') return join([t('kind.addendum') + (n ? ' № ' + n : ''), d.subject]);
  if (kind === 'act') return join([t('kind.act') + (n ? ' № ' + n : ''), join((d.specifications || []).slice(0, 3).map((s) => s.specificationName), '; ')]);
  return t('kind.peny') + (n ? ' № ' + n : '');
}
function liabilityTitle(d) {
  return join([d.kekv && `${t('f.kekv')} ${d.kekv} ${d.kekv_name || ''}`, d.contractNumber && t('f.contractNo', { n: d.contractNumber }), d.note]);
}
// Stored titles were written by the sync script; rebuild document titles in the reader's language.
function itemTitle(it) {
  if (it.data && DOC_PATHS[it.kind]) return docTitle(it.kind, it.data);
  if (it.data && it.kind === 'liability') return liabilityTitle(it.data);
  return it.title;
}

// Invoice, waybill and act numbers quoted in a payment purpose ("рах №108 від 10.11.2026").
const DOC_REFS = {
  invoice: /рах(?:унок|\.)?\s*(?:№|N)?\s*([0-9A-Za-zА-Яа-яІіЇїЄє/\-_.]+?)\s*(?:від|вiд|от)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
  waybill: /накл(?:адна|\.)?\s*(?:№|N)?\s*([0-9A-Za-zА-Яа-яІіЇїЄє/\-_.]+?)\s*(?:від|вiд|от)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
  act: /акт(?:у|\.)?\s*(?:№|N)?\s*([0-9A-Za-zА-Яа-яІіЇїЄє/\-_.]+?)\s*(?:від|вiд|от)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
};
function docRefs(text, type) {
  const out = [];
  for (const m of String(text || '').matchAll(DOC_REFS[type])) out.push(`№${m[1]} ${m[2]}`);
  return [...new Set(out)].join('; ');
}

// ---- reviews (shared analyst state in Firestore) -------------------------------------------

const slug = (s) => String(s || 'all').replace(/[^0-9A-Za-zА-Яа-яІіЇїЄєҐґ]+/g, '_').slice(0, 80);
function reviewKey(s) {
  return s.contract ? `${s.org_edrpou}_c_${s.contract}` : `${s.org_edrpou}_${s.type}_${slug(s.party)}`;
}
const contractReviewKey = (org, contractId) => `${org.edrpou}_c_${contractId}`;
function reviewOf(s) {
  return state.reviews.get(reviewKey(s)) || { status: 'new' };
}
function statusChip(status) {
  return h('span', { class: 'rv rv-' + status }, t('rv.' + status));
}

// ---- signals text ---------------------------------------------------------------------------

const signalTitle = (s) => t('sig.' + s.type + '.title');
const signalText = (s) => t('sig.' + s.type + '.text', Object.assign({}, s.params || {}));

// ---- service worker, updates and install ----------------------------------------------------

const install = { prompt: null, installed: false };
let swReg = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
    // Look for a new version when the app comes back to the foreground and every 30 minutes.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

let updateToast = null;
function offerUpdate(worker) {
  if (updateToast) return;
  updateToast = toast(t('upd.ready'), { sticky: true, action: { label: t('upd.reload'), run: () => worker.postMessage('SKIP_WAITING') } });
}

async function checkForUpdate(btn) {
  if (!swReg) { location.reload(); return; }
  if (btn) btn.disabled = true;
  try {
    await swReg.update();
    if (!swReg.waiting && !swReg.installing) toast(t('upd.latest', { v: APP.version }));
  } catch (e) {
    toast(t('upd.failed'), { bad: true });
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install.prompt = e;
  showInstallBanner();
});
window.addEventListener('appinstalled', () => {
  install.installed = true;
  install.prompt = null;
  document.querySelectorAll('.install').forEach((n) => n.remove());
  toast(t('inst.done'));
});

function installDismissed() {
  try { return Number(localStorage.getItem('installDismissed') || 0) > Date.now() - 7 * 86400000; } catch (e) { return false; }
}
async function runInstall() {
  if (!install.prompt) return false;
  install.prompt.prompt();
  const choice = await install.prompt.userChoice.catch(() => null);
  install.prompt = null;
  document.querySelectorAll('.install').forEach((n) => n.remove());
  return Boolean(choice && choice.outcome === 'accepted');
}
// Offered right away: Chrome/Edge/Android get the native prompt, iPhone gets the steps.
function showInstallBanner() {
  if (isStandalone() || installDismissed() || document.querySelector('.install') || !state.user) return;
  const ios = isIOS() && !install.prompt;
  if (!install.prompt && !ios) return;
  const close = () => { banner.remove(); try { localStorage.setItem('installDismissed', String(Date.now())); } catch (e) { /* ignore */ } };
  const banner = h('div', { class: 'install', role: 'dialog', 'aria-label': t('inst.title') },
    h('img', { src: 'icons/icon-192.png', alt: '', width: 44, height: 44 }),
    h('div', { class: 'install-text' }, h('b', null, t('inst.title')), h('span', null, ios ? t('inst.ios') : t('inst.text'))),
    h('div', { class: 'install-actions' },
      ios ? null : h('button', { class: 'btn btn-dark btn-sm', onclick: () => runInstall() }, t('inst.button')),
      h('button', { class: 'btn btn-sm', onclick: close }, t('inst.later'))));
  document.body.append(banner);
}

// ---- shell -------------------------------------------------------------------------------------

// Five sections; the bell (notifications) and the avatar (settings) sit in the header.
const NAV = [
  ['#/', 'tracked', 'star', 'nav.tracked'],
  ['#/eib', 'eib', 'bank', 'nav.eib'],
  ['#/prozorro', 'prozorro', 'tender', 'nav.prozorro'],
  ['#/payments', 'payments', 'money', 'nav.payments'],
  ['#/search', 'search', 'search', 'nav.search'],
];
// Pages that live inside a section, shown as its tabs.
const SECTION_TABS = {
  payments: [['#/payments', 'payments', 'nav.payments'], ['#/contracts', 'contracts', 'nav.contracts'], ['#/signals', 'signals', 'nav.signals']],
  search: [['#/search', 'search', 'srch.tab'], ['#/orgs', 'orgs', 'nav.orgs']],
};
function sectionTabs(section, active, page) {
  const tabs = SECTION_TABS[section];
  if (!tabs || !Array.isArray(page)) return page;
  const bar = h('nav', { class: 'section-tabs pills', 'aria-label': t('nav.' + section) }, tabs.map(([href, key, label]) =>
    h('a', { href, class: key === active ? 'on' : '' }, t(label), key === 'signals' && riskCount() ? h('em', { class: 'count red' }, riskCount()) : null)));
  return [page[0], bar].concat(page.slice(1));
}

function badgeFor(key) {
  if (key === 'payments') { const n = riskCount(); return n ? h('em', { class: 'count red' }, n) : null; }
  return null;
}

function bellButton(route) {
  const n = bellCount();
  return h('a', { class: 'bell' + (route === 'feed' ? ' on' : ''), href: '#/feed', title: t('ntf.title'), 'aria-label': t('ntf.title') + (n ? ' (' + n + ')' : '') },
    icon('bell'), n ? h('em', { class: 'count' }, n > 99 ? '99+' : n) : null);
}

function accountButton() {
  const u = state.user;
  if (!u) return null;
  const pic = u.photoURL ? h('img', { src: u.photoURL, alt: '', referrerpolicy: 'no-referrer' }) : h('span', null, (u.displayName || u.email || '?').slice(0, 1).toUpperCase());
  return h('a', { class: 'avatar', href: '#/settings', title: join([u.displayName, u.email], ' · '), 'aria-label': t('nav.settings') }, pic);
}

function shell(route, page) {
  const last = state.index.runs && state.index.runs[0];
  const failed = last && last.orgs_failed;
  const link = ([href, key, ico, label]) => h('a', { href, class: route === key ? 'on' : '' }, icon(ico), h('span', null, t(label)), badgeFor(key));
  return [
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('header', { class: 'top' }, h('div', { class: 'wrap top-inner' },
      h('a', { class: 'brand', href: '#/' },
        logo(),
        h('span', null, h('b', null, t('app.name')), h('small', null, t('app.tagline')))),
      h('nav', { class: 'nav', 'aria-label': t('nav.label') }, NAV.map(link)),
      h('div', { class: 'top-meta' },
        h('span', { class: 'chip' + (failed ? ' warn' : ''), title: last ? t('top.lastCheck', { at: ftime(last.finished_at) }) : '' }, h('i'), last ? ftime(last.finished_at).slice(0, 5) + ' ' + ftime(last.finished_at).slice(11) : '—'),
        langSwitch(),
        bellButton(route),
        accountButton()))),
    h('main', { class: 'page' }, h('div', { class: 'wrap' }, page)),
    h('footer', { class: 'foot-meta wrap' }, h('span', null, t('app.name'), ' · ', h('a', { href: '#/settings' }, 'v' + APP.version)), h('span', null, t('foot.data'))),
    // Phone layout: the same five sections at the bottom.
    h('nav', { class: 'tabbar', 'aria-label': t('nav.label') },
      NAV.map(([href, key, ico, label]) => h('a', { href, class: route === key ? 'on' : '' }, icon(ico), h('span', null, t(key === 'eib' ? 'eib.short' : label)), badgeFor(key)))),
  ];
}

function pageHead(eyebrow, title, lead, side) {
  return h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null),
    side || null);
}
const titleGrad = (a, b) => [h('span', null, a + ' '), h('span', { class: 'grad' }, b)];

// ---- shared pieces ------------------------------------------------------------------------

function select(options, value, onchange, label) {
  const el = h('select', { class: 'select', onchange, 'aria-label': label }, options.map(([v, text]) => h('option', { value: v }, text)));
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

// Tables carry data-label on every cell so phones can show each row as a card.
const td = (label, attrs, ...kids) => h('td', Object.assign({ 'data-label': label }, attrs || {}), ...kids);

function itemsTable(items, opts) {
  if (!items.length) return h('div', { class: 'empty' }, h('b', null, opts.emptyTitle || t('empty.title')), opts.emptyText || t('empty.text'));
  const L = { date: t('col.date'), type: t('col.type'), org: t('col.org'), party: t('col.party'), text: t('col.description'), sum: t('col.amount') };
  const rows = items.map((it) => {
    const incoming = it.kind === 'transaction' && it.role === 'recipient';
    return h('tr', { class: 'click' + (opts.marks && isNew(it) ? ' new' : ''), tabindex: 0, onclick: () => openRecord(it), onkeydown: (e) => { if (e.key === 'Enter') openRecord(it); } },
      td(L.date, { class: 'num' }, fdate(it.date)),
      td(L.type, null, h('span', { class: 'kind ' + it.kind }, kindOne(it.kind)), ROLES_FOR[it.kind] ? h('div', { class: 'cell-sub' }, roleLabel(it.role)) : null),
      opts.showOrg && td(L.org, { class: 'w-party' }, h('a', { href: '#/org/' + it.org_edrpou, onclick: (e) => e.stopPropagation() }, it.org_name)),
      td(L.party, { class: 'w-party' }, h('div', { class: 'cell-main' }, it.cp_name || (realCode(it.cp_edrpou) ? t('f.edrpou') + ' ' + it.cp_edrpou : '—')), it.cp_name && realCode(it.cp_edrpou) ? h('div', { class: 'cell-sub num' }, it.cp_edrpou) : null),
      td(L.text, { class: 'w-text' }, h('div', { class: 'clamp' }, itemTitle(it) || '—')),
      td(L.sum, { class: 'r num' + (incoming ? ' in' : '') }, it.amount == null ? '' : (incoming ? '+' : '') + money(it.amount, it.currency)));
  });
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null,
      h('th', null, L.date), h('th', null, L.type), opts.showOrg && h('th', null, L.org),
      h('th', null, L.party), h('th', null, L.text), h('th', { class: 'r' }, L.sum))),
    h('tbody', null, rows)));
}

// A filtered list shown a page at a time, with its total and UAH sum.
function pagedList(box, items, page, opts, onPage, renderRows) {
  const total = items.length;
  const sum = items.reduce((acc, i) => acc + (i.currency === 'UAH' && i.amount != null ? i.amount : 0), 0);
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const slice = items.slice(page * PAGE, (page + 1) * PAGE);
  fill(box,
    (renderRows || itemsTable)(slice, opts),
    total ? h('div', { class: 'foot' },
      h('div', null, t('list.range', { from: ni.format(from), to: ni.format(to), total: ni.format(total) }), opts.noSum ? '' : ' · ' + t('list.sum', { sum: money(opts.sum != null ? opts.sum : sum) })),
      h('div', { class: 'row' },
        opts.csv && h('button', { class: 'btn btn-sm', onclick: () => (opts.csvRows || csvItems)(items, opts.csv) }, icon('download'), 'CSV'),
        opts.extra,
        h('button', { class: 'btn btn-sm', disabled: page === 0, onclick: () => onPage(page - 1) }, t('list.prev')),
        h('button', { class: 'btn btn-sm', disabled: to >= total, onclick: () => onPage(page + 1) }, t('list.next')))) : null);
}

function toCSV(lines, sep) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return lines.map((l) => l.map(q).join(sep)).join('\r\n');
}
function csvDownload(lines, name) {
  const blob = new Blob(['﻿' + toCSV(lines, ';')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const dec = (x) => (x == null ? '' : LANG === 'uk' ? String(x).replace('.', ',') : String(x));
function itemRows(items) {
  const lines = [[t('col.date'), t('col.type'), t('col.role'), t('col.party'), t('col.partyCode'), t('col.amount'), t('col.currency'), t('col.description'), t('col.invoice'), t('col.waybill'), 'ID']];
  for (const i of items) {
    const text = itemTitle(i);
    lines.push([i.date, kindOne(i.kind), ROLES_FOR[i.kind] ? roleLabel(i.role) : '', i.cp_name, i.cp_edrpou, dec(i.amount), i.currency, text,
      i.kind === 'transaction' ? docRefs(text, 'invoice') : '', i.kind === 'transaction' ? docRefs(text, 'waybill') : '', i.ext_id]);
  }
  return lines;
}
const csvItems = (items, name) => csvDownload(itemRows(items), name);

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
  return [name || '', code && code !== 'HIDDEN' ? ` (${code})` : code === 'HIDDEN' ? ` (${t('f.codeHidden')})` : ''].join('');
}
function prozorro(id) {
  if (!id) return null;
  return /^UA-/.test(id) ? h('a', { href: 'https://prozorro.gov.ua/tender/' + encodeURIComponent(id), target: '_blank', rel: 'noopener noreferrer' }, id) : id;
}
function address(a) {
  if (!a) return null;
  return [a.regionName, a.district, a.city, a.street, a.house, a.office && t('f.office') + ' ' + a.office].filter(Boolean).join(', ');
}
const sevTag = (sev) => h('span', { class: 'sev ' + sev }, t('sev.' + sev));
// A price rise above the 10% limit is high risk; below it, medium.
const flagSev = (c, f) => (f === 'price_up' && c.value0 && c.price_up / c.value0 > 0.1 ? 'high' : FLAG_SEV[f] || '');
function flagChips(c, flags) {
  if (!flags || !flags.length) return h('span', { class: 'faint small' }, '—');
  return h('div', { class: 'flags' }, flags.map((f) => h('span', { class: 'flag ' + flagSev(c, f) }, t('flag.' + f))));
}
function payBar(c) {
  const base = Math.max(c.value || 0, c.paid || 0, c.acts_sum || 0) || 1;
  const over = c.value && c.paid > c.value + 1;
  return h('div', null,
    h('div', { class: 'bar' + (over ? ' over' : ''), title: `${t('dos.acts')} ${money(c.acts_sum)} · ${t('dos.paid')} ${money(c.paid)}` },
      h('i', { class: 'acts', style: `width:${Math.min(100, (c.acts_sum / base) * 100)}%` }),
      h('i', { style: `width:${Math.min(100, (c.paid / base) * 100)}%` })),
    h('div', { class: 'bar-label' }, h('span', null, c.value ? t('bar.paidPct', { pct: Math.round((c.paid / c.value) * 100) }) : '—'), h('span', null, c.acts.length ? t('bar.acts', { n: c.acts.length }) : '')));
}

// ---- sheets ---------------------------------------------------------------------------------

function closeSheet() {
  document.querySelectorAll('.scrim, .sheet').forEach((n) => n.remove());
  document.removeEventListener('keydown', escClose);
}
function escClose(e) {
  if (e.key === 'Escape') closeSheet();
}
function sheet(...content) {
  closeSheet();
  const body = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: -1 },
    h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': t('ui.close') }, icon('x')), content);
  document.body.append(h('div', { class: 'scrim', onclick: closeSheet }), body);
  document.addEventListener('keydown', escClose);
  body.focus();
  return body;
}

function detailBody(kind, d) {
  const out = [];
  if (kind === 'transaction') {
    out.push(kv([
      [t('f.payDate'), fdate(d.trans_date)],
      [t('f.payer'), party(d.payer_name, d.payer_edrpou)],
      [t('f.payerAccount'), d.payer_account],
      [t('f.recipient'), party(d.recipt_name, d.recipt_edrpou)],
      [t('f.recipientAccount'), d.recipt_account],
      [t('f.purpose'), d.payment_details],
      [t('col.invoice'), docRefs(d.payment_details, 'invoice') || null],
      [t('col.waybill'), docRefs(d.payment_details, 'waybill') || null],
      [t('f.document'), d.doc_number ? t('f.docFrom', { n: d.doc_number, date: fdate(d.doc_date) }) : null],
      [t('f.kekv'), d.kekv],
      [t('f.kpk'), d.kpk],
      [t('f.budget'), d.budgetCode],
      [t('f.source'), d.source_name],
      [t('f.prozorro'), prozorro(d.contractNumber)],
    ]));
  } else if (kind === 'liability') {
    out.push(kv([
      [t('f.payer'), party(d.payer_name, d.payer_edrpou)],
      [t('f.document'), d.ndoc ? t('f.docFrom', { n: d.ndoc, date: fdate(d.datedoc) }) : null],
      [t('f.regDate'), fdate(d.dater)],
      [t('f.term'), d.dateterm ? fdate(d.dateterm) : null],
      [t('f.budgetName'), d.minfin_name],
      [t('f.budget'), d.budgetCode],
      [t('f.kvk'), join([d.kvk, d.kvk_name], ' — ')],
      [t('f.kpk'), join([d.kpk, d.kpk_name], ' — ')],
      [t('f.kekv'), join([d.kekv, d.kekv_name], ' — ')],
      [t('f.contractNumber'), d.contractNumber],
      [t('f.prozorroContract'), d.prozorroContractId],
      [t('f.note'), d.note],
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
              h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', null, '№'), h('th', null, t('f.recipient')), h('th', { class: 'r' }, t('col.amount')))),
              h('tbody', null, items.map((f) => h('tr', null,
                h('td', { class: 'num' }, fdate(f.datedocf)), h('td', null, f.ndocf || '—'),
                h('td', { class: 'num' }, f.recipt_edrpou || '—'), h('td', { class: 'r num' }, money(f.s, f.currency))))))
            : h('div', { class: 'muted' }, t('f.noFinLiabilities')));
        } catch (e) {
          btn.disabled = false;
          toast(e.message, { bad: true });
        }
      },
    }, t('f.showFinLiabilities'));
    box.append(btn);
    out.push(h('section', null, h('h3', null, t('f.finLiabilities')), box));
  } else if (kind === 'report') {
    out.push(kv([
      [t('f.published'), fdate(d.publishDate)],
      [t('f.created'), d.createDate],
      [t('f.budgetLevel'), d.budget ? t('budget.' + d.budget) : null],
      [t('f.fund'), d.fund ? t('fund.' + d.fund) : null],
      [t('f.kvk'), join([d.vidKlasCod, d.vidKlas], ' — ')],
      [t('f.kpk'), join([d.progKlasCod, d.progKlas], ' — ')],
      [t('f.signedBy'), join([d.lname, d.fname, d.mname], ' ')],
    ]));
  } else {
    const people = (d.contractors || []).map((c) => h('div', null, party(c.name, c.identifier), address(c.address) ? h('div', { class: 'cell-sub' }, address(c.address)) : null));
    out.push(kv([
      [t('f.number'), d.documentNumber],
      [t('f.docDate'), fdate(d.documentDate)],
      [t('f.published'), fdate(d.signDate)],
      [t('f.buyerCode'), d.edrpou],
      [t('f.contractors'), people.length ? people : null],
      [t('f.subject'), d.subject],
      [t('f.validity'), d.noTerm ? t('f.noTerm') : d.fromDate || d.toDate ? `${fdate(d.fromDate)} — ${fdate(d.toDate)}` : null],
      [t('f.vat'), d.pdvAmount != null ? money(d.pdvAmount, d.currency) : null],
      [t('f.tender'), kind === 'contract' ? (d.tender ? t('ui.yes') : t('ui.no')) : null],
      [t('f.reason'), d.tender ? null : d.reason],
      [t('f.prozorro'), prozorro(d.idTenderProzorro)],
      [t('f.change'), d.amountIncrease != null ? money(d.amountIncrease, d.currency) : null],
    ]));
    if ((d.specifications || []).length) {
      out.push(h('section', null, h('h3', null, t('f.spec')), h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, t('f.item')), h('th', null, 'CPV'), h('th', { class: 'r' }, t('f.qty')), h('th', { class: 'r' }, t('f.price')))),
        h('tbody', null, d.specifications.map((s) => h('tr', null,
          h('td', null, s.specificationName || '—'), h('td', { class: 'num' }, s.cpvCode || '—'),
          h('td', { class: 'r num' }, s.itemCount != null ? `${ni.format(s.itemCount)} ${s.itemDimension || ''}` : '—'),
          h('td', { class: 'r num' }, s.itemCost != null ? money(s.itemCost, d.currency) : '—'))))))));
    }
  }
  out.push(h('section', null, h('details', null, h('summary', null, t('f.allFields')), h('pre', null, JSON.stringify(d, null, 2)))));
  return out;
}

function openRecord(item) {
  sheet(
    h('span', { class: 'kind ' + item.kind }, kindOne(item.kind)),
    h('h2', null, item.cp_name || item.org_name || kindOne(item.kind)),
    h('div', { class: 'sub' }, join([item.org_name, fdate(item.date), item.amount != null ? money(item.amount, item.currency) : null])),
    detailBody(item.kind, item.data || {}));
}

async function openRecords(org, kind, extIds, title, text, extra) {
  const box = h('div', null, h('div', { class: 'empty' }, t('ui.loading')));
  sheet(h('span', { class: 'kind ' + kind }, kindMany(kind)), h('h2', null, title), text ? h('div', { class: 'sub' }, text) : null, extra || null, h('section', null, box));
  try {
    const items = await findRecords(org, kind, extIds);
    fill(box, h('div', { class: 'table-card' }, itemsTable(items, { emptyText: t('empty.records') })));
  } catch (e) {
    fill(box, h('div', { class: 'empty' }, e.message));
  }
}

// Review block: status, comment and the audit trail of one check, shared via Firestore.
function reviewBlock(key, meta) {
  const box = h('section', { class: 'review' });
  const cur = state.reviews.get(key) || { status: 'new', comment: '' };
  const status = select(REVIEW_STATUS.map((s) => [s, t('rv.' + s)]), cur.status, () => {}, t('rv.status'));
  const comment = h('textarea', { class: 'input', rows: 3, maxlength: 4000, placeholder: t('rv.commentHint') });
  comment.value = cur.comment || '';
  const save = h('button', { class: 'btn btn-dark btn-sm' }, icon('check'), t('ui.save'));
  const hist = h('div', { class: 'history' });
  async function loadHistory() {
    try {
      const rows = await cloud.reviewHistory(key);
      fill(hist, rows.map((r) => h('div', { class: 'hist-row' },
        h('span', { class: 'num faint' }, ftime(r.at)), statusChip(r.status), h('b', null, r.byName || ''), r.comment ? h('span', { class: 'muted' }, r.comment) : null)));
    } catch (e) { /* history is optional */ }
  }
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await cloud.saveReview(key, Object.assign({}, meta, { status: status.value, comment: comment.value.trim() }));
      toast(t('rv.saved'));
      loadHistory();
    } catch (e) {
      toast(t('rv.saveFailed') + ' ' + (e.message || ''), { bad: true });
    } finally {
      save.disabled = false;
    }
  });
  fill(box, h('h3', null, t('rv.title')),
    cur.updatedByName ? h('p', { class: 'muted small' }, t('rv.last', { who: cur.updatedByName, at: ftime(cur.updatedAt) })) : null,
    h('div', { class: 'review-form' }, h('label', { class: 'field' }, h('span', null, t('rv.status')), status), h('label', { class: 'field grow' }, h('span', null, t('rv.comment')), comment), save),
    hist);
  if (cloud && state.user) loadHistory();
  return box;
}

const SIGNAL_HELP = ['overpaid', 'price_up', 'acts_over', 'no_tender', 'paid_before', 'split', 'paid_over_acts', 'late'];

async function openContract(org, contractId) {
  const body = sheet(h('div', { class: 'empty' }, t('dos.loading')));
  let a;
  try {
    a = await loadAnalysis(org);
  } catch (e) {
    fill(body, h('div', { class: 'empty' }, e.message));
    return;
  }
  const c = a.contracts.find((x) => x.id === String(contractId));
  if (!c) {
    fill(body, h('div', { class: 'empty' }, t('dos.notFound')));
    return;
  }
  const rest = c.value - c.paid;
  const events = [
    { d: c.date, cls: '', label: t('dos.ev.signed'), amount: c.value0 },
    c.published && { d: c.published, cls: '', label: t('dos.ev.published') + (c.late_days > 5 ? ' · ' + t('dos.ev.late', { n: c.late_days }) : '') },
    ...c.addendums.map((x) => ({ d: x.date, cls: 'add', label: t('kind.addendum') + ` № ${x.number || '—'}` + (x.type === 1 ? ` · +${money(x.delta)}` : x.type === 0 ? ` · −${money(x.delta)}` : ''), amount: x.amount, kind: 'addendum', ext: x.ext_id })),
    ...c.acts.map((x) => ({ d: x.date, cls: 'act', label: t('kind.act') + ` № ${x.number || '—'}`, amount: x.amount, kind: 'act', ext: x.ext_id })),
    ...c.payments.map((x) => ({ d: x.date, cls: 'pay', label: t('dos.ev.payment'), amount: x.amount, kind: 'transaction', ext: x.ext_id })),
  ].filter(Boolean).sort((x, y) => (x.d || '').localeCompare(y.d || ''));
  const clickEv = async (ev) => {
    const [rec] = await findRecords(org, ev.kind, [ev.ext]);
    if (rec) openRecord(rec);
  };
  const rv = state.reviews.get(contractReviewKey(org, c.id));
  const driveBtn = h('button', { class: 'btn btn-sm', onclick: () => exportContract(org, c, driveBtn) }, icon('drive'), t('drv.saveContract'));
  fill(body,
    h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': t('ui.close') }, icon('x')),
    h('div', { class: 'chips', style: 'margin-top:0' }, h('span', { class: 'kind contract' }, kindOne('contract')), c.role === 'contractor' ? h('span', { class: 'tag' }, t('dos.asContractor')) : null, rv ? statusChip(rv.status) : null),
    h('h2', null, t('dos.heading', { n: c.number || '—', date: fdate(c.date) })),
    h('div', { class: 'sub' }, join([c.party_name, c.party_code]), h('br'), c.subject),
    h('div', { class: 'money-row' },
      h('div', null, h('small', null, t('dos.value')), h('b', { class: 'num' }, mshort(c.value)), c.value !== c.value0 ? h('div', { class: 'cell-sub' }, t('dos.was', { v: mshort(c.value0) })) : null),
      h('div', null, h('small', null, t('dos.acts')), h('b', { class: 'num' }, mshort(c.acts_sum))),
      h('div', { class: c.flags.includes('overpaid') ? 'bad' : '' }, h('small', null, t('dos.paid')), h('b', { class: 'num' }, mshort(c.paid)), h('div', { class: 'cell-sub' }, t('dos.period'))),
      h('div', { class: rest < -1 ? 'bad' : '' }, h('small', null, rest < -1 ? t('dos.overpaid') : t('dos.rest')), h('b', { class: 'num' }, mshort(Math.abs(rest))))),
    h('section', null, payBar(c)),
    payFlags(c).length ? h('section', null, h('h3', null, t('dos.signals')), h('div', { class: 'explain' },
      payFlags(c).map((f) => h('div', { class: flagSev(c, f) }, h('b', null, t('flag.' + f) + '. '), SIGNAL_HELP.includes(f) ? t('help.' + f) : '')))) : null,
    payFlags(c).length && state.user ? reviewBlock(contractReviewKey(org, c.id), { org: org.edrpou, contract: c.id, signalType: payFlags(c).join(','), title: `${c.number} · ${c.party_name || ''}`.slice(0, 300) }) : null,
    h('section', null, h('h3', null, t('dos.timeline')),
      events.length ? h('div', { class: 'timeline' }, events.map((ev) => h('div', {
        class: 'ev ' + ev.cls + (ev.ext ? ' click' : ''), onclick: ev.ext ? () => clickEv(ev) : null,
      }, h('span', { class: 'd num' }, fdate(ev.d)), h('span', null, ev.label), h('span', { class: 'num' }, ev.amount != null ? money(ev.amount) : '')))) : h('div', { class: 'muted' }, t('dos.noEvents')),
      !c.payments.length ? h('p', { class: 'muted small', style: 'margin-top:10px' }, t('dos.noPayments')) : null),
    h('section', null, h('h3', null, t('dos.terms')), kv([
      [t('f.validity'), c.from || c.to ? `${fdate(c.from)} — ${c.to ? fdate(c.to) : t('f.noTerm')}` : null],
      [t('dos.procedure'), c.tender ? t('dos.tender') : t('dos.noTender')],
      [t('f.reason'), c.tender ? null : c.reason],
      ['Prozorro', prozorro(c.prozorro || c.pz)],
      ['CPV', c.cpv],
    ])),
    c.pz ? pzDossierBlock(org, c) : null,
    h('section', { class: 'row' }, driveBtn, h('button', {
      class: 'btn btn-sm', onclick: async () => {
        const [rec] = await findRecords(org, 'contract', [c.ext_id]);
        if (rec) openRecord(rec);
      },
    }, t('dos.portalCard'))));
}

// The Prozorro side of a Treasury contract: payment terms and the signed documents.
function pzDossierBlock(org, c) {
  const box = h('section', null, h('h3', null, t('pz.inProzorro')), h('div', { class: 'muted small' }, t('pz.loading')));
  (async () => {
    try {
      const t0 = (await loadKind(org, 'prozorro')).find((x) => x.tid === c.pz);
      const pc = t0 && (t0.contracts || []).find((x) => x.sp === c.id);
      if (!t0 || !pc) { box.remove(); return; }
      const terms = lotMilestones(t0, pc).filter((m) => m.type === 'financing');
      fill(box, h('h3', null, t('pz.inProzorro')),
        kv([
          [t('pz.colMethod'), label('pzt.', t0.method)],
          [t('pz.contractValue'), pc.value ? money(pc.value.amount, pc.value.currency) : null],
          [t('pz.status'), label('pzc.', pc.status)],
          [t('pz.paidByBuyer'), pc.paid ? money(pc.paid.amount, pc.paid.currency) : null],
        ]),
        terms.length ? h('div', { class: 'explain', style: 'margin-top:10px' }, terms.map((m) => h('div', { class: 'pay' }, h('span', null, milestoneText(m))))) : null,
        (pc.docs || []).length ? h('div', { style: 'margin-top:10px' }, docList(pc.docs.filter((d) => /^contract/.test(d.type || '')).length ? pc.docs.filter((d) => /^contract/.test(d.type || '')) : pc.docs)) : null,
        h('div', { class: 'row', style: 'margin-top:10px' }, trackButton(org, t0, pc), h('button', { class: 'btn btn-sm', onclick: () => openTender(org, t0.tid) }, t('pz.openProcedure')), ext(pzUrl(t0.tid), 'Prozorro')));
    } catch (e) {
      box.remove();
    }
  })();
  return box;
}

function openSignal(s) {
  const org = orgByCode(s.org_edrpou);
  if (!org) return;
  if (s.contract) { openContract(org, s.contract); return; }
  if (s.type === 'no_contract') {
    const extra = state.user ? reviewBlock(reviewKey(s), { org: org.edrpou, contract: null, signalType: s.type, title: (s.party || '').slice(0, 300) }) : null;
    openRecords(org, 'transaction', s.ext_ids, s.party || signalTitle(s), signalText(s), extra);
    return;
  }
  location.hash = s.type === 'late' ? `#/org/${org.edrpou}/contracts/late` : `#/org/${org.edrpou}/contracts`;
}

function signalCard(s, showOrg) {
  const rv = state.reviews.get(reviewKey(s));
  return h('article', {
    class: 'sig ' + s.severity + (isOpenSignal(s) ? '' : ' done'), tabindex: 0,
    onclick: () => openSignal(s), onkeydown: (e) => { if (e.key === 'Enter') openSignal(s); },
  },
    h('div', { class: 'meta' }, sevTag(s.severity), h('span', null, t('sigtype.' + s.type)), rv ? statusChip(rv.status) : null, showOrg ? h('b', null, s.org_name) : null),
    h('h3', null, s.party || signalTitle(s)),
    h('p', { class: 'text' }, s.party ? signalTitle(s) + '. ' + signalText(s) : signalText(s)),
    h('div', { class: 'side' },
      s.amount != null ? h('span', { class: 'amount num' }, mshort(s.amount)) : h('span'),
      s.date ? h('span', { class: 'faint small' }, fdate(s.date)) : null,
      h('span', { class: 'btn btn-sm' }, s.contract ? t('sig.dossier') : t('sig.open'), icon('arrow'))));
}

function signalsPage(preset) {
  const all = state.signals.items;
  const f = { sev: preset || 'risk', type: '', org: '', q: '', rv: 'open' };
  const list = h('div', { class: 'sig-list' });
  const counts = { risk: all.filter((s) => s.severity !== 'low').length, high: 0, medium: 0, low: 0 };
  for (const s of all) counts[s.severity]++;
  const types = [...new Set(all.map((s) => s.type))];

  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const items = all.filter((s) => (f.sev === 'all' || (f.sev === 'risk' ? s.severity !== 'low' : s.severity === f.sev))
      && (!f.type || s.type === f.type) && (!f.org || s.org_edrpou === f.org)
      && (f.rv === 'all' || (f.rv === 'open' ? isOpenSignal(s) : reviewOf(s).status === f.rv))
      && (!words.length || words.every((w) => [signalTitle(s), signalText(s), s.party, s.org_name].join(' ').toLowerCase().includes(w))));
    fill(list, items.length ? items.slice(0, 300).map((s) => signalCard(s, true))
      : h('div', { class: 'card empty' }, h('b', null, all.length ? t('sigs.noneFiltered') : t('sigs.none')), all.length ? t('sigs.changeFilter') : t('sigs.later')),
    items.length > 300 ? h('p', { class: 'muted small' }, t('sigs.first300', { n: items.length })) : null);
  }
  const q = h('input', { class: 'input', type: 'search', placeholder: t('sigs.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; draw(); } });
  draw();
  return [
    pageHead(t('sigs.eyebrow'), titleGrad(t('sigs.title1'), t('sigs.title2')), null),
    h('div', { class: 'filters' },
      pills([['risk', t('sigs.risk'), counts.risk], ['high', t('sev.high'), counts.high], ['medium', t('sev.medium'), counts.medium], ['low', t('sev.low'), counts.low], ['all', t('ui.all'), all.length]], f.sev, (v) => { f.sev = v; draw(); }),
      pills([['open', t('rv.open')], ['in_progress', t('rv.in_progress')], ['resolved', t('rv.resolved')], ['false_positive', t('rv.false_positive')], ['all', t('ui.all')]], f.rv, (v) => { f.rv = v; draw(); }),
      select([['', t('sigs.allTypes')]].concat(types.map((x) => [x, t('sigtype.' + x)])), '', (e) => { f.type = e.target.value; draw(); }, t('sigs.allTypes')),
      state.index.orgs.length > 1 ? select([['', t('ui.allOrgs')]].concat(state.index.orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; draw(); }, t('ui.allOrgs')) : null,
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
  if (!orgs.length) return [pageHead(t('app.name'), titleGrad(t('ov.title1'), t('ov.title2'))), addOrgCard()];
  const sum = (key) => orgs.reduce((acc, o) => acc + ((o.totals || {})[key] || 0), 0);
  const value = sum('value'), paid = sum('paid'), unmatched = sum('unmatched_sum'), contracts = sum('contracts'), matched = sum('matched');
  const share = paid + unmatched ? paid / (paid + unmatched) : 0;
  const open = state.signals.items.filter(isOpenSignal);
  const top = open.filter((s) => s.severity !== 'low').slice(0, 3);
  const sub = h('p', null, t('ui.loading'));
  const rows = h('div', { class: 'rows' });
  const recent = h('div', null, h('div', { class: 'empty' }, t('pay.loading')));
  const row = (label, n, href) => h('div', { class: 'row', onclick: () => { location.hash = href; } }, label, h('b', null, ni.format(n)));

  (async () => {
    try {
      const [analyses, pays] = await Promise.all([Promise.all(orgs.map(loadAnalysis)), paymentRows(orgs)]);
      const buyer = analyses.flatMap((a) => a.contracts.filter((c) => c.role === 'disposer'));
      const withPay = buyer.filter((c) => c.payments.length).length;
      fill(sub, t('ov.paidOf', { n: ni.format(withPay), total: ni.format(buyer.length) }));
      fill(rows,
        row(t('ov.rowWithPay'), withPay, '#/contracts/paid'),
        row(t('ov.rowNoPay'), buyer.length - withPay, '#/contracts/unpaid'),
        row(t('ov.rowNoContract'), pays.filter((r) => !r.contract && r.item.role === 'payer').length, '#/payments/none'),
        row(t('ov.rowSignals'), open.length, '#/signals'));
      fill(recent, h('div', { class: 'table-card' }, paymentsTable(pays.filter((r) => r.contract).slice(0, 10), { showOrg: orgs.length > 1 })));
    } catch (e) {
      fill(recent, h('div', { class: 'card empty' }, e.message));
    }
  })();

  return [
    pageHead(t('ov.eyebrow'), titleGrad(t('ov.title1'), t('ov.title2'))),
    h('div', { class: 'bento' },
      h('div', { class: 'focus' },
        h('small', null, t('ov.now')),
        h('h2', null, t('ov.paidHead', { sum: mshort(paid) })),
        sub,
        rows,
        h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/payments' }, t('ov.allPayments'), icon('arrow')))),
      h('div', { class: 'stat tint-violet' }, h('small', null, t('ov.contracts')), h('b', { class: 'num' }, mshort(value)), h('span', { class: 'sub' }, t('org.pcs', { n: ni.format(contracts) }))),
      h('div', { class: 'stat tint-blue' }, h('small', null, t('ov.paid')), h('b', { class: 'num' }, mshort(paid)), h('span', { class: 'sub' }, t('org.matched', { n: ni.format(matched) }))),
      h('div', { class: 'stat' }, h('small', null, t('ov.coverage')), h('div', { class: 'ring' }, ring(share), h('div', null, h('b', { class: 'num' }, Math.round(share * 100) + '%'), h('div', { class: 'sub' }, t('ov.coverageSub'))))),
      h('div', { class: 'stat tint-yellow' }, h('small', null, t('ov.unmatched')), h('b', { class: 'num' }, mshort(unmatched)), h('span', { class: 'sub' }, t('ov.loadedPeriod')))),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, t('ov.recentPayments')), h('a', { class: 'btn btn-sm', href: '#/payments' }, t('ov.allPayments'), icon('arrow'))),
      recent),
    top.length ? h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, t('ov.topSignals')), h('a', { class: 'btn btn-sm', href: '#/signals' }, t('ov.allSignals'), icon('arrow'))),
      h('div', { class: 'sig-list' }, top.map((s) => signalCard(s, orgs.length > 1)))) : null,
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, t('nav.orgs')), h('a', { class: 'btn btn-sm', href: '#/orgs' }, t('ov.watchlist'), icon('arrow'))),
      orgGrid(orgs.slice(0, 6))),
  ];
}

// ---- contracts ---------------------------------------------------------------------------------

function contractsTable(rows, opts) {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, t('ct.none')), t('sigs.changeFilter'));
  const L = { c: t('col.contract'), org: t('col.org'), party: t('col.party'), subj: t('col.subject'), val: t('col.value'), paid: t('col.paid'), rec: t('col.recon'), sig: t('col.signals') };
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null,
      h('th', null, L.c), opts.showOrg && h('th', null, L.org), h('th', null, L.party), h('th', null, L.subj),
      h('th', { class: 'r' }, L.val), h('th', { class: 'r' }, L.paid), h('th', null, L.rec), h('th', null, L.sig))),
    h('tbody', null, rows.map((c) => {
      const rv = state.reviews.get(contractReviewKey(c._org, c.id));
      return h('tr', {
        class: 'click', tabindex: 0, onclick: () => openContract(c._org, c.id), onkeydown: (e) => { if (e.key === 'Enter') openContract(c._org, c.id); },
      },
        td(L.c, null, h('div', { class: 'cell-main' }, '№ ' + (c.number || '—')), h('div', { class: 'cell-sub num' }, fdate(c.date)), c.pz ? h('span', { class: 'tag pz' }, 'Prozorro') : null),
        opts.showOrg && td(L.org, { class: 'w-party' }, c._org.name),
        td(L.party, { class: 'w-party' }, h('div', { class: 'cell-main' }, c.party_name || '—'), realCode(c.party_code) ? h('div', { class: 'cell-sub num' }, c.party_code) : null),
        td(L.subj, { class: 'w-text' }, h('div', { class: 'clamp' }, c.subject || '—')),
        td(L.val, { class: 'r num' }, money(c.value), c.value !== c.value0 ? h('div', { class: 'cell-sub' }, t('dos.was', { v: money(c.value0) })) : null),
        td(L.paid, { class: 'r num' }, c.paid ? money(c.paid) : h('span', { class: 'faint' }, '—')),
        td(L.rec, null, payBar(c)),
        td(L.sig, null, flagChips(c, payFlags(c)), rv ? statusChip(rv.status) : null));
    }))));
}

function contractRows(items) {
  const lines = [[t('col.org'), t('f.number'), t('col.date'), t('f.published'), t('col.party'), t('f.edrpou'), t('col.subject'), t('ct.value0'), t('col.value'), t('dos.acts'), t('col.paid'), t('ct.gap'), t('col.signals'), t('rv.status'), 'Prozorro', 'CPV']];
  for (const c of items) {
    const rv = state.reviews.get(contractReviewKey(c._org, c.id));
    lines.push([c._org.name, c.number, c.date, c.published, c.party_name, c.party_code, c.subject, dec(c.value0), dec(c.value), dec(c.acts_sum), dec(c.paid),
      dec(Math.round((c.value - c.paid) * 100) / 100), payFlags(c).map((x) => t('flag.' + x)).join(', '), rv ? t('rv.' + rv.status) : '', c.prozorro, c.cpv]);
  }
  return lines;
}

function contractsBrowser(orgs, presetFlag) {
  const box = h('div', null, h('div', { class: 'empty' }, t('ct.loading')));
  const f = { q: '', flag: presetFlag || '', sort: 'lastpay', page: 0 };
  let all = [];
  const list = h('div');
  const showOrg = orgs.length > 1;

  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const byFlag = (c) => !f.flag || (f.flag === 'paid' ? c.payments.length > 0 : f.flag === 'unpaid' ? !c.payments.length
      : f.flag === 'any' ? payFlags(c).length > 0 : c.flags.includes(f.flag));
    let rows = all.filter((c) => byFlag(c)
      && (!words.length || words.every((w) => [c.number, c.party_name, c.party_code, c.subject, c._org.name].join(' ').toLowerCase().includes(w))));
    if (f.sort === 'lastpay') rows = rows.slice().sort((x, y) => lastPay(y).localeCompare(lastPay(x)) || (y.date || '').localeCompare(x.date || ''));
    else if (f.sort === 'value') rows = rows.slice().sort((x, y) => y.value - x.value);
    else if (f.sort === 'gap') rows = rows.slice().sort((x, y) => (y.paid - y.value) - (x.paid - x.value));
    else if (f.sort === 'paid') rows = rows.slice().sort((x, y) => y.paid - x.paid);
    const total = rows.reduce((s, c) => s + c.value, 0);
    pagedList(list, rows, f.page, { showOrg, flag: f.flag, sum: total, csv: 'contracts-reconciliation', csvRows: (items, name) => csvDownload(contractRows(items), name) },
      (p) => { f.page = p; draw(); }, contractsTable);
  }

  (async () => {
    try {
      const parts = await Promise.all(orgs.map(async (o) => (await loadAnalysis(o)).contracts.map((c) => Object.assign({ _org: o }, c))));
      all = parts.flat().sort((x, y) => (y.date || '').localeCompare(x.date || ''));
      const cnt = (fl) => all.filter((c) => c.flags.includes(fl)).length;
      const q = h('input', { class: 'input', type: 'search', placeholder: t('ct.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; f.page = 0; draw(); } });
      fill(box, h('div', { class: 'table-card' },
        h('div', { class: 'table-tools' },
          pills([['', t('ui.all'), all.length], ['paid', t('ct.withPayments'), all.filter((c) => c.payments.length).length],
            ['unpaid', t('ct.noPayments'), all.filter((c) => !c.payments.length).length]]
            .concat(PAY_FLAGS.map((fl) => [fl, t('flag.' + fl), cnt(fl)]).filter((p) => p[2])),
          f.flag, (v) => { f.flag = v; f.page = 0; draw(); }),
          q,
          select([['lastpay', t('ct.sortLastPay')], ['date', t('ct.sortDate')], ['value', t('ct.sortValue')], ['paid', t('ct.sortPaid')], ['gap', t('ct.sortGap')]], f.sort, (e) => { f.sort = e.target.value; f.page = 0; draw(); }, t('ct.sort'))),
        list));
      draw();
    } catch (e) {
      fill(box, h('div', { class: 'card empty' }, e.message));
    }
  })();
  return box;
}

function contractsPage(preset) {
  return [pageHead(t('ct.eyebrow'), titleGrad(t('ct.title1'), t('ct.title2')), null), contractsBrowser(state.index.orgs, preset)];
}

// ---- payments: every Treasury payment with the contract it pays -------------------------------

// Payments of the given organisations, newest first, each with its matched contract (or null).
async function paymentRows(orgs) {
  const parts = await Promise.all(orgs.map(async (org) => {
    const [txs, a] = await Promise.all([loadKind(org, 'transaction'), loadAnalysis(org)]);
    const byPay = new Map();
    for (const c of a.contracts) for (const p of c.payments) byPay.set(String(p.ext_id), c);
    return txs.map((i) => ({ org, item: Object.assign({ org_name: org.name, org_edrpou: org.edrpou }, i), contract: byPay.get(String(i.ext_id)) || null }));
  }));
  return parts.flat().sort((x, y) => (y.item.date || '').localeCompare(x.item.date || '') || String(y.item.ext_id).localeCompare(String(x.item.ext_id)));
}

function contractCell(c) {
  if (!c) return h('span', { class: 'tag nocontract' }, t('pay.noContract'));
  return [h('div', { class: 'cell-main' }, '№ ' + (c.number || '—')),
    h('div', { class: 'cell-sub' }, join([t('pay.contractFrom', { date: fdate(c.date) }), c.value ? t('bar.paidPct', { pct: Math.round((c.paid / c.value) * 100) }) : null]))];
}

function paymentsTable(rows, opts) {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, t('pay.none')), t('empty.text'));
  const L = { date: t('col.date'), sum: t('col.amount'), party: t('col.party'), c: t('col.contract'), text: t('f.purpose'), org: t('col.org') };
  const open = (r) => (r.contract ? openContract(r.org, r.contract.id) : openRecord(r.item));
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null, h('th', null, L.date), h('th', { class: 'r' }, L.sum), opts.showOrg && h('th', null, L.org), h('th', null, L.party), h('th', null, L.c), h('th', null, L.text))),
    h('tbody', null, rows.map((r) => {
      const i = r.item;
      const incoming = i.role === 'recipient';
      return h('tr', { class: 'click' + (r.contract ? '' : ' unmatched'), tabindex: 0, onclick: () => open(r), onkeydown: (e) => { if (e.key === 'Enter') open(r); } },
        td(L.date, { class: 'num' }, fdate(i.date)),
        td(L.sum, { class: 'r num' + (incoming ? ' in' : '') }, (incoming ? '+' : '') + money(i.amount, i.currency)),
        opts.showOrg && td(L.org, { class: 'w-party' }, r.org.name),
        td(L.party, { class: 'w-party' }, h('div', { class: 'cell-main' }, i.cp_name || '—'), realCode(i.cp_edrpou) ? h('div', { class: 'cell-sub num' }, i.cp_edrpou) : null),
        td(L.c, null, contractCell(r.contract)),
        td(L.text, { class: 'w-text' }, h('div', { class: 'clamp' }, i.title || '—'), (i.data || {}).kekv ? h('div', { class: 'cell-sub' }, t('f.kekv') + ' ' + i.data.kekv) : null));
    }))));
}

function paymentCsv(rows) {
  const lines = [[t('col.date'), t('col.amount'), t('col.currency'), t('col.org'), t('col.party'), t('col.partyCode'), t('col.contract'), t('f.docDate'), t('col.invoice'), t('col.waybill'), t('f.kekv'), t('f.purpose'), 'ID']];
  for (const r of rows) {
    const i = r.item;
    lines.push([i.date, dec(i.role === 'recipient' ? i.amount : -i.amount), i.currency, r.org.name, i.cp_name, i.cp_edrpou, r.contract ? r.contract.number : '', r.contract ? r.contract.date : '',
      docRefs(i.title, 'invoice'), docRefs(i.title, 'waybill'), (i.data || {}).kekv || '', i.title, i.ext_id]);
  }
  return lines;
}

function paymentsBrowser(orgs, preset) {
  const box = h('div', null, h('div', { class: 'empty' }, t('pay.loading')));
  const f = { which: preset === 'none' || preset === 'matched' ? preset : '', q: '', org: '', page: 0 };
  const list = h('div');
  let all = [];
  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = all.filter((r) => (!f.which || (f.which === 'matched' ? r.contract : !r.contract)) && (!f.org || r.org.edrpou === f.org)
      && (!words.length || words.every((w) => [r.item.cp_name, r.item.cp_edrpou, r.item.title, r.contract && r.contract.number].join(' ').toLowerCase().includes(w))));
    const sum = rows.reduce((acc, r) => acc + (r.item.currency === 'UAH' ? (r.item.amount || 0) : 0), 0);
    pagedList(list, rows, f.page, { showOrg: orgs.length > 1, sum, csv: 'payments-by-contract', csvRows: (items, name) => csvDownload(paymentCsv(items), name) },
      (p) => { f.page = p; draw(); }, paymentsTable);
  }
  (async () => {
    try {
      all = await paymentRows(orgs);
      const matched = all.filter((r) => r.contract).length;
      const q = h('input', { class: 'input', type: 'search', placeholder: t('pay.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; f.page = 0; draw(); } });
      fill(box, h('div', { class: 'table-card' },
        h('div', { class: 'table-tools' },
          pills([['', t('ui.all'), all.length], ['matched', t('pay.withContract'), matched], ['none', t('pay.noContract'), all.length - matched]], f.which, (v) => { f.which = v; f.page = 0; draw(); }),
          orgs.length > 1 ? select([['', t('ui.allOrgs')]].concat(orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; f.page = 0; draw(); }, t('ui.allOrgs')) : null,
          q),
        list));
      draw();
    } catch (e) {
      fill(box, h('div', { class: 'card empty' }, e.message));
    }
  })();
  return box;
}

function paymentsPage(preset) {
  return [pageHead(t('pay.eyebrow'), titleGrad(t('pay.title1'), t('pay.title2')), null), paymentsBrowser(state.index.orgs, preset)];
}

// ---- Prozorro: procedures, payment terms, contracts and documents ---------------------------------

// A dictionary label, or the raw code when the dictionary does not know it.
const label = (prefix, code) => { if (!code) return ''; const v = t(prefix + code); return v === prefix + code ? code : v; };
const pzUrl = (tid) => 'https://prozorro.gov.ua/tender/' + encodeURIComponent(tid);
const pzOpen = (t0) => !['complete', 'cancelled', 'unsuccessful'].includes(t0.status);
const pzStatus = (s) => h('span', { class: 'pz-st ' + (['complete', 'active'].includes(s) ? 'ok' : ['cancelled', 'unsuccessful'].includes(s) ? 'off' : 'run') }, label('pzs.', s));

// Procedures of the given organisations with each contract's Treasury reconciliation (if linked).
async function tenderRows(orgs) {
  const parts = await Promise.all(orgs.map(async (org) => {
    if (!((org.files || {}).prozorro || []).length) return [];
    const [tenders, a] = await Promise.all([loadKind(org, 'prozorro'), loadAnalysis(org).catch(() => ({ contracts: [] }))]);
    const sp = new Map(a.contracts.map((c) => [c.id, c]));
    return tenders.map((t0) => ({ org, t: t0, links: (t0.contracts || []).map((c) => (c.sp ? sp.get(c.sp) || null : null)) }));
  }));
  return parts.flat().sort((x, y) => (y.t.date || '').localeCompare(x.t.date || '') || y.t.tid.localeCompare(x.t.tid));
}

// What the buyer has to pay and when, in one line: "Післяплата 100% — 30 календарних днів після надання послуг".
function milestoneText(m) {
  const days = m.days != null ? t('pzm.days', { n: m.days, type: m.days_type }) : '';
  const when = days ? `${days} ${t('pzm.after')} ${label('pzm.ev.', m.event).toLowerCase()}` : label('pzm.ev.', m.event);
  const what = m.type === 'financing' ? join([label('pzm.code.', m.code), m.pct != null ? nf1.format(m.pct) + '%' : null], ' ') : null;
  return join([what, when, m.text], ' — ');
}
const lotMilestones = (t0, c) => (t0.milestones || []).filter((m) => !m.lot || !c || !c.lot || m.lot === c.lot);

function paidCell(c, link) {
  if (link) return [h('div', { class: 'cell-main num' }, money(link.paid)), h('div', { class: 'cell-sub' }, link.value ? t('bar.paidPct', { pct: Math.round((link.paid / link.value) * 100) }) : '')];
  if (c && c.paid) return [h('div', { class: 'cell-main num' }, money(c.paid.amount, c.paid.currency)), h('div', { class: 'cell-sub' }, t('pz.paidByBuyer'))];
  if (c && c.status !== 'active' && c.status !== 'terminated') return h('span', { class: 'tag' }, label('pzc.', c.status));
  return h('span', { class: 'tag nocontract' }, t('pz.notLinked'));
}

function tendersTable(rows, opts) {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, t('pz.none')), t('sigs.changeFilter'));
  const L = { p: t('pz.colProc'), org: t('col.org'), subj: t('col.subject'), m: t('pz.colMethod'), v: t('pz.colValue'), c: t('pz.colContract'), paid: t('pz.colPaid') };
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null, h('th', null, L.p), opts.showOrg && h('th', null, L.org), h('th', null, L.subj), h('th', null, L.m), h('th', { class: 'r' }, L.v), h('th', null, L.c), h('th', { class: 'r' }, L.paid))),
    h('tbody', null, rows.map((r) => {
      const t0 = r.t;
      const c = (t0.contracts || [])[0];
      const sup = c && (r.org.role === 'supplier' ? { name: t0.buyer_name } : (c.suppliers || [])[0]);
      const open = () => openTender(r.org, t0.tid);
      return h('tr', { class: 'click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
        td(L.p, null, h('div', { class: 'cell-main num' }, t0.tid), h('div', { class: 'cell-sub num' }, fdate(t0.date)), c && isTracked(c.id) ? h('span', { class: 'tag pz' }, t('tr.onControl')) : null),
        opts.showOrg && td(L.org, { class: 'w-party' }, r.org.name),
        td(L.subj, { class: 'w-text' }, h('div', { class: 'clamp' }, t0.title || '—'), t0.cpv ? h('div', { class: 'cell-sub clamp1' }, t0.cpv) : null),
        td(L.m, null, h('div', { class: 'cell-main' }, label('pzt.', t0.method)), pzStatus(t0.status)),
        td(L.v, { class: 'r num' }, t0.value ? money(t0.value.amount, t0.value.currency) : '—'),
        td(L.c, { class: 'w-party' }, c ? [h('div', { class: 'cell-main' }, '№ ' + (c.number || '—') + ((t0.contracts || []).length > 1 ? ` +${t0.contracts.length - 1}` : '')),
          h('div', { class: 'cell-sub' }, join([sup && sup.name, c.value ? money(c.value.amount, c.value.currency) : null]))] : h('span', { class: 'faint small' }, t('pz.noContractYet'))),
        td(L.paid, { class: 'r' }, c ? paidCell(c, r.links[0]) : h('span', { class: 'faint' }, '—')));
    }))));
}

function tenderCsv(rows) {
  const lines = [[t('col.org'), 'Prozorro ID', t('col.date'), t('col.subject'), 'CPV', t('pz.colMethod'), t('pz.status'), t('pz.colValue'),
    t('pz.contractNo'), t('pz.signed'), t('col.party'), t('f.edrpou'), t('pz.contractValue'), t('pz.treasuryPaid'), t('pz.payTerms')]];
  for (const r of rows) {
    const cs = r.t.contracts && r.t.contracts.length ? r.t.contracts : [null];
    cs.forEach((c, i) => {
      const s = c && (c.suppliers || [])[0];
      const link = r.links[i];
      lines.push([r.org.name, r.t.tid, r.t.date, r.t.title, r.t.cpv, label('pzt.', r.t.method), label('pzs.', r.t.status), dec(r.t.value && r.t.value.amount),
        c ? c.number : '', c ? c.signed : '', s ? s.name : '', s ? s.code : '', dec(c && c.value && c.value.amount), link ? dec(link.paid) : '',
        lotMilestones(r.t, c).filter((m) => m.type === 'financing').map(milestoneText).join('; ')]);
    });
  }
  return lines;
}

function tendersBrowser(orgs, preset) {
  const box = h('div', null, h('div', { class: 'empty' }, t('pz.loading')));
  const f = { which: preset || '', method: '', org: '', q: '', page: 0 };
  const list = h('div');
  let all = [];
  const tests = {
    contract: (r) => (r.t.contracts || []).length > 0,
    linked: (r) => r.links.some(Boolean),
    unlinked: (r) => (r.t.contracts || []).some((c, i) => ['active', 'terminated'].includes(c.status) && !r.links[i]),
    open: (r) => pzOpen(r.t),
    terms: (r) => (r.t.milestones || []).some((m) => m.type === 'financing'),
    tracked: (r) => (r.t.contracts || []).some((c) => isTracked(c.id)),
  };
  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = all.filter((r) => (!f.which || tests[f.which](r)) && (!f.method || r.t.method === f.method) && (!f.org || r.org.edrpou === f.org)
      && (!words.length || words.every((w) => [r.t.tid, r.t.title, r.t.cpv, r.t.buyer_name, ...(r.t.contracts || []).flatMap((c) => [c.number, ...(c.suppliers || []).flatMap((s) => [s.name, s.code])])].join(' ').toLowerCase().includes(w))));
    const sum = rows.reduce((acc, r) => acc + (r.t.contracts || []).reduce((s, c) => s + (c.value && c.value.currency === 'UAH' ? c.value.amount : 0), 0), 0);
    pagedList(list, rows, f.page, { showOrg: orgs.length > 1, sum, csv: 'prozorro-procedures', csvRows: (items, name) => csvDownload(tenderCsv(items), name) },
      (p) => { f.page = p; draw(); }, tendersTable);
  }
  (async () => {
    try {
      all = await tenderRows(orgs);
      if (!all.length) {
        const queued = orgs.reduce((s, o) => s + ((o.prozorro || {}).queue || 0), 0);
        fill(box, h('div', { class: 'card empty' }, h('b', null, t('pz.noData')), queued ? t('pz.queued', { n: ni.format(queued) }) : t('pz.noDataText')));
        return;
      }
      const methods = [...new Set(all.map((r) => r.t.method))].sort((a, b) => label('pzt.', a).localeCompare(label('pzt.', b)));
      const q = h('input', { class: 'input', type: 'search', placeholder: t('pz.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; f.page = 0; draw(); } });
      const n = (k) => all.filter(tests[k]).length;
      fill(box, h('div', { class: 'table-card' },
        h('div', { class: 'table-tools' },
          pills([['', t('ui.all'), all.length], ['contract', t('pz.fContract'), n('contract')], ['linked', t('pz.fLinked'), n('linked')],
            ['unlinked', t('pz.fUnlinked'), n('unlinked')], ['open', t('pz.fOpen'), n('open')], ['terms', t('pz.fTerms'), n('terms')], ['tracked', t('tr.onControl'), n('tracked')]].filter((p) => p[0] === '' || p[2]),
          f.which, (v) => { f.which = v; f.page = 0; draw(); }),
          select([['', t('pz.anyMethod')]].concat(methods.map((m) => [m, label('pzt.', m)])), '', (e) => { f.method = e.target.value; f.page = 0; draw(); }, t('pz.colMethod')),
          orgs.length > 1 ? select([['', t('ui.allOrgs')]].concat(orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; f.page = 0; draw(); }, t('ui.allOrgs')) : null,
          q),
        list));
      draw();
    } catch (e) {
      fill(box, h('div', { class: 'card empty' }, e.message));
    }
  })();
  return box;
}

function docList(docs, fresh) {
  if (!docs || !docs.length) return h('div', { class: 'muted small' }, t('pz.noDocs'));
  return h('div', { class: 'doc-list' }, docs.slice().reverse().map((d) => h('a', { class: 'doc', href: d.url, target: '_blank', rel: 'noopener noreferrer' },
    icon('file'), h('span', null, h('b', null, d.title || '—', fresh && fresh.has(d.id) ? h('span', { class: 'tag pz', style: 'margin-left:6px' }, t('tr.newDoc')) : null),
      h('small', null, join([d.type ? label('pzd.', d.type) : null, fdate(d.date)]))), icon('ext'))));
}

async function openTender(org, tid) {
  const body = sheet(h('div', { class: 'empty' }, t('pz.loading')));
  let rows;
  try {
    rows = await tenderRows([org]);
  } catch (e) {
    fill(body, h('div', { class: 'empty' }, e.message));
    return;
  }
  const r = rows.find((x) => x.t.tid === tid);
  if (!r) { fill(body, h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': t('ui.close') }, icon('x')), h('div', { class: 'empty' }, t('pz.notFound'))); return; }
  const t0 = r.t;
  const lots = t0.lots || {};
  const lotName = (id) => (Object.keys(lots).length > 1 && lots[id] ? lots[id] : null);
  const terms = (list) => h('div', { class: 'explain' }, list.map((m) => h('div', { class: m.type === 'financing' ? 'pay' : '' },
    h('b', null, label('pzm.type.', m.type) + '. '), h('span', null, milestoneText(m), lotName(m.lot) ? h('span', { class: 'faint' }, ' · ' + lotName(m.lot)) : null))));
  const contractBlock = (c, i) => {
    const link = r.links[i];
    const cterms = lotMilestones(t0, c).filter((m) => m.type === 'financing');
    return h('section', { class: 'pz-contract' },
      h('div', { class: 'chips', style: 'margin-top:0' }, h('span', { class: 'kind contract' }, kindOne('contract')), h('span', { class: 'pz-st ' + (c.status === 'active' || c.status === 'terminated' ? 'ok' : c.status === 'cancelled' ? 'off' : 'run') }, label('pzc.', c.status))),
      h('h3', null, c.number || c.signed ? t('dos.heading', { n: c.number || '—', date: fdate(c.signed) }) : t('pz.draftContract')),
      c.status !== 'cancelled' ? h('div', { class: 'row', style: 'margin:4px 0 6px' }, trackButton(org, t0, c)) : null,
      kv([
        [t('col.party'), (c.suppliers || []).map((s) => h('div', null, party(s.name, s.code)))],
        [t('pz.contractValue'), c.value ? money(c.value.amount, c.value.currency) + (c.value.vat === false ? ' ' + t('pz.noVat') : '') : null],
        [t('f.validity'), c.start || c.end ? `${fdate(c.start)} — ${fdate(c.end)}` : null],
        [t('pz.lot'), lotName(c.lot)],
        [t('pz.paidByBuyer'), c.paid ? money(c.paid.amount, c.paid.currency) : null],
        [t('pz.termination'), c.termination],
        ['ID', c.cid],
      ]),
      cterms.length ? h('div', { style: 'margin-top:10px' }, h('h4', null, t('pz.payTerms')), terms(cterms)) : null,
      link ? h('div', { class: 'pz-link' },
        h('div', null, h('h4', null, t('pz.treasury')), payBar(link)),
        h('button', { class: 'btn btn-sm btn-dark', onclick: () => openContract(org, link.id) }, t('pz.openDossier')))
        : h('p', { class: 'muted small' }, c.status === 'pending' ? t('pz.pendingHint') : t('pz.notLinkedHint')),
      (c.changes || []).length ? h('div', null, h('h4', null, t('pz.changes')), h('div', { class: 'timeline' }, c.changes.map((ch) => h('div', { class: 'ev add' },
        h('span', { class: 'd num' }, fdate(ch.date)), h('span', null, join([(ch.types || []).map((x) => label('pzr.', x)).join(', '), ch.text])), h('span'))))) : null,
      h('h4', null, t('pz.contractDocs')), docList(c.docs));
  };
  fill(body,
    h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': t('ui.close') }, icon('x')),
    h('div', { class: 'chips', style: 'margin-top:0' }, h('span', { class: 'kind pz' }, 'Prozorro'), pzStatus(t0.status), h('span', { class: 'tag' }, label('pzt.', t0.method))),
    h('h2', null, t0.title || t0.tid),
    h('div', { class: 'sub' }, join([t0.buyer_name || org.name, fdate(t0.date), t0.tid])),
    h('div', { class: 'money-row' },
      h('div', null, h('small', null, t('pz.colValue')), h('b', { class: 'num' }, t0.value ? mshort(t0.value.amount) : '—')),
      h('div', null, h('small', null, t('pz.contracted')), h('b', { class: 'num' }, mshort((t0.contracts || []).reduce((s, c) => s + (c.value ? c.value.amount : 0), 0)))),
      h('div', null, h('small', null, t('pz.treasuryPaid')), h('b', { class: 'num' }, r.links.some(Boolean) ? mshort(r.links.reduce((s, l) => s + (l ? l.paid : 0), 0)) : '—')),
      h('div', null, h('small', null, t('pz.bids')), h('b', { class: 'num' }, t0.bids != null ? ni.format(t0.bids) : '—'))),
    h('section', null, h('h3', null, t('pz.payTerms')), (t0.milestones || []).length ? terms(t0.milestones) : h('p', { class: 'muted small' }, t('pz.noTerms'))),
    (t0.contracts || []).length ? (t0.contracts || []).map(contractBlock) : h('section', null, h('p', { class: 'muted' }, t('pz.noContractYet'))),
    h('section', null, h('h3', null, t('pz.procedure')), kv([
      [t('pz.colMethod'), label('pzt.', t0.method)],
      [t('pz.status'), label('pzs.', t0.status)],
      [t('pz.published'), fdate(t0.date)],
      [t('pz.deadline'), t0.deadline ? fdate(t0.deadline) : null],
      [t('pz.category'), t0.category ? label('pzcat.', t0.category) : null],
      ['CPV', t0.cpv],
      [t('pz.rationale'), t0.rationale],
      [t('pz.cancelReason'), t0.cancel],
    ])),
    h('section', null, h('h3', null, t('pz.tenderDocs')), docList(t0.docs)),
    h('section', { class: 'row' }, ext(pzUrl(t0.tid), t('pz.openOnProzorro'))));
}

// ---- contracts on control -------------------------------------------------------------------
//
// Each user picks their own contracts (users/{uid}/tracked/{Prozorro contract id}) and may
// share one with another registered user (it lands in their users/{uid}/shared). GitHub
// Actions re-reads every picked contract each run and writes data/tracked/<id>.json: the
// contract, its procedure, payment stages, Treasury payments and the history of changes.
const myUid = () => (state.user && state.user.uid) || '';
const isTracked = (id) => state.mine.tracked.has(id);
const isSharedWithMe = (id) => !isTracked(id) && state.mine.shared.has(id);
const trackedRow = (id) => (state.trackedIndex.items || []).find((r) => r.key === id) || null;
function getTrackedSeen() { try { return localStorage.getItem('trackedSeen') || ''; } catch (e) { return ''; } }
function setTrackedSeen(v) { try { localStorage.setItem('trackedSeen', v); } catch (e) { /* not kept */ } }
const loadTracked = (id) => cached(`tracked:${id}:${ver()}`, () => getJSON(`data/tracked/${id}.json`, ver()));

// ---- copies on the user's own Google Drive ----
//
// Prozorro's file storage sends no CORS headers, so the page cannot download documents.
// An Apps Script web app does it instead: it runs as the user who opens it, so each
// user connects once and their own 6-hour trigger copies the documents of the contracts
// they follow into their own Drive (drive.file: it sees only the files it created).
const DRIVE_APP = 'https://script.google.com/macros/s/AKfycbyGE6qLrjHqN63qsgMfml0MjGbLBKaubOb66TOh3o7HiEY3cEW8OsG0Ha4BrroRlMTx/exec';
const DRIVE_FOLDER = 'Договори на контролі'; // inside «Монітор розрахунків», shared with the site's exports
const driveState = { connected: undefined, at: null };
async function loadDriveState() {
  if (!cloud || !state.user) return;
  try {
    driveState.at = await cloud.driveScriptConnected();
    driveState.connected = !!driveState.at;
  } catch (e) { driveState.connected = undefined; }
  softRender();
}
// With several Google accounts signed in, Google cannot pick one for a web app and shows
// "Unable to open the file"; the /u/N/ form opens it under the N-th account of the browser.
// The account number picked once (several Google accounts in one browser) is reused.
function driveAccount() { try { const v = localStorage.getItem('driveAcc'); return v == null || v === '' ? null : Number(v); } catch (e) { return null; } }
const driveBase = (n) => (n == null ? DRIVE_APP : DRIVE_APP.replace('/macros/s/', `/macros/u/${n}/s/`));
const driveAppUrl = (n) => driveBase(n) + '?uid=' + encodeURIComponent(myUid()) + '&lang=' + LANG;
// The script's page for one contract: copy its documents now (copy) or list its folder (open).
function driveAction(action, cid) {
  window.open(driveBase(driveAccount()) + '?action=' + action + '&cid=' + encodeURIComponent(cid) + '&lang=' + LANG, '_blank', 'noopener');
}
function connectDrive(n) {
  if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
  if (typeof n === 'number') { try { localStorage.setItem('driveAcc', String(n)); } catch (e) { /* not kept */ } }
  window.open(driveAppUrl(typeof n === 'number' ? n : driveAccount()), '_blank', 'noopener');
  cloud.markDriveScript().then(() => { driveState.connected = true; driveState.at = new Date(); softRender(); }).catch(() => {});
}
const driveFolderLink = (label, cls) => ext('https://drive.google.com/drive/search?q=' + encodeURIComponent('"' + DRIVE_FOLDER + '"'), label, cls);
// A short call to action where it matters, nothing once the Drive is connected.
function driveBanner() {
  if (driveState.connected !== false) return null;
  return h('div', { class: 'notice drive-notice section' }, icon('cloud'),
    h('div', null, h('b', null, t('gs.bannerTitle')), h('div', { class: 'small' }, t('gs.bannerText'))),
    h('button', { class: 'btn btn-dark btn-sm', onclick: connectDrive }, t('gs.connect')));
}
// The Drive block in Settings: connect the Drive (and pick the account when several are signed in).
function driveCard() {
  const on = driveState.connected;
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('tr.drive')),
      h('div', { class: 'row' }, on ? driveFolderLink(t('tr.openDrive'), 'btn btn-sm') : null,
        h('button', { class: 'btn btn-sm' + (on ? '' : ' btn-dark'), onclick: connectDrive }, icon('drive'), on ? t('gs.reconnect') : t('gs.connect')))),
    h('p', { class: 'muted small' }, on ? t('gs.onText') : t('gs.lead')),
    on && driveState.at ? h('p', { class: 'faint small' }, t('gs.connectedAt', { at: ftime(driveState.at) })) : null,
    h('details', { class: 'multi-acc' }, h('summary', null, t('gs.multiTitle')),
      h('p', { class: 'muted small' }, t('gs.multiText')),
      h('div', { class: 'row' }, [0, 1, 2, 3].map((n) => h('button', { class: 'btn btn-sm', onclick: () => connectDrive(n) }, t('gs.account', { n: n + 1 }))))));
}

// "Take on control" for one Prozorro contract (c) of a procedure (t0) seen from an organisation.
function trackButton(org, t0, c) {
  if (!c || !c.id) return null;
  if (isTracked(c.id)) return h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + c.id, onclick: closeSheet }, icon('star'), t('tr.onControl'));
  const btn = h('button', {
    class: 'btn btn-sm btn-dark',
    onclick: async () => {
      if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
      btn.disabled = true;
      const sup = (c.suppliers || [])[0] || {};
      try {
        await cloud.track(c.id, { org: org.edrpou, tid: t0.tid, sp: c.sp || '', title: c.title || t0.title || '', number: c.number || '', buyer: t0.buyer_name || (org.role !== 'supplier' ? org.name : ''), supplier: sup.name || '' });
        if (driveState.connected === false) toast(t('tr.addedNoDrive'), { sticky: true, action: { label: t('gs.connect'), run: connectDrive } });
        else toast(t('tr.added'));
        btn.replaceWith(h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + c.id, onclick: closeSheet }, icon('star'), t('tr.onControl')));
      } catch (e) {
        btn.disabled = false;
        toast(t('tr.failed') + ' ' + (e.message || ''), { bad: true });
      }
    },
  }, icon('star'), t('tr.take'));
  return btn;
}

// What the history entry says, in the reader's language.
function eventText(e) {
  const cs = (s) => label('pzc.', s) || '—';
  switch (e.type) {
    case 'tracked': return t('ev.tracked');
    case 'status': return t('ev.status', { old: cs(e.old), new: cs(e.new) });
    case 'tender_status': return t('ev.tenderStatus', { old: label('pzs.', e.old) || '—', new: label('pzs.', e.new) || '—' });
    case 'value': return t('ev.value', { old: money(e.old), new: money(e.new) });
    case 'end': return t('ev.end', { old: fdate(e.old), new: fdate(e.new) });
    case 'change': return t('ev.change') + ': ' + join([(e.types || []).map((x) => label('pzr.', x)).join(', '), e.text]);
    case 'doc': return (e.updated ? t('ev.docUpdated') : t('ev.doc')) + ': ' + join([e.title, e.doc_type ? label('pzd.', e.doc_type) : null]);
    case 'payment': return (e.sure ? t('ev.payment') : t('ev.paymentMaybe')) + ' ' + money(e.amount) + (e.date ? ' · ' + fdate(e.date) : '');
    case 'act': return t('ev.act', { n: e.number || '—' }) + ' ' + money(e.amount) + (e.date ? ' · ' + fdate(e.date) : '');
    case 'due': return t('ev.due', { sum: money(e.amount) }) + (e.overdue > 1 ? ' · ' + t('tr.overdueN', { sum: money(e.overdue) }) : '');
    default: return e.type;
  }
}
const eventClass = (e) => ({ payment: 'pay', change: 'add', value: 'add', end: 'add', doc: 'act', act: 'act', due: 'add' }[e.type] || '');
// Kinds of change a user filters by.
const EVENT_GROUPS = { pay: ['payment', 'due'], docs: ['doc', 'act'], terms: ['change', 'value', 'end'], status: ['status', 'tender_status'] };
const eventGroup = (e) => Object.keys(EVENT_GROUPS).find((g) => EVENT_GROUPS[g].includes(e.type)) || '';
function eventPills(events, value, onpick) {
  const n = (g) => events.filter((e) => eventGroup(e) === g).length;
  return pills([['', t('ui.all'), events.length], ['pay', t('evg.pay'), n('pay')], ['docs', t('evg.docs'), n('docs')], ['terms', t('evg.terms'), n('terms')], ['status', t('evg.status'), n('status')]]
    .filter((x) => x[0] === '' || x[2] || x[0] === value), value, onpick);
}
const eventSub = (e) => (e.type === 'payment' && e.purpose ? h('div', { class: 'cell-sub clamp1' }, e.purpose) : null);

function trackedBar(tt, acts) {
  const base = Math.max(tt.value || 0, tt.paid || 0, acts || 0) || 1;
  return h('div', { class: 'bar' + (tt.value && tt.paid > tt.value + 1 ? ' over' : '') },
    acts ? h('i', { class: 'acts', style: `width:${Math.min(100, (acts / base) * 100)}%` }) : null,
    h('i', { style: `width:${Math.min(100, ((tt.paid || 0) / base) * 100)}%` }));
}

function trackedPage(preset) {
  const seen = getTrackedSeen();
  const byDate = (a, b) => ((b.row && b.row.changed_at) || '9').localeCompare((a.row && a.row.changed_at) || '9') || (b.pick.addedAt || b.pick.at || 0) - (a.pick.addedAt || a.pick.at || 0);
  const own = [...state.mine.tracked.entries()].map(([id, v]) => ({ id, pick: v, row: trackedRow(id), mine: true })).sort(byDate);
  const shared = [...state.mine.shared.entries()].filter(([id]) => !isTracked(id)).map(([id, v]) => ({ id, pick: v, row: trackedRow(id), mine: false })).sort(byDate);
  const scopes = ['mine', 'shared'];
  const f = { which: scopes.includes(preset) ? '' : preset || '', q: '', scope: scopes.includes(preset) ? preset : (!own.length && shared.length ? 'shared' : 'mine') };
  const inScope = () => (f.scope === 'shared' ? shared : own);
  const sum = (k) => inScope().reduce((acc, r) => acc + ((r.row && r.row.totals && r.row.totals[k]) || 0), 0);
  const list = h('div');
  const tests = {
    left: (r) => r.row && r.row.totals.left > 1,
    overdue: (r) => r.row && r.row.totals.overdue > 1,
    changed: (r) => r.row && r.row.changed_at > seen && (r.row.last_event || {}).type !== 'tracked',
    pending: (r) => !r.row,
    eib: (r) => r.row && r.row.eib,
  };
  function draw() {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = inScope().filter((r) => (!f.which || tests[f.which](r))
      && (!words.length || words.every((w) => [r.pick.number, r.pick.title, r.pick.buyer, r.pick.supplier, r.pick.tid, r.row && r.row.buyer_name, r.row && r.row.supplier_name].join(' ').toLowerCase().includes(w))));
    const none = f.scope === 'shared' ? [t('tr.sharedEmptyTitle'), t('tr.sharedEmptyText')] : [t('tr.emptyTitle'), t('tr.emptyText')];
    fill(list, shown.length ? h('div', { class: 'tr-list' }, shown.map(trackedCard)) : h('div', { class: 'card empty' }, h('b', null, inScope().length ? t('pz.none') : none[0]), inScope().length ? t('sigs.changeFilter') : none[1]));
    fill(filters, pills([['', t('ui.all'), inScope().length], ['left', t('tr.fLeft'), n('left')], ['overdue', t('tr.fOverdue'), n('overdue')], ['changed', t('tr.fChanged'), n('changed')], ['eib', t('eib.short'), n('eib')], ['pending', t('tr.pending'), n('pending')]].filter((p) => p[0] === '' || p[2] || p[0] === f.which),
      f.which, (v) => { f.which = v; draw(); }));
    fillHead();
  }
  function trackedCard(r) {
    const x = r.row, p = r.pick, tt = (x && x.totals) || {};
    const fresh = x && tests.changed(r);
    return h('a', { class: 'tr-card' + (fresh ? ' new' : ''), href: '#/tracked/' + r.id },
      h('div', { class: 'chips', style: 'margin:0' },
        x ? h('span', { class: 'pz-st ' + (x.status === 'active' ? 'ok' : x.status === 'terminated' ? 'off' : 'run') }, label('pzc.', x.status)) : h('span', { class: 'chip warn' }, h('i'), t('tr.pending')),
        tt.overdue > 1 ? h('span', { class: 'sev high' }, t('tr.overdueN', { sum: mshort(tt.overdue) })) : null,
        fresh ? h('span', { class: 'tag pz' }, t('tr.newEvents')) : null,
        x && x.eib ? h('span', { class: 'tag eib' }, t('eib.short')) : null,
        x && x.error ? h('span', { class: 'sev medium', title: x.error }, t('tr.error')) : null),
      h('h3', null, (x ? x.number : p.number) && (x ? x.number : p.number) !== '—' ? t('dos.heading', { n: x ? x.number : p.number, date: fdate(x && x.signed) }) : t('pz.draftContract')),
      h('div', { class: 'cell-sub' }, join([(x && x.buyer_name) || p.buyer, (x && x.supplier_name) || p.supplier], ' → ')),
      h('div', { class: 'clamp muted small' }, (x && x.title) || p.title || ''),
      !r.mine ? h('div', { class: 'faint small' }, t('tr.sharedBy', { who: p.fromName || '—' })) : null,
      x ? [h('div', { class: 'facts' },
        h('div', null, h('small', null, t('pz.contractValue')), h('b', { class: 'num' }, mshort(tt.value))),
        h('div', null, h('small', null, t('tr.paid')), h('b', { class: 'num' }, mshort(tt.paid))),
        h('div', { class: tt.left < -1 ? 'bad' : '' }, h('small', null, tt.left < -1 ? t('dos.overpaid') : t('tr.left')), h('b', { class: 'num' }, mshort(Math.abs(tt.left))))),
      trackedBar(tt, 0),
      x.last_event && x.last_event.type ? h('div', { class: 'cell-sub' }, fdate(x.changed_at) + ' · ' + eventText(x.last_event)) : null]
        : h('p', { class: 'muted small' }, t('tr.pendingText')));
  }
  const q = h('input', { class: 'input', type: 'search', placeholder: t('tr.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; draw(); } });
  const n = (k) => inScope().filter(tests[k]).length;
  const tiles = h('div', { class: 'tiles section' });
  const filters = h('div');
  function fillHead() {
    fill(tiles,
      h('div', { class: 'stat tint-violet' }, h('small', null, t('tr.tContracts')), h('b', { class: 'num' }, ni.format(inScope().length))),
      h('div', { class: 'stat' }, h('small', null, t('tr.tValue')), h('b', { class: 'num' }, mshort(sum('value')))),
      h('div', { class: 'stat tint-blue' }, h('small', null, t('tr.paid')), h('b', { class: 'num' }, mshort(sum('paid')))),
      h('div', { class: 'stat tint-yellow' }, h('small', null, t('tr.left')), h('b', { class: 'num' }, mshort(sum('left'))), sum('overdue') > 1 ? h('span', { class: 'sub' }, t('tr.overdueN', { sum: mshort(sum('overdue')) })) : null));
  }
  const scope = shared.length ? pills([['mine', t('tr.mine'), own.length], ['shared', t('tr.sharedTab'), shared.length]], f.scope, (v) => { f.scope = v; f.which = ''; draw(); }) : null;
  draw();
  return [
    pageHead(t('tr.eyebrow'), titleGrad(t('tr.title1'), t('tr.title2')), null, scope),
    driveBanner(),
    tiles,
    h('div', { class: 'table-card section' }, h('div', { class: 'table-tools' }, filters, q), list),
  ];
}

function trackedDossier(id) {
  const box = h('div', null, h('div', { class: 'card empty' }, t('ui.loading')));
  const pick = state.mine.tracked.get(id) || state.mine.shared.get(id);
  const sharedPick = isSharedWithMe(id) ? state.mine.shared.get(id) : null;
  (async () => {
    let s = null;
    if (pick && trackedRow(id)) {  // only one's own contracts and those shared with one
      try { s = await loadTracked(id); } catch (e) { /* not written yet */ }
    }
    if (!s) {
      fill(box, h('div', { class: 'card pad' },
        h('h2', { class: 'card-title' }, pick ? (pick.number ? '№ ' + pick.number : t('pz.draftContract')) : t('tr.unknown')),
        pick ? h('p', { class: 'muted' }, join([pick.buyer, pick.supplier], ' → ')) : null,
        sharedPick ? h('p', { class: 'small' }, t('tr.sharedBy', { who: sharedPick.fromName || '—' })) : null,
        h('p', null, pick ? t('tr.pendingText') : t('tr.unknownText')),
        h('div', { class: 'row after' },
          pick && pick.tid ? ext(pzUrl(pick.tid), t('pz.openOnProzorro')) : null,
          sharedPick ? h('button', { class: 'btn btn-sm', onclick: async () => {
            if (!confirm(t('tr.removeSharedConfirm'))) return;
            try { await cloud.removeShared(id); location.hash = '#/tracked/shared'; } catch (e) { toast(e.message, { bad: true }); }
          } }, t('tr.removeShared')) : null,
          isTracked(id) ? h('button', { class: 'btn btn-sm', onclick: async () => {
            if (!confirm(t('tr.offConfirm'))) return;
            try { await cloud.untrack(id); location.hash = '#/tracked'; } catch (e) { toast(e.message, { bad: true }); }
          } }, t('tr.off')) : null)));
      return;
    }
    const c = s.contract, t0 = s.tender, tt = s.totals;
    const org = orgByCode(s.org);
    const sure = s.payments.filter((p) => p.sure), maybe = s.payments.filter((p) => !p.sure);
    const note = h('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: t('tr.noteHint') });
    note.value = (pick && pick.note) || '';
    const saveNote = h('button', {
      class: 'btn btn-sm', onclick: async () => {
        try { await cloud.setTrackedNote(id, note.value.trim()); toast(t('rv.saved')); } catch (e) { toast(e.message, { bad: true }); }
      },
    }, icon('check'), t('ui.save'));
    const off = h('button', {
      class: 'btn btn-sm', onclick: async () => {
        if (!confirm(t('tr.offConfirm'))) return;
        try { await cloud.untrack(id); toast(t('tr.offDone')); location.hash = '#/tracked'; } catch (e) { toast(e.message, { bad: true }); }
      },
    }, t('tr.off'));
    const payTable = (list) => h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', { class: 'r' }, t('col.amount')), h('th', null, t('f.purpose')))),
      h('tbody', null, list.map((p) => h('tr', { class: 'click', tabindex: 0, onclick: () => openPayment(p, org), onkeydown: (e) => { if (e.key === 'Enter') openPayment(p, org); } },
        td(t('col.date'), { class: 'num' }, fdate(p.date)),
        td(t('col.amount'), { class: 'r num' }, money(p.amount)),
        td(t('f.purpose'), { class: 'w-text' }, h('div', { class: 'clamp' }, p.purpose || '—'), p.kekv ? h('div', { class: 'cell-sub' }, t('f.kekv') + ' ' + p.kekv) : null))))));
    const stageRows = (s.stages || []).map((st) => h('div', { class: 'pay' },
      h('span', null, h('b', null, milestoneText(Object.assign({ type: 'financing' }, st)) + '. '),
        t('tr.stageAmount', { sum: money(st.amount) }),
        st.due ? ' · ' + t('tr.stageDue', { date: fdate(st.due) }) : '',
        st.due_now ? ' · ' + t('tr.stageDueNow', { sum: money(st.due_now) }) : '',
        !st.due && st.event !== 'signingTheContract' && !(s.acts || []).length ? h('div', { class: 'cell-sub' }, t('tr.noActs')) : null)));
    const delivery = (t0.milestones || []).filter((m) => m.type !== 'financing' && (!m.lot || !c.lot || m.lot === c.lot));
    const seen = getTrackedSeen();
    const freshDocs = new Set((s.history || []).filter((e) => e.type === 'doc' && e.at > seen && e.id).map((e) => e.id));
    const funders = (t0.funders || []).map((x) => x.name).filter(Boolean);
    const isEib = (t0.funders || []).some((x) => x.code === '33000');
    const events = (s.history || []).filter((e) => e.type !== 'tracked');
    const hist = h('div');
    const histPills = h('div');
    const drawHistory = (g) => {
      const shown = events.filter((e) => !g || eventGroup(e) === g);
      fill(histPills, events.length ? eventPills(events, g, drawHistory) : null);
      fill(hist, shown.length ? h('div', { class: 'timeline' }, shown.map((e) => h('div', { class: 'ev ' + eventClass(e) + (e.at > seen ? ' new' : '') },
        h('span', { class: 'd num' }, fdate(e.at)), h('span', null, eventText(e), eventSub(e)), h('span')))) : h('p', { class: 'muted small' }, t('dos.noEvents')));
    };
    drawHistory('');
    fill(box,
      h('div', { class: 'org-head' },
        h('div', null,
          h('div', { class: 'eyebrow' }, h('a', { href: sharedPick ? '#/tracked/shared' : '#/tracked', style: 'text-decoration:none' }, '← ' + (sharedPick ? t('tr.sharedTab') : t('nav.tracked')))),
          h('h1', { class: 'org-title' }, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
          h('div', { class: 'chips' },
            h('span', { class: 'pz-st ' + (c.status === 'active' ? 'ok' : 'run') }, label('pzc.', c.status)),
            h('span', { class: 'tag' }, label('pzt.', t0.method)),
            isEib ? h('span', { class: 'tag eib' }, t('eib.short')) : null,
            tt.overdue > 1 ? h('span', { class: 'sev high' }, t('tr.overdueN', { sum: money(tt.overdue) })) : null,
            s.error ? h('span', { class: 'sev medium', title: s.error }, t('tr.error')) : null),
          h('p', { class: 'muted' }, c.title || t0.title),
          funders.length ? h('p', { class: 'small' }, t('eib.funders') + ': ' + funders.join(', ')) : null),
        h('div', { class: 'org-actions' }, h('div', { class: 'row' },
          org && (org.files || {}).prozorro ? h('button', { class: 'btn', onclick: () => openTender(org, s.tid) }, t('pz.openProcedure')) : null,
          org && s.sp ? h('button', { class: 'btn', onclick: () => openContract(org, s.sp) }, t('pz.openDossier')) : null,
          ext(pzUrl(s.tid), 'Prozorro', 'btn')),
          isTracked(id) ? off : null)),
      partiesCard(t0, c),
      h('div', { class: 'tiles section' },
        h('div', { class: 'stat tint-violet' }, h('small', null, t('pz.contractValue')), h('b', { class: 'num' }, money(tt.value)), c.start || c.end ? h('span', { class: 'sub' }, `${fdate(c.start)} — ${fdate(c.end)}`) : null),
        h('div', { class: 'stat tint-blue' }, h('small', null, t('tr.paid')), h('b', { class: 'num' }, money(tt.paid)), h('span', { class: 'sub' }, tt.value ? t('bar.paidPct', { pct: Math.round((tt.paid / tt.value) * 100) }) : '')),
        h('div', { class: 'stat tint-yellow' }, h('small', null, tt.left < -1 ? t('dos.overpaid') : t('tr.left')), h('b', { class: 'num' }, money(Math.abs(tt.left))), tt.maybe ? h('span', { class: 'sub' }, t('tr.maybeSub', { sum: money(tt.maybe) })) : null),
        h('div', { class: 'stat' + (tt.overdue > 1 ? ' bad' : '') }, h('small', null, t('tr.dueNow')), h('b', { class: 'num' }, money(tt.due_now)), h('span', { class: 'sub' }, tt.overdue > 1 ? t('tr.overdueN', { sum: money(tt.overdue) }) : t('tr.noOverdue')))),
      h('div', { class: 'card pad section' }, trackedBar(tt, s.acts_sum), h('div', { class: 'bar-label' }, h('span', null, t('tr.paidOf', { paid: money(tt.paid), value: money(tt.value) })), h('span', null, s.acts_sum ? t('tr.actsSum', { sum: money(s.acts_sum) }) : ''))),
      h('div', { class: 'grid-2 section' },
        h('div', { class: 'card pad' },
          h('h2', { class: 'card-title' }, t('tr.stages')),
          stageRows.length ? h('div', { class: 'explain' }, stageRows) : h('p', { class: 'muted small' }, t('pz.noTerms')),
          delivery.length ? h('div', { class: 'explain', style: 'margin-top:8px' }, delivery.map((m) => h('div', null, h('span', null, h('b', null, label('pzm.type.', m.type) + '. '), milestoneText(m))))) : null),
        h('div', { class: 'card pad' },
          h('h2', { class: 'card-title' }, t('tr.history')), histPills, hist)),
      h('div', { class: 'table-card section' },
        h('div', { class: 'table-tools' }, h('b', null, t('tr.payments'))),
        sure.length ? payTable(sure) : h('div', { class: 'empty' }, t('dos.noPayments')),
        maybe.length ? [h('div', { class: 'table-tools' }, h('b', null, t('tr.maybe')), h('span', { class: 'faint small' }, t('tr.maybeHelp'))), payTable(maybe)] : null),
      (s.acts || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('kinds.act')),
        h('div', { class: 'timeline' }, s.acts.map((a) => h('div', { class: 'ev act' }, h('span', { class: 'd num' }, fdate(a.date)), h('span', null, t('kind.act') + ' № ' + (a.number || '—')), h('span', { class: 'num' }, money(a.amount)))))) : null,
      docsCard(id, c, t0, freshDocs),
      isTracked(id) ? shareCard(id) : null,
      isTracked(id) ? h('div', { class: 'card pad section' },
        h('h2', { class: 'card-title' }, t('tr.note')),
        h('div', { class: 'review-form' }, h('label', { class: 'field grow' }, note), saveNote),
        h('p', { class: 'muted small' }, join([pick && pick.addedAt ? t('tr.addedAt', { at: ftime(pick.addedAt) }) : null, s.payments_checked ? t('tr.checked', { at: fdate(s.payments_checked) }) : null])))
        : h('div', { class: 'card pad section' },
          h('h2', { class: 'card-title' }, t('tr.sharedTab')),
          h('p', { class: 'muted' }, sharedPick ? t('tr.sharedBy', { who: sharedPick.fromName || '—' }) + (sharedPick.at ? ' · ' + ftime(sharedPick.at) : '') : ''),
          h('div', { class: 'row after' },
            trackButton(org || { edrpou: s.org }, { tid: s.tid, title: t0.title, buyer_name: t0.buyer_name }, c),
            sharedPick ? h('button', { class: 'btn btn-sm', onclick: async () => {
              if (!confirm(t('tr.removeSharedConfirm'))) return;
              try { await cloud.removeShared(id); location.hash = '#/tracked/shared'; } catch (e) { toast(e.message, { bad: true }); }
            } }, t('tr.removeShared')) : null)));
  })();
  return box;
}

// The two sides of a contract and whether each organisation is on monitoring (its own
// contracts, payments and procurement in the app), apart from this one contract on control.
function partiesCard(t0, c) {
  const sup = (c.suppliers || [])[0] || {};
  const side = (key, name, code, role) => {
    const on = !!code && state.mine.orgs.has(code);
    const add = h('button', { class: 'btn btn-sm', onclick: async () => {
      add.disabled = true;
      try { await cloud.addOrg(code, name, role); toast(t('addorg.addedNow', { name: name || code })); } catch (e) { add.disabled = false; toast(e.message, { bad: true }); }
    } }, icon('building'), t('org.addMonitor'));
    return h('div', { class: 'party' },
      h('small', null, t(key)),
      h('b', null, name || '—'),
      code ? h('div', { class: 'cell-sub num' }, t('f.edrpou') + ' ' + code) : null,
      h('div', { class: 'row' },
        on ? h('span', { class: 'tag ok' }, t('org.monitoring')) : null,
        on && orgByCode(code) ? h('a', { class: 'btn btn-sm', href: '#/org/' + code }, t('org.open'), icon('arrow')) : null,
        !on && realCode(code) ? add : null));
  };
  return h('div', { class: 'card pad section parties' },
    side('dos.buyer', t0.buyer_name, t0.buyer, 'buyer'),
    side('dos.supplier', sup.name, sup.code, 'supplier'));
}

// Documents of the contract in the same three parts as its folder on Google Drive.
const isChangeDoc = (d) => d.type === 'contractAnnexe' || /(^|[^а-яіїєґ])(ду(?=[\s\d№_.-])|д\/у|дод\.?\s*угод|додатков|змін)/i.test(d.title || '');
function docsCard(id, c, t0, fresh) {
  const parts = [
    ['contract', (c.docs || []).filter((d) => !isChangeDoc(d))],
    ['changes', (c.docs || []).filter(isChangeDoc)],
    ['tender', t0.docs || []],
  ];
  const on = driveState.connected;
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('dos.docs')),
      h('div', { class: 'row' },
        on ? [h('button', { class: 'btn btn-sm', onclick: () => driveAction('open', id) }, icon('drive'), t('drv.contractFolder')),
          h('button', { class: 'btn btn-sm btn-dark', onclick: () => driveAction('copy', id) }, icon('refresh'), t('drv.copyNow'))]
          : h('button', { class: 'btn btn-sm btn-dark', onclick: connectDrive }, icon('drive'), t('gs.connect')))),
    h('p', { class: 'muted small' }, on ? t('drv.note') : t('gs.lead')),
    h('div', { class: 'grid-3' }, parts.map(([k, list]) => h('div', { class: 'drive-part' },
      h('div', { class: 'drive-part-title' }, t('drv.part.' + k), h('span', { class: 'count' }, list.length)),
      docList(list, fresh)))));
}

// A payment's full Treasury record.
async function openPayment(p, org) {
  let data = p.tx;
  if (!data && org) {
    try { const [rec] = await findRecords(org, 'transaction', [p.id]); data = rec && rec.data; } catch (e) { /* not loaded */ }
  }
  openRecord({ kind: 'transaction', date: p.date, amount: p.amount, currency: 'UAH', cp_name: (data && data.recipt_name) || null,
    data: data || { trans_date: p.date, payment_details: p.purpose, kekv: p.kekv } });
}

// Who else sees this contract: share it by e-mail with another registered user.
function shareCard(id) {
  const t1 = state.mine.tracked.get(id) || {};
  const email = h('input', { class: 'input', type: 'email', placeholder: t('tr.shareHint'), autocomplete: 'off', 'aria-label': t('tr.shareHint') });
  const msg = h('p', { class: 'small', role: 'status' });
  const send = h('button', { class: 'btn btn-dark btn-sm', type: 'submit' }, t('tr.share'));
  const form = h('form', { class: 'add-form', onsubmit: async (e) => {
    e.preventDefault();
    const v = email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { fill(msg, t('tr.shareBad')); return; }
    send.disabled = true;
    try {
      const to = await cloud.share(id, v);
      email.value = '';
      fill(msg, t('tr.shareDone', { who: to.name || v }));
    } catch (err) {
      fill(msg, err.code === 'not-found' ? t('tr.shareNotFound') : err.code === 'self' ? t('tr.shareSelf') : t('tr.shareFailed') + ' ' + (err.message || ''));
    } finally { send.disabled = false; }
  } }, email, send);
  const list = (t1.sharedWith || []);
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, t('tr.shareTitle')),
    h('p', { class: 'muted' }, t('tr.shareText')),
    form, msg,
    list.length ? h('div', { class: 'share-list' }, list.map((w) => h('div', { class: 'share-row' },
      h('span', null, h('b', null, w.name || w.email), w.name ? h('span', { class: 'faint small' }, ' ' + w.email) : null),
      h('button', { class: 'btn btn-sm', onclick: async () => {
        try { await cloud.unshare(id, w.uid); toast(t('tr.unshared')); } catch (e) { toast(e.message, { bad: true }); }
      } }, t('tr.unshare'))))) : h('p', { class: 'faint small' }, t('tr.notShared')));
}

// ---- procurements financed by the European Investment Bank, across all of Prozorro ----

const loadEib = () => cached('eib:' + ver(), () => getJSON('data/eib.json', ver()));
const eibOrg = (t0) => ({ edrpou: t0.buyer || '', name: t0.buyer_name || '', role: 'buyer' });

function openEibTender(t0) {
  const funders = (t0.funders || []).map((x) => x.name).filter(Boolean);
  sheet(
    h('div', { class: 'eyebrow' }, t0.tid),
    h('h2', null, t0.title || '—'),
    h('div', { class: 'chips' }, pzStatus(t0.status), h('span', { class: 'tag' }, label('pzt.', t0.method)),
      h('span', { class: 'tag eib' }, t0.eib === 'funder' ? t('eib.byFunder') : t('eib.byText'))),
    kv([[t('eib.buyer'), party(t0.buyer_name, t0.buyer)], [t('eib.region'), t0.region], [t('eib.funders'), funders.join(', ')],
      [t('pz.colValue'), t0.value ? money(t0.value.amount, t0.value.currency) : ''], [t('col.date'), fdate(t0.date)], ['CPV', t0.cpv]]),
    (t0.terms || []).length ? h('section', null, h('h3', null, t('tr.stages')), h('div', { class: 'explain' }, t0.terms.map((m) => h('div', { class: 'pay' }, h('span', null, milestoneText(m)))))) : null,
    h('section', null, h('h3', null, t('kinds.contract')),
      (t0.contracts || []).length ? h('div', { class: 'tr-list eib-list' }, t0.contracts.map((c) => h('div', { class: 'tr-card' },
        h('div', { class: 'chips', style: 'margin:0' }, h('span', { class: 'pz-st ' + (c.status === 'active' ? 'ok' : c.status === 'terminated' ? 'off' : 'run') }, label('pzc.', c.status))),
        h('b', { style: 'font-size:16px' }, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
        h('div', { class: 'cell-sub' }, (c.suppliers || []).map((x) => party(x.name, x.code)).join(', ')),
        h('div', { class: 'facts' },
          h('div', null, h('small', null, t('pz.contractValue')), h('b', { class: 'num' }, c.value ? money(c.value.amount, c.value.currency) : '—')),
          h('div', null, h('small', null, t('eib.term')), h('b', null, c.start || c.end ? `${fdate(c.start)} — ${fdate(c.end)}` : '—')),
          h('div', null, h('small', null, t('eib.changes')), h('b', { class: 'num' }, ni.format(c.changes || 0)))),
        h('div', { class: 'row', style: 'margin-top:10px' }, trackButton(eibOrg(t0), t0, c)))))
        : h('p', { class: 'muted small' }, t('pz.noContractYet'))),
    h('div', { class: 'row after' }, ext(pzUrl(t0.tid), t('pz.openOnProzorro'))));
}

function eibTable(rows) {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, t('pz.none')), t('sigs.changeFilter'));
  const L = { c: t('pz.colContract'), b: t('eib.buyer'), s: t('eib.supplier'), subj: t('col.subject'), v: t('col.amount') };
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null, h('th', null, L.c), h('th', null, L.b), h('th', null, L.s), h('th', null, L.subj), h('th', { class: 'r' }, L.v), h('th'))),
    h('tbody', null, rows.map(({ t: t0, c }) => {
      const open = () => openEibTender(t0);
      return h('tr', { class: 'click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
        td(L.c, null, c ? [h('div', { class: 'cell-main' }, '№ ' + (c.number || '—')), h('div', { class: 'cell-sub num' }, fdate(c.signed)), h('span', { class: 'pz-st ' + (c.status === 'active' ? 'ok' : c.status === 'terminated' ? 'off' : 'run') }, label('pzc.', c.status))]
          : [h('div', { class: 'cell-main num' }, t0.tid), pzStatus(t0.status)]),
        td(L.b, { class: 'w-party' }, h('div', { class: 'cell-main' }, t0.buyer_name || '—'), h('div', { class: 'cell-sub' }, t0.region || '')),
        td(L.s, { class: 'w-party' }, c ? (c.suppliers || []).map((x) => x.name).join(', ') || '—' : h('span', { class: 'faint small' }, t('pz.noContractYet'))),
        td(L.subj, { class: 'w-text' }, h('div', { class: 'clamp' }, (c && c.title) || t0.title || '—'), t0.eib === 'text' ? h('span', { class: 'tag' }, t('eib.byText')) : null),
        td(L.v, { class: 'r num' }, c && c.value ? money(c.value.amount, c.value.currency) : t0.value ? money(t0.value.amount, t0.value.currency) : '—'),
        td('', { class: 'r', onclick: (e) => e.stopPropagation() }, c ? trackButton(eibOrg(t0), t0, c) : null));
    }))));
}

function eibCsv(rows) {
  const head = ['Procedure', 'Status', 'Buyer EDRPOU', 'Buyer', 'Region', 'Contract №', 'Signed', 'Contract status', 'Supplier EDRPOU', 'Supplier', 'Subject', 'Amount', 'EIB'];
  return [head].concat(rows.map(({ t: t0, c }) => [t0.tid, t0.status, t0.buyer, t0.buyer_name, t0.region, c ? c.number : '', c ? c.signed : '', c ? c.status : '',
    c ? (c.suppliers || []).map((x) => x.code).join(' ') : '', c ? (c.suppliers || []).map((x) => x.name).join('; ') : '', (c && c.title) || t0.title,
    dec(c && c.value ? c.value.amount : t0.value ? t0.value.amount : ''), t0.eib]));
}

function eibPage() {
  const box = h('div', null, h('div', { class: 'card empty' }, t('ui.loading')));
  const f = { which: 'contracts', kind: '', region: '', q: '', page: 0 };
  (async () => {
    let data;
    try { data = await loadEib(); } catch (e) { data = null; }
    if (!data || !(data.items || []).length) { fill(box, h('div', { class: 'card empty' }, h('b', null, t('eib.noData')), t('pz.noDataText'))); return; }
    const all = data.items.flatMap((t0) => ((t0.contracts || []).length ? t0.contracts.map((c) => ({ t: t0, c })) : [{ t: t0, c: null }]));
    const tests = {
      contracts: (r) => !!r.c,
      active: (r) => r.c && r.c.status === 'active',
      open: (r) => !r.c && pzOpen(r.t),
      tracked: (r) => r.c && isTracked(r.c.id),
    };
    const list = h('div');
    const tiles = h('div', { class: 'tiles section' });
    function draw() {
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const rows = all.filter((r) => (!f.which || tests[f.which](r)) && (!f.kind || r.t.eib === f.kind) && (!f.region || r.t.region === f.region)
        && (!words.length || words.every((w) => [r.t.tid, r.t.title, r.t.cpv, r.t.buyer, r.t.buyer_name, r.c && r.c.number, r.c && r.c.title,
          ...((r.c && r.c.suppliers) || []).flatMap((x) => [x.name, x.code])].join(' ').toLowerCase().includes(w))))
        .sort((x, y) => (((y.c && y.c.signed) || y.t.date || '').localeCompare((x.c && x.c.signed) || x.t.date || '')));
      const uah = (r) => { const v = (r.c && r.c.value) || (!r.c && r.t.value); return v && v.currency === 'UAH' ? v.amount : 0; };
      const sum = rows.reduce((acc, r) => acc + uah(r), 0);
      fill(tiles,
        h('div', { class: 'stat tint-violet' }, h('small', null, t('eib.tProcedures')), h('b', { class: 'num' }, ni.format(new Set(rows.map((r) => r.t.tid)).size))),
        h('div', { class: 'stat' }, h('small', null, t('eib.tContracts')), h('b', { class: 'num' }, ni.format(rows.filter((r) => r.c).length))),
        h('div', { class: 'stat tint-blue' }, h('small', null, t('eib.tValue')), h('b', { class: 'num' }, mshort(sum))),
        h('div', { class: 'stat tint-yellow' }, h('small', null, t('tr.onControl')), h('b', { class: 'num' }, ni.format(all.filter(tests.tracked).length))));
      pagedList(list, rows, f.page, { sum, csv: 'eib-contracts', csvRows: (items, name) => csvDownload(eibCsv(items), name) }, (p) => { f.page = p; draw(); }, eibTable);
    }
    const n = (k) => all.filter(tests[k]).length;
    const regions = [...new Set(all.map((r) => r.t.region).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const q = h('input', { class: 'input', type: 'search', placeholder: t('eib.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; f.page = 0; draw(); } });
    fill(box, tiles, h('div', { class: 'table-card section' },
      h('div', { class: 'table-tools' },
        pills([['contracts', t('eib.fContracts'), n('contracts')], ['active', t('eib.fActive'), n('active')], ['open', t('eib.fOpen'), n('open')], ['tracked', t('tr.onControl'), n('tracked')], ['', t('ui.all'), all.length]]
          .filter((p) => p[0] === '' || p[0] === 'contracts' || p[2]), f.which, (v) => { f.which = v; f.page = 0; draw(); }),
        select([['', t('eib.anyKind')], ['funder', t('eib.byFunder')], ['text', t('eib.byText')]], '', (e) => { f.kind = e.target.value; f.page = 0; draw(); }, t('eib.kind')),
        regions.length > 1 ? select([['', t('eib.anyRegion')]].concat(regions.map((r) => [r, r])), '', (e) => { f.region = e.target.value; f.page = 0; draw(); }, t('eib.region')) : null,
        q),
      list));
    draw();
  })();
  return [pageHead('Prozorro', titleGrad(t('eib.title1'), t('eib.title2'))), box];
}

function prozorroPage(preset) {
  const pz = state.index.orgs.reduce((acc, o) => {
    const p = o.prozorro || {};
    acc.tenders += p.tenders || 0; acc.contracts += p.contracts || 0; acc.linked += p.linked || 0; acc.value += p.value || 0; acc.queue += p.queue || 0;
    return acc;
  }, { tenders: 0, contracts: 0, linked: 0, value: 0, queue: 0 });
  return [
    pageHead(t('pz.eyebrow'), titleGrad(t('pz.title1'), t('pz.title2')), null),
    h('div', { class: 'tiles section' },
      h('div', { class: 'stat tint-violet' }, h('small', null, t('pz.tProcedures')), h('b', { class: 'num' }, ni.format(pz.tenders)), pz.queue ? h('span', { class: 'sub' }, t('pz.queued', { n: ni.format(pz.queue) })) : null),
      h('div', { class: 'stat' }, h('small', null, t('pz.tContracts')), h('b', { class: 'num' }, ni.format(pz.contracts))),
      h('div', { class: 'stat tint-blue' }, h('small', null, t('pz.tValue')), h('b', { class: 'num' }, mshort(pz.value))),
      h('div', { class: 'stat tint-yellow' }, h('small', null, t('pz.tLinked')), h('b', { class: 'num' }, ni.format(pz.linked)), h('span', { class: 'sub' }, t('pz.tLinkedSub')))),
    tendersBrowser(state.index.orgs, preset),
  ];
}

// ---- organisations ---------------------------------------------------------------------------------

function syncChip(o) {
  if (o.status === 'error') return h('span', { class: 'chip bad', title: o.error || '' }, h('i'), t('org.syncError'));
  return h('span', { class: 'chip' }, h('i'), t('org.updated', { at: ftime(o.last_sync_at) }));
}

function orgGrid(orgs) {
  if (!orgs.length) return h('div', { class: 'card empty' }, h('b', null, t('org.emptyList')), t('org.addBelow'));
  return h('div', { class: 'org-grid' }, orgs.map((o) => {
    const sup = o.role === 'supplier';
    const tt = sup ? Object.assign({ unmatched_sum: null }, (o.totals || {}).as_supplier) : o.totals || {};
    const s = orgSignalCounts(o.edrpou);
    return h('a', { class: 'org-card', href: '#/org/' + o.edrpou },
      h('div', { class: 'chips', style: 'margin:0' },
        s.high ? h('span', { class: 'sev high' }, t('org.highN', { n: s.high })) : null,
        s.medium ? h('span', { class: 'sev medium' }, t('org.mediumN', { n: s.medium })) : null,
        !s.high && !s.medium ? h('span', { class: 'tag ok' }, t('org.clean')) : null),
      h('div', null, h('span', { class: 'tag' + (sup ? ' pz' : '') }, t('role.' + (o.role || 'buyer'))), h('h3', { style: 'margin-top:6px' }, o.name), h('div', { class: 'cell-sub' }, t('f.edrpou') + ' ' + o.edrpou + (o.note ? ' · ' + o.note : ''))),
      h('div', { class: 'facts' },
        h('div', null, h('small', null, t('kinds.contract')), h('b', { class: 'num' }, mshort(tt.value))),
        h('div', null, h('small', null, t('col.paid')), h('b', { class: 'num' }, mshort(tt.paid))),
        sup ? h('div', null, h('small', null, t('nav.prozorro')), h('b', { class: 'num' }, ni.format((o.prozorro || {}).contracts || 0)))
          : h('div', null, h('small', null, t('org.noContract')), h('b', { class: 'num' }, mshort(tt.unmatched_sum)))));
  }));
}

// One-click adding: the code goes to the user's own list (users/{uid}/myorgs); GitHub
// Actions picks up new codes from the anonymous public lists within the hour, and
// the database is filled as soon as the organisation appears here (autoSyncDb).
function addOrgCard() {
  const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: t('addorg.hint'), maxlength: 14, 'aria-label': t('f.edrpou') });
  const btn = h('button', { class: 'btn btn-dark', type: 'submit' }, t('addorg.button'));
  const msg = h('div', { class: 'add-msg', role: 'status' });
  const pending = h('div', { class: 'pending' });
  let role = 'supplier';
  const rolePick = h('div', { class: 'role-pick' }, pills([['supplier', t('role.supplier')], ['buyer', t('role.buyer')]], role, (v) => { role = v; }));
  const say = (text, cls) => fill(msg, text ? h('p', { class: 'small ' + (cls || 'muted') }, text) : null);

  // Added to my list but not synced yet: GitHub Actions picks it up within the hour.
  function drawPending() {
    const have = new Set(state.all.orgs.map((o) => o.edrpou));
    const rows = [...state.mine.orgs.values()].filter((r) => !have.has(r.edrpou)).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    fill(pending, rows.length ? [
      h('h3', { class: 'pending-title' }, t('addorg.pending')),
      rows.map((r) => h('div', { class: 'pending-row' },
        h('span', { class: 'chip warn' }, h('i'), t('addorg.waiting')),
        h('div', null, h('b', null, r.name || t('f.edrpou') + ' ' + r.edrpou), h('div', { class: 'cell-sub' }, join([t('role.' + (r.role || 'buyer')), r.name ? t('f.edrpou') + ' ' + r.edrpou : null, ftime(r.addedAt)])))))] : null);
  }

  const form = h('form', {
    class: 'add-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (!/^(\d{8}|\d{10})$/.test(code)) { say(t('addorg.bad'), 'bad-text'); input.focus(); return; }
      if (state.mine.orgs.has(code)) { fill(msg, h('p', { class: 'small' }, t('addorg.already'), ' ', h('a', { href: '#/org/' + code }, t('addorg.open')))); return; }
      if (!cloud || !state.user) { say(t('auth.needed'), 'bad-text'); return; }
      btn.disabled = true;
      say(t('addorg.checking'));
      let name = '';
      const synced = state.all.orgs.find((o) => o.edrpou === code);
      if (synced) name = synced.name;
      else try { name = ((await portal('/v2/disposers/' + code)) || {}).orgName || ''; } catch (err) { /* not a fund holder or portal busy: track by code */ }
      try {
        await cloud.addOrg(code, name, role);
        input.value = '';
        // Already synced for someone else: it is in my list right away.
        if (synced) fill(msg, h('p', { class: 'small ok-text' }, t('addorg.addedNow', { name }), ' ', h('a', { href: '#/org/' + code }, t('addorg.open'))));
        else say(t('addorg.done', { name: name || code }), 'ok-text');
        drawPending();
      } catch (err) {
        say(t('addorg.failed') + ' ' + (err.message || ''), 'bad-text');
      } finally {
        btn.disabled = false;
      }
    },
  }, input, btn);

  drawPending();
  return h('div', { class: 'card pad section add-card' },
    h('div', { class: 'eyebrow' }, t('add.eyebrow')),
    h('h2', { class: 'card-title' }, t('addorg.title')),
    rolePick, form, msg,
    h('p', { class: 'muted small' }, t('addorg.text')),
    pending);
}

function orgsPage() {
  return [pageHead(t('orgs.eyebrow'), titleGrad(t('orgs.title1'), t('orgs.title2')), null), addOrgCard(), h('div', { class: 'section' }, orgGrid(state.index.orgs))];
}

const ORG_TABS = ['contracts', 'signals', 'transaction', 'prozorro', 'act', 'addendum', 'liability', 'report', 'profile'];

function orgPage(code, tab, preset) {
  const org = orgByCode(code);
  if (!org) return h('div', { class: 'card empty' }, h('b', null, t('org.notTracked')), h('a', { href: '#/orgs' }, t('org.toList')));
  tab = ORG_TABS.includes(tab) ? tab : org.role === 'supplier' ? 'prozorro' : 'contracts';
  const c = org.card || {};
  const tt = org.totals || {};
  const counts = {};
  for (const s of org.stats) counts[s.kind] = (counts[s.kind] || 0) + s.count;
  const sigs = state.signals.items.filter((s) => s.org_edrpou === code);
  const body = h('div');
  const tabsBox = h('div');

  function show(name) {
    tab = name;
    history.replaceState(null, '', `#/org/${code}/${name}`);
    fill(tabsBox, tabs());
    if (name === 'contracts') fill(body, contractsBrowser([org], preset));
    else if (name === 'signals') fill(body, sigs.length ? h('div', { class: 'sig-list' }, sigs.map((s) => signalCard(s, false))) : h('div', { class: 'card empty' }, h('b', null, t('sigs.none'))));
    else if (name === 'profile') fill(body, profile());
    else if (name === 'transaction') fill(body, paymentsBrowser([org], preset));
    else if (name === 'prozorro') fill(body, tendersBrowser([org], preset));
    else fill(body, recordsBrowser(org, name));
    preset = null;
  }
  const tabLabel = (k) => (k === 'contracts' ? t('org.tabRecon') : k === 'signals' ? t('nav.signals') : k === 'profile' ? t('org.tabProfile') : k === 'prozorro' ? t('nav.prozorro') : kindMany(k));
  const tabCount = (k) => (k === 'signals' ? sigs.length : k === 'contracts' ? counts.contract || 0 : k === 'prozorro' ? (org.prozorro || {}).tenders || 0 : KINDS.includes(k) ? counts[k] || 0 : null);
  const tabs = () => h('div', { class: 'tabs', role: 'tablist' }, ORG_TABS.map((k) => h('button', {
    class: tab === k ? 'on' : '', role: 'tab', 'aria-selected': tab === k, onclick: () => show(k),
  }, tabLabel(k), tabCount(k) != null ? h('span', { class: 'n' }, ni.format(tabCount(k))) : null)));

  function profile() {
    return h('div', { class: 'card pad' }, kv([
      [t('f.note'), org.note],
      [t('f.orgForm'), c.orgForm],
      [t('f.orgType'), (c.orgType || []).join(', ')],
      [t('f.kved'), c.kved],
      [t('f.address'), address(c.address)],
      [t('f.director'), c.director ? join([c.director.lastName, c.director.firstName, c.director.middleName], ' ') : null],
      [t('f.phone'), c.phone],
      ['E-mail', c.email],
      [t('f.generalDisposer'), c.generalDisposer && c.generalDisposer.edrpou !== org.edrpou ? party(c.generalDisposer.fullName, c.generalDisposer.edrpou) : null],
      [t('f.onPortalSince'), c.registrationDate ? fdate(c.registrationDate) : null],
      [t('f.card'), org.card ? null : t('org.noCard')],
    ]));
  }
  const dbBtn = h('button', { class: 'btn btn-dark', onclick: () => uploadOrgToDb(org, dbBtn) }, icon('db'), h('span', null, t('db.upload')));
  const driveBtn = h('button', { class: 'btn', onclick: () => exportOrg(org, driveBtn) }, icon('drive'), h('span', null, t('drv.saveOrg')));
  const view = [
    h('div', { class: 'org-head' },
      h('div', null, h('div', { class: 'eyebrow' }, h('a', { href: '#/orgs', style: 'text-decoration:none' }, '← ' + t('nav.orgs'))), h('h1', { class: 'org-title' }, org.name),
        h('div', { class: 'chips' }, h('span', { class: 'tag ok' }, t('org.monitoring')), h('span', { class: 'tag' + (org.role === 'supplier' ? ' pz' : '') }, t('role.' + (org.role || 'buyer'))), h('span', { class: 'chip' }, t('f.edrpou') + ' ' + org.edrpou), syncChip(org),
          orgSignalCounts(org.edrpou).high ? h('span', { class: 'sev high' }, t('org.highRisk', { n: orgSignalCounts(org.edrpou).high })) : null)),
      h('div', { class: 'org-actions' }, h('div', { class: 'row' }, dbBtn, driveBtn),
        h('button', { class: 'btn btn-sm', onclick: async () => {
          if (!confirm(t('org.removeConfirm'))) return;
          try { await cloud.removeOrg(org.edrpou); toast(t('org.removed')); location.hash = '#/orgs'; } catch (e) { toast(e.message, { bad: true }); }
        } }, t('org.remove')))),
    org.status === 'error' && org.error ? h('div', { class: 'notice section' }, t('org.partial') + ' ' + org.error) : null,
    orgTrackedCard(org),
    org.role === 'supplier' ? supplierTiles(org) : h('div', { class: 'tiles section' },
      h('div', { class: 'stat tint-violet' }, h('small', null, t('org.asBuyer')), h('b', { class: 'num' }, mshort(tt.value)), h('span', { class: 'sub' }, t('org.pcs', { n: ni.format(tt.contracts || 0) }))),
      h('div', { class: 'stat' }, h('small', null, t('org.byActs')), h('b', { class: 'num' }, mshort(tt.acts))),
      h('div', { class: 'stat tint-blue' }, h('small', null, t('ov.paid')), h('b', { class: 'num' }, mshort(tt.paid)), h('span', { class: 'sub' }, t('org.matched', { n: ni.format(tt.matched || 0) }))),
      h('div', { class: 'stat tint-yellow' }, h('small', null, t('org.noContractPaid')), h('b', { class: 'num' }, mshort(tt.unmatched_sum)), h('span', { class: 'sub' }, t('ov.loadedPeriod')))),
    tabsBox,
    body,
  ];
  show(tab);
  return view;
}

// Contracts of this organisation that the user has on control (either side).
function orgTrackedCard(org) {
  const rows = (state.trackedIndex.items || []).filter((r) => (isTracked(r.key) || isSharedWithMe(r.key)) && [r.org, r.buyer, r.supplier].includes(org.edrpou));
  if (!rows.length) return null;
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, t('org.trackedHere'), h('span', { class: 'count', style: 'margin-left:8px' }, rows.length)),
    h('div', { class: 'doc-list' }, rows.map((r) => h('a', { class: 'doc', href: '#/tracked/' + r.key },
      icon('star'), h('span', null, h('b', null, t('dos.heading', { n: r.number || '—', date: fdate(r.signed) })),
        h('small', null, join([r.supplier_name, t('tr.paidOf', { paid: mshort((r.totals || {}).paid), value: mshort((r.totals || {}).value) })]))), icon('arrow')))));
}

function supplierTiles(org) {
  const tt = (org.totals || {}).as_supplier || {};
  const pz = org.prozorro || {};
  const mine = (state.trackedIndex.items || []).filter((r) => r.org === org.edrpou && isTracked(r.key));
  return h('div', { class: 'tiles section' },
    h('div', { class: 'stat tint-violet' }, h('small', null, t('org.asSupplier')), h('b', { class: 'num' }, mshort(pz.value || tt.value)), h('span', { class: 'sub' }, t('org.pcs', { n: ni.format(pz.contracts || tt.contracts || 0) }))),
    h('div', { class: 'stat' }, h('small', null, t('org.buyersPaid')), h('b', { class: 'num' }, mshort(tt.paid)), h('span', { class: 'sub' }, t('ov.loadedPeriod'))),
    h('div', { class: 'stat tint-blue' }, h('small', null, t('nav.tracked')), h('b', { class: 'num' }, ni.format(mine.length))),
    h('div', { class: 'stat tint-yellow' }, h('small', null, t('tr.left')), h('b', { class: 'num' }, mshort(mine.reduce((a, r) => a + (r.totals.left || 0), 0))), h('span', { class: 'sub' }, t('org.onControlSub'))));
}

function recordsBrowser(org, kind) {
  const f = { role: '', q: '', from: '', to: '', min: '', page: 0 };
  const list = h('div', null, h('div', { class: 'empty' }, t('ui.loading')));
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
        const text = [itemTitle(i), i.cp_name, i.cp_edrpou, i.ext_id].filter(Boolean).join(' ').toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    }).map((i) => Object.assign({ org_name: org.name, org_edrpou: org.edrpou }, i));
    pagedList(list, items, f.page, { marks: true, csv: `spending-${org.edrpou}-${kind}`, noSum: kind === 'report', emptyTitle: t('empty.noRecords'), emptyText: t('empty.text') }, (p) => { f.page = p; draw(); });
  }
  const q = h('input', { class: 'input', type: 'search', placeholder: t('rec.searchHint') });
  const from = h('input', { class: 'input', type: 'date' });
  const to = h('input', { class: 'input', type: 'date' });
  const min = h('input', { class: 'input', type: 'number', min: 0, step: 'any', placeholder: '0', style: 'width:120px' });
  const role = ROLES_FOR[kind] ? select([['', t('ui.anyRole')]].concat(roleOptions(kind)), '', () => {}, t('col.role')) : null;
  draw();
  return h('div', { class: 'table-card' },
    h('form', {
      class: 'table-tools',
      onsubmit: (e) => { e.preventDefault(); Object.assign(f, { q: q.value.trim(), from: from.value, to: to.value, min: min.value, role: role ? role.value : '', page: 0 }); draw(); },
    },
      h('label', { class: 'field', style: 'flex:1;min-width:200px' }, h('span', null, t('ui.search')), q),
      role && h('label', { class: 'field' }, h('span', null, t('col.role')), role),
      h('label', { class: 'field' }, h('span', null, t('ui.from')), from), h('label', { class: 'field' }, h('span', null, t('ui.to')), to),
      kind !== 'report' && h('label', { class: 'field' }, h('span', null, t('ui.minSum')), min),
      h('button', { class: 'btn btn-dark', type: 'submit' }, t('ui.show'))),
    list);
}

// ---- feed ---------------------------------------------------------------------------------------

// Changes of one's contracts on control, from the summary rows (each carries its recent events).
function trackedEvents() {
  const rows = [...state.mine.tracked.keys()].concat([...state.mine.shared.keys()].filter((id) => !isTracked(id)))
    .map((id) => ({ id, pick: state.mine.tracked.get(id) || state.mine.shared.get(id) || {}, row: trackedRow(id) }));
  return rows.flatMap((r) => ((r.row && r.row.events) || []).map((e) => ({ e, r })))
    .sort((x, y) => (y.e.at || '').localeCompare(x.e.at || '') || (y.e.date || '').localeCompare(x.e.date || ''));
}
const newTrackedEvents = () => { const seen = getTrackedSeen(); return trackedEvents().filter(({ e }) => e.at > seen).length; };
const bellCount = () => newTrackedEvents() + unreadCount();
function markAllSeen() {
  setTrackedSeen(new Date().toISOString().slice(0, 10) + 'T99');
  if (state.feed.items.length) setSeen(state.feed.items[0].first_seen_at);
  render();
}

// Behind the bell: what changed in one's contracts on control, and what is new on the portal.
function feedPage(preset) {
  const seen = getTrackedSeen();
  const tab = { which: preset === 'portal' ? 'portal' : 'tracked' };
  const box = h('div');
  const evs = trackedEvents();
  function drawTracked() {
    const f = { ev: '', q: '' };
    const list = h('div');
    const filters = h('div');
    const draw = () => {
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const all = evs.filter(({ r }) => !words.length || words.every((w) => [r.pick.number, r.pick.title, r.pick.buyer, r.pick.supplier, r.row && r.row.supplier_name].join(' ').toLowerCase().includes(w)));
      const shown = all.filter(({ e }) => !f.ev || eventGroup(e) === f.ev);
      fill(filters, eventPills(all.map((x) => x.e), f.ev, (v) => { f.ev = v; draw(); }));
      fill(list, shown.length ? h('div', { class: 'ev-feed' }, shown.slice(0, 300).map(({ e, r }) => h('a', { class: 'ev-row ' + eventClass(e) + (e.at > seen ? ' new' : ''), href: '#/tracked/' + r.id },
        h('span', { class: 'd num' }, fdate(e.at)),
        h('span', null, h('b', null, t('dos.heading', { n: (r.row && r.row.number) || r.pick.number || '—', date: fdate(r.row && r.row.signed) })),
          h('span', { class: 'faint small' }, ' · ' + ((r.row && r.row.supplier_name) || r.pick.supplier || '')),
          h('div', null, eventText(e)), eventSub(e)))))
        : h('div', { class: 'empty' }, h('b', null, t('tr.noChanges'))));
    };
    const q = h('input', { class: 'input', type: 'search', placeholder: t('tr.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; draw(); } });
    draw();
    return h('div', { class: 'table-card' }, h('div', { class: 'table-tools' }, filters, q), list);
  }
  function drawPortal() {
    const f = { kind: '', org: '', page: 0 };
    const all = state.feed.items;
    const list = h('div');
    const draw = () => {
      const items = all.filter((i) => (!f.kind || i.kind === f.kind) && (!f.org || i.org_edrpou === f.org));
      pagedList(list, items, f.page, { showOrg: state.index.orgs.length > 1, marks: true, noSum: true, emptyTitle: t('feed.empty'), emptyText: t('feed.emptyText') }, (p) => { f.page = p; draw(); });
    };
    draw();
    return h('div', { class: 'table-card' },
      h('div', { class: 'table-tools' },
        pills([['', t('ui.all')]].concat(KINDS.map((k) => [k, kindMany(k)])), '', (v) => { f.kind = v; f.page = 0; draw(); }),
        state.index.orgs.length > 1 ? select([['', t('ui.allOrgs')]].concat(state.index.orgs.map((o) => [o.edrpou, o.name])), '', (e) => { f.org = e.target.value; f.page = 0; draw(); }, t('ui.allOrgs')) : null),
      list);
  }
  const show = () => fill(box, tab.which === 'portal' ? drawPortal() : drawTracked());
  const nTracked = evs.filter(({ e }) => e.at > seen).length;
  const tabs = pills([['tracked', t('ntf.tracked'), nTracked || null], ['portal', t('ntf.portal'), unreadCount() || null]], tab.which, (v) => { tab.which = v; show(); });
  show();
  return [
    pageHead(t('ntf.eyebrow'), titleGrad(t('ntf.title1'), t('ntf.title2')), null,
      h('div', { class: 'row' }, tabs, bellCount() ? h('button', { class: 'btn', onclick: markAllSeen }, icon('check'), t('feed.markRead')) : null)),
    box,
  ];
}

// ---- live search ---------------------------------------------------------------------------------

function searchPage() {
  const s = state.search || (state.search = { edrpou: '', kind: 'transaction', role: 'both', from: addDays(today(), -30), to: today(), res: null, page: 0 });
  const out = h('div');
  const code = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: t('srch.codeHint'), maxlength: 12, required: true, pattern: '\\s*\\d{8,10}\\s*', value: s.edrpou });
  const from = h('input', { class: 'input', type: 'date', required: true, value: s.from });
  const to = h('input', { class: 'input', type: 'date', required: true, value: s.to });
  const roleBox = h('span');
  let roleSel = null;
  const drawRole = () => {
    const opts = roleOptions(kindSel.value);
    roleSel = opts.length ? select([['both', t('ui.anyRole')]].concat(opts), opts.some((o) => o[0] === s.role) ? s.role : 'both', () => {}, t('srch.role')) : null;
    fill(roleBox, roleSel ? h('label', { class: 'field' }, h('span', null, t('srch.role')), roleSel) : '');
  };
  const kindSel = select(KINDS.map((k) => [k, kindMany(k)]), s.kind, drawRole, t('srch.what'));
  drawRole();
  const go = h('button', { class: 'btn btn-dark', type: 'submit' }, icon('search'), t('srch.go'));

  async function run() {
    const { edrpou, kind, from: a, to: b } = s;
    if (a > b) throw new Error(t('srch.badRange'));
    const limit = kind === 'transaction' ? 366 : 731;
    if (kind !== 'report' && daysBetween(a, b) > limit) throw new Error(kind === 'transaction' ? t('srch.maxYear') : t('srch.max2Years'));
    const roles = !ROLES_FOR[kind] ? [''] : s.role === 'both' ? ROLES_FOR[kind] : [s.role];
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
      fill(out, h('div', { class: 'empty' }, h('b', null, t('srch.emptyTitle')), t('srch.emptyText')));
      return;
    }
    const tracked = orgByCode(s.edrpou);
    const box = h('div');
    pagedList(box, res.items, s.page, {
      csv: `spending-${s.edrpou}-${s.kind}`, noSum: s.kind === 'report', emptyText: t('srch.nothing'),
      extra: tracked ? h('a', { class: 'btn btn-sm', href: '#/org/' + s.edrpou }, t('srch.openRecon')) : h('a', { class: 'btn btn-sm', href: '#/orgs' }, t('srch.howTrack')),
    }, (p) => { s.page = p; draw(); });
    fill(out, res.truncated ? h('div', { class: 'notice', style: 'margin:14px 16px 0' }, t('srch.truncated')) : null, box);
  }

  const form = h('form', {
    class: 'table-tools',
    onsubmit: async (e) => {
      e.preventDefault();
      Object.assign(s, { edrpou: code.value.trim(), kind: kindSel.value, role: roleSel ? roleSel.value : 'both', from: from.value, to: to.value, page: 0 });
      fill(out, h('div', { class: 'empty' }, t('srch.wait')));
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
    h('label', { class: 'field' }, h('span', null, t('f.edrpou')), code),
    h('label', { class: 'field' }, h('span', null, t('srch.what')), kindSel),
    roleBox,
    h('label', { class: 'field' }, h('span', null, t('ui.from')), from), h('label', { class: 'field' }, h('span', null, t('ui.to')), to), go);
  draw();
  return [pageHead(t('srch.eyebrow'), titleGrad(t('srch.title1'), t('srch.title2')), null), h('div', { class: 'table-card' }, form, out)];
}

// ---- methodology ------------------------------------------------------------------------------------

function methodPage() {
  const rows = [['overpaid', 'high'], ['no_contract', 'mediumLow'], ['paid_before', 'medium'], ['paid_over_acts', 'low']];
  const runs = state.index.runs || [];
  return [
    pageHead(t('nav.method'), titleGrad(t('m.title1'), t('m.title2')), t('m.lead')),
    h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('m.matchTitle')), h('p', { class: 'muted' }, t('m.matchText'))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('m.pzTitle')), h('p', { class: 'muted' }, t('m.pzText'))),
    h('div', { class: 'table-card section' }, h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('m.signal')), h('th', null, t('m.level')), h('th', null, t('m.rule')))),
      h('tbody', null, rows.map(([type, sev]) => h('tr', null, td(t('m.signal'), { class: 'cell-main' }, t('sigtype.' + type)), td(t('m.level'), { class: 'nowrap' }, t('lvl.' + sev)), td(t('m.rule'), null, t('rule.' + type)))))))),
    h('div', { class: 'table-card section' },
      h('div', { class: 'table-tools' }, h('b', null, t('m.runs')), h('span', { class: 'faint small' }, ghLink('actions', t('m.runsLog')))),
      runs.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
        h('thead', null, h('tr', null, h('th', null, t('m.start')), h('th', null, t('m.end')), h('th', null, t('m.trigger')), h('th', null, t('m.result')), h('th', { class: 'r' }, t('m.newRecords')))),
        h('tbody', null, runs.map((r) => h('tr', null,
          td(t('m.start'), { class: 'num' }, ftime(r.started_at)), td(t('m.end'), { class: 'num' }, ftime(r.finished_at)),
          td(t('m.trigger'), null, t('trig.' + r.trigger)),
          td(t('m.result'), null, r.orgs_failed ? h('span', { class: 'sev high' }, t('m.errors', { n: r.orgs_failed })) : h('span', { class: 'tag ok' }, t('m.ok'))),
          td(t('m.newRecords'), { class: 'r num' }, r.new_items)))))) : h('div', { class: 'empty' }, t('m.noRuns'))),
  ];
}

// ---- settings ---------------------------------------------------------------------------------------

function settingsPage() {
  const u = state.user;
  const exportsBox = h('div', null, h('div', { class: 'muted' }, t('ui.loading')));
  const dbBox = h('div', null, h('div', { class: 'muted' }, t('ui.loading')));
  if (cloud && u) {
    cloud.myExports().then((rows) => fill(exportsBox, rows.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', null, t('set.what')), h('th', null, ''))),
      h('tbody', null, rows.map((r) => h('tr', null, td(t('col.date'), { class: 'num' }, ftime(r.at)), td(t('set.what'), null, r.title || ''),
        td('', { class: 'r' }, r.url ? ext(r.url, t('drv.open')) : null)))))) : h('div', { class: 'muted' }, t('set.noExports'))))
      .catch(() => fill(exportsBox, h('div', { class: 'muted' }, t('set.noExports'))));
    cloud.dbStatus(state.index.orgs.map((o) => o.edrpou)).then((rows) => fill(dbBox, h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('col.org')), h('th', null, t('db.uploadedAt')), h('th', { class: 'r' }, t('db.records')), h('th', null, ''))),
      h('tbody', null, state.index.orgs.map((o) => {
        const st = rows[o.edrpou];
        const b = h('button', { class: 'btn btn-sm', onclick: () => uploadOrgToDb(o, b) }, icon('db'), t('db.upload'));
        return h('tr', null, td(t('col.org'), null, o.name), td(t('db.uploadedAt'), { class: 'num' }, st && st.at ? ftime(st.at) : t('db.never')),
          td(t('db.records'), { class: 'r num' }, st ? ni.format(st.records || 0) : '—'), td('', { class: 'r' }, b));
      }))))))
      .catch((e) => fill(dbBox, h('div', { class: 'muted' }, e.message)));
  }
  const installBox = isStandalone() || install.installed ? h('span', { class: 'tag ok' }, t('inst.installed'))
    : install.prompt ? h('button', { class: 'btn btn-dark', onclick: async () => { if (await runInstall()) render(); } }, icon('phone'), t('inst.button'))
      : h('p', { class: 'muted small' }, isIOS() ? t('inst.ios') : t('inst.manual'));
  const upd = h('button', { class: 'btn', onclick: () => checkForUpdate(upd) }, icon('refresh'), t('upd.check'));
  return [
    pageHead(t('nav.settings'), titleGrad(t('set.title1'), t('set.title2'))),
    h('div', { class: 'settings' },
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.account')),
        u ? h('div', { class: 'account' },
          u.photoURL ? h('img', { src: u.photoURL, alt: '', referrerpolicy: 'no-referrer', width: 48, height: 48 }) : null,
          h('div', null, h('b', null, u.displayName || ''), h('div', { class: 'muted small' }, u.email || '')),
          h('button', { class: 'btn', onclick: () => cloud.signOut() }, icon('logout'), t('auth.signOut'))) : null),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.language')), langSwitch(), h('p', { class: 'muted small' }, t('set.languageNote'))),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.install')), installBox),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.version')),
        kv([[t('set.versionLabel'), 'v' + APP.version], [t('set.build'), APP.build], [t('set.stage'), t('set.stageDev')], [t('set.dataAt'), state.index.generated_at ? ftime(state.index.generated_at) : '—']]),
        h('div', { class: 'row', style: 'margin-top:12px' }, upd, ghLink('blob/main/CHANGELOG.md', t('set.changelog'), 'btn'), h('a', { class: 'btn', href: '#/method' }, icon('book'), t('nav.method'))))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('db.title')), h('p', { class: 'muted small' }, t('db.note')), dbBox),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('set.drive')), h('p', { class: 'muted small' }, t('set.driveNote')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: (e) => openDriveFolder(e.currentTarget) }, icon('drive'), t('drv.openFolder')))),
    h('div', { id: 'drive-script' }, driveCard()),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('set.exports')), exportsBox),
  ];
}

// ---- the database: documents into Firestore ---------------------------------------------------------

// Builds every record of one organisation in the shape stored in Firestore:
// orgs/{edrpou}/{collection}/{id}. Payments carry the contract they were matched to
// and the invoice/waybill/act numbers quoted in their purpose.
async function orgDbPayload(org) {
  const a = await loadAnalysis(org);
  const payTo = new Map();
  for (const c of a.contracts) for (const p of c.payments) payTo.set(String(p.ext_id), c.id);
  const base = (i) => ({ date: i.date || null, amount: i.amount == null ? null : i.amount, currency: i.currency || null, role: i.role || null, party: i.cp_name || null, partyCode: i.cp_edrpou || null, data: i.data || null });
  const out = {};
  out.contracts = a.contracts.map((c) => {
    const row = Object.assign({}, c);
    row.payments = c.payments.map((p) => p.ext_id);
    row.acts = c.acts.map((x) => x.ext_id);
    row.addendums = c.addendums.map((x) => x.ext_id);
    return { id: String(c.ext_id), doc: row };
  });
  const raw = {};
  for (const kind of ['contract', 'act', 'addendum', 'peny', 'transaction', 'liability', 'report']) raw[kind] = await loadKind(org, kind);
  const contractRaw = new Map(raw.contract.map((i) => [String(i.ext_id), i.data]));
  for (const c of out.contracts) c.doc.data = contractRaw.get(c.id) || null;
  out.acts = raw.act.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), { number: (i.data || {}).documentNumber || null, contract: (i.data || {}).parentId != null ? String(i.data.parentId) : null }) }));
  out.addendums = raw.addendum.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), { number: (i.data || {}).documentNumber || null, contract: (i.data || {}).parentId != null ? String(i.data.parentId) : null }) }));
  out.penalties = raw.peny.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), { number: (i.data || {}).documentNumber || null, contract: (i.data || {}).parentId != null ? String(i.data.parentId) : null }) }));
  out.payments = raw.transaction.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), {
    purpose: i.title || '', contract: payTo.get(String(i.ext_id)) || null,
    invoices: docRefs(i.title, 'invoice') || null, waybills: docRefs(i.title, 'waybill') || null, actRefs: docRefs(i.title, 'act') || null,
  }) }));
  out.liabilities = raw.liability.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), { title: liabilityTitle(i.data || {}) }) }));
  out.reports = raw.report.map((i) => ({ id: String(i.ext_id), doc: Object.assign(base(i), { title: i.title || '' }) }));
  out.signals = state.signals.items.filter((s) => s.org_edrpou === org.edrpou).map((s) => ({
    id: reviewKey(s).slice(0, 140), doc: { type: s.type, severity: s.severity, params: s.params || {}, contract: s.contract || null, party: s.party || null, amount: s.amount == null ? null : s.amount, date: s.date || null },
  }));
  return {
    org: { edrpou: org.edrpou, name: org.name, note: org.note || '', card: org.card || null, totals: org.totals || null, signals: org.signals || null, dataAt: state.index.generated_at || null, sig: orgSig(org) },
    collections: out,
  };
}

// Changes whenever the organisation's records change (counts, sums, signals), and
// only then: a fresh sync with nothing new keeps the same signature.
function orgSig(org) {
  const s = JSON.stringify([org.stats, org.totals, org.signals]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Organisations added to tracking get their database records without anyone
// pressing a button: as soon as a signed-in analyst opens the app, every tracked
// organisation that is missing from the database, or has new records since the
// last upload, is uploaded in the background (only changed records are written).
let autoSyncRunning = false;
async function autoSyncDb() {
  if (autoSyncRunning || !cloud || !state.user || !state.index) return;
  autoSyncRunning = true;
  try {
    const status = await cloud.dbStatus(state.index.orgs.map((o) => o.edrpou));
    const due = state.index.orgs.filter((o) => !status[o.edrpou] || status[o.edrpou].sig !== orgSig(o));
    for (const org of due) {
      const note = toast(t('db.auto', { name: org.name }), { sticky: true });
      try {
        const payload = await orgDbPayload(org);
        const res = await cloud.uploadOrg(payload, (done, total) => {
          note.querySelector('span').textContent = t('db.autoProgress', { name: org.name, done: ni.format(done), total: ni.format(total) });
        });
        note.remove();
        toast(t('db.autoDone', { name: org.name, n: ni.format(res.written), total: ni.format(res.total) }));
      } catch (e) {
        note.remove();
        toast(t('db.failed') + ' ' + (e.message || ''), { bad: true });
        break;
      }
    }
  } catch (e) {
    /* database unreachable: try again next time the app opens */
  } finally {
    autoSyncRunning = false;
  }
}

async function uploadOrgToDb(org, btn) {
  if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
  btn.disabled = true;
  const note = toast(t('db.preparing'), { sticky: true });
  try {
    const payload = await orgDbPayload(org);
    const res = await cloud.uploadOrg(payload, (done, total) => { note.querySelector('span').textContent = t('db.progress', { done: ni.format(done), total: ni.format(total) }); });
    note.remove();
    toast(res.written ? t('db.done', { n: ni.format(res.written), total: ni.format(res.total) }) : t('db.upToDate', { total: ni.format(res.total) }),
      { link: { href: `https://console.firebase.google.com/project/${window.FIREBASE_CONFIG.projectId}/firestore/databases/-default-/data/~2Forgs~2F${org.edrpou}`, label: t('db.openConsole') } });
  } catch (e) {
    note.remove();
    toast(t('db.failed') + ' ' + (e.message || ''), { bad: true });
  } finally {
    btn.disabled = false;
  }
}

// ---- Google Drive export ------------------------------------------------------------------------------

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const htmlRows = (pairs) => pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
const htmlTable = (head, rows) => `<table border="1" cellpadding="4" cellspacing="0"><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>`;
const footer = () => `<p><i>${esc(t('drv.footer', { at: ftime(new Date()), v: APP.version }))}</i></p>`;

async function contractHtml(org, c) {
  const pays = await findRecords(org, 'transaction', c.payments.map((p) => p.ext_id));
  const acts = await findRecords(org, 'act', c.acts.map((x) => x.ext_id));
  const adds = await findRecords(org, 'addendum', c.addendums.map((x) => x.ext_id));
  const rv = state.reviews.get(contractReviewKey(org, c.id));
  return `<html><head><meta charset="utf-8"></head><body>
<h1>${esc(t('dos.heading', { n: c.number || '—', date: fdate(c.date) }))}</h1>
<p>${esc(org.name)} (${esc(t('f.edrpou'))} ${esc(org.edrpou)})</p>
<table border="1" cellpadding="4" cellspacing="0">${htmlRows([
    [t('col.party'), party(c.party_name, c.party_code)], [t('col.subject'), c.subject], [t('f.docDate'), fdate(c.date)], [t('f.published'), fdate(c.published)],
    [t('f.validity'), c.from || c.to ? `${fdate(c.from)} — ${c.to ? fdate(c.to) : t('f.noTerm')}` : ''], [t('ct.value0'), money(c.value0)], [t('col.value'), money(c.value)],
    [t('dos.acts'), money(c.acts_sum)], [t('col.paid'), money(c.paid)], [t('ct.gap'), money(c.value - c.paid)],
    [t('dos.procedure'), c.tender ? t('dos.tender') : t('dos.noTender')], [t('f.reason'), c.tender ? '' : c.reason], ['Prozorro', c.prozorro], ['CPV', c.cpv],
    [t('col.signals'), payFlags(c).map((f) => t('flag.' + f)).join(', ')], [t('rv.status'), rv ? t('rv.' + rv.status) + (rv.comment ? ' — ' + rv.comment : '') : ''],
  ])}</table>
<h2>${esc(kindMany('addendum'))}</h2>${adds.length ? htmlTable([t('col.date'), '№', t('col.amount'), t('col.subject')], adds.map((x) => [fdate(x.date), x.data.documentNumber, money(x.amount), x.data.subject || ''])) : '<p>—</p>'}
<h2>${esc(kindMany('act'))}</h2>${acts.length ? htmlTable([t('col.date'), '№', t('col.amount'), t('col.description')], acts.map((x) => [fdate(x.date), x.data.documentNumber, money(x.amount), itemTitle(x)])) : '<p>—</p>'}
<h2>${esc(t('drv.payments'))}</h2>${pays.length ? htmlTable([t('col.date'), t('col.amount'), t('col.invoice'), t('col.waybill'), t('f.purpose')], pays.map((x) => [fdate(x.date), money(x.amount), docRefs(x.title, 'invoice'), docRefs(x.title, 'waybill'), x.title])) : '<p>—</p>'}
${footer()}
</body></html>`;
}

const orgFolder = (org) => `${org.name.slice(0, 80)} (${org.edrpou})`;

async function exportContract(org, c, btn) {
  if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
  btn.disabled = true;
  let note = null;
  try {
    await cloud.driveToken();  // first, while the click still allows a Google popup
    note = toast(t('drv.working'), { sticky: true });
    const html = await contractHtml(org, c);
    const name = t('drv.contractFile', { n: c.number || c.id, date: fdate(c.date), party: (c.party_name || '').slice(0, 60) });
    const res = await cloud.exportFiles(orgFolder(org), [
      { folder: t('drv.folderContracts'), name, type: 'doc', content: html },
      { folder: t('drv.folderData'), name: name + '.json', type: 'json', content: JSON.stringify(c, null, 2) },
    ]);
    await cloud.logExport({ org: org.edrpou, kind: 'contract', title: name, url: res.files[0].url }).catch(() => {});
    note.remove();
    toast(t('drv.saved'), { link: { href: res.files[0].url, label: t('drv.open') } });
  } catch (e) {
    if (note) note.remove();
    toast(t('drv.failed') + ' ' + (e.message || ''), { bad: true });
  } finally {
    btn.disabled = false;
  }
}

async function exportOrg(org, btn) {
  if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
  btn.disabled = true;
  let note = null;
  try {
    await cloud.driveToken();
    note = toast(t('drv.workingOrg'), { sticky: true });
    const a = await loadAnalysis(org);
    const contracts = a.contracts.map((c) => Object.assign({ _org: org }, c));
    const c = org.card || {};
    const tt = org.totals || {};
    const files = [{ folder: '', name: t('drv.companyFile'), type: 'doc', content: `<html><head><meta charset="utf-8"></head><body><h1>${esc(org.name)}</h1><table border="1" cellpadding="4" cellspacing="0">${htmlRows([
      [t('f.edrpou'), org.edrpou], [t('f.orgForm'), c.orgForm], [t('f.orgType'), (c.orgType || []).join(', ')], [t('f.kved'), c.kved], [t('f.address'), address(c.address)],
      [t('f.director'), c.director ? join([c.director.lastName, c.director.firstName, c.director.middleName], ' ') : ''], [t('f.phone'), c.phone], ['E-mail', c.email],
      [t('f.onPortalSince'), c.registrationDate ? fdate(c.registrationDate) : ''], [t('org.asBuyer'), money(tt.value)], [t('org.byActs'), money(tt.acts)],
      [t('ov.paid'), money(tt.paid)], [t('org.noContractPaid'), money(tt.unmatched_sum)],
    ])}</table>${footer()}</body></html>` }];
    files.push({ folder: t('drv.folderRegisters'), name: t('drv.regContracts'), type: 'sheet', content: toCSV(contractRows(contracts), ',') });
    const sigRows = [[t('m.level'), t('m.signal'), t('col.party'), t('col.description'), t('col.amount'), t('col.date'), t('rv.status'), t('rv.comment')]];
    for (const s of state.signals.items.filter((x) => x.org_edrpou === org.edrpou)) {
      const rv = reviewOf(s);
      sigRows.push([t('sev.' + s.severity), t('sigtype.' + s.type), s.party || '', signalText(s), dec(s.amount), s.date || '', t('rv.' + rv.status), rv.comment || '']);
    }
    files.push({ folder: t('drv.folderRegisters'), name: t('drv.regSignals'), type: 'sheet', content: toCSV(sigRows, ',') });
    for (const kind of ['transaction', 'act', 'addendum', 'liability', 'report']) {
      const items = (await loadKind(org, kind)).map((i) => Object.assign({ org_name: org.name, org_edrpou: org.edrpou }, i));
      if (items.length) files.push({ folder: t('drv.folderRegisters'), name: kindMany(kind), type: 'sheet', content: toCSV(itemRows(items), ',') });
    }
    const res = await cloud.exportFiles(orgFolder(org), files, (done, total) => { note.querySelector('span').textContent = t('drv.progress', { done, total }); });
    await cloud.logExport({ org: org.edrpou, kind: 'org', title: orgFolder(org), url: res.folderUrl }).catch(() => {});
    note.remove();
    toast(t('drv.savedN', { n: files.length }), { link: { href: res.folderUrl, label: t('drv.open') } });
  } catch (e) {
    if (note) note.remove();
    toast(t('drv.failed') + ' ' + (e.message || ''), { bad: true });
  } finally {
    btn.disabled = false;
  }
}

async function openDriveFolder(btn) {
  if (!cloud || !state.user) return;
  btn.disabled = true;
  try {
    const url = await cloud.rootFolderUrl();
    toast(t('drv.folderReady'), { link: { href: url, label: t('drv.open') } });
  } catch (e) {
    toast(t('drv.failed') + ' ' + (e.message || ''), { bad: true });
  } finally {
    btn.disabled = false;
  }
}

// ---- sign-in screen -----------------------------------------------------------------------------------

function loginPage() {
  const btn = h('button', { class: 'btn btn-google', onclick: async () => {
    btn.disabled = true;
    try {
      await cloud.signIn();
    } catch (e) {
      if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(t('auth.failed') + ' ' + (e.message || ''), { bad: true });
    } finally {
      btn.disabled = false;
    }
  } }, googleMark(), t('auth.google'));
  return h('div', { class: 'login' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'login-card' },
      h('div', { class: 'login-top' }, logo(), langSwitch()),
      h('div', { class: 'eyebrow' }, t('login.eyebrow')),
      h('h1', null, h('span', null, t('ov.title1') + ' '), h('span', { class: 'grad' }, t('ov.title2'))),
      h('p', { class: 'lead' }, t('login.lead')),
      h('ul', { class: 'login-points' }, ['login.p1', 'login.p2', 'login.p3'].map((k) => h('li', null, icon('check'), t(k)))),
      state.cloudError ? h('div', { class: 'notice' }, t('auth.unavailable'), ' ', h('button', { class: 'btn btn-sm', onclick: () => location.reload() }, t('ui.retry'))) : btn,
      h('p', { class: 'muted small' }, t('login.note')),
      h('p', { class: 'faint small' }, 'v' + APP.version)));
}

// ---- router ------------------------------------------------------------------------------------------

function render() {
  closeSheet();
  document.documentElement.lang = LANG;
  document.title = t('app.name');
  if (state.user === undefined) { fill(app, h('div', { class: 'boot' }, t('ui.loading'))); return; }
  if (!state.user) { fill(app, loginPage()); return; }
  if (!state.index || (cloud && !state.mine.ready)) { fill(app, h('div', { class: 'boot' }, state.dataError ? [h('b', null, t('err.dataTitle') + ' '), state.dataError] : t('ui.loading'))); return; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = parts[0] || '';
  let page, key = route;
  if (route === 'signals') { page = sectionTabs('payments', 'signals', signalsPage(parts[1])); key = 'payments'; }
  else if (route === 'contracts') { page = sectionTabs('payments', 'contracts', contractsPage(parts[1])); key = 'payments'; }
  else if (route === 'payments') page = sectionTabs('payments', 'payments', paymentsPage(parts[1]));
  else if (route === 'prozorro') page = prozorroPage(parts[1]);
  else if (route === 'eib') page = eibPage();
  else if (route === 'overview') { page = overviewPage(); key = 'search'; }
  else if (route === 'tracked' && /^[0-9a-f]{32}$/.test(parts[1] || '')) { page = trackedDossier(parts[1]); key = 'tracked'; }
  else if (route === 'orgs') { page = sectionTabs('search', 'orgs', orgsPage()); key = 'search'; }
  else if (route === 'org' && /^\d+$/.test(parts[1] || '')) { page = orgPage(parts[1], parts[2], parts[3]); key = 'search'; }
  else if (route === 'feed') page = feedPage(parts[1]);
  else if (route === 'search') page = sectionTabs('search', 'search', searchPage());
  else if (route === 'method') { page = methodPage(); key = 'settings'; }
  else if (route === 'settings') page = settingsPage();
  else { page = trackedPage(parts[1]); key = 'tracked'; }
  fill(app, shell(key, page));
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

// Re-render only when nothing is being edited or read in a sheet.
function softRender() {
  const busy = document.querySelector('.sheet') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  if (!busy) render();
}

// Before v0.10 lists were shared: move the user's own contract picks into their list, once.
let migrated = false;
async function migrateOnce() {
  if (migrated || !cloud || !state.user) return;
  migrated = true;
  try {
    const role = (code) => ((state.all.orgs.find((o) => o.edrpou === code) || {}).role || 'buyer');
    const n = await cloud.migrateLegacy(role);
    if (n) toast(t('tr.migrated', { n }));
  } catch (e) { /* nothing to move, or no access: fine */ }
}

async function boot() {
  render();
  loadAll().then(() => { softRender(); autoSyncDb(); }).catch((e) => { state.dataError = e.message; softRender(); });
  try {
    cloud = await import('./cloud.js?v=' + encodeURIComponent(APP.build));
    await cloud.init({
      onUser(user) {
        const was = state.user;
        state.user = user || null;
        if (user) {
          cloud.watchReviews((map) => { state.reviews = map; softRender(); });
          cloud.watchMine((m) => {
            state.mine = m;
            applyScope();
            if (m.ready) migrateOnce();
            softRender();
          });
          loadDriveState();
          autoSyncDb();
          if (!was) setTimeout(showInstallBanner, 1200);
        } else {
          state.reviews = new Map();
          state.mine = { orgs: new Map(), tracked: new Map(), shared: new Map(), ready: false };
          applyScope();
          document.querySelectorAll('.install').forEach((n) => n.remove());
        }
        render();
      },
      lang: () => LANG,
    });
  } catch (e) {
    state.cloudError = e.message || String(e);
    state.user = null;
    render();
  }
}

setupServiceWorker();
boot();

// Pick up a fresh data set without a manual reload.
setInterval(async () => {
  const before = ver();
  try {
    const idx = await getJSON('data/index.json');
    if (idx.generated_at !== before) {
      await loadAll();
      softRender();
      autoSyncDb();
    }
  } catch (e) { /* offline or mid-deploy: keep what is shown */ }
}, 10 * 60 * 1000);
