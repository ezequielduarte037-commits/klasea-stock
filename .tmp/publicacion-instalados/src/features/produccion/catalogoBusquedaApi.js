import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de catálogo con facetas (proveedor / rubro) para el selector de
// materiales. Es server-side a propósito: el catálogo pasa los miles de filas y
// bajarlo entero en cada apertura era la espera larga que ya se sacó de pañol.
//
// Las listas de filtros (proveedores y rubros) sí se cachean en memoria: son
// chicas, cambian poco y las necesitan todos los desplegables.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS = "id,categoria_id,codigo,descripcion,alias,proveedor,unidad_medida,precio_unitario,moneda,activo,es_consumible";

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "un", "una"]);

// Dónde se busca. El ALIAS es el que más pesa y era el que faltaba: 485
// materiales activos tienen uno, y el alias es justamente el nombre con el que
// los llama el taller mientras la descripción dice otra cosa. "Manchon" es el
// alias de un "Bulón Cabeza ALLEN 5\" x 5/8\" UNC Grado 12.9", y "Palma pata de
// gallo" el de un "Corte 230x350mm chapa 1/2\" 316 inox.". Buscar "manchon"
// devolvía CERO resultados aunque el material estuviera ahí con ese nombre.
const COLUMNAS_BUSQUEDA = ["descripcion", "codigo", "alias", "proveedor"];

// Saca tildes y baja a minúsculas para que "cañería" matchee "caneria".
export function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Cada letra acepta sus variantes acentuadas y la eñe.
 *
 * `ilike` no ignora tildes: '%timon%' NO matchea "timón" y '%cano%' NO matchea
 * "Caño". Como normalizar() ya le saca las tildes a lo que escribe la persona y
 * el dato sí las tiene, buscar "caño" en el catálogo no devolvía nada, y "brazo
 * timon horquilla" tampoco encontraba el "Juego de brazo de timón y horquilla".
 *
 * Por eso lo que viaja a la base es una expresión regular (el operador imatch de
 * PostgREST) en vez de un like. No afloja la búsqueda: sobre el catálogo real
 * "bronce", "limera" y "mecha" devuelven exactamente las mismas filas que antes,
 * y "caño" pasa de 2 a 22, que son las que siempre debieron aparecer.
 */
const EQUIVALENTES = {
  a: "aáàäâ", e: "eéèëê", i: "iíìïî", o: "oóòöô", u: "uúùüû", n: "nñ", c: "cç",
};
const META_REGEX = /[.*+?^${}()|[\]\\]/g;

function patronSinTildes(token = "") {
  return [...String(token)]
    .map((ch) => {
      if (EQUIVALENTES[ch]) return `[${EQUIVALENTES[ch]}]`;
      // La coma y los paréntesis SON la sintaxis del or() de PostgREST: si
      // viajan tal cual rompen el parseo. Van como ".", cualquier carácter, y la
      // exactitud la repone el refinado del final.
      if (ch === "," || ch === "(" || ch === ")") return ".";
      return ch.replace(META_REGEX, "\\$&");
    })
    .join("");
}

/* ── Facetas (se cachean por sesión) ──────────────────────────────────────── */

let _rubrosCache = null;
let _proveedoresCache = null;

export async function fetchRubros() {
  if (_rubrosCache) return _rubrosCache;
  const { data, error } = await supabase
    .from("panol_categorias")
    .select("id,nombre")
    .order("orden", { ascending: true, nullsFirst: false })
    .order("nombre");
  if (error) return [];
  _rubrosCache = (data ?? []).map((r) => ({ id: r.id, nombre: r.nombre || "Sin nombre" }));
  return _rubrosCache;
}

