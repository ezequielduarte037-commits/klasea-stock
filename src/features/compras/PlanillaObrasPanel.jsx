import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Send,
  ShoppingCart,
  SquarePen,
  Table2,
  X,
} from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import { calcularPlanillaDeLinea, marcarAvisoPlanillaComoComprado } from "@/features/compras/planillaObrasApi";

const AGRUPACIONES = [
  { valor: "rubro", etiqueta: "Agrupar por rubro" },
  { valor: "proveedor", etiqueta: "Agrupar por proveedor" },
];

const VISTAS = [
  { valor: "todo", etiqueta: "Todo", ayuda: "Muestra entregado, en pañol y pendiente dentro de cada obra." },
  { valor: "falta", etiqueta: "Pendiente", ayuda: "Lo que esa obra todavía necesita." },
  { valor: "panol", etiqueta: "En pañol", ayuda: "Lo que ya llegó y está apartado para la obra." },
  { valor: "entregado", etiqueta: "Entregado", ayuda: "Lo que ya salió del pañol hacia la obra." },
];

const TONOS = {
  egresado: { color: C.green, fondo: "var(--green-soft)", borde: C.greenB },
  panol: { color: C.cyan, fondo: C.cyanL, borde: C.cyanB },
  pendiente: { color: C.red, fondo: C.redL, borde: C.redB },
};

const CARGA = {
  sin_matriz: {
    texto: "sin matriz",
    color: C.amber,
    ayuda: "Esta línea todavía no tiene una lista matriz configurada.",
  },
  todo_llego: {
    texto: "sin pendientes",
    color: C.green,
    ayuda: "No quedan materiales pendientes en esta obra.",
  },
  con_pendientes: {
    texto: "con pendientes",
    color: C.red,
    ayuda: "La obra todavía tiene materiales pendientes.",
  },
};

const redondear = (value) => Math.round(Number(value || 0) * 100) / 100;
const mostrarNumero = (value) => {
  const n = redondear(value);
  return n ? String(n).replace(".", ",") : "—";
};

function celdaDeObra(celda, vista) {
  if (!celda) return null;
  if (vista === "falta" && celda.pendiente > 0) return { texto: celda.pendiente, tono: "pendiente" };
  if (vista === "panol" && celda.enPanol > 0) return { texto: celda.enPanol, tono: "panol" };
  if (vista === "entregado" && celda.egresado > 0) return { texto: celda.egresado, tono: "egresado" };
  return null;
}

function ResumenCelda({ celda }) {
  if (!celda) return <span style={{ color: C.border2 }}>—</span>;
  const estados = [
    { key: "egresado", label: "ent.", value: celda.egresado, color: C.green },
    { key: "panol", label: "pañol", value: celda.enPanol, color: C.cyan },
    { key: "pendiente", label: "pend.", value: celda.pendiente, color: C.red },
  ].filter((estado) => Number(estado.value) > 0);
  if (!estados.length) return <span style={{ color: C.border2 }}>—</span>;
  return (
    <span style={{ display: "grid", justifyItems: "start", gap: 2, minWidth: 70 }}>
      {estados.map((estado) => (
        <span key={estado.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 4, color: estado.color, fontSize: 9.5, fontWeight: 850, whiteSpace: "nowrap" }}>
          <i style={{ width: 5, height: 5, borderRadius: 999, background: estado.color, alignSelf: "center" }} />
          <strong style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 950 }}>{mostrarNumero(estado.value)}</strong>
          {estado.label}
        </span>
      ))}
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

