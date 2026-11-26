// Inspectors that slide over the page: every risk badge, contractor, bidder, amendment, act, payment,
// State Audit conclusion, AMCU complaint and programme rule opens one, with the full text, the
// calculation, the documents and a link to the source — without leaving the sub-project.
//   openContractorDrawer(code, r)   the company: ЄДР, owners, sanctions, AMCU, turnover, load, its contracts, its UNDP sub-projects
//   openRiskDrawer(r, k)            one criterion: the rule, the system's reckoning, the fact, the sign-off, the history
//   openSasuDrawer(r, tid)          State Audit monitorings of a procedure, in full
//   openAmcuAndBidsDrawer(r, tid)   AMCU complaints, the bids, an abnormally low price, peers, the plan, collusion
//   openAmendmentsDrawer(r, cid)    every change of a contract: rationale, price and terms step by step, the Treasury's record
//   openMoneyDrawer(r, cid)         stages, the advance, acts, Treasury payments, Mindev tranches of a contract
//   openRulesDrawer(r, tid)         the programme's rules for a procedure, each with its reckoning
'use strict';

// The snapshot the sync keeps of a contract (by its id) or a procedure (by its Prozorro id): the
// contract's own first, else the procedure's.
function rowFor({ cid, tid }) {
  const items = (state.trackedIndex || {}).items || [];
  if (cid) { const x = items.find((y) => y.key === cid || y.contract_id === cid); if (x) return x; }
  if (tid) return items.find((y) => y.tid === tid && y.kind !== 'tender') || items.find((y) => y.tid === tid) || null;
  return null;
}
// A drawer: its title line, then a body that may still be loading.
function drawer(title, sub, body) {
  const box = h('div', { class: 'drawer-body' }, h('p', { class: 'muted' }, t('ui.loading')));
  sheet(h('div', { class: 'drawer-head' }, h('h2', { class: 'card-title' }, title), sub ? h('p', { class: 'muted small' }, sub) : null), box);
  Promise.resolve(typeof body === 'function' ? body() : body).then((x) => fill(box, x)).catch((e) => fill(box, h('p', { class: 'bad' }, e.message)));
  return box;
}
const withSnap = async (ref) => { const row = rowFor(ref); return row ? { row, s: await loadTracked(row.key).catch(() => null) } : { row: null, s: null }; };
const notFollowed = (tid) => h('div', { class: 'notice small' }, rt('drNotFollowed'), ' ', tid ? ext(pzUrl(tid), 'Prozorro') : null);
const srcLine = (...links) => h('div', { class: 'row drawer-src' }, h('span', { class: 'faint small' }, rt('drSource')), links.filter(Boolean));

// ---- 1. The contractor ----------------------------------------------------------------------------
let LEGAL = null;
const loadLegal = async () => { if (!LEGAL || LEGAL._v !== ver()) { LEGAL = await getJSON('data/legal.json', ver()).catch(() => ({ items: {} })); LEGAL._v = ver(); } return LEGAL; };
function openContractorDrawer(code, r, name) {
  if (!code) return;
  drawer(name ? orgShort(name) : code, rt('drContractorSub', { code }), async () => {
    const L = await loadLegal();
    const lg = Object.assign({ checked: { edr_at: L.edr_at, sanctions_at: L.sanctions_at } }, (L.items || {})[code] || {});
    // The company's card as on the contract page, then where it builds for UNDP.
    const card = /^\d{8}$/.test(code) ? contractorCard({ undp: { legal: lg }, key: '', tid: '' }, { suppliers: [{ code, name }] }) : h('div', { class: 'card pad' }, legalBox(lg));
    const sps = [...REG.rows.values()].map((x) => {
      const c = spContracts(x).find((it) => (it.c.suppliers || []).some((s) => s.code === code));
      return c ? { x, c } : null;
    }).filter(Boolean);
    return [card,
      h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drUndpSps', { n: sps.length })),
        sps.length ? h('div', { class: 'ev-feed' }, sps.map(({ x, c }) => h('a', { class: 'ev-row' + (r && x.code === r.code ? ' new' : ''), href: '#/sp/' + encodeURIComponent(x.code) + '/contracts', onclick: closeSheet },
          h('span', { class: 'num' }, x.code), h('span', null, ((x.t || {}).name_uk || (x.t || {}).name_en || '').slice(0, 90),
            h('div', { class: 'cell-sub' }, join([rt('role_' + c.role), c.c.number && '№ ' + c.c.number, c.c.value && money(c.c.value.amount), label('pzc.', c.c.status)]))))))
          : h('p', { class: 'muted small' }, rt('drNoSps'))),
      srcLine(ext('https://prozorro.gov.ua/search/tender?edrpou=' + encodeURIComponent(code), 'Prozorro'), ext('https://opendatabot.ua/c/' + encodeURIComponent(code), 'Opendatabot'), ext('https://youcontrol.com.ua/catalog/company_details/' + encodeURIComponent(code) + '/', 'YouControl'))];
  });
}
// A contractor's name that opens its drawer.
function contractorLink(name, code, r) {
  if (!code) return name || '—';
  return h('button', { class: 'linklike', type: 'button', onclick: (e) => { e.preventDefault(); e.stopPropagation(); openContractorDrawer(code, r, name); } }, party(name, code));
}

