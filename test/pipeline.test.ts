import { describe, expect, it } from 'vitest';
import { decide, processAlert, ShopNotFoundError } from '../src/pipeline';
import type { Extraction } from '../src/types';
import { NOW, render, sample, setup } from './helpers';

const alert = (id: string, over: { ref?: string; amount?: number } = {}) => {
  const s = sample(id);
  return { shopId: 'demo-shop', sender: s.sender, text: render(s, over) };
};

describe('rule pipeline', () => {
  it('verifies a genuine credit and stores only the allowed fields', async () => {
    const { deps, store } = await setup();
    const r = await processAlert(alert('en-sms-samplebank'), deps);
    expect(r.status).toBe('verified');
    expect(r.announce).toBe('confirmed');
    expect(r.event).toMatchObject({
      amount: 2500,
      currency: 'PKR',
      senderName: 'Ali Raza',
      reference: 'JA10000001',
      status: 'verified',
      reasonCode: 'ok',
    });
    expect(Object.keys(r.event).sort()).toEqual(
      ['amount', 'createdAt', 'currency', 'id', 'reason' + 'Code', 'reference', 'senderName', 'status', 'time'].sort(),
    );
    expect(r.event.time).toBe('2026-10-17T16:05:00.000Z'); // 21:05 +05:00
    expect(r.steps.map((s) => s.name)).toEqual(['trusted_sender', 'sanitize', 'duplicate', 'gemini', 'write']);
    // the raw text, the OTP and the balance are nowhere in what the store holds
    const held = (store as unknown as { dump(): string }).dump();
    for (const secret of ['Never share', 'OTP', '48,250.75', 'Avl Bal', 'XXXX1234', 'credited to']) {
      expect(held).not.toContain(secret);
    }
  });

  it('rejects an untrusted sender before anything else runs', async () => {
    const { deps, gemini, store } = await setup();
    const r = await processAlert(alert('fake-untrusted'), deps);
    expect(r).toMatchObject({ status: 'rejected', reasonCode: 'untrusted_sender', announce: 'none' });
    expect(r.event.amount).toBeNull();
    expect(gemini.calls).toHaveLength(0);
    // the same text from a trusted sender was never marked as seen
    const again = await processAlert({ ...alert('fake-untrusted'), sender: 'SAMPLEBANK' }, deps);
    expect(again.status).toBe('verified');
    expect(store.kind).toBe('memory');
  });

  it('never lets OTP lines or balances reach Gemini', async () => {
    const { deps, gemini } = await setup();
    await processAlert(alert('en-email-demobank'), deps);
    expect(gemini.calls).toHaveLength(1);
    expect(gemini.calls[0]).not.toContain('483920');
    expect(gemini.calls[0]).not.toContain('1,02,340.50');
    expect(gemini.calls[0]).not.toMatch(/otp/i);
    expect(gemini.calls[0]).toContain('1,850.00');
  });

  it('rejects a message that is only an OTP without calling Gemini', async () => {
    const { deps, gemini } = await setup();
    const r = await processAlert(alert('otp-only'), deps);
    expect(r).toMatchObject({ status: 'rejected', reasonCode: 'nothing_to_read' });
    expect(gemini.calls).toHaveLength(0);
  });

  it('drops a duplicate (same reference, amount and time) and calls Gemini once', async () => {
    const { deps, gemini } = await setup();
    const first = await processAlert(alert('en-sms-samplebank'), deps);
    const second = await processAlert(alert('en-sms-samplebank'), deps);
    expect(first.status).toBe('verified');
    expect(second).toMatchObject({ status: 'rejected', reasonCode: 'duplicate', announce: 'none' });
    expect(gemini.calls).toHaveLength(1);
  });

  it('treats a new reference as a new payment', async () => {
    const { deps } = await setup();
    await processAlert(alert('en-sms-samplebank'), deps);
    const r = await processAlert(alert('en-sms-samplebank', { ref: 'JA10000002' }), deps);
    expect(r.status).toBe('verified');
  });

  it('allows the same alert again once the duplicate window has passed', async () => {
    let now = NOW;
    const { deps } = await setup({ now: () => now, duplicateWindowMs: 60_000, maxAlertAgeMs: 0 });
    await processAlert(alert('en-sms-samplebank'), deps);
    now += 61_000;
    const r = await processAlert(alert('en-sms-samplebank'), deps);
    expect(r.status).toBe('verified');
  });

  it('does not burn the fingerprint when Gemini fails, so a retry still works', async () => {
    const { deps, gemini } = await setup();
    gemini.failNext = true;
    await expect(processAlert(alert('en-sms-samplebank'), deps)).rejects.toThrow(/Gemini/);
    const retry = await processAlert(alert('en-sms-samplebank'), deps);
    expect(retry.status).toBe('verified');
  });

  it('reports an unknown shop', async () => {
    const { deps } = await setup();
    await expect(processAlert({ ...alert('en-sms-samplebank'), shopId: 'nope' }, deps)).rejects.toBeInstanceOf(ShopNotFoundError);
  });
});

