import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, Check, ChevronDown, ChevronUp, ClipboardList,
  MapPin, Plus, Printer, RefreshCw, Trash2, Truck, Wallet, X,
} from "lucide-react";
import { exportRutaPdf } from "@/features/cadete/cadeteRutaPdf";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  addParada, addParadas, createRuta, deleteParada, deleteRuta, fetchCadetes,
  fetchPedidosParaRuta, fetchRutasConParadas, marcarParada, updateParada,
  updateRuta, uploadComprobanteParada,
} from "@/features/cadete/cadeteRutasApi";
// (fetchParadas queda disponible en la API pero acá usamos fetchRutasConParadas)
import { ensureCajaChicaCierreAbierto, fetchCajaChicaEntries } from "@/features/compras/cajaChicaApi";
import CajaChicaPanel from "@/features/compras/CajaChicaPanel";
import Cargando from "@/components/ui/Cargando";
import { CSS_COMPRAS_MODULO } from "@/features/compras/estilos";
import { Aviso, Buscar, Modal, Vacio } from "@/features/compras/ui";

// Hoja de ruta del cadete. Compras la arma (dentro de Compras) y el cadete la
// recorre desde el celular (/cadete). Usa las piezas del módulo de Compras.

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
  pendiente: { label: "Pendiente", tono: "cian" },
  hecho: { label: "Hecho", tono: "verde" },
  no_pude: { label: "No pude", tono: "rojo" },
};

function EstadoParada({ estado }) {
  const m = PARADA_ESTADO[estado] || PARADA_ESTADO.pendiente;
  return <span className="cmp-estado" data-tono={m.tono}>{m.label}</span>;
}

function rutaProgreso(ruta) {
  const ps = ruta.paradas || [];
  const total = ps.length;
  const hechas = ps.filter((p) => p.estado === "hecho").length;
  const noPude = ps.filter((p) => p.estado === "no_pude").length;
  return { total, hechas, noPude, pend: total - hechas - noPude };
}

