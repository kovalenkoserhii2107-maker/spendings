// A contract or procurement on control: its full dossier (money, compliance, parties, rules), Drive copies, styled .xlsx.
'use strict';

// ---- Prozorro: procedures, payment terms, contracts and documents ---------------------------------

// A dictionary label, or the raw code when the dictionary does not know it.
const label = (prefix, code) => { if (!code) return ''; const v = t(prefix + code); return v === prefix + code ? code : v; };
const pzUrl = (tid) => 'https://prozorro.gov.ua/tender/' + encodeURIComponent(tid);
const pzOpen = (t0) => !['complete', 'cancelled', 'unsuccessful'].includes(t0.status);
const pzStatus = (s) => h('span', { class: 'pz-st ' + (['complete', 'active'].includes(s) ? 'ok' : ['cancelled', 'unsuccessful'].includes(s) ? 'off' : 'run') }, label('pzs.', s));


// What the buyer has to pay and when, in one line: "Післяплата 100% — 30 календарних днів після надання послуг".
function milestoneText(m) {
  const days = m.days != null ? t('pzm.days', { n: m.days, type: m.days_type }) : '';
  const when = days ? `${days} ${t('pzm.after')} ${label('pzm.ev.', m.event).toLowerCase()}` : label('pzm.ev.', m.event);
  const what = m.type === 'financing' ? join([label('pzm.code.', m.code), m.pct != null ? nf1.format(m.pct) + '%' : null], ' ') : null;
  return join([what, when, m.text], ' — ');
}





function docList(docs, fresh) {
  if (!docs || !docs.length) return h('div', { class: 'muted small' }, t('pz.noDocs'));
  return h('div', { class: 'doc-list' }, docs.slice().reverse().map((d) => h('a', { class: 'doc', href: d.url, target: '_blank', rel: 'noopener noreferrer' },
    icon('file'), h('span', null, h('b', null, d.title || '—', fresh && fresh.has(d.id) ? h('span', { class: 'tag pz', style: 'margin-left:6px' }, t('tr.newDoc')) : null),
      h('small', null, join([d.type ? label('pzd.', d.type) : null, fdate(d.date)]))), icon('ext'))));
}


// ---- contracts on control -------------------------------------------------------------------
//
// Each user picks their own contracts (users/{uid}/tracked/{Prozorro contract id}) and may
// share one with another registered user (it lands in their users/{uid}/shared). GitHub
// Actions re-reads every picked contract each run and writes data/tracked/<id>.json: the
// contract, its procedure, payment stages, Treasury payments and the history of changes.
const myUid = () => (state.user && state.user.uid) || '';
const isTracked = (id) => state.mine.tracked.has(id);
const isSharedWithMe = (id) => !isTracked(id) && state.mine.shared.has(id);
const trackedRow = (id) => (state.trackedIndex.items || []).find((r) => r.key === id) || null;
// Where a contract's page leads back to: its sub-project's contracts, else the list of sub-projects.
const backTo = (tid) => { const sp = tid && typeof spOfTid === 'function' ? spOfTid(tid) : null; return sp ? '#/sp/' + encodeURIComponent(sp.code) + '/contracts' : '#/'; };
function getTrackedSeen() { try { return localStorage.getItem('trackedSeen') || ''; } catch (e) { return ''; } }
const loadTracked = (id) => cached(`tracked:${id}:${ver()}`, () => getJSON(`data/tracked/${id}.json`, ver()));

// ---- copies on the user's own Google Drive ----
//
// Prozorro's file storage sends no CORS headers, so the page cannot download documents.
// An Apps Script web app does it instead: it runs as the user who opens it, so each
// user connects once and their own 6-hour trigger copies the documents of the contracts
// they follow into their own Drive (drive.file: it sees only the files it created).
const DRIVE_APP = 'https://script.google.com/macros/s/AKfycbyGE6qLrjHqN63qsgMfml0MjGbLBKaubOb66TOh3o7HiEY3cEW8OsG0Ha4BrroRlMTx/exec';
const DRIVE_FOLDER = 'Договори на контролі'; // inside «Монітор розрахунків», shared with the site's exports
const driveState = { connected: undefined, at: null };
async function loadDriveState() {
  if (!cloud || !state.user) return;
  try {
    driveState.at = await cloud.driveScriptConnected();
    driveState.connected = !!driveState.at;
  } catch (e) { driveState.connected = undefined; }
  softRender();
}
// With several Google accounts signed in, Google cannot pick one for a web app and shows
// "Unable to open the file"; the /u/N/ form opens it under the N-th account of the browser.
// The account number picked once (several Google accounts in one browser) is reused.
function driveAccount() { try { const v = localStorage.getItem('driveAcc'); return v == null || v === '' ? null : Number(v); } catch (e) { return null; } }
const driveBase = (n) => (n == null ? DRIVE_APP : DRIVE_APP.replace('/macros/s/', `/macros/u/${n}/s/`));
const driveAppUrl = (n) => driveBase(n) + '?uid=' + encodeURIComponent(myUid()) + '&lang=' + LANG;
// The script's page for one contract: copy its documents now (copy) or list its folder (open).
function driveAction(action, cid) {
  window.open(driveBase(driveAccount()) + '?action=' + action + '&cid=' + encodeURIComponent(cid) + '&lang=' + LANG, '_blank', 'noopener');
}
function connectDrive(n) {
  if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
  if (typeof n === 'number') { try { localStorage.setItem('driveAcc', String(n)); } catch (e) { /* not kept */ } }
  window.open(driveAppUrl(typeof n === 'number' ? n : driveAccount()), '_blank', 'noopener');
  cloud.markDriveScript().then(() => { driveState.connected = true; driveState.at = new Date(); softRender(); }).catch(() => {});
}
const driveFolderLink = (label, cls) => ext('https://drive.google.com/drive/search?q=' + encodeURIComponent('"' + DRIVE_FOLDER + '"'), label, cls);
// The Drive block in Settings: connect the Drive (and pick the account when several are signed in).
function driveCard() {
  const on = driveState.connected;
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('tr.drive')),
      h('div', { class: 'row' }, on ? driveFolderLink(t('tr.openDrive'), 'btn btn-sm') : null,
        h('button', { class: 'btn btn-sm' + (on ? '' : ' btn-dark'), onclick: connectDrive }, icon('drive'), on ? t('gs.reconnect') : t('gs.connect')))),
    h('p', { class: 'muted small' }, on ? t('gs.onText') : t('gs.lead')),
    on && driveState.at ? h('p', { class: 'faint small' }, t('gs.connectedAt', { at: ftime(driveState.at) })) : null,
    h('details', { class: 'multi-acc' }, h('summary', null, t('gs.multiTitle')),
      h('p', { class: 'muted small' }, t('gs.multiText')),
      h('div', { class: 'row' }, [0, 1, 2, 3].map((n) => h('button', { class: 'btn btn-sm', onclick: () => connectDrive(n) }, t('gs.account', { n: n + 1 }))))));
}

// "Take on control" for one Prozorro contract (c) of a procedure (t0) seen from an organisation.
function trackButton(org, t0, c) {
  if (!c || !c.id) return null;
  if (isTracked(c.id)) return h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + c.id, onclick: closeSheet }, icon('star'), t('tr.onControl'));
  const btn = h('button', {
    class: 'btn btn-sm btn-dark',
    onclick: async () => {
      if (!cloud || !state.user) { toast(t('auth.needed'), { bad: true }); return; }
      btn.disabled = true;
      const sup = (c.suppliers || [])[0] || {};
      try {
        await cloud.track(c.id, { org: org.edrpou, tid: t0.tid, sp: c.sp || '', title: c.title || t0.title || '', number: c.number || '', buyer: t0.buyer_name || (org.role !== 'supplier' ? org.name : ''), supplier: sup.name || '' }); nudgeSync();
        if (driveState.connected === false) toast(t('tr.addedNoDrive'), { sticky: true, action: { label: t('gs.connect'), run: connectDrive } });
        else toast(t('tr.added'));
        btn.replaceWith(h('a', { class: 'btn btn-sm tracked-on', href: '#/tracked/' + c.id, onclick: closeSheet }, icon('star'), t('tr.onControl')));
      } catch (e) {
        btn.disabled = false;
        toast(t('tr.failed') + ' ' + (e.message || ''), { bad: true });
      }
    },
  }, icon('star'), t('tr.take'));
  return btn;
}

