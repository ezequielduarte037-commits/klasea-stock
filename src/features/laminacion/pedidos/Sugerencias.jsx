import { useMemo, useState } from "react";
import { ChevronRight, Lightbulb, Plus, Search } from "lucide-react";
import { desmoldeDe, esDeObra, fmtFecha, fmtNum, num } from "../obras";
import { Estado, Mini } from "../ui";

// Cuánto conviene reponer, por dos caminos:
//   · Por rotación: consumo histórico del galpón → cubrir N semanas.
//   · Por obras: lo que todavía falta usar en las obras en curso, según el
//     plan de materiales de cada una, menos el stock.
// Antes "Crear pedido" daba de alta un pedido suelto que nunca llegaba a
// Compras; ahora el material pasa al pedido que se está armando.

function urgenciaRotacion(semanas, buffer, sinHistorial) {
  if (sinHistorial) return { label: "Sin historial", tono: "neutro" };
  if (semanas === 0) return { label: "Sin stock", tono: "rojo" };
  if (semanas < 1) return { label: "Crítico", tono: "rojo" };
  if (semanas < buffer * 0.5) return { label: "Urgente", tono: "violeta" };
  if (semanas < buffer) return { label: "Atención", tono: "cian" };
  return { label: "OK", tono: "verde" };
}

