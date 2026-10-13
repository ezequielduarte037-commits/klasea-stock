import { useRef, useState } from "react";
import { LoaderCircle, Undo2, X, Zap } from "lucide-react";
import { SECTORES, crearSolicitud } from "@/features/panol/solicitudesPanolApi";
import { hoyArgentina } from "@/features/consumibles/api";
import useDialogo from "../useDialogo";
import { deshacerEntrega, mensajeError } from "./solicitudesApi";
import { proximoDiaHabil } from "./solicitudesLogica";

/**
 * Hoja sobre la pestaña: tarjeta centrada en la PC, hoja desde abajo en el
 * celular. Mientras algo se está guardando no se cierra (ni con Escape ni
 * tocando afuera): cerrar a mitad de camino deja la duda de si se grabó.
 */
export function Hoja({ titulo, subtitulo, etiqueta, bloqueada = false, onCerrar, onKeyDown, children, panelRef }) {
  const propio = useRef(null);
  const ref = panelRef ?? propio;
  useDialogo(ref, bloqueada ? () => {} : onCerrar);
  return (
    <div className="sol-hoja-fondo" onPointerDown={(e) => { if (e.target === e.currentTarget && !bloqueada) onCerrar(); }}>
      <div ref={ref} className="sol-hoja" role="dialog" aria-modal="true" aria-label={etiqueta || titulo} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="sol-hoja-cab">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{titulo}</h3>
            {subtitulo ? <p>{subtitulo}</p> : null}
          </div>
          <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" style={{ width: 44, minHeight: 44 }} aria-label="Cerrar" disabled={bloqueada} onClick={onCerrar}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Deshacer una entrega: anula los retiros y la deja lista para retirar otra vez. */
export function DeshacerEntrega({ solicitud, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const enviandoRef = useRef(false);

  async function confirmar() {
    if (enviandoRef.current || !motivo.trim()) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    try {
      const res = await deshacerEntrega(solicitud.id, motivo);
      onHecho(res);
    } catch (e) {
      setError(mensajeError(e, "No se pudo deshacer la entrega."));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <Hoja
      titulo={`Deshacer la entrega N° ${solicitud.numero}`}
      subtitulo={`Se anulan los retiros registrados${solicitud.retirado_por_nombre ? ` a nombre de ${solicitud.retirado_por_nombre}` : ""} y vuelve a "Lista para retirar".`}
      bloqueada={enviando}
      onCerrar={onCerrar}
    >
      <label className="sol-campo">
        <span>¿Por qué se deshace?</span>
        <textarea
          className="ui-input"
          value={motivo}
          maxLength={300}
          placeholder="Se firmó con la tarjeta de otro, no se la llevó…"
          onChange={(e) => setMotivo(e.target.value)}
          autoFocus
        />
      </label>
      {error ? <div className="sol-aviso is-rojo" role="alert"><Undo2 size={16} /><div className="sol-aviso-texto">{error}</div></div> : null}
      <div className="sol-hoja-acciones">
        <button type="button" className="ui-btn" disabled={enviando} onClick={onCerrar}>Volver</button>
        <button type="button" className="ui-btn ui-btn-peligro" disabled={enviando || !motivo.trim()} onClick={confirmar} style={{ minHeight: 44 }}>
          {enviando ? <LoaderCircle size={16} className="sol-gira" /> : <Undo2 size={16} />} Deshacer la entrega
        </button>
      </div>
    </Hoja>
  );
}

/**
 * Cargar un papel: pañol ya lo tiene en la mano, así que arranca en
 * "preparando". Con la cabecera alcanza para crearla; los renglones se cargan
 * en el detalle (a mano, con el lector o leyendo la foto de la hoja).
 */
export function NuevaSolicitud({ sede, obras = [], onCerrar, onCreada }) {
  const [obraId, setObraId] = useState("");
  const [sector, setSector] = useState("");
  const [solicita, setSolicita] = useState("");
  const [retira, setRetira] = useState("");
  const [fechaRetiro, setFechaRetiro] = useState(() => proximoDiaHabil(hoyArgentina()));
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const enviandoRef = useRef(false);

  const puede = Boolean(solicita.trim() || obraId);

  async function crear() {
    if (enviandoRef.current) return;
    if (!puede) { setError("Cargá al menos quién pide o para qué obra es."); return; }
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    try {
      const obra = obras.find((o) => o.id === obraId);
      const creada = await crearSolicitud({
        obra_id: obraId || null,
        obra_texto: obra?.codigo || null,
        sector: sector || null,
        sede_origen: sede,
        fecha_pedido: hoyArgentina(),
        fecha_retiro: fechaRetiro || null,
        solicita: solicita.trim() || null,
        retira: retira.trim() || null,
        prioridad: urgente ? "urgente" : "normal",
        tipo: ["Consumibles"],
        origen: "papel",
        estado: "preparando",
      });
      onCreada(creada);
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear la solicitud."));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <Hoja
      titulo="Cargar un papel"
      subtitulo={`Solicitud del pañol ${sede}. Después cargás los renglones o leés la foto de la hoja.`}
      bloqueada={enviando}
      onCerrar={onCerrar}
    >
      <div className="sol-cabecera">
        <label className="sol-campo">
          <span>Obra</span>
          <select className="ui-input" value={obraId} onChange={(e) => setObraId(e.target.value)}>
            <option value="">Sin obra</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}{o.descripcion ? ` · ${o.descripcion}` : ""}</option>)}
          </select>
        </label>
        <label className="sol-campo">
          <span>Sector</span>
          <select className="ui-input" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Sin sector</option>
            {SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="sol-campo">
          <span>Solicita</span>
          <input className="ui-input" value={solicita} maxLength={120} onChange={(e) => setSolicita(e.target.value)} placeholder="Quién firma el papel" autoFocus />
        </label>
        <label className="sol-campo">
          <span>Retira (si es otro)</span>
          <input className="ui-input" value={retira} maxLength={120} onChange={(e) => setRetira(e.target.value)} placeholder="Opcional" />
        </label>
        <label className="sol-campo">
          <span>Día de retiro</span>
          <input className="ui-input sol-num" type="date" value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} />
        </label>
        <div className="sol-campo">
          <span>Prioridad</span>
          <button type="button" className={`sol-urgente${urgente ? " is-activo" : ""}`} aria-pressed={urgente} onClick={() => setUrgente((u) => !u)}>
            <Zap size={15} /> {urgente ? "Urgente" : "Normal"}
          </button>
        </div>
      </div>
      {error ? <div className="sol-aviso is-rojo" role="alert"><X size={16} /><div className="sol-aviso-texto">{error}</div></div> : null}
      <div className="sol-hoja-acciones">
        <button type="button" className="ui-btn" disabled={enviando} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primario" style={{ minHeight: 44 }} disabled={enviando || !puede} onClick={crear}>
          {enviando ? <LoaderCircle size={16} className="sol-gira" /> : null} Crear y cargar renglones
        </button>
      </div>
    </Hoja>
  );
}
