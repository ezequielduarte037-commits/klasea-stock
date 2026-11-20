import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { SEDES_PANOL } from "@/features/panol/panolApi";
import { fetchPedidos } from "./pedidosApi";
import {
  ESTADO_PEDIDO, FILTROS, buscarPedidos, cuentasDeFiltros, filtrarPedidos, ordenarPedidos, resumenDelPedido,
} from "./pedidosLogica";

const PAGINA = 80;
const FILTRO_KEY = "klasea.panol.pedidos.filtro";

function fecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Color de la marca y de la etiqueta de estado. */
function tonoDe(envio, r) {
  if (envio.estado === "cancelado" || envio.estado === "cerrado") return "apagado";
  if (r.novedades) return "novedad";
  if (envio.estado === "recibido" || r.completo) return "ok";
  if (r.recibidos || r.parciales) return "parcial";
  return "camino";
}

function Avance({ r }) {
  const pct = (n) => (r.total ? `${(n / r.total) * 100}%` : "0%");
  return (
    <span className="pdd-avance">
      <span className="pdd-barra-avance" aria-hidden="true">
        <i className="is-ok" style={{ width: pct(r.recibidos) }} />
        <i className="is-parcial" style={{ width: pct(r.parciales) }} />
        <i className="is-novedad" style={{ width: pct(r.novedades) }} />
      </span>
      <span className="pdd-avance-texto">
        {r.total ? <><b>{r.recibidos}</b> de {r.total} recibidos</> : "Sin renglones"}
        {r.novedades ? <em> · {r.novedades} {r.novedades === 1 ? "novedad" : "novedades"}</em> : null}
      </span>
    </span>
  );
}

function FilaPedido({ envio, onAbrir }) {
  const r = resumenDelPedido(envio.items || []);
  const tono = tonoDe(envio, r);
  const origen = envio.origen === "compra" ? "Compras" : envio.origen === "remito" ? "Remito" : "Pañol";
  const donde = envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : envio.destino || "Stock";
  const prioridad = envio.prioridad === "urgente" || envio.prioridad === "alta" ? envio.prioridad : null;
  return (
    <button type="button" className="pdd-fila" onClick={() => onAbrir(envio.id)}>
      <span className={`pdd-marca is-${tono}`} aria-hidden="true" />
      <span style={{ minWidth: 0 }}>
        <span className="pdd-nombre">{envio.titulo || "Pedido"}</span>
        <span className="pdd-sub">{[donde, envio.sede, origen].filter(Boolean).join(" · ")}</span>
      </span>
      <Avance r={r} />
      <span className="pdd-etiqueta-col">
        {prioridad
          ? <span className={`pdd-etiqueta is-${prioridad}`}>{prioridad === "urgente" ? "Urgente" : "Alta"}</span>
          : <span className={`pdd-etiqueta is-${tono === "apagado" ? "x" : tono}`}>{ESTADO_PEDIDO[envio.estado] || envio.estado}</span>}
      </span>
      <span className="pdd-fecha">{fecha(envio.created_at)}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

/**
 * La bandeja: qué pedidos esperan, cuáles tienen novedades, lo recibido y
 * todo. La sede la fija el perfil del pañolero; los demás eligen.
 */
export default function BandejaPedidos({ sedeFija = null, onAbrir, version = 0 }) {
  const toast = useToast();
  const [envios, setEnvios] = useState(null);
  const [sede, setSede] = useState(sedeFija || "todas");
  const [filtro, setFiltroState] = useState(() => {
    try { const v = window.localStorage.getItem(FILTRO_KEY); return FILTROS.some((f) => f.valor === v) ? v : "por_recibir"; } catch { return "por_recibir"; }
  });
  const [busqueda, setBusqueda] = useState("");
  const [mostrar, setMostrar] = useState(PAGINA);

  useEffect(() => {
    let vivo = true;
    fetchPedidos({ sede: sedeFija || (sede !== "todas" ? sede : null) })
      .then((l) => { if (vivo) setEnvios(l); })
      .catch((e) => {
        if (!vivo) return;
        toast.error(e?.message || "No se pudieron traer los pedidos.");
        setEnvios((x) => x ?? []);
      });
    return () => { vivo = false; };
  }, [sedeFija, sede, toast, version]);

  function setFiltro(v) {
    setFiltroState(v);
    setMostrar(PAGINA);
    try { window.localStorage.setItem(FILTRO_KEY, v); } catch { /* sin almacenamiento */ }
  }

  const lista = useMemo(() => envios ?? [], [envios]);
  const cuentas = useMemo(() => cuentasDeFiltros(lista), [lista]);
  const visibles = useMemo(
    () => ordenarPedidos(buscarPedidos(filtrarPedidos(lista, filtro), busqueda), filtro),
    [lista, filtro, busqueda],
  );

  return (
    <div className="pdd-scroll">
      <div className="pdd-barra">
        <div className="pdd-filtros" role="tablist" aria-label="Pedidos">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              role="tab"
              aria-selected={filtro === f.valor}
              className={`pdd-filtro${filtro === f.valor ? " is-activo" : ""}${f.valor === "novedades" && cuentas.novedades ? " is-alerta" : ""}`}
              onClick={() => setFiltro(f.valor)}
            >
              {f.etiqueta}
              <small>{envios ? cuentas[f.valor] : ""}</small>
            </button>
          ))}
        </div>
        <div className="pdd-barra-der">
          {!sedeFija ? (
            <div className="pdd-sede" role="group" aria-label="Sede">
              {["todas", ...SEDES_PANOL].map((s) => (
                <button key={s} type="button" className={`ui-chip${sede === s ? " is-activa" : ""}`} aria-pressed={sede === s} onClick={() => { setSede(s); setEnvios(null); }}>
                  {s === "todas" ? "Las dos" : s}
                </button>
              ))}
            </div>
          ) : null}
          <div className="pdd-buscar">
            <Search size={15} aria-hidden="true" />
            <input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setMostrar(PAGINA); }} aria-label="Buscar pedidos" placeholder="Buscar" />
            {busqueda ? <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={14} /></button> : null}
          </div>
        </div>
      </div>

      <div className="pdd-lista">
        {envios == null ? (
          <Cargando texto="Trayendo los pedidos…" />
        ) : !visibles.length ? (
          <div className="pdd-vacio">
            <strong>{busqueda ? "No hay pedidos que coincidan" : filtro === "por_recibir" ? "No hay nada por recibir" : filtro === "novedades" ? "Sin novedades" : "No hay pedidos"}</strong>
            {filtro === "por_recibir" && !busqueda ? "Cuando Compras o Técnica manden un pedido al pañol, aparece acá." : null}
          </div>
        ) : (
          <>
            {visibles.slice(0, mostrar).map((e) => <FilaPedido key={e.id} envio={e} onAbrir={onAbrir} />)}
            {visibles.length > mostrar ? (
              <div className="pdd-mas">
                <button type="button" className="ui-btn" onClick={() => setMostrar((n) => n + PAGINA)}>Ver más ({visibles.length - mostrar})</button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
