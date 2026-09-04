-- Carpetas propias de un remito archivado.
--
-- Hasta ahora un remito tenia UNA sola carpeta, guardada en
-- `panol_comprobantes.carpeta_local`, y esa columna hacia dos trabajos a la vez:
-- decia en que carpeta de la PC del pañol quedo el PDF y, de paso, era la unica
-- forma de agrupar los remitos que no son de un barco. Por eso al elegir una
-- obra la carpeta desaparecia de la pantalla: no habia donde poner las dos.
--
-- Se separan los dos conceptos:
--   * `carpeta_local` sigue siendo UNA sola: donde esta el archivo fisico. Un
--     archivo no puede estar en dos lugares de un disco.
--   * esta tabla son las carpetas del SISTEMA, que son varias y no mueven el
--     PDF: el mismo documento aparece en "55-1" y en "Garantias" sin duplicarse,
--     igual que ya pasaba con las obras.
--
-- La carpeta del proveedor NO se guarda aca: sale sola del campo `proveedor`.
-- Guardarla como texto aparte la dejaria desincronizada el dia que alguien
-- corrige el nombre del proveedor.

create table if not exists public.panol_comprobante_carpetas (
  comprobante_id uuid not null
    references public.panol_comprobantes(id) on delete cascade,
  carpeta text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
    references public.profiles(id) on delete set null,
  primary key (comprobante_id, carpeta),
  constraint panol_comprobante_carpetas_nombre_valido
    check (length(btrim(carpeta)) between 1 and 60 and carpeta !~ '[\\/]')
);

create index if not exists panol_comprobante_carpetas_carpeta_idx
  on public.panol_comprobante_carpetas (carpeta, created_at desc);

-- Lo que ya estaba archivado en una carpeta escrita a mano sigue en esa carpeta.
-- Las que tienen barra ("K55/55-1") son rutas de obra que arma el sistema, no
-- carpetas propias: esas se siguen viendo por su obra y no se copian aca.
insert into public.panol_comprobante_carpetas (comprobante_id, carpeta, created_by)
select c.id, btrim(c.carpeta_local), c.created_by
from public.panol_comprobantes c
where c.origen_carga = 'scanner_panol'
  and c.carpeta_local is not null
  and btrim(c.carpeta_local) <> ''
  and c.carpeta_local !~ '[\\/]'
  and length(btrim(c.carpeta_local)) <= 60
on conflict (comprobante_id, carpeta) do nothing;

alter table public.panol_comprobante_carpetas enable row level security;

drop policy if exists "scanner panol comprobante carpetas lectura"
  on public.panol_comprobante_carpetas;
create policy "scanner panol comprobante carpetas lectura"
on public.panol_comprobante_carpetas for select to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol comprobante carpetas alta"
  on public.panol_comprobante_carpetas;
create policy "scanner panol comprobante carpetas alta"
on public.panol_comprobante_carpetas for insert to authenticated
with check (
  public.puede_operar_scanner_panol(auth.uid())
  and (created_by is null or created_by = auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol comprobante carpetas baja"
  on public.panol_comprobante_carpetas;
create policy "scanner panol comprobante carpetas baja"
on public.panol_comprobante_carpetas for delete to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1
    from public.panol_comprobantes c
    where c.id = comprobante_id
      and c.origen_carga = 'scanner_panol'
  )
);

-- Reemplaza todas las carpetas del remito de una sola vez.
--
-- Normaliza aca adentro y no solo en la web: si "Rebollar", " rebollar " y
-- "Rebollar/" entraran como estan, la misma carpeta quedaria partida en tres y
-- ninguna tendria todos los remitos. Cuando una carpeta ya existe escrita de
-- otra forma se usa la que existe, que es lo que espera quien la creo.
create or replace function public.panol_asignar_carpetas_remito(
  p_comprobante_id uuid,
  p_carpetas text[] default array[]::text[]
)
returns table (carpeta text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalizadas text[];
begin
  if not public.puede_operar_scanner_panol(auth.uid()) then
    raise exception 'No tenes permiso para clasificar remitos.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.panol_comprobantes c
    where c.id = p_comprobante_id
      and c.origen_carga = 'scanner_panol'
  ) then
    raise exception 'El remito no existe o no pertenece al scanner.' using errcode = 'P0002';
  end if;

  with limpias as (
    -- Las barras se vuelven espacio -una carpeta propia es un solo nivel-, los
    -- espacios de mas se juntan y se corta a lo que entra en la columna.
    select distinct
      btrim(left(btrim(regexp_replace(regexp_replace(pedida, '[\\/]+', ' ', 'g'), '\s+', ' ', 'g')), 60)) as nombre
    from unnest(coalesce(p_carpetas, array[]::text[])) as pedida
  ),
  -- Si ya existe con otras mayusculas, gana la que existe.
  resueltas as (
    select coalesce(
      (select cc.carpeta
       from public.panol_comprobante_carpetas cc
       where lower(cc.carpeta) = lower(limpias.nombre)
       order by cc.created_at
       limit 1),
      limpias.nombre
    ) as nombre
    from limpias
    where btrim(limpias.nombre) <> ''
  )
  select coalesce(array_agg(distinct resueltas.nombre), array[]::text[])
  into v_normalizadas
  from resueltas;

  delete from public.panol_comprobante_carpetas cc
  where cc.comprobante_id = p_comprobante_id;

  insert into public.panol_comprobante_carpetas (comprobante_id, carpeta, created_by)
  select p_comprobante_id, elegida.nombre, auth.uid()
  from unnest(v_normalizadas) as elegida(nombre)
  on conflict (comprobante_id, carpeta) do nothing;

  update public.panol_comprobantes c
  set updated_at = now()
  where c.id = p_comprobante_id;

  return query
  select cc.carpeta
  from public.panol_comprobante_carpetas cc
  where cc.comprobante_id = p_comprobante_id
  order by cc.carpeta;
end;
$$;

revoke all on function public.panol_asignar_carpetas_remito(uuid, text[]) from public;
grant execute on function public.panol_asignar_carpetas_remito(uuid, text[]) to authenticated;

grant select, insert, delete on public.panol_comprobante_carpetas to authenticated;

comment on table public.panol_comprobante_carpetas is
  'Carpetas del sistema en las que aparece un remito archivado. No mueve el PDF ni modifica stock; el archivo fisico vive en panol_comprobantes.carpeta_local.';
comment on function public.panol_asignar_carpetas_remito(uuid, text[]) is
  'Reemplaza atomicamente las carpetas propias de un remito escaneado, normalizando el nombre.';
