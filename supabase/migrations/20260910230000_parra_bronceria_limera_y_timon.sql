-- Broncería de Parra: bujes de limera, bujes de eje y brazos de timón.
--
-- Cuatro presupuestos del 24/07/2026 (remitos 58706 a 58711), uno por barco:
-- 55-4, 52-25, 37-42 y 37-43. Los cuatro totales cierran al centavo contra la
-- suma de sus renglones, así que la lectura del papel no está en discusión.
--
-- Lo que trae de nuevo esta carga, además de los precios:
--
-- 1. EL BRONCE SE COTIZA POR PESO. Parra factura los bujes de bronce a USD
--    29/kg —el mismo número en los cuatro papeles— y el precio de la pieza sale
--    de multiplicar por lo que pesa. Hasta hoy no había un solo material en kg
--    en las 1.886 fichas del catálogo: todo era "por unidad". Se agregan dos
--    columnas para que ese cálculo quede guardado y no en la cabeza de nadie.
--
--    El costeo NO cambia: se sigue guardando precio_unitario ya calculado. La
--    diferencia es que cuando Parra mueva el kg, actualizar las cinco piezas es
--    un UPDATE sobre precio_kg en vez de una arqueología por los remitos.
--
--    Ojo con la exactitud: el MISMO buje 75x45 pesó 8,000 / 8,200 / 7,900 kg en
--    tres barcos. Es pieza fundida. El precio de línea es una estimación con el
--    peso nominal (±3%); el peso real de cada barco queda en su propia obra.
--
-- 2. EL K37 ESTABA CONTANDO DOBLE. Siete materiales tenían fila `standard` Y
--    fila `linea_eje`, con la MISMA cantidad en las dos. No es que unos vayan en
--    una variante y otros en otra: los siete ya son parte del paquete de 28
--    ítems de línea de eje (bocina, sello PSS, hélices, escape de 5", cilindro y
--    bomba de dirección, ánodos), y el paquete entero sólo existe si el barco
--    lleva eje. El K37 estándar lleva pata o dentro-fuera: sin eje, sin timón y
--    sin escape húmedo. Las siete filas `standard` son una carga escrita dos
--    veces y se van.
--
-- 3. DOS MATERIALES SE DAN DE BAJA:
--    · "Buje de bronce y goma para eje 2 1/4"" (120 USD) es en realidad los dos
--      cutless que el remito desglosa a 439 y 456. Dejarlo vivo y agregar los dos
--      reales haría que el K37 llevara seis bujes en vez de tres.
--    · "Buje de bronce 60mm ext x 40mm int" (70 USD) no aparece en ningún
--      remito. Los bujes de bronce que Parra factura son 75x45, 90x55 y 120x40.
--
--    Ninguno de los dos tiene egresos, pedidos ni envíos: sus 14 filas de obra
--    están todas en "pendiente" con cantidad_egresada = 0.

begin;

-- ── 1. El peso, para que el precio del kg sea un dato y no una anécdota ────

alter table public.panol_materiales
  add column if not exists peso_kg numeric,
  add column if not exists precio_kg numeric;

comment on column public.panol_materiales.peso_kg is
  'Peso nominal de la pieza en kg, para los materiales que el proveedor cotiza por peso. Es nominal: una pieza fundida varía entre unidades.';
comment on column public.panol_materiales.precio_kg is
  'Precio por kg con el que se calculó precio_unitario. En la misma moneda que el material. Cuando el proveedor mueve el kg, se actualiza acá y se recalcula precio_unitario = peso_kg * precio_kg.';

-- ── 2. Depuración del K37: fuera las siete filas standard duplicadas ───────
-- Se borra sólo lo que tiene su gemela en linea_eje con la misma cantidad. Si
-- alguna difiere, queda y se ve en la verificación del final.

delete from public.panol_material_modelo std
 where std.modelo = '37'
   and std.variante = 'standard'
   and exists (
     select 1 from public.panol_material_modelo eje
      where eje.material_id = std.material_id
        and eje.modelo = '37'
        and eje.variante = 'linea_eje'
        and eje.cantidad = std.cantidad
   );

-- ── 3. Baja de los dos materiales que quedaron obsoletos ──────────────────

