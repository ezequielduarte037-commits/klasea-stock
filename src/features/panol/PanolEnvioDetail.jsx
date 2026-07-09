import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Clock3,
  MapPin,
  MessageSquare,
  PackageOpen,
  Printer,
  ScanLine,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/supabaseClient";
import {
  fetchEnvio, fetchEventos, guardarUbicacionMaterial, marcarItems, setEstadoEnvio, comentarEnvio, deleteEnvio,
  fetchLinkedPurchaseRequestForEnvio, ITEM_ESTADOS, ITEM_ESTADO_META, ENVIO_ESTADO_META, resumenItems,
} from "@/features/panol/panolApi";
import { notifyWaUpdate } from "@/features/compras/purchaseRequestsApi";
import BarcodeScanner from "@/features/panol/BarcodeScanner";
import useKeyboardWedge from "@/features/panol/useKeyboardWedge";
import { materialBarcodeList, materialBarcodeText } from "@/features/materiales/materialBarcodes";
import { UbicacionChip } from "@/features/panol/UbicacionPicker";
import { parseUbicacion } from "@/features/panol/ubicacionUtils";
import { applyPanolReferenceLayout } from "@/features/panol/panolLayout";

// Recepción simplificada: el pañolero solo marca recibido o parcial (pendiente
// queda para revertir). Los estados problema viejos ya no se ofrecen en la UI.
const ACCIONES = ["recibido", "parcial"];
const RECEP_ESTADOS = ["pendiente", "recibido", "parcial"];
const EMPTY_ITEMS = [];

function fmtTs(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function money(value, currency = "ARS") {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${currency || "ARS"} ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function itemSearchText(item) {
  return [
    item.descripcion,
    item.codigo,
    item.codigo_barra,
    item.material?.codigo_barra,
    materialBarcodeText(item.material),
    item.material?.ubicacion,
    item.material?.ubicacion_obs,
    item.cantidad,
    item.unidad,
    item.nota,
    item.estado,
  ].filter(Boolean).join(" ").toLowerCase();
}

function parseReceivedQty(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function beep(frequency = 800, duration = 100) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.1;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, duration);
  } catch {
    // audio no disponible
  }
}

function normalizeBarcode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function qtyForScan(value) {
  const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function barcodesOfItem(item) {
  const out = new Set();
  const push = (value) => {
    const key = normalizeBarcode(value);
    if (key) out.add(key);
  };
  push(item?.codigo_barra);
  push(item?.material?.codigo_barra);
  for (const row of materialBarcodeList(item?.material)) push(row.codigo);
  return [...out];
}

function firstBarcodeOfItem(item) {
  return barcodesOfItem(item)[0] || "";
}

function getItemMaterialId(item) {
  return item?.material_id || item?.material?.id || null;
}

function locationFromItem(item) {
  return {
    ubicacion: item?.ubicacion || item?.material?.ubicacion || "",
    ubicacion_obs: item?.ubicacion_obs || item?.material?.ubicacion_obs || "",
    touched: false,
  };
}

function scanReceiptForItem(item) {
  const ordered = qtyForScan(item?.cantidad);
  const received = qtyForScan(item?.cantidad_recibida) ?? (item?.estado === "recibido" ? ordered ?? 1 : 0);
  if (!ordered || ordered <= 1) {
    return {
      estado: "recibido",
      cantidadRecibida: item?.cantidad || "1",
      label: "Recibido completo",
    };
  }

  const next = Math.min(ordered, received + 1);
  return {
    estado: next >= ordered ? "recibido" : "parcial",
    cantidadRecibida: String(next),
    label: next >= ordered ? `Recibido completo (${next}/${ordered})` : `Parcial (${next}/${ordered})`,
  };
}

function isScanComplete(item) {
  if (item?.estado !== "recibido") return false;
  const ordered = qtyForScan(item?.cantidad);
  if (!ordered || ordered <= 1) return true;
  const received = qtyForScan(item?.cantidad_recibida) ?? ordered;
  return received >= ordered;
}

function StatusChip({ estado, compact = false }) {
  const meta = ITEM_ESTADO_META[estado] ?? ITEM_ESTADO_META.pendiente;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: 999,
      padding: compact ? "3px 8px" : "5px 10px",
      fontSize: compact ? 10 : 11,
      fontWeight: 850,
      letterSpacing: 0.45,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
      {meta.label}
    </span>
  );
}

function EnvioStatusChip({ estado }) {
  const meta = ENVIO_ESTADO_META[estado] ?? { label: estado, color: C.dim };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      color: meta.color,
      background: `${meta.color}14`,
      border: `1px solid ${meta.color}3d`,
      borderRadius: 999,
      padding: "5px 11px",
      fontSize: 11,
      fontWeight: 850,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
      {meta.label}
    </span>
  );
}

function ProgressBar({ resumen }) {
  if (!resumen?.total) {
    return <div style={{ height: 9, borderRadius: 999, background: C.panel2, border: `1px solid ${C.border}` }} />;
  }
  const segments = [
    "recibido",
    "parcial",
    "falta_stock",
    "sin_info",
    "rechazado",
    "pendiente",
  ];
  return (
    <div style={{
      height: 9,
      borderRadius: 999,
      background: C.panel2,
      overflow: "hidden",
      display: "flex",
      border: `1px solid ${C.border}`,
    }}>
      {segments.map((estado) => {
        const n = resumen.by?.[estado] || 0;
        if (!n) return null;
        const meta = ITEM_ESTADO_META[estado] ?? ITEM_ESTADO_META.pendiente;
        return (
          <div
            key={estado}
            title={`${meta.label}: ${n}`}
            style={{ width: `${(n / resumen.total) * 100}%`, minWidth: n ? 3 : 0, background: meta.color }}
          />
        );
      })}
    </div>
  );
}

