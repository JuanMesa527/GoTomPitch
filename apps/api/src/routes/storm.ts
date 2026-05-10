import type { FastifyInstance } from 'fastify';
import { repo } from '../repo/index.js';
import { streamCards } from '../llm/index.js';
import { canAccessSession, getUserId } from '../auth.js';

export async function stormRoutes(app: FastifyInstance) {
  /**
   * SSE. Idempotente al reload: si la sesión ya tiene cards, las re-emite y cierra
   * sin volver a llamar al LLM.
   */
  app.get<{ Params: { id: string } }>('/sessions/:id/storm', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    req.raw.on('close', () => {
      closed = true;
    });

    const existing = await repo.listCards(id);
    if (existing.length > 0) {
      for (const c of existing) {
        if (closed) break;
        send('card', c);
      }
      send('done', { reused: true, count: existing.length });
      reply.raw.end();
      return;
    }

    let count = 0;
    try {
      for await (const card of streamCards(session.client_snapshot)) {
        if (closed) break;
        try {
          const inserted = await repo.insertCard({
            session_id: id,
            category: card.category,
            title: card.title,
            body: card.body,
            source_refs: card.sourceRefs ?? null,
          });
          send('card', inserted);
          count++;
        } catch (err) {
          app.log.error({ err }, 'card insert failed');
        }
      }
      send('done', { reused: false, count });
    } catch (err) {
      app.log.error({ err }, 'storm failed');
      send('error', { message: 'llm_failed' });
    } finally {
      reply.raw.end();
    }
  });

  app.post<{ Params: { id: string } }>('/sessions/:id/storm/regenerate', async (req, reply) => {
    const session = await repo.getSession(req.params.id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    try {
      await repo.deleteCards(req.params.id);
      return reply.send({ ok: true });
    } catch (err) {
      app.log.error({ err }, 'regenerate failed');
      return reply.code(500).send({ error: 'delete_failed' });
    }
  });
}
