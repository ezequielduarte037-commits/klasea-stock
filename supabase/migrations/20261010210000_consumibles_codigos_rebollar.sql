-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: el código de cada producto es el de Rebollar (criterio de
-- Ezequiel, 10/10/2026), más dos cierres de la revisión del mostrador.
--
--   1. El código de etiqueta y el código del material pasan a ser el de la
--      lista de Rebollar (M0047, PARFIJ0016…). El KA queda solo para lo que no
--      viene de Rebollar ("otro proveedor"). Los códigos viejos del pañol (32,
--      como "1112" de la mecha de 8) pasan a códigos de barras adicionales:
--      una etiqueta vieja pegada en una caja se sigue leyendo.
--   2. Cupo diario validado en la base: con el candado por material, dos
--      equipos no pueden aprobar el mismo saldo. Pasarse no bloquea (como en
--      la pantalla): la fila queda marcada fuera_cupo.
--   3. La cola sin conexión del mostrador conserva la hora real del retiro
--      hasta 72 h (cubre un fin de semana sin red); más vieja, se registra
--      ahora y queda anotado.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Códigos de Rebollar ──────────────────────────────────────────────────

insert into public.panol_material_codigos_barra (material_id, codigo, etiqueta, activo)
select m.id, upper(btrim(m.codigo)), 'codigo-anterior', true
  from public.panol_materiales m
  join public.consumibles_config c on c.material_id = m.id
 where m.es_consumible
   and m.activo is distinct from false
   and c.proveedor_nombre = 'Rebollar'
   and c.proveedor_codigo is not null
   and nullif(btrim(m.codigo), '') is not null
   and upper(btrim(m.codigo)) <> upper(c.proveedor_codigo)
   and not exists (
     select 1 from public.panol_material_codigos_barra b
      where b.material_id = m.id and upper(b.codigo) = upper(btrim(m.codigo))
   );

update public.panol_materiales m
   set codigo = c.proveedor_codigo
  from public.consumibles_config c
 where c.material_id = m.id
   and m.es_consumible
   and m.activo is distinct from false
   and c.proveedor_nombre = 'Rebollar'
   and c.proveedor_codigo is not null
   and m.codigo is distinct from c.proveedor_codigo;

update public.consumibles_config c
   set codigo_etiqueta = c.proveedor_codigo
  from public.panol_materiales m
 where m.id = c.material_id
   and m.es_consumible
   and m.activo is distinct from false
   and c.proveedor_nombre = 'Rebollar'
   and c.proveedor_codigo is not null
   and c.codigo_etiqueta is distinct from c.proveedor_codigo;

-- La secuencia KA sigue para los de otro proveedor, después del último usado.
select setval(
  'public.consumibles_codigo_seq',
  greatest(650, (select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) + 1 from public.consumibles_config)),
  false
);

-- ── 2 y 3. Trigger que completa cada movimiento ─────────────────────────────

create or replace function public.consumibles_movimiento_completar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_emp record;
  v_costo numeric;
  v_cupo numeric;
  v_hoy numeric;
  v_dia_desde timestamptz;
  v_desde_app boolean := current_user in ('authenticated', 'anon');
begin
  perform pg_advisory_xact_lock(hashtext('consumibles:' || new.material_id::text || ':' || new.sede));

  if v_desde_app then
    -- La cola sin conexión del mostrador manda la hora real del retiro. Se
    -- acepta hasta 72 h atrás; más vieja, se registra ahora y se anota.
    if new.created_at is null or new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    elsif new.created_at < now() - interval '72 hours' then
      new.nota := concat_ws(' · ', nullif(new.nota, ''),
        'Hora real ' || to_char(new.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ', registrado tarde');
      new.created_at := now();
    end if;
    new.created_by := auth.uid();
  else
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  -- El costo de un retiro o una devolución es el vigente; el de un ingreso
  -- puede venir de la factura.
  select c.costo_unitario_ars, c.cupo_diario into v_costo, v_cupo
    from public.consumibles_config c
   where c.material_id = new.material_id;
  if new.tipo <> 'ingreso' and v_desde_app then
    new.costo_unitario_ars := v_costo;
  else
    new.costo_unitario_ars := coalesce(new.costo_unitario_ars, v_costo);
  end if;

  -- Nombre y DNI salen siempre de RRHH cuando hay empleado.
  if new.empleado_id is not null then
    select d.nombre, d.dni into v_emp from public.consumibles_datos_empleado(new.empleado_id) d;
    if v_emp.nombre is not null then
      new.empleado_nombre := v_emp.nombre;
      new.empleado_dni := v_emp.dni;
    end if;
  end if;

  -- Cupo diario por persona y producto, en el día de Argentina del retiro.
  -- Con el candado de arriba, el saldo que se lee es el que vale.
  if new.tipo = 'retiro' and new.empleado_id is not null and v_cupo is not null and not new.fuera_cupo then
    v_dia_desde := date_trunc('day', new.created_at at time zone 'America/Argentina/Buenos_Aires')
                   at time zone 'America/Argentina/Buenos_Aires';
    select coalesce(sum(-m.cantidad), 0) into v_hoy
      from public.consumibles_movimientos m
     where m.empleado_id = new.empleado_id
       and m.material_id = new.material_id
       and m.tipo = 'retiro'
       and m.anulado_at is null
       and m.created_at >= v_dia_desde
       and m.created_at < v_dia_desde + interval '1 day';
    if v_hoy + abs(new.cantidad) > v_cupo then
      new.fuera_cupo := true;
    end if;
  end if;

  return new;
end;
$$;

commit;
