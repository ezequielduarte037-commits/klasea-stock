const DOCUMENT_LABELS = {
  remito: "un remito",
  factura: "una factura",
  presupuesto: "un presupuesto",
  otro: "otro tipo de documento",
};

export function documentTypeLabel(value) {
  const type = String(value || "").trim().toLowerCase();
  return DOCUMENT_LABELS[type] || "un documento no identificado";
}

function cantidadNumerica(valor) {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Renglones que de verdad sirven: descripción y cantidad entregada.
 *
 * No alcanza con que el modelo diga que hay items. Cuando el archivo no tiene
 * nada que ver, igual devuelve algo —un título, un encabezado, una fila de
 * totales— con la descripción sola y sin cantidad. Un renglón de remito es
 * "esto entregué y cuánto": sin las dos cosas no se puede recibir ni contar
 * como evidencia de que el archivo era un remito.
 */
function renglonesUtiles(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const descripcion = String(item?.descripcion || "").trim();
    const cantidad = cantidadNumerica(item?.cantidad);
    return descripcion.length >= 3 && cantidad != null && cantidad > 0;
  });
}

export function validateRemitoExtraction(parsed) {
  const type = String(parsed?.tipo_documento || "").trim().toLowerCase();
  const confidence = String(parsed?.confianza_documento || "").trim().toLowerCase();
  const explicitlyValid = parsed?.es_comprobante === true;
  const isRemito = type === "remito";

  const utiles = renglonesUtiles(parsed?.items);
  const proveedor = String(parsed?.proveedor || "").trim();
  const numero = String(parsed?.numero || "").trim();
  // Un remito lo emite alguien. Si no se pudo leer ni el proveedor ni el número,
  // no hay con qué respaldar que el archivo sea uno.
  const hayEncabezado = Boolean(proveedor || numero);

  // El modelo se autoevalúa, y cuando le das cualquier cosa se esfuerza igual:
  // contesta "remito" con confianza alta y arma renglones de la nada. Por eso
  // las dos condiciones de abajo no le preguntan a él, miran lo que devolvió.
  const ok = explicitlyValid
    && isRemito
    && confidence !== "baja"
    && utiles.length > 0
    && hayEncabezado;

  if (ok) return { ok: true, type, confidence, renglones: utiles.length };

  const reason = String(parsed?.motivo_clasificacion || "").trim();
  const cola = " No se guardó ni modificó stock.";

  // El motivo importa: no es lo mismo "esto es una factura" que "es un remito
  // pero no se leyó nada". Con un mensaje único el pañolero no sabe si el
  // archivo estaba mal o si hay que escanear de nuevo.
  if (!explicitlyValid || !isRemito) {
    const detalle = reason ? ` ${reason}` : "";
    return {
      ok: false,
      motivo: "no_es_remito",
      type: type || "desconocido",
      confidence: confidence || "baja",
      message: `Este archivo parece ser ${documentTypeLabel(type)}, no un remito.${detalle}${cola}`,
    };
  }

  if (confidence === "baja") {
    return {
      ok: false,
      motivo: "confianza_baja",
      type,
      confidence,
      message: `No se pudo confirmar que esto sea un remito${reason ? `: ${reason}` : "."}${cola}`,
    };
  }

  if (!utiles.length) {
    return {
      ok: false,
      motivo: "sin_renglones",
      type,
      confidence,
      message: `Se leyó el documento pero no se encontró ningún renglón con producto y cantidad. Puede ser un escaneo cortado o de mala calidad.${cola}`,
    };
  }

  return {
    ok: false,
    motivo: "sin_encabezado",
    type,
    confidence,
    message: `No se pudo leer el proveedor ni el número del remito, así que no hay con qué respaldarlo.${cola}`,
  };
}

export function assertRemitoExtraction(parsed) {
  const validation = validateRemitoExtraction(parsed);
  if (!validation.ok) throw new Error(validation.message);
  return parsed;
}
