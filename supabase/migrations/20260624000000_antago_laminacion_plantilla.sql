-- Plantilla de laminacion para linea Antago.
-- Antago es un barco del astillero con produccion tercerizada, pero consume
-- materiales de laminacion provistos por Klase A.

insert into public.linea_plantillas (linea, nombre, descripcion, activa)
values (
  'ANTAGO',
  'Antago',
  'Lista estandar de materiales de laminacion para Antago',
  true
)
on conflict (linea) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      activa = true,
      updated_at = now();

do $$
declare
  v_plantilla_id uuid;
  v_missing text;
begin
  select id
    into v_plantilla_id
    from public.linea_plantillas
   where linea = 'ANTAGO';

  create temporary table if not exists tmp_antago_laminacion_items (
    orden int,
    label text,
    cantidad numeric,
    notas text,
    patterns text[]
  ) on commit drop;

  create temporary table if not exists tmp_antago_laminacion_matches (
    orden int,
    label text,
    cantidad numeric,
    notas text,
    material_id uuid,
    rn int
  ) on commit drop;

  truncate table tmp_antago_laminacion_items;
  truncate table tmp_antago_laminacion_matches;

  insert into tmp_antago_laminacion_items (orden, label, cantidad, notas, patterns)
  values
    (1,  'Resina 504',              1,  '1 x 220 kg',                         array['%resina%504%']),
    (2,  'Resina 101',              16, '16 x 220 kg = 3520 kg',              array['%resina%101%']),
    (3,  'Monomero de estireno',    4,  '4 x 190 kg = 760 kg',                array['%monom%estireno%', '%estireno%']),
    (4,  'ROV 600',                 10, '10 x 75 kg = 750 kg',                array['%rov%600%', '%roving%600%']),
    (5,  'ROV 400',                 4,  '4 x 75 kg = 300 kg',                 array['%rov%400%', '%roving%400%']),
    (6,  'Velo de superficie',      1,  '1 x 250 mts = 250 mtrs',             array['%velo%super%']),
    (7,  'COREMAT 2 MM',            2,  '2 x 80 m2 = 160 m2',                 array['%coremat%2%']),
    (8,  'MAT 300',                 24, '24 x 43 kg = 1032 kg',               array['%mat%300%']),
    (9,  'MAT 450',                 4,  '4 x 46 kg = 184 kg',                 array['%mat%450%']),
    (10, 'Catalizador',             4,  '4 x 20 lts = 80 lts',                array['%catalizador%', '%aperox%']),
    (11, 'Acelerador',              2,  '2 x 20 lts = 40 lts',                array['%acelerador%', '%octoato%']),
    (12, 'AIREX H80 de 20 mm',      15, '15 x 3 m2 = 45 m2',                  array['%airex%h80%20%', '%airex%20%']);

  insert into tmp_antago_laminacion_matches (orden, label, cantidad, notas, material_id, rn)
  select
      w.orden,
      w.label,
      w.cantidad,
      w.notas,
      m.id as material_id,
      row_number() over (
        partition by w.orden
        order by
          case
            when lower(coalesce(m.nombre, '')) like w.patterns[1] then 0
            else 1
          end,
          length(coalesce(m.nombre, ''))
      ) as rn
    from tmp_antago_laminacion_items w
    join public.laminacion_materiales m
      on exists (
        select 1
          from unnest(w.patterns) as pat
         where lower(coalesce(m.nombre, '')) like pat
      );

  select string_agg(w.label, ', ' order by w.orden)
    into v_missing
    from tmp_antago_laminacion_items w
    left join tmp_antago_laminacion_matches m
      on m.orden = w.orden
     and m.rn = 1
   where m.material_id is null;

  if v_missing is not null then
    raise exception 'No se encontraron materiales de laminacion para Antago: %', v_missing;
  end if;

  insert into public.linea_plantilla_items (plantilla_id, material_id, cantidad, orden, notas)
  select v_plantilla_id, material_id, cantidad, orden, notas
    from tmp_antago_laminacion_matches
   where rn = 1
  on conflict (plantilla_id, material_id) do update
    set cantidad = excluded.cantidad,
        orden = excluded.orden,
        notas = excluded.notas;
end $$;

