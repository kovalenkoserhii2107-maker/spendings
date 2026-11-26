// Risk hints of a sub-project (the works procurement only), its ratings, and the CMU subvention.
// ---- risk hints ------------------------------------------------------------------------------

// Paid share of the contract: the table's own figure, else what the Payments sheet says was paid
// for the works over the contract price (Prozorro, or the table's).
function paidShare(r) {
  const tt = r.t || {};
  if (pctOf(tt.paid_pct) != null) return pctOf(tt.paid_pct);
  const m = mainContract(r);
  const value = toNum((m && m.c.value && m.c.value.amount) || tt.contract_value || tt.contract_sum);
  const paid = toNum(r.paid);
  return paid != null && value ? Math.round((paid / value) * 100) : null;
}

const daysSince = (d) => { if (!d) return null; const n = Math.round((Date.now() - new Date(d).getTime()) / 864e5); return Number.isFinite(n) ? n : null; };
// A share as a whole percent: 0.998 and "99,8%" are both 100; a value that is not a number, null.
const pctOf = (x) => { const n = toNum(x); return n == null ? null : typeof x === 'string' && x.includes('%') ? Math.round(n) : n <= 1.5 ? Math.round(n * 100) : Math.round(n); };
const TROUBLE = /призупин|розірв|не викону|зупинен|terminated|suspend/i;

