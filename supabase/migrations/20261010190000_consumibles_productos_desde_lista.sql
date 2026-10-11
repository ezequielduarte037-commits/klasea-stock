-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: los productos salen de la lista de Rebollar (vigente 2026-10-08).
--
-- GENERADA por scripts/consumibles/productos-desde-lista.mjs (2026-10-10). No
-- editar a mano. Criterio de Ezequiel (10/10/2026): el módulo arranca de cero
-- con los 649 productos de la lista.
--
--   1. 160 renglones ya vinculados: se reutiliza el material (id, historial,
--      códigos, favorito) con el nombre de Rebollar + medida; el nombre viejo
--      va al alias; proveedor Rebollar. 9 cambian de rubro por regla.
--   2. 489 renglones sin material: alta (material + config con código,
--      factor y costo). Rubro, unidad y forma de entrega por regla.
--   3. 12 consumibles viejos que son claramente un producto de la lista se
--      fusionan en él (consumibles_fusionar_interno). Queda el RPC
--      consumibles_fusionar(viejo, nuevo) para la pantalla (admin, Compras,
--      Técnica).
--   4. 50 viejos sin par salen del módulo: activo = false, fuera del
--      mostrador y nota "Fuera de la lista de Rebollar (10/10/2026)". No se borran.
--   5. Códigos KA0001…KA0649 en orden de rubro y descripción; la
--      secuencia queda en el siguiente.
--
-- Idempotente: ids fijos por código de Rebollar, altas con on conflict, la
-- fusión no repite lo hecho y la renumeración da siempre lo mismo.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── Funciones ───────────────────────────────────────────────────────────────

-- Suma un nombre al alias sin duplicar ni pisar lo que había. Si el nombre
-- es la descripción misma, no hace falta.
create or replace function public.consumibles_alias_sumar(p_alias text, p_nombre text, p_descripcion text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_nombre, '')), '') is null then p_alias
    when lower(btrim(p_nombre)) = lower(btrim(coalesce(p_descripcion, ''))) then p_alias
    when nullif(btrim(coalesce(p_alias, '')), '') is null then btrim(p_nombre)
    when position(lower(btrim(p_nombre)) in lower(p_alias)) > 0 then p_alias
    else btrim(p_alias) || ' · ' || btrim(p_nombre)
  end
$$;

