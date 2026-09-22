function clean(value) {
  return String(value ?? "").trim();
}

function supplierKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeSupplierComponents(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((row) => ({
      descripcion: clean(row?.descripcion || row?.description),
      codigo: clean(row?.codigo || row?.code),
      cantidad: Number(row?.cantidad ?? row?.quantity ?? 1) || 1,
      unidad: clean(row?.unidad || row?.unit) || "unidad",
    }))
    .filter((row) => row.descripcion || row.codigo);
}

/**
 * Denominación y código con los que UN proveedor reconoce el artículo.
 * El nombre interno del catálogo no se reemplaza: ambos cumplen funciones
 * distintas y el término del proveedor puede variar entre casas.
 */
export function supplierTermsForMaterial(material, { proveedorId = null, proveedor = "" } = {}) {
  if (!material) return null;
  const wantedName = supplierKey(proveedor);
  const entries = Array.isArray(material.proveedores_lista) ? material.proveedores_lista : [];
  const match = entries.find((entry) => {
    if (proveedorId && entry?.proveedor_id === proveedorId) return true;
    if (!wantedName) return false;
    return supplierKey(entry?.proveedor?.nombre) === wantedName;
  }) || (proveedorId && material.proveedor_id === proveedorId
    ? entries.find((entry) => entry?.proveedor_id === material.proveedor_id)
    : null);

  if (!match) return null;
  return {
    supplierId: match.proveedor_id || proveedorId || null,
    supplierName: clean(match.proveedor?.nombre || proveedor || material.proveedor) || null,
    description: clean(match.denominacion_proveedor) || null,
    code: clean(match.codigo_proveedor) || null,
    components: normalizeSupplierComponents(match.componentes_pedido),
  };
}

export function supplierSnapshotForMaterial(material, options = {}) {
  const terms = supplierTermsForMaterial(material, options);
  return {
    supplier_id: terms?.supplierId || options.proveedorId || null,
    supplier_name: terms?.supplierName || clean(options.proveedor) || null,
    supplier_description: terms?.description || null,
    supplier_code: terms?.code || null,
    supplier_components: terms?.components || [],
  };
}

function toNum(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// "4 unidad" y "50.000 metro" son del sistema, no de una orden de compra.
const UNIDAD_CORTA = {
  unidad: "u", unidades: "u", u: "u",
  metro: "m", metros: "m", mt: "m", mts: "m", m: "m",
  kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg", kg: "kg",
  litro: "l", litros: "l", lt: "l", lts: "l", l: "l",
};

function unidadCorta(unidad) {
  const limpio = clean(unidad);
  if (!limpio) return "";
  return UNIDAD_CORTA[limpio.toLowerCase()] || limpio;
}

// Las fechas del sistema vienen como "2026-09-25" (columna date). Pasarlas por
// new Date() las lee como medianoche UTC y acá, en UTC-3, quedaba el día anterior.
function fechaCorta(value) {
  if (!value) return "";
  const plano = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (plano) return `${plano[3]}/${plano[2]}/${plano[1]}`;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function cantidadTexto(value) {
  const n = toNum(value);
  if (n == null) return clean(value);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

/**
 * Renglones listos para pedirle a un proveedor, a partir de los ítems de un
 * pedido de compras (purchase_request_items).
 */
export function ordenLineasDesdePedido(items = [], { proveedorPorDefecto = "" } = {}) {
  return (Array.isArray(items) ? items : []).flatMap((item) => supplierPurchaseLines(item).map((line) => ({
    proveedor: clean(item?.supplier_name) || clean(proveedorPorDefecto),
    descripcion: line.description,
    codigo: line.code,
    cantidad: line.quantity,
    unidad: line.unit,
  })));
}

/**
 * Lo mismo desde las filas de las listas de materiales (matriz / obra), que ya
 * traen la denominación del proveedor resuelta y sus componentes de pedido.
 */
export function ordenLineasDesdeMatriz(rows = []) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const partes = Array.isArray(row?.supplierComponents) ? row.supplierComponents : [];
    if (partes.length) {
      return partes.map((parte) => ({
        proveedor: clean(row.proveedor),
        descripcion: parte.descripcion || row.supplierDescription || row.descripcion,
        codigo: parte.codigo,
        cantidad: (toNum(row.cantidad) || 1) * (toNum(parte.cantidad) || 1),
        unidad: parte.unidad || row.unidad,
      }));
    }
    return [{
      proveedor: clean(row.proveedor),
      descripcion: row.supplierDescription || row.descripcion,
      codigo: row.supplierCode || row.codigo,
      cantidad: row.cantidad,
      unidad: row.unidad,
    }];
  });
}