// What the history entry says, in the reader's language.
function eventText(e) {
  const cs = (s) => label('pzc.', s) || '—';
  switch (e.type) {
    case 'tracked': return t('ev.tracked');
    case 'status': return t('ev.status', { old: cs(e.old), new: cs(e.new) });
    case 'tender_status': return t('ev.tenderStatus', { old: label('pzs.', e.old) || '—', new: label('pzs.', e.new) || '—' });
    case 'value': return t('ev.value', { old: money(e.old), new: money(e.new) });
    case 'end': return t('ev.end', { old: fdate(e.old), new: fdate(e.new) });
    case 'change': return t('ev.change') + ': ' + join([(e.types || []).map((x) => label('pzr.', x)).join(', '), e.text]);
    case 'doc': return (e.updated ? t('ev.docUpdated') : t('ev.doc')) + ': ' + join([e.title, e.doc_type ? label('pzd.', e.doc_type) : null]);
    case 'payment': return (e.sure ? t('ev.payment') : t('ev.paymentMaybe')) + ' ' + money(e.amount) + (e.date ? ' · ' + fdate(e.date) : '');
    case 'act': return t('ev.act', { n: e.number || '—' }) + ' ' + money(e.amount) + (e.date ? ' · ' + fdate(e.date) : '');
    case 'stage_contract': return t('ev.stageContract', { n: e.number || '—' }) + (e.amount ? ' ' + money(e.amount) : '') + (e.supplier ? ' · ' + e.supplier : '');
    case 'contract_new': return t('ev.contractNew', { n: e.number || '—' }) + (e.amount ? ' ' + money(e.amount) : '') + (e.supplier ? ' · ' + e.supplier : '');
    case 'due': return t('ev.due', { sum: money(e.amount) }) + (e.overdue > 1 ? ' · ' + t('tr.overdueN', { sum: money(e.overdue) }) : '');
    case 'complaint': return t('ev.complaint', { of: t('ud.of.' + e.of) }) + (e.title ? ': ' + e.title : '') + ' · ' + t('ud.cs.' + (e.status || 'pending'));
    case 'complaint_status': return t('ev.complaintStatus', { of: t('ud.of.' + e.of), old: t('ud.cs.' + (e.old || 'pending')), new: t('ud.cs.' + (e.new || 'pending')) });
    case 'timeline': return t('ev.timeline', { what: t('ud.tl.' + e.field), old: e.old ? fdate(e.old) : '—', new: fdate(e.new) });
    case 'bids': return t('ev.bids', { old: e.old != null ? e.old : '—', new: e.new });
    case 'subvention': return t('ev.subvention', { old: e.old != null ? ni.format(e.old) : '—', new: e.new != null ? ni.format(e.new) : t('ud.subvDropped'), date: fdate(String(e.edition || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) });
    case 'matrix': return t('ev.matrix', { old: e.old || '—', new: e.new });
    case 'legal': return t('ev.legal', { what: t('lg.f.' + e.kind) });
    case 'rule': return t('ev.rule', { what: t('rl.k.' + e.key) });
    case 'collusion': return t('ev.collusion', { what: t('co.k.' + e.kind) }) + (e.a ? ' · ' + e.a + (e.b ? ' / ' + e.b : '') : '');
    case 'funding': return t('ev.funding', { old: t('fa.st.' + e.old), new: t('fa.st.' + e.new) }) + (e.gap > 0 ? ' · ' + t('fa.gap') + ' ' + money(e.gap) : '');
    case 'completion_overdue': return t('ev.completionOverdue', { date: fdate(e.end) });
    case 'sasu': return t('ev.sasu', { id: e.id || '' }) + (e.violation ? ' · ' + t('ud.violation') : '');
    case 'sasu_status': return t('ev.sasuStatus', { id: e.id || '', status: label('sasu.st.', e.new) || e.new || '—' }) + (e.violation ? ' · ' + t('ud.violation') : '');
    default: return e.type;
  }
}
const eventClass = (e) => ({ rule: 'bad', payment: 'pay', change: 'add', value: 'add', end: 'add', doc: 'act', act: 'act', due: 'add', complaint: 'bad', complaint_status: 'add', sasu: 'bad', sasu_status: 'bad', matrix: 'bad', subvention: 'add', completion_overdue: 'bad' }[e.type] || '');
// Kinds of change a user filters by.
const EVENT_GROUPS = { pay: ['payment', 'due'], docs: ['doc', 'act'], terms: ['change', 'value', 'end', 'timeline', 'bids'], status: ['status', 'tender_status'],
  control: ['complaint', 'complaint_status', 'sasu', 'sasu_status', 'matrix', 'subvention', 'funding', 'collusion', 'legal', 'rule', 'completion_overdue'] };
const eventGroup = (e) => Object.keys(EVENT_GROUPS).find((g) => EVENT_GROUPS[g].includes(e.type)) || '';
function eventPills(events, value, onpick) {
  const n = (g) => events.filter((e) => eventGroup(e) === g).length;
  return pills([['', t('ui.all'), events.length], ['pay', t('evg.pay'), n('pay')], ['docs', t('evg.docs'), n('docs')], ['terms', t('evg.terms'), n('terms')], ['status', t('evg.status'), n('status')], ['control', t('evg.control'), n('control')]]
    .filter((x) => x[0] === '' || x[2] || x[0] === value), value, onpick);
}
const eventSub = (e) => (e.type === 'payment' && e.purpose ? h('div', { class: 'cell-sub clamp1' }, e.purpose) : null);

function trackedBar(tt, acts) {
  const base = Math.max(tt.value || 0, tt.paid || 0, acts || 0) || 1;
  return h('div', { class: 'bar' + (tt.value && tt.paid > tt.value + 1 ? ' over' : '') },
    acts ? h('i', { class: 'acts', style: `width:${Math.min(100, (acts / base) * 100)}%` }) : null,
    h('i', { style: `width:${Math.min(100, ((tt.paid || 0) / base) * 100)}%` }));
}

// ---- an .xlsx of our own, styled -----------------------------------------------------------------
//
// A small writer: one or more sheets of rows, each cell a value or {v, f (formula), s (style)}.
// Styles are named ({bold, size, fill, fmt, wrap, align, color, border}) and turned into the
// workbook's style table; the zip is made with SheetJS's CFB (already loaded for the import).
function xlsxBook(sheets) {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FFD0D7DE"/></left><right style="thin"><color rgb="FFD0D7DE"/></right><top style="thin"><color rgb="FFD0D7DE"/></top><bottom style="thin"><color rgb="FFD0D7DE"/></bottom><diagonal/></border>'];
  const numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], seen = new Map();
  const idx = (list, x) => { const i = list.indexOf(x); return i >= 0 ? i : list.push(x) - 1; };
  const BUILTIN = { '0%': 9, '#,##0': 3, '#,##0.00': 4, '0.0': null };
  const style = (st) => {
    if (!st) return 0;
    const key = JSON.stringify(st);
    if (seen.has(key)) return seen.get(key);
    const font = idx(fonts, `<font>${st.bold ? '<b/>' : ''}<sz val="${st.size || 11}"/>${st.color ? `<color rgb="FF${st.color}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`);
    const fill = st.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let fmt = 0;
    if (st.fmt) {
      if (BUILTIN[st.fmt]) fmt = BUILTIN[st.fmt];
      else { let i = numFmts.indexOf(st.fmt); if (i < 0) i = numFmts.push(st.fmt) - 1; fmt = 164 + i; }
    }
    const al = st.wrap || st.align || st.valign ? `<alignment${st.align ? ` horizontal="${st.align}"` : ''} vertical="${st.valign || 'top'}"${st.wrap ? ' wrapText="1"' : ''}/>` : '';
    const i = xfs.push(`<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${st.border ? 1 : 0}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''} applyFont="1"${fill ? ' applyFill="1"' : ''}${st.border ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`) - 1;
    seen.set(key, i);
    return i;
  };
  const absRef = (ref) => ref.split(':').map((x) => x.replace(/^([A-Z]+)(\d+)$/, (m0, c, d) => '$' + c + '$' + d)).join(':');
  const colName = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const dayNum = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
  const cell = (ref, c) => {
    const x = c && typeof c === 'object' && !(c instanceof Date) ? c : { v: c };
    const s = style(x.s);
    const sa = s ? ` s="${s}"` : '';
    if (x.f) return `<c r="${ref}"${sa}${typeof x.v === 'string' ? ' t="str"' : ''}><f>${esc(x.f)}</f>${x.v != null ? `<v>${esc(x.v)}</v>` : ''}</c>`;
    const v = x.v;
    if (v == null || v === '') return s ? `<c r="${ref}"${sa}/>` : '';
    if (typeof v === 'boolean') return `<c r="${ref}"${sa} t="b"><v>${v ? 1 : 0}</v></c>`;
    if (typeof v === 'number') return isFinite(v) ? `<c r="${ref}"${sa}><v>${v}</v></c>` : '';
    if (x.day) return `<c r="${ref}"${sa}><v>${dayNum(v)}</v></c>`;
    return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  const sheetXml = (sh) => {
    const rows = sh.rows.map((row, r) => {
      if (!row) return '';
      const cells = row.map((c, i) => cell(colName(i) + (r + 1), c)).join('');
      const ht = (sh.heights || {})[r + 1];
      return cells || ht ? `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>` : '';
    }).join('');
    const cols = (sh.widths || []).map((w, i) => (w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '')).join('');
    const fr = sh.freeze;
    const pane = fr ? `<sheetViews><sheetView workbookViewId="0" zoomScale="90"><pane${fr.col ? ` xSplit="${fr.col}"` : ''} ySplit="${fr.row}" topLeftCell="${colName(fr.col || 0)}${fr.row + 1}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight"/></sheetView></sheetViews>` : '';
    const merges = (sh.merges || []).length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const cf = (sh.cf || []).map((c, i) => `<conditionalFormatting sqref="${c.ref}">${c.rules.map((ru, j) => `<cfRule type="cellIs" dxfId="${ru.dxf}" priority="${i * 10 + j + 1}" operator="equal"><formula>${ru.eq}</formula></cfRule>`).join('')}</conditionalFormatting>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="14.4"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${sh.filter ? `<autoFilter ref="${sh.filter}"/>` : ''}${merges}${cf}</worksheet>`;
  };
  const parts = sheets.map(sheetXml);
  const dxfs = ['FFC7CE|9C0006', 'FFEB9C|9C5700', 'C6EFCE|006100'].map((p) => { const [bg, fg] = p.split('|'); return `<dxf><font><color rgb="FF${fg}"/></font><fill><patternFill><bgColor rgb="FF${bg}"/></patternFill></fill></dxf>`; });
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs></styleSheet>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${parts.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.some((s) => s.filter) ? `<definedNames>${sheets.map((s, i) => (s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name)}'!${absRef(s.filter)}</definedName>` : '')).join('')}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${parts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles,
  };
  parts.forEach((p, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = p; });
  return files;
}
async function xlsxBlob(files) {
  const XLSX = await loadXlsx();
  const CFB = XLSX.CFB;
  const z = CFB.utils.cfb_new();
  const enc = new TextEncoder();
  for (const [p, s] of Object.entries(files)) CFB.utils.cfb_add(z, p, enc.encode(s));
  CFB.utils.cfb_del(z, '\u0001Sh33tJ5');
  return new Blob([CFB.write(z, { fileType: 'zip', type: 'array', compression: true })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function spOfTid(tid) {
  if (!tid || typeof hasRegistry !== 'function' || !hasRegistry()) return null;
  return [...REG.rows.values()].find((r) => spTids(r).includes(tid)) || null;
}



function trackedDossier(id) {
  const box = h('div', null, h('div', { class: 'card empty' }, t('ui.loading')));
  const pick = state.mine.tracked.get(id) || state.mine.shared.get(id);
  const sharedPick = isSharedWithMe(id) ? state.mine.shared.get(id) : null;
  (async () => {
    let s = null;
    if ((pick || isTeam()) && trackedRow(id)) {  // one's own, those shared with one, and the team's
      try { s = await loadTracked(id); } catch (e) { /* not written yet */ }
    }
    if (!s) {
      fill(box, backRow(backTo(pick && pick.tid)), h('div', { class: 'card pad' },
        h('h2', { class: 'card-title' }, pick ? (pick.number ? '№ ' + pick.number : t('pz.draftContract')) : t('tr.unknown')),
        pick ? h('p', { class: 'muted' }, join([pick.buyer, pick.supplier], ' → ')) : null,
        sharedPick ? h('p', { class: 'small' }, t('tr.sharedBy', { who: sharedPick.fromName || '—' })) : null,
        h('p', null, pick ? t('tr.pendingText') : t('tr.unknownText')),
        h('div', { class: 'row after' },
          pick && pick.tid ? ext(pzUrl(pick.tid), t('pz.openOnProzorro')) : null,
          sharedPick ? h('button', { class: 'btn btn-sm', onclick: async () => {
            if (!confirm(t('tr.removeSharedConfirm'))) return;
            try { await cloud.removeShared(id); location.hash = '#/tracked/shared'; } catch (e) { toast(e.message, { bad: true }); }
          } }, t('tr.removeShared')) : null,
          isTracked(id) ? h('button', { class: 'btn btn-sm', onclick: async () => {
            if (!confirm(t('tr.offConfirm'))) return;
            try { await cloud.untrack(id); if (typeof regNoTrack === 'function') regNoTrack(id, (trackedRow(id) || {}).tid); location.hash = backTo((trackedRow(id) || {}).tid); } catch (e) { toast(e.message, { bad: true }); }
          } }, t('tr.off')) : null)));
      return;
    }
    if (s.kind === 'tender') { fill(box, tenderDossier(id, s, pick)); return; }
    const c = s.contract, t0 = s.tender, tt = s.totals;
    const org = orgByCode(s.org);
    const sure = s.payments.filter((p) => p.sure), maybe = s.payments.filter((p) => !p.sure);
    const note = h('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: t('tr.noteHint') });
    note.value = (pick && pick.note) || '';
    const saveNote = h('button', {
      class: 'btn btn-sm', onclick: async () => {
        try { await cloud.setTrackedNote(id, note.value.trim()); toast(t('rv.saved')); } catch (e) { toast(e.message, { bad: true }); }
      },
    }, icon('check'), t('ui.save'));
    const off = h('button', {
      class: 'btn btn-sm', onclick: async () => {
        if (!confirm(t('tr.offConfirm'))) return;
        try { await cloud.untrack(id); if (typeof regNoTrack === 'function') regNoTrack(id, (trackedRow(id) || {}).tid); toast(t('tr.offDone')); location.hash = backTo((trackedRow(id) || {}).tid); } catch (e) { toast(e.message, { bad: true }); }
      },
    }, t('tr.off'));
    const payTable = (list) => h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', { class: 'r' }, t('col.amount')), h('th', null, t('f.purpose')))),
      h('tbody', null, list.map((p) => h('tr', { class: 'click', tabindex: 0, onclick: () => openPayment(p, org), onkeydown: (e) => { if (e.key === 'Enter') openPayment(p, org); } },
        td(t('col.date'), { class: 'num' }, fdate(p.date)),
        td(t('col.amount'), { class: 'r num' }, money(p.amount)),
        td(t('f.purpose'), { class: 'w-text' }, h('div', { class: 'clamp' }, p.purpose || '—'), p.kekv ? h('div', { class: 'cell-sub' }, t('f.kekv') + ' ' + p.kekv) : null))))));
    const stageRows = (s.stages || []).map((st) => h('div', { class: 'pay' },
      h('span', null, h('b', null, milestoneText(Object.assign({ type: 'financing' }, st)) + '. '),
        t('tr.stageAmount', { sum: money(st.amount) }),
        st.due ? ' · ' + t('tr.stageDue', { date: fdate(st.due) }) : '',
        st.due_now ? ' · ' + t('tr.stageDueNow', { sum: money(st.due_now) }) : '',
        !st.due && st.event !== 'signingTheContract' && !(s.acts || []).length ? h('div', { class: 'cell-sub' }, t('tr.noActs')) : null)));
    const delivery = (t0.milestones || []).filter((m) => m.type !== 'financing' && (!m.lot || !c.lot || m.lot === c.lot));
    const seen = getTrackedSeen();
    const freshDocs = new Set((s.history || []).filter((e) => e.type === 'doc' && e.at > seen && e.id).map((e) => e.id));
    const funders = (t0.funders || []).map((x) => x.name).filter(Boolean);
    const isEib = (t0.funders || []).some((x) => x.code === '33000');
    const events = (s.history || []).filter((e) => e.type !== 'tracked');
    const hist = h('div');
    const histPills = h('div');
    const drawHistory = (g) => {
      const shown = events.filter((e) => !g || eventGroup(e) === g);
      fill(histPills, events.length ? eventPills(events, g, drawHistory) : null);
      fill(hist, shown.length ? h('div', { class: 'timeline' }, shown.map((e) => h('div', { class: 'ev ' + eventClass(e) + (e.at > seen ? ' new' : '') },
        h('span', { class: 'd num' }, fdate(e.at)), h('span', null, eventText(e), eventSub(e)), h('span')))) : h('p', { class: 'muted small' }, t('dos.noEvents')));
    };
    drawHistory('');
    fill(box,
      h('div', { class: 'org-head' },
        h('div', null,
          (() => { const sp = typeof spOfTid === 'function' ? spOfTid(s.tid) : null;
            return backRow(backTo(s.tid), h('nav', { class: 'crumbs', 'aria-label': t('nav.tracked') },
              sp ? [h('a', { href: '#/' }, t('nav.sps')), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sp/' + encodeURIComponent(sp.code) + '/contracts' }, sp.code)]
                : h('a', { href: '#/' }, t('nav.sps')),
              h('span', { 'aria-hidden': 'true' }, '/'), h('span', null, t('dos.crumb')))); })(),
          h('h1', { class: 'org-title' }, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
          h('div', { class: 'chips' },
            h('span', { class: 'pz-st ' + (c.status === 'active' ? 'ok' : 'run') }, label('pzc.', c.status)),
            t0.method ? h('span', { class: 'tag' }, label('pzt.', t0.method)) : h('span', { class: 'tag' }, t('dos.treasuryOnly')),
            isEib || s.eib ? h('span', { class: 'tag eib' }, s.eib ? t('eib.kind.' + s.eib) : t('eib.short')) : null,
            s.eib_tx ? h('span', { class: 'tag eib' }, t('eib.tx')) : null,
            t0.subproject ? h('span', { class: 'tag eib', title: t('sub.title') }, t0.subproject.code) : null,
            riskChip(s),
            tt.overdue > 1 && !tt.partial ? h('span', { class: 'sev high' }, t('tr.overdueN', { sum: money(tt.overdue) })) : null,
            s.error ? h('span', { class: 'sev medium', title: s.error }, t('tr.error')) : null),
          h('p', { class: 'muted' }, c.title || t0.title),
          funders.length ? h('p', { class: 'small' }, t('eib.funders') + ': ' + funders.join(', ')) : null),
        h('div', { class: 'org-actions' }, h('div', { class: 'row' },
          s.tid ? ext(pzUrl(s.tid), 'Prozorro', 'btn') : null,
          t0.dream_id ? ext(dreamUrl(t0.dream_id), 'DREAM', 'btn') : null),
          isTracked(id) && !isTeam() ? off : null)),
      s.from_tender ? h('p', { class: 'notice small section' }, t('tr.fromTender', { tid: s.tid })) : null,
      h('div', { class: 'tiles section' },
        h('div', { class: 'stat tint-violet' }, h('small', null, t('pz.contractValue')), h('b', { class: 'num' }, money(tt.value)), c.start || c.end ? h('span', { class: 'sub' }, `${fdate(c.start)} — ${fdate(c.end)}`) : null),
        // With the loan's part read back from VAT: the whole paid, and how it splits.
        tt.paid_total ? h('div', { class: 'stat tint-blue' }, h('small', null, t('tr.paid')), h('b', { class: 'num' }, money(tt.paid_total)),
          h('span', { class: 'sub' }, t('tr.paidSplit', { eib: money(tt.paid_eib), local: money(tt.paid) })))
          : h('div', { class: 'stat tint-blue' }, h('small', null, t('tr.paid')), h('b', { class: 'num' }, money(tt.paid)), h('span', { class: 'sub' }, tt.value ? t('bar.paidPct', { pct: Math.round((tt.paid / tt.value) * 100) }) : '')),
        h('div', { class: 'stat tint-yellow' }, h('small', null, tt.left < -1 ? t('dos.overpaid') : t('tr.left')), h('b', { class: 'num' }, money(Math.abs(tt.left))), tt.maybe ? h('span', { class: 'sub' }, t('tr.maybeSub', { sum: money(tt.maybe) })) : null),
        h('div', { class: 'stat' + (tt.overdue > 1 && !tt.partial ? ' bad' : '') }, h('small', null, t('tr.dueNow')), h('b', { class: 'num' }, money(tt.due_now)), h('span', { class: 'sub' }, tt.overdue > 1 ? (tt.partial ? t('tr.notSeen', { sum: money(tt.overdue) }) : t('tr.overdueN', { sum: money(tt.overdue) })) : t('tr.noOverdue')))),
      // Done and paid against the price, and the completion date.
      h('div', { class: 'card pad section' }, trackedBar(tt, s.acts_sum),
        h('div', { class: 'bar-label' }, h('span', null, t('tr.paidOf', { paid: money(tt.paid_total || tt.paid), value: money(tt.value) })), h('span', null, s.acts_sum ? t('tr.actsSum', { sum: money(s.acts_sum) }) : '')),
        progressLine(s)),
      // The rest by tabs: who and how it goes, the procurement, the money, the checks, the papers.
      dossierTabs([
        ['overview', () => [partiesCard(t0, c), contractorCard(s, c),
      h('div', { class: 'grid-2 section' },
        h('div', { class: 'card pad' },
          h('h2', { class: 'card-title' }, t('tr.stages')),
          stageRows.length ? h('div', { class: 'explain' }, stageRows) : h('p', { class: 'muted small' }, t('pz.noTerms')),
          delivery.length ? h('div', { class: 'explain', style: 'margin-top:8px' }, delivery.map((m) => h('div', null, h('span', null, h('b', null, label('pzm.type.', m.type) + '. '), milestoneText(m))))) : null),
        h('div', { class: 'card pad' },
          h('h2', { class: 'card-title' }, t('tr.history')), histPills, hist))]],
        ['procurement', () => [
      procurementCard(s, c),
      rulesCard(s),
      s.related ? relatedCard(s.related, t0) : null,
      (t0.other_contracts || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('tr.otherContracts')),
        h('div', { class: 'qs-contracts' }, t0.other_contracts.map((oc) => h('div', { class: 'qs-contract' },
          h('div', null, h('b', null, t('dos.heading', { n: oc.number || '—', date: fdate(oc.signed) })),
            h('div', { class: 'cell-sub' }, join([(oc.suppliers || []).map((x) => x.name).join(', '), oc.value ? money(oc.value.amount, oc.value.currency) : null, label('pzc.', oc.status)]))),
          oc.status !== 'cancelled' ? trackButton({ edrpou: t0.buyer, name: t0.buyer_name, role: 'buyer' }, Object.assign({}, t0, { tid: s.tid }), oc) : null)))) : null]],
        ['money', () => [
      fundingCard(s, t0),
      h('div', { class: 'table-card section' },
        h('div', { class: 'table-tools' }, h('b', null, t('tr.payments'))),
        sure.length ? payTable(sure) : h('div', { class: 'empty' }, t('dos.noPayments')),
        maybe.length ? [h('div', { class: 'table-tools' }, h('b', null, t('tr.maybe')), h('span', { class: 'faint small' }, t('tr.maybeHelp'))), payTable(maybe)] : null),
      (s.addendums || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('kinds.addendum')),
        h('div', { class: 'timeline' }, s.addendums.map((a) => h('div', { class: 'ev add' }, h('span', { class: 'd num' }, fdate(a.date)),
          h('span', null, t('kind.addendum') + ' № ' + (a.number || '—') + (a.type === 1 ? ' · ' + t('dos.priceUp') : a.type === 0 ? ' · ' + t('dos.priceDown') : '')),
          h('span', { class: 'num' }, a.amount ? money(a.amount) : ''))))) : null,
      (s.acts || []).length ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('kinds.act')),
        h('div', { class: 'timeline' }, s.acts.map((a) => h('div', { class: 'ev act' }, h('span', { class: 'd num' }, fdate(a.date)), h('span', null, t('kind.act') + ' № ' + (a.number || '—'), a.published && a.published !== a.date ? h('span', { class: 'faint small' }, ' · ' + t('audit.publishedOn', { date: fdate(a.published) })) : null), h('span', { class: 'num' }, money(a.amount)))))) : null]],
        ['compliance', () => [complianceCard(s)]],
        ['docs', () => [
      t0.treasury_only ? h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('dos.docs')), h('p', { class: 'muted small' }, t('dos.noProzorro')))
        : docsCard(id, c, t0, freshDocs),
      isTracked(id) ? shareCard(id) : null,
      isTracked(id) ? h('div', { class: 'card pad section' },
        h('h2', { class: 'card-title' }, t('tr.note')),
        h('div', { class: 'review-form' }, h('label', { class: 'field grow' }, note), saveNote),
        h('p', { class: 'muted small' }, join([pick && pick.addedAt ? t('tr.addedAt', { at: ftime(pick.addedAt) }) : null, s.payments_checked ? t('tr.checked', { at: fdate(s.payments_checked) }) : null])))
        : h('div', { class: 'card pad section' },
          h('h2', { class: 'card-title' }, sharedPick ? t('tr.sharedTab') : t('tr.teamItem')),
          h('p', { class: 'muted' }, sharedPick ? t('tr.sharedBy', { who: sharedPick.fromName || '—' }) + (sharedPick.at ? ' · ' + ftime(sharedPick.at) : '') : t('tr.teamItemText2')),
          h('div', { class: 'row after' },
            isTeam() ? null : trackButton(org || { edrpou: s.org }, { tid: s.tid, title: t0.title, buyer_name: t0.buyer_name }, c),
            sharedPick ? h('button', { class: 'btn btn-sm', onclick: async () => {
              if (!confirm(t('tr.removeSharedConfirm'))) return;
              try { await cloud.removeShared(id); location.hash = '#/tracked/shared'; } catch (e) { toast(e.message, { bad: true }); }
            } }, t('tr.removeShared')) : null))]],
      ]));
  })();
  return box;
}

