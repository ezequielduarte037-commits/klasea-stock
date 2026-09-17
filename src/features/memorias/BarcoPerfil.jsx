import { ZONAS, tonoDeZona as tonoKeyDeZona } from "./memoriaViva";

// Perfil lateral de un yate con flybridge, dividido en las zonas de la memoria.
// Cada zona se pinta con el color de la etapa a la que llegaron sus ítems
// (memoria → matriz → compra → pañol → a bordo) y lleva un punto con cuántos
// campos tiene definidos; el punto rojo avisa que hay cruces.
//
// Al elegir un barco el contorno se dibuja (stroke-dashoffset), pasa un barrido
// y aparecen los puntos: todo con CSS, una sola vez. Con "reducir movimiento"
// el dibujo aparece completo de entrada (regla global de index.css).
//
// Proa a la derecha. viewBox 1000 × 400; línea de flotación en y = 292.

const TONO_ETAPA = {
  neutro: ["var(--muted)", "var(--panel-2)"],
  cian: ["var(--cyan)", "var(--cyan-soft)"],
  violeta: ["var(--violet)", "var(--violet-soft)"],
  azul: ["var(--blue)", "var(--blue-soft)"],
  verde: ["var(--green)", "var(--green-soft)"],
};

const FORMAS = {
  casco: "M64,212 Q506,214 948,186 C962,214 942,262 884,292 Q520,316 150,304 C112,300 80,288 70,268 Z",
  propulsion: "M92,236 Q220,238 360,238 L360,294 Q240,302 150,299 C118,295 98,283 90,266 Z",
  camarotes: "M560,234 Q720,232 900,210 C898,236 880,262 852,278 Q700,292 560,292 Z",
  interior: "M300,211 L322,152 Q330,143 342,143 L688,137 Q714,139 736,161 L790,201 Z",
  cockpit: "M66,212 L300,211 L300,178 L80,184 Z",
  proa: "M790,201 L946,187 L940,170 L800,180 Z",
  fly: "M344,143 L358,114 L646,108 L684,139 Z M388,72 L600,64 Q612,64 616,70 L604,77 L392,83 Z",
};

const ANCLAS = {
  fly: [500, 96],
  interior: [520, 172],
  camarotes: [740, 258],
  cockpit: [184, 196],
  proa: [872, 184],
  propulsion: [226, 268],
  casco: [430, 258],
};

// Orden de dibujo: el casco primero, las zonas interiores encima.
const ORDEN = ["casco", "propulsion", "camarotes", "cockpit", "proa", "interior", "fly"];

function tonoDeZona(info) {
  return TONO_ETAPA[tonoKeyDeZona(info)] || TONO_ETAPA.neutro;
}

