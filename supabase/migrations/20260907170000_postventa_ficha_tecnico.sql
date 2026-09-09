-- Post venta: ficha del barco entregado.
--
-- Pedido de Área técnica (mail del 07/09). Agrega a la flota lo que hace falta
-- para mandar un técnico: contactos, horario de trabajo, fotos y documentación.
--
--   acceso_*                horario en que se permite trabajar en el barco
--   postventa_contactos     personas de contacto, con teléfono
--   postventa_adjuntos      fotos y documentación
--   bucket `postventa`      almacenamiento de esos archivos
--
-- El horario es el de TRABAJO, no el de apertura del lugar: no siempre
-- coinciden. Va como texto libre porque las excepciones son frecuentes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Horario en que se puede trabajar
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.postventa_flota
  add column if not exists acceso_dias    text,
  add column if not exists acceso_horario text,
  add column if not exists acceso_notas   text;

comment on column public.postventa_flota.acceso_dias is
  'Días en que se permite trabajar en el barco. Texto libre.';
comment on column public.postventa_flota.acceso_horario is
  'Franja horaria de trabajo. No es la de apertura del lugar: no siempre coinciden.';
comment on column public.postventa_flota.acceso_notas is
  'Detalles libres del acceso: avisos previos, restricciones, a quién dirigirse.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contactos del barco
--
-- Tabla y no columnas fijas: la cantidad de contactos por barco es variable.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.postventa_contactos (
  id         uuid primary key default gen_random_uuid(),
  barco_id   uuid not null references public.postventa_flota(id) on delete cascade,
  nombre     text not null,
  -- Relación con el barco: propietario, marinero, encargado…
  rol        text,
  telefono   text,
  notas      text,
  orden      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists postventa_contactos_barco_idx
  on public.postventa_contactos (barco_id, orden);

comment on table public.postventa_contactos is
  'Personas de contacto del barco, con teléfono.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fotos y papeles
--
-- Fotos y documentos en la misma tabla, separados por `tipo`: mismo permiso,
-- mismo borrado, misma limpieza del bucket.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.postventa_adjuntos (
  id         uuid primary key default gen_random_uuid(),
  barco_id   uuid not null references public.postventa_flota(id) on delete cascade,
  tipo       text not null default 'foto' check (tipo in ('foto', 'documento')),
  url        text not null,
  ruta       text,
  nombre     text,
  mime       text,
  autor_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists postventa_adjuntos_barco_idx
  on public.postventa_adjuntos (barco_id, tipo, created_at);

comment on column public.postventa_adjuntos.ruta is
  'Ruta en el bucket. Necesaria para borrar el archivo, no sólo la fila.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El bucket
--
-- Público: los links se comparten con técnicos externos, que no tienen usuario.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('postventa', 'postventa', true)
on conflict (id) do update set public = true;

drop policy if exists "postventa archivos lectura" on storage.objects;
create policy "postventa archivos lectura"
on storage.objects for select
using (bucket_id = 'postventa');

drop policy if exists "postventa archivos alta" on storage.objects;
create policy "postventa archivos alta"
on storage.objects for insert to authenticated
with check (bucket_id = 'postventa');

drop policy if exists "postventa archivos baja" on storage.objects;
create policy "postventa archivos baja"
on storage.objects for delete to authenticated
using (bucket_id = 'postventa');


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: los mismos que entran a la pantalla
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.puede_ver_postventa(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and (coalesce(p.is_admin, false) or p.role in ('admin', 'oficina', 'tecnica'))
  );
$$;

alter table public.postventa_contactos enable row level security;
alter table public.postventa_adjuntos  enable row level security;

drop policy if exists "postventa contactos todo" on public.postventa_contactos;
create policy "postventa contactos todo"
on public.postventa_contactos for all to authenticated
using (public.puede_ver_postventa(auth.uid()))
with check (public.puede_ver_postventa(auth.uid()));

drop policy if exists "postventa adjuntos todo" on public.postventa_adjuntos;
create policy "postventa adjuntos todo"
on public.postventa_adjuntos for all to authenticated
using (public.puede_ver_postventa(auth.uid()))
with check (public.puede_ver_postventa(auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL
-- ─────────────────────────────────────────────────────────────────────────────
select 'columnas de acceso' as control, count(*) as debe_dar_3
from information_schema.columns
where table_schema = 'public' and table_name = 'postventa_flota'
  and column_name in ('acceso_dias', 'acceso_horario', 'acceso_notas')
union all
select 'tablas nuevas', count(*)
from information_schema.tables
where table_schema = 'public' and table_name in ('postventa_contactos', 'postventa_adjuntos')
union all
select 'bucket postventa publico', count(*)
from storage.buckets where id = 'postventa' and public
union all
select 'entras a postventa (1 = si)', case when public.puede_ver_postventa(auth.uid()) then 1 else 0 end;
