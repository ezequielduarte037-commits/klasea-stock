import { useEffect, useRef, useState } from "react";
import useAlertas from "@/hooks/useAlertas";
import { hasAdminAccess } from "@/lib/permissions";
import { C } from "@/theme";

const GRAVEDAD = {
  critical: { color: C.red, icon: "🔴" },
  warning:  { color: C.amber, icon: "⚠️" },
  info:     { color: C.blue, icon: "ℹ️" },
};

export default function NotificacionesBell({ profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { alertas, stats, resolverAlerta } = useAlertas();

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isAdmin = hasAdminAccess(profile);
  const total   = stats.total;
  const criticas = stats.criticas;

  const S = {
    wrapper: {
      position: "fixed",
      top: 16,
      right: 20,
      zIndex: 9000,
    },
    bell: {
      position: "relative",
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: open ? C.panel2 : C.panel,
      border: `1px solid ${criticas > 0 ? C.redB : C.border}`,
      backdropFilter: "var(--glass-filter)",
      WebkitBackdropFilter: "var(--glass-filter)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      transition: "all 0.2s",
      boxShadow: criticas > 0 ? "0 0 16px var(--red-soft)" : "none",
    },
    badge: {
      position: "absolute",
      top: -3,
      right: -3,
      minWidth: 16,
      height: 16,
      borderRadius: 99,
      background: criticas > 0 ? C.red : C.amber,
      color: "#000",
      fontSize: 10,
      fontWeight: 900,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 4px",
      border: `1.5px solid ${C.bg}`,
    },
    panel: {
      position: "absolute",
      top: 46,
      right: 0,
      width: 340,
      maxHeight: 480,
      overflowY: "auto",
      background: C.panelSolid,
      backdropFilter: "var(--glass-filter)",
      WebkitBackdropFilter: "var(--glass-filter)",
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      boxShadow: "0 20px 60px var(--shadow-strong)",
    },
    panelHeader: {
      padding: "14px 16px 12px",
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    panelTitle: {
      color: C.text,
      fontFamily: "Montserrat, system-ui",
      fontWeight: 800,
      fontSize: 14,
      letterSpacing: 0.5,
    },
    statRow: {
      display: "flex",
      gap: 8,
    },
    statPill: (color) => ({
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 7px",
      borderRadius: 6,
      background: `${color}18`,
      color,
      border: `1px solid ${color}33`,
    }),
    empty: {
      padding: "30px 16px",
      textAlign: "center",
      fontSize: 13,
      opacity: 0.4,
      color: C.text,
    },
    alertItem: () => {
      return {
        padding: "10px 16px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        transition: "background 0.15s",
      };
    },
    alertMsg: {
      flex: 1,
      fontSize: 13,
      lineHeight: 1.4,
      color: C.text,
    },
    alertMeta: {
      fontSize: 11,
      opacity: 0.4,
      marginTop: 3,
    },
    resolveBtn: {
      fontSize: 11,
      color: C.green,
      background: "transparent",
      border: `1px solid ${C.greenB}`,
      borderRadius: 6,
      padding: "2px 7px",
      cursor: "pointer",
      flexShrink: 0,
      marginTop: 2,
    },
    footer: {
      padding: "10px 16px",
      borderTop: `1px solid ${C.border}`,
      textAlign: "center",
      fontSize: 12,
      color: C.dim,
    },
  };

  return (
    <div style={S.wrapper} ref={ref}>
      <button style={S.bell} onClick={() => setOpen(o => !o)}>
        🔔
        {total > 0 && (
          <div style={S.badge}>
            {total > 99 ? "99+" : total}
          </div>
        )}
      </button>

      {open && (
        <div style={S.panel}>
          {/* Header */}
          <div style={S.panelHeader}>
            <span style={S.panelTitle}>Alertas de producción</span>
            <div style={S.statRow}>
              {criticas > 0 && <span style={S.statPill(C.red)}>{criticas} crítica{criticas > 1 ? "s" : ""}</span>}
              {stats.warnings > 0 && <span style={S.statPill(C.amber)}>{stats.warnings} aviso{stats.warnings > 1 ? "s" : ""}</span>}
            </div>
          </div>

          {/* Lista */}
          {alertas.length === 0 ? (
            <div style={S.empty}>✅ Sin alertas activas</div>
          ) : (
            alertas.slice(0, 15).map(a => {
              const g = GRAVEDAD[a.gravedad] ?? GRAVEDAD.info;
              return (
                <div key={a.id} style={S.alertItem(a.gravedad)}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{g.icon}</span>
                  <div style={S.alertMsg}>
                    <div>{a.mensaje}</div>
                    <div style={S.alertMeta}>
                      {a.produccion_obras?.codigo && <span>🏗 {a.produccion_obras.codigo} · </span>}
                      {new Date(a.created_at).toLocaleDateString("es-AR")}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      style={S.resolveBtn}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await resolverAlerta(a.id, profile?.username ?? "usuario");
                      }}>
                      ✓
                    </button>
                  )}
                </div>
              );
            })
          )}

          {alertas.length > 15 && (
            <div style={S.footer}>
              +{alertas.length - 15} alertas más
            </div>
          )}
        </div>
      )}
    </div>
  );
}
