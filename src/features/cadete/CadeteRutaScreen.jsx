import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, Check, ChevronDown, ChevronUp, ClipboardList,
  MapPin, Plus, Printer, RefreshCw, Trash2, Truck, Wallet, X,
} from "lucide-react";
import { exportRutaPdf } from "@/features/cadete/cadeteRutaPdf";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import {
  addParada, addParadas, createRuta, deleteParada, deleteRuta, fetchCadetes,
  fetchPedidosParaRuta, fetchRutasConParadas, marcarParada, updateParada,
  updateRuta, uploadComprobanteParada,
} from "@/features/cadete/cadeteRutasApi";
// (fetchParadas queda disponible en la API pero acá usamos fetchRutasConParadas)
import { ensureCajaChicaCierreAbierto, fetchCajaChicaEntries } from "@/features/compras/cajaChicaApi";
import CajaChicaPanel from "@/features/compras/CajaChicaPanel";

const TODAY = () => new Date().toISOString().slice(0, 10);

function fmtMoney(v, m = "ARS") {
  const n = Number(v || 0);
  const t = n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return m === "USD" ? `USD ${t}` : `$${t}`;
}
function fmtFecha(v) {
  if (!v) return "-";
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

const PARADA_ESTADO = {
  pendiente: { label: "Pendiente", color: C.amber, bg: C.amberL, border: C.amberB },
  hecho: { label: "Hecho", color: C.green, bg: C.greenL, border: C.greenB },
  no_pude: { label: "No pude", color: C.red, bg: C.redL, border: C.redB },
};

const INP = { width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" };
const LBL = { fontSize: 10, color: C.dim, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4, display: "block" };
const BTN_PRIM = { border: "none", background: C.blue, color: "#fff", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontSize: 13, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 6 };
const BTN_GHOST = { border: `1px solid ${C.border}`, background: "transparent", color: C.text, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800 };

function EstadoBadge({ estado }) {
  const m = PARADA_ESTADO[estado] || PARADA_ESTADO.pendiente;
  return (
    <span style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{m.label}</span>
  );
}

function rutaProgreso(ruta) {
  const ps = ruta.paradas || [];
  const total = ps.length;
  const hechas = ps.filter((p) => p.estado === "hecho").length;
  const noPude = ps.filter((p) => p.estado === "no_pude").length;
  return { total, hechas, noPude, pend: total - hechas - noPude };
}

// ─── Modal: agregar paradas desde pedidos abiertos ──────────────────────────
function PedidosModal({ onClose, onAdd }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({});
  const [q, setQ] = useState("");

  useEffect(() => {
    fetchPedidosParaRuta().then((r) => setRows(r)).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => `${r.title} ${r.proveedor} ${r.obra_codigo}`.toLowerCase().includes(t));
  }, [rows, q]);

  const count = Object.values(sel).filter(Boolean).length;

  function toggle(id) { setSel((s) => ({ ...s, [id]: !s[id] })); }

  function confirmar() {
    const picked = rows.filter((r) => sel[r.id]);
    if (!picked.length) { toast.warning("Elegí al menos un pedido."); return; }
    onAdd(picked.map((r) => ({
      proveedor: r.proveedor || "",
      detalle: [r.title, r.obra_codigo ? `Obra ${r.obra_codigo}` : ""].filter(Boolean).join(" · "),
      request_id: r.id,
    })));
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px,100%)", maxHeight: "82vh", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 950, color: C.text, fontSize: 15 }}>Agregar desde pedidos</div>
          <button type="button" onClick={onClose} style={{ ...BTN_GHOST, padding: "5px 8px" }}><X size={15} /></button>
        </div>
        <div style={{ padding: "10px 15px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, proveedor u obra..." style={INP} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 15px 12px", display: "grid", gap: 6 }}>
          {loading ? <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>Cargando pedidos...</div>
            : filtered.length === 0 ? <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>No hay pedidos abiertos.</div>
              : filtered.map((r) => (
                <label key={r.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 11px", borderRadius: 9, background: sel[r.id] ? C.blueL : C.panelSolid, border: `1px solid ${sel[r.id] ? C.blueB : C.border}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r.id)} style={{ marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, color: C.text, fontSize: 13 }}>{r.title}</div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                      {r.proveedor ? r.proveedor : "sin proveedor"}{r.obra_codigo ? ` · Obra ${r.obra_codigo}` : ""} · {r.status}
                    </div>
                  </div>
                </label>
              ))}
        </div>
        <div style={{ padding: "12px 15px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={BTN_GHOST}>Cancelar</button>
          <button type="button" onClick={confirmar} style={{ ...BTN_PRIM, background: C.green }}><Plus size={15} /> Agregar {count > 0 ? `(${count})` : ""}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de parada (armador de compras) ────────────────────────────────────
function ParadaAdminRow({ parada, idx, total, onMove, onDelete }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: C.panelSolid, border: `1px solid ${C.border}` }}>
      <div style={{ display: "grid", gap: 2 }}>
        <button type="button" disabled={idx === 0} onClick={() => onMove(idx, -1)} style={{ ...BTN_GHOST, padding: "2px 5px", opacity: idx === 0 ? 0.35 : 1 }}><ChevronUp size={13} /></button>
        <div style={{ textAlign: "center", fontSize: 11, fontWeight: 950, color: C.dim }}>{idx + 1}</div>
        <button type="button" disabled={idx === total - 1} onClick={() => onMove(idx, 1)} style={{ ...BTN_GHOST, padding: "2px 5px", opacity: idx === total - 1 ? 0.35 : 1 }}><ChevronDown size={13} /></button>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 850, color: C.text, fontSize: 13.5 }}>{parada.proveedor || "Sin proveedor"}</span>
          <EstadoBadge estado={parada.estado} />
          {parada.request_id && <span style={{ fontSize: 9.5, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "1px 7px", fontWeight: 850 }}>PEDIDO</span>}
        </div>
        {parada.detalle && <div style={{ fontSize: 12, color: C.t2 || C.dim, marginTop: 3 }}>{parada.detalle}</div>}
        {parada.direccion && <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {parada.direccion}</div>}
        {parada.estado === "hecho" && parada.importe != null && <div style={{ fontSize: 12, color: C.green, fontWeight: 850, marginTop: 3, fontFamily: C.mono }}>{fmtMoney(parada.importe, parada.moneda)}</div>}
        {parada.estado === "no_pude" && parada.motivo && <div style={{ fontSize: 11.5, color: C.red, marginTop: 3 }}>Motivo: {parada.motivo}</div>}
      </div>
      <button type="button" onClick={() => onDelete(parada)} title="Quitar" style={{ ...BTN_GHOST, padding: "6px 8px", color: C.red, borderColor: C.redB }}><Trash2 size={14} /></button>
    </div>
  );
}

// ─── Tarjeta de parada (ejecución del cadete) ───────────────────────────────
function ParadaCadeteCard({ parada, idx, onMarcar, onReset, rutaId }) {
  const toast = useToast();
  const [mode, setMode] = useState(null); // null | "hecho" | "no_pude"
  const [importe, setImporte] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [motivo, setMotivo] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const m = PARADA_ESTADO[parada.estado] || PARADA_ESTADO.pendiente;

  async function confirmHecho() {
    if (busy) return;
    setBusy(true);
    try {
      let comprobante_url = null;
      if (file) {
        try { comprobante_url = await uploadComprobanteParada(rutaId, file); }
        catch { toast.warning("No se pudo subir la foto, se marca igual."); }
      }
      await onMarcar(parada, { estado: "hecho", importe, moneda, comprobante_url });
      setMode(null); setImporte(""); setFile(null);
    } catch (e) {
      toast.error(e?.message || "No se pudo marcar.");
    } finally { setBusy(false); }
  }

  async function confirmNoPude() {
    if (busy) return;
    if (!motivo.trim()) { toast.warning("Poné el motivo."); return; }
    setBusy(true);
    try {
      await onMarcar(parada, { estado: "no_pude", motivo });
      setMode(null); setMotivo("");
    } catch (e) {
      toast.error(e?.message || "No se pudo marcar.");
    } finally { setBusy(false); }
  }

  const resuelta = parada.estado !== "pendiente";

  return (
    <div style={{ borderRadius: 12, background: C.panel, border: `1px solid ${resuelta ? m.border : C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 13px", display: "flex", gap: 11, alignItems: "flex-start" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: m.bg, color: m.color, display: "grid", placeItems: "center", fontWeight: 950, fontSize: 13, flexShrink: 0 }}>{idx + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 900, color: C.text, fontSize: 15 }}>{parada.proveedor || "Sin proveedor"}</span>
            <EstadoBadge estado={parada.estado} />
          </div>
          {parada.detalle && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{parada.detalle}</div>}
          {parada.direccion && <div style={{ fontSize: 12.5, color: C.blue, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={13} /> {parada.direccion}</div>}
          {parada.estado === "hecho" && parada.importe != null && <div style={{ fontSize: 13.5, color: C.green, fontWeight: 900, marginTop: 5, fontFamily: C.mono }}>{fmtMoney(parada.importe, parada.moneda)}</div>}
          {parada.estado === "no_pude" && parada.motivo && <div style={{ fontSize: 12.5, color: C.red, marginTop: 5 }}>Motivo: {parada.motivo}</div>}
        </div>
      </div>

      {/* Acciones */}
      {!resuelta && mode === null && (
        <div style={{ display: "flex", gap: 8, padding: "0 13px 13px" }}>
          <button type="button" onClick={() => setMode("hecho")} style={{ ...BTN_PRIM, background: C.green, flex: 1, justifyContent: "center", padding: "11px" }}><Check size={16} /> Hecho</button>
          <button type="button" onClick={() => setMode("no_pude")} style={{ ...BTN_GHOST, color: C.red, borderColor: C.redB, flex: 1, justifyContent: "center", padding: "11px", display: "inline-flex", alignItems: "center", gap: 6 }}><X size={16} /> No pude</button>
        </div>
      )}

      {mode === "hecho" && (
        <div style={{ padding: "0 13px 13px", display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 84px", gap: 8 }}>
            <div>
              <label style={LBL}>¿Cuánto gastaste?</label>
              <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0" autoFocus style={{ ...INP, fontFamily: C.mono, fontSize: 16 }} />
            </div>
            <div>
              <label style={LBL}>Moneda</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} style={{ ...INP, cursor: "pointer" }}><option value="ARS">ARS</option><option value="USD">USD</option></select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => fileRef.current?.click()} style={{ ...BTN_GHOST, display: "inline-flex", alignItems: "center", gap: 6, color: C.blue }}><Camera size={15} /> {file ? "Cambiar foto" : "Foto del remito"}</button>
            {file && <span style={{ fontSize: 12, color: C.green, fontWeight: 800 }}>✓ {file.name.slice(0, 18)}</span>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
          </div>
          <div style={{ fontSize: 11, color: C.dim }}>Se registra como gasto en tu caja chica.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setMode(null); setFile(null); }} style={{ ...BTN_GHOST, flex: 1, textAlign: "center" }}>Cancelar</button>
            <button type="button" onClick={confirmHecho} disabled={busy} style={{ ...BTN_PRIM, background: C.green, flex: 2, justifyContent: "center", opacity: busy ? 0.6 : 1 }}><Check size={16} /> {busy ? "Guardando..." : "Confirmar"}</button>
          </div>
        </div>
      )}

      {mode === "no_pude" && (
        <div style={{ padding: "0 13px 13px", display: "grid", gap: 8 }}>
          <div>
            <label style={LBL}>¿Por qué no pudiste?</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Cerrado, sin stock, no estaba pago..." style={INP} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setMode(null)} style={{ ...BTN_GHOST, flex: 1, textAlign: "center" }}>Cancelar</button>
            <button type="button" onClick={confirmNoPude} disabled={busy} style={{ ...BTN_PRIM, background: C.red, flex: 2, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{busy ? "Guardando..." : "Marcar no pude"}</button>
          </div>
        </div>
      )}

      {resuelta && mode === null && (
        <div style={{ padding: "0 13px 12px" }}>
          <button type="button" onClick={() => onReset(parada)} style={{ ...BTN_GHOST, fontSize: 11.5, padding: "6px 10px", color: C.dim }}>Deshacer</button>
        </div>
      )}
    </div>
  );
}

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = (e) => setM(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return m;
}

// ─── Pantalla ───────────────────────────────────────────────────────────────
export default function CadeteRutaScreen({ profile, signOut, embedded = false }) {
  const toast = useToast();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const isCadete = profile?.role === "cadete";
  const isManager = profile?.is_admin || ["admin", "compras", "tecnica", "oficina"].includes(profile?.role);

  const [view, setView] = useState("ruta"); // ruta | caja (el cadete tiene su caja completa)
  const [cadetes, setCadetes] = useState([]);
  const [cadeteId, setCadeteId] = useState(isCadete ? profile.id : "");
  const [rutas, setRutas] = useState([]);
  const [rutaId, setRutaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);

  // armador
  const [nuevaFecha, setNuevaFecha] = useState(TODAY());
  const [showPedidos, setShowPedidos] = useState(false);
  const [np, setNp] = useState({ proveedor: "", direccion: "", detalle: "" });

  // caja del cadete
  const [cajaSaldo, setCajaSaldo] = useState({ ARS: 0, USD: 0 });
  const [cierreId, setCierreId] = useState(null);

  const targetCadeteId = isCadete ? profile.id : cadeteId;

  const loadRutas = useCallback(async (cid) => {
    if (!cid) { setRutas([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { rows, missingTable: mt } = await fetchRutasConParadas({ cadeteId: cid });
      setMissingTable(!!mt);
      setRutas(rows);
      setRutaId((prev) => (rows.some((r) => r.id === prev) ? prev : (rows[0]?.id || "")));
    } catch (e) {
      toast.error(e?.message || "No se pudieron cargar las rutas.");
    } finally { setLoading(false); }
  }, [toast]);

  const loadCaja = useCallback(async (ownerId) => {
    if (!ownerId) { setCajaSaldo({ ARS: 0, USD: 0 }); return; }
    try {
      const { rows } = await fetchCajaChicaEntries({ ownerId, limit: 1000 });
      const acc = { ARS: 0, USD: 0 };
      for (const r of rows) {
        const cur = r.moneda === "USD" ? "USD" : "ARS";
        acc[cur] += (r.tipo === "ingreso" ? 1 : -1) * Number(r.importe || 0);
      }
      setCajaSaldo(acc);
    } catch { setCajaSaldo({ ARS: 0, USD: 0 }); }
  }, []);

  // carga inicial
  useEffect(() => {
    if (isManager && !isCadete) {
      fetchCadetes().then((cs) => {
        setCadetes(cs);
        setCadeteId((prev) => prev || cs[0]?.id || "");
      }).catch(() => setCadetes([]));
    }
  }, [isManager, isCadete]);

  useEffect(() => { loadRutas(targetCadeteId); }, [targetCadeteId, loadRutas]);
  useEffect(() => { loadCaja(targetCadeteId); }, [targetCadeteId, loadCaja]);

  // el cadete asegura un cierre abierto en su caja para agrupar los gastos
  useEffect(() => {
    if (!isCadete) return;
    ensureCajaChicaCierreAbierto({ ownerId: profile.id, nombre: `Caja ${profile.username || "cadete"}` })
      .then((c) => setCierreId(c?.id || null))
      .catch(() => setCierreId(null));
  }, [isCadete, profile]);

  const ruta = useMemo(() => rutas.find((r) => r.id === rutaId) || null, [rutas, rutaId]);
  const paradas = ruta?.paradas || [];
  const cadeteNombre = isCadete ? (profile.username || "") : (cadetes.find((c) => c.id === targetCadeteId)?.username || "");

  async function imprimirRuta() {
    if (!ruta) return;
    try { await exportRutaPdf({ ruta, paradas, cadeteNombre }); }
    catch (e) { toast.error(e?.message || "No se pudo generar el PDF."); }
  }

  // ── acciones armador ──
  async function crearRuta() {
    if (!targetCadeteId) { toast.warning("Elegí un cadete."); return; }
    try {
      const r = await createRuta({ fecha: nuevaFecha, cadeteId: targetCadeteId });
      toast.success("Ruta creada.");
      await loadRutas(targetCadeteId);
      setRutaId(r.id);
    } catch (e) { toast.error(e?.message || "No se pudo crear la ruta."); }
  }

  async function agregarParadaManual() {
    if (!ruta) return;
    if (!np.proveedor.trim() && !np.detalle.trim()) { toast.warning("Poné al menos proveedor o detalle."); return; }
    try {
      await addParada(ruta.id, { ...np, orden: paradas.length });
      setNp({ proveedor: "", direccion: "", detalle: "" });
      await loadRutas(targetCadeteId);
    } catch (e) { toast.error(e?.message || "No se pudo agregar la parada."); }
  }

  async function agregarDesdePedidos(list) {
    if (!ruta) return;
    try {
      await addParadas(ruta.id, list, paradas.length);
      setShowPedidos(false);
      await loadRutas(targetCadeteId);
      toast.success(`${list.length} parada(s) agregada(s).`);
    } catch (e) { toast.error(e?.message || "No se pudieron agregar."); }
  }

  async function moverParada(idx, dir) {
    const a = paradas[idx];
    const b = paradas[idx + dir];
    if (!a || !b) return;
    try {
      await Promise.all([updateParada(a.id, { orden: b.orden ?? (idx + dir) }), updateParada(b.id, { orden: a.orden ?? idx })]);
      await loadRutas(targetCadeteId);
    } catch (e) { toast.error(e?.message || "No se pudo reordenar."); }
  }

  async function borrarParada(p) {
    try { await deleteParada(p.id); await loadRutas(targetCadeteId); }
    catch (e) { toast.error(e?.message || "No se pudo borrar."); }
  }

  async function borrarRuta() {
    if (!ruta) return;
    if (!window.confirm("¿Borrar esta ruta y todas sus paradas?")) return;
    try { await deleteRuta(ruta.id); await loadRutas(targetCadeteId); }
    catch (e) { toast.error(e?.message || "No se pudo borrar la ruta."); }
  }

  async function cambiarEstadoRuta(estado) {
    if (!ruta) return;
    try { await updateRuta(ruta.id, { estado }); await loadRutas(targetCadeteId); }
    catch (e) { toast.error(e?.message || "No se pudo actualizar."); }
  }

  // ── acciones cadete ──
  async function marcar(parada, opts) {
    await marcarParada(parada, { ...opts, cadeteId: profile.id, cierreId });
    await Promise.all([loadRutas(targetCadeteId), loadCaja(targetCadeteId)]);
  }
  async function resetParada(parada) {
    try {
      await marcarParada(parada, { estado: "pendiente", cadeteId: profile.id });
      await loadRutas(targetCadeteId);
    } catch (e) { toast.error(e?.message || "No se pudo."); }
  }

  const prog = ruta ? rutaProgreso(ruta) : null;

  return (
    <div style={embedded
      ? { display: "flex", flexDirection: "column", height: "80vh", minHeight: 520, background: C.bg, color: C.text, fontFamily: C.sans, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }
      : { position: "fixed", inset: 0, background: C.bg, color: C.text, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      {!embedded && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: isMobile ? "9px 12px" : "11px 15px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {isManager && !isCadete && (
              <button type="button" onClick={() => nav("/")} style={{ ...BTN_GHOST, padding: "6px 9px", display: "inline-flex", alignItems: "center", gap: 5 }}><ArrowLeft size={15} /> Inicio</button>
            )}
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, display: "grid", placeItems: "center", flexShrink: 0 }}><Truck size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 15 }}>Hoja de ruta</div>
              <div style={{ fontSize: 11, color: C.dim }}>{isCadete ? `Hola, ${profile.username}` : "Cadete · retiros y caja"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => loadRutas(targetCadeteId)} title="Actualizar" style={{ ...BTN_GHOST, padding: "7px 9px" }}><RefreshCw size={15} /></button>
            {isCadete && <button type="button" onClick={signOut} style={BTN_GHOST}>Salir</button>}
          </div>
          {isCadete && (
            <div style={{ display: "flex", gap: 6, flex: isMobile ? "1 0 100%" : "0 0 auto", order: isMobile ? 3 : 0 }}>
              {[["ruta", "Hoja de ruta"], ["caja", "Caja chica"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setView(v)} style={{ flex: isMobile ? 1 : "0 0 auto", border: `1px solid ${view === v ? C.blueB : C.border}`, background: view === v ? C.blueL : "transparent", color: view === v ? C.blue : C.text, borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 850 }}>{l}</button>
              ))}
            </div>
          )}
        </header>
      )}

      {missingTable && (
        <div style={{ margin: 14, padding: 14, borderRadius: 10, background: C.amberL, border: `1px solid ${C.amberB}`, color: C.amber, fontSize: 13 }}>
          Falta correr el SQL de la hoja de ruta (tablas <b>cadete_rutas</b> / <b>cadete_ruta_paradas</b>) en Supabase.
        </div>
      )}

      {view === "caja" && isCadete ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
          <CajaChicaPanel lockedOwnerId={profile.id} />
        </div>
      ) : (
      <div style={isMobile
        ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }
        : { flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Columna izquierda: selección de cadete + rutas */}
        <aside style={isMobile
          ? { width: "100%", flexShrink: 0, borderBottom: `1px solid ${C.border}`, padding: 12, display: "grid", gap: 12, alignContent: "start" }
          : { width: isManager && !isCadete ? 300 : 260, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: 13, display: "grid", gap: 12, alignContent: "start" }}>
          {isManager && !isCadete && (
            <div>
              <label style={LBL}>Cadete</label>
              <select value={cadeteId} onChange={(e) => setCadeteId(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
                <option value="">- Elegí un cadete -</option>
                {cadetes.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
              </select>
              {cadetes.length === 0 && <div style={{ fontSize: 11, color: C.dim, marginTop: 5 }}>No hay usuarios con rol "cadete". Creá uno en Configuración.</div>}
            </div>
          )}

          {/* Vistazo de la caja del cadete — solo para compras (el cadete la ve completa en su pestaña "Caja chica") */}
          {!isCadete && (
            <div style={{ borderRadius: 12, background: C.panel, border: `1px solid ${C.border}`, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}><Wallet size={13} /> Caja del cadete</div>
              <div style={{ fontSize: 22, fontWeight: 950, color: cajaSaldo.ARS < 0 ? C.red : C.green, fontFamily: C.mono }}>{fmtMoney(cajaSaldo.ARS, "ARS")}</div>
              {Math.abs(cajaSaldo.USD) > 0.001 && <div style={{ fontSize: 14, fontWeight: 900, color: cajaSaldo.USD < 0 ? C.red : C.green, fontFamily: C.mono, marginTop: 2 }}>{fmtMoney(cajaSaldo.USD, "USD")}</div>}
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 4 }}>saldo (ingresos − gastos)</div>
            </div>
          )}

          {/* Nueva ruta */}
          {(isManager || isCadete) && (
            <div style={{ borderRadius: 12, background: C.panel, border: `1px solid ${C.border}`, padding: 13, display: "grid", gap: 8 }}>
              <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>{isCadete ? "Armar mi ruta" : "Nueva ruta"}</div>
              <input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} style={INP} />
              <button type="button" onClick={crearRuta} disabled={!targetCadeteId} style={{ ...BTN_PRIM, justifyContent: "center", opacity: targetCadeteId ? 1 : 0.5 }}><Plus size={15} /> Crear ruta</button>
            </div>
          )}

          {/* Lista de rutas */}
          <div style={{ display: "grid", gap: 7 }}>
            <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Rutas</div>
            {loading ? <div style={{ color: C.dim, fontSize: 12 }}>Cargando...</div>
              : rutas.length === 0 ? <div style={{ color: C.dim, fontSize: 12 }}>Sin rutas todavía.</div>
                : rutas.map((r) => {
                  const p = rutaProgreso(r);
                  const activa = r.id === rutaId;
                  return (
                    <button key={r.id} type="button" onClick={() => setRutaId(r.id)} style={{ textAlign: "left", border: `1px solid ${activa ? C.blueB : C.border}`, background: activa ? C.blueL : C.panelSolid, borderRadius: 10, padding: "10px 11px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 850, color: C.text, fontSize: 13, textTransform: "capitalize" }}>{fmtFecha(r.fecha)}</span>
                        <span style={{ fontSize: 10, fontWeight: 900, color: r.estado === "cerrada" ? C.dim : C.green, textTransform: "uppercase" }}>{r.estado}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{p.hechas}/{p.total} hechas{p.noPude ? ` · ${p.noPude} no pude` : ""}</div>
                    </button>
                  );
                })}
          </div>
        </aside>

        {/* Columna derecha: detalle de la ruta */}
        <main style={isMobile
          ? { flex: "none", width: "100%", boxSizing: "border-box", padding: 12 }
          : { flex: 1, minWidth: 0, overflowY: "auto", padding: 15 }}>
          {!ruta ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: isMobile ? 160 : "100%", color: C.dim, gap: 8, textAlign: "center", padding: 16 }}>
              <ClipboardList size={40} color={C.dim} />
              <div style={{ fontSize: 14 }}>{isManager ? "Elegí o creá una ruta." : "Todavía no tenés ruta. Creá una arriba (“Armar mi ruta”)."}</div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 13 }}>
              {/* Header de ruta */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950, textTransform: "capitalize" }}>{fmtFecha(ruta.fecha)}</div>
                  {prog && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>{prog.total} paradas · {prog.hechas} hechas · {prog.pend} pendientes{prog.noPude ? ` · ${prog.noPude} no pude` : ""}</div>}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button type="button" onClick={imprimirRuta} style={{ ...BTN_GHOST, color: C.blue, display: "inline-flex", alignItems: "center", gap: 6 }}><Printer size={15} /> Imprimir / PDF</button>
                  {isManager && (ruta.estado !== "cerrada"
                    ? <button type="button" onClick={() => cambiarEstadoRuta("cerrada")} style={BTN_GHOST}>Cerrar ruta</button>
                    : <button type="button" onClick={() => cambiarEstadoRuta("abierta")} style={BTN_GHOST}>Reabrir</button>)}
                  {isManager && <button type="button" onClick={borrarRuta} style={{ ...BTN_GHOST, color: C.red, borderColor: C.redB }}><Trash2 size={14} /></button>}
                </div>
              </div>

              {/* Barra progreso */}
              {prog && prog.total > 0 && (
                <div style={{ height: 8, borderRadius: 999, background: C.panel2 || C.panel, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${(prog.hechas / prog.total) * 100}%`, background: C.green }} />
                  <div style={{ width: `${(prog.noPude / prog.total) * 100}%`, background: C.red }} />
                </div>
              )}

              {/* Paradas */}
              {paradas.length === 0 ? (
                <div style={{ color: C.dim, fontSize: 13, padding: "12px 0" }}>Sin paradas todavía. Agregá abajo.</div>
              ) : isManager && !isCadete ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {paradas.map((p, i) => <ParadaAdminRow key={p.id} parada={p} idx={i} total={paradas.length} onMove={moverParada} onDelete={borrarParada} />)}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {paradas.map((p, i) => <ParadaCadeteCard key={p.id} parada={p} idx={i} rutaId={ruta.id} onMarcar={marcar} onReset={resetParada} />)}
                </div>
              )}

              {/* Agregar paradas */}
              {(isManager || isCadete) && ruta.estado !== "cerrada" && (
                <div style={{ borderRadius: 12, background: C.panel, border: `1px solid ${C.border}`, padding: 14, display: "grid", gap: 9, marginTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>Agregar parada</div>
                    {isManager && <button type="button" onClick={() => setShowPedidos(true)} style={{ ...BTN_GHOST, color: C.blue, display: "inline-flex", alignItems: "center", gap: 6 }}><ClipboardList size={14} /> Desde pedidos</button>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                    <input value={np.proveedor} onChange={(e) => setNp((s) => ({ ...s, proveedor: e.target.value }))} placeholder="Proveedor / comercio" style={INP} />
                    <input value={np.direccion} onChange={(e) => setNp((s) => ({ ...s, direccion: e.target.value }))} placeholder="Dirección (opcional)" style={INP} />
                  </div>
                  <input value={np.detalle} onChange={(e) => setNp((s) => ({ ...s, detalle: e.target.value }))} placeholder="Qué retirar / detalle" style={INP} />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" onClick={agregarParadaManual} style={{ ...BTN_PRIM, background: C.green }}><Plus size={15} /> Agregar parada</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      )}

      {showPedidos && <PedidosModal onClose={() => setShowPedidos(false)} onAdd={agregarDesdePedidos} />}
    </div>
  );
}
