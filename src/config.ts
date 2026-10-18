export interface Config {
  port: number;
  store: 'memory' | 'firestore';
  geminiBackend: 'mock' | 'api-key' | 'vertex';
  geminiApiKey?: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  project?: string;
  location: string;
  firebaseWebConfig: Record<string, unknown> | null;
  seedDemoShop: boolean;
  confidenceThreshold: number;
  duplicateWindowMs: number;
  /** 0 disables the stale/future alert-time check. */
  maxAlertAgeMs: number;
  rateLimitPerMin: number;
  serveStatic: boolean;
}

const bool = (v: string | undefined, dflt: boolean): boolean =>
  v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v.trim());

const num = (v: string | undefined, dflt: number): number => {
  if (v === undefined || v.trim() === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number in environment: "${v}"`);
  return n;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === 'production';
  const apiKey = env.GEMINI_API_KEY?.trim() || undefined;
  const project = env.GOOGLE_CLOUD_PROJECT?.trim() || undefined;
  const mockFlag = env.MOCK_GEMINI === undefined || env.MOCK_GEMINI === '' ? undefined : bool(env.MOCK_GEMINI, false);

  let geminiBackend: Config['geminiBackend'];
  if (mockFlag === true) geminiBackend = 'mock';
  else if (apiKey) geminiBackend = 'api-key';
  else if (project) geminiBackend = 'vertex';
  else if (mockFlag === undefined && !isProd) geminiBackend = 'mock'; // local dev with no credentials
  else
    throw new Error(
      'No Gemini credentials. Set MOCK_GEMINI=true, or GEMINI_API_KEY, or GOOGLE_CLOUD_PROJECT (Vertex AI with application default credentials).',
    );

  const store = (env.STORE ?? 'memory').trim() as Config['store'];
  if (store !== 'memory' && store !== 'firestore') throw new Error(`STORE must be "memory" or "firestore", got "${store}"`);
  if (store === 'firestore' && !project) throw new Error('STORE=firestore needs GOOGLE_CLOUD_PROJECT.');

  let firebaseWebConfig: Config['firebaseWebConfig'] = null;
  if (env.FIREBASE_WEB_CONFIG?.trim()) {
    try {
      firebaseWebConfig = JSON.parse(env.FIREBASE_WEB_CONFIG);
    } catch {
      throw new Error('FIREBASE_WEB_CONFIG must be valid JSON (the Firebase web app config object).');
    }
  }

  return {
    port: num(env.PORT, 8080),
    store,
    geminiBackend,
    geminiApiKey: apiKey,
    geminiModel: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    geminiTimeoutMs: num(env.GEMINI_TIMEOUT_MS, 15000),
    project,
    location: env.GOOGLE_CLOUD_LOCATION?.trim() || 'global',
    firebaseWebConfig,
    seedDemoShop: bool(env.SEED_DEMO_SHOP, store === 'memory'),
    confidenceThreshold: num(env.CONFIDENCE_THRESHOLD, 0.7),
    duplicateWindowMs: num(env.DUPLICATE_WINDOW_MINUTES, 24 * 60) * 60_000,
    maxAlertAgeMs: num(env.MAX_ALERT_AGE_MINUTES, 120) * 60_000,
    rateLimitPerMin: num(env.RATE_LIMIT_PER_MIN, 60),
    serveStatic: bool(env.SERVE_STATIC, true),
  };
}
