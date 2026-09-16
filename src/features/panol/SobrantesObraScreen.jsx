import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
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
  fetchCierreItems,
  fetchCierreObra,
  fetchCierreRequisitosSinProducto,
  fetchCierreResoluciones,
  fetchCierresObra,
  fetchOperadoresCierre,
  fetchProductosCompatiblesCierre,
  fmtCierreDate,
  fmtCierreQty,
  puedeConciliarExcepciones,
  puedeOperarCierre,
  identificarProductoCierre,
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

function needsReview(item) {
  return qty(item.cantidad_pendiente) > EPS || ["pendiente", "parcial"].includes(item.estado);
}

function itemStatus(item) {
  if (needsReview(item)) return { label: "Sobrante pendiente", color: C.blue };
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
  const pending = qty(item.cantidad_pendiente);
  const [action, setAction] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sede, setSede] = useState(sedeDefault || item.sede_sugerida || "");
  const choices = [
    { key: "recibido", label: "Liberar al stock general", hint: "El material nunca salió de pañol. Se quita la asignación de esta obra y queda disponible para otra.", submit: "Liberar sobrante" },
    { key: "aclaracion", label: "La cantidad no coincide", hint: "Usá esta opción si el saldo del sistema no está físicamente en pañol o necesita revisión.", submit: "Registrar diferencia" },
  ];
  const selected = choices.find((option) => option.key === action);
  const max = pending;
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
    if (await onSubmit(form)) { setAmount(""); setNote(""); setAction(""); }
  }} style={{ display: "grid", gap: 16 }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 750, marginBottom: 4 }}>Este material nunca se egresó</div>
      <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>Sigue en pañol pero reservado para una obra que ya terminó. Elegí qué hacer con ese saldo.</div>
      <div role="group" aria-label="Elegir una acción" style={{ display: "grid", gap: 7 }}>{choices.map(optionButton)}</div>
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
      {action === "recibido" && <label style={labelStyle}>Pañol donde está guardado
        <select value={sede} onChange={(e) => setSede(e.target.value)} disabled={!canOperate || busy} style={inputStyle}>
          <option value="">Elegir pañol…</option>{SEDES_PANOL.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>}
      <label style={labelStyle}>{action === "aclaracion" ? "Explicá la diferencia · obligatorio" : "Nota · opcional"}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canOperate || busy} style={{ ...inputStyle, resize: "vertical" }} />
      </label>
      <button type="submit" disabled={blocked} style={{ ...ghostBtn, justifyContent: "center", background: C.blue, borderColor: C.blue, color: "#fff", minHeight: 46 }}>{busy ? "Guardando…" : selected.submit}</button>
    </div>}
    {!item.material_id && <div style={{ fontSize: 12, color: C.red, lineHeight: 1.5 }}>Falta vincular este material al catálogo para poder liberarlo al stock general.</div>}
  </form>;
}

