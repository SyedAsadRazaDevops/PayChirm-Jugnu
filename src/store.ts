import { EventEmitter } from 'node:events';
import type { NewEvent, Shop, StoredEvent } from './types';

/**
 * Persistence boundary. Two implementations: in-memory (local run, tests) and
 * Firestore (Cloud Run). Neither ever receives the raw alert text.
 */
export interface Store {
  readonly kind: 'memory' | 'firestore';
  getShop(shopId: string): Promise<Shop | null>;
  findShopByPairingCode(code: string): Promise<Shop | null>;
  upsertShop(shop: Shop, opts?: { onlyIfMissing?: boolean }): Promise<void>;
  /** Atomically record a duplicate fingerprint. false = seen inside the window. */
  claimFingerprint(shopId: string, key: string, nowMs: number, windowMs: number): Promise<boolean>;
  releaseFingerprint(shopId: string, key: string): Promise<void>;
  addEvent(shopId: string, event: NewEvent): Promise<StoredEvent>;
  recentEvents(shopId: string, limit: number): Promise<StoredEvent[]>;
  /** Firestore only: let an anonymous Firebase user read this shop's events. */
  registerScreen(shopId: string, uid: string): Promise<void>;
  /** In-memory only: push feed for the local Server-Sent Events stream. */
  subscribe?(shopId: string, cb: (e: StoredEvent) => void): () => void;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private shops = new Map<string, Shop>();
  private codes = new Map<string, string>();
  private seen = new Map<string, number>();
  private events = new Map<string, StoredEvent[]>();
  private bus = new EventEmitter();
  private seq = 0;

  constructor() {
    this.bus.setMaxListeners(100);
  }

  async getShop(shopId: string) {
    return this.shops.get(shopId) ?? null;
  }

  async findShopByPairingCode(code: string) {
    const id = this.codes.get(code);
    return id ? (this.shops.get(id) ?? null) : null;
  }

  async upsertShop(shop: Shop, opts: { onlyIfMissing?: boolean } = {}) {
    if (opts.onlyIfMissing && this.shops.has(shop.id)) return;
    this.shops.set(shop.id, shop);
    this.codes.set(shop.pairingCode, shop.id);
  }

  async claimFingerprint(shopId: string, key: string, nowMs: number, windowMs: number) {
    const k = `${shopId}:${key}`;
    const at = this.seen.get(k);
    if (at !== undefined && nowMs - at < windowMs) return false;
    this.seen.set(k, nowMs);
    return true;
  }

  async releaseFingerprint(shopId: string, key: string) {
    this.seen.delete(`${shopId}:${key}`);
  }

  async addEvent(shopId: string, event: NewEvent) {
    const stored: StoredEvent = { id: `evt_${(++this.seq).toString().padStart(6, '0')}`, ...event };
    const list = this.events.get(shopId) ?? [];
    list.push(stored);
    this.events.set(shopId, list.slice(-200));
    this.bus.emit(shopId, stored);
    return stored;
  }

  async recentEvents(shopId: string, limit: number) {
    return (this.events.get(shopId) ?? []).slice(-limit).reverse();
  }

  async registerScreen() {
    /* nothing to do: the local stream is guarded by the pairing code */
  }

  subscribe(shopId: string, cb: (e: StoredEvent) => void) {
    this.bus.on(shopId, cb);
    return () => {
      this.bus.off(shopId, cb);
    };
  }

  /** Test helper: everything held, to prove the raw alert text is never kept. */
  dump(): string {
    return JSON.stringify({
      shops: [...this.shops.values()],
      seen: [...this.seen.entries()],
      events: [...this.events.entries()],
    });
  }
}
