-- Trazabilidad consistente de actores en panol.
-- Evita "Usuario: sin registrar" en movimientos nuevos cuando algun flujo
-- inserta snapshot/material sin completar el actor explicitamente.

alter table public.panol_obra_materiales_snapshot
  add column if not exists egreso_por uuid references public.profiles(id) on delete set null;

alter table public.panol_obra_materiales_snapshot
  alter column egreso_por set default auth.uid();

alter table public.panol_materiales
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

create index if not exists idx_panol_obra_snapshot_egreso_por
  on public.panol_obra_materiales_snapshot(egreso_por)
  where egreso_por is not null;

create index if not exists idx_panol_materiales_created_by
  on public.panol_materiales(created_by)
  where created_by is not null;

create or replace function public.panol_snapshot_fill_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.egreso_por is null and auth.uid() is not null then
    new.egreso_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_snapshot_fill_actor on public.panol_obra_materiales_snapshot;
create trigger trg_panol_snapshot_fill_actor
  before insert or update on public.panol_obra_materiales_snapshot
  for each row
  execute function public.panol_snapshot_fill_actor();

create or replace function public.panol_materiales_fill_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_materiales_fill_created_by on public.panol_materiales;
create trigger trg_panol_materiales_fill_created_by
  before insert on public.panol_materiales
  for each row
  execute function public.panol_materiales_fill_created_by();

-- Backfill seguro: si el movimiento vino de un aviso/envio a panol,
-- usar primero quien lo marco recibido y si no quien creo el aviso.
update public.panol_obra_materiales_snapshot s
   set egreso_por = coalesce(e.recibido_por, e.created_by)
  from public.panol_envios e
 where s.egreso_por is null
   and s.panol_envio_id = e.id
   and coalesce(e.recibido_por, e.created_by) is not null;

-- Backfill de asignaciones: la fila positiva de transferencia hereda el actor
-- de su espejo egresado cuando coinciden material, origen, destino, sede y cantidad.
update public.panol_obra_materiales_snapshot ingreso
   set egreso_por = egreso.egreso_por
  from public.panol_obra_materiales_snapshot egreso
 where ingreso.egreso_por is null
   and ingreso.source = 'transferencia_ingreso'
   and egreso.source = 'transferencia_egreso'
   and egreso.egreso_por is not null
   and coalesce(ingreso.material_id::text, '') = coalesce(egreso.material_id::text, '')
   and coalesce(ingreso.descripcion, '') = coalesce(egreso.descripcion, '')
   and coalesce(ingreso.obra_origen_id::text, '') = coalesce(egreso.obra_id::text, '')
   and coalesce(ingreso.obra_id::text, '') = coalesce(egreso.egreso_destino_obra_id::text, '')
   and coalesce(ingreso.stock_sede, '') = coalesce(egreso.stock_sede, '')
   and coalesce(ingreso.cantidad, 0) = coalesce(egreso.cantidad_egresada, egreso.cantidad, 0);

comment on column public.panol_obra_materiales_snapshot.egreso_por is
  'Usuario que registro el movimiento de panol. Se completa automaticamente para ingresos, asignaciones, egresos y ajustes.';

comment on column public.panol_materiales.created_by is
  'Usuario que creo o incorporo el material al catalogo.';
