import { supabase } from "@/supabaseClient";

const BUCKET = "panol-comprobantes";

/**
 * El archivo de remitos del sistema: lo mismo que queda en las carpetas de la PC
 * del pañol, pero consultable desde cualquier lado. Sirve para cuando alguien
 * pregunta "¿qué vino para el 55-1?" y no hay nadie parado frente a esa PC.
 */

/** PostgREST avisa una columna inexistente con PGRST204 o el 42703 de Postgres. */
function esColumnaFaltante(error) {
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "").toLowerCase();
  return codigo === "PGRST204" || codigo === "42703"
    || (mensaje.includes("column") && mensaje.includes("does not exist"));
}

const COLUMNAS_CON_OBRA = "id,proveedor,numero,fecha,total,moneda,sede,notas,archivo_url,archivo_nombre,archivo_mime,origen_carga,recepcion_estado,panol_envio_id,created_at,obra_id,carpeta_local,titulo,solo_archivo";
const COLUMNAS_SIN_OBRA = "id,proveedor,numero,fecha,total,moneda,sede,notas,archivo_url,archivo_nombre,archivo_mime,origen_carga,recepcion_estado,panol_envio_id,created_at";

/**
 * Todos los remitos archivados, con la obra resuelta.
 *
 * Si la migracion que agrega obra_id todavia no se corrio, se devuelve lo mismo
 * sin obra en vez de romper: la pantalla igual sirve para buscar por proveedor,
 * numero o fecha, que es la mitad del valor.
 */
export async function fetchRemitosArchivados({ limite = 400 } = {}) {
  let filas = null;
  let hayObra = true;

  const conObra = await supabase
    .from("panol_comprobantes")
    .select(COLUMNAS_CON_OBRA)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (conObra.error && esColumnaFaltante(conObra.error)) {
    hayObra = false;
    const sinObra = await supabase
      .from("panol_comprobantes")
      .select(COLUMNAS_SIN_OBRA)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (sinObra.error) throw sinObra.error;
    filas = sinObra.data ?? [];
  } else if (conObra.error) {
    throw conObra.error;
  } else {
    filas = conObra.data ?? [];
  }

  // Las obras se traen aparte: son pocas y asi no depende de que exista la FK
  // para poder hacer el embed.
  let obrasPorId = new Map();
  if (hayObra) {
    const ids = [...new Set(filas.map((f) => f.obra_id).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase
        .from("produccion_obras")
        .select("id,codigo,linea_nombre")
        .in("id", ids);
      obrasPorId = new Map((data ?? []).map((o) => [o.id, o]));
    }
  }

  return {
    hayObra,
    remitos: filas.map((fila) => ({
      ...fila,
      obra: fila.obra_id ? obrasPorId.get(fila.obra_id) ?? null : null,
    })),
  };
}

/** Link temporal para abrir el PDF guardado. */
export async function urlDeRemito(archivoUrl) {
  if (!archivoUrl) return "";
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(archivoUrl, 60 * 10);
  if (error) throw error;
  return data?.signedUrl || "";
}

/**
 * Cambia la obra de un remito ya archivado. Hace falta porque al escanear se
 * elige rapido y a veces se elige mal, y un remito en la obra equivocada es
 * peor que uno sin obra: se busca donde no esta.
 */
export async function reasignarObraDeRemito(remitoId, obraId) {
  if (!remitoId) return false;
  const { error } = await supabase
    .from("panol_comprobantes")
    .update({ obra_id: obraId || null })
    .eq("id", remitoId);
  if (error) {
    if (esColumnaFaltante(error)) return false;
    throw error;
  }
  return true;
}
