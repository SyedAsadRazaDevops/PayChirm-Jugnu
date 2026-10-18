import { formatShopNow, newRef, renderTemplate } from './template.js';
import { reasonText } from './lines.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};

const app = { shop: null, samples: [], current: null, dirty: false, last: null, busy: false };

// ------------------------------------------------------------------ setup
async function loadConfig() {
  try {
    const cfg = await fetch('/api/config').then((r) => r.json());
    const g = $('badge-gemini');
    g.textContent = cfg.gemini.mock ? 'Gemini: MOCK (no model called)' : `Gemini: ${cfg.gemini.label}`;
    g.className = `chip ${cfg.gemini.mock ? 'mock' : 'verified'}`;
    $('badge-store').textContent = `Relay: ${cfg.store === 'firestore' ? 'Firestore' : 'local memory'}`;
  } catch {
    $('badge-gemini').textContent = 'Server not reachable';
    $('badge-gemini').className = 'chip rejected';
  }
}

async function loadSamples() {
  const data = await fetch('samples/alerts.json').then((r) => r.json());
  app.samples = data.samples;
  if (data.notice) $('notice').textContent = data.notice.split('. Placeholders')[0] + '. This console stands in for the Android Connector phone: it calls the same POST /api/alerts endpoint.';
  const sel = $('sample');
  const groups = new Map();
  for (const s of app.samples) {
    if (!groups.has(s.group)) groups.set(s.group, el('optgroup', { label: s.group }));
    groups.get(s.group).append(el('option', { value: s.id, textContent: s.title }));
  }
  for (const g of groups.values()) sel.append(g);
  pickSample(app.samples[0].id);
}

async function joinShop() {
  const code = $('code').value.trim();
  $('shop-line').textContent = 'Joining…';
  try {
    const res = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Could not join');
    app.shop = data;
    $('shop-line').textContent = `Joined ${data.name} (${data.shopId}, ${data.timezone}).`;
    $('open-screen').href = `./?code=${encodeURIComponent(code)}`;
    render();
  } catch (err) {
    app.shop = null;
    $('shop-line').textContent = err.message;
  }
}

// ------------------------------------------------------------------ sample rendering
function fill(sample, amount) {
  const { date, time } = formatShopNow(app.shop?.timezone ?? 'UTC');
  return renderTemplate(sample.template, { amount, name: sample.name, ref: newRef(), date, time });
}

function pickSample(id) {
  app.current = app.samples.find((s) => s.id === id);
  $('sample').value = id;
  $('sender').value = app.current.sender;
  $('amount').value = app.current.amount;
  app.dirty = false;
  render();
}

function render() {
  if (!app.current) return;
  $('text').value = fill(app.current, Number($('amount').value) || app.current.amount);
  app.dirty = false;
}