// The dossier's parts as tabs (the choice stays while one goes from contract to contract).
let DTAB = 'overview';
function dossierTabs(list) {
  if (!list.some(([k]) => k === DTAB)) DTAB = list[0][0];
  const body = h('div');
  const nav = h('nav', { class: 'section-tabs pills sp-tabs', 'aria-label': t('dos.tabs') });
  const draw = () => {
    fill(nav, list.map(([k]) => h('a', { href: '#', class: k === DTAB ? 'on' : '', role: 'tab', 'aria-selected': k === DTAB,
      onclick: (e) => { e.preventDefault(); DTAB = k; draw(); } }, t('dos.tab.' + k))));
    fill(body, list.find(([k]) => k === DTAB)[1]());
  };
  draw();
  return [nav, body];
}

const CHECK_KEYS = ['competition', 'documents', 'guarantees', 'price', 'reconciliation', 'oversight'];
const CHECK_ICON = { ok: '✓', warn: '!', bad: '✕', na: '–' };
function checklistBox(checklist) {
  const byKey = Object.fromEntries((checklist || []).map((x) => [x.key, x]));
  return h('div', { class: 'checklist' }, CHECK_KEYS.map((k) => {
    const x = byKey[k] || { status: 'na', notes: [] };
    return h('div', { class: 'chk ' + x.status },
      h('span', { class: 'chk-ico', 'aria-label': t('chk.st.' + x.status) }, CHECK_ICON[x.status] || '–'),
      h('div', null, h('b', null, t('chk.' + k)),
        h('div', { class: 'small muted' }, x.notes.length ? x.notes.map(([code, v]) => t('chkn.' + code, v || {})).join(' · ') : t('chk.st.' + x.status))));
  }));
}
function signalRows(list) {
  if (!list.length) return h('p', { class: 'muted small' }, t('sigs.none'));
  return h('div', { class: 'sig-rows' }, list.map((x) => h('div', { class: 'sig-row ' + x.severity },
    sevTag(x.severity), h('div', null, h('b', null, signalTitle(x)), h('div', { class: 'small muted' }, signalText(x))),
    x.amount != null ? h('span', { class: 'num small' }, mshort(x.amount)) : h('span'))));
}
function complianceCard(snap) {
  const list = snap.signals || [];
  const box = h('div');
  const pillsBox = h('div');
  const draw = (g) => {
    fill(pillsBox, list.length ? groupPills(list, g, draw) : null);
    fill(box, signalRows(list.filter((x) => !g || sigGroup(x.type) === g)));
  };
  draw('');
  const audit = snap.sasu || [];
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('chk.title')), h('div', { class: 'row' }, riskChip(snap), snap.eib ? h('span', { class: 'tag eib' }, t('eib.kind.' + snap.eib)) : null)),
    matrixBlock(snap),
    h('div', { class: 'drive-part-title', style: 'margin-top:16px' }, t('ud.checklist')),
    checklistBox(snap.checklist),
    docAuditBlock(snap.doc_audit),
    advanceBlock(snap.advance),
    audit.length ? h('div', { class: 'sasu' }, h('div', { class: 'drive-part-title' }, t('dos.sasu')), audit.map(monitoringBlock)) : null,
    h('div', { class: 'card-head', style: 'margin-top:16px' }, h('h3', { class: 'card-sub' }, t('dos.signals')), pillsBox),
    box);
}

