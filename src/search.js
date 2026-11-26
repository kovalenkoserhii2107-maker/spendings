// EIB procurements, reminders and the one search over the Treasury and Prozorro.
'use strict';

// ---- procurements financed by the European Investment Bank, across all of Prozorro ----

const loadEib = () => cached('eib:' + ver(), () => getJSON('data/eib.json', ver()));
const eibOrg = (t0) => ({ edrpou: t0.buyer || '', name: t0.buyer_name || '', role: 'buyer' });

function openEibTender(t0) {
  const funders = (t0.funders || []).map((x) => x.name).filter(Boolean);
  sheet(
    h('div', { class: 'eyebrow' }, t0.tid),
    h('h2', null, t0.title || '—'),
    h('div', { class: 'chips' }, pzStatus(t0.status), h('span', { class: 'tag' }, label('pzt.', t0.method)),
      h('span', { class: 'tag eib' }, t('eib.kind.' + t0.eib)), subprojectOf(t0) ? h('span', { class: 'tag eib', title: t('sub.title') }, subprojectOf(t0).code) : null),
    kv([[t('eib.buyer'), party(t0.buyer_name, t0.buyer)], [t('eib.region'), t0.region], [t('eib.funders'), funders.join(', ')],
      [t('pz.colValue'), t0.value ? money(t0.value.amount, t0.value.currency) : ''], [t('col.date'), fdate(t0.date)], ['CPV', t0.cpv]]),
    (t0.terms || []).length ? h('section', null, h('h3', null, t('tr.stages')), h('div', { class: 'explain' }, t0.terms.map((m) => h('div', { class: 'pay' }, h('span', null, milestoneText(m)))))) : null,
    (t0.awards || []).length ? h('section', null, h('h3', null, t('dos.awards')), awardsTable(t0.awards)) : null,
    h('section', null, h('h3', null, t('kinds.contract')),
      (t0.contracts || []).length ? h('div', { class: 'tr-list eib-list' }, t0.contracts.map((c) => h('div', { class: 'tr-card' },
        (c.signals || []).length ? h('div', { class: 'chips', style: 'margin:0' }, c.signals.map((x) => h('span', { class: 'sev ' + x.severity }, t('sigtype.' + x.type)))) : null,
        h('div', { class: 'chips', style: 'margin:0' }, h('span', { class: 'pz-st ' + (c.status === 'active' ? 'ok' : c.status === 'terminated' ? 'off' : 'run') }, label('pzc.', c.status))),
        h('b', { style: 'font-size:16px' }, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
        h('div', { class: 'cell-sub' }, (c.suppliers || []).map((x) => party(x.name, x.code)).join(', ')),
        h('div', { class: 'facts' },
          h('div', null, h('small', null, t('pz.contractValue')), h('b', { class: 'num' }, c.value ? money(c.value.amount, c.value.currency) : '—')),
          h('div', null, h('small', null, t('eib.term')), h('b', null, c.start || c.end ? `${fdate(c.start)} — ${fdate(c.end)}` : '—')),
          h('div', null, h('small', null, t('eib.changes')), h('b', { class: 'num' }, ni.format(c.changes || 0)))),
        h('div', { class: 'row', style: 'margin-top:10px' }, trackButton(eibOrg(t0), t0, c)))))
        : h('p', { class: 'muted small' }, t('pz.noContractYet'))),
    String(t0.cpv || '').startsWith('45') ? liveRelated(t0) : null,
    h('div', { class: 'row after' }, !hasSigned(t0) ? trackTenderButton(t0) : null, ext(pzUrl(t0.tid), t('pz.openOnProzorro')), t0.dream_id ? ext(dreamUrl(t0.dream_id), 'DREAM') : null));
}

function awardsTable(awards) {
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', null, t('eib.supplier')), h('th', null, t('pz.status')), h('th', { class: 'r' }, t('col.amount')))),
    h('tbody', null, awards.map((a) => h('tr', null,
      td(t('col.date'), { class: 'num' }, fdate(a.date)),
      td(t('eib.supplier'), { class: 'w-party' }, party(a.supplier_name, a.supplier_code) || '—'),
      td(t('pz.status'), null, h('span', { class: 'tag' + (a.status === 'active' ? ' ok' : a.status === 'unsuccessful' ? ' bad' : '') }, label('award.', a.status))),
      td(t('col.amount'), { class: 'r num' }, a.amount != null ? money(a.amount) : '—'))))));
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
        td(L.subj, { class: 'w-text' }, h('div', { class: 'clamp' }, (c && c.title) || t0.title || '—'), t0.eib !== 'funder' ? h('span', { class: 'tag' }, t('eib.kind.' + t0.eib)) : null,
          c && (c.signals || []).length ? h('div', { class: 'chips', style: 'margin:4px 0 0' }, c.signals.slice(0, 3).map((x) => h('span', { class: 'sev ' + x.severity }, t('sigtype.' + x.type)))) : null),
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

