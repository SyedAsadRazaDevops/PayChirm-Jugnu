import { extractAmount, extractReference, normalizeDigits, tzOffset } from './text';
import type { AlertLanguage, Extraction, GeminiLike, GeminiReason, Shop } from './types';

/**
 * Offline stand-in for Gemini. Pure regex heuristics that understand the
 * synthetic samples in public/samples/alerts.json. It exists so the whole app
 * (and the test suite) runs with no credentials. It is NOT the product: the
 * UI labels it "mock" and real alerts are read by Gemini.
 */
export class MockGemini implements GeminiLike {
  readonly label = 'mock';
  readonly isMock = true;
  constructor(private readonly now: () => number = Date.now) {}

  async extract({ text, shop }: { text: string; shop: Shop }): Promise<Extraction> {
    return heuristicExtract(text, shop, this.now());
  }
}

const UR_L = '[\\u0621-\\u063A\\u0641-\\u064A\\u066E-\\u06D3]';
const HI_L = '[\\u0900-\\u0963\\u0966-\\u097F]';
const EN_NAME = String.raw`([A-Z][\p{L}'’-]*(?:[ \t]+[A-Z][\p{L}'’-]*){0,3})`;

const SENDER_PATTERNS: RegExp[] = [
  new RegExp(String.raw`[:：]\s*(${UR_L}+(?:[ \t]+${UR_L}+){0,2})[ \t]+کی[ \t]+طرف[ \t]+سے`, 'u'),
  new RegExp(String.raw`بھیجنے\s+والا\s*[:\-]\s*(${UR_L}+(?:[ \t]+${UR_L}+){0,2})`, 'u'),
  new RegExp(String.raw`(?:भेजने\s+वाले|प्रेषक)\s*[:\-]\s*(${HI_L}+(?:[ \t]+${HI_L}+){0,2})`, 'u'),
  new RegExp(String.raw`(?:[Bb]hejne\s+wal[ae]|[Bb]hejnay\s+wala|[Ss]ender)\s*[:\-]?\s*${EN_NAME}`, 'u'),
  new RegExp(String.raw`(?:\b[Ff]rom|\b[Bb]y)[ \t]+${EN_NAME}`, 'u'),
];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const pad = (n: number | string, w = 2): string => String(n).padStart(w, '0');

/** Find "dd-Mon-yyyy HH:mm" style times and return ISO 8601 in the shop's offset, or null. */
export function parseAlertTime(text: string, timeZone: string, nowMs: number): string | null {
  const t = normalizeDigits(text);
  const tm = t.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!tm) return null;
  let hh = parseInt(tm[1], 10);
  const mm = parseInt(tm[2], 10);
  const ss = tm[3] ? parseInt(tm[3], 10) : 0;
  const ap = tm[4]?.toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;

  let y: string | undefined;
  let mo: string | undefined;
  let d: string | undefined;

  for (const m of t.matchAll(/\b(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .](\d{2,4})\b/g)) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) {
      d = pad(m[1]);
      mo = mon;
      y = m[3].length === 2 ? `20${m[3]}` : m[3];
      break;
    }
  }
  if (!y) {
    const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) [, y, mo, d] = iso;
  }
  if (!y) {
    const dmy = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (dmy) {
      d = pad(dmy[1]);
      mo = pad(dmy[2]);
      y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    }
  }
  if (!y) {
    // Time only: assume today in the shop's time zone.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
    [y, mo, d] = today.split('-');
  }
  return `${y}-${mo}-${d}T${pad(hh)}:${pad(mm)}:${pad(ss)}${tzOffset(timeZone, new Date(nowMs))}`;
}

function detectLanguage(text: string): AlertLanguage {
  if (/[؀-ۿ]/.test(text)) return 'ur';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/\b(khate|khata|hue|prapt|bhugtan|shesh)\b/i.test(text)) return 'hi';
  if (/\b(aap\s*ke|jama|mosool|wasool|hain|gaye|raqam|bhejne\s+wala)\b/i.test(text)) return 'ur';
  return 'en';
}

function detectCurrency(text: string): string | null {
  const code = text.match(/\b(PKR|INR|USD|AED)\b/i);
  if (code) return code[1].toUpperCase();
  if (text.includes('₹')) return 'INR';
  if (/[؀-ۿ]/.test(text)) return 'PKR';
  if (/[ऀ-ॿ]/.test(text)) return 'INR';
  return null;
}

function findSender(text: string): string | null {
  for (const re of SENDER_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

const SCAM_RE = /https?:\/\/|www\.|\bclick\b|\bclaim\b|\bprize\b|\blottery\b|\bwinner\b|congratulations|انعام|इनाम/i;
const PROMO_RE = /\bcashback\b|\boffer\b|\bwin\b|\bdiscount\b|\bsale\b|ऑफर|آفر/i;
const OTP_MENTION_RE = /\botp\b|one[\s-]?time|verification code|ओटीपी|او\s?ٹی\s?پی/i;
const DEBIT_RE = /\b(debited|withdrawn|deducted|purchase|spent|paid to)\b|\bdebit\b|नामे|कट\s|कटे|निकाले|کٹ|کاٹ/i;
const CREDIT_RE = /\b(credited|received|deposited|credit|jama|mosool|wasool|prapt|mile)\b|जमा|प्राप्त|मिले|جمع|موصول|آمد/i;
const PENDING_RE = /\b(pending|subject to|may be|might|will reflect|processing|clearing|unconfirmed)\b/i;

export function heuristicExtract(rawText: string, shop: Shop, nowMs: number): Extraction {
  const text = normalizeDigits(rawText);
  const amount = extractAmount(text);
  const reference = extractReference(text);
  const senderName = findSender(text);
  const time = parseAlertTime(text, shop.timezone, nowMs);
  const language = detectLanguage(text);
  const currency = detectCurrency(text);

  const credit = CREDIT_RE.test(text);
  const debit = DEBIT_RE.test(text) && !credit;

  let reason: GeminiReason;
  let confidence: number;
  if (SCAM_RE.test(text)) {
    reason = 'scam';
    confidence = 0.92;
  } else if (PROMO_RE.test(text) && !credit) {
    reason = 'promotion';
    confidence = 0.9;
  } else if (OTP_MENTION_RE.test(text) && amount === null) {
    reason = 'otp';
    confidence = 0.95;
  } else if (debit) {
    reason = 'debit_alert';
    confidence = 0.9;
  } else if (credit && amount !== null && PENDING_RE.test(text)) {
    reason = 'other';
    confidence = 0.4;
  } else if (credit && amount !== null) {
    reason = 'genuine_credit_alert';
    confidence = 0.5 + 0.2 + 0.1 + (reference ? 0.1 : 0) + (senderName ? 0.05 : 0) + (time ? 0.05 : 0);
  } else {
    reason = 'other';
    confidence = 0.3;
  }

  return {
    amount,
    currency,
    senderName,
    reference,
    time,
    direction: debit ? 'debit' : credit ? 'credit' : 'unknown',
    language,
    confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
    reason,
  };
}
