-- Compras por etapa: pedidos multi-etapa, operación por proveedor y
-- autogeneración idempotente.
--
-- Un pedido pertenece a una sola obra y un solo proveedor, pero puede reunir
-- materiales de varias etapas de compra. La trazabilidad fina vive en cada
-- ítem y la relación pedido <-> etapas se conserva en una tabla puente.

-- 1. Modelo multi-etapa y snapshots operativos.

create table if not exists public.pedido_produccion_etapas (
  pedido_id uuid not null references public.pedidos_produccion(id) on delete cascade,
  obra_compra_etapa_id uuid not null references public.obra_compra_etapas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pedido_id, obra_compra_etapa_id)
);

create index if not exists idx_pedido_produccion_etapas_etapa
  on public.pedido_produccion_etapas(obra_compra_etapa_id, pedido_id);

alter table public.pedidos_produccion
  add column if not exists proveedor text,
  add column if not exists auto_generado boolean not null default false;

alter table public.pedidos_produccion_items
  add column if not exists obra_compra_etapa_id uuid
    references public.obra_compra_etapas(id) on delete set null,
  add column if not exists origen_etapa_material_id uuid
    references public.obra_compra_etapa_materiales(id) on delete set null,
  add column if not exists origen_compra_etapa_nombre text,
  add column if not exists proveedor text;

create index if not exists idx_pedidos_items_compra_etapa
  on public.pedidos_produccion_items(obra_compra_etapa_id);

create index if not exists idx_pedidos_items_origen_material
  on public.pedidos_produccion_items(origen_etapa_material_id)
  where origen_etapa_material_id is not null;

create index if not exists idx_pedidos_produccion_proveedor
  on public.pedidos_produccion(proveedor, estado, created_at desc);

-- Compatibilidad: todo pedido viejo que tenía una etapa directa queda también
-- expresado en la tabla puente.
insert into public.pedido_produccion_etapas (pedido_id, obra_compra_etapa_id)
select p.id, p.obra_compra_etapa_id
from public.pedidos_produccion p
where p.obra_compra_etapa_id is not null
on conflict do nothing;

-- Recuperar, cuando es inequívoco, la etapa y la fila de material de los ítems
-- históricos. Esto permite que el semáforo nuevo reconozca pedidos anteriores.
update public.pedidos_produccion_items i
set
  obra_compra_etapa_id = p.obra_compra_etapa_id,
  origen_compra_etapa_nombre = e.nombre,
  origen_etapa_material_id = (
    select m.id
    from public.obra_compra_etapa_materiales m
    where m.obra_compra_etapa_id = p.obra_compra_etapa_id
      and m.material_id = i.material_id
    limit 1
  ),
  proveedor = coalesce((
    select nullif(btrim(pm.proveedor), '')
    from public.panol_materiales pm
    where pm.id = i.material_id
  ), 'Sin proveedor')
from public.pedidos_produccion p
join public.obra_compra_etapas e
  on e.id = p.obra_compra_etapa_id
where i.pedido_id = p.id
  and i.obra_compra_etapa_id is null;

update public.pedidos_produccion p
set proveedor = x.proveedor
from (
  select
    i.pedido_id,
    case
      when count(distinct coalesce(nullif(btrim(i.proveedor), ''), 'Sin proveedor')) = 1
        then min(coalesce(nullif(btrim(i.proveedor), ''), 'Sin proveedor'))
      else 'Varios proveedores'
    end as proveedor
  from public.pedidos_produccion_items i
  group by i.pedido_id
) x
where x.pedido_id = p.id
  and nullif(btrim(p.proveedor), '') is null;

alter table public.pedido_produccion_etapas enable row level security;
drop policy if exists "pedido_produccion_etapas authenticated all"
  on public.pedido_produccion_etapas;
create policy "pedido_produccion_etapas authenticated all"
  on public.pedido_produccion_etapas
  for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
grant select, insert, update, delete on public.pedido_produccion_etapas to authenticated;

-- 2. Vista operativa. Reutiliza fecha_compra y el resto del motor definido en
-- v_obra_compra_etapas; no vuelve a calcular fechas en el frontend.

