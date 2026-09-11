-- Broncería de Parra, segunda tanda: tuercas de limera y de hélice.
--
-- Presupuesto 0058662, remito 58713, 24/07/2026. Bronce a USD 29/kg, el mismo
-- precio que los cuatro remitos de la tanda anterior. El total del papel
-- -USD 3.381,40- cierra al centavo contra la suma de sus tres renglones.
--
-- LO QUE ESTE REMITO TIENE DE DISTINTO: acá Parra no vende una pieza por barco.
-- Vende la BARRA entera, y de esa barra salen las tuercas de varias obras. Los
-- cuatro remitos anteriores eran de un barco cada uno; éste no tiene obra:
--
--     1 buje 130x50 · 32,300 kg · USD   936,70  → rindió 5 obras
--     3 bujes 90x30 · 46,500 kg · USD 1.348,50  → rindieron 4 obras
--     1 buje 150x60 · 37,800 kg · USD 1.096,20  → rindió 2 obras
--
-- Por eso lo que se guarda como precio del material no es lo que salió la
-- barra: es LO QUE LE TOCA A CADA BARCO. Y como el modelo ya guarda peso por
-- precio del kg, la parte prorrateada entra igual de natural: el peso del
-- material es la porción de barra que consume un barco.
--
--     130x50 → 32,300 / 5 =  6,460 kg × 29 = USD 187,34
--     90x30  → 46,500 / 4 = 11,625 kg × 29 = USD 337,13
--     150x60 → 37,800 / 2 = 18,900 kg × 29 = USD 548,10
--
-- Si mañana el bronce se mueve, se actualiza precio_kg y las ocho piezas de
-- Parra se recalculan juntas, prorrateadas incluidas.
--
-- EL REPARTO ESTÁ VERIFICADO, NO SUPUESTO. Con densidad 8,8 g/cm³ el peso de
-- cada barra dice cuánto mide, y el largo por obra cae solo:
--
--     130x50 → barra de 325 mm / 5 obras =  65 mm   (Ezequiel dijo 65)
--     150x60 → barra de 289 mm / 2 obras = 145 mm   (Ezequiel dijo 145)
--     90x30  → barra de 934 mm / 4 obras = 234 mm
--
-- Los dos primeros dan clavados. El 90x30 llegó anotado como 22,5 mm, que no es
-- ni el largo de la pieza (311 mm, los 3 bujes de ~310 mm que entregó Parra) ni
-- lo que consume un barco (234 mm). Se deja asentado en la ficha: el costo por
-- barco no depende de ese número -sale del importe y de las obras que cubrió-,
-- pero la duda tiene que quedar escrita y no perdida en un chat.
--
-- COMPLETA UNA SIMETRÍA. Con esto cada línea queda con sus dos tuercas:
--
--                   tuerca de limera        tuerca de hélice
--     K37 / K52     130x50 · 187,34         90x30  · 337,13
--     K55           150x60 · 548,10         120x40 · 765,60  (ya estaba)
--
-- Ojo que "tuerca de limera" NO es el buje de limera que ya se cargó -75x45 en
-- K37/K52, 90x55 en K55-. Son piezas distintas y conviven.
--
-- NO SE CARGA CONSUMO POR OBRA. El remito no dice qué obras fueron y el dato no
-- llegó por otro lado. Adivinar cinco códigos de obra para que el número cierre
-- sería inventar historia. Queda la matriz de línea; las obras, cuando aparezcan
-- los códigos.

begin;

-- ── 1. Las tres piezas, con su parte de barra como peso ───────────────────

