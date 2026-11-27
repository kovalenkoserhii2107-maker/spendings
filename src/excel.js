// The team workbook filled in (fillWorkbook) and the export dialog.
// ---- xlsx out ---------------------------------------------------------------------------------

// ---- the team's workbook, filled in ------------------------------------------------------------
//
// The export is the team's own file: the one uploaded last on this device (or one picked now),
// with the monitor's data written into its cells and nothing else touched. The archive is opened
// as it is and only the cells' XML is edited: formulas (shared and array ones too), styles, lists,
// hyperlinks, comments, the link to the other workbook — all stay byte for byte. Excel is asked to
// recalculate on opening, so the Overall Rating follows the scores.

function idb() {
  return new Promise((ok, bad) => {
    const q = indexedDB.open('monitor-files', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('files');
    q.onsuccess = () => ok(q.result);
    q.onerror = () => bad(q.error);
  });
}
async function idbPut(key, val) {
  try {
    const db = await idb();
    await new Promise((ok, bad) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(val, key); tx.oncomplete = ok; tx.onerror = () => bad(tx.error); });
  } catch (e) { console.warn('file store', e); }
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((ok, bad) => { const q = db.transaction('files').objectStore('files').get(key); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); });
  } catch (e) { return null; }
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const excelDay = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;

