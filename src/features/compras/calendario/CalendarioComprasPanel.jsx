import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, ChevronRight, Copy, Info, LoaderCircle, RotateCcw, Truck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import { Aviso, Buscar, Cabecera, Grupo, Vacio } from "../ui";
import {
  MARGEN_DIAS, SEMANAS_A_LA_VISTA, armarCalendario, claveProveedor, inicioSemana, isoFecha, sumarDias,
  sugerirPlazo, sugerirSemanasRubro, textoPedido,
} from "./calendario";
import {
  cargarDatosCalendario, guardarPlazo, guardarPlazos, guardarSemanaItem, guardarSemanaRubro, guardarSemanasRubro,
} from "./calendarioApi";

/**
 * Calendario de compras de los ítems estándar.
 *
 * Tres partes: el calendario (qué pedir cada semana y a quién), las semanas por
 * rubro (cuándo tiene que estar cada rubro en el pañol, contando desde el
 * desmolde) y los plazos de cada proveedor. Mientras algo no está cargado se
 * usa una sugerencia, que se ve en cursiva.
 */

const VISTAS = [
  ["calendario", "Calendario"],
  ["rubros", "Semanas por rubro"],
  ["plazos", "Plazos por proveedor"],
];

function dm(fecha) {
  const d = new Date(fecha);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(v) ? v.toLocaleString("es-AR") : String(v).replace(".", ",");
}

function tituloSemana(sem, lunesHoy) {
  if (sem.clave === "atrasado") return "Atrasado";
  const fin = sumarDias(sem.inicio, 6);
  if (isoFecha(sem.inicio) === isoFecha(lunesHoy)) return `Esta semana · ${dm(sem.inicio)} al ${dm(fin)}`;
  return `Semana del ${dm(sem.inicio)} al ${dm(fin)}`;
}

const FUENTE_SEMANA = { item: "sólo este ítem", rubro: "del rubro", sugerida: "sugerida" };
const FUENTE_PLAZO = { cargado: "cargado", sugerido: "sugerido", general: "general" };

/** Campo numérico que guarda al salir o con Enter; vacío = sin valor. */
function CampoNumero({ valor, sugerido, onGuardar, disabled, min = -52, max = 104, ancho = 64, titulo }) {
  const [draft, setDraft] = useState(valor == null ? "" : String(valor));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setDraft(valor == null ? "" : String(valor)); }, [valor]);
  async function guardar() {
    const limpio = draft.trim();
    const nuevo = limpio === "" ? null : Math.round(Number(limpio.replace(",", ".")));
    if (nuevo === valor || (nuevo != null && (!Number.isFinite(nuevo) || nuevo < min || nuevo > max))) {
      setDraft(valor == null ? "" : String(valor));
      return;
    }
    setGuardando(true);
    try { await onGuardar(nuevo); } catch { setDraft(valor == null ? "" : String(valor)); } finally { setGuardando(false); }
  }
  return (
    <input
      className={`ui-input cal-num${valor == null ? " is-vacio" : ""}`}
      style={{ width: ancho }}
      type="number"
      inputMode="numeric"
      value={draft}
      placeholder={sugerido == null ? "—" : String(sugerido)}
      disabled={disabled || guardando}
      title={titulo}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(valor == null ? "" : String(valor)); e.currentTarget.blur(); } }}
    />
  );
}