function eibBrowser(q0) {
  const box = h('div', null, h('div', { class: 'card empty' }, t('ui.loading')));
  const f = { which: q0 ? '' : 'contracts', kind: '', region: '', q: q0 || '', page: 0 };
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
    const q = h('input', { class: 'input', type: 'search', value: f.q, placeholder: t('eib.searchHint'), 'aria-label': t('ui.search'), oninput: () => { f.q = q.value; f.page = 0; draw(); } });
    fill(box, tiles, h('div', { class: 'table-card section' },
      h('div', { class: 'table-tools' },
        pills([['contracts', t('eib.fContracts'), n('contracts')], ['active', t('eib.fActive'), n('active')], ['open', t('eib.fOpen'), n('open')], ['tracked', t('tr.onControl'), n('tracked')], ['', t('ui.all'), all.length]]
          .filter((p) => p[0] === '' || p[0] === 'contracts' || p[2]), f.which, (v) => { f.which = v; f.page = 0; draw(); }),
        select([['', t('eib.anyKind')], ['funder', t('eib.kind.funder')], ['program', t('eib.kind.program')], ['text', t('eib.kind.text')]], '', (e) => { f.kind = e.target.value; f.page = 0; draw(); }, t('eib.kind')),
        regions.length > 1 ? select([['', t('eib.anyRegion')]].concat(regions.map((r) => [r, r])), '', (e) => { f.region = e.target.value; f.page = 0; draw(); }, t('eib.region')) : null,
        q),
      list));
    draw();
  })();
  return box;
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
// Registry tasks of mine due by today count too.
const myDueTasks = () => (typeof dueTasks === 'function' ? dueTasks(0) : []);
// For the team the bell is reminders: my tasks and guarantees that are due (changes are under «Сигнали»).
const bellCount = () => (isTeam() ? myDueTasks().length : newTrackedEvents() + unreadCount() + myDueTasks().length);

// The team's bell: reminders. My tasks and the guarantees of my sub-projects, overdue, due today and
// within a week, each opening the sub-project's Work tab; the Treasury's new records folded in a tab.
function remindersPage(preset) {
  const tab = { which: preset === 'portal' ? 'portal' : 'tasks' };
  const box = h('div');
  const list = typeof dueTasks === 'function' ? dueTasks(7) : [];
  const drawTasks = () => {
    const groups = [['bad', t('ntf.overdue'), list.filter((x) => x.due < today())], ['', t('ntf.today'), list.filter((x) => x.due === today())], ['', t('ntf.week'), list.filter((x) => x.due > today())]];
    return h('div', { class: 'card pad' }, list.length ? groups.filter((g) => g[2].length).map(([cls, title, items]) => h('div', { class: 'rm-group ' + cls },
      h('h3', null, title + ' · ' + items.length),
      h('div', { class: 'ev-feed' }, items.map((x) => h('a', { class: 'ev-row' + (x.due < today() ? ' bad' : x.due === today() ? ' new' : ''), href: '#/sp/' + encodeURIComponent(x.code) + '/work' },
        h('span', { class: 'd num' }, fdate(x.due)),
        h('span', null, h('b', null, x.code), h('span', { class: 'faint small' }, ' · ' + x.name.slice(0, 90)), h('div', null, x.text)))))))
      : h('div', { class: 'empty' }, h('b', null, t('ntf.noTasks')), h('p', { class: 'muted small' }, t('ntf.noTasksHint'))));
  };
  const drawPortal = () => {
    const f = { page: 0 };
    const out = h('div');
    const draw = () => pagedList(out, state.feed.items, f.page, { showOrg: true, marks: true, noSum: true, emptyTitle: t('feed.empty'), emptyText: t('feed.emptyText') }, (p) => { f.page = p; draw(); });
    draw();
    return h('div', { class: 'table-card' }, h('p', { class: 'muted small', style: 'padding:14px 16px 0' }, t('ntf.portalHint')), out);
  };
  const show = () => fill(box, tab.which === 'portal' ? drawPortal() : drawTasks());
  const tabs = pills([['tasks', t('ntf.remind'), list.length || null], ['portal', t('ntf.portal2'), unreadCount() || null]], tab.which, (v) => { tab.which = v; show(); });
  show();
  return [
    pageHead(t('ntf.remind'), titleGrad(t('ntf.rTitle1'), t('ntf.rTitle2')), t('ntf.rLead'),
      h('div', { class: 'row' }, tabs, unreadCount() ? h('button', { class: 'btn', onclick: () => { if (state.feed.items.length) setSeen(state.feed.items[0].first_seen_at); render(); }, title: t('ntf.portal2') }, icon('check'), t('feed.markRead')) : null)),
    box,
  ];
}


