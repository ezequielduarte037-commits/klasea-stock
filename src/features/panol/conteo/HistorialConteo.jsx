/*
 * Historial del conteo diario: qué días se armó la lista, cuánto se contó,
 * quién y a qué hora. Sirve para ver si el conteo se está haciendo.
 * El que cuenta no ve los números del sistema (el conteo es a ciegas y un
 * segundo conteo podría estar abierto); administración y Compras sí.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, MapPin, UserRound } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { fmtQty } from "@/features/panol/stockGrupos";
import { ESTADOS_DIA, fechaLocal, resumenHistorial } from "@/features/panol/conteo/conteoDiario";
import { ConteoSinMigracion, fetchHistorialConteo, fetchNombres } from "@/features/panol/conteo/conteoApi";
import { Chip, EstadoChip } from "@/features/panol/conteo/conteoPiezas";
import { TONOS, diaCorto, fechaCorta, hora, nombreLindo, primerNombre } from "@/features/panol/conteo/conteoFormato";

const RANGOS = [15, 30, 90];
const TIPO_ACCION = { conteo: "contó", segundo: "hizo el segundo conteo de", resuelto: "resolvió" };

function sumarDias(fecha, n) {
  const [y, m, d] = fecha.split("-").map(Number);
  return fechaLocal(new Date(y, m - 1, d + n));
}

function Indicador({ titulo, valor, detalle, tono }) {
  return (
    <div className="hist-indicador">
      <span className="hist-indicador-titulo">{titulo}</span>
      <b className="hist-indicador-valor" style={tono ? { color: TONOS[tono][0] } : undefined}>{valor}</b>
      {detalle && <span className="conteo-dim">{detalle}</span>}
    </div>
  );
}

function tonoCumplimiento(pct) {
  if (pct == null) return undefined;
  if (pct >= 90) return "green";
  if (pct >= 50) return "violet";
  return "red";
}

function Racha({ filas }) {
  const habiles = [...filas].filter((fila) => fila.habil).reverse();
  return (
    <div className="hist-racha" aria-label="Días hábiles del período">
      {habiles.map((fila) => {
        const meta = ESTADOS_DIA[fila.estado];
        const [color, bg, border] = TONOS[meta.tono];
        const pct = fila.asignados ? fila.contados / fila.asignados : 0;
        return (
          <span
            key={fila.fecha}
            className={`hist-racha-dia${fila.hoy ? " es-hoy" : ""}`}
            title={`${diaCorto(fila.fecha)} · ${meta.label}${fila.lote ? ` · ${fila.contados} de ${fila.asignados}` : ""}`}
            style={{ borderColor: border, background: bg }}
          >
            <i style={{ height: `${Math.round(pct * 100)}%`, background: color }} />
          </span>
        );
      })}
    </div>
  );
}

function DetalleItem({ item, nombres, verNumeros }) {
  const m = item.material || {};
  const unidad = item.unidad || m.unidad_medida || "";
  return (
    <div className="hist-item">
      <MaterialThumb material={{ imagen_url: m.imagen_url, descripcion: m.descripcion }} size={34} />
      <div className="hist-item-texto">
        <span className="conteo-fila-nombre">{m.descripcion || "Material"}</span>
        <span className="conteo-fila-meta">
          {m.codigo && <span className="conteo-mono">{m.codigo}</span>}
          <span className="conteo-ubic"><MapPin size={11} /> {m.ubicacion || "sin ubicación"}</span>
          {item.contado_at && <span>{primerNombre(nombres, item.contado_por)} · {hora(item.contado_at)}</span>}
          {item.recontado_at && <span>2.º {primerNombre(nombres, item.recontado_por)} · {fechaLocal(item.recontado_at) !== fechaLocal(item.contado_at) ? `${fechaCorta(fechaLocal(item.recontado_at))} ` : ""}{hora(item.recontado_at)}</span>}
          {item.resuelto_at && <span>Resolvió {primerNombre(nombres, item.resuelto_por)}</span>}
        </span>
        {verNumeros && item.contado != null && (
          <span className="hist-item-numeros conteo-mono">
            contó {fmtQty(item.contado)}
            {item.recontado != null && ` · 2.º ${fmtQty(item.recontado)}`}
            {item.teorico != null && ` · sistema ${fmtQty(item.teorico)}`}
            {item.ajuste != null && Math.abs(item.ajuste) > 0.0001 && ` · ajuste ${item.ajuste > 0 ? "+" : ""}${fmtQty(item.ajuste)}`}
            {unidad && ` ${unidad}`}
          </span>
        )}
        {item.nota && <span className="conteo-dim">“{item.nota}”</span>}
      </div>
      <EstadoChip estado={item.estado} />
    </div>
  );
}

function FilaDia({ fila, nombres, verNumeros, abierta, onToggle }) {
  const meta = ESTADOS_DIA[fila.estado];
  const pct = fila.asignados ? Math.round((fila.contados / fila.asignados) * 100) : 0;
  const deOtrosDias = fila.acciones.filter((accion) => accion.item.lote_id !== fila.lote?.id);
  const tieneDetalle = !!fila.lote || deOtrosDias.length > 0;
  const quienes = fila.personas.map((p) => primerNombre(nombres, p.uid)).join(", ");
  const contadosPrimero = fila.lote
    ? [...fila.lote.items].sort((a, b) => (a.contado_at ? 0 : 1) - (b.contado_at ? 0 : 1) || String(a.contado_at || "").localeCompare(String(b.contado_at || "")) || a.orden - b.orden)
    : [];

  return (
    <div className={`hist-dia${abierta ? " is-abierta" : ""}`}>
      <button type="button" className="hist-dia-fila" onClick={onToggle} disabled={!tieneDetalle} aria-expanded={abierta}>
        <span className="hist-dia-fecha">
          <b>{diaCorto(fila.fecha)}</b>
          {fila.hoy && <span className="conteo-dim">hoy</span>}
        </span>
        <span className="hist-dia-avance">
          {fila.lote ? (
            <>
              <span className="hist-barra"><i style={{ width: `${pct}%`, background: TONOS[meta.tono][0] }} /></span>
              <span className="conteo-mono hist-dia-num">{fila.contados}/{fila.asignados}</span>
            </>
          ) : (
            <span className="conteo-dim">{fila.estado === "sin_armar" ? "Todavía no se armó la lista" : "No se armó la lista"}</span>
          )}
        </span>
        <span className="hist-dia-quien">
          {fila.primero ? (
            <>
              <span className="conteo-mono">{hora(fila.primero)}{fila.ultimo !== fila.primero ? `–${hora(fila.ultimo)}` : ""}</span>
              <span className="hist-dia-nombres">{quienes}</span>
            </>
          ) : (
            <span className="conteo-dim">Nadie contó</span>
          )}
        </span>
        <span className="hist-dia-estado">
          <Chip tono={meta.tono}>{meta.label}</Chip>
          {tieneDetalle && <ChevronDown size={15} className="hist-chevron" />}
        </span>
      </button>
      {abierta && (
        <div className="hist-dia-detalle">
          {fila.lote && (
            <div className="conteo-dim hist-dia-resumen">
              Armó la lista {nombreLindo(nombres, fila.lote.creado_por)} a las {hora(fila.lote.created_at)}.
              {fila.contados > 0 && ` Coincidieron ${fila.ok}, se ajustaron ${fila.ajustados}${fila.diferencias ? `, ${fila.diferencias} con diferencia abierta` : ""}.`}
              {fila.personas.length > 0 && ` ${fila.personas.map((p) => `${primerNombre(nombres, p.uid)}: ${p.conteo + p.segundo}`).join(" · ")}.`}
            </div>
          )}
          {contadosPrimero.map((item) => <DetalleItem key={item.id} item={item} nombres={nombres} verNumeros={verNumeros} />)}
          {deOtrosDias.length > 0 && (
            <>
              <div className="hist-subtitulo">También ese día, de listas anteriores</div>
              {deOtrosDias.map((accion) => (
                <div key={`${accion.item.id}-${accion.tipo}`} className="conteo-dim hist-accion">
                  {hora(accion.at)} · {primerNombre(nombres, accion.uid)} {TIPO_ACCION[accion.tipo]} <b>{accion.item.material?.descripcion || "un material"}</b>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function HistorialConteo({ sede, puedeResolver, toast }) {
  const [dias, setDias] = useState(30);
  // Lo traído queda marcado con su sede y período: si cambian, se muestra
  // "cargando" sin tener que vaciarlo antes.
  const [datos, setDatos] = useState({ clave: "", lotes: null, inicio: null });
  const [nombres, setNombres] = useState(new Map());
  const [sinMigracion, setSinMigracion] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const hoy = fechaLocal();

  const clave = `${sede}|${dias}|${hoy}`;
  const lotes = datos.clave === clave ? datos.lotes : null;

  useEffect(() => {
    let vivo = true;
    const marca = `${sede}|${dias}|${hoy}`;
    (async () => {
      try {
        const { lotes: data, inicio } = await fetchHistorialConteo(sede, sumarDias(hoy, -(dias - 1)));
        const ids = data.flatMap((lote) => [lote.creado_por, ...lote.items.flatMap((item) => [item.contado_por, item.recontado_por, item.resuelto_por])]);
        const conNombres = await fetchNombres(ids);
        if (!vivo) return;
        setNombres(conNombres);
        setDatos({ clave: marca, lotes: data, inicio });
      } catch (error) {
        if (!vivo) return;
        if (error instanceof ConteoSinMigracion) setSinMigracion(true);
        else toast?.error?.(error.message || "No se pudo traer el historial.");
        setDatos({ clave: marca, lotes: [], inicio: null });
      }
    })();
    return () => { vivo = false; };
  }, [dias, hoy, sede, toast]);

  const resumen = useMemo(() => (lotes ? resumenHistorial(lotes, { hoy, dias, inicio: datos.inicio }) : null), [datos.inicio, dias, hoy, lotes]);

  if (sinMigracion) {
    return (
      <div className="conteo-vacio">
        <ClipboardList size={22} />
        <div className="conteo-vacio-titulo">El conteo diario todavía no está instalado</div>
      </div>
    );
  }

  const t = resumen?.totales;
  return (
    <div className="hist-root">
      <style>{HIST_CSS}</style>
      <div className="hist-barra-sup">
        <div className="conteo-dim">
          {resumen ? `Del ${fechaCorta(resumen.desde)} a hoy en ${sede}. Se cuentan los días de lunes a viernes; hoy todavía no entra en la cuenta.` : `Trayendo lo contado en ${sede}…`}
        </div>
        <div className="ui-tabs" role="tablist" aria-label="Período">
          {RANGOS.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={dias === n} className={`ui-tab${dias === n ? " is-activa" : ""}`} onClick={() => { setDias(n); setAbierta(null); }}>{n} días</button>
          ))}
        </div>
      </div>

      {!resumen ? (
        <Cargando texto="Trayendo el historial del conteo" />
      ) : !datos.inicio ? (
        <div className="conteo-vacio">
          <ClipboardList size={22} />
          <div className="conteo-vacio-titulo">Todavía no se armó ninguna lista en {sede}</div>
          <div className="conteo-dim">El historial arranca el día de la primera lista.</div>
        </div>
      ) : (
        <>
          <div className="hist-indicadores">
            <Indicador
              titulo="Días con lista"
              valor={`${t.diasConLista} de ${t.diasHabiles}`}
              detalle={t.diasSinContar ? `${t.diasSinContar} día${t.diasSinContar === 1 ? "" : "s"} sin contar nada` : "Todos los días se contó algo"}
              tono={t.diasSinContar ? "red" : t.diasHabiles ? "green" : undefined}
            />
            <Indicador
              titulo="Contado de lo pedido"
              valor={t.cumplimiento == null ? "—" : `${t.cumplimiento} %`}
              detalle={t.asignados ? `${t.contados} de ${t.asignados} productos` : "Sin listas en el período"}
              tono={tonoCumplimiento(t.cumplimiento)}
            />
            <Indicador
              titulo="Listas completas"
              valor={`${t.diasCompletos}`}
              detalle={t.diasConLista ? `de ${t.diasConLista} armadas` : "—"}
            />
            <Indicador
              titulo="Coincidió con el sistema"
              valor={t.exactitud ? `${t.exactitud.porcentaje} %` : "—"}
              detalle={t.exactitud ? `${t.ajustados} ajustados${t.abiertos ? ` · ${t.abiertos} diferencias abiertas` : ""}` : "Todavía no hay conteos cerrados"}
            />
          </div>

          {resumen.filas.some((fila) => fila.habil) && <Racha filas={resumen.filas} />}

          <section className="conteo-seccion">
            <div className="conteo-seccion-titulo">Quién contó</div>
            {resumen.personas.length ? resumen.personas.map((p) => (
              <div key={p.uid || "anon"} className="hist-persona">
                <span className="hist-persona-avatar"><UserRound size={15} /></span>
                <span className="hist-persona-nombre">{nombreLindo(nombres, p.uid)}</span>
                <span className="hist-persona-dato"><b className="conteo-mono">{p.conteo}</b> {p.conteo === 1 ? "contado" : "contados"}</span>
                <span className="hist-persona-dato"><b className="conteo-mono">{p.segundo}</b> {p.segundo === 1 ? "segundo conteo" : "segundos conteos"}</span>
                <span className="hist-persona-dato"><b className="conteo-mono">{p.dias}</b> {p.dias === 1 ? "día" : "días"}</span>
                <span className="hist-persona-dato conteo-dim">último {fechaCorta(fechaLocal(p.ultimo))} {hora(p.ultimo)}</span>
              </div>
            )) : (
              <div className="hist-vacio conteo-dim">Nadie contó en este período.</div>
            )}
          </section>

          <section className="conteo-seccion">
            <div className="conteo-seccion-titulo">Día por día</div>
            {resumen.filas.map((fila) => (
              <FilaDia
                key={fila.fecha}
                fila={fila}
                nombres={nombres}
                verNumeros={puedeResolver}
                abierta={abierta === fila.fecha}
                onToggle={() => setAbierta((prev) => (prev === fila.fecha ? null : fila.fecha))}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

const HIST_CSS = `
.conteo-root .hist-root { display: grid; gap: 14px; }
.conteo-root .hist-barra-sup { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
.conteo-root .hist-indicadores { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.conteo-root .hist-indicador { display: grid; gap: 3px; align-content: start; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); }
.conteo-root .hist-indicador-titulo { font-size: 10.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.conteo-root .hist-indicador-valor { font-family: "JetBrains Mono", monospace; font-variant-numeric: tabular-nums; font-size: 22px; font-weight: 700; color: var(--text); }
.conteo-root .hist-racha { display: flex; flex-wrap: wrap; gap: 4px; }
.conteo-root .hist-racha-dia { position: relative; width: 16px; height: 22px; border: 1px solid; border-radius: 4px; overflow: hidden; display: flex; align-items: flex-end; }
.conteo-root .hist-racha-dia i { display: block; width: 100%; opacity: .85; }
.conteo-root .hist-racha-dia.es-hoy { outline: 1px solid var(--blue); outline-offset: 1px; }
.conteo-root .hist-persona { display: grid; grid-template-columns: 28px minmax(120px, 1fr) 104px 150px 64px 150px; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.conteo-root .hist-persona:last-child { border-bottom: 0; }
.conteo-root .hist-persona-avatar { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: var(--blue-soft); color: var(--blue); border: 1px solid var(--blue-border); }
.conteo-root .hist-persona-nombre { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conteo-root .hist-persona-dato { color: var(--muted); white-space: nowrap; }
.conteo-root .hist-persona-dato b { color: var(--text); font-weight: 600; }
.conteo-root .hist-vacio { padding: 14px 12px; }
.conteo-root .hist-dia { border-bottom: 1px solid var(--border); }
.conteo-root .hist-dia:last-child { border-bottom: 0; }
.conteo-root .hist-dia-fila { width: 100%; display: grid; grid-template-columns: 96px minmax(140px, 1fr) minmax(0, 1.3fr) 138px; gap: 12px; align-items: center; padding: 10px 12px; border: 0; background: transparent; color: var(--text); text-align: left; font-family: inherit; font-size: 12.5px; min-height: 48px; }
.conteo-root .hist-dia-fila:not(:disabled):hover { background: var(--panel); }
.conteo-root .hist-dia-fila:disabled { cursor: default; }
.conteo-root .hist-dia.is-abierta .hist-dia-fila { background: var(--panel); }
.conteo-root .hist-dia-fecha { display: grid; gap: 1px; text-transform: capitalize; }
.conteo-root .hist-dia-fecha b { font-weight: 600; }
.conteo-root .hist-dia-avance { display: flex; align-items: center; gap: 8px; min-width: 0; }
.conteo-root .hist-barra { flex: 1 1 auto; max-width: 160px; height: 6px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
.conteo-root .hist-barra i { display: block; height: 100%; border-radius: 3px; }
.conteo-root .hist-dia-num { color: var(--muted); font-size: 12px; }
.conteo-root .hist-dia-quien { display: flex; gap: 8px; align-items: baseline; min-width: 0; color: var(--muted); }
.conteo-root .hist-dia-nombres { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.conteo-root .hist-dia-estado { display: inline-flex; align-items: center; gap: 6px; justify-self: end; }
.conteo-root .hist-chevron { color: var(--dim); transition: transform .2s cubic-bezier(.22,1,.36,1); }
.conteo-root .hist-dia.is-abierta .hist-chevron { transform: rotate(180deg); }
.conteo-root .hist-dia-detalle { display: grid; padding: 4px 12px 12px; background: var(--panel); }
.conteo-root .hist-dia-resumen { padding: 6px 0 8px; }
.conteo-root .hist-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
.conteo-root .hist-item-texto { display: grid; gap: 2px; min-width: 0; }
.conteo-root .hist-item-numeros { font-size: 11.5px; color: var(--muted); }
.conteo-root .hist-subtitulo { padding: 10px 0 4px; font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); border-top: 1px solid var(--border); }
.conteo-root .hist-accion { padding: 3px 0; }
.conteo-root .hist-accion b { color: var(--text); font-weight: 500; }
@media (max-width: 900px) {
  .conteo-root .hist-indicadores { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .conteo-root .hist-persona { grid-template-columns: 28px minmax(0, 1fr) 104px 150px; }
  .conteo-root .hist-persona-dato:nth-of-type(n+5) { display: none; }
}
@media (max-width: 640px) {
  .conteo-root .hist-indicador-valor { font-size: 19px; }
  .conteo-root .hist-dia-fila { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
  .conteo-root .hist-dia-avance { grid-column: 1; }
  .conteo-root .hist-dia-quien { grid-column: 1 / -1; }
  .conteo-root .hist-dia-estado { grid-row: 1; grid-column: 2; }
  .conteo-root .hist-persona { grid-template-columns: 28px minmax(0, 1fr) auto; }
  .conteo-root .hist-persona-dato:nth-of-type(n+4) { display: none; }
}
`;
