-- Avisos de ingreso "Electricidad 52-25/26/27": pedido completo a Janored
-- (presupuesto 802/230), y los renglones de las tres listas quedan Comprado.
-- Los 4 reemplazos de la matriz del 29/10 se pasan primero en las obras.
do $$
declare
  v_obra record;
  v_envio uuid;
  v_items jsonb;
  v_id uuid;
  v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub','b93b4fda-590a-41b7-8382-317aa74917e1','role','authenticated')::text, true);

  -- Reemplazos de la matriz (29/10) en las listas de las obras.
  update public.panol_obra_materiales_snapshot s
     set material_id = r.nuevo, requisito_material_id = r.nuevo, descripcion = r.descripcion,
         precio_unitario = null, updated_at = now()
    from (values
      ('c7cceea3-1375-4dcb-9b32-cc6d0324e78f'::uuid, 'eccc0db0-3244-4c39-b7fc-dfddcdebba90'::uuid, 'Cable 1x1 rojo'),
      ('da28b375-131c-49c6-8984-e45d505230e2'::uuid, '3985c84a-34e5-42bf-b52a-ae10acce1770'::uuid, 'Cable 1x0,75 violeta'),
      ('2e58d896-760e-48a9-b2e3-4f0445c167c6'::uuid, '73833439-0f0f-40fc-a113-b15c77932ce0'::uuid, 'Termo contraíble negro 2 mm'),
      ('508851ee-f09e-4669-8a80-6856aa5343b0'::uuid, '8bfdc04a-ce15-4112-a4cf-a1b543fdae6f'::uuid, 'Termo contraíble negro 8 mm')
    ) r(viejo, nuevo, descripcion)
   where s.material_id = r.viejo and s.source = 'matriz' and s.estado = 'pendiente'
     and s.obra_id in (select id from public.produccion_obras where codigo in ('52-25','52-26','52-27'));
  get diagnostics v_n = row_count;
  if v_n <> 12 then raise exception 'Reemplazos: % renglones, se esperaban 12', v_n; end if;

  create temp table zz_mat on commit drop as
  select coalesce(p.fid, (select pm.id from public.panol_materiales pm
                           where pm.descripcion = p.nombre
                             and exists (select 1 from public.panol_material_modelo mm where mm.material_id = pm.id and mm.modelo = '52'))) material_id
    from (values
    ('BASE PORTA FUSIBLE NH 500A',null::uuid),
    ('BASE PORTA FUSIBLE NH-00 160',null::uuid),
    ('BASE PORTA FUSIBLE OMEGA',null::uuid),
    ('BORNERA · T2 25A',null::uuid),
    ('BORNERA · T2 50A',null::uuid),
    ('BORNERA · T2 100A',null::uuid),
    ('BORNERA · T3 25A',null::uuid),
    ('BORNERA tipo telefónica 10x50',null::uuid),
    ('Cable 1x0,50 amarillo',null::uuid),
    ('Cable 1x0,50 negro',null::uuid),
    ('Cable 1x0,50 rojo',null::uuid),
    ('Cable 1x0,75 amarillo',null::uuid),
    ('Cable 1x0,75 blanco',null::uuid),
    ('Cable 1x0,75 naranja',null::uuid),
    ('Cable 1x0,75 negro',null::uuid),
    ('Cable 1x0,75 rojo',null::uuid),
    ('Cable 1x0,75 violeta',null::uuid),
    ('Cable 1x1 negro',null::uuid),
    ('Cable 1x1 rojo',null::uuid),
    ('Cable 1x1,5 azul',null::uuid),
    ('Cable 1x1,5 marron',null::uuid),
    ('Cable 1x1,5 negro',null::uuid),
    ('Cable 1x1,5 rojo',null::uuid),
    ('Cable 1x1,5 verde-amarillo',null::uuid),
    ('Cable 1x10 negro',null::uuid),
    ('Cable 1x10 rojo',null::uuid),
    ('Cable canal 10x5',null::uuid),
    ('Cable chato 3x1,5',null::uuid),
    ('Cable coaxil RG-59',null::uuid),
    ('Cable soldadura flex 1x25',null::uuid),
    ('Cable soldadura flex 1x35',null::uuid),
    ('Cable soldadura flex 1x50',null::uuid),
    ('Cable soldadura flex 1x70',null::uuid),
    ('Cable tipo taller 3x1,5',null::uuid),
    ('Cable tipo taller 7x1,5',null::uuid),
    ('Cable UTP',null::uuid),
    ('Caja de paso Roker PR 1000-67','e3c562da-79c1-49ba-aec5-39aad562da80'::uuid),
    ('Caño corrugado blanco 5/8',null::uuid),
    ('Caño corrugado blanco 7/8',null::uuid),
    ('Caño corrugado negro partido 1/2',null::uuid),
    ('Caño corrugado negro partido 5/8',null::uuid),
    ('CINTA AISLANTE BLANCA','a94d1405-a9d9-433f-9030-a455c2e8c8b4'::uuid),
    ('CINTA AISLANTE NEGRA',null::uuid),
    ('CINTA AISLANTE ROJA','1420f15d-e6c4-4026-b023-3d57a632267d'::uuid),
    ('Contactor tripolar 3x18A bobina 220V 1NA','adbada2a-ba35-437b-8194-951e74e4ded6'::uuid),
    ('Empalme preaislado amarillo 6 mm',null::uuid),
    ('Empalme preaislado azul 2,5 mm',null::uuid),
    ('Empalme preaislado rojo 1,5 mm',null::uuid),
    ('Estaño (bobina)','0cd30cb0-88ea-4cad-892e-4a923789473d'::uuid),
    ('Ficha RJ-45',null::uuid),
    ('FUSIBLE NH · 100A',null::uuid),
    ('FUSIBLE NH · 160A',null::uuid),
    ('FUSIBLE NH · 500A',null::uuid),
    ('Gabinete PVC Roker PRG 350-1 puerta de cristal','d2699f54-1b84-4fb9-b58e-a523a1ef091f'::uuid),
    ('Microswitch pistón con roldana fija Z-15GQ22-B',null::uuid),
    ('Placa de montaje blanca 30x35 mm',null::uuid),
    ('Precinto 150 x 3,5 mm',null::uuid),
    ('Precinto 245 x 4,6 mm',null::uuid),
    ('Precinto 300 x 5 mm',null::uuid),
    ('Solenoide zm 403 12v',null::uuid),
    ('Tapa y bastidor Cambre tapa fume',null::uuid),
    ('Terminal de cobre 10 mm diámetro 6',null::uuid),
    ('Terminal de cobre 16 mm diámetro 3/8',null::uuid),
    ('Terminal de cobre 16 mm diámetro 5/16',null::uuid),
    ('Terminal de cobre 25 mm diámetro 1/2',null::uuid),
    ('Terminal de cobre 25 mm diámetro 3/8',null::uuid),
    ('Terminal de cobre 35 mm diámetro 1/2',null::uuid),
    ('Terminal de cobre 35 mm diámetro 3/8',null::uuid),
    ('Terminal de cobre 50 mm diámetro 1/2',null::uuid),
    ('Terminal de cobre 50 mm diámetro 3/8',null::uuid),
    ('Terminal de cobre 70 mm diámetro 3/8',null::uuid),
    ('Terminal de cobre 95 mm diámetro 3/8',null::uuid),
    ('Terminal preaislado ojal amarillo 5 mm',null::uuid),
    ('Terminal preaislado ojal amarillo 8 mm',null::uuid),
    ('Terminal preaislado ojal amarillo 10 mm',null::uuid),
    ('Terminal preaislado ojal azul 5 mm',null::uuid),
    ('Terminal preaislado ojal azul 6 mm',null::uuid),
    ('Terminal preaislado pala hembra amarillo 6 mm',null::uuid),
    ('Terminal preaislado pala hembra azul 2,5 mm',null::uuid),
    ('Termo contraíble negro 2 mm',null::uuid),
    ('Termo contraíble negro 8 mm',null::uuid),
    ('Termo contraíble negro 10 mm',null::uuid),
    ('Tomas cambre de 20 amp',null::uuid)
    ) p(nombre, fid);
  if (select count(distinct material_id) from zz_mat) <> 83 then raise exception 'Materiales: % de 83', (select count(distinct material_id) from zz_mat); end if;

  for v_obra in select id, codigo from public.produccion_obras where codigo in ('52-25','52-26','52-27') order by codigo loop
    select jsonb_agg(jsonb_build_object(
             'descripcion', s.descripcion, 'codigo', s.codigo, 'cantidad', s.cantidad::text,
             'unidad', coalesce(s.unidad, 'unidad'), 'material_id', s.material_id,
             'requisito_material_id', coalesce(s.requisito_material_id, s.material_id),
             'proveedor', 'Janored', 'precio_unitario', s.precio_unitario, 'moneda', coalesce(s.moneda, 'ARS'),
             'obra_id', s.obra_id, 'obra_snapshot_item_id', s.id) order by s.descripcion)
      into v_items
      from public.panol_obra_materiales_snapshot s
     where s.obra_id = v_obra.id and s.source = 'matriz' and s.estado = 'pendiente'
       and s.panol_envio_item_id is null and s.purchase_request_item_id is null
       and s.material_id in (select material_id from zz_mat);

    v_envio := public.panol_crear_envio('Electricidad ' || v_obra.codigo, 'Chubut', 'media', v_obra.id, null, null, 'obra_matriz', null, v_items);

    for v_id in select (x->>'obra_snapshot_item_id')::uuid from jsonb_array_elements(v_items) x loop
      perform public.panol_cambiar_estado_snapshot(v_id, 'comprado', 'Janored, presupuesto 802/230');
    end loop;
  end loop;
end $$;
