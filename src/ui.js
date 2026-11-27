// The shell (header, navigation, bell), shared pieces (tables, pills, filters) and sheets.
'use strict';

// ---- shell -------------------------------------------------------------------------------------

// Five sections; the bell (notifications) and the avatar (settings) sit in the header.
// Two sections: find (one search over every source) and follow (what was added, with the
// bell for its changes). Settings sit behind the avatar.

function badgeFor(key) {
  if (key === 'signals' && typeof spSignalCount === 'function') { const n = spSignalCount(); return n ? h('em', { class: 'count', title: t('nav.sigUnseen') }, n) : null; }
  return null;
}

function bellButton(route) {
  const n = bellCount();
  const label = isTeam() ? t('ntf.remindTip') : t('ntf.title');
  return h('a', { class: 'bell' + (route === 'reminders' ? ' on' : ''), href: '#/reminders', title: label, 'aria-label': label + (n ? ' (' + n + ')' : '') },
    icon('bell'), n ? h('em', { class: 'count' }, n > 99 ? '99+' : n) : null);
}

function accountButton() {
  const u = state.user;
  if (!u) return null;
  const pic = u.photoURL ? h('img', { src: u.photoURL, alt: '', referrerpolicy: 'no-referrer' }) : h('span', null, (u.displayName || u.email || '?').slice(0, 1).toUpperCase());
  return h('a', { class: 'avatar', href: '#/settings', title: join([u.displayName, u.email], ' · '), 'aria-label': t('nav.settings') }, pic);
}

// The sections: the sub-project registry only for the people on its access list.
// For the team the sub-project leads: sub-projects → contracts on control → the portfolio; search stays.
const navItems = () => (typeof hasRegistry === 'function' && hasRegistry()
  ? [['#/', 'home', 'building', 'nav.sps'], ['#/signals', 'signals', 'pulse', 'nav.signals'], ['#/portfolio', 'portfolio', 'chart', 'nav.portfolio'], ['#/search', 'search', 'search', 'nav.search']]
  : [['#/', 'home', 'building', 'nav.sps']]);
