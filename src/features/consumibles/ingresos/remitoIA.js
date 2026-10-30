/**
 * Empareja los renglones que la IA leyó de un remito con el catálogo de
 * consumibles. Funciones puras, probadas en remitoIA.test.mjs.
 *
 * Con Rebollar es casi siempre por código: el remito trae el mismo código que
 * la lista (M0047, PARFIJ0016) y el catálogo usa ese código. Si la IA no lo
 * leyó, se prueba por nombre (descripción y alias), pero solo se da por bueno
 * si coinciden todas las medidas y no hay otro producto igual de parecido:
 * un tornillo de 1/2" no es uno de 3/4". Lo dudoso queda para elegir a mano.
 */

import { actualizarLinea, lineaDesdeItem } from "./ingresoCalculos.js";

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

export function normalizarCodigoRemito(v) {
  return sinAcentos(v).toUpperCase().replace(/[\s.]/g, "");
}

const PALABRAS_VACIAS = new Set(["x", "de", "del", "la", "el", "y", "con", "p", "para", "por", "un", "una", "nro", "n", "mm", "cm", "mts", "mt", "u", "un.", "unid", "unidad", "unidades"]);

function tokens(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[#°º"']/g, " ")
    .replace(/[^a-z0-9./]+/g, " ")
    .split(" ")
    .filter((t) => t && !PALABRAS_VACIAS.has(t));
}

const esMedida = (t) => /\d/.test(t);

/** Parecido entre lo que leyó la IA y un producto: 0 a 1. Las medidas tienen que estar todas. */
export function parecido(textoRemito, item) {
  const delRemito = tokens(textoRemito);
  if (!delRemito.length) return 0;
  const delItem = new Set(tokens(`${item.descripcion ?? ""} ${item.alias ?? ""}`));
  const medidas = delRemito.filter(esMedida);
  if (medidas.some((m) => !delItem.has(m))) return 0;
  const comunes = delRemito.filter((t) => delItem.has(t)).length;
  return comunes / delRemito.length;
}

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/\./g, (m, i, s) => (s.indexOf(",") > -1 ? "" : m)).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * renglones: los `items` de la IA ({ descripcion, codigo, cantidad, unidad }).
 * catalogo: el de fetchCatalogo (con `codigos`, `descripcion`, `alias`).
 * Devuelve uno por renglón: { renglon, item | null, por: "codigo" | "nombre" | null, candidatos }.
 */
export function emparejarRenglones(renglones = [], catalogo = [], { moneda = null } = {}) {
  const porCodigo = new Map();
  for (const item of catalogo) {
    for (const c of item.codigos ?? []) {
      const k = normalizarCodigoRemito(c);
      if (k && !porCodigo.has(k)) porCodigo.set(k, item);
    }
  }

  return renglones
    .filter((r) => r && (String(r.descripcion ?? "").trim() || String(r.codigo ?? "").trim()))
    .map((r) => {
      const renglon = {
        descripcion: String(r.descripcion ?? "").trim(),
        codigo: String(r.codigo ?? "").trim() || null,
        cantidad: num(r.cantidad),
        unidad: r.unidad ?? null,
        precio_unitario: num(r.precio_unitario),
        moneda: String(r.moneda || moneda || "").trim().toUpperCase() || null,
      };

      const codigo = normalizarCodigoRemito(renglon.codigo);
      if (codigo && porCodigo.has(codigo)) {
        return { renglon, item: porCodigo.get(codigo), por: "codigo", candidatos: [] };
      }

      const puntajes = catalogo
        .map((item) => ({ item, puntaje: parecido(renglon.descripcion, item) }))
        .filter((x) => x.puntaje > 0)
        .sort((a, b) => b.puntaje - a.puntaje)
        .slice(0, 3);
      const [primero, segundo] = puntajes;
      const claro = primero && primero.puntaje >= 0.75 && (!segundo || primero.puntaje - segundo.puntaje >= 0.15);
      return {
        renglon,
        item: claro ? primero.item : null,
        por: claro ? "nombre" : null,
        candidatos: puntajes.map((x) => x.item),
      };
    });
}