// ---- 2. One risk criterion -------------------------------------------------------------------------
function openRiskDrawer(r, k) {
  const sc = scoresOf(r), items = (allRisk(r) || {})[k] || [];
  const score = sc.scores[k], so = (r.signoff || {})[k], note = (r.scoreNotes || {})[k];
  const log = (r.scoreLog || []).filter((x) => x.k === k).slice().reverse();
  drawer(rt(k), basisLine(r), () => [
    h('div', { class: 'card pad' },
      h('div', { class: 'row' }, h('span', { class: 'score-pick s' + (score || 0) }, score != null ? String(score) : '–'),
        h('span', { class: 'small muted' }, rt('from_' + (sc.from[k] || 'none'))),
        sc.conflict[k] ? h('span', { class: 'small bad' }, '⚡ ' + rt('conflictLine', { sug: sc.conflict[k], score })) : null),
      h('h3', { class: 'card-sub', style: 'margin-top:12px' }, rt('ruleLabel')), h('p', { class: 'small' }, rt('rule_' + k)),
      h('h3', { class: 'card-sub' }, rt('drReckoning')),
      items.length ? h('div', { class: 'checklist one' }, items.map((x) => h('div', { class: 'chk ' + (x.level === 'high' ? 'bad' : x.level === 'medium' ? 'warn' : 'na') },
        h('span', { class: 'chk-ico' }, x.level === 'high' ? '3' : x.level === 'medium' ? '2' : '·'), h('div', null, factLink(r, k, x)))))
        : h('p', { class: 'muted small' }, sc.suggested[k] === 1 ? rt('drNothingFound') : rt('from_none')),
      h('p', { class: 'faint small' }, rt('drSuggest', { n: sc.suggested[k] != null ? sc.suggested[k] : '—' }))),
    h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('factLabel2')),
      note && note.text ? h('p', { class: 'small' }, note.text, h('div', { class: 'faint' }, rt('factBy', { who: note.by || '—', date: fdate(String(note.at || '').slice(0, 10)) }))) : h('p', { class: 'muted small' }, rt('drNoFact')),
      h('p', { class: 'faint small' }, rt('drFactWhere'))),
    so ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drSignoff')),
      h('p', { class: 'small' }, rt('signoffWait', { who: so.by || '—', date: fdate(String(so.at || '').slice(0, 10)) }), so.why ? h('div', null, '«' + so.why + '»') : null,
        so.ok ? h('div', { class: 'ok-text' }, rt('signoffOk', { who: so.ok, date: fdate(String(so.okAt || '').slice(0, 10)) })) : null)) : null,
    h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drHistory', { n: log.length })),
      log.length ? h('div', { class: 'timeline' }, log.map((x) => h('div', { class: 'ev' }, h('span', { class: 'd num' }, fdate(String(x.at).slice(0, 10))),
        h('span', null, rt('drChanged', { from: x.from == null ? '–' : x.from, to: x.to == null ? '–' : x.to, who: x.by || '—' }), x.why ? h('div', { class: 'cell-sub' }, x.why) : null), h('span'))))
        : h('p', { class: 'muted small' }, rt('drNoHistory'))),
    typeof entriesFor === 'function' ? entriesFor(r, 'risk:' + k) : null,
  ]);
}
// A fact under a criterion, opening what it rests on.
function factLink(r, k, x) {
  const pw = primaryWorks(r) || {}, c = pw.contract, tid = pw.tender && pw.tender.tid;
  const sup = c ? (c.suppliers || [])[0] || {} : {};
  const open = { r1: c && (() => openAmendmentsDrawer(r, c.id)), r2: tid && (() => openAmcuAndBidsDrawer(r, tid)), r4: c && (() => openMoneyDrawer(r, c.id)),
    r5: sup.code && (() => openContractorDrawer(sup.code, r, sup.name)), r6: sup.code && (() => openContractorDrawer(sup.code, r, sup.name)),
    r7: tid && (() => openSasuDrawer(r, tid)), r8: tid && (() => openAmcuAndBidsDrawer(r, tid)), rx: () => openRiskDrawer(r, k), r3: () => { closeSheet(); location.hash = '#/sp/' + encodeURIComponent(r.code) + '/finance'; } }[k];
  return open ? h('button', { class: 'linklike', type: 'button', onclick: open }, x.text) : x.text;
}