// ---- back ----------------------------------------------------------------------------------------
//
// Where one came from: the screens visited since the last section of the menu, one entry per level
// (a sub-project's tabs are one level, its procurement another, a contract another). "Back" leads to
// the level before; opened straight from a link, to the screen above it.
const NAV = [];
const TOP_LEVELS = ['', 'signals', 'portfolio', 'search', 'reminders', 'settings'];
const navClean = (hash) => (hash || '#/').split('#').slice(0, 2).join('#') || '#/';
function navLevel(hash) {
  const p = navClean(hash).replace(/^#\/?/, '').split('/');
  if (p[0] === 'sp' && p[1]) return p[2] === 'procurement' && p[3] ? 'sp/' + p[1] + '/procurement/' + p[3] : 'sp/' + p[1];
  if (p[0] === 'tracked' && p[1]) return 'tracked/' + p[1];
  return p[0] || '';
}
function navNote(hash) {
  const lv = navLevel(hash), at = navClean(hash);
  if (TOP_LEVELS.includes(lv)) { NAV.length = 0; NAV.push({ lv, at }); return; }
  const i = NAV.findIndex((x) => x.lv === lv);
  if (i >= 0) { NAV.length = i + 1; NAV[i].at = at; } else NAV.push({ lv, at });
}
// What a screen is called on the button: the menu's own names, the sub-project's code and tab.
function navLabel(hash) {
  const p = navClean(hash).replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
  if (p[0] === 'sp' && p[1]) {
    if (p[2] === 'procurement' && p[3]) return p[1] + ' · ' + (typeof rt === 'function' ? rt('tab_procurement') : '');
    return p[2] && p[2] !== 'overview' && typeof rt === 'function' ? p[1] + ' · ' + rt('tab_' + p[2]) : p[1];
  }
  if (p[0] === 'tracked') return t('dos.crumb');
  const top = { '': 'nav.sps', signals: 'nav.signals', portfolio: 'nav.portfolio', search: 'nav.search', reminders: 'ntf.remind', settings: 'nav.settings' }[p[0]];
  return t(top || 'nav.sps');
}
// The button itself, at the top of every screen below a section of the menu; `up` is the screen
// above this one, for when nothing was visited before it.
function backButton(up) {
  const prev = NAV.length > 1 && NAV[NAV.length - 1].lv === navLevel(location.hash) ? NAV[NAV.length - 2].at : navClean(up || '#/');
  return h('a', { class: 'btn back-btn', href: prev, title: t('ui.backTo', { to: navLabel(prev) }) },
    icon('back'), h('span', null, t('ui.back')), h('span', { class: 'back-to' }, navLabel(prev)));
}

// The row at the top of a screen below the menu: the button, then where one is (the crumbs).
const backRow = (up, crumbs) => h('div', { class: 'back-row' }, backButton(up), crumbs || null);

function shell(route, page) {
  const last = state.index.runs && state.index.runs[0];
  const failed = last && last.orgs_failed;
  const link = ([href, key, ico, label]) => h('a', { href, class: route === key ? 'on' : '' }, icon(ico), h('span', null, t(label)), badgeFor(key));
  return [
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('header', { class: 'top' }, h('div', { class: 'wrap top-inner' },
      h('a', { class: 'brand', href: '#/' },
        logo(),
        h('span', null, h('b', null, t('app.name')), h('small', null, t('app.tagline')))),
      h('nav', { class: 'nav', 'aria-label': t('nav.label') }, navItems().map(link)),
      h('div', { class: 'top-meta' },
        h('span', { class: 'chip' + (failed ? ' warn' : ''), title: last ? t('top.lastCheck', { at: ftime(last.finished_at) }) : '' }, h('i'), last ? ftime(last.finished_at).slice(0, 5) + ' ' + ftime(last.finished_at).slice(11) : '—'),
        langSwitch(),
        bellButton(route),
        accountButton()))),
    h('main', { class: 'page' }, h('div', { class: 'wrap' }, page)),
    h('footer', { class: 'foot-meta wrap' }, h('span', null, t('app.name'), ' · ', h('a', { href: '#/settings' }, 'v' + APP.version)), h('span', null, t('foot.data'))),
    // Phone layout: the same five sections at the bottom.
    h('nav', { class: 'tabbar', 'aria-label': t('nav.label'), style: '--tabs:' + navItems().length },
      navItems().map(([href, key, ico, label]) => h('a', { href, class: route === key ? 'on' : '' }, icon(ico), h('span', null, t(key === 'eib' ? 'eib.short' : label)), badgeFor(key)))),
  ];
}

// A button that opens a short list of actions (the less frequent ones of a page). Native <details>:
// keyboard and screen readers work as they are; a click elsewhere or Escape closes it.
// items: [label, onclick, icon, hint] or null.
function actionMenu(label, items, ico) {
  const pop = h('div', { class: 'menu-pop', role: 'menu' });
  // With no label it is an icon button ("⋯"), its own sign enough; with one, a caret says it opens.
  const d = h('details', { class: 'menu' }, h('summary', { class: 'btn' + (label ? '' : ' btn-icon'), 'aria-haspopup': 'menu', 'aria-label': label || t('ui.more') }, ico ? icon(ico) : null, label || null, label ? icon('chevron') : null), pop);
  for (const it of items.filter(Boolean)) {
    const [text, onclick, ic, hint] = it;
    pop.append(h('button', { class: 'menu-item', role: 'menuitem', type: 'button', onclick: () => { d.open = false; onclick(); } },
      ic ? icon(ic) : h('span', { class: 'ico' }), h('span', null, h('b', null, text), hint ? h('small', null, hint) : null)));
  }
  return d;
}
document.addEventListener('click', (e) => { document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; }); });

