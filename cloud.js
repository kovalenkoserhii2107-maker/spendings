// Firebase side of the app: Google sign-in, the shared Firestore database and
// uploads to the signed-in user's own Google Drive (drive.file scope: the app
// sees only files it created). Loaded by src/main.js with a versioned URL.

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
    if (!user) { unwatchMine.forEach((u) => u()); unwatchMine = []; myHashValue = null; Object.assign(mine, { orgs: new Map(), tracked: new Map(), shared: new Map(), seen: { orgs: false, tracked: false, shared: false } }); }
    if (!user && unwatchRegistry) unwatchRegistry();
    if (user) { saveProfile(user, lang()).catch(() => {}); registerEmail(user).catch(() => {}); }
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

// The analyst's profile: whose sub-projects are "mine" (the team table's expert name).
export async function myProfile() {
  if (!current) return null;
  try { const snap = await fb.getDoc(fb.doc(db, 'users', current.uid)); return snap.exists() ? snap.data() : null; } catch (e) { return null; }
}
export function saveExpert(name) {
  return fb.setDoc(fb.doc(db, 'users', current.uid), { expert: name ? String(name).slice(0, 120) : fb.deleteField() }, { merge: true });
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
  // Whoever opened a review keeps it; others (unless analysts) cannot overwrite it.
  let prev = null;
  try { const snap = await fb.getDoc(ref); prev = snap.exists() ? snap.data() : null; } catch (e) { /* treat as new */ }
  doc.createdBy = prev ? (prev.createdBy || prev.updatedBy) : current.uid;
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

// ---- each user's own lists ------------------------------------------------------------
//
// users/{uid}/myorgs/{edrpou}     organisations the user follows
// users/{uid}/tracked/{cid}       contracts on control, with the user's note and shares
// users/{uid}/shared/{cid}        contracts other users shared with this user
// pub/{sha256("monitor:"+uid)}    the same codes and ids without names, notes or e-mails,
//                                 public, so GitHub Actions knows what to sync
// Nobody but the owner can read the first three (firestore.rules).

const mine = { orgs: new Map(), tracked: new Map(), shared: new Map(), seen: { orgs: false, tracked: false, shared: false } };
let unwatchMine = [];
let myHashValue = null;

export async function hashOf(uid) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('monitor:' + uid));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Live copies of the three lists; cb gets {orgs, tracked, shared, ready} on every change.
export function watchMine(cb) {
  unwatchMine.forEach((u) => u());
  const base = ['users', current.uid];
  const emit = () => cb({ orgs: mine.orgs, tracked: mine.tracked, shared: mine.shared, ready: mine.seen.orgs && mine.seen.tracked && mine.seen.shared });
  const listen = (name) => fb.onSnapshot(fb.collection(db, ...base, name), (snap) => {
    const m = new Map();
    snap.forEach((d) => m.set(d.id, Object.assign({}, d.data(), { addedAt: toDate(d.data().addedAt), at: toDate(d.data().at) })));
    mine[name === 'myorgs' ? 'orgs' : name] = m;
    mine.seen[name === 'myorgs' ? 'orgs' : name] = true;
    emit();
    if (name !== 'shared') schedulePublish();
  }, () => { mine.seen[name === 'myorgs' ? 'orgs' : name] = true; emit(); });
  unwatchMine = [listen('myorgs'), listen('tracked'), listen('shared')];
}

// The anonymous public copy, rewritten whenever the user's lists change.
let publishTimer = null;
function schedulePublish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => publish().catch(() => {}), 800);
}
// What the analyst's portfolio adds to each contract (sub-project code, programme, what the
// procurement buys, the EIB's part paid by Mindev's register): the app sets the reader.
let pubExtra = () => null;
let lastPub = '';
export function setPubExtra(fn) { pubExtra = fn || (() => null); }
export function republish() { schedulePublish(); }
async function publish() {
  if (!current || !mine.seen.orgs || !mine.seen.tracked) return;
  myHashValue = myHashValue || await hashOf(current.uid);
  const shares = [];
  for (const [cid, t] of mine.tracked) for (const w of t.sharedWith || []) if (w.uid) shares.push({ cid, to: await hashOf(w.uid) });
  const tracked = [...mine.tracked.entries()].map(([cid, t]) => {
    let x = null;
    try { x = pubExtra(cid, t); } catch (e) { x = null; }
    const row = { cid, org: t.org, tid: t.tid || '', sp: t.sp || '', date: t.signed || '' };
    if (x) for (const k of ['subp', 'prog', 'role', 'eib_paid']) if (x[k] != null && x[k] !== '') row[k] = x[k];
    return row;
  });
  const body = { orgs: [...mine.orgs.values()].map((o) => ({ edrpou: o.edrpou, role: o.role || 'buyer' })), tracked, shares };
  // The same list again is not written: the registry changes often, the public copy seldom.
  const sig = JSON.stringify(body);
  if (sig === lastPub) return;
  await fb.setDoc(fb.doc(db, 'pub', myHashValue), Object.assign(body, { at: fb.serverTimestamp() }));
  lastPub = sig;
}