function HeaderStat({ icon: IconComponent, label, value, color }) {
  const icon = IconComponent ? <IconComponent size={14} /> : null;
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 11,
      padding: "9px 11px",
      display: "flex",
      alignItems: "center",
      gap: 9,
      minWidth: 0,
    }}>
      <div style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: `${color}14`,
        color,
        border: `1px solid ${color}35`,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontFamily: C.mono, fontWeight: 850, fontSize: 17, lineHeight: 1 }}>{value}</div>
        <div style={{ color: C.dim, fontSize: 10, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.border2 : C.border}`,
        background: active ? C.panelSolid : "transparent",
        color: active ? C.text : C.muted,
        padding: "6px 10px",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 850 : 650,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function ActionButton({ estado, children, onClick, disabled }) {
  const meta = ITEM_ESTADO_META[estado] ?? ITEM_ESTADO_META.pendiente;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        color: meta.color,
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 850,
        fontFamily: C.sans,
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children || meta.label}
    </button>
  );
}

function ScanReceiptPanel({
  value,
  onChange,
  onSubmit,
  onOpenCamera,
  inputRef,
  result,
  busy,
  isMobile,
  readyCount,
}) {
  const color = result ? (result.ok ? C.green : C.red) : C.blue;
  const bg = result ? (result.ok ? "var(--green-soft)" : "var(--red-soft)") : "var(--blue-soft)";
  const border = result ? (result.ok ? C.greenB : C.redB) : C.blueB;
  return (
    <div style={{
      borderBottom: `1px solid ${C.border}`,
      background: C.topbarSoft,
      padding: isMobile ? "10px 12px" : "10px 18px",
      display: "grid",
      gap: 8,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 260px" }}>
          <div style={{ width: 31, height: 31, borderRadius: 9, display: "grid", placeItems: "center", color, background: bg, border: `1px solid ${border}`, flexShrink: 0 }}>
            <ScanLine size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Recepcion por escaneo</div>
            <div style={{ color: C.dim, fontSize: 11 }}>
              {readyCount ? `${readyCount} item${readyCount === 1 ? "" : "s"} con codigo de barras · lector PC/USB listo` : "Sin items vinculados a codigo de barras"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr) auto auto" : "minmax(280px, 420px) auto auto", gap: 8, flex: isMobile ? "1 1 100%" : "0 1 auto", minWidth: isMobile ? "100%" : 0 }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={busy}
            placeholder="Escaneá codigo de barras..."
            autoComplete="off"
            inputMode="text"
            style={{
              minWidth: 0,
              width: "100%",
              boxSizing: "border-box",
              background: C.panelSolid,
              border: `1px solid ${result ? border : C.border}`,
              color: C.text,
              padding: "9px 11px",
              borderRadius: 9,
              outline: "none",
              fontSize: 13,
              fontFamily: C.mono,
              boxShadow: result ? `0 0 0 2px ${color}18` : "none",
            }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !String(value || "").trim()}
            style={{
              border: `1px solid ${C.greenB}`,
              background: String(value || "").trim() ? "var(--green-soft)" : C.panel2,
              color: String(value || "").trim() ? C.green : C.dim,
              borderRadius: 9,
              padding: "9px 12px",
              cursor: busy || !String(value || "").trim() ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: C.sans,
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "Marcando..." : "Recibir"}
          </button>
          <button
            type="button"
            onClick={onOpenCamera}
            disabled={busy}
            title="Escanear con camara"
            style={{ border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", color: C.blue, borderRadius: 9, padding: "9px 11px", cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 850, fontFamily: C.sans }}
          >
            <ScanLine size={15} /> {!isMobile && "Camara"}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ border: `1px solid ${border}`, background: bg, color, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontWeight: 800 }}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

function SideLabel({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</span>
      <span style={{ color: C.text, fontSize: 13, fontWeight: 750, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "-"}</span>
    </div>
  );
}

export default function PanolEnvioDetail({ envioId, profile, canReceive, isManager, onBack }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const canSeePrices = !!profile?.is_admin || profile?.role === "admin";

  const [envio, setEnvio] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [itemEstado, setItemEstado] = useState("todos");
  const [partialModal, setPartialModal] = useState(null);
  const scanInputRef = useRef(null);
  const [scanCode, setScanCode] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanFlashId, setScanFlashId] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [estanterias, setEstanterias] = useState([]);
  const [itemLocations, setItemLocations] = useState({});

  const focusScanInput = useCallback(() => {
    setTimeout(() => scanInputRef.current?.focus(), 60);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [e, ev] = await Promise.all([fetchEnvio(envioId), fetchEventos(envioId)]);
      const nextEnvio = canSeePrices ? e : {
        ...e,
        items: (e.items || []).map((item) => {
          const clean = { ...item };
          delete clean.precio_unitario;
          delete clean.moneda;
          return clean;
        }),
      };
      setEnvio(nextEnvio);
      setItemLocations(Object.fromEntries((nextEnvio.items || []).map((item) => [item.id, locationFromItem(item)])));
      setEventos(ev);
      return e;
    } catch (err) {
      toast.error(err.message || "No se pudo cargar el pedido.");
    } finally {
      setLoading(false);
    }
  }, [envioId, toast, canSeePrices]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("panol_estanterias")
      .select("codigo,niveles_cm")
      .eq("activo", true)
      .order("codigo")
      .then(({ data, error }) => {
        if (!alive || error) return;
        setEstanterias(applyPanolReferenceLayout(data ?? []));
      })
      .catch(() => {
        if (alive) setEstanterias([]);
      });
    return () => { alive = false; };
  }, []);

  const items = envio?.items || EMPTY_ITEMS;
  const resumen = useMemo(() => resumenItems(items), [items]);
  const cerrado = envio && ["cerrado", "cancelado"].includes(envio.estado);
  const scanEnabled = !!canReceive && !cerrado && !loading;

  const filteredItems = useMemo(() => {
    const term = itemQ.trim().toLowerCase();
    return items.filter((item) => {
      if (itemEstado !== "todos" && item.estado !== itemEstado) return false;
      if (!term) return true;
      return itemSearchText(item).includes(term);
    });
  }, [items, itemQ, itemEstado]);

  const visibleIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const selectedVisible = useMemo(() => visibleIds.filter((id) => sel.has(id)).length, [visibleIds, sel]);
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length;
  const scanReadyCount = useMemo(() => items.filter((item) => barcodesOfItem(item).length).length, [items]);

  function updateItemLocation(itemId, patch) {
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || locationFromItem(items.find((item) => item.id === itemId))),
        ...patch,
        touched: patch.touched ?? true,
      },
    }));
  }

  async function rememberReceiptLocations(ids) {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const updates = [];
    for (const id of ids) {
      const item = itemById.get(id);
      const materialId = getItemMaterialId(item);
      const loc = itemLocations[id] || locationFromItem(item);
      if (!item || !materialId || !loc?.touched) continue;
      updates.push(guardarUbicacionMaterial(materialId, {
        ubicacion: loc.ubicacion || null,
        ubicacionObs: loc.ubicacion_obs || null,
      }));
    }
    if (updates.length) await Promise.all(updates);
    return updates.length;
  }

  async function guardarUbicacionItem(itemId) {
    const item = items.find((row) => row.id === itemId);
    if (!getItemMaterialId(item)) {
      toast.warning("Este item no esta vinculado al catalogo, no se puede recordar la ubicacion.");
      return;
    }
    setSaving(true);
    try {
      const saved = await rememberReceiptLocations([itemId]);
      if (saved) toast.success("Ubicacion guardada para proximos ingresos.");
      await cargar();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar la ubicacion.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (scanEnabled) focusScanInput();
  }, [scanEnabled, envioId, focusScanInput]);

  function findItemForScan(code) {
    const cleanCode = normalizeBarcode(code);
    const matches = items.filter((item) => barcodesOfItem(item).includes(cleanCode));
    return {
      matches,
      item: matches.find((item) => !isScanComplete(item)) || null,
    };
  }

  async function processScan(rawCode) {
    const cleanCode = normalizeBarcode(rawCode);
    if (!cleanCode || scanBusy) return;
    setScanCode("");
    setScanBusy(true);

    try {
      const { matches, item } = findItemForScan(cleanCode);
      if (!matches.length) {
        const msgText = scanReadyCount
          ? `Codigo ${cleanCode} no pertenece a este envio.`
          : "Este envio no tiene items vinculados a codigo de barras.";
        setScanResult({ ok: false, code: cleanCode, msg: msgText });
        beep(300, 200);
        toast.warning(msgText);
        return;
      }

      if (!item) {
        const msgText = `${matches[0].descripcion} ya estaba recibido.`;
        setScanResult({ ok: false, code: cleanCode, msg: msgText });
        beep(520, 160);
        toast.warning(msgText);
        return;
      }

      const receipt = scanReceiptForItem(item);
      await rememberReceiptLocations([item.id]);
      await marcarItems([item.id], receipt.estado, { cantidadRecibida: receipt.cantidadRecibida });
      await cargar();
      setItemQ("");
      setItemEstado("todos");
      setScanResult({ ok: true, code: cleanCode, msg: `${item.descripcion} - ${receipt.label}` });
      setScanFlashId(item.id);
      setTimeout(() => setScanFlashId((current) => (current === item.id ? null : current)), 1400);
      beep(900, 80);
    } catch (err) {
      const msgText = err.message || "No se pudo registrar el escaneo.";
      setScanResult({ ok: false, code: cleanCode, msg: msgText });
      beep(300, 200);
      toast.error(msgText);
    } finally {
      setScanBusy(false);
      focusScanInput();
    }
  }

  function submitScan() {
    processScan(scanCode);
  }

  useKeyboardWedge({
    enabled: scanEnabled && !scannerOpen && !partialModal,
    onScan: processScan,
  });

  function toggle(id) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSel((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function pedirParcial(ids) {
    const cleanIds = [...new Set(ids)].filter(Boolean);
    if (!cleanIds.length) return;
    setPartialModal({ ids: cleanIds });
  }

  async function aplicar(estado, ids, opts = {}) {
    if (!ids.length) return;
    if (estado === "parcial" && !String(opts.cantidadRecibida ?? "").trim()) {
      pedirParcial(ids);
      return;
    }
    setSaving(true);
    try {
      const linkedBefore = estado === "recibido" && envio?.purchase_request_id
        ? await fetchLinkedPurchaseRequestForEnvio(envio.id).catch(() => null)
        : null;
      if (estado === "recibido" || estado === "parcial") {
        await rememberReceiptLocations(ids);
      }
      await marcarItems(ids, estado, opts);
      await cargar();
      if (linkedBefore && linkedBefore.status !== "recibido") {
        const linkedAfter = await fetchLinkedPurchaseRequestForEnvio(envio.id).catch(() => null);
        if (linkedAfter?.status === "recibido") {
          notifyWaUpdate({
            requestId: linkedAfter.id,
            eventType: "received",
            actorId: profile?.id,
            payload: {
              quantity: linkedAfter.received_quantity || "",
              notes: linkedAfter.receipt_notes || "Recepcionado por Pañol.",
              actorName: profile?.username || "Pañol",
            },
          });
        }
      }
      setSel(new Set());
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar.");
    } finally {
      setSaving(false);
    }
  }

  async function aplicarParciales(rows) {
    const cleanRows = rows
      .map((row) => ({ id: row.id, cantidadRecibida: String(row.cantidadRecibida ?? "").trim() }))
      .filter((row) => row.id && parseReceivedQty(row.cantidadRecibida) !== null);
    if (!cleanRows.length) return;

    setSaving(true);
    try {
      await rememberReceiptLocations(cleanRows.map((row) => row.id));
      for (const row of cleanRows) {
        await marcarItems([row.id], "parcial", { cantidadRecibida: row.cantidadRecibida });
      }
      await cargar();
      setSel(new Set());
      setPartialModal(null);
      toast.success(cleanRows.length === 1 ? "Recepcion parcial guardada." : "Recepciones parciales guardadas.");
    } catch (err) {
      toast.error(err.message || "No se pudo guardar la recepcion parcial.");
    } finally {
      setSaving(false);
    }
  }

  async function guardarNota(item, nota) {
    if ((item.nota ?? "") === nota) return;
    try {
      await marcarItems([item.id], item.estado, { nota });
      await cargar();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar la nota.");
    }
  }

  async function enviarMsg() {
    const t = msg.trim();
    if (!t) return;
    try {
      await comentarEnvio(envioId, t);
      setMsg("");
      setEventos(await fetchEventos(envioId));
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el mensaje.");
    }
  }

  async function cambiarEstadoEnvio(estado) {
    const txt = estado === "cancelado" ? "cancelar" : "cerrar";
    if (!window.confirm(`Seguro que queres ${txt} este pedido?`)) return;
    try {
      await setEstadoEnvio(envioId, estado);
      await cargar();
      toast.success(`Pedido ${estado}.`);
    } catch (err) {
      toast.error(err.message || "No se pudo cambiar el estado.");
    }
  }

  function imprimirEnvio() {
    if (!envio) return;
    const items = envio.items || [];
    const meta = () => [
      envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : null,
      `Pañol ${envio.sede || ""}`.trim(),
      envio.destino ? `Destino: ${envio.destino}` : null,
      `Prioridad: ${envio.prioridad || "media"}`,
      `Estado: ${(ENVIO_ESTADO_META[envio.estado]?.label) || envio.estado}`,
    ].filter(Boolean);
    const filas = items.map((it, i) => {
      const em = ITEM_ESTADO_META[it.estado] || ITEM_ESTADO_META.pendiente;
      const precio = canSeePrices && it.precio_unitario != null && it.precio_unitario !== "" ? money(it.precio_unitario, it.moneda) : "";
      return `<tr>
        <td class="n">${i + 1}</td>
        <td>${escHtml(it.descripcion)}${it.codigo ? `<div class="cod">${escHtml(it.codigo)}</div>` : ""}${precio ? `<div class="cod">${escHtml(precio)}</div>` : ""}</td>
        <td class="c">${escHtml(it.cantidad || "")} ${escHtml(it.unidad || "")}</td>
        <td class="c rec">${it.cantidad_recibida != null && it.cantidad_recibida !== "" ? escHtml(it.cantidad_recibida) : ""}</td>
        <td class="c">${escHtml(em.label)}</td>
        <td>${escHtml(it.nota || "")}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(envio.titulo || "Pedido a Pañol")}</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
      .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:6px}
      .brand{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#555}
      h1{font-size:18px;margin:2px 0 0}
      .meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:#333;margin:8px 0 12px;font-size:12px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}
      th{background:#f1f1f1;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
      td.c{text-align:center;white-space:nowrap} td.n{text-align:center;color:#888;width:26px}
      td.rec{font-weight:bold} .cod{color:#777;font-size:10px;margin-top:2px}
      .foot{margin-top:14px;color:#777;font-size:10px;display:flex;justify-content:space-between}
      @media print{body{margin:12mm}}
    </style></head><body>
      <div class="head">
        <div><div class="brand">Astillero Klase A · Pedido a Pañol</div><h1>${escHtml(envio.titulo || "Pedido a Pañol")}</h1></div>
        <div style="text-align:right;color:#555">${new Date(envio.created_at || Date.now()).toLocaleDateString("es-AR")}</div>
      </div>
      <div class="meta">${meta(envio).map((m) => `<span>${escHtml(m)}</span>`).join("")}</div>
      ${envio.observaciones ? `<div style="margin:0 0 10px;color:#333">Obs.: ${escHtml(envio.observaciones)}</div>` : ""}
      <table><thead><tr><th>#</th><th>Descripción</th><th>Pedido</th><th>Recibido</th><th>Estado</th><th>Nota</th></tr></thead><tbody>${filas || `<tr><td colspan="6" style="text-align:center;color:#999;padding:18px">Sin ítems</td></tr>`}</tbody></table>
      <div class="foot"><span>${items.length} ítem${items.length === 1 ? "" : "s"}</span><span>Impreso ${new Date().toLocaleString("es-AR")}</span></div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    else toast.error("Habilitá las ventanas emergentes para imprimir.");
  }

  async function borrarEnvio() {
    if (!envio || !isManager) return;
    const ok = window.confirm(`Borrar definitivamente "${envio.titulo}"?\n\nEsto elimina el pedido a pañol, sus items y el historial. No queda cancelado ni archivado.`);
    if (!ok) return;
    try {
      await deleteEnvio(envio.id);
      toast.success("Pedido a pañol borrado.");
      onBack?.();
    } catch (err) {
      toast.error(err.message || "No se pudo borrar el pedido.");
    }
  }

  const bulkIds = [...sel];
  const partialItems = partialModal
    ? items.filter((item) => partialModal.ids.includes(item.id))
    : EMPTY_ITEMS;
  const statusFilters = [
    ["todos", `Todos (${items.length})`],
    ...ITEM_ESTADOS.map((estado) => [estado, `${ITEM_ESTADO_META[estado].label} (${resumen.by?.[estado] || 0})`]),
  ];

  return (
    <>
      <div style={{
        background: C.topbar,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "10px 12px 10px 52px" : "12px 18px",
        display: "grid",
        gap: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: `1px solid ${C.border}`,
              background: C.panelSolid,
              color: C.muted,
              borderRadius: 9,
              cursor: "pointer",
              padding: "7px 10px",
              fontSize: 13,
              fontWeight: 750,
              fontFamily: C.sans,
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={15} />
            {!isMobile && "Volver"}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio?.titulo ?? "Pedido"}
            </div>
            {envio && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}{envio.sede}{envio.destino ? ` · ${envio.destino}` : ""}{envio.origen === "compra" ? " · desde compras" : ""}
              </div>
            )}
          </div>

          {envio && <EnvioStatusChip estado={envio.estado} />}

          {envio && (
            <button
              type="button"
              onClick={imprimirEnvio}
              title="Imprimir remito del pedido"
              style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.muted, borderRadius: 9, cursor: "pointer", padding: "7px 10px", fontSize: 12, fontWeight: 850, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
            >
              <Printer size={14} />
              {!isMobile && "Imprimir"}
            </button>
          )}

          {isManager && (
            <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
              {!cerrado && (
                <>
                  <button
                    type="button"
                    onClick={() => cambiarEstadoEnvio("cerrado")}
                    style={{ border: `1px solid ${C.greenB}`, background: "var(--green-soft)", color: C.green, borderRadius: 9, cursor: "pointer", padding: "7px 11px", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstadoEnvio("cancelado")}
                    style={{ border: `1px solid ${C.redB}`, background: "var(--red-soft)", color: C.red, borderRadius: 9, cursor: "pointer", padding: "7px 11px", fontSize: 12, fontWeight: 850, fontFamily: C.sans }}
                  >
                    Cancelar
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={borrarEnvio}
                title="Borrar definitivamente"
                style={{ border: `1px solid ${C.redB}`, background: C.panelSolid, color: C.red, borderRadius: 9, cursor: "pointer", padding: "7px 10px", fontSize: 12, fontWeight: 850, fontFamily: C.sans, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Trash2 size={13} />
                {!isMobile && "Borrar"}
              </button>
            </div>
          )}
        </div>

        {envio && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(150px, 1fr))", gap: 9 }}>
            <HeaderStat icon={ClipboardCheck} label="Recibidos" value={`${resumen.recibidos}/${resumen.total}`} color={C.green} />
            <HeaderStat icon={Clock3} label="Pendientes" value={resumen.pendientes} color={C.amber} />
            <HeaderStat icon={AlertTriangle} label="Problemas" value={resumen.problemas} color={C.red} />
            <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: "10px 12px", display: "grid", alignContent: "center", gap: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.9 }}>
                <span>Avance</span>
                <span style={{ color: C.text, fontFamily: C.mono }}>{resumen.pctRecibido}%</span>
              </div>
              <ProgressBar resumen={resumen} />
            </div>
          </div>
        )}
      </div>

      {canReceive && !cerrado && sel.size > 0 && (
        <div style={{
          background: "var(--blue-soft)",
          borderBottom: `1px solid ${C.blueB}`,
          padding: isMobile ? "9px 12px" : "9px 18px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          flexShrink: 0,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 850, color: C.blue, marginRight: 4 }}>
            <ClipboardCheck size={15} />
            {sel.size} seleccionado{sel.size === 1 ? "" : "s"}
          </span>
          {ACCIONES.map((estado) => (
            <ActionButton key={estado} estado={estado} disabled={saving} onClick={() => (estado === "parcial" ? pedirParcial(bulkIds) : aplicar(estado, bulkIds))} />
          ))}
          <button
            type="button"
            onClick={() => setSel(new Set())}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.dim, cursor: "pointer", padding: 5, display: "grid", placeItems: "center" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {scanEnabled && (
        <ScanReceiptPanel
          value={scanCode}
          onChange={setScanCode}
          onSubmit={submitScan}
          onOpenCamera={() => setScannerOpen(true)}
          inputRef={scanInputRef}
          result={scanResult}
          busy={scanBusy}
          isMobile={isMobile}
          readyCount={scanReadyCount}
        />
      )}

      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 340px",
      }}>
        <div style={{
          overflowY: "auto",
          borderRight: isMobile ? "none" : `1px solid ${C.border}`,
          minHeight: 0,
          background: C.bg,
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando pedido...</div>
          ) : (
            <>
              <div style={{
                position: "sticky",
                top: 0,
                zIndex: 4,
                background: C.topbarSoft,
                backdropFilter: "var(--glass-filter)",
                WebkitBackdropFilter: "var(--glass-filter)",
                borderBottom: `1px solid ${C.border}`,
                padding: isMobile ? 12 : "12px 18px",
                display: "grid",
                gap: 10,
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {canReceive && !cerrado && (
                    <label style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      border: `1px solid ${C.border}`,
                      background: C.panelSolid,
                      color: C.muted,
                      borderRadius: 9,
                      padding: "7px 10px",
                      cursor: filteredItems.length ? "pointer" : "default",
                      fontSize: 12,
                      fontWeight: 750,
                      whiteSpace: "nowrap",
                    }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisible}
                        disabled={!filteredItems.length}
                        style={{ accentColor: C.blue }}
                      />
                      {isMobile ? "Visibles" : `Seleccionar visibles (${filteredItems.length})`}
                    </label>
                  )}

                  <div style={{ position: "relative", flex: "1 1 240px", minWidth: isMobile ? "100%" : 240 }}>
                    <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                    <input
                      value={itemQ}
                      onChange={(e) => setItemQ(e.target.value)}
                      placeholder="Buscar item, codigo, nota..."
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: C.panelSolid,
                        border: `1px solid ${C.border}`,
                        color: C.text,
                        padding: "8px 32px",
                        borderRadius: 9,
                        fontSize: 13,
                        fontFamily: C.sans,
                        outline: "none",
                      }}
                    />
                    {itemQ && (
                      <button type="button" onClick={() => setItemQ("")} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4 }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 1 }}>
                  {statusFilters.map(([estado, label]) => (
                    <FilterButton key={estado} active={itemEstado === estado} onClick={() => setItemEstado(estado)}>{label}</FilterButton>
                  ))}
                </div>
              </div>

              {!isMobile && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: canReceive && !cerrado
                    ? "34px minmax(260px, 1.4fr) 96px 110px 120px minmax(150px, 0.9fr) 150px"
                    : "minmax(260px, 1.4fr) 96px 110px 120px minmax(150px, 0.9fr)",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 18px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.dim,
                  fontSize: 10,
                  fontWeight: 850,
                  letterSpacing: 1.1,
                  textTransform: "uppercase",
                  background: C.bg,
                }}>
                  {canReceive && !cerrado && <span />}
                  <span>Item</span>
                  <span>Cantidad</span>
                  <span>Codigo / barra</span>
                  <span>Estado</span>
                  <span>Nota</span>
                  {canReceive && !cerrado && <span>Accion</span>}
                </div>
              )}

              <div style={{ display: "grid", gap: isMobile ? 8 : 0, padding: isMobile ? 12 : 0 }}>
                {filteredItems.length === 0 ? (
                  <div style={{ margin: 18, border: `1px dashed ${C.border2}`, background: C.panel, borderRadius: 12, padding: 26, textAlign: "center", color: C.dim, fontSize: 13 }}>
                    No hay items para ese filtro.
                  </div>
                ) : filteredItems.map((item) => (
                  isMobile ? (
                    <MobileItemCard
                      key={item.id}
                      item={item}
                      location={itemLocations[item.id]}
                      estanterias={estanterias}
                      selected={sel.has(item.id)}
                      flash={scanFlashId === item.id}
                      canEdit={canReceive && !cerrado}
                      saving={saving}
                      onToggle={() => toggle(item.id)}
                      onApply={(estado, opts) => aplicar(estado, [item.id], opts)}
                      onSaveNote={(nota) => guardarNota(item, nota)}
                      onLocationChange={(patch) => updateItemLocation(item.id, patch)}
                      onSaveLocation={() => guardarUbicacionItem(item.id)}
                    />
                  ) : (
                    <DesktopItemRow
                      key={item.id}
                      item={item}
                      location={itemLocations[item.id]}
                      estanterias={estanterias}
                      selected={sel.has(item.id)}
                      flash={scanFlashId === item.id}
                      canEdit={canReceive && !cerrado}
                      canSeePrices={canSeePrices}
                      saving={saving}
                      onToggle={() => toggle(item.id)}
                      onApply={(estado, opts) => aplicar(estado, [item.id], opts)}
                      onSaveNote={(nota) => guardarNota(item, nota)}
                      onLocationChange={(patch) => updateItemLocation(item.id, patch)}
                      onSaveLocation={() => guardarUbicacionItem(item.id)}
                    />
                  )
                ))}
              </div>
            </>
          )}
        </div>

        <aside style={{
          overflowY: "auto",
          minHeight: 0,
          padding: isMobile ? 12 : 16,
          background: C.panel,
          display: "grid",
          alignContent: "start",
          gap: 12,
        }}>
          <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 13, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PackageOpen size={16} style={{ color: C.blue }} />
              <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Datos del pedido</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <SideLabel label="Sede" value={envio?.sede} />
              <SideLabel label="Fecha" value={fmtTs(envio?.created_at)} />
              <SideLabel label="Origen" value={envio?.origen === "compra" ? "Compras" : envio?.origen || "Manual"} />
              <SideLabel label="Prioridad" value={envio?.prioridad || "media"} />
            </div>
            {(envio?.observaciones || envio?.destino || envio?.obra?.codigo) && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
                {envio?.obra?.codigo && <SideLabel label="Obra" value={envio.obra.codigo} />}
                {envio?.destino && <SideLabel label="Destino" value={envio.destino} />}
                {envio?.observaciones && <SideLabel label="Observaciones" value={envio.observaciones} />}
              </div>
            )}
          </section>

          <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 13, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={16} style={{ color: C.green }} />
              <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Mensaje a compras / pañol</div>
            </div>
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Escribir una novedad, faltante o aclaracion..."
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                boxSizing: "border-box",
                background: C.panelSolid2,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 9,
                padding: 10,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={enviarMsg}
              disabled={!msg.trim()}
              style={{
                justifySelf: "end",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                border: `1px solid ${msg.trim() ? C.blueB : C.border}`,
                background: msg.trim() ? "var(--blue-soft)" : C.panel2,
                color: msg.trim() ? C.blue : C.dim,
                borderRadius: 9,
                padding: "8px 12px",
                cursor: msg.trim() ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 850,
                fontFamily: C.sans,
              }}
            >
              <Send size={14} />
              Enviar
            </button>
          </section>

          <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, padding: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Clock3 size={16} style={{ color: C.violet }} />
              <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Historial</div>
              <span style={{ marginLeft: "auto", color: C.dim, fontSize: 11, fontFamily: C.mono }}>{eventos.length}</span>
            </div>
            {eventos.length === 0 ? (
              <div style={{ fontSize: 12, color: C.dim }}>Sin movimientos ni mensajes.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {eventos.map((ev) => <TimelineEvent key={ev.id} ev={ev} />)}
              </div>
            )}
          </section>
        </aside>
      </div>

      {partialModal && (
        <PartialReceiptModal
          key={partialModal.ids.join("-")}
          items={partialItems}
          saving={saving}
          onClose={() => setPartialModal(null)}
          onSave={aplicarParciales}
        />
      )}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => { setScannerOpen(false); focusScanInput(); }}
        onScan={(code) => {
          setScannerOpen(false);
          processScan(code);
        }}
      />
    </>
  );
}