update public.panol_materiales
   set activo = false,
       notas = trim(both E'\n' from coalesce(notas || E'\n', '') ||
         case descripcion
           when 'Buje de bronce y goma para eje 2 1/4"' then
             'Baja 10/09/2026: era un renglón único a 120 USD que en realidad son dos piezas distintas. Los remitos 58707 y 58708 de Parra las desglosan como buje de goma 2 1/4" x 2 15/16" (439 USD) y 2 1/4" x 3 3/8" (456 USD). Reemplazado por esos dos.'
           else
             'Baja 10/09/2026: no aparece en ningún remito de Parra. Los bujes de bronce que factura son 75x45 (limera K37/K52), 90x55 (limera K55) y 120x40 (tuerca de hélice K55).'
         end)
 where descripcion in ('Buje de bronce y goma para eje 2 1/4"', 'Buje de bronce 60mm ext x 40mm int')
   and activo;

delete from public.panol_material_modelo
 where material_id in (
   select id from public.panol_materiales
    where descripcion in ('Buje de bronce y goma para eje 2 1/4"', 'Buje de bronce 60mm ext x 40mm int')
 );

-- Las filas de obra sólo se borran si nunca se movieron y si el barco sigue en
-- curso. Una fila con egreso es historia; la lista de un barco terminado,
-- también. 37-38 y 37-39 están terminadas: se las deja como están, aunque su
-- renglón apunte a un material que a partir de ahora figura de baja.
delete from public.panol_obra_materiales_snapshot s
 using public.produccion_obras o
 where s.obra_id = o.id
   and s.material_id in (
     select id from public.panol_materiales
      where descripcion in ('Buje de bronce y goma para eje 2 1/4"', 'Buje de bronce 60mm ext x 40mm int')
   )
   and s.estado = 'pendiente'
   and coalesce(s.cantidad_egresada, 0) = 0
   and o.estado <> 'terminada';

-- ── 4. Alta de los ocho materiales nuevos ─────────────────────────────────
-- precio_unitario de los bujes de bronce = peso_kg * 29. De los de goma y los
-- brazos, el precio por unidad tal cual lo escribe el remito.

with nuevos(descripcion, peso_kg, precio_kg, precio_unitario, notas) as (
  values
    ('Buje de bronce 75x45 para limera',            8.0::numeric,  29::numeric, 232.00::numeric,
     'Se cotiza por peso: 8,0 kg nominales x USD 29/kg. Pieza fundida, pesó 8,000 / 8,200 / 7,900 kg en 37-42, 52-25 y 37-43.'),
    ('Buje de bronce 90x55 para limera',            11.0::numeric, 29::numeric, 319.00::numeric,
     'Se cotiza por peso: 11,0 kg nominales x USD 29/kg. El remito 58711 factura los dos juntos: 22,000 kg = USD 638.'),
    ('Buje de bronce 120x40 para tuerca de hélice', 26.4::numeric, 29::numeric, 765.60::numeric,
     'Se cotiza por peso: 26,400 kg x USD 29/kg.'),
    ('Juego de brazo de timón y horquilla 2"',      null,          null,        198.00::numeric, null),
    ('Juego de brazo de timón y horquilla 2 1/2"',  null,          null,        330.00::numeric, null),
    ('Buje de goma 2 1/4" x 2 15/16"',              null,          null,        439.00::numeric, null),
    ('Buje de goma 2 1/4" x 3 3/8"',                null,          null,        456.00::numeric, null),
    ('Buje de goma 2 1/2" x 3 3/8"',                null,          null,        669.00::numeric,
     'El remito 58706 trae dos renglones con esta misma descripción a precio distinto: dos a USD 669 c/u y uno a USD 604. La diferencia no está explicada en el papel; se costea a 669 y el renglón de 604 quedó cargado tal cual en la obra 52-25.')
)
insert into public.panol_materiales (
  categoria_id, proveedor_id, proveedor, descripcion, unidad_medida,
  precio_unitario, moneda, peso_kg, precio_kg, origen, revisado, activo, notas
)
select
  (select id from public.panol_categorias where nombre = 'Broncería' limit 1),
  (select id from public.panol_proveedores where nombre = 'Parra' limit 1),
  'Parra', n.descripcion, 'unidad',
  n.precio_unitario, 'USD', n.peso_kg, n.precio_kg, 'parra_jul2026', true, true, n.notas
from nuevos n
where not exists (
  select 1 from public.panol_materiales m where m.descripcion = n.descripcion
);

-- El buje de 2 3/4" ya estaba en el catálogo y en la matriz del K55 con la
-- cantidad correcta (3). Lo único que le faltaba era el precio, y la moneda
-- estaba en ARS siendo que Parra cotiza en dólares.
update public.panol_materiales
   set precio_unitario = 701.00,
       moneda = 'USD'
 where descripcion = 'Bujes de bronce y goma para eje de 2 3/4"';

