// Panel de devoluciones del pañol.
//
// Tres columnas, que son las tres preguntas del pañolero:
//   · Para decidir      — volvió y está en el estante esperando que Compras diga
//   · En reparación     — salió, ¿a dónde y hace cuánto?
//   · Esperando reposición — el proveedor debe, ¿cuánto y hace cuánto?
//
// Dos datos mandan sobre todos los demás y por eso están arriba de todo:
//
//   · CUÁNTO SE PUEDE RECLAMAR. Sólo lo que vino fallado de fábrica. Lo que
//     rompimos nosotros se registra igual —el material salió y no volvió a
//     estar disponible— pero no entra en el reclamo. Sumarlos juntos da un
//     número que no se puede usar para llamar por teléfono.
//
//   · HACE CUÁNTO QUE NADIE LA TOCA. Una devolución de hace 40 días con la
//     última nota hace 38 está abandonada. Eso es distinto de una que se
//     gestionó ayer, y es lo único que separa un reclamo de una pérdida.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Building2, CircleDollarSign, Clock, Factory,
  MessageSquarePlus, PackageX, RotateCcw, Search, Send, User, Wrench, X,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import {
  DESTINO_TIPO_META,
  DEVOLUCION_DESTINO_TIPO,
  DEVOLUCION_ESTADOS,
  DEVOLUCION_RESPONSABLE,
  RESPONSABLE_META,
  agregarNotaDevolucion,
  fetchDevolucionNotas,
  fetchDevoluciones,
  resolverDevolucion,
} from "@/features/panol/panolApi";

const COLUMNAS = [
  {
    estado: "devuelto",
    titulo: "Para decidir",
    detalle: "Volvieron al pañol. Compras define qué se hace.",
    icon: AlertTriangle,
    color: C.red, soft: C.redL, borde: C.redB,
  },
  {
    estado: "en_reparacion",
    titulo: "En reparación",
    detalle: "Salieron a arreglar.",
    icon: Wrench,
    color: C.violet, soft: C.violetL, borde: C.violetB,
  },
  {
    estado: "esperando_reposicion",
    titulo: "Esperando reposición",
    detalle: "Falta que llegue el reemplazo.",
    icon: PackageX,
    color: C.cyan, soft: C.cyanL, borde: C.cyanB,
  },
];

// Acciones posibles desde cada estado. Sólo lo que tiene sentido: desde el
// estante se decide, y una vez afuera sólo se cierra.
const ACCIONES = {
  devuelto: [
    ["en_reparacion", "Mandar a reparar"],
    ["esperando_reposicion", "Reclamar reposición"],
    ["descartado", "Descartar"],
  ],
  en_reparacion: [
    ["reparado", "Volvió reparado"],
    ["esperando_reposicion", "No tiene arreglo: reponer"],
    ["descartado", "No tuvo arreglo"],
  ],
  esperando_reposicion: [
    ["repuesto", "Llegó el reemplazo"],
    ["nota_credito", "Nota de crédito"],
    ["rechazado", "El proveedor no se hizo cargo"],
  ],
};

// Los estados que sacan el material del pañol necesitan saber a dónde va y por
// cuenta de quién. "En reparación" a secas no sirve: en tres semanas nadie se
// acuerda a qué taller fue y el reclamo no se puede hacer.
const PIDE_DESTINO = {
  en_reparacion: {
    titulo: "Mandar a reparar",
    pregunta: "¿Quién lo arregla?",
    tipos: DEVOLUCION_DESTINO_TIPO,
    porDefecto: "proveedor",
  },
  esperando_reposicion: {
    titulo: "Reclamar reposición",
    pregunta: "¿A quién se le reclama?",
    tipos: [["proveedor", "Al proveedor que lo vendió"], ["taller", "A otro proveedor"]],
    porDefecto: "proveedor",
  },
};

const UMBRAL_VIEJO = 15;      // días afuera sin volver
const UMBRAL_QUIETO = 7;      // días sin que nadie la toque

