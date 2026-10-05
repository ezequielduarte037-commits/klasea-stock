// Un campo de la memoria: el valor, las opciones para elegir de un toque (las
// muestras de acabados y lo que se eligió en otros barcos), "No lleva" y una
// nota opcional.
import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { NO_LLEVA, estaDefinido } from "../campos";
import { muestraDeValor, paletaDeCampo, sinTildes } from "../acabados";

// Enter pasa al campo siguiente (como en una planilla).
function alSiguiente(e) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  const todos = [...document.querySelectorAll("[data-campo-input]")];
  const i = todos.indexOf(e.currentTarget);
  todos[i + 1]?.focus();
}

export function Campo({ campo, valor, nota, puedeNota, sugerencias, onValor, onNota }) {
  const id = useId();
  const [foco, setFoco] = useState(false);
  const [verNota, setVerNota] = useState(false);
  const texto = typeof valor === "string" ? valor : valor == null ? "" : String(valor);
  const definido = estaDefinido(campo, valor);
  const noLleva = sinTildes(texto) === sinTildes(NO_LLEVA);
  const muestra = muestraDeValor(campo.key, texto);

  const opciones = useMemo(() => {
    const out = [];
    const vistos = new Set();
    for (const m of paletaDeCampo(campo.key)?.muestras || []) {
      out.push({ valor: m.nombre, tex: m.tex });
      vistos.add(sinTildes(m.nombre));
    }
    // En los campos de texto largo sólo sirven las respuestas cortas.
    const historial = campo.tipo === "largo" ? (sugerencias || []).filter((s) => s.valor.length <= 36).slice(0, 4) : sugerencias || [];
    for (const s of historial) {
      if (vistos.has(sinTildes(s.valor))) continue;
      vistos.add(sinTildes(s.valor));
      out.push({ valor: s.valor, veces: s.veces });
    }
    return out.slice(0, 10);
  }, [campo.key, campo.tipo, sugerencias]);

  const elegido = (v) => sinTildes(v) === sinTildes(texto);
  // "No lleva" no tiene sentido para el propietario o el nombre del barco.
  const conNoLleva = campo.seccion !== "cliente";
  const mostrarOpciones = (foco || !definido) && (opciones.length > 0 || conNoLleva);
  const conNota = puedeNota && (String(nota || "").trim() || verNota);

  return (
    <div
      className="mem-campo"
      id={`mem-campo-${campo.key}`}
      data-definido={definido ? "1" : "0"}
      onFocus={() => setFoco(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFoco(false); }}
    >
      <label className="mem-campo-et" htmlFor={id}><span className="pto" />{campo.label}</label>
      <div className="mem-campo-ctl">
        {campo.tipo === "opciones" ? (
          <div className="mem-sug" role="radiogroup" aria-label={campo.label}>
            {campo.opciones.map((o, i) => (
              <button
                key={o.valor}
                id={i === 0 ? id : undefined}
                data-campo-input
                type="button"
                role="radio"
                aria-checked={elegido(o.valor)}
                className={`mem-sug-op${elegido(o.valor) ? " on" : ""}`}
                onClick={() => onValor(elegido(o.valor) ? "" : o.valor)}
              >
                {o.label}
              </button>
            ))}
            {/* Valor viejo escrito a mano que no es ninguna opción ("X / Infinity gris"). */}
            {definido && !noLleva && !campo.opciones.some((o) => elegido(o.valor)) && (
              <button type="button" role="radio" aria-checked className="mem-sug-op on" onClick={() => onValor("")} title="Valor cargado antes. Tocá para borrarlo.">
                {texto}
              </button>
            )}
            <button type="button" role="radio" aria-checked={noLleva} className={`mem-sug-op no${noLleva ? " on" : ""}`} onClick={() => onValor(noLleva ? "" : NO_LLEVA)}>
              {NO_LLEVA}
            </button>
          </div>
        ) : (
          <div className={`mem-valor${muestra ? " con-muestra" : ""}`} style={muestra ? { "--sw": muestra.tex } : undefined}>
            {muestra && <span className="muestra" aria-hidden="true" />}
            {campo.tipo === "largo" ? (
              <textarea
                id={id}
                data-campo-input
                rows={2}
                className={`ui-input${noLleva ? " no-lleva" : ""}`}
                value={texto}
                onChange={(e) => onValor(e.target.value)}
                placeholder="Escribí lo que se definió…"
              />
            ) : (
              <input
                id={id}
                data-campo-input
                className={`ui-input${noLleva ? " no-lleva" : ""}`}
                value={texto}
                onChange={(e) => onValor(e.target.value)}
                onKeyDown={alSiguiente}
                placeholder={opciones.length ? "Escribí o elegí una opción…" : "Escribí lo que se definió…"}
                autoComplete="off"
              />
            )}
          </div>
        )}

        {campo.tipo !== "opciones" && mostrarOpciones && (
          <div className="mem-sug">
            {opciones.map((o) => (
              <button
                key={o.valor}
                type="button"
                className={`mem-sug-op${elegido(o.valor) ? " on" : ""}`}
                // Sin perder el foco del campo (si no, las opciones se esconden antes del clic).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onValor(o.valor)}
                title={o.veces ? `Elegido en ${o.veces} barco${o.veces === 1 ? "" : "s"}` : "Muestra del showroom"}
              >
                {o.tex && <span className="sw" style={{ "--sw": o.tex }} aria-hidden="true" />}
                {o.valor}
                {o.veces > 1 && <span className="n">×{o.veces}</span>}
              </button>
            ))}
            {conNoLleva && (
              <button
                type="button"
                className={`mem-sug-op no${noLleva ? " on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onValor(noLleva ? "" : NO_LLEVA)}
              >
                {NO_LLEVA}
              </button>
            )}
          </div>
        )}

        {conNota ? (
          <div className="mem-nota">
            <input
              className="ui-input"
              value={nota || ""}
              onChange={(e) => onNota(e.target.value)}
              placeholder="Nota: proveedor, código, aclaración del cliente…"
              autoFocus={verNota && !nota}
            />
          </div>
        ) : puedeNota && foco ? (
          <button type="button" className="mem-nota-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setVerNota(true)}>
            <Plus size={12} /> Agregar nota
          </button>
        ) : null}
      </div>
    </div>
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
          <button type="button" data-campo-input role="radio" aria-checked={v === "si"} className={`si${v === "si" ? " on" : ""}`} onClick={() => onValor(v === "si" ? null : true)}>Sí</button>
          <button type="button" role="radio" aria-checked={v === "no"} className={`no${v === "no" ? " on" : ""}`} onClick={() => onValor(v === "no" ? null : false)}>No</button>
        </div>
      </div>
      {v === "si" && puedeNota && (
        <input className="ui-input" value={nota || ""} onChange={(e) => onNota(e.target.value)} placeholder="Modelo o detalle (opcional)" />
      )}
    </div>
  );
}
