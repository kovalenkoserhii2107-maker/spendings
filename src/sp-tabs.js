// The Funding and Work tabs of a sub-project.
// ---- the Funding tab ------------------------------------------------------------------------------
//
// From the question an expert asks: what the object costs, where the money comes from, how much is
// paid, whether this year's money is enough. Four figures on top; then the structure (the loan and the
// local budget, paid and still to pay), the Cabinet's subvention by edition with the year's adequacy,
// and the EIB payments by Mindev's register one by one.
const numOf = (x) => toNum(x);
function financeTab(r) {
  const tt = r.t || {}, sv = subvMatch(r), f = mrdFacts(r), m = mainContract(r);
  const live = m && m.c.status === 'active' ? m : null;
  const eds = sv ? ((SUBV.decrees || []).find((d) => d.nreg === sv.nreg) || {}).editions || Object.keys(sv.amounts || {}).sort() : [];
  const nowK = sv ? (sv.amounts || {})[eds[eds.length - 1]] : null;
  const firstK = sv ? (sv.amounts || {})[eds[0]] : null;
  const maxK = sv ? Math.max(0, ...Object.values(sv.amounts || {}).map(Number).filter((x) => !isNaN(x))) : null;
  const ad = sv && sv.name ? adequacyData(r, nowK) : null;
  const tableAdeq = Object.keys(ADEQ_RX).find((k) => ADEQ_RX[k].test(String(tt.funding || '').trim()));
  const adeq = (ad && ad.status) || tableAdeq || null;
  const invest = numOf(tt.invest_eur), eibEur = numOf(tt.eib_eur);
  // The works price: the contract in force, else Mindev's register (loan + local), else the table.
  const price = (live ? (live.c.value || {}).amount : null) || (f && f.value) || numOf(tt.contract_value) || numOf(tt.contract_sum);
  const paidEib = f ? f.paidEib : null, paidLocal = f ? f.paidLocal : null;
  const paidAll = f ? paidEib + paidLocal : numOf(r.paid);
  const tile = (cls, label, value, sub) => h('div', { class: 'proc-sum ' + cls }, h('small', null, label), h('b', null, value), sub ? h('span', { class: 'faint small' }, sub) : null);
  const tiles = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('fTitle')),
    h('div', { class: 'proc-sums' },
      tile('na', rt('fCost'), invest != null ? money(invest, 'EUR') : '—', eibEur != null ? rt('fEibShare', { sum: money(eibEur, 'EUR'), pct: invest ? Math.round((eibEur / invest) * 100) : '—' }) : null),
      tile(nowK == null ? 'na' : nowK < maxK - 0.5 ? 'warn' : 'ok', rt('fSubv', { y: today().slice(0, 4) }), nowK != null ? fmtK(nowK) : '—',
        sv ? (nowK < maxK - 0.5 ? rt('fSubvCut', { from: fmtK(maxK) }) : firstK != null && nowK > firstK + 0.5 ? rt('fSubvUp', { from: fmtK(firstK) }) : sv.level === 'budget' ? rt('fSubvBudget') : rt('fSubvSame')) : rt('fSubvNone')),
      tile(paidAll ? 'run' : 'na', rt('fPaid'), paidAll ? money(paidAll) : '—',
        f ? join([price ? rt('fPaidPct', { pct: Math.round((paidAll / price) * 100) }) : null, f.last ? rt('fLast', { date: fdate(f.last) }) : null]) : r.paid != null ? rt('fFromSheet') : null),
      tile(adeq === 'adequate' || adeq === 'excess' ? 'ok' : adeq ? 'bad' : 'na', rt('fAdeq'), adeq ? t('fa.st.' + adeq) : '—',
        ad && ad.need > ad.left ? rt('fGap', { sum: money(ad.need - ad.left) }) : numOf(tt.extra_need) ? rt('fNeed', { sum: money(numOf(tt.extra_need)) }) : ad ? rt('fByMonitor') : tt.funding ? rt('fByTable') : null)));
  // The structure: of the works price, what the loan paid, what the local budget paid, what is left.
  const left = price && paidAll != null ? Math.max(0, price - paidAll) : null;
  const seg = (v, cls) => (price && v ? h('i', { class: cls, style: `width:${Math.max(0.5, Math.min(100, (v / price) * 100))}%`, title: money(v) }) : null);
  const structure = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('fStructure')),
    price && (paidEib != null || paidAll) ? [
      h('div', { class: 'f-bar' }, seg(paidEib, 'eib'), seg(paidLocal, 'local'), f ? null : seg(paidAll, 'eib'), seg(left, 'left')),
      h('div', { class: 'f-legend' },
        f ? h('span', null, h('i', { class: 'eib' }), rt('fLegEib', { sum: money(paidEib) })) : h('span', null, h('i', { class: 'eib' }), rt('fLegPaid', { sum: money(paidAll) })),
        f ? h('span', null, h('i', { class: 'local' }), rt('fLegLocal', { sum: money(paidLocal) })) : null,
        h('span', null, h('i', { class: 'left' }), rt('fLegLeft', { sum: money(left) })))] : h('p', { class: 'muted small' }, rt('fNoPrice')),
    kv([
      [rt('fPrice'), price ? join([money(price), live && live.c.number ? '№ ' + live.c.number : null]) : null],
      [rt('fEibUah'), numOf(tt.eib_uah) != null ? money(numOf(tt.eib_uah)) : null],
      [rt('fCoEib'), numOf(tt.co_eib) != null ? money(numOf(tt.co_eib)) : null],
      [rt('fCoLocal'), numOf(tt.co_local) != null ? money(numOf(tt.co_local)) : null],
      [rt('fSubvPaid'), join([numOf(tt.subv_paid) != null ? rt('fAll', { sum: money(numOf(tt.subv_paid)) }) : null, numOf(tt.subv_paid_year) != null ? rt('fYear', { sum: money(numOf(tt.subv_paid_year)) }) : null])],
      [rt('fUtil'), numOf(tt.subv_util) != null ? pctOf(numOf(tt.subv_util)) + '%' : null],
      [rt('paidSheet'), r.paid != null ? money(r.paid) : null],
    ]),
    h('p', { class: 'muted small' }, rt('fStructureHint')));
  return [tiles, structure, subventionCard(r), mrdCard(r)];
}

