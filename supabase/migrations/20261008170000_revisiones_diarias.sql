-- Revisiones técnicas, segunda versión: misión diaria por línea.
-- Cada día hábil el dueño de la línea tiene: 30 productos de la matriz para
-- marcar "está bien / está mal", un condicionante para definir (qué cambia si
-- la motorización es Iveco, si la grifería es negra…) y una semana del plan
-- de producción (de la -3 a la botada: etapas, tareas y materiales).
-- Elegir el producto de cada requisito queda para el final: depende del
-- cliente y se resuelve barco por barco cuando todo esté consolidado.
begin;
set local lock_timeout = '5s';

alter table public.revisiones_tecnicas add column if not exists dia date;
alter table public.revisiones_tecnicas drop constraint if exists revisiones_tecnicas_tipo_check;
alter table public.revisiones_tecnicas add constraint revisiones_tecnicas_tipo_check
  check (tipo in ('falta','producto','sin_uso','etapa','productos','condicionante','semana'));

alter table public.revision_items add column if not exists semana integer;
alter table public.revision_items add column if not exists condicionante_id uuid references public.panol_matriz_condicionantes(id) on delete cascade;
alter table public.revision_items add column if not exists sugerencia text;
alter table public.revision_items drop constraint if exists revision_items_check;
alter table public.revision_items add constraint revision_items_referencia_check
  check (num_nonnulls(material_id, linea_proceso_id, condicionante_id, semana, sugerencia) >= 1);
drop index if exists public.revision_items_unico;
create unique index if not exists revision_items_unico on public.revision_items(modelo, tipo,
  coalesce(material_id::text, linea_proceso_id::text, condicionante_id::text, semana::text, sugerencia));

-- La primera tanda (lotes semanales por tipo) no llegó a responderse: se
-- reemplaza entera. Lo respondido, si hubiera, se conserva.
delete from public.revisiones_tecnicas r
where not exists (select 1 from public.revision_items i where i.revision_id = r.id and i.respuesta is not null);
drop function if exists public.revisiones_generar(text, integer, integer);

-- Lo que suele cambiar entre barcos de una línea. Se sugiere uno por día,
-- salteando lo que la línea ya tiene definido.
create table if not exists public.revision_condicionantes_sugeridos (
  clave text primary key,
  titulo text not null,
  tipo text not null check (tipo in ('opcional_estandar','configuracion','motorizacion','equipamiento','otro')),
  pregunta text not null,
  palabras text not null,
  orden integer not null
);
alter table public.revision_condicionantes_sugeridos enable row level security;
drop policy if exists "sugeridos lectura personal" on public.revision_condicionantes_sugeridos;
create policy "sugeridos lectura personal" on public.revision_condicionantes_sugeridos for select to authenticated using (true);
revoke all on public.revision_condicionantes_sugeridos from anon, authenticated;
grant select on public.revision_condicionantes_sugeridos to authenticated;
insert into public.revision_condicionantes_sugeridos(clave, titulo, tipo, pregunta, palabras, orden) values
  ('motorizacion','Motorización','motorizacion','¿Qué cambia en la matriz según la marca y la potencia del motor?','motor|eje|volvo|iveco|cummins|mercury|fuera de borda',1),
  ('bano_negro','Grifería y accesorios de baño negros','opcional_estandar','Si el cliente elige grifería negra, ¿qué productos cambian?','negro|grifer',2),
  ('grupo','Grupo electrógeno','equipamiento','¿Qué agrega llevar grupo electrógeno, y qué cambia según la potencia?','grupo|generador',3),
  ('hard_top','Hard top','configuracion','¿Qué materiales agrega o quita el hard top?','hard ?top|techo',4),
  ('fly','Fly bridge','configuracion','¿Qué cambia si el barco lleva fly?','fly',5),
  ('aire','Aire acondicionado','equipamiento','¿Qué lleva el aire acondicionado: equipos, cañerías, tomas?','aire|clima',6),
  ('electronica','Electrónica de navegación','equipamiento','Radar, piloto automático, AIS: ¿qué agrega cada uno?','radar|piloto|ais|electr',7),
  ('teca','Teca en cockpit y plataforma','opcional_estandar','¿Qué cambia si lleva teca y dónde?','teca',8),
  ('tapizado','Tapizados y cuero','opcional_estandar','¿Qué cambia según el tapizado o el color de cuero?','tapiz|cuero',9),
  ('muebles','Madera y terminación de muebles','opcional_estandar','¿Qué productos cambian según la madera o el color de los muebles?','madera|mueble|laca',10),
  ('mesadas','Mesadas','opcional_estandar','¿Qué cambia según el material o el color de las mesadas?','mesada|marmol|mármol|dekton|silestone',11),
  ('cocina','Equipamiento de cocina','opcional_estandar','¿Qué cambia según el anafe, el horno o la heladera que elija el cliente?','cocina|anafe|horno|heladera',12),
  ('thruster','Hélice de proa o de popa','equipamiento','¿Qué agrega el bow o el stern thruster?','thruster|hélice|helice',13),
  ('plataforma','Plataforma hidráulica o tender lift','equipamiento','¿Qué agrega la plataforma o el tender lift?','plataforma|tender|lift',14),
  ('audio','Audio','equipamiento','¿Qué agrega el equipo de audio?','audio|parlante',15),
  ('starlink','Starlink y conectividad','equipamiento','¿Qué agrega Starlink: antena, router, cableado?','starlink|wifi|conectiv',16),
  ('agua','Agua dulce: potabilizador o desalinizador','equipamiento','¿Qué agrega el potabilizador o el desalinizador?','desalin|potabil|duchador|agua',17),
  ('camarotes','Distribución de camarotes','configuracion','¿Qué cambia según la distribución de los camarotes?','camarote|vestidor',18),
  ('iluminacion','Iluminación exterior o subacuática','opcional_estandar','¿Qué agrega la iluminación subacuática o la exterior extra?','ilumin|subacu|luz',19),
  ('casco','Color de casco','opcional_estandar','¿Qué cambia si el casco no es blanco?','casco|color',20),
  ('parrilla','Parrilla','opcional_estandar','¿Qué cambia según la parrilla?','parrilla',21)