// Payments against the acts and addendums on spending.gov.ua: what was paid but not published,
// published late, or dated otherwise.
function docAuditBlock(list) {
  if (!(list || []).length) return null;
  return h('div', { class: 'audit' }, h('div', { class: 'drive-part-title' }, t('audit.title')),
    h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('audit.doc')), h('th', null, t('audit.issue')), h('th', null, t('audit.detail')))),
      h('tbody', null, list.map((e) => h('tr', null,
        td(t('audit.doc'), null, h('b', null, t('audit.kind.' + e.kind) + ' № ' + (e.number || '—')), h('div', { class: 'cell-sub num' }, fdate(e.date))),
        td(t('audit.issue'), null, h('span', { class: 'sev ' + (e.issue === 'published_late' ? 'low' : 'medium') }, t('audit.' + e.issue, { days: e.days }))),
        td(t('audit.detail'), { class: 'w-text' }, join([
          e.issue === 'unpublished' ? t('audit.paid', { sum: money(e.paid), date: fdate(e.first_pay) }) : null,
          e.issue === 'unpublished' && e.kind === 'addendum' ? (e.prozorro ? t('audit.prozorro', { date: fdate(e.prozorro) }) : t('audit.noProzorro')) : null,
          e.issue === 'date_mismatch' ? t('audit.portalDate', { date: fdate(e.portal_date) }) : null,
          e.issue === 'published_late' ? t('audit.publishedOn', { date: fdate(e.published) }) : null,
          e.paid_first ? t('audit.paidFirst', { sum: money(e.paid_first) }) : null]))))))));
}
// Advance payments: their share of the price and whether acts closed them within 3 months.
function advanceBlock(a) {
  if (!a) return null;
  const o = a.open;
  return h('div', { class: 'audit' }, h('div', { class: 'drive-part-title' }, t('adv.title')),
    h('p', { class: 'small' }, t('adv.sum', { sum: money(a.sum), pct: a.pct != null ? a.pct : '—' }), a.over ? h('span', { class: 'sev high', style: 'margin-left:8px' }, t('sigtype.advance_over_30')) : null),
    h('div', { class: 'explain' }, a.advances.map((p) => h('div', null, h('span', { class: 'num' }, fdate(p.date) + ' · ' + money(p.amount)), p.likely ? h('span', { class: 'faint small' }, ' · ' + t('adv.likely')) : null))),
    h('p', { class: 'small ' + (o ? '' : 'muted') }, o ? t('sig.advance_not_closed.text', o) : t('adv.closed')));
}
// The buyer's other procurements for the same object: design, technical and author's
// supervision, expert review. Technical supervision missing is worth a question.
const REL_ORDER = ['design', 'expertise', 'works', 'supervision', 'author', 'other'];
function relatedRows(list) {
  return h('div', { class: 'qs-contracts' }, list.slice().sort((a, b) => REL_ORDER.indexOf(a.role) - REL_ORDER.indexOf(b.role)).map((r) => h('div', { class: 'qs-contract' },
    h('div', null, h('span', { class: 'tag' + (r.role === 'supervision' ? ' ok' : '') }, t('rel.role.' + r.role)), ' ', h('b', null, r.title || r.tid),
      h('div', { class: 'cell-sub' }, join([r.tid, label('pzs.', r.status), r.value ? money(r.value.amount, r.value.currency) : null]))),
    ext(pzUrl(r.tid), 'Prozorro'))));
}
function relatedCard(list, t0) {
  const works = String(t0.cpv || '').startsWith('45') || t0.category === 'works';
  if (!works && !list.length) return null;
  const sup = list.some((r) => r.role === 'supervision');
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('rel.title')), t0.subproject ? h('span', { class: 'tag eib', title: t('sub.title') }, t0.subproject.code) : null),
    list.length ? relatedRows(list) : h('p', { class: 'muted small' }, t('rel.none')),
    works && !sup ? h('p', { class: 'notice small', style: 'margin-top:10px' }, t('rel.noSupervision')) : null);
}
function planRows(plans) {
  return h('div', null,
    plans.map((p) => h('div', { class: 'plan' },
      kv([
        [t('plan.id'), h('a', { href: 'https://prozorro.gov.ua/plan/' + encodeURIComponent(p.pid || ''), target: '_blank', rel: 'noopener noreferrer' }, p.pid || '—')],
        [t('plan.year'), p.year],
        [t('plan.amount'), p.amount != null ? money(p.amount, p.currency) : null],
        [t('plan.sources'), (p.sources || []).map((x) => h('div', null, h('b', null, t('plan.src.' + x.kind)), x.amount != null ? ' · ' + money(x.amount) + (p.amount ? ` (${Math.round((x.amount / p.amount) * 100)}%)` : '') : '',
          x.text ? h('div', { class: 'cell-sub' }, x.text) : null, x.program ? h('div', { class: 'cell-sub' }, t('plan.program') + ': ' + x.program) : null))],
        [t('plan.kekv'), (p.kekv || []).join('; ')],
        [t('plan.project'), p.project ? join([p.project.id, p.project.name]) : null],
      ]))));
}
// The same, asked live (the EIB catalogue keeps no such list).
const SUBPROJECT_RE = /(?<![A-Z0-9])([A-Z]{2}\d{2}[A-Z]?)_(\d{2})(?![0-9])/;
const TO_LATIN = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X' };
function subprojectOf(t0) {
  const texts = (t0.contracts || []).map((c) => c.number).concat([t0.title]);
  for (const x of texts) {
    const m = String(x || '').toUpperCase().replace(/[АВСЕНІКМОРТХ]/g, (ch) => TO_LATIN[ch]).match(SUBPROJECT_RE);
    if (m && !m[1].startsWith('UA')) return { code: m[1] + '_' + m[2], object: m[1] };
  }
  return null;
}
function objectName(title, n = 14) {
  const text = String(title || '');
  let rest = text.replace(/^\s*(?:ДК\s*021\s*[:\-]?\s*2015\s*[:\-]?\s*(?:\(?CPV\)?)?\s*[:\-]?\s*)?\d{8}-\d\s*[-–—:]?\s*/i, '');
  if (rest !== text && rest.includes('(') && rest.split('(')[0].trim().split(/\s+/).length <= 8) rest = rest.slice(rest.indexOf('(') + 1);
  return rest.replace(/[«»")]/g, ' ').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}
const REL_RX = [['supervision', /технічн\S*\s+нагляд/i], ['author', /авторськ\S*\s+нагляд/i], ['expertise', /експертиз|обстеженн|інвентаризац/i],
  ['design', /про[еє]кт\S*\s*[-–‑]?\s*кошторисн|про[еє]ктуванн|розробленн\S*\s+про[еє]кт|робоч\S+\s+про[еє]кт|коригуванн/i],
  ['consulting', /консультаційн|консалтинг|інженер\S*[\s\-‐–]*консультант|(?<!\d)713[1-5]\d{4}-\d/i], ['works', /будівництв|реконструкці|капітальн\S*\s+ремонт|ремонт|монтаж/i]];
function relRole(title) {
  const s = title || '';
  const works = /(?<!\d)45\d{6}-\d/.test(s);
  for (const [role, rx] of REL_RX) {
    if (role === 'design' && works) return 'works';
    // A services or goods code in the title is not construction, whatever object it names.
    if (role === 'works' && !works && [...s.matchAll(/(?<!\d)(\d{8})-\d/g)].some((m) => !m[1].startsWith('45'))) return 'other';
    if (rx.test(s)) return role;
  }
  return 'other';
}
// A works procurement: a construction CPV code, or a works title with no other code.
const isWorksTender = (t0) => /^45/.test((t0 && t0.cpv) || '') || (!(t0 && t0.cpv) && relRole((t0 && t0.title) || '') === 'works');
function liveRelated(t0) {
  const q = objectName(t0.title);
  const box = h('div', null, h('p', { class: 'muted small' }, t('ui.loading')));
  if (!t0.buyer || q.length < 12) return null;
  pzProxy({ action: 'search', kind: 'tenders', buyer: t0.buyer, text: q }).then((d) => {
    const list = (d.items || []).filter((r) => r.tid !== t0.tid).map((r) => Object.assign({}, r, { role: relRole(r.title) }));
    fill(box, relatedCard(list, t0) || '');
  }).catch((e) => fill(box, h('p', { class: 'muted small' }, e.message)));
  return box;
}

// The parts of the card built from what the sync collects for the UNDP working table (snap.undp).
const UD_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
// A reason of the matrix in words: a programme rule by its own name; a code with no label, readable.
const udWhy = (x) => {
  const [code, n] = String(x).split(':');
  if (code.startsWith('rule_')) { const k = 'rl.k.' + code.slice(5), v = t(k); return v === k ? code.slice(5).replace(/_/g, ' ') : v; }
  const k = 'ud.why.' + code, v = t(k, { n });
  return v === k ? code.replace(/_/g, ' ') + (n ? ' ' + n : '') : v;
};
const edFmt = (e) => fdate(String(e).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
function riskChip(s) {
  const n = ((s.undp || {}).matrix || {}).overall;
  const sp = typeof hasRegistry === 'function' && hasRegistry() ? [...REG.rows.values()].find((r) => spTids(r).includes(s.tid)) : null;
  return [n ? h('span', { class: 'sev ' + ['', 'low', 'medium', 'high'][n], title: t('ud.overallHint') }, t('ud.overall', { n })) : null,
    sp ? h('a', { class: 'tag eib', href: '#/sp/' + encodeURIComponent(sp.code) }, t('ud.inRegistry', { code: sp.code })) : null];
}
// Acts and payments as a share of the price, and the completion date (late when past it).
function progressLine(s) {
  const pg = (s.undp || {}).progress;
  if (!pg) return null;
  return h('div', { class: 'facts progress-facts' },
    h('div', null, h('small', null, t('ud.acts')), h('b', { class: 'num' }, pg.acts_pct != null ? ni.format(pg.acts_pct) + '%' : '—')),
    h('div', null, h('small', null, t('ud.paid')), h('b', { class: 'num' }, pg.paid_pct != null ? ni.format(pg.paid_pct) + '%' : '—')),
    h('div', { class: pg.overdue_days ? 'bad' : '' }, h('small', null, t('ud.end')), h('b', { class: 'num' }, pg.end ? fdate(pg.end) : '—'),
      pg.overdue_days ? h('span', { class: 'sub' }, t('ud.overdue', { n: pg.overdue_days })) : null));
}
// The procurement behind the contract, in order: its course by date, the price from expected to
// now, everyone who bid and what was decided, complaints to the AMCU.
function procurementCard(s, c) {
  const u = s.undp || {}, t0 = s.tender || {};
  const tl = u.timeline || {}, pr = u.price || {}, cp = u.complaints || {};
  const steps = [['announced', tl.announced, null], ['opening', tl.opening, tl.length_days != null ? t('ud.days', { n: tl.length_days }) : null],
    ['auction', tl.auction, null], ['award', tl.award, null], ['signed', tl.signed, tl.duration_months != null ? t('ud.monthsTerm', { n: ni.format(tl.duration_months) }) : null],
    ['end', tl.end, null]].filter((x) => x[1]);
  const lot = c && c.lot;
  const awards = (t0.awards || []).filter((a) => !lot || !a.lot || a.lot === lot);
  const amcu = (of) => { const x = cp[of] || {}; return x.n ? t('ud.amcuLine', { n: x.n, open: x.open || 0, upheld: x.upheld || 0 }) : (x.claims ? t('ud.claimsOnly', { n: x.claims }) : t('ud.none')); };
  if (!steps.length && !awards.length && pr.expected == null) return null;
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, t('ud.procurement')),
    h('div', { class: 'grid-2' },
      steps.length ? h('div', { class: 'timeline' }, steps.map(([k, d, extra]) => h('div', { class: 'ev' + (k === 'end' && (u.progress || {}).overdue_days ? ' bad' : '') },
        h('span', { class: 'd num' }, fdate(d)), h('span', null, t('ud.tl.' + k), extra ? h('span', { class: 'faint' }, ' · ' + extra) : null), h('span')))) : h('div'),
      kv([
        [t('ud.expected'), pr.expected != null ? money(pr.expected) : null],
        [t('ud.won'), pr.won != null ? join([money(pr.won), pr.below_expected_pct ? t('ud.belowExpected', { n: pr.below_expected_pct }) : null]) : null],
        [t('ud.now'), pr.now != null ? join([money(pr.now), pr.change ? t('ud.changed', { sum: money(pr.change), n: pr.change_pct }) : null]) : null],
        [t('ud.bidders'), (u.bidders || {}).bids != null ? String(u.bidders.bids) : t0.bids != null ? String(t0.bids) : null],
        [t('ud.amcuTd'), amcu('tender')],
        [t('ud.amcuEval'), amcu('award')],
      ])),
    awards.length ? [h('h3', { class: 'card-sub', style: 'margin-top:14px' }, t('dos.awards')), awardsTable(awards)] : null,
    priceCheckBlock(u.price_check),
    collusionBlock(u.collusion));
}
// Where the money comes from: the Cabinet's subvention for the project (or its community) by
// edition, and the procurement plan's sources.
function fundingCard(s, t0) {
  // Under a sub-project of the registry its subvention is shown there, once.
  const sp = typeof spOfTid === 'function' ? spOfTid(s.tid) : null;
  const sv = sp ? null : (s.undp || {}).subvention;
  const plans = t0.plan_info || [];
  const gs = (typeof guaranteesOfTid === 'function' ? guaranteesOfTid(s.tid) : null) || [];
  const adv = s.advance && s.advance.sum > 0 ? s.advance : null;
  if (!sv && !sp && !plans.length && !gs.length && !t0.guarantee && !adv && !(s.undp || {}).funding) return null;
  const eds = (sv && sv.editions) || [];
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, t('ud.funding')),
    sp ? h('p', { class: 'small muted' }, t('ud.subvInSp', { code: sp.code }), ' ', h('a', { href: '#/sp/' + encodeURIComponent(sp.code) + '/finance' }, t('ud.spOpen'))) : null,
    sv ? h('div', null,
      h('h3', { class: 'card-sub' }, sv.level === 'budget' ? t('ud.subvBudget') : t('ud.subv')),
      h('p', { class: 'small muted' }, join([sv.programme, sv.level === 'budget' ? sv.budget : sv.name])),
      h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, eds.map((e, i) => h('th', { class: 'r' }, (i ? t('ud.edition') : t('ud.original')) + ' ' + edFmt(e))))),
        h('tbody', null, h('tr', null, eds.map((e, i) => {
          const v = (sv.amounts || {})[e], prev = i ? (sv.amounts || {})[eds[i - 1]] : null;
          return h('td', { class: 'r num ' + (v == null ? 'faint' : prev != null && v < prev - 0.5 ? 'bad' : '') }, v == null ? '—' : ni.format(v) + ' ' + t('ud.thousand'));
        }))))),
      sv.url ? h('p', { class: 'small' }, h('a', { href: sv.url, target: '_blank', rel: 'noopener noreferrer' }, sv.nreg)) : null) : null,
    adequacyBlock((s.undp || {}).funding),
    plans.length ? [h('h3', { class: 'card-sub', style: 'margin-top:12px' }, t('plan.title')), planRows(plans)] : null,
    guaranteesBlock(t0, gs, adv));
}
// Is this year's subvention enough for what the contract will still need from the loan this year
// (the table's Funding Adequacy Status and Additional Funding Needs).
function adequacyBlock(f) {
  if (!f) return null;
  const cls = { insufficient: 'high', suspended: 'high', excess: 'low', adequate: 'ok' }[f.status] || '';
  return [h('h3', { class: 'card-sub', style: 'margin-top:12px' }, t('fa.title'),
      h('span', { class: 'sev ' + cls, style: 'margin-left:8px' }, t('fa.st.' + f.status))),
    kv([
      [t('fa.year'), money(f.year_subvention)],
      [t('fa.paidYear'), f.eib_paid_year != null ? h('span', null, money(f.eib_paid_year), f.util_pct != null ? h('span', { class: 'muted' }, ' · ' + f.util_pct + '%') : null) : h('span', { class: 'muted' }, t('fa.unknown'))],
      [t('fa.left'), f.left < 0 ? h('span', { class: 'bad' }, t('fa.over', { sum: money(-f.left) })) : money(f.left)],
      [t('fa.remaining'), money(f.remaining)],
      [t('fa.forecast'), h('span', null, money(f.forecast), h('span', { class: 'muted' }, ' · ' + t('fa.share', { pct: f.share_pct }) + (f.share_est ? ' ' + t('fa.est') : '')))],
      [t('fa.need'), f.need != null ? money(f.need) : null],
      [t('fa.gap'), f.gap > 0 ? h('b', { class: 'bad' }, money(f.gap)) : null],
    ]),
    h('p', { class: 'muted small' }, t('fa.hint'))];
}
// Guarantees: the bid security from Prozorro, the ones the team keeps in the registry, and
// whether the advance paid is covered by an advance repayment guarantee in force.
function guaranteesBlock(t0, gs, adv) {
  if (!gs.length && !t0.guarantee && !adv) return null;
  const live = gs.filter((g) => !g.closed);
  const cover = live.filter((g) => g.kind === 'advance' && (!g.until || g.until >= today())).reduce((x, g) => x + (g.amount || 0), 0);
  const kind = (k) => (typeof rt === 'function' ? rt('g_' + k) : k);
  return [h('h3', { class: 'card-sub', style: 'margin-top:12px' }, t('gu.title')),
    kv([
      [t('gu.bid'), t0.guarantee ? money(t0.guarantee.amount, t0.guarantee.currency) : null],
      ...live.map((g) => [kind(g.kind), h('span', null, join([g.amount != null ? money(g.amount) : null, g.bank, g.until ? t('gu.until', { date: fdate(g.until) }) : null]),
        g.until && g.until < today() ? h('span', { class: 'sev high', style: 'margin-left:6px' }, t('gu.expired')) : g.until && g.until <= addDays(today(), 30) ? h('span', { class: 'sev medium', style: 'margin-left:6px' }, t('gu.soon')) : null)]),
      [t('gu.advance'), adv ? h('span', { class: cover + 1 < adv.sum ? 'bad' : '' }, t(cover ? 'gu.advanceCover' : 'gu.advanceNoCover', { sum: money(adv.sum), cover: money(cover) })) : null],
    ]),
    !gs.length ? h('p', { class: 'muted small' }, t('gu.hint')) : null];
}
// The UNDP risk matrix: a rating per criterion with its reasons.
function matrixBlock(s) {
  const mx = (s.undp || {}).matrix;
  if (!mx) return null;
  // Under a sub-project of the registry its matrix is the one that counts; this one feeds it.
  const sp = spOfTid(s.tid);
  const spOverall = sp && typeof overallRating === 'function' ? overallRating(scoresOf(sp).scores) : null;
  return h('div', null,
    h('div', { class: 'drive-part-title' }, t('ud.matrix')),
    sp ? h('p', { class: 'notice small' }, t('ud.spMatrix', { code: sp.code }), spOverall ? ' ' + t('ud.spOverall', { n: spOverall }) : '', ' ',
      h('a', { href: '#/sp/' + encodeURIComponent(sp.code) + '/overview' }, t('ud.spOpen'))) : null,
    h('div', { class: 'checklist' }, UD_KEYS.map((k) => {
      const v = (mx.scores || {})[k];
      return h('div', { class: 'chk ' + (v === 3 ? 'bad' : v === 2 ? 'warn' : v === 1 ? 'ok' : 'na') },
        h('span', { class: 'chk-ico' }, v != null ? String(v) : '–'),
        h('div', null, h('b', null, t('ud.r.' + k)), h('div', { class: 'small muted' }, ((mx.why || {})[k] || []).map(udWhy).join(' · ') || (v == null ? t('ud.expert') : '—'))));
    })));
}

