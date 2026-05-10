import { randomUUID } from 'node:crypto';
import type { Repo, DbSession, DbCard, DbPitchItem, DbPitch } from './types.js';

/**
 * Repo en memoria para modo dev/mock. Los datos se pierden al reiniciar el server.
 * No pretende ser thread-safe ni eficiente — solo desbloquea la UI mientras llegan los demás
 * microservicios y queda configurado Supabase real.
 */
class MemoryRepo implements Repo {
  private sessions = new Map<string, DbSession>();
  private cards = new Map<string, DbCard>();
  private pitch = new Map<string, DbPitchItem>(); // key: sessionId:cardId
  private pitches = new Map<string, DbPitch>(); // key: pitch.id

  async createSession({ clientId, clientSnapshot, userId }: Parameters<Repo['createSession']>[0]) {
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      client_id: clientId,
      user_id: userId ?? null,
      client_snapshot: clientSnapshot,
      created_at: new Date().toISOString(),
    });
    return { id };
  }

  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async listCards(sessionId: string) {
    return [...this.cards.values()]
      .filter((c) => c.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async insertCard(input: Omit<DbCard, 'id' | 'created_at'>) {
    const card: DbCard = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...input,
    };
    this.cards.set(card.id, card);
    return card;
  }

  async deleteCards(sessionId: string) {
    for (const [id, c] of this.cards) {
      if (c.session_id === sessionId) this.cards.delete(id);
    }
    for (const key of this.pitch.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.pitch.delete(key);
    }
  }

  async listPitch(sessionId: string) {
    return [...this.pitch.values()]
      .filter((p) => p.session_id === sessionId)
      .sort((a, b) => a.position - b.position);
  }

  async replacePitch(sessionId: string, items: Omit<DbPitchItem, 'session_id'>[]) {
    for (const key of this.pitch.keys()) {
      if (key.startsWith(`${sessionId}:`)) this.pitch.delete(key);
    }
    for (const it of items) {
      this.pitch.set(`${sessionId}:${it.card_id}`, { session_id: sessionId, ...it });
    }
    return items.length;
  }

  async savePitch({ sessionId, userId, instructions, payload, markdown }: Parameters<Repo['savePitch']>[0]) {
    const previous = [...this.pitches.values()].filter((p) => p.session_id === sessionId);
    for (const p of previous) {
      if (p.is_current) this.pitches.set(p.id, { ...p, is_current: false });
    }
    const nextVersion = previous.reduce((acc, p) => Math.max(acc, p.version), 0) + 1;
    const row: DbPitch = {
      id: randomUUID(),
      session_id: sessionId,
      user_id: userId ?? null,
      version: nextVersion,
      is_current: true,
      instructions: instructions ?? null,
      payload,
      markdown,
      created_at: new Date().toISOString(),
    };
    this.pitches.set(row.id, row);
    return row;
  }

  async getCurrentPitch(sessionId: string) {
    return (
      [...this.pitches.values()].find((p) => p.session_id === sessionId && p.is_current) ?? null
    );
  }

  async listPitches(sessionId: string) {
    return [...this.pitches.values()]
      .filter((p) => p.session_id === sessionId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export const memoryRepo: Repo = new MemoryRepo();