export function addOrg(code, name, role) {
  return fb.setDoc(fb.doc(db, 'users', current.uid, 'myorgs', code), {
    edrpou: code, name: String(name || '').slice(0, 300), role: role === 'supplier' ? 'supplier' : 'buyer', note: '', addedAt: fb.serverTimestamp(),
  });
}
export function removeOrg(code) {
  return fb.deleteDoc(fb.doc(db, 'users', current.uid, 'myorgs', code));
}

// cid: a Prozorro contract id, or "sp" + the Treasury id for a contract Prozorro does not have.
export function track(cid, info) {
  const clip = (v, n) => String(v || '').slice(0, n);
  return fb.setDoc(fb.doc(db, 'users', current.uid, 'tracked', cid), {
    org: info.org, tid: info.tid || '', sp: clip(info.sp, 40), signed: clip(info.signed, 10), title: clip(info.title, 500), number: clip(info.number, 100),
    buyer: clip(info.buyer, 300), supplier: clip(info.supplier, 300), note: '', addedAt: fb.serverTimestamp(), sharedWith: [],
  });
}
// Stop following; whoever it was shared with loses it too.
export async function untrack(cid) {
  const t = mine.tracked.get(cid);
  for (const w of (t && t.sharedWith) || []) await fb.deleteDoc(fb.doc(db, 'users', w.uid, 'shared', cid)).catch(() => {});
  return fb.deleteDoc(fb.doc(db, 'users', current.uid, 'tracked', cid));
}
export function setTrackedNote(cid, note) {
  return fb.updateDoc(fb.doc(db, 'users', current.uid, 'tracked', cid), { note: String(note || '').slice(0, 500) });
}

// Share a contract one has on control with another registered user, by e-mail.
export async function share(cid, email) {
  const key = String(email || '').trim().toLowerCase();
  const found = await fb.getDoc(fb.doc(db, 'emails', key));
  if (!found.exists()) { const e = new Error('not-found'); e.code = 'not-found'; throw e; }
  const to = found.data();
  if (to.uid === current.uid) { const e = new Error('self'); e.code = 'self'; throw e; }
  const t = mine.tracked.get(cid);
  if (!t) throw new Error('not-tracked');
  await fb.setDoc(fb.doc(db, 'users', to.uid, 'shared', cid), {
    from: current.uid, fromName: String(current.displayName || current.email || '').slice(0, 200),
    org: t.org, tid: t.tid, sp: t.sp || '', title: t.title || '', number: t.number || '', buyer: t.buyer || '', supplier: t.supplier || '',
    at: fb.serverTimestamp(),
  });
  const list = (t.sharedWith || []).filter((w) => w.uid !== to.uid).concat([{ uid: to.uid, name: String(to.name || '').slice(0, 200), email: key }]);
  await fb.updateDoc(fb.doc(db, 'users', current.uid, 'tracked', cid), { sharedWith: list });
  return to;
}
export async function unshare(cid, uid) {
  await fb.deleteDoc(fb.doc(db, 'users', uid, 'shared', cid)).catch(() => {});
  const t = mine.tracked.get(cid);
  if (t) await fb.updateDoc(fb.doc(db, 'users', current.uid, 'tracked', cid), { sharedWith: (t.sharedWith || []).filter((w) => w.uid !== uid) });
}
export function removeShared(cid) {
  return fb.deleteDoc(fb.doc(db, 'users', current.uid, 'shared', cid));
}

