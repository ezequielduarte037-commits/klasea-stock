/**
 * Obras de producción.
 *
 * Portada con tarjetas → cinco vistas:
 *   Planta         todas las obras en el Gantt; la obra elegida se despliega y
 *                  abre su panel (estado de etapas, tareas, productos).
 *   Configuración  recorrido, tareas y productos de cada línea.
 *   Mapa, Piezas de laminación y Fechas, como estaban.
 *
 * Los datos y las acciones viven en produccion/useObrasData; el plan de cada
 * obra (desmolde + plantilla) en produccion/plan.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, ChevronLeft, GanttChart, Layers, Map as IconoMapa, Settings2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import MapaProduccion from "@/features/obras/MapaProduccion";
import PanelDetallesObra from "@/features/obras/PanelDetallesObra";
import PiezasLaminacionView from "@/features/obras/PiezasLaminacionView";
import FechasView from "@/features/obras/FechasView";
import ObrasHome from "@/features/obras/ObrasHome";
import { today } from "@/features/obras/obrasHelpers";
import { useObrasData } from "@/features/obras/produccion/useObrasData";
import PlantaView from "@/features/obras/produccion/PlantaView";
import ConfigView from "@/features/obras/produccion/ConfigView";
import { CSS_PRODUCCION } from "@/features/obras/produccion/estilos";
import { DefsProduccion } from "@/features/obras/produccion/ui";

const VISTAS = [
  ["planta", "Planta", GanttChart],
  ["config", "Configuración", Settings2],
  ["mapa", "Mapa", IconoMapa],
  ["piezas_lam", "Piezas", Layers],
  ["fechas", "Fechas", CalendarClock],
];

export default function ObrasScreen({ profile }) {
  const { isMobile } = useResponsive();
  const [searchParams] = useSearchParams();
  const obraPedida = searchParams.get("obra") || "";
  const esGestion = hasAdminAccess(profile) || ["oficina", "tecnica"].includes(profile?.role);
  const datos = useObrasData();
  const { obras, planes, lineaById, loading, cargar } = datos;

  const [vista, setVista] = useState(obraPedida ? "planta" : null);
  const [filtroInicial, setFiltroInicial] = useState(null);
  const [configInicial, setConfigInicial] = useState(null);
  const [mapaPanel, setMapaPanel] = useState(null);

  // El mapa y la portada usan el avance de cada obra (_pct) y el color de línea.
  const obrasConPct = useMemo(() => obras.map((o) => ({
    ...o,
    _pct: planes.get(o.id)?.avance ?? 0,
    _lineaColor: lineaById.get(o.linea_id)?.color ?? null,
  })), [obras, planes, lineaById]);

  async function cambiarEstadoDesdeMapa(obraId, estado) {
    if (estado === "desasignar") {
      await supabase.rpc("asignar_obra_a_puesto", { p_obra_id: obraId, p_puesto: null });
    } else {
      const upd = { estado, ...(estado === "terminada" ? { fecha_fin_real: today() } : {}) };
      await supabase.from("produccion_obras").update(upd).eq("id", obraId);
      if (estado === "terminada") {
        try {
          const { asegurarCierreObra } = await import("@/features/panol/obraCierreApi");
          await asegurarCierreObra(obraId);
        } catch (error) { console.warn("cierre de materiales:", error); }
      }
    }
    cargar();
  }

  if (!vista) {
    return (
      <ObrasHome
        obras={obrasConPct}
        cargando={loading && obras.length === 0}
        onEnterMapa={(v, filtro) => {
          setFiltroInicial(filtro?.estado ? { estado: filtro.estado } : null);
          setVista(v || "planta");
        }}
      />
    );
  }

  let contenido = null;
  if (vista === "planta") {
    contenido = (
      <PlantaView
        key={filtroInicial?.estado || "planta"}
        datos={datos}
        profile={profile}
        esGestion={esGestion}
        isMobile={isMobile}
        filtroInicial={filtroInicial}
        obraInicial={obraPedida}
        onConfigurar={(destino) => { setConfigInicial({ ...destino, t: Date.now() }); setVista("config"); }}
      />
    );
  } else if (vista === "config") {
    contenido = <ConfigView key={configInicial?.t || "config"} datos={datos} esGestion={esGestion} isMobile={isMobile} inicial={configInicial} />;
  } else if (vista === "mapa") {
    contenido = (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <MapaProduccion
          obras={obrasConPct}
          esGestion={esGestion}
          sharedPuestos={datos.mapa.puestos}
          sharedNotas={datos.mapa.notas}
          sharedMemorias={datos.mapa.memorias}
          onSaveLayout={datos.mapa.guardarPuestos}
          onSaveNotas={datos.mapa.guardarNotas}
          onSaveMemorias={datos.mapa.guardarMemorias}
          onPuestoClick={({ puesto, obra }) => setMapaPanel({ puesto, obra })}
          onAsignarObra={async (puestoId, obraId) => {
            // El RPC libera el puesto y asigna la obra en una sola transacción.
            const { error } = await supabase.rpc("asignar_obra_a_puesto", { p_obra_id: obraId, p_puesto: puestoId });
            if (error) console.error("asignar_obra_a_puesto:", error);
            cargar();
          }}
          onChangeEstado={cambiarEstadoDesdeMapa}
          onAsignarObraPampa={async (bahiaId, obraId) => {
            const { error } = await supabase.rpc("asignar_obra_a_bahia", { p_obra_id: obraId, p_bahia: bahiaId });
            if (error) console.error("asignar_obra_a_bahia:", error);
            cargar();
          }}
          onDesasignarObraPampa={async (bahiaId) => {
            const obra = obrasConPct.find((o) => o.bahia_pampa === bahiaId);
            if (!obra) return;
            await supabase.rpc("asignar_obra_a_bahia", { p_obra_id: obra.id, p_bahia: null });
            cargar();
          }}
        />
        {mapaPanel && (
          <PanelDetallesObra
            puesto={mapaPanel.puesto}
            obra={mapaPanel.obra}
            etapas={datos.etapas}
            ordenes={datos.ordenes}
            esGestion={esGestion}
            onClose={() => setMapaPanel(null)}
            onEditarObra={() => setMapaPanel(null)}
            onAsignarPuesto={async (puesto, obra) => {
              await supabase.rpc("asignar_obra_a_puesto", { p_obra_id: obra.id, p_puesto: null });
              cargar();
              setMapaPanel(null);
            }}
          />
        )}
      </div>
    );
  } else if (vista === "piezas_lam") {
    contenido = <PiezasLaminacionView obras={obras} esGestion={esGestion} />;
  } else if (vista === "fechas") {
    contenido = (
      <FechasView
        obras={obras}
        lineas={datos.lineas}
        esGestion={esGestion}
        onUpdateObra={async (id, fields) => {
          await supabase.from("produccion_obras").update(fields).eq("id", id);
          cargar();
        }}
      />
    );
  }

  return (
    <div className="prd">
      <style href="klasea-produccion" precedence="default">{CSS_PRODUCCION}</style>
      <DefsProduccion />
      <nav className="prd-nav" aria-label="Obras">
        <button type="button" className="prd-volver" onClick={() => { setVista(null); setMapaPanel(null); }} title="Volver al inicio de Obras">
          <ChevronLeft size={18} /><span>Obras</span>
        </button>
        <span className="prd-nav-sep" />
        <div className="ui-tabs" role="tablist">
          {VISTAS.map((v) => {
            const [clave, texto, Icono] = v;
            return (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={vista === clave}
              className="ui-tab"
              data-tour={`obras-nav-${clave}`}
              onClick={() => { setVista(clave); setMapaPanel(null); if (clave === "config") setConfigInicial(null); }}
            >
              <Icono size={15} />{texto}
            </button>
            );
          })}
        </div>
      </nav>
      <div className="prd-vista" key={vista}>{contenido}</div>
    </div>
  );
}
