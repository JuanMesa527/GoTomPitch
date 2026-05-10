-- Migración inicial completa para AssistantCards.
-- Idempotente: se puede correr múltiples veces sin romper nada.
-- Ejecutar en SQL editor de Supabase, o vía `supabase db push` si tenés CLI configurada.

-- ────────────────────────────────────────────────────────────────────────────
-- Extensiones
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- Tabla: sessions
-- Una fila por cada prep comercial. user_id ata la sesión al usuario logueado
-- (auth.users), y por cascada baja a cards/pitch_items/pitches.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  client_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Tabla: cards
-- Las tarjetas que genera el "card storm" (LLM) para una sesión.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  category text not null check (category in ('opportunity','tip','critical','risk')),
  title text not null,
  body text not null,
  source_refs jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cards_session_idx on cards(session_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Tabla: pitch_items
-- Cards que el vendedor arrastró al pitch + nota libre + orden.
-- PK compuesta (session_id, card_id) ⇒ una card no se duplica en el mismo pitch.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists pitch_items (
  session_id uuid not null references sessions(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  position int not null,
  note text,
  primary key (session_id, card_id)
);
create index if not exists pitch_items_session_idx on pitch_items(session_id, position);

-- ────────────────────────────────────────────────────────────────────────────
-- Tabla: pitches
-- Cada llamada a /pitch/generate crea una fila. Solo una versión por sesión
-- queda marcada como vigente (is_current=true) — el front lee esa por default.
-- payload guarda el GeneratedPitch completo, markdown queda serializado para
-- exportar/copiar sin recalcular.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists pitches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  version int not null default 1,
  is_current boolean not null default true,
  instructions text,
  payload jsonb not null,
  markdown text not null,
  created_at timestamptz not null default now()
);
create index if not exists pitches_session_idx on pitches(session_id, created_at desc);
create index if not exists pitches_user_idx on pitches(user_id);
-- Solo un pitch "current" por session.
create unique index if not exists pitches_one_current_per_session
  on pitches(session_id) where is_current;
