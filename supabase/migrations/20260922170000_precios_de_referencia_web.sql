-- Precios de referencia sacados de internet, para los productos de marca.
--
-- Son ocho artículos que no cotiza ningún proveedor del astillero porque se
-- compran en cualquier lado: la heladera, el microondas, el televisor, el
-- plotter, la VHF, la antena Starlink y el protector de batería. Sin un número
-- el costo del K52 los contaba como cero, que es peor que contarlos con un
-- precio de lista.
--
-- NO son cotizaciones. Van con proveedor "Referencia web" justamente para que
-- se lean distinto de un precio que pasó Baron o Flojumar: sirven para que el
-- total no salga corto, no para comprar. Cuando alguien cotice de verdad, el
-- precio nuevo entra con su fecha y pisa a éste solo.
--
-- TODO SIN IVA, que es el criterio de la base. Los precios de góndola
-- argentinos vienen con IVA incluido, así que van divididos por 1,21 y el
-- comentario de cada uno deja el precio de vidriera para poder rastrearlo. El
-- Victron es lista de Estados Unidos: ahí no hay IVA argentino que sacar.
--
-- Precios relevados el 22/09/2026. En pesos envejecen rápido.
--
-- Quedaron afuera a propósito:
--   · el inversor/cargador MultiPlus 12/2000/80: sólo encontré precio del
--     modelo de 230V, que no es el que lleva el barco
--   · el aire acondicionado FCF12 de Trimer: es un equipo náutico, y el precio
--     de un split hogareño de 12.000 BTU no tiene nada que ver
--   · la fabricadora de hielo: la ficha no dice marca y las dos de Flojumar
--     cuestan lo mismo, así que hay que definir cuál es antes de ponerle precio

begin;

insert into public.panol_precios (material_id, precio_unitario, moneda, fecha, proveedor, fuente) values
  ('a929c057-d5a3-4f5b-8a9d-f6203c2cfc77', 117768.60, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · Starlink Mini, minorista Argentina · góndola 142.500 con IVA · sin IVA · 22/09/2026'),
  ('dee3ab68-5c3a-4960-a46d-259a1402ce29', 6771073.55, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · garmin.com.ar lista · góndola 8.192.999 con IVA (con 10% off, 7.373.699) · sin IVA · 22/09/2026'),
  ('7e2141d2-d696-483c-ae70-6c57e5705d50', 955371.07, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · garmin.com.ar VHF 215 sin AIS · góndola 1.155.999 con IVA (con AIS, 1.575.999) · sin IVA · 22/09/2026'),
  ('77aab3f7-2ff9-4c2f-a0f4-8c71ac1da892', 1487602.48, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · retail Argentina · góndola 1.799.999 con IVA, rango 1,36M-1,94M según tienda · sin IVA · 22/09/2026'),
  ('668bd1df-ff77-4632-9045-9ed60811bfb2', 314048.76, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · retail Argentina · góndola 379.999 con IVA, rango 300k-402k según tienda · sin IVA · 22/09/2026'),
  ('2176cf72-d0c3-413f-ae8f-8785be0dab6a', 848330.58, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · BGH BRC330I1A 312L inverter no frost · góndola 1.026.480 con IVA · sin IVA · 22/09/2026'),
  ('a5ad1e8a-6083-4eac-b0a3-1039bf706548', 388429.75, 'ARS', '2026-09-22', 'Referencia web',
   'Referencia web · smart TV 43" gama media · góndola 470.000 con IVA, rango 400k-590k · la ficha no dice marca · sin IVA · 22/09/2026'),
  ('d39d6ed7-08ca-41e0-8b22-0277bb62c670', 105, 'USD', '2026-09-22', 'Referencia web',
   'Referencia web · Victron Smart BatteryProtect BPR122022000, lista USA (sin IVA argentino) · 22/09/2026');

commit;
