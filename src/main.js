// The router and the start of the app. Loaded last.
'use strict';

// ---- router ------------------------------------------------------------------------------------------

const CID_RX = /^([0-9a-f]{32}|sp\d{3,20}|tn[0-9a-f]{32})$/;
// The addresses of the former "Монітор розрахунків" and of the registry before #/sp/: where each
// leads now ("" = the list of sub-projects), or null when the address is a current one.
function legacyRoute(route, parts) {
  if (route === 'registry') return parts[1] === 'summary' ? '#/portfolio' : parts[1] ? '#/sp/' + parts.slice(1).join('/') : '#/';
  if (route === 'feed') return '#/reminders';
  if (route === 'eib') return '#/search/eib';
  if (route === 'method') return '#/settings';
  if (route === 'tracked') return CID_RX.test(parts[1] || '') ? null : '';
  if (['overview', 'contracts', 'payments', 'prozorro', 'orgs', 'org'].includes(route)) return '';
  if (!['', 'sp', 'signals', 'portfolio', 'search', 'reminders', 'settings'].includes(route)) return '';
  return null;
}
// The workplace is the UNDP compliance team's: an account not on its list sees how to get in.
function noAccessPage() {
  return [pageHead(t('app.name'), titleGrad(t('na.title1'), t('na.title2'))),
    h('div', { class: 'card pad section' }, h('p', null, t('na.text', { email: (state.user && state.user.email) || '' })),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/settings' }, icon('gear'), t('nav.settings'))))];
}

function render() {
  closeSheet();
  document.documentElement.lang = LANG;
  document.title = t('app.name');
  if (state.user === undefined) { fill(app, h('div', { class: 'boot' }, t('ui.loading'))); return; }
  if (!state.user) { fill(app, loginPage()); return; }
  if (!state.index || (cloud && !state.mine.ready)) { fill(app, h('div', { class: 'boot' }, state.dataError ? [h('b', null, t('err.dataTitle') + ' '), state.dataError] : t('ui.loading'))); return; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = parts[0] || '';
  // Old addresses lead to their place in the workplace: never to a screen that is gone.
  const to = legacyRoute(route, parts);
  if (to != null && to !== location.hash) { location.replace(to || '#/'); return; }
  navNote(location.hash);
  let page, key = route;
  const team = typeof hasRegistry === 'function' && hasRegistry();
  if (route === 'settings') page = settingsPage();
  else if (typeof REG !== 'undefined' && REG.access === undefined) page = [h('div', { class: 'card empty section' }, t('ui.loading'))];
  else if (!team) { page = noAccessPage(); key = 'home'; }
  else if (route === 'sp' && parts[1]) { page = registryCard(decodeURIComponent(parts[1]), parts[2], parts[3] ? decodeURIComponent(parts[3]) : null); key = 'home'; }
  else if (route === 'tracked' && CID_RX.test(parts[1] || '')) { page = trackedDossier(parts[1]); key = 'home'; }
  else if (route === 'signals') page = spSignalsPage();
  else if (route === 'portfolio') page = portfolioPage();
  else if (route === 'search') page = searchPage(parts[1]);
  else if (route === 'reminders') page = remindersPage(parts[1]);
  else { page = registryPage(); key = 'home'; }
  fill(app, shell(key, page));
  // An address may name a place on the page (#/sp/CODE/overview#risks): it opens there.
  const anchor = location.hash.split('#')[2];
  const el = anchor && document.getElementById(anchor);
  if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

// Re-render only when nothing is being edited or read in a sheet.
function softRender() {
  const busy = document.querySelector('.sheet') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  if (busy) return;
  // New data on the same page: it stays where the reader is.
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

// Before v0.10 lists were shared: move the user's own contract picks into their list, once.
let migrated = false;
async function migrateOnce() {
  if (migrated || !cloud || !state.user) return;
  migrated = true;
  try {
    const role = (code) => ((state.all.orgs.find((o) => o.edrpou === code) || {}).role || 'buyer');
    const n = await cloud.migrateLegacy(role);
    if (n) toast(t('tr.migrated', { n }));
  } catch (e) { /* nothing to move, or no access: fine */ }
}

async function boot() {
  render();
  loadAll().then(() => { softRender(); }).catch((e) => { state.dataError = e.message; softRender(); });
  try {
    cloud = await import(new URL('cloud.js?v=' + encodeURIComponent(APP.build), document.baseURI).href);
    await cloud.init({
      onUser(user) {
        const was = state.user;
        state.user = user || null;
        if (user) {
          cloud.watchReviews((map) => { state.reviews = map; softRender(); });
          cloud.watchMine((m) => {
            state.mine = m;
            applyScope();
            if (m.ready) migrateOnce();
            if (m.ready && typeof autoTrackSoon === 'function') autoTrackSoon();
            softRender();
          });
          loadDriveState();
          if (typeof registryInit === 'function') registryInit();
          if (!was) setTimeout(showInstallBanner, 1200);
        } else {
          state.reviews = new Map();
          if (typeof REG !== 'undefined') Object.assign(REG, { access: null, rows: new Map(), meta: null });
          state.mine = { orgs: new Map(), tracked: new Map(), shared: new Map(), ready: false };
          applyScope();
          document.querySelectorAll('.install').forEach((n) => n.remove());
        }
        render();
      },
      lang: () => LANG,
    });
  } catch (e) {
    state.cloudError = e.message || String(e);
    state.user = null;
    render();
  }
}

// A fixed scale on phones: no pinch zoom (iOS Safari ignores user-scalable=no); double-tap zoom is
// off through touch-action in style.css.
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

setupServiceWorker();
boot();

// Pick up a fresh data set without a manual reload.
setInterval(async () => {
  const before = ver();
  try {
    const idx = await getJSON('data/index.json');
    if (idx.generated_at !== before) {
      await loadAll();
      softRender();
    }
  } catch (e) { /* offline or mid-deploy: keep what is shown */ }
}, 10 * 60 * 1000);
