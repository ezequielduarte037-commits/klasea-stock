import { useId, useRef, useState } from "react";
import { Scale } from "lucide-react";
import { guardarPesoUnitario, guardarPesoUnitarioDirecto } from "@/features/materiales/api";
import { fmtCantidad } from "./api";
import { referenciaPeso } from "./pesoUnitario";

/** Guarda sólo la referencia de peso: nunca genera un movimiento de stock. */
export default function PesoUnitarioManual({ item, disabled = false, onGuardado, onOcupado }) {
  const id = useId();
  const [abierto, setAbierto] = useState(!item.pesoUnitarioG);
  const [modo, setModo] = useState("pieza");
  const [gramos, setGramos] = useState("");
  const [piezas, setPiezas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const enviando = useRef(false);
  let referencia = null;
  try { referencia = referenciaPeso({ modo, gramos, piezas }); } catch { /* formulario incompleto */ }

  async function guardar() {
    if (disabled || enviando.current) return;
    let valor;
    try { valor = referenciaPeso({ modo, gramos, piezas }); }
    catch (e) { setError(e.message); return; }
    enviando.current = true;
    setGuardando(true); onOcupado?.(true); setError(""); setMensaje("");
    try {
      const saved = valor.piezas == null
        ? await guardarPesoUnitarioDirecto(item.id, valor.pesoUnitarioG)
        : await guardarPesoUnitario(item.id, valor);
      onGuardado?.(saved);
      setAbierto(false); setGramos(""); setPiezas("");
      setMensaje(`Guardado: ${fmtCantidad(saved.peso_unitario_g)} g por pieza.`);
    } catch (e) {
      setError(e?.message || "No se pudo guardar el peso. Reintentá.");
    } finally {
      enviando.current = false; setGuardando(false); onOcupado?.(false);
    }
  }

  const bloqueado = disabled || guardando;
  const campo = { display:"grid",gap:5,fontSize:12.5,color:"var(--text)",minWidth:0 };
  return <section aria-label="Peso por pieza" style={{ display:"grid",gap:10,padding:12,border:"1px solid var(--border)",borderRadius:12,background:"var(--panel-solid)" }}>
    <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
      <Scale size={16} style={{color:"var(--dim)"}} />
      <strong style={{fontSize:13,flex:1}}>Peso por pieza</strong>
      {!abierto && <button type="button" className="ui-btn ui-btn-suave" disabled={bloqueado} onClick={()=>{setAbierto(true);setMensaje("");}} style={{minHeight:36}}>Editar peso</button>}
    </div>
    {!abierto && item.pesoUnitarioG > 0 && <div style={{fontSize:14,fontVariantNumeric:"tabular-nums"}}>{fmtCantidad(item.pesoUnitarioG)} g por pieza</div>}
    {abierto && <>
      <div role="group" aria-label="Cómo cargar el peso" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[["pieza","Peso de 1 pieza"],["muestra","Pesar una muestra"]].map(([key,label])=><button key={key} type="button" className={`ui-btn ${modo===key?"ui-btn-suave":"ui-btn-fantasma"}`} aria-pressed={modo===key} disabled={bloqueado} onClick={()=>{setModo(key);setGramos("");setPiezas("");setError("");}}>{label}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:modo==="muestra"?"repeat(2,minmax(0,1fr))":"1fr",gap:10}}>
        {modo==="muestra" && <label style={campo} htmlFor={`${id}-piezas`}>Piezas de la muestra
          <input id={`${id}-piezas`} className="ui-input" inputMode="numeric" value={piezas} disabled={bloqueado} placeholder="25" onChange={e=>setPiezas(e.target.value)} />
        </label>}
        <label style={campo} htmlFor={`${id}-gramos`}>{modo==="muestra"?"Peso neto de la muestra (g)":"Peso de 1 pieza (g)"}
          <input id={`${id}-gramos`} className="ui-input" inputMode="decimal" value={gramos} disabled={bloqueado} placeholder={modo==="muestra"?"16":"0,64"} onChange={e=>setGramos(e.target.value)} />
        </label>
      </div>
      {modo==="muestra" && referencia && <div style={{fontSize:13,fontVariantNumeric:"tabular-nums"}}>1 pieza ≈ <b>{fmtCantidad(referencia.pesoUnitarioG)} g</b></div>}
      <small style={{color:"var(--dim)",lineHeight:1.45}}>Usá los gramos de tu balanza externa, sin el recipiente. No hace falta conectarla.</small>
      <button type="button" className="ui-btn ui-btn-suave" onClick={guardar} disabled={bloqueado || !referencia}>{guardando?"Guardando peso…":"Guardar peso por pieza"}</button>
    </>}
    {error && <div role="alert" style={{color:"var(--red)",fontSize:13}}>{error}</div>}
    {mensaje && <div role="status" style={{color:"var(--green)",fontSize:13}}>{mensaje}</div>}
  </section>;
}