function ReceiptLocationEditor({ item, location, estanterias = [], saving = false, compact = false, onChange, onSave }) {
  const effective = location || locationFromItem(item);
  const parsed = parseUbicacion(effective.ubicacion);
  const cod = parsed.afuera ? "AFUERA" : parsed.cod;
  const nivel = parsed.nivel ? String(parsed.nivel) : "";
  const selectedShelf = estanterias.find((est) => est.codigo === cod) || null;
  const nivelesCount = Array.isArray(selectedShelf?.niveles_cm) ? selectedShelf.niveles_cm.length : 0;
  const materialId = getItemMaterialId(item);
  const hasCatalogDefault = !!item?.material?.ubicacion;
  const changed = !!effective.touched;
  const helper = !materialId
    ? "Vincula el item al catalogo para recordar la ubicacion."
    : changed
      ? "Se guarda como ubicacion habitual al recibir o con Guardar."
      : hasCatalogDefault
        ? "Ubicacion habitual del catalogo."
        : "Elegila una vez y queda recordada para proximos ingresos.";
  const field = {
    background: C.panelSolid,
    border: `1px solid ${C.border}`,
    color: C.text,
    borderRadius: 8,
    padding: "7px 9px",
    fontSize: 12,
    fontFamily: C.sans,
    outline: "none",
    minWidth: 0,
  };
  const setLocation = (nextCod, nextNivel = nivel, nextObs = effective.ubicacion_obs) => {
    const value = !nextCod ? "" : nextCod === "AFUERA" ? "AFUERA" : (nextNivel ? `${nextCod}-${nextNivel}` : nextCod);
    onChange?.({ ubicacion: value, ubicacion_obs: nextObs, touched: true });
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "78px minmax(130px, 0.5fr) minmax(105px, 0.35fr) minmax(180px, 1fr) auto",
        gap: 7,
        alignItems: "center",
      }}>
        <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <MapPin size={11} /> Ubic.
        </span>
        <select value={cod} onChange={(e) => setLocation(e.target.value, "")} disabled={saving} style={{ ...field, cursor: saving ? "default" : "pointer" }}>
          <option value="">Sin ubicar</option>
          <option value="AFUERA">Afuera del panol</option>
          {estanterias.map((est) => <option key={est.codigo} value={est.codigo}>{est.codigo}</option>)}
        </select>
        {cod && cod !== "AFUERA" && nivelesCount > 0 ? (
          <select value={nivel} onChange={(e) => setLocation(cod, e.target.value)} disabled={saving} style={{ ...field, cursor: saving ? "default" : "pointer" }}>
            <option value="">Estante</option>
            {Array.from({ length: nivelesCount }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>{i + 1} estante</option>
            ))}
          </select>
        ) : (
          <span style={{ display: compact ? "none" : "block" }} />
        )}
        <input
          value={effective.ubicacion_obs || ""}
          onChange={(e) => onChange?.({ ubicacion: effective.ubicacion || "", ubicacion_obs: e.target.value, touched: true })}
          disabled={saving}
          placeholder={cod === "AFUERA" ? "Donde queda fisicamente" : "Obs. de ubicacion"}
          style={field}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: compact ? "flex-start" : "flex-end", flexWrap: "wrap", minWidth: 0 }}>
          <UbicacionChip ubicacion={effective.ubicacion} obs={effective.ubicacion_obs} />
          {changed && materialId && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                border: `1px solid ${C.greenB}`,
                background: "var(--green-soft)",
                color: C.green,
                borderRadius: 8,
                padding: "7px 9px",
                cursor: saving ? "default" : "pointer",
                fontSize: 11,
                fontWeight: 900,
                fontFamily: C.sans,
                whiteSpace: "nowrap",
              }}
            >
              Guardar
            </button>
          )}
        </div>
      </div>
      <div style={{ marginLeft: compact ? 0 : 78, color: changed ? C.green : C.dim, fontSize: 11, fontWeight: changed ? 800 : 500 }}>
        {helper}
      </div>
    </div>
  );
}