// ---- 3. State Audit ---------------------------------------------------------------------------------
function openSasuDrawer(r, tid) {
  drawer(rt('drSasu'), tid, async () => {
    const { s } = await withSnap({ tid });
    const t0 = ((r.pz || {}).tenders || []).find((x) => x.tid === tid) || {};
    if (!s) return [notFollowed(tid), t0.sasu && t0.sasu.n ? kv([[rt('pSasu'), join([t0.sasu.n, (t0.sasu.ids || []).join(', '), t0.sasu.violation ? rt('pSasuViol') : null])]]) : null,
      srcLine(ext('https://prozorro.gov.ua/uk/tender/' + encodeURIComponent(tid) + '/monitorings', 'Prozorro'))];
    const list = s.sasu || [];
    return [list.length ? h('div', { class: 'sasu-list' }, list.map(monitoringBlock)) : h('p', { class: 'muted' }, rt('drNoSasu')),
      srcLine(ext('https://prozorro.gov.ua/uk/tender/' + encodeURIComponent(tid) + '/monitorings', 'Prozorro'))];
  });
}

// ---- 4. AMCU complaints and the bids ------------------------------------------------------------------
function openAmcuAndBidsDrawer(r, tid) {
  drawer(rt('drBids'), tid, async () => {
    const { s } = await withSnap({ tid });
    if (!s) return [notFollowed(tid)];
    const t0 = s.tender || {}, u = s.undp || {};
    const cps = (t0.complaints || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const bidders = (u.bidders || {}).list || [];
    return [procurementCard(s, s.contract || null),
      bidders.length ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drBidders', { n: bidders.length })),
        h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' }, h('thead', null, h('tr', null, [rt('cContractor'), rt('drBid'), rt('drStatus')].map((x) => h('th', null, x)))),
          h('tbody', null, bidders.map((b) => h('tr', null, td(rt('cContractor'), null, contractorLink(b.name, b.code, r)), td(rt('drBid'), { class: 'num' }, b.amount != null ? money(b.amount) : '—'),
            td(rt('drStatus'), null, b.status ? label('ud.aw.', b.status) : '—'))))))) : null,
      h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drComplaints', { n: cps.length })),
        cps.length ? h('div', { class: 'timeline' }, cps.map((c) => h('div', { class: 'ev' + (['satisfied', 'resolved'].includes(c.status) ? ' bad' : '') },
          h('span', { class: 'd num' }, fdate(c.date)), h('span', null, h('b', null, c.title || '—'), h('div', { class: 'cell-sub' }, join([rt(c.type === 'complaint' ? 'drComplaint' : 'drClaim'), label('ud.cs.', c.status), c.of && rt('drOf_' + c.of), c.decided && rt('drDecided', { date: fdate(c.decided) })]))), h('span'))))
          : h('p', { class: 'muted small' }, rt('drNoComplaints'))),
      srcLine(ext(pzUrl(tid), 'Prozorro'))];
  });
}

