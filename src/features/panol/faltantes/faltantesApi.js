import { cargarDatosCalendario } from "@/features/compras/calendario/calendarioApi";

// Los datos salen de la planilla de cada línea (la misma cuenta que el
// calendario de Compras y la lista de cada obra). Arman todas las líneas, así
// que la bandeja del inventario y la pestaña comparten una sola carga.
const VIGENCIA_MS = 3 * 60 * 1000;
let cache = null;
let cacheAt = 0;
let enCurso = null;

export async function cargarDatosFaltantes({ forzar = false } = {}) {
  if (!forzar && cache && Date.now() - cacheAt < VIGENCIA_MS) return cache;
  if (!forzar && enCurso) return enCurso;
  enCurso = cargarDatosCalendario()
    .then((datos) => {
      cache = datos;
      cacheAt = Date.now();
      return datos;
    })
    .finally(() => { enCurso = null; });
  return enCurso;
}
