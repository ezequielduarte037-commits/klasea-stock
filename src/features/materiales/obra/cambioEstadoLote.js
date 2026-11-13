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
];

export function planCambioEstadoLote(rows = [], estado, estadoDe) {
  const aplicar = [];
  const yaEstan = [];
  const descuentanStock = [];
  for (const row of rows) {
    const actual = estadoDe(row);
    if (actual === estado) { yaEstan.push(row); continue; }
    aplicar.push(row);
    if (estado === "egresado" && actual === "en_panol") descuentanStock.push(row);
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
