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
  const live = m;
  // The current works contract's own payments (Mindev's tranches of it); an ended contract's and
  // the services' payments are shown apart and never count in its share paid.
  const sum = (list, k) => list.filter((x) => x.paid).reduce((a, x) => a + (x[k] || 0), 0);
  const own = f ? mrdPaysOf(r, 'works', m && m.c) : [];
  const ownKey = new Set(own.map((x) => [x.kind, x.received, x.paid, x.eib, x.local].join('|')));
  const allWorks = f ? mrdPaysOf(r, 'works', null) : [];
  const prevWorks = allWorks.filter((x) => !ownKey.has([x.kind, x.received, x.paid, x.eib, x.local].join('|')));
  const services = f ? mrdPaysOf(r, 'ts', null).concat(mrdPaysOf(r, 'csc', null)) : [];
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
  const paidEib = f ? sum(own, 'eib') : null, paidLocal = f ? sum(own, 'local') : null;
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
    // For reference: what went to an earlier works contract and to the services, apart from the share above.
    prevWorks.some((x) => x.paid) || services.some((x) => x.paid) ? h('div', { class: 'f-aside' }, h('h3', { class: 'card-sub' }, rt('fAsideTitle')),
      kv([[rt('fPrevWorks'), prevWorks.some((x) => x.paid) ? money(sum(prevWorks, 'eib') + sum(prevWorks, 'local')) : null],
        [rt('fServices'), services.some((x) => x.paid) ? money(sum(services, 'eib') + sum(services, 'local')) : null]])) : null,
    h('p', { class: 'muted small' }, rt('fStructureHint')));
  return [tiles, structure, treasuryByContract(r), subventionCard(r), mrdCard(r)];
}
// The Treasury's payments by contract: each contract of the sub-project apart (paid for sure, maybe
// ours, its share), the current works one first; a contract the monitor does not follow says so.
function treasuryByContract(r) {
  const pw = primaryWorks(r), list = spContracts(r);
  if (!list.length) return null;
  const curId = pw && pw.contract && pw.contract.id;
  list.sort((a, b) => (b.c.id === curId) - (a.c.id === curId));
  return h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('fTreasuryTitle')),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('cNumber'), rt('fRole'), rt('cPrice'), rt('fTrPaid'), rt('fTrMaybe'), rt('fTrShare'), ''].map((x) => h('th', null, x)))),
      h('tbody', null, list.map((it) => {
        const row = ((state.trackedIndex || {}).items || []).find((y) => y.key === it.c.id || y.contract_id === it.c.id);
        const tt = (row && row.totals) || {}, value = (it.c.value || {}).amount;
        const paid = tt.paid_total || tt.paid;
        return h('tr', { class: it.c.id === curId ? 'row-main' : '' },
          td(rt('cNumber'), null, h('b', null, it.c.number ? '№ ' + it.c.number : '—'), it.c.id === curId ? h('span', { class: 'tag ok', style: 'margin-left:6px' }, '★') : null),
          td(rt('fRole'), null, rt(it.c.id === curId ? 'role_works' : it.role === 'works' ? 'role_prev' : 'role_' + it.role)),
          td(rt('cPrice'), { class: 'num' }, value ? money(value) : '—'),
          td(rt('fTrPaid'), { class: row ? 'num' : 'small' }, row ? money(paid || 0) : h('span', { class: 'faint' }, rt('cNotFollowed'))),
          td(rt('fTrMaybe'), { class: 'num' }, row && tt.maybe ? money(tt.maybe) : '—'),
          td(rt('fTrShare'), { class: 'num' }, row && value && paid ? Math.round((paid / value) * 100) + '%' : '—'),
          td('', { class: 'r' }, row ? h('a', { class: 'btn btn-sm', href: '#/tracked/' + row.key }, rt('pDossier')) : null));
      })))),
    h('p', { class: 'muted small' }, rt('fTreasuryHint')));
}

const monthName = (ym) => { try { return new Date(ym + '-15').toLocaleDateString(LANG === 'en' ? 'en-GB' : 'uk-UA', { month: 'long', year: 'numeric' }); } catch (e) { return ym; } };
