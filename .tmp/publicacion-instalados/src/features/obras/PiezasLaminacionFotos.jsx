import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, Maximize2, Plus, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { eliminarFotoPieza, firmarFotoPieza, FOTOS_ACCEPT, subirFotoPieza } from "./piezasLaminacionFotosApi";

const BTN = { display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, minHeight:36, padding:"7px 11px", border:`1px solid ${C.b0}`, borderRadius:8, background:C.s0, color:C.t0, cursor:"pointer", fontFamily:C.sans, fontSize:12 };

export function FotoPieza({ foto, descripcion, style, onClick, label, selected }) {
  const [renovada, setRenovada] = useState(null);
  const [fallo, setFallo] = useState(false);
  const url = renovada?.path === foto.storage_path ? renovada.url : foto.url;
  async function reintentar() {
    try {
      const actualizada = await firmarFotoPieza(supabase, foto);
      setRenovada({ path:foto.storage_path, url:actualizada.url });
      setFallo(false);
    } catch { setFallo(true); }
  }
  return (
    <button type="button" onClick={fallo || !url ? reintentar : onClick}
      aria-label={fallo || !url ? "Reintentar abrir foto" : label || `Ampliar foto de ${descripcion}`}
      aria-pressed={selected}
      style={{ ...BTN, padding:0, overflow:"hidden", width:"100%", background:"var(--panel-2)", cursor:"zoom-in", ...style }}>
      {url && !fallo ? <img src={url} alt={`Foto de referencia de ${descripcion}`} loading="lazy" onError={() => setFallo(true)}
        style={{ display:"block", width:"100%", height:"100%", objectFit:"contain" }} />
        : <span style={{ padding:12, color:C.t2, fontSize:12 }}>No se pudo mostrar la foto. Tocar para reintentar.</span>}
    </button>
  );
}

