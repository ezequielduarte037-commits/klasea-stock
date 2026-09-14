-- Las tuercas de limera y de hélice pasan a medirse por METRO.
--
-- Se cargaron como "1 unidad" y eso escondía el dato que más importa: cuánto
-- material lleva cada una. Parra no entrega una pieza terminada, entrega un
-- pedazo de barra para tornear, y sin el largo el pedido no se puede cotizar ni
-- cortar. El largo estaba en el sistema, pero en prosa dentro de las notas de la
-- ficha, que es como no estar: no lo ve la matriz, ni la lista de la obra, ni
-- Compras.
--
-- Con la unidad en metro el largo viaja solo a todos lados, porque la cantidad
-- es el largo.
--
-- LOS NÚMEROS SALEN DEL PESO, NO DE UNA ESTIMACIÓN. Cada barra tiene su peso en
-- el remito 58713 y su sección sale de los diámetros, así que el largo es una
-- cuenta cerrada (bronce 8,8 g/cm³):
--
--   130x50 · 32,300 kg → barra de 325 mm ÷ 5 obras = 65 mm por barco
--   150x60 · 37,800 kg → barra de 289 mm ÷ 2 obras = 145 mm por barco
--
-- Los dos coinciden con los milímetros que pasó Ezequiel, que es la
-- confirmación cruzada que hacía falta para animarse a cambiar la unidad.
--
-- EL PRECIO PASA A SER POR METRO, y se deriva del mismo lado:
--
--   130x50 → 32,300 kg / 0,325 m =  99,385 kg/m × 29 USD/kg = 2.882,15 USD/m
--   150x60 → 37,800 kg / 0,290 m = 130,345 kg/m × 29 USD/kg = 3.780,00 USD/m
--
-- Y el costo por barco queda igual que antes, que es la prueba de que esto es un
-- cambio de unidad y no un cambio de precio:
--
--   0,065 m × 2.882,15 = USD 187,34   (era 187,34)
--   0,145 m × 3.780,00 = USD 548,10   (era 548,10)
--
-- peso_kg pasa a ser kg POR METRO, para que se mantenga la regla de siempre:
-- peso_kg × precio_kg = precio_unitario. Si mañana se mueve el valor del kilo,
-- estas dos se recalculan igual que el resto de la broncería.
--
-- QUÉ NO ENTRA ACÁ:
--
--   · El buje 90x30 para tuerca de hélice. Llegó anotado como 22,5 mm, que es
--     90÷4 -y ese 90 es el diámetro exterior, no un largo-. Por peso la barra da
--     934 mm: 234 mm por obra si fueron 4, o 311 mm si cada obra se llevó un
--     buje entero de los 3 que entregó Parra. Hasta que eso se resuelva se queda
--     en unidad: mejor una unidad que un largo inventado, porque un largo
--     equivocado se convierte en una pieza mal cortada.
--
--   · Los bujes 75x45, 90x55 y 120x40, y los de goma y los brazos de timón.
--     Esos se compran por pieza terminada, no por pedazo de barra. Van por
--     unidad y así está bien.

begin;

with medidas(descripcion, largo_m, kg_por_metro, precio_por_metro) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', 0.065::numeric,  99.385::numeric, 2882.15::numeric),
    ('Buje de bronce 150x60 para tuerca de limera', 0.145::numeric, 130.345::numeric, 3780.00::numeric)
)
update public.panol_materiales m
   set unidad_medida = 'metro',
       precio_unitario = v.precio_por_metro,
       peso_kg = v.kg_por_metro,
       precio_kg = 29,
       notas = 'Se compra por largo de barra, no por pieza. Remito Parra 58713 del 24/07/2026. '
             || 'A cada barco le tocan ' || to_char(v.largo_m * 1000, 'FM990D999') || ' mm. '
             || 'El precio por metro sale del peso de la barra: ' || to_char(v.kg_por_metro, 'FM990D999')
             || ' kg/m x USD 29/kg.'
  from medidas v
 where m.descripcion = v.descripcion;

-- La matriz: la cantidad deja de ser "1 pieza" y pasa a ser el largo en metros.
with medidas(descripcion, largo_m) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', 0.065::numeric),
    ('Buje de bronce 150x60 para tuerca de limera', 0.145::numeric)
)
update public.panol_material_modelo mm
   set cantidad = v.largo_m
  from medidas v
  join public.panol_materiales m on m.descripcion = v.descripcion
 where mm.material_id = m.id;

-- El historial de precios queda con el valor nuevo y su unidad, para que dentro
-- de un año se entienda por qué un renglón dice 2.882 y no 187.
with medidas(descripcion, precio_por_metro) as (
  values
    ('Buje de bronce 130x50 para tuerca de limera', 2882.15::numeric),
    ('Buje de bronce 150x60 para tuerca de limera', 3780.00::numeric)
)
insert into public.panol_precios (
  material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente
)
select m.id, v.precio_por_metro, 'USD', date '2026-07-24', 'Parra',
       (select id from public.panol_proveedores where nombre = 'Parra' limit 1),
       'presupuesto · remito 58713 · por metro de barra'
from medidas v
join public.panol_materiales m on m.descripcion = v.descripcion
where not exists (
  select 1 from public.panol_precios pp
   where pp.material_id = m.id
     and pp.fuente like '%por metro%'
);

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- El costo por barco tiene que dar LO MISMO que antes del cambio de unidad:
-- 187,34 el de 130x50 y 548,10 el de 150x60. Si cambió, se movió un precio y
-- no sólo una unidad.

select m.descripcion,
       m.unidad_medida,
       mm.modelo,
       mm.cantidad                       as largo_m,
       m.precio_unitario                 as usd_por_metro,
       round(mm.cantidad * m.precio_unitario, 2) as usd_por_barco
  from public.panol_materiales m
  join public.panol_material_modelo mm on mm.material_id = m.id
 where m.descripcion in (
   'Buje de bronce 130x50 para tuerca de limera',
   'Buje de bronce 150x60 para tuerca de limera'
 )
 order by m.descripcion, mm.modelo;
