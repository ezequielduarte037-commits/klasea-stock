import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Grid3x3, PackageSearch, Table2, Wallet } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import MatrizLineasPanel from "@/features/compras/MatrizLineasPanel";
import PlanillaObrasPanel from "@/features/compras/PlanillaObrasPanel";
import CatalogoCompletoPanel from "@/features/planillas/CatalogoCompletoPanel";
import CostoObraPanel from "@/features/planillas/CostoObraPanel";

/**
 * Las planillas, fuera de Compras.
 *
 * Todo esto vivia adentro de la pantalla de Compras, detras del permiso de
 * manager, asi que tecnica -que es quien carga los materiales- no podia ver
 * nada de lo que se arma con lo que carga. Aca es de consulta y lo ve tambien
 * tecnica, sin tocar los pedidos.
 *
 * Es un apartado propio para que siga creciendo: agregar una solapa es agregar
 * una entrada en SOLAPAS y su panel.
 */

const SOLAPAS = [
  { clave: "lineas", etiqueta: "Líneas", icono: Grid3x3, ayuda: "Qué productos lleva cada línea de producción y cuánto se proyecta que falte." },
  { clave: "catalogo", etiqueta: "Catálogo completo", icono: PackageSearch, ayuda: "Todos los productos, con lo que hay libre en el pañol al lado." },
  { clave: "obras", etiqueta: "Planillas por obra", icono: Table2, ayuda: "Barco por barco: qué se entregó, qué espera en el pañol y qué falta." },
  { clave: "costo", etiqueta: "Costo de obra", icono: Wallet, ayuda: "La plata puesta en materiales en cada obra." },
];

export default function PlanillasScreen({ profile, signOut }) {
  const isMobile = useResponsive(980);
  const [params, setParams] = useSearchParams();
  // La solapa vive en la URL y en ningun otro lado: se puede mandar el link de
  // una planilla concreta, y el boton de atras del navegador funciona.
  const pedida = params.get("tab");
  const solapa = SOLAPAS.some((s) => s.clave === pedida) ? pedida : "lineas";

  function elegir(clave) {
    const siguiente = new URLSearchParams(params);
    siguiente.set("tab", clave);
    setParams(siguiente, { replace: true });
  }

  const actual = useMemo(() => SOLAPAS.find((s) => s.clave === solapa) ?? SOLAPAS[0], [solapa]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <style>{`
        .planillas-solapa { transition: border-color .15s, color .15s, background .15s; }
        .planillas-solapa:hover { color: ${C.text}; }
        .planillas-solapa:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{
            minHeight: 52, display: "flex", alignItems: "center", gap: 10,
            padding: isMobile ? "9px 12px 9px 54px" : "9px 18px",
            borderBottom: `1px solid ${C.border}`, background: C.topbar, flexShrink: 0,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}>
              <Table2 size={17} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Planillas</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {actual.ayuda}
              </div>
            </div>
          </header>

          <nav style={{
            display: "flex", gap: 4, padding: isMobile ? "0 10px" : "0 16px",
            borderBottom: `1px solid ${C.border}`, background: C.topbarSoft,
            flexShrink: 0, overflowX: "auto",
          }}>
            {SOLAPAS.map((s) => {
              const Icono = s.icono;
              const activa = solapa === s.clave;
              return (
                <button
                  key={s.clave}
                  type="button"
                  className="planillas-solapa"
                  onClick={() => elegir(s.clave)}
                  title={s.ayuda}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    border: "none", background: "transparent", cursor: "pointer",
                    padding: "10px 11px", fontFamily: C.sans, fontSize: 12.5,
                    fontWeight: activa ? 900 : 750,
                    color: activa ? C.text : C.dim,
                    borderBottom: `2px solid ${activa ? C.blue : "transparent"}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icono size={13} /> {s.etiqueta}
                </button>
              );
            })}
          </nav>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? 10 : "14px 16px" }}>
            {solapa === "lineas" ? <MatrizLineasPanel isMobile={isMobile} /> : null}
            {solapa === "catalogo" ? <CatalogoCompletoPanel isMobile={isMobile} /> : null}
            {solapa === "obras" ? <PlanillaObrasPanel isMobile={isMobile} /> : null}
            {solapa === "costo" ? <CostoObraPanel isMobile={isMobile} /> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