// ------------------------------------------------------------------ sending
async function send(payload, label) {
  if (app.busy) return;
  if (!app.shop) { showError('Join a shop first (enter a pairing code and press Join).'); return; }
  app.busy = true;
  setButtons(true);
  $('result').className = 'result';
  $('result').textContent = 'Sending…';
  try {
    const res = await fetch('/api/alerts?debug=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shopId: app.shop.shopId, ...payload }) });
    const data = await res.json();
    if (!res.ok) {
      showError(`${data.error ?? res.status}: ${data.message ?? 'Request failed'}${data.retryable ? ' (safe to send again)' : ''}`);
      return;
    }
    app.last = payload;
    $('send-again').disabled = false;
    showResult(data, payload, label);
    addHistory(data, label);
  } catch (err) {
    showError(`Network error: ${err.message}`);
  } finally {
    app.busy = false;
    setButtons(false);
  }
}

function setButtons(disabled) {
  for (const id of ['send', 'send-fake']) $(id).disabled = disabled;
  $('send-again').disabled = disabled || !app.last;
}

function currentPayload() {
  const payload = { sender: $('sender').value, text: $('text').value };
  const exp = $('expected').value.trim();
  if (exp) payload.expectedAmount = Number(exp);
  return payload;
}

// ------------------------------------------------------------------ results
function showError(msg) {
  const r = $('result');
  r.className = 'result';
  r.replaceChildren(el('p', { className: 'err', textContent: msg }));
}

function showResult(data, payload, label) {
  const r = $('result');
  r.className = 'result';
  const e = data.event;

  const outcome = el('div', { className: 'outcome' }, el('span', { className: `chip ${data.status}`, textContent: data.status }), el('span', { className: 'reason', textContent: reasonText(data.reasonCode) }));
  const announce = el('p', {
    className: 'announce',
    textContent:
      data.announce === 'confirmed' ? 'The Screen announces this as a confirmed payment.'
      : data.announce === 'unverified' ? 'The Screen shows this as UNVERIFIED. It is never announced as confirmed.'
      : 'The Screen does not announce this. It only shows a short rejection notice.',
  });

  const steps = el('ol', { className: 'steps' });
  for (const s of data.steps) {
    steps.append(el('li', {}, el('span', { className: `mark ${s.ok ? 'ok' : 'no'}`, textContent: s.ok ? '✓' : '✗' }), el('span', {}, el('span', { className: 'name', textContent: s.name }), s.detail)));
  }

  const kv = el('table', { className: 'kv' });
  const rows = [
    ['amount', e.amount === null ? '(none)' : `${e.amount} ${e.currency ?? ''}`],
    ['senderName', e.senderName ?? '(none)'],
    ['reference', e.reference ?? '(none)'],
    ['time', e.time],
    ['status', e.status],
  ];
  for (const [k, v] of rows) kv.append(el('tr', {}, el('th', { textContent: k }), el('td', { textContent: v })));

  r.replaceChildren(
    outcome,
    announce,
    steps,
    el('p', { className: 'hint', textContent: 'Stored in the relay (the only data kept; the raw alert text is never stored):' }),
    kv,
    detail('Alert that was sent', `Sender ID: ${payload.sender}${payload.expectedAmount ? `\nExpected amount: ${payload.expectedAmount}` : ''}\n\n${payload.text}`),
  );
  if (data.cleanedText !== undefined) {
    r.append(detail('What Gemini saw (OTP and balances removed)', data.cleanedText || '(nothing left)'));
  }
}

function detail(title, text) {
  return el('details', {}, el('summary', { textContent: title }), el('pre', { className: 'text', textContent: text }));
}

function addHistory(data, label) {
  const list = $('history');
  if (list.firstElementChild?.classList.contains('muted')) list.replaceChildren();
  const e = data.event;
  const amount = e.amount === null ? '' : ` ${e.amount} ${e.currency ?? ''}`;
  const li = el('li', {}, el('span', { className: 't', textContent: new Date().toLocaleTimeString() }), el('span', { className: `chip ${data.status}`, textContent: data.status }), `${label}${amount} · ${reasonText(data.reasonCode)}`);
  list.prepend(li);
  while (list.children.length > 8) list.lastElementChild.remove();
}

// ------------------------------------------------------------------ wiring
$('join').addEventListener('click', joinShop);
$('code').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') joinShop(); });
$('sample').addEventListener('change', (ev) => pickSample(ev.target.value));
$('amount').addEventListener('input', () => { if (!app.dirty) render(); });
$('text').addEventListener('input', () => { app.dirty = true; });

$('send').addEventListener('click', async () => {
  const title = app.current?.title ?? 'custom alert';
  await send(currentPayload(), app.dirty ? 'custom text' : title);
  if (!app.dirty) render(); // fresh reference and time for the next alert
});

$('send-fake').addEventListener('click', async () => {
  const fake = app.samples.find((s) => s.id === 'fake-untrusted');
  await send({ sender: fake.sender, text: fill(fake, fake.amount) }, 'FAKE alert');
});

$('send-again').addEventListener('click', () => {
  if (app.last) send(app.last, 'same alert again');
});

$('exp-match').addEventListener('click', () => { $('expected').value = $('amount').value; });
$('exp-miss').addEventListener('click', () => { $('expected').value = String((Number($('amount').value) || 0) + 500); });
$('exp-clear').addEventListener('click', () => { $('expected').value = ''; });

const params = new URLSearchParams(location.search);
if (params.get('code')) $('code').value = params.get('code');

await loadConfig();
await loadSamples();
await joinShop();