on conflict (clave) do update set titulo = excluded.titulo, tipo = excluded.tipo, pregunta = excluded.pregunta,
  palabras = excluded.palabras, orden = excluded.orden;

-- Días hábiles (lunes a viernes) a partir de una fecha.
create or replace function public.revision_dias_habiles(p_desde date, p_cantidad integer)
returns table(n integer, dia date) language sql immutable as $$
  select (row_number() over (order by d) - 1)::integer, d::date
  from generate_series(p_desde, p_desde + (p_cantidad * 2 + 14), interval '1 day') d
  where extract(isodow from d) < 6
  limit greatest(p_cantidad, 0);
$$;

-- ── Generación de la misión diaria ─────────────────────────────────────────
create or replace function public.revisiones_generar_diario(p_modelo text, p_desde date default null,
  p_productos integer default 30, p_ultima_semana integer default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_linea uuid;
  v_desde date := coalesce(p_desde, date_trunc('week', (now() at time zone 'America/Argentina/Buenos_Aires') + interval '4 days')::date);
  v_fin integer;
  v_dias integer;
  v_inicio integer;
  v_lote record;
  v_rev uuid;
  v_creados integer := 0;
begin
  if p_modelo !~ '^[0-9]{2}$' then raise exception 'Modelo inválido: %', p_modelo; end if;
  select id into v_linea from public.lineas_produccion where nombre = 'K' || p_modelo and activa limit 1;

  create temp table if not exists tmp_rev_cand (
    flujo text, tipo text, rubro text, clave text, material_id uuid, condicionante_id uuid, semana integer,
    sugerencia text, contexto jsonb, n integer
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

  -- Flujo "productos": todo lo que tiene la matriz, más lo que se usa y falta.
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

  -- Flujo "condicionante": primero lo que falta definir, después revisar lo que ya hay.
  insert into tmp_rev_cand(flujo, tipo, rubro, clave, sugerencia, contexto)
  select 'condicionante', 'condicionante_nuevo', 'Condicionantes', lpad(s.orden::text, 4, '0'), s.clave,
    jsonb_build_object('titulo', s.titulo, 'tipo', s.tipo, 'pregunta', s.pregunta,
      'ejemplos', coalesce((select jsonb_agg(jsonb_build_object('linea', 'K' || c.modelo, 'nombre', c.nombre,
          'items', (select count(*) from public.panol_matriz_condicionante_items i where i.condicionante_id = c.id)))
        from public.panol_matriz_condicionantes c where c.modelo <> p_modelo and coalesce(c.activo, true) and c.nombre ~* s.palabras), '[]'::jsonb))
  from public.revision_condicionantes_sugeridos s
  where not exists (select 1 from public.panol_matriz_condicionantes c
    where c.modelo = p_modelo and coalesce(c.activo, true) and c.nombre ~* s.palabras);

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, condicionante_id, contexto)
  select 'condicionante', 'condicionante_existente', 'Condicionantes', 'z' || lpad(coalesce(c.orden, 0)::text, 4, '0') || c.nombre, c.id,
    jsonb_build_object('nombre', c.nombre, 'tipo', c.tipo, 'por_defecto', c.activo_por_defecto,
      'items', coalesce((select jsonb_agg(jsonb_build_object('accion', i.tipo_item,
          'descripcion', coalesce(m.descripcion, i.descripcion), 'cantidad', i.cantidad, 'unidad', coalesce(i.unidad, m.unidad_medida)) order by i.orden)
        from public.panol_matriz_condicionante_items i left join public.panol_materiales m on m.id = i.material_id
        where i.condicionante_id = c.id and coalesce(i.activo, true)), '[]'::jsonb))
  from public.panol_matriz_condicionantes c
  where c.modelo = p_modelo and coalesce(c.activo, true);

  -- Flujo "semana": de la -3 a la botada.
  select coalesce(p_ultima_semana, (select ceil(semanas_produccion_estimadas)::integer from public.lineas_produccion where id = v_linea),
    (select max(f.semanas + greatest(ceil(coalesce(p.dias_estimados, 5) / 5.0), 1) - 1)::integer
       from public.linea_procesos p join public.fechas_offsets f on f.modelo = '*' and f.evento_key = 'linea_proceso:' || p.id
       where p.linea_id = v_linea and p.activo), 20)
    into v_fin;
  v_fin := greatest(v_fin, 4);
  insert into tmp_rev_cand(flujo, tipo, rubro, clave, semana, contexto)
  select 'semana', 'semana', 'Plan', lpad((w + 10)::text, 4, '0'), w, jsonb_build_object('semana', w, 'ultima', v_fin)
  from generate_series(-3, v_fin) w;

  delete from tmp_rev_cand t where exists (
    select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = t.tipo
      and coalesce(i.material_id::text, i.linea_proceso_id::text, i.condicionante_id::text, i.semana::text, i.sugerencia)
        = coalesce(t.material_id::text, t.condicionante_id::text, t.semana::text, t.sugerencia));

  update tmp_rev_cand t set n = x.n from (
    select ctid as fila, row_number() over (partition by flujo order by rubro, clave, tipo, coalesce(material_id::text, condicionante_id::text, semana::text, sugerencia)) - 1 as n
    from tmp_rev_cand) x
  where t.ctid = x.fila;

  select greatest(
    coalesce((select ceil(count(*)::numeric / greatest(p_productos, 5)) from tmp_rev_cand where flujo = 'productos'), 0),
    coalesce((select count(*) from tmp_rev_cand where flujo = 'condicionante'), 0),
    coalesce((select count(*) from tmp_rev_cand where flujo = 'semana'), 0))::integer into v_dias;
  select coalesce(max(orden), 0) into v_inicio from public.revisiones_tecnicas where modelo = p_modelo;

  for v_lote in
    with lotes as (
      select flujo, case when flujo = 'productos' then n / greatest(p_productos, 5) else n end as d,
        count(*) total, array_agg(distinct rubro) rubros, min(contexto->>'titulo') titulo_c, min(contexto->>'nombre') nombre_c,
        min(semana) semana_n, min(tipo) tipo_min, max(tipo) tipo_max
      from tmp_rev_cand group by flujo, case when flujo = 'productos' then n / greatest(p_productos, 5) else n end
    )
    select l.*, h.dia from lotes l join public.revision_dias_habiles(v_desde, v_dias) h on h.n = l.d
    order by h.dia, case l.flujo when 'productos' then 1 when 'condicionante' then 2 else 3 end
  loop
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, dia, total)
    values (p_modelo, v_lote.flujo,
      case v_lote.flujo
        when 'productos' then 'Productos de la matriz · ' || array_to_string(v_lote.rubros[1:2], ', ')
          || case when cardinality(v_lote.rubros) > 2 then ' y más' else '' end
        when 'condicionante' then case when v_lote.tipo_min = 'condicionante_nuevo' then 'Definir: ' || v_lote.titulo_c
          else 'Revisar: ' || v_lote.nombre_c end
        else case when v_lote.semana_n = 0 then 'Semana 0 · desmolde' when v_lote.semana_n = v_fin then 'Semana ' || v_lote.semana_n || ' · botada'
          else 'Semana ' || v_lote.semana_n || ' del plan' end
      end,
      v_inicio + v_creados + 1, date_trunc('week', v_lote.dia)::date, v_lote.dia, v_lote.total)
    returning id into v_rev;

    insert into public.revision_items(revision_id, modelo, tipo, material_id, condicionante_id, semana, sugerencia, orden, contexto)
    select v_rev, p_modelo, t.tipo, t.material_id, t.condicionante_id, t.semana, t.sugerencia, t.n, t.contexto
    from tmp_rev_cand t
    where t.flujo = v_lote.flujo and (case when t.flujo = 'productos' then t.n / greatest(p_productos, 5) else t.n end) = v_lote.d;
    v_creados := v_creados + 1;
  end loop;
  return v_creados;
