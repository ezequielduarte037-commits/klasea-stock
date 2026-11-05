import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Copy, Info, LoaderCircle, RotateCcw, Truck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { marcarAvisoPlanillaComoComprado } from "@/features/compras/planillaObrasApi";
import TableroAtrasos, { CSS_ATRASOS } from "./TableroAtrasos";
import { Aviso, Buscar, Cabecera, Vacio } from "../ui";
import {
  armarPedidos, claveProveedor, inicioSemana, sumarDias, sugerirSemanasRubro, textoPedido,
} from "./calendario";
import {
  cargarDatosCalendario, guardarSemanaItem, guardarSemanaProveedor, guardarSemanaRubro, guardarSemanasRubro,
} from "./calendarioApi";

/**
 * Calendario de compras de los ítems estándar.
 *
 * Se arma como se compra: cada proveedor, y adentro un pedido por obra, porque
 * los presupuestos son por barco aunque la mercadería llegue junta. Cuando un
 * pedido se compró, «Ya lo compré» arma el aviso de ingreso al pañol y deja los
 * renglones de la lista del barco en Comprado (lo mismo que la planilla de la
 * línea). La fecha es la semana de compra desde el desmolde: la del ítem, la del
 * proveedor o la del rubro; mientras no hay ninguna se usa una sugerida, que se
 * ve en cursiva.
 */

const VISTAS = [
  ["atrasos", "Atrasos"],
  ["calendario", "Pedidos"],
  ["rubros", "Por rubro"],
  ["proveedores", "Por proveedor"],
];
const HORIZONTES = [2, 4, 8, 12];
const ITEMS_A_LA_VISTA = 8;

function dm(fecha) {
  const d = new Date(fecha);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(v) ? v.toLocaleString("es-AR") : String(v).replace(".", ",");
}

/** Cuándo hay que hacer el pedido, en palabras. */
function urgencia(comprarAntes, hoy, lunesHoy) {
  if (comprarAntes < hoy) return { tono: "rojo", texto: "Atrasado", detalle: `había que pedirlo antes del ${dm(comprarAntes)}` };
  if (comprarAntes < sumarDias(lunesHoy, 7)) return { tono: "azul", texto: "Esta semana", detalle: `pedir antes del ${dm(comprarAntes)}` };
  const semanas = Math.round((inicioSemana(comprarAntes) - lunesHoy) / (7 * 86400000));
  return { tono: "neutro", texto: `En ${semanas} ${semanas === 1 ? "semana" : "semanas"}`, detalle: `pedir antes del ${dm(comprarAntes)}` };
}

const FUENTE_SEMANA = { item: "sólo este ítem", proveedor: "del proveedor", rubro: "del rubro", sugerida: "sugerida" };

/** −4 → "4 semanas antes del desmolde". */
function semanaEnPalabras(semana) {
  if (semana === 0) return "la semana del desmolde";
  const n = Math.abs(semana);
  return `${n} ${n === 1 ? "semana" : "semanas"} ${semana < 0 ? "antes" : "después"} del desmolde`;
}

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

