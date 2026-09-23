-- Tercera tanda de precios del K52.
--
-- Tres fuentes, en este orden de preferencia:
--   1. Listas de otras obras: el mismo material ya tenía precio en otro
--      barco. Varios coinciden en tres barcos distintos, que es la mejor
--      señal de que el número es el que se paga.
--   2. Presupuestos de proveedor ya cargados (la bocina Marinco de Flojumar).
--   3. Referencia web, con proveedor "Referencia web" para que se lea
--      distinto de una cotización. Los de dólares son listas de EE.UU. o
--      Europa: NO incluyen flete ni gastos de importación, así que en
--      Argentina el equipo sale más. Los de pesos son precios de góndola
--      con IVA y van divididos por 1,21, como todo en la base.
--
-- Dos materiales están repetidos en la matriz del K52 (el monocomando de
-- cocina 0411.04 y el toallero 0164, cada uno también como "· CROMADO").
-- Se cotiza uno solo de cada par: el otro hay que marcarlo como incluido o
-- sacarlo de la matriz, si no el barco lo paga dos veces.

-- (23/09) Se sacaron 3 renglones que ahora tienen precio de Trimer:
-- ver 20260923140000_precios_k52_trimer.sql.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('e004f66d-8030-44d3-85ba-94c18a35547e', 320661.16, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · baron.com.ar, Five Oceans Bruce galvanizada 30kg, precio de lista (promo web 233.000) · con IVA era 388.000 · sin IVA · 2026-09-23'),  -- Ancla Bruce 30kg galvanizada
  ('f3790ba3-4720-485a-960a-806b54e3bf2d', 8925.62, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · baron.com.ar, Five Oceans calibrada 8mm DIN 766 por metro, precio de lista · con IVA era 10.800 · sin IVA · 2026-09-23'),  -- Cadena 8mm calibrada galvanizada
  ('84ec4e6f-e11e-4168-845a-e82a282bd757', 42148.76, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · baron.com.ar, Five Oceans stopper para cadena 10/12mm, precio de lista · con IVA era 51.000 · sin IVA · 2026-09-23'),  -- Traba cadena 10-12mm
  ('9cfe819c-d5cb-4245-b764-9dfac1ebaa49', 2157.02, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · baron.com.ar, Five Oceans inox 50-70mm, precio de lista (la de 50-75 no figura) · con IVA era 2.610 · sin IVA · 2026-09-23'),  -- Abrazadera inox para manguera 50-75mm
  ('38752a5c-0752-4c14-97cb-91aaadbd431e', 3462.81, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · baron.com.ar, Five Oceans inox 60-80mm, precio de lista · con IVA era 4.190 · sin IVA · 2026-09-23'),  -- Abrazadera inox para manguera 70-80mm
  ('49856b82-22d1-4f55-9b2e-17bbe18eb9cc', 4639.67, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · NERA PVC IP65 115x115x80, Electro Misiones · con IVA era 5.614 · sin IVA · 2026-09-23'),  -- CAJA DE PASO · 115X115X80
  ('e395ee35-1bca-4171-8717-94f127059e02', 8620.66, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · NERA PVC IP65 165x165x110, Electro Misiones · con IVA era 10.431 · sin IVA · 2026-09-23'),  -- CAJA DE PASO · 165X165X110
  ('5fe98328-95bb-4fde-9015-564aea590547', 497.52, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · Tecnocom 16mm (5/8") por metro, Electro Misiones · con IVA era 602 · sin IVA · 2026-09-23'),  -- Caño corrugado blanco 5/8
  ('550c0c4e-0e79-410e-98a9-f83fdd1b6ea5', 493.39, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · Sistelectric 22mm (7/8") por metro, Electro Misiones · con IVA era 597 · sin IVA · 2026-09-23'),  -- Caño corrugado blanco 7/8
  ('659b782d-4fdc-4557-9d65-c7d60b55dfb4', 38.02, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · Inteck 150 x 3,6 mm por unidad, Electro Misiones · con IVA era 46 · sin IVA · 2026-09-23'),  -- Precinto 150 x 3,5 mm
  ('e89568d2-9686-4ac1-8ade-49cf9962fe5c', 65.4, 'ARS', '2026-09-23', 'Referencia web', null, 'Referencia web · Tacsa 250 x 4,6 mm, bolsa de 100 a 7.914, Electro Misiones · con IVA era 79,14 · sin IVA · 2026-09-23'),  -- Precinto 245 x 4,6 mm
  ('6dfa2d83-7e82-46c5-ab1f-e9d79702f204', 7650.59, 'ARS', '2026-08-25', 'Casa Iriarte', '39d9cb3e-9c99-473d-9908-7cb3d5e63b9e', 'Presupuesto Casa Iriarte 33116 25/08, MINIESFERICAS 1/4 GAS HH'),  -- Llavín 1/4" H/H
  ('087e2175-0d86-4d09-8828-3880c5937b99', 2419.39, 'ARS', '2026-08-25', 'Casa Iriarte', '39d9cb3e-9c99-473d-9908-7cb3d5e63b9e', 'Presupuesto Casa Iriarte 33116 25/08, RACOR MACHO 1/4 X 3/8 MANGUERA (3/8" = espiga de 10mm)');  -- Racor 1/4" a espiga 10 mm bronce

-- ─── Piezas de Maxi Herrero que faltaban en su conjunto ─────────────────────
-- La catalina y los tinteros son trabajo de Maxi y el K52 los lleva, pero no
-- se llaman "K52" y por eso no entraron cuando se armó el conjunto. Su plata
-- va en el número de Maxi, no suelta.
insert into public.panol_conjunto_items (conjunto_id, material_id)
select '29e43700-2fbf-4062-b195-e2029adb07df', nuevo.id
  from (values
    ('d82ce9dd-683b-40e2-9a51-f27a4e35db85'::uuid),  -- Catalina de fondeo
    ('3d06aa2f-ca29-49bb-9ef3-9786be2dfee7'::uuid)   -- Tinteros de baranda perimetral
  ) as nuevo(id)
 where not exists (
   select 1 from public.panol_conjunto_items actual
    where actual.conjunto_id = '29e43700-2fbf-4062-b195-e2029adb07df' and actual.material_id = nuevo.id
 );

-- ─── Gemelos: el mismo producto cargado dos veces en la matriz ────────────────
-- Necesita la migración 20260923100000 (la columna sin_precio_motivo). Se
-- marca y no se borra: es reversible desde Costo de obra con "Quitar".
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (es el mismo monocomando 0411.04/L2, cargado dos veces en la matriz)'
 where id = 'ad170c62-bcdb-42b6-8674-8a016ef23e92' and sin_precio_motivo is null;  -- Epuyén Juego monocomando para mesada de cocina 0411.04/L2 · 
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (es el mismo toallero 0164/L2, cargado dos veces en la matriz)'
 where id = 'e297f845-f1ef-41c3-83d2-adcf9e351625' and sin_precio_motivo is null;  -- TOALLERO BARRAL LARGO EPUYEN 0164/L2 · CROMADO

commit;
