import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, LoaderCircle, PackagePlus, Search, X } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { buscarCatalogoParaEstandarizacion, crearPanolCatalogMaterial, invalidatePanolCatalogFullCache, vincularMovimientosAMaterial } from "@/features/panol/panolApi";
import { productosACrear } from "@/features/panol/productosACrear";

const fmt = (n) => Number(Math.round(Number(n || 0) * 100) / 100).toLocaleString("es-AR");
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "");
const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Bandeja "Productos a crear". Pañol no da de alta productos de los barcos:
 * lo que llega sin ficha entra igual al stock y queda acá. Técnica (o Compras)
 * lo vincula a un producto que ya existe o lo crea; lo que se crea queda sin
 * revisar y sigue en Estandarización (rubro, proveedores, línea).
 */
export default function ProductosACrearPanel({ rows = [], isMobile = false, toast, onSaved, onIrAEstandarizacion }) {
  const confirmar = useConfirm();
  const [abierto, setAbierto] = useState(null);
  const [filtro, setFiltro] = useState("");
  const grupos = useMemo(() => productosACrear(rows), [rows]);
  const visibles = useMemo(() => {
    const q = norm(filtro);
    if (!q) return grupos;
    return grupos.filter((g) => norm([g.descripcion, g.codigo, g.proveedor, ...g.obras, g.quien].join(" ")).includes(q));
  }, [filtro, grupos]);

  return (
    <div className={`pac${isMobile ? " is-movil" : ""}`}>
      <style>{CSS}</style>
      <div className="pac-cab">
        <div className="pac-cab-texto">
          <div className="pac-titulo">Productos a crear <span className="pac-num">{grupos.length}</span></div>
          <div className="pac-sub">Entraron al pañol sin ficha en el catálogo. Vinculalos a uno que ya existe o crealos; lo nuevo se completa después en Estandarización.</div>
        </div>
        {grupos.length > 4 ? (
          <label className="pac-buscar">
            <Search size={14} aria-hidden="true" />
            <input className="ui-input" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar" aria-label="Filtrar productos a crear" />
          </label>
        ) : null}
      </div>

      <div className="pac-lista">
        {!grupos.length ? (
          <div className="pac-vacio">
            <CheckCircle2 size={22} aria-hidden="true" />
            <strong>No hay nada esperando ficha</strong>
            <span>Cuando pañol ingrese algo de un barco que no está en el catálogo, aparece acá.</span>
          </div>
        ) : !visibles.length ? (
          <div className="pac-vacio"><span>Nada coincide con «{filtro.trim()}».</span></div>
        ) : visibles.map((g) => (
          <Grupo
            key={g.key}
            grupo={g}
            abierto={abierto === g.key}
            onAbrir={() => setAbierto(abierto === g.key ? null : g.key)}
            toast={toast}
            confirmar={confirmar}
            onListo={async (texto) => {
              setAbierto(null);
              toast?.success?.(texto);
              await onSaved?.();
            }}
            onIrAEstandarizacion={onIrAEstandarizacion}
          />
        ))}
      </div>
    </div>
  );
}

function Grupo({ grupo: g, abierto, onAbrir, toast, confirmar, onListo, onIrAEstandarizacion }) {
  return (
    <section className={`pac-grupo${abierto ? " is-abierto" : ""}`}>
      <button type="button" className="pac-grupo-fila" onClick={onAbrir} aria-expanded={abierto}>
        <span className="pac-grupo-texto">
          <span className="pac-grupo-nombre">{g.descripcion}</span>
          <span className="pac-grupo-sub">
            {[g.codigo, g.unidad, g.proveedor].filter(Boolean).join(" · ")}
            {g.quien || g.ultimo ? <> · ingresó {g.quien || "pañol"}{g.ultimo ? ` el ${fecha(g.ultimo)}` : ""}</> : null}
          </span>
        </span>
        <span className="pac-chips">
          {g.enStock > 0.0001 ? <span className="pac-chip is-verde">hay <b>{fmt(g.enStock)}</b></span> : <span className="pac-chip">sin saldo</span>}
          {g.obras.slice(0, 3).map((o) => <span key={o} className="pac-chip is-mono">{o}</span>)}
          {g.obras.length > 3 ? <span className="pac-chip">+{g.obras.length - 3}</span> : null}
          {g.sedes.map((s) => <span key={s} className="pac-chip">{s}</span>)}
          <span className="ui-btn pac-resolver">{abierto ? "Cerrar" : "Resolver"}</span>
        </span>
      </button>
      {abierto ? <Resolver grupo={g} toast={toast} confirmar={confirmar} onListo={onListo} onIrAEstandarizacion={onIrAEstandarizacion} /> : null}
    </section>
  );
}

