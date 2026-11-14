import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  CODIGO_PRUEBA,
  FORMATOS,
  HOJA_MOSTRADOR,
  MODULO_MINIMO_MM,
  ZONA_BLANCA_MODULOS,
  codigoDeBarras,
  codigoQR,
  contenidoEtiqueta,
  elegirHojaMostrador,
  estanteriaDe,
  etiquetaDePrueba,
  filtrarItems,
  ordenarParaImprimir,
  paginar,
  proximaPosicion,
  productoParaPrueba,
  svgDe,
  tamanoCodigo,
  tamanoNombre,
} from "./etiquetasCore.js";

/*
 * Estas pruebas no confían en que la librería "anduvo": leen el SVG que se
 * imprime, reconstruyen los módulos y los decodifican con un lector propio
 * (Code128 y QR versión 1–2). Si una etiqueta sale con un código que el lector
 * del pañol no podría leer, falla acá antes de gastar una hoja autoadhesiva.
 */

// ── Lector Code128 ──────────────────────────────────────────────────────────

// Tabla estándar de anchos (barra, espacio, barra, espacio, barra, espacio).
const ANCHOS_128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const PARADA_128 = "1100011101011"; // 2331112

const aModulos = (anchos) => [...anchos].map((w, i) => (i % 2 === 0 ? "1" : "0").repeat(Number(w))).join("");
const TABLA_128 = new Map(ANCHOS_128.map((a, valor) => [aModulos(a), valor]));

function modulosDesdeSvgBarras(svg) {
  const vb = /viewBox="0 0 (\d+) 1"/.exec(svg);
  assert.ok(vb, "el SVG de barras tiene viewBox en módulos");
  const total = Number(vb[1]);
  const modulos = Array(total).fill("0");
  const path = /<path d="([^"]*)"/.exec(svg)[1];
  const re = /M(\d+) 0h(\d+)v1h-(\d+)z/g;
  let m;
  let cubierto = 0;
  while ((m = re.exec(path))) {
    const [x, w, w2] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.equal(w, w2, "cada barra es un rectángulo cerrado");
    for (let i = x; i < x + w; i += 1) modulos[i] = "1";
    cubierto += m[0].length;
  }
  assert.equal(cubierto, path.length, "el path solo tiene barras");
  return modulos.join("");
}

function leerCode128(modulos) {
  const inicio = modulos.indexOf("1");
  const fin = modulos.lastIndexOf("1") + 1;
  const zonaIzq = inicio;
  const zonaDer = modulos.length - fin;
  const cuerpo = modulos.slice(inicio, fin);
  assert.ok(cuerpo.endsWith(PARADA_128), "termina con el patrón de parada");
  const simbolos = cuerpo.slice(0, -PARADA_128.length);
  assert.equal(simbolos.length % 11, 0, "los símbolos miden 11 módulos");
  const valores = [];
  for (let i = 0; i < simbolos.length; i += 11) {
    const v = TABLA_128.get(simbolos.slice(i, i + 11));
    assert.notEqual(v, undefined, `símbolo ${i / 11} reconocible`);
    valores.push(v);
  }
  const [arranque, ...resto] = valores;
  const control = resto.pop();
  const suma = resto.reduce((s, v, i) => s + v * (i + 1), arranque) % 103;
  assert.equal(control, suma, "dígito de control correcto");

  let set = { 103: "A", 104: "B", 105: "C" }[arranque];
  assert.ok(set, "arranca con Start A, B o C");
  let texto = "";
  for (const v of resto) {
    if (set === "C") {
      if (v < 100) texto += String(v).padStart(2, "0");
      else if (v === 100) set = "B";
      else if (v === 101) set = "A";
      else assert.fail(`valor ${v} inesperado en el set C`);
    } else if (set === "B") {
      if (v < 96) texto += String.fromCharCode(v + 32);
      else if (v === 99) set = "C";
      else if (v === 101) set = "A";
      else assert.fail(`valor ${v} inesperado en el set B`);
    } else {
      if (v < 64) texto += String.fromCharCode(v + 32);
      else if (v < 96) texto += String.fromCharCode(v - 64);
      else if (v === 99) set = "C";
      else if (v === 100) set = "B";
      else assert.fail(`valor ${v} inesperado en el set A`);
    }
  }
  return { texto, zonaIzq, zonaDer };
}

