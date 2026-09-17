import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Plug, Scale, Search, AlertTriangle, RotateCcw, ChevronRight } from "lucide-react";
import { C } from "@/theme";
import { useBalanza, calidadCalibracion } from "@/hooks/useBalanza";
import { borrarPesoUnitario, fetchConsumiblesPeso, guardarPesoUnitario } from "@/features/materiales/api";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";

/**
 * CalibrarPesosScreen — carga del peso por pieza de los consumibles. Ruta: /balanza/calibrar
 *
 * Pensada para hacer los ~57 SKUs de fijaciones de una sentada, con la balanza
 * al lado: elegís producto → ponés una muestra → "Leer" → "Guardar y siguiente".
 *
 * El peso unitario que se guarda acá se usa después en el egreso para estimar
 * cantidad = peso_neto / peso_unitario_g. Por eso la muestra tiene que ser
 * grande: el error del peso-pieza se propaga a todos los conteos futuros.
 */

const CARD = { border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, padding: 14 };
const LBL = { fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4, display: "block" };
const INP = { width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" };

const CSS = `
  .calp-root { position: absolute; inset: 0; overflow: auto; background: var(--bg); font-family: 'Outfit', system-ui, sans-serif; }
  .calp-cuerpo { max-width: 1080px; margin: 0 auto; padding: 16px 16px 28px; display: grid; gap: 12px; }
  .calp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 380px); gap: 12px; align-items: start; }
  .calp-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 899px) {
    .calp-cuerpo { padding: 12px 12px 24px; }
    .calp-grid { grid-template-columns: 1fr; }
    .calp-filtros { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
    .calp-filtros::-webkit-scrollbar { display: none; }
    .calp-filtros > * { flex-shrink: 0; }
  }
`;

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const COLOR_CALIDAD = { excelente: C.green, buena: C.green, aceptable: C.violet, pobre: C.red };

export default function CalibrarPesosScreen({ toast }) {
  const nav = useNavigate();
  const bal = useBalanza();

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("sin"); // sin | con | todos
  const [selId, setSelId] = useState(null);

  const [piezas, setPiezas] = useState("");
  const [gramos, setGramos] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setItems(await fetchConsumiblesPeso());
    } catch (err) {
      toast?.error(err.message || "No se pudo cargar el catálogo de consumibles.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const term = norm(q);
    return items.filter((m) => {
      if (filtro === "sin" && m.peso_unitario_g != null) return false;
      if (filtro === "con" && m.peso_unitario_g == null) return false;
      if (!term) return true;
      return norm(`${m.descripcion} ${m.codigo || ""}`).includes(term);
    });
  }, [items, q, filtro]);

  const sel = useMemo(() => items.find((m) => m.id === selId) || null, [items, selId]);
  const pendientes = useMemo(() => items.filter((m) => m.peso_unitario_g == null).length, [items]);

  // Al cambiar de producto, limpio la medición en curso.
  useEffect(() => { setGramos(null); setPiezas(""); }, [selId]);

  const nPiezas = Number(piezas) || 0;
  const pesoUnit = gramos != null && nPiezas > 0 ? gramos / nPiezas : null;
  const calidad = gramos != null ? calidadCalibracion(gramos) : null;
  // La precisión depende de los GRAMOS juntados, no de la cantidad de piezas:
  // el error de lectura es ~±2,5 g, así que hacen falta ~250 g para caer en ±1%.
  const piezasParaBuena = pesoUnit != null && pesoUnit > 0 ? Math.ceil(250 / pesoUnit) : null;
  const faltanPiezas = piezasParaBuena != null ? Math.max(0, piezasParaBuena - nPiezas) : 0;

  async function leer() {
    try {
      const { gramos: g } = await bal.leerPeso();
      setGramos(g);
      if (g <= 0) toast?.warning("La balanza marcó 0. Poné la muestra sobre el plato (y usá TARA si hay recipiente).");
    } catch (err) {
      toast?.error(err.message || "No se pudo leer la balanza.");
    }
  }

  async function guardar() {
    if (!sel || pesoUnit == null) return;
    setGuardando(true);
    try {
      const upd = await guardarPesoUnitario(sel.id, { gramosMuestra: gramos, piezas: nPiezas });
      setItems((prev) => prev.map((m) => (m.id === sel.id ? { ...m, ...upd } : m)));
      toast?.success(`✓ ${sel.descripcion}: ${upd.peso_unitario_g.toFixed(3)} g por pieza.`);
      // Salto al próximo sin calibrar, para poder encadenar.
      const resto = items.filter((m) => m.id !== sel.id && m.peso_unitario_g == null);
      setSelId(resto[0]?.id ?? null);
      setGramos(null); setPiezas("");
    } catch (err) {
      toast?.error(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function recalibrar(m) {
    try {
      await borrarPesoUnitario(m.id);
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, peso_unitario_g: null, peso_muestra_piezas: null, peso_calibrado_at: null } : x)));
      setSelId(m.id);
    } catch (err) {
      toast?.error(err.message || "No se pudo borrar la calibración.");
    }
  }

  return (
    <div className="calp-root">
      <style href="klasea-calp" precedence="default">{CSS}</style>
      <PageHeader
        icon={Scale}
        eyebrow="Pañol"
        title="Calibrar peso por pieza"
        subtitle={cargando ? "Cargando consumibles…" : `${items.length} consumibles · ${pendientes} sin calibrar`}
        actions={(
          <>
            <button type="button" className="ui-btn" onClick={() => nav(-1)}>
              <ArrowLeft size={15} /> Volver
            </button>
            <button type="button" className="ui-btn" onClick={() => nav("/balanza")} title="Sniffer del puerto serie, para diagnosticar si la balanza no responde">
              Diagnóstico
            </button>
            {bal.conectado ? (
              <span className="ui-chip" style={{ color: C.green, background: C.greenL, borderColor: C.greenB }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: C.green }} /> Balanza conectada
              </span>
            ) : (
              <button type="button" className="ui-btn ui-btn-primario" onClick={bal.conectar} disabled={!bal.soportado}>
                <Plug size={15} /> Conectar balanza
              </button>
            )}
          </>
        )}
      />

      <div className="calp-cuerpo">
        {!bal.soportado && (
          <div style={{ ...CARD, borderColor: C.redB, background: C.redL, fontSize: 13, color: C.text }}>
            <b>Este navegador no soporta Web Serial.</b> Abrí esta pantalla en Chrome o Edge de escritorio.
          </div>
        )}
        {bal.error && (
          <div style={{ ...CARD, borderColor: C.violetB, background: C.violetL, fontSize: 12.5, color: C.violet, fontWeight: 600, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {bal.error}
          </div>
        )}

        <div className="calp-grid">
          <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }} className="calp-filtros">
              <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                <Search size={14} color={C.dim} style={{ position: "absolute", left: 10, top: 13, pointerEvents: "none" }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar consumible…" className="ui-input" style={{ paddingLeft: 30 }} />
              </div>
              {[["sin", "Sin calibrar"], ["con", "Calibrados"], ["todos", "Todos"]].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className="ui-chip"
                  onClick={() => setFiltro(k)}
                  style={{
                    minHeight: 34,
                    cursor: "pointer",
                    borderColor: filtro === k ? C.blueB : C.border,
                    background: filtro === k ? C.blueL : "transparent",
                    color: filtro === k ? C.blue : C.dim,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {cargando ? (
                <Cargando texto="Cargando consumibles…" />
              ) : visibles.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 13 }}>
                  {filtro === "sin" && !q ? "No queda ningún consumible sin calibrar." : "Sin resultados."}
                </div>
              ) : visibles.map((m) => {
                const activo = m.id === selId;
                const cal = m.peso_unitario_g != null;
                return (
                  <button key={m.id} type="button" onClick={() => setSelId(m.id)}
                    style={{
                      width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                      borderLeft: `3px solid ${activo ? C.violet : "transparent"}`,
                      borderBottom: `1px solid ${C.border}`,
                      background: activo ? C.violetL : "transparent",
                      padding: "9px 12px", display: "flex", alignItems: "center", gap: 10,
                      minHeight: 44,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</div>
                      {m.codigo && <div style={{ fontSize: 10.5, color: C.dim, fontFamily: C.mono, marginTop: 1 }}>{m.codigo}</div>}
                    </div>
                    {cal ? (
                      <>
                        <span style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 700, color: C.green, whiteSpace: "nowrap" }}>
                          {Number(m.peso_unitario_g).toFixed(2)} g
                        </span>
                        <span title="Recalibrar" onClick={(e) => { e.stopPropagation(); recalibrar(m); }}
                          style={{ color: C.dim, display: "grid", placeItems: "center", padding: 6, minWidth: 32, minHeight: 32 }}>
                          <RotateCcw size={13} />
                        </span>
                      </>
                    ) : (
                      <span className="ui-chip" style={{ color: C.violet, background: C.violetL, borderColor: C.violetB, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Pendiente</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ ...CARD, position: "sticky", top: 16 }}>
            {!sel ? (
              <div style={{ color: C.dim, fontSize: 13, textAlign: "center", padding: "28px 8px" }}>
                Elegí un consumible de la lista para calibrarlo.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={LBL}>Calibrando</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginTop: 3 }}>{sel.descripcion}</div>
                </div>

                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5, background: C.panel, borderRadius: 9, padding: "9px 11px", border: `1px solid ${C.border}` }}>
                  Poné una <b style={{ color: C.text }}>muestra grande</b> sobre la balanza (idealmente 500 g o más),
                  contá cuántas piezas son y apretá Leer. Si usás un recipiente, tocá <b style={{ color: C.text }}>TARA</b> en la balanza primero.
                </div>

                <div>
                  <label style={LBL}>¿Cuántas piezas pusiste?</label>
                  <input type="number" min="1" step="1" value={piezas} onChange={(e) => setPiezas(e.target.value)}
                    placeholder="Ej: 200" style={{ ...INP, fontFamily: C.mono, fontSize: 16, fontWeight: 700 }} />
                </div>

                <button type="button" className="ui-btn ui-btn-primario" onClick={leer} disabled={!bal.conectado || bal.leyendo} style={{ minHeight: 44 }}>
                  <Scale size={16} /> {bal.leyendo ? "Leyendo…" : "Leer balanza"}
                </button>

                {gramos != null && (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: 12, background: C.panel, display: "grid", gap: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 11.5, color: C.dim, fontWeight: 650 }}>Peso leído</span>
                      <span style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: C.text }}>{gramos} g</span>
                    </div>
                    {pesoUnit != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
                        <span style={{ fontSize: 11.5, color: C.dim, fontWeight: 650 }}>Peso por pieza</span>
                        <span style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: C.violet }}>{pesoUnit.toFixed(3)} g</span>
                      </div>
                    )}
                    {calidad && (
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, display: "grid", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 650, color: COLOR_CALIDAD[calidad.nivel] }}>
                          {calidad.nivel === "pobre" || calidad.nivel === "aceptable" ? <AlertTriangle size={14} /> : <Check size={14} />}
                          Precisión: {calidad.texto} (±{calidad.errorPct.toFixed(1)}%)
                        </div>
                        {faltanPiezas > 0 ? (
                          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.45 }}>
                            Agregá <b style={{ color: C.text }}>~{faltanPiezas} piezas más</b> (total ≈ {piezasParaBuena}) y actualizá
                            el número para bajar a ±1%. Con este producto, {piezasParaBuena} piezas son ~250 g.
                          </div>
                        ) : (
                          <div style={{ fontSize: 11.5, color: C.dim }}>
                            La muestra alcanza. Podés guardar tranquilo.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button type="button" className="ui-btn" onClick={guardar} disabled={pesoUnit == null || guardando}
                  style={{
                    minHeight: 44,
                    background: pesoUnit != null && !guardando ? C.green : undefined,
                    borderColor: pesoUnit != null && !guardando ? "transparent" : undefined,
                    color: pesoUnit != null && !guardando ? "var(--inverse-text)" : undefined,
                  }}>
                  <Check size={16} /> {guardando ? "Guardando…" : "Guardar y siguiente"} <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
