-- Maxi Herrero: materiales inox 316 de K37, K52 y K55 (listas del herrero, 20/10/2026).
--
-- Ezequiel pasó en fotos lo que usa Maxi en cada barco. Ninguno estaba creado:
-- se crean 17 productos a nombre de Maxi Herrero, categoría Herrería, sin
-- precio (se cotizan aparte), y se cargan en la matriz de cada línea.
--
-- Criterios (confirmados por Ezequiel):
--   · todo es inox 316; el "31 mm" de la lista del K37 es 32 mm;
--   · lo que la lista cuenta en "caños" va en tiras de 6 m (nota "Tira de 6 m");
--     lo que cuenta en metros, en metros;
--   · electrodos y varilla roscada son productos de Maxi en inox, no los
--     consumibles de Rebollar (E0001 y VARROSC008).
-- La sincronización matriz → obras sólo toca snapshots existentes de cada
-- material; como son nuevos, las obras los ven desde la matriz como pendientes.

begin;

create temp table _maxi_items (clave text primary key, descripcion text, unidad text, notas text) on commit drop;
insert into _maxi_items values
  ('c38x2', 'Caño inox 316 Ø38 × 2 mm', 'tira', 'Tira de 6 m'),
  ('c32x2', 'Caño inox 316 Ø32 × 2 mm', 'tira', 'Tira de 6 m'),
  ('c25x2', 'Caño inox 316 Ø25 × 2 mm', 'tira', 'Tira de 6 m'),
  ('c22x15', 'Caño inox 316 Ø22 × 1,5 mm', 'tira', 'Tira de 6 m'),
  ('c22x2', 'Caño inox 316 Ø22 × 2 mm', 'tira', 'Tira de 6 m'),
  ('c38x3', 'Caño inox 316 Ø38 × 3 mm', 'metro', null),
  ('c44x3', 'Caño inox 316 Ø44 × 3 mm', 'metro', null),
  ('c16x2', 'Caño inox 316 Ø16 × 2 mm', 'metro', null),
  ('c19x2', 'Caño inox 316 Ø19 × 2 mm', 'metro', null),
  ('r120x80', 'Tubo rectangular inox 316 120 × 80 × 2 mm', 'metro', null),
  ('q100', 'Tubo cuadrado inox 316 100 × 100 × 2 mm', 'metro', null),
  ('q50', 'Tubo cuadrado inox 316 50 × 50 × 2 mm', 'metro', null),
  ('ch6', 'Chapa inox 316 de 6 mm, 1 × 1 m', 'unidad', 'Recorte de 1 × 1 m'),
  ('ch4', 'Chapa inox 316 de 4 mm, 1 × 1 m', 'unidad', 'Recorte de 1 × 1 m'),
  ('ch3', 'Chapa inox 316 de 3 mm, 1 × 1 m', 'unidad', 'Recorte de 1 × 1 m'),
  ('elec25', 'Electrodo inox 316L Ø2,5 mm', 'kg', null),
  ('var12', 'Varilla roscada inox 316 1/2"', 'unidad', null);

create temp table _maxi_lineas (clave text, modelo text, cantidad numeric) on commit drop;
insert into _maxi_lineas values
  ('c32x2', '37', 8),
  ('c22x15', '37', 1),
  ('c25x2', '37', 5),
  ('c38x3', '37', 3),
  ('r120x80', '37', 1.5),
  ('q100', '37', 1.5),
  ('c16x2', '37', 3),
  ('c19x2', '37', 2),
  ('q50', '37', 1),
  ('ch6', '37', 1),
  ('ch4', '37', 1),
  ('ch3', '37', 1),
  ('elec25', '37', 4),
  ('c38x2', '52', 8),
  ('c32x2', '52', 6),
  ('c25x2', '52', 3),
  ('c22x15', '52', 1),
  ('c38x3', '52', 3),
  ('c44x3', '52', 2),
  ('c16x2', '52', 3),
  ('c19x2', '52', 2),
  ('elec25', '52', 4),
  ('ch6', '52', 1),
  ('ch4', '52', 1),
  ('var12', '52', 3),
  ('c38x2', '55', 8),
  ('c32x2', '55', 7),
  ('c25x2', '55', 7),
  ('c22x15', '55', 1),
  ('c44x3', '55', 2),
  ('c38x3', '55', 3),
  ('elec25', '55', 4),
  ('r120x80', '55', 2),
  ('q100', '55', 2),
  ('ch6', '55', 1),
  ('ch4', '55', 1),
  ('ch3', '55', 1),
  ('c22x2', '55', 1);

do $$
begin
  if not exists (select 1 from public.panol_proveedores where id = '58b18365-51ef-44f1-a818-ddf84a9421ad' and nombre = 'Maxi Herrero') then
    raise exception 'No está el proveedor Maxi Herrero';
  end if;
  if exists (select 1 from public.panol_materiales m join _maxi_items i on lower(m.descripcion) = lower(i.descripcion)) then
    raise exception 'Alguno de estos productos ya existe: revisar antes de volver a correr';
  end if;
end $$;

create temp table _maxi_creados on commit drop as
with nuevos as (
  insert into public.panol_materiales
    (descripcion, unidad_medida, categoria_id, proveedor, proveedor_id, moneda, notas, origen, revisado, activo, es_consumible)
  select i.descripcion, i.unidad, 'fa8014c4-e679-467e-a136-67cffcdfb14f', 'Maxi Herrero',
         '58b18365-51ef-44f1-a818-ddf84a9421ad', 'ARS', i.notas, 'maxi_inox_20oct2026', true, true, false
    from _maxi_items i
  returning id, descripcion
)
select n.id, i.clave from nuevos n join _maxi_items i on i.descripcion = n.descripcion;

insert into public.panol_material_proveedores (material_id, proveedor_id)
select c.id, '58b18365-51ef-44f1-a818-ddf84a9421ad' from _maxi_creados c;

insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select c.id, l.modelo, l.cantidad, 'standard'
  from _maxi_lineas l join _maxi_creados c on c.clave = l.clave;

commit;
