// Primera pregunta de la línea: cuántas semanas dura la producción, contando
// siempre desde el desmolde (semanas de laminado antes, semanas hasta la
// botadura después). Con esto se arman las semanas del plan a revisar.
import { useState } from "react";
import { Check, Minus, Plus, Undo2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { deshacer, guardarSemanasLinea } from "./revisionesApi";

function Paso({ etiqueta, ayuda, valor, min, max, onCambio }) {
  return (
    <div className="rv-paso">
      <div className="rv-paso-txt"><b>{etiqueta}</b><small>{ayuda}</small></div>
      <div className="rv-stepper">
        <button type="button" className="ui-btn ui-btn-icono" onClick={() => onCambio(Math.max(min, valor - 1))} disabled={valor <= min} aria-label={`Una semana menos: ${etiqueta}`}><Minus size={16} /></button>
        <input className="ui-input" inputMode="numeric" value={valor} aria-label={etiqueta}
          onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (Number.isFinite(n)) onCambio(Math.min(max, n)); }} />
        <button type="button" className="ui-btn ui-btn-icono" onClick={() => onCambio(Math.min(max, valor + 1))} disabled={valor >= max} aria-label={`Una semana más: ${etiqueta}`}><Plus size={16} /></button>
      </div>
    </div>
  );
}

export default function LoteInicio({ item, modelo, editable, onItem }) {
  const toast = useToast();
  const c = item.contexto || {};
  const v = item.valor || {};
  const antesInicial = Number(v.antes ?? c.antes ?? c.antes_plan ?? 3) || 3;
  const despuesInicial = Number(v.despues ?? c.despues ?? (c.total ? Number(c.total) - antesInicial : 15)) || 15;
  const [antes, setAntes] = useState(antesInicial);
  const [despues, setDespues] = useState(despuesInicial);
  const [busy, setBusy] = useState(false);
  const total = antes + despues;
  const pctAntes = total ? (antes / total) * 100 : 0;

  async function guardar() {
    setBusy(true);
    try {
      onItem(await guardarSemanasLinea(item.id, antes, despues));
      toast.success(`Listo: la K${modelo} dura ${total} semanas. Desde mañana revisás el plan semana por semana.`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function volverAtras() {
    setBusy(true);
    try { onItem(await deshacer(item.id)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="rv-cond">
      <div className="rv-cond-tit">
        <span className="rv-etapa-sub">Para empezar · K{modelo}</span>
        <h2>¿Cuántas semanas dura la producción de la K{modelo}?</h2>
        <p>Un estimado, desde que se empieza a laminar hasta la botadura. Todo se cuenta desde el desmolde: cuántas semanas de laminado hay antes y cuántas pasan hasta botar.</p>
      </div>

      <div className="rv-linea-tiempo" aria-hidden="true">
        <div className="rv-lt-arriba"><span className="rv-lt-desmolde" style={{ left: `${Math.min(88, Math.max(12, pctAntes))}%` }}>Desmolde ▾</span></div>
        <div className="rv-lt-barra">
          <span className="rv-lt-antes" style={{ width: `${pctAntes}%` }}>{antes} sem</span>
          <span className="rv-lt-despues" style={{ width: `${100 - pctAntes}%` }}>{despues} sem</span>
        </div>
        <div className="rv-lt-marcas">
          <span>Empieza el laminado</span>
          <span>Botadura</span>
        </div>
      </div>

      {item.respuesta ? (
        <div className="rv-respuesta is-ok">
          <Check size={16} aria-hidden="true" />
          <span>La K{modelo} dura {Number(v.antes) + Number(v.despues)} semanas: {v.antes} de laminado y {v.despues} del desmolde a la botadura{item.perfil?.username ? <small> · {item.perfil.username}</small> : null}</span>
          {editable && <button type="button" className="ui-btn ui-btn-fantasma" disabled={busy} onClick={volverAtras}><Undo2 size={14} />Deshacer</button>}
        </div>
      ) : editable ? (
        <>
          <Paso etiqueta="Semanas de laminado antes del desmolde" ayuda="Desde que se empieza a laminar el casco." valor={antes} min={1} max={30} onCambio={setAntes} />
          <Paso etiqueta="Semanas del desmolde a la botadura" ayuda="Todo lo que se hace con el barco ya desmoldado." valor={despues} min={1} max={80} onCambio={setDespues} />
          <div className="rv-pie">
            <span className="rv-total">Producción total: <b>{total} semanas</b></span>
            <button type="button" className="ui-btn ui-btn-primario" style={{ marginLeft: "auto" }} disabled={busy} onClick={guardar}><Check size={16} />Guardar</button>
          </div>
          <p className="rv-ayuda">Con esto armamos el plan: desde mañana te va a tocar revisar una semana por día, de la primera de laminado a la de la botadura.</p>
        </>
      ) : <div className="rv-ayuda" style={{ color: "var(--cyan)" }}>Todavía no lo contestaron.</div>}
    </section>
  );
}
