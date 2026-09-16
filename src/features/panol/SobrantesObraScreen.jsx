import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  X,
  ClipboardCheck,
  Package,
  RefreshCw,
  Search,
  Ship,
  User,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { C } from "@/theme";
import {
  CIERRE_ESTADOS,
  SEDES_PANOL,
  asignarResponsableCierre,
  conciliarCierreObra,
  fetchCierreEventos,
  fetchCierreItems,
  fetchCierreObra,
  fetchCierreResoluciones,
  fetchCierresObra,
  fetchOperadoresCierre,
  fmtCierreDate,
  fmtCierreQty,
  itemPendienteConfirmar,
  puedeConciliarExcepciones,
  puedeOperarCierre,
  refrescarCierreItems,
  resolverCierreItem,
  sincronizarCierresTerminadas,
  validateCierreQuantities,
} from "@/features/panol/obraCierreApi";
import { canonicalPanolSede } from "@/features/panol/panolApi";

const EPS = 0.0001;

function qty(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function Chip({ meta, children }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 9px",
      borderRadius: 999,
      border: `1px solid ${meta.border || meta.color}`,
      background: meta.bg || `color-mix(in srgb, ${meta.color} 10%, transparent)`,
      color: meta.color,
      fontSize: 10.5,
      fontWeight: 900,
      letterSpacing: 0.3,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children || meta.label}
    </span>
  );
}

function emptyForm() {
  return { utilizado: "", sobrante: "", recibido: "", danado: "", aclaracion: "", observacion: "", sede: "" };
}

function cantidadesPorUnidad(items, field) {
  const totals = new Map();
  for (const item of items) {
    const amount = qty(item[field]);
    if (amount <= EPS) continue;
    const unit = String(item.unidad || "sin unidad").trim().toLowerCase();
    totals.set(unit, (totals.get(unit) || 0) + amount);
  }
  return [...totals].map(([unit, amount]) => `${fmtCierreQty(amount)} ${unit}`).join(" · ") || "0";
}

function needsReview(item) {
  return qty(item.cantidad_pendiente) > EPS || qty(item.cantidad_sobrante_declarada) > EPS || ["pendiente", "parcial"].includes(item.estado);
}

function itemStatus(item) {
  if (qty(item.cantidad_sobrante_declarada) > EPS) return { label: "Falta devolver", color: C.violet };
  if (needsReview(item)) return { label: item.tipo_origen === "reservado" ? "Reserva pendiente" : "Sin revisar", color: C.blue };
  if (qty(item.cantidad_aclaracion) > EPS || item.estado === "excepcion") return { label: "Con incidencia", color: C.red };
  return { label: "Revisado", color: C.green };
}

function cierreStatus(estado) {
  const meta = CIERRE_ESTADOS[estado] || CIERRE_ESTADOS.pendiente;
  return { ...meta, label: estado === "conciliada" ? "Revisión cerrada" : estado === "en_revision" ? "En revisión" : "Por revisar" };
}

const inputStyle = {
  boxSizing: "border-box", minWidth: 0, width: "100%", minHeight: 44,
  border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text,
  borderRadius: 8, padding: "8px 11px", fontSize: 14, fontFamily: C.sans,
};
const labelStyle = { display: "grid", gap: 7, fontSize: 13, fontWeight: 600, color: C.text };

function ScreenStyles() {
  return <style>{`
    .sob-row { transition: background 150ms ease, border-color 150ms ease; }
    .sob-row:hover { background: var(--panel) !important; }
    .sob-screen button:disabled { opacity: .45; cursor: not-allowed; }
    .sob-screen button:focus-visible, .sob-screen a:focus-visible, .sob-screen summary:focus-visible {
      outline: 2px solid var(--blue); outline-offset: -2px;
    }
    .sob-detail { animation: sob-enter 160ms ease-out; }
    @keyframes sob-enter { from { opacity: .6; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .sob-detail { animation: none; } .sob-row { transition: none; } }
  `}</style>;
}