function fmtMoneda(valor, moneda) {
  const n = Number(valor || 0);
  if (!n) return "";
  const texto = n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return moneda === "USD" ? `USD ${texto}` : `$${texto}`;
}

function fmtCantidad(valor, unidad) {
  const n = Number(valor || 0);
  const texto = Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  return `${texto} ${unidad || "u"}`;
}

function fmtFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

function dias(fila) {
  return fila.dias_afuera ?? fila.dias_desde_devolucion ?? 0;
}

// La vista vieja no traía responsable. Si la segunda migración todavía no corrió
// la pantalla sigue funcionando, tratando todo como "sin definir".
function responsableDe(fila) {
  return RESPONSABLE_META[fila.responsable] ? fila.responsable : "sin_definir";
}

function Chip({ children, color = C.dim, soft = "transparent", borde = C.border, icon: Icon, title }) {
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 6,
      background: soft, border: `1px solid ${borde}`, color,
      fontSize: 10.5, fontWeight: 850, whiteSpace: "nowrap",
    }}>
      {Icon && <Icon size={10} style={{ flexShrink: 0 }} />}
      {children}
    </span>
  );
}

function ChipResponsable({ fila }) {
  const clave = responsableDe(fila);
  if (clave === "proveedor") return <Chip color={C.cyan} soft={C.cyanL} borde={C.cyanB} icon={Factory} title="Vino fallado de fábrica: se le reclama al proveedor">Del proveedor</Chip>;
  if (clave === "nosotros") return <Chip color={C.red} soft={C.redL} borde={C.redB} icon={AlertTriangle} title="Se rompió acá: no es reclamable">Rotura nuestra</Chip>;
  return <Chip title="Falta definir de quién es la culpa">Culpa sin definir</Chip>;
}

function ChipDestino({ fila }) {
  if (!fila.destino && !fila.destino_tipo) return null;
  const meta = DESTINO_TIPO_META[fila.destino_tipo];
  const texto = fila.destino || meta?.label || "";
  const interno = fila.destino_tipo === "interno";
  return (
    <Chip
      color={interno ? C.green : C.violet}
      soft={interno ? C.greenL : C.violetL}
      borde={interno ? C.greenB : C.violetB}
      icon={interno ? Wrench : Building2}
      title={meta?.ayuda}
    >
      {texto}
    </Chip>
  );
}

/* ── tile de métrica ─────────────────────────────────────────────────────── */
function Tile({ label, valor, detalle, color = C.text, soft = "transparent", borde = C.border, icon: Icon }) {
  return (
    <div style={{ flex: "1 1 170px", minWidth: 0, borderRadius: 12, border: `1px solid ${borde}`, background: soft, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {Icon && <Icon size={11} style={{ flexShrink: 0 }} />}
        {label}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 19, fontWeight: 950, color, marginTop: 4, lineHeight: 1.1 }}>{valor}</div>
      {detalle && <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.35, marginTop: 3 }}>{detalle}</div>}
    </div>
  );
}

