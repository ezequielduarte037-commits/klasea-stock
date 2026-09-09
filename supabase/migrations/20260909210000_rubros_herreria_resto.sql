-- Herrería: lo que quedaba mal ubicado
--
-- Después de aplicar el criterio por proveedor, Herrería quedó con 97 materiales
-- y 19 de ellos no son de Maxi Herrero. De esos, 14 no son herrería.
--
-- Herrería queda sólo con piezas de inoxidable fabricadas y terminadas:
-- pasamanos, bitas, puntales, la base de parrilla de popa y la base de faro.
--
-- Correr entero en el editor SQL de Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Electricidad: son luces y el perfil que las sostiene. Que sean de inoxidable
-- no las hace herrería.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Electricidad')
 where id in (
  '055aab63-6738-41a4-a040-0a8bce72a993',  -- [M.Martyniuk] Luz techo LED inox cuadrada grande
  'd742e6e1-9f83-45db-be5a-d1646641e255',  -- [M.Martyniuk] Luz techo LED inox cuadrada chica
  'ded91987-9251-47a1-a212-934820b95ae2',  -- [M.Martyniuk] Luz cortesía LED Blanco cálido inox
  'eb3b651c-ac30-4bd9-88d4-237a36f4e014',  -- [M.Martyniuk] Luz cortesía LED Azul inox
  '08ec2d87-3a72-463a-b709-6bd4649d3fb1'   -- [MercadoLibre] Perfiles de aluminio para tiras LED
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Mecánica: manchones, bocina, la "U" de hierro y el filtro de agua.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Mecánica')
 where id in (
  '74416017-6684-4e3d-978b-d9db7a9b7039',  -- [Gueto] Hierro manchón Ø146mm x 155mm
  '0778c654-5097-45e6-962b-0c843345bba5',  -- [Plegadora] "U" de hierro L=1000mm, 125x80mm int., esp=1/4"
  '65c081cf-616b-4eed-af3a-935d0b49597f',  -- [Flojumar] Bridas inox + bocina mecanizada y perforada
  '18c68ccb-4fdb-4c50-af42-1b332dc666e0'   -- [Abadie] Filtro de agua 1 1/2" inox
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Broncería: Iriarte es broncería y es caño de fluido.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Broncería')
 where id = 'dbfe155b-4775-4b8d-93c1-4943871c96b0';  -- [Iriarte] Caño poliamida reforzado 1/4"

-- ─────────────────────────────────────────────────────────────────────────────
-- Carpintería y alistamiento: el destorcedor va con el ancla, la cadena y los
-- grilletes. El barral es mueble. La rejilla va con los ductos, que ya están acá.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Carpintería y alistamiento')
 where id in (
  '232b7ecb-2ad2-4243-b047-14c7c6ab3475',  -- [Flojumar] Destorcedor tipo "gusano" INOX p/cadena 10-12mm
  '72c8569c-9e14-435c-a03c-8b88bdc66003',  -- Barral de ropero
  '78d14c50-6bff-4de3-ac7e-e258d8b8795d',  -- Soportes de barral de ropero
  'e005c78e-e80d-4aa2-bff9-cdc7ce60b128'   -- Rejilla aluminio 14"x6" retorno
);


-- ─────────────────────────────────────────────────────────────────────────────
-- El rubro guardado del snapshot, para las filas de obra de estos materiales.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot s
   set rubro = v.rubro
  from (
    select m.id as material_id,
           case when padre.nombre = 'Consumibles' or c.nombre = 'Consumibles'
                then 'Consumibles'
                else c.nombre
           end as rubro
      from public.panol_materiales m
      join public.panol_categorias c          on c.id = m.categoria_id
      left join public.panol_categorias padre on padre.id = c.parent_id
  ) v
 where s.material_id = v.material_id
   and s.rubro is distinct from v.rubro;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════

-- Lo que queda en Herrería que no es de Maxi Herrero. Tienen que ser 5:
-- base de parrilla de popa, puntales de respaldo K55, base de faro,
-- juego de pasamanos y bitas de popa K37.
select coalesce(nullif(m.proveedor, ''), p.nombre, '(sin proveedor)') as proveedor,
       m.descripcion
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
  left join public.panol_proveedores p on p.id = m.proveedor_id
 where c.nombre = 'Herrería'
   and coalesce(nullif(m.proveedor, ''), p.nombre, '') not ilike 'maxi herrero'
 order by 1;

-- Total de Herrería.
select count(*) as materiales_en_herreria
  from public.panol_materiales m
  join public.panol_categorias c on c.id = m.categoria_id
 where c.nombre = 'Herrería';
