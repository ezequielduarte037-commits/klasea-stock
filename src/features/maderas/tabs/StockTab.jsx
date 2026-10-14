import { useMemo, useState } from "react";
import { Boxes, Download, Scale, Search } from "lucide-react";
import { descargarCSV, fmtNum, num } from "@/features/laminacion/obras";
import { Bloque, Estado, Mini, Vacio } from "@/features/laminacion/ui";
import Cargando from "@/components/ui/Cargando";

const ESTADOS = {
  CRITICO: { label: "Sin stock", tono: "rojo" },
  ATENCION: { label: "Bajo mínimo", tono: "cian" },
  OK: { label: "OK", tono: "verde" },
};
const ORDEN = { CRITICO: 0, ATENCION: 1, OK: 2 };

export default function StockTab({ materiales, stockPorMaterial, enCaminoPorMaterial, isAdmin, cargando, onAjuste, onCambiarMinimo }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [categoria, setCategoria] = useState("");

  const filas = useMemo(() => materiales.map((m) => {
    const stock = num(stockPorMaterial[m.id]);
    const minimo = num(m.stock_minimo);
    const estado = stock <= 0 ? "CRITICO" : stock <= minimo ? "ATENCION" : "OK";
    return { ...m, stock, minimo, estado, enCamino: num(enCaminoPorMaterial[m.id]) };
  }), [materiales, stockPorMaterial, enCaminoPorMaterial]);

  const categorias = useMemo(() => {
    const vistas = new Map();
    for (const m of materiales) {
      const c = String(m.categoria || "").trim();
      if (c) vistas.set(c, (vistas.get(c) || 0) + 1);
    }
    return [...vistas.entries()].sort((a, b) => b[1] - a[1]);
  }, [materiales]);

  const deCategoria = useMemo(() => (categoria ? filas.filter((f) => f.categoria === categoria) : filas), [filas, categoria]);
  const cuenta = useMemo(() => ({
    CRITICO: deCategoria.filter((f) => f.estado === "CRITICO").length,
    ATENCION: deCategoria.filter((f) => f.estado === "ATENCION").length,
    OK: deCategoria.filter((f) => f.estado === "OK").length,
  }), [deCategoria]);

  const visibles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return deCategoria
      .filter((f) => filtro === "todos" || f.estado === filtro)
      .filter((f) => !qq || `${f.nombre} ${f.categoria || ""} ${f.codigo || ""}`.toLowerCase().includes(qq))
      // Lo que falta, arriba: es lo que hay que mirar primero.
      .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  }, [deCategoria, filtro, q]);

  const total = filas.length;
  const sinStock = filas.filter((f) => f.estado === "CRITICO").length;
  const bajoMinimo = filas.filter((f) => f.estado === "ATENCION").length;

  function exportar() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas.map((m) => ({
      Codigo: m.codigo ?? "—",
      Material: m.nombre,
      Categoria: m.categoria ?? "—",
      Unidad: m.unidad_medida ?? "—",
      Stock_actual: m.stock,
      Stock_minimo: m.minimo,
      En_camino: m.enCamino,
      Estado: ESTADOS[m.estado].label,
    })), `stock_maderas_${hoy}.csv`);
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Maderas · Inventario</div>
          <h1 className="lam-h1">Stock de <span className="acento">maderas</span></h1>
          <p className="lam-sub">
            <b className="mono">{total}</b> materiales
            {sinStock > 0 && <> · <b className="mono">{sinStock}</b> sin stock</>}
            {bajoMinimo > 0 && <> · <b className="mono">{bajoMinimo}</b> bajo el mínimo</>}
          </p>
        </div>
        <div className="lam-acciones">
          {isAdmin && <button type="button" className="ui-btn" onClick={onAjuste}><Scale size={15} /> Ajuste de inventario</button>}
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={exportar} disabled={!filas.length}><Download size={15} /> CSV</button>
        </div>
      </div>

      <div className="lam-filtros">
        {categorias.length > 1 && (
          <div className="lam-seg" role="group" aria-label="Categoría">
            <button type="button" className={!categoria ? "on" : ""} onClick={() => setCategoria("")}>Todas</button>
            {categorias.map(([c, n]) => (
              <button key={c} type="button" className={categoria === c ? "on" : ""} onClick={() => setCategoria(c)}>{c} <span className="n">{n}</span></button>
            ))}
          </div>
        )}
        <div className="lam-scroll-x">
          {["CRITICO", "ATENCION", "OK"].map((k) => (
            <button key={k} type="button" className={`lam-chip${filtro === k ? " on" : ""}`} data-tono={ESTADOS[k].tono} onClick={() => setFiltro(filtro === k ? "todos" : k)} aria-pressed={filtro === k}>
              <span className="pto" /> {ESTADOS[k].label} <span className="n">{cuenta[k]}</span>
            </button>
          ))}
        </div>
        <div className="lam-sp" />
        <label className="lam-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material o código…" aria-label="Buscar material" />
        </label>
      </div>

      <Bloque sinPad>
        {cargando ? <Cargando texto="Trayendo el stock…" /> : !visibles.length ? (
          <Vacio
            icono={Boxes}
            titulo={materiales.length ? "Ningún material con este filtro" : "Sin materiales cargados"}
            texto={materiales.length ? "Probá con otro estado, categoría o búsqueda." : "El catálogo de maderas se carga desde Administración."}
          />
        ) : (
          <div className="lam-tabla">
            <table className="lam-t">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Stock</th>
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
                        <div className="chico">
                          {m.codigo && <span className="mono" style={{ marginRight: 6 }}>{m.codigo}</span>}
                          {m.categoria || "Sin categoría"} · {m.unidad_medida}
                        </div>
                      </td>
                      <td>
                        <div className="lam-stock" data-tono={est.tono}>
                          <span className="lam-stock-v">{fmtNum(m.stock)} <small style={{ fontSize: 11, color: "var(--dim)", fontFamily: "Outfit, sans-serif", fontWeight: 500 }}>{m.unidad_medida}</small></span>
                          <Mini pct={pct} tono={est.tono} style={{ maxWidth: 140 }} />
                        </div>
                      </td>
                      <td className="der">
                        {isAdmin ? (
                          <input
                            key={m.minimo}
                            type="number" step="1" min="0"
                            className="ui-input num lam-min"
                            defaultValue={m.minimo}
                            aria-label={`Mínimo de ${m.nombre}`}
                            title="Mínimo de reposición: por debajo, el material aparece como «Bajo mínimo»."
                            onBlur={async (e) => {
                              const valor = Math.round(num(e.target.value));
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
                          ? <span className="lam-cant" data-tono="azul" title="Pedido y todavía sin recibir">+{fmtNum(m.enCamino)} <small>{m.unidad_medida}</small></span>
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
