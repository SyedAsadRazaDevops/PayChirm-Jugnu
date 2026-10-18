export type Status = 'verified' | 'unverified' | 'rejected';

/** Fixed vocabulary. Never free text, so nothing from an alert can leak into storage through it. */
export type ReasonCode =
  | 'ok'
  | 'expected_match'
  | 'untrusted_sender'
  | 'nothing_to_read'
  | 'duplicate'
  | 'not_a_credit'
  | 'promotion'
  | 'otp'
  | 'scam_suspected'
  | 'unreadable'
  | 'low_confidence'
  | 'amount_mismatch'
  | 'amount_not_in_text'
  | 'stale_alert';

export interface Shop {
  id: string;
  name: string;
  accountNumber: string;
  /** Text encoded in the shop QR code. */
  qrPayload: string;
  currency: string;
  /** Announcement language: en | ur | hi. */
  language: 'en' | 'ur' | 'hi';
  /** IANA time zone, e.g. Asia/Karachi. */
  timezone: string;
  trustedSenders: string[];
  pairingCode: string;
}

export interface AlertInput {
  shopId: string;
  sender: string;
  text: string;
  expectedAmount?: number;
}

export type Direction = 'credit' | 'debit' | 'unknown';
export type AlertLanguage = 'en' | 'ur' | 'hi' | 'other';
export type GeminiReason =
  | 'genuine_credit_alert'
  | 'promotion'
  | 'otp'
  | 'scam'
  | 'debit_alert'
  | 'other';

/** What Gemini (or the mock) returns for one cleaned alert. */
export interface Extraction {
  amount: number | null;
  currency: string | null;
  senderName: string | null;
  reference: string | null;
  /** ISO 8601 with offset, or null when the alert shows no time. */
  time: string | null;
  direction: Direction;
  language: AlertLanguage;
  /** 0..1, confidence in the classification and the field reading. */
  confidence: number;
  reason: GeminiReason;
}

/**
 * The ONLY alert-derived data that is ever stored: amount, sender name,
 * reference, time and a status. `currency` qualifies the amount, `reasonCode`
 * is a fixed vocabulary and `createdAt` orders the feed. The raw alert text is
 * never stored.
 */
export interface StoredEvent {
  id: string;
  amount: number | null;
  currency: string | null;
  senderName: string | null;
  reference: string | null;
  time: string;
  status: Status;
  reasonCode: ReasonCode;
  createdAt: number;
}

export type NewEvent = Omit<StoredEvent, 'id'>;

export interface PipelineStep {
  name: 'trusted_sender' | 'sanitize' | 'duplicate' | 'gemini' | 'expected_amount' | 'write';
  ok: boolean;
  detail: string;
}

export interface GeminiLike {
  /** Short label for the UI, e.g. "mock" or "gemini-3.5-flash-lite". */
  readonly label: string;
  readonly isMock: boolean;
  extract(input: { text: string; shop: Shop }): Promise<Extraction>;
}
