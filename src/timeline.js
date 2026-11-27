// The sub-project's journal (Case Timeline): one stream of comments, visits, checks, tasks and the
// changes the app noticed, one document each in registry/{code}/entries — so two people writing at
// once never overwrite each other. Each entry may point at what it is about: the whole sub-project,
// one risk, one procurement, one contract. The old journal (registry/{code}.work.log and .tasks) is
// moved over once, the first time someone on the team opens the tab.
'use strict';

const ENTRY_KINDS = ['COMMENT', 'VISIT', 'PROCUREMENT ANALYSE', 'COST VERIFICATION', 'CONSULTING', 'RISK MANAGEMENT', 'EX-POST REVIEW', 'TASK'];
const TLF = { kind: '', target: '', code: '' };
const entryKey = (r) => (cloud && cloud.regId ? cloud.regId(r.code) : r.code);

// The entries of a sub-project, newest first: the stream, and (until it is moved over) the old journal.
function entriesOf(r) {
  const list = ((REG.entries && REG.entries.get(entryKey(r))) || []).map((x) => Object.assign({}, x));
  const w = r.work || {};
  if (!w.migrated) {
    const have = new Set(list.map((x) => x.id));
    for (const x of w.log || []) if (!have.has('w_' + x.id)) list.push({ id: 'w_' + x.id, kind: activityOf(x.kind) || 'COMMENT', text: x.text || '', day: x.date, who: x.who || '', done: x.done !== false, legacy: true });
    for (const x of w.tasks || []) if (!have.has('t_' + x.id)) list.push({ id: 't_' + x.id, kind: 'TASK', text: x.text || '', due: x.due || null, who: x.who || '', done: !!x.done, doneAt: x.doneAt || null, day: x.at || null, legacy: true });
  }
  const when = (x) => String(x.day || (x.at instanceof Date ? x.at.toISOString() : x.at) || x.due || '');
  return list.sort((a, b) => when(b).localeCompare(when(a)));
}
const openTasks = (r) => entriesOf(r).filter((x) => x.kind === 'TASK' && !x.done);
// The next activity for the table's NEXT ACTIVITY columns (CA / Activity / Date): the nearest open task.
function nextActivity(r) {
  const x = openTasks(r).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')))[0];
  return x ? { who: x.who || '', what: x.text || '', date: x.due || null } : null;
}
// The old journal into the stream, once and idempotently (each entry keeps its own id).
const MIGRATING = new Set(), MIGRATED = new Set();
async function migrateWork(r) {
  const w = r.work || {};
  if (w.migrated || MIGRATING.has(r.code) || MIGRATED.has(r.code) || !((w.log || []).length || (w.tasks || []).length)) return;
  MIGRATING.add(r.code);
  try {
    for (const x of w.log || []) await cloud.setEntry(r.code, 'w_' + x.id, { kind: activityOf(x.kind) || 'COMMENT', text: String(x.text || '').slice(0, 4000), day: x.date || null, who: x.who || '', done: x.done !== false, target: 'sp', legacy: true });
    for (const x of w.tasks || []) await cloud.setEntry(r.code, 't_' + x.id, { kind: 'TASK', text: String(x.text || '').slice(0, 4000), due: x.due || null, who: x.who || '', done: !!x.done, doneAt: x.doneAt || null, day: x.at || null, target: 'sp', legacy: true });
    await saveWork(r, (ww) => { ww.migrated = new Date().toISOString(); });
    MIGRATED.add(r.code);
  } catch (e) { console.error('migrate journal', r.code, e); } finally { MIGRATING.delete(r.code); }
}

// What an entry can be about, for the form and the filter.
function journalTargets(r) {
  const out = [['sp', rt('tgSp')]];
  for (const k of SCORE_KEYS) out.push(['risk:' + k, rt(k)]);
  for (const it of procItems(r)) if (it.tid) out.push(['tender:' + it.tid, rt('tgTender', { tid: it.tid, role: rt('role_' + it.role) })]);
  for (const it of spContracts(r)) out.push(['contract:' + it.c.id, rt('tgContract', { no: it.c.number || '—' })]);
  return out;
}
const targetLabel = (r, tg) => (journalTargets(r).find((x) => x[0] === tg) || [null, ''])[1];