create or replace view public.v_compras_materiales_pendientes
with (security_invoker = true)
as
select
  m.id as etapa_material_id,
  m.obra_compra_etapa_id,
  m.material_id,
  m.cantidad,
  coalesce(nullif(m.unidad, ''), pm.unidad_medida, 'u') as unidad,
  m.notas,
  m.linea_proceso_id,
  m.orden as material_orden,
  pm.descripcion as material_descripcion,
  pm.codigo as material_codigo,
  coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor') as proveedor,
  e.obra_id,
  e.obra_codigo,
  e.obra_linea_nombre,
  e.nombre as etapa_nombre,
  e.color as etapa_color,
  e.orden as etapa_orden,
  e.estado as etapa_estado,
  e.fecha_compra,
  e.dias_restantes,
  e.dias_gracia,
  e.auto_generar,
  e.semaforo
from public.obra_compra_etapa_materiales m
join public.v_obra_compra_etapas e
  on e.id = m.obra_compra_etapa_id
join public.panol_materiales pm
  on pm.id = m.material_id
where coalesce(m.cantidad, 0) > 0
  and e.estado not in ('completa', 'cancelada')
  and not exists (
    select 1
    from public.pedidos_produccion_items pi
    join public.pedidos_produccion p on p.id = pi.pedido_id
    where pi.origen_etapa_material_id = m.id
      and pi.estado <> 'cancelado'
      and p.estado <> 'cancelado'
  );

grant select on public.v_compras_materiales_pendientes to authenticated;

-- 3. Creación atómica de un pedido real. Se bloquea por obra para que dos
-- aperturas simultáneas no dupliquen ítems. Si todos ya estaban pedidos,
-- devuelve created=false y no crea un encabezado vacío.

