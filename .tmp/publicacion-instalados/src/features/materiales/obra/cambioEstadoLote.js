/**
 * Cambiar el estado de varios renglones de una obra de una sola vez.
 *
 * Pensado sobre todo para los barcos que arrancaron antes del sistema: la lista
 * dice "Pendiente" en cosas que se compraron y se pusieron hace meses, y abrir
 * renglón por renglón para corregirlas no tiene sentido.
 *
 * "En pañol" NO se ofrece en lote a propósito: un renglón de matriz que pasa a
 * en pañol queda como recibido y SUMA su cantidad al stock del pañol
 * (panolMovimientos.rowCountsAsStock). Hecho en masa sobre un barco viejo
 * inventaría stock que no existe. Ese paso se hace de a uno o desde Ingresos.
 *
 * Pasar a "Entregado" sí es seguro: lo pendiente no aportaba stock y sigue sin
 * aportar; lo que estaba en pañol deja de sumar, que es justo el descuento que
 * corresponde. Por eso se cuentan aparte, para avisarlo antes de confirmar.
 */
export const ESTADOS_LOTE = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pedido", label: "En compras" },
  { value: "comprado", label: "Comprado" },
  { value: "egresado", label: "Entregado" },
  { value: "instalado", label: "Instalado" },
];

/**
 * "Instalado" = lo que se encontró puesto en el barco (pedido para la 52-24 y
 * 52-25, que arrancaron antes del sistema). No es un estado más de la base:
 * se guarda como egresado con esta marca en "quién lo retiró". Así cubre la
 * falta igual que un entregado, no toca el stock si estaba pendiente y no hubo
 * que cambiar la función de la base ni lo que Pañol y Compras leen del estado.
 */
export const RETIRO_INSTALADO = "Instalado en el barco";

export function esInstalado(row) {
  return String(row?.retirado_por || "").trim().toLowerCase() === RETIRO_INSTALADO.toLowerCase();
}

/** Lo que se le manda a la base para el estado elegido en pantalla. */
export function estadoParaGuardar(estado, retiradoPor = "") {
  if (estado === "instalado") return { estado: "egresado", retiradoPor: RETIRO_INSTALADO };
  return { estado, retiradoPor };
}

export function planCambioEstadoLote(rows = [], estado, estadoDe) {
  const aplicar = [];
  const yaEstan = [];
  const descuentanStock = [];
  const instalado = estado === "instalado";
  for (const row of rows) {
    const actual = estadoDe(row);
    // Un entregado se puede pasar a instalado (cambia la marca); uno instalado
    // ya está, y un entregado pasado a "Entregado" tampoco cambia nada.
    const ya = instalado ? actual === "egresado" && esInstalado(row) : actual === estado;
    if (ya) { yaEstan.push(row); continue; }
    aplicar.push(row);
    if ((estado === "egresado" || instalado) && actual === "en_panol") descuentanStock.push(row);
  }
  return { aplicar, yaEstan, descuentanStock, pideQuienRetiro: estado === "egresado" && aplicar.length > 0 };
}

/** Corre `tarea` sobre cada elemento con a lo sumo `limite` a la vez. */
export async function enParalelo(items, limite, tarea, onAvance = () => {}) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  let hechos = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      try {
        resultados[i] = { ok: true, valor: await tarea(items[i], i) };
      } catch (error) {
        resultados[i] = { ok: false, error };
      }
      hechos += 1;
      onAvance(hechos, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}
