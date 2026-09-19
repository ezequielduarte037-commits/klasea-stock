-- Hay requisitos que no tienen un SKU estándar para toda la línea: cada barco
-- define su propia terminación. El ejemplo más claro son las cajas de piso.

alter table public.panol_materiales
  add column if not exists producto_por_obra boolean not null default false;

comment on column public.panol_materiales.producto_por_obra is
  'Cuando es true, el producto concreto se elige por obra y no puede fijarse como estándar de línea.';

-- Corrige la automatización anterior si se ejecutó: una caja de piso nunca
-- debe heredarse como SKU fijo de una línea porque la terminación cambia entre
-- barcos. El requisito queda intacto y cada obra conserva o define su elección.
update public.panol_materiales
   set producto_por_obra = true
 where es_requisito is true
   and lower(coalesce(descripcion, '')) like '%caja de piso%';

update public.panol_material_modelo matriz
   set producto_predeterminado_id = null
  from public.panol_materiales requisito
 where requisito.id = matriz.material_id
   and requisito.producto_por_obra is true;

drop trigger if exists trg_panol_matriz_quitar_duplicado_producto_directo on public.panol_material_modelo;
drop function if exists public.panol_matriz_quitar_duplicado_producto_directo();
