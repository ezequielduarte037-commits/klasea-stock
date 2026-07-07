-- Fechas de producción: alcance por línea, botada estimada y atrasos.
-- Idempotente para instalaciones donde estas tablas ya existan fuera de migraciones.

create table if not exists public.fechas_eventos (
  key text primary key,
  label text not null,
  short text,
  orden integer,
  activo boolean not null default true,
  modelos text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fechas_eventos
  add column if not exists short text,
  add column if not exists orden integer,
  add column if not exists activo boolean not null default true,
  add column if not exists modelos text[],
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

comment on column public.fechas_eventos.modelos is
  'Null o vacío = aplica a todas las líneas. Con valores, aplica sólo a esos tokens/modelos (ej. 37, 55, H).';

create table if not exists public.fechas_offsets (
  evento_key text not null,
  modelo text not null default '*',
  semanas numeric not null default 0,
  referencia text not null default 'desmolde',
  updated_at timestamptz not null default now(),
  primary key (evento_key, modelo)
);

alter table public.fechas_offsets
  add column if not exists referencia text not null default 'desmolde',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.fechas_offsets
    add constraint fechas_offsets_referencia_chk
    check (referencia in ('desmolde', 'botada'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_fechas_eventos_activo_orden
  on public.fechas_eventos(activo, orden);

create index if not exists idx_fechas_offsets_modelo
  on public.fechas_offsets(modelo);

alter table public.produccion_obras
  add column if not exists atraso_dias integer not null default 0,
  add column if not exists atraso_motivo text,
  add column if not exists atraso_updated_at timestamptz;

comment on column public.produccion_obras.atraso_dias is
  'Días de atraso operativo aplicados al cronograma de fechas. Usado para vacaciones/pausas sin alterar la fecha base.';

comment on column public.produccion_obras.atraso_motivo is
  'Motivo del atraso aplicado al cronograma, por ejemplo vacaciones.';