function VisorFotos({ fotos, inicial, descripcion, onClose }) {
  const [indice, setIndice] = useState(inicial);
  const [zoom, setZoom] = useState(1);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [error, setError] = useState("");
  const dialogRef = useRef();
  const foto = fotos[indice];
  const viewportRef = useRef();
  useEffect(() => {
    const dialog = dialogRef.current;
    const anterior = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); anterior?.focus(); };
  }, []);
  useEffect(() => {
    let vigente = true;
    firmarFotoPieza(supabase, foto).then(actualizada => {
      if (vigente) setFotoUrl({ path:foto.storage_path, url:actualizada.url });
    }).catch(() => { if (vigente) setError("No se pudo abrir la foto. Cerrá y volvé a intentarlo."); });
    return () => { vigente = false; };
  }, [foto]);
  function cambiar(delta) {
    setIndice(i => (i + delta + fotos.length) % fotos.length);
    setZoom(1); setError("");
    viewportRef.current?.scrollTo(0, 0);
  }
  const url = fotoUrl?.path === foto.storage_path ? fotoUrl.url : foto.url;
  return createPortal(
    <dialog ref={dialogRef} className="plv-foto-visor" aria-label={`Fotos de ${descripcion}`} onCancel={e => { e.preventDefault(); onClose(); }}
      onKeyDown={e => { if (e.key === "ArrowLeft") { e.preventDefault(); cambiar(-1); } if (e.key === "ArrowRight") { e.preventDefault(); cambiar(1); } }}
      style={{ position:"fixed", inset:0, margin:"auto", padding:0, width:"96vw", maxWidth:1500, height:"94dvh", maxHeight:"94dvh", border:`1px solid ${C.b1}`, borderRadius:14, background:"var(--panel-solid)", color:C.t0, fontFamily:C.sans, overflow:"hidden" }}>
      <style>{`.plv-foto-visor::backdrop { background:var(--overlay-strong); backdrop-filter:blur(8px); }`}</style>
      <div className="plv-foto-visor-content" style={{ display:"flex", flexDirection:"column", height:"100%" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:12, borderBottom:`1px solid ${C.b0}`, flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 160px", minWidth:0 }}><strong style={{ fontSize:14 }}>{descripcion}</strong><div style={{ fontSize:11, color:C.t2, marginTop:3 }}>Foto {indice+1} de {fotos.length} · Original</div></div>
          <button style={BTN} aria-label="Alejar foto" disabled={zoom === 1} onClick={() => setZoom(z => Math.max(1, z-.5))}><ZoomOut size={17}/></button>
          <span style={{ fontSize:12, minWidth:35, textAlign:"center" }}>{Math.round(zoom*100)}%</span>
          <button style={BTN} aria-label="Acercar foto" disabled={zoom === 3} onClick={() => setZoom(z => Math.min(3, z+.5))}><ZoomIn size={17}/></button>
          <button style={BTN} aria-label="Ajustar foto a pantalla" onClick={() => setZoom(1)}><Maximize2 size={17}/></button>
          <button style={BTN} aria-label="Cerrar fotos" onClick={onClose}><X size={19}/></button>
        </div>
        <div ref={viewportRef} style={{ flex:1, minHeight:0, overflow:"auto", background:"var(--panel-2)" }}>
          {error ? <div role="alert" style={{ padding:30, textAlign:"center", color:C.red }}>{error}</div>
            : <div style={{ width:`${zoom*100}%`, height:`${zoom*100}%`, display:"grid", placeItems:"center", padding:12, boxSizing:"border-box" }}>
              {url ? <img src={url} alt={`Foto de referencia de ${descripcion}`} onError={() => setError("No se pudo mostrar la foto. Cerrá y volvé a intentarlo.")}
                style={{ width:"100%", height:"100%", minHeight:0, objectFit:"contain" }}/>
                : <span>Cargando foto…</span>}
            </div>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:10, borderTop:`1px solid ${C.b0}` }}>
          <button style={BTN} disabled={fotos.length<2} aria-label="Foto anterior" onClick={() => cambiar(-1)}><ChevronLeft size={18}/></button>
          <span style={{ flex:1, minWidth:0, fontSize:12, color:C.t2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{foto.nombre}</span>
          <button style={BTN} disabled={fotos.length<2} aria-label="Foto siguiente" onClick={() => cambiar(1)}><ChevronRight size={18}/></button>
        </div>
      </div>
    </dialog>, document.body
  );
}

export default function PiezasLaminacionFotos({ pieza, obraId, lineaKey, imagenes, onChange, onBusyChange }) {
  const [fotos, setFotos] = useState(imagenes);
  const [activa, setActiva] = useState(null);
  const [visor, setVisor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef();
  const bloqueoRef = useRef(false);
  const confirmar = useConfirm();
  const actual = fotos.find(f => f.storage_path === activa) ?? fotos[0];
  function actualizar(siguientes) { setFotos(siguientes); onChange(siguientes); }
  function marcarBusy(valor) { bloqueoRef.current = valor; setBusy(valor); onBusyChange(valor); }
  async function cargar(files) {
    if (!files.length || bloqueoRef.current) return;
    marcarBusy(true); setError("");
    let siguientes = [...fotos];
    const errores = [];
    try {
      for (const [i, file] of files.entries()) {
        setProgreso(`Subiendo ${i+1} de ${files.length}…`);
        try {
          const foto = await subirFotoPieza(supabase, { obraId, lineaKey, pieza, file });
          siguientes = [...siguientes, foto]; actualizar(siguientes); setActiva(foto.storage_path);
        } catch (e) { errores.push(`${file.name}: ${e.message}`); }
      }
      setError(errores.join("\n"));
    } finally { marcarBusy(false); setProgreso(""); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function quitar(foto) {
    if (bloqueoRef.current) return;
    if (!await confirmar({ title:"Quitar foto de referencia", message:`¿Querés quitar «${foto.nombre}» de esta pieza?`, confirmLabel:"Quitar foto", tone:"danger" })) return;
    marcarBusy(true); setError("");
    try {
      const aviso = await eliminarFotoPieza(supabase, foto);
      actualizar(fotos.filter(f => f.storage_path !== foto.storage_path));
      setError(aviso);
    } catch (e) { setError(e.message); }
    finally { marcarBusy(false); }
  }
  return (
    <section aria-label="Fotos de referencia" style={{ display:"grid", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
        <div><div style={{ fontSize:13, fontWeight:600, color:C.t0 }}>Fotos de referencia <span style={{ color:C.t2, fontWeight:400 }}>({fotos.length})</span></div>
          <div style={{ fontSize:11, color:C.t2, marginTop:4 }}>Se guardan al cargarlas. Tocá la foto para ampliar.</div></div>
        <button type="button" style={{ ...BTN, color:C.blue }} disabled={busy} onClick={() => inputRef.current?.click()}><Plus size={16}/>{busy ? progreso || "Procesando…" : "Agregar fotos"}</button>
        <input ref={inputRef} type="file" accept={FOTOS_ACCEPT} multiple aria-label="Seleccionar fotos de la pieza" style={{ display:"none" }} onChange={e => cargar(Array.from(e.target.files ?? []))}/>
      </div>
      {error && <div role="alert" style={{ color:C.red, background:"rgba(239,68,68,.08)", border:`1px solid ${C.red}`, borderRadius:8, padding:10, fontSize:12, whiteSpace:"pre-wrap" }}>{error}</div>}
      <div aria-live="polite" style={{ fontSize:11, color:C.t2 }}>{busy ? progreso || "Procesando foto…" : "JPG, PNG, WebP, AVIF o GIF · Hasta 20 MB por foto · Resolución original"}</div>
      {actual ? <>
        <FotoPieza key={actual.storage_path} foto={actual} descripcion={pieza.desc} onClick={() => setVisor(fotos.indexOf(actual))} style={{ height:"clamp(220px, 38vh, 380px)", borderRadius:10 }}/>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ flex:1, minWidth:0, color:C.t2, fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{actual.nombre}</span>
          <button style={BTN} onClick={() => setVisor(fotos.indexOf(actual))}><Maximize2 size={14}/>Ampliar</button>
          <button style={{ ...BTN, color:C.red }} aria-label="Quitar foto seleccionada" disabled={busy} onClick={() => quitar(actual)}><Trash2 size={14}/></button>
        </div>
        {fotos.length>1 && <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
          {fotos.map((foto,i) => <FotoPieza key={foto.storage_path} foto={foto} descripcion={`${pieza.desc}, foto ${i+1}`} label={`Seleccionar foto ${i+1}`} selected={actual.storage_path === foto.storage_path} onClick={() => setActiva(foto.storage_path)}
            style={{ width:88, height:68, flexShrink:0, border:`2px solid ${actual.storage_path === foto.storage_path ? C.blue : C.b0}`, cursor:"pointer" }}/>)}</div>}
      </> : <button type="button" style={{ ...BTN, minHeight:150, flexDirection:"column", borderStyle:"dashed", color:C.t2, gap:10 }} disabled={busy} onClick={() => inputRef.current?.click()}>
        <Camera size={28}/><span>{busy ? progreso : "Cargá fotos de la pieza plástica"}</span><span style={{ fontSize:11 }}>Podés seleccionar varias fotos juntas.</span>
      </button>}
      {visor !== null && <VisorFotos fotos={fotos} inicial={visor} descripcion={pieza.desc} onClose={() => setVisor(null)}/>}
    </section>
  );
}
