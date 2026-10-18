import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MockGemini } from '../src/mockGemini';
import type { PipelineDeps } from '../src/pipeline';
import { DEMO_SHOP } from '../src/seed';
import { MemoryStore } from '../src/store';
import type { Extraction, GeminiLike, Shop } from '../src/types';
// @ts-expect-error plain JS module shared with the browser
import { formatShopNow, renderTemplate } from '../public/js/template.js';

/** 17 Oct 2026, 21:05 in Karachi. */
export const NOW = Date.parse('2026-10-17T16:05:00Z');

interface Sample {
  id: string;
  sender: string;
  name: string;
  amount: number;
  template: string;
  expect: { status: string; reasonCode: string };
  title: string;
}

export const samples: Sample[] = JSON.parse(
  readFileSync(path.resolve(__dirname, '../public/samples/alerts.json'), 'utf8'),
).samples;

export function sample(id: string): Sample {
  const s = samples.find((x) => x.id === id);
  if (!s) throw new Error(`no sample ${id}`);
  return s;
}

/** Render a sample the way the console does, at NOW in the demo shop's time zone. */
export function render(s: Sample, opts: { amount?: number; ref?: string } = {}): string {
  const { date, time } = formatShopNow(DEMO_SHOP.timezone, new Date(NOW));
  return renderTemplate(s.template, { amount: opts.amount ?? s.amount, name: s.name, ref: opts.ref ?? 'JA10000001', date, time });
}

/** Wraps a Gemini implementation and records what it was asked to read. */
export class SpyGemini implements GeminiLike {
  readonly label: string;
  readonly isMock: boolean;
  readonly calls: string[] = [];
  failNext = false;
  override?: Partial<Extraction>;
  constructor(private inner: GeminiLike = new MockGemini(() => NOW)) {
    this.label = inner.label;
    this.isMock = inner.isMock;
  }
  async extract(input: { text: string; shop: Shop }) {
    this.calls.push(input.text);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('boom');
    }
    const ex = await this.inner.extract(input);
    return this.override ? { ...ex, ...this.override } : ex;
  }
}

export async function setup(over: Partial<PipelineDeps> = {}) {
  const store = new MemoryStore();
  await store.upsertShop(DEMO_SHOP);
  const gemini = new SpyGemini();
  const deps: PipelineDeps = {
    store,
    gemini,
    now: () => NOW,
    confidenceThreshold: 0.7,
    duplicateWindowMs: 24 * 3600_000,
    maxAlertAgeMs: 120 * 60_000,
    ...over,
  };
  return { store, gemini, deps };
}
