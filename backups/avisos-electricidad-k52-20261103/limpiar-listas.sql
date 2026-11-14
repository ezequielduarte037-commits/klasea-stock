-- Listas de las obras K52: se sacan los ítems que salieron de la matriz de
-- Electricidad el 29/10 y se pasan los reemplazos al producto nuevo (el trigger
-- de la matriz no propaga bajas ni altas). Sólo renglones de matriz pendientes.
do $$
declare v_n int; v_pasa uuid;
begin
  select id into strict v_pasa from public.panol_materiales where descripcion = 'Pasa cable - Recto D=10mm';

  create temp table zz_obras on commit drop as
    select id, codigo from public.produccion_obras where public.panol_modelo_de_obra(id) = '52';

  -- Reemplazos (en 52-24 el pasacable 06 ya se retiró de pañol: queda como está).
  update public.panol_obra_materiales_snapshot s
     set material_id = r.nuevo, requisito_material_id = r.nuevo, descripcion = pm.descripcion,
         unidad = coalesce(pm.unidad_medida, s.unidad), cantidad = mm.cantidad,
         precio_unitario = null, updated_at = now()
    from (values
      ('c7cceea3-1375-4dcb-9b32-cc6d0324e78f'::uuid, 'eccc0db0-3244-4c39-b7fc-dfddcdebba90'::uuid),  -- 1x1 amarillo -> 1x1 rojo
      ('da28b375-131c-49c6-8984-e45d505230e2'::uuid, '3985c84a-34e5-42bf-b52a-ae10acce1770'::uuid),  -- 1x1 violeta -> 0,75 violeta
      ('2e58d896-760e-48a9-b2e3-4f0445c167c6'::uuid, '73833439-0f0f-40fc-a113-b15c77932ce0'::uuid),  -- termo 4 -> 2 mm
      ('508851ee-f09e-4669-8a80-6856aa5343b0'::uuid, '8bfdc04a-ce15-4112-a4cf-a1b543fdae6f'::uuid),  -- termo 13 -> 8 mm
      ('008f2f3a-5004-4d37-8645-af914c5df086'::uuid, '376063e8-4687-4839-9c93-0da7244ed476'::uuid),  -- caramelo 150A -> 40A
      ('87101f58-3cc5-4f40-a64f-200505aacee5'::uuid, v_pasa)                                          -- pasacable 06 -> 10 mm
    ) r(viejo, nuevo)
    join public.panol_materiales pm on pm.id = r.nuevo
    join public.panol_material_modelo mm on mm.material_id = r.nuevo and mm.modelo = '52' and mm.variante = 'standard'
   where s.material_id = r.viejo and s.source = 'matriz' and s.estado = 'pendiente'
     and s.purchase_request_item_id is null and s.panol_envio_item_id is null
     and s.obra_id in (select id from zz_obras)
     and not (s.material_id = '87101f58-3cc5-4f40-a64f-200505aacee5'
              and s.obra_id = (select id from zz_obras where codigo = '52-24'))
     and not exists (select 1 from public.panol_obra_materiales_snapshot x
                      where x.obra_id = s.obra_id and x.material_id = r.nuevo and x.source = 'matriz');
  get diagnostics v_n = row_count;
  if v_n <> 23 then raise exception 'Reemplazos: % renglones, se esperaban 23', v_n; end if;

  -- Bajas.
  delete from public.panol_obra_materiales_snapshot s
   where s.material_id in (
     '16d2bb95-bad1-489d-94bd-b5f46a43c8ff',  -- Omega mini
     '14463a57-4288-49c9-93fd-5d921b9f7dc9',  -- Cable 1x1 gris
     '85019e0f-82e7-4f77-a025-e5da83c31d01',  -- Cinta marrón
     '18ebeaca-2a42-43f0-ba79-57866ff64665',  -- Cinta verde
     '70c5422f-f250-4ee7-94a4-1a62073ca67e',  -- Caramelo mini 40A
     '93af3f2a-2586-402b-9bba-6af8141faee2')  -- Luz popa Hella
     and s.source = 'matriz' and s.estado = 'pendiente'
     and s.purchase_request_item_id is null and s.panol_envio_item_id is null
     and s.obra_id in (select id from zz_obras);
  get diagnostics v_n = row_count;
  if v_n <> 36 then raise exception 'Bajas: % renglones, se esperaban 36', v_n; end if;
end $$;