-- ── 5. Historial de precios, con fecha y remito ───────────────────────────
-- Van a panol_precios y no sueltos en la ficha: así el costo del barco los
-- marca "firme" y no "sin dato", y dentro de un año se sabe de dónde salieron.

with precios(descripcion, precio, remito) as (
  values
    ('Buje de bronce 75x45 para limera',            232.00::numeric, '58707 / 58708 / 58706'),
    ('Buje de bronce 90x55 para limera',            319.00::numeric, '58711'),
    ('Buje de bronce 120x40 para tuerca de hélice', 765.60::numeric, '58711'),
    ('Juego de brazo de timón y horquilla 2"',      198.00::numeric, '58706 / 58707 / 58708'),
    ('Juego de brazo de timón y horquilla 2 1/2"',  330.00::numeric, '58711'),
    ('Buje de goma 2 1/4" x 2 15/16"',              439.00::numeric, '58707 / 58708'),
    ('Buje de goma 2 1/4" x 3 3/8"',                456.00::numeric, '58707 / 58708'),
    ('Buje de goma 2 1/2" x 3 3/8"',                669.00::numeric, '58706'),
    ('Bujes de bronce y goma para eje de 2 3/4"',   701.00::numeric, '58711')
)
insert into public.panol_precios (
  material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente
)
select m.id, p.precio, 'USD', date '2026-07-24', 'Parra',
       (select id from public.panol_proveedores where nombre = 'Parra' limit 1),
       'presupuesto · remito ' || p.remito
from precios p
join public.panol_materiales m on m.descripcion = p.descripcion
where not exists (
  select 1 from public.panol_precios pp
   where pp.material_id = m.id
     and pp.fecha = date '2026-07-24'
     and pp.proveedor = 'Parra'
);

-- ── 6. La matriz de cada línea ────────────────────────────────────────────
-- El K37 entra TODO como linea_eje: un K37 con pata no lleva eje ni timón, así
-- que ni los bujes ni los brazos ni la limera existen en el barco estándar.
-- El K52 y el K55 lo llevan siempre, así que van como standard.
--
-- El buje de limera es 1 por barco en K37 y K52. En el K55 son 2, como los
-- factura el remito 58711 junto a los 2 juegos de brazo de timón.

with matriz(descripcion, modelo, variante, cantidad) as (
  values
    -- K37 · sólo si el barco es de línea de eje
    ('Buje de goma 2 1/4" x 2 15/16"',              '37', 'linea_eje', 2::numeric),
    ('Buje de goma 2 1/4" x 3 3/8"',                '37', 'linea_eje', 1::numeric),
    ('Juego de brazo de timón y horquilla 2"',      '37', 'linea_eje', 2::numeric),
    ('Buje de bronce 75x45 para limera',            '37', 'linea_eje', 1::numeric),
    -- K52 · siempre
    ('Buje de goma 2 1/2" x 3 3/8"',                '52', 'standard',  3::numeric),
    ('Juego de brazo de timón y horquilla 2"',      '52', 'standard',  2::numeric),
    ('Buje de bronce 75x45 para limera',            '52', 'standard',  1::numeric),
    -- K55 · siempre
    ('Buje de bronce 90x55 para limera',            '55', 'standard',  2::numeric),
    ('Juego de brazo de timón y horquilla 2 1/2"',  '55', 'standard',  2::numeric),
    ('Buje de bronce 120x40 para tuerca de hélice', '55', 'standard',  1::numeric)
)
insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
select m.id, x.modelo, x.variante, x.cantidad
from matriz x
join public.panol_materiales m on m.descripcion = x.descripcion
on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;

-- ── 7. El consumo real de cada obra ───────────────────────────────────────
-- La lista de una obra está congelada: cambiar la matriz no la toca. Así que
-- los renglones se escriben obra por obra.
--
-- Los cuatro barcos con remito llevan el número EXACTO del papel, incluido el
-- peso real de su buje de limera. Los otros tres K37 de línea de eje que siguen
-- activos -37-40, 37-41 y 37-44- llevan el precio nominal de la matriz: no
-- tienen remito de Parra, pero tenían cargado el buje viejo que se acaba de dar
-- de baja y quedarían con menos material del que el barco necesita.
--
-- 37-38 y 37-39 no entran: están terminadas. Meterles material pendiente sería
-- inventarles una necesidad que ya no tienen.
--
-- Entran como "pendiente", igual que el resto de su matriz. NO se marcan como
-- egresadas: para eso el sistema pide quién retiró, y ese dato no está en el
-- remito. Un egreso sin persona es un adorno, no un registro.

