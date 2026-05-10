import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { repo, type DbCard } from '../repo/index.js';
import { PatchPitchSchema } from '../schemas.js';
import { generatePitch } from '../llm/index.js';
import { pitchToMarkdown } from '../llm/pitchPrompt.js';
import { canAccessSession, getUserId } from '../auth.js';

const PitchGenerateBodySchema = z
  .object({ instructions: z.string().max(2000).optional() })
  .optional();

const CATEGORY_LABEL: Record<DbCard['category'], string> = {
  opportunity: 'Oportunidad',
  tip: 'Tip',
  critical: 'Info crítica',
  risk: 'Riesgo',
};

export async function pitchRoutes(app: FastifyInstance) {
  app.patch<{ Params: { id: string } }>('/sessions/:id/pitch', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const parsed = PatchPitchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    }
    try {
      const count = await repo.replacePitch(
        id,
        parsed.data.items.map((it) => ({
          card_id: it.cardId,
          position: it.position,
          note: it.note ?? null,
        })),
      );
      return reply.send({ ok: true, count });
    } catch (err) {
      app.log.error({ err }, 'replacePitch failed');
      return reply.code(500).send({ error: 'pitch_write_failed' });
    }
  });

  app.get<{ Params: { id: string } }>('/sessions/:id/export', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [pitch, cards] = await Promise.all([repo.listPitch(id), repo.listCards(id)]);
    const cardById = new Map<string, DbCard>(cards.map((c) => [c.id, c]));
    const clientName = session.client_snapshot.name ?? session.client_id;

    const lines: string[] = [];
    lines.push(`# Pitch — ${clientName}`);
    lines.push('');
    lines.push(`_Generado: ${new Date().toISOString()}_`);
    lines.push('');

    for (const item of pitch) {
      const c = cardById.get(item.card_id);
      if (!c) continue;
      lines.push(`## ${item.position + 1}. ${c.title}`);
      lines.push('');
      lines.push(`**${CATEGORY_LABEL[c.category]}**`);
      lines.push('');
      lines.push(c.body);
      if (item.note) {
        lines.push('');
        lines.push(`> ${item.note}`);
      }
      lines.push('');
    }

    return reply.type('text/markdown; charset=utf-8').send(lines.join('\n'));
  });

  /**
   * Genera un pitch profesional (3–5 min) usando las cards seleccionadas + el snapshot
   * con foco en commercial_approach. Devuelve JSON estructurado y markdown ya serializado,
   * y persiste cada generación como una nueva versión (la última queda marcada is_current).
   */
  app.post<{ Params: { id: string } }>('/sessions/:id/pitch/generate', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    const headerUserId = getUserId(req);
    if (!canAccessSession(session.user_id, headerUserId)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [pitchItems, cards] = await Promise.all([repo.listPitch(id), repo.listCards(id)]);
    if (pitchItems.length === 0 && cards.length === 0) {
      return reply.code(400).send({ error: 'empty_pitch', message: 'Sin cards seleccionadas para armar el pitch.' });
    }

    // Fallback defensivo: si por algún motivo el pitch_items quedó vacío (ej. un PATCH
    // accidental con items: []), igual permitimos regenerar usando todas las cards en su
    // orden de creación. Mejor un pitch razonable que un 400 que rompe el flujo de regenerar.
    const cardById = new Map<string, DbCard>(cards.map((c) => [c.id, c]));
    const orderedCards =
      pitchItems.length > 0
        ? pitchItems
            .map((p) => {
              const c = cardById.get(p.card_id);
              if (!c) return null;
              return { category: c.category, title: c.title, body: c.body, note: p.note };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null)
        : cards.map((c) => ({ category: c.category, title: c.title, body: c.body, note: null }));

    const bodyParsed = PitchGenerateBodySchema.safeParse(req.body ?? {});
    const instructions = bodyParsed.success ? bodyParsed.data?.instructions : undefined;

    try {
      const pitch = await generatePitch({
        snapshot: session.client_snapshot,
        cards: orderedCards,
        instructions,
      });
      const markdown = pitchToMarkdown(pitch);

      // Persistencia: nueva versión, queda como current. No bloquea la respuesta si falla
      // pero sí logueamos — el front sigue funcionando con la generación en memoria.
      let saved = null;
      try {
        saved = await repo.savePitch({
          sessionId: id,
          userId: session.user_id ?? headerUserId,
          instructions: instructions ?? null,
          payload: pitch,
          markdown,
        });
      } catch (err) {
        app.log.error({ err }, 'savePitch failed (non-fatal)');
      }

      return reply.send({
        pitch,
        markdown,
        version: saved?.version ?? null,
        pitchId: saved?.id ?? null,
      });
    } catch (err) {
      app.log.error({ err }, 'pitch generation failed');
      return reply.code(500).send({ error: 'pitch_generation_failed' });
    }
  });

  /**
   * Devuelve la última versión del pitch persistido para esta sesión, sin volver a llamar al
   * LLM. Útil para abrir el pitch tras un reload sin pagar otra generación.
   */
  app.get<{ Params: { id: string } }>('/sessions/:id/pitch/current', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const current = await repo.getCurrentPitch(id);
    if (!current) return reply.code(404).send({ error: 'no_pitch_yet' });
    return reply.send({
      pitch: current.payload,
      markdown: current.markdown,
      version: current.version,
      pitchId: current.id,
      instructions: current.instructions,
      createdAt: current.created_at,
    });
  });

  /**
   * Lista el historial de versiones del pitch (sin payload completo para no engordar la respuesta).
   */
  app.get<{ Params: { id: string } }>('/sessions/:id/pitch/history', async (req, reply) => {
    const id = req.params.id;
    const session = await repo.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (!canAccessSession(session.user_id, getUserId(req))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const all = await repo.listPitches(id);
    return reply.send({
      items: all.map((p) => ({
        id: p.id,
        version: p.version,
        is_current: p.is_current,
        instructions: p.instructions,
        created_at: p.created_at,
      })),
    });
  });
}
