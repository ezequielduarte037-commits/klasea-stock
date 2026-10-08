-- Revisiones técnicas, tercera versión.
-- * Arranca con una pregunta: cuántas semanas se lamina antes del desmolde y
--   cuántas pasan hasta la botadura (estimado). Todo el plan se cuenta desde
--   el desmolde; con esa respuesta se arman las semanas a revisar.
-- * El condicionante del día es una pregunta abierta: "¿hay alguno que
--   quieras definir hoy?". Se puede contestar "hoy no" o "ya están todos",
--   y con eso no se pregunta más.
-- * Sin referencias a otras líneas.
begin;
set local lock_timeout = '5s';

alter table public.lineas_produccion add column if not exists semanas_antes_desmolde numeric;
alter table public.lineas_produccion add column if not exists semanas_despues_desmolde numeric;

alter table public.revisiones_tecnicas drop constraint if exists revisiones_tecnicas_tipo_check;
alter table public.revisiones_tecnicas add constraint revisiones_tecnicas_tipo_check
  check (tipo in ('falta','producto','sin_uso','etapa','productos','condicionante','semana','inicio'));

-- Nada de la versión anterior se respondió: se regenera todo con el esquema nuevo.
delete from public.revisiones_tecnicas r
where not exists (select 1 from public.revision_items i where i.revision_id = r.id and i.respuesta is not null);

-- Arma (o rearma) las semanas del plan de una línea, de -antes a +después del
-- desmolde, una por día hábil desde p_desde. No toca lo ya respondido.
create or replace function public.revisiones_armar_semanas(p_modelo text, p_desde date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_antes integer; v_despues integer; v_inicio integer; v_lote record; v_rev uuid; v_n integer := 0;
begin
  select ceil(semanas_antes_desmolde)::integer, ceil(semanas_despues_desmolde)::integer into v_antes, v_despues
  from public.lineas_produccion where nombre = 'K' || p_modelo and activa limit 1;
  delete from public.revisiones_tecnicas r where r.modelo = p_modelo and r.tipo = 'semana'
    and not exists (select 1 from public.revision_items i where i.revision_id = r.id and i.respuesta is not null);
  if v_antes is null or v_despues is null then return 0; end if;
  select coalesce(max(orden), 0) into v_inicio from public.revisiones_tecnicas where modelo = p_modelo;
  for v_lote in
    select w, row_number() over (order by w) - 1 as n
    from generate_series(-v_antes, v_despues) w
    where not exists (select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = 'semana' and i.semana = w)
  loop
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, dia, total)
    select p_modelo, 'semana',
      case when v_lote.w = 0 then 'Semana del desmolde'
        when v_lote.w < 0 then abs(v_lote.w) || case when v_lote.w = -1 then ' semana' else ' semanas' end || ' antes del desmolde'
        when v_lote.w = v_despues then 'Semana de la botadura'
        else 'Semana ' || v_lote.w || ' después del desmolde' end,
      v_inicio + v_n + 1, date_trunc('week', h.dia)::date, h.dia, 1
    from public.revision_dias_habiles(p_desde, v_lote.n::integer + 1) h where h.n = v_lote.n
    returning id into v_rev;
    insert into public.revision_items(revision_id, modelo, tipo, semana, orden, contexto)
    values (v_rev, p_modelo, 'semana', v_lote.w, 0, jsonb_build_object('semana', v_lote.w, 'desde', -v_antes, 'hasta', v_despues));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.revisiones_armar_semanas(text, date) from public, anon, authenticated;

