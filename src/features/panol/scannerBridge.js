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

async function localRequest(path, { method = "GET", key = scannerKey(), timeout = 3500 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${SCANNER_URL}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: key ? { "X-KlaseA-Scanner-Key": key } : {},
    });
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("El puente del scanner no respondió. Revisá que esté abierto en esta PC.");
    }
    if (error instanceof TypeError) {
      throw new Error("No se encontró el puente del scanner en esta PC.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
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

export async function launchScannerApp(source = "feeder") {
  const normalizedSource = source === "glass" ? "glass" : "feeder";
  const response = await localRequest(`/scan?source=${normalizedSource}`, { method: "POST", timeout: 12_000 });
  return response.json();
}

export async function openScannerFolder() {
  const response = await localRequest("/open-folder", { method: "POST" });
  return response.json();
}
