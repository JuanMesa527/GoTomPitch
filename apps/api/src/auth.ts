import type { FastifyRequest } from 'fastify';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee el `x-user-id` que reenvía el front desde la cookie de Supabase Auth.
 * No es una verificación criptográfica — el front es trusted (mismo deploy) y la API
 * solo se expone con `INTERNAL_API_KEY`. Se valida que sea un uuid bien formado.
 */
export function getUserId(req: FastifyRequest): string | null {
  const raw = req.headers['x-user-id'];
  if (typeof raw !== 'string') return null;
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * Devuelve true si el usuario puede tocar la sesión: o no hay dueño definido (legacy / mock)
 * o el dueño coincide con el header.
 */
export function canAccessSession(sessionUserId: string | null, headerUserId: string | null) {
  if (!sessionUserId) return true;
  return sessionUserId === headerUserId;
}
