-- Devoluciones, segunda vuelta: de quien es la culpa, a donde fue y que se fue
-- hablando en el medio.
--
-- La primera version alcanzaba para saber QUE volvio fallado. En el uso real
-- aparecieron tres cosas que faltaban:
--
-- 1. NO TODO ES CULPA DEL PROVEEDOR. La mitad de las devoluciones son cosas que
--    rompimos nosotros: se cayo, se paso de rosca, se uso para lo que no era.
--    Igual se registran —el material salio del panol y no vuelve a estar
--    disponible— pero no se le pueden reclamar al proveedor. Sin separarlo, el
--    total de "pendiente de reposicion" es un numero inflado que nadie puede
--    usar para reclamar: se llama al proveedor con $840.000 y resulta que
--    $500.000 los rompimos nosotros.
--
-- 2. "EN REPARACION" NO DICE DONDE. Puede ir al proveedor que lo vendio (que es
--    lo que corresponde si vino fallado), a un taller de afuera, o lo arregla
--    el herrero aca. Son tres situaciones distintas: a la primera se le reclama,
--    a la segunda se le paga, y la tercera cuesta horas nuestras.
--
-- 3. NO HABIA DONDE ANOTAR. Entre que sale y vuelve pasan semanas de llamadas.
--    "12/8 llame a Trimer, dicen el viernes" es lo que evita volver a llamar el
--    lunes preguntando lo mismo. Sin un lugar para eso, queda en un WhatsApp.
--
-- Esta migracion es independiente de la anterior y toda idempotente: se puede
-- correr aunque 20260807120000 ya este aplicada, y se puede correr dos veces.

-- ── De quien es la culpa ──────────────────────────────────────────────────
alter table public.panol_devoluciones
  add column if not exists responsable text not null default 'sin_definir';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'panol_devoluciones_responsable_check'
  ) then
    alter table public.panol_devoluciones
      add constraint panol_devoluciones_responsable_check
      check (responsable in ('proveedor', 'nosotros', 'sin_definir'));
  end if;
end $$;

comment on column public.panol_devoluciones.responsable is
  'proveedor = vino mal de fabrica y se le reclama. nosotros = lo rompimos aca, se registra igual pero no es reclamable. sin_definir = todavia no se sabe.';

-- ── A donde fue ───────────────────────────────────────────────────────────
alter table public.panol_devoluciones
  add column if not exists destino_tipo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'panol_devoluciones_destino_tipo_check'
  ) then
    alter table public.panol_devoluciones
      add constraint panol_devoluciones_destino_tipo_check
      check (destino_tipo is null or destino_tipo in ('proveedor', 'taller', 'interno'));
  end if;
end $$;

comment on column public.panol_devoluciones.destino_tipo is
  'proveedor = volvio a quien lo vendio. taller = a un tercero que nos cobra. interno = lo arreglamos nosotros.';

-- Lo que cuesta arreglarlo. Es el numero que dice cuando conviene tirarlo y
-- comprar uno nuevo, y cuando conviene dejar de comprarle a ese proveedor.
alter table public.panol_devoluciones
  add column if not exists costo_reparacion numeric(14,2);

comment on column public.panol_devoluciones.costo_reparacion is
  'Lo que se paga por la reparacion. Nulo si todavia no se sabe o si no se paga (garantia).';

create index if not exists idx_panol_devoluciones_reclamables
  on public.panol_devoluciones (responsable, estado)
  where responsable = 'proveedor' and estado in ('devuelto', 'en_reparacion', 'esperando_reposicion');