function Resolver({ grupo: g, toast, confirmar, onListo, onIrAEstandarizacion }) {
  const [busqueda, setBusqueda] = useState(g.codigo || g.descripcion);
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState({ descripcion: g.descripcion, codigo: g.codigo, unidad: g.unidad || "unidad" });
  const movimientos = g.ids.length === 1 ? "1 movimiento" : `${g.ids.length} movimientos`;

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) return undefined;
    let vigente = true;
    const timer = window.setTimeout(() => {
      setBuscando(true);
      buscarCatalogoParaEstandarizacion(q, { limit: 12 })
        // Un requisito de la matriz es una necesidad genérica, no un producto:
        // el stock se vincula siempre a un producto concreto.
        .then((lista) => { if (vigente) setResultados(lista.filter((m) => m.es_requisito !== true && m.activo !== false).slice(0, 8)); })
        .catch(() => { if (vigente) setResultados([]); })
        .finally(() => { if (vigente) setBuscando(false); });
    }, 250);
    return () => { vigente = false; window.clearTimeout(timer); };
  }, [busqueda]);

  async function vincular(material) {
    const ok = await confirmar({
      title: `¿Vincular a «${material.descripcion}»?`,
      message: `Los ${movimientos} de «${g.descripcion}» pasan a ese producto. El stock no cambia; cambia a qué ficha pertenece.`,
      confirmLabel: "Vincular",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await vincularMovimientosAMaterial(g.ids, material.id);
      await onListo(`Vinculado a «${material.descripcion}».`);
    } catch (err) {
      toast?.error?.(err?.message || "No se pudo vincular.");
      setOcupado(false);
    }
  }

  async function crear(e) {
    e.preventDefault();
    if (nuevo.descripcion.trim().length < 4) { toast?.warning?.("Escribí un nombre con marca, medida o modelo."); return; }
    setOcupado(true);
    try {
      const creado = await crearPanolCatalogMaterial({
        descripcion: nuevo.descripcion.trim(),
        codigo: nuevo.codigo,
        unidad: nuevo.unidad || "unidad",
        proveedor: g.proveedor,
      });
      invalidatePanolCatalogFullCache();
      await vincularMovimientosAMaterial(g.ids, creado.id);
      await onListo(`Creado «${creado.descripcion}» y vinculado. Completá rubro y línea en Estandarización.`);
    } catch (err) {
      toast?.error?.(err?.message || "No se pudo crear el producto.");
      setOcupado(false);
    }
  }

  return (
    <div className="pac-resolver-cuerpo">
      <fieldset disabled={ocupado} className="pac-fieldset">
        <div className="pac-bloque">
          <div className="pac-bloque-titulo">¿Ya existe en el catálogo?</div>
          <label className="pac-buscar is-ancho">
            <Search size={14} aria-hidden="true" />
            <input className="ui-input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, código o proveedor" aria-label="Buscar en el catálogo" />
            {busqueda ? <button type="button" className="pac-limpiar" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda"><X size={13} /></button> : null}
          </label>
          {buscando && !resultados ? <div className="pac-nota"><LoaderCircle size={13} className="pac-gira" /> Buscando…</div> : null}
          {resultados && !resultados.length ? <div className="pac-nota">Nada parecido en el catálogo.</div> : null}
          {resultados?.length ? (
            <div className="pac-resultados">
              {resultados.map((m) => (
                <div key={m.id} className="pac-resultado">
                  <div className="pac-resultado-texto">
                    <span className="pac-resultado-nombre">{m.descripcion}</span>
                    <span className="pac-resultado-sub">
                      {[m.codigo, m.proveedor, m.unidad].filter(Boolean).join(" · ")}
                      {m.es_consumible ? <span className="pac-chip is-cian">consumible</span> : null}
                      {m.matrices?.length ? <span className="pac-chip">matriz {m.matrices.map((x) => `K${x.modelo}`).slice(0, 3).join(", ")}</span> : null}
                    </span>
                  </div>
                  <button type="button" className="ui-btn" onClick={() => vincular(m)}><Link2 size={14} aria-hidden="true" /> Vincular</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <form className="pac-bloque" onSubmit={crear}>
          <div className="pac-bloque-titulo">Es nuevo: crear el producto</div>
          <div className="pac-form">
            <label className="pac-campo is-nombre">
              <span>Nombre</span>
              <input className="ui-input" value={nuevo.descripcion} onChange={(e) => setNuevo((n) => ({ ...n, descripcion: e.target.value }))} maxLength={200} />
            </label>
            <label className="pac-campo">
              <span>Código</span>
              <input className="ui-input" value={nuevo.codigo} onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value }))} maxLength={60} />
            </label>
            <label className="pac-campo">
              <span>Unidad</span>
              <input className="ui-input" value={nuevo.unidad} onChange={(e) => setNuevo((n) => ({ ...n, unidad: e.target.value }))} maxLength={20} />
            </label>
          </div>
          <div className="pac-pie">
            <span className="pac-nota">Queda sin revisar: rubro, proveedores y línea se completan en{" "}
              {onIrAEstandarizacion ? <button type="button" className="pac-link" onClick={onIrAEstandarizacion}>Estandarización</button> : "Estandarización"}.
            </span>
            <button type="submit" className="ui-btn ui-btn-primario">
              {ocupado ? <LoaderCircle size={15} className="pac-gira" /> : <PackagePlus size={15} aria-hidden="true" />} Crear y vincular {movimientos}
            </button>
          </div>
        </form>
      </fieldset>
    </div>
  );
}

const CSS = `
.pac { flex: 1; min-height: 0; overflow: auto; padding: 14px 18px 24px; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
.pac.is-movil { padding: 12px 12px 20px; }
.pac .pac-cab { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.pac .pac-cab-texto { flex: 1; min-width: 240px; }
.pac .pac-titulo { font-size: 16px; font-weight: 650; display: flex; align-items: center; gap: 8px; }
.pac .pac-num { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: var(--violet); background: var(--violet-soft); border: 1px solid var(--violet-border); border-radius: 999px; padding: 1px 8px; }
.pac .pac-sub { margin-top: 3px; font-size: 12.5px; color: var(--muted); line-height: 1.45; max-width: 760px; }
.pac .pac-buscar { position: relative; display: flex; align-items: center; min-width: 220px; }
.pac .pac-buscar.is-ancho { min-width: 0; }
.pac .pac-buscar > svg { position: absolute; left: 11px; color: var(--dim); pointer-events: none; }
.pac .pac-buscar .ui-input { width: 100%; padding-left: 32px; padding-right: 34px; min-height: 38px; }
.pac .pac-limpiar { position: absolute; right: 6px; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--dim); display: grid; place-items: center; }
.pac .pac-lista { display: grid; gap: 8px; }
.pac .pac-vacio { display: grid; justify-items: center; gap: 6px; padding: 36px 16px; text-align: center; color: var(--dim); font-size: 13px; border: 1px dashed var(--border-2); border-radius: 14px; }
.pac .pac-vacio svg { color: var(--green); }
.pac .pac-vacio strong { color: var(--text); font-weight: 600; font-size: 14px; }
.pac .pac-grupo { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; }
.pac .pac-grupo.is-abierto { border-color: var(--blue-border); }
.pac .pac-grupo-fila { width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 14px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; }
.pac .pac-grupo-fila:hover { background: var(--panel); }
.pac .pac-grupo-texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
.pac .pac-grupo-nombre { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pac .pac-grupo-sub { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pac .pac-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0; max-width: 55%; }
.pac .pac-chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--muted); font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.pac .pac-chip b { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
.pac .pac-chip.is-verde { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.pac .pac-chip.is-cian { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.pac .pac-chip.is-mono { font-family: 'JetBrains Mono', monospace; }
.pac .pac-resolver { min-height: 32px; pointer-events: none; }
.pac .pac-resolver-cuerpo { border-top: 1px solid var(--border); padding: 12px 14px 14px; background: var(--panel); }
.pac .pac-fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.pac.is-movil .pac-fieldset { grid-template-columns: minmax(0, 1fr); }
.pac .pac-bloque { display: grid; gap: 8px; align-content: start; min-width: 0; }
.pac .pac-bloque-titulo { font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.pac .pac-nota { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); line-height: 1.4; }
.pac .pac-resultados { display: grid; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel-solid); }
.pac .pac-resultado { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.pac .pac-resultado:last-child { border-bottom: 0; }
.pac .pac-resultado-texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
.pac .pac-resultado-nombre { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pac .pac-resultado-sub { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--dim); }
.pac .pac-form { display: grid; grid-template-columns: minmax(0, 1fr) 130px 100px; gap: 8px; }
.pac.is-movil .pac-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pac.is-movil .pac-campo.is-nombre { grid-column: 1 / -1; }
.pac .pac-campo { display: grid; gap: 4px; min-width: 0; }
.pac .pac-campo span { font-size: 11px; font-weight: 600; color: var(--dim); }
.pac .pac-campo .ui-input { min-height: 38px; }
.pac .pac-pie { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: space-between; }
.pac .pac-pie .ui-btn-primario { min-height: 40px; }
.pac .pac-link { border: 0; background: transparent; padding: 0; color: var(--blue); font: inherit; font-weight: 600; text-decoration: underline; }
.pac .pac-gira { animation: pac-giro .8s linear infinite; }
@keyframes pac-giro { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  .pac .pac-grupo-fila { flex-wrap: wrap; }
  .pac .pac-chips { max-width: none; justify-content: flex-start; }
}
`;
