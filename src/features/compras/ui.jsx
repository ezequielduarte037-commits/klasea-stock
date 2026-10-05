import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CSS_COMPRAS_MODULO } from "./estilos";
import VistazoPedido from "./Vistazo";
import { ChevronRight, LayoutGrid, LayoutList, MessageSquare, Paperclip, Search, Users, X } from "lucide-react";
import {
  RECORRIDO,
  RaizCompras,
  estadoDe,
  iniciales,
  prioridadDe,
  textoPlano,
} from "./modulo";

// Piezas chicas del módulo de Compras. Usan las clases de estilos.js (.cmp-…),
// así que se montan siempre adentro de la raíz .cmp.

export function Cabecera({ eyebrow = "Compras", titulo, acento, sub, acciones, children }) {
  return (
    <div className="cmp-cab">
      <div className="cmp-titulos">
        <div className="cmp-eyebrow">{eyebrow}</div>
        <h1 className="cmp-h1">{titulo}{acento && <> <span className="acento">{acento}</span></>}</h1>
        {sub && <p className="cmp-sub">{sub}</p>}
      </div>
      {acciones && <div className="cmp-acciones">{acciones}</div>}
      {children}
    </div>
  );
}

export function EstadoPedido({ status, grande = false, conIcono = true }) {
  const e = estadoDe(status);
  const Icon = e.Icon;
  return (
    <span className={`cmp-estado${grande ? " grande" : ""}`} data-tono={e.tono} title={e.ayuda}>
      {conIcono && Icon && <Icon size={grande ? 14 : 12} strokeWidth={2.4} />}
      {e.label}
    </span>
  );
}

// Sólo se muestra cuando dice algo: alta y urgente.
export function Prioridad({ value, siempre = false }) {
  if (!siempre && !["alta", "urgente"].includes(value)) return null;
  const p = prioridadDe(value);
  return <span className="cmp-tag" data-tono={p.tono}>{p.label}</span>;
}

export function Tag({ tono = "neutro", children, title }) {
  return <span className="cmp-tag" data-tono={tono} title={title}>{children}</span>;
}

export function Estado({ tono = "neutro", children, title }) {
  return <span className="cmp-estado" data-tono={tono} title={title}>{children}</span>;
}

// Dónde está el pedido en el recorrido Nuevo → Recibido.
export function Progreso({ status }) {
  const e = estadoDe(status);
  const cancelado = status === "cancelado";
  const idx = RECORRIDO.findIndex((x) => x.value === status);
  const Icon = e.Icon;
  return (
    <div className={`cmp-prog${cancelado ? " cancelado" : ""}`} data-tono={e.tono} title={e.ayuda}>
      <div className="cmp-prog-txt">{Icon && <Icon size={12} strokeWidth={2.4} />}{e.label}</div>
      <div className="cmp-prog-barras" aria-hidden="true">
        {RECORRIDO.map((paso, i) => (
          <i key={paso.value} className={`${!cancelado && i <= idx ? "on" : ""}${i === idx ? " actual" : ""}`} />
        ))}
      </div>
    </div>
  );
}

export function Avatar({ nombre, tono = "azul", grande = false }) {
  return <span className={`cmp-avatar${grande ? " grande" : ""}`} data-tono={tono}>{iniciales(nombre)}</span>;
}

