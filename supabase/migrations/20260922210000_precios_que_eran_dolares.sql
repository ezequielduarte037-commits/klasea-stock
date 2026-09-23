-- Precios que estaban guardados en pesos y en realidad eran dólares.
--
-- Cuatro fichas heredadas tenían el número del proveedor pero la moneda
-- equivocada. Se notan porque son imposibles: un rompe-sifón de 1 1/2" no sale
-- 35 pesos, y un plafón Five Oceans con LED no sale 39. Son los precios en
-- dólares con los que cotizan Baron y Janored, guardados como si fueran pesos.
--
-- Mientras estuvieron así el costo del barco los contaba como cero -treinta y
-- cinco pesos en un total de treinta y cinco millones- y encima figuraban como
-- "con precio", que es peor: tapaban el faltante.
--
-- El valor no se toca, sólo la moneda. Ninguno tiene historial en
-- panol_precios, así que la corrección va sobre la ficha y este archivo es el
-- registro de por qué cambió.
--
-- El caño 32mm x 3mm inox 316 de Famiq ya estaba bien en dólares; lo reviso acá
-- porque en la primera pasada lo di por error y no lo era.

begin;

-- ─── 1. La moneda, que era lo único mal ─────────────────────────────────────
update public.panol_materiales
   set moneda = 'USD'
 where id in (
   '090a2a1d-771c-4f13-b54a-c46aa5b60d81',  -- Rompe-Sifon 38mm=1 1/2" · 35,80 · Baron · va en el K52
   '1a33e474-5040-44cd-8b52-0abac2f7ec83',  -- Solenoide zm 403 12v · 52,561 · Janored · va en el K52
   'ff4e9750-546c-4d67-8bc1-a988aef99674',  -- Rompe-Sifon 25mm=1" · 28,30 · Baron
   'd2b414a1-88fb-4841-b8db-abe642b57fed'   -- Plafón Five Oceans con LED · 39,80 · Baron · va en el K37
 )
   and coalesce(moneda, 'ARS') <> 'USD';

-- ─── 2. Los que tienen un peso de precio, que no es un precio ───────────────
-- Cuatro fichas quedaron con precio_unitario = 1. Un lavasecarropas no sale un
-- peso: alguien puso un número para salir del paso. Mientras esté cargado, el
-- material figura "con precio" y no aparece en la lista de lo que hay que
-- cotizar, así que es peor que no tener nada. Se vacía para que vuelva a
-- contarse como faltante.
--
-- Si preferís dejarlos, borrá este bloque: no afecta al resto de la migración.
update public.panol_materiales
   set precio_unitario = null
 where precio_unitario = 1
   and id in (
     '7f16c0f7-fcce-4a9f-8b6b-bc90601ff771',  -- Canilla de cocina - COLOR NEGRO
     'c044b9ef-6003-4d75-b4f6-a7e52de54a00',  -- Ancla DELTA 40kg INOX
     'b620fa49-879e-4dbc-8cad-e9c5b6a8e076',  -- Lavasecarropas LG Inverter Carga Frontal 9kg
     '4b8d73c5-45fc-435f-a1ed-01b56f8d08b4'   -- Electrovalvula 12v holding tank Matromarine
   );

commit;
