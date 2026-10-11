-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: "nada sale sin registro" (arranque 13/10/2026).
--
-- Hasta hoy los consumibles no tenían stock. El retiro por solicitud se graba en
-- panol_obra_materiales_snapshot con "[sin impacto stock]" (delta 0 en todas las
-- pantallas) y la caja de consumibles nunca se usó. Este apartado arranca de cero
-- con un registro propio, separado del ledger de materiales de obra, porque
-- necesita cosas que aquel no tiene: gramos, quién retira (tarjeta), carril
-- (planificado / mostrador), obra repartida, canje y precio al momento.
--
--   consumibles_listas / _items  listas de precios de proveedor (Rebollar). Cada
--                                lista es una foto: el historial sale solo.
--   consumibles_config           1 a 1 con panol_materiales: cómo se entrega,
--                                unidades, máximo, cupo, código de etiqueta y
--                                costo vigente.
--   consumibles_movimientos      el registro. Stock = suma de `cantidad`.
--   consumibles_stock (vista)    stock por material y sede.
--
-- De panol_materiales se reutiliza: descripcion, categoria_id, unidad_medida,
-- es_consumible, peso_unitario_g (balanza), stock_minimo (con su auditoría y
-- panol_set_stock_minimo) y ubicacion.
--
-- El circuito de solicitudes de papel sigue igual: cuando pañol confirma un
-- retiro, un trigger copia sus consumibles a este registro (carril planificado).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Listas de precios de proveedor ───────────────────────────────────────

create table if not exists public.consumibles_listas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.panol_proveedores(id) on delete set null,
  proveedor_nombre text not null,
  vigente_desde date not null,
  archivo_nombre text,
  -- Dólar vendedor BNA usado para pasar a pesos los renglones en USD.
  dolar_vendedor numeric check (dolar_vendedor > 0),
  notas text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.consumibles_lista_items (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.consumibles_listas(id) on delete cascade,
  codigo text not null,
  descripcion text not null,
  -- La columna "Unidad / Medida" de Rebollar es la MEDIDA ("6 X 1 1/4").
  medida text,
  precio numeric check (precio >= 0),
  moneda text check (moneda in ('ARS', 'USD')),
  -- '+IVA' = factura con IVA aparte; 'Final' = precio final con remito.
  condicion text check (condicion in ('+IVA', 'Final')),
  -- Costo en pesos sin IVA por unidad de compra: comparable entre listas.
  -- En 'Final' con remito no hay IVA que descontar: el costo es el precio.
  costo_ars numeric check (costo_ars >= 0),
  -- Lo que viene escondido en la descripción ("x 4Lts", "x100unid", "X Kg").
  unidad_compra text,
  contenido numeric check (contenido > 0),
  material_id uuid references public.panol_materiales(id) on delete set null,
  unique (lista_id, codigo)
);

create index if not exists consumibles_lista_items_codigo_idx on public.consumibles_lista_items (codigo);
create index if not exists consumibles_lista_items_material_idx on public.consumibles_lista_items (material_id);

-- ── 2. Configuración por consumible ─────────────────────────────────────────

-- Código corto propio para etiquetas: KA0001. No usa el código de Rebollar
-- porque hay consumibles de otros proveedores y porque el proveedor puede
-- cambiar su código; la etiqueta pegada en el estante no.
create sequence if not exists public.consumibles_codigo_seq as int start 1;

