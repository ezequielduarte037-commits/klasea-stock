import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, Eye, FileText, Plus, RefreshCw, Search, X } from "lucide-react";
import { loadNavyLogo } from "@/lib/pdfLogo";
import { T, PANEL, INP, INP_SM, EYEBROW, fmtFecha } from "./marmShared";
import { hoyISO } from "./marmoleriaPdf";
import { alternarPlantillaRemito, datosSolicitudRemito, MAX_PLANTILLAS_REMITO, numeroRemitoMarmoleria, validarRemitoMarmoleria } from "./remitosMarmoleria";
import { emitirRemitoMarmoleria, errorRemitosMarmoleria, listarRemitosMarmoleria } from "./remitosMarmoleriaApi";
import { construirPdfRemitoMarmoleria, nombreArchivoRemitoMarmoleria } from "./remitoMarmoleriaPdf";

const BTN = { display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel-solid)", color:"var(--text)", cursor:"pointer", fontFamily:T.sans, fontSize:12 };
const PRIMARY = { ...BTN, background:"var(--inverse-bg)", color:"var(--inverse-text)", borderColor:"var(--inverse-bg)", fontWeight:600 };
const LABEL = { display:"grid", gap:6, color:"var(--muted)", fontSize:12 };
const totalPlantillas = (items) => items.reduce((sum, i) => sum + (Number(i.cantidad) || 0), 0);
const cantidadTexto = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function VistaPdf({ doc, nombre, onClose }) {
  const dialog = useRef(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    let activo = true;
    const objectUrl = URL.createObjectURL(doc.output("blob"));
    // El efecto libera también las vistas anteriores al abrir otra impresión.
    Promise.resolve().then(() => { if (activo) setUrl(objectUrl); });
    dialog.current.showModal();
    return () => { activo = false; URL.revokeObjectURL(objectUrl); };
  }, [doc]);
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="marm-remito-pdf-title"
    style={{ width:"min(1000px, 95vw)", maxWidth:"95vw", height:"90dvh", maxHeight:"94dvh", padding:0, border:"1px solid var(--border-2)", borderRadius:12, background:"var(--panel-solid)", color:"var(--text)" }}>
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:12, borderBottom:"1px solid var(--border)" }}>
        <strong id="marm-remito-pdf-title" style={{ flex:1, fontSize:13 }}>Original y duplicado</strong>
        <button style={BTN} onClick={() => doc.save(nombre)}><Download size={14} /> Descargar</button>
        <button style={BTN} onClick={onClose} aria-label="Cerrar vista previa" autoFocus><X size={16} /></button>
      </div>
      {url && <iframe src={url} title="Remito de plantillas: original y duplicado" style={{ flex:1, width:"100%", border:0 }} />}
    </div>
  </dialog>;
}

