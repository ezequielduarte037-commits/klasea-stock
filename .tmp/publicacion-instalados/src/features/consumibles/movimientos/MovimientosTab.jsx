import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Ban, FileSpreadsheet, History, MapPin, Pencil, RefreshCw, Search, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { EmptyState } from "@/components/ui/motion";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/supabaseClient";
import { descargarXlsx } from "@/features/compras/xlsx";
import { SEDES, anularMovimiento, fetchObrasActivas, fmtCantidad, fmtPesos } from "@/features/consumibles/api";
import { SECTORES } from "@/features/panol/solicitudesPanolApi";
import Hoja from "../conteo/Hoja";
import FotoConsumible from "../FotoConsumible";
import { useVerPrecios } from "../verPrecios";
import EditarMovimiento from "./EditarMovimiento";
import { fetchNombresDePerfiles } from "../conteo/conteoApi";
import { unidadEnTexto } from "../conteo/conteoCalculos";
import { diaArgentina as hoyArgentina, moverDia, resolverPeriodo } from "../tablero/tableroCore";
import { TOPE_FILAS, corregirDestino, fetchMovimientosPeriodo, fetchPrimerosConteos } from "./movimientosApi";
import {
  ETIQUETA_TIPO,
  FILTROS_TIPO,
  agruparFilas,
  agruparPorDia,
  cantidadTexto,
  cuentas,
  destinoTexto,
  filasParaExcel,
  filtrarEntradas,
  mapaPrimerConteo,
  origenTexto,
  resumenRetiros,
} from "./movimientosLogica";

/**
 * Movimientos: todo lo que entró, salió y se contó en el pañol, en una lista
 * por día. Cada renglón es un producto de un retiro (las obras repartidas van
 * juntas); tocándolo se ve el detalle completo y se anula si estaba mal.
 *
 * Lo que salió antes del primer conteo de un producto lleva la marca
 * «Antes del conteo»: está registrado y cuenta como consumo, pero no descuenta
 * del stock (el stock arranca con el conteo).
 */

