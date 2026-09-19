-- Motores y grupos electrógenos (BORRADOR: todavía no se aplica).
--
-- Hoy se llevan en dos Excel: "Motores asignacion y numeros" (motores FPT Iveco
-- y algunos Volvo: barco, número de serie, cajas, si está instalado) y "GRUPOS
-- ELECTROGENOS en el galpon" (grupos por obra, de qué barco vinieron, a cuál se
-- pasaron y cuáles volvieron al stock). Faltan Mercury y el resto de Volvo.
--
--   equipos              un registro por motor o grupo, con su número de serie
--   equipo_movimientos   la historia de cada uno: llegó, se reservó, se instaló,
--                        se pasó a otro barco, volvió al galpón, se entregó.
--                        La escribe un trigger: la pantalla sólo cambia el
--                        equipo y la historia no se pierde.
--   equipo_mover(...)    cambia estado y barco en un paso, con una nota
--
-- Estados:
--   comprado   el proveedor lo tiene preparado y falta retirarlo
--   pedido     pendiente de recepción (en el Excel: el número en amarillo)
--   en_galpon  llegó y no tiene barco
--   asignado   llegó y está reservado para un barco, sin instalar
--   instalado  está puesto en un barco en producción
--   entregado  el barco se entregó: queda para postventa y garantía
--   baja       se devolvió al proveedor o se dio de baja
--
-- Es aditiva e idempotente. La carga inicial sale de los Excel: la vista previa
-- ya los lee desde src/features/equipos/equiposSeed.js y de ahí se genera el
-- insert cuando se apruebe el modelo.

-- ─── 1. Equipos ─────────────────────────────────────────────────────────────
create table if not exists public.equipos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('motor', 'generador')),
  marca text not null,                          -- FPT Iveco, Volvo Penta, Mercury, Kohler, Onan…
  modelo text not null,                         -- N67 570 EVO, D6 440, 9 kVA…
  potencia numeric,                             -- HP en motores, kVA en grupos
  transmision text,                             -- V-drive, angular, pata (motores)
  numero_serie text,
  cajas text,                                   -- reductoras: modelo y números
  proveedor text,
  obra_id uuid references public.produccion_obras(id) on delete set null,
  obra_codigo text,                             -- '52-23': queda aunque el barco sea anterior al sistema
  posicion text check (posicion in ('babor', 'estribor', 'centro')),
  estado text not null default 'pedido'
    check (estado in ('comprado', 'pedido', 'en_galpon', 'asignado', 'instalado', 'entregado', 'baja')),
  fecha_compra date,
  fecha_retiro date,                            -- retiro desde el proveedor
  fecha_estimada date,                          -- cuándo llega, si falta
  urgente boolean not null default false,
  fecha_ingreso date,
  fecha_instalacion date,
  fecha_entrega date,
  garantia_hasta date,
  compra_cliente boolean not null default false,  -- lo compró el cliente por su cuenta
  notas text,
  -- De dónde vino: el pedido a compras y el ingreso al pañol.
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  panol_envio_item_id uuid references public.panol_envio_items(id) on delete set null,
  origen text,                                  -- 'Excel motores · fila 12' en la carga inicial
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un número de serie no se repite (sin mirar mayúsculas ni espacios).
create unique index if not exists equipos_numero_serie_unico
  on public.equipos (tipo, upper(regexp_replace(numero_serie, '\s', '', 'g')))
  where numero_serie is not null and numero_serie <> '';
create index if not exists equipos_obra_idx on public.equipos (obra_id);
create index if not exists equipos_obra_codigo_idx on public.equipos (obra_codigo);
create index if not exists equipos_estado_idx on public.equipos (estado);

-- ─── 2. Historia ────────────────────────────────────────────────────────────
create table if not exists public.equipo_movimientos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  tipo text not null
    check (tipo in ('alta', 'compra', 'retiro', 'ingreso', 'reserva', 'instalacion', 'cambio_barco', 'devuelto', 'entrega', 'baja', 'otro')),
  estado_anterior text,
  estado_nuevo text,
  -- Códigos y no ids: la historia se lee igual aunque el barco ya no esté activo.
  obra_anterior text,
  obra_nueva text,
  fecha date not null default current_date,     -- la del hecho; en la carga inicial, la del Excel
  nota text,
  hecho_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists equipo_movimientos_equipo_idx
  on public.equipo_movimientos (equipo_id, fecha desc, created_at desc);

-- ─── 3. Triggers ────────────────────────────────────────────────────────────
create or replace function public.equipos_sellar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- El código acompaña siempre al barco elegido.
  if new.obra_id is not null then
    new.obra_codigo := (select o.codigo from public.produccion_obras o where o.id = new.obra_id);
  end if;
  if tg_op = 'UPDATE' then
    -- Las fechas se completan solas al pasar de estado (en la carga inicial no:
    -- ahí la fecha de hoy sería mentira).
    if old.estado = 'comprado' and new.estado <> 'comprado' and new.fecha_retiro is null then
      new.fecha_retiro := current_date;
    end if;
    if old.estado in ('pedido', 'comprado') and new.estado not in ('pedido', 'comprado') and new.fecha_ingreso is null then
      new.fecha_ingreso := current_date;
    end if;
    if old.estado <> 'instalado' and new.estado = 'instalado' and new.fecha_instalacion is null then
      new.fecha_instalacion := current_date;
    end if;
  else
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  if new.estado <> 'pedido' then
    new.urgente := false;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- security definer: la historia no acepta escrituras directas de nadie.
