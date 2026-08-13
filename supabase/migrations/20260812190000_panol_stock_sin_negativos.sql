begin;

-- Una fila recibida que luego cambia a `egresado` deja de estar disponible,
-- pero no se transforma por eso en un segundo movimiento negativo. Solo las
-- filas creadas como salida restan del ledger.
create or replace function public.panol_stock_movimiento_delta(
  p_source text,
  p_estado text,
  p_recepcion_estado text,
  p_cantidad numeric,
  p_cantidad_egresada numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_estado in ('en_panol', 'recibido', 'parcial')
     and (
       p_recepcion_estado in ('recibido', 'parcial')
       or coalesce(p_source, '') in ('stock_general', 'remito', 'transferencia_ingreso', 'ajuste_ingreso')
       or coalesce(p_source, '') like 'stock\_%' escape '\'
       or coalesce(p_source, '') like 'transferencia\_ingreso%' escape '\'
     )
      then coalesce(p_cantidad, 0)
    when coalesce(p_source, '') like 'egreso%'
      or coalesce(p_source, '') like 'transferencia\_egreso%' escape '\'
      or coalesce(p_source, '') = 'conteo_fisico_reversion'
      then -abs(coalesce(nullif(p_cantidad_egresada, 0), p_cantidad, 0))
    else 0
  end;
$$;

revoke all on function public.panol_stock_movimiento_delta(text,text,text,numeric,numeric) from public;
grant execute on function public.panol_stock_movimiento_delta(text,text,text,numeric,numeric) to authenticated;

create or replace function public.panol_stock_disponible(
  p_material_id uuid,
  p_sede text default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(sum(public.panol_stock_movimiento_delta(
    s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
  )), 0), 0)
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  where s.material_id = p_material_id
    and (
      p_sede is null
      or lower(coalesce(s.stock_sede, e.sede, '')) = lower(p_sede)
    );
$$;

revoke all on function public.panol_stock_disponible(uuid,text) from public;
grant execute on function public.panol_stock_disponible(uuid,text) to authenticated;

create or replace function public.panol_stock_disponible_ubicacion(
  p_material_id uuid,
  p_sede text,
  p_obra_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(sum(public.panol_stock_movimiento_delta(
    s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
  )), 0), 0)
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  where s.material_id = p_material_id
    and lower(coalesce(s.stock_sede, e.sede, '')) = lower(coalesce(p_sede, ''))
    and s.obra_id is not distinct from p_obra_id;
$$;

revoke all on function public.panol_stock_disponible_ubicacion(uuid,text,uuid) from public;
grant execute on function public.panol_stock_disponible_ubicacion(uuid,text,uuid) to authenticated;

-- Respaldo y auditoria de las regularizaciones historicas de identidad.
create table if not exists public.panol_stock_identidad_backup_20260812 (
  snapshot_id uuid primary key,
  snapshot jsonb not null,
  backed_up_at timestamptz not null default now()
);

create table if not exists public.panol_stock_regularizaciones_identidad (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  tipo text not null,
  requisito_material_id uuid references public.panol_materiales(id) on delete set null,
  producto_material_id uuid references public.panol_materiales(id) on delete set null,
  cantidad numeric not null check (cantidad > 0),
  snapshot_origen_id uuid,
  snapshot_ingreso_id uuid,
  snapshot_egreso_id uuid,
  detalle text,
  created_at timestamptz not null default now()
);

alter table public.panol_stock_identidad_backup_20260812 enable row level security;
alter table public.panol_stock_regularizaciones_identidad enable row level security;
revoke all on public.panol_stock_identidad_backup_20260812 from public, anon, authenticated;
revoke all on public.panol_stock_regularizaciones_identidad from public, anon, authenticated;

-- Transferencias viejas que conservaban la variante solo dentro de la nota.
-- La coincidencia es explicita; no se infiere por similitud de nombres.
create temp table _panol_transferencia_producto on commit drop as
select distinct on (s.id)
  s.id as snapshot_id,
  rp.requisito_material_id,
  rp.producto_material_id
from public.panol_obra_materiales_snapshot s
join public.panol_requisito_productos rp
  on rp.requisito_material_id = s.material_id
 and rp.activo
 and concat_ws(' | ', s.notas, s.stock_nota, s.egreso_nota)
       ilike ('%Variante: ' || rp.variante_legacy || '%')
where s.source in ('transferencia_ingreso', 'transferencia_egreso')
order by s.id, length(rp.variante_legacy) desc;

-- Un egreso generico puede desdoblarse solo cuando el lote de variantes que
-- ingreso a esa obra coincide exactamente con la cantidad consumida.
create temp table _panol_egreso_producto_exacto on commit drop as
with lotes as (
  select
    s.material_id as requisito_material_id,
    s.obra_id,
    coalesce(s.stock_sede, e.sede, '') as sede,
    m.producto_material_id,
    sum(coalesce(s.cantidad, 0)) as cantidad
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  join _panol_transferencia_producto m on m.snapshot_id = s.id
  where s.source = 'transferencia_ingreso'
  group by s.material_id, s.obra_id, coalesce(s.stock_sede, e.sede, ''), m.producto_material_id
), egresos as (
  select
    s.id as snapshot_origen_id,
    s.material_id as requisito_material_id,
    s.obra_id,
    coalesce(s.stock_sede, e.sede, '') as sede,
    abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0)) as cantidad,
    count(*) over (
      partition by s.material_id, s.obra_id, coalesce(s.stock_sede, e.sede, '')
    ) as egresos_en_ubicacion
  from public.panol_obra_materiales_snapshot s
  left join public.panol_envios e on e.id = s.panol_envio_id
  join public.panol_materiales p on p.id = s.material_id and p.es_requisito
  where s.source = 'egreso_producto'
    and nullif(btrim(coalesce(s.variante, '')), '') is null
), candidatos as (
  select
    eg.snapshot_origen_id,
    eg.requisito_material_id,
    eg.obra_id,
    eg.sede,
    eg.cantidad as cantidad_egreso,
    eg.egresos_en_ubicacion,
    sum(l.cantidad) over (partition by eg.snapshot_origen_id) as cantidad_lote,
    l.producto_material_id,
    l.cantidad
  from egresos eg
  join lotes l
    on l.requisito_material_id = eg.requisito_material_id
   and l.obra_id is not distinct from eg.obra_id
   and l.sede = eg.sede
)
select snapshot_origen_id, requisito_material_id, obra_id, sede,
       producto_material_id, cantidad
