const SCANNER_URL = "http://127.0.0.1:17778";
const KEY_STORAGE = "klasea.panol.scanner.key";

function scannerKey() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(KEY_STORAGE) || "").trim().toUpperCase();
}

export function getScannerPairingKey() {
  return scannerKey();
}

export function saveScannerPairingKey(value) {
  const key = String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (typeof window !== "undefined") {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  }
  return key;
}

// El puente vive en 127.0.0.1, que para el navegador es "loopback", NO "local".
// Chrome renombro los espacios de direcciones a mitad de camino: con Private
// Network Access "local" significaba el loopback, y desde Local Network Access
// (Chrome 138+) "local" pasó a ser la red privada y el loopback se llama
// "loopback". Si la anotación no coincide con el destino real, el pedido muere
// con TypeError antes de salir a la red, aunque el permiso esté concedido.
//
// Como no se puede saber de antemano qué versión corre en cada PC del pañol, se
// prueban en orden -incluido sin anotación, para los Chrome que no la
// implementan- y se recuerda cuál funcionó para no repetir el tanteo.
const ESPACIOS_A_PROBAR = ["loopback", "local", null];
let espacioElegido = null;
let espacioResuelto = false;

async function pedirAlPuente(url, opcionesBase, espacio, timeout) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const opciones = { ...opcionesBase, signal: controller.signal };
    if (espacio) opciones.targetAddressSpace = espacio;
    return await fetch(url, opciones);
  } finally {
    window.clearTimeout(timer);
  }
}

async function localRequest(path, { method = "GET", key = scannerKey(), timeout = 3500 } = {}) {
  const url = `${SCANNER_URL}${path}`;
  const opcionesBase = {
    method,
    cache: "no-store",
    mode: "cors",
    credentials: "omit",
    headers: key ? { "X-KlaseA-Scanner-Key": key } : {},
  };

  const candidatos = espacioResuelto ? [espacioElegido] : ESPACIOS_A_PROBAR;
  let response = null;
  let ultimoError = null;

  for (const espacio of candidatos) {
    try {
      response = await pedirAlPuente(url, opcionesBase, espacio, timeout);
      espacioElegido = espacio;
      espacioResuelto = true;
      break;
    } catch (error) {
      ultimoError = error;
      response = null;
      // Si el puente no contesta, cambiar la anotación no arregla nada.
      if (error?.name === "AbortError") break;
    }
  }

  if (!response) {
    if (ultimoError?.name === "AbortError") {
      throw new Error("El puente del scanner no respondió. Revisá que esté abierto en esta PC.");
    }
    throw new Error("Chrome no pudo acceder al puente local. Revisá que el puente esté abierto en esta PC y reintentá.");
  }

  if (!response.ok) {
    let message = "";
    try {
      const data = await response.json();
      message = data?.error || data?.message || "";
    } catch { /* respuesta sin JSON */ }
    const error = new Error(message || `Scanner local: error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function fetchScannerHealth() {
  const response = await localRequest("/health", { key: "", timeout: 1800 });
  return response.json();
}

export async function fetchScannerFiles() {
  const response = await localRequest("/files");
  const data = await response.json();
  return Array.isArray(data?.files) ? data.files : [];
}

export async function downloadScannerFile(row) {
  if (!row?.id) throw new Error("El archivo del scanner no tiene identificador.");
  const response = await localRequest(`/files/${encodeURIComponent(row.id)}`, { timeout: 30_000 });
  const blob = await response.blob();
  return new File([blob], row.name || "remito.pdf", {
    type: row.mimeType || blob.type || "application/pdf",
    lastModified: row.updatedAt ? new Date(row.updatedAt).getTime() : Date.now(),
  });
}

export async function archiveScannerFile(id) {
  if (!id) return;
  await localRequest(`/archive/${encodeURIComponent(id)}`, { method: "POST", timeout: 8000 });
}

export async function launchScannerApp(source = "glass") {
  const normalizedSource = source === "glass" ? "glass" : "feeder";
  const response = await localRequest(`/scan?source=${normalizedSource}`, { method: "POST", timeout: 12_000 });
  return response.json();
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// Tiene que ser mayor que el SCAN_TIMEOUT_MS del puente (180s): si la web se
// rinde primero, el escaneo sigue vivo y el PDF aparece cuando ya nadie mira.
export async function scanReceiptFromDevice(source = "glass", { timeoutMs = 200_000 } = {}) {
  const before = await fetchScannerFiles();
  const previousIds = new Set(before.map((row) => row.id));
  await launchScannerApp(source);

  const deadline = Date.now() + timeoutMs;
  let lastStatus = "scanning";
  while (Date.now() < deadline) {
    await wait(1200);
    const [files, health] = await Promise.all([fetchScannerFiles(), fetchScannerHealth()]);
    const created = files
      .filter((row) => !previousIds.has(row.id))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
    if (created) {
      return { row: created, file: await downloadScannerFile(created) };
    }

    lastStatus = health?.lastScanStatus || lastStatus;
    if (!health?.scanning && lastStatus === "error") {
      throw new Error(health?.lastError || "El scanner terminó sin generar un archivo.");
    }
    if (!health?.scanning && lastStatus === "completed") {
      throw new Error("El scanner terminó, pero no apareció el PDF. Revisá la carpeta Pendientes.");
    }
  }
  throw new Error("El escaneo demoró demasiado. Revisá la Pantum y volvé a intentar.");
}

export async function openScannerFolder() {
  const response = await localRequest("/open-folder", { method: "POST" });
  return response.json();
}
