-- "DEFINIR PRODUCTO" sólo para lo que de verdad se elige barco por barco
-- (decisión de Ezequiel, 25/11/2026).
--
-- De los 161 requisitos de las matrices 37, 52 y 55, 90 tenían un solo
-- producto posible y 65 eran marcas o medidas equivalentes: pedían elegir en
-- cada obra algo que no hay que decidir. Queda así:
--   1. Una sola opción  -> ese producto pasa a ser el estándar de la línea y se
--      carga en los renglones pendientes de las obras abiertas.
--   2. Varias marcas    -> no frena (lo resuelve la app): Compras elige al comprar.
--   3. Por barco        -> producto_por_obra = true. Son los únicos que siguen
--      pidiendo definir.
-- Además se apagan dos vínculos requisito -> producto que estaban mal.

create table if not exists public.panol_definir_producto_backup_20261125 (
  tabla text not null,
  fila_id uuid not null,
  antes jsonb not null,
  creado_at timestamptz not null default now()
);

-- 0. Vínculos mal hechos ----------------------------------------------------
--   Separador agua-gases 2" -> GRUPO ELECTROGENO 9KVA KOHLER (era el estándar de K52)
--   Extractor Rule 4" 12V    -> BLOWER INLINE 3" 12V (otra medida)
insert into public.panol_definir_producto_backup_20261125 (tabla, fila_id, antes)
select 'panol_requisito_productos', rp.id, to_jsonb(rp)
  from public.panol_requisito_productos rp
 where rp.id in ('822a8df2-3936-4e27-b4e2-ed3bbe3a4919', 'f5c818a6-7194-4579-97f3-12e0ebfeca32')
   and rp.activo;

update public.panol_requisito_productos
   set activo = false, updated_at = now()
 where id in ('822a8df2-3936-4e27-b4e2-ed3bbe3a4919', 'f5c818a6-7194-4579-97f3-12e0ebfeca32')
   and activo;

-- El estándar de K52 del separador apuntaba al grupo electrógeno: se limpia y
-- el paso 2 le pone el separador (queda con una sola opción).
insert into public.panol_definir_producto_backup_20261125 (tabla, fila_id, antes)
select 'panol_material_modelo', mm.id, to_jsonb(mm)
  from public.panol_material_modelo mm
 where mm.material_id = '867bb5f4-9568-4620-a03b-f151c8804c3c'
   and mm.producto_predeterminado_id = '4fb7d08d-618f-4edf-87a3-572979855000';

update public.panol_material_modelo
   set producto_predeterminado_id = null
 where material_id = '867bb5f4-9568-4620-a03b-f151c8804c3c'
   and producto_predeterminado_id = '4fb7d08d-618f-4edf-87a3-572979855000';

-- 1. Los que se eligen por barco ------------------------------------------
insert into public.panol_definir_producto_backup_20261125 (tabla, fila_id, antes)
select 'panol_materiales', m.id, jsonb_build_object('producto_por_obra', m.producto_por_obra)
  from public.panol_materiales m
 where m.id in (
   'c88ce208-4c04-4cb1-aa1e-6aca06f8337f', -- Bacha Piazza A426 (color)
   'c9a9e9f0-a1a4-4757-b734-0f83efdbf1cb', -- Grupo electrógeno 9 kVA
   '02646402-69fa-4d8a-8db8-8c621473630d', -- Monocomando bañera y ducha Epuyén 0106/L2
   'd3a7e58e-7f9a-4568-b70e-281cb1665fbd', -- Monocomando lavatorio Epuyén 0206/L2
   '08151045-25ca-458b-8cbd-21b4f3110163', -- Percha Epuyén 0166/L2
   '8eecd0a2-01c2-4f9d-b192-ab74d0769acc', -- Portarrollo Epuyén 0167/L2
   '09ff32da-b4ea-41b1-a229-bccbc402b29a', -- Toallero Epuyén 0163/L2
   '9765e3d5-30b9-44f7-aee9-77dec09d3a2d'  -- Picaportes Currao SARDEGNA
 )
   and m.producto_por_obra is distinct from true;

