import { compararListas, limpiarTexto, redondear } from "./normalizarLista.js";

export const ESTADOS_PRECIO = {
  subio: { texto: "Subió", tono: "red" },
  bajo: { texto: "Bajó", tono: "green" },
  igual: { texto: "Igual", tono: "muted" },
  nuevo: { texto: "Nuevo", tono: "blue" },
  discontinuado: { texto: "Discontinuado", tono: "violet" },
  sin_costo: { texto: "Sin costo comparable", tono: "cyan" },
};

export function puedeGestionarPrecios(profile) {
  return profile?.is_admin === true || ["admin", "compras", "tecnica"].includes(profile?.role);
}

export function numeroPrecio(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const texto = String(valor).trim();
  const n = Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
  return Number.isFinite(n) ? n : null;
}

export function pesos(valor) {
  const n = numeroPrecio(valor);
  return n == null ? "—" : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
}

export function porcentaje(valor) {
  const n = numeroPrecio(valor);
  return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

export function fechaPrecio(valor, conHora = false) {
  if (!valor) return "—";
  const fecha = new Date(conHora ? valor : `${String(valor).slice(0, 10)}T12:00:00-03:00`);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return false;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function claveNombre(nombre) {
  return limpiarTexto(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function mismoProveedor(a, b) {
  if (a?.proveedor_id && b?.proveedor_id) return a.proveedor_id === b.proveedor_id;
  const nombre = claveNombre(a?.proveedor_nombre);
  return !!nombre && nombre === claveNombre(b?.proveedor_nombre);
}

// La vigencia manda; la hora de carga desempata dos fotos del mismo día.
export function ordenarListas(a, b) {
  return String(b.vigente_desde).localeCompare(String(a.vigente_desde))
    || String(b.created_at || "").localeCompare(String(a.created_at || ""))
    || String(b.id || "").localeCompare(String(a.id || ""));
}

export function listaAnterior(listas, actual) {
  if (!actual || !fechaValida(actual.vigente_desde)) return null;
  return listas.filter((lista) => lista.id !== actual.id && mismoProveedor(lista, actual)
    && ordenarListas(lista, actual) > 0).sort(ordenarListas)[0] ?? null;
}

export function heredarMateriales(renglones, anterior = []) {
  const vinculos = new Map(anterior.map((r) => [r.codigo, r.material_id]));
  return renglones.map((r) => ({ ...r, material_id: vinculos.get(r.codigo) ?? null }));
}

export function problemasRenglon(r) {
  const problemas = [];
  if (!limpiarTexto(r.codigo)) problemas.push("Falta el código");
  if (!limpiarTexto(r.descripcion)) problemas.push("Falta la descripción");
  if (numeroPrecio(r.precio) == null || numeroPrecio(r.precio) < 0) problemas.push("Precio inválido");
  if (!["ARS", "USD"].includes(r.moneda)) problemas.push("Moneda desconocida");
  if (numeroPrecio(r.costo_ars) == null || numeroPrecio(r.costo_ars) < 0) problemas.push(r.moneda === "USD" ? "Falta un dólar válido" : "Falta el costo en pesos");
  return problemas;
}

export function compararCostos(anterior, nueva) {
  // La función compartida admite volver al precio original; esta pantalla sólo
  // compara pesos para no mezclar USD y ARS ni inventar un "igual" sin costo.
  const enPesos = (r) => ({ ...r, costo_ars: numeroPrecio(r.costo_ars), precio: null });
  const originales = new Map(nueva.map((r) => [r.codigo, r]));
  const anteriores = new Map(anterior.map((r) => [r.codigo, r]));
  return compararListas(anterior.map(enPesos), nueva.map(enPesos)).map((r) => {
    const antes = anteriores.get(r.codigo) ?? null;
    const ahora = originales.get(r.codigo) ?? null;
    const a = numeroPrecio(antes?.costo_ars);
    const n = numeroPrecio(ahora?.costo_ars);
    let estado = r.estado;
    let pct = r.pct;
    if (antes && ahora && (a == null || n == null || a < 0 || n < 0)) {
      estado = "sin_costo";
      pct = null;
    } else if (antes && ahora && a === 0) {
      estado = n > 0 ? "subio" : "igual";
      pct = n === 0 ? 0 : null;
    }
    return { ...r, estado, pct, antes: a, ahora: n, anterior: antes, nuevo: ahora };
  });
}

export function resumenComparacion(filas) {
  const cantidades = Object.fromEntries(Object.keys(ESTADOS_PRECIO).map((estado) => [estado, 0]));
  for (const fila of filas) cantidades[fila.estado] += 1;
  const aumentos = filas.filter((f) => f.estado === "subio" && numeroPrecio(f.pct) != null).map((f) => f.pct).sort((a, b) => a - b);
  const mitad = Math.floor(aumentos.length / 2);
  const mediana = aumentos.length ? (aumentos.length % 2 ? aumentos[mitad] : (aumentos[mitad - 1] + aumentos[mitad]) / 2) : null;
  return { ...cantidades, mediana, aumentosConPorcentaje: aumentos.length };
}

export function filtrarComparacion(filas, { busqueda = "", estado = "todos", orden = "codigo", descendente = false } = {}) {
  const buscar = claveNombre(busqueda);
  return filas.filter((f) => (estado === "todos" || estado === f.estado)
    && claveNombre(`${f.codigo} ${f.descripcion} ${f.medida || ""}`).includes(buscar)).sort((a, b) => {
    const va = a[orden];
    const vb = b[orden];
    // Los valores desconocidos van al final en las dos direcciones.
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
    const diferencia = ["antes", "ahora", "pct"].includes(orden) ? va - vb : String(va).localeCompare(String(vb), "es", { numeric: true });
    return (descendente ? -1 : 1) * diferencia || a.codigo.localeCompare(b.codigo, "es", { numeric: true });
  });
}

export function armarItemsLista(renglones, listaId, anterior = []) {
  return heredarMateriales(renglones, anterior).map((r) => ({
    lista_id: listaId, codigo: r.codigo, descripcion: r.descripcion, medida: r.medida,
    precio: r.precio, moneda: r.moneda, condicion: r.condicion,
    costo_ars: r.costo_ars, unidad_compra: r.unidad_compra, contenido: r.contenido,
    material_id: r.material_id,
  }));
}

export function planDeCostos(items, configs, materiales) {
  const porMaterial = new Map(configs.map((c) => [c.material_id, c]));
  const consumibles = new Set(materiales.filter((m) => m.es_consumible).map((m) => m.id));
  const vistos = new Set();
  const repetidos = new Set();
  const actualizaciones = [];
  const omitidos = [];
  for (const item of items) {
    if (!item.material_id) continue;
    if (vistos.has(item.material_id)) repetidos.add(item.material_id);
    vistos.add(item.material_id);
    const costo = numeroPrecio(item.costo_ars);
    const config = porMaterial.get(item.material_id);
    const factor = numeroPrecio(config?.factor_compra);
    if (!item.id || costo == null || costo < 0 || !consumibles.has(item.material_id)
      || (config?.factor_compra != null && !(factor > 0))) {
      omitidos.push(item);
      continue;
    }
    const unitario = redondear(costo / (factor ?? 1), 4);
    if (!Number.isFinite(unitario)) {
      omitidos.push(item);
      continue;
    }
    actualizaciones.push({ material_id: item.material_id, codigo: item.codigo,
      costo_unitario_ars: unitario, costo_lista_item_id: item.id, factor_compra: factor,
      sin_factor: factor == null });
  }
  // Dos códigos para el mismo producto requieren elegir en Catálogo: el orden
  // del Excel nunca decide qué precio termina vigente.
  return { actualizaciones: actualizaciones.filter((r) => !repetidos.has(r.material_id)),
    repetidos: [...repetidos], omitidos };
}