// ── Lector QR (versiones 1 y 2, un solo bloque) ─────────────────────────────

function matrizDesdeSvgQR(svg) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const total = Number(vb[1]);
  assert.equal(total, Number(vb[2]), "el QR es cuadrado");
  const m = Array.from({ length: total }, () => Array(total).fill(0));
  const path = /<path d="([^"]*)"/.exec(svg)[1];
  const re = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let r;
  let cubierto = 0;
  while ((r = re.exec(path))) {
    const [x, y, w] = [Number(r[1]), Number(r[2]), Number(r[3])];
    for (let i = x; i < x + w; i += 1) m[y][i] = 1;
    cubierto += r[0].length;
  }
  assert.equal(cubierto, path.length, "el path solo tiene módulos");
  return m;
}

function recortarMargen(m) {
  const total = m.length;
  let margen = 0;
  while (margen < total / 2 && m[margen].every((v) => v === 0) && m.every((fila) => fila[margen] === 0)) margen += 1;
  const n = total - 2 * margen;
  return { margen, n, q: m.slice(margen, margen + n).map((fila) => fila.slice(margen, margen + n)) };
}

function esBuscador(q, f0, c0) {
  for (let f = 0; f < 7; f += 1) {
    for (let c = 0; c < 7; c += 1) {
      const borde = f === 0 || f === 6 || c === 0 || c === 6;
      const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
      if (q[f0 + f][c0 + c] !== (borde || centro ? 1 : 0)) return false;
    }
  }
  return true;
}

const NIVELES_QR = { 1: "L", 0: "M", 3: "Q", 2: "H" };
const CODEWORDS_DATOS = { 1: { L: 19, M: 16, Q: 13, H: 9 }, 2: { L: 34, M: 28, Q: 22, H: 16 } };
const CODEWORDS_TOTAL = { 1: 26, 2: 44 };

function bch15(datos) {
  let r = datos << 10;
  for (let i = 14; i >= 10; i -= 1) if (r & (1 << i)) r ^= 0x537 << (i - 10);
  return ((datos << 10) | r) ^ 0x5412;
}

// GF(256) con el polinomio de QR (0x11D), para verificar la corrección de errores.
const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const MASCARAS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

const ALFANUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function leerQR(q) {
  const n = q.length;
  const version = (n - 17) / 4;
  assert.ok(version === 1 || version === 2, `versión ${version} soportada por el lector de prueba`);
  assert.ok(esBuscador(q, 0, 0) && esBuscador(q, 0, n - 7) && esBuscador(q, n - 7, 0), "los tres buscadores están");
  for (let i = 8; i < n - 8; i += 1) {
    assert.equal(q[6][i], i % 2 === 0 ? 1 : 0, "patrón de sincronismo horizontal");
    assert.equal(q[i][6], i % 2 === 0 ? 1 : 0, "patrón de sincronismo vertical");
  }

  // Información de formato: las dos copias tienen que coincidir y validar.
  let vertical = 0;
  let horizontal = 0;
  for (let i = 0; i < 15; i += 1) {
    const fv = i < 6 ? i : i < 8 ? i + 1 : n - 15 + i;
    const ch = i < 8 ? n - i - 1 : i < 9 ? 7 : 14 - i;
    vertical |= q[fv][8] << i;
    horizontal |= q[8][ch] << i;
  }
  assert.equal(vertical, horizontal, "las dos copias del formato coinciden");
  const datosFormato = (vertical ^ 0x5412) >> 10;
  assert.equal(bch15(datosFormato), vertical, "el formato pasa el control BCH");
  const nivel = NIVELES_QR[datosFormato >> 3];
  const mascara = MASCARAS[datosFormato & 7];

  const alineacion = version === 2 ? [18, 18] : null;
  const esFuncion = (f, c) =>
    (f < 9 && c < 9) || (f < 9 && c >= n - 8) || (f >= n - 8 && c < 9) || f === 6 || c === 6
    || (alineacion && Math.abs(f - alineacion[0]) <= 2 && Math.abs(c - alineacion[1]) <= 2);

  const bits = [];
  let subiendo = true;
  for (let der = n - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (let i = 0; i < n; i += 1) {
      const f = subiendo ? n - 1 - i : i;
      for (const c of [der, der - 1]) {
        if (esFuncion(f, c)) continue;
        bits.push(q[f][c] ^ (mascara(f, c) ? 1 : 0));
      }
    }
    subiendo = !subiendo;
  }
  const total = CODEWORDS_TOTAL[version];
  const codewords = [];
  for (let i = 0; i < total; i += 1) codewords.push(parseInt(bits.slice(i * 8, i * 8 + 8).join(""), 2));

  // Reed-Solomon: el polinomio leído evaluado en α^0…α^(ec-1) da cero.
  const k = CODEWORDS_DATOS[version][nivel];
  for (let s = 0; s < total - k; s += 1) {
    let sindrome = 0;
    for (const cw of codewords) sindrome = gfMul(sindrome, EXP[s]) ^ cw;
    assert.equal(sindrome, 0, `síndrome ${s} nulo: la corrección de errores está bien`);
  }

  const flujo = codewords.slice(0, k).map((b) => b.toString(2).padStart(8, "0")).join("");
  let p = 0;
  const leer = (cant) => {
    const v = parseInt(flujo.slice(p, p + cant), 2);
    p += cant;
    return v;
  };
  let texto = "";
  while (p + 4 <= flujo.length) {
    const modo = leer(4);
    if (modo === 0) break;
    if (modo === 1) {
      let cuenta = leer(10);
      while (cuenta >= 3) { texto += String(leer(10)).padStart(3, "0"); cuenta -= 3; }
      if (cuenta === 2) texto += String(leer(7)).padStart(2, "0");
      if (cuenta === 1) texto += String(leer(4));
    } else if (modo === 2) {
      let cuenta = leer(9);
      while (cuenta >= 2) { const v = leer(11); texto += ALFANUM[Math.floor(v / 45)] + ALFANUM[v % 45]; cuenta -= 2; }
      if (cuenta === 1) texto += ALFANUM[leer(6)];
    } else if (modo === 4) {
      const cuenta = leer(8);
      for (let i = 0; i < cuenta; i += 1) texto += String.fromCharCode(leer(8));
    } else {
      assert.fail(`modo ${modo} inesperado`);
    }
  }
  return { texto, version, nivel };
}

// ── Pruebas ─────────────────────────────────────────────────────────────────

test("la tabla Code128 del lector coincide con la de JsBarcode", () => {
  const require = createRequire(import.meta.url);
  const { BARS } = require("jsbarcode/bin/barcodes/CODE128/constants.js");
  assert.equal(BARS.length, 107);
  ANCHOS_128.forEach((a, i) => assert.equal(aModulos(a), String(BARS[i]), `símbolo ${i}`));
  assert.equal(PARADA_128, String(BARS[106]));
});

const CODIGOS = ["M0047", "PARFIJ0016", "B007-3TEL", "KA0650", "KA12345"];
const MEDIDAS = [
  ["A4 70 × 37", FORMATOS.a4.barras, FORMATOS.a4.etiqueta.ancho - 2 * FORMATOS.a4.relleno.h],
  // En la térmica las barras van de borde a borde: el límite es la etiqueta.
  ["térmica 40 × 30", FORMATOS.termica.barras, FORMATOS.termica.etiqueta.ancho],
  ["hoja de mostrador", HOJA_MOSTRADOR.barras, HOJA_MOSTRADOR.barras.anchoMaxMm],
];

