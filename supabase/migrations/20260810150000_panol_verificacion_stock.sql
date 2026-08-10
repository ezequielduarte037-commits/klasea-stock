-- Revision del stock maestro, item por item.
--
-- Del conteo para aca aparecieron demasiadas inconsistencias: productos sin
-- ubicacion, descripciones que no alcanzan para reconocer la pieza en la mano,
-- codigos repetidos. La forma de salir de eso no es otro conteo general —ya se
-- hizo y quedo asi— sino una pasada dirigida: alguien del panol agarra el
-- maestro y va item por item confirmando que lo que dice la ficha es lo que hay
-- en el estante.
--
-- Para que eso sea trabajo y no buena voluntad hacen falta tres cosas:
--
-- 1. QUE SE VEA CUANTO FALTA. Sin un contador, una revision de 800 productos no
--    se termina nunca porque nadie sabe si va por la mitad o por el principio.
--
-- 2. QUE SE PUEDA MARCAR "ESTO ESTA MAL". Un item con problema no es lo mismo
--    que uno sin revisar: el primero ya se miro y necesita que alguien decida,
--    el segundo todavia no lo vio nadie. Mezclarlos hace que el pendiente nunca
--    baje y que los problemas reales se pierdan entre los no mirados.
--
-- 3. QUE QUEDE LA HISTORIA. Lo que se encuentra en esta pasada es el insumo
--    para no volver a romperlo: si la mitad de los problemas son "sin
--    ubicacion", el arreglo no es revisar mas seguido, es que no se pueda dar
--    de alta un producto sin ubicacion.

-- ── Estado de revision en la ficha ────────────────────────────────────────
alter table public.panol_materiales
  add column if not exists verificacion_estado text not null default 'pendiente',
  add column if not exists verificado_at timestamptz,
  add column if not exists verificado_por uuid references public.profiles(id) on delete set null,
  add column if not exists verificacion_nota text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'panol_materiales_verificacion_estado_check'
  ) then
    alter table public.panol_materiales
      add constraint panol_materiales_verificacion_estado_check
      check (verificacion_estado in ('pendiente', 'ok', 'problema'));
  end if;
end $$;

comment on column public.panol_materiales.verificacion_estado is
  'pendiente = nadie lo miro todavia. ok = alguien lo tuvo en la mano y la ficha coincide. problema = se miro y algo no cierra.';
comment on column public.panol_materiales.verificacion_nota is
  'Que se encontro. Obligatoria cuando el estado es problema: "revisar" sin decir que no sirve de nada.';

-- El indice sirve al filtro que mas se va a usar: "mostrame lo que falta".
create index if not exists idx_panol_materiales_verificacion
  on public.panol_materiales (verificacion_estado)
  where activo;

-- ── Historia de la revision ───────────────────────────────────────────────
-- Cada pasada deja rastro, aunque el item despues se corrija. Es lo que permite
-- contestar "que estaba mal" y no solo "que esta mal ahora".
create table if not exists public.panol_material_verificaciones (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  estado text not null check (estado in ('ok', 'problema')),
  nota text,
  -- Foto de los campos que se estaban revisando, como quedaron. Sirve para ver
  -- que fue lo que se completo en la pasada.
  ubicacion text,
  descripcion text,
  verificado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.panol_material_verificaciones is
  'Una fila por cada vez que alguien reviso un producto del maestro contra el estante.';

create index if not exists idx_panol_material_verificaciones_material
  on public.panol_material_verificaciones (material_id, created_at desc);

create index if not exists idx_panol_material_verificaciones_fecha
  on public.panol_material_verificaciones (created_at desc);

alter table public.panol_material_verificaciones enable row level security;

drop policy if exists "panol_material_verificaciones lectura" on public.panol_material_verificaciones;
create policy "panol_material_verificaciones lectura"
  on public.panol_material_verificaciones for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_material_verificaciones escritura" on public.panol_material_verificaciones;
create policy "panol_material_verificaciones escritura"
  on public.panol_material_verificaciones for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── Revisar un producto ───────────────────────────────────────────────────
-- Todo en una sola llamada: se corrigen los datos Y se marca la revision. Si
-- fueran dos pasos, la mitad de las veces se corrige y no se marca —o al reves—
-- y el contador deja de significar algo.
create or replace function public.panol_verificar_material(
  p_material_id uuid,
  p_estado text,
  p_nota text default null,
  p_ubicacion text default null,
  p_ubicacion_obs text default null,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_ubicacion text := nullif(btrim(coalesce(p_ubicacion, '')), '');
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if p_estado not in ('pendiente', 'ok', 'problema') then
    raise exception 'Estado de verificacion invalido: %', p_estado;
  end if;
  -- Marcar "problema" sin decir cual deja el item trabado sin informacion: el
  -- que lo lea despues no sabe si buscar la pieza, corregir el codigo o pedir
  -- una foto.
  if p_estado = 'problema' and v_nota is null then
    raise exception 'Para marcar un problema hay que decir cual es';
  end if;

  update public.panol_materiales
     set descripcion = coalesce(v_descripcion, descripcion),
         ubicacion = coalesce(v_ubicacion, ubicacion),
         -- La observacion de ubicacion se puede vaciar a proposito, asi que
         -- distingue null (no lo toques) de cadena vacia (borralo).
         ubicacion_obs = case
           when p_ubicacion_obs is null then ubicacion_obs
           else nullif(btrim(p_ubicacion_obs), '')
         end,
         verificacion_estado = p_estado,
         verificacion_nota = case when p_estado = 'pendiente' then null else v_nota end,
         verificado_at = case when p_estado = 'pendiente' then null else now() end,
         verificado_por = case when p_estado = 'pendiente' then null else v_uid end,
         updated_at = now()
   where id = p_material_id;

  if not found then
    raise exception 'Producto inexistente';
  end if;

  -- Volver algo a "pendiente" es deshacer, no revisar: no deja fila.
  if p_estado <> 'pendiente' then
    insert into public.panol_material_verificaciones (
      material_id, estado, nota, ubicacion, descripcion, verificado_por
    )
    select p_material_id, p_estado, v_nota, m.ubicacion, m.descripcion, v_uid
      from public.panol_materiales m
     where m.id = p_material_id;
  end if;
end;
$$;

comment on function public.panol_verificar_material(uuid, text, text, text, text, text) is
  'Corrige los datos de un producto y marca la revision en una sola operacion.';

grant execute on function public.panol_verificar_material(uuid, text, text, text, text, text) to authenticated;

-- ── Avance de la revision ─────────────────────────────────────────────────
-- Un solo numero por estado. Se consulta en cada carga del maestro, asi que va
-- como vista agregada y no contando filas en el navegador.
create or replace view public.panol_verificacion_avance
with (security_invoker = true) as
select
  count(*)::int as total,
  count(*) filter (where verificacion_estado = 'ok')::int as ok,
  count(*) filter (where verificacion_estado = 'problema')::int as problema,
  count(*) filter (where verificacion_estado = 'pendiente')::int as pendiente,
  count(*) filter (where verificacion_estado = 'pendiente' and (ubicacion is null or btrim(ubicacion) = ''))::int as pendiente_sin_ubicacion
from public.panol_materiales
where activo;

grant select on public.panol_verificacion_avance to authenticated;
