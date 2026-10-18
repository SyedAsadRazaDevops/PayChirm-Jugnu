import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Store } from './store';
import type { NewEvent, Shop, StoredEvent } from './types';

/**
 * Firestore layout (all written by the server only; see firestore.rules):
 *   shops/{shopId}                  shop details + trusted senders
 *   shops/{shopId}/events/{id}      amount, sender name, reference, time, status
 *   shops/{shopId}/seen/{hash}      duplicate fingerprints (a hash, never text)
 *   shops/{shopId}/screens/{uid}    paired screens (anonymous Firebase users)
 *   pairings/{CODE}                 pairing code -> shopId
 */
export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;
  private db: Firestore;

  constructor(projectId: string) {
    if (getApps().length === 0) initializeApp({ projectId });
    this.db = getFirestore();
    this.db.settings({ ignoreUndefinedProperties: true });
  }

  async getShop(shopId: string): Promise<Shop | null> {
    const snap = await this.db.collection('shops').doc(shopId).get();
    return snap.exists ? ({ ...(snap.data() as Omit<Shop, 'id'>), id: snap.id } as Shop) : null;
  }

  async findShopByPairingCode(code: string): Promise<Shop | null> {
    const pairing = await this.db.collection('pairings').doc(code).get();
    const shopId = pairing.exists ? (pairing.data()?.shopId as string | undefined) : undefined;
    return shopId ? this.getShop(shopId) : null;
  }

  async upsertShop(shop: Shop, opts: { onlyIfMissing?: boolean } = {}): Promise<void> {
    const ref = this.db.collection('shops').doc(shop.id);
    if (opts.onlyIfMissing && (await ref.get()).exists) return;
    const { id: _id, ...data } = shop;
    await ref.set(data);
    await this.db.collection('pairings').doc(shop.pairingCode).set({ shopId: shop.id });
  }

  async claimFingerprint(shopId: string, key: string, nowMs: number, windowMs: number): Promise<boolean> {
    const ref = this.db.collection('shops').doc(shopId).collection('seen').doc(key);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const at = snap.exists ? (snap.data()?.at as number | undefined) : undefined;
      if (at !== undefined && nowMs - at < windowMs) return false;
      tx.set(ref, { at: nowMs });
      return true;
    });
  }

  async releaseFingerprint(shopId: string, key: string): Promise<void> {
    await this.db.collection('shops').doc(shopId).collection('seen').doc(key).delete();
  }

  async addEvent(shopId: string, event: NewEvent): Promise<StoredEvent> {
    const ref = await this.db.collection('shops').doc(shopId).collection('events').add(event);
    return { id: ref.id, ...event };
  }

  async recentEvents(shopId: string, limit: number): Promise<StoredEvent[]> {
    const snap = await this.db
      .collection('shops')
      .doc(shopId)
      .collection('events')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as NewEvent) }));
  }

  async registerScreen(shopId: string, uid: string): Promise<void> {
    await this.db.collection('shops').doc(shopId).collection('screens').doc(uid).set({ pairedAt: Date.now() });
  }
}
