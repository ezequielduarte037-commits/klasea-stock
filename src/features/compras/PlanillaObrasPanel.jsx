import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CircleAlert,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  Layers3,
  Package,
  PackageCheck,
  PlusCircle,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  SquarePen,
  Table2,
  Warehouse,
  X,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { calcularPlanillaDeLinea, marcarAvisoPlanillaComoComprado } from "@/features/compras/planillaObrasApi";
import { exportarPlanillaXlsx } from "@/features/compras/planillaExcel";
import ProductoAsignadoControl from "@/features/materiales/ProductoAsignadoControl";
import { ensureObraMaterialSnapshotRow } from "@/features/materiales/api";
import { guardarConfiguracionProductoObra } from "@/features/materiales/productosAsignadosApi";

const AGRUPACIONES = [
  { valor: "rubro", etiqueta: "Agrupar por rubro" },
  { valor: "proveedor", etiqueta: "Agrupar por proveedor" },
];

const VISTAS = [
  { valor: "todo", etiqueta: "Todo", ayuda: "Muestra entregado, en pañol y pendiente dentro de cada obra." },
  { valor: "falta", etiqueta: "Faltantes", ayuda: "Lo que esa obra todavía necesita." },
  { valor: "panol", etiqueta: "Esperando retiro", ayuda: "Lo que ya llegó y está apartado para la obra." },
  { valor: "entregado", etiqueta: "Entregados", ayuda: "Lo que ya salió del pañol hacia la obra." },
];

const ORIGENES = [
  { valor: "todos", etiqueta: "Todos", ayuda: "Todos los materiales de la planilla.", icono: Table2 },
  { valor: "matriz", etiqueta: "Matriz", ayuda: "Necesidad estándar definida para toda la línea.", icono: Layers3 },
  { valor: "opcional", etiqueta: "Configuración", ayuda: "Materiales agregados o cantidades modificadas por la configuración particular del barco.", icono: Sparkles },
  { valor: "adicional", etiqueta: "Adicionales", ayuda: "Extras incorporados específicamente para una obra.", icono: PlusCircle },
  { valor: "panol", etiqueta: "Desde pañol", ayuda: "Ítems incorporados desde movimientos o listas operativas de pañol.", icono: Warehouse },
  { valor: "fuera_matriz", etiqueta: "A revisar", ayuda: "Filas históricas o manuales sin una clasificación confiable en la matriz.", icono: AlertTriangle },
];

const ORIGEN_TONOS = {
  matriz: { color: C.blue, fondo: C.blueL, borde: C.blueB, texto: "Matriz", icono: Layers3 },
  opcional: { color: C.violet, fondo: C.violetL, borde: C.violetB, texto: "Config.", icono: Sparkles },
  adicional: { color: C.teal, fondo: C.tealL, borde: C.tealB, texto: "Adicional", icono: PlusCircle },
  panol: { color: C.cyan, fondo: C.cyanL, borde: C.cyanB, texto: "Pañol", icono: Warehouse },
  fuera_matriz: { color: C.red, fondo: C.redL, borde: C.redB, texto: "A revisar", icono: AlertTriangle },
};

const MotionDiv = motion.div;
const MotionButton = motion.button;
const MotionI = motion.i;

const CARGA = {
  sin_matriz: {
    texto: "sin lista matriz",
    color: C.amber,
    ayuda: "Esta línea todavía no tiene una lista matriz configurada.",
  },
  todo_llego: {
    texto: "obra completa",
    color: C.green,
    ayuda: "No quedan materiales pendientes en esta obra.",
  },
  con_pendientes: {
    texto: "requiere acción",
    color: "#f59e0b",
    ayuda: "La obra todavía tiene faltantes por resolver.",
  },
};

const redondear = (value) => Math.round(Number(value || 0) * 100) / 100;
const mostrarNumero = (value) => {
  const n = redondear(value);
  return n ? String(n).replace(".", ",") : "—";
};


/**
 * La celda como mancha de calor.
 *
 * Antes cada cruce escribia "necesita 12 · 4 entregados · 8 faltantes": con
 * siete obras y trescientos materiales eso es leer la palabra "faltantes"
 * quinientas veces para encontrar tres huecos. Aca el fondo es la señal y el
 * numero es el detalle: alejando la vista se ve DONDE esta el problema sin
 * leer nada, y acercandose se lee cuanto.
 *
 * LA INTENSIDAD VA POR CANTIDAD, NO POR PROPORCION. Lo primero que se probo fue
 * teñir segun que parte del requerido falta, y contra los datos reales no
 * servia: el 99% de las celdas con faltante estan al 100% -cuando algo falta,
 * casi siempre no llego nada- asi que la planilla quedaba un bloque rojo
 * parejo, peor que antes. Lo que si distingue es CUANTO falta, que ademas es la
 * pregunta de esta pantalla.
 *
 * Y va en escala logaritmica con el techo calculado sobre lo que hay en
 * pantalla: las cantidades van de 1 a 2.200 y en escala lineal los faltantes
 * chicos -que son la mitad de la tabla- quedarian todos invisibles.
 */
function CeldaCalor({ celda, vista, techo }) {
  if (!celda) return <span style={{ color: C.border2, fontSize: 12, fontFamily: C.mono }}>·</span>;

  const falta = Number(celda.pendiente) || 0;
  const enPanol = Number(celda.enPanol) || 0;
  const entregado = Number(celda.egresado) || 0;
  const sinDefinir = celda.requiereProductoConcreto && !celda.productoDefinido;

  const nivel = (n) => {
    if (!(n > 0)) return 0;
    const tope = Math.log((techo || 1) + 1);
    return tope > 0 ? Math.min(1, Math.log(n + 1) / tope) : 1;
  };
  const mancha = (n, base) => {
    const v = nivel(n);
    return {
      background: `color-mix(in srgb, ${base} ${Math.round(8 + v * 62)}%, transparent)`,
      // Solo el tramo mas cargado necesita invertir el texto; antes el umbral
      // estaba tan bajo que media tabla quedaba en blanco sobre rojo.
      color: v > 0.72 ? "#fff" : base,
    };
  };

  // Con una vista de un solo estado la celda muestra ese estado y nada mas, asi
  // todas las celdas de la tabla quieren decir lo mismo.
  const soloEste = vista === "falta" ? falta : vista === "panol" ? enPanol : vista === "entregado" ? entregado : null;
  if (soloEste !== null) {
    if (!(soloEste > 0)) return <span style={{ color: C.border2, fontSize: 12, fontFamily: C.mono }}>·</span>;
    const base = vista === "falta" ? C.red : vista === "panol" ? C.cyan : C.green;
    return (
      <span className="celda-calor" style={{
        display: "block", height: 34, lineHeight: "34px", borderRadius: 5,
        ...mancha(soloEste, base),
        fontFamily: C.mono, fontSize: 12, fontWeight: 950, fontVariantNumeric: "tabular-nums",
      }}>
        {mostrarNumero(soloEste)}
      </span>
    );
  }

  let estilo = { background: "transparent", color: C.border2 };
  let texto = "—";
  let peso = 900;

  if (sinDefinir) {
    estilo = { background: C.violetL, color: C.violet }; texto = "?";
  } else if (falta > 0) {
    estilo = mancha(falta, C.red); texto = mostrarNumero(falta); peso = 950;
  } else if (enPanol > 0) {
    estilo = { background: C.cyanL, color: C.cyan }; texto = mostrarNumero(enPanol);
  } else if (entregado > 0) {
    // Lo entregado es un hecho consumado: se ve, pero no compite por atencion.
    estilo = { background: "var(--green-soft)", color: C.green }; texto = mostrarNumero(entregado); peso = 800;
  }

  return (
    <span className={`celda-calor${sinDefinir ? " celda-calor-definir" : ""}`} style={{
      display: "block", height: 34, lineHeight: "34px", borderRadius: 5,
      ...estilo,
      fontFamily: C.mono, fontSize: 12, fontWeight: peso, fontVariantNumeric: "tabular-nums",
    }}>
      {texto}
    </span>
  );
}


function Metric({ valor, etiqueta, color = C.text, icono: Icon }) {
  return (
    <div style={{
      minWidth: 118,
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "8px 11px",
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: "var(--panel-2)",
    }}>
      {Icon ? (
        <span style={{
          width: 27,
          height: 27,
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          flexShrink: 0,
        }}>
          <Icon size={14} />
        </span>
      ) : null}
      <span style={{ display: "grid", gap: 1 }}>
        <strong style={{ color, fontFamily: C.mono, fontSize: 14, fontWeight: 950, lineHeight: 1 }}>{valor}</strong>
        <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>{etiqueta}</span>
      </span>
    </div>
  );
}

