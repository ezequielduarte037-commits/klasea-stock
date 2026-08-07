-- Devoluciones de pañol: material que salió, se probó y volvió fallado.
--
-- El circuito real:
--   pañol entrega → el operario prueba → "está fallado" → vuelve al pañol
--   → COMPRAS decide → sale a reparar o se reclama la reposición → vuelve
--
-- Tres decisiones que definen el modelo:
--
-- 1. La devolución NACE DE UN EGRESO. El egreso ya sabe quién se lo llevó,
--    cuándo y para qué obra: todo eso viaja solo. Por eso se apunta al renglón
--    del snapshot que registró la salida y no a la compra que lo trajo.
--
-- 2. El material devuelto NO VUELVE A STOCK. Queda apartado y marcado. Si
--    volviera al stock disponible alguien lo va a ir a buscar y se lo va a
--    llevar roto. Recién vuelve cuando se repara o se repone.
--
-- 3. La obra QUEDA CON LA CANTIDAD EN RECLAMO. Si el operario se llevó 10 y
--    devolvió 2, la obra consumió 8 pero necesita 10: esas 2 siguen siendo una
--    necesidad abierta, no un consumo cerrado.

-- ── Estados ───────────────────────────────────────────────────────────────
-- Abiertos (viven en el panel):
--   devuelto               volvió al pañol, esperando que compras decida
--   en_reparacion          salió al taller
--   esperando_reposicion   se reclamó al proveedor
-- Cierres:
--   reparado / repuesto    volvió sano → vuelve a stock
--   nota_credito           no vuelve el material, vuelve la plata
--   rechazado              el proveedor no se hizo cargo
--   descartado             pérdida asumida
create table if not exists public.panol_devoluciones (
  id uuid primary key default gen_random_uuid(),

  material_id uuid references public.panol_materiales(id) on delete set null,
  -- Se guarda la descripción por si el material se borra del catálogo: una
  -- devolución vieja tiene que seguir siendo legible.
  descripcion text not null,
  cantidad numeric(14,3) not null check (cantidad > 0),
  unidad text,

  -- De dónde salió. snapshot_id es el renglón del egreso que la originó.
  snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  obra_id uuid references public.produccion_obras(id) on delete set null,
  empleado_id uuid references public.rrhh_empleados(id) on delete set null,
  retirado_por text,

  motivo text not null default 'defectuoso'
    check (motivo in ('defectuoso', 'roto', 'no_corresponde', 'sobrante', 'otro')),
  detalle text,

  estado text not null default 'devuelto'
    check (estado in (
      'devuelto', 'en_reparacion', 'esperando_reposicion',
      'reparado', 'repuesto', 'nota_credito', 'rechazado', 'descartado'
    )),

  -- A dónde fue cuando compras decidió.
  proveedor_id uuid references public.panol_proveedores(id) on delete set null,
  destino text,

  -- Hitos. Sirven para el reloj del panel: una devolución que lleva 60 dias
  -- sin resolverse tiene que gritar, igual que una pieza afuera en torneria.
  devuelto_at timestamptz not null default now(),
  decidido_at timestamptz,
  salida_at timestamptz,
  cerrado_at timestamptz,

  registrado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  decidido_por uuid references public.profiles(id) on delete set null,
  aviso_id uuid references public.compras_avisos(id) on delete set null,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.panol_devoluciones is
  'Material que salio del panol, se probo y volvio fallado. Queda apartado (no es stock) hasta que se repara o se repone.';
comment on column public.panol_devoluciones.snapshot_id is
  'Renglon del egreso que origino la devolucion. De ahi salen obra, quien retiro y la fecha.';
comment on column public.panol_devoluciones.aviso_id is
  'Aviso creado en la bandeja de Compras. La decision reparacion/reposicion pasa por ellos.';

create index if not exists idx_panol_devoluciones_abiertas
  on public.panol_devoluciones (estado, devuelto_at desc)
  where estado in ('devuelto', 'en_reparacion', 'esperando_reposicion');

create index if not exists idx_panol_devoluciones_material
  on public.panol_devoluciones (material_id)
  where material_id is not null;

create index if not exists idx_panol_devoluciones_obra
  on public.panol_devoluciones (obra_id)
  where obra_id is not null;

alter table public.panol_devoluciones enable row level security;

drop policy if exists "panol_devoluciones lectura" on public.panol_devoluciones;
create policy "panol_devoluciones lectura"
  on public.panol_devoluciones for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_devoluciones escritura" on public.panol_devoluciones;
create policy "panol_devoluciones escritura"
  on public.panol_devoluciones for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

drop trigger if exists trg_panol_devoluciones_touch on public.panol_devoluciones;
create trigger trg_panol_devoluciones_touch
  before update on public.panol_devoluciones
  for each row execute function public.touch_updated_at();

-- ── La obra queda con la cantidad en reclamo ──────────────────────────────
-- Un egreso de 10 con 2 devueltas no es un consumo de 10: son 8 consumidas y 2
-- que la obra sigue necesitando. Sin esto la lista de la obra da por cubierto
-- algo que no llego.
alter table public.panol_obra_materiales_snapshot
  add column if not exists cantidad_en_reclamo numeric(14,3) not null default 0;

comment on column public.panol_obra_materiales_snapshot.cantidad_en_reclamo is
  'Unidades entregadas que volvieron falladas y siguen sin reponerse. La necesidad de la obra sigue abierta por esa cantidad.';

-- ── Registrar la devolución ───────────────────────────────────────────────
-- Todo junto: crea la devolucion, marca el reclamo en la obra y deja el aviso
-- en la bandeja de Compras. En una sola transaccion para que no quede la
-- devolucion sin aviso (o al reves) si algo falla.
-- p_necesita: que hace falta, segun quien la recibe. El panolero sabe si tiene
-- arreglo o si hay que reclamar el reemplazo, asi que lo dice al registrarla y
-- la devolucion arranca en el estado correcto. Compras igual recibe el aviso y
-- es quien gestiona; si no esta claro, queda en 'devuelto' para que decidan.
create or replace function public.panol_registrar_devolucion(
  p_snapshot_id uuid,
  p_cantidad numeric,
  p_motivo text default 'defectuoso',
  p_detalle text default null,
  p_necesita text default 'devuelto'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_snap public.panol_obra_materiales_snapshot%rowtype;
  v_obra_codigo text;
  v_aviso uuid;
  v_devolucion uuid;
  v_estado text;
  v_que_hacer text;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad devuelta tiene que ser mayor a cero';
  end if;

  v_estado := case p_necesita
    when 'en_reparacion' then 'en_reparacion'
    when 'esperando_reposicion' then 'esperando_reposicion'
    else 'devuelto'
  end;
  v_que_hacer := case v_estado
    when 'en_reparacion' then 'Hay que mandarlo a reparar.'
    when 'esperando_reposicion' then 'Hay que reclamar la reposición al proveedor.'
    else 'Definir si se manda a reparar o se reclama la reposición.'
  end;

  select * into v_snap
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id;
  if not found then
    raise exception 'No se encontro el egreso de origen';
  end if;

  select codigo into v_obra_codigo
    from public.produccion_obras where id = v_snap.obra_id;

  -- La necesidad de la obra vuelve a abrirse por lo devuelto.
  update public.panol_obra_materiales_snapshot
     set cantidad_en_reclamo = coalesce(cantidad_en_reclamo, 0) + p_cantidad,
         updated_at = now()
   where id = p_snapshot_id;

  -- Compras decide que se hace. Por eso el aviso se crea siempre, no solo
  -- cuando alguien se acuerda de avisar.
  insert into public.compras_avisos (
    titulo, detalle, material, project_id, destino, prioridad, origen, source_ref, created_by
  ) values (
    format('Devolución: %s', v_snap.descripcion),
    format(
      '%s unidades volvieron del pañol como %s.%s %s',
      trim(to_char(p_cantidad, 'FM999999990.999')),
      coalesce(p_motivo, 'defectuoso'),
      case when p_detalle is null or btrim(p_detalle) = '' then '' else ' ' || p_detalle || '.' end,
      v_que_hacer
    ),
    v_snap.descripcion,
    v_snap.obra_id,
    case when v_obra_codigo is null then null else 'Obra ' || v_obra_codigo end,
    'alta',
    'panol_devolucion',
    p_snapshot_id::text,
    v_uid
  )
  returning id into v_aviso;

  insert into public.panol_devoluciones (
    material_id, descripcion, cantidad, unidad,
    snapshot_id, obra_id, retirado_por,
    motivo, detalle, estado, registrado_por, aviso_id, salida_at
  ) values (
    v_snap.material_id, v_snap.descripcion, p_cantidad, v_snap.unidad,
    p_snapshot_id, v_snap.obra_id, v_snap.retirado_por,
    coalesce(p_motivo, 'defectuoso'), p_detalle, v_estado, v_uid, v_aviso,
    -- El reloj de "afuera" arranca sólo si ya se sabe a dónde va.
    case when v_estado <> 'devuelto' then now() end
  )
  returning id into v_devolucion;

  return v_devolucion;
end;
$$;

comment on function public.panol_registrar_devolucion(uuid, numeric, text, text, text) is
  'Registra que un material entregado volvio fallado: abre la devolucion en el estado que corresponda, deja la cantidad en reclamo en la obra y avisa a Compras.';

grant execute on function public.panol_registrar_devolucion(uuid, numeric, text, text, text) to authenticated;

-- ── Resolver ──────────────────────────────────────────────────────────────
-- Un solo camino para mover el estado. Los cierres que devuelven material sano
-- bajan el reclamo de la obra; los que no (nota de credito, rechazo, descarte)
-- lo dejan abierto, porque la obra sigue necesitando eso.
create or replace function public.panol_resolver_devolucion(
  p_devolucion_id uuid,
  p_estado text,
  p_proveedor_id uuid default null,
  p_destino text default null,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dev public.panol_devoluciones%rowtype;
  v_cierra boolean;
  v_recupera boolean;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  select * into v_dev from public.panol_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'Devolucion inexistente';
  end if;
  if p_estado not in (
    'devuelto', 'en_reparacion', 'esperando_reposicion',
    'reparado', 'repuesto', 'nota_credito', 'rechazado', 'descartado'
  ) then
    raise exception 'Estado invalido: %', p_estado;
  end if;

  v_cierra := p_estado in ('reparado', 'repuesto', 'nota_credito', 'rechazado', 'descartado');
  -- Solo estos dos devuelven material utilizable.
  v_recupera := p_estado in ('reparado', 'repuesto');

  update public.panol_devoluciones
     set estado = p_estado,
         proveedor_id = coalesce(p_proveedor_id, proveedor_id),
         destino = coalesce(p_destino, destino),
         notas = coalesce(p_notas, notas),
         decidido_at = case
           when decidido_at is null and p_estado <> 'devuelto' then now()
           else decidido_at end,
         decidido_por = case
           when decidido_por is null and p_estado <> 'devuelto' then v_uid
           else decidido_por end,
         salida_at = case
           when salida_at is null and p_estado in ('en_reparacion', 'esperando_reposicion') then now()
           else salida_at end,
         cerrado_at = case when v_cierra then now() else null end,
         updated_at = now()
   where id = p_devolucion_id;

  if v_recupera and v_dev.snapshot_id is not null then
    update public.panol_obra_materiales_snapshot
       set cantidad_en_reclamo = greatest(0, coalesce(cantidad_en_reclamo, 0) - v_dev.cantidad),
           updated_at = now()
     where id = v_dev.snapshot_id;
  end if;

  -- Al cerrar, el aviso de Compras se marca resuelto: si no, la bandeja se
  -- llena de avisos de cosas que ya se resolvieron y deja de mirarse.
  if v_cierra and v_dev.aviso_id is not null then
    update public.compras_avisos
       set estado = 'resuelto',
           resuelto_por = v_uid,
           resuelto_en = now(),
           updated_at = now()
     where id = v_dev.aviso_id
       and estado <> 'resuelto';
  end if;
end;
$$;

comment on function public.panol_resolver_devolucion(uuid, text, uuid, text, text) is
  'Mueve el estado de una devolucion. Reparado/repuesto bajan el reclamo de la obra; los demas cierres lo dejan abierto.';

grant execute on function public.panol_resolver_devolucion(uuid, text, uuid, text, text) to authenticated;

-- ── Vista del panel ───────────────────────────────────────────────────────
-- Con los dias y el valor ya calculados: son los dos datos que hacen que
-- alguien reclame.
create or replace view public.panol_devoluciones_panel
with (security_invoker = true) as
select
  d.*,
  o.codigo as obra_codigo,
  pr.nombre as proveedor_nombre,
  m.codigo as material_codigo,
  m.precio_unitario,
  m.moneda,
  round(coalesce(m.precio_unitario, 0) * d.cantidad, 2) as valor_estimado,
  extract(day from (now() - d.devuelto_at))::int as dias_desde_devolucion,
  case when d.salida_at is not null and d.cerrado_at is null
    then extract(day from (now() - d.salida_at))::int end as dias_afuera
from public.panol_devoluciones d
left join public.produccion_obras o on o.id = d.obra_id
left join public.panol_proveedores pr on pr.id = d.proveedor_id
left join public.panol_materiales m on m.id = d.material_id;

grant select on public.panol_devoluciones_panel to authenticated;
