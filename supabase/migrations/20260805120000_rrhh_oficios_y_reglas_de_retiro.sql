-- Oficios, asignacion a obra y reglas de retiro del panol.
--
-- Objetivo: que el panol sepa si quien esta retirando tiene algo que ver con lo
-- que se lleva. Dos preguntas distintas:
--
--   1. ¿Es material de SU obra?  → Gustavo esta en el K52 y se lleva algo del K55.
--   2. ¿Es de SU oficio?         → un cable electrico lo retira un carpintero.
--
-- Por ahora NADA se bloquea: la funcion devuelve un veredicto y la pantalla
-- avisa. Bloquear el dia uno, con las asignaciones a medio cargar, es la forma
-- mas rapida de que el panol pida que lo apaguen. Cuando haya datos reales de
-- cuantas veces salta el aviso se decide que se corta.
--
-- Nota de modelo: los materiales NO se asignan de a uno a cada oficio. Cada
-- material ya tiene su categoria (Mecanica, Herreria, Electricidad...) y puede
-- estar en varias via panol_material_categorias. Entonces el vinculo es
-- oficio -> categorias: son decenas de filas en vez de miles.

-- ── 1. Oficios ────────────────────────────────────────────────────────────
create table if not exists public.rrhh_oficios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rrhh_oficios is
  'Oficios del astillero: carpintero, electricista, mecanico, laminador, herrero, pintor.';

insert into public.rrhh_oficios (nombre, orden) values
  ('Carpintero', 10),
  ('Electricista', 20),
  ('Mecanico', 30),
  ('Laminador', 40),
  ('Herrero', 50),
  ('Pintor', 60),
  ('Tapicero', 70),
  ('Sanitarista', 80)
on conflict (nombre) do nothing;

