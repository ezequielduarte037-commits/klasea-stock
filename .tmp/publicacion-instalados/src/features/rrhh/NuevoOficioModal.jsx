import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { C } from "@/theme";
import useDialogo from "@/features/consumibles/useDialogo";
import { crearOficio } from "./api";
import { BTN, BTN_PRIMARY, INP, LBL } from "./ui";

const normalizar = (valor) => String(valor ?? "").trim().replace(/\s+/g," ").toLocaleLowerCase("es");

export default function NuevoOficioModal({ oficios = [], onCerrar, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  const enviando = useRef(false);
  useDialogo(panelRef, guardando ? undefined : onCerrar);

  async function guardar(event) {
    event.preventDefault();
    const limpio = nombre.trim().replace(/\s+/g," ");
    if (!limpio || enviando.current) return;
    if (oficios.some(o=>normalizar(o.nombre)===normalizar(limpio))) {
      setError("Ese rubro / oficio ya existe."); return;
    }
    enviando.current = true; setGuardando(true); setError("");
    try {
      const creado = await crearOficio({ nombre:limpio });
      onCreado?.(creado); onCerrar();
    } catch (cause) {
      setError(cause.code === "23505" ? "Ese rubro / oficio ya existe." : cause.message || "No se pudo crear el rubro.");
    } finally { enviando.current = false; setGuardando(false); }
  }

  return createPortal(<div onMouseDown={event=>{if(event.target===event.currentTarget&&!guardando)onCerrar();}} style={{position:"fixed",inset:0,zIndex:2100,background:"var(--overlay-strong)",display:"grid",placeItems:"center",padding:16}}>
    <form ref={panelRef} role="dialog" aria-modal="true" aria-label="Nuevo rubro / oficio" tabIndex={-1} onSubmit={guardar} style={{width:"min(400px,100%)",boxSizing:"border-box",background:C.panelSolid,border:`1px solid ${C.b1}`,borderRadius:14,padding:20,color:C.t0,fontFamily:C.sans,boxShadow:"var(--elev-2)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <strong style={{fontSize:15,flex:1}}>Nuevo rubro / oficio</strong>
        <button type="button" aria-label="Cerrar" disabled={guardando} onClick={onCerrar} style={{...BTN,padding:6,display:"grid",placeItems:"center"}}><X size={17}/></button>
      </div>
      <label style={LBL} htmlFor="rrhh-nuevo-oficio">Nombre</label>
      <input id="rrhh-nuevo-oficio" style={{...INP,width:"100%",boxSizing:"border-box"}} value={nombre} onChange={event=>setNombre(event.target.value)} disabled={guardando} maxLength={80} autoFocus placeholder="Ej.: Mantenimiento" />
      <p style={{color:C.t2,fontSize:12,lineHeight:1.45}}>Después podés asignarlo a las personas en Oficios y obras.</p>
      {error && <div role="alert" style={{color:C.red,fontSize:12,marginBottom:12}}>{error}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
        <button type="button" style={BTN} disabled={guardando} onClick={onCerrar}>Cancelar</button>
        <button type="submit" style={BTN_PRIMARY} disabled={guardando||!nombre.trim()}>{guardando?"Creando…":"Crear rubro"}</button>
      </div>
    </form>
  </div>,document.body);
}
