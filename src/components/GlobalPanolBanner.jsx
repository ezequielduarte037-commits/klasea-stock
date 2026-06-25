import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PackageOpen, ChevronRight, X, Bell } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Global floating notification banner for pañol roles.
// Shows a persistent (but dismissable) reminder when there are envíos
// pending reception.  Visible on ALL screens.
// Clicking navigates to /recepcion-panol.
// Auto-refreshes every 5 min; snoozes 30 min on dismiss.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES_PANOL = new Set(["panol", "admin", "oficina", "tecnica"]);
const SNOOZE_KEY = "klasea-panol-snooze";
const SNOOZE_MS = 30 * 60 * 1000; // 30 min snooze after dismiss
const POLL_MS = 5 * 60 * 1000;    // refresh every 5 min

function isSnoozed() {
  try {
    const ts = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return Date.now() < ts;
  } catch { return false; }
}

function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch {}
}

export default function GlobalPanolBanner({ profile }) {
  const [count, setCount]       = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [entering, setEntering] = useState(false);
  const [hovered, setHovered]   = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const intervalRef = useRef(null);

  const role = profile?.role;
  const isAdmin = profile?.is_admin;
  const shouldShow = useMemo(
    () => ROLES_PANOL.has(role) || isAdmin,
    [role, isAdmin],
  );

  // Already on the recepcion screen → hide
  const onRecepcionPage = location.pathname === "/recepcion-panol";

  const fetchCount = useCallback(async () => {
    if (!shouldShow) return;
    try {
      // Count envios that are NOT closed/received/cancelled (= need attention)
      const { count: c, error } = await supabase
        .from("panol_envios")
        .select("id", { count: "exact", head: true })
        .not("estado", "in", '("recibido","cerrado","cancelado")');
      if (!error && c != null) setCount(c);
    } catch { /* silent */ }
  }, [shouldShow]);

  useEffect(() => {
    fetchCount();
    intervalRef.current = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchCount]);

  // Reset dismiss when navigating away from recepcion
  useEffect(() => {
    if (!onRecepcionPage) setDismissed(false);
  }, [onRecepcionPage]);

  // Animate entrance
  useEffect(() => {
    if (count > 0 && !dismissed && !onRecepcionPage && !isSnoozed()) {
      const t = setTimeout(() => setEntering(true), 100);
      return () => clearTimeout(t);
    }
    setEntering(false);
  }, [count, dismissed, onRecepcionPage]);

  if (!shouldShow || count === 0 || onRecepcionPage || dismissed || isSnoozed()) return null;

  function handleDismiss(e) {
    e.stopPropagation();
    setEntering(false);
    snooze();
    setTimeout(() => setDismissed(true), 350);
  }

  function handleClick() {
    navigate("/recepcion-panol");
  }

  const plural = count === 1 ? "envío pendiente" : "envíos pendientes";

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9500,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px 12px 14px",
        borderRadius: 16,
        cursor: "pointer",
        // Glassmorphism
        background: "rgba(14, 165, 233, 0.12)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        border: "1px solid rgba(14, 165, 233, 0.25)",
        boxShadow: hovered
          ? "0 8px 40px rgba(14, 165, 233, 0.35), 0 0 0 1px rgba(14, 165, 233, 0.20)"
          : "0 8px 32px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(14, 165, 233, 0.10)",
        // Animation
        opacity: entering ? 1 : 0,
        transform: entering
          ? (hovered ? "translateY(-2px) scale(1.02)" : "translateY(0)")
          : "translateY(20px)",
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        maxWidth: 420,
        userSelect: "none",
      }}
    >
      {/* Pulsing icon */}
      <div style={{
        position: "relative",
        width: 38,
        height: 38,
        borderRadius: 12,
        background: "rgba(14, 165, 233, 0.18)",
        border: "1px solid rgba(14, 165, 233, 0.30)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}>
        <PackageOpen size={18} color="#38bdf8" />
        {/* Badge */}
        <div style={{
          position: "absolute",
          top: -5,
          right: -5,
          minWidth: 18,
          height: 18,
          borderRadius: 99,
          background: "#ef4444",
          color: "#fff",
          fontSize: 10,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 5px",
          border: "2px solid rgba(15, 23, 42, 0.8)",
          animation: "panolPulse 2s ease-in-out infinite",
        }}>
          {count > 99 ? "99+" : count}
        </div>
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#e2e8f0",
          fontFamily: "'Outfit', system-ui",
          letterSpacing: 0.2,
          lineHeight: 1.2,
        }}>
          Recepción Pañol
        </div>
        <div style={{
          fontSize: 11,
          color: "#94a3b8",
          marginTop: 2,
          fontFamily: "'Outfit', system-ui",
          lineHeight: 1.3,
        }}>
          <span style={{ color: "#38bdf8", fontWeight: 700, fontFamily: C.mono }}>{count}</span>
          {" "}{plural} de recepción
        </div>
      </div>

      {/* Arrow / CTA */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        <span style={{
          fontSize: 10,
          color: "#64748b",
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontFamily: "'Outfit', system-ui",
        }}>
          Ver
        </span>
        <ChevronRight size={14} color="#64748b" />
      </div>

      {/* Dismiss X */}
      <button
        onClick={handleDismiss}
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 20,
          height: 20,
          borderRadius: 99,
          background: "#334155",
          border: "1px solid #475569",
          color: "#94a3b8",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s",
        }}
      >
        <X size={10} />
      </button>

      {/* Keyframe animation injected once */}
      <style>{`
        @keyframes panolPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