// A new entry: written at once and shown at once; the field is emptied for the next one.
function entryForm(r, fixedTarget, onAdded) {
  const experts = [...new Set([...REG.rows.values()].map(spManager).filter(Boolean).concat([myExpert()]))].sort();
  const kind = select(ENTRY_KINDS.map((k) => [k, k === 'COMMENT' ? rt('kComment') : k === 'TASK' ? rt('kTask') : kindLabel(k).split(' — ')[0]]), 'COMMENT', () => sync(), rt('logKind'));
  const target = fixedTarget ? null : select(journalTargets(r), TLF.target && TLF.code === r.code ? TLF.target : 'sp', () => {}, rt('tgLabel'));
  const day = h('input', { class: 'input', type: 'date', value: today(), 'aria-label': rt('logDate') });
  const who = select(experts.map((x) => [x, x]), spManager(r) || myExpert(), () => {}, rt('taskWho'));
  const text = h('textarea', { class: 'input grow', rows: 1, maxlength: 4000, placeholder: rt('entryPh'), 'aria-label': rt('logWhat') });
  const msg = h('span', { class: 'small' });
  const sync = () => { day.title = kind.value === 'TASK' ? rt('taskDue') : rt('logDate'); if (kind.value === 'TASK' && day.value === today()) day.value = addDays(today(), 7); };
  const add = async () => {
    const v = text.value.trim();
    if (!v) { text.focus(); return; }
    const isTask = kind.value === 'TASK';
    const e = { kind: kind.value, text: v.slice(0, 4000), target: fixedTarget || (target ? target.value : 'sp'), who: who.value || myExpert(), done: !isTask,
      day: isTask ? today() : day.value || today(), due: isTask ? day.value || null : null };
    text.value = '';
    // At once on screen; the database answers in the background.
    const local = Object.assign({ id: 'local_' + uid(), by: (state.user || {}).uid, byName: myExpert(), at: new Date(), pending: true }, e);
    const key = entryKey(r);
    REG.entries = REG.entries || new Map();
    REG.entries.set(key, [local].concat(REG.entries.get(key) || []));
    if (onAdded) onAdded();
    try { await cloud.addEntry(r.code, e); fill(msg, ''); }
    catch (err) { fill(msg, h('span', { class: 'bad' }, err.message)); REG.entries.set(key, (REG.entries.get(key) || []).filter((x) => x.id !== local.id)); if (onAdded) onAdded(); }
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } });
  text.addEventListener('input', () => { text.style.height = 'auto'; text.style.height = Math.min(200, text.scrollHeight + 2) + 'px'; });
  return h('div', { class: 'tl-form' }, h('div', { class: 'tl-form-row' }, kind, target, day, who), h('div', { class: 'tl-form-row' }, text, h('button', { class: 'btn btn-dark', onclick: add }, icon('plus'), rt('add'))), msg);
}
// One entry: what, about what, who and when; a task can be ticked off; one's own can be edited or removed.
function entryRow(r, x, redraw) {
  const mine = x.by && x.by === ((state.user || {}).uid || '');
  const isTask = x.kind === 'TASK', late = isTask && !x.done && x.due && x.due < today();
  const body = h('div', { class: 'w-main' });
  const show = () => fill(body, h('div', { class: 'tl-text' }, x.text || '—', x.done && !isTask && x.kind !== 'COMMENT' && x.kind !== 'CHANGE' ? h('span', { class: 'ok-text' }, ' ✓') : null),
    h('div', { class: 'cell-sub' }, join([x.target && x.target !== 'sp' ? targetLabel(r, x.target) : null, x.who, x.byName && x.byName !== x.who ? rt('wBy', { who: x.byName }) : null,
      isTask && x.done && x.doneAt ? rt('wDoneAt', { date: fdate(String(x.doneAt).slice(0, 10)) }) : null, x.updatedAt ? rt('tlEdited') : null, x.pending ? rt('tlSaving') : null])));
  const edit = () => {
    const ta = h('textarea', { class: 'input', rows: 3, maxlength: 4000 }); ta.value = x.text || '';
    const save = async () => { const v = ta.value.trim(); if (!v) return; try { await cloud.updateEntry(r.code, x.id, { text: v }); x.text = v; show(); } catch (e) { toast(e.message, { bad: true }); } };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') show(); });
    fill(body, ta, h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn btn-sm btn-dark', onclick: save }, rt('stSave')), h('button', { class: 'btn btn-sm', onclick: show }, rt('cancel'))));
    requestAnimationFrame(() => ta.focus());
  };
  show();
  const kindTag = h('span', { class: 'w-kind k-' + String(x.kind || 'other').replace(/\W+/g, '_') }, x.kind === 'COMMENT' ? rt('kComment') : x.kind === 'TASK' ? rt('kTask') : x.kind === 'CHANGE' ? rt('kChange') : kindLabel(x.kind).split(' — ')[0]);
  const tick = isTask ? h('input', { type: 'checkbox', checked: x.done || null, 'aria-label': rt('taskDone'), onchange: async (e) => {
    x.done = e.target.checked; x.doneAt = today(); redraw && redraw();
    try { await cloud.updateEntry(r.code, x.id, { done: x.done, doneAt: x.done ? today() : null, doneBy: x.done ? myExpert() : null }); } catch (err) { toast(err.message, { bad: true }); }
  } }) : null;
  return h('div', { class: 'w-item log' + (late ? ' late' : '') + (x.done && isTask ? ' done' : '') },
    tick || kindTag, h('div', null, tick ? kindTag : null, body),
    h('span', { class: 'w-date num' }, isTask ? (x.due ? fdate(x.due) : rt('wNoDate')) : x.day ? fdate(x.day) : x.at ? fdate((x.at instanceof Date ? x.at.toISOString() : String(x.at)).slice(0, 10)) : '—'),
    h('span', { class: 'tl-act' },
      !x.legacy && !x.pending && x.kind !== 'CHANGE' ? h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('tlEdit'), title: rt('tlEdit'), onclick: edit }, icon('edit')) : null,
      mine && !x.pending ? h('button', { class: 'btn btn-icon btn-sm', 'aria-label': rt('remove'), onclick: async () => {
        if (!confirm(rt('tlRemoveConfirm'))) return;
        try { await cloud.deleteEntry(r.code, x.id); } catch (e) { toast(e.message, { bad: true }); }
      } }, icon('x')) : null));
}
// The entries about one thing (a risk, a procurement), with a field to add one: for the inspectors.
function entriesFor(r, target) {
  const box = h('div', { class: 'card pad section' });
  const draw = () => {
    const list = entriesOf(r).filter((x) => x.target === target);
    fill(box, h('h3', { class: 'card-sub' }, rt('tlAbout', { n: list.length })), entryForm(r, target, draw),
      list.length ? h('div', { class: 'w-list' }, list.map((x) => entryRow(r, x, draw))) : h('p', { class: 'muted small' }, rt('tlNoneAbout')));
  };
  draw();
  return box;
}