/** Un pedido: un proveedor, una obra. */
function TarjetaPedido({ proveedor, pedido, hoy, lunesHoy, editable, semanasItem, onSemanaItem, onCopiar, onComprado, sinProveedor }) {
  const [todos, setTodos] = useState(false);
  const u = urgencia(pedido.comprarAntes, hoy, lunesHoy);
  const visibles = todos ? pedido.items : pedido.items.slice(0, ITEMS_A_LA_VISTA);
  const resto = pedido.items.length - visibles.length;
  const deStock = pedido.items.reduce((n, i) => n + (i.deStock > 0 ? 1 : 0), 0);
  return (
    <article className="cal-pedido" data-tono={u.tono}>
      <header className="cal-ped-cab">
        <div style={{ minWidth: 0 }}>
          <div className="cal-ped-obra">
            <b className="mono">{pedido.obra}</b>
            <span className="cal-urg" data-tono={u.tono}>{u.texto}</span>
          </div>
          <div className="cal-ped-txt">
            {pedido.items.length} {pedido.items.length === 1 ? "ítem" : "ítems"} · {u.detalle} · desmolde {dm(pedido.desmolde)}
            {deStock > 0 && <> · <span className="cal-stock">{deStock} con parte del pañol</span></>}
          </div>
        </div>
        <div className="cal-ped-acc">
          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => onCopiar(proveedor, pedido)} title="Copiar el pedido para pedir el presupuesto">
            <Copy size={13} /> Copiar
          </button>
          {editable && (
            <button type="button" className="ui-btn ui-btn-primario chico" onClick={() => onComprado(proveedor, pedido)} title={sinProveedor ? "Elegí a quién se lo compraste en el aviso" : "Arma el aviso de ingreso al pañol y deja todo comprado en la lista del barco"}>
              <CheckCircle2 size={13} /> Ya lo compré
            </button>
          )}
        </div>
      </header>
      <div className="cal-ped-items">
        {visibles.map((x) => {
          const kItem = `${x.linea}|${x.filaId}`;
          return (
            <div key={`${x.filaId}|${x.material_id}`} className="cal-item">
              <div style={{ minWidth: 0 }}>
                <div className="cal-nom" title={x.descripcion}>{x.descripcion}</div>
                <div className="cal-meta">
                  {x.codigo && <span className="mono">{x.codigo}</span>}
                  <span>{x.rubro}</span>
                  {x.sinModelo && <span className="cal-marca" title="En la lista del barco no está elegido el modelo: se avisa el genérico">sin modelo</span>}
                  {x.vencido && <span className="cal-marca" data-tono="violeta" title="Ya tendría que estar en el barco: confirmá con la obra antes de comprarlo">¿ya está?</span>}
                </div>
              </div>
              <div className="cal-cifra">
                <b className="mono">{fmt(x.faltan)} <small>{x.unidad}</small></b>
                {x.deStock > 0 && <small className="cal-stock">+{fmt(x.deStock)} del pañol</small>}
              </div>
              <div className="cal-cifra cal-cuando">
                <b>{dm(x.comprarAntes)}</b>
                <small>
                  <span className={x.semanaFuente === "sugerida" ? "cal-sug" : ""} title={semanaEnPalabras(x.semana)}>sem. {x.semana}</span> · {FUENTE_SEMANA[x.semanaFuente]}
                </small>
              </div>
              {editable && (
                <CampoNumero
                  valor={semanasItem.has(kItem) ? semanasItem.get(kItem) : null}
                  sugerido={null}
                  ancho={52}
                  titulo="Semana sólo para este ítem, desde el desmolde (vacío = la del rubro)"
                  onGuardar={(v) => onSemanaItem(x.linea, x.filaId, v)}
                />
              )}
            </div>
          );
        })}
        {(resto > 0 || todos) && pedido.items.length > ITEMS_A_LA_VISTA && (
          <button type="button" className="cal-mas" onClick={() => setTodos((v) => !v)}>
            <ChevronDown size={14} style={{ transform: todos ? "rotate(180deg)" : "none" }} />
            {todos ? "Ver menos" : `Ver los otros ${resto}`}
          </button>
        )}
      </div>
    </article>
  );
}

