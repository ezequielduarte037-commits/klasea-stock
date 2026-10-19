import { useState } from "react";
import { Link } from "react-router-dom";
import { ScanLine, Warehouse } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { hasAdminAccess } from "@/lib/permissions";
import { canonicalPanolSede } from "@/features/panol/panolApi";
import { SEDES, guardarSedeDelEquipo, sedeDelEquipo } from "@/features/consumibles/api";
import MostradorPanol from "@/features/panol/mostrador/MostradorPanol";

/**
 * Egresar materiales: el mostrador del stock de pañol (los ítems de los
 * barcos), con el mismo estilo que el de consumibles. El stock completo, por
 * obra, los movimientos y los traslados siguen en /stock-panol; la pantalla
 * del lado de quien retira sigue siendo /pantalla-egreso.
 *
 * La sede es la del equipo (la misma que usa el mostrador de consumibles). El
 * pañolero con sede en su perfil no la elige: sale de la suya.
 */
export default function EgresosPanolScreen({ profile }) {
  const role = profile?.role;
  const sedePerfil = canonicalPanolSede(profile?.sede);
  const sedeFija = role === "panol" && sedePerfil ? sedePerfil : null;
  const [sedeElegida, setSedeElegida] = useState(() => sedeDelEquipo());
  const sede = sedeFija || sedeElegida;
  const puedeRegistrar = hasAdminAccess(profile) || role === "compras" || role === "panol";

  const elegirSede = (s) => {
    guardarSedeDelEquipo(s);
    setSedeElegida(s);
  };

  return (
    <div className="egp-root">
      <style>{CSS}</style>
      <PageHeader
        icon={ScanLine}
        eyebrow="Pañol"
        title="Egresar materiales"
        actions={(
          <div className="egp-acciones">
            {sedeFija ? (
              <span className="ui-chip is-activa" title="La sede de tu perfil">{sedeFija}</span>
            ) : (
              <div className="egp-sede" role="group" aria-label="Sede del pañol">
                {SEDES.map((s) => (
                  <button key={s} type="button" className={`ui-chip${sede === s ? " is-activa" : ""}`} aria-pressed={sede === s} onClick={() => elegirSede(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <Link to="/stock-panol" className="ui-btn">
              <Warehouse size={15} aria-hidden="true" /> Stock
            </Link>
          </div>
        )}
      />

      <main className="egp-cuerpo">
        {!puedeRegistrar ? (
          <div className="egp-aviso ui-card">
            <h2>Tu usuario puede ver el stock, no registrar egresos</h2>
            <p>Los egresos los registra el pañol. El stock por obra y los movimientos están en Stock de pañol.</p>
            <Link to="/stock-panol" className="ui-btn ui-btn-primario">Ver el stock</Link>
          </div>
        ) : !sede ? (
          <div className="egp-aviso ui-card">
            <h2>¿En qué pañol está este equipo?</h2>
            <p>Se elige una vez. Todo lo que se entregue desde acá sale del stock de esa sede.</p>
            <div className="egp-botones">
              {SEDES.map((s) => (
                <button key={s} type="button" className="ui-btn ui-btn-primario" onClick={() => elegirSede(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <MostradorPanol key={sede} sede={sede} sedeFija={Boolean(sedeFija)} />
        )}
      </main>
    </div>
  );
}

const CSS = `
  .egp-root {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column; min-height: 0;
    font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
  }
  .egp-root .egp-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .egp-root .egp-sede { display: flex; gap: 6px; }
  .egp-root .egp-acciones .ui-chip { min-height: 32px; padding: 0 12px; font-size: 12.5px; }
  .egp-root .egp-acciones .ui-chip.is-activa { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
  .egp-root .egp-cuerpo { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .egp-root .egp-aviso { max-width: 480px; margin: 48px auto; padding: 28px; text-align: center; display: grid; gap: 12px; justify-items: center; }
  .egp-root .egp-aviso h2 { margin: 0; font-size: 20px; font-weight: 650; }
  .egp-root .egp-aviso p { margin: 0 0 6px; color: var(--muted); }
  .egp-root .egp-botones { display: flex; gap: 10px; justify-content: center; }
  @media (max-width: 640px) {
    .egp-root .ui-ph { padding: 12px 16px 8px; }
  }
`;
