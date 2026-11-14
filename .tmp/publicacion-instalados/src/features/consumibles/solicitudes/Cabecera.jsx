import { useState } from "react";
import { Pencil, Zap } from "lucide-react";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";
import { SEDES } from "@/features/consumibles/api";
import { fechaCorta, textoRetiro } from "./solicitudesLogica";

/**
 * Texto que se guarda al salir del campo (o con Enter). Sin estado propio: si
 * el valor cambia desde afuera (otro equipo, la lectura de la hoja), la `key`
 * lo vuelve a armar con lo nuevo.
 */
function CampoTexto({ etiqueta, valor, onGuardar, multilinea = false, ancho = false, placeholder }) {
  const props = {
    className: "ui-input",
    defaultValue: valor ?? "",
    maxLength: multilinea ? 600 : 160,
    placeholder,
    onBlur: (e) => {
      const nuevo = e.target.value.trim();
      if (nuevo !== String(valor ?? "").trim()) onGuardar(nuevo);
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" && !multilinea) { e.preventDefault(); e.currentTarget.blur(); }
    },
  };
  return (
    <label className={`sol-campo${ancho ? " is-ancho" : ""}`}>
      <span>{etiqueta}</span>
      {multilinea ? <textarea key={valor ?? ""} {...props} /> : <input key={valor ?? ""} {...props} />}
    </label>
  );
}

/**
 * Los datos de la solicitud. Plegados por defecto (lo que se trabaja son los
 * renglones); "Editar datos" abre el formulario mientras no esté entregada.
 */
export default function Cabecera({ solicitud: s, obras = [], editable, hoyIso, onGuardar, onCambiarSede }) {
  const [abierta, setAbierta] = useState(false);
  const obraActual = s.obra_id && !obras.some((o) => o.id === s.obra_id) ? s.obra : null;
  const retiro = textoRetiro(s.fecha_retiro, hoyIso, { cerrada: !editable });
  const obraTexto = s.obra?.codigo || s.obra_texto || "";

  if (!abierta || !editable) {
    return (
      <div className="sol-bloque">
        <div className="sol-bloque-titulo">
          Datos
          <span className="sol-espacio" />
          {editable ? (
            <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 36 }} onClick={() => setAbierta(true)}>
              <Pencil size={14} /> Editar datos
            </button>
          ) : null}
        </div>
        <div className="sol-cabecera">
          <Dato titulo="Obra / sector" valor={[obraTexto, s.sector].filter(Boolean).join(" · ") || "Sin obra ni sector"} />
          <Dato titulo="Solicita" valor={s.solicita || "—"} />
          <Dato titulo="Retira" valor={s.retira || (s.solicita ? "El que la pidió" : "—")} />
          <Dato
            titulo="Día de retiro"
            valor={s.fecha_retiro ? `${fechaCorta(s.fecha_retiro)}${retiro.tono === "manana" || retiro.tono === "hoy" ? ` · ${retiro.texto}` : ""}` : "Sin día"}
            tono={retiro.tono === "atrasada" ? "var(--red)" : null}
          />
          {s.tarea ? <Dato titulo="Tarea" valor={s.tarea} ancho /> : null}
          {s.observaciones ? <Dato titulo="Observaciones" valor={s.observaciones} ancho /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="sol-bloque">
      <div className="sol-bloque-titulo">
        Datos
        <span className="sol-espacio" />
        <button type="button" className="ui-btn ui-btn-fantasma" style={{ minHeight: 36 }} onClick={() => setAbierta(false)}>Listo</button>
      </div>
      <div className="sol-cabecera">
        <label className="sol-campo">
          <span>Obra</span>
          <select
            className="ui-input"
            value={s.obra_id || ""}
            onChange={(e) => {
              const obra = obras.find((o) => o.id === e.target.value) || (obraActual?.id === e.target.value ? obraActual : null);
              onGuardar({ obra_id: obra?.id || null, obra_texto: obra?.codigo || null });
            }}
          >
            <option value="">{!s.obra_id && s.obra_texto ? `Escrito: ${s.obra_texto}` : "Sin obra"}</option>
            {obraActual ? <option value={obraActual.id}>{obraActual.codigo} (no activa)</option> : null}
            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}{o.descripcion ? ` · ${o.descripcion}` : ""}</option>)}
          </select>
        </label>
        <label className="sol-campo">
          <span>Sector</span>
          <select className="ui-input" value={s.sector || ""} onChange={(e) => onGuardar({ sector: e.target.value || null })}>
            <option value="">Sin sector</option>
            {s.sector && !SECTORES.includes(s.sector) ? <option value={s.sector}>{s.sector}</option> : null}
            {SECTORES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <CampoTexto etiqueta="Solicita" valor={s.solicita} onGuardar={(v) => onGuardar({ solicita: v })} />
        <CampoTexto etiqueta="Retira (si es otro)" valor={s.retira} onGuardar={(v) => onGuardar({ retira: v })} placeholder="Opcional" />
        <label className="sol-campo">
          <span>Día de retiro</span>
          <input className="ui-input sol-num" type="date" value={s.fecha_retiro ? String(s.fecha_retiro).slice(0, 10) : ""} onChange={(e) => onGuardar({ fecha_retiro: e.target.value || null })} />
        </label>
        <div className="sol-campo">
          <span>Prioridad</span>
          <button
            type="button"
            className={`sol-urgente${s.prioridad === "urgente" ? " is-activo" : ""}`}
            aria-pressed={s.prioridad === "urgente"}
            onClick={() => onGuardar({ prioridad: s.prioridad === "urgente" ? "normal" : "urgente" })}
          >
            <Zap size={15} /> {s.prioridad === "urgente" ? "Urgente" : "Normal"}
          </button>
        </div>
        <label className="sol-campo">
          <span>Pañol</span>
          <select className="ui-input" value={s.sede_origen || ""} onChange={(e) => onCambiarSede(e.target.value || null)}>
            {!s.sede_origen ? <option value="">Sin sede</option> : null}
            {SEDES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <CampoTexto etiqueta="Tarea" valor={s.tarea} onGuardar={(v) => onGuardar({ tarea: v })} ancho />
        <CampoTexto etiqueta="Observaciones" valor={s.observaciones} onGuardar={(v) => onGuardar({ observaciones: v })} multilinea ancho />
      </div>
    </div>
  );
}

function Dato({ titulo, valor, ancho = false, tono = null }) {
  return (
    <div className={`sol-campo${ancho ? " is-ancho" : ""}`}>
      <span>{titulo}</span>
      <div style={{ fontSize: 14.5, fontWeight: 500, overflowWrap: "anywhere", color: tono || undefined }}>{valor}</div>
    </div>
  );
}
