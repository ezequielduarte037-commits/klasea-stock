import { supabase } from "@/supabaseClient";
import { normalizar } from "@/features/produccion/catalogoBusquedaApi";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";

// ─────────────────────────────────────────────────────────────────────────────
// Fotos del papel + lectura con IA.
//
// El circuito es a propósito en dos tiempos:
//   1. la foto se sube y se guarda SIEMPRE, aunque después la IA falle. Es el
//      respaldo del pedido y no se puede perder por un error de un servicio
//      externo.
//   2. la lectura se dispara aparte y devuelve un BORRADOR. Nada de lo que lee
//      la IA entra al sistema sin que una persona lo confirme: con letra
//      manuscrita se equivoca seguido, y un error que entra solo es mucho peor
//      que uno que se ve y se corrige.
//
// La API key no está acá ni puede estar: vive en la edge function
// `extraer-solicitud-panol` (Deno.env). Si se llamara al proveedor desde el
// browser, la key quedaría en el bundle a la vista de cualquiera.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = "documentos";
const CARPETA = "solicitudes-panol";

// Sólo lo que la policy de storage y el modelo aceptan.
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 12;

const limpioNombre = (nombre = "") =>
  String(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);

async function actorId() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/* ═══ Fotos ═══════════════════════════════════════════════════════════════ */

export async function fetchFotos(solicitudId) {
  if (!solicitudId) return [];
  const { data, error } = await supabase
    .from("panol_solicitud_fotos")
    .select("id, solicitud_id, url, path, nombre, tipo, tamano, estado_lectura, error_lectura, extraccion, orden, created_at")
    .eq("solicitud_id", solicitudId)
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function subirFoto(solicitudId, file, { orden = 0 } = {}) {
  if (!solicitudId) throw new Error("Falta la solicitud.");
  if (!file) throw new Error("Falta el archivo.");
  if (!TIPOS_OK.includes(file.type)) {
    throw new Error("Subí una foto jpg, png o webp.");
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La foto pesa más de ${MAX_MB} MB. Sacala con menos resolución.`);
  }

  // El primer segmento del path tiene que ser 'solicitudes-panol': así lo exige
  // la policy de storage de la migración.
  const path = `${CARPETA}/${solicitudId}/${Date.now()}-${limpioNombre(file.name || "foto.jpg")}`;
  const { error: errUp } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (errUp) throw errUp;

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from("panol_solicitud_fotos")
    .insert({
      solicitud_id: solicitudId,
      url: publicUrl,
      path,
      nombre: file.name || null,
      tipo: file.type || null,
      tamano: file.size ?? null,
      orden,
      created_by: await actorId(),
    })
    .select("id, url, path, nombre, tipo, tamano, estado_lectura, extraccion, orden, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function borrarFoto(foto) {
  if (!foto?.id) return;
  // Primero la fila y después el objeto: si falla el borrado del archivo, peor
  // es dejar una fila apuntando a algo que ya no existe.
  const { error } = await supabase.from("panol_solicitud_fotos").delete().eq("id", foto.id);
  if (error) throw error;
  if (foto.path) {
    try { await supabase.storage.from(BUCKET).remove([foto.path]); } catch { /* huérfano en storage, no rompe nada */ }
  }
}

/* ═══ Lectura con IA ══════════════════════════════════════════════════════ */

function fileDesdeUrl(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error("No se pudo descargar la foto para leerla.");
    return r.blob();
  });
}

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("No se pudo leer la foto."));
    // readAsDataURL devuelve "data:image/jpeg;base64,XXXX": la function espera
    // sólo la parte de después de la coma.
    fr.onload = () => resolve(String(fr.result || "").split(",")[1] || "");
    fr.readAsDataURL(blob);
  });
}

// Dispara la lectura de una foto ya subida. Guarda el resultado (o el error) en
// la fila, para poder reintentar sin volver a subir nada.
export async function leerFotoConIA(foto, { obras = [] } = {}) {
  if (!foto?.id) throw new Error("Falta la foto.");

  try {
    const blob = await fileDesdeUrl(foto.url);
    const base64 = await blobABase64(blob);

    const { data, error } = await supabase.functions.invoke("extraer-solicitud-panol", {
      body: {
        image_base64: base64,
        mime_type: foto.tipo || blob.type || "image/jpeg",
        sectores: SECTORES,
        obras,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    await supabase
      .from("panol_solicitud_fotos")
      .update({ estado_lectura: "ok", error_lectura: null, extraccion: data })
      .eq("id", foto.id);

    return data;
  } catch (err) {
    const motivo = err?.message || "No se pudo leer la foto.";
    // El error se persiste para que se vea en la pantalla al volver, en vez de
    // dejar la foto en "pendiente" para siempre.
    await supabase
      .from("panol_solicitud_fotos")
      .update({ estado_lectura: "error", error_lectura: motivo })
      .eq("id", foto.id);
    throw new Error(motivo);
  }
}

/* ═══ Vinculación con el catálogo ═════════════════════════════════════════ */

// Puntaje de parecido entre lo que leyó la IA y un material del catálogo.
// No es difuso a propósito: cuenta cuántas palabras del texto leído aparecen en
// la descripción. Es simple de explicar y de auditar, que es lo que importa
// cuando alguien pregunta "¿por qué me lo vinculó con esto?".
function puntaje(textoLeido, material) {
  const tokens = normalizar(textoLeido).split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return 0;
  const contra = normalizar(`${material.descripcion ?? ""} ${material.codigo ?? ""}`);
  const aciertos = tokens.filter((t) => contra.includes(t)).length;
  return aciertos / tokens.length;
}

// Busca en el catálogo el mejor candidato para cada ítem leído.
// Devuelve el ítem con `sugerencia` (el material) y `certeza` (0..1).
export async function vincularConCatalogo(items = []) {
  const limpios = (items || []).filter((i) => String(i?.descripcion || "").trim());
  if (!limpios.length) return [];

  const resultado = [];
  for (const item of limpios) {
    // Se filtra en la base por la palabra más larga (la más discriminante) y el
    // puntaje se calcula sobre esos pocos candidatos.
    const tokens = normalizar(item.descripcion).split(" ").filter((t) => t.length >= 3);
    const pick = [...tokens].sort((a, b) => b.length - a.length)[0];

    let candidatos = [];
    if (pick) {
      const { data } = await supabase
        .from("panol_materiales")
        .select("id, descripcion, codigo, unidad_medida, proveedor")
        .neq("activo", false)
        .or(`descripcion.ilike.%${pick.replace(/[%,()]/g, " ")}%,codigo.ilike.%${pick.replace(/[%,()]/g, " ")}%`)
        .limit(25);
      candidatos = data ?? [];
    }

    let mejor = null;
    let certeza = 0;
    for (const c of candidatos) {
      const p = puntaje(item.descripcion, c);
      if (p > certeza) { certeza = p; mejor = c; }
    }

    resultado.push({
      ...item,
      // Debajo de 0.5 la sugerencia es más ruido que ayuda: queda como texto
      // libre y que pañol lo busque a mano si quiere.
      sugerencia: certeza >= 0.5 ? mejor : null,
      certeza: certeza >= 0.5 ? certeza : 0,
    });
  }
  return resultado;
}
