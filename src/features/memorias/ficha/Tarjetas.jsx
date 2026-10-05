// Tarjetas de la ficha: cada definición se lee de un vistazo (con su muestra si
// es un material) y se toca para elegir. Los equipos se marcan ahí mismo.
import { Ban, Check, Plus } from "lucide-react";
import { mostrar } from "../decisiones";

// Foto o color de un material (sólo cuando se sabe cómo es).
export function Muestra({ tex, grande = false }) {
  return <i className={`mem-sw${grande ? " grande" : ""}`} style={{ "--sw": tex }} aria-hidden="true" />;
}

export function Definicion({ campo, valor, nota, linea, onAbrir }) {
  const v = mostrar(campo, valor, linea);
  return (
    <button type="button" className="mem-def" data-estado={v.estado} id={`mem-campo-${campo.key}`} onClick={onAbrir}>
      <span className="mem-def-et">
        {campo.label}
        {v.estado === "ok" && <Check size={13} className="ok" />}
      </span>
      {v.estado === "vacio" ? (
        <span className="mem-def-vacio"><Plus size={14} /> Elegir</span>
      ) : v.filas ? (
        <span className="mem-def-filas">
          {v.filas.map((f) => (
            <span key={f.label} className="fila">
              <small>{f.label}</small>
              {f.texto ? <><span>{f.tex && <Muestra tex={f.tex} />}</span><b>{f.texto}</b></> : <em>Sin definir</em>}
            </span>
          ))}
        </span>
      ) : (
        <span className="mem-def-valor">
          {v.estado === "no" ? <Ban size={15} className="no" /> : v.tex && <Muestra tex={v.tex} />}
          <b>{v.texto}</b>
        </span>
      )}
      {v.sub && <span className="mem-def-sub">{v.sub}</span>}
      {String(nota || "").trim() && <span className="mem-def-nota">{nota}</span>}
    </button>
  );
}

// Equipo que se marca Sí / No (vacío = todavía no se sabe).
export function Equipo({ campo, valor, nota, puedeNota, onValor, onNota }) {
  const v = valor === true ? "si" : valor === false ? "no" : "";
  return (
    <div className="mem-equipo" id={`mem-campo-${campo.key}`} data-valor={v}>
      <div className="mem-equipo-sup">
        <b>{campo.label}</b>
        <div className="mem-sino" role="radiogroup" aria-label={campo.label}>
          <button type="button" role="radio" aria-checked={v === "si"} className={`si${v === "si" ? " on" : ""}`} onClick={() => onValor(v === "si" ? null : true)}>Sí</button>
          <button type="button" role="radio" aria-checked={v === "no"} className={`no${v === "no" ? " on" : ""}`} onClick={() => onValor(v === "no" ? null : false)}>No</button>
        </div>
      </div>
      {v === "si" && puedeNota && (
        <input className="ui-input" value={nota || ""} onChange={(e) => onNota(e.target.value)} placeholder="Modelo (opcional)" />
      )}
    </div>
  );
}
