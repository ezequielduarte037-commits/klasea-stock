-- Editar cantidades y agregar/quitar productos de un retiro de mostrador ya registrado.
-- La corrección es atómica, auditable e idempotente. Conserva la fecha original
-- para respetar los cortes del inventario; solicitudes usan su circuito de reapertura.
begin;

create table if not exists public.consumibles_correcciones (
  id uuid primary key,
  ids_originales uuid[] not null,
  items jsonb not null,
  motivo text not null,
  autorizado_por text,
  lote_nuevo uuid not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.consumibles_correcciones enable row level security;
drop policy if exists consumibles_correcciones_select on public.consumibles_correcciones;
create policy consumibles_correcciones_select on public.consumibles_correcciones
  for select to authenticated using (public.panol_es_operador_solicitudes(auth.uid()));
grant select on public.consumibles_correcciones to authenticated;

-- El trigger general completa datos desde RRHH y precios vigentes. Una
-- corrección conserva la foto original después de esa normalización.
alter table public.consumibles_movimientos add column if not exists correccion_de uuid
  references public.consumibles_movimientos(id);
create or replace function public.consumibles_correccion_conservar()
returns trigger language plpgsql set search_path = public as $$
declare v_original public.consumibles_movimientos;
begin
  if new.correccion_de is null then return new; end if;
  if current_user in ('authenticated','anon') then
    raise exception 'Usá la corrección de movimientos para editar un retiro';
  end if;
  select * into strict v_original from public.consumibles_movimientos where id = new.correccion_de;
  new.empleado_id := v_original.empleado_id;
  new.empleado_nombre := v_original.empleado_nombre;
  new.empleado_dni := v_original.empleado_dni;
  new.empleado_empresa := v_original.empleado_empresa;
  new.empleado_externo := v_original.empleado_externo;
  new.metodo_firma := v_original.metodo_firma;
  new.created_at := v_original.created_at;
  if new.material_id = v_original.material_id then
    new.costo_unitario_ars := v_original.costo_unitario_ars;
  end if;
  return new;
end;
$$;
drop trigger if exists zz_consumibles_correccion_conservar on public.consumibles_movimientos;
create trigger zz_consumibles_correccion_conservar before insert on public.consumibles_movimientos
  for each row execute function public.consumibles_correccion_conservar();

create or replace function public.consumibles_corregir_operacion(
  p_id uuid, p_ids uuid[], p_items jsonb, p_motivo text, p_autorizado_por text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_base public.consumibles_movimientos;
  v_previa public.consumibles_correcciones;
  v_config public.consumibles_config;
  v_item jsonb;
  v_material uuid;
  v_plantilla uuid;
  v_cantidad numeric;
  v_anterior numeric;
  v_costo numeric;
  v_cupo boolean;
  v_canje text;
  v_motivo text := nullif(trim(p_motivo), '');
  v_autoriza text := nullif(trim(p_autorizado_por), '');
  v_n int;
  v_dia timestamptz;
  v_lote uuid := gen_random_uuid();
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para corregir movimientos';
  end if;
  if p_id is null or v_motivo is null or length(v_motivo) > 300 then
    raise exception 'Indicá el motivo de la corrección';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 10000
     or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id) then
    raise exception 'Revisá los renglones originales';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Revisá los productos de la corrección';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Dejá entre 1 y 100 productos; para cancelar todo usá Anular';
  end if;
  if jsonb_array_length(p_items) <> (select count(distinct i->>'material_id') from jsonb_array_elements(p_items) i) then
    raise exception 'Hay productos repetidos o sin identificar';
  end if;

  -- Un reintento después de perder la respuesta devuelve la misma corrección.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_previa from public.consumibles_correcciones where id = p_id;
  if found then
    if v_previa.created_by <> auth.uid() or v_previa.items <> p_items
       or not (v_previa.ids_originales @> p_ids and p_ids @> v_previa.ids_originales)
       or v_previa.motivo <> v_motivo or v_previa.autorizado_por is distinct from v_autoriza then
      raise exception 'La clave de corrección ya se usó para otros cambios';
    end if;
    return jsonb_build_object('ok', true, 'lote', v_previa.lote_nuevo, 'ya_corregida', true);
  end if;

  -- Mismo candado que conteos e ingresos, en orden estable entre productos.
  perform pg_advisory_xact_lock(hashtext('consumibles:' || materiales.id::text || ':' || m.sede))
    from (select distinct (i->>'material_id')::uuid id from jsonb_array_elements(p_items) i
          union select material_id from public.consumibles_movimientos where id = any(p_ids)) materiales
    cross join (select distinct sede from public.consumibles_movimientos where id = any(p_ids)) m
    order by materiales.id, m.sede;
  perform 1 from public.consumibles_movimientos where id = any(p_ids) order by id for update;
  select count(*) into v_n from public.consumibles_movimientos where id = any(p_ids) and anulado_at is null;
  if v_n <> cardinality(p_ids) then
    raise exception 'El retiro cambió o ya fue anulado. Actualizá y probá de nuevo';
  end if;
  select * into v_base from public.consumibles_movimientos where id = any(p_ids) order by id limit 1;
  if v_base.tipo not in ('retiro', 'devolucion') then
    raise exception 'Solo se editan retiros y devoluciones';
  end if;
  if exists (select 1 from public.consumibles_movimientos where id = any(p_ids)
      and (origen = 'solicitud' or solicitud_id is not null or snapshot_id is not null)) then
    raise exception 'Lo entregado por una solicitud se corrige desde la solicitud';
  end if;
  if exists (select 1 from public.consumibles_movimientos where id = any(p_ids)
      and (tipo <> v_base.tipo or sede <> v_base.sede or lote is distinct from v_base.lote
        or empleado_id is distinct from v_base.empleado_id or empleado_nombre is distinct from v_base.empleado_nombre))
      or (v_base.lote is null and v_n <> 1) then
    raise exception 'Se corrige un retiro completo por vez';
  end if;
  if v_base.lote is not null and exists (select 1 from public.consumibles_movimientos
      where lote = v_base.lote and tipo = v_base.tipo and sede = v_base.sede and anulado_at is null and not (id = any(p_ids))) then
    raise exception 'Faltan productos del retiro. Actualizá y abrilo de nuevo';
  end if;

  v_dia := date_trunc('day', v_base.created_at at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  -- Se anula dentro de la misma transacción antes de insertar, para que el
  -- trigger de cupo no sume la versión anterior y la nueva juntas.
  update public.consumibles_movimientos set anulado_at = now(), anulado_motivo = 'Corrección: ' || v_motivo where id = any(p_ids);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material := (v_item->>'material_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad is null or v_cantidad::text in ('NaN','Infinity','-Infinity')
       or v_cantidad <= 0 or v_cantidad > 99999 or round(v_cantidad, 3) <> v_cantidad then
      raise exception 'Revisá las cantidades: deben ser positivas y tener hasta 3 decimales';
    end if;
    select * into v_config from public.consumibles_config where material_id = v_material;
    if not exists (select 1 from public.panol_materiales where id = v_material and es_consumible)
       or (not exists (select 1 from public.consumibles_movimientos where id = any(p_ids) and material_id = v_material)
         and (not found or not v_config.activo_mostrador or not exists (select 1 from public.panol_materiales where id = v_material and activo))) then
      raise exception 'El producto no está disponible en el catálogo de consumibles';
    end if;
    select sum(abs(cantidad)) into v_anterior from public.consumibles_movimientos where id = any(p_ids) and material_id = v_material;
    v_plantilla := case when v_anterior is null then v_base.material_id else v_material end;
    v_canje := case when v_base.tipo = 'retiro' then nullif(v_item->>'canje', '') else null end;
    if v_canje is not null and v_canje not in ('trajo_usado','sin_usado') then
      raise exception 'Revisá la condición del canje';
    end if;
    if v_base.tipo = 'retiro' and v_config.forma_entrega = 'canje' and v_canje is null then
      raise exception 'Indicá si trajo el usado para cada producto de canje';
    end if;
    v_cupo := false;
    if v_base.tipo = 'retiro' and v_config.cupo_diario is not null and v_base.empleado_id is not null then
      select coalesce(sum(abs(cantidad)), 0) + v_cantidad > v_config.cupo_diario into v_cupo
        from public.consumibles_movimientos where material_id = v_material and empleado_id = v_base.empleado_id
          and tipo = 'retiro' and anulado_at is null and not (id = any(p_ids))
          and created_at >= v_dia and created_at < v_dia + interval '1 day';
    end if;
    if v_base.tipo = 'retiro' and (v_cupo or v_canje = 'sin_usado' or v_base.empleado_externo)
       and v_autoriza is null then
      raise exception 'Indicá quién autoriza el retiro (externo, cupo o canje sin usado)';
    end if;
    v_costo := case when v_anterior is null then v_config.costo_unitario_ars else null end;

    -- Distribuye milésimos con resto mayor: la suma sigue siendo exacta,
    -- incluso para 0,002 repartido entre muchas obras. Nuevos productos toman
    -- el reparto del primer producto del retiro.
    insert into public.consumibles_movimientos (
      material_id,sede,tipo,cantidad,gramos,empleado_id,empleado_nombre,empleado_dni,
      empleado_empresa,empleado_externo,metodo_firma,obra_id,sector,carril,lote,
      costo_unitario_ars,canje,fuera_cupo,autorizado_por,remito,origen,nota,created_by,created_at,correccion_de
    )
    with partes as (
      select m.*, v_cantidad * 1000 * abs(m.cantidad) / sum(abs(m.cantidad)) over () as exacta
      from public.consumibles_movimientos m where m.id = any(p_ids) and m.material_id = v_plantilla
    ), restos as (
      select p.*, floor(exacta) as piso,
        row_number() over (order by exacta - floor(exacta) desc, id) as lugar,
        v_cantidad * 1000 - sum(floor(exacta)) over () as sobrantes from partes p
    ), cantidades as (
      select r.*, (piso + case when lugar <= sobrantes then 1 else 0 end) / 1000 as nueva from restos r
    )
    select v_material,sede,tipo,(case when tipo = 'retiro' then -1 else 1 end) * nueva,
      case when v_anterior = v_cantidad then gramos else null end,
      empleado_id,empleado_nombre,empleado_dni,empleado_empresa,empleado_externo,metodo_firma,
      obra_id,sector,carril,v_lote,case when v_anterior is null then v_costo else costo_unitario_ars end,
      v_canje,v_cupo,coalesce(v_autoriza,autorizado_por),remito,origen,
      concat_ws(' · ',nullif(nota,''),'Corrección: ' || v_motivo),auth.uid(),created_at,id
    from cantidades where nueva > 0;
  end loop;

  insert into public.consumibles_correcciones(id,ids_originales,items,motivo,autorizado_por,lote_nuevo)
    values(p_id,p_ids,p_items,v_motivo,v_autoriza,v_lote);
  return jsonb_build_object('ok',true,'lote',v_lote,'anulados',v_n);
end;
$$;
revoke all on function public.consumibles_corregir_operacion(uuid,uuid[],jsonb,text,text) from public;
grant execute on function public.consumibles_corregir_operacion(uuid,uuid[],jsonb,text,text) to authenticated;
commit;
