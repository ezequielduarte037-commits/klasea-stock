// Datos y reglas de Maderas. Sin componentes (así Vite puede refrescar las
// pantallas en caliente).
//
// Tablas: `materiales` (catálogo con stock_actual), `movimientos` (delta con
// signo: + entra, − sale), `pedidos` + `pedido_items` (lo que se pide y lo que
// va llegando). Cada pedido nuevo sale a la vez a Compras.

import { claveObra, construirObras, num } from "@/features/laminacion/obras";

// Lugar de stock: es el destino que reciben Compras y los pedidos sin obra.
export const STOCK_MADERAS = "Stock Chubut 2120";

// ── Movimientos ────────────────────────────────────────────────────────────
export function movDelta(m = {}) {
  if (m.delta != null && m.delta !== "") return num(m.delta);
  const cantidad = num(m.cantidad);
  const tipo = String(m.tipo || "").toLowerCase();
  if (tipo === "ingreso" || tipo === "entrada") return cantidad;
  if (tipo === "egreso" || tipo === "salida") return -cantidad;
  return 0;
}

// La columna `tipo` casi siempre dice "AJUSTE" (es el valor por defecto de la
// tabla), así que manda el signo. Los conteos de inventario se guardan con la
// obra "AJUSTE", y hubo correcciones cargadas como salida con "ajuste stock"
// en la persona o la nota (−410 tablones de Toona, por ejemplo): todo eso es
// ajuste y no cuenta como consumo.
const ES_AJUSTE = /\bajuste (de )?(stock|inventario)\b|error al ingresar/i;
export function movTipo(m = {}) {
  if (/^ajuste$/i.test(String(m.obra || "").trim())) return "ajuste";
  if (ES_AJUSTE.test(String(m.usuario || "")) || ES_AJUSTE.test(movObs(m))) return "ajuste";
  const tipo = String(m.tipo || "").toLowerCase();
  if (tipo === "ingreso" || tipo === "entrada") return "ingreso";
  if (tipo === "egreso" || tipo === "salida") return "egreso";
  return movDelta(m) >= 0 ? "ingreso" : "egreso";
}

export function movCantidad(m = {}) {
  return Math.abs(movDelta(m));
}

// Quién se llevó el material. NO cae en entregado_por: ése es el usuario del
// sistema que registró la salida (la cuenta del pañol) y ponerlo acá hacía que
// el historial dijera que "PANOL1" retiró las maderas.
export function movPersona(m = {}) {
  return m.nombre_persona || m.usuario || m.recibe || "";
}

export function movEntregadoPor(m = {}) {
  return m.entregado_por || "";
}

export function movObs(m = {}) {
  return m.observaciones || m.obs || m.observacion || "";
}

// La tabla no tiene fecha propia: si el movimiento se cargó con otra fecha, va
// en las observaciones como "Fecha operativa: AAAA-MM-DD".
export function movFecha(m = {}) {
  const operativa = movObs(m).match(/Fecha operativa: (\d{4}-\d{2}-\d{2})/);
  return operativa ? operativa[1] : (m.created_at || "");
}

// Observaciones para mostrar: sin la marca interna del renglón de pedido ni la
// fecha operativa (que ya se ve en la columna Fecha).
export function obsVisible(obs) {
  return String(obs || "")
    .split(" · ")
    .filter((parte) => parte && !/^pedido_item:/.test(parte) && !/^Fecha operativa:/.test(parte))
    .join(" · ");
}

// Hay egresos viejos con "." como persona: es un hueco, no un nombre.
export function personaVisible(texto) {
  const t = String(texto || "").trim();
  return /^[.\-–—]*$/.test(t) ? "" : t;
}

// ── Obras ──────────────────────────────────────────────────────────────────
// La misma lista que Laminación (de Producción), pero se guarda el código tal
// como está en Producción ("55-2", "HUNTER-H-174"): así se vienen guardando los
// egresos de maderas y así los vincula a la obra el trigger de la base.
export function obrasDeMaderas(produccion = []) {
  const porId = new Map(produccion.map((p) => [p.id, p]));
  return construirObras({ produccion }).map((o) => {
    const po = porId.get(o.poId);
    return po ? { ...o, valor: po.codigo, soloStock: Boolean(po.solo_stock) } : o;
  });
}

