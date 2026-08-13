-- Completa el modelo requisito -> producto concreto:
--   * la matriz de cada linea puede recomendar un SKU y especificaciones;
--   * cada obra puede heredar o sobrescribir esa eleccion;
--   * Compras y Panol reciben la identidad y el detalle tecnico exactos.

alter table public.panol_material_modelo
  add column if not exists producto_predeterminado_id uuid references public.panol_materiales(id) on delete set null,
  add column if not exists especificaciones_defecto jsonb not null default '{}'::jsonb;

alter table public.panol_obra_materiales_snapshot
  add column if not exists especificaciones jsonb not null default '{}'::jsonb,
  add column if not exists especificaciones_origen text;

alter table public.purchase_request_items
  add column if not exists especificaciones jsonb not null default '{}'::jsonb;

alter table public.panol_envio_items
  add column if not exists especificaciones jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'panol_material_modelo_especificaciones_objeto_chk'
       and conrelid = 'public.panol_material_modelo'::regclass
  ) then
    alter table public.panol_material_modelo
      add constraint panol_material_modelo_especificaciones_objeto_chk
      check (jsonb_typeof(especificaciones_defecto) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'panol_snapshot_especificaciones_objeto_chk'
       and conrelid = 'public.panol_obra_materiales_snapshot'::regclass
  ) then
    alter table public.panol_obra_materiales_snapshot
      add constraint panol_snapshot_especificaciones_objeto_chk
      check (jsonb_typeof(especificaciones) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'purchase_request_items_especificaciones_objeto_chk'
       and conrelid = 'public.purchase_request_items'::regclass
  ) then
    alter table public.purchase_request_items
      add constraint purchase_request_items_especificaciones_objeto_chk
      check (jsonb_typeof(especificaciones) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'panol_envio_items_especificaciones_objeto_chk'
       and conrelid = 'public.panol_envio_items'::regclass
  ) then
    alter table public.panol_envio_items
      add constraint panol_envio_items_especificaciones_objeto_chk
      check (jsonb_typeof(especificaciones) = 'object');
  end if;
end $$;

create index if not exists idx_panol_material_modelo_producto_default
  on public.panol_material_modelo(producto_predeterminado_id)
  where producto_predeterminado_id is not null;

comment on column public.panol_material_modelo.producto_predeterminado_id is
  'SKU recomendado para este requisito en esta linea. Las obras pueden sobrescribirlo.';
comment on column public.panol_material_modelo.especificaciones_defecto is
  'Color, terminacion, medida y otros datos tecnicos heredados por las obras.';
comment on column public.panol_obra_materiales_snapshot.especificaciones is
  'Detalle tecnico fijado para esta obra, independiente del SKU fisico.';

-- Las obras que ya existian quedan congeladas con su eleccion actual. De este
-- modo, cambiar el estandar de linea sin marcar "obras existentes" no las
-- modifica visualmente ni al generar un pedido.
update public.panol_obra_materiales_snapshot
   set producto_asignacion_origen = 'legacy_sin_configurar'
 where producto_asignacion_origen is null
   and lower(coalesce(source, 'matriz')) = 'matriz'
   and coalesce(es_adicional, false) = false;

update public.panol_obra_materiales_snapshot
   set especificaciones_origen = 'legacy_sin_configurar'
 where especificaciones_origen is null
   and lower(coalesce(source, 'matriz')) = 'matriz'
   and coalesce(es_adicional, false) = false;

create or replace function public.panol_modelo_de_obra(p_obra_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      upper(coalesce(
        nullif(to_jsonb(o) ->> 'modelo', ''),
        nullif(o.linea_nombre, ''),
        split_part(coalesce(o.codigo, ''), '-', 1)
      )),
      '[^A-Z0-9]+', '', 'g'
    ),
    '^K', ''
  )
  from public.produccion_obras o
  where o.id = p_obra_id
  limit 1;
$$;

grant execute on function public.panol_modelo_de_obra(uuid) to authenticated;

