/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · piezas compartidas
═══════════════════════════════════════════════════════════════ */
import { createElement, useEffect, useState } from "react";
import { leerLocal, guardarLocal } from "./almacen";
import { ArrowLeft, ArrowRight, Check, Info, AlertTriangle, RotateCcw } from "lucide-react";

/* Aparece al entrar en pantalla. Si no hay IntersectionObserver se muestra
   directo: nunca dejar contenido invisible. */
export function Reveal({ as = "div", d = 0, fade = false, className = "", style, children, ...rest }) {
  const [el, setEl] = useState(null);
  const [visto, setVisto] = useState(() => typeof IntersectionObserver !== "function");
  useEffect(() => {
    if (!el || visto) return undefined;
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some(e => e.isIntersecting)) { setVisto(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [el, visto]);
  return createElement(as, {
    ref: setEl,
    "data-rv": visto ? "in" : "",
    className: `${fade ? "kx-rv-fade " : ""}${className}`,
    style: { "--d": d, ...style },
    ...rest,
  }, children);
}

/* Título que sube palabra por palabra detrás de una máscara. */
export function Mascara({ texto, desde = 0 }) {
  const palabras = String(texto).split(" ");
  return palabras.map((p, i) => (
    <span className="kx-mask" key={`${p}-${i}`}>
      <span style={{ "--i": desde + i }}>{p}{i < palabras.length - 1 ? " " : ""}</span>
    </span>
  ));
}

export function Bloque({ eyebrow, titulo, children, id, intro, cabecera }) {
  return (
    <section className="kx-bloque" id={id}>
      <div className="kx-wrap kx-dos">
        <Reveal className="kx-dos-cab">
          {eyebrow && <div className="kx-eyebrow">{eyebrow}</div>}
          {titulo && <h2 className="kx-h2">{titulo}</h2>}
          {intro && <p className="kx-p" style={{ marginTop: 20, maxWidth: 360 }}>{intro}</p>}
          {cabecera}
        </Reveal>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function Nota({ tono = "info", children }) {
  const Icono = tono === "peligro" ? AlertTriangle : Info;
  return (
    <Reveal className="kx-nota" data-tono={tono}>
      <Icono size={17} strokeWidth={1.5} />
      <p>{children}</p>
    </Reveal>
  );
}

/* Lista de verificación que se recuerda en este dispositivo. */
export function ListaVerificacion({ items, prefijo, titulo = "Completado", mensajeListo }) {
  const [hechos, setHechos] = useState(() =>
    Object.fromEntries(items.map(it => [it.id, leerLocal(prefijo + it.id) === "true"]))
  );
  const total = items.length;
  const listos = items.filter(it => hechos[it.id]).length;
  const alternar = (id) => {
    setHechos(prev => {
      const n = !prev[id];
      guardarLocal(prefijo + id, String(n));
      return { ...prev, [id]: n };
    });
  };
  const reiniciar = () => {
    items.forEach(it => guardarLocal(prefijo + it.id, "false"));
    setHechos(Object.fromEntries(items.map(it => [it.id, false])));
  };
  return (
    <div>
      <div className="kx-check-cab">
        <div>
          <div className="kx-eyebrow">{titulo}</div>
          <div className="kx-check-cuenta" style={{ marginTop: 10 }}>
            {String(listos).padStart(2, "0")}<small> / {String(total).padStart(2, "0")}</small>
          </div>
        </div>
        <button type="button" className="kx-link" onClick={reiniciar} disabled={!listos} style={{ opacity: listos ? 1 : .35 }}>
          <RotateCcw size={13} strokeWidth={1.5} /> Reiniciar
        </button>
      </div>
      <div className="kx-barra"><i style={{ transform: `scaleX(${total ? listos / total : 0})` }} /></div>
      <ul className="kx-check">
        {items.map((it, i) => (
          <Reveal as="li" key={it.id} d={i % 6}>
            <button
              type="button"
              role="checkbox"
              aria-checked={!!hechos[it.id]}
              className="kx-check-item"
              onClick={() => alternar(it.id)}
            >
              <span className="kx-circ"><Check size={14} strokeWidth={2} /></span>
              <span>
                <span className="kx-check-t">{it.t}{it.critico && <span className="kx-tag">Clave</span>}</span>
                {it.d && <span className="kx-check-d" style={{ display: "block" }}>{it.d}</span>}
              </span>
            </button>
          </Reveal>
        ))}
      </ul>
      {listos === total && mensajeListo && (
        <div className="kx-check-listo"><Check size={18} strokeWidth={1.5} /> {mensajeListo}</div>
      )}
    </div>
  );
}

/* Paso a paso: la lista a la izquierda, el paso actual grande a la derecha. */
export function PasoAPaso({ pasos, etiqueta = "Paso" }) {
  const [i, setI] = useState(0);
  const p = pasos[i];
  return (
    <div className="kx-pasos">
      <ol className="kx-pasos-lista">
        {pasos.map((s, j) => (
          <li key={s.t}>
            <button type="button" className="kx-paso-btn" aria-current={i === j ? "step" : undefined} onClick={() => setI(j)}>
              <span>{String(j + 1).padStart(2, "0")}</span>
              <span>{s.t}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="kx-paso-card">
        <div className="kx-paso-n" aria-hidden>{String(i + 1).padStart(2, "0")}</div>
        <div className="kx-paso-cuerpo" key={i}>
          <div className="kx-eyebrow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {etiqueta} {i + 1} de {pasos.length}{p.critico && <span className="kx-tag">Clave</span>}
          </div>
          <h3>{p.t}</h3>
          <p>{p.d}</p>
        </div>
        <div className="kx-paso-nav">
          <button type="button" className="kx-redondo" aria-label="Paso anterior" disabled={i === 0} onClick={() => setI(i - 1)}>
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <button type="button" className="kx-redondo" aria-label="Paso siguiente" disabled={i === pasos.length - 1} onClick={() => setI(i + 1)}>
            <ArrowRight size={18} strokeWidth={1.5} />
          </button>
          <span className="kx-puntos" aria-hidden>
            {pasos.map((s, j) => <i key={s.t} data-on={j <= i ? "1" : "0"} />)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Acordeon({ items }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <ul className="kx-acordeon">
      {items.map((it, i) => {
        const on = abierto === i;
        return (
          <Reveal as="li" key={it.t} d={i % 6}>
            <button type="button" className="kx-acordeon-btn" aria-expanded={on} onClick={() => setAbierto(on ? null : i)}>
              <span className="kx-mono">{String(i + 1).padStart(2, "0")}</span>
              <strong>{it.t}</strong>
              <span className="kx-mas" aria-hidden />
            </button>
            {on && <div className="kx-acordeon-cuerpo"><p>{it.d}</p></div>}
          </Reveal>
        );
      })}
    </ul>
  );
}

/* Banda negra al final de cada capítulo. */
export function Siguiente({ capitulo, onIr }) {
  if (!capitulo) return null;
  return (
    <section className="kx-ink">
      <div className="kx-wrap">
        <button type="button" className="kx-sig" onClick={() => onIr(capitulo.id)}>
          <span className="kx-eyebrow">Siguiente · {capitulo.n}</span>
          <span className="kx-sig-t">
            <span>{capitulo.t}</span>
            <ArrowRight />
          </span>
        </button>
      </div>
    </section>
  );
}
