import type { FastifyInstance } from 'fastify';
import { repo } from '../repo/index.js';
import { CreateSessionSchema } from '../schemas.js';
import { getUserId } from '../auth.js';
import { SAMPLE_CLIENT_PAYLOAD } from '../fixtures/sampleClient.js';

/**
 * Rutas solo para desarrollo cuando MOCK_MODE=true.
 * POST /dev/sessions/sample — mismo fixture que delega el proxy Next `/api/cards/sessions/sample`.
 */
export async function devRoutes(app: FastifyInstance) {
  app.post('/dev/sessions/sample', async (req, reply) => {
    const parsed = CreateSessionSchema.safeParse(SAMPLE_CLIENT_PAYLOAD);
    if (!parsed.success) {
      app.log.error({ issues: parsed.error.issues }, 'sample payload invalid');
      return reply.code(500).send({ error: 'sample_invalid', issues: parsed.error.issues });
    }
    try {
      const userId = getUserId(req);
      const { id } = await repo.createSession({
        clientId: parsed.data.clientId,
        clientSnapshot: parsed.data.clientSnapshot,
        userId,
      });
      return reply.code(201).send({ sessionId: id });
    } catch (err) {
      app.log.error({ err }, 'dev sample session failed');
      return reply.code(500).send({ error: 'create_failed' });
    }
  });
}