with obras_items(codigo, descripcion, cantidad, precio, nota) as (
  values
    -- 37-42 · remito 58707 · total USD 1.962,00
    ('37-42', 'Buje de goma 2 1/4" x 2 15/16"',              2::numeric, 439.00::numeric, 'Remito Parra 58707 del 24/07/2026.'),
    ('37-42', 'Buje de goma 2 1/4" x 3 3/8"',                1::numeric, 456.00::numeric, 'Remito Parra 58707 del 24/07/2026.'),
    ('37-42', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, 'Remito Parra 58707 del 24/07/2026.'),
    ('37-42', 'Buje de bronce 75x45 para limera',            1::numeric, 232.00::numeric, 'Remito Parra 58707 del 24/07/2026. Peso real 8,000 kg x USD 29/kg.'),
    -- 37-43 · remito 58708 · total USD 1.959,10
    ('37-43', 'Buje de goma 2 1/4" x 2 15/16"',              2::numeric, 439.00::numeric, 'Remito Parra 58708 del 24/07/2026.'),
    ('37-43', 'Buje de goma 2 1/4" x 3 3/8"',                1::numeric, 456.00::numeric, 'Remito Parra 58708 del 24/07/2026.'),
    ('37-43', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, 'Remito Parra 58708 del 24/07/2026.'),
    ('37-43', 'Buje de bronce 75x45 para limera',            1::numeric, 229.10::numeric, 'Remito Parra 58708 del 24/07/2026. Peso real 7,900 kg x USD 29/kg.'),
    -- 52-25 · remito 58706 · total USD 2.575,80
    ('52-25', 'Buje de goma 2 1/2" x 3 3/8"',                2::numeric, 669.00::numeric, 'Remito Parra 58706 del 24/07/2026.'),
    ('52-25', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, 'Remito Parra 58706 del 24/07/2026.'),
    ('52-25', 'Buje de bronce 75x45 para limera',            1::numeric, 237.80::numeric, 'Remito Parra 58706 del 24/07/2026. Peso real 8,200 kg x USD 29/kg.'),
    -- 55-4 · remito 58711 · total USD 4.166,60 (los 3 bujes de 2 3/4" ya estaban cargados)
    ('55-4',  'Buje de bronce 90x55 para limera',            2::numeric, 319.00::numeric, 'Remito Parra 58711 del 24/07/2026. Los dos pesaron 22,000 kg x USD 29/kg.'),
    ('55-4',  'Juego de brazo de timón y horquilla 2 1/2"',  2::numeric, 330.00::numeric, 'Remito Parra 58711 del 24/07/2026.'),
    ('55-4',  'Buje de bronce 120x40 para tuerca de hélice', 1::numeric, 765.60::numeric, 'Remito Parra 58711 del 24/07/2026. Peso real 26,400 kg x USD 29/kg.'),
    -- Los otros tres K37 de línea de eje que siguen activos, a precio de matriz
    ('37-40', 'Buje de goma 2 1/4" x 2 15/16"',              2::numeric, 439.00::numeric, null),
    ('37-40', 'Buje de goma 2 1/4" x 3 3/8"',                1::numeric, 456.00::numeric, null),
    ('37-40', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, null),
    ('37-40', 'Buje de bronce 75x45 para limera',            1::numeric, 232.00::numeric, null),
    ('37-41', 'Buje de goma 2 1/4" x 2 15/16"',              2::numeric, 439.00::numeric, null),
    ('37-41', 'Buje de goma 2 1/4" x 3 3/8"',                1::numeric, 456.00::numeric, null),
    ('37-41', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, null),
    ('37-41', 'Buje de bronce 75x45 para limera',            1::numeric, 232.00::numeric, null),
    ('37-44', 'Buje de goma 2 1/4" x 2 15/16"',              2::numeric, 439.00::numeric, null),
    ('37-44', 'Buje de goma 2 1/4" x 3 3/8"',                1::numeric, 456.00::numeric, null),
    ('37-44', 'Juego de brazo de timón y horquilla 2"',      2::numeric, 198.00::numeric, null),
    ('37-44', 'Buje de bronce 75x45 para limera',            1::numeric, 232.00::numeric, null)
)
, a_insertar as (
  select o.id as obra_id, o.codigo, m.id as material_id, m.descripcion,
         x.cantidad, x.precio, x.nota,
         row_number() over (partition by o.id order by m.descripcion) as n
  from obras_items x
  join public.produccion_obras o on o.codigo = x.codigo
  join public.panol_materiales m on m.descripcion = x.descripcion
  where not exists (
    select 1 from public.panol_obra_materiales_snapshot s
     where s.obra_id = o.id and s.material_id = m.id
  )
)
insert into public.panol_obra_materiales_snapshot (
  obra_id, material_id, requisito_material_id, descripcion, cantidad, unidad,
  proveedor, rubro, tipo, tipo_label, precio_unitario, moneda,
  source, estado, es_adicional, tipo_pedido, notas, orden
)
select
  b.obra_id, b.material_id, b.material_id, b.descripcion, b.cantidad, 'unidad',
  'Parra', 'Broncería',
  case when b.codigo like '37-%' then 'linea_eje' else 'base' end,
  case when b.codigo like '37-%' then 'Línea eje' else 'Base' end,
  b.precio, 'USD',
  'matriz', 'pendiente', false, 'estandar', b.nota,
  coalesce((select max(s2.orden) from public.panol_obra_materiales_snapshot s2
             where s2.obra_id = b.obra_id), 0) + b.n * 10
from a_insertar b;

-- El renglón suelto del remito 58706: una unidad a USD 604 en vez de 669, con
-- la misma descripción escrita en el papel. No se inventa una medida que no se
-- lee; se carga como lo que es, un renglón aparte al precio que se pagó, para
-- que el costo de la 52-25 dé exactamente los USD 2.575,80 del remito.
insert into public.panol_obra_materiales_snapshot (
  obra_id, material_id, requisito_material_id, descripcion, cantidad, unidad,
  proveedor, rubro, tipo, tipo_label, precio_unitario, moneda,
  source, estado, es_adicional, tipo_pedido, notas, orden
)
select o.id, m.id, m.id, m.descripcion, 1, 'unidad',
       'Parra', 'Broncería', 'base', 'Base', 604.00, 'USD',
       'matriz', 'pendiente', false, 'estandar',
       'Remito Parra 58706 del 24/07/2026. Segundo renglón del mismo papel: una unidad a USD 604 mientras las otras dos van a USD 669. El remito no explica la diferencia; posiblemente sea otra medida mal transcripta. Verificar contra el original.',
       coalesce((select max(s2.orden) from public.panol_obra_materiales_snapshot s2 where s2.obra_id = o.id), 0) + 10
from public.produccion_obras o
cross join public.panol_materiales m
where o.codigo = '52-25'
  and m.descripcion = 'Buje de goma 2 1/2" x 3 3/8"'
  and not exists (
    select 1 from public.panol_obra_materiales_snapshot s
     where s.obra_id = o.id and s.material_id = m.id and s.precio_unitario = 604.00
  );

-- La 55-4 ya tenía los 3 bujes de 2 3/4" cargados, sin precio y en ARS.
update public.panol_obra_materiales_snapshot s
   set precio_unitario = 701.00,
       moneda = 'USD',
       notas = 'Remito Parra 58711 del 24/07/2026.'
  from public.produccion_obras o, public.panol_materiales m
 where s.obra_id = o.id
   and s.material_id = m.id
   and o.codigo = '55-4'
   and m.descripcion = 'Bujes de bronce y goma para eje de 2 3/4"'
   and s.precio_unitario is null;

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Cada obra con remito tiene que dar el total de su papel. Si alguna línea no
-- cierra, la carga quedó mal y se ve acá mismo.
--
--   37-42 -> 1962.00      52-25 -> 2575.80
--   37-43 -> 1959.10      55-4  -> 4166.60

select o.codigo,
       sum(s.cantidad * s.precio_unitario) as total_parra_usd,
       case o.codigo when '37-42' then 1962.00 when '37-43' then 1959.10
                     when '52-25' then 2575.80 when '55-4'  then 4166.60 end as segun_remito
  from public.panol_obra_materiales_snapshot s
  join public.produccion_obras o on o.id = s.obra_id
 where s.proveedor = 'Parra'
   and o.codigo in ('37-42', '37-43', '52-25', '55-4')
 group by o.codigo
 order by o.codigo;

-- El K37 no debe tener ni una fila standard duplicada con su linea_eje.
select count(*) as duplicados_k37_restantes
  from public.panol_material_modelo std
 where std.modelo = '37' and std.variante = 'standard'
   and exists (select 1 from public.panol_material_modelo eje
                where eje.material_id = std.material_id
                  and eje.modelo = '37' and eje.variante = 'linea_eje');