with nuevos(descripcion, peso_kg, precio_unitario, notas) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', 6.460::numeric, 187.34::numeric,
     'Se compra la barra entera y se reparte. Remito Parra 58713 del 24/07/2026: barra de 32,300 kg (325 mm) por USD 936,70 que rindió 5 obras. A cada barco le tocan 6,460 kg y unos 65 mm de barra.'),
    ('Buje de bronce 90x30 para tuerca de hélice', 11.625::numeric, 337.13::numeric,
     'Se compra la barra entera y se reparte. Remito Parra 58713 del 24/07/2026: 3 bujes de unos 310 mm, 46,500 kg en total, por USD 1.348,50, que rindieron 4 obras. A cada barco le tocan 11,625 kg y unos 234 mm. DUDA: el consumo llegó anotado como 22,5 mm, que no coincide ni con el largo de la pieza (311 mm) ni con lo que consume un barco (234 mm). Verificar contra el papel; no afecta el costo.'),
    ('Buje de bronce 150x60 para tuerca de limera', 18.900::numeric, 548.10::numeric,
     'Se compra la barra entera y se reparte. Remito Parra 58713 del 24/07/2026: barra de 37,800 kg (289 mm) por USD 1.096,20 que rindió 2 obras. A cada barco le tocan 18,900 kg y unos 145 mm de barra.')
)
insert into public.panol_materiales (
  categoria_id, proveedor_id, proveedor, descripcion, unidad_medida,
  precio_unitario, moneda, peso_kg, precio_kg, origen, revisado, activo, notas
)
select
  (select id from public.panol_categorias where nombre = 'Broncería' limit 1),
  (select id from public.panol_proveedores where nombre = 'Parra' limit 1),
  'Parra', n.descripcion, 'unidad',
  n.precio_unitario, 'USD', n.peso_kg, 29, 'parra_jul2026', true, true, n.notas
from nuevos n
where not exists (
  select 1 from public.panol_materiales m where m.descripcion = n.descripcion
);

-- 11,625 × 29 da 337,125. El precio queda en 337,13 porque un precio se escribe
-- en centavos; medio centavo de diferencia no mueve ningún total.

-- ── 2. Historial de precios, con su remito ────────────────────────────────

with precios(descripcion, precio) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', 187.34::numeric),
    ('Buje de bronce 90x30 para tuerca de hélice',  337.13::numeric),
    ('Buje de bronce 150x60 para tuerca de limera', 548.10::numeric)
)
insert into public.panol_precios (
  material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente
)
select m.id, p.precio, 'USD', date '2026-07-24', 'Parra',
       (select id from public.panol_proveedores where nombre = 'Parra' limit 1),
       'presupuesto · remito 58713 · prorrateado por obra'
from precios p
join public.panol_materiales m on m.descripcion = p.descripcion
where not exists (
  select 1 from public.panol_precios pp
   where pp.material_id = m.id
     and pp.fecha = date '2026-07-24'
     and pp.proveedor = 'Parra'
);

-- ── 3. La matriz de cada línea ────────────────────────────────────────────
-- Cantidad 1 = la porción que le toca a ese barco, con el costo ya prorrateado.
-- Que físicamente sean una o dos tuercas no cambia lo que gasta el barco.
--
-- En el K37 van como linea_eje, igual que todo lo de Parra: un K37 con pata o
-- dentro-fuera no tiene ni hélice sobre eje ni timón, así que no lleva ninguna
-- de las dos tuercas. En K52 y K55 van siempre.

with matriz(descripcion, modelo, variante, cantidad) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', '37', 'linea_eje', 1::numeric),
    ('Buje de bronce 90x30 para tuerca de hélice',  '37', 'linea_eje', 1::numeric),
    ('Buje de bronce 130x50 para tuerca de limera', '52', 'standard',  1::numeric),
    ('Buje de bronce 90x30 para tuerca de hélice',  '52', 'standard',  1::numeric),
    ('Buje de bronce 150x60 para tuerca de limera', '55', 'standard',  1::numeric)
)
insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
select m.id, x.modelo, x.variante, x.cantidad
from matriz x
join public.panol_materiales m on m.descripcion = x.descripcion
on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- La broncería de Parra de cada línea, después de las dos tandas. Tiene que dar:
--
--   K37 (línea de eje)  2.486,47      K52  3.159,47      K55  4.714,70

select mm.modelo,
       mm.variante,
       count(*) as items,
       sum(mm.cantidad * m.precio_unitario) as total_usd
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id
 where m.proveedor = 'Parra'
   and m.activo
 group by mm.modelo, mm.variante
 order by mm.modelo, mm.variante;

-- Y el detalle, que es lo que va al informe de Tornería.
select mm.modelo, mm.variante, m.descripcion, mm.cantidad,
       m.precio_unitario, m.peso_kg, m.precio_kg,
       mm.cantidad * m.precio_unitario as subtotal_usd
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id
 where m.proveedor = 'Parra'
   and m.activo
 order by mm.modelo, mm.variante, m.descripcion;
