import { supabase } from "@/supabaseClient";

/**
 * Personas para firmar sin tarjeta (por nombre o DNI) y para reconocer una
 * tarjeta leída por un lector que escribe como teclado. Son unas 225: se traen
 * una vez y se busca en memoria. El pañol puede leer rrhh_empleados.
 */
export async function fetchPersonasRetiro() {
  let { data, error } = await supabase
    .from("rrhh_empleados")
    .select("id,nombre,dni,sede,foto_url,activo,fecha_baja,nfc_uid")
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

/** Espera una promesa como mucho `ms`; si no, falla con `mensaje`. */
export function conTope(promesa, ms, mensaje = "La red no contestó a tiempo.") {
  let timer;
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => { timer = window.setTimeout(() => rechazar(new Error(mensaje)), ms); }),
  ]).finally(() => window.clearTimeout(timer));
}
