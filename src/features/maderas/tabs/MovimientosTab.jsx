import { useMemo, useState } from "react";
import { ArrowDownUp, Download, Layers, Search, X } from "lucide-react";
import { buscarObra, descargarCSV, fmtFecha, fmtNum } from "@/features/laminacion/obras";
import { Bloque, Estado, Vacio } from "@/features/laminacion/ui";

const TIPOS = {
  ingreso: { label: "Ingreso", plural: "Ingresos", tono: "verde" },
  egreso: { label: "Egreso", plural: "Egresos", tono: "violeta" },
  ajuste: { label: "Ajuste", plural: "Ajustes", tono: "cian" },
};

export default function MovimientosTab({ materiales, movs, obras }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [materialId, setMaterialId] = useState("");
  const [orden, setOrden] = useState("desc");
  const [limite, setLimite] = useState(100);

  const filtrados = useMemo(() => {
    let rows = movs;
    if (tipo !== "todos") rows = rows.filter((m) => m._tipo === tipo);
    if (materialId) rows = rows.filter((m) => m.material_id === materialId);
    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter((m) => [m._material, m.proveedor, m.destino, m._persona, m._entrego, m.obra, m._obs, TIPOS[m._tipo]?.label]
        .filter(Boolean).join(" ").toLowerCase().includes(qq));
    }
    return [...rows].sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return orden === "asc" ? da - db : db - da;
    });
  }, [movs, tipo, materialId, q, orden]);

  const cuenta = useMemo(() => ({
    ingreso: movs.filter((m) => m._tipo === "ingreso").length,
    egreso: movs.filter((m) => m._tipo === "egreso").length,
    ajuste: movs.filter((m) => m._tipo === "ajuste").length,
  }), [movs]);

  const hayFiltros = Boolean(q || tipo !== "todos" || materialId);

  function exportar(soloFiltrados) {
    const datos = soloFiltrados ? filtrados : movs;
    const filas = datos.map((m) => ({
      Fecha: m._fecha ? fmtFecha(m._fecha) : "—",
      Hora: m.created_at ? new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—",
      Tipo: TIPOS[m._tipo]?.label ?? m._tipo,
      Material: m._material,
      Cantidad: m._delta,
      Unidad: m._unidad || "—",
      Proveedor: m._tipo === "ingreso" ? (m.proveedor ?? "—") : "—",
      Destino: m._tipo === "egreso" ? (m.destino ?? m.obra ?? "—") : "—",
      Persona: m._persona || "—",
      "Entregado por": m._entrego || "—",
      Obra: m.obra ?? "—",
      Observaciones: m._obsVisible || "—",
    }));
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    descargarCSV(filas, `movimientos_maderas${soloFiltrados && hayFiltros ? "_filtrado" : ""}_${hoy}.csv`);
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Maderas · Historial</div>
          <h1 className="lam-h1">Todos los <span className="acento">movimientos</span></h1>
          <p className="lam-sub">
            <b className="mono">{movs.length}</b> registros
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
          <button type="button" className={tipo === "todos" ? "on" : ""} onClick={() => setTipo("todos")}>Todos <span className="n">{movs.length}</span></button>
          {Object.entries(TIPOS).filter(([k]) => cuenta[k] > 0).map(([k, t]) => (
            <button key={k} type="button" className={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>{t.plural} <span className="n">{cuenta[k]}</span></button>
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
          <Vacio icono={Layers} titulo={movs.length ? "Sin resultados" : "Sin movimientos registrados"} texto={movs.length ? "Probá cambiando los filtros." : undefined} />
        ) : (
          <>
            <div className="lam-tabla">
              <table className="lam-t">
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Material</th><th className="der">Cantidad</th><th>Proveedor / destino</th><th>Persona</th><th>Observaciones</th></tr>
                </thead>
                <tbody>
                  {filtrados.slice(0, limite).map((m) => {
                    const t = TIPOS[m._tipo] ?? { label: m._tipo, tono: "neutro" };
                    const obra = buscarObra(obras, m.obra || m.destino);
                    const lugar = m._tipo === "ajuste" ? "Conteo de inventario" : m._tipo === "ingreso" ? (m.proveedor || m.obra) : (m.obra || m.destino);
                    return (
                      <tr key={m.id}>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtFecha(m._fecha)}</td>
                        <td><Estado tono={t.tono}>{t.label}</Estado></td>
                        <td><div className="nom">{m._material}</div></td>
                        <td className="der">
                          <span className="lam-cant" data-tono={t.tono}>
                            {m._delta > 0 ? "+" : "−"}{fmtNum(m._cant)} <small>{m._unidad}</small>
                          </span>
                        </td>
                        <td>
                          {obra && m._tipo !== "ingreso" ? <Estado tono="azul" punto={false}>{obra.codigo}</Estado> : (lugar || <span className="vacio">—</span>)}
                        </td>
                        <td>
                          {m._persona || <span className="vacio">—</span>}
                          {m._entrego && <div className="chico">entregó {m._entrego}</div>}
                        </td>
                        <td style={{ maxWidth: 260 }}><span style={{ color: "var(--muted)" }}>{m._obsVisible || <span className="vacio">—</span>}</span></td>
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
