import { useState } from "react";
import {
  AlertTriangle, Check, Layers, Pencil, Plus, RotateCcw, Trash2, X,
} from "lucide-react";
import {
  T, PANEL, EYEBROW, INP_SM, ICON_BTN, bucketMeta, ESTADO_META,
} from "./marmShared";

function BarraSegmentada({ stats }) {
  const total = stats.recibidas + stats.enviadas + stats.pendientes + stats.rehacer;
  if (total === 0) {
    return <div style={{ height:4, background:"var(--panel-2)", borderRadius:99 }} />;
  }

  const segmento = (cantidad, color) => cantidad > 0 && (
    <div key={color} style={{ width:`${cantidad / total * 100}%`, height:"100%", background:color }} />
  );

  return (
    <div style={{ height:4, display:"flex", overflow:"hidden", borderRadius:99, background:"var(--panel-2)" }}>
      {segmento(stats.recibidas, ESTADO_META.Recibido.color)}
      {segmento(stats.enviadas, ESTADO_META.Enviado.color)}
      {segmento(stats.rehacer, ESTADO_META.Rehacer.color)}
      {segmento(stats.pendientes, ESTADO_META.Pendiente.color)}
    </div>
  );
}

function BarcoCard({ unidad, stats, desmoldeRow, selected, onClick }) {
  const bucket = desmoldeRow ? bucketMeta(desmoldeRow.bucket) : null;
  const requierePedido = desmoldeRow && ["ahora", "proximos"].includes(desmoldeRow.bucket);
  const sinActividad = !stats || stats.total === 0;

  return (
    <div
      className="mrm-card"
      onClick={onClick}
      style={{
        ...PANEL, padding:"11px 12px", cursor:"pointer",
        borderColor:selected ? "var(--blue-border)" : "var(--border)",
        background:selected ? "var(--blue-soft)" : "var(--panel-solid)",
        display:"flex", flexDirection:"column", gap:8,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <span style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:"var(--text)" }}>
          {unidad.codigo}
        </span>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          {stats?.rehacer > 0 && (
            <span title={`${stats.rehacer} a rehacer`} style={{
              display:"inline-flex", alignItems:"center", gap:3,
              color:"var(--red)", fontFamily:T.mono, fontSize:10, fontWeight:700,
            }}>
              <RotateCcw size={10} /> {stats.rehacer}
            </span>
          )}
          {stats?.demoradas.length > 0 && (
            <span title={`${stats.demoradas.length} demorada(s)`} style={{
              display:"inline-flex", alignItems:"center", gap:3,
              color:"var(--amber)", fontFamily:T.mono, fontSize:10, fontWeight:700,
            }}>
              <AlertTriangle size={10} /> {stats.demoradas.length}
            </span>
          )}
          {requierePedido && (
            <span style={{
              padding:"2px 6px", borderRadius:6,
              border:`1px solid ${bucket.border}`, background:bucket.bg, color:bucket.color,
              fontSize:9, fontWeight:700, whiteSpace:"nowrap",
            }}>
              {desmoldeRow.bucket === "ahora" ? "Pedir" : "Próximo"}
            </span>
          )}
        </div>
      </div>

      {sinActividad ? (
        <div style={{ fontSize:11, color:"var(--dim)" }}>Checklist vacío</div>
      ) : (
        <>
          <BarraSegmentada stats={stats} />
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:11, color:"var(--dim)" }}>
              {stats.recibidas}/{stats.total} recibidas
              {stats.enviadas > 0 && <span style={{ color:"var(--blue)" }}> · {stats.enviadas} enviadas</span>}
            </span>
            <span style={{
              fontFamily:T.mono, fontSize:12, fontWeight:700,
              color:stats.pct === 100 ? "var(--green)" : "var(--muted)",
            }}>
              {stats.pct}%
            </span>
          </div>
          {stats.materiales.length > 0 && (
            <div style={{
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              color:"var(--dim)", fontSize:10,
            }}>
              {stats.materiales.slice(0, 2).join(" · ")}
              {stats.materiales.length > 2 ? ` · +${stats.materiales.length - 2}` : ""}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FleetBoard({
  lineas, unidadesPorLinea, statsPorUnidad, desmoldePorCodigo,
  selectedId, onSelectBoat, esAdmin,
  onVerPlantilla, onCreateLinea, onRenameLinea, onDeleteLinea, onCreateUnidad,
}) {
  const [renameId, setRenameId] = useState(null);
  const [renameNombre, setRenameNombre] = useState("");
  const [addLineaId, setAddLineaId] = useState(null);
  const [addCodigo, setAddCodigo] = useState("");
  const [newLinea, setNewLinea] = useState("");

  const totalBarcos = lineas.reduce((total, linea) => total + (unidadesPorLinea[linea.id]?.length ?? 0), 0);

  const confirmRename = () => {
    onRenameLinea(renameId, renameNombre);
    setRenameId(null);
  };

  const confirmAddBarco = (lineaId) => {
    onCreateUnidad(lineaId, addCodigo);
    setAddCodigo("");
    setAddLineaId(null);
  };

  const confirmNewLinea = () => {
    onCreateLinea(newLinea);
    setNewLinea("");
  };

  return (
    <section>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Layers size={14} style={{ color:"var(--muted)" }} />
          <span style={EYEBROW}>Barcos por línea</span>
        </div>
        <span style={{ fontSize:11, color:"var(--dim)" }}>{totalBarcos} activos</span>
      </div>

      {lineas.map(linea => {
        const unidades = unidadesPorLinea[linea.id] ?? [];

        return (
          <div key={linea.id} style={{ marginBottom:20 }}>
            <div style={{
              minHeight:30, marginBottom:8,
              display:"flex", alignItems:"center", gap:7, flexWrap:"wrap",
            }}>
              {renameId === linea.id ? (
                <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
                  <input
                    autoFocus
                    style={{ ...INP_SM, width:110, padding:"3px 8px" }}
                    value={renameNombre}
                    onChange={event => setRenameNombre(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") confirmRename();
                      if (event.key === "Escape") setRenameId(null);
                    }}
                  />
                  <button className="mrm-icon-btn" style={ICON_BTN} onClick={confirmRename} title="Guardar"><Check size={13} /></button>
                  <button className="mrm-icon-btn" style={ICON_BTN} onClick={() => setRenameId(null)} title="Cancelar"><X size={13} /></button>
                </span>
              ) : (
                <span style={{ fontSize:13, fontWeight:700, color:"var(--text)", fontFamily:T.mono }}>
                  {linea.nombre}
                </span>
              )}

              <span style={{ fontSize:10, color:"var(--dim)" }}>{unidades.length} barcos</span>

              <button
                onClick={() => onVerPlantilla(linea)}
                className="mrm-chip-btn"
                style={{
                  display:"inline-flex", alignItems:"center", gap:4,
                  padding:"3px 7px", borderRadius:6, cursor:"pointer",
                  border:"1px solid var(--border)", background:"transparent",
                  color:"var(--muted)", fontFamily:T.sans, fontSize:10,
                }}
              >
                <Layers size={10} /> Plantilla
              </button>

              {esAdmin && renameId !== linea.id && (
                <span style={{ display:"inline-flex", gap:1 }}>
                  <button
                    className="mrm-icon-btn"
                    style={ICON_BTN}
                    title="Renombrar línea"
                    onClick={() => {
                      setRenameId(linea.id);
                      setRenameNombre(linea.nombre);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="mrm-icon-btn"
                    style={{ ...ICON_BTN, color:"var(--blue)" }}
                    title="Agregar barco"
                    onClick={() => {
                      setAddLineaId(addLineaId === linea.id ? null : linea.id);
                      setAddCodigo("");
                    }}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    className="mrm-icon-btn mrm-del-btn"
                    style={ICON_BTN}
                    title="Eliminar línea"
                    onClick={() => onDeleteLinea(linea.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>

            {esAdmin && addLineaId === linea.id && (
              <div style={{ display:"flex", gap:6, marginBottom:8, maxWidth:320 }}>
                <input
                  autoFocus
                  style={{ ...INP_SM, flex:1 }}
                  placeholder="Código del nuevo barco…"
                  value={addCodigo}
                  onChange={event => setAddCodigo(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") confirmAddBarco(linea.id);
                    if (event.key === "Escape") setAddLineaId(null);
                  }}
                />
                <button
                  onClick={() => confirmAddBarco(linea.id)}
                  style={{
                    padding:"4px 12px", borderRadius:7, cursor:"pointer",
                    border:"1px solid var(--blue-border)", background:"var(--blue-soft)",
                    color:"var(--blue)", fontFamily:T.sans, fontSize:12, fontWeight:700,
                  }}
                >
                  Crear
                </button>
              </div>
            )}

            {unidades.length === 0 ? (
              <div style={{ ...PANEL, padding:"14px 16px", borderStyle:"dashed", color:"var(--dim)", fontSize:11 }}>
                Sin barcos activos
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:8 }}>
                {unidades.map(unidad => (
                  <BarcoCard
                    key={unidad.id}
                    unidad={unidad}
                    stats={statsPorUnidad[unidad.id]}
                    desmoldeRow={desmoldePorCodigo[unidad.codigo]}
                    selected={selectedId === unidad.id}
                    onClick={() => onSelectBoat(unidad)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {esAdmin && (
        <div style={{ display:"flex", gap:6, maxWidth:320, paddingTop:2 }}>
          <input
            style={{ ...INP_SM, flex:1 }}
            placeholder="Nueva línea (ej: K65)…"
            value={newLinea}
            onChange={event => setNewLinea(event.target.value)}
            onKeyDown={event => event.key === "Enter" && confirmNewLinea()}
          />
          <button
            onClick={confirmNewLinea}
            className="mrm-btn-ghost"
            style={{
              display:"inline-flex", alignItems:"center", gap:5,
              padding:"4px 11px", borderRadius:7, cursor:"pointer",
              border:"1px solid var(--border)", background:"var(--panel)",
              color:"var(--text)", fontFamily:T.sans, fontSize:12, fontWeight:700,
            }}
          >
            <Plus size={13} /> Línea
          </button>
        </div>
      )}
    </section>
  );
}
