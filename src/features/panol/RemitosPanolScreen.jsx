import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownToLine, FileText, ScanLine } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess, puedeVerPrecios } from "@/lib/permissions";
import ScannerRemitosTab from "@/features/panol/ScannerRemitosTab";
import RemitosArchivoTab from "@/features/panol/RemitosArchivoTab";

/**
 * Remitos: guardar y encontrar los papeles. NO mueve stock.
 *
 * Escanear un remito es archivarlo en su barco, proveedor o carpeta. Ingresar
 * materiales es otra cosa y se hace en el mostrador (/ingresos-panol), que al
 * confirmar deja el ingreso atado a uno de estos remitos.
 *
 * Antes las dos cosas estaban mezcladas: el escáner ofrecía leer con IA e
 * ingresar, y en la práctica el 94 % de los remitos se guardaba tildando
 * "solo archivar" (y ninguno se ingresó por ahí). Ahora escanear es guardar.
 */

const VISTA_KEY = "klasea.panol.remitos.vista";

function vistaGuardada() {
  try {
    return window.localStorage.getItem(VISTA_KEY) === "escanear" ? "escanear" : "archivo";
  } catch {
    return "archivo";
  }
}

export default function RemitosPanolScreen({ profile }) {
  const { isMobile } = useResponsive();
  const [params, setParams] = useSearchParams();
  const busqueda = params.get("q") || "";
  const pedida = params.get("vista");
  const [vista, setVistaState] = useState(() => (pedida === "escanear" || pedida === "archivo" ? pedida : busqueda ? "archivo" : vistaGuardada()));
  // Lo que se guardó recién tiene que aparecer al volver al archivo.
  const [version, setVersion] = useState(0);

  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const userSede = profile?.sede || null;
  const sedeLocked = role === "panol" && (userSede === "Pampa" || userSede === "Chubut") ? userSede : null;
  const canReceive = isAdmin || role === "compras" || role === "panol";

  function setVista(v) {
    setVistaState(v);
    try { window.localStorage.setItem(VISTA_KEY, v); } catch { /* sin almacenamiento: no se recuerda */ }
    const siguiente = new URLSearchParams(params);
    siguiente.set("vista", v);
    if (v !== "archivo") siguiente.delete("q");
    setParams(siguiente, { replace: true });
  }

  return (
    <div className="rmp-root">
      <style>{CSS}</style>
      <PageHeader
        icon={FileText}
        eyebrow="Pañol"
        title="Remitos"
        actions={(
          <div className="rmp-acciones">
            <div className="rmp-vistas" role="tablist" aria-label="Remitos">
              <button type="button" role="tab" aria-selected={vista === "escanear"} className={`ui-chip${vista === "escanear" ? " is-activa" : ""}`} onClick={() => setVista("escanear")}>
                <ScanLine size={14} aria-hidden="true" /> Escanear y guardar
              </button>
              <button type="button" role="tab" aria-selected={vista === "archivo"} className={`ui-chip${vista === "archivo" ? " is-activa" : ""}`} onClick={() => setVista("archivo")}>
                <FileText size={14} aria-hidden="true" /> Archivo
              </button>
            </div>
            <Link to="/ingresos-panol" className="ui-btn" title="Mover stock: lo que llegó, con o sin pedido">
              <ArrowDownToLine size={15} aria-hidden="true" /> <span className="rmp-largo">Ingresar materiales</span>
            </Link>
          </div>
        )}
      />
      <main className="rmp-cuerpo">
        {vista === "escanear" ? (
          <ScannerRemitosTab
            profile={profile}
            sedeLocked={sedeLocked}
            canReceive={canReceive}
            isMobile={isMobile}
            soloGuardar
            onGuardado={() => setVersion((n) => n + 1)}
            onVerArchivo={() => setVista("archivo")}
          />
        ) : (
          <RemitosArchivoTab
            key={`archivo-${busqueda}-${version}`}
            isMobile={isMobile}
            puedeReasignar={isAdmin}
            busquedaInicial={busqueda}
            verPrecios={puedeVerPrecios(profile)}
          />
        )}
      </main>
    </div>
  );
}

const CSS = `
  .rmp-root {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column; min-height: 0;
    font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
  }
  .rmp-root .rmp-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rmp-root .rmp-vistas { display: flex; gap: 6px; }
  .rmp-root .rmp-vistas .ui-chip { min-height: 32px; padding: 0 12px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px; }
  .rmp-root .rmp-vistas .ui-chip.is-activa { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
  .rmp-root .rmp-cuerpo { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  @media (max-width: 640px) {
    .rmp-root .ui-ph { padding: 12px 16px 8px; }
    .rmp-root .rmp-largo { display: none; }
  }
`;
