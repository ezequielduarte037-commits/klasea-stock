// src/components/ui/motion.jsx
// ─────────────────────────────────────────────────────────────────
// Reusable micro-interaction & polish utilities — theme-aware.
// Every colour comes from C (CSS custom-props). No hardcoded values.
// Designed for modest PCs: no backdrop-filter on lists, short
// animations (120-200 ms), entrance/hover only — never per-render.
// ─────────────────────────────────────────────────────────────────

import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { C } from "@/theme";
import { useReducedMotion } from "./useReducedMotion";

// ── Skeletons already live in ./Skeleton.jsx — re-exported here
//    so consumers can import everything from one place. ───────────
export {
  Skeleton,
  SkeletonStyles,
  CardSkeleton as SkeletonCard,
  RowSkeleton  as SkeletonRow,
} from "./Skeleton";

/* ═══════════════════════════════════════════════════════════════════
   Global CSS — injected once on first import (idempotent).
   Includes: @keyframes ui-fadeIn, .ui-press micro-interaction.
   ═══════════════════════════════════════════════════════════════════ */

const STYLE_ID = "ui-motion-css";
const EASE = "cubic-bezier(.22,1,.36,1)";

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes ui-fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ui-press {
  transition: transform 150ms ${EASE},
              box-shadow 150ms ${EASE},
              border-color 150ms;
  cursor: pointer;
  user-select: none;
}
.ui-press:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--shadow);
}
.ui-press:active {
  transform: translateY(0) scale(.97);
  box-shadow: none;
}
/* DrawnCheck: el círculo se cierra y después se dibuja el tilde. */
.ui-check-circulo {
  stroke-dasharray: 63;
  animation: ui-trazo-63 .42s cubic-bezier(.65,0,.35,1) var(--ui-check-delay, 0ms) backwards;
}
.ui-check-tilde {
  stroke-dasharray: 14;
  animation: ui-trazo-14 .28s cubic-bezier(.65,0,.35,1) calc(var(--ui-check-delay, 0ms) + 260ms) backwards;
}
@keyframes ui-trazo-63 { from { stroke-dashoffset: 63; } }
@keyframes ui-trazo-14 { from { stroke-dashoffset: 14; } }
`;
  document.head.appendChild(el);
}

/* ═══════════════════════════════════════════════════════════════════
   <FadeIn delay={ms} duration={ms}>
   Single-shot entrance wrapper. Animates children in once on mount
   with a subtle slide-up + fade. No loop, no re-trigger on render.

   Usage:
     <FadeIn delay={60}>
       <MyCard />
     </FadeIn>
   ═══════════════════════════════════════════════════════════════════ */

export function FadeIn({ children, delay = 0, duration = 180, style, className }) {
  return (
    <div
      className={className}
      style={{
        animation: `ui-fadeIn ${duration}ms ${EASE} ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   <EmptyState icon={LucideIcon} title subtitle action color />

   A polished, centered placeholder for when a list/view has no data.
   Pass a lucide-react icon component, a title, an optional subtitle,
   and an optional action node (e.g. a button). The accent `color`
   defaults to C.muted and tints the icon box.

   Usage:
     <EmptyState
       icon={ShoppingCart}
       title="No hay pedidos"
       subtitle="Cuando crees uno, aparecerá acá."
       action={<button onClick={crear}>Crear pedido</button>}
       color={C.cyan}
     />
   ═══════════════════════════════════════════════════════════════════ */

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  color = C.muted,
  style,
}) {
  return (
    <div
      style={{
        minHeight: 220,
        display: "grid",
        placeItems: "center",
        border: `1px dashed ${C.border}`,
        borderRadius: 12,
        color: C.dim,
        fontSize: 13,
        textAlign: "center",
        padding: 28,
        animation: `ui-fadeIn 200ms ${EASE} both`,
        ...style,
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 10, maxWidth: 340 }}>
        {Icon && (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: `${color}14`,
              border: `1px solid ${color}28`,
              color,
            }}
          >
            <Icon size={20} />
          </div>
        )}
        {title && (
          <div
            style={{
              color: C.muted,
              fontWeight: 700,
              fontSize: 14,
              fontFamily: C.sans,
            }}
          >
            {title}
          </div>
        )}
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: C.dim,
              lineHeight: 1.5,
              fontFamily: C.sans,
            }}
          >
            {subtitle}
          </div>
        )}
        {action && <div style={{ marginTop: 4 }}>{action}</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   <AnimatedNumber value format duration />

   Cuenta desde el valor anterior hasta el nuevo. Reemplaza las copias
   que había en Home, Obras, Admin, Laminación, Maderas, Semáforo y el
   panel del cliente: aquellas hacían setState en cada cuadro y React
   redibujaba el componente 60 veces por segundo mientras contaban. Esta
   escribe el texto directo en el DOM.

   format recibe el número (sin redondear) y devuelve el texto; por
   defecto, entero con separador de miles es-AR.
   ═══════════════════════════════════════════════════════════════════ */

const formatoEntero = (n) => Math.round(n).toLocaleString("es-AR");

export function AnimatedNumber({ value, format = formatoEntero, duration = 800, className, style }) {
  const ref = useRef(null);
  const anterior = useRef(0);
  const reducido = useReducedMotion();
  const destino = Number(value) || 0;
  const formatear = useEffectEvent((n) => format(n));

  // Layout y no Effect: el primer valor se escribe antes de pintar, así no
  // aparece el número final un cuadro y después arranca a contar desde 0.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const desde = anterior.current;
    anterior.current = destino;
    if (reducido || desde === destino) {
      el.textContent = formatear(destino);
      return undefined;
    }
    el.textContent = formatear(desde);
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora) => {
      const p = Math.min(1, (ahora - inicio) / duration);
      el.textContent = formatear(desde + (destino - desde) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) cuadro = window.requestAnimationFrame(paso);
    };
    cuadro = window.requestAnimationFrame(paso);
    return () => {
      window.cancelAnimationFrame(cuadro);
      el.textContent = formatear(destino);
    };
  }, [destino, duration, reducido]);

  return <span ref={ref} className={className} style={style} />;
}

/* ═══════════════════════════════════════════════════════════════════
   <DrawnCheck size color delay />

   Círculo que se cierra y tilde que se dibuja. Para confirmar que algo
   salió bien (toasts, guardados, firmas).
   ═══════════════════════════════════════════════════════════════════ */

export function DrawnCheck({ size = 18, color = "currentColor", delay = 0, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, "--ui-check-delay": `${delay}ms`, ...style }}
    >
      <circle className="ui-check-circulo" cx="12" cy="12" r="10" stroke={color} strokeWidth="2" transform="rotate(-90 12 12)" />
      <path className="ui-check-tilde" d="M7.5 12.4l3 3 6-6.4" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