/* ── modal genérico ──────────────────────────────────────────────────────── */
function Modal({ titulo, bajada, ancho = 460, onClose, children, pie }) {
  // Va por portal: el panel vive dentro de una pestaña con overflow y transform,
  // y ahí un position:fixed queda atrapado igual que un absolute.
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(15,23,42,0.5)", display: "grid", placeItems: "center", padding: 16, overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: `min(${ancho}px, 100%)`, maxHeight: "92vh", display: "flex", flexDirection: "column", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, boxShadow: "0 24px 70px rgba(15,23,42,0.28)", overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{titulo}</div>
            {bajada && <div style={{ color: C.dim, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{bajada}</div>}
          </div>
          <button type="button" onClick={onClose} title="Cerrar"
            style={{ flexShrink: 0, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 8, width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12, overflow: "auto" }}>{children}</div>
        {pie && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

const inputSt = {
  width: "100%", minWidth: 0, boxSizing: "border-box",
  background: C.panel, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 9, padding: "9px 10px", fontSize: 13, fontFamily: C.sans, outline: "none",
};
const labelSt = { color: C.dim, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 };

function Opciones({ valor, onChange, opciones }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {opciones.map(([clave, label]) => {
        const on = valor === clave;
        return (
          <button key={clave} type="button" onClick={() => onChange(clave)}
            style={{
              padding: "7px 11px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${on ? C.blueB : C.border}`,
              background: on ? C.blueL : C.panel,
              color: on ? C.blue : C.muted,
              fontSize: 12, fontWeight: on ? 900 : 750, fontFamily: C.sans,
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── ficha completa ──────────────────────────────────────────────────────── */
// Todo lo que se sabe de una devolución en un solo lugar, más el hilo de notas.
// La ficha es lo que se mira antes de llamar al proveedor.
function Ficha({ fila, onClose, onCambio, toast }) {
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setNotas(await fetchDevolucionNotas(fila.id));
    } catch {
      setNotas([]);
    } finally {
      setCargando(false);
    }
  }, [fila.id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    try {
      await agregarNotaDevolucion(fila.id, limpio);
      setTexto("");
      await cargar();
      onCambio?.();
    } catch (error) {
      toast?.error?.(error.message || "No se pudo guardar la nota.");
    } finally {
      setEnviando(false);
    }
  }

  const hitos = [
    ["Volvió al pañol", fila.devuelto_at, fila.registrado_por_nombre],
    ["Se decidió qué hacer", fila.decidido_at, fila.decidido_por_nombre],
    ["Salió del pañol", fila.salida_at, fila.destino],
    ["Cerrada", fila.cerrado_at, DEVOLUCION_ESTADOS[fila.estado]?.label],
  ].filter(([, cuando]) => !!cuando);

  const datos = [
    ["Cantidad", fmtCantidad(fila.cantidad, fila.unidad)],
    ["Obra", fila.obra_codigo || "—"],
    ["Lo había retirado", fila.retirado_por || "—"],
    ["Motivo", fila.motivo || "—"],
    ["Código", fila.material_codigo || "—"],
    ["Proveedor", fila.proveedor_nombre || fila.destino || "—"],
    ["Valor del material", fmtMoneda(fila.valor_estimado, fila.moneda) || "sin precio cargado"],
    ["Costo de reparación", fmtMoneda(fila.costo_reparacion, fila.moneda) || "—"],
  ];

  return (
    <Modal
      ancho={620}
      titulo={fila.descripcion}
      bajada={`${fmtCantidad(fila.cantidad, fila.unidad)} · ${DEVOLUCION_ESTADOS[fila.estado]?.label || fila.estado}${fila.obra_codigo ? ` · ${fila.obra_codigo}` : ""}`}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <ChipResponsable fila={fila} />
        <ChipDestino fila={fila} />
        <Chip icon={Clock} title="Días desde que volvió al pañol">
          {dias(fila)} {dias(fila) === 1 ? "día" : "días"}
          {fila.dias_afuera != null ? " afuera" : " en el estante"}
        </Chip>
      </div>

      {fila.detalle && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel, padding: "9px 11px", color: C.text, fontSize: 12.5, lineHeight: 1.45 }}>
          “{fila.detalle}”
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {datos.map(([label, valor]) => (
          <div key={label} style={{ borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, padding: "7px 9px", minWidth: 0 }}>
            <div style={labelSt}>{label}</div>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</div>
          </div>
        ))}
      </div>

      {hitos.length > 0 && (
        <div style={{ display: "grid", gap: 5 }}>
          <span style={labelSt}>Recorrido</span>
          {hitos.map(([label, cuando, quien]) => (
            <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.blue, flexShrink: 0, transform: "translateY(-1px)" }} />
              <span style={{ color: C.text, fontWeight: 800 }}>{label}</span>
              <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{fmtFecha(cuando)}</span>
              {quien && <span style={{ color: C.dim }}>· {quien}</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gap: 7, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <span style={labelSt}>Seguimiento</span>
        <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
          <input
            value={texto}
            size={1}
            placeholder="Ej: llamé a Trimer, dicen que el viernes"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
            style={inputSt}
          />
          <button type="button" onClick={enviar} disabled={!texto.trim() || enviando}
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
              padding: "9px 12px", borderRadius: 9, fontSize: 12, fontWeight: 900, fontFamily: C.sans,
              border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue,
              cursor: texto.trim() ? "pointer" : "not-allowed", opacity: texto.trim() ? 1 : 0.5,
            }}>
            <Send size={12} /> Anotar
          </button>
        </div>

        {cargando ? (
          <div style={{ color: C.dim, fontSize: 11.5 }}>Cargando el seguimiento…</div>
        ) : notas.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45 }}>
            Sin anotaciones. Cada llamada que anotes acá es una llamada que nadie va a repetir.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {notas.map((nota) => (
              <div key={nota.id} style={{ borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, padding: "8px 10px" }}>
                <div style={{ color: C.text, fontSize: 12.5, lineHeight: 1.45 }}>{nota.texto}</div>
                <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3, display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: C.mono }}>{fmtFecha(nota.created_at)}</span>
                  {nota.autor_nombre && <span>· {nota.autor_nombre}</span>}
                  {nota.estado_en_ese_momento && <span>· {DEVOLUCION_ESTADOS[nota.estado_en_ese_momento]?.label || nota.estado_en_ese_momento}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── card ────────────────────────────────────────────────────────────────── */
function Card({ fila, col, ocupado, onAccion, onFicha }) {
  const d = dias(fila);
  const viejo = d >= UMBRAL_VIEJO;
  const quieto = Number(fila.dias_sin_movimiento ?? 0) >= UMBRAL_QUIETO;
  const reclamable = responsableDe(fila) === "proveedor";

  return (
    <article style={{ borderRadius: 11, border: `1px solid ${viejo ? C.redB : C.border}`, background: C.panelSolid, padding: 10, display: "grid", gap: 7 }}>
      <button type="button" onClick={onFicha} title="Ver la ficha completa"
        style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: C.sans, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, lineHeight: 1.3 }}>{fila.descripcion}</div>
        <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
          {fmtCantidad(fila.cantidad, fila.unidad)}
          {fila.obra_codigo ? ` · ${fila.obra_codigo}` : ""}
          {fila.material_codigo ? ` · ${fila.material_codigo}` : ""}
        </div>
      </button>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <ChipResponsable fila={fila} />
        <ChipDestino fila={fila} />
        {fila.retirado_por && <Chip icon={User} title="Quién lo había retirado">{fila.retirado_por}</Chip>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: viejo ? 900 : 700, color: viejo ? C.red : C.dim }}>
          {fila.dias_afuera != null ? "Afuera hace" : "Devuelto hace"} {d} {d === 1 ? "día" : "días"}
        </span>
        {quieto && (
          <Chip color={C.red} soft={C.redL} borde={C.redB} icon={Clock} title="Nadie la tocó ni anotó nada en la última semana">
            Sin movimiento
          </Chip>
        )}
        {fila.valor_estimado > 0 && (
          <span title={reclamable ? "Se le puede reclamar al proveedor" : "No es reclamable: la rotura es nuestra o falta definirla"}
            style={{ fontFamily: C.mono, fontSize: 10.5, fontWeight: reclamable ? 900 : 700, color: reclamable ? C.cyan : C.dim, marginLeft: "auto" }}>
            {fmtMoneda(fila.valor_estimado, fila.moneda)}
          </span>
        )}
      </div>

      {fila.detalle && (
        <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4 }}>{fila.detalle}</div>
      )}

      {fila.ultima_nota && (
        <button type="button" onClick={onFicha}
          style={{ textAlign: "left", cursor: "pointer", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, padding: "6px 8px", fontFamily: C.sans, minWidth: 0 }}>
          <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {fila.ultima_nota}
          </div>
          <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2, fontWeight: 800 }}>
            {fila.notas_count > 1 ? `${fila.notas_count} anotaciones · ` : ""}última {fmtFecha(fila.ultima_nota_at)}
          </div>
        </button>
      )}

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {(ACCIONES[fila.estado] ?? []).map(([estado, label]) => (
          <button key={estado} type="button" disabled={ocupado}
            onClick={() => onAccion(estado)}
            style={{
              padding: "5px 10px", borderRadius: 8, cursor: ocupado ? "default" : "pointer",
              border: `1px solid ${C.border}`, background: C.panel, color: C.muted,
              fontSize: 10.5, fontWeight: 800, fontFamily: C.sans, opacity: ocupado ? 0.5 : 1,
            }}>
            {label}
          </button>
        ))}
        <button type="button" onClick={onFicha} title="Ficha y seguimiento"
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
            padding: "5px 9px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${col.borde}`, background: col.soft, color: col.color,
            fontSize: 10.5, fontWeight: 900, fontFamily: C.sans,
          }}>
          <MessageSquarePlus size={11} />
          {fila.notas_count > 0 ? fila.notas_count : "Ficha"}
        </button>
      </div>
    </article>
  );
}

/* ── pantalla ────────────────────────────────────────────────────────────── */
export default function DevolucionesPanel({ isMobile = false }) {
  const toast = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState("");
  const [decision, setDecision] = useState(null);
  const [fichaId, setFichaId] = useState("");
  const [filtroResp, setFiltroResp] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await fetchDevoluciones({ soloAbiertas: true }));
    } catch (error) {
      toast?.error?.(error.message || "No se pudieron cargar las devoluciones.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return filas.filter((fila) => {
      if (filtroResp !== "todos" && responsableDe(fila) !== filtroResp) return false;
      if (!texto) return true;
      return [fila.descripcion, fila.obra_codigo, fila.destino, fila.proveedor_nombre, fila.material_codigo, fila.retirado_por]
        .filter(Boolean).join(" ").toLowerCase().includes(texto);
    });
  }, [filas, filtroResp, busqueda]);

  const porEstado = useMemo(() => {
    const map = new Map(COLUMNAS.map((col) => [col.estado, []]));
    visibles.forEach((fila) => {
      if (map.has(fila.estado)) map.get(fila.estado).push(fila);
    });
    return map;
  }, [visibles]);

  // Las métricas se calculan sobre TODO lo abierto, no sobre lo filtrado: el
  // total del reclamo no puede cambiar según lo que uno esté mirando.
  const metricas = useMemo(() => {
    const reclamable = new Map();
    const nuestro = new Map();
    let sinDefinir = 0;
    let vencidas = 0;
    let quietas = 0;
    filas.forEach((fila) => {
      const moneda = fila.moneda || "ARS";
      const valor = Number(fila.valor_estimado || 0);
      const quien = responsableDe(fila);
      if (quien === "proveedor") reclamable.set(moneda, (reclamable.get(moneda) || 0) + valor);
      else if (quien === "nosotros") nuestro.set(moneda, (nuestro.get(moneda) || 0) + valor);
      else sinDefinir += 1;
      if (dias(fila) >= UMBRAL_VIEJO) vencidas += 1;
      if (Number(fila.dias_sin_movimiento ?? 0) >= UMBRAL_QUIETO) quietas += 1;
    });
    const juntar = (map) => [...map.entries()].filter(([, total]) => total > 0)
      .map(([moneda, total]) => fmtMoneda(total, moneda)).join(" · ");
    return {
      reclamable: juntar(reclamable) || "$0",
      nuestro: juntar(nuestro) || "$0",
      sinDefinir, vencidas, quietas,
    };
  }, [filas]);

  const ficha = useMemo(() => filas.find((fila) => fila.id === fichaId) || null, [filas, fichaId]);

  async function aplicar(fila, estado, extra = {}) {
    setOcupado(fila.id);
    try {
      await resolverDevolucion(fila.id, estado, extra);
      toast?.success?.(DEVOLUCION_ESTADOS[estado]?.label || "Actualizado.");
      setDecision(null);
      await cargar();
    } catch (error) {
      toast?.error?.(error.message || "No se pudo actualizar.");
    } finally {
      setOcupado("");
    }
  }

  function pedirAccion(fila, estado) {
    const config = PIDE_DESTINO[estado];
    if (!config) {
      aplicar(fila, estado);
      return;
    }
    setDecision({
      fila, estado,
      destinoTipo: fila.destino_tipo || config.porDefecto,
      destino: fila.destino || fila.proveedor_nombre || "",
      responsable: responsableDe(fila),
      costo: fila.costo_reparacion != null ? String(fila.costo_reparacion) : "",
      nota: "",
    });
  }

  if (cargando) {
    return <div style={{ color: C.dim, fontSize: 12.5, padding: "28px 0", textAlign: "center" }}>Cargando devoluciones…</div>;
  }

  if (!filas.length) {
    return (
      <div style={{ display: "grid", placeItems: "center", gap: 8, padding: "42px 16px", borderRadius: 14, border: `1px dashed ${C.border}`, background: C.panel, textAlign: "center" }}>
        <RotateCcw size={22} style={{ color: C.green }} />
        <div style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>No hay devoluciones abiertas</div>
        <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, maxWidth: 380 }}>
          Cuando un material entregado vuelva fallado, se registra desde el egreso y aparece acá.
        </div>
      </div>
    );
  }

  const config = decision ? PIDE_DESTINO[decision.estado] : null;
  const metaDestino = decision ? DESTINO_TIPO_META[decision.destinoTipo] : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tile
          label="Reclamable al proveedor" valor={metricas.reclamable} icon={CircleDollarSign}
          color={C.cyan} soft={C.cyanL} borde={C.cyanB}
          detalle="Sólo lo que vino fallado de fábrica."
        />
        <Tile
          label="Roturas nuestras" valor={metricas.nuestro} icon={AlertTriangle}
          color={C.red} soft={C.redL} borde={C.redB}
          detalle="Se registra igual, pero no se reclama."
        />
        <Tile
          label={`Afuera hace +${UMBRAL_VIEJO} días`} valor={metricas.vencidas} icon={Clock}
          color={metricas.vencidas ? C.red : C.dim}
          detalle={metricas.quietas ? `${metricas.quietas} sin movimiento hace más de ${UMBRAL_QUIETO} días` : "Todas con movimiento reciente."}
        />
        <Tile
          label="Falta definir la culpa" valor={metricas.sinDefinir} icon={Factory}
          color={metricas.sinDefinir ? C.violet : C.dim}
          detalle="Hasta definirlo no entran en el reclamo."
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} size={1}
            placeholder="Buscar por material, obra, proveedor o quién lo retiró…"
            style={{ ...inputSt, padding: "8px 10px 8px 28px", fontSize: 12 }} />
        </div>
        <Opciones
          valor={filtroResp}
          onChange={setFiltroResp}
          opciones={[["todos", "Todas"], ...DEVOLUCION_RESPONSABLE.map(([k]) => [k, RESPONSABLE_META[k].corto])]}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 10, alignItems: "start" }}>
        {COLUMNAS.map((col) => {
          const items = porEstado.get(col.estado) ?? [];
          const Icon = col.icon;
          return (
            <section key={col.estado} style={{ borderRadius: 14, border: `1px solid ${items.length ? col.borde : C.border}`, background: C.panel, overflow: "hidden" }}>
              <div style={{ padding: "11px 13px", borderBottom: `1px solid ${C.border}`, background: items.length ? col.soft : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Icon size={14} style={{ color: items.length ? col.color : C.dim, flexShrink: 0 }} />
                  <span style={{ color: C.text, fontSize: 12.5, fontWeight: 900 }}>{col.titulo}</span>
                  <span style={{ marginLeft: "auto", fontFamily: C.mono, fontSize: 12, fontWeight: 900, color: items.length ? col.color : C.dim }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 3 }}>{col.detalle}</div>
              </div>

              <div style={{ display: "grid", gap: 6, padding: items.length ? 8 : 0 }}>
                {items.map((fila) => (
                  <Card
                    key={fila.id}
                    fila={fila}
                    col={col}
                    ocupado={ocupado === fila.id}
                    onAccion={(estado) => pedirAccion(fila, estado)}
                    onFicha={() => setFichaId(fila.id)}
                  />
                ))}
                {!items.length && (
                  <div style={{ color: C.dim, fontSize: 11, padding: "14px 13px", lineHeight: 1.4 }}>
                    {busqueda || filtroResp !== "todos" ? "Nada con ese filtro." : "Vacío."}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {decision && config && (
        <Modal
          titulo={config.titulo}
          bajada={`${fmtCantidad(decision.fila.cantidad, decision.fila.unidad)} · ${decision.fila.descripcion}`}
          onClose={() => setDecision(null)}
          pie={<>
            <button type="button" onClick={() => setDecision(null)}
              style={{ padding: "8px 14px", borderRadius: 9, cursor: "pointer", border: `1px solid ${C.border}`, background: C.panel, color: C.muted, fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
              Cancelar
            </button>
            <button type="button"
              disabled={!decision.destino.trim() || ocupado === decision.fila.id}
              onClick={() => aplicar(decision.fila, decision.estado, {
                destino: decision.destino.trim(),
                destinoTipo: decision.destinoTipo,
                responsable: decision.responsable,
                costoReparacion: decision.costo,
                notas: decision.nota.trim() || null,
              })}
              style={{
                padding: "8px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 900, fontFamily: C.sans,
                border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue,
                cursor: decision.destino.trim() ? "pointer" : "not-allowed",
                opacity: decision.destino.trim() ? 1 : 0.5,
              }}>
              Confirmar
            </button>
          </>}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <span style={labelSt}>{config.pregunta}</span>
            <Opciones
              valor={decision.destinoTipo}
              onChange={(v) => setDecision((p) => ({ ...p, destinoTipo: v }))}
              opciones={config.tipos}
            />
            {metaDestino?.ayuda && <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.4 }}>{metaDestino.ayuda}</div>}
          </div>

          <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
            <span style={labelSt}>Nombre</span>
            <input autoFocus size={1} value={decision.destino}
              placeholder={metaDestino?.ph || "Ej: Trimer"}
              onChange={(e) => setDecision((p) => ({ ...p, destino: e.target.value }))}
              style={inputSt} />
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={labelSt}>¿De quién fue la falla?</span>
            <Opciones
              valor={decision.responsable}
              onChange={(v) => setDecision((p) => ({ ...p, responsable: v }))}
              opciones={DEVOLUCION_RESPONSABLE}
            />
            <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.4 }}>
              {decision.responsable === "proveedor"
                ? "Entra en el total reclamable al proveedor."
                : decision.responsable === "nosotros"
                  ? "Se registra como pérdida propia: no se le reclama a nadie."
                  : "Mientras esté sin definir no entra en ningún total."}
            </div>
          </div>

          {decision.destinoTipo !== "interno" && (
            <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
              <span style={labelSt}>Costo de la reparación (opcional)</span>
              <input size={1} inputMode="decimal" value={decision.costo}
                placeholder={decision.responsable === "proveedor" ? "Por garantía debería ser 0" : "Lo que nos van a cobrar"}
                onChange={(e) => setDecision((p) => ({ ...p, costo: e.target.value }))}
                style={{ ...inputSt, fontFamily: C.mono }} />
            </label>
          )}

          <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
            <span style={labelSt}>Observación (opcional)</span>
            <input size={1} value={decision.nota}
              placeholder="Ej: lo lleva Gabriel el lunes, prometieron 10 días"
              onChange={(e) => setDecision((p) => ({ ...p, nota: e.target.value }))}
              style={inputSt} />
          </label>
        </Modal>
      )}

      {ficha && (
        <Ficha fila={ficha} toast={toast} onCambio={cargar} onClose={() => setFichaId("")} />
      )}
    </div>
  );
}
