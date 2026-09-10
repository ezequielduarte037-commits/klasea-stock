-- Ítems duplicados en las obras: el requisito apuntado a sí mismo
--
-- SÍNTOMA
-- En una obra aparece el mismo material dos veces: uno "Pendiente" que viene de
-- la matriz y otro "Fuera de matriz" que está en pañol. La obra dice que falta
-- comprar algo que ya llegó. En la planilla ese material sale con "?".
--
-- POR QUÉ
-- La clave con la que la pantalla fusiona los renglones es
-- `requisito_material_id`. La fila de la matriz apunta al requisito; la que crea
-- el remito apunta al producto. Claves distintas, dos renglones.
--
-- La causa está en el trigger `panol_snapshot_set_requisito_default`, que hace
-- `requisito := material` cuando viene vacío, con el comentario "para stock
-- directo requisito=producto, lo cual es correcto". Es correcto mientras el
-- material no sea el producto asignado a un requisito. Cuando lo es -hay 244
-- vínculos cargados el 12/08- esa asignación crea una identidad paralela.
--
-- ALCANCE
-- 217 filas: 187 en 23 obras y 30 de stock general. La más reciente es del
-- 07/09, así que sigue pasando. El origen principal es la recepción de remitos.
-- 130 de esas filas se fusionan con su fila de matriz al corregirlas.
--
-- POR QUÉ ES SEGURO
-- Sólo cambia `requisito_material_id`. `material_id` no se toca, así que el
-- stock por material queda igual. La fusión ocurre al leer: no se borra ni se
-- junta ninguna fila, y gana el estado más avanzado -en pañol sobre pendiente-.
--
--
-- ════════════════════════════════════════════════════════════════════════════
-- POR QUÉ ESTA VERSIÓN NO TIENE `begin` NI `commit`
--
-- La versión anterior los tenía y no aplicó nada. El editor SQL de Supabase ya
-- corre lo que le pegás dentro de su propia transacción, y abrir otra adentro
-- la rompe. Lo verifiqué contra la base después de que lo corrieras: las 217
-- filas seguían iguales y el trigger seguía siendo el viejo.
--
-- Acá va cada cosa como una sentencia suelta. Se puede pegar todo junto.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Las filas que ya están mal
--
-- Toma locks de fila, no bloquea la tabla: se puede correr con el taller
-- trabajando.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_obra_materiales_snapshot s
   set requisito_material_id = rp.requisito_material_id,
       updated_at = now()
  from public.panol_requisito_productos rp
 where rp.producto_material_id = s.material_id
   and rp.activo is not false
   and s.material_id is not null
   and s.requisito_material_id = s.material_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Que no vuelva a pasar
--
-- Sólo reemplaza el cuerpo de la función. El trigger ya existe y le apunta por
-- identidad interna, no por su cuerpo, así que con esto alcanza: no hay que
-- borrarlo ni volver a crearlo, y por eso no pide ningún lock sobre la tabla.
-- Eso era lo que causaba el `deadlock detected` del primer intento.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.panol_snapshot_set_requisito_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.requisito_material_id is null and new.material_id is not null then
    -- Si el material es el producto asignado a un requisito, la fila pertenece
    -- a ESE requisito. Apuntarlo a sí mismo crea una identidad distinta de la
    -- de la matriz y el renglón queda paralelo en vez de acreditarse.
    select rp.requisito_material_id
      into new.requisito_material_id
      from public.panol_requisito_productos rp
     where rp.producto_material_id = new.material_id
       and rp.activo is not false
     order by rp.updated_at desc nulls last
     limit 1;

    -- Sin vínculo no hay requisito aparte: es stock directo y el material es su
    -- propia necesidad. Ese caso sí era correcto y se conserva.
    if new.requisito_material_id is null then
      new.requisito_material_id := new.material_id;
    end if;
  end if;
  return new;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL — correr después
-- ═════════════════════════════════════════════════════════════════════════════

-- Tiene que dar 0. Si sigue dando 216, el paso 1 no se aplicó.
select count(*) as filas_mal_apuntadas_debe_dar_0
  from public.panol_obra_materiales_snapshot s
  join public.panol_requisito_productos rp
    on rp.producto_material_id = s.material_id
   and rp.activo is not false
 where s.requisito_material_id = s.material_id;

-- El trigger tiene que seguir en pie y apuntar a esta función.
select t.tgname, p.proname
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.panol_obra_materiales_snapshot'::regclass
   and t.tgname = 'trg_panol_snapshot_set_requisito_default';

-- El anafe de la obra 37-40: las dos filas tienen que compartir el requisito.
-- Esta ya la dejé arreglada a mano al probar, así que debería dar
-- babc7783... en las dos aunque el paso 1 no haya corrido.
select s.id, s.estado, s.source, s.cantidad,
       s.material_id, s.requisito_material_id
  from public.panol_obra_materiales_snapshot s
  join public.produccion_obras o on o.id = s.obra_id
 where o.codigo = '37-40'
   and s.descripcion ilike '%anafe%'
 order by s.created_at;
