// The list of sub-projects and the sub-project card: contracts, procurement, procedure, documents, work.
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
  // One "Update": Prozorro read again now for the chosen manager's sub-projects, then (for one's own)
  // what the monitor follows brought up to date. The daily run does the same by itself, quietly.
  const refreshBtn = h('button', { class: 'btn', onclick: async () => {
    const list = ofExpert();
    if (!list.length) { toast(rt('pickExpert'), { bad: true }); return; }
    await refreshMany(list);
    if (list.some(isMine)) autoTrack(true).catch(() => {});
  } });
  const drawRefresh = () => { const n = ofExpert().length; fill(refreshBtn, icon('refresh'), rt('update')); refreshBtn.title = n ? rt('updateHint', { n, who: REGF.expert }) : rt('pickExpert'); };
  drawRefresh();
  // Payments the table's Payments sheet has under codes its SPs sheet has no row for: a check of the
  // table, not everyday work; it opens from the Data menu.
  const orphans = Object.entries((meta && meta.orphans) || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const showOrphans = () => sheet(h('h2', { class: 'card-title' }, rt('orphansTitle', { n: orphans.length, sum: money(orphans.reduce((a, [, v]) => a + v, 0)) })),
    h('p', { class: 'muted small' }, rt('orphansText2')),
    h('div', { class: 'scroll' }, h('table', null, h('tbody', null, orphans.map(([c, v]) => h('tr', null, h('td', { class: 'num' }, h('b', null, c)), h('td', { class: 'r num' }, money(v))))))));
  // One visible action (Prozorro), the rest of the data work in one menu.
  const dataMenu = actionMenu(rt('dataMenu'), [
    [rt('upload'), () => file.click(), 'upload', rt('uploadHint')],
    rows.length ? [rt('mrdUpload'), () => mrdFile.click(), 'upload', rt('mrdUploadHint')] : null,
    rows.length ? [rt('export'), () => exportDialog(), 'download', rt('exportHint')] : null,
    [rt('addSp'), () => addSpDialog(null), 'plus', null],
    orphans.length ? [rt('orphansMenu', { n: orphans.length }), showOrphans, 'alert', rt('orphansMenuHint')] : null,
  ], 'db');
  const lead = h('span', null, meta ? rt('imported', { at: ftime(meta.at && meta.at.toDate ? meta.at.toDate().toISOString() : meta.at), by: meta.byName || '—', n: meta.rows }) : rt('noTable'),
    h('span', { class: 'lead-sub' }, rt('updNote', { at: (() => { const d = rows.map((r) => (r.pz || {}).at).filter(Boolean).sort().pop(); return d ? ftime(d) : '—'; })() })));
  const head = pageHead(rt('eyebrow'), titleGrad(rt('title1'), rt('title2')), lead,
    h('div', { class: 'head-actions' }, rows.length ? refreshBtn : null, dataMenu, file, mrdFile, status));
  if (!rows.length) return [head];
  const experts = [...new Set(rows.map(spManager).concat([myManager()]).filter(Boolean))].sort();
  const progs = [...new Set(rows.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  // What each row is, worked out once per drawing: stage, news, risk, the expert's work.
  const facts = new Map(rows.map((r) => {
    const st = spStage(r), news = spNews(spTracked(r)), wk = spWork(r), f = mrdFacts(r);
    const overdueTask = wk.next && wk.next.due && wk.next.due < today();
    const waiting = f ? f.waiting.filter((x) => x.days > 15).length : 0;
    const sc = scoresOf(r), conflicts = Object.keys(sc.conflict).length;
    return [r.code, { st, news, wk, rating: overallRating(sc.scores), overdueTask, waiting, conflicts,
      attention: !!(st.late || news.signals.length || overdueTask || waiting || conflicts) }];
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
  // Two levels: one's own sub-projects (kept up to date by themselves) and the whole mission
  // (for the portfolio and for reference: read only on request or from the table).
  const nMine = rows.filter(isMine).length;
  const scope = pills([[myManager(), rt('scopeMine'), nMine], ['', rt('scopeAll'), rows.length]],
    REGF.expert === myManager() ? myManager() : REGF.expert ? null : '', (v) => { REGF.expert = v; REGF.page = 0; render(); });
  return [head, h('div', { class: 'scope-switch section' }, scope), h('div', { class: 'table-card section' },
    filterBar(q, [
      select([['', rt('anyStage')]].concat(STAGES.map((x) => [x, rt('stage_' + x)])), REGF.stage, set('stage'), rt('colStage')),
      select([['', rt('anyExpert')]].concat(experts.map((x) => [x, x])), REGF.expert, set('expert'), rt('colExpert')),
      select([['', rt('anyProgramme')]].concat(progs.map((x) => [x, x])), REGF.programme, set('programme'), 'Programme'),
      select(Object.keys(SORTS).map((k) => [k, rt('sort_' + k)]), REGF.sort, set('sort'), rt('sortBy'))], [REGF.stage, REGF.expert, REGF.programme].filter(Boolean).length),
    chipsBox,
    list)];
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
  const m = mainContract(r), pw = primaryWorks(r);
  // A contract counts while it is in force: one terminated (ended early, or finished) no longer
  // holds the sub-project at "contract" or makes it late. A re-tender after the last contract ended
  // is a re-tender, whatever the table still says of the old contract.
  const live = m && m.c.status === 'active' ? m : null;
  const ended = m && m.c.status !== 'active' ? m : pw && pw.prev ? { c: pw.prev.c, t0: pw.prev.t0 } : null;
  const running = pzWorks.some((t0) => RUN.includes(t0.status)) || works.some((x) => ['Ongoing', 'Evaluation', 'Awarded'].includes(x.status));
  const tableSigned = (!pw || pw.mode === 'sheet') && (works.some((x) => x.status === 'Contract Signed') || !!(tt.contract_date || tt.contractor || toNum(tt.contract_sum) > 0));
  const pct = pctOf(spStatus(r).pct);
  let data = null;
  if (pct != null && pct >= 100) data = 'done';
  else if (live || tableSigned) data = pct > 0 ? 'works' : 'contract';
  else if (running) data = ended || works.length > 1 || pzWorks.length > 1 ? 'retender' : 'tender';
  else if (ended && pct > 0) data = 'suspended';
  else if (works.length || pzWorks.length) data = 'retender';
  const table = STAGE_OF_STATUS[tt.status] || null;
  // The table's status unless the data are clearer: a contract in force or done works move it on;
  // a contract that ended with a new tender running takes it back to re-tender.
  const order = (s) => ['prep', 'tender', 'retender', 'contract', 'works', 'done'].indexOf(s);
  let stage = table && ['suspended', 'withdrawn'].includes(table) ? table : (data && order(data) > order(table || 'prep') ? data : table || data || 'prep');
  if (ended && running && ['contract', 'works'].includes(stage)) stage = 'retender';
  // Late: the completion date of the contract in force (or the table's) passed with the works unfinished.
  const end = (live && live.c.end) || (!ended ? tt.completion : null) || null;
  const late = end && end < today() && (pct == null || pct < 100) && ['contract', 'works', 'suspended'].includes(stage) ? dayDiff(end, today()) : null;
  const failed = works.filter((x) => /No Bids|All Rejected|Cancel/i.test(x.status || '')).length + pzWorks.filter((t0) => ['unsuccessful', 'cancelled'].includes(t0.status) && !works.some((x) => x.pz === t0.tid)).length;
  const lastIssued = works.map((x) => x.issued).concat(pzWorks.map((t0) => t0.date)).filter(Boolean).sort().pop() || null;
  return { stage, from: table && stage === table ? 'table' : 'data', pct, end, late, failed, lastIssued, ended: ended ? ended.c : null,
    signed: live ? live.c.signed : ended ? null : (works.find((x) => x.status === 'Contract Signed') || {}).contract_date || tt.contract_date || null };
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
  const next = openTasks(r).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0] || null;
  const visits = activities(r).filter((a) => a.kind === 'VISIT' && a.date).map((a) => a.date).sort();
  return { next, lastVisit: visits[visits.length - 1] || null, visits: visits.length };
}

function registryTable(rows) {
  if (!rows.length) return h('div', { class: 'empty' }, t('qs.none'));
  const L = { c: rt('colCode'), s: rt('colSp'), st: rt('colStage'), k: rt('colContract'), g: rt('colDone'), r: rt('colRisk'), w: rt('colWork') };
  const oneManager = !!REGF.expert;
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile reg-table' },
    h('colgroup', null, ['c', 's', 'st', 'k', 'g', 'r', 'w'].map((k) => h('col', { class: 'rc-' + k }))),
    h('thead', null, h('tr', null, [L.c, L.s, L.st, L.k, L.g, L.r, L.w].map((x) => h('th', null, x)))),
    h('tbody', null, rows.map((r) => {
      const tt = r.t || {};
      const m = mainContract(r);
      const tids = spTids(r);
      const st = spStage(r), news = spNews(spTracked(r)), wk = spWork(r);
      const rating = overallRating(scoresOf(r).scores);
      const open = () => { location.hash = '#/sp/' + encodeURIComponent(r.code); };
      return h('tr', { class: 'click', tabindex: 0, onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
        td(L.c, { class: 'num' }, h('b', null, r.code), h('div', { class: 'cell-sub' }, join([tt.programme, tt.batch && 'B' + tt.batch])), !oneManager && spManager(r) ? h('div', { class: 'cell-sub clamp1' + (isMine(r) ? ' mine' : '') }, spManager(r)) : null, tt.manual ? h('div', { class: 'cell-sub' }, rt('manualTag')) : null),
        td(L.s, { class: 'w-text' }, h('div', { class: 'clamp' }, tt.name_uk || tt.name_en || '—'), h('div', { class: 'cell-sub clamp1' }, tt.beneficiary || '')),
        td(L.st, null, stageChip(st), st.late ? h('div', { class: 'cell-sub bad' }, rt('lateBy', { n: st.late })) : null,
          !tids.length ? h('div', { class: 'cell-sub' }, ((r.pz || {}).cand || []).length ? h('span', { class: 'warn-text' }, rt('candidates', { n: r.pz.cand.length })) : rt('notLinked'))
            : st.signed && ['contract', 'works'].includes(st.stage) ? h('div', { class: 'cell-sub' }, rt('signedOn', { date: fdate(st.signed) })) : null),
        td(L.k, { class: 'w-party' }, m ? [h('div', { class: 'cell-main clamp1' }, ((m.c.suppliers || [])[0] || {}).name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null]))]
          : tt.contractor ? tt.contractor : h('span', { class: 'faint' }, '—')),
        // Before a works contract there is nothing to have done: a dash, not "0%".
        td(L.g, { class: 'num' }, ['prep', 'tender', 'retender'].includes(st.stage) && !st.pct ? h('span', { class: 'faint' }, '—')
          : [h('b', null, st.pct != null ? st.pct + '%' : '—'), paidShare(r) != null ? h('div', { class: 'cell-sub' }, rt('paidShort', { pct: paidShare(r) })) : null]),
        td(L.r, null, h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
          rating ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][rating], title: rt('overall', { n: rating }) }, rt('riskShort', { n: rating })) : null,
          (() => { const n = Object.keys(scoresOf(r).conflict).length; return n ? h('span', { class: 'sev high', title: rt('kpiConflict', { n }) }, '⚡ ' + n) : null; })(),
          news.signals.length ? h('span', { class: 'sev high' }, rt('newSignals', { n: news.signals.length })) : null,
          news.alerts.length ? h('div', { class: 'alert-lines' }, news.alerts.slice(0, 3).map((a) => h('span', null, t('tra.' + a)))) : null)),
        td(L.w, { class: 'small' }, wk.next ? h('div', { class: wk.next.due && wk.next.due < today() ? 'bad' : '' }, h('b', null, wk.next.due ? fdate(wk.next.due) : '—'), ' ', h('span', { class: 'clamp1' }, wk.next.text)) : null,
          h('div', { class: 'cell-sub' }, wk.lastVisit ? rt('lastVisit', { date: fdate(wk.lastVisit) }) : rt('noVisit'))));
    }))));
}

