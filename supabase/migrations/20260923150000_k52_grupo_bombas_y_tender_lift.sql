-- K52: grupo electrógeno genérico, bombas de achique y tender lift opcional.
--
-- 1. TENDER LIFT: no es estándar. Sale de la matriz del K52 y queda como
--    opcional de la línea ("No viene por defecto"), igual que la Parrilla
--    Grande del K37. La obra que lo lleve lo activa en su configuración. Las
--    obras no se tocan: el 52-23 y el 52-24 lo recibieron por remito y ahí sigue.
--    El precio que cargó la 20260923140000 (Trimer, USD 29.000) queda en la
--    ficha para cuando se active.
--
-- 2. GRUPO ELECTRÓGENO 9 kVA: entra como estándar, pero como requisito
--    genérico. La marca y el modelo se deciden después, igual que las cajas de
--    piso. Precio de referencia: el Kohler 9 kVA 50 Hz de la cuenta corriente de
--    Trimer (OP 186, 13/08/2025: 10 grupos por USD 157.500). El mismo precio va
--    también a la ficha del Kohler, que ya existía (lo usó el 43-29).
--
-- 3. BOMBAS DE ACHIQUE Y CAJAS DE DUCHA del presupuesto Trimer 291225-02 para el
--    K52: 4 Rule 2000 GPH, 1 Rule 3700 GPH y 2 cajas de ducha Rule 800 GPH. El
--    K52 tenía los 5 paneles Rule y ninguna bomba. El 52-26 ya recibió 2 bombas
--    de 2000 y 1 de 3700 por remito.
--
-- Agregar filas a la matriz no toca las listas de las obras: el trigger de
-- sincronización solo actualiza cantidades de lo que la obra ya tiene.

begin;

-- ─── 1. Tender lift opcional ─────────────────────────────────────────────────
insert into public.panol_matriz_condicionantes (modelo, nombre, tipo, descripcion, activo_por_defecto, orden)
values ('52', 'Tender lift', 'equipamiento', 'No es estándar: va si el cliente lo pide.', false, 10)
on conflict (modelo, nombre) do nothing;

insert into public.panol_matriz_condicionante_items (condicionante_id, material_id, descripcion, cantidad, unidad, tipo_item, orden)
select c.id, 'ec117514-7f5f-42e8-8cb8-e32533e9a05b', 'Tender lift OPACMARE 5220_90_09', 1, 'unid', 'extra', 1
  from public.panol_matriz_condicionantes c
 where c.modelo = '52' and c.nombre = 'Tender lift'
   and not exists (
     select 1 from public.panol_matriz_condicionante_items i
      where i.condicionante_id = c.id and i.material_id = 'ec117514-7f5f-42e8-8cb8-e32533e9a05b'
   );

delete from public.panol_material_modelo
 where material_id = 'ec117514-7f5f-42e8-8cb8-e32533e9a05b'   -- Tender lift OPACMARE 5220_90_09
   and modelo = '52';

-- ─── 2. Grupo electrógeno 9 kVA (requisito genérico) ────────────────────────
insert into public.panol_materiales (descripcion, unidad_medida, categoria_id, es_requisito, producto_por_obra, activo, origen, notas)
select 'Grupo electrógeno 9 kVA', 'unidad', 'e67e5b92-0cba-469c-9242-62faceedaf05', true, false, true, 'matriz-k52',
       'Requisito genérico de la matriz: la marca y el modelo se deciden después. Referencia: Kohler 9 kVA 50 Hz de Trimer.'
 where not exists (select 1 from public.panol_materiales where descripcion = 'Grupo electrógeno 9 kVA');

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select m.id, 15750, 'USD', '2025-08-13', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff',
       case when m.es_requisito
            then 'Precio de referencia del requisito (la marca se decide después): cuenta corriente Trimer con Klase A, OP 186 del 13/08/2025, 10 GRUPO ELECTROGENO 9 KVA @ 50HZ Kohler por 157.500 (15.750 cada uno) · IVA sin confirmar, cargado tal cual'
            else 'Cuenta corriente Trimer con Klase A, OP 186 del 13/08/2025: 10 GRUPO ELECTROGENO 9 KVA @ 50HZ por 157.500 (15.750 cada uno) · IVA sin confirmar, cargado tal cual'
       end
  from public.panol_materiales m
 where (m.descripcion = 'Grupo electrógeno 9 kVA' or m.id = '4fb7d08d-618f-4edf-87a3-572979855000')   -- el genérico y GRUPO ELECTROGENO 9KVA KOHLER 50HZ
   and not exists (
     select 1 from public.panol_precios p
      where p.material_id = m.id and p.fecha = '2025-08-13' and p.proveedor = 'Trimer'
   );

-- ─── 3. Precios de las bombas y las cajas (presupuesto Trimer 291225-02) ─────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', nuevo.fuente
  from (values
    ('adc7bd8f-fe7e-4cf3-bf35-5212e176c354'::uuid, 185::numeric, 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BOMBA DE ACHIQUE RULE 2000 GPH 12V (4 a 185) · IVA sin confirmar, cargado tal cual'),
    ('1cea6ed1-4dc2-4ec1-8da0-7cba5c9bfa1c'::uuid, 310::numeric, 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BOMBA DE ACHIQUE RULE 3700 GPH 12V · IVA sin confirmar, cargado tal cual'),
    ('995607bd-9447-48cf-83d0-9b73e5387356'::uuid, 195::numeric, 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): CAJA DE DUCHA RULE 800GPH 12V (2 por 390) · IVA sin confirmar, cargado tal cual')
  ) as nuevo(material_id, precio, fuente)
 where not exists (
   select 1 from public.panol_precios p
    where p.material_id = nuevo.material_id and p.fecha = '2025-12-29' and p.proveedor = 'Trimer'
 );

-- ─── 4. Filas nuevas de la matriz del K52 (estándar) ─────────────────────────
-- La tabla no tiene índice único: la guarda evita duplicar si se corre dos veces.
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    ((select id from public.panol_materiales where descripcion = 'Grupo electrógeno 9 kVA' limit 1), 1::numeric),  -- Grupo electrógeno 9 kVA (genérico)
    ('adc7bd8f-fe7e-4cf3-bf35-5212e176c354'::uuid, 4::numeric),   -- Bomba achique 2000gph 12V
    ('1cea6ed1-4dc2-4ec1-8da0-7cba5c9bfa1c'::uuid, 1::numeric),   -- Bomba de achique 3700 GPH
    ('995607bd-9447-48cf-83d0-9b73e5387356'::uuid, 2::numeric)    -- Caja drenaje ducha 800GPH
  ) as nuevo(material_id, cantidad)
 where nuevo.material_id is not null
   and not exists (
     select 1
       from public.panol_material_modelo actual
      where actual.material_id = nuevo.material_id
        and actual.modelo = '52'
        and coalesce(actual.variante, 'standard') = 'standard'
   );

commit;