// Search and its filter fields: in one row on a wide screen; on a phone the search and a "Filters (n)"
// button, the fields opening under it.
function filterBar(search, fields, active) {
  const box = h('div', { class: 'filter-fields' }, fields);
  const toggle = h('button', { class: 'btn filter-toggle', type: 'button', 'aria-expanded': 'false', onclick: () => {
    const open = box.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  } }, t('ui.filters'), active ? h('em', { class: 'count' }, active) : null);
  return h('div', { class: 'table-tools filters' }, search, toggle, box);
}

function pageHead(eyebrow, title, lead, side) {
  return h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'eyebrow' }, eyebrow), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null),
    side || null);
}
const titleGrad = (a, b) => [h('span', null, a + ' '), h('span', { class: 'grad' }, b)];

// ---- shared pieces ------------------------------------------------------------------------

function select(options, value, onchange, label) {
  const el = h('select', { class: 'select', onchange, 'aria-label': label }, options.map(([v, text]) => h('option', { value: v }, text)));
  el.value = value;
  return el;
}

function pills(options, value, onpick) {
  const box = h('div', { class: 'pills', role: 'tablist' });
  const draw = (cur) => fill(box, options.map(([v, label, count]) => h('button', {
    class: v === cur ? 'on' : '', role: 'tab', 'aria-selected': v === cur, onclick: () => { draw(v); onpick(v); },
  }, label, count != null ? h('em', { class: 'count' }, count) : null)));
  draw(value);
  return box;
}

// Tables carry data-label on every cell so phones can show each row as a card.
const td = (label, attrs, ...kids) => h('td', Object.assign({ 'data-label': label }, attrs || {}), ...kids);

function itemsTable(items, opts) {
  if (!items.length) return h('div', { class: 'empty' }, h('b', null, opts.emptyTitle || t('empty.title')), opts.emptyText || t('empty.text'));
  const L = { date: t('col.date'), type: t('col.type'), org: t('col.org'), party: t('col.party'), text: t('col.description'), sum: t('col.amount') };
  const rows = items.map((it) => {
    const incoming = it.kind === 'transaction' && it.role === 'recipient';
    return h('tr', { class: 'click' + (opts.marks && isNew(it) ? ' new' : ''), tabindex: 0, onclick: () => openRecord(it), onkeydown: (e) => { if (e.key === 'Enter') openRecord(it); } },
      td(L.date, { class: 'num' }, fdate(it.date)),
      td(L.type, null, h('span', { class: 'kind ' + it.kind }, kindOne(it.kind)), ROLES_FOR[it.kind] ? h('div', { class: 'cell-sub' }, roleLabel(it.role)) : null),
      opts.showOrg && td(L.org, { class: 'w-party' }, it.org_name),
      td(L.party, { class: 'w-party' }, h('div', { class: 'cell-main' }, it.cp_name || (realCode(it.cp_edrpou) ? t('f.edrpou') + ' ' + it.cp_edrpou : '—')), it.cp_name && realCode(it.cp_edrpou) ? h('div', { class: 'cell-sub num' }, it.cp_edrpou) : null),
      td(L.text, { class: 'w-text' }, h('div', { class: 'clamp' }, itemTitle(it) || '—')),
      td(L.sum, { class: 'r num' + (incoming ? ' in' : '') }, it.amount == null ? '' : (incoming ? '+' : '') + money(it.amount, it.currency)));
  });
  return h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
    h('thead', null, h('tr', null,
      h('th', null, L.date), h('th', null, L.type), opts.showOrg && h('th', null, L.org),
      h('th', null, L.party), h('th', null, L.text), h('th', { class: 'r' }, L.sum))),
    h('tbody', null, rows)));
}