function riskHints(r) {
  const out = {};
  const add = (k, level, text) => { (out[k] = out[k] || []).push({ level, text }); };
  const tt = r.t || {};
  const pzT = (r.pz || {}).tenders || [];
  const main = mainContract(r);
  // The team's rules, approved 20.11.2026 (the rules doc, section by section). What Prozorro shows
  // here is the sub-project's procedures; the contracts on control add their own ratings (contractHints).
  if (main && main.c.changes) {
    const types = (main.c.change_types || []).map((x) => label('pzr.', x) || x).join(', ');
    add('r1', main.c.changes >= 5 ? 'medium' : 'low', rt('h_changes', { n: main.c.changes, types }));
  }
  // State Audit and AMCU: a procedure that gave no contract counts 12 months and at most 2.
  // The works procurement only; the others are in infoHints.
  const works = worksTids(r);
  let upheld = 0;
  for (const t0 of pzT.filter((x) => works.has(x.tid))) {
    const noContract = ['unsuccessful', 'cancelled'].includes(t0.status) && !(t0.contracts || []).some((c) => c.status !== 'cancelled');
    if (noContract && t0.date && t0.date < addDays(today(), -365)) continue;
    const tag = noContract ? ' · ' + rt('h_failedProc', { tid: t0.tid }) : '';
    // A violation is 2 until the sync (on a contract on control) sees it not removed, the contract to end or money overpaid.
    if (t0.sasu && t0.sasu.violation) add('r7', 'medium', rt('h_sasuViol', { ids: (t0.sasu.ids || []).join(', ') }) + tag);
    else if (t0.sasu && t0.sasu.active) add('r7', 'medium', rt('h_sasuActive') + tag);
    const cp = t0.complaints || {};
    if (!noContract) upheld += cp.satisfied || 0;
    if (cp.n && (cp.open || cp.satisfied)) add('r8', 'medium', rt('h_amcu', { n: cp.n, open: cp.open || 0, sat: cp.satisfied || 0 }) + tag);
    else if (cp.n) add('r8', 'low', rt('h_amcu', { n: cp.n, open: 0, sat: 0 }) + tag);
    if (t0.disqualified) add('rx', 'low', t0.tid + ': ' + rt('h_disq', { n: t0.disqualified }));
  }
  if (upheld >= 2) add('r8', 'high', rt('h_amcuMany', { n: upheld }));
  const failed = (r.tenders || []).filter((x) => isWorksRow(r, x) && /No Bids|All Rejected|Cancel/i.test(x.status || '')).length
    + pzT.filter((x) => works.has(x.tid) && x.status === 'unsuccessful' && !(r.tenders || []).some((y) => y.pz === x.tid)).length;
  if (failed >= 2) add('rx', 'medium', rt('h_failed', { n: failed }));
  if (/Suspended/i.test(tt.funding || '')) add('r3', 'high', rt('h_funding', { s: tt.funding }));
  else if (/Insufficient/i.test(tt.funding || '')) add('r3', 'medium', rt('h_funding', { s: tt.funding }));
  const pct = pctOf(tt.pct);
  if (tt.completion && tt.completion < today() && pct != null && pct < 100) add('rx', 'high', rt('h_overdue', { date: fdate(tt.completion), pct }));
  const paidPct = paidShare(r);
  if (paidPct != null && pct != null && paidPct > pct + 15) add('r4', 'medium', rt('h_paidGap', { paid: paidPct, pct }));
  const stale = daysSince(tt.upd);
  if (stale != null && stale > 30) add('rx', 'low', rt('h_stale', { days: stale }));
  // The same contractor on other sub-projects: where works stopped or contracts ended early.
  const sup = main && ((main.c.suppliers || [])[0] || {}).code;
  if (sup) {
    const others = [...REG.rows.values()].filter((x) => x.code !== r.code && (((mainContract(x) || {}).c || {}).suppliers || []).some((s) => s.code === sup));
    if (others.length) {
      add('r5', 'low', rt('h_contractorElse', { list: others.map((x) => x.code).join(', ') }));
      const bad = others.filter((x) => TROUBLE.test((x.t || {}).comment || '') || ((mainContract(x) || {}).c || {}).status === 'terminated');
      if (bad.length) add('r5', bad.length >= 2 ? 'high' : 'medium', rt('h_contractorTrouble', { list: bad.map((x) => x.code).join(', ') }));
    }
  }
  return out;
}
// The other procurements (supervision, the engineer, design, the rest): what would have been a hint,
// shown for information and not rated. Each line says what was bought.
function infoHints(r) {
  const out = [];
  const works = worksTids(r);
  const add = (role, level, text) => out.push({ role, level, text });
  for (const t0 of ((r.pz || {}).tenders || []).filter((x) => !works.has(x.tid))) {
    const role = procRole(r, t0), who = t0.tid;
    if (t0.sasu && t0.sasu.violation) add(role, 'medium', who + ': ' + rt('h_sasuViol', { ids: (t0.sasu.ids || []).join(', ') }));
    else if (t0.sasu && t0.sasu.active) add(role, 'low', who + ': ' + rt('h_sasuActive'));
    const cp = t0.complaints || {};
    if (cp.n) add(role, cp.open || cp.satisfied ? 'medium' : 'low', who + ': ' + rt('h_amcu', { n: cp.n, open: cp.open || 0, sat: cp.satisfied || 0 }));
    if (t0.disqualified) add(role, 'low', who + ': ' + rt('h_disq', { n: t0.disqualified }));
  }
  for (const x of spTracked(r).filter((y) => !works.has(y.tid))) {
    const mx = x.matrix;
    if (!mx) continue;
    const role = procRole(r, ((r.pz || {}).tenders || []).find((t0) => t0.tid === x.tid) || { tid: x.tid, title: x.title || '' });
    const who = x.number ? '№ ' + x.number : x.tid;
    for (const [k, v] of Object.entries(mx.scores || {})) {
      if (v < 2) continue;
      const why = ((mx.why || {})[k] || []).map((w) => (typeof udWhy === 'function' ? udWhy(w) : w)).join(', ') || rt('lvl' + v);
      add(role, v === 3 ? 'high' : 'medium', rt('fromContract', { who, why }) + ' · ' + rt(k));
    }
  }
  const f = mrdFacts(r);
  if (f) {
    const long = f.waiting.filter((x) => NOT_WORKS_PAY.includes(x.kind) && x.kind !== 'refund' && x.days > 15);
    for (const kind of ['ts', 'csc']) {
      const l = long.filter((x) => x.kind === kind);
      if (l.length) add(kind, 'medium', rt('h_mrdWaiting', { n: l.length, days: Math.max(...l.map((x) => x.days)) }));
    }
  }
  return out;
}
const RISK_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'rx'];
const SCORE_KEYS = RISK_KEYS.slice(0, 8);
// Weights of the risk matrix (row 14 of the SPs sheet).
const WEIGHT = { r1: 1, r2: 1.5, r3: 1.5, r4: 1.5, r5: 1, r6: 1, r7: 1.5, r8: 1 };

