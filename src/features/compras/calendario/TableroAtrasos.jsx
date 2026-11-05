import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight, ClipboardX, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import {
  DIAS_AVISO_SIN_RECIBIR, DIAS_FALTANTE_SIN_MOVER, DIAS_HITO_MAXIMO, cargarAvisosSinRecibir,
  cargarFaltantesSinMover, cargarHitosVencidos, cargarPedidosVencidos, diasDesde,
} from "@/features/atrasos/atrasosApi";

/**
 * Atrasos de Compras, dentro del calendario: lo estándar que ya había que
 * comprar (por proveedor y por obra) y lo demás de Compras que pasó su fecha:
 * pedidos vencidos, avisos de ingreso que el pañol no recibió, faltantes que
 * nadie movió e hitos de Fechas sin marcar. Cada área cuenta como su pantalla
 * de origen; tocar algo lleva a resolverlo.
 */

const A_LA_VISTA = 6;
const ESTADOS_PEDIDO = {
  nuevo: "Nuevo", en_revision: "En revisión", cotizando: "Cotizando", aprobado: "Aprobado",
  comprado: "Comprado", parcial: "Parcial",
};

function dm(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const tonoDias = (dias) => (dias > 14 ? "rojo" : "violeta");

/** Pedidos atrasados sumados por proveedor o por obra, el más viejo primero. */
function agrupar(atrasados, clave, otro, otros) {
  const map = new Map();
  for (const x of atrasados) {
    const g = map.get(x[clave]) || { clave: x[clave], nombre: x[clave], items: 0, dias: 0, distintos: new Set() };
    g.items += x.items;
    g.dias = Math.max(g.dias, x.dias);
    g.distintos.add(clave === "proveedor" ? x.obra : x.proveedor);
    map.set(x[clave], g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, detalle: `${g.distintos.size} ${g.distintos.size === 1 ? otro : otros}` }))
    .sort((a, b) => b.dias - a.dias || b.items - a.items);
}

// Ir y volver entre pestañas del calendario no vuelve a consultar: lo leído
// sirve por dos minutos.
const RECIENTE_MS = 120_000;
const recientes = new Map();

function useArea(cargar) {
  const [estado, setEstado] = useState(() => {
    const r = recientes.get(cargar);
    return r && Date.now() - r.at < RECIENTE_MS ? { filas: r.filas, error: "" } : { filas: null, error: "" };
  });
  useEffect(() => {
    const r = recientes.get(cargar);
    if (r && Date.now() - r.at < RECIENTE_MS) return undefined;
    let vivo = true;
    cargar()
      .then((filas) => { recientes.set(cargar, { filas, at: Date.now() }); if (vivo) setEstado({ filas, error: "" }); })
      .catch((e) => { if (vivo) setEstado({ filas: [], error: e?.message || "No se pudo cargar." }); });
    return () => { vivo = false; };
  }, [cargar]);
  return estado;
}

/** Con una línea elegida, sólo lo que menciona una obra de esa línea (52-27, "Obra 52-27"). */
function deLinea(linea, ...textos) {
  if (linea === "todas") return true;
  const re = new RegExp(`(^|[^0-9])${linea}-\\d`);
  return textos.some((t) => re.test(String(t || "")));
}

function Bloque({ id, icono: Icono, tono, titulo, texto, accion, onAccion, children }) {
  return (
    <section id={id} className="cmp-bloque atr-bloque">
      <div className="cmp-bloque-cab">
        <span className="cmp-bloque-ic" data-tono={tono}>{Icono && <Icono size={16} />}</span>
        <div style={{ minWidth: 0 }}>
          <h2 className="cmp-bloque-tit">{titulo}</h2>
          {texto && <p className="cmp-bloque-txt">{texto}</p>}
        </div>
        {onAccion && <div className="der"><button type="button" className="cmp-link" onClick={onAccion}>{accion}</button></div>}
      </div>
      <div className="cmp-bloque-cuerpo sin-pad">{children}</div>
    </section>
  );
}

