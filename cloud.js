// Firebase side of the app: Google sign-in, the shared Firestore database and
// uploads to the signed-in user's own Google Drive (drive.file scope: the app
// sees only files it created). Loaded by app.js with a versioned URL.

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER = 'Монітор розрахунків';
const ORG_COLLECTIONS = ['contracts', 'acts', 'addendums', 'penalties', 'payments', 'liabilities', 'reports', 'signals'];

let fb = null;      // SDK modules
let auth = null;
let db = null;
let current = null; // signed-in user
let unwatch = null;

export async function init({ onUser, lang }) {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  fb = Object.assign({}, appMod, authMod, fsMod);
  const app = fb.initializeApp(window.FIREBASE_CONFIG);
  auth = fb.getAuth(app);
  auth.languageCode = lang();
  db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true });
  // A redirect sign-in (used when popups are blocked) finishes here.
  fb.getRedirectResult(auth).then(rememberToken).catch(() => {});
  fb.onAuthStateChanged(auth, (user) => {
    current = user;
    if (unwatch && !user) { unwatch(); unwatch = null; }
    if (unwatchTracked && !user) { unwatchTracked(); unwatchTracked = null; }
    if (user) saveProfile(user, lang()).catch(() => {});
    else sessionStorage.removeItem('driveToken');
    onUser(user);
  });
}

function provider(withDrive) {
  const p = new fb.GoogleAuthProvider();
  if (withDrive) p.addScope(DRIVE_SCOPE);
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

function rememberToken(result) {
  if (!result) return null;
  const cred = fb.GoogleAuthProvider.credentialFromResult(result);
  if (!cred || !cred.accessToken) return null;
  // Google access tokens live an hour; keep it for the tab, a bit less than that.
  sessionStorage.setItem('driveToken', JSON.stringify({ token: cred.accessToken, until: Date.now() + 50 * 60 * 1000, uid: result.user.uid }));
  return cred.accessToken;
}

export async function signIn() {
  try {
    rememberToken(await fb.signInWithPopup(auth, provider(true)));
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await fb.signInWithRedirect(auth, provider(true));
      return;
    }
    throw e;
  }
}

export function signOut() {
  sessionStorage.removeItem('driveToken');
  return fb.signOut(auth);
}

async function saveProfile(user, lang) {
  const ref = fb.doc(db, 'users', user.uid);
  const snap = await fb.getDoc(ref);
  const data = { name: user.displayName || '', email: user.email || '', photo: user.photoURL || '', lang, lastLogin: fb.serverTimestamp() };
  if (!snap.exists()) data.createdAt = fb.serverTimestamp();
  await fb.setDoc(ref, data, { merge: true });
}

export function saveLang(lang) {
  if (!current) return Promise.resolve();
  return fb.setDoc(fb.doc(db, 'users', current.uid), { lang }, { merge: true });
}

// ---- reviews ----------------------------------------------------------------------

const toDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v || null);

export function watchReviews(cb) {
  if (unwatch) unwatch();
  unwatch = fb.onSnapshot(fb.collection(db, 'reviews'), (snap) => {
    const map = new Map();
    snap.forEach((d) => {
      const r = d.data();
      map.set(d.id, Object.assign({}, r, { updatedAt: toDate(r.updatedAt) }));
    });
    cb(map);
  }, () => {});
}

export async function saveReview(key, data) {
  const name = current.displayName || current.email || '';
  const doc = {
    org: data.org || '', contract: data.contract || null, signalType: data.signalType || '', title: (data.title || '').slice(0, 300),
    status: data.status, comment: (data.comment || '').slice(0, 4000),
    updatedBy: current.uid, updatedByName: name, updatedAt: fb.serverTimestamp(),
  };
  const ref = fb.doc(db, 'reviews', key);
  const batch = fb.writeBatch(db);
  batch.set(ref, doc);
  batch.set(fb.doc(fb.collection(ref, 'history')), { status: doc.status, comment: doc.comment, by: current.uid, byName: name, at: fb.serverTimestamp() });
  await batch.commit();
}

export async function reviewHistory(key) {
  const q = fb.query(fb.collection(db, 'reviews', key, 'history'), fb.orderBy('at', 'desc'), fb.limit(20));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => Object.assign({}, d.data(), { at: toDate(d.data().at) }));
}

// ---- export log -------------------------------------------------------------------

export function logExport(entry) {
  return fb.addDoc(fb.collection(db, 'exports'), {
    org: entry.org || '', kind: entry.kind || '', title: (entry.title || '').slice(0, 300), url: entry.url || '',
    uid: current.uid, byName: current.displayName || current.email || '', at: fb.serverTimestamp(),
  });
}

