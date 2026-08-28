import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, LoaderCircle, RotateCcw, Search, TriangleAlert, Wallet, X } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { calcularCostoDeObras } from "@/features/planillas/costoObraApi";

/**
 * La plata puesta en materiales, obra por obra.
 *
 * Lo primero que muestra no es el numero: es cuanto del numero se puede creer.
 * Solo el 45% de los renglones tiene precio cargado, y la cobertura cambia
 * muchisimo entre obras -de 98% a 20%-, asi que comparar dos totales sin mirar
 * la cobertura lleva a la conclusion contraria a la correcta.
 */

const plata = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-AR")}`;

/** Cuanto se le puede creer al total de esta obra. */
function confianza(cobertura) {
  if (cobertura >= 0.85) return { texto: "casi completo", color: C.green, fondo: C.greenL, borde: C.greenB };
  if (cobertura >= 0.5) return { texto: "a medias", color: C.cyan, fondo: C.cyanL, borde: C.cyanB };
  return { texto: "muy incompleto", color: C.red, fondo: C.redL, borde: C.redB };
}

function Chip({ valor, etiqueta, color = C.text, ayuda }) {
  return (
    <div title={ayuda} style={{
      display: "inline-flex", alignItems: "baseline", gap: 6,
      background: "var(--panel-2)", border: `1px solid ${C.border}`,
      borderRadius: 9, padding: "5px 10px", whiteSpace: "nowrap",
    }}>
      <span style={{ color, fontSize: 15, fontWeight: 950, fontFamily: C.mono, fontVariantNumeric: "tabular-nums" }}>{valor}</span>
      <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>{etiqueta}</span>
    </div>
  );
}

/** Barra que reparte el total en entregado / en pañol / pendiente. */
function Barra({ obra }) {
  const total = obra.total || 1;
  const tramos = [
    { valor: obra.entregado, color: C.green, nombre: "entregado" },
    { valor: obra.enPanol, color: C.cyan, nombre: "en pañol" },
    { valor: obra.pendiente, color: C.red, nombre: "pendiente" },
  ].filter((t) => t.valor > 0);
  return (
    <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", background: "var(--panel-2)", minWidth: 80 }}>
      {tramos.map((t) => (
        <div key={t.nombre} title={`${t.nombre}: ${plata(t.valor)}`} style={{ width: `${(t.valor / total) * 100}%`, background: t.color }} />
      ))}
    </div>
  );
}

