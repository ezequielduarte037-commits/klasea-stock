-- Depuración de ítems repetidos en las listas de obra (20/11/2026).
--
-- Barrido de las 20 obras activas leyendo la lista tal como la arma la app
-- (por producto, por nombre y por código de modelo). Lo que se repetía:
--
-- 1. Catálogo: el mismo material cargado dos veces (abrazadera inox 3/4",
--    codo MH bronce 1/2" y 3/4", manguera cristal alambre 3/4"). Las dos
--    entraron a la matriz K37 (y la manguera también a la K55). Se fusionan
--    con panol_fusionar_materiales (la línea repetida de la matriz se cae
--    sola por la clave única). En la 37-40, la única obra que tenía las dos
--    filas, se borra la copia pendiente.
--
-- 2. Matriz con un requisito y además su producto como línea aparte: la obra
--    pedía dos (malacate y retén imán K37, toallero barral largo y monocomando
--    de cocina K52, plotter K55). Queda la línea del producto, la más nueva,
--    con su cantidad, y sale la del requisito. En cada obra de la línea los
--    renglones del requisito pasan a la línea del producto; los que no
--    tienen ningún movimiento ni producto elegido a mano se borran.
--
-- 3. K52 "Elementos de baño NEGRO": quitaba los cromados por producto, pero
--    la matriz K52 pide esos ítems por requisito, así que no quitaba nada y
--    la 52-25 pedía cromado y negro. La quita pasa al requisito.
--
-- 4. Renglones sueltos de algunas obras (detalle en cada bloque).

begin;

select set_config('app.audit_origin','depuracion_duplicados',true);
select set_config('app.audit_note','Depuración de ítems repetidos en la lista de obra (20/11/2026)',true);

-- Borra un renglón sin movimientos y pasa su historial a otro renglón.
create or replace function pg_temp.borrar_renglon(p_id uuid, p_queda uuid) returns void language plpgsql as $$
declare v public.panol_obra_materiales_snapshot;
begin
  select * into v from public.panol_obra_materiales_snapshot where id=p_id;
  if not found then raise exception 'No existe el renglón %', p_id; end if;
  if coalesce(v.recepcion_estado,'pendiente')<>'pendiente' or v.purchase_request_id is not null or v.purchase_request_item_id is not null
     or v.egreso_at is not null or v.panol_envio_id is not null or v.panol_envio_item_id is not null
     or coalesce(v.estado,'pendiente')<>'pendiente' then
    raise exception 'El renglón % tiene movimientos: no se borra.', p_id;
  end if;
  if p_queda is not null then
    update public.panol_obra_materiales_snapshot_audit set snapshot_id=p_queda where snapshot_id=p_id;
  else
    delete from public.panol_obra_materiales_snapshot_audit where snapshot_id=p_id;
  end if;
  delete from public.panol_obra_addons where obra_snapshot_id=p_id;
  delete from public.panol_obra_materiales_snapshot where id=p_id;
end $$;

create or replace function pg_temp.sid(p_obra text, p_prefijo text) returns uuid language plpgsql as $$
declare v uuid; n int;
begin
  select count(*), min(s.id::text)::uuid into n, v from public.panol_obra_materiales_snapshot s
    join public.produccion_obras o on o.id=s.obra_id
   where o.codigo=p_obra and s.id::text like p_prefijo||'%';
  if n<>1 then raise exception 'No encuentro un único renglón % en la %', p_prefijo, p_obra; end if;
  return v;
end $$;

-- ───────────── 1. Catálogo repetido ─────────────
select pg_temp.borrar_renglon(pg_temp.sid('37-40','b8ace427'), pg_temp.sid('37-40','9e67bf55')); -- abrazadera 3/4"
select pg_temp.borrar_renglon(pg_temp.sid('37-40','1f68d584'), pg_temp.sid('37-40','27157644')); -- codo 1/2"
select pg_temp.borrar_renglon(pg_temp.sid('37-40','5713435e'), pg_temp.sid('37-40','46dd757f')); -- codo 3/4"
select pg_temp.borrar_renglon(pg_temp.sid('37-40','19c6bb74'), pg_temp.sid('37-40','55f2c395')); -- manguera 3/4"

select public.panol_fusionar_materiales('153b39e4-c586-41ce-a180-7deeec1416d8','4674f480-2d6a-4a84-a40f-ceafc14f2b0e','Repetido en matriz K37 (20/11/2026)');
select public.panol_fusionar_materiales('121fc3b6-26b3-4ceb-9de0-3d4a9b5201d2','e6f59100-441d-45e3-a80a-77b72362c400','Repetido en matriz K37 (20/11/2026)');
select public.panol_fusionar_materiales('f1b5cc19-0a95-434c-a0ce-5a993ee365ce','cfcafcb9-3565-4af8-9de9-c000c6404e79','Repetido en matriz K37 (20/11/2026)');
select public.panol_fusionar_materiales('ff86736f-ccad-4a7d-86ff-1a1ef264f95b','1b67a200-dcff-40a2-8d22-072d91a08803','Repetido en matriz K37 y K55 (20/11/2026)');

-- ───────────── 2. Requisito + producto en la misma matriz ─────────────
create temp table par(req uuid, dir uuid, modelo text) on commit drop;
insert into par values
 ('50641f83-e20d-4cf0-a2ac-9e8e3e1aba1f','7955257b-9941-4edf-8052-c04ea7310087','37'), -- malacate
 ('874a408e-9727-4812-88e8-294f3b537d59','22ee267d-e284-408b-b68c-dfab85465179','37'), -- retén imán
 ('b321889e-ec8c-460f-b325-9a14cce2e24c','e297f845-f1ef-41c3-83d2-adcf9e351625','52'), -- toallero barral largo
 ('e596e2bf-99b4-43c7-941b-74217faf330b','ad170c62-bcdb-42b6-8674-8a016ef23e92','52'), -- monocomando cocina
 ('b906ae92-89f6-4384-9673-4188d8e14d33','dee3ab68-5c3a-4960-a46d-259a1402ce29','55'); -- plotter

do $$
declare n int;
begin
  select count(*) into n from par p
   where exists (select 1 from panol_material_modelo m where m.material_id=p.req and m.modelo=p.modelo)
     and exists (select 1 from panol_material_modelo m where m.material_id=p.dir and m.modelo=p.modelo);
  if n<>5 then raise exception 'La matriz cambió: sólo % de 5 pares siguen dobles.', n; end if;
end $$;

delete from panol_material_modelo m using par p where m.material_id=p.req and m.modelo=p.modelo;

-- La 55-1 tenía quitado el plotter genérico porque lo cubre su adicional: lo
-- mismo vale ahora para la línea del producto.
insert into panol_obra_material_exclusiones(obra_id, material_id, motivo)
select o.id, 'dee3ab68-5c3a-4960-a46d-259a1402ce29', 'Ya lo cubre el adicional de la obra (duplicado, 20/11/2026)'
  from produccion_obras o where o.codigo='55-1'
   and not exists (select 1 from panol_obra_material_exclusiones e where e.obra_id=o.id and e.material_id='dee3ab68-5c3a-4960-a46d-259a1402ce29');

do $$
declare r record; v_queda uuid; v_libre boolean;
begin
  for r in
    select s.*, p.req, p.dir from par p
      join panol_obra_materiales_snapshot s on (s.requisito_material_id=p.req or (s.requisito_material_id is null and s.material_id=p.req))
      join produccion_obras o on o.id=s.obra_id and o.codigo like p.modelo||'-%'
  loop
    v_libre := coalesce(r.recepcion_estado,'pendiente')='pendiente' and r.purchase_request_id is null and r.purchase_request_item_id is null
      and r.egreso_at is null and r.panol_envio_id is null and r.panol_envio_item_id is null
      and coalesce(r.estado,'pendiente')='pendiente';
    select d.id into v_queda from panol_obra_materiales_snapshot d
     where d.obra_id=r.obra_id and coalesce(d.requisito_material_id,d.material_id)=r.dir and d.id<>r.id
     order by (d.source in ('matriz','condicionante')) desc, d.created_at limit 1;
    -- Un renglón pendiente del requisito sin producto elegido a mano no aporta
    -- nada que la línea del producto no tenga.
    if v_libre and v_queda is not null
       and (r.material_id in (r.req, r.dir) or coalesce(r.producto_asignacion_origen,'')='legacy_sin_configurar') then
      perform pg_temp.borrar_renglon(r.id, v_queda);
    else
      update panol_obra_materiales_snapshot set requisito_material_id=r.dir,
        material_id=case when material_id=r.req then r.dir else material_id end
       where id=r.id;
    end if;
  end loop;
end $$;

-- 52-24 eligió a mano grifería NEGRA (28/09) para cocina y toallero: el
-- renglón cromado que agregó la matriz después (03/11) sobra.
select pg_temp.borrar_renglon(pg_temp.sid('52-24','a34f621b'), pg_temp.sid('52-24','d33c585d'));

-- ───────────── 3. K52 "Elementos de baño NEGRO" ─────────────
update panol_matriz_condicionante_items i set material_id=x.req
  from (values
    ('19d58e7d-a1fb-4515-8a0e-b8579c1da833'::uuid,'02646402-69fa-4d8a-8db8-8c621473630d'::uuid),
    ('c4f89e09-4a7c-4059-8632-2e3a0eac076a','d3a7e58e-7f9a-4568-b70e-281cb1665fbd'),
    ('36bf9443-a1b3-4392-97c4-b2e9f1cbefbf','08151045-25ca-458b-8cbd-21b4f3110163'),
    ('d1bcba4c-0015-409b-b91f-ea6c559b0303','8eecd0a2-01c2-4f9d-b192-ab74d0769acc'),
    ('4f31f444-aaf6-4401-afdd-cba7e41e9bff','09ff32da-b4ea-41b1-a229-bccbc402b29a')) as x(cromado, req),
  panol_matriz_condicionantes c
 where c.id=i.condicionante_id and c.modelo='52' and c.nombre='Elementos de baño NEGRO'
   and i.tipo_item='quita' and i.material_id=x.cromado;

-- ───────────── 4. Renglones sueltos ─────────────

-- 37-40 · Plafón sumergible cargado dos veces a mano (uno sin material).
select pg_temp.borrar_renglon(pg_temp.sid('37-40','f5b29f75'), pg_temp.sid('37-40','3c18d706'));

-- 52-23 · Remito del plotter sin material vinculado.
update panol_obra_materiales_snapshot set material_id='dee3ab68-5c3a-4960-a46d-259a1402ce29', requisito_material_id='dee3ab68-5c3a-4960-a46d-259a1402ce29'
 where id=pg_temp.sid('52-23','a750f0e4') and material_id is null;

-- 52-23 · Los "Adicionales 52-23" de julio son la grifería y bacha que después
-- entraron a la matriz K52 (no tienen ficha de adicional). Pasan a ser el
-- renglón de esa línea; los renglones viejos sin nombre de catálogo quedan
-- vinculados al mismo material.
create temp table conv(pref text, mat uuid) on commit drop;
insert into conv values
 ('7e727caa','ad170c62-bcdb-42b6-8674-8a016ef23e92'), -- monocomando cocina
 ('f8938249','46dcd31e-2d2c-4fef-b822-2095856b39ba'), -- bacha
 ('e794a62b','e297f845-f1ef-41c3-83d2-adcf9e351625'), -- toallero barral largo
 ('df473d41','08151045-25ca-458b-8cbd-21b4f3110163'), -- percha
 ('a73eb071','8eecd0a2-01c2-4f9d-b192-ab74d0769acc'), -- portarrollo
 ('5220d707','09ff32da-b4ea-41b1-a229-bccbc402b29a'), -- toallero 0163
 ('f409baf6','d3a7e58e-7f9a-4568-b70e-281cb1665fbd'), -- monocomando lavatorio
 ('a4437ad4','02646402-69fa-4d8a-8db8-8c621473630d'); -- monocomando bañera

do $$
declare r record; v_id uuid; v_otro record;
begin
  for r in select * from conv loop
    v_id := pg_temp.sid('52-23', r.pref);
    if exists (select 1 from panol_obra_addons a where a.obra_snapshot_id=v_id) then
      raise exception 'El renglón % tiene ficha de adicional: no se convierte.', r.pref;
    end if;
    update panol_obra_materiales_snapshot set source='matriz', tipo='base', tipo_label='Base', tipo_pedido='estandar',
      es_adicional=false, requisito_material_id=r.mat, material_id=coalesce(material_id, r.mat)
     where id=v_id and source='addon';
    if not found then raise exception 'El renglón % ya no es un adicional viejo.', r.pref; end if;
    for v_otro in select s.id from panol_obra_materiales_snapshot s
      where s.obra_id=(select obra_id from panol_obra_materiales_snapshot where id=v_id) and s.id<>v_id
        and s.source='matriz' and coalesce(s.requisito_material_id,s.material_id)=r.mat
        and coalesce(s.recepcion_estado,'pendiente')='pendiente' and s.purchase_request_id is null and s.egreso_at is null
        and s.panol_envio_id is null and coalesce(s.estado,'pendiente')='pendiente'
    loop
      perform pg_temp.borrar_renglon(v_otro.id, v_id);
    end loop;
  end loop;
end $$;

update panol_obra_materiales_snapshot s set material_id='02646402-69fa-4d8a-8db8-8c621473630d', requisito_material_id='02646402-69fa-4d8a-8db8-8c621473630d'
  from produccion_obras o
 where o.id=s.obra_id and o.codigo='52-23' and s.material_id is null and s.requisito_material_id is null
   and lower(s.descripcion)='epuyen monoc bañera 0106/l2';

-- 52-24 · Caja de piso: la carga manual de 20 Orbis es el requisito "Caja de piso".
update panol_obra_materiales_snapshot set requisito_material_id='d14c321f-8e0b-42df-9180-44f72374ef30'
 where id=pg_temp.sid('52-24','04db19de') and material_id='8365ba5b-6304-4def-9e5a-97445a47ae9d';

-- 52-24 · Ánodo de timón: el mismo pedido adicional lo tenía en dos ítems de 1.
do $$
declare v_queda uuid := pg_temp.sid('52-24','45ba32d7'); v_sale uuid := pg_temp.sid('52-24','13b56993');
begin
  if (select count(*) from panol_obra_materiales_snapshot where id in (v_queda, v_sale)
       and source='adicional_obra' and recepcion_estado='recibido' and cantidad=1
       and purchase_request_id='943950cc-94fb-48a9-b83b-8ad5c30e878a')<>2 then
    raise exception 'Los ánodos de la 52-24 cambiaron desde la revisión.';
  end if;
  update panol_obra_materiales_snapshot set cantidad=2 where id=v_queda;
  update panol_obra_addons set cantidad=2 where obra_snapshot_id=v_queda;
  update panol_obra_materiales_snapshot_audit set snapshot_id=v_queda where snapshot_id=v_sale;
  update panol_envio_items set obra_snapshot_item_id=v_queda where obra_snapshot_item_id=v_sale;
  delete from panol_obra_addons where obra_snapshot_id=v_sale;
  delete from panol_obra_materiales_snapshot where id=v_sale;
end $$;

-- 55-2 · Adicionales viejos cuya ficha no estaba atada a su renglón: se veían
-- la ficha (pendiente) y el renglón (con su historia).
update panol_obra_addons set obra_snapshot_id=pg_temp.sid('55-2','6f230d6f') where id='ca232678-0c43-42dc-99bd-dfbdafa19630' and obra_snapshot_id is null; -- duchador
update panol_obra_addons set obra_snapshot_id=pg_temp.sid('55-2','ada4ae1e') where id='867f537b-1619-4f9c-94f6-8f313f286e8f' and obra_snapshot_id is null; -- monocomando bañera
update panol_obra_addons set obra_snapshot_id=pg_temp.sid('55-2','a1fdacea') where id='80328dbd-af3e-44f7-a4ea-220088672647' and obra_snapshot_id is null; -- lavasecarropas
update panol_obra_materiales_snapshot set source='adicional_obra', tipo='addon', tipo_label='Adicional', es_adicional=true
 where id in (pg_temp.sid('55-2','6f230d6f'), pg_temp.sid('55-2','ada4ae1e'), pg_temp.sid('55-2','a1fdacea')) and source='addon';

-- 55-2 · El remito de la grifería que el trigger viejo había convertido en
-- adicional es la entrega de ese adicional; y la "Griferia 2 baños" de la
-- matriz es el mismo pedido.
update panol_obra_materiales_snapshot set source='remito', tipo='remito', tipo_label='Remito', es_adicional=false,
  purchase_request_id='b51134c7-02d4-400e-a7c2-ae9902340f18', purchase_request_item_id='d50bc84b-578d-4dfe-84ca-0ede215068cb'
 where id=pg_temp.sid('55-2','68b71ee3') and source='addon';
insert into panol_obra_material_exclusiones(obra_id, material_id, motivo)
select o.id, '02646402-69fa-4d8a-8db8-8c621473630d', 'Ya lo cubre el adicional de la obra (duplicado, 20/11/2026)'
  from produccion_obras o where o.codigo='55-2'
   and not exists (select 1 from panol_obra_material_exclusiones e where e.obra_id=o.id and e.material_id='02646402-69fa-4d8a-8db8-8c621473630d');
select pg_temp.borrar_renglon(pg_temp.sid('55-2','fea0ea87'), pg_temp.sid('55-2','ada4ae1e'));

-- 55-2 · El lavasecarropas que está en pañol es la entrega del adicional pedido
-- (Compras lo tiene recibido).
update panol_obra_materiales_snapshot set purchase_request_id='ccf84c5f-adc3-46b2-a525-8192074bc7fa', purchase_request_item_id='7a5f6439-afa8-4130-8d06-394ece062fe2'
 where id=pg_temp.sid('55-2','41a511a9') and source='manual' and purchase_request_item_id is null;

commit;

-- ═════════ Segunda pasada (verificación en la app, 20/11) ═════════
begin;
select set_config('app.audit_origin','depuracion_duplicados',true);
select set_config('app.audit_note','Depuración de ítems repetidos en la lista de obra (20/11/2026)',true);

-- 52-24 · El remito de cajas de piso Orbis (y sus retiros) también es el
-- requisito "Caja de piso", como la carga manual.
update panol_obra_materiales_snapshot s set requisito_material_id='d14c321f-8e0b-42df-9180-44f72374ef30'
  from produccion_obras o
 where o.id=s.obra_id and o.codigo='52-24' and s.material_id='8365ba5b-6304-4def-9e5a-97445a47ae9d'
   and s.requisito_material_id='8365ba5b-6304-4def-9e5a-97445a47ae9d';

-- 55-1 · Cámaras Tapo: la compra del 10/08 es la entrega del adicional; se
-- veían la ficha pendiente y la compra entregada.
update panol_obra_addons set obra_snapshot_id='2c096f5b-5796-4d6f-ae15-4ad23fae2dab'
 where id='08ba1a0d-015a-4aeb-98e3-bed1c5986807' and obra_snapshot_id is null;
update panol_obra_materiales_snapshot set source='adicional_obra', tipo='addon', tipo_label='Adicional', es_adicional=true
 where id='2c096f5b-5796-4d6f-ae15-4ad23fae2dab' and source='compra';
update panol_obra_materiales_snapshot_audit set snapshot_id='2c096f5b-5796-4d6f-ae15-4ad23fae2dab' where snapshot_id='1db6a8b5-9a92-4e49-872f-047bac48a3be';
delete from panol_obra_materiales_snapshot where id='1db6a8b5-9a92-4e49-872f-047bac48a3be' and coalesce(estado,'pendiente')='pendiente'
   and purchase_request_id is null and recepcion_estado is null and egreso_at is null;

-- 55-1 · "Camarote marinero" está apagado en la obra: el renglón del inodoro
-- que dejó el condicionante sobra (queda el opcional).
update panol_obra_materiales_snapshot_audit set snapshot_id='484e954a-cca3-4a59-97e0-c41a40801465' where snapshot_id='d2c1258d-bcba-41a2-af79-ebfeac58afd6';
delete from panol_obra_materiales_snapshot where id='d2c1258d-bcba-41a2-af79-ebfeac58afd6' and source='condicionante'
   and coalesce(estado,'pendiente')='pendiente' and purchase_request_id is null and recepcion_estado is null and egreso_at is null;

commit;

-- ═════════ Tercera pasada (pares que no se ven por nombre, 20/11) ═════════
begin;
select set_config('app.audit_origin','depuracion_duplicados',true);
select set_config('app.audit_note','Depuración de ítems repetidos en la lista de obra (20/11/2026)',true);

create temp table par3(req uuid, dir uuid, modelo text) on commit drop;
insert into par3 values
 ('f7f843d5-06f9-4de3-a756-588f08685537','95cad461-7f99-4a37-ae68-1a19dba2abbe','37'), -- chapa de proa
 ('74336240-aa7c-4d5c-8be4-4820f872de33','46dcd31e-2d2c-4fef-b822-2095856b39ba','52'); -- bacha cocina Hausar

do $$
declare n int;
begin
  select count(*) into n from par3 p
   where exists (select 1 from panol_material_modelo m where m.material_id=p.req and m.modelo=p.modelo)
     and exists (select 1 from panol_material_modelo m where m.material_id=p.dir and m.modelo=p.modelo);
  if n<>2 then raise exception 'La matriz cambió: sólo % de 2 pares siguen dobles.', n; end if;
end $$;
delete from panol_material_modelo m using par3 p where m.material_id=p.req and m.modelo=p.modelo;

do $$
declare r record; v_queda uuid; v_libre boolean;
begin
  for r in
    select s.*, p.req, p.dir from par3 p
      join panol_obra_materiales_snapshot s on (s.requisito_material_id=p.req or (s.requisito_material_id is null and s.material_id=p.req))
      join produccion_obras o on o.id=s.obra_id and o.codigo like p.modelo||'-%'
  loop
    v_libre := coalesce(r.recepcion_estado,'pendiente')='pendiente' and r.purchase_request_id is null and r.purchase_request_item_id is null
      and r.egreso_at is null and r.panol_envio_id is null and r.panol_envio_item_id is null
      and coalesce(r.estado,'pendiente')='pendiente';
    select d.id into v_queda from panol_obra_materiales_snapshot d
     where d.obra_id=r.obra_id and coalesce(d.requisito_material_id,d.material_id)=r.dir and d.id<>r.id
     order by (d.source in ('matriz','condicionante')) desc, d.created_at limit 1;
    if v_libre and v_queda is not null
       and (r.material_id in (r.req, r.dir) or coalesce(r.producto_asignacion_origen,'')='legacy_sin_configurar') then
      perform pg_temp.borrar_renglon(r.id, v_queda);
    else
      update panol_obra_materiales_snapshot set requisito_material_id=r.dir,
        material_id=case when material_id=r.req then r.dir else material_id end
       where id=r.id;
    end if;
  end loop;
end $$;

-- La bacha Hausar negra estaba dos veces en el catálogo.
select public.panol_fusionar_materiales('46dcd31e-2d2c-4fef-b822-2095856b39ba','9ff30e3b-89ed-4925-82f9-1ad2e00b0fb2','Repetido en catálogo (20/11/2026)');

-- 37-40 · "Unión rosca M 1/2" Whale WX1514" (dada de baja) es el mismo
-- adaptador WX1514 de la matriz.
select pg_temp.borrar_renglon(pg_temp.sid('37-40','034a98e5'), pg_temp.sid('37-40','145cbfc6'));

-- 52-24 · Tenía quitada la línea del monocomando cromado porque va NEGRO por
-- el requisito; ahora ese renglón NEGRO está en esa línea.
delete from panol_obra_material_exclusiones e using produccion_obras o
 where o.id=e.obra_id and o.codigo='52-24' and e.material_id='ad170c62-bcdb-42b6-8674-8a016ef23e92';

commit;
