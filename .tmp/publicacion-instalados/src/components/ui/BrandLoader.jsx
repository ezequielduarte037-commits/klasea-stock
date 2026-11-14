import { useId } from "react";
import LogoK from "./LogoK";

// El cargador de Klase A: la K respira y un arco con el degradé de la marca
// le da la vuelta al anillo. Reemplaza los "Cargando..." de texto pelado.
//
// Barato a propósito: el arco gira con transform (lo resuelve la placa de
// video) y la K sólo cambia de opacidad. Con "reducir movimiento" queda quieto.
//
// fullScreen: ocupa toda la ventana (arranque de la app). Si no, se centra en
// el espacio que le deje su contenedor (el área de contenido de una pantalla).
export default function BrandLoader({ label = "Cargando…", size = 46, fullScreen = false, children }) {
  const degradado = `ui-cargador-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      className="ui-cargador"
      role="status"
      aria-live="polite"
      style={{ minHeight: fullScreen ? "100vh" : "100%" }}
    >
      <style>{CSS}</style>
      <div className="ui-cargador-marca" style={{ width: size, height: size }}>
        <LogoK size={size} titulo="" className="ui-cargador-k" />
        <svg className="ui-cargador-orbita" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          <defs>
            <linearGradient id={degradado} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--cyan)" }} />
              <stop offset="1" style={{ stopColor: "var(--blue)" }} />
            </linearGradient>
          </defs>
          <circle
            cx="50" cy="50" r="45.8"
            fill="none"
            stroke={`url(#${degradado})`}
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeDasharray="62 226"
            transform="rotate(-90 50 50)"
          />
        </svg>
      </div>
      {label && <div className="ui-cargador-texto">{label}</div>}
      {children}
    </div>
  );
}

const CSS = `
  .ui-cargador {
    width: 100%;
    box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px;
    padding: 32px 16px;
    background: transparent;
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
    text-align: center;
  }
  .ui-cargador-marca { position: relative; flex-shrink: 0; }
  .ui-cargador-k {
    position: absolute; top: 0; left: 0;
    color: var(--text);
    opacity: .28;
    animation: ui-cargador-respira 1.6s ease-in-out infinite;
  }
  .ui-cargador-orbita {
    position: absolute; top: 0; left: 0;
    animation: ui-cargador-gira 1.05s cubic-bezier(.55,.15,.45,.85) infinite;
  }
  .ui-cargador-texto {
    font-size: 13px; font-weight: 500; letter-spacing: .01em;
    color: var(--dim);
  }
  @keyframes ui-cargador-gira { to { transform: rotate(360deg); } }
  @keyframes ui-cargador-respira { 50% { opacity: .62; } }
`;
