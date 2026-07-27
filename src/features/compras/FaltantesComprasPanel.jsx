import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardList, Clock3,
  Loader2, PackageSearch, RefreshCw, Search, ShoppingCart,
} from "lucide-react";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import {
  actualizarFaltanteCompras,
  FALTANTE_ESTADOS,
  FALTANTES_ABIERTOS,
  faltanteEstadoMeta,
  fetchFaltanteHistorial,
  fetchFaltantesCompras,
} from "@/features/compras/faltantesComprasApi";

const fmt = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : "0";
};

const fecha = (value) => value
  ? new Date(value).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    })
  : "—";

const inputStyle = {
  width: "100%", minWidth: 0, boxSizing: "border-box",
  border: `1px solid ${C.border}`, background: C.panel2, color: C.text,
  borderRadius: 9, padding: "8px 10px", fontFamily: C.sans, fontSize: 12,
  outline: "none",
};

function Stat({ icon, label, value, color }) {
  const StatIcon = icon;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, minWidth: 0,
      padding: "9px 11px", border: `1px solid ${C.border}`,
      background: C.panelSolid, borderRadius: 11,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        display: "grid", placeItems: "center", color, background: `${color}18`,
      }}>
        <StatIcon size={15} />
      </span>
      <div>
        <div style={{ color: C.text, fontFamily: C.mono, fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{value}</div>
        <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function EstadoSelect({ value, onChange, disabled }) {
  const meta = faltanteEstadoMeta(value);
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      style={{
        ...inputStyle, width: "auto", minWidth: 118, padding: "6px 8px",
        color: meta.color, fontWeight: 850, cursor: disabled ? "wait" : "pointer",
        background: `${meta.color}10`, borderColor: `${meta.color}44`,
      }}
    >
      {FALTANTE_ESTADOS.map((estado) => (
        <option key={estado.value} value={estado.value}>{estado.label}</option>
      ))}
    </select>
  );
}

export default function FaltantesComprasPanel({ toast }) {
  const { isMobile } = useResponsive();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("abiertos");
  const [sede, setSede] = useState("todas");
  const [selectedId, setSelectedId] = useState(null);
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchFaltantesCompras());
    } catch (err) {
      setError(err.message || "No se pudieron cargar los faltantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const selected = rows.find((row) => row.id === selectedId) || null;
  useEffect(() => {
    if (!selected) {
      setNotes("");
      setHistory([]);
      return;
    }
    setNotes(selected.notas_compras || "");
    fetchFaltanteHistorial(selected.id).then(setHistory).catch(() => setHistory([]));
  }, [selected]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (estado === "abiertos" && !FALTANTES_ABIERTOS.includes(row.estado)) return false;
      if (estado !== "todos" && estado !== "abiertos" && row.estado !== estado) return false;
      if (sede !== "todas" && row.sede !== sede) return false;
      if (!term) return true;
      return [
        row.descripcion, row.codigo, row.solicitud_numero, row.obra?.codigo,
        row.obra?.descripcion, row.obra_texto, row.solicitud?.solicita,
      ].join(" ").toLowerCase().includes(term);
    });
  }, [estado, q, rows, sede]);

  const abiertos = rows.filter((row) => FALTANTES_ABIERTOS.includes(row.estado)).length;
  const nuevos = rows.filter((row) => row.estado === "nuevo").length;
  const pedidos = rows.filter((row) => row.estado === "pedido" || row.estado === "comprado").length;
  const resueltos = rows.filter((row) => row.estado === "resuelto").length;

  async function actualizar(row, patch) {
    setSaving(row.id);
    try {
      await actualizarFaltanteCompras(row.id, patch);
      await cargar();
      if (patch.notas_compras !== undefined) toast?.success("Nota guardada.");
    } catch (err) {
      toast?.error(err.message || "No se pudo actualizar el faltante.");
    } finally {
      setSaving("");
    }
  }

  const abrirDetalle = (row) => {
    setSelectedId((actual) => actual === row.id ? null : row.id);
  };

  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <section style={{
        display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 13px",
        borderRadius: 12, border: `1px solid ${C.amber}38`,
        background: `linear-gradient(135deg, ${C.amber}13, transparent)`,
      }}>
        <span style={{
          width: 34, height: 34, display: "grid", placeItems: "center", flexShrink: 0,
          borderRadius: 10, color: C.amber, background: `${C.amber}18`,
        }}>
          <PackageSearch size={17} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 900, fontSize: 13 }}>Faltantes detectados en solicitudes de pañol</div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.5, marginTop: 2 }}>
            Aparecen automáticamente cuando pañol marca un ítem sin stock o el sistema detecta cantidad insuficiente. Al dejar de ser faltante, se resuelve solo.
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={loading}
          title="Actualizar"
          style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.dim, borderRadius: 8, padding: 7, cursor: "pointer" }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(120px, 1fr))", gap: 8 }}>
        <Stat icon={AlertTriangle} label="Abiertos" value={abiertos} color={C.red} />
        <Stat icon={Clock3} label="Nuevos" value={nuevos} color={C.amber} />
        <Stat icon={ShoppingCart} label="Pedido / comprado" value={pedidos} color={C.blue} />
        <Stat icon={CheckCircle2} label="Resueltos" value={resueltos} color={C.green} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "minmax(230px, 1fr) 160px 150px",
        gap: 8, padding: 9, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11,
      }}>
        <div style={{ position: "relative", gridColumn: isMobile ? "1 / -1" : "auto" }}>
          <Search size={14} color={C.dim} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Material, código, obra o N°…" style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <select value={estado} onChange={(event) => setEstado(event.target.value)} style={inputStyle}>
          <option value="abiertos">Abiertos</option>
          <option value="todos">Todos los estados</option>
          {FALTANTE_ESTADOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={sede} onChange={(event) => setSede(event.target.value)} style={inputStyle}>
          <option value="todas">Todas las sedes</option>
          <option value="Pampa">Pampa</option>
          <option value="Chubut">Chubut</option>
        </select>
      </div>

      {error && (
        <div style={{ color: C.red, border: `1px solid ${C.red}44`, background: `${C.red}10`, borderRadius: 10, padding: 12, fontSize: 12.5 }}>
          {error}
        </div>
      )}

      {loading && !rows.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim, padding: 18 }}>
          <Loader2 size={16} className="spin" /> Cargando faltantes…
        </div>
      ) : !filtered.length ? (
        <div style={{ textAlign: "center", padding: "38px 18px", border: `1px dashed ${C.border2}`, borderRadius: 12, color: C.dim }}>
          <CheckCircle2 size={28} color={C.green} />
          <div style={{ color: C.text, fontWeight: 850, marginTop: 8 }}>No hay faltantes con este filtro</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>Cuando pañol detecte uno, aparecerá acá automáticamente.</div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.panelSolid }}>
          {!isMobile && (
            <div style={{
              display: "grid", gridTemplateColumns: "minmax(220px, 1.8fr) minmax(130px, 1fr) 120px 145px 132px",
              gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
              color: C.dim, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase",
            }}>
              <span>Material</span><span>Solicitud / obra</span><span>Faltante</span><span>Estado</span><span>Actualizado</span>
            </div>
          )}

          {filtered.map((row) => {
            const meta = faltanteEstadoMeta(row.estado);
            const open = selectedId === row.id;
            return (
              <div key={row.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  type="button"
                  onClick={() => abrirDetalle(row)}
                  style={{
                    width: "100%", border: "none", background: open ? `${meta.color}09` : "transparent",
                    color: C.text, cursor: "pointer", textAlign: "left",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr auto" : "minmax(220px, 1.8fr) minmax(130px, 1fr) 120px 145px 132px",
                    gap: 10, alignItems: "center", padding: isMobile ? "11px 12px" : "9px 12px",
                    fontFamily: C.sans,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: meta.color, flexShrink: 0 }} />
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>{row.descripcion}</strong>
                    </span>
                    <span style={{ display: "block", color: C.dim, fontSize: 10.5, margin: "3px 0 0 14px" }}>
                      {row.codigo || "Sin código"}{row.es_consumible ? " · consumible" : ""} · {row.sede || "Sin sede"}
                    </span>
                  </span>

                  {isMobile ? (
                    <span style={{ textAlign: "right" }}>
                      <strong style={{ display: "block", color: C.red, fontFamily: C.mono, fontSize: 12.5 }}>{fmt(row.cantidad_faltante)} {row.unidad || "u"}</strong>
                      <span style={{ color: meta.color, fontSize: 10.5, fontWeight: 800 }}>{meta.label}</span>
                    </span>
                  ) : (
                    <>
                      <span style={{ minWidth: 0, color: C.muted, fontSize: 11.5 }}>
                        <strong style={{ color: C.text }}>N° {row.solicitud_numero || "—"}</strong>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                          {row.obra?.codigo || row.obra?.descripcion || row.obra_texto || "Sin obra"}
                        </span>
                      </span>
                      <span>
                        <strong style={{ display: "block", color: C.red, fontFamily: C.mono, fontSize: 12.5 }}>{fmt(row.cantidad_faltante)} {row.unidad || "u"}</strong>
                        <span style={{ color: C.dim, fontSize: 10 }}>stock {fmt(row.stock_disponible)} / pide {fmt(row.cantidad_solicitada)}</span>
                      </span>
                      <span onClick={(event) => event.stopPropagation()}>
                        <EstadoSelect value={row.estado} disabled={saving === row.id} onChange={(value) => actualizar(row, { estado: value })} />
                      </span>
                      <span style={{ color: C.dim, fontSize: 10.5 }}>
                        {fecha(row.updated_at)}
                        <span style={{ display: "block", marginTop: 2 }}>{row.actualizado_por?.username || "Sistema"}</span>
                      </span>
                    </>
                  )}
                </button>

                {open && (
                  <div style={{
                    display: "grid", gap: 10, padding: "11px 12px 13px",
                    borderTop: `1px solid ${C.border}`, background: C.panel,
                  }}>
                    {isMobile && (
                      <EstadoSelect value={row.estado} disabled={saving === row.id} onChange={(value) => actualizar(row, { estado: value })} />
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 1fr) minmax(230px, .8fr)", gap: 12 }}>
                      <div>
                        <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Seguimiento de Compras</div>
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          rows={3}
                          placeholder="Proveedor consultado, N° de pedido, fecha estimada…"
                          style={{ ...inputStyle, resize: "vertical", marginTop: 6 }}
                        />
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={saving === row.id}
                            onClick={() => actualizar(row, { notas_compras: notes })}
                            style={{
                              border: `1px solid ${C.blue}55`, background: `${C.blue}15`, color: C.blue,
                              borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 11.5, fontWeight: 850,
                            }}
                          >
                            {saving === row.id ? "Guardando…" : "Guardar nota"}
                          </button>
                          {row.solicitud_id && (
                            <Link
                              to={`/solicitudes-panol?open=${row.solicitud_id}`}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.blue, fontSize: 11.5, fontWeight: 800, textDecoration: "none" }}
                            >
                              <ClipboardList size={13} /> Abrir solicitud <ArrowUpRight size={12} />
                            </Link>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>Registro de cambios</div>
                        <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
                          {history.slice(0, 6).map((entry) => (
                            <div key={entry.id} style={{ display: "flex", gap: 7, color: C.dim, fontSize: 10.5 }}>
                              <span style={{ color: C.muted, fontFamily: C.mono, whiteSpace: "nowrap" }}>{fecha(entry.created_at)}</span>
                              <span>
                                {entry.actor?.username || "Sistema"} · {entry.estado_anterior && entry.estado_anterior !== entry.estado_nuevo
                                  ? `${faltanteEstadoMeta(entry.estado_anterior).label} → ${faltanteEstadoMeta(entry.estado_nuevo).label}`
                                  : entry.accion}
                              </span>
                            </div>
                          ))}
                          {!history.length && <span style={{ color: C.dim, fontSize: 11 }}>Sin cambios manuales todavía.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
