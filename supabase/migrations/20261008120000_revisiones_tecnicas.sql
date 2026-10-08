-- Revisiones técnicas: etapa de carga y depuración de las matrices de línea y
-- de las etapas de producción. Los dueños de cada línea (técnica) responden
-- lotes chicos; cada respuesta se aplica directo y guarda cómo deshacerla.
-- Al terminar, el dueño libera la lista y Compras recibe el aviso de que ya
-- se puede usar para comprar. Compras no decide ni aprueba nada acá.
begin;
set local lock_timeout = '5s';

create table if not exists public.revision_duenos (
  modelo text not null check (modelo ~ '^[0-9]{2}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (modelo, user_id)
);

create table if not exists public.revisiones_tecnicas (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (modelo ~ '^[0-9]{2}$'),
  tipo text not null check (tipo in ('falta','producto','sin_uso','etapa')),
  titulo text not null,
  orden integer not null default 0,
  -- Lunes de la semana sugerida: los lotes se reparten para no tapar a nadie.
  semana date not null,
  total integer not null default 0,
  respondidos integer not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha')),
  created_at timestamptz not null default now(),
  completada_at timestamptz,
  completada_por uuid references public.profiles(id) on delete set null
);
create index if not exists revisiones_tecnicas_modelo on public.revisiones_tecnicas(modelo, semana, orden);

create table if not exists public.revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revisiones_tecnicas(id) on delete cascade,
  modelo text not null,
  tipo text not null,
  material_id uuid references public.panol_materiales(id) on delete cascade,
  linea_proceso_id uuid references public.linea_procesos(id) on delete cascade,
  orden integer not null default 0,
  contexto jsonb not null default '{}'::jsonb,
  respuesta text,
  valor jsonb,
  nota text check (nota is null or length(nota) <= 1000),
  respondido_por uuid references public.profiles(id) on delete set null,
  respondido_at timestamptz,
  deshacer jsonb,
  check (num_nonnulls(material_id, linea_proceso_id) = 1)
);
-- Un mismo material (o etapa) se pregunta una sola vez por línea y tipo.
create unique index if not exists revision_items_unico
  on public.revision_items(modelo, tipo, coalesce(material_id, linea_proceso_id));
create index if not exists revision_items_revision on public.revision_items(revision_id, orden);

create table if not exists public.revision_liberaciones (
  id uuid primary key default gen_random_uuid(),
  modelo text not null check (modelo ~ '^[0-9]{2}$'),
  liberada_por uuid references public.profiles(id) on delete set null,
  liberada_at timestamptz not null default now(),
  nota text check (nota is null or length(nota) <= 1000),
  vigente boolean not null default true
);
create unique index if not exists revision_liberaciones_vigente on public.revision_liberaciones(modelo) where vigente;

alter table public.revision_duenos enable row level security;
alter table public.revisiones_tecnicas enable row level security;
alter table public.revision_items enable row level security;
alter table public.revision_liberaciones enable row level security;

