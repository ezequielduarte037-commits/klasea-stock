-- Laminación en dos galpones: Pampa y Chubut.
--
-- El problema: en Chubut también se lamina, pero el sistema no lo sabe. Hoy el
-- material que va para allá se carga como un egreso con destino 'CHUBUT' —hay
-- 38 así, desde el 26/2 hasta el 21/8— y a partir de ese momento desaparece:
-- no está en Pampa porque salió, y no está en Chubut porque Chubut no existe
-- como lugar. Nadie puede decir qué hay en el otro galpón.
--
-- Por qué la sede va en el movimiento y no en tablas separadas por galpón:
--   1. El catálogo tiene que ser uno solo. Si Chubut tuviera su propio "Mat
--      300", con otro id, la pregunta que motivó todo esto -"me quedé en cero,
--      ¿hay en el otro galpón?"- sería imposible de responder: serían dos
--      materiales distintos que casualmente se llaman igual.
--   2. El stock ya se calcula sumando movimientos. Agregando la sede al
--      movimiento, el stock por galpón sale de la misma suma agrupada por una
--      columna más. No hay un segundo cálculo que pueda contradecir al primero.
--   3. Un tercer galpón entra sin migración.
--
-- Lo que NO hace esta migración: darle stock inicial a Chubut. Los 38 egresos
-- históricos quedan como están, en Pampa. Ese material se mandó entre febrero y
-- agosto y en su mayoría ya se consumió; derivar de ahí un stock inicial sería
-- inventarle a Chubut 15 BRITEC 2000B que no están. Chubut arranca en cero y se
-- carga con un conteo físico, que es el único número que no miente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · La sede en cada movimiento
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.laminacion_movimientos
  add column if not exists sede text;

-- Todo lo que existe hasta hoy pasó en Pampa: es el único galpón que el sistema
-- registró hasta ahora.
update public.laminacion_movimientos
set sede = 'Pampa'
where sede is null;

alter table public.laminacion_movimientos
  alter column sede set not null;

-- A propósito SIN default. Un default 'Pampa' haría que un camino de escritura
-- que se olvide de mandar la sede archive el movimiento en Pampa en silencio, y
-- ese material queda mal contado en los dos galpones sin que nadie se entere.
-- Sin default, ese mismo olvido revienta en el momento y se arregla ahí.
alter table public.laminacion_movimientos
  drop constraint if exists laminacion_movimientos_sede_valida;
alter table public.laminacion_movimientos
  add constraint laminacion_movimientos_sede_valida
  check (sede in ('Pampa', 'Chubut'));

comment on column public.laminacion_movimientos.sede is
  'Galpón donde ocurrió el movimiento. El stock de cada galpón es la suma de sus propios movimientos. Sin default: escribir un movimiento sin sede tiene que fallar, no adivinar.';