-- Generación inicial: día 1 la pregunta de semanas; todos los días el
-- condicionante abierto y 30 productos. Las semanas del plan se arman cuando
-- se contesta la primera pregunta (o ya, si la línea las tiene cargadas).
create or replace function public.revisiones_generar_diario(p_modelo text, p_desde date default null,
  p_productos integer default 30, p_ultima_semana integer default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_desde date := coalesce(p_desde, date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires') + interval '4 days')::date);
  v_dias integer;
  v_inicio integer;
  v_lote record;
  v_rev uuid;
  v_creados integer := 0;
begin
  if p_modelo !~ '^[0-9]{2}$' then raise exception 'Modelo inválido: %', p_modelo; end if;

  create temp table if not exists tmp_rev_cand (
    flujo text, tipo text, rubro text, clave text, material_id uuid, sugerencia text, contexto jsonb, n integer
  ) on commit drop;
  truncate tmp_rev_cand;
  create temp table if not exists tmp_rev_uso (req uuid, prod uuid, obra_id uuid, cantidad numeric) on commit drop;
  truncate tmp_rev_uso;

  insert into tmp_rev_uso
  select coalesce(s.requisito_material_id, s.material_id), s.material_id, s.obra_id, s.cantidad
  from public.panol_obra_materiales_snapshot s
  where s.material_id is not null and public.panol_modelo_de_obra(s.obra_id) = p_modelo
    and (s.source in ('egreso_producto','egreso_solicitud','solicitud_consumible_retiro','historial_retiro_parcial','remito','compra')
      or (s.source in ('matriz','manual','addon','condicionante') and coalesce(s.estado,'pendiente') <> 'pendiente'));
  insert into tmp_rev_uso
  select coalesce(i.requisito_material_id, i.material_id), i.material_id, pr.project_id, null
  from public.purchase_request_items i join public.purchase_requests pr on pr.id = i.request_id
  where i.material_id is not null and pr.project_id is not null and pr.status <> 'cancelado'
    and public.panol_modelo_de_obra(pr.project_id) = p_modelo;

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, contexto)
  select 'productos', 'matriz', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
    jsonb_build_object('descripcion', coalesce(pp.descripcion, m.descripcion),
      'requisito', case when pp.id is not null then m.descripcion end,
      'producto_a_definir', coalesce(m.es_requisito, false) and pp.id is null,
      'codigo', coalesce(pp.codigo, m.codigo), 'unidad', coalesce(m.unidad_medida,'unidad'), 'rubro', coalesce(c.nombre, 'Sin rubro'),
      'cantidad', mm.cantidad, 'proveedor', nullif(coalesce(pp.proveedor, m.proveedor),''),
      'obras_uso', (select count(distinct y.obra_id) from tmp_rev_uso y where y.req = m.id or y.prod = m.id
        or (mm.producto_predeterminado_id is not null and y.prod = mm.producto_predeterminado_id)))
  from public.panol_material_modelo mm
  join public.panol_materiales m on m.id = mm.material_id and coalesce(m.activo, true)
  left join public.panol_materiales pp on pp.id = mm.producto_predeterminado_id
  left join public.panol_categorias c on c.id = m.categoria_id
  where mm.modelo = p_modelo and mm.variante = 'standard' and mm.cantidad > 0;

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, contexto)
  select 'productos', 'falta', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
    jsonb_build_object('descripcion', m.descripcion, 'codigo', m.codigo, 'unidad', coalesce(m.unidad_medida,'unidad'),
      'rubro', coalesce(c.nombre, 'Sin rubro'), 'proveedor', nullif(m.proveedor,''), 'obras', u.obras, 'cantidad_sugerida', u.cantidad_sugerida)
  from (
    select x.req,
      (select jsonb_agg(o.codigo order by o.codigo) from public.produccion_obras o where o.id = any(array_agg(distinct x.obra_id))) obras,
      (select percentile_cont(0.5) within group (order by t.total) from (
         select sum(y.cantidad) total from tmp_rev_uso y where y.req = x.req and y.cantidad > 0 group by y.obra_id) t) cantidad_sugerida
    from tmp_rev_uso x group by x.req having count(distinct x.obra_id) >= 2
  ) u
  join public.panol_materiales m on m.id = u.req and coalesce(m.activo, true) and not coalesce(m.es_consumible, false)
  left join public.panol_categorias c on c.id = m.categoria_id
  where not exists (select 1 from public.panol_material_modelo mm where mm.modelo = p_modelo and mm.variante = 'standard'
      and (mm.material_id = u.req or mm.producto_predeterminado_id = u.req));

  delete from tmp_rev_cand t where exists (
    select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = t.tipo and i.material_id = t.material_id);
  update tmp_rev_cand t set n = x.n from (
    select ctid as fila, row_number() over (order by rubro, clave, tipo, material_id) - 1 as n from tmp_rev_cand) x
  where t.ctid = x.fila;

  -- Tantos días como haga falta para los productos (mínimo dos semanas).
  select greatest(coalesce(ceil((select count(*) from tmp_rev_cand)::numeric / greatest(p_productos, 5)), 0), 10)::integer into v_dias;

  -- La primera pregunta, si la línea todavía no la contestó.
  if not exists (select 1 from public.revision_items where modelo = p_modelo and tipo = 'linea_semanas') then
    insert into tmp_rev_cand(flujo, tipo, rubro, clave, sugerencia, contexto, n)
    select 'inicio', 'linea_semanas', 'Inicio', '0', 'semanas', jsonb_build_object(
      'antes', l.semanas_antes_desmolde, 'despues', l.semanas_despues_desmolde, 'total', l.semanas_produccion_estimadas,
      'antes_plan', (select -min(f.semanas) from public.linea_procesos p join public.fechas_offsets f
        on f.modelo = '*' and f.evento_key = 'linea_proceso:' || p.id where p.linea_id = l.id and p.activo and f.semanas < 0)), 0
    from public.lineas_produccion l where l.nombre = 'K' || p_modelo and l.activa;
  end if;

  -- Una pregunta abierta por día sobre condicionantes.
  insert into tmp_rev_cand(flujo, tipo, rubro, clave, sugerencia, contexto, n)
  select 'condicionante', 'condicionante_abierto', 'Condicionantes', lpad(d::text, 4, '0'), 'dia-' || d, '{}'::jsonb, d
  from generate_series(0, v_dias - 1) d
  where not exists (select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = 'condicionante_abierto' and i.sugerencia = 'dia-' || d);

  select coalesce(max(orden), 0) into v_inicio from public.revisiones_tecnicas where modelo = p_modelo;

  for v_lote in
    with lotes as (
      select flujo, case when flujo = 'productos' then n / greatest(p_productos, 5) else n end as d,
        count(*) total, array_agg(distinct rubro) rubros
      from tmp_rev_cand group by flujo, case when flujo = 'productos' then n / greatest(p_productos, 5) else n end
    )
    select l.*, h.dia from lotes l join public.revision_dias_habiles(v_desde, v_dias) h on h.n = l.d
    order by h.dia, case l.flujo when 'inicio' then 0 when 'condicionante' then 1 when 'semana' then 2 else 3 end
  loop
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, dia, total)
    values (p_modelo, v_lote.flujo,
      case v_lote.flujo
        when 'productos' then 'Productos de la matriz · ' || array_to_string(v_lote.rubros[1:2], ', ')
          || case when cardinality(v_lote.rubros) > 2 then ' y más' else '' end
        when 'inicio' then 'Semanas de producción de la línea'
        else 'Condicionante del día'
      end,
      v_inicio + v_creados + 1, date_trunc('week', v_lote.dia)::date, v_lote.dia, v_lote.total)
    returning id into v_rev;
    insert into public.revision_items(revision_id, modelo, tipo, material_id, sugerencia, orden, contexto)
    select v_rev, p_modelo, t.tipo, t.material_id, t.sugerencia, t.n, t.contexto
    from tmp_rev_cand t
    where t.flujo = v_lote.flujo and (case when t.flujo = 'productos' then t.n / greatest(p_productos, 5) else t.n end) = v_lote.d;
    v_creados := v_creados + 1;
  end loop;

  -- Si la línea ya tiene las semanas cargadas, el plan arranca al día siguiente.
  v_creados := v_creados + public.revisiones_armar_semanas(p_modelo,
    (select h.dia from public.revision_dias_habiles(v_desde, 2) h where h.n = 1));
  return v_creados;
