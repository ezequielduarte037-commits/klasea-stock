// audit:db
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env");
process.loadEnvFile(".env.backup.local");
var supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: (url, opts) => {
  if (opts?.method && !["GET", "HEAD"].includes(opts.method)) throw Error("Consulta de solo lectura");
  const u = new URL(url);
  if (!u.searchParams.has("order") && u.searchParams.has("offset")) {
    u.searchParams.set("order", u.pathname.endsWith("panol_material_modelo") ? "material_id,modelo,variante" : "id");
    url = u;
  }
  return fetch(url, opts);
} } });

// src/features/panol/panolMovimientos.js
var IN_STOCK_STATES = /* @__PURE__ */ new Set(["en_panol", "recibido", "parcial"]);
var RECEIVED_STATES = /* @__PURE__ */ new Set(["recibido", "parcial"]);
var DIRECT_STOCK_SOURCES = /* @__PURE__ */ new Set(["stock_general", "remito", "transferencia_ingreso", "ajuste_ingreso", "reclasificacion_ingreso"]);
function qtyNum(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
function rowSource(row = {}) {
  return String(row.source || "").trim().toLowerCase();
}
function rowIsEgreso(row = {}) {
  const source = rowSource(row);
  return source.startsWith("egreso") || source.startsWith("transferencia_egreso") || source === "reclasificacion_egreso" || source === "conteo_fisico_reversion";
}
function rowIsLocationChange(row = {}) {
  return rowSource(row) === "ajuste_ubicacion";
}
function rowIsDirectStock(row = {}) {
  const source = rowSource(row);
  return DIRECT_STOCK_SOURCES.has(source) || source.startsWith("stock_") || source.startsWith("transferencia_ingreso");
}
function rowCountsAsStock(row = {}) {
  if (rowIsLocationChange(row)) return false;
  if (!IN_STOCK_STATES.has(row.estado)) return false;
  const recepcion = String(row.recepcion_estado || "").trim();
  if (RECEIVED_STATES.has(recepcion)) return true;
  if (rowIsDirectStock(row)) return true;
  return false;
}
function rowDelta(row = {}) {
  if (rowCountsAsStock(row)) return qtyNum(row.cantidad, 1);
  if (rowIsEgreso(row)) return -Math.abs(qtyNum(row.cantidad_egresada, qtyNum(row.cantidad, 1)));
  return 0;
}

// src/features/materiales/productosAsignadosApi.js
function cleanIds(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}
function schemaMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST202" || message.includes("schema cache") || message.includes("does not exist") || message.includes("could not find");
}
async function fetchRequisitoProductos(requisitoIds = []) {
  const ids2 = cleanIds(requisitoIds);
  if (!ids2.length) return [];
  const rows = [];
  for (let from = 0; from < ids2.length; from += 150) {
    const { data: data2, error } = await supabase.from("panol_requisito_productos").select("id,requisito_material_id,producto_material_id,variante_legacy,origen,activo,created_at").in("requisito_material_id", ids2.slice(from, from + 150)).eq("activo", true);
    if (error) {
      if (schemaMissing(error)) return [];
      throw error;
    }
    rows.push(...data2 || []);
  }
  return rows;
}

// src/features/materiales/conditionProductReplacement.js
function findConditionProductReplacements(baseRows, items, compatibleLinks) {
  const linksByRequirement = /* @__PURE__ */ new Map();
  for (const link of compatibleLinks || []) {
    if (link.activo === false) continue;
    const products = linksByRequirement.get(link.requisito_material_id) || /* @__PURE__ */ new Set();
    products.add(link.producto_material_id);
    linksByRequirement.set(link.requisito_material_id, products);
  }
  const replacements = [];
  const consumedItemIds = /* @__PURE__ */ new Set();
  for (const row of baseRows || []) {
    const requirementId = row.requisitoMaterialId || row.material_id || row.materialId;
    const defaultProductId = row.productoMaterialId || row.producto_predeterminado_id;
    const quantity = Number(row.cantidad || 0);
    if (!requirementId || !defaultProductId || quantity <= 0) continue;
    const family = linksByRequirement.get(requirementId);
    if (!family?.has(defaultProductId)) continue;
    const removals = (items || []).filter((item) => item.activo !== false && item.tipo_item === "quita" && item.material_id === defaultProductId && Number(item.cantidad || 0) === quantity && !consumedItemIds.has(item.id));
    const additions = (items || []).filter((item) => item.activo !== false && item.tipo_item !== "quita" && item.material_id !== defaultProductId && family.has(item.material_id) && Number(item.cantidad || 0) === quantity && !consumedItemIds.has(item.id));
    if (removals.length !== 1 || additions.length !== 1) continue;
    const removal = removals[0];
    const addition = additions[0];
    replacements.push({ requirementId, productId: addition.material_id, removal, addition });
    consumedItemIds.add(removal.id);
    consumedItemIds.add(addition.id);
  }
  return { replacements, consumedItemIds };
}

