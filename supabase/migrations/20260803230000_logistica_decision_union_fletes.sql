-- Evaluacion explicita de viajes compartidos.
-- Una coincidencia es solo una sugerencia hasta que Compras revisa capacidad,
-- recorrido y disponibilidad y decide unir o pedir otro transporte.

alter table public.calendario_eventos
  add column if not exists union_estado text not null default 'sin_evaluar',
  add column if not exists union_decidido_por uuid references public.profiles(id) on delete set null,
  add column if not exists union_decidido_at timestamptz,
  add column if not exists union_observacion text;

alter table public.calendario_eventos
  drop constraint if exists calendario_eventos_union_estado_check;

alter table public.calendario_eventos
  add constraint calendario_eventos_union_estado_check
  check (union_estado in ('sin_evaluar', 'sugerida', 'aceptada', 'rechazada'));

update public.calendario_eventos
set union_estado = 'aceptada'
where clase = 'solicitud_logistica'
  and viaje_grupo_id is not null;

update public.calendario_eventos
set union_estado = 'sugerida'
where clase = 'solicitud_logistica'
  and viaje_sugerido_id is not null
  and viaje_grupo_id is null
  and union_estado = 'sin_evaluar';

create index if not exists idx_calendario_logistica_union
  on public.calendario_eventos(union_estado, viaje_sugerido_id)
  where clase = 'solicitud_logistica';

create or replace function public.calendario_decidir_union(
  p_evento_id uuid,
  p_objetivo_id uuid,
  p_unir boolean,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_grupo_id uuid;
  v_evento_titulo text;
  v_objetivo_titulo text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
  ) then
    raise exception 'Solo Compras o Administracion pueden decidir una union de transportes';
  end if;

  if p_evento_id is null or p_objetivo_id is null or p_evento_id = p_objetivo_id then
    raise exception 'Seleccion de movimientos invalida';
  end if;

  select coalesce(viaje_grupo_id, id), coalesce(carga, titulo)
  into v_grupo_id, v_objetivo_titulo
  from public.calendario_eventos
  where id = p_objetivo_id
    and clase = 'solicitud_logistica'
    and estado not in ('realizado', 'cancelado')
  for update;

  select coalesce(carga, titulo)
  into v_evento_titulo
  from public.calendario_eventos
  where id = p_evento_id
    and clase = 'solicitud_logistica'
    and estado not in ('realizado', 'cancelado')
  for update;

  if v_grupo_id is null or v_evento_titulo is null then
    raise exception 'No se encontraron ambos movimientos activos';
  end if;

  if p_unir then
    update public.calendario_eventos
    set viaje_grupo_id = v_grupo_id,
        union_estado = 'aceptada',
        union_decidido_por = v_uid,
        union_decidido_at = now(),
        union_observacion = 'Comparte viaje con ' || v_evento_titulo,
        updated_by = v_uid
    where id = p_objetivo_id;

    update public.calendario_eventos
    set viaje_grupo_id = v_grupo_id,
        viaje_sugerido_id = p_objetivo_id,
        union_estado = 'aceptada',
        union_decidido_por = v_uid,
        union_decidido_at = now(),
        union_observacion = 'Comparte viaje con ' || v_objetivo_titulo,
        updated_by = v_uid
    where id = p_evento_id;
  else
    update public.calendario_eventos
    set viaje_sugerido_id = p_objetivo_id,
        union_estado = 'rechazada',
        union_decidido_por = v_uid,
        union_decidido_at = now(),
        union_observacion = coalesce(nullif(trim(p_observacion), ''), 'Se requiere otro transporte por capacidad o recorrido.'),
        updated_by = v_uid
    where id = p_evento_id;
  end if;
end;
$$;

grant execute on function public.calendario_decidir_union(uuid, uuid, boolean, text) to authenticated;

comment on column public.calendario_eventos.union_estado is
  'sin_evaluar/sugerida: posible combinacion; aceptada: mismo viaje; rechazada: Compras decidio pedir otro transporte.';

comment on column public.calendario_eventos.union_observacion is
  'Motivo de la decision de Compras, por ejemplo capacidad insuficiente o recorridos incompatibles.';