end;
$$;
revoke all on function public.revisiones_generar_diario(text, date, integer, integer) from public, anon, authenticated;
grant execute on function public.revisiones_generar_diario(text, date, integer, integer) to service_role;

-- Primera pregunta: semanas antes del desmolde (laminado) y hasta la botadura.
create or replace function public.revision_linea_semanas(p_item uuid, p_antes numeric, p_despues numeric)
returns public.revision_items language plpgsql security definer set search_path = public as $$
declare v_item public.revision_items; v_prev record; v_desde date;
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if v_item.tipo <> 'linea_semanas' then raise exception 'Esta revisión no es la de semanas de producción.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then raise exception 'Sólo los dueños de la línea K% pueden contestarla.', v_item.modelo; end if;
  if p_antes is null or p_antes < 1 or p_antes > 30 then raise exception 'Las semanas de laminado antes del desmolde tienen que estar entre 1 y 30.'; end if;
  if p_despues is null or p_despues < 1 or p_despues > 80 then raise exception 'Las semanas del desmolde a la botadura tienen que estar entre 1 y 80.'; end if;

  perform public.revision_aplicar_deshacer(v_item);
  select semanas_antes_desmolde a, semanas_despues_desmolde d, semanas_produccion_estimadas t into v_prev
  from public.lineas_produccion where nombre = 'K' || v_item.modelo and activa limit 1;
  update public.lineas_produccion set semanas_antes_desmolde = p_antes, semanas_despues_desmolde = p_despues,
    semanas_produccion_estimadas = p_antes + p_despues
  where nombre = 'K' || v_item.modelo and activa;

  update public.revision_items set respuesta = 'definido', valor = jsonb_build_object('antes', p_antes, 'despues', p_despues),
    nota = null, respondido_por = auth.uid(), respondido_at = now(),
    deshacer = jsonb_build_object('linea_antes', v_prev.a, 'linea_despues', v_prev.d, 'linea_total', v_prev.t)
  where id = p_item returning * into v_item;
  perform public.revision_actualizar_avance(v_item.revision_id);

  -- Las semanas del plan arrancan el próximo día hábil.
  select h.dia into v_desde from public.revision_dias_habiles((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1, 1) h;
  perform public.revisiones_armar_semanas(v_item.modelo, greatest(v_desde,
    (select min(dia) + 1 from public.revisiones_tecnicas where modelo = v_item.modelo)));
  return v_item;
end;
$$;
revoke all on function public.revision_linea_semanas(uuid, numeric, numeric) from public, anon;
grant execute on function public.revision_linea_semanas(uuid, numeric, numeric) to authenticated;

-- ── Deshacer ───────────────────────────────────────────────────────────────
create or replace function public.revision_aplicar_deshacer(p_item public.revision_items)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb := p_item.deshacer; v_rev uuid;
begin
  if p_item.respuesta is null or v is null then return; end if;
  if v ? 'fila' then
    perform public.revision_restaurar_fila_matriz(p_item.material_id, p_item.modelo, v->'fila');
  end if;
  if v ? 'por_obra' then
    update public.panol_materiales set producto_por_obra = (v->>'por_obra')::boolean where id = p_item.material_id;
  end if;
  if v ? 'condicionante_creado' then
    delete from public.panol_matriz_condicionantes where id = (v->>'condicionante_creado')::uuid;
  end if;
  if v ? 'linea_antes' then
    update public.lineas_produccion set semanas_antes_desmolde = (v->>'linea_antes')::numeric,
      semanas_despues_desmolde = (v->>'linea_despues')::numeric, semanas_produccion_estimadas = (v->>'linea_total')::numeric
    where nombre = 'K' || p_item.modelo and activa;
    if v->>'linea_antes' is null then perform public.revisiones_armar_semanas(p_item.modelo, current_date); end if;
  end if;
  if v ? 'cerro' then
    for v_rev in
      update public.revision_items set respuesta = null, valor = null, respondido_por = null, respondido_at = null
      where modelo = p_item.modelo and tipo = 'condicionante_abierto' and respuesta = 'cerrado' and valor->>'por' = p_item.id::text
      returning revision_id
    loop
      perform public.revision_actualizar_avance(v_rev);
    end loop;
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

-- ── Responder ──────────────────────────────────────────────────────────────
create or replace function public.revision_responder(p_item uuid, p_respuesta text, p_valor jsonb default null, p_nota text default null)
returns public.revision_items language plpgsql security definer set search_path = public as $$
declare
  v_item public.revision_items;
  v_fila jsonb;
  v_deshacer jsonb := null;
  v_cantidad numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_rev uuid;
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then
    raise exception 'Sólo los dueños de la línea K% pueden responder esta revisión.', v_item.modelo;
  end if;
  if v_nota is not null and length(v_nota) > 1000 then raise exception 'La nota es demasiado larga.'; end if;
  if p_respuesta = 'definido' then raise exception 'Guardá esta respuesta desde su formulario.'; end if;

  perform public.revision_aplicar_deshacer(v_item);
  select to_jsonb(mm) into v_fila from public.panol_material_modelo mm
  where mm.material_id = v_item.material_id and mm.modelo = v_item.modelo and mm.variante = 'standard';

  if v_item.tipo in ('matriz', 'sin_uso') then
    if p_respuesta in ('ok', 'va') then
      null;
    elsif p_respuesta = 'cantidad' then
      v_cantidad := nullif(p_valor->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Indicá cuánto lleva cada barco.'; end if;
      if v_fila is null then raise exception 'El material ya no está en la matriz K%.', v_item.modelo; end if;
      update public.panol_material_modelo set cantidad = v_cantidad
      where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta = 'no_va' then
      delete from public.panol_material_modelo where material_id = v_item.material_id and modelo = v_item.modelo and variante = 'standard';
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta = 'otro' then
      if v_nota is null then raise exception 'Contá qué está mal.'; end if;
    else raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'falta' then
    if p_respuesta = 'agregar' then
      v_cantidad := nullif(p_valor->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then raise exception 'Indicá cuánto lleva cada barco.'; end if;
      insert into public.panol_material_modelo(material_id, modelo, variante, cantidad)
      values (v_item.material_id, v_item.modelo, 'standard', v_cantidad)
      on conflict (material_id, modelo, variante) do update set cantidad = excluded.cantidad;
      v_deshacer := jsonb_build_object('fila', v_fila);
    elsif p_respuesta <> 'no_agregar' then raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo in ('condicionante_existente', 'semana', 'etapa') then
    if p_respuesta = 'corregir' then
      if v_nota is null then raise exception 'Contá qué hay que corregir.'; end if;
    elsif p_respuesta <> 'ok' then raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'condicionante_abierto' then
    if p_respuesta = 'completo' then
      -- "Ya están todos": las preguntas que quedan se cierran solas.
      for v_rev in
        update public.revision_items set respuesta = 'cerrado', valor = jsonb_build_object('por', v_item.id),
          respondido_por = auth.uid(), respondido_at = now()
        where modelo = v_item.modelo and tipo = 'condicionante_abierto' and respuesta is null and id <> v_item.id
        returning revision_id
      loop
        perform public.revision_actualizar_avance(v_rev);
      end loop;
      v_deshacer := jsonb_build_object('cerro', true);
    elsif p_respuesta <> 'ninguno' then raise exception 'Respuesta inválida.'; end if;

  elsif v_item.tipo = 'condicionante_nuevo' then
    if p_respuesta <> 'no_aplica' then raise exception 'Respuesta inválida.'; end if;

  else
    raise exception 'Esta pregunta se responde desde su formulario.';
  end if;

  update public.revision_items set respuesta = p_respuesta, valor = p_valor, nota = v_nota,
    respondido_por = auth.uid(), respondido_at = now(), deshacer = v_deshacer
  where id = p_item returning * into v_item;
  perform public.revision_actualizar_avance(v_item.revision_id);
  return v_item;
end;
$$;
revoke all on function public.revision_responder(uuid, text, jsonb, text) from public, anon;
grant execute on function public.revision_responder(uuid, text, jsonb, text) to authenticated;

-- Definir un condicionante (nombre libre) desde la pregunta del día.
create or replace function public.revision_condicionante_guardar(p_item uuid, p_nombre text, p_tipo text,
  p_por_defecto boolean, p_items jsonb)
returns public.revision_items language plpgsql security definer set search_path = public as $$
declare
  v_item public.revision_items;
  v_cond uuid;
  v_n integer;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if v_item.tipo not in ('condicionante_nuevo', 'condicionante_abierto') then raise exception 'Esta revisión no define un condicionante.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then
    raise exception 'Sólo los dueños de la línea K% pueden definir condicionantes.', v_item.modelo;
  end if;
  if length(v_nombre) < 3 or length(v_nombre) > 120 then raise exception 'Poné un nombre de 3 a 120 letras.'; end if;
  if p_tipo not in ('opcional_estandar','configuracion','motorizacion','equipamiento','otro') then raise exception 'Elegí qué tipo de condicionante es.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un material que cambie.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where x->>'tipo_item' not in ('matriz','extra','quita')
      or nullif(x->>'cantidad','')::numeric is null or (x->>'cantidad')::numeric <= 0
      or not exists (select 1 from public.panol_materiales m where m.id = nullif(x->>'material_id','')::uuid)) then
    raise exception 'Cada material necesita producto, acción y cantidad.';
  end if;

  perform public.revision_aplicar_deshacer(v_item);
  if exists (select 1 from public.panol_matriz_condicionantes where modelo = v_item.modelo and lower(nombre) = lower(v_nombre)) then
    raise exception 'La K% ya tiene un condicionante con ese nombre.', v_item.modelo;
  end if;
  insert into public.panol_matriz_condicionantes(modelo, nombre, tipo, activo_por_defecto, activo, orden)
  values (v_item.modelo, v_nombre, p_tipo, coalesce(p_por_defecto, false), true,
    coalesce((select max(orden) + 1 from public.panol_matriz_condicionantes where modelo = v_item.modelo), 1))
  returning id into v_cond;
  insert into public.panol_matriz_condicionante_items(condicionante_id, material_id, descripcion, cantidad, unidad, tipo_item, activo, orden)
  select v_cond, m.id, m.descripcion, (x->>'cantidad')::numeric, coalesce(nullif(x->>'unidad',''), m.unidad_medida, 'unidad'), x->>'tipo_item', true, o::integer
  from jsonb_array_elements(p_items) with ordinality t(x, o) join public.panol_materiales m on m.id = (x->>'material_id')::uuid;
  get diagnostics v_n = row_count;

  update public.revision_items set respuesta = 'definido',
    valor = jsonb_build_object('condicionante_id', v_cond, 'nombre', v_nombre, 'items', v_n, 'tipo', p_tipo),
    nota = null, respondido_por = auth.uid(), respondido_at = now(),
    deshacer = jsonb_build_object('condicionante_creado', v_cond)
  where id = p_item returning * into v_item;
  perform public.revision_actualizar_avance(v_item.revision_id);
  return v_item;
end;
$$;
revoke all on function public.revision_condicionante_guardar(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.revision_condicionante_guardar(uuid, text, text, boolean, jsonb) to authenticated;

-- ── Aviso de cada día hábil a las 8 ────────────────────────────────────────
create or replace function public.revisiones_push_recordatorios(p_titulo text default 'Tu revisión de hoy', p_dia date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_hoy date := coalesce(p_dia, (now() at time zone 'America/Argentina/Buenos_Aires')::date); v_row record; v_count integer := 0;
begin
  if extract(isodow from v_hoy) > 5 then return 0; end if;
  for v_row in
    select d.user_id,
      string_agg(distinct 'K' || r.modelo, ', ') lineas,
      bool_or(r.tipo = 'inicio') inicio,
      sum(r.total - r.respondidos) filter (where r.tipo = 'productos') productos,
      bool_or(r.tipo = 'condicionante') condicionante,
      min(r.titulo) filter (where r.tipo = 'semana') semana,
      count(*) filter (where r.dia < v_hoy) atrasados
    from public.revision_duenos d
    join public.revisiones_tecnicas r on r.modelo = d.modelo and r.estado <> 'hecha' and r.dia <= v_hoy
    group by d.user_id
  loop
    v_count := v_count + public.notificaciones_push_encolar(array[v_row.user_id], null, 'revisiones',
      'revisiones-dia:' || v_hoy || ':' || md5(p_titulo),
      jsonb_build_object('title', p_titulo || ' · ' || v_row.lineas,
        'body', concat_ws(' · ',
          case when v_row.inicio then 'Primero: cuántas semanas dura la producción' end,
          case when v_row.condicionante then 'un condicionante, si se te ocurre' end,
          v_row.semana,
          case when v_row.productos > 0 then v_row.productos || ' productos de la matriz' end,
          case when v_row.atrasados > 0 then v_row.atrasados || ' pendientes de días anteriores' end),
        'url', '/revisiones', 'tag', 'revisiones-dia'),
      now() + interval '14 hours');
  end loop;
  return v_count;
end;
$$;
revoke all on function public.revisiones_push_recordatorios(text, date) from public, anon, authenticated;
grant execute on function public.revisiones_push_recordatorios(text, date) to service_role;

commit;
