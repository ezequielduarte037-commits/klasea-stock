// Módulo RRHH — presentismo del astillero a partir del fichero Hikvision.
// Pestañas: Presentismo · Horas extras · Empleados · Importar · Dashboard.
import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import { C } from "@/theme";
import { fetchConfig, fetchContratistas, fetchEmpleados, isMissingTable } from "./api";
import DashboardTab from "./DashboardTab";
import EmpleadosTab from "./EmpleadosTab";
import ExtrasTab from "./ExtrasTab";
import ImportarTab from "./ImportarTab";
import PresentismoTab from "./PresentismoTab";
import { Cargando, ErrorBox, SetupPendiente } from "./ui";

const TABS = [
  { key: "presentismo", label: "Presentismo" },
  { key: "extras",      label: "Horas extras" },
  { key: "empleados",   label: "Empleados" },
  { key: "importar",    label: "Importar" },
  { key: "dashboard",   label: "Dashboard" },
];

export default function RrhhScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const esAdmin = hasAdminAccess(profile) || profile?.role === "admin" || profile?.role === "rrhh";

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
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }
        input:focus, select:focus { border-color: rgba(59,130,246,0.35) !important; }
        select option { background: #0f0f12; color: var(--muted); }
      `}</style>

      <Sidebar profile={profile} signOut={signOut} />

      <div style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ padding: isMobile ? "16px 14px 50px 14px" : "26px 30px 60px" }}>
          {/* Header */}
          <div style={{ marginBottom: 18, paddingLeft: isMobile ? 40 : 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>RRHH · Presentismo</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
              Asistencia, horas y grupos a partir del fichero Hikvision
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
              <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${C.b0}`, paddingBottom: 0 }}>
                {TABS.map(t => {
                  const on = tab === t.key;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                      padding: "9px 16px", cursor: "pointer", fontSize: 13, fontFamily: C.sans,
                      fontWeight: on ? 700 : 500, color: on ? C.t0 : C.t2,
                      background: "transparent", border: "none",
                      borderBottom: `2px solid ${on ? "#60a5fa" : "transparent"}`,
                      marginBottom: -1, transition: "all .15s",
                    }}>
                      {t.label}
                      {t.key === "empleados" && empleados.some(e => e.grupo === "sin_asignar" && e.activo !== false) && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171" }}>●</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {tab === "presentismo" && <PresentismoTab empleados={empleados} contratistas={contratistas} config={config} />}
              {tab === "extras" && <ExtrasTab empleados={empleados} contratistas={contratistas} config={config} onConfigChange={cargar} esAdmin={esAdmin} />}
              {tab === "empleados" && <EmpleadosTab empleados={empleados} contratistas={contratistas} onChanged={cargar} esAdmin={esAdmin} />}
              {tab === "importar" && <ImportarTab empleados={empleados} onImported={cargar} />}
              {tab === "dashboard" && <DashboardTab empleados={empleados} config={config} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
