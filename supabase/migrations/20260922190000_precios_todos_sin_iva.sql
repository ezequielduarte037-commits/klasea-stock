-- Un solo criterio para todos los precios: SIN IVA.
--
-- El astillero es responsable inscripto, así que el IVA de lo que compra es
-- crédito fiscal y no costo. Un total de materiales con IVA adentro no se
-- puede comparar contra el margen sin hacer la cuenta cada vez.
--
-- El problema era que venían mezclados según cómo cotiza cada proveedor:
-- Baron y Flojumar presupuestan a consumidor final -el unitario ya trae el
-- 21%- y Electro 2001 a responsable inscripto -el unitario es neto y el IVA
-- va al pie-. Sumar los dos daba un número que no es ninguna de las dos cosas.
--
-- Acá se convierten los 81 renglones que estaban con IVA. Los de Electro 2001
-- ya estaban netos y no se tocan. La fuente de cada uno queda diciendo que se
-- convirtió y cuánto era el original, para poder rastrear el número hasta el
-- papel.
--
-- QUEDAN SIN DEFINIR, a propósito, tres grupos heredados que no sé cómo se
-- cargaron y prefiero no adivinar:
--   · la lista de Favicur (44 renglones): es lista mayorista a un cliente
--     inscripto, casi seguro neta, pero el papel no lo dice
--   · el presupuesto de Iriarte (33) y los que entraron con fuente
--     "presupuesto" (41)
--   · los de Parra, que están en dólares y se pagan al tipo de cambio del día
-- Si alguno de esos estaba con IVA, hay que dividirlo por 1,21 también.

begin;

-- ─── 1. Los renglones que estaban con IVA ───────────────────────────────────
update public.panol_precios
   set precio_unitario = round((precio_unitario / 1.21)::numeric, 2),
       fuente = fuente || ' · convertido a sin IVA (÷1,21; con IVA era ' ||
                to_char(precio_unitario, 'FM999G999G999D00') || ')'
 where moneda = 'ARS'
   and fuente not like '%sin IVA%'
   and (
     fuente like 'Presupuesto Baron 21/09/2026%'
     or fuente like 'Remito valorizado Baron 02/09/2026%'
     or fuente like 'Presupuesto Flojumar %'
   );

-- ─── 2. La copia de la ficha, al día con el historial ───────────────────────
-- panol_materiales.precio_unitario es una copia del último precio, y quedó
-- desfasada al cambiar el historial. Se recalcula desde la fila más nueva de
-- cada material, que es exactamente lo que lee la pantalla.
update public.panol_materiales material
   set precio_unitario = ultimo.precio_unitario,
       moneda = ultimo.moneda
  from (
    select distinct on (material_id)
           material_id, precio_unitario, moneda
      from public.panol_precios
     where precio_unitario is not null
     order by material_id, fecha desc nulls last, created_at desc
  ) ultimo
 where ultimo.material_id = material.id
   -- Sólo los materiales que tocó el paso 1: un precio de ficha puesto a mano
   -- que no coincide con el historial puede estar así a propósito.
   and material.id in (
     select material_id
       from public.panol_precios
      where fuente like '%convertido a sin IVA%'
   )
   and (material.precio_unitario is distinct from ultimo.precio_unitario
        or coalesce(material.moneda, 'ARS') is distinct from coalesce(ultimo.moneda, 'ARS'));

commit;
