import type { CardCategory, ClientSnapshot, GeneratedPitch } from '../schemas.js';

export type DbSession = {
  id: string;
  client_id: string;
  user_id: string | null;
  client_snapshot: ClientSnapshot;
  created_at: string;
};

export type DbCard = {
  id: string;
  session_id: string;
  category: CardCategory;
  title: string;
  body: string;
  source_refs: string[] | null;
  created_at: string;
};

export type DbPitchItem = {
  session_id: string;
  card_id: string;
  position: number;
  note: string | null;
};

export type DbPitch = {
  id: string;
  session_id: string;
  user_id: string | null;
  version: number;
  is_current: boolean;
  instructions: string | null;
  payload: GeneratedPitch;
  markdown: string;
  created_at: string;
};

export interface Repo {
  createSession(input: {
    clientId: string;
    clientSnapshot: ClientSnapshot;
    userId?: string | null;
  }): Promise<{ id: string }>;
  getSession(id: string): Promise<DbSession | null>;
  listCards(sessionId: string): Promise<DbCard[]>;
  insertCard(input: Omit<DbCard, 'id' | 'created_at'>): Promise<DbCard>;
  deleteCards(sessionId: string): Promise<void>;
  listPitch(sessionId: string): Promise<DbPitchItem[]>;
  replacePitch(sessionId: string, items: Omit<DbPitchItem, 'session_id'>[]): Promise<number>;

  /**
   * Persiste una nueva versión del pitch generado. Marca esta versión como vigente
   * (is_current=true) y desmarca las anteriores de la misma sesión.
   */
  savePitch(input: {
    sessionId: string;
    userId?: string | null;
    instructions?: string | null;
    payload: GeneratedPitch;
    markdown: string;
  }): Promise<DbPitch>;
  getCurrentPitch(sessionId: string): Promise<DbPitch | null>;
  listPitches(sessionId: string): Promise<DbPitch[]>;
}
