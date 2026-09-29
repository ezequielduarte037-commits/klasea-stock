-- Aplicar después de desplegar el código que consume estas sustituciones.
-- K52: el requisito genérico permanece como identidad histórica, pero la
-- terminación estándar visible/comprable es cromada. El opcional negro la
-- sustituye en la aplicación usando las dos variantes vinculadas.

create table if not exists public.k52_epuyen_matriz_backup_20260928 as
select mm.* from public.panol_material_modelo mm
where regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
  and mm.material_id in (
    'ad170c62-bcdb-42b6-8674-8a016ef23e92',
    '02646402-69fa-4d8a-8db8-8c621473630d',
    'd3a7e58e-7f9a-4568-b70e-281cb1665fbd',
    '08151045-25ca-458b-8cbd-21b4f3110163',
    '8eecd0a2-01c2-4f9d-b192-ab74d0769acc',
    '09ff32da-b4ea-41b1-a229-bccbc402b29a',
    'b321889e-ec8c-460f-b325-9a14cce2e24c'
  );

create table if not exists public.k52_epuyen_snapshots_backup_20260928 as
select s.* from public.panol_obra_materiales_snapshot s
join public.produccion_obras o on o.id = s.obra_id
where regexp_replace(upper(o.linea_nombre), '[^0-9]', '', 'g') = '52'
  and coalesce(s.requisito_material_id, s.material_id) in (
    'ad170c62-bcdb-42b6-8674-8a016ef23e92',
    '02646402-69fa-4d8a-8db8-8c621473630d',
    'd3a7e58e-7f9a-4568-b70e-281cb1665fbd',
    '08151045-25ca-458b-8cbd-21b4f3110163',
    '8eecd0a2-01c2-4f9d-b192-ab74d0769acc',
    '09ff32da-b4ea-41b1-a229-bccbc402b29a',
    'b321889e-ec8c-460f-b325-9a14cce2e24c'
  );

alter table public.k52_epuyen_matriz_backup_20260928 enable row level security;
alter table public.k52_epuyen_snapshots_backup_20260928 enable row level security;
revoke all on public.k52_epuyen_matriz_backup_20260928 from anon, authenticated;
revoke all on public.k52_epuyen_snapshots_backup_20260928 from anon, authenticated;

do $$
declare
  v_row record;
  v_cromado uuid;
  v_negro uuid;
  v_cuenta integer;
  v_condicionante uuid;
begin
  select count(*), (array_agg(id))[1] into v_cuenta, v_condicionante
  from public.panol_matriz_condicionantes
  where regexp_replace(upper(modelo), '[^0-9]', '', 'g') = '52'
    and lower(nombre) = lower('Elementos de baño NEGRO') and activo is true;
  if v_cuenta <> 1 then
    raise exception 'Se esperaba un único condicionante K52 Elementos de baño NEGRO; hay %', v_cuenta;
  end if;

  for v_row in
    select * from (values
      ('ad170c62-bcdb-42b6-8674-8a016ef23e92'::uuid, '0411.04/L2', 1),
      ('02646402-69fa-4d8a-8db8-8c621473630d'::uuid, '0106/L2', 2),
      ('d3a7e58e-7f9a-4568-b70e-281cb1665fbd'::uuid, '0206/L2', 2),
      ('08151045-25ca-458b-8cbd-21b4f3110163'::uuid, '0166/L2', 2),
      ('8eecd0a2-01c2-4f9d-b192-ab74d0769acc'::uuid, '0167/L2', 2),
      ('09ff32da-b4ea-41b1-a229-bccbc402b29a'::uuid, '0163/L2', 1),
      ('b321889e-ec8c-460f-b325-9a14cce2e24c'::uuid, '0164/L2', 1)
    ) as x(requisito_id, modelo_producto, cantidad)
  loop
    select count(*), (array_agg(id))[1] into v_cuenta, v_cromado
    from public.panol_materiales
    where activo is distinct from false and id <> v_row.requisito_id
      and descripcion ilike '%' || v_row.modelo_producto || '%'
      and descripcion ilike '%cromado%';
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: se esperaba un producto cromado inequívoco; hay %', v_row.modelo_producto, v_cuenta;
    end if;

    select count(*) into v_cuenta
    from public.panol_material_modelo
    where material_id = v_row.requisito_id
      and regexp_replace(upper(modelo), '[^0-9]', '', 'g') = '52'
      and coalesce(variante, 'standard') = 'standard'
      and cantidad = 1
      and (producto_predeterminado_id is null or producto_predeterminado_id = v_cromado);
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: la fila matriz ya cambió; no se modifica automáticamente', v_row.modelo_producto;
    end if;

    insert into public.panol_requisito_productos
      (requisito_material_id, producto_material_id, origen, activo)
    values (v_row.requisito_id, v_cromado, 'manual', true)
    on conflict (requisito_material_id, producto_material_id)
    do update set activo = true;

    if v_row.modelo_producto <> '0411.04/L2' then
      select count(*) into v_cuenta
      from public.panol_matriz_condicionante_items i
      where i.condicionante_id = v_condicionante and i.activo is true
        and i.tipo_item = 'quita' and i.material_id = v_cromado
        and i.cantidad = v_row.cantidad;
      if v_cuenta <> 1 then
        raise exception 'K52 Epuyén %: la resta cromada no coincide con la matriz', v_row.modelo_producto;
      end if;
      select count(distinct i.material_id), (array_agg(distinct i.material_id))[1]
        into v_cuenta, v_negro
      from public.panol_matriz_condicionante_items i
      join public.panol_materiales m on m.id = i.material_id
      where i.condicionante_id = v_condicionante
        and i.activo is true and i.tipo_item <> 'quita'
        and i.cantidad = v_row.cantidad
        and m.descripcion ilike '%' || v_row.modelo_producto || '%'
        and m.descripcion ilike '%negro%';
      if v_cuenta <> 1 then
        raise exception 'K52 Epuyén %: opción negra ambigua o ausente (% productos)', v_row.modelo_producto, v_cuenta;
      end if;
      insert into public.panol_requisito_productos
        (requisito_material_id, producto_material_id, origen, activo)
      values (v_row.requisito_id, v_negro, 'manual', true)
      on conflict (requisito_material_id, producto_material_id)
      do update set activo = true;
    end if;
  end loop;
