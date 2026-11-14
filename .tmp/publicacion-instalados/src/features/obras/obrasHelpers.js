import { C } from "@/theme";
import { supabase } from "@/supabaseClient";

// Utilidades compartidas por las vistas y ventanas de Obras.
export const num        = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const today      = () => new Date().toISOString().slice(0, 10);
export const fmtDate    = d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
export const fmtDateFull= d => !d ? "—" : new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const STORAGE_BUCKET = "obra-archivos"; // Crear en Supabase Storage

export async function safeQuery(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

export const MATRIX_DETAIL_KEYS = ["responsable", "personas_necesarias", "involucrados", "observaciones"];
export const hasMatrixDetailColumns = row => !!row && MATRIX_DETAIL_KEYS.some(k => Object.prototype.hasOwnProperty.call(row, k));
export const hasMatrixDetailContent = row => !!(row?.descripcion || row?.responsable || row?.personas_necesarias || row?.involucrados || row?.observaciones);
export const matrixDetailPatch = form => ({
  responsable: form.responsable?.trim() || null,
  personas_necesarias: form.personas_necesarias !== "" && form.personas_necesarias != null && Number.isFinite(Number(form.personas_necesarias)) ? parseInt(form.personas_necesarias) : null,
  involucrados: form.involucrados?.trim() || null,
  observaciones: form.observaciones?.trim() || null,
});

export const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};
export const COLOR_PRESETS = ["#3b82f6","#10b981","#22d3ee","#8b5cf6","#ec4899","#64748b","#0ea5e9","#f43f5e"];

export const INP = {
  background: "var(--panel)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 12px", borderRadius: 8, fontSize: 13,
  outline: "none", width: "100%",
};

export const PRIORIDADES = [["baja", "Baja"], ["media", "Media"], ["alta", "Alta"], ["critica", "Crítica"]];

// Propaga las predecesoras (dependencias) de la plantilla de línea a las tareas reales de la obra.
// La plantilla guarda ids de linea_proceso_tareas; al copiarse a la obra cada tarea recibe un id
// nuevo, así que remapeamos por NOMBRE (único dentro de una obra en la práctica).
export async function propagarPredecesorasObra(obraId, tPlantilla) {
  const conDeps = (tPlantilla || []).filter(tp => Array.isArray(tp.predecesoras) && tp.predecesoras.length);
  if (!conDeps.length) return;
  const nombrePorTplId = {};
  (tPlantilla || []).forEach(tp => { nombrePorTplId[tp.id] = tp.nombre; });
  const { data: obraTasks } = await supabase.from("obra_tareas").select("id, nombre").eq("obra_id", obraId);
  if (!obraTasks?.length) return;
  const idPorNombre = {};
  obraTasks.forEach(ot => { idPorNombre[ot.nombre] = ot.id; });
  const updates = [];
  for (const tp of conDeps) {
    const targetId = idPorNombre[tp.nombre];
    if (!targetId) continue;
    const predIds = tp.predecesoras.map(pid => idPorNombre[nombrePorTplId[pid]]).filter(Boolean);
    if (predIds.length) updates.push(supabase.from("obra_tareas").update({ predecesoras: predIds }).eq("id", targetId));
  }
  if (updates.length) await Promise.all(updates);
}