export default function CalendarioComprasPanel({ profile }) {
  const toast = useToast();
  const puedeEditar = !!profile?.is_admin || ["admin", "compras", "oficina"].includes(profile?.role);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [vista, setVista] = useState("atrasos");
  const [linea, setLinea] = useState("todas");
  const [horizonte, setHorizonte] = useState(4);
  const [busqueda, setBusqueda] = useState("");
  const [verVencidos, setVerVencidos] = useState(false);
  // Cada proveedor arranca abierto si tiene algo atrasado o para esta semana;
  // tocarlo lo invierte y queda anotado acá.
  const [invertidos, setInvertidos] = useState(() => new Set());
  const [avisoPrefill, setAvisoPrefill] = useState(null);
  // Pedidos ya avisados en esta sesión: se esconden enseguida, sin esperar a
  // que se vuelva a calcular todo.
  const [hechos, setHechos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await cargarDatosCalendario();
      setDatos(d);
      setHechos(new Set());
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
      if (!m.categoria_id) continue;
      const k = `${m.linea}|${m.categoria_id}`;
      if (!map.has(k)) map.set(k, { linea: m.linea, categoria_id: m.categoria_id, rubro: m.rubro, items: 0 });
      map.get(k).items += 1;
    }
    return [...map.values()];
  }, [datos]);

  const sugeridas = useMemo(() => sugerirSemanasRubro(rubros, datos?.llegadas || []), [rubros, datos]);

  const proveedores = useMemo(() => {
    const map = new Map();
    const sumar = (nombre, lin) => {
      if (!nombre) return;
      const k = claveProveedor(nombre);
      if (!map.has(k)) map.set(k, { clave: k, nombre, items: 0, lineas: new Set() });
      const p = map.get(k);
      p.items += 1;
      p.lineas.add(lin);
    };
    for (const m of datos?.matriz || []) sumar(m.proveedor, m.linea);
    // El modelo elegido en una obra puede venir de otro proveedor que el genérico.
    const vistos = new Set();
    for (const n of datos?.necesidades || []) {
      const k = `${n.linea}|${n.material_id}`;
      if (n.material_id === n.filaId || vistos.has(k)) continue;
      vistos.add(k);
      if (!map.has(claveProveedor(n.proveedor))) sumar(n.proveedor, n.linea);
    }
    return [...map.values()].sort((a, b) => b.items - a.items);
  }, [datos]);

  const calendario = useMemo(() => {
    if (!datos) return null;
    const necesidades = linea === "todas" ? datos.necesidades : datos.necesidades.filter((n) => n.linea === linea);
    return armarPedidos({
      ...datos, necesidades, sugeridas, hoy: new Date(), semanasALaVista: horizonte, incluirVencidos: verVencidos,
    });
  }, [datos, linea, sugeridas, horizonte, verVencidos]);

  const proveedoresVisibles = useMemo(() => {
    if (!calendario) return [];
    const q = busqueda.trim().toLowerCase();
    const coincide = (...campos) => campos.some((c) => String(c || "").toLowerCase().includes(q));
    return calendario.proveedores
      .map((p) => ({
        ...p,
        pedidos: p.pedidos
          .filter((ped) => !hechos.has(ped.clave))
          .map((ped) => (!q || coincide(p.proveedor, ped.obra) ? ped : { ...ped, items: ped.items.filter((x) => coincide(x.descripcion, x.codigo, x.rubro)) }))
          .filter((ped) => ped.items.length),
      }))
      .filter((p) => p.pedidos.length);
  }, [calendario, busqueda, hechos]);

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

  async function onSemanaProveedor(nombre, semana) {
    try {
      await guardarSemanaProveedor(nombre, semana);
      actualizarMapa("semanasProveedor", claveProveedor(nombre), semana);
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

  function copiarTexto(texto, mensaje) {
    navigator.clipboard?.writeText(texto)
      .then(() => toast.success(mensaje))
      .catch(() => toast.error("No se pudo copiar."));
  }

  function copiarPedido(proveedor, pedido) {
    copiarTexto(textoPedido(proveedor.proveedor, pedido.obra, pedido.items), `Pedido de la ${pedido.obra} copiado (${pedido.items.length} renglones).`);
  }

  // Todas las obras de un proveedor en un solo mensaje, pero cada una por
  // separado: el presupuesto sigue siendo uno por barco.
  function copiarProveedor(proveedor) {
    const texto = proveedor.pedidos.map((ped) => textoPedido(proveedor.proveedor, ped.obra, ped.items)).join("\n\n");
    copiarTexto(texto, `${proveedor.pedidos.length} pedidos copiados, uno por obra.`);
  }

  function abrirAviso(proveedor, pedido) {
    const sinProveedor = !proveedor.clave;
    setAvisoPrefill({
      clave: pedido.clave,
      titulo: sinProveedor ? `Compra · ${pedido.obra}` : `${proveedor.proveedor} · ${pedido.obra}`,
      sede: "",
      obraId: pedido.obraId,
      obrasExtra: [],
      prioridad: "media",
      observaciones: `${sinProveedor ? "Comprado" : `Comprado a ${proveedor.proveedor}`} para la ${pedido.obra}. Aviso armado desde el calendario de compras.`,
      origen: "obra_matriz",
      items: pedido.items.map((x) => ({
        descripcion: x.descripcion,
        codigo: x.codigo || "",
        cantidad: x.faltan,
        unidad: x.unidad || "unidad",
        material_id: x.material_id,
        requisito_material_id: x.requisito_material_id,
        obra_snapshot_item_id: x.snapshotId || null,
        obra_id: pedido.obraId,
        obra_codigo: pedido.obra,
        proveedor: x.proveedor || "",
        rubro: x.rubro || "",
        es_adicional: false,
      })),
    });
  }

  const hoy = new Date(new Date().setHours(0, 0, 0, 0));
  const lunesHoy = inicioSemana(hoy);
  const nPedidos = proveedoresVisibles.reduce((n, p) => n + p.pedidos.length, 0);
  const nAtrasados = proveedoresVisibles.reduce((n, p) => n + p.pedidos.filter((ped) => ped.comprarAntes < hoy).length, 0);
  const nVencidos = calendario ? calendario.vencidos.reduce((n, v) => n + v.items, 0) : 0;
  const rubrosSinCargar = rubros.filter((r) => !datos?.semanasRubro.has(`${r.linea}|${r.categoria_id}`)).length;
  const provConSemana = proveedores.filter((p) => datos?.semanasProveedor.has(p.clave)).length;
  const editable = puedeEditar && !datos?.sinMigracion;

  return (
    <div className="cal-root">
      <style>{CSS + CSS_ATRASOS}</style>
      <Cabecera
        eyebrow="Compras · Planificar"
        titulo="Calendario de"
        acento="compras"
        sub={vista === "atrasos" ? "Lo de Compras que ya pasó su fecha. Tocá un proveedor o una obra para ver sus pedidos, o cualquier fila para ir a resolverla." : calendario ? (
          <>
            <b className="mono">{fmt(nPedidos)}</b> pedidos para hacer en las próximas {horizonte} semanas, uno por proveedor y obra
            {nAtrasados > 0 && <> · <b className="mono t" data-tono="rojo">{fmt(nAtrasados)}</b> atrasados</>}
            {" "}· comprar = desmolde + semana de compra (del ítem, del proveedor o del rubro)
          </>
        ) : "Qué pedirle a cada proveedor para cada barco, y cuándo, para que los ítems estándar lleguen a tiempo."}
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
              {k === "proveedores" && provConSemana > 0 && <span className="cal-cuenta" title="Proveedores con semana propia">{provConSemana}</span>}
            </button>
          ))}
        </div>
        <div className="cmp-seg" role="radiogroup" aria-label="Línea">
          {["todas", ...lineas].map((l) => (
            <button key={l} type="button" role="radio" aria-checked={linea === l} className={linea === l ? "on" : ""} onClick={() => setLinea(l)}>{l === "todas" ? "Todas" : `K${l}`}</button>
          ))}
        </div>
        {vista === "calendario" && (
          <div className="cmp-seg" role="radiogroup" aria-label="Semanas a la vista">
            {HORIZONTES.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={horizonte === h} className={horizonte === h ? "on" : ""} onClick={() => setHorizonte(h)}>{h} sem.</button>
            ))}
          </div>
        )}
        {["calendario", "proveedores"].includes(vista) && <Buscar value={busqueda} onChange={setBusqueda} placeholder={vista === "proveedores" ? "Proveedor…" : "Proveedor, obra o producto…"} />}
      </div>

      {datos?.sinMigracion && (
        <Aviso tono="rojo" icono={AlertCircle}>
          <b>Todavía no se pueden guardar ni leer las semanas de compra:</b> falta instalar la última versión del calendario en la base. Mientras tanto se calcula con las sugerencias.
        </Aviso>
      )}
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <Cargando texto="Armando los pedidos con la lista de cada obra y el pañol…" />
      ) : !calendario ? null : vista === "atrasos" ? (
        <TableroAtrasos
          calendario={calendario}
          linea={linea}
          onVerProveedor={(nombre) => { setBusqueda(nombre); setVista("calendario"); }}
          onVerObra={(obra) => { setBusqueda(obra); setVista("calendario"); }}
        />
      ) : vista === "calendario" ? (
        <>
          {rubrosSinCargar > 0 && (
            <Aviso tono="cian" icono={Info}>
              Lo que está en <i>cursiva</i> sale de una sugerencia: faltan <b>{rubrosSinCargar}</b> semanas por rubro.
              {" "}Cargalas en «Por rubro» (o una para todo un proveedor en «Por proveedor»), o tocá «Usar las sugeridas».
            </Aviso>
          )}
          {!proveedoresVisibles.length ? (
            <Vacio icono={CalendarDays} titulo={busqueda ? "Nada coincide con la búsqueda" : `No hay pedidos para hacer en las próximas ${horizonte} semanas`} texto={busqueda ? "Probá con otro término." : "Con las fechas cargadas, todo lo pendiente cae más adelante o ya está comprado o cubierto con el pañol."} />
          ) : (
            <div className="cal-provs">
              {proveedoresVisibles.map((p) => {
                const sinProv = !p.clave;
                const clave = p.clave || "sin";
                const u = urgencia(p.comprarAntes, hoy, lunesHoy);
                const abiertoPorDefecto = u.tono !== "neutro";
                const abierto = abiertoPorDefecto !== invertidos.has(clave);
                const nItems = p.pedidos.reduce((n, ped) => n + ped.items.length, 0);
                return (
                  <section key={clave} className="cmp-bloque" style={{ borderColor: sinProv ? "var(--red-border)" : undefined }}>
                    <div className="cmp-bloque-cab">
                      <button type="button" className="cmp-repo-plegar" onClick={() => alternar(clave)} aria-expanded={abierto}>
                        <ChevronRight size={16} className="chev" style={{ transform: abierto ? "rotate(90deg)" : "none" }} />
                        <span className="cmp-bloque-ic" data-tono={sinProv ? "rojo" : "azul"}><Truck size={16} /></span>
                        <span style={{ minWidth: 0 }}>
                          <span className="cmp-bloque-tit" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {p.proveedor}
                            <span className="cal-urg" data-tono={u.tono}>{u.texto}</span>
                          </span>
                          <span className="cmp-bloque-txt" style={{ display: "block" }}>
                            {p.pedidos.length} {p.pedidos.length === 1 ? "pedido" : "pedidos"} ({p.pedidos.map((ped) => ped.obra).join(", ")}) · {nItems} ítems · {sinProv ? "sin proveedor en la ficha" : p.semanaProveedor != null ? <>todo se compra {semanaEnPalabras(p.semanaProveedor)}</> : "cada ítem con la semana de su rubro"}
                          </span>
                        </span>
                      </button>
                      {!sinProv && p.pedidos.length > 1 && (
                        <div className="der">
                          <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => copiarProveedor(p)} title="Copia todas las obras, cada una con su pedido"><Copy size={13} /> Copiar las {p.pedidos.length} obras</button>
                        </div>
                      )}
                    </div>
                    {abierto && (
                      <div className="cmp-bloque-cuerpo cal-pedidos">
                        {p.pedidos.map((ped) => (
                          <TarjetaPedido
                            key={ped.clave}
                            proveedor={p}
                            pedido={ped}
                            hoy={hoy}
                            lunesHoy={lunesHoy}
                            editable={editable}
                            sinProveedor={sinProv}
                            semanasItem={datos.semanasItem}
                            onSemanaItem={onSemanaItem}
                            onCopiar={copiarPedido}
                            onComprado={abrirAviso}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          <div className="cal-pie">
            {calendario.masAdelante > 0 && <span><b className="mono">{fmt(calendario.masAdelante)}</b> pedidos caen después de las {horizonte} semanas.</span>}
            {calendario.conStock.length > 0 && <span><b className="mono">{fmt(calendario.conStock.length)}</b> se cubren con stock libre del pañol: no hay que comprarlos.</span>}
            <span><b className="mono">{fmt(datos.cubiertas)}</b> renglones de las listas ya están pedidos, avisados o en el barco.</span>
          </div>

          {calendario.sinFecha.length > 0 && (
            <Aviso tono="cian" icono={Info}>
              Sin fecha porque el rubro no tiene semana ni sugerencia: {calendario.sinFecha.map((s) => `${s.rubro} (${s.items})`).join(", ")}.
              {" "}<button type="button" className="cmp-link" onClick={() => setVista("rubros")}>Cargar semanas</button>
            </Aviso>
          )}

          {nVencidos > 0 && (
            <section className="cmp-bloque">
              <div className="cmp-bloque-cab">
                <span className="cmp-bloque-ic" data-tono="violeta"><AlertCircle size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="cmp-bloque-tit">{fmt(nVencidos)} ítems ya tendrían que estar en el barco</h2>
                  <p className="cmp-bloque-txt">
                    {calendario.vencidos.slice(0, 8).map((v) => `${v.obra} (${v.items})`).join(" · ")}{calendario.vencidos.length > 8 ? " …" : ""}.
                    {" "}El sistema no los vio llegar, pero muchas veces se pusieron sin pasar por el pañol: {verVencidos ? "están mezclados en los pedidos, marcados «¿ya está?»." : "por eso no se piden solos."}
                  </p>
                </div>
                <div className="der">
                  <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setVerVencidos((v) => !v)}>{verVencidos ? "Sacarlos de los pedidos" : "Sumarlos a los pedidos"}</button>
                </div>
              </div>
            </section>
          )}
        </>
      ) : vista === "rubros" ? (
        <section className="cmp-bloque">
          <div className="cmp-bloque-cab">
            <span className="cmp-bloque-ic" data-tono="azul"><CalendarDays size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <h2 className="cmp-bloque-tit">Semana de compra de cada rubro</h2>
              <p className="cmp-bloque-txt">Desde el desmolde: −13 = tres meses antes, −4 = un mes antes, 0 = la semana del desmolde, 4 = un mes después. Vacío usa la sugerencia (en gris). Lo de un proveedor con semana propia no usa esta.</p>
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
              <h2 className="cmp-bloque-tit">Semana de compra de todo lo de un proveedor</h2>
              <p className="cmp-bloque-txt">Desde el desmolde: −4 = un mes antes, 0 = la semana del desmolde. Manda sobre la del rubro; vacío = cada ítem con la de su rubro.</p>
            </div>
          </div>
          <div className="cmp-bloque-cuerpo sin-pad">
            {proveedores
              .filter((p) => linea === "todas" || p.lineas.has(linea))
              .filter((p) => !busqueda.trim() || p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
              .map((p) => {
                const valor = datos.semanasProveedor.has(p.clave) ? datos.semanasProveedor.get(p.clave) : null;
                return (
                  <div key={p.clave} className="cal-fila cal-fila-prov">
                    <div style={{ minWidth: 0 }}>
                      <div className="cal-nom">{p.nombre}</div>
                      <div className="cal-meta"><span>{p.items} ítems de matriz</span><span>{[...p.lineas].sort().map((l) => `K${l}`).join(", ")}</span></div>
                    </div>
                    <div className="cal-celda cal-celda-der">
                      <CampoNumero valor={valor} sugerido={null} disabled={!editable} titulo="Semana de compra desde el desmolde (vacío = la de cada rubro)" onGuardar={(v) => onSemanaProveedor(p.nombre, v)} />
                      <small>{valor == null ? "la de cada rubro" : semanaEnPalabras(valor)}</small>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <EnviarAPanolModal
        open={!!avisoPrefill}
        profile={profile}
        prefill={avisoPrefill}
        showPrices={false}
        requireCatalogLinks
        onSaved={async (envioId) => {
          await marcarAvisoPlanillaComoComprado(envioId);
        }}
        onClose={(saved) => {
          const clave = avisoPrefill?.clave;
          setAvisoPrefill(null);
          if (saved && clave) {
            setHechos((prev) => new Set(prev).add(clave));
            toast.success("Listo: aviso de ingreso creado y la lista del barco quedó en Comprado.");
            void cargar();
          }
        }}
      />
    </div>
  );
}

const CSS = `
.cal-root { display: grid; gap: 12px; }
.cal-root .cal-cuenta { margin-left: 6px; font-family: "JetBrains Mono", monospace; font-size: 10.5px; color: var(--cyan); }
.cal-root .cal-provs { display: grid; gap: 10px; }
.cal-root .cal-urg { font-size: 10.5px; font-weight: 600; letter-spacing: .02em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--dim); background: var(--panel-2); white-space: nowrap; }
.cal-root .cal-urg[data-tono="rojo"] { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.cal-root .cal-urg[data-tono="azul"] { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.cal-root .cal-pedidos { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 10px; align-items: start; }
.cal-root .cal-pedido { border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); overflow: hidden; }
.cal-root .cal-pedido[data-tono="rojo"] { border-left: 3px solid var(--red); }
.cal-root .cal-pedido[data-tono="azul"] { border-left: 3px solid var(--blue); }
.cal-root .cal-ped-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--panel-2); border-bottom: 1px solid var(--border); }
.cal-root .cal-ped-obra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cal-root .cal-ped-obra b { font-size: 16px; font-weight: 600; }
.cal-root .cal-ped-txt { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.cal-root .cal-ped-acc { display: flex; gap: 6px; flex-shrink: 0; }
.cal-root .cal-ped-items { display: grid; }
.cal-root .cal-item { display: grid; grid-template-columns: minmax(0, 1fr) 84px 92px auto; gap: 10px; align-items: center; padding: 7px 12px; border-top: 1px solid var(--border); }
.cal-root .cal-item:first-child { border-top: none; }
.cal-root .cal-mas { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 7px; border: none; border-top: 1px solid var(--border); background: transparent; color: var(--blue); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.cal-root .cal-marca { font-size: 10px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--cyan-border, var(--border)); color: var(--cyan); }
.cal-root .cal-marca[data-tono="violeta"] { border-color: var(--violet-border, var(--border)); color: var(--violet); }
.cal-root .cal-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 14px; border-top: 1px solid var(--border); }
.cal-root .cal-nom { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cal-root .cal-meta { display: flex; flex-wrap: wrap; gap: 3px 9px; font-size: 11px; color: var(--dim); margin-top: 1px; }
.cal-root .cal-meta .mono { color: var(--blue); }
.cal-root .cal-cifra { display: grid; gap: 1px; }
.cal-root .cal-cifra b { font-size: 13px; font-weight: 600; }
.cal-root .cal-cifra small, .cal-root .cal-celda small { font-size: 10.5px; color: var(--dim); }
.cal-root .cal-stock { color: var(--teal) !important; }
.cal-root .cal-sug { font-style: italic; color: var(--muted); font-weight: 500; }
.cal-root .cal-num { height: 30px; padding: 4px 8px; font-family: "JetBrains Mono", monospace; font-size: 12.5px; text-align: right; }
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
  .cal-root .cal-pedidos { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .cal-root .cal-ped-cab { flex-direction: column; }
  .cal-root .cal-item { grid-template-columns: minmax(0, 1fr) auto; }
  .cal-root .cal-item .cal-cuando { grid-column: 1 / -1; display: flex; gap: 8px; align-items: baseline; }
  .cal-root .cal-item .cal-num { display: none; }
}
`;
