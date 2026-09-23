-- Precios de Trimer para el K52.
--
-- Dos papeles:
--   · Presupuesto preliminar 291225-02 del 29/12/2025, referencia K52-26 (fotos).
--   · Cuenta corriente de Trimer con Klase A (PDF): lo que se pidió y se devolvió
--     entre abril y julio de 2026, más las órdenes de tender lifts y grupos.
-- Todo en dólares. El presupuesto no aclara IVA: va tal cual, igual que los
-- precios de Trimer que ya estaban en las fichas.
--
-- Cuatro cosas además de los precios sueltos:
--   1. KITS. Trimer cotiza algunos juegos en un solo número (bow + stern, kit
--      Marinco 50A, paquete de aires, MultiPlus con panel). Van como conjunto:
--      el precio suma una vez y las piezas dicen "en conjunto".
--   2. REPETIDOS. El presupuesto confirma que hay materiales cargados dos veces:
--      2 ánodos de timón, 2 de flap, 8 llaves remotas y una sola toma Marinco.
--      El gemelo se marca "Viene incluido en otro ítem" (se puede quitar desde
--      Costo de obra).
--   3. SE BORRAN 11 renglones de referencia que cargué el 22 y el 23/09 (web o un
--      producto parecido de otro proveedor). Tienen fecha más nueva que el
--      presupuesto de Trimer y, como el costo usa el último precio, le ganarían
--      al número real. Se borran por id: solo esos renglones.
--   4. FICHAS QUE ESTABAN MAL: los fittings Whale figuraban a USD 0,10-0,14 (son
--      5 a 7 cada uno), el extractor Rule 4" a USD 240 (son 55) y la antena
--      5206-N a 125 (son 92). Con el renglón fechado de Trimer pasa a usarse el
--      bueno; la ficha no se toca.
--
-- De las migraciones 20260923110000 y 20260923120000, que no se habían
-- aplicado, se sacaron los renglones que Trimer reemplaza. Da igual el orden en
-- que se corran.
--
-- El presupuesto es de diciembre: a los seis meses la pantalla lo marca como
-- viejo. Entra al total igual, pero conviene pedirle a Trimer que lo actualice.

begin;

