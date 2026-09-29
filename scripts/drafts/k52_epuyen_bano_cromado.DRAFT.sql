-- Aplicar después del código de sustitución de productos del condicionante.
-- Sólo los seis artículos de baño. La cocina 0411.04/L2 queda fuera: su
-- requisito ya se llama CROMADO y no tiene un SKU cromado separado.
-- Transacción explícita: si falla una validación, tampoco queda deshabilitado
-- el trigger de sincronización de cantidades.
begin;

create temporary table k52_epuyen_bano_mapeo (
  requisito_id uuid primary key,
  cromado_id uuid not null,
  modelo_producto text not null,
  cantidad numeric not null
) on commit drop;

insert into k52_epuyen_bano_mapeo values
  ('02646402-69fa-4d8a-8db8-8c621473630d', '19d58e7d-a1fb-4515-8a0e-b8579c1da833', '0106/L2', 2),
  ('d3a7e58e-7f9a-4568-b70e-281cb1665fbd', 'c4f89e09-4a7c-4059-8632-2e3a0eac076a', '0206/L2', 2),
  ('08151045-25ca-458b-8cbd-21b4f3110163', '36bf9443-a1b3-4392-97c4-b2e9f1cbefbf', '0166/L2', 2),
  ('8eecd0a2-01c2-4f9d-b192-ab74d0769acc', 'd1bcba4c-0015-409b-b91f-ea6c559b0303', '0167/L2', 2),
  ('09ff32da-b4ea-41b1-a229-bccbc402b29a', '4f31f444-aaf6-4401-afdd-cba7e41e9bff', '0163/L2', 1),
  ('b321889e-ec8c-460f-b325-9a14cce2e24c', 'e297f845-f1ef-41c3-83d2-adcf9e351625', '0164/L2', 1);

do $$
declare
  v record;
  v_condicionante uuid;
  v_negro uuid;
  v_cuenta integer;
begin
  select count(*), (array_agg(id))[1] into v_cuenta, v_condicionante
  from public.panol_matriz_condicionantes
  where regexp_replace(upper(modelo), '[^0-9]', '', 'g') = '52'
    and lower(nombre) = lower('Elementos de baño NEGRO') and activo is true;
  if v_cuenta <> 1 then
    raise exception 'K52: se esperaba un único condicionante Elementos de baño NEGRO; hay %', v_cuenta;
  end if;

  for v in select * from k52_epuyen_bano_mapeo loop
    select count(*) into v_cuenta
    from public.panol_materiales requisito
    join public.panol_materiales cromado on cromado.id = v.cromado_id
    where requisito.id = v.requisito_id
      and requisito.es_requisito is true
      and requisito.activo is distinct from false
      and cromado.es_requisito is false
      and cromado.activo is distinct from false
      and requisito.descripcion ilike '%' || v.modelo_producto || '%'
      and cromado.descripcion ilike '%' || v.modelo_producto || '%'
      and cromado.descripcion ilike '%cromado%';
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: identidad requisito/cromado cambió', v.modelo_producto;
    end if;

    select count(*) into v_cuenta
    from public.panol_material_modelo mm
    where mm.material_id = v.requisito_id
      and regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
      and coalesce(mm.variante, 'standard') = 'standard'
      and mm.cantidad = 1
      and (mm.producto_predeterminado_id is null or mm.producto_predeterminado_id = v.cromado_id);
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: la matriz cambió; no se sobrescribe', v.modelo_producto;
    end if;

    select count(*) into v_cuenta
    from public.panol_material_modelo mm
    where mm.material_id = v.cromado_id
      and regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
      and coalesce(mm.variante, 'standard') = 'standard'
      and mm.cantidad > 0;
    if v_cuenta <> 0 then
      raise exception 'K52 Epuyén %: el cromado ya figura como otra fila de matriz', v.modelo_producto;
    end if;

    select count(*) into v_cuenta
    from public.panol_matriz_condicionante_items i
    where i.condicionante_id = v_condicionante and i.activo is true
      and i.tipo_item = 'quita' and i.material_id = v.cromado_id
      and i.cantidad = v.cantidad;
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: resta cromada distinta de %', v.modelo_producto, v.cantidad;
    end if;

    select count(*), (array_agg(i.material_id))[1] into v_cuenta, v_negro
    from public.panol_matriz_condicionante_items i
    join public.panol_materiales negro on negro.id = i.material_id
    where i.condicionante_id = v_condicionante and i.activo is true
      and i.tipo_item <> 'quita' and i.cantidad = v.cantidad
      and negro.es_requisito is false and negro.activo is distinct from false
      and negro.descripcion ilike '%' || v.modelo_producto || '%'
      and negro.descripcion ilike '%negro%';
    if v_cuenta <> 1 then
      raise exception 'K52 Epuyén %: opción negra ambigua o ausente (%)', v.modelo_producto, v_cuenta;
    end if;
  end loop;
