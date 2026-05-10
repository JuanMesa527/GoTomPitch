import { env } from '../env.js';
import { memoryRepo } from './memory.js';
import type { Repo } from './types.js';

/**
 * Selecciona el repo según MOCK_MODE. La importación de supabase es perezosa para que
 * el modo dev no cargue el cliente ni requiera las envs de Supabase.
 */
async function pickRepo(): Promise<Repo> {
  if (env.MOCK_MODE) return memoryRepo;
  const { supabaseRepo } = await import('./supabase.js');
  return supabaseRepo;
}

export const repo: Repo = await pickRepo();
export type { DbCard, DbPitchItem, DbSession, Repo } from './types.js';