// Destinos que no son obras y se repiten (Chubut, Pampa, Varios…).
export function destinosFrecuentes(movimientos, obras, { minimo = 3, maximo = 6 } = {}) {
  const cuenta = new Map();
  for (const m of movimientos || []) {
    if (movTipo(m) !== "egreso") continue;
    const texto = String(m.obra || m.destino || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!texto || /AJUSTE|TEST|PRUEBA|STCOK/.test(texto)) continue;
    if (/^K\d+$/.test(texto)) continue;
    const clave = claveObra(texto);
    if (obras.some((o) => o.clave === clave) || /^(\d{2,3}[-.]\d+|[HA]\d+)$/.test(clave)) continue;
    cuenta.set(texto, (cuenta.get(texto) || 0) + 1);
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n >= minimo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo)
    .map(([texto, n]) => ({ valor: texto, label: texto.charAt(0) + texto.slice(1).toLowerCase(), detalle: `${n} egresos` }));
}

// ── Pedidos ────────────────────────────────────────────────────────────────
// Estados del pedido que todavía esperan mercadería.
export const PEDIDO_ABIERTO = new Set(["pedido", "transito", "parcial", "pendiente", "solicitada", "aprobada", "en_camino", "comprado", "enviado"]);

export function itemTotal(item) {
  return num(item?.cantidad);
}

// Lo recibido. Un renglón con nota de recepción y sin cantidad es de antes de
// que existiera cantidad_recibida: se dio por recibido entero.
export function itemRecibido(item) {
  const total = itemTotal(item);
  const recibida = num(item?.cantidad_recibida);
  if (item?.nota_recepcion && recibida <= 0) return total;
  return Math.min(recibida, total);
}

export function itemFalta(item) {
  return Math.max(0, itemTotal(item) - itemRecibido(item));
}

export function itemPendiente(item) {
  return !item?.nota_recepcion && itemFalta(item) > 0;
}

