import { supabase } from "@/supabaseClient";
import { getDesmoldeReference, parseISODate } from "@/features/obras/fechasEngine";
import { fetchOverdueRequests } from "@/features/compras/purchaseRequestsApi";
import { cargarDatosCalendario } from "@/features/compras/calendario/calendarioApi";
import { armarPedidos, sugerirSemanasRubro } from "@/features/compras/calendario/calendario";

/*
 * Atrasos de hoy: lo que ya pasó su fecha, sacado de donde cada área lo mide.
 * Cada cargador cuenta igual que su pantalla de origen (el calendario de
 * Compras, la bandeja de pedidos, Recepción del pañol, Fechas de Obras), así
 * el número del tablero coincide con lo que se ve al abrirla.
 */

const MS_DIA = 86_400_000;
// Un aviso de ingreso tarda unos días en llegar; recién después de una semana
// sin recibirse se cuenta como atrasado.
export const DIAS_AVISO_SIN_RECIBIR = 7;
// Un faltante que reportó el pañol y Compras todavía no movió.
export const DIAS_FALTANTE_SIN_MOVER = 3;
// Igual que la agenda de Fechas: un hito vencido hace más de tres meses ya no
// se gestiona desde ahí (son barcos botados con hitos que nadie marcó).
export const DIAS_HITO_MAXIMO = 90;

function hoyLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diasDesde(fecha, hoy = hoyLocal()) {
  const d = fecha instanceof Date ? fecha : parseISODate(String(fecha || "").slice(0, 10));
  if (!d) return null;
  return Math.round((hoy.getTime() - d.getTime()) / MS_DIA);
}

/** Pedidos de ítems estándar (proveedor × obra) cuya fecha de compra ya pasó. */
export async function cargarComprasAtrasadas() {
  const datos = await cargarDatosCalendario();
  const rubros = new Map();
  for (const m of datos.matriz || []) {
    if (!m.categoria_id) continue;
    const k = `${m.linea}|${m.categoria_id}`;
    if (!rubros.has(k)) rubros.set(k, { linea: m.linea, categoria_id: m.categoria_id, rubro: m.rubro });
  }
  const sugeridas = sugerirSemanasRubro([...rubros.values()], datos.llegadas || []);
  const r = armarPedidos({ ...datos, sugeridas, hoy: new Date(), semanasALaVista: 1 });
  const hoy = hoyLocal();
  return r.proveedores
    .flatMap((p) => p.pedidos.filter((ped) => ped.atrasado).map((ped) => ({
      clave: ped.clave,
      proveedor: p.proveedor,
      sinProveedor: !p.clave,
      obra: ped.obra,
      items: ped.items.length,
      desde: ped.comprarAntes,
      dias: diasDesde(ped.comprarAntes, hoy),
    })))
    .sort((a, b) => b.dias - a.dias || b.items - a.items);
}

/** Pedidos a Compras abiertos que pasaron su fecha (la misma regla que la bandeja). */
export async function cargarPedidosVencidos() {
  const filas = await fetchOverdueRequests();
  const hoy = hoyLocal();
  return filas
    .map((p) => {
      const desde = p.estimated_delivery_at || p.needed_at;
      return {
        id: p.id,
        titulo: p.title || "Pedido sin título",
        destino: p.destino || "",
        estado: p.status,
        pidio: p.creator?.username || "",
        porEntrega: !!p.estimated_delivery_at,
        desde,
        dias: diasDesde(desde, hoy),
      };
    })
    .sort((a, b) => b.dias - a.dias);
}

/** Avisos de ingreso al pañol que hace más de una semana esperan la recepción. */
export async function cargarAvisosSinRecibir() {
  const limite = new Date(Date.now() - DIAS_AVISO_SIN_RECIBIR * MS_DIA).toISOString();
  const { data, error } = await supabase
    .from("panol_envios")
    .select("id,titulo,sede,estado,obra_id,created_at")
    .in("estado", ["enviado", "parcial"])
    .lt("created_at", limite)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((e) => e.obra_id).filter(Boolean))];
  const obras = new Map();
  if (ids.length) {
    const { data: rows } = await supabase.from("produccion_obras").select("id,codigo").in("id", ids);
    for (const o of rows ?? []) obras.set(o.id, o.codigo);
  }
  const hoy = hoyLocal();
  return (data ?? []).map((e) => ({
    id: e.id,
    titulo: e.titulo || "Aviso sin título",
    sede: e.sede || "",
    parcial: e.estado === "parcial",
    obra: obras.get(e.obra_id) || "",
    desde: e.created_at,
    dias: diasDesde(new Date(e.created_at), hoy),
  }));
}

function lineaDeCodigo(codigo) {
  return String(codigo ?? "").trim().toUpperCase().replace(/^K/, "").split(/[-\s/]/)[0] || "";
}

const normModelo = (m) => String(m ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, "");

