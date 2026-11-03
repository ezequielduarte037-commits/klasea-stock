import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, MapPin, RefreshCw, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { buildProductGroups, fmtQty, rowSede } from "@/features/panol/stockGrupos";
import {
  CONTEO_CLASES, CONTEO_ESTADOS, CONTEO_TOTAL, elegirConteoDelDia, exactitud, fechaLocal, teoricoEnSede,
} from "@/features/panol/conteo/conteoDiario";
import {
  ConteoSinMigracion, crearLoteConteo, fetchConteoLote, fetchConteosAbiertos, fetchConteosRecientes,
  fetchLedgerMaterial, fetchUltimosConteos, registrarConteo, resolverConteo,
} from "@/features/panol/conteo/conteoApi";

const SEDES = ["Chubut", "Pampa"];
const TONOS = {
  cyan: ["var(--cyan)", "var(--cyan-soft)", "var(--cyan-border)"],
  green: ["var(--green)", "var(--green-soft)", "var(--green-border)"],
  blue: ["var(--blue)", "var(--blue-soft)", "var(--blue-border)"],
  violet: ["var(--violet)", "var(--violet-soft)", "var(--violet-border)"],
  red: ["var(--red)", "var(--red-soft)", "var(--red-border)"],
  dim: ["var(--dim)", "var(--panel-2)", "var(--border)"],
};