function DesktopItemRow({ item, location, estanterias, selected, flash, canEdit, canSeePrices, saving, onToggle, onApply, onSaveNote, onLocationChange, onSaveLocation }) {
  const meta = ITEM_ESTADO_META[item.estado] ?? ITEM_ESTADO_META.pendiente;
  const barcode = firstBarcodeOfItem(item);
  const effectiveLocation = location || locationFromItem(item);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: canEdit
        ? "34px minmax(260px, 1.4fr) 96px 110px 120px minmax(150px, 0.9fr) 150px"
        : "minmax(260px, 1.4fr) 96px 110px 120px minmax(150px, 0.9fr)",
      gap: 10,
      alignItems: "center",
      padding: "9px 18px",
      minHeight: 58,
      borderBottom: `1px solid ${C.border}`,
      background: flash ? "var(--green-soft)" : selected ? "var(--blue-soft)" : C.bg,
      borderLeft: `3px solid ${flash ? C.green : selected ? C.blue : meta.color}`,
    }}>
      {canEdit && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ accentColor: C.blue, justifySelf: "center" }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.descripcion}
        </div>
        {canSeePrices && item.precio_unitario !== null && item.precio_unitario !== undefined && (
          <div style={{ color: C.green, fontSize: 11, marginTop: 3, fontFamily: C.mono }}>
            {money(item.precio_unitario, item.moneda)}
          </div>
        )}
      </div>

      <div style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>
        {item.cantidad || "-"} <span style={{ color: C.dim, fontWeight: 650 }}>{item.unidad || ""}</span>
      </div>

      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ color: item.codigo ? C.blue : C.dim, fontFamily: C.mono, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.codigo || "-"}
        </span>
        {barcode && (
          <span title={`Codigo de barras: ${barcodesOfItem(item).join(" / ")}`} style={{ color: C.green, fontFamily: C.mono, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            CB {barcode}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
        <StatusChip estado={item.estado} compact />
        <PartialQtyHint item={item} />
      </div>

      {canEdit ? (
        <input
          key={`${item.id}-${item.nota ?? ""}`}
          defaultValue={item.nota ?? ""}
          placeholder="Nota"
          onBlur={(e) => onSaveNote(e.target.value.trim())}
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            background: C.panelSolid,
            border: `1px solid ${C.border}`,
            color: C.text,
            padding: "7px 8px",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: C.sans,
            outline: "none",
          }}
        />
      ) : (
        <div style={{ color: C.dim, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.nota || "-"}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {item.estado !== "recibido" && (
            <ActionButton estado="recibido" disabled={saving} onClick={() => onApply("recibido")}>
              Recibir
            </ActionButton>
          )}
          <select
            value={item.estado}
            onChange={(e) => onApply(e.target.value)}
            disabled={saving}
            title="Cambiar estado"
            style={{
              minWidth: 0,
              flex: 1,
              background: C.panelSolid,
              border: `1px solid ${C.border}`,
              color: C.muted,
              padding: "7px 8px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 750,
              fontFamily: C.sans,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {RECEP_ESTADOS.map((estado) => <option key={estado} value={estado}>{ITEM_ESTADO_META[estado].label}</option>)}
          </select>
          {item.estado === "parcial" && (
            <input
              type="number"
              min="0"
              key={`${item.id}-cant-${item.cantidad_recibida ?? ""}`}
              defaultValue={item.cantidad_recibida ?? ""}
              placeholder="Llegaron"
              title="¿Cuántos llegaron?"
              onBlur={(e) => onApply("parcial", { cantidadRecibida: e.target.value.trim() })}
              style={{ width: 76, boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${ITEM_ESTADO_META.parcial.border}`, color: C.text, padding: "7px 8px", borderRadius: 8, fontSize: 12, fontFamily: C.mono, outline: "none" }}
            />
          )}
        </div>
      )}

      {(canEdit || effectiveLocation.ubicacion) && (
        <div style={{
          gridColumn: canEdit ? "2 / -1" : "1 / -1",
          borderTop: `1px dashed ${C.border}`,
          paddingTop: 8,
          marginTop: -1,
        }}>
          {canEdit ? (
            <ReceiptLocationEditor
              item={item}
              location={effectiveLocation}
              estanterias={estanterias}
              saving={saving}
              onChange={onLocationChange}
              onSave={onSaveLocation}
            />
          ) : (
            <UbicacionChip ubicacion={effectiveLocation.ubicacion} obs={effectiveLocation.ubicacion_obs} size="md" />
          )}
        </div>
      )}
    </div>
  );
}

function MobileItemCard({ item, location, estanterias, selected, flash, canEdit, saving, onToggle, onApply, onSaveNote, onLocationChange, onSaveLocation }) {
  const meta = ITEM_ESTADO_META[item.estado] ?? ITEM_ESTADO_META.pendiente;
  const barcode = firstBarcodeOfItem(item);
  const effectiveLocation = location || locationFromItem(item);
  return (
    <div style={{
      border: `1px solid ${flash ? C.greenB : selected ? C.blueB : C.border}`,
      borderLeft: `4px solid ${flash ? C.green : selected ? C.blue : meta.color}`,
      borderRadius: 12,
      background: flash ? "var(--green-soft)" : selected ? "var(--blue-soft)" : C.panelSolid,
      padding: 12,
      display: "grid",
      gap: 10,
    }}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        {canEdit && <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: C.blue, marginTop: 3 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 850, lineHeight: 1.2 }}>{item.descripcion}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {item.cantidad || "-"} {item.unidad || ""}{item.codigo ? ` · ${item.codigo}` : ""}
            {barcode ? ` · CB ${barcode}` : ""}
          </div>
        </div>
        <StatusChip estado={item.estado} compact />
      </div>

      {canEdit ? (
        <>
          <input
            key={`${item.id}-${item.nota ?? ""}`}
            defaultValue={item.nota ?? ""}
            placeholder="Nota"
            onBlur={(e) => onSaveNote(e.target.value.trim())}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: C.panelSolid2,
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: "8px 9px",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: C.sans,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 7 }}>
            {item.estado !== "recibido" && <ActionButton estado="recibido" disabled={saving} onClick={() => onApply("recibido")}>Recibir</ActionButton>}
            <select
              value={item.estado}
              onChange={(e) => onApply(e.target.value)}
              disabled={saving}
              style={{
                flex: 1,
                background: C.panelSolid2,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "8px 9px",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: C.sans,
              }}
            >
              {RECEP_ESTADOS.map((estado) => <option key={estado} value={estado}>{ITEM_ESTADO_META[estado].label}</option>)}
            </select>
          </div>
          {item.estado === "parcial" && (
            <input
              type="number"
              min="0"
              key={`${item.id}-cant-${item.cantidad_recibida ?? ""}`}
              defaultValue={item.cantidad_recibida ?? ""}
              placeholder="¿Cuántos llegaron?"
              onBlur={(e) => onApply("parcial", { cantidadRecibida: e.target.value.trim() })}
              style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid2, border: `1px solid ${ITEM_ESTADO_META.parcial.border}`, color: C.text, padding: "8px 9px", borderRadius: 8, fontSize: 13, fontFamily: C.mono, outline: "none" }}
            />
          )}
          <ReceiptLocationEditor
            item={item}
            location={effectiveLocation}
            estanterias={estanterias}
            saving={saving}
            compact
            onChange={onLocationChange}
            onSave={onSaveLocation}
          />
        </>
      ) : (
        <>
          {item.nota && <div style={{ color: C.dim, fontSize: 12 }}>Nota: {item.nota}</div>}
          {effectiveLocation.ubicacion && <UbicacionChip ubicacion={effectiveLocation.ubicacion} obs={effectiveLocation.ubicacion_obs} size="md" />}
        </>
      )}
    </div>
  );
}

function PartialQtyHint({ item }) {
  if (item.estado !== "parcial") return null;
  const received = String(item.cantidad_recibida ?? "").trim();
  return (
    <span style={{
      color: received ? ITEM_ESTADO_META.parcial.color : C.red,
      background: received ? ITEM_ESTADO_META.parcial.bg : "var(--red-soft)",
      border: `1px solid ${received ? ITEM_ESTADO_META.parcial.border : C.redB}`,
      borderRadius: 7,
      padding: "2px 6px",
      fontSize: 10,
      fontWeight: 850,
      fontFamily: C.mono,
      whiteSpace: "nowrap",
    }}>
      {received ? `Llegaron ${received}${item.cantidad ? ` / ${item.cantidad}` : ""}` : "Falta cantidad"}
    </span>
  );
}

function PartialReceiptModal({ items, saving, onClose, onSave }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    items.map((item) => [item.id, String(item.cantidad_recibida ?? "")]),
  ));

  function update(id, value) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  const rows = items.map((item) => ({
    id: item.id,
    cantidadRecibida: String(values[item.id] ?? "").trim(),
  }));
  const invalid = rows.some((row) => parseReceivedQty(row.cantidadRecibida) === null);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div style={{ width: "min(720px, 100%)", maxHeight: "88vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 14, boxShadow: `0 20px 70px ${C.shadow || "rgba(0,0,0,0.35)"}` }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: ITEM_ESTADO_META.parcial.bg, color: ITEM_ESTADO_META.parcial.color, border: `1px solid ${ITEM_ESTADO_META.parcial.border}` }}>
            <PackageOpen size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Recepcion parcial</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
              Carga cuanto llego de cada item. Este dato es obligatorio para marcar parcial.
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: "none", background: "transparent", color: C.dim, cursor: saving ? "default" : "pointer", padding: 5 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 16, display: "grid", gap: 9 }}>
          {items.map((item) => {
            const value = values[item.id] ?? "";
            const bad = value.trim() && parseReceivedQty(value) === null;
            return (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 120px 150px", gap: 10, alignItems: "center", border: `1px solid ${bad ? C.redB : C.border}`, background: bad ? "var(--red-soft)" : C.panel, borderRadius: 11, padding: 11 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                  <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>{item.codigo || "Sin codigo"}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 800 }}>
                  Pedido: <span style={{ color: C.text, fontFamily: C.mono }}>{item.cantidad || "-"}</span> {item.unidad || ""}
                </div>
                <input
                  autoFocus={items.length === 1}
                  type="number"
                  min="0"
                  step="any"
                  value={value}
                  onChange={(e) => update(item.id, e.target.value)}
                  placeholder="Llegaron"
                  style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${bad ? C.red : ITEM_ESTADO_META.parcial.border}`, color: C.text, padding: "9px 10px", borderRadius: 9, fontSize: 14, fontFamily: C.mono, fontWeight: 850, outline: "none" }}
                />
              </div>
            );
          })}
        </div>

        <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ color: invalid ? C.red : C.dim, fontSize: 12, fontWeight: 800, marginRight: "auto" }}>
            {invalid ? "Completá una cantidad válida para todos los items." : `${items.length} item${items.length === 1 ? "" : "s"} listo${items.length === 1 ? "" : "s"}.`}
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 9, padding: "8px 12px", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 800, fontFamily: C.sans }}>
            Cancelar
          </button>
          <button type="button" onClick={() => onSave(rows)} disabled={saving || invalid} style={{ border: `1px solid ${ITEM_ESTADO_META.parcial.border}`, background: ITEM_ESTADO_META.parcial.bg, color: ITEM_ESTADO_META.parcial.color, borderRadius: 9, padding: "8px 13px", cursor: saving || invalid ? "default" : "pointer", fontSize: 13, fontWeight: 900, fontFamily: C.sans, opacity: saving || invalid ? 0.55 : 1 }}>
            {saving ? "Guardando..." : "Guardar parcial"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({ ev }) {
  if (ev.tipo === "comentario") {
    return (
      <div style={{ background: C.panelSolid2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 10px" }}>
        <div style={{ color: C.text, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{ev.nota}</div>
        <div style={{ color: C.dim, fontSize: 10, fontFamily: C.mono, marginTop: 5 }}>
          {ev.actor?.username ? `${ev.actor.username} · ` : ""}{fmtTs(ev.created_at)}
        </div>
      </div>
    );
  }

  const color = ITEM_ESTADO_META[ev.estado_nuevo]?.color ?? C.blue;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "11px 1fr", gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 5 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.muted, fontSize: 12 }}>
          {ev.tipo === "item_estado"
            ? <>{ITEM_ESTADO_META[ev.estado_anterior]?.label ?? ev.estado_anterior}{" -> "}<strong style={{ color: C.text }}>{ITEM_ESTADO_META[ev.estado_nuevo]?.label ?? ev.estado_nuevo}</strong></>
            : ev.tipo === "creado" ? "Pedido creado"
            : ev.tipo === "estado" ? <>Pedido{" -> "}<strong style={{ color: C.text }}>{ENVIO_ESTADO_META[ev.estado_nuevo]?.label ?? ev.estado_nuevo}</strong></>
            : ev.tipo}
        </div>
        {ev.nota && <div style={{ color: C.dim, fontSize: 11, marginTop: 2, wordBreak: "break-word" }}>{ev.nota}</div>}
        <div style={{ color: C.dim, fontSize: 10, fontFamily: C.mono, marginTop: 2 }}>
          {ev.actor?.username ? `${ev.actor.username} · ` : ""}{fmtTs(ev.created_at)}
        </div>
      </div>
    </div>
  );
}
