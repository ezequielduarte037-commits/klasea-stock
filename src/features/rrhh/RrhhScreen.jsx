// Módulo RRHH — presentismo del astillero a partir del fichero Hikvision.
// Pestañas: Presentismo · Horas extras · Empleados · Importar · Dashboard.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Briefcase, CalendarCheck2, Clock3, Upload, UsersRound } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { canManageOficiosYObras, canManagePresentismo, canViewEmpleados } from "@/lib/permissions";
import PageHeader from "@/components/ui/PageHeader";
import { fetchConfig, fetchContratistas, fetchEmpleados, isMissingTable, saveConfig } from "./api";
import { PREFIJO_CIERRE } from "./feriados";
import DashboardTab from "./DashboardTab";
import EmpleadosTab from "./EmpleadosTab";
import ExtrasTab from "./ExtrasTab";
import ImportarTab from "./ImportarTab";
import OficiosObrasTab from "./OficiosObrasTab";
import PresentismoTab from "./PresentismoTab";
import { Cargando, ErrorBox, SetupPendiente } from "./ui";
import { puedeGestionarAltas } from "./altas";

const TABS = [
  { key: "presentismo", label: "Presentismo", icon: CalendarCheck2 },
  { key: "extras",      label: "Horas extras", icon: Clock3 },
  { key: "empleados",   label: "Empleados", icon: UsersRound },
  { key: "oficios",     label: "Oficios y obras", icon: Briefcase },
  { key: "importar",    label: "Importar", icon: Upload },
  { key: "dashboard",   label: "Dashboard", icon: BarChart3 },
];

// Lo que ve cualquiera que entre a RRHH sin ser de RRHH.
const BASICAS = ["presentismo", "extras", "dashboard"];

export default function RrhhScreen({ profile }) {
  const { isMobile } = useResponsive();
  const [searchParams] = useSearchParams();
  // 'administracion' opera RRHH igual que 'rrhh' (ver y editar legajos, presentismo y extras).
  const esAdmin = profile?.is_admin || ["admin", "rrhh", "administracion"].includes(profile?.role);
  // Técnica ve el legajo pero no lo toca: EmpleadosTab con esAdmin en false ya
  // esconde alta, baja, edición y selección múltiple.
  const verEmpleados = canViewEmpleados(profile);
  const puedeEditarPresentismo = canManagePresentismo(profile);
  const puedeEditarOficiosYObras = canManageOficiosYObras(profile);

  const requestedTab = searchParams.get("tab") || "presentismo";
  const [tab, setTab] = useState(() => TABS.some((item) => item.key === requestedTab) ? requestedTab : "presentismo");
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

  useEffect(() => {
    const timer = window.setTimeout(cargar, 0);
    return () => window.clearTimeout(timer);
  }, [cargar]);

  useEffect(() => {
    const permitted = esAdmin
      || BASICAS.includes(requestedTab)
      || (verEmpleados && requestedTab === "empleados")
      || (puedeEditarOficiosYObras && requestedTab === "oficios");
    if (!permitted || !TABS.some((item) => item.key === requestedTab)) return undefined;
    const timer = window.setTimeout(() => setTab(requestedTab), 0);
    return () => window.clearTimeout(timer);
  }, [esAdmin, puedeEditarOficiosYObras, requestedTab, verEmpleados]);

  const listo = empleados != null && contratistas != null && config != null;
  const confirmados = (empleados ?? []).filter(e => !e.provisorio && !e.externo);
  const puedeGestionarAltasEmpleados = puedeGestionarAltas(profile);

  const tabsVisibles = TABS.filter(t => esAdmin || BASICAS.includes(t.key) || (verEmpleados && t.key === "empleados") || (puedeEditarOficiosYObras && t.key === "oficios"));
  const haySinAsignar = (empleados ?? []).some(e => e.grupo === "sin_asignar" && e.activo !== false);

  async function cambiarCierre(fecha, cerrado) {
    await saveConfig(`${PREFIJO_CIERRE}${fecha}`, cerrado);
    setConfig((actual) => {
      const cierresNoLaborables = new Set(actual.cierresNoLaborables);
      if (cerrado) cierresNoLaborables.add(fecha);
      else cierresNoLaborables.delete(fecha);
      return { ...actual, cierresNoLaborables };
    });
  }

  return (
    <div className="rrhh-root">
      <style>{CSS}</style>
      {/* Mismo encabezado que Consumibles: las pestañas van en su segunda fila. */}
      <PageHeader icon={CalendarCheck2} eyebrow="Asistencia y control horario" title="Recursos humanos">
        {listo && !setupPendiente && !error && (
          <nav className="ui-tabs" role="tablist" aria-label="Secciones de recursos humanos">
            {tabsVisibles.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" role="tab" className="ui-tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                  <Icon size={15} strokeWidth={1.8} />
                  {t.label}
                  {t.key === "empleados" && haySinAsignar && <span className="ui-punto" />}
                </button>
              );
            })}
          </nav>
        )}
      </PageHeader>

      <main className="rrhh-cuerpo">
        <div className="rrhh-ancho">
          {setupPendiente ? (
            <SetupPendiente onRetry={cargar} />
          ) : error ? (
            <ErrorBox error={error} onRetry={cargar} />
          ) : !listo ? (
            <Cargando />
          ) : (
            <>
              {tab === "presentismo" && <PresentismoTab empleados={confirmados} contratistas={contratistas} config={config} canEdit={puedeEditarPresentismo} canArchiveEmployees={esAdmin} onChanged={cargar} onCierreChange={esAdmin ? cambiarCierre : undefined} />}
              {tab === "extras" && <ExtrasTab empleados={confirmados} contratistas={contratistas} config={config} onConfigChange={cargar} esAdmin={esAdmin} />}
              {tab === "empleados" && <EmpleadosTab empleados={empleados} contratistas={contratistas} config={config} onChanged={cargar} esAdmin={esAdmin} puedeGestionarAltas={puedeGestionarAltasEmpleados} initialQuery={searchParams.get("q") || ""} initialView={searchParams.get("vista") || "activos"} />}
              {tab === "oficios" && <OficiosObrasTab empleados={confirmados} esAdmin={puedeEditarOficiosYObras} isMobile={isMobile} onChanged={cargar} />}
              {tab === "importar" && <ImportarTab empleados={empleados} onImported={cargar} />}
              {tab === "dashboard" && <DashboardTab empleados={confirmados} config={config} onNavigate={setTab} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const CSS = `
  .rrhh-root {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column; min-height: 0;
    font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
  }
  .rrhh-root .rrhh-cuerpo { flex: 1; min-height: 0; overflow: auto; }
  .rrhh-root .rrhh-ancho { width: 100%; max-width: 1760px; margin: 0 auto; padding: 16px 20px 60px; }
  @media (max-width: 899px) {
    .rrhh-root .rrhh-ancho { padding: 14px 12px 50px; }
  }
`;