function fechaLarga(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long" });
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function fechaCorta(iso) {
  return String(iso || "").split("-").reverse().slice(0, 2).join("/");
}

function EstadoChip({ estado }) {
  const meta = CONTEO_ESTADOS[estado] || CONTEO_ESTADOS.pendiente;
  const [color, bg, border] = TONOS[meta.tono];
  return <span className="conteo-chip" style={{ color, background: bg, borderColor: border }}>{meta.label}</span>;
}

function resultadoTexto(item) {
  if (item.estado === "ok") return { tono: "green", texto: "Coincide con el sistema." };
  if (item.estado === "ajustado") return { tono: "blue", texto: `Diferencia chica: se ajustó el stock ${item.ajuste > 0 ? "+" : ""}${fmtQty(item.ajuste)}.` };
  if (item.estado === "recontar") return { tono: "violet", texto: "No coincide. Lo tiene que volver a contar otra persona." };
  if (item.estado === "revisar") return { tono: "red", texto: "Los dos conteos no cierran. Queda para que lo revise administración." };
  return null;
}

function ItemFila({ item, activo, onOpen, mostrarFecha = false }) {
  const m = item.material || {};
  return (
    <button type="button" className={`conteo-fila${activo ? " is-activa" : ""}`} onClick={() => onOpen(item)}>
      <MaterialThumb material={{ imagen_url: m.imagen_url, descripcion: m.descripcion }} size={40} />
      <span className="conteo-fila-texto">
        <span className="conteo-fila-nombre">{m.descripcion || "Material"}</span>
        <span className="conteo-fila-meta">
          {m.codigo && <span className="conteo-mono">{m.codigo}</span>}
          <span className="conteo-ubic"><MapPin size={11} /> {m.ubicacion || "sin ubicación"}</span>
          <span>{item.motivo || CONTEO_CLASES[item.clase]}</span>
          {mostrarFecha && item.lote?.fecha && <span>del {fechaCorta(item.lote.fecha)}</span>}
        </span>
      </span>
      <EstadoChip estado={item.estado} />
    </button>
  );
}

function PanelContar({ item, sede, uid, puedeContar, puedeResolver, onClose, onDone, toast }) {
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [sistema, setSistema] = useState(null);
  const inputRef = useRef(null);
  const m = item.material || {};
  const unidad = item.unidad || m.unidad_medida || "unidad";
  const esRecuento = item.estado === "recontar";
  const yaContoEste = esRecuento && item.contado_por === uid;
  const abierto = item.estado === "pendiente" || (esRecuento && !yaContoEste);
  const aRevisar = item.estado === "revisar" || (esRecuento && puedeResolver);

  useEffect(() => {
    setValor(""); setNota(""); setResultado(null); setSistema(null);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [item.id]);

  // Administración sí ve el número del sistema: para resolver hay que compararlo.
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
      setResultado(resultadoTexto(nuevo));
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
        <div className="conteo-resultado" style={{ color: TONOS[resultado.tono][0], background: TONOS[resultado.tono][1], borderColor: TONOS[resultado.tono][2] }}>
          <CheckCircle2 size={18} /> {resultado.texto}
        </div>
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
        <div className="conteo-aviso">Ya lo contaste vos. El segundo conteo lo tiene que hacer otra persona.</div>
      ) : (
        <div className="conteo-dim">{resultadoTexto(item)?.texto || "Este renglón ya está cerrado."}</div>
      )}

      {aRevisar && puedeResolver && !resultado && (
        <div className="conteo-revision">
          <div className="conteo-eyebrow">Para administración</div>
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

export default function ConteoDiarioPanel({ rows = [], sedeLocked = null, profile, isMobile = false, toast, onStockChange }) {
  const role = profile?.role;
  const uid = profile?.id;
  const puedeContar = !!profile?.is_admin || ["admin", "panol", "tecnica", "oficina"].includes(role);
  const puedeResolver = !!profile?.is_admin || ["admin", "oficina"].includes(role);
  const [sede, setSede] = useState(sedeLocked || "Chubut");
  const fecha = fechaLocal();
  const [lote, setLote] = useState(null);
  const [abiertos, setAbiertos] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [armando, setArmando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => { if (sedeLocked) setSede(sedeLocked); }, [sedeLocked]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [l, a, r] = await Promise.all([fetchConteoLote(sede, fecha), fetchConteosAbiertos(sede), fetchConteosRecientes(sede)]);
      setLote(l); setAbiertos(a); setRecientes(r); setSinMigracion(false);
    } catch (error) {
      if (error instanceof ConteoSinMigracion) setSinMigracion(true);
      else toast?.error?.(error.message || "No se pudo cargar el conteo.");
    } finally {
      setCargando(false);
    }
  }, [fecha, sede, toast]);

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
    setAbiertos((prev) => prev.map(fusionar).filter((item) => ["pendiente", "recontar", "revisar"].includes(item.estado)));
    setSeleccion((prev) => (prev ? fusionar(prev) : prev));
    if (nuevo.ajuste_snapshot_id) onStockChange?.();
  }

  const items = lote?.items || [];
  const hechos = items.filter((item) => item.estado !== "pendiente").length;
  const deOtrosDias = abiertos.filter((item) => item.lote_id !== lote?.id);
  const recuentos = [...items.filter((item) => item.estado === "recontar"), ...deOtrosDias.filter((item) => item.estado === "recontar")];
  const aRevisar = [...items, ...deOtrosDias].filter((item) => item.estado === "revisar");
  const stats = exactitud(recientes);
  const porHacer = (item) => (item.estado === "pendiente" || item.estado === "recontar" ? 0 : 1);
  const pendientesPrimero = [...items].sort((a, b) => porHacer(a) - porHacer(b) || a.orden - b.orden);

  const panel = seleccion && (
    <PanelContar
      key={seleccion.id}
      item={seleccion}
      sede={sede}
      uid={uid}
      puedeContar={puedeContar}
      puedeResolver={puedeResolver}
      onClose={() => setSeleccion(null)}
      onDone={alTerminar}
      toast={toast}
    />
  );

  return (
    <div className="conteo-root">
      <style>{CONTEO_CSS}</style>
      <div className="conteo-head">
        <div>
          <div className="conteo-eyebrow">Conteo de hoy · {fechaLarga(fecha)}</div>
          <div className="conteo-titulo">{lote ? `${hechos} de ${items.length} contados` : "Lista del día"}</div>
          <div className="conteo-dim">Se cuenta a ciegas: el sistema no muestra cuántos debería haber.</div>
        </div>
        <div className="conteo-head-acciones">
          {!sedeLocked && (
            <div className="ui-tabs" role="tablist" aria-label="Sede">
              {SEDES.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={sede === s} className={`ui-tab${sede === s ? " is-activa" : ""}`} onClick={() => { setSede(s); setSeleccion(null); }}>{s}</button>
              ))}
            </div>
          )}
          <button type="button" className="ui-btn ui-btn-icono" onClick={cargar} disabled={cargando} aria-label="Actualizar"><RefreshCw size={15} /></button>
        </div>
      </div>
      {lote && items.length > 0 && <div className="conteo-progreso"><i style={{ width: `${Math.round((hechos / items.length) * 100)}%` }} /></div>}

      {cargando && !lote ? (
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
            <section className="conteo-seccion">
              {pendientesPrimero.map((item) => (
                <ItemFila key={item.id} item={item} activo={seleccion?.id === item.id} onOpen={setSeleccion} />
              ))}
            </section>
            {recuentos.filter((item) => item.lote_id !== lote.id).length > 0 && (
              <section className="conteo-seccion">
                <div className="conteo-seccion-titulo">Segundo conteo de otros días</div>
                {recuentos.filter((item) => item.lote_id !== lote.id).map((item) => (
                  <ItemFila key={item.id} item={item} activo={seleccion?.id === item.id} onOpen={setSeleccion} mostrarFecha />
                ))}
              </section>
            )}
            {aRevisar.length > 0 && (
              <section className="conteo-seccion">
                <div className="conteo-seccion-titulo">A revisar {puedeResolver ? "" : "· lo resuelve administración"}</div>
                {aRevisar.map((item) => (
                  <ItemFila key={item.id} item={item} activo={seleccion?.id === item.id} onOpen={setSeleccion} mostrarFecha />
                ))}
              </section>
            )}
            {stats && (
              <div className="conteo-dim conteo-stats">
                Últimos 30 días en {sede}: {stats.cerrados} contados · <b>{stats.porcentaje} %</b> coincidió con el sistema.
              </div>
            )}
          </div>
          {panel && !isMobile && <div className="conteo-lateral">{panel}</div>}
        </div>
      )}

      {panel && isMobile && (
        <div className="conteo-hoja" role="dialog" aria-modal="true">
          <button type="button" className="conteo-hoja-fondo" aria-label="Cerrar" onClick={() => setSeleccion(null)} />
          <div className="conteo-hoja-cuerpo">{panel}</div>
        </div>
      )}
    </div>
  );
}

const CONTEO_CSS = `
.conteo-root { display: grid; gap: 14px; padding: 4px 2px 24px; color: var(--text); }
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
.conteo-root .conteo-seccion-titulo { padding: 9px 12px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); background: var(--panel); border-bottom: 1px solid var(--border); }
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
.conteo-root .conteo-resultado { display: flex; gap: 8px; align-items: center; padding: 12px; border: 1px solid; border-radius: 10px; font-size: 13px; font-weight: 600; }
.conteo-root .conteo-revision { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.conteo-root .conteo-numeros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.conteo-root .conteo-numeros span { display: grid; gap: 2px; font-size: 10.5px; color: var(--dim); }
.conteo-root .conteo-numeros b { font-size: 16px; color: var(--text); }
.conteo-root .conteo-hoja { position: fixed; inset: 0; z-index: 60; display: grid; align-items: end; }
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
