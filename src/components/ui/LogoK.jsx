import { useId } from "react";

// El monograma de Klase A en vector: lo usan el login, el menú y los cargadores.
// logo-k.png trae fondo negro: sobre una card se veía el cuadrado y en claro
// había que invertirlo con un filtro. Así toma el color del texto en los tres
// temas y se puede dibujar trazo por trazo.
//
// Geometría calcada del PNG: anillo, palo vertical y un único trazo que baja
// desde la punta de arriba, da la vuelta por el rulo y sale por la de abajo.
// El clip corta las dos puntas en horizontal, como en el original.
//
// stroke-dasharray es el largo de cada trazo (un poco redondeado para arriba):
// con dashoffset en ese largo el trazo no se ve, en 0 se ve entero.
export default function LogoK({ size = 40, oculto = false, anilloRef, paloRef, curvaRef, className, style, titulo = "Klase A" }) {
  const clip = `klase-k-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={style}
      // Sin título es decorativo (al lado ya dice "Klase A" o es un cargador).
      role={titulo ? "img" : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : "true"}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="22.2" width="100" height="55.6" />
        </clipPath>
      </defs>
      <circle
        ref={anilloRef}
        cx="50" cy="50" r="45.8"
        transform="rotate(-90 50 50)"
        fill="none" stroke="currentColor" strokeWidth="3.4"
        strokeDasharray="288" strokeDashoffset={oculto ? 288 : 0}
      />
      <g clipPath={`url(#${clip})`} fill="none" stroke="currentColor" strokeWidth="2.9">
        <path ref={paloRef} d="M33 20V80" strokeDasharray="60" strokeDashoffset={oculto ? 60 : 0} />
        <path
          ref={curvaRef}
          d="M75.5 20 39.25 56.25A8.84 8.84 0 1 1 39.25 43.75L75.5 80"
          strokeDasharray="145" strokeDashoffset={oculto ? 145 : 0}
        />
      </g>
    </svg>
  );
}
