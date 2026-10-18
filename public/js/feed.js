// The Screen's live feed. Two transports behind one interface:
//   - Firestore realtime listener (Cloud Run + Firebase deployment)
//   - Server-Sent Events from the local server (no credentials needed)
// Both report link status as 'live' | 'reconnecting' | 'offline'.

const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

/** Turns raw trouble signals into a calm three-state status. */
class LinkMonitor {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.state = null;
    this.timer = null;
    window.addEventListener('offline', () => this._set('offline'));
    window.addEventListener('online', () => this.trouble());
  }
  _set(s) {
    if (s === this.state) return;
    this.state = s;
    this.onStatus(s);
  }
  live() {
    clearTimeout(this.timer);
    this.timer = null;
    this._set(navigator.onLine ? 'live' : 'offline');
  }
  trouble() {
    if (!navigator.onLine) { this._set('offline'); return; }
    this._set('reconnecting');
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.state !== 'live') this._set('offline');
      }, 12000);
    }
  }
}

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.code = data.error || String(res.status);
    throw err;
  }
  return data;
}

/**
 * Join a shop and start listening.
 * handlers: onStatus(state), onHistory(eventsOldestFirst), onEvent(event), onFatal(message)
 * Returns { shop, close() }.
 */
export async function connectFeed(code, handlers) {
  const monitor = new LinkMonitor(handlers.onStatus);
  monitor.trouble();
  const cfg = await fetch('/api/config').then((r) => r.json());

  if (cfg.store === 'firestore') return firestoreFeed(code, cfg, handlers, monitor);
  return streamFeed(code, handlers, monitor);
}

async function streamFeed(code, handlers, monitor) {
  const shop = await postJson('/api/pair', { code });
  let es = null;
  let closed = false;
  let retry = null;
  const open = () => {
    es = new EventSource(`/api/stream?code=${encodeURIComponent(code)}`);
    es.onopen = () => monitor.live();
    es.onerror = () => {
      monitor.trouble();
      if (es.readyState === EventSource.CLOSED && !closed) retry = setTimeout(open, 3000);
    };
    es.addEventListener('history', (e) => { monitor.live(); handlers.onHistory(JSON.parse(e.data)); });
    es.addEventListener('alert', (e) => handlers.onEvent(JSON.parse(e.data)));
  };
  open();
  return { shop, mode: 'local stream', close() { closed = true; clearTimeout(retry); es?.close(); } };
}

async function firestoreFeed(code, cfg, handlers, monitor) {
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  // Firebase Hosting serves the web app config at a reserved URL; FIREBASE_WEB_CONFIG overrides it.
  const firebaseConfig = cfg.firebase || (await fetch('/__/firebase/init.json').then((r) => {
    if (!r.ok) throw new Error('Firebase web app config not found. Register a web app (see README).');
    return r.json();
  }));
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  const idToken = await auth.currentUser.getIdToken();
  const shop = await postJson('/api/pair', { code, idToken });

  const db = fs.getFirestore(app);
  const q = fs.query(fs.collection(db, 'shops', shop.shopId, 'events'), fs.orderBy('createdAt', 'desc'), fs.limit(20));
  let historyDone = false;
  const toEvent = (d) => ({ id: d.id, ...d.data() });
  const unsub = fs.onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) monitor.trouble(); else monitor.live();
      if (!historyDone) {
        // The first snapshot from the server is history, never announced. A cache-only snapshot is ignored.
        if (snap.metadata.fromCache) return;
        historyDone = true;
        handlers.onHistory(snap.docs.map(toEvent).reverse());
        return;
      }
      for (const change of snap.docChanges()) {
        if (change.type === 'added') handlers.onEvent(toEvent(change.doc));
      }
    },
    (err) => {
      monitor.trouble();
      if (err && err.code === 'permission-denied') handlers.onFatal('This screen is no longer paired. Enter the pairing code again.');
    },
  );
  return { shop, mode: 'Firestore', close() { unsub(); } };
}