function ResolveForm({ item, sedeDefault, busy, onSubmit, canOperate }) {
  const reserved = item.tipo_origen === "reservado";
  const pending = qty(item.cantidad_pendiente);
  const returning = qty(item.cantidad_sobrante_declarada);
  const [action, setAction] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sede, setSede] = useState(sedeDefault || item.sede_sugerida || "");
  const [advanced, setAdvanced] = useState(false);
  const choices = reserved ? [
    { key: "recibido", label: "Liberar reserva", hint: "Queda disponible para otras obras. El material ya está en pañol.", submit: "Liberar reserva" },
  ] : [
    ...(pending > EPS ? [
      { key: "utilizado", label: "Se usó en la obra", hint: "Quedó instalado o se consumió. Se registra su uso.", submit: "Registrar uso" },
      { key: "sobrante", label: "Sobró y sigue en obra", hint: "Queda pendiente de devolución. Se sumará al stock cuando pañol lo reciba.", submit: "Anotar sobrante" },
    ] : []),
    { key: "recibido", label: "Ya volvió a pañol", hint: "Confirmá solo lo que recibiste físicamente y está en condiciones de volver al stock.", submit: "Confirmar recepción" },
  ];
  const secondary = pending > EPS ? [
    ...(!reserved ? [{ key: "danado", label: "Está dañado", hint: "Se registra como dañado y se abre una devolución para su seguimiento.", submit: "Registrar daño" }] : []),
    { key: "aclaracion", label: "Hay una diferencia", hint: "Indicá la cantidad que no podés justificar y explicá qué pasó. Requiere autorización al cerrar la revisión.", submit: "Registrar incidencia" },
  ] : [];
  const selected = [...choices, ...secondary].find((option) => option.key === action);
  const max = action === "recibido" ? pending + returning : pending;
  const form = { ...emptyForm(), ...(action ? { [action]: amount } : {}), observacion: note, sede };
  let error = "";
  try { validateCierreQuantities(form); } catch (err) { error = err.message; }
  if (!error && qty(amount) > max + EPS) error = `La cantidad no puede superar ${fmtCierreQty(max)} ${item.unidad || "u"}.`;
  const blocked = !canOperate || busy || !selected || !amount.trim() || qty(amount) <= EPS || !!error
    || (action === "recibido" && (!sede || !item.material_id)) || (action === "aclaracion" && !note.trim());
  const selectAction = (key) => { setAction(key); setAmount(""); };
  const optionButton = (option) => <button key={option.key} type="button" aria-pressed={action === option.key}
    disabled={!canOperate || busy || (option.key === "recibido" && !item.material_id)}
    onClick={() => selectAction(option.key)} style={{ ...ghostBtn, width: "100%", justifyContent: "space-between", textAlign: "left", minHeight: 46,
      background: action === option.key ? C.blueL : C.panelSolid, borderColor: action === option.key ? C.blueB : C.border, color: action === option.key ? C.blue : C.text }}>
    {option.label}{action === option.key ? <CheckCircle2 size={17} /> : <ChevronRight size={16} color={C.dim} />}
  </button>;

  return <form onSubmit={async (event) => {
    event.preventDefault();
    if (blocked) return;
    if (await onSubmit(form)) { setAmount(""); setNote(""); setAction(""); setAdvanced(false); }
  }} style={{ display: "grid", gap: 16 }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 750, marginBottom: 10 }}>{reserved ? "¿Qué hacemos con esta reserva?" : "¿Qué pasó con este material?"}</div>
      <div role="group" aria-label="Elegir una acción" style={{ display: "grid", gap: 7 }}>{choices.map(optionButton)}</div>
      {secondary.length > 0 && <>
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} style={{ ...ghostBtn, border: "none", background: "transparent", color: C.dim, padding: 0, fontWeight: 500 }}>Daños o diferencias {advanced ? "−" : "+"}</button>
        {advanced && <div style={{ display: "grid", gap: 7 }}>{secondary.map(optionButton)}</div>}
      </>}
    </div>
    {selected && <div style={{ display: "grid", gap: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55 }}>{selected.hint}</div>
      <label style={labelStyle}>Cantidad · {item.unidad || "unidades"}
        <div style={{ display: "flex", gap: 8 }}>
          <input aria-describedby="sob-quantity-help" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!canOperate || busy} placeholder="0" style={{ ...inputStyle, fontSize: 22, fontFamily: C.mono, fontWeight: 650, borderColor: error ? C.red : C.border }} />
          <button type="button" disabled={!canOperate || busy} onClick={() => setAmount(String(max))} style={{ ...ghostBtn, flexShrink: 0 }}>Todo</button>
        </div>
      </label>
      <div id="sob-quantity-help" style={{ fontSize: 12, color: error ? C.red : C.dim }} role={error ? "alert" : undefined}>{error || `Hasta ${fmtCierreQty(max)} ${item.unidad || "u"} disponibles para esta acción.`}</div>
      {action === "recibido" && <label style={labelStyle}>{reserved ? "Pañol de la reserva" : "¿En qué pañol lo recibiste?"}
        <select value={sede} onChange={(e) => setSede(e.target.value)} disabled={!canOperate || busy} style={inputStyle}>
          <option value="">Elegir pañol…</option>{SEDES_PANOL.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>}
      <label style={labelStyle}>{action === "aclaracion" ? "¿Qué pasó? · obligatorio" : "Nota · opcional"}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canOperate || busy} style={{ ...inputStyle, resize: "vertical" }} />
      </label>
      <button type="submit" disabled={blocked} style={{ ...ghostBtn, justifyContent: "center", background: C.blue, borderColor: C.blue, color: "#fff", minHeight: 46 }}>{busy ? "Guardando…" : selected.submit}</button>
    </div>}
    {!item.material_id && <div style={{ fontSize: 12, color: C.red, lineHeight: 1.5 }}>Falta vincular este material al catálogo para poder recibirlo o liberar su reserva.</div>}
  </form>;
}

