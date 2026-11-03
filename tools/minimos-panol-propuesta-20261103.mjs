// Propuesta de stock mínimo (03/11/2026) a partir de perfil.json.
// No toca lo que ya tiene mínimo (lo cargaron Ezequiel y Tomás a mano).
//
// Consumibles: la cuenta de Consumibles (reposicion.js): consumo diario × 6 días
// (3 de entrega + 3 de seguridad), con 9 días para lo que frena la producción
// si falta, y nunca menos que un retiro típico. Retiro registrado desde el
// 13/10 (mostrador y solicitudes); un solo retiro en tres semanas = a pedido.
//
// Lo de barco: mínimo sólo si se usó en 3 obras o más (2 si es herraje o
// ferretería barata): el doble de lo que lleva un barco o dos semanas de
// salida, lo que sea más. Equipo de más de USD 1.000 no se stockea. El resto
// que tuvo movimiento o está en la matriz queda en 0 ("se compra por obra").
// Sin ningún registro queda sin mínimo.
import fs from 'node:fs';

const dir = process.argv[2];
const filas = JSON.parse(fs.readFileSync(`${dir}/perfil.json`, 'utf8'));
const DIAS_REGISTRO = 21; // 13/10 → 03/11
const techo = (x) => Math.ceil(x - 1e-9);

function redondo(n) {
  if (n <= 10) return techo(n);
  if (n <= 50) return techo(n / 5) * 5;
  if (n <= 200) return techo(n / 10) * 10;
  if (n <= 1000) return techo(n / 50) * 50;
  return techo(n / 100) * 100;
}

function percentil(valores, p) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))];
}

const CONS_CRITICO = /Lijas y abrasivos|Fijaciones|Químicos y adhesivos|EPP|Cintas y film/;
const BARCO_EXCLUIDO = /^(Maderas|Vidrios|Herrería)/;
// Equipos: uno de repuesto alcanza; con precio desconocido se trata como caro.
const EQUIPO = /bow ?thruster|malacate|flap|inver|generador|ecosonda|vhf|ghs|plotter|termotanque|calefactor|fabricadora|heladera|microondas|tv|aire acond|bomba|inodoro|tunel|panel multi|tablero|anafe|parrilla|chromecast|antena|sensor|switch|duchador|monocomando|faro|bocina|bater/i;
const A_MEDIDA = /\bL\s*=|a medida|\bplano\b|\bespecial\b/i;
const FERRETERIA = /Herrajes|Bulonería|Tornill|Fijacion/i;

function consumible(f) {
  const n = f.eventosNuevos;
  if (n === 0) return { minimo: 0, motivo: 'Sin retiros desde el 13/10' };
  if (n === 1) return { minimo: 0, motivo: 'Un solo retiro en tres semanas: a pedido' };
  const critico = CONS_CRITICO.test(f.rubro);
  const dias = critico ? 9 : 6;
  const diario = f.cantNuevos / DIAS_REGISTRO;
  const tipico = percentil(f.retiros, n < 5 ? 0.5 : 0.75);
  const base = Math.max(diario * dias, tipico, 1);
  return {
    minimo: redondo(base),
    motivo: `${n} retiros, ${fmt(f.cantNuevos)} ${f.unidad} en 3 semanas · ${dias} días de consumo${critico ? ' (frena la producción)' : ''}${tipico >= diario * dias ? ' · cubre un retiro típico' : ''}`,
  };
}

function barco(f) {
  const tuvoAlgo = f.eventos > 0 || f.matrizObras > 0 || (f.stockTotal ?? 0) > 0;
  if (!tuvoAlgo) return null;
  if (BARCO_EXCLUIDO.test(f.rubro)) return { minimo: 0, motivo: /^Herrería/.test(f.rubro) ? 'Herrería: se fabrica por barco' : `${f.rubro.split(' /')[0]}: va por su circuito / a medida` };
  if (A_MEDIDA.test(f.descripcion)) return { minimo: 0, motivo: 'A medida: se compra por obra' };
  if (f.precioUsd != null && f.precioUsd > 1000) return { minimo: 0, motivo: `Equipo de USD ${f.precioUsd}: se compra por barco` };
  const equipo = EQUIPO.test(f.descripcion);
  const barato = !equipo && ((f.precioUsd != null && f.precioUsd <= 20) || (f.precioUsd == null && (FERRETERIA.test(f.rubro) || FERRETERIA.test(f.descripcion))));
  const obrasNecesarias = barato ? 2 : 3;
  if (f.obras < obrasNecesarias || f.eventos90 === 0) {
    return { minimo: 0, motivo: f.eventos ? `Salió a ${f.obras} obra${f.obras === 1 ? '' : 's'}: se compra por obra` : 'Sin salidas registradas: se compra por obra' };
  }
  const dosSemanas = (f.cant90 / 90) * 14;
  let base = Math.max((barato ? 2 : 1.5) * f.porBarco, dosSemanas, 1);
  if (barato) base = Math.max(base, 5);
  let tope = '';
  if (f.precioUsd != null && f.precioUsd > 400) { base = 1; tope = ` · equipo de USD ${f.precioUsd}: uno de repuesto`; }
  else if (equipo && f.precioUsd == null) { base = 1; tope = ' · equipo sin precio cargado: uno de repuesto'; }
  else if ((f.precioUsd != null && f.precioUsd > 150) || equipo) { base = Math.min(base, 2); tope = ' · equipo: tope 2'; }
  return {
    minimo: redondo(base),
    motivo: `Salió a ${f.obras} obras (${fmt(f.cant90)} ${f.unidad} en 90 días, ${fmt(f.porBarco)} por barco)${tope}`,
  };
}

function fmt(n) { return Number(Math.round(n * 100) / 100).toLocaleString('es-AR'); }

const propuesta = [];
for (const f of filas) {
  if (f.minimoActual != null) continue;
  const r = f.consumible ? consumible(f) : barco(f);
  if (!r) continue;
  const stock = f.stockLibre;
  propuesta.push({
    id: f.id, codigo: f.codigo, descripcion: f.descripcion, rubro: f.rubro, unidad: f.unidad,
    tipo: f.consumible ? 'Consumible' : 'Barco',
    minimo: r.minimo, motivo: r.motivo,
    stock, contado: f.contado,
    reponer: r.minimo > 0 && stock != null && stock <= r.minimo,
    obras: f.obras, eventos90: f.eventos90, cant90: f.cant90, precioUsd: f.precioUsd,
  });
}
fs.writeFileSync(`${dir}/propuesta.json`, JSON.stringify(propuesta, null, 1));
const cuenta = (pred) => propuesta.filter(pred).length;
console.log({
  total: propuesta.length,
  consumiblesPositivos: cuenta((p) => p.tipo === 'Consumible' && p.minimo > 0),
  consumiblesCero: cuenta((p) => p.tipo === 'Consumible' && p.minimo === 0),
  barcoPositivos: cuenta((p) => p.tipo === 'Barco' && p.minimo > 0),
  barcoCero: cuenta((p) => p.tipo === 'Barco' && p.minimo === 0),
  quedanSinMinimo: filas.filter((f) => f.minimoActual == null).length - propuesta.length,
  aReponerConsumibles: cuenta((p) => p.tipo === 'Consumible' && p.reponer),
  aReponerBarco: cuenta((p) => p.tipo === 'Barco' && p.reponer),
});