function MaterialDetail({ item, resoluciones, sedeDefault, canOperate, busy, onResolve, onClose, closed }) {
  const hist = resoluciones.filter((row) => row.item_id === item.id);
  const figures = [
    ["Quedó asignado a la obra", item.cantidad_reservada],
    ["Pendiente de resolver", item.cantidad_pendiente],
    ["Liberado al stock general", item.cantidad_recibida],
    ["Diferencia documentada", item.cantidad_aclaracion],
  ].filter(([, value], index) => index === 0 || qty(value) > EPS);
  return <aside className="sob-detail" aria-label="Detalle del material" style={{ height: "100%", overflowY: "auto", background: C.panelSolid }}>
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.dim, fontSize: 12, fontWeight: 650 }}>SOBRANTE SIN EGRESAR</span>
      <button type="button" disabled={busy} aria-label="Cerrar detalle" onClick={onClose} style={{ ...ghostBtn, padding: 0, width: 44, justifyContent: "center", border: "none" }}><X size={19} /></button>
    </div>
    <div style={{ padding: 20, display: "grid", gap: 20 }}>
      <div><h2 style={{ fontSize: 19, lineHeight: 1.4, margin: "0 0 6px", overflowWrap: "anywhere" }}>{item.descripcion}</h2>
        <div style={{ color: C.dim, fontSize: 12 }}>{[item.codigo, item.unidad, "Nunca salió de pañol"].filter(Boolean).join(" · ")}</div>
      </div>
      <div style={{ padding: 14, borderRadius: 10, background: C.panel, display: "grid", gap: 9 }}>
        {figures.map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13 }}><span style={{ color: C.dim }}>{label}</span><strong style={{ whiteSpace: "nowrap", fontFamily: C.mono }}>{fmtCierreQty(value)} {item.unidad || "u"}</strong></div>)}
      </div>
      {!closed && qty(item.cantidad_pendiente) > EPS
        ? canOperate || busy
          ? <ResolveForm item={item} sedeDefault={sedeDefault} canOperate={canOperate} busy={busy} onSubmit={onResolve} />
          : <p style={{ color: C.dim, fontSize: 13 }}>Tenés acceso de consulta. Un operador de pañol debe registrar los movimientos.</p>
        : <div style={{ display: "flex", gap: 8, alignItems: "center", color: itemStatus(item).color, fontSize: 13 }}><CheckCircle2 size={18} />{qty(item.cantidad_aclaracion) > EPS ? "Diferencia documentada. Requiere autorización al cerrar." : "Este sobrante ya fue liberado al stock general."}</div>}
      {hist.length > 0 && <details style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, minHeight: 32 }}>Ver historial · {hist.length}</summary>
        <div style={{ display: "grid", gap: 14, paddingTop: 10 }}>{hist.map((row) => <div key={row.id} style={{ fontSize: 12, lineHeight: 1.5 }}>
          <strong>{{ recibido_panol: "Liberado al stock general", pendiente_aclaracion: "Diferencia registrada" }[row.tipo] || row.tipo} · {fmtCierreQty(row.cantidad)} {item.unidad || "u"}</strong>
          <div style={{ color: C.dim }}>{new Date(row.created_at).toLocaleString("es-AR")} · {row.usuario_nombre || "Usuario"}</div>
          {row.observacion && <div>{row.observacion}</div>}
        </div>)}</div>
      </details>}
    </div>
  </aside>;
}

