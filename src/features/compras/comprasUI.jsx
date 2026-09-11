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
          <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 9, background: C.panel, border: `1px solid ${C.border}`, color: C.blue }}>
            <Icon size={17} />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <div style={{ color: C.dim, fontSize: 9.5, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 850 }}>{eyebrow}</div>
          )}
          <h2 style={{ margin: eyebrow ? "3px 0 0" : 0, fontSize: 19, color: C.text, fontWeight: 900, lineHeight: 1.15 }}>{title}</h2>
          {resumen && <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>{resumen}</div>}
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
      style={{
        minHeight: 34,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0 11px",
        borderRadius: 9,
        border: `1px solid ${activo ? t.border : C.border}`,
        background: activo ? t.bg : C.panel,
        color: activo ? t.color : C.muted,
        fontFamily: C.sans,
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
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
      style={{
        minHeight: 34,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "0 11px",
        borderRadius: 9,
        border: `1px solid ${activo ? t.border : C.border}`,
        background: activo ? t.bg : "transparent",
        color: activo ? t.color : C.muted,
        fontFamily: C.sans,
        fontSize: 12,
        fontWeight: 850,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: t.color, opacity: activo ? 1 : 0.55, flexShrink: 0 }} />
      {label}
      {count != null && (
        <span style={{ fontFamily: C.mono, fontSize: 11, color: activo ? t.color : C.dim }}>{count}</span>
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
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      minWidth: 0,
      border: `1px solid ${C.border}`,
      background: C.topbarSoft,
      borderRadius: 11,
      padding: 9,
    }}>
      {buscador}
      {children}
    </div>
  );
}

/** El input de búsqueda de la barra, con su lupa. */
export function SearchInput({ value, onChange, placeholder = "Buscar…", Icon }) {
  return (
    <div style={{ position: "relative", flex: "1 1 240px", minWidth: 160 }}>
      {Icon && <Icon size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: 34,
          background: C.bg,
          border: `1px solid ${C.border}`,
          color: C.text,
          borderRadius: 9,
          padding: Icon ? "0 10px 0 30px" : "0 10px",
          outline: "none",
          fontFamily: C.sans,
          fontSize: 12.5,
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
              <span style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>{title}</span>
              {count != null && (
                <span style={{ fontFamily: C.mono, fontSize: 11, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 999, padding: "1px 7px" }}>{count}</span>
              )}
            </div>
            {subtitle && <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
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
        {Icon && <Icon size={24} color={C.dim} />}
        <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{title}</div>
        {hint && <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.5 }}>{hint}</div>}
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
          <span style={{ color: C.dim, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 850, whiteSpace: "nowrap" }}>{item.label}</span>
          <span style={{
            fontFamily: C.mono,
            fontSize: 15,
            fontWeight: 900,
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
      fontSize: 9.5,
      fontWeight: 900,
      letterSpacing: 0.2,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
