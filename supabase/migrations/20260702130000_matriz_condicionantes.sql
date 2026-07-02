-- Condicionantes de matriz por modelo.
-- Permite modelar opcionales estandar/configuraciones de linea:
-- K55 con/sin camarote marinero, motor Iveco, grupo electrogeno, etc.

create extension if not exists pgcrypto;

create table if not exists public.panol_material_categorias (
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  categoria_id uuid not null references public.panol_categorias(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (material_id, categoria_id)
);

create table if not exists public.panol_opciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.panol_opcion_valores (
  id uuid primary key default gen_random_uuid(),
  opcion_id uuid not null references public.panol_opciones(id) on delete cascade,
  valor text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (opcion_id, valor)
);

create table if not exists public.panol_material_condicion (
  material_id uuid primary key references public.panol_materiales(id) on delete cascade,
  opcion_valor_id uuid references public.panol_opcion_valores(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.panol_material_proveedores (
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  proveedor_id uuid not null references public.panol_proveedores(id) on delete cascade,
  precio numeric,
  moneda text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (material_id, proveedor_id)
);

create table if not exists public.panol_matriz_condicionantes (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  nombre text not null,
  tipo text not null default 'opcional_estandar',
  descripcion text,
  activo_por_defecto boolean not null default true,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_matriz_condicionantes_tipo_chk
    check (tipo in ('opcional_estandar', 'configuracion', 'motorizacion', 'equipamiento', 'otro')),
  unique (modelo, nombre)
);

create table if not exists public.panol_matriz_condicionante_items (
  id uuid primary key default gen_random_uuid(),
  condicionante_id uuid not null references public.panol_matriz_condicionantes(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text not null,
  cantidad numeric,
  unidad text,
  tipo_item text not null default 'matriz',
  notas text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_matriz_condicionante_items_tipo_chk
    check (tipo_item in ('matriz', 'extra', 'quita'))
);

create index if not exists idx_panol_matriz_condicionantes_modelo
  on public.panol_matriz_condicionantes(modelo, activo, orden);

create index if not exists idx_panol_matriz_condicionante_items_condicionante
  on public.panol_matriz_condicionante_items(condicionante_id, activo, orden);

create index if not exists idx_panol_matriz_condicionante_items_material
  on public.panol_matriz_condicionante_items(material_id)
  where material_id is not null;

alter table public.panol_material_categorias enable row level security;
alter table public.panol_opciones enable row level security;
alter table public.panol_opcion_valores enable row level security;
alter table public.panol_material_condicion enable row level security;
alter table public.panol_material_proveedores enable row level security;
alter table public.panol_matriz_condicionantes enable row level security;
alter table public.panol_matriz_condicionante_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'panol_material_categorias',
    'panol_opciones',
    'panol_opcion_valores',
    'panol_material_condicion',
    'panol_material_proveedores',
    'panol_matriz_condicionantes',
    'panol_matriz_condicionante_items'
  ] loop
    execute format('drop policy if exists "%1$s authenticated select" on public.%1$I', t);
    execute format('create policy "%1$s authenticated select" on public.%1$I for select to authenticated using (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s authenticated insert" on public.%1$I', t);
    execute format('create policy "%1$s authenticated insert" on public.%1$I for insert to authenticated with check (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s authenticated update" on public.%1$I', t);
    execute format('create policy "%1$s authenticated update" on public.%1$I for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s authenticated delete" on public.%1$I', t);
    execute format('create policy "%1$s authenticated delete" on public.%1$I for delete to authenticated using (auth.uid() is not null)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

insert into public.panol_opciones(nombre, orden)
values
  ('Motorizacion', 10),
  ('Motor', 20),
  ('Grupo electrogeno', 30),
  ('Distribucion interior', 40)
on conflict (nombre) do nothing;

insert into public.panol_opcion_valores(opcion_id, valor, orden)
select o.id, v.valor, v.orden
from public.panol_opciones o
join (
  values
    ('Motorizacion', 'Linea de eje', 10),
    ('Motorizacion', 'Fuera de borda', 20),
    ('Motorizacion', 'Dentro-fuera', 30),
    ('Motor', 'Iveco', 10),
    ('Motor', 'Volvo', 20),
    ('Motor', 'Yanmar', 30),
    ('Grupo electrogeno', 'Con grupo electrogeno', 10),
    ('Grupo electrogeno', 'Sin grupo electrogeno', 20),
    ('Distribucion interior', 'Camarote marinero', 10),
    ('Distribucion interior', 'Vestidor camarote principal', 20)
) as v(opcion, valor, orden) on v.opcion = o.nombre
on conflict (opcion_id, valor) do nothing;

insert into public.panol_matriz_condicionantes(modelo, nombre, tipo, descripcion, activo_por_defecto, orden)
values
  ('55', 'Camarote marinero', 'opcional_estandar', 'K55 lo lleva como estandar, pero puede no llevarlo. No es adicional del cliente.', true, 10),
  ('55', 'Vestidor camarote principal', 'opcional_estandar', 'K55 lo lleva como estandar, pero puede no llevarlo. No es adicional del cliente.', true, 20),
  ('55', 'Motor Iveco', 'motorizacion', 'Items que aplican cuando la configuracion del barco lleva motor Iveco.', false, 30),
  ('55', 'Grupo electrogeno', 'equipamiento', 'Items que aplican cuando el barco lleva grupo electrogeno.', false, 40)
on conflict (modelo, nombre) do update
set tipo = excluded.tipo,
    descripcion = excluded.descripcion,
    activo_por_defecto = excluded.activo_por_defecto,
    orden = excluded.orden,
    updated_at = now();
