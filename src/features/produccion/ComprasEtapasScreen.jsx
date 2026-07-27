import { useState } from "react";
import { ClipboardList, LayoutTemplate, Layers, Ship } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import ObraComprasTab from "@/features/produccion/ObraComprasTab";
import PedidosTab from "@/features/produccion/PedidosTab";
import PlantillaComprasTab from "@/features/produccion/PlantillaComprasTab";
import { GLOW_VIOLET, GRAD_VIOLET, tint } from "@/features/produccion/comprasTokens";
import BotonAyuda from "@/features/ayuda/BotonAyuda";

// ─────────────────────────────────────────────────────────────────────────────
// Compras por Etapa.
//
//   Compras por obra → las tandas de compra de cada casco, con sus materiales
//   Plantillas       → las tandas típicas de cada modelo, para copiar
//   Pedidos          → seguimiento de lo ya pedido
//
// Compras, técnica, oficina y admin trabajan sobre las mismas etapas y pueden
// editarlas. Cada cambio queda registrado por trigger en compras_auditoria.
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "obra", label: "Compras por obra", corto: "Obra", icon: Ship },
  { id: "plantillas", label: "Plantillas", corto: "Plantillas", icon: LayoutTemplate },
  { id: "pedidos", label: "Pedidos", corto: "Pedidos", icon: ClipboardList },
];

const SUBTITULOS = {
  obra: "Las tandas de compra de cada obra, con sus materiales adentro.",
  plantillas: "Las tandas típicas de cada modelo, para copiarlas a las obras nuevas.",
  pedidos: "Pedidos generados desde las etapas de compra.",
};

export default function ComprasEtapasScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [tab, setTab] = useState("obra");
  // Al generar un pedido desde una etapa, la pestaña de pedidos se refresca sola.
  const [pulsoPedidos, setPulsoPedidos] = useState(0);

  const pad = isMobile ? 14 : 24;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: C.bg, color: C.t0, fontFamily: C.sans }}>
      <style>{`
        .spin{animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes ce-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .ce-surface{background:var(--panel-solid);border:1px solid var(--border);border-radius:14px;box-shadow:0 1px 2px var(--shadow);animation:ce-fade .24s ease both}
        .ce-etapa{transition:transform .16s cubic-bezier(.4,0,.2,1),box-shadow .16s ease,border-color .16s ease}
        .ce-etapa:hover{transform:translateX(2px);border-color:var(--border-2)}
        .ce-cta{transition:transform .16s ease,filter .16s ease}
        .ce-cta:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
        .ce-cta:active:not(:disabled){transform:translateY(0);filter:brightness(.97)}
        .ce-seg{transition:all .2s cubic-bezier(.4,0,.2,1)}
        .ce-seg:hover{color:var(--text)}
        .ce-row{background:var(--panel);transition:background .14s ease,border-color .14s ease}
        .ce-row:hover{background:var(--panel-2)}
        .me-row:hover{background:var(--panel)}
        .ce-ghost:hover:not(:disabled){background:var(--panel-2);color:var(--text)}
        .ce-chip{transition:background .14s ease,border-color .14s ease,color .14s ease}
        .ce-chip:hover:not(:disabled){border-color:var(--border-2);color:var(--text)}
        .ce-dashed:hover{color:var(--violet);border-color:var(--violet-border)}
        button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
      `}</style>

      <div style={{ width: isMobile ? 0 : 280, height: "100vh", flexShrink: 0 }}>
        <Sidebar profile={profile} signOut={signOut} />
      </div>

      <main style={{ position: "relative", minWidth: 0, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* glow ambiental sutil (opacidad baja para no lavar el modo claro) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(1000px 300px at 18% -12%, ${tint("#8b5cf6", 8)}, transparent 70%)` }} />

        <header style={{ position: "relative", padding: `${isMobile ? 13 : 16}px ${pad}px 0`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: GRAD_VIOLET, color: "#fff", boxShadow: GLOW_VIOLET }}>
              <Layers size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 950, color: C.text, letterSpacing: -0.2 }}>Compras por etapa</h1>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 1 }}>{SUBTITULOS[tab]}</div>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%" }}>
              <BotonAyuda tourId="compras-etapa" profile={profile} onBeforeStart={() => setTab("obra")} />
              <div
                role="tablist"
                data-tour="compras-tabs"
                style={{ display: "inline-flex", gap: 4, padding: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, maxWidth: "100%", overflowX: "auto" }}
              >
                {TABS.map((t) => {
                  const active = tab === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.id)}
                      className="ce-seg"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 9,
                        border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap",
                        fontFamily: C.sans,
                        background: active ? C.panelSolid : "transparent",
                        color: active ? C.violet : C.dim,
                        boxShadow: active ? "0 2px 6px -2px var(--shadow)" : "none",
                      }}
                    >
                      <Icon size={14} /> {isMobile ? t.corto : t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        <div style={{ position: "relative", flex: 1, minHeight: 0, padding: `14px ${pad}px ${pad}px` }}>
          {tab === "obra" && (
            <ObraComprasTab isMobile={isMobile} toast={toast} onPedidoGenerado={() => setPulsoPedidos((n) => n + 1)} />
          )}
          {tab === "plantillas" && <PlantillaComprasTab isMobile={isMobile} toast={toast} />}
          {tab === "pedidos" && <PedidosTab toast={toast} recargaExterna={pulsoPedidos} />}
        </div>
      </main>
    </div>
  );
}
