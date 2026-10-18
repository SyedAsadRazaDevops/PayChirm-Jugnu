import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeminiClient, GeminiError } from '../src/gemini';
import { DEMO_SHOP } from '../src/seed';

// A tiny local stand-in for the Gemini REST endpoint. It lets the real SDK code
// path run (request building, JSON mode, response parsing) with no credentials.
let server: http.Server;
let baseUrl = '';
let lastRequest: { url: string; body: any } | null = null;
let reply: { status: number; json: unknown } = { status: 200, json: {} };

const candidate = (obj: unknown) => ({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      lastRequest = { url: req.url ?? '', body: data ? JSON.parse(data) : null };
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const client = (over: Partial<ConstructorParameters<typeof GeminiClient>[0]> = {}) =>
  new GeminiClient({ apiKey: 'test-key-not-real', model: 'gemini-test-model', timeoutMs: 3000, baseUrl, ...over });

describe('GeminiClient (real SDK path, fake endpoint)', () => {
  it('sends the alert as untrusted data with a fixed JSON schema and parses the answer', async () => {
    reply = {
      status: 200,
      json: candidate({
        amount: 2500, currency: 'PKR', senderName: 'Ali Raza', reference: 'JA1', time: '2026-10-17T21:05:00+05:00',
        direction: 'credit', language: 'en', confidence: 0.94, reason: 'genuine_credit_alert',
      }),
    };
    const ex = await client().extract({ text: 'Rs 2,500 credited from Ali Raza. Ref JA1', shop: DEMO_SHOP });
    expect(ex).toMatchObject({ amount: 2500, currency: 'PKR', senderName: 'Ali Raza', direction: 'credit', confidence: 0.94 });

    expect(lastRequest!.url).toContain('gemini-test-model:generateContent');
    const body = lastRequest!.body;
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    const schema = body.generationConfig.responseSchema;
    expect(schema.type).toBe('OBJECT');
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['amount', 'currency', 'senderName', 'reference', 'time', 'direction', 'language', 'confidence', 'reason']),
    );
    expect(schema.properties.reason.enum).toContain('scam');
    expect(body.systemInstruction.parts[0].text).toMatch(/untrusted DATA/);
    expect(body.contents[0].parts[0].text).toContain('<alert>\nRs 2,500 credited from Ali Raza. Ref JA1\n</alert>');
  });

  it('turns an API error into a GeminiError the pipeline can retry', async () => {
    reply = { status: 503, json: { error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } } };
    await expect(client().extract({ text: 'Rs 5 credited', shop: DEMO_SHOP })).rejects.toBeInstanceOf(GeminiError);
  });

  it('turns an unparseable answer into a GeminiError', async () => {
    reply = { status: 200, json: { candidates: [{ content: { role: 'model', parts: [{ text: 'not json at all' }] } }] } };
    await expect(client().extract({ text: 'Rs 5 credited', shop: DEMO_SHOP })).rejects.toBeInstanceOf(GeminiError);
  });

  it('labels itself with the model and backend', () => {
    expect(client().label).toBe('gemini-test-model (Gemini API)');
    expect(client({ apiKey: undefined, project: 'p', location: 'global' }).label).toBe('gemini-test-model (Vertex AI)');
  });
});
