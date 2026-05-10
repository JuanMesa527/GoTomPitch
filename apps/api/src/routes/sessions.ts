import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { repo } from '../repo/index.js';
import { CreateSessionSchema } from '../schemas.js';
import { canAccessSession, getUserId } from '../auth.js';
// Fixture importado estáticamente: así Vercel lo bundlea con el código y no
// dependemos de filesystem relativo (que rompe al empaquetar la function).
import sampleClient from '../../fixtures/sample-client.json' with { type: 'json' };

export async function sessionsRoutes(app: FastifyInstance) {
  app.post('/sessions', async (req, reply) => {
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    try {
      // Si el body trae userId lo respetamos; si no, usamos el del header.
      const userId = parsed.data.userId ?? getUserId(req);
      const { id } = await repo.createSession({
        clientId: parsed.data.clientId,
        clientSnapshot: parsed.data.clientSnapshot,
        userId,
      });
      return reply.code(201).send({ sessionId: id });
    } catch (err) {
      app.log.error({ err }, 'createSession failed');
      return reply.code(500).send({ error: 'create_failed' });
    }
  });

  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [cards, pitch] = await Promise.all([repo.listCards(id), repo.listPitch(id)]);

    return reply.send({
      session: {
        id: session.id,
        clientId: session.client_id,
        userId: session.user_id,
        createdAt: session.created_at,
        clientSnapshot: session.client_snapshot,
      },
      cards,
      pitch,
    });
  });

  /**
   * Solo en MOCK_MODE: crea una sesión usando el fixture del repo, sin que el front
   * tenga que conocer el shape del snapshot. Útil para QA manual.
   */
  if (env.MOCK_MODE) {
    app.post('/dev/sessions/sample', async (req, reply) => {
      const parsed = CreateSessionSchema.safeParse(sampleClient);
      if (!parsed.success) {
        return reply.code(500).send({ error: 'fixture_invalid', issues: parsed.error.issues });
      }
      const { id } = await repo.createSession({
        clientId: parsed.data.clientId,
        clientSnapshot: parsed.data.clientSnapshot,
        userId: parsed.data.userId ?? getUserId(req),
      });
      return reply.code(201).send({ sessionId: id });
    });
  }
}