// One worksheet's XML with cells set in place. `set(ref, value, how)`: value is a number, a
// string, true/false or { day: 'YYYY-MM-DD' }; how is 'blank' (only into an empty cell),
// 'update' (also over a different value) or 'force' (the same, for what the monitor itself keeps).
function sheetPatch(xml, sst) {
  const rowsAt = new Map();
  const rx = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let m;
  while ((m = rx.exec(xml))) rowsAt.set(+m[1], [m.index, m.index + m[0].length]);
  // The style a new cell takes: the same column's in the nearest row that has it.
  let styles = null;
  const styleNear = (letters, row) => {
    if (!styles) {
      styles = {};
      for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)" s="(\d+)"/g)) (styles[c[1]] = styles[c[1]] || []).push([+c[2], c[3]]);
    }
    let best = null;
    for (const [r, s] of styles[letters] || []) if (!best || Math.abs(r - row) < Math.abs(best[0] - row)) best = [r, s];
    return best ? best[1] : null;
  };
  const changes = new Map();
  const stat = { set: 0, formula: 0, kept: 0, same: 0, norow: 0 };
  const read = (attrs, inner) => {
    const t = (attrs.match(/\st="([^"]+)"/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (t === 'inlineStr') return xmlUnesc((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || ['', ''])[1]);
    if (v == null) return null;
    if (t === 's') return sst[+v];
    if (t === 'b') return v === '1';
    if (t === 'str' || t === 'e') return xmlUnesc(v);
    return +v;
  };
  const cellXml = (ref, attrs, value) => {
    const keep = (attrs || '').replace(/\s(?:r|t)="[^"]*"/g, '');
    if (typeof value === 'boolean') return `<c r="${ref}"${keep} t="b"><v>${value ? 1 : 0}</v></c>`;
    if (typeof value === 'number') return `<c r="${ref}"${keep}><v>${value}</v></c>`;
    if (value && value.day) return `<c r="${ref}"${keep}><v>${excelDay(value.day)}</v></c>`;
    // A formula's cached result: a number as a number (no t="str", which would make Excel see text).
    if (value && value.f) return typeof value.v === 'number' && isFinite(value.v) ? `<c r="${ref}"${keep}><f>${xmlEsc(value.f)}</f><v>${value.v}</v></c>`
      : value.v == null || value.v === '' ? `<c r="${ref}"${keep}><f>${xmlEsc(value.f)}</f></c>`
      : `<c r="${ref}"${keep} t="str"><f>${xmlEsc(value.f)}</f><v>${xmlEsc(value.v)}</v></c>`;
    return `<c r="${ref}"${keep} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  };
  const same = (a, b) => (b && b.f ? String(a == null ? '' : a).trim() === String(b.v || '').trim() : b && b.day ? typeof a === 'number' && Math.abs(a - excelDay(b.day)) < 1 : typeof b === 'number' ? typeof a === 'number' && Math.abs(a - b) < 0.005
    : typeof b === 'boolean' ? a === b : String(a == null ? '' : a).trim() === String(b).trim());
  const lastRow = () => Math.max(0, ...rowsAt.keys());
  return {
    stat,
    lastRow,
    // A new row after the last one: its cells take the styles of the nearest rows.
    addRow(n) { if (!rowsAt.has(n)) rowsAt.set(n, null); return n; },
    set(ref, value, how) {
      if (value == null || value === '' || (typeof value === 'number' && !isFinite(value))) return;
      const row = +ref.match(/\d+/)[0];
      if (!rowsAt.has(row)) { stat.norow++; return; }
      if (!changes.has(row)) changes.set(row, new Map());
      changes.get(row).set(ref, { value, how: how || 'blank' });
    },
    out() {
      const parts = [], appended = [];
      let at = 0;
      for (const row of [...changes.keys()].sort((a, b) => a - b)) {
        const fresh = rowsAt.get(row) === null;
        const [a, b] = fresh ? [0, 0] : rowsAt.get(row);
        let x = fresh ? `<row r="${row}"></row>` : xml.slice(a, b);
        if (x.endsWith('/>')) x = x.slice(0, -2) + '></row>';
        for (const [ref, { value, how }] of changes.get(row)) {
          const cm = x.match(new RegExp(`<c r="${ref}"(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</c>)`));
          if (cm) {
            const attrs = cm[1] || '', inner = cm[2] || '';
            if (/<f[\s>/]/.test(inner)) { stat.formula++; continue; }
            const old = read(attrs, inner);
            if (same(old, value)) { stat.same++; continue; }
            const empty = old == null || old === '' || old === false;
            if (!empty && how === 'blank') { stat.kept++; continue; }
            x = x.slice(0, cm.index) + cellXml(ref, attrs, value) + x.slice(cm.index + cm[0].length);
          } else {
            // A cell the row does not have yet: in its column's place, with the column's style.
            const letters = ref.match(/^[A-Z]+/)[0], n = colNum(letters);
            const sn = styleNear(letters, row);
            const style = sn ? ` s="${sn}"` : '';
            let pos = x.lastIndexOf('</row>');
            for (const c of x.matchAll(/<c r="([A-Z]+)\d+"/g)) if (colNum(c[1]) > n) { pos = c.index; break; }
            x = x.slice(0, pos) + cellXml(ref, style, value) + x.slice(pos);
          }
          stat.set++;
        }
        if (fresh) {
          stat.added = (stat.added || 0) + 1;
          // In its place among the sheet's rows (Excel refuses rows out of order): before the first
          // existing row below it, else at the end.
          let next = null;
          for (const [n, span] of rowsAt) if (span && n > row && (next == null || n < next)) next = n;
          if (next == null) { appended.push(x); continue; }
          const a0 = rowsAt.get(next)[0];
          parts.push(xml.slice(at, a0), x);
          at = a0;
          continue;
        }
        parts.push(xml.slice(at, a), x);
        at = b;
      }
      parts.push(xml.slice(at));
      let outXml = parts.join('');
      // The sheet's stated range must take in rows written past it.
      const top = Math.max(lastRow(), ...[...changes.keys()]);
      outXml = outXml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (m0, c1, r1, c2, r2) => `<dimension ref="${c1}${r1}:${c2}${Math.max(+r2, top)}"/>`);
      return appended.length ? outXml.replace('</sheetData>', appended.join('') + '</sheetData>').replace(/<sheetData\/>/, '<sheetData>' + appended.join('') + '</sheetData>') : outXml;
    },
  };
}

// Prozorro's state of a procedure in the workbook's words (its "tender status" list).
function tableStatus(t0, c) {
  if (c && (c.status === 'active' || c.status === 'terminated')) return 'Contract Signed';
  const s = (t0 && t0.status) || '';
  if (/^active\.(enquiries|tendering)$/.test(s)) return 'Ongoing';
  if (/^active\.(pre-qualification|auction|qualification)/.test(s)) return 'Evaluation';
  if (s === 'active.awarded') return 'Awarded';
  if (s === 'complete') return 'Contract Signed';
  if (s === 'unsuccessful') return t0.bids ? 'All Rejected' : 'No Bids';
  if (s === 'cancelled') return 'Cancelled';
  return null;
}
const tableMethod = (t0) => (!t0 || !t0.method ? null : /^(reporting|negotiation)/.test(t0.method) ? 'Direct Contract' : 'Tender');
const tableSasu = (list) => {
  const xs = (list || []).filter(Boolean);
  return xs.some((x) => x.violation) ? 'Negative' : xs.some((x) => x.active) ? 'Ongoing' : xs.some((x) => x.n) ? 'Positive' : null;
};
const tableAmcu = (cs) => (cs && cs.n ? (cs.open ? 'Ongoing' : cs.satisfied ? 'Satisfied' : 'Not satisfied') : null);
const FUNDING_WORD = { adequate: 'Adequate', insufficient: 'Insufficient', suspended: 'Suspended', excess: 'Excess Funding' };

async function fillWorkbook(buf, mode, onStep) {
  const XLSX = await loadXlsx();
  const CFB = XLSX.CFB;
  const u8 = new Uint8Array(buf);
  const wb = XLSX.read(u8, { type: 'array', cellDates: true, sheets: ['SPs', 'Tenders', 'Dropdowns'] });
  const z = CFB.read(u8, { type: 'array' });
  const dec = new TextDecoder(), enc = new TextEncoder();
  const entry = (p) => CFB.find(z, '/' + p.replace(/^\//, ''));
  const text = (p) => dec.decode(entry(p).content);
  const put = (p, s) => { const e = entry(p); e.content = enc.encode(s); e.size = e.content.length; };
  const wbx = text('xl/workbook.xml'), rels = text('xl/_rels/workbook.xml.rels');
  const partOf = (name) => {
    const sh = [...wbx.matchAll(/<sheet [^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`name="${xmlEsc(name)}"`));
    const rid = sh && (sh.match(/r:id="([^"]+)"/) || [])[1];
    const rel = rid && [...rels.matchAll(/<Relationship [^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`Id="${rid}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    return target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target) : null;
  };
  const sst = entry('xl/sharedStrings.xml') ? [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlUnesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
  const how = mode === 'update' ? 'update' : 'blank';
  const ref = (r, c) => XLSX.utils.encode_cell({ r, c });
  const report = { sps: 0, tenders: 0, missing: [], weeks: 0, noWeek: 0, sheets: {} };

  // Initials of the experts as the workbook's own lists give them (Dropdowns J → L).
  const initials = {};
  if (wb.Sheets.Dropdowns) {
    const dd = XLSX.utils.sheet_to_json(wb.Sheets.Dropdowns, { header: 1, defval: null });
    dd.forEach((row) => { if (row[9] && row[11] && row[9] !== 'EXPERTS') initials[String(row[9]).trim()] = String(row[11]).trim(); });
  }
  const initialsOf = (name) => initials[String(name || '').trim()] || String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('').slice(0, 3);

  // Tracked snapshots for the procedures on control: auction and award dates, bidders, complaints.
  onStep && onStep(rt('xReading'));
  const byTid = {};
  for (const x of state.trackedIndex.items || []) if (x.tid && !byTid[x.tid]) byTid[x.tid] = x.key;
  const snaps = {};
  await Promise.all(Object.entries(byTid).map(async ([tid, key]) => { try { snaps[tid] = await loadTracked(key); } catch (e) { /* not written yet */ } }));

  // ---- SPs ----
  const spPath = partOf('SPs');
  const sps = XLSX.utils.sheet_to_json(wb.Sheets.SPs, { header: 1, raw: true, defval: null });
  const base = XLSX.utils.decode_range(wb.Sheets.SPs['!ref']).s.r;
  const hi = sps.findIndex((r) => r && String(r[2] || '').trim() === 'ID' && /SP status/.test(String(r[3] || '')));
  if (!spPath || hi < 0) throw new Error(rt('importBad'));
  const width = Math.max(sps[hi].length, (sps[hi - 1] || []).length);
  const labels = [], groups = [];
  for (let i = 0; i < width; i++) {
    const uk = String((sps[hi - 1] || [])[i] || '').replace(/\s+/g, ' ').trim();
    const en = String(sps[hi][i] || '').replace(/\s+/g, ' ').trim();
    labels.push(/^\d\. /.test(uk) ? uk : (en || uk));
    groups.push(uk);
  }
  const col = mapHeaders(labels, SP_COLS);
  const weeks = {};
  groups.forEach((g, i) => { if (/^Week \d+/.test(g) && /EXPERT/i.test(labels[i])) weeks[g] = i; });
  const ca = labels.findIndex((l, i) => l === 'CA' && /NEXT ACTIVITY/.test(groups[i] || ''));
  const sp = sheetPatch(text(spPath), sst);
  const seen = new Set();
  sps.forEach((row, i) => {
    if (i <= hi || !row) return;
    const codes = codesOf(row[col.code]);
    const r = codes.length && (REG.rows.get(codes[0]) || [...REG.rows.values()].find((x) => x.code === codes[0]));
    if (!r) return;
    seen.add(r.code);
    report.sps++;
    const R = base + i;
    const at = (key) => (col[key] != null ? ref(R, col[key]) : null);
    const setK = (key, v, h2) => { const a = at(key); if (a) sp.set(a, v, h2 || how); };
    // The expert's ratings are kept in the monitor: they go in as they are there.
    for (const k of UD_KEYS) if ((r.scores || {})[k] != null) setK(k, +r.scores[k], 'force');
    const tids = spTids(r);
    // Links as links: one procurement opens itself; several open the works one, all named.
    if (tids.length) {
      const works = ((r.pz || {}).tenders || []).find((x) => tids.includes(x.tid) && isWorksTender(x));
      const go = (works && works.tid) || tids[0];
      setK('pz_link', { f: `HYPERLINK("https://prozorro.gov.ua/tender/${go}",${tids.map((x) => '"' + x + '"').join('&CHAR(10)&')})`, v: tids.join('\n') }, 'blank');
      const n = ((r.pz || {}).tenders || []).filter((x) => tids.includes(x.tid) && isWorksTender(x)).length;
      setK('tenders_n', n || tids.length, 'blank');
    }
    const dream = spDream(r);
    if (dream) setK('dream', { f: `HYPERLINK("${dreamUrl(dream)}","${dream}")`, v: dream }, 'blank');
    const pzT = ((r.pz || {}).tenders || []).filter((x) => !x.error);
    // AMCU and State Audit columns feed risks 7 and 8: the works procurement only, as the rating.
    const pzW = pzT.filter((x) => primaryTids(r).has(x.tid));
    const m = mainContract(r);
    const main = m ? m.t0 : pzW[0] || pzT[0];
    if (main) setK('proc_status', tableStatus(main, m && m.c));
    setK('amcu', tableAmcu(pzW.reduce((acc, x) => { const c = x.complaints || {}; return { n: acc.n + (c.n || 0), open: acc.open + (c.open || 0), satisfied: acc.satisfied + (c.satisfied || 0) }; }, { n: 0, open: 0, satisfied: 0 })));
    setK('sasu', tableSasu(pzW.map((x) => x.sasu)));
    if (m) {
      const sup = (m.c.suppliers || [])[0] || {};
      setK('contractor', sup.name);
      if (m.c.start) setK('start', { day: m.c.start }, 'blank');
    }
    // The progress kept in the monitor, when newer than the file's.
    const st = (r.work || {}).status;
    if (st && (!r.t.upd || String(st.upd || '') >= String(r.t.upd))) {
      if (st.pct != null) setK('pct', st.pct, 'force');
      if (st.upd) setK('upd', { day: st.upd }, 'force');
      if (st.comment) setK('comment', st.comment, 'force');
    }
    const pSub = subvMatch(r);
    const ad = pSub && pSub.name ? adequacyData(r, pSub.amounts[Object.keys(pSub.amounts).sort().pop()]) : null;
    if (ad) {
      setK('funding', FUNDING_WORD[ad.status]);
      setK('extra_need', Math.round(Math.max(0, ad.need - ad.left)));
    }
    // The columns the export did not write before: the contractor's code, the money, the dates, the
    // subvention, the shares, and NEXT ACTIVITY from the nearest open task.
    const v = spRowValues(r);
    for (const k of ['contractor_id', 'contract_value', 'contract_sum', 'co_eib', 'co_local', 'contract_date', 'completion', 'subv_year', 'subv_paid', 'subv_paid_year', 'paid_pct', 'subv_util']) if (v[k] != null) setK(k, v[k]);
    if (ca >= 0 && v.next_act) { sp.set(ref(R, ca), v.next_ca, how); sp.set(ref(R, ca + 1), v.next_act, how); if (v.next_date) sp.set(ref(R, ca + 2), v.next_date, how); }
    // The journal, into its week's EXPERT / Activity / ☑ — where that week is still empty. Several
    // activities of one week go in together ("VISIT; COST VERIFICATION"), each expert once.
    const byWeek = new Map();
    for (const x of activities(r).filter((a) => a.src === 'app').sort((a, b) => a.date.localeCompare(b.date))) {
      const w = weekOf(x.date).label;
      if (!byWeek.has(w)) byWeek.set(w, { who: new Set(), kinds: new Set(), done: true });
      const g = byWeek.get(w); g.who.add(initialsOf(x.who)); g.kinds.add(x.kind); g.done = g.done && x.done !== false;
    }
    for (const [w, g] of byWeek) {
      const c0 = weeks[w];
      if (c0 == null) { report.noWeek++; continue; }
      const cur = [row[c0], row[c0 + 1]];
      if (cur.some((v) => v != null && v !== '')) continue;
      sp.set(ref(R, c0), [...g.who].filter(Boolean).join('; '), 'blank');
      sp.set(ref(R, c0 + 1), [...g.kinds].join('; '), 'blank');
      if (g.done) sp.set(ref(R, c0 + 2), true, 'blank');
      report.weeks++;
    }
  });
  report.missing = [...REG.rows.keys()].filter((c) => !seen.has(c));
  // Sub-projects added in the app by hand: new rows right after the last filled one, with the rating formula.
  report.added = 0;
  let spNext = base + sps.reduce((last, row, i) => (i > hi && row && codesOf(row[col.code]).length ? i : last), hi) + 1;
  for (const code of report.missing) {
    const r = REG.rows.get(code);
    if (!r || !(r.t || {}).manual) continue;
    const R = spNext++, v = spRowValues(r);
    sp.addRow(R + 1);
    for (const [key] of SP_COLS) if (col[key] != null && v[key] != null && key !== 'rating') sp.set(ref(R, col[key]), v[key], 'force');
    if (col.rating != null) sp.set(ref(R, col.rating), { f: RATING_FORMULA(R + 1), v: v.rating != null ? +v.rating : '' }, 'force');
    report.added++;
  }
  put(spPath, sp.out());
  report.sheets.SPs = sp.stat;

  // ---- Tenders ----
  const tnPath = partOf('Tenders');
  if (tnPath && wb.Sheets.Tenders) {
    const tn = XLSX.utils.sheet_to_json(wb.Sheets.Tenders, { header: 1, raw: true, defval: null });
    const tbase = XLSX.utils.decode_range(wb.Sheets.Tenders['!ref']).s.r;
    const th = tn.findIndex((r) => r && String(r[0] || '').trim() === 'SP ID');
    if (th >= 0) {
      const tcol = mapHeaders(tn[th].map((x) => String(x || '').replace(/\s+/g, ' ').trim()), TN_COLS);
      const tp = sheetPatch(text(tnPath), sst);
      const onSheet = new Set();
      tn.forEach((row, i) => {
        if (i <= th || !row) return;
        const code = codesOf(row[tcol.sp])[0];
        const tid = (String(row[tcol.pz] || '').match(PZ_ID) || [])[0];
        const r = code && (REG.rows.get(code) || REG.rows.get(code.replace(/-A$/, '')));
        if (!r || !tid) return;
        const t0 = ((r.pz || {}).tenders || []).find((x) => x.tid === tid && !x.error);
        const s = snaps[tid];
        const R = tbase + i;
        const setT = (key, v, h2) => { if (tcol[key] != null) tp.set(ref(R, tcol[key]), v, h2 || how); };
        // The team's marks as the app keeps them: a mark taken off is written off too.
        const marks = ((r.work || {}).marks || {});
        if (marks[tid]) for (const k of ['td', 'assist', 'monitor']) setT('mk_' + k, !!marks[tid][k], 'force');
        onSheet.add(tid);
        if (!t0 && !s) return;
        const it = procItems(r).find((y) => y.tid === tid);
        if (it) {
          const v = tenderRowValues(r, Object.assign({}, it, { x: null }), s);
          for (const k of ['est', 'co_eib', 'co_local', 'paid', 'paid_eib', 'paid_local', 'mods_link', 'duration']) if (v[k] != null) setT(k, v[k]);
        }
        report.tenders++;
        const st = (s && s.tender) || {};
        const c = ((t0 && t0.contracts) || []).find((x) => x.status === 'active') || ((t0 && t0.contracts) || []).find((x) => x.status === 'terminated') || (s && s.contract) || null;
        setT('status', tableStatus(t0 || st, c));
        setT('method', tableMethod(t0 || st));
        const issued = (t0 && t0.date) || st.date, opening = (t0 && t0.deadline) || st.deadline;
        if (issued) setT('issued', { day: issued });
        if (opening) setT('opening', { day: opening });
        const bids = t0 ? t0.bids : st.bids;
        if (bids != null) setT('bidders_n', bids);
        const u = (s && s.undp) || {};
        if ((u.timeline || {}).auction) setT('auction', { day: u.timeline.auction });
        if ((u.timeline || {}).award) setT('award', { day: u.timeline.award });
        const names = ((u.bidders || {}).list || []).map((x) => x.name).filter(Boolean);
        if (names.length) setT('bidders', names.join('\n'));
        if (st.questions_count != null) setT('qr', st.questions_count);
        const cp = u.complaints || {};
        const amcuOf = (x) => (x && x.n ? { n: x.n, open: x.open, satisfied: x.upheld } : null);
        if ((cp.tender || {}).n) { setT('amcu_td', cp.tender.n); setT('amcu_td_status', tableAmcu(amcuOf(cp.tender))); }
        if ((cp.award || {}).n) { setT('amcu_eval', cp.award.n); setT('amcu_eval_status', tableAmcu(amcuOf(cp.award))); }
        setT('sasu', tableSasu([t0 && t0.sasu]) || (s && (s.sasu || []).length ? tableSasu([{ n: s.sasu.length, violation: s.sasu.some((x) => x.violation), active: s.sasu.some((x) => /active|draft/.test(x.status || '')) }]) : null));
        if (c) {
          const sup = (c.suppliers || [])[0] || {};
          setT('contract_link', 'https://prozorro.gov.ua/tender/' + tid);
          setT('contractor', sup.name);
          setT('contractor_id', edrCode(sup.code));
          setT('contract_no', c.number);
          if (c.signed) setT('contract_date', { day: c.signed });
          if (c.end) setT('contract_end', { day: c.end });
          if (c.value && c.value.amount) setT('contract_total', c.value.amount);
          const nch = typeof c.changes === 'number' ? c.changes : Array.isArray(c.changes) ? c.changes.length : null;
          if (nch != null) setT('mods', nch);
        }
      });
      // Procurements linked in the app that the sheet has no row for: new rows at its end.
      report.tnAdded = 0;
      let tnNext = tbase + tn.reduce((last, row, i) => (i > th && row && String(row[tcol.sp] || '').trim() ? i : last), th) + 1;
      for (const code of seen) {
        const r = REG.rows.get(code);
        if (!r) continue;
        for (const it of procItems(r)) {
          // Only what the team lists there (works, supervision, the engineer) and only with Prozorro's data in hand.
          if (!it.tid || onSheet.has(it.tid) || it.x || !it.t0 || it.t0.error || !['works', 'ts', 'csc'].includes(it.role)) continue;
          const R = tnNext++;
          tp.addRow(R + 1);
          const v = tenderRowValues(r, it, snaps[it.tid]);
          for (const [key] of TN_COLS) if (tcol[key] != null && v[key] != null) tp.set(ref(R, tcol[key]), v[key], 'force');
          onSheet.add(it.tid);
          report.tnAdded++;
        }
      }
      put(tnPath, tp.out());
      report.sheets.Tenders = tp.stat;
    }
  }
  // Excel recalculates everything on opening (the rating follows the scores).
  let w2 = wbx;
  w2 = /<calcPr[^>]*fullCalcOnLoad=/.test(w2) ? w2.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : /<calcPr/.test(w2) ? w2.replace('<calcPr', '<calcPr fullCalcOnLoad="1"') : w2.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  put('xl/workbook.xml', w2);
  const out = CFB.write(z, { fileType: 'zip', type: 'array', compression: true });
  return { bytes: out, report };
}