from candidatos
where egresos_en_ubicacion = 1
  and cantidad_egreso = cantidad_lote;

insert into public.panol_stock_identidad_backup_20260812(snapshot_id, snapshot)
select s.id, to_jsonb(s)
from public.panol_obra_materiales_snapshot s
where s.id in (select snapshot_id from _panol_transferencia_producto)
   or s.id in (select snapshot_origen_id from _panol_egreso_producto_exacto)
on conflict (snapshot_id) do nothing;

update public.panol_obra_materiales_snapshot s
   set material_id = map.producto_material_id,
       requisito_material_id = map.requisito_material_id,
       descripcion = p.descripcion,
       codigo = p.codigo,
       unidad = coalesce(p.unidad_medida, s.unidad),
       proveedor = coalesce(p.proveedor, s.proveedor),
       variante = null,
       producto_asignado_at = coalesce(s.producto_asignado_at, s.created_at),
       producto_asignacion_origen = 'migracion_variante',
       updated_at = now()
  from _panol_transferencia_producto map
  join public.panol_materiales p on p.id = map.producto_material_id
 where s.id = map.snapshot_id;

insert into public.panol_stock_regularizaciones_identidad(
  clave, tipo, requisito_material_id, producto_material_id, cantidad,
  snapshot_origen_id, detalle
)
select
  'transferencia-variante:' || map.snapshot_id::text,
  'transferencia_variante', map.requisito_material_id,
  map.producto_material_id, greatest(abs(coalesce(s.cantidad, 0)), 0.000001),
  map.snapshot_id, 'Identidad recuperada desde la nota Variante del movimiento'