-- ── Seguimiento ───────────────────────────────────────────────────────────
-- Una devolucion abierta es una conversacion, no un estado. Cada llamada, cada
-- promesa de fecha y cada excusa va aca, con quien la anoto y cuando.
create table if not exists public.panol_devoluciones_notas (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.panol_devoluciones(id) on delete cascade,
  texto text not null check (btrim(texto) <> ''),
  -- El estado en el que estaba cuando se escribio. Sirve para leer la historia
  -- despues: "esto lo anotaron cuando todavia estaba en el estante".
  estado_en_ese_momento text,
  autor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.panol_devoluciones_notas is
  'Seguimiento de una devolucion abierta: llamadas, fechas prometidas, lo que dijo el proveedor.';

create index if not exists idx_panol_devoluciones_notas_dev
  on public.panol_devoluciones_notas (devolucion_id, created_at desc);

alter table public.panol_devoluciones_notas enable row level security;

drop policy if exists "panol_devoluciones_notas lectura" on public.panol_devoluciones_notas;
create policy "panol_devoluciones_notas lectura"
  on public.panol_devoluciones_notas for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_devoluciones_notas escritura" on public.panol_devoluciones_notas;
create policy "panol_devoluciones_notas escritura"
  on public.panol_devoluciones_notas for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── Agregar una nota ──────────────────────────────────────────────────────
create or replace function public.panol_devolucion_nota(
  p_devolucion_id uuid,
  p_texto text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_estado text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'La nota no puede estar vacia';
  end if;

  select estado into v_estado from public.panol_devoluciones where id = p_devolucion_id;
  if not found then
    raise exception 'Devolucion inexistente';
  end if;

  insert into public.panol_devoluciones_notas (devolucion_id, texto, estado_en_ese_momento, autor_id)
  values (p_devolucion_id, btrim(p_texto), v_estado, v_uid)
  returning id into v_id;

  -- Que una devolucion tenga movimiento la saca de "abandonada" en el panel.
  update public.panol_devoluciones set updated_at = now() where id = p_devolucion_id;

  return v_id;
end;
$$;

grant execute on function public.panol_devolucion_nota(uuid, text) to authenticated;

-- ── Registrar, ahora con responsable ──────────────────────────────────────
-- Se dropea la version vieja en vez de dejar las dos: con parametros por
-- nombre, dos funciones que aceptan la misma llamada dan "function is not
-- unique" y falla en runtime.
drop function if exists public.panol_registrar_devolucion(uuid, numeric, text, text, text);

create or replace function public.panol_registrar_devolucion(
  p_snapshot_id uuid,
  p_cantidad numeric,
  p_motivo text default 'defectuoso',
  p_detalle text default null,
  p_necesita text default 'devuelto',
  p_responsable text default 'sin_definir'
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
  v_responsable text;
  v_que_hacer text;
  v_de_quien text;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad devuelta tiene que ser mayor a cero';
  end if;

  v_responsable := case p_responsable
    when 'proveedor' then 'proveedor'
    when 'nosotros' then 'nosotros'
    else 'sin_definir'
  end;

  v_estado := case p_necesita
    when 'en_reparacion' then 'en_reparacion'
    when 'esperando_reposicion' then 'esperando_reposicion'
    else 'devuelto'
  end;

  -- Si lo rompimos nosotros no hay nada que reclamarle a nadie: el aviso a
  -- Compras tiene que decir eso, si no salen a pelear una garantia que no
  -- existe y queman la relacion con el proveedor al pedo.
  v_de_quien := case v_responsable
    when 'nosotros' then ' Se rompio en obra: no es reclamable al proveedor.'
    when 'proveedor' then ' Vino fallado de fabrica.'
    else ''
  end;

  v_que_hacer := case
    when v_responsable = 'nosotros' and v_estado = 'esperando_reposicion'
      then 'Hay que comprar el reemplazo.'
    when v_estado = 'en_reparacion' then 'Hay que mandarlo a reparar.'
    when v_estado = 'esperando_reposicion' then 'Hay que reclamar la reposicion al proveedor.'
    else 'Definir si se manda a reparar o se repone.'
  end;

  select * into v_snap
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id;
  if not found then
    raise exception 'No se encontro el egreso de origen';
  end if;

  select codigo into v_obra_codigo
    from public.produccion_obras where id = v_snap.obra_id;

  update public.panol_obra_materiales_snapshot
     set cantidad_en_reclamo = coalesce(cantidad_en_reclamo, 0) + p_cantidad,
         updated_at = now()
   where id = p_snapshot_id;

  insert into public.compras_avisos (
    titulo, detalle, material, project_id, destino, prioridad, origen, source_ref, created_by
  ) values (
    format('Devolución: %s', v_snap.descripcion),
    format(
      '%s unidades volvieron del pañol como %s.%s%s %s',
      trim(to_char(p_cantidad, 'FM999999990.999')),
      coalesce(p_motivo, 'defectuoso'),
      case when p_detalle is null or btrim(p_detalle) = '' then '' else ' ' || p_detalle || '.' end,
      v_de_quien,
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
    motivo, detalle, estado, responsable, registrado_por, aviso_id, salida_at
  ) values (
    v_snap.material_id, v_snap.descripcion, p_cantidad, v_snap.unidad,
    p_snapshot_id, v_snap.obra_id, v_snap.retirado_por,
    coalesce(p_motivo, 'defectuoso'), p_detalle, v_estado, v_responsable, v_uid, v_aviso,
    case when v_estado <> 'devuelto' then now() end
  )
  returning id into v_devolucion;

  return v_devolucion;
end;
$$;

comment on function public.panol_registrar_devolucion(uuid, numeric, text, text, text, text) is
  'Registra que un material entregado volvio fallado: abre la devolucion, deja la cantidad en reclamo en la obra y avisa a Compras diciendo de quien es la culpa.';

grant execute on function public.panol_registrar_devolucion(uuid, numeric, text, text, text, text) to authenticated;

-- ── Resolver, ahora con destino y costo ───────────────────────────────────
drop function if exists public.panol_resolver_devolucion(uuid, text, uuid, text, text);

create or replace function public.panol_resolver_devolucion(
  p_devolucion_id uuid,
  p_estado text,
  p_proveedor_id uuid default null,
  p_destino text default null,
  p_notas text default null,
  p_destino_tipo text default null,
  p_responsable text default null,
  p_costo_reparacion numeric default null
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
  if p_destino_tipo is not null and p_destino_tipo not in ('proveedor', 'taller', 'interno') then
    raise exception 'Destino invalido: %', p_destino_tipo;
  end if;
  if p_responsable is not null and p_responsable not in ('proveedor', 'nosotros', 'sin_definir') then
    raise exception 'Responsable invalido: %', p_responsable;
  end if;

  v_cierra := p_estado in ('reparado', 'repuesto', 'nota_credito', 'rechazado', 'descartado');
  v_recupera := p_estado in ('reparado', 'repuesto');

  update public.panol_devoluciones
     set estado = p_estado,
         proveedor_id = coalesce(p_proveedor_id, proveedor_id),
         destino = coalesce(p_destino, destino),
         destino_tipo = coalesce(p_destino_tipo, destino_tipo),
         responsable = coalesce(p_responsable, responsable),
         costo_reparacion = coalesce(p_costo_reparacion, costo_reparacion),
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

  -- El cambio de estado queda en la historia sin que nadie lo escriba: si no,
  -- la unica forma de saber cuando salio a Trimer es mirar un timestamp suelto.
  insert into public.panol_devoluciones_notas (devolucion_id, texto, estado_en_ese_momento, autor_id)
  values (
    p_devolucion_id,
    case
      when p_destino is not null and btrim(p_destino) <> ''
        then format('Pasa a %s · %s', p_estado, btrim(p_destino))
      else format('Pasa a %s', p_estado)
    end,
    v_dev.estado,
    v_uid
  );

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

comment on function public.panol_resolver_devolucion(uuid, text, uuid, text, text, text, text, numeric) is
  'Mueve el estado de una devolucion y deja la nota del movimiento. Reparado/repuesto bajan el reclamo de la obra.';

grant execute on function public.panol_resolver_devolucion(uuid, text, uuid, text, text, text, text, numeric) to authenticated;

-- ── Vista del panel ───────────────────────────────────────────────────────
-- El agregado importante es valor_reclamable: separa lo que se le puede pedir
-- al proveedor de lo que rompimos nosotros. Sumar todo junto da un numero que
-- no se puede usar para reclamar y que por eso nadie mira.
--
-- Se dropea antes de crearla en vez de usar "create or replace": replace solo
-- deja AGREGAR columnas al final, y como la vista expone d.* las columnas
-- nuevas de la tabla (responsable, destino_tipo, costo_reparacion) aparecen en
-- el medio y corren a las que venian despues. Postgres lee ese corrimiento como
-- un intento de renombrar columnas y falla con 42P16. Una vista no guarda
-- datos, asi que recrearla no cuesta nada.
drop view if exists public.panol_devoluciones_panel;

create view public.panol_devoluciones_panel
with (security_invoker = true) as
select
  d.*,
  o.codigo as obra_codigo,
  pr.nombre as proveedor_nombre,
  m.codigo as material_codigo,
  m.precio_unitario,
  m.moneda,
  round(coalesce(m.precio_unitario, 0) * d.cantidad, 2) as valor_estimado,
  case when d.responsable = 'proveedor'
    then round(coalesce(m.precio_unitario, 0) * d.cantidad, 2)
    else 0 end as valor_reclamable,
  extract(day from (now() - d.devuelto_at))::int as dias_desde_devolucion,
  case when d.salida_at is not null and d.cerrado_at is null
    then extract(day from (now() - d.salida_at))::int end as dias_afuera,
  -- Dias sin que nadie la toque. Una devolucion abierta hace 40 dias con la
  -- ultima nota hace 38 esta abandonada, y eso es distinto de una que se
  -- gestiono ayer.
  extract(day from (now() - greatest(d.updated_at, d.devuelto_at)))::int as dias_sin_movimiento,
  coalesce(n.total, 0)::int as notas_count,
  n.ultima_nota,
  n.ultima_nota_at,
  quien_registro.username as registrado_por_nombre,
  quien_decidio.username as decidido_por_nombre
from public.panol_devoluciones d
left join public.produccion_obras o on o.id = d.obra_id
left join public.panol_proveedores pr on pr.id = d.proveedor_id
left join public.panol_materiales m on m.id = d.material_id
left join public.profiles quien_registro on quien_registro.id = d.registrado_por
left join public.profiles quien_decidio on quien_decidio.id = d.decidido_por
left join lateral (
  select
    count(*) as total,
    (array_agg(x.texto order by x.created_at desc))[1] as ultima_nota,
    max(x.created_at) as ultima_nota_at
  from public.panol_devoluciones_notas x
  where x.devolucion_id = d.id
) n on true;

grant select on public.panol_devoluciones_panel to authenticated;
