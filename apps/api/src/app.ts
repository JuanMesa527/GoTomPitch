import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { sessionsRoutes } from './routes/sessions.js';
import { stormRoutes } from './routes/storm.js';
import { pitchRoutes } from './routes/pitch.js';

/**
 * Construye la instancia Fastify con todos los plugins/rutas registrados y
 * `await app.ready()` ya invocado. Es el factory que comparten:
 *   - el server local de dev (`server.ts`)
 *   - el handler serverless de Vercel (`api/index.ts`)
 *
 * En serverless cacheamos la promesa a nivel de módulo para reusar la misma
 * instancia entre invocaciones calientes (warm starts).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: false,
    exposedHeaders: ['Content-Type'],
  });

  // Auth simple por API key compartida con el front (vía Route Handlers de Next.js).
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (req.url === '/health') return;
    const key = req.headers['x-api-key'];
    if (key !== env.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ ok: true, mockMode: env.MOCK_MODE }));

  if (env.MOCK_MODE) {
    app.log.warn(
      '🧪 MOCK_MODE activo: repo en memoria + LLM canned. Los datos se pierden al reiniciar.',
    );
  }

  await app.register(sessionsRoutes);
  await app.register(stormRoutes);
  await app.register(pitchRoutes);

  await app.ready();
  return app;
}