function Lista({ filas, error, cargandoTexto, vacio, render }) {
  const [todas, setTodas] = useState(false);
  if (error) return <div className="atr-msg" data-tono="rojo">{error}</div>;
  if (filas == null) return <Cargando compacto texto={cargandoTexto} />;
  if (!filas.length) return <div className="atr-msg"><PackageCheck size={15} /> {vacio}</div>;
  const visibles = todas ? filas : filas.slice(0, A_LA_VISTA);
  return (
    <>
      {visibles.map(render)}
      {filas.length > A_LA_VISTA && (
        <button type="button" className="cal-mas" onClick={() => setTodas((v) => !v)}>
          {todas ? "Ver menos" : `Ver los otros ${filas.length - A_LA_VISTA}`}
        </button>
      )}
    </>
  );
}

function Fila({ titulo, detalle, dias, onClick }) {
  return (
    <button type="button" className="atr-fila" onClick={onClick}>
      <span style={{ minWidth: 0 }}>
        <span className="atr-fila-tit">{titulo}</span>
        <span className="atr-fila-det">{detalle}</span>
      </span>
      <span className="atr-dias" data-tono={tonoDias(dias)}><b className="mono">{dias}</b><small>días</small></span>
      <ChevronRight size={15} className="atr-flecha" />
    </button>
  );
}

/** Barras: cuánto atrasado tiene cada proveedor u obra. */
function Barras({ grupos, onElegir, vacio }) {
  const [todas, setTodas] = useState(false);
  if (!grupos.length) return <div className="atr-msg"><PackageCheck size={15} /> {vacio}</div>;
  const max = Math.max(...grupos.map((g) => g.items));
  const visibles = todas ? grupos : grupos.slice(0, 8);
  return (
    <>
      {visibles.map((g) => (
        <button key={g.clave} type="button" className="atr-barra" onClick={() => onElegir(g)}>
          <span className="atr-barra-nom">{g.nombre}</span>
          <span className="atr-barra-pista" aria-hidden="true">
            <span className="atr-barra-relleno" data-tono={tonoDias(g.dias)} style={{ width: `${Math.max(4, (g.items / max) * 100)}%` }} />
          </span>
          <span className="atr-barra-meta">
            <b className="mono">{g.items}</b> ítems · {g.detalle} · hasta <b className="mono">{g.dias}</b> días
          </span>
        </button>
      ))}
      {grupos.length > 8 && (
        <button type="button" className="cal-mas" onClick={() => setTodas((v) => !v)}>
          {todas ? "Ver menos" : `Ver los otros ${grupos.length - 8}`}
        </button>
      )}
    </>
  );
}

