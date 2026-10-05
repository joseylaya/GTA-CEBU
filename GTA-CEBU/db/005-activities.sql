-- Persistent statistics for reusable open-world activities.
alter table players add column if not exists completed_activities integer not null default 0;
alter table players add column if not exists activity_wins integer not null default 0;
alter table players add column if not exists best_skyline_sprint_ms integer;

create or replace function award_activity(p_token text,p_activity text,p_elapsed_ms integer)
returns table(error text,exp bigint,gained_exp bigint,completed_activities int,
              activity_wins int,best_time_ms int)
language plpgsql security definer set search_path=public,extensions as $$
declare v_player uuid; v_exp bigint; v players%rowtype;
begin
  select s.player_id into v_player from sessions s
   where s.token=coalesce(p_token,'') and s.expires_at>now();
  if v_player is null then
    return query select 'Not signed in'::text,0::bigint,0::bigint,0,0,0; return;
  end if;
  if p_activity<>'skyline-sprint' or p_elapsed_ms<5000 or p_elapsed_ms>90000 then
    return query select 'Invalid activity result'::text,0::bigint,0::bigint,0,0,0; return;
  end if;
  v_exp:=75;
  update players set exp=players.exp+v_exp,
    completed_activities=players.completed_activities+1,
    activity_wins=players.activity_wins+1,
    best_skyline_sprint_ms=case when players.best_skyline_sprint_ms is null
      then p_elapsed_ms else least(players.best_skyline_sprint_ms,p_elapsed_ms) end,
    last_seen_at=now()
   where id=v_player returning * into v;
  return query select ''::text,v.exp,v_exp,v.completed_activities,v.activity_wins,v.best_skyline_sprint_ms;
end $$;

revoke all on function award_activity(text,text,integer) from public,anon;
grant execute on function award_activity(text,text,integer) to service_role;

-- Account reads include the new statistics so they survive a fresh login.
drop function if exists player_for_token(text);
drop function if exists login_player(text,text,text);
drop function if exists register_player(text,text,text,text);

create or replace function player_for_token(p_token text)
returns table(error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int,
 completed_activities int,activity_wins int,best_skyline_sprint_ms int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype;
begin
 select p.* into v from sessions s join players p on p.id=s.player_id where s.token=coalesce(p_token,'') and s.expires_at>now();
 if not found then return query select 'Not signed in'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 return query select ''::text,v.id,v.name,v.email,v.created_at,p_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs,v.completed_activities,v.activity_wins,v.best_skyline_sprint_ms;
end $$;

create or replace function login_player(p_name text,p_password text,p_agent text default '')
returns table(error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int,
 completed_activities int,activity_wins int,best_skyline_sprint_ms int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype; v_token text;
begin
 select * into v from players where lower(players.name)=lower(btrim(coalesce(p_name,''))) and password_hash=crypt(coalesce(p_password,''),password_hash);
 if not found then return query select 'Wrong name or password'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 update players set last_seen_at=now() where players.id=v.id; v_token:=new_session(v.id,p_agent);
 return query select ''::text,v.id,v.name,v.email,v.created_at,v_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs,v.completed_activities,v.activity_wins,v.best_skyline_sprint_ms;
end $$;

create or replace function register_player(p_name text,p_email text,p_password text,p_agent text default '')
returns table(error text,id uuid,name text,email text,created_at timestamptz,token text,
 exp bigint,points bigint,matches_played int,kills int,deaths int,wins int,
 money bigint,street_rep int,engine_level int,completed_jobs int,
 completed_activities int,activity_wins int,best_skyline_sprint_ms int)
language plpgsql security definer set search_path=public,extensions as $$
declare v players%rowtype; v_token text;
begin
 p_name:=btrim(coalesce(p_name,''));p_email:=nullif(btrim(coalesce(p_email,'')),'');
 if length(p_name)<3 then return query select 'Name needs at least 3 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 if length(p_name)>20 then return query select 'Name can be at most 20 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 if p_name!~'^[A-Za-z0-9_]+$' then return query select 'Name can use letters, numbers and underscore only'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 if length(coalesce(p_password,''))<8 then return query select 'Password needs at least 8 characters'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 if p_email is not null and p_email!~'^[^@\s]+@[^@\s.]+\.[^@\s]+$' then return query select 'That email does not look right'::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end if;
 begin insert into players(name,email,password_hash) values(p_name,p_email,crypt(p_password,gen_salt('bf',10))) returning * into v;
 exception when unique_violation then return query select (case when sqlerrm like '%players_email_key%' then 'That email is already registered' else 'That name is already taken' end)::text,null::uuid,null::text,null::text,null::timestamptz,null::text,0::bigint,0::bigint,0,0,0,0,0::bigint,0,0,0,0,0,0; return; end;
 v_token:=new_session(v.id,p_agent);
 return query select ''::text,v.id,v.name,v.email,v.created_at,v_token,v.exp,v.points,v.matches_played,v.kills,v.deaths,v.wins,v.money,v.street_rep,v.engine_level,v.completed_jobs,v.completed_activities,v.activity_wins,v.best_skyline_sprint_ms;
end $$;

revoke all on function register_player(text,text,text,text) from public,anon;
revoke all on function login_player(text,text,text) from public,anon;
revoke all on function player_for_token(text) from public,anon;
grant execute on function register_player(text,text,text,text) to service_role;
grant execute on function login_player(text,text,text) to service_role;
grant execute on function player_for_token(text) to service_role;
