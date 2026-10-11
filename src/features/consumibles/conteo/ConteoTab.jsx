import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardCheck, ListChecks, PackagePlus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useAhora } from "@/hooks/useAhora";
import { fetchCatalogo, fmtCantidad, indexarCodigos, normalizarCodigo } from "@/features/consumibles/api";
import HojaConteo from "./HojaConteo";
import HojaAlta from "./HojaAlta";
import { fetchHistorialParaSugerir, fetchMovimientosDeHoy, fetchNombresDePerfiles, fetchRubrosConsumibles } from "./conteoApi";
import {
  agruparParaConteo,
  coincideBusqueda,
  estadoConteoDeHoy,
  modoAgrupadoPorDefecto,
  stockAlInicioDelDia,
  sugerirConteoDiario,
  unidadEnTexto,
} from "./conteoCalculos";
import { CSS_CONTEO } from "./conteoEstilos";
import { conPlazoLectura } from "../lecturas";
import { claveDia } from "./conteoCalculos";

/**
 * Conteo — inventario inicial (lunes 12/10/2026: dos pañoleros con el celular
 * mientras el tercero atiende) y conteo cíclico de todos los días.
 *
 * Recorrido: lista agrupada por rubro o por estantería → tocar el producto →
 * escribir cuánto hay → Guardar. Lo que cuenta el otro celular aparece solo
 * (se consulta cada 15 s y, si la tabla está publicada en realtime, al toque).
 *
 * "Contar hoy" propone 10 productos por día: los de stock negativo, los que más
 * salen y los que hace más que no se cuentan. La lista se arma con datos de
 * antes de hoy, así no cambia mientras se cuenta y los dos celulares ven la misma.
 */

const AYUDA_KEY = "klasea.consumibles.conteo.ayudaVista";
const RECARGA_MS = 15000;

function leerAyudaVista() {
  try { return window.localStorage.getItem(AYUDA_KEY) === "1"; } catch { return false; }
}

const hora = (iso) => new Date(iso).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });

