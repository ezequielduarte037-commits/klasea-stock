-- Mínimos de barco, quinta vuelta (04/11/2026). Lo que se compra para cada
-- barco (TV, bombas, griferías, equipos, flexibles de línea…) no lleva mínimo
-- fijo: la alerta sale de "Falta para obras" (lista estándar de las obras
-- activas contra lo libre). Pasan a 0 los que puso 20261103240000; la
-- ferretería chica conserva el suyo. Cálculo en
-- tools/minimos-panol-por-obra-20261104.mjs.
--
-- Sólo cambia los que siguen con el valor automático (nadie los tocó a mano).

begin;

create temp table zz_minimos (material_id uuid primary key, anterior numeric, descripcion text) on commit drop;
insert into zz_minimos (material_id, anterior, descripcion) values
  ('09780a31-1f34-4dd1-8f8d-d452e8980a86'::uuid, 1, 'CAJA PORTA BATERIA 431X257X256'),
  ('0dccf717-6511-4fc1-858e-fb4baf7c1557'::uuid, 2, 'FLEXIBLES HIDRAULICOS K52'),
  ('0f862566-a342-4d1c-9379-c772c2675a7b'::uuid, 1, 'CHROMECAST ONN 4K'),
  ('10c0a029-9d78-4884-85bd-cec0e0c8f7e7'::uuid, 5, 'GANCHO INOXIDABLE PORTA DEFENSA'),
  ('11088a90-8940-4d3f-a7be-1e875ad9191c'::uuid, 3, 'LLAVE REMOTA (SOLENOIDE) 12v 500amp P/BATERIAS'),
  ('142d2ea6-bd30-4954-8859-a2a8c7a96888'::uuid, 50, 'Cadena 10mm calibrada galvanizada'),
  ('15b642f0-2b8f-486e-9b8b-0eee0657ed50'::uuid, 100, 'Cadena 6mm calibrada galvanizada'),
  ('183a1a53-1ca8-4ded-be4e-ee964a2a8dcb'::uuid, 2, 'Caja drenaje ducha 800GPH · Rule'),
  ('1a08d705-8a94-4922-ae2d-55e926e5a254'::uuid, 1, 'Pileta inox Acero Q40 · Johnson'),
  ('1a30fa8d-5e98-4b44-a368-34462ee7d9e8'::uuid, 4, 'Conector Antena Macho P/VHF P/RG58 (YC101)'),
  ('1dd21b67-9e5d-4297-99b8-2cd41c931852'::uuid, 1, 'Monocomando cocina FV Arizona alto 411.02/B1'),
  ('1e80aec1-58d5-48b1-a05a-ef192315858f'::uuid, 1, 'Juego filtros doble combustible RK18 · Rama'),
  ('23e08655-1520-4423-b3bc-bde27b97a454'::uuid, 1, 'Termica malacate 80A'),
  ('2835bff5-374d-4780-9ea9-e6c09a1c3802'::uuid, 1, 'ECOSONDA P319 · GARMIN'),
  ('2972dabe-5a20-4477-a249-8856b7f3c77b'::uuid, 4, 'Conector ANTENA Union Corta (YC1102)'),
  ('2ece2c3a-6001-4f6c-9799-d866475d1cf7'::uuid, 1, 'PANEL MULTI CONTROL DIGITAL GX'),
  ('307b064d-c9bd-4678-818b-a9c85a27384d'::uuid, 2, 'FLEXIBLES HIDRAULICOS K55'),
  ('30ccb1ea-d191-4a57-a2c1-d1aaf3029aef'::uuid, 1, 'Panel Touch control bowthruster · 8909C'),
  ('31abfee0-65f4-4392-8b0d-1c59f0df12c6'::uuid, 1, 'Monocomando lavatorio FV Libby 206/39'),
  ('375b58a2-5f84-4818-a365-a55aafbd089f'::uuid, 4, 'Picaporte HL09 · Hafele'),
  ('3a21cd5b-238b-404b-a1d7-960077ad3b4d'::uuid, 1, 'BOAT TOMA PLAST 30A BULK'),
  ('3aed245c-0d6c-4d46-b763-d464e596c80e'::uuid, 8, 'CAJA DE PISO URBEN ALAMO'),
  ('3aee9e24-a92d-4eb5-b9b6-3468e73d17fc'::uuid, 1, 'Canilla Osculati rebatible'),
  ('3e12c4af-a78f-4bff-a46c-89bb622157dc'::uuid, 1, 'SEPARADOR DE AGUA Y GASES GEN-SEP, 1.5"'),
  ('3f69e2bc-204b-4477-9a06-176cff7c4b0b'::uuid, 2, 'Juego de brazo de timón y horquilla 2"'),
  ('46b7c591-8e31-4943-b576-e8beb2ded1b6'::uuid, 2, 'TV 32" Hd H5000 Smart'),
  ('51f962af-a1d4-48cc-95de-1aa00536bd8d'::uuid, 1, 'FICHA MARINCO HEMBRA INTERLOCK 50A 125V'),
  ('5698170e-a230-4c71-a893-c1e61414636f'::uuid, 2, 'Canilla OSCULATI frío calor cromada'),
  ('56990c06-2345-4039-9743-b6be04711462'::uuid, 4, 'Filtro agua 3/4"'),
  ('578a6a5b-4197-4b57-bb86-1fe5cce3d4f5'::uuid, 2, 'Guardamancebo baranda'),
  ('57943495-9c5a-48db-a1fe-45a5feb4e1a1'::uuid, 1, 'Caja para batería'),
  ('588dafe8-63a7-4d44-a9d9-467bf92429b1'::uuid, 1, 'Microondas 23L · Samsung'),
  ('5f5ebc3f-3166-4dc2-95ed-eb984b738b17'::uuid, 1, 'Portarrollo FV Libby 167/39'),
  ('5f7a6cf0-4f7d-4779-911b-6e350067ade2'::uuid, 1, 'LUZ DE NAV INOX 2N LED VERDE+ROJA (PAR)'),
  ('5f93a451-b1d3-4fb3-96a1-aa753972af91'::uuid, 1, 'Ánodo escudo · 30x15'),
  ('67c5725c-7f0c-479b-b496-f4f024604004'::uuid, 1, 'Soporte elevador TV - JC35VT-1000'),
  ('6864fa83-e55a-4e23-aae9-aaa77d0f8430'::uuid, 4, 'BLOWER INLINE 3" 12V'),
  ('6ecf947f-e9c3-4d18-b70a-48c69db47de9'::uuid, 1, 'TRABACADENA INOX STOPPER 80X70MM'),
  ('7129a649-e725-4e7c-9aed-c736567ca6ae'::uuid, 1, 'INSTRUM. NIVEL COMB NEGR/CROM'),
  ('79bb255c-bb8f-4139-9f9c-1d8f0230dae3'::uuid, 1, 'Luz banda ROJA led'),
  ('7e2141d2-d696-483c-ae70-6c57e5705d50'::uuid, 1, 'VHF 215 MARINE GARMIN'),
  ('7ea692f8-ba4b-4b30-b49d-bbd1b5df1c4b'::uuid, 1, 'Baterías 12v 110Ah'),
  ('8365ba5b-6304-4def-9e5a-97445a47ae9d'::uuid, 4, 'CAJA DE PISO Orbis OXFP 452-13'),
  ('84ec4e6f-e11e-4168-845a-e82a282bd757'::uuid, 4, 'Traba cadena 10-12mm'),
  ('8803ceee-6654-42d5-a057-41cc3ba79260'::uuid, 2, 'CALEFACTOR AUTOTERM ADAPT P/REJILLA D60 NEGRA'),
  ('895e8fc5-60e9-44bf-baeb-54dbe2c509bb'::uuid, 3, 'Bomba achique 2000gph 12V · Rule'),
  ('8b6e54d3-4c28-429a-b516-c254b37a24f7'::uuid, 1, 'Buje de bronce 75x45 para limera'),
  ('8d181543-0791-4639-845b-faba3e724c79'::uuid, 1, 'REGULADOR DE PRESION BLANCO SEAFLO'),
  ('92226c96-5ae8-4ce2-b786-d55e2a321dbe'::uuid, 1, 'Filtro agua 1"'),
  ('923434be-2370-4380-a9ca-76fb2b9f65a9'::uuid, 2, 'CANILLA BALDEO'),
  ('985db2c6-6d36-472c-a504-63a10ac312a7'::uuid, 10, 'PLACAS ANTIRUIDO'),
  ('9f04de6f-b777-41f0-8876-40e62510d848'::uuid, 1, 'Switch automático Rule 35A'),
  ('9f840a6e-1936-4bf4-8bf5-c28e68ce191d'::uuid, 2, 'Portarrollo Epuyén 0167/L2 · NEGRO'),
  ('9fa4d195-0da9-4d28-8463-32a2195d587d'::uuid, 1, 'TV  43" · Samsung Full HD F600'),
  ('a43a8298-436c-4e1f-9582-0fb43da1529c'::uuid, 2, 'Botón malacate Footswitch · Footswich Maxwell con tapa heavy duty grande'),
  ('ae4bc429-63ac-408a-933a-1e739d69adfb'::uuid, 1, 'TERMOTANQUE CAMCO 23LTS'),
  ('b2830c16-2f31-4bb0-9b7e-60368c734e8b'::uuid, 1, 'Rejilla D90 Obturable Negra - Calefactor Autoterm'),
  ('b86ae14a-7971-4531-a328-1c810fc6a520'::uuid, 1, 'Buje de bronce 130x50 para tuerca de limera'),
  ('c757c46b-dd25-48fd-ab6f-7b885ebdb30b'::uuid, 1, 'Calefactor Autoterm Air 4D 12V 4000W'),
  ('c78ef8fb-f67f-423b-b667-3fa426fa4c6e'::uuid, 1, 'Bomba aire acondicionado 220v 500gph'),
  ('ca73afec-3c5d-4507-ae50-feb188081410'::uuid, 1, 'Bomba agua JABSCO automática 3GPM + prefiltro'),
  ('cb0f6f61-bad4-42e0-a882-10b1e77cc6bc'::uuid, 2, 'Toallero Epuyén 0163/L2 · NEGRO'),
  ('ccb91ab2-138e-4da2-ae15-7221ce6b7ddf'::uuid, 1, 'Buje de bronce 90x30 para tuerca de hélice'),
  ('cf096fe3-b941-4cc9-9c09-e141692ac76a'::uuid, 1, 'Tambucho Cuadrado 57.5cm x 57.5cm'),
  ('d121cbdc-83c7-4af2-96a7-2cb55d14d52c'::uuid, 1, 'Solenoide de inversion 12v · Maxwell'),
  ('d2082f3b-9303-49d2-b800-17c8450f6fe3'::uuid, 1, 'Termica malacate 130A'),
  ('d2b76171-156b-46e7-ac12-038a8987cff1'::uuid, 2, 'FLEXIBLES DE COMBUSTIBLE K52'),
  ('d41e6b99-e9b8-4afb-a577-322d9fe27489'::uuid, 2, 'Giratorio gusano cadena 6-8mm'),
  ('d553e65c-1370-4101-a848-e71d52f864e5'::uuid, 2, 'Switch automático Rule 37A P/Bomba de achique (Rojo)'),
  ('d98179e7-c15c-4c02-bb97-187c72a2f428'::uuid, 2, 'Rejilla D60 Orientable Negra - Calefactor Autoterm'),
  ('db790bda-bf31-43c2-974a-e52a228deb9c'::uuid, 1, 'Silenciador escape 2" Centek 1500027w (grupo)'),
  ('dcc4472d-67f8-4206-8dba-5f6f93f16dd7'::uuid, 2, 'Soporte pared TV'),
  ('df54fb2c-f42c-49e8-95bf-42ed3cda26a2'::uuid, 1, 'Antena VHF SHAKESPEARE PLASTICO 5206-N'),
  ('e5f685f6-e7af-4577-aa83-edc735855868'::uuid, 1, 'Duchador con barral FV Polca 0128.17'),
  ('ee4907f6-c15e-476c-bacf-a4981ba991ef'::uuid, 4, 'Rejilla D60 Obturable Negra - Calefactor Autoterm'),
  ('f0f467a1-77e1-4d4f-86e1-f77c56a7edd9'::uuid, 2, 'INSTRUM. NIVEL AGUA NEGR/CROM'),
  ('f1445b1d-8c0a-4998-862d-897de18f4190'::uuid, 1, 'Luz banda VERDE led'),
  ('f186215b-531e-4459-82b3-c3d43c4d9eab'::uuid, 1, 'LUZ LED HELLA MARINE TOPE BLANCA'),
  ('f294dc1f-fcdc-4857-9091-259571a144bd'::uuid, 2, 'Compas magnetico S-53 (Brujula)'),
  ('f59d1862-9828-4a20-9f16-aa636e431d54'::uuid, 1, 'levantapiso perko 75mm'),
  ('f6b5df5a-cd9b-412b-9453-398bf5e246e3'::uuid, 1, 'TV Philips HD 24" 24PHD5565/77'),
  ('f8310ddd-577e-4534-9e21-af1635583300'::uuid, 1, 'Juego monocomando para lavatorio Epuyén 0206/L2 · NEGRO'),
  ('fb26bbe0-e1a0-4a2e-b0ea-815715860597'::uuid, 1, 'Bocina Marinco doble INOX electrica 12v'),
  ('fb8c7b49-f1c0-4425-b303-1efac78f39a9'::uuid, 1, 'DUCHADOR TWIST AGUA FR/CAL C/MANGUERA'),
  ('fc71f623-2fec-42ab-8cc7-0e2f1cc0feed'::uuid, 6, 'DEFENSA INFLABLE MA BLANCA 21 X 62 CM'),
  ('fccef917-b063-4494-bd7f-986ffe724942'::uuid, 1, 'Tunel Stern 185mm · Sidepower'),
  ('ff032a88-d10e-47f6-b7f7-239bc2efb946'::uuid, 1, 'Salida escape 2"');

update public.panol_materiales m
set stock_minimo = 0
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo = z.anterior
  and not exists (
    select 1 from public.panol_materiales_audit a
    where a.material_id = m.id and a.campo = 'stock_minimo' and a.origen not like 'minimos_%'
  );

update public.panol_materiales_audit a
set origen = 'minimos_por_obra_20261104',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', 'Se compra para cada barco: avisa "Falta para obras", no el mínimo')
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
