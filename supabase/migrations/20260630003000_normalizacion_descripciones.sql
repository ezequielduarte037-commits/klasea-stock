-- ============================================================================
-- NORMALIZACIÓN DE DESCRIPCIONES — panol_materiales
-- ============================================================================
-- Reglas:
--   1. Medidas se mantienen (son identidad del producto)
--   2. Marcas que diferencian producto se quedan en descripcion
--   3. Marcas genéricas van a alias
--   4. Formato consistente: oración, unidades normalizadas, sin códigos pegados
--   5. Solo UPDATE de descripcion/alias. NO merge ni delete.
--   6. Se marca revisado=true en filas tocadas.
-- ============================================================================

-- ============================================================================
-- PASO 1: PREVIEW — ver qué va a cambiar antes de aplicar
-- ============================================================================
-- Corré este SELECT primero. Mostrá el resultado para revisar.

SELECT
  id,
  descripcion AS descripcion_original,
  alias AS alias_original,
  proveedor,
  codigo,
  -- Descripción normalizada propuesta
  CASE
    -- Quitar códigos de proveedor pegados (Baron XXXXX, Trimer XXXXX)
    WHEN descripcion ~ '\s+[A-Z]\d{4,}'
      THEN REGEXP_REPLACE(descripcion, '\s+[A-Z]\d{4,}$', '')
    ELSE descripcion
  END AS descripcion_propuesta,
  -- Alias propuesto (marca genérica cuando aplica)
  CASE
    WHEN descripcion ILIKE '%no mas clavos%' THEN 'No Más Clavos'
    WHEN descripcion ILIKE '%whale%' THEN 'Whale'
    ELSE alias
  END AS alias_propuesto
FROM panol_materiales
WHERE activo = true
  AND descripcion IS NOT NULL
  AND (
    -- Filas con problemas detectables
    descripcion ~ '\s+[A-Z]\d{4,}'           -- código pegado al final
    OR descripcion ~ '^\s'                    -- espacio al inicio
    OR descripcion ~ '\s{2,}'                 -- espacios dobles
    OR descripcion ~ '\([0-9]+u\)'            -- cantidad entre paréntesis
    OR descripcion = UPPER(descripcion)       -- todo mayúsculas
    OR descripcion = LOWER(descripcion)       -- todo minúsculas
  )
ORDER BY descripcion;

-- ============================================================================
-- PASO 2: NORMALIZACIÓN — aplicar cambios
-- ============================================================================
-- Descomentá y ejecutá si el preview se ve bien.

/*
BEGIN;

-- ── 2.1 Quitar códigos de proveedor pegados al final de la descripción ──
-- Ej: "Bisagra chica perno arriba Baron B21688" → "Bisagra chica perno arriba"
--     "Giratorio gusano cadena Baron G08302" → "Giratorio gusano cadena"
UPDATE panol_materiales
SET
  descripcion = TRIM(REGEXP_REPLACE(descripcion, '\s+(Baron|Trimer|Sodimac|Yale|3M)\s+[A-Z0-9\-]+$', '', 'i')),
  revisado = true
WHERE descripcion ~ '\s+(Baron|Trimer|Sodimac|Yale|3M)\s+[A-Z0-9\-]+$'
  AND activo = true;

-- ── 2.2 Quitar cantidades entre paréntesis del final ──
-- Ej: "Bisagra chica perno arriba (6u)" → "Bisagra chica perno arriba"
-- La cantidad ya está en otra columna o se infiere del contexto.
UPDATE panol_materiales
SET
  descripcion = TRIM(REGEXP_REPLACE(descripcion, '\s*\(\s*[0-9]+\s*u\s*\)\s*$', '')),
  revisado = true
WHERE descripcion ~ '\s*\(\s*[0-9]+\s*u\s*\)\s*$'
  AND activo = true;

-- ── 2.3 Normalizar capitalización (oración) ──
-- Solo aplica a descripciones que están TODAS en mayúsculas o TODAS en minúsculas.
-- No toca las que ya tienen capitalización mixta correcta.
UPDATE panol_materiales
SET
  descripcion = INITCAP(LOWER(descripcion)),
  revisado = true
WHERE activo = true
  AND descripcion IS NOT NULL
  AND (
    descripcion = UPPER(descripcion)
    OR descripcion = LOWER(descripcion)
  );

-- ── 2.4 Corregir abreviaturas y unidades comunes ──
-- Después del INITCAP, algunas abreviaturas quedan mal. Las corregimos.
UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Mm ', 'mm '),
  revisado = true
WHERE descripcion LIKE '%Mm %' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Kg ', 'kg '),
  revisado = true
WHERE descripcion LIKE '%Kg %' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Mts', 'm'),
  revisado = true
WHERE descripcion LIKE '%Mts%' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Btu', 'BTU'),
  revisado = true
WHERE descripcion ILIKE '%btu%' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Usb', 'USB'),
  revisado = true
WHERE descripcion ILIKE '%usb%' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'V ', 'V '),
  revisado = true
WHERE descripcion ~ '\d+V ' AND activo = true;

UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'Inox', 'inox'),
  revisado = true
WHERE descripcion LIKE '%Inox%' AND activo = true;

-- ── 2.5 Limpiar espacios dobles y bordes ──
UPDATE panol_materiales
SET
  descripcion = TRIM(REGEXP_REPLACE(descripcion, '\s{2,}', ' ', 'g')),
  revisado = true
WHERE descripcion ~ '\s{2,}'
  AND activo = true;

-- ── 2.6 Mover marcas genéricas a alias ──
-- Solo cuando la marca NO es un diferenciador de producto.
-- Ej: "Adhesivo No Más Clavos" → descripcion="Adhesivo", alias="No Más Clavos"

UPDATE panol_materiales
SET
  alias = COALESCE(NULLIF(alias, ''), '') || CASE WHEN alias IS NOT NULL AND alias != '' THEN ' | ' ELSE '' END || 'No Más Clavos',
  descripcion = REGEXP_REPLACE(descripcion, '\s*no\s+mas\s+clavos\s*', ' ', 'i'),
  descripcion = TRIM(REGEXP_REPLACE(descripcion, '\s{2,}', ' ', 'g')),
  revisado = true
WHERE descripcion ILIKE '%no mas clavos%'
  OR descripcion ILIKE '%no más clavos%'
  AND activo = true;

-- ── 2.7 Normalizar separadores y símbolos ──
-- "c/" → "con"
UPDATE panol_materiales
SET
  descripcion = REPLACE(descripcion, 'c/', 'con '),
  revisado = true
WHERE descripcion LIKE '%c/%' AND activo = true;

-- "1 1/2" → "1½" (normalizar fracciones con espacio)
UPDATE panol_materiales
SET
  descripcion = REGEXP_REPLACE(descripcion, '(\d)\s+1/2', '\1½', 'g'),
  revisado = true
WHERE descripcion ~ '\d\s+1/2' AND activo = true;

-- "1 1/2\"" → "1½\""
UPDATE panol_materiales
SET
  descripcion = REGEXP_REPLACE(descripcion, '(\d)\s+1/2"', '\1½"', 'g'),
  revisado = true
WHERE descripcion ~ '\d\s+1/2"' AND activo = true;

COMMIT;
*/

