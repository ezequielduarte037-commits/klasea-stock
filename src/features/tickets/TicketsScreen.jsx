import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ImagePlus,
  Inbox,
  LifeBuoy,
  LoaderCircle,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { C } from "@/theme";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { hasAdminAccess } from "@/lib/permissions";
import {
  actualizarTicket,
  alternarVoto,
  AREAS,
  borrarAdjunto,
  borrarTicket,
  comentar,
  crearTicket,
  ESTADOS,
  fetchAdjuntos,
  fetchSeguimiento,
  fetchTickets,
  haceCuanto,
  hayAdjuntos,
  imagenesDelEvento,
  iniciales,
  nombrePersona,
  PRIORIDADES,
  subirAdjunto,
  TIPOS,
} from "./ticketsApi";

/**
 * Tickets: dónde se pide una mejora y se ve qué pasó con ella.
 *
 * Toda la pantalla está armada alrededor de una sola idea: el que pide tiene
 * que poder ver en qué anda su pedido sin preguntarle a nadie. Por eso el hilo
 * de seguimiento mezcla comentarios con cambios de estado -son lo mismo desde
 * el lado del que espera- y por eso un ticket cerrado siempre muestra su
 * resolución arriba de todo: cerrar sin decir por qué es la forma más rápida de
 * que nadie vuelva a cargar nada.
 *
 * Los votos no son un adorno. Sesenta pedidos sin orden es una lista que nadie
 * mira; ordenados por lo que a más gente le hace falta, la lista se lee sola.
 */

const COLOR_ESTADO = {
  nuevo: { color: () => C.violet, soft: () => C.violetL, borde: () => C.violetB },
  en_curso: { color: () => C.blue, soft: () => C.blueL, borde: () => C.blueB },
  hecho: { color: () => C.green, soft: () => C.greenL, borde: () => C.greenB },
  descartado: { color: () => C.dim, soft: () => C.panel2, borde: () => C.border },
};

const COLOR_TIPO = {
  mejora: () => C.blue,
  problema: () => C.red,
  pedido: () => C.cyan,
};

const etiquetaEstado = (id) => ESTADOS.find((row) => row.id === id)?.label || id;
const etiquetaTipo = (id) => TIPOS.find((row) => row.id === id)?.label || id;

function sinTildes(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function Pastilla({ children, color, soft, borde, title }) {
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      border: `1px solid ${borde}`, background: soft, color,
      borderRadius: 999, padding: "2px 9px", fontSize: 10.5, fontWeight: 900,
    }}>
      {children}
    </span>
  );
}

function Avatar({ persona, size = 26 }) {
  return (
    <div title={nombrePersona(persona)} style={{
      width: size, height: size, borderRadius: 9, flexShrink: 0,
      background: C.panel2, border: `1px solid ${C.border}`,
      display: "grid", placeItems: "center", boxSizing: "border-box",
      fontSize: size * 0.4, fontWeight: 900, color: C.muted, letterSpacing: .3,
    }}>
      {iniciales(persona)}
    </div>
  );
}

/** El botón de voto. Cuenta y estado en el mismo lugar, sin texto de más. */
function Voto({ ticket, onVotar, ocupado }) {
  const votado = ticket.vote;
  return (
    <button
      type="button"
      onClick={(evento) => { evento.stopPropagation(); onVotar(ticket); }}
      disabled={ocupado}
      title={votado ? "Sacar mi voto" : "A mí también me hace falta"}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1,
        border: `1px solid ${votado ? C.blueB : C.border}`,
        background: votado ? C.blueL : C.panelSolid,
        color: votado ? C.blue : C.dim,
        borderRadius: 9, padding: "5px 9px", cursor: ocupado ? "default" : "pointer",
        fontFamily: C.sans, minWidth: 40, flexShrink: 0,
      }}
    >
      <ThumbsUp size={12} fill={votado ? "currentColor" : "none"} />
      <span style={{ fontSize: 11.5, fontWeight: 900, fontFamily: C.mono }}>{ticket.votos}</span>
    </button>
  );
}

/* ── ALTA ──────────────────────────────────────────────────────────────────── */