export default function RemitosView({ profile, piezas, unidades, lineas, unidadInicial = "", isMobile, onBack }) {
  const [modo, setModo] = useState("nuevo");
  const [barco, setBarco] = useState(unidadInicial);
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const [seleccion, setSeleccion] = useState({});
  const [form, setForm] = useState({ fecha:hoyISO(), destinatario:"", entregado_por:profile?.nombre_completo || profile?.username || "", retira:"", observaciones:"" });
  const [historial, setHistorial] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [baseLista, setBaseLista] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [emitido, setEmitido] = useState(null);
  const [preview, setPreview] = useState(null);
  const intento = useRef(null);
  const bloqueado = useRef(false);

  useEffect(() => {
    let activo = true;
    listarRemitosMarmoleria().then((rows) => {
      if (!activo) return;
      setHistorial(rows); setHayMas(rows.length === 30); setBaseLista(true);
    }).catch((e) => { if (activo) setError(errorRemitosMarmoleria(e)); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  const catalogo = useMemo(() => {
    const barcos = new Map(unidades.map((u) => [u.id, u]));
    const modelos = new Map(lineas.map((l) => [l.id, l.nombre]));
    return piezas.filter((p) => p.estado !== "No lleva" && modelos.has(barcos.get(p.unidad_id)?.linea_id))
      .map((p) => ({ ...p, codigo_barco:barcos.get(p.unidad_id).codigo, linea:modelos.get(barcos.get(p.unidad_id).linea_id) }))
      .sort((a, b) => `${a.codigo_barco} ${a.sector} ${a.pieza}`.localeCompare(`${b.codigo_barco} ${b.sector} ${b.pieza}`, "es", { numeric:true }));
  }, [piezas, unidades, lineas]);
  const sectores = useMemo(() => [...new Set(catalogo.filter((p) => !barco || p.unidad_id === barco).map((p) => p.sector))].sort(), [catalogo, barco]);
  const visibles = useMemo(() => catalogo.filter((p) => (!barco || p.unidad_id === barco) && (!sector || p.sector === sector)
    && `${p.codigo_barco} ${p.linea} ${p.sector} ${p.pieza} ${p.color ?? ""}`.toLocaleLowerCase("es").includes(q.trim().toLocaleLowerCase("es"))), [catalogo, barco, sector, q]);
  const items = Object.values(seleccion);
  const todosMarcados = visibles.length > 0 && visibles.every((p) => !!seleccion[p.id]);
  const sinMaterial = items.filter((i) => !i.material.trim()).length;
  const cambiarForm = (campo, value) => setForm((prev) => ({ ...prev, [campo]:value }));
  const cambiarItem = (id, campo, value) => setSeleccion((prev) => ({ ...prev, [id]:{ ...prev[id], [campo]:value } }));

  function alternar(pieza) {
    if (!seleccion[pieza.id] && items.length >= MAX_PLANTILLAS_REMITO) return setError("El remito admite hasta 100 renglones.");
    setSeleccion((prev) => alternarPlantillaRemito(prev, pieza));
  }
  function marcarVisibles() {
    const next = { ...seleccion };
    visibles.forEach((p) => {
      if (todosMarcados) delete next[p.id];
      else if (!next[p.id]) next[p.id] = alternarPlantillaRemito({}, p)[p.id];
    });
    if (Object.keys(next).length > MAX_PLANTILLAS_REMITO) return setError("Filtrá por barco o sector para seleccionar hasta 100 renglones.");
    setSeleccion(next);
  }
  async function armarPdf(remito, descargar = false) {
    // Un error del logo no debe impedir recuperar una constancia ya guardada.
    const logo = await loadNavyLogo().catch(() => null);
    const doc = construirPdfRemitoMarmoleria({ remito, logo });
    const nombre = nombreArchivoRemitoMarmoleria(remito);
    if (descargar) doc.save(nombre);
    else setPreview({ doc, nombre });
  }
  async function verRemito(remito, descargar = false) {
    if (bloqueado.current) return;
    bloqueado.current = true; setOcupado(true); setError("");
    try { await armarPdf(remito, descargar); }
    catch (e) { setError(e.message || "No se pudo generar el PDF. El remito sigue disponible en Emitidos."); }
    finally { bloqueado.current = false; setOcupado(false); }
  }
  function vistaPrevia() {
    const solicitud = datosSolicitudRemito(form, items);
    const mensaje = validarRemitoMarmoleria(solicitud);
    if (mensaje) return setError(mensaje);
    verRemito({ ...solicitud, items:items.map((i) => ({ ...i, cantidad:Number(i.cantidad) })) });
  }
  async function guardar(event) {
    event.preventDefault();
    if (bloqueado.current || !baseLista) return;
    const solicitud = datosSolicitudRemito(form, items);
    const mensaje = validarRemitoMarmoleria(solicitud);
    if (mensaje) return setError(mensaje);
    const key = JSON.stringify(solicitud);
    if (intento.current?.key !== key) intento.current = { key, id:crypto.randomUUID() };
    bloqueado.current = true; setOcupado(true); setError("");
    let guardado = false;
    try {
      const remito = await emitirRemitoMarmoleria(intento.current.id, solicitud);
      guardado = true;
      setHistorial((prev) => [remito, ...prev.filter((r) => r.id !== remito.id)]);
      setEmitido(remito); setSeleccion({}); setModo("emitidos"); intento.current = null;
      setForm((prev) => ({ ...prev, observaciones:"", retira:"" }));
      await armarPdf(remito, true);
    } catch (e) {
      setError(guardado ? "El remito quedó guardado. No se pudo descargar el PDF; recuperalo desde Emitidos." : errorRemitosMarmoleria(e));
    } finally { bloqueado.current = false; setOcupado(false); }
  }
  async function cargarAnteriores(reiniciar = false) {
    if (cargando || ocupado) return;
    setCargando(true); setError("");
    try {
      const rows = await listarRemitosMarmoleria({ desde:reiniciar ? 0 : historial.length });
      setHistorial((prev) => reiniciar ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setHayMas(rows.length === 30); setBaseLista(true);
    } catch (e) { setError(errorRemitosMarmoleria(e)); }
    finally { setCargando(false); }
  }

  return <div className="mrm-view" style={{ padding:isMobile ? 14 : "22px 24px", maxWidth:1400, margin:"0 auto" }}>
    <style>{`
      .marm-remitos button:disabled { opacity:.45; cursor:default !important; }
      .marm-remitos input:focus-visible, .marm-remitos select:focus-visible, .marm-remitos textarea:focus-visible, .marm-remitos button:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
      dialog::backdrop { background:var(--overlay); backdrop-filter:blur(3px); }
    `}</style>
    <div className="marm-remitos">
      <button style={{ ...BTN, marginBottom:16 }} onClick={onBack} disabled={ocupado}><ArrowLeft size={14} /> Marmolería</button>
      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:18 }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={EYEBROW}>Entrega de plantillas</div>
          <h1 style={{ fontSize:21, margin:"4px 0 6px", fontWeight:650 }}>Remitos de marmolería</h1>
          <div style={{ color:"var(--muted)", fontSize:13 }}>Original para conservar firmado y duplicado para quien retira.</div>
        </div>
        <button style={modo === "nuevo" ? PRIMARY : BTN} onClick={() => setModo("nuevo")} disabled={ocupado}><Plus size={14} /> Nuevo remito{items.length ? ` (${items.length})` : ""}</button>
        <button style={modo === "emitidos" ? PRIMARY : BTN} onClick={() => setModo("emitidos")} disabled={ocupado}><FileText size={14} /> Emitidos</button>
      </div>
      {error && <div role="alert" style={{ ...PANEL, padding:12, marginBottom:16, background:"var(--red-soft)", color:"var(--red)", borderColor:"var(--red-border)", fontSize:13 }}>{error}
        {!baseLista && !cargando && <button style={{ ...BTN, marginLeft:10 }} onClick={() => cargarAnteriores(true)}><RefreshCw size={13} /> Reintentar</button>}
      </div>}
      {modo === "nuevo" ? <form onSubmit={guardar}>
        <fieldset disabled={ocupado} style={{ border:0, padding:0, margin:0, minWidth:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "minmax(280px, .9fr) minmax(340px, 1.1fr)", gap:16, alignItems:"start" }}>
            <section style={{ ...PANEL, padding:16 }} aria-label="Seleccionar plantillas">
              <h2 style={{ margin:"0 0 12px", fontSize:15 }}>1. Seleccioná las plantillas</h2>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                <label style={LABEL}>Barco<select aria-label="Barco" style={INP_SM} value={barco} onChange={(e) => { setBarco(e.target.value); setSector(""); }}>
                  <option value="">Todos los barcos</option>{unidades.filter((u) => lineas.some((l) => l.id === u.linea_id)).map((u) => <option key={u.id} value={u.id}>{u.codigo}</option>)}
                </select></label>
                <label style={LABEL}>Sector<select aria-label="Sector" style={INP_SM} value={sector} onChange={(e) => setSector(e.target.value)}><option value="">Todos los sectores</option>{sectores.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              </div>
              <label style={{ ...LABEL, position:"relative" }}><span style={{ position:"absolute", top:9, left:10 }}><Search size={14} /></span>
                <input style={{ ...INP, paddingLeft:32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plantilla, barco o material…" aria-label="Buscar plantilla, barco o material" />
              </label>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, margin:"12px 0", color:"var(--dim)", fontSize:12 }}>
                <span>{visibles.length} disponibles · {items.length} seleccionadas</span>
                <button type="button" style={BTN} disabled={!visibles.length} onClick={marcarVisibles}>{todosMarcados ? "Quitar visibles" : "Seleccionar visibles"}</button>
              </div>
              <div style={{ maxHeight:isMobile ? 360 : "55vh", overflowY:"auto", borderTop:"1px solid var(--border)" }}>
                {visibles.map((p) => <label key={p.id} className="mrm-row" style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"11px 4px", borderBottom:"1px solid var(--border)", cursor:"pointer" }}>
                  <input type="checkbox" checked={!!seleccion[p.id]} onChange={() => alternar(p)} style={{ marginTop:4, accentColor:"var(--blue)", width:16, height:16 }} aria-label={`Incluir ${p.codigo_barco}, ${p.sector}, ${p.pieza}`} />
                  <span style={{ minWidth:0 }}><strong style={{ display:"block", fontSize:13, fontWeight:550 }}>{p.pieza}</strong>
                    <span style={{ display:"block", fontSize:11, color:"var(--dim)", margin:"4px 0" }}>{p.codigo_barco} · {p.linea} · {p.sector} · {p.estado}</span>
                    <span style={{ fontSize:12, color:p.color ? "var(--muted)" : "var(--red)" }}>{p.color || "Material a completar"}</span>
                  </span>
                </label>)}
                {!visibles.length && <p style={{ color:"var(--dim)", fontSize:13 }}>No hay plantillas con estos filtros.</p>}
              </div>
            </section>
            <section style={{ ...PANEL, padding:16 }} aria-label="Preparar remito">
              <h2 style={{ margin:"0 0 12px", fontSize:15 }}>2. Revisá la entrega</h2>
              <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1fr 1fr", gap:12 }}>
                <label style={LABEL}>Fecha<input type="date" required style={INP} value={form.fecha} onChange={(e) => cambiarForm("fecha", e.target.value)} /></label>
                <label style={LABEL}>Marmolería / destinatario<input required maxLength={200} style={INP} value={form.destinatario} onChange={(e) => cambiarForm("destinatario", e.target.value)} placeholder="Nombre de la marmolería" /></label>
                <label style={LABEL}>Entregado por<input required maxLength={150} style={INP} value={form.entregado_por} onChange={(e) => cambiarForm("entregado_por", e.target.value)} /></label>
                <label style={LABEL}>Retira (opcional)<input maxLength={150} style={INP} value={form.retira} onChange={(e) => cambiarForm("retira", e.target.value)} placeholder="Se puede completar al firmar" /></label>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, marginTop:20, marginBottom:10 }}>
                <strong style={{ fontSize:13 }}>{cantidadTexto(items.length, "renglón", "renglones")} · {cantidadTexto(totalPlantillas(items), "plantilla", "plantillas")}</strong>
                <button type="button" style={BTN} disabled={!items.length} onClick={() => setSeleccion({})}>Vaciar selección</button>
              </div>
              {!items.length && <p style={{ fontSize:13, color:"var(--dim)", padding:"18px 0" }}>Marcá a la izquierda las plantillas que se llevan. Podés combinar varios barcos.</p>}
              {items.map((item) => <div key={item.pieza_id} style={{ padding:"12px 0", borderTop:"1px solid var(--border)" }}>
                <div style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:9 }}>
                  <div style={{ flex:1, fontSize:13 }}><strong>{item.pieza}</strong><div style={{ marginTop:4, color:"var(--dim)", fontSize:11 }}>{item.codigo_barco} · {item.linea} · {item.sector}</div></div>
                  <button type="button" style={{ ...BTN, padding:5 }} aria-label={`Quitar ${item.codigo_barco}, ${item.pieza}`} onClick={() => setSeleccion((prev) => { const next = { ...prev }; delete next[item.pieza_id]; return next; })}><X size={14} /></button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"minmax(0, 1fr) 78px", gap:8 }}>
                  <label style={LABEL}>Material en el remito<input required maxLength={300} style={{ ...INP_SM, borderColor:item.material.trim() ? "var(--border)" : "var(--red-border)" }} value={item.material} onChange={(e) => cambiarItem(item.pieza_id, "material", e.target.value)} /></label>
                  <label style={LABEL}>Cantidad<input type="number" min={1} max={999} step={1} required style={INP_SM} value={item.cantidad} onChange={(e) => cambiarItem(item.pieza_id, "cantidad", e.target.value)} /></label>
                </div>
              </div>)}
              {sinMaterial > 0 && <p style={{ color:"var(--red)", fontSize:12 }}>Completá el material de {sinMaterial} {sinMaterial === 1 ? "plantilla" : "plantillas"} antes de emitir.</p>}
              <label style={{ ...LABEL, marginTop:14 }}>Observaciones<textarea maxLength={1000} style={{ ...INP, minHeight:66, resize:"vertical" }} value={form.observaciones} onChange={(e) => cambiarForm("observaciones", e.target.value)} placeholder="Aclaraciones para la marmolería…" /></label>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap", marginTop:16 }}>
                <button type="button" style={BTN} onClick={vistaPrevia} disabled={ocupado || !items.length}><Eye size={14} /> Vista previa</button>
                <button type="submit" style={PRIMARY} disabled={ocupado || !baseLista || !items.length || sinMaterial > 0}><Download size={14} /> {ocupado ? "Preparando…" : "Emitir y descargar 2 copias"}</button>
              </div>
              <p style={{ fontSize:11, color:"var(--dim)", lineHeight:1.5, margin:"12px 0 0" }}>El material y las cantidades de esta entrega quedan guardados en el remito. Conservá el original con la firma de quien retira.</p>
            </section>
          </div>
        </fieldset>
      </form> : <section>
        {emitido && <div role="status" style={{ ...PANEL, padding:14, marginBottom:14, color:"var(--green)", background:"var(--green-soft)", display:"flex", alignItems:"center", gap:8, fontSize:13 }}><Check size={16} /> {numeroRemitoMarmoleria(emitido.numero)} guardado. Podés recuperar sus dos copias desde acá.</div>}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <h2 style={{ flex:1, fontSize:15, margin:0 }}>Remitos emitidos</h2>
          <button style={BTN} disabled={cargando || ocupado} onClick={() => cargarAnteriores(true)}><RefreshCw size={14} /> Actualizar</button>
        </div>
        {historial.map((r) => <article key={r.id} style={{ ...PANEL, padding:16, marginBottom:10, display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}><strong style={{ fontFamily:T.mono, fontSize:14 }}>{numeroRemitoMarmoleria(r.numero)}</strong><span style={{ fontSize:12, color:"var(--dim)" }}>{fmtFecha(r.fecha)}</span></div>
            <div style={{ fontSize:14 }}>{r.destinatario}</div>
            <div style={{ fontSize:12, color:"var(--dim)", marginTop:6 }}>{[...new Set(r.items.map((i) => i.codigo_barco))].join(" · ")} · {cantidadTexto(totalPlantillas(r.items), "plantilla", "plantillas")}{r.retira ? ` · Retira ${r.retira}` : ""}</div>
          </div>
          <button style={BTN} disabled={ocupado} onClick={() => verRemito(r)}><Eye size={14} /> Ver copias</button>
          <button style={BTN} disabled={ocupado} onClick={() => verRemito(r, true)}><Download size={14} /> Descargar PDF</button>
        </article>)}
        {!historial.length && <div style={{ ...PANEL, textAlign:"center", padding:35, color:"var(--dim)", fontSize:13 }}>{cargando ? "Cargando remitos…" : "Todavía no hay remitos emitidos."}</div>}
        {hayMas && <button style={BTN} disabled={cargando || ocupado} onClick={() => cargarAnteriores()}>{cargando ? "Cargando…" : "Cargar anteriores"}</button>}
      </section>}
    </div>
    {preview && <VistaPdf {...preview} onClose={() => setPreview(null)} />}
  </div>;
}
