import { supabase } from "@/supabaseClient";

// En qué modelos de barco entra un producto y cuántas unidades lleva cada uno.
// Sale de la matriz (`panol_material_modelo`), que es la lista de materiales de
// cada modelo: K37 lleva 3, K52 lleva 5, etc.
//
// Un producto puede aparecer en la matriz de dos formas:
//   · directo            — la matriz lo nombra a él
//   · como predeterminado — la matriz nombra un requisito genérico ("TV 32") y
//                           este producto es el que se usa por defecto
// Las dos cuentan, pero se distinguen: la segunda depende de que nadie haya
// elegido otro producto para esa obra.

const TABLE = "panol_material_modelo";
const VARIANTE_BASE = "standard";

function isMissingColumn(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "42703" || msg.includes("does not exist") || msg.includes("schema cache");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Agrupa por modelo. Las variantes NO se suman: son alternativas del mismo
// material, no cosas distintas que el barco lleva a la vez. Se muestran como
// detalle cuando existen.
function agrupar(rows, materialId) {
  const byModelo = new Map();

  for (const row of rows) {
    const modelo = String(row.modelo || "").trim();
    if (!modelo) continue;

    const via = row.material_id === materialId ? "directo" : "predeterminado";
    const variante = String(row.variante || "").trim() || VARIANTE_BASE;
    const cantidad = toNumber(row.cantidad);

    const actual = byModelo.get(modelo) || { modelo, cantidad: 0, variantes: [], via };
    if (variante === VARIANTE_BASE) {
      actual.cantidad = Math.max(actual.cantidad, cantidad);
    } else {
      actual.variantes.push({ variante, cantidad });
      // Si el modelo sólo tiene variantes, la cantidad base es la mayor: es lo
      // que va a llevar el barco, elija la variante que elija.
      actual.cantidad = Math.max(actual.cantidad, cantidad);
    }
    // Un modelo que aparece por las dos vías se marca como directo: es el dato
    // más firme de los dos.
    if (via === "directo") actual.via = "directo";
    byModelo.set(modelo, actual);
  }

  return Array.from(byModelo.values())
    .sort((a, b) => String(a.modelo).localeCompare(String(b.modelo), "es", { numeric: true }));
}

export async function fetchModelosDeMaterial(materialId) {
  if (!materialId) return { rows: [], soportaPredeterminado: true };

  const base = "id, material_id, modelo, cantidad, variante";
  let soportaPredeterminado = true;

  // Primer intento con producto_predeterminado_id. Esa columna no existe en
  // todas las bases (el esquema del repo y el de producción no siempre
  // coinciden), así que si falta se reintenta sin ella en vez de romper.
  let { data, error } = await supabase
    .from(TABLE)
    .select(`${base}, producto_predeterminado_id`)
    .or(`material_id.eq.${materialId},producto_predeterminado_id.eq.${materialId}`)
    .limit(500);

  if (error && isMissingColumn(error)) {
    soportaPredeterminado = false;
    const retry = await supabase
      .from(TABLE)
      .select(base)
      .eq("material_id", materialId)
      .limit(500);
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;

  return { rows: agrupar(data || [], materialId), soportaPredeterminado };
}