from _panol_transferencia_producto map
join public.panol_obra_materiales_snapshot s on s.id = map.snapshot_id
on conflict (clave) do nothing;

do $$
declare
  v_egreso record;
  v_asignacion record;
  v_parent_in uuid;
  v_child_out uuid;
  v_marker text;
begin
  for v_egreso in
    select distinct
      a.snapshot_origen_id, a.requisito_material_id, a.obra_id, a.sede,
      s.obra_origen_id, s.cantidad, s.cantidad_egresada, s.unidad,
      s.proveedor, s.rubro, s.precio_unitario, s.moneda,
      s.egreso_at, s.created_at, s.egreso_por, s.retirado_por,
      s.sector_destino, s.egreso_destino_obra_id, s.es_adicional,
      s.producto_asignado_at
    from _panol_egreso_producto_exacto a
    join public.panol_obra_materiales_snapshot s on s.id = a.snapshot_origen_id
  loop
    v_marker := '[regularizacion-identidad:' || v_egreso.snapshot_origen_id::text || ']';

    if not exists (
      select 1 from public.panol_stock_regularizaciones_identidad
      where clave = 'egreso-generico:' || v_egreso.snapshot_origen_id::text
    ) then
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, requisito_material_id,
        descripcion, codigo, cantidad, unidad, proveedor, rubro,
        tipo, tipo_label, precio_unitario, moneda, notas, source,
        estado, recepcion_estado, recepcion_updated_at, stock_sede,
        stock_nota, es_adicional, es_regularizacion,
        producto_asignacion_origen
      )
      select
        s.obra_id, s.obra_origen_id, s.material_id, s.material_id,
        p.descripcion, p.codigo,
        abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0)),
        coalesce(p.unidad_medida, s.unidad), coalesce(p.proveedor, s.proveedor), s.rubro,
        'regularizacion', 'Compensacion de identidad legacy', s.precio_unitario, s.moneda,
        v_marker, 'stock_regularizacion_identidad',
        'en_panol', 'recibido', now(), nullif(v_egreso.sede, ''),
        v_marker, coalesce(s.es_adicional, false), true, 'migracion_variante'
      from public.panol_obra_materiales_snapshot s
      join public.panol_materiales p on p.id = s.material_id
      where s.id = v_egreso.snapshot_origen_id
      returning id into v_parent_in;

      insert into public.panol_stock_regularizaciones_identidad(
        clave, tipo, requisito_material_id, cantidad, snapshot_origen_id,
        snapshot_ingreso_id, detalle
      ) values (
        'egreso-generico:' || v_egreso.snapshot_origen_id::text,
        'compensacion_egreso_generico', v_egreso.requisito_material_id,
        abs(coalesce(nullif(v_egreso.cantidad_egresada, 0), v_egreso.cantidad, 0)),
        v_egreso.snapshot_origen_id, v_parent_in,
        'Compensa el egreso generico que fue desdoblado en productos concretos'
      );
    end if;

    for v_asignacion in
      select a.*, p.descripcion, p.codigo, p.unidad_medida, p.proveedor,
             p.precio_unitario, p.moneda
      from _panol_egreso_producto_exacto a
      join public.panol_materiales p on p.id = a.producto_material_id
      where a.snapshot_origen_id = v_egreso.snapshot_origen_id
    loop
      if not exists (
        select 1 from public.panol_stock_regularizaciones_identidad
        where clave = 'egreso-producto:' || v_egreso.snapshot_origen_id::text || ':' || v_asignacion.producto_material_id::text
      ) then
        insert into public.panol_obra_materiales_snapshot(
          obra_id, obra_origen_id, material_id, requisito_material_id,
          descripcion, codigo, cantidad, unidad, proveedor,
          tipo, tipo_label, precio_unitario, moneda, notas, source,
          estado, recepcion_estado, recepcion_updated_at, stock_sede,
          stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
          sector_destino, egreso_destino_obra_id, cantidad_egresada,
          es_adicional, es_regularizacion, producto_asignado_at,
          producto_asignacion_origen
        ) values (
          v_egreso.obra_id, v_egreso.obra_origen_id,
          v_asignacion.producto_material_id, v_egreso.requisito_material_id,
          v_asignacion.descripcion, v_asignacion.codigo, v_asignacion.cantidad,
          coalesce(v_asignacion.unidad_medida, v_egreso.unidad, 'unidad'),
          coalesce(v_asignacion.proveedor, v_egreso.proveedor),
          'regularizacion', 'Egreso concreto recuperado',
          coalesce(v_asignacion.precio_unitario, v_egreso.precio_unitario),
          coalesce(v_asignacion.moneda, v_egreso.moneda),
          v_marker, 'egreso_regularizacion_identidad',
          'egresado', 'egresado', now(), nullif(v_egreso.sede, ''),
          v_marker, coalesce(v_egreso.egreso_at, v_egreso.created_at),
          v_egreso.egreso_por, v_marker, v_egreso.retirado_por,
          v_egreso.sector_destino, v_egreso.egreso_destino_obra_id,
          v_asignacion.cantidad, coalesce(v_egreso.es_adicional, false), true,
          coalesce(v_egreso.producto_asignado_at, v_egreso.created_at),
          'migracion_variante'
        ) returning id into v_child_out;

        insert into public.panol_stock_regularizaciones_identidad(
          clave, tipo, requisito_material_id, producto_material_id, cantidad,
          snapshot_origen_id, snapshot_egreso_id, detalle
        ) values (
          'egreso-producto:' || v_egreso.snapshot_origen_id::text || ':' || v_asignacion.producto_material_id::text,
          'egreso_producto_concreto', v_egreso.requisito_material_id,
          v_asignacion.producto_material_id, v_asignacion.cantidad,
          v_egreso.snapshot_origen_id, v_child_out,
          'Desglose exacto del egreso generico segun el lote transferido'
        );
      end if;
    end loop;
  end loop;
