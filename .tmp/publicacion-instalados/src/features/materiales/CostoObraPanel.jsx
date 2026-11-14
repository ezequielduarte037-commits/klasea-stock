import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  aplicarPrecioMaterial,
  fetchConjuntos,
  guardarPrecioConjunto,
  marcarSinPrecio,
  MOTIVOS_SIN_PRECIO,
  proveedoresDeMaterial,
  rubroDeLista,
} from "./api";
import { fmtMoney } from "./format";
import { MODELOS, VARIANTE_BASE, VARIANTE_LINEA_EJE } from "./materialesParser";

/**
 * Costo de la matriz de una línea (K37, K52 o K55), con la misma regla para las tres.
 *
 * Cantidad: la fila estándar de panol_material_modelo. La línea de eje, si el
 * modelo la tiene, se muestra aparte y no entra en el total.
 * Precio: el último que un proveedor le cargó al material (historial, vínculo
 * o ficha). Pesos y dólares no se convierten.
 * Conjunto: un precio por el trabajo entero. Esas piezas no se cotizan sueltas.
 */

const LOTE = 12;

function numero(valor) {
  const bruto = String(valor ?? "").trim().replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cantidadDe(material, modelo, variante) {
  const fila = (material?.modelos || []).find(
    (row) => String(row.modelo) === String(modelo) && (row.variante || VARIANTE_BASE) === variante,
  );
  return numero(fila?.cantidad);
}

function montoDesdeTexto(valor) {
  const limpio = String(valor ?? "").replace(/[^\d,.]/g, "").trim();
  if (!limpio) return null;
  let normal = limpio;
  if (limpio.includes(",")) normal = limpio.replace(/\./g, "").replace(",", ".");
  else {
    const puntos = limpio.match(/\./g) ?? [];
    const ultimo = limpio.slice(limpio.lastIndexOf(".") + 1);
    if (puntos.length > 1 || (puntos.length === 1 && ultimo.length === 3)) normal = limpio.replace(/\./g, "");
  }
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fechaCorta(fecha) {
  const m = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function ultimoPrecio(material) {
  const row = proveedoresDeMaterial(material).find((item) => item.precio != null && Number(item.precio) > 0);
  if (row) {
    return {
      precio: Number(row.precio),
      moneda: row.moneda === "USD" ? "USD" : "ARS",
      proveedor: row.proveedor || "",
      proveedorId: row.proveedorId || null,
      fecha: row.fecha || null,
    };
  }
  // Un precio en la ficha sin proveedor ni historial -la hélice del K52, por
  // ejemplo- no aparece en proveedoresDeMaterial, que agrupa por proveedor y
  // descarta lo que no dice de quién es. Tirarlo mostraba como "sin precio"
  // algo que tiene precio, y esta pantalla daba otro total que la tarjeta de
  // la línea. Entra sin proveedor y sin fecha, y así se ve.
  const ficha = Number(material?.precio_unitario);
  if (!(Number.isFinite(ficha) && ficha > 0)) return null;
  return {
    precio: ficha,
    moneda: material.moneda === "USD" ? "USD" : "ARS",
    proveedor: "",
    proveedorId: null,
    fecha: null,
  };
}

function proveedoresDelMaterial(material) {
  const vistos = new Map();
  for (const row of proveedoresDeMaterial(material)) {
    const id = row.proveedorId || `nombre:${row.proveedor || ""}`;
    if (!vistos.has(id)) vistos.set(id, { id: row.proveedorId || null, nombre: row.proveedor || "Sin proveedor" });
  }
  if (!vistos.size && material?.proveedor) {
    vistos.set(`nombre:${material.proveedor}`, { id: material.proveedor_id || null, nombre: material.proveedor });
  }
  return [...vistos.values()];
}

function armarFilas(materiales, modelo, conjuntoDe, categorias) {
  const base = [];
  const eje = [];
  for (const material of materiales) {
    if (material?.activo === false) continue;
    const cantBase = cantidadDe(material, modelo, VARIANTE_BASE);
    const cantEje = cantidadDe(material, modelo, VARIANTE_LINEA_EJE);
    const precio = ultimoPrecio(material);
    const rubro = rubroDeLista(categorias, material.categoria_id);
    const comun = { material, precio, rubro, proveedores: proveedoresDelMaterial(material) };
    if (cantEje) eje.push({ ...comun, cantidad: cantEje });
    if (!cantBase) continue;
    const conjunto = conjuntoDe.get(material.id) || null;
    // "Especificado" sólo vale si no hay precio: si alguien después le cargó
    // uno, ese precio manda, porque fue una decisión explícita de costearlo.
    const especificado = !conjunto && !precio ? (material.sin_precio_motivo || null) : null;
    base.push({
      ...comun,
      cantidad: cantBase,
      conjunto,
      especificado,
      falta: !conjunto && !precio && !especificado,
      costo: !conjunto && precio ? cantBase * precio.precio : 0,
      moneda: precio?.moneda || "ARS",
    });
  }
  return { base, eje };
}

/**
 * Cuenta una lista de filas.
 *
 * "Resueltos" es lo que ya no hay que pedirle a nadie: lo que tiene precio, lo
 * que está en un conjunto ya cotizado y lo especificado. Es contra eso que se
 * mide la cobertura: un ítem que se fabrica en el astillero no puede quedar
 * para siempre como el 1% que falta.
 */
function sumar(filas) {
  const acc = { items: 0, conPrecio: 0, sinPrecio: 0, enConjunto: 0, enConjuntoCotizado: 0, especificados: 0, resueltos: 0, usd: 0, ars: 0 };
  for (const fila of filas) {
    acc.items += 1;
    if (fila.conjunto) {
      acc.enConjunto += 1;
      if (Number(fila.conjunto.precio) > 0) { acc.enConjuntoCotizado += 1; acc.resueltos += 1; }
      continue;
    }
    if (fila.especificado) { acc.especificados += 1; acc.resueltos += 1; continue; }
    if (fila.falta) { acc.sinPrecio += 1; continue; }
    acc.conPrecio += 1;
    acc.resueltos += 1;
    if (fila.moneda === "USD") acc.usd += fila.costo;
    else acc.ars += fila.costo;
  }
  return acc;
}

function dinero(fila) {
  if (fila.conjunto) return "En el conjunto";
  if (fila.especificado) return "Especificado";
  if (fila.falta) return "Sin precio";
  return fmtMoney(fila.costo, fila.moneda);
}

function CampoPrecio({ ocupado, onGuardar }) {
  const [texto, setTexto] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  return (
    <div className="costo-obra-precio">
      <input
        className="ui-input costo-obra-importe"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!texto.trim()) return;
          onGuardar(texto, moneda);
          setTexto("");
        }}
        disabled={ocupado}
        placeholder="Precio"
        inputMode="decimal"
        aria-label="Precio"
      />
      <button
        type="button"
        className="ui-btn ui-btn-fantasma costo-obra-moneda"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setMoneda((actual) => (actual === "ARS" ? "USD" : "ARS"))}
      >
        {moneda === "USD" ? "US$" : "$"}
      </button>
    </div>
  );
}

