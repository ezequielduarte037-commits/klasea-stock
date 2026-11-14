// Piezas visuales de Revisiones técnicas: anillo de avance y riel de semanas del plan.
import { useId } from "react";

/** Anillo de avance con el degradé de la marca. */
export function Anillo({ valor = 0, total = 1, size = 54, grosor = 5, children, completo }) {
  const id = useId().replace(/:/g, "");
  const r = (size - grosor) / 2;
  const largo = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, valor / total) : 0;
  return (
    <span className={`rv-anillo${completo ? " is-completo" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={`rv-g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--blue)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-2)" strokeWidth={grosor} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={completo ? "var(--green)" : `url(#rv-g-${id})`} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - pct)}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <span className="rv-anillo-centro">{children}</span>
    </span>
  );
}

/**
 * Riel del plan, contado desde el desmolde (semana 0) hasta la botadura.
 * Cada semana es un punto; el desmolde y la botadura van marcados.
 * estados: Map semana -> "ok" | "corregir" | "pendiente"; activa: semana resaltada.
 */
export function RielSemanas({ desde = -3, hasta, estados, activa, densidad, onElegir, compacto }) {
  const semanas = [];
  for (let w = desde; w <= hasta; w += 1) semanas.push(w);
  return (
    <div className="rv-riel-caja">
    <div className={`rv-riel${compacto ? " is-compacto" : ""}`} role={onElegir ? "tablist" : undefined} aria-label="Semanas del plan">
      <div className="rv-riel-linea" aria-hidden="true" />
      {semanas.map((w) => {
        const estado = estados?.get(w) || "pendiente";
        const marca = w === 0 ? "Desmolde" : w === hasta ? "Botadura" : null;
        const Tag = onElegir ? "button" : "span";
        return (
          <Tag key={w} type={onElegir ? "button" : undefined} role={onElegir ? "tab" : undefined} aria-selected={onElegir ? activa === w : undefined}
            className={`rv-riel-sem is-${estado}${activa === w ? " is-activa" : ""}${w === 0 ? " is-desmolde" : w === hasta ? " is-botada" : ""}`}
            onClick={onElegir ? () => onElegir(w) : undefined}
            title={`Semana ${w}${marca ? ` · ${marca}` : ""}${densidad?.get(w) ? ` · ${densidad.get(w)} etapas` : ""}`}>
            <i>{densidad?.get(w) ? <b style={{ height: `${Math.min(100, densidad.get(w) * 22)}%` }} /> : null}</i>
            <small>{compacto && marca ? (w === 0 ? "D" : "B") : w}</small>
          </Tag>
        );
      })}
    </div>
    {!compacto && (
      <div className="rv-riel-leyenda" aria-hidden="true">
        <span><i className="is-desmolde" />Desmolde (semana 0)</span>
        <span><i className="is-botada" />Botadura (semana {hasta})</span>
      </div>
    )}
    </div>
  );
}