// ---- one sub-project ------------------------------------------------------------------------

const SP_TABS = ['overview', 'procurement', 'contracts', 'finance', 'work', 'docs'];
function registryCard(code, tab, sub) {
  const r = REG.rows.get(code) || [...REG.rows.values()].find((x) => x.code === code);
  if (!REG.access) return registryPage();
  if (!r) return [h('div', { class: 'card empty section' }, REG.rows.size ? t('pz.notFound') : t('ui.loading'))];
  const tt = r.t || {};
  tab = String(tab || '').split('#')[0];
  tab = SP_TABS.includes(tab) ? tab : 'overview';
  const st = spStage(r), tracked = spTracked(r), news = spNews(tracked);
  const head = spHeader(r, st);
  // One sub-project, its parts as tabs: where it stands, its procurements, its contracts, its money,
  // the expert's work. The address keeps the tab (#/sp/CODE/contracts).
  const count = { procurement: spTids(r).length || (r.tenders || []).length, contracts: spContracts(r).length, work: openTasks(r).length , docs: (REG.docN || {})[r.code] != null ? REG.docN[r.code] : ((state.trackedIndex || {}).items || []).filter((y) => spTids(r).includes(y.tid) && onTeamList(y.key)).reduce((n, y) => n + (y.docs || 0), 0)};
  const tabs = h('nav', { class: 'section-tabs pills sp-tabs', 'aria-label': rt('nav') }, SP_TABS.map((k) => h('a', { href: '#/sp/' + encodeURIComponent(r.code) + '/' + k, class: k === tab ? 'on' : '' },
    rt('tab_' + k), count[k] ? h('em', { class: 'count' }, count[k]) : null, k === 'overview' && news.signals.length ? h('em', { class: 'count red' }, news.signals.length) : null)));
  const body = {
    overview: () => [h('div', { class: 'section' }, risksCard(r)), additionalBlock(r), reconcileCard(r), recentCard(r), stageCard(r, st)],
    procurement: () => (sub ? procDetail(r, sub) : procurementTab(r)),
    contracts: () => contractsTab(r),
    finance: () => financeTab(r),
    work: () => workTab(r),
    docs: () => docsTab(r),
  }[tab]();
  return [head, tabs].concat(body);
}

// The sub-project's header, the same on every tab: where one is, what it is, who keeps it, its
// actions, its registers, and four tiles of its state — all on the current works contract.
function spHeader(r, st) {
  const tt = r.t || {}, pw = primaryWorks(r), sv = subvMatch(r);
  const sc = scoresOf(r), overall = overallRating(sc.scores), conflicts = Object.keys(sc.conflict);
  const base = '#/sp/' + encodeURIComponent(r.code);
  const t0 = (pw && pw.tender) || ((r.pz || {}).tenders || [])[0] || null;
  const buyerCode = (t0 && t0.buyer) || tt.beneficiary_id || '';
  const busy = h('span', { class: 'muted small' });
  const refresh = h('button', { class: 'btn', onclick: async () => {
    refresh.disabled = true; fill(busy, t('ui.loading'));
    try { await refreshSp(r); if (isMine(r)) autoTrack(true, r).catch(() => {}); fill(busy, ''); toast(rt('spRefreshed', { code: r.code })); }
    catch (e) { fill(busy, h('span', { class: 'bad' }, e.message)); } finally { refresh.disabled = false; }
  } }, icon('refresh'), rt('spRefresh'));
  const copyMenu = typeof copyMenuFor === 'function' ? copyMenuFor(r) : null;
  const regs = [
    spTids(r).length ? h('a', { class: 'tag link', href: base + '/procurement' }, 'Prozorro (' + spTids(r).length + ')') : null,
    spDream(r) ? ext(dreamUrl(spDream(r)), 'DREAM', 'tag link') : null,
    sv && sv.url ? ext(sv.url, rt('cmuOrder', { n: String(sv.nreg || '').replace(/-(\d{4})-[рп]$/, ' ($1)') }), 'tag link') : null,
  ].filter(Boolean);
  return h('div', { class: 'sp-head section' },
    h('div', { class: 'org-head' },
      h('div', null,
        h('nav', { class: 'crumbs', 'aria-label': rt('nav') }, h('a', { href: '#/' }, rt('nav')), h('span', { 'aria-hidden': 'true' }, '/'), h('span', null, r.code)),
        h('h1', { class: 'org-title' + (String(tt.name_uk || tt.name_en || '').length > 90 ? ' long' : '') }, tt.name_uk || tt.name_en || r.code),
        tt.name_uk && tt.name_en ? h('p', { class: 'muted' }, tt.name_en) : null,
        h('div', { class: 'chips' }, stageChip(st),
          tt.programme || tt.batch ? h('span', { class: 'tag' }, join([tt.programme, tt.batch && 'Batch ' + tt.batch, tt.office])) : null,
          h('span', { class: 'tag' + (isMine(r) ? ' ok' : '') }, rt('managerTag', { who: spManager(r) || '—' })),
          !isMine(r) ? h('button', { class: 'btn btn-sm', onclick: () => takeOver(r), title: rt('takeOverHint') }, rt('takeOver')) : null,
          tt.manual ? h('span', { class: 'tag warn' }, rt('manualTag')) : null,
          r.overrides && Object.keys(r.overrides).length ? h('span', { class: 'tag', title: rt('overriddenHint') }, rt('overridden')) : null),
        h('p', { class: 'small sp-buyer' }, join([tt.beneficiary || (t0 && t0.buyer_name), buyerCode ? 'ЄДРПОУ ' + buyerCode : null]), ' ', regs)),
      h('div', { class: 'org-actions' }, h('div', { class: 'row' }, refresh, copyMenu,
        h('button', { class: 'btn', onclick: () => addSpDialog(r) }, icon('edit'), rt('editPassport'))), busy)),
    kpiTiles(r, pw, sc, overall, conflicts, base));
}
// Four tiles, each on the current works contract (or the tender running for it), each a way in.
function kpiTiles(r, pw, sc, overall, conflicts, base) {
  const c = pw && pw.contract, row = pw && pw.trackedRow, tt = r.t || {};
  const sup = c ? (c.suppliers || [])[0] || {} : {};
  const left = c && c.end && c.status === 'active' ? dayDiff(today(), c.end) : null;
  const prevEnded = pw && (pw.prev || (pw.mode === 'contract' && ((r.pz || {}).tenders || []).some((t0) => procRole(r, t0) === 'works'
    && (t0.contracts || []).some((x) => x.id !== c.id && x.status === 'terminated' && String(x.signed || '') < String(c.signed || '')))));
  const tile = (href, cls, label, main, sub, extra) => h('a', { class: 'stat kpi ' + (cls || ''), href }, h('small', null, label), h('b', null, main), sub ? h('span', { class: 'sub' }, sub) : null, extra || null);
  // 1. The contract and its term.
  const t1 = !pw ? tile(base + '/procurement', 'na', rt('kpiContract'), rt('pNoContractYet'), rt('kpiNoWorks'))
    : c ? tile(base + '/contracts', left != null && left < 0 ? 'bad' : left != null && left <= 30 ? 'warn' : '', rt('kpiContract'), sup.name ? orgShort(sup.name) : (c.number ? '№ ' + c.number : '—'),
      join([c.number && '№ ' + c.number, c.signed && fdate(c.signed), c.value && money(c.value.amount), c.end && '→ ' + fdate(c.end),
        left != null ? (left >= 0 ? rt('cLeft', { n: left }) : rt('lateBy', { n: -left })) : c.status !== 'active' ? label('pzc.', c.status) : null]),
      prevEnded ? h('span', { class: 'sub warn-text' }, rt('kpiAfterEnded')) : null)
      : tile(base + '/procurement', 'run', rt(pw.mode === 'retender' ? 'kpiRetender' : 'kpiTender'), pw.tender ? label('pzs.', pw.tender.status) || pw.tender.status : '—',
        join([pw.tender && pw.tender.tid, pw.tender && pw.tender.value && money(pw.tender.value.amount)]), pw.prev ? h('span', { class: 'sub warn-text' }, rt('kpiAfterEnded')) : null);
  // 2. Done and paid: the table's physical progress, the Treasury's acts, what this contract was paid.
  const phys = pctOf(spStatus(r).pct), acts = row && row.acts_pct != null ? Math.round(row.acts_pct) : null, paid = c ? paidShare(r) : null;
  const bar = (pct, cls) => h('span', { class: 'c-bar ' + cls }, h('i', { style: `width:${Math.max(0, Math.min(100, pct || 0))}%` }));
  const t2 = h('a', { class: 'stat kpi', href: base + '/finance' }, h('small', null, rt('kpiProgress')),
    h('div', { class: 'kpi-bars' },
      h('div', null, h('span', null, rt('kpiPhys')), bar(phys, 'phys'), h('b', { class: 'num' }, phys != null ? phys + '%' : '—')),
      h('div', null, h('span', null, rt('kpiActs')), bar(acts, 'acts'), h('b', { class: 'num' }, acts != null ? acts + '%' : '—')),
      h('div', null, h('span', null, rt('kpiPaid')), bar(paid, 'paid'), h('b', { class: 'num' }, paid != null ? paid + '%' : '—'))));
  // 3. The year's money: the subvention in force, enough for what the contract still needs, Mindev's queue.
  const sv = subvMatch(r), am = sv ? sv.amounts || {} : {}, eds = sv ? sv.editions || Object.keys(am).sort() : [];
  const now = eds.length ? am[eds[eds.length - 1]] : null;
  const ad = sv && sv.name && now != null ? adequacyData(r, now) : null;
  const f = mrdFacts(r), wait = f ? f.waiting.filter((x) => x.days > 15).length : 0;
  const status = ad ? ad.status : ({ adequate: 'adequate', insufficient: 'insufficient', suspended: 'suspended' })[Object.keys(ADEQ_RX).find((k) => ADEQ_RX[k].test(String(tt.funding || '')))] || null;
  const t3 = tile(base + '/finance', status === 'suspended' || status === 'insufficient' ? 'bad' : wait ? 'warn' : '', rt('kpiFunding'),
    now != null ? fmtK(now) : +tt.subv_year > 0 ? money(+tt.subv_year) : '—',
    join([status ? t('fa.st.' + status) : null, wait ? rt('kpiMrdWait', { n: wait }) : f ? rt('kpiMrdOk') : null]));
  // 4. The overall rating; a lightning when the system sees more than is rated.
  const t4 = tile(base + '/overview#risks', overall === 3 ? 'bad' : overall === 2 ? 'warn' : overall === 1 ? 'ok' : 'na', rt('kpiRisk'),
    overall ? rt('overall', { n: overall }) : '—', rt('ratedOf', { n: ratedCount(sc.scores) }),
    conflicts.length ? h('span', { class: 'sub bad' }, '⚡ ' + rt('kpiConflict', { n: conflicts.length })) : null);
  return h('div', { class: 'tiles kpi-tiles' }, t1, t2, t3, t4);
}