export async function myExports() {
  const q = fb.query(fb.collection(db, 'exports'), fb.where('uid', '==', current.uid), fb.limit(100));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => Object.assign({}, d.data(), { at: toDate(d.data().at) }))
    .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);
}

// ---- organisations added from the app -------------------------------------------
// watchlist/{edrpou} is publicly readable: GitHub Actions reads it without
// credentials and puts the organisation on the watch list.

export function requestOrg(code, name, role) {
  return fb.setDoc(fb.doc(db, 'watchlist', code), {
    edrpou: code, name: (name || '').slice(0, 300), note: '', role: role === 'supplier' ? 'supplier' : 'buyer', addedBy: current.uid, addedAt: fb.serverTimestamp(),
  });
}

// ---- contracts on control -----------------------------------------------------------
// tracked/{Prozorro contract id} is publicly readable: GitHub Actions re-reads
// every active contract on each run. A contract is switched off, never deleted.

let unwatchTracked = null;
export function watchTracked(cb) {
  if (unwatchTracked) unwatchTracked();
  unwatchTracked = fb.onSnapshot(fb.collection(db, 'tracked'), (snap) => {
    const map = new Map();
    snap.forEach((d) => map.set(d.id, Object.assign({}, d.data(), { addedAt: toDate(d.data().addedAt), updatedAt: toDate(d.data().updatedAt) })));
    cb(map);
  }, () => cb(new Map()));
}

export async function track(id, info) {
  const ref = fb.doc(db, 'tracked', id);
  const old = await fb.getDoc(ref);
  if (old.exists()) {
    return fb.updateDoc(ref, { active: true, note: old.data().note || '', updatedBy: current.uid, updatedAt: fb.serverTimestamp() });
  }
  const clip = (v, n) => String(v || '').slice(0, n);
  return fb.setDoc(ref, {
    org: info.org, tid: info.tid, sp: clip(info.sp, 40), title: clip(info.title, 500), number: clip(info.number, 100),
    buyer: clip(info.buyer, 300), supplier: clip(info.supplier, 300), note: '', active: true,
    addedBy: current.uid, addedByName: clip(current.displayName || current.email, 200), addedAt: fb.serverTimestamp(),
  });
}

export function setTracked(id, fields) {
  return fb.updateDoc(fb.doc(db, 'tracked', id), Object.assign({}, fields, { updatedBy: current.uid, updatedAt: fb.serverTimestamp() }));
}

export async function watchlist() {
  const snap = await fb.getDocs(fb.collection(db, 'watchlist'));
  return snap.docs.map((d) => Object.assign({}, d.data(), { addedAt: toDate(d.data().addedAt) }));
}

// ---- the documents database ---------------------------------------------------------
//
// orgs/{edrpou}                      company card, totals, last upload
// orgs/{edrpou}/{collection}/{id}    contracts, acts, addendums, penalties, payments,
//                                    liabilities, reports, signals
// orgs/{edrpou}/meta/{collection}    fingerprints of what was uploaded, so a repeat
//                                    upload writes only new or changed records

// FNV-1a over the JSON text: enough to notice that a record changed.
function fingerprint(value) {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Firestore keeps no nested arrays; such values are stored as JSON text.
function storable(v) {
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? JSON.stringify(x) : storable(x)));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = storable(x);
    return out;
  }
  return v;
}

