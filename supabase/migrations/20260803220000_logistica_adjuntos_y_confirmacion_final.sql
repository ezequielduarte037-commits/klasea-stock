-- Logistica v3: la aceptacion de Tecnica no confirma automaticamente el viaje.
-- Compras debe realizar la confirmacion final. Tambien agrega respaldo documental
-- para remitos, facturas, fotos y otros archivos del movimiento.

alter table public.calendario_eventos
  add column if not exists aceptado_por uuid references public.profiles(id) on delete set null,
  add column if not exists aceptado_at timestamptz;

alter table public.calendario_eventos
  drop constraint if exists calendario_eventos_estado_check;

alter table public.calendario_eventos
  add constraint calendario_eventos_estado_check
  check (estado in (
    'solicitado',
    'fecha_propuesta',
    'fecha_aceptada',
    'confirmado',
    'realizado',
    'cancelado'
  ));

create table if not exists public.calendario_eventos_archivos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.calendario_eventos(id) on delete cascade,
  categoria text not null default 'otro'
    check (categoria in ('remito', 'factura', 'foto', 'otro')),
  nombre text not null,
  storage_path text not null unique,
  url text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_calendario_archivos_evento
  on public.calendario_eventos_archivos(evento_id, created_at desc);

alter table public.calendario_eventos_archivos enable row level security;

drop policy if exists "calendario archivos lectura" on public.calendario_eventos_archivos;
create policy "calendario archivos lectura"
on public.calendario_eventos_archivos for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

drop policy if exists "calendario archivos alta" on public.calendario_eventos_archivos;
create policy "calendario archivos alta"
on public.calendario_eventos_archivos for insert to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

drop policy if exists "calendario archivos baja" on public.calendario_eventos_archivos;
create policy "calendario archivos baja"
on public.calendario_eventos_archivos for delete to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
  )
);

grant select, insert, delete on public.calendario_eventos_archivos to authenticated;

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists "calendario logistica documentos insert" on storage.objects;
create policy "calendario logistica documentos insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = 'calendario-logistica'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

drop policy if exists "calendario logistica documentos select" on storage.objects;
create policy "calendario logistica documentos select"
on storage.objects for select to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = 'calendario-logistica'
);

drop policy if exists "calendario logistica documentos delete" on storage.objects;
create policy "calendario logistica documentos delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = 'calendario-logistica'
  and (
    owner = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras'))
    )
  )
);

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
          when 'fecha_aceptada' then 'fecha_aceptada_por_solicitante'
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

comment on column public.calendario_eventos.aceptado_at is
  'Momento en que el solicitante acepto la fecha propuesta. Aun requiere confirmacion final de Compras.';

comment on table public.calendario_eventos_archivos is
  'Remitos, facturas, fotos y otros respaldos documentales de un movimiento logistico.';