end $$;

-- Respaldo antes de escribir. Sólo las seis familias K52 afectadas.
create table if not exists public.k52_epuyen_bano_matriz_backup_20260928 as
select mm.* from public.panol_material_modelo mm
join k52_epuyen_bano_mapeo v on v.requisito_id = mm.material_id
where regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52';

create table if not exists public.k52_epuyen_bano_snapshots_backup_20260928 as
select s.* from public.panol_obra_materiales_snapshot s
join public.produccion_obras o on o.id = s.obra_id
join k52_epuyen_bano_mapeo v on v.requisito_id = coalesce(s.requisito_material_id, s.material_id)
where regexp_replace(upper(o.linea_nombre), '[^0-9]', '', 'g') = '52';

create table if not exists public.k52_epuyen_bano_links_backup_20260928 as
select rp.* from public.panol_requisito_productos rp
join k52_epuyen_bano_mapeo v on v.requisito_id = rp.requisito_material_id;

alter table public.k52_epuyen_bano_matriz_backup_20260928 enable row level security;
alter table public.k52_epuyen_bano_snapshots_backup_20260928 enable row level security;
alter table public.k52_epuyen_bano_links_backup_20260928 enable row level security;
revoke all on public.k52_epuyen_bano_matriz_backup_20260928 from anon, authenticated;
revoke all on public.k52_epuyen_bano_snapshots_backup_20260928 from anon, authenticated;
revoke all on public.k52_epuyen_bano_links_backup_20260928 from anon, authenticated;

insert into public.panol_requisito_productos
  (requisito_material_id, producto_material_id, origen, activo)
select requisito_id, cromado_id, 'manual', true from k52_epuyen_bano_mapeo
on conflict (requisito_material_id, producto_material_id)
do update set activo = true;

insert into public.panol_requisito_productos
  (requisito_material_id, producto_material_id, origen, activo)
select v.requisito_id, i.material_id, 'manual', true
from k52_epuyen_bano_mapeo v
join public.panol_matriz_condicionantes c
  on regexp_replace(upper(c.modelo), '[^0-9]', '', 'g') = '52'
 and lower(c.nombre) = lower('Elementos de baño NEGRO') and c.activo is true
join public.panol_matriz_condicionante_items i
  on i.condicionante_id = c.id and i.activo is true
 and i.tipo_item <> 'quita' and i.cantidad = v.cantidad
join public.panol_materiales negro on negro.id = i.material_id
 and negro.descripcion ilike '%' || v.modelo_producto || '%'
 and negro.descripcion ilike '%negro%'
on conflict (requisito_material_id, producto_material_id)
do update set activo = true;

-- El trigger previo actualizaría también filas ya compradas. Sólo se cambian
-- los pendientes sin pedido/recepción/egreso, tras actualizar la matriz.
alter table public.panol_material_modelo disable trigger trg_panol_material_modelo_sync_obras;

update public.panol_material_modelo mm
set cantidad = v.cantidad, producto_predeterminado_id = v.cromado_id
from k52_epuyen_bano_mapeo v
where mm.material_id = v.requisito_id
  and regexp_replace(upper(mm.modelo), '[^0-9]', '', 'g') = '52'
  and coalesce(mm.variante, 'standard') = 'standard';

alter table public.panol_material_modelo enable trigger trg_panol_material_modelo_sync_obras;

update public.panol_obra_materiales_snapshot s
set cantidad = 2, updated_at = now()
from public.produccion_obras o, k52_epuyen_bano_mapeo v
where o.id = s.obra_id
  and v.requisito_id = coalesce(s.requisito_material_id, s.material_id)
  and v.cantidad = 2
  and regexp_replace(upper(o.linea_nombre), '[^0-9]', '', 'g') = '52'
  and lower(coalesce(s.source, 'matriz')) = 'matriz'
  and lower(coalesce(s.tipo, 'base')) not in ('addon', 'adicional', 'opcional')
  and lower(coalesce(s.estado, 'pendiente')) = 'pendiente'
  and s.purchase_request_id is null and s.purchase_request_item_id is null
  and s.panol_envio_id is null and s.panol_envio_item_id is null
  and coalesce(s.cantidad_egresada, 0) = 0
  and s.recepcion_estado is null
  and s.cantidad is distinct from 2;

commit;
