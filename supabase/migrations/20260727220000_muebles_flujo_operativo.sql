-- Flujo operativo de muebles. Esta migración amplía los lotes sin tocar el
-- checklist histórico de recepción (prod_unidad_checklist).
CREATE TABLE IF NOT EXISTS enchapado_ots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo text NOT NULL,
  barco text NOT NULL,
  tipo_chapa text,
  fecha date,
  responsable text,
  estado text NOT NULL DEFAULT 'Pendiente',
  notas text,
  fecha_desmolde_est date,
  fecha_desmolde_real date,
  fecha_botada date,
  tablones_pedido boolean NOT NULL DEFAULT false,
  tablones_enviado boolean NOT NULL DEFAULT false,
  herrajes_pedido boolean NOT NULL DEFAULT false,
  herrajes_enviado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE enchapado_ots
  ADD COLUMN IF NOT EXISTS herrajes_pedido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS herrajes_enviado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS enchapado_ot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id uuid NOT NULL REFERENCES enchapado_ots(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  chapas_descripcion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prod_unidad_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id uuid NOT NULL REFERENCES prod_unidades(id) ON DELETE CASCADE,
  mueble_id uuid NOT NULL REFERENCES prod_muebles(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'No enviado',
  obs text,
  recibido_por text,
  recibido_at timestamptz,
  UNIQUE (unidad_id, mueble_id)
);

ALTER TABLE prod_unidad_checklist
  ADD COLUMN IF NOT EXISTS recibido_por text,
  ADD COLUMN IF NOT EXISTS recibido_at timestamptz;

-- Recupera el checklist si llegó a ejecutarse la primera versión de la
-- migración 130000, que lo reemplazaba por prod_muebles_ordenes.
INSERT INTO prod_unidad_checklist
  (id, unidad_id, mueble_id, estado, obs, recibido_at)
SELECT
  id,
  unidad_id,
  mueble_id,
  CASE estado_proceso
    WHEN 'Terminado' THEN 'Completo'
    WHEN 'Producción' THEN 'Parcial'
    ELSE 'No enviado'
  END,
  observaciones,
  CASE WHEN estado_proceso = 'Terminado' THEN actualizado_el ELSE NULL END
FROM prod_muebles_ordenes
WHERE unidad_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE prod_unidad_checklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated prod_unidad_checklist" ON prod_unidad_checklist;
CREATE POLICY "Authenticated prod_unidad_checklist"
  ON prod_unidad_checklist FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE prod_muebles_lotes
  ADD COLUMN IF NOT EXISTS tipo_destino text NOT NULL DEFAULT 'obra',
  ADD COLUMN IF NOT EXISTS nombre_lote text,
  ADD COLUMN IF NOT EXISTS cantidad_juegos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS material_base text,
  ADD COLUMN IF NOT EXISTS detalle_madera text,
  ADD COLUMN IF NOT EXISTS etapa text NOT NULL DEFAULT 'definicion',
  ADD COLUMN IF NOT EXISTS fecha_objetivo date,
  ADD COLUMN IF NOT EXISTS tablones_preparados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chapas_preparadas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medidas_adjuntas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enchapado_listo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flete_solicitado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enchapado_ot_id uuid REFERENCES enchapado_ots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS herrajes_pedido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS herrajes_enviado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepcion_estado text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE prod_muebles_lotes
SET tipo_destino = CASE WHEN unidad_id IS NULL THEN 'stock' ELSE 'obra' END
WHERE tipo_destino IS NULL
   OR (unidad_id IS NULL AND tipo_destino = 'obra');

UPDATE prod_muebles_lotes
SET etapa = CASE estado_proceso
  WHEN 'Pendiente Materiales' THEN 'compra_materiales'
  WHEN 'Preparación' THEN 'preparacion_banco'
  WHEN 'En Enchapadora' THEN 'enchapadora'
  WHEN 'Flete' THEN 'flete_oberti'
  WHEN 'Producción' THEN CASE WHEN proveedor = 'Morph' THEN 'fabricacion_morph' ELSE 'fabricacion_oberti' END
  WHEN 'Terminado' THEN 'recibido'
  WHEN 'Instalado' THEN 'recibido'
  ELSE COALESCE(NULLIF(etapa, ''), 'definicion')
END;

ALTER TABLE prod_muebles_lotes
  DROP CONSTRAINT IF EXISTS prod_muebles_lotes_tipo_destino_check;
ALTER TABLE prod_muebles_lotes
  ADD CONSTRAINT prod_muebles_lotes_tipo_destino_check
  CHECK (tipo_destino IN ('obra', 'stock'));

ALTER TABLE prod_muebles_lotes
  DROP CONSTRAINT IF EXISTS prod_muebles_lotes_proveedor_check;
ALTER TABLE prod_muebles_lotes
  ADD CONSTRAINT prod_muebles_lotes_proveedor_check
  CHECK (proveedor IN ('Oberti', 'Morph'));

ALTER TABLE prod_muebles_lotes
  DROP CONSTRAINT IF EXISTS prod_muebles_lotes_recepcion_estado_check;
ALTER TABLE prod_muebles_lotes
  ADD CONSTRAINT prod_muebles_lotes_recepcion_estado_check
  CHECK (recepcion_estado IN ('pendiente', 'parcial', 'completa'));

CREATE TABLE IF NOT EXISTS prod_muebles_lotes_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES prod_muebles_lotes(id) ON DELETE CASCADE,
  accion text NOT NULL,
  etapa_anterior text,
  etapa_nueva text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_el timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prod_muebles_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prod_muebles_lotes_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated prod_muebles_lotes select" ON prod_muebles_lotes;
CREATE POLICY "Authenticated prod_muebles_lotes select"
  ON prod_muebles_lotes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated prod_muebles_lotes write" ON prod_muebles_lotes;
CREATE POLICY "Authenticated prod_muebles_lotes write"
  ON prod_muebles_lotes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated prod_muebles_lotes_historial select" ON prod_muebles_lotes_historial;
CREATE POLICY "Authenticated prod_muebles_lotes_historial select"
  ON prod_muebles_lotes_historial FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated prod_muebles_lotes_historial insert" ON prod_muebles_lotes_historial;
CREATE POLICY "Authenticated prod_muebles_lotes_historial insert"
  ON prod_muebles_lotes_historial FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS prod_muebles_lotes_etapa_idx
  ON prod_muebles_lotes (etapa);
CREATE INDEX IF NOT EXISTS prod_muebles_lotes_destino_idx
  ON prod_muebles_lotes (tipo_destino, unidad_id);
CREATE UNIQUE INDEX IF NOT EXISTS prod_muebles_lotes_enchapado_ot_uidx
  ON prod_muebles_lotes (enchapado_ot_id)
  WHERE enchapado_ot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prod_muebles_lotes_historial_lote_idx
  ON prod_muebles_lotes_historial (lote_id, creado_el DESC);