// A rating 1–3 suggested from the hints, only where the app has something to judge by: the
// sub-project's own data and the ratings of its contracts on control.
function suggestedScores(r) {
  const risk = allRisk(r), tt = r.t || {};
  const read = !!(r.pz && r.pz.at);
  const known = { r1: !!mainContract(r), r3: !!subvMatch(r) || !!tt.funding, r4: paidShare(r) != null, r5: !!mainContract(r), r7: read, r8: read };
  // A criterion the monitor rated on a contract on control is known even when all is well there.
  const works = worksTids(r);
  for (const x of spTracked(r).filter((y) => works.has(y.tid))) for (const k of Object.keys((x.matrix || {}).scores || {})) known[k] = true;
  const out = {};
  for (const k of SCORE_KEYS) {
    const items = risk[k] || [];
    out[k] = items.some((x) => x.level === 'high') ? 3 : items.some((x) => x.level === 'medium') ? 2 : known[k] ? 1 : null;
  }
  return out;
}
// The rating in use for each criterion: set in the app, else the table's, else the suggestion.
function scoresOf(r) {
  const tt = r.t || {}, own = r.scores || {}, sug = suggestedScores(r), out = {}, from = {};
  for (const k of SCORE_KEYS) {
    if (own[k] != null) { out[k] = own[k]; from[k] = 'own'; } else if (tt[k] != null) { out[k] = Number(tt[k]); from[k] = 'table'; } else if (sug[k] != null) { out[k] = sug[k]; from[k] = 'hint'; } else out[k] = null;
  }
  return { scores: out, from };
}
// Overall Rating exactly as the workbook's column M computes it (blank ratings count as 0).
function overallRating(sc) {
  if (SCORE_KEYS.every((k) => sc[k] == null)) return null;
  const v = (k) => Number(sc[k]) || 0;
  const crit = ['r2', 'r3', 'r4', 'r7'].map(v);
  const c3 = crit.filter((x) => x === 3).length, c2 = crit.filter((x) => x === 2).length;
  if (c3 >= 1 || c2 >= 3) return 3;
  const avg = SCORE_KEYS.reduce((s, k) => s + v(k) * WEIGHT[k], 0) / 10;
  if (avg >= 1.8) return 3;
  if (c2 >= 1 || SCORE_KEYS.some((k) => v(k) === 3) || avg >= 1.4) return 2;
  return 1;
}

// ---- subvention by the CMU orders (data/subvention.json, from the sync) ------------------------

let SUBV = null;
async function loadSubvention() {
  if (SUBV) return SUBV;
  try { SUBV = await getJSON('data/subvention.json', ver()); } catch (e) { SUBV = { decrees: [], projects: [] }; }
  SUBV.projects = SUBV.projects || [];
  return SUBV;
}
const REGION_OF = { OD: 'Одеська', MY: 'Миколаївська', KS: 'Херсонська', KV: 'Київська', LV: 'Львівська', VN: 'Вінницька', VO: 'Волинська',
  DP: 'Дніпропетровська', ZH: 'Житомирська', ZP: 'Запорізька', PL: 'Полтавська', KH: 'Харківська', CH: 'Чернігівська', CV: 'Чернівецька',
  KM: 'Хмельницька', RV: 'Рівненська', SM: 'Сумська', TR: 'Тернопільська', IF: 'Івано-Франківська', KR: 'Кіровоградська', ZK: 'Закарпатська', CK: 'Черкаська' };
