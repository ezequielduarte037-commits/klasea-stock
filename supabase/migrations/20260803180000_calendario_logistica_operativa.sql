-- Calendario logistico operativo
-- Tecnica/Administracion solicitan. Compras/Admin coordinan y confirman.
-- La fecha solicitada se conserva aunque Compras proponga otra, permitiendo
-- medir demoras y responsabilidades sin convertir la regla de 48 h en bloqueo.

alter table public.calendario_eventos
  add column if not exists clase text not null default 'evento',
  add column if not exists estado text not null default 'confirmado',
  add column if not exists tipo_transporte text,
  add column if not exists proveedor_logistico text,
  add column if not exists carga text,
  add column if not exists fecha_solicitada date,
  add column if not exists hora_solicitada time,
  add column if not exists fecha_propuesta date,
  add column if not exists hora_propuesta time,
  add column if not exists propuesta_mensaje text,
  add column if not exists fecha_confirmada date,
  add column if not exists hora_confirmada time,
  add column if not exists paradas jsonb not null default '[]'::jsonb,
  add column if not exists prioridad text not null default 'normal',
  add column if not exists urgente_motivo text,
  add column if not exists costo numeric(14,2),
  add column if not exists moneda text not null default 'ARS',
  add column if not exists costo_detalle text,
  add column if not exists viaje_sugerido_id uuid references public.calendario_eventos(id) on delete set null,
  add column if not exists viaje_grupo_id uuid,
  add column if not exists modalidad text not null default 'traslado',
  add column if not exists plantilla_codigo text,
  add column if not exists transportes jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists propuesta_por uuid references public.profiles(id) on delete set null,
  add column if not exists confirmado_por uuid references public.profiles(id) on delete set null,
  add column if not exists costo_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists propuesta_at timestamptz,
  add column if not exists confirmado_at timestamptz,
  add column if not exists completado_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.calendario_eventos
set fecha_solicitada = coalesce(fecha_solicitada, fecha),
    hora_solicitada = coalesce(hora_solicitada, case when hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]' then hora::time end),
    fecha_confirmada = coalesce(fecha_confirmada, fecha),
    hora_confirmada = coalesce(hora_confirmada, case when hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]' then hora::time end)
where clase = 'evento';

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_clase_check
    check (clase in ('evento', 'solicitud_logistica'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_estado_check
    check (estado in ('solicitado', 'fecha_propuesta', 'confirmado', 'realizado', 'cancelado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_transporte_check
    check (tipo_transporte is null or tipo_transporte in ('flete', 'camion', 'hidrogrua', 'grua', 'otro'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_prioridad_check
    check (prioridad in ('normal', 'urgente'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_moneda_check
    check (moneda in ('ARS', 'USD'));
exception when duplicate_object then null; end $$;

create index if not exists idx_calendario_logistica_estado_fecha
  on public.calendario_eventos(estado, fecha)
  where clase = 'solicitud_logistica';

create index if not exists idx_calendario_logistica_solicitante
  on public.calendario_eventos(created_by, updated_at desc)
  where clase = 'solicitud_logistica';

create index if not exists idx_calendario_logistica_viaje_grupo
  on public.calendario_eventos(viaje_grupo_id)
  where viaje_grupo_id is not null;

create table if not exists public.calendario_eventos_historial (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.calendario_eventos(id) on delete cascade,
  accion text not null,
  estado_anterior text,
  estado_nuevo text,
  detalle jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_calendario_historial_evento
  on public.calendario_eventos_historial(evento_id, created_at desc);

create or replace function public.calendario_eventos_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  return new;
end;
$$;

create or replace function public.calendario_eventos_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accion text;
begin
  if tg_op = 'INSERT' then
    if new.clase = 'solicitud_logistica' then
      insert into public.calendario_eventos_historial(
        evento_id, accion, estado_nuevo, detalle, actor_id
      ) values (
        new.id, 'solicitud_creada', new.estado,
        jsonb_build_object(
          'fecha_solicitada', new.fecha_solicitada,
          'hora_solicitada', new.hora_solicitada,
          'tipo_transporte', new.tipo_transporte,
          'obra', new.obra
        ),
        coalesce(auth.uid(), new.created_by)
      );
    end if;
    return null;
  end if;

  if new.clase = 'solicitud_logistica' then
    v_accion := case
      when old.estado is distinct from new.estado then
        case new.estado
          when 'fecha_propuesta' then 'fecha_propuesta'
          when 'confirmado' then 'movimiento_confirmado'
          when 'realizado' then 'movimiento_realizado'
          when 'cancelado' then 'movimiento_cancelado'
          else 'estado_actualizado'
        end
      when old.costo is distinct from new.costo
        or old.moneda is distinct from new.moneda
        or old.costo_detalle is distinct from new.costo_detalle then 'costo_actualizado'
      else 'solicitud_editada'
    end;

    insert into public.calendario_eventos_historial(
      evento_id, accion, estado_anterior, estado_nuevo, detalle, actor_id
    ) values (
      new.id, v_accion, old.estado, new.estado,
      jsonb_build_object(
        'fecha_solicitada', new.fecha_solicitada,
        'fecha_propuesta', new.fecha_propuesta,
        'fecha_confirmada', new.fecha_confirmada,
        'proveedor_logistico', new.proveedor_logistico,
        'costo', new.costo,
        'moneda', new.moneda
      ),
      coalesce(auth.uid(), new.updated_by)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_calendario_eventos_touch on public.calendario_eventos;
create trigger trg_calendario_eventos_touch
before insert or update on public.calendario_eventos
for each row execute function public.calendario_eventos_touch();

drop trigger if exists trg_calendario_eventos_auditar on public.calendario_eventos;
create trigger trg_calendario_eventos_auditar
after insert or update on public.calendario_eventos
for each row execute function public.calendario_eventos_auditar();

alter table public.calendario_eventos enable row level security;
alter table public.calendario_eventos_historial enable row level security;

drop policy if exists "calendario lectura operativa" on public.calendario_eventos;
create policy "calendario lectura operativa"
on public.calendario_eventos for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

drop policy if exists "calendario alta solicitantes" on public.calendario_eventos;
create policy "calendario alta solicitantes"
on public.calendario_eventos for insert to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion'))
  )
);

drop policy if exists "calendario edicion operativa" on public.calendario_eventos;
create policy "calendario edicion operativa"
on public.calendario_eventos for update to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
  )
);

drop policy if exists "calendario baja admin" on public.calendario_eventos;
create policy "calendario baja admin"
on public.calendario_eventos for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text = 'admin')
  )
);

drop policy if exists "calendario historial lectura" on public.calendario_eventos_historial;
create policy "calendario historial lectura"
on public.calendario_eventos_historial for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

revoke all on public.calendario_eventos_historial from anon;
grant select on public.calendario_eventos_historial to authenticated;
grant select, insert, update, delete on public.calendario_eventos to authenticated;

comment on table public.calendario_eventos_historial is
  'Auditoria inmutable de solicitudes y movimientos logisticos.';

comment on column public.calendario_eventos.paradas is
  'Recorrido ordenado: [{tipo,lugar,direccion,recibe,telefono}].';
