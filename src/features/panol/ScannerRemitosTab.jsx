import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Upload,
  Usb,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { SEDES_PANOL } from "@/features/panol/panolApi";
import {
  archiveScannerFile,
  downloadScannerFile,
  fetchScannerFiles,
  fetchScannerHealth,
  getScannerPairingKey,
  launchScannerApp,
  openScannerFolder,
  saveScannerPairingKey,
} from "@/features/panol/scannerBridge";
import {
  archiveScannedReceipt,
  fetchScannedReceipts,
  processScannedReceipt,
  scannerReceiptFileUrl,
} from "@/features/panol/remitosScannerApi";
import AntesDeEscanearModal from "@/features/panol/AntesDeEscanearModal";
import { carpetaParaMostrar } from "@/features/panol/carpetaRemitos";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const STATUS_META = {
  pendiente: { label: "Pendiente", color: C.dim, soft: C.panel2, border: C.border },
  requiere_revision: { label: "Revisar coincidencias", color: C.amber, soft: C.amberL, border: C.amberB },
  listo_ingreso: { label: "Listo para ingresar", color: C.blue, soft: C.blueL, border: C.blueB },
  parcial: { label: "Ingreso parcial", color: C.violet, soft: C.violetL, border: C.violetB },
  ingresado: { label: "Ingresado", color: C.green, soft: C.greenL, border: C.greenB },
  error: { label: "Con error", color: C.red, soft: C.redL, border: C.redB },
  archivado: { label: "Archivado", color: C.dim, soft: C.panel2, border: C.border },
};

function fmtBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.pendiente;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      border: `1px solid ${meta.border}`,
      background: meta.soft,
      color: meta.color,
      borderRadius: 999,
      padding: "4px 8px",
      fontSize: 10.5,
      fontWeight: 900,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: meta.color }} />
      {meta.label}
    </span>
  );
}

