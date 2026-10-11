import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, PackageCheck, Plus, RefreshCw, ScanLine, Trash2, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  anularMovimiento,
  fetchCatalogo,
  fetchMovimientos,
  fmtCantidad,
  fmtPesos,
  guardarConfig,
  indexarCodigos,
  normalizarCodigo,
  insertarMovimientos,
} from "@/features/consumibles/api";
import { DIA_MS, coincideBusqueda, unidadEnTexto } from "../conteo/conteoCalculos";
import { agregarAlRemito, agruparIngresos, calcularLinea, cambiosDeConfig, remitoRepetido, totalRemito } from "./ingresoCalculos";
import { CSS_INGRESOS } from "./ingresosEstilos";
import { prepararIngreso } from "./ingresoRegistro";
import { conPlazoLectura } from "../lecturas";

/**
 * Ingresos — cargar un remito del proveedor (el primero, de Rebollar, llega el
 * martes 13 o miércoles 14/10/2026).
 *
 * Número de remito → escanear o buscar cada producto → cantidad como viene
 * (cajas × unidades por caja = unidades de stock) → costo (por defecto el de
 * la config, editable) → Confirmar. Lo que se carga queda como borrador en el
 * equipo hasta confirmar, por si se corta la luz o se cierra la pestaña.
 *
 * Si un producto viene en cajas y la config no lo sabía, se puede recordar
 * (unidad de compra y factor) para la próxima y para el pedido sugerido.
 */

const BORRADOR_KEY = "klasea.consumibles.ingreso.borrador";
const VACIO = { remito: "", proveedor: "Rebollar", nota: "", lineas: [] };

function leerBorrador(sede) {
  try {
    const b = JSON.parse(window.localStorage.getItem(`${BORRADOR_KEY}.${sede}`) || "null");
    return b && Array.isArray(b.lineas) ? { ...VACIO, ...b } : VACIO;
  } catch {
    return VACIO;
  }
}

function escribirBorrador(sede, b) {
  try {
    const vacio = !b.remito && !b.nota && !b.lineas.length;
    if (vacio) window.localStorage.removeItem(`${BORRADOR_KEY}.${sede}`);
    else window.localStorage.setItem(`${BORRADOR_KEY}.${sede}`, JSON.stringify(b));
    return true;
  } catch { return false; }
}

const fechaHora = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function IngresosTab({ sede }) {
  return <Ingresos key={sede} sede={sede} />;
}