// The road of a sub-project, from the subvention to commissioning, with the dates the data know.
function stageCard(r, st) {
  const tt = r.t || {}, works = (r.tenders || []).filter((x) => tKind(x.kind) === 'works').sort((a, b) => String(a.issued || '').localeCompare(String(b.issued || '')));
  const sv = subvMatch(r);
  const m = mainContract(r);
  const steps = [
    // The edition in force; when it took the money away, what there was before.
    ['subvention', sv ? (() => { const am = sv.amounts || {}, eds = sv.editions || Object.keys(am).sort(), now = am[eds[eds.length - 1]] || 0, top = Math.max(0, ...Object.values(am).map(Number));
      return now > 0 ? rt('stepSubv', { sum: fmtK(now) }) : top > 0 ? rt('stepSubvGone', { sum: fmtK(top) }) : rt('stepSubvZero'); })() : null, !!sv],
    ['tender', works.length ? join([rt('stepTenders', { n: works.length }), st.failed ? rt('stepFailed', { n: st.failed }) : null, works[works.length - 1].issued ? fdate(works[works.length - 1].issued) : null,
      ['tender', 'retender'].includes(st.stage) && st.lastIssued ? rt('stepRunning', { n: dayDiff(st.lastIssued, today()) }) : null]) : null, works.length > 0],
    ['contract', st.signed ? join([fdate(st.signed), m && ((m.c.suppliers || [])[0] || {}).name]) : st.ended ? rt('stepEnded', { no: st.ended.number ? '№ ' + st.ended.number : '', date: fdate(st.ended.signed) }) : null, !!st.signed],
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


// ---- the Contracts tab ---------------------------------------------------------------------------
//
// Every contract of the sub-project's procurements, by role (works, supervision, consulting engineer,
// the rest), those in force first. One card per contract joins Prozorro (number, dates, price and its
// changes), what the monitor follows (acts and payments against the price, lateness, signals,
// programme rules) and Mindev's register (EIB payments, the bank guarantee, tender results sent to the
// EIB). Above them, the sub-project's contracts in sum; below, the team's guarantees and the
// Treasury's payments, folded.
const C_ORDER = { active: 0, pending: 1, terminated: 2 };
const normNo = (x) => String(x || '').toUpperCase().replace(/[^0-9A-ZА-ЯІЇЄҐ]/g, '');
function spContracts(r) {
  const out = [];
  for (const t0 of ((r.pz || {}).tenders || [])) {
    for (const c of t0.contracts || []) if (c.status !== 'cancelled') out.push({ t0, c, role: procRole(r, t0) });
  }
  return out.sort((a, b) => (C_ORDER[a.c.status] ?? 3) - (C_ORDER[b.c.status] ?? 3) || String(b.c.signed || '').localeCompare(String(a.c.signed || '')));
}
function contractFacts(r, it) {
  const { t0, c, role } = it;
  const row = ((state.trackedIndex || {}).items || []).find((y) => y.key === c.id || y.contract_id === c.id) || null;
  const mrd = r.mrd || {};
  const mc = (mrd.contracts || []).find((x) => x.number && c.number && normNo(x.number) === normNo(c.number))
    || (mrd.contracts || []).filter((x) => x.role === role).length === 1 && (mrd.contracts || []).find((x) => x.role === role) || null;
  const kinds = { works: ['works', 'advance', 'advance_close'], ts: ['ts'], csc: ['csc'] }[role] || [];
  const eibPays = (mrd.payments || []).filter((x) => x.paid && kinds.includes(x.kind));
  const value = (c.value || {}).amount || (row && row.totals && row.totals.value) || 0;
  const tt = (row && row.totals) || {};
  const paid = tt.paid_total || tt.paid || 0;
  const end = c.end || (row && row.end);
  const left = end && c.status === 'active' ? dayDiff(today(), end) : null;
  return { row, mc, eibPays, eib: eibPays.reduce((a, x) => a + (x.eib || 0), 0), local: eibPays.reduce((a, x) => a + (x.local || 0), 0),
    value, paid, paidPct: value && paid ? Math.round((paid / value) * 100) : (row && row.paid_pct != null ? Math.round(row.paid_pct) : null),
    actsPct: row && row.acts_pct != null ? Math.round(row.acts_pct) : null, end, left };
}
function contractCard(r, it, primary) {
  const { t0, c, role } = it, f = contractFacts(r, it);
  const pr = (f.row && f.row.price) || {};
  const sup = (c.suppliers || [])[0] || {};
  const sig = f.row ? (f.row.signals || []) : [];
  const high = sig.filter((g) => g.severity === 'high');
  const bad = ((f.row && f.row.rules) || {}).bad || [];
  const term = c.status !== 'active' ? null : f.left == null ? null : f.left >= 0 ? h('span', { class: f.left <= 30 ? 'warn-text' : 'faint' }, rt('cLeft', { n: f.left })) : h('span', { class: 'bad' }, rt('lateBy', { n: -f.left }));
  const bar = (pct, cls) => h('span', { class: 'c-bar ' + cls }, h('i', { style: `width:${Math.max(0, Math.min(100, pct || 0))}%` }));
  return h('article', { class: 'proc contract c-' + c.status + (primary ? ' primary' : '') },
    primary ? h('div', { class: 'primary-badge' }, '★ ', rt('cPrimary')) : null,
    h('header', { class: 'proc-head' },
      h('div', { class: 'proc-id' },
        h('span', { class: 'c-st c-st-' + c.status }, label('pzc.', c.status)),
        h('b', { class: 'c-title' }, c.number ? '№ ' + c.number : rt('cNoNumber')), c.signed ? h('span', { class: 'faint' }, rt('cOf', { date: fdate(c.signed) })) : null),
      h('div', { class: 'proc-actions' },
        f.row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + f.row.key }, rt('pDossier'))
          : c.status === 'active' ? h('span', { class: 'faint small' }, isMine(r) ? rt('pAuto') : rt('pNotMine')) : null,
        ext(pzUrl(t0.tid), 'Prozorro'))),
    h('dl', { class: 'proc-facts' },
      h('div', { class: 'wide2' }, h('dt', null, rt('cContractor')), h('dd', null, h('b', null, typeof contractorLink === 'function' ? contractorLink(sup.name, sup.code, r) : party(sup.name, sup.code)))),
      h('div', null, h('dt', null, rt('cPrice')), h('dd', { class: 'num' },
        pr.first && pr.now && Math.abs(pr.now - pr.first) > 1 ? [money(pr.first), ' → ', h('b', null, money(pr.now)), h('span', { class: pr.change_pct > 0 ? ' bad' : '' }, ' (' + (pr.change_pct > 0 ? '+' : '') + pr.change_pct + '%)')] : f.value ? money(f.value) : '—',
        c.changes ? h('div', null, typeof openAmendmentsDrawer === 'function' ? h('button', { class: 'linklike small', type: 'button', onclick: () => openAmendmentsDrawer(r, c.id) }, rt('cChangesN', { n: c.changes })) : h('small', null, rt('cChanges', { n: c.changes, date: c.last_change ? fdate(c.last_change) : '' }))) : null)),
      h('div', null, h('dt', null, rt('cTerm')), h('dd', { class: 'num' }, join([c.start && fdate(c.start), f.end && '→ ' + fdate(f.end)]) || '—', term ? h('div', null, term) : null)),
      h('div', { class: 'wide' }, h('dt', null, rt('cProgress')), h('dd', null,
        f.row ? h('div', { class: 'c-progress click', role: 'button', tabindex: 0, title: rt('drMoney'), onclick: () => openMoneyDrawer(r, c.id), onkeydown: (e) => { if (e.key === 'Enter') openMoneyDrawer(r, c.id); } },
          h('div', null, h('small', null, rt('cActs')), bar(f.actsPct, 'acts'), h('b', { class: 'num' }, f.actsPct != null ? f.actsPct + '%' : '—')),
          h('div', null, h('small', null, rt('cPaid')), bar(f.paidPct, 'paid'), h('b', { class: 'num' }, f.paidPct != null ? f.paidPct + '%' : '—'), f.paid ? h('span', { class: 'faint small' }, money(f.paid)) : null))
          : h('span', { class: 'faint' }, c.status === 'active' ? rt('cNotFollowed') : '—'))),
      f.eibPays.length ? h('div', null, h('dt', null, rt('cEib')), h('dd', { class: 'num' }, money(f.eib), h('small', null, ' · ' + rt('cEibN', { n: f.eibPays.length, date: fdate(f.eibPays.map((x) => x.paid).sort().pop()) })))) : null,
      f.mc && f.mc.guarantee != null ? h('div', null, h('dt', null, rt('mrdGuarantee')), h('dd', { class: f.mc.guarantee > 5 ? 'bad' : '' }, ni.format(f.mc.guarantee) + '%')) : null,
      role === 'works' && f.mc && f.mc.pcr !== null && f.mc.pcr !== undefined ? h('div', null, h('dt', null, rt('mrdPcr')), h('dd', null, f.mc.pcr ? f.mc.pcr : h('span', { class: 'warn-text' }, rt('mrdNoPcrShort')))) : null),
    high.length || bad.length || (f.row && (f.row.alerts || []).length) ? h('div', { class: 'proc-checks' },
      high.slice(0, 3).map((g) => h('span', { class: 'sev high' }, t('sig.' + g.type + '.title'))),
      bad.length ? h('span', { class: 'sev high' }, rt('sg_rules')) : null,
      ((f.row && f.row.alerts) || []).filter((a) => !['risk', 'sasu', 'rules'].includes(a)).slice(0, 3).map((a) => h('span', { class: 'sev medium' }, t('tra.' + a))),
      sig.length > high.length ? h('a', { class: 'faint small', href: '#/tracked/' + f.row.key }, rt('cMoreSignals', { n: sig.length - high.length })) : null) : null);
}
// The bank guarantees of one contract (the team's register), and whether its documents in Prozorro
// hold a guarantee file at all.
function contractGuarantees(r, c) {
  const gs = ((r.work || {}).guarantees || []).filter((g) => !g.contract || normNo(g.contract) === normNo(c.number));
  const row = ((state.trackedIndex || {}).items || []).find((y) => y.key === c.id || y.contract_id === c.id);
  const noDoc = row && (row.checks || {}).guarantees === 'bad';
  if (!gs.length && !noDoc) return null;
  return h('div', { class: 'card pad c-guar' }, h('h3', { class: 'card-sub' }, rt('gTitle')),
    gs.length ? h('div', { class: 'chips' }, gs.map((g) => h('span', { class: 'tag' + (!g.closed && g.until && g.until < addDays(today(), 30) ? ' warn' : '') },
      join([rt('g_' + g.kind), g.bank, g.amount ? money(g.amount) : null, g.until ? rt('pTo', { date: fdate(g.until) }) : null])))) : null,
    noDoc ? h('p', { class: 'small warn-text' }, rt('cGuarNoDoc')) : null);
}
// A works contract the table knows and Prozorro is not linked for: the Tenders and SPs sheets' data.
function sheetContractCard(r) {
  const tt = r.t || {}, x = (primaryWorks(r) || {}).sheetRow || {};
  return h('section', { class: 'card pad section' }, h('div', { class: 'primary-badge' }, '★ ', rt('cPrimarySheet')),
    kv([[rt('cContractor'), x.contractor || tt.contractor], [rt('cNumber'), x.contract_no], [rt('cPrice'), x.contract_total != null ? money(x.contract_total) : toNum(tt.contract_sum) != null ? money(toNum(tt.contract_sum)) : null],
      [rt('cTerm'), join([tt.start && fdate(tt.start), tt.completion && '→ ' + fdate(tt.completion)])], [rt('sheetPaid'), x.paid != null ? money(x.paid) : null]]),
    h('p', { class: 'muted small' }, rt('cSheetHint')));
}
function contractsTab(r) {
  const list = spContracts(r);
  const pw = primaryWorks(r);
  const live = pw && pw.contract ? list.find((x) => x.c.id === pw.contract.id) || null : null;
  const lf = live ? contractFacts(r, live) : null;
  const mrdF = mrdFacts(r);
  const summary = h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('cTitle')), h('span', { class: 'faint small' }, rt('cCount', { n: list.length }))),
    list.length ? h('div', { class: 'proc-sums' },
      h('div', { class: 'proc-sum ' + (live && live.c.status === 'active' ? 'ok' : live ? 'na' : 'warn') }, h('small', null, rt('cWorks')),
        h('b', null, live ? join([live.c.number ? '№ ' + live.c.number : rt('cNoNumber'), money(lf.value)]) : rt('pNoContractYet')),
        live ? h('span', { class: 'faint small' }, label('pzc.', live.c.status)) : null),
      h('div', { class: 'proc-sum ' + (lf && lf.left != null && lf.left < 0 ? 'bad' : lf && lf.left != null && lf.left <= 30 ? 'warn' : 'na') }, h('small', null, rt('cTerm')),
        h('b', null, lf && lf.end ? fdate(lf.end) : '—'), lf && lf.left != null ? h('span', { class: 'faint small' }, lf.left >= 0 ? rt('cLeft', { n: lf.left }) : rt('lateBy', { n: -lf.left })) : null),
      h('div', { class: 'proc-sum ' + (lf && lf.actsPct != null ? 'run' : 'na') }, h('small', null, rt('cActsPaid')),
        h('b', null, lf && (lf.actsPct != null || lf.paidPct != null) ? rt('cActsPaidV', { a: lf.actsPct != null ? lf.actsPct : '—', p: lf.paidPct != null ? lf.paidPct : '—' }) : '—')),
      h('div', { class: 'proc-sum ' + (mrdF ? 'ok' : 'na') }, h('small', null, rt('cEib')),
        h('b', null, mrdF ? money(mrdF.paidEib) : '—'), mrdF ? h('span', { class: 'faint small' }, mrdF.waiting.length ? rt('mrdWaitingV', { n: mrdF.waiting.length, days: Math.max(...mrdF.waiting.map((x) => x.days)) }) : rt('cEibLocal', { sum: money(mrdF.paidLocal) })) : h('span', { class: 'faint small' }, rt('cEibNone'))))
      : h('p', { class: 'muted small' }, rt('noContracts')));
  // The current works contract in full first; the table's own data when Prozorro has none linked.
  const mainCard = live ? h('section', { class: 'section' }, contractCard(r, live, true), contractGuarantees(r, live.c))
    : pw && pw.mode === 'sheet' ? sheetContractCard(r) : null;
  // Then the others, for information: supervision, the engineer, author's supervision, design, and
  // the earlier works contracts (what was paid under them before they ended).
  const rest = list.filter((x) => !live || x.c.id !== live.c.id);
  const groups = ['ts', 'csc', 'author', 'design', 'other', 'works'].map((role) => {
    const items = rest.filter((x) => x.role === role);
    if (!items.length) return null;
    return h('details', { class: 'card pad section proc-group info fold', open: role !== 'works' || null },
      h('summary', null, h('h2', { class: 'card-title' }, rt(role === 'works' ? 'cPrevWorks' : 'role_' + role), h('span', { class: 'count-inline' }, items.length))),
      h('p', { class: 'faint small' }, rt('pInfoOnly2')),
      h('div', { class: 'proc-list' }, items.map((it) => contractCard(r, it))));
  });
  groups.unshift(rest.length ? h('h2', { class: 'section-title section' }, rt('cOthersTitle')) : null);
  groups.unshift(mainCard);
  // The team's guarantees and the Treasury's payments: kept, but folded below the contracts.
  const g = guaranteesCard(r), pay = paymentsCard(r);
  const fold = (card, title, open) => (card ? h('details', { class: 'card pad section fold', open: open || null }, h('summary', null, h('h2', { class: 'card-title' }, title)), card) : null);
  const gs = ((r.work || {}).guarantees || []);
  const gSoon = gs.filter((x) => !x.closed && x.until && x.until <= addDays(today(), 30)).length;
  if (g) g.className = 'fold-body';
  if (pay) pay.className = 'fold-body';
  return [summary].concat(groups, [fold(g, rt('gTitle') + (gs.length ? ' (' + gs.length + ')' : '') + (gSoon ? ' · ' + rt('cGSoon', { n: gSoon }) : ''), gSoon > 0), fold(pay, rt('payments'), false)]);
}

