-- Precios de Famiq para el inox 316 de los herrajes (cotización 22900406, 21/10/2026).
--
-- Solicitud de cotización Famiq N° 22900406 "Herrajes k55", válida al 27/10/2026,
-- en USD sin impuestos. Es el pedido que hizo el herrero para lo que necesita
-- ahora (no el que se mandó a cotizar): las cantidades de la matriz no se tocan.
--
-- Sólo se carga precio donde Famiq cotizó el mismo producto (medida y calidad):
--   · caños por tira: precio por metro × 6;
--   · chapas de 1 × 1 m: total del renglón / m² cotizados (Famiq cotiza por kg);
--     la de 4 mm vino en 1250 × 2500 en vez de 1000 × 2000, el precio por m² vale igual;
--   · caño Ø44 × 3: Famiq lo ofrece mate, sin pulir (se aclara en la fuente).
-- Quedan SIN precio, porque lo cotizado no es lo mismo:
--   · caño Ø38 × 3: ofrecen Ø38,1 × 2,5 sin costura o Ø38,1 × 3 mate sin pulir;
--   · tubo rectangular 120 × 80 × 2: ofrecen 120 × 80 × 3 en 304;
--   · tubo cuadrado 50 × 50 × 2: ofrecen en 304;
--   · tubo cuadrado 100 × 100 × 2: no vino cotizado.
--
-- Como al aplicar un comprobante desde la pantalla: historial en panol_precios
-- y copia en panol_materiales. El SKU de Famiq queda en panol_material_proveedores.

begin;

create temp table _precios (descripcion text primary key, precio numeric, sku text, nota text) on commit drop;
insert into _precios values
  ('Caño inox 316 Ø38 × 2 mm',            101.196,  '305529', 'tira de 6 m a USD 16,866/m'),
  ('Caño inox 316 Ø32 × 2 mm',             85.158,  '305509', 'tira de 6 m a USD 14,193/m (31,7 × 2,0)'),
  ('Caño inox 316 Ø25 × 2 mm',             69.372,  '305481', 'tira de 6 m a USD 11,562/m (25,4 × 2,0)'),
  ('Caño inox 316 Ø22 × 1,5 mm',           46.152,  '305466', 'tira de 6 m a USD 7,692/m (22,2 × 1,5)'),
  ('Caño inox 316 Ø22 × 2 mm',             60.078,  '305457', 'tira de 6 m a USD 10,013/m (22,2 × 2,0)'),
  ('Caño inox 316 Ø16 × 2 mm',              7.898,  '305429', 'por metro (15,8 × 2,0)'),
  ('Caño inox 316 Ø19 × 2 mm',              8.731,  '305449', 'por metro (19,05 × 2,0)'),
  ('Caño inox 316 Ø44 × 3 mm',             28.713,  '304733', 'por metro (44,45 × 3,0), MATE SIN PULIR'),
  ('Chapa inox 316 de 6 mm, 1 × 1 m',     340.625,  '306946', 'por m²: chapa 1000 × 2000 a USD 7,096/kg'),
  ('Chapa inox 316 de 4 mm, 1 × 1 m',     206.5024, '306858', 'por m²: chapa 1250 × 2500 a USD 6,453/kg'),
  ('Chapa inox 316 de 3 mm, 1 × 1 m',     151.84,   '306759', 'por m²: chapa 1000 × 2000 a USD 6,327/kg'),
  ('Electrodo inox 316L Ø2,5 mm',          15.544,  '312517', 'Surinox 316L-17, por kg'),
  ('Varilla roscada inox 316 1/2"',        14.333,  '323169', 'varilla de 1 m BSW 316');

create temp table _match on commit drop as
select m.id, p.*
  from _precios p
  join public.panol_materiales m on m.descripcion = p.descripcion and m.origen = 'maxi_inox_20oct2026';

do $$
begin
  if (select count(*) from _match) <> 13 then
    raise exception 'No se encontraron los 13 productos esperados: revisar a mano';
  end if;
end $$;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente)
select id, precio, 'USD', '2026-10-21', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a',
       'Cotización Famiq 22900406 21/10/2026 (Herrajes K55), sin IVA · ' || nota
  from _match;

update public.panol_materiales m
   set precio_unitario = x.precio, moneda = 'USD'
  from _match x
 where m.id = x.id;

update public.panol_material_proveedores mp
   set precio = x.precio, moneda = 'USD', codigo_proveedor = x.sku, updated_at = now()
  from _match x
 where mp.material_id = x.id
   and mp.proveedor_id = '0d87c851-0a3f-4828-b17c-d7486ba41f7a';

-- La varilla viene de 1 m: que quede escrito en el producto.
update public.panol_materiales
   set notas = concat_ws(' · ', 'Varilla de 1 m', nullif(notas, ''))
 where origen = 'maxi_inox_20oct2026' and descripcion = 'Varilla roscada inox 316 1/2"';

commit;
