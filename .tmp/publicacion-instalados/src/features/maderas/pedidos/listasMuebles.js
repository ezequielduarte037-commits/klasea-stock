import { supabase } from "@/supabaseClient";
import { claveObra, num } from "@/features/laminacion/obras";
import { templateEnchapadoForModelo } from "@/features/muebles/EnchapadoView";
import { etapaMeta } from "@/features/muebles/mueblesProduccion";
import { nuevoUid } from "./borrador";

// Lista estándar de maderas de cada barco, la misma que usa Muebles para la OT
// de maderas (Muebles → Plantillas OT y herrajes): placas y terciados. Los
// tablones de lenga y okumé de la OT NO van: Ezequiel pidió dejarlos afuera
// (se piden por otro lado). Se toma, en este orden:
//   1. la OT de maderas de la obra (si Muebles la cargó para ese lote),
//   2. la plantilla de la línea guardada en Muebles,
//   3. la plantilla fija de la línea (la que Muebles muestra si nunca se guardó).

// Etapas de Muebles (Oberti) en las que la madera todavía no se usó.
const ETAPAS_SIN_MADERA = new Set(["definicion", "compra_materiales", "materiales_astillero"]);

export async function cargarListasMuebles() {
  const [lineas, ots, lotes] = await Promise.all([
    supabase.from("prod_lineas").select("id,nombre"),
    supabase.from("muebles_ordenes_trabajo").select("id,lote_id,linea_id,titulo,config").eq("tipo", "maderas"),
    supabase.from("prod_muebles_lotes").select("id,proveedor,etapa,estado_proceso,tipo_destino,prod_unidades(codigo)"),
  ]);
  // Si algo de Muebles no se puede leer, Maderas sigue con las plantillas fijas.
  return {
    lineas: lineas.data ?? [],
    ots: ots.data ?? [],
    lotes: (lotes.data ?? []).filter((l) => l.tipo_destino !== "stock" && l.prod_unidades?.codigo),
  };
}

function configUtil(config) {
  if (!config || typeof config !== "object") return null;
  const placas = Array.isArray(config.placas) ? config.placas.filter((p) => String(p).trim()) : [];
  return placas.length ? { placas } : null;
}

// Lista de una obra y de dónde salió. null si su línea no tiene lista.
export function listaDeObra(obra, muebles) {
  if (!obra?.linea) return null;
  const lote = muebles.lotes.find((l) => claveObra(l.prod_unidades.codigo) === obra.clave) ?? null;
  const deObra = lote ? configUtil(muebles.ots.find((o) => o.lote_id === lote.id)?.config) : null;
  if (deObra) return { ...deObra, fuente: `OT de maderas de la obra (Muebles)`, lote };
  const linea = muebles.lineas.find((l) => String(l.nombre).toUpperCase() === obra.linea.toUpperCase());
  const deLinea = linea ? configUtil(muebles.ots.find((o) => !o.lote_id && o.linea_id === linea.id)?.config) : null;
  if (deLinea) return { ...deLinea, fuente: `Plantilla ${obra.linea} de Muebles`, lote };
  const fija = configUtil(templateEnchapadoForModelo(obra.linea));
  if (fija) return { ...fija, fuente: `Plantilla ${obra.linea} de Muebles`, lote };
  return null;
}

// ¿La madera de esta obra todavía no se usó en Muebles? Con lote, manda su
// etapa; sin lote, que no se haya desmoldado.
export function sinMaderaTodavia(obra, lote) {
  if (lote) return ETAPAS_SIN_MADERA.has(etapaMeta(lote).etapa?.key);
  return !obra.desmoldeReal;
}

export function etapaMuebles(lote) {
  return lote ? etapaMeta(lote).etapa?.label ?? null : null;
}

// ── Del texto de la plantilla al catálogo de maderas ──────────────────────
function palabras(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d+)\s*mm\b/g, "$1mm")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["de", "del", "la", "el", "x"].includes(w))
    // "terciados" → "terciado", "placas" → "placa", "tablones" → "tablon".
    .map((w) => (/^\d/.test(w) || w.length <= 3 ? w : w.replace(/(es|s)$/, "")));
}

// El material del catálogo cuyas palabras están todas en el texto (el de más
// palabras gana: "Terciado 3mm" antes que "Terciado").
export function materialPorTexto(texto, materiales) {
  const del = new Set(palabras(texto));
  let mejor = null;
  let puntos = 0;
  for (const m of materiales) {
    const suyas = palabras(m.nombre);
    if (!suyas.length || !suyas.every((w) => del.has(w))) continue;
    if (suyas.length > puntos) { mejor = m; puntos = suyas.length; }
  }
  return mejor;
}

// Renglones listos para el pedido: { material_id, descripcion, cantidad, unidad }.
export function renglonesDeLista(lista, materiales) {
  const filas = [];
  for (const texto of lista?.placas ?? []) {
    const m = String(texto).trim().match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    const cantidad = m ? num(m[1].replace(",", ".")) : 0;
    const descripcion = m ? m[2].trim() : String(texto).trim();
    const mat = materialPorTexto(descripcion, materiales);
    filas.push(mat
      ? { material_id: mat.id, descripcion: mat.nombre, cantidad, unidad: mat.unidad_medida || "u" }
      : { material_id: null, descripcion, cantidad, unidad: "placa" });
  }
  // Si dos textos caen en el mismo material, se suman.
  const unidos = [];
  for (const f of filas) {
    const ya = f.material_id && unidos.find((u) => u.material_id === f.material_id);
    if (ya) ya.cantidad += f.cantidad;
    else unidos.push({ ...f });
  }
  return unidos;
}

function itemsDeRenglones(renglones) {
  return renglones.map((r) => ({ uid: nuevoUid(), material_id: r.material_id, descripcion: r.descripcion, cantidad: r.cantidad ? String(r.cantidad) : "", unidad: r.unidad }));
}

// Grupo de obra para el borrador, con su lista ya cargada.
export function grupoDeObra(obraValor, renglones, fuente = "") {
  return { uid: nuevoUid(), tipo: "obra", obra: obraValor, recibirEn: "", fuente, items: itemsDeRenglones(renglones) };
}

// Pone la lista de una obra en el borrador: si la obra ya estaba (vacía), la
// llena; si no, la suma al final.
export function conListaDeObra(borrador, obraValor, renglones, fuente = "") {
  const clave = claveObra(obraValor);
  const ya = borrador.grupos.find((g) => g.tipo === "obra" && claveObra(g.obra) === clave);
  if (ya) {
    return { ...borrador, grupos: borrador.grupos.map((g) => (g === ya ? { ...g, fuente, items: itemsDeRenglones(renglones) } : g)) };
  }
  return { ...borrador, grupos: [...borrador.grupos, grupoDeObra(obraValor, renglones, fuente)] };
}
