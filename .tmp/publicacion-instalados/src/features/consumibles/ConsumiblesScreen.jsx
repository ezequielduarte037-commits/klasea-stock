import { Suspense, lazy, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PackageOpen } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { SEDES, guardarSedeDelEquipo, sedeDelEquipo } from "@/features/consumibles/api";
import { puedeVerPrecios } from "@/lib/permissions";
import { VerPreciosContext } from "./verPrecios";

/**
 * Consumibles — "nada sale sin registro".
 *
 * El contenedor solo resuelve dos cosas: la pestaña (en la URL, `?tab=`) y la
 * sede del pañol, que se elige una vez por equipo. Cada pestaña es dueña de sus
 * datos y los trae con `@/features/consumibles/api`.
 *
 * Quién ve qué: el pañol vive en Mostrador, Conteo e Ingresos; Compras y
 * gestión en Stock, Catálogo, Precios y Tablero.
 */

const TABS = [
  { key: "mostrador", label: "Mostrador", Comp: lazy(() => import("./mostrador/MostradorTab")) },
  // El carril planificado: la hoja de papel o la solicitud desde el celular,
  // hasta las 15; se prepara a la tarde y se entrega a las 7 con tarjeta.
  { key: "solicitudes", label: "Solicitudes", Comp: lazy(() => import("./solicitudes/SolicitudesTab")) },
  // Todo lo que entró, salió y se contó, por día; lo de antes del conteo, marcado.
  { key: "movimientos", label: "Movimientos", Comp: lazy(() => import("./movimientos/MovimientosTab")) },
  { key: "stock", label: "Stock y reposición", Comp: lazy(() => import("./stock/StockTab")) },
  { key: "conteo", label: "Conteo", Comp: lazy(() => import("./conteo/ConteoTab")) },
  // El carrito del pedido a Rebollar: lo arma el pañol y lo recibe Ingresos.
  { key: "pedidos", label: "Pedidos", Comp: lazy(() => import("./pedidos/PedidosTab")) },
  { key: "ingresos", label: "Ingresos", Comp: lazy(() => import("./ingresos/IngresosTab")) },
  { key: "catalogo", label: "Catálogo", Comp: lazy(() => import("./catalogo/CatalogoTab")) },
  { key: "precios", label: "Precios", conPrecios: true, Comp: lazy(() => import("./precios/PreciosTab")) },
  { key: "etiquetas", label: "Etiquetas", Comp: lazy(() => import("./etiquetas/EtiquetasTab")) },
  // El tablero mide el consumo en pesos: es de gestión, el pañol no lo ve.
  { key: "tablero", label: "Tablero", conPrecios: true, Comp: lazy(() => import("./tablero/TableroTab")) },
];

export default function ConsumiblesScreen({ profile }) {
  const [params, setParams] = useSearchParams();
  const [sede, setSedeState] = useState(() => sedeDelEquipo());
  const verPrecios = puedeVerPrecios(profile);
  const tabs = useMemo(() => TABS.filter((t) => verPrecios || !t.conPrecios), [verPrecios]);
  const tabKey = tabs.some((t) => t.key === params.get("tab")) ? params.get("tab") : "mostrador";
  const tab = useMemo(() => tabs.find((t) => t.key === tabKey), [tabs, tabKey]);

  const irA = (key) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  const setSede = (s) => {
    guardarSedeDelEquipo(s);
    setSedeState(s);
  };

  const Comp = tab.Comp;

  return (
    <div className="cns-root">
      <style>{CSS}</style>
      <PageHeader
        icon={PackageOpen}
        eyebrow="Pañol"
        title="Consumibles"
        actions={(
          <div className="cns-sede" role="group" aria-label="Sede del pañol">
            {SEDES.map((s) => (
              <button
                key={s}
                type="button"
                className={`ui-chip${sede === s ? " is-activa" : ""}`}
                aria-pressed={sede === s}
                onClick={() => setSede(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      >
        <nav className="ui-tabs" role="tablist" aria-label="Secciones de consumibles">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              className="ui-tab"
              aria-selected={t.key === tabKey}
              onClick={() => irA(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </PageHeader>

      <main className="cns-cuerpo">
        {!sede ? (
          <div className="cns-elegir ui-card">
            <h2>¿En qué pañol está este equipo?</h2>
            <p>Se elige una vez. Todo lo que se registre desde acá sale del stock de esa sede.</p>
            <div className="cns-elegir-botones">
              {SEDES.map((s) => (
                <button key={s} type="button" className="ui-btn ui-btn-primario" onClick={() => setSede(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <VerPreciosContext.Provider value={verPrecios}>
            <Suspense fallback={<Cargando llenar texto="Abriendo…" />}>
              <Comp key={`${tabKey}:${sede}:${profile?.id ?? ""}`} profile={profile} sede={sede} irA={irA} />
            </Suspense>
          </VerPreciosContext.Provider>
        )}
      </main>
    </div>
  );
}

const CSS = `
  .cns-root {
    position: absolute; top: 0; right: 0; bottom: 0; left: 0;
    display: flex; flex-direction: column; min-height: 0;
    font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
  }
  .cns-root .cns-sede { display: flex; gap: 6px; }
  .cns-root .cns-cuerpo { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .cns-root .cns-elegir { max-width: 460px; margin: 48px auto; padding: 28px; text-align: center; }
  .cns-root .cns-elegir h2 { margin: 0 0 8px; font-size: 20px; font-weight: 650; }
  .cns-root .cns-elegir p { margin: 0 0 20px; color: var(--muted); }
  .cns-root .cns-elegir-botones { display: flex; gap: 10px; justify-content: center; }
  @media (max-width: 640px) {
    .cns-root .ui-ph { padding: 14px 16px 10px; }
  }
`;
