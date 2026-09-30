import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/ui/motion";

// Degradé azul → cian de la marca para los anillos de avance. Se dibuja una
// sola vez en la raíz del módulo y los anillos lo usan por id.
export function DefsProduccion() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="prd-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--blue)" }} />
          <stop offset="100%" style={{ stopColor: "var(--cyan)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Anillo({ valor, tam = 34, grosor = 3.5, fuente }) {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const vacio = valor == null;
  const v = vacio ? 0 : Math.max(0, Math.min(100, valor));
  // El arco arranca vacío y se llena al montar: queda el trazo animado.
  const [pintado, setPintado] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPintado(v));
    return () => cancelAnimationFrame(id);
  }, [v]);
  return (
    <span className={`prd-anillo${vacio ? " vacio" : ""}`} style={{ width: tam, height: tam }} title={vacio ? "Sin reportes de avance" : `${v}% de avance`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle className="fondo" cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} />
        {!vacio && (
          <circle
            className={`arco${v >= 100 ? " lleno" : ""}`}
            cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pintado / 100)}
          />
        )}
      </svg>
      <span style={{ fontSize: fuente ?? Math.max(9, tam * 0.28) }}>
        {vacio ? "—" : tam >= 56 ? <><AnimatedNumber value={v} />%</> : v}
      </span>
    </span>
  );
}

export function Estado({ tono = "neutro", children }) {
  return <span className="prd-estado" data-tono={tono}>{children}</span>;
}

// Menú desplegable anclado a su botón. Cierra con clic afuera o Escape.
export function Menu({ abierto, onCerrar, children, alinear = "derecha", arriba = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onCerrar(); };
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    const t = setTimeout(() => document.addEventListener("pointerdown", fuera), 0);
    document.addEventListener("keydown", tecla);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div
      ref={ref}
      className="prd-menu"
      role="menu"
      style={{ [alinear === "derecha" ? "right" : "left"]: 0, [arriba ? "bottom" : "top"]: "calc(100% + 6px)" }}
    >
      {children}
    </div>
  );
}

export function Check({ estado, onClick, disabled, etiqueta }) {
  const hecha = estado === "finalizada";
  return (
    <button
      type="button"
      className={`prd-check${hecha ? " on" : estado === "en_progreso" ? " curso" : ""}`}
      onClick={onClick}
      disabled={disabled}
      role="checkbox"
      aria-checked={hecha}
      aria-label={etiqueta}
    >
      {hecha && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
