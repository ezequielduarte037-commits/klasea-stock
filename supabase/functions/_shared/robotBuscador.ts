/**
 * Buscador de materiales para el robot del pañol.
 *
 * Lo que llega es lo que Whisper entendió de una frase hablada: "masilla
 * epoxi", "racor de una pulgada", "lija en seco ciento veinte". El catálogo lo
 * escribe otra gente: "MASILLA E-POXY", "Racor 1\"", "Lija En Seco 120". Un
 * `ilike` no los junta, así que el catálogo se trae entero (son ~2000 filas) y
 * se compara acá, palabra por palabra:
 *   - sin acentos, sin guiones y con la y como i ("epoxi" = "E-POXY");
 *   - las medidas enteras: "1" no coincide con "1/2" ni con "120";
 *   - "media pulgada", "tres cuartos", "ciento veinte" se pasan a número;
 *   - plural y singular valen igual ("masillas" = "masilla").
 * Gana el que cubre todas las palabras dichas con menos palabras de sobra.
 *
 * Es código puro (sin Deno ni base) para poder probarlo con node:
 *   node --test supabase/functions/_shared/robotBuscador.test.mjs
 */

export type MaterialCatalogo = {
  id: string;
  descripcion: string;
  alias?: string | string[] | null;
  codigo?: string | null;
  codigo_barra?: string | null;
  unidad_medida?: string | null;
  ubicacion?: string | null;
  ubicacion_obs?: string | null;
  es_consumible?: boolean | null;
};

type Indexado = { m: MaterialCatalogo; tokens: string[]; plano: string; codigos: string[] };

const RELLENO = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "a", "al", "en", "que", "con", "para", "por",
  "cuanto", "cuanta", "cuantos", "cuantas", "queda", "quedan", "hay", "tengo", "tenemos", "stock", "donde", "esta", "estan",
  "ubicado", "ubicada", "estanteria", "ubicacion", "me", "decime", "dime", "sabes", "favor", "porfa", "che", "robot",
  "material", "producto", "codigo", "busca", "buscame", "necesito", "quiero", "tipo", "marca",
]);

const NUMEROS_DICHOS: Record<string, string> = {
  cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  diez: "10", once: "11", doce: "12", trece: "13", catorce: "14", quince: "15", dieciseis: "16", veinte: "20", veinticuatro: "24",
  treinta: "30", cuarenta: "40", cincuenta: "50", sesenta: "60", ochenta: "80", cien: "100", ciento: "100",
};

export function sinAcentos(texto: string): string {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Pasa las medidas habladas a como se escriben en el catálogo. */
export function medidasHabladas(texto: string): string {
  return sinAcentos(texto).toLowerCase()
    .replace(/\bciento (veinte|cincuenta|ochenta)\b/g, (_, n) => String(100 + Number(NUMEROS_DICHOS[n])))
    .replace(/\bdoscientos cuarenta\b/g, "240").replace(/\bdoscientos veinte\b/g, "220")
    .replace(/\bmil\b/g, "1000")
    .replace(/\bmedia pulgada\b/g, "1/2").replace(/\btres cuartos?\b/g, "3/4").replace(/\bun cuarto\b/g, "1/4")
    .replace(/\btres octavos\b/g, "3/8").replace(/\bcinco octavos\b/g, "5/8")
    .replace(/\b(una|uno|dos|\d+) y media\b/g, (_, n) => `${NUMEROS_DICHOS[n] ?? n} 1/2`)
    .replace(/\b(una|uno|dos|tres) pulgadas?\b/g, (_, n) => NUMEROS_DICHOS[n])
    .replace(/\bpulgadas?\b/g, " ").replace(/\bmilimetros?\b/g, "mm").replace(/\bmetros?\b/g, "m");
}

/** Palabras comparables: minúsculas, sin acentos, y→i, medidas enteras. */
export function palabras(texto: string): string[] {
  return sinAcentos(texto).toLowerCase()
    .replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4")
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/[^a-z0-9/]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.replace(/y/g, "i"))
    // El catálogo histórico escribe CANILLA VALDEOS. No es otro material.
    .map((w) => /^valdeos?$/.test(w) ? "baldeo" : w);
}

const raiz = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, "") : w.replace(/s$/, ""));
const esMedida = (w: string) => w.length <= 2 || /\d/.test(w);
const plano = (texto: string) => sinAcentos(texto).toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/y/g, "i");

export function indexar(catalogo: MaterialCatalogo[]): Indexado[] {
  return catalogo.map((m) => {
    const alias = Array.isArray(m.alias) ? m.alias.join(" ") : String(m.alias || "");
    return {
      m,
      tokens: palabras(`${m.descripcion} ${alias}`),
      plano: plano(`${m.descripcion} ${alias}`),
      codigos: [m.codigo, m.codigo_barra].filter(Boolean).map((c) => plano(String(c))),
    };
  });
}

