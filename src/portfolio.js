// The portfolio summary: EIB–UNDP agreement KPIs and problem objects.
// ---- portfolio summary -------------------------------------------------------------------------
//
// The EIB–UNDP agreement of 25.02.2026 (Annex A, Output 2 "Sub-Project Compliance and Quality
// Assurance") measures the team by six indicators. They are counted here from the registry: the
// table's Tenders sheet (dates, method, AC Assessment, Price Verification), the experts' journal
// (in the app and the table's weekly columns), tasks, and the programme rules the sync checks for
// procurements on control. Tender compliance is judged by the rules any edition shares (tender
// period 20/15 days, signing 5 days after the award at the earliest), at the edition's strictness
// as sync/rules.py decides it: a broken rule of an earlier edition is only "to check".
const PF = { year: String(new Date().getFullYear()), expert: '', programme: '', batch: '' };
const KPI_TARGET = { k21: 80, k22: 60, k23: 55, k24: 80, k25: 100, k26: { 2026: 70, 2027: 75 } };
const KPI_FINAL = { k23: 110, k24: 160, k25: 200, k26: 80 };
const EDITION_FROM = { urp3_2026: '2026-11-02', urp3_2024: '2024-08-20', urp_2024: '2024-05-03', urp_2026: '2026-07-13' };  // as sync/rules.py
const PROC_KEYS = ['period', 'standstill', 'bid_security', 'method', 'eligibility'];  // rules of the procedure itself
const DONE_ST = ['Contract Signed', 'No Bids', 'All Rejected', 'Cancelled'];
const progKey = (p) => (/III|\b3\b/.test(p || '') ? 'urp3' : /UERP|\bERP\b|НКПВУ/i.test(p || '') ? 'uerp' : /URP|ПВУ/i.test(p || '') ? 'urp' : null);
// The Tenders sheet's kind: W (works), TS (technical supervision), IC (consulting engineer), AN (author's supervision), D (design).
const tKind = (k) => (/^(Ad_)?W$/i.test(k || '') ? 'works' : /^TS$/i.test(k || '') ? 'ts' : /^IC$/i.test(k || '') ? 'csc' : /^AN$/i.test(k || '') ? 'author' : /^D$/i.test(k || '') ? 'design' : null);
const dayDiff = (a, b) => { if (!a || !b) return null; const d = Math.round((Date.parse(b) - Date.parse(a)) / 864e5); return Number.isFinite(d) ? d : null; };
function editionOf(prog, day) {
  if (prog === 'urp3') { const ed = day >= EDITION_FROM.urp3_2026 ? 'urp3_2026' : 'urp3_2024'; return { ed, strict: day >= EDITION_FROM[ed] }; }
  if (prog) return day >= EDITION_FROM.urp_2026 ? { ed: 'urp_2026', strict: true } : { ed: 'urp_2024', strict: day >= EDITION_FROM.urp_2024 };
  return { ed: null, strict: false };
}
// What the sync found for a procedure on control, by its Prozorro id.
function serverRules(tid) {
  if (!tid) return null;
  const rows = ((state.trackedIndex || {}).items || []).filter((x) => x.tid === tid && x.rules);
  if (!rows.length) return null;
  return { bad: [...new Set(rows.flatMap((x) => x.rules.bad || []))], strict: rows.some((x) => x.rules.strict) };
}
// One procedure of the Tenders sheet: its year, whether it is finished, and its verdict.
function tenderVerdict(r, x) {
  const k = tKind(x.kind);
  const pz = ((r.pz || {}).tenders || []).find((t0) => t0.tid === x.pz) || {};
  const issued = x.issued || pz.date || null, opening = x.opening || pz.deadline || null;
  const day = String(issued || opening || x.award || x.contract_date || '');
  const prog = progKey((r.t || {}).programme), { ed, strict } = editionOf(prog, day);
  const direct = /direct/i.test(x.method || '') || /^(reporting|negotiation)/.test(pz.method || '');
  const found = [];
  const days = dayDiff(issued, opening);
  if (k && !direct && days != null && days >= 0) { const min = k === 'works' || ed === 'urp_2026' ? 20 : 15; found.push({ key: 'period', st: days >= min ? 'ok' : strict ? 'bad' : 'check', days, min }); }
  const ss = dayDiff(x.award, x.contract_date);
  if (!direct && ss != null && ss >= 0) { const bids = Number(x.bidders_n || pz.bids || 0); found.push({ key: 'standstill', st: ss >= 5 ? 'ok' : bids > 1 ? 'bad' : 'check', days: ss }); }
  if (direct) found.push({ key: 'direct', st: 'check' });
  const srv = serverRules(x.pz);
  for (const key of (srv && srv.bad) || []) if (PROC_KEYS.includes(key) && !found.some((f) => f.key === key && f.st === 'bad')) found.push({ key, st: 'bad', server: true });
  const verdict = found.some((f) => f.st === 'bad') ? 'bad' : found.some((f) => f.st === 'ok') ? 'ok' : 'na';
  const done = DONE_ST.includes(x.status) || ['complete', 'unsuccessful', 'cancelled'].includes(pz.status);
  return { r, x, k, year: day.slice(0, 4), done, verdict, found, issued, opening };
}
// The first day of a weekly column of the table ("Week 47 (16.11-22.11)"), in the year the table was uploaded.
function tableWeekDate(week, yr) {
  yr = yr || String(((REG.meta || {}).at && REG.meta.at.toDate ? REG.meta.at.toDate().toISOString() : (REG.meta || {}).at) || today()).slice(0, 4);
  const m = /\((\d{2})\.(\d{2})/.exec(week || '');
  return m ? `${yr}-${m[2]}-${m[1]}` : null;
}
// The experts' activities: the app's journal and the table's weekly columns, the same entry once.
function activities(r) {
  const out = [], seen = new Set();
  for (const x of ((r.work || {}).log || [])) {
    const kind = activityOf(x.kind);
    if (!x.date) continue;
    seen.add(weekOf(x.date).label + '|' + (x.who || '') + '|' + kind);
    out.push({ date: x.date, kind, who: x.who || '', src: 'app' });
  }
  const yr = String(((REG.meta || {}).at && REG.meta.at.toDate ? REG.meta.at.toDate().toISOString() : (REG.meta || {}).at) || today()).slice(0, 4);
  for (const x of ((r.t || {}).log || [])) {
    const kind = WORK_KINDS.find((k) => String(x.what || '').toUpperCase().startsWith(k)) || '';
    if (!kind || seen.has(x.week + '|' + (x.who || '') + '|' + kind)) continue;
    out.push({ date: tableWeekDate(x.week, yr), kind, who: x.who || '', src: 'table' });
  }
  return out;
}
const inYear = (d, y) => y === 'all' || String(d || '').startsWith(y);
function portfolioData() {
  const all = [...REG.rows.values()];
  const rows = all.filter((r) => (!PF.expert || spManager(r) === PF.expert) && (!PF.programme || (r.t || {}).programme === PF.programme) && (!PF.batch || String((r.t || {}).batch) === PF.batch));
  const y = PF.year;
  const tenders = rows.flatMap((r) => (r.tenders || []).map((x) => tenderVerdict(r, x)));
  const acts = rows.flatMap((r) => activities(r).map((a) => Object.assign({ r }, a)));
  const tasks = rows.flatMap((r) => ((r.work || {}).tasks || []).map((x) => Object.assign({ r }, x)));
  // 2.6: finished procedures of the year with a verdict.
  const fin = tenders.filter((v) => v.done && inYear(v.year, y) && v.k);
  const judged = fin.filter((v) => v.verdict !== 'na'), okN = judged.filter((v) => v.verdict === 'ok').length;
  // 2.2: sub-projects with a cost or design check (journal COST VERIFICATION, or Price Verification ticked).
  const costChecked = rows.filter((r) => activities(r).some((a) => a.kind === 'COST VERIFICATION') || (r.tenders || []).some((x) => x.price === true));
  const yTasks = tasks.filter((x) => inYear(x.at || x.due, y));
  const works = (r) => (r.tenders || []).filter((x) => tKind(x.kind) === 'works');
  // Sub-projects being built: a works contract signed and not finished.
  const done100 = (r) => { const p = pctOf((spStatus(r) || {}).pct != null ? spStatus(r).pct : (r.t || {}).pct); return p != null && p >= 100; };
  const building = rows.filter((r) => works(r).some((x) => x.status === 'Contract Signed') && !done100(r));
  const visitsAll = (r) => activities(r).filter((a) => a.kind === 'VISIT').length;
  const fewVisits = building.filter((r) => visitsAll(r) < 2);
  const noTs = building.filter((r) => !(r.tenders || []).some((x) => tKind(x.kind) === 'ts') && !((r.pz || {}).tenders || []).some((t0) => /технічн\S*\s+нагляд/i.test(t0.title || '')));
  const noCsc = rows.filter((r) => Number((r.t || {}).invest_eur || 0) >= 3e6 && works(r).some((x) => x.status === 'Contract Signed')
    && !(r.tenders || []).some((x) => tKind(x.kind) === 'csc') && !((r.pz || {}).tenders || []).some((t0) => /інженер\S*[\s-]*консультант/i.test(t0.title || '')));
  const kpi = {
    k21: { n: yTasks.filter((x) => x.done).length, of: yTasks.length },
    k22: { n: costChecked.length, of: rows.length },
    k23: { n: tenders.filter((v) => v.x.ac === true && inYear(v.x.award || v.x.contract_date || v.year, y)).length },
    k24: { n: acts.filter((a) => a.kind === 'VISIT' && inYear(a.date, y)).length },
    k25: { n: tenders.filter((v) => v.k === 'works' && inYear(v.year, y)).length, marked: tenders.filter((v) => v.k === 'works' && inYear(v.year, y) && v.x.mk_monitor === true).length },
    k26: { n: okN, of: judged.length, na: fin.length - judged.length, fin: fin.length },
  };
  const ratings = { 1: 0, 2: 0, 3: 0, none: 0 };
  rows.forEach((r) => { const o = overallRating(scoresOf(r).scores); ratings[o || 'none']++; });
  const funding = {};
  rows.forEach((r) => { const f = (r.t || {}).funding; if (f) funding[f] = (funding[f] || 0) + 1; });
  // The EIB's payments by the Mindev register: speed in the period, waiting now, after the term, no results to the EIB.
  const facts = rows.map((r) => ({ r, f: mrdFacts(r) })).filter((x) => x.f);
  const pays = facts.flatMap(({ r, f }) => (r.mrd.payments || []).filter((x) => x.paid && inYear(x.paid, y) && f.lag(x) != null && f.lag(x) >= 0 && f.lag(x) < 400).map((x) => f.lag(x)));
  const mrd = facts.length ? {
    sps: facts.length, asOf: facts.map((x) => x.f.asOf).sort().pop(), n: pays.length, med: median(pays), p90: pays.length ? pays.slice().sort((a, b) => a - b)[Math.floor(pays.length * 0.9)] : null,
    waiting: facts.filter((x) => x.f.waiting.some((w) => w.days > 15)).map((x) => ({ r: x.r, days: Math.max(...x.f.waiting.map((w) => w.days)), n: x.f.waiting.length })).sort((a, b) => b.days - a.days),
    afterTerm: facts.filter((x) => x.f.afterTerm.length).map((x) => x.r), noPcr: facts.filter((x) => x.f.noPcr).map((x) => x.r),
  } : null;
  return { all, rows, tenders, fin, judged, bad: fin.filter((v) => v.verdict === 'bad'), kpi, building, fewVisits, noTs, noCsc, ratings, funding, acts, costChecked, mrd };
}
const kpiTarget = (k, y) => (y === 'all' ? KPI_FINAL[k] || (typeof KPI_TARGET[k] === 'number' ? KPI_TARGET[k] : null) : typeof KPI_TARGET[k] === 'object' ? KPI_TARGET[k][y] || KPI_FINAL[k] : KPI_TARGET[k]);
function portfolioPage() {
  if (REG.access === undefined) return [h('div', { class: 'card empty section' }, t('ui.loading'))];
  if (!REG.access) return [h('div', { class: 'card empty section' }, rt('noAccess'))];
  const all = [...REG.rows.values()];
  const years = [...new Set([String(new Date().getFullYear()), ...all.flatMap((r) => (r.tenders || []).map((x) => String(x.issued || '').slice(0, 4)))].filter((x) => /^20\d\d$/.test(x) && x >= '2024'))].sort();
  const experts = [...new Set(all.map(spManager).filter(Boolean))].sort();
  const progs = [...new Set(all.map((r) => (r.t || {}).programme).filter(Boolean))].sort();
  const batches = [...new Set(all.map((r) => (r.t || {}).batch).filter((x) => x != null && x !== '').map(String))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const box = h('div');
  const draw = () => fill(box, portfolioBody(portfolioData()));
  const set = (k) => (e) => { PF[k] = e.target.value; draw(); };
  draw();
  return [pageHead(rt('pfEyebrow'), titleGrad(rt('pfTitle1'), rt('pfTitle2')), rt('pfLead'),
    h('div', { class: 'row' }, h('button', { class: 'btn btn-dark', onclick: () => exportPortfolio(portfolioData()) }, icon('download'), rt('pfExport')))),
  h('div', { class: 'table-card section' }, h('div', { class: 'table-tools' },
    pills(years.map((x) => [x, x]).concat([['all', rt('pfAll')]]), PF.year, (v) => { PF.year = v; draw(); }),
    select([['', rt('anyExpert')]].concat(experts.map((x) => [x, x])), PF.expert, set('expert'), rt('colExpert')),
    select([['', rt('anyProgramme')]].concat(progs.map((x) => [x, x])), PF.programme, set('programme'), 'Programme'),
    select([['', rt('pfAnyBatch')]].concat(batches.map((x) => [x, 'Batch ' + x])), PF.batch, set('batch'), 'Batch'))),
  box];
}
function portfolioBody(d) {
  const y = PF.year, k = d.kpi;
  const pct = (n, of) => (of ? Math.round((n / of) * 100) : null);
  const tile = (key, value, unit, sub, target, good) => h('div', { class: 'card pad kpi' + (good == null ? '' : good ? ' kpi-ok' : ' kpi-low') },
    h('div', { class: 'kpi-head' }, h('span', { class: 'kpi-id' }, key.replace('k', '').replace(/^(\d)/, '$1.')), h('small', null, rt('pf_' + key))),
    h('b', { class: 'num kpi-val' }, value == null ? '—' : ni.format(value) + (unit || '')),
    target != null ? h('div', { class: 'kpi-target' }, rt(unit === '%' ? 'pfTargetPct' : 'pfTarget', { n: target })) : null,
    target != null && value != null ? h('div', { class: 'kpi-bar' }, h('span', { style: `width:${Math.min(100, Math.round((value / target) * 100))}%` })) : null,
    sub ? h('div', { class: 'small muted' }, sub) : null);
  const t26 = kpiTarget('k26', y), v26 = pct(k.k26.n, k.k26.of);
  const t21 = KPI_TARGET.k21, v21 = pct(k.k21.n, k.k21.of), v22 = pct(k.k22.n, k.k22.of);
  const n = (key) => kpiTarget(key, y);
  const spLink = (r) => h('a', { href: '#/sp/' + encodeURIComponent(r.code) }, r.code);
  const reasons = (v) => v.found.filter((f) => f.st === 'bad').map((f) => rt('pfR_' + f.key, f)).join('; ');
  return [
    h('div', { class: 'kpi-grid section' },
      tile('k26', v26, '%', rt('pfSub26', { n: k.k26.n, of: k.k26.of, na: k.k26.na }), t26, v26 == null ? null : v26 >= t26),
      tile('k25', k.k25.n, '', rt('pfSub25', { m: k.k25.marked }), n('k25'), null),
      tile('k24', k.k24.n, '', rt('pfSub24', { n: d.fewVisits.length }), n('k24'), null),
      tile('k23', k.k23.n, '', rt('pfSub23'), n('k23'), null),
      tile('k22', v22, '%', rt('pfSub22', { n: k.k22.n, of: k.k22.of }), KPI_TARGET.k22, v22 == null ? null : v22 >= KPI_TARGET.k22),
      tile('k21', v21, '%', rt('pfSub21', { n: k.k21.n, of: k.k21.of }), t21, v21 == null ? null : v21 >= t21)),
    h('details', { class: 'howto section' }, h('summary', null, rt('pfHow')), h('p', { class: 'muted small' }, rt('pfHint'))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pfOverview')),
      kv([
        [rt('pfSps'), String(d.rows.length)],
        [rt('pfBuilding'), String(d.building.length)],
        [rt('pfRatings'), join([rt('pfR3', { n: d.ratings[3] }), rt('pfR2', { n: d.ratings[2] }), rt('pfR1', { n: d.ratings[1] }), d.ratings.none ? rt('pfRnone', { n: d.ratings.none }) : null])],
        [rt('pfFunding'), Object.keys(d.funding).length ? Object.entries(d.funding).map(([f, c]) => f + ': ' + c).join(' · ') : null],
        [rt('pfTendersAll'), rt('pfTendersLine', { n: d.tenders.filter((v) => inYear(v.year, y)).length, fin: d.fin.length })],
      ])),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, rt('pfBadTitle', { n: d.bad.length })),
      d.bad.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, [rt('colCode'), rt('pfKind'), 'Prozorro', rt('pfIssued'), rt('pfWhy')].map((x) => h('th', null, x)))),
        h('tbody', null, d.bad.map((v) => h('tr', null, h('td', null, spLink(v.r)), h('td', null, v.x.kind || ''), h('td', { class: 'num' }, v.x.pz ? h('a', { href: pzUrl(v.x.pz), target: '_blank', rel: 'noopener noreferrer' }, v.x.pz) : '—'),
          h('td', { class: 'num' }, fdate(v.issued)), h('td', null, reasons(v))))))) : h('p', { class: 'muted small' }, rt('pfNoBad'))),
    d.mrd ? h('div', { class: 'card pad section' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('pfMrd')), h('span', { class: 'muted small' }, rt('mrdAsOf', { date: fdate(d.mrd.asOf), file: '' }))),
      kv([
        [rt('pfMrdSpeed'), d.mrd.n ? rt('pfMrdSpeedV', { n: d.mrd.n, med: d.mrd.med, p90: d.mrd.p90 }) : '—'],
        [rt('pfMrdWaiting', { n: d.mrd.waiting.length }), d.mrd.waiting.length ? h('div', { class: 'chips' }, d.mrd.waiting.map((x) => h('a', { class: 'tag' + (x.days > 30 ? ' warn' : ''), href: '#/sp/' + encodeURIComponent(x.r.code) + '/finance' }, x.r.code + ' · ' + rt('mrdWait', { n: x.days })))) : '—'],
        [rt('pfMrdAfterTerm', { n: d.mrd.afterTerm.length }), d.mrd.afterTerm.length ? h('div', { class: 'chips' }, d.mrd.afterTerm.map((r) => h('a', { class: 'tag', href: '#/sp/' + encodeURIComponent(r.code) + '/finance' }, r.code))) : '—'],
        [rt('pfMrdNoPcr', { n: d.mrd.noPcr.length }), d.mrd.noPcr.length ? h('div', { class: 'chips' }, d.mrd.noPcr.map((r) => h('a', { class: 'tag', href: '#/sp/' + encodeURIComponent(r.code) + '/finance' }, r.code))) : '—'],
      ]), h('p', { class: 'muted small' }, rt('pfMrdHint', { n: d.mrd.sps }))) : null,
    h('div', { class: 'grid-2 section' },
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, rt('pfFewVisits', { n: d.fewVisits.length })), h('p', { class: 'muted small' }, rt('pfFewVisitsHint')),
        d.fewVisits.length ? h('div', { class: 'chips' }, d.fewVisits.map((r) => h('a', { class: 'tag', href: '#/sp/' + encodeURIComponent(r.code), title: (r.t || {}).name_uk || '' }, r.code))) : h('p', { class: 'muted small' }, '—')),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, rt('pfOversight')),
        h('p', { class: 'small' }, h('b', null, rt('pfNoTs', { n: d.noTs.length }))), d.noTs.length ? h('div', { class: 'chips' }, d.noTs.map((r) => h('a', { class: 'tag', href: '#/sp/' + encodeURIComponent(r.code) }, r.code))) : null,
        h('p', { class: 'small', style: 'margin-top:10px' }, h('b', null, rt('pfNoCsc', { n: d.noCsc.length }))), d.noCsc.length ? h('div', { class: 'chips' }, d.noCsc.map((r) => h('a', { class: 'tag', href: '#/sp/' + encodeURIComponent(r.code) }, r.code))) : null,
        h('p', { class: 'muted small', style: 'margin-top:10px' }, rt('pfOversightHint')))),
  ];
}
// The summary as a workbook for the operational report: the indicators, the procedures, the sub-projects.
async function exportPortfolio(d) {
  const y = PF.year, k = d.kpi;
  const head = { bold: true, fill: 'DDEBF7', border: true, wrap: true, valign: 'center' }, cell = { border: true, wrap: true }, num = { border: true, fmt: '#,##0' }, pc = { border: true, fmt: '0%' };
  const date = { border: true, fmt: 'dd.mm.yy' };
  const D = (v) => (v ? { v, s: date, day: true } : { v: null, s: date });
  const ratio = (n, of) => (of ? n / of : null);
  const kpiRows = [
    ['2.1', rt('pf_k21'), ratio(k.k21.n, k.k21.of), k.k21.n, k.k21.of, KPI_TARGET.k21 / 100, true],
    ['2.2', rt('pf_k22'), ratio(k.k22.n, k.k22.of), k.k22.n, k.k22.of, KPI_TARGET.k22 / 100, true],
    ['2.3', rt('pf_k23'), k.k23.n, null, null, kpiTarget('k23', y), false],
    ['2.4', rt('pf_k24'), k.k24.n, null, null, kpiTarget('k24', y), false],
    ['2.5', rt('pf_k25'), k.k25.n, k.k25.marked, null, kpiTarget('k25', y), false],
    ['2.6', rt('pf_k26'), ratio(k.k26.n, k.k26.of), k.k26.n, k.k26.of, kpiTarget('k26', y) / 100, true],
  ];
  const s1 = [[{ v: rt('pfXTitle', { y: y === 'all' ? rt('pfAll') : y }), s: { bold: true, size: 16 } }], [{ v: rt('pfXSub', { date: fdate(today()), n: d.rows.length }), s: { size: 10, color: '6B7280' } }], [],
    [rt('pfXId'), rt('pfXIndicator'), rt('pfXValue'), rt('pfXNum'), rt('pfXDen'), rt('pfXTarget')].map((v) => ({ v, s: head }))]
    .concat(kpiRows.map(([id, name, v, a, b, tg, isPct]) => [{ v: id, s: cell }, { v: name, s: cell }, { v, s: isPct ? pc : num }, { v: a, s: num }, { v: b, s: num }, { v: tg, s: isPct ? pc : num }]));
  const s2 = [[rt('colCode'), rt('pfKind'), rt('pfXName'), 'Prozorro', rt('pfXStatus'), rt('pfIssued'), rt('pfXOpening'), rt('pfXDays'), rt('pfXAward'), rt('pfXContract'), rt('pfXStandstill'), rt('pfXVerdict'), rt('pfWhy')].map((v) => ({ v, s: head }))]
    .concat(d.tenders.filter((v) => inYear(v.year, y)).map((v) => {
      const per = v.found.find((f) => f.key === 'period'), ss = v.found.find((f) => f.key === 'standstill');
      return [{ v: v.r.code, s: cell }, { v: v.x.kind || '', s: cell }, { v: v.x.name || '', s: cell }, v.x.pz ? { v: v.x.pz, f: `HYPERLINK("${pzUrl(v.x.pz)}","${v.x.pz}")`, s: { border: true, color: '0563C1' } } : { v: null, s: cell },
        { v: v.x.status || '', s: cell }, D(v.issued), D(v.opening), { v: per ? per.days : null, s: num }, D(v.x.award), D(v.x.contract_date), { v: ss ? ss.days : null, s: num },
        { v: rt('pfV_' + v.verdict) + (v.done ? '' : ' · ' + rt('pfXOpen')), s: Object.assign({}, cell, v.verdict === 'bad' ? { fill: 'FCE4D6' } : v.verdict === 'ok' ? { fill: 'E2EFDA' } : {}) },
        { v: v.found.filter((f) => f.st !== 'ok').map((f) => rt('pfR_' + f.key, f) + (f.st === 'check' ? ' (' + rt('pfToCheck') + ')' : '')).join('; '), s: cell }];
    }));
  const s3 = [[rt('colCode'), rt('pfXName'), rt('colExpert'), 'Programme', 'Batch', rt('pfXVisitsY'), rt('pfXVisitsAll'), rt('pfXCost'), rt('pfXTs'), rt('pfXCsc'), rt('pfXRating')].map((v) => ({ v, s: head }))]
    .concat(d.rows.slice().sort((a, b) => a.code.localeCompare(b.code)).map((r) => {
      const acts = activities(r), v = acts.filter((a) => a.kind === 'VISIT');
      return [{ v: r.code, s: cell }, { v: (r.t || {}).name_uk || (r.t || {}).name_en || '', s: cell }, { v: spManager(r), s: cell }, { v: (r.t || {}).programme || '', s: cell }, { v: (r.t || {}).batch != null ? String(r.t.batch) : '', s: cell },
        { v: v.filter((a) => inYear(a.date, y)).length, s: num }, { v: v.length, s: num }, { v: d.costChecked.includes(r) ? rt('pfYes') : '', s: cell },
        { v: d.noTs.includes(r) ? rt('pfMissing') : '', s: cell }, { v: d.noCsc.includes(r) ? rt('pfMissing') : '', s: cell }, { v: overallRating(scoresOf(r).scores), s: num }];
    }));
  const files = xlsxBook([
    { name: rt('pfXSheet1'), rows: s1, widths: [6, 60, 12, 12, 12, 12] },
    { name: rt('pfXSheet2'), rows: s2, widths: [12, 6, 50, 24, 14, 11, 11, 8, 11, 11, 8, 14, 50], freeze: { row: 1, col: 1 }, filter: `A1:M${Math.max(2, s2.length)}` },
    { name: rt('pfXSheet3'), rows: s3, widths: [12, 50, 20, 10, 8, 10, 10, 12, 10, 10, 8], freeze: { row: 1, col: 1 }, filter: `A1:K${Math.max(2, s3.length)}` },
  ]);
  const blob = await xlsxBlob(files);
  const a = h('a', { href: URL.createObjectURL(blob), download: rt('pfXFile', { y: y === 'all' ? 'all' : y, date: today() }) + '.xlsx' });
  document.body.append(a); a.click(); a.remove();
}