// ---- 5. The changes of a contract -----------------------------------------------------------------------
function openAmendmentsDrawer(r, cid) {
  drawer(rt('drChanges'), null, async () => {
    const { s } = await withSnap({ cid });
    if (!s) return [notFollowed(null)];
    const c = s.contract || {};
    const ch = (c.changes || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const docs = (c.docs || []).filter(isChangeDoc);
    const pr = (s.undp || {}).price || {};
    return [
      h('div', { class: 'card pad' }, kv([[rt('cNumber'), join([c.number && '№ ' + c.number, c.signed && fdate(c.signed)])],
        [rt('cPrice'), pr.first ? join([money(pr.first), '→ ' + money(pr.now || (c.value || {}).amount), pr.change_pct ? (pr.change_pct > 0 ? '+' : '') + pr.change_pct + '%' : null]) : null],
        [rt('cTerm'), join([c.start && fdate(c.start), c.end && '→ ' + fdate(c.end)])]])),
      h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drChangesN', { n: ch.length })),
        ch.length ? h('div', { class: 'timeline' }, ch.map((x) => h('div', { class: 'ev add' }, h('span', { class: 'd num' }, fdate(x.date)),
          h('span', null, h('b', null, (x.types || []).map((y) => label('pzr.', y) || y).join(', ') || rt('drChange')), x.number ? ' · № ' + x.number : '',
            x.text ? h('div', { class: 'cell-sub' }, x.text) : null), h('span'))))
          : h('p', { class: 'muted small' }, rt('drNoChanges'))),
      (s.addendums || []).length ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drTreasuryAdd')),
        h('div', { class: 'timeline' }, s.addendums.map((a) => h('div', { class: 'ev add' }, h('span', { class: 'd num' }, fdate(a.date)),
          h('span', null, t('kind.addendum') + ' № ' + (a.number || '—'), a.published ? h('div', { class: 'cell-sub' }, rt('drPublished', { date: fdate(a.published) })) : null),
          h('span', { class: 'num' }, a.amount ? money(a.amount) : ''))))) : null,
      (s.doc_audit || []).length ? h('div', { class: 'card pad section' }, docAuditBlock(s.doc_audit)) : null,
      docs.length ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drScans', { n: docs.length })), docList(docs)) : null,
      srcLine(s.tid ? ext(pzUrl(s.tid), 'Prozorro') : null, s.sp ? ext('https://spending.gov.ua/new/disposers/contracts/' + encodeURIComponent(s.sp), 'Є-Data') : null)];
  });
}