const PERIODOS = [["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["rango", "Rango"]];
const TONO = { retiro: "azul", ingreso: "verde", inventario: "violeta", devolucion: "teal", ajuste: "violeta", merma: "rojo" };
const PASO_LISTA = 300;

const hora = (iso) => new Date(iso).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fechaHora = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const tituloDia = (dia) => {
  const semana = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long" });
  const [, mes, d] = dia.split("-");
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${d}/${mes}`;
};
const plural = (n, uno, varios) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;
const FIRMA = { nfc: "con tarjeta", manual: "firmó en pantalla", sin_tarjeta: "sin tarjeta" };

export default function MovimientosTab({ sede, irA }) {
  const verPrecios = useVerPrecios();
  const toast = useToast();
  const idCanal = useId();

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState("7");
  const [rango, setRango] = useState(() => ({ desde: moverDia(hoyArgentina(), -6), hasta: hoyArgentina() }));
  const [sedeFiltro, setSedeFiltro] = useState(sede);
  const [tipo, setTipo] = useState("todos");
  const [q, setQ] = useState("");
  const [soloPre, setSoloPre] = useState(false);
  const [soloExternos, setSoloExternos] = useState(false);
  const [verAnulados, setVerAnulados] = useState(false);
  const [limite, setLimite] = useState(PASO_LISTA);
  const [selClave, setSelClave] = useState(null);

  const fechas = resolverPeriodo(periodo, rango);
  const base = `${sedeFiltro}|${fechas.desde}|${fechas.hasta}`;
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState({ base: null, recarga: -1, filas: null, primeros: new Map(), nombres: new Map(), recortado: false, error: null });

  useEffect(() => {
    if (fechas.error) return undefined;
    const ctrl = new AbortController();
    const s = sedeFiltro === "todas" ? null : sedeFiltro;
    Promise.all([
      fetchMovimientosPeriodo({ sede: s, desde: fechas.desde, hasta: fechas.hasta, signal: ctrl.signal }),
      fetchPrimerosConteos({ sede: s, signal: ctrl.signal }),
    ]).then(async ([mov, primeros]) => {
      // Ingresos y conteos no tienen persona que retira: se muestra quién los cargó.
      const ids = mov.filas.filter((f) => f.created_by && !f.empleado_nombre).map((f) => f.created_by);
      const nombres = ids.length ? await fetchNombresDePerfiles(ids) : new Map();
      if (!ctrl.signal.aborted) setCarga({ base, recarga, filas: mov.filas, primeros: mapaPrimerConteo(primeros), nombres, recortado: mov.recortado, error: null });
    }, (error) => {
      if (!ctrl.signal.aborted && error?.name !== "AbortError") setCarga((c) => ({ ...c, base, recarga, error }));
    });
    return () => ctrl.abort();
  }, [base, recarga, sedeFiltro, fechas.desde, fechas.hasta, fechas.error]);

  // ── En vivo: el mostrador, las solicitudes y los conteos registran desde otros equipos ──
  const incluyeHoy = !fechas.error && fechas.fin >= hoyArgentina();
  const incluyeHoyRef = useRef(incluyeHoy);
  useEffect(() => { incluyeHoyRef.current = incluyeHoy; }, [incluyeHoy]);
  useEffect(() => {
    let espera;
    const renovar = () => {
      if (!incluyeHoyRef.current || document.visibilityState !== "visible") return;
      clearTimeout(espera);
      // Un carrito son varias filas: se junta en una sola recarga.
      espera = setTimeout(() => setRecarga((n) => n + 1), 800);
    };
    const canal = supabase
      .channel(`cns-movimientos-${idCanal.replace(/[^a-zA-Z0-9]/g, "")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "consumibles_movimientos" }, renovar)
      .subscribe();
    return () => {
      clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [idCanal]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const listo = carga.base === base && carga.filas != null;
  const actualizando = listo && carga.recarga !== recarga;
  const entradas = useMemo(
    () => (listo ? agruparFilas(carga.filas, { primeros: carga.primeros, nombres: carga.nombres }) : []),
    [listo, carga],
  );
  const conteoTipos = useMemo(() => cuentas(entradas), [entradas]);
  const visibles = useMemo(
    () => filtrarEntradas(entradas, { tipo, q, soloPreConteo: soloPre, soloExternos, verAnulados }),
    [entradas, tipo, q, soloPre, soloExternos, verAnulados],
  );
  const dias = useMemo(() => agruparPorDia(visibles.slice(0, limite)), [visibles, limite]);
  const resumen = useMemo(() => resumenRetiros(visibles), [visibles]);
  const sel = selClave ? entradas.find((e) => e.clave === selClave) ?? null : null;

  // Cambiar un filtro vuelve a la primera tanda de la lista.
  const conFiltro = (fn) => (...args) => { setLimite(PASO_LISTA); fn(...args); };

  const exportar = () => {
    const completo = filasParaExcel(visibles);
    // Sin precios: la columna de valor no viaja en el Excel.
    const iValor = completo.cab.indexOf("Valor sin IVA");
    const sinColumna = (fila) => (verPrecios || iValor < 0 ? fila : fila.filter((_, i) => i !== iValor));
    const cab = sinColumna(completo.cab);
    const filas = completo.filas.map(sinColumna);
    const sedeTxt = sedeFiltro === "todas" ? "ambas-sedes" : sedeFiltro.toLowerCase();
    const fecha = { formatoNumero: "dd/mm/yyyy hh:mm" };
    const pesos = { formatoNumero: '"$" #,##0' };
    descargarXlsx(`movimientos-consumibles-${sedeTxt}-${fechas.inicio}-a-${fechas.fin}.xlsx`, [{
      nombre: "Movimientos",
      anchos: [16, 12, 12, 42, 10, 9, 24, 20, 20, 18, 20, 9, 14, 10, 9, 24, 30],
      congelar: { fila: 1, col: 0 },
      filas: [
        cab.map((v) => ({ v, s: { fuente: { b: true }, fondo: "E8EEF8" } })),
        ...filas.map((f) => f.map((v, i) => (i === 0 ? { v, s: fecha } : i === cab.indexOf("Valor sin IVA") && v !== "" ? { v, s: pesos } : v))),
      ],
    }]);
  };

  return (
    <div className="mov mov-root">
      <style href="klasea-cns-movimientos" precedence="default">{CSS}</style>

      <div className="mov-barra ui-card">
        <div className="mov-seg" role="group" aria-label="Período">
          {PERIODOS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={periodo === key} onClick={conFiltro(() => setPeriodo(key))}>{label}</button>
          ))}
        </div>
        <select className="ui-input mov-sede" value={sedeFiltro} onChange={(e) => { setLimite(PASO_LISTA); setSedeFiltro(e.target.value); }} aria-label="Sede">
          {SEDES.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value="todas">Las dos sedes</option>
        </select>
        <label className="mov-buscar">
          <Search size={16} aria-hidden="true" />
          <input
            className="ui-input"
            type="search"
            value={q}
            onChange={(e) => { setLimite(PASO_LISTA); setQ(e.target.value); }}
            placeholder="Producto, código, persona, obra o N° de solicitud"
            aria-label="Buscar movimientos"
          />
          {q && <button type="button" className="mov-buscar-x" onClick={() => setQ("")} aria-label="Borrar la búsqueda"><X size={15} /></button>}
        </label>
        <div className="mov-barra-der">
          <button type="button" className="ui-btn" onClick={exportar} disabled={!visibles.length}><FileSpreadsheet size={15} /> Excel</button>
          <button type="button" className="ui-btn ui-btn-icono" onClick={() => setRecarga((n) => n + 1)} disabled={!listo || actualizando} aria-label="Actualizar" title="Actualizar">
            <RefreshCw size={16} className={actualizando ? "mov-girando" : ""} />
          </button>
        </div>
        {periodo === "rango" && (
          <div className="mov-rango">
            <label><span>Desde</span><input type="date" className="ui-input" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} /></label>
            <label><span>Hasta, inclusive</span><input type="date" className="ui-input" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} /></label>
          </div>
        )}
      </div>

      {fechas.error ? (
        <p className="mov-aviso is-error" role="alert">{fechas.error}</p>
      ) : carga.error && carga.base === base && !listo ? (
        <div className="mov-aviso is-error" role="alert">
          No se pudieron traer los movimientos: {carga.error.message || String(carga.error)}
          <button type="button" className="ui-btn" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
        </div>
      ) : !listo ? (
        <Cargando texto="Trayendo los movimientos…" />
      ) : (
        <>
          <div className="mov-chips" role="group" aria-label="Tipo de movimiento">
            {FILTROS_TIPO.filter((f) => f.key === "todos" || conteoTipos[f.key] > 0 || tipo === f.key).map((f) => (
              <button key={f.key} type="button" className={`mov-chip${tipo === f.key ? " is-activa" : ""}`} aria-pressed={tipo === f.key} onClick={conFiltro(() => setTipo(f.key))}>
                {f.label} <span className="mov-num">{conteoTipos[f.key].toLocaleString("es-AR")}</span>
              </button>
            ))}
            <span className="mov-chips-sep" aria-hidden="true" />
            <button
              type="button"
              className={`mov-chip is-pre${soloPre ? " is-activa" : ""}`}
              aria-pressed={soloPre}
              onClick={conFiltro(() => setSoloPre((v) => !v))}
              title="Salió antes del primer conteo del producto: está registrado, pero no descuenta del stock."
            >
              Antes del conteo <span className="mov-num">{conteoTipos.preConteo.toLocaleString("es-AR")}</span>
            </button>
            {conteoTipos.externos > 0 && (
              <button
                type="button"
                className={`mov-chip is-externo${soloExternos ? " is-activa" : ""}`}
                aria-pressed={soloExternos}
                onClick={conFiltro(() => setSoloExternos((v) => !v))}
                title="Herreros, vidrieros y otros que no son del astillero."
              >
                Externos <span className="mov-num">{conteoTipos.externos.toLocaleString("es-AR")}</span>
              </button>
            )}
            {conteoTipos.anulados > 0 && (
              <button type="button" className={`mov-chip${verAnulados ? " is-activa" : ""}`} aria-pressed={verAnulados} onClick={conFiltro(() => setVerAnulados((v) => !v))}>
                Ver anulados <span className="mov-num">{conteoTipos.anulados.toLocaleString("es-AR")}</span>
              </button>
            )}
          </div>

          <p className="mov-resumen">
            {resumen.renglones > 0 ? (
              <>
                {verPrecios && <>
                  Retirado: <b className="mov-num">{fmtPesos(resumen.valor)}</b> sin IVA
                  {resumen.sinCosto > 0 && <> · {plural(resumen.sinCosto, "renglón sin precio", "renglones sin precio")}</>}
                  {" · "}
                </>}
                {plural(resumen.renglones, "renglón", "renglones")} de {plural(resumen.personas, "persona", "personas")}
              </>
            ) : (
              <>{plural(visibles.length, "movimiento", "movimientos")}</>
            )}
            {sedeFiltro === "todas" ? " · las dos sedes" : ` · ${sedeFiltro}`}
            {actualizando && <span className="mov-dim"> · actualizando…</span>}
          </p>
          {carga.error && !actualizando && (
            <p className="mov-aviso is-error" role="alert">No se pudo actualizar: {carga.error.message || String(carga.error)}. Lo que ves es de la última consulta.</p>
          )}
          {carga.recortado && (
            <p className="mov-aviso">Se trajeron los últimos {TOPE_FILAS.toLocaleString("es-AR")} movimientos del período. Achicá el rango para ver el resto.</p>
          )}

          {!visibles.length ? (
            <EmptyState
              icon={History}
              title={entradas.length ? "Nada coincide con el filtro" : "Todavía no hay movimientos en este período"}
              subtitle={entradas.length ? "Probá con otro tipo, otra búsqueda o mirá los anulados." : "Cuando el mostrador, las solicitudes o los conteos registren algo, aparece acá al toque."}
            />
          ) : (
            <div className="mov-dias">
              {dias.map((d) => (
                <section key={d.dia} className="mov-dia" aria-label={tituloDia(d.dia)}>
                  <header className="mov-dia-cab">
                    <h3>{tituloDia(d.dia)}</h3>
                    <span>
                      {plural(d.entradas.length, "movimiento", "movimientos")}
                      {verPrecios && d.retiros.renglones > 0 && <> · <b className="mov-num">{fmtPesos(d.retiros.valor)}</b> retirado</>}
                    </span>
                  </header>
                  <div className="mov-tabla">
                    <div className="mov-fila is-cab" aria-hidden="true">
                      <span>Hora</span>
                      <span>Tipo</span>
                      <span>Producto</span>
                      <span className="is-num">Cantidad</span>
                      <span>Quién</span>
                      <span>Obra o sector</span>
                      <span>Origen</span>
                      <span className="is-num">{verPrecios ? "Valor" : ""}</span>
                    </div>
                    {d.entradas.map((e) => <Fila key={e.clave} e={e} onAbrir={() => setSelClave(e.clave)} />)}
                  </div>
                </section>
              ))}
              {visibles.length > limite && (
                <button type="button" className="ui-btn mov-mas" onClick={() => setLimite((n) => n + PASO_LISTA)}>
                  Ver {Math.min(PASO_LISTA, visibles.length - limite).toLocaleString("es-AR")} más (quedan {(visibles.length - limite).toLocaleString("es-AR")})
                </button>
              )}
            </div>
          )}
        </>
      )}

      {sel && (
        <Detalle
          key={sel.clave}
          e={sel}
          onCerrar={() => setSelClave(null)}
          irA={irA}
          onAnulado={() => {
            setSelClave(null);
            setRecarga((n) => n + 1);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function Fila({ e, onAbrir }) {
  const verPrecios = useVerPrecios();
  const destino = destinoTexto(e);
  const quien = e.persona || (e.registro ? `${e.registro}` : null);
  const cantidad = cantidadTexto(e, fmtCantidad);
  return (
    <button type="button" className={`mov-fila${e.anulado ? " is-anulado" : ""}`} onClick={onAbrir}>
      <span className="c-hora mov-num">{hora(e.createdAt)}</span>
      <span className="c-tipo">
        <span className="mov-tag" data-tono={TONO[e.tipo] || "azul"}>{ETIQUETA_TIPO[e.tipo] ?? e.tipo}</span>
      </span>
      <span className="c-prod">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><FotoConsumible item={e} /><span className="mov-prod">{e.descripcion}</span></span>
        <span className="mov-meta">
          {e.codigo && <span className="mov-num">{e.codigo}</span>}
          {e.preConteo && <span className="mov-tag" data-tono="gris">Antes del conteo</span>}
          {e.externo && <span className="mov-tag" data-tono="teal">Externo · {e.empresa}</span>}
          {e.fueraCupo && <span className="mov-tag" data-tono="rojo">Fuera de cupo</span>}
          {e.anulado && <span className="mov-anulado">Anulado{e.motivoAnulacion ? `: ${e.motivoAnulacion}` : ""}</span>}
        </span>
      </span>
      <span className={`c-cant is-num mov-num${e.cantidad > 0 && e.tipo !== "inventario" ? " is-suma" : ""}`}>
        {cantidad} <small>{unidadEnTexto(e.unidad, e.tipo === "inventario" ? e.contado : Math.abs(e.cantidad))}</small>
      </span>
      <span className="c-quien">{quien || <span className="mov-dim">—</span>}</span>
      <span className="c-destino">{destino || <span className="mov-dim">—</span>}</span>
      <span className="c-origen">{origenTexto(e)}</span>
      <span className="c-valor is-num mov-num">
        {verPrecios && (e.tipo === "retiro" || e.tipo === "ingreso") ? (e.sinCosto && !e.valor ? <span className="mov-dim">sin precio</span> : fmtPesos(e.valor)) : ""}
      </span>
    </button>
  );
}

function Detalle({ e, onCerrar, irA, onAnulado, toast }) {
  const verPrecios = useVerPrecios();
  const [anulando, setAnulando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [editando, setEditando] = useState(false);
  const corregible = e.tipo === "retiro" || e.tipo === "devolucion";
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const deSolicitud = e.origen === "solicitud" || !!e.solicitudId;
  const unidad = (n) => unidadEnTexto(e.unidad, n);

  const confirmar = async () => {
    if (!motivo.trim() || enviando) return;
    setEnviando(true);
    try {
      for (const f of e.activas) await anularMovimiento(f.id, motivo);
      toast.success(e.preConteo ? "Movimiento anulado." : "Movimiento anulado. El stock ya se corrigió.");
      onAnulado();
    } catch (err) {
      toast.error(`No se pudo anular: ${err.message || err}`);
      setEnviando(false);
    }
  };

  const filas = [
    ["Cuándo", fechaHora(e.createdAt)],
    ["Sede", e.sede],
    e.tipo === "inventario"
      ? ["Contó", `${fmtCantidad(e.contado)} ${unidad(e.contado)}${e.teorico == null ? " · conteo inicial" : ` · el sistema decía ${fmtCantidad(e.teorico)} (${e.cantidad > 0 ? "+" : ""}${fmtCantidad(e.cantidad)})`}`]
      : ["Cantidad", `${cantidadTexto(e, fmtCantidad)} ${unidad(Math.abs(e.cantidad))}${e.gramos ? ` · ${fmtCantidad(e.gramos)} g en la balanza` : ""}`],
    e.persona ? [e.tipo === "devolucion" ? "Devolvió" : "Retiró", `${e.persona}${e.metodoFirma && FIRMA[e.metodoFirma] ? ` · ${FIRMA[e.metodoFirma]}` : ""}`] : null,
    e.externo ? ["Externo", `${e.empresa}${e.autorizadoPor ? ` · autorizó ${e.autorizadoPor}` : " · sin autorización registrada"}`] : null,
    e.obras.length > 4
      ? ["Repartido", `Entre ${e.obras.length} obras: ${e.reparto.slice(0, 4).map((r) => `${r.obra || "sin obra"} ${fmtCantidad(r.cantidad)}`).join(" · ")} y ${e.obras.length - 4} más`]
      : e.obras.length > 1 ? ["Repartido", e.reparto.map((r) => `${r.obra || "sin obra"}: ${fmtCantidad(r.cantidad)}`).join(" · ")] : null,
    e.obras.length === 1 ? ["Obra", e.obras[0]] : null,
    e.sector ? ["Sector", e.sector] : null,
    ["Origen", origenTexto(e)],
    !verPrecios ? null
    : e.costoUnitario != null && (e.tipo === "retiro" || e.tipo === "ingreso")
      ? ["Valor", `${fmtPesos(e.valor)} sin IVA · ${fmtPesos(e.costoUnitario)} por ${e.unidad}`]
      : (e.tipo === "retiro" || e.tipo === "ingreso") ? ["Valor", "Sin precio registrado"] : null,
    e.fueraCupo ? ["Fuera de cupo", e.autorizadoPor ? `Autorizó ${e.autorizadoPor}` : "Sin autorización registrada"] : null,
    e.canje ? ["Canje", e.canje === "trajo_usado" ? "Trajo el usado" : "Sin el usado"] : null,
    // El espejo de solicitudes deja "Solicitud N° …" como nota: ya está en Origen.
    e.nota && e.nota !== origenTexto(e) ? ["Nota", e.nota] : null,
    e.registro ? ["Cargó", e.registro] : null,
  ].filter(Boolean);

  return (
    <Hoja
      abierta
      lateral
      clase="mov"
      ancho={editando ? 600 : 480}
      titulo={e.descripcion}
      sub={[ETIQUETA_TIPO[e.tipo], e.codigo].filter(Boolean).join(" · ")}
      onCerrar={enviando ? undefined : onCerrar}
    >
      <div className="mov-detalle">
        <FotoConsumible item={e} size={72} />
        {e.preConteo && (
          <p className="mov-nota-pre">
            Salió antes del primer conteo de este producto en {e.sede}. Queda registrado y cuenta como consumo, pero no descuenta del stock: el stock arranca con el conteo.
          </p>
        )}
        {!e.anulado && !deSolicitud && e.obras.length > 4 && (
          <p className="mov-nota-anulado">Quedó repartido entre {e.obras.length} obras. Si era para una sola, corregí la obra: se junta en un renglón con la misma hora y persona.</p>
        )}
        {e.anulado && (
          <p className="mov-nota-anulado">Anulado{e.anuladoAt ? ` el ${fechaHora(e.anuladoAt)}` : ""}{e.motivoAnulacion ? `: ${e.motivoAnulacion}` : ""}.</p>
        )}
        <dl className="mov-datos">
          {filas.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>

        {!e.anulado && (deSolicitud ? (
          <div className="mov-accion">
            <p className="mov-dim">Lo entregado por una solicitud se corrige desde la solicitud (deshacer la entrega), así queda igual en los dos lados.</p>
            {irA && (
              <button type="button" className="ui-btn" onClick={() => irA("solicitudes")}>
                Corregir desde la solicitud <ArrowRight size={15} />
              </button>
            )}
          </div>
        ) : editando ? (
          <EditarMovimiento fila={e.activas[0]} toast={toast} onListo={onAnulado} onCancelar={() => setEditando(false)} onOcupado={setEnviando} />
        ) : corrigiendo ? (
          <CorregirDestino e={e} toast={toast} onListo={onAnulado} onCancelar={() => setCorrigiendo(false)} />
        ) : anulando ? (
          <div className="mov-accion">
            <input
              className="ui-input"
              value={motivo}
              autoFocus
              maxLength={200}
              placeholder="¿Por qué se anula? Ej.: se cargó dos veces"
              onChange={(ev) => setMotivo(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter") confirmar(); }}
              aria-label="Motivo de la anulación"
            />
            <div className="mov-accion-btns">
              <button type="button" className="ui-btn" onClick={() => { setAnulando(false); setMotivo(""); }} disabled={enviando}>Cancelar</button>
              <button type="button" className="ui-btn ui-btn-peligro" onClick={confirmar} disabled={enviando || !motivo.trim()}>
                {enviando ? "Anulando…" : e.activas.length > 1 ? `Anular las ${e.activas.length} filas` : "Anular"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mov-accion">
            <div className="mov-accion-btns is-izq">
              {corregible && (
                <button type="button" className="ui-btn ui-btn-primario" onClick={() => setEditando(true)}>
                  <Pencil size={15} /> Editar cantidades o agregar productos
                </button>
              )}
              {corregible && (
                <button type="button" className="ui-btn" onClick={() => setCorrigiendo(true)}>
                  <MapPin size={15} /> Corregir obra o sector
                </button>
              )}
              <button type="button" className="ui-btn ui-btn-fantasma mov-anular" onClick={() => setAnulando(true)}>
                <Ban size={15} /> Anular este movimiento
              </button>
            </div>
            <p className="mov-dim">El registro no se borra: queda tachado con el motivo. Si hacía falta, se vuelve a cargar bien.</p>
          </div>
        ))}
      </div>
    </Hoja>
  );
}

/**
 * Corregir la obra o el sector: la base anula los renglones de este producto
 * y lo vuelve a cargar en uno, con la misma persona, hora y costo.
 */
function CorregirDestino({ e, toast, onListo, onCancelar }) {
  const [obras, setObras] = useState(null);
  const [obraId, setObraId] = useState("");
  const [sector, setSector] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchObrasActivas().then((o) => { if (vivo) setObras(o); }, () => { if (vivo) setObras([]); });
    return () => { vivo = false; };
  }, []);

  const guardar = async () => {
    if (enviando || (!obraId && !sector)) return;
    setEnviando(true);
    try {
      const r = await corregirDestino({ ids: e.activas.map((f) => f.id), obraId: obraId || null, sector: obraId ? null : sector, motivo: "Destino corregido" });
      toast.success(`Listo: pasa a ${r?.ahora ?? "el nuevo destino"}.`);
      onListo();
    } catch (err) {
      toast.error(`No se pudo corregir: ${err.message || err}`);
      setEnviando(false);
    }
  };

  return (
    <div className="mov-accion">
      <label className="mov-campo">
        <span>Obra</span>
        <select className="ui-input" value={obraId} onChange={(ev) => { setObraId(ev.target.value); if (ev.target.value) setSector(""); }} disabled={!obras}>
          <option value="">{obras ? "Elegí la obra" : "Trayendo obras…"}</option>
          {(obras ?? []).map((o) => <option key={o.id} value={o.id}>{o.codigo}{o.descripcion ? ` · ${o.descripcion}` : ""}</option>)}
        </select>
      </label>
      <label className="mov-campo">
        <span>O un sector, sin obra</span>
        <select className="ui-input" value={sector} onChange={(ev) => { setSector(ev.target.value); if (ev.target.value) setObraId(""); }}>
          <option value="">Elegí el sector</option>
          {SECTORES.filter((s) => s !== "Otro").map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <div className="mov-accion-btns">
        <button type="button" className="ui-btn" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primario" onClick={guardar} disabled={enviando || (!obraId && !sector)}>
          {enviando ? "Corrigiendo…" : "Corregir"}
        </button>
      </div>
      <p className="mov-dim">{e.activas.length > 1 ? `Los ${e.activas.length} renglones quedan anulados y se cargan en uno solo.` : "El renglón queda anulado y se vuelve a cargar con el destino nuevo."} Misma persona, hora y valor.</p>
    </div>
  );
}

const CSS = `
  .mov { font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
  .mov .mov-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .mov .mov-dim { color: var(--dim); }
  .mov .is-num { text-align: right; justify-content: flex-end; }
  .mov .mov-girando { animation: mov-giro .8s linear infinite; }
  @keyframes mov-giro { to { transform: rotate(360deg); } }

  .mov.mov-root { max-width: 1500px; margin: 0 auto; padding: 14px 20px 40px; display: flex; flex-direction: column; gap: 12px; }
  .mov .mov-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; }
  .mov .mov-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .mov .mov-seg button { flex-shrink: 0; min-height: 36px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; white-space: nowrap; }
  .mov .mov-seg button[aria-pressed="true"] { background: var(--blue-soft); color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue-border); font-weight: 600; }
  .mov .mov-sede { width: auto; min-width: 150px; }
  .mov .mov-buscar { position: relative; flex: 1 1 260px; min-width: 0; max-width: 460px; display: block; }
  .mov .mov-buscar > svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .mov .mov-buscar .ui-input { padding-left: 34px; padding-right: 34px; }
  .mov .mov-buscar .ui-input::-webkit-search-cancel-button { display: none; }
  .mov .mov-buscar-x { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--dim); border-radius: 8px; }
  .mov .mov-barra-der { margin-left: auto; display: flex; gap: 8px; }
  .mov .mov-rango { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 220px)); gap: 12px; }
  .mov .mov-rango label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }

  .mov .mov-aviso { margin: 0; padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; background: var(--violet-soft); border: 1px solid var(--violet-border); border-radius: 12px; font-size: 13px; line-height: 1.5; }
  .mov .mov-aviso.is-error { background: var(--red-soft); border-color: var(--red-border); }

  .mov .mov-chips { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .mov .mov-chips::-webkit-scrollbar { display: none; }
  .mov .mov-chips-sep { flex: none; width: 1px; height: 22px; background: var(--border-2); margin: 0 4px; }
  .mov .mov-chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel); color: var(--muted); font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; }
  .mov .mov-chip .mov-num { font-size: 11.5px; color: var(--dim); }
  .mov .mov-chip.is-activa { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); font-weight: 600; }
  .mov .mov-chip.is-activa .mov-num { color: var(--blue); }
  .mov .mov-chip.is-pre.is-activa { background: var(--violet-soft); border-color: var(--violet-border); color: var(--violet); }
  .mov .mov-chip.is-pre.is-activa .mov-num { color: var(--violet); }
  .mov .mov-chip.is-externo.is-activa { background: var(--teal-soft); border-color: var(--teal-border); color: var(--teal); }
  .mov .mov-chip.is-externo.is-activa .mov-num { color: var(--teal); }
  .mov .mov-resumen { margin: 0; font-size: 13px; color: var(--muted); }
  .mov .mov-resumen b { color: var(--text); font-weight: 600; }

  .mov .mov-dias { display: flex; flex-direction: column; gap: 16px; }
  .mov .mov-dia-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 0 4px 6px; }
  .mov .mov-dia-cab h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .mov .mov-dia-cab span { font-size: 12.5px; color: var(--dim); }
  .mov .mov-dia-cab b { color: var(--muted); font-weight: 600; }
  .mov .mov-tabla { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--panel-solid); overflow: hidden; }
  .mov .mov-fila {
    width: 100%; display: grid; align-items: center; column-gap: 12px;
    grid-template-columns: 52px 92px minmax(200px, 1fr) 120px 150px 130px 140px 96px;
    min-height: 50px; padding: 6px 14px; border: 0; border-bottom: 1px solid var(--border);
    background: transparent; color: var(--text); font: inherit; font-size: 13.5px; text-align: left;
  }
  .mov .mov-fila:last-child { border-bottom: 0; }
  .mov button.mov-fila { cursor: pointer; }
  .mov button.mov-fila:hover { background: var(--panel); }
  .mov .mov-fila.is-cab { min-height: 36px; background: var(--panel-solid-2); color: var(--dim); font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .mov .mov-fila > span { min-width: 0; }
  .mov .mov-fila.is-anulado .c-prod .mov-prod, .mov .mov-fila.is-anulado .c-cant, .mov .mov-fila.is-anulado .c-valor { text-decoration: line-through; color: var(--dim); }
  .mov .c-hora { font-size: 12.5px; color: var(--dim); }
  .mov .c-prod { display: flex; flex-direction: column; gap: 3px; }
  .mov .mov-prod { font-weight: 500; line-height: 1.25; overflow-wrap: anywhere; }
  .mov .mov-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--dim); }
  .mov .c-cant { font-weight: 600; font-size: 14px; }
  .mov .c-cant small { font-family: 'Outfit', system-ui, sans-serif; font-weight: 400; font-size: 11.5px; color: var(--dim); }
  .mov .c-cant.is-suma { color: var(--green); }
  .mov .c-quien, .mov .c-destino, .mov .c-origen { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mov .c-origen { color: var(--muted); font-size: 13px; }
  .mov .c-valor { font-size: 13px; }
  .mov .mov-anulado { color: var(--red); font-size: 12px; }
  .mov .mov-tag { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border: 1px solid var(--blue-border); border-radius: 999px; background: var(--blue-soft); color: var(--blue); font-family: 'Outfit', system-ui, sans-serif; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .mov .mov-tag[data-tono="violeta"] { border-color: var(--violet-border); background: var(--violet-soft); color: var(--violet); }
  .mov .mov-tag[data-tono="verde"] { border-color: var(--green-border); background: var(--green-soft); color: var(--green); }
  .mov .mov-tag[data-tono="teal"] { border-color: var(--teal-border); background: var(--teal-soft); color: var(--teal); }
  .mov .mov-tag[data-tono="rojo"] { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }
  .mov .mov-tag[data-tono="gris"] { border-color: var(--border-2); background: var(--panel-2); color: var(--muted); font-weight: 500; min-height: 20px; }
  .mov .mov-mas { align-self: center; }

  .mov .mov-detalle { display: flex; flex-direction: column; gap: 14px; }
  .mov .mov-nota-pre { margin: 0; padding: 10px 12px; border: 1px solid var(--violet-border); border-radius: 10px; background: var(--violet-soft); font-size: 13px; line-height: 1.5; }
  .mov .mov-nota-anulado { margin: 0; padding: 10px 12px; border: 1px solid var(--red-border); border-radius: 10px; background: var(--red-soft); font-size: 13px; line-height: 1.5; }
  .mov .mov-datos { margin: 0; display: flex; flex-direction: column; }
  .mov .mov-datos > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
  .mov .mov-datos dt { font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--dim); padding-top: 2px; }
  .mov .mov-datos dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  .mov .mov-accion { display: flex; flex-direction: column; gap: 8px; }
  .mov .mov-accion p { margin: 0; font-size: 12.5px; line-height: 1.5; }
  .mov .mov-accion-btns { display: flex; justify-content: flex-end; gap: 8px; }
  .mov .mov-anular { align-self: flex-start; color: var(--red); }
  .mov .mov-accion-btns.is-izq { justify-content: flex-start; flex-wrap: wrap; }
  .mov .mov-campo { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }

  @media (max-width: 1099px) {
    .mov .mov-fila { grid-template-columns: 52px 92px minmax(180px, 1fr) 110px 140px 120px 90px; }
    .mov .mov-fila > .c-origen { display: none; }
  }
  @media (max-width: 799px) {
    .mov.mov-root { padding: 12px 16px 32px; }
    .mov .mov-barra { padding: 10px; }
    .mov .mov-seg { width: 100%; }
    .mov .mov-seg button { flex: 1; }
    .mov .mov-sede { flex: 1 1 140px; }
    .mov .mov-buscar { flex-basis: 100%; max-width: none; order: 5; }
    .mov .mov-rango { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mov .mov-tabla { border: 0; background: transparent; overflow: visible; display: flex; flex-direction: column; gap: 8px; }
    .mov .mov-fila.is-cab { display: none; }
    .mov .mov-fila {
      grid-template-columns: auto auto minmax(0, 1fr);
      grid-template-areas: "tipo hora cant" "prod prod prod" "quien quien valor" "destino destino destino";
      row-gap: 6px; column-gap: 8px; padding: 10px 12px;
      border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid);
    }
    .mov .mov-fila:last-child { border-bottom: 1px solid var(--border); }
    .mov .mov-fila > .c-tipo { grid-area: tipo; }
    .mov .mov-fila > .c-hora { grid-area: hora; }
    .mov .mov-fila > .c-cant { grid-area: cant; }
    .mov .mov-fila > .c-prod { grid-area: prod; }
    .mov .mov-fila > .c-quien { grid-area: quien; font-size: 13px; color: var(--muted); }
    .mov .mov-fila > .c-valor { grid-area: valor; }
    .mov .mov-fila > .c-destino { grid-area: destino; font-size: 12.5px; color: var(--dim); }
    .mov .mov-fila > .c-destino:has(.mov-dim) { display: none; }
    .mov .mov-datos > div { grid-template-columns: 96px minmax(0, 1fr); }
  }
`;