-- Fusiona un consumible viejo en el producto de Rebollar que es lo mismo:
-- el nombre viejo va al alias, los códigos de barras pasan al nuevo, y el
-- favorito, el mínimo, la ubicación y el peso también si el nuevo no tiene.
-- El viejo queda dado de baja (no se borra: conserva su historial). Si el
-- viejo tiene movimientos no se fusiona: se perdería su stock.
create or replace function public.consumibles_fusionar_interno(p_viejo uuid, p_nuevo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viejo public.panol_materiales;
  v_nuevo public.panol_materiales;
  v_cv public.consumibles_config;
  v_codigos int := 0;
  v_agregados int := 0;
begin
  if p_viejo is null or p_nuevo is null or p_viejo = p_nuevo then
    raise exception 'Elegí dos productos distintos';
  end if;
  select * into v_viejo from public.panol_materiales where id = p_viejo for update;
  select * into v_nuevo from public.panol_materiales where id = p_nuevo for update;
  if v_viejo.id is null or v_nuevo.id is null then
    raise exception 'No encontré alguno de los dos productos';
  end if;
  if not coalesce(v_viejo.es_consumible, false) or not coalesce(v_nuevo.es_consumible, false) then
    raise exception 'Los dos tienen que ser consumibles';
  end if;
  if v_nuevo.activo = false then
    raise exception '"%" está dado de baja: elegí un producto activo', v_nuevo.descripcion;
  end if;
  -- Ya fusionado (reintento o segunda corrida): no se hace nada.
  if v_viejo.activo = false
     and position(lower(btrim(v_viejo.descripcion)) in lower(coalesce(v_nuevo.alias, ''))) > 0 then
    return jsonb_build_object('ya_fusionado', true, 'viejo', p_viejo, 'nuevo', p_nuevo);
  end if;
  if exists (select 1 from public.consumibles_movimientos where material_id = p_viejo and anulado_at is null) then
    raise exception '"%" ya tiene movimientos: contá su stock en el producto nuevo y anulalos antes de fusionar', v_viejo.descripcion;
  end if;

  select * into v_cv from public.consumibles_config where material_id = p_viejo for update;
  insert into public.consumibles_config (material_id) values (p_nuevo) on conflict (material_id) do nothing;

  -- El viejo suelta su favorito antes de dárselo al nuevo.
  update public.consumibles_config
     set activo_mostrador = false,
         favorito_orden = null,
         codigo_etiqueta = case when codigo_etiqueta like 'BAJA-%' then codigo_etiqueta else 'BAJA-' || codigo_etiqueta end,
         notas = btrim(coalesce(notas || E'\n', '') || 'Fusionado en "' || v_nuevo.descripcion || '"')
   where material_id = p_viejo;

  update public.consumibles_config
     set favorito_orden = coalesce(favorito_orden, v_cv.favorito_orden),
         stock_maximo = coalesce(stock_maximo, v_cv.stock_maximo),
         cupo_diario = coalesce(cupo_diario, v_cv.cupo_diario)
   where material_id = p_nuevo;

  update public.panol_materiales
     set alias = public.consumibles_alias_sumar(public.consumibles_alias_sumar(alias, v_viejo.descripcion, descripcion), v_viejo.alias, descripcion),
         codigo_barra = coalesce(codigo_barra, v_viejo.codigo_barra),
         stock_minimo = coalesce(stock_minimo, v_viejo.stock_minimo),
         ubicacion = coalesce(ubicacion, v_viejo.ubicacion),
         peso_unitario_g = coalesce(peso_unitario_g, v_viejo.peso_unitario_g),
         peso_muestra_piezas = case when peso_unitario_g is null then v_viejo.peso_muestra_piezas else peso_muestra_piezas end,
         peso_calibrado_at = case when peso_unitario_g is null then v_viejo.peso_calibrado_at else peso_calibrado_at end
   where id = p_nuevo
   returning * into v_nuevo;

  -- Códigos de barras: los de la tabla se mudan; el código y el código de
  -- barras sueltos del viejo se agregan a la tabla del nuevo (el lector los
  -- sigue encontrando).
  update public.panol_material_codigos_barra b
     set material_id = p_nuevo, updated_at = now()
   where b.material_id = p_viejo
     and not exists (select 1 from public.panol_material_codigos_barra x where x.material_id = p_nuevo and x.codigo = b.codigo);
  get diagnostics v_codigos = row_count;
  update public.panol_material_codigos_barra set activo = false, updated_at = now() where material_id = p_viejo and activo;

  insert into public.panol_material_codigos_barra (material_id, codigo, etiqueta, activo)
  select p_nuevo, t.c, left('De ' || v_viejo.descripcion, 120), true
    from (select distinct btrim(c) as c from unnest(array[v_viejo.codigo_barra, v_viejo.codigo]) as c) t
   where nullif(t.c, '') is not null
     and t.c is distinct from v_nuevo.codigo_barra
     and t.c is distinct from v_nuevo.codigo
     and not exists (select 1 from public.panol_material_codigos_barra x where x.material_id = p_nuevo and x.codigo = t.c);
  get diagnostics v_agregados = row_count;

  -- Si el viejo estaba en una lista y el nuevo no, el renglón pasa al nuevo.
  update public.consumibles_lista_items li
     set material_id = case when exists (
           select 1 from public.consumibles_lista_items x where x.lista_id = li.lista_id and x.material_id = p_nuevo
         ) then null else p_nuevo end
   where li.material_id = p_viejo;

  update public.panol_materiales set activo = false, codigo_barra = null where id = p_viejo;

  return jsonb_build_object('viejo', p_viejo, 'nuevo', p_nuevo, 'codigos_movidos', v_codigos + v_agregados, 'alias', v_nuevo.alias);
end;
$$;

-- Lo que usa la pantalla: mismo trabajo, con permiso de listas.
create or replace function public.consumibles_fusionar(p_viejo uuid, p_nuevo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_panol_manager(auth.uid()) then
    raise exception 'Fusionar productos lo pueden hacer admin, Compras y Técnica';
  end if;
  return public.consumibles_fusionar_interno(p_viejo, p_nuevo);
end;
$$;

revoke all on function public.consumibles_fusionar_interno(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consumibles_fusionar(uuid, uuid) to authenticated;
grant execute on function public.consumibles_alias_sumar(text, text, text) to authenticated;

-- ── 1. Los 160 vinculados: mismo material, nombre de Rebollar ─────────
drop table if exists pg_temp._cns_reuso;
create temp table _cns_reuso (material_id uuid, descripcion text, alias_viejo text, categoria_id uuid) on commit drop;
insert into _cns_reuso values
  ('e77f1598-f623-467d-9d04-a536b37acd5f'::uuid, 'ANTEOJO LIBUS ARGON TRANSP'::text, 'Lentes'::text, '510afa7d-8c14-420f-aaf7-3141fd623693'::uuid),  -- A0006
  ('c41224aa-205e-475b-984b-89a636ec30c2', 'Autopolish x 900cm3', 'Autopolish', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- A0008
  ('20b0748e-0807-46bf-aa2f-48b525ba21d5', 'CARTON ROLLO', 'Carton', '9319613e-f647-433a-ac41-f9412f31d524'),  -- C0001
  ('e5e97fd5-d50f-4267-809f-4c4f5a4e3217', 'CEPILLO CERDA BLANDA', 'Cepillo Limpieza', '9319613e-f647-433a-ac41-f9412f31d524'),  -- C0003
  ('13f8161f-a496-4fca-b913-2b833e950c62', 'CHAPITAS PARA MASILLAR -JUEGO', 'Kit Chapitas Nuevas', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'),  -- C00101
  ('94a44c07-0b23-49fd-8554-223dff0241fb', 'CINTA DOBLE FAZ 36mm RAPIFIX', 'Cinta Doble Faz', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3'),  -- C00191
  ('8c47e2ea-e691-46df-8e0c-afee00d06027', 'Cinta papel DobleA VERDE 18mm', 'Cinta Fina Verde 18mm', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3'),  -- C0031
  ('92629e6e-fe1e-4047-8fa8-44b388ef6b71', 'CUTTER-HOJA REPUESTO x 10UNID', 'HOJA CUTER', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'),  -- C0054
  ('fd0645c1-cf8f-470d-a578-a64d28213cb5', 'Disco de Lija 115mm #60', 'Disco Lija 60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0007
  ('fe2602e3-65c7-4e65-993e-3e05d24d4c66', 'Disco orbital 154mm # 40', 'Lija Orbital Grande 40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0041
  ('d43c7bcb-2747-4983-b552-8046f65ec36a', 'Disco orbital 154mm # 60', 'Lija Orbital Grande 60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0042
  ('f00af2d7-244d-4869-b156-373ba84cc12b', 'Disco orbital 154mm # 80', 'Lija Orbital Grande 80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0043
  ('7ced8879-cb7e-40e2-8b5a-4b5c6bdd905f', 'Disco orbital 154mm # 120', 'LIJA ORBITAL GRANDE 120', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0045
  ('003911f7-20f4-4834-b46f-795ce683c100', 'Disco orbital 154mm # 150', 'LIJA ORBITAL GRANDE 150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0046
  ('4f884c6c-1928-4c0f-8250-77d84c1c3a28', 'Disco orbital 154mm # 180', 'LIJA ORBITAL GRANDE 180', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0047
  ('9f65bbe7-42a3-4438-840f-e3739434f0d1', 'Disco orbital 154mm # 220', 'Lija Orbital Grande 220', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0048
  ('1b1ab73d-5991-4299-9f12-9baec388a311', 'Disco orbital 154mm # 240', 'Lija Orbital Grande 240', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0049
  ('a4650d8b-71c4-404d-8f5c-58598b63f03e', 'Disco orbital 154mm # 360', 'Lija Orbital Grande 360', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0052
  ('94c8bba9-47c1-4646-9b5b-4b9ddfe8baee', 'Disco orbital 154mm # 600', 'LIJA ORBITAL GRANDE 600', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0054
  ('ae59aebb-abe3-43c5-b938-25bbe06193a9', 'Discos de corte 7', 'Disco Corte N7', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- D0063
  ('381657c8-f674-4dff-85fc-62db7944878f', 'Estopa Blanca Lustre- x Kg', 'Estopa', '9319613e-f647-433a-ac41-f9412f31d524'),  -- E0011
  ('28f984cd-c62f-4819-875c-1bfc5832f217', '3,5 X 16 FIX', 'Parafuso 3.5 X 16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0002
  ('4cf6eef8-9991-4443-80ab-483f7c970297', '3,5 X 20 FIX', 'Parafuso 3.5 X 20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0003
  ('6882b214-d787-428e-9b8e-07ee15aa1891', '3,5 X 30 FIX', 'Parafuso 3.5 X 30', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0005
  ('ed7e0692-6a90-41d3-9532-3c9decdb3e5c', '3,5 X 35 FIX', 'Parafuso 3.5 X 35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0006
  ('eb166b14-4d2d-4e69-8dc8-f982407596c0', '3,5 X 40 FIX', 'Parafuso 3.5 X 40', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0007
  ('ab266d74-7a91-4c1d-809a-e24a9b64d3e0', '4 X 20 FIX', 'Parafuso 4 X 20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0009
  ('cf156009-67b8-4f38-91bb-9a9f813d4319', '4 X 25 FIX', 'Parafuso 4 X 25', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0010
  ('78b47ac2-5e45-4894-966d-d22e7738a125', '4 X 30 FIX', 'Parafuso 4 X 30', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0011
  ('301c6077-8eff-4366-bfbe-8292644aa954', '4 X 35 FIX', 'Parafuso 4 X 35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0012
  ('ea4338f3-b971-4e32-8412-5d1ed1f54d93', '4 X 40 FIX', 'Parafuso 4 X 40', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0013
  ('421da6ca-f729-4848-9027-31b338207b9a', '4 X 45 FIX', 'Parafuso 4 X 45', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0014
  ('b55cda81-8158-44c9-800c-4f19bc12cdc9', '4 X 50 FIX', 'Parafuso 4 X 50', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0015
  ('92ee2f1b-52bf-4dd0-9f1b-2569907f397f', '4,5 X 60 FIX', 'Parafuso 4.5 X 60', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- F0016
  ('d4c5a533-b1db-423d-a87f-87b21b6632af', 'Fana 96 - Lata x 14 Kg.', 'Lata Fana', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- F0022
  ('44697e09-829b-4800-a82b-e45c91a750ff', 'Film x 1100', 'Film 1100', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3'),  -- F0028
  ('c0cc1c9f-613e-43c3-b3ef-3aba50dafaf1', 'Film x 2400', 'Film 2400', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3'),  -- F0029
  ('8eb4bbf4-cfd6-4935-adcc-d0286b492420', 'Film x 550', 'Film 550', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3'),  -- F0030
  ('19789a90-b5ca-45f0-aac5-e3d652f2b292', 'Gomitas Celeste grandes', 'Gomita Azul Grande', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'),  -- G0003
  ('2d977824-2baa-4a58-ac05-a523c3ac9c2a', 'GUANTE VAQUETA x PAR', 'Guantes Cuero', '510afa7d-8c14-420f-aaf7-3141fd623693'),  -- G0006
  ('c1866f5f-546a-4384-accb-713ac9943897', 'Guantes de latex x 100', 'Guantes Latex', '510afa7d-8c14-420f-aaf7-3141fd623693'),  -- G0008
  ('e08f7200-e3ee-4408-ba92-48f44664a78c', 'GUANTE DE TELA NEGRO x par', 'Guantes Tela', '510afa7d-8c14-420f-aaf7-3141fd623693'),  -- G0010
  ('79b259eb-50ef-45c0-827b-ed7d39a6f6d1', 'T101AO Hoja calar Blister', 'Hoja Caladora 101Ao', '50ef9677-afb2-4ccd-9614-fa2854449299'),  -- H0003
  ('cae1afc1-7bd3-47da-b220-222004528ea6', 'T101B Hoja calar Blister', 'Hoja Caladora 101B', '50ef9677-afb2-4ccd-9614-fa2854449299'),  -- H0005
  ('83d8bec2-4adb-419a-8c40-41d6f59302a0', 'T118B Hoja calar Blister', 'Hoja Caladora T118B', '50ef9677-afb2-4ccd-9614-fa2854449299'),  -- H0010
  ('9456ce41-659c-4aac-9877-ce614ea2fb31', 'T301CD Hoja calar Blister', 'Hoja Caladora T 301', '50ef9677-afb2-4ccd-9614-fa2854449299'),  -- H0020
  ('62b57b9c-6438-4344-8f51-83a1160ec3f6', 'Lapiz Carpintero IMPOR NEGRO', 'Lapiz Carpintero', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'),  -- L0005
  ('bcd4e024-9a52-4662-aebe-ac237c68976e', 'LIJA AL AGUA AA #80', 'Lija Al Agua 80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0008
  ('de60eee1-6711-4901-81df-0912caa2ab95', 'LIJA AL AGUA AA #220', 'Lija Al Agua 220', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0013
  ('90c43d1c-ebc9-42f6-ad71-fb533b934c46', 'LIJA AL AGUA AA #280', 'LIJA AL AGUA 280', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0015
  ('358a3383-a1ce-4f00-8b6a-bf1affa5ab81', 'LIJA AL AGUA AA #320', 'Lija Al Agua 320', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0016
  ('aa22601c-0ead-4a0c-bc9a-c6aa385efcfd', 'LIJA AL AGUA AA #360', 'LIJA AL AGUA 360', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0017
  ('9e410cec-df14-4230-ba67-3c95f012685d', 'LIJA AL AGUA AA #400', 'Lija Al Agua 400', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0018
  ('411ccf42-dc1c-4b15-b798-23ece38d7cf7', 'LIJA AL AGUA AA #600', 'Lija Al Agua 600', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0019
  ('111f6a93-734d-4136-a613-c8eba4bfe8c6', 'LIJA A/AGUA AA MICROGRANO#1000', 'Lija Al Agua 1000', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0020
  ('10591c1b-fea8-4f79-83d0-ae27374db9e2', 'LIJA A/AGUA AA MICROGRANO#1200', 'Lija Al Agua 1200', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0021
  ('1a7f4d50-5ce1-4646-b244-f8f280a80559', 'LIJA A/AGUA AA MICROGRANO#1500', 'Lija Al Agua 1500', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0022
  ('7e0fbbba-c99c-4a01-8695-412b6c17f8ae', 'LIJA A/AGUA AA MICROGRANO#2000', 'Lija Al Agua 2000', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0023
  ('3546bdb3-4773-47af-90cd-b56f51ae394d', 'LIJA EN BANDA 6300 X 150 #60', 'Lija Banda 60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0029
  ('fa83271a-0173-44e1-bea9-47d7cb66e2ad', 'LIJA IMPORTADA NO PAST #80', 'Lija En Seco 80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0062
  ('379d4e08-dd4f-46b2-bfc6-65b2c22b0d7e', 'LIJA IMPORTADA NO PAST #100', 'Lija En Seco 100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0063
  ('1ea820f0-6958-45d6-905e-af3bd8639cc2', 'LIJA IMPORTADA NO PAST #120', 'Lija En Seco 120', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0064
  ('9ff616b7-37c6-4486-a77e-710ba31ae472', 'LIJA IMPORTADA NO PAST #150', 'Lija En Seco 150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0065
  ('8274facf-ade4-4ac0-97cf-a88334e37b67', 'LIJA IMPORTADA NO PAST #180', 'Lija En Seco 180', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0066
  ('0a1ca42b-499c-46d2-b2e5-16a96fb77278', 'LIJA IMPORTADA NO PAST #220', 'Lija En Seco 220', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0067
  ('505d6c87-3791-452f-9ed2-450dffa57a1c', 'LIJA IMPORTADA NO PAST #240', 'Lija En Seco 240', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0068
  ('94e927f6-ba1e-430a-93d7-b18131f401be', 'LIJA IMPORTADA NO PAST #280', 'LIJA EN SECO 280', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0069
  ('bf694874-4ab1-42ea-9ed9-6db3359ffbe3', 'LIJA IMPORTADA NO PAST #320', 'Lija En Seco 320', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0070
  ('07e0062c-1831-4935-8dab-3d7a5f5a9b27', 'LIJA IMPORTADA NO PAST #400', 'Lija En Seco 400', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- L0072
  ('360ec214-81e9-4f34-859c-26578cfb4f9f', 'Mango p/Rodillo NRO. 10', 'Mango Rodillo Chico', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- M0008
  ('7316bf81-7917-4e54-af5a-b26c1b54d5d6', 'Mango p/Rodillo NRO. 17', 'Mango Rodillo Grande', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- M0009
  ('c46658a8-dc4b-4fcd-9e81-8324f92abb79', 'Masilla Finish Zeocar x 4Kg', 'Masilla Finish', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- M0015
  ('705c6ec5-9273-451c-a86d-18d856927899', 'MECHA DIAM 2', 'Mecha 2', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0023
  ('c9aba7e9-dcf9-4937-a662-fd15e3d033c4', 'MECHA DIAM 2,25', 'Mecha 2,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0024
  ('747f7336-76ef-435e-b181-f7c083fe4491', 'MECHA DIAM 2,50', 'Mecha 2,50', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0025
  ('f8c08c1d-6aed-437c-ad4a-180156f9da11', 'MECHA DIAM 2,75', 'Mecha 2,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0026
  ('d0af23fb-00ef-4fd4-aade-beacf528caf0', 'MECHA DIAM 3', 'Mecha 3', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0027
  ('d1a7e791-1d3c-4c1e-a633-56933fb74ebc', 'MECHA DIAM 3,25', 'Mecha 3,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0028
  ('7d35f6d6-8fd2-4e2a-b3cd-968f5af99d24', 'MECHA DIAM 3,50', 'Mecha 3,50', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0029
  ('113f2eb4-c994-4376-9daf-329c87403ece', 'MECHA DIAM 3,75', 'Mecha 3,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0030
  ('f66e70d8-f3b6-4e19-8e15-8abbfbaa8b55', 'MECHA DIAM 4', 'Mecha 4', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0031
  ('0a8ac6cd-7767-4df9-81d9-413d0095edd2', 'MECHA DIAM 4,25', 'Mecha 4,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0032
  ('70edb02b-dae4-42b7-8c80-777324c2b13d', 'MECHA DIAM 4,50', 'Mecha 4,50', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0033
  ('07bac757-3165-4514-943e-6b5e197abdeb', 'MECHA DIAM 4,75', 'Mecha 4,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0034
  ('6b209144-b074-4c66-ae6e-c00c2173144b', 'MECHA DIAM 5', 'Mecha 5', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0035
  ('96209e71-3209-4b91-8552-b9b0f859cf1e', 'MECHA DIAM 5,25', 'Mecha 5,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0036
  ('656f98f2-7f9d-46cd-a25d-78a2ff2f8aa8', 'MECHA DIAM 5,50', 'Mecha 5,50', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0037
  ('8682b8a5-7ec2-4d95-977b-4dadd6724acc', 'MECHA DIAM 5,75', 'Mecha 5,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0038
  ('ed27abd7-7c8d-40d3-b918-f711ebc3fc8f', 'MECHA DIAM 6', 'Mecha 6', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0039
  ('e7acca3f-8d47-4927-8fe5-2cea545015ee', 'MECHA DIAM 6,25', 'Mecha 6,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0040
  ('7a5992e7-5377-4481-9c21-3dd1a0d43cef', 'MECHA DIAM 6,50', 'Mecha 6,5', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0041
  ('f14d550d-2118-4b25-a976-1a62c53b84e5', 'MECHA DIAM 6,75', 'Mecha 6,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0042
  ('aa8fc913-c26a-485c-960f-4cb5d16049d4', 'MECHA DIAM 7', 'Mecha 7', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0043
  ('0a71ff7c-bd54-4bb4-9d67-d0c8c3c07d1f', 'MECHA DIAM 7,25', 'Mecha 7,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0044
  ('1b144795-b2fa-4dd2-a05c-299dd318c417', 'MECHA DIAM 7,5', 'Mecha 7,5', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0045
  ('f9376277-a73c-4357-bb13-9c60d5fbddfe', 'MECHA DIAM 7,75', 'Mecha 7,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0046
  ('0806abbc-339d-49e4-83f7-d5720c704145', 'MECHA DIAM 8', 'Mecha 8', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0047
  ('e20ce8ad-fca3-482f-9535-04b7a076effd', 'MECHA DIAM 8,25', 'Mecha 8,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M00471
  ('585df7c6-88d2-4bac-96e2-0e2bc39e2ff9', 'MECHA DIAM 8,75', 'Mecha 8,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M00481
  ('8d16a78d-b216-42e9-ba9e-243f539eb6af', 'MECHA DIAM 9', 'Mecha 9', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0049
  ('8e7a4474-8057-4432-92b6-27d07ed4d4d7', 'MECHA DIAM 9,25', 'Mecha 9,25', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M00491
  ('7c2c7126-294e-4b46-b1af-186ef108f44e', 'MECHA DIAM 9,5', 'Mecha 9,5', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0050
  ('0f8a17d8-8600-4b6a-95b5-bb98b4104aae', 'MECHA DIAM 9,75', 'Mecha 9,75', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M00501
  ('c08aed36-691c-4b41-80c6-6ec8245a984a', 'MECHA DIAM 10', 'Mecha 10', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0051
  ('269d3010-8c76-4a73-835f-95c9b1e16641', 'MECHA DIAM 11', 'Mecha 11', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0053
  ('2ef47738-76b6-465d-bb2a-8175ba11a553', 'MECHA DIAM 12', 'Mecha 12', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0055
  ('273efba0-d07b-4295-bd25-855a14242952', 'MECHA DIAM 13', 'Mecha 13', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- M0057
  ('55d89204-3c9c-4f10-9c94-31ec9ce89162', 'PAÑO LUSTRE PICO ROJO', 'Pano Pulir', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3'),  -- P0001
  ('dda985d8-ed0c-4bff-8cb7-6d4a21e86b8a', 'Pasta Fina Zeocar X 1kg', 'Pasta Fina', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- P0005
  ('5545e48b-f7cd-4b99-8bf9-a10729bb57a1', 'Pincel Nº 20 - Cerda CHINA', 'Pincel N 20', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- P0017
  ('84583c11-0060-4540-874c-d1a972e0482c', 'Pincel Nº 25 - Cerda CHINA', 'Pincel N 25', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- P0019
  ('63c0b9b2-bb24-4aa0-a493-c7c0eea9d035', 'PUNTAS PH3 X 50MM', 'Ph3', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4'),  -- P0059
  ('5f0dd58c-fa4b-4f12-b7b2-c661fecc872d', 'Parker cab fijadora AISI304 4 X 1/2', 'Fijador 4 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0004
  ('7be577d9-e434-434c-a325-f2ed23ca1db3', 'Parker cab fijadora AISI304 4 X 3/4', 'Fijador 4 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0006
  ('8bb458bf-cd08-44c7-8339-8048e3b21b8c', 'Parker cab fijadora AISI304 6 X 1/2', 'Fijador 6 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0011
  ('76a43fab-b682-490a-b13d-403f799bf1e2', 'Parker cab fijadora AISI304 6 X 3/4', 'Fijador 6 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0013
  ('caee3fae-dd8a-467c-b129-fb4425c8a9cf', 'Parker cab fijadora AISI304 6 X 1"', 'Fijador 6 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0015
  ('65d8d16a-6c6e-4e57-8075-ef670875d92a', 'Parker cab fijadora AISI304 8 X 1"', 'Fijador 8 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0023
  ('0605008c-886f-4211-bff6-c498c6cd5e54', 'Parker cab fijadora AISI304 8 X 1 1/4', 'Fijador 8 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0024
  ('d0a92751-7828-4975-ac73-f95c09d006ec', 'Parker cab fijadora AISI304 10 X 3/4', 'Fijador 10 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0031
  ('2f7331b8-61ed-4912-a87e-63b88418a628', 'Parker cab fijadora AISI304 14 X 1"', 'Fijador 14 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0055
  ('81234934-0c7f-4aad-acd2-916874b80d36', 'Parker cab fijadora AISI304 14 X 1 1/4', 'Fijador 14 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFIJ0056
  ('10aac20f-882e-4d0e-8f8b-eb12ed4abbf2', 'Parker cab frezada AISI304 4 x 1/2', 'Frezado 4 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0004
  ('bffe7f48-2855-43d2-bdf1-0bbb320a8798', 'Parker cab frezada AISI304 4 x 3/4', 'Frezado 4 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0006
  ('e4d322e7-c385-4419-abad-7d2a16377cca', 'Parker cab frezada AISI304 4 x 1"', 'Frezado 4 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0008
  ('2a2215a0-7fab-4076-94ec-2e25b68c7819', 'Parker cab frezada AISI304 6 x 1/2', 'Frezado 6 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0011
  ('ab32d2fa-e101-48d9-b0bf-0db349abffdc', 'Parker cab frezada AISI304 6 x 3/4', 'Frezado 6 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0013
  ('50e545fd-3349-4a0e-bc59-75dbb2ff381f', 'Parker cab frezada AISI304 8 x 3/4', 'Frezado 8 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0021
  ('9a9d6481-1c9e-4657-be6d-813732a9193a', 'Parker cab frezada AISI304 8 x 1 1/2', 'Frezado 8 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0025
  ('d8a79b2a-8fae-4ffd-b23d-5379ae3c61cb', 'Parker cab frezada AISI304 10 x 1"', 'Frezado 10 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0033
  ('39ad84e1-a5fd-43e5-86a6-98e5d0dda5ec', 'Parker cab frezada AISI304 12 x 1 1/2', 'Frezado 12 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0046
  ('afc0f0fa-1b9d-4e56-bf82-f76f353eb61e', 'Parker cab frezada AISI304 14 x 1"', 'Frezado 14 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARFRE0055
  ('c84173d9-d68e-4196-abb8-4b556c655631', 'Parker cab gota AISI304 6 x 3/4', 'Gota Sebo 6 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0013
  ('cc31fa33-2afa-45a5-9a73-f5d6115d3935', 'Parker cab gota AISI304 6 x 1"', 'Gota Sebo 6 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0015
  ('328f0e7a-321d-4cd0-ba01-28014f329cdf', 'Parker cab gota AISI304 8 x 1/2', 'Gota Sebo 8 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0019
  ('2dbeb6a0-da40-4842-bb21-8aed35bd91da', 'Parker cab gota AISI304 8 x 1"', 'Gota Sebo 8 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0023
  ('66aadab1-ed4a-4591-bb97-34b6801a85a7', 'Parker cab gota AISI304 8 x 1 1/2', 'Gota Sebo 8 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0025
  ('c5dcb072-711c-47c4-94da-6d66f335780d', 'Parker cab gota AISI304 10 X 3/4', 'Gota Sebo 10 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PARGOT0031
  ('94d6b696-99e1-4e0e-bd5c-d7eec711afbc', 'PEROXIDO', 'Peroxido', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- PEROXIDO10
  ('2938616a-a66b-4085-88ee-6ec6fdbdb949', 'Arandela plana AISI304 5/32 x 12 x 1', 'Arandela Plana 5/32', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PLA0002
  ('549a4b87-5a8d-4986-9526-c71f8f9e3e4d', 'Arandela plana AISI304 3/16 x 13 x 1', 'Arandela Plana 3/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PLA0003
  ('e5efc4ae-cf98-4182-9a9f-23e7783670e1', 'Arandela plana AISI304 5/16 x18 x1,50', 'Arandela Plana 5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PLA0005
  ('6da0f5dd-aced-43df-a0b7-af49758a5fd0', 'Arandela plana AISI304 1/2 x 28 x 2', 'Arandela Plana 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- PLA0008
  ('729ee7fc-bc79-4c50-a897-cd66fb6318be', 'Rodillo Epoxi Nro 5', 'Rodillo Epoxy 5', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- R0032
  ('fc6cc486-596a-42cc-9325-61a01844df00', 'Rodillo Epoxi Nro 8', 'Rodillo Epoxy 8', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- R0033
  ('0115261b-0ba6-4d7c-8fea-a512aea75fac', 'Rodi p/resinar (repuesto) 10cm', 'Repuesto Rodillo Chico', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- R0034
  ('7df56169-6788-41a5-8ce9-3899671a6dd4', 'Rodi p/resinar (repuesto) 17cm', 'Repuesto Rodillo Grande', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1'),  -- R0035
  ('52c4964e-4904-4173-ae1d-ee568e0c0f2d', 'Sellador 3M PU550 Blanco x 310', 'Sellador 3M 550 Blanco Cartucho', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- S0001
  ('64027b3c-7d1f-4ebd-a8a5-5df4a1d3b047', 'Sellador 3M PU550 Negro x 310', 'Sellador 3M 550 Negro Cartucho', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- S0002
  ('3d45eb0a-5f8b-4170-8b55-acb73792aad3', 'Sellador 3M PU550 Negro x 600', 'SELLADOR 3M TIPO SALCHICHA NEGRO', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- S0004
  ('95fe4aef-e051-42f2-9d52-61e0332c5f55', 'SELLADOR 3M 4000UV', 'Sellador 4000Uv', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- S0005
  ('54e40759-be53-4a6c-b354-b297e97676e6', 'Tuerca autofrenante AISI304 3/16', 'Autofrenante 3/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TCAAUT003
  ('3b3536bf-2501-4b54-aa72-abb1462f27a1', 'Tuerca autofrenante AISI304 1/4', 'Autofrenante 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TCAAUT004
  ('3cb1010d-45b7-4198-a0ba-5a09f99d6319', 'Teroson 939 Ngro x420gr', 'Tereson Negro', '9da77e0c-22d0-4937-b1a9-83f5da2170a0'),  -- TEROSON
  ('9432712b-4725-4599-89d6-0da868af6022', 'Tirafondo cab hexag AISI304 1/4 x 2"', 'Tirafondo 1/4 X 2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TIRAF005
  ('6b8cc2b5-df13-40ab-bdbd-d9b6025e7eb6', 'Tirafondo cab hexag AISI304 1/4 x 2 1/2', 'Tirafondo 1/4 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TIRAF006
  ('b61647f2-2994-4a10-856b-f48b493e2f0c', 'TIZA BLANCA BARNIZADA', 'Tiza', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'),  -- TIZAS
  ('8b6623ac-3160-4ce7-abba-06c1e9b3158b', 'Tornillo cab fijadora AISI304 1/4 X 3', 'Tornillo Fijador 1/4 X 3', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TORFIJ0052
  ('751a63ff-bceb-4099-b931-d5acc482cac1', 'Tornillo frezado POZI AISI304 3/16 X 3/4', 'Frezado 3/16 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35'),  -- TORFRE0032
  ('eadb6acc-7f2d-4dfb-9416-d8ac60500a0c', 'WD-40 Grande', 'WD-40', '9da77e0c-22d0-4937-b1a9-83f5da2170a0')  -- W0001
;

update public.panol_materiales m
   set alias = public.consumibles_alias_sumar(m.alias, r.alias_viejo, r.descripcion),
       descripcion = r.descripcion,
       proveedor = 'Rebollar',
       categoria_id = coalesce(r.categoria_id, m.categoria_id),
       activo = true
  from _cns_reuso r
 where m.id = r.material_id
   and (m.descripcion is distinct from r.descripcion
        or m.proveedor is distinct from 'Rebollar'
        or m.categoria_id is distinct from coalesce(r.categoria_id, m.categoria_id)
        or m.alias is distinct from public.consumibles_alias_sumar(m.alias, r.alias_viejo, r.descripcion));

-- ── 2. Los 489 renglones sin material: alta ─────────────────────────────────
drop table if exists pg_temp._cns_alta;
create temp table _cns_alta (
  material_id uuid, codigo text, descripcion text, categoria_id uuid, unidad text,
  forma_entrega text, unidad_compra text, factor_compra numeric, costo_unitario_ars numeric
) on commit drop;
insert into _cns_alta values
  ('fd93857b-d6d8-50aa-a1c0-2775332e443e'::uuid, 'A0001'::text, 'Macho Acoples-Macho Rosca'::text, '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1'::uuid, 'unidad'::text, 'unidad'::text, 'unidad'::text, 1::numeric, 954.52::numeric),
  ('cc5befd2-e654-53b1-881f-d09e94c0691d', 'A00011', 'Macho Acoples-Hembra Rosca', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1187.9),
  ('5d81660a-565f-5e57-9438-98b4c248e8c6', 'A000111', 'Macho Acoples-Espiga', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1484.84),
  ('bbced445-4c41-5fb5-800f-986b858ba12e', 'A0001111', 'Espiga-Macho Rosca', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1039.5),
  ('6421427a-1abc-51bd-b201-57647f665429', 'A0002', 'Acople Rapido 1/4 Completo', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 4963),
  ('5bc755e4-1901-517c-b079-6abd1abe2451', 'A0004', 'AGUARRAS x 4Lts', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 4, 5189.245),
  ('461f9999-3b55-512e-966f-462dffae7c2a', 'A0005', 'ALAMBRE EN ROLLO X 1KG', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'rollo', 'unidad', 'kg', 1, 6615.46),
  ('75e41848-231f-5616-8fe7-024114116220', 'AB0000816', 'ABRAZ PERF INOX BANDA 9mm 8-16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 1722.2486),
  ('1c5269f5-86e7-5996-b3e1-0cdb3fd3ff81', 'AB0001222', 'ABRAZ PERF INOX BANDA 12mm 12-22', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 2655.0928),
  ('ed8258ad-c306-57fd-b898-9bbe991da2db', 'AB0001627', 'ABRAZ PERF INOX BANDA 12mm 16-27', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 2752.2884),
  ('742d0d61-836c-5681-aef1-4fe635041620', 'AB0002335', 'ABRAZ PERF INOX BANDA 12mm 23-35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 2822.6126),
  ('32b0f42c-5d9b-53c5-a4e9-1e7795264a0f', 'AB0003250', 'ABRAZ PERF INOX BANDA 12mm 32-50', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 3216.9783),
  ('c839b9e8-7c8c-57a6-9750-22c5bba9654f', 'AB0004248', 'ABRAZ PERF INOX SUPER PRESION 42-48', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 7620.3143),
  ('af45838b-8a58-5a19-a84c-85a81353cbee', 'AB0005058', 'ABRAZ PERF INOX SUPER PRESION 50-58', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 8610.0896),
  ('71d7577c-9f39-5f0d-b4c2-5414140bcf52', 'AB0005070', 'ABRAZ PERF INOX BANDA 12mm 50-70', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 3288.6817),
  ('ddf98ba5-020c-5dc2-a719-1a65f7b4c96e', 'AB006270', 'ABRAZ PERF INOX SUPER PRESION 62-70', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 9049.9228),
  ('97e397de-b13f-57a3-bbb9-c8df999191e1', 'AB007482', 'ABRAZ PERF INOX SUPER PRESION 74-82', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 9029.93),
  ('8498de05-7a08-5a0a-8f20-510b80269520', 'AB008088', 'ABRAZ PERF INOX SUPER PRESION 80-88', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 10303.0853),
  ('bb644f49-cdca-588b-937c-4b7500f97a77', 'AB008694', 'ABRAZ PERF INOX SUPER PRESION 86-94', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 9874.6062),
  ('c6ce5436-2c83-5440-9115-849e33b64c21', 'AB0090110', 'ABRAZ PERF INOX BANDA 12mm 90-110', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'canje', 'unidad', 1, 4072.4732),
  ('c25efd5f-db19-5fee-946e-f3bcc975aca6', 'AB092100', 'ABRAZ PERF INOX SUPER PRESION 92-100', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 10070.424),
  ('23f0c54f-40af-5a22-b18d-92833eda632e', 'AB110118', 'ABRAZ PERF INOX SUPER PRESION 110-118', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 11026.5355),
  ('0e52f583-4c43-593b-91ea-67558b54aba7', 'AB136144', 'ABRAZ PERF INOX SUPER PRESION 134-144', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 12284.7598),
  ('9eaab4c7-9a65-5f07-8c0e-4f3ed8640489', 'AB158164', 'ABRAZ PERF INOX SUPER PRESION 158-164', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 14273.3791),
  ('f4a1ff59-f13c-5d19-8b85-e0105f42f42a', 'AB162172', 'ABRAZ PERF INOX SUPER PRESION 162-172', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 15702.9163),
  ('07473de8-6ed8-5e2f-a4e8-fce035e1a0d7', 'AB270280', 'ABRAZ PERF INOX SUPER PRESION B24mm 270-280', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 39686.4),
  ('4733ba41-e444-54a6-8721-65178b5c7a23', 'ABRAZ002', 'Abraz tipo cremallera AISI304 8 x 22 band 8mm', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 1270.2421),
  ('a964210f-50e5-5cd4-9f39-f41c6334b216', 'AEROSOL1', 'Aerosol Negro Mate Doble A', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 4856.8),
  ('c17e47ed-6cb2-5288-ab44-5eaa90172231', 'AEROSOL2', 'Aerosol Negro Brilante Doble A', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 4856.8),
  ('b627c72c-92fb-5b5a-9e9b-204095614f44', 'ALCOHOL96', 'ALCOHOL 96 X LITRO', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 1, 4676),
  ('cb49baa0-0455-5b28-a208-d5ec0b13dd00', 'ALCOHOLBID', 'ALCOHOL 96 BIDON x 5Lts', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 5, 2694),
  ('a565509d-2db9-576c-b39a-0290ecbfa386', 'ALICATE', 'ALICATE', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 16287.93),
  ('dd3e06a7-8383-5d4c-a7cd-82eac53c9fc5', 'ALLFREME22', 'Allen MET cab frezada AISI304 M4 x 45', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 932.3609),
  ('dd7da146-40fc-5c27-a048-e38979ec052d', 'B0001', 'BALDE ALBAÑIL', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2108.2),
  ('ae82ac09-48ef-5eac-b72c-64956e7c35a3', 'B0007', 'Barbijo Simil N95', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 699.04),
  ('7c183887-8526-5bbf-b850-91e26e2dd26a', 'B0023', 'BLEM', '9319613e-f647-433a-ac41-f9412f31d524', 'unidad', 'unidad', 'unidad', 1, 6890),
  ('8c438c76-b3d7-5537-95ce-b27ff11ca49b', 'B00231', 'BASE ORBITAL DIAM.150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 31921.93),
  ('8425aafb-aa99-5879-890e-bbe9108aa472', 'B00232', 'BASE CON ABROJO DIAM. 150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 7400),
  ('cc582005-9cb6-5e4a-9e37-8c89684b82a5', 'B00241', 'BOLSA DE CONSORCIO REFORZADA 130-100', '9319613e-f647-433a-ac41-f9412f31d524', 'unidad', 'unidad', 'unidad', 1, 474.03),
  ('6b7e9756-1470-5751-9c92-93ef961049b9', 'B002421', 'BOLSA DE CONSORCIO REFORZADA 50-70', '9319613e-f647-433a-ac41-f9412f31d524', 'unidad', 'unidad', 'unidad', 1, 286.4677),
  ('1d37edc9-ee64-5f06-805b-9c9cc1f40135', 'B00245', 'BOLSA DE CONSORCIO REFORZADA 100-110', '9319613e-f647-433a-ac41-f9412f31d524', 'unidad', 'unidad', 'unidad', 1, 424.03),
  ('98a664a1-802a-5bbf-9e01-ec9ee64cf10a', 'B007-3TEL', 'BARBIJO 3 TELAS', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 56.63),
  ('28c5f80b-fa57-5d5c-a5b1-a1e950fd7039', 'C0006', 'CERA DESMOLDE X 4Lts - BALDE', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'litro', 1, 74031.6),
  ('03bd381d-d05f-589e-99bc-3bd111fe4e01', 'C0007', 'Cera Suiza x 18000cc', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 173974),
  ('25da5ad8-c001-5180-8bbb-d99419800456', 'C0009', 'CHAPITA PARA MASILLAR 12 X 10', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1993.17),
  ('04f58d6c-cbd6-5c80-bb66-7a374d6c8675', 'C0010', 'CHAPITA PARA MASILLAR 8 X 10', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1358.98),
  ('9d4846b8-5603-5c6d-b2a3-054ec23b8531', 'C0011', 'Ciano en GEL x 25ml', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 8383.673),
  ('9f4d0d0c-41b9-5041-ad2d-3bd68d15fbfe', 'C0012', 'Ciano x 25ml', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 7571.88),
  ('d7b78050-2a10-54ef-bedd-7010c2d68b68', 'C0013', 'CINTA AISLADORA 10Mt-3M Blanca', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 2846.3917),
  ('9e954808-ce2a-5742-b289-9ec5fc667a5d', 'C0017', 'CINTA AISLADORA 20Mts-3M Negra', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 2534),
  ('99a67d50-f2d0-57e2-9fcf-e966d986d2b4', 'C00171', 'CINTA AISLADORA 20Mt-3M Blanca', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 3609.6144),
  ('28a74df0-ea98-5356-b74e-b42b9d628f90', 'C001721', 'CINTA AISLADORA 20Mt-3M VERDE', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 3970.5758),
  ('0fd68f17-dbb1-55ed-964a-dacc141c881c', 'C00174', 'CINTA AISLADORA DOBLE A NEGRA', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 1656.36),
  ('415987f8-a98d-5dcd-bdb4-b2f788b2f3b6', 'C00175', 'CINTA AISLADORA DOBLE A ROJA', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 986.8684),
  ('79f76dc7-2043-5081-a18e-a8e49338c91a', 'C00176', 'CINTA AISLADORA DOBLE A BLANCA', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 986.8684),
  ('9022c4d8-7139-5efa-9eb1-e0f835d0ff72', 'C0023', 'CINTA EMBALAR 48x80MT TRANSP', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 1878.84),
  ('d2402f6e-e4e1-5036-9ecc-4fc3dde88f15', 'C0024', 'CINTA METRICA X 3Mts', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 5178.7235),
  ('a79c4629-40ea-52ec-af73-537344cf8d3a', 'C0025', 'CINTA METRICA X 5Mts', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 7390.8272),
  ('97d7b91f-cb14-5d7c-8eae-a0c3213de546', 'C00261', 'CINTA METRICA EVEL x 8MTS', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 21730),
  ('155c8faa-ab8f-55bb-893f-cddea9ac0651', 'C00263', 'CINTA METRICA EVEL x 5MTS', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 11640),
  ('a669c08c-ced8-58ba-ac59-277f350cf618', 'C0030', 'Cinta papel DobleA AZUL 48mm', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 5448),
  ('e22e9d43-4673-5af2-ba7e-ae3517f12da1', 'C0032', 'Cinta papel DobleA VERDE 48mm', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 5287.36),
  ('ee5cc002-0f0a-5a71-96b7-cb4f98b36eba', 'C0034', 'Cinta DobleA #988 18mm x 50mts', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 2059.2),
  ('e1cd9ba0-2efc-57cc-a0f4-116e37c8bb56', 'C0035', 'Cinta DobleA #988 24mm x 50mts', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 2786),
  ('615fee12-bf66-5160-97e1-0a898a2e8756', 'C0037', 'Cinta DobleA #988 48mm x 50mts', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 5423.6),
  ('5f66d79f-99a8-5720-acbb-a954f01a99a0', 'C0038', 'CLAVO CON CABEZA X Kg 8-20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 8335.7439),
  ('2e3d550e-b99a-5a84-b165-d0c4c63b6c67', 'C0039', 'CLAVO CON CABEZA X Kg 9-25', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 8335.7431),
  ('ea5b8283-4a22-550a-bab5-139a916a728d', 'C0043', 'CLAVO SIN CABEZA X Kg 8-20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 7636.78),
  ('181f3a90-5230-51c7-957c-6e69bd1f6273', 'C0044', 'CLAVO SIN CABEZA X Kg 9-25', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 7636.78),
  ('7811aff7-3d2c-5971-b6f8-5b70036c6510', 'C0045', 'CLAVO SIN CABEZA X Kg 10-40', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 7636.78),
  ('3ba85535-64c5-5eaf-bb80-9bc3caaeaaa8', 'C0046', 'CLAVO SIN CABEZA X Kg 9-30', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 7636.78),
  ('9eeb0e4a-1d3b-5cb5-b115-ec89618c561a', 'C00461', 'CLAVO SIN CABEZA xKG 9-35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'kg', 'peso', 'kg', 1, 7636.78),
  ('52bdb1e3-a7b8-5a11-a011-7044cbdc14b6', 'C0049', 'Cola Vinilica 1011 FANA 4 Kgs.', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 17725.4),
  ('555409e7-bec0-5717-a7be-9773361130cc', 'C0050', 'Cola Vinilica 1011 FANA x 20', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 82504.5144),
  ('1c567b1b-a999-533f-b440-96957f99f14b', 'C0053', 'CUTTER ECONOMICO X 18CM', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1596),
  ('26f4cbd3-61a3-566f-a5a6-395dae23e1d2', 'CENTROCHIC', 'CENTRO/SOPORTE COPA CHICO', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 6553.82),
  ('b90210e6-2cd1-5856-9426-f28a09636022', 'CENTROGDE', 'CENTRO/SOPORTE COPA GRANDE', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 11329.36),
  ('02b629eb-4217-59c1-bd29-55e063efeadd', 'D000111', 'DILUYENTE x Lt', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 1, 3341.8),
  ('c9cb1a49-b9bf-5857-a6d7-62b575c82abd', 'D00041', 'Disco de Lija 115mm #24', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1709.4),
  ('741e5fb3-b7ea-5dae-9794-2e649f8e8a1a', 'D0005', 'Disco de Lija 115mm #36', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1524.6),
  ('a0979fc1-c3d2-5f86-8f5e-46d8f78285e2', 'D0012', 'Disco de Lija 180mm #24', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 2756.6),
  ('cf360108-9fe2-5d55-bf3a-ed35c7017d93', 'D0013', 'Disco de Lija 180mm #36', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 2725.8),
  ('8f8df1ee-761b-5d07-84b0-3c719eebc002', 'D0019', 'DISCO DIAMANT CONTINUO 4,1/2', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 5493.8508),
  ('f56c7256-635a-5a7b-b445-cae93c193523', 'D0020', 'DISCO DIAMANT MULTIUSO 4,1/2', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 9218.7457),
  ('4381a9a6-dbef-5b2f-8e3d-cdf5f514051d', 'D0022', 'DISCO MULTIMATERIAL BOSCH115mm', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 15037),
  ('a917d681-4566-5124-b6c2-421cd2e6408a', 'D00221', 'DISCO MULTIPROPOSITO NEGRO', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 7183),
  ('42d42e89-9df0-59fc-a402-c7b0c0272ffc', 'D00222', 'DISCO MULTIUSO BREMEN', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 13484.02),
  ('6684f1cb-a290-5ff4-bf75-3c91a64b262b', 'D0023', 'Disco orbital 127mm # 40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 416.556),
  ('8e412540-bfe8-5523-83af-5db103270973', 'D0024', 'Disco orbital 127mm # 60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 310.0059),
  ('176706d4-794f-5a55-b1ad-0178234b1ef6', 'D0025', 'Disco orbital 127mm # 80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 310.0059),
  ('a51aeaaf-36c5-5103-aa72-27656341a50c', 'D0026', 'Disco orbital 127mm # 100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7008),
  ('74e91770-d215-5036-87a9-d3a9253fc02a', 'D0027', 'Disco orbital 127mm # 120', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7008),
  ('692da2ca-4a6f-59f7-8b34-f175d70c788b', 'D0028', 'Disco orbital 127mm # 150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7031),
  ('8bd012b3-0a57-56f6-bf66-376c708a2b47', 'D0029', 'Disco orbital 127mm # 180', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7008),
  ('398c8dfe-2527-5fd0-8525-cbe1a4cd9514', 'D0030', 'Disco orbital 127mm # 220', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7008),
  ('83823be6-eb07-540e-9075-baa4080ce522', 'D0033', 'Disco orbital 127mm # 320', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 207.7008),
  ('2f00a048-407b-57e8-9019-0cb792ba17ff', 'D0036', 'Disco orbital 127mm # 600', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 416.556),
  ('656d9e12-18a5-597f-afab-44519b2ec9a2', 'D0044', 'Disco orbital 154mm # 100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 449.5727),
  ('c78889c8-5c8f-5002-968c-c60d9d4692f6', 'D0050', 'Disco orbital 154mm # 280', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 449.5727),
  ('fb93aaed-f971-5e28-9be8-52897a768450', 'D0051', 'Disco orbital 154mm # 320', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 449.5727),
  ('b71d3609-0d33-5171-ba78-946e44fc6280', 'D0053', 'Disco orbital 154mm # 400', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 449.5727),
  ('f84c7d2c-460c-5cac-aa8f-dace68225e8d', 'D0056', 'Disco orbital 154mm # 1000', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 866.2304),
  ('de2b7ad7-866c-5d81-9929-02939fe87fd3', 'D0061', 'Discos de corte 4,1/2 DobleA', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1415.6792),
  ('a8d599b1-c85e-5373-aaca-040ab8b1c152', 'D00611', 'Discos de corte 4,1/2 Tyrolit', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 2785.264),
  ('cbf4c4d2-22c8-5cb0-b111-b0c1dadb33ee', 'D00641', 'Disco Corte Norton 4 1/2', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 403.65),
  ('0cb90704-7800-5185-8380-c4d60eeee149', 'D0065', 'Discos de desbaste 4,1/2', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 2602.2072),
  ('a055c181-e7d1-5f78-8933-b67ffe7e70dc', 'D0068', 'DISCO ABROJO diam. 180 #40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1568.85),
  ('5e865fbf-751b-5267-a4b6-060f5a96a13c', 'D0069', 'DISCO ABROJO diam. 180 #60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1568.85),
  ('2e3a0e07-be0e-5a51-af47-703460454e94', 'D0070', 'DISCO ABROJO diam. 180 #80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1568.85),
  ('d5e96cb9-907e-5d7a-8818-aeaa11dd2afb', 'D0073', 'DISCO ABROJO diam. 180 #150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1661.42),
  ('e243b775-b507-50c4-a0af-7d8fd5da1c0e', 'E0001', 'ELECTRODO 2,5 x KG', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'kg', 'unidad', 'kg', 1, 7200),
  ('f5a977b4-258a-5b58-b0b7-44d859be798a', 'E00011', 'ELECTRODO 3,25 x KG', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'kg', 'unidad', 'kg', 1, 7200),
  ('25d38eb0-d7f8-59c6-9a3d-8dd2286e08bd', 'E0002', 'ESPATULA NRO 40', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1714.89),
  ('6c844692-9ab7-50e7-bbb8-157310483a8c', 'E0003', 'ESPATULA NRO 60', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2022.7),
  ('f35b8f6d-c5f5-5ff3-b252-24e0c8cda404', 'E0004', 'ESPATULA NRO 80', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2190.76),
  ('276c87ba-656b-5909-95a8-c25427dbeed0', 'E0005', 'ESPATULA NRO 100', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2508.98),
  ('b138dd8c-01e5-50c7-893f-7a1acd967f7e', 'E00051', 'ESPATULA NRO 120', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2594.83),
  ('d9a27664-6986-5598-9933-d6fbd74870e5', 'E0006', 'Faja Lumbar', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 6683.04),
  ('99cb1bab-cae1-56d4-a2d0-b2271158bcab', 'E0007', 'ESPATULA NRO 160', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 2865.0529),
  ('869c351e-ba8d-551b-9aa1-8d43a7e518fa', 'E0010', 'ESPATULA RECTIFICADA', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 12480),
  ('dffd9369-85d1-545b-8c6a-36757176232b', 'E0014', 'Espatula Plastica Mediana', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 510.33),
  ('f4e0d36a-836e-5aa6-9fa3-c93b459a23a3', 'E0015', 'Espatula Plastica Grande', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 687.43),
  ('75694539-f3a1-5e9d-b942-69e2c545a459', 'EZETA0250', 'BROCA ACERO RAPIDO 2,50mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 2377),
  ('3f375135-12bf-5eaa-a9d5-788a64bf387a', 'EZETA0300', 'BROCA ACERO RAPIDO 3,00mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 2614.56),
  ('f1707b47-c0ed-57d9-b059-ed8da459ffa8', 'EZETA0800', 'BROCA ACERO RAPIDO 8,00mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 8008.0322),
  ('2a864403-5a0f-503a-9a7d-02b9d8f845f7', 'EZETA0975', 'BROCA ACERO RAPIDO 9,75mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 12266.4375),
  ('701f35fb-e0b0-5868-8c93-7d85434fdb35', 'EZETA1000', 'BROCA ACERO RAPIDO 10,00mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 13646.0206),
  ('8da21475-35ca-5544-8250-0b347f55dc6d', 'EZETA1500', 'BROCA ACERO RAPIDO 15,00mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 54657.0063),
  ('7255dc38-647c-5071-899e-b7db8ae8aa8a', 'EZETA1600', 'BROCA ACERO RAPIDO 16,00mm', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 63482.18),
  ('297521d3-7710-52db-a024-5aa6d6cad63f', 'F0004', '3,5 X 25 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 9.24),
  ('9d2e11a7-42c6-540e-9049-49a465475db9', 'F0008', '4 X 16 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 7.7),
  ('f983e1ed-603f-56b9-b68d-8684fdd5ae32', 'F0017', '5 X 100 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 63.14),
  ('f5cfb578-be6e-5537-92ce-5ba1e6a132dc', 'F00171', '4,5 X 70 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 37.73),
  ('d615157c-7846-53a0-a46f-6174ab2f4803', 'F0019', '5 X 80 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 47.74),
  ('1378f4a6-42be-5ef5-ab7a-ac2da546048b', 'F0020', '5 X 90 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 60.06),
  ('2ae8264f-251c-5ee8-bd57-6c6a8e090e34', 'F00201', '5 x 120 FIX', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 62.4932),
  ('5bc4eac6-de8c-5f77-bc9f-c71a38fb1849', 'F0024', 'Diluyente FANA 18Lts, 14Kg', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 18, 6805.9444),
  ('5f173a97-fefa-5053-8afc-ab5fae00a00e', 'F0025', 'Diluyente FANA 4Lts. - 2,8kg', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 4, 7064.75),
  ('4814a141-9e53-5c67-9ee5-d46ea3aeac41', 'F00251', 'FANA SPRAY 32 X 14KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 158408.1279),
  ('96b25205-091a-54d9-8b78-e3c5516cfaea', 'F0027', 'FICHA MACHO', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 1632),
  ('443c9ac2-5c6d-5f13-8724-22e56b22bb67', 'F0031', 'FILM PROTECTOR ANCHO 10cm', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 2478),
  ('9e7e4f4c-ecf4-54ad-8749-429055644425', 'F0032', 'FILM PROTECTOR ANCHO 50cm', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'unidad', 1, 14774.21),
  ('e897e9ec-df6d-5952-8305-121c4bb74007', 'F0033', 'FILTRO 3M 6001', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 23791),
  ('4db8bab2-ec2b-51d2-8671-aaac7837bf22', 'F0034', 'PREFILTRO 3M 5N11', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 3332.3101),
  ('e54c5b37-b6fc-522b-a619-8e6a39231fd4', 'F0035', 'Retenedor 3M 501 P/PREFILTRO', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 8397),
  ('63022e03-988d-54eb-a853-aef9d5c59708', 'F0037', 'FILTRO PINTURA FILPINT x10uni', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 10, 269.153),
  ('c807dfec-d472-5fff-8e92-62fafc727ff8', 'F00371', 'FILTRO PINTURA x10uni', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 10, 214.988),
  ('cb6cdb52-8c8d-5b4f-8392-021c739ab6ad', 'F0042', 'FLAP #40 IMPORTADO INOX', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 2537.0363),
  ('b3e88ef9-ff66-5ce2-80eb-ac6b1e0c5619', 'F0043', 'FLAP #60 IMPORTADO INOX', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 1771.4958),
  ('a5817f0a-d8bc-5963-b6df-c7bcaf324711', 'FIXDRYW812', 'FIX NEGRO DRYWALL 8x1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 14.34),
  ('dcbc2ef9-a77a-5e57-a8aa-c43bb160817e', 'FIXDRYW82', 'FIX NEGRO DRYWALL 8x2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 18.41),
  ('f74265ae-6c9f-5060-aca7-6e15e17f8e0c', 'G0004', 'Gomitas Celeste mediana', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 1736.56),
  ('678209a1-f0c1-5c0b-9ce7-260bd2dfb8c1', 'G0005', 'GRASA DE LITIO x Kg', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'kg', 'unidad', 'kg', 1, 17447.81),
  ('1d6473f1-140b-5237-9ef2-d83d58bace30', 'G0007', 'Guante moteado x Par', '510afa7d-8c14-420f-aaf7-3141fd623693', 'par', 'unidad', 'par', 1, 691.0785),
  ('ce92996e-f052-5bce-b3ee-e641df5e8358', 'G0009', 'GUANTES DE NITRILO X 100unid', '510afa7d-8c14-420f-aaf7-3141fd623693', 'par', 'unidad', 'unidad', null, null),
  ('08381605-951c-5c7d-9d8d-7944f2b2b2d4', 'GROW0002', 'Arandela Grower AISI304 5/32', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 14.633),
  ('b3b58978-8c85-511b-b969-b9f9e8efd040', 'GROW0004', 'Arandela Grower AISI304 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 24.703),
  ('6d32784a-b73e-5911-9388-0a38592b3b5f', 'GROW0005', 'Arandela Grower AISI304 5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 41.2268),
  ('ea2ce4eb-d1d3-5a6e-be1b-b6d62d59c461', 'GROW0006', 'Arandela Grower AISI304 3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 54.8656),
  ('91980a1a-6071-59ea-87c4-2f15c8357890', 'GROW0008', 'Arandela Grower AISI304 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 102.1879),
  ('da2263dc-0614-5f33-9a51-4cfcae055636', 'GROW0010', 'Arandela Grower AISI304 5/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 215.7089),
  ('33f7f3d8-330e-5ae2-9324-ef748d27a944', 'H0001', 'S1122 HF/VFHoja SIERRA Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 29300.2609),
  ('35974671-ac7a-5a69-886c-91defbd35b6e', 'H0002', 'S1130CF SIERRA SABLE Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 51083.07),
  ('fe5123ee-bed3-5405-bd19-d829f82c6cc8', 'H00022', 'SIERRA SABLE PAYA 9"', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 26780),
  ('f1084d79-9bb0-5f64-8d0d-406a798bdde7', 'H00023', 'SIERRA SABLE BOSCH EDGE', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 42700),
  ('0dc87a1e-839c-5f96-8740-347c3bc053f2', 'H00024', 'S1241HM SIERRA SABLE BOSH', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 38417),
  ('f1a69ef8-c13f-5be6-b522-09b9ce159483', 'H00025', 'SIERRA SABLE FIBER RL 9"', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 22930),
  ('55aa95a9-f889-5c06-94a8-cb8e0ae8552a', 'H0006', 'T101BR Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 11190.8023),
  ('dbddad39-2fdc-5b98-ac0d-8ae4a2f5082a', 'H0015', 'T127D Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 11492.548),
  ('2f9db813-164c-5518-9dc7-67bae6056b27', 'H0016', 'T130RIF Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 29900),
  ('162cb005-2968-5292-a17a-c2306e2a1373', 'H00161', 'T130RF PRO Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 19458.2),
  ('0c75390b-ece6-578c-a76f-3a2421d42670', 'H00163', 'T130 STARRET', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 7432),
  ('5a7f6db4-6cbc-58c3-952a-359fba962548', 'H0019', 'T244D Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 8289.1224),
  ('5ed0afa2-96db-5d86-8dad-999bcf3f6629', 'H0022', 'T318B Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 10694.57),
  ('e2c1e313-ba26-5f09-860b-8415df2f071c', 'H00221', 'T345XF Hoja calar Blister', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 8711.81),
  ('1ca5f66b-f5d0-5daf-9caf-6bbc428ccdb3', 'H0023', 'S1136 CHF SIERRA SABLE', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 50806.087),
  ('692bf284-482a-5158-ae1b-9cb481f2e729', 'HEX0004', 'Bulon hexagonal AISI304 3/16 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 134.5369),
  ('b9a8038b-7faf-581f-baba-25204f453b33', 'HEX0017', 'Bulon hexagonal AISI304 1/4 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 147.4749),
  ('724fa75c-4459-53d3-8359-dc03909f97b2', 'HEX0019', 'Bulon hexagonal AISI304 1/4 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 165.717),
  ('f4441991-d095-596a-911e-871c6e275489', 'HEX0020', 'Bulon hexagonal AISI304 1/4 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 194.0595),
  ('cb4c2672-f924-559c-8910-e49e58350599', 'HEX0021', 'Bulon hexagonal AISI304 1/4 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 229.762),
  ('11dc217f-5568-52f1-befa-97316ef63870', 'HEX0023', 'Bulon hexagonal AISI304 1/4 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 281.5307),
  ('499a6489-ef6c-55c5-b53b-b402c8cd0b5c', 'HEX0025', 'Bulon hexagonal AISI304 1/4 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 339.9323),
  ('0090627b-06c5-5513-9c67-be8a8fb2a8e8', 'HEX0027', 'Bulon hexagonal AISI304 1/4 X 3', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 409.9929),
  ('39f3d1a2-b66a-5caf-95c2-7a8b8551fb8b', 'HEX0029', 'Bulon hexagonal AISI304 1/4 X 4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 631.3055),
  ('cc48f654-3223-50e4-a0a1-1e4e8332cff4', 'HEX0040', 'Bulon hexagonal AISI304 5/16 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 319.2062),
  ('60fd18f8-2409-5873-9692-1f6a21d7c871', 'HEX0042', 'Bulon hexagonal AISI304 5/16 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 380.3611),
  ('ec126302-a839-508e-a429-90c5bad5e7b6', 'HEX0057', 'Bulon hexagonal AISI304 3/8 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 378.4948),
  ('4fab4a5f-716d-582f-bb2a-82f9edcd4e0d', 'HEX0059', 'Bulon hexagonal AISI304 3/8 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 456.8088),
  ('f398bcd2-a0cf-5830-b9fa-c364a5d5dad0', 'HEX0061', 'Bulon hexagonal AISI304 3/8 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 550.1815),
  ('43cd88ec-51f2-5435-b1a8-cbda6311ccd2', 'HEX0063', 'Bulon hexagonal AISI304 3/8 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 726.9817),
  ('f6526714-0b50-5e81-9f2d-1d32a22af0d0', 'HEX0065', 'Bulon hexagonal AISI304 3/8 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 729.5576),
  ('0a1e7d06-932a-5923-b38f-d2c4f4a234af', 'HEX0067', 'Bulon hexagonal AISI304 3/8 X 4"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1186.0238),
  ('d070673d-86db-5281-85e3-4292b901b726', 'HEX0091', 'Bulon hexagonal AISI304 1/2- 12 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 716.6874),
  ('2b4dc637-ef91-5702-a3ce-0541a24846c3', 'HEX0093', 'Bulon hexagonal AISI304 1/2- 12 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 870.7363),
  ('0805ffe3-6a5c-544d-ac0d-88b123724693', 'HEX0095', 'Bulon hexagonal AISI304 1/2- 12 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1014.8273),
  ('078329dd-2d6b-5297-933f-056fe0f68226', 'HEX0099', 'Bulon hexagonal AISI304 1/2- 12 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1570.7664),
  ('b2be3c13-6c94-5d3b-9c40-2c12af49d75d', 'HEX0100', 'Bulon hexagonal AISI304 1/2- 12 X 3 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1710.9838),
  ('63d18c3c-46ba-55ec-a7a4-817b979abe0c', 'HEX0101', 'Bulon hexagonal AISI304 1/2- 12 X 4"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1870.4634),
  ('0413a3e3-12e6-5794-88d3-6712608b00ca', 'HEX0144', 'Bulon hexagonal AISI304 5/8 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 2674.7084),
  ('cc11e8fe-ea7c-5e8e-968b-827abd6e405a', 'HEX0146', 'Bulon hexagonal AISI304 5/8 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 2451.5069),
  ('a3bf506d-65a5-5c86-8c06-88e4503e444d', 'HEX0147', 'Bulon hexagonal AISI304 5/8 X 3 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 2914.7851),
  ('92d056cf-7af6-5087-bd45-3ac35e4b07f6', 'HEX0160', 'Bulon hexagonal AISI304 3/4 X 3 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 4499.5397),
  ('b131d8f8-9159-5d79-a57a-86b3dedc6cd5', 'INTERFACE1', 'INTERFACE 6"', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 7189),
  ('647dd597-74c3-5520-9295-9528a2e58fe0', 'K0001', 'KEROSENE X LTS', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 1, 3870),
  ('b9529a30-c16d-54a2-a9c0-e8acfa8ab58f', 'L0002', 'LAMPARA LED CLASICA 14W FRIA', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 1872),
  ('b97867c6-4feb-58ae-a63d-e2b5dfe1ed73', 'L0003', 'LED HIGH WATTAGE 40W FRIA 220V', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 6858.8),
  ('b2cd99cd-b0e6-5332-8f31-6fb24cf551c0', 'L0011', 'LIJA AL AGUA AA #150', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 580.7774),
  ('b7a5fb40-3867-5604-8e85-6b4ee57596c3', 'L0012', 'LIJA AL AGUA AA#180', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 580.7774),
  ('74005ad5-babc-5a35-9490-a401b4ca3bbf', 'L0014', 'LIJA AL AGUA AA #240', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 580.7774),
  ('86c5fefb-dabb-5205-afdf-e1bb155b6c16', 'L0025', 'LIJA EN BANDA Ø 100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 4449.8835),
  ('53400086-a436-59e7-bf36-2a1c2f965df7', 'L0028', 'LIJA EN BANDA 6300 X 150 #40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'canje', 'unidad', 1, 27657.6329),
  ('d0974c4f-79fc-5ceb-a75b-891a86f9c1bb', 'L0037', 'Lija en rollo 0,12x45mts #36', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'metro', 1, 143906.1363),
  ('e9740680-ee93-5432-a104-d3cd25464847', 'L0038', 'Lija en rollo 0,12x45mts #40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'metro', 1, 130522.7237),
  ('d6d22a34-6706-5967-a915-88b34ef3da01', 'L0040', 'Lija en rollo 0,12x45mts #60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'metro', 1, 108139.72),
  ('4f8bee8e-263f-59a9-abf0-070b989f653e', 'L0041', 'Lija en rollo 0,12x45mts #80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'metro', 1, 99070.5444),
  ('d49c80cb-9a72-56b5-b290-9b6a245d629e', 'L0042', 'Lija en rollo 0,12x45mts #100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'metro', 1, 90004.0977),
  ('64608200-bb8a-5bb8-99f7-ea6b8c8ad70c', 'L00431', 'Rollo Lija #40 Importado', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'unidad', 1, 113360),
  ('233c9d5f-b20c-5649-9167-ec994b21aa9d', 'L00432', 'Rollo Lija #60 Importado', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'unidad', 1, 74280),
  ('bd862547-de6a-53fb-ad7b-1ce980547d75', 'L00433', 'Rollo Lija #80 Importado', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'rollo', 'unidad', 'unidad', 1, 66830),
  ('08bbab31-1503-5890-bb24-855991f6b5b8', 'LIJA100XMT', 'LIJA X METRO #100', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'metro', 'unidad', 'metro', 1, 2111.7483),
  ('304276bc-2e83-57a5-b123-aa2beca3b87b', 'LIJA36XMTS', 'LIJA X METRO #36', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'metro', 'unidad', 'metro', 1, 3379.0735),
  ('e7824807-a0c6-5d1e-94ec-12013a0e08ff', 'LIJA60XMTS', 'LIJA X METRO #60', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'metro', 'unidad', 'metro', 1, 2537.4148),
  ('45490326-9e74-5790-9999-14e488d7c9d0', 'LIJA80XMTS', 'LIJA X METRO #80', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'metro', 'unidad', 'metro', 1, 2324.5815),
  ('f66e874a-ae0f-5197-a6be-528d43d08ba6', 'M00001', 'MAMELUCO SIN LAMINAR 60gr', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 4743.3725),
  ('cc28ff62-2f88-56f2-9cfe-6bcee048fcbe', 'M0001', 'MAMELUCO BLANCO LAMINADO', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 5143.0949),
  ('cc1d67d4-3ca5-56a2-b472-9d096b744519', 'M0001REF', 'MAMELUCO BLANCO REFORZADO', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 6830),
  ('5d19a796-ed6c-5c60-890c-fa386ac89237', 'M0002', 'MANDRIL P/PIROBANDA Ø 10', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 14246.5562),
  ('3e1a6cdc-519d-529a-acd5-4ea1e9c360e5', 'M0003', 'MANDRIL P/PIROBANDA Ø 15', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 16357.1684),
  ('0d175b3f-b186-5353-b3c2-d668f5b504e2', 'M0004', 'MANDRIL P/PIROBANDA Ø 19', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 16608.4225),
  ('847fc700-c949-5c39-9550-f73df034aef2', 'M0005', 'MANDRIL P/PIROBANDA Ø 25', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 16859.691),
  ('8219fd98-24f2-5a7e-99cf-dc544fbbc1ab', 'M0006', 'MANDRIL P/PIROBANDA Ø 30', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 19246.6768),
  ('60500be3-bc25-5e4e-9e20-13c63861c653', 'M0007', 'MANDRIL P/PIROBANDA Ø 45', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 23744.2748),
  ('6b9406e7-679f-5b33-a6be-178291558d0f', 'M0010', 'Mascara 3M 6200', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 48987),
  ('0866e067-4941-52f5-b02b-994b7432f6dc', 'M0016', 'Masilla Zeocar Azul x 1Kg', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 10998.0455),
  ('fd222193-7c62-515e-98e1-81b9b179bfa8', 'M0017', 'Masilla Zeocar Azul x4KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 26862),
  ('889a63b7-c673-5a9a-8167-c694319257b7', 'M0018', 'METRO MADERA X 1MTS', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 4994),
  ('282a267c-3e00-5f12-b983-cd4521ad401b', 'M0048', 'MECHA DIAM 8,50', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 4230.05),
  ('eed0a3a4-7c12-59bf-8c17-04a46f72d762', 'M0059', 'MECHA DIAM 14', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 18415.72),
  ('710d694c-a42d-5440-bc07-d3c4677edc94', 'MANG013', 'MANG CRISTAL C/ALAMB ATOX DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 4950.4),
  ('029c41f5-40d9-55b9-aa15-f5539857a1a2', 'MANG014', 'MANG CRISTAL C/ALAMB ATOX DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 6554.6208),
  ('c64cd2fa-7b75-5a8f-bfed-93aef3e28857', 'MANG015', 'MANG CRISTAL C/ALAMB ATOX DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 9623.0938),
  ('6ec969bb-b05e-5a68-943b-fb40b4991b80', 'MANG016', 'MANG CRISTAL C/ALAMB ATOX DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 14328.9317),
  ('99cb2250-414d-51ca-8557-0714ab343803', 'MANG017', 'MANG CRISTAL C/ALAMB ATOX DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 19446.0739),
  ('53486be5-777d-585e-bb73-6a9bb7c836e6', 'MANG021', 'MANG MALLADA ROJA DIAM 10mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 2962.5537),
  ('615dc2d9-cb68-5c81-9899-b959d3d3b9dd', 'MANG026', 'MANG CRISTAL HIDROCAR DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 1562.4504),
  ('3163c19e-60a0-5296-8d75-6a9e3c914dee', 'MANG028', 'MANG CRISTAL HIDROCAR DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 3968.7813),
  ('79c730d0-4bcc-5d74-a548-644b791581c3', 'MANG029', 'MANG CRISTAL HIDROCAR DIAM', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 4659.2),
  ('92dee530-62ba-5262-99dc-da35c62ffa6e', 'MANG031', 'MANG MALLADA ATOXICA (SOLYON)', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 3970.3459),
  ('5df151ca-d3ad-5ee2-97e4-449908a4d7ba', 'MANG0332', 'MANG GOMA Y TELA DIAM 38mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 32949),
  ('d0d45d64-6795-5bf0-a111-96e64c6887be', 'MANG034', 'MANG GOMA Y TELA DIAM 127mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 135406),
  ('88f7a2cb-d08b-59b0-9d9d-bfd221988b03', 'MANG036', 'MANG GOMA Y TELA DIAM 150mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 163775),
  ('11edda97-af98-5bc0-8024-f736e2d43565', 'MANG037', 'MANG GOMA Y TELA DIAM 90mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 63067.8645),
  ('373c7f72-fd65-5e3d-b7ab-f2096fd971dc', 'MANG0381', 'MANG GOMA Y TELA DIAM 76mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 54221.0244),
  ('f81df312-5e76-5df4-862f-741aa0fad6bb', 'MANG0382', 'MANG GOMA Y TELA DIAM 250mm', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 268300),
  ('3272feb0-2ccc-504f-acf2-d7e199921f0a', 'MANG041', 'MANG GOMA, TELA Y ALAMBRE DIAM', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 41919.36),
  ('6ce296e6-71f4-5dab-b878-82ab329889b8', 'MANG042', 'MANG GOMA, TELA Y ALAMBRE DIAM', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 46185.53),
  ('4b3ec3c9-7ee1-5887-983c-6a06f4b1f9ae', 'MANG0422', 'MANG GOMA, TELA Y ALAMBRE DIAM', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 54666.5805),
  ('34afd23e-d763-57b5-840d-1b4780b50290', 'MANG054', 'MANGUERA RECYLON PLUS', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 2749.705),
  ('279a0775-d20a-5c4e-abf8-23c15bc207dd', 'MECHCOPA32', 'MECHA COPA DIAM32', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 7340),
  ('d7f673fc-8466-5844-8dde-59881e55231a', 'MECHCOPA57', 'MECHA COPA DIAM57', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 10760.049),
  ('c369bbef-3e12-53ea-9e69-35ca3e31a1a3', 'MECHCOPA76', 'MECHA COPA DIAM76', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'canje', 'unidad', 1, 14077.2799),
  ('cf8fed0d-9fc5-524a-9d91-2c591d95d97f', 'NYLONBURBU', 'PLURIBOL x25mts', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 20940),
  ('7c1fb350-3b60-5852-9974-cc8e11514f28', 'P0004', 'PAPEL HIGIENICO x 30 rollos', '9319613e-f647-433a-ac41-f9412f31d524', 'rollo', 'unidad', 'rollo', 30, 548.508),
  ('8f43125e-eded-5c7f-a7d9-2afe3dd8d211', 'P00041', 'PAPEL HIGIENICO ROLLO GRANDE', '9319613e-f647-433a-ac41-f9412f31d524', 'rollo', 'unidad', 'unidad', 1, 1837.5),
  ('83820413-2fab-5877-b3a4-f37fdf3f2230', 'P00113', 'PASTA GRUESA ZEOCAR X 1/2 KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 7627),
  ('c3b066a8-b292-5939-b256-1fc77a03ea1b', 'P0013', 'PINCEL LETRISTA/RETOQUE Nro 2', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 869.71),
  ('b8f260a6-87ab-579d-939b-7e5dc54ba2a9', 'P0014', 'PINCEL LETRISTA/RETOQUE Nro 4', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 1094.39),
  ('c2f751c2-dd3b-5799-83d4-696a745ced00', 'P0015', 'PINCEL LETRISTA/RETOQUE Nro 6', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 1297.33),
  ('a357e07c-084b-5e3d-95d2-72884a2591db', 'P0016', 'PINCEL LETRISTA/RETOQUE Nro 8', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 1507.5),
  ('7740b5a8-fbe2-5c8f-a2f4-b0521d772406', 'P00161', 'PINCEL LETRISTA/RETOQUE Nro 10', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 1978.6),
  ('4048c294-c0af-577a-924b-1fa78319e3de', 'P0021', 'PINCEL Nro 10', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 771.1095),
  ('54d95007-3e7b-5aea-9950-41b037311d8f', 'P0027', 'PIROBANDA Ø 10 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 3276.0307),
  ('e0ed4091-bd9f-5e83-9a7e-8552bbff11b0', 'P0029', 'PIROBANDA Ø 15 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 3742.508),
  ('5d295ef0-dc46-5be3-9956-cead77fe26f3', 'P0031', 'PIROBANDA Ø 19 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 3953.6339),
  ('e6ff3727-2f4f-5ee3-92fd-a9d034ba9e44', 'P0033', 'PIROBANDA Ø 25 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 4285.1733),
  ('cb695722-1a1a-5717-92f8-6db6142af3bf', 'P0035', 'PIROBANDA Ø 30 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 4493.4944),
  ('c0a8d2d1-0b64-5ab4-b9de-163e7613a17d', 'P0037', 'PIROBANDA Ø 45 #36/40', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 4905.6696),
  ('a097b954-3c3f-5f74-9957-94b3e2974993', 'P00391', 'PISTOLA SOPLETEO', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 9566.58),
  ('0e74d697-0ab9-5fa9-8db6-fc824c86684e', 'P00392', 'PISTOLA SOPLETEO LARGA', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 10404.18),
  ('a5a8968b-4a49-5bb3-9713-e59182f236bb', 'P0040', 'PLASTILINA GRANDE', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 3170),
  ('c81e1a24-1f16-5485-85e9-5eaaa3ecbc4b', 'P0041GRIS', 'POXIPOL 700ml GRIS', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 80788.581),
  ('d892b0c2-1f3f-5d7d-8aac-9d09a783b78b', 'P0041TRANS', 'POXIPOL 700ml TRANSPARENTE', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 80788.581),
  ('56a9afe2-6009-5170-92b5-ed7a33c2ddbb', 'P0043', 'POXIPOL MEDIANO x 70ml', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 13233.4525),
  ('2e4c629e-ef64-5e8d-a805-59dfefaf8f12', 'P0045', 'PRECINTOS X 15cm x100unid', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 100, 18.6646),
  ('94e71efb-89e5-5600-929f-fe872d6daa55', 'P0047', 'PRECINTOS X 25cm x100unid', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 100, 31.848),
  ('4bd28ceb-764c-5085-b3a6-119c766c3199', 'P0048', 'PRECINTOS X 30cm x100unid', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 100, 45.7291),
  ('c037c25d-c97a-5649-87e8-6ae23512aa62', 'P0049', 'PRECINTOS X 40cm x100unid', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 100, 64.1),
  ('cd74e3a1-c04f-533e-876d-26fb6e930eed', 'P00492', 'PRIMER TEROSON', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 139723.75),
  ('3c013db9-08a6-5b16-97e5-c83e99b8dfc5', 'P0051', 'PROTECCION AUDITIVA', '510afa7d-8c14-420f-aaf7-3141fd623693', 'unidad', 'unidad', 'unidad', 1, 612.86),
  ('95d890f3-9c84-5ee2-8178-212a85182de0', 'P0053', 'PUNTAS PH1 X 50MM', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 692),
  ('c536929a-c8ed-5ab1-a4b1-d554d9d0a525', 'P0053BOSCH', 'PUNTAS PH1 X 50MM BOSCH', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 1355.03),
  ('148d2aa8-6e58-5ab6-a045-f3a0bb1614bb', 'P0055', 'PUNTAS PH2 X 50MM', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 692),
  ('2e7436a4-7f64-5043-aacd-a5999a30ba6a', 'P00561', 'PH2x65 IMPACTO DOBLE PUNTA BOSCH', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 1775.36),
  ('2b8c9b0d-f148-5104-9bb3-44f945681f5d', 'P0056BOSCH', 'PUNTAS PH2 X 50MM BOSCH', 'acb05cd4-8ed9-4086-b6e1-7fe18e2ee8d4', 'unidad', 'unidad', 'unidad', 1, 1148.14),
  ('54ff7f00-a3c2-5ee7-9b17-483c54870b76', 'P0068', 'Prolongador Schneider 4 tomas', 'a62827c4-5eef-4886-881f-34f02ccc8148', 'unidad', 'unidad', 'unidad', 1, 12350),
  ('1f5c93a9-209a-55cf-ba71-655f7f5746d5', 'PARFIJ0008', 'Parker cab fijadora AISI304 4 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 34.2804),
  ('ae30ca5a-a2d6-57cf-ac00-9efa03df3d0b', 'PARFIJ0016', 'Parker cab fijadora AISI304 6 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 49.2946),
  ('18948d18-8a04-5d3a-a263-1900f8b37125', 'PARFIJ0017', 'Parker cab fijadora AISI304 6 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 53.4132),
  ('3f11c255-6287-50a4-baba-b0b8a3bbd06c', 'PARFIJ0019', 'Parker cab fijadora AISI304 8 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 48.6486),
  ('7bf43dfc-0401-5b56-9b36-7a5b5c504677', 'PARFIJ0021', 'Parker cab fijadora AISI304 8 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 50.3203),
  ('756f04eb-be99-57ef-8f08-412fc1f36b82', 'PARFIJ0025', 'Parker cab fijadora AISI304 8 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 71.302),
  ('8a2ac312-df65-5928-967f-17f985624397', 'PARFIJ0027', 'Parker cab fijadora AISI304 8 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 81.3137),
  ('397746ae-6936-50b0-928a-ce5ba55352ea', 'PARFIJ0029', 'Parker cab fijadora AISI304 10 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 51.4901),
  ('8b1ff12c-a2d9-5115-8c8b-2db0785c622e', 'PARFIJ0033', 'Parker cab fijadora AISI304 10 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 66.7945),
  ('211552e6-c378-5212-b169-227a0bd452d6', 'PARFIJ0034', 'Parker cab fijadora AISI304 10 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 68.1727),
  ('8f36696b-e566-513c-bfad-ef6facb7951f', 'PARFIJ0035', 'Parker cab fijadora AISI304 10 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 85.6566),
  ('b0ff2ffb-f40d-5af0-8f2d-e1b282f6b1df', 'PARFIJ0037', 'Parker cab fijadora AISI304 10 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 99.2463),
  ('ba265274-6c51-553f-b41b-10c5378dd96e', 'PARFIJ0039', 'Parker cab fijadora AISI304 10 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 115.3199),
  ('aa5cb6bc-4197-5a2a-ac6a-b168c2e4dfb8', 'PARFIJ0040', 'Parker cab fijadora AISI304 12 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 86.6712),
  ('31c8017a-e2bd-59e4-bb61-375587f1a224', 'PARFIJ0042', 'Parker cab fijadora AISI304 12 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 87.5797),
  ('1a7e2969-e4b5-5355-8058-7bb89585613b', 'PARFIJ0044', 'Parker cab fijadora AISI304 12 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 96.8425),
  ('8d951f59-2146-5f36-a86f-a608e7701193', 'PARFIJ0045', 'Parker cab fijadora AISI304 12 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 102.0988),
  ('3848fc6a-8940-592f-bbbd-0897d7d99512', 'PARFIJ0046', 'Parker cab fijadora AISI304 12 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 108.1565),
  ('a487980f-0c47-56a9-8800-1e598abbdd3c', 'PARFIJ0051', 'Parker cab fijadora AISI304 14 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 152.0904),
  ('a4c23298-df72-5b60-9f79-3fa0f4956703', 'PARFIJ0053', 'Parker cab fijadora AISI304 14 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 122.3071),
  ('1ccc553f-ed5e-5a96-95f6-a47c3886532f', 'PARFIJ0057', 'Parker cab fijadora AISI304 14 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 179.9952),
  ('d3f1b80e-0aeb-55e5-b412-500a76b7f255', 'PARFRE0015', 'Parker cab frezada AISI304 6 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 44.429),
  ('9491db98-9d88-524d-8f3a-7a953bc284f4', 'PARFRE0016', 'Parker cab frezada AISI304 6 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 48.8026),
  ('52f76b57-000a-5d17-8cc7-aab79938b749', 'PARFRE0017', 'Parker cab frezada AISI304 6 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 52.8836),
  ('53b05c05-6b3d-5f03-bae4-6aec54f8dafb', 'PARFRE0019', 'Parker cab frezada AISI304 8 x 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 43.5575),
  ('c4605923-d1a5-5d3d-8831-2650fe5e136d', 'PARFRE0023', 'Parker cab frezada AISI304 8 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 56.7336),
  ('c6827bf0-74b1-53c5-8dde-95363ff2c45f', 'PARFRE0024', 'Parker cab frezada AISI304 8 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 61.8926),
  ('f6b9dd73-c440-57b4-95ea-de1440aaea41', 'PARFRE0027', 'Parker cab frezada AISI304 8 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 80.5112),
  ('dd014f6b-2ed1-54b6-9ee2-b7e5ee9350c5', 'PARFRE0029', 'Parker cab frezada AISI304 10 x 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 51.4901),
  ('00735ef8-9aa9-5bd4-8849-f73a2ccf8a1f', 'PARFRE0031', 'Parker cab frezada AISI304 10 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 64.2304),
  ('b5f0282f-452d-58c4-b396-2e0d98b0ca44', 'PARFRE0034', 'Parker cab frezada AISI304 10 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 68.1727),
  ('a771f25a-8826-565e-a585-e20934f5c55e', 'PARFRE0035', 'Parker cab frezada AISI304 10 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 85.6566),
  ('3da05fe3-61e8-53ef-8677-8d5c7c298c1f', 'PARFRE0037', 'Parker cab frezada AISI304 10 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 99.2463),
  ('08fe4829-3548-5c4a-a72d-159fcce30c7e', 'PARFRE0039', 'Parker cab frezada AISI304 10 x 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 115.3199),
  ('080f9d05-b6f1-5ccf-a8c2-281a9852c465', 'PARFRE0042', 'Parker cab frezada AISI304 12 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 87.5797),
  ('fba98c11-3702-5ac2-bbc6-8629157317c6', 'PARFRE0044', 'Parker cab frezada AISI304 12 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 96.8425),
  ('216a2b81-ae30-5158-8c4c-51ef4d5ebc50', 'PARFRE0045', 'Parker cab frezada AISI304 12 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 102.0988),
  ('86a00398-4b28-5c70-b487-429fdb95b139', 'PARFRE0050', 'Parker cab frezada AISI304 12 x 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 133.573),
  ('481558c3-3a1f-554b-b5cb-4c9764d006e9', 'PARFRE0057', 'Parker cab frezada AISI304 14 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 162.371),
  ('3ac70598-4de5-5a55-a4a7-a9e2dc47b69e', 'PARFRE0062', 'Parker cab frezada AISI304 14 x 2 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 267.498),
  ('c937ae8e-c162-57f5-b496-9af9ebd29e05', 'PARGOT0004', 'Parker cab gota AISI304 4 x 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 28.4293),
  ('5c074258-f0f2-55d1-86dc-f6c71492373a', 'PARGOT0006', 'Parker cab gota AISI304 4 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 31.8428),
  ('47394ef7-1539-55d7-b005-1e1cf1e919a8', 'PARGOT0008', 'Parker cab gota AISI304 4 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 34.6152),
  ('fa34dfad-73f9-5f86-8f2a-5619a74a8931', 'PARGOT0011', 'Parker cab gota AISI304 6 x 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 34.4344),
  ('009e1368-ad3c-5802-8bb3-fb4b22250dc9', 'PARGOT0016', 'Parker cab gota AISI304 6 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 49.2946),
  ('9ac4fcdb-e562-5fed-bf64-efb5aa50fc4b', 'PARGOT0017', 'Parker cab gota AISI304 6 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 52.8836),
  ('e9421ee5-b617-5828-a9c1-454af9ccc439', 'PARGOT0021', 'Parker cab gota AISI304 8 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 55.902),
  ('56990867-4b92-58b5-b454-39aa6764e671', 'PARGOT0024', 'Parker cab gota AISI304 8 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 69.3154),
  ('10b0c810-3ea4-52d2-9ce2-b83448fb2729', 'PARGOT0027', 'Parker cab gota AISI304 8 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 81.3137),
  ('95bbc0de-5973-58d8-b46c-bfdbed4a9ddb', 'PARGOT0029', 'Parker cab gota AISI304 10 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 51.4901),
  ('45f5be64-da42-54cc-9e3c-18b31adc1ae3', 'PARGOT0033', 'Parker cab gota AISI304 10 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 66.7945),
  ('77fc96ec-df84-539c-a101-44181e405b1c', 'PARGOT0034', 'Parker cab gota AISI304 10 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 68.1727),
  ('272c0a85-199b-5844-97a0-5a9f04d228a1', 'PARGOT0035', 'Parker cab gota AISI304 10 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 85.6566),
  ('1d8b1c0d-41f3-545a-97c3-ee05ee010a16', 'PARGOT0040', 'Parker cab gota AISI304 12 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 86.6712),
  ('7b40864f-b1fb-556c-897d-fbd155b959a1', 'PARGOT0042', 'Parker cab gota AISI304 12 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 87.5797),
  ('3ea09c28-dbc1-5365-a8ec-f1a319dfac37', 'PARGOT0044', 'Parker cab gota AISI304 12 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 107.3226),
  ('c5da0b94-2df9-5550-8df5-b519906dee26', 'PARGOT0045', 'Parker cab gota AISI304 12 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 102.0988),
  ('190ef04a-f98b-535a-8657-3c6a538ca178', 'PARGOT0046', 'Parker cab gota AISI304 12 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 108.1565),
  ('643666ce-d154-5b3a-8913-7f49a42f8b15', 'PARGOT0051', 'Parker cab gota AISI304 14 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 129.36),
  ('4f324d8b-06ad-5f9b-b14e-e5cc888e9af5', 'PARGOT0053', 'Parker cab gota AISI304 14 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 164.8724),
  ('20acaaf3-7450-5527-850a-6e2c7be1abb0', 'PARGOT0055', 'Parker cab gota AISI304 14 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 153.1376),
  ('d59af87c-eabf-5544-82af-62870b354747', 'PARGOT0056', 'Parker cab gota AISI304 14 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 153.5088),
  ('e1d93233-27f9-51a7-861a-85bb959bbd21', 'PARGOT0057', 'Parker cab gota AISI304 14 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 162.371),
  ('7e078853-4605-50ea-85d8-69aa14c21975', 'PISTOLA310', 'PISTOLA APLICADORA X 310', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 6530),
  ('45cefa68-4709-5968-ab7f-4cf06156f474', 'PISTOLA600', 'PISTOLA APLICADORA X 600', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 24870),
  ('9bffc194-73de-5927-a468-d54b1b5145e2', 'PLA0004', 'Arandela plana AISI304 1/4 x 14 x 1,50', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 21.795),
  ('35f38d45-2c98-58e1-8a9d-3d7f8906553f', 'PLA0006', 'Arandela plana AISI304 3/8 x20 x1,50', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 41.3067),
  ('d9ec8c84-4634-52f4-b895-25d1e182249e', 'PLA0010', 'Arandela plana AISI304 5/8 x 35 x 2,5', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 252.4618),
  ('c506ff9f-9bcf-5c5f-bb27-d4b311b01179', 'PLA0011', 'Arandela plana AISI304 3/4 x 40 x 3', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 339.8152),
  ('e4866db8-8e18-5c54-9168-d7f0f103cb0e', 'PLACHA0004', 'Arandela chapista AISI304 3/8 X10,50 X 35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 313.8972),
  ('be8eaaed-387d-5293-846b-c2a62e974d99', 'R0027', 'CATALIZADOR P/RESINA UREICAxKG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'kg', 'unidad', 'kg', 1, 10205.58),
  ('dc549875-5f90-54cb-9695-0a6ad026ada0', 'R0028', 'Resina Ureica x KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'kg', 'unidad', 'kg', 1, 4432.4326),
  ('efaefd36-3182-5c6d-bf55-d12a7de48e4b', 'R0029', 'RESPALDO Ø4,1/2', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 3959.6914),
  ('3248c4d5-9bc8-5752-b081-3c1fcfc2913f', 'R0030', 'RESPALDO Ø7', '16b7f20d-dc82-4dbb-a9c2-e1863e18b7a3', 'unidad', 'unidad', 'unidad', 1, 4956.5578),
  ('8779aaab-3d55-5ef0-9620-f1b692c3dba7', 'R0031', 'Rodillo Epoxi Nro 11', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 867),
  ('644ba519-6c4e-58db-a29c-a73abfb28038', 'R0036', 'RODILLO EPOXI Nro 17 DIAM 40', '1d4737a5-0231-4eae-84a2-61a50b7dc9f1', 'unidad', 'unidad', 'unidad', 1, 1260),
  ('3842882d-f22d-56e0-a3bf-45901b51cd95', 'S00008', 'SELLADOR SILOC PU52 X 310ml', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 22044.35),
  ('735756ba-fc0c-5516-b38d-fa9d567ec4f9', 'S00021', 'Sellador 3M PU550 GRIS x 310', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 11503.8),
  ('46d3fa3f-1a84-5871-8cb0-7395026c87d3', 'S0003', 'Sellador 3M PU550 Blanco x 600', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 13274.8),
  ('396b2a7a-eb41-5f27-a9ea-9ee440745013', 'S0007', 'Sellador Kekol K830 Marron', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 17556),
  ('ef76b453-1890-59bf-8f40-b9f12f959375', 'S00072', 'KEKOL PU K5148 x1/2KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 9857.77),
  ('7c9064cc-d9ea-53ec-9477-59fb295a906b', 'S0015', 'SELLADOR SILOC 8600 X 420 gr', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 60848.45),
  ('99de411a-c8ac-5029-b5ca-3d1051cb2af9', 'S0018', 'SELLAD JUNTAS THREEBONDx100ml', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'litro', 1, 17329.14),
  ('d74ed835-d565-5ade-a949-f764d179a564', 'S0020', 'SIERRA de ACERO RAPIDO 24D', '50ef9677-afb2-4ccd-9614-fa2854449299', 'unidad', 'canje', 'unidad', 1, 2303.7334),
  ('d81f9b10-7cc1-5131-aae1-3d77400ab29c', 'S00211', 'SILICONA NEUTRA TRANSPARENTE', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'unidad', 1, 5952.68),
  ('a37744ef-3ada-5763-99c8-f0456f1ea142', 'SUPERH51', 'SUPER H5 x1/2KG', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 6379.2),
  ('b5ca34e3-333a-5f7a-a492-e2fba4b93f9d', 'T00012', 'TARUGO NRO 10', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 117.7202),
  ('0ade2166-f7d8-5d8f-93b9-0ab8bbe3388b', 'T0002', 'Taco Lijado mediano', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 4044.37),
  ('0b4255a8-3d93-5fe0-8908-b46f83d56b93', 'T00031', 'TEFLON 1/2 X 10Mts', '0fe948f4-2ca0-410c-b985-f6aa42d56ae3', 'rollo', 'unidad', 'metro', 1, 684.3732),
  ('4412873e-48dd-5138-a7d5-1659f8f611ff', 'T0005', 'THINNER X 20Lts', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 20, 3355.33),
  ('8f46588f-1ef8-508f-861f-c712d0740578', 'T0005X1', 'THINNER X LITRO', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 1, 3355.33),
  ('18f95984-6be7-530a-aa02-3505f8c1c8a8', 'T0006', 'THINNER ORO X 4Lts', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 4, 6611.5),
  ('2d3ebe93-4fb1-55fc-8da1-69dd13aa7320', 'T00061', 'THINNER ORO X Lts', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'litro', 'fraccionado', 'litro', 1, 6015.04),
  ('456ce12b-2e53-5a77-8b27-5062656916f5', 'T0008', 'TIJERA 12"', '6e8c4ab6-a3d2-45a1-b7b8-a9ed8dc5f7a1', 'unidad', 'unidad', 'unidad', 1, 25660.7505),
  ('7e813955-1cca-5006-89ce-dfa74ca5356c', 'T0009', 'Trapo Blanco CAMISETA x Kilo', '9319613e-f647-433a-ac41-f9412f31d524', 'kg', 'unidad', 'kg', 1, 3280),
  ('b476122e-a4a2-574d-9866-53c790b815fd', 'T0010', 'Trapo Rejilla Pesada Lavacoche', '9319613e-f647-433a-ac41-f9412f31d524', 'unidad', 'unidad', 'unidad', 1, 2310),
  ('24d10b69-348e-5a53-ab6f-03429443828c', 'T0012', 'TARUGO NRO 6', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 47.6737),
  ('2593d184-9cd3-5cf0-a4ab-b2dd8b4999ea', 'T00133', 'TRABAROSCA THREEBOND X 15GRS', '9da77e0c-22d0-4937-b1a9-83f5da2170a0', 'unidad', 'unidad', 'kg', 1, 13539.1082),
  ('2698345c-ed2e-5143-a7a4-a17b9bd18485', 'T012', 'TARUGO Nro 8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 67.3036),
  ('2c899f09-8cc6-53cb-ac43-923407630e4f', 'TCA0002', 'Tuerca hexagonal AISI304 5/32 x 3 x 5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 80.8452),
  ('8fc50090-498b-580a-89f4-252138050cf1', 'TCA0003', 'Tuerca hexagonal AISI304 3/16 x3,30 x3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 26.2211),
  ('049e91d8-3712-5faf-9b34-b3b5a9eebda0', 'TCA0004', 'Tuerca hexagonal AISI304 1/4x 5,50 x7/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 47.9631),
  ('b11f6441-95ad-544c-8e73-b12f761c14e9', 'TCA0005', 'Tuerca hexagonal AISI304 5/16 x6,70 x1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 76.0681),
  ('b85e7d19-564f-59eb-b517-6b7d566dde69', 'TCA0006', 'Tuerca hexagonal AISI304 3/8 x 8,30 x 14', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 104.846),
  ('74a8dbfc-b351-55b6-896d-e577da0d5ce1', 'TCA0008', 'Tuerca hexagonal AISI304 1/2-12x7/16x3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 243.9484),
  ('7134d6a4-4bbc-5463-a2dd-adc215cc04d2', 'TCA0011', 'Tuerca hexagonal AISI304 5/8 x14 x15/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 539.3875),
  ('3b97ac11-bd33-5d98-b2b9-bb6f0bbed84e', 'TCA0012', 'Tuerca hexagonal AISI304 3/4x16,3x1.1/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 875.1001),
  ('c785ea1f-fdee-5cc9-9942-6e50abd888f7', 'TCA0014', 'Tuerca hexagonal AISI304 1"x 22 x 1.1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 3703.8636),
  ('6fe89034-ea7e-5274-9a56-bbc641201603', 'TCAAUT005', 'Tuerca autofrenante AISI304 5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 106.3073),
  ('d5a5ff86-1d98-5760-af2d-33f568ee9efb', 'TCAAUT006', 'Tuerca autofrenante AISI304 3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 144.512),
  ('e5c47dbb-d9a8-59aa-9f0c-4443d60ab1a7', 'TCAAUT008', 'Tuerca autofrenante AISI304 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 437.0959),
  ('9a1cb5e3-2553-555a-a021-56d4d4653b8b', 'TCAAUT011', 'Tuerca autofrenante AISI304 5/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 947.7656),
  ('ff81f0d7-7dcb-5f39-bf7b-754f2fc184a4', 'TCAAUT012', 'Tuerca autofrenante AISI304 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1530.1275),
  ('2b22f5ba-3f6b-56ae-8904-56a8bede22e5', 'TCABRON004', 'Tca hexag torneada BRONCE 1/4 X 5 X 7/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 223.9846),
  ('6b6b2b6e-52db-524f-bf84-155ce881b72b', 'TCABRON005', 'Tca hexag torneada BRONCE 5/16 X 6 X 14', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 384.4543),
  ('f55d67de-088b-5779-9b70-da7aee34f9c1', 'TCABRON006', 'Tca hexag torneada BRONCE 3/8 X 8,30 X 14', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 475.363),
  ('33f6aa0b-7ecb-59b5-b9d8-32e982eae95c', 'TCABRON007', 'Tca hexag torneada BRONCE 1/2 X7/16 X3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1615.423),
  ('d767f550-120f-57ac-b3e7-1e89336450a7', 'TCACIE002', 'Tuerca ciega AISI304 5/32 x8.5 x5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 476.2665),
  ('ad6f8578-4af9-58c4-a3ad-7dcc8832d3df', 'TCACIE003', 'Tuerca ciega AISI304 3/16 x7,50 x3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 419.5759),
  ('55a78ce8-7709-5edf-aed1-f3bb3e5ff600', 'TCACIE004', 'Tuerca ciega AISI304 1/4x10,50x7/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 361.3526),
  ('9a348f77-4b1d-5c63-b4c7-2b360b64051d', 'TCACIEME01', 'Tuerca MET ciega AISI304 M4,00- 07', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 219.3959),
  ('fa1167fb-59c6-5931-b371-c861f54434ed', 'TCACIEME02', 'Tuerca MET ciega AISI304 M5,00- 08', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 223.9659),
  ('d935f000-b39d-591b-8e46-7232933b2ed6', 'TCAMET002', 'Tuerca MET hexagonal AISI304 M4 x 3.20 x 7', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 119.6732),
  ('f859bc42-567a-58b3-93ed-ff8c42f72d5e', 'TCAMET003', 'Tuerca MET hexagonal AISI304 M5 x 4 x 8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 91.2434),
  ('d28e50f6-ec60-551e-87b9-ed0756e5af6d', 'TCAMET004', 'Tuerca MET hexagonal AISI304 M6 x 5 x 10', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 107.1725),
  ('489c3e06-7ad8-5218-845c-68e1538f0c82', 'TCAMET005', 'Tuerca MET hexagonal AISI304 M8 x 6.50 x 13', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 139.5932),
  ('cdcf8a90-e70e-59bf-8762-2fc3a8aac9c3', 'TCAMET006', 'Tuerca MET hexagonal AISI304 M10 x 8 x 17', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 266.0639),
  ('cd1d0e1c-abcc-5e4a-b378-2216fdb46f33', 'TCAMET007', 'Tuerca MET hexagonal AISI304 M12 x 10 x 19', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 740.5138),
  ('33310d5e-7ae6-5fed-96b9-ddfcb90a169c', 'TCAZ38', 'TUERCA ZINCADA 3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 46.3726),
  ('dabb3c7a-2b5f-54d2-b988-ffa3a89f1df9', 'TIRAF001', 'Tirafondo cab hexag AISI304 1/4 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 159.1075),
  ('826c9062-7e07-58f2-b6ee-d5f54efcbeab', 'TIRAF002', 'Tirafondo cab hexag AISI304 1/4 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 177.1337),
  ('0a8b1930-70cf-53e3-a9cb-3651065bf0aa', 'TIRAF003', 'Tirafondo cab hexag AISI304 1/4 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 197.3288),
  ('17dcd4b4-6a8f-54a1-98b5-18d23646a04d', 'TIRAF008', 'Tirafondo cab hexag AISI304 1/4 x 3 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 408.6453),
  ('52c583aa-f39d-5938-9bd6-6f5b2168a082', 'TIRAF014', 'Tirafondo cab hexag AISI304 5/16 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 301.667),
  ('4f8b2447-acf7-5575-94d8-8aaf4f2d7f4e', 'TIRAF015', 'Tirafondo cab hexag AISI304 5/16 x 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 312.5726),
  ('6d788b75-de86-5dcd-971b-51ac9c7b9b1c', 'TIRAF016', 'Tirafondo cab hexag AISI304 5/16 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 314.3904),
  ('60b6a62f-5c88-5691-abc1-f528298134ed', 'TIRAF018', 'Tirafondo cab hexag AISI304 5/16 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 377.9963),
  ('18e50fb3-6925-51d0-bfc6-2bbf1c098246', 'TIRAF019', 'Tirafondo cab hexag AISI304 5/16 x 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 436.1486),
  ('76c69d15-5eee-54df-b00c-724220707d7e', 'TIRAF020', 'Tirafondo cab hexag AISI304 5/16 x 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 517.9236),
  ('d8c056ee-b7f5-5e02-a468-579998153f6a', 'TIRAF022', 'Tirafondo cab hexag AISI304 5/16 x 4"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 672.3976),
  ('c810f2f6-723d-5657-b153-6d0ff1a2a431', 'TIRAF027', 'Tirafondo cab hexag AISI304 3/8 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 449.5367),
  ('19ba911f-7b3a-57aa-9a97-0ee4068f0842', 'TIRAF029', 'Tirafondo cab hexag AISI304 3/8 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 532.2525),
  ('9501cbe2-4a43-528f-b5ae-a98da9a6f627', 'TIRAF031', 'Tirafondo cab hexag AISI304 3/8 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 683.2993),
  ('0cf4d33b-c4ff-5ae6-b472-832775e1c40d', 'TIRAF032', 'Tirafondo cab hexag AISI304 3/8 x 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 810.9677),
  ('3d7ab705-84af-52cb-95bb-95641956840d', 'TIRAF033', 'Tirafondo cab hexag AISI304 3/8 x 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 957.1135),
  ('73391500-19e9-58f5-b775-59f8a49d17ec', 'TIRAF034', 'Tirafondo cab hexag AISI304 3/8 x 3 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1088.7639),
  ('189a503c-f168-5c62-a3ac-3e73dc755213', 'TORFIJ0017', 'Tornillo cab fijadora AISI304 5/32 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 143.4515),
  ('0ca44b6c-5965-58e2-91f7-b6e50e62c982', 'TORFIJ0019', 'Tornillo cab fijadora AISI304 5/32 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 161.96),
  ('65de6249-990c-5e9d-947b-efa73653fdb0', 'TORFIJ0027', 'Tornillo cab fijadora AISI304 3/16 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 125.4148),
  ('ec0ad71c-a54c-566c-be43-6361595e66eb', 'TORFIJ0029', 'Tornillo cab fijadora AISI304 3/16 X 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 139.6127),
  ('ce6e6572-9bda-5043-bf79-3ceb07f806a5', 'TORFIJ0030', 'Tornillo cab fijadora AISI304 3/16 X 7/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 141.9809),
  ('4b440754-319a-5b57-8acf-a82242f3532a', 'TORFIJ0031', 'Tornillo cab fijadora AISI304 3/16 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 150.0238),
  ('d9019961-dc35-5427-9dc7-fb0afb4a1e81', 'TORFIJ0032', 'Tornillo cab fijadora AISI304 3/16 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 163.2756),
  ('a0363f03-c402-5ff8-9f90-57e77d80ea59', 'TORFIJ0033', 'Tornillo cab fijadora AISI304 3/16 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 175.1083),
  ('46eb38e2-a558-54ac-bf1c-1a82e71b2d5a', 'TORFIJ0037', 'Tornillo cab fijadora AISI304 3/16 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 229.5343),
  ('f37e0fbb-3a11-5a9f-a1b6-f459a316f033', 'TORFIJ0039', 'Tornillo cab fijadora AISI304 3/16 X 3', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 250.8269),
  ('6202d0c9-d8e6-5509-9bd4-40a68020c528', 'TORFIJ0044', 'Tornillo cab fijadora AISI304 1/4 X 1', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 196.6664),
  ('957bcbc6-474f-5a6a-a7c8-7b6cfa324e01', 'TORFIJ0048', 'Tornillo cab fijadora AISI304 1/4 X 2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 309.1551),
  ('5822646d-a2dc-5fa9-a888-6a6e82f4e62c', 'TORFIJME14', 'Tornillo MET fijadora AISI304 M4 X 20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 223.8619),
  ('368861ec-126f-5c08-a0f3-2eacffa5aae4', 'TORFIJME17', 'Tornillo MET fijadora AISI304 M4 X 35', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 270.683),
  ('a2e31f48-7fde-5745-8e27-8eaf9d1216a0', 'TORFIJME23', 'Tornillo MET fijadora AISI304 M5 X 20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 188.055),
  ('a8a57b88-e268-5078-9d04-0be59f23fbf1', 'TORFIJME24', 'Tornillo MET fijadora AISI304 M5 X 25', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 203.8298),
  ('d0c7ae51-7b10-51a1-a298-40cf7c6e631e', 'TORFIJME27', 'Tornillo MET fijadora AISI304 M5 X 40', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 262.9232),
  ('04e1989a-2e11-5c11-96f4-373ff4787ad1', 'TORFIJME33', 'Tornillo MET fijadora AISI304 M6 X 20', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 246.6482),
  ('3f859c34-8de5-54ed-be2b-9804b64604b0', 'TORFRE0015', 'Tornillo frezado POZI AISI304 5/32 X 3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 136.5104),
  ('9d61fe0e-18e3-575b-a301-9be95e2fa37d', 'TORFRE0022', 'Tornillo frezado POZI AISI304 5/32 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 181.0198),
  ('b3cbe8e8-27b9-52d7-ab25-28409a43649e', 'TORFRE0030', 'Tornillo frezado POZI AISI304 3/16 X 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 141.4958),
  ('d009f2ab-d2a7-518f-8df0-e9949ac0805a', 'TORFRE0034', 'Tornillo frezado POZI AISI304 3/16 X 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 149.0767),
  ('0ca20a90-ebe1-52f9-82d8-6cfc28632e64', 'TORFRE0036', 'Tornillo frezado POZI AISI304 3/16 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 175.1083),
  ('76ecc667-0e97-5189-a097-043bdff21292', 'TORFRE0038', 'Tornillo frezado POZI AISI304 3/16 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 201.9139),
  ('0a1c4fef-d263-516c-92eb-1604193d433c', 'TORFRE0040', 'Tornillo frezado POZI AISI304 3/16 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 229.5343),
  ('4e76442e-45e0-5120-8426-ece2c46b327a', 'TORFRE0041', 'Tornillo frezado POZI AISI304 3/16 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 250.8269),
  ('57aa1417-67ec-56c2-9ab5-e84700198d58', 'TORFRE0047', 'Tornillo frezado POZI AISI304 1/4 X 1 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 249.7271),
  ('f5071005-cfe0-539f-a8dc-bc6d4f4504e2', 'TORFRE0048', 'Tornillo frezado POZI AISI304 1/4 X 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 271.769),
  ('c2eed732-e3cb-596a-8ce4-b628cb91f890', 'TORFRE0050', 'Tornillo frezado POZI AISI304 1/4 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 284.3051),
  ('181ef038-72c7-51e7-b287-678d8fdcc232', 'TORFRE0051', 'Tornillo frezado POZI AISI304 1/4 X 2 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 281.5917),
  ('1ca413a7-3270-5840-aa1d-5b388978116e', 'TORFRE0052', 'Tornillo frezado POZI AISI304 1/4 X 2 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 303.9363),
  ('bf2bb5eb-81fc-575c-8bca-f293077e6ca6', 'TORFRE0054', 'Tornillo frezado POZI AISI304 1/4 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 373.5179),
  ('b943a41a-f822-5293-b8b8-ade991f4cf9e', 'TORFRE0063', 'Tornillo frezado POZI AISI304 5/16 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 563.0239),
  ('e006f270-c611-5890-b1ee-d2a1e99a11ea', 'TORFRE0065', 'Tornillo frezado POZI AISI304 5/16 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 763.7969),
  ('f21e3db8-4299-506c-a145-289eff9f7703', 'TORFRE0072', 'Tornillo frezado POZI AISI304 3/8 X 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 905.516),
  ('fd441924-168d-55ed-a7af-1e5727b723ab', 'TORFRE0076', 'Tornillo frezado POZI AISI304 3/8 X 3"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 1209.5052),
  ('bddc6f8d-ec7e-51c5-a076-588e7577f114', 'TORGOT0029', 'Tornillo cab gota AISI304 3/16 x 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 121.762),
  ('27f7b6d1-c76f-5d3b-ac23-d3933cc57395', 'TORGOT0031', 'Tornillo cab gota AISI304 3/16 x 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 135.5463),
  ('67eb0716-f674-5e97-8215-62216122c97f', 'TORGOT0033', 'Tornillo cab gota AISI304 3/16 x 1"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 145.6541),
  ('c34c4283-d1e5-5663-93bc-06bf235b5a3f', 'TORGOT0035', 'Tornillo cab gota AISI304 3/16 x 1 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 207.989),
  ('a73cfa19-d16b-5e2e-8b34-95983d46460f', 'TORGOT0051', 'Tornillo cab gota AISI304 1/4 x 2"', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'peso', 'unidad', 1, 256.0347),
  ('25d0b5f4-b686-5cff-bec4-4ba364b342f0', 'VARROSC004', 'Varilla roscada AISI304 1/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 2348.8611),
  ('05f82449-8258-5993-9dce-78e140f2960f', 'VARROSC005', 'Varilla roscada AISI304 5/16', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 4295.8638),
  ('ef8a3aad-26f7-5087-bc5f-e4a65715802d', 'VARROSC006', 'Varilla roscada AISI304 3/8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 5365.5706),
  ('0a8bb4d5-1921-504f-8608-626ca6f8886a', 'VARROSC008', 'Varilla roscada AISI304 1/2', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 12133.5812),
  ('5738b661-e130-5179-9da4-f30da566831b', 'VARROSC012', 'Varilla roscada AISI304 3/4', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 23006.8624),
  ('db3c3b7a-5859-5b37-936e-7626862a1974', 'VARROSC014', 'Varilla roscada AISI304 1"- 8', 'ee517257-e305-4bfc-9fb7-6b0ae0390e35', 'unidad', 'unidad', 'unidad', 1, 52449.0936)
;

insert into public.panol_materiales (id, descripcion, unidad_medida, categoria_id, proveedor, es_consumible, origen, revisado, activo)
select a.material_id, a.descripcion, a.unidad, a.categoria_id, 'Rebollar', true, 'consumibles', true, true
  from _cns_alta a
on conflict (id) do nothing;

-- Código provisorio: el definitivo sale de la renumeración del punto 5.
insert into public.consumibles_config (
  material_id, codigo_etiqueta, forma_entrega, unidad_entrega, proveedor_nombre, proveedor_codigo,
  unidad_compra, factor_compra, costo_unitario_ars, costo_lista_item_id, costo_actualizado_at
)
select a.material_id, 'TMP-' || a.material_id, a.forma_entrega, a.unidad, 'Rebollar', a.codigo,
       a.unidad_compra, a.factor_compra, a.costo_unitario_ars, li.id, now()
  from _cns_alta a
  join public.consumibles_lista_items li on li.lista_id = (select id from public.consumibles_listas where id = '6640acbd-3a3d-4492-8b06-74dea0d62951'::uuid) and li.codigo = a.codigo
on conflict (material_id) do nothing;

update public.consumibles_lista_items li
   set material_id = a.material_id
  from _cns_alta a
 where li.lista_id = (select id from public.consumibles_listas where id = '6640acbd-3a3d-4492-8b06-74dea0d62951'::uuid)
   and li.codigo = a.codigo
   and li.material_id is null;

-- ── 3. Fusiones de viejos claros (12) ────────────────────────────────────────
select public.consumibles_fusionar_interno(f.viejo, f.nuevo)
  from (values
    ('bf55435a-1b4d-49f1-bf4d-7b4add8c7239'::uuid, '549a4b87-5a8d-4986-9526-c71f8f9e3e4d'::uuid),  -- Arandela 3/16 → PLA0003 (único renglón con esas palabras y medidas)
    ('66b569ee-dec7-4f23-a7e3-efccc23787f3', 'e22e9d43-4673-5af2-ba7e-ae3517f12da1'),  -- Cinta Ancha Verde → C0032 (a mano)
    ('7349230d-efc9-4d11-b6ef-5638c0698f04', '1c567b1b-a999-533f-b440-96957f99f14b'),  -- Cutter → C0053 (el otro parecido ya es de otro producto)
    ('0229b616-2006-4c13-99e5-b5f2cc03d8a9', '0cb90704-7800-5185-8380-c4d60eeee149'),  -- Disco Desbaste Chico 4" → D0065 (a mano)
    ('7fc70f74-9bd7-434f-9883-94fa2a654633', 'fb93aaed-f971-5e28-9be8-52897a768450'),  -- Disco Orbital Grande 320 → D0051 (único renglón con esas palabras y medidas)
    ('de502f64-feb8-4ede-aa64-8d5b0f2fcd49', 'b71d3609-0d33-5171-ba78-946e44fc6280'),  -- Disco Orbital Grande 400 → D0053 (único renglón con esas palabras y medidas)
    ('10497673-2538-44fa-b474-52ce2815adba', 'c0cc1c9f-613e-43c3-b3ef-3aba50dafaf1'),  -- Film Grande 2400 → F0029 (único renglón con esas palabras y medidas)
    ('f8084528-574d-4ad0-928e-0a09083aeb3a', '62b57b9c-6438-4344-8f51-83a1160ec3f6'),  -- Lapiz → L0005 (único renglón con esas palabras y medidas)
    ('e8c26055-8c23-4b86-8970-30662aff9a70', 'fb93aaed-f971-5e28-9be8-52897a768450'),  -- Lija Orbital Grande 320 → D0051 (único renglón con esas palabras y medidas)
    ('b490aca8-25c5-46a3-b022-732cd9f45924', 'b71d3609-0d33-5171-ba78-946e44fc6280'),  -- Lija Orbital Grande 400 → D0053 (único renglón con esas palabras y medidas)
    ('d2ad7b2d-4c19-4d23-b644-b718a33b73d1', '282a267c-3e00-5f12-b983-cd4521ad401b'),  -- Mecha 8,5 → M0048 (único renglón con esas palabras y medidas)
    ('7054be96-324b-4ea0-b1c5-e6192452b9aa', '282a267c-3e00-5f12-b983-cd4521ad401b')  -- Mecha 8,50 → M0048 (único renglón con esas palabras y medidas)
  ) as f(viejo, nuevo)
  join public.panol_materiales m on m.id = f.viejo;

-- ── 4. Los 50 viejos sin par salen del módulo (no se borran) ───────────────
update public.panol_materiales
   set activo = false
 where id in (
  'cf2441fb-ade0-45fb-a680-370c7f10dee3'::uuid,  -- Acetona (41 retiros)
  'f6a98209-d1bf-4280-807c-0c12a75de4d6',  -- Alcohol Suelto (4 retiros)
  'a65e1e97-8481-4e24-8ee5-65b32ad1ab9c',  -- Arandela 1/2 (0 retiros)
  'fb4cdac6-a6bd-4a7d-a9bb-ada02928d6b8',  -- Arandela 3/8 (0 retiros)
  '24a61407-64c1-4660-879e-f99ec396edf8',  -- Barbijo Blanco (7 retiros)
  'b16be4a1-3090-4a78-b0ab-df85950ef3e9',  -- Barbijo Negro (21 retiros)
  'fe40fafa-fda0-4a48-849c-25be471876fb',  -- Bolsa Residuos (1 retiros)
  '444936c5-3b5a-4142-9963-314cf656caaf',  -- Bolsa Residuos X Pack (1 retiros)
  '03f203dc-d775-4d48-961c-f11e8c70510a',  -- Chori Blanco (1 retiros)
  '8f8209e6-fd7e-4d76-b8ba-6f48bd1fdefd',  -- chori negro (0 retiros)
  '77791b28-1b55-4408-ae38-fb7b6f26d80a',  -- Cinta Ancha Blanca 48mm (8 retiros)
  '5bdab902-0448-4658-9614-3da512ea7cce',  -- Cinta Fina Blanca 18mm (1 retiros)
  '72c3be6f-bcfa-4a5c-aaf2-890ea0195804',  -- Diluyente Fana (1 retiros)
  'a9a03466-da1d-424b-9627-3ce464009924',  -- Disco Corte Chico (9 retiros)
  'b4d55b9b-1ead-40c4-8a3a-d6329a713a2b',  -- Disco Diamantado (4 retiros)
  'fb32dc55-1704-4943-af87-f7ede783c4a3',  -- Disco Flap (7 retiros)
  '286b97e7-094e-41e0-93de-5822700fa03c',  -- Disco Lija 24 (5 retiros)
  '0452f284-448b-478e-92d2-97989337480a',  -- Disco Lija 36 (27 retiros)
  '695bc121-2f56-4793-89fb-961bff28cdf8',  -- Disco Widia P/Madera (3 retiros)
  '34cfb062-7313-41e1-8ddc-f09d91190880',  -- Espatula Mediana Y Chica (0 retiros)
  '3d8f9702-46e9-4f07-a204-5d62d0e2e5ab',  -- Fijador 4 X 1 1/2 (0 retiros)
  '9ba95d2f-d05b-4bd0-b6e5-7b9213b6c400',  -- Film Chico (0 retiros)
  '83e8f83f-ce02-4682-8220-9493654c3e20',  -- Film Mediano (0 retiros)
  'fbf791e6-3ae0-418c-a08e-c8b726b4a0af',  -- Frezado 4 X 1 1/2 (0 retiros)
  'ceffe38a-24aa-48be-b577-f3d49bcc7ffd',  -- Goma Blanca Tipo Salchicha (23 retiros)
  '7ee3f743-c66f-4402-b13a-35fe9dfd4aab',  -- Gomita Azul Chica (1 retiros)
  '41bf570e-80ea-44ca-b854-3701d211f5dc',  -- Gotita 7430 (8 retiros)
  '6bee16cb-6af2-4e6a-a9f0-653f2d6e7e17',  -- Gotita 7470 (1 retiros)
  'ba21b540-ae5b-4be5-91b3-8fdf6cb5dd08',  -- Hoja Caladora T130 (2 retiros)
  'c77572c2-61c4-4150-9799-824fc6e39272',  -- Hoja Serrucho Electrico P/Plastico Blanca (0 retiros)
  '8fc2e426-f1de-4903-ba0e-36dcb3934e12',  -- Lata Diluyente Fana (0 retiros)
  '117d9743-eb3d-4854-9ac1-f6daaeb6ddc6',  -- Lija Banda 36 (30 retiros)
  'fe494cb6-e39e-4572-b201-214afc42a7f9',  -- Mameluco (6 retiros)
  '54940499-ae84-484b-bb21-a906a882a5bf',  -- MASILLA E-POXY (3 retiros)
  '1f646a75-13c4-4624-b150-8922f21e2c69',  -- Masilla Poliéster (16 retiros)
  'c709fc08-3f4e-4e10-9399-2df6dab24833',  -- Media Filtro Para Pintura (17 retiros)
  '693fa687-bbb1-48f6-b330-eb28f4e288ca',  -- Metro (6 retiros)
  'dd870c31-60f9-4490-b900-3fb480137232',  -- Parafuso 5 X 70 (1 retiros)
  '80251a9c-d4a6-4f78-9fd3-535a23d0ad84',  -- Ph1 (3 retiros)
  '59185545-5d1c-4822-bb43-24c6430c4f2a',  -- Ph2 (8 retiros)
  '51ca07ea-9e35-4e0d-a380-37918dffca55',  -- Pincel N 10 (2 retiros)
  '5890cf0b-b915-4af6-a9b6-091bb79bb250',  -- pistola de engomar (0 retiros)
  '416f03d7-9b43-40ad-a23e-01fd7f642e76',  -- Poxipol (9 retiros)
  'db406dda-1c39-44bd-a8ac-804d5cc3a0ee',  -- Rollo Lija Banda 100 (4 retiros)
  '2e16623a-be26-4651-a24b-8b6a7e54bb5e',  -- Rollo Lija Banda 80 (12 retiros)
  '26784f4b-5141-4d29-985f-745d2f9123c6',  -- Taco Negro Goma (0 retiros)
  '641cd2f6-34ea-46c6-9214-22c18d6bcb4f',  -- Thinner (0 retiros)
  '31650173-7fa1-458a-aabd-f702c6326de2',  -- Trapo (83 retiros)
  'a72ebd4f-56b3-4261-bdbb-e64b47be4373',  -- Tuerca Común 3/8 (0 retiros)
  '236d2850-ec62-48bc-be3e-6f410260001b'  -- Tuerca Común 5/16 (0 retiros)
 )
   and coalesce(activo, true);

update public.consumibles_config c
   set activo_mostrador = false,
       favorito_orden = null,
       notas = case
         when c.notas ilike '%' || 'Fuera de la lista de Rebollar (10/10/2026)' || '%' then c.notas
         else btrim(coalesce(c.notas || E'\n', '') || 'Fuera de la lista de Rebollar (10/10/2026)')
       end
  from public.panol_materiales m
 where m.id = c.material_id
   and m.es_consumible
   and m.activo = false
   and coalesce(c.notas, '') not ilike '%Fusionado en%'
   and m.id in ('cf2441fb-ade0-45fb-a680-370c7f10dee3'::uuid, 'f6a98209-d1bf-4280-807c-0c12a75de4d6'::uuid, 'a65e1e97-8481-4e24-8ee5-65b32ad1ab9c'::uuid, 'fb4cdac6-a6bd-4a7d-a9bb-ada02928d6b8'::uuid, '24a61407-64c1-4660-879e-f99ec396edf8'::uuid, 'b16be4a1-3090-4a78-b0ab-df85950ef3e9'::uuid, 'fe40fafa-fda0-4a48-849c-25be471876fb'::uuid, '444936c5-3b5a-4142-9963-314cf656caaf'::uuid, '03f203dc-d775-4d48-961c-f11e8c70510a'::uuid, '8f8209e6-fd7e-4d76-b8ba-6f48bd1fdefd'::uuid, '77791b28-1b55-4408-ae38-fb7b6f26d80a'::uuid, '5bdab902-0448-4658-9614-3da512ea7cce'::uuid, '72c3be6f-bcfa-4a5c-aaf2-890ea0195804'::uuid, 'a9a03466-da1d-424b-9627-3ce464009924'::uuid, 'b4d55b9b-1ead-40c4-8a3a-d6329a713a2b'::uuid, 'fb32dc55-1704-4943-af87-f7ede783c4a3'::uuid, '286b97e7-094e-41e0-93de-5822700fa03c'::uuid, '0452f284-448b-478e-92d2-97989337480a'::uuid, '695bc121-2f56-4793-89fb-961bff28cdf8'::uuid, '34cfb062-7313-41e1-8ddc-f09d91190880'::uuid, '3d8f9702-46e9-4f07-a204-5d62d0e2e5ab'::uuid, '9ba95d2f-d05b-4bd0-b6e5-7b9213b6c400'::uuid, '83e8f83f-ce02-4682-8220-9493654c3e20'::uuid, 'fbf791e6-3ae0-418c-a08e-c8b726b4a0af'::uuid, 'ceffe38a-24aa-48be-b577-f3d49bcc7ffd'::uuid, '7ee3f743-c66f-4402-b13a-35fe9dfd4aab'::uuid, '41bf570e-80ea-44ca-b854-3701d211f5dc'::uuid, '6bee16cb-6af2-4e6a-a9f0-653f2d6e7e17'::uuid, 'ba21b540-ae5b-4be5-91b3-8fdf6cb5dd08'::uuid, 'c77572c2-61c4-4150-9799-824fc6e39272'::uuid, '8fc2e426-f1de-4903-ba0e-36dcb3934e12'::uuid, '117d9743-eb3d-4854-9ac1-f6daaeb6ddc6'::uuid, 'fe494cb6-e39e-4572-b201-214afc42a7f9'::uuid, '54940499-ae84-484b-bb21-a906a882a5bf'::uuid, '1f646a75-13c4-4624-b150-8922f21e2c69'::uuid, 'c709fc08-3f4e-4e10-9399-2df6dab24833'::uuid, '693fa687-bbb1-48f6-b330-eb28f4e288ca'::uuid, 'dd870c31-60f9-4490-b900-3fb480137232'::uuid, '80251a9c-d4a6-4f78-9fd3-535a23d0ad84'::uuid, '59185545-5d1c-4822-bb43-24c6430c4f2a'::uuid, '51ca07ea-9e35-4e0d-a380-37918dffca55'::uuid, '5890cf0b-b915-4af6-a9b6-091bb79bb250'::uuid, '416f03d7-9b43-40ad-a23e-01fd7f642e76'::uuid, 'db406dda-1c39-44bd-a8ac-804d5cc3a0ee'::uuid, '2e16623a-be26-4651-a24b-8b6a7e54bb5e'::uuid, '26784f4b-5141-4d29-985f-745d2f9123c6'::uuid, '641cd2f6-34ea-46c6-9214-22c18d6bcb4f'::uuid, '31650173-7fa1-458a-aabd-f702c6326de2'::uuid, 'a72ebd4f-56b3-4261-bdbb-e64b47be4373'::uuid, '236d2850-ec62-48bc-be3e-6f410260001b'::uuid);

-- ── 5. Códigos KA en orden de rubro y descripción ────────────────────────────
-- Dos pasos para no chocar con el unique: primero un código provisorio a
-- todos, después el definitivo. Los dados de baja quedan con BAJA-.
drop table if exists pg_temp._cns_orden;
create temp table _cns_orden (material_id uuid, ord int) on commit drop;
insert into _cns_orden values
  ('d7b78050-2a10-54ef-bedd-7010c2d68b68'::uuid, 1::int),
  ('99a67d50-f2d0-57e2-9fcf-e966d986d2b4', 2),
  ('28a74df0-ea98-5356-b74e-b42b9d628f90', 3),
  ('9e954808-ce2a-5742-b289-9ec5fc667a5d', 4),
  ('79f76dc7-2043-5081-a18e-a8e49338c91a', 5),
  ('0fd68f17-dbb1-55ed-964a-dacc141c881c', 6),
  ('415987f8-a98d-5dcd-bdb4-b2f788b2f3b6', 7),
  ('94a44c07-0b23-49fd-8554-223dff0241fb', 8),
  ('ee5cc002-0f0a-5a71-96b7-cb4f98b36eba', 9),
  ('e1cd9ba0-2efc-57cc-a0f4-116e37c8bb56', 10),
  ('615fee12-bf66-5160-97e1-0a898a2e8756', 11),
  ('9022c4d8-7139-5efa-9eb1-e0f835d0ff72', 12),
  ('a669c08c-ced8-58ba-ac59-277f350cf618', 13),
  ('8c47e2ea-e691-46df-8e0c-afee00d06027', 14),
  ('e22e9d43-4673-5af2-ba7e-ae3517f12da1', 15),
  ('443c9ac2-5c6d-5f13-8724-22e56b22bb67', 16),
  ('9e7e4f4c-ecf4-54ad-8749-429055644425', 17),
  ('8eb4bbf4-cfd6-4935-adcc-d0286b492420', 18),
  ('44697e09-829b-4800-a82b-e45c91a750ff', 19),
  ('c0cc1c9f-613e-43c3-b3ef-3aba50dafaf1', 20),
  ('cf8fed0d-9fc5-524a-9d91-2c591d95d97f', 21),
  ('0b4255a8-3d93-5fe0-8908-b46f83d56b93', 22),
  ('e77f1598-f623-467d-9d04-a536b37acd5f', 23),
  ('98a664a1-802a-5bbf-9e01-ec9ee64cf10a', 24),
  ('ae82ac09-48ef-5eac-b72c-64956e7c35a3', 25),
  ('d9a27664-6986-5598-9933-d6fbd74870e5', 26),
  ('e897e9ec-df6d-5952-8305-121c4bb74007', 27),
  ('e08f7200-e3ee-4408-ba92-48f44664a78c', 28),
  ('1d6473f1-140b-5237-9ef2-d83d58bace30', 29),
  ('2d977824-2baa-4a58-ac05-a523c3ac9c2a', 30),
  ('c1866f5f-546a-4384-accb-713ac9943897', 31),
  ('ce92996e-f052-5bce-b3ee-e641df5e8358', 32),
  ('cc28ff62-2f88-56f2-9cfe-6bcee048fcbe', 33),
  ('cc1d67d4-3ca5-56a2-b472-9d096b744519', 34),
  ('f66e874a-ae0f-5197-a6be-528d43d08ba6', 35),
  ('6b9406e7-679f-5b33-a6be-178291558d0f', 36),
  ('4db8bab2-ec2b-51d2-8671-aaac7837bf22', 37),
  ('3c013db9-08a6-5b16-97e5-c83e99b8dfc5', 38),
  ('e54c5b37-b6fc-522b-a619-8e6a39231fd4', 39),
  ('28f984cd-c62f-4819-875c-1bfc5832f217', 40),
  ('4cf6eef8-9991-4443-80ab-483f7c970297', 41),
  ('297521d3-7710-52db-a024-5aa6d6cad63f', 42),
  ('6882b214-d787-428e-9b8e-07ee15aa1891', 43),
  ('ed7e0692-6a90-41d3-9532-3c9decdb3e5c', 44),
  ('eb166b14-4d2d-4e69-8dc8-f982407596c0', 45),
  ('9d2e11a7-42c6-540e-9049-49a465475db9', 46),
  ('ab266d74-7a91-4c1d-809a-e24a9b64d3e0', 47),
  ('cf156009-67b8-4f38-91bb-9a9f813d4319', 48),
  ('78b47ac2-5e45-4894-966d-d22e7738a125', 49),
  ('301c6077-8eff-4366-bfbe-8292644aa954', 50),
  ('ea4338f3-b971-4e32-8412-5d1ed1f54d93', 51),
  ('421da6ca-f729-4848-9027-31b338207b9a', 52),
  ('b55cda81-8158-44c9-800c-4f19bc12cdc9', 53),
  ('92ee2f1b-52bf-4dd0-9f1b-2569907f397f', 54),
  ('f5cfb578-be6e-5537-92ce-5ba1e6a132dc', 55),
  ('d615157c-7846-53a0-a46f-6174ab2f4803', 56),
  ('1378f4a6-42be-5ef5-ab7a-ac2da546048b', 57),
  ('f983e1ed-603f-56b9-b68d-8684fdd5ae32', 58),
  ('2ae8264f-251c-5ee8-bd57-6c6a8e090e34', 59),
  ('75e41848-231f-5616-8fe7-024114116220', 60),
  ('1c5269f5-86e7-5996-b3e1-0cdb3fd3ff81', 61),
  ('ed8258ad-c306-57fd-b898-9bbe991da2db', 62),
  ('742d0d61-836c-5681-aef1-4fe635041620', 63),
  ('32b0f42c-5d9b-53c5-a4e9-1e7795264a0f', 64),
  ('71d7577c-9f39-5f0d-b4c2-5414140bcf52', 65),
  ('c6ce5436-2c83-5440-9115-849e33b64c21', 66),
  ('c839b9e8-7c8c-57a6-9750-22c5bba9654f', 67),
  ('af45838b-8a58-5a19-a84c-85a81353cbee', 68),
  ('ddf98ba5-020c-5dc2-a719-1a65f7b4c96e', 69),
  ('97e397de-b13f-57a3-bbb9-c8df999191e1', 70),
  ('8498de05-7a08-5a0a-8f20-510b80269520', 71),
  ('bb644f49-cdca-588b-937c-4b7500f97a77', 72),
  ('c25efd5f-db19-5fee-946e-f3bcc975aca6', 73),
  ('23f0c54f-40af-5a22-b18d-92833eda632e', 74),
  ('0e52f583-4c43-593b-91ea-67558b54aba7', 75),
  ('9eaab4c7-9a65-5f07-8c0e-4f3ed8640489', 76),
  ('f4a1ff59-f13c-5d19-8b85-e0105f42f42a', 77),
  ('07473de8-6ed8-5e2f-a4e8-fce035e1a0d7', 78),
  ('4733ba41-e444-54a6-8721-65178b5c7a23', 79),
  ('461f9999-3b55-512e-966f-462dffae7c2a', 80),
  ('dd3e06a7-8383-5d4c-a7cd-82eac53c9fc5', 81),
  ('e4866db8-8e18-5c54-9168-d7f0f103cb0e', 82),
  ('91980a1a-6071-59ea-87c4-2f15c8357890', 83),
  ('b3b58978-8c85-511b-b969-b9f9e8efd040', 84),
  ('ea2ce4eb-d1d3-5a6e-be1b-b6d62d59c461', 85),
  ('da2263dc-0614-5f33-9a51-4cfcae055636', 86),
  ('6d32784a-b73e-5911-9388-0a38592b3b5f', 87),
  ('08381605-951c-5c7d-9d8d-7944f2b2b2d4', 88),
  ('6da0f5dd-aced-43df-a0b7-af49758a5fd0', 89),
  ('9bffc194-73de-5927-a468-d54b1b5145e2', 90),
  ('c506ff9f-9bcf-5c5f-bb27-d4b311b01179', 91),
  ('35f38d45-2c98-58e1-8a9d-3d7f8906553f', 92),
  ('549a4b87-5a8d-4986-9526-c71f8f9e3e4d', 93),
  ('d9ec8c84-4634-52f4-b895-25d1e182249e', 94),
  ('e5efc4ae-cf98-4182-9a9f-23e7783670e1', 95),
  ('2938616a-a66b-4085-88ee-6ec6fdbdb949', 96),
  ('2b4dc637-ef91-5702-a3ce-0541a24846c3', 97),
  ('d070673d-86db-5281-85e3-4292b901b726', 98),
  ('0805ffe3-6a5c-544d-ac0d-88b123724693', 99),
  ('b2be3c13-6c94-5d3b-9c40-2c12af49d75d', 100),
  ('078329dd-2d6b-5297-933f-056fe0f68226', 101),
  ('63d18c3c-46ba-55ec-a7a4-817b979abe0c', 102),
  ('724fa75c-4459-53d3-8359-dc03909f97b2', 103),
  ('cb4c2672-f924-559c-8910-e49e58350599', 104),
  ('f4441991-d095-596a-911e-871c6e275489', 105),
  ('499a6489-ef6c-55c5-b53b-b402c8cd0b5c', 106),
  ('11dc217f-5568-52f1-befa-97316ef63870', 107),
  ('0090627b-06c5-5513-9c67-be8a8fb2a8e8', 108),
  ('b9a8038b-7faf-581f-baba-25204f453b33', 109),
  ('39f3d1a2-b66a-5caf-95c2-7a8b8551fb8b', 110),
  ('92d056cf-7af6-5087-bd45-3ac35e4b07f6', 111),
  ('4fab4a5f-716d-582f-bb2a-82f9edcd4e0d', 112),
  ('ec126302-a839-508e-a429-90c5bad5e7b6', 113),
  ('43cd88ec-51f2-5435-b1a8-cbda6311ccd2', 114),
  ('f398bcd2-a0cf-5830-b9fa-c364a5d5dad0', 115),
  ('f6526714-0b50-5e81-9f2d-1d32a22af0d0', 116),
  ('0a1e7d06-932a-5923-b38f-d2c4f4a234af', 117),
  ('692bf284-482a-5158-ae1b-9cb481f2e729', 118),
  ('0413a3e3-12e6-5794-88d3-6712608b00ca', 119),
  ('a3bf506d-65a5-5c86-8c06-88e4503e444d', 120),
  ('cc11e8fe-ea7c-5e8e-968b-827abd6e405a', 121),
  ('cc48f654-3223-50e4-a0a1-1e4e8332cff4', 122),
  ('60fd18f8-2409-5873-9692-1f6a21d7c871', 123),
  ('5f66d79f-99a8-5720-acbb-a954f01a99a0', 124),
  ('2e3d550e-b99a-5a84-b165-d0c4c63b6c67', 125),
  ('ea5b8283-4a22-550a-bab5-139a916a728d', 126),
  ('181f3a90-5230-51c7-957c-6e69bd1f6273', 127),
  ('3ba85535-64c5-5eaf-bb80-9bc3caaeaaa8', 128),
  ('7811aff7-3d2c-5971-b6f8-5b70036c6510', 129),
  ('9eeb0e4a-1d3b-5cb5-b115-ec89618c561a', 130),
  ('a5817f0a-d8bc-5963-b6df-c7bcaf324711', 131),
  ('dcbc2ef9-a77a-5e57-a8aa-c43bb160817e', 132),
  ('3272feb0-2ccc-504f-acf2-d7e199921f0a', 133),
  ('6ce296e6-71f4-5dab-b878-82ab329889b8', 134),
  ('4b3ec3c9-7ee1-5887-983c-6a06f4b1f9ae', 135),
  ('1f5c93a9-209a-55cf-ba71-655f7f5746d5', 136),
  ('5f0dd58c-fa4b-4f12-b7b2-c661fecc872d', 137),
  ('7be577d9-e434-434c-a325-f2ed23ca1db3', 138),
  ('18948d18-8a04-5d3a-a263-1900f8b37125', 139),
  ('ae30ca5a-a2d6-57cf-ac00-9efa03df3d0b', 140),
  ('caee3fae-dd8a-467c-b129-fb4425c8a9cf', 141),
  ('8bb458bf-cd08-44c7-8339-8048e3b21b8c', 142),
  ('76a43fab-b682-490a-b13d-403f799bf1e2', 143),
  ('756f04eb-be99-57ef-8f08-412fc1f36b82', 144),
  ('0605008c-886f-4211-bff6-c498c6cd5e54', 145),
  ('65d8d16a-6c6e-4e57-8075-ef670875d92a', 146),
  ('3f11c255-6287-50a4-baba-b0b8a3bbd06c', 147),
  ('8a2ac312-df65-5928-967f-17f985624397', 148),
  ('7bf43dfc-0401-5b56-9b36-7a5b5c504677', 149),
  ('8f36696b-e566-513c-bfad-ef6facb7951f', 150),
  ('211552e6-c378-5212-b169-227a0bd452d6', 151),
  ('8b1ff12c-a2d9-5115-8c8b-2db0785c622e', 152),
  ('397746ae-6936-50b0-928a-ce5ba55352ea', 153),
  ('ba265274-6c51-553f-b41b-10c5378dd96e', 154),
  ('b0ff2ffb-f40d-5af0-8f2d-e1b282f6b1df', 155),
  ('d0a92751-7828-4975-ac73-f95c09d006ec', 156),
  ('3848fc6a-8940-592f-bbbd-0897d7d99512', 157),
  ('8d951f59-2146-5f36-a86f-a608e7701193', 158),
  ('1a7e2969-e4b5-5355-8058-7bb89585613b', 159),
  ('aa5cb6bc-4197-5a2a-ac6a-b168c2e4dfb8', 160),
  ('31c8017a-e2bd-59e4-bb61-375587f1a224', 161),
  ('1ccc553f-ed5e-5a96-95f6-a47c3886532f', 162),
  ('81234934-0c7f-4aad-acd2-916874b80d36', 163),
  ('2f7331b8-61ed-4912-a87e-63b88418a628', 164),
  ('a487980f-0c47-56a9-8800-1e598abbdd3c', 165),
  ('a4c23298-df72-5b60-9f79-3fa0f4956703', 166),
  ('e4d322e7-c385-4419-abad-7d2a16377cca', 167),
  ('10aac20f-882e-4d0e-8f8b-eb12ed4abbf2', 168),
  ('bffe7f48-2855-43d2-bdf1-0bbb320a8798', 169),
  ('52f76b57-000a-5d17-8cc7-aab79938b749', 170),
  ('9491db98-9d88-524d-8f3a-7a953bc284f4', 171),
  ('d3f1b80e-0aeb-55e5-b412-500a76b7f255', 172),
  ('2a2215a0-7fab-4076-94ec-2e25b68c7819', 173),
  ('ab32d2fa-e101-48d9-b0bf-0db349abffdc', 174),
  ('9a9d6481-1c9e-4657-be6d-813732a9193a', 175),
  ('c6827bf0-74b1-53c5-8dde-95363ff2c45f', 176),
  ('c4605923-d1a5-5d3d-8831-2650fe5e136d', 177),
  ('53b05c05-6b3d-5f03-bae4-6aec54f8dafb', 178),
  ('f6b9dd73-c440-57b4-95ea-de1440aaea41', 179),
  ('50e545fd-3349-4a0e-bc59-75dbb2ff381f', 180),
  ('a771f25a-8826-565e-a585-e20934f5c55e', 181),
  ('b5f0282f-452d-58c4-b396-2e0d98b0ca44', 182),
  ('d8a79b2a-8fae-4ffd-b23d-5379ae3c61cb', 183),
  ('dd014f6b-2ed1-54b6-9ee2-b7e5ee9350c5', 184),
  ('08fe4829-3548-5c4a-a72d-159fcce30c7e', 185),
  ('3da05fe3-61e8-53ef-8677-8d5c7c298c1f', 186),
  ('00735ef8-9aa9-5bd4-8849-f73a2ccf8a1f', 187),
  ('39ad84e1-a5fd-43e5-86a6-98e5d0dda5ec', 188),
  ('216a2b81-ae30-5158-8c4c-51ef4d5ebc50', 189),
  ('fba98c11-3702-5ac2-bbc6-8629157317c6', 190),
  ('86a00398-4b28-5c70-b487-429fdb95b139', 191),
  ('080f9d05-b6f1-5ccf-a8c2-281a9852c465', 192),
  ('481558c3-3a1f-554b-b5cb-4c9764d006e9', 193),
  ('afc0f0fa-1b9d-4e56-bf82-f76f353eb61e', 194),
  ('3ac70598-4de5-5a55-a4a7-a9e2dc47b69e', 195),
  ('47394ef7-1539-55d7-b005-1e1cf1e919a8', 196),
  ('c937ae8e-c162-57f5-b496-9af9ebd29e05', 197),
  ('5c074258-f0f2-55d1-86dc-f6c71492373a', 198),
  ('9ac4fcdb-e562-5fed-bf64-efb5aa50fc4b', 199),
  ('009e1368-ad3c-5802-8bb3-fb4b22250dc9', 200),
  ('cc31fa33-2afa-45a5-9a73-f5d6115d3935', 201),
  ('fa34dfad-73f9-5f86-8f2a-5619a74a8931', 202),
  ('c84173d9-d68e-4196-abb8-4b556c655631', 203),
  ('66aadab1-ed4a-4591-bb97-34b6801a85a7', 204),
  ('56990867-4b92-58b5-b454-39aa6764e671', 205),
  ('2dbeb6a0-da40-4842-bb21-8aed35bd91da', 206),
  ('328f0e7a-321d-4cd0-ba01-28014f329cdf', 207),
  ('10b0c810-3ea4-52d2-9ce2-b83448fb2729', 208),
  ('e9421ee5-b617-5828-a9c1-454af9ccc439', 209),
  ('272c0a85-199b-5844-97a0-5a9f04d228a1', 210),
  ('77fc96ec-df84-539c-a101-44181e405b1c', 211),
  ('45f5be64-da42-54cc-9e3c-18b31adc1ae3', 212),
  ('95bbc0de-5973-58d8-b46c-bfdbed4a9ddb', 213),
  ('c5dcb072-711c-47c4-94da-6d66f335780d', 214),
  ('190ef04a-f98b-535a-8657-3c6a538ca178', 215),
  ('c5da0b94-2df9-5550-8df5-b519906dee26', 216),
  ('3ea09c28-dbc1-5365-a8ec-f1a319dfac37', 217),
  ('1d8b1c0d-41f3-545a-97c3-ee05ee010a16', 218),
  ('7b40864f-b1fb-556c-897d-fbd155b959a1', 219),
  ('e1d93233-27f9-51a7-861a-85bb959bbd21', 220),
  ('d59af87c-eabf-5544-82af-62870b354747', 221),
  ('20acaaf3-7450-5527-850a-6e2c7be1abb0', 222),
  ('643666ce-d154-5b3a-8913-7f49a42f8b15', 223),
  ('4f324d8b-06ad-5f9b-b14e-e5cc888e9af5', 224),
  ('2e4c629e-ef64-5e8d-a805-59dfefaf8f12', 225),
  ('94e71efb-89e5-5600-929f-fe872d6daa55', 226),
  ('4bd28ceb-764c-5085-b3a6-119c766c3199', 227),
  ('c037c25d-c97a-5649-87e8-6ae23512aa62', 228),
  ('24d10b69-348e-5a53-ab6f-03429443828c', 229),
  ('2698345c-ed2e-5143-a7a4-a17b9bd18485', 230),
  ('b5ca34e3-333a-5f7a-a492-e2fba4b93f9d', 231),
  ('33f6aa0b-7ecb-59b5-b9d8-32e982eae95c', 232),
  ('2b22f5ba-3f6b-56ae-8904-56a8bede22e5', 233),
  ('f55d67de-088b-5779-9b70-da7aee34f9c1', 234),
  ('6b6b2b6e-52db-524f-bf84-155ce881b72b', 235),
  ('0a8b1930-70cf-53e3-a9cb-3651065bf0aa', 236),
  ('826c9062-7e07-58f2-b6ee-d5f54efcbeab', 237),
  ('dabb3c7a-2b5f-54d2-b988-ffa3a89f1df9', 238),
  ('6b8cc2b5-df13-40ab-bdbd-d9b6025e7eb6', 239),
  ('9432712b-4725-4599-89d6-0da868af6022', 240),
  ('17dcd4b4-6a8f-54a1-98b5-18d23646a04d', 241),
  ('19ba911f-7b3a-57aa-9a97-0ee4068f0842', 242),
  ('c810f2f6-723d-5657-b153-6d0ff1a2a431', 243),
  ('0cf4d33b-c4ff-5ae6-b472-832775e1c40d', 244),
  ('9501cbe2-4a43-528f-b5ae-a98da9a6f627', 245),
  ('73391500-19e9-58f5-b775-59f8a49d17ec', 246),
  ('3d7ab705-84af-52cb-95bb-95641956840d', 247),
  ('6d788b75-de86-5dcd-971b-51ac9c7b9b1c', 248),
  ('4f8b2447-acf7-5575-94d8-8aaf4f2d7f4e', 249),
  ('52c583aa-f39d-5938-9bd6-6f5b2168a082', 250),
  ('18e50fb3-6925-51d0-bfc6-2bbf1c098246', 251),
  ('60b6a62f-5c88-5691-abc1-f528298134ed', 252),
  ('76c69d15-5eee-54df-b00c-724220707d7e', 253),
  ('d8c056ee-b7f5-5e02-a468-579998153f6a', 254),
  ('6202d0c9-d8e6-5509-9bd4-40a68020c528', 255),
  ('957bcbc6-474f-5a6a-a7c8-7b6cfa324e01', 256),
  ('8b6623ac-3160-4ce7-abba-06c1e9b3158b', 257),
  ('4b440754-319a-5b57-8acf-a82242f3532a', 258),
  ('a0363f03-c402-5ff8-9f90-57e77d80ea59', 259),
  ('d9019961-dc35-5427-9dc7-fb0afb4a1e81', 260),
  ('65de6249-990c-5e9d-947b-efa73653fdb0', 261),
  ('46eb38e2-a558-54ac-bf1c-1a82e71b2d5a', 262),
  ('f37e0fbb-3a11-5a9f-a1b6-f459a316f033', 263),
  ('ec0ad71c-a54c-566c-be43-6361595e66eb', 264),
  ('ce6e6572-9bda-5043-bf79-3ceb07f806a5', 265),
  ('189a503c-f168-5c62-a3ac-3e73dc755213', 266),
  ('0ca44b6c-5965-58e2-91f7-b6e50e62c982', 267),
  ('a73cfa19-d16b-5e2e-8b34-95983d46460f', 268),
  ('c34c4283-d1e5-5663-93bc-06bf235b5a3f', 269),
  ('67eb0716-f674-5e97-8215-62216122c97f', 270),
  ('bddc6f8d-ec7e-51c5-a076-588e7577f114', 271),
  ('27f7b6d1-c76f-5d3b-ac23-d3933cc57395', 272),
  ('f5071005-cfe0-539f-a8dc-bc6d4f4504e2', 273),
  ('57aa1417-67ec-56c2-9ab5-e84700198d58', 274),
  ('1ca413a7-3270-5840-aa1d-5b388978116e', 275),
  ('181ef038-72c7-51e7-b287-678d8fdcc232', 276),
  ('c2eed732-e3cb-596a-8ce4-b628cb91f890', 277),
  ('bf2bb5eb-81fc-575c-8bca-f293077e6ca6', 278),
  ('f21e3db8-4299-506c-a145-289eff9f7703', 279),
  ('fd441924-168d-55ed-a7af-1e5727b723ab', 280),
  ('0ca20a90-ebe1-52f9-82d8-6cfc28632e64', 281),
  ('d009f2ab-d2a7-518f-8df0-e9949ac0805a', 282),
  ('b3cbe8e8-27b9-52d7-ab25-28409a43649e', 283),
  ('0a1c4fef-d263-516c-92eb-1604193d433c', 284),
  ('76ecc667-0e97-5189-a097-043bdff21292', 285),
  ('4e76442e-45e0-5120-8426-ece2c46b327a', 286),
  ('751a63ff-bceb-4099-b931-d5acc482cac1', 287),
  ('b943a41a-f822-5293-b8b8-ade991f4cf9e', 288),
  ('e006f270-c611-5890-b1ee-d2a1e99a11ea', 289),
  ('9d61fe0e-18e3-575b-a301-9be95e2fa37d', 290),
  ('3f859c34-8de5-54ed-be2b-9804b64604b0', 291),
  ('5822646d-a2dc-5fa9-a888-6a6e82f4e62c', 292),
  ('368861ec-126f-5c08-a0f3-2eacffa5aae4', 293),
  ('a2e31f48-7fde-5745-8e27-8eaf9d1216a0', 294),
  ('a8a57b88-e268-5078-9d04-0be59f23fbf1', 295),
  ('d0c7ae51-7b10-51a1-a298-40cf7c6e631e', 296),
  ('04e1989a-2e11-5c11-96f4-373ff4787ad1', 297),
  ('e5c47dbb-d9a8-59aa-9f0c-4443d60ab1a7', 298),
  ('3b3536bf-2501-4b54-aa72-abb1462f27a1', 299),
  ('ff81f0d7-7dcb-5f39-bf7b-754f2fc184a4', 300),
  ('d5a5ff86-1d98-5760-af2d-33f568ee9efb', 301),
  ('54e40759-be53-4a6c-b354-b297e97676e6', 302),
  ('9a1cb5e3-2553-555a-a021-56d4d4653b8b', 303),
  ('6fe89034-ea7e-5274-9a56-bbc641201603', 304),
  ('55a78ce8-7709-5edf-aed1-f3bb3e5ff600', 305),
  ('ad6f8578-4af9-58c4-a3ad-7dcc8832d3df', 306),
  ('d767f550-120f-57ac-b3e7-1e89336450a7', 307),
  ('c785ea1f-fdee-5cc9-9942-6e50abd888f7', 308),
  ('74a8dbfc-b351-55b6-896d-e577da0d5ce1', 309),
  ('049e91d8-3712-5faf-9b34-b3b5a9eebda0', 310),
  ('3b97ac11-bd33-5d98-b2b9-bb6f0bbed84e', 311),
  ('b85e7d19-564f-59eb-b517-6b7d566dde69', 312),
  ('8fc50090-498b-580a-89f4-252138050cf1', 313),
  ('7134d6a4-4bbc-5463-a2dd-adc215cc04d2', 314),
  ('b11f6441-95ad-544c-8e73-b12f761c14e9', 315),
  ('2c899f09-8cc6-53cb-ac43-923407630e4f', 316),
  ('9a348f77-4b1d-5c63-b4c7-2b360b64051d', 317),
  ('fa1167fb-59c6-5931-b371-c861f54434ed', 318),
  ('d935f000-b39d-591b-8e46-7232933b2ed6', 319),
  ('f859bc42-567a-58b3-93ed-ff8c42f72d5e', 320),
  ('d28e50f6-ec60-551e-87b9-ed0756e5af6d', 321),
  ('489c3e06-7ad8-5218-845c-68e1538f0c82', 322),
  ('cdcf8a90-e70e-59bf-8762-2fc3a8aac9c3', 323),
  ('cd1d0e1c-abcc-5e4a-b378-2216fdb46f33', 324),
  ('33310d5e-7ae6-5fed-96b9-ddfcb90a169c', 325),
  ('db3c3b7a-5859-5b37-936e-7626862a1974', 326),
  ('0a8bb4d5-1921-504f-8608-626ca6f8886a', 327),
  ('25d0b5f4-b686-5cff-bec4-4ba364b342f0', 328),
  ('5738b661-e130-5179-9da4-f30da566831b', 329),
  ('ef8a3aad-26f7-5087-bc5f-e4a65715802d', 330),
  ('05f82449-8258-5993-9dce-78e140f2960f', 331),
  ('6421427a-1abc-51bd-b201-57647f665429', 332),
  ('a565509d-2db9-576c-b39a-0290ecbfa386', 333),
  ('dd7da146-40fc-5c27-a048-e38979ec052d', 334),
  ('28c5f80b-fa57-5d5c-a5b1-a1e950fd7039', 335),
  ('04f58d6c-cbd6-5c80-bb66-7a374d6c8675', 336),
  ('25da5ad8-c001-5180-8bbb-d99419800456', 337),
  ('13f8161f-a496-4fca-b913-2b833e950c62', 338),
  ('155c8faa-ab8f-55bb-893f-cddea9ac0651', 339),
  ('97d7b91f-cb14-5d7c-8eae-a0c3213de546', 340),
  ('d2402f6e-e4e1-5036-9ecc-4fc3dde88f15', 341),
  ('a79c4629-40ea-52ec-af73-537344cf8d3a', 342),
  ('1c567b1b-a999-533f-b440-96957f99f14b', 343),
  ('92629e6e-fe1e-4047-8fa8-44b388ef6b71', 344),
  ('25d38eb0-d7f8-59c6-9a3d-8dd2286e08bd', 345),
  ('6c844692-9ab7-50e7-bbb8-157310483a8c', 346),
  ('f35b8f6d-c5f5-5ff3-b252-24e0c8cda404', 347),
  ('276c87ba-656b-5909-95a8-c25427dbeed0', 348),
  ('b138dd8c-01e5-50c7-893f-7a1acd967f7e', 349),
  ('99cb1bab-cae1-56d4-a2d0-b2271158bcab', 350),
  ('f4e0d36a-836e-5aa6-9fa3-c93b459a23a3', 351),
  ('dffd9369-85d1-545b-8c6a-36757176232b', 352),
  ('869c351e-ba8d-551b-9aa1-8d43a7e518fa', 353),
  ('bbced445-4c41-5fb5-800f-986b858ba12e', 354),
  ('19789a90-b5ca-45f0-aac5-e3d652f2b292', 355),
  ('f74265ae-6c9f-5060-aca7-6e15e17f8e0c', 356),
  ('62b57b9c-6438-4344-8f51-83a1160ec3f6', 357),
  ('5d81660a-565f-5e57-9438-98b4c248e8c6', 358),
  ('cc5befd2-e654-53b1-881f-d09e94c0691d', 359),
  ('fd93857b-d6d8-50aa-a1c0-2775332e443e', 360),
  ('889a63b7-c673-5a9a-8167-c694319257b7', 361),
  ('7e078853-4605-50ea-85d8-69aa14c21975', 362),
  ('45cefa68-4709-5968-ab7f-4cf06156f474', 363),
  ('a097b954-3c3f-5f74-9957-94b3e2974993', 364),
  ('0e74d697-0ab9-5fa9-8db6-fc824c86684e', 365),
  ('0ade2166-f7d8-5d8f-93b9-0ab8bbe3388b', 366),
  ('456ce12b-2e53-5a77-8b27-5062656916f5', 367),
  ('b61647f2-2994-4a10-856b-f48b493e2f0c', 368),
  ('33f7f3d8-330e-5ae2-9324-ef748d27a944', 369),
  ('35974671-ac7a-5a69-886c-91defbd35b6e', 370),
  ('1ca5f66b-f5d0-5daf-9caf-6bbc428ccdb3', 371),
  ('0dc87a1e-839c-5f96-8740-347c3bc053f2', 372),
  ('d74ed835-d565-5ade-a949-f764d179a564', 373),
  ('f1084d79-9bb0-5f64-8d0d-406a798bdde7', 374),
  ('f1a69ef8-c13f-5be6-b522-09b9ce159483', 375),
  ('fe5123ee-bed3-5405-bd19-d829f82c6cc8', 376),
  ('79b259eb-50ef-45c0-827b-ed7d39a6f6d1', 377),
  ('cae1afc1-7bd3-47da-b220-222004528ea6', 378),
  ('55aa95a9-f889-5c06-94a8-cb8e0ae8552a', 379),
  ('83d8bec2-4adb-419a-8c40-41d6f59302a0', 380),
  ('dbddad39-2fdc-5b98-ac0d-8ae4a2f5082a', 381),
  ('0c75390b-ece6-578c-a76f-3a2421d42670', 382),
  ('162cb005-2968-5292-a17a-c2306e2a1373', 383),
  ('2f9db813-164c-5518-9dc7-67bae6056b27', 384),
  ('5a7f6db4-6cbc-58c3-952a-359fba962548', 385),
  ('9456ce41-659c-4aac-9877-ce614ea2fb31', 386),
  ('5ed0afa2-96db-5d86-8dad-999bcf3f6629', 387),
  ('e2c1e313-ba26-5f09-860b-8415df2f071c', 388),
  ('8425aafb-aa99-5879-890e-bbe9108aa472', 389),
  ('8c438c76-b3d7-5537-95ce-b27ff11ca49b', 390),
  ('a055c181-e7d1-5f78-8933-b67ffe7e70dc', 391),
  ('5e865fbf-751b-5267-a4b6-060f5a96a13c', 392),
  ('2e3a0e07-be0e-5a51-af47-703460454e94', 393),
  ('d5e96cb9-907e-5d7a-8818-aeaa11dd2afb', 394),
  ('cbf4c4d2-22c8-5cb0-b111-b0c1dadb33ee', 395),
  ('c9cb1a49-b9bf-5857-a6d7-62b575c82abd', 396),
  ('741e5fb3-b7ea-5dae-9794-2e649f8e8a1a', 397),
  ('fd0645c1-cf8f-470d-a578-a64d28213cb5', 398),
  ('a0979fc1-c3d2-5f86-8f5e-46d8f78285e2', 399),
  ('cf360108-9fe2-5d55-bf3a-ed35c7017d93', 400),
  ('8f8df1ee-761b-5d07-84b0-3c719eebc002', 401),
  ('f56c7256-635a-5a7b-b445-cae93c193523', 402),
  ('4381a9a6-dbef-5b2f-8e3d-cdf5f514051d', 403),
  ('a917d681-4566-5124-b6c2-421cd2e6408a', 404),
  ('42d42e89-9df0-59fc-a402-c7b0c0272ffc', 405),
  ('6684f1cb-a290-5ff4-bf75-3c91a64b262b', 406),
  ('8e412540-bfe8-5523-83af-5db103270973', 407),
  ('176706d4-794f-5a55-b1ad-0178234b1ef6', 408),
  ('a51aeaaf-36c5-5103-aa72-27656341a50c', 409),
  ('74e91770-d215-5036-87a9-d3a9253fc02a', 410),
  ('692da2ca-4a6f-59f7-8b34-f175d70c788b', 411),
  ('8bd012b3-0a57-56f6-bf66-376c708a2b47', 412),
  ('398c8dfe-2527-5fd0-8525-cbe1a4cd9514', 413),
  ('83823be6-eb07-540e-9075-baa4080ce522', 414),
  ('2f00a048-407b-57e8-9019-0cb792ba17ff', 415),
  ('fe2602e3-65c7-4e65-993e-3e05d24d4c66', 416),
  ('d43c7bcb-2747-4983-b552-8046f65ec36a', 417),
  ('f00af2d7-244d-4869-b156-373ba84cc12b', 418),
  ('656d9e12-18a5-597f-afab-44519b2ec9a2', 419),
  ('7ced8879-cb7e-40e2-8b5a-4b5c6bdd905f', 420),
  ('003911f7-20f4-4834-b46f-795ce683c100', 421),
  ('4f884c6c-1928-4c0f-8250-77d84c1c3a28', 422),
  ('9f65bbe7-42a3-4438-840f-e3739434f0d1', 423),
  ('1b1ab73d-5991-4299-9f12-9baec388a311', 424),
  ('c78889c8-5c8f-5002-968c-c60d9d4692f6', 425),
  ('fb93aaed-f971-5e28-9be8-52897a768450', 426),
  ('a4650d8b-71c4-404d-8f5c-58598b63f03e', 427),
  ('b71d3609-0d33-5171-ba78-946e44fc6280', 428),
  ('94c8bba9-47c1-4646-9b5b-4b9ddfe8baee', 429),
  ('f84c7d2c-460c-5cac-aa8f-dace68225e8d', 430),
  ('de2b7ad7-866c-5d81-9929-02939fe87fd3', 431),
  ('a8d599b1-c85e-5373-aaca-040ab8b1c152', 432),
  ('ae59aebb-abe3-43c5-b938-25bbe06193a9', 433),
  ('0cb90704-7800-5185-8380-c4d60eeee149', 434),
  ('cb6cdb52-8c8d-5b4f-8392-021c739ab6ad', 435),
  ('b3e88ef9-ff66-5ce2-80eb-ac6b1e0c5619', 436),
  ('b131d8f8-9159-5d79-a57a-86b3dedc6cd5', 437),
  ('111f6a93-734d-4136-a613-c8eba4bfe8c6', 438),
  ('10591c1b-fea8-4f79-83d0-ae27374db9e2', 439),
  ('1a7f4d50-5ce1-4646-b244-f8f280a80559', 440),
  ('7e0fbbba-c99c-4a01-8695-412b6c17f8ae', 441),
  ('bcd4e024-9a52-4662-aebe-ac237c68976e', 442),
  ('b2cd99cd-b0e6-5332-8f31-6fb24cf551c0', 443),
  ('de60eee1-6711-4901-81df-0912caa2ab95', 444),
  ('74005ad5-babc-5a35-9490-a401b4ca3bbf', 445),
  ('90c43d1c-ebc9-42f6-ad71-fb533b934c46', 446),
  ('358a3383-a1ce-4f00-8b6a-bf1affa5ab81', 447),
  ('aa22601c-0ead-4a0c-bc9a-c6aa385efcfd', 448),
  ('9e410cec-df14-4230-ba67-3c95f012685d', 449),
  ('411ccf42-dc1c-4b15-b798-23ece38d7cf7', 450),
  ('b7a5fb40-3867-5604-8e85-6b4ee57596c3', 451),
  ('53400086-a436-59e7-bf36-2a1c2f965df7', 452),
  ('3546bdb3-4773-47af-90cd-b56f51ae394d', 453),
  ('86c5fefb-dabb-5205-afdf-e1bb155b6c16', 454),
  ('d0974c4f-79fc-5ceb-a75b-891a86f9c1bb', 455),
  ('e9740680-ee93-5432-a104-d3cd25464847', 456),
  ('d6d22a34-6706-5967-a915-88b34ef3da01', 457),
  ('4f8bee8e-263f-59a9-abf0-070b989f653e', 458),
  ('d49c80cb-9a72-56b5-b290-9b6a245d629e', 459),
  ('fa83271a-0173-44e1-bea9-47d7cb66e2ad', 460),
  ('379d4e08-dd4f-46b2-bfc6-65b2c22b0d7e', 461),
  ('1ea820f0-6958-45d6-905e-af3bd8639cc2', 462),
  ('9ff616b7-37c6-4486-a77e-710ba31ae472', 463),
  ('8274facf-ade4-4ac0-97cf-a88334e37b67', 464),
  ('0a1ca42b-499c-46d2-b2e5-16a96fb77278', 465),
  ('505d6c87-3791-452f-9ed2-450dffa57a1c', 466),
  ('94e927f6-ba1e-430a-93d7-b18131f401be', 467),
  ('bf694874-4ab1-42ea-9ed9-6db3359ffbe3', 468),
  ('07e0062c-1831-4935-8dab-3d7a5f5a9b27', 469),
  ('304276bc-2e83-57a5-b123-aa2beca3b87b', 470),
  ('e7824807-a0c6-5d1e-94ec-12013a0e08ff', 471),
  ('45490326-9e74-5790-9999-14e488d7c9d0', 472),
  ('08bbab31-1503-5890-bb24-855991f6b5b8', 473),
  ('5d19a796-ed6c-5c60-890c-fa386ac89237', 474),
  ('3e1a6cdc-519d-529a-acd5-4ea1e9c360e5', 475),
  ('0d175b3f-b186-5353-b3c2-d668f5b504e2', 476),
  ('847fc700-c949-5c39-9550-f73df034aef2', 477),
  ('8219fd98-24f2-5a7e-99cf-dc544fbbc1ab', 478),
  ('60500be3-bc25-5e4e-9e20-13c63861c653', 479),
  ('55d89204-3c9c-4f10-9c94-31ec9ce89162', 480),
  ('54d95007-3e7b-5aea-9950-41b037311d8f', 481),
  ('e0ed4091-bd9f-5e83-9a7e-8552bbff11b0', 482),
  ('5d295ef0-dc46-5be3-9956-cead77fe26f3', 483),
  ('e6ff3727-2f4f-5ee3-92fd-a9d034ba9e44', 484),
  ('cb695722-1a1a-5717-92f8-6db6142af3bf', 485),
  ('c0a8d2d1-0b64-5ab4-b9de-163e7613a17d', 486),
  ('efaefd36-3182-5c6d-bf55-d12a7de48e4b', 487),
  ('3248c4d5-9bc8-5752-b081-3c1fcfc2913f', 488),
  ('64608200-bb8a-5bb8-99f7-ea6b8c8ad70c', 489),
  ('233c9d5f-b20c-5649-9167-ec994b21aa9d', 490),
  ('bd862547-de6a-53fb-ad7b-1ce980547d75', 491),
  ('7c183887-8526-5bbf-b850-91e26e2dd26a', 492),
  ('6b7e9756-1470-5751-9c92-93ef961049b9', 493),
  ('1d37edc9-ee64-5f06-805b-9c9cc1f40135', 494),
  ('cc582005-9cb6-5e4a-9e37-8c89684b82a5', 495),
  ('20b0748e-0807-46bf-aa2f-48b525ba21d5', 496),
  ('e5e97fd5-d50f-4267-809f-4c4f5a4e3217', 497),
  ('381657c8-f674-4dff-85fc-62db7944878f', 498),
  ('8f43125e-eded-5c7f-a7d9-2afe3dd8d211', 499),
  ('7c1fb350-3b60-5852-9974-cc8e11514f28', 500),
  ('7e813955-1cca-5006-89ce-dfa74ca5356c', 501),
  ('b476122e-a4a2-574d-9866-53c790b815fd', 502),
  ('75694539-f3a1-5e9d-b942-69e2c545a459', 503),
  ('3f375135-12bf-5eaa-a9d5-788a64bf387a', 504),
  ('f1707b47-c0ed-57d9-b059-ed8da459ffa8', 505),
  ('2a864403-5a0f-503a-9a7d-02b9d8f845f7', 506),
  ('701f35fb-e0b0-5868-8c93-7d85434fdb35', 507),
  ('8da21475-35ca-5544-8250-0b347f55dc6d', 508),
  ('7255dc38-647c-5071-899e-b7db8ae8aa8a', 509),
  ('26f4cbd3-61a3-566f-a5a6-395dae23e1d2', 510),
  ('b90210e6-2cd1-5856-9426-f28a09636022', 511),
  ('279a0775-d20a-5c4e-abf8-23c15bc207dd', 512),
  ('d7f673fc-8466-5844-8dde-59881e55231a', 513),
  ('c369bbef-3e12-53ea-9e69-35ca3e31a1a3', 514),
  ('705c6ec5-9273-451c-a86d-18d856927899', 515),
  ('c9aba7e9-dcf9-4937-a662-fd15e3d033c4', 516),
  ('747f7336-76ef-435e-b181-f7c083fe4491', 517),
  ('f8c08c1d-6aed-437c-ad4a-180156f9da11', 518),
  ('d0af23fb-00ef-4fd4-aade-beacf528caf0', 519),
  ('d1a7e791-1d3c-4c1e-a633-56933fb74ebc', 520),
  ('7d35f6d6-8fd2-4e2a-b3cd-968f5af99d24', 521),
  ('113f2eb4-c994-4376-9daf-329c87403ece', 522),
  ('f66e70d8-f3b6-4e19-8e15-8abbfbaa8b55', 523),
  ('0a8ac6cd-7767-4df9-81d9-413d0095edd2', 524),
  ('70edb02b-dae4-42b7-8c80-777324c2b13d', 525),
  ('07bac757-3165-4514-943e-6b5e197abdeb', 526),
  ('6b209144-b074-4c66-ae6e-c00c2173144b', 527),
  ('96209e71-3209-4b91-8552-b9b0f859cf1e', 528),
  ('656f98f2-7f9d-46cd-a25d-78a2ff2f8aa8', 529),
  ('8682b8a5-7ec2-4d95-977b-4dadd6724acc', 530),
  ('ed27abd7-7c8d-40d3-b918-f711ebc3fc8f', 531),
  ('e7acca3f-8d47-4927-8fe5-2cea545015ee', 532),
  ('7a5992e7-5377-4481-9c21-3dd1a0d43cef', 533),
  ('f14d550d-2118-4b25-a976-1a62c53b84e5', 534),
  ('aa8fc913-c26a-485c-960f-4cb5d16049d4', 535),
  ('1b144795-b2fa-4dd2-a05c-299dd318c417', 536),
  ('0a71ff7c-bd54-4bb4-9d67-d0c8c3c07d1f', 537),
  ('f9376277-a73c-4357-bb13-9c60d5fbddfe', 538),
  ('0806abbc-339d-49e4-83f7-d5720c704145', 539),
  ('e20ce8ad-fca3-482f-9535-04b7a076effd', 540),
  ('282a267c-3e00-5f12-b983-cd4521ad401b', 541),
  ('585df7c6-88d2-4bac-96e2-0e2bc39e2ff9', 542),
  ('8d16a78d-b216-42e9-ba9e-243f539eb6af', 543),
  ('7c2c7126-294e-4b46-b1af-186ef108f44e', 544),
  ('8e7a4474-8057-4432-92b6-27d07ed4d4d7', 545),
  ('0f8a17d8-8600-4b6a-95b5-bb98b4104aae', 546),
  ('c08aed36-691c-4b41-80c6-6ec8245a984a', 547),
  ('269d3010-8c76-4a73-835f-95c9b1e16641', 548),
  ('2ef47738-76b6-465d-bb2a-8175ba11a553', 549),
  ('273efba0-d07b-4295-bd25-855a14242952', 550),
  ('eed0a3a4-7c12-59bf-8c17-04a46f72d762', 551),
  ('2e7436a4-7f64-5043-aacd-a5999a30ba6a', 552),
  ('95d890f3-9c84-5ee2-8178-212a85182de0', 553),
  ('c536929a-c8ed-5ab1-a4b1-d554d9d0a525', 554),
  ('148d2aa8-6e58-5ab6-a045-f3a0bb1614bb', 555),
  ('2b8c9b0d-f148-5104-9bb3-44f945681f5d', 556),
  ('63c0b9b2-bb24-4aa0-a493-c7c0eea9d035', 557),
  ('c17e47ed-6cb2-5288-ab44-5eaa90172231', 558),
  ('a964210f-50e5-5cd4-9f39-f41c6334b216', 559),
  ('63022e03-988d-54eb-a853-aef9d5c59708', 560),
  ('c807dfec-d472-5fff-8e92-62fafc727ff8', 561),
  ('360ec214-81e9-4f34-859c-26578cfb4f9f', 562),
  ('7316bf81-7917-4e54-af5a-b26c1b54d5d6', 563),
  ('c3b066a8-b292-5939-b256-1fc77a03ea1b', 564),
  ('b8f260a6-87ab-579d-939b-7e5dc54ba2a9', 565),
  ('c2f751c2-dd3b-5799-83d4-696a745ced00', 566),
  ('a357e07c-084b-5e3d-95d2-72884a2591db', 567),
  ('7740b5a8-fbe2-5c8f-a2f4-b0521d772406', 568),
  ('5545e48b-f7cd-4b99-8bf9-a10729bb57a1', 569),
  ('84583c11-0060-4540-874c-d1a972e0482c', 570),
  ('4048c294-c0af-577a-924b-1fa78319e3de', 571),
  ('0115261b-0ba6-4d7c-8fea-a512aea75fac', 572),
  ('7df56169-6788-41a5-8ce9-3899671a6dd4', 573),
  ('729ee7fc-bc79-4c50-a897-cd66fb6318be', 574),
  ('fc6cc486-596a-42cc-9325-61a01844df00', 575),
  ('8779aaab-3d55-5ef0-9620-f1b692c3dba7', 576),
  ('644ba519-6c4e-58db-a29c-a73abfb28038', 577),
  ('5bc755e4-1901-517c-b079-6abd1abe2451', 578),
  ('cb49baa0-0455-5b28-a208-d5ec0b13dd00', 579),
  ('b627c72c-92fb-5b5a-9e9b-204095614f44', 580),
  ('c41224aa-205e-475b-984b-89a636ec30c2', 581),
  ('be8eaaed-387d-5293-846b-c2a62e974d99', 582),
  ('03bd381d-d05f-589e-99bc-3bd111fe4e01', 583),
  ('9d4846b8-5603-5c6d-b2a3-054ec23b8531', 584),
  ('9f4d0d0c-41b9-5041-ad2d-3bd68d15fbfe', 585),
  ('52bdb1e3-a7b8-5a11-a011-7044cbdc14b6', 586),
  ('555409e7-bec0-5717-a7be-9773361130cc', 587),
  ('5f173a97-fefa-5053-8afc-ab5fae00a00e', 588),
  ('5bc4eac6-de8c-5f77-bc9f-c71a38fb1849', 589),
  ('02b629eb-4217-59c1-bd29-55e063efeadd', 590),
  ('d4c5a533-b1db-423d-a87f-87b21b6632af', 591),
  ('4814a141-9e53-5c67-9ee5-d46ea3aeac41', 592),
  ('678209a1-f0c1-5c0b-9ce7-260bd2dfb8c1', 593),
  ('ef76b453-1890-59bf-8f40-b9f12f959375', 594),
  ('647dd597-74c3-5520-9295-9528a2e58fe0', 595),
  ('c46658a8-dc4b-4fcd-9e81-8324f92abb79', 596),
  ('0866e067-4941-52f5-b02b-994b7432f6dc', 597),
  ('fd222193-7c62-515e-98e1-81b9b179bfa8', 598),
  ('dda985d8-ed0c-4bff-8cb7-6d4a21e86b8a', 599),
  ('83820413-2fab-5877-b3a4-f37fdf3f2230', 600),
  ('94d6b696-99e1-4e0e-bd5c-d7eec711afbc', 601),
  ('a5a8968b-4a49-5bb3-9713-e59182f236bb', 602),
  ('c81e1a24-1f16-5485-85e9-5eaaa3ecbc4b', 603),
  ('d892b0c2-1f3f-5d7d-8aac-9d09a783b78b', 604),
  ('56a9afe2-6009-5170-92b5-ed7a33c2ddbb', 605),
  ('cd74e3a1-c04f-533e-876d-26fb6e930eed', 606),
  ('dc549875-5f90-54cb-9695-0a6ad026ada0', 607),
  ('99de411a-c8ac-5029-b5ca-3d1051cb2af9', 608),
  ('95fe4aef-e051-42f2-9d52-61e0332c5f55', 609),
  ('52c4964e-4904-4173-ae1d-ee568e0c0f2d', 610),
  ('46d3fa3f-1a84-5871-8cb0-7395026c87d3', 611),
  ('735756ba-fc0c-5516-b38d-fa9d567ec4f9', 612),
  ('64027b3c-7d1f-4ebd-a8a5-5df4a1d3b047', 613),
  ('3d45eb0a-5f8b-4170-8b55-acb73792aad3', 614),
  ('396b2a7a-eb41-5f27-a9ea-9ee440745013', 615),
  ('7c9064cc-d9ea-53ec-9477-59fb295a906b', 616),
  ('3842882d-f22d-56e0-a3bf-45901b51cd95', 617),
  ('d81f9b10-7cc1-5131-aae1-3d77400ab29c', 618),
  ('a37744ef-3ada-5763-99c8-f0456f1ea142', 619),
  ('3cb1010d-45b7-4198-a0ba-5a09f99d6319', 620),
  ('18f95984-6be7-530a-aa02-3505f8c1c8a8', 621),
  ('2d3ebe93-4fb1-55fc-8da1-69dd13aa7320', 622),
  ('4412873e-48dd-5138-a7d5-1659f8f611ff', 623),
  ('8f46588f-1ef8-508f-861f-c712d0740578', 624),
  ('2593d184-9cd3-5cf0-a4ab-b2dd8b4999ea', 625),
  ('eadb6acc-7f2d-4dfb-9416-d8ac60500a0c', 626),
  ('e243b775-b507-50c4-a0af-7d8fd5da1c0e', 627),
  ('f5a977b4-258a-5b58-b0b7-44d859be798a', 628),
  ('96b25205-091a-54d9-8b78-e3c5516cfaea', 629),
  ('b9529a30-c16d-54a2-a9c0-e8acfa8ab58f', 630),
  ('b97867c6-4feb-58ae-a63d-e2b5dfe1ed73', 631),
  ('710d694c-a42d-5440-bc07-d3c4677edc94', 632),
  ('029c41f5-40d9-55b9-aa15-f5539857a1a2', 633),
  ('c64cd2fa-7b75-5a8f-bfed-93aef3e28857', 634),
  ('6ec969bb-b05e-5a68-943b-fb40b4991b80', 635),
  ('99cb2250-414d-51ca-8557-0714ab343803', 636),
  ('615dc2d9-cb68-5c81-9899-b959d3d3b9dd', 637),
  ('3163c19e-60a0-5296-8d75-6a9e3c914dee', 638),
  ('79c730d0-4bcc-5d74-a548-644b791581c3', 639),
  ('5df151ca-d3ad-5ee2-97e4-449908a4d7ba', 640),
  ('373c7f72-fd65-5e3d-b7ab-f2096fd971dc', 641),
  ('11edda97-af98-5bc0-8024-f736e2d43565', 642),
  ('d0d45d64-6795-5bf0-a111-96e64c6887be', 643),
  ('88f7a2cb-d08b-59b0-9d9d-bfd221988b03', 644),
  ('f81df312-5e76-5df4-862f-741aa0fad6bb', 645),
  ('92dee530-62ba-5262-99dc-da35c62ffa6e', 646),
  ('53486be5-777d-585e-bb73-6a9bb7c836e6', 647),
  ('34afd23e-d763-57b5-840d-1b4780b50290', 648),
  ('54ff7f00-a3c2-5ee7-9b17-483c54870b76', 649)
;

update public.consumibles_config c
   set codigo_etiqueta = case when c.codigo_etiqueta like 'BAJA-%' then c.codigo_etiqueta else 'BAJA-' || c.codigo_etiqueta end
  from public.panol_materiales m
 where m.id = c.material_id
   and m.activo = false
   and c.codigo_etiqueta not like 'BAJA-%';

update public.consumibles_config c
   set codigo_etiqueta = 'TMP-' || c.material_id
  from public.panol_materiales m
 where m.id = c.material_id
   and coalesce(m.activo, true)
   and c.codigo_etiqueta not like 'TMP-%';

-- Si alguien dio de alta un consumible entre que se generó esto y se
-- aplicó, va al final por descripción.
update public.consumibles_config c
   set codigo_etiqueta = 'KA' || lpad(o.rn::text, 4, '0')
  from (
    select c2.material_id, row_number() over (order by coalesce(x.ord, 1000000), m.descripcion) as rn
      from public.consumibles_config c2
      join public.panol_materiales m on m.id = c2.material_id
      left join _cns_orden x on x.material_id = c2.material_id
     where coalesce(m.activo, true)
  ) o
 where o.material_id = c.material_id;

select setval(
  'public.consumibles_codigo_seq',
  (select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) + 1 from public.consumibles_config),
  false
);

commit;
