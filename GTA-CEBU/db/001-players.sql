-- Player accounts. The first persistent state the game has had: everything
-- else (positions, rooms, matches) dies with the round.
--
-- Passwords are hashed by Postgres itself, with pgcrypto's bcrypt, rather than
-- by the application. That is not a stylistic choice: the production backend
-- is a Cloudflare Worker with roughly 10ms of CPU per request, and PBKDF2 at
-- the recommended iteration count measures 22.8ms. Hashing at the edge would
-- either blow the budget or have to be weakened to the point of being
-- pointless. Postgres has no such limit, and bcrypt carries its own salt and
-- cost factor inside the stored string.
--
-- The plaintext travels Worker -> Postgres inside a parameterised query over
-- TLS, and is never written to a column or a log.

create extension if not exists pgcrypto;

drop table if exists sessions;
drop table if exists players;

create table players (
  id            uuid        primary key default gen_random_uuid(),
  -- The name shown in game. Unique regardless of case, so "Ava" and "ava"
  -- cannot both exist and be confused for each other on a scoreboard.
  name          text        not null,
  email         text,
  password_hash text        not null,     -- bcrypt; salt and cost are inside it
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);

create unique index players_name_key  on players (lower(name));
create unique index players_email_key on players (lower(email)) where email is not null;

-- Opaque session tokens rather than JWTs: the game already holds a connection
-- to the server, so statelessness buys nothing, and a row can be deleted the
-- moment somebody logs out or is banned.
create table sessions (
  token      text        primary key,
  player_id  uuid        not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);

create index sessions_player_idx  on sessions (player_id);
create index sessions_expires_idx on sessions (expires_at);
