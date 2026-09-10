/**
 * Las cuentas de texto del buscador global.
 *
 * Vivían adentro de globalSearchApi y sólo servían para armar el `ilike` que se
 * le manda a PostgREST. Ahora las comparte con el índice de secciones, que se
 * resuelve en el navegador sin pedirle nada a la base: la misma consulta tiene
 * que puntuar igual venga de donde venga, si no una pantalla y un producto con
 * el mismo nombre salen en orden distinto según quién los haya buscado.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "un", "una",
  "en", "al", "que", "es", "se", "su", "sus", "lo", "o", "u",
]);

/** Sin tildes, sin mayúsculas y sin signos: "Marmolería" y "marmoleria" son lo mismo. */
export function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `%`, `_` y `,` son sintaxis dentro de un `ilike` de PostgREST, no texto. */
export function cleanIlike(value = "") {
  return String(value)
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Las formas en que puede estar escrito lo mismo.
 *
 * El singular y el plural son el caso de todos los días -se busca "remitos" y
 * la pantalla se llama "Remito"-, y la raíz de 4 letras cubre lo que se escribe
 * a medias: "solicit" encuentra "solicitud" y "solicitar". Sin esto había que
 * acertarle a la palabra entera.
 */
export function tokenVariants(token) {
  const variants = new Set([token]);
  if (token.length > 4 && token.endsWith("es")) variants.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));
  if (token.length > 5) variants.add(token.slice(0, 5));
  return [...variants].filter((value) => value.length >= 2 || /^\d+$/.test(value));
}

/**
 * Las palabras de la consulta, de la más larga a la más corta.
 *
 * Se descartan las de una letra y las que no distinguen nada ("de", "para"),
 * salvo que sean números: un "5" puede ser el número de solicitud.
 */
export function tokenize(query) {
  const normalized = normalize(query);
  const tokens = normalized
    .split(" ")
    .filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !STOPWORDS.has(token));
  return [...new Set(tokens.length ? tokens : normalized ? [normalized] : [])]
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);
}

/** La consulta entera normalizada, para premiar la frase exacta. */
export function normalizedQuery(query) {
  return normalize(query);
}

/**
 * El `or=(...)` que entiende PostgREST.
 *
 * Es un OR de todo contra todo a propósito: filtrar por AND en la base deja
 * afuera al que escribió una palabra de más, y el orden lo pone después
 * `scoreFields`, que sí sabe cuántos términos entraron.
 */
export function searchClauses(fields, tokens) {
  const values = [...new Set(tokens.flatMap(tokenVariants))]
    .map(cleanIlike)
    .filter(Boolean);
  return fields.flatMap((field) => values.map((value) => `${field}.ilike.%${value}%`)).join(",");
}

function fieldText(row, field) {
  const value = row?.[field];
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  return String(value);
}

/**
 * Cuánto se parece una fila a lo que se buscó.
 *
 * `fields` es `{ campo: peso }`: el nombre pesa más que las notas, así que un
 * producto que se llama "Masilla" gana contra otro que la nombra al pasar. La
 * frase completa y el arranque del texto suman aparte, que es lo que hace que
 * escribir "remito" ponga primero a Remitos y no a cualquier cosa que la
 * mencione.
 *
 * Devuelve 0 si no entró ningún término: quien llama descarta esas filas.
 */
export function scoreFields(row, fields, tokens, rawQuery = "") {
  const entries = Object.entries(fields);
  const phrase = normalize(rawQuery);
  let score = 0;
  let matched = 0;

  for (const token of tokens) {
    const variants = tokenVariants(token);
    let best = 0;
    for (const [field, weight] of entries) {
      const haystack = normalize(fieldText(row, field));
      if (!haystack) continue;
      const padded = ` ${haystack} `;
      for (const variant of variants) {
        const exacto = variant === token ? 1 : 0.72;      // la raíz vale menos que la palabra
        if (padded.includes(` ${variant} `)) best = Math.max(best, weight * 16 * exacto);
        else if (padded.includes(` ${variant}`)) best = Math.max(best, weight * 12 * exacto);
        else if (haystack.includes(variant)) best = Math.max(best, weight * 7 * exacto);
      }
    }
    if (best > 0) matched += 1;
    score += best;
  }

  if (!matched) return 0;

  // Haber entrado con TODAS las palabras es la señal más fuerte que hay: es la
  // diferencia entre "masilla epoxi" y cualquier masilla.
  if (matched === tokens.length && tokens.length > 1) score += 26 * tokens.length;

  if (phrase.length >= 3) {
    for (const [field, weight] of entries) {
      const haystack = normalize(fieldText(row, field));
      if (!haystack) continue;
      if (haystack === phrase) score += weight * 60;
      else if (haystack.startsWith(phrase)) score += weight * 30;
      else if (haystack.includes(phrase)) score += weight * 14;
    }
  }

  return score;
}

/**
 * Ordena por puntaje y corta.
 *
 * Las filas con puntaje 0 se van: entraron por el OR de la base porque otra
 * palabra coincidía en otra columna, no porque tengan que ver.
 */
export function rankRows(rows, fields, tokens, rawQuery = "", limit = 6) {
  const primary = Object.keys(fields)[0];
  return [...(rows ?? [])]
    .map((row) => ({ row, score: scoreFields(row, fields, tokens, rawQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score
      || String(a.row?.[primary] || "").localeCompare(String(b.row?.[primary] || ""), "es", { numeric: true }))
    .slice(0, limit)
    .map(({ row, score }) => ({ row, score }));
}