function Button({ children, onClick, disabled = false, primary = false, title = "", style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: 36,
        border: `1px solid ${primary ? C.blueB : C.border2}`,
        background: primary ? C.blueL : C.panelSolid,
        color: primary ? C.blue : C.text,
        borderRadius: 9,
        padding: "8px 11px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontFamily: C.sans,
        fontSize: 12,
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, color, detail }) {
  return (
    <div style={{
      minWidth: 0,
      border: `1px solid ${C.border}`,
      background: C.panel,
      borderRadius: 11,
      padding: "10px 12px",
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}>
      <strong style={{ color, fontFamily: C.mono, fontSize: 18, lineHeight: 1 }}>{value}</strong>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>{label}</div>
        <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>
      </div>
    </div>
  );
}

export default function ScannerRemitosTab({
  profile,
  sedeLocked = null,
  canReceive = false,
  isMobile = false,
  onReview,
  onOpenIngreso,
}) {
  const toast = useToast();
  const manualInputRef = useRef(null);
  const profileSede = SEDES_PANOL.includes(profile?.sede) ? profile.sede : "";
  const [sede, setSede] = useState(sedeLocked || profileSede || "Chubut");
  const [health, setHealth] = useState(null);
  const [connected, setConnected] = useState(false);
  const [pairingCode, setPairingCode] = useState(() => getScannerPairingKey());
  const [localFiles, setLocalFiles] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [localError, setLocalError] = useState("");
  const [remoteError, setRemoteError] = useState("");
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [processingId, setProcessingId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [scanSource, setScanSource] = useState("glass");

  const loadRemote = useCallback(async () => {
    setLoadingRemote(true);
    setRemoteError("");
    try {
      setReceipts(await fetchScannedReceipts({ sede: sede || null }));
    } catch (error) {
      setRemoteError(error.message || "No se pudo cargar la bandeja de remitos.");
    } finally {
      setLoadingRemote(false);
    }
  }, [sede]);

  const loadLocal = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadingLocal(true);
    try {
      const nextHealth = await fetchScannerHealth();
      setHealth(nextHealth);
      const files = await fetchScannerFiles();
      setLocalFiles(files);
      setConnected(true);
      setLocalError("");
    } catch (error) {
      setConnected(false);
      setLocalFiles([]);
      setLocalError(error.message || "No se pudo conectar con el scanner.");
    } finally {
      if (!quiet) setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    loadLocal();
    const timer = window.setInterval(() => loadLocal({ quiet: true }), 3500);
    return () => window.clearInterval(timer);
  }, [loadLocal]);

  useEffect(() => { loadRemote(); }, [loadRemote]);

  const metrics = useMemo(() => ({
    local: localFiles.length,
    review: receipts.filter((row) => ["requiere_revision", "parcial"].includes(row.recepcion_estado)).length,
    ready: receipts.filter((row) => row.recepcion_estado === "listo_ingreso").length,
    done: receipts.filter((row) => row.recepcion_estado === "ingresado").length,
  }), [localFiles, receipts]);

  // Lo que la persona eligio en el modal. Se guarda para dos momentos
  // distintos: la carpeta la usa el puente al escanear, y el proveedor lo usa la
  // IA despues, cuando se procesa el archivo que llego.
  const [preguntando, setPreguntando] = useState(false);
  const [contextoEscaneo, setContextoEscaneo] = useState({ carpeta: "", proveedor: "", obra: null, titulo: "", notas: "", soloArchivar: false });

  async function connectBridge() {
    const key = saveScannerPairingKey(pairingCode);
    setPairingCode(key);
    if (!key) {
      toast.warning("Pegá el código que muestra Klasea Scanner en esta PC.");
      return;
    }
    await loadLocal();
  }

  function openBridgeDiagnostic() {
    window.open("http://127.0.0.1:17778/health", "_blank", "noopener,noreferrer");
  }

  async function processFile(file, localId = "") {
    if (!canReceive) {
      toast.error("Tu usuario no tiene permiso para ingresar remitos.");
      return;
    }
    if (!sede) {
      toast.warning("Elegí a qué sede corresponde el remito.");
      return;
    }
    const operationId = localId || `manual-${Date.now()}`;
    setProcessingId(operationId);
    try {
      const receipt = await processScannedReceipt(file, {
        sede,
        proveedor: contextoEscaneo.proveedor,
        obraId: contextoEscaneo.obra?.id || null,
        carpetaLocal: contextoEscaneo.carpeta || "",
        titulo: contextoEscaneo.titulo || "",
        notas: contextoEscaneo.notas || "",
        soloArchivar: Boolean(contextoEscaneo.soloArchivar),
      });
      if (localId) {
        try {
          await archiveScannerFile(localId);
        } catch (archiveError) {
          toast.warning(archiveError.message || "El remito se guardó, pero el archivo local no se pudo archivar.");
        }
      }
      await Promise.all([loadLocal({ quiet: true }), loadRemote()]);
      if (receipt.duplicate) {
        toast.success("Este remito ya estaba cargado. Abrimos el existente.");
        onReview?.(receipt);
        return;
      }
      // Con "solo archivar" el remito queda guardado y buscable, y no se abre el
      // ingreso: el que lo escaneo queria tener el papel en el sistema, no mover
      // stock. Abrirle el formulario igual seria pedirle que cancele algo que no
      // pidio.
      if (contextoEscaneo.soloArchivar) {
        toast.success(`Remito archivado${contextoEscaneo.obra?.codigo ? ` en ${contextoEscaneo.obra.codigo}` : ""}. Lo encontrás en Remitos.`);
        return;
      }
      toast.success("Remito leído. Revisá las coincidencias antes de ingresarlo.");
      onReview?.(receipt);
    } catch (error) {
      toast.error(error.message || "No se pudo leer el remito.");
    } finally {
      setProcessingId("");
    }
  }

  async function processLocal(row) {
    setProcessingId(row.id);
    try {
      const file = await downloadScannerFile(row);
      await processFile(file, row.id);
    } catch (error) {
      toast.error(error.message || "No se pudo tomar el archivo del scanner.");
      setProcessingId("");
    }
  }

  async function archiveLocal(row) {
    setArchivingId(`local-${row.id}`);
    try {
      await archiveScannerFile(row.id);
      await loadLocal({ quiet: true });
      toast.success("Archivo local archivado.");
    } catch (error) {
      toast.error(error.message || "No se pudo archivar el archivo local.");
    } finally {
      setArchivingId("");
    }
  }

  async function archiveRemote(row) {
    setArchivingId(`remote-${row.id}`);
    try {
      await archiveScannedReceipt(row.id);
      // Sale de la bandeja en el acto. El refresh posterior confirma el estado
      // remoto, pero una demora de red ya no deja un falso "Archivado" con el
      // botón de ingresar todavía visible.
      setReceipts((current) => current.filter((receipt) => receipt.id !== row.id));
      void loadRemote();
      toast.success("Documento archivado como no-remito. No modificó stock.");
    } catch (error) {
      toast.error(error.message || "No se pudo archivar el documento.");
    } finally {
      setArchivingId("");
    }
  }

  async function openOriginal(row) {
    try {
      const url = await scannerReceiptFileUrl(row.archivo_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error.message || "No se pudo abrir el remito.");
    }
  }

  // Antes de mover la lampara se pregunta que es: sin eso el remito cae en una
  // carpeta comun y la IA tiene que adivinar el proveedor.
  async function startScan() {
    setPreguntando(true);
  }

  async function escanearCon({ carpeta, proveedor, source, obra, titulo, notas, soloArchivar }) {
    setPreguntando(false);
    setContextoEscaneo({ carpeta, proveedor, obra, titulo, notas, soloArchivar });
    setScanSource(source);
    try {
      const result = await launchScannerApp(source, carpeta);
      setHealth((current) => ({
        ...(current || {}),
        scanning: result?.scanning !== false,
        scanStartedAt: result?.startedAt || new Date().toISOString(),
        lastError: "",
      }));
      toast.success(
        carpeta
          ? `Escaneando para ${obra?.codigo || "la obra"}. Se guarda en ${carpetaParaMostrar(carpeta)}.`
          : (result?.message || "Scanner abierto."),
      );
    } catch (error) {
      toast.error(error.message || "No se pudo abrir Pantum Scan.");
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg }}>
      {preguntando ? (
        <AntesDeEscanearModal
          onCerrar={() => setPreguntando(false)}
          onConfirmar={escanearCon}
          obraSugerida={contextoEscaneo.obra}
          proveedorSugerido={contextoEscaneo.proveedor}
          origenInicial={scanSource}
        />
      ) : null}
      <style>{`
        @media (max-width: 680px) {
          .panol-scanner-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: 1320, margin: "0 auto", padding: isMobile ? 12 : 18, boxSizing: "border-box", display: "grid", gap: 12 }}>
        <section style={{
          border: `1px solid ${connected ? C.greenB : C.border}`,
          background: C.panel,
          borderRadius: 14,
          padding: isMobile ? 13 : 16,
          display: "grid",
          gap: 13,
          ...GLASS,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, flexWrap: "wrap" }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${connected ? C.greenB : C.blueB}`, background: connected ? C.greenL : C.blueL, color: connected ? C.green : C.blue, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <ScanLine size={19} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Escanear remitos</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>
                Pantum M6559NW por USB · la IA lee el documento, pero Pañol confirma productos y cantidades antes de mover stock.
              </div>
            </div>
            {!sedeLocked && (
              <label style={{ display: "grid", gap: 4, color: C.dim, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>
                Sede de ingreso
                <select value={sede} onChange={(event) => setSede(event.target.value)} style={{ minWidth: 150, border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800, outline: "none" }}>
                  {SEDES_PANOL.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="panol-scanner-metrics" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(150px, 1fr))", gap: 8 }}>
            <Metric label="En esta PC" value={metrics.local} color={C.blue} detail="archivos sin procesar" />
            <Metric label="A revisar" value={metrics.review} color={C.amber} detail="coincidencias dudosas" />
            <Metric label="Listos" value={metrics.ready} color={C.violet} detail="para confirmar ingreso" />
            <Metric label="Ingresados" value={metrics.done} color={C.green} detail="con stock confirmado" />
          </div>

          <div style={{ border: `1px solid ${connected ? C.greenB : C.border}`, background: connected ? C.greenL : C.panelSolid, borderRadius: 11, padding: 11, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Usb size={17} style={{ color: connected ? C.green : C.dim, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 210 }}>
              <div style={{ color: connected ? C.green : C.text, fontSize: 12.5, fontWeight: 900 }}>
                {connected ? "Puente USB conectado" : health ? "Puente encontrado · falta vincularlo" : "Puente USB no detectado"}
              </div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                {connected
                  ? `${health?.folder || "Carpeta Pendientes"} · versión ${health?.version || "local"}`
                  : localError || "Abrí KlaseaScannerBridge en esta computadora."}
              </div>
            </div>
            {!connected && (
              <>
                <input
                  value={pairingCode}
                  onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                  placeholder="Código de vinculación"
                  autoComplete="off"
                  style={{ width: isMobile ? "100%" : 220, border: `1px solid ${C.border2}`, background: C.bg, color: C.text, borderRadius: 9, padding: "9px 10px", fontFamily: C.mono, fontSize: 12, outline: "none" }}
                />
                <Button onClick={connectBridge} primary>Vincular</Button>
              </>
            )}
            {!connected && !health && (
              <Button onClick={openBridgeDiagnostic} title="Comprobar que Chrome puede abrir el puente instalado en esta PC">
                <ExternalLink size={14} /> Probar puente
              </Button>
            )}
            <Button onClick={() => loadLocal()} disabled={loadingLocal} title="Actualizar conexión">
              <RefreshCw size={14} className={loadingLocal ? "spin" : ""} />
              Actualizar
            </Button>
          </div>

          {!connected && !health && (
            <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.text, borderRadius: 10, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
              <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                El instalador ya dejó el puente funcionando. Pegá el código y tocá <strong>Vincular</strong>. Si Chrome pregunta si Klase A puede buscar dispositivos en tu red local, elegí <strong>Permitir</strong>. Si no aparece el permiso, usá <strong>Probar puente</strong> y luego <strong>Actualizar</strong>.
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={scanSource}
              onChange={(event) => setScanSource(event.target.value)}
              disabled={!connected || health?.scanning}
              aria-label="Origen del remito"
              style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px", fontFamily: C.sans, fontSize: 12, fontWeight: 800, outline: "none" }}
            >
              <option value="feeder">Alimentador superior</option>
              <option value="glass">Vidrio</option>
            </select>
            <Button onClick={startScan} disabled={!connected || health?.scanning} primary style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
              {health?.scanning ? <LoaderCircle size={15} className="spin" /> : <ScanLine size={15} />}
              {health?.scanning ? "Escaneando…" : "Escanear remito"}
            </Button>
            <Button
              onClick={() => openScannerFolder({ carpeta: contextoEscaneo.carpeta }).catch((error) => toast.error(error.message))}
              disabled={!connected}
              title={contextoEscaneo.carpeta ? carpetaParaMostrar(contextoEscaneo.carpeta) : "Remitos\\Pendientes"}
            >
              <FolderOpen size={15} /> {contextoEscaneo.obra?.codigo ? `Carpeta ${contextoEscaneo.obra.codigo}` : "Carpeta Pendientes"}
            </Button>
            <Button onClick={() => manualInputRef.current?.click()}>
              <Upload size={15} /> Subir archivo manualmente
            </Button>
            <input
              ref={manualInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff,.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) processFile(file);
              }}
            />
          </div>

          {connected && health?.lastError && (
            <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>El último escaneo no pudo completarse.</strong> {health.lastError}</span>
            </div>
          )}
        </section>

        {connected && (
          <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9 }}>
              <FolderOpen size={15} style={{ color: C.blue }} />
              <div style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: 900 }}>Archivos encontrados en esta PC</div>
              <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{localFiles.length}</span>
            </div>
            {loadingLocal ? (
              <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 12 }}>Leyendo carpeta local…</div>
            ) : localFiles.length === 0 ? (
              <div style={{ padding: "22px 16px", textAlign: "center", color: health?.scanning ? C.blue : C.dim, fontSize: 12.5 }}>
                {health?.scanning
                  ? "La Pantum está escaneando. Completá la ventana del controlador y esperá a que aparezca el archivo."
                  : scanSource === "feeder"
                    ? "Poné el remito en el alimentador superior siguiendo el dibujo de la bandeja. Se escanea a 300 dpi y aparece acá como PDF."
                    : "Poné el remito sobre el vidrio siguiendo las marcas de la tapa. Se escanea a 300 dpi y aparece acá como PDF."}
              </div>
            ) : (
              <div style={{ display: "grid" }}>
                {localFiles.map((row) => (
                  <div key={row.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <FileText size={18} style={{ color: C.blue, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                      <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>{fmtBytes(row.size)} · {fmtDate(row.updatedAt)}</div>
                    </div>
                    <Button onClick={() => processLocal(row)} disabled={Boolean(processingId)} primary>
                      {processingId === row.id ? <LoaderCircle size={14} className="spin" /> : <Bot size={14} />}
                      {processingId === row.id ? "Leyendo…" : "Leer con IA"}
                    </Button>
                    <Button onClick={() => archiveLocal(row)} disabled={Boolean(archivingId)} title="Mover este archivo fuera de Pendientes">
                      {archivingId === `local-${row.id}` ? <LoaderCircle size={14} className="spin" /> : <Archive size={14} />}
                      Archivar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <FileCheck2 size={15} style={{ color: C.violet }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Bandeja de remitos digitalizados</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>El archivo queda archivado aunque todavía no se haya ingresado al stock.</div>
            </div>
            <Button onClick={loadRemote} disabled={loadingRemote}><RefreshCw size={14} /> Actualizar</Button>
          </div>

          {remoteError ? (
            <div style={{ margin: 12, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 800 }}>
              <AlertTriangle size={16} /> {remoteError}
            </div>
          ) : loadingRemote ? (
            <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12 }}>Cargando remitos…</div>
          ) : receipts.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.dim }}>
              <ShieldCheck size={28} style={{ color: C.green, marginBottom: 8 }} />
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>Todavía no hay remitos escaneados en {sede}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>El primer PDF procesado queda guardado acá para auditoría.</div>
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {receipts.map((row) => {
                const linked = (row.items || []).filter((item) => item.material_id).length;
                const total = row.items?.length || 0;
                const processed = (row.items || []).filter((item) => item.scanner_ingreso_envio_id).length;
                const done = row.recepcion_estado === "ingresado";
                const archived = row.recepcion_estado === "archivado";
                return (
                  <article key={row.id} style={{ padding: isMobile ? 12 : "12px 14px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: done ? C.greenL : C.violetL, border: `1px solid ${done ? C.greenB : C.violetB}`, color: done ? C.green : C.violet, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {done ? <CheckCircle2 size={17} /> : <FileText size={17} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 210 }}>
                        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>
                          {row.proveedor || "Proveedor sin identificar"}{row.numero ? ` · Remito ${row.numero}` : ""}
                        </div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                          {row.sede || "Sin sede"} · {fmtDate(row.created_at)} · {total} renglón{total === 1 ? "" : "es"}
                        </div>
                      </div>
                      {statusPill(row.recepcion_estado)}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: linked === total ? C.green : C.amber, background: linked === total ? C.greenL : C.amberL, border: `1px solid ${linked === total ? C.greenB : C.amberB}`, borderRadius: 999, padding: "4px 8px", fontSize: 10.5, fontWeight: 850 }}>
                        {linked}/{total} vinculados al catálogo
                      </span>
                      {processed > 0 && !done && (
                        <span style={{ color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "4px 8px", fontSize: 10.5, fontWeight: 850 }}>
                          {processed}/{total} ya ingresados
                        </span>
                      )}
                      <span style={{ color: C.dim, fontSize: 11, flex: 1, minWidth: 160 }}>
                        {done ? "Ingreso confirmado y documento asociado." : linked === total ? "Revisá cantidades y destino antes de confirmar." : "Elegí el producto correcto en los renglones dudosos."}
                      </span>
                      <Button onClick={() => openOriginal(row)}><ExternalLink size={13} /> Original</Button>
                      {!done && !archived && (
                        <Button onClick={() => archiveRemote(row)} disabled={Boolean(archivingId)} title="Ocultar este documento porque no corresponde a un remito">
                          {archivingId === `remote-${row.id}` ? <LoaderCircle size={13} className="spin" /> : <Archive size={13} />}
                          No es un remito
                        </Button>
                      )}
                      {archived ? null : done && row.panol_envio_id ? (
                        <Button onClick={() => onOpenIngreso?.(row.panol_envio_id)} primary>Ver ingreso</Button>
                      ) : (
                        <Button onClick={() => onReview?.(row)} disabled={!canReceive} primary>Revisar e ingresar</Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
