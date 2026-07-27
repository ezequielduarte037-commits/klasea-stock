-- ═════════════════════════════════════════════════════════════════════════════
-- Solicitudes de preparación a pañol — digitalización del papel.
--
-- El circuito real es de papel y no se cambia: alguien imprime la hoja A4
-- (SolicitudPanolPrintable), la completa a mano y se la lleva a pañol. Lo que
-- se digitaliza es lo que pasa DESPUÉS:
--
--   1. Pañol carga la cabecera del papel     → panol_solicitudes
--   2. Va agregando lo que va armando        → panol_solicitud_items
--   3. Marca estado por ítem y de la hoja    → estado / items.estado
--   4. Imprime la hoja YA COMPLETA
--   5. Quien retira firma con NFC            → retirado_* en panol_solicitudes
--
-- El papel original se abrocha a la hoja impresa: el comprobante de retiro
-- (quién, cómo y cuándo) viaja impreso abajo a la derecha.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Numerador visible ────────────────────────────────────────────────────
-- El "N° pañol" del papel. Va como secuencia propia y no como el uuid porque
-- es el número que se canta en voz alta y se escribe a mano en el papel para
-- conciliar los dos soportes: tiene que ser corto y legible.

create sequence if not exists public.panol_solicitudes_numero_seq as int start 1;

-- ── 2. La solicitud (la cabecera del papel) ─────────────────────────────────

create table if not exists public.panol_solicitudes (
  id uuid primary key default gen_random_uuid(),
  numero int not null default nextval('public.panol_solicitudes_numero_seq'),

  -- La obra puede o no existir en el sistema: el papel a veces dice "casco 50"
  -- o directamente "taller". Por eso van las dos: el vínculo real cuando se
  -- puede resolver, y el texto crudo del papel cuando no.
  obra_id uuid references public.produccion_obras(id) on delete set null,
  obra_texto text,

  sector text,
  prioridad text not null default 'normal' check (prioridad in ('normal', 'urgente')),
  fecha_pedido date not null default current_date,
  fecha_retiro date,

  -- Nombres sueltos, no FKs: en el papel los escribe cualquiera a mano y no
  -- siempre coinciden con el maestro de RRHH. El vínculo fuerte con una persona
  -- se hace recién en el retiro, con la tarjeta NFC.
  solicita text,
  retira text,

  -- Consumibles / Materiales / Herramientas. Es multi-selección en el papel,
  -- así que va como array y no como columna por tipo.
  tipo text[] not null default '{}'::text[],

  tarea text,
  observaciones text,
  notas_panol text,
  -- Quien de pañol armó el pedido. Texto libre porque en el turno lo puede
  -- preparar alguien que no está logueado en la máquina.
  preparado_por text,

  estado text not null default 'borrador'
    check (estado in ('borrador', 'preparando', 'listo', 'entregado', 'cancelado')),

  -- ── Firma de retiro ───────────────────────────────────────────────────────
  -- Va en la misma fila y no en tabla aparte: el retiro ocurre una sola vez por
  -- solicitud y siempre se lee junto con ella (la hoja impresa lo necesita).
  retirado_por_id uuid references public.rrhh_empleados(id) on delete set null,
  -- Nombre y DNI congelados: si mañana borran o renombran al empleado, el
  -- comprobante impreso tiene que seguir diciendo lo mismo que el papel.
  retirado_por_nombre text,
  retirado_por_dni text,
  retirado_metodo text check (retirado_metodo in ('nfc', 'manual')),
  -- Qué tarjeta se apoyó. Sirve para auditar un retiro discutido.
  retirado_nfc_uid text,
  retirado_at timestamptz,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists panol_solicitudes_numero_unique
  on public.panol_solicitudes(numero);
create index if not exists idx_panol_solicitudes_obra
  on public.panol_solicitudes(obra_id);
create index if not exists idx_panol_solicitudes_estado
  on public.panol_solicitudes(estado, created_at desc);
create index if not exists idx_panol_solicitudes_created
  on public.panol_solicitudes(created_at desc);

-- ── 3. Los ítems ────────────────────────────────────────────────────────────

create table if not exists public.panol_solicitud_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.panol_solicitudes(id) on delete cascade,

  -- Nullable a propósito: la mitad de lo que se pide a mano no está en el
  -- catálogo ("bulón 8x40 del cajón azul"). Se carga igual como ítem suelto.
  material_id uuid references public.panol_materiales(id) on delete set null,

  -- Descripción y código CONGELADOS al momento de cargar el ítem. Si mañana
  -- alguien renombra el material en el catálogo, la hoja que ya se imprimió y
  -- se firmó tiene que seguir diciendo lo que decía.
  descripcion text not null,
  codigo text,

  cantidad numeric not null default 1,
  unidad text,
  observacion text,

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'preparado', 'faltante', 'reemplazado')),
  orden int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_panol_solicitud_items_solicitud
  on public.panol_solicitud_items(solicitud_id, orden);
create index if not exists idx_panol_solicitud_items_material
  on public.panol_solicitud_items(material_id);
create index if not exists idx_panol_solicitud_items_estado
  on public.panol_solicitud_items(estado);

-- ── 4. updated_at ───────────────────────────────────────────────────────────

drop trigger if exists trg_panol_solicitudes_updated_at on public.panol_solicitudes;
create trigger trg_panol_solicitudes_updated_at
before update on public.panol_solicitudes
for each row execute function public.touch_updated_at();

drop trigger if exists trg_panol_solicitud_items_updated_at on public.panol_solicitud_items;
create trigger trg_panol_solicitud_items_updated_at
before update on public.panol_solicitud_items
for each row execute function public.touch_updated_at();

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Misma convención que el resto: autenticado lee y escribe. Pañol carga y
-- prepara; oficina y técnica consultan y corrigen sobre las mismas filas.

do $$
declare t text;
begin
  foreach t in array array[
    'panol_solicitudes',
    'panol_solicitud_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated all" on public.%I', t, t);
    execute format(
      'create policy "%s authenticated all" on public.%I for all to authenticated '
      || 'using (auth.uid() is not null) with check (auth.uid() is not null)', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- El default de `numero` corre con los permisos del que inserta, así que la
-- secuencia también tiene que estar habilitada para authenticated.
grant usage, select on sequence public.panol_solicitudes_numero_seq to authenticated;

-- ── 6. Comentarios ──────────────────────────────────────────────────────────

comment on table public.panol_solicitudes is
  'Solicitudes de preparación a pañol digitalizadas desde el papel. numero = N° pañol de la hoja.';
comment on column public.panol_solicitudes.obra_texto is
  'Lo que dice el papel cuando la obra no existe en produccion_obras (ej: "taller", "casco 50").';
comment on column public.panol_solicitudes.retirado_metodo is
  'nfc = leyó la tarjeta del que retira; manual = pañol lo eligió de la lista porque no había lector.';
comment on table public.panol_solicitud_items is
  'Lo que pañol fue armando para una solicitud. descripcion/codigo quedan congelados al cargarse.';