// Visits the EIB–UNDP agreement asks for: at least two per site, three or four for a large object.
function visitsNeeded(r) {
  const eur = toNum((r.t || {}).invest_eur);
  return eur != null && eur >= 3e6 ? 3 : 2;
}

// ---- the Work and comments tab ---------------------------------------------------------------------
function workTab(r) {
  if (TLF.code !== r.code) Object.assign(TLF, { code: r.code, kind: '', target: '' });
  if (REG.entries && !(r.work || {}).migrated) migrateWork(r);
  const tt = r.t || {};
  const box = h('div');
  const draw = () => {
    // The table's weekly marks, less those the journal already has (the export wrote them there:
    // the same expert, kind and week come back on the next import), the newest first.
    const own = entriesOf(r), seen = new Set(own.filter((x) => x.day).map((x) => logKey(x.day, x.who, x.kind)));
    const fromTable = (tt.log || []).map((x) => ({ id: 'tbl_' + x.week + x.who, kind: WORK_KINDS.find((k) => String(x.what || '').toUpperCase().startsWith(k)) || 'COMMENT',
      text: x.what, day: tableWeekDate(x.week), who: x.who, done: x.done, legacy: true, table: true }))
      .filter((x) => { const k = logKey(x.day, x.who, x.kind); if (seen.has(k)) return false; seen.add(k); return true; });
    const all = own.concat(fromTable).sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));
    const tasks = all.filter((x) => x.kind === 'TASK');
    const open = tasks.filter((x) => !x.done).sort((a, b) => String(a.due || '9').localeCompare(String(b.due || '9')));
    const overdue = open.filter((x) => x.due && x.due < today());
    const visits = all.filter((x) => x.kind === 'VISIT');
    const need = visitsNeeded(r);
    const lastVisit = visits.map((x) => x.day).filter(Boolean).sort().pop();
    const stream = all.filter((x) => x.kind !== 'TASK' || x.done);
    const shown = stream.filter((x) => (!TLF.kind || x.kind === TLF.kind) && (!TLF.target || x.target === TLF.target));
    const kinds = [...new Set(stream.map((x) => x.kind))];
    const months = new Map();
    for (const x of shown) { const k = String(x.day || '').slice(0, 7) || 'none'; if (!months.has(k)) months.set(k, []); months.get(k).push(x); }
    const tile = (cls, label, value, sub) => h('div', { class: 'proc-sum ' + cls }, h('small', null, label), h('b', null, value), sub ? h('span', { class: 'faint small' }, sub) : null);
    const next = open[0];
    fill(box,
      h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('wTitle')),
        h('div', { class: 'proc-sums' },
          tile(next ? (next.due && next.due < today() ? 'bad' : 'run') : 'na', rt('wNext'), next ? (next.due ? fdate(next.due) : rt('wNoDate')) : rt('noTasks'), next ? next.text : null),
          tile(overdue.length ? 'bad' : 'ok', rt('wOverdue'), String(overdue.length), rt('wOpen', { n: open.length })),
          tile(visits.length >= need ? 'ok' : 'warn', rt('wVisits'), rt('wVisitsOf', { n: visits.length, need }), lastVisit ? rt('wLastVisit', { date: fdate(lastVisit) }) : rt('noVisit')),
          tile('na', rt('wLast'), stream[0] && stream[0].day ? fdate(stream[0].day) : '—', stream[0] ? join([stream[0].kind === 'COMMENT' ? rt('kComment') : kindLabel(stream[0].kind).split(' — ')[0], stream[0].who]) : null))),
      statusCard(r),
      h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('tlTitle')), h('p', { class: 'muted small' }, rt('tlLead')),
        entryForm(r, null, draw),
        open.length ? [h('div', { class: 'w-group' + (overdue.length ? ' bad' : '') }, rt('tasks'), h('span', { class: 'count-inline' }, open.length)), h('div', { class: 'w-list' }, open.map((x) => entryRow(r, x, draw)))] : null,
        h('div', { class: 'chips-row', style: 'padding:12px 0 0' },
          kinds.length > 1 ? pills([['', rt('all'), stream.length]].concat(kinds.map((k) => [k, k === 'COMMENT' ? rt('kComment') : k === 'TASK' ? rt('kTask') : k === 'CHANGE' ? rt('kChange') : kindLabel(k).split(' — ')[0], stream.filter((x) => x.kind === k).length])), TLF.kind, (v) => { TLF.kind = v; draw(); }) : null,
          select([['', rt('tgAny')]].concat(journalTargets(r)), TLF.target, (e) => { TLF.target = e.target.value; draw(); }, rt('tgLabel'))),
        shown.length ? [...months.entries()].map(([k, xs]) => [h('div', { class: 'w-group' }, k === 'none' ? rt('wNoDate') : monthName(k), h('span', { class: 'count-inline' }, xs.length)),
          h('div', { class: 'w-list' }, xs.map((x) => entryRow(r, x, draw)))]) : h('p', { class: 'muted small' }, rt('noLog'))),
      (() => {
        const tids = spTids(r);
        return tids.length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('wMarks')), h('p', { class: 'muted small' }, rt('markHint')),
          h('div', { class: 'w-list' }, tids.map((tid) => { const t0 = (((r.pz || {}).tenders) || []).find((x) => x.tid === tid);
            return h('div', { class: 'w-item marks' }, h('div', { class: 'w-main' }, h('a', { class: 'num', href: pzUrl(tid), target: '_blank', rel: 'noopener noreferrer' }, tid),
              t0 ? h('div', { class: 'cell-sub clamp1' }, join([label('pzs.', t0.status), t0.title])) : null), marksRow(r, tid)); }))) : null;
      })(),
      noteCard(r));
  };
  draw();
  return [box];
}

