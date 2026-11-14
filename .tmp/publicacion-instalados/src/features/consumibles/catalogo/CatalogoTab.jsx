import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { EmptyState } from "@/components/ui/motion";
import { FORMAS_ENTREGA, fetchCatalogo, fmtCantidad, fmtPesos, normalizarCodigo } from "@/features/consumibles/api";
import { useVerPrecios } from "../verPrecios";
import { esGestorDeListas, esOperador, fetchListaVigente, fetchRetirosHistoricos } from "./catalogoApi";
import { esPendienteRebollar } from "./conciliacion";
import { motivoRevisarUnidad } from "./reglas";
import PanelEdicion from "./PanelEdicion";
import { FotoItem } from "../mostrador/Piezas";
import ConciliarRebollar from "./ConciliarRebollar";

/**
 * Catálogo de consumibles: lo que se configura una vez y después se toca
 * poco (cómo se entrega, mínimos, ubicación, proveedor). Dos vistas:
 *   - Catálogo: buscar, filtrar lo que falta y editar la ficha.
 *   - Conciliar con Rebollar: resolver los viejos que quedaron fuera de lista.
 *
 * Editan la config los operadores del pañol (admin, pañol, compras, técnica,
 * oficina); los renglones de la lista solo admin, Compras y Técnica, como
 * dice la base.
 */

const VISTAS = [
  { key: "lista", label: "Catálogo" },
  { key: "conciliar", label: "Conciliar con Rebollar" },
];

