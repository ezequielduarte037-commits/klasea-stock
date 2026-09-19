-- Memoria viva: la memoria descriptiva de cada barco conectada con su matriz,
-- las compras y el pañol.
--
-- Hoy la memoria vive en obra_memorias: una fila por barco y una columna por
-- campo (starlink, piso, madera_muebles…). Sirve para la ficha y para imprimir,
-- pero no sabe qué materiales implica cada elección ni si ya llegaron. Esta
-- migración agrega, sin tocar obra_memorias (la pantalla actual sigue igual):
--
--   memoria_campos          qué se define, en qué zona del barco va y quién lo resuelve
--   memoria_valores         un valor por barco y campo (se copian los datos de obra_memorias)
--   memoria_historial       quién cambió qué y cuándo (pedidos de cambio del cliente)
--   memoria_reglas          "si la memoria dice X, la obra necesita Y"
--   memoria_vinculos        qué renglones de materiales de la obra son de cada campo
--   v_memoria_trazabilidad  cada campo con su etapa: memoria → matriz → compra → pañol → a bordo
--   memoria_chequear_reglas(obra) lectura: qué pide la memoria y no está en la obra
--
-- Es aditiva e idempotente. No crea compras ni movimientos: sólo relaciona.

-- ─── 1. Catálogo de campos ──────────────────────────────────────────────────
create table if not exists public.memoria_campos (
  key text primary key,
  label text not null,
  seccion text not null,
  zona text not null default 'general'
    check (zona in ('fly', 'interior', 'camarotes', 'cockpit', 'proa', 'propulsion', 'casco', 'general')),
  tipo text not null default 'texto'
    check (tipo in ('texto', 'toggle', 'selector', 'acabado')),
  -- Quién lo resuelve: se compra, lo hace un taller propio, o es un dato.
  resuelve text not null default 'compra'
    check (resuelve in ('compra', 'muebles', 'marmoleria', 'laminacion', 'tapiceria', 'definicion')),
  -- Líneas que lo usan ('37', '52'…); vacío = todas.
  lineas text[] not null default '{}',
  opciones jsonb not null default '[]'::jsonb,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.memoria_campos (key, label, seccion, zona, tipo, resuelve, orden, activo) values
  ('propietario',        'Propietario',                     'Identificación', 'general',    'texto',    'definicion', 10,  true),
  ('constructor',        'Constructor',                     'Identificación', 'general',    'texto',    'definicion', 20,  true),
  ('nombre_barco',       'Nombre del barco',                'Identificación', 'general',    'texto',    'definicion', 30,  true),
  ('cabina',             'Cabina / Tipo',                   'Estructura',     'general',    'texto',    'definicion', 40,  true),
  ('motorizacion',       'Motorización',                    'Estructura',     'propulsion', 'texto',    'compra',     50,  true),
  ('color_casco',        'Color / Fondo de casco',          'Estructura',     'casco',      'texto',    'laminacion', 60,  true),
  ('grupo_electrogeno',  'Grupo electrógeno',               'Estructura',     'propulsion', 'texto',    'compra',     70,  true),
  ('madera_muebles',     'Muebles / Enchapado',             'Interiores',     'interior',   'acabado',  'muebles',    80,  true),
  ('piso',               'Piso',                            'Interiores',     'interior',   'acabado',  'compra',     90,  true),
  ('alfombra',           'Alfombra',                        'Interiores',     'camarotes',  'acabado',  'compra',     100, true),
  ('color_mesadas',      'Mesadas',                         'Interiores',     'interior',   'acabado',  'marmoleria', 110, true),
  ('tapiceria_mamparos', 'Mamparos',                        'Tapicería',      'camarotes',  'acabado',  'tapiceria',  120, true),
  ('tapiceria_dinette',  'Dinette / Sillón',                'Tapicería',      'interior',   'acabado',  'tapiceria',  130, true),
  ('tapiceria_respaldos','Respaldos / Bandeau',             'Tapicería',      'camarotes',  'acabado',  'tapiceria',  140, true),
  ('tapiceria_exterior', 'Tapicería exterior',              'Tapicería',      'cockpit',    'acabado',  'tapiceria',  150, true),
  ('color_acolchados',   'Acolchados',                      'Tapicería',      'camarotes',  'acabado',  'tapiceria',  160, true),
  ('color_cerramientos', 'Cerramientos',                    'Tapicería',      'cockpit',    'acabado',  'tapiceria',  170, true),
  ('loneria_toldo_proa', 'Toldo rebatible proa',            'Lonería',        'proa',       'texto',    'tapiceria',  180, true),
  ('loneria_cobertor',   'Cobertor / Lona',                 'Lonería',        'cockpit',    'texto',    'tapiceria',  190, true),
  ('loneria_otros',      'Cerramientos / tambucho / otros', 'Lonería',        'cockpit',    'texto',    'tapiceria',  200, true),
  ('electronica',        'Electrónica',                     'Electrónica',    'fly',        'texto',    'compra',     210, true),
  ('audio',              'Audio',                           'Electrónica',    'interior',   'texto',    'compra',     220, true),
  ('teca_tipo',          'Cubierta cockpit',                'Equipamiento',   'cockpit',    'selector', 'compra',     230, true),
  ('tv_camarote',        'TV camarote popa',                'Equipamiento',   'camarotes',  'texto',    'compra',     240, true),
  ('tv_cockpit',         'TV cockpit',                      'Equipamiento',   'cockpit',    'texto',    'compra',     250, true),
  ('starlink',           'Starlink',                        'Equipamiento',   'fly',        'toggle',   'compra',     260, true),
  ('sternthruster',      'Sternthruster',                   'Equipamiento',   'propulsion', 'toggle',   'compra',     270, true),
  ('fabricadora_hielo',  'Fabricadora de hielo',            'Equipamiento',   'cockpit',    'toggle',   'compra',     280, true),
  ('radar',              'Radar',                           'Equipamiento',   'fly',        'toggle',   'compra',     290, true),
  ('pluma',              'Pluma',                           'Equipamiento',   'fly',        'toggle',   'compra',     300, true),
  ('mesa_fly',           'Mesa fly',                        'Equipamiento',   'fly',        'toggle',   'muebles',    310, true),
  ('aire_acondicionado', 'Aire acondicionado',              'Equipamiento',   'interior',   'toggle',   'compra',     320, true),
  ('calefactor',         'Calefactor',                      'Equipamiento',   'interior',   'toggle',   'compra',     330, true),
  ('bow_thruster',       'Bow thruster',                    'Equipamiento',   'proa',       'toggle',   'compra',     340, true),
  ('plotter',            'Plotter',                         'Equipamiento',   'fly',        'toggle',   'compra',     350, true),
  ('faro',               'Faro',                            'Equipamiento',   'proa',       'toggle',   'compra',     360, true),
  ('flaps',              'Flaps',                           'Equipamiento',   'propulsion', 'toggle',   'compra',     370, true),
  -- La pantalla lo sacó por falta de contexto, pero hay barcos que lo tienen cargado.
  ('planchada',          'Planchada',                       'Equipamiento',   'cockpit',    'toggle',   'compra',     380, false),
  ('adicionales',        'Adicionales / Notas técnicas',    'Adicionales',    'general',    'texto',    'definicion', 390, true)
on conflict (key) do nothing;

-- ─── 2. Valores por barco ───────────────────────────────────────────────────
create table if not exists public.memoria_valores (
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  campo_key text not null references public.memoria_campos(key) on update cascade,
  valor text,
  activo boolean,              -- campos toggle
  obs text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (obra_id, campo_key)
);

-- Copia lo ya cargado en obra_memorias (si la tabla existe). Sólo campos con
-- valor, sólo de barcos que existen. No pisa lo que ya esté en memoria_valores.
do $$
begin
  if to_regclass('public.obra_memorias') is null then
    return;
  end if;
  execute $copia$
    insert into public.memoria_valores (obra_id, campo_key, valor, activo, obs)
    select o.id,
           kv.key,
           case when jsonb_typeof(kv.value) = 'boolean' then null else nullif(btrim(kv.value #>> '{}'), '') end,
           case when jsonb_typeof(kv.value) = 'boolean' then (kv.value)::boolean end,
           nullif(btrim(to_jsonb(m) ->> (kv.key || '_obs')), '')
      from public.obra_memorias m
      join lateral (
        select po.id
          from public.produccion_obras po
         where po.id = m.obra_id or po.codigo = m.obra_codigo
         order by (po.id = m.obra_id) desc
         limit 1
      ) o on true
      cross join lateral jsonb_each(to_jsonb(m) - 'id' - 'obra_id' - 'obra_codigo' - 'created_at' - 'updated_at') kv
      join public.memoria_campos c on c.key = kv.key
     where (jsonb_typeof(kv.value) = 'boolean' and (kv.value)::boolean)
        or (jsonb_typeof(kv.value) = 'string' and nullif(btrim(kv.value #>> '{}'), '') is not null)
    on conflict (obra_id, campo_key) do nothing
  $copia$;
end $$;

-- ─── 3. Historial ───────────────────────────────────────────────────────────
create table if not exists public.memoria_historial (
  id bigint generated always as identity primary key,
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  campo_key text not null,
  valor_anterior text,
  valor_nuevo text,
  activo_anterior boolean,
  activo_nuevo boolean,
  cambiado_por uuid references public.profiles(id) on delete set null,
  cambiado_at timestamptz not null default now()
);
create index if not exists memoria_historial_obra_idx on public.memoria_historial (obra_id, cambiado_at desc);

create or replace function public.memoria_valores_sellar()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- security definer: el historial no acepta escrituras directas de nadie.
create or replace function public.memoria_valores_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.valor is not distinct from new.valor
     and old.activo is not distinct from new.activo then
    return new;
  end if;
  insert into public.memoria_historial (obra_id, campo_key, valor_anterior, valor_nuevo, activo_anterior, activo_nuevo, cambiado_por)
  values (
    new.obra_id, new.campo_key,
    case when tg_op = 'UPDATE' then old.valor end, new.valor,
    case when tg_op = 'UPDATE' then old.activo end, new.activo,
    auth.uid()
  );
  return new;
end;
$$;

-- Los triggers se crean después de copiar los datos: la copia inicial no es un cambio.
drop trigger if exists memoria_valores_sellar on public.memoria_valores;
create trigger memoria_valores_sellar
  before insert or update on public.memoria_valores
  for each row execute function public.memoria_valores_sellar();

drop trigger if exists memoria_valores_historial on public.memoria_valores;
create trigger memoria_valores_historial
  after insert or update on public.memoria_valores
  for each row execute function public.memoria_valores_historial();

-- ─── 4. Reglas: qué implica cada elección ───────────────────────────────────
create table if not exists public.memoria_reglas (
  id uuid primary key default gen_random_uuid(),
  campo_key text not null references public.memoria_campos(key) on update cascade,
  linea text,                                   -- '52'; null = todas las líneas
  condicion text not null default 'activo'
    check (condicion in ('activo', 'definido', 'igual', 'contiene')),
  valor text,                                   -- para 'igual' y 'contiene'
  material_id uuid references public.panol_materiales(id) on delete cascade,  -- requisito o producto
  cantidad numeric,
  -- Mientras no haya material_id, sirven para sugerir vínculos por nombre.
  palabras_clave text[] not null default '{}',
  nota text,
  activo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists memoria_reglas_campo_idx on public.memoria_reglas (campo_key) where activo;

-- Las palabras clave que hoy usa la pantalla (src/features/memorias/memoriaViva.js).
insert into public.memoria_reglas (campo_key, condicion, palabras_clave, nota)
select v.campo_key, v.condicion, v.palabras, 'Semilla: palabras clave de Memoria viva'
  from (values
    ('starlink',           'activo',   array['starlink']),
    ('grupo_electrogeno',  'definido', array['grupo electrogeno', 'generador']),
    ('sternthruster',      'activo',   array['sternthruster', 'stern thruster']),
    ('bow_thruster',       'activo',   array['bowthruster', 'bow thruster']),
    ('aire_acondicionado', 'activo',   array['aire acondicionado', 'fcf12', 'fcf16']),
    ('calefactor',         'activo',   array['calefactor', 'webasto', 'eberspacher']),
    ('fabricadora_hielo',  'activo',   array['fabricadora de hielo', 'maquina de hielo']),
    ('radar',              'activo',   array['radar']),
    ('plotter',            'activo',   array['plotter', 'gpsmap']),
    ('faro',               'activo',   array['faro']),
    ('flaps',              'activo',   array['flap', 'trim tab']),
    ('pluma',              'activo',   array['pluma', 'davit'])
  ) as v(campo_key, condicion, palabras)
 where not exists (
   select 1 from public.memoria_reglas r
    where r.campo_key = v.campo_key and r.material_id is null and r.nota = 'Semilla: palabras clave de Memoria viva'
 );

-- ─── 5. Vínculos confirmados ────────────────────────────────────────────────
create table if not exists public.memoria_vinculos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  campo_key text not null references public.memoria_campos(key) on update cascade,
  snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  origen text not null default 'manual' check (origen in ('manual', 'regla', 'sugerido')),
  confirmado boolean not null default true,
  -- "Esto no es de este campo": la sugerencia no vuelve a aparecer.
  descartado boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (obra_id, campo_key, snapshot_id)
);
create index if not exists memoria_vinculos_obra_idx on public.memoria_vinculos (obra_id, campo_key);

-- ─── 6. Trazabilidad ────────────────────────────────────────────────────────
create or replace view public.v_memoria_trazabilidad
with (security_invoker = true) as
with lineas as (
  select v.obra_id,
         v.campo_key,
         count(s.id) as renglones,
         count(*) filter (where s.estado = 'comprado') as comprados,
         count(*) filter (where s.estado in ('recibido', 'en_panol')) as en_panol,
         count(*) filter (where s.estado = 'egresado' or s.egreso_at is not null) as a_bordo,
         max(greatest(s.updated_at, s.recepcion_updated_at, s.egreso_at)) as ultimo_movimiento
    from public.memoria_vinculos v
    join public.panol_obra_materiales_snapshot s on s.id = v.snapshot_id
   where v.confirmado and not v.descartado
   group by v.obra_id, v.campo_key
)
select mv.obra_id,
       o.codigo as obra_codigo,
       mv.campo_key,
       c.label,
       c.seccion,
       c.zona,
       c.resuelve,
       mv.valor,
       mv.activo,
       mv.obs,
       mv.updated_at,
       coalesce(l.renglones, 0) as renglones,
       coalesce(l.comprados, 0) as comprados,
       coalesce(l.en_panol, 0) as en_panol,
       coalesce(l.a_bordo, 0) as a_bordo,
       case
         when coalesce(l.renglones, 0) = 0 then 'definido'
         when l.a_bordo > 0 then 'a_bordo'
         when l.en_panol > 0 then 'en_panol'
         when l.comprados > 0 then 'comprado'
         else 'planificado'
       end as etapa,
       l.ultimo_movimiento
  from public.memoria_valores mv
  join public.memoria_campos c on c.key = mv.campo_key
  join public.produccion_obras o on o.id = mv.obra_id
  left join lineas l on l.obra_id = mv.obra_id and l.campo_key = mv.campo_key
 where c.tipo <> 'toggle' or mv.activo;

-- ─── 7. Chequeo de reglas (sólo lectura) ────────────────────────────────────
-- Para cada regla con material_id que se cumple en la memoria del barco: si ese
-- material está en la obra o todavía falta. No crea nada.
create or replace function public.memoria_chequear_reglas(p_obra_id uuid)
returns table (campo_key text, material_id uuid, descripcion text, cantidad numeric, en_obra boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select r.campo_key,
         r.material_id,
         m.descripcion,
         r.cantidad,
         exists (
           select 1 from public.panol_obra_materiales_snapshot s
            where s.obra_id = p_obra_id and s.material_id = r.material_id
         ) as en_obra
    from public.memoria_reglas r
    join public.memoria_valores mv on mv.campo_key = r.campo_key and mv.obra_id = p_obra_id
    join public.produccion_obras o on o.id = p_obra_id
    join public.panol_materiales m on m.id = r.material_id
   where r.activo
     and r.material_id is not null
     and (r.linea is null or regexp_replace(coalesce(o.linea_nombre, ''), '^[Kk]', '') = r.linea)
     and case r.condicion
           when 'activo' then coalesce(mv.activo, false)
           when 'definido' then nullif(btrim(coalesce(mv.valor, '')), '') is not null or coalesce(mv.activo, false)
           when 'igual' then lower(btrim(coalesce(mv.valor, ''))) = lower(btrim(coalesce(r.valor, '')))
           when 'contiene' then position(lower(coalesce(r.valor, '')) in lower(coalesce(mv.valor, ''))) > 0
         end;
$$;

-- ─── Seguridad ──────────────────────────────────────────────────────────────
alter table public.memoria_campos enable row level security;
alter table public.memoria_valores enable row level security;
alter table public.memoria_historial enable row level security;
alter table public.memoria_reglas enable row level security;
alter table public.memoria_vinculos enable row level security;

drop policy if exists "memoria_campos lectura" on public.memoria_campos;
create policy "memoria_campos lectura" on public.memoria_campos
  for select to authenticated using (true);
drop policy if exists "memoria_campos edicion" on public.memoria_campos;
create policy "memoria_campos edicion" on public.memoria_campos
  for all to authenticated
  using (public.is_produccion_editor(auth.uid()))
  with check (public.is_produccion_editor(auth.uid()));

drop policy if exists "memoria_valores lectura" on public.memoria_valores;
create policy "memoria_valores lectura" on public.memoria_valores
  for select to authenticated using (true);
drop policy if exists "memoria_valores edicion" on public.memoria_valores;
create policy "memoria_valores edicion" on public.memoria_valores
  for all to authenticated
  using (public.is_produccion_editor(auth.uid()))
  with check (public.is_produccion_editor(auth.uid()));

drop policy if exists "memoria_historial lectura" on public.memoria_historial;
create policy "memoria_historial lectura" on public.memoria_historial
  for select to authenticated using (true);

drop policy if exists "memoria_reglas lectura" on public.memoria_reglas;
create policy "memoria_reglas lectura" on public.memoria_reglas
  for select to authenticated using (true);
drop policy if exists "memoria_reglas edicion" on public.memoria_reglas;
create policy "memoria_reglas edicion" on public.memoria_reglas
  for all to authenticated
  using (public.is_produccion_editor(auth.uid()))
  with check (public.is_produccion_editor(auth.uid()));

-- Vincular lo hacen producción (oficina, técnica) y pañol/compras.
drop policy if exists "memoria_vinculos lectura" on public.memoria_vinculos;
create policy "memoria_vinculos lectura" on public.memoria_vinculos
  for select to authenticated using (true);
drop policy if exists "memoria_vinculos edicion" on public.memoria_vinculos;
create policy "memoria_vinculos edicion" on public.memoria_vinculos
  for all to authenticated
  using (public.is_produccion_editor(auth.uid()) or public.is_panol_manager(auth.uid()))
  with check (public.is_produccion_editor(auth.uid()) or public.is_panol_manager(auth.uid()));

grant select on public.v_memoria_trazabilidad to authenticated;
grant execute on function public.memoria_chequear_reglas(uuid) to authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memoria_valores') then
    alter publication supabase_realtime add table public.memoria_valores;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memoria_vinculos') then
    alter publication supabase_realtime add table public.memoria_vinculos;
  end if;
end $$;
