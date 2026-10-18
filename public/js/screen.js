import { Sound } from './audio.js';
import { connectFeed } from './feed.js';
import { displayMoney, englishLine, reasonText, speechLine } from './lines.js';

const POPUP_MS = 5000;
const GAP_MS = 350;
const DELAYED_AFTER_MS = 60_000;
const $ = (id) => document.getElementById(id);

const sound = new Sound();
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const state = {
  feed: null,
  shop: null,
  lang: store.get('jugnu.lang', 'en'),
  queue: [],
  showing: false,
  seen: new Set(),
  popupTimer: null,
  toastTimer: null,
  wakeLock: null,
};

// ---------------------------------------------------------------- link status
const LABEL = { live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' };
function setLink(s) {
  $('link').dataset.state = s;
  $('link-label').textContent = LABEL[s] ?? s;
}

// ---------------------------------------------------------------- views
function show(view) {
  $('pair').hidden = view !== 'pair';
  $('idle').hidden = view !== 'idle';
  $('gear').hidden = false;
}

function renderIdle(shop) {
  $('shop-name').textContent = shop.name;
  $('shop-account').textContent = shop.accountNumber ? `Account ${shop.accountNumber}` : '';
  document.title = `${shop.name} · Jugnu Alert Screen`;
  const box = $('qr');
  box.textContent = '';
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(shop.qrPayload || `${shop.name} ${shop.accountNumber}`);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
  } catch (err) {
    box.textContent = 'QR unavailable';
    console.error(err);
  }
  show('idle');
}

function showPairError(msg) {
  const el = $('pair-error');
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------------------------------------------------------------- queue and popup
function enqueue(e) {
  if (e.id && state.seen.has(e.id)) return;
  if (e.id) state.seen.add(e.id);
  noteLast(e);

  if (e.status === 'rejected') {
    toast(`Rejected: ${reasonText(e.reasonCode)}${e.senderName && e.reasonCode === 'untrusted_sender' ? ` (${e.senderName})` : ''}`);
    return;
  }
  state.queue.push(e);
  pump();
}

function pump() {
  if (state.showing) { updateQueueBadge(); return; }
  const e = state.queue.shift();
  if (!e) return;
  state.showing = true;
  showPopup(e);
  state.popupTimer = setTimeout(() => {
    hidePopup();
    state.showing = false;
    setTimeout(pump, GAP_MS);
  }, POPUP_MS);
}

function updateQueueBadge() {
  const n = state.queue.length;
  const el = $('pop-queue');
  el.hidden = n === 0;
  el.textContent = n === 1 ? '1 more waiting' : `${n} more waiting`;
}

function showPopup(e) {
  const unverified = e.status === 'unverified';
  const pop = $('popup');
  pop.dataset.kind = unverified ? 'unverified' : 'verified';
  const money = displayMoney(e.amount, e.currency);
  $('pop-kicker').textContent = unverified ? 'Unverified: check before releasing goods' : 'Payment received';
  const amt = $('pop-amount');
  amt.textContent = money;
  amt.style.setProperty('--chars', String(Math.max(4, money.length)));
  $('pop-from').textContent = e.senderName ?? '';
  $('pop-from').hidden = !e.senderName;

  const bits = [];
  if (e.reference) bits.push(`Ref ${e.reference}`);
  if (e.time) bits.push(new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  if (e.createdAt && Date.now() - e.createdAt > DELAYED_AFTER_MS) bits.push('delayed');
  $('pop-meta').textContent = bits.join('  ·  ');

  const warn = $('pop-warning');
  warn.hidden = !unverified;
  warn.textContent = unverified ? reasonText(e.reasonCode) : '';

  pop.style.setProperty('--popup-ms', `${POPUP_MS}ms`);
  // restart the countdown and entrance animation
  pop.hidden = true;
  void pop.offsetWidth;
  pop.hidden = false;
  updateQueueBadge();

  const wait = sound.chime(unverified ? 'unverified' : 'verified');
  sound.speak(speechLine(e, state.lang), state.lang, englishLine(e));
  void wait;
}

function hidePopup() {
  $('popup').hidden = true;
  sound.stopSpeaking();
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

function noteLast(e) {
  if (e.status === 'rejected' || e.amount == null) return;
  const el = $('last');
  const t = e.time ? new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  el.textContent = `Last payment: ${displayMoney(e.amount, e.currency)}${e.senderName ? ` from ${e.senderName}` : ''}${t ? ` · ${t}` : ''}${e.status === 'unverified' ? ' (unverified)' : ''}`;
  el.hidden = false;
}

// ---------------------------------------------------------------- joining a shop
async function join(rawCode) {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return;
  showPairError('');
  setLink('reconnecting');
  state.feed?.close();
  state.feed = null;
  state.seen.clear();
  state.queue = [];
  try {
    const feed = await connectFeed(code, {
      onStatus: setLink,
      onHistory: (events) => {
        for (const e of events) if (e.id) state.seen.add(e.id);
        const lastPaid = [...events].reverse().find((e) => e.status !== 'rejected' && e.amount != null);
        if (lastPaid) noteLast(lastPaid);
      },
      onEvent: enqueue,
      onFatal: (msg) => { unpair(); showPairError(msg); },
    });
    state.feed = feed;
    state.shop = feed.shop;
    store.set('jugnu.code', code);
    if (!store.get('jugnu.lang') && feed.shop.language) { state.lang = feed.shop.language; $('lang').value = state.lang; }
    $('feed-note').textContent = `Connected to ${feed.shop.name} through ${feed.mode}.`;
    renderIdle(feed.shop);
    refreshSoundPill();
  } catch (err) {
    setLink('offline');
    showPairError(err.code === 'unknown_code' ? 'No shop has that pairing code. Check it and try again.' : `Could not connect: ${err.message}`);
    show('pair');
    if (err.code === 'unknown_code') store.del('jugnu.code');
  }
}

function unpair() {
  state.feed?.close();
  state.feed = null;
  state.shop = null;
  store.del('jugnu.code');
  hidePopup();
  state.showing = false;
  clearTimeout(state.popupTimer);
  setLink('offline');
  $('link-label').textContent = 'Not connected';
  show('pair');
}

// ---------------------------------------------------------------- sound, full screen, wake lock
function refreshSoundPill() {
  $('sound-pill').hidden = sound.ready || !state.shop;
}

async function startSound() {
  await sound.unlock();
  refreshSoundPill();
}

async function keepAwake() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* not supported or denied */ }
}

async function goFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape');
  } catch { /* optional */ }
  await keepAwake();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.shop) keepAwake();
});

