import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCircle2, ClipboardList, MapPin, RefreshCw, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { buildProductGroups, fmtQty, rowSede } from "@/features/panol/stockGrupos";
import {
  CONTEO_CLASES, CONTEO_TOTAL, elegirConteoDelDia, exactitud, explicarConteo, fechaLocal, ordenRecorrido, teoricoEnSede,
} from "@/features/panol/conteo/conteoDiario";
import {
  ConteoSinMigracion, crearLoteConteo, fetchConteoLote, fetchConteosAbiertos, fetchConteosRecientes,
  fetchLedgerMaterial, fetchNombres, fetchUltimosConteos, marcarAjustesAnulados, registrarConteo, resolverConteo,
} from "@/features/panol/conteo/conteoApi";
import { Chip, EstadoChip } from "@/features/panol/conteo/conteoPiezas";
import { TONOS, fechaCorta, fechaLarga, hora, primerNombre } from "@/features/panol/conteo/conteoFormato";
import HistorialConteo from "@/features/panol/conteo/HistorialConteo";

const SEDES = ["Chubut", "Pampa"];
const ABIERTOS = ["pendiente", "recontar", "revisar"];

/** Quién lo contó y a qué hora, para la fila. */
function quienTexto(item, nombres) {
  const partes = [];
  if (item.contado_at) partes.push(`${primerNombre(nombres, item.contado_por)} ${hora(item.contado_at)}`);
  if (item.recontado_at) partes.push(`2.º ${primerNombre(nombres, item.recontado_por)} ${hora(item.recontado_at)}`);
  return partes.join(" · ");
}

function ItemFila({ item, activo, onOpen, nombres, mostrarFecha = false }) {
  const m = item.material || {};
  const quien = quienTexto(item, nombres);
  return (
    <button type="button" className={`conteo-fila${activo ? " is-activa" : ""}`} onClick={() => onOpen(item)}>
      <MaterialThumb material={{ imagen_url: m.imagen_url, descripcion: m.descripcion }} size={40} />
      <span className="conteo-fila-texto">
        <span className="conteo-fila-nombre">{m.descripcion || "Material"}</span>
        <span className="conteo-fila-meta">
          <span className="conteo-ubic"><MapPin size={11} /> {m.ubicacion || "sin ubicación"}</span>
          {m.codigo && <span className="conteo-mono">{m.codigo}</span>}
          {item.estado === "pendiente" && <span>{item.motivo || CONTEO_CLASES[item.clase]}</span>}
          {mostrarFecha && item.lote?.fecha && <span>del {fechaCorta(item.lote.fecha)}</span>}
          {quien && <span className="conteo-quien">{quien}</span>}
        </span>
      </span>
      {item.ajuste_anulado ? <Chip tono="red">Ajuste anulado</Chip> : <EstadoChip estado={item.estado} />}
    </button>
  );
}

