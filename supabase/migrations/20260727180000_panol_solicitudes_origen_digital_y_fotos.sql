-- ═════════════════════════════════════════════════════════════════════════════
-- Solicitudes de pañol — tres caminos de entrada, un solo circuito.
--
-- Hasta ahora la única forma de que exista una solicitud era que PAÑOL copiara
-- a mano lo que decía un papel. Se suman dos caminos más, sin tocar el que ya
-- anda:
--
--   'papel'   → pañol transcribe el papel (lo de siempre, sigue siendo el default)
--   'digital' → el que pide la carga desde su propio usuario, sin papel
--   'foto_ia' → se saca una foto del papel y la IA deja un BORRADOR a revisar
--
-- Guardar el origen no es decorativo: cuando dentro de seis meses aparezca una
-- solicitud con datos raros, lo primero que se va a querer saber es si eso lo
-- tipeó una persona o lo leyó un modelo de una foto con letra manuscrita.
--
-- Además:
--   · estado 'enviada' → el solicitante ya la mandó y pañol todavía no la tomó.
--   · panol_solicitud_fotos → las fotos del papel quedan como respaldo SIEMPRE,
--     aunque la IA falle o devuelva cualquier cosa.
--   · RLS fina → el solicitante ve y edita sólo lo suyo; pañol ve todo.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Origen de la solicitud ───────────────────────────────────────────────

alter table public.panol_solicitudes
  add column if not exists origen text not null default 'papel';

-- El constraint va aparte del add column para que la migración sea reejecutable
-- (add column if not exists no vuelve a aplicar el check si la columna ya está).
alter table public.panol_solicitudes
  drop constraint if exists panol_solicitudes_origen_check;
alter table public.panol_solicitudes
  add constraint panol_solicitudes_origen_check
  check (origen in ('papel', 'digital', 'foto_ia'));

-- ── 2. Estado 'enviada' ─────────────────────────────────────────────────────
-- Se intercala entre 'borrador' y 'preparando'. No se renombra ni se saca
-- ninguno de los que ya existen: el flujo de pañol tiene que seguir igual.
--
--   borrador  → el solicitante la está armando (nadie más la necesita ver)
--   enviada   → ya la mandó; aparece en la bandeja de pañol
--   preparando→ pañol la tomó y está juntando las cosas  (ya existía)
--   listo / entregado / cancelado                        (ya existían)

alter table public.panol_solicitudes
  drop constraint if exists panol_solicitudes_estado_check;
alter table public.panol_solicitudes
  add constraint panol_solicitudes_estado_check
  check (estado in ('borrador', 'enviada', 'preparando', 'listo', 'entregado', 'cancelado'));

-- El solicitante lista "las mías": sin este índice es un seq scan sobre toda
-- la tabla en cada apertura de la pantalla.
create index if not exists idx_panol_solicitudes_created_by
  on public.panol_solicitudes(created_by, created_at desc);

-- ── 3. Fotos del papel ──────────────────────────────────────────────────────
-- Tabla aparte y no un array en la cabecera: cada foto tiene su propio estado
-- de lectura (qué devolvió la IA, si falló) y se puede borrar una sola.
--
-- `extraccion` guarda el JSON crudo que devolvió el modelo. Es la única forma
-- de auditar después "la IA leyó mal" vs "pañol confirmó mal": lo que se guardó
-- en los ítems es lo que un humano confirmó, esto es lo que la máquina propuso.

create table if not exists public.panol_solicitud_fotos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.panol_solicitudes(id) on delete cascade,

  -- url pública + path del bucket. El path es lo que hace falta para borrar el
  -- objeto; la url es lo que se le muestra a pañol al lado del borrador.
  url text not null,
  path text,
  nombre text,
  tipo text,
  tamano bigint,

  -- 'pendiente' | 'ok' | 'error' — para poder reintentar la lectura de una foto
  -- sin volver a subirla.
  estado_lectura text not null default 'pendiente'
    check (estado_lectura in ('pendiente', 'ok', 'error')),
  error_lectura text,
  extraccion jsonb,

  orden int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_panol_solicitud_fotos_solicitud
  on public.panol_solicitud_fotos(solicitud_id, orden);

drop trigger if exists trg_panol_solicitud_fotos_updated_at on public.panol_solicitud_fotos;
create trigger trg_panol_solicitud_fotos_updated_at
before update on public.panol_solicitud_fotos
for each row execute function public.touch_updated_at();

-- ── 4. Quién es "pañol" a los ojos de la base ───────────────────────────────
-- Mismos roles que ya tienen la ruta /solicitudes-panol habilitada en App.jsx.
-- Va como función security definer porque las policies necesitan leer profiles
-- y el usuario común no tiene por qué poder leer la fila de otro.

create or replace function public.panol_es_operador_solicitudes(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in ('admin', 'panol', 'tecnica', 'oficina')
      )
  );
$$;

revoke all on function public.panol_es_operador_solicitudes(uuid) from public;
grant execute on function public.panol_es_operador_solicitudes(uuid) to authenticated;

-- Las dos preguntas que hacen las policies de los hijos (ítems y fotos). Van
-- como funciones y no como un `exists` inline en cada policy para no repetir el
-- subquery seis veces y para que el plan quede cacheado.
create or replace function public.panol_solicitud_es_mia(p_solicitud_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.panol_solicitudes s
    where s.id = p_solicitud_id and s.created_by = auth.uid()
  );
