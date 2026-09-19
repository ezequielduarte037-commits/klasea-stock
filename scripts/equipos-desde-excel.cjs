// Lee los dos Excel de motores y asignaciones vigentes de grupos, y genera
// src/features/equipos/equiposSeed.js, la carga de la vista previa de Motores y
// grupos. Correr desde la raíz del repo cuando cambien los Excel:
//
//   node scripts/equipos-desde-excel.cjs [motores.xlsx] [grupos.xlsx]
//
// Sin argumentos usa las rutas de siempre (la carpeta compartida de Cristian y
// Descargas). Cuando exista la tabla equipos, esto pasa a ser su importación.
const fs = require("fs");
const XLSX = require("xlsx");

const RUTA_MOTORES = process.argv[2] || "//PC-CRISTIAN/compartido/Motores asignacion y numeros 3.xlsx";
const RUTA_GRUPOS = process.argv[3] || "C:/Users/ezequ/Downloads/GRUPOS ELECTROGENOS en el galpon.xlsx";

function leer(ruta, hoja) {
  const libro = XLSX.readFile(ruta, { cellStyles: true, cellDates: false });
  return libro.Sheets[hoja];
}
function celda(hoja, dir) {
  const c = hoja[dir];
  if (!c) return { texto: "", color: "" };
  return { texto: String(c.w ?? c.v ?? "").replace(/\s+/g, " ").trim(), color: c.s?.fgColor?.rgb || "" };
}

