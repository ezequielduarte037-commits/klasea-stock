/*
 * Historial del conteo diario: qué días se armó la lista, cuánto se contó,
 * quién y a qué hora. Sirve para ver si el conteo se está haciendo.
 * El que cuenta no ve los números del sistema (el conteo es a ciegas y un
 * segundo conteo podría estar abierto); administración y Compras sí.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ClipboardList, MapPin, UserRound } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { ESTADOS_DIA, explicarConteo, fechaLocal, resumenHistorial, tieneDiferencia } from "@/features/panol/conteo/conteoDiario";
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

/**
 * Un renglón contado con la explicación de qué pasó y el acceso al producto.
 * Los números se ocultan sólo mientras falta el segundo conteo y quien mira
 * no resuelve (el conteo es a ciegas).
 */
function RenglonExplicado({ item, nombres, verNumeros, onAbrirProducto, mostrarFecha = false }) {
  const m = item.material || {};
  const { texto, tono } = explicarConteo(item, {
    nombre: (uid) => primerNombre(nombres, uid),
    verNumeros: verNumeros || item.estado !== "recontar",
  });
  const fecha = item.lote?.fecha || (item.contado_at ? fechaLocal(item.contado_at) : null);
  return (
    <div className="hist-item">
      <MaterialThumb material={{ imagen_url: m.imagen_url, descripcion: m.descripcion }} size={34} />
      <div className="hist-item-texto">
        <span className="conteo-fila-nombre">{m.descripcion || "Material"}</span>
        <span className="conteo-fila-meta">
          {mostrarFecha && fecha && <span>{diaCorto(fecha)}</span>}
          <span className="conteo-ubic"><MapPin size={11} /> {m.ubicacion || "sin ubicación"}</span>
          {m.codigo && <span className="conteo-mono">{m.codigo}</span>}
          {item.contado_at && <span>{primerNombre(nombres, item.contado_por)} · {hora(item.contado_at)}</span>}
          {item.recontado_at && <span>2.º {primerNombre(nombres, item.recontado_por)} · {fechaLocal(item.recontado_at) !== fechaLocal(item.contado_at) ? `${fechaCorta(fechaLocal(item.recontado_at))} ` : ""}{hora(item.recontado_at)}</span>}
          {item.resuelto_at && <span>Resolvió {primerNombre(nombres, item.resuelto_por)}</span>}
        </span>
        {item.contado_at && <span className="hist-explicacion" style={{ borderColor: TONOS[tono][0] }}>{texto}</span>}
        {item.nota && <span className="conteo-dim">Nota: “{item.nota}”</span>}
      </div>
      <div className="hist-item-lado">
        {item.ajuste_anulado ? <Chip tono="red">Ajuste anulado</Chip> : <EstadoChip estado={item.estado} />}
        {onAbrirProducto && item.material_id && (
          <button type="button" className="ui-btn ui-btn-fantasma hist-ver" onClick={() => onAbrirProducto(item.material_id)} title="Abrir el producto en el inventario, con sus movimientos">
            Ver producto <ArrowUpRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function FilaDia({ fila, nombres, verNumeros, abierta, onToggle, onAbrirProducto }) {
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
          {contadosPrimero.map((item) => <RenglonExplicado key={item.id} item={item} nombres={nombres} verNumeros={verNumeros} onAbrirProducto={onAbrirProducto} />)}
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

export default function HistorialConteo({ sede, puedeResolver, toast, onAbrirProducto }) {
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
        const ids = data.flatMap((lote) => [lote.creado_por, ...lote.items.flatMap((item) => [item.contado_por, item.recontado_por, item.resuelto_por, item.ajuste_anulado?.por])]);
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
  // Todo lo que no dio igual en el período, lo último primero.
  const diferencias = useMemo(() => {
    if (!resumen) return [];
    return lotes
      .filter((lote) => lote.fecha >= resumen.desde)
      .flatMap((lote) => lote.items.map((item) => ({ ...item, lote })))
      .filter(tieneDiferencia)
      .sort((a, b) => String(b.contado_at || "").localeCompare(String(a.contado_at || "")));
  }, [lotes, resumen]);

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
            <div className="conteo-seccion-titulo">
              <span>Ajustes y diferencias · {diferencias.length}</span>
              <span className="conteo-seccion-detalle">lo que no dio igual al sistema y qué se hizo</span>
            </div>
            {diferencias.length ? (
              <div className="hist-diferencias">
                {diferencias.map((item) => (
                  <RenglonExplicado key={item.id} item={item} nombres={nombres} verNumeros={puedeResolver} onAbrirProducto={onAbrirProducto} mostrarFecha />
                ))}
              </div>
            ) : (
              <div className="hist-vacio conteo-dim">En este período todo lo contado coincidió con el sistema.</div>
            )}
          </section>

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
                onAbrirProducto={onAbrirProducto}
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
.conteo-root .hist-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 0; border-top: 1px solid var(--border); }
.conteo-root .hist-diferencias { display: grid; padding: 0 12px; }
.conteo-root .hist-diferencias .hist-item:first-child { border-top: 0; }
.conteo-root .hist-explicacion { margin-top: 3px; padding: 2px 0 2px 9px; border-left: 2px solid; font-size: 12.5px; line-height: 1.45; color: var(--text); max-width: 72ch; }
.conteo-root .hist-item-lado { display: grid; justify-items: end; gap: 6px; }
.conteo-root .hist-ver { min-height: 30px; padding: 0 8px; font-size: 11.5px; gap: 3px; color: var(--blue); white-space: nowrap; }
.conteo-root .hist-item-texto { display: grid; gap: 2px; min-width: 0; }
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
  .conteo-root .hist-item { grid-template-columns: 34px minmax(0, 1fr); }
  .conteo-root .hist-item-lado { grid-column: 2; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; }
}
`;
