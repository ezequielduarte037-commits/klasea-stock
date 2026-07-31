-- ============================================================================
-- Obras como fuente de verdad de los materiales de producción
--
-- Cada producto se ubica en una etapa o tarea de la plantilla de línea.
-- Esa asignación alimenta automáticamente las etapas de Compras que cubren
-- dicho proceso, sin modificar ajustes manuales ya hechos para una obra.
-- ============================================================================

-- 1. Conservar de qué tarea de plantilla nació cada tarea real de una obra.

alter table public.obra_tareas
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

create index if not exists idx_obra_tareas_linea_proceso_tarea
  on public.obra_tareas(linea_proceso_tarea_id);

-- Recuperar el vínculo de las tareas existentes cuando nombre y etapa permiten
-- identificar una única tarea de plantilla sin ambigüedad.
with candidatas as (
  select
    ot.id,
    array_agg(lpt.id order by lpt.orden, lpt.id) as plantilla_ids,
    count(*) as coincidencias
  from public.obra_tareas ot
  join public.obra_etapas oe
    on oe.id = ot.etapa_id
  join public.linea_proceso_tareas lpt
    on lpt.linea_proceso_id = oe.linea_proceso_id
   and lower(btrim(lpt.nombre)) = lower(btrim(ot.nombre))
  where ot.linea_proceso_tarea_id is null
  group by ot.id
)
update public.obra_tareas ot
   set linea_proceso_tarea_id = (c.plantilla_ids)[1]
  from candidatas c
 where c.id = ot.id
   and c.coincidencias = 1;

comment on column public.obra_tareas.linea_proceso_tarea_id is
  'Tarea de la plantilla de línea de la que nació esta tarea de obra.';

-- 2. Una tarea siempre manda sobre la etapa. Evita combinaciones imposibles
-- como una tarea de Pintores guardada dentro de Matriz/Casco.

create or replace function public.produccion_material_etapa_desde_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proceso_id uuid;
begin
  if new.linea_proceso_tarea_id is not null then
    select t.linea_proceso_id
      into v_proceso_id
      from public.linea_proceso_tareas t
     where t.id = new.linea_proceso_tarea_id;

    if v_proceso_id is null then
      raise exception 'La tarea de producción indicada no existe';
    end if;

    new.linea_proceso_id := v_proceso_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lpm_etapa_desde_tarea
  on public.linea_proceso_materiales;
create trigger trg_lpm_etapa_desde_tarea
before insert or update of linea_proceso_id, linea_proceso_tarea_id
on public.linea_proceso_materiales
for each row execute function public.produccion_material_etapa_desde_tarea();

-- 3. Historial independiente de la asignación productiva. Se conserva incluso
-- si luego se elimina la etapa, tarea o producto.

