-- Seguimiento operativo de la grilla de fechas.
-- Permite marcar por barco + evento si ya fue pedido/gestionado.

create table if not exists public.fechas_evento_estados (
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  evento_key text not null,
  estado text not null default 'pedido',
  pedido_at timestamptz,
  pedido_por uuid default auth.uid(),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (obra_id, evento_key)
);

alter table public.fechas_evento_estados
  add column if not exists estado text not null default 'pedido',
  add column if not exists pedido_at timestamptz,
  add column if not exists pedido_por uuid default auth.uid(),
  add column if not exists nota text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.fechas_evento_estados
    add constraint fechas_evento_estados_estado_chk
    check (estado in ('pedido'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_fechas_evento_estados_obra
  on public.fechas_evento_estados(obra_id);

create index if not exists idx_fechas_evento_estados_evento
  on public.fechas_evento_estados(evento_key);
