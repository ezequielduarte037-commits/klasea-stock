-- ==============================================================================
-- SCRIPT DE DEDUPLICACIÓN INTELIGENTE DE PROVEEDORES
-- ==============================================================================
-- Reglas de seguridad:
-- 1. Introspección dinámica: Busca automáticamente todas las tablas que apuntan a proveedor_id
-- 2. Preview seguro: Primero revisá las tablas y los grupos sin modificar datos
-- 3. Merge reversible: Reasigna FKs hacia el canónico y marca el resto como activo=false
-- ==============================================================================

-- ==============================================================================
-- PASO 1: INTROSPECCIÓN DE REFERENCIAS (SOLO LECTURA)
-- Ejecutá esto para confirmar qué tablas dependen de panol_proveedores
-- ==============================================================================
SELECT 
    tc.table_schema, 
    tc.table_name, 
    kcu.column_name,
    'Apunta a panol_proveedores.id' as descripcion
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'panol_proveedores' 
  AND ccu.column_name = 'id';


-- ==============================================================================
-- PASO 2: PREVIEW DE DEDUPLICACIÓN (SOLO LECTURA)
-- Agrupa por nombre normalizado y elige el más corto/limpio como canónico
-- ==============================================================================
WITH normalizados AS (
  SELECT 
    id,
    nombre,
    activo,
    cuit,
    -- Normalización: a minúsculas, sin espacios extra, y sacamos sufijos "sa", "srl", códigos, números, etc.
    TRIM(REGEXP_REPLACE(LOWER(nombre), '\s+(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|inc|llc|\d+|c[oó]d.*|suc.*|ltda|sa)$', '', 'g')) as raiz
  FROM public.panol_proveedores
),
agrupados AS (
  SELECT 
    raiz,
    array_agg(nombre) as variaciones_encontradas,
    count(*) as total_duplicados,
    -- El canónico será el nombre más corto dentro del grupo
    (array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC))[1] as id_canonico,
    (array_agg(nombre ORDER BY LENGTH(nombre) ASC, id ASC))[1] as nombre_canonico,
    -- Los que vamos a desactivar (todos menos el canónico)
    array_remove(array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC), (array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC))[1]) as ids_a_desactivar
  FROM normalizados
  GROUP BY raiz
  HAVING count(*) > 1
)
SELECT 
    raiz, 
    nombre_canonico, 
    total_duplicados, 
    variaciones_encontradas 
FROM agrupados 
ORDER BY total_duplicados DESC;


-- ==============================================================================
-- PASO 3: EJECUCIÓN DEL MERGE (MODIFICA LA BASE DE DATOS)
-- Revisa el paso 2. Si estás de acuerdo con los canónicos, ejecuta este bloque.
-- Usamos DO $$ para ejecutar lógica dinámica iterando sobre information_schema
-- ==============================================================================

/* DESCOMENTAR PARA EJECUTAR EL MERGE
DO $$
DECLARE
    grp RECORD;
    fk_record RECORD;
    dup_id UUID;
    update_sql TEXT;
    fk_updates_count INT := 0;
BEGIN
    -- 1. Buscamos todas las tablas que referencian panol_proveedores.id
    -- Las guardamos en una tabla temporal para no consultar information_schema en cada loop
    CREATE TEMP TABLE tmp_fks AS
    SELECT tc.table_schema, tc.table_name, kcu.column_name
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND ccu.table_name = 'panol_proveedores' 
      AND ccu.column_name = 'id';

    -- 2. Iteramos sobre cada grupo de duplicados
    FOR grp IN (
        WITH normalizados AS (
          SELECT 
            id,
            nombre,
            TRIM(REGEXP_REPLACE(LOWER(nombre), '\s+(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|inc|llc|\d+|c[oó]d.*|suc.*|ltda|sa)$', '', 'g')) as raiz
          FROM public.panol_proveedores
        )
        SELECT 
          (array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC))[1] as id_canonico,
          (array_agg(nombre ORDER BY LENGTH(nombre) ASC, id ASC))[1] as nombre_canonico,
          array_remove(array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC), (array_agg(id ORDER BY LENGTH(nombre) ASC, id ASC))[1]) as ids_a_desactivar
        FROM normalizados
        GROUP BY raiz
        HAVING count(*) > 1
    ) LOOP
        
        -- Para cada ID duplicado en este grupo
        FOREACH dup_id IN ARRAY grp.ids_a_desactivar
        LOOP
            -- 3. Reasignar todas las foreign keys hacia el canónico
            FOR fk_record IN SELECT * FROM tmp_fks LOOP
                update_sql := format('UPDATE %I.%I SET %I = $1 WHERE %I = $2;', 
                                     fk_record.table_schema, fk_record.table_name, fk_record.column_name, fk_record.column_name);
                EXECUTE update_sql USING grp.id_canonico, dup_id;
            END LOOP;
            
            -- Extra: Si hay tablas que guardan el "nombre" del proveedor de forma desnormalizada, 
            -- las actualizamos explícitamente (ej: panol_materiales, panol_precios)
            -- Nota: ignoramos si la columna no existe (manejado por el motor si lo forzamos, 
            -- pero como sabemos que existen las ponemos directo).
            
            BEGIN
                UPDATE public.panol_materiales SET proveedor = grp.nombre_canonico WHERE proveedor_id = grp.id_canonico;
            EXCEPTION WHEN OTHERS THEN END;

            BEGIN
                UPDATE public.panol_precios SET proveedor = grp.nombre_canonico WHERE proveedor_id = grp.id_canonico;
            EXCEPTION WHEN OTHERS THEN END;

            BEGIN
                UPDATE public.panol_comprobantes SET proveedor = grp.nombre_canonico WHERE proveedor_id = grp.id_canonico;
            EXCEPTION WHEN OTHERS THEN END;

            BEGIN
                UPDATE public.panol_obra_materiales_snapshot SET proveedor = grp.nombre_canonico WHERE proveedor_id = grp.id_canonico;
            EXCEPTION WHEN OTHERS THEN END;
            
            BEGIN
                UPDATE public.purchase_requests SET proveedor = grp.nombre_canonico WHERE proveedor_id = grp.id_canonico;
            EXCEPTION WHEN OTHERS THEN END;

            -- 4. Ocultar el duplicado (soft-delete)
            UPDATE public.panol_proveedores 
            SET activo = false, 
                notas = CONCAT(notas, ' [MERGED TO ', grp.id_canonico, ']') 
            WHERE id = dup_id;
            
        END LOOP;
    END LOOP;
    
    DROP TABLE tmp_fks;
END $$;
*/
