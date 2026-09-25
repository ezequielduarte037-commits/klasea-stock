-- K52: el escape del grupo es el de 2", no el de 3".
--
-- La 20260924190000 había pasado a estándar el silenciador Vernalift de 3" y
-- el separador de agua y gases de 3" del 52-23. Esos van con el grupo de
-- 17,5 kVA (52-23, 55-1 y 55-2). El K52 estándar lleva el grupo de 9 kVA, y
-- para ese Trimer cotizó el silenciador y el separador de 2" (presupuesto
-- 291225-02, ref. K52-26), que siguen en la matriz. Lo confirmó Ezequiel el
-- 24/09/2026.

begin;

delete from public.panol_material_modelo
 where modelo = '52'
   and material_id in (
     '0754784c-7c6d-4dee-b36f-98fd8b6d9fe9',   -- Silenciador CENTEK Vernalift 3" 150034w
     'd8fd6b1a-254a-4a42-be56-44efdeed7011'    -- Separador de gases 3" 1020301
   );

update public.panol_material_normalizaciones
   set decision = 'puntual',
       cantidad = null,
       motivo_no_estandar = 'otro',
       observacion_no_estandar = 'Va con el grupo de 17,5 kVA (52-23, 55-1, 55-2). El K52 estándar lleva el grupo de 9 kVA, con silenciador y separador de 2" (presupuesto Trimer 291225-02).',
       revisado_at = now()
 where modelo = '52'
   and material_id in ('0754784c-7c6d-4dee-b36f-98fd8b6d9fe9', 'd8fd6b1a-254a-4a42-be56-44efdeed7011');

commit;
