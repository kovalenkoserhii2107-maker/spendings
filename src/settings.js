// Settings, Google Drive export, the sign-in screen.
'use strict';

// ---- settings ---------------------------------------------------------------------------------------

function settingsPage() {
  const u = state.user;
  const exportsBox = h('div', null, h('div', { class: 'muted' }, t('ui.loading')));
  if (cloud && u) {
    cloud.myExports().then((rows) => fill(exportsBox, rows.length ? h('div', { class: 'scroll' }, h('table', { class: 'stack-mobile' },
      h('thead', null, h('tr', null, h('th', null, t('col.date')), h('th', null, t('set.what')), h('th', null, ''))),
      h('tbody', null, rows.map((r) => h('tr', null, td(t('col.date'), { class: 'num' }, ftime(r.at)), td(t('set.what'), null, r.title || ''),
        td('', { class: 'r' }, r.url ? ext(r.url, t('drv.open')) : null)))))) : h('div', { class: 'muted' }, t('set.noExports'))))
      .catch(() => fill(exportsBox, h('div', { class: 'muted' }, t('set.noExports'))));
  }
  const installBox = isStandalone() || install.installed ? h('span', { class: 'tag ok' }, t('inst.installed'))
    : install.prompt ? h('button', { class: 'btn btn-dark', onclick: async () => { if (await runInstall()) render(); } }, icon('phone'), t('inst.button'))
      : h('p', { class: 'muted small' }, isIOS() ? t('inst.ios') : t('inst.manual'));
  const upd = h('button', { class: 'btn', onclick: () => checkForUpdate(upd) }, icon('refresh'), t('upd.check'));
  const team = typeof hasRegistry === 'function' && hasRegistry();
  return [
    pageHead(t('nav.settings'), titleGrad(t('set.title1'), t('set.title2'))),
    h('div', { class: 'settings' },
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.account')),
        u ? h('div', { class: 'account' },
          u.photoURL ? h('img', { src: u.photoURL, alt: '', referrerpolicy: 'no-referrer', width: 48, height: 48 }) : null,
          h('div', null, h('b', null, u.displayName || ''), h('div', { class: 'muted small' }, u.email || '')),
          h('button', { class: 'btn', onclick: () => cloud.signOut() }, icon('logout'), t('auth.signOut'))) : null),
      team && typeof expertCard === 'function' ? expertCard() : null,
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.language')), langSwitch(), h('p', { class: 'muted small' }, t('set.languageNote'))),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.install')), installBox),
      h('div', { class: 'card pad' }, h('h2', { class: 'card-title' }, t('set.version')),
        kv([[t('set.versionLabel'), 'v' + APP.version], [t('set.build'), APP.build], [t('set.stage'), t('set.stageDev')], [t('set.dataAt'), state.index.generated_at ? ftime(state.index.generated_at) : '—']]),
        h('div', { class: 'row', style: 'margin-top:12px' }, upd, ghLink('blob/main/CHANGELOG.md', t('set.changelog'), 'btn')))),
    team && typeof methodCard === 'function' ? methodCard() : null,
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('set.drive')), h('p', { class: 'muted small' }, t('set.driveNote')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: (e) => openDriveFolder(e.currentTarget) }, icon('drive'), t('drv.openFolder')))),
    h('div', { id: 'drive-script' }, driveCard()),
    h('div', { class: 'card pad section' }, h('h2', { class: 'card-title' }, t('set.exports')), exportsBox),
  ];
}

// ---- Google Drive export ------------------------------------------------------------------------------

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const footer = () => `<p><i>${esc(t('drv.footer', { at: ftime(new Date()), v: APP.version }))}</i></p>`;






async function openDriveFolder(btn) {
  if (!cloud || !state.user) return;
  btn.disabled = true;
  try {
    const url = await cloud.rootFolderUrl();
    toast(t('drv.folderReady'), { link: { href: url, label: t('drv.open') } });
  } catch (e) {
    toast(t('drv.failed') + ' ' + (e.message || ''), { bad: true });
  } finally {
    btn.disabled = false;
  }
}

// ---- sign-in screen -----------------------------------------------------------------------------------

function loginPage() {
  const btn = h('button', { class: 'btn btn-google', onclick: async () => {
    btn.disabled = true;
    try {
      await cloud.signIn();
    } catch (e) {
      if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(t('auth.failed') + ' ' + (e.message || ''), { bad: true });
    } finally {
      btn.disabled = false;
    }
  } }, googleMark(), t('auth.google'));
  return h('div', { class: 'login' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'login-card' },
      h('div', { class: 'login-top' }, logo(), langSwitch()),
      h('div', { class: 'eyebrow' }, t('login.eyebrow')),
      h('h1', null, h('span', null, t('login.title1') + ' '), h('span', { class: 'grad' }, t('login.title2'))),
      h('p', { class: 'lead' }, t('login.lead')),
      h('ul', { class: 'login-points' }, ['login.p1', 'login.p2', 'login.p3'].map((k) => h('li', null, icon('check'), t(k)))),
      state.cloudError ? h('div', { class: 'notice' }, t('auth.unavailable'), ' ', h('button', { class: 'btn btn-sm', onclick: () => location.reload() }, t('ui.retry'))) : btn,
      h('p', { class: 'muted small' }, t('login.note')),
      h('p', { class: 'faint small' }, 'v' + APP.version)));
}