end;
$$;
revoke all on function public.revisiones_generar_diario(text, date, integer, integer) from public, anon, authenticated;
grant execute on function public.revisiones_generar_diario(text, date, integer, integer) to service_role;

-- ── Deshacer ───────────────────────────────────────────────────────────────
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
  if v ? 'condicionante_creado' then
    delete from public.panol_matriz_condicionantes where id = (v->>'condicionante_creado')::uuid;
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
begin
  select * into v_item from public.revision_items where id = p_item for update;
  if not found then raise exception 'La revisión ya no existe.'; end if;
  if not public.revision_es_dueno(v_item.modelo) then
    raise exception 'Sólo los dueños de la línea K% pueden responder esta revisión.', v_item.modelo;
  end if;
  if v_nota is not null and length(v_nota) > 1000 then raise exception 'La nota es demasiado larga.'; end if;
  if v_item.tipo = 'condicionante_nuevo' and p_respuesta = 'definido' then
    raise exception 'Guardá el condicionante desde su formulario.';
  end if;

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

  elsif v_item.tipo = 'condicionante_nuevo' then
    if p_respuesta <> 'no_aplica' then raise exception 'Respuesta inválida.'; end if;

  else
    raise exception 'Este tipo de revisión ya no se responde desde acá.';
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

-- Definir un condicionante nuevo desde la revisión del día.
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
  if v_item.tipo <> 'condicionante_nuevo' then raise exception 'Esta revisión no define un condicionante.'; end if;
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
  if exists (select 1 from public.panol_matriz_condicionantes where modelo = v_item.modelo and lower(nombre) = lower(v_nombre)) then
    raise exception 'La K% ya tiene un condicionante con ese nombre.', v_item.modelo;
  end if;

  perform public.revision_aplicar_deshacer(v_item);
  insert into public.panol_matriz_condicionantes(modelo, nombre, tipo, descripcion, activo_por_defecto, activo, orden)
  values (v_item.modelo, v_nombre, p_tipo, v_item.contexto->>'pregunta', coalesce(p_por_defecto, false), true,
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

-- Plan por semanas: ubicar una etapa y asignarle materiales (como en Obras ›
-- Configuración, pero sólo para los dueños de la línea).
create or replace function public.revision_etapa_dueno(p_etapa uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_modelo text;
begin
  select substring(l.nombre from '^K([0-9]{2})$') into v_modelo
  from public.linea_procesos p join public.lineas_produccion l on l.id = p.linea_id where p.id = p_etapa;
  if v_modelo is null then raise exception 'La etapa no existe.'; end if;
  if not public.revision_es_dueno(v_modelo) then raise exception 'Sólo los dueños de la línea K% pueden cambiar su plan.', v_modelo; end if;
  return v_modelo;
end;
$$;
revoke all on function public.revision_etapa_dueno(uuid) from public, anon, authenticated;

create or replace function public.revision_etapa_ajustar(p_etapa uuid, p_semanas numeric, p_dias numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.revision_etapa_dueno(p_etapa);
  if p_dias is not null and (p_dias <= 0 or p_dias > 365) then raise exception 'Los días tienen que estar entre 1 y 365.'; end if;
  if p_semanas is not null and abs(p_semanas) > 104 then raise exception 'La semana tiene que estar a menos de dos años del desmolde.'; end if;
  if p_semanas is not null then
    insert into public.fechas_offsets(evento_key, modelo, semanas, referencia, updated_at)
    values ('linea_proceso:' || p_etapa, '*', p_semanas, 'desmolde', now())
    on conflict (evento_key, modelo) do update set semanas = excluded.semanas, referencia = 'desmolde', updated_at = now();
  end if;
  if p_dias is not null then update public.linea_procesos set dias_estimados = p_dias where id = p_etapa; end if;
end;
$$;
revoke all on function public.revision_etapa_ajustar(uuid, numeric, numeric) from public, anon;
grant execute on function public.revision_etapa_ajustar(uuid, numeric, numeric) to authenticated;

create or replace function public.revision_etapa_material(p_etapa uuid, p_material uuid, p_quitar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_modelo text; v_cantidad numeric; v_unidad text;
begin
  v_modelo := public.revision_etapa_dueno(p_etapa);
  if p_quitar then
    delete from public.linea_proceso_materiales where linea_proceso_id = p_etapa and material_id = p_material;
    return;
  end if;
  select mm.cantidad, m.unidad_medida into v_cantidad, v_unidad
  from public.panol_material_modelo mm join public.panol_materiales m on m.id = mm.material_id
  where mm.material_id = p_material and mm.modelo = v_modelo and mm.variante = 'standard';
  if v_cantidad is null then raise exception 'Ese material no está en la matriz K%.', v_modelo; end if;
  insert into public.linea_proceso_materiales(linea_proceso_id, material_id, cantidad, unidad, orden)
  values (p_etapa, p_material, v_cantidad, v_unidad,
    coalesce((select max(orden) + 1 from public.linea_proceso_materiales where linea_proceso_id = p_etapa), 0))
  on conflict (linea_proceso_id, material_id) do nothing;
end;
$$;
revoke all on function public.revision_etapa_material(uuid, uuid, boolean) from public, anon;
grant execute on function public.revision_etapa_material(uuid, uuid, boolean) to authenticated;

-- ── Liberar: nada marcado "está mal" o "a corregir" sin resolver ───────────
create or replace function public.revision_liberar(p_modelo text, p_nota text default null)
returns public.revision_liberaciones language plpgsql security definer set search_path = public as $$
declare v_lib public.revision_liberaciones; v_faltan integer; v_corregir integer; v_quien text;
begin
  if not public.revision_es_dueno(p_modelo) then raise exception 'Sólo los dueños de la línea K% pueden liberarla.', p_modelo; end if;
  select count(*) filter (where respuesta is null), count(*) filter (where respuesta in ('corregir','otro'))
    into v_faltan, v_corregir from public.revision_items where modelo = p_modelo;
  if v_faltan > 0 then raise exception 'Faltan % respuestas para liberar la K%.', v_faltan, p_modelo; end if;
  if v_corregir > 0 then raise exception 'Hay % cosas marcadas para corregir: resolvelas y marcalas como bien.', v_corregir; end if;
  update public.revision_liberaciones set vigente = false where modelo = p_modelo and vigente;
  insert into public.revision_liberaciones(modelo, liberada_por, nota)
  values (p_modelo, auth.uid(), nullif(btrim(coalesce(p_nota, '')), '')) returning * into v_lib;
  select username into v_quien from public.profiles where id = auth.uid();
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

-- ── Aviso de cada día hábil a las 8 ────────────────────────────────────────
drop function if exists public.revisiones_push_recordatorios(text, date);
create or replace function public.revisiones_push_recordatorios(p_titulo text default 'Tu revisión de hoy', p_dia date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_hoy date := coalesce(p_dia, (now() at time zone 'America/Argentina/Buenos_Aires')::date); v_row record; v_count integer := 0;
begin
  if extract(isodow from v_hoy) > 5 then return 0; end if;
  for v_row in
    select d.user_id,
      string_agg(distinct 'K' || r.modelo, ', ') lineas,
      sum(r.total - r.respondidos) filter (where r.tipo = 'productos') productos,
      min(r.titulo) filter (where r.tipo = 'condicionante') condicionante,
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
          case when v_row.productos > 0 then v_row.productos || ' productos' end,
          v_row.condicionante, v_row.semana,
          case when v_row.atrasados > 0 then v_row.atrasados || ' pendientes de días anteriores' end),
        'url', '/revisiones', 'tag', 'revisiones-dia'),
      now() + interval '14 hours');
  end loop;
  return v_count;
end;
$$;
revoke all on function public.revisiones_push_recordatorios(text, date) from public, anon, authenticated;
grant execute on function public.revisiones_push_recordatorios(text, date) to service_role;

do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('klasea-revisiones-recordatorio', '0 11 * * 1-5', 'select public.revisiones_push_recordatorios()');
  end if;
end $$;

commit;
