import { supabase } from "@/supabaseClient";
import {
  asignarObrasDeRemito,
  fetchObrasDeRemitos,
  haySoporteRemitosMultiobra,
  normalizarObraIds,
} from "@/features/panol/remitosObrasApi";

const BUCKET = "panol-comprobantes";

/**
 * El archivo de remitos del pañol: lo mismo que queda en las carpetas de la PC,
 * pero consultable desde cualquier lado. Sirve para cuando alguien pregunta
 * "¿qué vino para el 55-1?" y no hay nadie parado frente a esa PC.
 */

/** PostgREST avisa una columna inexistente con PGRST204 o el 42703 de Postgres. */
function esColumnaFaltante(error) {
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "").toLowerCase();
  return codigo === "PGRST204" || codigo === "42703"
    || (mensaje.includes("column") && mensaje.includes("does not exist"));
}

const COLUMNAS_CON_OBRA = "id,proveedor,numero,fecha,total,moneda,sede,notas,archivo_url,archivo_nombre,archivo_mime,origen_carga,recepcion_estado,panol_envio_id,created_at,obra_id,carpeta_local,titulo,solo_archivo,es_consumible";
const COLUMNAS_SIN_OBRA = "id,proveedor,numero,fecha,total,moneda,sede,notas,archivo_url,archivo_nombre,archivo_mime,origen_carga,recepcion_estado,panol_envio_id,created_at";

/**
 * Todos los remitos escaneados, con la obra resuelta.
 *
 * Filtra `origen_carga = 'scanner_panol'` explicitamente. Antes no lo hacia y
 * solo el RLS lo salvaba de mostrar acá las facturas de Precios y los
 * comprobantes de Compras: un archivo de remitos que depende de una politica de
 * seguridad para no mezclar papeles de otro circuito es una bomba de tiempo.
 *
 * Tampoco muestra los descartados ("no es un remito"): quedaban listados igual,
 * asi que marcar algo como basura no lo sacaba de ningun lado.
 *
 * Si la migracion que agrega obra_id todavia no se corrio se devuelve lo mismo
 * sin obra en vez de romper: la pantalla igual sirve para buscar por proveedor,
 * numero o fecha, que es la mitad del valor.
 */
export async function fetchRemitosArchivados({ limite = 400, incluirDescartados = false } = {}) {
  const construir = (columnas) => {
    let query = supabase
      .from("panol_comprobantes")
      .select(columnas)
      .eq("origen_carga", "scanner_panol")
      .order("created_at", { ascending: false })
      .limit(limite);
    if (!incluirDescartados) query = query.neq("recepcion_estado", "archivado");
    return query;
  };

  let filas = null;
  let hayObra = true;

  const conObra = await construir(COLUMNAS_CON_OBRA);
  if (conObra.error && esColumnaFaltante(conObra.error)) {
    hayObra = false;
    const sinObra = await construir(COLUMNAS_SIN_OBRA);
    if (sinObra.error) throw sinObra.error;
    filas = sinObra.data ?? [];
  } else if (conObra.error) {
    throw conObra.error;
  } else {
    filas = conObra.data ?? [];
  }

  const multiobra = hayObra
    ? await fetchObrasDeRemitos(filas.map((fila) => fila.id))
    : { disponible: false, porRemito: new Map() };

  // `obra_id` queda como compatibilidad para datos viejos y bases que todavía
  // no tienen la tabla multiobra. Las asociaciones nuevas son la fuente.
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

  // "Falta leer" tiene que salir de los renglones que hay, no del estado: un
  // remito en "requiere_revision" YA fue leido, y ofrecerle leer de nuevo
  // duplicaria sus lineas. Por eso se cuentan de verdad.
  const renglones = await contarRenglones(filas.map((f) => f.id));

  return {
    hayObra,
    hayMultiobra: multiobra.disponible,
    remitos: filas.map((fila) => {
      const legado = fila.obra_id ? obrasPorId.get(fila.obra_id) ?? null : null;
      const vinculadas = multiobra.disponible ? multiobra.porRemito.get(String(fila.id)) || [] : [];
      const obras = vinculadas.length ? vinculadas : legado ? [legado] : [];
      return {
        ...fila,
        obra: obras[0] || null,
        obras,
        obra_ids: obras.map((obra) => obra.id),
        renglones: renglones.get(fila.id) ?? 0,
        // Sin renglones y sin ingreso hecho: el papel esta guardado pero la IA
        // todavia no lo leyo (o no pudo). Es un estado normal, no un error. Se
        // mira lo que hay, no el estado, por el mismo motivo que remitoSinLeer.
        sinLeer: (renglones.get(fila.id) ?? 0) === 0 && !fila.panol_envio_id,
      };
    }),
  };
}

