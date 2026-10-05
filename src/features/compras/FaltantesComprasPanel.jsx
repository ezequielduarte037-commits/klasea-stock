import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ChevronRight, ClipboardList, LoaderCircle, RotateCcw } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import {
  actualizarFaltanteCompras,
  FALTANTE_ESTADOS,
  FALTANTES_ABIERTOS,
  faltanteEstadoMeta,
  fetchFaltanteHistorial,
  fetchFaltantesCompras,
} from "@/features/compras/faltantesComprasApi";
import { fmtFechaHora } from "./modulo";
import { Aviso, Buscar, Cabecera, Chip, Vacio } from "./ui";

// Los mismos colores de siempre para cada estado del faltante, como tonos.
const TONO = { nuevo: "rojo", en_revision: "cian", pedido: "azul", comprado: "violeta", resuelto: "verde", descartado: "neutro" };

const fmt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "0";
};

function EstadoSelect({ value, onChange, disabled }) {
  return (
    <select
      className="ui-input cmp-select-estado"
      data-tono={TONO[value] || "neutro"}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Estado del faltante"
    >
      {FALTANTE_ESTADOS.map((estado) => <option key={estado.value} value={estado.value}>{estado.label}</option>)}
    </select>
  );
}

// Faltantes que el pañol detecta en sus solicitudes (un ítem sin stock o con
// cantidad insuficiente). Aparecen y se resuelven solos; acá Compras los sigue.
export default function FaltantesComprasPanel({ toast }) {
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
    try {
      setRows(await fetchFaltantesCompras());
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar los faltantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (estado === "abiertos" && !FALTANTES_ABIERTOS.includes(row.estado)) return false;
      if (estado !== "todos" && estado !== "abiertos" && row.estado !== estado) return false;
      if (sede !== "todas" && row.sede !== sede) return false;
      if (!term) return true;
      return [row.descripcion, row.codigo, row.solicitud_numero, row.obra?.codigo, row.obra?.descripcion, row.obra_texto, row.solicitud?.solicita]
        .join(" ").toLowerCase().includes(term);
    });
  }, [estado, q, rows, sede]);

  const cuenta = (pred) => rows.filter(pred).length;
  const abiertos = cuenta((r) => FALTANTES_ABIERTOS.includes(r.estado));
  const nuevos = cuenta((r) => r.estado === "nuevo");

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

  function abrirDetalle(row) {
    if (selectedId === row.id) { setSelectedId(null); return; }
    setSelectedId(row.id);
    setNotes(row.notas_compras || "");
    setHistory([]);
    fetchFaltanteHistorial(row.id).then(setHistory).catch(() => setHistory([]));
  }

  return (
    <>
      <Cabecera
        eyebrow="Compras · Planificar"
        titulo="Faltantes del"
        acento="pañol"
        sub={(
          <>
            <b className="mono">{abiertos}</b> abiertos{nuevos > 0 && <> · <b className="mono t" data-tono="rojo">{nuevos}</b> sin mirar</>}
            {" "}· Aparecen solos cuando el pañol marca un ítem sin stock, y se resuelven solos cuando deja de faltar.
          </>
        )}
        acciones={(
          <button type="button" className="cmp-btn-ic" onClick={() => { setLoading(true); void cargar(); }} disabled={loading} title="Volver a leer" aria-label="Volver a leer los faltantes">
            {loading ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
          </button>
        )}
      />

      <div className="cmp-filtros">
        <Buscar value={q} onChange={setQ} placeholder="Material, código, obra o N° de solicitud…" />
        <div className="cmp-filtros desliza" style={{ gap: 2, flex: "1 1 auto" }}>
          <Chip on={estado === "abiertos"} cuenta={abiertos} onClick={() => setEstado("abiertos")}>Abiertos</Chip>
          {FALTANTE_ESTADOS.map((e) => (
            <Chip key={e.value} on={estado === e.value} tono={TONO[e.value]} cuenta={cuenta((r) => r.estado === e.value)} onClick={() => setEstado(estado === e.value ? "abiertos" : e.value)}>{e.label}</Chip>
          ))}
          <Chip on={estado === "todos"} cuenta={rows.length} onClick={() => setEstado("todos")}>Todos</Chip>
        </div>
        <select className="ui-input" style={{ width: "auto", minHeight: 36 }} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
          <option value="todas">Las dos sedes</option>
          <option value="Pampa">Pampa</option>
          <option value="Chubut">Chubut</option>
        </select>
      </div>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {loading && !rows.length ? (
        <Cargando texto="Trayendo los faltantes…" />
      ) : !filtered.length ? (
        <Vacio icono={CheckCircle2} titulo="No hay faltantes con este filtro" texto="Cuando el pañol detecte uno, aparece acá solo." />
      ) : (
        <div className="cmp-falt">
          <div className="cmp-falt-cab"><span>Material</span><span>Solicitud y obra</span><span>Falta</span><span>Estado</span><span>Último cambio</span></div>
          {filtered.map((row) => {
            const meta = faltanteEstadoMeta(row.estado);
            const open = selectedId === row.id;
            return (
              <div key={row.id} className={`cmp-falt-it${open ? " abierto" : ""}`} data-tono={TONO[row.estado] || "neutro"}>
                <div className="cmp-falt-fila" role="button" tabIndex={0} aria-expanded={open} onClick={() => abrirDetalle(row)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirDetalle(row); } }}>
                  <span className="mat">
                    <ChevronRight size={15} className="chev" />
                    <span style={{ minWidth: 0 }}>
                      <b>{row.descripcion}</b>
                      <small>{row.codigo || "Sin código"}{row.es_consumible ? " · consumible" : ""} · {row.sede || "Sin sede"}</small>
                    </span>
                  </span>
                  <span className="sol">
                    <b>N° {row.solicitud_numero || "—"}</b>
                    <small>{row.obra?.codigo || row.obra?.descripcion || row.obra_texto || "Sin obra"}</small>
                  </span>
                  <span className="falta">
                    <b className="mono">{fmt(row.cantidad_faltante)} {row.unidad || "u"}</b>
                    <small>stock {fmt(row.stock_disponible)} · pide {fmt(row.cantidad_solicitada)}</small>
                  </span>
                  <span className="est">
                    <EstadoSelect value={row.estado} disabled={saving === row.id} onChange={(value) => actualizar(row, { estado: value })} />
                  </span>
                  <span className="cuando">
                    <span>{fmtFechaHora(row.updated_at)}</span>
                    <small>{row.actualizado_por?.username || "Sistema"}</small>
                  </span>
                </div>
                {open && (
                  <div className="cmp-falt-det">
                    <div>
                      <div className="cmp-rotulo">Seguimiento de Compras</div>
                      <textarea className="ui-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Proveedor consultado, N° de pedido, fecha estimada…" style={{ marginTop: 6 }} />
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                        <button type="button" className="ui-btn ui-btn-suave chico" disabled={saving === row.id} onClick={() => actualizar(row, { notas_compras: notes })}>
                          {saving === row.id ? "Guardando…" : "Guardar nota"}
                        </button>
                        {row.solicitud_id && (
                          <Link to={`/solicitudes-panol?open=${row.solicitud_id}`} className="cmp-link" style={{ display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
                            <ClipboardList size={13} /> Abrir la solicitud <ArrowUpRight size={12} />
                          </Link>
                        )}
                        <span className="cmp-ayuda">Estado: {meta.label}</span>
                      </div>
                    </div>
                    <div>
                      <div className="cmp-rotulo">Cambios</div>
                      <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
                        {history.slice(0, 6).map((entry) => (
                          <div key={entry.id} className="cmp-ayuda" style={{ display: "flex", gap: 8 }}>
                            <span className="mono" style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtFechaHora(entry.created_at)}</span>
                            <span>
                              {entry.actor?.username || "Sistema"} · {entry.estado_anterior && entry.estado_anterior !== entry.estado_nuevo
                                ? `${faltanteEstadoMeta(entry.estado_anterior).label} → ${faltanteEstadoMeta(entry.estado_nuevo).label}`
                                : entry.accion}
                            </span>
                          </div>
                        ))}
                        {!history.length && <span className="cmp-ayuda">Sin cambios manuales todavía.</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
