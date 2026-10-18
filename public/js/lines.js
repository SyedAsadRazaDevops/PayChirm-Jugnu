// Text the Screen shows and says for one payment event.

const SYMBOL = { PKR: 'Rs', INR: '₹', USD: '$', AED: 'AED' };
const WORD = {
  en: { PKR: 'rupees', INR: 'rupees', USD: 'dollars', AED: 'dirhams' },
  ur: { PKR: 'روپے', INR: 'روپے', USD: 'ڈالر', AED: 'درہم' },
  hi: { PKR: 'रुपये', INR: 'रुपये', USD: 'डॉलर', AED: 'दिरहम' },
};

export function formatNumber(amount, currency) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return Number(amount).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** "Rs 2,500" for display. */
export function displayMoney(amount, currency) {
  const sym = SYMBOL[currency] ?? currency ?? '';
  return `${sym}${sym.length > 1 ? ' ' : ''}${formatNumber(amount, currency)}`;
}

/** What the voice says. Falls back to English when the device has no voice for `lang` (see Sound.speak). */
export function speechLine(e, lang) {
  const cur = e.currency || 'PKR';
  const num = formatNumber(e.amount, cur);
  const who = e.senderName;
  const unverified = e.status === 'unverified';
  const w = WORD[lang] ?? WORD.en;
  const unit = w[cur] ?? cur;
  if (lang === 'ur') {
    return `${unverified ? 'غیر تصدیق شدہ ادائیگی' : 'ادائیگی موصول ہوئی'}۔ ${who ? who + ' کی طرف سے ' : ''}${num} ${unit}۔${unverified ? ' براہ کرم چیک کریں۔' : ''}`;
  }
  if (lang === 'hi') {
    return `${unverified ? 'असत्यापित भुगतान' : 'भुगतान प्राप्त हुआ'}। ${who ? who + ' से ' : ''}${num} ${unit}।${unverified ? ' कृपया जाँच करें।' : ''}`;
  }
  return `${unverified ? 'Unverified payment' : 'Payment received'}. ${num} ${unit}${who ? ' from ' + who : ''}.${unverified ? ' Please check.' : ''}`;
}

export function englishLine(e) {
  return speechLine(e, 'en');
}

const REASONS = {
  untrusted_sender: 'Sender is not on the trusted list',
  duplicate: 'Duplicate alert ignored',
  nothing_to_read: 'Message had nothing to read (one-time password only)',
  promotion: 'Promotion ignored',
  scam_suspected: 'Suspected scam message ignored',
  otp: 'Security-code message ignored',
  not_a_credit: 'Not a credit alert (money left the account)',
  unreadable: 'Alert could not be read',
  low_confidence: 'Gemini was not sure this is a genuine credit',
  amount_mismatch: 'Amount does not match the expected amount',
  amount_not_in_text: 'Amount could not be double-checked in the alert',
  stale_alert: 'Alert time is old, possibly a replay',
  expected_match: 'Matches the expected amount',
  ok: 'Genuine credit alert',
};

export const reasonText = (code) => REASONS[code] ?? code;
