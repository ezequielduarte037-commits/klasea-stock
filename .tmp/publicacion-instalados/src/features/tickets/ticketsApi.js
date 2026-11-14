import { supabase } from "@/supabaseClient";

/**
 * Tickets del sistema: pedidos de mejora, problemas y solicitudes.
 *
 * Todo lo que sale de acá viene ya armado para la pantalla: el ticket con su
 * autor, sus votos y si vos votaste. Se hace en tres consultas y se junta en
 * memoria a propósito — un embed de PostgREST con conteo de votos obliga a una
 * vista o a una función, y esto son decenas de filas, no miles.
 */

export const TIPOS = [
  { id: "mejora", label: "Mejora", ayuda: "Algo que ya funciona pero podría ser mejor" },
  { id: "problema", label: "Problema", ayuda: "Algo que está fallando o da un dato equivocado" },
  { id: "pedido", label: "Pedido", ayuda: "Algo que hoy no existe y hace falta" },
];

export const ESTADOS = [
  { id: "nuevo", label: "Nuevo", ayuda: "Entró y nadie lo miró todavía" },
  { id: "en_curso", label: "En curso", ayuda: "Alguien lo está haciendo" },
  { id: "hecho", label: "Hecho", ayuda: "Ya está en el sistema" },
  { id: "descartado", label: "Descartado", ayuda: "Se decidió no hacerlo. La razón queda escrita" },
];

/**
 * Los apartados del sistema, para tocar en vez de escribir.
 *
 * Es una lista corta a propósito. Con las treinta pantallas del menú, elegir
 * se vuelve otra tarea; con diez áreas alcanza para saber a quién le toca y
 * para filtrar después. El que necesite precisar lo escribe en el detalle.
 */
export const AREAS = [
  "Pañol",
  "Compras",
  "Obras y producción",
  "Laminación",
  "Materiales y precios",
  "Costos",
  "Calendario y logística",
  "Post venta",
  "RRHH",
  "Usuarios y permisos",
  "Todo el sistema",
];

export const PRIORIDADES = [
  { id: "sin_definir", label: "Sin definir" },
  { id: "alta", label: "Alta" },
  { id: "media", label: "Media" },
  { id: "baja", label: "Baja" },
];

/** La tabla puede no estar creada todavía: la pantalla lo dice en vez de romperse. */
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

/**
 * Todos los tickets, con autor, votos y si el usuario ya votó.
 *
 * @returns {{tickets: any[], falta: boolean}} `falta` = la tabla no existe.
 */
export async function fetchTickets(miId) {
  const { data, error } = await supabase
    .from("sistema_tickets")
    .select("id, titulo, detalle, tipo, pantalla, estado, prioridad, autor_id, asignado_a, resolucion, created_at, updated_at, cerrado_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (faltaLaTabla(error)) return { tickets: [], falta: true };
    throw error;
  }
  const tickets = data || [];
  if (!tickets.length) return { tickets: [], falta: false };

  const ids = tickets.map((ticket) => ticket.id);
  const [votos, personas] = await Promise.all([
    supabase.from("sistema_ticket_votos").select("ticket_id, user_id").in("ticket_id", ids),
    fetchPersonas([
      ...tickets.map((ticket) => ticket.autor_id),
      ...tickets.map((ticket) => ticket.asignado_a),
    ]),
  ]);
  if (votos.error && !faltaLaTabla(votos.error)) throw votos.error;

  const porTicket = new Map();
  for (const fila of votos.data || []) {
    if (!porTicket.has(fila.ticket_id)) porTicket.set(fila.ticket_id, new Set());
    porTicket.get(fila.ticket_id).add(fila.user_id);
  }

  return {
    falta: false,
    tickets: tickets.map((ticket) => {
      const suyos = porTicket.get(ticket.id) || new Set();
      return {
        ...ticket,
        autor: personas.get(ticket.autor_id) || null,
        asignado: personas.get(ticket.asignado_a) || null,
        votos: suyos.size,
        vote: miId ? suyos.has(miId) : false,
      };
    }),
  };
}