/** Prepara la lectura completa antes de tocar el borrador o archivar el original. */
export function incorporarLecturaRemito(borrador, leido, catalogo, escaneo = null) {
  if (!leido || !Array.isArray(leido.items)) throw new Error("El servicio devolvió una lectura incompleta. Volvé a intentar con el mismo archivo.");
  if (leido.es_comprobante === false || (leido.tipo_documento && leido.tipo_documento !== "remito")) {
    throw new Error("El archivo no se reconoció como un remito. Revisá que sea el documento de entrega del proveedor.");
  }
  if (escaneo && borrador.escaneos?.includes(escaneo.id)) throw new Error("Ese escaneo ya está cargado en este borrador.");
  const filas = emparejarRenglones(leido.items, catalogo, { moneda: leido.moneda });
  if (!filas.length) throw new Error("No se encontraron productos en ese archivo. Probá con una foto más derecha y con luz, o cargalo a mano.");
  const ok = filas.filter((x) => x.item);
  return {
    cantidad: filas.length,
    cargados: ok.length,
    borrador: {
      ...borrador,
      remito: borrador.remito || String(leido.numero || "").trim(),
      proveedor: borrador.proveedor || String(leido.proveedor || "").trim(),
      lineas: [...borrador.lineas, ...ok.map((x) => lineaDesdeRenglonRemito(x.item, x.renglon))],
      sinEmparejar: [...(borrador.sinEmparejar || []), ...filas.filter((x) => !x.item)],
      escaneos: [...(borrador.escaneos || []), ...(escaneo ? [escaneo.id] : [])],
    },
  };
}

function unidadNormalizada(valor) {
  const u = sinAcentos(valor).toLowerCase().replace(/[^a-z0-9]/g, "");
  const alias = { u: "unidad", un: "unidad", unid: "unidad", unidades: "unidad", rollos: "rollo", cajas: "caja", paquetes: "paquete", blisters: "blister", m: "metro", mt: "metro", mts: "metro", metros: "metro", l: "litro", lt: "litro", lts: "litro", litros: "litro", pares: "par", hojas: "hoja", bidones: "bidon" };
  return alias[u] || u;
}

/** La cantidad impresa nunca se interpreta como cajas sólo por la config del producto. */
export function lineaDesdeRenglonRemito(item, renglon) {
  const base = lineaDesdeItem(item);
  const factor = num(base.factorConfig) > 0 ? num(base.factorConfig) : 1;
  const unidad = unidadNormalizada(renglon.unidad);
  const entrega = unidadNormalizada(base.unidad);
  const compra = unidadNormalizada(base.unidadCompraConfig);
  const precio = num(renglon.precio_unitario);
  const referencia = num(base.costoEntregaReferencia);
  const moneda = String(renglon.moneda || "").toUpperCase();
  const comparable = !moneda || moneda === "ARS";
  const cerca = (esperado) => esperado > 0 && precio > 0 && Math.abs(precio / esperado - 1) <= 0.02;
  const sueltoPorPrecio = comparable && referencia != null && cerca(referencia);
  const compraPorPrecio = comparable && referencia != null && cerca(referencia * factor);
  let porCaja = false;
  let pendiente = false;
  if (factor !== 1) {
    const porUnidad = unidad && unidad === entrega && unidad !== compra ? false
      : unidad && unidad === compra && unidad !== entrega ? true : null;
    const porPrecio = sueltoPorPrecio !== compraPorPrecio ? compraPorPrecio : null;
    // Si falta la presentación o contradice al precio, la elige quien recibe.
    pendiente = (porUnidad == null && porPrecio == null)
      || (porUnidad != null && porPrecio != null && porUnidad !== porPrecio);
    porCaja = porUnidad ?? porPrecio ?? false;
  }
  const linea = actualizarLinea(base, { porCaja });
  return {
    ...linea,
    cantidad: num(renglon.cantidad) > 0 ? String(num(renglon.cantidad)) : "",
    recordar: false,
    presentacionPendiente: pendiente,
    lecturaRemito: { cantidad: renglon.cantidad, unidad: renglon.unidad },
  };
}
