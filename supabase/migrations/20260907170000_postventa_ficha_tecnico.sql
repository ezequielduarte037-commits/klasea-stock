-- Barcos entregados: todo lo que el técnico necesita para llegar y entrar.
--
-- POR QUÉ. Del mail de Gastón (07/09): cuando hay que mandar a un tercerizado a
-- un barco, hoy no hay dónde mirar el teléfono del dueño, ni cómo se ve la
-- embarcación, ni el seguro que le van a pedir en la guardia, ni el horario en
-- que lo dejan entrar. Todo eso vive en WhatsApp de alguien. La pantalla ya
-- sabe DÓNDE está el barco; le falta lo demás para que sirva sin preguntar.
--
-- Cuatro cosas:
--
--   acceso_*                cuándo se puede entrar al barrio o la marina
--   postventa_contactos     dueño + marinero + familiar, cada uno con teléfono
--   postventa_adjuntos      fotos de la embarcación y papeles (el seguro)
--   bucket `postventa`      donde viven esos archivos
--
-- Los horarios son TEXTO LIBRE a propósito. "Lunes a viernes de 8 a 17, avisar
-- con 24 h en la guardia" es más útil que tres columnas estructuradas que nadie
-- va a completar y que igual no cubren el caso raro, que en las marinas es la
-- mitad de los casos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Acceso: cuándo se puede entrar
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.postventa_flota
  add column if not exists acceso_dias    text,
  add column if not exists acceso_horario text,
  add column if not exists acceso_notas   text;

comment on column public.postventa_flota.acceso_dias is
  'Días en que dejan entrar a trabajar. Texto libre: "Lunes a viernes", "todos menos domingo".';
comment on column public.postventa_flota.acceso_horario is
  'Franja horaria permitida. Texto libre: "8 a 17", "8 a 12 y 14 a 18".';
comment on column public.postventa_flota.acceso_notas is
  'Lo que hay que saber para pasar la guardia: a quién avisar, con cuánta anticipación, qué piden.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contactos del barco
--
-- Una tabla y no tres columnas: el mail pide "el dueño y otras 2 personas", pero
-- en cuanto exista va a haber un barco con cuatro. Con filas, sumar uno más no
-- es una migración.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.postventa_contactos (
  id         uuid primary key default gen_random_uuid(),
  barco_id   uuid not null references public.postventa_flota(id) on delete cascade,
  nombre     text not null,
  -- Quién es respecto del barco: dueño, marinero, encargado, familiar…
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
  'Quién atiende por cada barco: dueño, marinero, familiar. Con teléfono, para que el técnico llame antes de ir.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fotos y papeles
--
-- Fotos y documentos en la MISMA tabla, separados por `tipo`: son el mismo
-- gesto -subir un archivo del barco- y tenerlos en dos lados obligaría a
-- duplicar permisos, borrado y limpieza del bucket.
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
  'Ruta dentro del bucket. Se guarda además de la URL para poder borrar el archivo y no dejarlo colgado.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El bucket
--
-- Público porque el punto es MANDARLE el link a un técnico tercerizado, que no
-- tiene usuario del sistema. Quien sube decide qué sube: acá va la foto del
-- barco y la póliza, no papeles del astillero.
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
-- CONTROL — los cuatro tienen que dar lo esperado
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
