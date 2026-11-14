import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateObraGroups, toggleObraSelection, obraPageNumbers } from './obraListaPresentation.js';

const rows = Array.from({ length: 1585 }, (_, index) => Object.freeze({ id: `material-${index + 1}`, descripcion: `Material ${index + 1}` }));
const groups = [{ label: 'Plomería', rows: rows.slice(0, 37) }, { label: 'Electricidad', rows: rows.slice(37, 802) }, { label: 'Herrajes', rows: rows.slice(802) }];

test('1,585 items are paginated once, across group boundaries, without changing source rows', () => {
  const rendered = [];
  for (let page = 1; page <= 32; page++) {
    const result = paginateObraGroups(groups, page);
    const pageRows = result.groups.flatMap((group) => group.rows);
    assert(pageRows.length <= 50);
    assert.equal(result.pageCount, 32);
    rendered.push(...pageRows);
  }
  assert.deepEqual(rendered, rows);
  assert.equal(new Set(rendered.map((row) => row.id)).size, 1585);
  const first = paginateObraGroups(groups, 1);
  assert.equal(first.groups[1].rows.length, 13);
  assert.equal(first.groups[1].allRows.length, 765);
  assert.equal(paginateObraGroups(groups, 32).start, 1551);
  assert.equal(paginateObraGroups(groups, 32).end, 1585);
});

test('shrinking results clamps page; empty, small, invalid and boundary pages remain valid', () => {
  assert.deepEqual(paginateObraGroups([], 99), { groups: [], page: 1, pageCount: 1, total: 0, start: 0, end: 0 });
  assert.equal(paginateObraGroups([{ label: 'X', rows: rows.slice(0, 1) }], 32).page, 1);
  assert.equal(paginateObraGroups(groups, -2).page, 1);
  assert.equal(paginateObraGroups(groups, 'invalid').page, 1);
  assert.equal(paginateObraGroups(groups, 9000).page, 32);
});

test('page and group selection preserve selections outside their scope', () => {
  const pageOne = paginateObraGroups(groups, 1).groups.flatMap((group) => group.rows);
  const pageTwo = paginateObraGroups(groups, 2).groups.flatMap((group) => group.rows);
  const original = new Set(['other-filter']);
  const first = toggleObraSelection(original, pageOne);
  const both = toggleObraSelection(first, pageTwo);
  assert.equal(both.size, 101);
  assert.deepEqual([...original], ['other-filter']);
  const remaining = toggleObraSelection(both, pageOne);
  assert.equal(remaining.size, 51);
  assert(remaining.has('other-filter'));
  const entireGroup = toggleObraSelection(remaining, groups[1].rows);
  assert(groups[1].rows.every((row) => entireGroup.has(row.id)));
  assert.equal(toggleObraSelection(entireGroup, groups[1].rows).size, 1);
});

test('compact pagination includes the current page, neighbors and ends with no duplicates', () => {
  assert.deepEqual(obraPageNumbers(1, 1), [1]);
  assert.deepEqual(obraPageNumbers(5, 32), [1, 4, 5, 6, 32]);
  assert.deepEqual(obraPageNumbers(32, 32), [1, 31, 32]);
});

test('"Sin rubro", "Sin categoría" y vacío son el mismo grupo', async () => {
  const { rubroDeFila } = await import('./obraListaPresentation.js');
  assert.equal(rubroDeFila({ rubro: '' }), 'Sin rubro');
  assert.equal(rubroDeFila({ rubro: 'Sin categoría' }), 'Sin rubro');
  assert.equal(rubroDeFila({ rubro: 'Electricidad' }), 'Electricidad');
});

test('los grupos van alfabéticos con los "Sin …" al final', async () => {
  const { compararEtiquetaGrupo } = await import('./obraListaPresentation.js');
  const orden = ['Vidrios', 'Sin rubro', 'Broncería', 'electricidad', 'Sin proveedor'].sort(compararEtiquetaGrupo);
  assert.deepEqual(orden, ['Broncería', 'electricidad', 'Vidrios', 'Sin proveedor', 'Sin rubro']);
});

test('ordenar por columna deja lo vacío al final en las dos direcciones', async () => {
  const { ordenarFilas } = await import('./obraListaPresentation.js');
  const filas = [{ id: 1, precio: 5 }, { id: 2, precio: null }, { id: 3, precio: 2 }];
  assert.deepEqual(ordenarFilas(filas, { key: 'precio', dir: 1 }).map((f) => f.id), [3, 1, 2]);
  assert.deepEqual(ordenarFilas(filas, { key: 'precio', dir: -1 }).map((f) => f.id), [1, 3, 2]);
  assert.equal(ordenarFilas(filas, { key: '' }), filas);
});
