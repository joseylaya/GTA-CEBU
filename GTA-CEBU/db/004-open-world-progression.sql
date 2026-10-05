-- Persistent open-world progression.
-- Apply after 001, 002 and 003 for the local-first account economy.

alter table players add column if not exists money          bigint  not null default 150;
alter table players add column if not exists street_rep     integer not null default 0;
alter table players add column if not exists engine_level   integer not null default 0;
alter table players add column if not exists completed_jobs integer not null default 0;

-- The server calls this only after it has issued and validated an in-memory
-- job ticket. Rewards are selected here rather than accepted from the browser.
create or replace function award_open_world_job(p_token text, p_kind text)
returns table (error text, money bigint, exp bigint, street_rep int,
               engine_level int, completed_jobs int,
               gained_money bigint, gained_exp bigint, gained_rep int)
language plpgsql security definer set search_path = public, extensions as $$
declare v_player uuid; v_money bigint; v_exp bigint; v_rep int; v players%rowtype;
begin
  select s.player_id into v_player from sessions s
   where s.token=coalesce(p_token,'') and s.expires_at>now();
  if v_player is null then
    return query select 'Not signed in'::text,0::bigint,0::bigint,0,0,0,0::bigint,0::bigint,0;
    return;
  end if;

  select case p_kind when 'courier' then 300 when 'taxi' then 450 when 'race' then 700 else 0 end,
         case p_kind when 'courier' then 40  when 'taxi' then 60  when 'race' then 90  else 0 end,
         case p_kind when 'race' then 3 when 'courier' then 1 when 'taxi' then 1 else 0 end
    into v_money,v_exp,v_rep;
  if v_money=0 then
    return query select 'Unknown job'::text,0::bigint,0::bigint,0,0,0,0::bigint,0::bigint,0;
    return;
  end if;

  update players set money=players.money+v_money, exp=players.exp+v_exp,
    street_rep=players.street_rep+v_rep, completed_jobs=players.completed_jobs+1,
    last_seen_at=now()
   where id=v_player returning * into v;
  return query select ''::text,v.money,v.exp,v.street_rep,v.engine_level,v.completed_jobs,
    v_money,v_exp,v_rep;
end $$;

create or replace function buy_engine_upgrade(p_token text)
returns table (error text, money bigint, exp bigint, street_rep int,
               engine_level int, completed_jobs int, price bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare v_player uuid; v players%rowtype; v_price bigint;
begin
  select p.* into v from sessions s join players p on p.id=s.player_id
   where s.token=coalesce(p_token,'') and s.expires_at>now() for update of p;
  if not found then
    return query select 'Not signed in'::text,0::bigint,0::bigint,0,0,0,0::bigint; return;
  end if;
  if v.engine_level>=3 then
    return query select 'Engine is already maxed'::text,v.money,v.exp,v.street_rep,v.engine_level,v.completed_jobs,0::bigint; return;
  end if;
  v_price:=250+v.engine_level*200;
  if v.money<v_price then
    return query select ('Engine upgrade costs ₱'||v_price)::text,v.money,v.exp,v.street_rep,v.engine_level,v.completed_jobs,v_price; return;
  end if;
  update players set money=players.money-v_price,engine_level=players.engine_level+1,last_seen_at=now()
   where id=v.id returning * into v;
  return query select ''::text,v.money,v.exp,v.street_rep,v.engine_level,v.completed_jobs,v_price;
end $$;

revoke all on function award_open_world_job(text,text) from public, anon;
revoke all on function buy_engine_upgrade(text) from public, anon;
grant execute on function award_open_world_job(text,text) to service_role;
grant execute on function buy_engine_upgrade(text) to service_role;

-- Extend the three account reads so the client receives its world economy on
-- registration, login and token restoration. Drop first because PostgreSQL
-- cannot replace a function while changing its return columns.
drop function if exists player_for_token(text);
drop function if exists login_player(text,text,text);
drop function if exists register_player(text,text,text,text);

create or replace function player_for_token(p_token text)
returns table (error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype;
begin
 select p.* into v from sessions s join players p on p.id=s.player_id where s.token=coalesce(p_token,'') and s.expires_at>now();
 if not found then return query select 'Not signed in'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 return query select ''::text,v.id,v.name,v.email,v.created_at,p_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs;
end $$;

create or replace function login_player(p_name text,p_password text,p_agent text default '')
returns table (error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype; v_token text;
begin
 select * into v from players where lower(players.name)=lower(btrim(coalesce(p_name,''))) and password_hash=crypt(coalesce(p_password,''),password_hash);
 if not found then return query select 'Wrong name or password'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 update players set last_seen_at=now() where players.id=v.id; v_token:=new_session(v.id,p_agent);
 return query select ''::text,v.id,v.name,v.email,v.created_at,v_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs;
end $$;

create or replace function register_player(p_name text,p_email text,p_password text,p_agent text default '')
returns table (error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype; v_token text;
begin
 p_name:=btrim(coalesce(p_name,''));p_email:=nullif(btrim(coalesce(p_email,'')),'');
 if length(p_name)<3 then return query select 'Name needs at least 3 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 if length(p_name)>20 then return query select 'Name can be at most 20 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 if p_name!~'^[A-Za-z0-9_]+$' then return query select 'Name can use letters, numbers and underscore only'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 if length(coalesce(p_password,''))<8 then return query select 'Password needs at least 8 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 if p_email is not null and p_email!~'^[^@\s]+@[^@\s.]+\.[^@\s]+$' then return query select 'That email does not look right'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end if;
 begin insert into players(name,email,password_hash) values(p_name,p_email,crypt(p_password,gen_salt('bf',10))) returning * into v;
 exception when unique_violation then return query select (case when sqlerrm like '%players_email_key%' then 'That email is already registered' else 'That name is already taken' end)::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0; return; end;
 v_token:=new_session(v.id,p_agent);
 return query select ''::text,v.id,v.name,v.email,v.created_at,v_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs;
end $$;

revoke all on function register_player(text,text,text,text) from public,anon;
revoke all on function login_player(text,text,text) from public,anon;
revoke all on function player_for_token(text) from public,anon;
grant execute on function register_player(text,text,text,text) to service_role;
grant execute on function login_player(text,text,text) to service_role;
grant execute on function player_for_token(text) to service_role;
