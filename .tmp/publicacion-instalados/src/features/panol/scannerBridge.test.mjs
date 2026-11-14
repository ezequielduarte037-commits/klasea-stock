import test from "node:test";
import assert from "node:assert/strict";
import { archiveScannerFile, scanReceiptFromDevice, saveScannerPairingKey } from "./scannerBridge.js";

function entorno(t, handler) {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const storage = new Map([["klasea.panol.scanner.key", "ABCDEF1234567890"]]);
  globalThis.window = {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: (fn, ms) => setTimeout(fn, ms === 1200 ? 0 : ms), clearTimeout,
  };
  const llamadas = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    llamadas.push({ url, path, options });
    return handler(path, options);
  };
  t.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; });
  return llamadas;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("escanea en la carpeta de consumibles y no toma un remito nuevo de otra obra", async (t) => {
  const viejo = { id: "anterior", carpeta: "Consumibles\\Chubut" };
  const ajeno = { id: "otra-obra", carpeta: "K55\\55-4", updatedAt: "2026-10-30T17:00:00Z" };
  const propio = { id: "nuevo", carpeta: "Consumibles\\Chubut", name: "remito.pdf", mimeType: "application/pdf", updatedAt: "2026-10-30T16:00:00Z" };
  let consultas = 0;
  const llamadas = entorno(t, (path) => {
    if (path === "/files") return json({ files: ++consultas === 1 ? [viejo] : consultas === 2 ? [viejo, ajeno] : [viejo, ajeno, propio] });
    if (path === "/health") return json({ scanning: true });
    if (path === "/scan") return json({ ok: true });
    if (path === "/files/nuevo") return new Response("%PDF-fixture", { headers: { "Content-Type": "application/pdf" } });
    assert.fail(`Solicitud inesperada ${path}`);
  });
  const { row, file } = await scanReceiptFromDevice("glass", { carpeta: "Consumibles/Chubut", timeoutMs: 1000 });
  assert.equal(row.id, "nuevo");
  assert.equal(file.name, "remito.pdf");
  assert.equal(file.type, "application/pdf");
  assert.equal(await file.text(), "%PDF-fixture");
  assert.equal(consultas, 3);
  assert.ok(llamadas.some((c) => c.url.endsWith("/scan?source=glass&carpeta=Consumibles%2FChubut")));
  assert.ok(!llamadas.some((c) => c.path.startsWith("/archive/")), "escanear y leer nunca archiva el original");
  assert.equal(llamadas[0].options.headers["X-KlaseA-Scanner-Key"], "ABCDEF1234567890");
});

test("un fallo del dispositivo conserva el diagnóstico y no descarga otro archivo", async (t) => {
  entorno(t, (path) => path === "/files" ? json({ files: [] }) : path === "/scan" ? json({ ok: true }) : json({ scanning: false, lastScanStatus: "error", lastError: "Pantum desconectada" }));
  await assert.rejects(scanReceiptFromDevice("feeder", { carpeta: "Consumibles/Pampa" }), /Pantum desconectada/);
});

test("código incorrecto no inicia el escaneo", async (t) => {
  const llamadas = entorno(t, () => json({ error: "Código de vinculación incorrecto." }, 401));
  await assert.rejects(scanReceiptFromDevice(), /Código de vinculación incorrecto/);
  assert.equal(llamadas.length, 1);
});

test("archivar es una acción explícita separada del escaneo", async (t) => {
  const llamadas = entorno(t, () => json({ ok: true }));
  await archiveScannerFile("id local");
  assert.equal(llamadas[0].path, "/archive/id%20local");
  assert.equal(llamadas[0].options.method, "POST");
  assert.equal(saveScannerPairingKey("abcd ef12 3456 7890"), "ABCDEF1234567890");
});
