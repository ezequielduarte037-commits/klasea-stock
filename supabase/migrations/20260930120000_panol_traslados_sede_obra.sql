begin;

-- La obra identifica a quién pertenece el producto; la sede indica dónde está.
-- Un traslado entre pañoles conserva obra_id y tiene dos momentos físicos:
-- egreso en origen (en tránsito) e ingreso confirmado en destino.
create table if not exists public.panol_traslados_sede (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.panol_materiales(id),
  requisito_material_id uuid references public.panol_materiales(id),
  obra_id uuid references public.produccion_obras(id),
  cantidad numeric not null check (cantidad > 0),
  sede_origen text not null check (sede_origen in ('Pampa', 'Chubut')),
  sede_destino text not null check (sede_destino in ('Pampa', 'Chubut')),
  estado text not null default 'en_transito'
    check (estado in ('en_transito', 'recibido', 'cancelado')),
  nota text,
  motivo_cancelacion text,
  egreso_snapshot_id uuid references public.panol_obra_materiales_snapshot(id),
  ingreso_snapshot_id uuid references public.panol_obra_materiales_snapshot(id),
  creado_por uuid references public.profiles(id),
  recibido_por uuid references public.profiles(id),
  cancelado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  recibido_at timestamptz,
  cancelado_at timestamptz,
  constraint panol_traslados_sedes_distintas check (sede_origen <> sede_destino)
);

create index if not exists panol_traslados_sede_destino_estado_idx
  on public.panol_traslados_sede (sede_destino, estado, created_at desc);
create index if not exists panol_traslados_sede_origen_estado_idx
  on public.panol_traslados_sede (sede_origen, estado, created_at desc);

alter table public.panol_obra_materiales_snapshot
  add column if not exists panol_traslado_sede_id uuid
    references public.panol_traslados_sede(id);
create index if not exists panol_snapshot_traslado_sede_idx
  on public.panol_obra_materiales_snapshot (panol_traslado_sede_id)
  where panol_traslado_sede_id is not null;

alter table public.panol_traslados_sede enable row level security;
drop policy if exists "panol traslados sedes visibles" on public.panol_traslados_sede;
create policy "panol traslados sedes visibles" on public.panol_traslados_sede
  for select to authenticated
  using (
    public.is_panol_manager(auth.uid())
    or public.can_receive_envio(sede_origen, auth.uid())
    or public.can_receive_envio(sede_destino, auth.uid())
  );
grant select on public.panol_traslados_sede to authenticated;

-- El dato de sede que manda al recibir es la sede física, no una sede anterior
-- que haya quedado en el renglón de la obra. Este trigger corre antes del
-- sincronizador de snapshot (orden alfabético de triggers AFTER).
create or replace function public.panol_fijar_sede_recepcion_fisica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede text;
  v_snapshot_id uuid;
  v_previo record;
begin
  if new.estado not in ('recibido', 'parcial') then return new; end if;

  select e.sede into v_sede
    from public.panol_envios e where e.id = new.envio_id;
  if v_sede not in ('Pampa', 'Chubut') then
    raise exception 'El aviso no tiene una sede física válida';
  end if;
  if not public.can_receive_envio(v_sede, auth.uid()) then
    raise exception 'Tu cuenta no puede recibir productos en %', v_sede;
  end if;

  v_snapshot_id := new.obra_snapshot_item_id;
  if v_snapshot_id is null and new.purchase_request_item_id is not null then
    select s.id into v_snapshot_id
      from public.panol_obra_materiales_snapshot s
     where s.purchase_request_item_id = new.purchase_request_item_id
     order by s.created_at desc limit 1;
  end if;
  if v_snapshot_id is null then return new; end if;

  select s.stock_sede, s.recepcion_estado, s.panol_envio_item_id
    into v_previo
    from public.panol_obra_materiales_snapshot s
   where s.id = v_snapshot_id for update;
  if not found then return new; end if;

  -- No mover de sede una recepción anterior por editar/reutilizar su snapshot.
  -- En ese caso hace falta un nuevo renglón o un traslado real, nunca cambiar
  -- silenciosamente la ubicación de todo el lote anterior.
  if v_previo.stock_sede is not null
     and v_previo.stock_sede <> v_sede
     and v_previo.recepcion_estado in ('recibido', 'parcial')
     and v_previo.panol_envio_item_id is distinct from new.id then
    raise exception 'Este renglón ya tiene stock recibido en %. Separá la nueva recepción antes de ingresarla en %',
      v_previo.stock_sede, v_sede;
  end if;

  update public.panol_obra_materiales_snapshot
     set stock_sede = v_sede,
         updated_at = now()
   where id = v_snapshot_id
     and stock_sede is distinct from v_sede;
  return new;
