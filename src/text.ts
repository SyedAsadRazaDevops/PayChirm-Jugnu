import { createHash } from 'node:crypto';

/** Arabic-Indic, Extended Arabic-Indic (Urdu) and Devanagari digits to ASCII. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹०-९]/g, (ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 0x0966) return String(c - 0x0966);
    if (c >= 0x06f0) return String(c - 0x06f0);
    return String(c - 0x0660);
  });
}

// ---------------------------------------------------------------------------
// Trusted sender
// ---------------------------------------------------------------------------

const squash = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Sender IDs are compared exactly after upper-casing and dropping punctuation.
 * Indian DLT headers such as "VM-SAMPLEBANK" or "AD-SAMPLEBANK-S" (two-letter
 * route prefix, optional one-letter suffix) are also accepted. Look-alikes such
 * as "SAMPLEBANK2" or "SAMPLEBANKS" are not.
 */
export function isTrustedSender(sender: string, trusted: string[]): boolean {
  const raw = sender.trim().toUpperCase();
  if (!raw) return false;
  const candidates = new Set<string>([squash(raw)]);
  const dlt = raw.match(/^[A-Z]{2}-([A-Z0-9]{3,})(?:-[A-Z])?$/);
  if (dlt) candidates.add(squash(dlt[1]));
  return trusted.some((t) => {
    const s = squash(t);
    return s.length > 0 && candidates.has(s);
  });
}

// ---------------------------------------------------------------------------
// OTP and balance removal
// ---------------------------------------------------------------------------