function Ingresos({ sede }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const buscarRef = useRef(null);
  const enviandoRef = useRef(false);

  const [catalogo, setCatalogo] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [borrador, setBorrador] = useState(() => leerBorrador(sede));
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(null); // lote expandido en el historial
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState("");

  const cargarHistorial = useCallback(async () => {
    const filas = await fetchMovimientos({
      sede,
      tipos: ["ingreso"],
      desde: new Date(Date.now() - 120 * DIA_MS).toISOString(),
      incluirAnulados: true,
      limite: 3000,
    });
    setHistorial(filas);
  }, [sede]);

  const cargar = useCallback(async () => {
    const [cat] = await conPlazoLectura(Promise.all([fetchCatalogo({ sede }), cargarHistorial()]));
    setCatalogo(cat);
    setErrorCarga("");
  }, [sede, cargarHistorial]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargar();
      } catch (err) {
        if (vivo) setErrorCarga(err.message || String(err));
      }
    })();
    return () => { vivo = false; };
  }, [cargar]);

  useEffect(() => { escribirBorrador(sede, borrador); }, [sede, borrador]);

  const indice = useMemo(() => indexarCodigos(catalogo ?? []), [catalogo]);
  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!q || !catalogo) return [];
    return catalogo.filter((i) => coincideBusqueda(i, q)).slice(0, 8);
  }, [busqueda, catalogo]);
  const grupos = useMemo(() => agruparIngresos(historial ?? []), [historial]);
  const repetido = remitoRepetido(grupos, borrador.remito);
  const { total, sinCosto, validas } = totalRemito(borrador.lineas);

  const cambiar = (cambio) => setBorrador((b) => ({ ...b, ...cambio }));
  const cambiarLinea = (key, cambio) => setBorrador((b) => ({ ...b, lineas: b.lineas.map((l) => (l.key === key ? { ...l, ...cambio } : l)) }));
  const quitarLinea = (key) => setBorrador((b) => ({ ...b, lineas: b.lineas.filter((l) => l.key !== key) }));

  const agregar = (item) => {
    setBorrador((b) => ({ ...b, lineas: agregarAlRemito(b.lineas, item) }));
    setBusqueda("");
    buscarRef.current?.focus();
  };

  // El lector 2D escribe el código y manda Enter.
  const onBuscarEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const codigo = normalizarCodigo(busqueda);
    const porCodigo = codigo ? indice.get(codigo) : null;
    if (porCodigo) agregar(porCodigo);
    else if (resultados.length === 1) agregar(resultados[0]);
    else if (!resultados.length && busqueda.trim()) toast.warning(`No encontramos «${busqueda.trim()}». Si es nuevo, dalo de alta en Catálogo o en Conteo.`);
  };

  const confirmarIngreso = async () => {
    if (enviandoRef.current || guardando) return;
    const invalidas = borrador.lineas.filter((l) => !calcularLinea(l).valida);
    if (!validas) {
      toast.warning("Agregá al menos un producto con su cantidad.");
      return;
    }
    if (invalidas.length) {
      toast.warning(`Revisá ${invalidas.length === 1 ? "una línea" : `${invalidas.length} líneas`}: falta la cantidad o cuántas trae cada caja.`);
      return;
    }
    enviandoRef.current = true;
    setGuardando(true);
    try {
    if (repetido && !borrador.envio) {
      const ok = await confirmar({
        title: "Ese remito ya se cargó",
        message: `El remito ${repetido.remito} se cargó el ${fechaHora(repetido.fecha)}. Si lo cargás de nuevo, el stock entra dos veces.`,
        confirmLabel: "Cargarlo igual",
        tone: "danger",
      });
      if (!ok) return;
    }
    const ok = borrador.envio || await confirmar({
      title: "¿Confirmar el ingreso?",
      message: `${validas} ${validas === 1 ? "producto" : "productos"}${borrador.remito.trim() ? ` del remito ${borrador.remito.trim()}` : " sin número de remito"} entran al stock de ${sede}.${total > 0 ? ` Total ${fmtPesos(total)} sin IVA.` : ""}`,
      confirmLabel: "Confirmar ingreso",
    });
    if (!ok) return;

      const envio = prepararIngreso(borrador, sede);
      const pendiente = { ...borrador, envio };
      if (!escribirBorrador(sede, pendiente)) throw new Error("El equipo no pudo guardar el remito para reintentar. Liberá espacio antes de confirmar.");
      setBorrador(pendiente);
      await insertarMovimientos(envio.filas);

      // Lo que se aprendió del remito (viene en cajas de N) queda para la próxima.
      const aprender = borrador.lineas.map((l) => [l.materialId, cambiosDeConfig(l)]).filter(([, c]) => c);
      const fallidos = [];
      for (const [id, cambios] of aprender) {
        try { await guardarConfig(id, cambios); } catch { fallidos.push(id); }
      }

      toast.success(`Ingreso cargado: ${validas} ${validas === 1 ? "producto" : "productos"} en ${sede}.`);
      if (fallidos.length) toast.warning("No se pudo recordar cómo vienen algunas cajas; cargalo en Catálogo.");
      const limpio = { ...VACIO, proveedor: borrador.proveedor };
      // Si falla limpiar el borrador, quedan los mismos ids: tampoco duplica al volver.
      escribirBorrador(sede, limpio);
      setBorrador(limpio);
      await cargar().catch(() => toast.warning("El ingreso se guardó. No pudimos actualizar la pantalla; tocá Actualizar."));
    } catch (err) {
      toast.error(`No pudimos confirmar el ingreso: ${err.message || err}. Reintentá desde este mismo remito.`);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  const descartar = async () => {
    const ok = await confirmar({ title: "¿Descartar lo cargado?", message: "Se borra el borrador de este remito.", confirmLabel: "Descartar", tone: "danger" });
    if (ok) setBorrador({ ...VACIO, proveedor: borrador.proveedor });
  };

  const anularCarga = async (g) => {
    if (!motivo.trim()) {
      toast.warning("Escribí por qué se anula.");
      return;
    }
    setGuardando(true);
    try {
      for (const f of g.filas.filter((x) => !x.anulado_at)) await anularMovimiento(f.id, motivo);
      toast.success("Ingreso anulado. El stock ya se corrigió.");
      setAnulando(null);
      setMotivo("");
      await cargar();
    } catch (err) {
      toast.error(`No se pudo anular todo: ${err.message || err}`);
      await cargarHistorial().catch(() => {});
    } finally {
      setGuardando(false);
    }
  };

  if (errorCarga && !catalogo) {
    return (
      <div className="ing ing-root">
        <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>
        <div className="ing-vacio ui-card">
          <p>No se pudo traer el catálogo.</p>
          <p className="ing-dim">{errorCarga}</p>
          <button type="button" className="ui-btn ui-btn-primario" onClick={() => cargar().catch((e) => setErrorCarga(e.message))}>Probar de nuevo</button>
        </div>
      </div>
    );
  }
  if (!catalogo) {
    return (
      <div className="ing ing-root">
        <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>
        <Cargando texto="Trayendo el catálogo…" />
      </div>
    );
  }

  return (
    <div className="ing ing-root">
      <style href="klasea-cns-ingresos" precedence="default">{CSS_INGRESOS}</style>

      <div className="ing-grilla">
        <section className="ing-carga ui-card" aria-label="Cargar un remito">
          <header className="ing-cab">
            <h2><PackageCheck size={18} /> Cargar un remito</h2>
            <span className="ing-dim">Entra al stock de {sede}</span>
          </header>

          {borrador.envio && <p className="ing-alerta" role="status">Este remito tiene un envío por confirmar. Reintentá: se conservan los mismos renglones y no se duplica el stock.</p>}
          <fieldset disabled={guardando || !!borrador.envio} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <div className="ing-datos">
            <label className="ing-campo">
              <span className="ing-lbl">N° de remito</span>
              <input className="ui-input ing-num" value={borrador.remito} placeholder="0001-00012345" maxLength={40} onChange={(e) => cambiar({ remito: e.target.value })} />
            </label>
            <label className="ing-campo">
              <span className="ing-lbl">Proveedor</span>
              <input className="ui-input" value={borrador.proveedor} maxLength={80} onChange={(e) => cambiar({ proveedor: e.target.value })} />
            </label>
          </div>
          {repetido && (
            <p className="ing-alerta">Ese número de remito ya se cargó el {fechaHora(repetido.fecha)}. Revisá que no sea el mismo.</p>
          )}

          <div className="ing-buscar">
            <ScanLine size={18} className="ing-buscar-ico" />
            <input
              ref={buscarRef}
              className="ui-input"
              value={busqueda}
              placeholder="Escaneá o buscá un producto"
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={onBuscarEnter}
              aria-label="Escaneá o buscá un producto"
            />
            {busqueda && <button type="button" className="ing-buscar-x" onClick={() => setBusqueda("")} aria-label="Borrar"><X size={16} /></button>}
          </div>
          {resultados.length > 0 && (
            <ul className="ing-resultados" role="listbox" aria-label="Productos encontrados">
              {resultados.map((r) => (
                <li key={r.id}>
                  <button type="button" className="ing-resultado" onClick={() => agregar(r)}>
                    <Plus size={16} />
                    <span className="ing-resultado-txt">
                      <span>{r.descripcion}</span>
                      <small className="ing-dim">{[r.codigoEtiqueta, r.config?.proveedor_codigo ? `Cód. ${r.config.proveedor_codigo}` : null, r.rubro].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {borrador.lineas.length === 0 ? (
            <p className="ing-vacio-lineas">Todavía no hay productos. Escaneá la etiqueta o escribí el nombre.</p>
          ) : (
            <ul className="ing-lineas">
              {borrador.lineas.map((l) => (
                <LineaIngreso key={l.key} linea={l} onCambiar={(c) => cambiarLinea(l.key, c)} onQuitar={() => quitarLinea(l.key)} />
              ))}
            </ul>
          )}

          <label className="ing-campo ing-nota">
            <span className="ing-lbl">Nota <span className="ing-dim">(opcional)</span></span>
            <input className="ui-input" value={borrador.nota} maxLength={200} placeholder="Ej.: faltaron 2 cajas, vienen el jueves" onChange={(e) => cambiar({ nota: e.target.value })} />
          </label>

          </fieldset>
          <footer className="ing-pie">
            <div className="ing-total">
              <span className="ing-num">{validas}</span> {validas === 1 ? "producto" : "productos"}
              {total > 0 && <> · <b className="ing-num">{fmtPesos(total)}</b> sin IVA</>}
              {sinCosto > 0 && <span className="ing-dim"> · {sinCosto} sin costo</span>}
            </div>
            <div className="ing-pie-btns">
              {(borrador.lineas.length > 0 || borrador.remito) && (
                <button type="button" className="ui-btn ui-btn-fantasma" onClick={descartar} disabled={guardando || !!borrador.envio}>Descartar</button>
              )}
              <button type="button" className="ui-btn ui-btn-primario" onClick={confirmarIngreso} disabled={guardando || !validas}>
                <PackageCheck size={17} /> {guardando ? "Cargando…" : borrador.envio ? "Reintentar el ingreso" : "Confirmar ingreso"}
              </button>
            </div>
          </footer>
        </section>

        <section className="ing-historial" aria-label="Ingresos anteriores">
          <header className="ing-cab">
            <h2>Ingresos anteriores</h2>
            <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => cargarHistorial().catch(() => toast.error("No se pudo actualizar."))} aria-label="Actualizar" title="Actualizar">
              <RefreshCw size={16} />
            </button>
          </header>
          {historial == null ? (
            <Cargando compacto />
          ) : grupos.length === 0 ? (
            <p className="ing-dim">Todavía no se cargó ningún ingreso en {sede}.</p>
          ) : (
            <ul className="ing-grupos">
              {grupos.map((g) => {
                const exp = abierto === g.lote;
                return (
                  <li key={g.lote} className={`ing-grupo ui-card${g.anulado ? " is-anulado" : ""}`}>
                    <button type="button" className="ing-grupo-cab" onClick={() => setAbierto(exp ? null : g.lote)} aria-expanded={exp}>
                      {exp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="ing-grupo-tit">
                        <span>{g.remito ? <>Remito <span className="ing-num">{g.remito}</span></> : "Sin n° de remito"}</span>
                        <small className="ing-dim">{fechaHora(g.fecha)} · {g.filas.length} {g.filas.length === 1 ? "producto" : "productos"}{g.nota ? ` · ${g.nota}` : ""}</small>
                      </span>
                      <span className="ing-num ing-grupo-total">{g.anulado ? "Anulado" : g.total > 0 ? fmtPesos(g.total) : ""}</span>
                    </button>
                    {exp && (
                      <div className="ing-grupo-cuerpo">
                        <ul className="ing-grupo-filas">
                          {g.filas.map((f) => (
                            <li key={f.id} className={f.anulado_at ? "is-anulado" : ""}>
                              <span className="ing-grupo-desc">{f.material?.descripcion || "Producto"}</span>
                              <span className="ing-num">+{fmtCantidad(f.cantidad)}</span>
                              <span className="ing-num ing-dim">{f.costo_unitario_ars != null ? `${fmtPesos(f.costo_unitario_ars)} c/u` : "sin costo"}</span>
                            </li>
                          ))}
                        </ul>
                        {g.filas.find((f) => f.anulado_at)?.anulado_motivo && (
                          <p className="ing-anulado-motivo">Anulado: {g.filas.find((f) => f.anulado_at).anulado_motivo}</p>
                        )}
                        {!g.anulado && (anulando === g.lote ? (
                          <div className="ing-anular">
                            <input className="ui-input" value={motivo} autoFocus maxLength={200} placeholder="¿Por qué se anula? Ej.: se cargó en la sede equivocada" onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") anularCarga(g); }} />
                            <div className="ing-anular-btns">
                              <button type="button" className="ui-btn" onClick={() => { setAnulando(null); setMotivo(""); }} disabled={guardando}>Cancelar</button>
                              <button type="button" className="ui-btn ui-btn-peligro" onClick={() => anularCarga(g)} disabled={guardando || !motivo.trim()}>Anular este ingreso</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" className="ui-btn ui-btn-fantasma ing-anular-btn" onClick={() => { setAnulando(g.lote); setMotivo(""); }}>
                            <Trash2 size={14} /> Anular este ingreso
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function LineaIngreso({ linea, onCambiar, onQuitar }) {
  const c = calcularLinea(linea);
  const unidadCompra = linea.unidadCompra || "caja";
  return (
    <li className={`ing-linea${c.valida ? "" : " is-incompleta"}`}>
      <div className="ing-linea-cab">
        <div className="ing-linea-tit">
          <span className="ing-linea-desc">{linea.descripcion}</span>
          <small className="ing-dim">{[linea.codigoEtiqueta, linea.codigoProveedor ? `Cód. ${linea.codigoProveedor}` : null].filter(Boolean).join(" · ")}</small>
        </div>
        <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={onQuitar} aria-label={`Quitar ${linea.descripcion}`}><X size={17} /></button>
      </div>

      <div className="ing-linea-cant">
        <label className="ing-campo ing-campo-cant">
          <span className="ing-lbl">Cantidad</span>
          <input className="ui-input ing-num" inputMode="decimal" value={linea.cantidad} onChange={(e) => onCambiar({ cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
        </label>
        <div className="ing-seg" role="radiogroup" aria-label="Cómo viene">
          <button type="button" role="radio" aria-checked={!linea.porCaja} className={!linea.porCaja ? "is-activa" : ""} onClick={() => onCambiar({ porCaja: false })}>
            Por {linea.unidad}
          </button>
          <button type="button" role="radio" aria-checked={linea.porCaja} className={linea.porCaja ? "is-activa" : ""} onClick={() => onCambiar({ porCaja: true })}>
            En cajas o paquetes
          </button>
        </div>
      </div>

      {linea.porCaja && (
        <div className="ing-linea-caja">
          <label className="ing-campo">
            <span className="ing-lbl">Viene en</span>
            <input className="ui-input" value={linea.unidadCompra} maxLength={20} placeholder="caja" onChange={(e) => onCambiar({ unidadCompra: e.target.value })} />
          </label>
          <label className="ing-campo">
            <span className="ing-lbl">{unidadEnTexto(linea.unidad, 2)} por {unidadCompra}</span>
            <input className="ui-input ing-num" inputMode="decimal" value={linea.factor} placeholder="100" onChange={(e) => onCambiar({ factor: e.target.value.replace(/[^\d.,]/g, "") })} />
          </label>
          {cambiosDeConfig({ ...linea, recordar: true }) && (
            <label className="ing-recordar">
              <input type="checkbox" checked={linea.recordar} onChange={(e) => onCambiar({ recordar: e.target.checked })} />
              Recordar para la próxima
            </label>
          )}
        </div>
      )}

      <div className="ing-linea-pie">
        <span className="ing-equivale">
          {c.valida
            ? <>Entran <b className="ing-num">{fmtCantidad(c.cantidadEntrega)}</b> {unidadEnTexto(linea.unidad, c.cantidadEntrega)}{linea.porCaja ? <span className="ing-dim"> ({fmtCantidad(linea.cantidad)} × {fmtCantidad(c.factor)})</span> : null}</>
            : <span className="ing-falta">{linea.porCaja && !(Number(String(linea.factor).replace(",", ".")) > 0) ? `Falta cuántas trae cada ${unidadCompra}` : "Falta la cantidad"}</span>}
        </span>
        <label className="ing-campo ing-campo-costo">
          <span className="ing-lbl">$ por {linea.porCaja ? unidadCompra : linea.unidad} <span className="ing-dim">sin IVA</span></span>
          <input className="ui-input ing-num" inputMode="decimal" value={linea.costo} placeholder="—" onChange={(e) => onCambiar({ costo: e.target.value.replace(/[^\d.,]/g, "") })} />
        </label>
        {c.subtotal != null && <span className="ing-subtotal ing-num">{fmtPesos(c.subtotal)}</span>}
      </div>
    </li>
  );
}