update public.panol_materiales
   set producto_por_obra = true
 where id in (
   'c88ce208-4c04-4cb1-aa1e-6aca06f8337f',
   'c9a9e9f0-a1a4-4757-b734-0f83efdbf1cb',
   '02646402-69fa-4d8a-8db8-8c621473630d',
   'd3a7e58e-7f9a-4568-b70e-281cb1665fbd',
   '08151045-25ca-458b-8cbd-21b4f3110163',
   '8eecd0a2-01c2-4f9d-b192-ab74d0769acc',
   '09ff32da-b4ea-41b1-a229-bccbc402b29a',
   '9765e3d5-30b9-44f7-aee9-77dec09d3a2d'
 )
   and producto_por_obra is distinct from true;

-- 2. Una sola opción -> estándar de la línea --------------------------------
create temporary table tmp_requisito_unico on commit drop as
select mm.id as modelo_id,
       mm.material_id as requisito_id,
       regexp_replace(regexp_replace(upper(mm.modelo), '[^A-Z0-9]+', '', 'g'), '^K', '') as modelo,
       (array_agg(rp.producto_material_id))[1] as producto_id
  from public.panol_material_modelo mm
  join public.panol_materiales r on r.id = mm.material_id
  join public.panol_requisito_productos rp on rp.requisito_material_id = r.id and rp.activo
  join public.panol_materiales p on p.id = rp.producto_material_id
                                 and p.activo is distinct from false
                                 and p.es_requisito is distinct from true
 where r.es_requisito is true
   and r.activo is distinct from false
   and r.producto_por_obra is distinct from true
   and lower(r.descripcion) <> 'caja de piso'
   and coalesce(mm.variante, 'standard') = 'standard'
   and mm.producto_predeterminado_id is null
 group by mm.id, mm.material_id, mm.modelo
having count(*) = 1;

insert into public.panol_definir_producto_backup_20261125 (tabla, fila_id, antes)
select 'panol_material_modelo', mm.id, to_jsonb(mm)
  from public.panol_material_modelo mm
  join tmp_requisito_unico t on t.modelo_id = mm.id;

update public.panol_material_modelo mm
   set producto_predeterminado_id = t.producto_id
  from tmp_requisito_unico t
 where t.modelo_id = mm.id;

-- Renglones de obras abiertas que siguen en el requisito, sin pedir ni tocar.
-- Se saltea la obra que ya tiene un renglón con ese producto para el mismo
-- requisito (cargarlo dos veces haría una fila repetida).
create temporary table tmp_snapshot_a_cargar on commit drop as
select s.id as snapshot_id, t.producto_id
  from public.panol_obra_materiales_snapshot s
  join public.produccion_obras o on o.id::text = s.obra_id::text
  join tmp_requisito_unico t
    on t.requisito_id = s.requisito_material_id
   and t.modelo = public.panol_modelo_de_obra(s.obra_id)
 where o.estado <> 'terminada'
   and (s.material_id is null or s.material_id = s.requisito_material_id)
   and s.purchase_request_id is null
   and s.purchase_request_item_id is null
   and s.panol_envio_id is null
   and s.panol_envio_item_id is null
   and coalesce(s.estado, 'pendiente') = 'pendiente'
   and coalesce(s.recepcion_estado, 'pendiente') = 'pendiente'
   and coalesce(s.cantidad_egresada, 0) = 0
   and not exists (
     select 1 from public.panol_obra_materiales_snapshot otro
      where otro.obra_id = s.obra_id
        and otro.id <> s.id
        and otro.material_id = t.producto_id
   );

insert into public.panol_definir_producto_backup_20261125 (tabla, fila_id, antes)
select 'panol_obra_materiales_snapshot', s.id, to_jsonb(s)
  from public.panol_obra_materiales_snapshot s
  join tmp_snapshot_a_cargar t on t.snapshot_id = s.id;

select set_config('app.audit_origin', 'matriz_linea', true);
select set_config('app.audit_note', 'Requisito con una sola opción: el producto pasa a ser el estándar de la línea (25/11)', true);

update public.panol_obra_materiales_snapshot s
   set material_id = t.producto_id,
       variante = null,
       producto_asignado_at = now(),
       producto_asignacion_origen = 'matriz_linea',
       updated_at = now()
  from tmp_snapshot_a_cargar t
 where t.snapshot_id = s.id;
