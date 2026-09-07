-- ¿Cuánto sale un barco? — diagnóstico de cobertura de precios
--
-- Todo lo de acá es SOLO LECTURA: no modifica nada, se puede correr tranquilo
-- en el editor SQL de Supabase. Correr las cuatro consultas por separado.
--
-- Para qué: la pantalla de Costos de Materiales ya sabe multiplicar cantidad
-- por precio y sumar por rubro. Lo que no sabe es qué hacer con un material sin
-- precio, así que el total que muestra vale exactamente lo que valga la
-- cobertura. Estas consultas dicen cuánta hay, cuánta se puede completar sola,
-- y qué queda para cargar a mano.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COBERTURA HOY, POR MODELO
--
-- De los materiales que llevan cantidad en cada barco, cuántos tienen precio.
-- El porcentaje es el margen de error del costo que muestra hoy la pantalla.
-- ─────────────────────────────────────────────────────────────────────────────
with bom as (
  select
    mm.modelo,
    mm.material_id,
    case
      when mm.cantidad::text ~ '^[0-9]+([.,][0-9]+)?$'
      then replace(mm.cantidad::text, ',', '.')::numeric
    end as cantidad
  from public.panol_material_modelo mm
),
con_precio as (
  select
    b.modelo,
    b.material_id,
    b.cantidad,
    (m.precio_unitario is not null and m.precio_unitario > 0) as tiene_precio
  from bom b
  join public.panol_materiales m on m.id = b.material_id
  where b.cantidad > 0
    and coalesce(m.activo, true)
)
select
  'K' || modelo                                              as barco,
  count(*)                                                   as materiales,
  count(*) filter (where tiene_precio)                       as con_precio,
  count(*) filter (where not tiene_precio)                   as sin_precio,
  round(100.0 * count(*) filter (where tiene_precio) / nullif(count(*), 0), 1) as cobertura_pct
from con_precio
group by modelo
order by modelo;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CUÁNTO SE COMPLETA SOLO CON LO QUE YA SE ESCANEÓ
--
-- Los remitos que el pañol ya escaneó y ya ingresó al stock traen el precio
-- unitario de cada renglón Y el material al que corresponde: esa vinculación la
-- hizo una persona al confirmar el ingreso. Nunca se escribió en la lista de
-- precios. Esto cuenta cuántos materiales sin precio ya tienen ese dato
-- esperando adentro de un remito.
-- ─────────────────────────────────────────────────────────────────────────────
with bom as (
  select distinct mm.modelo, mm.material_id
  from public.panol_material_modelo mm
  where mm.cantidad::text ~ '^[0-9]+([.,][0-9]+)?$'
    and replace(mm.cantidad::text, ',', '.')::numeric > 0
),
sin_precio as (
  select b.modelo, b.material_id
  from bom b
  join public.panol_materiales m on m.id = b.material_id
  where coalesce(m.activo, true)
    and (m.precio_unitario is null or m.precio_unitario <= 0)
),
rescatables as (
  select distinct i.material_id
  from public.panol_comprobante_items i
  where i.material_id is not null
    and i.precio_unitario is not null
    and i.precio_unitario > 0
)
select
  'K' || s.modelo                                                as barco,
  count(*)                                                       as sin_precio_hoy,
  count(*) filter (where r.material_id is not null)               as se_completan_solos,
  count(*) filter (where r.material_id is null)                   as hay_que_cargarlos,
  round(100.0 * count(*) filter (where r.material_id is not null) / nullif(count(*), 0), 1) as recuperable_pct
from sin_precio s
left join rescatables r on r.material_id = s.material_id
group by s.modelo
order by s.modelo;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LOS QUE SE COMPLETAN SOLOS
--
-- Un renglón por material, con el precio del remito más nuevo. Esto es lo que
-- llenaría un backfill. Sirve para mirarlo antes de escribir nada: si los
-- precios de acá tienen sentido, el backfill es seguro.
-- ─────────────────────────────────────────────────────────────────────────────
select
  m.codigo,
  m.descripcion,
  m.unidad_medida                          as unidad,
  ult.precio_unitario                      as precio_del_remito,
  ult.moneda,
  ult.fecha,
  ult.proveedor,
  ult.veces                                as remitos_con_ese_material
from public.panol_materiales m
join lateral (
  select
    i.precio_unitario,
    coalesce(c.moneda, 'ARS')              as moneda,
    c.fecha,
    c.proveedor,
    count(*) over ()                       as veces
  from public.panol_comprobante_items i
  join public.panol_comprobantes c on c.id = i.comprobante_id
  where i.material_id = m.id
    and i.precio_unitario is not null
    and i.precio_unitario > 0
  order by c.fecha desc nulls last, i.id desc
  limit 1
) ult on true
where coalesce(m.activo, true)
  and (m.precio_unitario is null or m.precio_unitario <= 0)
  and exists (
    select 1 from public.panol_material_modelo mm
    where mm.material_id = m.id
      and mm.cantidad::text ~ '^[0-9]+([.,][0-9]+)?$'
      and replace(mm.cantidad::text, ',', '.')::numeric > 0
  )
order by ult.fecha desc nulls last;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LOS QUE HAY QUE CARGAR A MANO, POR ORDEN DE IMPORTANCIA
--
-- Sin precio no se puede ordenar por plata, así que se ordena por cantidad que
-- lleva el barco: un material del que entran 400 pesa más que uno del que entra
-- 1. Cambiá el '55' por el modelo que quieras costear.
--
-- Esta es LA lista de trabajo. No son "todos los materiales sin precio": son
-- los que le faltan al barco que querés costear, y arriba están los que más
-- mueven el total.
-- ─────────────────────────────────────────────────────────────────────────────
select
  m.codigo,
  m.descripcion,
  m.unidad_medida                                        as unidad,
  replace(mm.cantidad::text, ',', '.')::numeric          as lleva_el_barco,
  m.proveedor                                            as proveedor_sugerido
from public.panol_material_modelo mm
join public.panol_materiales m on m.id = mm.material_id
where mm.modelo::text = '55'
  and coalesce(m.activo, true)
  and (m.precio_unitario is null or m.precio_unitario <= 0)
  and mm.cantidad::text ~ '^[0-9]+([.,][0-9]+)?$'
  and replace(mm.cantidad::text, ',', '.')::numeric > 0
  and not exists (
    select 1 from public.panol_comprobante_items i
    where i.material_id = m.id and i.precio_unitario > 0
  )
order by replace(mm.cantidad::text, ',', '.')::numeric desc
limit 100;
