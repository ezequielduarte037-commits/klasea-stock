import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Box, Factory, Search } from "lucide-react";
import { supabase } from "@/supabaseClient";
import Cargando from "@/components/ui/Cargando";
import { ChapaSwatch } from "@/features/muebles/chapa";
import { cantidadMuebles, etapaMeta, nombreLinea, nombreMuebles } from "../mueblesProduccion";
import { Aviso, Estado, Mini, Modal, Tag, Vacio } from "../ui";

export default function StockTab({ esAdmin, onOpenRecepcion }) {
  const [lotes, setLotes] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [asignando, setAsignando] = useState(null);
  const [unidadId, setUnidadId] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setLoading(true);
    const [stockRes, unitsRes] = await Promise.all([
      supabase.from("prod_muebles_lotes").select(`
        id, proveedor, unidad_id, linea_id, tipo_destino, nombre_lote, cantidad_juegos,
        color_chapa, material_base, detalle_madera, etapa, estado_proceso, fecha_objetivo,
        observaciones, recepcion_estado, prod_lineas(id,nombre)
      `).eq("tipo_destino", "stock").is("unidad_id", null).order("actualizado_el", { ascending: false }),
      supabase.from("prod_unidades").select("id,codigo,linea_id,color,prod_lineas(id,nombre)").eq("activa", true).order("codigo"),
    ]);
    if (stockRes.error) setError(stockRes.error.message);
    setLotes(stockRes.data ?? []);
    setUnidades(unitsRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtrados = useMemo(() => {
    const text = q.trim().toLowerCase();
    return lotes.filter((lote) => !text || `${nombreLinea(lote)} ${lote.proveedor} ${lote.color_chapa || ""} ${lote.nombre_lote || ""}`.toLowerCase().includes(text));
  }, [lotes, q]);

  const disponibles = lotes.filter((lote) => etapaMeta(lote).etapa.key === "recibido" && lote.recepcion_estado === "completa").length;
  const compatibles = asignando ? unidades.filter((u) => u.linea_id === asignando.linea_id) : [];

  async function asignar() {
    if (!asignando || !unidadId) return;
    setGuardando(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.from("prod_muebles_lotes").update({
      unidad_id: unidadId,
      tipo_destino: "obra",
      actualizado_por: authData?.user?.id ?? null,
      actualizado_el: new Date().toISOString(),
    }).eq("id", asignando.id);
    if (updateError) {
      setError(updateError.message);
      setGuardando(false);
      return;
    }
    await supabase.from("prod_muebles_lotes_historial").insert({
      lote_id: asignando.id,
      accion: "Muebles de stock asignados a obra",
      etapa_anterior: etapaMeta(asignando).etapa.key,
      etapa_nueva: etapaMeta(asignando).etapa.key,
      usuario_id: authData?.user?.id ?? null,
      detalle: { unidad_id: unidadId },
    });
    const lote = asignando;
    setAsignando(null);
    setUnidadId("");
    setGuardando(false);
    await cargar();
    if (etapaMeta(lote).etapa.key === "recibido") onOpenRecepcion?.({ ...lote, unidad_id: unidadId });
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="mbl-barra">
        <div className="mbl-barra-fila">
          <div className="mbl-titulos">
            <div className="mbl-eyebrow">Muebles · Sin obra asignada</div>
            <h1 className="mbl-h1">Stock de <span className="acento">muebles</span></h1>
            <p className="mbl-sub">
              {loading ? "Leyendo stock…" : <><b className="mono">{disponibles}</b> {disponibles === 1 ? "conjunto terminado y listo" : "conjuntos terminados y listos"} para asignar a una obra.</>}
            </p>
          </div>
          <label className="mbl-buscar">
            <Search size={15} />
            <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Línea, chapa o mueblero…" aria-label="Buscar en stock" />
          </label>
        </div>
      </header>

      {error && <div style={{ padding: "0 24px 12px" }}><Aviso onCerrar={() => setError("")}>{error}</Aviso></div>}

      {loading ? (
        <Cargando llenar texto="Cargando stock…" />
      ) : filtrados.length === 0 ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <Vacio
            icono={Box}
            titulo={lotes.length ? "Sin resultados" : "No hay muebles fabricados para stock"}
            texto={lotes.length ? `Nada coincide con “${q}”.` : "Los procesos creados con destino “stock” aparecen acá hasta que se asignan a una obra."}
          />
        </div>
      ) : (
        <div className="mbl-grilla">
          {filtrados.map((lote, idx) => {
            const meta = etapaMeta(lote);
            const listo = meta.etapa.key === "recibido" && lote.recepcion_estado === "completa";
            const chapa = lote.color_chapa || lote.material_base;
            return (
              <article className="mbl-tarjeta" key={lote.id} style={{ "--i": Math.min(idx, 12) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <Tag tono={lote.proveedor === "Morph" ? "violeta" : "teal"} icono={Factory}>{lote.proveedor}</Tag>
                  <Estado tono={listo ? "verde" : meta.etapa.key === "recibido" ? "cian" : "azul"}>
                    {listo ? "Disponible" : meta.etapa.key === "recibido" ? "Recepción parcial" : meta.etapa.label}
                  </Estado>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="mbl-item-sw" style={{ width: 52, height: 44 }}>{chapa ? <ChapaSwatch tipo={chapa} size="lg" /> : <Box size={18} />}</div>
                  <div style={{ minWidth: 0 }}>
                    <h2 className="mbl-item-nom" style={{ fontSize: 15.5 }}>{nombreMuebles(lote)}</h2>
                    <div className="mbl-item-sub">{nombreLinea(lote)} · {cantidadMuebles(lote)}</div>
                  </div>
                </div>
                <div className="mbl-datos" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div><div className="mbl-dato-et">Chapa</div><div className={`mbl-dato-v${chapa ? "" : " vacio"}`}>{chapa || "Sin definir"}</div></div>
                  <div><div className="mbl-dato-et">Material</div><div className={`mbl-dato-v${lote.material_base ? "" : " vacio"}`}>{lote.material_base || "Estándar de línea"}</div></div>
                </div>
                <div className="mbl-tarjeta-pie">
                  <Mini pct={meta.progreso} />
                  {esAdmin && (
                    <button
                      type="button"
                      className={`ui-btn${listo ? " ui-btn-primario" : ""}`}
                      disabled={!listo}
                      title={listo ? "" : "Se asigna cuando la recepción está completa"}
                      onClick={() => { setAsignando(lote); setUnidadId(""); }}
                    >
                      Asignar a una obra <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {asignando && (
        <Modal
          onCerrar={() => setAsignando(null)}
          bloqueado={guardando}
          icono={ArrowRight}
          tono="verde"
          titulo={`Asignar ${nombreMuebles(asignando)}`}
          sub={`Sólo se muestran obras de la línea ${nombreLinea(asignando)}.`}
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={() => setAsignando(null)} disabled={guardando}>Cancelar</button>
              <button type="button" className="ui-btn ui-btn-primario" disabled={!unidadId || guardando} onClick={asignar}>{guardando ? "Asignando…" : "Confirmar asignación"}</button>
            </>
          )}
        >
          <label className="mbl-campo"><span>Obra</span>
            <select className="ui-input" value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              <option value="">Seleccionar obra</option>
              {compatibles.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.codigo}</option>)}
            </select>
          </label>
          {!compatibles.length && <Aviso tono="azul">No hay obras activas compatibles con esta línea.</Aviso>}
        </Modal>
      )}
    </div>
  );
}
