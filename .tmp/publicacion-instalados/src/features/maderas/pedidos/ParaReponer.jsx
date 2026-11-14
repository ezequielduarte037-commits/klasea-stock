import { useMemo, useState } from "react";
import { ChevronRight, Lightbulb, Plus, Search } from "lucide-react";
import { fmtNum, num } from "@/features/laminacion/obras";
import { Estado, Mini } from "@/features/laminacion/ui";
import { VENTANA_SEMANAS, consumoPorMaterial } from "../datos";

// Qué conviene reponer: lo que cubre N semanas de consumo (o el mínimo, si es
// más) menos el stock y lo que ya viene en camino. El consumo son las salidas de
// las últimas 16 semanas, sin los ajustes de inventario. Lo que se elige pasa
// al Stock del pedido que se está armando.

function urgencia(row, buffer) {
  if (row.stock <= 0) return { label: "Sin stock", tono: "rojo" };
  if (!row.semanal) return row.minimo > 0 && row.stock <= row.minimo ? { label: "Bajo mínimo", tono: "cian" } : { label: "Sin consumo", tono: "neutro" };
  if (row.cobertura < 1) return { label: "Crítico", tono: "rojo" };
  if (row.cobertura < buffer * 0.5) return { label: "Urgente", tono: "violeta" };
  if (row.cobertura < buffer || row.stock <= row.minimo) return { label: "Atención", tono: "cian" };
  return { label: "OK", tono: "verde" };
}