end $$;

-- Reasigna al SKU concreto el saldo historico que quedo en su requisito padre.
-- Solo actua sobre productos creados por la migracion de variantes y hasta el
-- deficit global comprobado. Los casos sin respaldo quedan para conteo fisico.
do $$
declare
  v_producto record;
  v_destino record;
  v_origen record;
  v_restante numeric;
  v_destino_restante numeric;
  v_tomar numeric;
  v_parent_out uuid;
  v_child_in uuid;
  v_marker text;
begin
  for v_producto in
    with ledger as (
      select s.material_id,
             public.panol_stock_movimiento_delta(
               s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
             ) as delta
      from public.panol_obra_materiales_snapshot s
    ), saldos as (
      select material_id, sum(delta) as saldo
      from ledger group by material_id
    )
    select p.id as producto_id, rp.requisito_material_id,
           -ps.saldo as deficit, rs.saldo as saldo_padre
    from public.panol_requisito_productos rp
    join public.panol_materiales p on p.id = rp.producto_material_id
    join saldos ps on ps.material_id = p.id
    join saldos rs on rs.material_id = rp.requisito_material_id
    where rp.activo
      and p.origen = 'migracion_variante'
      and ps.saldo < 0
      and rs.saldo > 0
    order by -ps.saldo desc, p.descripcion
  loop
    v_restante := least(v_producto.deficit, v_producto.saldo_padre);

    for v_destino in
      select
        coalesce(s.stock_sede, e.sede, '') as sede,
        s.obra_id,
        sum(public.panol_stock_movimiento_delta(
          s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
        )) as saldo
      from public.panol_obra_materiales_snapshot s
      left join public.panol_envios e on e.id = s.panol_envio_id
      where s.material_id = v_producto.producto_id
      group by coalesce(s.stock_sede, e.sede, ''), s.obra_id
      having sum(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
      )) < 0
      order by saldo
    loop
      exit when v_restante <= 0.000001;
      v_destino_restante := least(-v_destino.saldo, v_restante);

      while v_destino_restante > 0.000001 loop
        select x.sede, x.obra_id, x.saldo
          into v_origen
        from (
          select
            coalesce(s.stock_sede, e.sede, '') as sede,
            s.obra_id,
            sum(public.panol_stock_movimiento_delta(
              s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
            )) as saldo
          from public.panol_obra_materiales_snapshot s
          left join public.panol_envios e on e.id = s.panol_envio_id
          where s.material_id = v_producto.requisito_material_id
          group by coalesce(s.stock_sede, e.sede, ''), s.obra_id
          having sum(public.panol_stock_movimiento_delta(
            s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
          )) > 0.000001
        ) x
        order by
          (x.sede = v_destino.sede and x.obra_id is not distinct from v_destino.obra_id) desc,
          (x.obra_id is null) desc,
          x.saldo desc
        limit 1;

        exit when not found;
        v_tomar := least(v_destino_restante, v_restante, v_origen.saldo);
        v_marker := '[regularizacion-producto:' || v_producto.producto_id::text || ':' || gen_random_uuid()::text || ']';

        insert into public.panol_obra_materiales_snapshot(
          obra_id, obra_origen_id, material_id, requisito_material_id,
          descripcion, codigo, cantidad, unidad, proveedor,
          tipo, tipo_label, precio_unitario, moneda, notas, source,
          estado, recepcion_estado, recepcion_updated_at, stock_sede,
          stock_nota, egreso_at, egreso_nota, cantidad_egresada,
          es_regularizacion, producto_asignacion_origen
        )
        select
          v_origen.obra_id, v_origen.obra_id, r.id, r.id,
          r.descripcion, r.codigo, v_tomar, coalesce(r.unidad_medida, 'unidad'), r.proveedor,
          'regularizacion', 'Reclasificacion a producto concreto', r.precio_unitario, r.moneda,
          v_marker, 'egreso_migracion_producto', 'egresado', 'egresado', now(),
          nullif(v_origen.sede, ''), v_marker, now(), v_marker, v_tomar,
          true, 'migracion_variante'
        from public.panol_materiales r
        where r.id = v_producto.requisito_material_id
        returning id into v_parent_out;

        insert into public.panol_obra_materiales_snapshot(
          obra_id, obra_origen_id, material_id, requisito_material_id,
          descripcion, codigo, cantidad, unidad, proveedor,
          tipo, tipo_label, precio_unitario, moneda, notas, source,
          estado, recepcion_estado, recepcion_updated_at, stock_sede,
          stock_nota, es_regularizacion, producto_asignado_at,
          producto_asignacion_origen
        )
        select
          v_destino.obra_id, v_origen.obra_id, p.id, v_producto.requisito_material_id,
          p.descripcion, p.codigo, v_tomar, coalesce(p.unidad_medida, 'unidad'), p.proveedor,
          'regularizacion', 'Stock de producto concreto', p.precio_unitario, p.moneda,
          v_marker, 'stock_migracion_producto', 'en_panol', 'recibido', now(),
          nullif(v_destino.sede, ''), v_marker, true, now(), 'migracion_variante'
        from public.panol_materiales p
        where p.id = v_producto.producto_id
        returning id into v_child_in;

        insert into public.panol_stock_regularizaciones_identidad(
          clave, tipo, requisito_material_id, producto_material_id, cantidad,
          snapshot_ingreso_id, snapshot_egreso_id, detalle
        ) values (
          'saldo-producto:' || v_child_in::text,
          'reclasificacion_saldo', v_producto.requisito_material_id,
          v_producto.producto_id, v_tomar, v_child_in, v_parent_out,
          'Traslada saldo del requisito al SKU concreto sin cambiar el stock total'
        );

        v_destino_restante := v_destino_restante - v_tomar;
        v_restante := v_restante - v_tomar;
      end loop;
    end loop;
  end loop;
