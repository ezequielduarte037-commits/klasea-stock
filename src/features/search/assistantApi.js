import { supabase } from "@/supabaseClient";
import { elegirHerramienta, responderConHerramienta } from "./assistantTools";

const MAX_CONTEXT_ITEMS = 24;
const MAX_HISTORY_ITEMS = 6;

// "secciones" va primero en todos: la mitad de lo que se le pregunta al
// asistente es dónde se hace algo, y sin el mapa del sistema en el contexto
// contestaba de memoria o no contestaba.
const ASSISTANT_SECTIONS_BY_ROLE = {
  admin: ["secciones", "obras", "materiales", "remitos", "compras", "solicitudes", "proveedores"],
  tecnica: ["secciones", "obras", "materiales", "remitos", "compras", "solicitudes", "proveedores"],
  compras: ["secciones", "materiales", "compras", "solicitudes", "proveedores"],
  panol: ["secciones", "materiales", "remitos", "compras", "solicitudes"],
};

function assistantRole(profile) {
  if (profile?.is_admin || profile?.role === "admin") return "admin";
  return String(profile?.role || "").trim().toLowerCase();
}

export function canUseKlaseaAssistant(profile) {
  return Object.hasOwn(ASSISTANT_SECTIONS_BY_ROLE, assistantRole(profile));
}

function text(value, maxLength = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Math.round(number(value) * 1000) / 1000;
}

function stockSummary(rows = [], rowDelta, rowIsTransit) {
  let total = 0;
  let inTransit = 0;
  const bySede = new Map();
  rows.forEach((row) => {
    if (rowIsTransit(row)) {
      inTransit += number(row.cantidad);
      return;
    }
    const delta = rowDelta(row);
    total += delta;
    if (Math.abs(delta) <= 0.0001) return;
    const sede = text(row.stock_sede || row.panol_envio?.sede || "Sin sede", 80);
    bySede.set(sede, (bySede.get(sede) || 0) + delta);
  });
  return {
    stockTotal: roundQty(total),
    stockInTransit: roundQty(inTransit),
    stockBySede: [...bySede.entries()]
      .map(([sede, quantity]) => ({ sede, quantity: roundQty(quantity) }))
      .filter((row) => Math.abs(row.quantity) > 0.0001)
      .sort((a, b) => b.quantity - a.quantity),
  };
}

async function stockByMaterial(groups = []) {
  const materials = groups
    .find((group) => group?.key === "materiales")
    ?.items?.slice(0, 8) || [];
  if (!materials.length) return new Map();
  const { rowDelta, rowIsTransit } = await import("@/features/panol/panolMovimientos");
  const ids = materials.map((item) => item.id).filter(Boolean);
  const encodedIds = ids.join(",");
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("material_id,requisito_material_id,estado,recepcion_estado,cantidad,cantidad_egresada,source,stock_sede,stock_nota,notas,recepcion_nota,egreso_nota")
    .in("estado", ["en_panol", "recibido", "parcial", "problema"])
    .or(`material_id.in.(${encodedIds}),requisito_material_id.in.(${encodedIds})`)
    .limit(5000);
  if (error) throw error;

  return new Map(ids.map((id) => {
    const rows = (data || []).filter((row) => row.material_id === id || row.requisito_material_id === id);
    return [id, stockSummary(rows, rowDelta, rowIsTransit)];
  }));
}

async function buildContext(groups = [], profile) {
  const role = assistantRole(profile);
  const allowedSections = new Set(ASSISTANT_SECTIONS_BY_ROLE[role] || []);
  const canOpenStock = ["admin", "tecnica", "panol"].includes(role);
  const materialStock = await stockByMaterial(groups);
  return groups
    .filter((group) => allowedSections.has(group?.key))
    .flatMap((group) => (group?.items || []).map((item) => ({
      id: text(item?.id, 80),
      section: text(group.key, 40),
      title: text(item?.title),
      detail: text(item?.subtitle),
      meta: text(item?.meta, 140),
      status: text(item?.status, 60),
      path: text(item?.path, 300),
      stockPath: canOpenStock ? text(item?.stockPath, 400) : "",
      unit: text(item?.unit, 40),
      location: text(item?.location, 140),
      ...(materialStock.get(item?.id) || {}),
    })))
    .slice(0, MAX_CONTEXT_ITEMS);
}

function buildHistory(messages = []) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message?.role) && message?.content)
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => ({
      role: message.role,
      content: text(message.content, 900),
    }));
}

/**
 * El asistente contesta por dos caminos y conviene saber cuál es cuál.
 *
 * 1. Si la pregunta cae en una de las consultas de `assistantTools`, se corre
 *    esa consulta contra la base -con la sesión de quien pregunta, o sea con el
 *    RLS puesto- y la respuesta la escribe el código con los números que
 *    devolvió. No interviene ningún modelo: un total no se redondea ni se
 *    inventa.
 *
 * 2. Si no cae en ninguna, va al modelo con lo de siempre: los resultados de
 *    búsqueda como evidencia. Ahí puede orientar, resumir y explicar, pero no
 *    contar, y el prompt le pide que lo diga en vez de estimar.
 *
 * Antes había un tercer camino que no estaba escrito en ningún lado: un `if`
 * que miraba si la pregunta tenía la palabra "cuántos" y devolvía una plantilla
 * de stock. Por eso "cuántos remitos se cargaron esta semana" se contestaba con
 * el stock de unos cables. Ese camino ya no existe.
 */
export async function askKlaseaAssistant({ question, groups = [], messages = [], profile }) {
  if (!canUseKlaseaAssistant(profile)) {
    throw new Error("Tu rol no tiene habilitado el asistente de Klase A.");
  }

  const eleccion = elegirHerramienta(question, profile);
  if (eleccion) {
    try {
      return await responderConHerramienta(eleccion);
    } catch (error) {
      // Que falle una consulta no puede dejar sin respuesta: se sigue por el
      // camino del modelo, que al menos orienta.
      console.error("assistant: falló la consulta", eleccion.herramienta.id, error);
    }
  }

  const context = await buildContext(groups, profile);
  const payload = {
    question: text(question, 600),
    context,
    history: buildHistory(messages),
  };

  const { data, error } = await supabase.functions.invoke("asistente-klasea", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.answer) throw new Error("El asistente no devolvió una respuesta.");
  return data;
}
