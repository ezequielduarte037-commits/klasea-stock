/**
 * StockChartsPanel.jsx
 *
 * Panel de visualización de inventario para AdminDashboard.
 *
 * USO: Importar y agregar justo encima de la tabla en AdminDashboard.jsx
 *
 *   import StockChartsPanel from "./StockChartsPanel";
 *   // Dentro del render, antes del bloque "Tabla":
 *   <StockChartsPanel rows={filtrados} />
 *
 * DEPENDENCIAS: recharts (ya disponible en el proyecto vía npm)
 */

import { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ── Paleta idéntica al AdminDashboard ────────────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:    "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
};

const STATUS_COLORS = {
  OK:       "#10b981",
  ATENCION: "#f59e0b",
  CRITICO:  "#ef4444",
  PEDIDO:   "#93c5fd",
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// ── Tooltip personalizado para gráficos ─────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f0f13",
      border: `1px solid ${C.b1}`,
      borderRadius: 8,
      padding: "8px 12px",
      fontFamily: C.sans,
      fontSize: 11,
      color: C.t1,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {label && <div style={{ color: C.t0, fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color ?? p.fill }} />
          <span style={{ color: C.t2 }}>{p.name}:</span>
          <span style={{ fontFamily: C.mono, color: p.color ?? p.fill, fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Label central del donut ──────────────────────────────────────
function DonutLabel({ cx, cy, total }) {
  return (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" fill={C.t0} style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700 }}>
        {total}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={C.t2} style={{ fontFamily: C.sans, fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>
        MATERIALES
      </text>
    </>
  );
}

// ── Sección con título ───────────────────────────────────────────
function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: C.s0,
      border: `1px solid ${C.b0}`,
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 700 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Leyenda mini ─────────────────────────────────────────────────
function Legend({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 2 }}>
      {items.map(({ label, color, value }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 9, color: C.t2, letterSpacing: 1 }}>{label}</span>
          {value != null && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color, fontWeight: 700 }}>{value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────
export default function StockChartsPanel({ rows = [] }) {
  // 1. Donut: distribución por estado
  const pieData = useMemo(() => {
    const counts = { OK: 0, ATENCION: 0, CRITICO: 0, PEDIDO: 0 };
    rows.forEach(r => {
      const st = String(r.estado_ui || r.estado || "").toUpperCase();
      if (st in counts) counts[st]++;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] }));
  }, [rows]);

  // 2. Barras: cobertura promedio por categoría
  const coverageByCategory = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const cat = r.categoria || "Sin cat.";
      const cob = r.semanas_cobertura >= 999 ? null : num(r.semanas_cobertura);
      if (cob === null) return;
      if (!map[cat]) map[cat] = { sum: 0, count: 0 };
      map[cat].sum   += cob;
      map[cat].count += 1;
    });
    return Object.entries(map)
      .map(([cat, { sum, count }]) => ({
        cat: cat.length > 12 ? cat.slice(0, 11) + "…" : cat,
        avg: parseFloat((sum / count).toFixed(1)),
      }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 8);
  }, [rows]);

  // 3. Barras: top materiales con pedido sugerido
  const topPedidos = useMemo(() =>
    rows
      .filter(r => num(r.pedido_sugerido) > 0 && !r.pedido_pendiente)
      .sort((a, b) => num(b.pedido_sugerido) - num(a.pedido_sugerido))
      .slice(0, 8)
      .map(r => ({
        name: (r.nombre || "").length > 14 ? (r.nombre || "").slice(0, 13) + "…" : r.nombre,
        qty:  parseFloat(num(r.pedido_sugerido).toFixed(2)),
        unit: r.unidad_medida || "",
        st:   String(r.estado_ui || r.estado || "").toUpperCase(),
      })),
  [rows]);

  if (!rows.length) return null;

  const total = rows.length;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "220px 1fr 1fr",
      gap: 12,
      marginBottom: 16,
      animation: "slideUp .35s ease",
    }}>
      {/* ─ DONUT: Estado ─────────────────────────────────────── */}
      <ChartCard title="Estado del inventario">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <DonutLabel cx={0} cy={0} total={total} />
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <Legend items={pieData.map(d => ({ label: d.name, color: d.color, value: d.value }))} />
      </ChartCard>

      {/* ─ BARRAS: Cobertura por categoría ───────────────────── */}
      <ChartCard
        title="Cobertura de stock"
        subtitle="Semanas promedio por categoría"
      >
        {coverageByCategory.length > 0 ? (
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={coverageByCategory} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="cat"
                tick={{ fill: C.t2, fontSize: 8, fontFamily: C.sans }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: C.t2, fontSize: 8, fontFamily: C.mono }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="avg" name="sem." radius={[3, 3, 0, 0]} maxBarSize={28}>
                {coverageByCategory.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.avg < 2  ? C.red   :
                      entry.avg < 4  ? C.amber :
                      C.green
                    }
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 11 }}>
            Sin datos de cobertura
          </div>
        )}
        <Legend items={[
          { label: "< 2 sem", color: C.red    },
          { label: "2–4 sem", color: C.amber  },
          { label: "> 4 sem", color: C.green  },
        ]} />
      </ChartCard>

      {/* ─ BARRAS: Top pedidos sugeridos ────────────────────── */}
      <ChartCard
        title="Pedidos sugeridos"
        subtitle={`${topPedidos.length} material${topPedidos.length !== 1 ? "es" : ""} para reponer`}
      >
        {topPedidos.length > 0 ? (
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={topPedidos} margin={{ top: 2, right: 4, bottom: 0, left: -20 }} layout="vertical">
              <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                type="number"
                tick={{ fill: C.t2, fontSize: 8, fontFamily: C.mono }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: C.t1, fontSize: 8, fontFamily: C.sans }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="qty" name="cantidad" radius={[0, 3, 3, 0]} maxBarSize={14}>
                {topPedidos.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={STATUS_COLORS[entry.st] ?? C.amber}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, fontSize: 11 }}>
            No hay pedidos pendientes ✓
          </div>
        )}
      </ChartCard>
    </div>
  );
}
