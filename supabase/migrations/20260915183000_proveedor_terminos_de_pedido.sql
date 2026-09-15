-- Un artículo conserva su identidad interna, pero cada proveedor puede
-- reconocerlo con otra denominación, código o incluso varios renglones.
alter table public.panol_material_proveedores
  add column if not exists denominacion_proveedor text,
  add column if not exists codigo_proveedor text,
  add column if not exists componentes_pedido jsonb not null default '[]'::jsonb;

alter table public.panol_material_proveedores
  drop constraint if exists panol_material_proveedores_componentes_array_chk;
alter table public.panol_material_proveedores
  add constraint panol_material_proveedores_componentes_array_chk
  check (jsonb_typeof(componentes_pedido) = 'array');

comment on column public.panol_material_proveedores.denominacion_proveedor is
  'Nombre exacto que usa este proveedor para reconocer el artículo.';
comment on column public.panol_material_proveedores.codigo_proveedor is
  'Código propio de este proveedor; no reemplaza el código interno de KlaseA.';
comment on column public.panol_material_proveedores.componentes_pedido is
  'Desglose de compra cuando un artículo interno se pide como varios renglones.';

-- La solicitud guarda una foto de estos términos. Así una corrección futura
-- del catálogo no modifica una orden histórica que ya fue enviada.
alter table public.purchase_request_items
  add column if not exists supplier_id uuid references public.panol_proveedores(id) on delete set null,
  add column if not exists supplier_name text,
  add column if not exists supplier_description text,
  add column if not exists supplier_code text,
  add column if not exists supplier_components jsonb not null default '[]'::jsonb;

alter table public.purchase_request_items
  drop constraint if exists purchase_request_items_supplier_components_array_chk;
alter table public.purchase_request_items
  add constraint purchase_request_items_supplier_components_array_chk
  check (jsonb_typeof(supplier_components) = 'array');

create index if not exists idx_purchase_request_items_supplier
  on public.purchase_request_items(supplier_id);

create or replace function public.panol_aplicar_terminos_proveedor_a_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_supplier text;
  v_supplier_id uuid;
  v_supplier_name text;
  v_terms public.panol_material_proveedores%rowtype;
begin
  if new.material_id is null then return new; end if;

  select proveedor into v_request_supplier
    from public.purchase_requests where id = new.request_id;

  if nullif(btrim(coalesce(v_request_supplier, '')), '') is not null then
    select id, nombre into v_supplier_id, v_supplier_name
      from public.panol_proveedores
     where lower(btrim(nombre)) = lower(btrim(v_request_supplier))
     order by activo desc nulls last, created_at desc
     limit 1;
  end if;

  if v_supplier_id is null then
    select m.proveedor_id, p.nombre into v_supplier_id, v_supplier_name
      from public.panol_materiales m
      left join public.panol_proveedores p on p.id = m.proveedor_id
     where m.id = new.material_id;
  end if;

  if v_supplier_id is null then return new; end if;

  select * into v_terms
    from public.panol_material_proveedores
   where material_id = new.material_id and proveedor_id = v_supplier_id;

  new.supplier_id := v_supplier_id;
  new.supplier_name := coalesce(v_supplier_name, v_request_supplier);
  if found then
    new.supplier_description := nullif(btrim(coalesce(v_terms.denominacion_proveedor, '')), '');
    new.supplier_code := nullif(btrim(coalesce(v_terms.codigo_proveedor, '')), '');
    new.supplier_components := coalesce(v_terms.componentes_pedido, '[]'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_item_supplier_terms on public.purchase_request_items;
create trigger trg_purchase_item_supplier_terms
before insert or update of request_id, material_id, catalog_source
on public.purchase_request_items
for each row execute function public.panol_aplicar_terminos_proveedor_a_item();

create or replace function public.panol_refrescar_terminos_al_cambiar_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proveedor is distinct from old.proveedor then
    -- Incluir request_id en SET vuelve a ejecutar el snapshot de cada renglón.
    update public.purchase_request_items
       set request_id = request_id
     where request_id = new.id and material_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_request_supplier_terms on public.purchase_requests;
create trigger trg_purchase_request_supplier_terms
after update of proveedor on public.purchase_requests
for each row execute function public.panol_refrescar_terminos_al_cambiar_proveedor();

-- La normalización de ingresos reemplaza la lista completa de proveedores.
-- Envolvemos la función ya desplegada para reponer también los términos nuevos.
do $$
begin
  if to_regprocedure('public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean)') is not null
     and to_regprocedure('public.panol_normalizar_material_detallado_por_linea_base(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean)') is null then
    execute 'alter function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) rename to panol_normalizar_material_detallado_por_linea_base';
  end if;
end;
$$;

create or replace function public.panol_normalizar_material_detallado_por_linea(
  p_material_id uuid,
  p_descripcion text,
  p_alias text,
  p_modelo text,
  p_decision text,
  p_cantidad numeric,
  p_evidencia_obra_id uuid,
  p_evidencia_movimiento_id uuid,
  p_codigo text,
  p_codigo_barra text,
  p_unidad_medida text,
  p_categoria_id uuid,
  p_notas text,
  p_proveedores jsonb,
  p_cantidad_verificada boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_supplier jsonb;
  v_supplier_id uuid;
begin
  v_result := public.panol_normalizar_material_detallado_por_linea_base(
    p_material_id, p_descripcion, p_alias, p_modelo, p_decision, p_cantidad,
    p_evidencia_obra_id, p_evidencia_movimiento_id, p_codigo, p_codigo_barra,
    p_unidad_medida, p_categoria_id, p_notas, p_proveedores, p_cantidad_verificada
  );

  for v_supplier in select value from jsonb_array_elements(coalesce(p_proveedores, '[]'::jsonb))
  loop
    begin
      v_supplier_id := nullif(v_supplier ->> 'proveedor_id', '')::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    update public.panol_material_proveedores
       set denominacion_proveedor = nullif(btrim(coalesce(v_supplier ->> 'denominacion_proveedor', '')), ''),
           codigo_proveedor = nullif(btrim(coalesce(v_supplier ->> 'codigo_proveedor', '')), ''),
           componentes_pedido = case
             when jsonb_typeof(v_supplier -> 'componentes_pedido') = 'array' then v_supplier -> 'componentes_pedido'
             else '[]'::jsonb
           end,
           updated_at = now()
     where material_id = p_material_id and proveedor_id = v_supplier_id;
  end loop;
  return v_result;
end;
$$;

revoke all on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) from public;
grant execute on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) to authenticated;

comment on function public.panol_normalizar_material_detallado_por_linea(uuid,text,text,text,text,numeric,uuid,uuid,text,text,text,uuid,text,jsonb,boolean) is
  'Normaliza un producto por línea y conserva precios, términos y códigos propios de cada proveedor.';
