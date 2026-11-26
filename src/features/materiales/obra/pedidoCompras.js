// Lo que viaja a Compras por cada renglón que se pide desde la lista de un barco.
//
// Antes el renglón llegaba sin el link de compra ni la foto aunque el producto
// los tuviera cargados (de 223 renglones en 60 días, 2 con link y 0 con foto), y
// la nota juntaba texto que arma el sistema y no sirve para comprar: "Creado
// desde variante legacy de…", "Pedido original: …", "Fue adicional de 55-2.",
// "Condicionante · Griferia Negra", el requisito repetido dos veces. Lo que
// escribió una persona ("4 popa, 2 laterales", "El link es pack x10") se queda.

const ETIQUETAS_DE_GRUPO = new Set(["base", "condicionante", "adicional", "addon", "variante", "linea eje", "línea eje"]);

const FRASES_DEL_SISTEMA = [
  /^creado desde variante legacy\b/i,
  /^pedido original:/i,
  /^fue adicional de\b/i,
  /^requisito( de matriz)?:/i,
  /^recepci\S* por remito\b/i,
  /^lista est[aá]ndar k\d+$/i,
  /^obra \d+-\d+\.?$/i,
];

function limpio(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clave(value) {
  return limpio(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[*•\s]+/, "")
    .replace(/[.\s]+$/, "");
}

function esHttp(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

// El primer link web del producto elegido; si no tiene, el del requisito o el
// que trae la fila. Los planos (kind "documento") van como adjuntos, no acá.
export function linkDeCompra(row) {
  const fuentes = [row?.producto?.links, row?.links, row?.material?.links];
  for (const links of fuentes) {
    for (const link of Array.isArray(links) ? links : []) {
      if (link?.kind === "documento") continue;
      const url = limpio(link?.url || link?.link);
      if (esHttp(url)) return { url, nota: limpio(link?.nota || link?.notes) };
    }
  }
  return null;
}

export function fotoDeFila(row) {
  const url = limpio(row?.producto?.imagen_url || row?.imagen_url || row?.material?.imagen_url);
  return esHttp(url) ? url : null;
}

// El código con el que se pide: el del proveedor si está cargado, si no el del
// producto (Baron C42377, Garmin 010-02583-00). Es el mismo que ya usaba el
// texto de la orden; ahora queda en el renglón y no sólo en la descripción.
export function codigoDeCompra(row) {
  return limpio(row?.supplierCode) || limpio(row?.codigo) || null;
}

export function notaParaCompras(row, { extra = [] } = {}) {
  const condicionantes = new Set((row?.condicionantes || []).map((c) => clave(c?.condicionante)).filter(Boolean));
  const repetidos = new Set([
    row?.descripcion, row?.requisitoDescripcion, row?.proveedor, row?.codigo, row?.supplierCode, "Sin proveedor",
  ].map(clave).filter(Boolean));
  const vistos = new Set();
  let siguienteEsCondicionante = false;
  const partes = [row?.obs, ...extra]
    .flatMap((texto) => String(texto ?? "").split(/\s+·\s+|\s+-\s+|\n+/))
    .map(limpio)
    .filter((parte) => {
      if (!parte) return false;
      const k = clave(parte);
      // "Condicionante · Griferia Negra": lo que sigue a la etiqueta es el nombre
      // del condicionante, aunque la fila guardada no traiga la lista.
      const despuesDeEtiqueta = siguienteEsCondicionante;
      siguienteEsCondicionante = k === "condicionante";
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      if (despuesDeEtiqueta) return false;
      if (ETIQUETAS_DE_GRUPO.has(k) || repetidos.has(k) || condicionantes.has(k)) return false;
      // "Griferia Negra: Sustituye …" es cómo el sistema explica por qué está la fila.
      if (k.includes(":") && condicionantes.has(k.split(":")[0])) return false;
      return !FRASES_DEL_SISTEMA.some((frase) => frase.test(parte));
    });
  // "PLACA 30X15. PERFORMANCE METAL USA." y después "PERFORMANCE METAL USA":
  // un pedazo que ya está dentro de otro no suma.
  const claves = partes.map(clave);
  return partes.filter((_, i) => !claves.some((otra, j) => j !== i && otra.length > claves[i].length && otra.includes(claves[i])))
    .join(" · ") || null;
}

// Campos del renglón de Compras que salen de la fila de la lista.
export function renglonParaCompras(row, { proveedorAlternativo = false } = {}) {
  const link = linkDeCompra(row);
  return {
    link_url: link?.url || null,
    image_url: fotoDeFila(row),
    supplier_code: codigoDeCompra(row),
    notes: notaParaCompras(row, {
      extra: [
        proveedorAlternativo ? `Proveedores posibles: ${row.proveedor}. Compras debe elegir uno.` : "",
        link?.nota || "",
      ],
    }),
  };
}
