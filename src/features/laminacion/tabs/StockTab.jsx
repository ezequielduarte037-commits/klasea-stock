import { useMemo, useState } from "react";
import { Boxes, Download, Scale, Search } from "lucide-react";
import { descargarCSV, fmtNum, num } from "../obras";
import { Bloque, Estado, Mini, Vacio } from "../ui";

const ESTADOS = {
  CRITICO: { label: "Sin stock", tono: "rojo" },
  ATENCION: { label: "Bajo mínimo", tono: "cian" },
  OK: { label: "OK", tono: "verde" },
};

export default function StockTab({ sede, materiales, stockPorMaterial, enCaminoPorMaterial, isAdmin, cargando, onAjuste, onCambiarMinimo }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const filas = useMemo(() => materiales.map((m) => {
    const stock = num(stockPorMaterial[m.id]);
    const minimo = num(m.stock_minimo);
    const estado = stock <= 0 ? "CRITICO" : stock <= minimo ? "ATENCION" : "OK";
    return { ...m, stock, minimo, estado, enCamino: num(enCaminoPorMaterial[m.id]) };
  }), [materiales, stockPorMaterial, enCaminoPorMaterial]);

  const cuenta = useMemo(() => ({
    CRITICO: filas.filter((f) => f.estado === "CRITICO").length,
    ATENCION: filas.filter((f) => f.estado === "ATENCION").length,
    OK: filas.filter((f) => f.estado === "OK").length,
  }), [filas]);

  const visibles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return filas
      .filter((f) => filtro === "todos" || f.estado === filtro)
      .filter((f) => !qq || `${f.nombre} ${f.categoria || ""}`.toLowerCase().includes(qq))
      // Lo que falta, arriba: es lo que hay que mirar primero.
      .sort((a, b) => ({ CRITICO: 0, ATENCION: 1, OK: 2 }[a.estado] - { CRITICO: 0, ATENCION: 1, OK: 2 }[b.estado]) || a.nombre.localeCompare(b.nombre, "es"));
  }, [filas, filtro, q]);

  function exportar() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas.map((m) => ({
      Material: m.nombre,
      Categoria: m.categoria ?? "—",
      Unidad: m.unidad ?? "—",
      Stock_actual: m.stock,
      Stock_minimo: m.minimo,
      En_camino: m.enCamino,
      Estado: ESTADOS[m.estado].label,
    })), `stock_laminacion_${sede}_${hoy}.csv`);
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Stock del <span className="acento">galpón</span></h1>
          <p className="lam-sub">
            <b className="mono">{materiales.length}</b> materiales
            {cuenta.CRITICO > 0 && <> · <b className="mono">{cuenta.CRITICO}</b> sin stock</>}
            {cuenta.ATENCION > 0 && <> · <b className="mono">{cuenta.ATENCION}</b> bajo el mínimo</>}
          </p>
        </div>
        <div className="lam-acciones">
          {isAdmin && <button type="button" className="ui-btn" onClick={onAjuste}><Scale size={15} /> Ajuste de inventario</button>}
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={exportar} disabled={!filas.length}><Download size={15} /> CSV</button>
        </div>
      </div>

      <div className="lam-filtros">
        <div className="lam-scroll-x">
          <button type="button" className={`lam-chip${filtro === "todos" ? " on" : ""}`} onClick={() => setFiltro("todos")}>Todos <span className="n">{filas.length}</span></button>
          {["CRITICO", "ATENCION", "OK"].map((k) => (
            <button key={k} type="button" className={`lam-chip${filtro === k ? " on" : ""}`} data-tono={ESTADOS[k].tono} onClick={() => setFiltro(filtro === k ? "todos" : k)}>
              <span className="pto" /> {ESTADOS[k].label} <span className="n">{cuenta[k]}</span>
            </button>
          ))}
        </div>
        <div className="lam-sp" />
        <label className="lam-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material…" aria-label="Buscar material" />
        </label>
      </div>

      <Bloque sinPad>
        {cargando ? null : !visibles.length ? (
          <Vacio
            icono={Boxes}
            titulo={materiales.length ? "Ningún material con este filtro" : "Sin materiales cargados"}
            texto={materiales.length ? "Probá con otro estado o búsqueda." : "Usá «Material» arriba para dar de alta el catálogo."}
          />
        ) : (
          <div className="lam-tabla">
            <table className="lam-t">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Stock en {sede}</th>
                  <th className="der">Mínimo</th>
                  <th className="der">En camino</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => {
                  const est = ESTADOS[m.estado];
                  const pct = m.minimo > 0 ? Math.min(100, (m.stock / (m.minimo * 2)) * 100) : (m.stock > 0 ? 100 : 0);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="nom">{m.nombre}</div>
                        <div className="chico">{m.categoria || "Sin categoría"} · {m.unidad}</div>
                      </td>
                      <td>
                        <div className="lam-stock" data-tono={est.tono}>
                          <span className="lam-stock-v">{fmtNum(m.stock)} <small style={{ fontSize: 11, color: "var(--dim)", fontFamily: "Outfit, sans-serif", fontWeight: 500 }}>{m.unidad}</small></span>
                          <Mini pct={pct} tono={est.tono} style={{ maxWidth: 140 }} />
                        </div>
                      </td>
                      <td className="der">
                        {isAdmin ? (
                          <input
                            type="number" step="0.01" min="0"
                            className="ui-input num lam-min"
                            defaultValue={m.minimo}
                            aria-label={`Mínimo de ${m.nombre} en ${sede}`}
                            title={`Mínimo de reposición en ${sede}. El del otro galpón se carga desde allá.`}
                            onBlur={async (e) => {
                              const valor = num(e.target.value);
                              if (valor === m.minimo) return;
                              const ok = await onCambiarMinimo(m, valor);
                              if (!ok) e.target.value = m.minimo;
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          />
                        ) : (
                          <span className="mono">{fmtNum(m.minimo)}</span>
                        )}
                      </td>
                      <td className="der">
                        {m.enCamino > 0
                          ? <span className="lam-cant" data-tono="azul" title="Pedido y todavía sin recibir">+{fmtNum(m.enCamino)} <small>{m.unidad}</small></span>
                          : <span className="vacio">—</span>}
                      </td>
                      <td><Estado tono={est.tono}>{est.label}</Estado></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>
    </>
  );
}
