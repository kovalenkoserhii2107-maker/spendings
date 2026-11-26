// Signals by sub-project: only what changed.
// ---- signals by sub-project ----------------------------------------------------------------------
//
// Only what changed, never the standing state: the history of the contracts the monitor follows
// (payments, acts, amendments, new risks, lateness that began, a broken rule), the signals that showed
// up after a contract was taken on control (not those it already had), the Cabinet's new editions of the
// subvention, the EIB payments of Mindev's register, the works' end date passing. Each change has its
// date; the window is 7, 30 or 90 days. What one has not seen yet is marked "new" and counted on the
// menu; opening the page sees it. Where a sub-project stands now is in its card, not here.
const SIGF = { scope: 'mine', cat: '', days: 30, st: '' };
const SG_CATS = ['money', 'docs', 'risks'];
const EV_CAT = { payment: 'money', due: 'money', subvention: 'money', funding: 'money',
  rule: 'risks', matrix: 'risks', sasu: 'risks', sasu_status: 'risks', complaint: 'risks', complaint_status: 'risks', legal: 'risks', collusion: 'risks', completion_overdue: 'risks' };
const EV_IMP = new Set(['rule', 'sasu', 'complaint', 'legal', 'collusion', 'completion_overdue']);
const sgDate = (x) => String(x || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3').slice(0, 10);
function spSignalItems(r, since) {
  const out = [];
  const tab = (k) => '#/sp/' + encodeURIComponent(r.code) + '/' + k;
  const add = (x) => { if (x.at && x.at >= since && x.at <= today()) out.push(x); };
  const tracked = spTracked(r);
  for (const row of tracked) {
    const who = row.number ? '№ ' + row.number : row.tid, href = '#/tracked/' + row.key;
    for (const e of row.events || []) {
      if (e.type === 'tracked') continue;
      let title = '';
      try { title = eventText(e); } catch (er) { title = e.type; }
      const imp = EV_IMP.has(e.type) || (e.type === 'matrix' && Number(e.new) > Number(e.old || 0)) || (e.type === 'subvention' && (e.new == null || Number(e.new) < Number(e.old || 0)));
      add({ src: 'ev', type: e.type, cat: EV_CAT[e.type] || 'docs', imp, at: sgDate(e.at), title, text: e.type === 'payment' && e.purpose ? e.purpose : '', who, href });
    }
    // A signal counts as a change only when it appeared after the contract was taken on control.
    for (const g of row.signals || []) {
      if (g.base || !g.since) continue;
      let text = '';
      try { text = signalText(g); } catch (er) { text = ''; }
      add({ src: 'sig', type: g.type, cat: 'risks', imp: g.severity === 'high', at: sgDate(g.since), title: rt('sg_newRisk', { what: t('sig.' + g.type + '.title') }), text, who, href });
    }
  }
  // The Cabinet's latest edition changed this sub-project's subvention (unless a contract already said so).
  const sv = subvMatch(r);
  if (sv && !out.some((x) => x.type === 'subvention')) {
    const am = sv.amounts || {}, eds = (sv.editions || Object.keys(am)).slice().sort();
    for (let i = 1; i < eds.length; i++) {
      const a = Number(am[eds[i - 1]] || 0), b = Number(am[eds[i]] || 0);
      if (Math.abs(a - b) < 0.5) continue;
      add({ src: 'sv', type: 'subvention', cat: 'money', imp: b < a, at: sgDate(eds[i]), title: rt(b < a ? 'sg_subvDown' : 'sg_subvUp', { from: fmtK(a), to: fmtK(b) }), text: sv.nreg || '', href: tab('finance') });
    }
  }
  // What refreshing Prozorro found (a new procedure, a status, a complaint, a monitoring, a change of
  // the contract): in the journal at once, here too.
  if (typeof entriesOf === 'function') {
    for (const e of entriesOf(r).filter((x) => x.kind === 'CHANGE')) {
      const day = e.day || (e.at instanceof Date ? e.at.toISOString().slice(0, 10) : String(e.at || '').slice(0, 10));
      const risky = /ДАСУ|АМКУ|SASU|AMCU|скарг|complaint/i.test(e.text || '');
      add({ src: 'pz', type: 'pz_change', cat: risky ? 'risks' : 'docs', imp: risky, at: day, title: e.text, text: '', href: tab(String(e.target || '').startsWith('contract:') ? 'contracts' : 'procurement') });
    }
  }
  // EIB payments of Mindev's register, one line a day: the parts of one payment come as several rows.
  const byDay = {};
  for (const p of ((r.mrd || {}).payments || [])) if (p.paid) (byDay[sgDate(p.paid)] = byDay[sgDate(p.paid)] || []).push(p);
  for (const [d, ps] of Object.entries(byDay)) {
    const eib = ps.reduce((a, x) => a + (x.eib || 0), 0), local = ps.reduce((a, x) => a + (x.local || 0), 0);
    add({ src: 'mrd', type: 'eib_pay', cat: 'money', imp: false, at: d, title: rt('sg_eibPaid', { sum: money(eib + local) }),
      text: join([[...new Set(ps.map((x) => x.kind).filter(Boolean))].map((k) => rt('mrdK_' + k)).join(', '), local ? rt('sg_eibParts', { eib: money(eib), local: money(local) }) : null]), href: tab('finance') });
  }
  // The works' end date passed with the works not done (when no contract followed says it already).
  const st = spStage(r);
  if (st.late && st.end && !out.some((x) => x.type === 'completion_overdue')) {
    add({ src: 'st', type: 'term', cat: 'risks', imp: true, at: addDays(st.end, 1), title: rt('sg_termPassed', { date: fdate(st.end) }), text: st.pct != null ? rt('sg_termPct', { pct: st.pct }) : '', href: tab('overview') });
  }
  // A procurement followed and the contract it turned into can say the same thing: once.
  const seen = new Set();
  return out.filter((x) => { const k = [x.type, x.at, x.title, x.who].join('|'); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((x) => Object.assign({ r, id: [r.code, x.src, x.type, x.at, x.who || '', x.title].join('|') }, x));
}
function spSignalPool(scope, days) {
  const since = addDays(today(), -(days || 30));
  return [...REG.rows.values()].filter((r) => scope === 'all' || isMine(r)).flatMap((r) => spSignalItems(r, since));
}
// What one has seen: the ids of the changes, kept in this browser.
function sgSeenGet() {
  let local = [];
  try { local = JSON.parse(localStorage.getItem('spSigSeen') || '[]'); } catch (e) { local = []; }
  return new Set(local.concat(((REG.profile || {}).sigSeen) || []));
}
let sgSaveTimer = null;
function sgSeenPut(set) {
  const ids = [...set].slice(-2000);
  try { localStorage.setItem('spSigSeen', JSON.stringify(ids)); } catch (e) { /* not kept */ }
  REG.profile = Object.assign({}, REG.profile, { sigSeen: ids });
  clearTimeout(sgSaveTimer);
  sgSaveTimer = setTimeout(() => { if (cloud && cloud.saveSigSeen && state.user) cloud.saveSigSeen(ids).catch(() => {}); }, 1500);
}
// The team's status of a change (new, being worked on, resolved): registry/{code}.sigState, by a short key.
const sgKey = (id) => { let h = 0x811c9dc5; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); } return 's' + (h >>> 0).toString(36); };
const sgStatus = (x) => (((x.r.sigState || {})[sgKey(x.id)]) || {}).st || 'new';
async function sgSetStatus(x, st) {
  const patch = st === 'new' ? cloud.DEL() : { st, by: myExpert(), at: new Date().toISOString() };
  x.r.sigState = Object.assign({}, x.r.sigState, { [sgKey(x.id)]: st === 'new' ? undefined : patch });
  try { await cloud.updateRegistry(x.r.code, { sigState: { [sgKey(x.id)]: patch } }); } catch (e) { toast(e.message, { bad: true }); }
}
function spSignalCount() {
  if (!REG.access || !REG.rows.size) return 0;
  const seen = sgSeenGet();
  return spSignalPool('mine', 30).filter((x) => !seen.has(x.id) && sgStatus(x) !== 'resolved').length;
}
function spSignalsPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  // Opening the page sees nothing: a change is seen when it is opened, or with "Mark as seen".
  const box = h('div');
  const draw = () => {
    const all = spSignalPool(SIGF.scope, SIGF.days);
    const seen = sgSeenGet();
    const isNew = (x) => !seen.has(x.id);
    const markSeen = (list) => { const s2 = sgSeenGet(); for (const x of list) s2.add(x.id); sgSeenPut(s2); };
    const byStatus = { new: (x) => isNew(x) && sgStatus(x) !== 'resolved', progress: (x) => sgStatus(x) === 'progress', resolved: (x) => sgStatus(x) === 'resolved' };
    const pool = SIGF.st ? all.filter(byStatus[SIGF.st]) : all.filter((x) => sgStatus(x) !== 'resolved');
    const shown = (SIGF.cat ? pool.filter((x) => x.cat === SIGF.cat) : pool)
      .sort((a, b) => b.at.localeCompare(a.at) || Number(b.imp) - Number(a.imp) || a.r.code.localeCompare(b.r.code));
    const fresh = all.filter(byStatus.new).length;
    const mineN = [...REG.rows.values()].filter(isMine).length;
    const followed = [...REG.rows.values()].filter((r) => SIGF.scope === 'all' || isMine(r)).reduce((a, r) => a + spTracked(r).length, 0);
    const dayName = (d) => (d === today() ? rt('sgToday') : d === addDays(today(), -1) ? rt('sgYesterday') : fdate(d));
    const row = (x, i, list) => {
      const same = i && list[i - 1].r.code === x.r.code && list[i - 1].at === x.at;
      const st = sgStatus(x);
      const stSel = h('select', { class: 'sg-st st-' + st, 'aria-label': rt('sgStatus'), onclick: (e) => { e.preventDefault(); e.stopPropagation(); },
        onchange: async (e) => { e.stopPropagation(); markSeen([x]); await sgSetStatus(x, e.target.value); draw(); } },
        ['new', 'progress', 'resolved'].map((k) => h('option', { value: k, selected: k === st || null }, rt('sgSt_' + k))));
      return h('a', { class: 'sg-row' + (x.imp ? ' sev-high' : isNew(x) ? ' sev-news' : '') + (same ? ' same' : '') + (st === 'resolved' ? ' done' : ''), href: x.href, onclick: () => markSeen([x]) },
        h('span', { class: 'sg-dot', 'aria-hidden': 'true' }),
        same ? h('span') : h('span', { class: 'sg-sp' }, h('b', null, x.r.code), h('span', { class: 'clamp1' }, (x.r.t || {}).name_uk || (x.r.t || {}).name_en || ''),
          SIGF.scope === 'all' ? h('small', null, spManager(x.r) || '—') : null),
        h('span', { class: 'sg-what' },
          h('span', { class: 'sg-head' }, h('span', { class: 'sg-cat' }, rt('sgc_' + x.cat)), isNew(x) ? h('span', { class: 'sg-new' }, rt('sg_new')) : null, h('b', null, x.title)),
          x.text ? h('span', { class: 'sg-text clamp' }, x.text) : null,
          x.who ? h('small', { class: 'faint' }, x.who) : null),
        stSel,
        icon('arrow'));
    };
    const days = [...new Set(shown.map((x) => x.at))];
    fill(box,
      h('div', { class: 'sg-scope section' },
        pills([['mine', rt('sgMine', { who: myManager() }), mineN], ['all', rt('sgAll'), REG.rows.size]], SIGF.scope, (v) => { SIGF.scope = v; draw(); }),
        pills([[7, rt('sgDays', { n: 7 })], [30, rt('sgDays', { n: 30 })], [90, rt('sgDays', { n: 90 })]], SIGF.days, (v) => { SIGF.days = Number(v); draw(); })),
      h('div', { class: 'sg-scope section' },
        pills([['', rt('sgOpen'), all.filter((x) => sgStatus(x) !== 'resolved').length], ['new', rt('sgSt_new'), fresh], ['progress', rt('sgSt_progress'), all.filter(byStatus.progress).length],
          ['resolved', rt('sgSt_resolved'), all.filter(byStatus.resolved).length]], SIGF.st || '', (v) => { SIGF.st = v; draw(); }),
        shown.some(isNew) ? h('button', { class: 'btn btn-sm', onclick: () => { markSeen(shown); draw(); } }, icon('check'), rt('sgMarkSeen')) : null),
      h('div', { class: 'sg-tiles section' },
        h('div', { class: 'sg-tile static' + (fresh ? ' hot' : '') }, h('small', null, rt('sgFresh')), h('b', { class: 'num' }, fresh)),
        [''].concat(SG_CATS).map((c) => h('button', { class: 'sg-tile' + (SIGF.cat === c ? ' on' : ''), type: 'button', 'aria-pressed': SIGF.cat === c ? 'true' : 'false',
          onclick: () => { SIGF.cat = c; draw(); } }, h('small', null, c ? rt('sgc_' + c) : rt('sgAllChanges')), h('b', { class: 'num' }, c ? pool.filter((x) => x.cat === c).length : pool.length)))),
      !shown.length ? h('div', { class: 'card empty section' }, h('b', null, rt('sgNone', { n: SIGF.days })), h('p', { class: 'muted small' }, rt('sgNoneHint', { n: followed })))
        : days.map((d) => {
          const list = shown.filter((x) => x.at === d);
          return h('div', { class: 'card pad section sg-section' },
            h('h2', { class: 'card-title' }, dayName(d), h('span', { class: 'count-inline' }, list.length)),
            h('div', { class: 'sg-list' }, list.map(row)));
        }),
      h('p', { class: 'muted small section' }, rt('sgFoot', { n: followed })));
  };
  draw();
  return [pageHead(rt('sigEyebrow'), titleGrad(rt('sgTitle1'), rt('sgTitle2')), rt('sgLead')), box];
}