end;
$$;

drop trigger if exists trg_aa_panol_fijar_sede_recepcion_fisica
  on public.panol_envio_items;
create trigger trg_aa_panol_fijar_sede_recepcion_fisica
after insert or update of estado, cantidad_recibida
on public.panol_envio_items
for each row execute function public.panol_fijar_sede_recepcion_fisica();

create or replace function public.panol_iniciar_traslado_sede(
  p_material_id uuid,
  p_cantidad numeric,
  p_sede_origen text,
  p_sede_destino text,
  p_obra_id uuid default null,
  p_nota text default null,
  p_variante text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_material_id uuid;
  v_requisito_id uuid;
  v_material public.panol_materiales%rowtype;
  v_traslado_id uuid;
  v_egreso_id uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if p_sede_origen not in ('Pampa', 'Chubut')
     or p_sede_destino not in ('Pampa', 'Chubut')
     or p_sede_origen = p_sede_destino then
    raise exception 'Elegí dos sedes distintas y válidas';
  end if;
  if not public.can_receive_envio(p_sede_origen, v_uid) then
    raise exception 'Tu cuenta no puede despachar desde %', p_sede_origen;
  end if;
  if p_material_id is null or coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Elegí un producto y una cantidad mayor a cero';
  end if;

  -- Resuelve el SKU concreto y bloquea el saldo del par sede/obra. También
  -- evita que dos operadores despachen a la vez la misma existencia.
  select preparado.material_id, preparado.requisito_material_id
    into v_material_id, v_requisito_id
    from public.panol_preparar_stock_producto(
      p_material_id, null, p_variante, p_sede_origen, p_obra_id, p_cantidad
    ) preparado;
  select * into v_material from public.panol_materiales where id = v_material_id;
  if not found or v_material.es_requisito then
    raise exception 'Elegí un producto concreto del catálogo';
  end if;

  insert into public.panol_traslados_sede (
    material_id, requisito_material_id, obra_id, cantidad,
    sede_origen, sede_destino, nota, creado_por
  ) values (
    v_material_id, v_requisito_id, p_obra_id, p_cantidad,
    p_sede_origen, p_sede_destino, v_nota, v_uid
  ) returning id into v_traslado_id;

  insert into public.panol_obra_materiales_snapshot (
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, cantidad_egresada, unidad, proveedor,
    tipo, tipo_label, notas, source, estado, recepcion_estado,
    recepcion_updated_at, stock_sede, stock_nota, egreso_at, egreso_por,
    egreso_nota, panol_traslado_sede_id
  ) values (
    p_obra_id, p_obra_id, v_material_id, v_requisito_id,
    v_material.descripcion, v_material.codigo, p_cantidad, p_cantidad,
    coalesce(v_material.unidad_medida, 'unidad'), v_material.proveedor,
    'traslado_sede', 'Traslado a ' || p_sede_destino, v_nota,
    'transferencia_egreso_sede', 'egresado', 'egresado',
    now(), p_sede_origen, p_sede_origen || ' → ' || p_sede_destino,
    now(), v_uid, v_nota, v_traslado_id
  ) returning id into v_egreso_id;

  update public.panol_traslados_sede
     set egreso_snapshot_id = v_egreso_id
   where id = v_traslado_id;
  return v_traslado_id;
end;
$$;

create or replace function public.panol_confirmar_traslado_sede(p_traslado_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_traslado public.panol_traslados_sede%rowtype;
  v_material public.panol_materiales%rowtype;
  v_ingreso_id uuid;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  select * into v_traslado
    from public.panol_traslados_sede
   where id = p_traslado_id for update;
  if not found then raise exception 'Traslado inexistente'; end if;
  if v_traslado.estado <> 'en_transito' then
    raise exception 'Este traslado ya fue confirmado o cancelado';
  end if;
  if not public.can_receive_envio(v_traslado.sede_destino, v_uid) then
    raise exception 'Tu cuenta no puede recibir en %', v_traslado.sede_destino;
  end if;

  select * into v_material from public.panol_materiales
   where id = v_traslado.material_id;
  insert into public.panol_obra_materiales_snapshot (
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, notas, source, estado, recepcion_estado,
    recepcion_updated_at, stock_sede, stock_nota,
    panol_traslado_sede_id
  ) values (
    v_traslado.obra_id, v_traslado.obra_id,
    v_traslado.material_id, v_traslado.requisito_material_id,
    v_material.descripcion, v_material.codigo, v_traslado.cantidad,
    coalesce(v_material.unidad_medida, 'unidad'), v_material.proveedor,
    'traslado_sede', 'Traslado desde ' || v_traslado.sede_origen,
    v_traslado.nota, 'transferencia_ingreso_sede', 'en_panol', 'recibido',
    now(), v_traslado.sede_destino,
    v_traslado.sede_origen || ' → ' || v_traslado.sede_destino,
    v_traslado.id
  ) returning id into v_ingreso_id;

  update public.panol_traslados_sede
     set estado = 'recibido', ingreso_snapshot_id = v_ingreso_id,
         recibido_por = v_uid, recibido_at = now()
   where id = v_traslado.id;
  return v_ingreso_id;
end;
$$;

create or replace function public.panol_cancelar_traslado_sede(
  p_traslado_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_traslado public.panol_traslados_sede%rowtype;
  v_material public.panol_materiales%rowtype;
  v_ingreso_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if v_motivo is null then raise exception 'Escribí el motivo de cancelación'; end if;
  select * into v_traslado
    from public.panol_traslados_sede
   where id = p_traslado_id for update;
  if not found then raise exception 'Traslado inexistente'; end if;
  if v_traslado.estado <> 'en_transito' then
    raise exception 'Sólo se puede cancelar un traslado en tránsito';
  end if;
  if not public.can_receive_envio(v_traslado.sede_origen, v_uid) then
    raise exception 'Tu cuenta no puede cancelar el despacho de %', v_traslado.sede_origen;
  end if;

  select * into v_material from public.panol_materiales
   where id = v_traslado.material_id;
  insert into public.panol_obra_materiales_snapshot (
    obra_id, obra_origen_id, material_id, requisito_material_id,
    descripcion, codigo, cantidad, unidad, proveedor,
    tipo, tipo_label, notas, source, estado, recepcion_estado,
    recepcion_updated_at, stock_sede, stock_nota,
    panol_traslado_sede_id
  ) values (
    v_traslado.obra_id, v_traslado.obra_id,
    v_traslado.material_id, v_traslado.requisito_material_id,
    v_material.descripcion, v_material.codigo, v_traslado.cantidad,
    coalesce(v_material.unidad_medida, 'unidad'), v_material.proveedor,
    'traslado_sede', 'Traslado cancelado a ' || v_traslado.sede_destino,
    v_motivo, 'transferencia_ingreso_sede', 'en_panol', 'recibido',
    now(), v_traslado.sede_origen,
    'Regresó a ' || v_traslado.sede_origen,
    v_traslado.id
  ) returning id into v_ingreso_id;

  update public.panol_traslados_sede
     set estado = 'cancelado', ingreso_snapshot_id = v_ingreso_id,
         motivo_cancelacion = v_motivo,
         cancelado_por = v_uid, cancelado_at = now()
   where id = v_traslado.id;
  return v_ingreso_id;
end;
$$;

revoke all on function public.panol_iniciar_traslado_sede(uuid,numeric,text,text,uuid,text,text) from public;
revoke all on function public.panol_confirmar_traslado_sede(uuid) from public;
revoke all on function public.panol_cancelar_traslado_sede(uuid,text) from public;
grant execute on function public.panol_iniciar_traslado_sede(uuid,numeric,text,text,uuid,text,text) to authenticated;
grant execute on function public.panol_confirmar_traslado_sede(uuid) to authenticated;
grant execute on function public.panol_cancelar_traslado_sede(uuid,text) to authenticated;

commit;
