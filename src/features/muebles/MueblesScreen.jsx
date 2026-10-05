import { createElement, useState } from "react";
import { Armchair, ClipboardCheck, Factory, Layers3 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { hasAdminAccess } from "@/lib/permissions";
import BotonAyuda from "@/features/ayuda/BotonAyuda";
import ProduccionTab from "./tabs/ProduccionTab";
import RecepcionTab from "./tabs/RecepcionTab";
import StockTab from "./tabs/StockTab";
import { CSS_MUEBLES } from "./estilos";

// Muebles: un circuito en tres áreas. Seguimiento lleva la fabricación de
// cada conjunto, Recepción controla pieza por pieza lo que llega y Stock
// guarda lo fabricado sin obra. Esta pantalla sólo arma el contenedor y la
// barra del módulo; cada área vive en tabs/.
const AREAS = [
  ["produccion", "Seguimiento", Factory],
  ["recepcion", "Recepción", ClipboardCheck],
  ["stock", "Stock", Layers3],
];

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

export default function MueblesScreen({ profile }) {
  const isAdmin = hasAdminAccess(profile);
  const role    = profile?.role ?? "invitado";
  const esAdmin = isAdmin || role === "admin" || role === "oficina" || role === "tecnica" || role === "compras";

  const [vista, setVista] = useState("produccion");
  // Obra que se pidió abrir en Recepción desde Seguimiento o Stock.
  const [destinoRecepcion, setDestinoRecepcion] = useState(null);

  async function ensureLineaByModel(modeloRaw) {
    const modelo = String(modeloRaw ?? "").trim();
    if (!modelo) throw new Error("Falta el modelo para crear la linea.");

    const { data: found, error } = await supabase
      .from("prod_lineas")
      .select("id,nombre,activa")
      .ilike("nombre", modelo)
      .limit(1);

    if (error) throw error;

    const lineaDb = (found ?? []).find(l => normalizeText(l.nombre) === normalizeText(modelo)) ?? found?.[0];
    if (lineaDb) {
      if (lineaDb.activa === false) {
        await supabase.from("prod_lineas").update({ activa: true }).eq("id", lineaDb.id);
      }
      return { id: lineaDb.id, nombre: lineaDb.nombre };
    }

    const { data: created, error: createError } = await supabase
      .from("prod_lineas")
      .insert({ nombre: modelo, activa: true })
      .select("id,nombre")
      .single();

    if (createError) throw createError;
    return created;
  }

  // Seguimiento la usa para vincular una OT de enchapado con su obra: si la
  // obra no existe en Muebles, la crea con la plantilla de la línea.
  async function ensureUnidadDesdeEnchapado({ modelo, barco }) {
    const codigo = String(barco ?? "").trim();
    if (!codigo) throw new Error("Falta el codigo de obra/barco.");

    const linea = await ensureLineaByModel(modelo);
    const { data: existingUnits, error: queryError } = await supabase
      .from("prod_unidades")
      .select("id,codigo,color,activa")
      .eq("linea_id", linea.id)
      .ilike("codigo", codigo)
      .limit(1);

    if (queryError) throw queryError;

    let unidad = existingUnits?.[0] ?? null;
    let created = false;

    if (!unidad) {
      const { data: nuevaUnidad, error: createUnitError } = await supabase
        .from("prod_unidades")
        .insert({ linea_id: linea.id, codigo, activa: true })
        .select("id,codigo,color")
        .single();

      if (createUnitError) throw createUnitError;
      unidad = nuevaUnidad;
      created = true;

      const { data: plantilla, error: plantillaError } = await supabase
        .from("prod_linea_muebles")
        .select("mueble_id")
        .eq("linea_id", linea.id);

      if (plantillaError) throw plantillaError;
      if (plantilla?.length) {
        await supabase.from("prod_unidad_checklist").insert(
          plantilla.map(p => ({ unidad_id: unidad.id, mueble_id: p.mueble_id, estado: "No enviado" }))
        );
      }
    } else if (unidad.activa === false) {
      await supabase.from("prod_unidades").update({ activa: true }).eq("id", unidad.id);
    }

    return { linea, unidad, created };
  }

  function irA(area) {
    setDestinoRecepcion(null);
    setVista(area);
  }

  function abrirRecepcion(lote) {
    setDestinoRecepcion({
      lineaId: lote?.linea_id || lote?.prod_lineas?.id || null,
      unidadId: lote?.unidad_id || null,
      nonce: Date.now(),
    });
    setVista("recepcion");
  }

  return (
    <div className="mbl">
      <style href="klasea-muebles" precedence="default">{CSS_MUEBLES}</style>

      <nav className="mbl-nav" data-tour="muebles-tabs" aria-label="Muebles">
        <span className="mbl-nav-marca"><Armchair size={17} /> Muebles</span>
        <span className="mbl-nav-sep" />
        <div className="ui-tabs" role="tablist">
          {AREAS.map(([key, label, Icono]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={vista === key}
              className="ui-tab"
              onClick={() => irA(key)}
            >
              {createElement(Icono, { size: 15 })}
              {label}
            </button>
          ))}
        </div>
        <BotonAyuda tourId="muebles" profile={profile} onBeforeStart={() => irA("produccion")} />
      </nav>

      <div className="mbl-vista" key={vista}>
        {vista === "produccion" ? (
          <ProduccionTab
            esAdmin={esAdmin}
            profile={profile}
            onEnsureMueblesUnidad={ensureUnidadDesdeEnchapado}
            onOpenChecklist={abrirRecepcion}
          />
        ) : vista === "stock" ? (
          <StockTab esAdmin={esAdmin} onOpenRecepcion={abrirRecepcion} />
        ) : (
          <RecepcionTab
            key={destinoRecepcion?.nonce ?? "recepcion"}
            profile={profile}
            esAdmin={esAdmin}
            destino={destinoRecepcion}
            onIrSeguimiento={() => irA("produccion")}
          />
        )}
      </div>
    </div>
  );
}
