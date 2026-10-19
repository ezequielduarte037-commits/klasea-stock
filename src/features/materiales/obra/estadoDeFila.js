/**
 * Estado y cantidades de un renglón de la lista de una obra.
 *
 * Vive fuera de MaterialesScreen para poder probarlo: es la cuenta que decide
 * si la lista dice COMPRAR, RETIRAR o LISTO.
 */
import { rowDelta, rowIsAnulado } from "../../panol/panolMovimientos.js";

function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function estadoFromRecepcion(estado) {
  // Avisado a Pañol todavía no significa recibido. Solo una confirmación total
  // o parcial acredita que el material entró físicamente.
  if (["recibido", "parcial"].includes(String(estado || "").toLowerCase())) return "en_panol";
  return null;
}

// El recorrido de un material en la obra sólo avanza: se pide, se compra, entra
// a pañol, sale. El estado de recepción cuenta una parte de esa historia y se
// queda congelado en "recibido" para siempre —porque efectivamente se recibió—,
// así que no puede mandar sobre el estado real: si lo hace, un material ya
// entregado sigue figurando "En pañol" el resto de su vida.
const ORDEN_ESTADO_OBRA = { pendiente: 0, pedido: 1, comprado: 2, en_panol: 3, egresado: 4 };

function normalizarEstadoObra(estado) {
  if (estado === "egresado") return "egresado";
  if (estado === "pedido") return "pedido";
  if (estado === "comprado") return "comprado";
  if (["en_panol", "recibido", "parcial", "problema", "sin_info", "falta_stock", "rechazado"].includes(estado)) return "en_panol";
  return "pendiente";
}

// Lo que dice el renglón por sí mismo, sin contar el conteo físico.
function estadoDelRenglon(row) {
  // Una fecha de egreso es un hecho: alguien se lo llevó y quedó registrado.
  // Vale más que cualquier estado, que puede haber quedado sin actualizar.
  if (row?.egreso_at) return "egresado";
  // Un movimiento de egreso contra este material también es un hecho, aunque
  // haya quedado en una fila aparte sin tocar la del requerimiento.
  if ((toNum(row?.egresadoLedger) || 0) > 0) return "egresado";
  const propio = normalizarEstadoObra(row?.estadoObra);
  const porRecepcion = normalizarEstadoObra(estadoFromRecepcion(row?.recepcion_estado));
  return ORDEN_ESTADO_OBRA[propio] >= ORDEN_ESTADO_OBRA[porRecepcion] ? propio : porRecepcion;
}

export function estadoObraForRow(row) {
  const propio = estadoDelRenglon(row);
  // Lo que el conteo físico dejó en pañol para la obra, o lo que ya se retiró
  // de ahí, también es un hecho registrado. Sólo puede hacer avanzar el estado.
  const porConteo = (toNum(row?.entregadoConteo) || 0) > 0
    ? "egresado"
    : (toNum(row?.panolLedger) || 0) > 0 ? "en_panol" : "pendiente";
  return ORDEN_ESTADO_OBRA[porConteo] > ORDEN_ESTADO_OBRA[propio] ? porConteo : propio;
}