function MaterialDetail({ item, resoluciones, sedeDefault, canOperate, busy, onResolve, onClose, closed }) {
  const reserved = item.tipo_origen === "reservado";
  const hist = resoluciones.filter((row) => row.item_id === item.id);
  const figures = [
    [reserved ? "Reservado en pañol" : "Entregado a la obra", reserved ? item.cantidad_reservada : item.cantidad_entregada],
    ["Sin revisar", item.cantidad_pendiente],
    ["Sobrante por devolver", item.cantidad_sobrante_declarada],
    ["Usado en la obra", item.cantidad_utilizada],
    [reserved ? "Reserva liberada" : "Recibido en pañol", item.cantidad_recibida],
    ["Devuelto antes de esta revisión", item.cantidad_devuelta_previa],
    ["Dañado", item.cantidad_danada],
    ["Con diferencias", item.cantidad_aclaracion],
  ].filter(([, value], index) => index === 0 || qty(value) > EPS);
  return <aside className="sob-detail" aria-label="Detalle del material" style={{ height: "100%", overflowY: "auto", background: C.panelSolid }}>
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.dim, fontSize: 12, fontWeight: 650 }}>REVISAR MATERIAL</span>
      <button type="button" disabled={busy} aria-label="Cerrar detalle" onClick={onClose} style={{ ...ghostBtn, padding: 0, width: 44, justifyContent: "center", border: "none" }}><X size={19} /></button>
    </div>
    <div style={{ padding: 20, display: "grid", gap: 20 }}>
      <div><h2 style={{ fontSize: 19, lineHeight: 1.4, margin: "0 0 6px", overflowWrap: "anywhere" }}>{item.descripcion}</h2>
        <div style={{ color: C.dim, fontSize: 12 }}>{[item.codigo, item.unidad, reserved ? "Permanece en pañol" : "Entregado a obra"].filter(Boolean).join(" · ")}</div>
      </div>
      <div style={{ padding: 14, borderRadius: 10, background: C.panel, display: "grid", gap: 9 }}>
        {figures.map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13 }}><span style={{ color: C.dim }}>{label}</span><strong style={{ whiteSpace: "nowrap", fontFamily: C.mono }}>{fmtCierreQty(value)} {item.unidad || "u"}</strong></div>)}
      </div>
      {!closed && (qty(item.cantidad_pendiente) > EPS || qty(item.cantidad_sobrante_declarada) > EPS)
        ? canOperate || busy
          ? <ResolveForm item={item} sedeDefault={sedeDefault} canOperate={canOperate} busy={busy} onSubmit={onResolve} />
          : <p style={{ color: C.dim, fontSize: 13 }}>Tenés acceso de consulta. Un operador de pañol debe registrar los movimientos.</p>
        : <div style={{ display: "flex", gap: 8, alignItems: "center", color: itemStatus(item).color, fontSize: 13 }}><CheckCircle2 size={18} />{qty(item.cantidad_aclaracion) > EPS ? "Incidencia registrada. Requiere revisión al cerrar." : "Este material ya está revisado."}</div>}
      {hist.length > 0 && <details style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, minHeight: 32 }}>Ver historial · {hist.length}</summary>
        <div style={{ display: "grid", gap: 14, paddingTop: 10 }}>{hist.map((row) => <div key={row.id} style={{ fontSize: 12, lineHeight: 1.5 }}>
          <strong>{{ utilizado: "Uso registrado", sobrante_declarado: "Sobrante anotado", recibido_panol: reserved ? "Reserva liberada" : "Recibido en pañol", danado: "Daño registrado", pendiente_aclaracion: "Incidencia registrada" }[row.tipo] || row.tipo} · {fmtCierreQty(row.cantidad)} {item.unidad || "u"}</strong>
          <div style={{ color: C.dim }}>{new Date(row.created_at).toLocaleString("es-AR")} · {row.usuario_nombre || "Usuario"}</div>
          {row.observacion && <div>{row.observacion}</div>}
        </div>)}</div>
      </details>}
    </div>
  </aside>;
}