/** Cuantos renglones tiene cada comprobante. Map<id, cantidad>. */
async function contarRenglones(ids) {
  const cuenta = new Map();
  const limpios = [...new Set((ids ?? []).filter(Boolean))];
  if (!limpios.length) return cuenta;
  // De a tandas para no armar una URL enorme con 400 uuids.
  for (let i = 0; i < limpios.length; i += 150) {
    const tanda = limpios.slice(i, i + 150);
    const { data, error } = await supabase
      .from("panol_comprobante_items")
      .select("comprobante_id")
      .in("comprobante_id", tanda);
    if (error) continue;
    for (const fila of data ?? []) {
      cuenta.set(fila.comprobante_id, (cuenta.get(fila.comprobante_id) ?? 0) + 1);
    }
  }
  return cuenta;
}

/**
 * Las carpetas propias que ya existen ("Consumibles Rebollar", "Ferretería").
 * Se ofrecen al escanear para que la misma carpeta no termine escrita de tres
 * formas distintas y partida en tres.
 */
export async function fetchCarpetasUsadas() {
  const { data, error } = await supabase
    .from("panol_comprobantes")
    .select("carpeta_local")
    .eq("origen_carga", "scanner_panol")
    .not("carpeta_local", "is", null)
    .limit(500);
  if (error) {
    if (esColumnaFaltante(error)) return [];
    throw error;
  }
  const vistas = new Map();
  for (const fila of data ?? []) {
    const nombre = String(fila.carpeta_local || "").trim();
    // Las de obra ya salen del selector de barcos: aca solo las escritas a mano.
    if (!nombre || nombre.includes("/") || nombre.includes("\\")) continue;
    const clave = nombre.toLowerCase();
    if (!vistas.has(clave)) vistas.set(clave, nombre);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Los proveedores conocidos, para ofrecerlos al escanear.
 *
 * El modal ya tenia el campo con datalist, pero nadie le pasaba la lista: el
 * desplegable salia siempre vacio y habia que escribir el nombre de memoria,
 * que es exactamente como una misma empresa termina cargada de cuatro formas.
 */
export async function fetchProveedoresConocidos() {
  const { data, error } = await supabase
    .from("panol_proveedores")
    .select("nombre")
    .eq("activo", true)
    .order("nombre")
    .limit(400);
  if (error) return [];
  const vistas = new Map();
  for (const fila of data ?? []) {
    const nombre = String(fila.nombre || "").trim();
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (!vistas.has(clave)) vistas.set(clave, nombre);
  }
  return [...vistas.values()];
}

/**
 * ¿Estan las columnas de la migracion 20260826150000?
 *
 * Sin ellas el escaneo igual guarda el remito, pero SIN la obra, el tipo ni la
 * referencia: se elige el barco y no pasa nada. Escrito asi para no romper, se
 * volvio peor que romper, porque falla en silencio y parece que no anda nada.
 * Con esto la pantalla lo puede decir.
 */
let _hayColumnasNuevas = null;

export async function hayColumnasDeRemito() {
  if (_hayColumnasNuevas !== null) return _hayColumnasNuevas;
  const { error } = await supabase
    .from("panol_comprobantes")
    .select("obra_id,titulo,solo_archivo,es_consumible,carpeta_local")
    .limit(1);
  _hayColumnasNuevas = !error && await haySoporteRemitosMultiobra().catch(() => false);
  return _hayColumnasNuevas;
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
 *
 * Devuelve false si no cambio ninguna fila. Antes devolvia true sin mirar y la
 * pantalla decia "Obra actualizada" aunque el RLS hubiera rechazado el update.
 */
export async function reasignarObraDeRemito(remitoId, obraId) {
  return reasignarObrasDeRemito(remitoId, normalizarObraIds([obraId]));
}

/** Cambia todas las carpetas virtuales del remito sin duplicar el documento. */
export async function reasignarObrasDeRemito(remitoId, obraIds) {
  return asignarObrasDeRemito(remitoId, obraIds);
}
