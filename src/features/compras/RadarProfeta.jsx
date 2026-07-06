import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Clock, RefreshCw, Send, ShieldCheck, Zap,
} from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { addRequestItem, createPurchaseRequest } from "@/features/compras/purchaseRequestsApi";

// ─────────────────────────────────────────────────────────────────────────────
// EL PROFETA — Radar predictivo de quiebres de stock.
// Lee la vista vw_profeta_alertas (burn-rate 60d + lead-time real por proveedor
// + demanda de obras activas) y proyecta las curvas de stock a 30 días.
// Cuando una curva entra en la Zona de Quiebre antes de que el proveedor pueda
// reponer, El Profeta lo marca y arma el borrador de compra en un click.
// ─────────────────────────────────────────────────────────────────────────────

const HORIZONTE_DIAS = 30;

// Paleta neón para las trazas del radar (se ciclan si hay más productos).
const TRAZAS = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#4ade80"];

const glass = {
  background: "linear-gradient(160deg, rgba(15,23,42,0.72), rgba(15,23,42,0.55))",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 18,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  boxShadow: "0 22px 50px -30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
};

function fmtQty(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

function KpiHud({ icon, label, value, tone = "#22d3ee", sub }) {
  return (
    <div style={{ ...glass, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", color: tone, background: `${tone}14`, border: `1px solid ${tone}44`, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 950, color: "#e2e8f0", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.1, marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function TooltipHud({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...glass, padding: "10px 13px", borderRadius: 12 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        Día +{label}
      </div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: p.stroke, boxShadow: `0 0 8px ${p.stroke}` }} />
          <span style={{ color: "#cbd5e1", maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          <span style={{ fontFamily: C.mono, fontWeight: 900, color: p.value <= 0 ? "#f87171" : "#e2e8f0", marginLeft: "auto" }}>{fmtQty(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function RadarProfeta() {
  const toast = useToast();
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(null);
  const [creados, setCreados] = useState(() => new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vw_profeta_alertas")
        .select("*")
        .order("dias_para_quiebre", { ascending: true, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      setAlertas(data ?? []);
    } catch (e) {
      toast?.error(e.message?.includes("vw_profeta_alertas") ? "Falta correr el SQL del Profeta (vw_profeta_alertas)." : (e.message || "No se pudo consultar al Profeta."));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Productos que se proyectan en el radar: los que tienen consumo real y quiebre a la vista.
  const enRadar = useMemo(
    () => alertas.filter((a) => Number(a.burn_rate_diario) > 0 && a.dias_para_quiebre != null && Number(a.dias_para_quiebre) <= 45).slice(0, 8),
    [alertas],
  );
  const urgentes = useMemo(() => alertas.filter((a) => a.requiere_compra_urgente), [alertas]);
  const enRiesgo14 = useMemo(
    () => alertas.filter((a) => a.dias_para_quiebre != null && Number(a.dias_para_quiebre) <= 14).length,
    [alertas],
  );

  // Serie proyectada: stock_actual − burn_rate × día, para los próximos 30 días.
  const serie = useMemo(() => {
    const rows = [];
    for (let d = 0; d <= HORIZONTE_DIAS; d += 1) {
      const punto = { dia: d };
      for (const a of enRadar) {
        const proy = Number(a.stock_actual) - Number(a.burn_rate_diario) * d;
        punto[a.material_id] = Math.max(Math.round(proy * 100) / 100, 0);
      }
      rows.push(punto);
    }
    return rows;
  }, [enRadar]);

  const maxY = useMemo(() => {
    const tops = enRadar.map((a) => Number(a.stock_actual) || 0);
    return Math.max(10, ...tops);
  }, [enRadar]);
  const zonaPeligroY = Math.max(2, Math.round(maxY * 0.12));

  async function generarBorrador(alerta) {
    if (creando) return;
    setCreando(alerta.material_id);
    try {
      const cantidad = Math.max(1, Number(alerta.cantidad_sugerida) || 1);
      const req = await createPurchaseRequest({
        form: {
          title: `[Profeta] ${alerta.descripcion} ×${cantidad} — quiebre en ${fmtQty(alerta.dias_para_quiebre)} días`,
          description: [
            "Borrador generado por El Profeta (radar predictivo).",
            `Stock actual: ${fmtQty(alerta.stock_actual)} ${alerta.unidad_medida || "unidad"} · consumo diario: ${fmtQty(alerta.burn_rate_diario)}.`,
            `Lead time ${alerta.proveedor || "proveedor"}: ~${fmtQty(alerta.lead_time_proveedor)} días${alerta.lead_time_estimado ? " (estimado)" : " (medido)"}.`,
            Number(alerta.demanda_obras_activas) > 0 ? `Demanda pendiente de obras activas: ${fmtQty(alerta.demanda_obras_activas)}.` : "",
          ].filter(Boolean).join("\n"),
          priority: Number(alerta.dias_para_quiebre) <= Number(alerta.lead_time_proveedor) ? "urgente" : "alta",
          proveedor: alerta.proveedor || null,
          tipo_pedido: "stock",
          es_adicional: false,
          source: "profeta",
        },
      });
      await addRequestItem(req.id, {
        description: alerta.descripcion,
        quantity: String(cantidad),
        unit: alerta.unidad_medida || "unidad",
      });
      setCreados((prev) => new Set(prev).add(alerta.material_id));
      toast?.success(`Borrador creado: ${alerta.descripcion} ×${cantidad}`);
    } catch (e) {
      toast?.error(e.message || "No se pudo crear el borrador.");
    } finally {
      setCreando(null);
    }
  }

  return (
    <div style={{ padding: "16px 18px 40px", maxWidth: 1500, margin: "0 auto", display: "grid", gap: 14 }}>
      <style>{`
        @keyframes profetaPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes profetaScan { from { transform: translateX(-100%); } to { transform: translateX(240%); } }
        .profeta-urgente { animation: profetaPulse 1.6s ease-in-out infinite; }
      `}</style>

      {/* ── Cabecera HUD ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee", position: "relative", overflow: "hidden" }}>
            <Activity size={19} />
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg, transparent 30%, rgba(34,211,238,0.25) 50%, transparent 70%)", animation: "profetaScan 2.8s linear infinite" }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: C.text, letterSpacing: 0.3 }}>EL PROFETA</div>
            <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 750 }}>Radar predictivo de quiebres · próximos {HORIZONTE_DIAS} días</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={cargar} disabled={loading} style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 9, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <KpiHud icon={<Zap size={17} />} label="Comprar hoy" value={urgentes.length} tone="#f87171" sub="quiebre antes de reposición" />
        <KpiHud icon={<AlertTriangle size={17} />} label="En riesgo (14 días)" value={enRiesgo14} tone="#fbbf24" />
        <KpiHud icon={<Activity size={17} />} label="Bajo vigilancia" value={alertas.length} tone="#22d3ee" sub="con consumo o demanda activa" />
        <KpiHud icon={<ShieldCheck size={17} />} label="Borradores generados" value={creados.size} tone="#34d399" sub="en esta sesión" />
      </div>

      {/* ── Radar + panel de urgencias ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 14, alignItems: "start" }}>

        {/* Radar */}
        <div style={{ ...glass, padding: "16px 14px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 8px 10px", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>Proyección de stock</div>
            <div style={{ fontSize: 10.5, color: "#64748b" }}>curvas = stock proyectado según consumo real de 60 días</div>
          </div>

          {loading ? (
            <div style={{ height: 380, display: "grid", placeItems: "center", color: "#64748b", fontSize: 13 }}>Consultando el futuro…</div>
          ) : !enRadar.length ? (
            <div style={{ height: 380, display: "grid", placeItems: "center", color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>
              Sin quiebres a la vista en {HORIZONTE_DIAS} días. El Profeta descansa. 🧘
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={serie} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.09)" strokeDasharray="3 6" />
                <XAxis dataKey="dia" stroke="#475569" tick={{ fill: "#64748b", fontSize: 11, fontFamily: C.mono }} tickFormatter={(d) => (d === 0 ? "HOY" : `+${d}`)} />
                <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 11, fontFamily: C.mono }} width={44} />
                <Tooltip content={<TooltipHud />} />

                {/* Zona de peligro: stock por debajo del colchón de seguridad */}
                <ReferenceArea y1={0} y2={zonaPeligroY} fill="rgba(248,113,113,0.09)" stroke="rgba(248,113,113,0.35)" strokeDasharray="5 5"
                  label={{ value: "⚠ ZONA DE QUIEBRE", position: "insideBottomLeft", fill: "#f87171", fontSize: 10, fontWeight: 800, letterSpacing: 2 }} />
                <ReferenceLine x={0} stroke="rgba(34,211,238,0.5)" strokeDasharray="4 4" label={{ value: "HOY", position: "top", fill: "#22d3ee", fontSize: 10, fontWeight: 800 }} />

                {/* Día de quiebre de cada producto urgente */}
                {enRadar.filter((a) => a.requiere_compra_urgente && Number(a.dias_para_quiebre) <= HORIZONTE_DIAS).map((a) => (
                  <ReferenceLine key={`q-${a.material_id}`} x={Math.round(Number(a.dias_para_quiebre))} stroke="rgba(248,113,113,0.45)" strokeDasharray="2 4" />
                ))}

                {enRadar.map((a, i) => (
                  <Line
                    key={a.material_id}
                    dataKey={a.material_id}
                    name={a.descripcion}
                    stroke={TRAZAS[i % TRAZAS.length]}
                    strokeWidth={a.requiere_compra_urgente ? 2.6 : 1.8}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    style={{ filter: `drop-shadow(0 0 ${a.requiere_compra_urgente ? 6 : 3}px ${TRAZAS[i % TRAZAS.length]}66)` }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Leyenda */}
          {enRadar.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "10px 8px 8px" }}>
              {enRadar.map((a, i) => (
                <span key={a.material_id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#94a3b8" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: TRAZAS[i % TRAZAS.length], boxShadow: `0 0 7px ${TRAZAS[i % TRAZAS.length]}` }} />
                  <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.descripcion}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Panel de urgencias */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#f87171", textTransform: "uppercase", letterSpacing: 1.5, display: "flex", alignItems: "center", gap: 6 }}>
            <Zap size={13} /> Comprar hoy ({urgentes.length})
          </div>
          {loading && <div style={{ ...glass, padding: 18, color: "#64748b", fontSize: 12, textAlign: "center" }}>Analizando…</div>}
          {!loading && !urgentes.length && (
            <div style={{ ...glass, padding: 18, color: "#64748b", fontSize: 12, textAlign: "center" }}>Nada urgente. Todo bajo control. ✅</div>
          )}
          {urgentes.slice(0, 10).map((a) => {
            const generado = creados.has(a.material_id);
            return (
              <div key={a.material_id} style={{ ...glass, padding: "12px 14px", borderColor: "rgba(248,113,113,0.35)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span className="profeta-urgente" style={{ width: 8, height: 8, borderRadius: 99, background: "#f87171", boxShadow: "0 0 10px #f87171", marginTop: 5, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#e2e8f0", lineHeight: 1.3 }}>{a.descripcion}</div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 5, fontSize: 10.5, color: "#94a3b8" }}>
                      <span style={{ color: "#f87171", fontWeight: 800, fontFamily: C.mono }}>
                        {a.dias_para_quiebre != null ? `quiebre en ${fmtQty(a.dias_para_quiebre)}d` : "sin stock"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Clock size={10} /> {a.proveedor || "s/proveedor"} ~{fmtQty(a.lead_time_proveedor)}d{a.lead_time_estimado ? "*" : ""}
                      </span>
                      <span style={{ fontFamily: C.mono }}>stock {fmtQty(a.stock_actual)}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => generarBorrador(a)}
                  disabled={!!creando || generado}
                  style={{
                    marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    padding: "9px 12px", borderRadius: 10, cursor: (creando || generado) ? "default" : "pointer",
                    fontSize: 12, fontWeight: 900, fontFamily: C.sans,
                    border: `1px solid ${generado ? "rgba(52,211,153,0.4)" : "rgba(34,211,238,0.4)"}`,
                    background: generado ? "rgba(52,211,153,0.12)" : "rgba(34,211,238,0.1)",
                    color: generado ? "#34d399" : "#22d3ee",
                    opacity: creando && creando !== a.material_id ? 0.5 : 1,
                  }}
                >
                  {generado ? <>✓ Borrador creado</> : creando === a.material_id ? "Generando…" : <><Send size={13} /> Generar borrador ×{fmtQty(a.cantidad_sugerida)}</>}
                </button>
              </div>
            );
          })}
          {urgentes.some((a) => a.lead_time_estimado) && (
            <div style={{ fontSize: 9.5, color: "#475569" }}>* lead time estimado (sin historial suficiente del proveedor — default 7 días)</div>
          )}
        </div>
      </div>
    </div>
  );
}