// "52-23" → "52-23"; "ANTAGO 26" / "Antago 27" → "A26"; "55--1" → "55-1"; "K52-1" → "52-1".
function codigoObra(texto) {
  const t = String(texto || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(STOCK|CLIENTE|SAM|CHUBUT)$/.test(t)) return null;
  const antago = t.match(/^ANTAGO\s*(\d+)/) || t.match(/^A(\d+)$/);
  if (antago) return `A${antago[1]}`;
  const linea = t.match(/^K?(\d{2})-+(\d+)/);
  if (linea) return `${linea[1]}-${linea[2]}`;
  const hunter = t.match(/^H(\d+)$/);
  if (hunter) return `H${hunter[1]}`;
  return null;
}
function lineaDe(codigo) {
  if (!codigo) return null;
  if (/^A\d+/.test(codigo)) return "Antago";
  if (/^H\d+/.test(codigo)) return "Hunter";
  const m = codigo.match(/^(\d{2})-/);
  return m ? `K${m[1]}` : null;
}
// Fechas del Excel en formato m/d/aa.
function fecha(texto) {
  const m = String(texto || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anio}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// ─── MOTORES ──────────────────────────────────────────────────────────────
const hm = leer(RUTA_MOTORES, "Hoja1");
const motores = [];
function motor({ modelo, numero, obraTexto, cajas, instalado, fechaEstimada, colorNumero, colorCajas, tabla, fila }) {
  const obra = codigoObra(obraTexto);
  const texto = modelo.replace(/\s*V2\.?/i, " V2").replace(/\s+/g, " ").trim();
  const volvo = /^volvo/i.test(texto);
  const potencia = Number((texto.match(/(\d{3})/) || [])[1]) || null;
  const transmision = /v-?drive/i.test(texto) ? "V-drive" : /angular/i.test(texto) ? "Angular" : /pata/i.test(texto) ? "Pata" : null;
  const cajasTexto = [cajas, /c\/cajas\s+([^|]+)/i.exec(texto)?.[1]].filter(Boolean).join(" · ") || null;
  let estado;
  if (tabla === "entregados") estado = "entregado";
  else if (!numero) estado = "pedido";
  else if (/^s[ií]$/i.test(instalado)) estado = "instalado";
  else estado = "asignado";
  motores.push({
    tipo: "motor",
    marca: volvo ? "Volvo Penta" : "FPT Iveco",
    modelo: texto.replace(/\s*c\/cajas.*$/i, "").trim(),
    potencia,
    transmision,
    numero_serie: numero || null,
    obra,
    linea: lineaDe(obra),
    estado,
    fecha_estimada: fechaEstimada || null,
    urgente: colorNumero === "FF0000",
    cajas: cajasTexto || (colorCajas === "7030A0" ? "Cajas nuevas" : null),
    origen: `Motores · ${tabla} · fila ${fila}`,
  });
}

// Tabla "Barcos en producción" (B..G, filas 5-34). A trae la familia.
let familia = "";
let fechaPar = "";
for (let fila = 5; fila <= 34; fila += 1) {
  const a = celda(hm, `A${fila}`).texto;
  if (a) familia = a;
  const modelo = celda(hm, `B${fila}`).texto || familia;
  const numero = celda(hm, `C${fila}`);
  const obraTexto = celda(hm, `D${fila}`).texto;
  if (!obraTexto) continue;
  const g = celda(hm, `G${fila}`).texto;
  // La fecha aproximada va en la primera fila del par: vale para los dos motores.
  if (g) fechaPar = g;
  else if (fila > 5 && celda(hm, `D${fila - 1}`).texto !== obraTexto) fechaPar = "";
  motor({
    modelo, numero: numero.texto, obraTexto,
    cajas: celda(hm, `E${fila}`).texto, instalado: celda(hm, `F${fila}`).texto,
    fechaEstimada: numero.texto ? null : fechaPar,
    colorNumero: numero.color, colorCajas: celda(hm, `E${fila}`).color,
    tabla: "producción", fila,
  });
}
// Tabla "Barcos entregados" (J..L, filas 5-121; I trae la familia y M la línea).
for (let fila = 5; fila <= 121; fila += 1) {
  const modelo = celda(hm, `J${fila}`).texto;
  const numero = celda(hm, `K${fila}`);
  const obraTexto = celda(hm, `L${fila}`).texto;
  if (!modelo || !obraTexto) continue;
  motor({ modelo, numero: numero.texto, obraTexto, tabla: "entregados", fila, colorNumero: numero.color });
}
// Tercera tabla (I..M, filas 125-158, sin encabezado): barcos anteriores con la
// columna Instalado. Casi todos ya se entregaron; la pantalla lo corrige con la
// base (produccion_obras.estado).
for (let fila = 125; fila <= 158; fila += 1) {
  const modelo = celda(hm, `I${fila}`).texto;
  const numero = celda(hm, `J${fila}`);
  const obraTexto = celda(hm, `K${fila}`).texto;
  if (!modelo || !obraTexto) continue;
  motor({
    modelo, numero: numero.texto, obraTexto,
    cajas: celda(hm, `L${fila}`).texto, instalado: celda(hm, `M${fila}`).texto,
    colorNumero: numero.color, colorCajas: celda(hm, `L${fila}`).color,
    tabla: "recientes", fila,
  });
}

// ─── GRUPOS ELECTRÓGENOS ────────────────────────────────────────────────────
const hg = leer(RUTA_GRUPOS, "GRUPOS X OBRA");
const grupos = [];
function grupo({ proveedor, descripcion, origenTexto, destinoTexto, fechaTexto, nota, tabla, fila, colorDestino }) {
  const d = descripcion.replace(/kva/i, "kVA").replace(/\s+/g, " ").trim();
  const kva = Number((d.match(/(\d+(?:[.,]\d+)?)/) || [])[1]?.replace(",", ".")) || null;
  const marca = /kh?ol?h?er/i.test(d) ? "Kohler" : /maze/i.test(d) ? "Maze" : /onan/i.test(d) ? "Onan" : /sleeper/i.test(d) ? "Sleeper" : null;
  const origen = codigoObra(origenTexto);
  const destino = codigoObra(destinoTexto);
  const destinoStock = /^stock$/i.test(destinoTexto || "");
  const entregado = fecha(fechaTexto);
  let estado;
  let obra = null;
  if (destino && entregado) { estado = "instalado"; obra = destino; }
  else if (destino) { estado = "asignado"; obra = destino; }
  else if (destinoStock) estado = "en_galpon";
  else if (origen) { estado = "asignado"; obra = origen; }
  else estado = "en_galpon";
  const movimientos = [];
  if (origen && destino && origen !== destino) {
    movimientos.push({ tipo: "reasignacion", desde: origen, hacia: destino, fecha: entregado });
  }
  if (origen && destinoStock) movimientos.push({ tipo: "devuelto", desde: origen, hacia: null, fecha: entregado });
  grupos.push({
    tipo: "generador",
    marca,
    modelo: d,
    potencia: kva,
    proveedor: proveedor ? proveedor[0].toUpperCase() + proveedor.slice(1).toLowerCase() : null,
    numero_serie: null,
    obra,
    linea: lineaDe(obra),
    obra_origen: origen,
    estado,
    fecha_entrega: entregado,
    compra_cliente: /cliente/i.test(`${origenTexto} ${nota}`),
    destino_externo: !destino && destinoTexto && !destinoStock ? destinoTexto : null,
    nota: nota || (!fecha(fechaTexto) && fechaTexto ? fechaTexto : null),
    movimientos,
    origen: `Grupos · ${tabla} · fila ${fila}`,
    devuelto_a_stock: colorDestino === "00B050",
  });
}
// Tabla izquierda (B..F) y su bloque "stock sin asignar" (B..F, 30-41).
for (let fila = 5; fila <= 41; fila += 1) {
  const proveedor = celda(hg, `B${fila}`).texto;
  const descripcion = celda(hg, `C${fila}`).texto;
  if (!proveedor || !descripcion || /proveedor/i.test(proveedor) || /stock sin/i.test(proveedor)) continue;
  grupo({
    proveedor, descripcion,
    origenTexto: celda(hg, `D${fila}`).texto, destinoTexto: celda(hg, `E${fila}`).texto,
    fechaTexto: celda(hg, `F${fila}`).texto, tabla: "por obra", fila,
    colorDestino: celda(hg, `E${fila}`).color,
  });
}
// Tabla derecha (H..M, 5-47).
for (let fila = 5; fila <= 47; fila += 1) {
  const proveedor = celda(hg, `H${fila}`).texto;
  const descripcion = celda(hg, `I${fila}`).texto;
  if (!proveedor || !descripcion) continue;
  grupo({
    proveedor, descripcion,
    origenTexto: celda(hg, `J${fila}`).texto, destinoTexto: celda(hg, `K${fila}`).texto,
    fechaTexto: celda(hg, `L${fila}`).texto, nota: celda(hg, `M${fila}`).texto,
    tabla: "stock", fila, colorDestino: celda(hg, `K${fila}`).color,
  });
}

const salida = `// Generado desde los Excel "Motores asignacion y numeros 3.xlsx" (motores FPT
// Iveco y algunos Volvo) y "GRUPOS ELECTROGENOS en el galpon.xlsx" (hoja GRUPOS
// X OBRA) el ${new Date().toISOString().slice(0, 10)}. Es la carga inicial de la vista previa de
// Motores y grupos; cuando exista la tabla equipos (migración
// 20260918100000_equipos_motores_grupos.sql) esto pasa a ser su importación.
// Cada registro dice en "origen" de qué hoja y fila salió. Se regenera con
// node scripts/equipos-desde-excel.cjs.

export const MOTORES_SEED = ${JSON.stringify(motores, null, 2)};

export const GRUPOS_SEED = ${JSON.stringify(grupos, null, 2)};
`;
fs.mkdirSync("src/features/equipos", { recursive: true });
fs.writeFileSync("src/features/equipos/equiposSeed.js", salida);
const contar = (lista, clave) => Object.entries(lista.reduce((m, x) => { m[x[clave]] = (m[x[clave]] || 0) + 1; return m; }, {}));
console.log("motores:", motores.length, JSON.stringify(contar(motores, "estado")), JSON.stringify(contar(motores, "marca")));
console.log("grupos:", grupos.length, JSON.stringify(contar(grupos, "estado")), JSON.stringify(contar(grupos, "marca")));
console.log("faltantes:", motores.filter((m) => m.estado === "pedido").map((m) => `${m.obra}${m.fecha_estimada ? ` (${m.fecha_estimada})` : ""}`).join(", "));
console.log("reasignaciones de grupos:", grupos.filter((g) => g.movimientos.length).map((g) => g.movimientos.map((mv) => `${mv.desde}→${mv.hacia || "stock"}`).join("")).join(", "));
console.log("grupos en galpón:", grupos.filter((g) => g.estado === "en_galpon").map((g) => `${g.modelo} (${g.proveedor})`).join(", "));
