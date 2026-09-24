-- K52: botazo, vidrios del soft top, hard top opcional, volante, filtros,
-- amarre y seguridad, heladera estándar y tableros de Costa.
--
-- Lo definió Ezequiel el 24/09/2026:
--
-- 1. BOTAZO: 27 metros; figuraba 1. Las obras K52 lo tienen cargado por
--    remito y no desde la matriz, así que el trigger no les cambia la lista.
-- 2. VIDRIOS: entran todos los que dicen K52 salvo los del hard top, que no es
--    estándar: el parabrisas laminado del soft top y las 10 ventanas laterales
--    (62501 a 62508M, 63002 y 63003). Tienen precio de la lista Favicur del
--    03/09, menos la 62507M y la 62508M, que no están en esa lista.
-- 3. HARD TOP: no es estándar. Queda como configuración de la línea que no viene
--    por defecto, igual que el tender lift. La obra que lo active suma las 2
--    guillotinas, el parabrisas y las 4 ventanas de carroza del hard top, y el
--    aire de 25.000 BTU con su bomba (el 52-23 lo llevó por ser hard top). Resta
--    el parabrisas y las 4 ventanas de carroza del soft top. Las guillotinas
--    salen de la matriz estándar.
-- 4. VOLANTE ISOTTA "PRIN 2020": lo llevaron los seis cascos, del 52-23 al 52-28.
--    Precio de referencia sin proveedor: el Isotta PRN20 de 13-3/4" en Hardin
--    Marine (EE.UU.).
-- 5. FILTROS DE AGUA DE MAR Y DE COMBUSTIBLE: 2 de 1 1/2" para los motores (como
--    el K37 con línea de eje), 1 de 1" para el grupo (como el 52-23), 2 de 3/4"
--    para los aires (como el 52-26 y el K55) y el juego doble de combustible de
--    los motores (como el K37). Los 2 filtros 190RK del grupo ya estaban.
-- 6. AMARRE Y SEGURIDAD, con lo que llevaron los cascos: 6 cornamusas (52-25),
--    6 defensas y 5 ganchos (52-26), 40 m de cabo de 16 mm y 18 m de 6 mm
--    (52-26), bichero con su soporte (52-26), 3 matafuegos de 1 kg (52-23) y un
--    matafuego automático de 7,5 kg para la sala de máquinas (el K55 lleva 2).
--    Las cornamusas las hace Maxi Herrero: entran también en su conjunto.
--    El matafuego de 1 kg tenía USD 93 de ficha, sin fecha: pasa a un precio
--    de góndola de hoy.
-- 7. HELADERA: la estándar es la Samsung. La BGH sale de la matriz.
-- 8. CONJUNTO DE TABLEROS: lo fabrica Costa y no tiene que ver con lo de
--    Merniez. Sigue en la lista sin precio hasta que Costa lo cotice; Costa
--    queda como proveedor en la ficha.
--
-- Agregar o quitar filas de la matriz no toca las listas de las obras: el
-- trigger de sincronización solo actualiza cantidades que la obra tomó de la
-- matriz, y al borrar no hace nada.

begin;

-- ─── 1. Botazo ──────────────────────────────────────────────────────────────
update public.panol_material_modelo
   set cantidad = 27
 where material_id = 'e3056df0-6112-4770-b6f7-c59df1964c0f'   -- BOTAZO 60MM K52/K55 (Blanco/Negro)
   and modelo = '52'
   and coalesce(variante, 'standard') = 'standard';

-- ─── 2. Hard top: configuración opcional ────────────────────────────────────
insert into public.panol_matriz_condicionantes (modelo, nombre, tipo, descripcion, activo_por_defecto, orden)
values ('52', 'Hard top', 'configuracion',
        'No es estándar: el K52 estándar es soft top. Cambia el parabrisas y las ventanas de carroza, suma las guillotinas y un aire de 25.000 BTU.',
        false, 20)
on conflict (modelo, nombre) do nothing;

