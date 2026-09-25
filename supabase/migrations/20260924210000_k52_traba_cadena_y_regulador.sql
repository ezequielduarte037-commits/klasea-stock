-- K52: una sola traba cadena y un solo regulador de presión.
--
-- Lo definió Ezequiel el 24/09/2026, después de que la 20260924190000 dejara
-- dos de cada uno en la matriz:
--   · Traba cadena: la del remito de Baron del 52-26 (TRABACADENA INOX STOPPER
--     80x70mm, T22057). Sale la "Traba cadena 10-12mm", que sólo tenía un
--     precio de referencia de la web.
--   · Regulador de presión: el Jabsco. Sale el Seaflo blanco, que en la bandeja
--     de estandarización vuelve a no estándar.
-- El ancla ya la resolvió él en la pantalla: queda la Delta de 32 kg.

begin;

delete from public.panol_material_modelo
 where modelo = '52'
   and material_id in (
     '84ec4e6f-e11e-4168-845a-e82a282bd757',   -- Traba cadena 10-12mm
     '8d181543-0791-4639-845b-faba3e724c79'    -- REGULADOR DE PRESION BLANCO SEAFLO
   );

update public.panol_material_normalizaciones
   set decision = 'puntual',
       cantidad = null,
       motivo_no_estandar = 'otro',
       observacion_no_estandar = 'El K52 lleva el regulador de presión Jabsco cromado.',
       revisado_at = now()
 where material_id = '8d181543-0791-4639-845b-faba3e724c79'
   and modelo = '52';

commit;
