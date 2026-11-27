// Core: DOM helpers, language, formatting, the app state and site data, the portal, service worker.
'use strict';

// Комплаєнс субпроєктів (колишній «Монітор розрахунків») — робоче місце комплаєнс-аналітика поверх відкритих даних
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
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  alert: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  bank: ['M3 21h18', 'M3 10h18', 'M12 3 3 8h18z', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8'],
  building: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 10h.01', 'M15 10h.01', 'M9 14h.01', 'M15 14h.01'],
  pulse: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  ext: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  check: ['M20 6 9 17l-5-5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  chevron: ['M6 9l6 6 6-6'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
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
// A number from wherever it comes: the team's table writes "€ 592 630", "99,8%" or "1 234,5".
function toNum(x) {
  if (x == null || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).replace(/[\s\u00a0\u202f]/g, '').replace(/[^0-9,.\-]/g, '');
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? n : null;
}
function money(amount, currency) {
  const n = toNum(amount);
  if (n == null) return '—';
  return nf.format(n) + (currency && currency !== 'UAH' ? ' ' + currency : ' ₴');
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
// An ЄДРПОУ / РНОКПП as text: a spreadsheet keeps it as a number and drops the leading zero
// (04056919 → 4056919); put back to 8 digits. Anything else stays as it is.
const edrCode = (x) => { if (x == null || x === '') return x; const v = String(typeof x === 'number' ? Math.round(x) : x).trim(); return /^\d{5,7}$/.test(v) ? v.padStart(8, '0') : v; };
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
    opts.link ? h('a', { class: 'toast-btn', href: opts.link.href, target: '_blank', rel: 'noopener noreferrer' }, opts.link.label) : null,
    h('button', { class: 'toast-x', 'aria-label': t('ui.close'), onclick: () => el.remove() }, '×'));
  box.append(el);
  // A result to read stays a little longer; only what waits for an answer (or work in progress) stays.
  if (!opts.sticky) setTimeout(() => el.remove(), opts.long ? 12000 : opts.bad ? 7000 : opts.link ? 9000 : 3500);
  return el;
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

// ---- state and site data ----------------------------------------------------------------------------

const state = {
  index: null, feed: null, signals: null, search: null, user: undefined, trackedIndex: { items: [] }, cloudError: null, dataError: null,
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
  state.all = { orgs: state.index.orgs || [], feed: feed.items || [], signals: signals.items || [] };
  applyScope();
}

// Each user sees only the organisations in their own list, and the feed and signals of those.
// The team (people with registry access) shares one base: everyone's organisations on monitoring
// and contracts on control; everyone else sees their own.
const isTeam = () => typeof hasRegistry === 'function' && hasRegistry();
const onTeamList = (id) => isTracked(id) || isSharedWithMe(id) || (isTeam() && !!trackedRow(id));
function applyScope() {
  if (!state.index) return;
  const mineOrg = (code) => isTeam() || state.mine.orgs.has(code);
  state.index.orgs = state.all.orgs.filter((o) => mineOrg(o.edrpou));
  state.feed = { items: state.all.feed.filter((i) => mineOrg(i.org_edrpou)) };
  state.signals = { items: state.all.signals.filter((x) => mineOrg(x.org_edrpou)).concat(trackedSignals()) };
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

// ---- dictionaries -----------------------------------------------------------------

const kindOne = (k) => t('kind.' + k);
const roleLabel = (r) => t('role.' + r);
const ROLES_FOR = {
  transaction: ['payer', 'recipient'],
  contract: ['disposer', 'contractor'], act: ['disposer', 'contractor'], addendum: ['disposer', 'contractor'], peny: ['disposer', 'contractor'],
};
// Three groups of compliance control; every signal type belongs to one.
const SIG_GROUPS = {
  fin: ['overpaid', 'paid_before', 'paid_over_acts', 'acts_over', 'no_contract', 'pz_treasury_mismatch', 'advance_over_30', 'advance_not_closed', 'advance_no_guarantee'],
  proc: ['no_tender', 'split', 'single_bidder', 'disqualified_lower_bid', 'concentration', 'unanswered_questions', 'sasu_violation'],
  contract: ['price_up', 'late', 'chain_extensions', 'missing_kb2v', 'missing_eib_covenants', 'doc_unpublished', 'doc_date_mismatch', 'doc_published_late'],
};
const sigGroup = (type) => Object.keys(SIG_GROUPS).find((g) => SIG_GROUPS[g].includes(type)) || 'fin';
function groupPills(list, value, onpick) {
  const n = (g) => list.filter((x) => sigGroup(x.type) === g).length;
  return pills([['', t('sigs.allGroups'), list.length], ['fin', t('grp.fin'), n('fin')], ['proc', t('grp.proc'), n('proc')], ['contract', t('grp.contract'), n('contract')]]
    .filter((p) => p[0] === '' || p[2] || p[0] === value), value, onpick);
}
// Signals of one's contracts on control, as cards of the signals page.
// Only what came up after the contract was taken on control (by this user, for one shared later):
// what was there already is in the dossier, not news.
function trackedSignals() {
  return (state.trackedIndex.items || []).filter((r) => onTeamList(r.key))
    .flatMap((r) => {
      const pick = state.mine.tracked.get(r.key) || state.mine.shared.get(r.key) || {};
      const from = pickTime(pick);
      return (r.signals || []).filter((x) => x.since && !x.base && (!from || x.since >= from)).map((x) => Object.assign({}, x, {
        tracked: r.key, org_edrpou: r.buyer || r.org, org_name: r.buyer_name, party: r.supplier_name, date: x.since.slice(0, 10), contract: null, ext_ids: [],
      }));
    });
}
// When a pick was made, as an ISO time (Firestore time, milliseconds or a string).
function pickTime(p) {
  const v = p.addedAt || p.at || p.sharedAt;
  if (!v) return '';
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v.toDate) return v.toDate().toISOString();
  if (v.seconds) return new Date(v.seconds * 1000).toISOString();
  return String(v);
}
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