create table if not exists public.consumibles_config (
  material_id uuid primary key references public.panol_materiales(id) on delete cascade,
  codigo_etiqueta text not null unique
    default ('KA' || lpad(nextval('public.consumibles_codigo_seq')::text, 4, '0')),
  forma_entrega text not null default 'unidad'
    check (forma_entrega in ('unidad', 'peso', 'fraccionado', 'canje', 'prestamo')),
  -- Unidad en la que se cuenta el stock y se registra el retiro.
  unidad_entrega text not null default 'unidad',
  proveedor_nombre text,
  proveedor_codigo text,
  unidad_compra text,
  -- Unidades de entrega que trae una unidad de compra (caja x100 -> 100).
  factor_compra numeric check (factor_compra > 0),
  -- Lote mínimo de compra, en unidades de compra.
  lote_compra numeric check (lote_compra > 0),
  stock_maximo numeric check (stock_maximo >= 0),
  -- Cupo sugerido por persona y por día, en unidad de entrega. Pasarse no
  -- bloquea: pide el OK del encargado y queda marcado.
  cupo_diario numeric check (cupo_diario > 0),
  -- Orden en la botonera de "más pedidos" del mostrador (null = no aparece).
  favorito_orden int,
  activo_mostrador boolean not null default true,
  -- Costo vigente por unidad de entrega, en pesos sin IVA.
  costo_unitario_ars numeric check (costo_unitario_ars >= 0),
  costo_lista_item_id uuid references public.consumibles_lista_items(id) on delete set null,
  costo_actualizado_at timestamptz,
  notas text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create index if not exists consumibles_config_proveedor_idx
  on public.consumibles_config (proveedor_nombre, proveedor_codigo);

create or replace function public.consumibles_config_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_consumibles_config_touch on public.consumibles_config;
create trigger trg_consumibles_config_touch
  before update on public.consumibles_config
  for each row execute function public.consumibles_config_touch();

-- ── 3. El registro ──────────────────────────────────────────────────────────

create table if not exists public.consumibles_movimientos (
  -- El id lo puede generar el cliente: si el mostrador se queda sin conexión y
  -- reintenta, el mismo id no duplica el retiro.
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.panol_materiales(id),
  sede text not null check (sede in ('Pampa', 'Chubut')),
  tipo text not null
    check (tipo in ('inventario', 'ingreso', 'retiro', 'devolucion', 'ajuste', 'merma')),
  -- Con signo y en unidad de entrega: el retiro y la merma restan.
  cantidad numeric not null,
  -- Peso que marcó la balanza (retiro por peso o conteo de un cajón).
  gramos numeric check (gramos > 0),
  -- Solo inventario: lo contado y lo que decía el sistema en ese momento.
  contado numeric check (contado >= 0),
  teorico numeric,

  empleado_id uuid references public.rrhh_empleados(id) on delete set null,
  -- Congelados: si mañana renombran al empleado, el retiro dice lo mismo.
  empleado_nombre text,
  empleado_dni text,
  metodo_firma text check (metodo_firma in ('nfc', 'manual', 'sin_tarjeta')),

  obra_id uuid references public.produccion_obras(id) on delete set null,
  sector text,
  carril text check (carril in ('mostrador', 'planificado', 'sector')),
  -- Agrupa un carrito, un remito o una tanda de conteo. Un retiro repartido
  -- entre obras son varias filas con el mismo lote.
  lote uuid,
  solicitud_id uuid references public.panol_solicitudes(id) on delete set null,
  -- Espejo de un retiro por solicitud: la fila del ledger viejo que lo originó.
  snapshot_id uuid unique,

  -- Congelado al registrar: valoriza el consumo aunque cambie la lista.
  costo_unitario_ars numeric check (costo_unitario_ars >= 0),
  canje text check (canje in ('trajo_usado', 'sin_usado')),
  fuera_cupo boolean not null default false,
  autorizado_por text,
  remito text,
  origen text not null default 'mostrador'
    check (origen in ('mostrador', 'solicitud', 'conteo', 'ingreso', 'devolucion', 'ajuste', 'sector', 'importacion')),
  nota text,

  anulado_at timestamptz,
  anulado_por uuid,
  anulado_motivo text,

  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),

  constraint consumibles_movimientos_signo check (
    (tipo in ('retiro', 'merma') and cantidad < 0)
    or (tipo in ('ingreso', 'devolucion') and cantidad > 0)
    or (tipo in ('inventario', 'ajuste'))
  ),
  constraint consumibles_movimientos_contado check (
    tipo <> 'inventario' or contado is not null
  )
);