function PanelContar({ item, sede, uid, nombres, puedeContar, puedeResolver, siguiente, onSiguiente, onAbrirProducto, onClose, onDone, toast }) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [sistema, setSistema] = useState(null);
  const inputRef = useRef(null);
  const siguienteRef = useRef(null);
  const m = item.material || {};
  const unidad = item.unidad || m.unidad_medida || "unidad";
  const esRecuento = item.estado === "recontar";
  const yaContoEste = esRecuento && item.contado_por === uid;
  const abierto = item.estado === "pendiente" || (esRecuento && !yaContoEste);
  const aRevisar = item.estado === "revisar" || (esRecuento && puedeResolver);
  const explicar = (renglon) => {
    const { texto, tono } = explicarConteo(renglon, {
      nombre: (id) => primerNombre(nombres, id),
      verNumeros: puedeResolver || renglon.estado !== "recontar",
    });
    // Que nadie "corrija" a mano un ajuste que ya se hizo solo.
    const extra = renglon.estado === "ajustado" && !renglon.ajuste_anulado ? " El stock ya quedó corregido: no hace falta anular ni cargar nada." : "";
    return { texto: texto + extra, tono };
  };

  useEffect(() => {
    setValor(""); setNota(""); setResultado(null); setSistema(null);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [item.id]);

  // Con el resultado a la vista, Enter pasa al siguiente.
  useEffect(() => {
    if (resultado) siguienteRef.current?.focus();
  }, [resultado]);

  // Compras sí ve el número del sistema: para resolver hay que compararlo.
  useEffect(() => {
    if (!aRevisar || !puedeResolver) return undefined;
    let vivo = true;
    fetchLedgerMaterial(item.material_id)
      .then((rows) => { if (vivo) setSistema(teoricoEnSede(rows, item.material_id, sede)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [aRevisar, item.material_id, puedeResolver, sede]);

  async function confirmar(event) {
    event?.preventDefault();
    const contado = Number(String(valor).replace(",", "."));
    if (valor === "" || !Number.isFinite(contado) || contado < 0) {
      toast?.error?.("Cargá cuántos hay. Si no hay ninguno, poné 0.");
      return;
    }
    setEnviando(true);
    try {
      const rows = await fetchLedgerMaterial(item.material_id);
      const { total, libre } = teoricoEnSede(rows, item.material_id, sede);
      const nuevo = await registrarConteo(item.id, { contado, teorico: total, libre, nota: nota || null });
      setResultado(explicar(nuevo));
      onDone(nuevo);
    } catch (error) {
      toast?.error?.(error.message || "No se pudo guardar el conteo.");
    } finally {
      setEnviando(false);
    }
  }

  async function resolver(aplicar) {
    setEnviando(true);
    try {
      const rows = await fetchLedgerMaterial(item.material_id);
      const { total } = teoricoEnSede(rows, item.material_id, sede);
      const cantidad = item.recontado ?? item.contado;
      const nuevo = await resolverConteo(item.id, { aplicar, cantidad, teorico: total, nota: nota || null });
      toast?.success?.(aplicar ? `Ajuste aplicado: quedan ${fmtQty(cantidad)} ${unidad}.` : "Diferencia descartada.");
      onDone(nuevo);
    } catch (error) {
      toast?.error?.(error.message || "No se pudo resolver.");
    } finally {
      setEnviando(false);
    }
  }

  const botonSiguiente = siguiente ? (
    <button ref={siguienteRef} type="button" className="ui-btn ui-btn-primario conteo-siguiente" onClick={onSiguiente}>
      <span className="conteo-siguiente-texto">
        <span>Siguiente</span>
        <b>{siguiente.material?.descripcion || "Material"}</b>
      </span>
      <span className="conteo-siguiente-ubic">{siguiente.material?.ubicacion || ""}</span>
      <ArrowRight size={16} />
    </button>
  ) : null;

  return (
    <div className="conteo-panel">
      <div className="conteo-panel-top">
        <span className="conteo-eyebrow">{esRecuento ? "Segundo conteo" : CONTEO_CLASES[item.clase]}</span>
        <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div className="conteo-panel-producto">
        <MaterialThumb material={{ imagen_url: m.imagen_url, descripcion: m.descripcion }} size={72} />
        <div style={{ minWidth: 0 }}>
          <div className="conteo-panel-nombre">{m.descripcion}</div>
          <div className="conteo-fila-meta">
            {m.codigo && <span className="conteo-mono">{m.codigo}</span>}
            <span className="conteo-ubic"><MapPin size={11} /> {m.ubicacion || "sin ubicación"}{m.ubicacion_obs ? ` · ${m.ubicacion_obs}` : ""}</span>
          </div>
          {item.motivo && <div className="conteo-dim" style={{ marginTop: 4 }}>{item.motivo}</div>}
        </div>
      </div>

      {resultado ? (
        <>
          <div className="conteo-resultado" style={{ background: TONOS[resultado.tono][1], borderColor: TONOS[resultado.tono][2] }}>
            <CheckCircle2 size={18} style={{ color: TONOS[resultado.tono][0], flex: "0 0 auto" }} /> <span>{resultado.texto}</span>
          </div>
          {botonSiguiente || <div className="conteo-dim">No queda nada más por contar hoy. ¡Gracias!</div>}
        </>
      ) : abierto && puedeContar ? (
        <form onSubmit={confirmar} className="conteo-form">
          {esRecuento && <div className="conteo-aviso">El primer conteo no coincidió con el sistema. Contalo de nuevo desde cero.</div>}
          <label htmlFor={`conteo-${item.id}`} className="conteo-label">¿Cuántos hay en {sede}? <span className="conteo-dim">Contá todo, también lo separado para obras.</span></label>
          <div className="conteo-input-fila">
            <input
              ref={inputRef}
              id={`conteo-${item.id}`}
              className="ui-input conteo-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
            />
            <span className="conteo-unidad">{unidad}</span>
          </div>
          <input className="ui-input" type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): dónde estaba, qué viste…" />
          <div className="conteo-botones">
            <button type="button" className="ui-btn" onClick={() => { setValor("0"); inputRef.current?.focus(); }} disabled={enviando}>No hay ninguno</button>
            <button type="submit" className="ui-btn ui-btn-primario" disabled={enviando || valor === ""}>{enviando ? "Guardando…" : "Confirmar"}</button>
          </div>
        </form>
      ) : yaContoEste ? (
        <>
          <div className="conteo-aviso">Ya lo contaste vos. El segundo conteo lo tiene que hacer otra persona.</div>
          {botonSiguiente}
        </>
      ) : abierto && !puedeContar ? (
        <div className="conteo-dim">Todavía no se contó. Lo cuenta el pañol.</div>
      ) : (
        <div className="conteo-explicacion" style={{ borderColor: TONOS[explicar(item).tono][0] }}>{explicar(item).texto}</div>
      )}

      {item.contado_at && !abierto && onAbrirProducto && (
        <button type="button" className="ui-btn ui-btn-fantasma conteo-ver" onClick={() => onAbrirProducto(item.material_id)}>
          Ver el producto y sus movimientos <ArrowUpRight size={14} />
        </button>
      )}

      {aRevisar && puedeResolver && !resultado && (
        <div className="conteo-revision">
          <div className="conteo-eyebrow">Para Compras</div>
          <div className="conteo-numeros">
            <span>Sistema ahora<b className="conteo-mono">{sistema ? fmtQty(sistema.total) : "…"}</b></span>
            <span>Libre<b className="conteo-mono">{sistema ? fmtQty(sistema.libre) : "…"}</b></span>
            <span>1.er conteo<b className="conteo-mono">{item.contado == null ? "—" : fmtQty(item.contado)}</b></span>
            <span>2.º conteo<b className="conteo-mono">{item.recontado == null ? "—" : fmtQty(item.recontado)}</b></span>
          </div>
          {item.nota && <div className="conteo-dim">Nota: {item.nota}</div>}
          <div className="conteo-botones">
            <button type="button" className="ui-btn" onClick={() => resolver(false)} disabled={enviando}>Descartar</button>
            <button type="button" className="ui-btn ui-btn-suave" onClick={() => resolver(true)} disabled={enviando || (item.recontado ?? item.contado) == null}>
              Dejar en {fmtQty(item.recontado ?? item.contado ?? 0)} {unidad}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seccion({ titulo, detalle, children }) {
  return (
    <section className="conteo-seccion">
      {titulo && (
        <div className="conteo-seccion-titulo">
          <span>{titulo}</span>
          {detalle && <span className="conteo-seccion-detalle">{detalle}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export default function ConteoDiarioPanel({ rows = [], sedeLocked = null, profile, isMobile = false, toast, onStockChange, vista: vistaUrl = null, onVista = null, onAbrirProducto = null }) {
  const role = profile?.role;
  const uid = profile?.id;
  // Igual que la base: can_registrar_conteo_fisico (incluye compras vía
  // is_panol_manager) y panol_conteo_puede_resolver.
  const puedeContar = !!profile?.is_admin || ["admin", "panol", "tecnica", "oficina", "compras"].includes(role);
  const puedeResolver = !!profile?.is_admin || ["admin", "oficina", "compras"].includes(role);
  const [sede, setSede] = useState(sedeLocked || "Chubut");
  // La vista va en la URL cuando la pantalla la maneja: así "Ver producto" y
  // volver atrás deja el historial abierto.
  const [vistaLocal, setVistaLocal] = useState("hoy");
  const vista = vistaUrl || vistaLocal;
  const setVista = (v) => (onVista ? onVista(v) : setVistaLocal(v));
  const fecha = fechaLocal();
  const [lote, setLote] = useState(null);
  const [abiertos, setAbiertos] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [nombres, setNombres] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [armando, setArmando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => { if (sedeLocked) setSede(sedeLocked); }, [sedeLocked]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [l, a0, r] = await Promise.all([fetchConteoLote(sede, fecha), fetchConteosAbiertos(sede), fetchConteosRecientes(sede)]);
      const [itemsLote, a] = await Promise.all([marcarAjustesAnulados(l?.items || []), marcarAjustesAnulados(a0)]);
      setLote(l ? { ...l, items: itemsLote } : l); setAbiertos(a); setRecientes(r); setSinMigracion(false);
      const ids = [uid, ...[...itemsLote, ...a].flatMap((item) => [item.contado_por, item.recontado_por, item.resuelto_por, item.ajuste_anulado?.por])];
      fetchNombres(ids).then(setNombres).catch(() => {});
    } catch (error) {
      if (error instanceof ConteoSinMigracion) setSinMigracion(true);
      else toast?.error?.(error.message || "No se pudo cargar el conteo.");
    } finally {
      setCargando(false);
    }
  }, [fecha, sede, toast, uid]);

  useEffect(() => { cargar(); }, [cargar]);

  const gruposSede = useMemo(() => buildProductGroups(rows.filter((row) => rowSede(row) === sede)), [rows, sede]);

  async function armarLista() {
    setArmando(true);
    try {
      const ultimoConteo = await fetchUltimosConteos();
      const arrastre = abiertos
        .filter((item) => item.estado === "pendiente" && item.lote?.fecha < fecha)
        .map((item) => ({ material_id: item.material_id, fecha: item.lote.fecha }));
      const items = elegirConteoDelDia(gruposSede, { ultimoConteo, arrastre, sede, fecha });
      if (!items.length) {
        toast?.error?.(`No hay productos con stock en ${sede} para contar.`);
        return;
      }
      await crearLoteConteo(sede, fecha, items);
      await cargar();
    } catch (error) {
      toast?.error?.(error.message || "No se pudo armar la lista.");
    } finally {
      setArmando(false);
    }
  }

  function alTerminar(nuevo) {
    const fusionar = (item) => (item.id === nuevo.id ? { ...item, ...nuevo } : item);
    setLote((prev) => (prev ? { ...prev, items: prev.items.map(fusionar) } : prev));
    setAbiertos((prev) => prev.map(fusionar).filter((item) => ABIERTOS.includes(item.estado)));
    setSeleccion((prev) => (prev ? fusionar(prev) : prev));
    if (uid && !nombres.has(uid)) fetchNombres([uid]).then((m) => setNombres((prev) => new Map([...prev, ...m]))).catch(() => {});
    if (nuevo.ajuste_snapshot_id) onStockChange?.();
  }

  const items = lote?.items || [];
  const contados = items.filter((item) => item.contado_at).length;
  const deOtrosDias = abiertos.filter((item) => item.lote_id !== lote?.id);
  const porContar = ordenRecorrido(items.filter((item) => item.estado === "pendiente"));
  const recuentos = ordenRecorrido([...items, ...deOtrosDias].filter((item) => item.estado === "recontar"));
  const aRevisar = [...items, ...deOtrosDias].filter((item) => item.estado === "revisar");
  const cerradosHoy = items
    .filter((item) => !ABIERTOS.includes(item.estado))
    .sort((a, b) => String(b.recontado_at || b.contado_at || "").localeCompare(String(a.recontado_at || a.contado_at || "")));
  const stats = exactitud(recientes);
  const ultimoHoy = items.reduce((max, item) => {
    const at = item.recontado_at || item.contado_at;
    return at && (!max || at > max) ? at : max;
  }, null);
  const terminada = items.length > 0 && !porContar.length;

  // Lo que sigue en el recorrido: lo que le queda a esta persona por contar,
  // empezando después del que acaba de contar (sin volver al principio si hay más adelante).
  const cola = [...porContar, ...recuentos.filter((item) => item.contado_por !== uid)];
  const siguiente = (() => {
    if (!seleccion || !cola.length) return null;
    const resto = cola.filter((item) => item.id !== seleccion.id);
    if (!resto.length) return null;
    const recorrido = ordenRecorrido([...resto, seleccion]);
    const pos = recorrido.findIndex((item) => item.id === seleccion.id);
    return recorrido.slice(pos + 1).find((item) => item.id !== seleccion.id) || resto[0];
  })();

  const panel = seleccion && (
    <PanelContar
      key={seleccion.id}
      item={seleccion}
      sede={sede}
      uid={uid}
      puedeContar={puedeContar}
      puedeResolver={puedeResolver}
      nombres={nombres}
      siguiente={siguiente}
      onSiguiente={() => setSeleccion(siguiente)}
      onAbrirProducto={onAbrirProducto}
      onClose={() => setSeleccion(null)}
      onDone={alTerminar}
      toast={toast}
    />
  );

  const fila = (item, extra = {}) => (
    <ItemFila key={item.id} item={item} activo={seleccion?.id === item.id} onOpen={setSeleccion} nombres={nombres} {...extra} />
  );

  return (
    <div className="conteo-root">
      <style>{CONTEO_CSS}</style>
      <div className="conteo-head">
        <div>
          <div className="conteo-eyebrow">{vista === "hoy" ? `Conteo de hoy · ${fechaLarga(fecha)}` : "Conteo diario"}</div>
          <div className="conteo-titulo">
            {vista === "historial" ? `Historial · ${sede}` : lote ? `${contados} de ${items.length} contados` : "Lista del día"}
          </div>
          <div className="conteo-dim">
            {vista === "historial"
              ? "Qué días se contó, cuánto y quién."
              : terminada && ultimoHoy
                ? `Lista terminada. Último conteo a las ${hora(ultimoHoy)}.`
                : "Se cuenta a ciegas: el sistema no muestra cuántos debería haber."}
          </div>
        </div>
        <div className="conteo-head-acciones">
          <div className="ui-tabs" role="tablist" aria-label="Vista del conteo">
            {[["hoy", "Hoy"], ["historial", "Historial"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={vista === key} className={`ui-tab${vista === key ? " is-activa" : ""}`} onClick={() => { setVista(key); setSeleccion(null); }}>{label}</button>
            ))}
          </div>
          {!sedeLocked && (
            <div className="ui-tabs" role="tablist" aria-label="Sede">
              {SEDES.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={sede === s} className={`ui-tab${sede === s ? " is-activa" : ""}`} onClick={() => { setSede(s); setSeleccion(null); }}>{s}</button>
              ))}
            </div>
          )}
          {vista === "hoy" && <button type="button" className="ui-btn ui-btn-icono" onClick={cargar} disabled={cargando} aria-label="Actualizar"><RefreshCw size={15} /></button>}
        </div>
      </div>
      {vista === "hoy" && lote && items.length > 0 && <div className="conteo-progreso"><i style={{ width: `${Math.round((contados / items.length) * 100)}%` }} /></div>}

      {vista === "historial" ? (
        <HistorialConteo key={sede} sede={sede} puedeResolver={puedeResolver} toast={toast} onAbrirProducto={onAbrirProducto} />
      ) : cargando && !lote ? (
        <Cargando texto="Trayendo el conteo de hoy" />
      ) : sinMigracion ? (
        <div className="conteo-vacio">
          <ClipboardList size={22} />
          <div className="conteo-vacio-titulo">El conteo diario todavía no está instalado</div>
          <div className="conteo-dim">Falta aplicar la migración en la base. Cuando esté, esta pestaña arma la lista del día.</div>
        </div>
      ) : !lote ? (
        <div className="conteo-vacio">
          <ClipboardList size={22} />
          <div className="conteo-vacio-titulo">Todavía no se armó la lista de hoy en {sede}</div>
          <div className="conteo-dim">
            Son {CONTEO_TOTAL} productos: 3 dudosos, 7 de los más movidos, 5 intermedios y 5 de poco movimiento.
            {deOtrosDias.some((item) => item.estado === "pendiente") ? " Lo que quedó sin contar de otros días va primero." : ""}
          </div>
          {puedeContar && (
            <button type="button" className="ui-btn ui-btn-primario" onClick={armarLista} disabled={armando || !gruposSede.length}>
              {armando ? "Armando…" : "Armar la lista de hoy"}
            </button>
          )}
        </div>
      ) : (
        <div className={`conteo-cuerpo${seleccion && !isMobile ? " con-panel" : ""}`}>
          <div className="conteo-listas">
            {porContar.length > 0 && (
              <Seccion titulo={`Por contar · ${porContar.length}`} detalle="en orden de ubicación">
                {porContar.map((item) => fila(item))}
              </Seccion>
            )}
            {recuentos.length > 0 && (
              <Seccion titulo={`Segundo conteo · ${recuentos.length}`} detalle="lo cuenta otra persona">
                {recuentos.map((item) => fila(item, { mostrarFecha: item.lote_id !== lote.id }))}
              </Seccion>
            )}
            {aRevisar.length > 0 && (
              <Seccion titulo={`A revisar · ${aRevisar.length}`} detalle={puedeResolver ? "" : "lo resuelve Compras"}>
                {aRevisar.map((item) => fila(item, { mostrarFecha: item.lote_id !== lote.id }))}
              </Seccion>
            )}
            {cerradosHoy.length > 0 && (
              <Seccion titulo={`Cerrados hoy · ${cerradosHoy.length}`}>
                {cerradosHoy.map((item) => fila(item))}
              </Seccion>
            )}
            {stats && (
              <div className="conteo-dim conteo-stats">
                Últimos 30 días en {sede}: {stats.cerrados} contados · <b>{stats.porcentaje} %</b> coincidió con el sistema.{" "}
                <button type="button" className="conteo-link" onClick={() => { setVista("historial"); setSeleccion(null); }}>Ver historial</button>
              </div>
            )}
          </div>
          {panel && !isMobile && <div className="conteo-lateral">{panel}</div>}
        </div>
      )}

      {vista === "hoy" && panel && isMobile && (
        <div className="conteo-hoja" role="dialog" aria-modal="true">
          <button type="button" className="conteo-hoja-fondo" aria-label="Cerrar" onClick={() => setSeleccion(null)} />
          <div className="conteo-hoja-cuerpo">{panel}</div>
        </div>
      )}
    </div>
  );
}

const CONTEO_CSS = `
.conteo-root { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: grid; align-content: start; gap: 14px; padding: 4px 2px 24px; color: var(--text); }
.conteo-root .conteo-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
.conteo-root .conteo-head-acciones { display: flex; align-items: center; gap: 8px; }
.conteo-root .conteo-eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.conteo-root .conteo-titulo { font-size: 20px; font-weight: 650; margin: 2px 0; }
.conteo-root .conteo-dim { color: var(--dim); font-size: 12.5px; line-height: 1.45; }
.conteo-root .conteo-mono { font-family: "JetBrains Mono", monospace; font-variant-numeric: tabular-nums; }
.conteo-root .conteo-progreso { height: 6px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
.conteo-root .conteo-progreso i { display: block; height: 100%; background: var(--brand-grad, var(--blue)); border-radius: 3px; transition: width .3s; }
.conteo-root .conteo-vacio { display: grid; justify-items: start; gap: 8px; padding: 22px; border: 1px dashed var(--border-2); border-radius: 14px; background: var(--panel); max-width: 620px; color: var(--muted); }
.conteo-root .conteo-vacio-titulo { font-size: 16px; font-weight: 600; color: var(--text); }
.conteo-root .conteo-cuerpo { display: grid; gap: 14px; }
.conteo-root .conteo-cuerpo.con-panel { grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); align-items: start; }
.conteo-root .conteo-listas { display: grid; gap: 16px; min-width: 0; }
.conteo-root .conteo-seccion { display: grid; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel-solid); }
.conteo-root .conteo-seccion-titulo { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; padding: 9px 12px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); background: var(--panel); border-bottom: 1px solid var(--border); }
.conteo-root .conteo-seccion-detalle { font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 11.5px; }
.conteo-root .conteo-quien { color: var(--text); }
.conteo-root .conteo-link { border: 0; background: none; padding: 0; color: var(--blue); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.conteo-root .conteo-siguiente { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; min-height: 52px; text-align: left; }
.conteo-root .conteo-siguiente-texto { display: grid; gap: 1px; min-width: 0; }
.conteo-root .conteo-siguiente-texto span { font-size: 10.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; opacity: .8; }
.conteo-root .conteo-siguiente-texto b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conteo-root .conteo-siguiente-ubic { font-family: "JetBrains Mono", monospace; font-size: 12px; opacity: .85; }
.conteo-root .conteo-fila { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; font-family: inherit; min-height: 58px; }
.conteo-root .conteo-fila:last-child { border-bottom: 0; }
.conteo-root .conteo-fila:hover { background: var(--panel); }
.conteo-root .conteo-fila.is-activa { background: var(--blue-soft); box-shadow: inset 3px 0 0 var(--blue); }
.conteo-root .conteo-fila-texto { display: grid; gap: 3px; min-width: 0; }
.conteo-root .conteo-fila-nombre { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conteo-root .conteo-fila-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--dim); font-size: 11.5px; }
.conteo-root .conteo-fila-meta .conteo-mono { color: var(--blue); font-weight: 600; }
.conteo-root .conteo-ubic { display: inline-flex; align-items: center; gap: 3px; color: var(--muted); }
.conteo-root .conteo-chip { display: inline-flex; align-items: center; border: 1px solid; border-radius: 999px; padding: 3px 9px; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
.conteo-root .conteo-stats b { color: var(--text); font-weight: 600; }
.conteo-root .conteo-lateral { position: sticky; top: 8px; }
.conteo-root .conteo-panel { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); }
.conteo-root .conteo-panel-top { display: flex; justify-content: space-between; align-items: center; }
.conteo-root .conteo-panel-producto { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; align-items: start; }
.conteo-root .conteo-panel-nombre { font-size: 15px; font-weight: 600; line-height: 1.3; margin-bottom: 4px; }
.conteo-root .conteo-form { display: grid; gap: 10px; }
.conteo-root .conteo-label { font-size: 13px; font-weight: 600; display: grid; gap: 2px; }
.conteo-root .conteo-input-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.conteo-root .conteo-input { font-family: "JetBrains Mono", monospace; font-size: 28px; font-weight: 600; text-align: center; padding: 12px; height: auto; }
.conteo-root .conteo-unidad { color: var(--dim); font-size: 13px; }
.conteo-root .conteo-botones { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.conteo-root .conteo-botones .ui-btn { min-height: 42px; justify-content: center; }
.conteo-root .conteo-aviso { padding: 10px 12px; border-radius: 10px; background: var(--violet-soft); border: 1px solid var(--violet-border); color: var(--text); font-size: 12.5px; }
.conteo-root .conteo-resultado { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid; border-radius: 10px; font-size: 13px; font-weight: 500; line-height: 1.45; color: var(--text); }
.conteo-root .conteo-explicacion { padding: 2px 0 2px 10px; border-left: 2px solid; font-size: 13px; line-height: 1.5; color: var(--text); }
.conteo-root .conteo-ver { justify-self: start; min-height: 36px; gap: 4px; color: var(--blue); padding: 0 8px; }
.conteo-root .conteo-revision { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.conteo-root .conteo-numeros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.conteo-root .conteo-numeros span { display: grid; gap: 2px; font-size: 10.5px; color: var(--dim); }
.conteo-root .conteo-numeros b { font-size: 16px; color: var(--text); }
.conteo-root .conteo-hoja { position: fixed; inset: 0; z-index: 130; display: grid; align-items: end; }
.conteo-root .conteo-hoja-fondo { position: absolute; inset: 0; border: 0; background: var(--overlay); }
.conteo-root .conteo-hoja-cuerpo { position: relative; max-height: 92vh; overflow-y: auto; padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px)); }
.conteo-root .conteo-hoja-cuerpo .conteo-panel { border-radius: 18px 18px 14px 14px; }
@media (max-width: 640px) {
  .conteo-root { padding: 8px 12px 24px; }
  .conteo-root .conteo-numeros { grid-template-columns: repeat(2, 1fr); }
  .conteo-root .conteo-fila { grid-template-columns: 40px minmax(0, 1fr); }
  .conteo-root .conteo-fila .conteo-chip { grid-column: 2; justify-self: start; }
}
`;
