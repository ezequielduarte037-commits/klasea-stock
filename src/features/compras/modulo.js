import { createContext, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { REQUEST_STATUSES } from "./purchaseRequestsApi";

// Datos y reglas del módulo de Compras que usan varias vistas. Sin componentes:
// un archivo que exporta componentes no puede exportar además constantes sin
// romper el refresco en caliente de Vite.

// ── Estados del pedido ──────────────────────────────────────────────────────
// Los colores son los mismos que Compras usaba (nuevo azul, revisión violeta,
// cotizando cian, comprado naranja, recibido verde, cancelado rojo). Cada uno
// tiene además su ícono, para que se distingan aunque no se registre el color.
export const ESTADOS = [
  { value: "nuevo", label: "Nuevo", tono: "azul", Icon: Plus, ayuda: "Compras todavía no lo tomó" },
  { value: "en_revision", label: "En revisión", corto: "Revisión", tono: "violeta", Icon: Search, ayuda: "Compras lo está revisando" },
  { value: "cotizando", label: "Cotizando", tono: "cian", Icon: Clock, ayuda: "Esperando presupuesto del proveedor" },
  { value: "comprado", label: "Comprado", tono: "naranja", Icon: Truck, ayuda: "Ya se compró: viene en camino" },
  { value: "recibido", label: "Recibido", tono: "verde", Icon: CheckCircle2, ayuda: "Llegó y quedó cerrado" },
  { value: "cancelado", label: "Cancelado", tono: "rojo", Icon: Ban, ayuda: "No se va a comprar" },
];
// El recorrido normal, sin el cancelado.
export const RECORRIDO = ESTADOS.slice(0, 5);
export const ESTADOS_CERRADOS = ["recibido", "cancelado"];

export function estadoDe(value) {
  return ESTADOS.find((e) => e.value === value)
    || { value, label: REQUEST_STATUSES.find((s) => s.value === value)?.label || value || "—", tono: "neutro", Icon: Clock };
}

export function estaCerrado(request) {
  return ESTADOS_CERRADOS.includes(request?.status);
}

// ── Prioridad ───────────────────────────────────────────────────────────────
export const PRIORIDADES = [
  { value: "baja", label: "Baja", tono: "neutro" },
  { value: "media", label: "Media", tono: "azul" },
  { value: "alta", label: "Alta", tono: "violeta" },
  { value: "urgente", label: "Urgente", tono: "rojo" },
];

export function prioridadDe(value) {
  return PRIORIDADES.find((p) => p.value === value) || PRIORIDADES[1];
}

// ── Avisos a compras ────────────────────────────────────────────────────────
export const AVISO_ESTADOS = [
  { value: "nuevo", label: "Nuevo", tono: "azul" },
  { value: "visto", label: "Visto", tono: "violeta" },
  { value: "en_proceso", label: "En proceso", tono: "cian" },
  { value: "resuelto", label: "Resuelto", tono: "verde" },
  { value: "descartado", label: "Descartado", tono: "rojo" },
];
export const AVISO_ACTIVOS = ["nuevo", "visto", "en_proceso"];

export function avisoEstadoDe(value) {
  return AVISO_ESTADOS.find((s) => s.value === value) || AVISO_ESTADOS[0];
}

// ── Estado de cada renglón de un pedido ─────────────────────────────────────
export const ITEM_TONOS = {
  pendiente: "neutro",
  en_panol: "azul",
  pedido: "cian",
  parcial: "violeta",
  recibido: "verde",
  cancelado: "rojo",
};

// Origen de los pedidos que arman otros módulos.
export const ORIGENES = {
  laminacion: { label: "Laminación", tono: "teal" },
  madera: { label: "Maderas", tono: "cian" },
  maderas: { label: "Maderas", tono: "cian" },
  inventario: { label: "Inventario", tono: "violeta" },
  adicionales: { label: "Adicionales", tono: "verde" },
  torneria: { label: "Tornería", tono: "azul" },
  muebles: { label: "Muebles", tono: "teal" },
};

export const UNIDADES = ["unidad", "par", "juego", "metro", "pies", "m²", "kg", "litro", "lata", "rollo", "caja", "tubo", "bolsa"];
export const STOCK_DESTINOS = ["Stock Chubut 2120", "Stock Pampa 1050"];

// ── Fechas y textos ─────────────────────────────────────────────────────────
function soloFecha(value) {
  if (!value) return null;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Días desde la fecha hasta hoy (positivo si ya pasó).
export function diasDesde(value, hoy = new Date()) {
  const a = soloFecha(value);
  const b = soloFecha(hoy);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function fmtFecha(value, { anio = true } = {}) {
  const d = soloFecha(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", anio ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "2-digit", month: "short" });
}

export function fmtFechaHora(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// "hoy", "hace 3 días", "en 2 días"…
export function textoRelativo(value) {
  const dias = diasDesde(value);
  if (dias == null) return "";
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias === -1) return "mañana";
  if (dias > 0) return dias < 45 ? `hace ${dias} días` : `hace ${Math.round(dias / 30)} meses`;
  return -dias < 45 ? `en ${-dias} días` : `en ${Math.round(-dias / 30)} meses`;
}

export function fmtPesos(value) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

export function fmtTamano(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function textoPlano(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function iniciales(nombre) {
  const partes = String(nombre || "").split(/[\s._-]+/).filter(Boolean);
  return (partes.map((p) => p[0]).slice(0, 2).join("") || "?").toUpperCase();
}

export function destinoDe(request) {
  return request?.project?.codigo || (request?.destino || "").trim() || "";
}

// ── Vencimiento y motivo de atención ────────────────────────────────────────
export function fechaLimite(request) {
  return request?.estimated_delivery_at || request?.needed_at || null;
}

// Por qué un pedido pide atención, con un puntaje para ordenar. Las reglas son
// las de la bandeja de siempre: sin leer, vencido, urgente, alta, comprado sin
// cerrar, nuevo.
export function motivoDe(request, sinLeer = false) {
  const limite = fechaLimite(request);
  const vencido = limite && !estaCerrado(request) ? diasDesde(limite) : null;
  if (sinLeer) return { label: "Mensaje sin leer", tono: "violeta", score: 95 };
  if (vencido != null && vencido > 0) return { label: `Vencido hace ${vencido} ${vencido === 1 ? "día" : "días"}`, tono: "rojo", score: 90 };
  if (request.priority === "urgente") return { label: "Urgente", tono: "rojo", score: 85 };
  if (request.priority === "alta") return { label: "Alta prioridad", tono: "violeta", score: 74 };
  if (request.status === "comprado") return { label: "Comprado, falta recibir", tono: "naranja", score: 58 };
  if (request.status === "nuevo") return { label: "Nuevo", tono: "azul", score: 45 };
  const e = estadoDe(request.status);
  return { label: e.label, tono: e.tono, score: 20 };
}

// Los grupos de la bandeja, en el orden en que hay que atenderlos.
export const GRUPOS_BANDEJA = [
  { key: "critico", label: "Urgentes y vencidos", texto: "Pasaron la fecha o están marcados urgentes", tono: "rojo" },
  { key: "revisar", label: "A revisar", texto: "Nuevos, en revisión o con un mensaje sin leer", tono: "azul" },
  { key: "cotizando", label: "Cotizando", texto: "Esperando presupuesto del proveedor", tono: "cian" },
  { key: "cerrar", label: "Comprados por recibir", texto: "Ya se compraron, falta que lleguen", tono: "naranja" },
  { key: "otros", label: "Otros abiertos", texto: "Sin clasificar", tono: "neutro" },
];

// Cada pedido abierto cae en UN grupo y en uno solo, en este orden, así la
// suma de los grupos es exactamente la cantidad de pedidos abiertos.
export function armarBandeja(requests = [], avisos = [], sinLeer = new Set()) {
  const abiertos = requests.filter((r) => !estaCerrado(r));
  const avisosActivos = avisos.filter((a) => AVISO_ACTIVOS.includes(a.estado));
  const ordenar = (lista) => [...lista].sort((a, b) => (
    motivoDe(b, sinLeer.has(b.id)).score - motivoDe(a, sinLeer.has(a.id)).score
    || new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
  ));
  const grupoDe = (r) => {
    const limite = fechaLimite(r);
    const dias = limite ? diasDesde(limite) : null;
    if ((dias != null && dias > 0) || r.priority === "urgente") return "critico";
    if (["nuevo", "en_revision"].includes(r.status) || sinLeer.has(r.id) || (dias != null && dias >= -2)) return "revisar";
    if (r.status === "cotizando") return "cotizando";
    if (r.status === "comprado") return "cerrar";
    return "otros";
  };
  const grupos = { critico: [], revisar: [], cotizando: [], cerrar: [], otros: [] };
  for (const r of abiertos) grupos[grupoDe(r)].push(r);
  for (const k of Object.keys(grupos)) grupos[k] = ordenar(grupos[k]);
  return { abiertos, avisosActivos, grupos };
}

// Filtros de la lista completa (viven en la URL).
export const FILTROS_VACIOS = { q: "", status: "activos", priority: "todos", creator: "todos", project: "todos", dateFrom: "", dateTo: "" };
export const CLAVES_FILTRO = Object.keys(FILTROS_VACIOS);

// ── Pestañas ────────────────────────────────────────────────────────────────
export const TABS_GESTION = ["pendientes", "lista", "comprar", "avisos", "planilla", "matriz", "faltantes", "dashboard", "registro", "adicionales", "caja", "ruta"];
export const TABS_PEDIDOR = ["mine", "cc", "avisos"];

// Para que los diálogos se dibujen adentro de la raíz del módulo (sus estilos
// van con ámbito) sin quedar atrapados por un ancestro con transform.
export const RaizCompras = createContext(null);

// Borradores del pedido nuevo (por usuario, en este navegador).
export const BORRADOR_ACTUAL = "purchase-request-create-draft";
export const BORRADORES_GUARDADOS = "purchase-request-saved-drafts";
export const BORRADORES_MAX = 4;
export const BORRADOR_VIDA_MS = 30 * 24 * 60 * 60 * 1000;

// Tarjetas o lista, cada pantalla con la suya (la bandeja arranca en lista,
// todos los pedidos en tarjetas). Se recuerda en este navegador.
export function useVistaPedidos(donde = "pedidos", defecto = "tarjetas") {
  const clave = `cmp_vista_${donde}`;
  const [vista, setVista] = useState(() => {
    try {
      const guardada = localStorage.getItem(clave);
      return guardada === "lista" || guardada === "tarjetas" ? guardada : defecto;
    } catch { return defecto; }
  });
  const cambiar = (v) => {
    setVista(v);
    try { localStorage.setItem(clave, v); } catch { /* opcional */ }
  };
  return [vista, cambiar];
}
