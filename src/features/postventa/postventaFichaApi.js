import { supabase } from "@/supabaseClient";

/**
 * La ficha de un barco entregado: contactos, fotos, papeles y horarios.
 *
 * Sale del mail de Gastón del 07/09. Lo que pedía, en una frase: cuando hay que
 * mandar a un tercerizado a un barco, la pantalla sabe DÓNDE está y nada más.
 * Falta a quién llamar, cómo se ve la embarcación, el seguro que le piden en la
 * guardia y a qué hora lo dejan entrar. Todo eso vive hoy en el WhatsApp de
 * alguien.
 *
 * Tolerante a que las tablas no existan todavía: la pantalla lo dice y sigue
 * funcionando en vez de romperse, igual que el resto del sistema.
 */

const BUCKET = "postventa";
const PESO_MAXIMO = 12 * 1024 * 1024;

export function faltaLaTabla(error) {
  if (!error) return false;
  const texto = String(error.message ?? "").toLowerCase();
  return error.code === "42P01"
    || texto.includes("does not exist")
    || texto.includes("schema cache");
}

const limpio = (valor) => {
  const texto = String(valor ?? "").trim();
  return texto || null;
};

/* ── CONTACTOS ─────────────────────────────────────────────────────────────── */

/** Los roles que se ofrecen. Texto libre igual: siempre aparece uno nuevo. */
export const ROLES = ["Dueño", "Marinero", "Encargado", "Familiar", "Capitán", "Guardia"];

export async function fetchContactos(barcoId) {
  if (!barcoId) return { contactos: [], falta: false };
  const { data, error } = await supabase
    .from("postventa_contactos")
    .select("id, barco_id, nombre, rol, telefono, notas, orden")
    .eq("barco_id", barcoId)
    .order("orden")
    .order("created_at");
  if (error) {
    if (faltaLaTabla(error)) return { contactos: [], falta: true };
    throw error;
  }
  return { contactos: data || [], falta: false };
}