// src/features/compras/materialesSecundariosApi.js
var redondear = (value) => Math.round(Number(value || 0) * 1e4) / 1e4;
var REFERENCIA_MADERAS_POR_LINEA = Object.freeze({
  K52: {
    obra: "52-23",
    hasta: "2026-09-24",
    sinContar: [
      "16b3a341-11dd-44dc-b76e-8072cf8949af",
      // HoneyComb
      "54a2dc77-e2ab-4981-837a-bdbf5d53b28d",
      // Tablón Okumé
      "feb2447c-6a2c-420b-96ce-e639fed0b882",
      // PVC 20mm
      "b347aaeb-1e69-493b-91d2-eb56dc5a99a7"
      // Tablón de teca
    ]
  },
  K55: {
    obra: "55-1",
    sinContar: [
      "16b3a341-11dd-44dc-b76e-8072cf8949af",
      // HoneyComb: la matriz del K55 lleva 22 placas
      "54a2dc77-e2ab-4981-837a-bdbf5d53b28d"
      // Tablón Okumé: la matriz del K55 lleva 300 pies
    ]
  }
});
function normalizarCodigoObra(value) {
  return String(value || "").trim().toUpperCase().replace(/^K/, "").replace(/[^A-Z0-9]/g, "");
}
function lineaCodigo(value) {
  const normal = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normal.startsWith("K") ? normal : `K${normal}`;
}
function errorDeMigracion(error) {
  const texto = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache|column .* does not exist/i.test(texto);
}
async function traerPreciosSecundarios() {
  const { data: data2, error } = await supabase.from("materiales_secundarios_precios").select("catalogo,material_id,proveedor,precio_base,moneda,unidad_precio,factor_unidad_matriz,precio_unidad_matriz,incluye_iva,fecha,fuente,notas").order("fecha", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    if (errorDeMigracion(error)) return /* @__PURE__ */ new Map();
    throw error;
  }
  const precios = /* @__PURE__ */ new Map();
  for (const row of data2 || []) {
    const clave = `${row.catalogo}|${row.material_id}`;
    if (!precios.has(clave)) precios.set(clave, row);
  }
  return precios;
}
async function traerMovimientosLaminacion(codigos) {
  if (!codigos.length) return [];
  const consultas = ["destino", "obra"].map((campo) => supabase.from("laminacion_movimientos").select("id,material_id,cantidad,destino,obra").eq("tipo", "egreso").in(campo, codigos));
  const resultados = await Promise.all(consultas);
  const filas = /* @__PURE__ */ new Map();
  for (const resultado of resultados) {
    if (resultado.error) throw resultado.error;
    for (const row of resultado.data || []) filas.set(row.id, row);
  }
  return [...filas.values()];
}
async function traerMovimientosMadera(obras) {
  const codigos = obras.map((obra) => String(obra.codigo || "").trim()).filter(Boolean);
  const obraIds = obras.map((obra) => obra.id).filter(Boolean);
  const consultas = [];
  if (obraIds.length) {
    consultas.push(supabase.from("movimientos").select("id,material_id,delta,obra,produccion_obra_id,created_at").lt("delta", 0).in("produccion_obra_id", obraIds));
  }
  if (codigos.length) {
    consultas.push(supabase.from("movimientos").select("id,material_id,delta,obra,produccion_obra_id,created_at").lt("delta", 0).in("obra", codigos));
  }
  const resultados = await Promise.all(consultas);
  const filas = /* @__PURE__ */ new Map();
  for (const resultado of resultados) {
    if (resultado.error) throw resultado.error;
    for (const row of resultado.data || []) filas.set(row.id, row);
  }
  return [...filas.values()];
}
async function traerObraPorCodigo(codigo) {
  const { data: data2, error } = await supabase.from("produccion_obras").select("id,codigo").eq("codigo", codigo).limit(1);
  if (error) return null;
  return data2?.[0] || null;
}
function costoVacio() {
  return { planificadoArs: 0, planificadoUsd: 0, consumidoArs: 0, consumidoUsd: 0, conPrecio: 0, sinPrecio: 0 };
}
function sumarCosto(total, { precio, planificado, consumido }) {
  if (!precio?.precio_unidad_matriz) {
    total.sinPrecio += 1;
    return;
  }
  total.conPrecio += 1;
  const moneda = precio.moneda === "USD" ? "Usd" : "Ars";
  total[`planificado${moneda}`] += Number(planificado || 0) * Number(precio.precio_unidad_matriz || 0);
  total[`consumido${moneda}`] += Number(consumido || 0) * Number(precio.precio_unidad_matriz || 0);
}
function finalizarCosto(total) {
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, typeof value === "number" ? redondear(value) : value]));
}
async function fetchMaterialesSecundariosPlanilla({ linea, obras }) {
  const codigoLinea = lineaCodigo(linea);
  if (!["K52", "K55"].includes(codigoLinea) || !obras?.length) {
    return { filas: [], resumen: { laminacion: 0, maderas: 0, costos: costoVacio() } };
  }
  const codigos = obras.map((obra) => String(obra.codigo || "").trim()).filter(Boolean);
  const obraPorCodigo = new Map(obras.map((obra) => [normalizarCodigoObra(obra.codigo), obra]));
  const obraPorId = new Map(obras.map((obra) => [obra.id, obra]));
  const referencia = REFERENCIA_MADERAS_POR_LINEA[codigoLinea] || null;
  const referenciaMaderasCodigo = referencia?.obra || "";
  const referenciaSinContar = new Set(referencia?.sinContar || []);
  let referenciaMaderasObra = referenciaMaderasCodigo ? obraPorCodigo.get(normalizarCodigoObra(referenciaMaderasCodigo)) || null : null;
  if (referenciaMaderasCodigo && !referenciaMaderasObra) {
    referenciaMaderasObra = await traerObraPorCodigo(referenciaMaderasCodigo);
    if (referenciaMaderasObra) {
      obraPorCodigo.set(normalizarCodigoObra(referenciaMaderasObra.codigo), referenciaMaderasObra);
      obraPorId.set(referenciaMaderasObra.id, referenciaMaderasObra);
    }
  }
  const obrasConReferencia = referenciaMaderasObra && !obras.some((obra) => obra.id === referenciaMaderasObra.id) ? [...obras, referenciaMaderasObra] : obras;
  const [{ data: plantillas, error: plantillaError }, precios] = await Promise.all([
    supabase.from("linea_plantillas").select("id,linea,nombre").eq("linea", codigoLinea).eq("activa", true).order("created_at", { ascending: false }).limit(1),
    traerPreciosSecundarios()
  ]);
  if (plantillaError) throw plantillaError;
  const plantilla = plantillas?.[0] || null;
  const [itemsRes, movimientosLam, movimientosMadera] = await Promise.all([
    plantilla ? supabase.from("linea_plantilla_items").select("material_id,cantidad,orden").eq("plantilla_id", plantilla.id).order("orden") : Promise.resolve({ data: [], error: null }),
    traerMovimientosLaminacion(codigos),
    traerMovimientosMadera(obrasConReferencia)
  ]);
  if (itemsRes.error) throw itemsRes.error;
  const lamIds = [...new Set((itemsRes.data || []).map((row) => row.material_id).filter(Boolean))];
  const maderaIds = [...new Set((movimientosMadera || []).map((row) => row.material_id).filter(Boolean))];
  const [lamMaterialesRes, maderasRes] = await Promise.all([
    lamIds.length ? supabase.from("laminacion_materiales").select("id,nombre,categoria,unidad").in("id", lamIds) : Promise.resolve({ data: [], error: null }),
    maderaIds.length ? supabase.from("materiales").select("id,nombre,unidad_medida").in("id", maderaIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (lamMaterialesRes.error) throw lamMaterialesRes.error;
  if (maderasRes.error) throw maderasRes.error;
  const lamPorId = new Map((lamMaterialesRes.data || []).map((row) => [row.id, row]));
  const maderaPorId = new Map((maderasRes.data || []).map((row) => [row.id, row]));
  const consumidoLam = /* @__PURE__ */ new Map();
  for (const movimiento of movimientosLam) {
    const obra = obraPorCodigo.get(normalizarCodigoObra(movimiento.destino || movimiento.obra));
    if (!obra) continue;
    const clave = `${movimiento.material_id}|${obra.id}`;
    consumidoLam.set(clave, redondear((consumidoLam.get(clave) || 0) + Number(movimiento.cantidad || 0)));
  }
  const costos = costoVacio();
  const filasLam = (itemsRes.data || []).map((item) => {
    const material = lamPorId.get(item.material_id);
    if (!material) return null;
    const requerido = redondear(item.cantidad);
    const precio = precios.get(`laminacion|${material.id}`) || null;
    const porObra = {};
    let consumidoTotal = 0;
    for (const obra of obras) {
      const consumido = consumidoLam.get(`${material.id}|${obra.id}`) || 0;
      consumidoTotal += consumido;
      porObra[obra.id] = {
        secundario: true,
        circuito: "laminacion",
        requerido,
        consumido,
        restanteUso: redondear(Math.max(0, requerido - consumido)),
        excedente: redondear(Math.max(0, consumido - requerido)),
        egresado: consumido,
        enPanol: 0,
        pendiente: 0,
        origenes: ["secundario", "laminacion"]
      };
    }
    sumarCosto(costos, { precio, planificado: requerido * obras.length, consumido: consumidoTotal });
    return {
      id: `sec:laminacion:${material.id}`,
      materialSecundarioId: material.id,
      descripcion: material.nombre,
      codigo: "",
      proveedor: precio?.proveedor || "",
      rubro: `Laminaci\xF3n \xB7 ${material.categoria || "Sin categor\xEDa"}`,
      unidad: material.unidad || "unidad",
      enPanolLibre: 0,
      reservado: 0,
      faltaComprar: 0,
      secundario: true,
      circuito: "laminacion",
      soloCosto: true,
      origenes: ["secundario", "laminacion"],
      origenPrincipal: "secundario",
      precioInfo: precio,
      porObra,
      totales: { requerido: redondear(requerido * obras.length), egresado: redondear(consumidoTotal), enPanol: 0, pendiente: 0 }
    };
  }).filter(Boolean);
  const consumoMadera = /* @__PURE__ */ new Map();
  const consumoReferencia = /* @__PURE__ */ new Map();
  for (const movimiento of movimientosMadera || []) {
    const obra = obraPorId.get(movimiento.produccion_obra_id) || obraPorCodigo.get(normalizarCodigoObra(movimiento.obra));
    if (!obra) continue;
    const cantidad = Math.abs(Number(movimiento.delta || 0));
    const clave = `${movimiento.material_id}|${obra.id}`;
    consumoMadera.set(clave, redondear((consumoMadera.get(clave) || 0) + cantidad));
    if (obra.id !== referenciaMaderasObra?.id) continue;
    if (referencia?.hasta && String(movimiento.created_at || "").slice(0, 10) > referencia.hasta) continue;
    consumoReferencia.set(movimiento.material_id, redondear((consumoReferencia.get(movimiento.material_id) || 0) + cantidad));
  }
  const filasMadera = maderaIds.map((materialId) => {
    const material = maderaPorId.get(materialId);
    if (!material) return null;
    const precio = precios.get(`maderas|${material.id}`) || null;
    const porObra = {};
    let consumidoTotal = 0;
    for (const obra of obras) {
      const consumido = consumoMadera.get(`${material.id}|${obra.id}`) || 0;
      if (!(consumido > 0)) continue;
      consumidoTotal += consumido;
      porObra[obra.id] = {
        secundario: true,
        circuito: "maderas",
        soloConsumo: true,
        requerido: 0,
        consumido,
        restanteUso: 0,
        excedente: 0,
        egresado: consumido,
        enPanol: 0,
        pendiente: 0,
        origenes: ["secundario", "maderas"]
      };
    }
    const cantidadReferencia = referenciaMaderasObra ? referenciaSinContar.has(material.id) ? 0 : consumoReferencia.get(material.id) || 0 : null;
    sumarCosto(costos, { precio, planificado: 0, consumido: consumidoTotal });
    return {
      id: `sec:maderas:${material.id}`,
      materialSecundarioId: material.id,
      descripcion: material.nombre,
      codigo: "",
      proveedor: precio?.proveedor || "",
      rubro: "Maderas \xB7 consumo real",
      unidad: material.unidad_medida || "unidad",
      enPanolLibre: 0,
      reservado: 0,
      faltaComprar: 0,
      secundario: true,
      circuito: "maderas",
      soloCosto: true,
      referenciaMaderasCodigo: referenciaMaderasObra?.codigo || referenciaMaderasCodigo || "",
      referenciaMaderasObraId: referenciaMaderasObra?.id || null,
      cantidadReferencia,
      origenes: ["secundario", "maderas"],
      origenPrincipal: "secundario",
      precioInfo: precio,
      porObra,
      totales: { requerido: 0, egresado: redondear(consumidoTotal), enPanol: 0, pendiente: 0 }
    };
  }).filter(Boolean);
  return {
    filas: [...filasLam, ...filasMadera],
    resumen: {
      laminacion: filasLam.length,
      maderas: filasMadera.length,
      costos: finalizarCosto(costos)
    }
  };
}

// src/features/compras/planillaObrasApi.js
var ESTADOS_EGRESADO = /* @__PURE__ */ new Set(["egresado"]);
var ESTADOS_EN_PANOL = /* @__PURE__ */ new Set(["en_panol", "recibido", "parcial"]);
var ESTADOS_PENDIENTE = /* @__PURE__ */ new Set(["pendiente", "pedido", "comprado"]);
var planillasEnCurso = /* @__PURE__ */ new Map();
var redondear2 = (n) => Math.round(Number(n || 0) * 100) / 100;
var normalizarModelo = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").replace(/^K/, "");
async function traerTodo(tabla, select) {
  const filas = [];
  for (let desde = 0; ; desde += 1e3) {
    const { data: data2, error } = await supabase.from(tabla).select(select).range(desde, desde + 999);
    if (error) throw error;
    if (!data2?.length) break;
    filas.push(...data2);
    if (data2.length < 1e3) break;
  }
  return filas;
}
async function traerTodoDeObras(tabla, select, obraIds) {
  if (!obraIds.length) return [];
  const filas = [];
  for (let desde = 0; ; desde += 1e3) {
    const { data: data2, error } = await supabase.from(tabla).select(select).in("obra_id", obraIds).range(desde, desde + 999);
    if (error) throw error;
    if (!data2?.length) break;
    filas.push(...data2);
    if (data2.length < 1e3) break;
  }
  return filas;
}
var SNAPSHOT_SELECT = "id,material_id,requisito_material_id,obra_id,cantidad,cantidad_egresada,estado,source,tipo,tipo_label,es_adicional,especificaciones,recepcion_estado,panol_envio_id,panol_envio_item_id,purchase_request_id,purchase_request_item_id,created_at";
var SNAPSHOT_SELECT_COMPATIBLE = "id,material_id,requisito_material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,panol_envio_id,panol_envio_item_id,purchase_request_id,purchase_request_item_id,created_at";
var STOCK_SELECT = "material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado";
async function traerLedgerPlanilla(obraIds) {
  try {
    return await traerTodoDeObras("panol_obra_materiales_snapshot", SNAPSHOT_SELECT, obraIds);
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    const esCampoNoDisponible = ["42703", "PGRST204"].includes(String(error?.code || "")) || /(?:column|schema cache).*(?:tipo_label|es_adicional|tipo)/i.test(mensaje);
    if (!esCampoNoDisponible) throw error;
    return traerTodoDeObras("panol_obra_materiales_snapshot", SNAPSHOT_SELECT_COMPATIBLE, obraIds);
  }
}
async function traerConfiguracionObras(obraIds) {
  try {
    return await traerTodoDeObras(
      "panol_obra_matriz_condicionantes",
      "obra_id,condicionante_id,activo,notas,created_at,updated_at",
      obraIds
    );
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    if (["42P01", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache/i.test(mensaje)) return [];
    throw error;
  }
}
async function traerExclusionesObras(obraIds) {
  try {
    return await traerTodoDeObras("panol_obra_material_exclusiones", "obra_id,material_id,motivo", obraIds);
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    if (["42P01", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache/i.test(mensaje)) return [];
    throw error;
  }
}
async function traerCondicionantesLinea(linea) {
  try {
    const condicionantes = (await traerTodo(
      "panol_matriz_condicionantes",
      "id,modelo,nombre,tipo,descripcion,activo_por_defecto,activo,orden,created_at,updated_at"
    )).filter((row) => normalizarModelo(row.modelo) === normalizarModelo(linea)).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    const ids2 = condicionantes.map((row) => row.id).filter(Boolean);
    if (!ids2.length) return { ok: true, condicionantes: [] };
    const items = [];
    for (let desde = 0; ; desde += 1e3) {
      const { data: data2, error } = await supabase.from("panol_matriz_condicionante_items").select("id,condicionante_id,material_id,descripcion,cantidad,unidad,tipo_item,notas,activo,orden,created_at,updated_at").in("condicionante_id", ids2).order("orden").range(desde, desde + 999);
      if (error) throw error;
      items.push(...data2 ?? []);
      if (!data2 || data2.length < 1e3) break;
    }
    const itemsPorCondicionante = /* @__PURE__ */ new Map();
    for (const item of items) {
      const grupo = itemsPorCondicionante.get(item.condicionante_id) ?? [];
      grupo.push(item);
      itemsPorCondicionante.set(item.condicionante_id, grupo);
    }
    return {
      ok: true,
      condicionantes: condicionantes.map((row) => ({
        ...row,
        items: itemsPorCondicionante.get(row.id) ?? []
      }))
    };
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    if (["42P01", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache/i.test(mensaje)) {
      return { ok: false, condicionantes: [] };
    }
    throw error;
  }
}
async function traerRubros() {
  const { data: data2, error } = await supabase.from("panol_categorias").select("id,nombre").limit(500);
  if (error) return /* @__PURE__ */ new Map();
  return new Map((data2 ?? []).map((c) => [c.id, c.nombre]));
}
function celdaVacia(cantidad, requisitoId, desdeMatriz = true) {
  return {
    requerido: redondear2(cantidad),
    egresado: 0,
    enPanol: 0,
    pendiente: redondear2(cantidad),
    requisitoId,
    desdeMatriz,
    snapshotId: null,
    configuracionSnapshotId: null,
    avisoPendiente: false,
    pedidoAbierto: false,
    productoMaterialId: null,
    productoDefinido: false,
    productoEstandar: false,
    requiereProductoConcreto: false,
    especificaciones: {},
    origenes: [desdeMatriz ? "matriz" : "fuera_matriz"],
    baseRequerido: redondear2(cantidad),
    ajusteConfiguracion: 0,
    configuraciones: []
  };
}
function clasificarOrigenSnapshot(fila) {
  const source = String(fila?.source || "").trim().toLowerCase();
  const tipo = String(fila?.tipo || fila?.tipo_label || "").trim().toLowerCase();
  if (source.includes("condicionante") || tipo.includes("condicionante") || tipo.includes("opcional")) {
    return "opcional";
  }
  if (fila?.es_adicional === true || source === "addon" || tipo === "addon" || tipo.includes("adicional")) {
    return "adicional";
  }
  if (source.includes("panol") || source.includes("pa\xF1ol") || source === "stock_general" || source === "remito" || source.includes("ingreso_manual") || source.includes("egreso_general") || source.includes("egreso_directo") || source.includes("solicitud")) {
    return "panol";
  }
  return "fuera_matriz";
}
function sumarOrigen(celda, origen) {
  if (!origen) return;
  celda.origenes = [.../* @__PURE__ */ new Set([...celda.origenes || [], origen])];
  if (celda.origenes.length > 1) {
    celda.origenes = celda.origenes.filter((item) => item !== "fuera_matriz");
  }
}
function sumarEstado(celda, fila) {
  const cantidad = Number(fila.cantidad_egresada || fila.cantidad || 0);
  if (!cantidad) return;
  if (ESTADOS_EGRESADO.has(fila.estado)) celda.egresado += cantidad;
  else if (ESTADOS_EN_PANOL.has(fila.estado)) celda.enPanol += cantidad;
  else if (ESTADOS_PENDIENTE.has(fila.estado)) celda.pendiente += cantidad;
}
function materialMeta(material, rubros, imagenes) {
  return {
    descripcion: material?.descripcion || "Material sin identificar",
    codigo: material?.codigo || "",
    proveedor: String(material?.proveedor || "").trim(),
    rubro: rubros.get(material?.categoria_id) || "Sin rubro",
    unidad: material?.unidad_medida || "unidad",
    esConsumible: material?.es_consumible === true,
    imagenUrl: material?.imagen_url || imagenes.get(material?.id) || ""
  };
}
var OBRAS_SELECT = "id,codigo,linea_nombre,estado,fecha_inicio";
var MATERIALES_SELECT = "id,descripcion,alias,codigo,codigo_barra,proveedor,unidad_medida,categoria_id,es_consumible,es_requisito,activo,imagen_url,notas";
var MODELO_SELECT = "material_id,modelo,cantidad,variante,producto_predeterminado_id";
function cargarBasePlanilla({ obrasSelect = OBRAS_SELECT } = {}) {
  return Promise.all([
    traerTodo("produccion_obras", obrasSelect),
    traerTodo("panol_materiales", MATERIALES_SELECT),
    traerTodo("panol_material_modelo", MODELO_SELECT),
    traerTodo("panol_obra_materiales_snapshot", STOCK_SELECT),
    traerRubros(),
    traerTodo("panol_material_imagenes", "material_id,url,created_at")
  ]).then(([obras, materiales, modelos, stockLedger, rubros, imagenesRows]) => ({ obras, materiales, modelos, stockLedger, rubros, imagenesRows }));
}
async function construirPlanillaDeLinea(linea, basePromesa = null, { sinSecundarios = false } = {}) {
  const base2 = basePromesa ? await basePromesa : null;
  const obras = base2 ? base2.obras : await traerTodo("produccion_obras", OBRAS_SELECT);
  const modeloElegido = normalizarModelo(linea);
  const lineasDisponibles = [...new Set(
    obras.map((o) => String(o.linea_nombre || "").trim()).filter(Boolean)
  )].sort();
  const obrasDeLinea = obras.filter((o) => normalizarModelo(o.linea_nombre) === modeloElegido).filter((o) => o.estado === "activa").sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  const obraIds = obrasDeLinea.map((obra) => obra.id);
  const idsDeObra = new Set(obraIds);
  const secundariosPromise = sinSecundarios ? Promise.resolve({ filas: [], resumen: null }) : fetchMaterialesSecundariosPlanilla({ linea, obras: obrasDeLinea });
  const [materiales, modelos, ledger, stockLedger, rubros, imagenesRows, condicionantesRes, configuracionObras, exclusionesObras] = await Promise.all([
    base2 ? base2.materiales : traerTodo("panol_materiales", MATERIALES_SELECT),
    base2 ? base2.modelos : traerTodo("panol_material_modelo", MODELO_SELECT),
    traerLedgerPlanilla(obraIds),
    base2 ? base2.stockLedger : traerTodo("panol_obra_materiales_snapshot", STOCK_SELECT),
    base2 ? base2.rubros : traerRubros(),
    base2 ? base2.imagenesRows : traerTodo("panol_material_imagenes", "material_id,url,created_at"),
    traerCondicionantesLinea(linea),
    traerConfiguracionObras(obraIds),
    traerExclusionesObras(obraIds)
  ]);
  const porMaterial = new Map(materiales.filter((m) => m.activo !== false).map((m) => [m.id, m]));
  const imagenes = /* @__PURE__ */ new Map();
  for (const imagen of imagenesRows) {
    if (imagen.material_id && imagen.url && !imagenes.has(imagen.material_id)) {
      imagenes.set(imagen.material_id, imagen.url);
    }
  }
  const matrizBase = modelos.filter((row) => normalizarModelo(row.modelo) === modeloElegido).filter((row) => String(row.variante || "standard").toLowerCase() === "standard").filter((row) => Number(row.cantidad || 0) > 0).filter((row) => porMaterial.has(row.material_id));
  const productosCompatibles = await fetchRequisitoProductos(matrizBase.map((row) => row.material_id));
  const condicionantesLinea = (condicionantesRes?.condicionantes ?? []).filter((condicionante) => condicionante.activo !== false).filter((condicionante) => normalizarModelo(condicionante.modelo) === modeloElegido).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  const configuracionPorObra = new Map(
    configuracionObras.filter((row) => idsDeObra.has(row.obra_id)).map((row) => [`${row.obra_id}|${row.condicionante_id}`, row])
  );
  const exclusionesPorObra = /* @__PURE__ */ new Map();
  for (const exclusion of exclusionesObras) {
    if (!idsDeObra.has(exclusion.obra_id) || !exclusion.material_id) continue;
    const ids2 = exclusionesPorObra.get(exclusion.obra_id) ?? /* @__PURE__ */ new Set();
    ids2.add(exclusion.material_id);
    exclusionesPorObra.set(exclusion.obra_id, ids2);
  }
  const condicionanteActivo = (obraId, condicionante) => {
    const override = configuracionPorObra.get(`${obraId}|${condicionante.id}`);
    return override ? override.activo === true : condicionante.activo_por_defecto === true;
  };
  const matrizPorObra = /* @__PURE__ */ new Map();
  const matrizPorRequisito = /* @__PURE__ */ new Map();
  for (const obra of obrasDeLinea) {
    const exclusiones = exclusionesPorObra.get(obra.id) ?? /* @__PURE__ */ new Set();
    const items = new Map(
      matrizBase.filter((row) => !exclusiones.has(row.material_id)).map((row) => [row.material_id, {
        ...row,
        cantidad: redondear2(row.cantidad),
        baseCantidad: redondear2(row.cantidad),
        ajusteConfiguracion: 0,
        ajustesConfiguracion: [],
        origenes: ["matriz"],
        soloConfiguracion: false
      }])
    );
    for (const condicionante of condicionantesLinea) {
      if (!condicionanteActivo(obra.id, condicionante)) continue;
      const { replacements, consumedItemIds } = findConditionProductReplacements(
        [...items.values()],
        condicionante.items,
        productosCompatibles
      );
      for (const replacement of replacements) {
        const current = items.get(replacement.requirementId);
        if (!current) continue;
        items.set(replacement.requirementId, {
          ...current,
          producto_predeterminado_id: replacement.productId,
          productoCondicionante: true,
          ajustesConfiguracion: [...current.ajustesConfiguracion || [], {
            id: replacement.addition.id,
            configuracionId: condicionante.id,
            nombre: condicionante.nombre,
            delta: 0
          }],
          origenes: [.../* @__PURE__ */ new Set([...current.origenes || [], "opcional"])]
        });
      }
      for (const item of condicionante.items ?? []) {
        if (item.activo === false || consumedItemIds.has(item.id) || !item.material_id || !porMaterial.has(item.material_id)) continue;
        const cantidad = Math.abs(Number(item.cantidad ?? 1) || 1);
        const delta = item.tipo_item === "quita" ? -cantidad : cantidad;
        const ajuste = {
          id: item.id,
          configuracionId: condicionante.id,
          nombre: condicionante.nombre,
          delta: redondear2(delta)
        };
        const existente = items.get(item.material_id);
        if (existente) {
          const siguiente = redondear2(Math.max(0, Number(existente.cantidad || 0) + delta));
          if (siguiente <= 0) {
            items.delete(item.material_id);
          } else {
            items.set(item.material_id, {
              ...existente,
              cantidad: siguiente,
              ajusteConfiguracion: redondear2(Number(existente.ajusteConfiguracion || 0) + delta),
              ajustesConfiguracion: [...existente.ajustesConfiguracion || [], ajuste],
              origenes: [.../* @__PURE__ */ new Set([...existente.origenes || [], "opcional"])]
            });
          }
        } else if (delta > 0) {
          items.set(item.material_id, {
            material_id: item.material_id,
            modelo: modeloElegido,
            cantidad: redondear2(delta),
            baseCantidad: 0,
            ajusteConfiguracion: redondear2(delta),
            ajustesConfiguracion: [ajuste],
            variante: "standard",
            producto_predeterminado_id: null,
            origenes: ["opcional"],
            soloConfiguracion: true
          });
        }
      }
    }
    const filasObra = [...items.values()];
    matrizPorObra.set(obra.id, filasObra);
    for (const item of filasObra) {
      if (!matrizPorRequisito.has(item.material_id)) matrizPorRequisito.set(item.material_id, item);
    }
  }
  const requisitosExtra = [...matrizPorRequisito.keys()].filter((id) => !matrizBase.some((row) => row.material_id === id));
  const productosCompatiblesTodos = requisitosExtra.length ? [...productosCompatibles, ...await fetchRequisitoProductos(requisitosExtra)] : productosCompatibles;
  const requisitosConProductos = new Set(productosCompatiblesTodos.map((row) => row.requisito_material_id));
  const raizDeFamilia = /* @__PURE__ */ new Map();
  const miembrosDeFamilia = /* @__PURE__ */ new Map();
  for (const row of productosCompatiblesTodos) {
    const raiz = row.requisito_material_id;
    if (!raiz || !row.producto_material_id) continue;
    if (!miembrosDeFamilia.has(raiz)) miembrosDeFamilia.set(raiz, /* @__PURE__ */ new Set([raiz]));
    miembrosDeFamilia.get(raiz).add(row.producto_material_id);
    raizDeFamilia.set(row.producto_material_id, raiz);
    raizDeFamilia.set(raiz, raiz);
  }
  const stockLibre = /* @__PURE__ */ new Map();
  const stockReservado = /* @__PURE__ */ new Map();
  for (const fila of stockLedger) {
    if (!fila.material_id) continue;
    const delta = rowDelta(fila);
    if (!delta) continue;
    const bolsa = fila.obra_id ? stockReservado : stockLibre;
    bolsa.set(fila.material_id, (bolsa.get(fila.material_id) || 0) + delta);
  }
  const snapshotPorRequisitoObra = /* @__PURE__ */ new Map();
  const adicionales = [];
  for (const fila of ledger) {
    if (!fila.obra_id || !idsDeObra.has(fila.obra_id) || !fila.material_id) continue;
    const requisitoId = fila.requisito_material_id || fila.material_id;
    if (!matrizPorRequisito.has(requisitoId)) {
      adicionales.push(fila);
      continue;
    }
    const clave = `${requisitoId}|${fila.obra_id}`;
    const grupo = snapshotPorRequisitoObra.get(clave) ?? [];
    grupo.push(fila);
    snapshotPorRequisitoObra.set(clave, grupo);
  }
  const celdas = /* @__PURE__ */ new Map();
  for (const obra of obrasDeLinea) {
    for (const item of matrizPorObra.get(obra.id) ?? []) {
      const requisitoId = item.material_id;
      const snapshots = snapshotPorRequisitoObra.get(`${requisitoId}|${obra.id}`) ?? [];
      const snapshotConProducto = snapshots.find((row) => row.material_id && row.material_id !== requisitoId) || null;
      const snapshotOperado = snapshots.some((row) => row.purchase_request_id || row.purchase_request_item_id || row.panol_envio_id || row.panol_envio_item_id || row.recepcion_estado || Number(row.cantidad_egresada || 0) > 0 || !["", "pendiente"].includes(String(row.estado || "").toLowerCase()));
      const productoId = (item.productoCondicionante && !snapshotOperado ? item.producto_predeterminado_id : snapshotConProducto?.material_id) || item.producto_predeterminado_id || requisitoId;
      const clave = `${productoId}|${obra.id}`;
      const celda = celdaVacia(item.cantidad, requisitoId, true);
      celda.baseRequerido = redondear2(item.baseCantidad);
      celda.ajusteConfiguracion = redondear2(item.ajusteConfiguracion);
      celda.configuraciones = item.ajustesConfiguracion ?? [];
      celda.origenes = item.origenes?.length ? [...item.origenes] : ["matriz"];
      celda.configuracionSnapshotId = snapshotConProducto?.id || snapshots.find((row) => row.id)?.id || null;
      celda.productoMaterialId = productoId !== requisitoId ? productoId : null;
      celda.productoDefinido = productoId !== requisitoId;
      celda.productoEstandar = !snapshotConProducto && !item.productoCondicionante && !!item.producto_predeterminado_id;
      celda.requiereProductoConcreto = porMaterial.get(requisitoId)?.es_requisito === true || requisitosConProductos.has(requisitoId);
      if (celda.requiereProductoConcreto && !celda.productoDefinido) {
        let libreFamilia = 0;
        for (const id of miembrosDeFamilia.get(requisitoId) ?? [requisitoId]) {
          libreFamilia += Math.max(0, stockLibre.get(id) || 0);
        }
        if (libreFamilia >= Number(item.cantidad || 0)) celda.requiereProductoConcreto = false;
      }
      celda.especificaciones = snapshotConProducto?.especificaciones || snapshots.find((row) => row.especificaciones)?.especificaciones || {};
      if (snapshots.length) {
        const disponiblesParaAviso = snapshots.filter((row) => ESTADOS_PENDIENTE.has(row.estado) && !row.panol_envio_item_id).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        celda.snapshotId = disponiblesParaAviso[0]?.id || null;
        celda.avisoPendiente = snapshots.some((row) => !!row.panol_envio_item_id && !["recibido", "parcial", "rechazado"].includes(String(row.recepcion_estado || "").toLowerCase()));
        celda.pedidoAbierto = snapshots.some((row) => !!row.purchase_request_id && ["pedido", "comprado"].includes(String(row.estado || "").toLowerCase()));
        celda.egresado = 0;
        celda.enPanol = 0;
        celda.pendiente = 0;
        for (const fila of snapshots) sumarEstado(celda, fila);
        if (!item.soloConfiguracion && celda.pendiente > 0 && item.ajusteConfiguracion) {
          celda.pendiente = redondear2(Math.max(0, celda.pendiente + item.ajusteConfiguracion));
        }
      }
      const existente = celdas.get(clave);
      if (existente) {
        existente.requerido = redondear2(existente.requerido + celda.requerido);
        existente.egresado = redondear2(existente.egresado + celda.egresado);
        existente.enPanol = redondear2(existente.enPanol + celda.enPanol);
        existente.pendiente = redondear2(existente.pendiente + celda.pendiente);
        existente.snapshotId = existente.snapshotId || celda.snapshotId;
        existente.configuracionSnapshotId = existente.configuracionSnapshotId || celda.configuracionSnapshotId;
        existente.avisoPendiente = existente.avisoPendiente || celda.avisoPendiente;
        existente.pedidoAbierto = existente.pedidoAbierto || celda.pedidoAbierto;
        existente.productoMaterialId = existente.productoMaterialId || celda.productoMaterialId;
        existente.productoDefinido = existente.productoDefinido || celda.productoDefinido;
        existente.productoEstandar = existente.productoEstandar || celda.productoEstandar;
        existente.requiereProductoConcreto = existente.requiereProductoConcreto || celda.requiereProductoConcreto;
        existente.baseRequerido = redondear2(existente.baseRequerido + celda.baseRequerido);
        existente.ajusteConfiguracion = redondear2(existente.ajusteConfiguracion + celda.ajusteConfiguracion);
        existente.configuraciones = [...existente.configuraciones || [], ...celda.configuraciones || []];
        existente.especificaciones = Object.keys(existente.especificaciones || {}).length ? existente.especificaciones : celda.especificaciones;
        for (const origen of celda.origenes || []) sumarOrigen(existente, origen);
      } else {
        celdas.set(clave, celda);
      }
    }
  }
  for (const fila of adicionales) {
    const clave = `${fila.material_id}|${fila.obra_id}`;
    const celda = celdas.get(clave) ?? celdaVacia(fila.cantidad, fila.requisito_material_id || fila.material_id, false);
    sumarOrigen(celda, clasificarOrigenSnapshot(fila));
    if (ESTADOS_PENDIENTE.has(fila.estado) && !fila.panol_envio_item_id) celda.snapshotId = celda.snapshotId || fila.id;
    if (fila.panol_envio_item_id && !["recibido", "parcial", "rechazado"].includes(String(fila.recepcion_estado || "").toLowerCase())) {
      celda.avisoPendiente = true;
    }
    if (fila.purchase_request_id && ["pedido", "comprado"].includes(String(fila.estado || "").toLowerCase())) {
      celda.pedidoAbierto = true;
    }
    if (!celdas.has(clave)) celda.pendiente = 0;
    sumarEstado(celda, fila);
    celda.requerido = redondear2(Math.max(celda.requerido, celda.egresado + celda.enPanol + celda.pendiente));
    celdas.set(clave, celda);
  }
  const filas = /* @__PURE__ */ new Map();
  for (const [clave, celdaRaw] of celdas) {
    const [materialId, obraId] = clave.split("|");
    const filaId = celdaRaw.desdeMatriz && celdaRaw.requisitoId ? celdaRaw.requisitoId : materialId;
    const material = porMaterial.get(filaId) || porMaterial.get(materialId) || porMaterial.get(celdaRaw.requisitoId);
    if (!material) continue;
    if (material.es_consumible === true) continue;
    const celda = {
      requerido: redondear2(celdaRaw.requerido),
      egresado: redondear2(celdaRaw.egresado),
      enPanol: redondear2(celdaRaw.enPanol),
      pendiente: redondear2(celdaRaw.pendiente),
      desdeMatriz: celdaRaw.desdeMatriz,
      requisitoId: celdaRaw.requisitoId,
      snapshotId: celdaRaw.snapshotId || null,
      configuracionSnapshotId: celdaRaw.configuracionSnapshotId || null,
      avisoPendiente: celdaRaw.avisoPendiente === true,
      pedidoAbierto: celdaRaw.pedidoAbierto === true,
      productoMaterialId: celdaRaw.productoMaterialId || null,
      productoDefinido: celdaRaw.productoDefinido === true,
      productoEstandar: celdaRaw.productoEstandar === true,
      requiereProductoConcreto: celdaRaw.requiereProductoConcreto === true,
      especificaciones: celdaRaw.especificaciones || {},
      origenes: celdaRaw.origenes?.length ? celdaRaw.origenes : [celdaRaw.desdeMatriz ? "matriz" : "fuera_matriz"],
      baseRequerido: redondear2(celdaRaw.baseRequerido),
      ajusteConfiguracion: redondear2(celdaRaw.ajusteConfiguracion),
      configuraciones: celdaRaw.configuraciones || []
    };
    if (!filas.has(filaId)) {
      filas.set(filaId, {
        id: filaId,
        requisitoId: celda.requisitoId,
        ...materialMeta(material, rubros, imagenes),
        enPanolLibre: redondear2(Math.max(0, stockLibre.get(filaId) || 0)),
        reservado: redondear2(Math.max(0, stockReservado.get(filaId) || 0)),
        porObra: {},
        origenes: [],
        totales: { requerido: 0, egresado: 0, enPanol: 0, pendiente: 0 }
      });
    }
    const fila = filas.get(filaId);
    fila.porObra[obraId] = celda;
    fila.origenes = [.../* @__PURE__ */ new Set([...fila.origenes || [], ...celda.origenes || []])];
    for (const campo of ["requerido", "egresado", "enPanol", "pendiente"]) {
      fila.totales[campo] = redondear2(fila.totales[campo] + celda[campo]);
    }
  }
  const libreDeFamilia = /* @__PURE__ */ new Map();
  for (const [raiz, miembros] of miembrosDeFamilia) {
    let total = 0;
    for (const id of miembros) total += Math.max(0, stockLibre.get(id) || 0);
    libreDeFamilia.set(raiz, redondear2(total));
  }
  for (const fila of filas.values()) {
    fila.origenPrincipal = ["matriz", "opcional", "adicional", "panol", "fuera_matriz"].find((origen) => fila.origenes.includes(origen)) || "fuera_matriz";
    fila.familiaId = raizDeFamilia.get(fila.id) || null;
    fila.enPanolLibreFamilia = fila.familiaId ? libreDeFamilia.get(fila.familiaId) ?? fila.enPanolLibre : fila.enPanolLibre;
  }
  for (const fila of filas.values()) {
    if (fila.familiaId) continue;
    fila.faltaComprar = redondear2(Math.max(0, fila.totales.pendiente - fila.enPanolLibre));
  }
  const filasDeFamilia = /* @__PURE__ */ new Map();
  for (const fila of filas.values()) {
    if (!fila.familiaId) continue;
    if (!filasDeFamilia.has(fila.familiaId)) filasDeFamilia.set(fila.familiaId, []);
    filasDeFamilia.get(fila.familiaId).push(fila);
  }
  for (const [raiz, grupo] of filasDeFamilia) {
    const pendiente = grupo.reduce((suma, fila) => suma + (Number(fila.totales.pendiente) || 0), 0);
    const libre = libreDeFamilia.get(raiz) ?? 0;
    const comprar = Math.max(0, pendiente - libre);
    for (const fila of grupo) {
      const parte = pendiente > 0 ? (Number(fila.totales.pendiente) || 0) / pendiente : 0;
      fila.faltaComprar = redondear2(comprar * parte);
      fila.cubiertoPorFamilia = comprar === 0 && (Number(fila.totales.pendiente) || 0) > 0;
    }
  }
  const secundarios = await secundariosPromise;
  const listaFilas = [...filas.values(), ...secundarios.filas || []].sort((a, b) => {
    if (a.secundario !== b.secundario) return a.secundario ? 1 : -1;
    if (b.faltaComprar > 0 !== a.faltaComprar > 0) return b.faltaComprar > 0 ? 1 : -1;
    if (b.totales.pendiente > 0 !== a.totales.pendiente > 0) return b.totales.pendiente > 0 ? 1 : -1;
    const porRubro = a.rubro.localeCompare(b.rubro, "es");
    return porRubro !== 0 ? porRubro : a.descripcion.localeCompare(b.descripcion, "es");
  });
  const obrasConResumen = obrasDeLinea.map((obra) => {
    const celdasObra = listaFilas.map((fila) => fila.porObra[obra.id]).filter(Boolean);
    const pendientes = celdasObra.filter((celda) => celda.pendiente > 0).length;
    const enPanol = celdasObra.filter((celda) => celda.enPanol > 0).length;
    const entregados = celdasObra.filter((celda) => celda.egresado > 0).length;
    const opcionesPendientes = celdasObra.filter((celda) => celda.requiereProductoConcreto && !celda.productoDefinido).length;
    return {
      ...obra,
      filasCargadas: celdasObra.length,
      pendientes,
      enPanol,
      entregados,
      opcionesPendientes,
      carga: !matrizBase.length && !celdasObra.length ? "sin_matriz" : pendientes > 0 ? "con_pendientes" : "todo_llego"
    };
  });
  return {
    linea,
    lineasDisponibles,
    matrizMateriales: matrizBase.length,
    obras: obrasConResumen,
    filas: listaFilas,
    catalogo: [...porMaterial.values()].map((material) => ({
      ...material,
      imagen_url: material.imagen_url || imagenes.get(material.id) || ""
    })),
    productosCompatibles: productosCompatiblesTodos,
    resumen: {
      materiales: listaFilas.length,
      matrizMateriales: matrizBase.length,
      obras: obrasDeLinea.length,
      conPendiente: listaFilas.filter((fila) => fila.totales.pendiente > 0).length,
      sinProveedor: listaFilas.filter((fila) => !fila.proveedor && fila.totales.pendiente > 0).length,
      cubiertos: listaFilas.filter((fila) => fila.totales.pendiente > 0 && fila.enPanolLibre >= fila.totales.pendiente).length,
      aComprar: listaFilas.filter((fila) => fila.faltaComprar > 0).length,
      sinMatriz: matrizBase.length ? 0 : obrasDeLinea.length,
      rubros: new Set(listaFilas.map((fila) => fila.rubro)).size,
      opcionesPendientes: listaFilas.reduce((total, fila) => total + Object.values(fila.porObra).filter((celda) => celda.requiereProductoConcreto && !celda.productoDefinido).length, 0),
      origenes: Object.fromEntries(
        ["matriz", "opcional", "adicional", "panol", "fuera_matriz", "secundario", "laminacion", "maderas"].map((origen) => [origen, listaFilas.filter((fila) => fila.origenes.includes(origen)).length])
      ),
      secundarios: secundarios.resumen
    }
  };
}
async function calcularPlanillaDeLinea(linea, { base: base2 = null, sinSecundarios = false } = {}) {
  if (base2) return construirPlanillaDeLinea(linea, base2, { sinSecundarios });
  const clave = normalizarModelo(linea);
  const existente = planillasEnCurso.get(clave);
  if (existente) return existente;
  const solicitud = construirPlanillaDeLinea(linea);
  planillasEnCurso.set(clave, solicitud);
  try {
    return await solicitud;
  } finally {
    if (planillasEnCurso.get(clave) === solicitud) planillasEnCurso.delete(clave);
  }
}

// <stdin>
import { writeFileSync } from "node:fs";
var base = await cargarBasePlanilla();
var lines = [...new Set(base.obras.filter((o) => o.estado === "activa").map((o) => o.linea_nombre))];
var selected = /bachas?|grifer|monocomando|canilla|mezclador|duch|lavatorio|pileta|flexible|vanitory|rociador|llave.*(agua|cocina)/i;
var data = await Promise.all(lines.map(async (l) => {
  const p = await calcularPlanillaDeLinea(l, { base: Promise.resolve(base), sinSecundarios: true });
  return { linea: l, obras: p.obras, matrizMateriales: p.matrizMateriales, filas: p.filas.filter((f) => selected.test(f.descripcion) || /grifer/i.test(f.rubro)), families: p.productosCompatibles };
}));
var catalog = base.materiales.filter((m) => selected.test(m.descripcion) || /grifer/i.test(base.rubros.get(m.categoria_id) || ""));
var ids = data.flatMap((p) => p.obras.map((o) => o.id));
var add = await supabase.from("panol_obra_addons").select("*").in("obra_id", ids).order("id");
if (add.error) throw add.error;
writeFileSync(".tmp/griferias-live.json", JSON.stringify({ data, catalog, addons: add.data.filter((x) => selected.test(x.descripcion)), matriz: base.modelos.filter((m) => catalog.some((c) => c.id === m.material_id)), stock: base.stockLedger.filter((m) => catalog.some((c) => c.id === m.material_id)) }));
console.log(data.map((l) => [l.linea, l.obras.length, l.matrizMateriales, l.filas.length]));
