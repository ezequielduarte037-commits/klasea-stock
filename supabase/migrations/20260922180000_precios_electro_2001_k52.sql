-- Presupuesto de Electro 2001 para el K52-28 (P 0001-00145003, 07/09/2026).
--
-- Son 58 renglones de material eléctrico cotizado para un K52 entero. Buena
-- parte es EL MATERIAL QUE SE LE ENTREGA A MERNIEZ para que arme los mazos:
-- el astillero compra el cable y las fichas, Merniez pone el trabajo. Por eso
-- el material va acá, en cada ítem con su precio, y el conjunto de Merniez
-- queda para su mano de obra. Si el número de Merniez incluyera el material,
-- el K52 lo pagaría dos veces.
--
-- OJO CON EL IVA: este presupuesto es a responsable inscripto y los unitarios
-- son SIN IVA (21% se suma aparte; el total con IVA da 12.359.198,69). Los de
-- Baron y Flojumar que ya están cargados son a consumidor final, o sea CON
-- IVA. Se carga lo que dice el papel y queda anotado en la fuente, pero hay
-- que definir un criterio único: hoy el total del modelo mezcla las dos cosas.
--
-- Sólo entran los renglones que se emparejan sin forzar nada. Varios ítems del
-- presupuesto no están en el catálogo (las fichas multipolares ILME, la barra
-- de cobre, los cables de taller multipolares) y varios ítems del catálogo no
-- están en el presupuesto (cable 1x1, 1x0,50, precintos de otra medida, las
-- borneras de 25 y 50A): ésos quedan sin precio a propósito.
--
-- Donde el presupuesto cotiza un calibre en varios colores, el unitario es el
-- mismo en todos (se verifica en 0,75 / 2,5 / 4 / 10 / 16 mm²). Los colores que
-- el papel no trae usan ese precio y quedan marcados en la fuente.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  -- ── Cable unipolar normalizado MH UF-CAT5 ──────────────────────────────────
  ('14f56f37-8596-4b28-a128-f54d146d2968', 260.0144, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x0,75 BLA · sin IVA'),
  ('136ad371-70db-4268-9a76-f1f99f7cda30', 260.0144, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x0,75 ROJ · sin IVA'),
  ('e57d0b12-437b-40f4-ade6-5cf2213af221', 260.0144, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x0,75 NEG · sin IVA'),
  ('a7b6461a-a843-4a95-a600-e565de84fc4c', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5 NEG · sin IVA'),
  ('c4845db9-0120-4e43-8899-72ceeec059b2', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5 ROJ · sin IVA'),
  ('126efc79-6405-4107-bcce-9b52505a1c85', 722.1385, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x2,5 NEG · sin IVA'),
  ('0fe8ae7d-70c4-489a-a86b-154414893db8', 722.1385, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x2,5 ROJ · sin IVA'),
  ('659af67f-a49a-4537-9482-a6812adddb8c', 1123.5740, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x4 NEG · sin IVA'),
  ('b3f3fb45-9092-4886-b95d-43c342b26e56', 1123.5740, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x4 ROJ · sin IVA'),
  ('cedf7a5e-3e2e-41e8-9e88-b775c25e1956', 1665.8738, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x6 NEG · sin IVA'),
  ('fd9f9724-4f17-4e3e-842e-31a37e74f1d8', 1665.8738, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x6 ROJ · sin IVA'),
  ('e213793c-0121-4174-96b8-3b2cd7f15d96', 2879.6455, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x10 NEG · sin IVA'),

  -- ── Mismo calibre, color que el presupuesto no trae ───────────────────────
  ('0f4bb34c-a49a-4c0f-985e-f2cbfa5e3e76', 2879.6455, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x10, precio del mismo calibre en otro color · sin IVA'),
  ('8a10200e-47c0-4173-a112-de255de16685', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5, precio del mismo calibre en otro color · sin IVA'),
  ('4547dfc7-1056-4148-b7eb-0ddefbee2e7c', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5, precio del mismo calibre en otro color · sin IVA'),
  ('0248df7e-4839-4157-ac91-9935fe0989a2', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5, precio del mismo calibre en otro color · sin IVA'),
  ('57345fed-4539-437f-954e-8b07be01c79e', 452.1021, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · 1x1,5, precio del mismo calibre en otro color · sin IVA'),

  -- ── Cable de electrónica extraflexible FEPLAST ────────────────────────────
  ('61b81276-132b-4e03-a5fe-cbd846534a8f', 295.7873, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · electrónica 1x0,75 AMA extraflexible · sin IVA'),
  ('56148b65-2748-43ce-afef-7cb430418fa9', 295.7873, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · electrónica 1x0,75 NAR extraflexible · sin IVA'),
  ('e008e441-0924-49f5-8703-4334646dce33', 516.6417, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · unipolar FEPLAST 1x1,5 GRI · sin IVA'),

  -- ── Cable de soldadura MH goma ────────────────────────────────────────────
  ('827171f2-409a-476e-a17a-393780fe38cf', 8316.0063, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · soldadura 25 mm² · sin IVA'),
  ('e984a5ee-7fb2-4918-80ea-453c0e0b04c2', 11501.3218, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · soldadura 35 mm² · sin IVA'),
  ('09ff3fc0-550f-4e94-b6ef-9ab3c46432e7', 16627.0017, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · soldadura 50 mm² · sin IVA'),
  ('ce697874-9219-46c0-9b5d-f629c668f564', 23409.6469, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · soldadura 70 mm² · sin IVA'),

  -- ── Resto ─────────────────────────────────────────────────────────────────
  ('da500ad3-f16c-41d4-9a95-2f555fd16936', 1085.3808, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · UTP Cat 6 Furukawa, el papel lo cotiza por unidad y la ficha es por metro · sin IVA'),
  ('058baaaf-6592-45f8-baa0-bd5d527d506a', 223.9270, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · ojal d5 AMA 2,5-6,0 mm² · sin IVA'),
  ('9719049a-dc63-4943-83e5-bc54cf7b5259', 126.0526, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · ojal d5 AZU 1,0-2,5 mm² · sin IVA'),
  ('30b4eee3-2a54-45bb-afde-79b833edae1c', 26941.5520, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · Roker PR1010/136 230x300x136 IP65 · sin IVA'),
  ('a94d1405-a9d9-433f-9030-a455c2e8c8b4', 2469.7778, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · cinta PVC 20M blanca Rapifix · sin IVA'),
  ('16938806-9461-4452-bdfa-5d0dd999c1bf', 1249.0830, 'ARS', '2026-09-07', 'Electro 2001', '66cb3a09-6b50-49c4-8cc9-7ccf475ef078', 'Presupuesto Electro 2001 P 0001-00145003 · K52-28 · cinta PVC 20M negra Inteck · sin IVA');

-- ─── Que quede dicho de dónde sale el número de Merniez ──────────────────────
update public.panol_conjuntos
   set notas = 'Merniez arma los mazos y las cajas del barco entero y los cobra en un solo número. El material -cable, fichas, terminales- lo compra el astillero y se lo entrega: está cargado ítem por ítem con el presupuesto de Electro 2001. Acá va SÓLO el trabajo de Merniez, para no pagar el material dos veces.'
 where id = 'f8130cfb-b693-4413-a7a5-de1c5ca293d4';

update public.panol_conjuntos
   set notas = 'Igual que el K52: el material va por separado y acá sólo el trabajo de Merniez.'
 where id = '66310825-4887-429a-8655-5f61617ac771';

commit;