// Ukrainian to Latin (the 2010 official table), then both sides folded so that "Vesnyane" and
// "Vesniane", "Mykhailivka" and "Mihailivka" meet.
const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia' };
const fold = (s) => s.replace(/[’'`ʼ]/g, '').replace(/ss/g, 's').replace(/y/g, 'i').replace(/i([aeu])/g, '$1').replace(/kh/g, 'h').replace(/ts/g, 'c').replace(/[^a-z0-9 ]+/g, ' ');
const latin = (s) => fold(String(s || '').toLowerCase().replace(/[а-яіїєґ]/g, (c) => TR[c] != null ? TR[c] : c));
const EN_COMMON = new Set('reconstruction overhaul construction building buildings street village oblast region district council facility protective civil defense defence radiation shelter water supply network system school lyceum kindergarten address house boiler sewage pumping station repair repairs major capital communal enterprise institution establishment center centre hospital office territory community settlement purpose'.split(' '));
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return d[b.length];
}
// Place names: "Kuyalnyk" in English, "Куяльницької" in the order; the same stem is enough when
// they share a long enough beginning.
function sameStem(w, x) {
  if (isNum(w) || isNum(x)) return w === x;
  const n = Math.min(w.length, x.length);
  if (n < 4) return false;
  let i = 0;
  while (i < n && w[i] === x[i]) i++;
  return i >= Math.max(4, Math.round(n * 0.75)) || (n >= 5 && lev(w, x) <= Math.floor(n / 5));
}
// The sub-project's line in the CMU order: by its Ukrainian name, or by the proper names and
// numbers of its English one. The region (from the code) breaks ties.
function subvMatch(r) {
  if (!SUBV || !SUBV.projects.length) return null;
  if (r._subv !== undefined) return r._subv;
  const tt = r.t || {};
  const region = REGION_OF[(r.code || '').slice(0, 2)];
  // Only the sub-project's own programme, where the file has it.
  const progs = new Set(SUBV.projects.map((p) => p.programme));
  const pool = SUBV.projects.filter((p) => !tt.programme || !progs.has(tt.programme) || p.programme === tt.programme);
  let best = null;
  // English names: the proper names and numbers, the beneficiary's place name too.
  const enTokens = tt.name_en ? fold((tt.name_en + ' ' + String(tt.beneficiary || '').replace(/\b(?:village|city|settlement|town)\s+council\b/ig, '')).toLowerCase()).split(/\s+/).filter((w) => (w.length >= 5 && !EN_COMMON.has(w) && !BEN_COMMON.has(w)) || /^\d+$/.test(w)) : [];
  for (const p of pool.filter((x) => x.name)) {
    let score = 0;
    if (tt.name_uk) score = nameMatch(tt.name_uk, p.name).score;
    else if (enTokens.length) {
      const pt = latin(p.name).split(/\s+/).filter(Boolean);
      const hit = [...new Set(enTokens)].filter((w) => pt.some((x) => sameStem(w, x)));
      score = hit.length / new Set(enTokens).size;
      // Several proper names or a well / house number in common are enough on their own.
      const nums = hit.filter((w) => /^\d{3,}$/.test(w)).length;
      if (hit.length >= 3 || (nums && hit.length >= 2)) score = Math.max(score, 0.6);
    }
    if (region && (p.region || '').startsWith(region)) score += 0.1;
    if (!best || score > best.score) best = { score, p };
  }
  r._subv = best && best.score >= (tt.name_uk ? 0.8 : 0.6) ? best.p : null;
  // Programmes spread by budget only: the beneficiary's budget line, shared by its projects.
  if (!r._subv) r._subv = budgetMatch(r, pool.filter((x) => !x.name), region);
  return r._subv;
}

const BUDGET_COMMON = new Set('бюджет територіальної громади міської селищної сільської міста обласний області району районний'.split(' '));
const BEN_COMMON = new Set('village city settlement council councils territorial community department capital construction road management state military regional administration oblast district executive committee of the and for housing communal services education culture youth sport healthcare'.split(' '));
const stem = (w) => w.slice(0, Math.max(5, Math.min(7, w.length - 2)));
function budgetMatch(r, lines, region) {
  if (!lines.length) return null;
  const tt = r.t || {};
  const buyer = (((r.pz || {}).tenders || [])[0] || {}).buyer_name || '';
  const text = buyer ? latin(buyer) : fold(String(tt.beneficiary || '').toLowerCase());
  const skip = ['silsk', 'selishch', 'misk', 'rada', 'oblasn', 'derzhavn', 'administrac', 'viddil', 'upravlin', 'departament', 'vikonavch', 'komitet'];
  const words = text.split(/\s+/).filter((w) => w.length >= 5 && !BEN_COMMON.has(w) && !skip.some((c) => w.startsWith(c)));
  // A regional administration (or its department) is the oblast budget.
  const oblast = /oblast state|regional state|\boblast\b.*administration|oblasn\w* (?:derzhavn|viisk)|\boda\b/i.test(text + ' ' + (tt.beneficiary || ''));
  const regionStem = region ? region.slice(0, -2) : '';
  if (oblast && regionStem) {
    const ob = lines.find((p) => /^Обласний бюджет/.test(p.budget) && p.budget.includes(regionStem));
    if (ob) return Object.assign({ level: 'budget' }, ob);
  }
  const inRegion = lines.filter((p) => !region || (p.region || '').startsWith(region) || p.budget.includes(regionStem));
  for (const p of inRegion) {
    if (/^Обласний бюджет/.test(p.budget)) continue;
    const bw = latin(p.budget).split(/\s+/).filter((w) => w.length >= 5 && !BUDGET_COMMON.has(w) && !skip.some((c) => w.startsWith(c)) && !/^(budzhet|terit|hromad|oblast)/.test(w));
    if (words.length && bw.some((x) => words.some((w) => sameStem(w, x)))) return Object.assign({ level: 'budget' }, p);
  }
  return null;
}
const spNameUk = (r) => (r.t || {}).name_uk || ((subvMatch(r) || {}).name || '');
const fmtK = (x) => ni.format(x) + ' ' + rt('thousand');
const edDate = (d) => fdate(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8));

