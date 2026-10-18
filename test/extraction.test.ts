import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from '../src/extraction';
import { buildPrompt, EXTRACTION_SCHEMA } from '../src/gemini';
import { DEMO_SHOP } from '../src/seed';

describe('normalizeExtraction', () => {
  it('accepts a well-formed answer', () => {
    const ex = normalizeExtraction({
      amount: 2500,
      currency: 'pkr',
      senderName: ' Ali Raza ',
      reference: 'JA1',
      time: '2026-10-17T21:05:00+05:00',
      direction: 'credit',
      language: 'en',
      confidence: 0.93,
      reason: 'genuine_credit_alert',
    });
    expect(ex).toMatchObject({ amount: 2500, currency: 'PKR', senderName: 'Ali Raza', confidence: 0.93 });
  });

  it('clamps and defaults instead of trusting the model', () => {
    const ex = normalizeExtraction({
      amount: '1,200.50',
      currency: 'rupees',
      senderName: 'null',
      time: 'not a date',
      direction: 'sideways',
      language: 'klingon',
      confidence: 7,
      reason: 'because',
    });
    expect(ex).toEqual({
      amount: 1200.5,
      currency: null,
      senderName: null,
      reference: null,
      time: null,
      direction: 'unknown',
      language: 'other',
      confidence: 1,
      reason: 'other',
    });
  });

  it('treats missing confidence as zero and rejects negative or absurd amounts', () => {
    const ex = normalizeExtraction({ amount: -5 });
    expect(ex.amount).toBeNull();
    expect(ex.confidence).toBe(0);
    expect(normalizeExtraction({ amount: 1e12 }).amount).toBeNull();
  });

  it('throws on something that is not an object', () => {
    expect(() => normalizeExtraction('hello')).toThrow();
    expect(() => normalizeExtraction(null)).toThrow();
    expect(() => normalizeExtraction([])).toThrow();
  });
});

describe('Gemini request', () => {
  it('asks for every field the pipeline needs', () => {
    expect(EXTRACTION_SCHEMA.required).toEqual(
      expect.arrayContaining(['amount', 'currency', 'senderName', 'reference', 'time', 'direction', 'language', 'confidence', 'reason']),
    );
  });
  it('wraps the alert as untrusted data and states the shop time zone', () => {
    const p = buildPrompt('Rs 5 credited', DEMO_SHOP, new Date('2026-10-17T16:05:00Z'));
    expect(p).toContain('<alert>\nRs 5 credited\n</alert>');
    expect(p).toContain('+05:00');
    expect(p).toContain('2026-10-17');
  });
});
