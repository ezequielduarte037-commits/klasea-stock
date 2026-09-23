-- Precios de Famiq para el K52.
--
-- Dos confirmaciones de pedido del proyecto 52-26, en dólares y SIN IVA (Famiq
-- lo aclara: "los precios no incluyen IVA"):
--   · 2646267 del 08/09/2026: barras, caños, curvas y las placas de 230x350.
--   · 2651237 del 22/09/2026: cortes bajo plano (palas de timón y patas de gallo).
--
-- Son los materiales de Famiq que habían quedado "a cotizar". Además:
--   · El caño de 127 x 2 mm entra a la matriz del K52 (6 m, lo que se pidió
--     para el 52-26): el K52 tenía las 9 curvas de 127 del escape pero no el
--     caño recto. Es el mismo material que ya usan el K37 y el K55.
--   · De la migración 20260923110000, que todavía no se aplicó, se sacó el
--     precio de la placa de 230x350 que salía de listas de otras obras: tenía
--     fecha de hoy y le iba a ganar a este.
--
-- Para revisar: las palas de timón que cortó Famiq son de 6,35 mm y la matriz
-- dice chapa de 1/2"; la curva de 127 viene en 3 mm y la matriz dice 2 mm.

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, proveedor_id, fuente) values
  ('b28d47a0-4392-4189-a613-78016cd49d1c', 537.71, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): BARRA REDONDA (A-276) 316L 63,5 mm, 2 tiras de 3 m = 152,01 kg a USD 7,075/kg (1.075,42 las dos) · sin IVA'),  -- Barra 2 1/2" inox 316 L=3000mm
  ('a7db7f2c-e0ff-4382-9749-206f9cbce745', 103.25, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): BARRA REDONDA (A-276) 316L 50,8 mm, 2 tiras de 0,9 m = 29,19 kg a USD 7,075/kg (206,50 las dos) · sin IVA'),  -- Barra 2" inox 316 L=900mm
  ('ba94a996-06d8-4f10-9826-de313b84e6b9', 47.675, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): TUBO REDONDO CON COSTURA MATE (A-554) 316L 76,2 x 3,0 mm, por metro (pidieron un recorte de 1,57 m) · sin IVA'),  -- Caño 3" x 3mm inox 316
  ('cd5c6ece-a243-4688-9a28-cd034e1621c5', 19.58, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): TUBO REDONDO CON COSTURA MATE (A-554) 316L 31,7 x 3,0 mm, por metro (pidieron una tira de 3 m) · sin IVA'),  -- Caño 32mm x 3mm inox 316
  ('db5c2f6c-cc63-4afe-9362-c1ab4e0fda1b', 68.248, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): CURVA 90° PARA SOLDAR MATE 316L 127,0 x 3,0 mm (9 a 68,248). Famiq la da en 3 mm de espesor; la matriz dice 2 mm · sin IVA'),  -- Curva para soldar 90° 127x2mm inox 316
  ('e622a42d-03f6-47b8-af8b-ffcdce2df700', 91.05, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): RECT 316L 12,7 x 230 x 350 mm (2 a 91,05) · sin IVA'),  -- Corte 230x350mm chapa 1/2" 316 inox.
  ('3c73ea17-fec8-46c4-8151-4c58d6d0c8a7', 54.135, 'USD', '2026-09-08', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2646267 del 08/09/2026 (proyecto 52-26): TUBO REDONDO CON COSTURA MATE (A-554) 316L 127,0 x 2,0 mm, por metro (una tira de 6 m) · sin IVA'),  -- Caño 127 x 2mm inox 316 S/costura
  ('c7046ec3-80de-43a6-9311-86d2c78559c8', 72, 'USD', '2026-09-22', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2651237 del 22/09/2026 (proyecto 52-26): Corte bajo plano PATA DE GALLO K55/K52/K43 6,35 mm 316 (4 a 72) · sin IVA'),  -- Corte chapa 1/4" pata de gallo K55/K52/K43
  ('2b6d9fb0-4c03-47e7-b312-a27947f2a096', 125, 'USD', '2026-09-22', 'Famiq', '0d87c851-0a3f-4828-b17c-d7486ba41f7a', 'Confirmación de pedido Famiq 2651237 del 22/09/2026 (proyecto 52-26): Corte bajo plano PALA DE TIMÓN 6,35 mm 316 (2 a 125). Famiq la corta en 6,35 mm (1/4"); la matriz dice chapa de 1/2": confirmar el espesor · sin IVA');  -- Chapa de 1/2" según plano de timón K52

-- El caño recto del escape de 5", que faltaba en la matriz del K52.
insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
select '3c73ea17-fec8-46c4-8151-4c58d6d0c8a7', '52', 6, 'standard'   -- Caño 127 x 2mm inox 316 S/costura
 where not exists (
   select 1 from public.panol_material_modelo actual
    where actual.material_id = '3c73ea17-fec8-46c4-8151-4c58d6d0c8a7'
      and actual.modelo = '52'
      and coalesce(actual.variante, 'standard') = 'standard'
 );

commit;
