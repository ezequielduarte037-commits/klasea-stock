/**
 * Emparejar consumibles del pañol con renglones de una lista de proveedor.
 *
 * Lógica pura: la usa la vista "Conciliar con Rebollar" (sugerencias) y el
 * script `scripts/consumibles/lista-rebollar.mjs` (vínculos seguros de la
 * carga inicial). Criterio: un vínculo automático tiene que ser INEQUÍVOCO;
 * ante la duda queda para que lo confirme una persona. Un costo mal vinculado
 * es peor que uno que falta, porque nadie lo revisa.
 *
 * Cómo se puntúa (0 a 1): palabras y números del consumible que aparecen en el
 * renglón, sobre el total de palabras y números del consumible. Los números se
 * comparan como medidas ("1 1/4" = 1,25; "8,50" = 8,5), así "Fijador 14 X 1"
 * no se confunde con "14 X 1 1/4".
 *
 * Es seguro cuando:
 *   - están todos los números del consumible en el renglón,
 *   - la primera palabra del consumible aparece (con sinónimos),
 *   - el puntaje llega a 0,6 (o 0,5 si es el único renglón con esa palabra),
 *   - ningún otro renglón queda a menos de 0,15,
 *   - y ningún otro consumible reclama el mismo renglón con igual puntaje.
 */

// ── Vocabulario ─────────────────────────────────────────────────────────────

// Palabras que no distinguen un producto de otro.
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "para", "con", "y", "en", "al", "a", "o",
  "tipo", "x", "nro", "n", "diam", "cab", "por", "aisi", "aisi304", "inox",
  "lt", "lts", "kg", "kgs", "mm", "cm", "cc", "ml", "gr", "grs", "unid", "uni",
  "blister", "importado", "importada",
]);

// Sinónimos del pañol ↔ cómo lo escribe Rebollar. Cada par es una decisión
// tomada mirando la lista del 08/10/2026; se agrega acá y no en otro lado.
const SINONIMOS = [
  ["caladora", "calar"],
  ["cuero", "vaqueta"],          // guante de cuero = guante de vaqueta
  ["lente", "anteojo"],
  ["kit", "juego"],
  ["pulir", "lustre"],           // paño de pulir = paño lustre
  ["parafuso", "fix"],           // así le dicen en el pañol al tornillo fix
  ["epoxy", "epoxi"],
  ["rodi", "rodillo"],
  ["cuter", "cutter"],
  ["tca", "tuerca"],
  ["mang", "manguera"],
];