end $$;

-- Los egresos directos ahora requieren un producto concreto y disponibilidad
-- suficiente en la sede/obra exacta. La validacion corre dentro de la misma
-- transaccion y se serializa por producto y ubicacion.
create or replace function public.panol_egresar_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_id uuid default null,
  p_destino_obra_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_es_adicional boolean default false,
  p_variante text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material public.panol_materiales%rowtype;
  v_material_id uuid := p_material_id;
  v_requisito_id uuid;
  v_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_available numeric;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_id is null then raise exception 'Elegí un producto del catálogo antes de egresarlo'; end if;
  if v_sede is null then raise exception 'Elegí la sede de origen'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;

  if nullif(btrim(coalesce(p_variante, '')), '') is not null then
    select rp.producto_material_id into v_material_id
    from public.panol_requisito_productos rp
    where rp.requisito_material_id = p_material_id
      and rp.activo
      and lower(btrim(rp.variante_legacy)) = lower(btrim(p_variante))
    limit 1;
    v_material_id := coalesce(v_material_id, p_material_id);
  end if;

  select * into v_material
  from public.panol_materiales
  where id = v_material_id and activo is distinct from false;
  if not found then raise exception 'Producto inexistente o inactivo'; end if;
  if v_material.es_requisito then
    raise exception 'Este registro es un requisito genérico. Elegí el producto concreto antes de egresarlo';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or public.can_receive_envio(v_sede, v_uid)
  ) then raise exception 'Sin permiso para egresar producto'; end if;

  select coalesce((
    select rp.requisito_material_id
    from public.panol_requisito_productos rp
    where rp.producto_material_id = v_material_id and rp.activo
    order by rp.updated_at desc limit 1
  ), v_material_id) into v_requisito_id;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', v_material_id::text, lower(v_sede), coalesce(p_obra_id::text, 'stock')), 0
  ));
  v_available := public.panol_stock_disponible_ubicacion(v_material_id, v_sede, p_obra_id);
  if p_cantidad > v_available + 0.000001 then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_available, p_cantidad;
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor, rubro,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
    sector_destino, egreso_destino_obra_id, cantidad_egresada,
    es_adicional, variante, producto_asignado_at,
    producto_asignacion_origen
  ) values (
    p_obra_id, p_obra_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor, null,
    'egreso_producto', 'Egreso manual', v_material.precio_unitario, v_material.moneda,
    v_nota, 'egreso_producto', 'egresado', 'egresado', now(), v_sede,
    v_nota, now(), v_uid, v_nota, v_retirado, v_sector,
    p_destino_obra_id, p_cantidad, coalesce(p_es_adicional, false), null,
    now(), case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text) from public;
