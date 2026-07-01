-- Egreso por producto para conciliacion viva de stock.
-- Permite registrar salidas aunque no exista un ingreso previo matcheado.

alter table public.panol_obra_materiales_snapshot
  alter column obra_id drop not null,
  add column if not exists obra_origen_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists egreso_destino_obra_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists cantidad_egresada numeric not null default 0,
  add column if not exists retirado_por text,
  add column if not exists sector_destino text,
  add column if not exists stock_sede text,
  add column if not exists stock_nota text;

create index if not exists idx_panol_snapshot_producto_estado
  on public.panol_obra_materiales_snapshot(material_id, estado, stock_sede);

create index if not exists idx_panol_snapshot_desc_codigo_estado
  on public.panol_obra_materiales_snapshot(descripcion, codigo, estado);

create or replace function public.panol_egresar_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_id uuid default null,
  p_destino_obra_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null,
  p_sector_destino text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
begin
  select
    null::text as descripcion,
    null::text as codigo,
    null::text as unidad_medida,
    null::text as proveedor,
    null::numeric as precio_unitario,
    null::text as moneda
    into v_material;

  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para egresar producto';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_material_id is not null then
    select *
      into v_material
      from public.panol_materiales
     where id = p_material_id;
  end if;

  v_desc := coalesce(v_desc, nullif(btrim(coalesce(v_material.descripcion, '')), ''));
  if v_desc is null then
    raise exception 'Descripcion requerida';
  end if;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
    rubro,
    tipo,
    tipo_label,
    precio_unitario,
    moneda,
    notas,
    source,
    estado,
    recepcion_estado,
    recepcion_updated_at,
    stock_sede,
    stock_nota,
    egreso_at,
    egreso_por,
    egreso_nota,
    retirado_por,
    sector_destino,
    egreso_destino_obra_id,
    cantidad_egresada
  )
  values (
    p_obra_id,
    p_obra_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    null,
    'egreso_producto',
    'Egreso manual',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'egreso_producto',
    'egresado',
    'egresado',
    now(),
    v_sede,
    v_nota,
    now(),
    v_uid,
    v_nota,
    v_retirado,
    v_sector,
    p_destino_obra_id,
    p_cantidad
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.panol_egresar_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text,text) to authenticated;