// Reescrituras de frases, antes de partir en palabras.
const FRASES = [
  [/\ba\/agua\b/g, "al agua"],
  [/\bp\//g, "para "],
  [/\bc\//g, "con "],
  // "Lija en seco" del pañol = "lija no empastante" de Rebollar (mismos granos:
  // 80 a 400).
  [/\bno\s+past\w*/g, "seco"],
  [/\bdoble\s*a\b/g, "marcadoblea"],   // la marca Doble A, no "doble faz"
  [/\bngro\b/g, "negro"],
  [/\be-poxy\b/g, "epoxy"],
  [/\bserrucho electrico\b/g, "sierra sable"],
  // Los discos de lija orbital del pañol se llaman "lija orbital".
  [/\blija orbital\b/g, "disco orbital"],
  // "Nº 20", "NRO. 10", "N7" → el número solo.
  [/\b(?:n|nro|no)\s*[.°º]?\s*(?=\d)/g, " "],
  // "T 301" (hoja de caladora) → "t301".
  [/\bt\s+(?=\d{3})/g, "t"],
];

// Agregados por contexto: medidas que el pañol dice con palabras.
function agregadosPorContexto(t) {
  const extra = [];
  // Discos orbitales: Rebollar tiene 127 mm y 154 mm; "grande" es el de 154
  // (los granos 240, 360 y 400 del pañol solo existen en 154).
  if (/\borbital\b/.test(t) && /\bgrandes?\b/.test(t)) extra.push("154");
  if (/\borbital\b/.test(t) && /\bchic[oa]s?\b/.test(t)) extra.push("127");
  // Sellador 3M 550: cartucho = 310 ml, salchicha = 600 ml.
  if (/\bsellad/.test(t) && /\bcartucho\b/.test(t)) extra.push("310");
  if (/\bsellad/.test(t) && /\bsalchicha\b/.test(t)) extra.push("600");
  return extra;
}

function sinTildes(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function singular(w) {
  return w.length > 3 && w.endsWith("s") && !/\d/.test(w) ? w.slice(0, -1) : w;
}

// Raíz para comparar: singular y sin la vocal final (blanca = blanco,
// frezada = frezado, fijadora = fijador).
function raiz(w) {
  const s = singular(w);
  return s.length > 4 && /[aeo]$/.test(s) ? s.slice(0, -1) : s;
}

const CANONICO = new Map();
for (const grupo of SINONIMOS) {
  const canon = raiz(grupo[0]);
  for (const w of grupo) CANONICO.set(raiz(w), canon);
}
const canonico = (r) => CANONICO.get(r) ?? r;

const fmtNum = (n) => String(Math.round(n * 10000) / 10000);

/**
 * Texto → { palabras: [{ w, r }], numeros: [string] }.
 * `w` es la palabra en singular, `r` su raíz canónica.
 */
export function prepararTexto(...partes) {
  // El " ; " entre descripción y medida evita que "AISI304" + "1/2" se lea
  // como la fracción mixta 304 1/2.
  let t = sinTildes(partes.filter(Boolean).join(" ; ")).toLowerCase();
  const extra = agregadosPorContexto(t);
  for (const [re, rep] of FRASES) t = t.replace(re, rep);
  t = t
    .replace(/(\d)\s*x\s*(?=\d)/g, "$1 x ")      // "8x1", "48x80MT"
    .replace(/x(?=\d)/g, " x ")                  // "x100unid", "THREEBONDx100ml"
    .replace(/[“”"'´`]/g, " ")
    // Fracción mixta: "1 1/4", "4,1/2", "1.1/8" → 1.25, 4.5, 1.125. El entero
    // no puede venir pegado a letras ("pu550 1/2" no es 550 1/2).
    .replace(/(^|[^a-z0-9.])(\d+)[ ,.]+(\d+)\/(\d+)/g, (_, pre, a, b, c) => `${pre} ${fmtNum(Number(a) + Number(b) / Number(c))} `)
    .replace(/(\d+)\/(\d+)/g, (_, a, b) => ` ${fmtNum(Number(a) / Number(b))} `)
    .replace(/(\d),(\d)/g, "$1.$2");

  const palabras = [];
  const numeros = new Set(extra);
  for (let tok of t.split(/[^a-z0-9.]+/)) {
    tok = tok.replace(/^\.+|\.+$/g, "");
    if (!tok) continue;
    if (tok === "3m") { palabras.push({ w: "tresm", r: "tresm" }); continue; }   // la marca, no 3 metros
    if (/^\d+(\.\d+)?$/.test(tok)) { numeros.add(fmtNum(Number(tok))); continue; }
    const conUnidad = tok.match(/^(\d+(?:\.\d+)?)(mm|cm|cm3|cc|ml|lts?|mts?|m|kgs?|grs?|g|w|v|unid|uni|u)$/);
    if (conUnidad) { numeros.add(fmtNum(Number(conUnidad[1]))); continue; }
    if (VACIAS.has(tok)) continue;
    if (/\d/.test(tok) && /[a-z]/.test(tok)) {
      // Código de modelo ("t101ao", "pu550", "4000uv", "ph1"): vale como
      // palabra y sus dígitos como número.
      palabras.push({ w: tok, r: tok, codigo: true });
      for (const d of tok.match(/\d+(?:\.\d+)?/g) ?? []) numeros.add(fmtNum(Number(d)));
      continue;
    }
    if (tok.length < 2) continue;
    const w = singular(tok);
    if (VACIAS.has(w)) continue;
    palabras.push({ w, r: canonico(raiz(w)) });
  }
  // Sin repetidos, respetando el orden (la primera palabra importa).
  const vistas = new Set();
  return {
    palabras: palabras.filter((p) => !vistas.has(p.r) && vistas.add(p.r)),
    numeros: [...numeros],
  };
}

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function similitud(p, q) {
  if (p.r === q.r) return 1;
  if (p.codigo || q.codigo) {
    // "101ao" del pañol = "T101AO" de Rebollar.
    const a = p.w.replace(/^t(?=\d)/, "");
    const b = q.w.replace(/^t(?=\d)/, "");
    return a === b ? 1 : 0;
  }
  const corta = p.w.length <= q.w.length ? p.w : q.w;
  const larga = corta === p.w ? q.w : p.w;
  if (corta.length >= 5 && larga.startsWith(corta)) return 0.9;   // "diamant" ↔ "diamantado"
  if (corta.length >= 7 && distancia(p.w, q.w) <= 1) return 0.8;  // "tereson" ↔ "teroson"
  return 0;
}

// El envase no dice qué es: en "Lata Diluyente Fana" la palabra principal es
// "diluyente", no "lata".
const ENVASES = new Set(["lata", "balde", "bidon", "caja", "pote", "rollo", "kit", "pack"]);

/**
 * Cuánto distingue cada palabra y número dentro de la lista: "flap" está en
 * dos renglones y "disco" en cincuenta. Solo ordena las sugerencias; la
 * decisión de vincular usa el puntaje parejo de arriba.
 */
export function indiceDeRareza(renglonesPreparados = []) {
  const df = new Map();
  for (const r of renglonesPreparados) {
    const t = r._t ?? r;
    const claves = new Set([...t.palabras.map((p) => `w:${p.r}`), ...t.numeros.map((n) => `n:${n}`)]);
    for (const k of claves) df.set(k, (df.get(k) ?? 0) + 1);
  }
  const total = Math.max(1, renglonesPreparados.length);
  return (clave) => Math.log((total + 1) / ((df.get(clave) ?? 0) + 1)) + 0.1;
}

/**
 * Puntaje de un consumible contra un renglón (los dos ya preparados).
 * Devuelve { puntaje, relevancia, numerosOk, cabezaOk, coinciden, precision }.
 */
export function puntuar(c, r, rareza = null) {
  const total = c.palabras.length + c.numeros.length;
  if (!total) return { puntaje: 0, relevancia: 0, numerosOk: false, cabezaOk: false, coinciden: 0, precision: 0 };
  const idxCabeza = Math.max(0, c.palabras.findIndex((p) => !ENVASES.has(p.w)));
  let suma = 0;
  let sumaPesada = 0;
  let pesoTotal = 0;
  let coinciden = 0;
  let cabezaOk = false;
  const usadas = new Set();
  c.palabras.forEach((p, i) => {
    let mejor = 0;
    let idx = -1;
    r.palabras.forEach((q, j) => {
      const s = similitud(p, q);
      if (s > mejor) { mejor = s; idx = j; }
    });
    if (mejor > 0) { coinciden++; usadas.add(idx); }
    if (i === idxCabeza) cabezaOk = mejor > 0;
    suma += mejor;
    const peso = rareza ? rareza(`w:${p.r}`) : 1;
    sumaPesada += mejor * peso;
    pesoTotal += peso;
  });
  const numsR = new Set(r.numeros);
  let numOk = 0;
  for (const n of c.numeros) {
    const peso = rareza ? rareza(`n:${n}`) : 1;
    pesoTotal += peso;
    if (numsR.has(n)) { numOk++; sumaPesada += peso; }
  }
  coinciden += numOk;
  return {
    puntaje: (suma + numOk) / total,
    relevancia: pesoTotal ? sumaPesada / pesoTotal : 0,
    numerosOk: numOk === c.numeros.length,
    cabezaOk: c.palabras.length ? cabezaOk : numOk > 0,
    coinciden,
    precision: r.palabras.length ? usadas.size / r.palabras.length : 0,
  };
}

const UMBRAL = 0.6;
const UMBRAL_UNICO = 0.5;
const MARGEN = 0.15;

/** El texto del renglón para comparar: descripción + medida. */
export function prepararRenglon(r) {
  return { ...r, _t: prepararTexto(r.descripcion, r.medida) };
}

export function prepararConsumible(m) {
  return { ...m, _t: prepararTexto(m.descripcion) };
}

/**
 * Renglones candidatos para un consumible, los más parecidos primero (con las
 * palabras raras pesando más). `apto` = tiene la palabra principal y todas las
 * medidas: solo esos pueden vincularse solos.
 *
 * Para muchas consultas seguidas conviene pasar los renglones ya preparados
 * (`prepararRenglon`) y la `rareza` (`indiceDeRareza`).
 */
export function candidatos(consumible, renglones, { max = 5, minimo = 0.2, rareza = null } = {}) {
  const c = consumible._t ?? prepararTexto(consumible.descripcion);
  const out = [];
  for (const r of renglones) {
    const t = r._t ?? prepararTexto(r.descripcion, r.medida);
    const p = puntuar(c, t, rareza);
    if (p.puntaje < minimo) continue;
    out.push({ renglon: r, ...p, apto: p.cabezaOk && p.numerosOk });
  }
  // Tener la palabra principal suma un poco: "Film Chico" sugiere films antes
  // que el único renglón que dice "chico".
  const orden = (x) => x.relevancia + (x.cabezaOk ? 0.15 : 0);
  out.sort((a, b) => (orden(b) - orden(a)) || (b.apto - a.apto) || (b.puntaje - a.puntaje) || (b.precision - a.precision));
  return max ? out.slice(0, max) : out;
}

const ADJ_CHICO = /\b(chic[oa]s?|peque[nñ][oa]s?)\b/;
const ADJ_GRANDE = /\bgrandes?\b/;

/**
 * Dos renglones empatados que solo difieren en un número ("Mango p/Rodillo
 * NRO. 10" y "NRO. 17"): si el consumible dice chico o grande, se elige el
 * menor o el mayor. Con tres o más, o si difieren en palabras, no se elige.
 */
export function porTamano(consumible, empatados) {
  if (empatados.length !== 2) return null;
  const desc = sinTildes(consumible.descripcion).toLowerCase();
  const chico = ADJ_CHICO.test(desc);
  const grande = ADJ_GRANDE.test(desc);
  if (chico === grande) return null;
  const [a, b] = empatados.map((e) => e.renglon._t ?? prepararTexto(e.renglon.descripcion, e.renglon.medida));
  const pa = a.palabras.map((p) => p.r).join(" ");
  const pb = b.palabras.map((p) => p.r).join(" ");
  if (pa !== pb) return null;
  const soloA = a.numeros.filter((n) => !b.numeros.includes(n));
  const soloB = b.numeros.filter((n) => !a.numeros.includes(n));
  if (soloA.length !== 1 || soloB.length !== 1) return null;
  const menor = Number(soloA[0]) < Number(soloB[0]) ? empatados[0] : empatados[1];
  const mayor = menor === empatados[0] ? empatados[1] : empatados[0];
  return chico ? menor : mayor;
}

/**
 * Empareja todos los consumibles contra todos los renglones.
 *
 * Devuelve { seguros: [{ material, renglon, puntaje, motivo }],
 *            dudosos: [{ material, candidatos, motivo }],
 *            sinPar:  [{ material, candidatos, motivo }] }.
 */
export function emparejarTodo(consumibles = [], renglones = []) {
  const rs = renglones.map((r) => (r._t ? r : prepararRenglon(r)));
  const rareza = indiceDeRareza(rs);
  const propuestas = [];
  const dudosos = [];
  const sinPar = [];

  for (const m0 of consumibles) {
    const m = m0._t ? m0 : prepararConsumible(m0);
    const cands = candidatos(m, rs, { max: 0, minimo: 0.2, rareza });
    const aptos = cands.filter((c) => c.apto).sort((a, b) => (b.puntaje - a.puntaje) || (b.precision - a.precision));
    const top = cands.slice(0, 5);
    const conCabeza = cands.filter((c) => c.cabezaOk);

    // Dudoso = hay algo para mirar (la palabra principal con algo más, o un
    // renglón muy parecido aunque falte esa palabra). Si no, sin par.
    const anotarDuda = (motivo) => {
      const tieneAlgo = conCabeza.some((c) => c.puntaje >= 0.3) || cands.some((c) => c.puntaje >= 0.6);
      (tieneAlgo ? dudosos : sinPar).push({ material: m0, candidatos: top, motivo: tieneAlgo ? motivo : "nada parecido en la lista" });
    };

    if (/\s(y|e)\s/i.test(m.descripcion)) { anotarDuda("son dos productos en uno"); continue; }
    if (!aptos.length) {
      anotarDuda(conCabeza.length ? "la medida no coincide con ningún renglón" : "ningún renglón tiene la palabra principal");
      continue;
    }
    const mejor = aptos[0];
    const unico = conCabeza.length === 1;
    if (mejor.puntaje < (unico ? UMBRAL_UNICO : UMBRAL)) { anotarDuda("parecido pero no igual"); continue; }

    const empatados = aptos.filter((c) => c.puntaje >= mejor.puntaje - MARGEN);
    if (empatados.length > 1) {
      const elegido = porTamano(m, empatados);
      if (!elegido) { anotarDuda(`${empatados.length} renglones igual de parecidos`); continue; }
      propuestas.push({ material: m0, renglon: elegido.renglon, puntaje: elegido.puntaje, coinciden: elegido.coinciden, motivo: "chico/grande entre dos medidas", candidatos: top });
      continue;
    }
    propuestas.push({ material: m0, renglon: mejor.renglon, puntaje: mejor.puntaje, coinciden: mejor.coinciden, motivo: "único renglón con esas palabras y medidas", candidatos: top });
  }

  // Un renglón, un consumible: si dos lo reclaman gana el más parecido (y a
  // igual puntaje, el que coincide en más cosas). Si empatan, ninguno: son
  // probablemente el mismo producto cargado dos veces.
  const porRenglon = new Map();
  for (const p of propuestas) {
    const k = p.renglon.codigo;
    if (!porRenglon.has(k)) porRenglon.set(k, []);
    porRenglon.get(k).push(p);
  }
  const seguros = [];
  for (const lista of porRenglon.values()) {
    if (lista.length === 1) { seguros.push(lista[0]); continue; }
    lista.sort((a, b) => (b.puntaje - a.puntaje) || (b.coinciden - a.coinciden));
    const [a, b] = lista;
    const gana = a.puntaje > b.puntaje + 1e-9 || a.coinciden > b.coinciden ? a : null;
    for (const p of lista) {
      if (p === gana) { seguros.push(p); continue; }
      const otro = gana ?? lista.find((x) => x !== p);
      dudosos.push({
        material: p.material,
        candidatos: p.candidatos,
        motivo: gana
          ? `el renglón ${p.renglon.codigo} ya es de "${otro.material.descripcion}" (¿repetido?)`
          : `empata con "${otro.material.descripcion}" por el renglón ${p.renglon.codigo} (¿repetido?)`,
      });
    }
  }
  return { seguros, dudosos, sinPar };
}
