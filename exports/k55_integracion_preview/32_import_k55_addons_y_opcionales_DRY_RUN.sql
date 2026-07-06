-- Import complementario K55: addons por obra y opcionales sin obra definida.
begin;

create temp table k55_addons_import (obra_id uuid, obra_codigo text, descripcion text, cantidad numeric, proveedor text, tipo text, observaciones text) on commit drop;
insert into k55_addons_import values
  ('cdddce11-3d17-4945-837c-8fc0362c26e2'::uuid, '55-3', 'Bowthruster Sleipner side-power 160kh 12V + STERN', 1, 'Trimer', 'adicional', 'K55 Excel fila 47 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('ebef12e9-d0c9-4a71-8516-950c1fdd8627'::uuid, '55-4', 'Bowthruster Sleipner side-power 160kh 12V + STERN', 1, 'Trimer', 'adicional', 'K55 Excel fila 47 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Cable alargue Quick 12 metros', 4, 'Flojumar', 'opcional', 'K55 Excel fila 59 (OPC).
Estado Excel: En Chubut
Rubro: Electricidad'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Cable y derivacion 2 estaciones Quick', 2, 'Flojumar', 'opcional', 'K55 Excel fila 61 (OPC).
Estado Excel: En Chubut
Rubro: Electricidad'),
  ('488b6dd4-01a3-4e57-bcd4-621f8e909f96'::uuid, '55-2', 'Canilla de cocina - COLOR NEGRO', 1, 'MercadoLibre', 'adicional', 'K55 Excel fila 76 (OBRA_ESPECIFICA).
Estado Excel: Comprar
Rubro: Sanitarios
Analisis duplicados: mejor existente Bacha de cocina negra (0.237)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Cargador Victron Centaur 24v 60A de 3 salidas', 1, null, 'adicional', 'K55 Excel fila 84 (OBRA_ESPECIFICA).
Estado Excel: En Chubut
Rubro: Electricidad'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Cerraduras de puertas BRONZEN (K55)', 7, null, 'adicional', 'K55 Excel fila 88 (VAR).
Estado Excel: Comprar'),
  ('488b6dd4-01a3-4e57-bcd4-621f8e909f96'::uuid, '55-2', 'Cerraduras de puertas BRONZEN (K55) - OPCIONAL sin vestidor', 6, null, 'opcional', 'K55 Excel fila 89 (VAR).
Estado Excel: Comprar
Analisis duplicados: mejor existente Bisagras codo 9 - OPCIONAL camarote sin vestidor (0.188)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Control con indicador segunda estacion Lenco', 1, 'Flojumar', 'adicional', 'K55 Excel fila 109 (VAR).
Estado Excel: En Chubut
Rubro: Electricidad
Analisis duplicados: mejor existente PANEL DE CONTROL TECMA THETFORD BEFORE/AFTER (0.148)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Control faro segunda estacion Marinco', 1, 'Flojumar', 'adicional', 'K55 Excel fila 110 (VAR).
Estado Excel: En Chubut
Rubro: Electricidad
Analisis duplicados: mejor existente PANEL DE CONTROL TECMA THETFORD BEFORE/AFTER (0.148)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Divisor de carga 80A (tiene que tener línea de compensación para el alternador como el Victron Argodiodo 80-2AC)', 2, null, 'adicional', 'K55 Excel fila 131 (OBRA_ESPECIFICA).
Estado Excel: En Chubut
Rubro: Electricidad'),
  ('488b6dd4-01a3-4e57-bcd4-621f8e909f96'::uuid, '55-2', 'Duchador Mano Piazza Lujo D0105ne + Sop Toma Flex 1.5m Negro', 2, 'MercadoLibre', 'adicional', 'K55 Excel fila 136 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Sanitarios
Analisis duplicados: mejor existente Duchador de mano NEGRO + Codo pared (0.397)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Equipo de audio (elige cliente)', 1, null, 'adicional', 'K55 Excel fila 150 (VAR).
Estado Excel: Especificar'),
  ('cdddce11-3d17-4945-837c-8fc0362c26e2'::uuid, '55-3', 'Footswich Maxwell con tapa heavy duty grande', 2, 'Trimer', 'adicional', 'K55 Excel fila 161 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('ebef12e9-d0c9-4a71-8516-950c1fdd8627'::uuid, '55-4', 'Footswich Maxwell con tapa heavy duty grande', 2, 'Trimer', 'adicional', 'K55 Excel fila 161 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'HOLDING TANK MATROMARINE ITALIANO 73 LITROS 12V', 1, 'Flojumar', 'adicional', 'K55 Excel fila 169 (OBRA_ESPECIFICA).
Rubro: Sanitarios
Analisis duplicados: mejor existente HOLDING TANK MATROMARINE ITALIANO 103 LITROS 12V (0.580)'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Inodoro electrico (Camarote Marinero), modelo??', 1, 'Flojumar', 'opcional', 'K55 Excel fila 172 (OPC).
Estado Excel: Especificar'),
  ('cdddce11-3d17-4945-837c-8fc0362c26e2'::uuid, '55-3', 'Malacate Maxwell RC10 12V INOX', 1, 'Trimer', 'adicional', 'K55 Excel fila 194 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('ebef12e9-d0c9-4a71-8516-950c1fdd8627'::uuid, '55-4', 'Malacate Maxwell RC10 12V INOX', 1, 'Trimer', 'adicional', 'K55 Excel fila 194 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Electricidad'),
  ('488b6dd4-01a3-4e57-bcd4-621f8e909f96'::uuid, '55-2', 'Picaportes Currao SARDEGNA - ver color', 12, null, 'opcional', 'K55 Excel fila 216 (OPC).
Estado Excel: Comprar'),
  ('cdddce11-3d17-4945-837c-8fc0362c26e2'::uuid, '55-3', 'Sistema FLAP Bennett 24 X 12 " Doble estacion', 1, 'Trimer', 'adicional', 'K55 Excel fila 262 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Mecanica'),
  ('ebef12e9-d0c9-4a71-8516-950c1fdd8627'::uuid, '55-4', 'Sistema FLAP Bennett 24 X 12 " Doble estacion', 1, 'Trimer', 'adicional', 'K55 Excel fila 262 (OBRA_ESPECIFICA).
Estado Excel: Pedido
Rubro: Mecanica'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Sistema FLAP Lenco 24 x 16 " Doble piston', 1, 'Flojumar', 'adicional', 'K55 Excel fila 263 (OBRA_ESPECIFICA).
Estado Excel: En Chubut
Rubro: Mecanica
Analisis duplicados: mejor existente TV 24 (0.282)'),
  ('488b6dd4-01a3-4e57-bcd4-621f8e909f96'::uuid, '55-2', 'Sistema FLAP Lenco 24 x 16 " Doble piston', 1, 'Flojumar', 'adicional', 'K55 Excel fila 263 (OBRA_ESPECIFICA).
Estado Excel: Revisar
Rubro: Mecanica'),
  ('4ca9218f-76b1-47b1-95b2-43e8c55430ce'::uuid, '55-1', 'Solenoide Blue Sea L-Series - 250A 12/24V', 1, null, 'adicional', 'K55 Excel fila 264 (OBRA_ESPECIFICA).
Estado Excel: Comprar
Rubro: Electricidad');

insert into public.panol_obra_addons (obra_id, descripcion, cantidad, proveedor, tipo, observaciones)
select i.obra_id, i.descripcion, i.cantidad, i.proveedor, i.tipo, i.observaciones
from k55_addons_import i
where not exists (
  select 1 from public.panol_obra_addons a
  where a.obra_id = i.obra_id and lower(btrim(a.descripcion)) = lower(btrim(i.descripcion))
);

create temp table k55_catalog_opc_import (descripcion text, unidad_medida text, proveedor text, categoria_id uuid, notas text) on commit drop;
insert into k55_catalog_opc_import values
  ('Bacha (Camarote Marinero), modelo?? Griferia??', 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'K55 Excel fila 18 (OPC) sin obra definida; no agregado a matriz.
Analisis duplicados: mejor catalogo Cableado B camarote principal K55 (0.223)'),
  ('Bomba p/duchador agua de rio', 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'K55 Excel fila 45 (OPC) sin obra definida; no agregado a matriz.
Rubro: Sanitarios
Analisis duplicados: mejor catalogo Bomba agua automática 3GPM + prefiltro (0.376)'),
  ('BOWTHURSTER QUICK DOBLE HELICE 6,5 KW 250MM 12V', 'unid', 'Flojumar', '6edf5cdc-6e60-43cb-856d-0a64d26c1a6c'::uuid, 'K55 Excel fila 48 (VAR) sin obra definida; no agregado a matriz.
Rubro: Electricidad
Analisis duplicados: mejor catalogo Stern thurster Quick doble helice 6,5kw 250mm 12v (0.590)'),
  ('DUCHADOR agua de rio', 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'K55 Excel fila 132 (OPC) sin obra definida; no agregado a matriz.
Rubro: Sanitarios
Analisis duplicados: mejor catalogo Filtro agua 1" (0.355)'),
  ('Luces bajo agua Azul/Blanco', 'unid', null, 'ead33a92-072a-4cb8-91a9-b3b20514b7d4'::uuid, 'K55 Excel fila 186 (OPC) sin obra definida; no agregado a matriz.
Analisis duplicados: mejor catalogo Filtro agua 1" (0.326)'),
  ('Pasacasco 1/2" bronce', 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'K55 Excel fila 209 (OPC) sin obra definida; no agregado a matriz.
Rubro: Sanitarios
Analisis duplicados: mejor catalogo T bronce 1" (0.580)'),
  ('Prefiltro duchador rio', 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'K55 Excel fila 227 (OPC) sin obra definida; no agregado a matriz.
Rubro: Sanitarios
Analisis duplicados: mejor catalogo Duchador con barral FV Polca (0.237)'),
  ('Racor 1/2" bronce', 'unid', null, '8dbff261-0096-46d5-943f-299de08b099e'::uuid, 'K55 Excel fila 230 (OPC) sin obra definida; no agregado a matriz.
Rubro: Sanitarios
Analisis duplicados: mejor catalogo Racor 1" (0.580)');

insert into public.panol_materiales (categoria_id, descripcion, proveedor, unidad_medida, moneda, notas, origen, revisado, activo)
select c.categoria_id, c.descripcion, c.proveedor, coalesce(c.unidad_medida, 'unid'), 'USD', c.notas, 'import_k55_opc_sin_obra', false, true
from k55_catalog_opc_import c
where not exists (select 1 from public.panol_materiales m where lower(btrim(m.descripcion)) = lower(btrim(c.descripcion)));

select 'addons_input' as paso, count(*)::int as filas from k55_addons_import;
select 'catalog_opc_input' as paso, count(*)::int as filas from k55_catalog_opc_import;
select 'addons_k55_total' as paso, count(*)::int as filas from public.panol_obra_addons a join public.produccion_obras o on o.id=a.obra_id where o.codigo ilike '55-%';
rollback;
