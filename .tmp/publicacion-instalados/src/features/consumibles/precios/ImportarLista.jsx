import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { hoyArgentina, nuevoId } from "@/features/consumibles/api";
import { cuandoSeActualizo, dolarGuardado, fetchDolarOficial } from "@/lib/dolarOficial";
import { normalizarLista } from "./normalizarLista.js";
import { claveNombre, compararCostos, fechaPrecio, fechaValida, heredarMateriales, listaAnterior, numeroPrecio, pesos, problemasRenglon } from "./preciosLogica.js";
import { preciosApi } from "./preciosApi.js";
import { leerExcel } from "./leerExcel.js";
import ComparacionPrecios from "./ComparacionPrecios.jsx";

export default function ImportarLista({ listas, seleccionada, onCerrar, onGuardada }) {
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [nombre, setNombre] = useState(seleccionada?.proveedor_nombre ?? "");
  const [fecha, setFecha] = useState(hoyArgentina);
  const [sugerencia, setSugerencia] = useState(dolarGuardado);
  const [dolar, setDolar] = useState(() => String(dolarGuardado()?.venta ?? ""));
  const [fechaCarga] = useState(() => new Date().toISOString());
  const [respuestaAnterior, setRespuestaAnterior] = useState(null);
  const [aceptoAvisos, setAceptoAvisos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pendiente, setPendiente] = useState(null);
  const [error, setError] = useState("");
  const dolarEditado = useRef(false);
  const archivoTurno = useRef(0);
  const [revisionAnterior, setRevisionAnterior] = useState(0);

  useEffect(() => {
    let vigente = true;
    fetchDolarOficial().then((valor) => {
      if (!vigente) return;
      setSugerencia(valor);
      if (valor && !dolarEditado.current) setDolar(String(valor.venta));
    });
    return () => { vigente = false; archivoTurno.current += 1; };
  }, []);

  const proveedores = useMemo(() => {
    const unicos = new Map();
    for (const lista of listas) {
      const clave = claveNombre(lista.proveedor_nombre);
      if (!unicos.has(clave) || (!unicos.get(clave).proveedor_id && lista.proveedor_id)) unicos.set(clave, lista);
    }
    return [...unicos.values()];
  }, [listas]);
  const proveedor = proveedores.find((p) => claveNombre(p.proveedor_nombre) === claveNombre(nombre));
  const meta = { id: "vista-previa", proveedor_id: proveedor?.proveedor_id ?? null, proveedor_nombre: nombre.trim(), vigente_desde: fecha, created_at: fechaCarga };
  const anterior = listaAnterior(listas, meta);
  const anteriorId = anterior?.id ?? null;
  const claveAnterior = `${anteriorId || "sin-anterior"}:${revisionAnterior}`;

  useEffect(() => {
    let vigente = true;
    const consulta = anteriorId ? preciosApi.fetchItems(anteriorId) : Promise.resolve([]);
    consulta.then((items) => { if (vigente) setRespuestaAnterior({ clave: claveAnterior, items }); })
      .catch((causa) => { if (vigente) setRespuestaAnterior({ clave: claveAnterior, error: causa }); });
    return () => { vigente = false; };
  }, [anteriorId, claveAnterior]);

  const cargandoAnterior = respuestaAnterior?.clave !== claveAnterior;
  const anteriores = useMemo(() => respuestaAnterior?.clave === claveAnterior ? respuestaAnterior.items ?? [] : [], [respuestaAnterior, claveAnterior]);
  const normalizada = useMemo(() => archivo ? normalizarLista(archivo.filas, { dolar: numeroPrecio(dolar) }) : null, [archivo, dolar]);
  const renglones = useMemo(() => heredarMateriales(normalizada?.renglones ?? [], anteriores), [normalizada, anteriores]);
  const problemas = renglones.map((r) => ({ renglon: r, problemas: problemasRenglon(r) })).filter((r) => r.problemas.length);
  const comparacion = useMemo(() => compararCostos(anteriores, renglones), [anteriores, renglones]);
  const usd = renglones.filter((r) => r.moneda === "USD").length;
  const vinculados = new Set(renglones.map((r) => r.material_id).filter(Boolean)).size;
  const dolarValido = numeroPrecio(dolar) > 0;
  const avisos = normalizada?.avisos ?? [];
  const listo = renglones.length > 0 && nombre.trim() && fechaValida(fecha) && !problemas.length
    && (!usd || dolarValido) && (dolar.trim() === "" || dolarValido)
    && !cargandoAnterior && !respuestaAnterior?.error && (!avisos.length || aceptoAvisos);

  async function elegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const turno = ++archivoTurno.current;
    setError("");
    setArchivo(null);
    setAceptoAvisos(false);
    setLeyendo(true);
    try {
      if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) throw new Error("Elegí un archivo Excel (.xlsx, .xls o .xlsm).");
      if (file.size > 15 * 1024 * 1024) throw new Error("El Excel supera los 15 MB. Guardá una copia con la hoja de precios sola.");
      const datos = await leerExcel(await file.arrayBuffer());
      if (turno !== archivoTurno.current) return;
      const vista = normalizarLista(datos.filas);
      setArchivo({ ...datos, nombre: file.name });
      if (fechaValida(vista.vigenteDesde)) setFecha(vista.vigenteDesde);
    } catch (causa) {
      if (turno === archivoTurno.current) setError(causa.message || "No pude leer el Excel.");
    } finally {
      if (turno === archivoTurno.current) setLeyendo(false);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando || (!pendiente && !listo)) return;
    const datos = pendiente ?? {
      cabecera: { id: nuevoId(), proveedor_id: meta.proveedor_id, proveedor_nombre: proveedor?.proveedor_nombre ?? nombre.trim(),
        vigente_desde: fecha, archivo_nombre: archivo.nombre, dolar_vendedor: dolarValido ? numeroPrecio(dolar) : null,
        notas: [normalizada.titulo, normalizada.notas.length ? `Notas al pie descartadas:\n${normalizada.notas.join("\n")}` : "", avisos.length ? `Avisos revisados:\n${avisos.join("\n")}` : ""].filter(Boolean).join("\n\n") || null },
      renglones, anterior: anteriores,
    };
    setGuardando(true);
    setPendiente(datos);
    setError("");
    try {
      const id = await preciosApi.guardarLista(datos);
      onGuardada(id);
    } catch (causa) {
      setError(causa.message || "No pude guardar la lista.");
      if (!causa.cargaPendiente) setPendiente(null);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="precios-importar precios-panel" aria-label="Subir lista de Excel">
      <div className="precios-titulo-fila"><div><h2>Nueva lista de precios</h2><p className="precios-ayuda">Revisá el Excel, la vigencia y el dólar antes de guardarlo.</p></div><button type="button" className="ui-btn ui-btn-icono ui-btn-fantasma" disabled={guardando || !!pendiente || leyendo} onClick={onCerrar} aria-label="Cerrar carga de lista"><X size={18} /></button></div>
      <form onSubmit={guardar}>
        <fieldset disabled={guardando || !!pendiente} className="precios-campos">
          <label className="precios-archivo"><FileSpreadsheet size={22} /><span>{archivo ? archivo.nombre : "Elegí el Excel de precios"}<small>{archivo ? `Hoja: ${archivo.hoja}` : ".xlsx, .xls o .xlsm · Hasta 15 MB"}</small></span><input type="file" accept=".xlsx,.xls,.xlsm" disabled={leyendo} onChange={elegirArchivo} /></label>
          <div className="precios-form-grid">
            <label>Proveedor<input className="ui-input" list="consumibles-precios-proveedores" required value={nombre} placeholder="Escribí el nombre del proveedor" onChange={(e) => setNombre(e.target.value)} /><datalist id="consumibles-precios-proveedores">{proveedores.map((p) => <option key={claveNombre(p.proveedor_nombre)} value={p.proveedor_nombre} />)}</datalist></label>
            <label>Vigente desde<input className="ui-input precios-num" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label>Dólar vendedor BNA<input className="ui-input precios-num" inputMode="decimal" value={dolar} placeholder="Ej.: 1.450,50" onChange={(e) => { dolarEditado.current = true; setDolar(e.target.value); }} /><small>{sugerencia ? `Sugerido: ${pesos(sugerencia.venta)} · ${cuandoSeActualizo(sugerencia.fecha) || "sin fecha informada"}${sugerencia.origen === "viejo" ? " · Cotización guardada: revisala" : ""}` : "No hay cotización disponible. Cargá el vendedor a mano."}</small></label>
          </div>
          <p className="precios-ayuda">El dólar queda congelado en esta lista. Si todo está en pesos, podés dejarlo vacío. +IVA y Final conservan el precio como costo.</p>
        </fieldset>
        {error && <div role="alert" className="precios-error">{error}</div>}
        {pendiente && !guardando && <p className="precios-aviso">Hay una carga pendiente de confirmar. Reintentá con esta misma vista previa para evitar duplicados.</p>}
        {leyendo && <Cargando texto="Leyendo el Excel…" />}
        {normalizada && <>
          <div className="precios-resumen">
            <div><span>Renglones</span><strong className="precios-num">{renglones.length}</strong></div>
            <div><span>En USD</span><strong className="precios-num">{usd}</strong></div>
            <div><span>Notas descartadas</span><strong className="precios-num">{normalizada.notas.length}</strong></div>
            <div><span>Con problemas</span><strong className="precios-num" style={{ color: problemas.length ? "var(--red)" : "var(--green)" }}>{problemas.length}</strong></div>
          </div>
          <p className="precios-ayuda"><span className="precios-num">{vinculados}</span> consumibles heredan el vínculo por código de la lista anterior del proveedor.</p>
          {normalizada.notas.length > 0 && <details className="precios-detalles"><summary>Ver notas al pie descartadas</summary><ul>{normalizada.notas.map((nota, i) => <li key={i}>{nota}</li>)}</ul></details>}
          {avisos.length > 0 && <details open className="precios-detalles precios-aviso"><summary>Avisos del Excel · <span className="precios-num">{avisos.length}</span></summary><ul>{avisos.map((aviso, i) => <li key={i}>{aviso}</li>)}</ul><label className="precios-check"><input type="checkbox" checked={aceptoAvisos} disabled={guardando || !!pendiente} onChange={(e) => setAceptoAvisos(e.target.checked)} />Revisé los avisos y los renglones que no se cargan.</label></details>}
          {problemas.length > 0 && <details open className="precios-detalles precios-error"><summary>Corregí estos renglones en el Excel y volvé a subirlo</summary><ul>{problemas.map(({ renglon, problemas: motivos }) => <li key={renglon.codigo}>Fila <span className="precios-num">{renglon.fila}</span> · <span className="precios-num">{renglon.codigo}</span> · {motivos.join(" · ")}</li>)}</ul></details>}
          {!renglones.length && <p className="precios-aviso">La hoja no tiene renglones de productos para guardar.</p>}
          {!fechaValida(fecha) && <p className="precios-error">Elegí una fecha de vigencia válida.</p>}
          {dolar.trim() && !dolarValido && <p className="precios-error">El dólar vendedor tiene que ser un número mayor que cero.</p>}
          {respuestaAnterior?.error && <div className="precios-error" role="alert">No pude leer la lista anterior. {respuestaAnterior.error.message}<button type="button" className="ui-btn" onClick={() => setRevisionAnterior(revisionAnterior + 1)}>Reintentar comparación</button></div>}
          {cargandoAnterior ? <Cargando texto="Buscando vínculos y costos anteriores…" /> : !respuestaAnterior?.error && <ComparacionPrecios key={claveAnterior} filas={comparacion} referencia={anterior ? `Contra la lista del ${fechaPrecio(anterior.vigente_desde)}` : "Primera lista del proveedor: todos los códigos son nuevos"} />}
          <div className="precios-guardar"><span className="precios-ayuda">Guardar la lista conserva el historial. Pasar costos se confirma después.</span><button type="submit" className="ui-btn ui-btn-primario" disabled={guardando || leyendo || (!pendiente && !listo)}><Upload size={16} />{guardando ? "Guardando lista…" : pendiente ? "Reintentar guardado" : "Guardar lista"}</button></div>
        </>}
      </form>
    </section>
  );
}
