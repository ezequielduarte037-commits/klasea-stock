/**
 * Lógica pura de la pantalla de Pedidos (sin React ni Supabase; pruebas en
 * pedidosLogica.test.mjs).
 *
 * Un pedido es un panol_envios con sus renglones. La bandeja muestra qué falta
 * recibir; la ficha muestra cada renglón con lo pedido, lo que llegó y su
 * estado. Recibir se hace en el mostrador de ingresos.
 */

import { cuentasDelRenglon } from "../ingresos/ingresosLogica.js";

export const ESTADOS_PROBLEMA = new Set(["sin_info", "falta_stock", "rechazado"]);
const CERRADOS = new Set(["recibido", "cerrado", "cancelado"]);
const PRIORIDAD = { urgente: 4, alta: 3, media: 2, baja: 1 };

export const FILTROS = [
  { valor: "por_recibir", etiqueta: "Por recibir" },
  { valor: "novedades", etiqueta: "Con novedades" },
  { valor: "recibidos", etiqueta: "Recibidos" },
  { valor: "todos", etiqueta: "Todos" },
];

export const ESTADO_PEDIDO = {
  borrador: "Borrador",
  enviado: "En camino",
  en_preparacion: "En preparación",
  parcial: "Llegó una parte",
  recibido: "Recibido",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

export const ESTADO_RENGLON = {
  pendiente: "Falta",
  parcial: "Llegó una parte",
  recibido: "Recibido",
  sin_info: "Falta información",
  falta_stock: "Llega después",
  rechazado: "Rechazado",
};

export function normalizar(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Cuántos renglones hay en cada situación. */
export function resumenDelPedido(items = []) {
  const r = { total: items.length, recibidos: 0, parciales: 0, pendientes: 0, novedades: 0 };
  for (const it of items) {
    if (it.estado === "recibido") r.recibidos += 1;
    else if (it.estado === "parcial") r.parciales += 1;
    else if (ESTADOS_PROBLEMA.has(it.estado)) r.novedades += 1;
    else r.pendientes += 1;
  }
  r.faltan = r.pendientes + r.parciales;
  r.completo = r.total > 0 && r.recibidos === r.total;
  return r;
}

/** Todavía espera algo: no está cerrado y le falta algún renglón (o no tiene ninguno). */
export function porRecibir(envio = {}) {
  if (CERRADOS.has(envio.estado)) return false;
  const r = resumenDelPedido(envio.items || []);
  if (r.completo) return false;
  return r.total === 0 || r.faltan > 0 || r.novedades > 0;
}

export function conNovedades(envio = {}) {
  return !["cerrado", "cancelado"].includes(envio.estado) && resumenDelPedido(envio.items || []).novedades > 0;
}

export function recibido(envio = {}) {
  return envio.estado === "recibido" || envio.estado === "cerrado" || (envio.estado !== "cancelado" && resumenDelPedido(envio.items || []).completo);
}

const PRUEBA = { por_recibir: porRecibir, novedades: conNovedades, recibidos: recibido, todos: () => true };

export function filtrarPedidos(envios = [], filtro = "por_recibir") {
  return envios.filter(PRUEBA[filtro] || PRUEBA.todos);
}

export function cuentasDeFiltros(envios = []) {
  return Object.fromEntries(FILTROS.map((f) => [f.valor, filtrarPedidos(envios, f.valor).length]));
}

/** Por título, obra, destino, sede, observaciones y lo que trae cada renglón. */
export function buscarPedidos(envios = [], texto = "") {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  if (!palabras.length) return envios;
  return envios.filter((e) => {
    const pajar = normalizar([
      e.titulo, e.obra?.codigo, e.destino, e.sede, e.observaciones,
      ...(e.items || []).flatMap((it) => [it.descripcion, it.codigo]),
    ].join(" "));
    return palabras.every((p) => pajar.includes(p));
  });
}

/**
 * Orden de la bandeja. Lo que espera: urgente primero, después lo que tiene
 * novedades, después lo más viejo (lo que hace más que espera). Lo demás: lo
 * más nuevo arriba.
 */
export function ordenarPedidos(envios = [], filtro = "por_recibir") {
  const lista = [...envios];
  if (filtro === "por_recibir" || filtro === "novedades") {
    return lista.sort((a, b) => (PRIORIDAD[b.prioridad] || 0) - (PRIORIDAD[a.prioridad] || 0)
      || resumenDelPedido(b.items || []).novedades - resumenDelPedido(a.items || []).novedades
      || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }
  return lista.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

/** Los renglones con sus cuentas, ordenados: lo que falta arriba. */
export function renglonesDelPedido(items = []) {
  const peso = (e) => (ESTADOS_PROBLEMA.has(e) ? 0 : e === "pendiente" ? 1 : e === "parcial" ? 2 : 3);
  return items
    .map((it) => {
      const c = cuentasDelRenglon(it);
      // Lo que de este renglón ya es stock (el stock cuenta recibido y parcial;
      // un recibido sin cantidad cargada cuenta entero).
      const enStock = it.estado === "recibido" ? (c.llego || c.pedido || 1) : it.estado === "parcial" ? c.llego : 0;
      return { ...it, ...c, enStock };
    })
    .sort((a, b) => peso(a.estado) - peso(b.estado) || String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true }));
}

export const FILTROS_RENGLON = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "faltan", etiqueta: "Faltan" },
  { valor: "recibidos", etiqueta: "Recibidos" },
  { valor: "novedades", etiqueta: "Novedades" },
];

