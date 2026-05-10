# AssistantCards — GTM Sales Prep micro (back only)

Microservicio aislado de los pasos **04 · Close** y **05 · Retain** del pipeline GTM.
Genera battlecards con DeepSeek sobre un cliente y persiste el pitch armado por el usuario.

```
apps/
  api/   Fastify + TypeScript + Supabase + DeepSeek (NDJSON streaming → SSE)
```

> El front vive en el repo `landingGoTom` bajo `/cards/*`. La comunicación entre front
> y back es **estrictamente HTTP+JSON** (más SSE para el card storm). Este repo no
> conoce nada del front: ni layouts, ni assets, ni filesystem cruzado.

---

## Modos de ejecución

### 🧪 Mock (default, recomendado mientras se arman los demás micros)

```bash
# apps/api/.env
MOCK_MODE=true
INTERNAL_API_KEY=dev-key-cualquiera
```

- No requiere Supabase ni DeepSeek.
- Repo en memoria (datos volátiles).
- LLM canned con delay artificial (`MOCK_LLM_DELAY_MS`, default 350ms) — el front ve streaming SSE real.
- El front detecta el modo vía `/health` y muestra un chip 🧪 **mock mode**.

### 🚀 Real (Supabase + DeepSeek)

`MOCK_MODE=false`. Requiere `DEEPSEEK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y la migración SQL aplicada.

---

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # MOCK_MODE=true por default
pnpm dev                                  # api en :3001
```

Luego, en el repo del front (`landingGoTom`):

```bash
# .env.local
API_BASE_URL=http://localhost:3001
INTERNAL_API_KEY=<el mismo del back>
npm run dev
```

Creá sesiones con `POST /sessions` y el `clientSnapshot` que envía el pipeline (ver tabla de contratos).

### 1. Supabase (modo real)

Crea un proyecto en supabase.com y ejecuta la migración:

```
apps/api/db/migrations/0001_init.sql
```

(SQL editor → pegar → run.) Toma `SUPABASE_URL` y `service_role` key.

### 2. DeepSeek

API key en https://platform.deepseek.com.

### 3. Variables de entorno

```bash
cp apps/api/.env.example apps/api/.env
```

Rellena `DEEPSEEK_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` en `apps/api/.env`.
Usa el **mismo** valor para `INTERNAL_API_KEY` que en el `.env.local` del front.

---

## Contratos del back

Todos requieren `x-api-key: $INTERNAL_API_KEY` y opcionalmente `x-user-id: <uuid>`
(reenviado por el front desde la cookie de Supabase Auth).

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET   | `/health`                              | —                                | `{ ok, mockMode }` |
| POST  | `/sessions`                            | `{ clientSnapshot, clientId? }`   | `{ sessionId }` |
| GET   | `/sessions/:id`                        | —                                | `{ session, cards, pitch }` |
| GET   | `/sessions/:id/storm`                  | — (SSE)                          | `event: card`, `event: done` |
| POST  | `/sessions/:id/storm/regenerate`       | —                                | `{ ok: true }` |
| PATCH | `/sessions/:id/pitch`                  | `{ items: [{cardId, position, note?}] }` | `{ ok: true }` |
| POST  | `/sessions/:id/pitch/generate`         | `{ instructions? }`              | `{ pitch, markdown }` |
| GET   | `/sessions/:id/export`                 | —                                | `text/markdown` |
Forma de `clientSnapshot` — ver `apps/api/src/schemas.ts` (`ClientSnapshotSchema`). El pipeline puede mandar el prospecto con `business_name` (sin `clientId`; se deriva en el back).

---

## Despliegue

- **API**: deploy del directorio `apps/api`. Recomendado un servicio long-lived
  (Render/Railway/Fly) por el SSE; si va a Vercel, usar runtime Node con streaming.
  Variables: las de `apps/api/.env.example`.
- **Front**: vive en el repo `landingGoTom` (despliegue Next.js estándar en Vercel).
  Variables: `API_BASE_URL` (URL pública del back) e `INTERNAL_API_KEY` (server-only).
