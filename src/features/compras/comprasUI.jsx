import { C } from "@/theme";
import { tono } from "./comprasTonos";

/**
 * El lenguaje visual del módulo de Compras.
 *
 * El módulo creció pantalla por pantalla y cada una inventó su propio encabezado,
 * su propia fila de KPIs y su propio bloque de filtros. El resultado es que la
 * misma idea -"esto es un total", "esto es una sección"- se ve distinta en cada
 * solapa, y adentro de una misma pantalla el mismo número aparece tres veces con
 * tres formas distintas.
 *
 * Acá están las piezas que usan todas. La regla es una sola: cada dato se muestra
 * UNA vez y en UN lugar. Si un número ya está en el encabezado, no va también en
 * una tarjeta y en un chip.
 *
 * Sin ámbar. En este sistema el amarillo no se usa.
 */

// Estilos de las piezas con estados (hover, activo) y ajustes de celular. React
// 19 deduplica un <style> con href + precedence: aunque haya veinte chips en
// pantalla, se inserta una sola vez en el <head>.
const CSS_COMPRAS = `
  .cp-boton, .cp-chip {
    min-height: 34px; display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
    padding: 0 12px; border: 1px solid var(--border); border-radius: 10px;
    background: var(--panel); color: var(--muted);
    font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap;
    transition: background-color .15s, border-color .15s, color .15s, transform .12s;
  }
  .cp-chip { background: transparent; font-weight: 500; }
  .cp-boton:hover:not(:disabled), .cp-chip:hover { border-color: var(--border-2); color: var(--text); }
  .cp-boton.is-activo, .cp-chip.is-activo { font-weight: 600; }
  .cp-boton:active:not(:disabled), .cp-chip:active { transform: scale(.98); }
  .cp-boton:disabled { opacity: .5; cursor: not-allowed; }
  .cp-chip-punto { width: 6px; height: 6px; border-radius: 999px; flex-shrink: 0; opacity: .6; }
  .cp-chip.is-activo .cp-chip-punto { opacity: 1; }
  .cp-chip-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); }

  .cp-barra {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;
    padding: 8px; border: 1px solid var(--border); border-radius: 12px;
    background: var(--topbar-soft);
  }
  .cp-barra-filtros { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }

  @media (max-width: 760px) {
    .cp-boton, .cp-chip { min-height: 38px; }
    /* Los filtros en una sola fila que se desliza: apilados ocupaban cuatro
       renglones antes de llegar a la lista. */
    .cp-barra-filtros {
      flex: 1 1 100%; flex-wrap: nowrap; overflow-x: auto;
      margin: 0 -8px; padding: 0 8px;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 28px), transparent 100%);
      mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 28px), transparent 100%);
    }
    .cp-barra-filtros::-webkit-scrollbar { display: none; }
  }
`;

function EstilosCompras() {
  return <style href="klasea-compras-ui" precedence="default">{CSS_COMPRAS}</style>;
}

/**
 * El encabezado de una pantalla.
 *
 * `resumen` es una sola línea y tiene que ser un dato que cierre: si dice "85
 * pedidos abiertos", todo lo que se muestre abajo tiene que sumar 85. Ese era el
 * problema de la bandeja: el encabezado decía 85, los chips 184 y las columnas
 * 112, y las tres cosas estaban a la vista al mismo tiempo.
 */
export function PageHeader({ eyebrow, title, resumen, acciones = null, Icon = null }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        {Icon && (
          <span style={{ width: 40, height: 40, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 12, background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
            <Icon size={19} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <div style={{ color: C.dim, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{eyebrow}</div>
          )}
          <h2 style={{ margin: eyebrow ? "2px 0 0" : 0, fontSize: 20, color: C.text, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15 }}>{title}</h2>
          {resumen && <div style={{ color: C.dim, fontSize: 13, marginTop: 3 }}>{resumen}</div>}
        </div>
      </div>
      {acciones && <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>{acciones}</div>}
    </header>
  );
}

/** Botón de barra: el mismo en todas las pantallas del módulo. */
export function BarButton({ children, onClick, tone = "neutro", activo = false, title, disabled = false, type = "button" }) {
  const t = tono(tone);
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`cp-boton${activo ? " is-activo" : ""}`}
      style={{
        borderColor: activo ? t.border : undefined,
        background: activo ? t.bg : undefined,
        color: activo ? t.color : undefined,
      }}
    >
      <EstilosCompras />
      {children}
    </button>
  );
}

/**
 * Un filtro con su cuenta.
 *
 * La cuenta va adentro del chip y no en una tarjeta aparte: el número y la
 * acción que lo filtra son la misma cosa, separarlos obliga a leer dos veces.
 */
export function FilterChip({ label, count, tone = "neutro", activo = false, onClick }) {
  const t = tono(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`cp-chip${activo ? " is-activo" : ""}`}
      style={{
        borderColor: activo ? t.border : undefined,
        background: activo ? t.bg : undefined,
        color: activo ? t.color : undefined,
      }}
    >
      <span className="cp-chip-punto" style={{ background: t.color }} />
      {label}
      {count != null && (
        <span className="cp-chip-cuenta" style={{ color: activo ? t.color : undefined }}>{count}</span>
      )}
    </button>
  );
}