const FALTANTES = [
  { key: "sinCodigo", label: "Sin código de proveedor", test: (i) => !i.config?.proveedor_codigo },
  { key: "sinUbicacion", label: "Sin ubicación", test: (i) => !i.ubicacion },
  { key: "sinPeso", label: "Sin peso", test: (i) => !i.pesoUnitarioG },
  // Blíster, rollo que se corta o caja por N con la unidad "una": cada retiro valdría el envase entero.
  { key: "revisarUnidad", label: "Revisar unidad", test: (i) => Boolean(motivoRevisarUnidad(i)) },
];

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CatalogoTab({ profile, sede }) {
  const verPrecios = useVerPrecios();
  const [vista, setVista] = useState("lista");
  const [catalogo, setCatalogo] = useState([]);
  const [lista, setLista] = useState(null);
  const [errorLista, setErrorLista] = useState(null);
  const [historial, setHistorial] = useState({ retiros: null, error: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState("");
  const [rubro, setRubro] = useState("");
  const [faltan, setFaltan] = useState([]);
  const [selId, setSelId] = useState(null);

  const puedeEditar = esOperador(profile);
  const esGestor = esGestorDeListas(profile);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Los inactivos solo se usan en conciliación; la lista y el historial
      // pueden fallar sin impedir la edición del catálogo activo.
      const [cat, lis] = await Promise.all([
        fetchCatalogo({ sede, incluirInactivos: true }),
        fetchListaVigente().then((lista) => ({ lista, error: null }))
          .catch((e) => ({ lista: null, error: e?.message || "Error al cargar" })),
      ]);
      const hist = await fetchRetirosHistoricos(cat.filter(esPendienteRebollar).map((i) => i.id))
        .then((retiros) => ({ retiros, error: null }))
        .catch((e) => ({ retiros: null, error: e?.message || "Error al cargar" }));
      setCatalogo(cat);
      setLista(lis.lista);
      setErrorLista(lis.error);
      setHistorial(hist);
    } catch (e) {
      setError(e?.message || "No se pudo traer el catálogo.");
    } finally {
      setCargando(false);
    }
  }, [sede]);

  useEffect(() => { cargar(); }, [cargar]);

  const activos = useMemo(() => catalogo.filter((i) => i.activo !== false), [catalogo]);

  // Costo por unidad de compra del renglón vinculado: hace falta para
  // recalcular el costo por unidad de entrega cuando cambia el factor.
  const costoCompraDe = useMemo(() => new Map((lista?.items ?? []).map((r) => [r.id, r.costo_ars])), [lista]);

  const rubros = useMemo(() => {
    const s = new Set(activos.map((i) => i.rubro || "Sin rubro"));
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [activos]);

  const filtrados = useMemo(() => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
    const tests = FALTANTES.filter((f) => faltan.includes(f.key)).map((f) => f.test);
    return activos
      .filter((i) => !rubro || (i.rubro || "Sin rubro") === rubro)
      .filter((i) => tests.every((t) => t(i)))
      .filter((i) => {
        if (!palabras.length) return true;
        const t = sinTildes(`${i.descripcion} ${i.alias ?? ""} ${i.codigoEtiqueta ?? ""} ${i.config?.proveedor_codigo ?? ""} ${i.ubicacion ?? ""}`);
        return palabras.every((p) => t.includes(p));
      })
      .sort((a, b) => (a.codigoEtiqueta ?? "~").localeCompare(b.codigoEtiqueta ?? "~") || a.descripcion.localeCompare(b.descripcion, "es", { numeric: true }));
  }, [activos, texto, rubro, faltan]);

  const conteoFaltan = useMemo(
    () => Object.fromEntries(FALTANTES.map((f) => [f.key, activos.filter(f.test).length])),
    [activos],
  );

  const seleccionado = useMemo(() => {
    const i = activos.find((x) => x.id === selId);
    if (!i) return null;
    return { ...i, costoCompraArs: costoCompraDe.get(i.config?.costo_lista_item_id) ?? null };
  }, [activos, selId, costoCompraDe]);

  // Después de guardar se actualizan solo los campos confirmados por la base.
  const aplicarCambio = (id, { config, stockMinimo, ubicacion, alias, info, imagenUrl, peso, codigosBarra }) => {
    setCatalogo((cat) => cat.map((i) => (i.id !== id ? i : {
      ...i,
      config: config ?? i.config,
      codigoEtiqueta: config?.codigo_etiqueta ?? i.codigoEtiqueta,
      formaEntrega: config?.forma_entrega ?? i.formaEntrega,
      unidad: config?.unidad_entrega ?? i.unidad,
      costoUnitarioArs: config ? config.costo_unitario_ars : i.costoUnitarioArs,
      enMostrador: config ? config.activo_mostrador !== false : i.enMostrador,
      stockMinimo: stockMinimo === undefined ? i.stockMinimo : stockMinimo,
      ubicacion: ubicacion === undefined ? i.ubicacion : ubicacion,
      alias: alias === undefined ? i.alias : alias,
      info: info === undefined ? i.info : info,
      imagenUrl: imagenUrl === undefined ? i.imagenUrl : imagenUrl,
      pesoUnitarioG: peso ? Number(peso.peso_unitario_g) : i.pesoUnitarioG,
      pesoCalibradoAt: peso ? peso.peso_calibrado_at : i.pesoCalibradoAt,
      ...(codigosBarra === undefined ? {} : conCodigosBarra(i, codigosBarra)),
    })));
  };

  // El lector de esta pantalla también reconoce el código recién cargado.
  const conCodigosBarra = (i, lista) => {
    const barras = lista.map(normalizarCodigo).filter(Boolean);
    const viejas = new Set(i.codigosPorTipo?.barras ?? []);
    return {
      codigosBarra: lista,
      codigosPorTipo: { ...i.codigosPorTipo, barras },
      codigos: [...barras, ...(i.codigos ?? []).filter((c) => !viejas.has(c))],
    };
  };

  const toggleFalta = (k) => setFaltan((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  return (
    <div className="cat-root">
      <style>{CSS}</style>

      <div className="cat-barra">
        <nav className="ui-tabs cat-vistas" role="tablist" aria-label="Vistas del catálogo">
          {VISTAS.map((v) => (
            <button key={v.key} type="button" role="tab" className="ui-tab" aria-selected={vista === v.key} onClick={() => setVista(v.key)}>
              {v.label}
            </button>
          ))}
        </nav>
        <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={cargar} disabled={cargando} aria-label="Volver a traer">
          <RefreshCw size={16} />
        </button>
      </div>

      {cargando && !catalogo.length ? (
        <Cargando llenar texto="Trayendo el catálogo…" />
      ) : error ? (
        <EmptyState title="No se pudo abrir el catálogo" subtitle={error} action={<button type="button" className="ui-btn" onClick={cargar}>Reintentar</button>} />
      ) : vista === "conciliar" ? (
        <ConciliarRebollar catalogo={catalogo} lista={lista} historial={historial} errorLista={errorLista} puedeConciliar={esGestor} onResuelto={cargar} />
      ) : (
        <div className={`cat-cuerpo${seleccionado ? " con-panel" : ""}`}>
          <div className="cat-col">
            <div className="cat-filtros">
              <div className="cat-buscador">
                <Search size={16} />
                <input className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar consumibles por nombre, alias, código o ubicación" placeholder="Nombre, alias, código o ubicación" />
              </div>
              <select className="ui-input cat-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
                <option value="">Todos los rubros</option>
                {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="cat-chips" role="group" aria-label="Lo que falta">
              {FALTANTES.map((f) => (
                <button key={f.key} type="button" className={`ui-chip cat-chip${faltan.includes(f.key) ? " is-activa" : ""}`} aria-pressed={faltan.includes(f.key)} onClick={() => toggleFalta(f.key)}>
                  {f.label} <span className="cat-mono">{conteoFaltan[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="cat-dim cat-cuenta">{filtrados.length} de {activos.length} consumibles</div>

            {!filtrados.length ? (
              <EmptyState title="Nada con ese filtro" subtitle="Probá sacando algún filtro o con otra palabra." />
            ) : (
              <ul className="cat-lista">
                {filtrados.map((i) => (
                  <li key={i.id}>
                    <button type="button" className={`cat-fila${i.id === selId ? " is-sel" : ""}`} onClick={() => setSelId(i.id === selId ? null : i.id)}>
                      {/* La foto principal (la misma de la botonera del mostrador); sin foto, las iniciales. */}
                      <span className="cat-thumb"><FotoItem item={i} /></span>
                      <span className="cat-fila-txt">
                        <span className="cat-fila-desc">{i.descripcion}</span>
                        {i.alias && <span className="cat-alias">Alias: {i.alias}</span>}
                        <span className="cat-dim">
                          <span className="cat-mono cat-ka">{i.codigoEtiqueta ?? "Sin código"}</span>
                          {" · "}{i.rubro ?? "Sin rubro"} · {FORMAS_ENTREGA[i.formaEntrega]?.label ?? i.formaEntrega} · {i.unidad}
                          {i.config?.favorito_orden ? ` · favorito ${i.config.favorito_orden}` : ""}
                          {i.enMostrador ? "" : " · fuera del mostrador"}
                        </span>
                      </span>
                      <span className="cat-fila-datos">
                        {i.config?.proveedor_codigo
                          ? <span className="cat-dato"><span className="cat-mono">{i.config.proveedor_codigo}</span>{verPrecios && i.costoUnitarioArs != null && <b className="cat-mono">{fmtPesos(i.costoUnitarioArs)}</b>}</span>
                          : <span className="cat-dato cat-falta">sin código</span>}
                        <span className={`cat-dato${i.ubicacion ? "" : " cat-falta"}`}>{i.ubicacion ? <span className="cat-mono">{i.ubicacion}</span> : "sin ubicación"}</span>
                        <span className={`cat-dato${i.pesoUnitarioG ? "" : " cat-falta"}`}>{i.pesoUnitarioG ? <span className="cat-mono">{fmtCantidad(i.pesoUnitarioG)} g</span> : "sin peso"}</span>
                        {i.stockMinimo != null && <span className="cat-dato">mín. <span className="cat-mono">{fmtCantidad(i.stockMinimo)}</span></span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {seleccionado && (
            <div className="cat-lado">
              <div className="cat-velo" onClick={() => setSelId(null)} aria-hidden="true" />
              <PanelEdicion
                key={seleccionado.id}
                item={seleccionado}
                puedeEditar={puedeEditar}
                onCerrar={() => setSelId(null)}
                onGuardado={(id, cambios) => { aplicarCambio(id, cambios); if (!cambios.peso) setSelId(null); }}
                onFoto={(id, imagenUrl) => aplicarCambio(id, { imagenUrl })}
                onCodigos={(id, codigosBarra) => aplicarCambio(id, { codigosBarra })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
  .cat-root { padding: 16px 20px 32px; display: flex; flex-direction: column; gap: 14px; min-height: 100%; min-width: 0; }
  .cat-root .cat-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .cat-root .cat-dim { color: var(--dim); font-size: 12.5px; }
  .cat-root .cat-barra { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border); }
  .cat-root .cat-vistas { flex: 1; min-width: 0; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
  .cat-root .cat-vistas .ui-tab { flex-shrink: 0; }
  .cat-root .cat-btn-chico { min-height: 40px; padding: 0 10px; font-size: 12.5px; gap: 6px; }
  .cat-root .cat-alias { display: block; color: var(--dim); font-size: 12px; overflow-wrap: anywhere; }

  .cat-root .cat-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  .cat-root .cat-cuerpo.con-panel { grid-template-columns: minmax(0, 1fr) 400px; }
  .cat-root .cat-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .cat-root .cat-filtros { display: flex; gap: 10px; flex-wrap: wrap; }
  .cat-root .cat-buscador { position: relative; flex: 1 1 260px; display: flex; align-items: center; min-width: 0; }
  .cat-root .cat-buscador svg { position: absolute; left: 12px; color: var(--dim); pointer-events: none; }
  .cat-root .cat-buscador .ui-input { padding-left: 36px; }
  .cat-root .cat-rubro { flex: 0 1 240px; width: auto; }
  .cat-root .cat-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .cat-root .cat-chips::-webkit-scrollbar { display: none; }
  .cat-root .cat-chip { min-height: 40px; flex-shrink: 0; }
  .cat-root .cat-chip.is-activa { background: var(--violet-soft); border-color: var(--violet-border); color: var(--violet); }
  .cat-root .cat-cuenta { padding: 2px 2px 0; }

  .cat-root .cat-lista { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--panel-solid); overflow: hidden; }
  .cat-root .cat-lista li + li { border-top: 1px solid var(--border); }
  .cat-root .cat-fila { width: 100%; display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 14px; border: 0; background: transparent; color: var(--text); font: inherit; text-align: left; }
  .cat-root .cat-fila:hover { background: var(--panel-2); }
  .cat-root .cat-fila.is-sel { background: var(--blue-soft); }
  .cat-root .cat-ka { font-size: 12.5px; color: var(--muted); }
  .cat-root .cat-thumb { position: relative; width: 52px; height: 52px; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: var(--panel-2); border: 1px solid var(--border); }
  .cat-root .cat-thumb .mst-inicial { color: var(--dim); font-size: 15px; font-weight: 600; letter-spacing: .02em; }
  /* Entera sobre blanco, como en el mostrador: el blanco tapa las iniciales de atrás. */
  .cat-root .cat-thumb img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 3px; object-fit: contain; background: #fff; }
  .cat-root .cat-fila-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cat-root .cat-fila-desc { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cat-root .cat-fila-datos { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .cat-root .cat-dato { display: inline-flex; gap: 6px; align-items: center; min-height: 24px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .cat-root .cat-dato b { font-weight: 600; color: var(--text); }
  .cat-root .cat-falta { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }

  .cat-root .cat-lado { position: sticky; top: 12px; }
  .cat-root .cat-velo { display: none; }
  .cat-root .cat-panel { display: flex; flex-direction: column; max-height: calc(100vh - 220px); overflow: hidden; }
  .cat-root .cat-panel-cab { display: flex; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
  .cat-root .cat-panel-cab h3 { margin: 2px 0; font-size: 16px; font-weight: 650; }
  .cat-root .cat-panel-cuerpo { overflow: auto; padding: 4px 16px 12px; }
  .cat-root .cat-panel-cuerpo fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .cat-root .cat-panel-cuerpo section { padding: 12px 0; display: flex; flex-direction: column; gap: 10px; }
  .cat-root .cat-panel-cuerpo section + section { border-top: 1px solid var(--border); }
  .cat-root .cat-panel-cuerpo h4 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim); }
  .cat-root .cat-campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .cat-root .cat-barras { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .cat-root .cat-barras li { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel-2); font-size: 13px; }
  .cat-root .cat-barras li .ui-btn-icono { width: 26px; height: 26px; min-height: 26px; }
  .cat-root .cat-barras-vacio { margin: 0 0 8px; font-size: 13px; }
  .cat-root .cat-barras-alta { display: flex; gap: 8px; margin-bottom: 4px; }
  .cat-root .cat-barras-alta .ui-input { flex: 1; min-width: 0; }
  .cat-root .cat-campo > span { font-size: 12.5px; color: var(--muted); }
  .cat-root .cat-campo small { color: var(--dim); font-size: 12px; }
  .cat-root .cat-fila2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }
  .cat-root .cat-fila3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: end; }
  .cat-root .cat-check { display: flex; align-items: center; gap: 8px; min-height: 40px; font-size: 13px; color: var(--muted); }
  .cat-root .cat-check input { width: 18px; height: 18px; accent-color: var(--blue); }
  .cat-root .cat-check-chico { min-height: 30px; margin-left: auto; }
  .cat-root .cat-peso { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .cat-root .cat-fotos { display: grid; gap: 8px; }
  .cat-root .cat-foto-principal { aspect-ratio: 4 / 3; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-2); display: grid; place-items: center; overflow: hidden; }
  .cat-root .cat-foto-principal img { width: 100%; height: 100%; object-fit: contain; }
  .cat-root .cat-fotos-tira { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .cat-root .cat-foto-mini { position: relative; flex: 0 0 72px; height: 72px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--panel-2); }
  .cat-root .cat-foto-mini.is-principal { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue); }
  .cat-root .cat-foto-mini img { width: 100%; height: 100%; box-sizing: border-box; padding: 3px; object-fit: contain; background: #fff; }
  .cat-root .cat-foto-acciones { position: absolute; right: 2px; bottom: 2px; display: flex; gap: 2px; }
  .cat-root .cat-foto-acciones .ui-btn { min-height: 26px; width: 26px; padding: 0; background: var(--panel-solid); }
  .cat-root .cat-fotos-botones { display: flex; gap: 8px; flex-wrap: wrap; }
  .cat-root .cat-peso a { margin-left: auto; }
  .cat-root .cat-prov { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .cat-root .cat-notas { min-height: 64px; padding: 8px 12px; resize: vertical; }
  .cat-root .cat-panel-pie { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }

  .cat-root .cat-resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13.5px; }
  .cat-root .cat-aviso { margin: 0; padding: 10px 12px; border: 1px solid var(--cyan-border); border-radius: 10px; background: var(--cyan-soft); color: var(--text); font-size: 13px; }
  .cat-root .cat-conciliar, .cat-root .cat-activar { display: flex; flex-direction: column; gap: 12px; }
  .cat-root .cat-conc-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .cat-root .cat-conc-fila { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; min-width: 0; }
  .cat-root .cat-conc-cab { width: 100%; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .cat-root .cat-conc-cab > div { min-width: 0; overflow-wrap: anywhere; }
  .cat-root .cat-chip-historial { flex-shrink: 0; color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
  .cat-root .cat-btn-fuera { min-height: 40px; max-width: 100%; white-space: normal; text-align: left; padding: 8px 10px; font-size: 12.5px; }
  .cat-root .cat-btn-fuera svg { flex-shrink: 0; }
  .cat-root .cat-chip-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
  .cat-root .cat-sug { width: 100%; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .cat-root .cat-sug li, .cat-root .cat-act-fila { width: 100%; display: grid; grid-template-columns: 96px minmax(0, 1fr) auto 44px auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 8px; background: var(--panel); font-size: 13px; }
  .cat-root .cat-act-fila { grid-template-columns: 96px minmax(0, 1fr) auto auto; background: transparent; padding: 0; }
  .cat-root .cat-cod { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .cat-root .cat-sug-desc { min-width: 0; overflow-wrap: anywhere; }
  .cat-root .cat-precio { font-size: 12.5px; overflow-wrap: anywhere; }
  .cat-root .cat-precio small { color: var(--dim); font-size: 11.5px; }
  .cat-root .cat-pct { text-align: right; }
  .cat-root .cat-sin-sug { margin: 0; }
  .cat-root .cat-buscar-otro { width: 100%; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .cat-root .cat-buscar-otro .cat-buscador { width: 100%; flex: none; }
  .cat-root .cat-alta { width: 100%; display: flex; flex-direction: column; gap: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
  .cat-root .cat-alta-pie { display: flex; justify-content: flex-end; gap: 8px; }
  .cat-root .cat-mas { margin: 0; text-align: center; }

  @media (max-width: 1100px) {
    .cat-root .cat-cuerpo.con-panel { grid-template-columns: minmax(0, 1fr) 360px; }
    .cat-root .cat-fila { grid-template-columns: 52px minmax(0, 1fr); }
    .cat-root .cat-fila-datos { grid-column: 2; justify-content: flex-start; }
  }
  @media (max-width: 899px) {
    .cat-root { padding: 12px 16px 24px; }
    .cat-root .cat-cuerpo.con-panel { grid-template-columns: minmax(0, 1fr); }
    /* En el celular la ficha sube como hoja desde abajo. */
    .cat-root .cat-lado { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 60; display: flex; align-items: flex-end; }
    .cat-root .cat-velo { display: block; position: absolute; top: 0; right: 0; bottom: 0; left: 0; background: var(--overlay); }
    .cat-root .cat-panel { position: relative; width: 100%; max-height: 88vh; border-radius: 16px 16px 0 0; padding-bottom: env(safe-area-inset-bottom); }
    .cat-root .cat-panel-pie .ui-btn { flex: 1; }
    .cat-root .cat-rubro { flex: 1 1 100%; }
    .cat-root .cat-fila2, .cat-root .cat-fila3 { grid-template-columns: 1fr 1fr; }
    .cat-root .cat-sug li { grid-template-columns: minmax(0, 1fr) auto; }
    .cat-root .cat-sug li .cat-cod { grid-column: 1 / -1; }
    .cat-root .cat-sug li .cat-pct { display: none; }
    .cat-root .cat-sug li .ui-btn { grid-column: 1 / -1; justify-self: start; }
    .cat-root .cat-act-fila { grid-template-columns: minmax(0, 1fr) auto; }
    .cat-root .cat-act-fila .cat-cod { grid-column: 1 / -1; }
    .cat-root .cat-check-chico { margin-left: 0; }
  }
  @media (max-width: 480px) {
    .cat-root .cat-conc-cab { flex-direction: column; }
    .cat-root .cat-sug li { grid-template-columns: minmax(0, 1fr); }
    .cat-root .cat-sug li .ui-btn { justify-self: stretch; }
    .cat-root .cat-fila2, .cat-root .cat-fila3 { grid-template-columns: minmax(0, 1fr); }
    .cat-root .cat-btn-fuera { width: 100%; }
  }
`;
