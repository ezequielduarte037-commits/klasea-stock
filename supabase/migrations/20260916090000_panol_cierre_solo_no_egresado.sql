-- Corrige el alcance del cierre de obra.
--
-- Regla operativa: todo lo que ya egreso de panol se considera entregado a la
-- obra y no se revisa al terminarla. El cierre muestra solamente stock fisico
-- que sigue en panol con obra_id, es decir, material reservado que nunca salio.

begin;

comment on table public.panol_obra_cierres is
  'Revision del stock que quedo en panol asignado a una obra terminada.';

comment on table public.panol_obra_cierre_items is
  'Saldo fisico que nunca egreso y sigue reservado en panol para una obra terminada.';

create or replace function public.panol_cierre_recalcular_cabecera(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panol_obra_cierres c
     set items_total = coalesce(s.total, 0),
         items_pendientes = coalesce(s.pendientes, 0)
    from (
      select
        count(*)::int as total,
        count(*) filter (
          where estado in ('pendiente', 'parcial')
             or coalesce(cantidad_pendiente, 0) > 0.0001
        )::int as pendientes
      from public.panol_obra_cierre_items
      where cierre_id = p_cierre_id
        and tipo_origen = 'reservado'
        and (
          coalesce(cantidad_reservada, 0) > 0.0001
          or coalesce(cantidad_recibida, 0) > 0.0001
          or coalesce(cantidad_aclaracion, 0) > 0.0001
        )
    ) s
   where c.id = p_cierre_id
     and c.estado <> 'conciliada';
end;
$$;

create or replace function public.panol_cierre_refrescar_items(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cierre public.panol_obra_cierres%rowtype;
  v_obra uuid;
  v_uid uuid := auth.uid();
begin
  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;

  if not found then
    raise exception 'No se encontro la revision de materiales';
  end if;
  if v_cierre.estado = 'conciliada' then
    raise exception 'La revision ya esta cerrada';
  end if;
  if v_uid is not null and not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para actualizar la revision de materiales';
  end if;

  v_obra := v_cierre.obra_id;

  -- Se vuelve a calcular desde el ledger. Una entrada asignada a la obra suma;
  -- un egreso o una liberacion resta. El resultado es exactamente lo que sigue
  -- fisicamente en panol y nunca fue entregado a la obra.
  update public.panol_obra_cierre_items
     set cantidad_reservada = 0
   where cierre_id = p_cierre_id
     and tipo_origen = 'reservado';

  insert into public.panol_obra_cierre_items (
    cierre_id, material_id, descripcion, codigo, unidad, tipo_origen,
    clave_material, cantidad_reservada, sede_sugerida
  )
  select
    p_cierre_id,
    g.material_id,
    g.descripcion,
    g.codigo,
    g.unidad,
    'reservado',
    g.clave,
    g.reservada,
    g.sede
  from (
    select
      public.panol_cierre_clave_material(
        s.material_id,
        coalesce(nullif(btrim(s.descripcion), ''), '(sin descripcion)')
      ) as clave,
      (array_agg(s.material_id) filter (where s.material_id is not null))[1] as material_id,
      (array_agg(coalesce(nullif(btrim(s.descripcion), ''), '(sin descripcion)')
        order by s.created_at desc))[1] as descripcion,
      (array_agg(nullif(btrim(s.codigo), ''))
        filter (where nullif(btrim(s.codigo), '') is not null))[1] as codigo,
      coalesce(
        (array_agg(nullif(btrim(s.unidad), ''))
          filter (where nullif(btrim(s.unidad), '') is not null))[1],
        'unidad'
      ) as unidad,
      round(sum(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
      ))::numeric, 3) as reservada,
      (array_agg(coalesce(s.stock_sede, e.sede))
        filter (where coalesce(s.stock_sede, e.sede) is not null))[1] as sede
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.obra_id = v_obra
      and not public.panol_cierre_snapshot_anulado(
        s.notas, s.egreso_nota, s.source, s.stock_nota
      )
    group by 1
  ) g
  where g.reservada > 0.0001
  on conflict (cierre_id, tipo_origen, clave_material) do update
    set material_id = coalesce(excluded.material_id, panol_obra_cierre_items.material_id),
        descripcion = excluded.descripcion,
        codigo = coalesce(excluded.codigo, panol_obra_cierre_items.codigo),
        unidad = coalesce(excluded.unidad, panol_obra_cierre_items.unidad),
        cantidad_reservada = excluded.cantidad_reservada,
        sede_sugerida = coalesce(excluded.sede_sugerida, panol_obra_cierre_items.sede_sugerida);

  perform public.panol_cierre_recalcular_item(i.id)
    from public.panol_obra_cierre_items i
   where i.cierre_id = p_cierre_id
     and i.tipo_origen = 'reservado';

  perform public.panol_cierre_recalcular_cabecera(p_cierre_id);
end;
$$;

comment on function public.panol_cierre_refrescar_items(uuid) is
  'Recalcula solo stock que sigue en panol asignado a la obra. Ignora todo material ya egresado.';

create or replace function public.panol_cierre_conciliar(p_cierre_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre public.panol_obra_cierres%rowtype;
  v_abiertos int;
  v_excepciones int;
  v_resumen jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para cerrar la revision';
  end if;

  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;
  if not found then raise exception 'No se encontro la revision'; end if;
  if v_cierre.estado = 'conciliada' then return v_cierre.resumen; end if;

  perform public.panol_cierre_refrescar_items(p_cierre_id);

  select
    count(*) filter (
      where estado in ('pendiente', 'parcial')
         or coalesce(cantidad_pendiente, 0) > 0.0001
    ),
    count(*) filter (
      where estado = 'excepcion' or coalesce(cantidad_aclaracion, 0) > 0.0001
    )
  into v_abiertos, v_excepciones
  from public.panol_obra_cierre_items
  where cierre_id = p_cierre_id
    and tipo_origen = 'reservado'
    and (
      coalesce(cantidad_reservada, 0) > 0.0001
      or coalesce(cantidad_recibida, 0) > 0.0001
      or coalesce(cantidad_aclaracion, 0) > 0.0001
    );

  if v_abiertos > 0 then
    raise exception 'Todavia hay % sobrante(s) sin liberar o documentar.', v_abiertos;
  end if;
  if v_excepciones > 0 and not public.panol_cierre_puede_excepcion(v_uid) then
    raise exception 'Hay diferencias documentadas. Debe cerrar la revision un usuario autorizado.';
  end if;

  select jsonb_build_object(
    'liberados', coalesce(sum(cantidad_recibida), 0),
    'diferencias', coalesce(sum(cantidad_aclaracion), 0),
    'items', count(*)
  )
  into v_resumen
  from public.panol_obra_cierre_items
  where cierre_id = p_cierre_id
    and tipo_origen = 'reservado'
    and (
      coalesce(cantidad_reservada, 0) > 0.0001
      or coalesce(cantidad_recibida, 0) > 0.0001
      or coalesce(cantidad_aclaracion, 0) > 0.0001
    );

  update public.panol_obra_cierres
     set estado = 'conciliada',
         conciliada_at = now(),
         conciliada_por = v_uid,
         resumen = v_resumen,
         items_pendientes = 0
   where id = p_cierre_id;

  perform public.panol_cierre_registrar_evento(p_cierre_id, 'conciliada', v_resumen);
  return v_resumen;
end;
$$;

comment on function public.panol_cierre_conciliar(uuid) is
  'Cierra la revision del saldo que nunca egreso de panol para la obra.';

-- Corrige las revisiones abiertas creadas con la definicion anterior. Los
-- renglones de egresos se conservan como historial, pero dejan de contar y de
-- mostrarse; no se borra auditoria.
do $$
declare
  v_cierre_id uuid;
begin
  for v_cierre_id in
    select id
      from public.panol_obra_cierres
     where estado in ('pendiente', 'en_revision')
     order by id
  loop
    perform public.panol_cierre_refrescar_items(v_cierre_id);
  end loop;
end;
$$;

commit;