function exportDialog() {
  const box = h('div', { class: 'x-actions' });
  const modeSel = h('div', { class: 'x-modes' },
    ['blank', 'update'].map((m, i) => h('label', { class: 'x-mode' }, h('input', { type: 'radio', name: 'xmode', value: m, checked: i === 0 }), h('span', null, h('b', null, rt('xMode_' + m)), h('div', { class: 'small muted' }, rt('xMode_' + m + 'Hint'))))));
  const mode = () => (modeSel.querySelector('input:checked') || {}).value || 'blank';
  const status = h('div', { class: 'small x-status' });
  const run = async (name, bufP) => {
    fill(status, rt('xWorking'));
    try {
      const { bytes, report } = await fillWorkbook(await bufP, mode(), (msg) => fill(status, msg));
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = h('a', { href: URL.createObjectURL(blob), download: String(name).replace(/\.xlsx$/i, '') + ' (монітор ' + today() + ').xlsx' });
      document.body.append(a); a.click(); a.remove();
      const st = report.sheets.SPs || {}, tt = report.sheets.Tenders || {};
      fill(status, h('div', { class: 'x-report' },
        h('b', null, rt('xDone', { n: (st.set || 0) + (tt.set || 0) })),
        h('div', null, rt('xRows', { sp: report.sps, tn: report.tenders, w: report.weeks })),
        report.added || report.tnAdded ? h('div', null, rt('xAdded', { sp: report.added || 0, tn: report.tnAdded || 0 })) : null,
        h('div', { class: 'muted' }, rt('xKept', { kept: (st.kept || 0) + (tt.kept || 0), formula: (st.formula || 0) + (tt.formula || 0) })),
        report.missing.length ? h('div', { class: 'muted' }, rt('xMissing', { n: report.missing.length, list: report.missing.slice(0, 12).join(', ') })) : null,
        report.noWeek ? h('div', { class: 'muted' }, rt('xNoWeek', { n: report.noWeek })) : null));
    } catch (e) {
      console.error('export', e);
      fill(status, h('span', { class: 'bad' }, (e && e.message) || String(e)));
    }
  };
  const pick = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: () => pick.files[0] && run(pick.files[0].name, pick.files[0].arrayBuffer()) });
  sheet(h('h2', { class: 'card-title' }, rt('xTitle')), h('p', { class: 'muted small' }, rt('xLead')), modeSel, box, pick, status);
  (async () => {
    const saved = await idbGet('template');
    fill(box,
      saved ? h('button', { class: 'btn btn-dark', onclick: () => run(saved.name, Promise.resolve(saved.bytes)) }, icon('download'), rt('xSaved', { name: saved.name, at: fdate(String(saved.at).slice(0, 10)) })) : h('p', { class: 'small muted' }, rt('xNoSaved')),
      h('button', { class: 'btn', onclick: () => pick.click() }, icon('cloud'), rt('xPick')));
  })();
}
