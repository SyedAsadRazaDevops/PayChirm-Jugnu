import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createApp } from '../src/server';
import { DEMO_SHOP } from '../src/seed';
import { MemoryStore } from '../src/store';
import { MockGemini } from '../src/mockGemini';
import { NOW, render, sample } from './helpers';

let base = '';
let close: () => void = () => undefined;

beforeAll(async () => {
  const store = new MemoryStore();
  await store.upsertShop(DEMO_SHOP);
  const config = loadConfig({ MOCK_GEMINI: 'true', SERVE_STATIC: 'true', RATE_LIMIT_PER_MIN: '1000' } as NodeJS.ProcessEnv);
  const app = createApp({ config, store, gemini: new MockGemini(() => NOW), now: () => NOW });
  const server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('HTTP API', () => {
  it('POST /api/alerts runs the pipeline and returns the steps', async () => {
    const s = sample('en-sms-samplebank');
    const res = await post('/api/alerts?debug=1', { shopId: 'demo-shop', sender: s.sender, text: render(s), expectedAmount: 2500 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'verified', reasonCode: 'expected_match', announce: 'confirmed' });
    expect(body.steps.map((x: { name: string }) => x.name)).toContain('expected_amount');
    expect(body.cleanedText).not.toMatch(/otp/i);
  });

  it('does not echo the cleaned text unless debug is requested', async () => {
    const s = sample('en-wallet-testpay');
    const body = await (await post('/api/alerts', { shopId: 'demo-shop', sender: s.sender, text: render(s) })).json();
    expect(body.cleanedText).toBeUndefined();
  });

  it('rejects the fake untrusted alert with HTTP 200 and a rejected status', async () => {
    const s = sample('fake-untrusted');
    const res = await post('/api/alerts', { shopId: 'demo-shop', sender: s.sender, text: render(s) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'rejected', reasonCode: 'untrusted_sender', announce: 'none' });
  });

  it('validates the request body', async () => {
    expect((await post('/api/alerts', { shopId: 'demo-shop', sender: 'X' })).status).toBe(400);
    expect((await post('/api/alerts', { shopId: 'demo-shop', sender: 'SAMPLEBANK', text: 'Rs 5', expectedAmount: -3 })).status).toBe(400);
    expect((await post('/api/alerts', { shopId: 'demo-shop', sender: 'SAMPLEBANK', text: 'x'.repeat(1600) })).status).toBe(400);
    const bad = await fetch(base + '/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(bad.status).toBe(400);
  });

  it('returns 404 for an unknown shop', async () => {
    const res = await post('/api/alerts', { shopId: 'no-such-shop', sender: 'SAMPLEBANK', text: 'Rs 5 credited' });
    expect(res.status).toBe(404);
  });

  it('pairs with a code, in any case and spacing, and hides the trusted-sender list', async () => {
    const res = await post('/api/pair', { code: ' jugnu-demo ' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ shopId: 'demo-shop', name: 'Jugnu Demo Store' });
    expect(body.trustedSenders).toBeUndefined();
    expect((await post('/api/pair', { code: 'WRONG' })).status).toBe(404);
  });

  it('reports the mode so the UI can label mock Gemini', async () => {
    expect(await (await fetch(base + '/api/config')).json()).toMatchObject({ store: 'memory', gemini: { mock: true } });
  });

  it('serves the screen and console pages and the sample file', async () => {
    expect((await fetch(base + '/')).status).toBe(200);
    expect((await fetch(base + '/console')).status).toBe(200);
    expect((await fetch(base + '/samples/alerts.json')).status).toBe(200);
  });
});
