import { supabase } from "@/supabaseClient";
import { normalizarCarpetas } from "@/features/panol/carpetaRemitos";

/**
 * Las carpetas propias de un remito: "Garantías", "Ferretería", "Service".
 *
 * Son del sistema, no del disco. El PDF sigue estando una sola vez y en un solo
 * lugar de la PC; esto decide en cuantos lados aparece cuando alguien lo busca.
 * Es el mismo mecanismo que ya usaban las obras, y por eso este archivo es
 * gemelo de `remitosObrasApi`.
 */

function faltaSoporteCarpetas(error) {
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "").toLowerCase();
  return ["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(codigo)
    || mensaje.includes("panol_comprobante_carpetas")
    || mensaje.includes("panol_asignar_carpetas_remito");
}

/** Map<comprobante_id, string[]> con las carpetas de cada remito. */
export async function fetchCarpetasDeRemitos(comprobanteIds) {
  const ids = [...new Set((comprobanteIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { disponible: await haySoporteRemitosCarpetas(), porRemito: new Map() };

  const vinculos = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from("panol_comprobante_carpetas")
      .select("comprobante_id,carpeta")
      .in("comprobante_id", ids.slice(i, i + 150));
    if (error) {
      if (faltaSoporteCarpetas(error)) return { disponible: false, porRemito: new Map() };
      throw error;
    }
    vinculos.push(...(data || []));
  }

  const porRemito = new Map();
  for (const vinculo of vinculos) {
    const clave = String(vinculo.comprobante_id);
    porRemito.set(clave, [...(porRemito.get(clave) || []), String(vinculo.carpeta || "")]);
  }
  for (const [remitoId, lista] of porRemito) {
    porRemito.set(remitoId, normalizarCarpetas(lista).sort((a, b) => a.localeCompare(b)));
  }
  return { disponible: true, porRemito };
}

/** Reemplazo atomico de las carpetas del remito. No mueve el archivo. */
export async function asignarCarpetasDeRemito(comprobanteId, carpetas) {
  if (!comprobanteId) return false;
  const { error } = await supabase.rpc("panol_asignar_carpetas_remito", {
    p_comprobante_id: comprobanteId,
    p_carpetas: normalizarCarpetas(carpetas),
  });
  if (error) {
    if (faltaSoporteCarpetas(error)) return false;
    throw error;
  }
  return true;
}

/**
 * Todas las carpetas que ya existen, para ofrecerlas al clasificar.
 *
 * Es lo unico que evita que "Rebollar", "rebollar" y "REBOLLAR" terminen siendo
 * tres carpetas distintas con un tercio de los remitos cada una.
 */
export async function fetchCarpetasExistentes() {
  const { data, error } = await supabase
    .from("panol_comprobante_carpetas")
    .select("carpeta")
    .limit(2000);
  if (error) {
    if (faltaSoporteCarpetas(error)) return { disponible: false, carpetas: [] };
    throw error;
  }
  return {
    disponible: true,
    carpetas: normalizarCarpetas((data || []).map((fila) => fila.carpeta)).sort((a, b) => a.localeCompare(b)),
  };
}

export async function haySoporteRemitosCarpetas() {
  const { error } = await supabase
    .from("panol_comprobante_carpetas")
    .select("comprobante_id")
    .limit(1);
  if (!error) return true;
  if (faltaSoporteCarpetas(error)) return false;
  throw error;
}
