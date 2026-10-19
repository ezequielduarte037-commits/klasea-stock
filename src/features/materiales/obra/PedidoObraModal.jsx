import { useRef } from "react";
import { createPortal } from "react-dom";
import { ShoppingCart, X } from "lucide-react";
import { C } from "@/theme";
import useDialogo from "@/features/consumibles/useDialogo";
import { BTN, BTN_PRIMARY, INP, LBL } from "@/features/rrhh/ui";
import { cantidadPedidoValida } from "./adicionalObra";

export default function PedidoObraModal({ pedido, obraCodigo, titulo, onTitulo, onCantidad, onCerrar, onConfirmar, busy, error }) {
  const ref = useRef(null);
  useDialogo(ref, busy ? undefined : onCerrar);
  const adicional = pedido.tipo === "adicional";
  const cantidadesValidas = pedido.rows.every(row=>cantidadPedidoValida(row.cantidad));
  return createPortal(<div onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onCerrar();}} style={{position:"fixed",inset:0,zIndex:5100,background:"var(--overlay-strong)",display:"grid",placeItems:"center",padding:16}}>
    <form ref={ref} role="dialog" aria-modal="true" aria-label="Mandar pedido a Compras" tabIndex={-1} onSubmit={e=>{e.preventDefault();if(!busy&&cantidadesValidas)onConfirmar();}} style={{width:"min(560px,100%)",boxSizing:"border-box",maxHeight:"90vh",overflowY:"auto",border:`1px solid ${C.b1}`,borderRadius:14,background:C.panelSolid,boxShadow:"var(--elev-2)",padding:16,display:"grid",gap:12,color:C.t0,fontFamily:C.sans}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
        <div>
          <strong style={{fontSize:15}}>¿Mandar {pedido.rows.length} {pedido.rows.length===1?"ítem":"ítems"} a Compras?</strong>
          <div style={{fontSize:12,color:C.t2,marginTop:3}}>Obra {obraCodigo} · pedido {pedido.tipo}</div>
        </div>
        <button type="button" aria-label="Cerrar" disabled={busy} onClick={onCerrar} style={{...BTN,padding:6,display:"grid",placeItems:"center"}}><X size={16}/></button>
      </div>
      <label style={{display:"grid",gap:5}}>
        <span style={LBL}>Título del pedido</span>
        <input value={titulo} onChange={e=>onTitulo(e.target.value)} maxLength={120} disabled={busy} style={{...INP,width:"100%",boxSizing:"border-box",fontWeight:600}}/>
      </label>
      {adicional && <div style={{fontSize:12,color:C.t2,lineHeight:1.45}}>Indicá cuántas unidades adicionales necesitás. Lo que ya se compró o entregó conserva su registro.</div>}
      <div style={{display:"grid",gap:4,maxHeight:320,overflowY:"auto",border:`1px solid ${C.b0}`,borderRadius:10,padding:8}}>
        {pedido.rows.map((row,index)=><div key={row.id||index} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"8px 4px",borderBottom:index===pedido.rows.length-1?"none":`1px solid ${C.b0}`}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:12,fontWeight:650,overflowWrap:"anywhere"}}>{row.descripcion}</div>
            <div style={{fontSize:10.5,color:C.t3,marginTop:3}}>{row.proveedor||"Sin proveedor"}</div>
          </div>
          {adicional?<label style={{display:"grid",gap:4,width:108,flexShrink:0}}>
            <span style={{fontSize:10,color:C.t2}}>Cantidad a pedir</span>
            <input aria-label={`Cantidad adicional de ${row.descripcion}`} aria-invalid={!cantidadPedidoValida(row.cantidad)} inputMode="decimal" value={row.cantidad} onChange={e=>onCantidad(index,e.target.value)} disabled={busy} style={{...INP,width:"100%",boxSizing:"border-box",textAlign:"right",fontFamily:C.mono}}/>
            <span style={{fontSize:10,color:C.t3,textAlign:"right"}}>{row.unidad||"unidad"}</span>
          </label>:<span style={{fontFamily:C.mono,fontSize:12,whiteSpace:"nowrap"}}>{row.cantidad} {row.unidad||"unidad"}</span>}
        </div>)}
      </div>
      {(!cantidadesValidas||error)&&<div role="alert" style={{fontSize:12,color:C.red}}>{error||"Ingresá una cantidad mayor que cero en cada ítem."}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
        <button type="button" onClick={onCerrar} disabled={busy} style={BTN}>Cancelar</button>
        <button type="submit" disabled={busy||!cantidadesValidas} style={{...BTN_PRIMARY,display:"inline-flex",alignItems:"center",gap:7}}><ShoppingCart size={14}/>{busy?"Enviando…":"Sí, mandar a Compras"}</button>
      </div>
    </form>
  </div>,document.body);
}
