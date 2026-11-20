/**
 * Lógica pura del archivo de remitos (sin React ni Supabase; pruebas en
 * archivoRemitos.test.mjs).
 *
 * El archivo es la misma pila de remitos mirada de tres formas —por barco, por
 * proveedor o por carpeta propia— más tres atajos: todos, sin clasificar y con
 * ingreso. Un remito puede estar en varios barcos y carpetas a la vez: aparece
 * en cada uno sin duplicarse.
 */

export const VISTAS = [
  { valor: "barco", etiqueta: "Barcos" },
  { valor: "proveedor", etiqueta: "Proveedores" },
  { valor: "carpeta", etiqueta: "Carpetas" },
];

export const TODOS = "todos";
export const SIN_CLASIFICAR = "sin_clasificar";
export const CON_INGRESO = "con_ingreso";
const SIN_LINEA = "Sin línea";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function normalizar(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const obrasDe = (r) => (r?.obras?.length ? r.obras : r?.obra ? [r.obra] : []);
export const carpetasDe = (r) => r?.carpetas || [];
export const sinClasificar = (r) => !obrasDe(r).length && !carpetasDe(r).length;
export const conIngreso = (r) => Boolean(r?.panol_envio_id);

/** Cómo se llama un remito en una fila: la referencia o el proveedor. */
export function nombreDeRemito(r = {}) {
  return String(r.titulo || r.proveedor || "").trim() || "Remito sin proveedor";
}

/** La línea de abajo: proveedor (si el nombre es la referencia), número y nota. */
export function detalleDeRemito(r = {}) {
  const partes = [];
  if (r.titulo && r.proveedor) partes.push(r.proveedor);
  partes.push(r.numero ? `Nº ${r.numero}` : "sin número");
  return partes.join(" · ");
}

/** Fecha del remito (la del papel si la hay; si no, cuándo se guardó). */
export function fechaDeRemito(r = {}) {
  const iso = String(r.fecha || r.created_at || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

export function fechaCorta(iso) {
  const f = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return "";
  return `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(2, 4)}`;
}

/** Busca por todas las palabras en proveedor, número, referencia, nota, barcos y carpetas. */
export function buscarRemitos(remitos = [], texto = "") {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  if (!palabras.length) return remitos;
  return remitos.filter((r) => {
    const pajar = normalizar([
      r.proveedor, r.numero, r.titulo, r.notas, r.archivo_nombre, r.sede,
      ...obrasDe(r).flatMap((o) => [o.codigo, o.linea_nombre]),
      ...carpetasDe(r),
    ].join(" "));
    return palabras.every((p) => pajar.includes(p));
  });
}

const porNombre = (a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true });

/**
 * Las carpetas de la columna izquierda para una vista.
 *
 * Barcos: una sección por línea ("K52") con sus barcos ("52-27"). Proveedores
 * y carpetas: una sola sección. Cada carpeta: { key, titulo, total }.
 */
export function carpetasDelArchivo(remitos = [], vista = "barco") {
  if (vista === "barco") {
    const lineas = new Map();
    for (const r of remitos) {
      for (const o of obrasDe(r)) {
        const linea = String(o.linea_nombre || "").trim() || SIN_LINEA;
        const codigo = String(o.codigo || "").trim();
        if (!codigo) continue;
        if (!lineas.has(linea)) lineas.set(linea, new Map());
        const barcos = lineas.get(linea);
        barcos.set(codigo, (barcos.get(codigo) || 0) + 1);
      }
    }
    return [...lineas.entries()]
      .map(([linea, barcos]) => ({
        titulo: linea,
        carpetas: [...barcos.entries()].map(([codigo, total]) => ({ key: `barco:${codigo}`, titulo: codigo, total })).sort(porNombre),
      }))
      .sort((a, b) => (a.titulo === SIN_LINEA) - (b.titulo === SIN_LINEA) || a.titulo.localeCompare(b.titulo, "es", { numeric: true }));
  }
  const cuenta = new Map();
  for (const r of remitos) {
    const nombres = vista === "proveedor"
      ? [String(r.proveedor || "").trim()].filter(Boolean)
      : carpetasDe(r);
    for (const n of nombres) {
      const k = normalizar(n);
      const previo = cuenta.get(k);
      cuenta.set(k, { titulo: previo?.titulo || n, total: (previo?.total || 0) + 1 });
    }
  }
  const carpetas = [...cuenta.entries()].map(([k, v]) => ({ key: `${vista}:${k}`, titulo: v.titulo, total: v.total })).sort(porNombre);
  return carpetas.length ? [{ titulo: "", carpetas }] : [];
}

/** Los remitos de una carpeta (o de un atajo). */
export function remitosDeCarpeta(remitos = [], key = TODOS) {
  if (!key || key === TODOS) return remitos;
  if (key === SIN_CLASIFICAR) return remitos.filter(sinClasificar);
  if (key === CON_INGRESO) return remitos.filter(conIngreso);
  const [tipo, ...resto] = String(key).split(":");
  const valor = resto.join(":");
  if (tipo === "barco") return remitos.filter((r) => obrasDe(r).some((o) => String(o.codigo || "") === valor));
  if (tipo === "proveedor") return remitos.filter((r) => normalizar(r.proveedor) === valor);
  if (tipo === "carpeta") return remitos.filter((r) => carpetasDe(r).some((c) => normalizar(c) === valor));
  return remitos;
}

/** Nombre de la carpeta abierta, para el título de la lista. */
export function tituloDeCarpeta(key = TODOS, grupos = []) {
  if (!key || key === TODOS) return "Todos los remitos";
  if (key === SIN_CLASIFICAR) return "Sin clasificar";
  if (key === CON_INGRESO) return "Con ingreso";
  for (const g of grupos) for (const c of g.carpetas) if (c.key === key) return c.titulo;
  return String(key).split(":").slice(1).join(":");
}

/** Los más nuevos primero, agrupados por mes ("noviembre 2026"). */
export function agruparPorMes(remitos = []) {
  const orden = [...remitos].sort((a, b) => (fechaDeRemito(b) || "").localeCompare(fechaDeRemito(a) || "")
    || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const grupos = [];
  for (const r of orden) {
    const f = fechaDeRemito(r);
    const clave = f ? f.slice(0, 7) : "sin-fecha";
    const titulo = f ? `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}` : "Sin fecha";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.remitos.push(r);
    else grupos.push({ clave, titulo, remitos: [r] });
  }
  return grupos;
}

/**
 * Con qué arranca la ventana al escanear otro remito: se hereda DÓNDE va
 * (barcos, carpetas, proveedor), porque lo normal es escanear varios del mismo
 * barco seguidos. La referencia y la nota describen a UN papel: no se heredan.
 */
export function baseParaOtroEscaneo(previo = null) {
  return {
    obras: previo?.obras || [],
    carpetas: previo?.carpetas || [],
    proveedor: previo?.proveedor || "",
    titulo: "",
    notas: "",
  };
}

/**
 * Los datos que le tocan a un archivo que apareció en la PC: los del escaneo
 * en curso sólo si el archivo no existía cuando se lanzó y es posterior (con
 * un minuto de margen). Si no, se preguntan: heredar en silencio era la causa
 * de remitos guardados en el barco equivocado.
 */
export function contextoDeArchivo(archivo, escaneo) {
  if (!escaneo || !archivo) return null;
  if ((escaneo.idsPrevios || []).includes(archivo.id)) return null;
  const cuando = new Date(archivo.updatedAt || 0).getTime();
  if (Number.isFinite(cuando) && cuando > 0 && cuando < escaneo.lanzadoEn - 60_000) return null;
  return escaneo.contexto;
}

/** Texto corto de dónde va un remito que todavía no se guardó ("55-1 + Garantías · Trimer"). */
export function destinoCorto(contexto) {
  if (!contexto) return "";
  const lugares = [...(contexto.obras || []).map((o) => o?.codigo).filter(Boolean), ...(contexto.carpetas || [])];
  const donde = lugares.length <= 2 ? lugares.join(" + ") : `${lugares.slice(0, 2).join(" + ")} +${lugares.length - 2}`;
  return [donde, contexto.proveedor].filter(Boolean).join(" · ") || "sin barco ni proveedor";
}
