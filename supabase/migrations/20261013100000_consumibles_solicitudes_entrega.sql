-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: entrega de solicitudes (carril planificado) en el registro nuevo.
--
-- Las solicitudes pasan a vivir dentro de Consumibles. La entrega ya no pasa
-- por panol_confirmar_retiro_solicitud (que escribía en el ledger de obra con
-- "[sin impacto stock]" y dependía del espejo): escribe directo en
-- consumibles_movimientos, en la misma transacción que marca la solicitud.
--
--   consumibles_entregar_solicitud        todos los renglones → retiros con
--                                         carril planificado, a nombre de
--                                         quien firma. Idempotente.
--   consumibles_deshacer_entrega_solicitud anula esos retiros y la deja lista
--                                         para retirar otra vez.
--
-- El espejo (trg_consumibles_espejo_solicitud) sigue para las solicitudes
-- que se entreguen por el circuito viejo: con este camino no hay filas del
-- ledger de obra que copiar, así que no duplica.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- La guarda de siempre ("no se marca entregada sin movimientos de stock")
-- aceptaba solo los del ledger de obra. Ahora también los del registro de
-- consumibles: la regla es la misma, cambia dónde están los movimientos.
create or replace function public.panol_solicitud_proteger_estado_entregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'entregado' and old.estado <> 'entregado' then
    if new.retirado_at is null or not (
      exists (
        select 1
          from public.panol_obra_materiales_snapshot m
         where m.panol_solicitud_id = new.id
           and m.source in ('egreso_solicitud', 'solicitud_consumible_retiro')
           and lower(coalesce(m.notas, '') || ' ' || coalesce(m.egreso_nota, '')) not like '%[anulado]%'
      )
      or exists (
        select 1
          from public.consumibles_movimientos c
         where c.solicitud_id = new.id
           and c.origen = 'solicitud'
           and c.anulado_at is null
      )
    ) then
      raise exception 'Confirmá el retiro desde la firma para generar los movimientos de stock';
    end if;
  end if;

  if old.estado = 'entregado' and new.estado <> 'entregado' and exists (
    select 1
      from public.panol_obra_materiales_snapshot m
     where m.panol_solicitud_id = new.id
       and m.source in ('egreso_solicitud', 'solicitud_consumible_retiro')
       and lower(coalesce(m.notas, '') || ' ' || coalesce(m.egreso_nota, '')) not like '%[anulado]%'
  ) then
    raise exception 'Deshacé el retiro desde el comprobante para revertir el stock';
  end if;

  return new;
end;
$$;