$$;

-- El solicitante puede tocar lo suyo mientras pañol no lo tomó. Una vez que
-- pasa a 'preparando' la solicitud es de pañol: si el que pidió pudiera seguir
-- editando, pañol estaría armando un pedido que cambia debajo de sus manos.
create or replace function public.panol_solicitud_editable_por_mi(p_solicitud_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.panol_solicitudes s
    where s.id = p_solicitud_id
      and s.created_by = auth.uid()
      and s.estado in ('borrador', 'enviada')
  );
$$;

revoke all on function public.panol_solicitud_es_mia(uuid) from public;
revoke all on function public.panol_solicitud_editable_por_mi(uuid) from public;
grant execute on function public.panol_solicitud_es_mia(uuid) to authenticated;
grant execute on function public.panol_solicitud_editable_por_mi(uuid) to authenticated;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Antes era "cualquier autenticado hace cualquier cosa". Con el solicitante
-- cargando desde su propio usuario eso deja de alcanzar: el de laminación no
-- tiene por qué ver (ni borrar) el pedido del de mecánica.
--
-- Pañol / técnica / oficina / admin siguen viendo y pudiendo todo, así que el
-- flujo que ya anda no cambia.

alter table public.panol_solicitudes enable row level security;
drop policy if exists "panol_solicitudes authenticated all" on public.panol_solicitudes;

drop policy if exists "panol_solicitudes select" on public.panol_solicitudes;
create policy "panol_solicitudes select"
  on public.panol_solicitudes for select to authenticated
  using (
    public.panol_es_operador_solicitudes()
    or created_by = auth.uid()
  );

drop policy if exists "panol_solicitudes insert" on public.panol_solicitudes;
create policy "panol_solicitudes insert"
  on public.panol_solicitudes for insert to authenticated
  with check (
    public.panol_es_operador_solicitudes()
    or created_by = auth.uid()
  );

-- El `with check` limita a qué estados puede llevarla el solicitante: puede
-- mandarla ('enviada') pero no marcarla como entregada por su cuenta.
drop policy if exists "panol_solicitudes update" on public.panol_solicitudes;
create policy "panol_solicitudes update"
  on public.panol_solicitudes for update to authenticated
  using (
    public.panol_es_operador_solicitudes()
    or (created_by = auth.uid() and estado in ('borrador', 'enviada'))
  )
  with check (
    public.panol_es_operador_solicitudes()
    or (created_by = auth.uid() and estado in ('borrador', 'enviada'))
  );

drop policy if exists "panol_solicitudes delete" on public.panol_solicitudes;
create policy "panol_solicitudes delete"
  on public.panol_solicitudes for delete to authenticated
  using (
    public.panol_es_operador_solicitudes()
    or (created_by = auth.uid() and estado in ('borrador', 'enviada'))
  );

-- Ítems y fotos heredan el permiso de su solicitud.
do $$
declare t text;
begin
  foreach t in array array['panol_solicitud_items', 'panol_solicitud_fotos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated all" on public.%I', t, t);

    execute format('drop policy if exists "%s select" on public.%I', t, t);
    execute format(
      'create policy "%s select" on public.%I for select to authenticated using ('
      || 'public.panol_es_operador_solicitudes() or public.panol_solicitud_es_mia(solicitud_id))', t, t);

    execute format('drop policy if exists "%s write" on public.%I', t, t);
    execute format(
      'create policy "%s write" on public.%I for all to authenticated using ('
      || 'public.panol_es_operador_solicitudes() or public.panol_solicitud_editable_por_mi(solicitud_id)) '
      || 'with check (public.panol_es_operador_solicitudes() or public.panol_solicitud_editable_por_mi(solicitud_id))', t, t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant select, insert, update, delete on public.panol_solicitudes to authenticated;
-- El default de `numero` corre con los permisos del que inserta: sin este grant
-- el insert del solicitante falla con "permission denied for sequence".
grant usage, select on sequence public.panol_solicitudes_numero_seq to authenticated;

-- ── 6. Storage de las fotos ─────────────────────────────────────────────────
-- Se reusa el bucket `documentos` que ya existe (lo usa Procedimientos) en vez
-- de crear uno nuevo. Las policies se acotan a la carpeta `solicitudes-panol/`
-- y son PERMISSIVE, así que se suman a las que el bucket ya tenga sin pisarlas.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists "solicitudes panol fotos insert" on storage.objects;
create policy "solicitudes panol fotos insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = 'solicitudes-panol');

drop policy if exists "solicitudes panol fotos select" on storage.objects;
create policy "solicitudes panol fotos select"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = 'solicitudes-panol');

drop policy if exists "solicitudes panol fotos delete" on storage.objects;
create policy "solicitudes panol fotos delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = 'solicitudes-panol');

-- ── 7. Comentarios ──────────────────────────────────────────────────────────

comment on column public.panol_solicitudes.origen is
  'papel = pañol transcribió la hoja; digital = la cargó el solicitante desde su usuario; foto_ia = salió de una foto leída con IA y confirmada por un humano.';
comment on table public.panol_solicitud_fotos is
  'Fotos del papel original. Se guardan SIEMPRE, aunque la lectura con IA falle: son el respaldo del pedido.';
comment on column public.panol_solicitud_fotos.extraccion is
  'JSON crudo que devolvió el modelo. Lo que se guardó en los ítems es lo que confirmó un humano; esto es lo que propuso la máquina.';