create index if not exists consumibles_mov_material_idx
  on public.consumibles_movimientos (material_id, sede) where anulado_at is null;
create index if not exists consumibles_mov_empleado_idx
  on public.consumibles_movimientos (empleado_id, created_at desc);
create index if not exists consumibles_mov_obra_idx
  on public.consumibles_movimientos (obra_id, created_at desc);
create index if not exists consumibles_mov_fecha_idx
  on public.consumibles_movimientos (created_at desc);
create index if not exists consumibles_mov_lote_idx
  on public.consumibles_movimientos (lote) where lote is not null;
create index if not exists consumibles_mov_solicitud_idx
  on public.consumibles_movimientos (solicitud_id) where solicitud_id is not null;

-- Completa lo que el cliente no tiene por qué saber: el costo vigente y el
-- nombre y DNI congelados de quien retira. Security definer porque el pañol no
-- lee rrhh_empleados directamente (lo hace por RPC).
create or replace function public.consumibles_movimiento_completar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp record;
begin
  if new.costo_unitario_ars is null then
    select c.costo_unitario_ars into new.costo_unitario_ars
      from public.consumibles_config c
     where c.material_id = new.material_id;
  end if;

  if new.empleado_id is not null and (new.empleado_nombre is null or new.empleado_dni is null) then
    select e.nombre, e.dni into v_emp
      from public.rrhh_empleados e
     where e.id = new.empleado_id;
    new.empleado_nombre := coalesce(new.empleado_nombre, v_emp.nombre);
    new.empleado_dni := coalesce(new.empleado_dni, v_emp.dni);
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_consumibles_movimiento_completar on public.consumibles_movimientos;
create trigger trg_consumibles_movimiento_completar
  before insert on public.consumibles_movimientos
  for each row execute function public.consumibles_movimiento_completar();

-- El registro no se edita: un error se anula y se vuelve a cargar. Lo único que
-- puede cambiar de una fila es su anulación, y una vez anulada queda así.
create or replace function public.consumibles_movimiento_solo_anular()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.anulado_at is not null then
    raise exception 'El movimiento ya está anulado';
  end if;
  if (to_jsonb(new) - array['anulado_at', 'anulado_por', 'anulado_motivo'])
     is distinct from (to_jsonb(old) - array['anulado_at', 'anulado_por', 'anulado_motivo']) then
    raise exception 'Un movimiento de consumibles no se edita: anulalo y cargalo de nuevo';
  end if;
  if new.anulado_at is null then
    raise exception 'Solo se puede anular el movimiento';
  end if;
  new.anulado_por := coalesce(auth.uid(), new.anulado_por);
  return new;
end;
$$;

drop trigger if exists trg_consumibles_movimiento_solo_anular on public.consumibles_movimientos;
create trigger trg_consumibles_movimiento_solo_anular
  before update on public.consumibles_movimientos
  for each row execute function public.consumibles_movimiento_solo_anular();

-- ── 4. Stock ────────────────────────────────────────────────────────────────

create or replace view public.consumibles_stock
with (security_invoker = true) as
select
  m.material_id,
  m.sede,
  sum(m.cantidad) as stock,
  max(m.created_at) filter (where m.tipo = 'inventario') as ultimo_conteo_at,
  max(m.created_at) filter (where m.tipo = 'retiro') as ultimo_retiro_at,
  max(m.created_at) filter (where m.tipo = 'ingreso') as ultimo_ingreso_at
from public.consumibles_movimientos m
where m.anulado_at is null
group by m.material_id, m.sede;