-- Lectura para todo el personal (Compras sigue el avance); escritura sólo por RPC.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['revision_duenos','revisiones_tecnicas','revision_items','revision_liberaciones'] loop
    execute format('drop policy if exists "revisiones lectura personal" on public.%I', v_tabla);
    execute format('create policy "revisiones lectura personal" on public.%I for select to authenticated using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text <> ''cliente''))', v_tabla);
    execute format('revoke all on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('grant all on public.%I to service_role', v_tabla);
  end loop;
end $$;

create or replace function public.revision_es_dueno(p_modelo text, p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null and exists (
    select 1 from public.revision_duenos d join public.profiles p on p.id = d.user_id
    where d.modelo = p_modelo and d.user_id = p_uid and not coalesce(p.is_demo, false));
$$;
revoke all on function public.revision_es_dueno(text, uuid) from public, anon;
grant execute on function public.revision_es_dueno(text, uuid) to authenticated;

-- ── Generación de lotes ────────────────────────────────────────────────────
-- Arma los lotes de una línea con lo que todavía no se preguntó. Se puede
-- volver a correr: nunca repite un ítem. Sólo service_role (la corre un admin).
create or replace function public.revisiones_generar(p_modelo text, p_por_semana integer default 4, p_tamano integer default 20)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_linea uuid;
  -- De lunes a miércoles arranca esta semana; de jueves en adelante, el lunes que viene.
  v_lunes date := date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires') + interval '4 days')::date;
  v_inicio integer;
  v_lote record;
  v_rev uuid;
  v_creados integer := 0;
begin
  if p_modelo !~ '^[0-9]{2}$' then raise exception 'Modelo inválido: %', p_modelo; end if;
  select id into v_linea from public.lineas_produccion where nombre = 'K' || p_modelo and activa limit 1;

  create temp table if not exists tmp_revision_candidatos (
    tipo text, prioridad integer, rubro text, clave text, material_id uuid, linea_proceso_id uuid, contexto jsonb, n integer
  ) on commit drop;
  truncate tmp_revision_candidatos;

  -- Lo que pasó por las obras de la línea: retiros, remitos, compras y pedidos.
  create temp table if not exists tmp_revision_uso (req uuid, prod uuid, obra_id uuid, cantidad numeric) on commit drop;
  truncate tmp_revision_uso;
  insert into tmp_revision_uso
  select coalesce(s.requisito_material_id, s.material_id), s.material_id, s.obra_id, s.cantidad
  from public.panol_obra_materiales_snapshot s
  where s.material_id is not null and public.panol_modelo_de_obra(s.obra_id) = p_modelo
    and (s.source in ('egreso_producto','egreso_solicitud','solicitud_consumible_retiro','historial_retiro_parcial','remito','compra')
      or (s.source in ('matriz','manual','addon','condicionante') and coalesce(s.estado,'pendiente') <> 'pendiente'));
  insert into tmp_revision_uso
  select coalesce(i.requisito_material_id, i.material_id), i.material_id, pr.project_id, null
  from public.purchase_request_items i join public.purchase_requests pr on pr.id = i.request_id
  where i.material_id is not null and pr.project_id is not null and pr.status <> 'cancelado'
    and public.panol_modelo_de_obra(pr.project_id) = p_modelo;

  -- 1) Se usa en 2 o más obras de la línea y no está en la matriz.
  insert into tmp_revision_candidatos(tipo, prioridad, rubro, clave, material_id, linea_proceso_id, contexto)
  select 'falta', 1, coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id, null,
    jsonb_build_object('descripcion', m.descripcion, 'codigo', m.codigo, 'unidad', coalesce(m.unidad_medida,'unidad'),
      'rubro', coalesce(c.nombre, 'Sin rubro'), 'proveedor', nullif(m.proveedor,''),
      'obras', u.obras, 'cantidad_sugerida', u.cantidad_sugerida)
  from (
    select x.req,
      (select jsonb_agg(o.codigo order by o.codigo) from public.produccion_obras o where o.id = any(array_agg(distinct x.obra_id))) obras,
      (select percentile_cont(0.5) within group (order by t.total) from (
         select sum(y.cantidad) total from tmp_revision_uso y where y.req = x.req and y.cantidad > 0 group by y.obra_id) t) cantidad_sugerida
    from tmp_revision_uso x group by x.req having count(distinct x.obra_id) >= 2
  ) u
  -- Los consumibles van por su propio circuito: ninguna matriz los lleva.
  join public.panol_materiales m on m.id = u.req and coalesce(m.activo, true) and not coalesce(m.es_consumible, false)
  left join public.panol_categorias c on c.id = m.categoria_id
  where not exists (select 1 from public.panol_material_modelo mm where mm.modelo = p_modelo and mm.variante = 'standard'
      and (mm.material_id = u.req or mm.producto_predeterminado_id = u.req));

  -- 2) Requisito de la matriz sin producto elegido (y que no se define por obra).
  insert into tmp_revision_candidatos(tipo, prioridad, rubro, clave, material_id, linea_proceso_id, contexto)
  select 'producto', 2, coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id, null,
    jsonb_build_object('descripcion', m.descripcion, 'codigo', m.codigo, 'unidad', coalesce(m.unidad_medida,'unidad'),
      'rubro', coalesce(c.nombre, 'Sin rubro'), 'cantidad', mm.cantidad,
      'opciones', coalesce((
        select jsonb_agg(op order by (op->>'obras')::int desc nulls last, op->>'descripcion') from (
          select distinct on (p.id) jsonb_build_object('id', p.id, 'descripcion', p.descripcion, 'codigo', p.codigo,
            'proveedor', nullif(p.proveedor,''),
            'obras', (select count(distinct y.obra_id) from tmp_revision_uso y where y.req = m.id and y.prod = p.id)) op
          from public.panol_materiales p
          where coalesce(p.activo, true) and p.id <> m.id and (
            exists (select 1 from public.panol_requisito_productos rp where rp.requisito_material_id = m.id and rp.producto_material_id = p.id and coalesce(rp.activo, true))
            or exists (select 1 from tmp_revision_uso y where y.req = m.id and y.prod = p.id))
          limit 12) t), '[]'::jsonb))
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id and coalesce(m.activo, true)
  left join public.panol_categorias c on c.id = m.categoria_id
  where mm.modelo = p_modelo and mm.variante = 'standard' and mm.cantidad > 0
    and coalesce(m.es_requisito, false) and mm.producto_predeterminado_id is null and not coalesce(m.producto_por_obra, false);

  -- 3) Está en la matriz pero no figura usado en ninguna obra de la línea.
  insert into tmp_revision_candidatos(tipo, prioridad, rubro, clave, material_id, linea_proceso_id, contexto)
  select 'sin_uso', 4, coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id, null,
    jsonb_build_object('descripcion', coalesce(pp.descripcion, m.descripcion), 'requisito', case when pp.id is not null then m.descripcion end,
      'codigo', coalesce(pp.codigo, m.codigo), 'unidad', coalesce(m.unidad_medida,'unidad'), 'rubro', coalesce(c.nombre, 'Sin rubro'),
      'cantidad', mm.cantidad, 'proveedor', nullif(coalesce(pp.proveedor, m.proveedor),''),
      'precio', nullif(coalesce(pp.precio_unitario, m.precio_unitario), 0), 'moneda', coalesce(pp.moneda, m.moneda))
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id and coalesce(m.activo, true)
  left join public.panol_materiales pp on pp.id = mm.producto_predeterminado_id
  left join public.panol_categorias c on c.id = m.categoria_id
  where mm.modelo = p_modelo and mm.variante = 'standard' and mm.cantidad > 0
    and not exists (select 1 from tmp_revision_uso y where y.req = m.id or y.prod = m.id
      or (mm.producto_predeterminado_id is not null and y.prod = mm.producto_predeterminado_id))
    -- Lo que ya se pregunta como "elegir producto" no se repite acá.
    and not (coalesce(m.es_requisito, false) and mm.producto_predeterminado_id is null and not coalesce(m.producto_por_obra, false));

  -- 4) Cada etapa de la plantilla de la línea: ubicación, duración y tareas.
  if v_linea is not null then
    insert into tmp_revision_candidatos(tipo, prioridad, rubro, clave, material_id, linea_proceso_id, contexto)
    select 'etapa', 3, 'Etapas', lpad(p.orden::text, 4, '0'), null, p.id,
      jsonb_build_object('nombre', p.nombre, 'orden', p.orden, 'dias', p.dias_estimados,
        'semanas', (select f.semanas from public.fechas_offsets f where f.modelo = '*' and f.evento_key = 'linea_proceso:' || p.id),
        'tareas_total', (select count(*) from public.linea_proceso_tareas t where t.linea_proceso_id = p.id),
        'tareas', coalesce((select jsonb_agg(t.nombre order by t.orden) from (
          select t.nombre, t.orden from public.linea_proceso_tareas t where t.linea_proceso_id = p.id order by t.orden limit 40) t), '[]'::jsonb))
    from public.linea_procesos p
    where p.linea_id = v_linea and p.activo;
  end if;

  delete from tmp_revision_candidatos t where exists (
    select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = t.tipo
      and coalesce(i.material_id, i.linea_proceso_id) = coalesce(t.material_id, t.linea_proceso_id));

  -- Numeración única (con desempate) para repartir en lotes sin repetir ni perder ítems.
  update tmp_revision_candidatos t set n = x.n from (
    select ctid as fila, row_number() over (partition by tipo order by rubro, clave, coalesce(material_id, linea_proceso_id)) - 1 as n
    from tmp_revision_candidatos) x
  where t.ctid = x.fila;

  select coalesce(max(orden), 0) into v_inicio from public.revisiones_tecnicas where modelo = p_modelo;

  for v_lote in
    with numerados as (select t.* from tmp_revision_candidatos t), lotes as (
      select tipo, min(prioridad) prioridad, n / greatest(p_tamano, 5) lote,
        array_agg(distinct rubro) rubros, count(*) total
      from numerados group by tipo, n / greatest(p_tamano, 5)
    )
    select l.*, row_number() over (order by l.prioridad, l.lote) - 1 as idx from lotes l
  loop
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, total)
    values (p_modelo, v_lote.tipo,
      case v_lote.tipo when 'falta' then 'Se usa y no está en la matriz' when 'producto' then 'Elegir el producto'
        when 'etapa' then 'Etapas de producción' else '¿Va en la matriz?' end
        || case when v_lote.tipo <> 'etapa' then ' · ' || array_to_string(v_lote.rubros[1:2], ', ')
          || case when cardinality(v_lote.rubros) > 2 then ' y más' else '' end else '' end,
      v_inicio + v_lote.idx + 1,
      v_lunes + (7 * (v_lote.idx / greatest(p_por_semana, 1)))::integer,
      v_lote.total)
    returning id into v_rev;

    insert into public.revision_items(revision_id, modelo, tipo, material_id, linea_proceso_id, orden, contexto)
    select v_rev, p_modelo, t.tipo, t.material_id, t.linea_proceso_id, t.n, t.contexto
    from tmp_revision_candidatos t
    where t.tipo = v_lote.tipo and t.n / greatest(p_tamano, 5) = v_lote.lote;
    v_creados := v_creados + 1;
  end loop;
  return v_creados;
