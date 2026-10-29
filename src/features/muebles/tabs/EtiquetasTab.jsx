import { useEffect, useMemo, useState } from "react";
import { Eye, Printer, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/supabaseClient";
import Cargando from "@/components/ui/Cargando";
import { Aviso, Tag, Vacio } from "../ui";
import { ChapaSwatch } from "../chapa";
import { codigoObraEtiqueta, construirHtmlEtiquetasMuebles, seleccionarEtiquetasMuebles, FORMATOS_ETIQUETAS_MUEBLES } from "../etiquetasMuebles.js";
import { cargarDatosEtiquetasMuebles, cargarObrasEtiquetasMuebles } from "../etiquetasMueblesApi.js";

export default function EtiquetasTab({ client = supabase }) {
  const [formato, setFormato] = useState(() => {
    try { const guardado = localStorage.getItem("muebles-etiquetas-formato"); return FORMATOS_ETIQUETAS_MUEBLES.some(f => f.id === guardado) ? guardado : "40x30"; } catch { return "40x30"; }
  });
  const papel = FORMATOS_ETIQUETAS_MUEBLES.find(f => f.id === formato);
  const [catalogo, setCatalogo] = useState(null);
  const [unidadId, setUnidadId] = useState("");
  const [datos, setDatos] = useState(null);
  const [ids, setIds] = useState(new Set());
  const [vistaId, setVistaId] = useState(null);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const [err, setErr] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    let activo = true;
    cargarObrasEtiquetasMuebles(client).then(value => { if (activo) setCatalogo(value); })
      .catch(e => { if (activo) setErr(e.message); });
    return () => { activo = false; };
  }, [client, revision]);

  useEffect(() => {
    if (!unidadId) return undefined;
    let activo = true;
    cargarDatosEtiquetasMuebles(client, unidadId).then(value => {
      if (!activo) return;
      setDatos(value);
      const validas = value.etiquetas.filter(e => e.imprimible);
      setIds(new Set(validas.map(e => e.id)));
      setVistaId(validas[0]?.id ?? null);
    }).catch(e => { if (activo) setErr(e.message); });
    return () => { activo = false; };
  }, [client, unidadId, revision]);

  const detalle = datos?.unidad.id === unidadId ? datos : null;
  const cargando = Boolean(unidadId && !detalle && !err);
  const etiquetas = detalle?.etiquetas ?? [];
  const visibles = etiquetas.filter(e => `${e.numero ?? ""} ${e.nombre} ${e.sector}`.toLocaleLowerCase("es-AR").includes(q.trim().toLocaleLowerCase("es-AR")));
  const preview = etiquetas.find(e => e.id === vistaId && e.imprimible) ?? etiquetas.find(e => e.imprimible);
  const htmlPreview = useMemo(() => detalle && preview
    ? construirHtmlEtiquetasMuebles({ datos: detalle, ids: [preview.id], vistaPrevia: true, formato }) : "", [detalle, preview, formato]);
  const sinDatos = etiquetas.filter(e => !e.imprimible).length;

  function elegirObra(value) {
    setUnidadId(value); setDatos(null); setIds(new Set()); setVistaId(null); setQ(""); setErr("");
  }
  function actualizar() {
    setDatos(null); setIds(new Set()); setErr(""); setRevision(v => v + 1);
  }
  function alternar(id) {
    setIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setVistaId(id);
  }
  async function imprimir(una) {
    if (!detalle || !ids.size || imprimiendo) return;
    const obraId = unidadId;
    const seleccion = seleccionarEtiquetasMuebles(detalle, [...ids]).map(e => e.id);
    const win = window.open("", "_blank", "width=1040,height=820");
    if (!win) { setErr("Habilitá las ventanas emergentes para imprimir las etiquetas."); return; }
    win.document.write('<!doctype html><html lang="es"><title>Etiquetas de muebles</title><body style="font:16px Arial;padding:24px">Preparando etiquetas…</body></html>');
    win.document.close();
    setImprimiendo(true); setErr("");
    try {
      const actuales = await cargarDatosEtiquetasMuebles(client, obraId);
      const etiquetasActuales = seleccionarEtiquetasMuebles(actuales, seleccion);
      if (win.closed) return;
      const imprimirIds = una ? [etiquetasActuales[0].id] : seleccion;
      win.document.open();
      win.document.write(construirHtmlEtiquetasMuebles({ datos: actuales, ids: imprimirIds, autoPrint: true, formato }));
      win.document.close(); win.opener = null;
    } catch (e) {
      if (!win.closed) win.close();
      setErr(e.message || "No se pudieron preparar las etiquetas.");
    } finally { setImprimiendo(false); }
  }

  return <div className="mbl-etiquetas">
    <header className="mbl-barra">
      <div className="mbl-barra-fila">
        <div className="mbl-titulos"><div className="mbl-eyebrow">Muebles · {papel.nombre}</div><h1 className="mbl-h1">Etiquetas</h1><p className="mbl-sub">Obra, enchapado y número de pieza, listos para el taller.</p></div>
        <div className="mbl-acciones">
          <button type="button" className="ui-btn chico" disabled={!ids.size || cargando || imprimiendo} onClick={() => imprimir(true)}><Printer size={14} /> Probar una</button>
          <button type="button" className="ui-btn ui-btn-primario chico" disabled={!ids.size || cargando || imprimiendo} onClick={() => imprimir(false)}><Printer size={14} /> {imprimiendo ? "Preparando…" : `Imprimir seleccionadas (${ids.size})`}</button>
        </div>
      </div>
      <div className="mbl-et-controles">
        <label className="mbl-campo"><span>Embarcación</span><select className="ui-input" aria-label="Embarcación para etiquetas" value={unidadId} disabled={!catalogo || imprimiendo} onChange={e => elegirObra(e.target.value)}>
          <option value="">Elegí una obra</option>{catalogo?.unidades.map(u => <option key={u.id} value={u.id}>{codigoObraEtiqueta(u.codigo)} · {catalogo.lineas.find(l => l.id === u.linea_id)?.nombre ?? "Muebles"}</option>)}
        </select></label>
        <label className="mbl-campo"><span>Tamaño del rollo</span><select className="ui-input" aria-label="Tamaño de las etiquetas" value={formato} disabled={imprimiendo} onChange={e => { setFormato(e.target.value); try { localStorage.setItem("muebles-etiquetas-formato", e.target.value); } catch { /* El tamaño sigue disponible sin almacenamiento. */ } }}>
          {FORMATOS_ETIQUETAS_MUEBLES.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select></label>
        <label className="mbl-et-buscar"><Search size={15} /><input className="ui-input" aria-label="Buscar pieza para etiquetas" placeholder="Pieza, sector o número…" value={q} disabled={!detalle} onChange={e => setQ(e.target.value)} /></label>
        <button type="button" className="ui-btn chico" disabled={cargando || imprimiendo} onClick={actualizar}><RefreshCw size={14} /> Actualizar</button>
      </div>
    </header>
    <div className="mbl-et-cuerpo">
      {err && <Aviso onCerrar={detalle ? () => setErr("") : undefined}>{err}</Aviso>}
      {!catalogo && !err ? <Cargando texto="Leyendo las embarcaciones…" /> : !unidadId ? <Vacio icono={Printer} titulo="Elegí una embarcación" texto="Vas a poder imprimir todas sus piezas o elegir las que necesitás." /> : cargando ? <Cargando texto="Preparando las piezas y el enchapado…" /> : detalle && <div className="mbl-et-grilla">
        <section className="mbl-et-panel" aria-label="Piezas para etiquetar">
          <div className="mbl-et-panel-cab"><div><b>{detalle.obra}</b><span>{ids.size} {ids.size === 1 ? "seleccionada" : "seleccionadas"} de {etiquetas.length}</span></div><div className="mbl-et-seleccion"><button type="button" className="mbl-link" onClick={() => setIds(prev => new Set([...prev, ...visibles.filter(e => e.imprimible).map(e => e.id)]))}>Seleccionar visibles</button><button type="button" className="mbl-link" disabled={!ids.size} onClick={() => setIds(new Set())}>Quitar selección</button></div></div>
          {sinDatos > 0 && <div className="mbl-et-nota"><Aviso tono="neutro">{sinDatos} {sinDatos === 1 ? "pieza sin nombre o número" : "piezas sin nombre o número"}. Revisá la plantilla en Recepción.</Aviso></div>}
          {!etiquetas.length ? <Vacio titulo="Esta obra no tiene piezas" texto="Agregalas desde Recepción para preparar sus etiquetas." /> : !visibles.length ? <Vacio titulo="No hay coincidencias" texto="Probá con otro nombre o número de pieza." /> : visibles.map(e => <div key={e.id} className={`mbl-et-fila${e.id === preview?.id ? " on" : ""}`}>
            <label><input type="checkbox" aria-label={`Seleccionar pieza ${e.numero ?? "sin número"}: ${e.nombre || "Sin nombre"}`} checked={ids.has(e.id)} disabled={!e.imprimible || imprimiendo} onChange={() => alternar(e.id)} /><span className="mbl-et-nro mono">{e.numero ?? "—"}</span><span className="mbl-et-nombre"><b>{e.nombre || "Sin nombre"}</b><small>{e.sector || "Muebles"}{!e.numero ? " · Sin número de línea" : ""}</small></span></label>
            <button type="button" className="mbl-btn-ic" disabled={!e.imprimible} aria-label={`Ver etiqueta de ${e.nombre}`} title="Ver etiqueta" onClick={() => setVistaId(e.id)}><Eye size={15} /></button>
          </div>)}
        </section>
        <aside className="mbl-et-preview"><div className="mbl-et-panel"><div className="mbl-et-panel-cab"><b>Vista previa</b><Tag>{papel.nombre}</Tag></div><div className="mbl-et-papel" style={{ "--et-alto": `${papel.disenoAlto}mm` }}>{preview ? <iframe title="Vista previa de la etiqueta de muebles" sandbox="allow-scripts" srcDoc={htmlPreview} /> : <Vacio titulo="Sin piezas para imprimir" />}</div><div className="mbl-et-enchapado">{detalle.enchapado && <ChapaSwatch tipo={detalle.enchapado} size="md" />}<div><small>Enchapado de la obra</small><b>{detalle.enchapado || "Enchapado a confirmar"}</b></div></div></div>
          {!detalle.enchapado && <Aviso tono="neutro">Falta el enchapado. Podés cargarlo en Recepción; por ahora la etiqueta dirá «Enchapado a confirmar».</Aviso>}
          <p className="mbl-et-ayuda">P1S · {papel.nombre} · {papel.rotar ? "Vertical" : "Sin giro"} · Escala 100 %<br />Sin márgenes ni encabezados.</p>
        </aside>
      </div>}
    </div>
  </div>;
}
