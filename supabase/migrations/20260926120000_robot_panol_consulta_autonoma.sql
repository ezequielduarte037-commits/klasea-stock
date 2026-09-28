-- Robot de consulta: credencial independiente, revocable y limitada a una sede.
-- El firmware NO recibe una sesion de usuario ni una clave service-role.
begin;
create table if not exists public.panol_robots (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sede text not null check (sede in ('Pampa','Chubut')),
  token_hash bytea not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.panol_robots enable row level security;
revoke all on public.panol_robots from anon, authenticated;
grant select on public.panol_robots to authenticated;
create policy panol_robot_owner_read on public.panol_robots for select to authenticated
using (created_by = auth.uid());

create or replace function public.panol_robot_vincular(p_sede text, p_nombre text default 'Robot panol')
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_token text; v_uid uuid := auth.uid();
begin
  if p_sede not in ('Pampa','Chubut') or p_sede is null
     or not public.can_receive_envio(p_sede, v_uid) then
    raise exception 'Sin permiso para vincular el robot a esta sede' using errcode='42501';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.panol_robots(nombre,sede,token_hash,created_by)
  values (left(coalesce(nullif(trim(p_nombre),''),'Robot panol'),80),p_sede,
    sha256(convert_to(v_token,'UTF8')),v_uid) returning id into v_id;
  return jsonb_build_object('id',v_id,'token',v_token,'sede',p_sede);
end;
$$;
revoke all on function public.panol_robot_vincular(text,text) from public, anon;
grant execute on function public.panol_robot_vincular(text,text) to authenticated;

create or replace function public.panol_robot_revocar(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.panol_robots set revoked_at=now()
    where id=p_id and created_by=auth.uid();
  if not found then raise exception 'Robot inexistente o sin permiso' using errcode='42501'; end if;
end;
$$;
revoke all on function public.panol_robot_revocar(uuid) from public, anon;
grant execute on function public.panol_robot_revocar(uuid) to authenticated;

create or replace function public.panol_robot_feed(p_id uuid, p_token text, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_sede text; v_total integer; v_urgent integer; v_notices jsonb; v_offset integer;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Robot no autorizado' using errcode='42501';
  end if;
  -- Revalidar tambien el permiso de la cuenta que lo vinculo.
  select r.sede into v_sede from public.panol_robots r
    where r.id=p_id and r.revoked_at is null
      and r.token_hash=sha256(convert_to(p_token,'UTF8'))
      and public.can_receive_envio(r.sede,r.created_by);
  if v_sede is null then raise exception 'Robot no autorizado' using errcode='42501'; end if;
  select count(*)::integer, count(*) filter(where prioridad='urgente')::integer
    into v_total,v_urgent from public.panol_envios
    where sede=v_sede and estado in ('enviado','en_preparacion','parcial');
  v_offset := greatest(0,least(coalesce(p_offset,0),greatest(0,v_total-1)));
  select coalesce(jsonb_agg(n.payload order by n.is_urgent desc,n.created_at desc,n.id), '[]'::jsonb)
    into v_notices from (
      select e.id,e.created_at,(e.prioridad='urgente') as is_urgent,
        jsonb_build_object('id',e.id,'title',left(e.titulo,120),'sede',e.sede,
          'urgent',e.prioridad='urgente','items',coalesce(i.pending,0),
          'obra',left(coalesce(nullif(i.obras,''),o.codigo,e.destino,'Sin obra indicada'),100),
          'detail',left(coalesce(i.detail,''),180)) as payload
      from public.panol_envios e
      left join public.produccion_obras o on o.id=e.obra_id
      left join lateral (
        select count(*)::integer as pending,
          string_agg(distinct io.codigo,' / ' order by io.codigo) as obras,
          string_agg(ei.descripcion,' / ' order by ei.id) as detail
        from public.panol_envio_items ei
        left join public.panol_obra_materiales_snapshot s on s.id=ei.obra_snapshot_item_id
        left join public.produccion_obras io on io.id=s.obra_id
        where ei.envio_id=e.id and ei.estado <> 'recibido'
      ) i on true
      where e.sede=v_sede and e.estado in ('enviado','en_preparacion','parcial')
      order by (e.prioridad='urgente') desc,e.created_at desc,e.id
      limit 20 offset v_offset
    ) n;
  return jsonb_build_object('type','feed','status','ok','sede',v_sede,'total',v_total,
    'urgent',v_urgent,'notices',v_notices,'offset',v_offset,'updated',now());
end;
$$;
-- El token aleatorio de dispositivo autoriza SOLO esta funcion de consulta.
revoke all on function public.panol_robot_feed(uuid,text,integer) from public;
grant execute on function public.panol_robot_feed(uuid,text,integer) to anon, authenticated;
commit;
