import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { hojasListaObra, hojasMatrizLinea } from './listaExcel.js';
import { armarXlsx } from '../compras/xlsx.js';

const fecha = new Date(2026, 9, 14, 10, 32);
const fila = (extra = {}) => ({
  descripcion: 'Bomba de achique 2000 GPH', requisito: '', codigo: 'KA-1', proveedor: 'Baron', rubro: 'Electricidad',
  origen: 'Base', cantidad: 2, unidad: 'u', recibido: 0, entregado: 0, faltaComprar: 2, faltaEntregar: 0,
  estado: 'Pendiente', accion: 'COMPRAR 2', etapas: '', precio: 1000, moneda: 'ARS', obs: '', ...extra,
});
const valores = (filaHoja) => filaHoja.map((celda) => (celda && typeof celda === 'object' ? celda.v : celda));

test('la lista de la obra sale en dos hojas: una para imprimir agrupada y otra plana', () => {
  const grupos = [
    { nombre: 'Electricidad', filas: [fila(), fila({ descripcion: 'Breaker 20 A', estado: 'Entregado', entregado: 2 })] },
    { nombre: 'Herrajes', filas: [fila({ descripcion: 'Bisagra inox', rubro: 'Herrajes' })] },
    { nombre: 'Vacío', filas: [] },
  ];
  const [imprimir, datos] = hojasListaObra({ obra: '55-1', linea: 'K55', grupos, fecha });

  assert.equal(imprimir.nombre, 'Para imprimir');
  assert.equal(datos.nombre, 'Datos');
  assert.match(imprimir.filas[0][0].v, /Obra 55-1 · K55/);
  assert.match(imprimir.filas[1][0].v, /^3 ítems/);

  // Encabezado en la fila 4, después un título por grupo y sus filas.
  assert.deepEqual(valores(imprimir.filas[3]).slice(0, 2), ['✓', 'Material']);
  assert.equal(imprimir.filas[4][0].v, 'Electricidad  ·  2 ítems');
  assert.deepEqual(valores(imprimir.filas[5]).slice(0, 2), ['☐', 'Bomba de achique 2000 GPH']);
  assert.equal(imprimir.filas[7][0].v, 'Herrajes  ·  1 ítem');
  // El grupo sin filas no deja un título suelto.
  assert.equal(imprimir.filas.length, 9);

  // La hoja plana no tiene filas de grupo y lleva el total.
  assert.equal(datos.filas.length, 4 + 3);
  const cab = valores(datos.filas[3]);
  assert.equal(valores(datos.filas[4])[cab.indexOf('Total')], 2000);
  assert.equal(datos.autofiltro, 'A4:S7');

  assert.deepEqual(imprimir.imprimir.repetirFilas, [3]);
  assert.equal(imprimir.imprimir.ajustarAncho, true);
});

test('los filtros puestos quedan escritos arriba del papel', () => {
  const [imprimir] = hojasListaObra({ obra: '55-1', grupos: [{ nombre: 'X', filas: [fila()] }], filtros: ['estado Pendiente'], fecha });
  assert.match(imprimir.filas[1][0].v, /filtrado: estado Pendiente/);
});

test('sin filas no arma un archivo vacío', () => {
  assert.throws(() => hojasListaObra({ obra: '55-1', grupos: [], fecha }), /No hay materiales/);
  assert.throws(() => hojasMatrizLinea({ linea: 'K55', grupos: [{ nombre: 'X', filas: [] }], fecha }), /No hay materiales/);
});

test('en la matriz, Tipo sólo marca lo que no es estándar y la nota de precio sólo va sin precio', () => {
  const grupos = [{
    nombre: 'Baron',
    filas: [
      fila({ tipo: 'Base', esBase: true, precioNota: 'Sin precio' }),
      fila({ descripcion: 'Bocina', tipo: 'Línea eje', esBase: false, precio: 0, precioNota: 'En conjunto' }),
      fila({ descripcion: 'Tablón', tipo: 'Producción · Maderas', esBase: false, precio: 50, total: null, precioNota: '' }),
    ],
  }];
  const [imprimir, datos] = hojasMatrizLinea({ linea: 'K55', grupos, agrupadoPor: 'proveedor', extra: ['barco estándar, sin los 12 de línea de eje'], fecha });

  // Agrupado por proveedor, la columna de al lado es el rubro.
  assert.equal(valores(imprimir.filas[3])[3], 'Rubro');
  const tipo = valores(imprimir.filas[3]).indexOf('Tipo');
  assert.equal(valores(imprimir.filas[5])[tipo], '');
  assert.equal(valores(imprimir.filas[6])[tipo], 'Línea eje');
  assert.match(imprimir.filas[1][0].v, /sin los 12 de línea de eje/);

  const cab = valores(datos.filas[3]);
  const nota = cab.indexOf('Nota de precio');
  const total = cab.indexOf('Total');
  assert.equal(valores(datos.filas[4])[nota], '');
  assert.equal(valores(datos.filas[5])[nota], 'En conjunto');
  // Maderas usa un consumo de referencia: no se inventa un total.
  assert.equal(valores(datos.filas[6])[total], '');
});

test('el archivo pide entrar de ancho, repetir el encabezado y numerar páginas', () => {
  const hojas = hojasListaObra({ obra: '55-1 & 2', grupos: [{ nombre: 'X', filas: [fila()] }], fecha });
  const zip = unzipSync(armarXlsx(hojas));
  const libro = strFromU8(zip['xl/workbook.xml']);
  const hoja = strFromU8(zip['xl/worksheets/sheet1.xml']);

  assert.match(libro, /<definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;Para imprimir&apos;!\$4:\$4<\/definedName>/);
  assert.match(hoja, /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
  assert.match(hoja, /orientation="landscape" fitToWidth="1" fitToHeight="0"/);
  // El & del texto va doble para que Excel no lo tome como código del pie.
  assert.match(hoja, /<oddFooter>&amp;L&amp;8Obra 55-1 &amp;&amp; 2 · lista de materiales/);
  assert.match(hoja, /Página &amp;P de &amp;N<\/oddFooter>/);
});

test('una hoja sin opciones de impresión sale igual que antes', () => {
  const zip = unzipSync(armarXlsx([{ nombre: 'Hoja', filas: [['a']], anchos: [10] }]));
  const hoja = strFromU8(zip['xl/worksheets/sheet1.xml']);
  assert.doesNotMatch(hoja, /sheetPr|headerFooter/);
  assert.match(hoja, /<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
  assert.doesNotMatch(strFromU8(zip['xl/workbook.xml']), /definedNames/);
});
