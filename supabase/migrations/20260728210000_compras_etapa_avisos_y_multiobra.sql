-- ═════════════════════════════════════════════════════════════════════════════
-- Compras por Etapa: que los pedidos AVISEN, que lo automático se elija, y que
-- un pedido a un proveedor pueda cruzar obras elegidas a mano.
--
-- Tres problemas concretos que se arreglan acá:
--
--  1. Los pedidos no le avisaban a NADIE. `compras_autogenerar_pedidos` escribía
--     una fila en pedidos_produccion y se cortaba ahí. Si nadie abría esa
--     pestaña, el pedido no existía. Ahora cada pedido deja un aviso en
--     `compras_avisos`, que es la bandeja que Compras ya mira todos los días y
--     que ya cuenta para el badge del sidebar.
--
--  2. `auto_generar` nacía en TRUE. O sea que el sistema podía generar pedidos
--     solo, sin que nadie lo hubiera pedido y sin avisar. Pasa a FALSE: lo
--     automático se prende a mano, etapa por etapa.
--
--  3. Un pedido por proveedor sólo podía ser de UNA obra, que es justo el caso
--     donde menos sirve: si el mismo proveedor tiene material de la Obra 50 y
--     de la 52, conviene un solo pedido. Ahora el pedido puede cruzar obras,
--     pero SIEMPRE con las obras elegidas explícitamente por quien compra —
--     nunca mezcladas de oficio, porque a veces una obra no se debe pedir.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Lo automático arranca apagado ────────────────────────────────────────

alter table public.obra_compra_etapas
  alter column auto_generar set default false;

-- Las etapas que ya existen quedaron en true por el default viejo. Se apagan
-- todas: es más seguro que alguien tenga que prenderlo a que el sistema compre
-- por su cuenta sin que nadie lo haya decidido.
update public.obra_compra_etapas
   set auto_generar = false
 where auto_generar is true;

alter table public.linea_compra_etapas
  alter column auto_generar set default false;

update public.linea_compra_etapas
   set auto_generar = false
 where auto_generar is true;

comment on column public.obra_compra_etapas.auto_generar is
  'Apagado por defecto a propósito. Generar una compra sola es una decisión que toma una persona, no el sistema.';

-- ── 2. El pedido deja de pertenecer a UNA obra ──────────────────────────────
-- obra_id se mantiene (los pedidos viejos lo usan y sigue sirviendo cuando el
-- pedido es de una sola obra), pero se vuelve opcional y cada ítem pasa a
-- llevar su propia obra.

alter table public.pedidos_produccion
  alter column obra_id drop not null;

alter table public.pedidos_produccion
  add column if not exists proveedor text,
  add column if not exists multi_obra boolean not null default false;

comment on column public.pedidos_produccion.multi_obra is
  'El pedido junta materiales de más de una obra. Las obras se eligen a mano al generarlo.';

alter table public.pedidos_produccion_items
  add column if not exists obra_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists obra_codigo text;

-- Los items que ya existen heredan la obra de su pedido.
update public.pedidos_produccion_items i
   set obra_id = p.obra_id,
       obra_codigo = p.obra_codigo
  from public.pedidos_produccion p
 where i.pedido_id = p.id
   and i.obra_id is null
   and p.obra_id is not null;

create index if not exists idx_pedidos_items_obra
  on public.pedidos_produccion_items(obra_id)
  where obra_id is not null;

-- ── 3. Aviso a Compras cuando nace un pedido ────────────────────────────────
-- Se apoya en compras_avisos, que ya existe, ya tiene pantalla y ya suma al
-- badge del sidebar. No se inventa un canal nuevo que nadie mire.

alter table public.pedidos_produccion
  add column if not exists aviso_id uuid references public.compras_avisos(id) on delete set null;