for (const codigo of CODIGOS) {
  for (const [nombre, opciones, anchoDisponible] of MEDIDAS) {
    test(`barras de ${codigo} en ${nombre}: se leen y respetan zona blanca y medidas`, () => {
      const barras = codigoDeBarras(codigo, opciones);
      assert.ok(barras, "se generan");
      const svg = svgDe(barras);
      const leido = leerCode128(modulosDesdeSvgBarras(svg));
      assert.equal(leido.texto, codigo);
      assert.ok(leido.zonaIzq >= ZONA_BLANCA_MODULOS && leido.zonaDer >= ZONA_BLANCA_MODULOS, "zona blanca de 10 módulos");
      assert.ok(barras.legible && barras.moduloMm >= MODULO_MINIMO_MM, `módulo de ${barras.moduloMm} mm`);
      assert.ok(barras.moduloMm <= opciones.moduloMaxMm + 1e-9);
      assert.ok(barras.anchoMm <= anchoDisponible + 1e-9, `entra en ${anchoDisponible} mm (mide ${barras.anchoMm})`);
      assert.ok(barras.altoMm >= 6.35, "alto mínimo para un lector láser");
      assert.ok(barras.altoMm >= barras.anchoMm * 0.15, "alto de al menos el 15 % del ancho");
      assert.match(svg, /width="[\d.]+mm" height="[\d.]+mm"/, "se dibuja en milímetros reales");
    });
  }
}

test("en la térmica el módulo cae en puntos enteros de 203 ppp", () => {
  for (const codigo of CODIGOS) {
    const barras = codigoDeBarras(codigo, FORMATOS.termica.barras);
    assert.equal(barras.moduloMm / 0.125, Math.round(barras.moduloMm / 0.125));
    assert.equal(barras.anchoMm, barras.modulos * barras.moduloMm);
  }
  assert.equal(codigoDeBarras("M0047", FORMATOS.termica.barras).moduloMm, 0.375);
  assert.equal(codigoDeBarras("PARFIJ0016", FORMATOS.termica.barras).moduloMm, 0.25);
});

// Los 37 códigos de Rebollar de 10 letras (145 módulos sin zona blanca) son
// los únicos que en 40 mm no entran con los 10 módulos de blanco.
for (const codigo of ["LIJA100XMT", "CENTROCHIC", "ALLFREME22"]) {
  test(`${codigo} en la térmica 40 × 30: entra a 0,25 mm con al menos 7 módulos de blanco`, () => {
    const barras = codigoDeBarras(codigo, FORMATOS.termica.barras);
    assert.ok(barras, "se generan");
    const leido = leerCode128(modulosDesdeSvgBarras(svgDe(barras)));
    assert.equal(leido.texto, codigo);
    assert.equal(barras.moduloMm, MODULO_MINIMO_MM);
    assert.ok(barras.anchoMm <= FORMATOS.termica.etiqueta.ancho + 1e-9, `mide ${barras.anchoMm} mm`);
    const blancoMm = (FORMATOS.termica.etiqueta.ancho - (barras.modulos - 2 * barras.zona) * barras.moduloMm) / 2;
    assert.ok(leido.zonaIzq >= 7 && leido.zonaDer >= 7 && blancoMm >= 7 * barras.moduloMm, `blanco de ${blancoMm} mm por lado`);
    assert.ok(barras.altoMm >= barras.anchoMm * 0.15, "alto de al menos el 15 % del ancho");
    // En la A4 entra igual con la zona completa: no se achica si no hace falta.
    assert.equal(codigoDeBarras(codigo, FORMATOS.a4.barras).zona, ZONA_BLANCA_MODULOS);
  });
}

test("un código que no cabe con módulos legibles no produce barras recortadas", () => {
  assert.equal(codigoDeBarras("PRODUCTO-DEMASIADO-LARGO-PARA-LA-ETIQUETA", FORMATOS.termica.barras), null);
});

for (const codigo of CODIGOS) {
  test(`QR de ${codigo}: decodifica el mismo código, nivel Q, versión 1`, () => {
    const qr = codigoQR(codigo, { ladoMm: FORMATOS.a4.qrMm });
    assert.ok(qr, "se genera");
    const { margen, q } = recortarMargen(matrizDesdeSvgQR(svgDe(qr)));
    assert.ok(margen >= qr.margen, "el margen dibujado queda en blanco");
    assert.ok(margen >= 4, "el QR incluye cuatro módulos blancos sin depender del texto vecino");
    const leido = leerQR(q);
    assert.equal(leido.texto, codigo);
    assert.equal(leido.nivel, "Q");
    assert.equal(leido.version, 1);
    assert.ok(qr.moduloMm >= 0.4, `módulo de ${qr.moduloMm} mm: lo lee un celular o un lector 2D`);
  });
}

