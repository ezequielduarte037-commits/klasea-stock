
import {aporteDeFilaLedger,cantidadesDeFila} from '../src/features/materiales/obra/estadoDeFila.js';
import {separarRecepcionesDeMatriz} from '../src/features/materiales/obra/recepcionesDeMatriz.js';
import {adicionalSnapshotKey} from '../src/features/materiales/obra/adicionalObra.js';
const C={};
const norm=(v)=>String(v||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const toNum=(v)=>v==null||v===''?null:Number(String(v).replace(',','.'));
const priceInfo=(m)=>({proveedor:m?.proveedor,text:''});
const addonPriceInfo=(a,m)=>priceInfo(m||a);
const addonTipoMeta=(tipo)=>({label:tipo});
const categoriaNombre=(cats,id)=>cats.find(c=>c.id===id)?.nombre||'';
const rubroDeLista=categoriaNombre;
const nombreProveedorVisible=(v)=>v;
const reviewReasonForText=()=>null;
const normalizeProductSpecs=(v)=>v||{};
const fmtMoney=(v)=>String(v);
const qtyText=(v,u)=>v+' '+u;
const normalizeMaterialLinks=(v)=>v||[];

function addonRowToView(addon, materialById, categorias = []) {
  const material = materialById.get(addon.material_id) || null;
  const tipoMeta = addonTipoMeta(addon.tipo);
  const precio = addonPriceInfo(addon, material);
  const descripcion = material?.descripcion || addon.descripcion || "Item adicional";
  const codigo = material?.codigo || addon.codigo || "";
  const unidad = addon.unidad || material?.unidad_medida || "unidad";
  const rubro = material ? categoriaNombre(categorias, material.categoria_id) : categoriaNombre(categorias, addon.categoria_id) || (addon.tipo === "opcional" ? "Opcionales" : "Adicionales");
  const reason = reviewReasonForText(`${descripcion} ${codigo} ${addon.observaciones || ""}`);
  return {
    id: `addon:${addon.id}`,
    addonId: addon.id,
    snapshotId: addon.obra_snapshot_id || null,
    materialId: addon.material_id || null,
    material,
    source: addon.obra_snapshot_id ? "adicional_obra" : "addon",
    descripcion,
    codigo,
    cantidad: addon.cantidad || 1,
    unidad,
    proveedor: nombreProveedorVisible(precio.proveedor || material?.proveedor || addon.proveedor) || "Sin proveedor",
    rubro,
    precio,
    bucket: { key: "addon", label: tipoMeta.label, color: tipoMeta.color },
    obs: addon.observaciones || material?.notas || "",
    imagen_url: material?.imagen_url || addon.imagen_url || "",
    links: normalizeMaterialLinks(material?.links?.length ? material.links : addon.links),
    variante: addon.variante || "",
    revisado: material?.revisado ?? true,
    review: { flag: !!reason || !!material?.review?.flag, reason: reason || material?.review?.reason || "" },
    estadoObra: addon.estado || "pendiente",
  };
}

function accionDeFila(row) {
  const q = cantidadesDeFila(row);
  const recepcion = String(row?.recepcion_estado || "").toLowerCase();

  if (recepcion === "rechazado") return { texto: "RECHAZADO", color: C.red, trabado: true };
  if (recepcion === "falta_stock") return { texto: "SIN STOCK", color: C.red, trabado: true };
  if (recepcion === "problema" || recepcion === "sin_info") return { texto: "PROBLEMA", color: C.red, trabado: true };
  if (row?.esRequisito && !row?.productoMaterialId && q.panol === 0) {
    return { texto: "DEFINIR PRODUCTO", color: C.red, trabado: true };
  }
  if (q.faltaEntregar > 0) return { texto: `RETIRAR ${fmtQtyCorto(q.faltaEntregar)}`, color: C.violet };
  if (q.faltaComprar > 0) return { texto: `COMPRAR ${fmtQtyCorto(q.faltaComprar)}`, color: C.blue };
  if (q.enCompras > 0) return { texto: `EN COMPRAS ${fmtQtyCorto(q.enCompras)}`, color: C.cyan };
  if (q.entregado > 0 && q.entregado >= q.necesita) return { texto: "LISTO", color: C.t3 };
  return { texto: "—", color: C.t3 };
}

function fmtQtyCorto(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
}

function totalAjusteCondicionantes(row) {
  return (row?.condicionantes ?? []).reduce((total, detalle) => total + (toNum(detalle?.delta) || 0), 0);
}

function snapshotBucket(row) {
  const key = row?.es_adicional === true ? "addon" : row?.tipo || "base";
  if (key === "linea_eje") return { key, label: row?.tipo_label || "Linea eje", color: C.violet };
  if (key === "variante") return { key, label: row?.tipo_label || "Variante", color: C.cyan };
  if (key === "condicionante") return { key, label: row?.tipo_label || "Condicionante", color: C.violet };
  if (key === "addon") return { key, label: row?.tipo_label || "Addon", color: C.blue };
  return { key: "base", label: row?.tipo_label || "Base", color: C.green };
}

function originalSnapshotLabel(snapshotDescripcion, catalogDescripcion) {
  const original = String(snapshotDescripcion || "").trim();
  const catalog = String(catalogDescripcion || "").trim();
  if (!original || !catalog || norm(original) === norm(catalog)) return "";
  return `Pedido original: ${original}`;
}

function snapshotRowToView(row, materialById = new Map(), categorias = []) {
  const requisitoMaterialId = row?.requisito_material_id || row?.material_id || null;
  const productoMaterialId = row?.material_id && row.material_id !== requisitoMaterialId ? row.material_id : null;
  const requisito = requisitoMaterialId ? materialById.get(requisitoMaterialId) || null : null;
  const producto = productoMaterialId ? materialById.get(productoMaterialId) || null : null;
  const material = requisito || producto;
  const priceMaterial = producto || material;
  const materialPrice = priceMaterial ? priceInfo(priceMaterial) : null;
  const snapshotAmount = row?.precio_unitario != null && row.precio_unitario !== "" ? Number(row.precio_unitario) : null;
  const amount = Number.isFinite(materialPrice?.amount) && materialPrice.amount > 0 ? materialPrice.amount : snapshotAmount;
  const moneda = materialPrice?.moneda || (row?.moneda === "USD" ? "USD" : "ARS");
  const descripcion = requisito?.descripcion || row.descripcion || producto?.descripcion;
  const codigo = requisito?.codigo || row.codigo;
  const proveedor = nombreProveedorVisible(producto?.proveedor || row.proveedor || materialPrice?.proveedor || material?.proveedor) || "Sin proveedor";
  const rubroMaterial = requisito || producto;
  // El rubro no es una foto: es la clasificación de hoy. El texto guardado en el
  // snapshot quedó congelado cuando se creó la fila y arrastra nombres que ya no
  // existen, así que sólo se usa si la fila no llegó a ningún material.
  const rubro = rubroMaterial ? rubroDeLista(categorias, rubroMaterial.categoria_id) : row.rubro || "Sin rubro";
  const pedidoOriginal = originalSnapshotLabel(row.descripcion, requisito?.descripcion || producto?.descripcion);
  const obs = mergeNotes(producto?.notas || material?.notas || "", mergeNotes(row.notas || "", pedidoOriginal));
  const reason = reviewReasonForText(`${descripcion || ""} ${codigo || ""} ${obs || ""}`);
  const esAdicional = row.es_adicional === true || row.tipo === "addon" || row.source === "addon";
  return {
    id: row.id,
    snapshotId: row.id,
    materialId: requisitoMaterialId,
    requisitoMaterialId,
    productoMaterialId,
    producto,
    productoEstandar: row.producto_asignacion_origen === "matriz_linea",
    productoConfiguracionOrigen: row.producto_asignacion_origen || null,
    esRequisito: requisito?.es_requisito === true || !!productoMaterialId || !!row.variante,
    especificaciones: normalizeProductSpecs(row.especificaciones),
    especificacionesOrigen: row.especificaciones_origen || null,
    material,
    source: row.source === "adicional_obra" || isLedgerOnlySnapshot({...row,snapshot_tipo:row.tipo}) ? row.source : esAdicional ? "addon" : row.source || "snapshot",
    snapshot_tipo: isLedgerOnlySnapshot({...row,snapshot_tipo:row.tipo}) ? row.tipo : esAdicional ? "addon" : row.tipo || null,
    es_adicional: esAdicional,
    descripcion,
    snapshotDescripcion: row.descripcion,
    descripcionOriginal: pedidoOriginal ? row.descripcion : "",
    codigo,
    cantidad: row.cantidad || 1,
    unidad: row.unidad || producto?.unidad_medida || material?.unidad_medida || "unidad",
    proveedor,
    rubro,
    precio: {
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      moneda,
      text: Number.isFinite(amount) && amount > 0 ? fmtMoney(amount, moneda) : materialPrice?.text || "Sin precio",
      proveedor,
    },
    bucket: snapshotBucket(row),
    obs,
    variante: row.variante || "",
    revisado: material?.revisado ?? true,
    review: { flag: !!reason, reason },
    snapshot_estado: row.estado || null,
    // Va el estado crudo del snapshot. Antes acá se pisaba con el que deducía
    // la recepción, y como esa deducción da "en_panol" para casi cualquier
    // valor, el "egresado" real nunca llegaba a la pantalla. La combinación de
    // ambos la hace estadoObraForRow, que sabe cuál de los dos va más adelante.
    estadoObra: row.estado || "pendiente",
    purchase_request_id: row.purchase_request_id || null,
    // Estos dos ya venían en la tabla y no llegaban a la pantalla: sin ellos no
    // se puede decir cuánto se entregó ni si el ítem está enganchado a un
    // pedido concreto, que son las dos mitades de "falta comprar / falta
    // entregar".
    purchase_request_item_id: row.purchase_request_item_id || null,
    cantidad_egresada: row.cantidad_egresada ?? null,
    panol_envio_id: row.panol_envio_id || null,
    panol_envio_item_id: row.panol_envio_item_id || null,
    recepcion_estado: row.recepcion_estado || null,
    recepcion_cantidad_recibida: row.recepcion_cantidad_recibida ?? null,
    recepcion_nota: row.recepcion_nota ?? null,
    recepcion_updated_at: row.recepcion_updated_at ?? null,
    recepcion_envio: row.recepcion_envio ?? null,
    recepcion_items: row.recepcion_items ?? [],
    egreso_at: row.egreso_at ?? null,
    egreso_nota: row.egreso_nota ?? null,
    egreso_por: row.egreso_por ?? null,
    // Se lo llevaron a OTRA obra desde el stock de esta (egreso de producto o
    // reasignación con egreso, que guardan la obra de origen en obra_id).
    saleHaciaOtraObra: Boolean(row.egreso_destino_obra_id && row.obra_id && row.egreso_destino_obra_id !== row.obra_id),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function esEntregaAObra(row) {
  // Salió del stock de esta obra hacia otra: acá no se entregó nada, hay que
  // reponerlo (pedido de Ezequiel, 29/10/2026).
  if (row?.saleHaciaOtraObra) return false;
  if (row?.soloMovimientoDeMatriz && row?.snapshot_estado === "egresado") return true;
  const source = String(row?.source || "").toLowerCase();
  if (source.startsWith("egreso")) return true;
  if (source === "solicitud_consumible_retiro") return true;
  // "Asign. -> egreso" y "Reasig. -> egreso": el source dice transferencia pero
  // el destino delata que salió hacia una obra.
  if (row?.egreso_destino_obra_id) return true;
  return false;
}

function isLedgerOnlySnapshot(row) {
  if (row?.soloMovimientoDeMatriz) return true;
  // Un renglón que se fue a otra obra no cubre la necesidad de esta.
  if (row?.saleHaciaOtraObra) return true;
  const source = String(row?.source || "").toLowerCase();
  const tipo = String(row?.snapshot_tipo || row?.bucket?.key || "").toLowerCase();
  const text = `${source} ${tipo} ${row?.bucket?.label || ""} ${row?.obs || ""}`.toLowerCase();
  return (
    text.includes("conteo_fisico")
    || source.startsWith("egreso")
    || source.includes("transferencia_egreso")
    || tipo.startsWith("egreso")
    || tipo.includes("reversion")
    // Un cambio de ubicación se guarda con cantidad 0 pero como "en pañol /
    // recibido": mezclado con el requerimiento lo daba por recibido (el VHF 215
    // del 55-1 pedía RETIRAR algo ya retirado). Pañol tampoco lo cuenta.
    || source === "ajuste_ubicacion"
  );
}

function snapshotMergeKey(row, index = 0) {
  const adicionalKey = adicionalSnapshotKey(row);
  if (adicionalKey) return adicionalKey;
  const materialId = row?.requisitoMaterialId || row?.requisito_material_id || row?.materialId || row?.material_id;
  if (row?.source === "addon" || row?.bucket?.key === "addon") {
    const addonText = norm(`${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`);
    if (addonText) return `addon:${addonText}`;
  }
  if (materialId) return `material:${materialId}`;
  const textKey = norm(`${row?.descripcion || ""}|${row?.codigo || ""}|${row?.unidad || row?.unidad_medida || ""}`);
  if (textKey) return `text:${textKey}`;
  return row?.snapshotId || row?.id ? `id:${row.snapshotId || row.id}` : `row:${index}`;
}

function isAddonRow(row) {
  return row?.es_adicional === true || row?.source === "addon" || row?.bucket?.key === "addon" || row?.snapshot_tipo === "addon";
}

function isRemitoSnapshot(row) {
  return row?.source === "remito" || row?.snapshot_tipo === "remito";
}

function addonRemitoMatch(liveRows = [], snapshot) {
  if (!isRemitoSnapshot(snapshot)) return null;
  const snapshotMaterialId = snapshot?.materialId || snapshot?.material_id || null;
  const snapshotDescription = norm(snapshot?.descripcion || "");
  const snapshotUnit = norm(snapshot?.unidad || snapshot?.unidad_medida || "unidad");
  if (!snapshotMaterialId && snapshotDescription.length < 8) return null;

  const candidates = liveRows.filter((row) => {
    if (!isAddonRow(row)) return false;
    const rowMaterialId = row?.materialId || row?.material_id || null;
    const sameMaterial = !!snapshotMaterialId && snapshotMaterialId === rowMaterialId;
    const sameDescription = snapshotDescription.length >= 8
      && snapshotDescription === norm(row?.descripcion || "")
      && snapshotUnit === norm(row?.unidad || row?.unidad_medida || "unidad");
    return sameMaterial || sameDescription;
  });

  // Sólo se reconcilia en pantalla cuando hay una coincidencia inequívoca.
  // Si hay dos adicionales posibles, se conservan separados para no esconder
  // una necesidad real de la obra.
  return candidates.length === 1 ? candidates[0] : null;
}

function mergeNotes(a, b) {
  const parts = [a, b].map((part) => String(part || "").trim()).filter(Boolean);
  return [...new Set(parts)].join(" - ");
}

function preferSnapshotText(snapshotValue, liveValue, emptyLabel) {
  const clean = String(snapshotValue || "").trim();
  if (clean && clean !== emptyLabel) return clean;
  return liveValue || snapshotValue || emptyLabel;
}

function mergeSnapshotIntoLive(live, snapshot) {
  const linkedToCatalog = !!(live.materialId || live.material);
  const remitoDeAddon = isAddonRow(live) && isRemitoSnapshot(snapshot);
  const cantidadPlanificada = toNum(live.cantidad);
  const cantidadFijada = toNum(snapshot.cantidad);
  const ajusteCondicionantes = totalAjusteCondicionantes(live);
  const condicionaFilaBase = live.source !== "condicionante"
    && (live.condicionantes?.length || 0) > 0
    && cantidadFijada != null;
  const cantidadConCondicionantes = condicionaFilaBase
    ? Math.max(0, cantidadFijada + ajusteCondicionantes)
    : null;
  const cantidadRecibida = toNum(snapshot.recepcion_cantidad_recibida);
  const notaRecepcion = remitoDeAddon && cantidadRecibida != null
    ? `RecepciÃ³n por remito: ${qtyText(cantidadRecibida, snapshot.unidad || live.unidad)}`
    : "";
  const snapshotOperado = !!(snapshot.purchase_request_id || snapshot.purchase_request_item_id
    || snapshot.panol_envio_id || snapshot.panol_envio_item_id || snapshot.recepcion_estado
    || (toNum(snapshot.cantidad_egresada) || 0) > 0)
    || !["", "pendiente"].includes(String(snapshot.snapshot_estado || "").toLowerCase());
  // Una terminación opcional definida para el barco prevalece sobre la elección
  // previa de una fila aún pendiente. Nunca cambia un pedido o movimiento hecho.
  const snapshotDefineProducto = !(live.productoCondicionante && !snapshotOperado)
    && (!!snapshot.productoConfiguracionOrigen || !!snapshot.productoMaterialId);
  const conflictoProductoCondicionante = !!live.productoCondicionante && snapshotOperado
    && snapshot.productoMaterialId !== live.productoMaterialId;
  const avisoProductoCondicionante = conflictoProductoCondicionante
    ? "Revisar terminación: la configuración actual difiere de un producto ya pedido o movido."
    : "";
  const snapshotDefineEspecificaciones = !!snapshot.especificacionesOrigen;
  // El producto que lleva esta obra: el elegido para la obra (ninguno, si se
  // dejó pendiente a propósito) o, si no se eligió, el estándar de la línea.
  // Cuando hay uno, la lista muestra ese producto y el requisito queda de
  // referencia: antes decía "Caja de piso" aunque la obra ya tuviera elegida
  // la caja, y el producto sólo se veía en el detalle.
  const productoObra = remitoDeAddon ? null : snapshotDefineProducto ? (snapshot.producto || null) : (live.producto || null);
  const requisitoLive = live.material || snapshot.material || null;
  const vuelveAlRequisito = !remitoDeAddon && snapshotDefineProducto && !productoObra && !!requisitoLive;
  return {
    ...live,
    ...snapshot,
    id: live.id,
    snapshotId: snapshot.snapshotId,
    materialId: live.materialId || snapshot.materialId,
    requisitoMaterialId: live.requisitoMaterialId || snapshot.requisitoMaterialId || live.materialId || snapshot.materialId,
    productoMaterialId: snapshotDefineProducto ? (snapshot.productoMaterialId || null) : (live.productoMaterialId || null),
    producto: snapshotDefineProducto ? (snapshot.producto || null) : (live.producto || null),
    productoEstandar: snapshotDefineProducto ? !!snapshot.productoEstandar : !!live.productoEstandar,
    productoCondicionante: !!live.productoCondicionante,
    productoConfiguracionOrigen: snapshot.productoConfiguracionOrigen || live.productoConfiguracionOrigen || null,
    esRequisito: live.esRequisito || snapshot.esRequisito || false,
    especificaciones: snapshotDefineEspecificaciones
      ? normalizeProductSpecs(snapshot.especificaciones)
      : normalizeProductSpecs(live.especificaciones),
    especificacionesOrigen: snapshot.especificacionesOrigen || live.especificacionesOrigen || null,
    material: live.material || snapshot.material || null,
    source: live.source || snapshot.source,
    snapshot_tipo: remitoDeAddon ? (live.snapshot_tipo || live.bucket?.key || "addon") : (snapshot.snapshot_tipo || live.snapshot_tipo || null),
    descripcion: remitoDeAddon
      ? live.descripcion || snapshot.descripcion
      : productoObra?.descripcion
        ? productoObra.descripcion
        : vuelveAlRequisito
          ? requisitoLive.descripcion || live.descripcion
          : linkedToCatalog ? live.descripcion || snapshot.descripcion : snapshot.descripcion || live.descripcion,
    requisitoDescripcion: productoObra?.descripcion
      ? live.requisitoDescripcion || requisitoLive?.descripcion || live.descripcion
      : "",
    snapshotDescripcion: snapshot.snapshotDescripcion || snapshot.descripcion,
    descripcionOriginal: snapshot.descripcionOriginal || "",
    codigo: remitoDeAddon
      ? live.codigo || snapshot.codigo
      : productoObra
        ? productoObra.codigo || null
        : vuelveAlRequisito
          ? requisitoLive.codigo || null
          : linkedToCatalog ? live.codigo || snapshot.codigo : snapshot.codigo || live.codigo,
    // El adicional conserva la cantidad planificada; el detalle recibido queda
    // en recepcion_cantidad_recibida. Antes la cantidad de un remito parcial
    // reemplazaba la necesidad original y daba la impresiÃ³n de dos Ã­tems.
    cantidad: remitoDeAddon && cantidadPlanificada != null
      ? cantidadPlanificada
      : cantidadConCondicionantes ?? cantidadFijada ?? toNum(live.cantidad) ?? 0,
    unidad: remitoDeAddon ? live.unidad || snapshot.unidad : snapshot.unidad || live.unidad,
    proveedor: productoObra?.proveedor
      ? productoObra.proveedor
      : vuelveAlRequisito && requisitoLive.proveedor
        ? requisitoLive.proveedor
        : linkedToCatalog ? live.proveedor || snapshot.proveedor : preferSnapshotText(snapshot.proveedor, live.proveedor, "Sin proveedor"),
    // A diferencia de descripción y proveedor, acá no se prefiere el texto del
    // snapshot: el rubro es una clasificación y vale la del catálogo de hoy.
    rubro: live.rubro || snapshot.rubro || "Sin rubro",
    precio: snapshot.productoMaterialId
      ? snapshot.precio
      : vuelveAlRequisito
        ? priceInfo(requisitoLive)
        : linkedToCatalog ? live.precio || snapshot.precio : snapshot.precio?.amount ? snapshot.precio : live.precio,
    bucket: live.bucket || snapshot.bucket,
    obs: mergeNotes(mergeNotes(mergeNotes(live.obs, snapshot.obs), notaRecepcion), avisoProductoCondicionante),
    variante: snapshot.variante || live.variante || "",
    revisado: live.revisado ?? snapshot.revisado,
    review: conflictoProductoCondicionante
      ? { flag: true, reason: avisoProductoCondicionante }
      : live.review?.flag ? live.review : snapshot.review,
    // La lista fijada de la obra es la base operativa. Ej.: 32 fijadas +8 por
    // "sin vestidor" = 40; ese 40 es el que se muestra y se manda a Compras.
    baseCantidad: condicionaFilaBase ? cantidadFijada : live.baseCantidad,
    condicionantes: live.condicionantes ?? [],
    snapshot_estado: snapshot.snapshot_estado || live.snapshot_estado || null,
    estadoObra: snapshot.estadoObra || live.estadoObra,
    purchase_request_id: snapshot.purchase_request_id || live.purchase_request_id || null,
    panol_envio_id: snapshot.panol_envio_id || live.panol_envio_id || null,
    panol_envio_item_id: snapshot.panol_envio_item_id || live.panol_envio_item_id || null,
    recepcion_estado: snapshot.recepcion_estado,
    recepcion_cantidad_recibida: snapshot.recepcion_cantidad_recibida,
    recepcion_nota: snapshot.recepcion_nota,
    recepcion_updated_at: snapshot.recepcion_updated_at,
    recepcion_envio: snapshot.recepcion_envio,
    recepcion_items: snapshot.recepcion_items,
    egreso_at: snapshot.egreso_at,
    egreso_nota: snapshot.egreso_nota,
    egreso_por: snapshot.egreso_por,
  };
}

function compareMatrizRows(a, b) {
  const order = { base: 0, condicionante: 1, linea_eje: 2, variante: 3, addon: 4 };
  return (order[a.bucket?.key] ?? 9) - (order[b.bucket?.key] ?? 9)
    || String(a.rubro || "").localeCompare(String(b.rubro || ""), "es")
    || String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true });
}

function snapshotMergePriority(row) {
  let score = 0;
  if (row?.productoMaterialId) score += 1200;
  if (String(row?.variante || "").trim()) score += 1000;
  if (row?.recepcion_estado) score += 140;
  if (row?.panol_envio_id || row?.panol_envio_item_id) score += 120;
  if (row?.purchase_request_id) score += 100;
  if (row?.snapshot_estado && row.snapshot_estado !== "pendiente") score += 60;
  if (String(row?.obs || "").trim()) score += 10;
  return score;
}

function pickSnapshotForMerge(current, candidate) {
  if (!current) return candidate;
  const currentScore = snapshotMergePriority(current);
  const candidateScore = snapshotMergePriority(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  const currentDate = new Date(current.updated_at || current.created_at || 0).getTime();
  const candidateDate = new Date(candidate.updated_at || candidate.created_at || 0).getTime();
  return candidateDate >= currentDate ? candidate : current;
}

function mergeMatrixAndSnapshotRows(liveRows = [], snapshotRows = []) {
  if (!snapshotRows.length) return liveRows;
  snapshotRows = separarRecepcionesDeMatriz(liveRows, snapshotRows, {
    keyOf: snapshotMergeKey,
    esSoloMovimiento: isLedgerOnlySnapshot,
    tieneAdicional: (row) => !!addonRemitoMatch(liveRows, row),
  });
  const merged = new Map();
  const snapshotsByKey = new Map();

  liveRows.forEach((row, index) => {
    merged.set(snapshotMergeKey(row, index), row);
  });

  // Un egreso no modifica la fila del requerimiento: queda como una fila aparte.
  // Si se descarta sin sumarla, la obra muestra "no se entregó nada" aunque el
  // material ya se haya ido —era el caso de la 37-40, con 18 egresos
  // registrados y la lista entera en cero—. Se suman antes de descartarlas.
  // Lo mismo con el conteo físico: no es una necesidad de la obra, pero lo que
  // dejó en pañol y lo que se retiró de ahí la cubren (ver aporteDeFilaLedger).
  const egresadoPorKey = new Map();
  const panolLedgerPorKey = new Map();
  const entregadoConteoPorKey = new Map();
  const adicionalesPorPedidoItem = new Map(snapshotRows
    .filter(row=>row.source === "adicional_obra" && row.purchase_request_item_id && !isLedgerOnlySnapshot(row))
    .map(row=>[row.purchase_request_item_id,row]));
  const sumar = (map, key, cantidad) => {
    if (cantidad) map.set(key, (map.get(key) || 0) + cantidad);
  };
  snapshotRows.forEach((row, index) => {
    if (row.omitirMovimientoDeMatriz) return;
    const adicionalVinculado = adicionalesPorPedidoItem.get(row.purchase_request_item_id);
    const addon = adicionalVinculado || addonRemitoMatch(liveRows, row);
    const key = addon ? snapshotMergeKey(addon) : snapshotMergeKey(row, index);
    if (!key) return;
    if (isLedgerOnlySnapshot(row)) {
      const aporte = aporteDeFilaLedger(row);
      sumar(panolLedgerPorKey, key, aporte.panol);
      if (esEntregaAObra(row)) {
        sumar(egresadoPorKey, key, Math.abs(toNum(row?.cantidad_egresada) || toNum(row?.cantidad) || 0));
      } else {
        sumar(entregadoConteoPorKey, key, aporte.entregadoConteo);
      }
      return;
    }
    snapshotsByKey.set(key, pickSnapshotForMerge(snapshotsByKey.get(key), row));
  });

  snapshotsByKey.forEach((row, key) => {
    const live = merged.get(key);
    merged.set(key, live ? mergeSnapshotIntoLive(live, row) : row);
  });

  return [...merged.entries()]
    .map(([key, row]) => {
      const egresado = egresadoPorKey.get(key) || 0;
      // Un egreso de stock que no vino del conteo deja el saldo en negativo:
      // eso no le quita nada al renglón, que ya lo cuenta por su lado.
      const panolLedger = Math.max(0, panolLedgerPorKey.get(key) || 0);
      const entregadoConteo = entregadoConteoPorKey.get(key) || 0;
      if (!(egresado > 0) && !(panolLedger > 0) && !(entregadoConteo > 0)) return row;
      return {
        ...row,
        ...(egresado > 0 ? { egresadoLedger: egresado } : {}),
        ...(panolLedger > 0 ? { panolLedger } : {}),
        ...(entregadoConteo > 0 ? { entregadoConteo } : {}),
      };
    })
    .sort(compareMatrizRows);
}

function snapshotEstadoFromRecepcion(estado) {
  // Crear el aviso genera un item de recepción en estado "pendiente". Eso
  // significa que Pañol todavía espera el material, no que ya lo tenga.
  // Los estados de problema tampoco acreditan una recepción física.
  if (["recibido", "parcial"].includes(String(estado || "").toLowerCase()))
    return "en_panol";
  return null;
}

function latestRecepcionItem(items = []) {
  return (
    [...items].sort((a, b) => {
      const ad = new Date(
        a.marcado_at || a.updated_at || a.created_at || 0,
      ).getTime();
      const bd = new Date(
        b.marcado_at || b.updated_at || b.created_at || 0,
      ).getTime();
      return bd - ad;
    })[0] || null
  );
}
export {snapshotRowToView,addonRowToView,mergeMatrixAndSnapshotRows,cantidadesDeFila,accionDeFila,snapshotEstadoFromRecepcion,latestRecepcionItem,norm};