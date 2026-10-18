// Fills the {{placeholders}} in a synthetic sample alert. Shared by the alert
// console (browser) and the unit tests (Node), so it is plain ES-module JS.

const DIGITS = {
  ur: '۰۱۲۳۴۵۶۷۸۹', // Extended Arabic-Indic digits, used in Urdu
  hi: '०१२३४५६७८९', // Devanagari digits, used in Hindi
};

export function formatAmount(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toNativeDigits(str, script) {
  const set = DIGITS[script];
  return set ? String(str).replace(/\d/g, (d) => set[Number(d)]) : String(str);
}

/** Date and time as a bank would print them, in the shop's own time zone: "17-Oct-2026" and "21:05". */
export function formatShopNow(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('day')}-${get('month')}-${get('year')}`, time: `${get('hour')}:${get('minute')}` };
}

/** A fresh synthetic transaction reference, e.g. "JA48210937". */
export function newRef(rand = Math.random) {
  let digits = '';
  for (let i = 0; i < 8; i += 1) digits += Math.floor(rand() * 10);
  return `JA${digits}`;
}

/** Replace {{amount}}, {{amount:ur}}, {{amount:hi}}, {{name}}, {{ref}}, {{date}}, {{time}}. */
export function renderTemplate(template, { amount, name, ref, date, time }) {
  const money = formatAmount(amount);
  return template
    .replace(/\{\{amount:(ur|hi)\}\}/g, (_m, script) => toNativeDigits(money, script))
    .replace(/\{\{amount\}\}/g, money)
    .replace(/\{\{name\}\}/g, name ?? '')
    .replace(/\{\{ref\}\}/g, ref)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time);
}
