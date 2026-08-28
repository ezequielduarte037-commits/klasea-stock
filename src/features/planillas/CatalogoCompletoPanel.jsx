import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, PackageSearch, RotateCcw, Search, SquarePen, X } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { fetchCatalogo } from "@/features/materiales/api";
import { materialMatchScore } from "@/features/panol/materialMatch";
import { rowDelta } from "@/features/panol/panolMovimientos";
import { supabase } from "@/supabaseClient";

/**
 * Todo el catalogo en una lista, con lo que hay libre en el pañol al lado.
 *
 * La ficha para editar ya existe en /catalogo-maestro: esta pantalla no la
 * duplica, la enlaza. Aca se busca y se compara; alla se corrige.
 */

const PAGINA = 150;

function norm(v = "") {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

async function traerStockLibre() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado")
      .range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  // Mismo criterio que el resto de compras: lo apartado para una obra no cuenta
  // como disponible, y los egresos restan.
  const libre = new Map();
  for (const f of filas) {
    if (!f.material_id || f.obra_id) continue;
    const delta = rowDelta(f);
    if (!delta) continue;
    libre.set(f.material_id, (libre.get(f.material_id) || 0) + delta);
  }
  return libre;
}

export default function CatalogoCompletoPanel({ isMobile = false }) {
  const toast = useToast();
  const [data, setData] = useState({ materiales: [], categorias: [] });
  const [libre, setLibre] = useState(() => new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState("todos");
  const [estado, setEstado] = useState("activos");
  const [tope, setTope] = useState(PAGINA);

  const cargar = useCallback(async ({ forzar = false } = {}) => {
    setCargando(true);
    try {
      const [catalogo, stock] = await Promise.all([
        fetchCatalogo({ force: forzar, includeExtras: false, includeDetails: false }),
        traerStockLibre(),
      ]);
      setData(catalogo);
      setLibre(stock);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo cargar el catálogo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setTope(PAGINA); }, [q, rubro, estado]);

  const rubroPorId = useMemo(() => new Map(data.categorias.map((c) => [c.id, c.nombre])), [data.categorias]);

  const filtrados = useMemo(() => {
    const termino = norm(q);
    return data.materiales
      .filter((m) => estado === "todos" || (estado === "activos" ? m.activo !== false : m.activo === false))
      .filter((m) => rubro === "todos" || m.categoria_id === rubro)
      .filter((m) => !termino
        || materialMatchScore(m, q) >= 42
        || norm([m.descripcion, m.alias, m.codigo, m.codigo_barra, m.proveedor].filter(Boolean).join(" ")).includes(termino))
      .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true }));
  }, [data.materiales, estado, q, rubro]);

  function exportar() {
    if (!filtrados.length) return;
    const cabecera = ["Producto", "Código", "Rubro", "Proveedor", "Unidad", "Libre en pañol", "Estado"];
    const filas = filtrados.map((m) => [
      m.descripcion, m.codigo, rubroPorId.get(m.categoria_id) || "Sin rubro", m.proveedor,
      m.unidad_medida, Math.max(0, Math.round((libre.get(m.id) || 0) * 100) / 100),
      m.activo === false ? "Archivado" : "Activo",
    ]);
    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogo-completo.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtrados.length} productos exportados.`);
  }

  const control = {
    border: `1px solid ${C.border2}`, background: "var(--panel-solid)", color: C.text,
    borderRadius: 9, padding: "7px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800,
  };
  const panel = {
    background: "var(--panel-solid)", border: `1px solid ${C.border}`, borderRadius: 13,
    backdropFilter: "var(--glass-filter)", WebkitBackdropFilter: "var(--glass-filter)",
  };
  const th = {
    position: "sticky", top: 0, zIndex: 3, background: "var(--panel-solid)",
    textAlign: "left", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
    color: C.dim, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <style>{`
        .catalogo-fila:hover { background: var(--panel-2); }
        .catalogo-ficha { transition: opacity .15s, border-color .15s, color .15s; }
        @media (hover: hover) {
          .catalogo-ficha { opacity: 0; }
          .catalogo-fila:hover .catalogo-ficha { opacity: 1; }
        }
        .catalogo-ficha:hover { border-color: ${C.blueB}; color: ${C.blue}; }
        .catalogo-ficha:focus-visible { opacity: 1; outline: 2px solid ${C.blue}; outline-offset: 2px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <PackageSearch size={17} color={C.blue} />
        <div style={{ fontSize: 15.5, fontWeight: 950, color: C.text }}>Catálogo completo</div>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: "var(--panel-2)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 10px" }}>
          <span style={{ color: C.text, fontSize: 15, fontWeight: 950, fontFamily: C.mono, fontVariantNumeric: "tabular-nums" }}>{filtrados.length}</span>
          <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>productos</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: "var(--panel-solid)", borderRadius: 9, padding: "6px 10px", minWidth: isMobile ? "100%" : 210 }}>
            <Search size={14} color={C.dim} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, alias, código, proveedor…"
              style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda"
                style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={13} />
              </button>
            ) : null}
          </div>
          <select value={rubro} onChange={(e) => setRubro(e.target.value)} style={control}>
            <option value="todos">Todos los rubros</option>
            {data.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={control}>
            <option value="activos">Activos</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </select>
          <button type="button" onClick={exportar} disabled={!filtrados.length} title="Descargar para Excel"
            style={{ ...control, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Excel
          </button>
          <button type="button" onClick={() => cargar({ forzar: true })} disabled={cargando} aria-label="Actualizar" style={control}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ ...panel, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !data.materiales.length ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Cargando el catálogo…</div>
        </div>
      ) : !filtrados.length ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          Ningún producto coincide.
        </div>
      ) : (
        <div style={{ ...panel, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700, fontFamily: C.sans }}>
            <thead>
              <tr>
                <th style={{ ...th, paddingLeft: 12 }}>Producto</th>
                <th style={th}>Código</th>
                <th style={th}>Rubro</th>
                <th style={th}>Proveedor</th>
                <th style={{ ...th, textAlign: "center" }}>Un.</th>
                <th style={{ ...th, textAlign: "center" }} title="Lo que el pañol tiene sin obra asignada.">Hay en pañol</th>
                <th style={{ ...th, width: 40 }} aria-label="Ficha" />
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, tope).map((m) => {
                const hay = Math.max(0, Math.round((libre.get(m.id) || 0) * 100) / 100);
                return (
                  <tr key={m.id} className="catalogo-fila" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px", maxWidth: 320 }}>
                      <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.descripcion || "(sin descripción)"}
                      </div>
                      {m.activo === false ? (
                        <div style={{ color: C.dim, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3 }}>archivado</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "7px 10px", color: C.dim, fontFamily: C.mono, fontSize: 11.5, fontWeight: 750 }}>{m.codigo || "—"}</td>
                    <td style={{ padding: "7px 10px", color: C.muted, fontSize: 11.5, fontWeight: 750, whiteSpace: "nowrap" }}>{rubroPorId.get(m.categoria_id) || "Sin rubro"}</td>
                    <td style={{ padding: "7px 10px", fontSize: 11.5, fontWeight: 750, whiteSpace: "nowrap", color: m.proveedor ? C.muted : C.red }}>{m.proveedor || "sin proveedor"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: C.dim, fontSize: 11, fontWeight: 750, whiteSpace: "nowrap" }}>{m.unidad_medida || "unidad"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontFamily: C.mono, fontSize: 12.5, fontWeight: 800, color: hay > 0 ? C.text : C.dim, fontVariantNumeric: "tabular-nums" }}>{hay || "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>
                      <button
                        type="button"
                        className="catalogo-ficha"
                        onClick={() => window.open(`/catalogo-maestro?material=${m.id}`, "_blank", "noopener")}
                        title="Abrir la ficha en el catálogo maestro (pestaña nueva) para corregirla"
                        aria-label={`Abrir la ficha de ${m.descripcion}`}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 24, height: 24, borderRadius: 7, cursor: "pointer",
                          border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.dim,
                        }}
                      >
                        <SquarePen size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrados.length > tope ? (
            <div style={{ padding: 12, textAlign: "center", borderTop: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setTope((t) => t + PAGINA)} style={{ ...control, fontWeight: 850 }}>
                Ver {Math.min(PAGINA, filtrados.length - tope)} más · quedan {filtrados.length - tope}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