// ---- what refreshing Prozorro found, into the journal ------------------------------------------------
// The old and the new picture of the sub-project's procedures: a new procedure, a status that changed,
// a new complaint, a State Audit monitoring that began or found a violation, a contract signed or
// changed. Written as CHANGE entries at once, before the next run of the sync.
function pzChanges(oldPz, newPz) {
  const out = [];
  const before = new Map(((oldPz || {}).tenders || []).filter((x) => !x.error).map((x) => [x.tid, x]));
  for (const t0 of (newPz.tenders || []).filter((x) => !x.error)) {
    const o = before.get(t0.tid);
    const tg = 'tender:' + t0.tid;
    if (!o) { if (before.size) out.push({ target: tg, text: rt('chNewTender', { tid: t0.tid, title: String(t0.title || '').slice(0, 120) }) }); continue; }
    if (o.status !== t0.status) out.push({ target: tg, text: rt('chStatus', { tid: t0.tid, from: label('pzs.', o.status), to: label('pzs.', t0.status) }) });
    const oc = o.complaints || {}, nc = t0.complaints || {};
    if ((nc.n || 0) > (oc.n || 0)) out.push({ target: tg, text: rt('chComplaint', { tid: t0.tid, n: (nc.n || 0) - (oc.n || 0) }) });
    const os = o.sasu || {}, ns = t0.sasu || {};
    if ((ns.n || 0) > (os.n || 0)) out.push({ target: tg, text: rt('chSasu', { tid: t0.tid }) });
    if (ns.violation && !os.violation) out.push({ target: tg, text: rt('chSasuViol', { tid: t0.tid }) });
    const ocs = new Map((o.contracts || []).map((c) => [c.id, c]));
    for (const c of t0.contracts || []) {
      const p = ocs.get(c.id);
      if (!p) out.push({ target: 'contract:' + c.id, text: rt('chContract', { no: c.number || '—', sum: c.value ? money(c.value.amount) : '' }) });
      else {
        if ((c.changes || 0) > (p.changes || 0)) out.push({ target: 'contract:' + c.id, text: rt('chChanged', { no: c.number || '—', n: (c.changes || 0) - (p.changes || 0) }) });
        if (p.status !== c.status) out.push({ target: 'contract:' + c.id, text: rt('chCStatus', { no: c.number || '—', to: label('pzc.', c.status) }) });
      }
    }
  }
  return out;
}
async function logPzChanges(r, oldPz, newPz) {
  if (!REG.access || !cloud || !oldPz || !oldPz.at) return;
  for (const x of pzChanges(oldPz, newPz).slice(0, 20)) {
    try { await cloud.addEntry(r.code, { kind: 'CHANGE', text: x.text, target: x.target, day: today(), who: rt('tlSystem'), done: true }); } catch (e) { console.error('pz change', e); return; }
  }
}
