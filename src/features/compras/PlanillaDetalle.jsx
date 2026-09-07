import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Package, X } from "lucide-react";
import { C } from "@/theme";

const numero = n => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const boton = { border: `1px solid ${C.border}`, background: "var(--panel-2)", color: C.text, borderRadius: 8, padding: "9px 12px", cursor: "pointer", font: "inherit", fontSize: 12 };

// Non-modal: the table remains available while the operator inspects a cell.
export default function PlanillaDetalle({ fila, obra, obras, onObra, onClose, onDefinir, catalogoPorId, onImagen }) {
  const celda = obra ? fila.porObra[obra.id] : null;
  const cifras = obra ? celda : fila.totales;
  const producto = celda?.productoMaterialId ? catalogoPorId.get(celda.productoMaterialId) : null;
  const sinDefinir = celda?.requiereProductoConcreto && !celda.productoDefinido;

  return <aside className="planilla-detalle" aria-label={`Detalle de ${fila.descripcion}`}>
    <header style={{ display: "flex", alignItems: "start", gap: 12 }}>
      <div style={{ flex: 1 }}><small style={{ color: C.blue, fontWeight: 800 }}>DETALLE DEL MATERIAL</small><h3 style={{ margin: "8px 0", fontSize: 18, lineHeight: 1.3 }}>{fila.descripcion}</h3><span style={{ color: C.dim, fontSize: 12 }}>{[fila.codigo, fila.unidad, fila.proveedor].filter(Boolean).join(" · ")}</span></div>
      <button type="button" style={boton} onClick={onClose} aria-label="Cerrar detalle"><X size={16} /></button>
    </header>
    {fila.imagenUrl ? <button type="button" onClick={() => onImagen(fila)} aria-label="Ampliar foto del material" style={{ ...boton, padding: 0, overflow: "hidden" }}><img src={fila.imagenUrl} alt={fila.descripcion} style={{ display: "block", width: "100%", height: 150, objectFit: "contain" }} /></button> : <div style={{ color: C.dim, display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><Package size={16} />Sin foto de referencia</div>}
    <label style={{ fontSize: 12, display: "grid", gap: 6 }}>Obra
      <select value={obra?.id || ""} onChange={e => onObra(e.target.value)} style={boton}><option value="">Resumen de la línea</option>{obras.map(item => <option key={item.id} value={item.id}>{item.codigo}</option>)}</select>
    </label>
    {obra && !celda ? <p style={{ color: C.dim, fontSize: 13 }}>Este material no figura en la necesidad de {obra.codigo}. Revisá la configuración de la obra si debería llevarlo.</p> : <>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {[["Necesita", "requerido", C.text], ["Entregado a obra", "egresado", C.green], ["En pañol para la obra", "enPanol", C.cyan], ["Falta recibir", "pendiente", C.red]].map(([label, field, color]) => <div key={field} style={{ display: "flex", justifyContent: "space-between", padding: "12px", borderBottom: `1px solid ${C.border}`, gap: 10, fontSize: 13 }}><span>{label}</span><strong style={{ color, fontVariantNumeric: "tabular-nums" }}>{numero(cifras?.[field])} <small>{fila.unidad}</small></strong></div>)}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: C.dim, lineHeight: 1.6 }}>El faltante es lo que aún debe recibir la obra. Puede incluir material ya comprado. El stock libre se comparte entre obras; no está reservado automáticamente.</p>
    </>}
    <div style={{ padding: 12, background: "var(--panel-2)", borderRadius: 10, display: "grid", gap: 8, fontSize: 13 }}>
      <span>Stock libre del material <strong style={{ float: "right" }}>{numero(fila.enPanolLibre)} {fila.unidad}</strong></span>
      {Number(fila.reservado) > 0 && <span style={{ color: C.dim }}>Apartado a obras: {numero(fila.reservado)} {fila.unidad}</span>}
    </div>
    {celda && <section style={{ display: "grid", gap: 8, fontSize: 13 }}>
      <strong>Producto y configuración</strong>
      <span style={{ color: sinDefinir ? C.amber : C.dim }}>{sinDefinir ? "Falta definir qué producto lleva esta obra" : producto?.descripcion || (celda.requiereProductoConcreto ? "Producto definido" : "Producto directo")}</span>
      {celda.requiereProductoConcreto && <button type="button" onClick={onDefinir} style={{ ...boton, borderColor: C.blueB, color: C.blue }}> {sinDefinir ? "Definir producto en esta obra" : "Revisar producto de esta obra"} <ArrowUpRight size={13} /></button>}
      {(celda.configuraciones || []).map((item, i) => <span key={`${item.nombre}-${i}`} style={{ color: C.violet }}>{item.nombre}: {Number(item.delta) > 0 ? "+" : ""}{numero(item.delta)} {fila.unidad}</span>)}
      {celda.avisoPendiente && <span style={{ color: C.green }}>Tiene un aviso de recepción abierto.</span>}
    </section>}
    <a href={`/catalogo-maestro?material=${encodeURIComponent(celda?.requisitoId || fila.requisitoId || fila.id)}`} target="_blank" rel="noopener noreferrer" style={{ ...boton, textAlign: "center", textDecoration: "none" }}>Abrir ficha completa del catálogo <ArrowUpRight size={13} /></a>
  </aside>;
}

export function PlanillaFoto({ fila, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
  }, []);
  return createPortal(<dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label={`Foto de ${fila.descripcion}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, width: "90vw", maxWidth: 800, maxHeight: "90vh", background: "var(--panel-solid)", color: C.text }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}><strong>{fila.descripcion}</strong><button autoFocus type="button" onClick={onClose} aria-label="Cerrar foto" style={boton}><X size={18} /></button></div>
    <img src={fila.imagenUrl} alt={fila.descripcion} style={{ display: "block", width: "100%", maxHeight: "72vh", objectFit: "contain" }} />
  </dialog>, document.body);
}
