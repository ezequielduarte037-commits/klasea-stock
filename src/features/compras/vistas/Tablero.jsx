import { Component, useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, Filter, Package, ShoppingCart } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Cargando from "@/components/ui/Cargando";
import { C } from "@/theme";
import { fetchAnalyticsStats, fetchMonthlySpending, fetchOverdueRequests, usernameOf } from "../purchaseRequestsApi";
import { RECORRIDO, PRIORIDADES, destinoDe, diasDesde, estaCerrado, fechaLimite, fmtFecha } from "../modulo";
import { Bloque, Cabecera, Prioridad, Vacio } from "../ui";

// Los colores de cada estado, los mismos de las filas y las etiquetas.
const COLOR_ESTADO = { nuevo: C.blue, en_revision: C.violet, cotizando: C.cyan, comprado: C.orange, recibido: C.green };
const COLOR_PRIORIDAD = { baja: C.dim, media: C.blue, alta: C.violet, urgente: C.red };

const money = (v) => `$${Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const moneyCorto = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${n}`;
};
const mesClave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mesLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short" }).replace(".", ""); };

function Kpi({ etiqueta, valor, tono = "azul", icono: Icono, texto, tendencia }) {
  return (
    <div className="cmp-kpi" data-tono={tono}>
      <div className="cab">
        {Icono && <span className="ic"><Icono size={15} /></span>}
        <span className="et">{etiqueta}</span>
      </div>
      <div className="v-fila">
        <span className="v">{valor}</span>
        {Array.isArray(tendencia) && tendencia.length > 1 && (
          <div style={{ width: 86, height: 34 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia}>
                <Line type="monotone" dataKey="value" stroke="var(--t)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {texto && <div className="txt">{texto}</div>}
    </div>
  );
}

class Resguardo extends Component {
  constructor(props) { super(props); this.state = { roto: false }; }
  static getDerivedStateFromError() { return { roto: true }; }
  render() {
    if (this.state.roto) return <Vacio icono={BarChart3} titulo="No se pudo dibujar el tablero" texto="Probá recargar la página." />;
    return this.props.children;
  }
}

function Lista({ items, tono, derecha, onAbrir, vacio }) {
  if (!items.length) return <p className="cmp-ayuda" style={{ padding: "6px 2px" }}>{vacio}</p>;
  return (
    <div className="cmp-lista">
      {items.slice(0, 8).map((r) => (
        <button key={r.id} type="button" className="cmp-mini-fila" data-tono={tono} onClick={() => onAbrir(r)}>
          <span style={{ minWidth: 0 }}>
            <span className="tit">{r.title}</span>
            <span className="meta">{usernameOf(r.creator)} · {destinoDe(r) || "Sin obra"}</span>
          </span>
          <Prioridad value={r.priority} />
          <span className="der">{derecha(r)}</span>
        </button>
      ))}
    </div>
  );
}

function TableroContenido({ requests, onAbrir }) {
  const [datos, setDatos] = useState({ cargando: true, stats: null, mensual: [], vencidos: [] });

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchAnalyticsStats(), fetchMonthlySpending(), fetchOverdueRequests()])
      .then(([stats, mensual, vencidos]) => { if (vivo) setDatos({ cargando: false, stats, mensual: mensual || [], vencidos: vencidos || [] }); })
      .catch(() => { if (vivo) setDatos((d) => ({ ...d, cargando: false })); });
    return () => { vivo = false; };
  }, [requests]);

  const t = useMemo(() => {
    const abiertos = requests.filter((r) => !estaCerrado(r));
    const cuenta = (s) => requests.filter((r) => r.status === s).length;
    const urgentes = abiertos.filter((r) => r.priority === "urgente")
      .sort((a, b) => new Date(fechaLimite(a) || a.created_at || 0) - new Date(fechaLimite(b) || b.created_at || 0));
    const aCotizar = abiertos.filter((r) => ["nuevo", "en_revision"].includes(r.status));
    const embudo = RECORRIDO.map((e) => ({ ...e, n: cuenta(e.value) }));
    const prioridades = PRIORIDADES.map((p) => ({ name: p.label, value: abiertos.filter((r) => r.priority === p.value).length, color: COLOR_PRIORIDAD[p.value] })).filter((d) => d.value > 0);
    const top = (fn) => {
      const m = new Map();
      for (const r of abiertos) { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    };

    const mapaMes = new Map((datos.mensual || []).map((row) => [row.month, Number(row.total) || 0]));
    const ultimo = [...mapaMes.keys()].sort().pop() || mesClave(new Date());
    const [ay, am] = ultimo.split("-").map(Number);
    const mensual = [];
    for (let i = 5; i >= 0; i--) {
      const k = mesClave(new Date(ay, am - 1 - i, 1));
      mensual.push({ label: mesLabel(k), total: mapaMes.get(k) || 0 });
    }

    // Días de "nuevo" a "comprado/recibido", por mes de cierre.
    const ciclos = new Map();
    const todos = [];
    for (const r of requests) {
      if (!["comprado", "recibido"].includes(r.status) || !r.created_at || !r.updated_at) continue;
      const c = new Date(r.created_at); const u = new Date(r.updated_at);
      if (Number.isNaN(c.getTime()) || Number.isNaN(u.getTime())) continue;
      const dias = Math.max(0, Math.round((u - c) / 86400000));
      const k = mesClave(u);
      ciclos.set(k, [...(ciclos.get(k) || []), dias]);
      todos.push(dias);
    }
    const uc = [...ciclos.keys()].sort().pop() || mesClave(new Date());
    const [cy, cm] = uc.split("-").map(Number);
    const ciclo = [];
    for (let i = 5; i >= 0; i--) {
      const vals = ciclos.get(mesClave(new Date(cy, cm - 1 - i, 1))) || [];
      ciclo.push({ value: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0 });
    }

    return {
      abiertos,
      porEstado: Object.fromEntries(["nuevo", "en_revision", "cotizando", "comprado"].map((s) => [s, abiertos.filter((r) => r.status === s).length])),
      urgentes,
      aCotizar,
      embudo,
      prioridades,
      creadores: top((r) => usernameOf(r.creator) || "Sin usuario"),
      obras: top((r) => destinoDe(r) || "Sin obra"),
      mensual,
      ciclo,
      promedio: todos.length ? Math.round(todos.reduce((s, v) => s + v, 0) / todos.length) : 0,
    };
  }, [requests, datos.mensual]);

  if (datos.cargando) return <Cargando texto="Armando el tablero…" />;

  const stats = datos.stats || { totalEstimated: 0, totalActual: 0, totalRequests: requests.length, avgDays: 0 };
  const dias = t.promedio || stats.avgDays || 0;
  const remanente = (stats.totalEstimated || 0) - (stats.totalActual || 0);
  const maxEmbudo = Math.max(...t.embudo.map((e) => e.n), 1);
  const gastoTotal = t.mensual.reduce((s, d) => s + d.total, 0);
  const tooltip = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 };
  const eje = { fill: C.dim, fontSize: 11 };

  return (
    <>
      <Cabecera
        eyebrow="Compras · Tablero"
        titulo="Cómo viene"
        acento="Compras"
        sub={(
          <>
            <b className="mono">{stats.totalRequests ?? requests.length}</b> pedidos en total · <b className="mono">{t.abiertos.length}</b> abiertos
            {(stats.totalActual || 0) > 0 && <> · remanente <b className="mono t" data-tono={remanente >= 0 ? "verde" : "rojo"}>{money(Math.abs(remanente))}</b></>}
          </>
        )}
      />

      <div className="cmp-kpis">
        <Kpi etiqueta="Pedidos abiertos" valor={t.abiertos.length} tono="cian" icono={ShoppingCart}
          texto={`${t.porEstado.nuevo} nuevos · ${t.porEstado.en_revision} en revisión · ${t.porEstado.cotizando} cotizando · ${t.porEstado.comprado} por recibir`} />
        <Kpi etiqueta="Urgentes sin resolver" valor={t.urgentes.length} tono={t.urgentes.length ? "rojo" : "verde"} icono={Package}
          texto={t.urgentes.length ? "Piden seguimiento hoy" : "Sin urgentes pendientes"} />
        <Kpi etiqueta="Falta cotizar" valor={t.aCotizar.length} tono={t.aCotizar.length ? "violeta" : "verde"} icono={Filter}
          texto={`${t.porEstado.nuevo} nuevos · ${t.porEstado.en_revision} en revisión`} />
        <Kpi etiqueta="Tiempo medio" valor={`${dias} d`} tono={dias <= 3 ? "verde" : dias <= 7 ? "cian" : "rojo"} icono={Clock}
          texto="De nuevo a comprado, por mes" tendencia={t.ciclo} />
      </div>

      <Bloque icono={BarChart3} titulo="Pedidos por estado" texto="Todos los pedidos, en el orden del recorrido">
        <div className="cmp-embudo">
          {t.embudo.map((e) => (
            <div key={e.value} className="fila" data-tono={e.tono}>
              <span className="et">{e.label}</span>
              <span className="barra"><i style={{ width: `${(e.n / maxEmbudo) * 100}%`, minWidth: e.n ? 3 : 0 }} /></span>
              <span className="n">{e.n}</span>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque
        titulo="Gasto de los últimos 6 meses"
        texto="El importe real que se carga al cerrar cada pedido"
        der={<b className="mono" style={{ fontSize: 18, color: gastoTotal ? "var(--green)" : "var(--dim)" }}>{money(gastoTotal)}</b>}
      >
        {!gastoTotal ? (
          <p className="cmp-ayuda">Todavía no hay gasto real cargado. Se completa poniendo el importe final en cada pedido comprado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={t.mensual} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={C.border} tick={eje} />
              <YAxis stroke={C.border} tick={eje} tickFormatter={moneyCorto} width={58} />
              <Tooltip contentStyle={tooltip} formatter={(v) => [money(v), "Gastado"]} />
              <Area type="monotone" dataKey="total" stroke={C.blue} fill={C.blue} fillOpacity={0.14} strokeWidth={2} dot={{ r: 3, fill: C.blue }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Bloque>

      <div className="cmp-tres">
        <Bloque titulo="Abiertos por prioridad">
          {t.prioridades.length ? (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} pedidos`, "Cantidad"]} />
                  <Pie data={t.prioridades} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={3}>
                    {t.prioridades.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="cmp-leyenda">
                {t.prioridades.map((d) => (
                  <span key={d.name}><i style={{ background: d.color }} />{d.name}<b className="mono">{d.value}</b></span>
                ))}
              </div>
            </>
          ) : <p className="cmp-ayuda">Sin pedidos abiertos.</p>}
        </Bloque>
        <Bloque titulo="Quiénes más piden">
          {t.creadores.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={t.creadores} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke={C.border} tick={eje} />
                <YAxis type="category" dataKey="name" width={92} stroke={C.border} tick={eje} />
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} pedidos`, "Abiertos"]} />
                <Bar dataKey="value" fill={C.violet} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="cmp-ayuda">Nadie tiene pedidos abiertos.</p>}
        </Bloque>
        <Bloque titulo="Obras con más pedidos">
          {t.obras.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={t.obras} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke={C.border} tick={eje} />
                <YAxis type="category" dataKey="name" width={86} stroke={C.border} tick={eje} />
                <Tooltip contentStyle={tooltip} formatter={(v) => [`${v} pedidos`, "Abiertos"]} />
                <Bar dataKey="value" fill={C.teal} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="cmp-ayuda">Sin obras con pedidos abiertos.</p>}
        </Bloque>
      </div>

      <div className="cmp-dos">
        <Bloque icono={Clock} tono="rojo" titulo={`Vencidos · ${datos.vencidos.length}`} texto="Pasó la fecha de entrega o la fecha en que se necesitaba">
          <Lista
            items={datos.vencidos}
            tono="rojo"
            onAbrir={onAbrir}
            vacio="Ningún pedido vencido."
            derecha={(r) => { const d = diasDesde(fechaLimite(r)); return d != null ? `hace ${d} d` : "vencido"; }}
          />
        </Bloque>
        <Bloque icono={Package} tono="cian" titulo={`Urgentes pendientes · ${t.urgentes.length}`} texto="Ordenados por la fecha en que se necesitan">
          <Lista
            items={t.urgentes}
            tono="cian"
            onAbrir={onAbrir}
            vacio="Sin urgentes pendientes."
            derecha={(r) => (fechaLimite(r) ? fmtFecha(fechaLimite(r)) : "sin fecha")}
          />
        </Bloque>
      </div>
    </>
  );
}

export default function Tablero(props) {
  return <Resguardo><TableroContenido {...props} /></Resguardo>;
}
