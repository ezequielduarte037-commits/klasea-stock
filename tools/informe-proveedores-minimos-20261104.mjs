// Informe del 04/11/2026: proveedores cargados o cambiados en los ítems, ítems
// de la lista estándar sin proveedor y todos los mínimos de stock cargados.
// Lee lo que bajaron minimos-panol-datos/analisis (perfil.json, con el stock
// libre del día) más el historial del catálogo y la matriz.
//   node tools/informe-proveedores-minimos-20261104.mjs .tmp/informe-prov salida.xlsx
import fs from 'node:fs';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);
const [dir, salida] = process.argv.slice(2);
const read = (n) => JSON.parse(fs.readFileSync(`${dir}/${n}.json`, 'utf8'));
const audit = read('audit');
const mats = read('mats');
const profs = read('profs');
const modelo = read('modelo');
const obras = read('obras');
const perfil = read('datos/perfil');

const DESDE_RECIENTE = '2026-11-01';
const RUBROS_FUERA = /laminaci|madera/i;
const vacio = (v) => v == null || String(v).trim() === '';
const txt = (v) => (vacio(v) ? '' : String(v).trim());
const fecha = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const usuario = new Map(profs.map((p) => [p.id, p.username]));
const matById = new Map(mats.map((m) => [m.id, m]));
const perfilById = new Map(perfil.map((p) => [p.id, p]));
const rubroDe = (id) => perfilById.get(id)?.rubro || '';

// Matriz: qué líneas llevan cada ítem y cuántas obras activas hay por línea.
const activasPorLinea = {};
for (const o of obras) {
  if (o.estado !== 'activa') continue;
  const m = String(o.linea_nombre || '').match(/^K?(\d+)/i);
  if (m) activasPorLinea[m[1]] = (activasPorLinea[m[1]] || 0) + 1;
}
const matrizDe = new Map();
for (const r of modelo) {
  const id = r.material_id;
  if (!matrizDe.has(id)) matrizDe.set(id, []);
  matrizDe.get(id).push(r);
}
const lineasTexto = (id) => (matrizDe.get(id) || [])
  .map((r) => `K${r.modelo}${Number(r.cantidad) && Number(r.cantidad) !== 1 ? ` ×${r.cantidad}` : ''}`)
  .sort().join(', ');

// ── Proveedores cargados / cambiados (campo de texto del catálogo) ──
const cambios = audit
  .filter((a) => a.campo === 'proveedor')
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
  .map((a) => {
    const m = matById.get(a.material_id);
    const antes = txt(a.valor_anterior);
    const despues = txt(a.valor_nuevo);
    const tipo = !antes && despues ? 'Agregado' : antes && !despues ? 'Quitado' : 'Cambiado';
    const actual = txt(m?.proveedor);
    return {
      _iso: a.created_at,
      Fecha: fecha(a.created_at),
      Quién: usuario.get(a.actor_id) || (a.origen !== 'trigger' ? a.origen : 'sistema / script'),
      Tipo: tipo,
      Código: m?.codigo || '',
      Descripción: m?.descripcion || a.material_descripcion || '',
      Rubro: rubroDe(a.material_id),
      'Proveedor anterior': antes,
      'Proveedor nuevo': despues,
      'Proveedor hoy': m ? (actual === despues ? '(igual)' : actual || '(sin proveedor)') : '(ítem borrado)',
      'En la lista estándar': lineasTexto(a.material_id),
    };
  });
const recientes = cambios.filter((c) => c._iso >= DESDE_RECIENTE);

// ── Ítems de la lista estándar sin proveedor ──
// Si la matriz tiene un producto predeterminado, cuenta el proveedor de ese.
const sinProveedor = [];
for (const [id, filas] of matrizDe) {
  const m = matById.get(id);
  if (!m || m.activo === false || m.es_consumible) continue;
  const rubro = rubroDe(id);
  if (RUBROS_FUERA.test(rubro)) continue;
  const predet = filas.map((f) => matById.get(f.producto_predeterminado_id)).find(Boolean);
  if (!vacio(m.proveedor) || (predet && !vacio(predet.proveedor))) continue;
  const p = perfilById.get(id);
  const obrasActivas = filas.reduce((s, f) => s + (activasPorLinea[f.modelo] || 0), 0);
  sinProveedor.push({
    Código: m.codigo || '',
    Descripción: m.descripcion,
    Rubro: rubro,
    Unidad: m.unidad_medida || '',
    'Líneas (cant. por barco)': lineasTexto(id),
    'Obras activas que lo llevan': obrasActivas,
    'Ficha genérica (el producto se elige por obra)': m.es_requisito ? 'Sí' : '',
    'Precio USD': p?.precioUsd ?? '',
    'Stock libre': p?.stockLibre ?? 0,
  });
}
sinProveedor.sort((a, b) => a.Rubro.localeCompare(b.Rubro) || b['Obras activas que lo llevan'] - a['Obras activas que lo llevan'] || a.Descripción.localeCompare(b.Descripción));