function DetalleCierre({ cierreId, profile, signOut }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { isMobile } = useResponsive();
  const canOperate = puedeOperarCierre(profile);
  const canException = puedeConciliarExcepciones(profile);
  const sedeDefault = canonicalPanolSede(profile?.sede);
  const [cierre, setCierre] = useState(null);
  const [items, setItems] = useState([]);
  const [resoluciones, setResoluciones] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [q, setQ] = useState("");
  const [itemFilter, setItemFilter] = useState("pendientes");
  const operationInFlight = useRef(false);
  const idempotencyByItem = useRef(new Map());
  const idempotencyStorageKey = (itemId) => `panol-cierre-idem:${cierreId}:${itemId}`;

  function fingerprintResolucion(form) {
    return [
      qty(form.utilizado),
      qty(form.sobrante),
      qty(form.recibido),
      qty(form.danado),
      qty(form.aclaracion),
      String(form.observacion || "").trim(),
      canonicalPanolSede(form.sede || sedeDefault) || "",
    ].join("|");
  }

  function takeIdempotencyKey(itemId, fingerprint) {
    let entry = idempotencyByItem.current.get(itemId);
    if (!entry && typeof sessionStorage !== "undefined") {
      try {
        const raw = sessionStorage.getItem(idempotencyStorageKey(itemId));
        if (raw) {
          try {
            entry = JSON.parse(raw);
          } catch {
            entry = { key: raw, fingerprint: null };
          }
        }
      } catch { /* ignore */ }
    }
    // Conservamos la misma clave aunque cambien los datos: el SQL rechaza el
    // reintento distinto en vez de devolver éxito silencioso.
    if (!entry?.key) {
      entry = { key: crypto.randomUUID(), fingerprint };
    } else {
      entry = { key: entry.key, fingerprint };
    }
    idempotencyByItem.current.set(itemId, entry);
    try { sessionStorage.setItem(idempotencyStorageKey(itemId), JSON.stringify(entry)); } catch { /* ignore */ }
    return entry.key;
  }

  function clearIdempotencyKey(itemId) {
    idempotencyByItem.current.delete(itemId);
    try { sessionStorage.removeItem(idempotencyStorageKey(itemId)); } catch { /* ignore */ }
  }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [head, lineas, hist, ev, ops] = await Promise.all([
        fetchCierreObra(cierreId),
        fetchCierreItems(cierreId),
        fetchCierreResoluciones(cierreId),
        fetchCierreEventos(cierreId),
        fetchOperadoresCierre().catch(() => []),
      ]);
      setCierre(head);
      setItems(lineas);
      setResoluciones(hist);
      setEventos(ev);
      setOperadores(ops);
    } catch (error) {
      toast.error(error.message || "No se pudo cargar la revisión.");
    } finally {
      setLoading(false);
    }
  }, [cierreId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((item) => {
      if (term && !`${item.descripcion} ${item.codigo || ""}`.toLowerCase().includes(term)) return false;
      if (cierre?.estado === "conciliada") return true;
      if (itemFilter === "por_recibir") return qty(item.cantidad_sobrante_declarada) > EPS;
      if (itemFilter === "reservas") return item.tipo_origen === "reservado" && qty(item.cantidad_reservada) > EPS;
      if (itemFilter === "aclaraciones") return qty(item.cantidad_aclaracion) > EPS;
      if (itemFilter === "resueltos") return item.estado === "resuelto";
      if (itemFilter === "pendientes") return ["pendiente", "parcial", "excepcion"].includes(item.estado) || qty(item.cantidad_pendiente) > EPS || qty(item.cantidad_sobrante_declarada) > EPS;
      return true;
    });
  }, [items, q, itemFilter, cierre?.estado]);

  const summary = useMemo(() => ({
    utilizados: items.reduce((s, i) => s + qty(i.cantidad_utilizada), 0),
    recibidos: items.reduce((s, i) => s + qty(i.cantidad_recibida), 0),
    danados: items.reduce((s, i) => s + qty(i.cantidad_danada), 0),
    excepciones: items.reduce((s, i) => s + qty(i.cantidad_aclaracion), 0),
    porDevolver: items.reduce((s, i) => s + qty(i.cantidad_sobrante_declarada), 0),
    pendientes: items.filter((i) =>
      i.estado === "pendiente"
      || i.estado === "parcial"
      || qty(i.cantidad_pendiente) > EPS
      || qty(i.cantidad_sobrante_declarada) > EPS
    ).length,
    confirmar: items.filter(itemPendienteConfirmar).length,
  }), [items]);

  async function onResolve(item, form) {
    if (operationInFlight.current) return false;
    operationInFlight.current = true;
    setBusyItem(item.id);
    try {
      validateCierreQuantities(form);
      const key = takeIdempotencyKey(item.id, fingerprintResolucion(form));
      await resolverCierreItem({
        itemId: item.id,
        utilizado: form.utilizado,
        sobrante: form.sobrante,
        recibido: form.recibido,
        danado: form.danado,
        aclaracion: form.aclaracion,
        observacion: form.observacion,
        sede: form.sede || sedeDefault,
        idempotencyKey: key,
      });
      clearIdempotencyKey(item.id);
      toast.success("Resolución registrada.");
      await cargar();
      return true;
    } catch (error) {
      const msg = error.message || "No se pudo registrar.";
      // Reintento con datos distintos: soltá la clave y refrescá para ver lo ya guardado.
      if (/reintento ya registró|otra operación/i.test(msg)) {
        clearIdempotencyKey(item.id);
        await cargar();
      }
      toast.error(msg);
      return false;
    } finally {
      operationInFlight.current = false;
      setBusyItem("");
    }
  }

  async function onConciliar() {
    if (operationInFlight.current || loading) return;
    const hayExcepcion = items.some((i) => i.estado === "excepcion" || qty(i.cantidad_aclaracion) > EPS);
    if (summary.porDevolver > EPS) {
      toast.error("Hay sobrantes declarados sin recibir en pañol. Recibilos antes de conciliar.");
      return;
    }
    if (hayExcepcion && !canException) {
      toast.error("Hay excepciones. La conciliación la cierra técnica, admin o compras.");
      return;
    }
    const ok = await confirm({
      title: "¿Conciliar materiales?",
      message: "La obra sigue terminada o activa según producción. Esto sólo cierra la revisión de pañol.",
      confirmLabel: "Conciliar",
    });
    if (!ok || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusyAction(true);
    try {
      const resumen = await conciliarCierreObra(cierreId);
      toast.success("Revisión conciliada.");
      setCierre((prev) => prev ? { ...prev, estado: "conciliada", resumen } : prev);
      await cargar();
    } catch (error) {
      toast.error(error.message || "No se pudo conciliar.");
    } finally {
      operationInFlight.current = false;
      setBusyAction(false);
    }
  }

  if (!cierre && !loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ flex: 1, padding: 24 }}>
          <div style={{ color: C.text, fontWeight: 900, fontSize: 18 }}>No se encontró la revisión</div>
          <Link to="/stock-panol?tab=sobrantes" style={{ color: C.blue, marginTop: 10, display: "inline-block" }}>Volver a sobrantes</Link>
        </main>
      </div>
    );
  }

  const estadoMeta = CIERRE_ESTADOS[cierre?.estado] || CIERRE_ESTADOS.pendiente;
  const conciliada = cierre?.estado === "conciliada";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <Sidebar profile={profile} signOut={signOut} />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{
          padding: isMobile ? "12px 14px" : "14px 22px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panelSolid,
          display: "grid",
          gap: 10,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <button type="button" onClick={() => nav("/stock-panol?tab=sobrantes")} style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
                border: "none", background: "transparent", color: C.blue, cursor: "pointer",
                fontWeight: 800, fontFamily: C.sans, padding: 0,
              }}>
                <ArrowLeft size={16} /> Sobrantes de obra
              </button>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 950 }}>{cierre?.codigo || "Obra"}</h1>
                {cierre?.modelo && <span style={{ color: C.dim, fontWeight: 800 }}>{cierre.modelo}</span>}
                <Chip meta={estadoMeta} />
                {cierre?.obra_estado && cierre.obra_estado !== "terminada" && (
                  <Chip meta={{ color: C.violet, bg: C.violetL, border: C.violetB }}>Obra {cierre.obra_estado}</Chip>
                )}
              </div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                Finalización {fmtCierreDate(cierre?.fecha_terminacion)}
                {cierre?.ciclo > 1 ? ` · ciclo ${cierre.ciclo}` : ""}
                {cierre?.obra_reabierta_at ? " · la obra se reabrió; el historial se conserva" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!conciliada && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      if (operationInFlight.current) return;
                      operationInFlight.current = true;
                      setBusyAction(true);
                      try {
                        await refrescarCierreItems(cierreId);
                        await cargar();
                      } catch (error) {
                        toast.error(error.message || "No se pudo actualizar.");
                      } finally {
                        operationInFlight.current = false;
                        setBusyAction(false);
                      }
                    }}
                    disabled={!canOperate || loading || !!busyItem || busyAction}
                    style={ghostBtn}
                  >
                    <RefreshCw size={15} /> Actualizar movimientos
                  </button>
                  <button type="button" onClick={onConciliar} disabled={!canOperate || loading || !!busyItem || busyAction || summary.pendientes > 0} style={{
                    ...ghostBtn,
                    border: `1px solid ${C.greenB}`,
                    background: C.greenL,
                    color: C.green,
                    opacity: summary.pendientes > 0 ? 0.5 : 1,
                  }}>
                    <CheckCircle2 size={15} /> Conciliar
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            <Kpi label="Pendientes" value={summary.pendientes} color={summary.pendientes ? C.violet : C.green} />
            <Kpi label="Ítems por recibir" value={items.filter((i) => qty(i.cantidad_sobrante_declarada) > EPS).length} color={summary.porDevolver ? C.violet : C.text} />
            <Kpi label="Ítems con uso registrado" value={items.filter((i) => qty(i.cantidad_utilizada) > EPS).length} />
            <Kpi label="Ítems recibidos / liberados" value={items.filter((i) => qty(i.cantidad_recibida) > EPS).length} color={C.green} />
            <Kpi label="Ítems con daño / aclaración" value={items.filter((i) => qty(i.cantidad_danada) > EPS || qty(i.cantidad_aclaracion) > EPS).length} color={C.red} />
          </div>
          {!conciliada && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: C.dim }}>
              <User size={14} /> Responsable
              <select
                value={cierre?.responsable_id || ""}
                disabled={!canOperate}
                onChange={async (e) => {
                  try {
                    await asignarResponsableCierre(cierreId, e.target.value || null);
                    await cargar();
                  } catch (error) {
                    toast.error(error.message);
                  }
                }}
                style={{ ...inputStyle, minHeight: 40, minWidth: 180 }}
              >
                <option value="">Sin asignar</option>
                {operadores.map((op) => (
                  <option key={op.id} value={op.id}>{op.username}</option>
                ))}
              </select>
            </label>
          )}
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? 12 : 18, display: "grid", gap: 10 }}>
          <div style={{ position: "relative", maxWidth: 420 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 14, color: C.dim }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material…"
              aria-label="Buscar material"
              style={{ ...inputStyle, width: "100%", paddingLeft: 34 }}
            />
          </div>
          {!conciliada && <div role="group" aria-label="Filtrar materiales del cierre" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[["pendientes", "Pendientes"], ["por_recibir", "Por recibir"], ["reservas", "Reservas"], ["aclaraciones", "Aclaraciones"], ["resueltos", "Resueltos"], ["todos", "Todos"]].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={itemFilter === value} onClick={() => setItemFilter(value)} style={{ ...ghostBtn, minHeight: 44, background: itemFilter === value ? C.blueL : C.panelSolid, color: itemFilter === value ? C.blue : C.text, borderColor: itemFilter === value ? C.blueB : C.border }}>{label}</button>
            ))}
          </div>}
          <div aria-live="polite" style={{ color: C.dim, fontSize: 12 }}>{visibles.length} de {items.length} materiales</div>
          {loading && <div style={{ color: C.dim, padding: 20 }}>Cargando materiales…</div>}
          {!loading && visibles.length === 0 && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, textAlign: "center", color: C.dim }}>
              {items.length === 0 ? "Esta obra no tiene materiales vinculados en el ledger. Se puede conciliar." : "Ningún material coincide con la búsqueda."}
            </div>
          )}
          {visibles.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              resoluciones={resoluciones}
              sedeDefault={sedeDefault}
              canOperate={canOperate && !conciliada && !loading && !busyItem && !busyAction}
              busy={busyItem === item.id}
              isMobile={isMobile}
              onResolve={(form) => onResolve(item, form)}
            />
          ))}
          {conciliada && cierre?.resumen && (
            <div style={{ border: `1px solid ${C.greenB}`, background: C.greenL, borderRadius: 12, padding: 14 }}>
              <div style={{ color: C.green, fontWeight: 900, marginBottom: 6 }}>Resumen de conciliación</div>
              <div style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
                <div>Utilizados: {cantidadesPorUnidad(items, "cantidad_utilizada")}</div>
                <div>Recibidos / liberados: {cantidadesPorUnidad(items, "cantidad_recibida")}</div>
                <div>Dañados: {cantidadesPorUnidad(items, "cantidad_danada")}</div>
                <div>Excepciones: {cantidadesPorUnidad(items, "cantidad_aclaracion")}</div>
              </div>
            </div>
          )}
          {eventos.length > 0 && (
            <div style={{ color: C.dim, fontSize: 11.5, display: "grid", gap: 4 }}>
              {eventos.slice(0, 8).map((ev) => (
                <div key={ev.id}>
                  {new Date(ev.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{ev.usuario_nombre || "sistema"}
                  {" · "}{ev.tipo.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const ghostBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 44,
  padding: "0 12px",
  border: `1px solid ${C.border}`,
  background: C.panelSolid,
  color: C.text,
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 800,
  fontFamily: "'Outfit', system-ui, sans-serif",
  fontSize: 13,
};

export function ListaSobrantesObraPanel({ profile, signOut, embedded = false }) {
  const toast = useToast();
  const { isMobile } = useResponsive();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("abiertos");
  const [syncing, setSyncing] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchCierresObra({ estado: filtro }));
    } catch (error) {
      toast.error(error.message || "No se pudieron cargar los sobrantes.");
    } finally {
      setLoading(false);
    }
  }, [filtro, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.codigo} ${row.modelo} ${row.responsable_nombre}`.toLowerCase().includes(term));
  }, [rows, q]);

  const pendientes = rows.filter((row) => row.estado !== "conciliada").length;

  const panel = (
    <>
        <header style={{
          padding: isMobile ? "12px 14px" : embedded ? "12px 14px" : "14px 22px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panelSolid,
          display: "grid",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              {!embedded && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ClipboardCheck size={18} color={C.blue} />
                  <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 950 }}>Sobrantes de obra</h1>
                </div>
              )}
              <div style={{ color: C.dim, fontSize: 12.5, marginTop: embedded ? 0 : 4, maxWidth: 640, lineHeight: 1.45 }}>
                Cuando una obra se marca como terminada, pañol revisa qué se usó, qué sobró y qué volvió al depósito. Terminar el barco y conciliar materiales son estados distintos.
              </div>
            </div>
            <button
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const n = await sincronizarCierresTerminadas();
                  toast.success(n ? `${n} obra(s) sincronizada(s).` : "No había obras terminadas nuevas.");
                  await cargar();
                } catch (error) {
                  toast.error(error.message || "No se pudo sincronizar. ¿Está aplicada la migración?");
                } finally {
                  setSyncing(false);
                }
              }}
              style={ghostBtn}
            >
              <RefreshCw size={15} /> {syncing ? "Sincronizando…" : "Sincronizar terminadas"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: 14, color: C.dim }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, modelo o responsable…" aria-label="Buscar obras" style={{ ...inputStyle, width: "100%", paddingLeft: 34 }} />
            </div>
            <div role="tablist" aria-label="Estado de revisión" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["abiertos", "Pendientes"], ["pendiente", "Pendiente"], ["en_revision", "En revisión"], ["conciliada", "Conciliadas"], ["todas", "Todas"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === id}
                  onClick={() => setFiltro(id)}
                  style={{
                    minHeight: 40,
                    padding: "0 12px",
                    borderRadius: 999,
                    border: `1px solid ${filtro === id ? C.blueB : C.border}`,
                    background: filtro === id ? C.blueL : C.panelSolid,
                    color: filtro === id ? C.blue : C.text,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: C.sans,
                    fontSize: 12.5,
                  }}
                >
                  {label}{id === "abiertos" && pendientes ? ` · ${pendientes}` : ""}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? 12 : 18 }}>
          {loading && <div style={{ color: C.dim, padding: 24 }}>Cargando obras…</div>}
          {!loading && visibles.length === 0 && (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 36, textAlign: "center" }}>
              <Package size={28} color={C.dim} />
              <div style={{ fontWeight: 900, marginTop: 10 }}>No hay revisiones {filtro === "abiertos" ? "pendientes" : "en este filtro"}</div>
              <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Se generan al pasar una obra a terminada, o con Sincronizar si la migración ya está aplicada.</div>
            </div>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {visibles.map((row) => {
              const meta = CIERRE_ESTADOS[row.estado] || CIERRE_ESTADOS.pendiente;
              return (
                <Link
                  key={row.id}
                  to={`/sobrantes-obra/${row.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.3fr) 140px 150px 140px 110px",
                    gap: 10,
                    alignItems: "center",
                    padding: "14px 14px",
                    minHeight: 64,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    background: C.panelSolid,
                    color: C.text,
                    textDecoration: "none",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Ship size={16} color={C.blue} />
                      <span style={{ fontWeight: 950, fontSize: 15 }}>{row.codigo}</span>
                      {row.modelo && <span style={{ color: C.dim, fontWeight: 800 }}>{row.modelo}</span>}
                      <Chip meta={meta} />
                      {row.obra_estado && row.obra_estado !== "terminada" && (
                        <Chip meta={{ color: C.violet, bg: C.violetL, border: C.violetB }}>Reabierta</Chip>
                      )}
                    </span>
                    <span style={{ display: "block", color: C.dim, fontSize: 12, marginTop: 4 }}>
                      Fin {fmtCierreDate(row.fecha_terminacion)}
                      {row.ciclo > 1 ? ` · ciclo ${row.ciclo}` : ""}
                    </span>
                  </span>
                  <span style={{ color: C.dim, fontSize: 12.5 }}>{fmtCierreDate(row.fecha_terminacion)}</span>
                  <span style={{ color: C.text, fontSize: 12.5, fontWeight: 800 }}>{row.responsable_nombre || "Sin asignar"}</span>
                  <span style={{ color: qty(row.items_pendientes) ? C.violet : C.green, fontFamily: C.mono, fontWeight: 950 }}>
                    {row.items_pendientes || 0}
                    <span style={{ color: C.dim, fontWeight: 700, fontSize: 11 }}> / {row.items_total || 0}</span>
                  </span>
                  <span style={{ color: C.blue, fontWeight: 850, fontSize: 12.5 }}>Revisar</span>
                </Link>
              );
            })}
          </div>
        </div>
    </>
  );

  if (embedded) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
        {panel}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <Sidebar profile={profile} signOut={signOut} />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {panel}
      </main>
    </div>
  );
}

export default function SobrantesObraScreen({ profile, signOut }) {
  const { cierreId } = useParams();
  if (cierreId) return <DetalleCierre cierreId={cierreId} profile={profile} signOut={signOut} />;
  return <Navigate to="/stock-panol?tab=sobrantes" replace />;
}