// A filtered list shown a page at a time, with its total and UAH sum.
function pagedList(box, items, page, opts, onPage, renderRows) {
  const total = items.length;
  const sum = items.reduce((acc, i) => acc + (i.currency === 'UAH' && i.amount != null ? i.amount : 0), 0);
  const from = total ? page * PAGE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE);
  const slice = items.slice(page * PAGE, (page + 1) * PAGE);
  fill(box,
    (renderRows || itemsTable)(slice, opts),
    total ? h('div', { class: 'foot' },
      h('div', null, t('list.range', { from: ni.format(from), to: ni.format(to), total: ni.format(total) }), opts.noSum ? '' : ' · ' + t('list.sum', { sum: money(opts.sum != null ? opts.sum : sum) })),
      h('div', { class: 'row' },
        opts.csv && h('button', { class: 'btn btn-sm', onclick: () => (opts.csvRows || csvItems)(items, opts.csv) }, icon('download'), 'CSV'),
        opts.extra,
        h('button', { class: 'btn btn-sm', disabled: page === 0, onclick: () => onPage(page - 1) }, t('list.prev')),
        h('button', { class: 'btn btn-sm', disabled: to >= total, onclick: () => onPage(page + 1) }, t('list.next')))) : null);
}

function toCSV(lines, sep) {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return lines.map((l) => l.map(q).join(sep)).join('\r\n');
}
function csvDownload(lines, name) {
  const blob = new Blob(['﻿' + toCSV(lines, ';')], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const dec = (x) => (x == null ? '' : LANG === 'uk' ? String(x).replace('.', ',') : String(x));
function itemRows(items) {
  const lines = [[t('col.date'), t('col.type'), t('col.role'), t('col.party'), t('col.partyCode'), t('col.amount'), t('col.currency'), t('col.description'), t('col.invoice'), t('col.waybill'), 'ID']];
  for (const i of items) {
    const text = itemTitle(i);
    lines.push([i.date, kindOne(i.kind), ROLES_FOR[i.kind] ? roleLabel(i.role) : '', i.cp_name, i.cp_edrpou, dec(i.amount), i.currency, text,
      i.kind === 'transaction' ? docRefs(text, 'invoice') : '', i.kind === 'transaction' ? docRefs(text, 'waybill') : '', i.ext_id]);
  }
  return lines;
}
const csvItems = (items, name) => csvDownload(itemRows(items), name);

function kv(pairs) {
  const dl = h('dl', { class: 'kv' });
  for (const [label, value] of pairs) {
    if (value == null || value === '' || value === false) continue;
    dl.append(h('dt', null, label), h('dd', null, value));
  }
  return dl;
}
function party(name, code) {
  if (!name && !code) return null;
  return [name || '', code && code !== 'HIDDEN' ? ` (${code})` : code === 'HIDDEN' ? ` (${t('f.codeHidden')})` : ''].join('');
}
function prozorro(id) {
  if (!id) return null;
  return /^UA-/.test(id) ? h('a', { href: 'https://prozorro.gov.ua/tender/' + encodeURIComponent(id), target: '_blank', rel: 'noopener noreferrer' }, id) : id;
}
function address(a) {
  if (!a) return null;
  return [a.regionName, a.district, a.city, a.street, a.house, a.office && t('f.office') + ' ' + a.office].filter(Boolean).join(', ');
}
const sevTag = (sev) => h('span', { class: 'sev ' + sev }, t('sev.' + sev));

// ---- sheets ---------------------------------------------------------------------------------

// A sheet opened from inside another one (a contractor from a risk, a payment from a contract) keeps
// the one it came from: "Back" brings that back as it was, the cross closes them all.
const SHEETS = [];
function closeSheet() {
  SHEETS.length = 0;
  const had = document.querySelector('.sheet');
  document.querySelectorAll('.scrim, .sheet').forEach((n) => n.remove());
  document.removeEventListener('keydown', escClose);
  if (had && typeof softAfter === 'function') softAfter();
}
function sheetBack() {
  const prev = SHEETS.pop();
  if (!prev) { closeSheet(); return; }
  document.querySelectorAll('.sheet').forEach((n) => n.remove());
  document.body.append(prev.el);
  prev.el.scrollTop = prev.y;
  prev.el.focus();
}
function escClose(e) {
  if (e.key !== 'Escape' || document.querySelector('details.menu[open]')) return;
  if (SHEETS.length) sheetBack(); else closeSheet();
}
function sheet(...content) {
  const open = document.querySelector('.sheet');
  if (open) {
    SHEETS.push({ el: open, y: open.scrollTop });
    open.remove();
  } else closeSheet();
  const back = SHEETS.length ? h('button', { class: 'btn back-btn sheet-back', type: 'button', onclick: sheetBack, title: t('ui.back') },
    icon('back'), h('span', null, t('ui.back')), h('span', { class: 'back-to' }, sheetTitle(SHEETS[SHEETS.length - 1].el))) : null;
  const body = h('aside', { class: 'sheet' + (back ? ' has-back' : ''), role: 'dialog', 'aria-modal': 'true', tabindex: -1 },
    h('button', { class: 'btn btn-icon close', onclick: closeSheet, 'aria-label': t('ui.close') }, icon('x')), back, content);
  if (!document.querySelector('.scrim')) document.body.append(h('div', { class: 'scrim', onclick: closeSheet }));
  document.body.append(body);
  document.removeEventListener('keydown', escClose);
  document.addEventListener('keydown', escClose);
  body.focus();
  return body;
}
const sheetTitle = (el) => { const x = el && el.querySelector('h2'); return x ? x.textContent.trim().slice(0, 60) : ''; };

function detailBody(kind, d) {
  const out = [];
  if (kind === 'transaction') {
    out.push(kv([
      [t('f.payDate'), fdate(d.trans_date)],
      [t('f.payer'), party(d.payer_name, d.payer_edrpou)],
      [t('f.payerAccount'), d.payer_account],
      [t('f.recipient'), party(d.recipt_name, d.recipt_edrpou)],
      [t('f.recipientAccount'), d.recipt_account],
      [t('f.purpose'), d.payment_details],
      [t('col.invoice'), docRefs(d.payment_details, 'invoice') || null],
      [t('col.waybill'), docRefs(d.payment_details, 'waybill') || null],
      [t('f.document'), d.doc_number ? t('f.docFrom', { n: d.doc_number, date: fdate(d.doc_date) }) : null],
      [t('f.kekv'), d.kekv],
      [t('f.kpk'), d.kpk],
      [t('f.budget'), d.budgetCode],
      [t('f.source'), d.source_name],
      [t('f.prozorro'), prozorro(d.contractNumber)],
    ]));
  } else if (kind === 'liability') {
    out.push(kv([
      [t('f.payer'), party(d.payer_name, d.payer_edrpou)],
      [t('f.document'), d.ndoc ? t('f.docFrom', { n: d.ndoc, date: fdate(d.datedoc) }) : null],
      [t('f.regDate'), fdate(d.dater)],
      [t('f.term'), d.dateterm ? fdate(d.dateterm) : null],
      [t('f.budgetName'), d.minfin_name],
      [t('f.budget'), d.budgetCode],
      [t('f.kvk'), join([d.kvk, d.kvk_name], ' — ')],
      [t('f.kpk'), join([d.kpk, d.kpk_name], ' — ')],
      [t('f.kekv'), join([d.kekv, d.kekv_name], ' — ')],
      [t('f.contractNumber'), d.contractNumber],
      [t('f.prozorroContract'), d.prozorroContractId],
      [t('f.note'), d.note],
    ]));
    const box = h('div');
    const btn = h('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        btn.disabled = true;
        try {
          const items = await portal('/v2/liabilities/ff', { system_key_fu: d.system_key_fu }) || [];
          fill(box, items.length
            ? h('table', null,
              h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', null, '№'), h('th', null, t('f.recipient')), h('th', { class: 'r' }, t('col.amount')))),
              h('tbody', null, items.map((f) => h('tr', null,
                h('td', { class: 'num' }, fdate(f.datedocf)), h('td', null, f.ndocf || '—'),
                h('td', { class: 'num' }, f.recipt_edrpou || '—'), h('td', { class: 'r num' }, money(f.s, f.currency))))))
            : h('div', { class: 'muted' }, t('f.noFinLiabilities')));
        } catch (e) {
          btn.disabled = false;
          toast(e.message, { bad: true });
        }
      },
    }, t('f.showFinLiabilities'));
    box.append(btn);
    out.push(h('section', null, h('h3', null, t('f.finLiabilities')), box));
  } else if (kind === 'report') {
    out.push(kv([
      [t('f.published'), fdate(d.publishDate)],
      [t('f.created'), d.createDate],
      [t('f.budgetLevel'), d.budget ? t('budget.' + d.budget) : null],
      [t('f.fund'), d.fund ? t('fund.' + d.fund) : null],
      [t('f.kvk'), join([d.vidKlasCod, d.vidKlas], ' — ')],
      [t('f.kpk'), join([d.progKlasCod, d.progKlas], ' — ')],
      [t('f.signedBy'), join([d.lname, d.fname, d.mname], ' ')],
    ]));
  } else {
    const people = (d.contractors || []).map((c) => h('div', null, party(c.name, c.identifier), address(c.address) ? h('div', { class: 'cell-sub' }, address(c.address)) : null));
    out.push(kv([
      [t('f.number'), d.documentNumber],
      [t('f.docDate'), fdate(d.documentDate)],
      [t('f.published'), fdate(d.signDate)],
      [t('f.buyerCode'), d.edrpou],
      [t('f.contractors'), people.length ? people : null],
      [t('f.subject'), d.subject],
      [t('f.validity'), d.noTerm ? t('f.noTerm') : d.fromDate || d.toDate ? `${fdate(d.fromDate)} — ${fdate(d.toDate)}` : null],
      [t('f.vat'), d.pdvAmount != null ? money(d.pdvAmount, d.currency) : null],
      [t('f.tender'), kind === 'contract' ? (d.tender ? t('ui.yes') : t('ui.no')) : null],
      [t('f.reason'), d.tender ? null : d.reason],
      [t('f.prozorro'), prozorro(d.idTenderProzorro)],
      [t('f.change'), d.amountIncrease != null ? money(d.amountIncrease, d.currency) : null],
    ]));
    if ((d.specifications || []).length) {
      out.push(h('section', null, h('h3', null, t('f.spec')), h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, t('f.item')), h('th', null, 'CPV'), h('th', { class: 'r' }, t('f.qty')), h('th', { class: 'r' }, t('f.price')))),
        h('tbody', null, d.specifications.map((s) => h('tr', null,
          h('td', null, s.specificationName || '—'), h('td', { class: 'num' }, s.cpvCode || '—'),
          h('td', { class: 'r num' }, s.itemCount != null ? `${ni.format(s.itemCount)} ${s.itemDimension || ''}` : '—'),
          h('td', { class: 'r num' }, s.itemCost != null ? money(s.itemCost, d.currency) : '—'))))))));
    }
  }
  out.push(h('section', null, h('details', null, h('summary', null, t('f.allFields')), h('pre', null, JSON.stringify(d, null, 2)))));
  return out;
}

function openRecord(item) {
  sheet(
    h('span', { class: 'kind ' + item.kind }, kindOne(item.kind)),
    h('h2', null, item.cp_name || item.org_name || kindOne(item.kind)),
    h('div', { class: 'sub' }, join([item.org_name, fdate(item.date), item.amount != null ? money(item.amount, item.currency) : null])),
    detailBody(item.kind, item.data || {}),
    item.kind === 'contract' ? h('div', { class: 'row after' }, trackTreasuryButton(item.data)) : null);
}