// The e-mail registry lets others share with this user; written at every sign-in.
async function registerEmail(user) {
  if (!user.email || !user.emailVerified) return;
  await fb.setDoc(fb.doc(db, 'emails', user.email.toLowerCase()), { uid: user.uid, name: String(user.displayName || '').slice(0, 200) });
}

// Before v0.10 contracts on control lived in a shared collection; move the user's own over once.
export async function migrateLegacy(roleOf) {
  const q = fb.query(fb.collection(db, 'tracked'), fb.where('addedBy', '==', current.uid));
  const snap = await fb.getDocs(q);
  let moved = 0;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.active === false) continue;
    if (!mine.tracked.has(d.id)) {
      await track(d.id, x);
      if (x.note) await setTrackedNote(d.id, x.note);
    }
    if (x.org && !mine.orgs.has(x.org)) await addOrg(x.org, x.buyer || '', roleOf(x.org));
    await fb.updateDoc(d.ref, { active: false, updatedBy: current.uid, updatedAt: fb.serverTimestamp() });
    moved++;
  }
  return moved;
}

export const uid = () => (current ? current.uid : null);

// The Drive copy script (an Apps Script web app run as the user) is connected once per user.
export async function driveScriptConnected() {
  const snap = await fb.getDoc(fb.doc(db, 'users', current.uid));
  return snap.exists() && snap.data().driveScript ? toDate(snap.data().driveScript) : null;
}
export function markDriveScript() {
  return fb.setDoc(fb.doc(db, 'users', current.uid), { driveScript: fb.serverTimestamp() }, { merge: true });
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
  // Firestore's own values (deleteField, serverTimestamp, dates) go as they are.
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) !== Object.prototype) return v;
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

  // The organisation's own document goes first: the rules let only its uploader (or an
  // analyst) write the records under it. The server timestamp is added after storable():
  // copying it would turn the sentinel into a plain map, and the rules need the request time.
  const orgDoc = () => Object.assign(storable(Object.assign({}, payload.org, {
    records: total, uploadedBy: current.uid, uploadedByName: current.displayName || current.email || '',
  })), { uploadedAt: fb.serverTimestamp() });
  await fb.setDoc(orgRef, orgDoc());

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
  batch.set(orgRef, orgDoc());
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

// ---- Sub-project registry (the team's compliance working table) ----------------------------
//
// Private to the people listed in registryAccess/{email} (added in the console): the table's
// rows, the Prozorro links the team confirms and what the app found for them.
//   registryAccess/{email}   {expert: name in the table, admin: bool}
//   registry/{code}          t: the table's own fields; tenders: its rows of the Tenders sheet;
//                            paid: its line of the Payments sheet; link: Prozorro ids the team
//                            confirmed; pz: what Prozorro says of them; risk: hints; note
//   registryMeta/import      the last upload of the table

export async function registryAccess() {
  if (!current || !current.email) return null;
  try {
    const snap = await fb.getDoc(fb.doc(db, 'registryAccess', current.email.toLowerCase()));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    return null;  // no access: the rules refuse the read
  }
}

let unwatchRegistry = null;
export function watchRegistry(cb) {
  if (unwatchRegistry) unwatchRegistry();
  const out = { rows: new Map(), meta: null };
  const u1 = fb.onSnapshot(fb.collection(db, 'registry'), (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') out.rows.delete(ch.doc.id);
      else out.rows.set(ch.doc.id, ch.doc.data());
    });
    cb(out);
  }, () => cb(out));
  const u2 = fb.onSnapshot(fb.doc(db, 'registryMeta', 'import'), (snap) => {
    out.meta = snap.exists() ? snap.data() : null;
    cb(out);
  }, () => {});
  unwatchRegistry = () => { u1(); u2(); unwatchRegistry = null; };
  return unwatchRegistry;
}

// Document ids keep to letters, digits, _ . - (the rules check it): "ZH08_04#LOT2" -> "ZH08_04_LOT2".
export const regId = (code) => String(code).replace(/[^0-9A-Za-z_.-]+/g, '_').slice(0, 60);