/**
 * Hitos de Fechas (madera, vidrios, motor, tanques…) que pasaron su fecha sin
 * que nadie los marque pedidos, en curso o hechos. Misma cuenta que la agenda
 * de Fechas: hito = desmolde (o botada) + semanas de la línea, vencido hace
 * menos de tres meses.
 */
export async function cargarHitosVencidos() {
  const [obrasRes, eventosRes, offsetsRes, estadosRes] = await Promise.all([
    supabase.from("produccion_obras").select("id,codigo,estado,desmolde_estimado,desmolde_real,atraso_dias,botada,botada_real").eq("solo_stock", false).neq("estado", "terminada"),
    supabase.from("fechas_eventos").select("key,label,activo,modelos").order("orden"),
    supabase.from("fechas_offsets").select("evento_key,modelo,semanas,referencia"),
    supabase.from("fechas_evento_estados").select("obra_id,evento_key"),
  ]);
  for (const r of [obrasRes, eventosRes, offsetsRes, estadosRes]) if (r.error) throw r.error;

  const offsets = offsetsRes.data ?? [];
  const offset = (key, token) => {
    const fila = offsets.find((o) => o.evento_key === key && o.modelo === token)
      || offsets.find((o) => o.evento_key === key && o.modelo !== "*" && normModelo(o.modelo) === normModelo(token))
      || offsets.find((o) => o.evento_key === key && o.modelo === "*");
    return fila ? { semanas: Number(fila.semanas) || 0, referencia: fila.referencia === "botada" ? "botada" : "desmolde" } : null;
  };
  const gestionados = new Set((estadosRes.data ?? []).map((e) => `${e.obra_id}|${e.evento_key}`));
  const eventos = (eventosRes.data ?? []).filter((e) => e.activo !== false && e.key !== "__botada__");
  const hoy = hoyLocal();
  const filas = [];
  for (const obra of obrasRes.data ?? []) {
    const token = lineaDeCodigo(obra.codigo);
    const desmolde = getDesmoldeReference(obra);
    const reglaBotada = offset("__botada__", token);
    const botBase = parseISODate(obra.botada_real) || parseISODate(obra.botada)
      || (reglaBotada && desmolde.base ? new Date(desmolde.base.getTime() + reglaBotada.semanas * 7 * MS_DIA) : null);
    const botRef = botBase ? new Date(botBase.getTime() + desmolde.delayDays * MS_DIA) : null;
    for (const ev of eventos) {
      if (Array.isArray(ev.modelos) && ev.modelos.length && !ev.modelos.some((m) => normModelo(m) === normModelo(token))) continue;
      if (gestionados.has(`${obra.id}|${ev.key}`)) continue;
      const off = offset(ev.key, token);
      if (!off) continue;
      const ref = off.referencia === "botada" ? botRef : desmolde.projected;
      if (!ref) continue;
      const fecha = new Date(ref.getTime() + off.semanas * 7 * MS_DIA);
      const dias = diasDesde(fecha, hoy);
      if (dias > 0 && dias <= DIAS_HITO_MAXIMO) filas.push({ clave: `${obra.id}|${ev.key}`, obra: obra.codigo, hito: ev.label, desde: fecha, dias });
    }
  }
  return filas.sort((a, b) => b.dias - a.dias);
}

/** Faltantes que reportó el pañol y Compras todavía no empezó a resolver. */
export async function cargarFaltantesSinMover() {
  const limite = new Date(Date.now() - DIAS_FALTANTE_SIN_MOVER * MS_DIA).toISOString();
  const { data, error } = await supabase
    .from("panol_faltantes_compras")
    .select("id,descripcion,cantidad_faltante,unidad,estado,sede,obra_texto,created_at,obra:produccion_obras!panol_faltantes_compras_obra_id_fkey(codigo)")
    .eq("estado", "nuevo")
    .lt("created_at", limite)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const hoy = hoyLocal();
  return (data ?? []).map((f) => ({
    id: f.id,
    titulo: f.descripcion || "Faltante sin descripción",
    cantidad: f.cantidad_faltante,
    sede: f.sede || "",
    unidad: f.unidad || "",
    obra: f.obra?.codigo || f.obra_texto || "",
    desde: f.created_at,
    dias: diasDesde(new Date(f.created_at), hoy),
  }));
}

/** Obras cuya primera etapa sin terminar ya tendría que estar terminada. */
export function obrasAtrasadas(obras = [], planes = new Map()) {
  return obras
    .filter((o) => o.estado === "activa")
    .map((o) => ({ obra: o, plan: planes.get(o.id) }))
    .filter(({ plan }) => plan?.atraso > 0 && plan.primeraAbierta)
    .map(({ obra, plan }) => ({
      id: obra.id,
      obra: obra.codigo,
      etapa: plan.primeraAbierta.nombre || "Etapa",
      desde: plan.primeraAbierta.fin,
      dias: plan.atraso,
      estimado: plan.atrasoEstimado,
    }))
    .sort((a, b) => b.dias - a.dias);
}