// ---- 6. The money of a contract ---------------------------------------------------------------------------
function openMoneyDrawer(r, cid) {
  drawer(rt('drMoney'), null, async () => {
    const { s } = await withSnap({ cid });
    const pw = primaryWorks(r) || {};
    const c = (s && s.contract) || (pw.contract && pw.contract.id === cid ? pw.contract : null);
    const mrd = mrdPaysOf(r, 'works', c).slice().sort((a, b) => String(b.received || b.paid || '').localeCompare(String(a.received || a.paid || '')));
    const mrdBox = r.mrd ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drMrd', { n: mrd.length })),
      mrd.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' }, h('thead', null, h('tr', null, [rt('mrdReceived'), rt('mrdPaidOn'), rt('mrdWhat'), rt('mrdEibCol'), rt('mrdLocalCol')].map((x) => h('th', null, x)))),
        h('tbody', null, mrd.map((x) => h('tr', { class: x.paid ? '' : 'row-warn' }, td(rt('mrdReceived'), { class: 'num' }, fdate(x.received)), td(rt('mrdPaidOn'), { class: 'num' }, x.paid ? fdate(x.paid) : rt('mrdWait', { n: x.received ? dayDiff(x.received, today()) : '?' })),
          td(rt('mrdWhat'), null, rt('mrdK_' + x.kind)), td(rt('mrdEibCol'), { class: 'num' }, money(x.eib)), td(rt('mrdLocalCol'), { class: 'num' }, x.local ? money(x.local) : '—'))))))
        : h('p', { class: 'muted small' }, rt('drNoMrd'))) : null;
    if (!s) return [notFollowed(c && pw.tender && pw.tender.tid), mrdBox];
    const tt = s.totals || {};
    const pays = (s.payments || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return [
      h('div', { class: 'card pad' }, trackedBar(tt, s.acts_sum),
        kv([[t('pz.contractValue'), money(tt.value)], [t('tr.paid'), join([money(tt.paid_total || tt.paid), tt.paid_eib ? t('tr.paidSplit', { eib: money(tt.paid_eib), local: money(tt.paid) }) : null])],
          [t('tr.dueNow'), money(tt.due_now)], [rt('fTrMaybe'), tt.maybe ? money(tt.maybe) : null]])),
      (s.stages || []).length ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, t('tr.stages')),
        h('div', { class: 'explain' }, s.stages.map((st) => h('div', { class: 'pay' }, h('b', null, milestoneText(Object.assign({ type: 'financing' }, st)) + '. '),
          t('tr.stageAmount', { sum: money(st.amount) }), st.due ? ' · ' + t('tr.stageDue', { date: fdate(st.due) }) : '', st.optional ? ' · ' + rt('drOptional') : '')))) : null,
      s.advance ? h('div', { class: 'card pad section' }, advanceBlock(s.advance)) : null,
      (s.acts || []).length ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drActs', { n: s.acts.length, sum: money(s.acts_sum) })),
        h('div', { class: 'timeline' }, s.acts.map((a) => h('div', { class: 'ev act' }, h('span', { class: 'd num' }, fdate(a.date)), h('span', null, t('kind.act') + ' № ' + (a.number || '—')), h('span', { class: 'num' }, money(a.amount)))))) : null,
      h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('drPays', { n: pays.length })),
        pays.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' }, h('thead', null, h('tr', null, [t('col.date'), t('col.amount'), t('f.purpose'), ''].map((x) => h('th', null, x)))),
          h('tbody', null, pays.map((p) => h('tr', { class: p.sure ? '' : 'faint-row' }, td(t('col.date'), { class: 'num' }, fdate(p.date)), td(t('col.amount'), { class: 'num' }, money(p.amount)),
            td(t('f.purpose'), { class: 'w-text small' }, p.purpose || '—', p.kekv ? h('div', { class: 'cell-sub' }, t('f.kekv') + ' ' + p.kekv) : null),
            td('', { class: 'small faint' }, p.sure ? '' : rt('fTrMaybe')))))))
          : h('p', { class: 'muted small' }, t('dos.noPayments'))),
      mrdBox,
      srcLine(s.sp ? ext('https://spending.gov.ua/new/disposers/contracts/' + encodeURIComponent(s.sp), 'Є-Data') : null, s.tid ? ext(pzUrl(s.tid), 'Prozorro') : null)];
  });
}

// ---- 7. The programme's rules ----------------------------------------------------------------------------
function openRulesDrawer(r, tid) {
  drawer(rt('drRules'), tid, async () => {
    const { s } = await withSnap({ tid });
    const x = (r.tenders || []).find((y) => y.pz === tid);
    const it = procItems(r).find((i) => i.tid === tid);
    const v = tenderVerdict(r, x || { kind: { works: 'W', ts: 'TS', csc: 'IC' }[(it || {}).role], pz: tid });
    return [s ? rulesCard(s) : notFollowed(tid),
      v && v.k ? h('div', { class: 'card pad section' }, h('h3', { class: 'card-sub' }, rt('sheetRules')), verdictCell(v)) : null,
      srcLine(ext(pzUrl(tid), 'Prozorro'))];
  });
}