// Quick links to check a party: procurement, Treasury, registers and sanctions lists.
function partyLinks(code, role) {
  if (!realCode(code)) return null;
  const a = (href, text) => h('a', { class: 'chip-link', href, target: '_blank', rel: 'noopener noreferrer' }, text);
  return h('div', { class: 'ext-links' },
    a(`https://prozorro.gov.ua/search/tender?${role === 'supplier' ? 'supplier' : 'buyer'}=${code}`, 'Prozorro'),
    a(`https://dozorro.org/search?edrpou=${code}`, 'Dozorro'),
    h('a', { class: 'chip-link', href: '#/search', onclick: () => { state.search = Object.assign(state.search || {}, { edrpou: code, kind: 'contract', role: 'both', res: null, page: 0, from: state.search ? state.search.from : addDays(today(), -365), to: today() }); } }, 'spending.gov.ua'),
    a(`https://youcontrol.com.ua/catalog/company_details/${code}/`, 'YouControl'),
    a(`https://opendatabot.ua/c/${code}`, 'Opendatabot'),
    a(`https://www.opensanctions.org/search/?q=${code}`, 'OpenSanctions'));
}
// One State Audit Service monitoring: what it checked, what it found, what the buyer must do
// and by when, the correspondence and every file (open or download).
function monitoringBlock(m) {
  const fileRow = (d) => h('a', { class: 'doc', href: d.url, target: '_blank', rel: 'noopener noreferrer', download: '' },
    icon('file'), h('span', null, h('b', null, d.title), h('small', null, join([t('sasu.of.' + d.of), t('sasu.by.' + d.author), fdate(d.date)]))), icon('download'));
  const text = (title, body, open) => body ? h('details', { class: 'sasu-text', open: open || null }, h('summary', null, title), h('p', null, body)) : null;
  const types = (m.violation_types || []).map((x) => label('sasu.vt.', x)).concat(m.violation_other && !(m.violation_types || []).includes('other') ? [m.violation_other] : []);
  return h('div', { class: 'sasu-row ' + (m.violation ? 'bad' : '') },
    h('div', { class: 'card-head', style: 'margin-bottom:6px' },
      h('b', null, m.id),
      h('span', { class: 'tag ' + (m.violation ? 'bad' : m.status === 'declined' ? 'ok' : '') }, label('sasu.st.', m.status))),
    kv([
      [t('sasu.started'), join([fdate(m.date), m.period_end ? t('sasu.until', { d: fdate(m.period_end) }) : null])],
      [t('sasu.reasons'), (m.reasons || []).map((x) => label('sasu.r.', x)).join(', ')],
      [t('sasu.stages'), (m.stages || []).map((x) => label('sasu.s.', x)).join(', ')],
      [t('sasu.conclusionDate'), m.conclusion_published ? join([fdate(m.conclusion_published), m.conclusion_date && m.conclusion_date !== m.conclusion_published ? t('sasu.signed', { d: fdate(m.conclusion_date) }) : null]) : null],
      [t('sasu.violations'), m.violation === true ? types.join('; ') || t('sasu.found') : m.violation === false ? t('sasu.none') : null],
      [t('sasu.eliminationDue'), m.elimination_due ? fdate(m.elimination_due) : null],
      [t('sasu.eliminated'), m.elimination_date ? fdate(m.elimination_date) : null],
      // The service's verdict on the buyer's report, and an appeal of the conclusion in court.
      [t('sasu.resolution'), m.resolution && m.resolution.result ? h('span', { class: ['none', 'partly', 'not_eliminated'].includes(m.resolution.result) ? 'bad' : '' },
        join([label('sasu.res.', m.resolution.result) || m.resolution.result, m.resolution.date && fdate(m.resolution.date)])) : null],
      [t('sasu.appeal'), m.appeal ? join([m.appeal.date && fdate(m.appeal.date), m.appeal.case && t('sasu.case', { n: m.appeal.case }), m.appeal.case_date && fdate(m.appeal.case_date)]) || t('sasu.appealed') : null],
      [t('sasu.cancelled'), m.cancellation || null],
    ]),
    text(t('sasu.resolutionText'), m.resolution && m.resolution.text),
    text(t('sasu.appealText'), m.appeal && m.appeal.text),
    h('div', { class: 'row', style: 'margin:8px 0' },
      m.conclusion_pdf ? ext(m.conclusion_pdf, t('sasu.conclusionPdf'), 'btn btn-sm btn-dark') : null,
      m.url ? ext(m.url, t('sasu.onProzorro'), 'btn btn-sm') : null),
    text(t('sasu.conclusion'), m.conclusion, m.violation),
    text(t('sasu.obligations'), m.obligations, m.violation),
    text(t('sasu.findings'), m.findings),
    text(t('sasu.decision'), m.decision),
    text(t('sasu.elimination'), m.elimination),
    (m.posts || []).length ? h('details', { class: 'sasu-text' }, h('summary', null, t('sasu.posts', { n: m.posts.length })),
      h('div', { class: 'timeline' }, m.posts.map((p) => h('div', { class: 'ev ' + (p.author === 'sasu' ? 'add' : 'act') },
        h('span', { class: 'd num' }, fdate(p.date)),
        h('span', null, h('b', null, t('sasu.by.' + p.author) + ': '), p.title, p.due ? h('div', { class: 'cell-sub' }, t('sasu.due', { d: fdate(p.due) })) : null,
          p.text ? h('div', { class: 'cell-sub clamp' }, p.text) : null),
        h('span'))))) : null,
    (m.docs || []).length ? h('div', { style: 'margin-top:8px' }, h('div', { class: 'drive-part-title' }, t('sasu.files', { n: m.docs.length })), h('div', { class: 'doc-list' }, m.docs.map(fileRow))) : null);
}
const dreamUrl = (id) => `https://dream.gov.ua/ua/project/${encodeURIComponent(id)}/profile`;