// ---------------------------------------------------------------- wiring
$('pair-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  await startSound(); // the tap on "Join shop" is the gesture browsers need
  join($('code').value);
});
$('use-demo').addEventListener('click', () => { $('code').value = 'JUGNU-DEMO'; $('pair-form').requestSubmit(); });
$('sound-pill').addEventListener('click', startSound);
document.addEventListener('pointerdown', () => { if (!sound.ready) startSound(); }, { once: false });

$('gear').addEventListener('click', () => {
  const panel = $('settings');
  panel.hidden = !panel.hidden;
  $('gear').setAttribute('aria-expanded', String(!panel.hidden));
});
$('volume').addEventListener('input', (e) => { sound.volume = Number(e.target.value) / 100; });
$('lang').value = state.lang;
$('lang').addEventListener('change', (e) => {
  state.lang = e.target.value;
  store.set('jugnu.lang', state.lang);
  updateVoiceNote();
});
function updateVoiceNote() {
  $('voice-note').textContent =
    state.lang === 'en' || sound.hasVoice(state.lang)
      ? ''
      : 'This device has no voice for that language, so the chime plays and the line is spoken in English.';
}
setTimeout(updateVoiceNote, 800);

const sampleEvent = (status) => ({ amount: 2500, currency: state.shop?.currency ?? 'PKR', senderName: 'Test Sender', reference: 'TEST0001', time: new Date().toISOString(), status, reasonCode: status === 'unverified' ? 'amount_mismatch' : 'ok' });
$('test-ok').addEventListener('click', async () => { await startSound(); state.queue.push(sampleEvent('verified')); pump(); });
$('test-warn').addEventListener('click', async () => { await startSound(); state.queue.push(sampleEvent('unverified')); pump(); });
$('fullscreen').addEventListener('click', goFullscreen);
$('unpair').addEventListener('click', () => { $('settings').hidden = true; unpair(); });

// ---------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const startCode = params.get('code') || store.get('jugnu.code', '');
if (startCode) {
  $('code').value = startCode;
  join(startCode);
} else {
  show('pair');
}