export default function CalendarioComprasPanel({ profile }) {
  const toast = useToast();
  const puedeEditar = !!profile?.is_admin || ["admin", "compras", "oficina"].includes(profile?.role);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [vista, setVista] = useState("calendario");
  const [linea, setLinea] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  // Lo atrasado y la semana actual arrancan abiertos; cada proveedor se pliega
  // o despliega solo, y eso queda anotado acá como "lo contrario de lo normal".
  const [invertidos, setInvertidos] = useState(() => new Set());
  const [verConfirmar, setVerConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await cargarDatosCalendario();
      setDatos(d);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo armar el calendario.");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const lineas = useMemo(() => [...new Set((datos?.matriz || []).map((m) => m.linea))].sort(), [datos]);

  const rubros = useMemo(() => {
    const map = new Map();
    for (const m of datos?.matriz || []) {
      const k = `${m.linea}|${m.categoria_id}`;
      if (!map.has(k)) map.set(k, { linea: m.linea, categoria_id: m.categoria_id, rubro: m.rubro, items: 0 });
      map.get(k).items += 1;
    }
    return [...map.values()];
  }, [datos]);

  const sugeridas = useMemo(() => sugerirSemanasRubro(rubros, datos?.llegadas || []), [rubros, datos]);

  const proveedores = useMemo(() => {
    const map = new Map();
    for (const m of datos?.matriz || []) {
      if (!m.proveedor) continue;
      const k = claveProveedor(m.proveedor);
      if (!map.has(k)) map.set(k, { clave: k, nombre: m.proveedor, items: 0, lineas: new Set() });
      const p = map.get(k);
      p.items += 1;
      p.lineas.add(m.linea);
    }
    return [...map.values()].sort((a, b) => b.items - a.items);
  }, [datos]);

  const plazosSugeridos = useMemo(() => {
    const map = new Map();
    for (const p of proveedores) map.set(p.clave, sugerirPlazo(p.nombre, datos?.medidos, datos?.plazoGeneral));
    return map;
  }, [proveedores, datos]);

  const calendario = useMemo(() => {
    if (!datos) return null;
    const matriz = linea === "todas" ? datos.matriz : datos.matriz.filter((m) => m.linea === linea);
    const obras = linea === "todas" ? datos.obras : datos.obras.filter((o) => o.linea === linea);
    return armarCalendario({
      ...datos, matriz, obras, sugeridas, plazosSugeridos, hoy: new Date(),
    });
  }, [datos, linea, sugeridas, plazosSugeridos]);

  const semanasFiltradas = useMemo(() => {
    if (!calendario) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return calendario.semanas;
    return calendario.semanas
      .map((s) => ({
        ...s,
        proveedores: s.proveedores
          .map((p) => ({ ...p, productos: p.productos.filter((x) => [x.descripcion, x.codigo, x.rubro, p.proveedor, ...x.obras.map((o) => o.obra)].some((c) => String(c || "").toLowerCase().includes(q))) }))
          .filter((p) => p.productos.length),
      }))
      .filter((s) => s.proveedores.length);
  }, [calendario, busqueda]);

  function alternar(clave) {
    setInvertidos((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });
  }

  function actualizarMapa(campo, clave, valor) {
    setDatos((prev) => {
      const map = new Map(prev[campo]);
      if (valor == null) map.delete(clave); else map.set(clave, valor);
      return { ...prev, [campo]: map };
    });
  }

  async function onSemanaRubro(lin, categoriaId, semana) {
    try {
      await guardarSemanaRubro(lin, categoriaId, semana);
      actualizarMapa("semanasRubro", `${lin}|${categoriaId}`, semana);
    } catch (e) { toast.error(e.message || "No se pudo guardar."); throw e; }
  }

  async function onSemanaItem(lin, materialId, semana) {
    try {
      await guardarSemanaItem(lin, materialId, semana);
      actualizarMapa("semanasItem", `${lin}|${materialId}`, semana);
      toast.success(semana == null ? "Vuelve a la semana del rubro." : `Guardado: semana ${semana} para este ítem.`);
    } catch (e) { toast.error(e.message || "No se pudo guardar."); throw e; }
  }

  async function onPlazo(nombre, dias) {
    try {
      await guardarPlazo(nombre, dias);
      actualizarMapa("plazos", claveProveedor(nombre), dias);
    } catch (e) { toast.error(e.message || "No se pudo guardar."); throw e; }
  }

  async function usarSemanasSugeridas() {
    const filas = rubros
      .filter((r) => !datos.semanasRubro.has(`${r.linea}|${r.categoria_id}`) && sugeridas.has(`${r.linea}|${r.categoria_id}`))
      .map((r) => ({ linea: r.linea, categoria_id: r.categoria_id, semana: sugeridas.get(`${r.linea}|${r.categoria_id}`).semana }));
    if (!filas.length) { toast.info?.("No hay sugerencias para cargar."); return; }
    try {
      await guardarSemanasRubro(filas);
      setDatos((prev) => {
        const map = new Map(prev.semanasRubro);
        for (const f of filas) map.set(`${f.linea}|${f.categoria_id}`, f.semana);
        return { ...prev, semanasRubro: map };
      });
      toast.success(`${filas.length} semanas cargadas. Ajustá las que no te cierren.`);
    } catch (e) { toast.error(e.message || "No se pudieron guardar."); }
  }

  async function usarPlazosSugeridos() {
    const filas = proveedores
      .filter((p) => !datos.plazos.has(p.clave))
      .map((p) => ({ nombre: p.nombre, dias: plazosSugeridos.get(p.clave)?.dias ?? datos.plazoGeneral }));
    if (!filas.length) { toast.info?.("Todos los proveedores ya tienen plazo."); return; }
    try {
      await guardarPlazos(filas);
      setDatos((prev) => {
        const map = new Map(prev.plazos);
        for (const f of filas) map.set(claveProveedor(f.nombre), f.dias);
        return { ...prev, plazos: map };
      });
      toast.success(`${filas.length} plazos cargados. Corregí los que sepas.`);
    } catch (e) { toast.error(e.message || "No se pudieron guardar."); }
  }

  function copiar(proveedor, productos) {
    navigator.clipboard?.writeText(textoPedido(proveedor, productos))
      .then(() => toast.success(`${productos.length} renglones copiados.`))
      .catch(() => toast.error("No se pudo copiar."));
  }

  const lunesHoy = inicioSemana(new Date());
  const atrasados = calendario?.semanas.find((s) => s.clave === "atrasado");
  const nAtrasados = atrasados ? atrasados.proveedores.reduce((n, p) => n + p.productos.length, 0) : 0;
  const nProductos = calendario ? calendario.semanas.reduce((n, s) => n + s.proveedores.reduce((m, p) => m + p.productos.length, 0), 0) : 0;
  const rubrosSinCargar = rubros.filter((r) => !datos?.semanasRubro.has(`${r.linea}|${r.categoria_id}`)).length;
  const provSinCargar = proveedores.filter((p) => !datos?.plazos.has(p.clave)).length;
  const editable = puedeEditar && !datos?.sinMigracion;

  return (
    <div className="cal-root">
      <style>{CSS}</style>
      <Cabecera
        eyebrow="Compras · Planificar"
        titulo="Calendario de"
        acento="compras"
        sub={calendario ? (
          <>
            <b className="mono">{fmt(nProductos)}</b> productos para pedir en las próximas {SEMANAS_A_LA_VISTA} semanas
            {nAtrasados > 0 && <> · <b className="mono t" data-tono="rojo">{fmt(nAtrasados)}</b> atrasados</>}
            {" "}· se necesita = desmolde + semana del rubro · comprar antes = se necesita − plazo − {MARGEN_DIAS} días
          </>
        ) : "Qué pedir cada semana para que los ítems estándar lleguen a tiempo a cada barco."}
        acciones={(
          <button type="button" className="cmp-btn-ic" onClick={cargar} disabled={cargando} title="Volver a calcular" aria-label="Volver a calcular">
            {cargando ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
          </button>
        )}
      />

      <div className="cmp-filtros">
        <div className="cmp-seg" role="tablist" aria-label="Vista">
          {VISTAS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={vista === k} className={vista === k ? "on" : ""} onClick={() => setVista(k)}>
              {l}
              {k === "rubros" && rubrosSinCargar > 0 && <span className="cal-cuenta">{rubrosSinCargar}</span>}
              {k === "plazos" && provSinCargar > 0 && <span className="cal-cuenta">{provSinCargar}</span>}
            </button>
          ))}
        </div>
        <div className="cmp-seg" role="radiogroup" aria-label="Línea">
          {["todas", ...lineas].map((l) => (
            <button key={l} type="button" role="radio" aria-checked={linea === l} className={linea === l ? "on" : ""} onClick={() => setLinea(l)}>{l === "todas" ? "Todas" : `K${l}`}</button>
          ))}
        </div>
        {vista !== "rubros" && <Buscar value={busqueda} onChange={setBusqueda} placeholder={vista === "plazos" ? "Proveedor…" : "Producto, proveedor u obra…"} />}
      </div>

      {datos?.sinMigracion && (
        <Aviso tono="rojo" icono={AlertCircle}>
          <b>Todavía no se pueden guardar fechas ni plazos:</b> falta instalar el calendario en la base. Mientras tanto se calcula con las sugerencias.
        </Aviso>
      )}
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <Cargando texto="Armando el calendario con la matriz, las obras y el pañol…" />
      ) : !calendario ? null : vista === "calendario" ? (
        <>
          {(rubrosSinCargar > 0 || provSinCargar > 0) && (
            <Aviso tono="cian" icono={Info}>
              Lo que está en <i>cursiva</i> sale de una sugerencia: faltan {rubrosSinCargar > 0 && <><b>{rubrosSinCargar}</b> semanas por rubro</>}{rubrosSinCargar > 0 && provSinCargar > 0 && " y "}{provSinCargar > 0 && <><b>{provSinCargar}</b> plazos de proveedor</>}.
              {" "}Cargalos en las otras dos pestañas o tocá «Usar las sugeridas».
            </Aviso>
          )}
          {!semanasFiltradas.length ? (
            <Vacio icono={CalendarDays} titulo={busqueda ? "Nada coincide con la búsqueda" : "No hay nada para pedir en las próximas semanas"} texto={busqueda ? "Probá con otro término." : "Con las fechas cargadas, todo lo pendiente cae más adelante o ya está cubierto."} />
          ) : (
            <div className="cmp-grupos" style={{ gap: 16 }}>
              {semanasFiltradas.map((sem) => (
                <Grupo
                  key={sem.clave}
                  titulo={tituloSemana(sem, lunesHoy)}
                  cuenta={sem.proveedores.reduce((n, p) => n + p.productos.length, 0)}
                  tono={sem.clave === "atrasado" ? "rojo" : sem.inicio && isoFecha(sem.inicio) === isoFecha(lunesHoy) ? "azul" : "neutro"}
                  texto={sem.clave === "atrasado" ? "ya pasó la fecha de compra pero todavía llega antes de que se necesite si se pide ya" : `${sem.proveedores.length} ${sem.proveedores.length === 1 ? "proveedor" : "proveedores"}`}
                >
                  <div className="cal-provs">
                    {sem.proveedores.map((p) => {
                      const clave = `${sem.clave}|${p.proveedor}`;
                      const abiertoPorDefecto = sem.clave === "atrasado" || (sem.inicio && isoFecha(sem.inicio) === isoFecha(lunesHoy));
                      const abierto = abiertoPorDefecto !== invertidos.has(clave);
                      const obras = [...new Set(p.productos.flatMap((x) => x.obras.map((o) => o.obra)))];
                      const sinProv = p.proveedor === "Sin proveedor";
                      return (
                        <section key={clave} className="cmp-bloque" style={{ borderColor: sinProv ? "var(--red-border)" : undefined }}>
                          <div className="cmp-bloque-cab">
                            <button type="button" className="cmp-repo-plegar" onClick={() => alternar(clave)} aria-expanded={abierto}>
                              <ChevronRight size={16} className="chev" style={{ transform: abierto ? "rotate(90deg)" : "none" }} />
                              <span className="cmp-bloque-ic" data-tono={sinProv ? "rojo" : "azul"}><Truck size={16} /></span>
                              <span style={{ minWidth: 0 }}>
                                <span className="cmp-bloque-tit" style={{ display: "block" }}>{p.proveedor}</span>
                                <span className="cmp-bloque-txt" style={{ display: "block" }}>
                                  {p.productos.length} {p.productos.length === 1 ? "producto" : "productos"} · {sinProv ? "sin proveedor en la ficha" : <>entrega en <span className={p.plazoFuente === "cargado" ? "" : "cal-sug"}>{p.plazo} días ({FUENTE_PLAZO[p.plazoFuente]})</span></>} · {obras.slice(0, 5).join(", ")}{obras.length > 5 ? ` +${obras.length - 5}` : ""}
                                </span>
                              </span>
                            </button>
                            {!sinProv && (
                              <div className="der">
                                <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => copiar(p.proveedor, p.productos)}><Copy size={13} /> Copiar pedido</button>
                              </div>
                            )}
                          </div>
                          {abierto && (
                            <div className="cmp-bloque-cuerpo sin-pad">
                              {p.productos.map((x) => {
                                const kItem = `${x.linea}|${x.material_id}`;
                                return (
                                  <div key={x.material_id} className="cal-fila">
                                    <div style={{ minWidth: 0 }}>
                                      <div className="cal-nom">{x.descripcion}</div>
                                      <div className="cal-meta">
                                        {x.codigo && <span className="mono">{x.codigo}</span>}
                                        <span>{x.rubro}</span>
                                        <span>K{x.linea}</span>
                                      </div>
                                    </div>
                                    <div className="cal-obras">
                                      {x.obras.map((o) => <span key={o.obra} className="cal-obra" title={`Se necesita el ${dm(o.necesita)}`}>{o.obra} · <b className="mono">{fmt(o.cantidad)}</b></span>)}
                                    </div>
                                    <div className="cal-cifra">
                                      <b className="mono">{fmt(x.total)} <small>{x.unidad}</small></b>
                                      {x.deStock > 0 && <small className="cal-stock">+{fmt(x.deStock)} del pañol</small>}
                                    </div>
                                    <div className="cal-cifra">
                                      <b>{dm(x.comprarAntes)}</b>
                                      <small>pedir antes · se necesita {dm(x.necesita)}</small>
                                    </div>
                                    <div className="cal-semana">
                                      <span className={x.semanaFuente === "sugerida" ? "cal-sug" : ""}>sem. {x.semana}</span>
                                      <small>{FUENTE_SEMANA[x.semanaFuente]}</small>
                                      {editable && (
                                        <CampoNumero
                                          valor={datos.semanasItem.has(kItem) ? datos.semanasItem.get(kItem) : null}
                                          sugerido={null}
                                          ancho={54}
                                          titulo="Semana sólo para este ítem (vacío = la del rubro)"
                                          onGuardar={(v) => onSemanaItem(x.linea, x.material_id, v)}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </Grupo>
              ))}
            </div>
          )}

          <div className="cal-pie">
            {calendario.masAdelante > 0 && <span><b className="mono">{fmt(calendario.masAdelante)}</b> pedidos caen después de las {SEMANAS_A_LA_VISTA} semanas.</span>}
            {calendario.conStock.length > 0 && <span><b className="mono">{fmt(calendario.conStock.length)}</b> se cubren con stock libre del pañol (no hay que comprarlos, sí reservarlos).</span>}
            <span><b className="mono">{fmt(calendario.cubiertas)}</b> ya llegaron o están pedidos.</span>
          </div>

          {calendario.sinFecha.length > 0 && (
            <Aviso tono="cian" icono={Info}>
              Sin fecha porque el rubro no tiene semana ni sugerencia: {calendario.sinFecha.map((s) => `${s.rubro} (${s.items})`).join(", ")}.
              {" "}<button type="button" className="cmp-link" onClick={() => setVista("rubros")}>Cargar semanas</button>
            </Aviso>
          )}

          {calendario.aConfirmar.length > 0 && (
            <section className="cmp-bloque">
              <div className="cmp-bloque-cab">
                <button type="button" className="cmp-repo-plegar" onClick={() => setVerConfirmar((v) => !v)} aria-expanded={verConfirmar}>
                  <ChevronRight size={16} className="chev" style={{ transform: verConfirmar ? "rotate(90deg)" : "none" }} />
                  <span className="cmp-bloque-ic" data-tono="violeta"><AlertCircle size={16} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="cmp-bloque-tit" style={{ display: "block" }}>A confirmar con la obra · {fmt(calendario.aConfirmar.reduce((n, a) => n + a.items, 0))} ítems</span>
                    <span className="cmp-bloque-txt" style={{ display: "block" }}>Ya tendrían que estar en el barco y el sistema no los vio llegar. No se mandan a comprar solos: muchas veces se pusieron sin pasar por el pañol.</span>
                  </span>
                </button>
              </div>
              {verConfirmar && (
                <div className="cmp-bloque-cuerpo sin-pad">
                  {calendario.aConfirmar.map((a) => (
                    <div key={a.obra} className="cal-fila cal-fila-conf">
                      <div className="cal-nom">{a.obra}</div>
                      <div className="cal-meta">{a.rubros.slice(0, 4).map(([r, n]) => `${r} ${n}`).join(" · ")}{a.rubros.length > 4 ? " …" : ""}</div>
                      <div className="cal-cifra"><b className="mono">{fmt(a.items)}</b><small>ítems</small></div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : vista === "rubros" ? (
        <section className="cmp-bloque">
          <div className="cmp-bloque-cab">
            <span className="cmp-bloque-ic" data-tono="azul"><CalendarDays size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <h2 className="cmp-bloque-tit">Semana en que cada rubro tiene que estar en el pañol</h2>
              <p className="cmp-bloque-txt">Contando desde el desmolde: 0 = la semana del desmolde, 4 = un mes después, −2 = dos semanas antes. Vacío usa la sugerencia (en gris).</p>
            </div>
            {editable && <div className="der"><button type="button" className="ui-btn ui-btn-suave chico" onClick={usarSemanasSugeridas}>Usar las sugeridas en los vacíos</button></div>}
          </div>
          <div className="cmp-bloque-cuerpo sin-pad cmp-scroll-x">
            <table className="cal-tabla">
              <thead>
                <tr>
                  <th>Rubro</th>
                  {(linea === "todas" ? lineas : [linea]).map((l) => <th key={l}>K{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...new Map(rubros.map((r) => [r.categoria_id, r.rubro])).entries()]
                  .sort((a, b) => a[1].localeCompare(b[1], "es"))
                  .map(([categoriaId, nombre]) => (
                    <tr key={categoriaId}>
                      <td className="cal-rubro">{nombre}</td>
                      {(linea === "todas" ? lineas : [linea]).map((l) => {
                        const k = `${l}|${categoriaId}`;
                        const r = rubros.find((x) => x.linea === l && x.categoria_id === categoriaId);
                        if (!r) return <td key={l} className="cal-dim">—</td>;
                        const sug = sugeridas.get(k);
                        return (
                          <td key={l}>
                            <div className="cal-celda">
                              <CampoNumero
                                valor={datos.semanasRubro.has(k) ? datos.semanasRubro.get(k) : null}
                                sugerido={sug?.semana ?? null}
                                disabled={!editable}
                                titulo={sug ? `Sugerida: semana ${sug.semana} (${sug.fuente})` : "Sin sugerencia"}
                                onGuardar={(v) => onSemanaRubro(l, categoriaId, v)}
                              />
                              <small>{r.items} ítems{sug ? ` · sug. ${sug.semana} (${sug.fuente})` : ""}</small>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="cmp-bloque">
          <div className="cmp-bloque-cab">
            <span className="cmp-bloque-ic" data-tono="azul"><Truck size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <h2 className="cmp-bloque-tit">Días desde que se pide hasta que llega</h2>
              <p className="cmp-bloque-txt">Vacío usa la sugerencia: lo medido en sus pedidos recibidos, o la mediana general ({datos.plazoGeneral} días sobre {datos.pedidosMedidos} pedidos).</p>
            </div>
            {editable && <div className="der"><button type="button" className="ui-btn ui-btn-suave chico" onClick={usarPlazosSugeridos}>Usar los sugeridos en los vacíos</button></div>}
          </div>
          <div className="cmp-bloque-cuerpo sin-pad">
            {proveedores
              .filter((p) => linea === "todas" || p.lineas.has(linea))
              .filter((p) => !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
              .map((p) => {
                const sug = plazosSugeridos.get(p.clave);
                return (
                  <div key={p.clave} className="cal-fila cal-fila-prov">
                    <div style={{ minWidth: 0 }}>
                      <div className="cal-nom">{p.nombre}</div>
                      <div className="cal-meta"><span>{p.items} ítems de matriz</span><span>{[...p.lineas].sort().map((l) => `K${l}`).join(", ")}</span></div>
                    </div>
                    <div className="cal-celda cal-celda-der">
                      <CampoNumero valor={datos.plazos.has(p.clave) ? datos.plazos.get(p.clave) : null} sugerido={sug?.dias ?? null} min={0} max={365} disabled={!editable} titulo={sug ? `Sugerido: ${sug.dias} días (${sug.fuente})` : ""} onGuardar={(v) => onPlazo(p.nombre, v)} />
                      <small>días · sug. {sug?.dias} ({sug?.fuente})</small>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

const CSS = `
.cal-root { display: grid; gap: 12px; }
.cal-root .cal-cuenta { margin-left: 6px; font-family: "JetBrains Mono", monospace; font-size: 10.5px; color: var(--cyan); }
.cal-root .cal-provs { display: grid; gap: 8px; }
.cal-root .cal-fila { display: grid; grid-template-columns: minmax(200px, 2fr) minmax(140px, 1.4fr) 110px 150px 150px; gap: 12px; align-items: center; padding: 9px 14px; border-top: 1px solid var(--border); }
.cal-root .cal-fila-conf { grid-template-columns: 90px minmax(0, 1fr) 80px; }
.cal-root .cal-fila-prov { grid-template-columns: minmax(0, 1fr) auto; }
.cal-root .cal-nom { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-root .cal-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.cal-root .cal-meta .mono { color: var(--blue); }
.cal-root .cal-obras { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.cal-root .cal-obra { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--blue-border); background: var(--blue-soft); color: var(--blue); white-space: nowrap; }
.cal-root .cal-cifra { display: grid; gap: 1px; }
.cal-root .cal-cifra b { font-size: 13.5px; font-weight: 600; }
.cal-root .cal-cifra small, .cal-root .cal-semana small, .cal-root .cal-celda small { font-size: 10.5px; color: var(--dim); }
.cal-root .cal-stock { color: var(--teal) !important; }
.cal-root .cal-semana { display: grid; grid-template-columns: auto auto; gap: 2px 8px; align-items: center; justify-content: start; font-size: 12.5px; font-weight: 600; }
.cal-root .cal-semana small { grid-column: 1; }
.cal-root .cal-semana .cal-num { grid-column: 2; grid-row: 1 / span 2; }
.cal-root .cal-sug { font-style: italic; color: var(--muted); font-weight: 500; }
.cal-root .cal-num { height: 32px; padding: 4px 8px; font-family: "JetBrains Mono", monospace; font-size: 13px; text-align: right; }
.cal-root .cal-num.is-vacio::placeholder { color: var(--subtle); font-style: italic; }
.cal-root .cal-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
.cal-root .cal-tabla th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); padding: 9px 14px; border-bottom: 1px solid var(--border); }
.cal-root .cal-tabla td { padding: 8px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.cal-root .cal-rubro { font-weight: 600; white-space: nowrap; }
.cal-root .cal-dim { color: var(--subtle); }
.cal-root .cal-celda { display: grid; gap: 3px; justify-items: start; }
.cal-root .cal-celda-der { justify-items: end; }
.cal-root .cal-pie { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--dim); padding: 2px 4px; }
.cal-root .cal-pie b { color: var(--text); }
@media (max-width: 900px) {
  .cal-root .cal-fila { grid-template-columns: minmax(0, 1fr) auto; }
  .cal-root .cal-fila .cal-obras { grid-column: 1 / -1; }
  .cal-root .cal-fila-conf { grid-template-columns: 70px minmax(0, 1fr) auto; }
  .cal-root .cal-fila-prov { grid-template-columns: minmax(0, 1fr) auto; }
}
`;