create or replace function public.equipos_registrar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  if tg_op = 'INSERT' then
    v_tipo := case when new.estado = 'comprado' then 'compra' else 'alta' end;
  elsif old.estado is not distinct from new.estado
        and old.obra_codigo is not distinct from new.obra_codigo then
    return new;
  elsif new.estado = 'baja' then
    v_tipo := 'baja';
  elsif new.estado = 'entregado' then
    v_tipo := 'entrega';
  elsif old.estado = 'comprado' and new.estado <> 'comprado' then
    v_tipo := 'retiro';
  elsif old.obra_codigo is not null and new.obra_codigo is not null then
    v_tipo := case when old.obra_codigo <> new.obra_codigo then 'cambio_barco'
                   when new.estado = 'instalado' then 'instalacion'
                   when old.estado = 'pedido' then 'ingreso'
                   else 'otro' end;
  elsif old.obra_codigo is not null then
    v_tipo := 'devuelto';
  elsif new.estado = 'instalado' then
    v_tipo := 'instalacion';
  elsif old.estado = 'pedido' then
    v_tipo := 'ingreso';
  elsif new.estado = 'asignado' then
    v_tipo := 'reserva';
  else
    v_tipo := 'otro';
  end if;

  insert into public.equipo_movimientos
    (equipo_id, tipo, estado_anterior, estado_nuevo, obra_anterior, obra_nueva, nota, hecho_por)
  values (
    new.id, v_tipo,
    case when tg_op = 'UPDATE' then old.estado end, new.estado,
    case when tg_op = 'UPDATE' then old.obra_codigo end, new.obra_codigo,
    nullif(current_setting('equipos.nota', true), ''),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists equipos_sellar on public.equipos;
create trigger equipos_sellar
  before insert or update on public.equipos
  for each row execute function public.equipos_sellar();

drop trigger if exists equipos_registrar_movimiento on public.equipos;
create trigger equipos_registrar_movimiento
  after insert or update on public.equipos
  for each row execute function public.equipos_registrar_movimiento();

-- ─── 4. Mover un equipo ─────────────────────────────────────────────────────
-- Estado y barco en un paso, con la nota que queda en la historia ("se pasa al
-- 52-26 porque el cliente pidió 13,5 kVA"). Corre con los permisos de quien
-- llama: si no puede editar equipos, no mueve nada.
--   p_obra         el barco (null = sin barco)
--   p_obra_codigo  sólo para barcos anteriores al sistema, sin fila en produccion_obras
create or replace function public.equipo_mover(
  p_equipo uuid,
  p_estado text,
  p_obra uuid default null,
  p_obra_codigo text default null,
  p_nota text default null
)
returns public.equipos
language plpgsql
set search_path = public
as $$
declare
  v_equipo public.equipos;
begin
  perform set_config('equipos.nota', coalesce(p_nota, ''), true);
  update public.equipos
     set estado = p_estado,
         obra_id = p_obra,
         obra_codigo = case when p_obra is null then nullif(trim(p_obra_codigo), '') else obra_codigo end
   where id = p_equipo
  returning * into v_equipo;
  perform set_config('equipos.nota', '', true);
  if v_equipo.id is null then
    raise exception 'No se encontró el equipo o no tenés permiso para moverlo';
  end if;
  return v_equipo;
end;
$$;

-- ─── Seguridad ──────────────────────────────────────────────────────────────
-- Cargan y mueven equipos el pañol, oficina y los que ya manejan el pañol
-- (admin, compras, técnica). Todos los usuarios pueden consultar: postventa
-- busca por número de serie y producción mira qué lleva cada barco.
create or replace function public.equipos_puede_editar(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and (
    public.is_panol_manager(p_uid)
    or exists (
      select 1 from public.profiles p
      where p.id = p_uid
        and p.role in ('panol', 'oficina')
    )
  );
$$;

alter table public.equipos enable row level security;
alter table public.equipo_movimientos enable row level security;

drop policy if exists "equipos lectura" on public.equipos;
create policy "equipos lectura" on public.equipos
  for select to authenticated using (true);
drop policy if exists "equipos alta" on public.equipos;
create policy "equipos alta" on public.equipos
  for insert to authenticated
  with check (public.equipos_puede_editar(auth.uid()));
drop policy if exists "equipos edicion" on public.equipos;
create policy "equipos edicion" on public.equipos
  for update to authenticated
  using (public.equipos_puede_editar(auth.uid()))
  with check (public.equipos_puede_editar(auth.uid()));
-- Borrar sólo quien administra el pañol; lo normal es pasarlo a 'baja'.
drop policy if exists "equipos borrar" on public.equipos;
create policy "equipos borrar" on public.equipos
  for delete to authenticated
  using (public.is_panol_manager(auth.uid()));

drop policy if exists "equipo_movimientos lectura" on public.equipo_movimientos;
create policy "equipo_movimientos lectura" on public.equipo_movimientos
  for select to authenticated using (true);

grant execute on function public.equipo_mover(uuid, text, uuid, text, text) to authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'equipos') then
    alter publication supabase_realtime add table public.equipos;
  end if;
end $$;
