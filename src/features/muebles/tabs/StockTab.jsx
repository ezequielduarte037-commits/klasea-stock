import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Box, Factory, Search, Warehouse, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { ChapaSwatch } from "@/features/muebles/chapa";
import { cantidadMuebles, etapaMeta, nombreLinea, nombreMuebles } from "../mueblesProduccion";

const field = { width: "100%", minHeight: 38, padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, font: `500 13px ${C.sans}`, outline: "none" };

export default function StockTab({ esAdmin, onOpenRecepcion }) {
  const [lotes, setLotes] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [asignando, setAsignando] = useState(null);
  const [unidadId, setUnidadId] = useState("");

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
    const { data: authData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.from("prod_muebles_lotes").update({
      unidad_id: unidadId,
      tipo_destino: "obra",
      actualizado_por: authData?.user?.id ?? null,
      actualizado_el: new Date().toISOString(),
    }).eq("id", asignando.id);
    if (updateError) {
      setError(updateError.message);
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
    await cargar();
    if (etapaMeta(lote).etapa.key === "recibido") onOpenRecepcion?.({ ...lote, unidad_id: unidadId });
  }

  return (
    <div className="stock-muebles" style={{ maxWidth: 1420, margin: "0 auto", padding: "20px 22px 44px" }}>
      <style>{`
        .stock-card { transition:border-color .16s ease, transform .16s ease, box-shadow .16s ease; }
        .stock-card:hover { transform:translateY(-1px); border-color:${C.b1}!important; box-shadow:0 8px 24px rgba(0,0,0,.08); }
        .stock-muebles button:focus-visible, .stock-muebles input:focus-visible, .stock-muebles select:focus-visible { outline:2px solid ${C.blue}; outline-offset:2px; }
        @media(max-width:720px){.stock-muebles{padding:14px 10px 36px!important}.stock-grid{grid-template-columns:1fr!important}.stock-head{align-items:flex-start!important;flex-direction:column}.stock-search{width:100%!important}}
      `}</style>
      <div className="stock-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 15 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.t2, fontSize: 10, fontWeight: 850, letterSpacing: 1.3, textTransform: "uppercase" }}><Warehouse size={14} /> Muebles sin obra asignada</div>
          <h1 style={{ margin: "5px 0 0", color: C.t0, fontSize: 25, letterSpacing: -0.7 }}>Stock de muebles</h1>
          <div style={{ color: C.t2, fontSize: 12, marginTop: 4 }}>{disponibles} {disponibles === 1 ? "conjunto terminado y listo" : "conjuntos terminados y listos"} para asignar.</div>
        </div>
        <div className="stock-search" style={{ width: 290, position: "relative" }}><Search size={14} style={{ position: "absolute", left: 11, top: 12, color: C.t2 }} /><input style={{ ...field, paddingLeft: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar línea, chapa o mueblero" /></div>
      </div>

      {error && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 12 }}>{error}</div>}
      {loading ? <div style={{ padding: 60, textAlign: "center", color: C.t2 }}>Cargando stock...</div> : filtrados.length === 0 ? (
        <div style={{ padding: "70px 20px", textAlign: "center", borderRadius: 14, border: `1px dashed ${C.b1}`, background: C.s0 }}>
          <Box size={29} color={C.t2} />
          <div style={{ marginTop: 12, color: C.t0, fontSize: 15, fontWeight: 800 }}>No hay muebles fabricados para stock</div>
          <div style={{ marginTop: 5, color: C.t2, fontSize: 12 }}>Los procesos creados con destino “stock” van a aparecer acá.</div>
        </div>
      ) : (
        <div className="stock-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 10 }}>
          {filtrados.map((lote) => {
            const meta = etapaMeta(lote);
            const listo = meta.etapa.key === "recibido" && lote.recepcion_estado === "completa";
            const tone = lote.proveedor === "Morph"
              ? { color: C.violet, bg: C.violetL, border: C.violetB }
              : { color: C.teal, bg: C.tealL, border: C.tealB };
            const chapa = lote.color_chapa || lote.material_base;
            return (
              <article className="stock-card" key={lote.id} style={{ border: `1px solid ${C.b0}`, borderRadius: 13, background: C.s0, padding: 15, display: "flex", flexDirection: "column", minHeight: 226 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 7, background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`, fontSize: 10, fontWeight: 850, textTransform: "uppercase" }}><Factory size={11} /> {lote.proveedor}</span>
                  <span style={{ color: listo ? C.green : C.blue, fontSize: 10, fontWeight: 800 }}>
                    {listo ? "Disponible" : meta.etapa.key === "recibido" ? "Recepción parcial" : meta.etapa.label}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 15 }}>
                  <div style={{ width: 54, height: 42, display: "grid", placeItems: "center", borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s1, overflow: "hidden", flexShrink: 0 }}>
                    {chapa ? <ChapaSwatch tipo={chapa} size="lg" /> : <Box size={17} color={C.t2} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, color: C.t0, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombreMuebles(lote)}</h2>
                    <div style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>{nombreLinea(lote)} · {cantidadMuebles(lote)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 15, padding: "10px 0", borderTop: `1px solid ${C.b0}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><div style={{ color: C.t2, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Chapa</div><div style={{ color: C.t1, fontSize: 11, marginTop: 4 }}>{chapa || "Sin definir"}</div></div>
                  <div><div style={{ color: C.t2, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Material</div><div style={{ color: C.t1, fontSize: 11, marginTop: 4 }}>{lote.material_base || "Estándar de línea"}</div></div>
                </div>
                <div style={{ marginTop: "auto" }}>
                  <div style={{ height: 3, borderRadius: 99, background: C.s2, overflow: "hidden", marginBottom: 11 }}><div style={{ height: "100%", width: `${meta.progreso}%`, background: tone.color }} /></div>
                  {esAdmin && <button disabled={!listo} onClick={() => { setAsignando(lote); setUnidadId(""); }} style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 8, border: `1px solid ${listo ? C.greenB : C.b0}`, background: listo ? C.greenL : C.s1, color: listo ? C.green : C.t3, cursor: listo ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 850 }}>Asignar a una obra <ArrowRight size={14} /></button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {asignando && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.62)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "min(440px,100%)", borderRadius: 14, border: `1px solid ${C.b1}`, background: C.bg1, boxShadow: "0 22px 70px rgba(0,0,0,.4)" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div><div style={{ color: C.t0, fontWeight: 850 }}>Asignar {nombreMuebles(asignando)}</div><div style={{ color: C.t2, fontSize: 11, marginTop: 4 }}>Solo se muestran obras de la línea {nombreLinea(asignando)}.</div></div>
              <button onClick={() => setAsignando(null)} style={{ width: 29, height: 29, borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer" }}><X size={14} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <select style={field} value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                <option value="">Seleccionar obra</option>
                {compatibles.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.codigo}</option>)}
              </select>
              {!compatibles.length && <div style={{ marginTop: 8, color: C.blue, fontSize: 11 }}>No hay obras activas compatibles con esta línea.</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 16px", borderTop: `1px solid ${C.b0}` }}>
              <button onClick={() => setAsignando(null)} style={{ padding: "8px 11px", border: `1px solid ${C.b0}`, borderRadius: 8, background: "transparent", color: C.t1, cursor: "pointer", fontWeight: 750 }}>Cancelar</button>
              <button disabled={!unidadId} onClick={asignar} style={{ padding: "8px 12px", border: `1px solid ${C.greenB}`, borderRadius: 8, background: C.greenL, color: unidadId ? C.green : C.t3, cursor: unidadId ? "pointer" : "not-allowed", fontWeight: 850 }}>Confirmar asignación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
