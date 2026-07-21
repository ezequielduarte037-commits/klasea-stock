// Módulo RRHH — presentismo del astillero a partir del fichero Hikvision.
// Pestañas: Presentismo · Horas extras · Empleados · Importar · Dashboard.
import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarCheck2, Clock3, Upload, UsersRound } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import { fetchConfig, fetchContratistas, fetchEmpleados, isMissingTable } from "./api";
import DashboardTab from "./DashboardTab";
import EmpleadosTab from "./EmpleadosTab";
import ExtrasTab from "./ExtrasTab";
import ImportarTab from "./ImportarTab";
import PresentismoTab from "./PresentismoTab";
import { Cargando, ErrorBox, SetupPendiente } from "./ui";

const TABS = [
  { key: "presentismo", label: "Presentismo", icon: CalendarCheck2 },
  { key: "extras",      label: "Horas extras", icon: Clock3 },
  { key: "empleados",   label: "Empleados", icon: UsersRound },
  { key: "importar",    label: "Importar", icon: Upload },
  { key: "dashboard",   label: "Dashboard", icon: BarChart3 },
];

export default function RrhhScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const esAdmin = profile?.is_admin || profile?.role === "admin" || profile?.role === "rrhh";

  const [tab, setTab] = useState("presentismo");
  const [empleados, setEmpleados] = useState(null);
  const [contratistas, setContratistas] = useState(null);
  const [config, setConfig] = useState(null);
  const [setupPendiente, setSetupPendiente] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [emps, contrs, cfg] = await Promise.all([fetchEmpleados(), fetchContratistas(), fetchConfig()]);
      setEmpleados(emps); setContratistas(contrs); setConfig(cfg);
      setSetupPendiente(false);
    } catch (e) {
      if (isMissingTable(e)) setSetupPendiente(true);
      else setError(e);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const listo = empleados != null && contratistas != null && config != null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t0, fontFamily: C.sans, display: "flex", overflow: "hidden" }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--panel-2); border-radius: 99px; }
        input:focus, select:focus { border-color: rgba(59,130,246,0.35) !important; }
        select option { background: var(--panel-solid); color: var(--muted); }
        .rrhh-tab:hover { background: var(--panel-2) !important; color: var(--text) !important; }
        .rrhh-tab:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
      `}</style>

      <Sidebar profile={profile} signOut={signOut} />

      <div style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ width: "100%", maxWidth: 1760, margin: "0 auto", padding: isMobile ? "14px 12px 50px 12px" : "20px 24px 60px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14, paddingLeft: isMobile ? 38 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, flexShrink: 0 }}>
                <CalendarCheck2 size={18} strokeWidth={1.8} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 750, color: C.t0, lineHeight: 1.1 }}>Recursos humanos</div>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Asistencia y control horario</div>
              </div>
            </div>
          </div>

          {setupPendiente ? (
            <SetupPendiente onRetry={cargar} />
          ) : error ? (
            <ErrorBox error={error} onRetry={cargar} />
          ) : !listo ? (
            <Cargando />
          ) : (
            <>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 3, marginBottom: 16, padding: 4, width: "fit-content", maxWidth: "100%", overflowX: "auto", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10 }}>
                {TABS.filter(t => esAdmin || ["presentismo", "extras", "dashboard"].includes(t.key)).map(t => {
                  const on = tab === t.key;
                  const Icon = t.icon;
                  return (
                    <button className="rrhh-tab" key={t.key} onClick={() => setTab(t.key)} style={{
                      display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", cursor: "pointer", fontSize: 12, fontFamily: C.sans,
                      fontWeight: on ? 700 : 500, color: on ? C.t0 : C.t2,
                      background: on ? C.panelSolid : "transparent", border: `1px solid ${on ? C.b1 : "transparent"}`,
                      borderRadius: 7, boxShadow: on ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                      transition: "background .16s ease, color .16s ease, border-color .16s ease", whiteSpace: "nowrap",
                    }}>
                      <Icon size={14} strokeWidth={1.8} />
                      {t.label}
                      {t.key === "empleados" && empleados.some(e => e.grupo === "sin_asignar" && e.activo !== false) && (
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {tab === "presentismo" && <PresentismoTab empleados={empleados} contratistas={contratistas} config={config} esAdmin={esAdmin} onChanged={cargar} />}
              {tab === "extras" && <ExtrasTab empleados={empleados} contratistas={contratistas} config={config} onConfigChange={cargar} esAdmin={esAdmin} />}
              {tab === "empleados" && <EmpleadosTab empleados={empleados} contratistas={contratistas} onChanged={cargar} esAdmin={esAdmin} />}
              {tab === "importar" && <ImportarTab empleados={empleados} onImported={cargar} />}
              {tab === "dashboard" && <DashboardTab empleados={empleados} config={config} onNavigate={setTab} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