insert into public.panol_matriz_condicionante_items (condicionante_id, material_id, descripcion, cantidad, unidad, tipo_item, orden)
select c.id, nuevo.material_id, nuevo.descripcion, nuevo.cantidad, 'unid', nuevo.tipo_item, nuevo.orden
  from public.panol_matriz_condicionantes c
 cross join (values
    ('9d522b1a-9b29-4e74-b021-57b4401d60e6'::uuid, 'GUILLOTINA LAT BABOR HARD TOP K52', 1::numeric, 'extra', 1),
    ('832472b2-ff64-4278-ae01-c201790b0658'::uuid, 'GUILLOTINA LAT ESTRIBOR HARD TOP K52', 1::numeric, 'extra', 2),
    ('2ee9fc7b-19eb-4d9f-b047-b264e2f95b21'::uuid, 'PARABRISAS HARD TOP K52 63006', 1::numeric, 'extra', 3),
    ('9faaa112-02b7-4891-b17e-e0833f6eeee3'::uuid, 'VNA LAT ESTRIBOR PROA HARD TOP CARROZA K52', 1::numeric, 'extra', 4),
    ('8385e09a-ecab-4f31-8448-058a695c54ee'::uuid, 'VNA LATV BABOR PROA HARD TOP CARROZA K52', 1::numeric, 'extra', 5),
    ('4df2b7b4-ee54-4b6a-810a-7dd411ab366e'::uuid, 'VNA LAT ESTRIBOR POPA CARROZA HARD TOP K52', 1::numeric, 'extra', 6),
    ('f2e72caf-47ef-40f7-8348-dbb4a4e9890c'::uuid, 'VNA LAT BABOR POPA CARROZA HARD TOP K52', 1::numeric, 'extra', 7),
    ('87e37d26-a454-44ea-af5d-da29de5f3c34'::uuid, 'AIRE ACONDICIONADO 25000 FCFP25 PLATINUM', 1::numeric, 'extra', 8),
    ('39807315-9043-44a2-bc0e-5c896bc90086'::uuid, 'Bomba de Aire acondicionado 1000gph', 1::numeric, 'extra', 9),
    ('9eacc82a-9827-49ed-9967-700edfd2769b'::uuid, 'PARABRISAS LAMINADO K52 SOFT TOP', 1::numeric, 'quita', 10),
    ('d04ec5de-25b7-4c1a-8f4f-4edcb9ae31d3'::uuid, 'VNA LAT DERECHA SOFT TOP CARROZA K52 62648', 1::numeric, 'quita', 11),
    ('0b85745c-29ea-40cf-a264-00140248678a'::uuid, 'VNA LAT IZQUIERDA SOFT TOP CARROZA K52 62649', 1::numeric, 'quita', 12),
    ('dadc554d-be90-49ee-a763-b20462d2a0bd'::uuid, 'VNA LAT IZQ POPA SOFT TOP K52 62650', 1::numeric, 'quita', 13),
    ('c8e31913-04a8-4802-b9ba-d04f10cc5724'::uuid, 'VNA LAT IZQ POPA SOFT TOP CARROZA K52 62651', 1::numeric, 'quita', 14)
  ) as nuevo(material_id, descripcion, cantidad, tipo_item, orden)
 where c.modelo = '52' and c.nombre = 'Hard top'
   and not exists (
     select 1 from public.panol_matriz_condicionante_items i
      where i.condicionante_id = c.id and i.material_id = nuevo.material_id
   );

-- Las guillotinas quedan solo en el hard top; la BGH sale porque la estándar es
-- la Samsung.
delete from public.panol_material_modelo
 where modelo = '52'
   and material_id in (
     '9d522b1a-9b29-4e74-b021-57b4401d60e6',   -- GUILLOTINA LAT BABOR HARD TOP K52
     '832472b2-ff64-4278-ae01-c201790b0658',   -- GUILLOTINA LAT ESTRIBOR HARD TOP K52
     '2176cf72-d0c3-413f-ae8f-8785be0dab6a'    -- Heladera BGH 312L
   );

-- ─── 3. Precios de referencia sin proveedor ─────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select nuevo.material_id, nuevo.precio, nuevo.moneda, '2026-09-24', null, null, nuevo.fuente
  from (values
    ('19dd9d72-8ab2-42bd-9cab-f758ce2d2ddd'::uuid, 545.99::numeric, 'USD', 'hardin-marine.com, Isotta 13-3/4" PRN20 (Prin 2020) · lista USD 545,99 en EE.UU., sin impuestos ni envío'),
    ('d3e05f98-6c70-4825-82ca-fcd33b8db9b8'::uuid, 30991.74::numeric, 'ARS', 'matafuegosbiston.com.ar, matafuego Georgia polvo ABC 1 kg con soporte, sello IRAM · góndola $37.500 con IVA · sin IVA')
  ) as nuevo(material_id, precio, moneda, fuente)
 where not exists (
   select 1 from public.panol_precios p
    where p.material_id = nuevo.material_id and p.fecha = '2026-09-24' and p.fuente = nuevo.fuente
 );