// ─── Agregar paradas desde pedidos abiertos ─────────────────────────────────
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
    <Modal
      icono={ClipboardList}
      titulo="Agregar desde pedidos"
      sub="Cada pedido elegido queda como una parada para retirar."
      onCerrar={onClose}
      pie={(
        <>
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={confirmar} disabled={!count}><Plus size={15} /> Agregar {count > 0 ? count : ""}</button>
        </>
      )}
    >
      <Buscar value={q} onChange={setQ} placeholder="Buscar pedido, proveedor u obra…" ancho />
      {loading ? <Cargando texto="Trayendo los pedidos…" /> : !filtered.length ? (
        <p className="cmp-ayuda">No hay pedidos abiertos{q.trim() ? " que coincidan" : ""}.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {filtered.map((r) => (
            <label key={r.id} className={`cmp-ruta-pick${sel[r.id] ? " on" : ""}`}>
              <input type="checkbox" checked={!!sel[r.id]} onChange={() => toggle(r.id)} />
              <span style={{ minWidth: 0 }}>
                <b>{r.title}</b>
                <small>{r.proveedor || "sin proveedor"}{r.obra_codigo ? ` · Obra ${r.obra_codigo}` : ""} · {r.status}</small>
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Parada, vista de Compras (arma y ordena) ───────────────────────────────
function ParadaAdminRow({ parada, idx, total, onMove, onDelete }) {
  const m = PARADA_ESTADO[parada.estado] || PARADA_ESTADO.pendiente;
  return (
    <div className="cmp-parada" data-tono={m.tono}>
      <div className="orden">
        <button type="button" className="cmp-btn-ic chico" disabled={idx === 0} onClick={() => onMove(idx, -1)} aria-label="Subir"><ChevronUp size={14} /></button>
        <span className="n">{idx + 1}</span>
        <button type="button" className="cmp-btn-ic chico" disabled={idx === total - 1} onClick={() => onMove(idx, 1)} aria-label="Bajar"><ChevronDown size={14} /></button>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="cab">
          <b>{parada.proveedor || "Sin proveedor"}</b>
          <EstadoParada estado={parada.estado} />
          {parada.request_id && <span className="cmp-tag" data-tono="azul">Pedido</span>}
        </div>
        {parada.detalle && <div className="det">{parada.detalle}</div>}
        {parada.direccion && <div className="dir"><MapPin size={12} /> {parada.direccion}</div>}
        {parada.estado === "hecho" && parada.importe != null && <div className="importe mono">{fmtMoney(parada.importe, parada.moneda)}</div>}
        {parada.estado === "no_pude" && parada.motivo && <div className="motivo">Motivo: {parada.motivo}</div>}
        {/* Compras rinde la caja con esto: el remito cruza el gasto contra el comprobante. */}
        {parada.comprobante_url && (
          <a className="cmp-link" href={parada.comprobante_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, textDecoration: "none" }}>
            <Camera size={12} /> Ver remito
          </a>
        )}
      </div>
      <button type="button" className="cmp-btn-ic chico peligro" onClick={() => onDelete(parada)} title="Quitar parada" aria-label="Quitar parada"><Trash2 size={14} /></button>
    </div>
  );
}

// ─── Parada, vista del cadete (la recorre) ──────────────────────────────────
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
        catch (e) {
          // El motivo real importa: casi siempre es permiso del bucket, y
          // tragárselo hacía imposible distinguir "no subió" de "subió pero no
          // se ve". Se sigue marcando igual porque el cadete está en la calle.
          toast.warning(`No se pudo subir la foto (${e?.message || "error desconocido"}). La parada se marca igual.`);
        }
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
    <div className={`cmp-parada-cad${resuelta ? " resuelta" : ""}`} data-tono={m.tono}>
      <div className="cuerpo">
        <span className="n">{idx + 1}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="cab"><b>{parada.proveedor || "Sin proveedor"}</b><EstadoParada estado={parada.estado} /></div>
          {parada.detalle && <div className="det">{parada.detalle}</div>}
          {parada.direccion && <div className="dir"><MapPin size={13} /> {parada.direccion}</div>}
          {parada.estado === "hecho" && parada.importe != null && <div className="importe mono">{fmtMoney(parada.importe, parada.moneda)}</div>}
          {parada.estado === "no_pude" && parada.motivo && <div className="motivo">Motivo: {parada.motivo}</div>}
          {/* El remito se subía y quedaba invisible; ahora se ve. */}
          {parada.comprobante_url && (
            <a className="cmp-parada-remito" href={parada.comprobante_url} target="_blank" rel="noreferrer">
              <img src={parada.comprobante_url} alt="Remito" /> Ver remito
            </a>
          )}
        </div>
      </div>

      {!resuelta && mode === null && (
        <div className="acc">
          <button type="button" className="ui-btn" data-tono="verde" onClick={() => setMode("hecho")}><Check size={16} /> Hecho</button>
          <button type="button" className="ui-btn" data-tono="rojo" onClick={() => setMode("no_pude")}><X size={16} /> No pude</button>
        </div>
      )}

      {mode === "hecho" && (
        <div className="form">
          <div className="cmp-form">
            <label className="cmp-campo c4"><span>¿Cuánto gastaste?</span>
              <input className="ui-input num" value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0" autoFocus style={{ fontSize: 16 }} />
            </label>
            <label className="cmp-campo c2"><span>Moneda</span>
              <select className="ui-input" value={moneda} onChange={(e) => setMoneda(e.target.value)}><option value="ARS">ARS</option><option value="USD">USD</option></select>
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => fileRef.current?.click()}><Camera size={15} /> {file ? "Cambiar foto" : "Foto del remito"}</button>
            {file && <span className="cmp-ayuda" style={{ color: "var(--green)" }}>✓ {file.name.slice(0, 22)}</span>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
          </div>
          <p className="cmp-ayuda">Se registra como gasto en tu caja chica.</p>
          <div className="acc">
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => { setMode(null); setFile(null); }}>Cancelar</button>
            <button type="button" className="ui-btn" data-tono="verde" onClick={confirmHecho} disabled={busy}><Check size={16} /> {busy ? "Guardando…" : "Confirmar"}</button>
          </div>
        </div>
      )}

      {mode === "no_pude" && (
        <div className="form">
          <label className="cmp-campo c6"><span>¿Por qué no pudiste?</span>
            <input className="ui-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Cerrado, sin stock, no estaba pago…" />
          </label>
          <div className="acc">
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setMode(null)}>Cancelar</button>
            <button type="button" className="ui-btn" data-tono="rojo" onClick={confirmNoPude} disabled={busy}>{busy ? "Guardando…" : "Marcar no pude"}</button>
          </div>
        </div>
      )}

      {resuelta && mode === null && (
        <div className="acc" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => onReset(parada)}>Deshacer</button>
        </div>
      )}
    </div>
  );
}

