const STOPWORDS = new Set([
  "a", "al", "con", "como", "de", "del", "el", "en", "la", "las", "los",
  "para", "por", "que", "sin", "un", "una", "y", "o",
]);

export function normalizeMaterialSearch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactMaterialSearch(value = "") {
  return normalizeMaterialSearch(value).replace(/[^a-z0-9]/g, "");
}

function singularToken(token = "") {
  const value = String(token || "");
  if (value.length > 5 && value.endsWith("ces")) return `${value.slice(0, -3)}z`;
  if (value.length > 5 && value.endsWith("es")) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function meaningfulTokens(value = "") {
  return normalizeMaterialSearch(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function levenshtein(a = "", b = "") {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current.push(Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (a[i] === b[j] ? 0 : 1),
      ));
    }
    previous = current;
  }
  return previous[b.length];
}

function tokenSimilarity(queryToken, candidateToken) {
  const query = singularToken(queryToken);
  const candidate = singularToken(candidateToken);
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  if (candidate.startsWith(query) || query.startsWith(candidate)) {
    return Math.min(query.length, candidate.length) >= 4 ? 0.86 : 0;
  }
  const distance = levenshtein(query, candidate);
  if (distance === 1 && Math.min(query.length, candidate.length) >= 4) return 0.78;
  if (distance === 2 && Math.min(query.length, candidate.length) >= 7) return 0.68;
  return 0;
}

export function materialSearchText(material = {}) {
  return [
    material.descripcion,
    material.nombre,
    material.alias,
    material.notas,
    material.observaciones,
    material.proveedor,
    material.rubro,
    material.categoria,
    material.categoria_nombre,
    material.codigo,
    material.codigo_barra,
    ...(Array.isArray(material.codigos_barra) ? material.codigos_barra.map((row) => row?.codigo || row) : []),
    ...(Array.isArray(material.variantes) ? material.variantes : []),
  ].filter(Boolean).join(" ");
}

function queryFields(query = {}) {
  if (typeof query === "string") return { text: query, code: "" };
  return {
    text: [
      query?.descripcion,
      query?.description,
      query?.nombre,
      query?.alias,
      query?.notas,
      query?.observaciones,
      query?.notes,
    ].filter(Boolean).join(" "),
    code: query?.codigo || query?.code || query?.codigo_barra || "",
  };
}

export function materialMatchScore(material = {}, query = {}) {
  const fields = queryFields(query);
  const queryText = normalizeMaterialSearch(fields.text);
  const queryCode = normalizeMaterialSearch(fields.code);
  const description = normalizeMaterialSearch(material.descripcion || material.nombre);
  const catalogText = normalizeMaterialSearch(materialSearchText(material));
  const catalogCode = normalizeMaterialSearch(material.codigo);
  const catalogBarcodes = normalizeMaterialSearch([
    material.codigo_barra,
    ...(Array.isArray(material.codigos_barra) ? material.codigos_barra.map((row) => row?.codigo || row) : []),
  ].filter(Boolean).join(" "));

  if (!queryText && !queryCode) return 0;
  if (queryCode && catalogCode && queryCode === catalogCode) return 120;
  if (queryCode && catalogBarcodes && catalogBarcodes.split(" ").includes(queryCode)) return 118;
  if (queryCode && catalogCode && (catalogCode.includes(queryCode) || queryCode.includes(catalogCode))) return 102;

  if (!queryText) return 0;
  if (description === queryText) return 112;

  // Une palabras partidas: "para brisas" y "parabrisas" comparten esta clave.
  const compactQuery = compactMaterialSearch(queryText);
  const compactCatalog = compactMaterialSearch(catalogText);
  if (compactQuery.length >= 5 && (compactCatalog.includes(compactQuery) || compactQuery.includes(compactCatalog))) {
    return 104;
  }

  const queryTokens = meaningfulTokens(queryText);
  const catalogTokens = meaningfulTokens(catalogText);
  if (!queryTokens.length || !catalogTokens.length) return 0;

  const scores = queryTokens.map((queryToken) => Math.max(
    ...catalogTokens.map((catalogToken) => tokenSimilarity(queryToken, catalogToken)),
    0,
  ));
  const matched = scores.filter((score) => score >= 0.68);
  const coverage = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const matchRatio = matched.length / queryTokens.length;

  if (matched.length === queryTokens.length) return Math.round(88 + coverage * 12);
  if (matched.length >= 2) return Math.round(54 + matchRatio * 28 + coverage * 8);
  if (matched.length === 1 && queryTokens.length === 1) return Math.round(62 + coverage * 28);
  return 0;
}

export function topMaterialMatches(catalog = [], query = {}, limit = 8, minScore = 42) {
  return [...catalog]
    .map((material) => ({ material, score: materialMatchScore(material, query) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || String(a.material.descripcion || "").localeCompare(String(b.material.descripcion || ""), "es", { numeric: true }))
    .slice(0, limit)
    .map((row) => ({ ...row.material, _score: row.score }));
}

export function materialMatchIsStrong(score = 0) {
  return Number(score) >= 88;
}