// ---- the Work tab ---------------------------------------------------------------------------------
//
// What the expert has to do, what was done, when the site was last seen. Tasks by urgency (overdue,
// coming, no date; done folded), the journal by month with its kinds as filters, the team's marks on
// each procurement, the team's note.
const WTF = { kind: '' };
function workTab(r) {
  const w = r.work || {}, tt = r.t || {};
  const experts = [...new Set([...REG.rows.values()].map(spManager).filter(Boolean).concat([myExpert()]))].sort();
  const tasks = (w.tasks || []).slice();
  const open = tasks.filter((x) => !x.done), done = tasks.filter((x) => x.done);
  const overdue = open.filter((x) => x.due && x.due < today()).sort((a, b) => a.due.localeCompare(b.due));
  const coming = open.filter((x) => x.due && x.due >= today()).sort((a, b) => a.due.localeCompare(b.due));
  const nodate = open.filter((x) => !x.due);
  const entries = (w.log || []).map((x) => Object.assign({ mine: true }, x))
    .concat((tt.log || []).map((x) => ({ date: tableWeekDate(x.week), week: x.week, who: x.who, kind: WORK_KINDS.find((k) => String(x.what || '').toUpperCase().startsWith(k)) || '', text: x.what, done: x.done, table: true })))
    .sort((a, b) => String(b.date || b.week || '').localeCompare(String(a.date || a.week || '')));
  const visits = entries.filter((x) => activityOf(x.kind) === 'VISIT');
  const lastVisit = visits.map((x) => x.date).filter(Boolean).sort().pop();
  const lastAct = entries[0];
  const next = overdue[0] || coming[0] || nodate[0] || null;
  const tile = (cls, label, value, sub) => h('div', { class: 'proc-sum ' + cls }, h('small', null, label), h('b', null, value), sub ? h('span', { class: 'faint small' }, sub) : null);
  const summary = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('wTitle')),
    h('div', { class: 'proc-sums' },
      tile(next ? (next.due && next.due < today() ? 'bad' : 'run') : 'na', rt('wNext'), next ? (next.due ? fdate(next.due) : rt('wNoDate')) : rt('noTasks'), next ? next.text : null),
      tile(overdue.length ? 'bad' : 'ok', rt('wOverdue'), String(overdue.length), rt('wOpen', { n: open.length })),
      tile(visits.length >= 2 ? 'ok' : 'warn', rt('wVisits'), String(visits.length), lastVisit ? rt('wLastVisit', { date: fdate(lastVisit) }) : rt('noVisit')),
      tile('na', rt('wLast'), lastAct ? (lastAct.date ? fdate(lastAct.date) : (lastAct.week || '').replace(/\s*\(.*/, '')) : '—', lastAct ? join([lastAct.kind ? kindLabel(lastAct.kind).split(' — ')[0] : null, lastAct.who]) : null)),
    tt.next && (tt.next.what || tt.next.who) ? h('p', { class: 'small', style: 'margin-top:10px' }, h('b', null, rt('next') + ': '), join([tt.next.what, tt.next.who, tt.next.date && fdate(tt.next.date)])) : null);
  // Tasks
  const tText = h('input', { class: 'input grow', placeholder: rt('taskWhat'), 'aria-label': rt('taskWhat') });
  const tDue = h('input', { class: 'input', type: 'date', value: addDays(today(), 7), 'aria-label': rt('taskDue') });
  const tWho = select(experts.map((x) => [x, x]), spManager(r) || myExpert(), () => {}, rt('taskWho'));
  const addTask = () => {
    if (!tText.value.trim()) { tText.focus(); return; }
    saveWork(r, (ww) => ww.tasks.push({ id: uid(), text: tText.value.trim().slice(0, 500), due: tDue.value || null, who: tWho.value || '', done: false, by: myExpert(), at: today() }));
  };
  tText.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  const taskRow = (x) => h('div', { class: 'w-item' + (x.done ? ' done' : x.due && x.due < today() ? ' late' : '') },
    h('input', { type: 'checkbox', checked: x.done || null, 'aria-label': rt('taskDone'), onchange: (e) => saveWork(r, (ww) => { const it = ww.tasks.find((y) => y.id === x.id); if (it) Object.assign(it, { done: e.target.checked, doneAt: today() }); }) }),
    h('div', { class: 'w-main' }, h('div', null, x.text), h('div', { class: 'cell-sub' }, join([x.who, x.by && x.by !== x.who ? rt('wBy', { who: x.by }) : null, x.done && x.doneAt ? rt('wDoneAt', { date: fdate(x.doneAt) }) : null]))),
    h('span', { class: 'w-date num' }, x.due ? fdate(x.due) : '—'),
    h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: () => saveWork(r, (ww) => { ww.tasks = ww.tasks.filter((y) => y.id !== x.id); }) }, icon('x')));
  const group = (title, list, cls) => (list.length ? [h('div', { class: 'w-group ' + (cls || '') }, title, h('span', { class: 'count-inline' }, list.length)), h('div', { class: 'w-list' }, list.map(taskRow))] : null);
  const tasksCard = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('tasks')),
    h('div', { class: 'w-form' }, tText, tDue, tWho, h('button', { class: 'btn btn-dark', onclick: addTask }, icon('plus'), rt('add'))),
    !tasks.length ? h('p', { class: 'muted small' }, rt('noTasks')) : null,
    group(rt('wGOverdue'), overdue, 'bad'), group(rt('wGComing'), coming), group(rt('wGNoDate'), nodate),
    done.length ? h('details', { class: 'w-done' }, h('summary', null, rt('wGDone', { n: done.length })), h('div', { class: 'w-list' }, done.sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))).map(taskRow))) : null);
  // Journal
  const jDate = h('input', { class: 'input', type: 'date', value: today(), 'aria-label': rt('logDate') });
  const jKind = select(WORK_KINDS.map((k) => [k, kindLabel(k)]), 'VISIT', () => {}, rt('logKind'));
  const jText = h('input', { class: 'input grow', placeholder: rt('logWhat'), 'aria-label': rt('logWhat') });
  const jDone = h('input', { type: 'checkbox', checked: true });
  const addLog = () => {
    if (!jText.value.trim()) { jText.focus(); return; }
    saveWork(r, (ww) => ww.log.push({ id: uid(), date: jDate.value || today(), kind: jKind.value, text: jText.value.trim().slice(0, 1000), who: myExpert(), done: jDone.checked }));
  };
  jText.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLog(); });
  const list = h('div');
  const drawLog = () => {
    const shown = entries.filter((x) => !WTF.kind || activityOf(x.kind) === WTF.kind);
    const months = new Map();
    for (const x of shown) { const k = x.date ? x.date.slice(0, 7) : 'week'; if (!months.has(k)) months.set(k, []); months.get(k).push(x); }
    fill(list, shown.length ? [...months.entries()].map(([k, xs]) => [
      h('div', { class: 'w-group' }, k === 'week' ? rt('wFromTable') : monthName(k), h('span', { class: 'count-inline' }, xs.length)),
      h('div', { class: 'w-list' }, xs.map((x) => h('div', { class: 'w-item log' },
        h('span', { class: 'w-kind k-' + (activityOf(x.kind) || 'other').replace(/\W+/g, '_') }, x.kind ? kindLabel(x.kind).split(' — ')[0] : rt('kind_other')),
        h('div', { class: 'w-main' }, h('div', null, x.text || '—', x.done ? h('span', { class: 'ok-text' }, ' ✓') : null),
          h('div', { class: 'cell-sub' }, join([x.who, x.table ? rt('fromSheet') : null]))),
        h('span', { class: 'w-date num' }, x.date ? fdate(x.date) : (x.week || '').replace(/\s*\(.*/, '')),
        x.mine ? h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: () => saveWork(r, (ww) => { ww.log = ww.log.filter((y) => y.id !== x.id); }) }, icon('x')) : h('span'))))]) : h('p', { class: 'muted small' }, rt('noLog')));
  };
  drawLog();
  const kinds = WORK_KINDS.map((k) => [k, kindLabel(k).split(' — ')[0], entries.filter((x) => activityOf(x.kind) === k).length]).filter((x) => x[2]);
  const journalCard = h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('journal')),
    h('div', { class: 'w-form j' }, jDate, jKind, jText, h('label', { class: 'chk-opt' }, jDone, rt('logDone')), h('button', { class: 'btn btn-dark', onclick: addLog }, icon('plus'), rt('add'))),
    kinds.length > 1 ? h('div', { class: 'chips-row', style: 'padding:10px 0 0' }, pills([['', rt('all'), entries.length]].concat(kinds), WTF.kind, (v) => { WTF.kind = v; drawLog(); })) : null,
    list);
  // The team's marks on each procurement: what was checked, assisted, monitored.
  const tids = spTids(r);
  const marksCard = tids.length ? h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, rt('wMarks')), h('p', { class: 'muted small' }, rt('markHint')),
    h('div', { class: 'w-list' }, tids.map((tid) => { const t0 = (((r.pz || {}).tenders) || []).find((x) => x.tid === tid);
      return h('div', { class: 'w-item marks' }, h('div', { class: 'w-main' }, h('a', { class: 'num', href: pzUrl(tid), target: '_blank', rel: 'noopener noreferrer' }, tid),
        t0 ? h('div', { class: 'cell-sub clamp1' }, join([label('pzs.', t0.status), t0.title])) : null), marksRow(r, tid)); }))) : null;
  return [summary, tasksCard, journalCard, marksCard, noteCard(r)];
}
const monthName = (ym) => { try { return new Date(ym + '-15').toLocaleDateString(LANG === 'en' ? 'en-GB' : 'uk-UA', { month: 'long', year: 'numeric' }); } catch (e) { return ym; } };
