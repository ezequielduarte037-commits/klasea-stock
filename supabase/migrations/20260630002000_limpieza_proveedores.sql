-- ============================================================================
-- MIGRACIÓN: Limpieza y normalización del campo proveedor
-- ============================================================================
-- PROBLEMA:
--   El campo proveedor contiene el nombre mezclado con código del producto
--   Ejemplos: "Baron 12345", "Baron COD-987", "Sodimac 555"
--
-- SOLUCIÓN:
--   1. Extraer el código del proveedor usando expresiones regulares
--   2. Mover ese código a la columna codigo (o descripcion)
--   3. Limpiar el campo proveedor para que solo contenga el nombre
--
-- SEGURIDAD:
--   - Se ejecuta dentro de una transacción (si falla, hace rollback automático)
--   - Primero muestra qué va a cambiar (SELECT de preview)
--   - Luego aplica los cambios (UPDATE)
--
-- ADAPTABILIDAD:
--   - Funciona para cualquier proveedor (Baron, Sodimac, etc.)
--   - Solo hay que agregar el nombre en la lista de proveedores
-- ============================================================================

-- ============================================================================
-- PASO 1: PREVIEW - Ver qué registros se van a modificar
-- ============================================================================
-- Ejecutá este SELECT primero para ver qué va a cambiar
-- (no modifica nada, solo muestra)

SELECT 
  id,
  codigo AS codigo_actual,
  descripcion,
  proveedor AS proveedor_original,
  -- Extraer el nombre del proveedor (primera palabra antes del espacio)
  SPLIT_PART(proveedor, ' ', 1) AS proveedor_limpio,
  -- Extraer el código (todo lo que viene después del primer espacio)
  TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$')) AS codigo_extraido,
  -- Mostrar cómo quedaría el nuevo codigo
  CASE 
    WHEN codigo IS NULL OR codigo = '' THEN TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
    ELSE codigo || ' | ' || TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
  END AS codigo_nuevo
FROM panol_materiales
WHERE proveedor ~ '^[^ ]+\s+.+$'  -- Tiene algo después del primer espacio
  AND SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M')  -- Lista de proveedores a limpiar
  AND proveedor IS NOT NULL
ORDER BY proveedor, descripcion;

-- ============================================================================
-- PASO 2: ACTUALIZACIÓN - Aplicar los cambios
-- ============================================================================
-- Si el preview se ve bien, descomentá y ejecutá este bloque

/*
BEGIN;

-- Actualizar panol_materiales
UPDATE panol_materiales
SET 
  -- Limpiar proveedor: quedarse solo con la primera palabra
  proveedor = SPLIT_PART(proveedor, ' ', 1),
  
  -- Agregar el código extraído a la columna codigo
  codigo = CASE 
    WHEN codigo IS NULL OR codigo = '' 
      THEN TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
    ELSE codigo || ' | ' || TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
  END
WHERE proveedor ~ '^[^ ]+\s+.+$'
  AND SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M')
  AND proveedor IS NOT NULL;

-- Actualizar panol_obra_materiales_snapshot (si también tiene el problema)
UPDATE panol_obra_materiales_snapshot
SET 
  proveedor = SPLIT_PART(proveedor, ' ', 1),
  codigo = CASE 
    WHEN codigo IS NULL OR codigo = '' 
      THEN TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
    ELSE codigo || ' | ' || TRIM(SUBSTRING(proveedor FROM '^[^ ]+\s+(.*)$'))
  END
WHERE proveedor ~ '^[^ ]+\s+.+$'
  AND SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M')
  AND proveedor IS NOT NULL;

COMMIT;
*/

-- ============================================================================
-- PASO 3: VERIFICACIÓN - Confirmar que se aplicó correctamente
-- ============================================================================
-- Ejecutá esto después del UPDATE para ver el resultado

SELECT 
  id,
  codigo AS codigo_nuevo,
  descripcion,
  proveedor AS proveedor_limpio
FROM panol_materiales
WHERE SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M')
ORDER BY proveedor, descripcion
LIMIT 20;

-- ============================================================================
-- EXPLICACIÓN DE LAS FUNCIONES USADAS
-- ============================================================================
-- 
-- SPLIT_PART(texto, delimitador, posición)
--   Divide el texto por el delimitador y devuelve la parte en la posición
--   Ejemplo: SPLIT_PART('Baron 12345', ' ', 1) → 'Baron'
--
-- SUBSTRING(texto FROM patrón_regex)
--   Extrae una parte del texto usando una expresión regular
--   Patrón: '^[^ ]+\s+(.*)$'
--     ^       = inicio del texto
--     [^ ]+   = una o más palabras sin espacios (el nombre del proveedor)
--     \s+     = uno o más espacios
--     (.*)    = captura todo lo que sigue (el código)
--     $       = fin del texto
--   Ejemplo: SUBSTRING('Baron 12345' FROM '^[^ ]+\s+(.*)$') → '12345'
--
-- TRIM(texto)
--   Elimina espacios al inicio y final
--
-- operador ~ (match regex)
--   Verifica si el texto coincide con la expresión regular
--   '^[^ ]+\s+.+$' = tiene al menos una palabra, un espacio, y algo después
--
-- ============================================================================
-- CÓMO ADAPTARLO PARA OTROS CASOS
-- ============================================================================
-- 
-- 1. Agregar más proveedores a la lista:
--    Cambiá: SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M')
--    Por:    SPLIT_PART(proveedor, ' ', 1) IN ('Baron', 'Sodimac', 'Yale', '3M', 'Otro')
--
-- 2. Si el formato es diferente (ej: "Proveedor-CODIGO"):
--    Cambiá la regex de SUBSTRING para que use otro delimitador
--    Ejemplo: SUBSTRING(proveedor FROM '^[^-]+-(.*)$') para "Proveedor-CODIGO"
--
-- 3. Si querés mover el código a descripcion en vez de codigo:
--    Cambiá: codigo = codigo || ' | ' || codigo_extraido
--    Por:    descripcion = descripcion || ' [' || codigo_extraido || ']'
--
-- 4. Si querés ver TODOS los proveedores con código mezclado (sin filtrar):
--    Quitá la condición: AND SPLIT_PART(proveedor, ' ', 1) IN (...)
--    Y dejá solo: WHERE proveedor ~ '^[^ ]+\s+.+$'
--
-- ============================================================================