const docId = (id) => String(id).replace(/\//g, '_').slice(0, 700) || '_';

export async function dbStatus(codes) {
  const out = {};
  await Promise.all(codes.map(async (code) => {
    const snap = await fb.getDoc(fb.doc(db, 'orgs', code));
    if (snap.exists()) {
      const d = snap.data();
      out[code] = { at: toDate(d.uploadedAt), records: d.records || 0, by: d.uploadedByName || '', sig: d.sig || '' };
    }
  }));
  return out;
}

export async function uploadOrg(payload, onProgress) {
  const code = payload.org.edrpou;
  const orgRef = fb.doc(db, 'orgs', code);
  const plan = [];
  const manifests = {};
  let total = 0;
  for (const name of ORG_COLLECTIONS) {
    const rows = payload.collections[name] || [];
    total += rows.length;
    const metaRef = fb.doc(db, 'orgs', code, 'meta', name);
    const snap = await fb.getDoc(metaRef);
    const old = (snap.exists() && snap.data().h) || {};
    const fresh = {};
    for (const row of rows) {
      const id = docId(row.id);
      const doc = storable(row.doc);
      const fp = fingerprint(doc);
      fresh[id] = fp;
      if (old[id] !== fp) plan.push({ ref: fb.doc(db, 'orgs', code, name, id), doc });
    }
    manifests[name] = { ref: metaRef, h: fresh };
  }

  // Up to 400 writes per batch keeps each request well under Firestore's limits.
  let done = 0;
  onProgress && onProgress(0, plan.length);
  for (let i = 0; i < plan.length; i += 400) {
    const batch = fb.writeBatch(db);
    for (const w of plan.slice(i, i + 400)) batch.set(w.ref, w.doc);
    await batch.commit();
    done += Math.min(400, plan.length - i);
    onProgress && onProgress(done, plan.length);
  }
  // Fingerprints are saved after the records, so an interrupted upload is redone next time.
  const batch = fb.writeBatch(db);
  for (const m of Object.values(manifests)) batch.set(m.ref, { h: m.h, at: fb.serverTimestamp() });
  // The server timestamp is added after storable(): copying it would turn the
  // sentinel into a plain map, and the rules require the real request time.
  batch.set(orgRef, Object.assign(storable(Object.assign({}, payload.org, {
    records: total, uploadedBy: current.uid, uploadedByName: current.displayName || current.email || '',
  })), { uploadedAt: fb.serverTimestamp() }));
  await batch.commit();
  return { written: plan.length, total };
}

// ---- Google Drive -----------------------------------------------------------------------

// Returns a Drive token, asking Google again (a popup) when the tab has none.
// Call it straight from a click so the popup is not blocked.
export async function driveToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('driveToken') || 'null');
    if (saved && saved.uid === current.uid && saved.until > Date.now()) return saved.token;
  } catch (e) { /* ignore */ }
  const p = provider(true);
  p.setCustomParameters({ login_hint: current.email || '' });
  const token = rememberToken(await fb.reauthenticateWithPopup(current, p));
  if (!token) throw new Error('Google Drive access was not granted');
  return token;
}

async function drive(path, opts) {
  const token = await driveToken();
  const res = await fetch('https://www.googleapis.com' + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + token }, (opts || {}).headers || {}),
  }));
  if (res.status === 401) {
    sessionStorage.removeItem('driveToken');
    throw new Error('Google Drive session expired, try again');
  }
  if (!res.ok) {
    let msg = 'Google Drive ' + res.status;
    try { msg += ': ' + ((await res.json()).error || {}).message; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFile(name, parent, mime) {
  const q = [`name = '${qEsc(name)}'`, 'trashed = false', parent ? `'${parent}' in parents` : null, mime ? `mimeType = '${mime}'` : null].filter(Boolean).join(' and ');
  const res = await drive('/drive/v3/files?' + new URLSearchParams({ q, fields: 'files(id,webViewLink)', spaces: 'drive', pageSize: '1' }));
  return res.files[0] || null;
}

const FOLDER = 'application/vnd.google-apps.folder';
async function folder(name, parent) {
  const found = await findFile(name, parent, FOLDER);
  if (found) return found;
  return drive('/drive/v3/files?fields=id,webViewLink', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }),
  });
}

const TYPES = {
  doc: { source: 'text/html', target: 'application/vnd.google-apps.document' },
  sheet: { source: 'text/csv', target: 'application/vnd.google-apps.spreadsheet' },
  json: { source: 'application/json', target: 'application/json' },
};

// Creates or overwrites one file; HTML becomes a Google Doc, CSV a Google Sheet.
async function upsert(name, parent, type, content) {
  const ty = TYPES[type];
  const existing = await findFile(name, parent, ty.target);
  const boundary = 'b' + Math.random().toString(36).slice(2);
  const meta = existing ? { name } : { name, mimeType: ty.target, parents: [parent] };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
    + `--${boundary}\r\nContent-Type: ${ty.source}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const path = existing ? `/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,webViewLink` : '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
  return drive(path, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
}

async function rootFolder() {
  return folder(ROOT_FOLDER, null);
}

export async function rootFolderUrl() {
  return (await rootFolder()).webViewLink;
}

// files: [{folder: 'subfolder' or '', name, type: doc|sheet|json, content}]
export async function exportFiles(orgFolderName, files, onProgress) {
  const root = await rootFolder();
  const base = await folder(orgFolderName, root.id);
  const subs = {};
  const out = [];
  let done = 0;
  for (const f of files) {
    let parent = base.id;
    if (f.folder) parent = (subs[f.folder] = subs[f.folder] || (await folder(f.folder, base.id))).id;
    const res = await upsert(f.name, parent, f.type, f.content);
    out.push({ name: f.name, url: res.webViewLink });
    onProgress && onProgress(++done, files.length);
  }
  return { folderUrl: base.webViewLink, files: out };
}
