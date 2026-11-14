import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, PackageX, RefreshCw, Search } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { faltantesDesdeDatos, SEMANAS_FALTANTES } from "@/features/compras/calendario/calendario";
import { fmtQty, norm } from "@/features/panol/stockGrupos";
import { cargarDatosFaltantes } from "./faltantesApi";

/**
 * Falta para obras: lo que piden las listas estándar de las obras activas en
 * las próximas semanas contra lo libre del pañol. Es la alerta de lo que se
 * compra para cada barco (matafuegos, anclas, equipos), que no lleva mínimo
 * fijo; el mínimo queda para la ferretería chica ("Reponer").
 */

const HORIZONTES = [4, 8, 12];

function fecha(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function coincide(p, q) {
  if (!q) return true;
  return norm([p.descripcion, p.codigo, p.rubro, p.proveedor, ...(p.necesitan || p.obras || []).map((o) => o.obra)].join(" ")).includes(q);
}

function FilaFaltante({ p }) {
  const barcos = p.necesitan.length;
  return (
    <div className="falt-fila">
      <div className="falt-fila-cab">
        <div style={{ minWidth: 0 }}>
          <div className="falt-nombre">{p.descripcion}</div>
          <div className="falt-meta">
            {p.codigo && <span className="falt-mono">{p.codigo}</span>}
            <span>{p.rubro}</span>
            {p.proveedor && <span>{p.proveedor}</span>}
          </div>
        </div>
        <div className="falt-cuenta">
          <span className="falt-faltan falt-mono">faltan {fmtQty(p.faltan)}</span>
          <span className="falt-dim">
            {fmtQty(p.libre)} libre · {barcos} {barcos === 1 ? "barco" : "barcos"} lo {barcos === 1 ? "necesita" : "necesitan"}
          </span>
        </div>
      </div>
      <div className="falt-obras">
        {p.necesitan.map((o) => (
          <span key={`${o.obraId}-${String(o.necesita)}`} className={`falt-obra${o.faltan > 0 ? " is-falta" : ""}`} title={o.faltan > 0 ? `${o.obra}: necesita ${fmtQty(o.cantidad)} para el ${fecha(o.necesita)}; ${o.deStock ? `${fmtQty(o.deStock)} sale del stock, ` : ""}faltan ${fmtQty(o.faltan)}` : `${o.obra}: lo cubre el stock libre`}>
            <b>{o.obra}</b> {fmtQty(o.cantidad)} · {fecha(o.necesita)}
          </span>
        ))}
        {p.comprarAntes && (
          <span className={`falt-pedir${p.atrasado ? " is-atrasado" : ""}`}>
            {p.atrasado ? `Había que pedirlo el ${fecha(p.comprarAntes)}` : `Pedir antes del ${fecha(p.comprarAntes)}`}
          </span>
        )}
      </div>
    </div>
  );
}

function FilaConfirmar({ p }) {
  return (
    <div className="falt-fila">
      <div className="falt-fila-cab">
        <div style={{ minWidth: 0 }}>
          <div className="falt-nombre">{p.descripcion}</div>
          <div className="falt-meta">
            {p.codigo && <span className="falt-mono">{p.codigo}</span>}
            <span>{p.rubro}</span>
          </div>
        </div>
        <div className="falt-cuenta">
          <span className="falt-mono">{p.obras.length} {p.obras.length === 1 ? "obra" : "obras"}</span>
          <span className="falt-dim">{fmtQty(p.libre)} libre</span>
        </div>
      </div>
      <div className="falt-obras">
        {p.obras.map((o) => (
          <span key={`${o.obraId}-${String(o.necesita)}`} className="falt-obra is-atrasada" title={`${o.obra}: se necesitaba ${fmtQty(o.cantidad)} para el ${fecha(o.necesita)}`}>
            <b>{o.obra}</b> {fmtQty(o.cantidad)} · hace {o.semanasAtraso} sem.
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FaltaParaObrasPanel({ isMobile = false }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [semanas, setSemanas] = useState(SEMANAS_FALTANTES);
  const [busqueda, setBusqueda] = useState("");
  const [verConfirmar, setVerConfirmar] = useState(false);
  const [obra, setObra] = useState("todas");
  const [conStock, setConStock] = useState(false);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    try {
      setDatos(await cargarDatosFaltantes({ forzar }));
      setError("");
    } catch (e) {
      setError(e?.message || "No se pudo calcular lo que falta.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const resultado = useMemo(() => (datos ? faltantesDesdeDatos(datos, { hoy: new Date(), semanasHorizonte: semanas }) : null), [datos, semanas]);
  const q = norm(busqueda);
  // Cuántos productos le faltan a cada obra: casi siempre se concentra en el
  // barco que viene (la 37-46 se llevaba 380 de 624 el 04/11/2026).
  const porObra = useMemo(() => {
    const map = new Map();
    for (const p of resultado?.faltan || []) {
      for (const o of p.necesitan) {
        if (!(o.faltan > 0)) continue;
        const x = map.get(o.obraId) || { obraId: o.obraId, obra: o.obra, productos: 0 };
        x.productos += 1;
        map.set(o.obraId, x);
      }
    }
    return [...map.values()].sort((a, b) => b.productos - a.productos);
  }, [resultado]);
  const conAlgoEnStock = useMemo(() => (resultado?.faltan || []).filter((p) => p.libre > 0).length, [resultado]);
  const faltan = useMemo(() => (resultado?.faltan || []).filter((p) => (
    coincide(p, q)
    && (!conStock || p.libre > 0)
    && (obra === "todas" || p.necesitan.some((o) => o.obraId === obra && o.faltan > 0))
  )), [resultado, q, conStock, obra]);
  const aConfirmar = useMemo(() => (resultado?.aConfirmar || []).filter((p) => coincide(p, q)), [resultado, q]);
  const atrasados = faltan.filter((p) => p.atrasado).length;

  return (
    <div className={`falt-root${isMobile ? " is-movil" : ""}`}>
      <style>{FALTANTES_CSS}</style>
      <div className="falt-head">
        <div style={{ minWidth: 0 }}>
          <div className="falt-eyebrow">Pañol</div>
          <div className="falt-titulo">Falta para obras</div>
          <div className="falt-dim">
            Lo que piden las listas estándar de las obras activas en las próximas {semanas} semanas, contra lo libre del pañol.
            Lo que se compra para cada barco no lleva mínimo: avisa acá cuando los barcos que lo necesitan son más que lo que hay.
          </div>
        </div>
        <div className="falt-acciones">
          <div className="ui-tabs" role="tablist" aria-label="Semanas a la vista">
            {HORIZONTES.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={semanas === s} className={`ui-tab${semanas === s ? " is-activa" : ""}`} onClick={() => setSemanas(s)}>
                {s} sem.
              </button>
            ))}
          </div>
          <button type="button" className="ui-btn ui-btn-icono" onClick={() => cargar(true)} title="Volver a calcular" aria-label="Volver a calcular" disabled={cargando}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {cargando && !datos ? (
        <Cargando texto="Revisando las listas de las obras…" />
      ) : error ? (
        <div className="falt-vacio">
          <PackageX size={22} />
          <div>{error}</div>
          <button type="button" className="ui-btn" onClick={() => cargar(true)}>Reintentar</button>
        </div>
      ) : (
        <>
          <div className="falt-resumen">
            <div><span className="falt-num falt-mono" style={{ color: faltan.length ? "var(--red)" : "var(--green)" }}>{faltan.length}</span> productos van a faltar</div>
            {atrasados > 0 && <div><span className="falt-num falt-mono" style={{ color: "var(--red)" }}>{atrasados}</span> ya se tendrían que haber pedido</div>}
            <div><span className="falt-num falt-mono">{resultado?.cubiertos || 0}</span> los cubre el stock libre</div>
          </div>

          <div className="falt-filtros">
            <label className="falt-buscar">
              <Search size={14} />
              <input className="ui-input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, rubro u obra…" />
            </label>
            <div className="falt-chips" role="group" aria-label="Filtrar por obra">
              <button type="button" className={`ui-chip falt-chip${obra === "todas" && !conStock ? " is-activa" : ""}`} aria-pressed={obra === "todas" && !conStock} onClick={() => { setObra("todas"); setConStock(false); }}>
                Todas
              </button>
              <button type="button" className={`ui-chip falt-chip${conStock ? " is-activa" : ""}`} aria-pressed={conStock} onClick={() => setConStock((v) => !v)} title="Lo que hay en el pañol pero no alcanza para todos los barcos">
                Hay algo en stock <span className="falt-mono">{conAlgoEnStock}</span>
              </button>
              {porObra.map((o) => (
                <button key={o.obraId} type="button" className={`ui-chip falt-chip${obra === o.obraId ? " is-activa" : ""}`} aria-pressed={obra === o.obraId} onClick={() => setObra(obra === o.obraId ? "todas" : o.obraId)}>
                  {o.obra} <span className="falt-mono">{o.productos}</span>
                </button>
              ))}
            </div>
          </div>

          <section className="falt-seccion">
            {faltan.length ? faltan.map((p) => <FilaFaltante key={p.clave} p={p} />) : (
              <div className="falt-vacio">
                <div>{busqueda || conStock || obra !== "todas" ? "Nada coincide con los filtros." : `En las próximas ${semanas} semanas no falta nada para las obras.`}</div>
              </div>
            )}
          </section>

          {aConfirmar.length > 0 && (
            <section className="falt-seccion">
              <button type="button" className="falt-plegable" aria-expanded={verConfirmar} onClick={() => setVerConfirmar((v) => !v)}>
                <ChevronDown size={15} style={{ transform: verConfirmar ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                <span className="falt-seccion-titulo">A confirmar · {aConfirmar.length}</span>
                <span className="falt-dim">Ya tendría que estar en el barco y el sistema no lo vio. Antes de comprar, mirar si se puso sin pasar por el pañol.</span>
              </button>
              {verConfirmar && aConfirmar.map((p) => <FilaConfirmar key={p.clave} p={p} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

const FALTANTES_CSS = `
.falt-root { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: 12px; padding: 12px 16px 28px; color: var(--text); }
.falt-root .falt-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
.falt-root .falt-head > div:first-child { flex: 1 1 420px; }
.falt-root .falt-acciones { display: flex; align-items: center; gap: 8px; }
.falt-root .falt-eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.falt-root .falt-titulo { font-size: 20px; font-weight: 650; margin: 2px 0 4px; }
.falt-root .falt-dim { color: var(--dim); font-size: 12px; line-height: 1.45; }
.falt-root .falt-mono { font-family: "JetBrains Mono", monospace; font-variant-numeric: tabular-nums; }
.falt-root .falt-resumen { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 12.5px; color: var(--muted); }
.falt-root .falt-num { font-size: 18px; font-weight: 700; margin-right: 4px; color: var(--text); }
.falt-root .falt-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.falt-root .falt-buscar { display: flex; align-items: center; gap: 8px; color: var(--dim); flex: 0 1 360px; min-width: 220px; }
.falt-root .falt-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.falt-root .falt-chip { cursor: pointer; font-family: inherit; min-height: 28px; }
.falt-root .falt-chip .falt-mono { color: var(--dim); font-weight: 500; }
.falt-root .falt-chip.is-activa { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.falt-root .falt-chip.is-activa .falt-mono { color: var(--blue); }
.falt-root .falt-buscar .ui-input { flex: 1; min-width: 0; }
.falt-root .falt-seccion { display: grid; gap: 6px; }
.falt-root .falt-seccion-titulo { font-size: 13px; font-weight: 650; color: var(--text); white-space: nowrap; }
.falt-root .falt-plegable { display: flex; align-items: center; gap: 8px; text-align: left; padding: 8px 2px; border: 0; background: none; color: var(--muted); font-family: inherit; cursor: pointer; }
.falt-root .falt-fila { display: grid; gap: 7px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.falt-root .falt-fila-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.falt-root .falt-nombre { font-size: 13.5px; font-weight: 600; line-height: 1.3; }
.falt-root .falt-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: var(--dim); margin-top: 2px; }
.falt-root .falt-cuenta { display: grid; justify-items: end; gap: 2px; flex-shrink: 0; text-align: right; }
.falt-root .falt-faltan { color: var(--red); font-weight: 650; font-size: 13.5px; }
.falt-root .falt-obras { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.falt-root .falt-obra { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); white-space: nowrap; }
.falt-root .falt-obra b { font-weight: 650; }
.falt-root .falt-obra.is-atrasada { border-color: var(--violet-border); background: var(--violet-soft); color: var(--violet); }
.falt-root .falt-obra.is-falta { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }
.falt-root .falt-pedir { font-size: 11px; color: var(--cyan); margin-left: 4px; }
.falt-root .falt-pedir.is-atrasado { color: var(--red); font-weight: 600; }
.falt-root .falt-vacio { display: grid; justify-items: center; gap: 8px; padding: 28px 12px; color: var(--dim); font-size: 13px; text-align: center; border: 1px dashed var(--border); border-radius: 10px; }
.falt-root.is-movil { padding: 10px 12px 24px; }
.falt-root.is-movil .falt-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; width: 100%; }
.falt-root.is-movil .falt-chips::-webkit-scrollbar { display: none; }
.falt-root.is-movil .falt-buscar { flex: 1 1 100%; }
.falt-root.is-movil .falt-fila-cab { flex-direction: column; }
.falt-root.is-movil .falt-cuenta { justify-items: start; text-align: left; }
`;