end;
$$;
revoke all on function public.revisiones_generar(text, integer, integer) from public, anon, authenticated;
grant execute on function public.revisiones_generar(text, integer, integer) to service_role;

-- ── Aplicar y deshacer ─────────────────────────────────────────────────────
create or replace function public.revision_restaurar_fila_matriz(p_material uuid, p_modelo text, p_fila jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_fila is null or jsonb_typeof(p_fila) = 'null' then
    delete from public.panol_material_modelo where material_id = p_material and modelo = p_modelo and variante = 'standard';
  else
    insert into public.panol_material_modelo(id, material_id, modelo, cantidad, variante, created_at, producto_predeterminado_id, especificaciones_defecto)
    select r.id, r.material_id, r.modelo, r.cantidad, r.variante, r.created_at, r.producto_predeterminado_id, coalesce(r.especificaciones_defecto, '{}'::jsonb)
    from jsonb_populate_record(null::public.panol_material_modelo, p_fila) r
    on conflict (material_id, modelo, variante) do update
      set cantidad = excluded.cantidad, producto_predeterminado_id = excluded.producto_predeterminado_id,
          especificaciones_defecto = excluded.especificaciones_defecto;
  end if;
end;
$$;
revoke all on function public.revision_restaurar_fila_matriz(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.revision_aplicar_deshacer(p_item public.revision_items)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := p_item.deshacer;
begin
  if p_item.respuesta is null or v is null then return; end if;
  if v ? 'fila' then
    perform public.revision_restaurar_fila_matriz(p_item.material_id, p_item.modelo, v->'fila');
  end if;
  if v ? 'por_obra' then
    update public.panol_materiales set producto_por_obra = (v->>'por_obra')::boolean where id = p_item.material_id;
  end if;
  if v ? 'semanas' then
    if v->>'semanas' is null then
      delete from public.fechas_offsets where modelo = '*' and evento_key = 'linea_proceso:' || p_item.linea_proceso_id;
    else
      insert into public.fechas_offsets(evento_key, modelo, semanas, referencia, updated_at)
      values ('linea_proceso:' || p_item.linea_proceso_id, '*', (v->>'semanas')::numeric, 'desmolde', now())
      on conflict (evento_key, modelo) do update set semanas = excluded.semanas, updated_at = now();
    end if;
  end if;
  if v ? 'dias' then
    update public.linea_procesos set dias_estimados = (v->>'dias')::numeric where id = p_item.linea_proceso_id;
  end if;
end;
$$;
revoke all on function public.revision_aplicar_deshacer(public.revision_items) from public, anon, authenticated;

create or replace function public.revision_actualizar_avance(p_revision uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total integer; v_hechos integer;
begin
  select count(*), count(respuesta) into v_total, v_hechos from public.revision_items where revision_id = p_revision;
  update public.revisiones_tecnicas set total = v_total, respondidos = v_hechos,
    estado = case when v_hechos = 0 then 'pendiente' when v_hechos >= v_total then 'hecha' else 'en_curso' end,
    completada_at = case when v_hechos >= v_total then coalesce(completada_at, now()) end,
    completada_por = case when v_hechos >= v_total then coalesce(completada_por, auth.uid()) end
  where id = p_revision;
end;
$$;
revoke all on function public.revision_actualizar_avance(uuid) from public, anon, authenticated;

create or replace function public.revision_responder(p_item uuid, p_respuesta text, p_valor jsonb default null, p_nota text default null)
returns public.revision_items language plpgsql security definer set search_path = public as $$
declare
  v_item public.revision_items;
  v_fila jsonb;
  v_deshacer jsonb := null;
  v_cantidad numeric;
  v_producto uuid;
  v_semanas numeric;
  v_dias numeric;
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then
    raise exception 'Sólo los dueños de la línea K% pueden responder esta revisión.', v_item.modelo;
  end if;
  if p_nota is not null and length(p_nota) > 1000 then raise exception 'La nota es demasiado larga.'; end if;

  -- Cambiar una respuesta primero deshace la anterior.
  perform public.revision_aplicar_deshacer(v_item);

  select to_jsonb(mm) into v_fila from public.panol_material_modelo mm
  where mm.material_id = v_item.material_id and mm.modelo = v_item.modelo and mm.variante = 'standard';

  if v_item.tipo = 'falta' then
    if p_respuesta = 'agregar' then
      v_cantidad := nullif(p_valor->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Indicá cuánto lleva cada barco.'; end if;
      insert into public.panol_material_modelo(material_id, modelo, variante, cantidad)
      values (v_item.material_id, v_item.modelo, 'standard', v_cantidad)
      on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta <> 'no_agregar' then raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'producto' then
    if p_respuesta = 'producto' then
      v_producto := nullif(p_valor->>'producto_id', '')::uuid;
      if v_producto is null or not exists (select 1 from public.panol_materiales where id = v_producto) then
        raise exception 'Elegí un producto del catálogo.';
      end if;
      if v_fila is null then raise exception 'El requisito ya no está en la matriz K%.', v_item.modelo; end if;
      update public.panol_material_modelo set producto_predeterminado_id = v_producto
      where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta = 'por_obra' then
      v_deshacer := jsonb_build_object('por_obra', (select coalesce(producto_por_obra, false) from public.panol_materiales where id = v_item.material_id));
      update public.panol_materiales set producto_por_obra = true where id = v_item.material_id;
    elsif p_respuesta = 'no_va' then
      delete from public.panol_material_modelo where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    else raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'sin_uso' then
    if p_respuesta = 'cantidad' then
      v_cantidad := nullif(p_valor->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Indicá cuánto lleva cada barco.'; end if;
      if v_fila is null then raise exception 'El material ya no está en la matriz K%.', v_item.modelo; end if;
      update public.panol_material_modelo set cantidad = v_cantidad
      where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta = 'no_va' then
      delete from public.panol_material_modelo where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta <> 'va' then raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'etapa' then
    if p_respuesta = 'ajustar' then
      v_semanas := nullif(p_valor->>'semanas', '')::numeric;
      v_dias := nullif(p_valor->>'dias', '')::numeric;
      if v_semanas is null and v_dias is null then raise exception 'Indicá la semana o los días de la etapa.'; end if;
      if v_dias is not null and (v_dias <= 0 or v_dias > 365) then raise exception 'Los días tienen que estar entre 1 y 365.'; end if;
      if v_semanas is not null and abs(v_semanas) > 104 then raise exception 'La semana tiene que estar a menos de dos años del desmolde.'; end if;
      v_deshacer := '{}'::jsonb;
      if v_semanas is not null then
        v_deshacer := v_deshacer || jsonb_build_object('semanas', (select f.semanas from public.fechas_offsets f
          where f.modelo = '*' and f.evento_key = 'linea_proceso:' || v_item.linea_proceso_id));
        insert into public.fechas_offsets(evento_key, modelo, semanas, referencia, updated_at)
        values ('linea_proceso:' || v_item.linea_proceso_id, '*', v_semanas, 'desmolde', now())
        on conflict (evento_key, modelo) do update set semanas = excluded.semanas, referencia = 'desmolde', updated_at = now();
      end if;
      if v_dias is not null then
        v_deshacer := v_deshacer || jsonb_build_object('dias', (select dias_estimados from public.linea_procesos where id = v_item.linea_proceso_id));
        update public.linea_procesos set dias_estimados = v_dias where id = v_item.linea_proceso_id;
      end if;
    elsif p_respuesta = 'corregir' then
      if nullif(btrim(coalesce(p_nota, '')), '') is null then raise exception 'Contá qué hay que corregir en las tareas.'; end if;
    elsif p_respuesta <> 'ok' then raise exception 'Respuesta inválida.'; end if;
  end if;

  update public.revision_items set respuesta = p_respuesta, valor = p_valor, nota = nullif(btrim(coalesce(p_nota, '')), ''),
    respondido_por = auth.uid(), respondido_at = now(), deshacer = v_deshacer
  where id = p_item returning * into v_item;
  perform public.revision_actualizar_avance(v_item.revision_id);
  return v_item;
end;
$$;
revoke all on function public.revision_responder(uuid, text, jsonb, text) from public, anon;
grant execute on function public.revision_responder(uuid, text, jsonb, text) to authenticated;

create or replace function public.revision_deshacer(p_item uuid)
returns public.revision_items language plpgsql security definer set search_path = public as $$
declare v_item public.revision_items;
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then
    raise exception 'Sólo los dueños de la línea K% pueden cambiar esta revisión.', v_item.modelo;
  end if;
  perform public.revision_aplicar_deshacer(v_item);
  update public.revision_items set respuesta = null, valor = null, nota = null, respondido_por = null,
    respondido_at = null, deshacer = null
  where id = p_item returning * into v_item;
  perform public.revision_actualizar_avance(v_item.revision_id);
  return v_item;
end;
$$;
revoke all on function public.revision_deshacer(uuid) from public, anon;
grant execute on function public.revision_deshacer(uuid) to authenticated;

-- ── Liberar la lista para Compras ──────────────────────────────────────────
create or replace function public.revision_liberar(p_modelo text, p_nota text default null)
returns public.revision_liberaciones language plpgsql security definer set search_path = public as $$
declare v_lib public.revision_liberaciones; v_faltan integer; v_corregir integer; v_quien text;
begin
  if not public.revision_es_dueno(p_modelo) then raise exception 'Sólo los dueños de la línea K% pueden liberarla.', p_modelo; end if;
  select count(*) filter (where respuesta is null), count(*) filter (where respuesta = 'corregir')
    into v_faltan, v_corregir from public.revision_items where modelo = p_modelo;
  if v_faltan > 0 then raise exception 'Faltan % respuestas para liberar la K%.', v_faltan, p_modelo; end if;
  if v_corregir > 0 then raise exception 'Hay % etapas con tareas para corregir: resolvelas y marcalas como bien.', v_corregir; end if;
  update public.revision_liberaciones set vigente = false where modelo = p_modelo and vigente;
  insert into public.revision_liberaciones(modelo, liberada_por, nota)
  values (p_modelo, auth.uid(), nullif(btrim(coalesce(p_nota, '')), '')) returning * into v_lib;
  select username into v_quien from public.profiles where id = auth.uid();
  -- A Compras (y admins) les llega el aviso: la lista ya sirve para comprar.
  perform public.notificaciones_push_encolar(
    coalesce((select array_agg(p.id) from public.profiles p where p.role::text = 'compras' or p.is_admin or p.role::text = 'admin'), '{}'::uuid[]),
    auth.uid(), 'compras', 'revision-liberada:' || v_lib.id,
    jsonb_build_object('title', 'Matriz K' || p_modelo || ' lista para comprar',
      'body', coalesce(v_quien, 'Técnica') || ' revisó la matriz y la liberó: ya se puede usar para comprar.',
      'url', '/revisiones', 'tag', 'revision-liberada:' || p_modelo));
  return v_lib;
end;
$$;
revoke all on function public.revision_liberar(text, text) from public, anon;
grant execute on function public.revision_liberar(text, text) to authenticated;

-- ── Avisos al celular de los dueños ────────────────────────────────────────
-- Nueva categoría "revisiones". Quien ya guardó preferencias la recibe igual:
-- antes no existía la opción de apagarla.
alter table public.notificaciones_push_preferencias drop constraint if exists notificaciones_push_preferencias_categorias_check;
alter table public.notificaciones_push_preferencias add constraint notificaciones_push_preferencias_categorias_check
  check (categorias <@ array['logistica','compras','panol','revisiones']::text[]);
alter table public.notificaciones_push_preferencias alter column categorias set default array['logistica','compras','panol','revisiones'];
update public.notificaciones_push_preferencias set categorias = array_append(categorias, 'revisiones')
  where not ('revisiones' = any(categorias));

create or replace function public.notificaciones_push_encolar(
  p_users uuid[], p_actor uuid, p_categoria text, p_key text, p_payload jsonb,
  p_expires_at timestamptz default now() + interval '24 hours',
  p_disponible timestamptz default now(), p_agrupar boolean default false
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.notificaciones_push_outbox(subscription_id, user_id, event_key, categoria, payload, expires_at, available_at)
  select s.id, s.user_id, p_key, p_categoria,
    p_payload || jsonb_build_object('userId', s.user_id, 'categoria', p_categoria), p_expires_at, p_disponible
  from public.notificaciones_push_suscripciones s
  join public.profiles p on p.id = s.user_id
  left join public.notificaciones_push_preferencias pref on pref.user_id = s.user_id
  where s.enabled and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente'
    and s.user_id = any(p_users) and s.user_id is distinct from p_actor
    and coalesce(pref.push_enabled, true)
    and p_categoria = any(coalesce(pref.categorias, array['logistica','compras','panol','revisiones']::text[]))
    and p_expires_at > now()
  on conflict(subscription_id, event_key) do update
    set payload = notificaciones_push_outbox.payload || jsonb_build_object(
          'n', coalesce((notificaciones_push_outbox.payload->>'n')::int, 1) + 1,
          'body', left(concat_ws(' · ',
            (notificaciones_push_outbox.payload->>'primero') || ' y '
              || coalesce((notificaciones_push_outbox.payload->>'n')::int, 1) || ' más',
            nullif(notificaciones_push_outbox.payload->>'contexto', '')), 240))
    where p_agrupar and notificaciones_push_outbox.status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Una vez por semana (y al arrancar): cuántos lotes le tocan a cada dueño.
create or replace function public.revisiones_push_recordatorios(p_titulo text default 'Revisiones de esta semana', p_semana date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_lunes date := coalesce(p_semana, date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires'))::date); v_row record; v_count integer := 0;
begin
  for v_row in
    select d.user_id, string_agg(distinct 'K' || r.modelo, ', ') lineas, count(distinct r.id) lotes
    from public.revision_duenos d
    join public.revisiones_tecnicas r on r.modelo = d.modelo and r.estado <> 'hecha' and r.semana <= v_lunes
    group by d.user_id
  loop
    v_count := v_count + public.notificaciones_push_encolar(array[v_row.user_id], null, 'revisiones',
      'revisiones-semana:' || v_lunes || ':' || md5(p_titulo),
      jsonb_build_object('title', p_titulo,
        'body', 'Tenés ' || v_row.lotes || case when v_row.lotes = 1 then ' lote' else ' lotes' end || ' para revisar de la ' || v_row.lineas
          || '. Unos 10 minutos cada uno.',
        'url', '/revisiones', 'tag', 'revisiones-semana'),
      now() + interval '3 days');
  end loop;
  return v_count;
end;
$$;
revoke all on function public.revisiones_push_recordatorios(text, date) from public, anon, authenticated;
grant execute on function public.revisiones_push_recordatorios(text, date) to service_role;

do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('klasea-revisiones-recordatorio', '0 11 * * 1', 'select public.revisiones_push_recordatorios()');
  end if;
end $$;

commit;