// Las cuatro cantidades de un material en la obra, calculadas SÓLO con
// evidencia: lo que se recibió en pañol y lo que se egresó quedan registrados,
// el estado escrito a mano no cuenta como prueba de nada.
//
// De ahí salen los dos faltantes, que no son el mismo problema:
//   · falta comprar  → no hay pedido enganchado. Se compra.
//   · falta entregar → ya está en pañol pero la obra no lo tiene. Se va a buscar.
export function cantidadesDeFila(row) {
  const necesita = Math.max(0, toNum(row?.cantidad) || 0);
  // El conteo físico se suma aparte y con sus cantidades reales: si entrara
  // por el estado, una obra con 2 de 3 contados figuraría con las 3.
  const estado = estadoDelRenglon(row);

  // Lo recibido viene como texto libre en el campo de recepción ("12", "12 u").
  // Si no se puede leer un número pero la fila cuenta como recibida, se asume
  // completa: es lo que la pantalla venía mostrando y no conviene contradecirla
  // sin dato mejor.
  const recibidoDeclarado = toNum(String(row?.recepcion_cantidad_recibida ?? "").replace(",", "."));
  const llego = estado === "en_panol" || estado === "egresado";
  const panolRenglon = llego ? (Number.isFinite(recibidoDeclarado) && recibidoDeclarado > 0 ? recibidoDeclarado : necesita) : 0;

  // Lo que el conteo físico asignó a la obra: lo que sigue en pañol más lo que
  // ya se retiró de ahí.
  const panolConteo = Math.max(0, toNum(row?.panolLedger) || 0);
  const entregadoConteo = Math.max(0, toNum(row?.entregadoConteo) || 0);
  const panol = panolRenglon + panolConteo + entregadoConteo;

  // Los movimientos mandan. El fallback a "se entregó todo" queda sólo para las
  // filas viejas que se marcaron como egresadas sin anotar cuánto.
  const egresadoLedger = Math.max(0, toNum(row?.egresadoLedger) || 0);
  const egresadoDeclarado = Math.max(0, toNum(row?.cantidad_egresada) || 0);
  const entregadoRenglon = egresadoLedger > 0
    ? egresadoLedger
    : (estado === "egresado" ? (egresadoDeclarado > 0 ? egresadoDeclarado : necesita) : 0);
  const entregado = entregadoRenglon + entregadoConteo;

  // Acá el estado escrito a mano SÍ vale, y es la única excepción a la regla.
  // Motivo: "está en compras" no tiene evidencia dura posible —no existe un
  // hecho registrable que lo pruebe— y si lo ignoramos, un ítem ya enviado
  // vuelve a decir COMPRAR y termina comprado dos veces. Ojo con lo que NO
  // hace: no dice que esté comprado ni recibido; esos siguen exigiendo prueba.
  const enviadoACompras = estado === "pedido" || estado === "comprado";
  const tienePedido = !!(row?.purchase_request_id || row?.purchase_request_item_id) || enviadoACompras;
  const cubierto = Math.max(panol, entregado);
  const faltaComprar = tienePedido || cubierto >= necesita ? 0 : Math.max(0, necesita - cubierto);
  const faltaEntregar = Math.max(0, Math.min(panol, necesita) - entregado);
  const enCompras = tienePedido && cubierto < necesita ? Math.max(0, necesita - cubierto) : 0;

  return { necesita, panol, entregado, faltaComprar, faltaEntregar, enCompras, tienePedido };
}

function esFilaDelConteo(row) {
  const source = String(row?.source || "").toLowerCase();
  const tipo = String(row?.snapshot_tipo || "").toLowerCase();
  if (source.includes("reversion") || tipo.includes("reversion")) return false;
  return source === "conteo_fisico" || tipo === "conteo_fisico";
}

/**
 * Qué aporta a la obra una fila que la lista no mezcla con el requerimiento
 * (conteo físico, egresos, traslados). Recibe la fila como la arma
 * snapshotRowToView.
 *
 *   · panol: cuánto suma o resta al saldo de la obra en pañol, con la misma
 *     cuenta que usa Pañol (rowDelta). Sumado por material da lo que el
 *     conteo dejó en el estante después de egresos, traslados y reversiones.
 *   · entregadoConteo: lo retirado del conteo. Ese retiro no crea una fila de
 *     egreso: si se lleva todo, la misma fila pasa a "egresado"; si se lleva
 *     una parte, queda una fila historial_retiro_parcial que hereda el tipo
 *     del conteo. Un retiro revertido queda marcado [anulado] y no cuenta.
 *
 * El conteo físico inicial del 10/07/2026 cargó stock ya asignado a cada obra
 * y la lista lo ignoraba: pedía COMPRAR cosas que Pañol tenía asignadas a la
 * obra (el GHS 11 del 55-1 y un centenar más).
 */
export function aporteDeFilaLedger(row) {
  const recibido = toNum(String(row?.recepcion_cantidad_recibida ?? "").replace(",", "."));
  const cantidad = row?.soloMovimientoDeMatriz && recibido != null && recibido >= 0
    ? Math.min(Math.max(0, toNum(row?.cantidad) || 0), recibido)
    : row?.cantidad;
  const panol = rowDelta({
    source: row?.source,
    estado: row?.snapshot_estado,
    recepcion_estado: row?.recepcion_estado,
    cantidad,
    cantidad_egresada: row?.cantidad_egresada,
  });
  const retiradoDelConteo = esFilaDelConteo(row)
    && String(row?.snapshot_estado || "").toLowerCase() === "egresado"
    && !rowIsAnulado({ notas: row?.obs, egreso_nota: row?.egreso_nota, source: row?.source, recepcion_nota: row?.recepcion_nota });
  const entregadoConteo = retiradoDelConteo ? Math.max(0, toNum(row?.cantidad) || 0) : 0;
  return { panol, entregadoConteo };
}