test("los lectores de prueba rechazan un código dañado (no aprueban cualquier cosa)", () => {
  const modulos = modulosDesdeSvgBarras(svgDe(codigoDeBarras("KA0001", FORMATOS.a4.barras)));
  const roto = modulos.slice(0, 40) + (modulos[40] === "1" ? "0" : "1") + modulos.slice(41);
  assert.throws(() => leerCode128(roto));

  const { q } = recortarMargen(matrizDesdeSvgQR(svgDe(codigoQR("KA0001"))));
  const dañado = q.map((fila) => [...fila]);
  dañado[20][20] ^= 1; // un módulo de datos (esquina inferior derecha)
  assert.throws(() => leerQR(dañado));
});

test("sin texto no hay barras ni QR", () => {
  assert.equal(codigoDeBarras("", FORMATOS.a4.barras), null);
  assert.equal(codigoQR("  "), null);
});

// ── Contenido ───────────────────────────────────────────────────────────────

const item = (extra = {}) => ({
  id: "m1",
  descripcion: "Disco Flap 115 Grano 60",
  alias: null,
  codigoEtiqueta: "ka0007",
  config: { proveedor_codigo: "DF-115-60", proveedor_nombre: "Rebollar", favorito_orden: null },
  unidad: "unidad",
  ubicacion: "c2-03",
  rubro: "Lijas y abrasivos",
  ...extra,
});

test("la etiqueta lleva código, nombre, proveedor, unidad y ubicación", () => {
  assert.deepEqual(contenidoEtiqueta(item()), {
    id: "m1",
    codigo: "KA0007",
    nombre: "Disco Flap 115 Grano 60",
    proveedorCodigo: "DF-115-60",
    proveedorNombre: "Rebollar",
    unidad: "unidad",
    ubicacion: "C2-03",
    rubro: "Lijas y abrasivos",
  });
});

test("el nombre vigente no se reemplaza por los nombres viejos del alias", () => {
  assert.equal(contenidoEtiqueta(item({ alias: "  Flap 60 " })).nombre, "Disco Flap 115 Grano 60");
});

test("el código de Rebollar no se imprime dos veces", () => {
  assert.equal(contenidoEtiqueta(item({ codigoEtiqueta: "PARFIJ0016", config: { proveedor_codigo: " par fij0016 " } })).proveedorCodigo, "PAR FIJ0016");
  assert.equal(contenidoEtiqueta(item({ codigoEtiqueta: "PARFIJ0016", config: { proveedor_codigo: " parfij0016 " } })).proveedorCodigo, null);
});

test("sin código de la base no hay etiqueta: no se inventa uno", () => {
  assert.equal(contenidoEtiqueta(item({ codigoEtiqueta: null, config: null })), null);
  assert.equal(contenidoEtiqueta(item({ codigoEtiqueta: "  " })), null);
});

test("el nombre se achica con el largo", () => {
  assert.ok(tamanoNombre("Lija 80") > tamanoNombre("Hoja Serrucho Electrico P/Plastico Blanca"));
  // En la de 40 × 30 el más largo (45 caracteres) baja hasta 7,5 pt, no menos.
  assert.equal(tamanoNombre("x".repeat(45), "termica"), 7.5);
});

test("el código impreso entra al lado del QR en la de 40 × 30", () => {
  assert.equal(tamanoCodigo("PARFIJ0016", "a4"), 15);
  assert.equal(tamanoCodigo("M0047", "termica"), 14);
  assert.equal(tamanoCodigo("PARFIJ0016", "termica"), 10.5);
  // JetBrains Mono avanza 0,6 em por carácter; 1 pt = 0,3528 mm.
  const f = FORMATOS.termica;
  const libre = f.etiqueta.ancho - 2 * f.relleno.h - f.qrMm - 1.5;
  for (const codigo of ["M0047", "B007-3TEL", "PARFIJ0016"]) {
    const ancho = codigo.length * 0.6 * tamanoCodigo(codigo, "termica") * 0.3528;
    assert.ok(ancho <= libre, `${codigo} mide ${ancho.toFixed(1)} mm de ${libre} mm`);
  }
});

