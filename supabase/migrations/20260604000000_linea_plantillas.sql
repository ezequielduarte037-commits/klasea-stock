-- Plantillas de materiales por linea de produccion de laminacion
-- Reemplaza el objeto LISTAS_BASE hardcodeado en ObrasLaminacionScreen.jsx.

create table if not exists public.linea_plantillas (
  id uuid primary key default gen_random_uuid(),
  linea text unique not null,
  nombre text,
  descripcion text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.linea_plantilla_items (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.linea_plantillas(id) on delete cascade,
  material_id uuid not null references public.laminacion_materiales(id) on delete cascade,
  cantidad numeric not null default 0,
  orden int default 0,
  notas text,
  created_at timestamptz not null default now(),
  unique (plantilla_id, material_id)
);

alter table public.linea_plantillas enable row level security;
alter table public.linea_plantilla_items enable row level security;

drop policy if exists "lectura plantillas autenticados" on public.linea_plantillas;
create policy "lectura plantillas autenticados"
  on public.linea_plantillas for select
  using (auth.uid() is not null);

drop policy if exists "edicion plantillas admin tecnica" on public.linea_plantillas;
create policy "edicion plantillas admin tecnica"
  on public.linea_plantillas for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin or p.role in ('admin','tecnica'))
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin or p.role in ('admin','tecnica'))
    )
  );

drop policy if exists "lectura items plantillas autenticados" on public.linea_plantilla_items;
create policy "lectura items plantillas autenticados"
  on public.linea_plantilla_items for select
  using (auth.uid() is not null);

drop policy if exists "edicion items plantillas admin tecnica" on public.linea_plantilla_items;
create policy "edicion items plantillas admin tecnica"
  on public.linea_plantilla_items for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin or p.role in ('admin','tecnica'))
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin or p.role in ('admin','tecnica'))
    )
  );

drop trigger if exists trg_linea_plantillas_upd on public.linea_plantillas;
create trigger trg_linea_plantillas_upd
  before update on public.linea_plantillas
  for each row execute function public.touch_updated_at();

insert into public.linea_plantillas (linea, nombre, descripcion, activa)
values
  ('K34', 'Hunter 34', 'Lista base de laminacion K34', true),
  ('K37', 'Hunter 37', 'Lista base de laminacion K37', true),
  ('K42', 'Hunter 42', 'Lista base de laminacion K42', true),
  ('K43', 'Hunter 43', 'Lista base de laminacion K43', true),
  ('K52', 'Hunter 52', 'Lista base de laminacion K52', true),
  ('K55', 'Hunter 55', 'Lista base de laminacion K55', true),
  ('K64', 'Hunter 64', 'Lista base de laminacion K64', true)
on conflict (linea) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      updated_at = now();

