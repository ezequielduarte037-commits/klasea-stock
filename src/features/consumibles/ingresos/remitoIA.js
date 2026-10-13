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
export function emparejarRenglones(renglones = [], catalogo = []) {
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