-- Conteo: graba la diferencia entre lo contado y lo que dice el sistema en ese
-- momento. Se calcula en la base y con candado por material y sede para que dos
-- conteos simultáneos no se pisen. Sirve igual para el inventario inicial (el
-- teórico es 0) y para el conteo cíclico.
create or replace function public.consumibles_registrar_conteo(
  p_material_id uuid,
  p_sede text,
  p_contado numeric,
  p_gramos numeric default null,
  p_nota text default null,
  p_lote uuid default null
)
returns public.consumibles_movimientos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teorico numeric;
  v_row public.consumibles_movimientos;
begin
  if not public.panol_es_operador_solicitudes(auth.uid()) then
    raise exception 'Sin permiso para contar stock';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'La cantidad contada no puede ser negativa';
  end if;
  if p_sede is null or p_sede not in ('Pampa', 'Chubut') then
    raise exception 'Elegí la sede del pañol';
  end if;

  perform pg_advisory_xact_lock(hashtext('consumibles:' || p_material_id::text || ':' || p_sede));

  select coalesce(sum(cantidad), 0)
    into v_teorico
    from public.consumibles_movimientos
   where material_id = p_material_id
     and sede = p_sede
     and anulado_at is null;

  insert into public.consumibles_movimientos (
    material_id, sede, tipo, cantidad, contado, teorico, gramos, lote, origen, nota
  )
  values (
    p_material_id, p_sede, 'inventario', p_contado - v_teorico, p_contado, v_teorico,
    p_gramos, p_lote, 'conteo', nullif(trim(coalesce(p_nota, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 5. Espejo del circuito de solicitudes ───────────────────────────────────
--
-- panol_confirmar_retiro_solicitud graba los consumibles en el ledger viejo
-- ANTES de completar quién retira, así que el espejo no puede colgarse del
-- insert del snapshot: se cuelga de la solicitud. Cuando `retirado_at` pasa a
-- tener valor, se copian sus consumibles; cuando vuelve a null (deshacer
-- retiro), se anulan.

create or replace function public.consumibles_espejo_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.retirado_at is not null and old.retirado_at is null then
    insert into public.consumibles_movimientos (
      material_id, sede, tipo, cantidad,
      empleado_id, empleado_nombre, empleado_dni, metodo_firma,
      obra_id, sector, carril, solicitud_id, snapshot_id, origen, nota, created_at
    )
    select
      s.material_id,
      coalesce(s.stock_sede, new.sede_origen),
      'retiro',
      -abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad)),
      new.retirado_por_id, new.retirado_por_nombre, new.retirado_por_dni,
      case when new.retirado_metodo in ('nfc', 'manual') then new.retirado_metodo end,
      coalesce(s.obra_id, new.obra_id),
      coalesce(s.sector_destino, new.sector),
      'planificado',
      new.id,
      s.id,
      'solicitud',
      'Solicitud N° ' || new.numero,
      new.retirado_at
    from public.panol_obra_materiales_snapshot s
    where s.panol_solicitud_id = new.id
      and s.source = 'solicitud_consumible_retiro'
      and s.material_id is not null
      and coalesce(s.stock_sede, new.sede_origen) in ('Pampa', 'Chubut')
      and coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0) <> 0
      and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
    on conflict (snapshot_id) do nothing;

  elsif old.retirado_at is not null and new.retirado_at is null then
    update public.consumibles_movimientos
       set anulado_at = now(),
           anulado_por = auth.uid(),
           anulado_motivo = 'Retiro de solicitud deshecho'
     where solicitud_id = new.id
       and origen = 'solicitud'
       and anulado_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consumibles_espejo_solicitud on public.panol_solicitudes;
create trigger trg_consumibles_espejo_solicitud
  after update of retirado_at on public.panol_solicitudes
  for each row execute function public.consumibles_espejo_solicitud();

-- ── 6. Permisos ─────────────────────────────────────────────────────────────
--
-- Operan los mismos que en solicitudes: admin, pañol, compras, técnica, oficina.
-- Las listas de precios las cargan solo admin, compras y técnica.

alter table public.consumibles_listas enable row level security;
alter table public.consumibles_lista_items enable row level security;
alter table public.consumibles_config enable row level security;
alter table public.consumibles_movimientos enable row level security;

drop policy if exists "consumibles_listas select" on public.consumibles_listas;
create policy "consumibles_listas select" on public.consumibles_listas
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_listas write" on public.consumibles_listas;
create policy "consumibles_listas write" on public.consumibles_listas
  for all using (public.is_panol_manager(auth.uid()))
  with check (public.is_panol_manager(auth.uid()));

drop policy if exists "consumibles_lista_items select" on public.consumibles_lista_items;
create policy "consumibles_lista_items select" on public.consumibles_lista_items
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_lista_items write" on public.consumibles_lista_items;
create policy "consumibles_lista_items write" on public.consumibles_lista_items
  for all using (public.is_panol_manager(auth.uid()))
  with check (public.is_panol_manager(auth.uid()));

drop policy if exists "consumibles_config select" on public.consumibles_config;
create policy "consumibles_config select" on public.consumibles_config
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_config insert" on public.consumibles_config;
create policy "consumibles_config insert" on public.consumibles_config
  for insert with check (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_config update" on public.consumibles_config;
create policy "consumibles_config update" on public.consumibles_config
  for update using (public.panol_es_operador_solicitudes())
  with check (public.panol_es_operador_solicitudes());

drop policy if exists "consumibles_movimientos select" on public.consumibles_movimientos;
create policy "consumibles_movimientos select" on public.consumibles_movimientos
  for select using (public.panol_es_operador_solicitudes());
drop policy if exists "consumibles_movimientos insert" on public.consumibles_movimientos;
create policy "consumibles_movimientos insert" on public.consumibles_movimientos
  for insert with check (public.panol_es_operador_solicitudes());
-- Update existe solo para anular (el trigger rechaza cualquier otro cambio).
-- No hay política de delete: el registro no se borra.
drop policy if exists "consumibles_movimientos anular" on public.consumibles_movimientos;
create policy "consumibles_movimientos anular" on public.consumibles_movimientos
  for update using (public.panol_es_operador_solicitudes())
  with check (public.panol_es_operador_solicitudes());

grant select, insert, update, delete on public.consumibles_listas to authenticated;
grant select, insert, update, delete on public.consumibles_lista_items to authenticated;
grant select, insert, update on public.consumibles_config to authenticated;
grant select, insert, update on public.consumibles_movimientos to authenticated;
grant select on public.consumibles_stock to authenticated;
grant usage, select on sequence public.consumibles_codigo_seq to authenticated;
grant execute on function public.consumibles_registrar_conteo(uuid, text, numeric, numeric, text, uuid) to authenticated;

-- Cuentas de demostración: solo lectura, como el resto de las tablas.
drop trigger if exists trg_bloquear_escritura_cuenta_demo on public.consumibles_listas;
create trigger trg_bloquear_escritura_cuenta_demo
  before insert or update or delete on public.consumibles_listas
  for each statement execute function public.bloquear_escritura_cuenta_demo();
drop trigger if exists trg_bloquear_escritura_cuenta_demo on public.consumibles_lista_items;
create trigger trg_bloquear_escritura_cuenta_demo
  before insert or update or delete on public.consumibles_lista_items
  for each statement execute function public.bloquear_escritura_cuenta_demo();
drop trigger if exists trg_bloquear_escritura_cuenta_demo on public.consumibles_config;
create trigger trg_bloquear_escritura_cuenta_demo
  before insert or update or delete on public.consumibles_config
  for each statement execute function public.bloquear_escritura_cuenta_demo();
drop trigger if exists trg_bloquear_escritura_cuenta_demo on public.consumibles_movimientos;
create trigger trg_bloquear_escritura_cuenta_demo
  before insert or update or delete on public.consumibles_movimientos
  for each statement execute function public.bloquear_escritura_cuenta_demo();

commit;