export type Candidato = { material: MaterialCatalogo; puntaje: number };

/**
 * Los materiales que mejor coinciden. Si hay varios empatados devuelve todos
 * (hasta `maximo`) para que el robot pregunte cuál; si uno gana claro, uno solo.
 */
export function buscar(indice: Indexado[], consulta: string, maximo = 5): Candidato[] {
  const texto = medidasHabladas(consulta);
  // "código C89099" o un código dicho suelto: se busca exacto primero.
  const cod = /\b(?:codigo|cod)\s+([a-z0-9 .\/-]{2,24})/.exec(texto);
  if (cod) {
    const buscado = plano(cod[1]);
    const exacto = indice.filter((x) => x.codigos.some((c) => c && (c === buscado || buscado.startsWith(c) && c.length >= 4)));
    if (exacto.length) return exacto.slice(0, maximo).map((x) => ({ material: x.m, puntaje: 1 }));
  }

  const dichos = palabras(texto).filter((w) => !RELLENO.has(w)).map((w) => NUMEROS_DICHOS[w] ?? w);
  if (!dichos.length) return [];

  const coincide = (x: Indexado, w: string) => esMedida(w)
    ? x.tokens.includes(w) || x.codigos.includes(w)
    : x.tokens.some((t) => t === w || raiz(t) === raiz(w) || (raiz(w).length >= 4 && t.startsWith(raiz(w)))) || x.plano.includes(raiz(w));

  const puntuados: Candidato[] = [];
  for (const x of indice) {
    const aciertos = dichos.filter((w) => coincide(x, w)).length;
    if (aciertos / dichos.length < 0.6) continue;
    // Palabras del nombre que nadie dijo: restan poco, pero desempatan
    // "racor 1" entre Racor 1" y Racor 3/4" a 1".
    const sobran = x.tokens.filter((t) => !dichos.some((w) => t === w || (!esMedida(w) && raiz(t) === raiz(w)))).length;
    puntuados.push({ material: x.m, puntaje: aciertos / dichos.length - sobran * 0.03 });
  }
  puntuados.sort((a, b) => b.puntaje - a.puntaje || Number(!!b.material.ubicacion) - Number(!!a.material.ubicacion));
  if (!puntuados.length) return [];
  const mejor = puntuados[0].puntaje;
  return puntuados.filter((c) => mejor - c.puntaje < 0.05).slice(0, maximo);
}

/** Todos los productos de una consulta, sin privilegiar el nombre más corto.
 * Una pregunta por griferías no puede esconder las variantes de ducha porque
 * una bacha tenga menos palabras. Exige todas las medidas y palabras útiles.
 * Los sinónimos amplían familias; nunca cambian códigos ni medidas.
 */
export function buscarFamilia(indice: Indexado[], consulta: string): Candidato[] {
  const texto = medidasHabladas(consulta);
  const dichos = palabras(texto).filter((w) => !RELLENO.has(w)).map((w) => NUMEROS_DICHOS[w] ?? w);
  if (!dichos.length) return [];
  const cod = plano(texto.replace(/\b(codigo|cod)\b/g, ""));
  const exactos = indice.filter((x) => x.codigos.includes(cod));
  if (exactos.length) return exactos.map((x) => ({ material: x.m, puntaje: 1 }));
  const sinonimos: Record<string, string[]> = { griferia: ["griferia", "canilla", "grifo"], canilla: ["canilla", "grifo"], grifo: ["canilla", "grifo"] };
  return indice.filter((x) => dichos.every((w) => {
    if (esMedida(w)) return x.tokens.includes(w);
    const alternativas = sinonimos[raiz(w)] || [raiz(w)];
    return alternativas.some((a) => x.tokens.some((t) => raiz(t) === a || a.length >= 4 && t.startsWith(a)) || x.plano.includes(a));
  })).map((x) => ({ material: x.m, puntaje: 1 }));
}

/** "C1-2" → "estantería C1, estante 2", para que la voz lo diga bien. */
export function ubicacionHablada(ubicacion: string | null | undefined, obs?: string | null): string {
  const base = String(ubicacion || "").trim();
  const extra = String(obs || "").trim();
  if (!base && !extra) return "";
  const m = /^([A-Z]+)(\d*)-(\d+)$/i.exec(base);
  const hablado = m ? `estantería ${m[1].toUpperCase()}${m[2]}, estante ${m[3]}`
    : /^[A-Z]{1,2}\d*$/i.test(base) ? `estantería ${base.toUpperCase()}`
    : base.toLowerCase();
  return [hablado, extra.toLowerCase()].filter(Boolean).join(", ");
}