insert into public.linea_plantilla_items (plantilla_id, material_id, cantidad, orden)
select p.id, v.material_id::uuid, v.cantidad, v.orden
from (
  values
    ('K34', '6357d1e1-a448-4890-b022-62f600f2da96', 13, 1),
    ('K34', '594d6723-8e14-497f-83a5-f48ddc0f1562', 4, 2),
    ('K34', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 2, 3),
    ('K34', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 7, 4),
    ('K34', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 5),
    ('K34', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 1, 6),
    ('K34', 'de7b6037-289d-439a-bd10-fc3141a601e8', 2, 7),
    ('K34', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 2, 8),
    ('K34', '3123f200-d261-4046-a098-645e821f01d2', 11, 9),
    ('K34', '7577227f-b79b-4f71-9945-b37c521e9a27', 4, 10),
    ('K34', '6c4f8c92-154a-476d-89cf-249f1211eeca', 1, 11),
    ('K34', '6843da6b-6d71-4b9e-a294-887e4086b9d0', 1, 12),
    ('K34', 'cde2e86c-84de-4f6a-86d1-91bf05a10d4f', 12, 13),
    ('K34', 'c5128caa-51bb-4a62-b35a-864c4dd9faf0', 2, 14),
    ('K34', '863eb63f-663a-4881-91c4-12121ad3fa52', 3, 15),

    ('K37', '3123f200-d261-4046-a098-645e821f01d2', 10, 1),
    ('K37', '5a376089-7ed6-4bea-8254-5ea4f0490026', 4, 2),
    ('K37', '6c4f8c92-154a-476d-89cf-249f1211eeca', 1, 3),
    ('K37', '6357d1e1-a448-4890-b022-62f600f2da96', 12, 4),
    ('K37', 'c536d864-5fa4-4409-9944-114ed809f7cd', 1, 5),
    ('K37', '39934627-7ae9-4ff7-833f-a428b0da5b13', 2, 6),
    ('K37', '74814024-b661-4bca-bdd5-facab2999715', 3, 7),
    ('K37', '721f20e8-c1f0-4aca-98c9-e9480c9a673c', 1, 8),
    ('K37', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 2, 9),
    ('K37', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 10, 10),
    ('K37', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 11),
    ('K37', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 2, 12),
    ('K37', 'de7b6037-289d-439a-bd10-fc3141a601e8', 3, 13),
    ('K37', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 2, 14),
    ('K37', '6e5d1272-d42b-49cd-bfbd-47d623c36d3a', 12, 15),
    ('K37', 'cde2e86c-84de-4f6a-86d1-91bf05a10d4f', 12, 16),
    ('K37', 'c5128caa-51bb-4a62-b35a-864c4dd9faf0', 2, 17),
    ('K37', '863eb63f-663a-4881-91c4-12121ad3fa52', 7, 18),
    ('K37', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 10, 19),

    ('K42', '3123f200-d261-4046-a098-645e821f01d2', 10, 1),
    ('K42', '5a376089-7ed6-4bea-8254-5ea4f0490026', 4, 2),
    ('K42', '6c4f8c92-154a-476d-89cf-249f1211eeca', 1, 3),
    ('K42', '721f20e8-c1f0-4aca-98c9-e9480c9a673c', 1, 4),
    ('K42', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 3, 5),
    ('K42', '6357d1e1-a448-4890-b022-62f600f2da96', 20, 6),
    ('K42', 'c536d864-5fa4-4409-9944-114ed809f7cd', 2, 7),
    ('K42', '39934627-7ae9-4ff7-833f-a428b0da5b13', 3, 8),
    ('K42', '594d6723-8e14-497f-83a5-f48ddc0f1562', 4, 9),
    ('K42', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 13, 10),
    ('K42', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 11),
    ('K42', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 2, 12),
    ('K42', 'de7b6037-289d-439a-bd10-fc3141a601e8', 4, 13),
    ('K42', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 3, 14),
    ('K42', '6e5d1272-d42b-49cd-bfbd-47d623c36d3a', 9, 15),
    ('K42', 'cde2e86c-84de-4f6a-86d1-91bf05a10d4f', 7, 16),
    ('K42', '863eb63f-663a-4881-91c4-12121ad3fa52', 3, 17),
    ('K42', 'c5128caa-51bb-4a62-b35a-864c4dd9faf0', 2, 18),
    ('K42', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 10, 19),

    ('K43', '6357d1e1-a448-4890-b022-62f600f2da96', 30, 1),
    ('K43', 'c536d864-5fa4-4409-9944-114ed809f7cd', 3, 2),
    ('K43', '39934627-7ae9-4ff7-833f-a428b0da5b13', 6, 3),
    ('K43', '594d6723-8e14-497f-83a5-f48ddc0f1562', 7, 4),
    ('K43', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 4, 5),
    ('K43', '721f20e8-c1f0-4aca-98c9-e9480c9a673c', 1, 6),
    ('K43', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 18, 7),
    ('K43', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 8),
    ('K43', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 3, 9),
    ('K43', 'de7b6037-289d-439a-bd10-fc3141a601e8', 4, 10),
    ('K43', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 3, 11),
    ('K43', '3123f200-d261-4046-a098-645e821f01d2', 21, 12),
    ('K43', '6c4f8c92-154a-476d-89cf-249f1211eeca', 2, 13),
    ('K43', '5a376089-7ed6-4bea-8254-5ea4f0490026', 8, 14),
    ('K43', '6e5d1272-d42b-49cd-bfbd-47d623c36d3a', 12, 15),
    ('K43', 'cde2e86c-84de-4f6a-86d1-91bf05a10d4f', 16, 16),
    ('K43', 'c5128caa-51bb-4a62-b35a-864c4dd9faf0', 2, 17),
    ('K43', '863eb63f-663a-4881-91c4-12121ad3fa52', 8, 18),
    ('K43', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 12, 19),

    ('K52', '3123f200-d261-4046-a098-645e821f01d2', 13, 1),
    ('K52', '5a376089-7ed6-4bea-8254-5ea4f0490026', 5, 2),
    ('K52', '6c4f8c92-154a-476d-89cf-249f1211eeca', 2, 3),
    ('K52', '6357d1e1-a448-4890-b022-62f600f2da96', 22, 4),
    ('K52', '594d6723-8e14-497f-83a5-f48ddc0f1562', 10, 5),
    ('K52', 'c536d864-5fa4-4409-9944-114ed809f7cd', 2, 6),
    ('K52', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 4, 7),
    ('K52', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 8),
    ('K52', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 16, 9),
    ('K52', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 3, 10),
    ('K52', 'de7b6037-289d-439a-bd10-fc3141a601e8', 6, 11),
    ('K52', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 2, 12),
    ('K52', 'c5128caa-51bb-4a62-b35a-864c4dd9faf0', 1, 13),
    ('K52', '963f4103-474f-4e19-8836-381bb83787a8', 11, 14),
    ('K52', 'cde2e86c-84de-4f6a-86d1-91bf05a10d4f', 11, 15),
    ('K52', '6e5d1272-d42b-49cd-bfbd-47d623c36d3a', 24, 16),
    ('K52', '863eb63f-663a-4881-91c4-12121ad3fa52', 16, 17),
    ('K52', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 14, 18),

    ('K55', '3123f200-d261-4046-a098-645e821f01d2', 5, 1),
    ('K55', '6c4f8c92-154a-476d-89cf-249f1211eeca', 1, 2),
    ('K55', 'a3740499-d14c-480b-9c8f-c7d8cc31deeb', 1, 3),
    ('K55', '6357d1e1-a448-4890-b022-62f600f2da96', 8, 4),
    ('K55', 'c536d864-5fa4-4409-9944-114ed809f7cd', 2, 5),
    ('K55', '74814024-b661-4bca-bdd5-facab2999715', 8, 6),
    ('K55', '6497b1a1-7d0e-49e0-acd4-600e08a0b359', 9, 7),
    ('K55', '75352cd6-1828-4cdb-8971-60a1be60194b', 1, 8),
    ('K55', '38903dae-16fd-4afb-8e98-704cc8d7fd1f', 1, 9),
    ('K55', 'de7b6037-289d-439a-bd10-fc3141a601e8', 2, 10),
    ('K55', '3cfd9c4c-4c93-4513-90fa-045f01cc3460', 2, 11),
    ('K55', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 20, 12),

    ('K64', '42a4f402-a327-4f21-8f0a-fe1df2bc4428', 18, 1),
    ('K64', 'dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a', 15, 2)
) as v(linea, material_id, cantidad, orden)
join public.linea_plantillas p on p.linea = v.linea
on conflict (plantilla_id, material_id) do update
  set cantidad = excluded.cantidad,
      orden = excluded.orden;
