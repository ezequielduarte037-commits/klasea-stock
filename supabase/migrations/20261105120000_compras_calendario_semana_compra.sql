-- Calendario de compras: las semanas pasan a ser de COMPRA, contadas desde el
-- desmolde (05/11/2026, Ezequiel). Antes eran "cuándo tiene que estar en el
-- pañol" y se le restaba el plazo del proveedor; Compras lo piensa directo:
-- "lo de Trimer se compra un mes antes del desmolde", "Baron en la semana 0".
--
-- Se suma la semana de compra por proveedor (manda sobre la del rubro) y se
-- cargan las primeras fechas que dio Ezequiel. Las tablas estaban vacías, así
-- que no hay valores viejos con el significado anterior.
begin;
set local lock_timeout = '5s';

alter table public.compras_plazos_proveedor
  add column if not exists semana integer check (semana between -52 and 104);
alter table public.compras_plazos_proveedor
  alter column dias drop not null;

comment on column public.compras_plazos_proveedor.semana is
  'Semana de compra desde el desmolde para todo lo de este proveedor (−4 = un mes antes). Manda sobre la del rubro; la del ítem manda sobre esta.';
comment on table public.compras_calendario_rubros is
  'Semana de compra desde el desmolde de cada rubro, por línea (−13 = tres meses antes, 0 = la semana del desmolde).';
comment on table public.compras_calendario_items is
  'Semana de compra desde el desmolde para un ítem puntual de la matriz de una línea.';

-- Proveedores: Trimer un mes antes, Baron la semana del desmolde. Los tres
-- ítems cargados como "Baron/Trimer" van con Trimer, que es lo más temprano.
insert into public.compras_plazos_proveedor (proveedor, nombre, semana) values
  ('trimer', 'Trimer', -4),
  ('baron', 'Baron', 0),
  ('baron/trimer', 'Baron/Trimer', -4)
on conflict (proveedor) do update set semana = excluded.semana, updated_at = now();

-- Rubros, en las tres líneas: vidrios tres meses antes, broncería y sanitarios
-- la semana del desmolde.
insert into public.compras_calendario_rubros (linea, categoria_id, semana)
select l.linea, c.id, v.semana
from (values ('37'), ('52'), ('55')) as l(linea)
cross join (values ('Vidrios', -13), ('Broncería', 0), ('Sanitarios', 0)) as v(nombre, semana)
join public.panol_categorias c on c.nombre = v.nombre
on conflict (linea, categoria_id) do update set semana = excluded.semana, updated_at = now();

-- Los pasacascos se colocan en la semana del desmolde, antes del liner
-- (recorrido del K55): comprados en la semana 0 llegarían tarde. Van tres
-- semanas antes, el resto de la broncería sigue en 0.
insert into public.compras_calendario_items (linea, material_id, semana, nota)
select distinct m.modelo, m.material_id, -3, 'Pasacasco: se coloca al desmoldar, antes del liner'
from public.panol_material_modelo m
join public.panol_materiales p on p.id = m.material_id
where coalesce(m.variante, 'standard') = 'standard'
  and m.modelo in ('37', '52', '55')
  and p.activo is not false
  and p.descripcion ~* 'pasa[ -]?casco'
on conflict (linea, material_id) do update set semana = excluded.semana, nota = excluded.nota, updated_at = now();

commit;
