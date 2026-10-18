import type { AlertLanguage, Direction, Extraction, GeminiReason } from './types';

const DIRECTIONS: Direction[] = ['credit', 'debit', 'unknown'];
const LANGUAGES: AlertLanguage[] = ['en', 'ur', 'hi', 'other'];
const REASONS: GeminiReason[] = ['genuine_credit_alert', 'promotion', 'otp', 'scam', 'debit_alert', 'other'];

const str = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return t && t.toLowerCase() !== 'null' ? t : null;
};

function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Validate and clamp whatever the model returned. Never trusts the shape: a
 * malformed answer degrades to low confidence instead of crashing the pipeline.
 */
export function normalizeExtraction(raw: unknown): Extraction {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Gemini returned something that is not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  let amount: number | null = null;
  const a = typeof r.amount === 'string' ? Number(r.amount.replace(/,/g, '')) : r.amount;
  if (typeof a === 'number' && Number.isFinite(a) && a > 0 && a < 1e10) amount = Math.round(a * 100) / 100;

  let time: string | null = str(r.time, 40);
  if (time && Number.isNaN(Date.parse(time))) time = null;

  const conf = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0;
  const currency = str(r.currency, 8)?.toUpperCase() ?? null;

  return {
    amount,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    senderName: str(r.senderName, 60),
    reference: str(r.reference, 40),
    time,
    direction: oneOf(r.direction, DIRECTIONS, 'unknown'),
    language: oneOf(r.language, LANGUAGES, 'other'),
    confidence: Math.min(1, Math.max(0, conf)),
    reason: oneOf(r.reason, REASONS, 'other'),
  };
}