// ─── Pantalla ───────────────────────────────────────────────────────────────
export default function CadeteRutaScreen({ profile, signOut, embedded = false }) {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
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

  useEffect(() => {
    const t = window.setTimeout(() => { void loadRutas(targetCadeteId); }, 0);
    return () => window.clearTimeout(t);
  }, [targetCadeteId, loadRutas]);
  useEffect(() => {
    const t = window.setTimeout(() => { void loadCaja(targetCadeteId); }, 0);
    return () => window.clearTimeout(t);
  }, [targetCadeteId, loadCaja]);

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

  async function agregarParadaManual(e) {
    e?.preventDefault();
    if (!ruta) return;
    if (!np.proveedor.trim() && !np.detalle.trim()) { toast.warning("Poné al menos proveedor o detalle."); return; }
    try {
      await addParada(ruta.id, { ...np, orden: paradas.length });
      setNp({ proveedor: "", direccion: "", detalle: "" });
      await loadRutas(targetCadeteId);
    } catch (err) { toast.error(err?.message || "No se pudo agregar la parada."); }
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
    const ok = await confirm({ title: "Borrar la ruta", message: "Se borra la ruta con todas sus paradas.", confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
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
  const armaCompras = isManager && !isCadete;

  const contenido = (
    <>
      {missingTable && (
        <Aviso tono="cian">Falta correr el SQL de la hoja de ruta (tablas <b>cadete_rutas</b> / <b>cadete_ruta_paradas</b>) en Supabase.</Aviso>
      )}

      {view === "caja" && isCadete ? (
        <CajaChicaPanel lockedOwnerId={profile.id} />
      ) : (
        <div className="cmp-ruta">
          {/* Lado: de quién es, su caja, crear y elegir la ruta */}
          <aside className="cmp-ruta-lado">
            {armaCompras && (
              <label className="cmp-campo c6"><span>Cadete</span>
                <select className="ui-input" value={cadeteId} onChange={(e) => setCadeteId(e.target.value)}>
                  <option value="">Elegí un cadete…</option>
                  {cadetes.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
                </select>
                {cadetes.length === 0 && <span className="cmp-ayuda">No hay usuarios con rol "cadete". Se crean en Configuración.</span>}
              </label>
            )}

            {/* La caja del cadete de un vistazo (el cadete la ve completa en su pestaña). */}
            {!isCadete && (
              <div className="cmp-lado-card">
                <div className="cmp-lado-tit"><Wallet size={13} /> Caja del cadete</div>
                <b className="mono cmp-ruta-saldo" data-tono={cajaSaldo.ARS < 0 ? "rojo" : "verde"}>{fmtMoney(cajaSaldo.ARS, "ARS")}</b>
                {Math.abs(cajaSaldo.USD) > 0.001 && <b className="mono" style={{ color: cajaSaldo.USD < 0 ? "var(--red)" : "var(--green)" }}>{fmtMoney(cajaSaldo.USD, "USD")}</b>}
                <span className="cmp-ayuda">Saldo: lo que le dieron menos lo que gastó.</span>
              </div>
            )}

            {(isManager || isCadete) && (
              <div className="cmp-lado-card">
                <div className="cmp-lado-tit">{isCadete ? "Armar mi ruta" : "Nueva ruta"}</div>
                <input type="date" className="ui-input" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} aria-label="Fecha de la ruta" />
                <button type="button" className="ui-btn ui-btn-primario" onClick={crearRuta} disabled={!targetCadeteId}><Plus size={15} /> Crear ruta</button>
              </div>
            )}

            <div style={{ display: "grid", gap: 6 }}>
              <div className="cmp-rotulo">Rutas</div>
              {loading ? <Cargando compacto /> : rutas.length === 0 ? <p className="cmp-ayuda">Sin rutas todavía.</p> : rutas.map((r) => {
                const p = rutaProgreso(r);
                const activa = r.id === rutaId;
                return (
                  <button key={r.id} type="button" className={`cmp-caja-op${activa ? " on" : ""}`} onClick={() => setRutaId(r.id)}>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ textTransform: "capitalize" }}>{fmtFecha(r.fecha)}</b>
                      <small>{p.hechas} de {p.total} hechas{p.noPude ? ` · ${p.noPude} no pude` : ""}</small>
                    </span>
                    <span className="cmp-estado" data-tono={r.estado === "cerrada" ? "neutro" : "verde"}>{r.estado === "cerrada" ? "Cerrada" : "Abierta"}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* La ruta elegida */}
          <section className="cmp-ruta-main">
            {!ruta ? (
              <Vacio icono={ClipboardList} titulo={armaCompras ? "Elegí o creá una ruta" : "Todavía no tenés ruta"} texto={armaCompras ? "Las paradas se arman acá: a mano o desde los pedidos abiertos." : "Creala con «Armar mi ruta»."} />
            ) : (
              <>
                <div className="cmp-ruta-cab">
                  <div style={{ minWidth: 0 }}>
                    <h2 className="cmp-ruta-fecha">{fmtFecha(ruta.fecha)}</h2>
                    {prog && <p className="cmp-sub" style={{ marginTop: 2 }}><b className="mono">{prog.total}</b> paradas · <b className="mono">{prog.hechas}</b> hechas · <b className="mono">{prog.pend}</b> pendientes{prog.noPude ? <> · <b className="mono">{prog.noPude}</b> no pude</> : null}</p>}
                  </div>
                  <div className="cmp-acciones" style={{ width: "auto" }}>
                    <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={imprimirRuta}><Printer size={14} /> Imprimir</button>
                    {isManager && (ruta.estado !== "cerrada"
                      ? <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => cambiarEstadoRuta("cerrada")}>Cerrar ruta</button>
                      : <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => cambiarEstadoRuta("abierta")}>Reabrir</button>)}
                    {isManager && <button type="button" className="cmp-btn-ic chico peligro" onClick={borrarRuta} aria-label="Borrar ruta" title="Borrar ruta"><Trash2 size={14} /></button>}
                  </div>
                </div>

                {prog && prog.total > 0 && (
                  <div className="cmp-ruta-barra" aria-hidden="true">
                    <i style={{ width: `${(prog.hechas / prog.total) * 100}%`, background: "var(--green)" }} />
                    <i style={{ width: `${(prog.noPude / prog.total) * 100}%`, background: "var(--red)" }} />
                  </div>
                )}

                {paradas.length === 0 ? (
                  <p className="cmp-ayuda">Sin paradas todavía. Agregalas abajo.</p>
                ) : armaCompras ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {paradas.map((p, i) => <ParadaAdminRow key={p.id} parada={p} idx={i} total={paradas.length} onMove={moverParada} onDelete={borrarParada} />)}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {paradas.map((p, i) => <ParadaCadeteCard key={p.id} parada={p} idx={i} rutaId={ruta.id} onMarcar={marcar} onReset={resetParada} />)}
                  </div>
                )}

                {(isManager || isCadete) && ruta.estado !== "cerrada" && (
                  <form className="cmp-bloque" onSubmit={agregarParadaManual}>
                    <div className="cmp-bloque-cab">
                      <div style={{ minWidth: 0 }}>
                        <h3 className="cmp-bloque-tit">Agregar parada</h3>
                      </div>
                      {isManager && <div className="der"><button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setShowPedidos(true)}><ClipboardList size={14} /> Desde pedidos</button></div>}
                    </div>
                    <div className="cmp-bloque-cuerpo cmp-form">
                      <label className="cmp-campo"><span>Proveedor o comercio</span>
                        <input className="ui-input" value={np.proveedor} onChange={(e) => setNp((s) => ({ ...s, proveedor: e.target.value }))} placeholder="Ej.: Casa Iriarte" />
                      </label>
                      <label className="cmp-campo"><span>Dirección</span>
                        <input className="ui-input" value={np.direccion} onChange={(e) => setNp((s) => ({ ...s, direccion: e.target.value }))} placeholder="Opcional" />
                      </label>
                      <label className="cmp-campo c6"><span>Qué retirar</span>
                        <input className="ui-input" value={np.detalle} onChange={(e) => setNp((s) => ({ ...s, detalle: e.target.value }))} placeholder="Ej.: 4 rollos de cinta, pagar factura 123…" />
                      </label>
                      <div className="cmp-campo c6" style={{ justifyItems: "end" }}>
                        <button type="submit" className="ui-btn ui-btn-primario chico"><Plus size={14} /> Agregar parada</button>
                      </div>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {showPedidos && <PedidosModal onClose={() => setShowPedidos(false)} onAdd={agregarDesdePedidos} />}
    </>
  );

  // Dentro de Compras: la cabecera la pone el módulo.
  if (embedded) {
    return (
      <div className="cmp-ambito" style={{ display: "grid", gap: 14, minWidth: 0 }}>
        <style href="klasea-compras" precedence="default">{CSS_COMPRAS_MODULO}</style>
        {contenido}
      </div>
    );
  }

  // Pantalla propia del cadete (y de Compras cuando entra por /cadete).
  return (
    <div className="cmp-ambito cmp-ruta-pantalla">
      <style href="klasea-compras" precedence="default">{CSS_COMPRAS_MODULO}</style>
      <header className="cmp-ruta-top">
        {isManager && !isCadete && (
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => nav("/")}><ArrowLeft size={15} /> Inicio</button>
        )}
        <span className="cmp-bloque-ic"><Truck size={17} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>Hoja de ruta</div>
          <div className="cmp-ayuda">{isCadete ? `Hola, ${profile.username}` : "Cadete · retiros y caja"}</div>
        </div>
        <button type="button" className="cmp-btn-ic" onClick={() => loadRutas(targetCadeteId)} title="Volver a leer" aria-label="Volver a leer"><RefreshCw size={15} /></button>
        {isCadete && <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={signOut}>Salir</button>}
        {isCadete && (
          <div className="cmp-seg cmp-ruta-vistas" role="radiogroup" aria-label="Qué ver">
            {[["ruta", "Hoja de ruta"], ["caja", "Caja chica"]].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
        )}
      </header>
      <main className="cmp-ruta-scroll">{contenido}</main>
    </div>
  );
}
