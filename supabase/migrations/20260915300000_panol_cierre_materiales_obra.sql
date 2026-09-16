-- Cierre de materiales y sobrantes de obra.
--
-- Disparador: produccion_obras.estado = 'terminada'.
-- "Al agua" (botada) y "entregada" (calendario / postventa) NO cierran la obra.
--
-- Al terminar se abre una revisión pendiente. No mueve stock.
-- Solo una recepción física confirmada incrementa el disponible.
-- Liberar una reserva reusa panol_transferir_producto (destino null): el
-- material ya estaba en pañol, no se inventa un ingreso.
-- Dañado reusa panol_registrar_devolucion.
-- Recibir sobrante egresado reusa panol_ingresar_stock_general.

begin;

-- ── Tablas ───────────────────────────────────────────────────────────────────

create table if not exists public.panol_obra_cierres (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.produccion_obras(id) on delete cascade,
  ciclo integer not null default 1,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_revision', 'conciliada')),
  fecha_terminacion date,
  obra_estado_al_generar text,
  responsable_id uuid references public.profiles(id) on delete set null,
  items_pendientes integer not null default 0,
  items_total integer not null default 0,
  conciliada_at timestamptz,
  conciliada_por uuid references public.profiles(id) on delete set null,
  resumen jsonb,
  obra_reabierta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, ciclo)
);

comment on table public.panol_obra_cierres is
  'Revisión de materiales al terminar una obra. Independiente del estado del barco.';
comment on column public.panol_obra_cierres.ciclo is
  'Si la obra se reabre y vuelve a terminarse, se abre un ciclo nuevo. El historial se conserva.';
comment on column public.panol_obra_cierres.estado is
  'pendiente / en_revision / conciliada. No equivale a activa / terminada de la obra.';

create unique index if not exists panol_obra_cierres_abierto_uniq
  on public.panol_obra_cierres (obra_id)
  where estado in ('pendiente', 'en_revision');

create index if not exists panol_obra_cierres_estado_idx
  on public.panol_obra_cierres (estado, fecha_terminacion desc);

create index if not exists panol_obra_cierres_obra_idx
  on public.panol_obra_cierres (obra_id, ciclo desc);

create table if not exists public.panol_obra_cierre_items (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references public.panol_obra_cierres(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text not null,
  codigo text,
  unidad text,
  tipo_origen text not null
    check (tipo_origen in ('egresado', 'reservado')),
  clave_material text not null,
  cantidad_entregada numeric(14,3) not null default 0,
  cantidad_devuelta_previa numeric(14,3) not null default 0,
  cantidad_reservada numeric(14,3) not null default 0,
  cantidad_utilizada numeric(14,3) not null default 0,
  cantidad_sobrante_declarada numeric(14,3) not null default 0,
  cantidad_recibida numeric(14,3) not null default 0,
  cantidad_danada numeric(14,3) not null default 0,
  cantidad_aclaracion numeric(14,3) not null default 0,
  cantidad_pendiente numeric(14,3) not null default 0,
  saldo_conocido boolean not null default false,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'parcial', 'resuelto', 'excepcion')),
  observacion text,
  sede_sugerida text,
  egreso_snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.panol_obra_cierre_items is
  'Material a conciliar por obra. Entregado menos devuelto NO se interpreta como sobrante.';
comment on column public.panol_obra_cierre_items.tipo_origen is
  'egresado = salió del pañol hacia la obra. reservado = sigue en pañol asignado a la obra.';
comment on column public.panol_obra_cierre_items.cantidad_pendiente is
  'Pendiente de clasificar (sin declarar). Distinto de cantidad_sobrante_declarada, que es pendiente de devolución física.';
comment on column public.panol_obra_cierre_items.cantidad_sobrante_declarada is
  'Sobrante ya clasificado que todavía no volvió al pañol. No cierra el renglón hasta recibirlo o documentar excepción.';

create unique index if not exists panol_obra_cierre_items_clave
  on public.panol_obra_cierre_items (cierre_id, tipo_origen, clave_material);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'panol_obra_cierre_items_clave'
  ) then
    alter table public.panol_obra_cierre_items
      add constraint panol_obra_cierre_items_clave unique using index panol_obra_cierre_items_clave;
  end if;
end $$;

create index if not exists panol_obra_cierre_items_cierre_idx
  on public.panol_obra_cierre_items (cierre_id, estado);

