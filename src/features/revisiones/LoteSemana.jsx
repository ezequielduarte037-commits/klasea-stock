// Una semana del plan de producción (de la -3 a la botada): qué etapas
// caen, qué tareas tienen y qué materiales se necesitan. Las etapas se pueden
// ubicar o mover y se les asignan materiales de la matriz, como en Obras ›
// Configuración.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Undo2, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { ajustarEtapa, cargarPlan, deshacer, materialEtapa, responder, semanasDeEtapa } from "./revisionesApi";
import { RielSemanas } from "./revisionesUI";
import { fmtNum } from "./revisionesFormato";

function textoSemana(item) {
  if (item.respuesta === "ok") return "La semana está bien";
  if (item.respuesta === "corregir") return `Hay que corregir · ${item.nota || ""}`;
  return item.respuesta || "";
}

const nombreSemana = (w, ultima) => (w === 0 ? "Semana 0 · desmolde" : w === ultima ? `Semana ${w} · botada` : `Semana ${w}`);

export default function LoteSemana({ item, modelo, editable, onItem }) {
  const toast = useToast();
  const semana = Number(item.contexto?.semana ?? item.semana ?? 0);
  const ultima = Number(item.contexto?.ultima ?? 20);
  const [viendo, setViendo] = useState(semana);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [busy, setBusy] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [nota, setNota] = useState("");

  useEffect(() => {
    let vivo = true;
    cargarPlan(modelo).then((p) => { if (vivo) { setPlan(p); setError(""); } }).catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [modelo, recarga]);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const { enSemana, sinUbicar, densidad } = useMemo(() => {
    const etapas = plan?.etapas || [];
    const dens = new Map();
    for (const e of etapas) {
      const s = semanasDeEtapa(e);
      if (!s) continue;
      for (let w = s.desde; w <= s.hasta; w += 1) dens.set(w, (dens.get(w) || 0) + 1);
    }
    return {
      enSemana: etapas.filter((e) => { const s = semanasDeEtapa(e); return s && s.desde <= viendo && viendo <= s.hasta; }),
      sinUbicar: etapas.filter((e) => !semanasDeEtapa(e)),
      densidad: dens,
    };
  }, [plan, viendo]);

  async function enviar(respuesta, texto = null) {
    setBusy(true);
    try { onItem(await responder(item.id, respuesta, null, texto)); setCorrigiendo(false); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function volverAtras() {
    setBusy(true);
    try { onItem(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="rv-foco">
      <div className="rv-plan-riel">
        <RielSemanas desde={-3} hasta={ultima} activa={viendo} densidad={densidad} onElegir={setViendo} />
      </div>
      <div className="rv-cond-tit">
        <span className="rv-etapa-sub">K{modelo} · plan desde el desmolde</span>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 650 }}>{nombreSemana(viendo, ultima)}</h2>
        {viendo !== semana
          ? <p className="rv-ayuda">Estás mirando otra semana. <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setViendo(semana)}>Volver a la {nombreSemana(semana, ultima).toLowerCase()}</button></p>
          : <p className="rv-ayuda">¿Qué se hace esta semana y qué materiales hacen falta? Mové las etapas que no estén bien ubicadas y sumá los materiales de cada una.</p>}
      </div>

      {error && <div className="rv-error" role="alert">{error}</div>}
      {!plan && !error && <Cargando texto="Armando el plan de la línea…" />}
      {plan && !plan.linea && <p className="rv-vacio">La K{modelo} no tiene una plantilla de etapas en Obras.</p>}

      {plan?.linea && (
        <>
          {enSemana.map((e) => <EtapaCard key={e.id} etapa={e} matriz={plan.matriz} editable={editable} onCambio={recargar} />)}
          {!enSemana.length && <p className="rv-vacio">No hay etapas ubicadas en esta semana{sinUbicar.length ? ": ubicá las que faltan acá abajo." : "."}</p>}
          {sinUbicar.length > 0 && <SinUbicar etapas={sinUbicar} semanaSugerida={viendo} editable={editable} onCambio={recargar} />}
        </>
      )}

      {viendo === semana && (item.respuesta ? (
        <div className={`rv-respuesta ${item.respuesta === "corregir" ? "is-mal" : "is-ok"}`}>
          {item.respuesta === "corregir" ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          <span>{textoSemana(item)}{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
          {editable && <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={volverAtras}><Undo2 size={14} />Deshacer</button>}
        </div>
      ) : editable ? (corrigiendo ? (
        <form className="rv-form" onSubmit={(ev) => { ev.preventDefault(); enviar("corregir", nota); }}>
          <label>¿Qué hay que corregir?<input className="ui-input" value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Ej.: la pintura de fondo va antes del eje" autoFocus /></label>
          <button type="submit" className="ui-btn ui-btn-primario" disabled={busy || !nota.trim()}>Guardar</button>
          <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setCorrigiendo(false)} aria-label="Cancelar"><X size={16} /></button>
        </form>
      ) : (
        <div className="rv-decidir">
          <button type="button" className="ui-btn rv-btn-bien" disabled={busy} onClick={() => enviar("ok")}><Check size={18} />Esta semana está bien</button>
          <button type="button" className="ui-btn ui-btn-peligro" disabled={busy} onClick={() => setCorrigiendo(true)}><X size={18} />Hay algo para corregir</button>
        </div>
      )) : <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Sin revisar</div>)}
    </div>
  );
}

function EtapaCard({ etapa, matriz, editable, onCambio }) {
  const toast = useToast();
  const span = semanasDeEtapa(etapa);
  const [editando, setEditando] = useState(false);
  const [semanas, setSemanas] = useState(String(etapa.semana ?? ""));
  const [dias, setDias] = useState(String(etapa.dias_estimados ?? ""));
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const yaTiene = new Set(etapa.materiales.map((m) => m.material_id));
  const q = texto.trim().toLowerCase();
  const opciones = q.length >= 2
    ? matriz.filter((m) => !yaTiene.has(m.id) && `${m.descripcion} ${m.codigo || ""}`.toLowerCase().includes(q)).slice(0, 12)
    : [];

  async function correr(fn, ok) {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); onCambio(); return true; }
    catch (e) { toast.error(e.message); return false; }
    finally { setBusy(false); }
  }

  return (
    <article className="rv-etapa">
      <div className="rv-etapa-top">
        <h3>{etapa.nombre}</h3>
        <span className="rv-etapa-span">{span.desde === span.hasta ? `Semana ${span.desde}` : `Semana ${span.desde} → ${span.hasta}`} · {fmtNum(etapa.dias_estimados) || "?"} días</span>
        {editable && <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => setEditando(!editando)} aria-label="Mover o cambiar duración" title="Mover o cambiar duración"><Pencil size={15} /></button>}
      </div>
      {editando && (
        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); correr(() => ajustarEtapa(etapa.id, semanas === "" ? null : Number(semanas), dias === "" ? null : Number(dias)), "Etapa actualizada.").then((ok) => { if (ok) setEditando(false); }); }}>
          <label>Arranca en la semana<input className="ui-input" inputMode="numeric" value={semanas} onChange={(e) => setSemanas(e.target.value)} /></label>
          <label>Días que dura<input className="ui-input" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
          <button type="submit" className="ui-btn ui-btn-primario" disabled={busy}>Guardar</button>
        </form>
      )}
      <div className="rv-etapa-sub">Tareas</div>
      {etapa.tareas.length ? (
        <ol className="rv-tareas">
          {etapa.tareas.slice(0, 12).map((t) => <li key={t.id}>{t.nombre}</li>)}
          {etapa.tareas.length > 12 && <li style={{ listStyle: "none", marginLeft: -18 }}>… y {etapa.tareas.length - 12} más en Obras › Configuración</li>}
        </ol>
      ) : <p className="rv-ayuda">Sin tareas cargadas.</p>}
      <div className="rv-etapa-sub">Materiales que necesita</div>
      <div className="rv-chips">
        {etapa.materiales.map((m) => (
          <span key={m.material_id} className="rv-chip-mat">
            <span>{m.material?.descripcion || "Material"}{m.cantidad ? ` · ${fmtNum(m.cantidad)}` : ""}</span>
            {editable && <button type="button" disabled={busy} aria-label={`Quitar ${m.material?.descripcion || "material"}`} onClick={() => correr(() => materialEtapa(etapa.id, m.material_id, true))}><X size={13} /></button>}
          </span>
        ))}
        {!etapa.materiales.length && <span className="rv-ayuda">Todavía ninguno.</span>}
        {editable && !buscando && <button type="button" className="ui-btn ui-btn-suave" style={{ minHeight: 30, padding: "0 10px", fontSize: 12.5 }} onClick={() => setBuscando(true)}><Plus size={14} />Material</button>}
      </div>
      {buscando && (
        <div className="rv-buscar" style={{ display: "grid", gap: 6 }}>
          <div className="rv-form">
            <label>Buscar en la matriz de la línea<input className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Descripción o código" autoFocus /></label>
            <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => { setBuscando(false); setTexto(""); }} aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="rv-resultados">
            {opciones.map((m) => (
              <button key={m.id} type="button" className="rv-resultado" disabled={busy} onClick={() => correr(() => materialEtapa(etapa.id, m.id))}>
                <span>{m.descripcion}</span><small>{fmtNum(m.cantidad)} por barco{m.codigo ? ` · Cód. ${m.codigo}` : ""}</small>
              </button>
            ))}
            {q.length >= 2 && !opciones.length && <small className="rv-ayuda">No está en la matriz (o ya está en esta etapa).</small>}
          </div>
        </div>
      )}
    </article>
  );
}