test("la etiqueta de prueba usa el Rebollar más largo o PARFIJ0016", () => {
  assert.equal(etiquetaDePrueba(item()).codigo, "KA0007");
  assert.equal(etiquetaDePrueba(null).codigo, CODIGO_PRUEBA);
  assert.equal(etiquetaDePrueba(item({ codigoEtiqueta: null })).codigo, CODIGO_PRUEBA);
  assert.equal(CODIGO_PRUEBA, "PARFIJ0016");
  const elegido = productoParaPrueba([item({ codigoEtiqueta: "M0047" }), item({ codigoEtiqueta: "PARFIJ0016" }), item({ codigoEtiqueta: "KA123456789" })]);
  assert.equal(etiquetaDePrueba(elegido).codigo, "PARFIJ0016");
});

// ── Paginado de la hoja A4 de 24 ────────────────────────────────────────────

const etiquetas = (n) => Array.from({ length: n }, (_, i) => ({ codigo: `KA${String(i + 1).padStart(4, "0")}` }));
const tipos = (hoja) => hoja.celdas.map((c) => c.tipo[0]).join("");

test("sin etiquetas no hay hojas", () => {
  assert.deepEqual(paginar([], { porHoja: 24 }), []);
  assert.deepEqual(paginar([null, undefined], { porHoja: 24 }), []);
});

test("24 etiquetas llenan justo una hoja", () => {
  const hojas = paginar(etiquetas(24), { porHoja: 24 });
  assert.equal(hojas.length, 1);
  assert.equal(hojas[0].celdas.length, 24);
  assert.ok(hojas[0].celdas.every((c) => c.tipo === "etiqueta"));
});

test("la 25 pasa a una segunda hoja, completada con lugares libres", () => {
  const hojas = paginar(etiquetas(25), { porHoja: 24 });
  assert.equal(hojas.length, 2);
  assert.equal(hojas[1].numero, 2);
  assert.equal(tipos(hojas[1]), "e" + "l".repeat(23));
  assert.equal(hojas[1].celdas[0].etiqueta.codigo, "KA0025");
});

test("222 consumibles son 10 hojas y el orden se mantiene", () => {
  const hojas = paginar(etiquetas(222), { porHoja: 24 });
  assert.equal(hojas.length, 10);
  const impresas = hojas.flatMap((h) => h.celdas).filter((c) => c.tipo === "etiqueta").map((c) => c.etiqueta.codigo);
  assert.deepEqual(impresas, etiquetas(222).map((e) => e.codigo));
});

test("una hoja empezada: se saltean las posiciones usadas", () => {
  const hojas = paginar(etiquetas(3), { porHoja: 24, saltear: 22 });
  assert.equal(hojas.length, 2);
  assert.equal(tipos(hojas[0]), "u".repeat(22) + "ee");
  assert.equal(tipos(hojas[1]), "e" + "l".repeat(23));
});

test("saltear se acota a la hoja y no aplica a la térmica", () => {
  assert.equal(tipos(paginar(etiquetas(1), { porHoja: 24, saltear: 99 })[0]), "u".repeat(23) + "e");
  assert.equal(tipos(paginar(etiquetas(1), { porHoja: 24, saltear: -4 })[0]), "e" + "l".repeat(23));
  const termica = paginar(etiquetas(3), { porHoja: 1, saltear: 5 });
  assert.equal(termica.length, 3);
  assert.ok(termica.every((h) => h.celdas.length === 1 && h.celdas[0].tipo === "etiqueta"));
});

test("la próxima posición libre después de imprimir", () => {
  assert.equal(proximaPosicion(30, { porHoja: 24, saltear: 0 }), 7);
  assert.equal(proximaPosicion(2, { porHoja: 24, saltear: 22 }), 1);
  assert.equal(proximaPosicion(5, { porHoja: 1 }), 1);
});