// A procurement on control (no contract yet, or contracts not taken on control themselves).
function tenderDossier(id, s, pick) {
  const t0 = s.tender;
  const seen = getTrackedSeen();
  const events = (s.history || []).filter((e) => e.type !== 'tracked');
  const org = { edrpou: t0.buyer, name: t0.buyer_name, role: 'buyer' };
  const off = isTracked(id) ? h('button', { class: 'btn btn-sm', onclick: async () => {
    if (!confirm(t('tr.offConfirm'))) return;
    try { await cloud.untrack(id); if (typeof regNoTrack === 'function') regNoTrack(id, (trackedRow(id) || {}).tid); location.hash = backTo((trackedRow(id) || {}).tid); } catch (e) { toast(e.message, { bad: true }); }
  } }, t('tr.off')) : null;
  return [
    h('div', { class: 'org-head' },
      h('div', null,
        backRow(backTo(s.tid)),
        h('h1', { class: 'org-title' }, t('tr.tenderHeading', { tid: s.tid })),
        h('div', { class: 'chips' }, pzStatus(t0.status), t0.method ? h('span', { class: 'tag' }, label('pzt.', t0.method)) : null,
          s.eib ? h('span', { class: 'tag eib' }, t('eib.kind.' + s.eib)) : null, riskChip(s)),
        h('p', { class: 'muted' }, t0.title)),
      h('div', { class: 'org-actions' }, h('div', { class: 'row' }, ext(pzUrl(s.tid), 'Prozorro', 'btn'), t0.dream_id ? ext(dreamUrl(t0.dream_id), 'DREAM', 'btn') : null), off)),
    h('div', { class: 'card pad section parties' },
      h('div', { class: 'party' }, h('small', null, t('dos.buyer')), h('b', null, t0.buyer_name || '—'), t0.buyer ? h('div', { class: 'cell-sub num' }, t('f.edrpou') + ' ' + t0.buyer) : null, partyLinks(t0.buyer, 'buyer')),
      h('div', { class: 'party' }, h('small', null, t('pz.colValue')), h('b', { class: 'num' }, t0.value ? money(t0.value.amount, t0.value.currency) : '—'),
        h('div', { class: 'cell-sub' }, join([t0.deadline ? t('pz.deadline') + ' ' + fdate(t0.deadline) : null, t0.bids != null ? t('pz.bids') + ': ' + t0.bids : null])))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('kinds.contract')),
      (t0.contracts || []).length ? h('div', { class: 'qs-contracts' }, t0.contracts.map((c) => h('div', { class: 'qs-contract' },
        h('div', null, h('b', null, t('dos.heading', { n: c.number || '—', date: fdate(c.signed) })),
          h('div', { class: 'cell-sub' }, join([(c.suppliers || []).map((x) => x.name).join(', '), c.value ? money(c.value.amount, c.value.currency) : null, label('pzc.', c.status)]))),
        h('span', { class: 'small muted' }, c.status === 'pending' ? t('tr.autoContract') : label('pzc.', c.status))))) : h('p', { class: 'muted small' }, t('tr.noContractsYet'))),
    procurementCard(s, null),
    rulesCard(s),
    fundingCard(s, t0),
    complianceCard(s),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('tr.history')),
      events.length ? h('div', { class: 'timeline' }, events.map((e) => h('div', { class: 'ev ' + eventClass(e) + (e.at > seen ? ' new' : '') },
        h('span', { class: 'd num' }, fdate(e.at)), h('span', null, eventText(e)), h('span')))) : h('p', { class: 'muted small' }, t('dos.noEvents'))),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('pz.tenderDocs')), docList(t0.docs)),
    isTracked(id) ? shareCard(id) : null,
  ];
}