function SinUbicar({ etapas, semanaSugerida, editable, onCambio }) {
  const toast = useToast();
  const [valores, setValores] = useState({});
  const [busy, setBusy] = useState(false);
  async function ubicar(e) {
    const v = valores[e.id] || {};
    const semanas = v.semanas ?? String(semanaSugerida);
    setBusy(true);
    try {
      await ajustarEtapa(e.id, Number(semanas), v.dias ? Number(v.dias) : null);
      toast.success(`«${e.nombre}» ubicada en la semana ${semanas}.`);
      onCambio();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="rv-sin-ubicar">
      <div className="rv-etapa-sub" style={{ color: "var(--violet)" }}>Etapas sin ubicar ({etapas.length})</div>
      <p className="rv-ayuda">Decí en qué semana respecto del desmolde arranca cada una (−3 = tres semanas antes) y cuántos días dura.</p>
      {etapas.map((e) => (
        <div key={e.id} className="rv-sin-ubicar-fila">
          <span>{e.nombre}</span>
          {editable && <>
            <input className="ui-input rv-mini-input" inputMode="numeric" aria-label={`Semana de inicio de ${e.nombre}`} placeholder={String(semanaSugerida)}
              value={valores[e.id]?.semanas ?? ""} onChange={(ev) => setValores((p) => ({ ...p, [e.id]: { ...p[e.id], semanas: ev.target.value } }))} />
            <input className="ui-input rv-mini-input" inputMode="numeric" aria-label={`Días de ${e.nombre}`} placeholder={e.dias_estimados ? String(e.dias_estimados) : "días"}
              value={valores[e.id]?.dias ?? ""} onChange={(ev) => setValores((p) => ({ ...p, [e.id]: { ...p[e.id], dias: ev.target.value } }))} />
            <button type="button" className="ui-btn" disabled={busy} onClick={() => ubicar(e)}>Ubicar</button>
          </>}
        </div>
      ))}
    </section>
  );
}