const prozorro_role = (title) => (/технічн\S*\s+нагляд/i.test(title || '') ? 'ts' : /інженер\S*[\s-]*консультант|консультаційн/i.test(title || '') ? 'csc' : /авторськ\S*\s+нагляд/i.test(title || '') ? 'author' : /про[еє]кт/i.test(title || '') ? 'design' : 'other');

// The money in figures from the table: investment, the loan's part, contract, paid, this year's subvention.

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
  pctIn.value = pctOf(s.pct) != null ? pctOf(s.pct) : '';
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
  const card = h('div', { class: 'card pad section', id: 'status' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('stTitle')),
      s.upd ? h('span', { class: 'faint small' }, rt(s.app ? 'stUpdApp' : 'stUpdTable', { date: fdate(s.upd), who: s.by || '' })) : null),
    h('div', { class: 'grid-2 st-grid' },
      kv([
        [t('eib.buyer'), join([tt.beneficiary, tt.beneficiary_id])],
        [rt('finance'), join([toNum(tt.invest_eur) != null ? 'Invest ' + ni.format(toNum(tt.invest_eur)) + ' €' : null, toNum(tt.eib_eur) != null ? 'EIB ' + ni.format(toNum(tt.eib_eur)) + ' €' : null])],
        [rt('stContract'), m ? h('span', null, h('b', null, sup.name || '—'), h('div', { class: 'cell-sub' }, join([m.c.number && '№ ' + m.c.number, m.c.value ? money(m.c.value.amount) : null, m.c.end ? '→ ' + fdate(m.c.end) : null,
            m.c.status !== 'active' ? label('pzc.', m.c.status) : null])))
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
      h('div', { class: 'field' }, h('span', null, rt('stPct')), h('b', { class: 'st-val num' }, pctOf(s.pct) != null ? pctOf(s.pct) + '%' : '—')),
      h('div', { class: 'field' }, h('span', null, rt('stUpd')), h('b', { class: 'st-val num' }, s.upd ? fdate(s.upd) : '—'))),
    h('div', { class: 'field' }, h('span', null, rt('stComment')), h('div', { class: 'st-text' }, s.comment || h('span', { class: 'muted' }, '—'))),
    was,
    h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: showEdit }, rt('editSp'))));
  const showEdit = () => {
    fill(view,
      h('div', { class: 'st-row' }, h('label', { class: 'field' }, h('span', null, rt('stPct')), pctIn), h('label', { class: 'field' }, h('span', null, rt('stUpd')), dayIn)),
      h('label', { class: 'field' }, h('span', null, rt('stComment')), textIn),
      was,
      h('div', { class: 'row' }, saveBtn, h('button', { class: 'btn btn-sm', onclick: () => { pctIn.value = pctOf(s.pct) != null ? pctOf(s.pct) : ''; dayIn.value = today(); textIn.value = s.comment || ''; showView(); } }, rt('cancel')), msg));
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
      const fields = { programme: prog.value, batch: batch.value.trim(), office: office.value.trim(), name_uk: nameUk.value.trim(), name_en: nameEn.value.trim(),
        expert: expert.value, beneficiary: ben.value.trim(), beneficiary_id: benId.value.trim() };
      const ids = [...new Set(String(pz.value).match(PZ_ID) || [])];
      let patch;
      if (!r0 || tt0.manual) patch = { code: c, t: Object.assign({}, tt0, fields, { codes: [c], manual: true }) };
      else {
        // A sub-project of the table: the edits go apart (overrides) and outlive the next upload; a
        // field set back to the table's value stops being an edit.
        const table = r0.tTable || tt0, ov = {};
        for (const [k, v] of Object.entries(fields)) ov[k] = String(v || '') === String(table[k] || '') ? cloud.DEL() : v;
        patch = { overrides: ov };
      }
      if (ids.length) patch.link = { tids: [...new Set(((r0 && r0.link && r0.link.tids) || []).concat(ids))], off: [] };
      await cloud.updateRegistry(c, patch);
      closeSheet();
      location.hash = '#/sp/' + encodeURIComponent(c);
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

const KEY_RISKS = ['r2', 'r3', 'r4', 'r7'];
// What the matrix is rated on: the current works contract, or the works tender running for it.
function basisLine(r) {
  const pw = primaryWorks(r);
  if (!pw) return rt('basisNone');
  const c = pw.contract, t0 = pw.tender;
  if (c) return rt('basisContract', { no: c.number ? '№ ' + c.number : '', date: c.signed ? fdate(c.signed) : '', tid: t0 ? t0.tid : '' });
  if (t0) return rt(pw.mode === 'retender' ? 'basisRetender' : 'basisTender', { tid: t0.tid });
  return rt('basisSheet');
}
// Block A of the overview: the eight risks and "Other / Integrity", on the current works contract
// only. Each criterion: its rating (– 1 2 3), where the rating comes from, a lightning when the
// system sees more than is rated, the facts (each opens its inspector), the analyst's own fact for a
// 2 or a 3 (it goes to the Red Flag and the table), and lowering a 3 only with a reason, confirmed
// by another person.
function risksCard(r) {
  const sc = scoresOf(r), { scores, from, conflict } = sc;
  const sug = sc.suggested;
  const overall = overallRating(scores);
  const risk = allRisk(r) || {};
  const signoff = r.signoff || {}, notes = r.scoreNotes || {};
  const me = { by: myExpert(), uid: (state.user || {}).uid || '' };
  // One write: the ratings, the sign-off of a lowered 3, the facts; what is no longer so is removed.
  const save = (patch, why) => {
    const so = {}, nt = {}, at = new Date().toISOString(), log = [];
    for (const [k, v] of Object.entries(patch)) {
      if (scores[k] === 3 && (v == null || v < 3)) so[k] = { from: 3, to: v, why: why || '', by: me.by, uid: me.uid, at };
      else if (v === 3 && signoff[k]) so[k] = cloud.DEL();
      if ((v === 3 || v === 2) && !(notes[k] && notes[k].text) && (risk[k] || []).length) nt[k] = { text: (risk[k] || []).map((x) => x.text).join(' · ').slice(0, 900), by: me.by, at, auto: true };
      if (v == null || v < 2) { if (notes[k]) nt[k] = cloud.DEL(); }
      log.push({ k, from: scores[k] == null ? null : scores[k], to: v == null ? null : v, by: me.by, at, why: why || '' });
    }
    const scorePatch = {};
    for (const [k, v] of Object.entries(patch)) scorePatch[k] = v == null ? cloud.DEL() : v;
    return cloud.updateRegistry(r.code, { scores: scorePatch, signoff: so, scoreNotes: nt, scoreLog: ((r.scoreLog || []).concat(log)).slice(-200) });
  };
  const confirm = (k) => cloud.updateRegistry(r.code, { signoff: { [k]: Object.assign({}, signoff[k], { ok: me.by, okUid: me.uid, okAt: new Date().toISOString() }) } });
  // Lowering a 3 asks why, in a small window; nothing changes without a reason.
  const lower = (k, v) => {
    const why = h('textarea', { class: 'input', rows: 4, maxlength: 1000, placeholder: rt('lowerWhyPh'), 'aria-label': rt('lowerWhy') });
    const msg = h('span', { class: 'small' });
    const ok = h('button', { class: 'btn btn-dark', onclick: async () => {
      if (why.value.trim().length < 10) { fill(msg, h('span', { class: 'bad' }, rt('lowerWhyNeed'))); return; }
      ok.disabled = true;
      try { await save({ [k]: v }, why.value.trim()); closeSheet(); toast(rt('lowerSent')); } catch (e) { fill(msg, h('span', { class: 'bad' }, e.message)); ok.disabled = false; }
    } }, rt('lowerOk'));
    sheet(h('h2', { class: 'card-title' }, rt('lowerTitle', { k: rt(k), v: v == null ? '–' : v })), h('p', { class: 'muted small' }, rt('lowerLead')),
      h('label', { class: 'field' }, h('span', null, rt('lowerWhy')), why), h('div', { class: 'row', style: 'margin-top:10px' }, ok, msg));
    requestAnimationFrame(() => why.focus());
  };
  const pick = (k) => (v) => (scores[k] === 3 && (v == null || v < 3) ? lower(k, v) : save({ [k]: v }));
  const factBox = (k) => {
    const n = notes[k] || {};
    const ta = h('textarea', { class: 'input fact-in', rows: 3, maxlength: 2000, placeholder: rt('factPh'), 'aria-label': rt('factLabel2') });
    ta.value = n.text || '';
    const msg = h('span', { class: 'faint small' }, n.at ? rt('factBy', { who: n.by || '—', date: fdate(String(n.at).slice(0, 10)) }) + (n.auto ? ' · ' + rt('factAuto') : '') : '');
    const keep = async () => {
      const v = ta.value.trim();
      if (v === (n.text || '')) return;
      try { await cloud.updateRegistry(r.code, { scoreNotes: { [k]: v ? { text: v.slice(0, 2000), by: me.by, at: new Date().toISOString() } : cloud.DEL() } }); fill(msg, rt('saved')); }
      catch (e) { fill(msg, h('span', { class: 'bad' }, e.message)); }
    };
    ta.addEventListener('blur', keep);
    return h('div', { class: 'fact-box' }, h('span', { class: 'small' }, rt('factLabel2')), ta, msg);
  };
  const conflicts = Object.keys(conflict);
  const pending = SCORE_KEYS.filter((k) => sug[k] != null && (from[k] === 'hint' || conflict[k]));
  return h('div', { class: 'card pad', id: 'risks' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('risks')),
      overall ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][overall], title: rt('overallHint') }, rt('overall', { n: overall }), ' · ', rt('ratedOf', { n: ratedCount(scores) })) : null),
    h('p', { class: 'small basis' }, h('b', null, basisLine(r))),
    h('p', { class: 'muted small' }, rt('risksHint')),
    ratedCount(scores) < 8 && overall ? h('p', { class: 'notice small' }, rt('unratedNote', { n: 8 - ratedCount(scores) })) : null,
    pending.length ? h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn btn-sm btn-dark', onclick: () => {
      const raise = pending.filter((k) => !(scores[k] === 3 && sug[k] < 3));
      save(Object.fromEntries(raise.map((k) => [k, sug[k]])));
    } }, icon('check'), rt('acceptHints', { n: pending.length })), conflicts.length ? h('span', { class: 'bad small' }, '⚡ ' + rt('kpiConflict', { n: conflicts.length })) : null) : null,
    h('div', { class: 'checklist' }, RISK_KEYS.map((k) => {
      const items = risk[k] || [];
      if (k === 'rx' && !items.length) return null;
      const score = scores[k];
      const lv = k === 'rx' ? (items.some((x) => x.level === 'high') ? 'bad' : 'warn') : score === 3 ? 'bad' : score === 2 ? 'warn' : score === 1 ? 'ok' : 'na';
      const picker = k !== 'rx' ? scorePicker(score, pick(k), rt(k), rt('from_' + (from[k] || 'none'))) : null;
      const so = signoff[k], mine = so && so.uid && so.uid === me.uid;
      const openRisk = typeof openRiskDrawer === 'function' ? () => openRiskDrawer(r, k) : null;
      return h('div', { class: 'chk ' + lv + (conflict[k] ? ' conflict' : '') },
        picker || h('span', { class: 'chk-ico' }, '!'),
        h('div', null,
          h('b', null, openRisk ? h('button', { class: 'linklike', type: 'button', onclick: openRisk }, rt(k)) : rt(k)),
          conflict[k] ? h('div', { class: 'small bad' }, '⚡ ' + rt('conflictLine', { sug: conflict[k], score })) : null,
          h('div', { class: 'small muted facts' }, items.length ? items.map((x, i) => [i ? ' · ' : '', typeof factLink === 'function' ? factLink(r, k, x) : x.text]) : '—'),
          from[k] && from[k] !== 'own' ? h('div', { class: 'faint small' }, rt('from_' + from[k])) : null,
          k !== 'rx' && (score === 2 || score === 3) ? factBox(k) : null,
          so && !so.ok && (score == null || score < 3) ? h('div', { class: 'row small warn-text', style: 'gap:8px;flex-wrap:wrap;margin-top:4px' }, rt('signoffWait', { who: so.by || '—', date: fdate(String(so.at || '').slice(0, 10)) }),
            so.why ? h('span', { class: 'faint' }, '«' + so.why + '»') : null,
            mine ? h('span', { class: 'faint' }, rt('signoffSelf')) : h('button', { class: 'btn btn-sm', type: 'button', onclick: () => confirm(k) }, icon('check'), rt('signoffBtn'))) : null,
          so && so.ok && (score == null || score < 3) ? h('div', { class: 'faint small' }, rt('signoffOk', { who: so.ok, date: fdate(String(so.okAt || '').slice(0, 10)) })) : null,
          h('details', { class: 'howto small' }, h('summary', null, rt('ruleLabel')), h('p', { class: 'muted' }, rt('rule_' + k)))));
    })));
}
// Block C: the table against the registers, field by field, on the current works contract: what the
// team's Compliance Working Table says beside what Prozorro, the Treasury, Mindev and the CMU say now.
function reconcileCard(r) {
  const tt = r.t || {}, pw = primaryWorks(r), c = pw && pw.contract, row = pw && pw.trackedRow, st = spStage(r);
  const sup = c ? (c.suppliers || [])[0] || {} : null;
  const sv = subvMatch(r), am = sv ? sv.amounts || {} : {}, eds = sv ? sv.editions || Object.keys(am).sort() : [];
  const now = eds.length ? am[eds[eds.length - 1]] : null;
  const ad = sv && sv.name && now != null ? adequacyData(r, now) : null;
  const tableFund = Object.keys(ADEQ_RX).find((k) => ADEQ_RX[k].test(String(tt.funding || '').trim()));
  const num = (x) => toNum(x);
  const near = (a, b, tol) => a == null || b == null || Math.abs(a - b) <= Math.max(1, Math.abs(b) * (tol || 0.005));
  const sameName = (a, b) => !a || !b || orgShort(a).toLowerCase().replace(/[^а-яіїєґa-z0-9]/g, '').slice(0, 12) === orgShort(b).toLowerCase().replace(/[^а-яіїєґa-z0-9]/g, '').slice(0, 12);
  const tablePrice = num(tt.contract_sum) > 0 ? num(tt.contract_sum) : num(tt.contract_value) > 0 ? num(tt.contract_value) : null;
  const acts = row && row.acts_pct != null ? Math.round(row.acts_pct) : null;
  const rows = [
    [rt('rcStatus'), tt.status || null, rt('stage_' + st.stage), tt.status ? (STAGE_OF_STATUS[tt.status] || tt.status) === st.stage : true, 'Prozorro'],
    [rt('cContractor'), tt.contractor || null, sup ? orgShort(sup.name) : null, sameName(tt.contractor, sup && sup.name), 'Prozorro'],
    [rt('cPrice'), tablePrice != null ? money(tablePrice) : null, c && c.value ? money(c.value.amount) : null, near(tablePrice, c && c.value && c.value.amount), 'Prozorro'],
    [rt('rcEnd'), tt.completion ? fdate(tt.completion) : null, c && c.end ? fdate(c.end) : null, !tt.completion || !c || !c.end || tt.completion === c.end, 'Prozorro'],
    [rt('rcDone'), pctOf(tt.pct) != null ? pctOf(tt.pct) + '%' : null, acts != null ? rt('rcActs', { pct: acts }) : null, pctOf(tt.pct) == null || acts == null || Math.abs(pctOf(tt.pct) - acts) <= 15, rt('rcTreasury')],
    [rt('rcPaid'), r.paid != null ? money(r.paid) : null, row && row.totals ? money(row.totals.paid_total || row.totals.paid || 0) : null, true, rt('rcTreasuryMrd')],
    [rt('subvention'), +tt.subv_year > 0 ? money(+tt.subv_year) : null, now != null ? money(now * 1000) : null, !(+tt.subv_year > 0) || now == null || near(+tt.subv_year, now * 1000, 0.01), rt('rcCmu')],
    [rt('rcFunding'), tt.funding || null, ad ? t('fa.st.' + ad.status) : null, !tableFund || !ad || tableFund === ad.status, rt('rcCalc')],
  ];
  const diff = rows.filter((x) => x[1] != null && x[2] != null && !x[3]).length;
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('rcTitle')),
      diff ? h('span', { class: 'sev medium' }, rt('rcDiff', { n: diff })) : h('span', { class: 'sev ok' }, rt('rcSame'))),
    h('p', { class: 'faint small' }, basisLine(r)),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile rc' },
      h('thead', null, h('tr', null, [rt('rcField'), rt('rcTable'), rt('rcLive'), rt('rcSource')].map((x) => h('th', null, x)))),
      h('tbody', null, rows.map(([f, a, b, same, src]) => h('tr', { class: a != null && b != null && !same ? 'row-warn' : '' },
        td(rt('rcField'), null, h('b', null, f)), td(rt('rcTable'), null, a == null ? h('span', { class: 'faint' }, '—') : a),
        td(rt('rcLive'), null, b == null ? h('span', { class: 'faint' }, '—') : b), td(rt('rcSource'), { class: 'faint small' }, src)))))),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('a', { class: 'btn btn-sm', href: '#/sp/' + encodeURIComponent(r.code) + '/work#status' }, icon('edit'), rt('rcUpdate'))));
}
// Block D: what changed in the sub-project in the last 30 days, newest first; the whole story in Signals.
function recentCard(r) {
  const since = addDays(today(), -30);
  const items = typeof spSignalItems === 'function' ? spSignalItems(r, since).sort((a, b) => String(b.at).localeCompare(String(a.at))) : [];
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('recentTitle')), h('a', { class: 'btn btn-sm', href: '#/signals' }, rt('recentAll'))),
    items.length ? h('div', { class: 'ev-feed' }, items.slice(0, 15).map((x) => h('a', { class: 'ev-row' + (x.imp ? ' new' : ''), href: x.href || '#/sp/' + encodeURIComponent(r.code) },
      h('span', { class: 'num' }, fdate(x.at)), h('span', null, h('b', null, x.title), x.who ? ' · ' + x.who : '', x.text ? h('div', { class: 'cell-sub' }, String(x.text).slice(0, 160)) : null))))
      : h('p', { class: 'muted small' }, rt('recentNone')));
}
// Block B: the other procedures of the sub-project — supervision, the consulting engineer, author's
// supervision, design, the rest, and the earlier works procedures — in short, for information.
function additionalBlock(r) {
  const items = additionalProcurements(r);
  const facts = infoHints(r);
  if (!items.length && !facts.length) return null;
  const base = '#/sp/' + encodeURIComponent(r.code);
  const order = ['prev', 'ts', 'csc', 'author', 'design', 'other'];
  const roleOf = (it) => (it.previous ? 'prev' : it.role);
  items.sort((a, b) => order.indexOf(roleOf(a)) - order.indexOf(roleOf(b)) || String(b.day || '').localeCompare(String(a.day || '')));
  const rowOf = (it) => {
    const t0 = it.t0, x = it.x || {};
    const c = t0 ? ((t0.contracts || []).filter((k) => k.status !== 'cancelled').sort((a, b) => String(b.signed || '').localeCompare(String(a.signed || '')))[0] || null) : null;
    const sup = c ? (c.suppliers || [])[0] || {} : null;
    const row = c ? ((state.trackedIndex || {}).items || []).find((y) => y.key === c.id || y.contract_id === c.id) : null;
    const prevNote = it.previous ? (c && c.status === 'terminated' ? rt('prevEnded') : t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? rt('prevFailed') : rt('prevOther')) : null;
    const chips = [
      t0 && t0.sasu && t0.sasu.n ? h('button', { type: 'button', class: 'sev as-btn ' + (t0.sasu.violation ? 'high' : 'medium'), onclick: () => openSasuDrawer(r, t0.tid) }, rt('pSasu')) : null,
      t0 && t0.complaints && t0.complaints.n ? h('button', { type: 'button', class: 'sev as-btn medium', onclick: () => openAmcuAndBidsDrawer(r, t0.tid) }, rt('pAmcu', { n: t0.complaints.n, open: t0.complaints.open || 0 })) : null,
      c && c.changes ? h('button', { type: 'button', class: 'tag as-btn', onclick: () => openAmendmentsDrawer(r, c.id) }, rt('changesN', { n: c.changes })) : null,
    ].filter(Boolean);
    return h('div', { class: 'addp-row' },
      h('div', { class: 'addp-main' },
        h('span', { class: 'tag' + (it.previous ? ' warn' : '') }, rt('role_' + roleOf(it))),
        t0 ? pzStatus(t0.status) : x.status ? h('span', { class: 'pz-st run' }, x.status) : null,
        it.tid ? ext(pzUrl(it.tid), it.tid, 'num') : h('span', { class: 'faint' }, rt('pSheetOnly')),
        prevNote ? h('span', { class: 'small warn-text' }, prevNote) : null),
      h('div', { class: 'addp-sub small' },
        sup ? h('span', null, typeof contractorLink === 'function' ? contractorLink(sup.name, sup.code, r) : party(sup.name, sup.code)) : x.contractor ? h('span', null, x.contractor) : h('span', { class: 'faint' }, (t0 && t0.title || x.name || '').slice(0, 120)),
        c ? h('span', { class: 'num' }, join([c.number && '№ ' + c.number, c.value && money(c.value.amount), c.end && '→ ' + fdate(c.end)])) : null,
        row && row.paid_pct != null ? h('span', { class: 'num' }, rt('paidShort', { pct: Math.round(row.paid_pct) })) : null,
        chips),
      h('div', { class: 'addp-act' }, h('a', { class: 'btn btn-sm', href: base + '/procurement/' + encodeURIComponent(procKey(it, r)) }, rt('details'), ' ▸')));
  };
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('addTitle')), h('span', { class: 'count-inline' }, items.length)),
    h('p', { class: 'faint small' }, rt('addHint')),
    h('div', { class: 'addp-list' }, items.map(rowOf)),
    facts.length ? h('details', { class: 'howto small', style: 'margin-top:10px' }, h('summary', null, rt('addFacts', { n: facts.length })),
      facts.map((x) => h('div', { class: x.level === 'low' ? 'muted' : 'warn-text' }, h('span', { class: 'tag' }, rt('role_' + x.role)), ' ', x.text))) : null);
}
const PROC_ROLES = ['works', 'ts', 'csc', 'author', 'design', 'other'];
const roleOfSheet = (k) => tKind(k) || null;
function procItems(r) {
  const byTid = Object.fromEntries((((r.pz || {}).tenders) || []).map((x) => [x.tid, x]));
  const rows = r.tenders || [];
  const items = spTids(r).map((tid) => {
    const t0 = byTid[tid] || null, x = rows.find((y) => y.pz === tid) || null;
    const role = procRole(r, t0, x);
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
  // Each badge opens what it says: the State Audit's monitorings, the complaints and the bids.
  const chip = (cls, text, open) => h('button', { type: 'button', class: 'sev ' + cls + ' as-btn', onclick: open }, text);
  const flags = [
    t0 && t0.sasu && t0.sasu.n ? chip(t0.sasu.violation ? 'high' : 'medium', t0.sasu.violation ? rt('pSasuViol') : rt('pSasu'), () => openSasuDrawer(r, tid)) : null,
    t0 && t0.complaints && t0.complaints.n ? chip(t0.complaints.open ? 'medium' : '', rt('pAmcu', { n: t0.complaints.n, open: t0.complaints.open || 0 }), () => openAmcuAndBidsDrawer(r, tid)) : null,
    x && x.ac === true ? h('span', { class: 'tag ok' }, rt('pAc')) : null,
    x && x.price === true ? h('span', { class: 'tag ok' }, rt('pPrice')) : null,
    ((r.link || {}).auto || []).includes(tid) ? h('span', { class: 'tag' }, rt('autoLinked')) : null,
  ].filter(Boolean);
  const verdict = v.k || tid ? h('div', { class: 'proc-verdict' }, tid ? h('button', { class: 'linklike faint small', type: 'button', onclick: () => openRulesDrawer(r, tid) }, rt('sheetRules') + ':') : h('span', { class: 'faint small' }, rt('sheetRules') + ':'), v.k ? verdictCell(v) : h('span', { class: 'faint small' }, rt('drOpen'))) : null;
  return h('article', { class: 'proc' + (it.primary ? ' primary' : '') + (c ? ' has-contract' : t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? ' off' : '') },
    it.primary ? h('div', { class: 'primary-badge' }, '★ ', rt('pPrimary')) : null,
    h('header', { class: 'proc-head' },
      h('div', { class: 'proc-id' },
        it.of > 1 ? h('span', { class: 'proc-n' }, rt('pAttempt', { n: it.attempt, of: it.of })) : null,
        t0 ? pzStatus(t0.status) : x && x.status ? h('span', { class: 'pz-st run' }, x.status) : null,
        tid ? h('a', { class: 'num proc-tid', href: pzUrl(tid), target: '_blank', rel: 'noopener noreferrer' }, tid) : h('span', { class: 'faint' }, rt('pSheetOnly'))),
      h('div', { class: 'proc-actions' },
        h('a', { class: 'btn btn-sm btn-dark', href: '#/sp/' + encodeURIComponent(r.code) + '/procurement/' + encodeURIComponent(procKey(it, r)) }, rt('pdOpenBtn')),
        row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + row.key }, rt('pDossier'))
          : c && ['active'].includes(c.status) ? h('span', { class: 'faint small' }, isMine(r) ? rt('pAuto') : rt('pNotMine')) : null,
        tid ? actionMenu('', [[rt('unlink'), () => save(linkIds.filter((y) => y !== tid), [...new Set(off.concat(tid))]), 'x', rt('pUnlinkHint')]], 'more') : null)),
    h('div', { class: 'proc-title clamp' }, (t0 && t0.title) || (x && x.name) || '—'),
    h('dl', { class: 'proc-facts' },
      h('div', null, h('dt', null, rt('pMethod')), h('dd', null, (t0 && t0.method ? label('pzt.', t0.method) : x && x.method) || '—')),
      h('div', null, h('dt', null, rt('pExpected')), h('dd', { class: 'num' }, t0 && t0.value ? money(t0.value.amount, t0.value.currency) : x && x.est != null ? money(x.est) : '—')),
      h('div', null, h('dt', null, rt('pDates')), h('dd', { class: 'num' }, issued || opening ? join([issued && fdate(issued), opening && '→ ' + fdate(opening)]) : '—',
        dayDiff(issued, opening) != null ? h('small', null, ' · ' + rt('pDays', { n: dayDiff(issued, opening) })) : null)),
      h('div', null, h('dt', null, rt('pBids')), h('dd', null, bids != null ? (tid ? h('button', { class: 'linklike', type: 'button', onclick: () => openAmcuAndBidsDrawer(r, tid) }, join([String(bids), t0 && t0.disqualified ? rt('pRejected', { n: t0.disqualified }) : null])) : join([String(bids), t0 && t0.disqualified ? rt('pRejected', { n: t0.disqualified }) : null])) : '—')),
      h('div', { class: 'wide' }, h('dt', null, rt('pContract')), h('dd', null, c ? h('span', null, h('b', null, party(sup.name, sup.code)), ' · ', join([c.number ? '№ ' + c.number : null, c.signed ? fdate(c.signed) : null,
        c.value ? money(c.value.amount, c.value.currency) : null, c.end ? rt('pTo', { date: fdate(c.end) }) : null, c.changes ? rt('pChanges', { n: c.changes }) : null, label('pzc.', c.status)]))
        : x && x.contractor ? join([x.contractor, x.contract_no && '№ ' + x.contract_no, x.contract_total != null ? money(x.contract_total) : null])
        : h('span', { class: 'faint' }, t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? rt('pNoContractEnded') : rt('pNoContract')))),
      x && x.paid != null ? h('div', null, h('dt', null, rt('sheetPaid')), h('dd', { class: 'num' }, money(x.paid))) : null,
      // The team's own observations on the procurement and on its execution (the Tenders sheet).
      x && x.obs ? h('div', { class: 'wide' }, h('dt', null, rt('pObs')), h('dd', { class: 'small' }, x.obs)) : null,
      x && x.exec_obs ? h('div', { class: 'wide' }, h('dt', null, rt('pExecObs')), h('dd', { class: 'small' }, x.exec_obs)) : null),
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
    // The works: the current contract (or the tender running for it), not the last one ever signed.
    const pw = role === 'works' ? primaryWorks(r) : null;
    if (pw && pw.mode !== 'sheet') {
      const c = pw.contract, run = !c && pw.tender;
      return h('div', { class: 'proc-sum ' + (c && c.status === 'active' ? 'ok' : run ? 'run' : c ? 'na' : 'warn') }, h('small', null, rt('role_works')),
        h('b', null, c ? rt('pSigned', { what: c.number ? '№ ' + c.number : '' }) : run ? rt(pw.mode === 'retender' ? 'kpiRetender' : 'kpiTender') + ': ' + (label('pzs.', run.status) || run.status) : rt('pNoContractYet')),
        h('span', { class: 'faint small' }, rt('pProcN', { n: list.length })));
    }
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
    h('div', { class: 'proc-sums' }, sumOf('works'), sumOf('ts'), sumOf('csc'), items.some((i) => i.role === 'author') ? sumOf('author') : null,
      h('div', { class: 'proc-sum ' + (bad ? 'bad' : verdicts.length ? 'ok' : 'na') }, h('small', null, rt('sheetRules')),
        h('b', null, !verdicts.length ? rt('pNoChecks') : bad ? rt('pBad', { n: bad, of: verdicts.length }) : rt('pAllOk', { n: verdicts.length })))));
  // Section 1: the current works procurement, the basis of the risks and the progress.
  const main = primaryTids(r);
  const prim = items.filter((i) => i.tid && main.has(i.tid)).map((i) => Object.assign({}, i, { primary: true }));
  const primary = h('section', { class: 'card pad section proc-group' },
    h('h2', { class: 'card-title' }, rt('pMainTitle')),
    h('p', { class: 'small' }, basisLine(r)),
    prim.length ? h('div', { class: 'proc-list' }, prim.map((it) => procItem(r, it, save, linkIds, off))) : h('p', { class: 'muted small' }, rt('pNoMain')));
  // Section 2: the other procedures, each for information: the services by role, then the earlier works ones.
  const rest = items.filter((i) => !(i.tid && main.has(i.tid)));
  const groups = ['ts', 'csc', 'author', 'design', 'other', 'works'].map((role) => {
    // The newest procedure on top, the first attempt at the bottom; a sheet row with no date last.
    const list = rest.filter((i) => i.role === role).sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));
    if (!list.length) return null;
    return h('section', { class: 'card pad section proc-group info' },
      h('h2', { class: 'card-title' }, rt(role === 'works' ? 'role_prev' : 'role_' + role), h('span', { class: 'count-inline' }, list.length)),
      h('p', { class: 'faint small' }, rt('pInfoOnly2')),
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
  return [summary, items.length ? primary : h('div', { class: 'card empty section' }, rt('notLinked'))].concat(groups, [candBox, addBox]);
}

// ---- one procedure in full ------------------------------------------------------------------------
//
// Behind "Деталі" on a procedure: everything the monitor has about it in one page. Prozorro (buyer,
// method, CPV, value, dates, bids, complaints, State Audit, every contract with its changes), the
// team's Tenders sheet field by field, the programme's rules one by one, the team's marks; and for a
// procedure the monitor follows, its timeline, the awards, the price check, the documents.
const procKey = (it, r) => it.tid || 's' + (r.tenders || []).indexOf(it.x);
function procDetail(r, key) {
  const items = procItems(r);
  const it = items.find((i) => procKey(i, r) === key);
  if (!it) return [h('div', { class: 'card empty section' }, rt('pdNotFound'))];
  const { t0, x, tid } = it;
  const T = t0 || {}, X = x || {};
  const linkIds = (r.link && r.link.tids) || [], off = (r.link && r.link.off) || [];
  const v = tenderVerdict(r, x || { kind: { works: 'W', ts: 'TS', csc: 'IC' }[it.role], pz: tid });
  const srv = serverRules(tid);
  const rows = tid ? ((state.trackedIndex || {}).items || []).filter((y) => y.tid === tid) : [];
  const yes = (b) => (b === true ? rt('pdYes') : b === false ? rt('pdNo') : b);
  const dd = (d) => (d ? fdate(String(d).slice(0, 10)) : null);
  const back = '#/sp/' + encodeURIComponent(r.code) + '/procurement';
  const head = h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('a', { class: 'small', href: back }, '← ' + rt('pdBack')),
        h('h2', { class: 'card-title', style: 'margin-top:6px' }, T.title || X.name || '—'),
        h('div', { class: 'chips' }, h('span', { class: 'tag' }, rt('role_' + it.role)), it.of > 1 ? h('span', { class: 'tag' }, rt('pAttempt', { n: it.attempt, of: it.of })) : null,
          t0 ? pzStatus(t0.status) : X.status ? h('span', { class: 'pz-st run' }, X.status) : null,
          ((r.link || {}).auto || []).includes(tid) ? h('span', { class: 'tag' }, rt('autoLinked')) : null)),
      h('div', { class: 'row' }, tid ? ext(pzUrl(tid), 'Prozorro', 'btn btn-sm') : null, T.dream_id ? ext(dreamUrl(T.dream_id), 'DREAM', 'btn btn-sm') : null,
        rows.length ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + rows[0].key }, rt('pDossier')) : null)),
    h('div', { class: 'grid-2' },
      kv([
        [rt('pdId'), tid ? h('span', { class: 'num' }, tid) : rt('pSheetOnly')],
        [t('dos.buyer'), T.buyer_name ? party(T.buyer_name, T.buyer) : null],
        [rt('pMethod'), (T.method ? label('pzt.', T.method) : X.method) || null],
        [rt('pdCpv'), T.cpv || null],
        [rt('pExpected'), T.value ? money(T.value.amount, T.value.currency) : X.est != null ? money(X.est) : null],
        [rt('pdFunders'), (T.funders || []).length ? T.funders.map((f) => f.name || f.code).join(', ') : null],
      ]),
      kv([
        [rt('pdIssued'), dd(T.date || X.issued)],
        [rt('pdOpening'), join([dd(T.deadline || X.opening), dayDiff(T.date || X.issued, T.deadline || X.opening) != null ? rt('pDays', { n: dayDiff(T.date || X.issued, T.deadline || X.opening) }) : null])],
        [rt('pdAuction'), dd(X.auction)],
        [rt('pdAward'), dd(X.award)],
        [rt('pdEval'), join([X.eval_report, dd(X.eval_date)])],
        [rt('pBids'), T.bids != null || X.bidders_n != null ? join([String(T.bids != null ? T.bids : X.bidders_n), T.disqualified ? rt('pRejected', { n: T.disqualified }) : null]) : null],
      ])));
  // What came of it: every contract, not only the latest.
  const cons = (T.contracts || []);
  const contracts = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('pdContracts'), cons.length ? h('span', { class: 'count-inline' }, cons.length) : null),
    cons.length ? h('div', { class: 'qs-contracts' }, cons.map((c) => {
      const row = rows.find((y) => y.key === c.id || y.contract_id === c.id);
      return h('div', { class: 'qs-contract' },
        h('div', null, h('b', null, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })), ' ', pzStatus(c.status),
          h('div', { class: 'cell-sub' }, join([(c.suppliers || []).map((s) => party(s.name, s.code)).join(', '), c.value ? money(c.value.amount, c.value.currency) : null,
            c.start ? rt('pdFrom', { date: fdate(c.start) }) : null, c.end ? rt('pTo', { date: fdate(c.end) }) : null])),
          c.changes ? h('div', { class: 'cell-sub' }, join([rt('pChanges', { n: c.changes }), c.last_change ? rt('pdLastChange', { date: fdate(c.last_change) }) : null,
            (c.change_types || []).map((k) => label('pzr.', k)).join(', ')])) : null),
        row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + row.key }, rt('pDossier')) : null);
    })) : X.contractor ? kv([[rt('pContract'), join([X.contractor, X.contractor_id, X.contract_no && '№ ' + X.contract_no, dd(X.contract_date), X.contract_total != null ? money(X.contract_total) : null])]])
      : h('p', { class: 'muted small' }, t0 && ['unsuccessful', 'cancelled'].includes(t0.status) ? rt('pNoContractEnded') : rt('pNoContract')));
  // Oversight: the Antimonopoly Committee and the State Audit Service, by Prozorro and by the sheet.
  const cp = T.complaints || {}, sa = T.sasu || {};
  const control = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('pdControl')),
    kv([
      [rt('pdAmcu'), cp.n ? rt('pdAmcuV', { n: cp.n, open: cp.open || 0, ok: cp.satisfied || 0 }) : t0 ? rt('pdNone') : null],
      [rt('pdAmcuTd'), join([X.amcu_td, X.amcu_td_status])],
      [rt('pdAmcuEval'), join([X.amcu_eval, X.amcu_eval_status])],
      [rt('pdSasu'), sa.n ? h('span', null, rt('pdSasuV', { n: sa.n }), sa.violation ? h('span', { class: 'sev high', style: 'margin-left:6px' }, rt('pSasuViol')) : null, sa.active ? h('span', { class: 'sev medium', style: 'margin-left:6px' }, rt('pdSasuActive')) : null,
        (sa.ids || []).length ? h('div', { class: 'cell-sub num' }, sa.ids.join(', ')) : null) : t0 ? rt('pdNone') : null],
      [rt('pdSasuSheet'), X.sasu || null],
    ]));
  // The programme's rules, one line each.
  const rules = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('sheetRules')),
    v.k ? h('div', { class: 'checklist' }, v.found.map((f) => h('div', { class: 'chk ' + (f.st === 'ok' ? 'ok' : f.st === 'bad' ? 'bad' : 'warn') },
      h('span', { class: 'chk-ico' }, f.st === 'ok' ? '✓' : '!'), h('div', null, h('b', null, rt('pfR_' + f.key, f)), h('div', { class: 'small muted' }, rt(f.st === 'ok' ? 'pdRuleOk' : f.st === 'bad' ? 'pdRuleBad' : 'pfToCheck'))))))
      : h('p', { class: 'muted small' }, rt('pNoChecks')),
    srv && srv.bad.length ? h('p', { class: 'small' }, h('span', { class: 'sev high' }, rt('pdServer')), ' ', srv.bad.map((k) => t('rl.k.' + k)).join(', ')) : null);
  // The team's Tenders sheet, every field it has.
  const sheet = x ? h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('pdSheet')),
    h('div', { class: 'grid-2' },
      kv([
        [rt('pdAnalyst'), X.analyst], [rt('pdKind'), X.kind], [rt('pdStatus'), X.status], [rt('pdQr'), yes(X.qr)],
        [rt('pdBidders'), X.bidders ? h('div', { class: 'small' }, String(X.bidders).split(/\n|;\s*/).filter(Boolean).map((b) => h('div', null, b))) : null],
        [rt('pdAc'), join([yes(X.ac), X.ac_flag])], [rt('pdPrice'), join([yes(X.price), X.price_flag])],
        [rt('pdObs'), X.obs], [rt('pdExecObs'), X.exec_obs],
      ]),
      kv([
        [rt('pdContractor'), join([X.contractor, X.contractor_en, X.contractor_id])],
        [rt('pdContractNo'), join([X.contract_no && '№ ' + X.contract_no, dd(X.contract_date), X.contract_end ? rt('pTo', { date: dd(X.contract_end) }) : null])],
        [rt('pdDuration'), X.duration != null ? rt('pdMonths', { n: X.duration }) : null],
        [rt('pdTotal'), X.contract_total != null ? money(X.contract_total) : null],
        [rt('pdCo'), join([X.co_eib != null ? rt('pdCoEib', { sum: money(X.co_eib) }) : null, X.co_local != null ? rt('pdCoLocal', { sum: money(X.co_local) }) : null])],
        [rt('pdMods'), join([X.mods, X.mods_link])],
        [rt('sheetPaid'), join([X.paid != null ? money(X.paid) : null, X.paid_eib != null ? rt('pdCoEib', { sum: money(X.paid_eib) }) : null, X.paid_local != null ? rt('pdCoLocal', { sum: money(X.paid_local) }) : null])],
        [rt('pdLink'), X.contract_link ? (/^https?:/.test(X.contract_link) ? ext(X.contract_link, rt('pdOpen')) : X.contract_link) : null],
      ])),
    // Until the table is uploaded again, the columns read since 0.55.0 are not in the base.
    [...REG.rows.values()].some((q) => (q.tenders || []).some((y) => ['eval_report', 'eval_date', 'exec_obs', 'mods_link', 'co_local', 'duration', 'contractor_en'].some((k) => y[k] != null)))
      ? null : h('p', { class: 'muted small' }, rt('pdSheetHint'))) : null;
  const marks = tid ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pdMarks')), marksRow(r, tid),
    h('div', { class: 'row', style: 'margin-top:12px' }, actionMenu(rt('pdMore'), [[rt('unlink'), async () => {
      await cloud.updateRegistry(r.code, { link: { tids: linkIds.filter((y) => y !== tid), off: [...new Set(off.concat(tid))] } }); location.hash = back;
    }, 'x', rt('pUnlinkHint')]]))) : null;
  // A procedure the monitor follows: its own snapshot has the timeline, awards, price check, documents.
  const deep = h('div');
  if (rows.length) {
    (async () => {
      let s = null;
      try { s = await loadTracked(rows[0].key); } catch (e) { s = null; }
      if (!s) return;
      const c = s.contract || null;
      fill(deep, procurementCard(s, c), s.tender && (s.tender.milestones || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pdTerms')),
        h('div', { class: 'explain' }, s.tender.milestones.map((m) => h('div', { class: m.type === 'financing' ? 'pay' : '' }, h('b', null, label('pzm.type.', m.type) + '. '), h('span', null, milestoneText(m)))))) : null,
        s.tender && (s.tender.docs || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pdDocs'), h('span', { class: 'count-inline' }, s.tender.docs.length)), docList(s.tender.docs)) : null);
    })();
  } else if (tid) {
    fill(deep, h('p', { class: 'muted small section' }, rt('pdNotFollowed')));
  }
  return [head, contracts, control, rules, sheet, marks, deep];
}

// ---- the Documents tab ----------------------------------------------------------------------------
//
// Every document the monitor can reach for the sub-project, by procedure (works, supervision,
// consulting engineer, the rest; newest first): the procurement's documents, the contract and its
// amendments, the State Audit Service's decisions, conclusions and correspondence. Prozorro's files
// are kept for the procedures on control (their snapshots); for the others the tab says how many
// there are and opens them on Prozorro. Links from the team's table, DREAM and the Cabinet's
// subvention order come first.
const DOCF = { q: '', kind: '' };
const DOC_KINDS = ['tender', 'contract', 'change', 'sasu', 'link'];
function docsTab(r) {
  const tt = r.t || {};
  // The search and the kind belong to one sub-project: another one opens with all its documents.
  if (DOCF.code !== r.code) Object.assign(DOCF, { code: r.code, q: '', kind: '' });
  const items = procItems(r).slice().sort((a, b) => PROC_ROLES.indexOf(a.role) - PROC_ROLES.indexOf(b.role) || String(b.day || '').localeCompare(String(a.day || '')));
  const rows = ((state.trackedIndex || {}).items || []).filter((y) => spTids(r).includes(y.tid) && onTeamList(y.key));
  const box = h('div', null, h('div', { class: 'card empty section' }, t('ui.loading')));
  const sv = subvMatch(r);
  const dec = sv ? (SUBV.decrees || []).find((d) => d.nreg === sv.nreg) : null;
  const isUrl = (x) => /^https?:\/\//.test(String(x || ''));
  // SP-level links: DREAM, the subvention order, the team's links to contracts and amendments.
  const links = [
    spDream(r) ? { kind: 'link', title: 'DREAM ' + spDream(r), type: rt('dDream'), url: dreamUrl(spDream(r)) } : null,
    dec && dec.url ? { kind: 'link', title: dec.title || dec.nreg, type: rt('dSubv', { n: dec.nreg }), url: dec.url } : null,
  ].concat((r.tenders || []).flatMap((x) => [
    isUrl(x.contract_link) ? { kind: 'link', title: rt('dTableContract', { no: x.contract_no || x.name || '' }), type: rt('dTable'), url: x.contract_link, pz: x.pz } : null,
    isUrl(x.mods_link) ? { kind: 'link', title: rt('dTableMods', { no: x.contract_no || '' }), type: rt('dTable'), url: x.mods_link, pz: x.pz } : null,
  ])).filter(Boolean);
  (async () => {
    const snaps = await Promise.all(rows.map(async (y) => { try { return { y, s: await loadTracked(y.key) }; } catch (e) { return { y, s: null }; } }));
    let eib = null;
    try { eib = await loadEib(); } catch (e) { eib = null; }
    const eibDocs = Object.fromEntries(((eib || {}).items || []).map((x) => [x.tid, x.docs]));
    // Per procedure: its documents from every snapshot under it, each file once.
    const byTid = {};
    for (const { y, s } of snaps) {
      if (!s) continue;
      const g = byTid[y.tid] = byTid[y.tid] || { docs: new Map(), contracts: new Map(), sasu: new Map() };
      for (const d of ((s.tender || {}).docs || [])) g.docs.set(d.id || d.url, Object.assign({ kind: 'tender' }, d));
      if (s.contract && s.contract.id) {
        const c = g.contracts.get(s.contract.id) || { c: s.contract, docs: new Map() };
        for (const d of s.contract.docs || []) c.docs.set(d.id || d.url, Object.assign({ kind: isChangeDoc(d) ? 'change' : 'contract' }, d));
        g.contracts.set(s.contract.id, c);
      }
      for (const m of s.sasu || []) g.sasu.set(m.id, m);
    }
    const draw = () => {
      const words = DOCF.q.toLowerCase().split(/\s+/).filter(Boolean);
      const keep = (d) => (!DOCF.kind || d.kind === DOCF.kind) && (!words.length || words.every((w) => String(d.title || '').toLowerCase().includes(w) || String(d.type || '').toLowerCase().includes(w)));
      const row = (d) => h('a', { class: 'doc', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, icon('file'),
        h('span', null, h('b', null, d.title || '—'), h('small', null, join([d.typeLabel || (d.type ? label('pzd.', d.type) : null), d.date ? fdate(String(d.date).slice(0, 10)) : null]))), icon('ext'));
      const list = (docs) => { const shown = docs.filter(keep).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); return shown.length ? h('div', { class: 'doc-list' }, shown.map(row)) : null; };
      const part = (title, docs) => { const l = list(docs); return l ? h('div', { class: 'doc-part' }, h('h3', { class: 'card-sub' }, title, h('span', { class: 'count-inline' }, docs.filter(keep).length)), l) : null; };
      let total = 0, counts = { tender: 0, contract: 0, change: 0, sasu: 0, link: links.length };
      const cards = items.map((it) => {
        const g = it.tid ? byTid[it.tid] : null;
        const tender = g ? [...g.docs.values()] : [];
        const cons = g ? [...g.contracts.values()] : [];
        const sasuDocs = g ? [...g.sasu.values()].flatMap((m) => (m.docs || []).map((d) => Object.assign({ kind: 'sasu', typeLabel: rt('dSasuOf_' + (d.of || 'post')) + ' · ' + m.id }, d))
          .concat(m.conclusion_pdf ? [{ kind: 'sasu', id: m.id + ':pdf', title: rt('dSasuConclusion', { id: m.id }), typeLabel: rt('dSasuPdf'), url: m.conclusion_pdf, date: m.conclusion_published || m.conclusion_date }] : [])) : [];
        const own = links.filter((l) => l.pz && l.pz === it.tid);
        counts.tender += tender.length; counts.sasu += sasuDocs.length;
        for (const c of cons) for (const d of c.docs.values()) counts[d.kind] += 1;
        const parts = [part(rt('dTender'), tender)]
          .concat(cons.map((c) => {
            const all = [...c.docs.values()];
            return [part(rt('dContract', { no: c.c.number || '—', date: c.c.signed ? fdate(c.c.signed) : '' }), all.filter((d) => d.kind === 'contract')),
              part(rt('dChanges', { no: c.c.number || '—' }), all.filter((d) => d.kind === 'change'))];
          }).flat())
          .concat([part(rt('dSasu'), sasuDocs), part(rt('dTableLinks'), own)]).filter(Boolean);
        const n = parts.length;
        total += tender.length + sasuDocs.length + cons.reduce((a, c) => a + c.docs.size, 0);
        if (!n && (DOCF.q || DOCF.kind) && g) return null;
        const head = h('div', { class: 'card-head' },
          h('div', null, h('h2', { class: 'card-title' }, rt('role_' + it.role), it.of > 1 ? h('span', { class: 'tag', style: 'margin-left:8px' }, rt('pAttempt', { n: it.attempt, of: it.of })) : null),
            h('div', { class: 'small muted clamp' }, join([it.tid, (it.t0 && it.t0.title) || (it.x && it.x.name)]))),
          it.tid ? ext(pzUrl(it.tid), 'Prozorro', 'btn btn-sm') : null);
        return h('section', { class: 'card pad section' }, head,
          n ? parts : g ? h('p', { class: 'muted small' }, rt(DOCF.q || DOCF.kind ? 'dNoneHere' : 'dNoDocs'))
            : h('p', { class: 'muted small' }, it.tid ? rt('dNotFollowed', { n: eibDocs[it.tid] != null ? eibDocs[it.tid] : '?' }) : rt('dSheetOnly'),
              it.tid ? [' ', h('a', { href: pzUrl(it.tid), target: '_blank', rel: 'noopener noreferrer' }, rt('dOpenPz'))] : null));
      }).filter(Boolean);
      const general = links.filter((l) => !l.pz);
      fill(box,
        h('div', { class: 'card pad section' },
          h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('dTitle')),
            h('div', { class: 'row' }, h('span', { class: 'muted small' }, rt('dTotal', { n: total, links: links.length })),
              typeof openDriveFolder === 'function' ? h('button', { class: 'btn btn-sm', onclick: (e) => openDriveFolder(e.currentTarget) }, icon('drive'), rt('dDrive')) : null)),
          h('p', { class: 'muted small' }, rt('dLead')),
          h('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap' },
            pills([['', t('ui.all')]].concat(DOC_KINDS.map((k) => [k, rt('dKind_' + k), counts[k] || null])), DOCF.kind, (v) => { DOCF.kind = v; draw(); }),
            (() => { const q = h('input', { class: 'input', type: 'search', value: DOCF.q, placeholder: rt('dSearch'), 'aria-label': rt('dSearch'), style: 'max-width:280px' });
              q.oninput = () => { DOCF.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { draw(); const n = box.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
              return q; })()),
          general.filter(keep).length ? h('div', { class: 'doc-part', style: 'margin-top:12px' }, h('h3', { class: 'card-sub' }, rt('dGeneral')), list(general)) : null),
        cards.length ? cards : h('div', { class: 'card empty section' }, rt('dNothing')));
      // One count: the tab's badge says what the tab holds.
      if (!DOCF.q && !DOCF.kind) {
        REG.docN = Object.assign(REG.docN || {}, { [r.code]: total + links.length });
        const badge = document.querySelector('.sp-tabs a[href$="/docs"] em.count');
        if (badge) badge.textContent = total + links.length;
      }
    };
    draw();
  })();
  return [box];
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
// Tasks due for me (given to me, or to nobody on my sub-projects) by today: for the bell.
function dueTasks(within = 0) {
  if (!REG.access) return [];
  const me = myExpert(), until = addDays(today(), within), out = [];
  for (const r of REG.rows.values()) {
    for (const x of openTasks(r)) {
      if (x.due && x.due <= until && (x.who ? x.who === me : isMine(r))) out.push(Object.assign({ code: r.code, name: (r.t || {}).name_uk || (r.t || {}).name_en || '' }, x));
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
