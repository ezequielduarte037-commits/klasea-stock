// Ajuste de la carga de mínimos (03/11/2026, segunda vuelta). Ezequiel: los
// consumibles no le interesaban, y en lo de barco casi todo tiene que quedar
// en 0 salvo lo que se mueve mucho o es importante, mirando precios.
//
// Lo de barco, mínimo positivo sólo si salió a 4 obras o más en los últimos
// 90 días y en 4 salidas o más:
//   - hasta USD 30 (bronces, Whale, LED, pulsadores): un barco y medio, mínimo 2;
//   - USD 30–150: lo de un barco, sin pasar de ~USD 600 parados;
//   - USD 150–300: sólo si va en 6 obras o más; uno o dos de repuesto;
//   - más de USD 300, equipos sin precio, Herrería, Vidrios, Maderas: 0.
import fs from 'node:fs';
import * as XLSX from 'xlsx';
XLSX.set_fs(fs);

const [dir, previaPath, sqlPath, xlsxPath] = process.argv.slice(2);
const perfil = new Map(JSON.parse(fs.readFileSync(`${dir}/perfil.json`, 'utf8')).map((f) => [f.id, f]));
const previa = JSON.parse(fs.readFileSync(previaPath, 'utf8'));
const techo = (x) => Math.ceil(x - 1e-9);
const fmt = (n) => Number(Math.round(n * 100) / 100).toLocaleString('es-AR');

function redondo(n) {
  if (n <= 10) return techo(n);
  if (n <= 50) return techo(n / 5) * 5;
  return techo(n / 10) * 10;
}

const EXCLUIDO = /^(Maderas|Vidrios|Herrería)/;
const EQUIPO = /bow ?thruster|malacate|flap|inver|generador|ecosonda|\bvhf\b|\bghs\b|plotter|termotanque|calefactor|fabricadora|heladera|microondas|\btv\b|aire acond|bomba|inodoro|tunel|panel multi|tablero|anafe|parrilla|chromecast|antena|sensor|switch|duchador|monocomando|faro|bocina|bater|solenoide|tender|lift|motor/i;

function barco(f) {
  const uso = `Salió a ${f.obras90} obras en 90 días (${fmt(f.cant90)} ${f.unidad}, ${fmt(f.porBarco)} por barco)`;
  if (EXCLUIDO.test(f.rubro)) return { minimo: 0, motivo: /^Herrería/.test(f.rubro) ? 'Herrería: se fabrica por barco' : `${f.rubro.split(' /')[0]}: va por su circuito` };
  if (f.obras90 < 4 || f.eventos90 < 4) {
    return { minimo: 0, motivo: f.eventos ? `Poco movimiento (${f.obras90} obras en 90 días): se compra por obra` : 'Sin salidas registradas: se compra por obra' };
  }
  const precio = f.precioUsd;
  if (precio == null && EQUIPO.test(f.descripcion)) return { minimo: 0, motivo: `${uso} · equipo sin precio: se compra por barco` };
  if (precio != null && precio > 300) return { minimo: 0, motivo: `${uso} · USD ${precio}: se compra por barco` };
  if (precio != null && precio > 150) {
    if (f.obras90 < 6) return { minimo: 0, motivo: `${uso} · USD ${precio}: se compra por barco` };
    return { minimo: Math.min(2, Math.max(1, techo(f.porBarco))), motivo: `${uso} · USD ${precio}, va en casi todos: repuesto` };
  }
  if (precio != null && precio > 30) {
    return { minimo: Math.max(1, Math.min(techo(f.porBarco), Math.floor(600 / precio))), motivo: `${uso} · USD ${precio}: lo de un barco` };
  }
  return { minimo: redondo(Math.max(2, 1.5 * f.porBarco)), motivo: `${uso}${precio != null ? ` · USD ${precio}` : ''}: un barco y medio` };
}

const cambios = [];
for (const p of previa) {
  if (p.tipo === 'Consumible') {
    cambios.push({ ...p, anterior: p.minimo, minimo: null, motivo: 'Consumible: queda sin mínimo (los maneja Consumibles)' });
    continue;
  }
  const f = perfil.get(p.id);
  const r = barco(f);
  cambios.push({ ...p, anterior: p.minimo, minimo: r.minimo, motivo: r.motivo, obras90: f.obras90, stock: f.stockLibre, reponer: r.minimo > 0 && f.stockLibre <= r.minimo });
}

const lit = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const valores = cambios.map((c) => `  (${lit(c.id)}::uuid, ${c.anterior}, ${c.minimo ?? 'null'}, ${lit(c.motivo)})`).join(',\n');
fs.writeFileSync(sqlPath, `-- Segunda vuelta de los mínimos del pañol (03/11/2026). Ezequiel: los
-- consumibles no le interesaban (vuelven a quedar sin mínimo) y en lo de barco
-- casi todo va en 0 salvo lo que se mueve mucho o es importante, mirando el
-- precio. Cálculo en tools/minimos-panol-ajuste-20261103.mjs.
--
-- Sólo cambia los que siguen con el valor que puso 20261103220000: si alguien
-- ya lo corrigió a mano, queda lo suyo.

begin;

create temp table zz_minimos (material_id uuid primary key, anterior numeric, minimo numeric, motivo text) on commit drop;
insert into zz_minimos (material_id, anterior, minimo, motivo) values
${valores};

update public.panol_materiales m
set stock_minimo = z.minimo
from zz_minimos z
where m.id = z.material_id
  and m.stock_minimo = z.anterior
  and m.stock_minimo is distinct from z.minimo;

update public.panol_materiales_audit a
set origen = 'minimos_ajuste_20261103',
    contexto = coalesce(a.contexto, '{}'::jsonb) || jsonb_build_object('motivo', z.motivo)
from zz_minimos z
where a.material_id = z.material_id
  and a.campo = 'stock_minimo'
  and a.contexto->>'txid' = txid_current()::text;

commit;
`);

const barcoFinal = cambios.filter((c) => c.tipo === 'Barco');
const filas = barcoFinal
  .sort((a, b) => (b.minimo > 0) - (a.minimo > 0) || a.rubro.localeCompare(b.rubro, 'es') || a.descripcion.localeCompare(b.descripcion, 'es', { numeric: true }))
  .map((c) => ({
    Rubro: c.rubro, Código: c.codigo || '', Descripción: c.descripcion, Unidad: c.unidad,
    Mínimo: c.minimo, 'Stock libre hoy': c.stock, 'A reponer': c.reponer ? 'Sí' : '',
    'USD unit.': c.precioUsd ?? '', Motivo: c.motivo,
  }));
const hoja = XLSX.utils.json_to_sheet(filas);
hoja['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 55 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 9 }, { wch: 80 }];
hoja['!autofilter'] = { ref: hoja['!ref'] };
const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, hoja, 'Mínimos de barco');
XLSX.writeFile(libro, xlsxPath);

const pos = barcoFinal.filter((c) => c.minimo > 0);
console.log({ consumiblesANull: cambios.length - barcoFinal.length, barcoPositivos: pos.length, barcoCero: barcoFinal.length - pos.length, aReponer: pos.filter((c) => c.reponer).length });
for (const c of pos) console.log(c.minimo, '|', c.stock, '|', c.precioUsd, '|', c.descripcion.slice(0, 55));
