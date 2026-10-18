import { GeminiError } from './gemini';
import type { Store } from './store';
import { fingerprint, isTrustedSender, numbersIn, sameAmount, stripSensitive } from './text';
import type {
  AlertInput,
  Extraction,
  GeminiLike,
  NewEvent,
  PipelineStep,
  ReasonCode,
  Shop,
  Status,
  StoredEvent,
} from './types';

export class ShopNotFoundError extends Error {
  constructor(shopId: string) {
    super(`Unknown shop "${shopId}"`);
    this.name = 'ShopNotFoundError';
  }
}

export interface PipelineDeps {
  store: Store;
  gemini: GeminiLike;
  now?: () => number;
  confidenceThreshold: number;
  duplicateWindowMs: number;
  /** 0 disables the stale/future alert-time check. */
  maxAlertAgeMs: number;
}

export interface PipelineResult {
  status: Status;
  reasonCode: ReasonCode;
  /** What the counter screen is told: a confirmed payment, an unverified one, or nothing. */
  announce: 'confirmed' | 'unverified' | 'none';
  event: StoredEvent;
  steps: PipelineStep[];
  /** The text that went to Gemini (OTP and balances removed). Only returned when asked for. */
  cleanedText?: string;
}

export interface Decision {
  status: Status;
  reasonCode: ReasonCode;
}

const FUTURE_SKEW_MS = 10 * 60_000;

/**
 * Turn Gemini's answer plus the rules into a status. Pure, so it is easy to test.
 *
 * Only a genuine, confidently-read credit whose amount really appears in the
 * text (and matches the expected amount, if one was set) becomes `verified`.
 */
export function decide(
  ex: Extraction,
  cleanedText: string,
  opts: { expectedAmount?: number; nowMs: number; threshold: number; maxAlertAgeMs: number },
): Decision {
  const confident = ex.confidence >= opts.threshold;

  if (confident) {
    if (ex.reason === 'otp') return { status: 'rejected', reasonCode: 'otp' };
    if (ex.reason === 'promotion') return { status: 'rejected', reasonCode: 'promotion' };
    if (ex.reason === 'scam') return { status: 'rejected', reasonCode: 'scam_suspected' };
    if (ex.reason === 'debit_alert' || ex.direction === 'debit') return { status: 'rejected', reasonCode: 'not_a_credit' };
  }
  if (ex.amount === null || ex.amount <= 0) return { status: 'rejected', reasonCode: 'unreadable' };

  if (!confident || ex.reason !== 'genuine_credit_alert' || ex.direction !== 'credit') {
    return { status: 'unverified', reasonCode: 'low_confidence' };
  }
  // The amount must be literally present in the text. Guards against a model that invents or misreads one.
  if (!numbersIn(cleanedText).some((n) => sameAmount(n, ex.amount as number))) {
    return { status: 'unverified', reasonCode: 'amount_not_in_text' };
  }
  if (opts.maxAlertAgeMs > 0 && ex.time) {
    const age = opts.nowMs - Date.parse(ex.time);
    if (age > opts.maxAlertAgeMs || age < -FUTURE_SKEW_MS) return { status: 'unverified', reasonCode: 'stale_alert' };
  }
  if (opts.expectedAmount !== undefined) {
    return sameAmount(ex.amount, opts.expectedAmount)
      ? { status: 'verified', reasonCode: 'expected_match' }
      : { status: 'unverified', reasonCode: 'amount_mismatch' };
  }
  return { status: 'verified', reasonCode: 'ok' };
}

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * The alert pipeline, in this order:
 *   trusted sender -> remove OTP and balances -> duplicate check ->
 *   Gemini structured extraction -> expected-amount match -> write event.
 *
 * The raw alert text lives only in this function's local variables. The only
 * things written are amount, sender name, reference, time and a status.
 */
