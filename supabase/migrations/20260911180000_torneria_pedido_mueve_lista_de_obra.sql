-- Que un pedido hecho desde Tornería se vea en la lista de la obra.
--
-- Hoy hay 34 renglones de Tornería con pedido a Compras y CERO renglones de
-- obra enterados. En la lista de la obra el material sigue diciendo "pendiente"
-- mientras en Tornería dice "solicitado", y cuando llega al galpón la obra
-- tampoco se entera. El que mira la obra ve que falta algo que ya está pedido y
-- lo vuelve a pedir.
--
-- LO INTERESANTE ES QUE NO FALTA CASI NADA. La cadena completa ya existe:
--
--   sync_obra_snapshot_from_purchase_item (migración 20260629000000) escucha los
--   cambios de estado de cada línea del pedido y los copia al renglón de la obra
--   que tenga purchase_request_item_id = esa línea. Pedido, en pañol, recibido,
--   cancelado: todo eso ya viaja solo.
--
-- El único eslabón que falta es el primero: nadie pone ese
-- purchase_request_item_id cuando el pedido nace en Tornería. El pedido queda
-- atado al renglón de Tornería y la lista de la obra nunca se entera de que
-- existe. Esta función pone ese eslabón y el resto del camino ya está hecho.
--
-- SE ENGANCHA POR MATERIAL, NO POR RENGLÓN DE TORNERÍA. Un "Lote de broncería y
-- bujes" sale como seis líneas de pedido, y el renglón de Tornería sólo puede
-- guardar una. Yendo por material cada línea encuentra su propio renglón en la
-- obra, y las seis se marcan.
--
-- QUÉ NO TOCA, a propósito:
--   · renglones que ya tienen un pedido encima -no se le roba el vínculo a nadie-
--   · renglones que no están en "pendiente": si alguien ya lo movió a mano, su
--     decisión vale más que esta automatización
--   · renglones con algo ya egresado

begin;

create or replace function public.torneria_enganchar_pedido_a_obra(
  p_request_id uuid,
  p_obra_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea record;
  v_snapshot uuid;
  v_enganchados integer := 0;
begin
  if p_request_id is null or p_obra_id is null then
    return 0;
  end if;

  -- De a una y en orden: si el pedido lleva dos líneas del mismo material -pasa
  -- cuando una obra necesita el mismo buje en dos lados- cada una se lleva un
  -- renglón distinto en vez de pisarse las dos sobre el primero.
  for v_linea in
    select id, material_id
      from public.purchase_request_items
     where request_id = p_request_id
       and material_id is not null
     order by created_at, id
  loop
    select s.id
      into v_snapshot
      from public.panol_obra_materiales_snapshot s
     where s.obra_id = p_obra_id
       and s.material_id = v_linea.material_id
       and s.purchase_request_item_id is null
       and s.estado = 'pendiente'
       and coalesce(s.cantidad_egresada, 0) = 0
     order by s.created_at
     limit 1;

    if v_snapshot is not null then
      update public.panol_obra_materiales_snapshot
         set purchase_request_id = p_request_id,
             purchase_request_item_id = v_linea.id,
             estado = 'pedido',
             updated_at = now()
       where id = v_snapshot;
      v_enganchados := v_enganchados + 1;
    end if;
  end loop;

  return v_enganchados;
end;
$$;

comment on function public.torneria_enganchar_pedido_a_obra(uuid, uuid) is
  'Ata las líneas de un pedido nacido en Tornería con los renglones de la obra, por material. A partir de ahí el estado lo mueve sync_obra_snapshot_from_purchase_item.';

grant execute on function public.torneria_enganchar_pedido_a_obra(uuid, uuid) to authenticated;

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Antes de que se mande el próximo pedido esto da 0 enganchados: la función
-- corre para adelante y no toca lo que ya pasó. Los 34 pedidos viejos siguen
-- sin vínculo a propósito: engancharlos ahora marcaría como "pedido" cosas que
-- capaz ya llegaron y nadie registró, que es peor que dejarlas en pendiente.

select
  (select count(*) from public.torneria_items where purchase_request_item_id is not null) as torneria_con_pedido,
  (select count(*) from public.panol_obra_materiales_snapshot where purchase_request_item_id is not null) as obra_con_pedido;
