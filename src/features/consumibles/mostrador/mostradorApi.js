import { supabase } from "@/supabaseClient";
import { fetchMovimientos, insertarMovimientos, rangoDeHoyArgentina, retirosDeHoy } from "@/features/consumibles/api";
import { conTimeout, rankingMasRetirados, retirosPendientesDe } from "./mostradorLogica";

/**
 * Lo que el mostrador necesita y no está en api.js. Solo lecturas, salvo
 * `enviarFilas`, que es `insertarMovimientos` con un tope de espera.
 */

// Hasta el 13/10 los consumibles salían por solicitud de papel y quedaban en el
// ledger viejo. Desde ese día el trigger espejo los copia también al registro
// nuevo, así que del viejo se toma solo lo anterior para no contarlos dos veces.
const ARRANQUE_REGISTRO = "2026-10-13T00:00:00-03:00";

/**
 * Los consumibles más retirados, para completar la botonera cuando Compras
 * todavía no eligió favoritos. El martes el registro nuevo está vacío: sin el
 * historial de solicitudes (1.500 retiros desde agosto) la botonera arrancaría
 * en blanco justo el día que más se necesita.
 */
export async function fetchMasRetirados({ sede = null, dias = 60 } = {}) {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  let nuevo = supabase
    .from("consumibles_movimientos")
    .select("material_id,cantidad,lote")
    .eq("tipo", "retiro")
    .is("anulado_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (sede) nuevo = nuevo.eq("sede", sede);

  const viejo = supabase
    .from("panol_obra_materiales_snapshot")
    .select("material_id,cantidad,cantidad_egresada")
    .eq("source", "solicitud_consumible_retiro")
    .not("material_id", "is", null)
    .lt("created_at", ARRANQUE_REGISTRO)
    .order("created_at", { ascending: false })
    .limit(3000);

  const [n, v] = await Promise.all([nuevo, viejo]);
  // La botonera es una ayuda: si una de las dos consultas falla, sigue con la otra.
  const filas = [
    ...(n.error ? [] : n.data ?? []),
    ...(v.error ? [] : (v.data ?? []).map((r) => ({
      material_id: r.material_id,
      cantidad: Number(r.cantidad_egresada) || Number(r.cantidad) || 0,
      lote: null,
    }))),
  ];
  return rankingMasRetirados(filas);
}

/**
 * Personas para firmar sin tarjeta (por nombre o DNI) y para reconocer una
 * tarjeta cuando se cae la red. Son unas 225: se traen una vez y se busca en
 * memoria, así la búsqueda es instantánea y sigue andando sin conexión.
 * El pañol puede leer rrhh_empleados (política rrhh_empleados_select_panol).
 */
export async function fetchEmpleadosMostrador() {
  const completo = "id,nombre,dni,sede,foto_url,activo,fecha_baja,nfc_uid";
  let { data, error } = await supabase
    .from("rrhh_empleados")
    .select(completo)
    .or("activo.is.null,activo.eq.true")
    .order("nombre")
    .limit(2000);
  if (error && /fecha_baja|foto_url|nfc_uid/.test(String(error.message))) {
    ({ data, error } = await supabase
      .from("rrhh_empleados")
      .select("id,nombre,dni,sede,activo")
      .or("activo.is.null,activo.eq.true")
      .order("nombre")
      .limit(2000));
  }
  if (error) throw error;
  const hoy = new Date().toISOString().slice(0, 10);
  return (data ?? []).filter((e) => !e.fecha_baja || String(e.fecha_baja).slice(0, 10) > hoy);
}

/** Los últimos retiros y devoluciones de esta sede, anulados incluidos (se ven tachados). */
export function fetchUltimosMovimientos({ sede, limite = 60 } = {}) {
  return fetchMovimientos({ sede, tipos: ["retiro", "devolucion"], incluirAnulados: true, limite });
}

/**
 * Manda filas ya armadas (con sus ids). Si la red no contesta en `timeoutMs`,
 * corta y deja que el que llama las guarde en la cola: el envío original puede
 * llegar igual más tarde, y como los ids son los mismos, no se duplica.
 */
export function enviarFilas(filas, { timeoutMs = 7000 } = {}) {
  return conTimeout(insertarMovimientos(filas), timeoutMs, "La red no contestó a tiempo.");
}

/** Lee incluso los anulados: un id ocupado tampoco se puede volver a insertar. */
async function leerFilasPorIds(ids = []) {
  const filas = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const { data, error } = await conTimeout(supabase.from("consumibles_movimientos")
      .select("*").in("id", lote).limit(lote.length), 7000, "No se pudo comprobar el registro a tiempo.");
    if (error) throw error;
    filas.push(...(data ?? []));
  }
  return filas;
}

export function fetchFilasPorIds(ids = []) {
  return conTimeout(leerFilasPorIds(ids), 7000, "No se pudo comprobar el registro a tiempo.");
}

/** Las anulaciones también se reconcilian por id; no vuelven a sumar por la copia local. */
export async function fetchHoyMostrador(empleadoId, operaciones) {
  const { desde, hasta } = rangoDeHoyArgentina();
  const ids = retirosPendientesDe(operaciones, empleadoId, desde, hasta).map((f) => f.id);
  const [hoy, verificadas] = await Promise.all([retirosDeHoy(empleadoId), fetchFilasPorIds(ids)]);
  return { hoy, verificadas };
}

const CACHE_KEY = "klasea.consumibles.mostrador.datos";

/** Catálogo, padrón y obras sobreviven al remontaje; el fallo de red se avisa. */
export function leerDatosMostrador(sede) {
  try { return JSON.parse(window.localStorage.getItem(`${CACHE_KEY}.${sede}`) || "null") ?? {}; }
  catch { return {}; }
}

export function guardarDatosMostrador(sede, datos) {
  try {
    const anterior = leerDatosMostrador(sede);
    window.localStorage.setItem(`${CACHE_KEY}.${sede}`, JSON.stringify({ ...anterior, ...datos, guardadoAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}
