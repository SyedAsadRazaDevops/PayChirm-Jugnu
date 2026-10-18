import type { Shop } from './types';

/**
 * Demo shop. Everything here is synthetic: the account number is not a real
 * account and the sender IDs belong to fictional banks. Edit this file (or
 * add shops in Firestore) to try other shops.
 */
export const DEMO_SHOP: Shop = {
  id: 'demo-shop',
  name: 'Jugnu Demo Store',
  accountNumber: '0000 0000 0000 (demo)',
  qrPayload: 'JUGNU-DEMO | Jugnu Demo Store | Account 0000 0000 0000 | synthetic demo QR, not a payment address',
  currency: 'PKR',
  language: 'en',
  timezone: 'Asia/Karachi',
  trustedSenders: ['SAMPLEBANK', 'DEMOBANK', 'TESTPAY'],
  pairingCode: 'JUGNU-DEMO',
};

/** Pairing codes are compared upper-case with spaces removed. */
export const normalizePairingCode = (code: string): string => code.toUpperCase().replace(/\s+/g, '').slice(0, 24);