export default function CostoObraPanel({ isMobile = false }) {
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [linea, setLinea] = useState("todas");
  const [abierta, setAbierta] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await calcularCostoDeObras());
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo calcular el costo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const obras = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    return datos.obras
      .filter((o) => linea === "todas" || o.linea === linea)
      .filter((o) => !q || o.codigo.toLowerCase().includes(q) || o.linea.toLowerCase().includes(q));
  }, [datos, busqueda, linea]);

  function exportar() {
    if (!obras.length) return;
    const cabecera = ["Obra", "Línea", "Entregado", "En pañol", "Pendiente", "Total", "Renglones", "Con precio", "Sin precio", "Cobertura"];
    const filas = obras.map((o) => [
      o.codigo, o.linea, o.entregado, o.enPanol, o.pendiente, o.total,
      o.renglones, o.conPrecio, o.sinPrecio, `${Math.round(o.cobertura * 100)}%`,
    ]);
    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "costo-por-obra.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${obras.length} obras exportadas.`);
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
    textAlign: "right", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
    color: C.dim, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <style>{`
        .costo-fila:hover { background: var(--panel-2); }
        .costo-fila:focus-visible { outline: 2px solid ${C.blue}; outline-offset: -2px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Wallet size={17} color={C.blue} />
        <div style={{ fontSize: 15.5, fontWeight: 950, color: C.text }}>Costo por obra</div>

        {datos ? (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Chip valor={plata(datos.resumen.total)} etiqueta="en materiales" ayuda="Suma de lo entregado, lo que espera en el pañol y lo pendiente." />
            <Chip valor={plata(datos.resumen.entregado)} etiqueta="ya en el barco" color={C.green} />
            <Chip valor={plata(datos.resumen.enPanol)} etiqueta="en pañol" color={C.cyan} />
            <Chip valor={plata(datos.resumen.pendiente)} etiqueta="pendiente" color={C.red} />
          </div>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: "var(--panel-solid)", borderRadius: 9, padding: "6px 10px", minWidth: isMobile ? "100%" : 170 }}>
            <Search size={14} color={C.dim} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Obra o línea…"
              style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
            />
            {busqueda ? (
              <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda"
                style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={13} />
              </button>
            ) : null}
          </div>
          <select value={linea} onChange={(e) => setLinea(e.target.value)} style={control}>
            <option value="todas">Todas las líneas</option>
            {(datos?.lineas ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" onClick={exportar} disabled={!obras.length} title="Descargar para Excel"
            style={{ ...control, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Excel
          </button>
          <button type="button" onClick={cargar} disabled={cargando} aria-label="Actualizar" style={control}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
          </button>
        </div>
      </div>

      {/* Lo primero que hay que leer, antes que cualquier numero. */}
      {datos ? (
        <div style={{ ...panel, borderColor: C.redB, background: C.redL, padding: "10px 13px", display: "flex", alignItems: "flex-start", gap: 9 }}>
          <TriangleAlert size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.45 }}>
            <b style={{ fontWeight: 900 }}>Esto es un piso, no el costo real.</b>{" "}
            Solo <b style={{ fontWeight: 900 }}>{Math.round(datos.resumen.cobertura * 100)}%</b> de los renglones tiene precio cargado
            ({datos.resumen.materialesSinPrecio} materiales distintos no lo tienen). La cobertura cambia mucho entre obras,
            así que <b style={{ fontWeight: 900 }}>comparar dos totales sin mirar la columna de cobertura lleva a la conclusión contraria</b> a
            la correcta. Abrí una obra para ver qué materiales le faltan precio.
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...panel, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Sumando la plata de cada obra…</div>
        </div>
      ) : !obras.length ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          No hay obras que coincidan.
        </div>
      ) : (
        <div style={{ ...panel, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontFamily: C.sans }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>Obra</th>
                <th style={{ ...th, textAlign: "left", minWidth: 110 }}>Reparto</th>
                <th style={th}>Entregado</th>
                <th style={th}>En pañol</th>
                <th style={th}>Pendiente</th>
                <th style={{ ...th, color: C.text }}>Total</th>
                <th style={{ ...th, textAlign: "center" }} title="Qué parte de los renglones de esta obra tiene precio cargado.">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {obras.flatMap((o) => {
                const conf = confianza(o.cobertura);
                const desplegada = abierta === o.id;
                const fila = (
                  <tr
                    key={o.id}
                    className="costo-fila"
                    tabIndex={0}
                    onClick={() => setAbierta(desplegada ? "" : o.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbierta(desplegada ? "" : o.id); } }}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: desplegada ? "var(--panel-2)" : "transparent" }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <ChevronRight size={13} color={C.dim} style={{ transform: desplegada ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{o.codigo}</div>
                          <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>{o.linea} · {o.renglones} renglones</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", minWidth: 110 }}><Barra obra={o} /></td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: C.mono, fontSize: 12, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>{o.entregado ? plata(o.entregado) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: C.mono, fontSize: 12, fontWeight: 800, color: C.cyan, fontVariantNumeric: "tabular-nums" }}>{o.enPanol ? plata(o.enPanol) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: C.mono, fontSize: 12, fontWeight: 800, color: C.red, fontVariantNumeric: "tabular-nums" }}>{o.pendiente ? plata(o.pendiente) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: C.mono, fontSize: 13, fontWeight: 950, color: C.text, fontVariantNumeric: "tabular-nums" }}>{plata(o.total)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span title={`${o.conPrecio} de ${o.renglones} renglones tienen precio. ${o.sinPrecio} no.`} style={{
                        display: "inline-block", background: conf.fondo, border: `1px solid ${conf.borde}`, color: conf.color,
                        borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
                      }}>
                        {Math.round(o.cobertura * 100)}% · {conf.texto}
                      </span>
                    </td>
                  </tr>
                );
                if (!desplegada) return [fila];
                return [fila, (
                  <tr key={`${o.id}-detalle`} style={{ borderBottom: `1px solid ${C.border}`, background: "var(--panel-2)" }}>
                    <td colSpan={7} style={{ padding: "10px 14px 14px 32px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                        <div>
                          <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>En qué se va la plata</div>
                          {o.porRubro.length ? o.porRubro.slice(0, 8).map((r) => (
                            <div key={r.nombre} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                              <div style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 12, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                              <div style={{ width: 76, height: 5, borderRadius: 3, background: "var(--panel-solid)", overflow: "hidden", flexShrink: 0 }}>
                                <div style={{ width: `${(r.monto / (o.porRubro[0].monto || 1)) * 100}%`, height: "100%", background: C.blue }} />
                              </div>
                              <div style={{ fontFamily: C.mono, fontSize: 11.5, fontWeight: 850, color: C.muted, minWidth: 86, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{plata(r.monto)}</div>
                            </div>
                          )) : <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>No hay renglones con precio.</div>}
                        </div>
                        <div>
                          <div style={{ color: C.red, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                            Sin precio ({o.faltanPrecio.length} materiales) · esto es lo que falta cargar
                          </div>
                          {o.faltanPrecio.length ? o.faltanPrecio.slice(0, 8).map((m) => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                              <a
                                href={`/catalogo-maestro?material=${m.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ flex: 1, minWidth: 0, color: C.blue, fontSize: 12, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}
                              >
                                {m.descripcion || "(sin descripción)"}
                              </a>
                              <div style={{ fontFamily: C.mono, fontSize: 11.5, fontWeight: 850, color: C.dim, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{Math.round(m.cantidad * 100) / 100}</div>
                            </div>
                          )) : <div style={{ color: C.green, fontSize: 12, fontWeight: 800 }}>Todos los renglones tienen precio.</div>}
                          {o.faltanPrecio.length > 8 ? (
                            <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, marginTop: 4 }}>y {o.faltanPrecio.length - 8} más</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                )];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
