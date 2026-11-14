import { useMemo, useState } from "react";
import { ArrowDownUp, Download, Layers, Search, X } from "lucide-react";
import { buscarObra, descargarCSV, fmtFecha, fmtNum, num } from "../obras";
import { Bloque, Estado, Vacio } from "../ui";

const TIPOS = {
  ingreso: { label: "Ingreso", tono: "verde", signo: "+" },
  egreso: { label: "Egreso", tono: "violeta", signo: "−" },
  ajuste: { label: "Ajuste", tono: "cian", signo: "" },
};

export default function MovimientosTab({ sede, materiales, movimientos, obras }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [materialId, setMaterialId] = useState("");
  const [orden, setOrden] = useState("desc");
  const [limite, setLimite] = useState(100);

  const filtrados = useMemo(() => {
    let rows = [...movimientos];
    if (tipo !== "todos") rows = rows.filter((m) => m.tipo === tipo);
    if (materialId) rows = rows.filter((m) => m.material_id === materialId);
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((m) => [m.laminacion_materiales?.nombre, m.proveedor, m.destino, m.nombre_persona, m.obra, m.observaciones, m.tipo]
        .filter(Boolean).join(" ").toLowerCase().includes(qq));
    }
    rows.sort((a, b) => {
      const da = new Date(a.fecha || a.created_at).getTime();
      const db = new Date(b.fecha || b.created_at).getTime();
      return orden === "asc" ? da - db : db - da;
    });
    return rows;
  }, [movimientos, tipo, materialId, q, orden]);

  const cuenta = useMemo(() => ({
    ingreso: movimientos.filter((m) => m.tipo === "ingreso").length,
    egreso: movimientos.filter((m) => m.tipo === "egreso").length,
    ajuste: movimientos.filter((m) => m.tipo === "ajuste").length,
  }), [movimientos]);

  const hayFiltros = q || tipo !== "todos" || materialId;

  function exportar(soloFiltrados) {
    const datos = soloFiltrados ? filtrados : movimientos;
    const filas = datos.map((m) => ({
      Fecha: m.fecha || m.created_at ? new Date(m.fecha || m.created_at).toLocaleDateString("es-AR") : "—",
      Hora: m.created_at ? new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—",
      Tipo: TIPOS[m.tipo]?.label ?? m.tipo,
      Material: m.laminacion_materiales?.nombre ?? "—",
      Cantidad: m.tipo === "egreso" ? -num(m.cantidad) : num(m.cantidad),
      Unidad: m.laminacion_materiales?.unidad ?? "—",
      Proveedor: m.tipo === "ingreso" ? (m.proveedor ?? "—") : "—",
      Destino: m.tipo === "egreso" ? (m.destino ?? "—") : "—",
      Persona: m.nombre_persona ?? "—",
      Obra: m.obra ?? "—",
      Observaciones: m.observaciones ?? "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `movimientos_laminacion_${sede}${soloFiltrados && hayFiltros ? "_filtrado" : ""}_${hoy}.csv`);
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Todos los <span className="acento">movimientos</span></h1>
          <p className="lam-sub">
            <b className="mono">{movimientos.length}</b> registros
            {hayFiltros && <> · <b className="mono">{filtrados.length}</b> con estos filtros</>}
          </p>
        </div>
        <div className="lam-acciones">
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => exportar(true)} disabled={!filtrados.length}>
            <Download size={15} /> CSV{hayFiltros ? " filtrado" : ""}
          </button>
          {hayFiltros && <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => exportar(false)}>CSV completo</button>}
        </div>
      </div>

      <div className="lam-filtros">
        <div className="lam-seg" role="group" aria-label="Tipo">
          <button type="button" className={tipo === "todos" ? "on" : ""} onClick={() => setTipo("todos")}>Todos <span className="n">{movimientos.length}</span></button>
          {Object.entries(TIPOS).filter(([k]) => cuenta[k] > 0).map(([k, t]) => (
            <button key={k} type="button" className={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>{t.label}s <span className="n">{cuenta[k]}</span></button>
          ))}
        </div>
        <select className="ui-input" style={{ width: 220, minHeight: 36, fontSize: 13 }} value={materialId} onChange={(e) => setMaterialId(e.target.value)} aria-label="Filtrar por material">
          <option value="">Todos los materiales</option>
          {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setOrden((o) => (o === "desc" ? "asc" : "desc"))}>
          <ArrowDownUp size={14} /> {orden === "desc" ? "Más recientes" : "Más antiguos"}
        </button>
        {hayFiltros && (
          <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => { setQ(""); setTipo("todos"); setMaterialId(""); }}>
            <X size={14} /> Limpiar
          </button>
        )}
        <div className="lam-sp" />
        <label className="lam-buscar">
          <Search size={15} />
          <input className="ui-input" value={q} onChange={(e) => { setQ(e.target.value); setLimite(100); }} placeholder="Material, persona, obra…" aria-label="Buscar movimientos" />
        </label>
      </div>

      <Bloque sinPad>
        {!filtrados.length ? (
          <Vacio icono={Layers} titulo={movimientos.length ? "Sin resultados" : "Sin movimientos registrados"} texto={movimientos.length ? "Probá cambiando los filtros." : undefined} />
        ) : (
          <>
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Material</th><th className="der">Cantidad</th><th>Proveedor / destino</th><th>Persona</th><th>Obra</th><th>Observaciones</th></tr>
                </thead>
                <tbody>
                  {filtrados.slice(0, limite).map((m) => {
                    const t = TIPOS[m.tipo] ?? { label: m.tipo, tono: "neutro", signo: "" };
                    const obra = buscarObra(obras, m.obra || (m.tipo === "egreso" ? m.destino : ""));
                    const cantidad = num(m.cantidad);
                    return (
                      <tr key={m.id}>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtFecha(m.fecha || m.created_at)}</td>
                        <td><Estado tono={t.tono}>{t.label}</Estado></td>
                        <td><div className="nom">{m.laminacion_materiales?.nombre ?? "—"}</div></td>
                        <td className="der">
                          <span className="lam-cant" data-tono={t.tono}>
                            {m.tipo === "ajuste" ? (cantidad > 0 ? "+" : "") : t.signo}{fmtNum(cantidad)} <small>{m.laminacion_materiales?.unidad ?? ""}</small>
                          </span>
                        </td>
                        <td>{(m.tipo === "ingreso" ? m.proveedor : m.destino) || <span className="vacio">—</span>}</td>
                        <td>{m.nombre_persona || <span className="vacio">—</span>}</td>
                        <td>{obra ? <Estado tono="azul" punto={false}>{obra.codigo}</Estado> : m.obra || <span className="vacio">—</span>}</td>
                        <td style={{ maxWidth: 240 }}><span style={{ color: "var(--muted)" }}>{m.observaciones || <span className="vacio">—</span>}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtrados.length > limite && (
              <div className="lam-mas">
                Mostrando {limite} de {filtrados.length}. <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setLimite((n) => n + 200)}>Ver más</button>
              </div>
            )}
          </>
        )}
      </Bloque>
    </>
  );
}