end $$;

-- El trigger antiguo igualaba la cantidad incluso en pedidos ya realizados.
-- Esta operación sólo actualiza la matriz y los pendientes sin movimientos.
alter table public.panol_material_modelo disable trigger trg_panol_material_modelo_sync_obras;

update public.panol_material_modelo mm
set cantidad = v.cantidad, producto_predeterminado_id = m.id
from (values
  ('ad170c62-bcdb-42b6-8674-8a016ef23e92'::uuid, '0411.04/L2', 1),
  ('02646402-69fa-4d8a-8db8-8c621473630d'::uuid, '0106/L2', 2),
  ('d3a7e58e-7f9a-4568-b70e-281cb1665fbd'::uuid, '0206/L2', 2),
  ('08151045-25ca-458b-8cbd-21b4f3110163'::uuid, '0166/L2', 2),
  ('8eecd0a2-01c2-4f9d-b192-ab74d0769acc'::uuid, '0167/L2', 2),
  ('09ff32da-b4ea-41b1-a229-bccbc402b29a'::uuid, '0163/L2', 1),
  ('b321889e-ec8c-460f-b325-9a14cce2e24c'::uuid, '0164/L2', 1)
) as v(requisito_id, modelo_producto, cantidad)
join public.panol_materiales m
  on m.id <> v.requisito_id and m.activo is distinct from false
 and m.descripcion ilike '%' || v.modelo_producto || '%'
 and m.descripcion ilike '%cromado%'
where mm.material_id = v.requisito_id
  and regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
  and coalesce(mm.variante, 'standard') = 'standard';

alter table public.panol_material_modelo enable trigger trg_panol_material_modelo_sync_obras;

update public.panol_obra_materiales_snapshot s
set cantidad = 2, updated_at = now()
from public.produccion_obras o
where o.id = s.obra_id
  and regexp_replace(upper(o.linea_nombre), '[^0-9]', '', 'g') = '52'
  and coalesce(s.requisito_material_id, s.material_id) in (
    '02646402-69fa-4d8a-8db8-8c621473630d',
    'd3a7e58e-7f9a-4568-b70e-281cb1665fbd',
    '08151045-25ca-458b-8cbd-21b4f3110163',
    '8eecd0a2-01c2-4f9d-b192-ab74d0769acc'
  )
  and lower(coalesce(s.source, 'matriz')) = 'matriz'
  and lower(coalesce(s.tipo, 'base')) not in ('addon', 'adicional', 'opcional')
  and lower(coalesce(s.estado, 'pendiente')) = 'pendiente'
  and s.purchase_request_id is null and s.purchase_request_item_id is null
  and s.panol_envio_id is null and s.panol_envio_item_id is null
  and coalesce(s.cantidad_egresada, 0) = 0
  and s.recepcion_estado is null
  and s.cantidad is distinct from 2;
