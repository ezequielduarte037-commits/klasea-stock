-- Revisiones técnicas: los productos del día van correlativos por proveedor.
-- Pedido de Ezequiel: así cada jefe técnico puede abrir la lista de ese
-- proveedor y comparar de corrido. Trimer primero, después el resto según su
-- peso en la matriz, y al final lo que no tiene proveedor cargado (ahí, lo
-- importante primero y el chiquitaje al final). Un proveedor chico entra
-- entero en un día; uno grande se reparte en partes.
begin;
set local lock_timeout = '5s';

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
  v_grupo record;
  v_dia integer := 0;
  v_cuenta integer := 0;
  v_titulo text;
begin
  if p_modelo !~ '^[0-9]{2}$' then raise exception 'Modelo inválido: %', p_modelo; end if;

  create temp table if not exists tmp_rev_cand (
    flujo text, tipo text, rubro text, clave text, material_id uuid, sugerencia text, contexto jsonb, n integer,
    nivel integer, valor numeric, proveedor text, dia_idx integer
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

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, proveedor, valor, contexto)
  select 'productos', 'matriz', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
    coalesce(nullif(btrim(coalesce(pp.proveedor, m.proveedor)), ''), pv.nombre),
    coalesce(nullif(pp.precio_unitario, 0), nullif(m.precio_unitario, 0))
      * case when coalesce(pp.moneda, m.moneda) = 'USD' then 1400 else 1 end * mm.cantidad,
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
  left join public.panol_proveedores pv on pv.id = coalesce(pp.proveedor_id, m.proveedor_id)
  left join public.panol_categorias c on c.id = m.categoria_id
  where mm.modelo = p_modelo and mm.variante = 'standard' and mm.cantidad > 0;

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, proveedor, valor, contexto)
  select 'productos', 'falta', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
    coalesce(nullif(btrim(m.proveedor), ''), pv.nombre),
    nullif(m.precio_unitario, 0) * case when m.moneda = 'USD' then 1400 else 1 end * coalesce(u.cantidad_sugerida, 1),
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
  left join public.panol_proveedores pv on pv.id = m.proveedor_id
  left join public.panol_categorias c on c.id = m.categoria_id
  where not exists (select 1 from public.panol_material_modelo mm where mm.modelo = p_modelo and mm.variante = 'standard'
      and (mm.material_id = u.req or mm.producto_predeterminado_id = u.req));

  delete from tmp_rev_cand t where exists (
    select 1 from public.revision_items i where i.modelo = p_modelo and i.tipo = t.tipo and i.material_id = t.material_id);
  -- Primero lo importante (equipos y lo que más pesa por barco), después el
  -- resto, y al final las piezas chicas (broncería, abrazaderas, herrajes,
  -- tornillería, terminales, cables…) agrupadas para revisarlas de corrido.
  update tmp_rev_cand set nivel = case
    when clave ~* '(abrazader|tornill|bul[oó]n|tuerca|arandela|terminal|precinto|cinta|sellador|silicon|remache|mcodo|niple|uni[oó]n|adaptador|espiga|reducci[oó]n|cupla|mteeM|tap[oó]n|fusible|borne|conector|mcable|ficha|pasacable|prensacable|termocontra|spiral|grampa|tarugo|mclip|burlete|pegamento|adhesivo|bisagra|tirador|manija|im[aá]n|mtope|interruptor|tecla|toma ?corriente|llave de luz|caja de paso|portafusible|porta fusible|regleta|lija|thinner|catalizador|acelerador)' then 3
    when coalesce(valor, 0) >= 400000
      or rubro in ('Electrodomésticos', 'Electrónica', 'Vidrios', 'Herrería')
      or clave ~* '(motor|grupo electr|generador|aire acondicionado|parabrisas|heladera|anafe|horno|microondas|lavavajilla|bomba|tanque|termotanque|calef[oó]n|calefactor|inodoro|bacha|mesada|baranda|parrilla|h[eé]lice|mejeM|tim[oó]n|thruster|molinete|guinche|ancla|inversor|cargador|bater[ií]a|tablero|starlink|radar|plotter|gps|vhf|televisor|mtvM|audio|toldo|lona|cerramiento|cobertor|colch[oó]n|potabiliz|desalin|escotilla|ojo de buey|puerta|ventana|asiento|butaca|mmesa|piso|alfombra)' then 1
    when rubro in ('Broncería', 'A asignar', 'Herrajes') then 3
    else 2 end
  where flujo = 'productos';
  -- Correlativos por proveedor, para comparar contra la lista de cada uno:
  -- Trimer primero, después el resto según cuánto pesa en la matriz, y al final
  -- lo que no tiene proveedor cargado (ahí, lo importante primero).
  update tmp_rev_cand set contexto = contexto || jsonb_build_object('proveedor', proveedor) where flujo = 'productos';
  with q as (
    select ctid as fila, proveedor, nivel, valor, rubro, clave, tipo, material_id,
      sum(coalesce(valor, 0)) over (partition by proveedor) peso, count(*) over (partition by proveedor) cuantos
    from tmp_rev_cand where flujo = 'productos'
  ), x as (
    select fila, row_number() over (order by
      case when proveedor ~* '^\s*trimer' then 0 when proveedor is null then 2 else 1 end,
      -peso, -cuantos, proveedor,
      case when proveedor is null then nivel else 0 end,
      case when proveedor is null and nivel = 1 then -coalesce(valor, 0) else 0 end,
      rubro, clave, tipo, material_id) - 1 as n
    from q
  )
  update tmp_rev_cand t set n = x.n from x where t.ctid = x.fila;

  -- Días: un proveedor chico entra entero en un día (hasta 6 de más); uno
  -- grande se reparte en partes de p_productos.
  for v_grupo in
    select proveedor, count(*)::integer k, min(n) primero from tmp_rev_cand where flujo = 'productos'
    group by proveedor order by min(n)
  loop
    if v_grupo.k > p_productos then
      if v_cuenta > 0 then v_dia := v_dia + 1; v_cuenta := 0; end if;
      update tmp_rev_cand t set dia_idx = v_dia + (x.k / p_productos) from (
        select ctid as fila, row_number() over (order by n) - 1 as k from tmp_rev_cand
        where flujo = 'productos' and proveedor is not distinct from v_grupo.proveedor) x
      where t.ctid = x.fila;
      v_dia := v_dia + ((v_grupo.k - 1) / p_productos);
      v_cuenta := v_grupo.k - ((v_grupo.k - 1) / p_productos) * p_productos;
    else
      if v_cuenta > 0 and v_cuenta + v_grupo.k > p_productos + 6 then v_dia := v_dia + 1; v_cuenta := 0; end if;
      update tmp_rev_cand set dia_idx = v_dia where flujo = 'productos' and proveedor is not distinct from v_grupo.proveedor;
      v_cuenta := v_cuenta + v_grupo.k;
    end if;
  end loop;

  -- Tantos días como haga falta para los productos (mínimo dos semanas).
  select greatest(coalesce((select max(dia_idx) + 1 from tmp_rev_cand where flujo = 'productos'), 0), 10)::integer into v_dias;

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
      select flujo, case when flujo = 'productos' then dia_idx else n end as d,
        count(*) total, array_agg(distinct rubro) rubros, max(nivel) nivel_max, min(nivel) nivel_min
      from tmp_rev_cand group by flujo, case when flujo = 'productos' then dia_idx else n end
    )
    select l.*, h.dia from lotes l join public.revision_dias_habiles(v_desde, v_dias) h on h.n = l.d
    order by h.dia, case l.flujo when 'inicio' then 0 when 'condicionante' then 1 when 'semana' then 2 else 3 end
  loop
    v_titulo := null;
    if v_lote.flujo = 'productos' then
      -- El título dice de qué proveedor es la lista del día (o de cuáles).
      with z as (
        select t.proveedor, min(t.n) o,
          array_to_string((array_agg(distinct t.rubro))[1:2], ', ') || case when count(distinct t.rubro) > 2 then ' y más' else '' end rubros,
          v_lote.d - (select min(dia_idx) from tmp_rev_cand t2 where t2.flujo = 'productos' and t2.proveedor is not distinct from t.proveedor) + 1 parte,
          (select max(dia_idx) - min(dia_idx) + 1 from tmp_rev_cand t2 where t2.flujo = 'productos' and t2.proveedor is not distinct from t.proveedor) partes
        from tmp_rev_cand t where t.flujo = 'productos' and t.dia_idx = v_lote.d group by t.proveedor
      ), zz as (select z.*, row_number() over (order by o) pos, count(*) over () cuantos from z)
      select case
          when max(cuantos) = 1 and max(proveedor) is null then 'sin proveedor cargado: ' || max(rubros)
          when max(cuantos) = 1 then max(proveedor) || case when max(partes) > 1 then ' (' || max(parte) || ' de ' || max(partes) || ')' else '' end
          else string_agg(coalesce(proveedor, 'sin proveedor'), ', ' order by pos) filter (where pos <= 2)
            || case when max(cuantos) > 2 then ' y más' else '' end
        end into v_titulo
      from zz;
    end if;
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, dia, total)
    values (p_modelo, v_lote.flujo,
      case v_lote.flujo
        when 'productos' then 'Productos de la matriz · ' || coalesce(v_titulo, array_to_string(v_lote.rubros[1:2], ', '))
        when 'inicio' then 'Semanas de producción de la línea'
        else 'Condicionante del día'
      end,
      v_inicio + v_creados + 1, date_trunc('week', v_lote.dia)::date, v_lote.dia, v_lote.total)
    returning id into v_rev;
    insert into public.revision_items(revision_id, modelo, tipo, material_id, sugerencia, orden, contexto)
    select v_rev, p_modelo, t.tipo, t.material_id, t.sugerencia, t.n, t.contexto
    from tmp_rev_cand t
    where t.flujo = v_lote.flujo and (case when t.flujo = 'productos' then t.dia_idx else t.n end) = v_lote.d;
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

commit;
