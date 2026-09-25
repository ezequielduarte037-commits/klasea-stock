-- Precios de Laminación y Maderas sin IVA, como todo el costo.
--
-- materiales_secundarios_precios guardaba varios precios con el IVA adentro
-- (incluye_iva = true): el presupuesto de Plaquimet para el K52-28 del 03/09,
-- los que informó Compras el 07/09 y la lista de maderas del 07/09. Costo de
-- obra los sumaba así y Costo del barco los va a sumar ahora, mientras el
-- resto del costo (matriz, conjuntos) va sin IVA desde la 20260922190000.
--
-- Se dividen por 1,21 y quedan marcados sin IVA. La nota de cada uno guarda
-- el valor original para poder rastrearlo.

begin;

update public.materiales_secundarios_precios
   set precio_base = round(precio_base / 1.21, 4),
       precio_unidad_matriz = round(precio_unidad_matriz / 1.21, 4),
       incluye_iva = false,
       notas = concat_ws(' · ', nullif(btrim(coalesce(notas, '')), ''),
                         'convertido a sin IVA (÷1,21; con IVA era ' || precio_unidad_matriz::text || ' por unidad de la matriz)')
 where incluye_iva is true;

commit;
