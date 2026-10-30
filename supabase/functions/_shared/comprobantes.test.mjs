import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (key) => key === 'OPENROUTER_API_KEY' ? 'test-key' : undefined } };
const { extraerComprobantePDF, extraerComprobanteImagen, extraerComprobanteTexto, OpenRouterRequestError } = await import('./openai.ts');
const documento = { tipo_documento: 'remito', es_comprobante: true, proveedor: 'Rebollar', numero: 'R-123', items: [{ codigo: 'M0047', descripcion: 'Tornillo 4 x 20', cantidad: 3, unidad: 'caja' }] };
const respuesta = (content = documento, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }));
const saturado = () => new Response(JSON.stringify({ error: { message: 'Failed to parse the file: The document parsing engine is currently rate limited. Please retry shortly.' } }), { status: 400 });
const pdf = () => extraerComprobantePDF({ base64: 'fixture', proveedorConocido: 'Rebollar' });
async function simular(t, respuestas, run) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (_url, opts) => {
    llamadas.push(JSON.parse(opts.body));
    assert.ok(opts.signal, 'toda llamada tiene límite de tiempo');
    const next = respuestas.shift();
    assert.ok(next, 'no hacer llamadas adicionales');
    return next();
  };
  t.after(() => { globalThis.fetch = original; });
  await run(llamadas);
  assert.equal(respuestas.length, 0);
}

test('JSON cortado: reintenta PDF nativo antes de usar OCR y aumenta el límite de salida', async t => {
  await simular(t, [() => respuesta('{"items":[', 'length'), () => respuesta()], async llamadas => {
    const d = await pdf();
    assert.equal(d.items[0].codigo, 'M0047');
    assert.deepEqual(llamadas.map(x => x.plugins[0].pdf.engine), ['native', 'native']);
    assert.deepEqual(llamadas.map(x => x.max_tokens), [16000, 32000]);
  });
});
test('JSON inválido sin finish_reason length también se reintenta', async t => {
  await simular(t, [() => respuesta('{"proveedor":"REBOLLAR'), () => respuesta()], async llamadas => {
    assert.equal((await pdf()).items.length, 1);
    assert.equal(llamadas.length, 2);
  });
});
test('saturación del parser informada como 400 se reintenta', async t => {
  await simular(t, [saturado, () => respuesta()], async () => assert.equal((await pdf()).numero, 'R-123'));
});
test('la secuencia real JSON inválido + OCR saturado conserva la causa y no accede a null.items', async t => {
  await simular(t, [() => respuesta('null'), () => respuesta('null'), saturado, saturado], async llamadas => {
    await assert.rejects(pdf, e => e instanceof OpenRouterRequestError && e.code === 'parser_rate_limited');
    assert.deepEqual(llamadas.map(x => x.plugins[0].pdf.engine), ['native', 'native', 'mistral-ocr', 'mistral-ocr']);
  });
});
test('PDF escaneado: texto vacío y OCR recupera los renglones', async t => {
  await simular(t, [() => respuesta({ ...documento, items: [] }), () => respuesta()], async () => assert.equal((await pdf()).items[0].cantidad, 3));
});
test('PDF sin productos y OCR fallido no se devuelve como éxito vacío', async t => {
  await simular(t, [() => respuesta({ ...documento, items: [] }), saturado, saturado], async () => {
    await assert.rejects(pdf, e => e instanceof OpenRouterRequestError && e.code === 'parser_rate_limited');
  });
});
test('PDF nativo con renglones legibles y emisor ausente no paga un segundo parser para el membrete', async t => {
  await simular(t, [() => respuesta({ ...documento, proveedor: null })], async llamadas => {
    const d = await extraerComprobantePDF({ base64: 'fixture' });
    assert.equal(d.items.length, 1);
    assert.equal(d.proveedor, null);
    assert.equal(llamadas[0].plugins[0].pdf.engine, 'native');
  });
});

test('PDF de Rebollar se manda completo a Gemini sin depender del parser externo', async t => {
  await simular(t, [() => respuesta()], async llamadas => {
    const d = await pdf();
    assert.equal(d.numero, 'R-123');
    assert.equal(llamadas[0].plugins[0].pdf.engine, 'native');
    assert.equal(llamadas[0].messages[1].content[1].file.file_data, 'data:application/pdf;base64,fixture');
  });
});

test('una fila null de la IA reintenta la lectura completa en vez de fallar al normalizar', async t => {
  await simular(t, [() => respuesta({ ...documento, items: [null] }), () => respuesta()], async () => {
    assert.equal((await pdf()).items[0].codigo, 'M0047');
  });
});

test('modelos sin PDF nativo conservan parser de texto compatible y recuperación por OCR', async t => {
  const getOriginal = Deno.env.get;
  Deno.env.get = (key) => key === 'OPENROUTER_MODEL_EXTRACT' ? 'openai/gpt-4o' : getOriginal(key);
  let extraerSinNativo;
  try { ({ extraerComprobantePDF: extraerSinNativo } = await import('./openai.ts?modelo-sin-pdf-nativo')); }
  finally { Deno.env.get = getOriginal; }
  await simular(t, [() => respuesta({ ...documento, items: [] }), () => respuesta()], async llamadas => {
    assert.equal((await extraerSinNativo({ base64: 'fixture', proveedorConocido: 'Rebollar' })).items[0].codigo, 'M0047');
    assert.deepEqual(llamadas.map(x => x.plugins[0].pdf.engine), ['cloudflare-ai', 'mistral-ocr']);
  });
});
test('crédito agotado falla directamente, sin pagar otra vía de OCR', async t => {
  await simular(t, [() => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 })], async () => {
    await assert.rejects(pdf, e => e instanceof OpenRouterRequestError && e.status === 402);
  });
});
test('un documento clasificado como otro no dispara OCR para inventar productos', async t => {
  await simular(t, [() => respuesta({ tipo_documento: 'otro', es_comprobante: false, items: [] })], async () => assert.deepEqual((await pdf()).items, []));
});
test('foto y texto conservan código y unidad para emparejar el catálogo de consumibles', async t => {
  await simular(t, [() => respuesta(), () => respuesta()], async () => {
    for (const d of [await extraerComprobanteImagen({ base64: 'fixture', mimeType: 'image/jpeg' }), await extraerComprobanteTexto({ text: 'remito de prueba' })]) {
      assert.equal(d.items[0].codigo, 'M0047');
      assert.equal(d.items[0].unidad, 'caja');
    }
  });
});
test('acepta un objeto completo rodeado solo por fences de markdown', async t => {
  await simular(t, [() => respuesta('```json\n' + JSON.stringify(documento) + '\n```')], async () => assert.equal((await pdf()).items.length, 1));
});