// ── Mínimos cargados ──
const ultimoMin = new Map();
for (const a of audit) {
  if (a.campo !== 'stock_minimo') continue;
  const prev = ultimoMin.get(a.material_id);
  if (!prev || a.created_at > prev.created_at) ultimoMin.set(a.material_id, a);
}
// Las cargas automáticas del 03 y 04/11 las pidió y aprobó ezequiel.adm: van a
// su nombre, con la ronda como detalle.
const RONDAS = {
  minimos_iniciales_20261103: 'Carga general 03/11',
  minimos_ajuste_20261103: 'Ajuste 03/11',
  minimos_estandar_20261103: 'Lista estándar 03/11',
  minimos_cositas_20261103: 'Piezas chicas 03/11',
  minimos_por_obra_20261104: 'Pasó a "Falta para obras" 04/11',
};
const quienMin = (a) => {
  if (!a) return ['Sin registro', ''];
  if (RONDAS[a.origen]) return ['ezequiel.adm', RONDAS[a.origen]];
  return [usuario.get(a.actor_id) || 'sin usuario', 'A mano'];
};
const minimos = mats
  .filter((m) => m.activo !== false && Number(m.stock_minimo) > 0)
  .map((m) => {
    const p = perfilById.get(m.id);
    const minimo = Number(m.stock_minimo);
    const libre = Number(p?.stockLibre ?? 0);
    const a = ultimoMin.get(m.id);
    return {
      Tipo: m.es_consumible ? 'Consumible' : 'De barco',
      Código: m.codigo || '',
      Descripción: m.descripcion,
      Rubro: p?.rubro || '',
      Unidad: m.unidad_medida || '',
      Mínimo: minimo,
      'Stock libre': Math.round(libre * 100) / 100,
      Reponer: libre <= minimo ? 'Sí' : '',
      'Para llegar al mínimo': libre < minimo ? Math.round((minimo - libre) * 100) / 100 : 0,
      Proveedor: txt(m.proveedor),
      'Precio USD': p?.precioUsd ?? '',
      'Quién lo cargó': quienMin(a)[0],
      Cómo: quienMin(a)[1],
      Fecha: a ? fecha(a.created_at).slice(0, 10) : '',
    };
  })
  .sort((a, b) => a.Tipo.localeCompare(b.Tipo) || a.Rubro.localeCompare(b.Rubro) || a.Descripción.localeCompare(b.Descripción));

// ── Resumen ──
const contar = (arr, f) => arr.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const tiposRec = contar(recientes, (c) => c.Tipo);
const quienRec = contar(recientes, (c) => c.Quién);
const minBarco = minimos.filter((m) => m.Tipo === 'De barco');
const minCons = minimos.filter((m) => m.Tipo === 'Consumible');
const enCero = mats.filter((m) => m.activo !== false && m.stock_minimo != null && Number(m.stock_minimo) === 0).length;
const resumen = [
  ['Informe de proveedores y mínimos de stock', ''],
  ['Generado', fecha(new Date().toISOString())],
  ['', ''],
  ['PROVEEDORES CARGADOS O CAMBIADOS', ''],
  [`Desde el ${DESDE_RECIENTE.split('-').reverse().join('/')}`, recientes.length],
  ...Object.entries(tiposRec).map(([k, v]) => [`   ${k}`, v]),
  ...Object.entries(quienRec).map(([k, v]) => [`   por ${k}`, v]),
  ['Historial completo (desde julio)', cambios.length],
  ['', ''],
  ['LISTA ESTÁNDAR SIN PROVEEDOR', ''],
  ['Ítems sin proveedor (sin laminación, maderas ni consumibles)', sinProveedor.length],
  ...Object.entries(contar(sinProveedor, (s) => s.Rubro || 'Sin rubro')).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`   ${k}`, v]),
  ['', ''],
  ['MÍNIMOS DE STOCK CARGADOS', ''],
  ['De barco con mínimo', minBarco.length],
  ['   para reponer hoy', minBarco.filter((m) => m.Reponer).length],
  ['   cargados a mano', minBarco.filter((m) => m.Cómo === 'A mano').length],
  ['Consumibles con mínimo', minCons.length],
  ['   para reponer hoy', minCons.filter((m) => m.Reponer).length],
  ['Ítems con mínimo en 0 (a propósito)', enCero],
];

const hoja = (filas, anchos) => {
  const h = XLSX.utils.json_to_sheet(filas.map(({ _iso, ...r }) => r));
  h['!cols'] = anchos.map((wch) => ({ wch }));
  if (filas.length) h['!autofilter'] = { ref: h['!ref'] };
  return h;
};
const libro = XLSX.utils.book_new();
const hr = XLSX.utils.aoa_to_sheet(resumen);
hr['!cols'] = [{ wch: 58 }, { wch: 18 }];
XLSX.utils.book_append_sheet(libro, hr, 'Resumen');
const anchosCambios = [16, 14, 10, 12, 50, 18, 24, 24, 22, 22];
XLSX.utils.book_append_sheet(libro, hoja(recientes, anchosCambios), 'Proveedores noviembre');
XLSX.utils.book_append_sheet(libro, hoja(sinProveedor, [12, 55, 18, 9, 26, 12, 16, 10, 10]), 'Sin proveedor');
XLSX.utils.book_append_sheet(libro, hoja(minimos, [11, 12, 55, 18, 9, 8, 10, 8, 12, 22, 10, 16, 24, 11]), 'Mínimos cargados');
XLSX.utils.book_append_sheet(libro, hoja(cambios, anchosCambios), 'Proveedores historial');
XLSX.writeFile(libro, salida);
// Los mismos datos en JSON para la versión con formato y gráficos
// (informe-proveedores-minimos-formato-20261104.py).
const limpio = (arr) => arr.map(({ _iso, ...r }) => ({ ...r, _iso }));
fs.writeFileSync(salida.replace(/\.xlsx$/, '.json'), JSON.stringify({
  generado: new Date().toISOString(), desdeReciente: DESDE_RECIENTE,
  recientes: limpio(recientes), cambios: limpio(cambios), sinProveedor, minimos, enCero,
}));

console.log({ recientes: recientes.length, tiposRec, quienRec, historial: cambios.length, sinProveedor: sinProveedor.length, minBarco: minBarco.length, reponerBarco: minBarco.filter((m) => m.Reponer).length, minCons: minCons.length, enCero });
