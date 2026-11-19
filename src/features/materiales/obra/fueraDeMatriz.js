/**
 * Un material fuera de matriz no tiene un renglón que pida una cantidad: sólo
 * tiene los ingresos que le hicieron (remitos, compras) y sus retiros. La lista
 * los fusionaba eligiendo UNO, y el resto desaparecía.
 *
 * Caso 52-25, 19/11/2026: un remito de 2 cámaras Hikvision, con 1 retirada al
 * minuto, se veía "Rec. 1 · Entr. 1". Se cargó otro ingreso de 1 creyendo que
 * faltaba, y la lista pasó a mostrar sólo ese: "Rec. 1 · Entr. 0".
 *
 * Acá se suman todos: lo recibido sale de cada ingreso y lo entregado de lo que
 * cada ingreso anota como egresado. Las filas hijas de un retiro parcial
 * (historial_retiro_parcial) no suman nada: su madre ya cuenta ese retiro en
 * `cantidad_egresada`.
 */
import { rowIsAnulado } from "../../panol/panolMovimientos.js";
import { cantidadesDeFila } from "./estadoDeFila.js";

function toNum(v) {
  if (v === "" || v == null) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function esHijaDeRetiro(row) {
  return String(row?.source || "").toLowerCase() === "historial_retiro_parcial";
}

function anulada(row) {
  return rowIsAnulado({ notas: row?.obs, egreso_nota: row?.egreso_nota, source: row?.source, recepcion_nota: row?.recepcion_nota });
}

function cuentasDeIngreso(row) {
  const q = cantidadesDeFila(row);
  const llego = q.panol > 0 || q.entregado > 0;
  const egresado = Math.max(toNum(row?.cantidad_egresada), q.entregado);
  const declarado = toNum(row?.recepcion_cantidad_recibida);
  // Sin cifra de recepción, lo que llegó es lo que queda más lo que ya salió.
  // En la madre retirada entera, `cantidad_egresada` ya es el total.
  const enMano = String(row?.snapshot_estado || row?.estadoObra || "").toLowerCase() === "egresado" ? 0 : toNum(row?.cantidad);
  const recibido = llego ? (declarado > 0 ? declarado : Math.max(enMano + toNum(row?.cantidad_egresada), egresado)) : 0;
  const pedido = llego ? 0 : Math.max(0, toNum(row?.cantidad));
  return { recibido, egresado, pedido };
}

/**
 * @param elegida  la fila que la lista eligió para mostrar (datos de la ficha)
 * @param filas    todas las filas del snapshot con la misma clave
 * @returns la fila elegida con las cantidades de todas las filas sumadas, o
 *          la misma fila si no hay nada que sumar.
 */
export function sumarFueraDeMatriz(elegida, filas = []) {
  const ingresos = filas.filter((row) => !esHijaDeRetiro(row) && !anulada(row));
  if (filas.length < 2 || !ingresos.length) return elegida;
  let recibido = 0;
  let egresado = 0;
  let pedido = 0;
  for (const row of ingresos) {
    const c = cuentasDeIngreso(row);
    recibido += c.recibido;
    egresado += c.egresado;
    pedido += c.pedido;
  }
  const base = ingresos.includes(elegida) ? elegida : ingresos[ingresos.length - 1];
  const necesita = Math.max(recibido + pedido, egresado);
  const fila = {
    ...base,
    cantidad: necesita || base.cantidad,
    cantidad_egresada: egresado,
    filasSumadas: ingresos.map((row) => row.snapshotId || row.id),
  };
  if (recibido > 0) {
    fila.recepcion_estado = "recibido";
    fila.recepcion_cantidad_recibida = String(recibido);
    if (fila.estadoObra !== "egresado") fila.estadoObra = "en_panol";
  }
  if (egresado > 0) {
    fila.egresadoLedger = egresado;
  } else {
    fila.egreso_at = null;
  }
  return fila;
}
