import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Inbox,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ScanLine,
  Trash2,
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
  archivarRemito,
  borrarRemitoEscaneado,
  fetchScannedReceipts,
  leerRemitoConIA,
  remitoSinLeer,
  scannerReceiptFileUrl,
} from "@/features/panol/remitosScannerApi";
import AntesDeEscanearModal from "@/features/panol/AntesDeEscanearModal";
import {
  fetchCarpetasUsadas,
  fetchProveedoresConocidos,
  hayColumnasDeRemito,
} from "@/features/panol/remitosArchivoApi";
import { carpetaParaMostrar } from "@/features/panol/carpetaRemitos";

/**
 * Escaneo de remitos del pañol.
 *
 * Dos cosas cambiaron de fondo respecto de la version anterior, y las dos por el
 * mismo motivo -que el papel llegara al sistema con SUS datos y no con los de
 * otro-:
 *
 * 1. LOS DATOS VAN POR ARCHIVO. Antes habia un solo `contextoEscaneo` en la
 *    pantalla: se elegia una vez y despues se le pegaba a cualquier archivo que
 *    se procesara. Escaneabas tres remitos de tres barcos, los procesabas, y los
 *    tres quedaban en el barco del ultimo. Un archivo subido a mano heredaba en
 *    silencio el contexto de un escaneo anterior. Ahora cada archivo lleva su
 *    propio contexto: el del escaneo que lo genero, o el que se pide en el acto.
 *
 * 2. GUARDAR NO DEPENDE DE LA IA. Antes se leia primero y se subia despues, asi
 *    que un escaneo que el modelo no entendia terminaba en un cartel rojo y en
 *    nada guardado. Ahora el archivo se sube y se crea la fila SIEMPRE, y la
 *    lectura es un segundo paso que se puede reintentar o saltear.
 */

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

// Sin ambar: el rol de "falta hacer / revisar" lo ocupan cyan y violeta.
const STATUS_META = {
  pendiente: { label: "Falta leer", color: C.cyan, soft: C.cyanL, border: C.cyanB },
  requiere_revision: { label: "Revisar coincidencias", color: C.cyan, soft: C.cyanL, border: C.cyanB },
  listo_ingreso: { label: "Listo para ingresar", color: C.blue, soft: C.blueL, border: C.blueB },
  parcial: { label: "Ingreso parcial", color: C.violet, soft: C.violetL, border: C.violetB },
  ingresado: { label: "Ingresado", color: C.green, soft: C.greenL, border: C.greenB },
  error: { label: "Con error", color: C.red, soft: C.redL, border: C.redB },
  archivado: { label: "Descartado", color: C.dim, soft: C.panel2, border: C.border },
};