create table if not exists public.produccion_materiales_auditoria (
  id bigint generated always as identity primary key,
  registro_id uuid,
  linea_id uuid,
  linea_proceso_id uuid,
  linea_proceso_tarea_id uuid,
  material_id uuid,
  accion text not null check (accion in ('insert', 'update', 'delete')),
  datos_antes jsonb,
  datos_despues jsonb,
  actor_id uuid,
  actor_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_produccion_materiales_audit_linea
  on public.produccion_materiales_auditoria(linea_id, created_at desc);
create index if not exists idx_produccion_materiales_audit_registro
  on public.produccion_materiales_auditoria(registro_id, created_at desc);

create or replace function public.produccion_material_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_linea_id uuid;
  v_actor uuid := auth.uid();
  v_actor_nombre text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  select lp.linea_id
    into v_linea_id
    from public.linea_procesos lp
   where lp.id = (v_row ->> 'linea_proceso_id')::uuid;

  select p.username
    into v_actor_nombre
    from public.profiles p
   where p.id = v_actor;

  insert into public.produccion_materiales_auditoria (
    registro_id,
    linea_id,
    linea_proceso_id,
    linea_proceso_tarea_id,
    material_id,
    accion,
    datos_antes,
    datos_despues,
    actor_id,
    actor_nombre
  )
  values (
    (v_row ->> 'id')::uuid,
    v_linea_id,
    (v_row ->> 'linea_proceso_id')::uuid,
    nullif(v_row ->> 'linea_proceso_tarea_id', '')::uuid,
    (v_row ->> 'material_id')::uuid,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    v_actor,
    coalesce(v_actor_nombre, 'sistema')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_produccion_material_auditar
  on public.linea_proceso_materiales;
create trigger trg_produccion_material_auditar
after insert or update or delete on public.linea_proceso_materiales
for each row execute function public.produccion_material_auditar();

alter table public.produccion_materiales_auditoria enable row level security;
drop policy if exists "produccion_materiales_auditoria authenticated select"
  on public.produccion_materiales_auditoria;
create policy "produccion_materiales_auditoria authenticated select"
  on public.produccion_materiales_auditoria
  for select to authenticated
  using (auth.uid() is not null);
grant select on public.produccion_materiales_auditoria to authenticated;

-- 4. Llevar el material a las etapas de Compras vinculadas.
--
-- La plantilla de Compras refleja siempre la definición de Obras. En una obra
-- real sólo se actualizan filas de origen "plantilla": una corrección manual,
-- una copia o un adicional de Compras nunca se pisan automáticamente.

create or replace function public.produccion_reconciliar_material_compras(
  p_linea_id uuid,
  p_material_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa record;
  v_cantidad_fuentes integer;
  v_cantidad numeric;
  v_unidad text;
  v_notas text;
  v_proceso_id uuid;
  v_tarea_id uuid;
  v_orden integer;
begin
  if p_linea_id is null or p_material_id is null then
    return;
  end if;

  -- Plantilla de Compras de la línea.
  for v_etapa in
    select lce.id
      from public.linea_compra_etapas lce
     where lce.linea_id = p_linea_id
       and coalesce(lce.activa, true)
  loop
    select
      count(*)::integer,
      coalesce(sum(lpm.cantidad), 0),
      min(nullif(btrim(lpm.unidad), '')),
      string_agg(distinct nullif(btrim(lpm.notas), ''), ' · '),
      (array_agg(lpm.linea_proceso_id order by lpm.orden, lpm.id))[1],
      (array_agg(lpm.linea_proceso_tarea_id order by lpm.orden, lpm.id)
        filter (where lpm.linea_proceso_tarea_id is not null))[1],
      coalesce(min(lpm.orden), 0)
    into
      v_cantidad_fuentes,
      v_cantidad,
      v_unidad,
      v_notas,
      v_proceso_id,
      v_tarea_id,
      v_orden
    from public.linea_proceso_materiales lpm
    join public.linea_compra_etapa_procesos enlace
      on enlace.linea_proceso_id = lpm.linea_proceso_id
     and enlace.compra_etapa_id = v_etapa.id
    where lpm.material_id = p_material_id;

    if v_cantidad_fuentes = 0 then
      delete from public.linea_compra_etapa_materiales
       where compra_etapa_id = v_etapa.id
         and material_id = p_material_id;
    else
      if v_cantidad_fuentes > 1 then
        v_proceso_id := null;
        v_tarea_id := null;
      end if;

      insert into public.linea_compra_etapa_materiales (
        compra_etapa_id,
        material_id,
        cantidad,
        unidad,
        notas,
        linea_proceso_id,
        linea_proceso_tarea_id,
        orden,
        created_by
      )
      values (
        v_etapa.id,
        p_material_id,
        v_cantidad,
        v_unidad,
        v_notas,
        v_proceso_id,
        v_tarea_id,
        v_orden,
        auth.uid()
      )
      on conflict (compra_etapa_id, material_id)
      do update set
        cantidad = excluded.cantidad,
        unidad = excluded.unidad,
        notas = excluded.notas,
        linea_proceso_id = excluded.linea_proceso_id,
        linea_proceso_tarea_id = excluded.linea_proceso_tarea_id,
        orden = excluded.orden
      where (
        linea_compra_etapa_materiales.cantidad,
        linea_compra_etapa_materiales.unidad,
        linea_compra_etapa_materiales.notas,
        linea_compra_etapa_materiales.linea_proceso_id,
        linea_compra_etapa_materiales.linea_proceso_tarea_id,
        linea_compra_etapa_materiales.orden
      ) is distinct from (
        excluded.cantidad,
        excluded.unidad,
        excluded.notas,
        excluded.linea_proceso_id,
        excluded.linea_proceso_tarea_id,
        excluded.orden
      );
    end if;
  end loop;

  -- Etapas todavía editables de las obras de esa línea.
  for v_etapa in
    select oce.id
      from public.obra_compra_etapas oce
      join public.produccion_obras obra
        on obra.id = oce.obra_id
     where obra.linea_id = p_linea_id
       and oce.estado = 'pendiente'
  loop
    select
      count(*)::integer,
      coalesce(sum(lpm.cantidad), 0),
      min(nullif(btrim(lpm.unidad), '')),
      string_agg(distinct nullif(btrim(lpm.notas), ''), ' · '),
      (array_agg(lpm.linea_proceso_id order by lpm.orden, lpm.id))[1],
      (array_agg(lpm.linea_proceso_tarea_id order by lpm.orden, lpm.id)
        filter (where lpm.linea_proceso_tarea_id is not null))[1],
      coalesce(min(lpm.orden), 0)
    into
      v_cantidad_fuentes,
      v_cantidad,
      v_unidad,
      v_notas,
      v_proceso_id,
      v_tarea_id,
      v_orden
    from public.linea_proceso_materiales lpm
    join public.obra_compra_etapa_procesos enlace
      on enlace.linea_proceso_id = lpm.linea_proceso_id
     and enlace.obra_compra_etapa_id = v_etapa.id
    where lpm.material_id = p_material_id;

    if v_cantidad_fuentes = 0 then
      delete from public.obra_compra_etapa_materiales
       where obra_compra_etapa_id = v_etapa.id
         and material_id = p_material_id
         and origen = 'plantilla';
    else
      if v_cantidad_fuentes > 1 then
        v_proceso_id := null;
        v_tarea_id := null;
      end if;

      insert into public.obra_compra_etapa_materiales (
        obra_compra_etapa_id,
        material_id,
        cantidad,
        unidad,
        notas,
        linea_proceso_id,
        linea_proceso_tarea_id,
        orden,
        origen,
        created_by
      )
      values (
        v_etapa.id,
        p_material_id,
        v_cantidad,
        v_unidad,
        v_notas,
        v_proceso_id,
        v_tarea_id,
        v_orden,
        'plantilla',
        auth.uid()
      )
      on conflict (obra_compra_etapa_id, material_id)
      do update set
        cantidad = excluded.cantidad,
        unidad = excluded.unidad,
        notas = excluded.notas,
        linea_proceso_id = excluded.linea_proceso_id,
        linea_proceso_tarea_id = excluded.linea_proceso_tarea_id,
        orden = excluded.orden
      where obra_compra_etapa_materiales.origen = 'plantilla'
        and (
          obra_compra_etapa_materiales.cantidad,
          obra_compra_etapa_materiales.unidad,
          obra_compra_etapa_materiales.notas,
          obra_compra_etapa_materiales.linea_proceso_id,
          obra_compra_etapa_materiales.linea_proceso_tarea_id,
          obra_compra_etapa_materiales.orden
        ) is distinct from (
          excluded.cantidad,
          excluded.unidad,
          excluded.notas,
          excluded.linea_proceso_id,
          excluded.linea_proceso_tarea_id,
          excluded.orden
        );
    end if;
  end loop;
end;
$$;

revoke all on function public.produccion_reconciliar_material_compras(uuid, uuid)
  from public;
grant execute on function public.produccion_reconciliar_material_compras(uuid, uuid)
  to authenticated;

-- Reconciliar cuando cambia una asignación en Obras.
create or replace function public.produccion_material_sincronizar_compras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_anterior uuid;
  v_linea_nueva uuid;
begin
  if tg_op = 'DELETE' then
    select lp.linea_id
      into v_linea_anterior
      from public.linea_procesos lp
     where lp.id = old.linea_proceso_id;

    perform public.produccion_reconciliar_material_compras(
      v_linea_anterior,
      old.material_id
    );

    return old;
  end if;

  if tg_op = 'INSERT' then
    select lp.linea_id
      into v_linea_nueva
      from public.linea_procesos lp
     where lp.id = new.linea_proceso_id;

    perform public.produccion_reconciliar_material_compras(
      v_linea_nueva,
      new.material_id
    );
    return new;
  end if;

  -- UPDATE: al consultar la línea anterior, la fila ya contiene sus valores
  -- nuevos; por eso una reconciliación limpia el origen y carga el destino
  -- cuando ambos pertenecen a la misma línea.
  select lp.linea_id
    into v_linea_anterior
    from public.linea_procesos lp
   where lp.id = old.linea_proceso_id;

  perform public.produccion_reconciliar_material_compras(
    v_linea_anterior,
    old.material_id
  );

  select lp.linea_id
    into v_linea_nueva
    from public.linea_procesos lp
   where lp.id = new.linea_proceso_id;

  if v_linea_nueva is distinct from v_linea_anterior
     or new.material_id is distinct from old.material_id
  then
    perform public.produccion_reconciliar_material_compras(
      v_linea_nueva,
      new.material_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_produccion_material_sincronizar_compras
  on public.linea_proceso_materiales;
create trigger trg_produccion_material_sincronizar_compras
after insert or update or delete on public.linea_proceso_materiales
for each row execute function public.produccion_material_sincronizar_compras();

-- Si Compras vincula una etapa productiva después de haber ubicado los
-- materiales en Obras, completar la nueva etapa sin exigir volver a guardar.
create or replace function public.produccion_enlace_sincronizar_compras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proceso_id uuid;
  v_linea_id uuid;
  v_material record;
begin
  if tg_op = 'DELETE' then
    v_proceso_id := old.linea_proceso_id;
  else
    v_proceso_id := new.linea_proceso_id;
  end if;

  select lp.linea_id
    into v_linea_id
    from public.linea_procesos lp
   where lp.id = v_proceso_id;

  for v_material in
    select distinct lpm.material_id
      from public.linea_proceso_materiales lpm
     where lpm.linea_proceso_id = v_proceso_id
  loop
    perform public.produccion_reconciliar_material_compras(
      v_linea_id,
      v_material.material_id
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_linea_compra_enlace_sincronizar
  on public.linea_compra_etapa_procesos;
create trigger trg_linea_compra_enlace_sincronizar
after insert or delete on public.linea_compra_etapa_procesos
for each row execute function public.produccion_enlace_sincronizar_compras();

drop trigger if exists trg_obra_compra_enlace_sincronizar
  on public.obra_compra_etapa_procesos;
create trigger trg_obra_compra_enlace_sincronizar
after insert or delete on public.obra_compra_etapa_procesos
for each row execute function public.produccion_enlace_sincronizar_compras();

-- Aplicar también la regla a las asignaciones que ya existían antes de esta
-- migración. Las filas manuales de una obra siguen protegidas por la función.
do $$
declare
  v_material record;
begin
  for v_material in
    select distinct
      lp.linea_id,
      lpm.material_id
    from public.linea_proceso_materiales lpm
    join public.linea_procesos lp
      on lp.id = lpm.linea_proceso_id
  loop
    perform public.produccion_reconciliar_material_compras(
      v_material.linea_id,
      v_material.material_id
    );
  end loop;
end;
$$;

-- 5. El pedido a Compras también conserva la tarea exacta de producción.

create or replace function public.compras_crear_pedido_proveedor(
  p_material_ids uuid[],
  p_proveedor text default null,
  p_auto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pedido_id uuid;
  v_obras uuid[];
  v_multi boolean;
  v_titulo text;
  v_items int := 0;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if p_material_ids is null or array_length(p_material_ids, 1) is null then
    raise exception 'Seleccioná al menos un material';
  end if;

  select array_agg(distinct e.obra_id)
    into v_obras
    from public.obra_compra_etapa_materiales m
    join public.obra_compra_etapas e
      on e.id = m.obra_compra_etapa_id
   where m.id = any(p_material_ids);

  v_multi := coalesce(array_length(v_obras, 1), 0) > 1;
  v_titulo := case
    when p_proveedor is not null then 'Compra a ' || p_proveedor
    else 'Compra por etapa'
  end;

  if v_multi then
    v_titulo := v_titulo || format(' · %s obras', array_length(v_obras, 1));
  end if;

  insert into public.pedidos_produccion (
    obra_id,
    titulo,
    obra_codigo,
    estado,
    proveedor,
    multi_obra,
    generado_auto,
    created_by
  )
  values (
    case when v_multi then null else v_obras[1] end,
    v_titulo,
    case
      when v_multi then null
      else (select codigo from public.produccion_obras where id = v_obras[1])
    end,
    'pendiente',
    p_proveedor,
    v_multi,
    coalesce(p_auto, false),
    v_uid
  )
  returning id into v_pedido_id;

  insert into public.pedidos_produccion_items (
    pedido_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    notas,
    orden,
    estado,
    origen_proceso_id,
    origen_tarea_id,
    origen_etapa_nombre,
    origen_tarea_nombre,
    origen_compra_etapa_id,
    origen_compra_etapa_nombre,
    obra_id,
    obra_codigo
  )
  select
    v_pedido_id,
    m.material_id,
    coalesce(pm.descripcion, 'Material'),
    pm.codigo,
    m.cantidad,
    coalesce(m.unidad, pm.unidad_medida),
    m.notas,
    row_number() over (order by o.codigo, e.orden, m.orden),
    'pendiente',
    m.linea_proceso_id,
    m.linea_proceso_tarea_id,
    lp.nombre,
    lpt.nombre,
    e.id,
    e.nombre,
    e.obra_id,
    o.codigo
  from public.obra_compra_etapa_materiales m
  join public.obra_compra_etapas e
    on e.id = m.obra_compra_etapa_id
  left join public.produccion_obras o
    on o.id = e.obra_id
  left join public.panol_materiales pm
    on pm.id = m.material_id
  left join public.linea_procesos lp
    on lp.id = m.linea_proceso_id
  left join public.linea_proceso_tareas lpt
    on lpt.id = m.linea_proceso_tarea_id
  where m.id = any(p_material_ids);

  get diagnostics v_items = row_count;

  insert into public.pedido_produccion_etapas (
    pedido_id,
    obra_compra_etapa_id
  )
  select distinct
    v_pedido_id,
    e.id
  from public.obra_compra_etapa_materiales m
  join public.obra_compra_etapas e
    on e.id = m.obra_compra_etapa_id
  where m.id = any(p_material_ids)
  on conflict do nothing;

  update public.obra_compra_etapas
     set estado = 'en_compra'
   where id in (
     select distinct e.id
       from public.obra_compra_etapa_materiales m
       join public.obra_compra_etapas e
         on e.id = m.obra_compra_etapa_id
      where m.id = any(p_material_ids)
   )
     and estado = 'pendiente';

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'items', v_items,
    'obras', coalesce(array_length(v_obras, 1), 0),
    'multi_obra', v_multi
  );
end;
$$;

revoke all on function public.compras_crear_pedido_proveedor(uuid[], text, boolean)
  from public;
grant execute on function public.compras_crear_pedido_proveedor(uuid[], text, boolean)
  to authenticated;