const OTP_RE =
  /\b(?:otp|one[\s-]?time\s+(?:pass(?:word|code)?|pin|code)|verification\s+code|security\s+code|auth(?:entication)?\s+code|login\s+code|cvv|mpin|tpin|pin|password|passcode|(?:do\s*not|don'?t|never)\s+share)\b|ओटीपी|वन\s?टाइम|साझा\s+न\s+करें|او\s?ٹی\s?پی|ون\s?ٹائم|شیئر\s+نہ\s+کریں/iu;

const AMT = String.raw`\d[\d,]*(?:\.\d+)?`;
const BALANCE_RES: RegExp[] = [
  // English / Roman Urdu / Roman Hindi: "Avl Bal: Rs. 48,250.75", "Balance INR 1,02,340.50", "Bal Rs 9,870"
  new RegExp(
    String.raw`\b(?:(?:avail(?:able)?|avl|current|closing|ledger|total|main|remaining|updated|new)\.?\s+)?bal(?:ance)?\.?\s*(?:is|of|:|-|=|stands\s+at|now)?\s*(?:(?:rs|pkr|inr|usd|aed)\.?|₹|rupees?)?\s*${AMT}(?:\s*(?:cr|dr)\b)?`,
    'giu',
  ),
  // Urdu
  new RegExp(String.raw`(?:موجودہ\s+)?(?:بیلنس|بقایا)\s*[:\-]?\s*(?:(?:rs|pkr)\.?|₹)?\s*${AMT}\s*(?:روپے|روپیہ)?`, 'giu'),
  // Hindi
  new RegExp(String.raw`(?:बैलेंस|शेष(?:\s+राशि)?|उपलब्ध\s+राशि)\s*[:\-]?\s*(?:(?:rs|inr)\.?|₹|रु\.?)?\s*${AMT}\s*(?:रुपये|रुपए)?`, 'giu'),
];

const ABBREV = /(?:^|\s)(?:rs|no|ref|a\/c|ac|avl|bal|inr|pkr|usd|mr|mrs|ms|dr|txn|tid|st|vs|approx)\.$/i;

/** Split a line into sentences without breaking on "Rs." or "A/c.". */
function splitSentences(line: string): string[] {
  const parts = line.split(/(?<=[.!?۔।])\s+/u);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

const CLAUSE_SPLIT = /[;,،]\s+|\s[-–—]\s/u;

export interface SanitizeResult {
  /** Text that may be sent to Gemini: digits normalised, OTP and balance removed. */
  cleaned: string;
  removed: { otp: number; balance: number };
}

const MAX_CLEAN_CHARS = 1200;

/**
 * Remove one-time-password sentences/clauses and balance figures.
 *
 * Works clause by clause so that "Rs 500 credited, do not share your OTP" keeps
 * the credit information and drops only the OTP clause.
 */
export function stripSensitive(raw: string): SanitizeResult {
  const text = normalizeDigits(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\r\n?/g, '\n');
  const removed = { otp: 0, balance: 0 };
  const outLines: string[] = [];

  for (const line of text.split('\n')) {
    const keptSentences: string[] = [];
    for (const sentence of splitSentences(line)) {
      const keptClauses: string[] = [];
      for (const clause of sentence.split(CLAUSE_SPLIT)) {
        if (OTP_RE.test(clause)) {
          removed.otp += 1;
          continue;
        }
        let c = clause;
        for (const re of BALANCE_RES) {
          c = c.replace(re, () => {
            removed.balance += 1;
            return ' ';
          });
        }
        c = c.replace(/\s{2,}/g, ' ').trim();
        // Drop clauses left holding only punctuation after a removal.
        if (/[\p{L}\p{N}]/u.test(c)) keptClauses.push(c);
      }
      if (keptClauses.length > 0) keptSentences.push(keptClauses.join(', '));
    }
    const l = keptSentences.join(' ').trim();
    if (l) outLines.push(l);
  }
  return { cleaned: outLines.join('\n').slice(0, MAX_CLEAN_CHARS), removed };
}

// ---------------------------------------------------------------------------
// Light-weight field spotting (duplicate fingerprint, mock Gemini, sanity checks)
// ---------------------------------------------------------------------------

const REF_RE = new RegExp(
  String.raw`(?:\bref(?:erence)?(?:\s*(?:no|number|id|#))?\.?|\btxn(?:\s*(?:id|no))?\.?|\btid\b|\butr\b|\btransaction\s*(?:id|no|number)\.?|\btrx\s*id|ٹرانزیکشن\s*(?:آئی\s*ڈی|نمبر)?|संदर्भ\s*(?:संख्या|नंबर)?|ट्रांजैक्शन\s*(?:आईडी|नंबर)?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-/]{4,29})`,
  'iu',
);

/** Transaction reference as written in the (digit-normalised) text, or null. Must contain a digit. */
export function extractReference(text: string): string | null {
  const m = normalizeDigits(text).match(REF_RE);
  if (!m) return null;
  const ref = m[1].replace(/[-/]+$/, '');
  return /\d/.test(ref) ? ref.toUpperCase() : null;
}

const CUR = String.raw`\b(?:rs|pkr|inr|usd|aed)\b\.?|₹|रु(?:पये|पए)?\.?`;
const CUR_AFTER = String.raw`(?:\b(?:rs|pkr|inr|rupees?|rupay[ae])\b|روپے|روپیہ|रुपये|रुपए|रु\b)`;
const AMOUNT_RE = new RegExp(String.raw`(?:${CUR})\s*(${AMT})|(${AMT})\s*(?:${CUR_AFTER})`, 'iu');

/** First currency-marked amount in the text, or null. */
export function extractAmount(text: string): number | null {
  const m = normalizeDigits(text).match(AMOUNT_RE);
  if (!m) return null;
  const n = parseFloat((m[1] ?? m[2]).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Every number written in the text (commas removed). Used to confirm an extracted amount is really there. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of normalizeDigits(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = parseFloat(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export const sameAmount = (a: number, b: number): boolean => Math.round(a * 100) === Math.round(b * 100);

const DATE_RE = /\b\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3,9})[-/ .]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i;

export interface Fingerprint {
  key: string;
  basis: 'fields' | 'text';
}

/**
 * Duplicate fingerprint, computed BEFORE Gemini runs. When the cleaned text
 * carries a reference and an amount the key is shop + reference + amount +
 * date + time. Otherwise it falls back to the normalised cleaned text. Only
 * this hash is kept, never the text.
 */
export function fingerprint(shopId: string, cleaned: string): Fingerprint {
  const text = normalizeDigits(cleaned);
  const ref = extractReference(text);
  const amount = extractAmount(text);
  let material: string;
  let basis: Fingerprint['basis'];
  if (ref && amount !== null) {
    const date = (text.match(DATE_RE)?.[0] ?? '').toLowerCase().replace(/\s+/g, ' ');
    const time = (text.match(TIME_RE)?.[0] ?? '').toLowerCase().replace(/\s+/g, '');
    material = ['f', shopId, ref, amount.toFixed(2), date, time].join('|');
    basis = 'fields';
  } else {
    material = ['t', shopId, text.toLowerCase().replace(/\s+/g, ' ').trim()].join('|');
    basis = 'text';
  }
  return { key: createHash('sha256').update(material).digest('hex').slice(0, 40), basis };
}

// ---------------------------------------------------------------------------
// Time zone helper
// ---------------------------------------------------------------------------

/** UTC offset of an IANA zone at `at`, as "+05:00". Falls back to "+00:00". */
export function tzOffset(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return '+00:00';
    return `${m[1]}${m[2].padStart(2, '0')}:${m[3] ?? '00'}`;
  } catch {
    return '+00:00';
  }
}