-- ── 2. Que puede retirar cada oficio ──────────────────────────────────────
-- El oficio habilita CATEGORIAS del catalogo, no materiales sueltos.
create table if not exists public.rrhh_oficio_categorias (
  oficio_id uuid not null references public.rrhh_oficios(id) on delete cascade,
  categoria_id uuid not null references public.panol_categorias(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (oficio_id, categoria_id)
);

comment on table public.rrhh_oficio_categorias is
  'Categorias de material que cada oficio puede retirar sin autorizacion. Un material sin ninguna categoria habilitada para el oficio de quien retira dispara la advertencia.';

-- ── 3. En que obra esta cada empleado ─────────────────────────────────────
-- Con vigencia: Gustavo va a pasar del K52 al K55 y despues hay que poder
-- reconstruir quien estaba donde. Y puede tener mas de una obra a la vez, que
-- en un astillero pasa todo el tiempo.
create table if not exists public.rrhh_empleado_obras (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.rrhh_empleados(id) on delete cascade,
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  oficio_id uuid references public.rrhh_oficios(id) on delete set null,
  desde date not null default current_date,
  hasta date,
  notas text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rrhh_empleado_obras_rango_chk check (hasta is null or hasta >= desde)
);

comment on table public.rrhh_empleado_obras is
  'Asignacion de un empleado a una obra, con oficio y vigencia. hasta = null significa que sigue vigente.';
comment on column public.rrhh_empleado_obras.oficio_id is
  'El oficio vive en la asignacion y no en el empleado: alguien puede ser carpintero en una obra y ayudante en otra.';

create index if not exists idx_rrhh_empleado_obras_empleado
  on public.rrhh_empleado_obras (empleado_id)
  where hasta is null;

create index if not exists idx_rrhh_empleado_obras_obra
  on public.rrhh_empleado_obras (obra_id)
  where hasta is null;

-- Un empleado no puede estar dos veces vigente en la misma obra.
create unique index if not exists uq_rrhh_empleado_obra_vigente
  on public.rrhh_empleado_obras (empleado_id, obra_id)
  where hasta is null;

-- ── 4. El veredicto ───────────────────────────────────────────────────────
-- Devuelve una fila por material consultado, con el estado y el motivo listo
-- para mostrar. Vive en la base y no en el frontend porque el egreso se dispara
-- desde varios lugares (mostrador, lector, app) y la regla tiene que valer para
-- todos, incluido lo que se agregue mañana.
--
-- Estados:
--   ok           todo en orden
--   otra_obra    el material esta asignado a una obra donde la persona no esta
--   otro_oficio  el material no es de una categoria habilitada para su oficio
--   sin_datos    no se puede opinar (empleado sin asignacion, o material suelto)
create or replace function public.panol_evaluar_retiro(
  p_empleado_id uuid,
  p_material_ids uuid[]
)
returns table (
  material_id uuid,
  estado text,
  motivo text
)
language sql
stable
security invoker
set search_path = public
as $$
  with empleado as (
    select e.id, e.nombre
      from public.rrhh_empleados e
     where e.id = p_empleado_id
  ),
  asignaciones as (
    select eo.obra_id, eo.oficio_id
      from public.rrhh_empleado_obras eo
     where eo.empleado_id = p_empleado_id
       and eo.desde <= current_date
       and (eo.hasta is null or eo.hasta >= current_date)
  ),
  -- Categorias habilitadas por TODOS los oficios vigentes de la persona.
  categorias_ok as (
    select distinct oc.categoria_id
      from public.rrhh_oficio_categorias oc
     where oc.oficio_id in (select oficio_id from asignaciones where oficio_id is not null)
  ),
  mats as (
    select m.id,
           m.descripcion,
           -- Categoria principal + las extra de la M2M.
           array_remove(
             array[m.categoria_id] || coalesce(
               array(select mc.categoria_id
                       from public.panol_material_categorias mc
                      where mc.material_id = m.id), '{}'::uuid[]),
             null
           ) as categorias
      from public.panol_materiales m
     where m.id = any(p_material_ids)
  ),
  -- Obras a las que este material esta asignado hoy (lista de la obra).
  obras_material as (
    select s.material_id, array_agg(distinct s.obra_id) as obras
      from public.panol_obra_materiales_snapshot s
     where s.material_id = any(p_material_ids)
       and s.obra_id is not null
       and coalesce(s.estado, '') <> 'egresado'
     group by s.material_id
  )
  select
    mats.id as material_id,
    case
      when not exists (select 1 from empleado) then 'sin_datos'
      when not exists (select 1 from asignaciones) then 'sin_datos'
      -- Asignado a obras y ninguna es del empleado.
      when om.obras is not null
       and not exists (
         select 1 from asignaciones a where a.obra_id = any(om.obras)
       ) then 'otra_obra'
      -- Libre (o de su obra), pero de una categoria que su oficio no cubre.
      when exists (select 1 from categorias_ok)
       and not exists (
         select 1 from categorias_ok c where c.categoria_id = any(mats.categorias)
       ) then 'otro_oficio'
      else 'ok'
    end as estado,
    case
      when not exists (select 1 from empleado) then 'No se reconoce al empleado.'
      when not exists (select 1 from asignaciones) then 'El empleado no tiene obra asignada.'
      when om.obras is not null
       and not exists (select 1 from asignaciones a where a.obra_id = any(om.obras))
        then 'Este material esta asignado a otra obra.'
      when exists (select 1 from categorias_ok)
       and not exists (select 1 from categorias_ok c where c.categoria_id = any(mats.categorias))
        then 'Este material no es del oficio del empleado.'
      else null
    end as motivo
  from mats
  left join obras_material om on om.material_id = mats.id;
$$;

comment on function public.panol_evaluar_retiro(uuid, uuid[]) is
  'Evalua si un empleado puede retirar ciertos materiales. Devuelve estado y motivo; NO bloquea nada. La pantalla decide como mostrarlo.';

grant execute on function public.panol_evaluar_retiro(uuid, uuid[]) to authenticated;

-- ── 5. RLS ────────────────────────────────────────────────────────────────
alter table public.rrhh_oficios enable row level security;
alter table public.rrhh_oficio_categorias enable row level security;
alter table public.rrhh_empleado_obras enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['rrhh_oficios', 'rrhh_oficio_categorias', 'rrhh_empleado_obras'] loop
    execute format('drop policy if exists "%s lectura" on public.%I', t, t);
    execute format(
      'create policy "%s lectura" on public.%I for select to authenticated using (auth.uid() is not null)',
      t, t);
    execute format('drop policy if exists "%s escritura" on public.%I', t, t);
    execute format(
      'create policy "%s escritura" on public.%I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)',
      t, t);
  end loop;
end $$;

drop trigger if exists trg_rrhh_empleado_obras_touch on public.rrhh_empleado_obras;
create trigger trg_rrhh_empleado_obras_touch
  before update on public.rrhh_empleado_obras
  for each row execute function public.touch_updated_at();