// ---- live search ---------------------------------------------------------------------------------

// ---- the main entry: one search over the Treasury and Prozorro ----------------------------------
//
// A code (EDRPOU) finds the organisation: its card with "start monitoring", its procedures and
// contracts in Prozorro, and its Treasury contracts of the last year. Any other text searches
// Prozorro procedures. Each contract can be taken on control right from here.
const PZ_PROXY = 'https://script.google.com/macros/s/AKfycbxJsXhPf2vr0tM-TpXwBwR81RKeq6Vs01cIsjtCgh-M3UqamFFpHd4iM11ezasjac4/exec';
// Something was just put on control or on monitoring: ask the proxy to start the sync now
// (GitHub runs its schedule unreliably). Fire and forget.
function nudgeSync() {
  if (/PROXY_URL/.test(PZ_PROXY)) return;
  fetch(PZ_PROXY + '?action=nudge', { mode: 'no-cors' }).catch(() => {});
}
async function pzProxy(params) {
  if (/PROXY_URL/.test(PZ_PROXY)) throw new Error(t('qs.noProxy'));
  const res = await fetch(PZ_PROXY + '?' + new URLSearchParams(params));
  const d = await res.json();
  if (d.error) throw new Error('Prozorro: ' + d.error);
  return d;
}
// One search over every source. The query decides what is looked up: a code (EDRPOU) the
// organisation and everything about it, a procurement id (UA-…) that procurement, any other
// text procurement and organisations by name. Filters narrow the kind, the sources, the
// period and the role; "EIB only" searches the catalogue of EIB-financed procurement.
const SEARCH_TYPES = ['all', 'orgs', 'contracts', 'tenders', 'payments'];
const qs2 = { q: '', type: 'all', treasury: true, prozorro: true, eib: false, from: addDays(today(), -365), to: today(), role: 'any' };
function searchPage(preset) {
  if (preset === 'eib') qs2.eib = true;
  const out = h('div');
  const input = h('input', { class: 'input', type: 'search', value: qs2.q, placeholder: t('qs.hint'), 'aria-label': t('qs.hint') });
  const typeBox = h('div');
  const drawTypes = () => fill(typeBox, pills(SEARCH_TYPES.map((k) => [k, t('qs.type.' + k)]), qs2.type, (v) => { qs2.type = v; run(); }));
  const chk = (key, labelKey) => h('label', { class: 'chk-opt' }, h('input', { type: 'checkbox', checked: qs2[key] || null, onchange: (e) => { qs2[key] = e.target.checked; drawFilters(); run(); } }), t(labelKey));
  // Filters as a grid of "label — choices", the same column on every row.
  const filters = h('div', { class: 'qs-grid' });
  const drawFilters = () => fill(filters,
    h('div', { class: 'qs-lbl' }, t('qs.sources')),
    h('div', { class: 'qs-opts' }, chk('treasury', 'qs.src.treasury'), chk('prozorro', 'qs.src.prozorro'), chk('eib', 'qs.src.eib')),
    !qs2.eib ? [
      h('div', { class: 'qs-lbl' }, t('qs.period')),
      h('div', { class: 'qs-period' },
        h('input', { class: 'input', type: 'date', value: qs2.from, 'aria-label': t('ui.from'), onchange: (e) => { qs2.from = e.target.value; run(); } }),
        h('span', { class: 'qs-dash' }, '—'),
        h('input', { class: 'input', type: 'date', value: qs2.to, 'aria-label': t('ui.to'), onchange: (e) => { qs2.to = e.target.value; run(); } })),
      h('div', { class: 'qs-lbl' }, t('qs.role')),
      h('div', { class: 'qs-opts' }, select([['any', t('qs.role.any')], ['buyer', t('qs.role.buyer')], ['supplier', t('qs.role.supplier')]], qs2.role, (e) => { qs2.role = e.target.value; run(); }, t('qs.role')))] : null);
  const want = (type) => qs2.type === 'all' || qs2.type === type;
  function run() {
    qs2.q = input.value.trim();
    const q = qs2.q;
    if (qs2.eib) { fill(out, eibBrowser(q)); return; }
    if (!q) { fill(out, h('div', { class: 'card empty' }, h('b', null, t('qs.emptyTitle')), t('qs.emptyText'))); return; }
    const code = /^\d{8,10}$/.test(q) ? q : null;
    const tid = /^UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z]$/i.test(q) ? q.toUpperCase().replace(/-([A-Z])$/, (m, x) => '-' + x.toLowerCase()) : null;
    const blocks = [];
    const buyerSide = qs2.role !== 'supplier', supplierSide = qs2.role !== 'buyer';
    if (code) {
      const org = orgFound(code);
      if (want('orgs')) blocks.push(org);
      if (want('tenders') && qs2.prozorro && buyerSide) blocks.push(pzList(t('qs.asBuyer'), { action: 'search', kind: 'tenders', buyer: code }));
      if (want('contracts') && qs2.prozorro && supplierSide) blocks.push(pzList(t('qs.asSupplier'), { action: 'search', kind: 'contracts', supplier: code }));
      if (want('contracts') && qs2.treasury) blocks.push(treasuryList(code, org.setName, qs2));
      if (want('payments') && qs2.treasury) blocks.push(paymentsList(code, qs2, qs2.type === 'payments' ? null : 4000));
    } else if (tid) {
      if (qs2.prozorro) blocks.push(tenderFound(tid));
    } else {
      if (want('orgs')) blocks.push(orgsByName(q));
      if ((want('tenders') || want('contracts')) && qs2.prozorro) blocks.push(pzList(t('qs.byText'), { action: 'search', kind: 'tenders', text: q }));
      if (want('payments') || (want('contracts') && qs2.treasury)) blocks.push(h('p', { class: 'muted small qs-note' }, t('qs.needCode')));
    }
    fill(out, blocks.length ? blocks : h('div', { class: 'empty' }, t('qs.nothingToSearch')));
  }
  const form = h('form', { class: 'qs-form', onsubmit: (e) => { e.preventDefault(); run(); } }, input, h('button', { class: 'btn btn-dark', type: 'submit' }, icon('search'), t('srch.go')));
  drawTypes();
  drawFilters();
  setTimeout(run);
  return [pageHead(t('srch.eyebrow'), titleGrad(t('srch.title1'), t('srch.title2')), null),
    h('div', { class: 'card section qs' }, form,
      h('div', { class: 'qs-grid qs-first' }, h('div', { class: 'qs-lbl' }, t('qs.what')), typeBox),
      // On a phone the other filters fold away under one line.
      h('details', { class: 'qs-more', open: window.innerWidth > 760 || null }, h('summary', null, t('qs.filters')), filters)),
    h('div', { class: 'qs-results' }, out)];
}

