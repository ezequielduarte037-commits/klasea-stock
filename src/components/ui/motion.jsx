// src/components/ui/motion.jsx
// ─────────────────────────────────────────────────────────────────
// Reusable micro-interaction & polish utilities — theme-aware.
// Every colour comes from C (CSS custom-props). No hardcoded values.
// Designed for modest PCs: no backdrop-filter on lists, short
// animations (120-200 ms), entrance/hover only — never per-render.
// ─────────────────────────────────────────────────────────────────

import { C } from "@/theme";

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
`;
  document.head.appendChild(el);
}

/* ═══════════════════════════════════════════════════════════════════
   hoverable(isHovered, accentColor?) → inline-style object

   Merges into your existing style. Provides a subtle lift + glow
   on hover, optionally tinted to an accent colour from C.

   Usage:
     const [hov, setHov] = useState(false);
     <div
       onMouseEnter={() => setHov(true)}
       onMouseLeave={() => setHov(false)}
       style={{ ...hoverable(hov, C.blue), background: C.panel }}
     />
   ═══════════════════════════════════════════════════════════════════ */

export function hoverable(hov, color) {
  const base = {
    transition: `transform 160ms ${EASE}, box-shadow 160ms ${EASE}, border-color 160ms`,
  };
  if (!hov) return base;
  return {
    ...base,
    transform: "translateY(-2px)",
    boxShadow: color
      ? `0 8px 24px var(--shadow), 0 0 0 1px ${color}22`
      : "0 8px 24px var(--shadow)",
    ...(color ? { borderColor: `${color}55` } : {}),
  };
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
       color={C.amber}
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
