import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Config } from './config';
import { GeminiError } from './gemini';
import { processAlert, ShopNotFoundError, type PipelineDeps } from './pipeline';
import { normalizePairingCode } from './seed';
import type { Store } from './store';
import type { AlertInput, GeminiLike, Shop } from './types';

export interface AppDeps {
  config: Config;
  store: Store;
  gemini: GeminiLike;
  /** Verifies a Firebase ID token (Firestore mode). Injected so tests need no Firebase. */
  verifyIdToken?: (token: string) => Promise<{ uid: string }>;
  now?: () => number;
}

class BadRequest extends Error {}

const SHOP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/i;
export const MAX_TEXT_CHARS = 1500;

export function parseAlertBody(body: unknown): AlertInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequest('Body must be a JSON object');
  const b = body as Record<string, unknown>;
  if (typeof b.shopId !== 'string' || !SHOP_ID_RE.test(b.shopId)) throw new BadRequest('shopId is required (letters, digits, - or _)');
  if (typeof b.sender !== 'string' || !b.sender.trim() || b.sender.length > 40) throw new BadRequest('sender is required (up to 40 characters)');
  if (typeof b.text !== 'string' || !b.text.trim()) throw new BadRequest('text is required');
  if (b.text.length > MAX_TEXT_CHARS) throw new BadRequest(`text is too long (limit ${MAX_TEXT_CHARS} characters)`);

  let expectedAmount: number | undefined;
  if (b.expectedAmount !== undefined && b.expectedAmount !== null && b.expectedAmount !== '') {
    const n = typeof b.expectedAmount === 'string' ? Number(b.expectedAmount.replace(/,/g, '')) : b.expectedAmount;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1e9) throw new BadRequest('expectedAmount must be a positive number');
    expectedAmount = n;
  }
  return { shopId: b.shopId, sender: b.sender, text: b.text, expectedAmount };
}

/** Fixed-window limiter per client IP. Enough to stop a loop from filling the relay; not a security boundary. */
function rateLimit(maxPerMin: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (maxPerMin <= 0) return next();
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    let h = hits.get(key);
    if (!h || h.reset <= now) {
      h = { n: 0, reset: now + 60_000 };
      hits.set(key, h);
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    }
    h.n += 1;
    if (h.n > maxPerMin) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down.' });
    }
    next();
  };
}

const publicShop = (shop: Shop) => ({
  shopId: shop.id,
  name: shop.name,
  accountNumber: shop.accountNumber,
  qrPayload: shop.qrPayload,
  currency: shop.currency,
  language: shop.language,
  timezone: shop.timezone,
});

export function createApp(deps: AppDeps): express.Express {
  const { config, store, gemini } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '16kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const limiter = rateLimit(config.rateLimitPerMin);
  const pipelineDeps: PipelineDeps = {
    store,
    gemini,
    now: deps.now,
    confidenceThreshold: config.confidenceThreshold,
    duplicateWindowMs: config.duplicateWindowMs,
    maxAlertAgeMs: config.maxAlertAgeMs,
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      store: store.kind,
      gemini: { label: gemini.label, mock: gemini.isMock },
      firebase: store.kind === 'firestore' ? config.firebaseWebConfig : null,
    });
  });

  // A screen or the console joins a shop with its pairing code.
  app.post('/api/pair', limiter, async (req, res) => {
    const code = normalizePairingCode(typeof req.body?.code === 'string' ? req.body.code : '');
    if (!code) throw new BadRequest('code is required');
    const shop = await store.findShopByPairingCode(code);
    if (!shop) return res.status(404).json({ error: 'unknown_code', message: 'No shop has that pairing code.' });

    let claimed = false;
    if (store.kind === 'firestore' && typeof req.body?.idToken === 'string') {
      if (!deps.verifyIdToken) throw new Error('verifyIdToken is not configured');
      let uid: string;
      try {
        uid = (await deps.verifyIdToken(req.body.idToken)).uid;
      } catch {
        return res.status(401).json({ error: 'bad_token', message: 'Could not verify the Firebase sign-in.' });
      }
      await store.registerScreen(shop.id, uid);
      claimed = true;
    }
    res.json({ ...publicShop(shop), claimed });
  });

  // What a Connector phone (or the alert console standing in for it) calls.
  app.post('/api/alerts', limiter, async (req, res) => {
    const input = parseAlertBody(req.body);
    const result = await processAlert(input, pipelineDeps, { includeCleanedText: req.query.debug === '1' });
    res.json({
      status: result.status,
      reasonCode: result.reasonCode,
      announce: result.announce,
      event: result.event,
      steps: result.steps,
      ...(result.cleanedText !== undefined ? { cleanedText: result.cleanedText } : {}),
    });
  });

  // Local mode only: Server-Sent Events stand in for the Firestore listener.
  app.get('/api/stream', async (req, res) => {
    if (!store.subscribe) return res.status(404).json({ error: 'not_available', message: 'This server relays through Firestore.' });
    const code = normalizePairingCode(typeof req.query.code === 'string' ? req.query.code : '');
    const shop = code ? await store.findShopByPairingCode(code) : null;
    if (!shop) return res.status(404).json({ error: 'unknown_code', message: 'No shop has that pairing code.' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const history = (await store.recentEvents(shop.id, 20)).reverse();
    res.write(`event: history\ndata: ${JSON.stringify(history)}\n\n`);
    const unsubscribe = store.subscribe(shop.id, (e) => res.write(`event: alert\ndata: ${JSON.stringify(e)}\n\n`));
    const beat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(beat);
      unsubscribe();
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  if (config.serveStatic) {
    const publicDir = path.resolve(__dirname, '..', 'public');
    app.use(express.static(publicDir, { extensions: ['html'] }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: 'invalid_request', message: err.message });
    if (err instanceof ShopNotFoundError) return res.status(404).json({ error: 'unknown_shop', message: err.message });
    if (err instanceof GeminiError) {
      console.error(`[gemini] ${err.message}`);
      return res.status(502).json({ error: 'gemini_unavailable', message: err.message, retryable: true });
    }
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
    if (status >= 400 && status < 500) return res.status(status).json({ error: 'invalid_request', message: 'Malformed request body.' });
    console.error('[server] unexpected error', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on the server.' });
  });

  return app;
}
