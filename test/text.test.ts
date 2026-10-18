import { describe, expect, it } from 'vitest';
import {
  extractAmount,
  extractReference,
  fingerprint,
  isTrustedSender,
  normalizeDigits,
  numbersIn,
  stripSensitive,
  tzOffset,
} from '../src/text';
import { render, sample } from './helpers';

describe('trusted sender check', () => {
  const trusted = ['SAMPLEBANK', 'DemoBank'];
  it('accepts a listed sender regardless of case and punctuation', () => {
    expect(isTrustedSender('SAMPLEBANK', trusted)).toBe(true);
    expect(isTrustedSender('samplebank', trusted)).toBe(true);
    expect(isTrustedSender('Demo-Bank', trusted)).toBe(true);
  });
  it('accepts Indian DLT-style headers with route prefix and suffix', () => {
    expect(isTrustedSender('VM-SAMPLEBANK', trusted)).toBe(true);
    expect(isTrustedSender('AD-SAMPLEBANK-S', trusted)).toBe(true);
  });
  it('rejects look-alikes, numbers and empty senders', () => {
    expect(isTrustedSender('SAMPLEBANK2', trusted)).toBe(false);
    expect(isTrustedSender('SAMPLEBANKS', trusted)).toBe(false);
    expect(isTrustedSender('XSAMPLEBANK', trusted)).toBe(false);
    expect(isTrustedSender('FAKE-BANK', trusted)).toBe(false);
    expect(isTrustedSender('+923001234567', trusted)).toBe(false);
    expect(isTrustedSender('   ', trusted)).toBe(false);
  });
});

describe('digit normalisation', () => {
  it('maps Urdu and Hindi digits to ASCII', () => {
    expect(normalizeDigits('۴۵,۰۰۰')).toBe('45,000');
    expect(normalizeDigits('२,५००.००')).toBe('2,500.00');
  });
});

describe('OTP and balance removal', () => {
  it('drops OTP sentences and the balance from an English SMS but keeps the payment', () => {
    const { cleaned, removed } = stripSensitive(render(sample('en-sms-samplebank')));
    expect(cleaned).toContain('2,500.00');
    expect(cleaned).toContain('Ali Raza');
    expect(cleaned).toContain('JA10000001');
    expect(cleaned).not.toMatch(/otp/i);
    expect(cleaned).not.toContain('48,250.75');
    expect(cleaned).not.toMatch(/bal/i);
    expect(removed.otp).toBeGreaterThanOrEqual(1);
    expect(removed.balance).toBe(1);
  });

  it('handles a multi-line email layout', () => {
    const { cleaned } = stripSensitive(render(sample('en-email-demobank')));
    expect(cleaned).not.toContain('483920');
    expect(cleaned).not.toContain('1,02,340.50');
    expect(cleaned).toContain('UTR: JA10000001');
    expect(cleaned).toContain('INR 1,850.00');
  });

  it('keeps the credit when the OTP warning sits in the same sentence', () => {
    const { cleaned } = stripSensitive('Rs 500 credited from Ali Raza, do not share your OTP 123456 with anyone.');
    expect(cleaned).toContain('Rs 500 credited from Ali Raza');
    expect(cleaned).not.toContain('123456');
  });

  it('removes balances written in Urdu and Hindi script', () => {
    const ur = stripSensitive(render(sample('ur-native-demobank'))).cleaned;
    expect(ur).not.toContain('45,000');
    expect(ur).not.toContain('بیلنس');
    expect(ur).toContain('3,200.00'); // Urdu digits were normalised
    const hi = stripSensitive(render(sample('hi-native-samplebank'))).cleaned;
    expect(hi).not.toContain('25,400');
    expect(hi).not.toContain('शेष');
    expect(hi).not.toMatch(/otp/i);
  });

  it('removes Roman-script balances', () => {
    expect(stripSensitive(render(sample('ur-roman-samplebank'))).cleaned).not.toContain('12,300');
    expect(stripSensitive(render(sample('hi-roman-samplebank'))).cleaned).not.toContain('9,870');
  });

  it('does not split "Rs." and "A/c." into separate sentences', () => {
    const { cleaned } = stripSensitive('SampleBank: Rs. 2,500.00 credited to A/c. XXXX1234. Avl Bal: Rs. 10.00.');
    expect(cleaned).toBe('SampleBank: Rs. 2,500.00 credited to A/c. XXXX1234.');
  });

  it('leaves nothing for an OTP-only message', () => {
    expect(stripSensitive(render(sample('otp-only'))).cleaned).toBe('');
  });

  it('strips control characters and caps the length', () => {
    const { cleaned } = stripSensitive('Rs 5 credited\u0000\u0007 ' + 'x'.repeat(5000));
    expect(cleaned.length).toBeLessThanOrEqual(1200);
    expect(cleaned).not.toMatch(/[\u0000-\u0008]/);
  });
});

