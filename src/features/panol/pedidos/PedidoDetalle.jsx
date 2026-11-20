import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine, ArrowLeft, Ban, CalendarDays, Check, LoaderCircle, MapPin, MoreHorizontal, Pencil, Printer, RotateCcw,
  Search, Send, Ship, Trash2, TriangleAlert, Warehouse, X,
} from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import useDialogo from "@/features/consumibles/useDialogo";
import {
  ENVIO_ESTADO_META, ITEM_ESTADO_META, actualizarTituloEnvio, comentarEnvio, deleteEnvio, fetchEnvio, fetchEventos,
  fetchObrasEgreso, marcarItems, reasignarObraDeItemEnvio, setEstadoEnvio,
} from "@/features/panol/panolApi";
import { registrarIngreso } from "@/features/panol/ingresos/ingresosApi";
import { fetchFotosDeMateriales, imprimirPedido } from "./pedidosApi";
import {
  ESTADO_PEDIDO, ESTADO_RENGLON, ESTADOS_PROBLEMA, FILTROS_RENGLON, cantidadTexto, correccionDeRenglon, cuentasDeRenglones,
  filtrarRenglones, porRecibir, renglonesDelPedido, resumenDelPedido,
} from "./pedidosLogica";

function fechaHora(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function tonoRenglon(estado) {
  if (estado === "recibido") return "ok";
  if (estado === "parcial") return "parcial";
  if (ESTADOS_PROBLEMA.has(estado)) return "novedad";
  return "camino";
}

function Evento({ ev }) {
  if (ev.tipo === "comentario") {
    return (
      <div className="pdd-evento">
        <i className="is-mensaje" aria-hidden="true" />
        <div>
          <div className="pdd-evento-texto">{ev.nota}</div>
          <div className="pdd-evento-cuando">{ev.actor?.username ? `${ev.actor.username} · ` : ""}{fechaHora(ev.created_at)}</div>
        </div>
      </div>
    );
  }
  const nuevo = ev.estado_nuevo;
  const texto = ev.tipo === "item_estado"
    ? <>{ITEM_ESTADO_META[ev.estado_anterior]?.label ?? ev.estado_anterior} → <strong>{ITEM_ESTADO_META[nuevo]?.label ?? nuevo}</strong></>
    : ev.tipo === "creado" ? <strong>Pedido creado</strong>
    : ev.tipo === "estado" ? <>Pedido → <strong>{ENVIO_ESTADO_META[nuevo]?.label ?? nuevo}</strong></>
    : ev.tipo === "titulo" ? "Título actualizado"
    : ev.tipo;
  return (
    <div className="pdd-evento">
      <i className={`is-${ev.tipo === "item_estado" ? tonoRenglon(nuevo) : "x"}`} aria-hidden="true" />
      <div>
        <div className="pdd-evento-texto">{texto}{ev.nota ? <><br />{ev.nota}</> : null}</div>
        <div className="pdd-evento-cuando">{ev.actor?.username ? `${ev.actor.username} · ` : ""}{fechaHora(ev.created_at)}</div>
      </div>
    </div>
  );
}

function Hoja({ titulo, sub, onCerrar, pie, children }) {
  const ref = useRef(null);
  useDialogo(ref, onCerrar);
  return (
    <div className="pdd-capa" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="pdd-hoja" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <div className="pdd-hoja-cab">
          <div style={{ minWidth: 0 }}>
            <div className="pdd-hoja-titulo">{titulo}</div>
            {sub ? <div className="pdd-hoja-sub">{sub}</div> : null}
          </div>
          <button type="button" className="pdd-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="pdd-hoja-cuerpo">{children}</div>
        {pie ? <div className="pdd-hoja-pie">{pie}</div> : null}
      </div>
    </div>
  );
}

/**
 * Corregir un renglón: cuántos llegaron (el estado sale solo: completo es
 * recibido, menos es parcial), volverlo a "falta", la nota y, para quien
 * gestiona, a qué obra va.
 */
function HojaCorregir({ renglon: r, sede, obras = [], puedeCambiarObra = false, guardando = false, onGuardar, onCerrar }) {
  const inicial = r.estado === "recibido" || r.estado === "parcial" ? "llego" : "falta";
  const [modo, setModo] = useState(inicial);
  const cantidadInicial = r.estado === "recibido" ? String(r.llego || r.pedido || "") : r.estado === "parcial" ? String(r.llego || "") : "";
  const [cantidad, setCantidad] = useState(cantidadInicial);
  const [nota, setNota] = useState(r.nota || "");
  const [obraId, setObraId] = useState(r.stock_general ? "" : r.obra_id || "");
  const plan = modo === "falta" ? correccionDeRenglon(r, { estado: "pendiente" }) : correccionDeRenglon(r, { estado: "recibido", cantidad });
  const cambiaEstado = !plan.error && (modo !== inicial || (modo === "llego" && cantidad.trim() !== cantidadInicial));
  const cambiaObra = puedeCambiarObra && r.obra_snapshot_item_id && (obraId || "") !== (r.stock_general ? "" : r.obra_id || "");
  const cambiaNota = (nota.trim() || "") !== (r.nota || "");
  const puede = !guardando && !plan.error && (cambiaEstado || cambiaObra || cambiaNota);

  return (
    <Hoja
      titulo={r.descripcion}
      sub={`Pedido ${r.pedido ?? r.cantidad ?? "—"}${r.unidad ? ` ${r.unidad}` : ""} · ${ESTADO_RENGLON[r.estado] || r.estado}`}
      onCerrar={() => { if (!guardando) onCerrar(); }}
      pie={(
        <>
          <button type="button" className="ui-btn" disabled={guardando} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={!puede} onClick={() => onGuardar({ plan, cambiaEstado, cambiaObra, obraId, cambiaNota, nota: nota.trim() })}>
            {guardando ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Guardar
          </button>
        </>
      )}
    >
      <div className="pdd-campo">
        <span className="pdd-rotulo">Qué pasó</span>
        <div className="pdd-opciones" role="radiogroup" aria-label="Qué pasó" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button type="button" role="radio" aria-checked={modo === "llego"} className={`pdd-opcion${modo === "llego" ? " is-activa" : ""}`} onClick={() => setModo("llego")}>Llegó</button>
          <button type="button" role="radio" aria-checked={modo === "falta"} className={`pdd-opcion${modo === "falta" ? " is-activa" : ""}`} onClick={() => setModo("falta")}>Todavía falta</button>
        </div>
      </div>
      {modo === "llego" ? (
        <div className="pdd-campo">
          <label htmlFor="pdd-cantidad">Cuántos llegaron en total</label>
          <input id="pdd-cantidad" className="ui-input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoComplete="off" style={{ fontSize: 18, maxWidth: 180 }} />
        </div>
      ) : null}
      {plan.sacaDelStock ? (
        <div className="pdd-aviso" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>Esto saca del stock de {sede} lo que ya había entrado. Hacelo sólo si el ingreso se cargó mal.</span>
        </div>
      ) : null}
      {puedeCambiarObra && r.obra_snapshot_item_id ? (
        <div className="pdd-campo">
          <label htmlFor="pdd-obra">A qué obra va</label>
          <select id="pdd-obra" className="ui-input" value={obraId} onChange={(e) => setObraId(e.target.value)}>
            <option value="">Stock {sede}</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
          </select>
        </div>
      ) : null}
      <div className="pdd-campo">
        <label htmlFor="pdd-nota">Nota</label>
        <textarea id="pdd-nota" className="ui-input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
    </Hoja>
  );
}

function iniciales(texto = "") {
  return String(texto).trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
}

/** La foto del producto; sin foto (o si no carga), sus iniciales. */
function Foto({ url, nombre, onAmpliar }) {
  const [mal, setMal] = useState(false);
  const hay = url && !mal;
  if (!hay) return <span className="pdd-foto" aria-hidden="true"><span>{iniciales(nombre)}</span></span>;
  return (
    <button type="button" className="pdd-foto is-boton" onClick={() => onAmpliar({ url, nombre })} aria-label={`Ver la foto de ${nombre}`}>
      <img src={url} alt="" loading="lazy" decoding="async" onError={() => setMal(true)} />
    </button>
  );
}

function FilaRenglon({ r, sede, foto, puedeCorregir, resaltado = false, onCorregir, onAmpliar }) {
  const tono = tonoRenglon(r.estado);
  return (
    <div className={`pdd-renglon${resaltado ? " is-resaltado" : ""}`} id={`renglon-${r.id}`}>
      <Foto url={foto} nombre={r.descripcion} onAmpliar={onAmpliar} />
      <div style={{ minWidth: 0 }}>
        <div className="pdd-renglon-nombre">{r.descripcion || "Sin descripción"}</div>
        <div className="pdd-renglon-sub">
          {r.codigo ? <span>{r.codigo}</span> : null}
          {r.variante ? <i>{r.variante}</i> : null}
          {r.material?.ubicacion ? <span><MapPin size={11} aria-hidden="true" /> {r.material.ubicacion}</span> : null}
          {r.nota ? <i>{r.nota}</i> : null}
        </div>
      </div>
      <span className={`pdd-destino${r.obra_codigo && !r.stock_general ? "" : " is-stock"}`}>{r.obra_codigo && !r.stock_general ? r.obra_codigo : `Stock ${sede}`}</span>
      <span className="pdd-cant">{cantidadTexto(r)}</span>
      <span className={`pdd-etiqueta is-${tono}`}>{ESTADO_RENGLON[r.estado] || r.estado}</span>
      {puedeCorregir ? (
        <button type="button" className="pdd-corregir" onClick={() => onCorregir(r)} aria-label={`Corregir ${r.descripcion}`} title="Corregir cantidad, estado, nota u obra">
          <Pencil size={15} />
        </button>
      ) : <span />}
    </div>
  );
}

/**
 * La ficha de un pedido: qué es, cuánto llegó, cada renglón y el historial.
 * Recibir se hace en el mostrador ("Recibir en el mostrador" lo abre con este
 * pedido elegido); acá se corrige un renglón, se manda un mensaje, se imprime
 * y quien gestiona cierra, cancela o borra.
 */
export default function PedidoDetalle({ envioId, materialInicial = "", itemInicial = "", profile, canReceive = false, isManager = false, onBack }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirmar = useConfirm();
  const verPrecios = !!profile?.is_admin || profile?.role === "admin";
  const [envio, setEnvio] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [menu, setMenu] = useState(false);
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [msg, setMsg] = useState("");
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [obras, setObras] = useState([]);
  const [fotos, setFotos] = useState(() => new Map());
  const [ampliada, setAmpliada] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [e, ev] = await Promise.all([fetchEnvio(envioId), fetchEventos(envioId).catch(() => [])]);
      setEnvio(verPrecios ? e : {
        ...e,
        items: (e.items || []).map((it) => {
          const limpio = { ...it };
          delete limpio.precio_unitario;
          delete limpio.moneda;
          return limpio;
        }),
      });
      setEventos(ev || []);
      setError("");
    } catch (err) {
      setError(err?.message || "No se pudo abrir el pedido.");
    }
  }, [envioId, verPrecios]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!ampliada) return undefined;
    const tecla = (e) => { if (e.key === "Escape") setAmpliada(null); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [ampliada]);

  // Las fotos del catálogo, aparte: el pedido se muestra sin esperarlas.
  const idsMateriales = useMemo(() => (envio?.items || []).map((it) => it.material_id).filter(Boolean).sort().join(","), [envio]);
  useEffect(() => {
    if (!idsMateriales) return undefined;
    let vivo = true;
    fetchFotosDeMateriales(idsMateriales.split(",")).then((m) => { if (vivo) setFotos(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [idsMateriales]);

  useEffect(() => {
    if (!isManager) return undefined;
    let vivo = true;
    fetchObrasEgreso().then((o) => { if (vivo) setObras(o || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [isManager]);

  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = (e) => { if (!e.target.closest?.(".pdd-acciones")) setMenu(false); };
    const tecla = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", tecla); };
  }, [menu]);

  const renglones = useMemo(() => renglonesDelPedido(envio?.items || []), [envio]);
  const resumen = useMemo(() => resumenDelPedido(envio?.items || []), [envio]);
  const cuentas = useMemo(() => cuentasDeRenglones(renglones), [renglones]);
  const visibles = useMemo(() => filtrarRenglones(renglones, filtro, busqueda), [renglones, filtro, busqueda]);
  // Si se llegó desde otra pantalla apuntando a un renglón (o a un producto), queda marcado.
  const resaltado = useMemo(() => {
    if (!itemInicial && !materialInicial) return null;
    return (envio?.items || []).find((it) => it.id === itemInicial || (materialInicial && it.material_id === materialInicial))?.id || null;
  }, [envio, itemInicial, materialInicial]);
  useEffect(() => {
    if (!resaltado) return undefined;
    const t = window.setTimeout(() => document.getElementById(`renglon-${resaltado}`)?.scrollIntoView({ block: "center" }), 80);
    return () => window.clearTimeout(t);
  }, [resaltado]);
  const cerrado = envio && ["cerrado", "cancelado"].includes(envio.estado);
  const espera = envio && porRecibir(envio);

  async function guardarTitulo(e) {
    e.preventDefault();
    const t = titulo.trim();
    if (!t || t === envio.titulo) { setEditandoTitulo(false); return; }
    setGuardando(true);
    try {
      await actualizarTituloEnvio(envio.id, t);
      setEditandoTitulo(false);
      await cargar();
      toast.success("Título actualizado.");
    } catch (err) {
      toast.error(err?.message || "No se pudo cambiar el título.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(estado) {
    setMenu(false);
    const textos = {
      cerrado: ["Cerrar el pedido", "Deja de esperarse lo que falta. Los renglones quedan como están y se puede reactivar.", "Cerrar"],
      cancelado: ["Cancelar el pedido", "Sale de la lista del pañol. No se borra nada y se puede reactivar.", "Cancelar el pedido"],
      enviado: ["Reactivar el pedido", "Vuelve a la lista del pañol con sus renglones como estaban.", "Reactivar"],
    }[estado];
    const ok = await confirmar({ title: textos[0], message: textos[1], confirmLabel: textos[2], tone: estado === "cancelado" ? "danger" : undefined });
    if (!ok) return;
    try {
      await setEstadoEnvio(envio.id, estado);
      await cargar();
      toast.success(estado === "enviado" ? "Pedido reactivado." : estado === "cerrado" ? "Pedido cerrado." : "Pedido cancelado.");
    } catch (err) {
      toast.error(err?.message || "No se pudo cambiar el estado.");
    }
  }

  async function borrar() {
    setMenu(false);
    const ok = await confirmar({
      title: "Borrar el pedido",
      message: `Se borran "${envio.titulo}", sus renglones y el historial. No queda cancelado ni archivado: desaparece.`,
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteEnvio(envio.id);
      toast.success("Pedido borrado.");
      onBack?.();
    } catch (err) {
      toast.error(err?.message || "No se pudo borrar el pedido.");
    }
  }

  async function enviarMensaje() {
    const t = msg.trim();
    if (!t) return;
    try {
      await comentarEnvio(envio.id, t);
      setMsg("");
      setEventos(await fetchEventos(envio.id));
    } catch (err) {
      toast.error(err?.message || "No se pudo mandar el mensaje.");
    }
  }

  async function guardarCorreccion(r, { plan, cambiaEstado, cambiaObra, obraId, cambiaNota, nota }) {
    setGuardando(true);
    try {
      if (cambiaEstado) {
        if (plan.estado === "pendiente") await marcarItems([r.id], "pendiente", { nota: nota || null });
        // Recibir por el mismo camino del mostrador: avisa a Compras si el pedido quedó completo.
        else await registrarIngreso({ recibir: [{ id: r.id, envioId: envio.id, estado: plan.estado, cantidadRecibida: plan.cantidadRecibida }], actor: profile });
      }
      if (cambiaNota && !(cambiaEstado && plan.estado === "pendiente")) {
        const estadoFinal = cambiaEstado ? plan.estado : r.estado;
        await marcarItems([r.id], estadoFinal, { nota: nota || null, cantidadRecibida: estadoFinal === "pendiente" ? null : (plan.cantidadRecibida ?? r.cantidad_recibida ?? null) });
      }
      if (cambiaObra) await reasignarObraDeItemEnvio(r.obra_snapshot_item_id, obraId || null);
      setCorrigiendo(null);
      await cargar();
      toast.success("Renglón corregido.");
    } catch (err) {
      toast.error(err?.message || "No se pudo corregir el renglón.");
    } finally {
      setGuardando(false);
    }
  }

  if (error) {
    return (
      <div className="pdd-scroll">
        <div className="pdd-cab">
          <button type="button" className="pdd-volver" onClick={onBack}><ArrowLeft size={15} /> Pedidos</button>
          <div className="pdd-vacio"><strong>No se pudo abrir el pedido</strong>{error}</div>
        </div>
      </div>
    );
  }
  if (!envio) return <Cargando llenar texto="Abriendo el pedido…" />;

  const pct = (n) => (resumen.total ? `${(n / resumen.total) * 100}%` : "0%");
  const origen = envio.origen === "compra" ? "Compras" : envio.origen === "remito" ? "Remito" : "Pañol";
  const prioridad = envio.prioridad === "urgente" || envio.prioridad === "alta" ? envio.prioridad : null;
  const estadoTono = envio.estado === "cancelado" || envio.estado === "cerrado" ? "x" : resumen.novedades ? "novedad" : envio.estado === "recibido" || resumen.completo ? "ok" : resumen.recibidos || resumen.parciales ? "parcial" : "camino";
  const hayMenu = canReceive || isManager;

  return (
    <div className="pdd-scroll">
      <header className="pdd-cab">
        <button type="button" className="pdd-volver" onClick={onBack}><ArrowLeft size={15} /> Pedidos</button>
        <div className="pdd-cab-fila">
          {editandoTitulo ? (
            <form className="pdd-titulo-editar" onSubmit={guardarTitulo} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditandoTitulo(false); } }}>
              <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus aria-label="Título del pedido" maxLength={200} />
              <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Guardar</button>
              <button type="button" className="ui-btn" onClick={() => setEditandoTitulo(false)}>Cancelar</button>
            </form>
          ) : (
            <h1 className="pdd-titulo">{envio.titulo || "Pedido"}</h1>
          )}
          <div className="pdd-acciones">
            {canReceive && espera ? (
              <button type="button" className="ui-btn ui-btn-primario" onClick={() => nav(`/ingresos-panol?pedido=${envio.id}`)}>
                <ArrowDownToLine size={15} /> Recibir en el mostrador
              </button>
            ) : null}
            <button type="button" className="ui-btn" onClick={() => { if (!imprimirPedido(envio, { verPrecios })) toast.error("Habilitá las ventanas emergentes para imprimir."); }}>
              <Printer size={15} /> Imprimir
            </button>
            {hayMenu ? (
              <button type="button" className="ui-btn ui-btn-icono" aria-haspopup="menu" aria-expanded={menu} aria-label="Más acciones" onClick={() => setMenu((v) => !v)}>
                <MoreHorizontal size={16} />
              </button>
            ) : null}
            {menu ? (
              <div className="pdd-menu" role="menu">
                {canReceive ? (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setTitulo(envio.titulo || ""); setEditandoTitulo(true); }}>
                    <Pencil size={15} /> Cambiar el título
                  </button>
                ) : null}
                {isManager && cerrado ? (
                  <button type="button" role="menuitem" onClick={() => cambiarEstado("enviado")}><RotateCcw size={15} /> Reactivar</button>
                ) : null}
                {isManager && !cerrado ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => cambiarEstado("cerrado")}><Check size={15} /> Cerrar el pedido</button>
                    <button type="button" role="menuitem" onClick={() => cambiarEstado("cancelado")}><Ban size={15} /> Cancelar el pedido</button>
                  </>
                ) : null}
                {isManager ? (
                  <>
                    <hr />
                    <button type="button" role="menuitem" className="is-peligro" onClick={borrar}><Trash2 size={15} /> Borrar</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="pdd-meta">
          <span className={`pdd-etiqueta is-${estadoTono}`}>{ESTADO_PEDIDO[envio.estado] || envio.estado}</span>
          {prioridad ? <span className={`pdd-etiqueta is-${prioridad}`}>{prioridad === "urgente" ? "Urgente" : "Alta"}</span> : null}
          <span>{envio.obra?.codigo ? <><Ship size={14} aria-hidden="true" /> Obra {envio.obra.codigo}</> : <><Warehouse size={14} aria-hidden="true" /> {envio.destino || "Stock"}</>}</span>
          <span>Pañol {envio.sede}</span>
          <span>Pedido por {origen}</span>
          <span><CalendarDays size={14} aria-hidden="true" /> {fechaHora(envio.created_at)}</span>
        </div>
        <div className="pdd-cifras">
          <div className="pdd-cifra">
            <span>Recibidos</span>
            <strong>{resumen.recibidos}<small>de {resumen.total}</small></strong>
            <span className="pdd-barra-avance" aria-hidden="true">
              <i className="is-ok" style={{ width: pct(resumen.recibidos) }} />
              <i className="is-parcial" style={{ width: pct(resumen.parciales) }} />
              <i className="is-novedad" style={{ width: pct(resumen.novedades) }} />
            </span>
          </div>
          <div className="pdd-cifra"><span>Faltan</span><strong>{resumen.pendientes}</strong></div>
          <div className="pdd-cifra"><span>Llegó una parte</span><strong>{resumen.parciales}</strong></div>
          <div className={`pdd-cifra${resumen.novedades ? " is-alerta" : ""}`}><span>Novedades</span><strong>{resumen.novedades}</strong></div>
        </div>
      </header>

      <div className="pdd-cuerpo">
        <section aria-label="Renglones">
          <div className="pdd-renglones-cab">
            <div className="pdd-filtros" role="tablist" aria-label="Renglones">
              {FILTROS_RENGLON.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.valor}
                  className={`pdd-filtro${filtro === f.valor ? " is-activo" : ""}${f.valor === "novedades" && cuentas.novedades ? " is-alerta" : ""}`}
                  onClick={() => setFiltro(f.valor)}
                >
                  {f.etiqueta}<small>{cuentas[f.valor]}</small>
                </button>
              ))}
            </div>
            {renglones.length > 8 ? (
              <div className="pdd-buscar">
                <Search size={15} aria-hidden="true" />
                <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar en el pedido" placeholder="Buscar" />
                {busqueda ? <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={14} /></button> : null}
              </div>
            ) : null}
          </div>
          {!visibles.length ? (
            <div className="pdd-vacio"><strong>{renglones.length ? "Nada en este filtro" : "El pedido no tiene renglones"}</strong></div>
          ) : visibles.map((r) => (
            <FilaRenglon key={r.id} r={r} sede={envio.sede} foto={fotos.get(r.material_id)} puedeCorregir={canReceive && !cerrado} resaltado={r.id === resaltado} onCorregir={setCorrigiendo} onAmpliar={setAmpliada} />
          ))}
        </section>

        <aside className="pdd-lado" aria-label="Historial">
          {envio.observaciones ? (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="pdd-rotulo">Observaciones</span>
              <div className="pdd-obs">{envio.observaciones}</div>
            </div>
          ) : null}
          <div className="pdd-mensaje">
            <label className="pdd-rotulo" htmlFor="pdd-msg">Mensaje a Compras y pañol</label>
            <textarea id="pdd-msg" className="ui-input" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviarMensaje(); }} />
            <button type="button" className="ui-btn" disabled={!msg.trim()} onClick={enviarMensaje}><Send size={14} /> Enviar</button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="pdd-rotulo">Historial</span>
            <div className="pdd-historial">
              {eventos.length ? eventos.map((ev) => <Evento key={ev.id} ev={ev} />) : <div className="pdd-evento-cuando" style={{ padding: "10px 0" }}>Sin movimientos todavía.</div>}
            </div>
          </div>
        </aside>
      </div>

      {ampliada ? (
        <div className="pdd-capa pdd-capa-foto" onMouseDown={() => setAmpliada(null)} role="dialog" aria-modal="true" aria-label={ampliada.nombre}>
          <figure className="pdd-foto-grande">
            <img src={ampliada.url} alt={ampliada.nombre} />
            <figcaption>{ampliada.nombre}</figcaption>
          </figure>
        </div>
      ) : null}

      {corrigiendo ? (
        <HojaCorregir
          key={corrigiendo.id}
          renglon={corrigiendo}
          sede={envio.sede}
          obras={obras}
          puedeCambiarObra={isManager}
          guardando={guardando}
          onCerrar={() => setCorrigiendo(null)}
          onGuardar={(datos) => guardarCorreccion(corrigiendo, datos)}
        />
      ) : null}
    </div>
  );
}