function EstadoNumero({ value, tone = "neutral", suffix = "" }) {
  const palette = tone === "danger"
    ? { color: C.red, bg: C.redL, border: C.redB }
    : tone === "success"
      ? { color: C.green, bg: "var(--green-soft)", border: C.greenB }
      : tone === "info"
        ? { color: C.cyan, bg: C.cyanL, border: C.cyanB }
        : { color: C.text, bg: "var(--panel-2)", border: C.border };
  if (!(Number(value) > 0)) return <span style={{ color: C.border2 }}>—</span>;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: 3,
      minWidth: 32,
      justifyContent: "center",
      borderRadius: 7,
      border: `1px solid ${palette.border}`,
      background: palette.bg,
      color: palette.color,
      padding: "3px 7px",
      fontFamily: C.mono,
      fontSize: 12,
      fontWeight: 900,
      fontVariantNumeric: "tabular-nums",
    }}>
      {mostrarNumero(value)}
      {suffix ? <small style={{ fontSize: 8.5, fontWeight: 800 }}>{suffix}</small> : null}
    </span>
  );
}

function DesgloseConfiguracion({ celda, unidad }) {
  const ajuste = Number(celda?.ajusteConfiguracion || 0);
  if (!ajuste) return null;
  const base = Number(celda?.baseRequerido || 0);
  const detalle = (celda?.configuraciones || [])
    .map((item) => `${item.nombre}: ${item.delta > 0 ? "+" : ""}${mostrarNumero(item.delta)} ${unidad}`)
    .join(" · ");
  return (
    <div title={detalle || "Cantidad ajustada por la configuración de esta obra"} style={{ marginTop: 3, color: C.violet, fontSize: 8.5, fontWeight: 900, lineHeight: 1.25 }}>
      {base > 0 ? `${mostrarNumero(base)} base ` : "Sólo configuración "}
      {ajuste > 0 ? "+" : "−"} {mostrarNumero(Math.abs(ajuste))}
    </div>
  );
}

function OrigenBadge({ origen, compacto = false }) {
  const meta = ORIGEN_TONOS[origen];
  if (!meta) return null;
  const Icon = meta.icono;
  return (
    <span
      title={ORIGENES.find((item) => item.valor === origen)?.ayuda}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        border: `1px solid ${meta.borde}`,
        background: meta.fondo,
        color: meta.color,
        borderRadius: 999,
        padding: compacto ? "2px 6px" : "4px 8px",
        fontSize: compacto ? 9 : 10.5,
        fontWeight: 900,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={compacto ? 9 : 11} strokeWidth={2.3} />
      {meta.texto}
    </span>
  );
}