// "Obra: 55-5" → "55-5"; "Stock" → null.
export function obraDeCategoria(categoria) {
  const m = String(categoria || "").match(/^Obra:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

// Estado que se ve del pedido, armado con sus renglones: el de la cabecera se
// tocaba a mano y quedaba desfasado (hay uno "parcial" con todo recibido).
export function estadoPedido(pedido, items = []) {
  const total = items.length;
  const completos = items.filter((it) => !itemPendiente(it)).length;
  const conAlgo = items.filter((it) => itemRecibido(it) > 0).length;
  const abierto = PEDIDO_ABIERTO.has(String(pedido?.estado || "").toLowerCase());
  // Hay pedidos viejos sin renglones: no esperan nada.
  if (!total) return { clave: abierto ? "pendiente" : "recibido", label: "Sin materiales", tono: "neutro", completos, total };
  if (completos === total) return { clave: "recibido", label: "Recibido", tono: "verde", completos, total };
  if (!abierto) {
    return { clave: "cerrado", label: "Cerrado sin completar", tono: "neutro", completos, total };
  }
  if (conAlgo > 0) return { clave: "parcial", label: `Parcial · ${completos}/${total}`, tono: "violeta", completos, total };
  return { clave: "pendiente", label: "Esperando", tono: "cian", completos, total };
}

// Destinos de un pedido, en el orden del mail: obras primero, stock al final.
export function destinosDePedido(items = []) {
  const obras = [];
  let stock = false;
  for (const it of items) {
    const obra = obraDeCategoria(it.categoria);
    if (obra) { if (!obras.includes(obra)) obras.push(obra); }
    else stock = true;
  }
  return { obras, stock };
}

// Estados de Compras: mismos colores que en Compras.
export const ESTADO_COMPRAS = {
  nuevo: { label: "Compras: nuevo", tono: "azul" },
  en_revision: { label: "Compras: en revisión", tono: "violeta" },
  cotizando: { label: "Compras: cotizando", tono: "cian" },
  comprado: { label: "Compras: comprado", tono: "naranja" },
  recibido: { label: "Compras: recibido", tono: "verde" },
  cancelado: { label: "Compras: cancelado", tono: "rojo" },
};

// ── Mail al proveedor (mismo formato que los mails de siempre) ────────────
//   grupos = [{ nombre: "55-5", destino: "Chubut 2120", items: [...] }]
//   stockItems = [{ descripcion, cantidad, unidad }]
export function textoMail({ grupos = [], stockItems = [], destinatario = "" }) {
  let txt = `${destinatario.trim() || "David"},\n\n`;
  txt += "te detallo las maderas requeridas:\n";
  for (const g of grupos) {
    const items = g.items.filter((it) => String(it.descripcion || "").trim());
    if (!items.length) continue;
    txt += `\n${g.nombre || "Obra"}\n`;
    for (const it of items) {
      const cant = it.cantidad ? `${it.cantidad} ` : "";
      const u = String(it.unidad || "").trim() ? `${String(it.unidad).trim()} ` : "";
      txt += `- ${cant}${u}${it.descripcion}\n`;
    }
    if (String(g.destino || "").trim()) txt += `(Recibir en ${String(g.destino).trim()})\n`;
  }
  const deStock = stockItems.filter((it) => String(it.descripcion || "").trim());
  if (deStock.length) {
    txt += "\nStock\n";
    for (const it of deStock) {
      const cant = it.cantidad ? `${it.cantidad} ` : "";
      const u = String(it.unidad || "").trim() ? `${String(it.unidad).trim()} ` : "";
      txt += `${cant}${u}${it.descripcion}\n`;
    }
  }
  return txt;
}

// El mail de un pedido ya hecho, armado con sus renglones.
export function textoMailDePedido(items = []) {
  const grupos = [];
  const stockItems = [];
  for (const it of items) {
    const obra = obraDeCategoria(it.categoria);
    const linea = { descripcion: it.descripcion, cantidad: num(it.cantidad), unidad: it.unidad };
    if (!obra) { stockItems.push(linea); continue; }
    let g = grupos.find((x) => x.nombre === obra);
    if (!g) { g = { nombre: obra, destino: "", items: [] }; grupos.push(g); }
    g.items.push(linea);
  }
  return textoMail({ grupos, stockItems });
}

// ── Consumo (para sugerir reposición) ─────────────────────────────────────
export const VENTANA_SEMANAS = 16;

// Consumo semanal de cada material en las últimas 16 semanas, sin ajustes de
// inventario. `ahora` se pasa de afuera para que el cálculo sea puro.
export function consumoPorMaterial(movimientos, ahora) {
  const corte = ahora - VENTANA_SEMANAS * 7 * 864e5;
  const porMaterial = new Map();
  let primero = ahora;
  for (const m of movimientos || []) {
    if (!m.material_id) continue;
    const t = new Date(m.created_at).getTime();
    if (!Number.isFinite(t) || t < corte) continue;
    if (t < primero) primero = t;
    if (movTipo(m) !== "egreso") continue;
    const fila = porMaterial.get(m.material_id) || { total: 0, semanas: new Map() };
    const cant = movCantidad(m);
    fila.total += cant;
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // al lunes
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    fila.semanas.set(k, (fila.semanas.get(k) || 0) + cant);
    porMaterial.set(m.material_id, fila);
  }
  const semanasObservadas = Math.max(1, (ahora - primero) / (7 * 864e5));
  const res = new Map();
  for (const [id, fila] of porMaterial) {
    const porSemana = [...fila.semanas.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([semana, cantidad]) => ({ semana, cantidad, label: `${semana.slice(8, 10)}/${semana.slice(5, 7)}` }));
    res.set(id, { semanal: fila.total / semanasObservadas, total: fila.total, porSemana, semanasObservadas });
  }
  return res;
}