export default function BarcoPerfil({ porZona = {}, zonaActiva = null, zonaResaltada = null, onZona, onResaltar, compacto = false }) {
  const etiquetas = Object.fromEntries(ZONAS.map((zona) => [zona.key, zona.label]));
  return (
    <svg className="bp" viewBox="0 0 1000 400" role="group" aria-label="Zonas del barco">
      <style href="klasea-barco-perfil" precedence="default">{CSS}</style>
      <defs>
        <linearGradient id="bp-barrido-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--cyan)" stopOpacity="0" />
          <stop offset="0.7" stopColor="var(--cyan)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--cyan)" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="bp-agua-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--bg)" stopOpacity="0.1" />
          <stop offset="0.35" stopColor="var(--bg)" stopOpacity="0.72" />
          <stop offset="1" stopColor="var(--bg)" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* Zonas: forma rellena con el tono de su etapa. */}
      {ORDEN.map((key, i) => {
        const [color, suave] = tonoDeZona(porZona[key]);
        const activa = zonaActiva === key;
        const resaltada = zonaResaltada === key;
        return (
          <path
            key={key}
            d={FORMAS[key]}
            className={`bp-zona${activa ? " is-activa" : ""}${resaltada ? " is-resaltada" : ""}${zonaActiva && !activa ? " is-atenuada" : ""}`}
            style={{ "--c": color, "--c-suave": suave, "--d": `${0.75 + i * 0.07}s` }}
            onClick={() => onZona?.(activa ? null : key)}
            onMouseEnter={() => onResaltar?.(key)}
            onMouseLeave={() => onResaltar?.(null)}
          />
        );
      })}

      {/* Detalles: se dibujan con el contorno. */}
      <g className="bp-detalles" aria-hidden="true">
        <path pathLength="1" className="bp-trazo" style={{ "--d": "0s" }} d={FORMAS.casco} />
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".15s" }} d="M66,224 Q506,226 944,198" />
        <path pathLength="1" className="bp-trazo bp-fino" style={{ "--d": ".25s" }} d="M76,272 Q480,288 902,276" />
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".3s" }} d="M300,211 L322,152 Q330,143 342,143 L688,137 Q714,139 736,161 L790,201" />
        <path pathLength="1" className="bp-trazo bp-vidrio" style={{ "--d": ".45s" }} d="M342,188 L348,162 L680,156 Q698,158 710,170 L724,184 Z" />
        {[430, 520, 610].map((x, i) => (
          <path key={x} pathLength="1" className="bp-trazo bp-fino" style={{ "--d": `${0.55 + i * 0.04}s` }} d={`M${x},${187 - i * 0.5} L${x + 4},${160 - i}`} />
        ))}
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".5s" }} d="M344,143 L358,114 L646,108 L684,139" />
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".6s" }} d="M404,112 L414,80 M572,108 L562,74" />
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".65s" }} d="M388,72 L600,64 Q612,64 616,70 L604,77 L392,83 Z" />
        <path pathLength="1" className="bp-trazo" style={{ "--d": ".75s" }} d="M500,64 L500,52" />
        <ellipse className="bp-trazo" pathLength="1" style={{ "--d": ".8s" }} cx="500" cy="47" rx="20" ry="6" />
        <circle className="bp-trazo" pathLength="1" style={{ "--d": ".85s" }} cx="432" cy="62" r="6" />
        <path pathLength="1" className="bp-trazo bp-fino" style={{ "--d": ".7s" }} d="M78,184 L296,178 M110,184 L110,210 M170,182 L170,210 M230,180 L230,210" />
        <path pathLength="1" className="bp-trazo bp-fino" style={{ "--d": ".75s" }} d="M800,176 L938,165 M830,174 L830,196 M870,171 L870,192 M910,168 L910,189" />
        {[610, 668, 726, 784].map((x, i) => (
          <ellipse key={x} className="bp-trazo bp-fino" pathLength="1" style={{ "--d": `${0.8 + i * 0.05}s` }} cx={x} cy={250 - i * 3} rx="9" ry="5" />
        ))}
        <path pathLength="1" className="bp-trazo bp-fino" style={{ "--d": ".9s" }} d="M150,252 L150,282 L230,282 L230,252 Z M250,252 L250,282 L330,282 L330,252 Z" />
      </g>

      {/* Agua: tapa la obra viva para que el casco "flote" sobre el oleaje. */}
      <rect x="0" y="292" width="1000" height="108" fill="url(#bp-agua-grad)" pointerEvents="none" />
      <path pathLength="1" className="bp-trazo bp-flotacion" style={{ "--d": ".2s" }} d="M0,292 L1000,292" />

      {/* Barrido de escaneo, una sola vez. */}
      <rect className="bp-barrido" x="-120" y="30" width="120" height="280" fill="url(#bp-barrido-grad)" pointerEvents="none" />

      {/* Puntos de cada zona. */}
      {ORDEN.map((key, i) => {
        const info = porZona[key] || {};
        const [color] = tonoDeZona(info);
        const [x, y] = ANCLAS[key];
        const activa = zonaActiva === key;
        const resaltada = zonaResaltada === key;
        const etiqueta = etiquetas[key];
        const ancho = etiqueta.length * 7.4 + 36;
        return (
          // El grupo de afuera se ubica con el atributo transform; el de adentro
          // es el que se anima: un transform de CSS pisaría el translate.
          <g
            key={key}
            className={`bp-punto${activa ? " is-activa" : ""}${resaltada ? " is-resaltada" : ""}`}
            style={{ "--c": color }}
            transform={`translate(${x} ${y})`}
            role="button"
            tabIndex={0}
            aria-pressed={activa}
            aria-label={`${etiqueta}: ${info.definidos || 0} de ${info.total || 0} definidos${info.cruces ? `, ${info.cruces} cruces` : ""}`}
            onClick={() => onZona?.(activa ? null : key)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                onZona?.(activa ? null : key);
              }
            }}
            onMouseEnter={() => onResaltar?.(key)}
            onMouseLeave={() => onResaltar?.(null)}
            onFocus={() => onResaltar?.(key)}
            onBlur={() => onResaltar?.(null)}
          >
            <g className="bp-punto-cuerpo" style={{ "--d": `${1.25 + i * 0.09}s` }}>
              <circle className="bp-anillo" r="17" />
              <circle className="bp-nucleo" r="9" />
              {info.cruces > 0 && <circle className="bp-alerta" cx="9" cy="-9" r="5" />}
              {!compacto && (
                <g className="bp-etiqueta" transform={`translate(${-ancho / 2} -46)`}>
                  <rect width={ancho} height="24" rx="12" />
                  <text x="12" y="16">{etiqueta}</text>
                  <text x={ancho - 12} y="16" textAnchor="end" className="bp-cuenta">{info.definidos || 0}/{info.total || 0}</text>
                </g>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

const CSS = `
  .bp { display: block; width: 100%; height: auto; overflow: visible; font-family: 'Outfit', system-ui, sans-serif; }

  .bp-zona {
    fill: var(--c-suave); stroke: transparent; stroke-width: 2;
    cursor: pointer; opacity: 0;
    transition: fill .2s, stroke .2s, opacity .25s;
    animation: bp-aparecer .5s ease var(--d) forwards;
  }
  .bp-zona:hover, .bp-zona.is-resaltada { stroke: var(--c); }
  .bp-zona.is-activa { stroke: var(--c); stroke-width: 2.5; }
  .bp-zona.is-atenuada { opacity: .35 !important; animation: none; }

  .bp-trazo {
    fill: none; stroke: color-mix(in srgb, var(--text) 62%, transparent); stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: bp-dibujar 1.3s cubic-bezier(.65,0,.35,1) var(--d) forwards;
    pointer-events: none;
  }
  .bp-fino { stroke-width: 1.3; stroke: color-mix(in srgb, var(--text) 38%, transparent); }
  .bp-vidrio { fill: color-mix(in srgb, var(--cyan) 10%, transparent); }
  .bp-flotacion { stroke: var(--cyan); stroke-width: 1.2; opacity: .5; }

  .bp-barrido { animation: bp-barrer 1.9s cubic-bezier(.45,0,.2,1) .35s both; }

  .bp-punto { cursor: pointer; outline: none; }
  .bp-punto-cuerpo {
    opacity: 0; transform-box: fill-box; transform-origin: center;
    animation: bp-punto-in .45s cubic-bezier(.34,1.56,.64,1) var(--d) forwards;
  }
  .bp-anillo { fill: none; stroke: var(--c); stroke-width: 2; opacity: .35; transition: opacity .2s; transform-box: fill-box; transform-origin: center; }
  .bp-nucleo { fill: var(--c); stroke: var(--bg); stroke-width: 3; }
  .bp-alerta { fill: var(--red); stroke: var(--bg); stroke-width: 2; }
  .bp-punto:hover .bp-anillo, .bp-punto.is-resaltada .bp-anillo, .bp-punto.is-activa .bp-anillo { opacity: .9; }
  .bp-punto.is-resaltada .bp-anillo, .bp-punto:focus-visible .bp-anillo { animation: bp-latido 1.1s ease-out 2; }
  .bp-etiqueta rect { fill: var(--panel-solid); stroke: var(--border-2); }
  .bp-etiqueta text { fill: var(--text); font-size: 13px; font-weight: 600; }
  .bp-etiqueta .bp-cuenta { fill: var(--c); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .bp-punto.is-activa .bp-etiqueta rect { stroke: var(--c); }

  @keyframes bp-dibujar { to { stroke-dashoffset: 0; } }
  @keyframes bp-aparecer { to { opacity: 1; } }
  @keyframes bp-barrer { from { transform: translateX(0); opacity: 1; } 85% { opacity: 1; } to { transform: translateX(1120px); opacity: 0; } }
  @keyframes bp-punto-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
  @keyframes bp-latido { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
`;
