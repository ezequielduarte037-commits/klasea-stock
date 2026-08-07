import { useMemo, useState } from "react";
import { Activity, BriefcaseBusiness, ChevronDown, ChevronUp, PackageOpen, Users } from "lucide-react";
import { C } from "@/theme";

const DAY_MS = 24 * 60 * 60 * 1000;

function qty(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function fmtQty(value) {
  return Number(Math.round(qty(value) * 100) / 100).toLocaleString("es-AR");
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayKey(value) {
  const date = validDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function aggregate(rows, field, fallback) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = String(row[field] || fallback).trim() || fallback;
    const current = groups.get(label) || { label, movimientos: 0, cantidad: 0, unidades: new Set() };
    current.movimientos += 1;
    current.cantidad += qty(row.cantidad);
    if (row.unidad) current.unidades.add(row.unidad);
    groups.set(label, current);
  });
  return [...groups.values()]
    .sort((a, b) => b.movimientos - a.movimientos || b.cantidad - a.cantidad || a.label.localeCompare(b.label, "es"))
    .slice(0, 5);
}

function Kpi({ icon, label, value, detail, color }) {
  return (
    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: "9px 11px" }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color, background: `${color}14`, border: `1px solid ${color}30`, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color, fontFamily: C.mono, fontSize: 17, fontWeight: 950, lineHeight: 1 }}>{value}</span>
        <span style={{ display: "block", color: C.text, fontSize: 10.5, fontWeight: 900, marginTop: 3 }}>{label}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 9.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
      </span>
    </div>
  );
}

function Ranking({ title, subtitle, rows, color, value }) {
  const max = Math.max(1, ...rows.map((row) => row.movimientos));
  return (
    <section style={{ minWidth: 0, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: 11 }}>
      <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>{title}</div>
      <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2 }}>{subtitle}</div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {rows.length ? rows.map((row, index) => (
          <div key={row.label} style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span title={row.label} style={{ minWidth: 0, color: C.text, fontSize: 11, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 9.5, marginRight: 6 }}>{index + 1}</span>{row.label}
              </span>
              <span style={{ color, fontFamily: C.mono, fontSize: 10.5, fontWeight: 950, whiteSpace: "nowrap" }}>{value(row)}</span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: C.panel2, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(8, (row.movimientos / max) * 100)}%`, height: "100%", borderRadius: 999, background: color }} />
            </div>
          </div>
        )) : <div style={{ color: C.dim, fontSize: 10.5, padding: "8px 0" }}>Sin datos para estos filtros.</div>}
      </div>
    </section>
  );
}

function ActivityStrip({ rows }) {
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counts = new Map();
    rows.forEach((row) => {
      const key = localDayKey(row.fecha);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today.getTime() - (13 - index) * DAY_MS);
      return {
        key: localDayKey(date),
        label: date.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", ""),
        day: date.getDate(),
        count: counts.get(localDayKey(date)) || 0,
      };
    });
  }, [rows]);
  const max = Math.max(1, ...days.map((day) => day.count));

  return (
    <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 11, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 950 }}>Actividad de los últimos 14 días</div>
          <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2 }}>Cantidad de líneas retiradas por día</div>
        </div>
        <Activity size={15} style={{ color: C.blue }} />
      </div>
      <div style={{ height: 74, display: "grid", gridTemplateColumns: "repeat(14, minmax(10px, 1fr))", alignItems: "end", gap: 4, marginTop: 8 }}>
        {days.map((day) => (
          <div key={day.key} title={`${day.day}: ${day.count} retiros`} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
            <span style={{ color: day.count ? C.text : C.dim, fontFamily: C.mono, fontSize: 8.5, fontWeight: 900 }}>{day.count || ""}</span>
            <span style={{ width: "100%", maxWidth: 20, minHeight: 3, height: `${Math.max(4, (day.count / max) * 42)}px`, borderRadius: "5px 5px 2px 2px", background: day.count ? `linear-gradient(180deg, ${C.blue}, ${C.violet})` : C.panel2, opacity: day.count ? 1 : 0.6 }} />
            <span style={{ color: C.dim, fontSize: 7.5, textTransform: "uppercase" }}>{day.label.slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PanolRetirosDashboard({ rows = [], isMobile = false }) {
  const [open, setOpen] = useState(true);
  const stats = useMemo(() => {
    const today = localDayKey(new Date());
    const people = new Set(rows.map((row) => row.persona).filter((value) => value && value !== "Sin identificar"));
    const works = new Set(rows.map((row) => row.obra).filter((value) => value && value !== "Sin obra"));
    return {
      today: rows.filter((row) => localDayKey(row.fecha) === today).length,
      people: people.size,
      works: works.size,
      consumables: rows.filter((row) => row.tipo === "consumible").length,
      byPeople: aggregate(rows, "persona", "Sin identificar"),
      byWorks: aggregate(rows, "obra", "Sin obra"),
      byMaterials: aggregate(rows, "material", "Sin descripción"),
    };
  }, [rows]);

  return (
    <section style={{ marginBottom: 12, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 13, overflow: "hidden", boxShadow: "0 10px 26px -22px rgba(15,23,42,.45)" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ width: "100%", border: "none", borderBottom: open ? `1px solid ${C.border}` : "none", background: C.panelSolid, color: C.text, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: C.sans, textAlign: "left" }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><Activity size={15} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 950 }}>Pulso de retiros</span>
          <span style={{ display: "block", color: C.dim, fontSize: 10, marginTop: 2 }}>Qué sale, quién lo retira y para qué obra · según los filtros activos</span>
        </span>
        {open ? <ChevronUp size={16} style={{ color: C.dim }} /> : <ChevronDown size={16} style={{ color: C.dim }} />}
      </button>

      {open && (
        <div style={{ padding: 11, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(130px, 1fr))", gap: 7 }}>
            <Kpi icon={<PackageOpen size={15} />} label="Retiros" value={rows.length} detail={`${stats.consumables} consumibles`} color={C.red} />
            <Kpi icon={<Activity size={15} />} label="Hoy" value={stats.today} detail="líneas retiradas" color={C.green} />
            <Kpi icon={<Users size={15} />} label="Personas" value={stats.people} detail="retiros identificados" color={C.blue} />
            <Kpi icon={<BriefcaseBusiness size={15} />} label="Obras" value={stats.works} detail="destinos alcanzados" color={C.violet} />
          </div>
          <ActivityStrip rows={rows} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <Ranking title="Quiénes retiran" subtitle="Personas con más movimientos" rows={stats.byPeople} color={C.blue} value={(row) => `${row.movimientos} mov.`} />
            <Ranking title="Para qué obras" subtitle="Destinos con más retiros" rows={stats.byWorks} color={C.violet} value={(row) => `${row.movimientos} mov.`} />
            <Ranking title="Qué se retira" subtitle="Materiales con mayor recurrencia" rows={stats.byMaterials} color={C.green} value={(row) => row.unidades.size === 1 ? `${fmtQty(row.cantidad)} ${[...row.unidades][0]}` : `${row.movimientos} mov.`} />
          </div>
        </div>
      )}
    </section>
  );
}
