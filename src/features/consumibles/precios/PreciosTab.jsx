import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { hoyArgentina } from "@/features/consumibles/api";
import { compararCostos, fechaPrecio, listaAnterior, mismoProveedor, pesos, puedeGestionarPrecios } from "./preciosLogica.js";
import { preciosApi } from "./preciosApi.js";
import ComparacionPrecios from "./ComparacionPrecios.jsx";
import HistorialCosto from "./HistorialCosto.jsx";
import ImportarLista from "./ImportarLista.jsx";
import { PRECIOS_CSS } from "./preciosEstilos.js";

export default function PreciosTab({ profile, sede, irA }) {
  const [revision, setRevision] = useState(0);
  const [respuesta, setRespuesta] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [proveedorFiltro, setProveedorFiltro] = useState("");
  const [importando, setImportando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const gestionar = puedeGestionarPrecios(profile);
  const toast = useToast();

  useEffect(() => {
    let vigente = true;
    preciosApi.fetchListas().then((listas) => { if (vigente) setRespuesta({ revision, listas }); })
      .catch((error) => { if (vigente) setRespuesta({ revision, error }); });
    return () => { vigente = false; };
  }, [revision]);

  const listas = respuesta?.listas ?? [];
  const filtradas = listas.filter((l) => !proveedorFiltro || l.proveedor_nombre === proveedorFiltro);
  const actual = filtradas.find((l) => l.id === seleccion) ?? filtradas[0] ?? null;
  const cargando = respuesta?.revision !== revision;
  const proveedores = [...new Set(listas.map((l) => l.proveedor_nombre))];

  function guardada(id) {
    setSeleccion(id);
    setProveedorFiltro("");
    setImportando(false);
    setRevision((r) => r + 1);
    toast.success("Lista guardada. Revisá la comparación antes de pasar los costos.");
  }

  return (
    <div className="precios-root">
      <style>{PRECIOS_CSS}</style>
      <div className="precios-encabezado"><div><h2>Listas y costos</h2><p className="precios-ayuda">Precios por proveedor, historial y costo vigente. Comunes a Chubut y Pampa{sede ? ` · Equipo en ${sede}` : ""}.</p></div><div className="precios-acciones">
        <button type="button" className="ui-btn ui-btn-icono" aria-label="Actualizar listas" title="Actualizar listas" disabled={cargando || ocupado || importando} onClick={() => setRevision((r) => r + 1)}><RefreshCw size={16} /></button>
        {gestionar && <button type="button" className="ui-btn ui-btn-primario" disabled={ocupado || importando || cargando || !!respuesta?.error} onClick={() => setImportando(true)}><Upload size={16} />Subir lista</button>}
      </div></div>
      {!gestionar && <p className="precios-aviso">Tenés acceso de consulta. Administración, Compras y Técnica pueden subir listas y pasar costos.</p>}
      {cargando ? <Cargando texto="Trayendo las listas de precios…" /> : respuesta.error ? <div role="alert" className="precios-error">No pude traer las listas. {respuesta.error.message}<button className="ui-btn" type="button" onClick={() => setRevision((r) => r + 1)}>Reintentar</button></div> : <>
        {importando && gestionar && <ImportarLista listas={listas} seleccionada={actual} onCerrar={() => setImportando(false)} onGuardada={guardada} />}
        {!listas.length ? <div className="precios-panel precios-vacio"><FileSpreadsheet size={28} /><h3>Todavía no hay listas de precios</h3><p>{gestionar ? "Subí el Excel del proveedor para revisar los costos y guardar la primera lista." : "Cuando Compras cargue una lista, vas a poder consultar sus precios e historial acá."}</p></div> : <div className="precios-layout">
          <aside className="precios-panel precios-listas" aria-label="Listas guardadas">
            <h3>Listas cargadas</h3>
            <label className="precios-label">Proveedor<select className="ui-input" value={proveedorFiltro} disabled={ocupado || importando} onChange={(e) => { setProveedorFiltro(e.target.value); setSeleccion(null); }}><option value="">Todos los proveedores</option>{proveedores.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
            <label className="precios-label precios-selector-celular">Lista<select className="ui-input" value={actual?.id ?? ""} disabled={ocupado || importando} onChange={(e) => setSeleccion(e.target.value)}>{filtradas.map((l) => <option key={l.id} value={l.id}>{fechaPrecio(l.vigente_desde)} · {l.proveedor_nombre}</option>)}</select></label>
            <div className="precios-listas-scroll">{filtradas.map((lista) => <button type="button" key={lista.id} className={`precios-lista${lista.id === actual?.id ? " is-activa" : ""}`} aria-pressed={lista.id === actual?.id} disabled={ocupado || importando} onClick={() => setSeleccion(lista.id)}>
              <strong>{lista.proveedor_nombre}</strong><span>Vigencia <span className="precios-num">{fechaPrecio(lista.vigente_desde)}</span></span><span><span className="precios-num">{lista.renglones}</span> renglones · USD <span className="precios-num">{pesos(lista.dolar_vendedor)}</span></span><small title={lista.created_by || ""}>{lista.autor} · <span className="precios-num">{fechaPrecio(lista.created_at, true)}</span></small>
            </button>)}</div>
          </aside>
          {actual && <DetalleLista key={actual.id} lista={actual} listas={listas} gestionar={gestionar} irA={irA} ocupadoExterno={importando} onOcupado={setOcupado} />}
        </div>}
      </>}
    </div>
  );
}

function DetalleLista({ lista, listas, gestionar, irA, ocupadoExterno, onOcupado }) {
  const [respuesta, setRespuesta] = useState(null);
  const [revision, setRevision] = useState(0);
  const [planRespuesta, setPlanRespuesta] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [pasando, setPasando] = useState(false);
  const [avance, setAvance] = useState(null);
  const [errorCostos, setErrorCostos] = useState("");
  const confirmar = useConfirm();
  const toast = useToast();
  const anterior = listaAnterior(listas, lista);
  const anteriorId = anterior?.id ?? null;
  const listaId = lista.id;
  const clave = `${listaId}:${anteriorId || "primera"}:${revision}`;

  useEffect(() => {
    let vigente = true;
    Promise.all([preciosApi.fetchItems(listaId), anteriorId ? preciosApi.fetchItems(anteriorId) : Promise.resolve([])])
      .then(([items, anteriores]) => { if (vigente) setRespuesta({ clave, items, anteriores }); })
      .catch((error) => { if (vigente) setRespuesta({ clave, error }); });
    if (gestionar) preciosApi.prepararCostos(listaId)
      .then((plan) => { if (vigente) setPlanRespuesta({ clave, plan }); })
      .catch((error) => { if (vigente) setPlanRespuesta({ clave, error }); });
    return () => { vigente = false; };
  }, [listaId, anteriorId, clave, gestionar]);

  const cargando = respuesta?.clave !== clave;
  const plan = planRespuesta?.clave === clave ? planRespuesta.plan : null;
  const filas = useMemo(() => compararCostos(respuesta?.anteriores ?? [], respuesta?.items ?? []), [respuesta]);
  const sinFactor = plan?.actualizaciones.filter((r) => r.sin_factor).length ?? 0;
  const masNueva = listas.find((l) => mismoProveedor(l, lista));
  const historica = masNueva?.id !== lista.id;
  const futura = lista.vigente_desde > hoyArgentina();

  async function pasarCostos() {
    if (!gestionar || pasando || ocupadoExterno) return;
    setPasando(true);
    onOcupado(true);
    setErrorCostos("");
    setAvance(null);
    try {
      const fresco = await preciosApi.prepararCostos(lista.id);
      setPlanRespuesta({ clave, plan: fresco });
      if (fresco.repetidos.length) throw new Error("Hay consumibles vinculados a más de un código de esta lista. Corregí los vínculos en Catálogo antes de pasar costos.");
      if (!fresco.actualizaciones.length) throw new Error("No hay consumibles vinculados con costo válido para actualizar.");
      const sinFactorAhora = fresco.actualizaciones.filter((r) => r.sin_factor).length;
      const ok = await confirmar({ title: "¿Pasar estos costos a los consumibles?", confirmLabel: "Pasar costos", cancelLabel: "Volver",
        message: `Vas a actualizar ${fresco.actualizaciones.length} consumibles con la lista de ${lista.proveedor_nombre}, vigente desde el ${fechaPrecio(lista.vigente_desde)}.\n\nEl costo por unidad de entrega se calcula con el factor de compra de cada ficha. ${sinFactorAhora ? `${sinFactorAhora} no tienen factor: se usa el costo completo de compra.` : "Todos tienen factor de compra."}${fresco.omitidos.length ? `\nSe omiten ${fresco.omitidos.length} renglones sin costo válido o que no apuntan a consumibles.` : ""}\n\nEl cambio vale para Chubut y Pampa y reemplaza los costos vigentes.${historica ? "\nElegiste una lista histórica: los costos pueden retroceder." : ""}${futura ? "\nLa vigencia es futura: los costos se aplican ahora." : ""}` });
      if (!ok) return;
      const cantidad = await preciosApi.aplicarCostos(lista.id, fresco, (actualizados, total) => setAvance({ actualizados, total }));
      toast.success(`Se actualizaron los costos de ${cantidad} consumibles.`);
    } catch (causa) {
      setErrorCostos(causa.message || "No pude pasar los costos.");
      toast.error(causa.message || "No pude pasar los costos.");
    } finally {
      setPasando(false);
      setAvance(null);
      onOcupado(false);
    }
  }

  return (
    <div className="precios-contenido">
      <section className="precios-panel">
        <div className="precios-titulo-fila"><div><h2>{lista.proveedor_nombre}</h2><p className="precios-ayuda">{lista.archivo_nombre || "Lista de precios"}</p></div></div>
        <dl className="precios-metadata"><div><dt>Vigente desde</dt><dd className="precios-num">{fechaPrecio(lista.vigente_desde)}</dd></div><div><dt>Renglones</dt><dd className="precios-num">{lista.renglones}</dd></div><div><dt>Dólar vendedor usado</dt><dd className="precios-num">{pesos(lista.dolar_vendedor)}</dd></div><div><dt>Cargada por</dt><dd title={lista.created_by || ""}>{lista.autor}</dd></div><div><dt>Cargada el</dt><dd className="precios-num">{fechaPrecio(lista.created_at, true)}</dd></div></dl>
        {lista.notas && <details className="precios-detalles"><summary>Notas de la lista</summary><p style={{ whiteSpace: "pre-wrap" }}>{lista.notas}</p></details>}
        {gestionar && <div className="precios-pasar">
          {planRespuesta?.clave !== clave ? <Cargando compacto texto="Calculando consumibles vinculados…" /> : planRespuesta.error ? <div role="alert" className="precios-error">No pude calcular los costos. {planRespuesta.error.message}<button type="button" className="ui-btn" disabled={pasando} onClick={() => setRevision((r) => r + 1)}>Reintentar</button></div> : <>
            <div><strong className="precios-num">{plan.actualizaciones.length}</strong> consumibles para actualizar.<p className="precios-ayuda">{sinFactor ? `${sinFactor} sin factor de compra: se usa el costo completo.` : "Se respeta el factor de compra de cada ficha."}{plan.omitidos.length > 0 && ` ${plan.omitidos.length} renglones vinculados se omiten por datos inválidos.`}</p></div>
            <button type="button" className="ui-btn ui-btn-primario" disabled={pasando || ocupadoExterno || !plan.actualizaciones.length || !!plan.repetidos.length || cargando || !!respuesta?.error} onClick={pasarCostos}>Pasar costos a los consumibles<ArrowRight size={16} /></button>
            {plan.repetidos.length > 0 && <p className="precios-error">Hay <span className="precios-num">{plan.repetidos.length}</span> consumibles con más de un código en esta lista. Revisá los vínculos en Catálogo.</p>}
            {plan.actualizaciones.length === 0 && !plan.repetidos.length && irA && <button type="button" className="ui-btn ui-btn-suave" disabled={pasando || ocupadoExterno} onClick={() => irA("catalogo")}>Vinculá los códigos desde Catálogo<ArrowRight size={14} /></button>}
            {(historica || futura) && <p className="precios-aviso">{historica && "Esta es una lista histórica. "}{futura && "Esta lista tiene vigencia futura. "}Al pasar costos, reemplazás el costo vigente ahora.</p>}
          </>}
          {pasando && <Cargando compacto texto={avance ? `Actualizando costos: ${avance.actualizados} de ${avance.total}…` : "Revisando costos y confirmación…"} />}
          {errorCostos && <div role="alert" className="precios-error">{errorCostos}</div>}
        </div>}
      </section>
      {historial && <HistorialCosto key={`${lista.id}:${historial.codigo}`} producto={historial} proveedor={lista} onCerrar={() => setHistorial(null)} />}
      {cargando ? <Cargando texto="Comparando con la lista anterior…" /> : respuesta.error ? <div role="alert" className="precios-error">No pude comparar las listas. {respuesta.error.message}<button className="ui-btn" type="button" disabled={pasando} onClick={() => setRevision((r) => r + 1)}>Reintentar</button></div> : <ComparacionPrecios filas={filas} referencia={anterior ? `Contra la lista del ${fechaPrecio(anterior.vigente_desde)}` : "Primera lista del proveedor: todos los códigos son nuevos"} onHistorial={setHistorial} />}
    </div>
  );
}
