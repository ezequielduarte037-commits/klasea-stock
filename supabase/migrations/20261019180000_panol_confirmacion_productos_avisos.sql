-- Confirmar fichas antiguas creadas por Pañol y avisar al resolver un pendiente.
create table if not exists public.panol_productos_resueltos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text not null,
  codigo text,
  sedes text[] not null default '{}',
  destinatarios uuid[] not null default '{}',
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists panol_productos_resueltos_fecha on public.panol_productos_resueltos(created_at desc);
alter table public.panol_productos_resueltos enable row level security;
revoke all on public.panol_productos_resueltos from anon, authenticated;
grant select on public.panol_productos_resueltos to authenticated;
grant all on public.panol_productos_resueltos to service_role;
drop policy if exists "avisos productos para su audiencia" on public.panol_productos_resueltos;
create policy "avisos productos para su audiencia" on public.panol_productos_resueltos for select to authenticated
using (auth.uid()=any(destinatarios) and exists (
  select 1 from public.profiles p where p.id=auth.uid() and p.role::text='panol'
  and coalesce(p.activo,true) and not coalesce(p.is_demo,false)
));

-- Un único evento por producto y operación, aunque se resuelvan varios movimientos.
create or replace function public.panol_avisar_producto_resuelto(p_material uuid,p_sedes text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_evento uuid; v_users uuid[]; v_sedes text[]; v_producto record; v_actor uuid:=auth.uid();
begin
  select id,descripcion,codigo into v_producto from public.panol_materiales where id=p_material;
  if not found then return null; end if;
  select coalesce(array_agg(distinct s order by s),'{}') into v_sedes
    from unnest(coalesce(p_sedes,'{}')) s where nullif(btrim(s),'') is not null;
  select coalesce(array_agg(p.id),'{}') into v_users from public.profiles p
    where p.role::text='panol' and coalesce(p.activo,true) and not coalesce(p.is_demo,false)
      and p.id is distinct from v_actor
      and (nullif(btrim(p.sede),'') is null or lower(btrim(p.sede))='ambas'
        or cardinality(v_sedes)=0 or p.sede=any(v_sedes));
  insert into public.panol_productos_resueltos(material_id,descripcion,codigo,sedes,destinatarios,actor_id)
    values(p_material,v_producto.descripcion,v_producto.codigo,v_sedes,v_users,v_actor) returning id into v_evento;
  perform public.notificaciones_push_encolar(v_users,v_actor,'panol','recepcion:producto-'||v_evento,
    jsonb_build_object('title','Producto confirmado','body',left(concat_ws(' · ',v_producto.descripcion,nullif(array_to_string(v_sedes,', '),'')),240),
      'url','/stock-panol?material='||p_material,'tag','recepcion:producto-'||v_evento,
      'clave','recepcion:producto-'||v_evento,'fecha',(select created_at from public.panol_productos_resueltos where id=v_evento)));
  return v_evento;
end;
$$;
revoke all on function public.panol_avisar_producto_resuelto(uuid,text[]) from public,anon,authenticated;

create or replace function public.panol_productos_resueltos_por_vinculo()
returns trigger language plpgsql security definer set search_path=public as $$
declare g record;
begin
  for g in
    select n.material_id,array_agg(distinct coalesce(nullif(n.stock_sede,''),e.sede)) as sedes
    from nuevos n join anteriores o on o.id=n.id
    join public.panol_materiales m on m.id=n.material_id
    left join public.profiles creador on creador.id=m.created_by
    left join public.panol_envios e on e.id=n.panol_envio_id
    where o.material_id is null and o.requisito_material_id is null and n.material_id is not null
      and m.es_requisito is not true and m.activo is not false
      -- Una ficha provisional antigua sigue pendiente hasta la confirmación de Técnica.
      and (m.revisado is true or creador.role::text is distinct from 'panol')
      and nullif(btrim(o.descripcion),'') is not null and coalesce(o.source,'')<>'ajuste_ubicacion'
      and lower(concat_ws(' ',o.notas,o.egreso_nota,o.source,o.recepcion_nota,o.stock_nota)) not like '%[anulado]%'
      and (o.estado='egresado' or o.source like 'egreso%' or o.source like 'transferencia_egreso%'
        or o.source in ('reclasificacion_egreso','conteo_fisico_reversion')
        or (o.estado in ('en_panol','recibido','parcial') and (
          o.recepcion_estado in ('recibido','parcial') or o.source in ('remito','transferencia_ingreso','ajuste_ingreso','reclasificacion_ingreso')
          or left(o.source,6)='stock_' or o.source like 'transferencia_ingreso%')))
    group by n.material_id
  loop
    perform public.panol_avisar_producto_resuelto(g.material_id,g.sedes);
  end loop;
  return null;
end;
$$;
revoke all on function public.panol_productos_resueltos_por_vinculo() from public,anon,authenticated;
drop trigger if exists panol_productos_resueltos_por_vinculo on public.panol_obra_materiales_snapshot;
create trigger panol_productos_resueltos_por_vinculo after update on public.panol_obra_materiales_snapshot
  referencing old table as anteriores new table as nuevos
  for each statement execute function public.panol_productos_resueltos_por_vinculo();

create or replace function public.panol_productos_revision_guardar()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.revisado is true and old.revisado is not true and new.es_consumible is not true and exists(
    select 1 from public.profiles p where p.id=auth.uid() and p.role::text='panol' and not coalesce(p.is_admin,false)
  ) then raise exception 'La confirmación de productos corresponde a Técnica o Compras.' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function public.panol_productos_revision_guardar() from public,anon,authenticated;
drop trigger if exists panol_productos_revision_guardar on public.panol_materiales;
create trigger panol_productos_revision_guardar before update of revisado on public.panol_materiales
for each row execute function public.panol_productos_revision_guardar();

create or replace function public.panol_productos_resueltos_por_revision()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_sedes text[];
begin
  if new.revisado is not true or old.revisado is true or new.es_consumible is true or new.es_requisito is true then return new; end if;
  if not exists(select 1 from public.profiles where id=old.created_by and role::text='panol') then return new; end if;
  select array_agg(distinct coalesce(nullif(s.stock_sede,''),e.sede)) into v_sedes
    from public.panol_obra_materiales_snapshot s left join public.panol_envios e on e.id=s.panol_envio_id
    where s.material_id=new.id;
  perform public.panol_avisar_producto_resuelto(new.id,v_sedes);
  return new;
end;
$$;
revoke all on function public.panol_productos_resueltos_por_revision() from public,anon,authenticated;
drop trigger if exists panol_productos_resueltos_por_revision on public.panol_materiales;
create trigger panol_productos_resueltos_por_revision after update of revisado on public.panol_materiales
for each row execute function public.panol_productos_resueltos_por_revision();

create or replace function public.panol_confirmar_producto_catalogo(p_material_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_material record;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.activo,true)
    and not coalesce(p.is_demo,false) and (coalesce(p.is_admin,false) or p.role::text in ('admin','tecnica','compras'))) then
    raise exception 'Sólo Técnica, Compras o administración pueden confirmar productos.' using errcode='42501';
  end if;
  select * into v_material from public.panol_materiales where id=p_material_id for update;
  if not found or v_material.es_requisito is true or v_material.activo is false then
    raise exception 'No se encontró un producto activo para confirmar.';
  end if;
  if v_material.revisado is true then return false; end if;
  update public.panol_materiales set revisado=true where id=p_material_id;
  return true;
end;
$$;
revoke all on function public.panol_confirmar_producto_catalogo(uuid) from public,anon;
grant execute on function public.panol_confirmar_producto_catalogo(uuid) to authenticated;

do $$begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='panol_productos_resueltos'
  ) then alter publication supabase_realtime add table public.panol_productos_resueltos; end if;
end$$;
notify pgrst,'reload schema';