// The two sides of a contract and whether each organisation is on monitoring (its own
// contracts, payments and procurement in the app), apart from this one contract on control.
function partiesCard(t0, c) {
  const sup = (c.suppliers || [])[0] || {};
  // The buyer and the contractor; the contractor's name opens its inspector (ЄДР, owners, sanctions, its contracts).
  const side = (key, name, code, role) => h('div', { class: 'party' },
    h('small', null, t(key)),
    h('b', null, role === 'supplier' && code && typeof contractorLink === 'function' ? contractorLink(name, code, typeof spOfTid === 'function' ? spOfTid(t0.tid) : null) : name || '—'),
    code ? h('div', { class: 'cell-sub num' }, t('f.edrpou') + ' ' + code) : null,
    partyLinks(code, role));
  return h('div', { class: 'card pad section parties' },
    side('dos.buyer', t0.buyer_name, t0.buyer, 'buyer'),
    side('dos.supplier', sup.name, sup.code, 'supplier'));
}

// Is the price right: against similar EIB procedures, the law's abnormally low price, the plan,
// and what supervision costs against the works.
function priceCheckBlock(pc) {
  if (!pc) return null;
  const p = pc.peers, b = pc.bids, pl = pc.plan;
  const pct = (x) => ni.format(x) + '%';
  return [h('h3', { class: 'card-sub', style: 'margin-top:14px' }, t('pc.title')),
    kv([
      [t('pc.discount'), p ? h('span', null, h('b', null, pct(p.discount)), h('span', { class: 'muted' }, ' · ' + t('pc.peers', { median: pct(p.median), n: p.n, cpv: p.cpv })),
        h('div', { class: 'small muted' }, t('pc.rank', { pct: p.rank_pct }))) : null],
      [t('pc.bids'), b && b.amounts && b.amounts.length > 1 ? h('span', null, b.amounts.map((x) => money(x)).join(' · '),
        b.under_next_pct != null ? h('div', { class: 'small muted' }, t('pc.under', { next: pct(b.under_next_pct), mean: pct(b.under_mean_pct) })) : null,
        b.abnormal ? h('div', null, h('span', { class: 'sev ' + (b.justified ? 'medium' : 'high') }, t(b.justified ? 'pc.abnormalJ' : 'pc.abnormal'))) : null) : null],
      [t('pc.plan'), pl ? h('span', null, money(pl.amount), pl.over_pct ? h('span', { class: 'sev medium', style: 'margin-left:6px' }, t('pc.overPlan', { pct: pct(pl.over_pct) })) : null) : null],
      [t('pc.supervision'), pc.supervision ? t('pc.share', { sum: money(pc.supervision.amount), pct: pct(pc.supervision.pct) }) : null],
      [t('pc.author'), pc.author ? t('pc.share', { sum: money(pc.author.amount), pct: pct(pc.author.pct) }) : null],
    ]),
    h('p', { class: 'muted small' }, t('pc.hint'))];
}

// The programme's own rules (ПВУ III guidelines, the Procurement Manual and the model tender
// documents): what the data show broken, what to look at, what to see in the documents, what holds.
function rulesCard(s) {
  const rl = (s.undp || {}).rules;
  const meta = rl && !Array.isArray(rl) ? rl : {};
  const list = Array.isArray(rl) ? rl : (rl || {}).items;
  if (!list || !list.length) return null;
  const pct = (x) => (x == null ? '—' : ni.format(x) + '%');
  const eur = (x) => (x == null ? '—' : '≈ ' + money(Math.round(x), 'EUR'));
  const meth = (m) => (m ? label('pzt.', m) : '—');
  const text = (x) => {
    const p = x.p || {}, k = x.key, st = x.st;
    const who = (want) => (p.who || []).filter((w) => !want || want.includes(w.st)).map((w) => orgShort(w.name || w.code) + (w.tid ? ' (' + w.tid + ')' : '')).join('; ');
    const v = { days: p.days, min: p.min, max: p.max != null ? ni.format(p.max) : '—', method: meth(p.method), eur: eur(p.eur), limit: eur(p.limit),
      amount: money(p.amount), pct: pct(p.pct), award: fdate(p.award), signed: fdate(p.signed), tids: (p.tids || []).join(', '),
      name: p.name || '—', tid: p.tid || '', registered: fdate(p.registered), years: p.years != null ? ni.format(p.years) : '—',
      best: p.best != null ? money(p.best) : '—', cid: p.cid || '', need: money(p.need), on: fdate(p.on), n: p.n, total: money(p.total),
      avg: money(p.avg), code: p.code || '', sum: money(p.sum), within: p.within, years_l: p.years,
      progs: p.urp3 ? t('rl.progs3') : t('rl.progs2'), closed: fdate(p.closed), until: fdate(p.until), covered: p.covered != null ? p.covered : '—' };
    let key = k + '.' + st;
    if (k === 'method') key = st === 'ok' ? (p.limit && p.eur >= p.limit ? 'method.okIntl' : p.eur != null ? 'method.ok' : 'method.okNoEur')
      : (['negotiation', 'negotiation.quick', 'reporting'].includes(p.method) ? (p.small ? 'method.direct' : 'method.nonComp') : 'method.intl');
    else if (k === 'bid_security' && (st !== 'ok' || p.optional)) key = p.amount ? 'bid_security.over' : p.optional ? 'bid_security.optional' : 'bid_security.none';
    else if (k === 'standstill' && st !== 'ok') key = p.late ? 'standstill.late' : p.single ? 'standstill.single' : 'standstill.early';
    else if (/_independent$/.test(k)) {
      const sts = (p.who || []).map((w) => w.st);
      key = 'indep.' + (sts.includes('same') ? 'same' : sts.includes('linked') ? 'linked' : sts.includes('nodata') ? 'nodata' : 'ok');
      v.name = who(key === 'indep.ok' ? null : [key.slice(6)]);
    }
    else if (/_share$/.test(k)) key = 'share.' + st;
    else if (k === 'similar' && st !== 'ok') key = p.count_only ? 'similar.count' : p.best != null ? 'similar.check' : 'similar.none';
    else if (k === 'overload') { key = p.n ? 'overload.found' : 'overload.none'; v.years = p.years || 5; }
    else if (k === 'pacts' && st !== 'ok') { v.missing = [p.integrity ? null : t('rl.pact.integrity'), p.es ? null : t('rl.pact.es')].filter(Boolean).join(t('rl.and')); }
    else if (k === 'advance_guarantee') key = p.by_contract ? 'advance_guarantee.contract' : p.closed ? 'advance_guarantee.closed' : 'advance_guarantee.open';
    let out = t('rl.d.' + key, v);
    if (k === 'overload' && p.avg != null && p.total && p.avg < p.need) out += ' ' + t('rl.d.overload.low', v);
    return out;
  };
  const row = (x) => {
    const cls = x.st === 'ok' ? 'ok' : x.st === 'bad' ? 'bad' : x.level === 'low' ? 'na' : 'warn';
    const p = x.p || {};
    return h('div', { class: 'chk ' + cls },
      h('span', { class: 'chk-ico' }, x.st === 'ok' ? '✓' : x.st === 'bad' ? '!' : x.level === 'low' ? '·' : '?'),
      h('div', null, h('b', null, t('rl.k.' + x.key)), h('div', { class: 'small muted' }, text(x)),
        p.older ? h('div', { class: 'small faint' }, t('rl.older', { date: fdate(p.older) })) : null,
        x.key === 'overload' && (p.list || []).length ? h('div', { class: 'small', style: 'margin-top:4px' }, p.list.map((c) => h('div', { class: 'num' },
          h('a', { href: pzUrl(c.tid), target: '_blank', rel: 'noopener noreferrer' }, c.tid), ' · ', join([c.number ? '№ ' + c.number : null, fdate(c.signed), money(c.value)])))) : null));
  };
  const bad = list.filter((x) => x.st === 'bad'), look = list.filter((x) => x.st === 'check' && x.level !== 'low'),
    low = list.filter((x) => x.st === 'check' && x.level === 'low'), ok = list.filter((x) => x.st === 'ok');
  const group = (title, items) => (items.length ? [h('div', { class: 'drive-part-title', style: 'margin-top:14px' }, title), h('div', { class: 'checklist' }, items.map(row))] : null);
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('rl.title')),
      h('div', { class: 'row' }, bad.length ? h('span', { class: 'sev high' }, t('rl.nBad', { n: bad.length })) : null,
        look.length ? h('span', { class: 'sev medium' }, t('rl.nLook', { n: look.length })) : null,
        !bad.length && !look.length ? h('span', { class: 'sev ok' }, t('rl.allOk')) : null)),
    h('p', { class: 'muted small' }, meta.edition ? join([meta.programme ? t('rl.prog.' + meta.programme) + (meta.tranche ? ', ' + t('rl.tranche', { t: meta.tranche }) : '') : null, t('rl.ed.' + meta.edition)], ' · ') : t('rl.ed.urp3_2026')),
    meta.edition && !meta.programme ? h('p', { class: 'notice small' }, t('rl.progUnknown')) : null,
    group(t('rl.g.bad'), bad), group(t('rl.g.look'), look), group(t('rl.g.low'), low),
    ok.length ? h('details', { class: 'rules-ok', style: 'margin-top:14px' }, h('summary', { class: 'drive-part-title' }, t('rl.g.ok', { n: ok.length })),
      h('div', { class: 'checklist' }, ok.map(row))) : null,
    h('p', { class: 'muted small', style: 'margin-top:12px' }, t('rl.hint')));
}

// A company's name with its legal form shortened: "ТОВ «Технаглядбуд»".
const LEGAL_FORMS = [[/товариство\s+з\s+обмеженою\s+відповідальн\S*/i, 'ТОВ'], [/приватне\s+підприємство/i, 'ПП'], [/фізична\s+особа[\s-]+підприємець/i, 'ФОП'],
  [/акціонерне\s+товариство/i, 'АТ'], [/комунальне\s+підприємство/i, 'КП'], [/державне\s+підприємство/i, 'ДП']];
const orgShort = (name) => LEGAL_FORMS.reduce((s, [rx, to]) => s.replace(rx, to), String(name || '').replace(/\u00ad/g, '')).replace(/\s+/g, ' ').trim();

// Signs of collusion between bidders and of a link with the buyer, read from the bids.
function collusionBlock(list) {
  if (!list) return null;
  const nm = (name, code) => name || code || '—';
  const order = { high: 0, medium: 1, low: 2 };
  const items = list.slice().sort((a, b) => order[a.level] - order[b.level]);
  return [h('h3', { class: 'card-sub', style: 'margin-top:14px' }, t('co.title')),
    items.length ? h('div', { class: 'checklist' }, items.map((f) => h('div', { class: 'chk ' + (f.level === 'high' ? 'bad' : f.level === 'medium' ? 'warn' : 'na') },
      h('span', { class: 'chk-ico' }, f.level === 'high' ? '!' : f.level === 'medium' ? '?' : '·'),
      h('div', null, h('b', null, t('co.k.' + f.kind)),
        h('div', { class: 'small muted' }, t('co.d.' + f.kind, { a: nm(f.a_name, f.a), b: nm(f.b_name, f.b), v: f.value || '', what: f.value ? t('co.what.' + f.value) : '' }))))))
      : h('p', { class: 'muted small' }, t('co.none')),
    h('p', { class: 'muted small' }, t('co.hint'))];
}

