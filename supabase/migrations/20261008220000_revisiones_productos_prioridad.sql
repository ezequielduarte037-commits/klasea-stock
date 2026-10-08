-- Revisiones técnicas: los 30 productos del día arrancan por lo importante.
-- Pedido de Ezequiel: primero lo que más pesa (equipos, lo más caro por
-- barco), y al final el chiquitaje (broncería, abrazaderas, herrajes,
-- tornillería, terminales, cables…), agrupado para revisarlo de corrido.
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
begin
  if p_modelo !~ '^[0-9]{2}$' then raise exception 'Modelo inválido: %', p_modelo; end if;

  create temp table if not exists tmp_rev_cand (
    flujo text, tipo text, rubro text, clave text, material_id uuid, sugerencia text, contexto jsonb, n integer,
    nivel integer, valor numeric
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

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, valor, contexto)
  select 'productos', 'matriz', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
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
  left join public.panol_categorias c on c.id = m.categoria_id
  where mm.modelo = p_modelo and mm.variante = 'standard' and mm.cantidad > 0;

  insert into tmp_rev_cand(flujo, tipo, rubro, clave, material_id, valor, contexto)
  select 'productos', 'falta', coalesce(c.nombre, 'Sin rubro'), m.descripcion, m.id,
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
  update tmp_rev_cand t set n = x.n from (
    select ctid as fila, row_number() over (order by nivel,
      case when nivel = 1 then -coalesce(valor, 0) else 0 end, rubro,
      case when nivel = 2 then -coalesce(valor, 0) else 0 end, clave, tipo, material_id) - 1 as n
    from tmp_rev_cand) x
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
        count(*) total, array_agg(distinct rubro) rubros, max(nivel) nivel_max, min(nivel) nivel_min
      from tmp_rev_cand group by flujo, case when flujo = 'productos' then n / greatest(p_productos, 5) else n end
    )
    select l.*, h.dia from lotes l join public.revision_dias_habiles(v_desde, v_dias) h on h.n = l.d
    order by h.dia, case l.flujo when 'inicio' then 0 when 'condicionante' then 1 when 'semana' then 2 else 3 end
  loop
    insert into public.revisiones_tecnicas(modelo, tipo, titulo, orden, semana, dia, total)
    values (p_modelo, v_lote.flujo,
      case v_lote.flujo
        when 'productos' then 'Productos de la matriz · ' || case
          when v_lote.nivel_max = 1 then 'lo más importante'
          when v_lote.nivel_min = 3 then 'piezas chicas: ' || array_to_string(v_lote.rubros[1:2], ', ')
            || case when cardinality(v_lote.rubros) > 2 then ' y más' else '' end
          else array_to_string(v_lote.rubros[1:2], ', ') || case when cardinality(v_lote.rubros) > 2 then ' y más' else '' end end
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

commit;
