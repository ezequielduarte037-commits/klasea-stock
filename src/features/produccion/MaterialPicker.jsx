import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check, ChevronDown, Filter, Loader2, Package, PackageSearch, Search, Tag, Truck, X,
} from "lucide-react";
import { C } from "@/theme";
import { buscarMateriales, contarMateriales, fetchProveedores, fetchRubros } from "@/features/produccion/catalogoBusquedaApi";

// ─────────────────────────────────────────────────────────────────────────────
// Selector de materiales del catálogo con filtros por proveedor y rubro, y
// selección múltiple: se marcan varios y se agregan de una sola vez.
//
// Props:
//   onClose()                 cerrar sin agregar
//   onAdd(materiales[])       agregar la tanda seleccionada
//   yaCargados  Set<id>       ids que ya están en la etapa (se muestran y no se pueden re-elegir)
//   titulo                    encabezado del modal
//   alcance     [{...}]|null  si viene, se filtra LOCALMENTE sobre esa lista
//                             (ej: la matriz del modelo) en vez de ir al catálogo
// ─────────────────────────────────────────────────────────────────────────────

const tint = (hex, a) => {
  const h = String(hex || "#64748b").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a / 100})`;
};

/* ── desplegable multi-selección (proveedor / rubro) ──────────────────────── */
function FiltroMulti({ icon, label, opciones, seleccion, onChange, ancho = 190 }) {
  const Icon = icon;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [open]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return opciones;
    return opciones.filter((o) => o.label.toLowerCase().includes(term));
  }, [opciones, q]);

  const activo = seleccion.length > 0;
  const toggle = (valor) => {
    onChange(seleccion.includes(valor) ? seleccion.filter((v) => v !== valor) : [...seleccion, valor]);
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mp-chip"
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 10,
          fontSize: 12.5, fontWeight: 750, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px solid ${activo ? C.violetB : C.border}`,
          background: activo ? C.violetL : C.panel,
          color: activo ? C.violet : C.dim,
        }}
      >
        <Icon size={14} />
        {label}
        {activo && (
          <span style={{ minWidth: 17, padding: "0 5px", borderRadius: 999, background: C.violet, color: "#fff", fontSize: 10.5, fontWeight: 850, lineHeight: "17px", textAlign: "center" }}>
            {seleccion.length}
          </span>
        )}
        <ChevronDown size={13} style={{ opacity: 0.7, transition: "transform .18s ease", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30, width: ancho,
            background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 13,
            boxShadow: "0 18px 40px -16px var(--shadow-strong), 0 4px 12px -6px var(--shadow)",
            overflow: "hidden", animation: "mp-pop .16s cubic-bezier(.34,1.1,.5,1) both",
          }}
        >
          <div style={{ padding: 7, borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filtrar ${label.toLowerCase()}…`}
              style={{
                width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 8, padding: "6px 9px", fontSize: 12, fontFamily: C.sans, outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 232, overflowY: "auto", padding: 5 }}>
            {!visibles.length && (
              <div style={{ padding: "16px 10px", textAlign: "center", color: C.dim, fontSize: 12 }}>Sin resultados</div>
            )}
            {visibles.map((o) => {
              const on = seleccion.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="mp-opt"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8,
                    border: "none", background: on ? C.violetL : "transparent", cursor: "pointer", textAlign: "left",
                    color: on ? C.text : C.muted, fontSize: 12.5, fontWeight: on ? 750 : 550, marginBottom: 2,
                  }}
                >
                  <span style={{
                    width: 15, height: 15, flexShrink: 0, borderRadius: 4, display: "grid", placeItems: "center",
                    border: `1.5px solid ${on ? C.violet : C.border2}`, background: on ? C.violet : "transparent", color: "#fff",
                  }}>
                    {on && <Check size={10} strokeWidth={3.5} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  {o.count != null && <span style={{ flexShrink: 0, fontSize: 10.5, color: C.dim, fontFamily: C.mono }}>{o.count}</span>}
                </button>
              );
            })}
          </div>
          {activo && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mp-opt"
              style={{ width: "100%", padding: "8px 10px", border: "none", borderTop: `1px solid ${C.border}`, background: "transparent", color: C.red, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
            >
              Limpiar {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── modal ────────────────────────────────────────────────────────────────── */
export default function MaterialPicker({ onClose, onAdd, yaCargados, titulo = "Agregar materiales", alcance = null }) {
  const local = Array.isArray(alcance) && alcance.length > 0;

  const [q, setQ] = useState("");
  const [proveedores, setProveedores] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [filtroProv, setFiltroProv] = useState([]);
  const [filtroRubro, setFiltroRubro] = useState([]);
  const [rows, setRows] = useState(local ? alcance : []);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(!local);
  const [sel, setSel] = useState(() => new Map());
  const [guardando, setGuardando] = useState(false);
  const scrimRef = useRef(null);

  const rubroPorId = useMemo(() => new Map(rubros.map((r) => [r.value, r.label])), [rubros]);

  // Facetas: una sola vez por sesión (el módulo las cachea).
  useEffect(() => {
    let alive = true;
    Promise.all([fetchProveedores(), fetchRubros()]).then(([provs, rubs]) => {
      if (!alive) return;
      setProveedores(provs.map((p) => ({ value: p.nombre, label: p.nombre, count: p.count })));
      setRubros(rubs.map((r) => ({ value: r.id, label: r.nombre })));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Búsqueda server-side con debounce. En modo alcance el filtrado es local.
  useEffect(() => {
    if (local) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [res, count] = await Promise.all([
          buscarMateriales({ q, proveedores: filtroProv, rubros: filtroRubro, limit: 60 }),
          contarMateriales({ q, proveedores: filtroProv, rubros: filtroRubro }),
        ]);
        if (alive) { setRows(res); setTotal(count); }
      } catch {
        if (alive) { setRows([]); setTotal(null); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, filtroProv, filtroRubro, local]);

  const filasLocales = useMemo(() => {
    if (!local) return rows;
    const term = q.trim().toLowerCase();
    return alcance.filter((m) => {
      if (filtroProv.length && !filtroProv.includes(m.proveedor)) return false;
      if (filtroRubro.length && !filtroRubro.includes(m.categoria_id)) return false;
      if (!term) return true;
      return `${m.descripcion} ${m.codigo} ${m.proveedor}`.toLowerCase().includes(term);
    });
  }, [local, alcance, rows, q, filtroProv, filtroRubro]);

  const visibles = local ? filasLocales : rows;

  const toggle = useCallback((m) => {
    setSel((prev) => {
      const next = new Map(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.set(m.id, m);
      return next;
    });
  }, []);

  const seleccionables = visibles.filter((m) => !yaCargados?.has(m.id));
  const todosMarcados = seleccionables.length > 0 && seleccionables.every((m) => sel.has(m.id));

  const marcarTodos = () => {
    setSel((prev) => {
      const next = new Map(prev);
      if (todosMarcados) seleccionables.forEach((m) => next.delete(m.id));
      else seleccionables.forEach((m) => next.set(m.id, m));
      return next;
    });
  };

  async function confirmar() {
    if (!sel.size || guardando) return;
    setGuardando(true);
    try { await onAdd([...sel.values()]); }
    finally { setGuardando(false); }
  }

  // Escape cierra; Ctrl/Cmd+Enter confirma.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const hayFiltros = filtroProv.length > 0 || filtroRubro.length > 0;

  return createPortal(
    <div
      ref={scrimRef}
      onMouseDown={(e) => { if (e.target === scrimRef.current) onClose(); }}
      className="mp-scrim"
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "9vh 16px 16px", background: "var(--scrim, rgba(8,8,12,0.44))",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <style>{`
        @keyframes mp-pop{from{opacity:0;transform:scale(.97) translateY(-6px)}to{opacity:1;transform:none}}
        @keyframes mp-scrim{from{opacity:0}to{opacity:1}}
        .mp-scrim{animation:mp-scrim .18s ease both}
        .mp-box{animation:mp-pop .22s cubic-bezier(.34,1.1,.5,1) both}
        .mp-chip{transition:background .14s ease,border-color .14s ease,color .14s ease}
        .mp-chip:hover{border-color:var(--border-2);color:var(--text)}
        .mp-opt:hover{background:var(--panel-2)}
        .mp-item{transition:background .12s ease,border-color .12s ease}
        .mp-item:hover:not(:disabled){background:var(--panel-2)}
        .mp-cta{transition:transform .15s ease,filter .15s ease}
        .mp-cta:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
        .mp-x:hover{background:var(--panel-3);color:var(--text)}
      `}</style>

      <div
        className="mp-box"
        style={{
          width: "min(680px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
          background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
          boxShadow: "0 32px 70px -20px var(--shadow-strong), 0 8px 24px -12px var(--shadow)",
        }}
      >
        {/* título */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px 11px 17px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {titulo}
          </div>
          {local && (
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 850, color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
              Matriz del modelo
            </span>
          )}
          <button type="button" onClick={onClose} className="mp-x" style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, border: "none", background: C.panel2, color: C.dim, cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {/* búsqueda */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 17px", borderBottom: `1px solid ${C.border}` }}>
          <Search size={18} color={C.dim} style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={local ? "Buscar en la matriz del modelo…" : "Buscar por descripción o código…"}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 15, fontWeight: 600, fontFamily: C.sans, padding: "12px 0" }}
          />
        </div>

        {/* filtros */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel, flexWrap: "wrap" }}>
          <Filter size={13} color={C.dim} style={{ flexShrink: 0 }} />
          <FiltroMulti icon={Truck} label="Proveedor" opciones={proveedores} seleccion={filtroProv} onChange={setFiltroProv} ancho={230} />
          <FiltroMulti icon={Tag} label="Rubro" opciones={rubros} seleccion={filtroRubro} onChange={setFiltroRubro} ancho={210} />
          {hayFiltros && (
            <button
              type="button"
              onClick={() => { setFiltroProv([]); setFiltroRubro([]); }}
              style={{ border: "none", background: "transparent", color: C.red, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: "6px 4px" }}
            >
              Limpiar todo
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {seleccionables.length > 0 && (
              <button
                type="button"
                onClick={marcarTodos}
                style={{ border: "none", background: "transparent", color: C.blue, fontSize: 11.5, fontWeight: 800, cursor: "pointer", padding: "6px 2px", whiteSpace: "nowrap" }}
              >
                {todosMarcados ? "Desmarcar visibles" : `Marcar ${seleccionables.length} visibles`}
              </button>
            )}
            <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, whiteSpace: "nowrap" }}>
              {local
                ? `${visibles.length} en matriz`
                : total != null && total > visibles.length
                  ? `${visibles.length} de ${total}`
                  : `${visibles.length}`}
            </span>
          </div>
        </div>

        {/* resultados */}
        <div style={{ flex: 1, minHeight: 140, overflowY: "auto", padding: 8 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, color: C.dim, padding: "34px 14px", fontSize: 13 }}>
              <Loader2 size={16} className="spin" /> Buscando…
            </div>
          )}
          {!loading && !visibles.length && (
            <div style={{ display: "grid", placeItems: "center", gap: 8, textAlign: "center", padding: "34px 14px", color: C.dim }}>
              <PackageSearch size={38} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 13, fontWeight: 700 }}>Sin resultados</div>
              <div style={{ fontSize: 12 }}>{hayFiltros ? "Probá aflojando los filtros." : "Probá con otra palabra o parte del código."}</div>
            </div>
          )}
          {!loading && visibles.map((m) => {
            const ya = yaCargados?.has(m.id);
            const on = sel.has(m.id);
            const rubro = rubroPorId.get(m.categoria_id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={ya}
                onClick={() => toggle(m)}
                className="mp-item"
                style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 11,
                  padding: "9px 11px", borderRadius: 11, marginBottom: 3, cursor: ya ? "default" : "pointer",
                  border: `1px solid ${on ? C.violetB : ya ? C.greenB : "transparent"}`,
                  background: on ? C.violetL : ya ? C.greenL : "transparent",
                  opacity: ya ? 0.72 : 1,
                }}
              >
                <span style={{
                  width: 18, height: 18, flexShrink: 0, borderRadius: 5, display: "grid", placeItems: "center",
                  border: `1.5px solid ${on ? C.violet : ya ? C.green : C.border2}`,
                  background: on ? C.violet : ya ? C.green : "transparent", color: "#fff",
                }}>
                  {(on || ya) && <Check size={12} strokeWidth={3.2} />}
                </span>
                <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: C.panel2, color: C.dim, border: `1px solid ${C.border}` }}>
                  <Package size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</div>
                  <div style={{ display: "flex", gap: 7, marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
                    {m.codigo && <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{m.codigo}</span>}
                    {m.proveedor && <span style={{ color: C.dim, fontSize: 11 }}>· {m.proveedor}</span>}
                    <span style={{ color: C.dim, fontSize: 11 }}>· {m.unidad}</span>
                    {rubro && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "1px 7px" }}>
                        {rubro}
                      </span>
                    )}
                  </div>
                </div>
                {ya && <span style={{ flexShrink: 0, color: C.green, fontSize: 11, fontWeight: 800 }}>Ya está</span>}
              </button>
            );
          })}
        </div>

        {/* barra de acción */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
          borderTop: `1px solid ${C.border}`, background: C.panel,
        }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: sel.size ? C.text : C.dim, fontWeight: sel.size ? 800 : 600 }}>
            {sel.size
              ? `${sel.size} ${sel.size === 1 ? "material seleccionado" : "materiales seleccionados"}`
              : "Tocá los materiales que querés agregar"}
          </div>
          {sel.size > 0 && (
            <button
              type="button"
              onClick={() => setSel(new Map())}
              style={{ border: "none", background: "transparent", color: C.dim, fontSize: 12, fontWeight: 750, cursor: "pointer", flexShrink: 0 }}
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            disabled={!sel.size || guardando}
            onClick={confirmar}
            className="mp-cta"
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 10, padding: "9px 17px",
              border: "none", cursor: !sel.size || guardando ? "default" : "pointer", fontSize: 13, fontWeight: 850,
              background: sel.size ? "linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#3b82f6 100%)" : C.panel2,
              color: sel.size ? "#fff" : C.dim,
              boxShadow: sel.size ? `0 8px 20px -8px ${tint("#7c5cf6", 60)}` : "none",
            }}
          >
            {guardando ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
            {sel.size ? `Agregar ${sel.size}` : "Agregar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