// The contractor's legal standing: the state register, sanctions lists, AMCU bid-rigging decisions.
function legalBox(lg) {
  lg = lg || {};
  const e = lg.edr, ck = lg.checked || {};
  const stanBad = e && e.stan && !/^зареєстровано/.test(e.stan);
  const asOf = [ck.edr_at, ck.sanctions_at].filter(Boolean).sort().pop();
  return h('div', { class: 'cp-box' },
    h('h3', { class: 'card-sub' }, t('lg.title'), asOf ? h('span', { class: 'cp-asof' }, t('ui.asOf', { date: fdate(asOf.slice(0, 10)) })) : null),
    kv([
      [t('lg.edr'), e ? h('span', null, h('b', { class: stanBad ? 'bad' : '' }, e.stan || '—'),
        e.registered ? h('span', { class: 'muted' }, ' · ' + t('lg.since', { date: fdate(e.registered) })) : null,
        e.terminating ? h('div', { class: 'small bad' }, join([fdate(e.terminating.date), e.terminating.reason])) : null,
        e.bankruptcy ? h('div', { class: 'small bad' }, join([fdate(e.bankruptcy.date), e.bankruptcy.reason])) : null)
        : h('span', { class: 'muted' }, lg.edr_missing ? t('lg.notFound') : t('lg.notYet'))],
      [t('lg.owners'), e ? join([e.capital != null ? t('lg.capital', { sum: money(e.capital) }) : null,
        e.founders ? t('lg.founders', { n: e.founders }) : null,
        e.ubo_absent ? t('lg.uboAbsent') : e.beneficiaries ? t('lg.ubo', { n: e.beneficiaries }) : null,
        (e.citizenship || []).length ? t('lg.foreign', { list: e.citizenship.join(', ') }) : null]) : null],
      [t('lg.sanctions'), lg.sanctions == null ? h('span', { class: 'muted' }, t('lg.notYet'))
        : lg.sanctions.length ? h('div', null, lg.sanctions.map((x) => h('div', { class: 'small bad' }, h('b', null, x.list), ' — ', x.name)))
        : h('span', null, t('lg.cleanShort'), h('div', { class: 'cell-sub' }, t('lg.lists')))],
      [t('lg.amcu'), lg.amcu == null ? h('span', { class: 'muted' }, t('lg.amcuNa'))
        : lg.amcu.length ? h('div', null, lg.amcu.map((x) => h('div', { class: 'small bad' }, join([x.decision, fdate(x.date), x.body]))))
        : t('lg.amcuClean')],
    ]));
}

// Who is building: the contractor across Prozorro (volume by year, what it has on its hands, whom it
// works for), its other EIB contracts and contracts on control, with what went wrong there.
function contractorCard(s, c) {
  const sup = (c.suppliers || [])[0] || {};
  const code = sup.code;
  if (!code || !/^\d{8}$/.test(code)) return null;
  const box = h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('cp.title')), h('p', { class: 'muted small' }, t('ui.loading')));
  (async () => {
    let p = null;
    try { p = await getJSON('data/contractors/' + code + '.json', ver()); } catch (e) { /* not built yet */ }
    const lg = (s.undp || {}).legal;
    // Its other contracts with a serious signal, without the one at hand; one line per contract.
    const seen = new Set(), others = [];
    for (const x of [...((p || {}).tracked || []).filter((x) => x.key !== s.key), ...((p || {}).eib || []).filter((x) => x.tid !== s.tid)]) {
      const k = x.number || x.tid || x.key;
      if (seen.has(k)) continue;
      seen.add(k); others.push(x);
    }
    const bad = others.filter((x) => (x.bad || []).length);
    const fl = Object.fromEntries(((p || {}).flags || []).map((f) => [f.kind, f.level]));
    // Everything to look at, in one row under the name.
    const chips = [
      ...((lg || {}).flags || []).map((f) => h('span', { class: 'sev ' + f.level }, t('lg.f.' + f.kind))),
      fl.overloaded ? h('span', { class: 'sev ' + fl.overloaded }, t('cp.overloaded', { x: p.load })) : null,
      fl.newcomer ? h('span', { class: 'sev medium' }, t('cp.newcomer', { y: p.first_year })) : null,
      bad.length ? h('span', { class: 'sev ' + (bad.length >= 2 ? 'high' : 'medium') }, t('cp.troubled', { n: bad.length })) : null,
    ].filter(Boolean);
    const market = p ? h('div', { class: 'cp-box' },
      h('h3', { class: 'card-sub' }, t('cp.market'), p.built_at ? h('span', { class: 'cp-asof' }, t('ui.asOf', { date: fdate(String(p.built_at).slice(0, 10)) })) : null),
      kv([
        [t('cp.total'), h('span', null, t('cp.totalShort', { n: p.total, sum: money(p.value) }), h('div', { class: 'cell-sub' }, t('cp.since', { y: p.first_year || '—' }) + (p.truncated ? ' · ' + t('cp.truncated', { n: p.read }) : '')))],
        [t('cp.active'), p.active.n ? h('span', null, t('cp.activeShort', { n: p.active.n, sum: money(p.active.value) }),
          h('div', { class: 'cell-sub' }, join([t('cp.signedSince', { y: p.active.since }), p.load ? t('cp.load', { x: p.load, avg: money(p.avg_year) }) : null])))
          : h('span', { class: 'muted' }, t('cp.activeNone', { y: p.active.since }))],
        [t('cp.buyers'), h('span', null, t('cp.buyersShort', { n: p.buyers_n }),
          h('div', { class: 'cp-buyers' }, (p.buyers || []).slice(0, 3).map((b) => h('div', null, h('span', { class: 'clamp1' }, b.name), h('span', { class: 'num muted' }, b.n + ' · ' + mshort(b.value))))))],
      ]),
      (p.years || []).length ? (() => {
        const maxY = Math.max(1, ...p.years.map((y) => y.value));
        return h('div', { class: 'cp-years' }, p.years.slice().reverse().map((y) => h('div', { class: 'cp-year', title: money(y.value) },
          h('i', { style: 'height:' + Math.max(3, Math.round(y.value / maxY * 44)) + 'px' }), h('b', null, y.y), h('small', null, y.n))));
      })() : null)
      : h('div', { class: 'cp-box' }, h('h3', { class: 'card-sub' }, t('cp.market')), h('p', { class: 'muted small' }, t('cp.none')));
    fill(box,
      h('div', { class: 'card-head' }, h('div', null, h('h2', { class: 'card-title' }, t('cp.title')),
        h('div', { class: 'cp-name' }, h('b', null, (p && p.name) || sup.name || code), h('span', { class: 'muted num' }, ' · ' + code)))),
      chips.length ? h('div', { class: 'chips', style: 'margin-top:8px' }, chips) : null,
      h('div', { class: 'cp-grid' }, legalBox(lg), market),
      others.length ? [h('h3', { class: 'card-sub', style: 'margin-top:14px' }, t('cp.others', { n: others.length })),
        h('div', { class: 'ev-feed' }, others.slice(0, 10).map((x) => h(x.key ? 'a' : 'div', Object.assign({ class: 'ev-row' + ((x.bad || []).length ? ' bad' : '') }, x.key ? { href: '#/tracked/' + x.key } : {}),
          h('span', { class: 'd num' }, x.number || '—'),
          h('span', null, x.buyer || x.tid || '', x.value ? h('span', { class: 'faint small' }, ' · ' + money(x.value)) : null,
            (x.bad || []).length ? h('div', { class: 'small bad' }, x.bad.map((b) => (t('sigtype.' + b) !== 'sigtype.' + b ? t('sigtype.' + b) : udWhy(b))).join(' · ')) : null),
          h('span'))))] : h('p', { class: 'muted small', style: 'margin-top:12px' }, t('cp.noOthers')));
  })();
  return box;
}

// Documents of the contract in the same three parts as its folder on Google Drive.
const isChangeDoc = (d) => d.type === 'contractAnnexe' || /(^|[^а-яіїєґ])(ду(?=[\s\d№_.-])|д\/у|дод\.?\s*угод|додатков|змін)/i.test(d.title || '');
function docsCard(id, c, t0, fresh) {
  const parts = [
    ['contract', (c.docs || []).filter((d) => !isChangeDoc(d))],
    ['changes', (c.docs || []).filter(isChangeDoc)],
    ['tender', t0.docs || []],
  ];
  const on = driveState.connected;
  return h('div', { class: 'card pad section' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, t('dos.docs')),
      h('div', { class: 'row' },
        on ? [h('button', { class: 'btn btn-sm', onclick: () => driveAction('open', id) }, icon('drive'), t('drv.contractFolder')),
          h('button', { class: 'btn btn-sm btn-dark', onclick: () => driveAction('copy', id) }, icon('refresh'), t('drv.copyNow'))]
          : h('button', { class: 'btn btn-sm btn-dark', onclick: connectDrive }, icon('drive'), t('gs.connect')))),
    h('p', { class: 'muted small' }, on ? t('drv.note') : t('gs.lead')),
    h('div', { class: 'grid-3' }, parts.map(([k, list]) => h('div', { class: 'drive-part' },
      h('div', { class: 'drive-part-title' }, t('drv.part.' + k), h('span', { class: 'count' }, list.length)),
      docList(list, fresh)))));
}

// A payment's full Treasury record.
async function openPayment(p, org) {
  let data = p.tx;
  if (!data && org) {
    try { const [rec] = await findRecords(org, 'transaction', [p.id]); data = rec && rec.data; } catch (e) { /* not loaded */ }
  }
  openRecord({ kind: 'transaction', date: p.date, amount: p.amount, currency: 'UAH', cp_name: (data && data.recipt_name) || null,
    data: data || { trans_date: p.date, payment_details: p.purpose, kekv: p.kekv } });
}

// Who else sees this contract: share it by e-mail with another registered user.
function shareCard(id) {
  const t1 = state.mine.tracked.get(id) || {};
  const email = h('input', { class: 'input', type: 'email', placeholder: t('tr.shareHint'), autocomplete: 'off', 'aria-label': t('tr.shareHint') });
  const msg = h('p', { class: 'small', role: 'status' });
  const send = h('button', { class: 'btn btn-dark btn-sm', type: 'submit' }, t('tr.share'));
  const form = h('form', { class: 'add-form', onsubmit: async (e) => {
    e.preventDefault();
    const v = email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { fill(msg, t('tr.shareBad')); return; }
    send.disabled = true;
    try {
      const to = await cloud.share(id, v);
      email.value = '';
      fill(msg, t('tr.shareDone', { who: to.name || v }));
    } catch (err) {
      fill(msg, err.code === 'not-found' ? t('tr.shareNotFound') : err.code === 'self' ? t('tr.shareSelf') : t('tr.shareFailed') + ' ' + (err.message || ''));
    } finally { send.disabled = false; }
  } }, email, send);
  const list = (t1.sharedWith || []);
  return h('div', { class: 'card pad section' },
    h('h2', { class: 'card-title' }, t('tr.shareTitle')),
    h('p', { class: 'muted' }, t('tr.shareText')),
    form, msg,
    list.length ? h('div', { class: 'share-list' }, list.map((w) => h('div', { class: 'share-row' },
      h('span', null, h('b', null, w.name || w.email), w.name ? h('span', { class: 'faint small' }, ' ' + w.email) : null),
      h('button', { class: 'btn btn-sm', onclick: async () => {
        try { await cloud.unshare(id, w.uid); toast(t('tr.unshared')); } catch (e) { toast(e.message, { bad: true }); }
      } }, t('tr.unshare'))))) : h('p', { class: 'faint small' }, t('tr.notShared')));
}