-- ============================================================================
-- PASO 3: VERIFICACIÓN
-- ============================================================================
-- Después del UPDATE, corré esto para ver el resultado:

SELECT
  id,
  descripcion,
  alias,
  proveedor,
  codigo,
  revisado
FROM panol_materiales
WHERE activo = true
  AND revisado = true
ORDER BY descripcion
LIMIT 50;

-- ============================================================================
-- RESUMEN DE REGLAS APLICADAS
-- ============================================================================
--
-- 1. Códigos de proveedor al final → quitados de descripcion
--    "Bisagra Baron B21688" → "Bisagra"
--
-- 2. Cantidades (Nu) al final → quitadas de descripcion
--    "Cabo 6mm (50mts)" → "Cabo 6mm"
--
-- 3. Capitalización → INITCAP(LOWER()) para todo mayús/minús
--    "CABO 6MM" → "Cabo 6mm"
--    "cabo 6mm" → "Cabo 6mm"
--
-- 4. Abreviaturas corregidas post-INITCAP:
--    "Mm" → "mm", "Kg" → "kg", "Btu" → "BTU", "Usb" → "USB"
--    "Mts" → "m", "Inox" → "inox"
--
-- 5. Espacios dobles → espacio simple
--
-- 6. Marcas genéricas → movidas a alias
--    "Adhesivo No Más Clavos" → descripcion="Adhesivo", alias="No Más Clavos"
--
-- 7. Separadores normalizados:
--    "c/" → "con"
--    "1 1/2" → "1½"
--
-- ============================================================================
-- CÓMO AGREGAR MÁS REGLAS
-- ============================================================================
--
-- Para agregar una nueva familia de normalización:
--
-- 1. Identificá el patrón con un SELECT:
--    SELECT descripcion FROM panol_materiales
--    WHERE descripcion ILIKE '%patrón%' AND activo = true;
--
-- 2. Escribí el UPDATE con REGEXP_REPLACE o REPLACE:
--    UPDATE panol_materiales
--    SET descripcion = REGEXP_REPLACE(descripcion, 'patrón', 'reemplazo'),
--        revisado = true
--    WHERE descripcion ~ 'patrón' AND activo = true;
--
-- 3. Si la marca debe ir a alias en vez de quitarse:
--    UPDATE panol_materiales
--    SET alias = 'Marca',
--        descripcion = REGEXP_REPLACE(descripcion, '\s*marca\s*', ' ', 'i'),
--        revisado = true
--    WHERE descripcion ILIKE '%marca%' AND activo = true;
--
-- ============================================================================