test("la grilla A4 entra en la hoja: 3 × 70 mm y 8 × 37 mm", () => {
  const f = FORMATOS.a4;
  assert.equal(f.columnas * f.filas, f.porHoja);
  assert.ok(f.columnas * f.etiqueta.ancho <= f.pagina.ancho);
  assert.ok(f.margenSuperior + f.filas * f.etiqueta.alto <= f.pagina.alto);
});

// ── Filtros, orden y hoja de mostrador ──────────────────────────────────────

const catalogo = [
  item({ id: "a", descripcion: "Tornillo T2 8x1", codigoEtiqueta: "KA0003", ubicacion: "D1-02", rubro: "Fijaciones" }),
  item({ id: "b", descripcion: "Lija al agua 220", codigoEtiqueta: "KA0002", ubicacion: "C2-01", rubro: "Lijas y abrasivos" }),
  item({ id: "c", descripcion: "Guantes de nitrilo", codigoEtiqueta: null, config: null, ubicacion: null, rubro: "EPP" }),
  item({ id: "d", descripcion: "Mecha 6 mm", codigoEtiqueta: "KA0001", ubicacion: null, rubro: "Mechas" }),
];

test("orden de impresión: por ubicación y lo que no tiene ubicación al final", () => {
  assert.deepEqual(ordenarParaImprimir(catalogo).map((i) => i.id), ["b", "a", "c", "d"]);
});

test("filtros: estantería, sin ubicación, búsqueda y sin imprimir", () => {
  assert.equal(estanteriaDe("c2-01"), "C");
  assert.equal(estanteriaDe(null), null);
  assert.deepEqual(filtrarItems(catalogo, { estanteria: "C" }).map((i) => i.id), ["b"]);
  assert.deepEqual(filtrarItems(catalogo, { estanteria: "C2-" }).map((i) => i.id), ["b"]);
  assert.deepEqual(filtrarItems(catalogo, { estanteria: "C3-" }).map((i) => i.id), []);
  assert.deepEqual(filtrarItems(catalogo, { estanteria: "__sin__" }).map((i) => i.id), ["c", "d"]);
  assert.deepEqual(filtrarItems(catalogo, { q: "lija agua" }).map((i) => i.id), []);
  assert.deepEqual(filtrarItems(catalogo, { q: "lija al" }).map((i) => i.id), ["b"]);
  assert.deepEqual(filtrarItems(catalogo, { q: "d1" }).map((i) => i.id), ["a"]);
  assert.deepEqual(filtrarItems(catalogo, { q: "ka0001" }).map((i) => i.id), ["d"]);
  assert.deepEqual(filtrarItems(catalogo, { rubro: "EPP" }).map((i) => i.id), ["c"]);
  const impresas = { KA0002: "2026-10-11T10:00:00Z" };
  assert.deepEqual(filtrarItems(catalogo, { soloSinImprimir: true, impresas }).map((i) => i.id), ["a", "c", "d"]);
});

test("hoja de mostrador: favoritos en su orden, si no hay, los primeros por nombre", () => {
  const sinFavoritos = elegirHojaMostrador(catalogo);
  assert.equal(sinFavoritos.criterio, "primeros");
  assert.deepEqual(sinFavoritos.items.map((e) => e.codigo), ["KA0002", "KA0001", "KA0003"]);

  const conFavoritos = catalogo.map((it) => (it.id === "a" ? { ...it, config: { ...it.config, favorito_orden: 2 } }
    : it.id === "d" ? { ...it, config: { ...it.config, favorito_orden: 1 } } : it));
  const hoja = elegirHojaMostrador(conFavoritos);
  assert.equal(hoja.criterio, "favoritos");
  assert.deepEqual(hoja.items.map((e) => e.codigo), ["KA0001", "KA0003"]);

  const muchos = Array.from({ length: 60 }, (_, i) => item({ id: `x${i}`, descripcion: `Item ${i}`, codigoEtiqueta: `KA${1000 + i}` }));
  assert.equal(elegirHojaMostrador(muchos).items.length, 40);
});