export default function ConteoTab({ profile, sede }) {
  const toast = useToast();
  const ahora = useAhora(60 * 1000);
  const dia = claveDia(ahora);
  const idCanal = useId();

  // Datos que se cargan juntos (la sugerencia necesita catálogo y movimientos
  // de hoy de un mismo momento). `sede` marca de qué sede son.
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [hoy, setHoy] = useState({ sede: null, filas: [] });
  const [nombres, setNombres] = useState(() => new Map());
  const [rubros, setRubros] = useState(null);

  const [vista, setVista] = useState(null); // null = la que corresponde según el avance
  const [agrupar, setAgrupar] = useState(null);
  const [filtro, setFiltro] = useState("todos"); // todos | sinHoy | nunca
  const [busqueda, setBusqueda] = useState("");
  const [abiertoId, setAbiertoId] = useState(null);
  const [alta, setAlta] = useState(null); // { texto } cuando está abierta
  const [ultimaUbicacion, setUltimaUbicacion] = useState(null);
  const [ultimoRubroAlta, setUltimoRubroAlta] = useState("");
  const [recienId, setRecienId] = useState(null);
  const [colapsados, setColapsados] = useState(() => new Set());
  const [ayudaVista, setAyudaVista] = useState(leerAyudaVista);
  const [recargando, setRecargando] = useState(false);
  const pedidosCatalogo = useRef(new Set());
  const pedidosNombres = useRef(new Set());
  const cargaVersion = useRef(0);
  const hoyVersion = useRef(0);
  const [errorSincronizacion, setErrorSincronizacion] = useState("");

  const cargarTodo = useCallback(async () => {
    const version = ++cargaVersion.current;
    const versionHoy = ++hoyVersion.current;
    const [catalogo, filasHoy, historial] = await conPlazoLectura(Promise.all([
      fetchCatalogo({ sede }),
      fetchMovimientosDeHoy(sede),
      fetchHistorialParaSugerir(sede),
    ]));
    if (version !== cargaVersion.current) return;
    setDatos({ sede, dia, catalogo, historial, hoyAlCargar: filasHoy });
    if (versionHoy === hoyVersion.current) setHoy({ sede, dia, filas: filasHoy });
    // El avance no debe cambiar la pestaña a mitad del recorrido del lunes.
    setVista((v) => v ?? (catalogo.length && catalogo.filter((i) => !i.ultimoConteoAt).length / catalogo.length < 0.5 ? "hoy" : "inventario"));
    setErrorCarga("");
    setErrorSincronizacion("");
  }, [sede, dia]);

  const recargarHoy = useCallback(async () => {
    const version = ++hoyVersion.current;
    try {
      const filas = await conPlazoLectura(fetchMovimientosDeHoy(sede));
      if (version !== hoyVersion.current) return;
      setHoy({ sede, dia, filas });
      setErrorSincronizacion("");
    } catch {
      if (version === hoyVersion.current) setErrorSincronizacion("No pudimos actualizar lo que contó tu compañero. Revisá la conexión antes de volver a contar el mismo producto.");
    }
  }, [sede, dia]);

  // Carga inicial y al cambiar de sede.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargarTodo();
      } catch (err) {
        if (vivo) setErrorCarga(err.message || String(err));
      }
    })();
    return () => { vivo = false; cargaVersion.current += 1; hoyVersion.current += 1; };
  }, [cargarTodo]);

  // Lo que cuenta el otro celular: cada 15 s con la pantalla a la vista, y al
  // volver a la app.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") recargarHoy(); };
    const id = window.setInterval(tick, RECARGA_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [recargarHoy]);

  // Realtime: si consumibles_movimientos está en la publicación, avisa al
  // instante. Nombre de canal único por instancia (el mismo nombre montado
  // dos veces rompe la pantalla).
  useEffect(() => {
    let espera = null;
    const canal = supabase
      .channel(`cns-conteo-${sede}-${idCanal.replace(/[^a-zA-Z0-9]/g, "")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "consumibles_movimientos", filter: `sede=eq.${sede}` }, () => {
        window.clearTimeout(espera);
        espera = window.setTimeout(recargarHoy, 500);
      })
      .subscribe();
    return () => {
      window.clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [sede, idCanal, recargarHoy]);

  const listo = datos?.sede === sede && datos?.dia === dia;
  const catalogo = useMemo(() => (listo ? datos.catalogo : []), [listo, datos]);
  const filasHoy = useMemo(() => (hoy.sede === sede && hoy.dia === dia ? hoy.filas : []), [hoy, sede, dia]);
  const estadoHoy = useMemo(() => estadoConteoDeHoy(filasHoy), [filasHoy]);
  const porId = useMemo(() => new Map(catalogo.map((i) => [i.id, i])), [catalogo]);
  const indiceCodigos = useMemo(() => indexarCodigos(catalogo), [catalogo]);

  // Nombres de quien contó (profiles), para "Pedro, 8:14".
  // Cada id se pide una sola vez: si profiles no contesta, no se reintenta en bucle.
  useEffect(() => {
    const ids = [...new Set([...estadoHoy.values()].map((e) => e.por).filter(Boolean))]
      .filter((id) => !pedidosNombres.current.has(id));
    if (!ids.length) return undefined;
    ids.forEach((id) => pedidosNombres.current.add(id));
    fetchNombresDePerfiles(ids).then((m) => {
      if (m.size) setNombres((prev) => new Map([...prev, ...m]));
    });
    return undefined;
  }, [estadoHoy]);

  // Un producto contado que no está en la lista lo dio de alta el otro
  // celular: se recarga el catálogo (una vez por producto).
  useEffect(() => {
    if (!listo) return;
    const nuevos = [...estadoHoy.keys()].filter((id) => !porId.has(id) && !pedidosCatalogo.current.has(id));
    if (!nuevos.length) return;
    nuevos.forEach((id) => pedidosCatalogo.current.add(id));
    cargarTodo().catch(() => { nuevos.forEach((id) => pedidosCatalogo.current.delete(id)); });
  }, [listo, estadoHoy, porId, cargarTodo]);

  const sugeridos = useMemo(() => {
    if (!listo) return [];
    const hoyPorMaterial = new Map();
    for (const m of datos.hoyAlCargar) {
      if (!hoyPorMaterial.has(m.material_id)) hoyPorMaterial.set(m.material_id, []);
      hoyPorMaterial.get(m.material_id).push(m);
    }
    const items = datos.catalogo.map((i) => ({ ...i, stockInicioDia: stockAlInicioDelDia(i.stock, hoyPorMaterial.get(i.id)) }));
    return sugerirConteoDiario({ items, retiros: datos.historial.retiros, conteos: datos.historial.conteos, hoy: ahora, cantidad: 10 });
  }, [listo, datos, ahora]);

  const contadosHoy = useMemo(() => catalogo.filter((i) => estadoHoy.has(i.id)).length, [catalogo, estadoHoy]);
  const nuncaContado = useCallback((i) => !i.ultimoConteoAt && !estadoHoy.has(i.id), [estadoHoy]);
  const cantNunca = useMemo(() => catalogo.filter(nuncaContado).length, [catalogo, nuncaContado]);

  // Mientras falte el inventario inicial se arranca en "Inventario"; después, en "Contar hoy".
  const vistaEfectiva = vista ?? (catalogo.length && cantNunca / catalogo.length < 0.5 ? "hoy" : "inventario");
  const agruparEfectivo = agrupar ?? modoAgrupadoPorDefecto(catalogo);
  const buscando = busqueda.trim().length > 0;

  const visibles = useMemo(() => {
    const pasa = (i) => (filtro === "sinHoy" ? !estadoHoy.has(i.id) : filtro === "nunca" ? nuncaContado(i) : true);
    if (buscando) return catalogo.filter((i) => coincideBusqueda(i, busqueda) && pasa(i));
    if (vistaEfectiva === "hoy") {
      return sugeridos.map((s) => porId.get(s.id) && { ...porId.get(s.id), motivo: s.motivo }).filter(Boolean).filter(pasa);
    }
    return catalogo.filter(pasa);
  }, [buscando, busqueda, catalogo, filtro, estadoHoy, nuncaContado, vistaEfectiva, sugeridos, porId]);

  const grupos = useMemo(() => {
    if (buscando) return [{ clave: "busqueda", titulo: `Resultados (${visibles.length})`, items: visibles }];
    if (vistaEfectiva === "hoy") return [{ clave: "hoy", titulo: "Para contar hoy", items: visibles }];
    return agruparParaConteo(visibles, agruparEfectivo);
  }, [buscando, visibles, vistaEfectiva, agruparEfectivo]);

  const abierto = abiertoId ? porId.get(abiertoId) : null;
  const sugeridosContados = sugeridos.filter((s) => estadoHoy.has(s.id)).length;

  const abrir = useCallback((id) => setAbiertoId(id), []);
  const cerrarConteo = useCallback(() => setAbiertoId(null), []);

  const onGuardado = useCallback(({ item, fila }) => {
    setAbiertoId(null);
    setRecienId(item.id);
    window.setTimeout(() => setRecienId((r) => (r === item.id ? null : r)), 2600);
    // Se suma al estado de hoy al instante, sin esperar la próxima consulta.
    hoyVersion.current += 1;
    if (fila) setHoy((prev) => (prev.sede === sede ? { ...prev, filas: [...prev.filas.filter((f) => f.id !== fila.id), fila] } : prev));
    const contado = Number(fila?.contado ?? 0);
    const teorico = Number(fila?.teorico ?? 0);
    const dif = Number(fila?.cantidad ?? 0);
    const unidad = unidadEnTexto(item.unidad, contado);
    const extra = teorico !== 0 && dif !== 0
      ? ` El sistema tenía ${fmtCantidad(teorico)} (${dif > 0 ? "+" : ""}${fmtCantidad(dif)}).`
      : "";
    toast.success(`${item.descripcion}: ${fmtCantidad(contado)} ${unidad}.${extra}`);
    recargarHoy();
  }, [sede, toast, recargarHoy]);

  const onUbicacion = useCallback((item, ubicacion) => {
    if (ubicacion) setUltimaUbicacion(ubicacion);
    setDatos((prev) => (prev ? { ...prev, catalogo: prev.catalogo.map((i) => (i.id === item.id ? { ...i, ubicacion } : i)) } : prev));
  }, []);

  const abrirAlta = useCallback(async (texto = "") => {
    setAlta({ texto });
    if (!rubros) {
      try {
        setRubros(await fetchRubrosConsumibles());
      } catch {
        setRubros({ raiz: null, rubros: [] });
      }
    }
  }, [rubros]);

  const onCreado = useCallback((item, categoriaId) => {
    setAlta(null);
    setUltimoRubroAlta(categoriaId || "");
    setDatos((prev) => (prev ? { ...prev, catalogo: [...prev.catalogo, item] } : prev));
    pedidosCatalogo.current.add(item.id);
    setBusqueda("");
    setAbiertoId(item.id);
  }, []);

  const onBuscarEnter = (e) => {
    if (e.key !== "Enter") return;
    const codigo = normalizarCodigo(busqueda);
    const porCodigo = codigo ? indiceCodigos.get(codigo) : null;
    if (porCodigo) {
      setBusqueda("");
      abrir(porCodigo.id);
    } else if (visibles.length === 1) {
      abrir(visibles[0].id);
    }
  };

  const recargar = async () => {
    setRecargando(true);
    try {
      await cargarTodo();
    } catch (err) {
      toast.error(`No se pudo actualizar: ${err.message || err}`);
    } finally {
      setRecargando(false);
    }
  };

  const cerrarAyuda = () => {
    setAyudaVista(true);
    try { window.localStorage.setItem(AYUDA_KEY, "1"); } catch { /* modo privado */ }
  };

  const toggleGrupo = (clave) => setColapsados((prev) => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  if (errorCarga && !listo) {
    return (
      <div className="cnt cnt-root">
        <style href="klasea-cns-conteo" precedence="default">{CSS_CONTEO}</style>
        <div className="cnt-error ui-card">
          <p>No se pudo traer la lista de consumibles.</p>
          <p className="cnt-ayuda">{errorCarga}</p>
          <button type="button" className="ui-btn ui-btn-primario" onClick={recargar} disabled={recargando}>Probar de nuevo</button>
        </div>
      </div>
    );
  }
  if (!listo) {
    return (
      <div className="cnt cnt-root">
        <style href="klasea-cns-conteo" precedence="default">{CSS_CONTEO}</style>
        <Cargando texto="Trayendo los consumibles…" />
      </div>
    );
  }

  const total = vistaEfectiva === "hoy" ? sugeridos.length : catalogo.length;
  const hechos = vistaEfectiva === "hoy" ? sugeridosContados : contadosHoy;
  const pct = total ? Math.round((hechos / total) * 100) : 0;

  return (
    <div className="cnt cnt-root">
      <style href="klasea-cns-conteo" precedence="default">{CSS_CONTEO}</style>

      {errorSincronizacion && <div className="cnt-aviso" role="status">{errorSincronizacion}</div>}
      <div className="cnt-cabeza">
        <div className="cnt-vistas" role="tablist" aria-label="Qué contar">
          <button type="button" role="tab" aria-selected={vistaEfectiva === "inventario"} className={vistaEfectiva === "inventario" ? "is-activa" : ""} onClick={() => setVista("inventario")}>
            <ListChecks size={16} /> Inventario
          </button>
          <button type="button" role="tab" aria-selected={vistaEfectiva === "hoy"} className={vistaEfectiva === "hoy" ? "is-activa" : ""} onClick={() => { setVista("hoy"); setFiltro((f) => (f === "nunca" ? "todos" : f)); }}>
            <ClipboardCheck size={16} /> Contar hoy
          </button>
          <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono cnt-recargar" onClick={recargar} disabled={recargando} aria-label="Actualizar la lista" title="Actualizar la lista">
            <RefreshCw size={17} className={recargando ? "cnt-girando" : ""} />
          </button>
        </div>

        <div className="cnt-progreso" aria-live="polite">
          <div className="cnt-progreso-txt">
            <span><b className="cnt-num">{hechos}</b> de <span className="cnt-num">{total}</span> {vistaEfectiva === "hoy" ? "contados" : "contados hoy"}</span>
            <span className="cnt-num cnt-progreso-pct">{pct}%</span>
          </div>
          <div className="cnt-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechos}>
            <span style={{ transform: `scaleX(${total ? hechos / total : 0})` }} />
          </div>
        </div>

        <div className="cnt-buscar">
          <Search size={18} className="cnt-buscar-ico" />
          <input
            className="ui-input"
            type="search"
            value={busqueda}
            placeholder="Buscar producto o código"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onBuscarEnter}
            aria-label="Buscar producto o código"
          />
          {busqueda && (
            <button type="button" className="cnt-buscar-x" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={17} /></button>
          )}
        </div>

        <div className="cnt-chips">
          {/* Primero: en el celular la fila se desplaza de costado y al final
              quedaba fuera de la pantalla, y el lunes es lo que más se busca
              para lo que está en el estante y no en la lista. */}
          <button type="button" className="cnt-chip cnt-chip-agregar" onClick={() => abrirAlta(busqueda.trim())}>
            <PackagePlus size={15} /> Agregar producto
          </button>
          <button type="button" className={`cnt-chip${filtro === "sinHoy" ? " is-activa" : ""}`} aria-pressed={filtro === "sinHoy"} onClick={() => setFiltro((f) => (f === "sinHoy" ? "todos" : "sinHoy"))}>
            Sin contar hoy
          </button>
          {vistaEfectiva === "inventario" && (
            <button type="button" className={`cnt-chip${filtro === "nunca" ? " is-activa" : ""}`} aria-pressed={filtro === "nunca"} onClick={() => setFiltro((f) => (f === "nunca" ? "todos" : "nunca"))}>
              Nunca contados <span className="cnt-num">{cantNunca}</span>
            </button>
          )}
          {vistaEfectiva === "inventario" && !buscando && (
            <button type="button" className="cnt-chip" onClick={() => setAgrupar(agruparEfectivo === "rubro" ? "ubicacion" : "rubro")}>
              Por {agruparEfectivo === "rubro" ? "rubro" : "estantería"} <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {!ayudaVista && (
        <div className="cnt-guia">
          <div className="cnt-guia-tit">Cómo contar</div>
          <ol>
            <li>Tocá el producto (o buscalo por nombre o código).</li>
            <li>Contá lo que hay en el estante y escribí el número.</li>
            <li>Tocá <b>Guardar</b>. Lo que cuenta tu compañero aparece solo.</li>
          </ol>
          <p>Si encontrás algo que no está en la lista, tocá <b>Agregar producto</b>. Si un producto está en dos lugares, contá uno, y al contar el otro elegí <b>Había más en otro lugar</b>.</p>
          <button type="button" className="ui-btn ui-btn-suave" onClick={cerrarAyuda}>Entendido</button>
        </div>
      )}

      {vistaEfectiva === "hoy" && !buscando && sugeridos.length > 0 && sugeridosContados === sugeridos.length && (
        <div className="cnt-listo"><Check size={18} /> Listo el conteo de hoy. Gracias.</div>
      )}
      {vistaEfectiva === "inventario" && !buscando && catalogo.length > 0 && contadosHoy === catalogo.length && (
        <div className="cnt-listo"><Check size={18} /> Contaron todo el pañol. Gracias.</div>
      )}

      <div className="cnt-lista">
        {grupos.map((g) => {
          const contadosG = g.items.filter((i) => estadoHoy.has(i.id)).length;
          const cerrado = colapsados.has(g.clave) && !buscando;
          const plegable = vistaEfectiva === "inventario" && !buscando;
          return (
            <section key={g.clave} className="cnt-grupo">
              {plegable ? (
                <button type="button" className="cnt-grupo-tit" onClick={() => toggleGrupo(g.clave)} aria-expanded={!cerrado}>
                  {cerrado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className="cnt-grupo-nombre">{g.titulo}</span>
                  <span className={`cnt-num cnt-grupo-cuenta${contadosG === g.items.length ? " is-completo" : ""}`}>{contadosG}/{g.items.length}</span>
                </button>
              ) : (
                <div className="cnt-grupo-tit is-fijo">
                  <span className="cnt-grupo-nombre">{g.titulo}</span>
                  {g.items.length > 0 && <span className="cnt-num cnt-grupo-cuenta">{contadosG}/{g.items.length}</span>}
                </div>
              )}
              {!cerrado && g.items.map((item) => (
                <FilaConteo
                  key={item.id}
                  item={item}
                  estado={estadoHoy.get(item.id)}
                  nombre={nombres.get(estadoHoy.get(item.id)?.por)}
                  esMio={estadoHoy.get(item.id)?.por === profile?.id}
                  destacado={recienId === item.id}
                  onAbrir={abrir}
                />
              ))}
            </section>
          );
        })}

        {buscando && visibles.length === 0 && (
          <div className="cnt-vacio">
            <p>No encontramos «{busqueda.trim()}».</p>
            <button type="button" className="ui-btn ui-btn-primario" onClick={() => abrirAlta(busqueda.trim())}>
              <PackagePlus size={17} /> Agregarlo como producto nuevo
            </button>
          </div>
        )}
        {!buscando && visibles.length === 0 && (
          <div className="cnt-vacio">
            <p>{filtro === "todos" ? "No hay productos para mostrar." : "No queda nada sin contar con este filtro."}</p>
          </div>
        )}

        <button type="button" className="ui-btn cnt-agregar-final" onClick={() => abrirAlta(busqueda.trim())}>
          <PackagePlus size={17} /> Agregar un producto que no está en la lista
        </button>
      </div>

      {abierto && (
        <HojaConteo
          key={abierto.id}
          item={abierto}
          sede={sede}
          estadoHoy={estadoHoy.get(abierto.id) || null}
          nombrePor={nombres.get(estadoHoy.get(abierto.id)?.por)}
          esMio={estadoHoy.get(abierto.id)?.por === profile?.id}
          ultimaUbicacion={ultimaUbicacion}
          onCerrar={cerrarConteo}
          onGuardado={onGuardado}
          onUbicacion={onUbicacion}
        />
      )}

      {alta && (
        <HojaAlta
          textoInicial={alta.texto}
          catalogo={catalogo}
          rubros={rubros?.rubros ?? []}
          raizId={rubros?.raiz?.id ?? null}
          rubroInicial={ultimoRubroAlta}
          onCerrar={() => setAlta(null)}
          onCreado={onCreado}
          onElegirExistente={(item) => { setAlta(null); setAbiertoId(item.id); }}
        />
      )}
    </div>
  );
}

function FilaConteo({ item, estado, nombre, esMio, destacado, onAbrir }) {
  const contado = !!estado;
  const meta = item.motivo
    ? [item.motivo]
    : [item.codigoEtiqueta, item.ubicacion, unidadEnTexto(item.unidad, 2)].filter(Boolean);
  return (
    <button
      type="button"
      className={`cnt-fila${contado ? " is-contado" : ""}${destacado ? " is-recien" : ""}`}
      onClick={() => onAbrir(item.id)}
    >
      <span className="cnt-fila-estado" aria-hidden="true">{contado ? <Check size={15} strokeWidth={2.6} /> : null}</span>
      <span className="cnt-fila-cuerpo">
        <span className="cnt-fila-desc">{item.descripcion}</span>
        <span className="cnt-fila-meta">
          {item.motivo ? meta[0] : meta.map((m, i) => (
            <span key={i} className={m === item.ubicacion || m === item.codigoEtiqueta ? "cnt-num" : ""}>{i > 0 ? " · " : ""}{m}</span>
          ))}
        </span>
      </span>
      {contado ? (
        <span className="cnt-fila-dato">
          <span className="cnt-num cnt-fila-cant">{fmtCantidad(estado.contado)}</span>
          <span className="cnt-fila-quien">{esMio ? "vos" : nombre || "otro"} · {hora(estado.at)}</span>
        </span>
      ) : (
        <span className="cnt-fila-ir">Contar <ChevronRight size={16} /></span>
      )}
    </button>
  );
}