export async function processAlert(
  input: AlertInput,
  deps: PipelineDeps,
  opts: { includeCleanedText?: boolean } = {},
): Promise<PipelineResult> {
  const nowMs = (deps.now ?? Date.now)();
  const shop: Shop | null = await deps.store.getShop(input.shopId);
  if (!shop) throw new ShopNotFoundError(input.shopId);

  const steps: PipelineStep[] = [];
  const receivedIso = new Date(nowMs).toISOString();

  const finish = async (
    status: Status,
    reasonCode: ReasonCode,
    fields: Partial<Pick<NewEvent, 'amount' | 'currency' | 'senderName' | 'reference' | 'time'>> = {},
    cleanedText?: string,
  ): Promise<PipelineResult> => {
    const event = await deps.store.addEvent(shop.id, {
      amount: fields.amount ?? null,
      currency: fields.currency ?? null,
      senderName: fields.senderName ?? null,
      reference: fields.reference ?? null,
      time: fields.time ?? receivedIso,
      status,
      reasonCode,
      createdAt: nowMs,
    });
    steps.push({ name: 'write', ok: true, detail: `Event written to the relay with status "${status}"` });
    return {
      status,
      reasonCode,
      announce: status === 'verified' ? 'confirmed' : status === 'unverified' ? 'unverified' : 'none',
      event,
      steps,
      ...(opts.includeCleanedText && cleanedText !== undefined ? { cleanedText } : {}),
    };
  };

  // 1. Trusted sender (per shop).
  const trusted = isTrustedSender(input.sender, shop.trustedSenders);
  steps.push({
    name: 'trusted_sender',
    ok: trusted,
    detail: trusted
      ? `Sender "${clip(input.sender, 40)}" is on this shop's trusted list`
      : `Sender "${clip(input.sender, 40)}" is not on this shop's trusted list, so the text is ignored`,
  });
  if (!trusted) return finish('rejected', 'untrusted_sender', { senderName: clip(input.sender, 40) });

  // 2. Remove OTP lines and balances before anything else looks at the text.
  const { cleaned, removed } = stripSensitive(input.text);
  const readable = /\d/.test(cleaned);
  steps.push({
    name: 'sanitize',
    ok: readable,
    detail: readable
      ? `Removed ${removed.otp} OTP clause(s) and ${removed.balance} balance figure(s)`
      : `Nothing left to read after removing ${removed.otp} OTP clause(s) and ${removed.balance} balance figure(s)`,
  });
  if (!readable) return finish('rejected', 'nothing_to_read', {}, cleaned);

  // 3. Duplicate check (reference + amount + time), before spending a Gemini call.
  const fp = fingerprint(shop.id, cleaned);
  const first = await deps.store.claimFingerprint(shop.id, fp.key, nowMs, deps.duplicateWindowMs);
  steps.push({
    name: 'duplicate',
    ok: first,
    detail: first
      ? `First time this alert is seen (matched on ${fp.basis === 'fields' ? 'reference + amount + time' : 'the cleaned text'})`
      : 'Same alert already seen inside the duplicate window, so it is dropped',
  });
  if (!first) return finish('rejected', 'duplicate', {}, cleaned);

  // 4. Gemini structured extraction.
  let ex: Extraction;
  try {
    ex = await deps.gemini.extract({ text: cleaned, shop });
  } catch (err) {
    // Let the Connector retry the same alert instead of treating it as a duplicate.
    await deps.store.releaseFingerprint(shop.id, fp.key).catch(() => undefined);
    throw err instanceof GeminiError ? err : new GeminiError('Gemini request failed', err);
  }

  const decision = decide(ex, cleaned, {
    expectedAmount: input.expectedAmount,
    nowMs,
    threshold: deps.confidenceThreshold,
    maxAlertAgeMs: deps.maxAlertAgeMs,
  });
  steps.push({
    name: 'gemini',
    ok: ex.reason === 'genuine_credit_alert' && ex.confidence >= deps.confidenceThreshold,
    detail: `${deps.gemini.label}: read as ${ex.reason.replace(/_/g, ' ')}, confidence ${ex.confidence.toFixed(2)}${
      ex.confidence < deps.confidenceThreshold ? ` (below ${deps.confidenceThreshold})` : ''
    }`,
  });

  // 5. Expected-amount match (only when the cashier set one).
  if (input.expectedAmount !== undefined && ex.amount !== null) {
    const match = sameAmount(ex.amount, input.expectedAmount);
    steps.push({
      name: 'expected_amount',
      ok: match,
      detail: match
        ? `Amount ${ex.amount} matches the expected ${input.expectedAmount}`
        : `Amount ${ex.amount} does not match the expected ${input.expectedAmount}`,
    });
  }

  // 6. Write the event: four fields + status, never the text.
  if (decision.status === 'rejected') return finish('rejected', decision.reasonCode, {}, cleaned);

  const parsedTime = ex.time ? Date.parse(ex.time) : NaN;
  return finish(
    decision.status,
    decision.reasonCode,
    {
      amount: ex.amount,
      currency: ex.currency ?? shop.currency,
      senderName: ex.senderName,
      reference: ex.reference,
      time: Number.isNaN(parsedTime) ? receivedIso : new Date(parsedTime).toISOString(),
    },
    cleaned,
  );
}