const CONTEXTO_VACIO = {
  carpeta: "",
  proveedor: "",
  obra: null,
  titulo: "",
  notas: "",
  soloArchivar: false,
  esConsumibles: false,
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

function Pill({ children, color = C.dim, soft = C.panel2, border = C.border, title = "" }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${border}`,
        background: soft,
        color,
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 10.5,
        fontWeight: 900,
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}

function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.pendiente;
  return (
    <Pill color={meta.color} soft={meta.soft} border={meta.border}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </Pill>
  );
}

function Button({ children, onClick, disabled = false, tone = "neutral", title = "", style = {} }) {
  const tones = {
    neutral: { border: C.border2, bg: C.panelSolid, fg: C.text },
    primary: { border: C.blueB, bg: C.blueL, fg: C.blue },
    danger: { border: C.redB, bg: C.redL, fg: C.red },
    quiet: { border: "transparent", bg: "transparent", fg: C.dim },
  };
  const skin = tones[tone] || tones.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: 34,
        border: `1px solid ${skin.border}`,
        background: skin.bg,
        color: skin.fg,
        borderRadius: 9,
        padding: "7px 11px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontFamily: C.sans,
        fontSize: 12,
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        transition: "border-color .15s, background .15s",
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
      padding: "9px 12px",
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

/**
 * El destino elegido para un remito, en una linea. Siempre muestra algo: si no
 * se eligio nada, decirlo ("Sin obra") es informacion, y esconder la etiqueta
 * dejaria al pañolero sin saber con que datos se va a guardar el papel.
 */
function DestinoPill({ contexto }) {
  if (!contexto) return null;
  const partes = [
    contexto.obra?.codigo || (contexto.carpeta ? carpetaParaMostrar(contexto.carpeta).replace(/^Remitos\\/, "") : ""),
    contexto.proveedor,
  ].filter(Boolean);
  return (
    <Pill color={C.blue} soft={C.blueL} border={C.blueB} title="Datos elegidos al escanear este remito">
      {partes.join(" · ") || "Sin obra ni proveedor"}
      {contexto.soloArchivar ? " · solo archivo" : ""}
      {contexto.esConsumibles ? " · consumibles" : ""}
    </Pill>
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
  const [ocupadoId, setOcupadoId] = useState("");
  const [scanSource, setScanSource] = useState("glass");

  // El modal se monta solo cuando hace falta, con lo que hace falta:
  //   { modo: "escanear" }                        -> antes de mover la lampara
  //   { modo: "guardar", file, localId, base }    -> sobre un archivo concreto
  const [modal, setModal] = useState(null);

  // El contexto del ultimo escaneo lanzado, junto con los archivos que YA
  // existian cuando se lanzo. Todo archivo nuevo que aparezca despues es de ese
  // escaneo y hereda esos datos; cualquier otro se pregunta. Es el reemplazo del
  // `contextoEscaneo` global que le pegaba los mismos datos a todo.
  const [escaneoEnCurso, setEscaneoEnCurso] = useState(null);
  const [carpetasUsadas, setCarpetasUsadas] = useState([]);
  const [proveedoresUsados, setProveedoresUsados] = useState([]);
  const [faltaMigracion, setFaltaMigracion] = useState(false);

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

  useEffect(() => {
    let vivo = true;
    fetchCarpetasUsadas()
      .then((lista) => { if (vivo) setCarpetasUsadas(lista); })
      .catch(() => { if (vivo) setCarpetasUsadas([]); });
    fetchProveedoresConocidos()
      .then((lista) => { if (vivo) setProveedoresUsados(lista); })
      .catch(() => { if (vivo) setProveedoresUsados([]); });
    hayColumnasDeRemito()
      .then((hay) => { if (vivo) setFaltaMigracion(!hay); })
      .catch(() => { if (vivo) setFaltaMigracion(false); });
    return () => { vivo = false; };
  }, []);

  const sinLeer = useMemo(() => receipts.filter(remitoSinLeer), [receipts]);
  const metrics = useMemo(() => ({
    local: localFiles.length,
    sinLeer: sinLeer.length,
    revisar: receipts.filter((row) => ["requiere_revision", "parcial"].includes(row.recepcion_estado)).length,
    listos: receipts.filter((row) => row.recepcion_estado === "listo_ingreso").length,
  }), [localFiles, receipts, sinLeer]);

  /**
   * Los datos que le corresponden a un archivo local, si los sabemos.
   *
   * Dos condiciones, y las dos hacen falta: que el archivo no existiera cuando
   * se lanzó el escaneo, y que su fecha sea posterior. Sin la segunda, un
   * archivo que aparece mañana en la carpeta -de otra persona, de otro papel-
   * heredaría el barco del escaneo de hoy, que es exactamente el error que
   * estamos sacando.
   */
  const contextoDeArchivo = useCallback((row) => {
    if (!escaneoEnCurso) return null;
    if (escaneoEnCurso.idsPrevios.includes(row.id)) return null;
    const cuando = new Date(row.updatedAt || 0).getTime();
    if (Number.isFinite(cuando) && cuando > 0 && cuando < escaneoEnCurso.lanzadoEn - 60_000) return null;
    return escaneoEnCurso.contexto;
  }, [escaneoEnCurso]);

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

  /**
   * Guarda un archivo como remito. El contexto viene decidido de antes: o del
   * escaneo que lo genero, o de la ventana que se le acaba de preguntar.
   */
  async function guardarArchivo(file, contexto, { localId = "" } = {}) {
    if (!canReceive) {
      toast.error("Tu usuario no tiene permiso para cargar remitos.");
      return;
    }
    if (!sede) {
      toast.warning("Elegí a qué sede corresponde el remito.");
      return;
    }
    const operationId = localId || `manual-${Date.now()}`;
    setOcupadoId(operationId);
    try {
      const { receipt, lectura, duplicado } = await archivarRemito(file, {
        sede,
        proveedor: contexto.proveedor,
        obraId: contexto.obra?.id || null,
        carpetaLocal: contexto.carpeta || "",
        titulo: contexto.titulo || "",
        notas: contexto.notas || "",
        soloArchivar: Boolean(contexto.soloArchivar),
        esConsumibles: Boolean(contexto.esConsumibles),
      });

      if (localId) {
        try {
          await archiveScannerFile(localId);
        } catch (archiveError) {
          toast.warning(archiveError.message || "El remito se guardó, pero el archivo local no se pudo sacar de Pendientes.");
        }
      }
      await Promise.all([loadLocal({ quiet: true }), loadRemote()]);

      if (duplicado) {
        toast.success("Este remito ya estaba cargado. Abrimos el existente.");
        if (!remitoSinLeer(receipt)) onReview?.(receipt);
        return;
      }
      // Con "solo archivar" el remito queda guardado y buscable, y no se abre el
      // ingreso: el que lo escaneo queria tener el papel en el sistema, no mover
      // stock. Abrirle el formulario igual seria pedirle que cancele algo que no
      // pidio.
      if (contexto.soloArchivar) {
        toast.success(`Remito archivado${contexto.obra?.codigo ? ` en ${contexto.obra.codigo}` : ""}. Lo encontrás en Remitos.`);
        return;
      }
      if (lectura && !lectura.ok) {
        // Lo importante: el documento YA esta guardado. Esto es un aviso, no un
        // fracaso, y por eso no es un toast de error.
        toast.warning(lectura.mensaje);
        return;
      }
      if (lectura?.dudas?.length) {
        toast.warning(`Remito leído con dudas: ${lectura.dudas.slice(0, 2).join(" · ")}`);
      } else {
        toast.success("Remito leído. Revisá las coincidencias antes de ingresarlo.");
      }
      onReview?.(lectura?.receipt || receipt);
    } catch (error) {
      toast.error(error.message || "No se pudo guardar el remito.");
    } finally {
      setOcupadoId("");
    }
  }

  /** Baja el archivo del puente y lo guarda con el contexto indicado. */
  async function guardarArchivoLocal(row, contexto) {
    setOcupadoId(row.id);
    try {
      const file = await downloadScannerFile(row);
      await guardarArchivo(file, contexto, { localId: row.id });
    } catch (error) {
      toast.error(error.message || "No se pudo tomar el archivo del scanner.");
      setOcupadoId("");
    }
  }

  /**
   * Con qué arranca la ventana al escanear otro remito.
   *
   * Se hereda DÓNDE va -barco, carpeta, proveedor-, porque lo normal es escanear
   * varios remitos del mismo barco seguidos. No se heredan la referencia, la
   * nota, "solo archivar" ni "consumibles": esos describen a UN papel, y venir
   * tildados de antes hace que el siguiente se guarde distinto de lo que quien
   * lo escanea cree que eligió.
   */
  function baseParaNuevoEscaneo() {
    const previo = escaneoEnCurso?.contexto;
    if (!previo) return CONTEXTO_VACIO;
    return { ...CONTEXTO_VACIO, obra: previo.obra, carpeta: previo.carpeta, proveedor: previo.proveedor };
  }

  function pedirDatosYGuardar(row, contextoBase = null) {
    setModal({
      modo: "guardar",
      localRow: row,
      nombre: row?.name || "",
      base: contextoBase || CONTEXTO_VACIO,
    });
  }

  async function archiveLocal(row) {
    setOcupadoId(`local-${row.id}`);
    try {
      await archiveScannerFile(row.id);
      await loadLocal({ quiet: true });
      toast.success("Archivo sacado de Pendientes.");
    } catch (error) {
      toast.error(error.message || "No se pudo archivar el archivo local.");
    } finally {
      setOcupadoId("");
    }
  }

  /** Reintenta la lectura de un remito que ya esta guardado. */
  async function leerAhora(row) {
    setOcupadoId(`leer-${row.id}`);
    try {
      const lectura = await leerRemitoConIA(row);
      await loadRemote();
      if (!lectura.ok) {
        toast.warning(lectura.mensaje);
        return;
      }
      toast.success(`Leído: ${lectura.vinculados}/${lectura.total} renglones vinculados al catálogo.`);
      onReview?.(lectura.receipt);
    } catch (error) {
      toast.error(error.message || "No se pudo leer el remito.");
    } finally {
      setOcupadoId("");
    }
  }

  async function archiveRemote(row) {
    setOcupadoId(`remote-${row.id}`);
    try {
      await archiveScannedReceipt(row.id);
      // Sale de la bandeja en el acto. El refresh posterior confirma el estado
      // remoto, pero una demora de red ya no deja un falso "Archivado" con el
      // botón de ingresar todavía visible.
      setReceipts((current) => current.filter((receipt) => receipt.id !== row.id));
      void loadRemote();
      toast.success("Documento descartado. No modificó stock ni queda en Remitos.");
    } catch (error) {
      toast.error(error.message || "No se pudo descartar el documento.");
    } finally {
      setOcupadoId("");
    }
  }

  async function borrarRemoto(row) {
    const nombre = row.proveedor || row.titulo || row.archivo_nombre || "este remito";
    if (!window.confirm(`¿Borrar ${nombre} y su archivo? No se puede deshacer.`)) return;
    setOcupadoId(`borrar-${row.id}`);
    try {
      await borrarRemitoEscaneado(row.id);
      setReceipts((current) => current.filter((receipt) => receipt.id !== row.id));
      void loadRemote();
      toast.success("Remito borrado.");
    } catch (error) {
      toast.error(error.message || "No se pudo borrar el remito.");
    } finally {
      setOcupadoId("");
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

  /** Confirmacion del modal: escanea, o guarda el archivo que lo abrio. */
  async function confirmarModal(datos) {
    const abierto = modal;
    setModal(null);
    if (!abierto) return;
    const contexto = {
      carpeta: datos.carpeta,
      proveedor: datos.proveedor,
      obra: datos.obra,
      titulo: datos.titulo,
      notas: datos.notas,
      soloArchivar: datos.soloArchivar,
      esConsumibles: datos.esConsumibles,
    };

    if (abierto.modo === "guardar") {
      if (abierto.localRow) await guardarArchivoLocal(abierto.localRow, contexto);
      else if (abierto.file) await guardarArchivo(abierto.file, contexto);
      return;
    }

    // Escanear: se recuerda que archivos habia ANTES y cuando fue, para poder
    // reconocer despues cual salio de este escaneo y cual no.
    setEscaneoEnCurso({ contexto, idsPrevios: localFiles.map((row) => row.id), lanzadoEn: Date.now() });
    setScanSource(datos.source);
    try {
      const result = await launchScannerApp(datos.source, datos.carpeta);
      setHealth((current) => ({
        ...(current || {}),
        scanning: result?.scanning !== false,
        scanStartedAt: result?.startedAt || new Date().toISOString(),
        lastError: "",
      }));
      toast.success(
        datos.carpeta
          ? `Escaneando para ${datos.obra?.codigo || "la carpeta elegida"}. Se guarda en ${carpetaParaMostrar(datos.carpeta)}.`
          : (result?.message || "Scanner abierto."),
      );
    } catch (error) {
      toast.error(error.message || "No se pudo abrir Pantum Scan.");
    }
  }

  const seccion = { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 14, overflow: "hidden" };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.bg }}>
      {modal ? (
        <AntesDeEscanearModal
          modo={modal.modo}
          archivoNombre={modal.nombre || ""}
          onCerrar={() => setModal(null)}
          onConfirmar={confirmarModal}
          obraSugerida={modal.base?.obra || null}
          proveedorSugerido={modal.base?.proveedor || ""}
          tituloInicial={modal.base?.titulo || ""}
          notasInicial={modal.base?.notas || ""}
          carpetaInicial={modal.base?.obra ? "" : (modal.base?.carpeta || "")}
          soloArchivarInicial={Boolean(modal.base?.soloArchivar)}
          esConsumiblesInicial={Boolean(modal.base?.esConsumibles)}
          proveedoresConocidos={proveedoresUsados}
          carpetasConocidas={carpetasUsadas}
          origenInicial={scanSource}
        />
      ) : null}

      <style>{`
        @media (max-width: 680px) {
          .panol-scanner-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        .panol-remito-fila { transition: background .15s; }
        .panol-remito-fila:hover { background: var(--panel-2); }
      `}</style>

      <div style={{ width: "100%", maxWidth: 1320, margin: "0 auto", padding: isMobile ? 12 : 18, boxSizing: "border-box", display: "grid", gap: 12 }}>
        {faltaMigracion ? (
          <div style={{ padding: "12px 14px", borderRadius: 12, background: C.redL, border: `1px solid ${C.redB}` }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: C.red, marginBottom: 5 }}>
              Falta correr una migración en Supabase
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, lineHeight: 1.55 }}>
              Los remitos se escanean y se guardan, pero <b>sin el barco, el tipo ni la referencia</b>:
              esos campos todavía no existen en la base. Hasta que la corras, lo que elijas antes de
              escanear no queda guardado y en Remitos aparece todo junto en &ldquo;Sin obra&rdquo;.
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 750, color: C.dim, marginTop: 7 }}>
              Supabase → SQL Editor → pegar el archivo{" "}
              <code style={{ fontFamily: "monospace", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 5px" }}>
                20260826150000_panol_comprobantes_obra.sql
              </code>
            </div>
          </div>
        ) : null}

        {/* Encabezado + conexion + accion principal, todo en una tarjeta corta. */}
        <section style={{ ...seccion, border: `1px solid ${connected ? C.greenB : C.border}`, background: C.panel, padding: isMobile ? 13 : 16, display: "grid", gap: 12, ...GLASS }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, flexWrap: "wrap" }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${connected ? C.greenB : C.blueB}`, background: connected ? C.greenL : C.blueL, color: connected ? C.green : C.blue, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <ScanLine size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 210 }}>
              <div style={{ color: C.text, fontSize: 15.5, fontWeight: 950 }}>Escanear remitos</div>
              <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2, lineHeight: 1.45 }}>
                El papel se guarda siempre. Después la IA lo lee, y si no puede lo reintentás sin perder el documento.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Pill
                color={connected ? C.green : C.dim}
                soft={connected ? C.greenL : C.panel2}
                border={connected ? C.greenB : C.border}
                title={connected ? `${health?.folder || "Carpeta Pendientes"} · versión ${health?.version || "local"}` : localError}
              >
                <Usb size={11} /> {connected ? "Puente conectado" : health ? "Falta vincular" : "Puente no detectado"}
              </Pill>
              {!sedeLocked && (
                <select
                  value={sede}
                  onChange={(event) => setSede(event.target.value)}
                  aria-label="Sede de ingreso"
                  style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "7px 10px", fontFamily: C.sans, fontSize: 12, fontWeight: 850, outline: "none" }}
                >
                  {SEDES_PANOL.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              )}
              <Button onClick={() => { loadLocal(); loadRemote(); }} disabled={loadingLocal} title="Actualizar conexión y bandeja">
                <RefreshCw size={13} className={loadingLocal ? "spin" : ""} />
                {isMobile ? "" : "Actualizar"}
              </Button>
            </div>
          </div>

          <div className="panol-scanner-metrics" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(150px, 1fr))", gap: 8 }}>
            <Metric label="En esta PC" value={metrics.local} color={C.blue} detail="archivos sin cargar" />
            <Metric label="Falta leer" value={metrics.sinLeer} color={C.cyan} detail="guardados, sin renglones" />
            <Metric label="A revisar" value={metrics.revisar} color={C.violet} detail="coincidencias dudosas" />
            <Metric label="Listos" value={metrics.listos} color={C.green} detail="para confirmar ingreso" />
          </div>

          {!connected && (
            <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: 11, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <AlertTriangle size={16} style={{ color: C.cyan, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 200, color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                {health
                  ? "El puente está abierto pero falta vincularlo. Pegá el código que muestra Klasea Scanner."
                  : localError || "Abrí KlaseaScannerBridge en esta computadora. Si Chrome pregunta por dispositivos en la red local, elegí Permitir."}
              </div>
              <input
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                placeholder="Código de vinculación"
                autoComplete="off"
                style={{ width: isMobile ? "100%" : 200, border: `1px solid ${C.border2}`, background: C.bg, color: C.text, borderRadius: 9, padding: "8px 10px", fontFamily: C.mono, fontSize: 12, outline: "none" }}
              />
              <Button onClick={connectBridge} tone="primary">Vincular</Button>
              {!health && (
                <Button onClick={openBridgeDiagnostic} title="Comprobar que Chrome puede abrir el puente instalado en esta PC">
                  <ExternalLink size={13} /> Probar puente
                </Button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              onClick={() => setModal({ modo: "escanear", base: baseParaNuevoEscaneo() })}
              disabled={!connected || health?.scanning}
              tone="primary"
              style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", minHeight: 38, fontSize: 12.5 }}
            >
              {health?.scanning ? <LoaderCircle size={15} className="spin" /> : <ScanLine size={15} />}
              {health?.scanning ? "Escaneando…" : "Escanear remito"}
            </Button>
            <Button onClick={() => manualInputRef.current?.click()} title="Cargar un PDF o una foto que ya tenés">
              <Upload size={14} /> Subir archivo
            </Button>
            <Button
              onClick={() => openScannerFolder({ carpeta: escaneoEnCurso?.contexto?.carpeta || "" }).catch((error) => toast.error(error.message))}
              disabled={!connected}
              title={escaneoEnCurso?.contexto?.carpeta ? carpetaParaMostrar(escaneoEnCurso.contexto.carpeta) : "Remitos\\Pendientes"}
            >
              <FolderOpen size={14} /> Abrir carpeta
            </Button>
            <input
              ref={manualInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff,.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                // Un archivo subido a mano NUNCA hereda datos de un escaneo
                // anterior: se pregunta siempre. Ese heredar en silencio era la
                // causa de que un remito apareciera en el barco equivocado.
                if (file) setModal({ modo: "guardar", file, nombre: file.name, base: CONTEXTO_VACIO });
              }}
            />
          </div>

          {/* Lo que se le va a poner al proximo archivo que aparezca, a la
              vista. Antes esto era invisible y por eso el remito terminaba en
              el barco equivocado sin que nadie pudiera darse cuenta. */}
          {escaneoEnCurso && (
            <div style={{ border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 10, padding: "8px 11px", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <ScanLine size={14} style={{ color: C.blue, flexShrink: 0 }} />
              <span style={{ color: C.muted, fontSize: 11.5, fontWeight: 750 }}>
                Lo que se escanee ahora se guarda como:
              </span>
              <DestinoPill contexto={escaneoEnCurso.contexto} />
              <span style={{ flex: 1 }} />
              <Button onClick={() => setEscaneoEnCurso(null)} tone="quiet" title="Olvidar estos datos: el próximo archivo va a preguntarlos">
                Limpiar
              </Button>
            </div>
          )}

          {connected && health?.lastError && (
            <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>El último escaneo no pudo completarse.</strong> {health.lastError}</span>
            </div>
          )}
        </section>

        {connected && (
          <section style={seccion}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9 }}>
              <FolderOpen size={15} style={{ color: C.blue }} />
              <div style={{ flex: 1, color: C.text, fontSize: 13, fontWeight: 900 }}>Escaneados en esta PC, sin cargar</div>
              <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{localFiles.length}</span>
            </div>
            {loadingLocal ? (
              <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 12 }}>Leyendo carpeta local…</div>
            ) : localFiles.length === 0 ? (
              <div style={{ padding: "22px 16px", textAlign: "center", color: health?.scanning ? C.blue : C.dim, fontSize: 12.5, lineHeight: 1.5 }}>
                {health?.scanning
                  ? "La Pantum está escaneando. Completá la ventana del controlador y esperá a que aparezca el archivo."
                  : scanSource === "feeder"
                    ? "Poné el remito en el alimentador superior siguiendo el dibujo de la bandeja. Se escanea a 300 dpi y aparece acá como PDF."
                    : "Poné el remito sobre el vidrio siguiendo las marcas de la tapa. Se escanea a 300 dpi y aparece acá como PDF."}
              </div>
            ) : (
              <div style={{ display: "grid" }}>
                {localFiles.map((row) => {
                  const contexto = contextoDeArchivo(row);
                  const ocupado = ocupadoId === row.id;
                  return (
                    <div key={row.id} className="panol-remito-fila" style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <FileText size={18} style={{ color: C.blue, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 190 }}>
                        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ color: C.dim, fontSize: 10.5 }}>{fmtBytes(row.size)} · {fmtDate(row.updatedAt)}</span>
                          {contexto ? <DestinoPill contexto={contexto} /> : (
                            <Pill color={C.dim} title="No sabemos de qué remito es: se pregunta al cargarlo">sin datos</Pill>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => (contexto ? guardarArchivoLocal(row, contexto) : pedirDatosYGuardar(row))}
                        disabled={Boolean(ocupadoId) || !canReceive}
                        tone="primary"
                        title={contexto ? "Guardar con los datos elegidos al escanear" : "Elegir barco y proveedor y guardar"}
                      >
                        {ocupado ? <LoaderCircle size={14} className="spin" /> : <Bot size={14} />}
                        {ocupado ? "Guardando…" : "Guardar remito"}
                      </Button>
                      {contexto ? (
                        <Button onClick={() => pedirDatosYGuardar(row, contexto)} disabled={Boolean(ocupadoId)} title="Cambiar barco, proveedor o referencia antes de guardar">
                          <Pencil size={13} /> Cambiar datos
                        </Button>
                      ) : null}
                      <Button onClick={() => archiveLocal(row)} disabled={Boolean(ocupadoId)} tone="quiet" title="Sacarlo de Pendientes sin cargarlo al sistema">
                        {ocupadoId === `local-${row.id}` ? <LoaderCircle size={13} className="spin" /> : <Archive size={13} />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section style={seccion}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <Inbox size={15} style={{ color: C.violet }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Remitos guardados que esperan algo</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
                El archivo ya está guardado y es buscable. Acá quedan los que falta leer o ingresar al stock.
              </div>
            </div>
            <Button onClick={loadRemote} disabled={loadingRemote}><RefreshCw size={13} className={loadingRemote ? "spin" : ""} /> Actualizar</Button>
          </div>

          {remoteError ? (
            <div style={{ margin: 12, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 800 }}>
              <AlertTriangle size={16} /> {remoteError}
            </div>
          ) : loadingRemote ? (
            <div style={{ padding: 30, textAlign: "center", color: C.dim, fontSize: 12 }}>Cargando remitos…</div>
          ) : receipts.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.dim }}>
              <CheckCircle2 size={26} style={{ color: C.green, marginBottom: 8 }} />
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>No hay nada pendiente en {sede}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Los remitos ya archivados están en la pestaña Remitos.</div>
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {receipts.map((row) => {
                const total = row.items?.length || 0;
                const linked = (row.items || []).filter((item) => item.material_id).length;
                const processed = (row.items || []).filter((item) => item.scanner_ingreso_envio_id).length;
                const done = row.recepcion_estado === "ingresado";
                const faltaLeer = remitoSinLeer(row);
                return (
                  <article key={row.id} className="panol-remito-fila" style={{ padding: isMobile ? 12 : "12px 14px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: done ? C.greenL : faltaLeer ? C.cyanL : C.violetL, border: `1px solid ${done ? C.greenB : faltaLeer ? C.cyanB : C.violetB}`, color: done ? C.green : faltaLeer ? C.cyan : C.violet, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {done ? <CheckCircle2 size={16} /> : <FileText size={16} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>
                          {row.titulo || row.proveedor || "Sin proveedor identificado"}
                          {row.numero ? ` · Nº ${row.numero}` : ""}
                        </div>
                        <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                          {row.titulo && row.proveedor ? `${row.proveedor} · ` : ""}
                          {row.sede || "Sin sede"} · {fmtDate(row.created_at)}
                          {faltaLeer ? "" : ` · ${total} renglón${total === 1 ? "" : "es"}`}
                        </div>
                      </div>
                      {statusPill(row.recepcion_estado)}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {faltaLeer ? (
                        <span style={{ color: C.muted, fontSize: 11.5, flex: 1, minWidth: 180, lineHeight: 1.45 }}>
                          El documento está guardado y se puede abrir. Falta leer los renglones para poder ingresarlo al stock.
                        </span>
                      ) : (
                        <>
                          <Pill
                            color={linked === total ? C.green : C.cyan}
                            soft={linked === total ? C.greenL : C.cyanL}
                            border={linked === total ? C.greenB : C.cyanB}
                          >
                            {linked}/{total} vinculados al catálogo
                          </Pill>
                          {processed > 0 && !done && (
                            <Pill color={C.violet} soft={C.violetL} border={C.violetB}>{processed}/{total} ya ingresados</Pill>
                          )}
                          <span style={{ color: C.dim, fontSize: 11, flex: 1, minWidth: 150 }}>
                            {done
                              ? "Ingreso confirmado y documento asociado."
                              : linked === total
                                ? "Revisá cantidades y destino antes de confirmar."
                                : "Elegí el producto correcto en los renglones dudosos."}
                          </span>
                        </>
                      )}

                      <Button onClick={() => openOriginal(row)} title="Abrir el PDF original"><ExternalLink size={13} /> Original</Button>

                      {faltaLeer ? (
                        <Button onClick={() => leerAhora(row)} disabled={Boolean(ocupadoId) || !canReceive} tone="primary">
                          {ocupadoId === `leer-${row.id}` ? <LoaderCircle size={13} className="spin" /> : <Bot size={13} />}
                          Leer con IA
                        </Button>
                      ) : done && row.panol_envio_id ? (
                        <Button onClick={() => onOpenIngreso?.(row.panol_envio_id)} tone="primary">Ver ingreso</Button>
                      ) : (
                        <Button onClick={() => onReview?.(row)} disabled={!canReceive} tone="primary">Revisar e ingresar</Button>
                      )}

                      {/* Descartar un documento que ya arrastra un ingreso lo
                          esconde junto con trabajo real hecho. Ahí solo queda
                          terminarlo o revertir el ingreso desde su pantalla. */}
                      {!row.panol_envio_id && (
                        <Button onClick={() => archiveRemote(row)} disabled={Boolean(ocupadoId)} title="No corresponde a un remito: sacarlo de acá y de Remitos">
                          {ocupadoId === `remote-${row.id}` ? <LoaderCircle size={13} className="spin" /> : <Archive size={13} />}
                          No es un remito
                        </Button>
                      )}
                      {!row.panol_envio_id && (
                        <Button onClick={() => borrarRemoto(row)} disabled={Boolean(ocupadoId)} tone="quiet" title="Borrar el remito y su archivo">
                          {ocupadoId === `borrar-${row.id}` ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}
                        </Button>
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