function Fila({ row, buffer, onAgregar }) {
  const [abierta, setAbierta] = useState(false);
  const [cantidad, setCantidad] = useState(String(row.reponer || ""));
  const urg = urgencia(row, buffer);
  return (
    <>
      <tr>
        <td>
          <button type="button" className="lam-plegar" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ChevronRight size={14} className="chev" />
            <span>
              <span className="nom" style={{ display: "block" }}>{row.mat.nombre}</span>
              <span className="chico" style={{ display: "block" }}>{row.mat.categoria || "Sin categoría"} · {row.mat.unidad_medida}</span>
            </span>
          </button>
        </td>
        <td className="der mono">{fmtNum(row.stock)}</td>
        <td className="der">{row.enCamino > 0 ? <span className="lam-cant" data-tono="azul">+{fmtNum(row.enCamino)}</span> : <span className="vacio">—</span>}</td>
        <td className="der mono">{row.semanal ? fmtNum(Math.round(row.semanal * 10) / 10) : <span className="vacio">—</span>}</td>
        <td style={{ minWidth: 110 }}>
          {!row.semanal ? <span className="vacio">—</span> : (
            <div style={{ display: "grid", gap: 4 }}>
              <Mini pct={Math.min(100, (row.cobertura / (buffer * 1.5)) * 100)} tono={urg.tono} />
              <span className="mono" style={{ fontSize: 11, color: "var(--dim)" }}>{row.cobertura === Infinity ? "∞" : row.cobertura.toFixed(1)} sem</span>
            </div>
          )}
        </td>
        <td><Estado tono={urg.tono}>{urg.label}</Estado></td>
        <td>
          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
            <input
              type="number" step="1" min="0" inputMode="numeric"
              className="ui-input num"
              style={{ width: 72, minHeight: 32, textAlign: "right" }}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              aria-label={`Cantidad de ${row.mat.nombre} para pedir`}
            />
            <button type="button" className="ui-btn chico ui-btn-suave" disabled={num(cantidad) <= 0} onClick={() => onAgregar(row.mat, Math.round(num(cantidad)))}>
              <Plus size={13} /> Al pedido
            </button>
          </div>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={7} style={{ background: "var(--panel)" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="lam-ayuda">Salidas por semana (últimas 8 con movimiento)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {row.porSemana.map((s) => (
                  <span key={s.semana} className="lam-estado" data-tono="neutro" style={{ minHeight: 26 }}>
                    {s.label} <b className="mono" style={{ color: "var(--text)" }}>−{fmtNum(s.cantidad)}</b>
                  </span>
                ))}
                {!row.porSemana.length && <span className="lam-ayuda">Sin salidas en las últimas {VENTANA_SEMANAS} semanas.</span>}
              </div>
              <div className="lam-ayuda">
                Promedio {fmtNum(Math.round(row.semanal * 100) / 100)}/sem · para {buffer} semanas hacen falta {fmtNum(row.objetivo)}
                {row.minimo > 0 && <> · mínimo {fmtNum(row.minimo)}</>} · hay {fmtNum(row.stock)}{row.enCamino > 0 && <> y vienen {fmtNum(row.enCamino)}</>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ParaReponer({ materiales, movimientos, stockPorMaterial, enCaminoPorMaterial, onAgregar }) {
  const [abiertoUsuario, setAbiertoUsuario] = useState(null);
  const [buffer, setBuffer] = useState(4);
  const [soloNecesarios, setSoloNecesarios] = useState(true);
  const [q, setQ] = useState("");
  // "Hoy" se toma una vez al abrir la pestaña: alcanza para medir semanas.
  const [ahora] = useState(() => Date.now());

  const consumo = useMemo(() => consumoPorMaterial(movimientos, ahora), [movimientos, ahora]);

  const base = useMemo(() => materiales.map((mat) => {
    const stock = num(stockPorMaterial[mat.id]);
    const enCamino = num(enCaminoPorMaterial[mat.id]);
    const minimo = num(mat.stock_minimo);
    const c = consumo.get(mat.id);
    const semanal = c?.semanal || 0;
    const objetivo = Math.max(Math.ceil(semanal * buffer), minimo);
    const reponer = Math.max(0, objetivo - stock - enCamino);
    const cobertura = semanal > 0 ? stock / semanal : Infinity;
    return { mat, stock, enCamino, minimo, semanal, objetivo, reponer, cobertura, porSemana: c?.porSemana ?? [] };
  }), [materiales, stockPorMaterial, enCaminoPorMaterial, consumo, buffer]);

  const paraReponer = base.filter((r) => r.reponer > 0).length;
  const abierto = abiertoUsuario ?? paraReponer > 0;

  const filas = useMemo(() => {
    let rows = soloNecesarios ? base.filter((r) => r.reponer > 0) : base;
    const qq = q.trim().toLowerCase();
    if (qq) rows = rows.filter((r) => r.mat.nombre.toLowerCase().includes(qq));
    // Lo que se acaba antes, arriba. Sin stock va primero aunque no tenga consumo.
    const clave = (r) => (r.stock <= 0 ? -1 : r.cobertura);
    return [...rows].sort((a, b) => {
      const ka = clave(a);
      const kb = clave(b);
      if (ka === kb) return b.reponer - a.reponer;
      return ka < kb ? -1 : 1;
    });
  }, [base, soloNecesarios, q]);

  return (
    <section className="lam-bloque">
      <button type="button" className="lam-plegar lam-bloque-cab" aria-expanded={abierto} onClick={() => setAbiertoUsuario(!abierto)}>
        <span className="lam-bloque-ic" data-tono="teal"><Lightbulb size={16} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lam-bloque-tit">
            Para reponer
            {paraReponer > 0
              ? <span className="lam-estado" data-tono="cian" style={{ marginLeft: 8 }}>{paraReponer} {paraReponer === 1 ? "material" : "materiales"}</span>
              : <span className="lam-estado" data-tono="verde" style={{ marginLeft: 8 }}>Todo cubierto</span>}
          </div>
          <p className="lam-bloque-txt">Según lo que se viene usando y el mínimo de cada material. Ya descuenta lo pedido que todavía no llegó.</p>
        </div>
        <ChevronRight size={16} className="chev" style={{ marginLeft: "auto" }} />
      </button>
      {abierto && (
        <div className="lam-bloque-cuerpo sin-pad">
          <div className="lam-filtros" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="lam-seg" role="group" aria-label="Semanas de cobertura">
              {[2, 3, 4, 6, 8].map((n) => (
                <button key={n} type="button" className={buffer === n ? "on" : ""} onClick={() => setBuffer(n)}>{n} sem</button>
              ))}
            </div>
            <label className="mad-check">
              <input type="checkbox" checked={soloNecesarios} onChange={(e) => setSoloNecesarios(e.target.checked)} style={{ accentColor: "var(--blue)" }} /> Sólo lo que hay que reponer
            </label>
            <div className="lam-sp" />
            <label className="lam-buscar">
              <Search size={15} />
              <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…" aria-label="Buscar en para reponer" />
            </label>
          </div>
          {!filas.length ? (
            <p className="lam-ayuda" style={{ padding: 16, color: q ? "var(--dim)" : "var(--green)" }}>
              {q ? "Ningún material coincide." : `Todo tiene stock para más de ${buffer} semanas y está sobre el mínimo.`}
            </p>
          ) : (
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="der">Stock</th>
                    <th className="der">En camino</th>
                    <th className="der">Usa por sem.</th>
                    <th>Alcanza</th>
                    <th>Estado</th>
                    <th className="der">Reponer</th>
                  </tr>
                </thead>
                <tbody>
                  {/* La clave incluye la sugerencia: si cambian las semanas, la cantidad se recalcula. */}
                  {filas.map((row) => <Fila key={`${row.mat.id}-${row.reponer}`} row={row} buffer={buffer} onAgregar={onAgregar} />)}
                </tbody>
              </table>
            </div>
          )}
          <p className="lam-ayuda" style={{ padding: "10px 16px 14px" }}>
            Reponer = lo que se usa en {buffer} semanas (o el mínimo, si es más) − stock − en camino. Consumo de las últimas {VENTANA_SEMANAS} semanas.
          </p>
        </div>
      )}
    </section>
  );
}