export default function TableroAtrasos({ calendario, linea, onVerProveedor, onVerObra }) {
  const navigate = useNavigate();
  const pedidos = useArea(cargarPedidosVencidos);
  const avisos = useArea(cargarAvisosSinRecibir);
  const faltantes = useArea(cargarFaltantesSinMover);
  const hitos = useArea(cargarHitosVencidos);

  // Lo estándar ya atrasado sale del mismo cálculo que la pestaña Pedidos.
  const estandar = useMemo(() => {
    const hoy = new Date(new Date().setHours(0, 0, 0, 0));
    return (calendario?.proveedores || []).flatMap((p) => p.pedidos.filter((ped) => ped.atrasado).map((ped) => ({
      proveedor: p.proveedor, obra: ped.obra, items: ped.items.length, dias: diasDesde(ped.comprarAntes, hoy),
    })));
  }, [calendario]);
  const porProveedor = useMemo(() => agrupar(estandar, "proveedor", "obra", "obras"), [estandar]);
  const porObra = useMemo(() => agrupar(estandar, "obra", "proveedor", "proveedores"), [estandar]);

  const filtrar = (filas, campos) => (filas == null ? null : filas.filter((f) => deLinea(linea, ...campos(f))));
  const pedidosL = filtrar(pedidos.filas, (f) => [f.destino, f.titulo]);
  const avisosL = filtrar(avisos.filas, (f) => [f.obra, f.titulo]);
  const faltantesL = filtrar(faltantes.filas, (f) => [f.obra]);
  const hitosL = filtrar(hitos.filas, (f) => [f.obra]);
  const itemsEstandar = estandar.reduce((n, x) => n + x.items, 0);

  const ir = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const kpi = (id, label, valor, tono, detalle) => (
    <button type="button" className="atr-kpi" data-tono={valor ? tono : "verde"} onClick={() => ir(id)}>
      <b className="mono">{valor == null ? "—" : valor}</b>
      <span>{label}</span>
      {detalle && <small>{detalle}</small>}
    </button>
  );

  return (
    <div className="atr-root">
      <div className="atr-kpis">
        {kpi("atr-estandar", "Pedidos estándar atrasados", estandar.length, "rojo", itemsEstandar ? `${itemsEstandar} ítems sin comprar` : "")}
        {kpi("atr-pedidos", "Pedidos a Compras vencidos", pedidosL?.length, "rojo")}
        {kpi("atr-avisos", "Avisos sin recibir", avisosL?.length, "violeta", `hace más de ${DIAS_AVISO_SIN_RECIBIR} días`)}
        {kpi("atr-faltantes", "Faltantes del pañol", faltantesL?.length, "violeta", `sin mover hace ${DIAS_FALTANTE_SIN_MOVER}+ días`)}
        {kpi("atr-hitos", "Hitos de fechas", hitosL?.length, "violeta", "sin marcar")}
      </div>

      <div className="atr-grilla" id="atr-estandar">
        <Bloque icono={Truck} tono="rojo" titulo="Atrasado por proveedor" texto="Ya pasó la semana de compra y la lista del barco no lo tiene comprado" accion="Ver pedidos" onAccion={() => onVerProveedor("")}>
          <Barras grupos={porProveedor} vacio="Ningún proveedor tiene compras estándar atrasadas." onElegir={(g) => onVerProveedor(g.nombre === "Sin proveedor" ? "" : g.nombre)} />
        </Bloque>
        <Bloque icono={Truck} tono="rojo" titulo="Atrasado por obra" texto="Qué barco se está quedando sin lo que lleva de serie">
          <Barras grupos={porObra} vacio="Ninguna obra tiene compras estándar atrasadas." onElegir={(g) => onVerObra(g.nombre)} />
        </Bloque>
      </div>

      <div className="atr-grilla">
        <Bloque id="atr-pedidos" icono={ShoppingCart} tono="azul" titulo="Pedidos a Compras vencidos" texto="Abiertos y con la fecha de entrega (o de necesidad) ya pasada" accion="Abrir pedidos" onAccion={() => navigate("/compras?tab=lista")}>
          <Lista {...pedidos} filas={pedidosL} cargandoTexto="Buscando pedidos vencidos…" vacio="Ningún pedido abierto pasó su fecha." render={(f) => (
            <Fila key={f.id} titulo={f.titulo} dias={f.dias}
              detalle={[f.destino, ESTADOS_PEDIDO[f.estado] || f.estado, f.pidio && `pidió ${f.pidio}`, `${f.porEntrega ? "llegaba" : "se necesitaba"} el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
              onClick={() => navigate(`/compras?tab=lista&open=${f.id}`)} />
          )} />
        </Bloque>
        <Bloque id="atr-avisos" icono={PackageCheck} tono="violeta" titulo="Avisos de ingreso sin recibir" texto="Comprado y avisado al pañol, pero todavía no entró" accion="Abrir recepción" onAccion={() => navigate("/recepcion-panol")}>
          <Lista {...avisos} filas={avisosL} cargandoTexto="Buscando avisos pendientes…" vacio="El pañol recibió todo lo avisado." render={(f) => (
            <Fila key={f.id} titulo={f.titulo} dias={f.dias}
              detalle={[f.obra, f.sede, f.parcial ? "recibido en parte" : "sin recibir", `avisado el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
              onClick={() => navigate(`/recepcion-panol?envio=${f.id}`)} />
          )} />
        </Bloque>
        <Bloque id="atr-faltantes" icono={ClipboardX} tono="violeta" titulo="Faltantes que reportó el pañol" texto="Nuevos: nadie los pasó a revisión ni los pidió" accion="Abrir faltantes" onAccion={() => navigate("/compras?tab=faltantes")}>
          <Lista {...faltantes} filas={faltantesL} cargandoTexto="Buscando faltantes…" vacio="Compras ya tomó todo lo que reportó el pañol." render={(f) => (
            <Fila key={f.id} titulo={f.titulo} dias={f.dias}
              detalle={[f.cantidad ? `faltan ${f.cantidad} ${f.unidad}`.trim() : "", f.obra, f.sede, `reportado el ${dm(f.desde)}`].filter(Boolean).join(" · ")}
              onClick={() => navigate("/compras?tab=faltantes")} />
          )} />
        </Bloque>
        <Bloque id="atr-hitos" icono={CalendarClock} tono="violeta" titulo="Hitos de fechas sin marcar" texto={`Madera, vidrios, motor, tanques… vencidos en los últimos ${DIAS_HITO_MAXIMO} días y sin marcar pedidos ni hechos`} accion="Abrir obras" onAccion={() => navigate("/obras")}>
          <Lista {...hitos} filas={hitosL} cargandoTexto="Calculando los hitos de cada obra…" vacio="Los hitos vencidos están todos marcados." render={(f) => (
            <Fila key={f.clave} titulo={`${f.hito} · ${f.obra}`} dias={f.dias} detalle={`era el ${dm(f.desde)}`} onClick={() => navigate("/obras")} />
          )} />
        </Bloque>
      </div>
    </div>
  );
}

export const CSS_ATRASOS = `
.cal-root .atr-root { display: grid; gap: 12px; }
.cal-root .atr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.cal-root .atr-kpi {
  position: relative; display: grid; gap: 3px; align-content: start; text-align: left;
  padding: 13px 14px 12px 17px; border: 1px solid var(--border); border-radius: 13px;
  background: var(--panel-solid); color: var(--text); font: inherit; cursor: pointer;
  transition: border-color .15s, transform .18s cubic-bezier(.22,1,.36,1);
}
.cal-root .atr-kpi::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--k, var(--muted)); }
.cal-root .atr-kpi[data-tono="rojo"] { --k: var(--red); }
.cal-root .atr-kpi[data-tono="violeta"] { --k: var(--violet); }
.cal-root .atr-kpi[data-tono="verde"] { --k: var(--green); }
.cal-root .atr-kpi:hover { border-color: var(--border-2); transform: translateY(-1px); }
.cal-root .atr-kpi b { font-size: 26px; font-weight: 600; line-height: 1.05; color: var(--k); }
.cal-root .atr-kpi span { font-size: 12.5px; font-weight: 500; color: var(--muted); }
.cal-root .atr-kpi small { font-size: 11px; color: var(--dim); }
.cal-root .atr-grilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.cal-root .atr-bloque { min-width: 0; scroll-margin-top: 12px; }
.cal-root .atr-msg { display: flex; align-items: center; gap: 8px; padding: 16px; font-size: 13px; color: var(--green); }
.cal-root .atr-msg[data-tono="rojo"] { color: var(--red); }
.cal-root .atr-fila {
  width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto 15px; gap: 10px; align-items: center;
  padding: 9px 12px 9px 14px; border: 0; border-top: 1px solid var(--border);
  background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer;
}
.cal-root .atr-fila:first-child { border-top: 0; }
.cal-root .atr-fila:hover { background: var(--panel); }
.cal-root .atr-fila-tit { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-root .atr-fila-det { display: block; font-size: 11.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.cal-root .atr-dias { display: grid; justify-items: end; line-height: 1; }
.cal-root .atr-dias b { font-size: 16px; font-weight: 600; }
.cal-root .atr-dias small { font-size: 10.5px; color: var(--dim); margin-top: 2px; }
.cal-root .atr-dias[data-tono="rojo"] b { color: var(--red); }
.cal-root .atr-dias[data-tono="violeta"] b { color: var(--violet); }
.cal-root .atr-flecha { color: var(--subtle); }
.cal-root .atr-barra {
  width: 100%; display: grid; grid-template-columns: minmax(110px, 170px) minmax(0, 1fr); grid-template-rows: auto auto; gap: 4px 12px; align-items: center;
  padding: 9px 14px; border: 0; border-top: 1px solid var(--border);
  background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer;
}
.cal-root .atr-barra:first-child { border-top: 0; }
.cal-root .atr-barra:hover { background: var(--panel); }
.cal-root .atr-barra-nom { grid-row: 1 / span 2; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-root .atr-barra-pista { height: 8px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
.cal-root .atr-barra-relleno { display: block; height: 100%; border-radius: 999px; background: var(--violet); }
.cal-root .atr-barra-relleno[data-tono="rojo"] { background: var(--red); }
.cal-root .atr-barra-meta { font-size: 11.5px; color: var(--dim); }
.cal-root .atr-barra-meta b { color: var(--text); font-weight: 600; }
@media (max-width: 900px) {
  .cal-root .atr-grilla { grid-template-columns: minmax(0, 1fr); }
  .cal-root .atr-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .cal-root .atr-kpi b { font-size: 22px; }
  .cal-root .atr-kpi:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .cal-root .atr-barra { grid-template-columns: minmax(0, 1fr); }
  .cal-root .atr-barra-nom { grid-row: auto; }
}
`;
