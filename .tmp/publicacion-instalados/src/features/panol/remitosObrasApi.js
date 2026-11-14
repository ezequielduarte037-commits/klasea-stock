import { supabase } from "@/supabaseClient";

export function normalizarObraIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function faltaSoporteMultiobra(error) {
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "").toLowerCase();
  return ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(codigo)
    || mensaje.includes("panol_comprobante_obras")
    || mensaje.includes("panol_asignar_obras_remito");
}

/** Map<comprobante_id, obra[]> para no duplicar el PDF ni la fila principal. */
export async function fetchObrasDeRemitos(comprobanteIds) {
  const ids = normalizarObraIds(comprobanteIds);
  const vinculos = [];
  if (!ids.length) return { disponible: await haySoporteRemitosMultiobra(), porRemito: new Map() };

  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from("panol_comprobante_obras")
      .select("comprobante_id,obra_id")
      .in("comprobante_id", ids.slice(i, i + 150));
    if (error) {
      if (faltaSoporteMultiobra(error)) return { disponible: false, porRemito: new Map() };
      throw error;
    }
    vinculos.push(...(data || []));
  }

  const obraIds = normalizarObraIds(vinculos.map((vinculo) => vinculo.obra_id));
  const obras = [];
  for (let i = 0; i < obraIds.length; i += 150) {
    const { data, error } = await supabase
      .from("produccion_obras")
      .select("id,codigo,linea_nombre,estado")
      .in("id", obraIds.slice(i, i + 150));
    if (error) throw error;
    obras.push(...(data || []));
  }

  const porId = new Map(obras.map((obra) => [String(obra.id), obra]));
  const porRemito = new Map();
  for (const vinculo of vinculos) {
    const obra = porId.get(String(vinculo.obra_id));
    if (!obra) continue;
    const actuales = porRemito.get(String(vinculo.comprobante_id)) || [];
    actuales.push(obra);
    porRemito.set(String(vinculo.comprobante_id), actuales);
  }
  for (const [remitoId, lista] of porRemito) {
    porRemito.set(remitoId, lista.sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""))));
  }
  return { disponible: true, porRemito };
}

/** Reemplazo atomico de las obras documentales del remito. No toca stock. */
export async function asignarObrasDeRemito(comprobanteId, obraIds) {
  if (!comprobanteId) return false;
  const ids = normalizarObraIds(obraIds);
  const { error } = await supabase.rpc("panol_asignar_obras_remito", {
    p_comprobante_id: comprobanteId,
    p_obra_ids: ids,
  });
  if (error) {
    if (faltaSoporteMultiobra(error)) return false;
    throw error;
  }
  return true;
}

export async function haySoporteRemitosMultiobra() {
  const { error } = await supabase
    .from("panol_comprobante_obras")
    .select("comprobante_id")
    .limit(1);
  if (!error) return true;
  if (faltaSoporteMultiobra(error)) return false;
  throw error;
}
