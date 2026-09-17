import { Children } from "react";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import FondoOleaje from "./FondoOleaje";
import { AnimatedNumber } from "./motion";

// Piezas de las pantallas de inicio (Home, Obras, panel de Pañol): una franja
// de bienvenida con el oleaje de la marca e indicadores, y tarjetas para entrar
// a cada módulo o vista. Mismo diseño en todas, un solo lugar para cambiarlo.
//
//   <Portada>
//     <PortadaHero eyebrow titulo acento bajada acciones indicadores={<>…<Indicador/></>} />
//     <SeccionPortada titulo cantidad>
//       <TarjetaModulo titulo descripcion Icono tono arte indice onClick />
//     </SeccionPortada>
//     <ColumnasPortada>
//       <PanelPortada titulo subtitulo accion={<EnlacePortada/>}>
//         <FilaPortada Icono titulo detalle valor valorLabel tono alerta onClick />
//       </PanelPortada>
//     </ColumnasPortada>
//   </Portada>

// Tonos por nombre, con los tokens del tema (oscuro, claro y alto contraste).
const TONOS = {
  azul:    { c: "var(--blue)", soft: "var(--blue-soft)", borde: "var(--blue-border)" },
  verde:   { c: "var(--green)", soft: "var(--green-soft)", borde: "var(--green-border)" },
  teal:    { c: "var(--teal)", soft: "var(--teal-soft)", borde: "var(--teal-border)" },
  violeta: { c: "var(--violet)", soft: "var(--violet-soft)", borde: "var(--violet-border)" },
  cian:    { c: "var(--cyan)", soft: "var(--cyan-soft)", borde: "var(--cyan-border)" },
  rojo:    { c: "var(--red)", soft: "var(--red-soft)", borde: "var(--red-border)" },
  neutro:  { c: "var(--muted)", soft: "var(--panel-2)", borde: "var(--border-2)" },
};

