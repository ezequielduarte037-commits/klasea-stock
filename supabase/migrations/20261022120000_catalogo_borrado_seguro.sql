-- Un producto usado no puede desaparecer y dejar las obras sin definir.
-- SET NULL borraba la identidad del SKU; el catálogo debe archivarlo.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  v_fk record;
begin
  for v_fk in
    select n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid) as definicion
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where k.contype = 'f'
       and k.confrelid = 'public.panol_materiales'::regclass
       and k.confdeltype = 'n'
       and n.nspname = 'public'
       and c.relname = any(array[
         'panol_obra_materiales_snapshot', 'panol_material_modelo',
         'panol_envio_items', 'purchase_request_items', 'panol_obra_addons',
         'panol_devoluciones', 'panol_solicitud_items', 'panol_obra_cierre_items',
         'panol_matriz_condicionante_items', 'panol_stock_regularizaciones_identidad',
         'panol_comprobante_items', 'consumibles_lista_items',
         'pedidos_produccion_items', 'muebles_orden_trabajo_items',
         'torneria_items', 'torneria_plantilla_items'
       ])
       -- Una sugerencia del lector no es una asignación confirmada.
       and not exists (
         select 1 from pg_attribute a
          where a.attrelid = k.conrelid and a.attnum = any(k.conkey)
            and a.attname = 'scanner_material_sugerido_id'
       )
  loop
    execute format('alter table %I.%I drop constraint %I, add constraint %I %s',
      v_fk.nspname, v_fk.relname, v_fk.conname, v_fk.conname,
      replace(v_fk.definicion, 'ON DELETE SET NULL', 'ON DELETE RESTRICT'));
  end loop;
end;
$$;

-- material_id de Compras es polimórfico (también apunta a otros catálogos),
-- por eso no tiene FK a panol_materiales. Se protege sin cruzar catálogos.
create or replace function public.panol_proteger_producto_en_compras()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.purchase_request_items
     where material_id = old.id
       and (catalog_source = 'panol' or catalog_source is null)
  ) then
    raise exception using errcode = '23503',
      message = 'No se puede borrar: el producto está vinculado a compras. Archivalo para conservar las referencias.';
  end if;
  return old;
end;
$$;
revoke all on function public.panol_proteger_producto_en_compras() from public;
drop trigger if exists trg_panol_proteger_producto_en_compras on public.panol_materiales;
create trigger trg_panol_proteger_producto_en_compras
before delete on public.panol_materiales
for each row execute function public.panol_proteger_producto_en_compras();

-- Antes eran dos llamadas HTTP: quitaba la matriz y, si el segundo DELETE
-- fallaba, dejaba la ficha sin cantidades. Una función es una transacción.
create or replace function public.panol_borrar_material_seguro(p_material_id uuid)
returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  v_borrado boolean;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autenticado';
  end if;
  if p_material_id is null then raise exception 'Falta el material'; end if;
  perform 1 from public.panol_materiales where id = p_material_id for update;
  if not found then return false; end if;
  delete from public.panol_material_modelo where material_id = p_material_id;
  delete from public.panol_materiales where id = p_material_id;
  v_borrado := found;
  if not v_borrado then
    raise exception 'Sin permiso para borrar el material';
  end if;
  return true;
end;
$$;
revoke all on function public.panol_borrar_material_seguro(uuid) from public;
grant execute on function public.panol_borrar_material_seguro(uuid) to authenticated, service_role;
comment on function public.panol_borrar_material_seguro(uuid) is
  'Borra sólo materiales sin referencias operativas y sus cantidades de matriz de forma atómica. Conserva RLS del usuario; los productos usados se archivan.';

notify pgrst, 'reload schema';
commit;
