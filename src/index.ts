import 'dotenv/config';
import { loadConfig } from './config';
import { FirestoreStore } from './firestoreStore';
import { createGemini } from './gemini';
import { DEMO_SHOP } from './seed';
import { createApp } from './server';
import { MemoryStore, type Store } from './store';

async function main() {
  const config = loadConfig();
  const gemini = createGemini(config);

  let store: Store;
  let verifyIdToken: ((token: string) => Promise<{ uid: string }>) | undefined;
  if (config.store === 'firestore') {
    store = new FirestoreStore(config.project as string);
    const { getAuth } = await import('firebase-admin/auth');
    verifyIdToken = async (token) => ({ uid: (await getAuth().verifyIdToken(token)).uid });
  } else {
    store = new MemoryStore();
  }
  if (config.seedDemoShop) await store.upsertShop(DEMO_SHOP, { onlyIfMissing: true });

  const app = createApp({ config, store, gemini, verifyIdToken });
  const server = app.listen(config.port, () => {
    console.log(`Jugnu Alert listening on http://localhost:${config.port}`);
    console.log(`  store:  ${config.store}${config.store === 'memory' ? ' (data is lost on restart)' : ` (project ${config.project})`}`);
    console.log(`  gemini: ${gemini.label}${gemini.isMock ? '  <- MOCK: no real model is called' : ''}`);
    console.log(`  screen:  http://localhost:${config.port}/   console: http://localhost:${config.port}/console`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
