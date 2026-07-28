-- Permite que la etapa final de muebles permanezca abierta mientras los
-- muebles llegan en entregas parciales.
ALTER TABLE prod_muebles_lotes
  ADD COLUMN IF NOT EXISTS recepcion_estado text NOT NULL DEFAULT 'pendiente';

ALTER TABLE prod_muebles_lotes
  DROP CONSTRAINT IF EXISTS prod_muebles_lotes_recepcion_estado_check;
ALTER TABLE prod_muebles_lotes
  ADD CONSTRAINT prod_muebles_lotes_recepcion_estado_check
  CHECK (recepcion_estado IN ('pendiente', 'parcial', 'completa'));

UPDATE prod_muebles_lotes
SET recepcion_estado = 'parcial'
WHERE etapa = 'recibido'
  AND recepcion_estado = 'pendiente';

UPDATE prod_muebles_lotes
SET estado_proceso = CASE etapa
  WHEN 'preparacion_banco' THEN 'Preparación de chapas y tablones'
  WHEN 'enchapadora' THEN 'En enchapadora'
  WHEN 'flete_oberti' THEN 'Listo para enviar a Oberti'
  ELSE estado_proceso
END
WHERE etapa IN ('preparacion_banco', 'enchapadora', 'flete_oberti');
