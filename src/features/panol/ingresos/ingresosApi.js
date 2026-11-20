import { supabase } from "@/supabaseClient";
import {
  comentarEnvio,
  crearEnvio,
  enLotesDeIds,
  fetchLinkedPurchaseRequestForEnvio,
  marcarItems,
} from "@/features/panol/panolApi";
import { notifyWaUpdate } from "@/features/compras/purchaseRequestsApi";
import {
  archivarRemito,
  fetchScannedReceipts,
  leerRemitoConIA,
  linkScannedReceiptToIngreso,
  remitoSinLeer,
  scannerReceiptFileUrl,
} from "@/features/panol/remitosScannerApi";
import { mensajeDeNovedad } from "./ingresosLogica";

/**
 * Lecturas y escrituras del mostrador de ingresos. Las escrituras son las
 * mismas de siempre (panol_marcar_items para recibir un renglón de un pedido,
 * panol_crear_envio con origen "remito" para lo que llega sin pedido): sólo
 * cambia la pantalla.
 */

const CERRADOS = "(recibido,cerrado,cancelado)";

/**
 * Los envíos abiertos de la sede con sus renglones, cada renglón con la obra
 * del requerimiento al que apunta y la ficha del producto (ubicación y
 * códigos de barras, para que el lector lo reconozca). En lotes: todos los
 * pedidos abiertos juntos son varios cientos de renglones.
 */
export async function fetchPedidosEnCamino(sede) {
  let q = supabase
    .from("panol_envios")
    .select("id,titulo,sede,estado,prioridad,origen,obra_id,purchase_request_id,created_at,obra:produccion_obras(id,codigo),items:panol_envio_items(*)")
    .not("estado", "in", CERRADOS)
    .order("created_at", { ascending: true });
  if (sede) q = q.eq("sede", sede);
  const { data, error } = await q;
  if (error) throw error;
  const envios = data ?? [];
  const items = envios.flatMap((e) => e.items || []);

  const snapshotIds = items.map((it) => it.obra_snapshot_item_id).filter(Boolean);
  const materialIds = items.map((it) => it.material_id).filter(Boolean);

  const [snapshots, materiales, codigos] = await Promise.all([
    enLotesDeIds(snapshotIds, async (lote) => {
      const r = await supabase
        .from("panol_obra_materiales_snapshot")
        .select("id, obra_id, obra:produccion_obras!panol_obra_materiales_snapshot_obra_id_fkey(id,codigo)")
        .in("id", lote);
      return r.error ? [] : r.data;
    }).catch(() => []),
    enLotesDeIds(materialIds, async (lote) => {
      const r = await supabase
        .from("panol_materiales")
        .select("id,codigo_barra,codigo,descripcion,unidad_medida,ubicacion,ubicacion_obs,imagen_url,es_consumible")
        .in("id", lote);
      if (r.error) throw r.error;
      return r.data;
    }),
    enLotesDeIds(materialIds, async (lote) => {
      const r = await supabase
        .from("panol_material_codigos_barra")
        .select("material_id,codigo,activo")
        .in("material_id", lote)
        .eq("activo", true);
      return r.error ? [] : r.data;
    }).catch(() => []),
  ]);

  const porSnapshot = new Map(snapshots.map((s) => [s.id, s]));
  const codigosPorMaterial = new Map();
  for (const c of codigos) {
    if (!codigosPorMaterial.has(c.material_id)) codigosPorMaterial.set(c.material_id, []);
    codigosPorMaterial.get(c.material_id).push(c);
  }
  const porMaterial = new Map(materiales.map((m) => [m.id, { ...m, codigos_barra: codigosPorMaterial.get(m.id) ?? [] }]));

  return envios.map((e) => ({
    ...e,
    items: (e.items || []).map((it) => {
      const fila = porSnapshot.get(it.obra_snapshot_item_id);
      return {
        ...it,
        material: porMaterial.get(it.material_id) || null,
        obra_id: fila ? fila.obra_id : e.obra_id,
        obra_codigo: (fila ? fila.obra?.codigo : e.obra?.codigo) || "",
        stock_general: fila ? !fila.obra_id : !it.obra_snapshot_item_id && !e.obra_id && !it.purchase_request_item_id,
      };
    }),
  }));
}

