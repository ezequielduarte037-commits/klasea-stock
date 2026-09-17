import { supabase } from "@/supabaseClient";
import { loadMemoriasFromSupabase } from "@/features/obras/mapa/persistence";

// Datos de Memoria viva. Por ahora lee lo que ya existe (obra_memorias, la
// matriz y los materiales de la obra); cuando se aplique la migración
// 20260917120000_memoria_viva.sql, fetchVinculos empieza a traer los vínculos
// confirmados y la pantalla deja de depender sólo de las sugerencias.

export async function fetchObrasActivas() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,estado,linea_nombre")
    .eq("estado", "activa")
    .order("codigo", { ascending: true });
  if (error) throw error;
  return data || [];
}

export function fetchMemorias() {
  return loadMemoriasFromSupabase();
}

// PostgREST arma el filtro .in() en la URL: con cientos de ids se pasa del
// largo que aceptan los proxies. De a 150 alcanza.
async function enLotes(ids, consulta, tamano = 150) {
  const resultado = [];
  for (let i = 0; i < ids.length; i += tamano) {
    const { data, error } = await consulta(ids.slice(i, i + tamano));
    if (error) throw error;
    resultado.push(...(data || []));
  }
  return resultado;
}

const matricesPorLinea = new Map();

// La matriz de una línea con el nombre de cada material. Se guarda en memoria
// del navegador: cambia poco y varias obras comparten línea.
export async function fetchMatrizLinea(numeroLinea) {
  if (!numeroLinea) return [];
  if (matricesPorLinea.has(numeroLinea)) return matricesPorLinea.get(numeroLinea);
  const pedido = (async () => {
    const { data, error } = await supabase
      .from("panol_material_modelo")
      .select("material_id,cantidad,variante,producto_predeterminado_id")
      .eq("modelo", numeroLinea);
    if (error) throw error;
    const filas = data || [];
    const ids = [...new Set(filas.flatMap((fila) => [fila.material_id, fila.producto_predeterminado_id]).filter(Boolean))];
    const materiales = await enLotes(ids, (lote) => supabase
      .from("panol_materiales")
      .select("id,descripcion,es_requisito")
      .in("id", lote));
    const porId = new Map(materiales.map((material) => [material.id, material]));
    return filas.map((fila) => ({
      ...fila,
      descripcion: porId.get(fila.material_id)?.descripcion || porId.get(fila.producto_predeterminado_id)?.descripcion || "",
      es_requisito: porId.get(fila.material_id)?.es_requisito === true,
    }));
  })();
  matricesPorLinea.set(numeroLinea, pedido);
  try {
    return await pedido;
  } catch (error) {
    matricesPorLinea.delete(numeroLinea);
    throw error;
  }
}

export async function fetchRenglonesObra(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id,descripcion,material_id,cantidad,unidad,rubro,tipo,source,estado,recepcion_estado,egreso_at,purchase_request_id,panol_envio_id,updated_at")
    .eq("obra_id", obraId)
    .limit(5000);
  if (error) throw error;
  return data || [];
}

// Vínculos confirmados a mano (tabla nueva). Si la migración todavía no se
// aplicó, la tabla no existe y se sigue sólo con sugerencias.
export async function fetchVinculos(obraId) {
  if (!obraId) return [];
  const { data, error } = await supabase
    .from("memoria_vinculos")
    .select("campo_key,snapshot_id,material_id,origen,confirmado,descartado")
    .eq("obra_id", obraId);
  if (error) return [];
  return data || [];
}
