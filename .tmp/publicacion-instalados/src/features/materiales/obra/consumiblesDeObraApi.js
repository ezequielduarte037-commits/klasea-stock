import { supabase } from "@/supabaseClient";
import { fetchConsumibleIds } from "@/features/panol/panolApi";
import { esFilaDeConsumible } from "./consumiblesDeObra.js";

// PostgREST corta en mil filas sin avisar: se pagina.
const PAGINA = 1000;

async function paginar(armarConsulta) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armarConsulta().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** Retiros de consumibles de una obra: el registro nuevo y los renglones viejos del snapshot. */
export async function fetchConsumiblesDeObra(obraId) {
  if (!obraId) return { movimientos: [], filasViejas: [] };
  const [movimientos, snapshot, consumibleIds] = await Promise.all([
    paginar(() => supabase
      .from("consumibles_movimientos")
      .select("id,material_id,tipo,cantidad,created_at,anulado_at,material:panol_materiales(id,descripcion,unidad_medida,config:consumibles_config(unidad_entrega))")
      .eq("obra_id", obraId)
      .in("tipo", ["retiro", "devolucion"])
      .is("anulado_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })),
    paginar(() => supabase
      .from("panol_obra_materiales_snapshot")
      .select("id,material_id,requisito_material_id,descripcion,unidad,cantidad,cantidad_egresada,source,estado,notas,egreso_nota,recepcion_nota,stock_nota,created_at,egreso_at")
      .eq("obra_id", obraId)
      .in("source", ["solicitud_consumible_retiro", "historial_retiro_parcial"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })),
    fetchConsumibleIds(),
  ]);
  return {
    movimientos,
    filasViejas: snapshot.filter((row) => esFilaDeConsumible(row, consumibleIds)),
  };
}