grant execute on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text,boolean,text) to authenticated;

drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean);
drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text);

create function public.panol_transferir_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_origen_id uuid default null,
  p_obra_destino_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_es_adicional boolean default false,
  p_variante text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material public.panol_materiales%rowtype;
  v_material_id uuid := p_material_id;
  v_requisito_id uuid;
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_liberar boolean := p_obra_destino_id is null;
  v_available numeric;
  v_egreso uuid;
  v_ingreso uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_material_id is null then raise exception 'Elegí un producto del catálogo antes de transferirlo'; end if;
  if v_sede is null then raise exception 'Elegí la sede de origen'; end if;
  if p_obra_origen_id is null and p_obra_destino_id is null then
    raise exception 'Elegí una obra de origen o destino';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;

  if nullif(btrim(coalesce(p_variante, '')), '') is not null then
    select rp.producto_material_id into v_material_id
    from public.panol_requisito_productos rp
    where rp.requisito_material_id = p_material_id
      and rp.activo
      and lower(btrim(rp.variante_legacy)) = lower(btrim(p_variante))
    limit 1;
    v_material_id := coalesce(v_material_id, p_material_id);
  end if;

  select * into v_material
  from public.panol_materiales
  where id = v_material_id and activo is distinct from false;
  if not found then raise exception 'Producto inexistente o inactivo'; end if;
  if v_material.es_requisito then
    raise exception 'Este registro es un requisito genérico. Elegí el producto concreto antes de transferirlo';
  end if;
  if not (
    public.is_panol_manager(v_uid)
    or public.can_receive_envio(v_sede, v_uid)
  ) then raise exception 'Sin permiso para transferir producto'; end if;

  select coalesce((
    select rp.requisito_material_id
    from public.panol_requisito_productos rp
    where rp.producto_material_id = v_material_id and rp.activo
    order by rp.updated_at desc limit 1
  ), v_material_id) into v_requisito_id;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', v_material_id::text, lower(v_sede), coalesce(p_obra_origen_id::text, 'stock')), 0
  ));
  v_available := public.panol_stock_disponible_ubicacion(v_material_id, v_sede, p_obra_origen_id);
  if p_cantidad > v_available + 0.000001 then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_available, p_cantidad;
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, egreso_at, egreso_por, egreso_nota, retirado_por,
    egreso_destino_obra_id, cantidad_egresada, es_adicional,
    producto_asignado_at, producto_asignacion_origen
  ) values (
    p_obra_origen_id, p_obra_origen_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor,
    'transferencia', case when v_liberar then 'Liberado de obra' else 'Transferencia a obra' end,
    v_material.precio_unitario, v_material.moneda, v_nota,
    'transferencia_egreso', 'egresado', 'egresado', now(), v_sede,
    v_nota, now(), v_uid, v_nota, v_retirado,
    p_obra_destino_id, p_cantidad, coalesce(p_es_adicional, false),
    now(), case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_egreso;

  insert into public.panol_obra_materiales_snapshot(
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, precio_unitario, moneda, notas, source,
    estado, recepcion_estado, recepcion_updated_at, stock_sede,
    stock_nota, es_adicional, producto_asignado_at,
    producto_asignacion_origen
  ) values (
    p_obra_destino_id, p_obra_origen_id, v_material_id, v_requisito_id,
    v_material.descripcion, coalesce(v_material.codigo, nullif(btrim(coalesce(p_codigo, '')), '')),
    p_cantidad, coalesce(v_material.unidad_medida, nullif(btrim(coalesce(p_unidad, '')), ''), 'unidad'),
    v_material.proveedor,
    case when v_liberar then 'stock_general' else 'transferencia' end,
    case when v_liberar then 'Liberado a stock' else 'Transferencia recibida' end,
    v_material.precio_unitario, v_material.moneda, v_nota,
    'transferencia_ingreso', 'en_panol', 'recibido', now(), v_sede,
    v_nota, coalesce(p_es_adicional, false), now(),
    case when v_requisito_id <> v_material_id then 'panol' else null end
  ) returning id into v_ingreso;

  return jsonb_build_object('egreso_id', v_egreso, 'ingreso_id', v_ingreso);
end;
$$;

grant execute on function public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,boolean,text) to authenticated;