function ModalNuevo({ hayCapturas, onCerrar, onCreado }) {
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [tipo, setTipo] = useState("mejora");
  const [pantalla, setPantalla] = useState("");
  // Las capturas se eligen antes de que el ticket exista, así que se guardan
  // acá y se suben recién cuando hay un id al que colgarlas.
  const [capturas, setCapturas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  const sumarCapturas = useCallback((archivos) => {
    const validas = [...archivos].filter((archivo) => String(archivo.type).startsWith("image/"));
    if (!validas.length) return;
    setCapturas((actual) => [
      ...actual,
      ...validas.map((archivo) => ({ archivo, url: URL.createObjectURL(archivo), id: `${Date.now()}-${Math.random()}` })),
    ]);
  }, []);

  // Las vistas previas son URLs de objeto: si no se liberan, el navegador se
  // queda con la imagen en memoria hasta que se recargue la página.
  useEffect(() => () => { capturas.forEach((captura) => URL.revokeObjectURL(captura.url)); }, [capturas]);

  const campo = {
    width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`,
    background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 11px",
    fontFamily: C.sans, fontSize: 13, fontWeight: 600, outline: "none",
  };
  const rotulo = { fontSize: 10, fontWeight: 900, color: C.dim, textTransform: "uppercase", letterSpacing: .9, marginBottom: 5, display: "block" };

  async function guardar() {
    if (!titulo.trim() || guardando) return;
    setGuardando(true);
    try {
      const id = await crearTicket({ titulo, detalle, tipo, pantalla });
      // Si una captura falla, el ticket YA está creado y no se pierde: se avisa
      // cuál no subió y el resto sigue. Perder el pedido entero por una imagen
      // sería el peor de los dos resultados.
      const fallidas = [];
      for (const captura of capturas) {
        try {
          await subirAdjunto(id, captura.archivo);
        } catch {
          fallidas.push(captura.archivo.name || "una captura");
        }
      }
      if (fallidas.length) toast.warning(`El ticket se creó, pero no subió: ${fallidas.join(", ")}.`);
      await onCreado?.(id);
    } catch (e) {
      toast.error(e?.message || "No se pudo crear el ticket.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div onClick={onCerrar} style={{
      position: "fixed", inset: 0, zIndex: 9998, background: "rgba(15,23,42,0.55)",
      backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 16, fontFamily: C.sans,
    }}>
      <div onClick={(evento) => evento.stopPropagation()} style={{
        width: "min(520px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 14,
        boxShadow: "0 18px 50px var(--shadow)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.panelSolid }}>
          <LifeBuoy size={16} color={C.blue} />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 950, color: C.text }}>Pedir algo al sistema</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 15, display: "grid", gap: 13 }}>
          <div>
            <span style={rotulo}>Qué es</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TIPOS.map((opcion) => {
                const activo = tipo === opcion.id;
                const color = COLOR_TIPO[opcion.id]?.() || C.blue;
                return (
                  <button key={opcion.id} type="button" onClick={() => setTipo(opcion.id)} title={opcion.ayuda} style={{
                    border: `1px solid ${activo ? color : C.border}`,
                    background: activo ? C.panel2 : C.panel,
                    color: activo ? color : C.muted,
                    borderRadius: 9, padding: "7px 13px", cursor: "pointer",
                    fontFamily: C.sans, fontSize: 12.5, fontWeight: 900,
                  }}>{opcion.label}</button>
                );
              })}
            </div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 5 }}>
              {TIPOS.find((row) => row.id === tipo)?.ayuda}
            </div>
          </div>

          <div>
            <span style={rotulo}>En una línea</span>
            <input
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              onKeyDown={(evento) => { if (evento.key === "Enter") guardar(); }}
              placeholder="Ej.: que el remito se pueda cargar desde el celular"
              autoFocus
              style={campo}
            />
          </div>

          <div>
            <span style={rotulo}>Contalo bien <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>(opcional, pero ayuda)</span></span>
            <textarea
              value={detalle}
              onChange={(evento) => setDetalle(evento.target.value)}
              rows={5}
              placeholder="Qué estabas haciendo, qué esperabas que pasara y qué pasó. Si es un pedido: para qué te haría falta."
              style={{ ...campo, resize: "vertical", lineHeight: 1.5, fontWeight: 500 }}
            />
          </div>

          {/* De qué parte del sistema: se toca, no se escribe. Escribiéndolo,
              cada uno lo llama distinto y después no se puede filtrar. */}
          <div>
            <span style={rotulo}>De qué apartado</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {AREAS.map((area) => {
                const activo = pantalla === area;
                return (
                  <button key={area} type="button" onClick={() => setPantalla(activo ? "" : area)} style={{
                    border: `1px solid ${activo ? C.blueB : C.border}`,
                    background: activo ? C.blueL : C.panel,
                    color: activo ? C.blue : C.muted,
                    borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                    fontFamily: C.sans, fontSize: 11.5, fontWeight: 850,
                  }}>{area}</button>
                );
              })}
            </div>
          </div>

          {/* Capturas: pegar es el camino corto -Impr Pant y Ctrl+V- y por eso
              está escrito en el cartel. Elegir archivo y arrastrar también. */}
          {hayCapturas ? (
          <div>
            <span style={rotulo}>Capturas <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>(opcional)</span></span>
            <label
              onPaste={(evento) => sumarCapturas(imagenesDelEvento(evento))}
              onDragOver={(evento) => evento.preventDefault()}
              onDrop={(evento) => { evento.preventDefault(); sumarCapturas(imagenesDelEvento(evento)); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: `1px dashed ${C.border2}`, background: C.panel, borderRadius: 10,
                padding: "14px 12px", cursor: "pointer", color: C.dim, fontSize: 12, fontWeight: 750, textAlign: "center",
              }}
            >
              <ImagePlus size={15} />
              Pegá una captura (Ctrl + V), arrastrala o tocá para elegirla
              <input
                type="file" accept="image/*" multiple hidden
                onChange={(evento) => { sumarCapturas(evento.target.files); evento.target.value = ""; }}
              />
            </label>
            {capturas.length ? (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                {capturas.map((captura) => (
                  <div key={captura.id} style={{ position: "relative", width: 74, height: 74, borderRadius: 9, overflow: "hidden", border: `1px solid ${C.border2}` }}>
                    <img src={captura.url} alt={captura.archivo.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <button
                      type="button"
                      onClick={() => setCapturas((actual) => actual.filter((row) => row.id !== captura.id))}
                      aria-label={`Sacar ${captura.archivo.name}`}
                      style={{ position: "absolute", top: 3, right: 3, border: "none", background: "rgba(15,23,42,.72)", color: "#fff", borderRadius: 6, width: 19, height: 19, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 15px", borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={onCerrar} style={{ border: `1px solid ${C.border2}`, background: C.panel, color: C.muted, borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={!titulo.trim() || guardando} style={{
            border: `1px solid ${titulo.trim() ? C.blueB : C.border}`,
            background: titulo.trim() ? C.blue : C.panel,
            color: titulo.trim() ? "var(--inverse-text)" : C.dim,
            borderRadius: 9, padding: "9px 16px", cursor: titulo.trim() && !guardando ? "pointer" : "default",
            fontFamily: C.sans, fontSize: 12.5, fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />}
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── DETALLE ───────────────────────────────────────────────────────────────── */

function Detalle({ ticket, miId, puedeGestionar, hayCapturas, onCambiar, onBorrar, onVotar, isMobile, onVolver }) {
  const [hilo, setHilo] = useState([]);
  const [cargandoHilo, setCargandoHilo] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resolucion, setResolucion] = useState(ticket.resolucion || "");
  const [capturas, setCapturas] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [mirando, setMirando] = useState(null);
  const toast = useToast();

  const recargarHilo = useCallback(async () => {
    setCargandoHilo(true);
    try {
      const [seguimiento, adjuntos] = await Promise.all([
        fetchSeguimiento(ticket.id),
        fetchAdjuntos(ticket.id),
      ]);
      setHilo(seguimiento);
      setCapturas(adjuntos);
    } catch {
      setHilo([]);
      setCapturas([]);
    } finally {
      setCargandoHilo(false);
    }
  }, [ticket.id]);

  /** Sube capturas al ticket ya existente. Se usa desde el botón y desde Ctrl+V. */
  const sumarCapturas = useCallback(async (archivos) => {
    const validas = [...archivos].filter((archivo) => String(archivo.type).startsWith("image/"));
    if (!validas.length || subiendo) return;
    setSubiendo(true);
    try {
      for (const archivo of validas) {
        const fila = await subirAdjunto(ticket.id, archivo);
        if (fila) setCapturas((actual) => [...actual, fila]);
      }
    } catch (e) {
      toast.error(e?.message || "No se pudo subir la captura.");
    } finally {
      setSubiendo(false);
    }
  }, [ticket.id, subiendo, toast]);

  useEffect(() => { recargarHilo(); }, [recargarHilo]);
  useEffect(() => { setResolucion(ticket.resolucion || ""); }, [ticket.id, ticket.resolucion]);

  const estado = COLOR_ESTADO[ticket.estado] || COLOR_ESTADO.nuevo;
  const cerrado = ticket.estado === "hecho" || ticket.estado === "descartado";
  const esMio = ticket.autor_id === miId;
  const puedeBorrar = puedeGestionar || (esMio && ticket.estado === "nuevo");

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    try {
      await comentar(ticket.id, cuerpo);
      setTexto("");
      await recargarHilo();
    } catch (e) {
      toast.error(e?.message || "No se pudo comentar.");
    } finally {
      setEnviando(false);
    }
  }

  async function cambiar(patch) {
    await onCambiar(ticket.id, patch);
    await recargarHilo();
  }

  const seccion = { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* La captura en grande. Sin recorte: lo que se quiere leer suele ser un
          cartel chico en una esquina. */}
      {mirando ? (
        <div
          onClick={() => setMirando(null)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(8,12,22,.86)", display: "grid", placeItems: "center", padding: 24, cursor: "zoom-out" }}
        >
          <img src={mirando.url} alt={mirando.nombre || "captura"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, boxShadow: "0 24px 70px rgba(0,0,0,.5)" }} />
          <button type="button" onClick={() => setMirando(null)} aria-label="Cerrar" style={{ position: "fixed", top: 16, right: 16, border: "1px solid rgba(255,255,255,.25)", background: "rgba(15,23,42,.7)", color: "#fff", borderRadius: 9, width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {/* Encabezado */}
      <div style={{ padding: isMobile ? "12px 12px 10px" : "14px 16px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.topbarSoft }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {isMobile ? (
            <button type="button" onClick={onVolver} aria-label="Volver a la lista" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 8, width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <Pastilla color={estado.color()} soft={estado.soft()} borde={estado.borde()}>
                {etiquetaEstado(ticket.estado)}
              </Pastilla>
              <Pastilla color={COLOR_TIPO[ticket.tipo]?.() || C.blue} soft={C.panel2} borde={C.border}>
                {etiquetaTipo(ticket.tipo)}
              </Pastilla>
              {ticket.pantalla ? (
                <Pastilla color={C.dim} soft={C.panel2} borde={C.border}>{ticket.pantalla}</Pastilla>
              ) : null}
              {ticket.prioridad !== "sin_definir" ? (
                <Pastilla color={ticket.prioridad === "alta" ? C.red : C.muted} soft={ticket.prioridad === "alta" ? C.redL : C.panel2} borde={ticket.prioridad === "alta" ? C.redB : C.border}>
                  Prioridad {ticket.prioridad}
                </Pastilla>
              ) : null}
            </div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 15.5 : 17, fontWeight: 950, color: C.text, lineHeight: 1.3 }}>
              {ticket.titulo}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7, color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
              <Avatar persona={ticket.autor} size={20} />
              {nombrePersona(ticket.autor)} · {haceCuanto(ticket.created_at)}
              {ticket.asignado ? <> · lo está viendo <b style={{ color: C.muted }}>{nombrePersona(ticket.asignado)}</b></> : null}
            </div>
          </div>
          <Voto ticket={ticket} onVotar={onVotar} />
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 16, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content" }}>
        {/* La resolución va ARRIBA cuando el ticket está cerrado: es lo que vino
            a buscar el que lo abrió. */}
        {cerrado && ticket.resolucion ? (
          <div style={{ ...seccion, borderColor: estado.borde(), background: estado.soft(), padding: 13 }}>
            <div style={{ color: estado.color(), fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .8, marginBottom: 5 }}>
              {ticket.estado === "hecho" ? "Qué se hizo" : "Por qué no se hace"}
            </div>
            <div style={{ color: C.text, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{ticket.resolucion}</div>
          </div>
        ) : null}

        {ticket.detalle ? (
          <div style={{ ...seccion, padding: 13 }}>
            <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>El pedido</div>
            <div style={{ color: C.text, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{ticket.detalle}</div>
          </div>
        ) : null}

        {/* Las capturas. Una imagen del error ahorra tres idas y vueltas
            preguntando qué decía el cartel. */}
        {hayCapturas ? (
        <div
          style={{ ...seccion, padding: 13 }}
          onDragOver={(evento) => evento.preventDefault()}
          onDrop={(evento) => { evento.preventDefault(); sumarCapturas(imagenesDelEvento(evento)); }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: capturas.length ? 9 : 0 }}>
            <span style={{ flex: 1, color: C.dim, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .8 }}>
              Capturas{capturas.length ? ` · ${capturas.length}` : ""}
            </span>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: subiendo ? "default" : "pointer",
              border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.muted, borderRadius: 8,
              padding: "5px 10px", fontSize: 11.5, fontWeight: 850,
            }}>
              {subiendo ? <LoaderCircle size={12} className="spin" /> : <ImagePlus size={12} />}
              Agregar
              <input type="file" accept="image/*" multiple hidden
                onChange={(evento) => { sumarCapturas(evento.target.files); evento.target.value = ""; }} />
            </label>
          </div>
          {capturas.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {capturas.map((captura) => (
                <div key={captura.id} style={{ position: "relative" }}>
                  <button type="button" onClick={() => setMirando(captura)} title={captura.nombre || "Ver"} style={{
                    width: 96, height: 78, borderRadius: 9, overflow: "hidden", padding: 0,
                    border: `1px solid ${C.border2}`, background: C.panel2, cursor: "zoom-in", display: "block",
                  }}>
                    <img src={captura.url} alt={captura.nombre || "captura"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                  {captura.autor_id === miId || puedeGestionar ? (
                    <button type="button"
                      onClick={async () => {
                        try {
                          await borrarAdjunto(captura.id);
                          setCapturas((actual) => actual.filter((row) => row.id !== captura.id));
                        } catch (e) { toast.error(e?.message || "No se pudo borrar."); }
                      }}
                      aria-label={`Borrar ${captura.nombre || "la captura"}`}
                      style={{ position: "absolute", top: 4, right: 4, border: "none", background: "rgba(15,23,42,.72)", color: "#fff", borderRadius: 6, width: 20, height: 20, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.5 }}>
              Ninguna todavía. Pegá una con Ctrl + V en el cuadro de abajo, arrastrala acá o tocá Agregar.
            </div>
          )}
        </div>
        ) : null}

        {/* Panel de gestión */}
        {puedeGestionar ? (
          <div style={{ ...seccion, borderColor: C.border2, padding: 13, display: "grid", gap: 10 }}>
            <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .8 }}>Seguimiento</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {ESTADOS.map((opcion) => {
                const activo = ticket.estado === opcion.id;
                const paleta = COLOR_ESTADO[opcion.id];
                return (
                  <button key={opcion.id} type="button" title={opcion.ayuda}
                    onClick={() => { if (!activo) cambiar({ estado: opcion.id }); }}
                    style={{
                      border: `1px solid ${activo ? paleta.borde() : C.border}`,
                      background: activo ? paleta.soft() : C.panelSolid,
                      color: activo ? paleta.color() : C.muted,
                      borderRadius: 8, padding: "6px 11px", cursor: activo ? "default" : "pointer",
                      fontFamily: C.sans, fontSize: 11.5, fontWeight: 900,
                    }}>{opcion.label}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 800 }}>Prioridad</span>
              <select
                value={ticket.prioridad}
                onChange={(evento) => cambiar({ prioridad: evento.target.value })}
                style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 8, padding: "6px 9px", fontFamily: C.sans, fontSize: 12, fontWeight: 800, outline: "none", cursor: "pointer" }}
              >
                {PRIORIDADES.map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>{opcion.label}</option>
                ))}
              </select>
              <button type="button"
                onClick={() => cambiar({ asignado_a: ticket.asignado_a === miId ? null : miId })}
                style={{
                  border: `1px solid ${ticket.asignado_a === miId ? C.blueB : C.border2}`,
                  background: ticket.asignado_a === miId ? C.blueL : C.panelSolid,
                  color: ticket.asignado_a === miId ? C.blue : C.muted,
                  borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850,
                }}>
                {ticket.asignado_a === miId ? "Lo estoy viendo yo" : "Me lo asigno"}
              </button>
            </div>
            <div>
              <textarea
                value={resolucion}
                onChange={(evento) => setResolucion(evento.target.value)}
                onBlur={() => { if ((resolucion || "") !== (ticket.resolucion || "")) cambiar({ resolucion }); }}
                rows={2}
                placeholder="Qué se hizo, o por qué no se va a hacer. Lo lee el que lo pidió."
                style={{
                  width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`,
                  background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px",
                  fontFamily: C.sans, fontSize: 12.5, outline: "none", resize: "vertical", lineHeight: 1.5,
                }}
              />
            </div>
          </div>
        ) : null}

        {/* El hilo */}
        <div style={{ ...seccion, overflow: "hidden" }}>
          <div style={{ padding: "10px 13px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: .8, display: "flex", alignItems: "center", gap: 7 }}>
            <MessageSquare size={12} /> Qué pasó con esto
          </div>
          {cargandoHilo ? (
            <div style={{ padding: 20, textAlign: "center", color: C.dim }}><LoaderCircle size={16} className="spin" /></div>
          ) : !hilo.length ? (
            <div style={{ padding: "18px 13px", color: C.dim, fontSize: 12.5, textAlign: "center" }}>
              Todavía no pasó nada. Cuando alguien lo tome o comente, aparece acá.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {hilo.map((fila, i) => {
                const cambio = fila.tipo === "estado";
                const paleta = COLOR_ESTADO[fila.estado_a] || COLOR_ESTADO.nuevo;
                return (
                  <div key={fila.id} style={{
                    display: "flex", gap: 10, padding: "10px 13px",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    alignItems: cambio ? "center" : "flex-start",
                    background: cambio ? C.panelSolid : "transparent",
                  }}>
                    {cambio ? (
                      <div style={{ width: 20, height: 20, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center", background: paleta.soft(), border: `1px solid ${paleta.borde()}`, color: paleta.color() }}>
                        <ChevronRight size={11} />
                      </div>
                    ) : (
                      <Avatar persona={fila.autor} size={26} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {cambio ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>
                          {nombrePersona(fila.autor)} lo pasó a{" "}
                          <b style={{ color: paleta.color() }}>{etiquetaEstado(fila.estado_a)}</b>
                          <span style={{ color: C.dim, fontWeight: 700 }}> · {haceCuanto(fila.created_at)}</span>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11.5, fontWeight: 850, color: C.muted }}>
                            {nombrePersona(fila.autor)}
                            <span style={{ color: C.dim, fontWeight: 700 }}> · {haceCuanto(fila.created_at)}</span>
                          </div>
                          <div style={{ color: C.text, fontSize: 12.5, lineHeight: 1.55, marginTop: 3, whiteSpace: "pre-wrap" }}>{fila.cuerpo}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {puedeBorrar ? (
          <button type="button" onClick={() => onBorrar(ticket)} style={{
            justifySelf: "start", border: `1px solid ${C.border}`, background: "transparent", color: C.red,
            borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 850,
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            <Trash2 size={13} /> Borrar el ticket
          </button>
        ) : null}
      </div>

      {/* Comentar: pegado abajo, que es donde la mano lo busca. */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: isMobile ? 10 : "10px 16px", background: C.topbarSoft, flexShrink: 0, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => { if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) { evento.preventDefault(); enviar(); } }}
          // Pegar una captura acá la sube al ticket: es donde la mano ya está.
          onPaste={(evento) => {
            const imagenes = imagenesDelEvento(evento);
            if (imagenes.length) { evento.preventDefault(); sumarCapturas(imagenes); }
          }}
          rows={1}
          placeholder="Escribí algo o pegá una captura… (Ctrl + Enter para mandar)"
          style={{
            flex: 1, minWidth: 0, boxSizing: "border-box", border: `1px solid ${C.border2}`,
            background: C.panelSolid, color: C.text, borderRadius: 9, padding: "9px 11px",
            fontFamily: C.sans, fontSize: 12.5, outline: "none", resize: "vertical", lineHeight: 1.5, maxHeight: 140,
          }}
        />
        <button type="button" onClick={enviar} disabled={!texto.trim() || enviando} title="Mandar" style={{
          border: `1px solid ${texto.trim() ? C.blueB : C.border}`,
          background: texto.trim() ? C.blue : C.panel,
          color: texto.trim() ? "var(--inverse-text)" : C.dim,
          borderRadius: 9, width: 38, height: 38, display: "grid", placeItems: "center",
          cursor: texto.trim() && !enviando ? "pointer" : "default", flexShrink: 0,
        }}>
          {enviando ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

/* ── PANTALLA ──────────────────────────────────────────────────────────────── */

export default function TicketsScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const miId = profile?.id || null;
  const puedeGestionar = hasAdminAccess(profile);

  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("abiertos");
  const [busca, setBusca] = useState("");
  const [soloMios, setSoloMios] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [votando, setVotando] = useState("");
  // Las capturas son una migración aparte: si todavía no se corrió, la
  // pantalla lo dice en vez de dejar subir algo que va a fallar.
  const [hayCapturas, setHayCapturas] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [{ tickets: filas, falta }, conCapturas] = await Promise.all([fetchTickets(miId), hayAdjuntos()]);
      setFaltaTabla(falta);
      setHayCapturas(conCapturas);
      setTickets(filas);
    } catch (e) {
      setError(e?.message || "No se pudieron traer los tickets.");
    } finally {
      setCargando(false);
    }
  }, [miId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cuentas = useMemo(() => {
    const salida = { abiertos: 0, nuevo: 0, en_curso: 0, hecho: 0, descartado: 0, todos: tickets.length };
    for (const ticket of tickets) {
      salida[ticket.estado] = (salida[ticket.estado] || 0) + 1;
      if (ticket.estado === "nuevo" || ticket.estado === "en_curso") salida.abiertos += 1;
    }
    return salida;
  }, [tickets]);

  const visibles = useMemo(() => {
    const texto = sinTildes(busca.trim());
    return tickets
      .filter((ticket) => {
        if (soloMios && ticket.autor_id !== miId) return false;
        if (filtro === "abiertos" && ticket.estado !== "nuevo" && ticket.estado !== "en_curso") return false;
        if (filtro !== "abiertos" && filtro !== "todos" && ticket.estado !== filtro) return false;
        if (!texto) return true;
        return sinTildes(`${ticket.titulo} ${ticket.detalle || ""} ${ticket.pantalla || ""}`).includes(texto);
      })
      // Los abiertos se ordenan por lo que a más gente le hace falta; los
      // cerrados, por lo último que se cerró, que es lo que se va a mirar.
      .sort((a, b) => {
        const cerradoA = a.estado === "hecho" || a.estado === "descartado";
        const cerradoB = b.estado === "hecho" || b.estado === "descartado";
        if (cerradoA !== cerradoB) return cerradoA ? 1 : -1;
        if (cerradoA) return String(b.cerrado_at || b.updated_at).localeCompare(String(a.cerrado_at || a.updated_at));
        if (b.votos !== a.votos) return b.votos - a.votos;
        return String(b.created_at).localeCompare(String(a.created_at));
      });
  }, [tickets, filtro, busca, soloMios, miId]);

  const seleccionado = useMemo(
    () => visibles.find((ticket) => ticket.id === abierto) || tickets.find((ticket) => ticket.id === abierto) || null,
    [visibles, tickets, abierto],
  );

  async function votar(ticket) {
    if (votando) return;
    setVotando(ticket.id);
    // Se pinta antes de que conteste el servidor: el voto es un gesto chico y
    // esperar medio segundo para ver el número moverse se siente roto.
    setTickets((actual) => actual.map((row) => (
      row.id === ticket.id ? { ...row, vote: !row.vote, votos: row.votos + (row.vote ? -1 : 1) } : row
    )));
    try {
      await alternarVoto(ticket.id, ticket.vote);
    } catch (e) {
      setTickets((actual) => actual.map((row) => (
        row.id === ticket.id ? { ...row, vote: ticket.vote, votos: ticket.votos } : row
      )));
      toast.error(e?.message || "No se pudo votar.");
    } finally {
      setVotando("");
    }
  }

  async function cambiar(id, patch) {
    try {
      await actualizarTicket(id, patch);
      await cargar();
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar.");
    }
  }

  async function borrar(ticket) {
    if (!window.confirm(`¿Borrar "${ticket.titulo}"? No se puede deshacer.`)) return;
    try {
      await borrarTicket(ticket.id);
      setAbierto(null);
      await cargar();
      toast.success("Ticket borrado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo borrar.");
    }
  }

  const seccion = { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 13 };
  const filtros = [
    { id: "abiertos", label: "Abiertos", cuenta: cuentas.abiertos },
    { id: "nuevo", label: "Nuevos", cuenta: cuentas.nuevo },
    { id: "en_curso", label: "En curso", cuenta: cuentas.en_curso },
    { id: "hecho", label: "Hechos", cuenta: cuentas.hecho },
    { id: "descartado", label: "Descartados", cuenta: cuentas.descartado },
    { id: "todos", label: "Todos", cuenta: cuentas.todos },
  ];

  const lista = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Filtros */}
      <div style={{ padding: isMobile ? 10 : "11px 16px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, flexShrink: 0, display: "grid", gap: 9 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <Search size={14} color={C.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar un ticket…"
              aria-label="Buscar entre los tickets"
              style={{
                width: "100%", boxSizing: "border-box", border: `1px solid ${C.border2}`,
                background: C.panelSolid, color: C.text, borderRadius: 9,
                padding: "8px 32px 8px 32px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, outline: "none",
              }}
            />
            {busca ? (
              <button type="button" onClick={() => setBusca("")} aria-label="Limpiar la búsqueda" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 2 }}>
                <X size={13} />
              </button>
            ) : null}
          </div>
          <button type="button" onClick={() => setSoloMios((v) => !v)} title="Sólo los que cargué yo" style={{
            border: `1px solid ${soloMios ? C.blueB : C.border2}`,
            background: soloMios ? C.blueL : C.panel,
            color: soloMios ? C.blue : C.muted,
            borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, whiteSpace: "nowrap",
          }}>
            Míos
          </button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {filtros.map((opcion) => {
            const activo = filtro === opcion.id;
            return (
              <button key={opcion.id} type="button" onClick={() => setFiltro(opcion.id)} style={{
                border: `1px solid ${activo ? C.blueB : C.border}`,
                background: activo ? C.blueL : C.panelSolid,
                color: activo ? C.blue : C.muted,
                borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                fontFamily: C.sans, fontSize: 11.5, fontWeight: 900,
              }}>
                {opcion.label}{opcion.cuenta ? ` · ${opcion.cuenta}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* La lista */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 10 : 16, display: "grid", gap: 9, alignContent: "start", gridAutoRows: "max-content" }}>
        {error ? (
          <div style={{ ...seccion, borderColor: C.redB, background: C.redL, color: C.red, padding: "11px 13px", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : null}

        {faltaTabla ? (
          <div style={{ ...seccion, padding: 26, textAlign: "center" }}>
            <Lock size={20} color={C.dim} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 900 }}>Falta crear las tablas</div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5, lineHeight: 1.55, maxWidth: 420, marginInline: "auto" }}>
              La pantalla está lista, pero en la base todavía no existen las tablas de tickets.
              Hay que correr la migración <b style={{ color: C.muted, fontFamily: C.mono, fontSize: 11.5 }}>20260907140000_sistema_tickets.sql</b> en
              el editor SQL de Supabase.
            </div>
          </div>
        ) : cargando ? (
          <div style={{ ...seccion, padding: 34, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
            <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
            <div>Buscando tickets…</div>
          </div>
        ) : !visibles.length ? (
          <div style={{ ...seccion, padding: 30, textAlign: "center" }}>
            <Inbox size={20} color={C.dim} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13.5, fontWeight: 900 }}>
              {tickets.length ? "Nada con ese filtro" : "Todavía no hay tickets"}
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5, lineHeight: 1.5, maxWidth: 380, marginInline: "auto" }}>
              {tickets.length
                ? "Probá con otro estado o limpiá la búsqueda."
                : "Si algo del sistema te hace perder tiempo o falta algo que necesitás, pedilo acá. Se le puede seguir el rastro."}
            </div>
            {!tickets.length ? (
              <button type="button" onClick={() => setNuevo(true)} style={{
                marginTop: 13, border: `1px solid ${C.blueB}`, background: C.blue, color: "var(--inverse-text)",
                borderRadius: 9, padding: "9px 15px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 950,
                display: "inline-flex", alignItems: "center", gap: 7,
              }}>
                <Plus size={14} /> Cargar el primero
              </button>
            ) : null}
          </div>
        ) : visibles.map((ticket) => {
          const estado = COLOR_ESTADO[ticket.estado] || COLOR_ESTADO.nuevo;
          const activo = abierto === ticket.id;
          const cerrado = ticket.estado === "hecho" || ticket.estado === "descartado";
          return (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setAbierto(ticket.id)}
              className="ticket-card"
              style={{
                ...seccion,
                borderColor: activo ? C.blueB : C.border,
                background: activo ? C.blueL : C.panel,
                textAlign: "left", cursor: "pointer", padding: "11px 13px",
                display: "flex", gap: 11, alignItems: "flex-start", fontFamily: C.sans,
                opacity: cerrado && !activo ? .72 : 1,
              }}
            >
              <Voto ticket={ticket} onVotar={votar} ocupado={votando === ticket.id} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  <Pastilla color={estado.color()} soft={estado.soft()} borde={estado.borde()}>
                    {etiquetaEstado(ticket.estado)}
                  </Pastilla>
                  <Pastilla color={COLOR_TIPO[ticket.tipo]?.() || C.blue} soft={C.panel2} borde={C.border}>
                    {etiquetaTipo(ticket.tipo)}
                  </Pastilla>
                  {ticket.pantalla ? <Pastilla color={C.dim} soft={C.panel2} borde={C.border}>{ticket.pantalla}</Pastilla> : null}
                  {ticket.prioridad === "alta" ? <Pastilla color={C.red} soft={C.redL} borde={C.redB}>Alta</Pastilla> : null}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: C.text, lineHeight: 1.35 }}>
                  {ticket.titulo}
                </div>
                <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Avatar persona={ticket.autor} size={17} />
                  {nombrePersona(ticket.autor)} · {haceCuanto(ticket.created_at)}
                  {ticket.asignado ? <> · <span style={{ color: C.muted, fontWeight: 800 }}>{nombrePersona(ticket.asignado)}</span></> : null}
                </div>
              </div>
              <ChevronRight size={15} color={C.dim} style={{ flexShrink: 0, marginTop: 4 }} />
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      {nuevo ? (
        <ModalNuevo
          hayCapturas={hayCapturas}
          onCerrar={() => setNuevo(false)}
          onCreado={async (id) => {
            setNuevo(false);
            await cargar();
            setAbierto(id);
            toast.success("Listo, ya está cargado. Vas a poder seguirlo acá.");
          }}
        />
      ) : null}
      <style>{`
        .ticket-card { transition: border-color .16s, transform .16s, box-shadow .16s; }
        .ticket-card:hover { border-color: var(--border-2); transform: translateY(-1px); box-shadow: 0 6px 18px var(--shadow); }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "9px 12px 9px 54px" : "9px 18px", borderBottom: `1px solid ${C.border}`, background: C.topbar, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}>
              <LifeBuoy size={17} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Tickets</div>
              <div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>Pedidos y mejoras del sistema · con seguimiento</div>
            </div>
            <button type="button" onClick={() => setNuevo(true)} disabled={faltaTabla} style={{
              border: `1px solid ${C.blueB}`, background: C.blue, color: "var(--inverse-text)", borderRadius: 9,
              padding: "8px 13px", cursor: faltaTabla ? "default" : "pointer", fontSize: 12.5, fontWeight: 950,
              display: "inline-flex", alignItems: "center", gap: 7, opacity: faltaTabla ? .5 : 1,
            }}>
              <Plus size={14} /> {isMobile ? "" : "Nuevo ticket"}
            </button>
            <button type="button" onClick={cargar} disabled={cargando} title="Actualizar" style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, cursor: cargando ? "default" : "pointer", opacity: cargando ? .6 : 1 }}>
              <RefreshCw size={15} className={cargando ? "spin" : ""} />
            </button>
          </header>

          {/* En el teléfono es una cosa o la otra; en escritorio, lista y detalle. */}
          {isMobile ? (
            seleccionado ? (
              <Detalle
                ticket={seleccionado} miId={miId} puedeGestionar={puedeGestionar} hayCapturas={hayCapturas}
                onCambiar={cambiar} onBorrar={borrar} onVotar={votar}
                isMobile onVolver={() => setAbierto(null)}
              />
            ) : lista
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(320px, .85fr) minmax(0, 1.15fr)" }}>
              <div style={{ minWidth: 0, borderRight: `1px solid ${C.border}` }}>{lista}</div>
              <div style={{ minWidth: 0 }}>
                {seleccionado ? (
                  <Detalle
                    ticket={seleccionado} miId={miId} puedeGestionar={puedeGestionar} hayCapturas={hayCapturas}
                    onCambiar={cambiar} onBorrar={borrar} onVotar={votar}
                    isMobile={false}
                  />
                ) : (
                  <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 30, textAlign: "center" }}>
                    <div>
                      <MessageSquare size={22} color={C.dim} style={{ marginBottom: 9 }} />
                      <div style={{ fontSize: 13.5, fontWeight: 900, color: C.text }}>Elegí un ticket</div>
                      <div style={{ color: C.dim, fontSize: 12.5, marginTop: 5, maxWidth: 300, lineHeight: 1.5 }}>
                        Acá se ve el pedido completo, quién lo está mirando y todo lo que pasó con él.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
