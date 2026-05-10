import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';

/**
 * Handler único para Vercel (Node runtime con streaming).
 * Todas las rutas (`/health`, `/sessions/...`, SSE de `/sessions/:id/storm`,
 * etc.) caen acá vía rewrite definido en `vercel.json`.
 *
 *  - `runtime: 'nodejs'` → no usar Edge: el back depende de `@supabase/...`,
 *    `openai` y SSE con backpressure de Node http.
 *  - `maxDuration: 300` → SSE puede tardar; con Fluid Compute estos 5min
 *    no bloquean la concurrencia. Subilo a 800 si tu plan lo permite y
 *    ves cortes durante storms largos.
 */
export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};

let appPromise: ReturnType<typeof buildApp> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = buildApp().catch((err) => {
      // Si build falla, limpiá la promesa cacheada para que la próxima
      // invocación reintente (vs servir un fail permanente del warm start).
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
