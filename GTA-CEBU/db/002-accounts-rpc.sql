-- Accounts as database functions.
--
-- The deployed backend is a Cloudflare Worker, which cannot open a TLS
-- Postgres connection -- measured: every SSL variant fails, only plaintext
-- connects, and plaintext is not an option for passwords. So the Worker talks
-- to Supabase over HTTPS (PostgREST), which can only call functions, not run
-- SQL. Defining the work here means both backends -- the Node dev server and
-- the Worker -- execute exactly the same code, rather than one reimplementing
-- the other.
--
-- Every function returns a single row with an `error` column. An empty error
-- means success. Errors are values rather than exceptions so a failure reads
-- the same over both transports instead of becoming an HTTP 500 in one.

-- search_path is pinned on every function below: a security-definer function
-- that inherits the caller's search_path can be tricked into running their
-- code as its owner. It has to include "extensions" because that is where
-- Supabase installs pgcrypto -- crypt() and gen_random_bytes() are not in
-- public, and pinning public alone makes them invisible.
create extension if not exists pgcrypto with schema extensions;

-- Nothing may read these tables directly. The functions below are the only
-- way in, and they run as their owner.
alter table players  enable row level security;
alter table sessions enable row level security;

create or replace function new_session(p_player uuid, p_agent text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into sessions (token, player_id, expires_at, user_agent)
  values (v_token, p_player, now() + interval '30 days', left(coalesce(p_agent,''), 200));
  return v_token;
end $$;

create or replace function register_player(p_name text, p_email text, p_password text, p_agent text default '')
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype; v_token text;
begin
  p_name  := btrim(coalesce(p_name, ''));
  p_email := nullif(btrim(coalesce(p_email, '')), '');

  if length(p_name) < 3  then return query select 'Name needs at least 3 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text; return; end if;
  if length(p_name) > 20 then return query select 'Name can be at most 20 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text; return; end if;
  if p_name !~ '^[A-Za-z0-9_]+$' then return query select 'Name can use letters, numbers and underscore only'::text, null::uuid, null::text, null::text, null::timestamptz, null::text; return; end if;
  if length(coalesce(p_password,'')) < 8 then return query select 'Password needs at least 8 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text; return; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then return query select 'That email does not look right'::text, null::uuid, null::text, null::text, null::timestamptz, null::text; return; end if;

  begin
    insert into players (name, email, password_hash)
    values (p_name, p_email, crypt(p_password, gen_salt('bf', 10)))
    returning * into v;
  exception when unique_violation then
    -- Let the index decide rather than checking first: two people registering
    -- the same name at once would both pass a check-then-insert.
    return query select
      case when sqlerrm like '%players_email_key%' then 'That email is already registered'
           else 'That name is already taken' end::text,
      null::uuid, null::text, null::text, null::timestamptz, null::text;
    return;
  end;

  v_token := new_session(v.id, p_agent);
  return query select ''::text, v.id, v.name, v.email, v.created_at, v_token;
end $$;

create or replace function login_player(p_name text, p_password text, p_agent text default '')
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype; v_token text;
begin
  -- One lookup that both finds the player and checks the password, so a wrong
  -- name and a wrong password cost the same and say the same -- otherwise the
  -- form tells anyone who asks which names exist.
  select * into v from players
   where lower(players.name) = lower(btrim(coalesce(p_name,'')))
     and password_hash = crypt(coalesce(p_password,''), password_hash);

  if not found then
    return query select 'Wrong name or password'::text, null::uuid, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  update players set last_seen_at = now() where players.id = v.id;
  v_token := new_session(v.id, p_agent);
  return query select ''::text, v.id, v.name, v.email, v.created_at, v_token;
end $$;

create or replace function player_for_token(p_token text)
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype;
begin
  select p.* into v from sessions s join players p on p.id = s.player_id
   where s.token = coalesce(p_token,'') and s.expires_at > now();
  if not found then
    return query select 'Not signed in'::text, null::uuid, null::text, null::text, null::timestamptz, null::text;
    return;
  end if;
  return query select ''::text, v.id, v.name, v.email, v.created_at, p_token;
end $$;

create or replace function logout_player(p_token text)
returns table (error text) language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from sessions where token = coalesce(p_token,'');
  -- Expired rows are harmless but they accumulate; this is a cheap moment.
  delete from sessions where expires_at < now();
  return query select ''::text;
end $$;

-- Only the service role may call these. The browser never holds that key --
-- it talks to the Worker, and the Worker talks to Supabase.
revoke all on function register_player(text,text,text,text) from public, anon;
revoke all on function login_player(text,text,text)         from public, anon;
revoke all on function player_for_token(text)               from public, anon;
revoke all on function logout_player(text)                  from public, anon;
revoke all on function new_session(uuid,text)               from public, anon;
grant execute on function register_player(text,text,text,text) to service_role;
grant execute on function login_player(text,text,text)         to service_role;
grant execute on function player_for_token(text)               to service_role;
grant execute on function logout_player(text)                  to service_role;