describe('expected amount', () => {
  it('confirms only a matching amount', async () => {
    const { deps } = await setup();
    const r = await processAlert({ ...alert('en-sms-samplebank'), expectedAmount: 2500 }, deps);
    expect(r).toMatchObject({ status: 'verified', reasonCode: 'expected_match', announce: 'confirmed' });
    expect(r.steps.find((s) => s.name === 'expected_amount')?.ok).toBe(true);
  });

  it('shows a mismatch as unverified, never as confirmed', async () => {
    const { deps } = await setup();
    const r = await processAlert({ ...alert('en-sms-samplebank'), expectedAmount: 3000 }, deps);
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'amount_mismatch', announce: 'unverified' });
    expect(r.event.amount).toBe(2500); // still shown, so the cashier sees what really arrived
    expect(r.steps.find((s) => s.name === 'expected_amount')?.ok).toBe(false);
  });

  it('compares to the paisa, not as floating point', async () => {
    const { deps } = await setup();
    const r = await processAlert({ ...alert('en-sms-samplebank', { amount: 1000.1 }), expectedAmount: 1000.10 }, deps);
    expect(r.reasonCode).toBe('expected_match');
  });
});

describe('low confidence and other doubts', () => {
  it('marks a low Gemini confidence as unverified', async () => {
    const { deps } = await setup();
    const r = await processAlert(alert('en-pending-lowconf'), deps);
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'low_confidence', announce: 'unverified' });
  });

  it('applies the confidence threshold exactly', async () => {
    const { deps, gemini } = await setup();
    gemini.override = { confidence: 0.69 };
    expect((await processAlert(alert('en-sms-samplebank'), deps)).status).toBe('unverified');
    gemini.override = { confidence: 0.7 };
    expect((await processAlert(alert('en-sms-samplebank', { ref: 'JA10000002' }), deps)).status).toBe('verified');
  });

  it('marks an old alert replayed later as unverified (stale)', async () => {
    const { deps } = await setup();
    const r = await processAlert(alert('en-stale-replay'), deps);
    expect(r).toMatchObject({ status: 'unverified', reasonCode: 'stale_alert' });
  });

  it('rejects promotions with links and debit alerts', async () => {
    const { deps } = await setup();
    expect((await processAlert(alert('en-promo-scam'), deps)).reasonCode).toBe('scam_suspected');
    expect((await processAlert(alert('en-debit'), deps)).reasonCode).toBe('not_a_credit');
  });
});

describe('decide()', () => {
  const ok: Extraction = {
    amount: 2500,
    currency: 'PKR',
    senderName: 'Ali',
    reference: 'JA1',
    time: '2026-10-17T16:00:00+00:00',
    direction: 'credit',
    language: 'en',
    confidence: 0.95,
    reason: 'genuine_credit_alert',
  };
  const opts = { nowMs: NOW, threshold: 0.7, maxAlertAgeMs: 120 * 60_000 };
  const text = 'Rs 2,500 credited';

  it('verifies the clean case', () => {
    expect(decide(ok, text, opts)).toEqual({ status: 'verified', reasonCode: 'ok' });
  });
  it('does not trust an amount that is not in the text', () => {
    expect(decide({ ...ok, amount: 25000 }, text, opts)).toEqual({ status: 'unverified', reasonCode: 'amount_not_in_text' });
  });
  it('rejects when there is no amount to show', () => {
    expect(decide({ ...ok, amount: null }, text, opts).status).toBe('rejected');
  });
  it('is unverified when the reason is not a genuine credit and confidence is low', () => {
    expect(decide({ ...ok, reason: 'other', confidence: 0.3 }, text, opts).status).toBe('unverified');
  });
  it('flags a time too far in the future', () => {
    expect(decide({ ...ok, time: '2026-10-17T18:00:00+00:00' }, text, opts).reasonCode).toBe('stale_alert');
  });
  it('skips the time check when disabled', () => {
    expect(decide({ ...ok, time: '2020-01-01T00:00:00+00:00' }, text, { ...opts, maxAlertAgeMs: 0 }).status).toBe('verified');
  });
});