/** Lo último que entró en la sede (recibido o parcial), para la columna de la derecha. */
export async function fetchUltimosIngresos(sede, { limite = 80 } = {}) {
  let q = supabase
    .from("panol_envio_items")
    .select("id,envio_id,descripcion,cantidad,cantidad_recibida,unidad,estado,marcado_at,updated_at,created_at,envio:panol_envios!inner(id,titulo,sede,origen)")
    .in("estado", ["recibido", "parcial"])
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (sede) q = q.eq("envio.sede", sede);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Registra el ingreso. Primero lo que llegó sin pedido (un envío nuevo, todo
 * de una vez), después cada renglón de pedido. Devuelve lo que se hizo para
 * poder decir qué quedó si algo falla a mitad de camino.
 */
export async function registrarIngreso({ recibir = [], crear = null, actor = null } = {}) {
  const hecho = { creado: null, recibidos: [] };

  if (crear) {
    hecho.creado = await crearEnvio({
      titulo: crear.titulo,
      sede: crear.sede,
      origen: crear.origen,
      prioridad: "media",
      items: crear.items,
    });
  }

  // Los pedidos de Compras avisan por WhatsApp cuando se completan: se mira
  // cómo estaban antes y cómo quedaron.
  const envios = [...new Set(recibir.map((r) => r.envioId))];
  const antes = new Map();
  await Promise.all(envios.map(async (id) => {
    const linked = await fetchLinkedPurchaseRequestForEnvio(id).catch(() => null);
    if (linked) antes.set(id, linked);
  }));

  for (const r of recibir) {
    await marcarItems([r.id], r.estado, { cantidadRecibida: r.cantidadRecibida });
    hecho.recibidos.push(r.id);
  }

  await Promise.all([...antes.entries()].map(async ([envioId, prev]) => {
    if (prev.status === "recibido") return;
    const despues = await fetchLinkedPurchaseRequestForEnvio(envioId).catch(() => null);
    if (despues?.status !== "recibido") return;
    notifyWaUpdate({
      requestId: despues.id,
      eventType: "received",
      actorId: actor?.id || null,
      payload: {
        quantity: despues.received_quantity || "",
        notes: despues.receipt_notes || "Recepcionado por Pañol.",
        actorName: actor?.username || "Pañol",
      },
    });
  }));

  return hecho;
}

/**
 * Una novedad de un renglón. Con `estado` cambia el renglón (falta stock, sin
 * info, rechazado o de vuelta a pendiente) y deja el mensaje en el historial
 * del pedido; sin `estado` (ya llegó una parte) sólo deja el mensaje.
 */
export async function guardarNovedad({ renglon, estado = null, nota = "" }) {
  const mensaje = mensajeDeNovedad(renglon, estado, nota);
  if (!estado) {
    await comentarEnvio(renglon.envioId, `Novedad · ${mensaje}`);
    return { comentado: true };
  }
  await marcarItems([renglon.id], estado, { nota: String(nota || "").trim() || null });
  // El estado ya quedó; el mensaje es para que Compras lo vea en el historial.
  const comentado = await comentarEnvio(renglon.envioId, `Novedad · ${mensaje}`).then(() => true, () => false);
  return { comentado };
}

// ── Remitos escaneados ──────────────────────────────────────────────────────
// Las mismas piezas del escáner de remitos (remitosScannerApi): el papel se
// guarda siempre y después la IA lo lee. Acá sólo cambia a dónde van los
// renglones leídos: al carrito del mostrador, no al ingreso completo.

const REMITO_CERRADO = new Set(["ingresado", "archivado"]);

/** Los remitos de la sede que se escanearon y todavía no se terminaron de ingresar. */
export async function fetchRemitosPorIngresar(sede) {
  const lista = await fetchScannedReceipts({ sede, limit: 40 });
  return lista.filter((r) => r.es_consumible !== true
    && !REMITO_CERRADO.has(r.recepcion_estado)
    && !((r.items || []).length && r.items.every((it) => it.scanner_ingreso_envio_id)));
}

/**
 * Guarda el archivo y lo lee. Devuelve el remito con sus renglones, o el
 * motivo por el que la IA no pudo (el papel queda guardado igual).
 */
export async function escanearRemito(file, { sede }) {
  const { receipt, lectura, duplicado } = await archivarRemito(file, { sede });
  if (duplicado) {
    if (remitoSinLeer(receipt)) return releerRemito(receipt);
    return { ok: true, receipt, duplicado: true, dudas: [] };
  }
  if (lectura && !lectura.ok) return { ok: false, receipt, mensaje: lectura.mensaje };
  return { ok: true, receipt: lectura?.receipt || receipt, duplicado: false, dudas: lectura?.dudas || [] };
}

/** Lee (o relee) un remito ya guardado que no tiene renglones. */
export async function releerRemito(receipt) {
  const lectura = await leerRemitoConIA(receipt);
  if (!lectura.ok) return { ok: false, receipt: lectura.receipt || receipt, mensaje: lectura.mensaje };
  return { ok: true, receipt: lectura.receipt, duplicado: false, dudas: lectura.dudas || [] };
}

export { remitoSinLeer, scannerReceiptFileUrl };

/**
 * Marca los renglones del remito como ingresados en el envío donde quedaron.
 * Va en orden: cada llamada recalcula el estado del remito con todo lo anterior.
 */
export async function vincularRemito(remitoId, vinculos = []) {
  for (const v of vinculos) {
    await linkScannedReceiptToIngreso(remitoId, v.envioId, v.items);
  }
}