function FilaMaterial({ fila, ocupado, onDesmarcar }) {
  const meta = fila.conjunto
    ? fila.conjunto.nombre
    : fila.especificado
      ? fila.especificado
      : [fila.precio?.proveedor || "Sin proveedor", fechaCorta(fila.precio?.fecha)].filter(Boolean).join(" · ");
  const clase = fila.falta ? " falta" : fila.especificado ? " especificado" : "";
  return (
    <div className={`costo-obra-mat${clase}`}>
      <div className="costo-obra-mat-texto">
        <div className="costo-obra-mat-nombre">{fila.material.descripcion}</div>
        <div className="costo-obra-mat-meta">{fila.cantidad} {fila.material.unidad_medida || "u"} · {meta}</div>
      </div>
      <div className="costo-obra-mat-fin">
        <div className={`costo-obra-num${clase}`}>{dinero(fila)}</div>
        {fila.especificado && onDesmarcar ? (
          <button
            type="button"
            className="costo-obra-quitar"
            disabled={ocupado}
            onClick={() => onDesmarcar(fila)}
            title="Vuelve a quedar como faltante"
          >
            Quitar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "No lleva precio", con el motivo.
 *
 * Cerrado es un botón chico al lado del precio; abierto ocupa todo el renglón
 * con los motivos de siempre como botones y un campo para escribir otro. Un
 * clic alcanza para el caso común, que es lo que hace que se use.
 */
function MotivoSinPrecio({ ocupado, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const [otro, setOtro] = useState("");
  if (!abierto) {
    return (
      <button type="button" className="ui-btn ui-btn-fantasma costo-obra-sinprecio" disabled={ocupado} onClick={() => setAbierto(true)}>
        No lleva precio
      </button>
    );
  }
  const elegir = (motivo) => {
    if (!motivo) return;
    onElegir(motivo);
    setAbierto(false);
    setOtro("");
  };
  return (
    <div className="costo-obra-motivos" role="group" aria-label="Por qué no lleva precio">
      <span className="costo-obra-motivos-titulo">¿Por qué no lleva precio?</span>
      {MOTIVOS_SIN_PRECIO.map((motivo) => (
        <button key={motivo} type="button" className="ui-chip costo-obra-motivo" disabled={ocupado} onClick={() => elegir(motivo)}>
          {motivo}
        </button>
      ))}
      <input
        className="ui-input costo-obra-motivo-otro"
        value={otro}
        onChange={(event) => setOtro(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); elegir(otro.trim()); }
          if (event.key === "Escape") setAbierto(false);
        }}
        placeholder="Otro motivo y Enter"
        aria-label="Otro motivo"
        disabled={ocupado}
      />
      <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => { setAbierto(false); setOtro(""); }}>Cancelar</button>
    </div>
  );
}

function ListaCorta({ filas, clave, ocupado, onDesmarcar }) {
  const [cuantos, setCuantos] = useState(LOTE);
  const visibles = filas.slice(0, cuantos);
  const resto = filas.length - visibles.length;
  return (
    <div className="costo-obra-detalle">
      {visibles.map((fila) => (
        <FilaMaterial key={`${clave}-${fila.material.id}`} fila={fila} ocupado={ocupado === fila.material.id} onDesmarcar={onDesmarcar} />
      ))}
      {resto > 0 ? (
        <button type="button" className="ui-btn ui-btn-fantasma costo-obra-mas" onClick={() => setCuantos((n) => n + LOTE)}>
          Ver {Math.min(resto, LOTE)} más
        </button>
      ) : null}
    </div>
  );
}

function FilaPendiente({ fila, modo, ocupado, onGuardar, onEspecificar, proveedores = [] }) {
  const opciones = fila.proveedores.length
    ? fila.proveedores
    : proveedores.filter((p) => p.activo !== false).map((p) => ({ id: p.id, nombre: p.nombre }));
  const [proveedorId, setProveedorId] = useState(opciones[0]?.id || "");
  const proveedor = modo === "proveedor"
    ? fila.grupoProveedor
    : opciones.find((p) => (p.id || "") === (proveedorId || "")) || opciones[0] || null;
  return (
    <div className="costo-obra-pend">
      <div className="costo-obra-mat-texto">
        <div className="costo-obra-mat-nombre">{fila.material.descripcion}</div>
        <div className="costo-obra-mat-meta">
          {fila.cantidad} {fila.material.unidad_medida || "u"}
          {modo === "proveedor" ? ` · ${fila.rubro}` : ""}
        </div>
      </div>
      {modo === "rubro" && opciones.length > 1 ? (
        <select className="ui-input" value={proveedorId || ""} onChange={(event) => setProveedorId(event.target.value)} aria-label="Proveedor">
          {opciones.map((p) => <option key={p.id || p.nombre} value={p.id || ""}>{p.nombre}</option>)}
        </select>
      ) : (
        <span className="costo-obra-quien">{proveedor?.nombre || "Sin proveedor"}</span>
      )}
      <CampoPrecio ocupado={ocupado} onGuardar={(texto, moneda) => onGuardar(fila, texto, moneda, proveedor)} />
      {onEspecificar ? <MotivoSinPrecio ocupado={ocupado} onElegir={(motivo) => onEspecificar(fila, motivo)} /> : null}
    </div>
  );
}

function ConjuntoEditor({ conjunto, filas, ocupado, onGuardar }) {
  const [precio, setPrecio] = useState(conjunto.precio != null ? String(conjunto.precio) : "");
  const [moneda, setMoneda] = useState(conjunto.moneda === "USD" ? "USD" : "ARS");
  const [fuente, setFuente] = useState(conjunto.fuente || "");
  const cubiertos = filas.filter((fila) => (conjunto.materiales || []).includes(fila.material.id)).length;
  return (
    <div className="costo-obra-conjunto">
      <div className="costo-obra-mat-texto">
        <div className="costo-obra-mat-nombre">{conjunto.nombre}</div>
        <div className="costo-obra-mat-meta">{conjunto.proveedor || "Sin proveedor"} · {cubiertos} materiales de esta línea</div>
      </div>
      <div className="costo-obra-conjunto-form">
        <input className="ui-input costo-obra-importe" value={precio} onChange={(event) => setPrecio(event.target.value)} placeholder="Total" inputMode="decimal" aria-label="Precio del conjunto" />
        <select className="ui-input costo-obra-moneda-sel" value={moneda} onChange={(event) => setMoneda(event.target.value)} aria-label="Moneda">
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
        <input className="ui-input" value={fuente} onChange={(event) => setFuente(event.target.value)} placeholder="De dónde salió" aria-label="Origen del precio" />
        <button type="button" className="ui-btn ui-btn-suave" disabled={ocupado} onClick={() => onGuardar(conjunto, montoDesdeTexto(precio), moneda, fuente)}>
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

export default function CostoObraPanel({ categorias = [], materiales = [], proveedores = [], onChanged }) {
  const toast = useToast();
  const [modelo, setModelo] = useState(MODELOS[0]);
  const [vista, setVista] = useState("costo");
  const [agrupar, setAgrupar] = useState("rubro");
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [conjuntos, setConjuntos] = useState([]);
  const [ocupado, setOcupado] = useState("");
  const [recien, setRecien] = useState({});
  const [ejeAbierto, setEjeAbierto] = useState(false);
  // Lo que se marcó o desmarcó en esta sesión, hasta que llegue el catálogo
  // recargado. Sin esto la fila tardaría lo que tarda la recarga en irse.
  const [motivosLocales, setMotivosLocales] = useState({});

  const materialesVista = useMemo(() => {
    const ids = Object.keys(motivosLocales);
    if (!ids.length) return materiales;
    return materiales.map((material) => (
      material.id in motivosLocales
        ? { ...material, sin_precio_motivo: motivosLocales[material.id] }
        : material
    ));
  }, [materiales, motivosLocales]);

  const cargarConjuntos = useCallback(() => {
    fetchConjuntos().then(setConjuntos).catch(() => setConjuntos([]));
  }, []);
  useEffect(() => { cargarConjuntos(); }, [cargarConjuntos]);

  const conjuntoDe = useMemo(() => {
    const mapa = new Map();
    for (const conjunto of conjuntos) {
      if (conjunto.modelo && String(conjunto.modelo) !== String(modelo)) continue;
      for (const id of conjunto.materiales || []) mapa.set(id, conjunto);
    }
    return mapa;
  }, [conjuntos, modelo]);

  const { base, eje } = useMemo(
    () => armarFilas(materialesVista, modelo, conjuntoDe, categorias),
    [materialesVista, modelo, conjuntoDe, categorias],
  );
  const total = useMemo(() => sumar(base), [base]);

  const rubros = useMemo(() => {
    const mapa = new Map();
    for (const fila of base) {
      const clave = fila.rubro || "Sin rubro";
      if (!mapa.has(clave)) mapa.set(clave, { nombre: clave, filas: [] });
      mapa.get(clave).filas.push(fila);
    }
    return [...mapa.values()]
      .map((grupo) => ({ ...grupo, ...sumar(grupo.filas) }))
      .sort((a, b) => b.sinPrecio - a.sinPrecio || (b.usd + b.ars) - (a.usd + a.ars));
  }, [base]);

  const conjuntosVisibles = useMemo(() => conjuntos.filter((conjunto) => {
    if (conjunto.modelo && String(conjunto.modelo) !== String(modelo)) return false;
    return (conjunto.materiales || []).some((id) => base.some((fila) => fila.material.id === id));
  }), [conjuntos, modelo, base]);

  const totalConjuntos = useMemo(() => {
    const acc = { usd: 0, ars: 0 };
    for (const conjunto of conjuntosVisibles) {
      const monto = Number(conjunto.precio);
      if (!(Number.isFinite(monto) && monto > 0)) continue;
      if (conjunto.moneda === "USD") acc.usd += monto;
      else acc.ars += monto;
    }
    return acc;
  }, [conjuntosVisibles]);

  const pendientes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base.filter((fila) => fila.falta && !recien[fila.material.id]).filter((fila) => {
      if (!q) return true;
      return `${fila.material.descripcion} ${fila.rubro}`.toLowerCase().includes(q);
    });
  }, [base, busca, recien]);

  const gruposPendientes = useMemo(() => {
    if (agrupar === "rubro") {
      const mapa = new Map();
      for (const fila of pendientes) {
        const clave = fila.rubro || "Sin rubro";
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave).push(fila);
      }
      return [...mapa.entries()].map(([titulo, filas]) => ({ titulo, filas }));
    }
    const mapa = new Map();
    for (const fila of pendientes) {
      const destinos = fila.proveedores.length ? fila.proveedores : [{ id: null, nombre: "Sin proveedor" }];
      for (const destino of destinos) {
        const clave = destino.id || destino.nombre;
        if (!mapa.has(clave)) mapa.set(clave, { titulo: destino.nombre, filas: [] });
        mapa.get(clave).filas.push({ ...fila, grupoProveedor: destino });
      }
    }
    return [...mapa.values()].sort((a, b) => {
      if (a.titulo === "Sin proveedor") return -1;
      if (b.titulo === "Sin proveedor") return 1;
      return b.filas.length - a.filas.length;
    });
  }, [agrupar, pendientes]);

  async function guardarPrecio(fila, texto, moneda, proveedor) {
    const precio = montoDesdeTexto(texto);
    if (!precio) {
      toast.warning("Poné un número mayor que cero.");
      return;
    }
    setOcupado(fila.material.id);
    try {
      await aplicarPrecioMaterial(fila.material.id, {
        precio,
        moneda,
        proveedor: proveedor?.nombre || null,
        proveedor_id: proveedor?.id || null,
        fuente: "cotizacion",
      });
      setRecien((actual) => ({ ...actual, [fila.material.id]: { precio, moneda } }));
      toast.success("Precio cargado.");
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar el precio.");
    } finally {
      setOcupado("");
    }
  }

  async function especificar(fila, motivo) {
    setOcupado(fila.material.id);
    try {
      await marcarSinPrecio(fila.material.id, motivo);
      setMotivosLocales((actual) => ({ ...actual, [fila.material.id]: motivo }));
      toast.success(`${fila.material.descripcion}: ${motivo.toLowerCase()}.`);
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar.");
    } finally {
      setOcupado("");
    }
  }

  async function desmarcar(fila) {
    setOcupado(fila.material.id);
    try {
      await marcarSinPrecio(fila.material.id, null);
      setMotivosLocales((actual) => ({ ...actual, [fila.material.id]: null }));
      toast.success("Vuelve a quedar como faltante.");
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar.");
    } finally {
      setOcupado("");
    }
  }

  async function guardarConjunto(conjunto, precio, moneda, fuente) {
    if (precio == null) {
      toast.warning("Poné el total del conjunto.");
      return;
    }
    setOcupado(conjunto.id);
    try {
      await guardarPrecioConjunto(conjunto.id, { precio, moneda, fuente });
      cargarConjuntos();
      toast.success("Precio del conjunto guardado.");
    } catch (error) {
      toast.error(error?.message || "No se pudo guardar el conjunto.");
    } finally {
      setOcupado("");
    }
  }

  const cobertura = total.items ? Math.round((total.resueltos / total.items) * 100) : 0;
  const usd = total.usd + totalConjuntos.usd;
  const ars = total.ars + totalConjuntos.ars;

  return (
    <div className="costo-obra">
      <style href="klasea-costo-obra" precedence="default">{CSS}</style>

      <div className="costo-obra-barra">
        <div className="ui-tabs" role="tablist" aria-label="Línea">
          {MODELOS.map((mod) => (
            <button key={mod} type="button" role="tab" aria-selected={modelo === mod} className="ui-tab" onClick={() => { setModelo(mod); setAbierto(null); setEjeAbierto(false); }}>
              K{mod}
            </button>
          ))}
        </div>
        <div className="ui-tabs" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={vista === "costo"} className="ui-tab" onClick={() => setVista("costo")}>Costo</button>
          <button type="button" role="tab" aria-selected={vista === "pendientes"} className="ui-tab" onClick={() => setVista("pendientes")}>Pendientes</button>
        </div>
      </div>

      <section className="ui-card costo-obra-resumen">
        <div className="costo-obra-cobertura">
          <div className="costo-obra-cobertura-num" aria-hidden="true">{cobertura}%</div>
          <div>
            <div className="costo-obra-kicker">Cobertura de la matriz K{modelo}</div>
            <div className="costo-obra-frase">{total.resueltos} de {total.items} resueltos</div>
            <div className="costo-obra-track" aria-hidden="true"><span style={{ width: `${cobertura}%` }} /></div>
          </div>
        </div>
        <div className="costo-obra-totales">
          <div>
            <div className="costo-obra-kicker">Dólares</div>
            <div className="costo-obra-total">{fmtMoney(usd, "USD")}</div>
          </div>
          <div>
            <div className="costo-obra-kicker">Pesos</div>
            <div className="costo-obra-total">{fmtMoney(ars, "ARS")}</div>
          </div>
        </div>
        <p className="costo-obra-fuente">
          La cantidad sale de la matriz y el precio es el último de un proveedor. Pesos y dólares van separados.
          {total.enConjunto ? ` ${total.enConjunto} van en un conjunto y se suman una sola vez.` : ""}
          {total.especificados ? ` ${total.especificados} no llevan precio propio y están especificados.` : ""}
        </p>
        {vista === "costo" && total.sinPrecio > 0 ? (
          <button type="button" className="ui-btn ui-btn-suave costo-obra-accion" onClick={() => { setVista("pendientes"); setAbierto(null); }}>
            Completar {total.sinPrecio} sin precio
          </button>
        ) : null}
      </section>

      {vista === "costo" ? (
        <section className="ui-card costo-obra-lista">
          {rubros.map((rubro) => {
            const parte = rubro.items ? Math.round((rubro.resueltos / rubro.items) * 100) : 0;
            const abiertoRubro = abierto === rubro.nombre;
            return (
              <div key={rubro.nombre} className="costo-obra-bloque">
                <button
                  type="button"
                  className="costo-obra-rubro es-fila"
                  aria-expanded={abiertoRubro}
                  onClick={(event) => {
                    if (event.target.closest(".costo-obra-falta")) {
                      setVista("pendientes");
                      setAgrupar("rubro");
                      setBusca("");
                      setAbierto(rubro.nombre);
                      return;
                    }
                    setAbierto(abiertoRubro ? null : rubro.nombre);
                  }}
                >
                  <span className="costo-obra-rubro-nombre">
                    {rubro.nombre}
                    <span className="costo-obra-cuenta">{rubro.items}</span>
                  </span>
                  <span className="costo-obra-pista">
                    <span className="costo-obra-track chico" aria-hidden="true"><span style={{ width: `${parte}%` }} /></span>
                    {rubro.sinPrecio > 0 ? <span className="ui-chip costo-obra-falta" title="Abrir estos pendientes">{rubro.sinPrecio} sin precio</span> : null}
                  </span>
                  <span className="costo-obra-montos">
                    {rubro.usd ? <span className="costo-obra-num">{fmtMoney(rubro.usd, "USD")}</span> : null}
                    {rubro.ars ? <span className="costo-obra-num">{fmtMoney(rubro.ars, "ARS")}</span> : null}
                    {!rubro.usd && !rubro.ars ? <span className="costo-obra-vacio">Sin cotizar</span> : null}
                  </span>
                  <ChevronDown size={16} className={abiertoRubro ? "gira" : ""} />
                </button>
                {abiertoRubro ? (
                  <ListaCorta
                    clave={rubro.nombre}
                    filas={rubro.filas.slice().sort((a, b) => Number(a.falta) - Number(b.falta) || (b.costo || 0) - (a.costo || 0))}
                    ocupado={ocupado}
                    onDesmarcar={desmarcar}
                  />
                ) : null}
              </div>
            );
          })}
        </section>
      ) : (
        <section className="ui-card costo-obra-lista">
          <div className="costo-obra-filtros">
            <div className="ui-tabs" role="tablist" aria-label="Agrupar pendientes">
              <button type="button" role="tab" aria-selected={agrupar === "rubro"} className="ui-tab" onClick={() => { setAgrupar("rubro"); setAbierto(null); }}>Por rubro</button>
              <button type="button" role="tab" aria-selected={agrupar === "proveedor"} className="ui-tab" onClick={() => { setAgrupar("proveedor"); setAbierto(null); }}>Por proveedor</button>
            </div>
            <input className="ui-input" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar material" aria-label="Buscar material" />
          </div>
          {gruposPendientes.length ? gruposPendientes.map((grupo) => {
            const abiertoGrupo = abierto === grupo.titulo;
            return (
              <div key={grupo.titulo} className="costo-obra-bloque">
                <button type="button" className="costo-obra-rubro" aria-expanded={abiertoGrupo} onClick={() => setAbierto(abiertoGrupo ? null : grupo.titulo)}>
                  <span className="costo-obra-rubro-nombre">{grupo.titulo}</span>
                  <span className="ui-chip costo-obra-falta">{grupo.filas.length}</span>
                  <ChevronDown size={16} className={abiertoGrupo ? "gira" : ""} />
                </button>
                {abiertoGrupo ? (
                  <ListaPendiente filas={grupo.filas} modo={agrupar} ocupado={ocupado} onGuardar={guardarPrecio} onEspecificar={especificar} proveedores={proveedores} />
                ) : null}
              </div>
            );
          }) : (
            <p className="costo-obra-vacio-lista">No quedan precios pendientes en esta búsqueda.</p>
          )}
          {Object.keys(recien).length ? (
            <p className="costo-obra-ok"><Check size={14} /> {Object.keys(recien).length} cargados en esta sesión</p>
          ) : null}
        </section>
      )}

      {conjuntosVisibles.length ? (
        <section className="ui-card costo-obra-lista">
          <div className="costo-obra-seccion">
            <div className="costo-obra-rubro-nombre">Conjuntos</div>
            <p className="costo-obra-mat-meta">Un precio por el trabajo, no por cada pieza. Ya está sumado arriba.</p>
          </div>
          {conjuntosVisibles.map((conjunto) => (
            <ConjuntoEditor key={conjunto.id} conjunto={conjunto} filas={base} ocupado={ocupado === conjunto.id} onGuardar={guardarConjunto} />
          ))}
        </section>
      ) : null}

      {eje.length ? (
        <section className="ui-card costo-obra-lista">
          <button type="button" className="costo-obra-rubro" aria-expanded={ejeAbierto} onClick={() => setEjeAbierto((v) => !v)}>
            <span className="costo-obra-rubro-cuerpo">
              <span className="costo-obra-rubro-nombre">Línea de eje</span>
              <span className="costo-obra-mat-meta">{eje.length} ítems aparte. No entran en el total de la matriz.</span>
            </span>
            <ChevronDown size={16} className={ejeAbierto ? "gira" : ""} />
          </button>
          {ejeAbierto ? <ListaCorta clave="eje" filas={eje.map((fila) => ({ ...fila, falta: !fila.precio, costo: fila.precio ? fila.cantidad * fila.precio.precio : 0, moneda: fila.precio?.moneda || "ARS", conjunto: null }))} /> : null}
        </section>
      ) : null}
    </div>
  );
}

function ListaPendiente({ filas, modo, ocupado, onGuardar, onEspecificar, proveedores }) {
  const [cuantos, setCuantos] = useState(LOTE);
  const visibles = filas.slice(0, cuantos);
  const resto = filas.length - visibles.length;
  return (
    <div className="costo-obra-detalle">
      {visibles.map((fila) => (
        <FilaPendiente key={`${modo}-${fila.material.id}`} fila={fila} modo={modo} ocupado={ocupado === fila.material.id} onGuardar={onGuardar} onEspecificar={onEspecificar} proveedores={proveedores} />
      ))}
      {resto > 0 ? (
        <button type="button" className="ui-btn ui-btn-fantasma costo-obra-mas" onClick={() => setCuantos((n) => n + LOTE)}>
          Ver {Math.min(resto, LOTE)} más
        </button>
      ) : null}
    </div>
  );
}

const CSS = `
.costo-obra { display: flex; flex-direction: column; gap: 14px; color: var(--text); }
.costo-obra-barra { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); }
.costo-obra-resumen {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(240px, .85fr);
  gap: 8px 28px;
  align-items: center;
  padding: 18px 20px 16px;
}
.costo-obra-cobertura { display: flex; align-items: center; gap: 16px; min-width: 0; }
.costo-obra-cobertura > div:last-child { flex: 1; min-width: 0; }
.costo-obra-cobertura-num {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 40px; font-weight: 700; letter-spacing: -.04em; line-height: .9;
  color: var(--text);
}
.costo-obra-kicker {
  font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--dim);
}
.costo-obra-frase { margin-top: 3px; font-size: 14px; font-weight: 500; color: var(--text); }
.costo-obra-track {
  margin-top: 8px; height: 4px; border-radius: 99px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
  overflow: hidden;
}
.costo-obra-track > span { display: block; height: 100%; border-radius: 99px; background: var(--brand-grad); }
.costo-obra-track.chico { flex: 1; width: auto; min-width: 48px; margin-top: 0; }
.costo-obra-totales { display: flex; gap: 22px; justify-content: flex-end; }
.costo-obra-total {
  margin-top: 2px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 18px; font-weight: 600; letter-spacing: -.02em;
}
.costo-obra-fuente { grid-column: 1 / -1; margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--dim); }
.costo-obra-accion { grid-column: 1 / -1; justify-self: start; }
.costo-obra-lista { overflow: hidden; }
.costo-obra-bloque + .costo-obra-bloque { border-top: 1px solid var(--border); }
.costo-obra .costo-obra-rubro {
  width: 100%; min-height: 58px; padding: 12px 16px;
  display: flex; align-items: center; justify-content: flex-start; gap: 14px;
  border: 0; background: transparent; color: var(--text); text-align: left;
  font: inherit; cursor: pointer;
}
.costo-obra-rubro:hover { background: var(--panel-2); }
.costo-obra-rubro-cuerpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.costo-obra-rubro-nombre { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; font-weight: 600; }
.costo-obra .costo-obra-rubro > .costo-obra-rubro-nombre { flex: 1; }
.costo-obra-cuenta { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; font-weight: 500; color: var(--dim); }
.costo-obra-pista { display: flex; align-items: center; gap: 10px; min-width: 0; }
.costo-obra-falta { color: var(--cyan); background: var(--cyan-soft); border-color: var(--cyan-border); }
.costo-obra-montos { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 148px; }
.costo-obra .costo-obra-rubro.es-fila {
  display: grid;
  grid-template-columns: minmax(168px, 240px) minmax(0, 1fr) auto 16px;
}
.costo-obra-num { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px; font-weight: 600; }
.costo-obra-num.falta, .costo-obra-vacio { color: var(--cyan); font-weight: 500; }
.costo-obra-rubro svg { flex-shrink: 0; color: var(--dim); transition: transform .18s cubic-bezier(.22,1,.36,1); }
.costo-obra-rubro svg.gira { transform: rotate(180deg); }
.costo-obra-detalle { border-top: 1px solid var(--border); background: color-mix(in srgb, var(--panel-2) 55%, transparent); }
.costo-obra-mat, .costo-obra-pend {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px;
  align-items: center; min-height: 52px; padding: 8px 16px 8px 22px;
  border-top: 1px solid var(--border);
}
.costo-obra-mat:first-child, .costo-obra-pend:first-child { border-top: 0; }
.costo-obra-mat.falta { box-shadow: inset 2px 0 0 var(--cyan); }
/* Especificado: resuelto sin plata. Se lee tranquilo -nada que hacer- y con la
   línea verde de lo que está listo, no con el cian de lo que falta. */
.costo-obra-mat.especificado { box-shadow: inset 2px 0 0 var(--green-border); }
.costo-obra-num.especificado { color: var(--muted); font-weight: 500; font-family: inherit; font-size: 12.5px; }
.costo-obra-mat-fin { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
.costo-obra .costo-obra-quitar {
  border: 0; background: transparent; padding: 4px 2px; font: inherit;
  font-size: 12px; color: var(--dim); text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
}
.costo-obra .costo-obra-quitar:hover { color: var(--text); }
.costo-obra-sinprecio { white-space: nowrap; font-size: 12.5px; color: var(--muted); }
.costo-obra-motivos {
  grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--panel-2); border: 1px solid var(--border);
  animation: costoObraMotivos .22s cubic-bezier(.22,1,.36,1) both;
}
@keyframes costoObraMotivos { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.costo-obra-motivos-titulo { font-size: 12.5px; font-weight: 600; color: var(--muted); margin-right: 2px; }
.costo-obra .costo-obra-motivo { cursor: pointer; font: inherit; font-size: 12.5px; }
.costo-obra .costo-obra-motivo:hover { border-color: var(--green-border); color: var(--text); }
.costo-obra-motivo-otro { width: 190px; }
.costo-obra-mat-nombre { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.costo-obra-mat-meta { margin-top: 2px; font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.costo-obra-pend { grid-template-columns: minmax(0, 1.4fr) minmax(120px, .7fr) auto auto; }
.costo-obra-quien { font-size: 13px; color: var(--muted); }
.costo-obra-precio { display: flex; align-items: center; gap: 6px; }
.costo-obra-importe { width: 112px; text-align: right; font-family: "JetBrains Mono", ui-monospace, monospace; }
.costo-obra-moneda { min-width: 52px; font-family: "JetBrains Mono", ui-monospace, monospace; }
.costo-obra-mas { width: 100%; border-radius: 0; }
.costo-obra-filtros { display: flex; align-items: center; gap: 12px; padding: 8px 12px 0; border-bottom: 1px solid var(--border); }
.costo-obra-filtros .ui-input { max-width: 280px; margin-bottom: 8px; }
.costo-obra-vacio-lista, .costo-obra-ok { margin: 0; padding: 14px 16px; font-size: 13px; color: var(--dim); }
.costo-obra-ok { display: flex; align-items: center; gap: 6px; color: var(--green); }
.costo-obra-seccion { padding: 14px 16px 4px; }
.costo-obra-conjunto { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border); }
.costo-obra-conjunto-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.costo-obra-conjunto-form .ui-input { width: 160px; }
.costo-obra-moneda-sel { width: 88px !important; }
@media (max-width: 800px) {
  .costo-obra-barra { flex-direction: column; align-items: stretch; gap: 0; }
  .costo-obra-resumen { grid-template-columns: 1fr; padding: 16px; }
  .costo-obra-totales { justify-content: flex-start; }
  .costo-obra-cobertura-num { font-size: 32px; }
  .costo-obra .costo-obra-rubro,
  .costo-obra .costo-obra-rubro.es-fila { display: flex; align-items: flex-start; flex-wrap: wrap; }
  .costo-obra-pista { width: 100%; }
  .costo-obra-montos { width: 100%; min-width: 0; flex-direction: row; justify-content: flex-start; gap: 12px; }
  .costo-obra-pend { grid-template-columns: 1fr; }
  .costo-obra-motivo-otro { width: 100%; }
  .costo-obra-sinprecio { justify-self: start; }
  .costo-obra-filtros { flex-direction: column; align-items: stretch; }
  .costo-obra-filtros .ui-input { max-width: none; }
}
`;

