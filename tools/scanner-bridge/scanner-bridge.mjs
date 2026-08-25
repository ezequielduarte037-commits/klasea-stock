import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, basename, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 17778;
const VERSION = "1.2.1";
const SCAN_TIMEOUT_MS = 90_000;
const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url));
const SCAN_SCRIPT = join(BRIDGE_DIR, "escanear-remito.ps1");
const PENDING = "C:\\KlaseA\\Remitos\\Pendientes";
const ARCHIVED = "C:\\KlaseA\\Remitos\\Procesados";
const CONFIG = join(process.env.LOCALAPPDATA || process.env.USERPROFILE || "C:\\KlaseA", "KlaseA", "Scanner");
const KEY_FILE = join(CONFIG, "scanner.key");
const PAIRING_FILE = join(CONFIG, "codigo-vinculacion.txt");
const SCAN_ERROR_FILE = join(CONFIG, "ultimo-error.txt");
const ALLOWED = new Set([".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"]);
const MIME = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

for (const folder of [PENDING, ARCHIVED, CONFIG]) mkdirSync(folder, { recursive: true });

function loadKey() {
  if (existsSync(KEY_FILE)) {
    const saved = readFileSync(KEY_FILE, "utf8").trim().toUpperCase();
    if (saved.length >= 12) return saved;
  }
  const key = randomBytes(8).toString("hex").toUpperCase();
  writeFileSync(KEY_FILE, key, "utf8");
  writeFileSync(PAIRING_FILE, `KLASE A - SCANNER DE REMITOS\r\n\r\nCodigo de vinculacion: ${key}\r\n`, "utf8");
  return key;
}

const pairingKey = loadKey();
let scanProcess = null;
let scanTimeout = null;
let scanStartedAt = null;
let lastScanStatus = "idle";
let scanSource = null;

function saveScanError(message) {
  try {
    writeFileSync(SCAN_ERROR_FILE, message, "utf8");
  } catch (error) {
    console.error("No se pudo guardar el diagnóstico del scanner:", error);
  }
}

function fileId(path, stats) {
  return createHash("sha256").update(`${path}|${stats.size}|${stats.mtimeMs}`).digest("hex").slice(0, 24);
}

function pendingFiles() {
  const now = Date.now();
  return readdirSync(PENDING, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ALLOWED.has(extname(entry.name).toLowerCase()))
    .map((entry) => {
      const path = join(PENDING, entry.name);
      const stats = statSync(path);
      return { path, stats, name: entry.name };
    })
    .filter((row) => row.stats.size > 0 && now - row.stats.mtimeMs > 1000)
    .sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs)
    .map((row) => ({
      id: fileId(row.path, row.stats),
      name: row.name,
      size: row.stats.size,
      createdAt: row.stats.birthtime.toISOString(),
      updatedAt: row.stats.mtime.toISOString(),
      mimeType: MIME[extname(row.name).toLowerCase()] || "application/octet-stream",
      path: row.path,
    }));
}

function allowedOrigin(origin = "") {
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:"
      && (url.hostname === "klasea-stock.vercel.app"
        || (url.hostname.endsWith(".vercel.app") && url.hostname.includes("klasea-stock")));
  } catch {
    return false;
  }
}

function cors(req, res) {
  const origin = req.headers.origin || "";
  if (allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-KlaseA-Scanner-Key");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Cache-Control", "no-store");
}

function authorized(req) {
  const supplied = String(req.headers["x-klasea-scanner-key"] || "").trim().toUpperCase();
  if (supplied.length !== pairingKey.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(pairingKey));
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length });
  res.end(payload);
}

function findFile(id) {
  return pendingFiles().find((row) => row.id === id) || null;
}

function uniqueArchive(name) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/[TZ.]/g, "-").slice(0, 15);
  let path = join(ARCHIVED, `${stamp}-${basename(name)}`);
  if (!existsSync(path)) return path;
  path = join(ARCHIVED, `${stamp}-${randomBytes(4).toString("hex")}-${basename(name)}`);
  return path;
}

function launch(command, args = [], { windowsHide = false } = {}) {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide });
  child.unref();
}

function clearScanTimeout() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = null;
}

function stopProcessTree(pid) {
  if (!pid) return;
  const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  killer.unref();
}

