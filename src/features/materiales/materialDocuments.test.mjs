import test from 'node:test';
import assert from 'node:assert/strict';
import { documentToMaterialLink, normalizeMaterialDocuments, mergeDocumentAttachments } from './productDocuments.js';

const file = { name: 'Comando babor.dxf', url: 'https://example.com/babor.dxf', path: 'requests/file.dxf', type: 'application/octet-stream', size: 1200 };
test('el plano conserva sus metadatos y se limita a la línea correcta', () => {
  const link = documentToMaterialLink(file, '37');
  assert.deepEqual(normalizeMaterialDocuments([link], '37-41')[0], { ...file, linea: '37' });
  assert.equal(normalizeMaterialDocuments([link], 'K37').length, 1);
  assert.equal(normalizeMaterialDocuments([link], '55-4').length, 0);
  assert.equal(documentToMaterialLink(file, 'K37-41').linea, '37');
  assert.equal(normalizeMaterialDocuments([documentToMaterialLink(file, '37-41')], '37-43').length, 1);
});
test('un archivo general aparece en cualquier línea y se omiten enlaces ajenos o activos', () => {
  const links = [documentToMaterialLink(file), { url: 'https://example.com/web' }, { kind: 'documento', url: 'javascript:alert(1)' }];
  assert.equal(normalizeMaterialDocuments(links, '52-27').length, 1);
  assert.throws(() => documentToMaterialLink({ url: 'javascript:alert(1)' }));
});
test('los adjuntos del pedido no se duplican al heredar un plano del catálogo', () => {
  const copy = documentToMaterialLink(file, '37');
  assert.equal(mergeDocumentAttachments([file], normalizeMaterialDocuments([copy], '37')).length, 1);
  assert.equal(normalizeMaterialDocuments([copy, copy]).length, 1);
});