create or replace function public.compras_crear_pedido_multi_etapa(
  p_obra_id uuid,
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
  v_actor uuid := auth.uid();
  v_pedido_id uuid;
  v_proveedor text;
  v_obra_codigo text;
  v_etapas_nombre text;
  v_total integer := 0;
  v_etapas integer := 0;
  v_proveedores integer := 0;
begin
  if v_actor is null and not p_auto then
    raise exception 'Se necesita una sesión válida para crear el pedido.';
  end if;
  if p_obra_id is null then
    raise exception 'Falta la obra.';
  end if;
  if coalesce(array_length(p_material_ids, 1), 0) = 0 then
    return jsonb_build_object('created', false, 'reason', 'sin_materiales');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('compras-pedido:' || p_obra_id::text, 0));

  select
    count(*),
    count(distinct coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor')),
    min(coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor')),
    min(o.codigo),
    string_agg(distinct e.nombre, ' + ' order by e.nombre)
  into v_total, v_proveedores, v_proveedor, v_obra_codigo, v_etapas_nombre
  from public.obra_compra_etapa_materiales m
  join public.obra_compra_etapas e on e.id = m.obra_compra_etapa_id
  join public.produccion_obras o on o.id = e.obra_id
  join public.panol_materiales pm on pm.id = m.material_id
  where m.id = any(p_material_ids)
    and e.obra_id = p_obra_id
    and e.estado not in ('completa', 'cancelada')
    and coalesce(m.cantidad, 0) > 0
    and (
      nullif(btrim(p_proveedor), '') is null
      or lower(coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor'))
         = lower(btrim(p_proveedor))
    )
    and not exists (
      select 1
      from public.pedidos_produccion_items pi
      join public.pedidos_produccion pp on pp.id = pi.pedido_id
      where pi.origen_etapa_material_id = m.id
        and pi.estado <> 'cancelado'
        and pp.estado <> 'cancelado'
    );

  if v_total = 0 then
    return jsonb_build_object('created', false, 'reason', 'ya_incluidos');
  end if;
  if v_proveedores > 1 then
    raise exception 'Un pedido debe corresponder a un solo proveedor.';
  end if;

  insert into public.pedidos_produccion (
    obra_id,
    titulo,
    obra_codigo,
    etapa_nombre,
    proveedor,
    estado,
    auto_generado,
    created_by
  )
  values (
    p_obra_id,
    v_proveedor || ' — ' || coalesce(v_obra_codigo, 'obra'),
    v_obra_codigo,
    v_etapas_nombre,
    v_proveedor,
    'pendiente',
    p_auto,
    v_actor
  )
  returning id into v_pedido_id;

  insert into public.pedido_produccion_etapas (pedido_id, obra_compra_etapa_id)
  select distinct v_pedido_id, m.obra_compra_etapa_id
  from public.obra_compra_etapa_materiales m
  join public.obra_compra_etapas e on e.id = m.obra_compra_etapa_id
  join public.panol_materiales pm on pm.id = m.material_id
  where m.id = any(p_material_ids)
    and e.obra_id = p_obra_id
    and coalesce(m.cantidad, 0) > 0
    and lower(coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor'))
        = lower(v_proveedor)
    and not exists (
      select 1
      from public.pedidos_produccion_items pi
      join public.pedidos_produccion pp on pp.id = pi.pedido_id
      where pi.origen_etapa_material_id = m.id
        and pi.estado <> 'cancelado'
        and pp.estado <> 'cancelado'
    )
  on conflict do nothing;

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
    origen_etapa_nombre,
    obra_compra_etapa_id,
    origen_etapa_material_id,
    origen_compra_etapa_nombre,
    proveedor
  )
  select
    v_pedido_id,
    m.material_id,
    coalesce(pm.descripcion, 'Material'),
    pm.codigo,
    m.cantidad,
    coalesce(nullif(m.unidad, ''), pm.unidad_medida),
    m.notas,
    row_number() over (order by e.orden, m.orden, pm.descripcion) - 1,
    'pendiente',
    m.linea_proceso_id,
    lp.nombre,
    e.id,
    m.id,
    e.nombre,
    v_proveedor
  from public.obra_compra_etapa_materiales m
  join public.obra_compra_etapas e on e.id = m.obra_compra_etapa_id
  join public.panol_materiales pm on pm.id = m.material_id
  left join public.linea_procesos lp on lp.id = m.linea_proceso_id
  where m.id = any(p_material_ids)
    and e.obra_id = p_obra_id
    and e.estado not in ('completa', 'cancelada')
    and coalesce(m.cantidad, 0) > 0
    and lower(coalesce(nullif(btrim(pm.proveedor), ''), 'Sin proveedor'))
        = lower(v_proveedor)
    and not exists (
      select 1
      from public.pedidos_produccion_items pi
      join public.pedidos_produccion pp on pp.id = pi.pedido_id
      where pi.origen_etapa_material_id = m.id
        and pi.estado <> 'cancelado'
        and pp.estado <> 'cancelado'
    );

  get diagnostics v_total = row_count;

  if v_total = 0 then
    delete from public.pedidos_produccion where id = v_pedido_id;
    return jsonb_build_object('created', false, 'reason', 'ya_incluidos');
  end if;

  select count(*) into v_etapas
  from public.pedido_produccion_etapas pe
  where pe.pedido_id = v_pedido_id;

  update public.obra_compra_etapas e
  set estado = 'en_compra'
  where exists (
    select 1
    from public.pedido_produccion_etapas pe
    where pe.pedido_id = v_pedido_id
      and pe.obra_compra_etapa_id = e.id
  )
    and e.estado not in ('completa', 'cancelada');

  return jsonb_build_object(
    'created', true,
    'pedido_id', v_pedido_id,
    'items', v_total,
    'etapas', v_etapas,
    'proveedor', v_proveedor
  );
end;
$$;

revoke all on function public.compras_crear_pedido_multi_etapa(uuid, uuid[], text, boolean)
  from public;
grant execute on function public.compras_crear_pedido_multi_etapa(uuid, uuid[], text, boolean)
  to authenticated;

-- 4. Autogeneración idempotente. La ventana de gracia se interpreta como
-- tolerancia posterior a fecha_compra: con 3 días se genera al cuarto día
-- calendario si nadie lo hizo antes. Puede llamarse desde la UI o un cron.

create or replace function public.compras_autogenerar_pedidos(
  p_fecha date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo record;
  v_resultado jsonb;
  v_pedidos integer := 0;
  v_items integer := 0;
  v_sin_materiales integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('compras-autogenerar', 0));

  for v_grupo in
    select
      p.obra_id,
      p.proveedor,
      array_agg(p.etapa_material_id order by p.etapa_orden, p.material_orden) as material_ids
    from public.v_compras_materiales_pendientes p
    where p.auto_generar
      and p.fecha_compra is not null
      and p.fecha_compra + coalesce(p.dias_gracia, 0) <= p_fecha
    group by p.obra_id, p.proveedor
  loop
    v_resultado := public.compras_crear_pedido_multi_etapa(
      v_grupo.obra_id,
      v_grupo.material_ids,
      v_grupo.proveedor,
      true
    );
    if coalesce((v_resultado ->> 'created')::boolean, false) then
      v_pedidos := v_pedidos + 1;
      v_items := v_items + coalesce((v_resultado ->> 'items')::integer, 0);
    end if;
  end loop;

  select count(*)
  into v_sin_materiales
  from public.v_obra_compra_etapas e
  where e.auto_generar
    and e.estado not in ('completa', 'cancelada')
    and e.fecha_compra is not null
    and e.fecha_compra + coalesce(e.dias_gracia, 0) <= p_fecha
    and not exists (
      select 1
      from public.obra_compra_etapa_materiales m
      where m.obra_compra_etapa_id = e.id
        and coalesce(m.cantidad, 0) > 0
    );

  return jsonb_build_object(
    'pedidos_creados', v_pedidos,
    'items_incluidos', v_items,
    'etapas_vencidas_sin_materiales', v_sin_materiales,
    'fecha_ejecucion', p_fecha
  );
end;
$$;

revoke all on function public.compras_autogenerar_pedidos(date) from public;
grant execute on function public.compras_autogenerar_pedidos(date)
  to authenticated, service_role;

-- 5. El semáforo reconoce la cobertura real por ítem, incluso cuando un pedido
-- cruza etapas. Una etapa sólo queda "Comprada" cuando todos sus materiales
-- positivos están incluidos en pedidos vigentes.

create or replace view public.v_obra_compra_etapas
with (security_invoker = true)
as
select
  e.id,
  e.obra_id,
  e.origen_id,
  e.nombre,
  e.descripcion,
  e.orden,
  e.color,
  e.estado,
  e.semanas_antes,
  e.referencia,
  e.dias_gracia,
  e.auto_generar,
  e.fecha_objetivo,
  e.created_by,
  e.created_at,
  e.updated_at,
  o.codigo as obra_codigo,
  o.linea_id as obra_linea_id,
  o.linea_nombre as obra_linea_nombre,
  o.atraso_dias as obra_atraso_dias,
  base.fecha_base,
  (
    case
      when e.referencia = 'botada' then o.botada_real is not null
      else o.desmolde_real is not null
    end
  ) as fecha_base_es_real,
  calc.fecha_compra,
  (calc.fecha_compra - current_date) as dias_restantes,
  (
    case
      when e.estado in ('completa', 'cancelada') then 'hecha'
      when exists (
        select 1
        from public.obra_compra_etapa_materiales m
        where m.obra_compra_etapa_id = e.id
          and coalesce(m.cantidad, 0) > 0
      )
      and not exists (
        select 1
        from public.obra_compra_etapa_materiales m
        where m.obra_compra_etapa_id = e.id
          and coalesce(m.cantidad, 0) > 0
          and not exists (
            select 1
            from public.pedidos_produccion_items pi
            join public.pedidos_produccion p on p.id = pi.pedido_id
            where pi.origen_etapa_material_id = m.id
              and pi.estado <> 'cancelado'
              and p.estado <> 'cancelado'
          )
      ) then 'hecha'
      when calc.fecha_compra is not null
       and calc.fecha_compra < current_date
       and not exists (
         select 1
         from public.obra_compra_etapa_materiales m
         where m.obra_compra_etapa_id = e.id
           and coalesce(m.cantidad, 0) > 0
       ) then 'sin_materiales'
      when calc.fecha_compra is null then 'sin_fecha'
      when calc.fecha_compra < current_date then 'atrasada'
      when calc.fecha_compra <= current_date + coalesce(e.dias_gracia, 0) then 'por_vencer'
      else 'a_tiempo'
    end
  ) as semaforo,
  (
    e.estado not in ('completa', 'cancelada')
    and calc.fecha_compra is not null
    and calc.fecha_compra < current_date
    and not exists (
      select 1
      from public.obra_compra_etapa_materiales m
      where m.obra_compra_etapa_id = e.id
        and coalesce(m.cantidad, 0) > 0
    )
  ) as vencida_sin_materiales
from public.obra_compra_etapas e
join public.produccion_obras o on o.id = e.obra_id
cross join lateral (
  select case
    when e.referencia = 'botada' then coalesce(o.botada_real, o.botada)
    else coalesce(o.desmolde_real, o.desmolde_estimado)
  end as fecha_base
) base
cross join lateral (
  select case
    when e.fecha_objetivo is not null then e.fecha_objetivo
    when e.semanas_antes is not null and base.fecha_base is not null
      then base.fecha_base
           - (e.semanas_antes * 7)::integer
           + coalesce(o.atraso_dias, 0)
    else null
  end as fecha_compra
) calc;

grant select on public.v_obra_compra_etapas to authenticated;