function launchScanner(requestedSource = "glass") {
  const source = requestedSource === "glass" ? "glass" : "feeder";
  if (scanProcess) {
    return {
      message: "Ya hay un escaneo en curso.",
      startedAt: scanStartedAt,
      source: scanSource,
    };
  }

  if (existsSync(SCAN_SCRIPT)) {
    if (existsSync(SCAN_ERROR_FILE)) unlinkSync(SCAN_ERROR_FILE);
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", SCAN_SCRIPT, "-Destination", PENDING, "-Source", source],
      { detached: false, stdio: "ignore", windowsHide: true },
    );
    scanProcess = child;
    scanStartedAt = new Date().toISOString();
    scanSource = source;
    lastScanStatus = "scanning";
    scanTimeout = setTimeout(() => {
      if (scanProcess !== child) return;
      lastScanStatus = "error";
      saveScanError("La Pantum no respondio en 90 segundos. Despertala, revisa el cable USB y volve a intentar.");
      stopProcessTree(child.pid);
      scanProcess = null;
      scanTimeout = null;
    }, SCAN_TIMEOUT_MS);

    child.once("error", (error) => {
      clearScanTimeout();
      lastScanStatus = "error";
      saveScanError(error.message || "No se pudo iniciar el scanner.");
      if (scanProcess === child) scanProcess = null;
    });
    child.once("close", (code) => {
      clearScanTimeout();
      if (scanProcess !== child) return;
      lastScanStatus = code === 0 ? "completed" : "error";
      if (code !== 0 && !existsSync(SCAN_ERROR_FILE)) {
        saveScanError("El controlador Pantum cerró el escaneo sin generar una imagen.");
      }
      scanProcess = null;
    });

    return {
      message: "Escaneo iniciado. Seguí la ventana de Pantum y esperá a que termine.",
      startedAt: scanStartedAt,
      source,
    };
  }

  const wia = join(process.env.WINDIR || "C:\\Windows", "System32", "wiaacmgr.exe");
  if (existsSync(wia)) {
    launch(wia);
    return {
      message: "Asistente de escaneo abierto. Elegí la Pantum y guardá el archivo en Pendientes.",
      startedAt: new Date().toISOString(),
    };
  }
  throw new Error("No encontré el asistente de scanner de Windows.");
}

const server = createServer((req, res) => {
  try {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    if (url.pathname === "/health" && req.method === "GET") {
      json(res, 200, {
        ok: true,
        version: VERSION,
        folder: PENDING,
        pending: pendingFiles().length,
        pairingRequired: true,
        keyHint: pairingKey.slice(-4),
        lastError: existsSync(SCAN_ERROR_FILE) ? readFileSync(SCAN_ERROR_FILE, "utf8").trim() : "",
        scanning: Boolean(scanProcess),
        scanStartedAt,
        lastScanStatus,
        scanSource,
      });
      return;
    }

    if (!authorized(req)) {
      json(res, 401, { error: "Código de vinculación incorrecto." });
      return;
    }

    if (url.pathname === "/files" && req.method === "GET") {
      json(res, 200, { files: pendingFiles().map(({ path: _path, ...row }) => row) });
      return;
    }

    if (url.pathname.startsWith("/files/") && req.method === "GET") {
      const row = findFile(decodeURIComponent(url.pathname.slice(7)));
      if (!row) {
        json(res, 404, { error: "El archivo ya no está en Pendientes." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": row.mimeType,
        "Content-Length": row.size,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      });
      createReadStream(row.path).pipe(res);
      return;
    }

    if (url.pathname.startsWith("/archive/") && req.method === "POST") {
      const row = findFile(decodeURIComponent(url.pathname.slice(9)));
      if (!row) {
        json(res, 404, { error: "El archivo ya fue movido." });
        return;
      }
      const destination = uniqueArchive(row.name);
      renameSync(row.path, destination);
      json(res, 200, { ok: true, archived: basename(destination) });
      return;
    }

    if (url.pathname === "/open-folder" && req.method === "POST") {
      launch("explorer.exe", [PENDING]);
      json(res, 200, { ok: true, folder: PENDING });
      return;
    }

    if (url.pathname === "/scan" && req.method === "POST") {
      const scan = launchScanner(url.searchParams.get("source") || "glass");
      json(res, 200, { ok: true, ...scan, scanning: Boolean(scanProcess), folder: PENDING });
      return;
    }

    json(res, 404, { error: "Ruta inexistente." });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Error local del scanner." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\n  KLASE A · Scanner de remitos USB");
  console.log("  ---------------------------------");
  console.log(`  Puente      : http://127.0.0.1:${PORT}`);
  console.log(`  Pendientes  : ${PENDING}`);
  console.log(`  Vinculación : ${pairingKey}`);
  console.log(`  Copia código: ${PAIRING_FILE}\n`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