create table if not exists public.panol_obra_cierre_resoluciones (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.panol_obra_cierre_items(id) on delete cascade,
  cierre_id uuid not null references public.panol_obra_cierres(id) on delete cascade,
  tipo text not null
    check (tipo in ('utilizado', 'sobrante_declarado', 'recibido_panol', 'danado', 'pendiente_aclaracion')),
  cantidad numeric(14,3) not null check (cantidad > 0),
  observacion text,
  excepcion boolean not null default false,
  usuario_id uuid references public.profiles(id) on delete set null,
  snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  devolucion_id uuid references public.panol_devoluciones(id) on delete set null,
  sede text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

comment on table public.panol_obra_cierre_resoluciones is
  'Auditoría de cada decisión sobre un material del cierre. No reescribe egresos históricos.';

create unique index if not exists panol_obra_cierre_resoluciones_idem
  on public.panol_obra_cierre_resoluciones (item_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists panol_obra_cierre_resoluciones_item_idx
  on public.panol_obra_cierre_resoluciones (item_id, created_at desc);

create table if not exists public.panol_obra_cierre_eventos (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references public.panol_obra_cierres(id) on delete cascade,
  tipo text not null,
  detalle jsonb,
  usuario_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists panol_obra_cierre_eventos_cierre_idx
  on public.panol_obra_cierre_eventos (cierre_id, created_at desc);

alter table public.panol_obra_cierres enable row level security;
alter table public.panol_obra_cierre_items enable row level security;
alter table public.panol_obra_cierre_resoluciones enable row level security;
alter table public.panol_obra_cierre_eventos enable row level security;

drop policy if exists "panol_obra_cierres lectura" on public.panol_obra_cierres;
create policy "panol_obra_cierres lectura"
  on public.panol_obra_cierres for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_cierre_items lectura" on public.panol_obra_cierre_items;
create policy "panol_obra_cierre_items lectura"
  on public.panol_obra_cierre_items for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_cierre_resoluciones lectura" on public.panol_obra_cierre_resoluciones;
create policy "panol_obra_cierre_resoluciones lectura"
  on public.panol_obra_cierre_resoluciones for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_cierre_eventos lectura" on public.panol_obra_cierre_eventos;
create policy "panol_obra_cierre_eventos lectura"
  on public.panol_obra_cierre_eventos for select to authenticated
  using (auth.uid() is not null);

revoke insert, update, delete on public.panol_obra_cierres from authenticated, anon;
revoke insert, update, delete on public.panol_obra_cierre_items from authenticated, anon;
revoke insert, update, delete on public.panol_obra_cierre_resoluciones from authenticated, anon;
revoke insert, update, delete on public.panol_obra_cierre_eventos from authenticated, anon;
grant select on public.panol_obra_cierres to authenticated;
grant select on public.panol_obra_cierre_items to authenticated;
grant select on public.panol_obra_cierre_resoluciones to authenticated;
grant select on public.panol_obra_cierre_eventos to authenticated;

drop trigger if exists trg_panol_obra_cierres_touch on public.panol_obra_cierres;
create trigger trg_panol_obra_cierres_touch
  before update on public.panol_obra_cierres
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_panol_obra_cierre_items_touch on public.panol_obra_cierre_items;
create trigger trg_panol_obra_cierre_items_touch
  before update on public.panol_obra_cierre_items
  for each row execute function public.touch_updated_at();

-- ── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.panol_cierre_puede_operar(p_uid uuid)
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

create or replace function public.panol_cierre_puede_excepcion(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_panol_manager(p_uid);
$$;

create or replace function public.panol_cierre_clave_material(p_material_id uuid, p_descripcion text)
returns text
language sql
immutable
as $$
  select coalesce(p_material_id::text, 'desc:' || lower(btrim(coalesce(p_descripcion, ''))));
$$;

create or replace function public.panol_cierre_snapshot_anulado(p_notas text, p_egreso_nota text, p_source text, p_stock_nota text)
returns boolean
language sql
immutable
as $$
  select concat_ws(' ', p_notas, p_egreso_nota, p_source, p_stock_nota) ilike '%[anulado]%';
$$;

create or replace function public.panol_cierre_registrar_evento(
  p_cierre_id uuid,
  p_tipo text,
  p_detalle jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.panol_obra_cierre_eventos (cierre_id, tipo, detalle, usuario_id)
  values (p_cierre_id, p_tipo, p_detalle, auth.uid());
end;
$$;

create or replace function public.panol_cierre_recalcular_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.panol_obra_cierre_items%rowtype;
  v_bruto numeric;
  v_pendiente numeric;
  v_por_devolver numeric;
  v_estado text;
  v_saldo boolean;
  v_clasificado numeric;
begin
  select * into v_item from public.panol_obra_cierre_items where id = p_item_id;
  if not found then return; end if;

  v_por_devolver := greatest(coalesce(v_item.cantidad_sobrante_declarada, 0), 0);

  if v_item.tipo_origen = 'reservado' then
    -- Liberar baja cantidad_reservada. La aclaración documenta sin liberar.
    v_bruto := greatest(coalesce(v_item.cantidad_reservada, 0), 0);
    v_pendiente := round(greatest(v_bruto - coalesce(v_item.cantidad_aclaracion, 0), 0)::numeric, 3);
    v_clasificado := coalesce(v_item.cantidad_recibida, 0) + coalesce(v_item.cantidad_aclaracion, 0);
  else
    v_bruto := greatest(
      coalesce(v_item.cantidad_entregada, 0) - coalesce(v_item.cantidad_devuelta_previa, 0),
      0
    );
    -- Sobrante declarado NO cierra el renglón: queda por devolver.
    v_pendiente := round(greatest(
      v_bruto
        - coalesce(v_item.cantidad_utilizada, 0)
        - coalesce(v_item.cantidad_recibida, 0)
        - coalesce(v_item.cantidad_danada, 0)
        - coalesce(v_item.cantidad_aclaracion, 0)
        - coalesce(v_item.cantidad_sobrante_declarada, 0),
      0
    )::numeric, 3);
    v_clasificado := coalesce(v_item.cantidad_utilizada, 0)
                  + coalesce(v_item.cantidad_recibida, 0)
                  + coalesce(v_item.cantidad_danada, 0)
                  + coalesce(v_item.cantidad_aclaracion, 0)
                  + coalesce(v_item.cantidad_sobrante_declarada, 0);
  end if;

  v_saldo := v_clasificado > 0.0001 or v_bruto <= 0.0001;

  if v_pendiente <= 0.0001 and v_por_devolver > 0.0001 then
    -- Clasificado, pero falta la recepción física del sobrante.
    v_estado := 'parcial';
  elsif v_pendiente <= 0.0001 and coalesce(v_item.cantidad_aclaracion, 0) > 0.0001 and v_bruto > 0.0001
     and coalesce(v_item.cantidad_utilizada, 0)
       + coalesce(v_item.cantidad_recibida, 0)
       + coalesce(v_item.cantidad_danada, 0)
       + coalesce(v_item.cantidad_sobrante_declarada, 0) <= 0.0001 then
    v_estado := 'excepcion';
  elsif v_pendiente <= 0.0001 and v_por_devolver <= 0.0001 then
    v_estado := 'resuelto';
  elsif v_clasificado > 0.0001 then
    v_estado := 'parcial';
  else
    v_estado := 'pendiente';
  end if;

  update public.panol_obra_cierre_items
     set cantidad_pendiente = v_pendiente,
         saldo_conocido = v_saldo,
         estado = v_estado
   where id = p_item_id;
end;
$$;

create or replace function public.panol_cierre_recalcular_cabecera(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.panol_obra_cierres c
     set items_total = coalesce(s.total, 0),
         items_pendientes = coalesce(s.pendientes, 0)
    from (
      select
        count(*)::int as total,
        count(*) filter (
          where estado in ('pendiente', 'parcial')
             or coalesce(cantidad_sobrante_declarada, 0) > 0.0001
             or coalesce(cantidad_pendiente, 0) > 0.0001
        )::int as pendientes
      from public.panol_obra_cierre_items
      where cierre_id = p_cierre_id
    ) s
   where c.id = p_cierre_id
     and c.estado <> 'conciliada';
end;
$$;

-- Arma o refresca los renglones a partir del ledger y las devoluciones
-- existentes. No toca cantidades de stock ni borra resoluciones ya cargadas.
create or replace function public.panol_cierre_refrescar_items(p_cierre_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cierre public.panol_obra_cierres%rowtype;
  v_obra uuid;
  v_uid uuid := auth.uid();
begin
  -- Cabecera primero (mismo orden que resolver/conciliar) para evitar deadlocks
  -- y para no refrescar una revisión que otra sesión acaba de conciliar.
  select * into v_cierre
    from public.panol_obra_cierres
   where id = p_cierre_id
   for update;
  if not found then
    raise exception 'No se encontró la revisión de materiales';
  end if;

  if v_cierre.estado = 'conciliada' then
    raise exception 'La revisión ya está conciliada y no se puede actualizar del ledger';
  end if;

  -- Migraciones / triggers pueden correr sin sesión; el cliente autenticado sí.
  if v_uid is not null and not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para actualizar la revisión de materiales';
  end if;

  v_obra := v_cierre.obra_id;

  -- Entregas físicas a la obra (egresos). Las transferencias de reserva no cuentan.
  -- Descuenta lo ya cerrado en ciclos anteriores para no reabrir devoluciones.
  insert into public.panol_obra_cierre_items (
    cierre_id, material_id, descripcion, codigo, unidad, tipo_origen, clave_material,
    cantidad_entregada, cantidad_devuelta_previa, sede_sugerida, egreso_snapshot_id
  )
  select
    p_cierre_id,
    g.material_id,
    g.descripcion,
    g.codigo,
    g.unidad,
    'egresado',
    g.clave,
    greatest(g.entregada - coalesce(prev.ya_cerrado, 0), 0),
    coalesce(d.devuelta, 0),
    g.sede,
    g.egreso_snapshot_id
  from (
    select
      public.panol_cierre_clave_material(
        s.material_id,
        coalesce(nullif(btrim(s.descripcion), ''), '(sin descripción)')
      ) as clave,
      (array_agg(s.material_id) filter (where s.material_id is not null))[1] as material_id,
      (array_agg(coalesce(nullif(btrim(s.descripcion), ''), '(sin descripción)')
        order by coalesce(s.egreso_at, s.created_at) desc))[1] as descripcion,
      (array_agg(nullif(btrim(s.codigo), '')) filter (where nullif(btrim(s.codigo), '') is not null))[1] as codigo,
      coalesce(
        (array_agg(nullif(btrim(s.unidad), '')) filter (where nullif(btrim(s.unidad), '') is not null))[1],
        'unidad'
      ) as unidad,
      round(sum(abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0)))::numeric, 3) as entregada,
      (array_agg(coalesce(s.stock_sede, e.sede))
        filter (where coalesce(s.stock_sede, e.sede) is not null))[1] as sede,
      (array_agg(s.id order by coalesce(s.egreso_at, s.created_at) desc))[1] as egreso_snapshot_id
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where (s.obra_id = v_obra or s.egreso_destino_obra_id = v_obra)
      and not public.panol_cierre_snapshot_anulado(s.notas, s.egreso_nota, s.source, s.stock_nota)
      and (
        coalesce(s.source, '') like 'egreso%'
        or (
          lower(coalesce(s.estado, '')) = 'egresado'
          and coalesce(s.source, '') not like 'egreso%'
          and coalesce(s.source, '') not like 'transferencia%'
        )
      )
    group by 1
  ) g
  left join (
    -- Devoluciones externas (no las abiertas por este circuito como "dañado").
    select
      public.panol_cierre_clave_material(d.material_id, d.descripcion) as clave,
      round(sum(d.cantidad)::numeric, 3) as devuelta
    from public.panol_devoluciones d
    where d.obra_id = v_obra
      and not exists (
        select 1
        from public.panol_obra_cierre_resoluciones r
        where r.devolucion_id = d.id
          and r.tipo = 'danado'
      )
    group by 1
  ) d on d.clave = g.clave
  left join (
    select
      i.clave_material as clave,
      round(sum(
        coalesce(i.cantidad_utilizada, 0)
        + coalesce(i.cantidad_recibida, 0)
        + coalesce(i.cantidad_danada, 0)
        + coalesce(i.cantidad_aclaracion, 0)
        + coalesce(i.cantidad_sobrante_declarada, 0)
      )::numeric, 3) as ya_cerrado
    from public.panol_obra_cierre_items i
    join public.panol_obra_cierres c on c.id = i.cierre_id
    where c.obra_id = v_obra
      and c.id is distinct from p_cierre_id
      and c.ciclo < v_cierre.ciclo
      and i.tipo_origen = 'egresado'
    group by i.clave_material
  ) prev on prev.clave = g.clave
  where greatest(g.entregada - coalesce(prev.ya_cerrado, 0), 0) > 0.0001
  on conflict (cierre_id, tipo_origen, clave_material) do update
    set material_id = coalesce(excluded.material_id, panol_obra_cierre_items.material_id),
        descripcion = excluded.descripcion,
        codigo = coalesce(excluded.codigo, panol_obra_cierre_items.codigo),
        unidad = coalesce(excluded.unidad, panol_obra_cierre_items.unidad),
        cantidad_entregada = excluded.cantidad_entregada,
        cantidad_devuelta_previa = excluded.cantidad_devuelta_previa,
        sede_sugerida = coalesce(excluded.sede_sugerida, panol_obra_cierre_items.sede_sugerida),
        egreso_snapshot_id = coalesce(excluded.egreso_snapshot_id, panol_obra_cierre_items.egreso_snapshot_id);

  -- Reservado: saldo que sigue en pañol con obra_id (el ledger ya refleja liberaciones).
  update public.panol_obra_cierre_items
     set cantidad_reservada = 0
   where cierre_id = p_cierre_id
     and tipo_origen = 'reservado';

  insert into public.panol_obra_cierre_items (
    cierre_id, material_id, descripcion, codigo, unidad, tipo_origen, clave_material,
    cantidad_reservada, sede_sugerida
  )
  select
    p_cierre_id,
    g.material_id,
    g.descripcion,
    g.codigo,
    g.unidad,
    'reservado',
    g.clave,
    g.reservada,
    g.sede
  from (
    select
      public.panol_cierre_clave_material(
        s.material_id,
        coalesce(nullif(btrim(s.descripcion), ''), '(sin descripción)')
      ) as clave,
      (array_agg(s.material_id) filter (where s.material_id is not null))[1] as material_id,
      (array_agg(coalesce(nullif(btrim(s.descripcion), ''), '(sin descripción)')
        order by s.created_at desc))[1] as descripcion,
      (array_agg(nullif(btrim(s.codigo), '')) filter (where nullif(btrim(s.codigo), '') is not null))[1] as codigo,
      coalesce(
        (array_agg(nullif(btrim(s.unidad), '')) filter (where nullif(btrim(s.unidad), '') is not null))[1],
        'unidad'
      ) as unidad,
      round(sum(public.panol_stock_movimiento_delta(
        s.source, s.estado, s.recepcion_estado, s.cantidad, s.cantidad_egresada
      ))::numeric, 3) as reservada,
      (array_agg(coalesce(s.stock_sede, e.sede))
        filter (where coalesce(s.stock_sede, e.sede) is not null))[1] as sede
    from public.panol_obra_materiales_snapshot s
    left join public.panol_envios e on e.id = s.panol_envio_id
    where s.obra_id = v_obra
      and not public.panol_cierre_snapshot_anulado(s.notas, s.egreso_nota, s.source, s.stock_nota)
    group by 1
  ) g
  where g.reservada > 0.0001
  on conflict (cierre_id, tipo_origen, clave_material) do update
    set material_id = coalesce(excluded.material_id, panol_obra_cierre_items.material_id),
        descripcion = excluded.descripcion,
        codigo = coalesce(excluded.codigo, panol_obra_cierre_items.codigo),
        unidad = coalesce(excluded.unidad, panol_obra_cierre_items.unidad),
        cantidad_reservada = excluded.cantidad_reservada,
        sede_sugerida = coalesce(excluded.sede_sugerida, panol_obra_cierre_items.sede_sugerida);

  perform public.panol_cierre_recalcular_item(i.id)
    from public.panol_obra_cierre_items i
   where i.cierre_id = p_cierre_id;

  perform public.panol_cierre_recalcular_cabecera(p_cierre_id);
end;
$$;

create or replace function public.panol_generar_cierre_obra(p_obra_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obra public.produccion_obras%rowtype;
  v_abierto uuid;
  v_cierre uuid;
  v_ciclo int;
  v_ultimo public.panol_obra_cierres%rowtype;
begin
  if p_obra_id is null then
    raise exception 'Falta la obra';
  end if;

  select * into v_obra from public.produccion_obras where id = p_obra_id;
  if not found then
    raise exception 'Obra inexistente';
  end if;

  select id into v_abierto
    from public.panol_obra_cierres
   where obra_id = p_obra_id
     and estado in ('pendiente', 'en_revision')
   order by ciclo desc
   limit 1;

  -- Reintento / guardar de nuevo el estado terminada: no duplicar.
  if v_abierto is not null then
    perform public.panol_cierre_refrescar_items(v_abierto);
    if v_obra.estado = 'terminada' then
      update public.panol_obra_cierres
         set fecha_terminacion = coalesce(fecha_terminacion, v_obra.fecha_fin_real, current_date),
             obra_estado_al_generar = v_obra.estado
       where id = v_abierto;
    end if;
    return v_abierto;
  end if;

  -- Solo se abre una revisión nueva cuando la obra está terminada.
  if v_obra.estado is distinct from 'terminada' then
    return null;
  end if;

  select * into v_ultimo
    from public.panol_obra_cierres
   where obra_id = p_obra_id
   order by ciclo desc
   limit 1;

  -- Si el último ciclo ya está conciliado y la obra NUNCA se reabrió después,
  -- sincronizar / re-terminar no debe abrir otro ciclo ni rehacer devoluciones.
  if v_ultimo.id is not null and v_ultimo.estado = 'conciliada' then
    if v_ultimo.obra_reabierta_at is null
       or v_ultimo.obra_reabierta_at <= coalesce(v_ultimo.conciliada_at, v_ultimo.created_at) then
      return v_ultimo.id;
    end if;
  end if;

  select coalesce(max(ciclo), 0) + 1 into v_ciclo
    from public.panol_obra_cierres
   where obra_id = p_obra_id;

  insert into public.panol_obra_cierres (
    obra_id, ciclo, estado, fecha_terminacion, obra_estado_al_generar
  ) values (
    p_obra_id, v_ciclo, 'pendiente',
    coalesce(v_obra.fecha_fin_real, current_date),
    v_obra.estado
  )
  returning id into v_cierre;

  perform public.panol_cierre_refrescar_items(v_cierre);
  perform public.panol_cierre_registrar_evento(
    v_cierre,
    'generado',
    jsonb_build_object('obra_id', p_obra_id, 'ciclo', v_ciclo)
  );
  return v_cierre;
exception
  when unique_violation then
    -- Carrera: otro proceso acaba de crear el abierto.
    select id into v_abierto
      from public.panol_obra_cierres
     where obra_id = p_obra_id
       and estado in ('pendiente', 'en_revision')
     limit 1;
    if v_abierto is not null then
      perform public.panol_cierre_refrescar_items(v_abierto);
      return v_abierto;
    end if;
    raise;
end;
$$;

comment on function public.panol_generar_cierre_obra(uuid) is
  'Abre o reutiliza la revisión de materiales de una obra terminada. Idempotente. No mueve stock.';

create or replace function public.panol_cierre_asignar_responsable(
  p_cierre_id uuid,
  p_responsable_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre public.panol_obra_cierres%rowtype;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para asignar responsable';
  end if;
  select * into v_cierre from public.panol_obra_cierres where id = p_cierre_id;
  if not found then raise exception 'No se encontró la revisión'; end if;
  if v_cierre.estado = 'conciliada' then
    raise exception 'La revisión ya está conciliada';
  end if;
  update public.panol_obra_cierres
     set responsable_id = p_responsable_id,
         estado = case when estado = 'pendiente' and p_responsable_id is not null then 'en_revision' else estado end
   where id = p_cierre_id;
  perform public.panol_cierre_registrar_evento(
    p_cierre_id, 'responsable',
    jsonb_build_object('responsable_id', p_responsable_id)
  );
end;
$$;

create or replace function public.panol_cierre_resolver(
  p_item_id uuid,
  p_utilizado numeric default 0,
  p_sobrante_declarado numeric default 0,
  p_recibido numeric default 0,
  p_danado numeric default 0,
  p_aclaracion numeric default 0,
  p_observacion text default null,
  p_sede text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.panol_obra_cierre_items%rowtype;
  v_cierre public.panol_obra_cierres%rowtype;
  v_obra public.produccion_obras%rowtype;
  v_utilizado numeric := round(greatest(coalesce(p_utilizado, 0), 0)::numeric, 3);
  v_sobrante numeric := round(greatest(coalesce(p_sobrante_declarado, 0), 0)::numeric, 3);
  v_recibido numeric := round(greatest(coalesce(p_recibido, 0), 0)::numeric, 3);
  v_danado numeric := round(greatest(coalesce(p_danado, 0), 0)::numeric, 3);
  v_aclaracion numeric := round(greatest(coalesce(p_aclaracion, 0), 0)::numeric, 3);
  v_total numeric;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_sede text := nullif(btrim(coalesce(p_sede, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cierre_id uuid;
  v_existente uuid;
  v_prev_utilizado numeric := 0;
  v_prev_sobrante numeric := 0;
  v_prev_recibido numeric := 0;
  v_prev_danado numeric := 0;
  v_prev_aclaracion numeric := 0;
  v_prev_sede text;
  v_prev_obs text;
  v_sede_eff text;
  v_snap uuid;
  v_dev uuid;
  v_nota text;
  v_mismo boolean;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para revisar materiales de obra';
  end if;

  v_total := v_utilizado + v_sobrante + v_recibido + v_danado + v_aclaracion;
  if v_total <= 0.0001 then
    raise exception 'Indicá al menos una cantidad para resolver';
  end if;

  -- Orden de bloqueo fijo: cabecera → ítem (igual que conciliar/refrescar).
  select cierre_id into v_cierre_id
    from public.panol_obra_cierre_items
   where id = p_item_id;
  if v_cierre_id is null then
    raise exception 'No se encontró el material a revisar';
  end if;

  select * into v_cierre
    from public.panol_obra_cierres
   where id = v_cierre_id
   for update;
  if not found then raise exception 'No se encontró la revisión'; end if;
  if v_cierre.estado = 'conciliada' then
    raise exception 'La revisión ya está conciliada';
  end if;

  select * into v_item
    from public.panol_obra_cierre_items
   where id = p_item_id
   for update;
  if not found then raise exception 'No se encontró el material a revisar'; end if;

  v_sede_eff := coalesce(v_sede, nullif(btrim(coalesce(v_item.sede_sugerida, '')), ''));

  -- Idempotencia: misma clave + mismo contenido → éxito sin repetir.
  -- Misma clave + contenido distinto → rechazo (no silenciar el cambio).
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_item_id::text || '|' || v_key, 0));
    select id into v_existente
      from public.panol_obra_cierre_resoluciones
     where item_id = p_item_id
       and (
         idempotency_key = v_key
         or idempotency_key like v_key || ':%'
       )
     order by created_at
     limit 1;
    if v_existente is not null then
      select
        coalesce(sum(cantidad) filter (where tipo = 'utilizado'), 0),
        coalesce(sum(cantidad) filter (where tipo = 'sobrante_declarado'), 0),
        coalesce(sum(cantidad) filter (where tipo = 'recibido_panol'), 0),
        coalesce(sum(cantidad) filter (where tipo = 'danado'), 0),
        coalesce(sum(cantidad) filter (where tipo = 'pendiente_aclaracion'), 0),
        (array_agg(sede) filter (where tipo = 'recibido_panol' and sede is not null))[1],
        (array_agg(observacion) filter (where observacion is not null))[1]
      into
        v_prev_utilizado, v_prev_sobrante, v_prev_recibido, v_prev_danado, v_prev_aclaracion,
        v_prev_sede, v_prev_obs
      from public.panol_obra_cierre_resoluciones
      where item_id = p_item_id
        and (
          idempotency_key = v_key
          or idempotency_key like v_key || ':%'
        );

      v_mismo :=
        abs(v_prev_utilizado - v_utilizado) <= 0.0001
        and abs(v_prev_sobrante - v_sobrante) <= 0.0001
        and abs(v_prev_recibido - v_recibido) <= 0.0001
        and abs(v_prev_danado - v_danado) <= 0.0001
        and abs(v_prev_aclaracion - v_aclaracion) <= 0.0001
        and (
          v_recibido <= 0.0001
          or coalesce(v_prev_sede, '') = coalesce(v_sede_eff, '')
        )
        and coalesce(v_prev_obs, '') = coalesce(v_obs, '');

      if v_mismo then
        return p_item_id;
      end if;

      raise exception
        'Este reintento ya registró otra operación (utilizado %, sobrante %, recibido %, dañado %, aclaración %). Actualizá la pantalla y cargá de nuevo si hace falta.',
        trim(to_char(v_prev_utilizado, 'FM999999990.999')),
        trim(to_char(v_prev_sobrante, 'FM999999990.999')),
        trim(to_char(v_prev_recibido, 'FM999999990.999')),
        trim(to_char(v_prev_danado, 'FM999999990.999')),
        trim(to_char(v_prev_aclaracion, 'FM999999990.999'));
    end if;
  end if;

  perform public.panol_cierre_refrescar_items(v_cierre.id);
  select * into v_item from public.panol_obra_cierre_items where id = p_item_id for update;
  if not found then raise exception 'No se encontró el material a revisar'; end if;

  if v_item.tipo_origen = 'reservado' then
    if v_utilizado > 0.0001 then
      raise exception 'El material reservado sigue en pañol. Liberarlo a stock o documentar una aclaración; no se puede marcar como instalado sin egreso.';
    end if;
    if v_sobrante > 0.0001 then
      raise exception 'El material reservado ya está en pañol. Liberarlo al stock, no declararlo como sobrante a devolver.';
    end if;
    if v_danado > 0.0001 then
      raise exception 'El material reservado sigue en pañol. Si está dañado, egresalo o registrá la devolución desde el movimiento de salida.';
    end if;
  end if;

  -- Clasificar consume solo lo pendiente de clasificar.
  -- Recibir puede consumir sobrante declarado + lo que aún no se clasificó.
  if (v_utilizado + v_sobrante + v_danado + v_aclaracion)
       > coalesce(v_item.cantidad_pendiente, 0) + 0.0001 then
    raise exception 'La cantidad a clasificar supera lo pendiente (% %)',
      trim(to_char(v_item.cantidad_pendiente, 'FM999999990.999')),
      coalesce(v_item.unidad, '');
  end if;

  if v_recibido > (
       coalesce(v_item.cantidad_sobrante_declarada, 0)
       + coalesce(v_item.cantidad_pendiente, 0)
       - v_utilizado - v_sobrante - v_danado - v_aclaracion
     ) + 0.0001 then
    raise exception 'La cantidad a recibir supera lo pendiente de clasificar más el sobrante por devolver (% %)',
      trim(to_char(
        coalesce(v_item.cantidad_sobrante_declarada, 0) + coalesce(v_item.cantidad_pendiente, 0),
        'FM999999990.999'
      )),
      coalesce(v_item.unidad, '');
  end if;

  if v_recibido > 0.0001 and v_item.material_id is null then
    raise exception 'Este renglón no tiene producto de catálogo. Asigná el producto concreto antes de recibirlo o liberarlo.';
  end if;

  if v_recibido > 0.0001 then
    v_sede := v_sede_eff;
    if v_sede is null then
      raise exception 'Elegí la sede para registrar la recepción';
    end if;
  end if;

  if v_aclaracion > 0.0001 and v_obs is null then
    raise exception 'La aclaración necesita una observación';
  end if;

  if v_aclaracion > 0.0001 and not public.panol_cierre_puede_excepcion(v_uid) then
    -- Pañol puede dejarla pendiente de aclaración; la conciliación con excepción
    -- la cierra un autorizado.
    null;
  end if;

  select * into v_obra from public.produccion_obras where id = v_cierre.obra_id;
  v_nota := concat_ws(' · ',
    format('Cierre %s', coalesce(v_obra.codigo, 'obra')),
    v_obs
  );

  if v_utilizado > 0.0001 then
    insert into public.panol_obra_cierre_resoluciones (
      item_id, cierre_id, tipo, cantidad, observacion, usuario_id, idempotency_key
    ) values (
      p_item_id, v_cierre.id, 'utilizado', v_utilizado, v_obs, v_uid,
      case when v_key is null then null else v_key || ':utilizado' end
    );
  end if;

  if v_sobrante > 0.0001 then
    insert into public.panol_obra_cierre_resoluciones (
      item_id, cierre_id, tipo, cantidad, observacion, usuario_id, idempotency_key
    ) values (
      p_item_id, v_cierre.id, 'sobrante_declarado', v_sobrante, v_obs, v_uid,
      case when v_key is null then null else v_key || ':sobrante' end
    );
  end if;

  if v_recibido > 0.0001 then
    if v_item.tipo_origen = 'reservado' then
      -- Ya está en pañol: liberar la reserva. No crear ingreso ficticio.
      perform public.panol_transferir_producto(
        p_material_id := v_item.material_id,
        p_descripcion := v_item.descripcion,
        p_codigo := v_item.codigo,
        p_cantidad := v_recibido,
        p_unidad := coalesce(v_item.unidad, 'unidad'),
        p_sede := v_sede,
        p_obra_origen_id := v_cierre.obra_id,
        p_obra_destino_id := null,
        p_nota := v_nota,
        p_retirado_por := null,
        p_es_adicional := false
      );
    else
      v_snap := public.panol_ingresar_stock_general(
        p_material_id := v_item.material_id,
        p_descripcion := v_item.descripcion,
        p_codigo := v_item.codigo,
        p_cantidad := v_recibido,
        p_unidad := coalesce(v_item.unidad, 'unidad'),
        p_sede := v_sede,
        p_nota := v_nota,
        p_es_adicional := false
      );
    end if;

    insert into public.panol_obra_cierre_resoluciones (
      item_id, cierre_id, tipo, cantidad, observacion, usuario_id, snapshot_id, sede, idempotency_key
    ) values (
      p_item_id, v_cierre.id, 'recibido_panol', v_recibido, v_obs, v_uid, v_snap, v_sede,
      case when v_key is null then null else v_key || ':recibido' end
    );
  end if;

  if v_danado > 0.0001 then
    if v_item.tipo_origen = 'egresado' and v_item.egreso_snapshot_id is not null then
      v_dev := public.panol_registrar_devolucion(
        p_snapshot_id := v_item.egreso_snapshot_id,
        p_cantidad := v_danado,
        p_motivo := 'roto',
        p_detalle := coalesce(v_obs, 'Cierre de obra: dañado o no reutilizable'),
        p_necesita := 'devuelto',
        p_responsable := 'sin_definir'
      );
    elsif v_item.tipo_origen = 'reservado' then
      raise exception 'El material reservado sigue en pañol. Si está dañado, egresalo o registrá la devolución desde el movimiento de salida.';
    else
      raise exception 'No hay un egreso de origen para abrir la devolución. Registrala desde el kardex de esa salida.';
    end if;

    insert into public.panol_obra_cierre_resoluciones (
      item_id, cierre_id, tipo, cantidad, observacion, usuario_id, devolucion_id, idempotency_key
    ) values (
      p_item_id, v_cierre.id, 'danado', v_danado, v_obs, v_uid, v_dev,
      case when v_key is null then null else v_key || ':danado' end
    );
  end if;

  if v_aclaracion > 0.0001 then
    insert into public.panol_obra_cierre_resoluciones (
      item_id, cierre_id, tipo, cantidad, observacion, excepcion, usuario_id, idempotency_key
    ) values (
      p_item_id, v_cierre.id, 'pendiente_aclaracion', v_aclaracion, v_obs, true, v_uid,
      case when v_key is null then null else v_key || ':aclaracion' end
    );
  end if;

  update public.panol_obra_cierre_items
     set cantidad_utilizada = cantidad_utilizada + v_utilizado,
         -- La recepción solo baja el sobrante YA declarado antes de este llamado.
         -- El sobrante nuevo de esta misma operación queda por devolver.
         cantidad_sobrante_declarada = case
           when tipo_origen = 'egresado' then
             greatest(
               cantidad_sobrante_declarada
                 + v_sobrante
                 - least(v_recibido, cantidad_sobrante_declarada),
               0
             )
           else cantidad_sobrante_declarada + v_sobrante
         end,
         cantidad_recibida = cantidad_recibida + v_recibido,
         cantidad_danada = cantidad_danada + v_danado,
         cantidad_aclaracion = cantidad_aclaracion + v_aclaracion,
         cantidad_reservada = case
           when tipo_origen = 'reservado' then greatest(cantidad_reservada - v_recibido, 0)
           else cantidad_reservada
         end,
         observacion = coalesce(v_obs, observacion)
   where id = p_item_id;

  perform public.panol_cierre_recalcular_item(p_item_id);

  update public.panol_obra_cierres
     set estado = case when estado = 'pendiente' then 'en_revision' else estado end,
         responsable_id = coalesce(responsable_id, v_uid)
   where id = v_cierre.id;

  perform public.panol_cierre_recalcular_cabecera(v_cierre.id);
  perform public.panol_cierre_registrar_evento(
    v_cierre.id,
    'resolucion',
    jsonb_build_object(
      'item_id', p_item_id,
      'utilizado', v_utilizado,
      'sobrante', v_sobrante,
      'recibido', v_recibido,
      'danado', v_danado,
      'aclaracion', v_aclaracion
    )
  );

  return p_item_id;
end;
$$;

comment on function public.panol_cierre_resolver(uuid, numeric, numeric, numeric, numeric, numeric, text, text, text) is
  'Aplica una resolución (o varias cantidades a la vez). Solo recibido_panol mueve stock, reusando las RPCs existentes.';

create or replace function public.panol_cierre_conciliar(p_cierre_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cierre public.panol_obra_cierres%rowtype;
  v_abiertos int;
  v_excepciones int;
  v_resumen jsonb;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.panol_cierre_puede_operar(v_uid) then
    raise exception 'Sin permiso para conciliar';
  end if;

  select * into v_cierre from public.panol_obra_cierres where id = p_cierre_id for update;
  if not found then raise exception 'No se encontró la revisión'; end if;
  if v_cierre.estado = 'conciliada' then
    return v_cierre.resumen;
  end if;

  perform public.panol_cierre_refrescar_items(p_cierre_id);

  select
    count(*) filter (
      where estado in ('pendiente', 'parcial')
         or coalesce(cantidad_pendiente, 0) > 0.0001
         or coalesce(cantidad_sobrante_declarada, 0) > 0.0001
    ),
    count(*) filter (where estado = 'excepcion' or cantidad_aclaracion > 0.0001)
  into v_abiertos, v_excepciones
  from public.panol_obra_cierre_items
  where cierre_id = p_cierre_id;

  if v_abiertos > 0 then
    raise exception 'Todavía hay % material(es) sin resolver o con sobrante por recibir. Completá la recepción o documentá una excepción.', v_abiertos;
  end if;

  if v_excepciones > 0 and not public.panol_cierre_puede_excepcion(v_uid) then
    raise exception 'Hay excepciones documentadas. La conciliación la cierra un autorizado (técnica, admin o compras).';
  end if;

  select jsonb_build_object(
    'utilizados', coalesce(sum(cantidad_utilizada), 0),
    'devueltos', coalesce(sum(cantidad_recibida), 0),
    'danados', coalesce(sum(cantidad_danada), 0),
    'sobrantes_declarados', coalesce(sum(cantidad_sobrante_declarada), 0),
    'excepciones', coalesce(sum(cantidad_aclaracion), 0),
    'items', count(*)
  )
  into v_resumen
  from public.panol_obra_cierre_items
  where cierre_id = p_cierre_id;

  update public.panol_obra_cierres
     set estado = 'conciliada',
         conciliada_at = now(),
         conciliada_por = v_uid,
         resumen = v_resumen,
         items_pendientes = 0
   where id = p_cierre_id;

  perform public.panol_cierre_registrar_evento(p_cierre_id, 'conciliada', v_resumen);
  return v_resumen;
end;
$$;

comment on function public.panol_cierre_conciliar(uuid) is
  'Cierra la revisión de materiales. No cambia el estado de la obra.';

create or replace function public.panol_cierre_contar_pendientes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.panol_obra_cierres
  where estado in ('pendiente', 'en_revision');
$$;

create or replace function public.panol_cierre_sincronizar_terminadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  r record;
begin
  for r in
    select id from public.produccion_obras where estado = 'terminada'
  loop
    if public.panol_generar_cierre_obra(r.id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ── Trigger sobre el estado real de la obra ──────────────────────────────────

create or replace function public.panol_obra_cierre_on_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado = 'terminada' then
      perform public.panol_generar_cierre_obra(new.id);
    end if;
    return new;
  end if;

  if new.estado = 'terminada' then
    perform public.panol_generar_cierre_obra(new.id);
  elsif old.estado = 'terminada' and new.estado is distinct from 'terminada' then
    -- Marca también cierres conciliados: sin esto, sincronizar reabriría un ciclo
    -- nuevo aunque la obra nunca se haya reabierto después de conciliar.
    update public.panol_obra_cierres
       set obra_reabierta_at = now()
     where obra_id = new.id
       and (
         estado in ('pendiente', 'en_revision')
         or (
           estado = 'conciliada'
           and (
             obra_reabierta_at is null
             or obra_reabierta_at <= coalesce(conciliada_at, created_at)
           )
         )
       );
    perform public.panol_cierre_registrar_evento(c.id, 'obra_reabierta', jsonb_build_object('estado', new.estado))
      from public.panol_obra_cierres c
     where c.obra_id = new.id
       and c.obra_reabierta_at is not null
       and c.obra_reabierta_at > now() - interval '1 second';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_obra_cierre_estado on public.produccion_obras;
create trigger trg_panol_obra_cierre_estado
  after insert or update of estado on public.produccion_obras
  for each row
  execute function public.panol_obra_cierre_on_estado();

revoke all on function public.panol_cierre_puede_operar(uuid) from public;
revoke all on function public.panol_cierre_puede_excepcion(uuid) from public;
revoke all on function public.panol_cierre_clave_material(uuid, text) from public;
revoke all on function public.panol_cierre_snapshot_anulado(text, text, text, text) from public;
revoke all on function public.panol_cierre_registrar_evento(uuid, text, jsonb) from public;
revoke all on function public.panol_cierre_recalcular_item(uuid) from public;
revoke all on function public.panol_cierre_recalcular_cabecera(uuid) from public;
revoke all on function public.panol_cierre_refrescar_items(uuid) from public;
revoke all on function public.panol_generar_cierre_obra(uuid) from public;
revoke all on function public.panol_cierre_asignar_responsable(uuid, uuid) from public;
revoke all on function public.panol_cierre_resolver(uuid, numeric, numeric, numeric, numeric, numeric, text, text, text) from public;
revoke all on function public.panol_cierre_conciliar(uuid) from public;
revoke all on function public.panol_cierre_contar_pendientes() from public;
revoke all on function public.panol_cierre_sincronizar_terminadas() from public;

grant execute on function public.panol_cierre_puede_operar(uuid) to authenticated;
grant execute on function public.panol_cierre_puede_excepcion(uuid) to authenticated;
grant execute on function public.panol_generar_cierre_obra(uuid) to authenticated;
grant execute on function public.panol_cierre_asignar_responsable(uuid, uuid) to authenticated;
grant execute on function public.panol_cierre_resolver(uuid, numeric, numeric, numeric, numeric, numeric, text, text, text) to authenticated;
grant execute on function public.panol_cierre_conciliar(uuid) to authenticated;
grant execute on function public.panol_cierre_contar_pendientes() to authenticated;
grant execute on function public.panol_cierre_sincronizar_terminadas() to authenticated;
grant execute on function public.panol_cierre_refrescar_items(uuid) to authenticated;

-- Obras ya terminadas: se abre la revisión sin tocar stock.
-- Si no hay materiales, la revisión queda en 0 pendientes y se puede conciliar.
do $$
begin
  perform public.panol_cierre_sincronizar_terminadas();
end $$;

commit;