function FilaSugerencia({ row, modo, buffer, onAgregar }) {
  const [abierta, setAbierta] = useState(false);
  const [cantidad, setCantidad] = useState(String(row.aComprar || ""));
  const urg = modo === "rotacion"
    ? urgenciaRotacion(row.semanasDeStock, buffer, row.sinHistorial)
    : { label: row.aComprar > row.faltaUsarTotal * 0.7 ? "Alta" : row.aComprar > 0 ? "Media" : "OK", tono: row.aComprar > row.faltaUsarTotal * 0.7 ? "rojo" : row.aComprar > 0 ? "cian" : "verde" };

  return (
    <>
      <tr>
        <td>
          <button type="button" className="lam-plegar" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ChevronRight size={14} className="chev" />
            <span>
              <span className="nom" style={{ display: "block" }}>{row.mat.nombre}</span>
              <span className="chico" style={{ display: "block" }}>{row.mat.unidad ?? "unidad"}</span>
            </span>
          </button>
        </td>
        <td className="der"><span className="lam-cant" data-tono={urg.tono}>{row.sinHistorial ? "—" : fmtNum(row.aComprar)}</span></td>
        <td className="der mono">{fmtNum(row.stockActual)}</td>
        {modo === "rotacion" ? (
          <>
            <td className="der mono">{row.sinHistorial ? "—" : fmtNum(row.egresoSemanal)}</td>
            <td style={{ minWidth: 110 }}>
              {row.sinHistorial ? <span className="vacio">—</span> : (
                <div style={{ display: "grid", gap: 4 }}>
                  <Mini pct={Math.min(100, (row.semanasDeStock / (buffer * 1.5)) * 100)} tono={urg.tono} />
                  <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{row.semanasDeStock === Infinity ? "∞" : row.semanasDeStock.toFixed(1)} sem</span>
                </div>
              )}
            </td>
          </>
        ) : (
          <td className="der mono">{fmtNum(row.faltaUsarTotal)}</td>
        )}
        <td><Estado tono={urg.tono}>{urg.label}</Estado></td>
        <td>
          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
            <input
              type="number" step="0.01" min="0"
              className="ui-input num"
              style={{ width: 80, minHeight: 32, textAlign: "right" }}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              aria-label={`Cantidad de ${row.mat.nombre} para pedir`}
            />
            <button type="button" className="ui-btn chico ui-btn-suave" disabled={num(cantidad) <= 0} onClick={() => onAgregar(row.mat.id, num(cantidad))}>
              <Plus size={13} /> Al pedido
            </button>
          </div>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={modo === "rotacion" ? 7 : 6} style={{ background: "var(--panel)" }}>
            {modo === "rotacion" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div className="lam-ayuda">Consumo por semana (últimas 12 con salidas)</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {row.porSemana.slice(0, 12).map((s) => (
                    <span key={s.semana} className="lam-estado" data-tono="neutro" style={{ minHeight: 26 }}>
                      {s.semanaLabel} <b className="mono" style={{ color: "var(--text)" }}>−{fmtNum(s.cantidad)}</b>
                    </span>
                  ))}
                  {!row.porSemana.length && <span className="lam-ayuda">Sin salidas registradas.</span>}
                </div>
                <div className="lam-ayuda">
                  Promedio {fmtNum(row.egresoSemanal)}/sem · objetivo {Math.ceil(row.egresoSemanal * buffer)} ({buffer} semanas) · stock {fmtNum(row.stockActual)}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {row.detalle.map((d) => (
                  <div key={d.obra} className="lam-cifra" style={{ display: "grid", gap: 5 }}>
                    <div style={{ fontWeight: 600 }} className="mono">{d.obra}</div>
                    <div className="lam-ayuda">Previsto {fmtNum(d.necesario)} · usado {fmtNum(d.egresado)} · falta {fmtNum(d.faltaUsar)}</div>
                    <Mini pct={d.necesario > 0 ? (d.egresado / d.necesario) * 100 : 0} />
                    {d.desmolde && <div className="lam-ayuda">Desmolde {fmtFecha(d.desmolde)}</div>}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Sugerencias({ materiales, movimientos, stockPorMaterial, obras, obraMateriales, onAgregar }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState("rotacion");
  const [buffer, setBuffer] = useState(3);
  const [soloNecesarios, setSoloNecesarios] = useState(true);
  const [q, setQ] = useState("");
  // "Hoy" se toma una vez al abrir la pestaña: alcanza para medir semanas.
  const [ahora] = useState(() => Date.now());

  const porObras = useMemo(() => {
    const enCurso = obras.filter((o) => o.estado === "activa" && o.loId);
    if (!materiales.length || !enCurso.length) return [];
    return materiales.map((mat) => {
      const stockActual = num(stockPorMaterial?.[mat.id] ?? 0);
      let faltaUsarTotal = 0;
      const detalle = [];
      for (const obra of enCurso) {
        const plan = obraMateriales.find((om) => om.obra_id === obra.loId && om.material_id === mat.id);
        const necesario = num(plan?.cantidad_necesaria);
        if (necesario <= 0) continue;
        // Los egresos guardan la obra en "destino" (antes se comparaba con
        // "obra", que los egresos no llenan, y nunca se restaba lo usado).
        const egresado = movimientos
          .filter((m) => m.material_id === mat.id && m.tipo === "egreso" && (esDeObra(obra, m.destino) || esDeObra(obra, m.obra)))
          .reduce((s, m) => s + num(m.cantidad), 0);
        const faltaUsar = Math.max(0, necesario - egresado);
        faltaUsarTotal += faltaUsar;
        detalle.push({ obra: obra.codigo, necesario, egresado, faltaUsar, desmolde: desmoldeDe(obra) });
      }
      return { mat, faltaUsarTotal, stockActual, aComprar: Math.max(0, faltaUsarTotal - stockActual), detalle };
    });
  }, [materiales, obras, obraMateriales, movimientos, stockPorMaterial]);

  const porRotacion = useMemo(() => {
    if (!materiales.length) return [];
    // Rango de observación: desde el movimiento más antiguo hasta hoy.
    const fechas = movimientos.map((m) => new Date(m.created_at).getTime()).filter(Boolean);
    const primerMov = fechas.length ? Math.min(...fechas) : ahora;
    const semanasObservadas = Math.max(1, (ahora - primerMov) / (7 * 24 * 3600 * 1000));
    return materiales.map((mat) => {
      const stockActual = num(stockPorMaterial?.[mat.id] ?? 0);
      const egresos = movimientos.filter((m) => m.material_id === mat.id && m.tipo === "egreso");
      const egresoTotal = egresos.reduce((s, m) => s + num(m.cantidad), 0);
      const sinHistorial = egresoTotal === 0;
      const porSemanaMap = {};
      egresos.forEach((m) => {
        const d = new Date(m.created_at);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // al lunes
        const key = d.toISOString().slice(0, 10);
        porSemanaMap[key] = (porSemanaMap[key] ?? 0) + num(m.cantidad);
      });
      const porSemana = Object.entries(porSemanaMap)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([semana, cantidad]) => {
          const [, mm, dd] = semana.split("-");
          return { semana, cantidad, semanaLabel: `${dd}/${mm}` };
        });
      const egresoSemanal = sinHistorial ? 0 : egresoTotal / semanasObservadas;
      const semanasDeStock = sinHistorial ? (stockActual > 0 ? Infinity : 0) : (egresoSemanal > 0 ? stockActual / egresoSemanal : Infinity);
      const objetivo = sinHistorial ? 0 : Math.ceil(egresoSemanal * buffer);
      const aComprar = sinHistorial ? 0 : Math.max(0, objetivo - stockActual);
      return { mat, stockActual, egresoSemanal, semanasDeStock, aComprar, porSemana, sinHistorial };
    });
  }, [materiales, movimientos, stockPorMaterial, buffer, ahora]);

  const base = modo === "obras" ? porObras : porRotacion;
  const filas = useMemo(() => {
    let rows = soloNecesarios ? base.filter((r) => r.aComprar > 0 || (r.sinHistorial && r.stockActual <= 0)) : base;
    const qq = q.trim().toLowerCase();
    if (qq) rows = rows.filter((r) => r.mat.nombre.toLowerCase().includes(qq));
    return [...rows].sort((a, b) => b.aComprar - a.aComprar);
  }, [base, soloNecesarios, q]);
  const paraReponer = base.filter((r) => r.aComprar > 0).length;

  return (
    <section className="lam-bloque">
      <button type="button" className="lam-plegar lam-bloque-cab" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <span className="lam-bloque-ic" data-tono="teal"><Lightbulb size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lam-bloque-tit">Sugerencias de reposición {paraReponer > 0 && <span className="lam-estado" data-tono="cian" style={{ marginLeft: 6 }}>{paraReponer} para reponer</span>}</div>
          <p className="lam-bloque-txt">Por consumo del galpón o por lo que falta usar en las obras en curso. Lo que elijas pasa al pedido de arriba.</p>
        </div>
        <ChevronRight size={16} className="chev" style={{ marginLeft: "auto" }} />
      </button>
      {abierto && (
        <div className="lam-bloque-cuerpo sin-pad">
          <div className="lam-filtros" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="lam-seg" role="group" aria-label="Cálculo">
              <button type="button" className={modo === "rotacion" ? "on" : ""} onClick={() => setModo("rotacion")}>Por consumo</button>
              <button type="button" className={modo === "obras" ? "on" : ""} onClick={() => setModo("obras")}>Por obras</button>
            </div>
            {modo === "rotacion" && (
              <div className="lam-seg" role="group" aria-label="Cobertura">
                {[2, 3, 4, 6].map((n) => (
                  <button key={n} type="button" className={buffer === n ? "on" : ""} onClick={() => setBuffer(n)}>{n} sem</button>
                ))}
              </div>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={soloNecesarios} onChange={(e) => setSoloNecesarios(e.target.checked)} /> Sólo lo que hay que reponer
            </label>
            <div className="lam-sp" />
            <label className="lam-buscar">
              <Search size={15} />
              <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…" aria-label="Buscar en sugerencias" />
            </label>
          </div>
          {!filas.length ? (
            <p className="lam-ayuda" style={{ padding: 16, color: "var(--green)" }}>
              {modo === "obras" ? "El stock alcanza para lo que falta en las obras en curso." : `Todo tiene cobertura para más de ${buffer} semanas.`}
            </p>
          ) : (
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="der">Reponer</th>
                    <th className="der">Stock</th>
                    {modo === "rotacion" ? <><th className="der">Consumo/sem</th><th>Cobertura</th></> : <th className="der">Falta usar</th>}
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {/* La clave incluye la sugerencia: si cambia la cobertura, la cantidad se recalcula. */}
                  {filas.map((row) => <FilaSugerencia key={`${row.mat.id}-${modo}-${row.aComprar}`} row={row} modo={modo} buffer={buffer} onAgregar={onAgregar} />)}
                </tbody>
              </table>
            </div>
          )}
          <p className="lam-ayuda" style={{ padding: "10px 16px 14px" }}>
            {modo === "rotacion"
              ? <>Reponer = consumo semanal × {buffer} semanas − stock. El consumo sale de todas las salidas registradas en el galpón.</>
              : <>Reponer = lo que falta usar en las obras en curso − stock. Necesita que las obras tengan su plan de materiales cargado.</>}
          </p>
        </div>
      )}
    </section>
  );
}
