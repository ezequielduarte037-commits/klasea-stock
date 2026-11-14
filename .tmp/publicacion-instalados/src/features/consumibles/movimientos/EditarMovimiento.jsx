import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { fetchCatalogo, indexarCodigos, normalizarCodigo, nuevoId } from "../api";
import FotoConsumible from "../FotoConsumible";
import { CSS_SOLICITUDES } from "../solicitudes/solicitudesEstilos";
import { Agregar } from "../solicitudes/Renglones";
import { agregarProductoEdicion, cantidadEdicion, hayCambiosEdicion, itemsParaCorreccion, lineasParaEdicion } from "./edicionMovimiento";
import { corregirOperacion, fetchOperacionMovimiento } from "./movimientosApi";

/** Corrige el carrito registrado en una transacción y conserva su versión anterior. */
export default function EditarMovimiento({ fila, onListo, onCancelar, onOcupado, toast }) {
  const [carga, setCarga] = useState(null);
  const [error, setError] = useState("");
  const [lineas, setLineas] = useState([]);
  const [motivo, setMotivo] = useState("");
  const [autoriza, setAutoriza] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const envioRef = useRef(false);
  const intentoRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchOperacionMovimiento(fila), fetchCatalogo({ sede: fila.sede })]).then(([filas, catalogo]) => {
      if (!vivo) return;
      const originales = lineasParaEdicion(filas);
      setCarga({ filas, catalogo, originales });
      setLineas(originales);
      setAutoriza([...new Set(filas.map((f) => f.autorizado_por).filter(Boolean))].join(" / "));
      setError("");
    }, (e) => { if (vivo) setError(e.message || "No se pudo abrir el retiro."); });
    return () => { vivo = false; };
  }, [fila, recarga]);

  const indice = useMemo(() => indexarCodigos(carga?.catalogo || []), [carga]);
  const cantidades = useMemo(() => new Map(lineas.map((l) => [l.materialId, cantidadEdicion(l.cantidad)])), [lineas]);
  const porId = useMemo(() => new Map((carga?.catalogo || []).map((i) => [i.id, i])), [carga]);
  const cambiado = carga && hayCambiosEdicion(carga.originales, lineas);
  const devolucion = fila.tipo === "devolucion";

  async function guardar() {
    if (envioRef.current || !motivo.trim() || !cambiado) return;
    let items;
    try { items = itemsParaCorreccion(lineas); } catch (e) { setError(e.message); return; }
    // Un reintento de la misma edición conserva la clave aun si se perdió la respuesta.
    const contenido = JSON.stringify({ items, motivo: motivo.trim(), autoriza: autoriza.trim() });
    if (intentoRef.current?.contenido !== contenido) intentoRef.current = { id: nuevoId(), contenido };
    envioRef.current = true;
    setEnviando(true);
    onOcupado?.(true);
    setError("");
    try {
      await corregirOperacion({ id: intentoRef.current.id, ids: carga.filas.map((f) => f.id), items, motivo: motivo.trim(), autorizadoPor: autoriza.trim() });
      toast.success("Registro corregido. Las cantidades y el stock quedaron actualizados.");
      onListo();
    } catch (e) { setError(e.message || "No se pudo guardar la corrección."); }
    finally { envioRef.current = false; setEnviando(false); onOcupado?.(false); }
  }

  return (
    <div className="sol" style={{ position: "static", display: "block", overflow: "visible", minWidth: 0 }}>
      <style>{CSS_SOLICITUDES}</style>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>Editá todos los productos del {devolucion ? "registro de devolución" : "retiro"}. Se conserva la persona y el destino; el original queda anulado con el motivo.</p>
      {!carga && !error ? <Cargando compacto texto="Trayendo el carrito completo…" /> : null}
      {error ? <p role="alert" style={{ color: "var(--red)", fontSize: 13 }}>{error}{!carga ? <button type="button" className="ui-btn" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button> : null}</p> : null}
      {carga ? <fieldset disabled={enviando} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "grid", gap: 12 }}>
        <Agregar catalogo={carga.catalogo} porCodigo={(t) => indice.get(normalizarCodigo(t))} cantidades={cantidades} onElegir={(item) => setLineas((l) => agregarProductoEdicion(l, item))} />
        <div style={{ display: "grid", gap: 8 }}>
          {lineas.map((l) => {
            const item = porId.get(l.materialId) || l.item;
            return <div key={l.materialId} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FotoConsumible item={item} size={32} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{item?.descripcion}</span>
                <input className="ui-input" style={{ width: 78 }} inputMode="decimal" value={String(l.cantidad).replace(".", ",")} aria-label={`Cantidad de ${item?.descripcion}`} onChange={(ev) => setLineas((ls) => ls.map((x) => x.materialId === l.materialId ? { ...x, cantidad: ev.target.value } : x))} />
                <small style={{ color: "var(--dim)" }}>{item?.unidad || item?.unidad_medida}</small>
                <button type="button" className="ui-btn ui-btn-icono" aria-label={`Quitar ${item?.descripcion}`} onClick={() => setLineas((ls) => ls.filter((x) => x.materialId !== l.materialId))}><Trash2 size={15} /></button>
              </div>
              {item?.formaEntrega === "canje" && !devolucion ? <label style={{ fontSize: 12 }}>Canje <select className="ui-input" value={l.canje || ""} onChange={(ev) => setLineas((ls) => ls.map((x) => x.materialId === l.materialId ? { ...x, canje: ev.target.value } : x))}><option value="">Elegí si trajo el usado</option><option value="trajo_usado">Trajo el usado</option><option value="sin_usado">Sin el usado, con autorización</option></select></label> : null}
            </div>;
          })}
        </div>
        {!lineas.length ? <p style={{ fontSize: 13 }}>Agregá un producto o usá Anular para cancelar todo el retiro.</p> : null}
        <label className="sol-campo"><span>Motivo de la corrección</span><input className="ui-input" value={motivo} maxLength={300} placeholder="Cantidad equivocada, faltó agregar una cinta…" onChange={(ev) => setMotivo(ev.target.value)} /></label>
        <label className="sol-campo"><span>Quién autoriza (para externos, cupo o canje sin usado)</span><input className="ui-input" value={autoriza} maxLength={120} onChange={(ev) => setAutoriza(ev.target.value)} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ui-btn" onClick={onCancelar}>Volver</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={!cambiado || !motivo.trim()} onClick={guardar}><Pencil size={15} />{enviando ? "Guardando…" : "Guardar corrección"}</button>
        </div>
      </fieldset> : <button type="button" className="ui-btn" onClick={onCancelar}>Volver</button>}
    </div>
  );
}