create or replace function public.consumibles_entregar_solicitud(
  p_solicitud_id uuid,
  p_empleado_id uuid default null,
  p_nombre text default null,
  p_dni text default null,
  p_metodo text default 'nfc',
  p_nfc_uid text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol record;
  v_emp_nombre text;
  v_emp_dni text;
  v_nombre text;
  v_dni text;
  v_n int := 0;
  v_libres int;
  v_materiales int;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para entregar solicitudes';
  end if;
  if coalesce(p_metodo, '') not in ('nfc', 'manual', 'sin_tarjeta') then
    raise exception 'Método de firma inválido';
  end if;

  select * into v_sol from public.panol_solicitudes where id = p_solicitud_id for update;
  if not found then
    raise exception 'Solicitud inexistente';
  end if;
  -- Reintento después de perder la respuesta: ya está, no se registra de nuevo.
  if v_sol.estado = 'entregado' then
    return jsonb_build_object('ok', true, 'ya_entregada', true, 'numero', v_sol.numero);
  end if;
  if v_sol.estado = 'cancelado' then
    raise exception 'La solicitud N° % está cancelada', v_sol.numero;
  end if;
  if v_sol.sede_origen is null or v_sol.sede_origen not in ('Pampa', 'Chubut') then
    raise exception 'Elegí de qué pañol sale la solicitud (Chubut o Pampa)';
  end if;

  if p_empleado_id is not null then
    select e.nombre, e.dni into v_emp_nombre, v_emp_dni from public.rrhh_empleados e where e.id = p_empleado_id;
  end if;
  v_nombre := coalesce(v_emp_nombre, nullif(btrim(coalesce(p_nombre, '')), ''));
  v_dni := coalesce(v_emp_dni, nullif(btrim(coalesce(p_dni, '')), ''));
  if v_nombre is null then
    raise exception 'Falta quién retira';
  end if;

  -- Nada sale sin registro: un renglón sin producto del catálogo no se puede
  -- descontar, y un material de obra no es un consumible.
  select count(*) filter (where i.material_id is null),
         count(*) filter (where i.material_id is not null and not coalesce(m.es_consumible, false))
    into v_libres, v_materiales
    from public.panol_solicitud_items i
    left join public.panol_materiales m on m.id = i.material_id
   where i.solicitud_id = v_sol.id
     and coalesce(i.cantidad, 0) > 0
     and i.estado in ('pendiente', 'preparado', 'reemplazado');
  if v_libres > 0 then
    raise exception 'Hay % renglón(es) escritos a mano: elegí el producto del catálogo antes de entregar', v_libres;
  end if;
  if v_materiales > 0 then
    raise exception 'La solicitud trae % material(es) que no son consumibles: entregalos desde Solicitudes de materiales', v_materiales;
  end if;

  insert into public.consumibles_movimientos (
    material_id, sede, tipo, cantidad,
    empleado_id, empleado_nombre, empleado_dni, metodo_firma,
    obra_id, sector, carril, lote, solicitud_id, origen, nota
  )
  select
    i.material_id, v_sol.sede_origen, 'retiro', -abs(i.cantidad),
    p_empleado_id, v_nombre, v_dni, p_metodo,
    v_sol.obra_id, v_sol.sector, 'planificado', v_sol.id, v_sol.id, 'solicitud',
    'Solicitud N° ' || v_sol.numero
  from public.panol_solicitud_items i
  where i.solicitud_id = v_sol.id
    and i.material_id is not null
    and coalesce(i.cantidad, 0) > 0
    and i.estado in ('pendiente', 'preparado', 'reemplazado')
  -- Mismo orden de candados que el mostrador: no se bloquean entre sí.
  order by i.material_id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'La solicitud N° % no tiene nada para entregar', v_sol.numero;
  end if;

  update public.panol_solicitud_items
     set estado = 'preparado', updated_at = now()
   where solicitud_id = v_sol.id
     and estado = 'pendiente'
     and coalesce(cantidad, 0) > 0;

  update public.panol_solicitudes
     set estado = 'entregado',
         retirado_por_id = p_empleado_id,
         retirado_por_nombre = v_nombre,
         retirado_por_dni = v_dni,
         retirado_metodo = case when p_metodo = 'nfc' then 'nfc' else 'manual' end,
         retirado_nfc_uid = nullif(btrim(coalesce(p_nfc_uid, '')), ''),
         retirado_at = now(),
         updated_at = now()
   where id = v_sol.id;

  return jsonb_build_object('ok', true, 'movimientos', v_n, 'numero', v_sol.numero, 'retira', v_nombre);
end;
$$;

create or replace function public.consumibles_deshacer_entrega_solicitud(p_solicitud_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol record;
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Entrega deshecha');
  v_n int := 0;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para deshacer entregas';
  end if;

  select * into v_sol from public.panol_solicitudes where id = p_solicitud_id for update;
  if not found then
    raise exception 'Solicitud inexistente';
  end if;
  if v_sol.estado <> 'entregado' then
    return jsonb_build_object('ok', true, 'no_estaba_entregada', true);
  end if;

  -- Entregada por el circuito viejo: lo deshace su propia función (revierte el
  -- ledger de obra y, por el espejo, anula los retiros copiados).
  if exists (
    select 1 from public.panol_obra_materiales_snapshot s
     where s.panol_solicitud_id = v_sol.id
       and s.source in ('egreso_solicitud', 'solicitud_consumible_retiro')
       and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
  ) then
    perform public.panol_anular_retiro_solicitud(v_sol.id);
  end if;

  update public.consumibles_movimientos
     set anulado_at = now(), anulado_motivo = v_motivo
   where solicitud_id = v_sol.id
     and origen = 'solicitud'
     and anulado_at is null;
  get diagnostics v_n = row_count;

  update public.panol_solicitudes
     set estado = 'listo',
         retirado_por_id = null, retirado_por_nombre = null, retirado_por_dni = null,
         retirado_metodo = null, retirado_nfc_uid = null, retirado_at = null,
         updated_at = now()
   where id = v_sol.id;

  return jsonb_build_object('ok', true, 'anulados', v_n, 'numero', v_sol.numero);
end;
$$;

grant execute on function public.consumibles_entregar_solicitud(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.consumibles_deshacer_entrega_solicitud(uuid, text) to authenticated;

commit;