export default function PlanillaObrasPanel({ isMobile = false, onPedir, profile = null }) {
  const toast = useToast();
  const reducirMovimiento = useReducedMotion();
  const [linea, setLinea] = useState("K37");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState("rubro");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [soloSinOpcion, setSoloSinOpcion] = useState(false);
  const [obraFoco, setObraFoco] = useState("");
  const [vista, setVista] = useState("todo");
  const [origenFiltro, setOrigenFiltro] = useState("todos");
  const [elegidos, setElegidos] = useState(() => new Set());
  const [obrasAviso, setObrasAviso] = useState(() => new Set());
  const [selectorObrasAvisoAbierto, setSelectorObrasAvisoAbierto] = useState(false);
  const [avisoPreparacion, setAvisoPreparacion] = useState(null);
  const [gruposCerrados, setGruposCerrados] = useState(() => new Set());
  const [panolPrefill, setPanolPrefill] = useState(null);
  const [productoBusy, setProductoBusy] = useState("");
  const [exportando, setExportando] = useState(false);
  const buscadorRef = useRef(null);
  const busquedaDiferida = useDeferredValue(busqueda);

  const cargar = useCallback(async (cual) => {
    setCargando(true);
    try {
      const resultado = await calcularPlanillaDeLinea(cual);
      setDatos(resultado);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo armar la planilla.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(linea); }, [cargar, linea]);

  useEffect(() => {
    setElegidos(new Set());
    setObrasAviso(new Set());
    setSelectorObrasAvisoAbierto(false);
    setAvisoPreparacion(null);
    setObraFoco("");
    setVista("todo");
    setOrigenFiltro("todos");
    setSoloSinOpcion(false);
  }, [linea]);

  const obraSeleccionada = useMemo(
    () => datos?.obras.find((obra) => obra.id === obraFoco) || null,
    [datos, obraFoco],
  );

  const catalogoPorId = useMemo(
    () => new Map((datos?.catalogo ?? []).map((material) => [material.id, material])),
    [datos],
  );

  const compatiblesPorRequisito = useMemo(() => {
    const mapa = new Map();
    for (const link of datos?.productosCompatibles ?? []) {
      const lista = mapa.get(link.requisito_material_id) ?? [];
      lista.push(link);
      mapa.set(link.requisito_material_id, lista);
    }
    return mapa;
  }, [datos]);

  const obrasVisibles = useMemo(() => {
    if (!datos) return [];
    return obraSeleccionada ? [obraSeleccionada] : datos.obras;
  }, [datos, obraSeleccionada]);

  const obrasAvisoSeleccionadas = useMemo(
    () => (datos?.obras ?? []).filter((obra) => obrasAviso.has(obra.id)),
    [datos, obrasAviso],
  );

  const cantidadPendiente = useCallback((fila) => (
    obraFoco ? (fila.porObra[obraFoco]?.pendiente || 0) : fila.totales.pendiente
  ), [obraFoco]);

  /**
   * Cuanto hay que comprar de esta fila.
   *
   * Sin foco de obra la cuenta YA VIENE HECHA del API, y viene hecha por
   * familia: un requisito y sus productos concretos son una sola necesidad, y
   * lo libre de cualquiera de ellos la cubre. Recalcularla aca fila por fila es
   * lo que hacia que 'TV 24" · Samsung' pidiera comprar 1 mientras habia ocho
   * 'TV 24"' y dos Noblex libres en el pañol: el panel tenia su propia copia de
   * la cuenta y pisaba la del API.
   *
   * Con una obra en foco hay que rehacerla, porque el pendiente pasa a ser solo
   * el de ese barco; ahi tambien se descuenta el stock de toda la familia.
   */
  const cantidadComprar = useCallback((fila) => {
    if (!obraFoco) return redondear(Math.max(0, Number(fila.faltaComprar) || 0));
    const libre = Number(fila.enPanolLibreFamilia ?? fila.enPanolLibre) || 0;
    return redondear(Math.max(0, cantidadPendiente(fila) - libre));
  }, [cantidadPendiente, obraFoco]);

  const conteoOrigen = useMemo(() => {
    const filas = datos?.filas.filter((fila) => !obraFoco || fila.porObra[obraFoco]) ?? [];
    return Object.fromEntries(ORIGENES.map((item) => [
      item.valor,
      item.valor === "todos"
        ? filas.length
        : filas.filter((fila) => fila.origenes?.includes(item.valor)).length,
    ]));
  }, [datos, obraFoco]);

  /**
   * El techo de la escala de calor: el percentil 95 de los faltantes que estan
   * en pantalla. Se calcula sobre lo visible y no sobre un numero fijo para que
   * la escala siga discriminando cuando se cambia de linea o se filtra: si el
   * mayor faltante pasa de 2.200 a 12, la mancha se reparte igual.
   */
  const techoCalor = useMemo(() => {
    if (!datos) return 1;
    const valores = [];
    for (const fila of datos.filas) {
      for (const celda of Object.values(fila.porObra || {})) {
        const n = Number(celda?.pendiente) || 0;
        if (n > 0) valores.push(n);
      }
    }
    if (!valores.length) return 1;
    valores.sort((a, b) => a - b);
    return valores[Math.floor((valores.length - 1) * 0.95)] || 1;
  }, [datos]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const q = busquedaDiferida.trim().toLocaleLowerCase("es");
    const filtradas = datos.filas.filter((fila) => {
      if (obraFoco && !fila.porObra[obraFoco]) return false;
      if (origenFiltro !== "todos" && !fila.origenes?.includes(origenFiltro)) return false;
      if (soloPendientes && !(cantidadPendiente(fila) > 0)) return false;
      if (soloSinOpcion) {
        const celda = obraFoco ? fila.porObra[obraFoco] : null;
        if (!celda?.requiereProductoConcreto || celda.productoDefinido) return false;
      }
      if (!q) return true;
      return [fila.descripcion, fila.codigo, fila.proveedor, fila.rubro]
        .some((campo) => String(campo || "").toLocaleLowerCase("es").includes(q));
    });
    const mapa = new Map();
    for (const fila of filtradas) {
      const clave = agrupar === "rubro" ? fila.rubro : (fila.proveedor || "Sin proveedor");
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(fila);
    }
    return [...mapa.entries()]
      .map(([nombre, filas]) => ({
        nombre,
        filas,
        pendientes: filas.filter((fila) => cantidadPendiente(fila) > 0).length,
        aComprar: filas.filter((fila) => cantidadComprar(fila) > 0).length,
        sinProveedor: nombre === "Sin proveedor",
      }))
      .sort((a, b) => {
        if (a.sinProveedor !== b.sinProveedor) return a.sinProveedor ? 1 : -1;
        return a.nombre.localeCompare(b.nombre, "es");
      });
  }, [datos, busquedaDiferida, agrupar, soloPendientes, soloSinOpcion, obraFoco, origenFiltro, cantidadPendiente, cantidadComprar]);

  const filasVisibles = useMemo(() => grupos.flatMap((grupo) => grupo.filas), [grupos]);
  const seleccionados = useMemo(
    () => filasVisibles.filter((fila) => elegidos.has(fila.id)),
    [filasVisibles, elegidos],
  );

  const resumenFoco = useMemo(() => {
    const filas = datos?.filas.filter((fila) => !obraFoco || fila.porObra[obraFoco]) ?? [];
    return {
      materiales: filas.length,
      pendientes: filas.filter((fila) => cantidadPendiente(fila) > 0).length,
      enPanol: filas.filter((fila) => {
        const celda = obraFoco ? fila.porObra[obraFoco] : null;
        return obraFoco ? celda?.enPanol > 0 : fila.totales.enPanol > 0;
      }).length,
      entregados: filas.filter((fila) => {
        const celda = obraFoco ? fila.porObra[obraFoco] : null;
        return obraFoco ? celda?.egresado > 0 : fila.totales.egresado > 0;
      }).length,
      aComprar: filas.filter((fila) => cantidadComprar(fila) > 0).length,
    };
  }, [datos, obraFoco, cantidadPendiente, cantidadComprar]);

  function alternarFila(id) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function alternarGrupo(grupo) {
    const ids = grupo.filas.map((fila) => fila.id);
    const todosPuestos = ids.every((id) => elegidos.has(id));
    setElegidos((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (todosPuestos) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  function alternarCerrado(nombre) {
    setGruposCerrados((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
      return next;
    });
  }

  function cambiarObra(value) {
    setObraFoco(value);
    setElegidos(new Set());
    setSoloSinOpcion(false);
    if (value) setObrasAviso(new Set([value]));
  }

  function alternarObraAviso(id) {
    setObrasAviso((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function lineasDePedido() {
    const renglones = [];
    let cubiertos = 0;
    for (const fila of seleccionados) {
      const pendiente = cantidadPendiente(fila);
      const aPedir = cantidadComprar(fila);
      if (pendiente > 0 && aPedir === 0) {
        cubiertos += 1;
        continue;
      }
      const cantidad = aPedir > 0 ? aPedir : 1;
      renglones.push(`${cantidad} ${fila.unidad}  ${fila.descripcion}${fila.codigo ? ` (${fila.codigo})` : ""}`);
    }
    return { renglones, cubiertos };
  }

  function opcionesPendientesPara(obrasObjetivo = []) {
    const pendientes = [];
    for (const fila of seleccionados) {
      for (const obra of obrasObjetivo) {
        const celda = fila.porObra[obra.id];
        if (celda?.requiereProductoConcreto && !celda.productoDefinido) {
          pendientes.push({ fila, obra });
        }
      }
    }
    return pendientes;
  }

  function validarOpcionesPara(obrasObjetivo, accion) {
    const pendientes = opcionesPendientesPara(obrasObjetivo);
    if (!pendientes.length) return true;
    const obras = [...new Set(pendientes.map((item) => item.obra.codigo))];
    if (obraSeleccionada) setSoloSinOpcion(true);
    toast.error(`${pendientes.length} ítem${pendientes.length === 1 ? "" : "s"} matriz todavía no ${pendientes.length === 1 ? "tiene" : "tienen"} producto concreto en ${obras.join(", ")}. Resolvelo antes de ${accion}.`);
    return false;
  }

  function abrirFicha(evento, materialId) {
    evento.stopPropagation();
    window.open(`/catalogo-maestro?material=${materialId}`, "_blank", "noopener");
  }

  function abrirImagen(evento, fila) {
    evento.stopPropagation();
    if (fila.imagenUrl) window.open(fila.imagenUrl, "_blank", "noopener");
  }

  async function cambiarProductoObra(row, configuracion) {
    if (!obraSeleccionada?.id || !row?.requisitoMaterialId) return;
    setProductoBusy(row.id);
    try {
      let snapshotId = row.configuracionSnapshotId || row.snapshotId || null;
      if (!snapshotId) {
        const creado = await ensureObraMaterialSnapshotRow(obraSeleccionada.id, {
          requisitoMaterialId: row.requisitoMaterialId,
          materialId: row.requisitoMaterialId,
          productoMaterialId: row.productoMaterialId || null,
          descripcion: row.descripcion,
          codigo: row.codigo || null,
          cantidad: row.cantidad,
          unidad: row.unidad,
          proveedor: row.proveedor || null,
          rubro: row.rubro || null,
          source: "matriz",
          tipo: "base",
          estado: "pendiente",
          especificaciones: row.especificaciones || {},
        });
        snapshotId = creado?.id || null;
      }
      if (!snapshotId) throw new Error("No se pudo preparar el requisito de esta obra.");

      await guardarConfiguracionProductoObra({
        snapshotId,
        productoMaterialId: configuracion.productoMaterialId || null,
        especificaciones: configuracion.especificaciones || {},
        origen: "planilla_compras_obra",
      });
      await cargar(linea);
      const producto = catalogoPorId.get(configuracion.productoMaterialId);
      toast.success(producto
        ? `${producto.descripcion} quedó definido para ${obraSeleccionada.codigo}.`
        : `El producto de ${row.descripcion} quedó sin definir.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar el producto de esta obra.");
    } finally {
      setProductoBusy("");
    }
  }

  function copiar() {
    const { renglones, cubiertos } = lineasDePedido();
    if (!renglones.length) {
      toast.info(`Lo elegido ya está libre en el pañol (${cubiertos}). No hay nada para comprar.`);
      return;
    }
    const obra = obraSeleccionada ? ` · ${obraSeleccionada.codigo}` : "";
    navigator.clipboard?.writeText(`Pedido ${linea}${obra}\n\n${renglones.join("\n")}`)
      .then(() => toast.success(`${renglones.length} renglones copiados${cubiertos ? ` · ${cubiertos} ya están en el pañol` : ""}.`))
      .catch(() => toast.error("No se pudo copiar."));
  }

  function pedir() {
    if (!seleccionados.length) return;
    if (obraSeleccionada && !validarOpcionesPara([obraSeleccionada], "crear el pedido")) return;
    const { renglones, cubiertos } = lineasDePedido();
    if (!renglones.length) {
      toast.info(`Lo elegido ya está libre en el pañol (${cubiertos}). No hay nada para comprar.`);
      return;
    }
    const proveedores = [...new Set(seleccionados.map((fila) => fila.proveedor).filter(Boolean))];
    onPedir?.({
      titulo: `${linea}${obraSeleccionada ? ` ${obraSeleccionada.codigo}` : ""} · ${renglones.length} materiales`,
      descripcion: renglones.join("\n"),
      proveedorSugerido: proveedores.length === 1 ? proveedores[0] : "",
      obraId: obraSeleccionada?.id || "",
      obraCodigo: obraSeleccionada?.codigo || "",
    });
    setElegidos(new Set());
    if (cubiertos) toast.info(`${cubiertos} quedaron afuera: ya están libres en el pañol.`);
  }

  function avisarPanol() {
    if (!obrasAvisoSeleccionadas.length) {
      setSelectorObrasAvisoAbierto(true);
      toast.info("Elegí una o varias obras para el aviso a pañol.");
      return;
    }
    if (!validarOpcionesPara(obrasAvisoSeleccionadas, "avisar a pañol")) return;

    let yaAvisados = 0;
    let cubiertos = 0;
    const items = [];

    for (const fila of seleccionados) {
      // El stock libre es uno solo. Se reparte una vez, en el orden visible de
      // las obras, para no usar la misma existencia como cobertura de dos barcos.
      // Cuenta el de toda la familia: pedirle al pañol un 'TV 24" · Samsung'
      // cuando tiene ocho 'TV 24"' en el estante es hacerlo buscar al pedo.
      let stockLibreRestante = Number(fila.enPanolLibreFamilia ?? fila.enPanolLibre) || 0;
      for (const obra of obrasAvisoSeleccionadas) {
        const celda = fila.porObra[obra.id];
        const pendiente = Number(celda?.pendiente || 0);
        if (!(pendiente > 0)) continue;
        if (celda.avisoPendiente) {
          yaAvisados += 1;
          continue;
        }

        const cubiertoConStock = Math.min(stockLibreRestante, pendiente);
        stockLibreRestante = redondear(Math.max(0, stockLibreRestante - cubiertoConStock));
        const cantidad = redondear(Math.max(0, pendiente - cubiertoConStock));
        if (!(cantidad > 0)) {
          cubiertos += 1;
          continue;
        }

        items.push({
          descripcion: fila.descripcion,
          codigo: fila.codigo || "",
          cantidad,
          unidad: fila.unidad || "unidad",
          material_id: fila.id,
          requisito_material_id: celda.requisitoId || fila.requisitoId || fila.id,
          obra_snapshot_item_id: celda.snapshotId || null,
          obra_id: obra.id,
          obra_codigo: obra.codigo,
          proveedor: fila.proveedor || "",
          rubro: fila.rubro || "",
          es_adicional: celda.desdeMatriz === false,
        });
      }
    }

    if (!items.length) {
      if (yaAvisados) toast.info("Lo elegido ya tiene un aviso de recepción abierto en pañol.");
      else if (cubiertos) toast.info("Lo elegido ya puede cubrirse con stock libre del pañol.");
      else toast.info("No hay cantidades pendientes para avisar en las obras elegidas.");
      return;
    }

    const codigos = obrasAvisoSeleccionadas.map((obra) => obra.codigo);
    const resumenObras = codigos.length <= 3
      ? codigos.join(" + ")
      : `${codigos.slice(0, 3).join(" + ")} +${codigos.length - 3}`;
    setAvisoPreparacion({
      titulo: `Recepción ${resumenObras} · ${items.length} renglón${items.length === 1 ? "" : "es"}`,
      observaciones: `Material ya comprado para ${codigos.join(", ")}. Aviso creado desde la planilla de ${linea}.`,
      items,
      obras: obrasAvisoSeleccionadas,
      yaAvisados,
      cubiertos,
    });
  }

  function continuarAvisoPanol() {
    if (!avisoPreparacion?.titulo?.trim()) {
      toast.info("Escribí un título para identificar el aviso.");
      return;
    }
    const [obraPrincipal, ...obrasExtra] = avisoPreparacion.obras;
    setPanolPrefill({
      titulo: avisoPreparacion.titulo.trim(),
      sede: "",
      obraId: obraPrincipal?.id || "",
      obrasExtra: obrasExtra.map((obra) => obra.id),
      prioridad: "media",
      observaciones: avisoPreparacion.observaciones.trim(),
      origen: "obra_matriz",
      items: avisoPreparacion.items,
    });
    setAvisoPreparacion(null);
  }

  async function exportar() {
    if (!datos || exportando) return;
    setExportando(true);
    try {
      const resultado = await exportarPlanillaXlsx({
        linea: datos.linea,
        obraSeleccionada,
        obras: obrasVisibles,
        grupos,
        cantidadComprar,
        catalogo: datos.catalogo,
      });
      toast.success(`${resultado.materiales} materiales exportados en un Excel con resumen y detalle.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

  const panel = {
    background: "var(--panel-solid)",
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    backdropFilter: "var(--glass-filter)",
    WebkitBackdropFilter: "var(--glass-filter)",
  };
  const control = {
    border: `1px solid ${C.border2}`,
    background: "var(--panel-solid)",
    color: C.text,
    borderRadius: 9,
    padding: "8px 10px",
    fontFamily: C.sans,
    fontSize: 12.5,
    fontWeight: 800,
    outline: "none",
    cursor: "pointer",
  };
  const th = {
    position: "sticky",
    top: 0,
    zIndex: 12,
    background: "var(--panel-solid)",
    textAlign: "center",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: C.dim,
    padding: "10px 7px",
    borderBottom: `1px solid ${C.border}`,
    boxShadow: `inset 0 -1px 0 ${C.border}`,
    whiteSpace: "nowrap",
  };
  const colFija = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--panel-solid)",
    borderRight: `1px solid ${C.border}`,
  };

  const columnas = obraSeleccionada ? 8 : 3 + obrasVisibles.length;

  return (
    <div className="planilla-obras" style={{ display: "grid", gap: 12, padding: isMobile ? 12 : 0, minWidth: 0 }}>
      <style>{`
        .planilla-obras .planilla-fila { transition: background .16s ease, box-shadow .18s ease; }
        .planilla-obras .planilla-fila:hover { background: var(--panel-2); }
        .planilla-obras .planilla-fila:hover .planilla-celda-fija { background: var(--panel-2); }
        .planilla-obras .planilla-fila:focus-visible { outline: 2px solid ${C.blue}; outline-offset: -2px; }
        .planilla-obras .planilla-check:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
        .planilla-obras button:focus-visible, .planilla-obras select:focus-visible, .planilla-obras input:focus-visible, .planilla-obras textarea:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
        .planilla-obras .planilla-ficha { transition: opacity .15s, border-color .15s, color .15s; }
        .planilla-obras .planilla-thumb { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .planilla-obras .planilla-thumb:hover { transform: scale(1.06); border-color: ${C.blueB}; box-shadow: 0 5px 14px rgba(15,23,42,.18); }
        .planilla-obras .planilla-contexto { display: block; }
        .planilla-obras .planilla-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
        .planilla-obras .planilla-cabecera-obras th { background-color: var(--panel-solid); background-clip: padding-box; }
        .planilla-obras .planilla-cabecera-obras { filter: drop-shadow(0 7px 8px rgba(15,23,42,.10)); }
        .planilla-obras .planilla-senales > * { flex: 0 1 auto; }

        /* El recuadro violeta es un boton. Sin animacion: se probo con hover,
           sombra y un latido, y con 4.599 celdas en pantalla el navegador tiene
           que sostener una capa de GPU por celda y la tabla se arrastra. */
        .planilla-obras .celda-definir { display: block; border-radius: 5px; }
        .planilla-obras .celda-definir:focus-visible { outline: none; }
        .planilla-obras .celda-definir:focus-visible .celda-calor { outline: 2px solid ${C.violet}; outline-offset: 1px; }
        @media (hover: hover) {
          .planilla-obras .planilla-ficha { opacity: .2; }
          .planilla-obras .planilla-fila:hover .planilla-ficha { opacity: 1; }
        }
        @media (max-width: 760px) {
          .planilla-obras .planilla-filtros { flex-wrap: wrap; overflow-x: visible; }
          .planilla-obras .planilla-filtros > * { flex: 1 1 145px; }
          .planilla-obras .planilla-filtros .planilla-buscador { flex-basis: 100%; }
          .planilla-obras .planilla-senales > * { flex: 1 1 132px; min-width: 0 !important; }
          .planilla-obras .planilla-origenes { margin-inline: -2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .planilla-obras *, .planilla-obras *::before, .planilla-obras *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
        }
      `}</style>

      <section
        className="planilla-central"
        style={{
          ...panel,
          position: "relative",
          overflow: "hidden",
          padding: isMobile ? 14 : "17px 18px 15px",
          display: "grid",
          gap: 14,
          background: "linear-gradient(118deg, var(--panel-solid) 0%, var(--panel-solid) 58%, var(--blue-soft) 145%)",
          boxShadow: "0 16px 42px color-mix(in srgb, var(--blue) 7%, transparent)",
        }}
      >
        <div aria-hidden="true" style={{ position: "absolute", width: 360, height: 360, right: -120, top: -205, borderRadius: 999, pointerEvents: "none", background: "radial-gradient(circle, color-mix(in srgb, var(--blue) 13%, transparent), transparent 68%)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <MotionDiv
            initial={reducirMovimiento ? false : { opacity: 0, scale: 0.88, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 310, damping: 24 }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              color: C.blue,
              background: C.blueL,
              border: `1px solid ${C.blueB}`,
              boxShadow: "0 8px 20px color-mix(in srgb, var(--blue) 15%, transparent)",
              flexShrink: 0,
            }}
          >
            <Layers3 size={20} />
          </MotionDiv>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ color: C.blue, fontSize: 9.5, fontWeight: 950, letterSpacing: 1.35, textTransform: "uppercase" }}>Central de abastecimiento</div>
            <h2 style={{ margin: "3px 0 0", color: C.text, fontSize: isMobile ? 19 : 21, lineHeight: 1.08, fontWeight: 950, letterSpacing: -.35 }}>Planillas por obra</h2>
            <p style={{ margin: "5px 0 0", maxWidth: 720, color: C.dim, fontSize: 11.5, fontWeight: 700, lineHeight: 1.4 }}>
              Matriz, adicionales, compras y pañol en una sola vista para decidir qué mover a continuación.
            </p>
          </div>
          {datos ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 999, padding: "5px 9px", fontFamily: C.mono, fontSize: 10.5, fontWeight: 950 }}>{linea}</span>
              <span style={{ border: `1px solid ${C.border}`, background: "var(--panel-2)", color: C.dim, borderRadius: 999, padding: "5px 9px", fontSize: 10.5, fontWeight: 850 }}>{datos.obras.length} obras activas</span>
            </div>
          ) : null}
        </div>

        {datos ? (
          <MotionDiv
            initial={reducirMovimiento ? false : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05 }}
            className="planilla-senales"
            style={{ display: "flex", gap: 7, flexWrap: "wrap", position: "relative" }}
          >
            <Metric valor={resumenFoco.materiales} etiqueta="materiales visibles" icono={Table2} />
            <Metric valor={resumenFoco.aComprar} etiqueta="requieren compra" color={C.amber} icono={ShoppingCart} />
            <Metric valor={resumenFoco.pendientes} etiqueta="con faltantes" color={C.red} icono={AlertTriangle} />
            <Metric valor={resumenFoco.enPanol} etiqueta="esperando retiro" color={C.cyan} icono={PackageCheck} />
            <Metric valor={resumenFoco.entregados} etiqueta="con entregas" color={C.green} icono={CheckCircle2} />
            {obraSeleccionada?.opcionesPendientes ? <Metric valor={obraSeleccionada.opcionesPendientes} etiqueta="productos por definir" color={C.amber} icono={CircleAlert} /> : null}
          </MotionDiv>
        ) : null}
      </section>

      {datos?.obras.length ? (
        <section className="planilla-contexto" style={{ ...panel, overflow: "hidden" }}>
          <div style={{
            padding: 15,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            background: obraSeleccionada ? "linear-gradient(120deg, var(--panel-solid), var(--blue-soft))" : "var(--panel-2)",
          }}>
            {obraSeleccionada ? (
              <>
                <div style={{ minWidth: 140 }}>
                  <div style={{ color: C.text, fontSize: 18, fontWeight: 950 }}>{obraSeleccionada.codigo}</div>
                  <div style={{ marginTop: 3, color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                    {obraSeleccionada.filasCargadas} materiales de {linea}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.pendientes} materiales con faltantes</span>
                  <span style={{ color: C.cyan, fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.enPanol} esperando retiro</span>
                  <span style={{ color: C.green, fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.entregados} con entregas</span>
                  {obraSeleccionada.opcionesPendientes ? <span style={{ color: C.amber, fontSize: 12, fontWeight: 950 }}>{obraSeleccionada.opcionesPendientes} productos por definir</span> : null}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{
                    color: CARGA[obraSeleccionada.carga]?.color || C.dim,
                    border: `1px solid color-mix(in srgb, ${CARGA[obraSeleccionada.carga]?.color || C.dim} 35%, transparent)`,
                    borderRadius: 999,
                    padding: "5px 9px",
                    fontSize: 10.5,
                    fontWeight: 900,
                  }}>
                    {CARGA[obraSeleccionada.carga]?.texto || "en curso"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{linea} · todas las obras activas</div>
                  <div style={{ marginTop: 3, color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
                    El fondo de cada celda es la señal: cuanto más rojo, mayor la cantidad que falta de ese material en ese barco.
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 10.5, fontWeight: 850 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.dim }}>
                    falta poco
                    <span style={{ display: "inline-flex", borderRadius: 3, overflow: "hidden" }}>
                      <i style={{ width: 14, height: 11, background: `color-mix(in srgb, ${C.red} 14%, transparent)` }} />
                      <i style={{ width: 14, height: 11, background: `color-mix(in srgb, ${C.red} 30%, transparent)` }} />
                      <i style={{ width: 14, height: 11, background: `color-mix(in srgb, ${C.red} 46%, transparent)` }} />
                      <i style={{ width: 14, height: 11, background: `color-mix(in srgb, ${C.red} 62%, transparent)` }} />
                      <i style={{ width: 14, height: 11, background: `color-mix(in srgb, ${C.red} 70%, transparent)` }} />
                    </span>
                    falta mucho
                  </span>
                  <span style={{ color: C.cyan }}>■ esperando retiro</span>
                  <span style={{ color: C.green }}>■ entregado</span>
                  <span style={{ color: C.violet }}>■ sin definir</span>
                  <span style={{ color: C.border2 }}>· no lleva</span>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {obraSeleccionada?.opcionesPendientes ? (
        <section style={{ ...panel, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderColor: C.amberB, background: "linear-gradient(90deg, var(--amber-soft), var(--panel-solid))" }}>
          <span style={{ width: 30, height: 30, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 9, background: C.amberL, color: C.amber }}>
            <CircleAlert size={16} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 950 }}>
              {obraSeleccionada.opcionesPendientes} ítem{obraSeleccionada.opcionesPendientes === 1 ? " matriz necesita" : "s matriz necesitan"} un producto concreto
            </div>
            <div style={{ marginTop: 2, color: C.dim, fontSize: 10.5, fontWeight: 700 }}>
              Elegilo en la columna “Producto para esta obra”. La compra y el aviso a pañol usarán ese producto, no el requisito genérico.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSoloSinOpcion((actual) => !actual)}
            style={{ ...control, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, borderColor: C.amberB, background: soloSinOpcion ? C.amber : C.amberL, color: soloSinOpcion ? "#fff" : C.amber }}
          >
            <CircleAlert size={13} /> {soloSinOpcion ? "Ver todos" : "Resolver ahora"}
          </button>
        </section>
      ) : null}

      {datos && !datos.matrizMateriales ? (
        <div style={{ ...panel, display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 13px", borderColor: C.amberB, background: C.amberL }}>
          <AlertTriangle size={16} color={C.amber} style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ color: C.amber, fontSize: 12.5, fontWeight: 900 }}>{linea} todavía no tiene lista matriz</div>
            <div style={{ marginTop: 2, color: C.muted, fontSize: 11.5, fontWeight: 700 }}>
              Sólo pueden aparecer movimientos históricos. Configurá la línea en Materiales para que todas sus obras nazcan con pendientes.
            </div>
          </div>
        </div>
      ) : null}

      <section
        className="planilla-command"
        style={{
          ...panel,
          position: "relative",
          zIndex: 4,
          padding: 9,
          display: "grid",
          gap: 8,
          background: "var(--topbar-soft)",
          backdropFilter: "var(--glass-filter)",
          WebkitBackdropFilter: "var(--glass-filter)",
          boxShadow: "0 12px 30px rgba(15,23,42,.10)",
        }}
      >
        <div className="planilla-filtros">
        <select
          value={linea}
          onChange={(event) => setLinea(event.target.value)}
          aria-label="Línea de producción"
          title="Línea de producción"
          style={{ ...control, minWidth: 82, borderColor: C.blueB, background: C.blueL, color: C.blue, fontWeight: 950 }}
        >
          {(datos?.lineasDisponibles ?? [linea]).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          value={obraFoco}
          onChange={(event) => cambiarObra(event.target.value)}
          aria-label="Obra visible"
          title="Elegí una obra para verla en detalle"
          style={{ ...control, minWidth: 190 }}
        >
          <option value="">Todas las obras · vista general</option>
          {(datos?.obras ?? []).map((obra) => (
            <option key={obra.id} value={obra.id}>{obra.codigo} · {obra.pendientes} pendientes</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSelectorObrasAvisoAbierto((current) => !current)}
          title={obrasAvisoSeleccionadas.length
            ? `Aviso para: ${obrasAvisoSeleccionadas.map((obra) => obra.codigo).join(", ")}`
            : "Elegí las obras que compartirán el aviso a pañol"}
          style={{
            ...control,
            minWidth: 152,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderColor: obrasAvisoSeleccionadas.length ? C.greenB : C.border2,
            background: obrasAvisoSeleccionadas.length ? "var(--green-soft)" : "var(--panel-solid)",
            color: obrasAvisoSeleccionadas.length ? C.green : C.text,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Building2 size={14} />
            Aviso · {obrasAvisoSeleccionadas.length || "elegir"}
          </span>
          <ChevronDown size={13} style={{ transform: selectorObrasAvisoAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
        <div className="planilla-buscador" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 240, border: `1px solid ${C.border2}`, background: "var(--panel-2)", borderRadius: 9, padding: "7px 10px" }}>
          <Search size={14} color={C.dim} />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar material, código, rubro o proveedor…"
            style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700 }}
          />
          {busqueda ? (
            <button type="button" onClick={() => { setBusqueda(""); buscadorRef.current?.focus(); }} aria-label="Limpiar búsqueda" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 0 }}>
              <X size={13} />
            </button>
          ) : null}
        </div>
        {!obraSeleccionada ? (
          <div style={{ display: "inline-flex", gap: 2, border: `1px solid ${C.border2}`, borderRadius: 9, padding: 2, background: "var(--panel-solid)" }}>
            {VISTAS.map((item) => (
              <button
                key={item.valor}
                type="button"
                onClick={() => setVista(item.valor)}
                title={item.ayuda}
                style={{
                  border: "none",
                  borderRadius: 7,
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontFamily: C.sans,
                  fontSize: 11,
                  fontWeight: vista === item.valor ? 900 : 750,
                  background: vista === item.valor ? C.blueL : "transparent",
                  color: vista === item.valor ? C.blue : C.dim,
                }}
              >
                {item.etiqueta}
              </button>
            ))}
          </div>
        ) : null}
        <select value={agrupar} onChange={(event) => setAgrupar(event.target.value)} style={control}>
          {AGRUPACIONES.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setSoloPendientes((current) => !current)}
          style={{ ...control, borderColor: soloPendientes ? C.blueB : C.border2, background: soloPendientes ? C.blueL : "var(--panel-solid)", color: soloPendientes ? C.blue : C.text }}
        >
          {soloPendientes ? "Sólo pendientes" : "Todos los materiales"}
        </button>
        {obraSeleccionada ? (
          <button
            type="button"
            onClick={() => setSoloSinOpcion((current) => !current)}
            aria-pressed={soloSinOpcion}
            title="Mostrar únicamente requisitos matriz sin producto concreto elegido"
            style={{
              ...control,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderColor: soloSinOpcion ? "#f59e0b" : C.amberB,
              background: soloSinOpcion ? "rgba(245,158,11,.16)" : C.amberL,
              color: "#b86b00",
            }}
          >
            <CircleAlert size={14} />
            Sin producto · {obraSeleccionada.opcionesPendientes || 0}
          </button>
        ) : null}
        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <button type="button" onClick={exportar} disabled={!datos || exportando} title="Descargar Excel con resumen, vista por obra y detalle" style={{ ...control, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: exportando ? .65 : 1 }}>
            {exportando ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />} {exportando ? "Armando…" : "Excel"}
          </button>
          <button type="button" onClick={() => cargar(linea)} disabled={cargando} aria-label="Actualizar" title="Actualizar datos" style={{ ...control, display: "grid", placeItems: "center" }}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
          </button>
        </div>
        </div>

        <div className="planilla-origenes" aria-label="Filtrar por origen del material" style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingTop: 8, borderTop: `1px solid ${C.border}`, scrollbarWidth: "thin" }}>
          <span style={{ flexShrink: 0, padding: "0 4px", color: C.dim, fontSize: 9.5, fontWeight: 950, letterSpacing: .85, textTransform: "uppercase" }}>Origen</span>
          {ORIGENES.map((item) => {
            const activa = origenFiltro === item.valor;
            const meta = item.valor === "todos" ? { color: C.text, fondo: "var(--panel-2)", borde: C.border2 } : ORIGEN_TONOS[item.valor];
            const Icon = item.icono;
            return (
              <MotionButton
                layout
                key={item.valor}
                type="button"
                onClick={() => setOrigenFiltro(item.valor)}
                title={item.ayuda}
                aria-pressed={activa}
                whileTap={reducirMovimiento ? undefined : { scale: 0.97 }}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 32,
                  border: `1px solid ${activa ? meta.borde : C.border}`,
                  background: activa ? meta.fondo : "transparent",
                  color: activa ? meta.color : C.dim,
                  borderRadius: 9,
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontFamily: C.sans,
                  fontSize: 10.5,
                  fontWeight: activa ? 950 : 800,
                  transition: "border-color .18s ease, color .18s ease, background .18s ease",
                }}
              >
                <Icon size={12} />
                {item.etiqueta}
                <span style={{ minWidth: 19, borderRadius: 999, padding: "2px 5px", textAlign: "center", background: activa ? "color-mix(in srgb, currentColor 12%, transparent)" : "var(--panel-2)", color: "currentColor", fontFamily: C.mono, fontSize: 9, fontWeight: 900 }}>
                  {conteoOrigen[item.valor] || 0}
                </span>
                {activa ? (
                  <MotionI layoutId="planilla-origen-activo" style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, borderRadius: 999, background: meta.color }} />
                ) : null}
              </MotionButton>
            );
          })}
          <span style={{ marginLeft: "auto", flexShrink: 0, color: C.dim, fontSize: 10.5, fontWeight: 800 }}>{filasVisibles.length} visibles</span>
        </div>
      </section>

      {selectorObrasAvisoAbierto ? (
        <section style={{ ...panel, padding: 12, borderColor: C.greenB, background: "linear-gradient(120deg, var(--panel-solid), var(--green-soft))", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 210, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.text, fontSize: 12.5, fontWeight: 900 }}>
                <Building2 size={15} color={C.green} /> Obras incluidas en el aviso
              </div>
              <div style={{ marginTop: 3, color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
                Es independiente de la obra que estás mirando. Cada cantidad quedará asignada a su barco.
              </div>
            </div>
            <button type="button" onClick={() => setObrasAviso(new Set((datos?.obras ?? []).map((obra) => obra.id)))} style={{ ...control, padding: "6px 9px", fontSize: 11.5 }}>Marcar todas</button>
            <button type="button" onClick={() => setObrasAviso(new Set())} style={{ ...control, padding: "6px 9px", fontSize: 11.5, color: C.dim }}>Limpiar</button>
            <button type="button" onClick={() => setSelectorObrasAvisoAbierto(false)} style={{ ...control, padding: "6px 9px", fontSize: 11.5 }}>Listo</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 118 : 132}px, 1fr))`, gap: 7 }}>
            {(datos?.obras ?? []).map((obra) => {
              const activa = obrasAviso.has(obra.id);
              return (
                <button
                  key={obra.id}
                  type="button"
                  onClick={() => alternarObraAviso(obra.id)}
                  style={{
                    border: `1px solid ${activa ? C.greenB : C.border}`,
                    background: activa ? "var(--green-soft)" : "var(--panel-2)",
                    color: activa ? C.green : C.text,
                    borderRadius: 9,
                    padding: "8px 9px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    fontFamily: C.sans,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 900 }}>{obra.codigo}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 6, border: `1px solid ${activa ? C.greenB : C.border2}`, background: activa ? C.green : "transparent", color: activa ? "#fff" : C.dim }}>
                    {activa ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : obrasAvisoSeleccionadas.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "0 3px" }}>
          <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.55 }}>Aviso a pañol</span>
          {obrasAvisoSeleccionadas.map((obra) => (
            <button key={obra.id} type="button" onClick={() => alternarObraAviso(obra.id)} title="Quitar del aviso" style={{ border: `1px solid ${C.greenB}`, background: "var(--green-soft)", color: C.green, borderRadius: 999, padding: "4px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 900 }}>
              {obra.codigo} ×
            </button>
          ))}
          <button type="button" onClick={() => setSelectorObrasAvisoAbierto(true)} style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850 }}>+ sumar obra</button>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...panel, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...panel, padding: 36, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Armando la planilla de {linea}…</div>
        </div>
      ) : !grupos.length ? (
        <div style={{ ...panel, padding: 36, textAlign: "center" }}>
          <CheckCircle2 size={22} color={soloPendientes ? C.green : C.dim} style={{ marginBottom: 8 }} />
          <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>
            {soloSinOpcion
              ? `${obraSeleccionada?.codigo || "La obra"} no tiene productos matriz sin definir con estos filtros`
              : origenFiltro !== "todos"
              ? `No hay materiales ${ORIGENES.find((item) => item.valor === origenFiltro)?.etiqueta.toLowerCase()} con estos filtros`
              : soloPendientes ? "No hay pendientes con estos filtros" : `No hay materiales que coincidan en ${linea}`}
          </div>
          {soloPendientes || soloSinOpcion ? (
            <button type="button" onClick={() => { setSoloPendientes(false); setSoloSinOpcion(false); }} style={{ marginTop: 10, border: "none", background: "transparent", color: C.blue, fontFamily: C.sans, fontSize: 12, fontWeight: 850, cursor: "pointer" }}>
              Quitar filtros operativos
            </button>
          ) : null}
        </div>
      ) : (
        <div className="planilla-tabla-wrap" style={{ ...panel, overflowX: isMobile ? "auto" : "visible", position: "relative" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: obraSeleccionada ? 1120 : 370 + obrasVisibles.length * (vista === "todo" ? 100 : 72), fontFamily: C.sans }}>
            <thead className="planilla-cabecera-obras">
              <tr>
                <th style={{ ...th, ...colFija, textAlign: "left", minWidth: 380, zIndex: 14, paddingLeft: 12 }}>Material</th>
                {obraSeleccionada ? (
                  <>
                    <th style={{ ...th, minWidth: 230, color: C.blue }}>
                      <div>Producto para esta obra</div>
                      <div style={{ marginTop: 2, color: C.dim, fontSize: 8.5, fontWeight: 750, letterSpacing: 0, textTransform: "none" }}>{obraSeleccionada.codigo}</div>
                    </th>
                    <th style={{ ...th, minWidth: 82 }}>Necesita</th>
                    <th style={{ ...th, minWidth: 82 }}>Entregado</th>
                    <th style={{ ...th, minWidth: 82 }}>En pañol</th>
                    <th style={{ ...th, minWidth: 82 }}>Faltante</th>
                    <th style={{ ...th, minWidth: 54 }} title="Lo que el pañol tiene sin obra asignada: sirve para cualquier barco.">Libre</th>
                    <th style={{ ...th, minWidth: 92, color: C.red }}>A comprar</th>
                  </>
                ) : (
                  <>
                    <th style={{ ...th, minWidth: 54 }} title="Lo que el pañol tiene sin obra asignada: sirve para cualquier barco.">Libre</th>
                    <th style={{ ...th, minWidth: 62, color: C.red }} title="Lo que falta para toda la línea, descontando lo que el pañol ya tiene libre.">Comprar</th>
                    {obrasVisibles.map((obra) => <th key={obra.id} style={{ ...th, minWidth: vista === "todo" ? 100 : 72 }}>{obra.codigo}</th>)}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {grupos.flatMap((grupo) => {
                const cerrado = gruposCerrados.has(grupo.nombre);
                const todosPuestos = grupo.filas.every((fila) => elegidos.has(fila.id));
                const cabecera = (
                  <tr key={`g-${grupo.nombre}`}>
                    <td colSpan={columnas} style={{ background: grupo.sinProveedor ? C.redL : "var(--panel-2)", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px" }}>
                        <input type="checkbox" className="planilla-check" checked={todosPuestos} onChange={() => alternarGrupo(grupo)} title="Elegir todo el grupo" style={{ accentColor: C.blue, width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
                        <button type="button" onClick={() => alternarCerrado(grupo.nombre)} style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: C.sans }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: grupo.sinProveedor ? C.red : C.text, fontSize: 11.5, fontWeight: 900, letterSpacing: 0.35, textTransform: "uppercase" }}>
                            <ChevronDown size={13} style={{ transform: cerrado ? "rotate(-90deg)" : "none", transition: "transform .16s ease" }} />
                            {grupo.nombre}
                          </span>
                          <span style={{ color: C.dim, fontSize: 11, fontWeight: 750, marginLeft: 8 }}>
                            {grupo.filas.length} materiales · {grupo.pendientes} requieren atención{grupo.aComprar ? ` · ${grupo.aComprar} requieren compra` : ""}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                if (cerrado) return [cabecera];
                return [cabecera, ...grupo.filas.map((fila) => {
                  const puesto = elegidos.has(fila.id);
                  const celdaFoco = obraSeleccionada ? fila.porObra[obraSeleccionada.id] : null;
                  const aComprar = cantidadComprar(fila);
                  const origenesFila = celdaFoco?.origenes?.length ? celdaFoco.origenes : (fila.origenes || ["fuera_matriz"]);
                  const origenPrincipal = ["matriz", "opcional", "adicional", "panol", "fuera_matriz"].find((origen) => origenesFila.includes(origen)) || "fuera_matriz";
                  const origenTono = ORIGEN_TONOS[origenPrincipal];
                  const requisitoMaterial = celdaFoco ? catalogoPorId.get(celdaFoco.requisitoId) || null : null;
                  const productoMaterial = celdaFoco?.productoMaterialId ? catalogoPorId.get(celdaFoco.productoMaterialId) || null : null;
                  const nombreVisible = requisitoMaterial?.descripcion || fila.descripcion;
                  const codigoVisible = requisitoMaterial?.codigo || fila.codigo;
                  const configuracionRow = celdaFoco ? {
                    id: `${obraSeleccionada?.id || "obra"}:${celdaFoco.requisitoId || fila.id}`,
                    requisitoMaterialId: celdaFoco.requisitoId || fila.requisitoId || fila.id,
                    materialId: celdaFoco.requisitoId || fila.requisitoId || fila.id,
                    productoMaterialId: celdaFoco.productoMaterialId || null,
                    producto: productoMaterial,
                    productoEstandar: celdaFoco.productoEstandar === true,
                    esRequisito: celdaFoco.requiereProductoConcreto === true,
                    especificaciones: celdaFoco.especificaciones || {},
                    descripcion: nombreVisible,
                    codigo: codigoVisible,
                    cantidad: celdaFoco.requerido,
                    unidad: fila.unidad,
                    proveedor: fila.proveedor,
                    rubro: fila.rubro,
                    source: "matriz",
                    snapshotId: celdaFoco.snapshotId,
                    configuracionSnapshotId: celdaFoco.configuracionSnapshotId,
                  } : null;
                  const productosDirectos = celdaFoco?.requiereProductoConcreto
                    ? [...new Map([
                      ...(compatiblesPorRequisito.get(celdaFoco.requisitoId) || [])
                        .map((link) => catalogoPorId.get(link.producto_material_id))
                        .filter(Boolean),
                      ...(productoMaterial ? [productoMaterial] : []),
                    ].map((producto) => [producto.id, producto])).values()]
                      .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es"))
                    : [];
                  return (
                    <tr
                      key={fila.id}
                      className="planilla-fila"
                      tabIndex={0}
                      aria-selected={puesto}
                      onClick={() => alternarFila(fila.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          alternarFila(fila.id);
                        }
                      }}
                      style={{ borderBottom: `1px solid ${C.border}`, background: puesto ? C.blueL : "transparent", cursor: "pointer", boxShadow: `inset 3px 0 0 ${origenTono.color}` }}
                    >
                      <td className="planilla-celda-fija" style={{ ...colFija, background: puesto ? C.blueL : "var(--panel-solid)", padding: "9px 12px 9px 13px", maxWidth: 414 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                          <input type="checkbox" className="planilla-check" checked={puesto} readOnly tabIndex={-1} style={{ accentColor: C.blue, width: 18, height: 18, marginTop: 3, cursor: "pointer", flexShrink: 0 }} />
                          {fila.imagenUrl ? (
                            <button
                              type="button"
                              className="planilla-thumb"
                              onClick={(event) => abrirImagen(event, fila)}
                              title="Ver foto del material"
                              aria-label={`Ver foto de ${fila.descripcion}`}
                              style={{
                                width: 36,
                                height: 36,
                                padding: 0,
                                borderRadius: 9,
                                overflow: "hidden",
                                border: `1px solid ${C.border2}`,
                                background: "var(--panel-2)",
                                cursor: "zoom-in",
                                flexShrink: 0,
                              }}
                            >
                              <img src={fila.imagenUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            </button>
                          ) : (
                            <span style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              display: "grid",
                              placeItems: "center",
                              color: C.border2,
                              border: `1px solid ${C.border}`,
                              background: "var(--panel-2)",
                              flexShrink: 0,
                            }}>
                              <Package size={13} />
                            </span>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: C.text, fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreVisible}</div>
                            <div style={{ marginTop: 2, color: C.dim, fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[codigoVisible, fila.unidad, agrupar === "rubro" ? (fila.proveedor || "sin proveedor") : fila.rubro].filter(Boolean).join(" · ")}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                              {origenesFila.map((origen) => <OrigenBadge key={origen} origen={origen} compacto />)}
                              {celdaFoco?.avisoPendiente ? (
                                <span style={{ border: `1px solid ${C.greenB}`, background: "var(--green-soft)", color: C.green, borderRadius: 999, padding: "2px 6px", fontSize: 9, fontWeight: 900 }}>Aviso abierto</span>
                              ) : null}
                            </div>
                          </div>
                          <button type="button" className="planilla-ficha" onClick={(event) => abrirFicha(event, celdaFoco?.requisitoId || fila.id)} title="Abrir ficha del catálogo" aria-label={`Abrir la ficha de ${nombreVisible}`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 4, cursor: "pointer", border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.dim }}>
                            <SquarePen size={12} />
                          </button>
                        </div>
                      </td>

                      {obraSeleccionada ? (
                        <>
                          <td
                            onClick={(event) => event.stopPropagation()}
                            style={{
                              padding: 7,
                              borderLeft: `1px solid ${C.border}`,
                              verticalAlign: "middle",
                              background: celdaFoco?.requiereProductoConcreto && !celdaFoco.productoDefinido ? C.amberL : "transparent",
                            }}
                          >
                            {celdaFoco?.requiereProductoConcreto ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, color: celdaFoco.productoDefinido ? C.green : C.amber, fontSize: 9.5, fontWeight: 950 }}>
                                  {celdaFoco.productoDefinido ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />}
                                  {celdaFoco.productoDefinido ? "Producto definido" : "Falta definir producto"}
                                </div>
                                <select
                                  value={celdaFoco.productoMaterialId || ""}
                                  disabled={productoBusy === configuracionRow?.id || !productosDirectos.length}
                                  aria-label={`Producto concreto para ${nombreVisible} en ${obraSeleccionada.codigo}`}
                                  onChange={(event) => {
                                    const productoMaterialId = event.target.value;
                                    if (!productoMaterialId || productoMaterialId === celdaFoco.productoMaterialId) return;
                                    cambiarProductoObra(configuracionRow, {
                                      productoMaterialId,
                                      especificaciones: celdaFoco.especificaciones || {},
                                    });
                                  }}
                                  style={{
                                    width: "100%",
                                    minWidth: 0,
                                    border: `1px solid ${celdaFoco.productoDefinido ? C.greenB : C.amberB}`,
                                    background: "var(--panel-solid)",
                                    color: celdaFoco.productoDefinido ? C.text : C.amber,
                                    borderRadius: 8,
                                    padding: "7px 8px",
                                    fontFamily: C.sans,
                                    fontSize: 10.5,
                                    fontWeight: 850,
                                    cursor: productoBusy === configuracionRow?.id ? "wait" : "pointer",
                                  }}
                                >
                                  <option value="" disabled>{productosDirectos.length ? "Elegir producto…" : "Sin productos vinculados"}</option>
                                  {productosDirectos.map((producto) => (
                                    <option key={producto.id} value={producto.id}>{producto.descripcion}{producto.codigo ? ` · ${producto.codigo}` : ""}</option>
                                  ))}
                                </select>
                                <ProductoAsignadoControl
                                  row={configuracionRow}
                                  materiales={datos?.catalogo ?? []}
                                  compatibles={compatiblesPorRequisito.get(celdaFoco.requisitoId) || []}
                                  busy={productoBusy === configuracionRow?.id}
                                  obraCodigo={obraSeleccionada.codigo}
                                  linea={linea}
                                  allowLineScope={false}
                                  triggerVariant="planilla"
                                  onSave={cambiarProductoObra}
                                />
                              </div>
                            ) : (
                              <span style={{ color: C.dim, fontSize: 10, fontWeight: 750 }}>Producto directo</span>
                            )}
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                            <EstadoNumero value={celdaFoco?.requerido} suffix={fila.unidad} />
                            <DesgloseConfiguracion celda={celdaFoco} unidad={fila.unidad} />
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                            <EstadoNumero value={celdaFoco?.egresado} tone="success" />
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                            <EstadoNumero value={celdaFoco?.enPanol} tone="info" />
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                            <EstadoNumero value={celdaFoco?.pendiente} tone="danger" />
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }} title={fila.reservado ? `${mostrarNumero(fila.reservado)} ${fila.unidad} reservados a otras obras.` : "Stock libre disponible"}>
                            <EstadoNumero value={fila.enPanolLibre} />
                          </td>
                          <td style={{ padding: "7px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                            <EstadoNumero value={aComprar} tone="danger" />
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            style={{ padding: "6px 4px", textAlign: "center" }}
                            title={Number(fila.reservado) > 0
                              ? `${mostrarNumero(fila.enPanolLibre)} ${fila.unidad} libres · ${mostrarNumero(fila.reservado)} apartados a otras obras`
                              : `${mostrarNumero(fila.enPanolLibre)} ${fila.unidad} libres en el pañol`}
                          >
                            <strong style={{ color: Number(fila.enPanolLibre) > 0 ? C.text : C.border2, fontFamily: C.mono, fontSize: 12.5, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{mostrarNumero(fila.enPanolLibre)}</strong>
                          </td>
                          <td
                            style={{ padding: "6px 4px", textAlign: "center" }}
                            title={aComprar > 0
                              ? `Hay que comprar ${mostrarNumero(aComprar)} ${fila.unidad}`
                              : "No hay que comprar nada de este material"}
                          >
                            {aComprar > 0 ? (
                              <strong style={{ color: C.red, fontFamily: C.mono, fontSize: 12.5, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{mostrarNumero(aComprar)}</strong>
                            ) : <Check size={13} color={C.green} />}
                          </td>
                          {obrasVisibles.map((obra) => {
                            const celda = fila.porObra[obra.id];
                            const detalleConfiguracion = (celda?.configuraciones || [])
                              .map((item) => `${item.nombre}: ${item.delta > 0 ? "+" : ""}${mostrarNumero(item.delta)} ${fila.unidad}`)
                              .join(" · ");
                            return (
                              <td
                                key={obra.id}
                                style={{ padding: 2, textAlign: "center", borderLeft: `1px solid ${C.border}`, verticalAlign: "middle", background: celda ? "transparent" : "var(--panel-2)" }}
                                title={celda
                                  ? `${obra.codigo} · necesita ${celda.requerido} · entregados ${celda.egresado} · esperando en pañol ${celda.enPanol} · faltan ${celda.pendiente}${detalleConfiguracion ? ` · ${detalleConfiguracion}` : ""}`
                                  : `${obra.codigo} · este barco no lleva este material`}
                              >
                                {celda?.requiereProductoConcreto && !celda.productoDefinido ? (
                                  <button
                                    type="button"
                                    title={`${obra.codigo} · falta definir qué producto concreto lleva ${nombreVisible}. Tocá para resolverlo.`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      cambiarObra(obra.id);
                                      setSoloSinOpcion(true);
                                    }}
                                    className="celda-definir"
                                    style={{ display: "block", width: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: C.sans }}
                                  >
                                    <CeldaCalor celda={celda} vista={vista} techo={techoCalor} />
                                  </button>
                                ) : (
                                  <CeldaCalor celda={celda} vista={vista} techo={techoCalor} />
                                )}
                              </td>
                            );
                          })}
                        </>
                      )}
                    </tr>
                  );
                })];
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
      {seleccionados.length ? (
        <MotionDiv
          key="planilla-acciones"
          initial={reducirMovimiento ? false : { opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducirMovimiento ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
          position: "sticky",
          bottom: 12,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: "var(--topbar-soft)",
          border: `1px solid ${C.blueB}`,
          borderRadius: 12,
          padding: "10px 14px",
          boxShadow: "0 12px 34px rgba(15,23,42,0.2)",
          backdropFilter: "var(--glass-filter)",
          WebkitBackdropFilter: "var(--glass-filter)",
        }}>
          <Check size={16} color={C.blue} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>{seleccionados.length} material{seleccionados.length === 1 ? "" : "es"}</span>
          <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
            {obrasAvisoSeleccionadas.length
              ? `aviso para ${obrasAvisoSeleccionadas.map((obra) => obra.codigo).join(", ")}`
              : obraSeleccionada ? `viendo ${obraSeleccionada.codigo}` : `en ${linea}`}
          </span>
          <button type="button" onClick={() => setElegidos(new Set())} style={{ ...control, padding: "6px 10px", fontSize: 12, color: C.dim }}>Limpiar</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={copiar} style={{ ...control, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 850 }}><Copy size={14} /> Copiar</button>
            {onPedir ? (
              <button type="button" onClick={pedir} style={{ border: "none", background: C.blue, color: "#fff", borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
                <ShoppingCart size={14} /> Crear pedido
              </button>
            ) : null}
            <button
              type="button"
              onClick={avisarPanol}
              title={obrasAvisoSeleccionadas.length ? "El material ya fue comprado: preparar aviso de recepción en pañol" : "Primero elegí una o varias obras para el aviso"}
              style={{ border: `1px solid ${C.greenB}`, background: "var(--green-soft)", color: C.green, borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <Send size={14} /> Avisar a pañol
            </button>
          </div>
        </MotionDiv>
      ) : null}
      </AnimatePresence>

      {avisoPreparacion ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAvisoPreparacion(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(3, 7, 18, .62)",
            backdropFilter: "blur(7px)",
            WebkitBackdropFilter: "blur(7px)",
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="preparar-aviso-title" style={{ ...panel, width: "min(620px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: isMobile ? 16 : 20, boxShadow: "0 26px 70px rgba(0,0,0,.34)", display: "grid", gap: 16 }}>
            <header style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0, color: C.green, border: `1px solid ${C.greenB}`, background: "var(--green-soft)" }}>
                <Send size={18} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 id="preparar-aviso-title" style={{ margin: 0, color: C.text, fontSize: 17, fontWeight: 950 }}>Preparar aviso a pañol</h3>
                <p style={{ margin: "4px 0 0", color: C.dim, fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
                  Revisá cómo se identifica. En el paso siguiente elegís la sede y confirmás los renglones.
                </p>
              </div>
              <button type="button" onClick={() => setAvisoPreparacion(null)} aria-label="Cerrar" style={{ border: `1px solid ${C.border}`, background: "var(--panel-2)", color: C.dim, borderRadius: 9, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={15} />
              </button>
            </header>

            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: "var(--panel-2)" }}>
              {avisoPreparacion.obras.map((obra) => {
                const renglones = avisoPreparacion.items.filter((item) => item.obra_id === obra.id).length;
                return (
                  <span key={obra.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.greenB}`, background: "var(--green-soft)", color: C.green, borderRadius: 999, padding: "5px 9px", fontSize: 11.5, fontWeight: 900 }}>
                    {obra.codigo} <small style={{ color: C.dim, fontSize: 10, fontWeight: 800 }}>{renglones} ítem{renglones === 1 ? "" : "s"}</small>
                  </span>
                );
              })}
              <span style={{ marginLeft: "auto", color: C.text, fontFamily: C.mono, fontSize: 11.5, fontWeight: 900 }}>{avisoPreparacion.items.length} renglones</span>
            </div>

            {(avisoPreparacion.yaAvisados || avisoPreparacion.cubiertos) ? (
              <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, color: C.amber, borderRadius: 9, padding: "8px 10px", fontSize: 11.5, fontWeight: 800, lineHeight: 1.45 }}>
                {avisoPreparacion.yaAvisados ? `${avisoPreparacion.yaAvisados} ${avisoPreparacion.yaAvisados === 1 ? "asignación ya tenía" : "asignaciones ya tenían"} un aviso abierto. ` : ""}
                {avisoPreparacion.cubiertos ? `${avisoPreparacion.cubiertos} se ${avisoPreparacion.cubiertos === 1 ? "cubre" : "cubren"} con stock libre.` : ""}
                {(avisoPreparacion.yaAvisados || avisoPreparacion.cubiertos) ? " No se duplicarán en este aviso." : ""}
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 900, letterSpacing: .65, textTransform: "uppercase" }}>Título del aviso *</span>
              <input
                autoFocus
                value={avisoPreparacion.titulo}
                onChange={(event) => setAvisoPreparacion((current) => ({ ...current, titulo: event.target.value }))}
                placeholder="Ej: Griferías para 37-34 y 37-44"
                style={{ ...control, cursor: "text", width: "100%", boxSizing: "border-box", padding: "10px 11px", fontSize: 13 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 900, letterSpacing: .65, textTransform: "uppercase" }}>Observaciones</span>
              <textarea
                value={avisoPreparacion.observaciones}
                onChange={(event) => setAvisoPreparacion((current) => ({ ...current, observaciones: event.target.value }))}
                placeholder="Qué llega, cómo viene embalado, remito, contacto o cualquier indicación para pañol…"
                rows={4}
                style={{ ...control, cursor: "text", width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 88, padding: "10px 11px", fontSize: 13, lineHeight: 1.45 }}
              />
            </label>

            <footer style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setAvisoPreparacion(null)} style={{ ...control, padding: "9px 13px" }}>Cancelar</button>
              <button type="button" onClick={continuarAvisoPanol} disabled={!avisoPreparacion.titulo.trim()} style={{ border: "none", background: avisoPreparacion.titulo.trim() ? C.green : C.border2, color: "#fff", borderRadius: 9, padding: "9px 15px", cursor: avisoPreparacion.titulo.trim() ? "pointer" : "not-allowed", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}>
                Revisar aviso <Send size={14} />
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <EnviarAPanolModal
        open={!!panolPrefill}
        profile={profile}
        prefill={panolPrefill}
        showPrices={false}
        requireCatalogLinks
        onSaved={async (envioId) => {
          await marcarAvisoPlanillaComoComprado(envioId);
        }}
        onClose={(saved) => {
          setPanolPrefill(null);
          if (saved) {
            setElegidos(new Set());
            cargar(linea);
          }
        }}
      />
    </div>
  );
}
