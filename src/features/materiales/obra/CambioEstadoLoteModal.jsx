import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { C } from "@/theme";
import useDialogo from "@/features/consumibles/useDialogo";
import { BTN, BTN_PRIMARY, INP, LBL } from "@/features/rrhh/ui";
import { ESTADOS_LOTE, planCambioEstadoLote } from "./cambioEstadoLote";

/**
 * Elegir un estado y aplicarlo a todos los renglones tildados. Antes de
 * confirmar dice cuántos cambian, cuántos ya estaban así y cuántos se van a
 * descontar del pañol, para que nadie lo descubra después en el stock.
 */
export default function CambioEstadoLoteModal({ rows, estadoDe, obraCodigo, onCerrar, onConfirmar, busy, avance }) {
  const ref = useRef(null);
  useDialogo(ref, busy ? undefined : onCerrar);
  const [estado, setEstado] = useState("egresado");
  const [nota, setNota] = useState("");
  const [retira, setRetira] = useState("");
  const plan = useMemo(() => planCambioEstadoLote(rows, estado, estadoDe), [rows, estado, estadoDe]);
  const faltaPersona = plan.pideQuienRetiro && !retira.trim();
  const puede = !busy && plan.aplicar.length > 0 && !faltaPersona;
  const nombre = ESTADOS_LOTE.find((e) => e.value === estado)?.label || estado;

  return createPortal(<div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCerrar(); }} style={{ position: "fixed", inset: 0, zIndex: 5100, background: "var(--overlay-strong)", display: "grid", placeItems: "center", padding: 16 }}>
    <form ref={ref} role="dialog" aria-modal="true" aria-label="Cambiar estado de los tildados" tabIndex={-1}
      onSubmit={(e) => { e.preventDefault(); if (puede) onConfirmar({ estado, nota, retiradoPor: retira, filas: plan.aplicar }); }}
      style={{ width: "min(480px,100%)", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${C.b1}`, borderRadius: 14, background: C.panelSolid, boxShadow: "var(--elev-2)", padding: 18, display: "grid", gap: 14, color: C.t0, fontFamily: C.sans }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: 15, fontWeight: 650 }}>Cambiar estado de {rows.length} {rows.length === 1 ? "ítem" : "ítems"}</strong>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>Obra {obraCodigo} · queda registrado como regularización</div>
        </div>
        <button type="button" aria-label="Cerrar" disabled={busy} onClick={onCerrar} style={{ ...BTN, padding: 6, display: "grid", placeItems: "center" }}><X size={16} /></button>
      </div>

      <div role="radiogroup" aria-label="Nuevo estado" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 6 }}>
        {ESTADOS_LOTE.map((op) => {
          const on = estado === op.value;
          return <button key={op.value} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setEstado(op.value)}
            style={{ ...BTN, minHeight: 38, justifyContent: "center", fontWeight: on ? 600 : 500, color: on ? C.blue : C.t1, borderColor: on ? C.blueB : C.b0, background: on ? C.blueL : C.panelSolid }}>{op.label}</button>;
        })}
      </div>

      <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.5, display: "grid", gap: 3 }}>
        <span><strong className="num" style={{ fontFamily: C.mono }}>{plan.aplicar.length}</strong> pasan a {nombre}.</span>
        {plan.yaEstan.length > 0 && <span style={{ color: C.t2 }}>{plan.yaEstan.length} ya estaban en {nombre} y no se tocan.</span>}
        {plan.descuentanStock.length > 0 && <span style={{ color: C.violet }}>{plan.descuentanStock.length} están en pañol: al pasar a Entregado se descuentan del stock.</span>}
        <span style={{ color: C.t3, fontSize: 11 }}>«En pañol» no está acá porque suma stock: ese paso se hace de a uno o desde Ingresos.</span>
      </div>

      {plan.pideQuienRetiro && <label style={{ display: "grid", gap: 5 }}>
        <span style={LBL}>¿Quién lo retiró?</span>
        <input value={retira} onChange={(e) => setRetira(e.target.value)} disabled={busy} placeholder="Nombre y apellido, o «Anterior al sistema»"
          style={{ ...INP, width: "100%", boxSizing: "border-box", borderColor: faltaPersona ? C.redB : C.b0 }} />
      </label>}
      <label style={{ display: "grid", gap: 5 }}>
        <span style={LBL}>Nota (opcional)</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} disabled={busy} maxLength={200} placeholder="Ej.: barco anterior al sistema, se colocó en 2025"
          style={{ ...INP, width: "100%", boxSizing: "border-box" }} />
      </label>

      {busy && avance && <div role="status" style={{ display: "grid", gap: 5, fontSize: 12, color: C.t2 }}>
        <span>Guardando {avance.hechos} de {avance.total}…</span>
        <div style={{ height: 4, borderRadius: 99, background: C.s1 || "var(--panel-2)", overflow: "hidden" }}><div style={{ height: "100%", width: `${(avance.hechos / Math.max(1, avance.total)) * 100}%`, background: C.blue, transition: "width 150ms ease" }} /></div>
      </div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCerrar} disabled={busy} style={BTN}>Cancelar</button>
        <button type="submit" disabled={!puede} style={{ ...BTN_PRIMARY, opacity: puede ? 1 : 0.55 }}>{busy ? "Guardando…" : `Pasar ${plan.aplicar.length} a ${nombre}`}</button>
      </div>
    </form>
  </div>, document.body);
}
