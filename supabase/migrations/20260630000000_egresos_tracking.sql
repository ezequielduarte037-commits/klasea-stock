-- Migration for Egresos Tracking (retirado_por, sector_destino)

-- 1. Agregar las nuevas columnas a la tabla de snapshot
ALTER TABLE public.panol_obra_materiales_snapshot
  ADD COLUMN IF NOT EXISTS retirado_por text,
  ADD COLUMN IF NOT EXISTS sector_destino text;

-- 2. Reemplazar la funcion de egreso para que acepte y guarde los nuevos campos
CREATE OR REPLACE FUNCTION public.panol_egresar_obra_materiales(
  p_snapshot_ids uuid[],
  p_nota text DEFAULT NULL,
  p_retirado_por text DEFAULT NULL,
  p_sector_destino text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int := 0;
  v_row record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_sector text := nullif(btrim(coalesce(p_sector_destino, '')), '');
BEGIN
  IF array_length(p_snapshot_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT
      s.id,
      s.estado AS old_estado,
      s.panol_envio_id,
      s.panol_envio_item_id,
      e.sede
    FROM public.panol_obra_materiales_snapshot s
    LEFT JOIN public.panol_envios e ON e.id = s.panol_envio_id
    WHERE s.id = ANY(p_snapshot_ids)
  LOOP
    IF NOT (
      public.is_panol_manager(v_uid)
      OR (v_row.sede IS NOT NULL AND public.can_receive_envio(v_row.sede, v_uid))
    ) THEN
      RAISE EXCEPTION 'Sin permiso para egresar uno o mas materiales';
    END IF;

    IF v_row.old_estado IN ('en_panol','recibido','parcial','problema') THEN
      UPDATE public.panol_obra_materiales_snapshot
         SET estado = 'egresado',
             egreso_at = now(),
             egreso_por = v_uid,
             egreso_nota = v_nota,
             retirado_por = v_retirado,
             sector_destino = v_sector,
             updated_at = now()
       WHERE id = v_row.id
         AND estado <> 'egresado';

      IF found THEN
        v_count := v_count + 1;

        IF v_row.panol_envio_id IS NOT NULL THEN
          INSERT INTO public.panol_envio_eventos(
            envio_id, item_id, tipo, estado_anterior, estado_nuevo, nota, actor_id
          )
          VALUES (
            v_row.panol_envio_id,
            v_row.panol_envio_item_id,
            'egreso_material',
            v_row.old_estado,
            'egresado',
            v_nota,
            v_uid
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.panol_egresar_obra_materiales(uuid[],text,text,text) TO authenticated;
