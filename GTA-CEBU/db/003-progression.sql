-- Levelling and currency.
--
-- The level itself is NOT stored. It is derived from experience by the same
-- curve the client uses (src/progression.js), so there is one definition to
-- change when the numbers get tuned -- a stored level would immediately
-- disagree with the client the first time the curve moves.
--
-- Awarding is a function rather than an update so the Worker can reach it over
-- HTTPS, and so the arithmetic cannot be driven from a browser: the client
-- reports what happened in the match, the database decides what that is worth.

alter table players add column if not exists exp            bigint  not null default 0;
alter table players add column if not exists points         bigint  not null default 0;
alter table players add column if not exists matches_played integer not null default 0;
alter table players add column if not exists kills          integer not null default 0;
alter table players add column if not exists deaths         integer not null default 0;
alter table players add column if not exists wins           integer not null default 0;

-- Keep these in step with AWARDS in src/progression.js.
create or replace function match_reward(p_kills int, p_deaths int, p_won boolean)
returns table (exp bigint, points bigint)
language sql immutable as $$
  select (50  + greatest(p_kills,0) * 25 + greatest(p_deaths,0) * 5
              + case when p_won then 100 else 0 end)::bigint,
         (10  + greatest(p_kills,0) * 5
              + case when p_won then 25  else 0 end)::bigint
$$;

-- Called once per player per finished match. Takes a session token rather than
-- a player id: the caller is the game server, and a token is the only thing it
-- legitimately holds -- so a bad token simply earns nothing.
create or replace function award_match(p_token text, p_kills int, p_deaths int, p_won boolean)
returns table (error text, exp bigint, points bigint, gained_exp bigint, gained_points bigint,
               matches_played int, kills int, deaths int, wins int)
language plpgsql security definer set search_path = public, extensions as $$
declare v_player uuid; v_exp bigint; v_points bigint; v players%rowtype;
begin
  select s.player_id into v_player from sessions s
   where s.token = coalesce(p_token,'') and s.expires_at > now();
  if v_player is null then
    return query select 'Not signed in'::text, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0, 0, 0, 0;
    return;
  end if;

  -- Clamped: a match cannot plausibly produce hundreds of kills, and this is
  -- the only place the numbers arrive from outside.
  p_kills  := least(greatest(coalesce(p_kills,0), 0), 200);
  p_deaths := least(greatest(coalesce(p_deaths,0), 0), 200);

  select r.exp, r.points into v_exp, v_points from match_reward(p_kills, p_deaths, coalesce(p_won,false)) r;

  update players set
    exp            = players.exp + v_exp,
    points         = players.points + v_points,
    matches_played = players.matches_played + 1,
    kills          = players.kills + p_kills,
    deaths         = players.deaths + p_deaths,
    wins           = players.wins + case when coalesce(p_won,false) then 1 else 0 end,
    last_seen_at   = now()
  where players.id = v_player
  returning * into v;

  return query select ''::text, v.exp, v.points, v_exp, v_points,
                      v.matches_played, v.kills, v.deaths, v.wins;
end $$;

revoke all on function award_match(text,int,int,boolean) from public, anon;
grant execute on function award_match(text,int,int,boolean) to service_role;

-- The account functions now hand back progress too, so the menu can show a
-- level without a second round trip. Postgres will not let a function change
-- its return type in place, so these are dropped and rebuilt rather than
-- replaced.
drop function if exists player_for_token(text);
drop function if exists login_player(text,text,text);
drop function if exists register_player(text,text,text,text);
create or replace function player_for_token(p_token text)
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text,
               exp bigint, points bigint, matches_played int, kills int, deaths int, wins int)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype;
begin
  select p.* into v from sessions s join players p on p.id = s.player_id
   where s.token = coalesce(p_token,'') and s.expires_at > now();
  if not found then
    return query select 'Not signed in'::text, null::uuid, null::text, null::text, null::timestamptz, null::text,
                        0::bigint, 0::bigint, 0, 0, 0, 0;
    return;
  end if;
  return query select ''::text, v.id, v.name, v.email, v.created_at, p_token,
                      v.exp, v.points, v.matches_played, v.kills, v.deaths, v.wins;
end $$;

create or replace function login_player(p_name text, p_password text, p_agent text default '')
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text,
               exp bigint, points bigint, matches_played int, kills int, deaths int, wins int)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype; v_token text;
begin
  select * into v from players
   where lower(players.name) = lower(btrim(coalesce(p_name,'')))
     and password_hash = crypt(coalesce(p_password,''), password_hash);
  if not found then
    return query select 'Wrong name or password'::text, null::uuid, null::text, null::text, null::timestamptz, null::text,
                        0::bigint, 0::bigint, 0, 0, 0, 0;
    return;
  end if;
  update players set last_seen_at = now() where players.id = v.id;
  v_token := new_session(v.id, p_agent);
  return query select ''::text, v.id, v.name, v.email, v.created_at, v_token,
                      v.exp, v.points, v.matches_played, v.kills, v.deaths, v.wins;
end $$;

create or replace function register_player(p_name text, p_email text, p_password text, p_agent text default '')
returns table (error text, id uuid, name text, email text, created_at timestamptz, token text,
               exp bigint, points bigint, matches_played int, kills int, deaths int, wins int)
language plpgsql security definer set search_path = public, extensions as $$
declare v players%rowtype; v_token text;
begin
  p_name  := btrim(coalesce(p_name, ''));
  p_email := nullif(btrim(coalesce(p_email, '')), '');

  if length(p_name) < 3  then return query select 'Name needs at least 3 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0; return; end if;
  if length(p_name) > 20 then return query select 'Name can be at most 20 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0; return; end if;
  if p_name !~ '^[A-Za-z0-9_]+$' then return query select 'Name can use letters, numbers and underscore only'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0; return; end if;
  if length(coalesce(p_password,'')) < 8 then return query select 'Password needs at least 8 characters'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0; return; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then return query select 'That email does not look right'::text, null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0; return; end if;

  begin
    insert into players (name, email, password_hash)
    values (p_name, p_email, crypt(p_password, gen_salt('bf', 10)))
    returning * into v;
  exception when unique_violation then
    return query select
      case when sqlerrm like '%players_email_key%' then 'That email is already registered'
           else 'That name is already taken' end::text,
      null::uuid, null::text, null::text, null::timestamptz, null::text, 0::bigint, 0::bigint, 0, 0, 0, 0;
    return;
  end;

  v_token := new_session(v.id, p_agent);
  return query select ''::text, v.id, v.name, v.email, v.created_at, v_token,
                      v.exp, v.points, v.matches_played, v.kills, v.deaths, v.wins;
end $$;

revoke all on function register_player(text,text,text,text) from public, anon;
revoke all on function login_player(text,text,text)         from public, anon;
revoke all on function player_for_token(text)               from public, anon;
grant execute on function register_player(text,text,text,text) to service_role;
grant execute on function login_player(text,text,text)         to service_role;
grant execute on function player_for_token(text)               to service_role;
