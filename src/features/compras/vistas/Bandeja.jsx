import { useMemo, useState } from "react";
import { Bell, CheckCircle2, ChevronRight, LayoutList, RotateCcw } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import {
  GRUPOS_BANDEJA,
  avisoEstadoDe,
  destinoDe,
  estadoDe,
  motivoDe,
  textoPlano,
  useVistaPedidos,
} from "../modulo";
import { Aviso, Buscar, Cabecera, Chip, Estado, Grupo, PedidosEnVista, Prioridad, SelectorVista, Tag, Vacio } from "../ui";

// Lo que repite algo que la fila ya muestra (prioridad, estado) no se escribe.
const MOTIVOS_QUE_SOBRAN = new Set(["Urgente", "Alta prioridad", "Comprado, falta recibir"]);

function motivoVisible(request, sinLeer) {
  const m = motivoDe(request, sinLeer);
  const repetido = MOTIVOS_QUE_SOBRAN.has(m.label) || m.label === estadoDe(request.status).label;
  return { ...m, mostrar: !repetido };
}

function FilaAviso({ aviso, onAbrir, i }) {
  const e = avisoEstadoDe(aviso.estado);
  const devolucion = aviso.origen === "panol_devolucion";
  const Icon = devolucion ? RotateCcw : Bell;
  return (
    <button type="button" className="cmp-fila aviso" style={{ "--i": Math.min(i, 14), "--marca": "var(--violet)" }} onClick={onAbrir}>
      <span className="cmp-fila-ic" data-tono="violeta"><Icon size={15} /></span>
      <span className="cmp-fila-main">
        <span className="cmp-fila-l1">
          <span className="cmp-fila-tit">{aviso.titulo || aviso.material || "Aviso a compras"}</span>
          {devolucion && <Tag tono="cian">Devolución</Tag>}
          <Prioridad value={aviso.prioridad} />
        </span>
        <span className="cmp-fila-meta">
          <span className="obra">{aviso.project?.codigo || aviso.destino || "Sin destino"}</span>
          {aviso.creator?.username && <span>{aviso.creator.username}</span>}
          {aviso.material && aviso.material !== aviso.titulo && <span>{aviso.material}</span>}
        </span>
      </span>
      <span><Estado tono={e.tono}>{e.label}</Estado></span>
      <span className="cmp-fila-fecha"><span className="d">{new Date(aviso.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</span></span>
      <ChevronRight size={16} className="cmp-fila-chev" />
    </button>
  );
}

export default function Bandeja({ bandeja, sinLeer, loading, error, onAbrir, onAbrirAviso, onIrLista }) {
  const [q, setQ] = useState("");
  const [foco, setFoco] = useState("todo");
  const [agrupar, setAgrupar] = useState("urgencia");
  const [vista, setVista] = useVistaPedidos("bandeja", "lista");

  const coincide = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const en = (texto) => terms.every((t) => texto.includes(t));
    return {
      pedido: (r) => !terms.length || en(`${r.title || ""} ${textoPlano(r.description)} ${r.creator?.username || ""} ${r.assignee?.username || ""} ${destinoDe(r)} ${r.proveedor || ""}`.toLowerCase()),
      aviso: (a) => !terms.length || en(`${a.titulo || ""} ${a.detalle || ""} ${a.material || ""} ${a.creator?.username || ""} ${a.project?.codigo || ""} ${a.destino || ""}`.toLowerCase()),
    };
  }, [q]);

  // Los grupos ya filtrados por el buscador: las cuentas de los chips describen
  // lo que se está viendo.
  const grupos = useMemo(() => GRUPOS_BANDEJA
    .map((g) => ({ ...g, items: (bandeja.grupos[g.key] || []).filter(coincide.pedido) }))
    .filter((g) => g.items.length > 0), [bandeja, coincide]);
  const avisos = useMemo(() => bandeja.avisosActivos.filter(coincide.aviso), [bandeja, coincide]);
  const total = grupos.reduce((s, g) => s + g.items.length, 0);
  const criticos = bandeja.grupos.critico.length;

  const enFoco = useMemo(() => (foco === "avisos" ? [] : grupos.filter((g) => foco === "todo" || g.key === foco)), [foco, grupos]);

  // Agrupado por obra: nadie compra pedido por pedido, se cierra un barco o se
  // llama una vez al proveedor. El foco de los chips se sigue aplicando.
  const visibles = useMemo(() => {
    if (agrupar === "urgencia") return enFoco;
    const criticosSet = new Set(bandeja.grupos.critico);
    const porObra = new Map();
    for (const g of enFoco) {
      for (const r of g.items) {
        const clave = destinoDe(r) || "Sin obra";
        if (!porObra.has(clave)) porObra.set(clave, []);
        porObra.get(clave).push(r);
      }
    }
    return [...porObra.entries()]
      .map(([clave, items]) => {
        const urg = items.filter((r) => criticosSet.has(r)).length;
        return {
          key: `obra:${clave}`,
          label: clave,
          texto: urg ? `${urg} ${urg === 1 ? "urgente o vencido" : "urgentes o vencidos"}` : null,
          tono: urg ? "rojo" : "neutro",
          items,
        };
      })
      .sort((a, b) => {
        if ((a.label === "Sin obra") !== (b.label === "Sin obra")) return a.label === "Sin obra" ? 1 : -1;
        if ((a.tono === "rojo") !== (b.tono === "rojo")) return a.tono === "rojo" ? -1 : 1;
        return b.items.length - a.items.length || a.label.localeCompare(b.label, "es", { numeric: true });
      });
  }, [agrupar, enFoco, bandeja]);

  const mostrarAvisos = (foco === "todo" || foco === "avisos") && avisos.length > 0;
  const hayAlgo = visibles.length > 0 || mostrarAvisos;

  return (
    <>
      <Cabecera
        eyebrow="Compras · Bandeja"
        titulo="Bandeja de"
        acento="pendientes"
        sub={(
          <>
            <b className="mono">{bandeja.abiertos.length}</b> {bandeja.abiertos.length === 1 ? "pedido abierto" : "pedidos abiertos"}
            {criticos > 0 && <> · <b className="mono t" data-tono="rojo">{criticos}</b> {criticos === 1 ? "urgente o vencido" : "urgentes o vencidos"}</>}
            {bandeja.avisosActivos.length > 0 && <> · <b className="mono">{bandeja.avisosActivos.length}</b> {bandeja.avisosActivos.length === 1 ? "aviso" : "avisos"} del pañol</>}
          </>
        )}
        acciones={(
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => onIrLista({ status: "activos", priority: "todos" })}>
            <LayoutList size={14} /> Todos los pedidos
          </button>
        )}
      />

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {/* Los chips SON el reparto: cada pedido abierto está en uno solo y las
          cuentas suman el total del encabezado. */}
      <div className="cmp-filtros">
        <Buscar value={q} onChange={setQ} placeholder="Buscar pedido, obra, proveedor, persona…" />
        <div className="cmp-filtros desliza" style={{ gap: 2, flex: "1 1 auto" }}>
          <Chip on={foco === "todo"} cuenta={total} onClick={() => setFoco("todo")}>Todo</Chip>
          {GRUPOS_BANDEJA.map((g) => {
            const n = grupos.find((x) => x.key === g.key)?.items.length || 0;
            if (!n) return null;
            return <Chip key={g.key} on={foco === g.key} tono={g.tono} cuenta={n} onClick={() => setFoco(foco === g.key ? "todo" : g.key)}>{g.label}</Chip>;
          })}
          {avisos.length > 0 && (
            <>
              <span className="cmp-chip-sep" />
              <Chip on={foco === "avisos"} tono="violeta" cuenta={avisos.length} onClick={() => setFoco(foco === "avisos" ? "todo" : "avisos")}>Avisos</Chip>
            </>
          )}
        </div>
        {foco !== "avisos" && (
          <div className="cmp-seg" role="radiogroup" aria-label="Agrupar por">
            {[["urgencia", "Por urgencia"], ["obra", "Por obra"]].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={agrupar === v} className={agrupar === v ? "on" : ""} onClick={() => setAgrupar(v)}>{l}</button>
            ))}
          </div>
        )}
        {foco !== "avisos" && <SelectorVista vista={vista} onCambiar={setVista} />}
      </div>

      {loading ? (
        <Cargando texto="Trayendo los pedidos…" />
      ) : !hayAlgo ? (
        <Vacio
          icono={CheckCircle2}
          titulo={q.trim() ? `Nada coincide con «${q.trim()}»` : "No queda nada pendiente"}
          texto={q.trim() ? "Probá con menos palabras, el código de la obra o el proveedor." : "Los pedidos nuevos y los avisos del pañol van a aparecer acá."}
        />
      ) : (
        <div className="cmp-grupos">
          {visibles.map((g) => (
            <Grupo key={g.key} titulo={g.label} texto={g.texto} cuenta={g.items.length} tono={g.tono}>
              <PedidosEnVista vista={vista} pedidos={g.items} sinLeer={sinLeer} motivoDe={(r) => motivoVisible(r, sinLeer.has(r.id))} onAbrir={onAbrir} />
            </Grupo>
          ))}
          {mostrarAvisos && (
            <Grupo titulo="Avisos abiertos" texto="Mensajes del pañol: no son pedidos, se responden en Avisos" cuenta={avisos.length} tono="violeta">
              <div className="cmp-lista">
                {avisos.map((a, i) => <FilaAviso key={a.id} i={i} aviso={a} onAbrir={() => onAbrirAviso(a.id)} />)}
              </div>
            </Grupo>
          )}
        </div>
      )}
    </>
  );
}
