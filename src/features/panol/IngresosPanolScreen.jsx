import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, FileScan, Inbox } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { hasAdminAccess } from "@/lib/permissions";
import { canonicalPanolSede } from "@/features/panol/panolApi";
import { SEDES, guardarSedeDelEquipo, sedeDelEquipo } from "@/features/consumibles/api";
import MostradorIngresos from "@/features/panol/ingresos/MostradorIngresos";

/**
 * Ingresar materiales: el mostrador de entrada del stock de pañol (los ítems
 * de los barcos), gemelo del de egresos. Recibir lo de un pedido y lo que
 * llega sin pedido es la misma pantalla.
 *
 * Lo que no es del día a día (leer un remito con IA, el archivo de remitos,
 * repartir un renglón entre obras, las novedades de un pedido) sigue en
 * /recepcion-panol, "Pedidos y remitos".
 *
 * La sede es la del equipo (la misma de los mostradores de egresos y
 * consumibles). El pañolero con sede en su perfil no la elige.
 */
export default function IngresosPanolScreen({ profile }) {
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
        icon={ArrowDownToLine}
        eyebrow="Pañol"
        title="Ingresar materiales"
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
            <Link to="/recepcion-panol?tab=scanner" className="ui-btn" title="Escanear el remito y que la IA lo lea">
              <FileScan size={15} aria-hidden="true" /> <span className="egp-largo">Escanear remito</span>
            </Link>
            <Link to="/recepcion-panol?tab=recepcion" className="ui-btn" title="Todos los pedidos, el archivo de remitos y el ingreso completo">
              <Inbox size={15} aria-hidden="true" /> <span className="egp-largo">Pedidos y remitos</span>
            </Link>
          </div>
        )}
      />

      <main className="egp-cuerpo">
        {!puedeRegistrar ? (
          <div className="egp-aviso ui-card">
            <h2>Tu usuario puede ver los pedidos, no registrar ingresos</h2>
            <p>Los ingresos los registra el pañol. Los pedidos y los remitos están en Pedidos y remitos.</p>
            <Link to="/recepcion-panol?tab=recepcion" className="ui-btn ui-btn-primario">Ver los pedidos</Link>
          </div>
        ) : !sede ? (
          <div className="egp-aviso ui-card">
            <h2>¿En qué pañol está este equipo?</h2>
            <p>Se elige una vez. Todo lo que se ingrese desde acá entra al stock de esa sede.</p>
            <div className="egp-botones">
              {SEDES.map((s) => (
                <button key={s} type="button" className="ui-btn ui-btn-primario" onClick={() => elegirSede(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <MostradorIngresos key={sede} sede={sede} profile={profile} />
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
    .egp-root .egp-largo { display: none; }
  }
`;