-- El stock se calcula recorriendo todos los movimientos de un galpón, así que
-- ese es el orden en que conviene tenerlos.
create index if not exists idx_laminacion_movimientos_sede_material
  on public.laminacion_movimientos (sede, material_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · La sede en el pedido
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.laminacion_pedidos
  add column if not exists sede text;

update public.laminacion_pedidos
set sede = 'Pampa'
where sede is null;

alter table public.laminacion_pedidos
  alter column sede set not null;

alter table public.laminacion_pedidos
  drop constraint if exists laminacion_pedidos_sede_valida;
alter table public.laminacion_pedidos
  add constraint laminacion_pedidos_sede_valida
  check (sede in ('Pampa', 'Chubut'));

comment on column public.laminacion_pedidos.sede is
  'Galpón que pide. Compras necesita saberlo para mandar el material al lugar correcto.';

create index if not exists idx_laminacion_pedidos_sede
  on public.laminacion_pedidos (sede, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · Las obras también viven en un galpón
-- ─────────────────────────────────────────────────────────────────────────────

-- La columna ya existía y estaba en null en las 34 obras. Se empieza a usar.
update public.laminacion_obras
set ubicacion = 'Pampa'
where ubicacion is null;

comment on column public.laminacion_obras.ubicacion is
  'Galpón donde se lamina esta obra. Sin constraint a propósito: la columna es vieja y puede tener texto libre de antes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Mínimos por galpón
-- ─────────────────────────────────────────────────────────────────────────────

-- Un mínimo por material no alcanza: en Pampa se laminan cascos grandes y en
-- Chubut no, así que la cantidad a partir de la cual hay que reponer no es la
-- misma. Va en tabla aparte y no en dos columnas del material (stock_minimo /
-- stock_minimo_chubut) porque con dos columnas el tercer galpón obliga a otra
-- migración y a tocar todas las consultas.
create table if not exists public.laminacion_stock_minimos (
  material_id uuid not null
    references public.laminacion_materiales(id) on delete cascade,
  sede text not null check (sede in ('Pampa', 'Chubut')),
  minimo numeric not null default 0 check (minimo >= 0),
  updated_at timestamptz not null default now(),
  updated_por uuid default auth.uid()
    references public.profiles(id) on delete set null,
  primary key (material_id, sede)
);

comment on table public.laminacion_stock_minimos is
  'Mínimo de reposición por material y galpón. Es la única fuente del mínimo: laminacion_materiales.stock_minimo queda como dato histórico y no se lee más.';

-- Los mínimos que ya estaban cargados son los de Pampa.
insert into public.laminacion_stock_minimos (material_id, sede, minimo)
select id, 'Pampa', coalesce(stock_minimo, 0)
from public.laminacion_materiales
on conflict (material_id, sede) do nothing;

-- Chubut arranca con todos los materiales en cero. Se crean las filas ahora
-- para que la pantalla de mínimos tenga algo que editar desde el día uno, y
-- cero significa lo que tiene que significar: todavía nadie lo definió.
insert into public.laminacion_stock_minimos (material_id, sede, minimo)
select id, 'Chubut', 0
from public.laminacion_materiales
on conflict (material_id, sede) do nothing;

comment on column public.laminacion_materiales.stock_minimo is
  'OBSOLETO desde la migración multi-sede. El mínimo real vive en laminacion_stock_minimos, por galpón. Se conserva para no perder el valor histórico; no lo leas.';

alter table public.laminacion_stock_minimos enable row level security;

drop policy if exists "laminacion minimos lectura" on public.laminacion_stock_minimos;
create policy "laminacion minimos lectura"
on public.laminacion_stock_minimos for select to authenticated
using (true);

drop policy if exists "laminacion minimos escritura" on public.laminacion_stock_minimos;
create policy "laminacion minimos escritura"
on public.laminacion_stock_minimos for all to authenticated
using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Traslados entre galpones
-- ─────────────────────────────────────────────────────────────────────────────

-- Único punto donde los dos galpones se tocan.
--
-- Un traslado escribe DOS movimientos: un egreso en el origen y un ingreso en
-- el destino, atados los dos a esta fila. Así el material nunca se duplica ni
-- se pierde, y cada galpón sigue calculando su stock de la misma manera de
-- siempre, sin ningún caso especial.
--
-- Por qué hay un estado 'en_transito' en el medio: entre que sale de un galpón
-- y llega al otro, el material no está en ninguno de los dos. Si el ingreso se
-- escribiera al mismo tiempo que el egreso, el destino vería stock que todavía
-- está arriba de un camión, y alguien lo contaría para planificar. El ingreso
-- se escribe cuando el destino confirma que llegó.
create table if not exists public.laminacion_traslados (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null
    references public.laminacion_materiales(id) on delete restrict,
  cantidad numeric not null check (cantidad > 0),
  sede_origen text not null check (sede_origen in ('Pampa', 'Chubut')),
  sede_destino text not null check (sede_destino in ('Pampa', 'Chubut')),
  estado text not null default 'en_transito'
    check (estado in ('en_transito', 'recibido', 'cancelado')),
  -- El egreso se escribe al salir; el ingreso recién cuando el destino confirma.
  movimiento_egreso_id uuid
    references public.laminacion_movimientos(id) on delete set null,
  movimiento_ingreso_id uuid
    references public.laminacion_movimientos(id) on delete set null,
  observaciones text,
  enviado_por uuid default auth.uid()
    references public.profiles(id) on delete set null,
  recibido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  recibido_at timestamptz,
  cancelado_at timestamptz,
  cancelado_motivo text,
  constraint laminacion_traslados_sedes_distintas
    check (sede_destino <> sede_origen)
);

comment on table public.laminacion_traslados is
  'Material que se manda de un galpón al otro. Escribe un egreso en el origen al salir y un ingreso en el destino al confirmarse la llegada; en el medio el material está en tránsito y no cuenta para ninguno de los dos.';
comment on column public.laminacion_traslados.estado is
  'en_transito = salió y todavía no llegó · recibido = el destino lo confirmó y ya suma a su stock · cancelado = volvió al origen o nunca salió.';

-- La pantalla de cada galpón pregunta dos cosas: qué me está por llegar y qué
-- mandé que todavía no confirmaron.
create index if not exists idx_laminacion_traslados_destino
  on public.laminacion_traslados (sede_destino, estado, created_at desc);
create index if not exists idx_laminacion_traslados_origen
  on public.laminacion_traslados (sede_origen, estado, created_at desc);

alter table public.laminacion_traslados enable row level security;

drop policy if exists "laminacion traslados lectura" on public.laminacion_traslados;
create policy "laminacion traslados lectura"
on public.laminacion_traslados for select to authenticated
using (true);

drop policy if exists "laminacion traslados escritura" on public.laminacion_traslados;
create policy "laminacion traslados escritura"
on public.laminacion_traslados for all to authenticated
using (true) with check (true);
