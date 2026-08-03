-- Compras/Admin pueden registrar movimientos coordinados por fuera del flujo
-- de solicitud (moto mensajeria, tramites, retiros, etc.).

alter table public.calendario_eventos
  add column if not exists origen_manual boolean not null default false;

alter table public.calendario_eventos
  drop constraint if exists calendario_eventos_transporte_check;

alter table public.calendario_eventos
  add constraint calendario_eventos_transporte_check
  check (tipo_transporte is null or tipo_transporte in (
    'flete', 'camion', 'hidrogrua', 'grua', 'motomensajeria', 'otro'
  ));

drop policy if exists "calendario alta solicitantes" on public.calendario_eventos;
create policy "calendario alta solicitantes"
on public.calendario_eventos for insert to authenticated
with check (
  coalesce(created_by, auth.uid()) = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'administracion', 'compras'))
  )
);

comment on column public.calendario_eventos.origen_manual is
  'true cuando Admin/Compras anota directamente un movimiento ya coordinado, sin solicitud previa.';