export function Portada({ children }) {
  return (
    <div className="pt">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

// El agua anima sólo mientras alguien usa la PC (pausaInactivo): estas pantallas
// quedan abiertas todo el día.
export function PortadaHero({ eyebrow, titulo, acento, bajada, acciones, indicadores }) {
  return (
    <section className="pt-hero">
      <FondoOleaje className="pt-agua" horizonte={0.4} filas={22} alfa={0.42} pausaInactivo={20000} />
      <div className="pt-hero-contenido">
        <div className="pt-hero-textos">
          {eyebrow && <div className="pt-eyebrow">{eyebrow}</div>}
          <h1 className="pt-titulo">
            {titulo}{acento && <>{titulo ? " " : ""}<span className="pt-acento">{acento}</span></>}
          </h1>
          {bajada && <p className="pt-bajada">{bajada}</p>}
          {acciones && <div className="pt-acciones">{acciones}</div>}
        </div>
        {indicadores && (
          <div className="pt-indicadores" data-cantidad={Children.count(indicadores)} aria-live="polite">
            {indicadores}
          </div>
        )}
      </div>
    </section>
  );
}

export function Indicador({ label, valor, tono = "azul", cargando, destacar, onClick }) {
  const Contenedor = onClick ? "button" : "div";
  return (
    <Contenedor
      type={onClick ? "button" : undefined}
      className={`pt-kpi${cargando ? " is-cargando" : ""}${destacar ? " is-destacado" : ""}`}
      style={{ "--k": (TONOS[tono] || TONOS.azul).c }}
      onClick={onClick}
    >
      <span className="pt-kpi-valor">
        {cargando ? <span className="pt-kpi-hueco" /> : <AnimatedNumber value={valor} duration={900} />}
      </span>
      <span className="pt-kpi-label">{label}</span>
    </Contenedor>
  );
}

export function SeccionPortada({ titulo, cantidad, children }) {
  return (
    <section className="pt-cuerpo">
      {titulo && (
        <div className="pt-seccion">
          <h2>{titulo}</h2>
          {cantidad != null && <span>{cantidad}</span>}
        </div>
      )}
      <div className="pt-grilla">{children}</div>
    </section>
  );
}

// arte: función (color) → SVG decorativo; se dibuja con currentColor.
export function TarjetaModulo({ titulo, descripcion, Icono, tono = "neutro", arte, indice = 0, onClick }) {
  const t = TONOS[tono] || TONOS.neutro;
  return (
    <button
      type="button"
      className="pt-card"
      onClick={onClick}
      style={{
        "--c": t.c,
        "--c-soft": t.soft,
        "--c-borde": t.borde,
        animationDelay: `${Math.min(indice * 35, 420)}ms`,
      }}
    >
      {arte && <span className="pt-card-arte" aria-hidden="true">{arte("currentColor")}</span>}
      {Icono && <span className="pt-card-icono" aria-hidden="true"><Icono size={20} strokeWidth={1.9} /></span>}
      <span className="pt-card-textos">
        <span className="pt-card-titulo">{titulo}</span>
        {descripcion && <span className="pt-card-desc">{descripcion}</span>}
      </span>
      <ChevronRight className="pt-card-flecha" size={18} aria-hidden="true" />
    </button>
  );
}

// Dos columnas de paneles debajo de las tarjetas (una sola en el celular).
export function ColumnasPortada({ children }) {
  return (
    <section className="pt-cuerpo">
      <div className="pt-columnas">{children}</div>
    </section>
  );
}

// Un bloque con título y filas: listas cortas de lo pendiente o de accesos.
export function PanelPortada({ titulo, subtitulo, accion, children }) {
  return (
    <section className="pt-panel">
      <header className="pt-panel-cabeza">
        <div className="pt-panel-titulos">
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

export function EnlacePortada({ children, onClick }) {
  return (
    <button type="button" className="pt-enlace" onClick={onClick}>
      {children}
    </button>
  );
}

// Fila de un panel. valor: número del lado derecho (con valorLabel abajo).
// alerta: marca la fila como urgente.
export function FilaPortada({ Icono, titulo, detalle, valor, valorLabel, tono = "neutro", alerta = false, onClick }) {
  const t = TONOS[tono] || TONOS.neutro;
  return (
    <button
      type="button"
      className={`pt-fila${Icono ? " con-icono" : ""}`}
      onClick={onClick}
      style={{ "--c": t.c, "--c-soft": t.soft }}
    >
      {Icono && <span className="pt-fila-icono" aria-hidden="true"><Icono size={17} strokeWidth={1.9} /></span>}
      <span className="pt-fila-textos">
        <span className="pt-fila-titulo">
          {alerta && <AlertTriangle size={14} className="pt-fila-alerta" aria-label="Urgente" />}
          <span>{titulo}</span>
        </span>
        {detalle && <span className="pt-fila-detalle">{detalle}</span>}
      </span>
      {valor != null ? (
        <span className="pt-fila-valor">
          <strong>{valor}</strong>
          {valorLabel && <small>{valorLabel}</small>}
        </span>
      ) : <span />}
      <ChevronRight size={16} className="pt-fila-flecha" aria-hidden="true" />
    </button>
  );
}

export function VacioPortada({ Icono, titulo, detalle, tono = "verde" }) {
  const t = TONOS[tono] || TONOS.verde;
  return (
    <div className="pt-vacio" style={{ "--c": t.c }}>
      {Icono && <Icono size={28} strokeWidth={1.7} aria-hidden="true" />}
      <strong>{titulo}</strong>
      {detalle && <span>{detalle}</span>}
    </div>
  );
}

// Atajo al buscador global desde una portada (en el celular ya está en la barra
// superior, así que ahí no se muestra).
export function BuscarPortada({ texto = "Buscar obras, materiales, pedidos…" }) {
  return (
    <button
      type="button"
      className="pt-buscar"
      onClick={() => window.dispatchEvent(new CustomEvent("klasea:open-global-search"))}
    >
      <Search size={16} />
      <span>{texto}</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}

const CSS = `
  .pt {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    overflow-y: auto; overflow-x: hidden;
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
  }

  /* ── Franja de bienvenida ── */
  .pt-hero {
    position: relative; overflow: hidden;
    padding: 36px 36px 30px;
    border-bottom: 1px solid var(--border);
    background: radial-gradient(900px 420px at 12% -20%, var(--glow-a), transparent 70%);
  }
  .pt-agua {
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 55%);
    mask-image: linear-gradient(180deg, transparent 0%, #000 55%);
    opacity: .9;
  }
  .pt-hero-contenido {
    position: relative; z-index: 1;
    max-width: 1440px; margin: 0 auto;
    display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; flex-wrap: wrap;
  }
  .pt-hero-textos { min-width: 0; animation: pt-sube .55s cubic-bezier(.22,1,.36,1) both; }
  .pt-eyebrow { font-size: 13px; font-weight: 500; color: var(--dim); }
  .pt-titulo {
    margin: 6px 0 0;
    font-size: clamp(28px, 3.2vw, 40px); font-weight: 700; letter-spacing: -.03em; line-height: 1.08;
  }
  .pt-acento {
    background: var(--brand-grad);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .pt-bajada { margin: 8px 0 0; max-width: 640px; font-size: 15px; line-height: 1.5; color: var(--muted); }
  .pt-acciones { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }

  .pt-buscar {
    display: inline-flex; align-items: center; gap: 10px;
    min-height: 42px; padding: 0 10px 0 14px;
    border: 1px solid var(--border-2); border-radius: 12px;
    background: var(--topbar-soft);
    -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
    color: var(--dim); font: inherit; font-size: 14px;
    transition: border-color .15s, color .15s;
  }
  .pt-buscar span { min-width: 260px; text-align: left; }
  .pt-buscar kbd {
    padding: 2px 7px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--panel-2); color: var(--dim);
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
  }
  .pt-buscar:hover { border-color: var(--border-3); color: var(--text); }
  @media (max-width: 899px) { .pt-buscar { display: none; } }

  /* ── Indicadores ── */
  .pt-indicadores {
    display: grid; grid-auto-flow: column; grid-auto-columns: minmax(128px, 1fr); gap: 10px;
    animation: pt-sube .55s .08s cubic-bezier(.22,1,.36,1) both;
  }
  .pt-kpi {
    position: relative; overflow: hidden;
    display: grid; gap: 7px; align-content: start;
    min-width: 0; padding: 15px 16px 14px 18px;
    border: 1px solid var(--border); border-radius: 14px;
    background: var(--topbar-soft);
    -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
    color: var(--text); font: inherit; text-align: left;
    transition: border-color .18s, transform .18s cubic-bezier(.22,1,.36,1), background-color .18s;
  }
  .pt-kpi::before {
    content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px;
    border-radius: 0 3px 3px 0; background: var(--k);
  }
  button.pt-kpi:hover { border-color: var(--border-2); transform: translateY(-2px); }
  .pt-kpi-valor {
    min-height: 30px;
    font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 600; line-height: 1; letter-spacing: -.02em;
  }
  .pt-kpi.is-destacado .pt-kpi-valor { color: var(--k); }
  .pt-kpi-label { font-size: 13px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pt-kpi-hueco {
    display: block; width: 46px; height: 26px; border-radius: 7px;
    background: linear-gradient(90deg, var(--panel), var(--panel-3), var(--panel));
    background-size: 200% 100%;
    animation: pt-hueco 1.2s linear infinite;
  }

  /* ── Tarjetas ── */
  .pt-cuerpo { max-width: 1440px; margin: 0 auto; padding: 28px 36px 44px; }
  .pt-seccion { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
  .pt-seccion h2 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
  .pt-seccion span {
    padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px;
    color: var(--dim); font-size: 12px; font-weight: 600;
  }
  .pt-grilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .pt-card {
    position: relative; overflow: hidden;
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px;
    min-height: 98px; padding: 16px 14px 16px 16px;
    border: 1px solid var(--border); border-radius: 16px;
    background: var(--panel-solid);
    box-shadow: var(--elev-1);
    color: var(--text); font: inherit; text-align: left;
    transition: transform .2s cubic-bezier(.22,1,.36,1), border-color .2s, box-shadow .2s;
    animation: pt-sube .5s cubic-bezier(.22,1,.36,1) both;
  }
  .pt-card::after {
    content: ""; position: absolute; right: -60px; top: -60px; width: 160px; height: 160px;
    border-radius: 50%; background: var(--c-soft); filter: blur(30px);
    opacity: 0; transition: opacity .25s; pointer-events: none;
  }
  .pt-card:hover { transform: translateY(-2px); border-color: var(--c-borde); box-shadow: var(--elev-2); }
  .pt-card:hover::after { opacity: 1; }
  .pt-card:active { transform: translateY(0) scale(.99); }
  .pt-card-arte {
    position: absolute; top: 0; right: 0; bottom: 0; width: 58%;
    color: var(--c);
    opacity: .75;
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 70%);
    mask-image: linear-gradient(90deg, transparent 0%, #000 70%);
    pointer-events: none;
    transition: opacity .25s;
  }
  .pt-card:hover .pt-card-arte { opacity: 1; }
  .pt-card-icono {
    position: relative; z-index: 1;
    width: 44px; height: 44px; border-radius: 13px;
    display: grid; place-items: center;
    border: 1px solid var(--c-borde); background: var(--c-soft); color: var(--c);
  }
  .pt-card-textos { position: relative; z-index: 1; display: grid; gap: 4px; min-width: 0; }
  .pt-card-titulo { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
  .pt-card-desc {
    font-size: 12.5px; line-height: 1.45; color: var(--dim);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .pt-card-flecha { position: relative; z-index: 1; color: var(--subtle); transition: transform .2s, color .2s; }
  .pt-card:hover .pt-card-flecha { color: var(--c); transform: translateX(3px); }

  /* ── Paneles con filas ── */
  .pt-cuerpo + .pt-cuerpo { padding-top: 0; }
  .pt-columnas { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 12px; align-items: start; }
  .pt-panel {
    min-width: 0; overflow: hidden;
    border: 1px solid var(--border); border-radius: 16px;
    background: var(--panel-solid); box-shadow: var(--elev-1);
    animation: pt-sube .5s .12s cubic-bezier(.22,1,.36,1) both;
  }
  .pt-panel-cabeza { display: flex; align-items: center; gap: 12px; padding: 14px 12px 14px 16px; border-bottom: 1px solid var(--border); }
  .pt-panel-titulos { flex: 1; min-width: 0; }
  .pt-panel-titulos h2 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
  .pt-panel-titulos p { margin: 3px 0 0; font-size: 12.5px; color: var(--dim); }
  .pt-enlace {
    flex-shrink: 0; min-height: 32px; padding: 0 10px;
    border: 0; border-radius: 9px; background: transparent;
    color: var(--blue); font: inherit; font-size: 13px; font-weight: 600;
    transition: background-color .15s;
  }
  .pt-enlace:hover { background: var(--blue-soft); }

  .pt-fila {
    width: 100%; min-height: 62px;
    display: grid; grid-template-columns: minmax(0, 1fr) auto 16px; align-items: center; gap: 12px;
    padding: 10px 14px 10px 16px;
    border: 0; border-bottom: 1px solid var(--border);
    background: transparent; color: var(--text); font: inherit; text-align: left;
    transition: background-color .15s;
  }
  .pt-fila.con-icono { grid-template-columns: 36px minmax(0, 1fr) auto 16px; }
  .pt-fila:last-child { border-bottom: 0; }
  .pt-fila:hover { background: var(--panel); }
  .pt-fila-icono {
    width: 36px; height: 36px; border-radius: 11px;
    display: grid; place-items: center;
    background: var(--c-soft); color: var(--c);
  }
  .pt-fila-textos { display: grid; gap: 3px; min-width: 0; }
  .pt-fila-titulo { display: flex; align-items: center; min-width: 0; font-size: 14px; font-weight: 600; }
  .pt-fila-titulo span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pt-fila-alerta { flex-shrink: 0; margin-right: 7px; color: var(--red); }
  .pt-fila-detalle { font-size: 12.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pt-fila-valor { display: grid; justify-items: end; gap: 3px; }
  .pt-fila-valor strong { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 600; line-height: 1; color: var(--c); }
  .pt-fila-valor small { font-size: 11px; color: var(--dim); }
  .pt-fila-flecha { color: var(--subtle); transition: transform .2s, color .2s; }
  .pt-fila:hover .pt-fila-flecha { color: var(--text); transform: translateX(2px); }

  .pt-vacio { display: grid; justify-items: center; gap: 5px; padding: 40px 20px; text-align: center; }
  .pt-vacio svg { margin-bottom: 4px; color: var(--c); }
  .pt-vacio strong { font-size: 14.5px; font-weight: 600; }
  .pt-vacio span { font-size: 12.5px; color: var(--dim); }

  @keyframes pt-sube { from { opacity: 0; transform: translateY(12px); } }
  @keyframes pt-hueco { to { background-position: -200% 0; } }

  /* ── Celular ── */
  @media (max-width: 899px) {
    .pt-hero { padding: 22px 16px 18px; }
    .pt-hero-contenido { gap: 18px; }
    .pt-titulo { font-size: 26px; }
    .pt-bajada { font-size: 14px; }
    .pt-indicadores { width: 100%; grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    /* Tres entran en una fila; con dos columnas quedaba uno suelto abajo. */
    .pt-indicadores[data-cantidad="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .pt-kpi { padding: 12px 12px 11px 15px; }
    .pt-kpi-valor { font-size: 24px; min-height: 26px; }
    .pt-cuerpo { padding: 20px 16px 32px; }
    .pt-grilla { grid-template-columns: 1fr; gap: 8px; }
    .pt-card { min-height: 76px; padding: 12px 10px 12px 12px; border-radius: 14px; gap: 12px; }
    .pt-card-arte { display: none; }
    .pt-card-icono { width: 42px; height: 42px; border-radius: 12px; }
    .pt-card-desc { -webkit-line-clamp: 1; }
    .pt-columnas { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .pt-panel { border-radius: 14px; }
    .pt-panel-cabeza { padding: 12px 8px 12px 14px; }
    .pt-fila { min-height: 58px; padding: 9px 12px 9px 14px; gap: 10px; }
  }
`;
