// The Mindev register of EIB payments.
// ---- the Mindev payments register ---------------------------------------------------------------
//
// Mindev's register of payments from the EIB loan (Ukreximbank project accounts, which the Treasury
// does not show): per sub-project its contracts (works, supervision, consulting engineer: number,
// dates, term, contractor, bank guarantee, when the tender results went to the EIB) and every payment
// request with its way through Mindev and the Ministry of Finance or the bank. Uploaded in the browser
// by a team member, kept in registry/{code}.mrd (it carries bank accounts and personal tax numbers:
// private, like the table). Sheets differ by programme; columns are found by their headers.
const MRD_COLS = [
  ['code', /Шифр|ID Субпро|^шифр/i], ['purpose', /Призначення платежу/i],
  ['eib', /Спеціальний фонд|спец\.?\s*фонд|Субвенція \(без ПДВ\)/i], ['vat', /загального фонду/i], ['local', /Місцевий бюдж|місцевого бюджету|Власні кошти/i],
  ['number', /Номер договору/i], ['date', /Дата заключення/i], ['term', /Строк дії/i], ['org', /Організація/i], ['guarantee', /Банківська гарантія/i],
  ['pcr', /результатів торгів/i], ['received', /Дата отримання від КБ/i], ['sent', /Дата нав?ленн|Дата направленн/i],
  ['comment', /Коментарі|Примітка Мінрегіону/i], ['approved', /Підписання, повернення/i], ['paid', /Дата здійснення оплати/i], ['note', /^Примітка\s*$/i],
];
const mrdNum = (v) => (typeof v === 'number' ? v : v == null ? null : (/^-?\d[\d\s]*([.,]\d+)?/.exec(String(v).trim()) || [])[0] ? Number(/^-?\d[\d\s]*([.,]\d+)?/.exec(String(v).trim())[0].replace(/\s/g, '').replace(',', '.')) : null);
function mrdDate(v) {
  const ok = (y) => y >= 2015 && y <= 2031;
  if (v instanceof Date && !isNaN(v)) { const d = cellValue(v); return ok(+d.slice(0, 4)) ? d : null; }
  const all = [...String(v || '').matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)].map((m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`).filter((d) => ok(+d.slice(0, 4)));
  return all.sort().pop() || null;
}
const mrdRole = (p) => (/технічн/.test(p) ? 'ts' : /інженер|консульт/.test(p) ? 'csc' : /підряд|робіт/.test(p) ? 'works' : 'other');
const mrdKind = (p) => (/закриття авансу/.test(p) ? 'advance_close' : /аванс|попередн/.test(p) ? 'advance' : /повернення/.test(p) ? 'refund' : /технічн/.test(p) ? 'ts' : /інженер|консульт/.test(p) ? 'csc' : /робот|робіт/.test(p) ? 'works' : 'other');
function parseMrd(XLSX, wb) {
  const out = new Map();
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    // Some sheets claim 16 384 columns: only the first 60 hold anything.
    const range = XLSX.utils.decode_range(ws['!ref']);
    range.e.c = Math.min(range.e.c, 60);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range });
    if (rows.length < 4) continue;
    const width = Math.max(...rows.slice(0, 3).map((r) => (r || []).length));
    const heads = Array.from({ length: width }, (_, i) => [0, 1, 2].map((k) => String((rows[k] || [])[i] || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / '));
    const col = {};
    for (const [key, rx] of MRD_COLS) { const i = heads.findIndex((x) => rx.test(x)); if (i >= 0) col[key] = i; }
    if (col.code == null || col.purpose == null || col.eib == null) continue;
    for (const r of rows.slice(2)) {
      if (!r) continue;
      const code = codesOf(String(r[col.code] || '').replace(/\s+/g, ''))[0];
      if (!code) continue;
      const p = String(r[col.purpose] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!p || /^загальна вартість/.test(p)) continue;
      const at = (k) => (col[k] != null ? r[col[k]] : null);
      const sp = out.get(code) || { sheet: name, contracts: [], payments: [] };
      out.set(code, sp);
      const eib = mrdNum(at('eib')), local = (mrdNum(at('local')) || 0) + (mrdNum(at('vat')) || 0);
      if (/^вартість проекту/.test(p)) {
        const g = at('guarantee');
        const gp = typeof g === 'number' ? (g < 1 ? Math.round(g * 1000) / 10 : null) : (/(\d+(?:[.,]\d+)?)\s*%/.exec(String(g || '')) || [])[1];
        const pcr = at('pcr');
        sp.contracts.push({ role: mrdRole(p), number: String(at('number') || '').slice(0, 80), date: mrdDate(at('date')), term: mrdDate(at('term')),
          org: String(at('org') || '').replace(/\s+/g, ' ').slice(0, 200), guarantee: gp != null ? Number(String(gp).replace(',', '.')) : null,
          // null: the sheet has no such column (older pools); "": the column is there and empty.
          pcr: col.pcr == null ? null : pcr instanceof Date ? cellValue(pcr) : String(pcr || '').replace(/\s+/g, ' ').slice(0, 60), eib: eib || 0, local: local || 0 });
      } else if (eib || local) {
        sp.payments.push({ kind: mrdKind(p), eib: eib || 0, local: local || 0, received: mrdDate(at('received')), sent: mrdDate(at('sent')), approved: mrdDate(at('approved')), paid: mrdDate(at('paid')),
          comment: String(at('comment') || '').replace(/\s+/g, ' ').slice(0, 300), note: String(at('note') || '').replace(/\s+/g, ' ').slice(0, 200) });
      }
    }
  }
  // Repeated contract rows (the main contract and its addendum blocks) once each.
  for (const sp of out.values()) {
    const seen = new Set();
    sp.contracts = sp.contracts.filter((c) => { const k = [c.role, c.number, Math.round(c.eib)].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    sp.payments = sp.payments.sort((a, b) => String(a.paid || a.received || '').localeCompare(String(b.paid || b.received || ''))).slice(-200);
  }
  return out;
}
// The register's code to the sub-project's: as it is, its "-A" line ("KV04_02-A", "KV04_02A"), the
// table's "-A" row when the register has the plain code, or any code the table row lists.
function mrdRegCode(c) {
  const tries = [c, c.replace(/-A$/, ''), c.replace(/(_\d+)A$/, '$1'), c + '-A'];
  for (const k of tries) if (REG.rows.has(k)) return k;
  const r = [...REG.rows.values()].find((x) => ((x.t || {}).codes || []).includes(c));
  return r ? r.code : null;
}
// The last time anyone uploaded the register (kept on every sub-project it wrote).
function mrdLastUpload() {
  let last = null;
  for (const r of REG.rows.values()) if (r.mrd && r.mrd.at && (!last || r.mrd.at > last.at)) last = r.mrd;
  return last;
}
async function importMrd(file) {
  if (REG.busy) return;
  REG.busy = 'mrd';
  try {
    setStatus(rt('importing'));
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const found = parseMrd(XLSX, wb);
    const at = new Date().toISOString(), fileName = file.name.slice(0, 200);
    // Several file codes of one sub-project ("-A" lines) go together.
    const bySp = new Map();
    let missing = 0;
    for (const [code, sp] of found) {
      const rc = mrdRegCode(code);
      if (!rc) { missing++; continue; }
      const cur = bySp.get(rc) || { sheet: sp.sheet, contracts: [], payments: [] };
      cur.contracts.push(...sp.contracts.map((c) => Object.assign({ code }, c)));
      cur.payments.push(...sp.payments.map((x) => Object.assign({ code }, x)));
      bySp.set(rc, cur);
    }
    // One base that grows: what the new file has is added or brought up to date; what an earlier
    // file had and this one does not stays (a later register may leave out old rows).
    let n = 0, failed = 0, added = 0, changed = 0;
    for (const [rc, fresh] of bySp) {
      n++;
      if (n % 10 === 1) setStatus(rt('mrdSaving', { n, total: bySp.size }));
      const merged = mergeMrd((REG.rows.get(rc) || {}).mrd, fresh, { at, file: fileName, by: myExpert() });
      added += merged.added; changed += merged.changed;
      if (!merged.added && !merged.changed && (REG.rows.get(rc) || {}).mrd) continue;
      try { await cloud.updateRegistry(rc, { mrd: merged.mrd }); } catch (e) { failed++; console.error('mrd', rc, e); if (e && e.code === 'permission-denied') throw e; }
    }
    const msg = rt('mrdDone', { n: bySp.size - failed, found: found.size, missing }) + ' · ' + rt('mrdDelta', { added, changed });
    setStatus(msg, failed > 0);
    toast(msg, { long: true });
  } catch (e) {
    console.error('mrd import', e);
    const msg = (e && e.code === 'permission-denied') ? rt('denied') : (e && e.message) || String(e);
    setStatus(msg, true);
    toast(msg, { bad: true, sticky: true });
  } finally {
    REG.busy = null;
  }
}
// A payment is the same one in two registers when its sub-project code, purpose, amounts and the
// day its documents came in agree; a contract, by its code, role and number.
const mrdPayKey = (x) => [x.code, x.kind, Math.round((x.eib || 0) * 100), Math.round((x.local || 0) * 100), x.received || '', String(x.note || '').slice(0, 40)].join('|');
const mrdConKey = (c) => [c.code, c.role, c.number || Math.round(c.eib || 0)].join('|');
function mergeMrd(old, fresh, upload) {
  let added = 0, changed = 0;
  const merge = (list, add, key) => {
    const out = new Map((list || []).map((x) => [key(x), x]));
    for (const x of add) {
      const k = key(x), was = out.get(k);
      if (!was) { out.set(k, x); added++; continue; }
      const next = Object.assign({}, was);
      for (const [f, v] of Object.entries(x)) if (v !== null && v !== '' && v !== undefined && v !== was[f]) next[f] = v;
      if (JSON.stringify(next) !== JSON.stringify(was)) changed++;
      out.set(k, next);
    }
    return [...out.values()];
  };
  const contracts = merge((old || {}).contracts, fresh.contracts, mrdConKey);
  const payments = merge((old || {}).payments, fresh.payments, mrdPayKey)
    .sort((a, b) => String(a.paid || a.received || '').localeCompare(String(b.paid || b.received || ''))).slice(-300);
  const uploads = (((old || {}).uploads) || []).concat([{ at: upload.at, file: upload.file, by: upload.by }]).slice(-12);
  return { added, changed, mrd: { at: upload.at, file: upload.file, by: upload.by, first: (old || {}).first || (old || {}).at || upload.at, sheet: fresh.sheet, contracts, payments, uploads } };
}

// What the register says is worth a look: payments waiting, slow ones, works paid after the
// contract's term, works contracts whose tender results the EIB never got.
function mrdFacts(r) {
  const m = r.mrd;
  if (!m) return null;
  const pays = m.payments || [], works = (m.contracts || []).filter((c) => c.role === 'works');
  const asOf = String(m.at || today()).slice(0, 10);
  const lag = (x) => (x.received && x.paid ? dayDiff(x.received, x.paid) : null);
  const waiting = pays.filter((x) => x.received && !x.paid && dayDiff(x.received, asOf) <= 180).map((x) => Object.assign({ days: dayDiff(x.received, asOf) }, x));
  const year = pays.filter((x) => x.paid && x.paid >= addDays(asOf, -365) && lag(x) != null && lag(x) >= 0);
  const slow = year.filter((x) => lag(x) > 30);
  const term = works.map((c) => c.term).filter(Boolean).sort().pop() || null;
  const afterTerm = term ? pays.filter((x) => x.kind === 'works' && x.paid && x.paid > term) : [];
  const noPcr = works.length && pays.some((x) => x.paid) && works.every((c) => c.pcr === '');
  const sum = (k, f) => pays.filter(f || (() => true)).reduce((a, x) => a + (x[k] || 0), 0);
  const value = works.reduce((a, c) => a + (c.eib || 0) + (c.local || 0), 0);
  const paidWorks = sum('eib', (x) => x.paid && ['works', 'advance'].includes(x.kind)) + sum('local', (x) => x.paid && ['works', 'advance'].includes(x.kind));
  return { asOf, file: m.file, waiting, slow, year, term, afterTerm, noPcr, value, paidEib: sum('eib', (x) => x.paid), paidLocal: sum('local', (x) => x.paid),
    paidPct: value ? Math.round((paidWorks / value) * 100) : null, last: pays.filter((x) => x.paid).map((x) => x.paid).sort().pop() || null, lag };
}
function mrdHints(r) {
  const f = mrdFacts(r), out = {};
  if (!f) return out;
  const add = (k, level, text) => (out[k] = out[k] || []).push({ level, text });
  // The works' payments only: supervision and the engineer are in infoHints.
  const forWorks = (x) => !NOT_WORKS_PAY.includes(x.kind);
  const long = f.waiting.filter((x) => forWorks(x) && x.days > 15);
  if (long.length) add('r4', long.some((x) => x.days > 30) ? 'high' : 'medium', rt('h_mrdWaiting', { n: long.length, days: Math.max(...long.map((x) => x.days)) }));
  const slow = f.slow.filter(forWorks);
  if (slow.length) add('r4', 'medium', rt('h_mrdSlow', { n: slow.length, of: f.year.filter(forWorks).length }));
  if (f.afterTerm.length) add('rx', 'medium', rt('h_mrdAfterTerm', { n: f.afterTerm.length, date: fdate(f.term) }));
  if (f.noPcr) add('rx', 'medium', rt('h_mrdNoPcr'));
  return out;
}
function mrdCard(r) {
  const f = mrdFacts(r), m = r.mrd;
  const file = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => file.files[0] && importMrd(file.files[0]) });
  const upload = h('button', { class: 'btn btn-sm', onclick: () => file.click() }, icon('cloud'), rt('mrdUpload'));
  if (!f) return h('div', { class: 'card pad section' }, h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('mrdTitle')), h('div', { class: 'row' }, upload, file)), h('p', { class: 'muted small' }, (() => {
    // Uploaded, but this sub-project has no rows there: say so, not "not uploaded".
    const last = mrdLastUpload();
    return last ? rt('mrdNoRows', { code: r.code, date: fdate(String(last.at).slice(0, 10)), file: last.file || '' }) : rt('mrdNone');
  })()));
  const kindL = (k) => rt('mrdK_' + k);
  const pays = (m.payments || []).slice().reverse();
  return h('div', { class: 'card pad section' },
    // Loading a new register is in the list's "Data" menu; here only when there is none yet.
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, rt('mrdTitle')), h('span', { class: 'muted small' }, join([rt('mrdAsOf', { date: fdate(f.asOf), file: f.file || '' }), m.by ? rt('mrdBy', { who: m.by }) : null]))),
    kv([
      [rt('mrdPaid'), join([rt('mrdEib', { sum: money(f.paidEib) }), rt('mrdLocal', { sum: money(f.paidLocal) }), f.paidPct != null ? rt('mrdPct', { pct: f.paidPct }) : null])],
      [rt('mrdLast'), f.last ? fdate(f.last) : null],
      [rt('mrdWaitingL'), f.waiting.length ? h('span', { class: f.waiting.some((x) => x.days > 15) ? 'bad' : '' }, rt('mrdWaitingV', { n: f.waiting.length, days: Math.max(...f.waiting.map((x) => x.days)) })) : rt('mrdNoWaiting')],
      [rt('mrdSpeed'), f.year.length ? rt('mrdSpeedV', { med: median(f.year.map(f.lag)), n: f.year.length, slow: f.slow.length }) : null],
      [rt('mrdTerm'), f.term ? h('span', { class: f.afterTerm.length ? 'bad' : '' }, join([fdate(f.term), f.afterTerm.length ? rt('mrdAfterTerm', { n: f.afterTerm.length }) : null])) : null],
    ]),
    h('h3', { class: 'card-sub', style: 'margin-top:14px' }, rt('mrdPayments', { n: pays.length })),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, [rt('mrdReceived'), rt('mrdPaidOn'), rt('mrdDays'), rt('mrdWhat'), rt('mrdEibCol'), rt('mrdLocalCol'), rt('mrdNote')].map((x) => h('th', null, x)))),
      h('tbody', null, pays.slice(0, 60).map((x) => {
        const d = f.lag(x), wait = !x.paid && x.received ? dayDiff(x.received, f.asOf) : null;
        return h('tr', { class: !x.paid ? 'row-warn' : '' },
          td(rt('mrdReceived'), { class: 'num' }, fdate(x.received)), td(rt('mrdPaidOn'), { class: 'num' }, x.paid ? fdate(x.paid) : h('span', { class: 'warn-text' }, rt('mrdWait', { n: wait != null ? wait : '?' }))),
          td(rt('mrdDays'), { class: 'num' + (d > 30 ? ' bad' : '') }, d != null ? String(d) : '—'), td(rt('mrdWhat'), null, kindL(x.kind)),
          td(rt('mrdEibCol'), { class: 'num' }, money(x.eib)), td(rt('mrdLocalCol'), { class: 'num' }, x.local ? money(x.local) : '—'),
          td(rt('mrdNote'), { class: 'w-text small' }, join([x.note, x.comment && x.comment !== 'опрацьовано' ? x.comment : null])));
      })))),
    h('p', { class: 'muted small' }, rt('mrdHint')));
}
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