describe('field spotting', () => {
  it('finds references in several layouts', () => {
    expect(extractReference('Ref: ja10000001.')).toBe('JA10000001');
    expect(extractReference('UTR: JA10000001')).toBe('JA10000001');
    expect(extractReference('Txn ID JA10000001. 17-Oct')).toBe('JA10000001');
    expect(extractReference('Ref no JA10000001')).toBe('JA10000001');
    expect(extractReference('ٹرانزیکشن آئی ڈی: JA10000001۔')).toBe('JA10000001');
    expect(extractReference('संदर्भ संख्या: JA10000001।')).toBe('JA10000001');
    expect(extractReference('Reference: pending')).toBeNull(); // no digit, not a reference
  });
  it('finds currency-marked amounts, ignoring look-alike words', () => {
    expect(extractAmount('credited Rs. 2,500.00 to')).toBe(2500);
    expect(extractAmount('PKR 750 from')).toBe(750);
    expect(extractAmount('आपके खाते में 4500 रुपये जमा')).toBe(4500);
    expect(extractAmount('3200.00 روپے جمع')).toBe(3200);
    expect(extractAmount('the tears 500 fell')).toBeNull();
  });
  it('lists every number in a text', () => {
    expect(numbersIn('Rs 1,02,340.50 and 7')).toEqual([102340.5, 7]);
  });
  it('computes time zone offsets', () => {
    expect(tzOffset('Asia/Karachi')).toBe('+05:00');
    expect(tzOffset('Asia/Kolkata')).toBe('+05:30');
  });
});

describe('duplicate fingerprint', () => {
  const a = 'SampleBank: Rs. 2,500.00 credited on 17-Oct-2026 21:05 from Ali Raza. Ref: JA10000001.';
  it('is stable for the same reference, amount and time', () => {
    expect(fingerprint('shop', a)).toEqual(fingerprint('shop', a));
    expect(fingerprint('shop', a).basis).toBe('fields');
  });
  it('ignores spacing and digit script', () => {
    const b = 'SampleBank:   Rs. ۲,۵۰۰.۰۰ credited on 17-Oct-2026   21:05 from Ali Raza.   Ref: ja10000001.';
    expect(fingerprint('shop', b).key).toBe(fingerprint('shop', a).key);
  });
  it('differs when the reference, amount, time or shop differs', () => {
    const base = fingerprint('shop', a).key;
    expect(fingerprint('shop', a.replace('JA10000001', 'JA10000002')).key).not.toBe(base);
    expect(fingerprint('shop', a.replace('2,500.00', '2,600.00')).key).not.toBe(base);
    expect(fingerprint('shop', a.replace('21:05', '21:06')).key).not.toBe(base);
    expect(fingerprint('other', a).key).not.toBe(base);
  });
  it('falls back to the cleaned text when there is no reference', () => {
    const fp = fingerprint('shop', 'Rs 100 credited from Ali');
    expect(fp.basis).toBe('text');
    expect(fp.key).toHaveLength(40);
  });
});