export function Aviso({ tono = "rojo", icono: Icono, children, onCerrar }) {
  return (
    <div className="cmp-aviso" data-tono={tono} role={tono === "rojo" ? "alert" : "status"}>
      {Icono && <Icono size={15} />}
      <span>{children}</span>
      {onCerrar && (
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar aviso">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Vacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="cmp-vacio">
      {Icono && <div className="cmp-vacio-ic"><Icono size={21} /></div>}
      {titulo && <b>{titulo}</b>}
      {texto && <div style={{ maxWidth: 440, lineHeight: 1.5 }}>{texto}</div>}
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Bloque({ icono: Icono, tono = "azul", titulo, texto, der, children, sinPad = false, i = 0, style, id }) {
  return (
    <section className="cmp-bloque" style={{ "--i": i, ...style }} id={id}>
      {(titulo || der) && (
        <div className="cmp-bloque-cab">
          {Icono && <span className="cmp-bloque-ic" data-tono={tono}><Icono size={17} /></span>}
          <div style={{ minWidth: 0 }}>
            {titulo && <h2 className="cmp-bloque-tit">{titulo}</h2>}
            {texto && <p className="cmp-bloque-txt">{texto}</p>}
          </div>
          {der && <div className="der">{der}</div>}
        </div>
      )}
      {children && <div className={`cmp-bloque-cuerpo${sinPad ? " sin-pad" : ""}`}>{children}</div>}
    </section>
  );
}

export function Grupo({ titulo, texto, cuenta, tono = "neutro", der, children }) {
  return (
    <section className="cmp-grupo">
      <div className="cmp-grupo-cab" data-tono={tono}>
        <span className="pto" />
        <span className="cmp-grupo-tit">{titulo}</span>
        {cuenta != null && <span className="cmp-grupo-n">{cuenta}</span>}
        {texto && <span className="cmp-grupo-txt">{texto}</span>}
        <span className="linea" />
        {der}
      </div>
      {children}
    </section>
  );
}

export function Buscar({ value, onChange, placeholder = "Buscar…", ancho = false, label }) {
  return (
    <label className={`cmp-buscar${ancho ? " ancho" : ""}`}>
      <Search size={15} />
      <input className="ui-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} />
    </label>
  );
}

export function Chip({ on, tono, cuenta, onClick, children, title }) {
  return (
    <button type="button" className={`cmp-chip${on ? " on" : ""}`} data-tono={tono} onClick={onClick} aria-pressed={on} title={title}>
      {tono && <span className="pto" />}
      {children}
      {cuenta != null && <span className="n">{cuenta}</span>}
    </button>
  );
}

// Fila de un pedido: estado, título, de dónde viene y por qué paso va.
export function FilaPedido({ request, sinLeer = false, motivo, onAbrir, i = 0, mostrarCreador = true, onVistazo }) {
  const e = estadoDe(request.status);
  const Icon = e.Icon;
  const destino = request.project?.codigo || (request.destino || "").trim();
  const cerrado = ["recibido", "cancelado"].includes(request.status);
  const fecha = request.updated_at || request.created_at;
  return (
    <button
      type="button"
      className={`cmp-fila${cerrado ? " cerrada" : ""}`}
      style={{ "--i": Math.min(i, 14), "--marca": motivo ? `var(--${MARCA[motivo.tono] || "border"})` : "transparent" }}
      onClick={onAbrir}
      onMouseEnter={onVistazo ? (ev) => onVistazo(request, ev.currentTarget) : undefined}
      onMouseLeave={onVistazo ? () => onVistazo(null) : undefined}
    >
      <span className="cmp-fila-ic" data-tono={e.tono}>{Icon && <Icon size={16} strokeWidth={2.2} />}</span>
      <span className="cmp-fila-main">
        <span className="cmp-fila-l1">
          {sinLeer && <span className="cmp-punto-nuevo" title="Mensaje sin leer" />}
          <span className="cmp-fila-tit">{request.title || "Pedido sin título"}</span>
          <Prioridad value={request.priority} />
        </span>
        <span className="cmp-fila-meta">
          <span className="obra">{destino || "Sin destino"}</span>
          {mostrarCreador && request.creator?.username && <span>{request.creator.username}</span>}
          {request.proveedor && <span>{request.proveedor}</span>}
          {motivo && motivo.mostrar !== false && <span className="motivo" data-tono={motivo.tono}>{motivo.label}</span>}
        </span>
      </span>
      <Progreso status={request.status} />
      <span className="cmp-fila-fecha">
        <span className="d">{fecha ? new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—"}</span>
        {request.needed_at && !cerrado && <span className="r">para {new Date(`${String(request.needed_at).slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</span>}
      </span>
      <ChevronRight size={16} className="cmp-fila-chev" />
    </button>
  );
}

// Tarjeta de un pedido: la vista de siempre de Compras, con el estado a la
// izquierda y el paso en que va abajo.
export function TarjetaPedido({ request, sinLeer = false, motivo, onAbrir, i = 0, mostrarCreador = true, onVistazo }) {
  const e = estadoDe(request.status);
  const destino = request.project?.codigo || (request.destino || "").trim();
  const cerrado = ["recibido", "cancelado"].includes(request.status);
  const fecha = request.updated_at || request.created_at;
  const resumen = textoPlano(request.description);
  const adjuntos = (request.attachments?.length || 0) + (request.photo_url && !request.attachments?.length ? 1 : 0);
  const copias = request.followers?.length || 0;
  const idx = RECORRIDO.findIndex((x) => x.value === request.status);
  const fechaCorta = (v) => new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  return (
    <button
      type="button"
      className={`cmp-tarjeta${cerrado ? " cerrada" : ""}`}
      data-tono={e.tono}
      style={{ "--i": Math.min(i, 18) }}
      onClick={onAbrir}
      onMouseEnter={onVistazo ? (ev) => onVistazo(request, ev.currentTarget) : undefined}
      onMouseLeave={onVistazo ? () => onVistazo(null) : undefined}
    >
      <span className="cmp-tarjeta-cab">
        <EstadoPedido status={request.status} />
        <span style={{ flex: 1 }} />
        {sinLeer && <span className="cmp-punto-nuevo" title="Mensaje sin leer" />}
        <Prioridad value={request.priority} />
      </span>
      <span className="cmp-tarjeta-tit">{request.title || "Pedido sin título"}</span>
      <span className="cmp-fila-meta">
        <span className="obra">{destino || "Sin destino"}</span>
        {mostrarCreador && request.creator?.username && <span>{request.creator.username}</span>}
        {request.proveedor && <span>{request.proveedor}</span>}
      </span>
      {resumen && <span className="cmp-tarjeta-desc">{resumen}</span>}
      {motivo && motivo.mostrar !== false && <span className="cmp-tarjeta-motivo" data-tono={motivo.tono}>{motivo.label}</span>}
      <span className="cmp-tarjeta-pie">
        <span className="cmp-prog-barras" aria-hidden="true">
          {RECORRIDO.map((paso, k) => <i key={paso.value} className={`${!cerrado || request.status === "recibido" ? (k <= idx ? "on" : "") : ""}${k === idx ? " actual" : ""}`} />)}
        </span>
        <span className="cmp-tarjeta-datos">
          <span className="mono">{fecha ? fechaCorta(fecha) : "—"}</span>
          {request.needed_at && !cerrado && <span>para {fechaCorta(String(request.needed_at).slice(0, 10))}</span>}
          <span style={{ flex: 1 }} />
          {copias > 0 && <span title={`${copias} en copia`}><Users size={12} /> {copias}</span>}
          {adjuntos > 0 && <span title={`${adjuntos} archivos`}><Paperclip size={12} /> {adjuntos}</span>}
          {request.last_comment_author_id && <span title="Tiene conversación"><MessageSquare size={12} /></span>}
        </span>
      </span>
    </button>
  );
}

// Tarjetas o lista: la misma información, dos formas de verla.
export function SelectorVista({ vista, onCambiar }) {
  return (
    <div className="cmp-seg" role="radiogroup" aria-label="Cómo ver los pedidos">
      <button type="button" role="radio" aria-checked={vista === "tarjetas"} className={vista === "tarjetas" ? "on" : ""} onClick={() => onCambiar("tarjetas")} title="Tarjetas">
        <LayoutGrid size={14} /> <span className="txt-largo">Tarjetas</span>
      </button>
      <button type="button" role="radio" aria-checked={vista === "lista"} className={vista === "lista" ? "on" : ""} onClick={() => onCambiar("lista")} title="Lista">
        <LayoutList size={14} /> <span className="txt-largo">Lista</span>
      </button>
    </div>
  );
}

export function PedidosEnVista({ vista, pedidos, sinLeer, motivoDe, mostrarCreador = true, onAbrir }) {
  const [vistazo, setVistazo] = useState(null);
  const espera = useRef(null);

  // Sólo con mouse: en el celular no hay "pasar por encima".
  function alPasar(request, el) {
    window.clearTimeout(espera.current);
    if (!request) { setVistazo(null); return; }
    if (!window.matchMedia?.("(hover: hover)").matches) return;
    espera.current = window.setTimeout(() => setVistazo({ request, rect: el.getBoundingClientRect() }), 380);
  }

  useEffect(() => () => window.clearTimeout(espera.current), []);
  useEffect(() => {
    if (!vistazo) return undefined;
    const cerrar = () => setVistazo(null);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => { window.removeEventListener("scroll", cerrar, true); window.removeEventListener("resize", cerrar); };
  }, [vistazo]);

  const abrir = (r) => { window.clearTimeout(espera.current); setVistazo(null); onAbrir(r); };
  const props = (r, i) => ({ i, request: r, sinLeer: sinLeer?.has(r.id), motivo: motivoDe?.(r), mostrarCreador, onAbrir: () => abrir(r), onVistazo: alPasar });

  return (
    <>
      {vista === "lista" ? (
        <div className="cmp-lista">{pedidos.map((r, i) => <FilaPedido key={r.id} {...props(r, i)} />)}</div>
      ) : (
        <div className="cmp-tarjetas">{pedidos.map((r, i) => <TarjetaPedido key={r.id} {...props(r, i)} />)}</div>
      )}
      {vistazo && <VistazoPedido key={vistazo.request.id} request={vistazo.request} rect={vistazo.rect} />}
    </>
  );
}

const MARCA = { rojo: "red", violeta: "violet", azul: "blue", cian: "cyan", naranja: "orange", verde: "green", teal: "teal", neutro: "border-2" };

// Diálogo del módulo: tarjeta centrada en la computadora y hoja desde abajo en
// el celular. Se dibuja en la raíz del módulo. Cierra con Escape o tocando
// afuera, salvo mientras guarda.
export function Modal({ onCerrar, bloqueado = false, icono: Icono, tono = "azul", titulo, sub, children, pie, ancho = false, xl = false, capa }) {
  const raiz = useContext(RaizCompras);
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape" && !bloqueado) onCerrar?.(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar, bloqueado]);

  const contenido = (
    <div className="cmp-modal-fondo" style={capa ? { zIndex: capa } : undefined} onMouseDown={(e) => { if (e.target === e.currentTarget && !bloqueado) onCerrar?.(); }}>
      {/* Por si el diálogo se abre fuera de Compras (Laminación, Muebles…): React
          inserta este estilo una sola vez. */}
      <style href="klasea-compras" precedence="default">{CSS_COMPRAS_MODULO}</style>
      <div className={`cmp-modal${xl ? " xl" : ancho ? " ancho" : ""}`} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <div className="cmp-modal-cab">
          {Icono && <span className="cmp-modal-ic" data-tono={tono}><Icono size={17} /></span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cmp-modal-tit">{titulo}</div>
            {sub && <div className="cmp-modal-sub">{sub}</div>}
          </div>
          <button type="button" className="cmp-btn-ic" onClick={onCerrar} disabled={bloqueado} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="cmp-modal-cuerpo">{children}</div>
        {pie && <div className="cmp-modal-pie">{pie}</div>}
      </div>
    </div>
  );
  return createPortal(contenido, raiz || document.body);
}
