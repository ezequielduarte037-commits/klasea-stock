import assert from 'node:assert/strict';
import test from 'node:test';
import { canPreviewAttachment, storageDownloadUrl } from './attachmentDownload.js';

test('uses the original filename in each storage bucket that holds plans', () => {
  const filenames = {
    'documentos': 'Pata de gallo Nº 2.dxf',
    'obra-archivos': 'Plano de instalación #4.pdf',
    'purchase-request-photos': 'Corte A+B & C.dwg',
  };

  for (const [bucket, filename] of Object.entries(filenames)) {
    const path = `/storage/v1/object/public/${bucket}/uploads/6a2a8c48.tmp`;
    const download = new URL(storageDownloadUrl(`https://storage.example${path}`, filename));
    assert.equal(download.pathname, path);
    assert.equal(download.searchParams.get('download'), filename);
  }
});

test('preserves the access token of an existing signed URL', () => {
  const url = 'https://storage.example/storage/v1/object/sign/documentos/plano.dxf?token=a%2Bb&download=old.dxf';
  const download = new URL(storageDownloadUrl(url, 'Plano nuevo.dxf'));
  assert.equal(download.searchParams.get('token'), 'a+b');
  assert.deepEqual(download.searchParams.getAll('download'), ['Plano nuevo.dxf']);
});

test('leaves external links and unnamed files to their caller', () => {
  assert.equal(storageDownloadUrl('https://supplier.example/plano.dxf', 'Plano.dxf'), null);
  assert.equal(storageDownloadUrl('https://storage.example/storage/v1/object/public/documentos/123.dxf', ''), null);
  assert.equal(storageDownloadUrl('not a URL', 'Plano.dxf'), null);
});

test('only shows a separate preview for formats the browser can display', () => {
  assert.equal(canPreviewAttachment('Plano.PDF'), true);
  assert.equal(canPreviewAttachment('Plano.png'), true);
  assert.equal(canPreviewAttachment('Plano.dxf'), false);
});
