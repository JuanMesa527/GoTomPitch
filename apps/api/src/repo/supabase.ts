import { createClient } from '@supabase/supabase-js';
import { env } from '../env.js';
import { ClientSnapshotSchema, GeneratedPitchSchema } from '../schemas.js';
import type { Repo, DbCard, DbPitchItem, DbSession, DbPitch } from './types.js';

class SupabaseRepo implements Repo {
  private client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  async createSession({ clientId, clientSnapshot, userId }: Parameters<Repo['createSession']>[0]) {
    const { data, error } = await this.client
      .from('sessions')
      .insert({ client_id: clientId, client_snapshot: clientSnapshot, user_id: userId ?? null })
      .select('id')
      .single();
    if (error || !data) throw new Error(`createSession: ${error?.message ?? 'no data'}`);
    return { id: data.id as string };
  }

  async getSession(id: string): Promise<DbSession | null> {
    const { data, error } = await this.client.from('sessions').select('*').eq('id', id).single();
    if (error || !data) return null;
    const snap = ClientSnapshotSchema.safeParse(data.client_snapshot);
    return {
      id: data.id,
      client_id: data.client_id,
      user_id: (data.user_id as string | null) ?? null,
      created_at: data.created_at,
      client_snapshot: snap.success ? snap.data : (data.client_snapshot as DbSession['client_snapshot']),
    };
  }

  async listCards(sessionId: string) {
    const { data, error } = await this.client
      .from('cards')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at');
    if (error) throw new Error(`listCards: ${error.message}`);
    return (data ?? []) as DbCard[];
  }

  async insertCard(input: Omit<DbCard, 'id' | 'created_at'>) {
    const { data, error } = await this.client.from('cards').insert(input).select('*').single();
    if (error || !data) throw new Error(`insertCard: ${error?.message ?? 'no data'}`);
    return data as DbCard;
  }

  async deleteCards(sessionId: string) {
    const { error } = await this.client.from('cards').delete().eq('session_id', sessionId);
    if (error) throw new Error(`deleteCards: ${error.message}`);
  }

  async listPitch(sessionId: string) {
    const { data, error } = await this.client
      .from('pitch_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('position');
    if (error) throw new Error(`listPitch: ${error.message}`);
    return (data ?? []) as DbPitchItem[];
  }

  async replacePitch(sessionId: string, items: Omit<DbPitchItem, 'session_id'>[]) {
    const { error: delErr } = await this.client.from('pitch_items').delete().eq('session_id', sessionId);
    if (delErr) throw new Error(`replacePitch.delete: ${delErr.message}`);
    if (items.length === 0) return 0;
    const rows = items.map((it) => ({ session_id: sessionId, ...it }));
    const { error } = await this.client.from('pitch_items').insert(rows);
    if (error) throw new Error(`replacePitch.insert: ${error.message}`);
    return rows.length;
  }

  async savePitch({ sessionId, userId, instructions, payload, markdown }: Parameters<Repo['savePitch']>[0]) {
    // Calcular siguiente versión leyendo el max actual.
    const { data: prev, error: prevErr } = await this.client
      .from('pitches')
      .select('version')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1);
    if (prevErr) throw new Error(`savePitch.maxVersion: ${prevErr.message}`);
    const nextVersion = ((prev ?? [])[0]?.version ?? 0) + 1;

    // Marcar todas las versiones anteriores como no-current antes de insertar la nueva,
    // para respetar el unique index parcial (un solo current por session).
    const { error: clearErr } = await this.client
      .from('pitches')
      .update({ is_current: false })
      .eq('session_id', sessionId)
      .eq('is_current', true);
    if (clearErr) throw new Error(`savePitch.clearCurrent: ${clearErr.message}`);

    const { data, error } = await this.client
      .from('pitches')
      .insert({
        session_id: sessionId,
        user_id: userId ?? null,
        version: nextVersion,
        is_current: true,
        instructions: instructions ?? null,
        payload,
        markdown,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(`savePitch.insert: ${error?.message ?? 'no data'}`);
    const parsed = GeneratedPitchSchema.safeParse(data.payload);
    return {
      ...(data as Omit<DbPitch, 'payload'>),
      payload: parsed.success ? parsed.data : (data.payload as DbPitch['payload']),
    };
  }

  async getCurrentPitch(sessionId: string) {
    const { data, error } = await this.client
      .from('pitches')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_current', true)
      .maybeSingle();
    if (error) throw new Error(`getCurrentPitch: ${error.message}`);
    if (!data) return null;
    const parsed = GeneratedPitchSchema.safeParse(data.payload);
    return {
      ...(data as Omit<DbPitch, 'payload'>),
      payload: parsed.success ? parsed.data : (data.payload as DbPitch['payload']),
    };
  }

  async listPitches(sessionId: string) {
    const { data, error } = await this.client
      .from('pitches')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`listPitches: ${error.message}`);
    return (data ?? []).map((row) => {
      const parsed = GeneratedPitchSchema.safeParse(row.payload);
      return {
        ...(row as Omit<DbPitch, 'payload'>),
        payload: parsed.success ? parsed.data : (row.payload as DbPitch['payload']),
      };
    });
  }
}

export const supabaseRepo: Repo = new SupabaseRepo();