// Funding gap hints from the order's editions: cut, cut to a token, dropped.
function subvRisk(r) {
  const p = subvMatch(r);
  if (!p || !SUBV) return [];
  const dec = (SUBV.decrees || []).find((d) => d.nreg === p.nreg) || { editions: Object.keys(p.amounts).sort() };
  const eds = dec.editions || [];
  const last = eds[eds.length - 1];
  const vals = eds.map((e) => p.amounts[e]).filter((v) => v != null);
  const max = Math.max(...vals);
  const now = p.amounts[last];
  if (now == null) return [{ level: 'high', text: rt('h_subvDropped', { date: edDate(last) }) }];
  if (now <= 1 && max > 1) return [{ level: 'high', text: rt('h_subvToken', { from: fmtK(max), date: edDate(last) }) }];
  if (now <= 1) return [{ level: 'medium', text: rt('h_subvTokenOnly', { date: edDate(last) }) }];
  if (now < max - 0.5) return [{ level: 'medium', text: rt('h_subvCut', { from: fmtK(max), to: fmtK(now), date: edDate(last) }) }];
  return [];
}
function allRisk(r) {
  // Worked out now from what the sub-project holds, so a change of the rules shows at once (the
  // copy saved with the last refresh is only for sub-projects never read from Prozorro).
  const base = r.pz ? riskHints(r) : (r.risk || {});
  const extra = subvRisk(r), fromContracts = contractHints(r, extra.length > 0), fromMrd = mrdHints(r);
  const out = {};
  for (const src of [base, { r3: extra }, fromContracts, fromMrd]) for (const [k, list] of Object.entries(src)) out[k] = (out[k] || []).concat(list || []);
  // One fact once: the same words from two sources (a procurement and its contract) say it once.
  for (const k of Object.keys(out)) {
    const seen = new Set();
    out[k] = out[k].filter((x) => { const key = String(x.text).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!out[k].length) delete out[k];
  }
  return out;
}
// One matrix, the sub-project's: what the monitor rated on its contracts on control (prices,
// collusion, payments, the contractor's standing, the programme rules) comes in as hints to it.
function contractHints(r, spSubvention) {
  // The same reason on several contracts (a procurement and the contract it became, the works and
  // the supervision) is one line naming them all; the subvention, once said for the sub-project, is
  // not repeated per contract.
  const SUBV_WHY = /^(subvention_|funding_gap)/;
  const groups = new Map();
  const works = worksTids(r);
  for (const x of spTracked(r).filter((y) => works.has(y.tid))) {
    const mx = x.matrix;
    if (!mx) continue;
    const who = x.number ? '№ ' + x.number : x.tid;
    for (const [k, v] of Object.entries(mx.scores || {})) {
      if (v < 2) continue;
      const whys = ((mx.why || {})[k] || []).filter((w) => !(k === 'r3' && spSubvention && SUBV_WHY.test(String(w))));
      if (k === 'r3' && spSubvention && !whys.length && ((mx.why || {})[k] || []).length) continue;
      const why = whys.map((w) => (typeof udWhy === 'function' ? udWhy(w) : w)).join(', ') || rt('lvl' + v);
      const key = k + '|' + v + '|' + why;
      const g = groups.get(key) || { k, v, why, who: [], contract: x.key };
      if (!g.who.includes(who)) g.who.push(who);
      groups.set(key, g);
    }
  }
  const out = {};
  for (const g of groups.values()) {
    (out[g.k] = out[g.k] || []).push({ level: g.v === 3 ? 'high' : 'medium', contract: g.contract,
      text: rt(g.who.length > 1 ? 'fromContracts' : 'fromContract', { who: g.who.join(', '), why: g.why }) });
  }
  return out;
}

function subventionCard(r) {
  const p = subvMatch(r);
  if (!p) return null;
  const dec = (SUBV.decrees || []).find((d) => d.nreg === p.nreg) || {};
  const eds = dec.editions || Object.keys(p.amounts).sort();
  const tt = r.t || {};
  const last = p.amounts[eds[eds.length - 1]];
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, p.level === 'budget' ? rt('subvBudgetTitle', { prog: p.programme || '' }) : rt('subvTitle')), ext(dec.url || '#', rt(/-п$/.test(p.nreg || '') ? 'subvResolution' : 'subvOrder', { n: (p.nreg || '').replace(/-(\d{4})-[рп]$/, ' ($1)') }))),
    h('p', { class: 'muted small' }, join([p.budget, p.region])), p.name ? h('p', { class: 'small' }, p.name) : h('p', { class: 'small muted' }, rt('subvBudgetNote')),
    h('div', { class: 'scroll' }, h('table', null,
      h('thead', null, h('tr', null, eds.map((e, i) => h('th', { class: 'r' }, i ? rt('subvEdition', { date: edDate(e) }) : rt('subvOriginal', { date: edDate(e) }))))),
      h('tbody', null, h('tr', null, eds.map((e, i) => {
        const v = p.amounts[e], prev = i ? p.amounts[eds[i - 1]] : null;
        const cls = v == null ? 'faint' : prev != null && v < prev - 0.5 ? 'bad' : prev != null && v > prev + 0.5 ? 'ok' : '';
        return h('td', { class: 'r num ' + cls }, v == null ? '—' : fmtK(v));
      }))))),
    // Only a project's own line compares with the table; a community's sum covers all its projects.
    p.name && last != null && !(+tt.subv_year > 0)
      ? h('p', { class: 'muted small', style: 'margin-top:10px' }, rt('subvTableEmpty', { order: money(last * 1000) }))
      : p.name && last != null && Math.abs(+tt.subv_year - last * 1000) > 1000
        ? h('p', { class: 'notice small', style: 'margin-top:10px' }, rt('subvTableDiff', { table: money(+tt.subv_year), order: money(last * 1000) })) : null,
    p.name ? adequacyOfSp(r, last) : null);
}
// The sub-project's funding for the year: the subvention in force against what its tracked contracts
// will still need from the loan by 31 December, beside what the table says.
const ADEQ_RX = { adequate: /^adequ/i, insufficient: /^insuff/i, suspended: /^susp/i, excess: /^excess/i };
function adequacyData(r, last) {
  const tids = new Set(spTids(r));
  const rows = (state.trackedIndex.items || []).filter((x) => tids.has(x.tid) && x.funding);
  if (!rows.length || last == null) return null;
  const year = last * 1000;
  const need = rows.reduce((x, f) => x + (f.funding.need || 0), 0);
  const left = year - rows.reduce((x, f) => x + (f.funding.eib_paid_year || 0), 0);
  const status = rows.some((f) => f.funding.status === 'suspended') ? 'suspended' : need > left + 1 ? 'insufficient'
    : rows.every((f) => f.funding.status === 'excess') ? 'excess' : 'adequate';
  return { rows, need, left, status };
}
function adequacyOfSp(r, last) {
  const tt = r.t || {};
  const ad = adequacyData(r, last);
  if (!ad) return tt.funding ? h('p', { class: 'small muted', style: 'margin-top:10px' }, rt('adeqNoTracked', { s: tt.funding })) : null;
  const { rows, need, left, status } = ad;
  const table = Object.keys(ADEQ_RX).find((k) => ADEQ_RX[k].test(String(tt.funding || '').trim()));
  const cls = { insufficient: 'high', suspended: 'high', excess: 'low', adequate: 'ok' }[status];
  return h('div', { style: 'margin-top:12px' },
    h('div', { class: 'row' }, h('b', null, rt('adeqTitle')), h('span', { class: 'sev ' + cls }, t('fa.st.' + status)),
      tt.funding ? h('span', { class: 'tag' }, rt('adeqTable', { s: tt.funding })) : null),
    kv([[t('fa.left'), money(left)], [t('fa.need'), money(need)], [t('fa.gap'), need > left ? h('b', { class: 'bad' }, money(need - left)) : null],
      [rt('adeqTableNeed'), tt.extra_need != null && tt.extra_need !== '' ? money(+tt.extra_need || 0) : null]]),
    table && table !== status ? h('p', { class: 'notice small' }, rt('adeqDiff', { table: t('fa.st.' + table), ours: t('fa.st.' + status) })) : null,
    h('p', { class: 'muted small' }, rt('adeqHint', { n: rows.length })));
}