drop function if exists public.panol_egresar_obra_materiales(uuid[],text,text,text);

create or replace function public.panol_egresar_obra_materiales(
  p_snapshot_ids uuid[],
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null,
  p_destino_obra_id uuid default null,
  p_cantidades jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int := 0;
  v_row record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
  v_raw_qty text;
  v_qty numeric;
  v_available numeric;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if array_length(p_snapshot_ids, 1) is null then return 0; end if;

  for v_row in
    select s.*, e.sede as envio_sede, m.es_requisito
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    left join public.panol_materiales m on m.id = s.material_id
    where s.id = any(p_snapshot_ids)
    order by s.id
    for update of s
  loop
    if not (
      public.is_panol_manager(v_uid)
      or public.can_receive_envio(coalesce(v_row.envio_sede, v_row.stock_sede), v_uid)
    ) then raise exception 'Sin permiso para egresar uno o más materiales'; end if;
    if v_row.es_requisito then
      raise exception 'El material % requiere elegir un producto concreto antes de egresarlo', v_row.descripcion;
    end if;
    if public.panol_stock_movimiento_delta(
      v_row.source, v_row.estado, v_row.recepcion_estado,
      v_row.cantidad, v_row.cantidad_egresada
    ) <= 0 then
      raise exception 'El material % no tiene stock disponible en este renglón', v_row.descripcion;
    end if;

    v_available := greatest(coalesce(v_row.cantidad, 0), 0);
    v_raw_qty := p_cantidades ->> v_row.id::text;
    if v_raw_qty is null then
      v_qty := v_available;
    elsif replace(v_raw_qty, ',', '.') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_qty := replace(v_raw_qty, ',', '.')::numeric;
    else
      raise exception 'Cantidad inválida para %', v_row.descripcion;
    end if;
    if v_qty <= 0 or v_qty > v_available + 0.000001 then
      raise exception 'Stock insuficiente para %. Disponible: %, solicitado: %', v_row.descripcion, v_available, v_qty;
    end if;

    if v_qty >= v_available - 0.000001 then
      update public.panol_obra_materiales_snapshot
         set estado = 'egresado',
             obra_origen_id = coalesce(obra_origen_id, obra_id),
             obra_id = coalesce(p_destino_obra_id, obra_id),
             egreso_destino_obra_id = p_destino_obra_id,
             egreso_at = now(), egreso_por = v_uid, egreso_nota = v_nota,
             retirado_por = v_retirado, sector_destino = v_sector,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_available,
             updated_at = now()
       where id = v_row.id;
    else
      update public.panol_obra_materiales_snapshot
         set cantidad = v_available - v_qty,
             cantidad_egresada = coalesce(cantidad_egresada, 0) + v_qty,
             updated_at = now()
       where id = v_row.id;

      -- Es una fila de historial: el descuento ya ocurrió al reducir la fila
      -- original. Por eso su source deliberadamente no comienza con `egreso`.
      insert into public.panol_obra_materiales_snapshot(
        obra_id, obra_origen_id, material_id, requisito_material_id,
        descripcion, codigo, cantidad, unidad, proveedor, rubro,
        tipo, tipo_label, precio_unitario, moneda, notas, source, orden,
        estado, purchase_request_id, purchase_request_item_id,
        panol_envio_id, panol_envio_item_id, recepcion_estado,
        recepcion_cantidad_recibida, recepcion_nota, recepcion_updated_at,
        egreso_at, egreso_por, egreso_nota, retirado_por, sector_destino,
        egreso_destino_obra_id, cantidad_egresada, stock_sede, stock_nota,
        es_adicional, producto_asignado_at, producto_asignado_por,
        producto_asignacion_origen
      ) values (
        coalesce(p_destino_obra_id, v_row.obra_id),
        coalesce(v_row.obra_origen_id, v_row.obra_id),
        v_row.material_id, coalesce(v_row.requisito_material_id, v_row.material_id),
        v_row.descripcion, v_row.codigo, v_qty, v_row.unidad, v_row.proveedor, v_row.rubro,
        v_row.tipo, v_row.tipo_label, v_row.precio_unitario, v_row.moneda,
        v_row.notas, 'historial_retiro_parcial', v_row.orden, 'egresado',
        v_row.purchase_request_id, v_row.purchase_request_item_id,
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egresado',
        v_qty::text, v_row.recepcion_nota, now(), now(), v_uid, v_nota,
        v_retirado, v_sector, p_destino_obra_id, v_qty,
        v_row.stock_sede, v_row.stock_nota, coalesce(v_row.es_adicional, false),
        v_row.producto_asignado_at, v_row.producto_asignado_por,
        v_row.producto_asignacion_origen
      );
    end if;

    v_count := v_count + 1;
    if v_row.panol_envio_id is not null then
      insert into public.panol_envio_eventos(
        envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
      ) values (
        v_row.panol_envio_id, v_row.panol_envio_item_id, 'egreso_material',
        v_row.estado, 'egresado',
        concat_ws(' - ', v_nota, case when p_destino_obra_id is not null then 'Reasignado' end),
        v_uid
      );
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.panol_egresar_obra_materiales(uuid[],text,text,text,uuid,jsonb) from public;
grant execute on function public.panol_egresar_obra_materiales(uuid[],text,text,text,uuid,jsonb) to authenticated;

commit;