function RequisitosSinProducto({ rows, links, selections, onSelect, onIdentify, busyId, canOperate, compact }) {
  if (!rows.length) return null;
  return <section aria-label="Productos pendientes de identificar" style={{ margin: "12px 16px 4px", border: `1px solid ${C.amberB}`, borderRadius: 12, background: C.amberL, overflow: "hidden" }}>
    <div style={{ padding: "13px 14px", display: "flex", alignItems: "flex-start", gap: 10, borderBottom: `1px solid ${C.amberB}` }}>
      <AlertTriangle size={18} color={C.amber} style={{ marginTop: 1, flexShrink: 0 }} />
      <div>
        <div style={{ color: C.text, fontSize: 13.5, fontWeight: 800 }}>Productos por identificar · {rows.length}</div>
        <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45, marginTop: 3 }}>Son requisitos de la matriz, no sobrantes físicos. Elegí qué producto quedó en pañol para incorporarlo correctamente a la revisión.</div>
      </div>
    </div>
    <div style={{ display: "grid" }}>
      {rows.map((row) => {
        const options = links.filter((link) => link.requisito_material_id === row.requisito_material_id);
        const value = selections[row.requisito_material_id] || "";
        const busy = busyId === row.requisito_material_id;
        return <div key={row.requisito_material_id} style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(180px, 1fr) minmax(220px, 1.25fr) auto", gap: 10, alignItems: "center", borderBottom: `1px solid ${C.amberB}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 750, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</div>
            <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>{fmtCierreQty(row.cantidad)} {row.unidad || "u"} sin identificar{row.codigo ? ` · ${row.codigo}` : ""}</div>
          </div>
          {options.length ? <select aria-label={`Producto físico para ${row.descripcion}`} value={value} disabled={!canOperate || busy} onChange={(event) => onSelect(row.requisito_material_id, event.target.value)} style={{ ...inputStyle, minHeight: 38, padding: "5px 9px", fontSize: 12 }}>
            <option value="">Elegir producto físico…</option>
            {options.map(({ producto }) => <option key={producto.id} value={producto.id}>{producto.descripcion}{producto.codigo ? ` · ${producto.codigo}` : ""}{producto.proveedor ? ` · ${producto.proveedor}` : ""}</option>)}
          </select> : <div style={{ color: C.red, fontSize: 12, lineHeight: 1.4 }}>Este requisito no tiene productos compatibles configurados.</div>}
          <button type="button" disabled={!canOperate || busy || !value} onClick={() => onIdentify(row, value)} style={{ ...ghostBtn, minHeight: 38, background: value ? C.blue : C.panelSolid, borderColor: value ? C.blue : C.border, color: value ? "#fff" : C.dim, justifyContent: "center" }}>{busy ? "Identificando…" : "Usar producto"}</button>
        </div>;
      })}
    </div>
  </section>;
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
  const [requisitos, setRequisitos] = useState([]);
  const [productosCompatibles, setProductosCompatibles] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState({});
  const [resoluciones, setResoluciones] = useState([]);
  const [operadores, setOperadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState("");
  const [busyRequirement, setBusyRequirement] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [q, setQ] = useState("");
  const [itemFilter, setItemFilter] = useState("pendientes");
  const [selectedItemId, setSelectedItemId] = useState("");
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
      const [head, lineas, requisitosPendientes, hist, ops] = await Promise.all([
        fetchCierreObra(cierreId),
        fetchCierreItems(cierreId),
        fetchCierreRequisitosSinProducto(cierreId),
        fetchCierreResoluciones(cierreId),
        fetchOperadoresCierre().catch(() => []),
      ]);
      const links = await fetchProductosCompatiblesCierre(requisitosPendientes.map((row) => row.requisito_material_id));
      setCierre(head);
      setItems(lineas);
      setRequisitos(requisitosPendientes);
      setProductosCompatibles(links);
      setResoluciones(hist);
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
      if (itemFilter === "pendientes") return needsReview(item);
      return true;
    });
  }, [items, q, itemFilter, cierre?.estado]);

  const summary = useMemo(() => ({
    pendientes: items.filter((i) =>
      i.estado === "pendiente"
      || i.estado === "parcial"
      || qty(i.cantidad_pendiente) > EPS
    ).length,
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

  async function onIdentifyRequirement(row, productoMaterialId) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setBusyRequirement(row.requisito_material_id);
    try {
      await identificarProductoCierre(cierreId, row.requisito_material_id, productoMaterialId);
      setProductoSeleccionado((prev) => {
        const next = { ...prev };
        delete next[row.requisito_material_id];
        return next;
      });
      toast.success("Producto identificado. Ya aparece como sobrante físico.");
      await cargar();
    } catch (error) {
      toast.error(error.message || "No se pudo identificar el producto.");
    } finally {
      operationInFlight.current = false;
      setBusyRequirement("");
    }
  }

  async function onConciliar() {
    if (operationInFlight.current || loading) return;
    if (requisitos.length) {
      toast.error(`Hay ${requisitos.length} requisito(s) de matriz sin producto físico identificado.`);
      return;
    }
    const hayExcepcion = items.some((i) => i.estado === "excepcion" || qty(i.cantidad_aclaracion) > EPS);
    if (hayExcepcion && !canException) {
      toast.error("Hay diferencias documentadas. La revisión debe finalizarla técnica, administración o compras.");
      return;
    }
    const ok = await confirm({
      title: "¿Finalizar la revisión?",
      message: "Los sobrantes sin egresar ya fueron liberados o quedaron documentados. Esta acción cierra la revisión.",
      confirmLabel: "Finalizar revisión",
    });
    if (!ok || operationInFlight.current) return;
    operationInFlight.current = true;
    setBusyAction(true);
    try {
      const resumen = await conciliarCierreObra(cierreId);
      toast.success("Revisión finalizada.");
      setCierre((prev) => prev ? { ...prev, estado: "conciliada", resumen } : prev);
      await cargar();
    } catch (error) {
      toast.error(error.message || "No se pudo finalizar la revisión.");
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

  const estadoMeta = cierreStatus(cierre?.estado);
  const conciliada = cierre?.estado === "conciliada";
  const selectedItem = items.find((item) => item.id === selectedItemId) || null;
  const completed = Math.max(0, items.length - summary.pendientes);
  const reviewTotal = items.length + requisitos.length;
  const progress = reviewTotal ? Math.round((completed / reviewTotal) * 100) : 100;

  return (
    <div className="sob-screen" style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <ScreenStyles />
      <Sidebar profile={profile} signOut={signOut} />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <header style={{
          padding: isMobile ? "10px 14px" : "12px 20px",
          borderBottom: `1px solid ${C.border}`,
          background: C.panelSolid,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button type="button" aria-label="Volver a sobrantes de obra" onClick={() => nav("/stock-panol?tab=sobrantes")} style={{ ...ghostBtn, width: 40, minHeight: 40, padding: 0, justifyContent: "center" }}><ArrowLeft size={18} /></button>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 21, fontWeight: 800 }}>Sobrantes · {cierre?.codigo || "Obra"}</h1>
                {cierre?.modelo && <span style={{ color: C.dim, fontSize: 13 }}>{cierre.modelo}</span>}
                <Chip meta={estadoMeta} />
              </div>
              <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>Materiales que quedaron en pañol y nunca se egresaron · obra terminada el {fmtCierreDate(cierre?.fecha_terminacion)}</div>
            </div>
          </div>
          {!conciliada && <div style={{ display: "flex", gap: 8 }}>
            <button type="button" title="Actualizar con los últimos movimientos de pañol" onClick={async () => {
              if (operationInFlight.current) return;
              operationInFlight.current = true; setBusyAction(true);
              try { await refrescarCierreItems(cierreId); await cargar(); }
              catch (error) { toast.error(error.message || "No se pudo actualizar."); }
              finally { operationInFlight.current = false; setBusyAction(false); }
            }} disabled={!canOperate || loading || !!busyItem || busyAction} style={{ ...ghostBtn, color: C.dim }}><RefreshCw size={15} />{!isMobile && "Actualizar"}</button>
            <button type="button" title={requisitos.length ? `Hay ${requisitos.length} producto(s) por identificar` : summary.pendientes ? `Todavía quedan ${summary.pendientes} materiales por revisar` : "Cerrar la revisión de materiales"} onClick={onConciliar}
              disabled={!canOperate || loading || !!busyItem || !!busyRequirement || busyAction || summary.pendientes > 0 || requisitos.length > 0}
              style={{ ...ghostBtn, background: summary.pendientes || requisitos.length ? C.panel : C.green, borderColor: summary.pendientes || requisitos.length ? C.border : C.green, color: summary.pendientes || requisitos.length ? C.dim : "#fff" }}>
              <CheckCircle2 size={16} /> Finalizar revisión
            </button>
          </div>}
        </header>

        <section style={{ padding: isMobile ? "10px 14px" : "11px 20px", borderBottom: `1px solid ${C.border}`, background: C.panel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 300px" }}>
            <div style={{ flex: 1, maxWidth: 330, height: 6, borderRadius: 999, background: C.border, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: requisitos.length ? C.amber : progress === 100 ? C.green : C.blue, transition: "width 180ms ease" }} /></div>
            <div style={{ whiteSpace: "nowrap", fontSize: 13 }}><strong>{completed} de {items.length}</strong> revisados{requisitos.length ? ` · ${requisitos.length} por identificar` : summary.pendientes > 0 ? ` · faltan ${summary.pendientes}` : " · listo para cerrar"}</div>
          </div>
          {!conciliada && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.dim }}><User size={14} /> Responsable
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
                style={{ ...inputStyle, width: 175, minHeight: 38, padding: "5px 9px", fontSize: 12 }}
              >
                <option value="">Sin asignar</option>
                {operadores.map((op) => (
                  <option key={op.id} value={op.id}>{op.username}</option>
                ))}
              </select>
            </label>
          )}
        </section>

        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(420px, 1fr) minmax(360px, 440px)", overflow: "hidden" }}>
          {(!isMobile || !selectedItem) && <section aria-label="Materiales de la obra" style={{ minWidth: 0, minHeight: 0, overflow: "auto", borderRight: isMobile ? "none" : `1px solid ${C.border}` }}>
            <div style={{ position: "sticky", top: 0, zIndex: 2, padding: "12px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: C.dim }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…" aria-label="Buscar material" style={{ ...inputStyle, paddingLeft: 35 }} /></div>
              {!conciliada && <div role="group" aria-label="Filtrar materiales" style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 9, padding: 3, background: C.panelSolid }}>
                {[["pendientes", `Pendientes ${summary.pendientes}`], ["todos", `Todos ${items.length}`]].map(([value, label]) => <button key={value} type="button" aria-pressed={itemFilter === value} onClick={() => setItemFilter(value)} style={{ border: "none", borderRadius: 6, minHeight: 36, padding: "0 10px", background: itemFilter === value ? C.blueL : "transparent", color: itemFilter === value ? C.blue : C.dim, fontFamily: C.sans, fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>)}
              </div>}
            </div>
            {!loading && !conciliada && <RequisitosSinProducto rows={requisitos} links={productosCompatibles} selections={productoSeleccionado}
              onSelect={(requisitoId, productoId) => setProductoSeleccionado((prev) => ({ ...prev, [requisitoId]: productoId }))}
              onIdentify={onIdentifyRequirement} busyId={busyRequirement} canOperate={canOperate && !busyAction && !busyItem && !busyRequirement} compact={isMobile} />}
            {loading && <div style={{ color: C.dim, padding: 24 }}>Cargando materiales…</div>}
            {!loading && visibles.length === 0 && <div style={{ padding: 36, textAlign: "center", color: C.dim }}>{requisitos.length ? "Identificá los productos de arriba para continuar con los sobrantes." : items.length === 0 ? "Esta obra no tiene productos para revisar." : itemFilter === "pendientes" ? "No quedan productos pendientes." : "No hay resultados para esa búsqueda."}</div>}
            <div>
              {visibles.map((item) => {
                const status = itemStatus(item); const pending = qty(item.cantidad_pendiente); const selected = selectedItemId === item.id;
                return <button className="sob-row" key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${selected ? C.blue : "transparent"}`, background: selected ? C.blueL : C.panelSolid, color: C.text, padding: "13px 16px", textAlign: "left", fontFamily: C.sans, cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "center" }}>
                  <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</span><span style={{ display: "block", color: C.dim, fontSize: 11.5, marginTop: 4 }}>{[item.codigo, item.unidad, "Nunca egresado"].filter(Boolean).join(" · ")}</span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ textAlign: "right" }}><span style={{ display: "block", color: status.color, fontSize: 12, fontWeight: 700 }}>{status.label}</span>{pending > EPS && <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 3 }}>{fmtCierreQty(pending)} {item.unidad || "u"} por liberar</span>}</span><ChevronRight size={17} color={C.dim} /></span>
                </button>;
              })}
            </div>
          </section>}

          {selectedItem ? <MaterialDetail key={selectedItem.id} item={selectedItem} resoluciones={resoluciones} sedeDefault={sedeDefault}
            canOperate={canOperate && !conciliada && !loading && !busyItem && !busyAction} busy={busyItem === selectedItem.id}
            onResolve={(form) => onResolve(selectedItem, form)} onClose={() => setSelectedItemId("")} closed={conciliada} />
          : !isMobile && <aside style={{ display: "grid", placeItems: "center", padding: 36, background: C.panelSolid, color: C.dim, textAlign: "center" }}><div><Package size={30} strokeWidth={1.5} /><div style={{ marginTop: 12, color: C.text, fontWeight: 700 }}>Elegí un sobrante</div><div style={{ marginTop: 6, maxWidth: 270, fontSize: 13, lineHeight: 1.5 }}>Podés liberarlo al stock general o documentar una diferencia de inventario.</div></div></aside>}
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
                Cada obra terminada muestra el stock que quedó asignado en pañol sin egresar. Entrá para liberarlo o documentar una diferencia.
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
              <RefreshCw size={15} /> {syncing ? "Actualizando…" : "Actualizar obras"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: 14, color: C.dim }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, modelo o responsable…" aria-label="Buscar obras" style={{ ...inputStyle, width: "100%", paddingLeft: 34 }} />
            </div>
            <div role="tablist" aria-label="Estado de revisión" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["abiertos", "Por revisar"], ["conciliada", "Cerradas"], ["todas", "Todas"]].map(([id, label]) => (
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
              <div style={{ fontWeight: 800, marginTop: 10 }}>No hay obras {filtro === "abiertos" ? "por revisar" : "en este filtro"}</div>
              <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Las obras aparecen acá cuando producción las marca como terminadas.</div>
            </div>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {visibles.map((row) => {
              const meta = cierreStatus(row.estado);
              const pendingCount = qty(row.items_pendientes);
              const totalCount = qty(row.items_total);
              const reviewedCount = Math.max(0, totalCount - pendingCount);
              return (
                <Link
                  key={row.id}
                  to={`/sobrantes-obra/${row.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 180px 230px",
                    gap: 18,
                    alignItems: "center",
                    padding: "15px 16px",
                    minHeight: 72,
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
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{row.codigo}</span>
                      {row.modelo && <span style={{ color: C.dim, fontWeight: 650 }}>{row.modelo}</span>}
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
                  {!isMobile && <span><span style={{ display: "block", color: C.dim, fontSize: 11 }}>Responsable</span><span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 650, marginTop: 4 }}>{row.responsable_nombre || "Sin asignar"}</span></span>}
                  {!isMobile && <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                    <span><span style={{ display: "block", color: pendingCount ? C.blue : C.green, fontSize: 13, fontWeight: 750 }}>{pendingCount ? `${pendingCount} materiales pendientes` : "Revisión completa"}</span><span style={{ display: "block", color: C.dim, fontSize: 11.5, marginTop: 4 }}>{reviewedCount} de {totalCount} revisados</span></span>
                    <span style={{ color: C.blue, display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 12.5 }}>{row.estado === "conciliada" ? "Ver" : "Continuar"}<ChevronRight size={16} /></span>
                  </span>}
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