export async function guardarContacto(barcoId, contacto) {
  const nombre = limpio(contacto?.nombre);
  if (!barcoId || !nombre) throw new Error("Poné al menos el nombre.");
  const fila = {
    barco_id: barcoId,
    nombre,
    rol: limpio(contacto.rol),
    telefono: limpio(contacto.telefono),
    notas: limpio(contacto.notas),
    orden: Number(contacto.orden) || 0,
  };
  if (contacto.id) {
    const { error } = await supabase.from("postventa_contactos").update(fila).eq("id", contacto.id);
    if (error) throw error;
    return contacto.id;
  }
  const { data, error } = await supabase
    .from("postventa_contactos").insert(fila).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function borrarContacto(id) {
  const { error } = await supabase.from("postventa_contactos").delete().eq("id", id);
  if (error) throw error;
}

/* ── FOTOS Y PAPELES ───────────────────────────────────────────────────────── */

export async function fetchAdjuntos(barcoId) {
  if (!barcoId) return { adjuntos: [], falta: false };
  const { data, error } = await supabase
    .from("postventa_adjuntos")
    .select("id, barco_id, tipo, url, ruta, nombre, mime, created_at")
    .eq("barco_id", barcoId)
    .order("created_at");
  if (error) {
    if (faltaLaTabla(error)) return { adjuntos: [], falta: true };
    throw error;
  }
  return { adjuntos: data || [], falta: false };
}

/**
 * Sube un archivo del barco. `tipo` decide dónde se muestra, no qué se acepta:
 * una foto del seguro sacada con el teléfono es un documento aunque sea un JPG.
 */
export async function subirAdjunto(barcoId, archivo, tipo = "foto") {
  if (!barcoId || !archivo) return null;
  if (archivo.size > PESO_MAXIMO) {
    throw new Error("El archivo pasa de 12 MB. Si es una foto, sacale una captura más chica.");
  }
  const seguro = String(archivo.name || "archivo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const ruta = `${barcoId}/${tipo}/${Date.now()}_${seguro}`;

  const { error: errSubida } = await supabase.storage
    .from(BUCKET).upload(ruta, archivo, { cacheControl: "3600", upsert: false });
  if (errSubida) {
    if (String(errSubida.message || "").toLowerCase().includes("bucket not found")) {
      throw new Error("Falta correr la migración de post venta: todavía no existe el bucket.");
    }
    throw new Error(errSubida.message || "No se pudo subir el archivo.");
  }

  const { data: publico } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const { data, error } = await supabase
    .from("postventa_adjuntos")
    .insert({ barco_id: barcoId, tipo, url: publico.publicUrl, ruta, nombre: archivo.name || seguro, mime: archivo.type || null })
    .select("id, barco_id, tipo, url, ruta, nombre, mime, created_at")
    .single();
  if (error) {
    // El archivo ya subió pero la fila no entró: se limpia en vez de dejarlo
    // colgado en el bucket sin nada que lo referencie.
    await supabase.storage.from(BUCKET).remove([ruta]).catch(() => {});
    if (faltaLaTabla(error)) throw new Error("Falta correr la migración de post venta.");
    throw error;
  }
  return data;
}

/** Borra la fila y el archivo. Si el archivo ya no está, la fila se va igual. */
export async function borrarAdjunto(adjunto) {
  if (!adjunto?.id) return;
  if (adjunto.ruta) await supabase.storage.from(BUCKET).remove([adjunto.ruta]).catch(() => {});
  const { error } = await supabase.from("postventa_adjuntos").delete().eq("id", adjunto.id);
  if (error) throw error;
}

/* ── ACCESO ────────────────────────────────────────────────────────────────── */

export async function guardarAcceso(barcoId, { acceso_dias, acceso_horario, acceso_notas }) {
  if (!barcoId) return false;
  const { error } = await supabase
    .from("postventa_flota")
    .update({
      acceso_dias: limpio(acceso_dias),
      acceso_horario: limpio(acceso_horario),
      acceso_notas: limpio(acceso_notas),
    })
    .eq("id", barcoId);
  if (error) {
    if (faltaLaTabla(error)) throw new Error("Falta correr la migración de post venta.");
    throw error;
  }
  return true;
}

/* ── LO QUE SE LE MANDA AL TÉCNICO ─────────────────────────────────────────── */

const soloDigitos = (tel) => String(tel || "").replace(/\D/g, "");

/** Link de WhatsApp. Argentina: si viene sin país, se le pone 54. */
export function linkWhatsApp(telefono) {
  const n = soloDigitos(telefono);
  if (n.length < 8) return null;
  const conPais = n.startsWith("54") ? n : `54${n.replace(/^0/, "")}`;
  return `https://wa.me/${conPais}`;
}

/**
 * La ficha en texto, lista para pegar en un WhatsApp.
 *
 * Es la respuesta de fondo al pedido de "mandar una captura del mapa con un solo
 * barco": lo que el técnico necesita no es una imagen, es el link que le abre el
 * GPS en el teléfono, a quién llamar y a qué hora puede entrar. La captura es
 * una forma de mandar eso; esto es la forma que no se pierde.
 */
export function fichaComoTexto(barco, contactos = [], papeles = []) {
  const l = [];
  l.push(`*${barco.nombre_barco || "Barco"}*`);
  if (barco.propietario) l.push(`Propietario: ${barco.propietario}`);

  const lugar = [barco.ubicacion_general, barco.detalle_ubicacion].filter(Boolean).join(" · ");
  if (lugar) l.push(`Lugar: ${lugar}`);
  const amarra = [barco.peine ? `peine ${barco.peine}` : null, barco.amarra ? `amarra ${barco.amarra}` : null].filter(Boolean).join(", ");
  if (amarra) l.push(`Amarra: ${amarra}`);
  if (barco.latitud && barco.longitud) {
    l.push(`Ubicación: https://www.google.com/maps/search/?api=1&query=${barco.latitud},${barco.longitud}`);
  }

  if (barco.acceso_dias || barco.acceso_horario) {
    l.push("");
    l.push(`*Acceso:* ${[barco.acceso_dias, barco.acceso_horario].filter(Boolean).join(" · ")}`);
    if (barco.acceso_notas) l.push(barco.acceso_notas);
  }

  if (contactos.length) {
    l.push("");
    l.push("*Contactos:*");
    for (const c of contactos) {
      l.push(`· ${c.nombre}${c.rol ? ` (${c.rol})` : ""}${c.telefono ? ` — ${c.telefono}` : ""}`);
    }
  }

  if (papeles.length) {
    l.push("");
    l.push("*Papeles:*");
    for (const p of papeles) l.push(`· ${p.nombre || "archivo"}: ${p.url}`);
  }

  return l.join("\n");
}