export default function PlanillaObrasPanel({ isMobile = false, onPedir, profile = null }) {
  const toast = useToast();
  const [linea, setLinea] = useState("K37");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState("rubro");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [obraFoco, setObraFoco] = useState("");
  const [vista, setVista] = useState("todo");
  const [elegidos, setElegidos] = useState(() => new Set());
  const [obrasAviso, setObrasAviso] = useState(() => new Set());
  const [selectorObrasAvisoAbierto, setSelectorObrasAvisoAbierto] = useState(false);
  const [avisoPreparacion, setAvisoPreparacion] = useState(null);
  const [gruposCerrados, setGruposCerrados] = useState(() => new Set());
  const [panolPrefill, setPanolPrefill] = useState(null);
  const buscadorRef = useRef(null);

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
  }, [linea]);

  const obraSeleccionada = useMemo(
    () => datos?.obras.find((obra) => obra.id === obraFoco) || null,
    [datos, obraFoco],
  );

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

  const cantidadComprar = useCallback((fila) => (
    redondear(Math.max(0, cantidadPendiente(fila) - fila.enPanolLibre))
  ), [cantidadPendiente]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLocaleLowerCase("es");
    const filtradas = datos.filas.filter((fila) => {
      if (obraFoco && !fila.porObra[obraFoco]) return false;
      if (soloPendientes && !(cantidadPendiente(fila) > 0)) return false;
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
  }, [datos, busqueda, agrupar, soloPendientes, obraFoco, cantidadPendiente, cantidadComprar]);

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

  function abrirFicha(evento, materialId) {
    evento.stopPropagation();
    window.open(`/catalogo-maestro?material=${materialId}`, "_blank", "noopener");
  }

  function abrirImagen(evento, fila) {
    evento.stopPropagation();
    if (fila.imagenUrl) window.open(fila.imagenUrl, "_blank", "noopener");
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

    let yaAvisados = 0;
    let cubiertos = 0;
    const items = [];

    for (const fila of seleccionados) {
      // El stock libre es uno solo. Se reparte una vez, en el orden visible de
      // las obras, para no usar la misma existencia como cobertura de dos barcos.
      let stockLibreRestante = Number(fila.enPanolLibre || 0);
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

  function exportar() {
    if (!datos) return;
    const obras = obrasVisibles;
    const cabecera = [
      agrupar === "rubro" ? "Rubro" : "Proveedor",
      "Material", "Código", "Unidad", "Stock libre", "Apartado", "A comprar",
      ...obras.flatMap((obra) => [
        `${obra.codigo} necesita`,
        `${obra.codigo} entregado`,
        `${obra.codigo} en pañol`,
        `${obra.codigo} pendiente`,
      ]),
    ];
    const filas = grupos.flatMap((grupo) => grupo.filas.map((fila) => [
      grupo.nombre,
      fila.descripcion,
      fila.codigo,
      fila.unidad,
      fila.enPanolLibre,
      fila.reservado,
      cantidadComprar(fila),
      ...obras.flatMap((obra) => {
        const celda = fila.porObra[obra.id];
        return [celda?.requerido ?? "", celda?.egresado ?? "", celda?.enPanol ?? "", celda?.pendiente ?? ""];
      }),
    ]));
    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `Planilla_${datos.linea}_${obraSeleccionada?.codigo || "todas"}_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    toast.success(`${filas.length} materiales exportados.`);
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

  const columnas = obraSeleccionada ? 7 : 3 + obrasVisibles.length;

  return (
    <div className="planilla-obras" style={{ display: "grid", gap: 12, padding: isMobile ? 12 : 0, minWidth: 0 }}>
      <style>{`
        .planilla-obras .planilla-fila { transition: background .14s ease; }
        .planilla-obras .planilla-fila:hover { background: var(--panel-2); }
        .planilla-obras .planilla-fila:hover .planilla-celda-fija { background: var(--panel-2); }
        .planilla-obras .planilla-check:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
        .planilla-obras .planilla-ficha { transition: opacity .15s, border-color .15s, color .15s; }
        .planilla-obras .planilla-thumb { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .planilla-obras .planilla-thumb:hover { transform: scale(1.06); border-color: ${C.blueB}; box-shadow: 0 5px 14px rgba(15,23,42,.18); }
        .planilla-obras .planilla-contexto { display: block; }
        .planilla-obras .planilla-filtros { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
        .planilla-obras .planilla-cabecera-obras th { background-color: var(--panel-solid); background-clip: padding-box; }
        .planilla-obras .planilla-cabecera-obras { filter: drop-shadow(0 7px 8px rgba(15,23,42,.10)); }
        @media (hover: hover) {
          .planilla-obras .planilla-ficha { opacity: .2; }
          .planilla-obras .planilla-fila:hover .planilla-ficha { opacity: 1; }
        }
        @media (max-width: 760px) {
          .planilla-obras .planilla-filtros { flex-wrap: wrap; overflow-x: visible; }
          .planilla-obras .planilla-filtros > * { flex: 1 1 145px; }
          .planilla-obras .planilla-filtros .planilla-buscador { flex-basis: 100%; }
        }
      `}</style>

      <section style={{ ...panel, padding: isMobile ? 14 : 18, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            color: C.blue,
            background: C.blueL,
            border: `1px solid ${C.blueB}`,
            flexShrink: 0,
          }}>
            <Table2 size={19} />
          </div>
          <div style={{ minWidth: 200, flex: 1 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 18, lineHeight: 1.15, fontWeight: 950 }}>Planilla por obra</h2>
            <p style={{ margin: "5px 0 0", color: C.dim, fontSize: 12.5, fontWeight: 650 }}>
              La matriz define qué necesita cada barco; pañol y compras actualizan el avance.
            </p>
          </div>
        </div>

        {datos ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Metric valor={resumenFoco.materiales} etiqueta="materiales" icono={Table2} />
            <Metric valor={resumenFoco.pendientes} etiqueta="con pendientes" color={C.red} icono={AlertTriangle} />
            <Metric valor={resumenFoco.enPanol} etiqueta="esperando en pañol" color={C.cyan} icono={PackageCheck} />
            <Metric valor={resumenFoco.entregados} etiqueta="con entregas" color={C.green} icono={CheckCircle2} />
            <Metric valor={resumenFoco.aComprar} etiqueta="requieren compra" color={C.blue} icono={ShoppingCart} />
          </div>
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
                  <span style={{ color: C.red, fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.pendientes} pendientes</span>
                  <span style={{ color: C.cyan, fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.enPanol} en pañol</span>
                  <span style={{ color: C.green, fontSize: 12, fontWeight: 850 }}>{obraSeleccionada.entregados} con entregas</span>
                </div>
                <span style={{
                  marginLeft: "auto",
                  color: CARGA[obraSeleccionada.carga]?.color || C.dim,
                  border: `1px solid color-mix(in srgb, ${CARGA[obraSeleccionada.carga]?.color || C.dim} 35%, transparent)`,
                  borderRadius: 999,
                  padding: "5px 9px",
                  fontSize: 10.5,
                  fontWeight: 900,
                }}>
                  {CARGA[obraSeleccionada.carga]?.texto || "en curso"}
                </span>
              </>
            ) : (
              <>
                <div>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{linea} · todas las obras activas</div>
                  <div style={{ marginTop: 3, color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
                    Cada celda muestra junto lo entregado, lo que espera en pañol y lo que todavía está pendiente.
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 10.5, fontWeight: 850 }}>
                  <span style={{ color: C.green }}>● entregado</span>
                  <span style={{ color: C.cyan }}>● en pañol</span>
                  <span style={{ color: C.red }}>● pendiente</span>
                </div>
              </>
            )}
          </div>
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

      <section className="planilla-filtros" style={{ ...panel, padding: 9, background: "var(--topbar-soft)", backdropFilter: "var(--glass-filter)", WebkitBackdropFilter: "var(--glass-filter)" }}>
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
        <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>{filasVisibles.length} visibles</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <button type="button" onClick={exportar} disabled={!datos} title="Descargar para Excel" style={{ ...control, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Download size={14} /> Excel
          </button>
          <button type="button" onClick={() => cargar(linea)} disabled={cargando} aria-label="Actualizar" title="Actualizar datos" style={{ ...control, display: "grid", placeItems: "center" }}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
          </button>
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
            {soloPendientes ? "No hay pendientes con estos filtros" : `No hay materiales que coincidan en ${linea}`}
          </div>
          {soloPendientes ? (
            <button type="button" onClick={() => setSoloPendientes(false)} style={{ marginTop: 10, border: "none", background: "transparent", color: C.blue, fontFamily: C.sans, fontSize: 12, fontWeight: 850, cursor: "pointer" }}>
              Ver todos los materiales
            </button>
          ) : null}
        </div>
      ) : (
        <div className="planilla-tabla-wrap" style={{ ...panel, overflowX: isMobile ? "auto" : "visible", position: "relative" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: obraSeleccionada ? 850 : 370 + obrasVisibles.length * (vista === "todo" ? 100 : 72), fontFamily: C.sans }}>
            <thead className="planilla-cabecera-obras">
              <tr>
                <th style={{ ...th, ...colFija, textAlign: "left", minWidth: 286, zIndex: 14, paddingLeft: 12 }}>Material</th>
                {obraSeleccionada ? (
                  <>
                    <th style={{ ...th, minWidth: 68 }} title="Cantidad definida en la matriz de la línea.">Necesita</th>
                    <th style={{ ...th, minWidth: 72, color: C.green }}>Entregado</th>
                    <th style={{ ...th, minWidth: 72, color: C.cyan }}>En pañol</th>
                    <th style={{ ...th, minWidth: 72, color: C.red }}>Pendiente</th>
                    <th style={{ ...th, minWidth: 74 }} title="Stock sin obra asignada, disponible para cubrir esta necesidad.">Stock libre</th>
                    <th style={{ ...th, minWidth: 84, color: C.blue }} title="Pendiente menos stock libre. Esta es la cantidad sugerida para el pedido.">A comprar</th>
                  </>
                ) : (
                  <>
                    <th style={{ ...th, minWidth: 74 }}>Stock libre</th>
                    <th style={{ ...th, minWidth: 84, color: C.blue }}>A comprar</th>
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
                        <input type="checkbox" className="planilla-check" checked={todosPuestos} onChange={() => alternarGrupo(grupo)} title="Elegir todo el grupo" style={{ accentColor: C.blue, width: 14, height: 14, cursor: "pointer", flexShrink: 0 }} />
                        <button type="button" onClick={() => alternarCerrado(grupo.nombre)} style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: C.sans }}>
                          <span style={{ color: grupo.sinProveedor ? C.red : C.text, fontSize: 11.5, fontWeight: 900, letterSpacing: 0.35, textTransform: "uppercase" }}>
                            {cerrado ? "▸ " : "▾ "}{grupo.nombre}
                          </span>
                          <span style={{ color: C.dim, fontSize: 11, fontWeight: 750, marginLeft: 8 }}>
                            {grupo.filas.length} materiales · {grupo.pendientes} pendientes{grupo.aComprar ? ` · ${grupo.aComprar} a comprar` : ""}
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
                  return (
                    <tr key={fila.id} className="planilla-fila" onClick={() => alternarFila(fila.id)} style={{ borderBottom: `1px solid ${C.border}`, background: puesto ? C.blueL : "transparent", cursor: "pointer" }}>
                      <td className="planilla-celda-fija" style={{ ...colFija, background: puesto ? C.blueL : "var(--panel-solid)", padding: "9px 12px", maxWidth: 300 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                          <input type="checkbox" className="planilla-check" checked={puesto} readOnly tabIndex={-1} style={{ accentColor: C.blue, width: 14, height: 14, marginTop: 3, cursor: "pointer", flexShrink: 0 }} />
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
                            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fila.descripcion}</div>
                            <div style={{ marginTop: 2, color: C.dim, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[fila.codigo, fila.unidad, agrupar === "rubro" ? (fila.proveedor || "sin proveedor") : fila.rubro].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <button type="button" className="planilla-ficha" onClick={(event) => abrirFicha(event, fila.id)} title="Abrir ficha del catálogo" aria-label={`Abrir la ficha de ${fila.descripcion}`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.dim }}>
                            <SquarePen size={12} />
                          </button>
                        </div>
                      </td>

                      {obraSeleccionada ? (
                        <>
                          <td style={{ padding: "7px", textAlign: "center" }}><EstadoNumero value={celdaFoco?.requerido} /></td>
                          <td style={{ padding: "7px", textAlign: "center" }}><EstadoNumero value={celdaFoco?.egresado} tone="success" /></td>
                          <td style={{ padding: "7px", textAlign: "center" }}><EstadoNumero value={celdaFoco?.enPanol} tone="info" /></td>
                          <td style={{ padding: "7px", textAlign: "center" }}><EstadoNumero value={celdaFoco?.pendiente} tone="danger" /></td>
                          <td style={{ padding: "7px", textAlign: "center" }} title={fila.reservado ? `${fila.reservado} ${fila.unidad} adicionales están reservados a otras obras.` : "Stock libre disponible"}>
                            <EstadoNumero value={fila.enPanolLibre} />
                            {fila.reservado > 0 ? <div style={{ marginTop: 3, color: C.dim, fontSize: 9, fontWeight: 750 }}>{fila.reservado} apart.</div> : null}
                          </td>
                          <td style={{ padding: "7px", textAlign: "center" }}>
                            {aComprar > 0 ? <EstadoNumero value={aComprar} tone="danger" /> : celdaFoco?.pendiente > 0 ? <span style={{ color: C.green, fontSize: 10.5, fontWeight: 900 }}>cubierto</span> : <span style={{ color: C.border2 }}>—</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "7px", textAlign: "center" }}><EstadoNumero value={fila.enPanolLibre} /></td>
                          <td style={{ padding: "7px", textAlign: "center" }}>{aComprar > 0 ? <EstadoNumero value={aComprar} tone="danger" /> : <span style={{ color: C.border2 }}>—</span>}</td>
                          {obrasVisibles.map((obra) => {
                            const celda = fila.porObra[obra.id];
                            if (vista === "todo") {
                              return (
                                <td
                                  key={obra.id}
                                  style={{ padding: "6px 9px", textAlign: "left", borderLeft: `1px solid ${C.border}` }}
                                  title={celda ? `${obra.codigo} · necesita ${celda.requerido} · entregado ${celda.egresado} · en pañol ${celda.enPanol} · pendiente ${celda.pendiente}` : `${obra.codigo} · sin registro`}
                                >
                                  <ResumenCelda celda={celda} />
                                </td>
                              );
                            }
                            const dato = celdaDeObra(celda, vista);
                            if (!dato) return <td key={obra.id} style={{ padding: "7px", textAlign: "center", color: C.border2 }}>—</td>;
                            const tono = TONOS[dato.tono];
                            return (
                              <td key={obra.id} style={{ padding: "6px", textAlign: "center" }} title={`${obra.codigo} · necesita ${celda.requerido} · entregado ${celda.egresado} · en pañol ${celda.enPanol} · pendiente ${celda.pendiente}`}>
                                <span style={{ display: "inline-block", minWidth: 28, background: tono.fondo, border: `1px solid ${tono.borde}`, color: tono.color, borderRadius: 7, padding: "3px 6px", fontFamily: C.mono, fontSize: 11.5, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                                  {mostrarNumero(dato.texto)}
                                </span>
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

      {seleccionados.length ? (
        <div style={{
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
        </div>
      ) : null}

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