/** Los nombres de los que aparecen en la lista, en una sola consulta. */
async function fetchPersonas(ids) {
  const limpios = [...new Set((ids || []).filter(Boolean))];
  if (!limpios.length) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .in("id", limpios);
  if (error) return new Map();
  return new Map((data || []).map((persona) => [persona.id, persona]));
}

/** El hilo de un ticket: comentarios y cambios de estado, del más viejo al más nuevo. */
export async function fetchSeguimiento(ticketId) {
  if (!ticketId) return [];
  const { data, error } = await supabase
    .from("sistema_ticket_seguimiento")
    .select("id, ticket_id, tipo, autor_id, cuerpo, estado_de, estado_a, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) {
    if (faltaLaTabla(error)) return [];
    throw error;
  }
  const filas = data || [];
  const personas = await fetchPersonas(filas.map((fila) => fila.autor_id));
  return filas.map((fila) => ({ ...fila, autor: personas.get(fila.autor_id) || null }));
}

export async function crearTicket({ titulo, detalle, tipo, pantalla }) {
  const limpioTitulo = limpio(titulo);
  if (!limpioTitulo) throw new Error("Poné un título.");
  const { data, error } = await supabase
    .from("sistema_tickets")
    .insert({
      titulo: limpioTitulo,
      detalle: limpio(detalle),
      tipo: TIPOS.some((row) => row.id === tipo) ? tipo : "mejora",
      pantalla: limpio(pantalla),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Cambia lo que se le pasa y nada más.
 *
 * El patch es parcial a propósito: mandar el objeto entero es la forma de
 * pisar sin querer un campo que otro acababa de tocar.
 */
export async function actualizarTicket(id, patch = {}) {
  if (!id) throw new Error("Falta el ticket.");
  const cambios = {};
  if ("titulo" in patch) {
    const texto = limpio(patch.titulo);
    if (!texto) throw new Error("El título no puede quedar vacío.");
    cambios.titulo = texto;
  }
  if ("detalle" in patch) cambios.detalle = limpio(patch.detalle);
  if ("pantalla" in patch) cambios.pantalla = limpio(patch.pantalla);
  if ("tipo" in patch && TIPOS.some((row) => row.id === patch.tipo)) cambios.tipo = patch.tipo;
  if ("estado" in patch && ESTADOS.some((row) => row.id === patch.estado)) cambios.estado = patch.estado;
  if ("prioridad" in patch && PRIORIDADES.some((row) => row.id === patch.prioridad)) cambios.prioridad = patch.prioridad;
  if ("asignado_a" in patch) cambios.asignado_a = patch.asignado_a || null;
  if ("resolucion" in patch) cambios.resolucion = limpio(patch.resolucion);
  if (!Object.keys(cambios).length) return false;

  const { error } = await supabase.from("sistema_tickets").update(cambios).eq("id", id);
  if (error) throw error;
  return true;
}

export async function borrarTicket(id) {
  const { error } = await supabase.from("sistema_tickets").delete().eq("id", id);
  if (error) throw error;
}

/* ── CAPTURAS ─────────────────────────────────────────────────────────────────
   El bucket `ticket-attachments` ya existía y ya es público -lo usa el panel
   del cliente-, así que esto no necesita infraestructura nueva. El prefijo
   `sistema/` mantiene las dos cosas separadas adentro del mismo bucket. */

const BUCKET = "ticket-attachments";
const PESO_MAXIMO = 8 * 1024 * 1024;

/** Sube una imagen y la deja colgada del ticket. Devuelve la fila creada. */
export async function subirAdjunto(ticketId, archivo) {
  if (!ticketId || !archivo) return null;
  if (!String(archivo.type || "").startsWith("image/")) {
    throw new Error("Por ahora sólo imágenes: captura, foto de la pantalla o del papel.");
  }
  if (archivo.size > PESO_MAXIMO) {
    throw new Error("La imagen pesa más de 8 MB. Sacale una captura en vez de la foto entera.");
  }
  // El nombre se limpia porque el path va a una URL: un espacio o una tilde
  // ahí terminan en un enlace que no abre.
  const seguro = String(archivo.name || "captura.png").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const ruta = `sistema/${ticketId}/${Date.now()}_${seguro}`;

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { cacheControl: "3600", upsert: false });
  if (errSubida) throw new Error(errSubida.message || "No se pudo subir la imagen.");

  const { data: publico } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const { data, error } = await supabase
    .from("sistema_ticket_adjuntos")
    .insert({ ticket_id: ticketId, url: publico.publicUrl, nombre: archivo.name || seguro, tipo: archivo.type })
    .select("id, ticket_id, url, nombre, tipo, autor_id, created_at")
    .single();
  if (error) {
    // El archivo ya está arriba pero la fila no entró: se limpia el archivo en
    // vez de dejarlo colgado en el bucket sin nada que lo referencie.
    await supabase.storage.from(BUCKET).remove([ruta]).catch(() => {});
    if (faltaLaTabla(error)) {
      throw new Error("Falta correr la migración de adjuntos (20260907150000_sistema_tickets_adjuntos.sql).");
    }
    throw error;
  }
  return data;
}

/** ¿Está creada la tabla de adjuntos? Se pregunta una vez, al cargar. */
export async function hayAdjuntos() {
  const { error } = await supabase.from("sistema_ticket_adjuntos").select("id").limit(1);
  return !error || !faltaLaTabla(error);
}

export async function fetchAdjuntos(ticketId) {
  if (!ticketId) return [];
  const { data, error } = await supabase
    .from("sistema_ticket_adjuntos")
    .select("id, ticket_id, url, nombre, tipo, autor_id, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) {
    if (faltaLaTabla(error)) return [];
    throw error;
  }
  return data || [];
}

export async function borrarAdjunto(id) {
  const { error } = await supabase.from("sistema_ticket_adjuntos").delete().eq("id", id);
  if (error) throw error;
}

/** Las imágenes que vienen en un pegado o en un arrastre. */
export function imagenesDelEvento(evento) {
  const items = evento?.clipboardData?.items || evento?.dataTransfer?.items;
  const sueltos = evento?.dataTransfer?.files;
  const salida = [];
  for (const item of items || []) {
    if (item.kind === "file" && String(item.type).startsWith("image/")) {
      const archivo = item.getAsFile();
      if (archivo) salida.push(archivo);
    }
  }
  if (!salida.length) {
    for (const archivo of sueltos || []) {
      if (String(archivo.type).startsWith("image/")) salida.push(archivo);
    }
  }
  return salida;
}

export async function comentar(ticketId, cuerpo) {
  const texto = limpio(cuerpo);
  if (!ticketId || !texto) return false;
  const { error } = await supabase
    .from("sistema_ticket_seguimiento")
    .insert({ ticket_id: ticketId, tipo: "comentario", cuerpo: texto });
  if (error) throw error;
  return true;
}

/** Pone o saca mi voto. Devuelve si quedó votado. */
export async function alternarVoto(ticketId, votadoAhora) {
  if (!ticketId) return false;
  if (votadoAhora) {
    const { error } = await supabase
      .from("sistema_ticket_votos")
      .delete()
      .eq("ticket_id", ticketId)
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from("sistema_ticket_votos")
    .insert({ ticket_id: ticketId });
  // Votar dos veces desde dos pestañas no es un error para el usuario: el
  // resultado que quería (su voto puesto) ya está.
  if (error && error.code !== "23505") throw error;
  return true;
}

/** "hace 3 días", "recién". Fechas exactas sólo cuando ya no dicen nada. */
export function haceCuanto(iso) {
  if (!iso) return "";
  const cuando = new Date(iso);
  if (Number.isNaN(cuando.getTime())) return "";
  const minutos = Math.round((Date.now() - cuando.getTime()) / 60000);
  if (minutos < 2) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 31) return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  return cuando.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

export function nombrePersona(persona) {
  // La tabla profiles no guarda nombre y apellido: el username es el nombre con
  // el que se conoce a cada uno acá adentro.
  return persona?.username || "—";
}

export function iniciales(persona) {
  const nombre = nombrePersona(persona);
  if (nombre === "—") return "?";
  return nombre
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0].toUpperCase())
    .join("");
}