// The table's rows (table fields only: links, Prozorro data and notes stay as they are).
// Batches of 50; when one is refused, its rows go one by one so a single odd row does not
// stop the rest. Returns the codes that could not be saved.
const REG_BATCH = 50;
export async function importRegistry(rows, meta, onProgress) {
  let done = 0;
  const failed = [];
  const docOf = (r) => storable({ code: r.code, t: r.t, tenders: r.tenders || [], paid: r.paid || null, paid_parts: r.paid_parts || null, paid_2026: r.paid_2026 || null });
  for (let i = 0; i < rows.length; i += REG_BATCH) {
    const part = rows.slice(i, i + REG_BATCH);
    const batch = fb.writeBatch(db);
    for (const r of part) batch.set(fb.doc(db, 'registry', regId(r.code)), docOf(r), { merge: true });
    try {
      await batch.commit();
    } catch (e) {
      if (e && e.code !== 'permission-denied' && e.code !== 'invalid-argument') throw e;
      for (const r of part) {
        try { await fb.setDoc(fb.doc(db, 'registry', regId(r.code)), docOf(r), { merge: true }); } catch (e2) { failed.push(r.code); }
      }
      if (failed.length === rows.length || (i === 0 && failed.length === part.length)) throw e;  // nothing goes through: no access
    }
    done += part.length;
    onProgress && onProgress(done, rows.length);
  }
  await fb.setDoc(fb.doc(db, 'registryMeta', 'import'), Object.assign(storable(meta), {
    by: current.uid, byName: current.displayName || current.email || '', at: fb.serverTimestamp(), failed: failed.slice(0, 50),
  }));
  return { failed };
}

// A field to remove in updateRegistry (a lowered 3 drops its sign-off and its fact).
export const DEL = () => fb.deleteField();

// The sub-project's journal: comments, visits, checks and tasks, one document each, so two
// people writing at once never overwrite each other (registry/{code}/entries/{id}).
export function watchEntries(code, cb) {
  return fb.onSnapshot(fb.query(fb.collection(db, 'registry', regId(code), 'entries'), fb.orderBy('at', 'desc'), fb.limit(500)), (snap) => {
    const out = [];
    snap.forEach((d) => out.push(Object.assign({ id: d.id }, d.data(), { at: toDate(d.data().at), updatedAt: toDate(d.data().updatedAt) })));
    cb(out);
  }, () => cb(null));
}
export function addEntry(code, e) {
  return fb.addDoc(fb.collection(db, 'registry', regId(code), 'entries'), Object.assign(storable(e), {
    by: current.uid, byName: current.displayName || current.email || '', at: fb.serverTimestamp(),
  }));
}
// The whole team's journal at once (every sub-project's entries): for the bell, the portfolio and
// the export. Map regId → [entries].
export function watchAllEntries(cb) {
  return fb.onSnapshot(fb.query(fb.collectionGroup(db, 'entries'), fb.limit(8000)), (snap) => {
    const by = new Map();
    snap.forEach((d) => {
      const code = d.ref.parent.parent ? d.ref.parent.parent.id : '';
      if (!by.has(code)) by.set(code, []);
      by.get(code).push(Object.assign({ id: d.id }, d.data(), { at: toDate(d.data().at), updatedAt: toDate(d.data().updatedAt) }));
    });
    cb(by);
  }, () => cb(null));
}
// An entry with an id of our own: moving the old journal over twice writes it once.
export function setEntry(code, id, e) {
  return fb.setDoc(fb.doc(db, 'registry', regId(code), 'entries', id), Object.assign(storable(e), {
    by: current.uid, byName: current.displayName || current.email || '', at: fb.serverTimestamp(),
  }));
}
// The changes this person has seen (signal ids), kept with their profile.
export function saveSigSeen(ids) {
  return fb.setDoc(fb.doc(db, 'users', current.uid), { sigSeen: ids.slice(-2000) }, { merge: true });
}
export function updateEntry(code, id, patch) {
  return fb.updateDoc(fb.doc(db, 'registry', regId(code), 'entries', id), Object.assign(storable(patch), {
    updatedBy: current.uid, updatedAt: fb.serverTimestamp(),
  }));
}
export function deleteEntry(code, id) {
  return fb.deleteDoc(fb.doc(db, 'registry', regId(code), 'entries', id));
}

// Our side of one sub-project: confirmed links, Prozorro data, risk hints, a note.
export function updateRegistry(code, patch) {
  return fb.setDoc(fb.doc(db, 'registry', regId(code)), Object.assign(storable(patch), {
    updatedBy: current.uid, updatedByName: current.displayName || current.email || '', updatedAt: fb.serverTimestamp(),
  }), { merge: true });
}
