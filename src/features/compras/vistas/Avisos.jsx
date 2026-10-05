import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  LoaderCircle,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useResponsive } from "@/hooks/useResponsive";
import {
  addComprasAvisoComentario,
  createComprasAviso,
  deleteComprasAviso,
  notifyComprasEmail,
  notifyWaUpdate,
  updateComprasAviso,
} from "../purchaseRequestsApi";
import { AVISO_ACTIVOS, AVISO_ESTADOS, PRIORIDADES, STOCK_DESTINOS, avisoEstadoDe, fmtFecha, fmtFechaHora, prioridadDe } from "../modulo";
import { Avatar, Aviso, Buscar, Cabecera, Chip, Estado, Modal, Prioridad, Tag, Vacio } from "../ui";
import SelectorDestino from "../SelectorDestino";

const FORM_VACIO = { titulo: "", detalle: "", material: "", destino: "", prioridad: "media" };

// Avisos a Compras: mensajes del pañol y de la oficina que no son un pedido
// ("falta extintor", "devolución de una pieza"). Compras los sigue acá y, si
// hace falta comprar, los convierte en pedido.
export default function Avisos({
  profile,
  avisos = [],
  projects = [],
  selectedId,
  error,
  canManage = false,
  canCreate = false,
  propios = false,
  onSelect,
  onRefresh,
  onConvertir,
}) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("activos");
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState("");
  const [crear, setCrear] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [detalleMovil, setDetalleMovil] = useState(() => Boolean(selectedId));

  const activos = avisos.filter((a) => AVISO_ACTIVOS.includes(a.estado)).length;
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return avisos.filter((a) => {
      if (estado === "activos" && !AVISO_ACTIVOS.includes(a.estado)) return false;
      if (estado === "cerrados" && AVISO_ACTIVOS.includes(a.estado)) return false;
      if (!t) return true;
      return [a.titulo, a.detalle, a.material, a.destino, a.project?.codigo, a.creator?.username, a.source_ref]
        .filter(Boolean).join(" ").toLowerCase().includes(t);
    });
  }, [avisos, estado, q]);

  const elegido = avisos.find((a) => a.id === selectedId) || (isMobile ? null : filtrados[0]) || null;
  const verLista = !isMobile || !detalleMovil || !elegido;
  const verDetalle = !isMobile || (detalleMovil && elegido);

  function abrir(id) {
    onSelect?.(id);
    setComentario("");
    if (isMobile) setDetalleMovil(true);
  }

  async function crearAviso(e) {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.warning("Poné un título para el aviso.");
      return;
    }
    setGuardando("crear");
    try {
      const txt = form.destino.trim();
      const obra = txt ? projects.find((p) => String(p.codigo || "").toLowerCase() === txt.toLowerCase()) : null;
      const aviso = await createComprasAviso({ ...form, project_id: obra?.id || null, destino: obra ? null : txt });
      notifyComprasEmail({
        type: "nuevo_aviso",
        avisoId: aviso.id,
        requestTitle: aviso.titulo,
        message: aviso.detalle || aviso.material || "",
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: "web",
      });
      toast.success("Aviso enviado a Compras.");
      setForm(FORM_VACIO);
      setCrear(false);
      await onRefresh?.();
      abrir(aviso.id);
    } catch (err) {
      toast.error(err.message || "No se pudo crear el aviso.");
    } finally {
      setGuardando("");
    }
  }

  async function cambiarEstado(nuevo) {
    if (!elegido || !canManage || elegido.estado === nuevo) return;
    const viejo = elegido.estado;
    setGuardando("estado");
    try {
      await updateComprasAviso(elegido.id, { estado: nuevo });
      notifyWaUpdate({
        avisoId: elegido.id,
        eventType: "aviso_status",
        actorId: profile?.id,
        payload: { oldStatus: viejo, newStatus: nuevo, actorName: profile?.username || "Compras" },
      });
      toast.success(`Aviso: ${avisoEstadoDe(nuevo).label}.`);
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar el aviso.");
    } finally {
      setGuardando("");
    }
  }

  async function comentar(e) {
    e.preventDefault();
    const body = comentario.trim();
    if (!elegido || !body) return;
    setGuardando("comentario");
    try {
      await addComprasAvisoComentario(elegido.id, body);
      notifyWaUpdate({
        avisoId: elegido.id,
        eventType: "aviso_comment",
        actorId: profile?.id,
        payload: { body, actorName: profile?.username || "Usuario" },
      });
      setComentario("");
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar el comentario.");
    } finally {
      setGuardando("");
    }
  }

  async function borrar() {
    if (!elegido || !canManage) return;
    const ok = await confirm({
      title: "Borrar aviso",
      message: `Se borra «${elegido.titulo}» con todo su seguimiento. No queda archivado.`,
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteComprasAviso(elegido.id);
      toast.success("Aviso borrado.");
      onSelect?.(null);
      setDetalleMovil(false);
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message || "No se pudo borrar el aviso.");
    }
  }

  return (
    <>
      <Cabecera
        eyebrow={propios ? "Pedidos a Compras" : "Compras · Avisos"}
        titulo={propios ? "Mis" : "Avisos a"}
        acento={propios ? "avisos" : "Compras"}
        sub={(
          <>
            <b className="mono">{activos}</b> {activos === 1 ? "abierto" : "abiertos"}
            {" · "}Mensajes que no son un pedido: faltantes, devoluciones, novedades.
          </>
        )}
        acciones={canCreate ? (
          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setCrear(true)}><Plus size={14} /> Nuevo aviso</button>
        ) : null}
      />

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {verLista && (
        <div className="cmp-filtros">
          <Buscar value={q} onChange={setQ} placeholder="Buscar aviso, obra, material…" />
          <div className="cmp-filtros desliza" style={{ gap: 2 }}>
            <Chip on={estado === "activos"} cuenta={activos} onClick={() => setEstado("activos")}>Abiertos</Chip>
            <Chip on={estado === "cerrados"} cuenta={avisos.length - activos} onClick={() => setEstado("cerrados")}>Resueltos y descartados</Chip>
            <Chip on={estado === "todos"} cuenta={avisos.length} onClick={() => setEstado("todos")}>Todos</Chip>
          </div>
        </div>
      )}

      <div className="cmp-split">
        {verLista && (
          <div className="cmp-split-lista">
            {!filtrados.length ? (
              <Vacio icono={Bell} titulo={q.trim() ? "Ningún aviso coincide" : estado === "activos" ? "No hay avisos abiertos" : "No hay avisos"} />
            ) : filtrados.map((a) => {
              const e = avisoEstadoDe(a.estado);
              const devolucion = a.origen === "panol_devolucion";
              return (
                <button key={a.id} type="button" className={`cmp-aviso-it${elegido?.id === a.id && !isMobile ? " on" : ""}`} onClick={() => abrir(a.id)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span className="tit" style={{ flex: 1 }}>{a.titulo}</span>
                    <Prioridad value={a.prioridad} />
                    {isMobile && <ChevronRight size={15} color="var(--subtle)" />}
                  </span>
                  <span className="sub">{[a.material, a.project?.codigo || a.destino].filter(Boolean).join(" · ") || "Sin material ni destino"}</span>
                  <span className="pie">
                    <Estado tono={e.tono}>{e.label}</Estado>
                    {devolucion && <Tag tono="cian">Devolución</Tag>}
                    <span>{fmtFecha(a.created_at)}</span>
                    {a.creator?.username && <span style={{ marginLeft: "auto" }}>{a.creator.username}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {verDetalle && (
          elegido ? (
            <div className="cmp-detalle">
              <div className="cmp-detalle-cab">
                {isMobile && (
                  <button type="button" className="ui-btn ui-btn-fantasma chico" style={{ justifySelf: "start" }} onClick={() => setDetalleMovil(false)}>
                    <ArrowLeft size={14} /> Avisos
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 className="cmp-detalle-tit">{elegido.titulo}</h2>
                    <div className="cmp-sub" style={{ marginTop: 4 }}>
                      {[elegido.project?.codigo || elegido.destino || "Sin destino", elegido.creator?.username || elegido.source_ref, fmtFechaHora(elegido.created_at)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Estado tono={avisoEstadoDe(elegido.estado).tono}>{avisoEstadoDe(elegido.estado).label}</Estado>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag tono={prioridadDe(elegido.prioridad).tono}>Prioridad {prioridadDe(elegido.prioridad).label}</Tag>
                  <Tag tono="teal">{elegido.origen === "panol_devolucion" ? "Devolución del pañol" : elegido.origen || "web"}</Tag>
                  {elegido.material && <Tag tono="cian">{elegido.material}</Tag>}
                </div>
                {elegido.detalle && <div className="cmp-nota">{elegido.detalle}</div>}
                {/* Una devolución se decide en el panel del pañol (reparar,
                    reclamar, descartar): sin este atajo hay que buscarlo a mano. */}
                {elegido.origen === "panol_devolucion" && (
                  <a className="ui-btn ui-btn-suave chico" style={{ justifySelf: "start", textDecoration: "none" }} href="/stock-panol?tab=devoluciones">
                    <RotateCcw size={14} /> Abrir el panel de devoluciones <ChevronRight size={14} />
                  </a>
                )}
                {canManage && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div className="cmp-seg" role="radiogroup" aria-label="Estado del aviso">
                      {AVISO_ESTADOS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={elegido.estado === s.value}
                          className={elegido.estado === s.value ? "on" : ""}
                          data-tono={elegido.estado === s.value ? s.tono : undefined}
                          disabled={guardando === "estado"}
                          onClick={() => cambiarEstado(s.value)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <span className="cmp-sp" />
                    {onConvertir && (
                      <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => onConvertir(elegido)}>
                        <ShoppingCart size={14} /> Convertir en pedido
                      </button>
                    )}
                    <button type="button" className="cmp-btn-ic chico peligro" onClick={borrar} title="Borrar aviso" aria-label="Borrar aviso"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>

              <div className="cmp-detalle-cuerpo">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={15} color="var(--blue)" />
                  <b style={{ fontSize: 13.5, fontWeight: 650 }}>Seguimiento</b>
                  <span className="cmp-grupo-n">{elegido.comentarios?.length || 0}</span>
                </div>
                {(elegido.comentarios || []).length === 0 ? (
                  <p className="cmp-ayuda">Todavía no hay comentarios. Lo que escribas acá le llega a quien mandó el aviso.</p>
                ) : elegido.comentarios.map((c) => (
                  <div key={c.id} className="cmp-coment">
                    <div className="quien">
                      <Avatar nombre={c.author?.username || "?"} tono={c.author_id === profile?.id ? "azul" : "neutro"} />
                      <b>{c.author?.username || "Usuario"}</b>
                      <span>{fmtFechaHora(c.created_at)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                ))}
                <form onSubmit={comentar} style={{ display: "grid", gap: 8 }}>
                  <textarea className="ui-input" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escribí una novedad o una pregunta…" aria-label="Comentario" />
                  <button type="submit" className="ui-btn ui-btn-primario chico" style={{ justifySelf: "end" }} disabled={guardando === "comentario" || !comentario.trim()}>
                    {guardando === "comentario" ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />} Comentar
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="cmp-detalle"><Vacio icono={Bell} titulo="Elegí un aviso" texto="Acá vas a ver el detalle y el seguimiento." /></div>
          )
        )}
      </div>

      {crear && (
        <Modal
          icono={Bell}
          tono="violeta"
          titulo="Nuevo aviso a Compras"
          sub="Para avisar algo que no es un pedido: un faltante, una devolución, una novedad."
          onCerrar={() => setCrear(false)}
          bloqueado={guardando === "crear"}
          pie={(
            <>
              <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setCrear(false)} disabled={guardando === "crear"}>Cancelar</button>
              <button type="submit" form="cmp-nuevo-aviso" className="ui-btn ui-btn-primario" disabled={guardando === "crear"}>
                {guardando === "crear" ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />} Enviar aviso
              </button>
            </>
          )}
        >
          <form id="cmp-nuevo-aviso" className="cmp-form" onSubmit={crearAviso}>
            <label className="cmp-campo c6" htmlFor="av-titulo">
              <span>Título <span className="req">*</span></span>
              <input id="av-titulo" className="ui-input" autoFocus value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ej.: Falta extintor reglamentario en el galpón" />
            </label>
            <label className="cmp-campo" htmlFor="av-material">
              <span>Material o tema</span>
              <input id="av-material" className="ui-input" value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))} placeholder="Extintor, chalecos, baterías…" />
            </label>
            <div className="cmp-campo">
              <span>Obra o destino</span>
              <SelectorDestino
                obras={projects}
                value={form.destino}
                onChange={(valor) => setForm((f) => ({ ...f, destino: valor }))}
                otros={STOCK_DESTINOS.map((d) => ({ valor: d, label: d }))}
                placeholder="Opcional"
              />
            </div>
            <div className="cmp-campo c6">
              <span>Prioridad</span>
              <div className="cmp-seg" role="radiogroup" aria-label="Prioridad">
                {PRIORIDADES.map((p) => (
                  <button key={p.value} type="button" role="radio" aria-checked={form.prioridad === p.value}
                    className={form.prioridad === p.value ? "on" : ""} data-tono={form.prioridad === p.value && p.value !== "media" ? p.tono : undefined}
                    onClick={() => setForm((f) => ({ ...f, prioridad: p.value }))}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="cmp-campo c6" htmlFor="av-detalle">
              <span>Detalle</span>
              <textarea id="av-detalle" className="ui-input" rows={3} value={form.detalle} onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))} placeholder="Contexto o aclaración para Compras" />
            </label>
          </form>
        </Modal>
      )}
    </>
  );
}
