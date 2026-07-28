CREATE TABLE IF NOT EXISTS prod_muebles_ordenes (
  id uuid primary key default gen_random_uuid(),
  mueble_id uuid not null references prod_muebles(id) on delete cascade,
  unidad_id uuid references prod_unidades(id) on delete cascade,
  proveedor text not null default 'Oberti',
  estado_proceso text not null default 'Pendiente Materiales',
  tablones_enviados boolean not null default false,
  cantidad integer not null default 1,
  observaciones text,
  creado_el timestamptz default now(),
  actualizado_el timestamptz default now()
);

-- Copia de compatibilidad. El checklist histórico se conserva: producción y
-- recepción son procesos diferentes y no deben compartir estados.
DO $$
BEGIN
  IF to_regclass('public.prod_unidad_checklist') IS NOT NULL THEN
    INSERT INTO prod_muebles_ordenes (id, mueble_id, unidad_id, estado_proceso, observaciones, creado_el)
    SELECT
      id,
      mueble_id,
      unidad_id,
      CASE
        WHEN estado = 'No enviado' THEN 'Pendiente Materiales'
        WHEN estado = 'Parcial' THEN 'Producción'
        WHEN estado = 'Completo' THEN 'Terminado'
        WHEN estado = 'Rehacer' THEN 'Producción'
        ELSE 'Pendiente Materiales'
      END,
      obs,
      coalesce(recibido_at, now())
    FROM prod_unidad_checklist
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Activar RLS
ALTER TABLE prod_muebles_ordenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public prod_muebles_ordenes" ON prod_muebles_ordenes;
DROP POLICY IF EXISTS "Authenticated prod_muebles_ordenes" ON prod_muebles_ordenes;
CREATE POLICY "Authenticated prod_muebles_ordenes"
  ON prod_muebles_ordenes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
