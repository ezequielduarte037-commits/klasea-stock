-- Materiales de circuitos que no compra Pañol, pero forman parte del costo y
-- del consumo real de cada barco: Laminación y Maderas.

create table if not exists public.materiales_secundarios_precios (
  id uuid primary key default gen_random_uuid(),
  catalogo text not null check (catalogo in ('laminacion', 'maderas')),
  material_id uuid not null,
  proveedor text,
  precio_base numeric not null check (precio_base >= 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  unidad_precio text not null,
  factor_unidad_matriz numeric not null default 1 check (factor_unidad_matriz > 0),
  precio_unidad_matriz numeric not null check (precio_unidad_matriz >= 0),
  incluye_iva boolean not null default false,
  fecha date not null default current_date,
  fuente text not null,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (catalogo, material_id, fuente)
);

comment on table public.materiales_secundarios_precios is
  'Precios de Laminación y Maderas. precio_base respeta la unidad cotizada; precio_unidad_matriz ya incluye conversión de envase/rollo para costear la cantidad de la plantilla.';

create index if not exists idx_materiales_secundarios_precios_material_fecha
  on public.materiales_secundarios_precios (catalogo, material_id, fecha desc, created_at desc);

alter table public.materiales_secundarios_precios enable row level security;

drop policy if exists "secundarios precios lectura" on public.materiales_secundarios_precios;
create policy "secundarios precios lectura"
on public.materiales_secundarios_precios for select to authenticated
using (auth.uid() is not null);

drop policy if exists "secundarios precios escritura" on public.materiales_secundarios_precios;
create policy "secundarios precios escritura"
on public.materiales_secundarios_precios for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras', 'tecnica'))
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'compras', 'tecnica'))
  )
);

grant select, insert, update, delete on public.materiales_secundarios_precios to authenticated;

-- Vínculo estable con la obra de Producción. Se conserva el texto legado para
-- no romper pantallas ni movimientos anteriores.
alter table public.laminacion_obras
  add column if not exists produccion_obra_id uuid references public.produccion_obras(id) on delete set null;
alter table public.laminacion_movimientos
  add column if not exists produccion_obra_id uuid references public.produccion_obras(id) on delete set null;
alter table public.movimientos
  add column if not exists produccion_obra_id uuid references public.produccion_obras(id) on delete set null;

create index if not exists idx_laminacion_obras_produccion_obra
  on public.laminacion_obras (produccion_obra_id);
create index if not exists idx_laminacion_movimientos_produccion_obra
  on public.laminacion_movimientos (produccion_obra_id, material_id, tipo);
create index if not exists idx_maderas_movimientos_produccion_obra
  on public.movimientos (produccion_obra_id, material_id);