const PRUEBA_RENGLON = {
  todos: () => true,
  faltan: (r) => r.estado === "pendiente" || r.estado === "parcial",
  recibidos: (r) => r.estado === "recibido",
  novedades: (r) => ESTADOS_PROBLEMA.has(r.estado),
};

export function filtrarRenglones(renglones = [], filtro = "todos", texto = "") {
  const palabras = normalizar(texto).split(" ").filter(Boolean);
  return renglones.filter((r) => (PRUEBA_RENGLON[filtro] || PRUEBA_RENGLON.todos)(r)
    && (!palabras.length || palabras.every((p) => normalizar([r.descripcion, r.codigo, r.variante, r.nota, r.obra_codigo].join(" ")).includes(p))));
}

export function cuentasDeRenglones(renglones = []) {
  return Object.fromEntries(FILTROS_RENGLON.map((f) => [f.valor, filtrarRenglones(renglones, f.valor).length]));
}

/** "2 de 4", "4", "llegaron 2 de 4". */
export function cantidadTexto(r = {}) {
  const u = String(r.unidad || "").trim();
  const unidad = !u || ["u", "un", "unidad", "unidades"].includes(u.toLowerCase()) ? "" : ` ${u}`;
  if (r.pedido == null) return String(r.cantidad || "—");
  if (r.estado === "parcial" || (r.llego > 0 && r.llego < r.pedido)) return `${fmt(r.llego)} de ${fmt(r.pedido)}${unidad}`;
  return `${fmt(r.pedido)}${unidad}`;
}

function fmt(n) {
  return String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");
}

/**
 * Qué se puede hacer al corregir un renglón: con cantidad recibida > 0 el
 * estado es recibido o parcial (el stock cuenta sólo esos dos); volver a
 * pendiente saca del stock lo que entró y por eso se avisa.
 */
export function correccionDeRenglon(r = {}, { estado, cantidad }) {
  const pedido = r.pedido;
  const n = cantidad === "" || cantidad == null ? null : Number(String(cantidad).replace(",", "."));
  const enStock = r.enStock ?? r.llego ?? 0;
  if (estado === "pendiente") return { estado: "pendiente", cantidadRecibida: null, sacaDelStock: enStock > 0 };
  if (n == null || !Number.isFinite(n) || n <= 0) return { error: "Falta cuántos llegaron." };
  const completo = pedido == null || n >= pedido - 0.0001;
  return { estado: completo ? "recibido" : "parcial", cantidadRecibida: fmt(n).replace(",", "."), sacaDelStock: n < enStock };
}
