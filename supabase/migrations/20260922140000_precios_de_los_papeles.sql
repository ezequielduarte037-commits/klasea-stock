-- Precios de los papeles que junté en precios/ (septiembre 2026).
--
-- Cada renglón se emparejó por el código del proveedor, que el catálogo ya
-- tiene cargado en panol_materiales.codigo. No hay ninguno adivinado por
-- parecido de texto: si el código no estaba, el renglón quedó afuera y se
-- lista aparte en el informe.
--
-- Papeles: presupuesto Baron 21/09, remito valorizado Baron 02/09, lista
-- Favicur 03/09, presupuestos Flojumar 5534/5536/5538 del 04/09 y
-- presupuesto Rincón del Herraje 02/09.
--
-- Se carga el historial (panol_precios, con fecha y fuente) y además se
-- refresca la copia de panol_materiales, igual que cuando se aplica un
-- comprobante desde la pantalla.

begin;

-- ─── Historial ──────────────────────────────────────────────────────────────
insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('09780a31-1f34-4dd1-8f8d-d452e8980a86', 33600, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('5698170e-a230-4c71-a893-c1e61414636f', 97000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('646baa4a-525b-4da8-a656-208127bae392', 106000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('c2fd0c04-0fee-4352-8bab-cb4bd7257592', 46400, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('8cc56e95-c4d5-44df-987c-8de36bccf134', 9400, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('8803ceee-6654-42d5-a057-41cc3ba79260', 8410, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('6de143f9-b084-47eb-8f81-1def78ec6303', 22100, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('479a4a81-0e4e-4a62-a195-c9a9f7758335', 15200, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('f96b4dfd-286b-4017-9aee-ec80ab83e775', 132000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('1c716ca4-05e1-4bf5-953f-562966eae5ef', 132000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('d41e6b99-e9b8-4afb-a577-322d9fe27489', 73700, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('f61d2ca2-c720-46b2-87a8-4693652d8d7c', 64000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('60cc69f1-f661-4b3c-972d-58ffe8b1a26e', 21500, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('4edb6464-7328-492f-85a9-00a18528f1ed', 8110, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('d19ad301-d473-4c5a-bc37-2444eacab11f', 8900, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('0a40222c-882b-4be8-bda5-9553b71452aa', 3510, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('3cb02ccc-16d0-4ead-858c-63b252fb96c8', 3510, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('fa7f1942-6ccf-40fb-aeca-a7e3849002f8', 2280, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('98def276-146e-405c-b5b0-2e6db713d9b1', 3620, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('c30fcfdc-acbc-4cc0-9d37-f37a2bed9998', 3620, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('e45a2ce5-1ef2-4f7b-840a-d099514de332', 9510, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('a7f1c0a7-30ef-44d3-ad3a-fb31dbe096fa', 14600, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('39747ed4-88a4-409c-9f3c-30331412ba0a', 929, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('15434e19-20ec-4c5f-a327-7e494dc79e42', 4470, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('d88c8a80-63e4-4550-b353-03df7cc4cd00', 4250, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('52e6bb06-f368-4158-9ca1-48f814462945', 4250, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('5d9cc299-25f7-42ff-8735-53dcc5cbb0fa', 3420, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('d395a4e8-4948-4029-adc8-552cd0130509', 60400, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('f2087e91-2574-49ee-9a81-f7dcb25b4aea', 2000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('35ee0342-65e2-4297-afd6-3d18878d8b29', 18300, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('ee393478-3027-42ea-8600-2ee5bcc94262', 1650, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('985db2c6-6d36-472c-a504-63a10ac312a7', 122000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('66668366-425c-4ed9-b3d2-31a7fa122a3c', 141000, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('15b642f0-2b8f-486e-9b8b-0eee0657ed50', 4930, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('fc71f623-2fec-42ab-8cc7-0e2f1cc0feed', 46500, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('d775eb6d-2f27-4684-a22f-fd91fa386a99', 5320, 'ARS', '2026-09-21', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Presupuesto Baron 21/09/2026 (obra 37-43, lista sin desc. 10%)'),
  ('53213c0f-9f0a-4f64-beca-64d595e9fd99', 178000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('8e07494d-5f09-491e-8449-c59527d3e1bf', 95600, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('e3fc2701-32b9-4ea5-beda-a68210c83bbd', 53700, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('a107da59-c4cd-4b4c-8244-badc9a9d4fb7', 1220000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('985db2c6-6d36-472c-a504-63a10ac312a7', 122000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('15b642f0-2b8f-486e-9b8b-0eee0657ed50', 4930, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('fc71f623-2fec-42ab-8cc7-0e2f1cc0feed', 46500, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('09780a31-1f34-4dd1-8f8d-d452e8980a86', 33600, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('5698170e-a230-4c71-a893-c1e61414636f', 97000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('65349c90-9beb-482c-9085-ace8b9de4991', 118000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('8cc56e95-c4d5-44df-987c-8de36bccf134', 10300, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('c2fd0c04-0fee-4352-8bab-cb4bd7257592', 46400, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('1c716ca4-05e1-4bf5-953f-562966eae5ef', 132000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('f96b4dfd-286b-4017-9aee-ec80ab83e775', 132000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('a001cf4b-9629-48ed-a6ac-3ebcc09d6aa7', 5230, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('f4a56af4-e018-411a-a9f1-1dee3f6db079', 10500, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('7e7171d2-dc44-40dd-bacf-49a563451eee', 14800, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('09331295-6def-4f39-9227-a7a528c3f7f9', 116000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('bb25f442-7a22-44e7-9531-8676157df05a', 2440, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('65a75fd0-cd90-4f76-9b2c-000d45142aec', 41900, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('a7f1c0a7-30ef-44d3-ad3a-fb31dbe096fa', 14600, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('7ffb7afa-16e4-4259-8311-5592818755ec', 22600, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('d41e6b99-e9b8-4afb-a577-322d9fe27489', 73700, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('f61d2ca2-c720-46b2-87a8-4693652d8d7c', 64000, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('993fa5a3-cadb-411f-8a5f-d7dd04f81133', 78400, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('81399403-44f8-4c56-8840-aef8d2a82b59', 7920, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('97797237-c9b1-45f9-8645-a8a998f21da7', 34300, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('33cd96e4-def4-47e3-92ea-960d3404258e', 34300, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('fa7f1942-6ccf-40fb-aeca-a7e3849002f8', 2280, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('98def276-146e-405c-b5b0-2e6db713d9b1', 3620, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('c30fcfdc-acbc-4cc0-9d37-f37a2bed9998', 3620, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('869e57c0-b1b2-49b9-85bc-d90a5822cdc8', 4440, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('80173bf8-c000-4ec5-930f-48feeca0e9ef', 4210, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('d19ad301-d473-4c5a-bc37-2444eacab11f', 8900, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('bc5d7304-e8b4-46af-b558-4ff39d0cea03', 5150, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('2972dabe-5a20-4477-a249-8856b7f3c77b', 13900, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('e45a2ce5-1ef2-4f7b-840a-d099514de332', 9510, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('b2ace13f-e5a3-458b-a1c0-417cfb3ba839', 4460, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('49b5c301-4638-45ac-8f90-3dc5a3d2496a', 7390, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('1a30fa8d-5e98-4b44-a368-34462ee7d9e8', 4650, 'ARS', '2026-09-02', 'Baron', '6794d0d7-fa22-4be5-87f9-e1f36b94b07a', 'Remito valorizado Baron 02/09/2026 (obra H175)'),
  ('9fbe52d7-8d38-4efd-8ae3-cc32ad619c95', 138621.25, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('9ec7a4b1-c2ce-45bc-80af-356c1feb46d3', 138621.25, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('8504ca29-017e-400a-9020-621c4082e882', 33385.29, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('6b098d9a-6614-4da8-84e1-b8400ecac3e8', 29995.82, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('ff2604f7-8fc1-4d77-99d2-91f253c149ed', 59341.61, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('a8083939-4042-4c85-8184-3a0332e73a80', 63058.82, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c8f4d112-d431-4277-bf01-f59aba81c7bc', 28340.69, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('078555e6-d92c-4c21-90c0-106fa02eacc3', 31691.92, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('2782b5b8-11bc-409c-9673-1a8e0274d65f', 26677.37, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('8d9aa2c7-5ef5-4d98-89e4-f11a11b74f97', 26677.37, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('df184234-6b20-4ad3-bc72-0f89f8bff6e9', 857149.51, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('15072772-c1e3-422c-b302-977b1dd0dc87', 857149.51, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('d462c0f8-1311-49ed-9230-7023c87a9a27', 250325.83, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('49357d73-83c1-4a36-93c9-088e0d9c5616', 249196.64, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('2ee9fc7b-19eb-4d9f-b047-b264e2f95b21', 777121.35, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('f3ca32da-db5e-4b69-9860-4786596cac22', 140691.78, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('4ec399c3-dca9-4689-bfff-64c45fcb58c6', 140691.78, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('a6067408-6292-4eb8-a9cb-319c052aefb6', 838225.74, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c5d41943-78d7-4812-9852-ad04bd96c014', 838225.74, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('1258cdb1-c87d-45c6-9d57-402adff47c83', 74176.32, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('a8137fb3-d8c6-4ea0-9bc2-77d6478d7d42', 127938.01, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('a1e3404a-3b28-4cee-a993-99685a34a056', 92729.62, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c7271d6c-5b91-4479-b84f-3eab09aed429', 145042.39, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('b2003e08-f3c0-4ab4-821f-5ac301e9c2ad', 309813.87, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('ad735cad-720d-4b49-a53c-4682cba07d08', 309813.87, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('12fcd91e-3673-4f3a-b02d-dc3d20200983', 273918.58, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('a6bbdfaa-6edf-4253-a10e-afa1d7510100', 239371.15, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('91e284a8-dcef-4b0e-a53b-e57a7e7109e7', 206463.83, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('2df2dcf2-15c2-429e-8adf-7395f08eca4d', 206463.83, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('e6d9e9ab-ce7f-4ce9-89c2-c5ccbb3120e2', 146846.37, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('3d5a21df-c394-476e-9fcf-44767cc7251a', 146846.37, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('f02fa258-e374-4b31-8351-72b9d2708e51', 162952.48, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c41bae29-d525-4310-838c-5ef2428695f8', 162952.48, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('d04ec5de-25b7-4c1a-8f4f-4edcb9ae31d3', 272592.56, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('0b85745c-29ea-40cf-a264-00140248678a', 271554.69, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('dadc554d-be90-49ee-a763-b20462d2a0bd', 135278.21, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c8e31913-04a8-4802-b9ba-d04f10cc5724', 138207.47, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('145f1c7e-0f46-46fa-8a83-3c57e5f8bcb3', 398498.52, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('5e05c7a7-54ee-42ce-a210-f64c6767ab22', 407537.14, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('496e3583-7437-41fe-83a2-7a0a2768dab1', 221728.68, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c7131a74-635c-4b32-a4b9-bac22c2f754c', 220734.4, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('43ac4618-2659-440e-b46a-00e9501e1297', 228895.34, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('c04218a3-aec6-4c9e-b414-7c1a064d33c8', 234626.76, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('9eacc82a-9827-49ed-9967-700edfd2769b', 983161.73, 'ARS', '2026-09-03', 'Favicur', '2e39d191-81a5-4e36-85ad-79d72ac03c51', 'Lista Favicur - excepciones Grupo COES 03/09/2026 (vigente desde 29/07)'),
  ('b6e51a99-7a2f-467a-9924-0e87331dc820', 37042, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005534 04/09/2026'),
  ('7a8d4f40-a858-4ce0-86be-59182568b110', 39930, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005536 04/09/2026'),
  ('49ab5b57-27e0-4c64-a84c-36fb6d2badfe', 54446, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005536 04/09/2026'),
  ('0a984cbe-1e1d-4ed8-a302-66de81b37540', 391324, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005536 04/09/2026'),
  ('c5a9d7d7-1f07-484d-931b-21c72c288d98', 5822, 'ARS', '2026-09-04', 'Flojumar', '042b959b-4354-4173-91ce-6fe8be953d0b', 'Presupuesto Flojumar 0001-00005536 04/09/2026');

-- ─── Copia en la ficha del material ─────────────────────────────────────────
update public.panol_materiales
   set precio_unitario = 33600,
       moneda = 'ARS'
 where id = '09780a31-1f34-4dd1-8f8d-d452e8980a86';  -- CAJA PORTA BATERIA 431X257X256
update public.panol_materiales
   set precio_unitario = 97000,
       moneda = 'ARS'
 where id = '5698170e-a230-4c71-a893-c1e61414636f';  -- Canilla OSCULATI frío calor cromada
update public.panol_materiales
   set precio_unitario = 106000,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '646baa4a-525b-4da8-a656-208127bae392';  -- TAPA TANQUE ATTWOOD C/VENTEO WTR RECT
update public.panol_materiales
   set precio_unitario = 46400,
       moneda = 'ARS'
 where id = 'c2fd0c04-0fee-4352-8bab-cb4bd7257592';  -- Tapa de tanque combustible
update public.panol_materiales
   set precio_unitario = 9400,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '8cc56e95-c4d5-44df-987c-8de36bccf134';  -- Rejilla obturable 4-3/4"
update public.panol_materiales
   set precio_unitario = 8410,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '8803ceee-6654-42d5-a057-41cc3ba79260';  -- CALEFACTOR AUTOTERM ADAPT P/REJILLA D60 NEGRA
update public.panol_materiales
   set precio_unitario = 22100,
       moneda = 'ARS'
 where id = '6de143f9-b084-47eb-8f81-1def78ec6303';  -- Rejillas obturables plástico negro 60mm
update public.panol_materiales
   set precio_unitario = 15200,
       moneda = 'ARS'
 where id = '479a4a81-0e4e-4a62-a195-c9a9f7758335';  -- Rejillas orientables negro 60mm
update public.panol_materiales
   set precio_unitario = 132000,
       moneda = 'ARS'
 where id = 'f96b4dfd-286b-4017-9aee-ec80ab83e775';  -- Boton P/Cubierta (UP/DOWN) Inox Negro
update public.panol_materiales
   set precio_unitario = 132000,
       moneda = 'ARS'
 where id = '1c716ca4-05e1-4bf5-953f-562966eae5ef';  -- Boton P/Cubierta (Up/Down) Inox
update public.panol_materiales
   set precio_unitario = 73700,
       moneda = 'ARS'
 where id = 'd41e6b99-e9b8-4afb-a577-322d9fe27489';  -- Giratorio gusano cadena 6-8mm
update public.panol_materiales
   set precio_unitario = 64000,
       moneda = 'ARS'
 where id = 'f61d2ca2-c720-46b2-87a8-4693652d8d7c';  -- Corte Termico 100 amp Lofrans
update public.panol_materiales
   set precio_unitario = 21500,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '60cc69f1-f661-4b3c-972d-58ffe8b1a26e';  -- Rejilla - Bronce - Perko 330DP2CHR (3 1/4") Cromada
update public.panol_materiales
   set precio_unitario = 8110,
       moneda = 'ARS'
 where id = '4edb6464-7328-492f-85a9-00a18528f1ed';  -- Bisagra grande perno arriba
update public.panol_materiales
   set precio_unitario = 8900,
       moneda = 'ARS'
 where id = 'd19ad301-d473-4c5a-bc37-2444eacab11f';  -- Bisagra  Inox 30x80mm 6 Tornillos
update public.panol_materiales
   set precio_unitario = 3510,
       moneda = 'ARS'
 where id = '0a40222c-882b-4be8-bda5-9553b71452aa';  -- Punto fijo 6mm 4 agujeros
update public.panol_materiales
   set precio_unitario = 3510,
       moneda = 'ARS'
 where id = '3cb02ccc-16d0-4ead-858c-63b252fb96c8';  -- CANCAMO RECTANGULAR 4 TORNILLOS B10155
update public.panol_materiales
   set precio_unitario = 2280,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'fa7f1942-6ccf-40fb-aeca-a7e3849002f8';  -- Grillete inoxidable largo - D06mm (1/4") G20039
update public.panol_materiales
   set precio_unitario = 3620,
       moneda = 'ARS'
 where id = '98def276-146e-405c-b5b0-2e6db713d9b1';  -- Grillete omega 8mm
update public.panol_materiales
   set precio_unitario = 3620,
       moneda = 'ARS'
 where id = 'c30fcfdc-acbc-4cc0-9d37-f37a2bed9998';  -- Grillete inoxidable largo - D08mm (5/16") G20052
update public.panol_materiales
   set precio_unitario = 9510,
       moneda = 'ARS'
 where id = 'e45a2ce5-1ef2-4f7b-840a-d099514de332';  -- Levantapiso Embutir Redondo D=55mm Cromado
update public.panol_materiales
   set precio_unitario = 14600,
       moneda = 'ARS'
 where id = 'a7f1c0a7-30ef-44d3-ad3a-fb31dbe096fa';  -- Cierre Traba Ventana Corrediza 75mm
update public.panol_materiales
   set precio_unitario = 929,
       moneda = 'ARS'
 where id = '39747ed4-88a4-409c-9f3c-30331412ba0a';  -- Omega Inoxidable Inox Barra D05mm
update public.panol_materiales
   set precio_unitario = 4470,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '15434e19-20ec-4c5f-a327-7e494dc79e42';  -- ACCESORIO DE FIJACIÓN EN L PARA RESORTE HIDRAULICO R05472
update public.panol_materiales
   set precio_unitario = 4250,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'd88c8a80-63e4-4550-b353-03df7cc4cd00';  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO R05627
update public.panol_materiales
   set precio_unitario = 4250,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '52e6bb06-f368-4158-9ca1-48f814462945';  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO R05627
update public.panol_materiales
   set precio_unitario = 3420,
       moneda = 'ARS'
 where id = '5d9cc299-25f7-42ff-8735-53dcc5cbb0fa';  -- Sapito Inox (15x55x50x0.6mm)
update public.panol_materiales
   set precio_unitario = 60400,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'd395a4e8-4948-4029-adc8-552cd0130509';  -- Cierre - Perko - Perko 932DP2 C/U
update public.panol_materiales
   set precio_unitario = 2000,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'f2087e91-2574-49ee-9a81-f7dcb25b4aea';  -- CABO RETORCIDO BLANCO 12MM
update public.panol_materiales
   set precio_unitario = 18300,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '35ee0342-65e2-4297-afd6-3d18878d8b29';  -- Cabo Bola - Puño de mono 10 mm
update public.panol_materiales
   set precio_unitario = 1650,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'ee393478-3027-42ea-8600-2ee5bcc94262';  -- ESLABON UNION FIVE GALVANIZADO D=06mm 5-O
update public.panol_materiales
   set precio_unitario = 122000,
       moneda = 'ARS'
 where id = '985db2c6-6d36-472c-a504-63a10ac312a7';  -- AISLANTE COMPOSITE CHICA 122x61x3 PLACA ANTI-RUIDO
update public.panol_materiales
   set precio_unitario = 141000,
       moneda = 'ARS'
 where id = '66668366-425c-4ed9-b3d2-31a7fa122a3c';  -- Ancla Delta 16kg galvanizada
update public.panol_materiales
   set precio_unitario = 4930,
       moneda = 'ARS'
 where id = '15b642f0-2b8f-486e-9b8b-0eee0657ed50';  -- Cadena 6mm calibrada galvanizada
update public.panol_materiales
   set precio_unitario = 46500,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'fc71f623-2fec-42ab-8cc7-0e2f1cc0feed';  -- DEFENSA INFLABLE MA BLANCA 21 X 62 CM
update public.panol_materiales
   set precio_unitario = 5320,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = 'd775eb6d-2f27-4684-a22f-fd91fa386a99';  -- CABO DACRON FIVE OC SOLID BLACK 16MM
update public.panol_materiales
   set precio_unitario = 178000,
       moneda = 'ARS'
 where id = '53213c0f-9f0a-4f64-beca-64d595e9fd99';  -- ESCALERA INOX S/PLAT 3ESC DESLI 5O
update public.panol_materiales
   set precio_unitario = 95600,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '8e07494d-5f09-491e-8449-c59527d3e1bf';  -- Tapa estanco plastica - 60.5 x 35.0
update public.panol_materiales
   set precio_unitario = 53700,
       moneda = 'ARS'
 where id = 'e3fc2701-32b9-4ea5-beda-a68210c83bbd';  -- TAPA ESTANCO PLASTI 27.0x37.5cm CON LLAVE
update public.panol_materiales
   set precio_unitario = 1220000,
       moneda = 'ARS'
 where id = 'a107da59-c4cd-4b4c-8244-badc9a9d4fb7';  -- TERMOTANQUE KUUMA 06 GALONES 240V
update public.panol_materiales
   set precio_unitario = 118000,
       moneda = 'ARS'
 where id = '65349c90-9beb-482c-9085-ace8b9de4991';  -- KIT DUCHADOR NR 120x210x65mm
update public.panol_materiales
   set precio_unitario = 5230,
       moneda = 'ARS'
 where id = 'a001cf4b-9629-48ed-a6ac-3ebcc09d6aa7';  -- Rejillas Plastico Seaflo D76x92 Blanca
update public.panol_materiales
   set precio_unitario = 10500,
       moneda = 'ARS'
 where id = 'f4a56af4-e018-411a-a9f1-1dee3f6db079';  -- Posavasos inox
update public.panol_materiales
   set precio_unitario = 14800,
       moneda = 'ARS'
 where id = '7e7171d2-dc44-40dd-bacf-49a563451eee';  -- VALVULA ANTIRETORNO 3/4 A 1``
update public.panol_materiales
   set precio_unitario = 116000,
       moneda = 'ARS'
 where id = '09331295-6def-4f39-9227-a7a528c3f7f9';  -- LUZ BANDA ATTWOOD INOX C/LEDS
update public.panol_materiales
   set precio_unitario = 2440,
       moneda = 'ARS'
 where id = 'bb25f442-7a22-44e7-9531-8676157df05a';  -- Sapito Inox (12x44x40x0.6mm)
update public.panol_materiales
   set precio_unitario = 41900,
       moneda = 'ARS',
       proveedor = 'Baron',
       proveedor_id = '6794d0d7-fa22-4be5-87f9-e1f36b94b07a'
 where id = '65a75fd0-cd90-4f76-9b2c-000d45142aec';  -- Levantapiso redondo con traba
update public.panol_materiales
   set precio_unitario = 22600,
       moneda = 'ARS'
 where id = '7ffb7afa-16e4-4259-8311-5592818755ec';  -- LUZ FONDEO BASE PLANA LED
update public.panol_materiales
   set precio_unitario = 78400,
       moneda = 'ARS'
 where id = '993fa5a3-cadb-411f-8a5f-d7dd04f81133';  -- BOCINA ELECT INOX SIMPLE 5-O 405
update public.panol_materiales
   set precio_unitario = 7920,
       moneda = 'ARS'
 where id = '81399403-44f8-4c56-8840-aef8d2a82b59';  -- ENCHUFE 5-O ENCENDEDOR C/TAPA
update public.panol_materiales
   set precio_unitario = 34300,
       moneda = 'ARS'
 where id = '97797237-c9b1-45f9-8645-a8a998f21da7';  -- LUZ POPA C/LED INOX
update public.panol_materiales
   set precio_unitario = 34300,
       moneda = 'ARS'
 where id = '33cd96e4-def4-47e3-92ea-960d3404258e';  -- Levantapisos exterior
update public.panol_materiales
   set precio_unitario = 4440,
       moneda = 'ARS'
 where id = '869e57c0-b1b2-49b9-85bc-d90a5822cdc8';  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO · R05899 Fijacion Angulo
update public.panol_materiales
   set precio_unitario = 4210,
       moneda = 'ARS'
 where id = '80173bf8-c000-4ec5-930f-48feeca0e9ef';  -- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO · R05788 Fijacion Plano
update public.panol_materiales
   set precio_unitario = 5150,
       moneda = 'ARS'
 where id = 'bc5d7304-e8b4-46af-b558-4ff39d0cea03';  -- Bisagra Inox 48X30mm PERNO ARRIBA 6 Tornillos
update public.panol_materiales
   set precio_unitario = 13900,
       moneda = 'ARS'
 where id = '2972dabe-5a20-4477-a249-8856b7f3c77b';  -- Conector ANTENA Union Corta (YC1102)
update public.panol_materiales
   set precio_unitario = 4460,
       moneda = 'ARS'
 where id = 'b2ace13f-e5a3-458b-a1c0-417cfb3ba839';  -- CANCAMO 80X50MM 4 TORNILLOS B10121
update public.panol_materiales
   set precio_unitario = 7390,
       moneda = 'ARS'
 where id = '49b5c301-4638-45ac-8f90-3dc5a3d2496a';  -- Bisagra Inox 70X38.5mm Perno abajo 4 Tornillos
update public.panol_materiales
   set precio_unitario = 4650,
       moneda = 'ARS'
 where id = '1a30fa8d-5e98-4b44-a368-34462ee7d9e8';  -- Conector Antena Macho P/VHF P/RG58 (YC101)
update public.panol_materiales
   set precio_unitario = 138621.25,
       moneda = 'ARS'
 where id = '9fbe52d7-8d38-4efd-8ae3-cc32ad619c95';  -- VNA LAT DER ESTRIBOR K52 62501
update public.panol_materiales
   set precio_unitario = 138621.25,
       moneda = 'ARS'
 where id = '9ec7a4b1-c2ce-45bc-80af-356c1feb46d3';  -- VNA LAT IZQ BABOR K52 62502
update public.panol_materiales
   set precio_unitario = 33385.29,
       moneda = 'ARS'
 where id = '8504ca29-017e-400a-9020-621c4082e882';  -- VNA LAT DER ESTRIBOR HUNTER 60728
update public.panol_materiales
   set precio_unitario = 29995.82,
       moneda = 'ARS'
 where id = '6b098d9a-6614-4da8-84e1-b8400ecac3e8';  -- VNA LAT IZQ HUNTER 60729
update public.panol_materiales
   set precio_unitario = 59341.61,
       moneda = 'ARS'
 where id = 'ff2604f7-8fc1-4d77-99d2-91f253c149ed';  -- VNA LAT DER HUNTER 60730
update public.panol_materiales
   set precio_unitario = 63058.82,
       moneda = 'ARS'
 where id = 'a8083939-4042-4c85-8184-3a0332e73a80';  -- VNA LAT IZQ HUNTER 60731
update public.panol_materiales
   set precio_unitario = 28340.69,
       moneda = 'ARS'
 where id = 'c8f4d112-d431-4277-bf01-f59aba81c7bc';  -- VNA LAT DER ESTRIBOR HUNTER 60732
update public.panol_materiales
   set precio_unitario = 31691.92,
       moneda = 'ARS'
 where id = '078555e6-d92c-4c21-90c0-106fa02eacc3';  -- VNA LAT IZQ BABOR HUNTER 60733
update public.panol_materiales
   set precio_unitario = 26677.37,
       moneda = 'ARS'
 where id = '2782b5b8-11bc-409c-9673-1a8e0274d65f';  -- VNA LAT DER EST HUNTER 60734
update public.panol_materiales
   set precio_unitario = 26677.37,
       moneda = 'ARS'
 where id = '8d9aa2c7-5ef5-4d98-89e4-f11a11b74f97';  -- VNA LAT IZQ BB HUNTER 60735
update public.panol_materiales
   set precio_unitario = 857149.51,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'df184234-6b20-4ad3-bc72-0f89f8bff6e9';  -- PARABRISAS IZQUIERDO K43 60771
update public.panol_materiales
   set precio_unitario = 857149.51,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = '15072772-c1e3-422c-b302-977b1dd0dc87';  -- PARABRISAS DERECHO K43 60772
update public.panol_materiales
   set precio_unitario = 250325.83,
       moneda = 'ARS'
 where id = 'd462c0f8-1311-49ed-9230-7023c87a9a27';  -- VNA LAT ESTRIBOR CURVO K52 63002
update public.panol_materiales
   set precio_unitario = 249196.64,
       moneda = 'ARS'
 where id = '49357d73-83c1-4a36-93c9-088e0d9c5616';  -- VNA LAT BABOR CURVO K52 63003
update public.panol_materiales
   set precio_unitario = 777121.35,
       moneda = 'ARS'
 where id = '2ee9fc7b-19eb-4d9f-b047-b264e2f95b21';  -- PARABRISAS HARD TOP K52 63006
update public.panol_materiales
   set precio_unitario = 140691.78,
       moneda = 'ARS'
 where id = 'f3ca32da-db5e-4b69-9860-4786596cac22';  -- VNA LAT IZQ K37
update public.panol_materiales
   set precio_unitario = 140691.78,
       moneda = 'ARS'
 where id = '4ec399c3-dca9-4689-bfff-64c45fcb58c6';  -- VNA LAT DERECHA K37 63011
update public.panol_materiales
   set precio_unitario = 838225.74,
       moneda = 'ARS'
 where id = 'a6067408-6292-4eb8-a9cb-319c052aefb6';  -- VNA LAT FIJA IZQ 63054
update public.panol_materiales
   set precio_unitario = 838225.74,
       moneda = 'ARS'
 where id = 'c5d41943-78d7-4812-9852-ad04bd96c014';  -- VNA LAT LAM FIJA IZQUIERDA K55 63055
update public.panol_materiales
   set precio_unitario = 74176.32,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = '1258cdb1-c87d-45c6-9d57-402adff47c83';  -- VENTANA LATERAL FIJA K42 60741
update public.panol_materiales
   set precio_unitario = 127938.01,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'a8137fb3-d8c6-4ea0-9bc2-77d6478d7d42';  -- VENTANA LATERAL FIJA K42 60742
update public.panol_materiales
   set precio_unitario = 92729.62,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'a1e3404a-3b28-4cee-a993-99685a34a056';  -- VENTANA LATERAL FIJA K42 60743
update public.panol_materiales
   set precio_unitario = 145042.39,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'c7271d6c-5b91-4479-b84f-3eab09aed429';  -- VENTANA LATERAL FIJA K42 60744
update public.panol_materiales
   set precio_unitario = 309813.87,
       moneda = 'ARS'
 where id = 'b2003e08-f3c0-4ab4-821f-5ac301e9c2ad';  -- VNA LAT IZQ BABOR C/VANO K52 62503
update public.panol_materiales
   set precio_unitario = 309813.87,
       moneda = 'ARS'
 where id = 'ad735cad-720d-4b49-a53c-4682cba07d08';  -- VNA LAT DER ESTRIBOR C/VANO K52 62504
update public.panol_materiales
   set precio_unitario = 273918.58,
       moneda = 'ARS'
 where id = '12fcd91e-3673-4f3a-b02d-dc3d20200983';  -- VNA LAT IZQ BB C/VANO K52 62505
update public.panol_materiales
   set precio_unitario = 239371.15,
       moneda = 'ARS'
 where id = 'a6bbdfaa-6edf-4253-a10e-afa1d7510100';  -- VNA LAT EST C/VANO K52 62506
update public.panol_materiales
   set precio_unitario = 206463.83,
       moneda = 'ARS'
 where id = '91e284a8-dcef-4b0e-a53b-e57a7e7109e7';  -- VENTANA LATERAL IZQ BABOR K37 62538
update public.panol_materiales
   set precio_unitario = 206463.83,
       moneda = 'ARS'
 where id = '2df2dcf2-15c2-429e-8adf-7395f08eca4d';  -- VNA LATERAL DER K37 62539
update public.panol_materiales
   set precio_unitario = 146846.37,
       moneda = 'ARS'
 where id = 'e6d9e9ab-ce7f-4ce9-89c2-c5ccbb3120e2';  -- VNA LAT DER K37 62540
update public.panol_materiales
   set precio_unitario = 146846.37,
       moneda = 'ARS'
 where id = '3d5a21df-c394-476e-9fcf-44767cc7251a';  -- VENTANA LAT DER ESTRIBOR K37 62541
update public.panol_materiales
   set precio_unitario = 162952.48,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'f02fa258-e374-4b31-8351-72b9d2708e51';  -- VENTANA LAT IZQ BABOR K37 62542
update public.panol_materiales
   set precio_unitario = 162952.48,
       moneda = 'ARS',
       proveedor = 'Favicur',
       proveedor_id = '2e39d191-81a5-4e36-85ad-79d72ac03c51'
 where id = 'c41bae29-d525-4310-838c-5ef2428695f8';  -- VNA LAT IZQUIERDA BABOR K37 62543
update public.panol_materiales
   set precio_unitario = 272592.56,
       moneda = 'ARS'
 where id = 'd04ec5de-25b7-4c1a-8f4f-4edcb9ae31d3';  -- VNA LAT DERECHA SOFT TOP CARROZA K52 62648
update public.panol_materiales
   set precio_unitario = 271554.69,
       moneda = 'ARS'
 where id = '0b85745c-29ea-40cf-a264-00140248678a';  -- VNA LAT IZQUIERDA SOFT TOP CARROZA K52 62649
update public.panol_materiales
   set precio_unitario = 135278.21,
       moneda = 'ARS'
 where id = 'dadc554d-be90-49ee-a763-b20462d2a0bd';  -- VNA LAT IZQ POPA SOFT TOP K52 62650
update public.panol_materiales
   set precio_unitario = 138207.47,
       moneda = 'ARS'
 where id = 'c8e31913-04a8-4802-b9ba-d04f10cc5724';  -- VNA LAT IZQ POPA SOFT TOP CARROZA K52 62651
update public.panol_materiales
   set precio_unitario = 398498.52,
       moneda = 'ARS'
 where id = '145f1c7e-0f46-46fa-8a83-3c57e5f8bcb3';  -- VNA LAT DER C/VANO K55 62750
update public.panol_materiales
   set precio_unitario = 407537.14,
       moneda = 'ARS'
 where id = '5e05c7a7-54ee-42ce-a210-f64c6767ab22';  -- VNA LAT IZQ K55
update public.panol_materiales
   set precio_unitario = 221728.68,
       moneda = 'ARS'
 where id = '496e3583-7437-41fe-83a2-7a0a2768dab1';  -- VNA LAT DER C/VANO K55 62752
update public.panol_materiales
   set precio_unitario = 220734.4,
       moneda = 'ARS'
 where id = 'c7131a74-635c-4b32-a4b9-bac22c2f754c';  -- VNA LAT IZQ C/VANO 62753
update public.panol_materiales
   set precio_unitario = 228895.34,
       moneda = 'ARS'
 where id = '43ac4618-2659-440e-b46a-00e9501e1297';  -- VNA LAT DER K55 62754
update public.panol_materiales
   set precio_unitario = 234626.76,
       moneda = 'ARS'
 where id = 'c04218a3-aec6-4c9e-b414-7c1a064d33c8';  -- VNA LAT IZQ K55 62755
update public.panol_materiales
   set precio_unitario = 983161.73,
       moneda = 'ARS'
 where id = '9eacc82a-9827-49ed-9967-700edfd2769b';  -- PARABRISAS LAMINADO K52 SOFT TOP
update public.panol_materiales
   set precio_unitario = 37042,
       moneda = 'ARS'
 where id = 'b6e51a99-7a2f-467a-9924-0e87331dc820';  -- Cinta aluminio reforzada para aislantes
update public.panol_materiales
   set precio_unitario = 39930,
       moneda = 'ARS'
 where id = '7a8d4f40-a858-4ce0-86be-59182568b110';  -- Luz de lectura larga
update public.panol_materiales
   set precio_unitario = 54446,
       moneda = 'ARS'
 where id = '49ab5b57-27e0-4c64-a84c-36fb6d2badfe';  -- Luz de lectura mediana
update public.panol_materiales
   set precio_unitario = 391324,
       moneda = 'ARS',
       proveedor = 'Flojumar',
       proveedor_id = '042b959b-4354-4173-91ce-6fe8be953d0b'
 where id = '0a984cbe-1e1d-4ed8-a302-66de81b37540';  -- Luz de proa blanca · Hella Marine
update public.panol_materiales
   set precio_unitario = 5822,
       moneda = 'ARS'
 where id = 'c5a9d7d7-1f07-484d-931b-21c72c288d98';  -- ZOCALO PARA PULSADORDE CONSOLA

commit;
