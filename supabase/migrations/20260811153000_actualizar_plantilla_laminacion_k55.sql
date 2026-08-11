-- Actualiza la lista base de laminacion K55 a partir del despiece tecnico
-- recibido el 11/08/2026 y las presentaciones comerciales confirmadas en K37.
--
-- Alcance: solo modifica la plantilla de linea K55. No altera K52 ni aplica
-- automaticamente estos valores sobre obras K55 existentes.

begin;

create table if not exists public.linea_plantilla_items_k55_respaldo_20260811
  (like public.linea_plantilla_items including defaults);

alter table public.linea_plantilla_items_k55_respaldo_20260811
  add column if not exists respaldado_at timestamptz not null default now();

alter table public.linea_plantilla_items_k55_respaldo_20260811 enable row level security;

comment on table public.linea_plantilla_items_k55_respaldo_20260811 is
  'Respaldo previo a reemplazar la plantilla de laminacion K55 el 11/08/2026.';

insert into public.linea_plantilla_items_k55_respaldo_20260811
  (id, plantilla_id, material_id, cantidad, orden, notas, created_at, respaldado_at)
select
  i.id,
  i.plantilla_id,
  i.material_id,
  i.cantidad,
  i.orden,
  i.notas,
  i.created_at,
  now()
from public.linea_plantilla_items i
join public.linea_plantillas p on p.id = i.plantilla_id
where upper(p.linea) = 'K55'
  and not exists (
    select 1
    from public.linea_plantilla_items_k55_respaldo_20260811 respaldo
    where respaldo.id = i.id
  );

delete from public.linea_plantilla_items i
using public.linea_plantillas p
where p.id = i.plantilla_id
  and upper(p.linea) = 'K55';

with deseado(material_id, cantidad, orden, notas) as (
  values
    ('3123f200-d261-4046-a098-645e821f01d2'::uuid, 17::numeric,  1, 'Gelcoat blanco: 330,7 kg / balde 20 kg; redondeado hacia arriba'),
    ('6c4f8c92-154a-476d-89cf-249f1211eeca'::uuid,  2::numeric,  2, 'Gelcoat negro: 26,9 kg / balde 20 kg; redondeado hacia arriba'),
    ('721f20e8-c1f0-4aca-98c9-e9480c9a673c'::uuid,  2::numeric,  3, '477,8 m2 / rollo 250 m2; redondeado hacia arriba'),
    ('a3740499-d14c-480b-9c8f-c7d8cc31deeb'::uuid,  3::numeric,  4, '183,3 m2 / rollo 80 m2; redondeado hacia arriba'),
    ('6357d1e1-a448-4890-b022-62f600f2da96'::uuid, 23::numeric,  5, '978,0 kg / rollo 43 kg; redondeado hacia arriba'),
    ('74814024-b661-4bca-bdd5-facab2999715'::uuid, 10::numeric,  6, '973,9 kg / rollo 100 kg; redondeado hacia arriba'),
    ('39934627-7ae9-4ff7-833f-a428b0da5b13'::uuid,  4::numeric,  7, '280,0 kg / rollo 75 kg; redondeado hacia arriba'),
    ('6497b1a1-7d0e-49e0-acd4-600e08a0b359'::uuid, 20::numeric,  8, '4256,6 kg / tambor 220 kg; redondeado hacia arriba'),
    ('75352cd6-1828-4cdb-8971-60a1be60194b'::uuid,  2::numeric,  9, '311,9 kg / tambor 220 kg; redondeado hacia arriba'),
    ('38903dae-16fd-4afb-8e98-704cc8d7fd1f'::uuid,  3::numeric, 10, '456,9 kg / tambor 190 kg; redondeado hacia arriba'),
    ('de7b6037-289d-439a-bd10-fc3141a601e8'::uuid,  5::numeric, 11, '98,5 L / bidon 20 L; redondeado hacia arriba'),
    ('3cfd9c4c-4c93-4513-90fa-045f01cc3460'::uuid,  5::numeric, 12, '91,4 L / bidon 20 L; redondeado hacia arriba'),
    ('6e5d1272-d42b-49cd-bfbd-47d623c36d3a'::uuid, 36::numeric, 13, '105,2 m2 / placa 3 m2; redondeado hacia arriba'),
    ('863eb63f-663a-4881-91c4-12121ad3fa52'::uuid, 21::numeric, 14, '347,2 kg / balde 17 kg; redondeado hacia arriba')
), insertados as (
  insert into public.linea_plantilla_items
    (plantilla_id, material_id, cantidad, orden, notas)
  select
    p.id,
    d.material_id,
    d.cantidad,
    d.orden,
    d.notas
  from deseado d
  cross join public.linea_plantillas p
  where upper(p.linea) = 'K55'
  returning id
)
select count(*) from insertados;

do $$
declare
  v_cantidad integer;
begin
  select count(*)
    into v_cantidad
  from public.linea_plantilla_items i
  join public.linea_plantillas p on p.id = i.plantilla_id
  where upper(p.linea) = 'K55';

  if v_cantidad <> 14 then
    raise exception 'La plantilla K55 debia quedar con 14 materiales y quedaron %', v_cantidad;
  end if;
end
$$;

update public.linea_plantillas
set descripcion = 'Lista base de laminacion K55 actualizada desde despiece tecnico 11/08/2026'
where upper(linea) = 'K55';

commit;
