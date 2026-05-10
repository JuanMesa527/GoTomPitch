import { buildApp } from './app.js';
import { env } from './env.js';

/**
 * Entry point para desarrollo local y deploys long-lived (Render/Railway/Fly).
 * En Vercel NO se usa este archivo — ahí entra `api/index.ts`, que reusa el
 * mismo `buildApp()` factory.
 */
const app = await buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`assistant-cards api listening on :${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
