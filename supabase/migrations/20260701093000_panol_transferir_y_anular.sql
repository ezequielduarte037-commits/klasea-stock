-- Transferencias reales entre obras/stock y marca de anulacion de movimientos.

alter table public.panol_obra_materiales_snapshot
  alter column obra_id drop not null,
  add column if not exists obra_origen_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists egreso_destino_obra_id uuid references public.produccion_obras(id) on delete set null,
  add column if not exists cantidad_egresada numeric not null default 0,
  add column if not exists retirado_por text,
  add column if not exists sector_destino text,
  add column if not exists stock_sede text,
  add column if not exists stock_nota text;

drop function if exists public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text);

create or replace function public.panol_transferir_producto(
  p_material_id uuid default null,
  p_descripcion text default null,
  p_codigo text default null,
  p_cantidad numeric default 1,
  p_unidad text default 'unidad',
  p_sede text default null,
  p_obra_origen_id uuid default null,
  p_obra_destino_id uuid default null,
  p_nota text default null,
  p_retirado_por text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material record;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_egreso uuid;
  v_ingreso uuid;
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

  if p_obra_destino_id is null then
    raise exception 'Obra destino requerida';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (v_sede is not null and public.can_receive_envio(v_sede, v_uid))
  ) then
    raise exception 'Sin permiso para transferir producto';
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
    egreso_destino_obra_id,
    cantidad_egresada
  )
  values (
    p_obra_origen_id,
    p_obra_origen_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    'transferencia',
    'Transferencia a obra',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'transferencia_egreso',
    'egresado',
    'egresado',
    now(),
    v_sede,
    v_nota,
    now(),
    v_uid,
    v_nota,
    v_retirado,
    p_obra_destino_id,
    p_cantidad
  )
  returning id into v_egreso;

  insert into public.panol_obra_materiales_snapshot(
    obra_id,
    obra_origen_id,
    material_id,
    descripcion,
    codigo,
    cantidad,
    unidad,
    proveedor,
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
    stock_nota
  )
  values (
    p_obra_destino_id,
    p_obra_origen_id,
    p_material_id,
    v_desc,
    coalesce(nullif(btrim(coalesce(p_codigo, '')), ''), v_material.codigo),
    p_cantidad,
    coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), v_material.unidad_medida, 'unidad'),
    nullif(btrim(coalesce(v_material.proveedor, '')), ''),
    'transferencia',
    'Transferencia recibida',
    v_material.precio_unitario,
    v_material.moneda,
    v_nota,
    'transferencia_ingreso',
    'en_panol',
    'recibido',
    now(),
    v_sede,
    v_nota
  )
  returning id into v_ingreso;

  return jsonb_build_object('egreso_id', v_egreso, 'ingreso_id', v_ingreso);
end;
$$;

grant execute on function public.panol_transferir_producto(uuid,text,text,numeric,text,text,uuid,uuid,text,text) to authenticated;

drop function if exists public.panol_marcar_movimiento_anulado(uuid,text);

create or replace function public.panol_marcar_movimiento_anulado(
  p_snapshot_id uuid,
  p_nota text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
  v_nota text := coalesce(nullif(btrim(p_nota), ''), '[anulado]');
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  select *
    into v_row
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id;

  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  if not (
    public.is_panol_manager(v_uid)
    or (coalesce(v_row.stock_sede, '') <> '' and public.can_receive_envio(v_row.stock_sede, v_uid))
  ) then
    raise exception 'Sin permiso para anular movimiento';
  end if;

  update public.panol_obra_materiales_snapshot
     set notas = concat_ws(E'\n', nullif(notas, ''), v_nota),
         egreso_nota = case
           when estado = 'egresado' then concat_ws(E'\n', nullif(egreso_nota, ''), v_nota)
           else egreso_nota
         end,
         stock_nota = concat_ws(E'\n', nullif(stock_nota, ''), v_nota),
         updated_at = now()
   where id = p_snapshot_id;

  return true;
end;
$$;

grant execute on function public.panol_marcar_movimiento_anulado(uuid,text) to authenticated;
