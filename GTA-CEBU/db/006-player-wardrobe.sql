-- Account-owned cosmetic inventory and equipped avatar. The starter catalogue
-- is granted to every existing and future player; later store purchases only
-- need to append an item id to owned_cosmetics.
alter table players add column if not exists character text not null default 'Atlas';
alter table players add column if not exists appearance jsonb not null default '{"skin":0,"hair":0,"shirt":0,"pants":0,"top":0,"haircut":0}'::jsonb;
alter table players add column if not exists owned_cosmetics text[] not null default array[
  'character:Atlas','character:Nova','skin:0','skin:1','skin:2','skin:3',
  'hair:0','hair:1','hair:2','hair:3','shirt:0','shirt:1','shirt:2','shirt:3','shirt:4',
  'pants:0','pants:1','pants:2','pants:3','top:0','top:1','top:2','haircut:0','haircut:1','haircut:2'
];

create or replace function player_wardrobe(p_token text)
returns table(error text,character text,appearance jsonb,owned_cosmetics text[])
language plpgsql security definer set search_path=public as $$
declare v players%rowtype;
begin
 select p.* into v from sessions s join players p on p.id=s.player_id
  where s.token=coalesce(p_token,'') and s.expires_at>now();
 if not found then return query select 'Not signed in'::text,null::text,null::jsonb,null::text[];return;end if;
 return query select ''::text,v.character,v.appearance,v.owned_cosmetics;
end $$;

create or replace function save_player_wardrobe(p_token text,p_character text,p_appearance jsonb)
returns table(error text,character text,appearance jsonb,owned_cosmetics text[])
language plpgsql security definer set search_path=public as $$
declare v players%rowtype; v_owned text[]; v_character text; v_appearance jsonb; v_slot text;
begin
 select p.* into v from sessions s join players p on p.id=s.player_id
  where s.token=coalesce(p_token,'') and s.expires_at>now();
 if not found then return query select 'Not signed in'::text,null::text,null::jsonb,null::text[];return;end if;
 v_owned:=v.owned_cosmetics;
 v_character:=case when p_character in ('Atlas','Nova') and ('character:'||p_character)=any(v_owned) then p_character else v.character end;
 v_appearance:=v.appearance;
 foreach v_slot in array array['skin','hair','shirt','pants','top','haircut'] loop
   if (v_slot||':'||coalesce(p_appearance->>v_slot,'0'))=any(v_owned) then
     v_appearance:=jsonb_set(v_appearance,array[v_slot],to_jsonb((p_appearance->>v_slot)::integer));
   end if;
 end loop;
 update players set character=v_character,appearance=v_appearance,last_seen_at=now() where id=v.id;
 return query select ''::text,v_character,v_appearance,v_owned;
end $$;

revoke all on function player_wardrobe(text) from public,anon;
revoke all on function save_player_wardrobe(text,text,jsonb) from public,anon;
grant execute on function player_wardrobe(text) to service_role;
grant execute on function save_player_wardrobe(text,text,jsonb) to service_role;
