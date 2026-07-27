import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de catálogo con facetas (proveedor / rubro) para el selector de
// materiales. Es server-side a propósito: el catálogo pasa los miles de filas y
// bajarlo entero en cada apertura era la espera larga que ya se sacó de pañol.
//
// Las listas de filtros (proveedores y rubros) sí se cachean en memoria: son
// chicas, cambian poco y las necesitan todos los desplegables.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_COLS = "id,categoria_id,codigo,descripcion,proveedor,unidad_medida,precio_unitario,moneda,activo";

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "un", "una"]);

// Saca tildes y baja a minúsculas para que "cañería" matchee "caneria".
export function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Los comodines y separadores de PostgREST rompen el parseo del .or().
function escaparIlike(valor = "") {
  return String(valor).replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
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

// Busca materiales del catálogo. Todos los filtros son opcionales y se combinan.
//   q          → texto libre (descripción / código)
//   proveedores→ array de nombres exactos
//   rubros     → array de categoria_id
//   limit      → tope de filas
export async function buscarMateriales({ q = "", proveedores = [], rubros = [], limit = 60 } = {}) {
  const termino = normalizar(q);
  let query = supabase.from("panol_materiales").select(SELECT_COLS).neq("activo", false);

  if (proveedores.length) query = query.in("proveedor", proveedores);
  if (rubros.length) query = query.in("categoria_id", rubros);

  if (termino) {
    const tokens = termino.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    // El token más largo suele ser el más discriminante: filtra en la base y
    // el resto de los tokens se afinan acá abajo sobre pocos candidatos.
    const pick = escaparIlike([...tokens].sort((a, b) => b.length - a.length)[0] || termino);
    if (pick) query = query.or(`descripcion.ilike.%${pick}%,codigo.ilike.%${pick}%`);
  }

  // Se pide de más porque el refinado por tokens de abajo descarta filas.
  const { data, error } = await query.order("descripcion").limit(Math.max(limit * 4, 200));
  if (error) throw error;

  const tokens = termino.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  const filas = (data ?? []).filter((row) => {
    if (!tokens.length) return true;
    const texto = normalizar(`${row.descripcion ?? ""} ${row.codigo ?? ""} ${row.proveedor ?? ""}`);
    return tokens.every((t) => texto.includes(t));
  });

  return filas.slice(0, limit).map((row) => ({
    id: row.id,
    categoria_id: row.categoria_id || null,
    codigo: row.codigo || "",
    descripcion: row.descripcion || "",
    proveedor: row.proveedor || "",
    unidad: row.unidad_medida || "unidad",
    precio_unitario: row.precio_unitario ?? null,
    moneda: row.moneda || "ARS",
  }));
}

// Cuenta cuántos materiales matchean sin traerlos (para "mostrando 60 de 340").
export async function contarMateriales({ q = "", proveedores = [], rubros = [] } = {}) {
  const termino = normalizar(q);
  let query = supabase
    .from("panol_materiales")
    .select("id", { count: "exact", head: true })
    .neq("activo", false);

  if (proveedores.length) query = query.in("proveedor", proveedores);
  if (rubros.length) query = query.in("categoria_id", rubros);
  if (termino) {
    const tokens = termino.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const pick = escaparIlike([...tokens].sort((a, b) => b.length - a.length)[0] || termino);
    if (pick) query = query.or(`descripcion.ilike.%${pick}%,codigo.ilike.%${pick}%`);
  }

  const { count, error } = await query;
  if (error) return null;
  return count ?? null;
}