/**
 * Agrupa por proveedor y junta los renglones repetidos del mismo artículo.
 * Sumar los iguales es lo correcto en una OC: el proveedor despacha por
 * artículo, no por el renglón de la lista del que salió.
 */
export function agruparOrdenPorProveedor(lineas = []) {
  const grupos = new Map();
  for (const linea of lineas) {
    const descripcion = clean(linea?.descripcion);
    const codigo = clean(linea?.codigo);
    if (!descripcion && !codigo) continue;
    const proveedor = clean(linea?.proveedor);
    const unidad = unidadCorta(linea?.unidad);
    if (!grupos.has(proveedor)) grupos.set(proveedor, { proveedor, lineas: [], indice: new Map() });
    const grupo = grupos.get(proveedor);
    const clave = `${descripcion.toLowerCase()}|${codigo.toLowerCase()}|${unidad.toLowerCase()}`;
    const existente = grupo.indice.get(clave);
    const cantidad = toNum(linea?.cantidad);
    if (existente) {
      const suma = toNum(existente.cantidad);
      existente.cantidad = suma != null && cantidad != null ? suma + cantidad : (existente.cantidad ?? cantidad);
      continue;
    }
    const fila = { descripcion, codigo, cantidad, unidad };
    grupo.lineas.push(fila);
    grupo.indice.set(clave, fila);
  }
  return [...grupos.values()]
    .map(({ proveedor, lineas: filas }) => ({ proveedor, lineas: filas }))
    .sort((a, b) => {
      if (!a.proveedor) return 1;
      if (!b.proveedor) return -1;
      return a.proveedor.localeCompare(b.proveedor, "es");
    });
}

/**
 * Texto de orden de compra para mandarle al proveedor por mail o WhatsApp.
 *
 * Sólo lleva qué y cuánto. Estado, prioridad, código de obra, destino interno,
 * notas y links del sistema quedan afuera: al proveedor no le dicen nada y
 * obligaban a reescribir el mensaje entero antes de mandarlo.
 *
 * Texto plano a propósito: el markdown se ve literal en WhatsApp y en mail.
 */
export function buildOrdenProveedorTexto({ grupos = [], necesarioPara = null, fecha = new Date() } = {}) {
  const conLineas = grupos.filter((grupo) => grupo.lineas?.length);
  if (!conLineas.length) return "";

  const fechaTexto = fechaCorta(fecha);
  const lines = [`Pedido Klase A${fechaTexto ? ` · ${fechaTexto}` : ""}`, ""];
  const variosProveedores = conLineas.length > 1;

  conLineas.forEach((grupo, indiceGrupo) => {
    if (variosProveedores) {
      lines.push((grupo.proveedor || "Sin proveedor asignado").toUpperCase());
    }
    grupo.lineas.forEach((linea, i) => {
      const cantidad = [cantidadTexto(linea.cantidad), unidadCorta(linea.unidad)].filter(Boolean).join(" ");
      const codigo = linea.codigo ? ` (${linea.codigo})` : "";
      lines.push(`${i + 1}) ${cantidad ? `${cantidad} — ` : ""}${linea.descripcion || "Sin detalle"}${codigo}`);
    });
    if (indiceGrupo < conLineas.length - 1) lines.push("");
  });

  const necesarioTexto = fechaCorta(necesarioPara);
  if (necesarioTexto) {
    lines.push("");
    lines.push(`Necesario para: ${necesarioTexto}`);
  }

  return lines.join("\n").trim();
}

export function supplierPurchaseLines(item) {
  const components = normalizeSupplierComponents(item?.supplier_components);
  const baseQty = Number(item?.quantity) || 1;
  if (components.length) {
    return components.map((component) => ({
      description: component.descripcion || item?.supplier_description || item?.description || "Ítem sin detalle",
      code: component.codigo || "",
      quantity: baseQty * component.cantidad,
      unit: component.unidad || item?.unit || "unidad",
      sourceDescription: item?.description || "",
    }));
  }
  return [{
    description: clean(item?.supplier_description) || item?.description || "Ítem sin detalle",
    code: clean(item?.supplier_code),
    quantity: item?.quantity,
    unit: item?.unit,
    sourceDescription: item?.description || "",
  }];
}