-- ─── 1. Precios sueltos ─────────────────────────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('4e3ccdd5-91e1-4269-a0e5-438d2307daa3', 1300, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): MALACATE MAXWELL RC8-8 / 1000W - 12V, de inoxidable · IVA sin confirmar, cargado tal cual'),  -- MALACATE 1000W CAD 8MM MAXWELL
  ('4252bbcd-315f-4a58-a310-a3bcf66ddb29', 60, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): PANEL UP/DOWN MAXWELL · IVA sin confirmar, cargado tal cual'),  -- Control Malacate MAXWELL P102938
  ('99209f9a-a322-425b-adbf-b30c45b2f7b2', 93, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): FOOTSWITCH CON TAPA HD GRANDE MAXWELL (2 a 93) · IVA sin confirmar, cargado tal cual'),  -- Botón malacate Footswitch
  ('d2082f3b-9303-49d2-b800-17c8450f6fe3', 155, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BREAKER MAXWELL 135A · IVA sin confirmar, cargado tal cual'),  -- Termica malacate 130A
  ('23e08655-1520-4423-b3bc-bde27b97a454', 155, 'USD', '2026-06-22', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Cuenta corriente Trimer con Klase A, pedido del 22/06/2026: CIRCUIT BREAKER (80 AMP) · IVA sin confirmar, cargado tal cual'),  -- Termica malacate 80A
  ('dfeac538-b219-4162-8479-5a5c1d9f6e74', 251, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SOLENOIDE MAXWELL 12V · IVA sin confirmar, cargado tal cual'),  -- Solenoide de inversion 12v
  ('39e6dbda-c7b5-428d-ac8f-e39ad762151e', 950, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SELLO PSS PARA EJE 2-1/2" BOCINA 3-1/2" (2 a 950) · IVA sin confirmar, cargado tal cual'),  -- Sello PSS para eje 2 1/2", tubo 3 1/2"
  ('e059ff69-2051-4559-a6bb-3f0168638414', 2022, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): DIRECCION MULTISTEER: pistón de bronce 15,4 cu-in + bomba frontal 2,4 cu-in, sin los fittings para el piloto. La matriz dice Glydus y en la cuenta corriente Trimer entregó un cilindro Glydus IC-40-A1: confirmar la marca · IVA sin confirmar, cargado tal cual'),  -- SISTEMA DE DIRECCI0N GLYDUS
  ('1a2de584-5b07-48c3-b6e6-15e5a6d65844', 1270, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SILENCIADOR CENTEK 5" (16x16) (2 a 1.270) · IVA sin confirmar, cargado tal cual'),  -- Silenciador Vernalift 5"
  ('cc62079b-7883-418e-b881-af7c8871a715', 490, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SILENCIADOR P/GENERADOR DIA ESCAPE 2" CENTEK · IVA sin confirmar, cargado tal cual'),  -- SILENCIADOR (S/T), 2" (8X8), VERNALIFT
  ('cc62079b-7883-418e-b881-af7c8871a715', 498, 'USD', '2026-06-09', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Cuenta corriente Trimer con Klase A, pedido del 09/06/2026: 2 SILENCIADOR (S/T), 2" (8X8) por 996 · IVA sin confirmar, cargado tal cual'),  -- SILENCIADOR (S/T), 2" (8X8), VERNALIFT
  ('867bb5f4-9568-4620-a03b-f151c8804c3c', 865, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SEPARADOR DE AGUA Y GASES 2" CENTEK · IVA sin confirmar, cargado tal cual'),  -- Separador agua-gases 2" Centek 1020200 (grupo)
  ('249c937c-f53f-4a3f-8c58-e22200487852', 2035, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SISTEMA DE FLAPS BENNETT 12V C/BOMBA, CHAPAS 24x12, EIC de 1 estación y kit dual actuator de 4 actuadores. La segunda estación no está en el presupuesto · IVA sin confirmar, cargado tal cual'),  -- Sistema FLAP 24 x 12" Doble estacion
  ('df54fb2c-f42c-49e8-95bf-42ed3cda26a2', 92, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ANTENA DE VHF 8'' 6DB SHAKESPEARE 5206-N · IVA sin confirmar, cargado tal cual'),  -- Antena VHF SHAKESPEARE PLASTICO 5206-N
  ('2d98e85a-bde0-421c-a0f0-61697283eee1', 84, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BASE ANTENA DE VHF INOXIDABLE SHAKESPEARE · IVA sin confirmar, cargado tal cual'),  -- BASE DE ANTEN VHF INOX GRANDE SHAKESPEARE
  ('9f04de6f-b777-41f0-8876-40e62510d848', 42.5, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SWITCH AUTOMATICO RULE 35A P/BOMBA (4 a 42,50) · IVA sin confirmar, cargado tal cual'),  -- Switch automático Rule 35A
  ('d553e65c-1370-4101-a848-e71d52f864e5', 65, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SWITCH AUTOMATICO RULE 37A P/BOMBA · IVA sin confirmar, cargado tal cual'),  -- Switch automático Rule 37A P/Bomba de achique (Roj
  ('6d14a23a-1e7a-4661-ab6d-07e9872f9eb2', 43.5, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): PANEL PARA BOMBA DE ACHIQUE RULE (5 a 43,50) · IVA sin confirmar, cargado tal cual'),  -- CONTROL BOMBA DE ACHIQUE RULE MODEL 43
  ('ca73afec-3c5d-4507-ae50-feb188081410', 190, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BOMBA DE AGUA ITT-JABSCO 3.0GPM 12V CON FILTRO · IVA sin confirmar, cargado tal cual'),  -- Bomba agua JABSCO automática 3GPM + prefiltro
  ('026fbef3-d310-48df-b849-1a2fbc861905', 435, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): FARO A CONTROL REMOTO ITT-JABSCO 135SL · IVA sin confirmar, cargado tal cual'),  -- FARO A CONTROL REMOTO 135 SL - 12V
  ('f8e4c99d-bb13-469a-8d68-d3fd24f72235', 100, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): SENSOR WEMA NIVEL COMBUSTIBLE/AGUA 46" (2 a 100) · IVA sin confirmar, cargado tal cual'),  -- Sensor nivel agua/comb.  47´¨
  ('f721e6e7-493d-44f6-9298-f05b99279da2', 44, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): INSTRUMENTO WEMA NIVEL AGUA ARO CROMADO · IVA sin confirmar, cargado tal cual'),  -- Reloj nivel agua
  ('be7c23c6-35d7-4bf5-a53c-20ffcba011ae', 44, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): INSTRUMENTO WEMA NIVEL COMBUSTIBLE ARO CROMADO · IVA sin confirmar, cargado tal cual'),  -- Reloj nivel combustible
  ('6864fa83-e55a-4e23-aae9-aaa77d0f8430', 51, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): EXTRACTOR RULE 3" 12V (2 a 51) · IVA sin confirmar, cargado tal cual'),  -- BLOWER INLINE 3" 12V
  ('e48ea676-f3b8-45ba-81cd-7fb69654fb0f', 55, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): EXTRACTOR RULE 4" 12V (4 a 55) · IVA sin confirmar, cargado tal cual'),  -- Extractor Rule 4" 12V
  ('1cd225a8-7247-4fa4-8ac2-4de9153355ff', 5.75, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): DUCTO PARA EXTRACTOR 3" (3 m a 5,75 el metro). En la matriz dice 4", pero por cantidad y precio es el de 3" · IVA sin confirmar, cargado tal cual'),  -- DUCTO P/EXTRACTOR 4"
  ('74c225a3-4816-4224-b441-3db8447f9e56', 7.9, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): DUCTO PARA EXTRACTOR 4" (5 m a 7,90 el metro) · IVA sin confirmar, cargado tal cual'),  -- Ducto p/extractor de 4"
  ('98a329ca-2e8e-464f-8221-a0f591c162a3', 148, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ANODO CANADA METAL P/EJE 2-1/2" MAGNESIO (2 a 148) · IVA sin confirmar, cargado tal cual'),  -- Anodo eje 2 1/2
  ('29687db1-d64d-4f74-bd3c-fb8a51af0a57', 42, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ANODO CANADA METAL P/TIMON CMR03M MAGNESIO (2 a 42) · IVA sin confirmar, cargado tal cual'),  -- Ánodo timón
  ('e476e8a2-6556-491e-aef2-c306266d642c', 39, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ANODO CANADA METAL FLAPS CMBNT1M MAGNESIO (2 a 39) · IVA sin confirmar, cargado tal cual'),  -- Ánodo de flaps
  ('335658f9-b72a-41cf-ab2c-bceb8dfb7fe3', 116, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ANODO CANADA METAL PLACA MAGNESIO · IVA sin confirmar, cargado tal cual'),  -- Ánodo escudo
  ('11088a90-8940-4d3f-a7be-1e875ad9191c', 245, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): LLAVE DE BATERIAS BLUE SEA REMOTA 12V (8 a 245) · IVA sin confirmar, cargado tal cual'),  -- LLAVE REMOTA (SOLENOIDE) 12v 500amp P/BATERIAS
  ('3542b7d9-0271-479a-89fe-e0cfd774d83a', 78, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): REGULADOR DE PRESION ITT-JABSCO CROMADO · IVA sin confirmar, cargado tal cual'),  -- Regulador de presion cromado jabsco
  ('ca45014c-4a90-4490-a2df-67a01966c13f', 908, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): TERMOTANQUE KUUMA CAMCO 42 LTS · IVA sin confirmar, cargado tal cual'),  -- Termotanque
  ('5f7a6cf0-4f7d-4779-911b-6e350067ade2', 142, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): KIT LUZ NAVEGACION ATTWOOD LED ROJA + VERDE + POPA + FONDEO (trae también la de popa y la de fondeo) · IVA sin confirmar, cargado tal cual'),  -- LUZ DE NAV INOX 2N LED VERDE+ROJA (PAR)
  ('9821b887-9f3c-447e-b161-e19e3b54c053', 1825, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): FABRICADORA DE HIELO VITRIFRIGO INOX C/OPC TANQUE AGUA MINERAL · IVA sin confirmar, cargado tal cual'),  -- Fabricadora de hielo
  ('a480d9c4-782b-4797-a3b1-add592ac95f0', 210, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): DUCHADOR FRIO/CALIENTE WHALE TWIST · IVA sin confirmar, cargado tal cual'),  -- Duchador frio calor WHALE Twist K01536
  ('d39d6ed7-08ca-41e0-8b22-0277bb62c670', 135, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): BATTERY PROTECT SMART 220A · IVA sin confirmar, cargado tal cual'),  -- BATTERY PROTECT SMART 220A 12/24V
  ('8fc8817c-6b06-4776-82b7-1f3a432b1849', 6.9, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): TEE WX1502B (20 a 6,90) · IVA sin confirmar, cargado tal cual'),  -- Conector "T" WHALE WX1502
  ('1feb1b1c-b7e3-4a4f-8bf1-6aba68e400c3', 4.92, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): CODO WX1503B (20 a 4,92) · IVA sin confirmar, cargado tal cual'),  -- Conector Codo WHALE WX1503
  ('55df7d97-300f-4492-a53e-18f6c7893484', 5.5, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ADAPTADOR 1/2" MACHO WX1514 (25 a 5,50) · IVA sin confirmar, cargado tal cual'),  -- Adaptador rosca M 1/2" Whale WX1514
  ('fd140844-dc8e-42cd-9ac2-bba91eb60d3b', 6.95, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): TEE WX1521B (8 a 6,95) · IVA sin confirmar, cargado tal cual'),  -- Conector "T" c/espiga WHALE WX1521
  ('d49fc5d0-5fa8-4edd-8463-2797b6bc9457', 5.5, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): CODO WX1522B (10 a 5,50) · IVA sin confirmar, cargado tal cual'),  -- Conector Codo c/espiga WHALE WX1522
  ('38d5461f-ce2e-4cd5-bcf0-eb1a23c60df5', 5.22, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): ADAPTADOR 1/2" HEMBRA WX1532 (3 a 5,22) · IVA sin confirmar, cargado tal cual'),  -- Adaptador rosca H 1/2" Whale WX1532
  ('1e62c049-291c-494f-a3c2-1ac57b9512c7', 27, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): LLAVE EXCLUSA WHALE 1574 (11 a 27) · IVA sin confirmar, cargado tal cual'),  -- LLAVE ESCLUSA IN-LINE QCxQC
  ('9d2ca04f-b2e5-40a2-be53-7803a385c77e', 2.6, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): TUBO WHALE AZUL, rollo de 50 m a 130 (2,60 el metro) · IVA sin confirmar, cargado tal cual'),  -- TUBO QC 15mm AZUL (ROLLO 50 Mts)
  ('55c25202-8972-4106-a9db-fccff744e4a6', 2.6, 'USD', '2025-12-29', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26): TUBO WHALE ROJO, rollo de 50 m a 130 (2,60 el metro) · IVA sin confirmar, cargado tal cual'),  -- TUBO QC 15mm ROJO (ROLLO 50 Mts)
  ('114634e7-f49b-4509-a876-a7b3b08d2d35', 1360, 'USD', '2026-05-04', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Cuenta corriente Trimer con Klase A, devolución del 04/05/2026: HELADERA/FREEZER CAJON 30L a 1.360 · IVA sin confirmar, cargado tal cual'),  -- Heladera cajon Vitrifrigo D30A
  ('ec117514-7f5f-42e8-8cb8-e32533e9a05b', 29000, 'USD', '2025-08-15', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', 'Cuenta corriente Trimer con Klase A, OP 187 del 15/08/2025: 5 TENDERLIFT 600KG 12V por 145.000 (29.000 cada uno). La matriz pide un Opacmare 5220; confirmar que sea el mismo · IVA sin confirmar, cargado tal cual');  -- Tender lift OPACMARE OPACMARE 5220_90_09

-- ─── 2. Kits ───────────────────────────────────────────────────────────────
-- Kit bow + stern Sleipner 96 kg · K52: 5 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Kit bow + stern Sleipner 96 kg · K52', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', '52', 5700, 'USD', '2025-12-29', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26)', 'KIT BOW+STERN 96KG @ 12V DOBLE HELICE SLEIPNER SIDE-POWER: bow y stern thruster de 96 kg doble hélice, panel docking doble, 2 cables de 9 m para el panel y túnel stern importado de 185 mm. IVA sin confirmar.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Kit bow + stern Sleipner 96 kg · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    '3e09b5e5-b8e0-43dc-addb-84e84a5b73b9',  -- Bowthruster 96Kg 12v SE80
    '146c111a-ea7a-4795-932d-0495ff74d284',  -- Sternthruster 96kg 12v
    '910a60e0-61a0-458f-988e-758798199eb0',  -- Tunel Stern 185mm
    '6678ba98-7ee2-48c2-a7d0-de55423a655e',  -- Panel Touch control bowthruster
    '830b7865-964f-4878-a750-7ede841a44f4'   -- Cable p/panel bow-stern
 );

-- Kit Marinco 50A · K52: 4 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Kit Marinco 50A · K52', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', '52', 503.5, 'USD', '2025-12-29', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26)', 'KIT MARINCO 50A: toma Marinco 50A 6351EL, ficha hembra interlock 50A 125V, funda para la ficha y 12 m de cable Marinco 50A. IVA sin confirmar.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Kit Marinco 50A · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    '5bbaa83e-00e8-4248-a6f9-72bf8e4b727e',  -- TOMA MARINCO 50A
    '51f962af-a1d4-48cc-95de-1aa00536bd8d',  -- FICHA MARINCO HEMBRA INTERLOCK 50A 125V
    'd6b494c6-064c-4694-a4a1-94e52ee12dca',  -- FUNDA PARA FICHA MARINCO 50A 6360CRN
    '283a4dce-133b-44fd-9b82-52b030fba9af'   -- CABLE AMARILLO TIPO MARINCO 3X7.5MM 50AMP X12MTS
 );

-- Paquete de aires Webasto · K52: 3 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Paquete de aires Webasto · K52', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', '52', 4410, 'USD', '2025-12-29', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26)', 'PAQUETE AIRES: equipos Webasto FCF16 y FCF12 230V, cada uno con display, cable y control inalámbrico, y 2 bombas importadas SMP500ZBR de acople magnético. IVA sin confirmar.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Paquete de aires Webasto · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    'cc87231c-d12b-4c0f-8bdd-e3357aca99dd',  -- Aire acondicionado 16000 BTU
    '279aa38d-e417-4176-a759-d0305626001b',  -- AIRE ACONDICIONADO 12000 FCF12 COMUN
    'c78ef8fb-f67f-423b-b667-3fa426fa4c6e'   -- Bomba aire acondicionado 220v 500gph
 );

-- Victron MultiPlus 2000 con panel · K52: 2 materiales
with nuevo as (
  insert into public.panol_conjuntos (nombre, proveedor, proveedor_id, modelo, precio, moneda, fecha, fuente, notas)
  select 'Victron MultiPlus 2000 con panel · K52', 'Trimer', 'fb6424b4-9138-4a60-9a33-19cb4e4bc0ff', '52', 1310, 'USD', '2025-12-29', 'Presupuesto preliminar Trimer 291225-02 del 29/12/2025 (ref. K52-26)', 'INVERTER-CHARGER VICTRON MULTIPLUS SENOIDAL 2000W 12V CON PANEL REMOTO MULTI CONTROL. IVA sin confirmar.'
   where not exists (select 1 from public.panol_conjuntos where nombre = 'Victron MultiPlus 2000 con panel · K52')
  returning id
)
insert into public.panol_conjunto_items (conjunto_id, material_id)
select nuevo.id, m.id
  from nuevo
  cross join public.panol_materiales m
 where m.id in (
    '589ba7bb-da68-4c38-a128-4f5248f1b2e4',  -- INVER/CARG.MUL.2000W,12V-80A
    '2ece2c3a-6001-4f6c-9799-d866475d1cf7'   -- PANEL MULTI CONTROL DIGITAL GX
 );

-- ─── 3. Repetidos ──────────────────────────────────────────────────────────
-- Necesita la migración 20260923100000 (la columna sin_precio_motivo).
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (es el mismo ánodo de timón que "Ánodo timón": Trimer cotiza 2 en total)'
 where id = 'eca13a8f-ee79-4612-9116-43d21da5ab30' and sin_precio_motivo is null;  -- ANODO TIMON 3 3/4 MAGNESIO
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (es el mismo ánodo de flap que "Ánodo de flaps": Trimer cotiza 2 en total)'
 where id = '12f606c7-0922-41a4-bc7a-c7f4e6d08d0d' and sin_precio_motivo is null;  -- ANODO DE FLAP MAGNESIO
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (son las 8 llaves remotas Blue Sea de "LLAVE REMOTA (SOLENOIDE)": Trimer cotiza 8 en total)'
 where id = '80c14f0c-c7a8-4c83-8886-5605384f4be7' and sin_precio_motivo is null;  -- LLAVE CORTE A DISTANCIA BATERIA ON-OFF
update public.panol_materiales set sin_precio_motivo = 'Viene incluido en otro ítem (el kit Marinco 50A de Trimer trae una sola toma y una sola ficha)'
 where id = '73407800-3d8e-4fa2-920e-741226a7bb9b' and sin_precio_motivo is null;  -- FICHA MARINCO TOMA 50A A125V

-- ─── 4. Referencias que taparían a Trimer ──────────────────────────────────
delete from public.panol_precios
 where id in (
   '7c7cf903-345b-4958-9e12-3c491dbbe5c6',  -- Termica malacate 130A · Baron 2026-09-21
   '2ce22896-7605-4352-aea7-b69bc3ecce85',  -- Solenoide de inversion 12v · Flojumar 2026-09-04
   'ba810c9a-6d16-4ff8-a05e-6f1f4bd3a099',  -- SILENCIADOR (S/T), 2" (8X8), VERNALIFT · Referencia web 2026-09-23
   '011e2f79-6eaa-4c80-ab95-357661039572',  -- BASE DE ANTEN VHF INOX GRANDE SHAKESPEAR · Referencia web 2026-09-23
   'ce0e3098-93ac-4007-a586-914db78e03fa',  -- CONTROL BOMBA DE ACHIQUE RULE MODEL 43 · Referencia web 2026-09-23
   '6aa6eec4-0a8d-4460-861e-8d6c8bc4ebab',  -- Sensor nivel agua/comb.  47´¨ · Flojumar 2026-09-04
   '3d3cad38-cb81-48d7-8cb1-3231f63aa74f',  -- LUZ DE NAV INOX 2N LED VERDE+ROJA (PAR) · Flojumar 2026-09-04
   'afdd1a46-f2dc-4073-828a-fdc1d624365a',  -- ANODO DE FLAP MAGNESIO · Referencia web 2026-09-23
   'a85a00f9-223d-4416-9963-3b310100e9b7',  -- FICHA MARINCO TOMA 50A A125V · Referencia web 2026-09-23
   'b99df776-16d1-4196-b3ea-f9c9473655a4',  -- LLAVE ESCLUSA IN-LINE QCxQC · Referencia web 2026-09-23
   'f187b466-d7a6-4430-a743-49f277013746'   -- BATTERY PROTECT SMART 220A 12/24V · Referencia web 2026-09-22
 )
   and fecha >= '2026-09-01';

commit;