// El proveedor es texto libre en panol_materiales (no hay tabla de proveedores
// enlazada), así que la lista sale de los valores usados en el catálogo. Se pide
// sólo esa columna y paginado, para que el payload sea chico.
export async function fetchProveedores() {
  if (_proveedoresCache) return _proveedoresCache;
  const vistos = new Map();
  const PAGE = 1000;
  for (let desde = 0; desde < 20000; desde += PAGE) {
    const { data, error } = await supabase
      .from("panol_materiales")
      .select("proveedor")
      .not("proveedor", "is", null)
      .neq("proveedor", "")
      .range(desde, desde + PAGE - 1);
    if (error) break;
    for (const row of data ?? []) {
      const nombre = String(row.proveedor).trim();
      if (!nombre) continue;
      const clave = normalizar(nombre);
      // Se conserva la primera grafía vista y se cuenta cuántos materiales tiene.
      const prev = vistos.get(clave);
      if (prev) prev.count += 1;
      else vistos.set(clave, { nombre, count: 1 });
    }
    if (!data || data.length < PAGE) break;
  }
  _proveedoresCache = [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return _proveedoresCache;
}

export function invalidarFacetas() {
  _rubrosCache = null;
  _proveedoresCache = null;
}

/* ── Búsqueda ─────────────────────────────────────────────────────────────── */

function tokensDe(q = "") {
  return normalizar(q)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Un or() por cada término, encadenados. PostgREST combina varios or= con AND,
 * así que la base devuelve sólo las filas que tienen TODOS los términos.
 *
 * Antes esto filtraba por un solo token -el más largo, confundiendo largo con
 * discriminante-, traía hasta 200 filas ordenadas por descripción y recién ahí
 * exigía el resto de los términos en el navegador. Con eso, lo que matcheaba de
 * verdad pero caía después de la fila 200 se perdía sin decir nada, y siempre se
 * perdía lo mismo: el final del abecedario. Hoy hay tokens que ya pasan ese
 * tope -"mm" da 228 materiales activos-, así que no era un riesgo teórico.
 */
function aplicarTexto(query, q = "") {
  for (const token of tokensDe(q)) {
    const patron = patronSinTildes(token);
    if (!patron) continue;
    query = query.or(COLUMNAS_BUSQUEDA.map((col) => `${col}.imatch.${patron}`).join(","));
  }
  return query;
}

// Busca materiales del catálogo. Todos los filtros son opcionales y se combinan.
//   q          → texto libre (descripción / código)
//   proveedores→ array de nombres exactos
//   rubros     → array de categoria_id
//   limit      → tope de filas
export async function buscarMateriales({ q = "", proveedores = [], rubros = [], limit = 60 } = {}) {
  let query = supabase.from("panol_materiales").select(SELECT_COLS).neq("activo", false);

  if (proveedores.length) query = query.in("proveedor", proveedores);
  if (rubros.length) query = query.in("categoria_id", rubros);
  query = aplicarTexto(query, q);

  // Un poco de más: el patrón manda la coma y los paréntesis como comodín, así
  // que puede traer alguna fila que el filtro de abajo descarta.
  const { data, error } = await query.order("descripcion").limit(Math.max(limit * 2, 120));
  if (error) throw error;

  // Red de seguridad sobre el término ORIGINAL, ya normalizado de los dos lados.
  const tokens = tokensDe(q);
  const filas = (data ?? []).filter((row) => {
    if (!tokens.length) return true;
    const texto = normalizar(
      `${row.descripcion ?? ""} ${row.codigo ?? ""} ${row.alias ?? ""} ${row.proveedor ?? ""}`,
    );
    return tokens.every((t) => texto.includes(t));
  });

  return filas.slice(0, limit).map((row) => ({
    id: row.id,
    categoria_id: row.categoria_id || null,
    codigo: row.codigo || "",
    descripcion: row.descripcion || "",
    alias: row.alias || "",
    proveedor: row.proveedor || "",
    unidad: row.unidad_medida || "unidad",
    precio_unitario: row.precio_unitario ?? null,
    moneda: row.moneda || "ARS",
    es_consumible: !!row.es_consumible,
  }));
}

// Cuenta cuántos materiales matchean sin traerlos (para "mostrando 60 de 340").
export async function contarMateriales({ q = "", proveedores = [], rubros = [] } = {}) {
  let query = supabase
    .from("panol_materiales")
    .select("id", { count: "exact", head: true })
    .neq("activo", false);

  if (proveedores.length) query = query.in("proveedor", proveedores);
  if (rubros.length) query = query.in("categoria_id", rubros);
  // El mismo filtro que la búsqueda, o el "mostrando 60 de 340" miente.
  query = aplicarTexto(query, q);

  const { count, error } = await query;
  if (error) return null;
  return count ?? null;
}