create or replace function public.compras_avisar_pedido(p_pedido_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido record;
  v_items int := 0;
  v_obras text;
  v_aviso_id uuid;
  v_titulo text;
  v_detalle text;
  v_prioridad text := 'media';
begin
  select * into v_pedido from pedidos_produccion where id = p_pedido_id;
  if not found then return null; end if;
  -- Idempotente: si ya avisó, no vuelve a avisar (la autogeneración perezosa
  -- puede correr varias veces por día).
  if v_pedido.aviso_id is not null then return v_pedido.aviso_id; end if;

  select count(*) into v_items from pedidos_produccion_items where pedido_id = p_pedido_id;
  if v_items = 0 then return null; end if;

  select string_agg(distinct coalesce(i.obra_codigo, o.codigo, 'sin obra'), ', ')
    into v_obras
    from pedidos_produccion_items i
    left join produccion_obras o on o.id = i.obra_id
   where i.pedido_id = p_pedido_id;

  v_titulo := coalesce(v_pedido.titulo, 'Pedido de compra por etapa');
  if v_pedido.generado_auto then
    -- Un pedido que nadie tipeó tiene que gritar más fuerte: si salió solo y
    -- pasa desapercibido, se compra sin que nadie lo haya mirado.
    v_titulo := '[Automático] ' || v_titulo;
    v_prioridad := 'alta';
  end if;

  v_detalle := format(
    '%s ítems · Obras: %s%s',
    v_items,
    coalesce(v_obras, 'sin asignar'),
    case when v_pedido.proveedor is not null then ' · Proveedor: ' || v_pedido.proveedor else '' end
  );

  insert into compras_avisos (titulo, detalle, project_id, prioridad, origen, source_ref, created_by)
  values (
    v_titulo,
    v_detalle,
    v_pedido.obra_id,
    v_prioridad,
    'compras_etapa',
    p_pedido_id::text,
    -- Los pedidos automáticos no tienen autor humano; se cuelgan del creador
    -- del pedido si existe, y si no del primer admin, porque created_by es NOT NULL.
    coalesce(
      v_pedido.created_by,
      (select id from profiles where coalesce(is_admin, false) order by created_at limit 1)
    )
  )
  returning id into v_aviso_id;

  update pedidos_produccion set aviso_id = v_aviso_id where id = p_pedido_id;
  return v_aviso_id;
end;
$$;

revoke all on function public.compras_avisar_pedido(uuid) from public;
grant execute on function public.compras_avisar_pedido(uuid) to authenticated;

-- Cada pedido nuevo avisa solo. Va por trigger y no desde el frontend para que
-- valga también para los que crea la autogeneración desde SQL.
create or replace function public.compras_pedido_avisar_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Se dispara en AFTER INSERT del pedido, pero los ítems se insertan después:
  -- por eso el aviso real se arma cuando aparece el primer ítem.
  perform public.compras_avisar_pedido(new.pedido_id);
  return new;
end;
$$;

drop trigger if exists trg_compras_pedido_avisar on public.pedidos_produccion_items;
create trigger trg_compras_pedido_avisar
after insert on public.pedidos_produccion_items
for each row execute function public.compras_pedido_avisar_trg();

-- ── 4. Crear pedido eligiendo obras a mano ──────────────────────────────────

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
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_ids is null or array_length(p_material_ids, 1) is null then
    raise exception 'Seleccioná al menos un material';
  end if;

  -- Las obras salen de los materiales elegidos. No se agrega ninguna de oficio:
  -- si una obra no está en la selección, no entra al pedido.
  select array_agg(distinct e.obra_id)
    into v_obras
    from obra_compra_etapa_materiales m
    join obra_compra_etapas e on e.id = m.obra_compra_etapa_id
   where m.id = any(p_material_ids);

  v_multi := coalesce(array_length(v_obras, 1), 0) > 1;

  v_titulo := case
    when p_proveedor is not null then 'Compra a ' || p_proveedor
    else 'Compra por etapa'
  end;
  if v_multi then
    v_titulo := v_titulo || format(' · %s obras', array_length(v_obras, 1));
  end if;

  insert into pedidos_produccion (
    obra_id, titulo, obra_codigo, estado, proveedor, multi_obra, generado_auto, created_by
  )
  values (
    case when v_multi then null else v_obras[1] end,
    v_titulo,
    case when v_multi then null else (select codigo from produccion_obras where id = v_obras[1]) end,
    'pendiente',
    p_proveedor,
    v_multi,
    coalesce(p_auto, false),
    v_uid
  )
  returning id into v_pedido_id;

  insert into pedidos_produccion_items (
    pedido_id, material_id, descripcion, codigo, cantidad, unidad, notas, orden, estado,
    origen_proceso_id, origen_etapa_nombre, origen_compra_etapa_id, origen_compra_etapa_nombre,
    obra_id, obra_codigo
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
    lp.nombre,
    e.id,
    e.nombre,
    e.obra_id,
    o.codigo
  from obra_compra_etapa_materiales m
  join obra_compra_etapas e on e.id = m.obra_compra_etapa_id
  left join produccion_obras o on o.id = e.obra_id
  left join panol_materiales pm on pm.id = m.material_id
  left join linea_procesos lp on lp.id = m.linea_proceso_id
  where m.id = any(p_material_ids);

  get diagnostics v_items = row_count;

  -- Vincular el pedido con todas las etapas que toca, para que ninguna quede
  -- figurando como pendiente de comprar.
  insert into pedido_produccion_etapas (pedido_id, obra_compra_etapa_id)
  select distinct v_pedido_id, e.id
    from obra_compra_etapa_materiales m
    join obra_compra_etapas e on e.id = m.obra_compra_etapa_id
   where m.id = any(p_material_ids)
  on conflict do nothing;

  update obra_compra_etapas
     set estado = 'en_compra'
   where id in (
     select distinct e.id
       from obra_compra_etapa_materiales m
       join obra_compra_etapas e on e.id = m.obra_compra_etapa_id
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

revoke all on function public.compras_crear_pedido_proveedor(uuid[], text, boolean) from public;
grant execute on function public.compras_crear_pedido_proveedor(uuid[], text, boolean) to authenticated;

-- ── 5. La etapa de producción sale de la tarea ──────────────────────────────
-- Si a un material se le asigna una tarea, la etapa no se elige aparte: se
-- deduce de la tarea. Elegirlas por separado permitía que quedaran en
-- contradicción, y nadie sabía cuál mandaba.

alter table public.obra_compra_etapa_materiales
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

alter table public.linea_compra_etapa_materiales
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

create or replace function public.compras_material_etapa_desde_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.linea_proceso_tarea_id is not null then
    select t.linea_proceso_id
      into new.linea_proceso_id
      from linea_proceso_tareas t
     where t.id = new.linea_proceso_tarea_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ocem_etapa_desde_tarea on public.obra_compra_etapa_materiales;
create trigger trg_ocem_etapa_desde_tarea
before insert or update of linea_proceso_tarea_id on public.obra_compra_etapa_materiales
for each row execute function public.compras_material_etapa_desde_tarea();

drop trigger if exists trg_lcem_etapa_desde_tarea on public.linea_compra_etapa_materiales;
create trigger trg_lcem_etapa_desde_tarea
before insert or update of linea_proceso_tarea_id on public.linea_compra_etapa_materiales
for each row execute function public.compras_material_etapa_desde_tarea();

comment on column public.obra_compra_etapa_materiales.linea_proceso_tarea_id is
  'Tarea que consume el material. Al setearla, la etapa de producción se deduce sola por trigger.';