// Organisations whose name contains the text: the ones the app has met (on monitoring,
// in the EIB catalogue, in the Treasury names it looked up).
function orgsByName(q) {
  const box = h('div', { class: 'qs-block' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-sub' }, t('qs.orgsByName'))), h('div', { class: 'muted small' }, t('ui.loading')));
  (async () => {
    const found = new Map();
    const add = (code, name) => { if (realCode(code) && name && !found.has(code)) found.set(code, name); };
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const hit = (name) => words.length && words.every((w) => String(name || '').toLowerCase().includes(w));
    (state.all.orgs || []).forEach((o) => hit(o.name) && add(o.edrpou, o.name));
    try { const names = await getJSON('data/names.json', ver()); Object.entries(names).forEach(([c, n]) => hit(n) && add(c, n)); } catch (e) { /* none */ }
    try {
      const eib = await loadEib();
      (eib.items || []).forEach((t0) => { if (hit(t0.buyer_name)) add(t0.buyer, t0.buyer_name); (t0.contracts || []).forEach((c) => (c.suppliers || []).forEach((x) => hit(x.name) && add(x.code, x.name))); });
    } catch (e) { /* none */ }
    const rows = [...found.entries()].slice(0, 30);
    fill(box, h('div', { class: 'card-head' }, h('h3', { class: 'card-sub' }, t('qs.orgsByName'))),
      rows.length ? h('div', { class: 'qs-list' }, rows.map(([code, name]) => h('div', { class: 'qs-row click', tabindex: 0, onclick: () => { location.hash = '#/search'; qs2.q = code; render(); } },
        h('div', null, h('b', null, name), h('div', { class: 'cell-sub num' }, t('f.edrpou') + ' ' + code)),
        h('div', { class: 'qs-side' }, state.mine.orgs.has(code) ? h('span', { class: 'tag ok' }, t('org.monitoring')) : h('span', { class: 'btn btn-sm' }, t('qs.open'), icon('arrow'))))))
        : h('div', { class: 'muted small' }, t('qs.none')));
  })();
  return box;
}

// One procurement by its id: its contracts and "follow".
function tenderFound(tid) {
  const box = h('div', { class: 'qs-block' }, h('div', { class: 'muted small' }, t('ui.loading')));
  (async () => {
    try {
      const t0 = (await pzProxy({ action: 'tender', tid })).tender;
      fill(box, h('div', { class: 'qs-row' },
        h('div', null, h('b', null, t0.title || tid), h('div', { class: 'cell-sub' }, join([tid, t0.buyer_name, label('pzs.', t0.status)])), pzContracts(t0)),
        h('div', { class: 'qs-side' }, t0.value ? h('b', { class: 'num' }, money(t0.value.amount, t0.value.currency)) : null, ext(pzUrl(tid), 'Prozorro'))));
    } catch (e) {
      fill(box, h('div', { class: 'muted small' }, e.message));
    }
  })();
  return box;
}

// Treasury payments of the organisation in the period (payer, recipient or both).
function paymentsList(code, f, delay) {
  const list = h('div', null, h('div', { class: 'muted small' }, t('ui.loading')));
  (async () => {
    try {
      if (delay) await new Promise((r) => setTimeout(r, delay));  // after the contracts, not alongside
      const roles = f.role === 'buyer' ? ['payer'] : f.role === 'supplier' ? ['recipient'] : ['payer', 'recipient'];
      const from = f.from > addDays(f.to, -366) ? f.from : addDays(f.to, -366);
      // One request at a time: the portal turns away parallel ones.
      const raws = [];
      for (const r of roles) raws.push(...await portalTransactions(code, r, from, f.to));
      const seen = new Set();
      const items = raws.map((raw) => Object.assign(normalize('transaction', raw, code), { kind: 'transaction', data: raw }))
        .filter((i) => !seen.has(i.ext_id) && seen.add(i.ext_id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const box = h('div');
      let page = 0;
      const draw = () => pagedList(box, items, page, { emptyText: t('qs.none') }, (p) => { page = p; draw(); });
      draw();
      fill(list, box);
    } catch (e) {
      fill(list, h('div', { class: 'muted small' }, e.message));
    }
  })();
  return h('div', { class: 'qs-block qs-flush' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-sub' }, t('qs.payments'))), list);
}

// The organisation behind a code: its Treasury card and whether it is on monitoring.
function orgFound(code) {
  const box = h('div', { class: 'qs-org' }, h('div', { class: 'muted small' }, t('ui.loading')));
  let nameEl = null, known = '';
  box.setName = (n) => { known = known || n; if (nameEl && nameEl.dataset.missing) { nameEl.textContent = n; delete nameEl.dataset.missing; } };
  (async () => {
    let card = null;
    try { card = await portal('/v2/disposers/' + code); } catch (e) { /* not a disposer: still may be a supplier */ }
    const name = (card && card.orgName) || (orgByCode(code) || {}).name || known || '';
    const on = state.mine.orgs.has(code);
    const addBtn = (role) => {
      const b = h('button', { class: 'btn btn-sm' + (role === 'buyer' ? ' btn-dark' : ''), onclick: async () => {
        b.disabled = true;
        try { await cloud.addOrg(code, name || known, role); nudgeSync(); toast(t('addorg.addedNow', { name: name || known || code })); render(); } catch (e) { b.disabled = false; toast(e.message, { bad: true }); }
      } }, icon('building'), t(role === 'buyer' ? 'qs.monitorBuyer' : 'qs.monitorSupplier'));
      return b;
    };
    fill(box,
      h('div', null, h('small', { class: 'muted' }, t('f.edrpou') + ' ' + code), nameEl = h('h3', name ? null : { 'data-missing': '1' }, name || t('qs.unknownOrg')),
        card && card.address ? h('div', { class: 'small muted' }, address(card.address)) : null),
      h('div', { class: 'row' },
        on ? [h('span', { class: 'tag ok' }, t('org.monitoring'))]
          : [addBtn('buyer'), addBtn('supplier')]),
      partyLinks(code, 'buyer'));
  })();
  return box;
}

// Prozorro procedures or contracts from a search; a procedure opens into its contracts.
// Prozorro search results as a table: sorted and filtered by Prozorro itself (the proxy passes
// the filters on), the period by the date in the procurement id. "Show more" adds the next part.
const PZ_METHODS = ['reporting', 'priceQuotation', 'belowThreshold', 'aboveThreshold', 'aboveThresholdUA', 'aboveThresholdEU', 'negotiation', 'negotiation.quick',
  'competitiveDialogueUA', 'competitiveOrdering', 'closeFrameworkAgreementSelectionUA', 'esco', 'simple.defense', 'requestForProposal'];
const PZ_TSTATUS = ['active.enquiries', 'active.tendering', 'active.auction', 'active.qualification', 'active.awarded', 'complete', 'unsuccessful', 'cancelled'];
const PZ_CSTATUS = ['active', 'terminated', 'cancelled'];
function pzList(title, params) {
  const contracts = params.kind === 'contracts';
  const f = { sort: 'date_desc', status: '', proc_type: '', vmin: '', vmax: '', words: '' };
  const head = h('div', { class: 'card-head' }, h('h3', { class: 'card-sub' }, title, ' · Prozorro'));
  const list = h('div');
  const foot = h('div', { class: 'foot' });
  let rows = [], next = null, order = null, seq = 0;
  const query = (cursor) => {
    const q = Object.assign({}, params, { sort: f.sort, status: f.status, proc_type: f.proc_type, vmin: f.vmin, vmax: f.vmax, from: qs2.from || '', to: qs2.to || '' });
    if (f.words) q.text = [params.text, f.words].filter(Boolean).join(' ');
    if (cursor) { q.cursor = cursor; if (order) q.order = order; }
    return q;
  };
  const sortBtn = (key, text) => {
    const on = f.sort.startsWith(key);
    const dir = on && f.sort.endsWith('asc') ? '↑' : on ? '↓' : '';
    return h('button', { class: 'th-sort' + (on ? ' on' : ''), type: 'button', onclick: () => { f.sort = key + (on && f.sort.endsWith('desc') ? '_asc' : '_desc'); sortSel.value = f.sort; load(); } }, text, dir ? h('span', null, ' ' + dir) : null);
  };
  // The searched organisation is the same in every row: show the other side, or no column.
  const showParty = !params.buyer;
  const L = { d: t('col.date'), s: t('col.subject'), p: t('qs.colBuyer'), st: t('pz.status'), v: t('pz.colValue') };
  const cols = showParty ? 6 : 5;
  function table() {
    if (!rows.length) return h('div', { class: 'empty' }, h('b', null, t('qs.none')), t('sigs.changeFilter'));
    return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, sortBtn('date', L.d)), h('th', null, L.s), showParty && h('th', null, L.p), h('th', null, L.st), h('th', { class: 'r' }, sortBtn('value', L.v)), h('th'))),
      h('tbody', null, rows.map((r) => {
        const more = h('tr', { class: 'detail', hidden: true }, h('td', { colspan: cols, 'data-label': '' }));
        const btn = h('button', { class: 'btn btn-sm', onclick: async () => {
          if (!more.hidden) { more.hidden = true; return; }
          more.hidden = false;
          fill(more.firstChild, h('div', { class: 'muted small' }, t('ui.loading')));
          try { fill(more.firstChild, pzContracts((await pzProxy({ action: 'tender', tid: r.tid })).tender)); } catch (e) { fill(more.firstChild, h('div', { class: 'small' }, e.message)); }
        } }, t('qs.contracts'));
        return [h('tr', null,
          td(L.d, { class: 'num' }, fdate(r.date || String(r.tid || '').slice(3, 13))),
          td(L.s, { class: 'w-text' }, h('div', { class: 'clamp' }, r.title || r.tid), h('div', { class: 'cell-sub num' }, h('a', { href: pzUrl(r.tid), target: '_blank', rel: 'noopener noreferrer' }, contracts && r.cid ? r.cid : r.tid))),
          showParty && td(L.p, { class: 'w-party' }, party(r.buyer_name, r.buyer)),
          td(L.st, null, h('span', { class: 'tag' }, (contracts ? label('pzc.', r.status) : label('pzs.', r.status)) || r.status)),
          td(L.v, { class: 'r num' }, r.value ? money(r.value.amount, r.value.currency) : '—'),
          td('', { class: 'r' }, btn)), more];
      }))));
  }
  async function load(append) {
    const my = ++seq;
    if (!append) { rows = []; next = null; order = null; fill(list, h('div', { class: 'empty' }, t('ui.loading'))); fill(foot); }
    try {
      const d = await pzProxy(query(append ? next : null));
      if (my !== seq) return;
      rows = rows.concat(d.items || []);
      next = d.next || null;
      order = d.order || order;
      fill(list, table());
      fill(foot,
        h('div', null, d.total != null && !append ? t('qs.found', { n: ni.format(d.total) }) + (d.capped ? ' · ' + t('qs.capped') : '') : t('qs.shown', { n: ni.format(rows.length) }),
          d.gap ? ' · ' + t('qs.gap') : ''),
        next ? h('button', { class: 'btn btn-sm', onclick: (e) => { e.target.disabled = true; load(true); } }, t('qs.more')) : null);
    } catch (e) {
      if (my === seq) fill(list, h('div', { class: 'empty' }, e.message));
    }
  }
  const set = (k) => (e) => { f[k] = e.target.value.trim(); load(); };
  const sortSel = select(['date_desc', 'date_asc', 'value_desc', 'value_asc'].map((k) => [k, t('qs.sort.' + k)]), f.sort, set('sort'), t('qs.sort'));
  const statusSel = select([['', t('cf.anyStatus')]].concat((contracts ? PZ_CSTATUS : PZ_TSTATUS).map((x) => [x, label(contracts ? 'pzc.' : 'pzs.', x)])), '', set('status'), t('pz.status'));
  const methodSel = !contracts ? select([['', t('pz.anyMethod')]].concat(PZ_METHODS.map((m) => [m, label('pzt.', m)])), '', set('proc_type'), t('pz.colMethod')) : null;
  const num = (k, ph) => h('input', { class: 'input', type: 'number', min: 0, step: 'any', inputmode: 'decimal', placeholder: ph, 'aria-label': t('pz.colValue') + ' ' + ph, onchange: set(k) });
  const words = (params.buyer || params.supplier) ? h('input', { class: 'input', type: 'search', placeholder: t('qs.words'), 'aria-label': t('qs.words'), onchange: set('words') }) : null;
  const field = (lbl, el) => el && h('label', { class: 'field' }, h('span', null, lbl), el);
  load();
  return h('div', { class: 'qs-block qs-table' }, head,
    h('div', { class: 'pz-tools' },
      field(t('qs.sort'), sortSel), field(t('pz.status'), statusSel), field(t('pz.colMethod'), methodSel),
      h('div', { class: 'field' }, h('span', null, t('pz.colValue')), h('div', { class: 'cf-range' }, num('vmin', t('cf.from')), num('vmax', t('cf.to')))),
      field(t('qs.wordsLbl'), words)),
    list, foot);
}

function pzContracts(t0) {
  const org = { edrpou: t0.buyer, name: t0.buyer_name, role: 'buyer' };
  if (!(t0.contracts || []).length) return h('div', { class: 'qs-contracts' }, h('div', { class: 'qs-contract' }, h('span', { class: 'muted small' }, t('pz.noContractYet')), trackTenderButton(t0)));
  return h('div', { class: 'qs-contracts' }, t0.contracts.map((c) => h('div', { class: 'qs-contract' },
    h('div', null, h('b', null, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
      h('div', { class: 'cell-sub' }, join([(c.suppliers || []).map((x) => party(x.name, x.code)).join(', '), c.value ? money(c.value.amount, c.value.currency) : null, label('pzc.', c.status)]))),
    c.status !== 'cancelled' ? trackButton(org, t0, c) : null)));
}

// The organisation's Treasury contracts of the last year, either side.
function treasuryList(code, onName, f) {
  const list = h('div', { class: 'qs-list' }, h('div', { class: 'muted small' }, t('ui.loading')));
  (async () => {
    try {
      const from = (f && f.from) || addDays(today(), -365), to = (f && f.to) || today();
      const roles = f && f.role === 'buyer' ? ['disposer'] : f && f.role === 'supplier' ? ['contractor'] : ['disposer', 'contractor'];
      const [parts, names] = await Promise.all([
        Promise.all(roles.map((role) => portalDocuments('contract', code, role, from, to).catch(() => ({ docs: [] })))),
        getJSON('data/names.json', ver()).catch(() => ({})),
      ]);
      const docs = parts.flatMap((p) => p.docs).sort((a, b) => (b.documentDate || '').localeCompare(a.documentDate || ''));
      // A supplier has no disposer card: its name comes from the contracts that name it.
      const self = docs.flatMap((d) => d.contractors || []).find((c) => c.identifier === code);
      if (self && self.name && onName) onName(self.name);
      fill(list, docs.length ? docs.slice(0, 50).map((d) => {
        const sup = (d.contractors || [])[0] || {};
        const buyer = names[d.edrpou] || d.edrpou;
        const open = () => openRecord({ kind: 'contract', role: d.edrpou === code ? 'disposer' : 'contractor', data: d, date: (d.documentDate || '').slice(0, 10),
          amount: d.amount, currency: d.currency || 'UAH', cp_name: d.edrpou === code ? sup.name : buyer });
        return h('div', { class: 'qs-row click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
          h('div', null, h('b', null, t('dos.heading', { n: d.documentNumber || '—', date: fdate(d.documentDate) })),
            h('div', { class: 'cell-sub' }, join([d.edrpou === code ? sup.name : t('qs.buyer', { name: buyer }), d.subject])),
            d.idTenderProzorro ? h('span', { class: 'tag pz' }, 'Prozorro ' + d.idTenderProzorro) : null),
          h('div', { class: 'qs-side', onclick: (e) => e.stopPropagation() }, h('b', { class: 'num' }, money(d.amount, d.currency)), trackTreasuryButton(d)));
      }) : h('div', { class: 'muted small' }, t('qs.none')));
    } catch (e) {
      fill(list, h('div', { class: 'muted small' }, e.message));
    }
  })();
  return h('div', { class: 'qs-block' }, h('div', { class: 'card-head' }, h('h3', { class: 'card-sub' }, t('qs.treasury'))), list);
}

// "Take on control" for a procurement that has no contract yet: key "tn" + its Prozorro id.
function trackTenderButton(t0) {
  if (!t0 || !t0.id || !t0.tid) return null;
  const cid = 'tn' + t0.id;
  const done = () => h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + cid, onclick: closeSheet }, icon('star'), t('tr.tenderOnControl'));
  if (isTracked(cid)) return done();
  const btn = h('button', { class: 'btn btn-sm btn-dark', onclick: async () => {
    if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
    btn.disabled = true;
    try {
      await cloud.track(cid, { org: t0.buyer || '', tid: t0.tid, sp: '', title: t0.title || '', number: '', buyer: t0.buyer_name || '', supplier: '' }); nudgeSync();
      toast(t('tr.added'));
      btn.replaceWith(done());
    } catch (e) { btn.disabled = false; toast(t('tr.failed') + ' ' + (e.message || ''), { bad: true }); }
  } }, icon('star'), t('tr.takeTender'));
  return btn;
}
const hasSigned = (t0) => (t0.contracts || []).some((c) => ['active', 'terminated'].includes(c.status));

// "Take on control" for a Treasury contract (one Prozorro may not have): key "sp" + its id.
function trackTreasuryButton(d) {
  if (!d || !d.id || !d.edrpou) return null;
  const cid = 'sp' + d.id;
  const done = () => h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + cid, onclick: closeSheet }, icon('star'), t('tr.onControl'));
  if (isTracked(cid)) return done();
  const sup = (d.contractors || [])[0] || {};
  const btn = h('button', { class: 'btn btn-sm btn-dark', onclick: async () => {
    if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
    btn.disabled = true;
    try {
      await cloud.track(cid, { org: d.edrpou, tid: '', sp: String(d.id), signed: (d.documentDate || '').slice(0, 10), title: d.subject || '',
        number: d.documentNumber || '', buyer: (orgByCode(d.edrpou) || {}).name || '', supplier: sup.name || '' }); nudgeSync();
      toast(t('tr.added'));
      btn.replaceWith(done());
    } catch (e) { btn.disabled = false; toast(t('tr.failed') + ' ' + (e.message || ''), { bad: true }); }
  } }, icon('star'), t('tr.take'));
  return btn;
}
