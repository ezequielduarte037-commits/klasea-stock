import { materialBarcodeList } from "../materiales/materialBarcodes.js";
import { rowCountsAsStock, rowDelta, rowHasRecordedEgreso, rowIsTransit, rowSource } from "./panolMovimientos.js";

/*
 * Agrupación del ledger de pañol en productos y ubicaciones, y el renglón del
 * carrito de egreso. Vivía adentro de StockWmsPanel; se movió acá sin cambios
 * para que el stock maestro y el mostrador de egresos (panol/mostrador) lean
 * el stock con la misma cuenta. La cuenta de cada fila sigue siendo
 * panolMovimientos (rowDelta, rowCountsAsStock).
 */

// El carrito sobrevive recargas y cambios de pantalla. Lo comparten el stock
// maestro ("Agregar al carrito") y el mostrador de egresos.
export const PANOL_CART_STORAGE_KEY = "klasea:panol-carrito.v2";

export function norm(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function codeKey(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

export function groupMatchesCode(group, code) {
  const clean = codeKey(code);
  if (!clean) return false;
  const candidates = [
    group.codigo,
    group.codigo_barra,
    group.material?.codigo,
    group.material?.codigo_barra,
    ...materialBarcodeList(group.material).map((row) => row.codigo),
    ...(group.rows || []).flatMap((row) => [row.codigo, row.codigo_barra]),
    ...(group.rows || []).flatMap((row) => materialBarcodeList(row).map((barcode) => barcode.codigo)),
  ];
  return candidates.some((value) => codeKey(value) === clean);
}

export function qty(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function fmtQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return Number(Math.round(n * 100) / 100).toLocaleString("es-AR");
}

export function rowSede(row) {
  return row.stock_sede || row.panol_envio?.sede || "";
}

export function rowObraId(row) {
  return row.obra?.id || row.obra_id || "";
}

export function rowObraLabel(row) {
  if (!rowObraId(row)) return rowSede(row) ? `Stock ${rowSede(row)}` : "Stock general";
  return row.obra?.codigo || row.panol_envio?.destino || "Sin obra";
}

export function rowLocationKey(row) {
  // Bug 52-23: Si está por recibir pero tiene destino a obra, tratar de asignarlo a esa obra
  if (rowIsTransit(row) && !row.obra_id && row.panol_envio?.destino?.toLowerCase().includes("obra")) {
    // Asumimos que si no sabemos la obra exacta por ID, al menos el destino indica la intención.
    // Esto es un hack heurístico; lo ideal es que en StockWmsPanel filtremos mejor.
  }
  return `${rowSede(row) || "general"}::${rowObraId(row) || "stock"}`;
}

export function rowIsAdditional(row) {
  return row.es_adicional === true || row.request?.es_adicional === true;
}

export function rowTipoPedido(row) {
  // Adicional de una obra
  if (rowIsAdditional(row) || row.tipo_pedido === "adicional" || row.request?.tipo_pedido === "adicional") return "adicional";
  // Stock pañol = stock general SIN obra asignada (conteo físico, ingreso general,
  // transferencias a stock). Estándar = reservado/asignado a una obra puntual.
  // Antes se clasificaba por sede (Pampa=stock), lo cual no tenía sentido.
  if (!rowObraId(row)) return "stock";
  return "estandar";
}

export function productKey(row, fObra) {
  const identity = row.material_id || norm([row.codigo, row.descripcion].filter(Boolean).join(" ")) || row.id;
  // Si estamos en el maestro (fObra === "todas"), NO fragmentamos por tipo.
  if (fObra === "todas") return `all::${identity}`;
  return `${rowTipoPedido(row)}::${identity}`;
}

export function rowUnitPriceUsd(row) {
  if (String(row.moneda || "").toUpperCase() !== "USD") return 0;
  return qty(row.precio_unitario, 0);
}

export function categoryLabel(row) {
  return row.categoria_nombre || row.categoria || row.rubro || "";
}

export function defaultLocation(defaultSede) {
  return {
    key: `${defaultSede || "general"}::stock`,
    label: defaultSede ? `Stock ${defaultSede}` : "Stock general",
    sede: defaultSede || "",
    obraId: "",
    available: 0,
    rows: [],
  };
}

// El tipo del grupo se decide por el STOCK DISPONIBLE, no por el primer renglón
// (que podía ser un tránsito suelto y forzaba "Estándar"). Si hay stock general
// disponible → Stock pañol; si el stock disponible está reservado a obra → Estándar.
export function groupTipoFromStock(group) {
  const stockRows = (group.rows || []).filter((r) => rowCountsAsStock(r));
  const rowsUse = stockRows.length ? stockRows : (group.rows || []);
  if (rowsUse.some((r) => rowIsAdditional(r))) return "adicional";
  if (rowsUse.some((r) => !rowObraId(r))) return "stock";
  if (rowsUse.some((r) => rowObraId(r))) return "estandar";
  return group.tipoPedido || "estandar";
}

// "Solo por recibir": no tiene stock real, solo tránsito (ej. recepciones que
// quedaron colgadas). Van al fondo del maestro para no molestar.
export function isTransitOnly(group) {
  return group.total <= 0.0001 && group.transitQty > 0 && !group.negativo;
}

export function buildProductGroups(rows = [], fObra = "todas") {
  const map = new Map();
  for (const row of rows) {
    const key = productKey(row, fObra);
    if (!map.has(key)) {
      const tipoPedido = rowTipoPedido(row);
      map.set(key, {
        key,
        material: {
          id: row.material_id || null,
          descripcion: row.descripcion || "",
          codigo: row.codigo || "",
          codigo_barra: row.codigo_barra || "",
          codigos_barra: row.codigos_barra || [],
          unidad: row.unidad || "unidad",
          proveedor: row.proveedor || "",
          stock_minimo: row.stock_minimo ?? null,
          imagen_url: row.imagen_url || null,
          notas: row.notas || null,
          es_requisito: row.es_requisito === true,
        },
        imagenUrl: row.imagen_url || null,
        notas: row.notas || null,
        verificacion: row.verificacion_estado || "pendiente",
        verificacionProblemas: row.verificacion_problemas || [],
        verificadoAt: row.verificado_at || null,
        verificacionNota: row.verificacion_nota || null,
        // Manda el nombre actual del catálogo; la copia del movimiento queda
        // como respaldo para las filas viejas que no tienen material vinculado.
        label: row.descripcion_catalogo || row.descripcion || "(sin descripcion)",
        labelHistorico: row.descripcion && row.descripcion_catalogo && row.descripcion !== row.descripcion_catalogo ? row.descripcion : "",
        codigo: row.codigo || "",
        codigo_barra: row.codigo_barra || "",
        codigos_barra: row.codigos_barra || [],
        proveedor: row.proveedor || "",
        unidad: row.unidad || "unidad",
        stockMinimo: row.stock_minimo ?? null,
        tipoPedido,
        variantes: Array.isArray(row.variantes) ? row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean) : [],
        esRequisito: row.es_requisito === true,
        productosCompatibles: Array.isArray(row.productos_compatibles) ? row.productos_compatibles : [],
        variantesEnStock: new Set(),
        opcionMap: new Map(),
        ubicacion: row.ubicacion || null,
        ubicacion_obs: row.ubicacion_obs || null,
        total: 0,
        transitQty: 0,
        valueUsd: 0,
        hasEgreso: false,
        rows: [],
        locationMap: new Map(),
        categorias: new Set(),
        detalles: new Set(),
        sedes: new Set(),
        updatedAt: null,
      });
    }
    const group = map.get(key);
    if (group.stockMinimo == null && row.stock_minimo != null) {
      group.stockMinimo = row.stock_minimo;
      group.material.stock_minimo = row.stock_minimo;
    }
    if (!group.ubicacion && row.ubicacion) {
      group.ubicacion = row.ubicacion;
      group.ubicacion_obs = row.ubicacion_obs || null;
    }
    if (!group.imagenUrl && row.imagen_url) {
      group.imagenUrl = row.imagen_url;
      group.material.imagen_url = row.imagen_url;
    }
    // Entre varias filas del mismo producto gana la que ya fue revisada: el
    // estado vive en la ficha, no en el renglón de stock.
    if (group.verificacion === "pendiente" && row.verificacion_estado && row.verificacion_estado !== "pendiente") {
      group.verificacion = row.verificacion_estado;
      group.verificacionProblemas = row.verificacion_problemas || [];
      group.verificadoAt = row.verificado_at || null;
      group.verificacionNota = row.verificacion_nota || null;
    }
    if (!group.codigo_barra && row.codigo_barra) {
      group.codigo_barra = row.codigo_barra;
      group.material.codigo_barra = row.codigo_barra;
    }
    if ((!group.variantes || !group.variantes.length) && Array.isArray(row.variantes) && row.variantes.length) {
      group.variantes = row.variantes.map((v) => (v && typeof v === "object" ? v.nombre : String(v || ""))).filter(Boolean);
    }
    if (row.es_requisito === true) {
      group.esRequisito = true;
      group.material.es_requisito = true;
      if ((!group.productosCompatibles || !group.productosCompatibles.length) && Array.isArray(row.productos_compatibles)) {
        group.productosCompatibles = row.productos_compatibles;
      }
    }
    const varChosen = String(row.opcion_asignada || row.variante || "").trim();
    if (varChosen) group.variantesEnStock.add(varChosen);
    if (row.codigos_barra?.length) {
      group.material.codigos_barra = [
        ...(group.material.codigos_barra || []),
        ...row.codigos_barra,
      ];
    }
    const delta = rowDelta(row);
    const locKey = rowLocationKey(row);
    if (!group.locationMap.has(locKey)) {
      group.locationMap.set(locKey, {
        key: locKey,
        label: rowObraLabel(row),
        sede: rowSede(row),
        obraId: rowObraId(row),
        obraEstado: row.obra?.estado || "",
        available: 0,
        transitQty: 0,
        valueUsd: 0,
        variantMap: new Map(),
        rows: [],
      });
    }
    const location = group.locationMap.get(locKey);
    if (!location.obraEstado && row.obra?.estado) location.obraEstado = row.obra.estado;
    location.available += delta;
    location.valueUsd += delta * rowUnitPriceUsd(row);
    // Desglose por opción dentro de este depósito/obra. `opcion_asignada`
    // cubre los productos concretos nuevos y `variante` conserva los registros
    // históricos (Samsung: 10 · LG: 10).
    const vName = String(row.opcion_asignada || row.variante || "").trim();
    if (!location.variantMap.has(vName)) location.variantMap.set(vName, { available: 0, transitQty: 0 });
    const vAgg = location.variantMap.get(vName);
    vAgg.available += delta;
    if (!group.opcionMap.has(vName)) group.opcionMap.set(vName, { available: 0, transitQty: 0 });
    const optionAgg = group.opcionMap.get(vName);
    optionAgg.available += delta;
    if (rowIsTransit(row)) {
      const transit = qty(row.cantidad, 1);
      location.transitQty += transit;
      group.transitQty += transit;
      vAgg.transitQty += transit;
      optionAgg.transitQty += transit;
    }
    if (rowHasRecordedEgreso(row)) group.hasEgreso = true;
    location.rows.push(row);
    group.total += delta;
    group.valueUsd += delta * rowUnitPriceUsd(row);
    group.rows.push(row);
    if (rowSede(row)) group.sedes.add(rowSede(row));
    if (categoryLabel(row)) group.categorias.add(categoryLabel(row));
    [row.request?.description, row.request?.title, row.notas, row.recepcion_nota, row.stock_nota]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .slice(0, 3)
      .forEach((value) => group.detalles.add(value));
    const ts = row.egreso_at || row.recepcion_updated_at || row.updated_at || row.created_at;
    if (ts && (!group.updatedAt || new Date(ts) > new Date(group.updatedAt))) group.updatedAt = ts;
  }

  return [...map.values()].map((group) => {
    const locations = [...group.locationMap.values()]
      .map((loc) => ({
        ...loc,
        porVariante: [...loc.variantMap.entries()]
          .filter(([name, agg]) => name && (Math.abs(agg.available) > 0.0001 || agg.transitQty > 0))
          .map(([name, agg]) => ({ variante: name, available: agg.available, transitQty: agg.transitQty }))
          .sort((a, b) => b.available - a.available),
      }))
      .sort((a, b) => b.available - a.available || a.label.localeCompare(b.label, "es", { numeric: true }));
    const hasPositiveStock = locations.some((loc) => loc.available > 0.0001);
    return {
      ...group,
      opciones: [...group.opcionMap.entries()]
        .filter(([name, agg]) => name && (Math.abs(agg.available) > 0.0001 || agg.transitQty > 0))
        .map(([name, agg]) => ({ nombre: name, available: agg.available, transitQty: agg.transitQty }))
        .sort((a, b) => b.available - a.available || a.nombre.localeCompare(b.nombre, "es", { numeric: true })),
      tipoPedido: groupTipoFromStock(group),
      locations,
      egresado: group.hasEgreso && Math.abs(group.total) <= 0.0001 && !hasPositiveStock && group.transitQty <= 0,
      negativo: group.total < -0.0001,
      locationImbalance: group.total >= -0.0001 && locations.some((loc) => loc.available < -0.0001),
      inTransit: group.transitQty > 0,
    };
  }).sort((a, b) => {
    // Los "solo por recibir" (sin stock real) van al fondo.
    const at = isTransitOnly(a) ? 1 : 0;
    const bt = isTransitOnly(b) ? 1 : 0;
    if (at !== bt) return at - bt;
    if (a.negativo !== b.negativo) return a.negativo ? -1 : 1;
    if (Math.abs(b.total) !== Math.abs(a.total)) return Math.abs(b.total) - Math.abs(a.total);
    return a.label.localeCompare(b.label, "es", { numeric: true });
  });
}

export function defaultEgresoQty(location) {
  const available = qty(location?.available, 0);
  return String(available > 0 ? Number(available.toFixed(2)) : 1);
}

export function cleanCartVariant(value) {
  return String(value || "").trim();
}

export function cartVariantKey(value) {
  const variant = cleanCartVariant(value).toLocaleLowerCase("es");
  return encodeURIComponent(variant || "sin-especificar");
}

export function cartLineKey(baseKey, variante = "") {
  return `${baseKey}::variante:${cartVariantKey(variante)}`;
}

export function cartBaseKey(item) {
  if (item?.baseKey) return item.baseKey;
  return String(item?.key || "").split("::variante:")[0];
}

export function availableForVariant(location, variante = "") {
  const variant = cleanCartVariant(variante);
  if (!variant) return qty(location?.available, 0);
  const match = (location?.porVariante || []).find((row) => cleanCartVariant(row.variante).toLocaleLowerCase("es") === variant.toLocaleLowerCase("es"));
  return qty(match?.available, 0);
}

export function normalizeStoredCartItem(item) {
  const baseKey = cartBaseKey(item);
  const variante = cleanCartVariant(item?.variante);
  return {
    ...item,
    baseKey,
    key: cartLineKey(baseKey, variante),
    variante,
    locationAvailable: qty(item?.locationAvailable, qty(item?.available, 0)),
    porVariante: Array.isArray(item?.porVariante) ? item.porVariante : [],
    esRequisito: item?.esRequisito === true,
    productosCompatibles: Array.isArray(item?.productosCompatibles) ? item.productosCompatibles : [],
    productoMaterialId: item?.productoMaterialId || "",
  };
}

export function refreshCartRequirementMetadata(cart = [], stockRows = []) {
  if (!cart.length || !stockRows.length) return cart;

  const metaByMaterialId = new Map();
  for (const row of stockRows) {
    if (!row?.material_id) continue;
    const current = metaByMaterialId.get(row.material_id);
    const compatibles = Array.isArray(row.productos_compatibles) ? row.productos_compatibles : [];
    if (!current || compatibles.length > current.productosCompatibles.length) {
      metaByMaterialId.set(row.material_id, {
        esRequisito: row.es_requisito === true,
        productosCompatibles: compatibles,
      });
    } else if (row.es_requisito === true && !current.esRequisito) {
      metaByMaterialId.set(row.material_id, { ...current, esRequisito: true });
    }
  }

  let changed = false;
  const next = cart.map((item) => {
    const materialId = item?.material?.id || item?.material_id || item?.materialId || null;
    const meta = materialId ? metaByMaterialId.get(materialId) : null;
    if (!meta) return item;

    const compatibles = meta.productosCompatibles;
    const selectedStillValid = compatibles.some((producto) => producto.id === item.productoMaterialId);
    const productoMaterialId = selectedStillValid
      ? item.productoMaterialId
      : (compatibles.length === 1 ? compatibles[0].id : "");
    const materialNeedsUpdate = item?.material?.es_requisito !== meta.esRequisito;
    const compatiblesChanged = JSON.stringify(item.productosCompatibles || []) !== JSON.stringify(compatibles);
    if (
      item.esRequisito === meta.esRequisito
      && item.productoMaterialId === productoMaterialId
      && !materialNeedsUpdate
      && !compatiblesChanged
    ) return item;

    changed = true;
    return {
      ...item,
      esRequisito: meta.esRequisito,
      productosCompatibles: compatibles,
      productoMaterialId,
      material: item.material ? { ...item.material, es_requisito: meta.esRequisito } : item.material,
    };
  });
  return changed ? next : cart;
}

export function remainingCartVariants(item, cart = []) {
  const baseKey = cartBaseKey(item);
  const used = new Set(
    cart
      .filter((row) => cartBaseKey(row) === baseKey)
      .map((row) => cleanCartVariant(row.variante).toLocaleLowerCase("es"))
      .filter(Boolean),
  );
  return (item?.variantes || []).filter((variant) => !used.has(cleanCartVariant(variant).toLocaleLowerCase("es")));
}

export function additionalVariantCartItem(item, variante) {
  const cleanVariant = cleanCartVariant(variante);
  const available = availableForVariant({ available: item.locationAvailable, porVariante: item.porVariante }, cleanVariant);
  const baseKey = cartBaseKey(item);
  return {
    ...item,
    key: cartLineKey(baseKey, cleanVariant),
    baseKey,
    variante: cleanVariant,
    available,
    cantidad: defaultEgresoQty({ available }),
  };
}

export function compactEgresoSourceRows(location) {
  return (location?.rows || []).map((row) => ({
    id: row.id,
    material_id: row.material_id || null,
    requisito_material_id: row.requisito_material_id || null,
    cantidad: row.cantidad,
    cantidad_egresada: row.cantidad_egresada,
    estado: row.estado,
    recepcion_estado: row.recepcion_estado,
    source: row.source,
    variante: row.variante || "",
    opcion_asignada: row.opcion_asignada || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
}

export function makeCartItem(group, location, { cantidad, sede, codigo, unidad, variante = "" } = {}) {
  const isCatalogOnly = !!group?.catalogOnly;
  const itemSede = isCatalogOnly ? sede : (location?.sede || sede);
  const baseKey = `${group.key}::${isCatalogOnly ? itemSede || "general" : location?.key || "stock"}`;
  const cleanVariant = cleanCartVariant(variante);
  const variantAvailable = availableForVariant(location, cleanVariant);
  const variantes = [...new Set([
    ...(Array.isArray(group.variantes) ? group.variantes : []),
    ...(location?.porVariante || []).map((row) => cleanCartVariant(row.variante)),
  ].filter(Boolean))];
  return {
    key: cartLineKey(baseKey, cleanVariant),
    baseKey,
    groupKey: group.key,
    label: group.label,
    material: group.material,
    codigo: isCatalogOnly ? String(codigo || "").trim() : group.codigo,
    unidad: isCatalogOnly ? String(unidad || group.unidad || "unidad").trim() : group.unidad,
    cantidad: String(cantidad || defaultEgresoQty({ available: variantAvailable })),
    sede: itemSede || "",
    obraId: isCatalogOnly ? null : (location?.obraId || null),
    locationLabel: isCatalogOnly ? (itemSede ? `Stock ${itemSede}` : "Sin registro digital") : (location?.label || "Stock general"),
    available: variantAvailable,
    locationAvailable: qty(location?.available, 0),
    porVariante: Array.isArray(location?.porVariante) ? location.porVariante.map((row) => ({ ...row })) : [],
    catalogOnly: isCatalogOnly,
    transferable: !isCatalogOnly,
    esAdicional: !!group.esAdicional,
    variantes,
    variante: cleanVariant,
    esRequisito: group.esRequisito === true,
    productosCompatibles: Array.isArray(group.productosCompatibles) ? group.productosCompatibles : [],
    productoMaterialId: "",
    sourceRows: compactEgresoSourceRows(location),
  };
}

export function egresoDisplayEmployee(empleado) {
  if (!empleado) return null;
  return {
    name: String(empleado.nombre || "").trim(),
    dni: String(empleado.dni || "").trim(),
    photoUrl: String(empleado.foto_url || "").trim(),
    sede: String(empleado.sede || "").trim(),
  };
}

export function egresoDisplayDestination(cart = [], obras = [], destinoObraId = "", sectorDestino = "") {
  const selected = obras.find((obra) => obra.id === destinoObraId)?.codigo;
  if (selected) return selected;
  const assigned = [...new Set(
    cart
      .map((item) => obras.find((obra) => obra.id === item.obraId)?.codigo)
      .filter(Boolean),
  )];
  if (assigned.length) return assigned.join(", ");
  return String(sectorDestino || "").trim() || "Destino a confirmar";
}

export function egresoDisplayItems(cart = [], obras = [], destinoObraId = "") {
  const selectedDestination = obras.find((obra) => obra.id === destinoObraId)?.codigo || "";
  return cart.map((item) => ({
    key: item.key,
    label: item.label,
    quantity: qty(item.cantidad, 0),
    unit: item.unidad || "u",
    variant: item.variante || "",
    origin: item.locationLabel || (item.sede ? `Stock ${item.sede}` : "Pañol"),
    destination: selectedDestination || obras.find((obra) => obra.id === item.obraId)?.codigo || "",
  }));
}

export function rowIsAsignacionStock(row) {
  return rowSource(row) === "transferencia_ingreso" && !!rowObraId(row) && !rowHasRecordedEgreso(row);
}

export function rowIsLiberacionStock(row) {
  return rowSource(row) === "transferencia_egreso" && !!rowObraId(row) && !row.egreso_destino_obra_id;
}

export function rowIsAsignacionMirrorOut(row) {
  return rowSource(row) === "transferencia_egreso" && !rowIsLiberacionStock(row);
}

export function rowIsMovimientoEspejo(row) {
  // Una liberación se muestra desde la obra de origen. Su ingreso en stock
  // general conserva el saldo, pero no representa una segunda operación.
  // Si después se retira ese ingreso, su salida física sí debe verse.
  return rowIsAsignacionMirrorOut(row)
    || (rowSource(row) === "transferencia_ingreso" && !rowObraId(row)
      && !!row.obra_origen_id && !rowHasRecordedEgreso(row));
}

export function rowInHistory(row) {
  return !rowIsMovimientoEspejo(row) && (rowIsAsignacionStock(row) || rowHasRecordedEgreso(row));
}

export function rowEgresoKind(row) {
  const source = rowSource(row);
  if (rowIsLiberacionStock(row)) return "liberacion";
  if (rowIsAsignacionStock(row)) {
    return row.obra_origen_id ? "reasignacion" : "asignacion";
  }
  if (row.egreso_destino_obra_id || source.startsWith("transferencia_egreso")) {
    return rowObraId(row) ? "reasignacion_egreso" : "egreso_obra";
  }
  return "egreso";
}

export function rowEgresoQuantity(row) {
  return Math.abs(rowDelta(row)) || Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
}
