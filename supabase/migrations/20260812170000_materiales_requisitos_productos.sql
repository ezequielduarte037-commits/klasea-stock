-- Reemplaza las variantes comerciales por dos identidades explícitas:
--   1. requisito de matriz: qué necesita la línea/obra (ej. TV 32")
--   2. producto de catálogo: qué se compra y mueve físicamente (ej. Samsung...)
--
-- Compatibilidad: `panol_material_modelo.material_id` sigue apuntando al
-- requisito y `panol_obra_materiales_snapshot.material_id` pasa a ser el SKU
-- concreto cuando está resuelto. El requisito original queda preservado en
-- `requisito_material_id`, por lo que el historial no pierde trazabilidad.

-- Respaldo quirúrgico previo: sólo las filas que esta migración puede tocar.
-- Se conserva en la misma base para poder reconstruir nombres, asignaciones y
-- códigos legacy sin depender del historial local de migraciones.
alter table public.panol_material_codigos_barra
  add column if not exists variante text;

create table if not exists public.panol_materiales_variantes_backup_20260812 as
select *
  from public.panol_materiales
 where jsonb_typeof(coalesce(variantes, '[]'::jsonb)) = 'array'
   and jsonb_array_length(coalesce(variantes, '[]'::jsonb)) > 0;

create table if not exists public.panol_snapshot_variantes_backup_20260812 as
select *
  from public.panol_obra_materiales_snapshot
 where nullif(btrim(coalesce(variante, '')), '') is not null;

create table if not exists public.purchase_request_items_variantes_backup_20260812 as
select pri.*
  from public.purchase_request_items pri
 where pri.id in (
   select s.purchase_request_item_id
     from public.panol_obra_materiales_snapshot s
    where s.purchase_request_item_id is not null
      and nullif(btrim(coalesce(s.variante, '')), '') is not null
 );

create table if not exists public.panol_envio_items_variantes_backup_20260812 as
select pei.*
  from public.panol_envio_items pei
 where pei.obra_snapshot_item_id in (
   select s.id
     from public.panol_obra_materiales_snapshot s
    where nullif(btrim(coalesce(s.variante, '')), '') is not null
 );

create table if not exists public.panol_codigos_variantes_backup_20260812 as
select *
  from public.panol_material_codigos_barra
 where nullif(btrim(coalesce(variante, '')), '') is not null;

alter table public.panol_materiales_variantes_backup_20260812 enable row level security;
alter table public.panol_snapshot_variantes_backup_20260812 enable row level security;
alter table public.purchase_request_items_variantes_backup_20260812 enable row level security;
alter table public.panol_envio_items_variantes_backup_20260812 enable row level security;
alter table public.panol_codigos_variantes_backup_20260812 enable row level security;

revoke all on public.panol_materiales_variantes_backup_20260812 from anon, authenticated;
revoke all on public.panol_snapshot_variantes_backup_20260812 from anon, authenticated;
revoke all on public.purchase_request_items_variantes_backup_20260812 from anon, authenticated;
revoke all on public.panol_envio_items_variantes_backup_20260812 from anon, authenticated;
revoke all on public.panol_codigos_variantes_backup_20260812 from anon, authenticated;

alter table public.panol_materiales
  add column if not exists es_requisito boolean not null default false,
  add column if not exists variantes_precios jsonb not null default '{}'::jsonb;

comment on column public.panol_materiales.es_requisito is
  'True cuando la fila representa una necesidad genérica de una matriz y no un SKU físico de stock.';

create table if not exists public.panol_requisito_productos (
  id uuid primary key default gen_random_uuid(),
  requisito_material_id uuid not null references public.panol_materiales(id) on delete cascade,
  producto_material_id uuid not null references public.panol_materiales(id) on delete cascade,
  variante_legacy text,
  origen text not null default 'manual',
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_requisito_producto_distintos_chk
    check (requisito_material_id <> producto_material_id),
  constraint panol_requisito_productos_origen_chk
    check (origen in ('manual','migracion_variante','asignacion_obra','compras','panol')),
  unique (requisito_material_id, producto_material_id)
);

create index if not exists idx_panol_requisito_productos_requisito
  on public.panol_requisito_productos(requisito_material_id)
  where activo;

create index if not exists idx_panol_requisito_productos_producto
  on public.panol_requisito_productos(producto_material_id)
  where activo;

drop trigger if exists trg_panol_requisito_productos_updated on public.panol_requisito_productos;
create trigger trg_panol_requisito_productos_updated
before update on public.panol_requisito_productos
for each row execute function public.touch_updated_at();

alter table public.panol_requisito_productos enable row level security;

drop policy if exists "requisito productos select authenticated" on public.panol_requisito_productos;
create policy "requisito productos select authenticated"
  on public.panol_requisito_productos for select
  to authenticated using (true);

drop policy if exists "requisito productos insert authenticated" on public.panol_requisito_productos;
create policy "requisito productos insert authenticated"
  on public.panol_requisito_productos for insert
  to authenticated with check (auth.uid() is not null);

drop policy if exists "requisito productos update authenticated" on public.panol_requisito_productos;
create policy "requisito productos update authenticated"
  on public.panol_requisito_productos for update
  to authenticated using (true) with check (true);

drop policy if exists "requisito productos delete authenticated" on public.panol_requisito_productos;
create policy "requisito productos delete authenticated"
  on public.panol_requisito_productos for delete
  to authenticated using (public.is_panol_manager(auth.uid()));

grant select, insert, update, delete on public.panol_requisito_productos to authenticated;

alter table public.panol_obra_materiales_snapshot
  add column if not exists requisito_material_id uuid references public.panol_materiales(id) on delete set null,
  add column if not exists producto_asignado_at timestamptz,
  add column if not exists producto_asignado_por uuid references public.profiles(id) on delete set null,
  add column if not exists producto_asignacion_origen text;

create index if not exists idx_panol_snapshot_requisito
  on public.panol_obra_materiales_snapshot(requisito_material_id)
  where requisito_material_id is not null;

alter table public.purchase_request_items
  add column if not exists requisito_material_id uuid references public.panol_materiales(id) on delete set null;

create index if not exists idx_purchase_request_items_requisito
  on public.purchase_request_items(requisito_material_id)
  where requisito_material_id is not null;

alter table public.panol_envio_items
  add column if not exists requisito_material_id uuid references public.panol_materiales(id) on delete set null;

-- Todo snapshot existente conserva como requisito el material con el que nació.
update public.panol_obra_materiales_snapshot
   set requisito_material_id = material_id
 where requisito_material_id is null
   and material_id is not null;

-- Convierte cada variante legacy en un producto real. Cuando el código o la
-- descripción ya existen, reutiliza esa fila en vez de duplicarla.
do $$
declare
  v_req record;
  v_variante text;
  v_meta jsonb;
  v_producto uuid;
  v_descripcion text;
  v_codigo text;
  v_precio numeric;
  v_moneda text;
  v_imagen text;
  v_proveedor_id uuid;
  v_proveedor text;
begin
  for v_req in
    select m.*
      from public.panol_materiales m
     where m.activo is distinct from false
       and jsonb_typeof(coalesce(m.variantes, '[]'::jsonb)) = 'array'
       and jsonb_array_length(coalesce(m.variantes, '[]'::jsonb)) > 0
  loop
    update public.panol_materiales
       set es_requisito = true
     where id = v_req.id;

    for v_variante in
      select nullif(btrim(value), '')
        from jsonb_array_elements_text(coalesce(v_req.variantes, '[]'::jsonb))
    loop
      continue when v_variante is null;
      v_meta := coalesce(v_req.variantes_precios -> v_variante, '{}'::jsonb);
      v_codigo := nullif(upper(btrim(coalesce(v_meta ->> 'codigo', ''))), '');
      v_descripcion := case
        when lower(v_req.descripcion) like '%' || lower(v_variante) || '%'
          then v_req.descripcion
        else concat(v_req.descripcion, ' · ', v_variante)
      end;
      v_precio := case
        when replace(coalesce(v_meta ->> 'precio', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
          then replace(v_meta ->> 'precio', ',', '.')::numeric
        else v_req.precio_unitario
      end;
      v_moneda := case
        when upper(coalesce(v_meta ->> 'moneda', v_req.moneda, 'ARS')) = 'USD' then 'USD'
        else 'ARS'
      end;
      v_imagen := nullif(btrim(coalesce(v_meta ->> 'imagen_url', '')), '');
      v_proveedor_id := case
        when coalesce(v_meta ->> 'proveedor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (v_meta ->> 'proveedor_id')::uuid
        else v_req.proveedor_id
      end;
      v_proveedor := coalesce(nullif(btrim(v_meta ->> 'proveedor'), ''), v_req.proveedor);
      v_producto := null;

      if v_codigo is not null then
        select id into v_producto
          from public.panol_materiales
         where id <> v_req.id
           and activo is distinct from false
           and upper(btrim(coalesce(codigo, ''))) = v_codigo
         order by created_at
         limit 1;
      end if;

      if v_producto is null then
        select id into v_producto
          from public.panol_materiales
         where id <> v_req.id
           and activo is distinct from false
           and lower(btrim(descripcion)) = lower(btrim(v_descripcion))
         order by created_at
         limit 1;
      end if;

      if v_producto is null then
        insert into public.panol_materiales (
          categoria_id, proveedor_id, codigo, descripcion, alias, proveedor,
          unidad_medida, precio_unitario, moneda, imagen_url, links, revisado,
          origen, notas, activo, es_consumible, codigo_barra, ubicacion,
          ubicacion_obs, variantes, variantes_precios, es_requisito
        ) values (
          v_req.categoria_id,
          v_proveedor_id,
          v_codigo,
          v_descripcion,
          v_variante,
          v_proveedor,
          v_req.unidad_medida,
          v_precio,
          v_moneda,
          coalesce(v_imagen, v_req.imagen_url),
          coalesce(v_req.links, '[]'::jsonb),
          false,
          'migracion_variante',
          concat_ws(' · ', nullif(v_req.notas, ''), 'Creado desde variante legacy de ' || v_req.descripcion),
          true,
          coalesce(v_req.es_consumible, false),
          null,
          v_req.ubicacion,
          v_req.ubicacion_obs,
          '[]'::jsonb,
          '{}'::jsonb,
          false
        ) returning id into v_producto;
      end if;

      insert into public.panol_requisito_productos (
        requisito_material_id, producto_material_id, variante_legacy, origen
      ) values (
        v_req.id, v_producto, v_variante, 'migracion_variante'
      )
      on conflict (requisito_material_id, producto_material_id)
      do update set
        variante_legacy = coalesce(public.panol_requisito_productos.variante_legacy, excluded.variante_legacy),
        activo = true,
        updated_at = now();

      -- Se actualiza dentro del bucle para cubrir dos nombres legacy que
      -- compartan el mismo código y, por lo tanto, reutilicen el mismo SKU.
      update public.panol_obra_materiales_snapshot
         set requisito_material_id = v_req.id,
             material_id = v_producto,
             producto_asignado_at = coalesce(producto_asignado_at, updated_at, now()),
             producto_asignacion_origen = 'migracion_variante',
             updated_at = now()
       where coalesce(requisito_material_id, material_id) = v_req.id
         and lower(btrim(coalesce(variante, ''))) = lower(btrim(v_variante));

      update public.panol_material_codigos_barra
         set material_id = v_producto,
             variante = null,
             updated_at = now()
       where material_id = v_req.id
         and lower(btrim(coalesce(variante, ''))) = lower(btrim(v_variante));
    end loop;
  end loop;
end $$;

-- Las elecciones de variante que ya tenía cada obra se traducen a SKU.
update public.panol_obra_materiales_snapshot s
   set material_id = rp.producto_material_id,
       producto_asignado_at = coalesce(s.producto_asignado_at, s.updated_at, now()),
       producto_asignacion_origen = 'migracion_variante',
       updated_at = now()
  from public.panol_requisito_productos rp
 where s.requisito_material_id = rp.requisito_material_id
   and rp.activo
   and nullif(btrim(coalesce(s.variante, '')), '') is not null
   and lower(btrim(rp.variante_legacy)) = lower(btrim(s.variante));

-- Propaga la identidad concreta a compras, recepción y códigos de barra.
update public.purchase_request_items pri
   set material_id = s.material_id,
       requisito_material_id = s.requisito_material_id,
       catalog_source = 'panol'
  from public.panol_obra_materiales_snapshot s
 where s.purchase_request_item_id = pri.id
   and s.material_id is not null;

update public.panol_envio_items pei
   set material_id = s.material_id,
       requisito_material_id = s.requisito_material_id
  from public.panol_obra_materiales_snapshot s
 where pei.obra_snapshot_item_id = s.id
   and s.material_id is not null;

update public.panol_material_codigos_barra cb
   set material_id = rp.producto_material_id,
       variante = null,
       updated_at = now()
  from public.panol_requisito_productos rp
 where cb.material_id = rp.requisito_material_id
   and nullif(btrim(coalesce(cb.variante, '')), '') is not null
   and lower(btrim(cb.variante)) = lower(btrim(rp.variante_legacy));

-- Los snapshots nuevos siempre conservan el requisito original. Para stock
-- directo requisito=producto, lo cual es correcto y no exige un caso especial.
create or replace function public.panol_snapshot_set_requisito_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.requisito_material_id is null and new.material_id is not null then
    new.requisito_material_id := new.material_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_snapshot_set_requisito_default on public.panol_obra_materiales_snapshot;
create trigger trg_panol_snapshot_set_requisito_default
before insert on public.panol_obra_materiales_snapshot
for each row execute function public.panol_snapshot_set_requisito_default();

create or replace function public.panol_envio_item_set_material_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.obra_snapshot_item_id is not null then
    select
      coalesce(new.material_id, s.material_id),
      coalesce(new.requisito_material_id, s.requisito_material_id, s.material_id)
      into new.material_id, new.requisito_material_id
      from public.panol_obra_materiales_snapshot s
     where s.id = new.obra_snapshot_item_id
     limit 1;
  end if;
  return new;
end;
$$;

-- Asignación atómica: mantiene sincronizados snapshot, pedido y aviso a pañol.
create or replace function public.panol_asignar_producto_snapshot(
  p_snapshot_id uuid,
  p_producto_material_id uuid default null,
  p_origen text default 'asignacion_obra'
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
  v_requisito uuid;
  v_producto uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para asignar productos de obra';
  end if;

  select * into v_row
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id
   for update;
  if not found then raise exception 'Item de obra no encontrado'; end if;

  v_requisito := coalesce(v_row.requisito_material_id, v_row.material_id);
  v_producto := coalesce(p_producto_material_id, v_requisito);

  -- Una recepción o un egreso ya forman parte del kardex. A partir de ese
  -- punto no se reescribe la identidad histórica del producto.
  if (
    v_row.panol_envio_item_id is not null
    or v_row.estado in ('en_panol','parcial','recibido','egresado')
    or v_row.recepcion_estado in ('recibido','parcial')
  )
    and v_row.material_id is distinct from v_requisito
    and v_producto is distinct from v_row.material_id
  then
    raise exception 'El producto ya tiene movimientos de Pañol y no puede reemplazarse';
  end if;

  if p_producto_material_id is not null then
    if not exists (
      select 1 from public.panol_materiales
       where id = p_producto_material_id
         and activo is distinct from false
         and es_requisito is distinct from true
    ) then
      raise exception 'El producto elegido no existe, está inactivo o es otro requisito';
    end if;

    insert into public.panol_requisito_productos (
      requisito_material_id, producto_material_id, origen, created_by
    ) values (
      v_requisito, p_producto_material_id,
      case when p_origen in ('manual','migracion_variante','asignacion_obra','compras','panol') then p_origen else 'asignacion_obra' end,
      v_uid
    )
    on conflict (requisito_material_id, producto_material_id)
    do update set activo = true, updated_at = now();
  end if;

  perform set_config('app.audit_origin', coalesce(nullif(p_origen, ''), 'asignacion_obra'), true);
  perform set_config('app.audit_note', case when p_producto_material_id is null then 'Producto concreto limpiado' else 'Producto concreto asignado' end, true);

  update public.panol_obra_materiales_snapshot
     set requisito_material_id = v_requisito,
         material_id = v_producto,
         variante = null,
         producto_asignado_at = case when p_producto_material_id is null then null else now() end,
         producto_asignado_por = case when p_producto_material_id is null then null else v_uid end,
         producto_asignacion_origen = case when p_producto_material_id is null then null else coalesce(nullif(p_origen, ''), 'asignacion_obra') end,
         updated_at = now()
   where id = p_snapshot_id
   returning * into v_row;

  if v_row.purchase_request_item_id is not null then
    update public.purchase_request_items
       set material_id = v_producto,
           requisito_material_id = v_requisito,
           catalog_source = 'panol',
           updated_at = now()
     where id = v_row.purchase_request_item_id;
  end if;

  update public.panol_envio_items
     set material_id = v_producto,
         requisito_material_id = v_requisito,
         updated_at = now()
   where id = v_row.panol_envio_item_id
      or obra_snapshot_item_id = p_snapshot_id;

  return v_row;
end;
$$;

grant execute on function public.panol_asignar_producto_snapshot(uuid,uuid,text) to authenticated;

create or replace view public.panol_requisitos_migracion_estado
with (security_invoker = true)
as
select
  r.id as requisito_material_id,
  r.descripcion as requisito,
  count(distinct rp.producto_material_id) filter (where rp.activo) as productos_compatibles,
  count(distinct s.id) as obras_total,
  count(distinct s.id) filter (
    where s.material_id is not null
      and s.material_id is distinct from s.requisito_material_id
  ) as obras_resueltas,
  count(distinct s.id) filter (
    where s.material_id is null
       or s.material_id = s.requisito_material_id
  ) as obras_pendientes
from public.panol_materiales r
left join public.panol_requisito_productos rp on rp.requisito_material_id = r.id
left join public.panol_obra_materiales_snapshot s on s.requisito_material_id = r.id
where r.es_requisito
group by r.id, r.descripcion;

grant select on public.panol_requisitos_migracion_estado to authenticated;
