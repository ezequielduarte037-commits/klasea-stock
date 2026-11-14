import { useRef } from "react";
import { Play, Trash2, Warehouse, X } from "lucide-react";
import useDialogo from "@/features/consumibles/useDialogo";
import { fmtNum } from "@/features/consumibles/mostrador/mostradorLogica";
import { LIBRE, origenDe, totalUnidades } from "./mostradorPanolLogica";

// "hay 2" se entiende solo; "hay 2 unidad" no. Los metros y kilos sí se dicen.
const unidadVisible = (u) => (["", "u", "un", "unidad", "unidades"].includes(String(u || "").trim().toLowerCase()) ? "" : ` ${u}`);

/** Hoja sobre el mostrador: tarjeta centrada en la PC, hoja inferior en el celular. */
export function Hoja({ titulo, sub, onCerrar, chica = true, children, pie }) {
  const ref = useRef(null);
  useDialogo(ref, onCerrar);
  return (
    <div className="mst-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className={`mst-hoja${chica ? " is-chica" : ""}`} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <div className="mst-hoja-cab">
          <div>
            <div className="mst-hoja-titulo">{titulo}</div>
            {sub ? <div className="mst-hoja-sub">{sub}</div> : null}
          </div>
          <button type="button" className="mst-quitar" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="mst-hoja-cuerpo">{children}</div>
        {pie ? <div className="mst-hoja-pie">{pie}</div> : null}
      </div>
    </div>
  );
}

/** El producto tiene saldo en más de un lugar (o no en la obra elegida): ¿de dónde sale? */
export function DeDondeSale({ grupo, origenElegido, onElegir, onCerrar }) {
  const sinEnOrigen = origenElegido && !grupo.conSaldo.some((l) => origenDe(l) === origenElegido);
  return (
    <Hoja titulo={grupo.label} sub={sinEnOrigen ? "No tiene saldo en la obra elegida. ¿De dónde sale?" : "Está en más de un lugar. ¿De dónde sale?"} onCerrar={onCerrar}>
      <div className="mst-obras">
        {grupo.conSaldo.map((l) => {
          const libre = origenDe(l) === LIBRE;
          return (
            <button key={l.key} type="button" className="mst-obra" onClick={() => onElegir(l)}>
              <strong style={libre ? { fontFamily: "inherit", fontSize: 16 } : undefined}>
                {libre ? <><Warehouse size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />Stock libre</> : l.label}
              </strong>
              <span>hay <span className="mst-num">{fmtNum(l.available)}</span>{unidadVisible(grupo.unidad)}</span>
            </button>
          );
        })}
      </div>
    </Hoja>
  );
}

export function CodigoNoEncontrado({ codigo, sede, otraSede, onBuscar, onCerrar }) {
  return (
    <Hoja
      titulo="No hay stock con ese código"
      sub={<span className="mst-num">{codigo}</span>}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="ui-btn" onClick={onCerrar}>Cerrar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={onBuscar}>Buscar por nombre</button>
        </>
      )}
    >
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
        {otraSede
          ? <>Está en el stock de <strong>{otraSede}</strong>, no en {sede}. Para entregarlo acá primero hay que trasladarlo.</>
          : <>En {sede} no hay saldo de un producto con ese código. Si llegó y no se recibió, primero se registra la recepción; si el código no está cargado, buscalo por nombre.</>}
      </p>
    </Hoja>
  );
}

/** Retiros pausados: el mismo lugar donde los guarda el carrito del stock maestro. */
export function Pausados({ pausados = [], hayCarrito, onRetomar, onBorrar, onCerrar }) {
  return (
    <Hoja titulo="Retiros pausados" sub={hayCarrito ? "Retomar uno reemplaza lo que está en el carrito." : "Quedan en este equipo hasta que se retoman."} onCerrar={onCerrar}>
      {pausados.length ? (
        <div className="mpn-pausados">
          {pausados.map((p) => (
            <div key={p.id} className="mpn-pausado">
              <div>
                <strong>{p.nombre}</strong>
                <small>{p.items.length === 1 ? "1 producto" : `${p.items.length} productos`} · <span className="mst-num">{fmtNum(totalUnidades(p.items))}</span> u · {new Date(p.savedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</small>
              </div>
              <button type="button" className="ui-btn ui-btn-primario" style={{ minHeight: 40 }} onClick={() => onRetomar(p)}><Play size={14} /> Retomar</button>
              <button type="button" className="mst-quitar" onClick={() => onBorrar(p)} aria-label={`Borrar ${p.nombre}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ) : <div className="mst-vacio">No hay retiros pausados.</div>}
    </Hoja>
  );
}