/**
 * La barra de herramientas: buscador a la izquierda, filtros a la derecha.
 *
 * `minWidth: 0` en todos los tramos y `flexWrap` en el contenedor. Sin eso, en
 * cuanto hay más de cuatro filtros la barra empuja el ancho de la página y la
 * tabla de abajo se corta -que es lo que pasa hoy en Adicionales y en Caja
 * chica, donde la última columna queda fuera de la pantalla-.
 */
export function Toolbar({ children, buscador = null }) {
  return (
    <div className="cp-barra">
      <EstilosCompras />
      {buscador}
      {children && <div className="cp-barra-filtros">{children}</div>}
    </div>
  );
}

/** El input de búsqueda de la barra, con su lupa. */
export function SearchInput({ value, onChange, placeholder = "Buscar…", Icon }) {
  return (
    <div style={{ position: "relative", flex: "1 1 240px", minWidth: 160 }}>
      {Icon && <Icon size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: 36,
          background: C.bg,
          border: `1px solid ${C.border}`,
          color: C.text,
          borderRadius: 10,
          padding: Icon ? "0 10px 0 32px" : "0 10px",
          outline: "none",
          fontFamily: C.sans,
          fontSize: 13.5,
        }}
      />
    </div>
  );
}

/**
 * Un bloque con título.
 *
 * El contenido va adentro de un contenedor con `minWidth: 0`, que es lo que
 * permite que una tabla ancha scrollee sola en vez de estirar la página.
 */
export function Section({ title, subtitle, count, tone = "neutro", Icon = null, acciones = null, children, dense = false }) {
  const t = tono(tone);
  return (
    <section style={{ display: "grid", gap: dense ? 7 : 10, minWidth: 0 }}>
      {(title || acciones) && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
          {Icon && <Icon size={14} color={t.color} style={{ flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: C.text, fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em" }}>{title}</span>
              {count != null && (
                <span style={{ fontFamily: C.mono, fontSize: 11, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 999, padding: "1px 7px" }}>{count}</span>
              )}
            </div>
            {subtitle && <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {acciones && <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{acciones}</div>}
        </div>
      )}
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

/** Una tarjeta contenedora, para envolver tablas y formularios. */
export function Panel({ children, padding = 12, tone = null }) {
  const t = tone ? tono(tone) : null;
  return (
    <div style={{
      border: `1px solid ${t ? t.border : C.border}`,
      background: t ? t.bg : C.panel,
      borderRadius: 12,
      padding,
      minWidth: 0,
    }}>
      {children}
    </div>
  );
}

/** Envoltorio de tabla: scrollea solo, nunca empuja la página. */
export function TableScroll({ children, maxHeight = null }) {
  return (
    <div style={{
      minWidth: 0,
      overflowX: "auto",
      overflowY: maxHeight ? "auto" : "visible",
      maxHeight: maxHeight || "none",
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      background: C.panel,
    }}>
      {children}
    </div>
  );
}

/** Estado vacío. Dice qué pasó y qué hacer, no sólo "no hay nada". */
export function Empty({ Icon = null, title, hint = null, accion = null, minHeight = 180 }) {
  return (
    <div style={{
      border: `1px dashed ${C.border}`,
      background: C.panel,
      borderRadius: 12,
      minHeight,
      display: "grid",
      placeItems: "center",
      padding: 22,
      textAlign: "center",
    }}>
      <div style={{ display: "grid", justifyItems: "center", gap: 8, maxWidth: 380 }}>
        {Icon && <Icon size={26} color={C.dim} strokeWidth={1.6} />}
        <div style={{ color: C.text, fontSize: 15, fontWeight: 650 }}>{title}</div>
        {hint && <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.5 }}>{hint}</div>}
        {accion}
      </div>
    </div>
  );
}

/**
 * Un número con su etiqueta, en línea.
 *
 * Reemplaza a las bandas de tarjetas grandes que ocupaban 90px de alto para
 * mostrar cuatro cifras -y que en Adicionales son seis, casi todas en cero-.
 * Un total es un dato de referencia, no el contenido de la pantalla.
 */
export function StatStrip({ items = [] }) {
  const visibles = items.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      flexWrap: "wrap",
      border: `1px solid ${C.border}`,
      background: C.panel,
      borderRadius: 11,
      padding: "9px 4px",
      minWidth: 0,
    }}>
      {visibles.map((item, index) => (
        <div key={item.label} style={{
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          padding: "0 14px",
          borderLeft: index ? `1px solid ${C.border}` : "none",
          minWidth: 0,
        }}>
          <span style={{ color: C.dim, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
          <span style={{
            fontFamily: C.mono,
            fontSize: 16,
            fontWeight: 650,
            color: item.tone ? tono(item.tone).color : C.text,
            whiteSpace: "nowrap",
          }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Etiqueta chica de estado. */
export function Tag({ children, tone = "neutro", solid = false }) {
  const t = tono(tone);
  return (
    <span style={{
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      padding: "2px 7px",
      background: solid ? t.color : t.bg,
      border: `1px solid ${t.border}`,
      color: solid ? C.bg : t.color,
      fontSize: 10.5,
      fontWeight: 650,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