-- ─── 4. Filas nuevas de la matriz del K52 (estándar) ─────────────────────────
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select nuevo.material_id, '52', nuevo.cantidad, 'standard'
  from (values
    -- Vidrios del soft top (lista Favicur del 03/09)
    ('9eacc82a-9827-49ed-9967-700edfd2769b'::uuid, 1::numeric),  -- PARABRISAS LAMINADO K52 SOFT TOP
    ('9fbe52d7-8d38-4efd-8ae3-cc32ad619c95'::uuid, 1::numeric),  -- VNA LAT DER ESTRIBOR K52 62501
    ('9ec7a4b1-c2ce-45bc-80af-356c1feb46d3'::uuid, 1::numeric),  -- VNA LAT IZQ BABOR K52 62502
    ('b2003e08-f3c0-4ab4-821f-5ac301e9c2ad'::uuid, 1::numeric),  -- VNA LAT IZQ BABOR C/VANO K52 62503
    ('ad735cad-720d-4b49-a53c-4682cba07d08'::uuid, 1::numeric),  -- VNA LAT DER ESTRIBOR C/VANO K52 62504
    ('12fcd91e-3673-4f3a-b02d-dc3d20200983'::uuid, 1::numeric),  -- VNA LAT IZQ BB C/VANO K52 62505
    ('a6bbdfaa-6edf-4253-a10e-afa1d7510100'::uuid, 1::numeric),  -- VNA LAT EST C/VANO K52 62506
    ('9ebe22d6-5c17-4ca1-83f6-019fca93c56a'::uuid, 1::numeric),  -- VNA LATERAL BB S/VANO K52 62507M
    ('d110b778-9b89-4905-a844-4df05e328c99'::uuid, 1::numeric),  -- VNA LATERAL EST C/VANO K52 62508M
    ('d462c0f8-1311-49ed-9230-7023c87a9a27'::uuid, 1::numeric),  -- VNA LAT ESTRIBOR CURVO K52 63002
    ('49357d73-83c1-4a36-93c9-088e0d9c5616'::uuid, 1::numeric),  -- VNA LAT BABOR CURVO K52 63003
    -- Volante (los seis cascos del 52-23 al 52-28)
    ('19dd9d72-8ab2-42bd-9cab-f758ce2d2ddd'::uuid, 1::numeric),  -- VOLANTE ISOTTA "PRIN 2020"
    -- Filtros de agua de mar y de combustible
    ('18c68ccb-4fdb-4c50-af42-1b332dc666e0'::uuid, 2::numeric),  -- Filtro de agua 1 1/2" inox (motores, como el K37 con línea de eje)
    ('92226c96-5ae8-4ce2-b786-d55e2a321dbe'::uuid, 1::numeric),  -- Filtro agua 1" (grupo, como el 52-23)
    ('56990c06-2345-4039-9743-b6be04711462'::uuid, 2::numeric),  -- Filtro agua 3/4" (aires, como el 52-26 y el K55)
    ('5c347633-6bdb-4135-993d-8032de51f17c'::uuid, 1::numeric),  -- Juego filtros doble combustible RK18 (motores, como el K37)
    -- Amarre y seguridad
    ('9caa8e48-34d7-4a47-9d0a-400f01bb409b'::uuid, 6::numeric),  -- Cornamusas (52-25; las hace Maxi)
    ('fc71f623-2fec-42ab-8cc7-0e2f1cc0feed'::uuid, 6::numeric),  -- DEFENSA INFLABLE MA BLANCA 21 X 62 CM (52-26)
    ('10c0a029-9d78-4884-85bd-cec0e0c8f7e7'::uuid, 5::numeric),  -- GANCHO INOXIDABLE PORTA DEFENSA (52-26)
    ('d775eb6d-2f27-4684-a22f-fd91fa386a99'::uuid, 40::numeric),  -- CABO DACRON FIVE OC SOLID BLACK 16MM (52-26)
    ('f1299d11-f00d-4344-8364-bd34577755fe'::uuid, 18::numeric),  -- CABO DACRON FIVE OC SOLID BLACK 6MM (52-26)
    ('cba38028-9ec0-4dfe-957d-0e95ceae0210'::uuid, 1::numeric),  -- BICHERO PLASTI 2 TRAMOS 120/210CM (52-26)
    ('48691257-85e0-43a4-8bac-ed25c1dad24b'::uuid, 1::numeric),  -- SOPORTE BICHERO Inoxidable 25-32mm (PAR) (un par por bichero)
    ('d3e05f98-6c70-4825-82ca-fcd33b8db9b8'::uuid, 3::numeric),  -- Matafuego 1kg (52-23)
    ('b659dce0-73f5-43af-9c5e-176f66a42fe4'::uuid, 1::numeric)   -- matafuego automatico 7.5kg (sala de máquinas; el K55 lleva 2)
  ) as nuevo(material_id, cantidad)
 where not exists (
   select 1
     from public.panol_material_modelo actual
    where actual.material_id = nuevo.material_id
      and actual.modelo = '52'
      and coalesce(actual.variante, 'standard') = 'standard'
 );

-- Las cornamusas se cobran dentro de la herrería de Maxi.
insert into public.panol_conjunto_items (conjunto_id, material_id)
select '29e43700-2fbf-4062-b195-e2029adb07df', '9caa8e48-34d7-4a47-9d0a-400f01bb409b'
 where not exists (
   select 1 from public.panol_conjunto_items
    where conjunto_id = '29e43700-2fbf-4062-b195-e2029adb07df' and material_id = '9caa8e48-34d7-4a47-9d0a-400f01bb409b'
 );

-- ─── 5. Tableros de Costa ───────────────────────────────────────────────────
update public.panol_materiales
   set proveedor = 'Costa',
       proveedor_id = '2371975c-43d0-4ce2-9735-773c85210942'
 where id = 'c9c63347-f546-42ab-aca0-c31c9e9643eb'   -- CONJUNTO DE TABLEROS
   and proveedor_id is null;

commit;