-- Guarda la eleccion concreta de una obra y sincroniza las referencias que ya
-- existan en Compras o Panol. Null en producto significa "volver a pendiente".
create or replace function public.panol_guardar_configuracion_snapshot(
  p_snapshot_id uuid,
  p_producto_material_id uuid default null,
  p_especificaciones jsonb default '{}'::jsonb,
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
  v_specs jsonb := coalesce(p_especificaciones, '{}'::jsonb);
  v_bloqueado boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para configurar productos de obra';
  end if;
  if jsonb_typeof(v_specs) <> 'object' then
    raise exception 'Las especificaciones deben ser un objeto';
  end if;

  select * into v_row
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id
   for update;
  if not found then raise exception 'Item de obra no encontrado'; end if;

  v_requisito := coalesce(v_row.requisito_material_id, v_row.material_id);
  if v_requisito is null then raise exception 'El item no tiene requisito de matriz'; end if;
  v_producto := coalesce(p_producto_material_id, v_requisito);

  if p_producto_material_id is not null then
    if not exists (
      select 1
        from public.panol_materiales
       where id = p_producto_material_id
         and activo is distinct from false
         and es_requisito is distinct from true
    ) then
      raise exception 'El producto elegido no existe, esta inactivo o es otro requisito';
    end if;
  end if;

  v_bloqueado := (
    v_row.purchase_request_id is not null
    or v_row.panol_envio_id is not null
    or v_row.panol_envio_item_id is not null
    or coalesce(v_row.estado, 'pendiente') in ('comprado','en_panol','parcial','recibido','egresado')
    or coalesce(v_row.recepcion_estado, 'pendiente') in ('recibido','parcial')
  );

  if v_bloqueado
     and v_row.material_id is distinct from v_requisito
     and v_producto is distinct from v_row.material_id then
    raise exception 'El producto ya tiene compras o movimientos y no puede reemplazarse';
  end if;

  if p_producto_material_id is not null then
    insert into public.panol_requisito_productos (
      requisito_material_id, producto_material_id, origen, created_by
    ) values (
      v_requisito, p_producto_material_id, 'asignacion_obra', v_uid
    )
    on conflict (requisito_material_id, producto_material_id)
    do update set activo = true, updated_at = now();
  end if;

  perform set_config('app.audit_origin', coalesce(nullif(p_origen, ''), 'asignacion_obra'), true);
  perform set_config('app.audit_note', 'Producto y especificaciones configurados para la obra', true);

  update public.panol_obra_materiales_snapshot
     set requisito_material_id = v_requisito,
         material_id = v_producto,
         variante = null,
         especificaciones = v_specs,
         especificaciones_origen = coalesce(nullif(p_origen, ''), 'asignacion_obra'),
         producto_asignado_at = case when p_producto_material_id is null then null else now() end,
         producto_asignado_por = case when p_producto_material_id is null then null else v_uid end,
         producto_asignacion_origen = coalesce(nullif(p_origen, ''), 'asignacion_obra'),
         updated_at = now()
   where id = p_snapshot_id
   returning * into v_row;

  if v_row.purchase_request_item_id is not null then
    update public.purchase_request_items
       set material_id = v_producto,
           requisito_material_id = v_requisito,
           especificaciones = v_specs,
           catalog_source = 'panol',
           updated_at = now()
     where id = v_row.purchase_request_item_id;
  end if;

  update public.panol_envio_items
     set material_id = v_producto,
         requisito_material_id = v_requisito,
         especificaciones = v_specs,
         updated_at = now()
   where id = v_row.panol_envio_item_id
      or obra_snapshot_item_id = p_snapshot_id;

  return v_row;
end;
$$;

grant execute on function public.panol_guardar_configuracion_snapshot(uuid,uuid,jsonb,text) to authenticated;

-- Configura el estandar de una linea. Por defecto afecta nuevas obras; cuando
-- se solicita, tambien actualiza snapshots existentes que aun no tienen
-- compras, recepciones ni movimientos asociados.
create or replace function public.panol_guardar_configuracion_matriz(
  p_requisito_material_id uuid,
  p_modelo text,
  p_producto_material_id uuid default null,
  p_especificaciones jsonb default '{}'::jsonb,
  p_aplicar_obras_existentes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_modelo text := regexp_replace(regexp_replace(upper(trim(coalesce(p_modelo, ''))), '[^A-Z0-9]+', '', 'g'), '^K', '');
  v_specs jsonb := coalesce(p_especificaciones, '{}'::jsonb);
  v_total integer := 0;
  v_actualizadas integer := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para configurar la matriz';
  end if;
  if p_requisito_material_id is null or v_modelo = '' then
    raise exception 'Falta el requisito o la linea';
  end if;
  if jsonb_typeof(v_specs) <> 'object' then
    raise exception 'Las especificaciones deben ser un objeto';
  end if;
  if not exists (
    select 1 from public.panol_material_modelo
     where material_id = p_requisito_material_id
       and regexp_replace(regexp_replace(upper(modelo), '[^A-Z0-9]+', '', 'g'), '^K', '') = v_modelo
       and coalesce(variante, 'standard') = 'standard'
  ) then
    raise exception 'El requisito no integra la matriz de esa linea';
  end if;

  if p_producto_material_id is not null then
    if not exists (
      select 1 from public.panol_materiales
       where id = p_producto_material_id
         and activo is distinct from false
         and es_requisito is distinct from true
    ) then
      raise exception 'El producto elegido no existe, esta inactivo o es otro requisito';
    end if;

    insert into public.panol_requisito_productos (
      requisito_material_id, producto_material_id, origen, created_by
    ) values (
      p_requisito_material_id, p_producto_material_id, 'manual', v_uid
    )
    on conflict (requisito_material_id, producto_material_id)
    do update set activo = true, updated_at = now();
  end if;

  update public.panol_material_modelo
     set producto_predeterminado_id = p_producto_material_id,
         especificaciones_defecto = v_specs
   where material_id = p_requisito_material_id
     and regexp_replace(regexp_replace(upper(modelo), '[^A-Z0-9]+', '', 'g'), '^K', '') = v_modelo
     and coalesce(variante, 'standard') = 'standard';

  select count(*) into v_total
    from public.panol_obra_materiales_snapshot s
   where coalesce(s.requisito_material_id, s.material_id) = p_requisito_material_id
     and lower(coalesce(s.source, 'matriz')) = 'matriz'
     and coalesce(s.es_adicional, false) = false
     and public.panol_modelo_de_obra(s.obra_id) = v_modelo;

  if p_aplicar_obras_existentes then
    perform set_config('app.audit_origin', 'matriz_linea', true);
    perform set_config('app.audit_note', 'Producto y especificaciones heredados desde la matriz de linea', true);

    update public.panol_obra_materiales_snapshot s
       set requisito_material_id = p_requisito_material_id,
           material_id = coalesce(p_producto_material_id, p_requisito_material_id),
           variante = null,
           especificaciones = v_specs,
           especificaciones_origen = 'matriz_linea',
           producto_asignado_at = case when p_producto_material_id is null then null else now() end,
           producto_asignado_por = case when p_producto_material_id is null then null else v_uid end,
           producto_asignacion_origen = 'matriz_linea',
           updated_at = now()
     where coalesce(s.requisito_material_id, s.material_id) = p_requisito_material_id
       and lower(coalesce(s.source, 'matriz')) = 'matriz'
       and coalesce(s.es_adicional, false) = false
       and public.panol_modelo_de_obra(s.obra_id) = v_modelo
       and s.purchase_request_id is null
       and s.panol_envio_id is null
       and s.panol_envio_item_id is null
       and coalesce(s.estado, 'pendiente') = 'pendiente'
       and coalesce(s.recepcion_estado, 'pendiente') = 'pendiente';
    get diagnostics v_actualizadas = row_count;
  end if;

  return jsonb_build_object(
    'modelo', v_modelo,
    'obras_total', v_total,
    'obras_actualizadas', v_actualizadas,
    'obras_omitidas', case when p_aplicar_obras_existentes then greatest(v_total - v_actualizadas, 0) else 0 end
  );
end;
$$;

grant execute on function public.panol_guardar_configuracion_matriz(uuid,text,uuid,jsonb,boolean) to authenticated;

-- Los snapshots nuevos heredan el estandar de su linea sin que el frontend
-- tenga que duplicar reglas de negocio.
create or replace function public.panol_snapshot_aplicar_configuracion_linea()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_requisito uuid := coalesce(new.requisito_material_id, new.material_id);
  v_modelo text;
  v_config record;
begin
  if v_requisito is null
     or lower(coalesce(new.source, 'matriz')) <> 'matriz'
     or coalesce(new.es_adicional, false) then
    return new;
  end if;

  new.requisito_material_id := v_requisito;
  v_modelo := public.panol_modelo_de_obra(new.obra_id);

  select producto_predeterminado_id, especificaciones_defecto
    into v_config
    from public.panol_material_modelo
   where material_id = v_requisito
     and regexp_replace(regexp_replace(upper(modelo), '[^A-Z0-9]+', '', 'g'), '^K', '') = v_modelo
     and coalesce(variante, 'standard') = 'standard'
   order by id
   limit 1;

  if found then
    if v_config.producto_predeterminado_id is not null
       and (new.material_id is null or new.material_id = v_requisito) then
      new.material_id := v_config.producto_predeterminado_id;
      new.producto_asignado_at := coalesce(new.producto_asignado_at, now());
      new.producto_asignacion_origen := coalesce(new.producto_asignacion_origen, 'matriz_linea');
    end if;
    if coalesce(new.especificaciones, '{}'::jsonb) = '{}'::jsonb then
      new.especificaciones := coalesce(v_config.especificaciones_defecto, '{}'::jsonb);
      new.especificaciones_origen := case
        when new.especificaciones <> '{}'::jsonb then 'matriz_linea'
        else new.especificaciones_origen
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_snapshot_aplicar_configuracion_linea on public.panol_obra_materiales_snapshot;
create trigger trg_panol_snapshot_aplicar_configuracion_linea
before insert on public.panol_obra_materiales_snapshot
for each row execute function public.panol_snapshot_aplicar_configuracion_linea();

-- El aviso a Panol toma siempre la identidad y especificaciones fijadas en el
-- snapshot, aunque el RPC legacy no incluya aun esas claves en su INSERT.
create or replace function public.panol_envio_item_set_material_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.obra_snapshot_item_id is not null then
    select
      coalesce(new.material_id, s.material_id),
      coalesce(new.requisito_material_id, s.requisito_material_id, s.material_id),
      case
        when coalesce(new.especificaciones, '{}'::jsonb) = '{}'::jsonb then coalesce(s.especificaciones, '{}'::jsonb)
        else new.especificaciones
      end
      into new.material_id, new.requisito_material_id, new.especificaciones
      from public.panol_obra_materiales_snapshot s
     where s.id = new.obra_snapshot_item_id
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_envio_item_set_material_id on public.panol_envio_items;
create trigger trg_panol_envio_item_set_material_id
before insert or update of obra_snapshot_item_id on public.panol_envio_items
for each row execute function public.panol_envio_item_set_material_id();

-- La cantidad se sincroniza por requisito, no por SKU. Una obra con Samsung
-- asignado a "TV 32" debe seguir recibiendo los cambios de cantidad de TV 32.
create or replace function public.sincronizar_cantidad_matriz_en_obras(
  p_material_id uuid,
  p_modelo text,
  p_cantidad numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo text := regexp_replace(regexp_replace(upper(trim(coalesce(p_modelo, ''))), '[^A-Z0-9]+', '', 'g'), '^K', '');
  v_actualizadas integer := 0;
begin
  if p_material_id is null or v_modelo = '' or p_cantidad is null or p_cantidad <= 0 then
    return 0;
  end if;

  perform set_config('app.audit_origin', 'matriz_linea', true);
  perform set_config('app.audit_note', format('Cantidad sincronizada desde la matriz %s.', v_modelo), true);

  update public.panol_obra_materiales_snapshot snapshot
     set cantidad = p_cantidad,
         updated_at = now()
   where coalesce(snapshot.requisito_material_id, snapshot.material_id) = p_material_id
     and lower(coalesce(snapshot.source, 'matriz')) = 'matriz'
     and lower(coalesce(snapshot.tipo, 'base')) not in ('addon', 'adicional', 'opcional')
     and public.panol_modelo_de_obra(snapshot.obra_id) = v_modelo
     and snapshot.cantidad is distinct from p_cantidad;

  get diagnostics v_actualizadas = row_count;
  return v_actualizadas;
end;
$$;

-- Amplia el historial existente para incluir requisito y especificaciones.
create or replace function public.panol_audit_obra_snapshot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_origin text := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'trigger');
  v_note text := nullif(current_setting('app.audit_note', true), '');
  v_context jsonb := jsonb_build_object('txid', txid_current());
  v_change record;
begin
  if tg_op <> 'UPDATE' then return new; end if;

  for v_change in
    select * from (values
      ('estado'::text, to_jsonb(old.estado), to_jsonb(new.estado)),
      ('recepcion_estado'::text, to_jsonb(old.recepcion_estado), to_jsonb(new.recepcion_estado)),
      ('recepcion_nota'::text, to_jsonb(old.recepcion_nota), to_jsonb(new.recepcion_nota)),
      ('cantidad'::text, to_jsonb(old.cantidad), to_jsonb(new.cantidad)),
      ('egreso_nota'::text, to_jsonb(old.egreso_nota), to_jsonb(new.egreso_nota)),
      ('variante'::text, to_jsonb(old.variante), to_jsonb(new.variante)),
      ('requisito_material_id'::text, to_jsonb(old.requisito_material_id), to_jsonb(new.requisito_material_id)),
      ('material_id'::text, to_jsonb(old.material_id), to_jsonb(new.material_id)),
      ('especificaciones'::text, old.especificaciones, new.especificaciones)
    ) as c(campo, valor_anterior, valor_nuevo)
  loop
    if v_change.valor_anterior is distinct from v_change.valor_nuevo then
      insert into public.panol_obra_materiales_snapshot_audit (
        snapshot_id, obra_id, material_id, descripcion, campo,
        valor_anterior, valor_nuevo, nota, actor_id, origen, contexto
      ) values (
        new.id, new.obra_id, new.material_id, new.descripcion, v_change.campo,
        v_change.valor_anterior, v_change.valor_nuevo,
        coalesce(v_note, case
          when v_change.campo = 'especificaciones' then 'Especificaciones tecnicas actualizadas'
          when v_change.campo = 'material_id' then 'Producto concreto actualizado'
          else null
        end),
        v_actor, v_origin, v_context
      );
    end if;
  end loop;
  return new;
end;
$$;
