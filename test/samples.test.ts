import { describe, expect, it } from 'vitest';
import { processAlert } from '../src/pipeline';
import { render, samples, setup } from './helpers';

describe('synthetic sample alerts (mock Gemini)', () => {
  it('are labelled synthetic', async () => {
    const file = await import('../public/samples/alerts.json');
    expect(file.synthetic).toBe(true);
    expect(file.notice).toMatch(/SYNTHETIC/);
  });

  it('cover English, Urdu and Hindi in Roman and native script', () => {
    const groups = new Set(samples.map((s) => s.title));
    expect([...groups].join(' ')).toMatch(/Urdu \(اردو\)/);
    expect([...groups].join(' ')).toMatch(/Hindi \(हिन्दी\)/);
    expect([...groups].join(' ')).toMatch(/Roman script/);
  });

  for (const s of samples) {
    it(`${s.id}: ${s.expect.status} / ${s.expect.reasonCode}`, async () => {
      const { deps } = await setup();
      const r = await processAlert({ shopId: 'demo-shop', sender: s.sender, text: render(s) }, deps);
      expect({ status: r.status, reasonCode: r.reasonCode }).toEqual(s.expect);
      if (r.status === 'verified') {
        expect(r.event.amount).toBe(s.amount);
        expect(r.event.senderName).toBe(s.name);
        expect(r.event.reference).toBe('JA10000001');
      }
    });
  }
});