create or replace function public.normalizar_codigo_obra(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(regexp_replace(upper(trim(coalesce(p_texto, ''))), '^K', ''), '[^A-Z0-9]', '', 'g')
$$;

-- Backfill sólo por coincidencia exacta normalizada. No se adivina una obra
-- cuando el destino dice, por ejemplo, REPARACIÓN K55 u OBRAS VARIAS.
update public.laminacion_obras lo
set produccion_obra_id = po.id
from public.produccion_obras po
where lo.produccion_obra_id is null
  and public.normalizar_codigo_obra(lo.nombre) = public.normalizar_codigo_obra(po.codigo)
  and public.normalizar_codigo_obra(lo.nombre) <> '';

update public.laminacion_movimientos lm
set produccion_obra_id = po.id
from public.produccion_obras po
where lm.produccion_obra_id is null
  and public.normalizar_codigo_obra(coalesce(lm.destino, lm.obra)) = public.normalizar_codigo_obra(po.codigo)
  and public.normalizar_codigo_obra(coalesce(lm.destino, lm.obra)) <> '';

update public.movimientos m
set produccion_obra_id = po.id
from public.produccion_obras po
where m.produccion_obra_id is null
  and public.normalizar_codigo_obra(m.obra) = public.normalizar_codigo_obra(po.codigo)
  and public.normalizar_codigo_obra(m.obra) <> '';

create or replace function public.vincular_movimiento_laminacion_a_obra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.produccion_obra_id is null then
    select po.id into new.produccion_obra_id
    from public.produccion_obras po
    where public.normalizar_codigo_obra(po.codigo) =
          public.normalizar_codigo_obra(coalesce(new.destino, new.obra))
      and public.normalizar_codigo_obra(coalesce(new.destino, new.obra)) <> ''
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_laminacion_movimiento_vincular_obra on public.laminacion_movimientos;
create trigger trg_laminacion_movimiento_vincular_obra
before insert or update of destino, obra, produccion_obra_id
on public.laminacion_movimientos
for each row execute function public.vincular_movimiento_laminacion_a_obra();

create or replace function public.vincular_movimiento_madera_a_obra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.produccion_obra_id is null then
    select po.id into new.produccion_obra_id
    from public.produccion_obras po
    where public.normalizar_codigo_obra(po.codigo) = public.normalizar_codigo_obra(new.obra)
      and public.normalizar_codigo_obra(new.obra) <> ''
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_maderas_movimiento_vincular_obra on public.movimientos;
create trigger trg_maderas_movimiento_vincular_obra
before insert or update of obra, produccion_obra_id
on public.movimientos
for each row execute function public.vincular_movimiento_madera_a_obra();

-- Cotización Plaquimet K52-28 del 03/09/2026. El precio base es el precio por
-- kg/l/m² con IVA; el factor convierte a la unidad usada por la plantilla.
with valores(nombre, precio_base, unidad_precio, factor, precio_matriz, notas) as (
  values
    ('BRITEC 1000B', 4.1745::numeric, 'kg', 20::numeric, 83.49::numeric, '40 kg / 2 envases'),
    ('BRITEC 2000B', 4.2350::numeric, 'kg', 20::numeric, 84.70::numeric, '260 kg / 13 envases'),
    ('BRITEC 2017B', 4.4165::numeric, 'kg', 20::numeric, 88.33::numeric, '100 kg / 5 envases'),
    ('Resina 504 (Isof.) 220l', 2.2385::numeric, 'kg', 220::numeric, 492.47::numeric, '220 kg / tambor'),
    ('Resina 101 220l', 1.8150::numeric, 'kg', 220::numeric, 399.30::numeric, '3520 kg / 16 tambores'),
    ('Catalizador (Aperox)', 8.4700::numeric, 'kg', 20::numeric, 169.40::numeric, '120 kg / 6 envases'),
    ('Coremat 2mm', 5.3240::numeric, 'm2', 80::numeric, 425.92::numeric, '320 m² / 4 rollos'),
    ('Monómero de estireno', 3.4485::numeric, 'kg', 190::numeric, 655.215::numeric, '570 kg / 3 tambores'),
    ('Mat 300', 2.1175::numeric, 'kg', 45::numeric, 95.2875::numeric, '990 kg / 22 rollos'),
    ('Mat 450', 2.1175::numeric, 'kg', 50::numeric, 105.875::numeric, '100 kg / 2 rollos'),
    ('Acelerador (Octoato de cob.)', 7.6835::numeric, 'litro', 20::numeric, 153.67::numeric, '40 litros / 2 envases'),
    ('Roving 600', 2.6015::numeric, 'kg', 75::numeric, 195.1125::numeric, '750 kg / 10 rollos')
)
insert into public.materiales_secundarios_precios (
  catalogo, material_id, proveedor, precio_base, moneda, unidad_precio,
  factor_unidad_matriz, precio_unidad_matriz, incluye_iva, fecha, fuente, notas
)
select 'laminacion', lm.id, 'Plaquimet', v.precio_base, 'USD', v.unidad_precio,
       v.factor, v.precio_matriz, true, date '2026-09-03',
       'Plaquimet · K52-28 · 03/09/2026', v.notas
from valores v
join public.laminacion_materiales lm on lower(trim(lm.nombre)) = lower(trim(v.nombre))
on conflict (catalogo, material_id, fuente) do update set
  proveedor = excluded.proveedor,
  precio_base = excluded.precio_base,
  moneda = excluded.moneda,
  unidad_precio = excluded.unidad_precio,
  factor_unidad_matriz = excluded.factor_unidad_matriz,
  precio_unidad_matriz = excluded.precio_unidad_matriz,
  incluye_iva = excluded.incluye_iva,
  fecha = excluded.fecha,
  notas = excluded.notas;

-- Lista de maderas recibida el 07/09/2026. Sólo se actualizan coincidencias
-- inequívocas del catálogo existente. Fibro 5,5 se asocia a Fibrofacil 6 mm,
-- tal como indicó Compras. Los valores se conservan en su moneda original.
with valores(nombre, precio, moneda, unidad) as (
  values
    ('Placa Carpintero', 75::numeric, 'USD', 'placa'),
    ('Terciado 3mm', 14.50::numeric, 'USD', 'placa'),
    ('Terciado 6mm', 27.50::numeric, 'USD', 'placa'),
    ('Terciado 9mm', 37::numeric, 'USD', 'placa'),
    ('Terciado 12mm', 47.50::numeric, 'USD', 'placa'),
    ('Terciado 15mm', 56::numeric, 'USD', 'placa'),
    ('Terciado 18mm', 64::numeric, 'USD', 'placa'),
    ('Fibrofacil 6mm', 20600::numeric, 'ARS', 'placa'),
    ('Fibrofacil 9mm', 29019::numeric, 'ARS', 'placa'),
    ('Fibrofacil 12mm', 35900::numeric, 'ARS', 'placa'),
    ('Fibrofacil 15mm', 46031::numeric, 'ARS', 'placa'),
    ('Tablón Lenga', 3600::numeric, 'ARS', 'tablón')
)
insert into public.materiales_secundarios_precios (
  catalogo, material_id, proveedor, precio_base, moneda, unidad_precio,
  factor_unidad_matriz, precio_unidad_matriz, incluye_iva, fecha, fuente, notas
)
select 'maderas', m.id, null, v.precio, v.moneda, v.unidad,
       1, v.precio, true, date '2026-09-07',
       'Lista de maderas · 07/09/2026',
       case when v.nombre = 'Fibrofacil 6mm' then 'Precio informado como Fibro 5,5 mm; asociado al ítem de catálogo de 6 mm.' else null end
from valores v
join public.materiales m on lower(regexp_replace(m.nombre, '\s+', '', 'g')) = lower(regexp_replace(v.nombre, '\s+', '', 'g'))
on conflict (catalogo, material_id, fuente) do update set
  precio_base = excluded.precio_base,
  moneda = excluded.moneda,
  unidad_precio = excluded.unidad_precio,
  precio_unidad_matriz = excluded.precio_unidad_matriz,
  incluye_iva = excluded.incluye_iva,
  fecha = excluded.fecha,
  notas = excluded.notas;
