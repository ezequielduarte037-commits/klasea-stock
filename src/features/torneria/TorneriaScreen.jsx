import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleHelp, Factory, LayoutDashboard, RefreshCw, Wrench } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Cargando from "@/components/ui/Cargando";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import {
  actualizarItem,
  actualizarProceso,
  archivarItemConAlcance,
  archivarOperacion,
  borrarProcesoTorneria,
  crearProcesoTorneria,
  eliminarArchivo,
  eliminarMovimiento,
  fetchTorneriaContexto,
  fetchTorneriaProcesos,
  guardarFlete,
  guardarItemDefinicion,
  guardarMovimiento,
  guardarOperacion,
  marcarPreparacion,
  marcarNoLleva,
  saltearCompraTorneria,
  subirArchivosMovimiento,
  engancharPedidoALaObra,
  vincularItemsAPedidoCompra,
} from "./torneriaApi";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
import {
  CrearProcesoModal, FleteModal, ItemModal, MovimientoModal, OperacionModal, ProcesoModal,
} from "./TorneriaModals";
import { Modal } from "./torneriaUi";
import { CSS } from "./torneriaEstilos";
import { dependencyRows, enArchivo, piezasDeObra, resumenProcesos } from "./torneriaEstado";
import {
  descripcionParaCompras, descripcionPedidoCompras, descripcionPrincipalParaCompras, entregaDirectaParaCompras,
  materialesDelRenglon, pesoParaCompras, planosParaCompras,
} from "./circuitoDatos";
import { cantidadPendienteDeCompra, recepcionAnticipada } from "./recepcionesAnticipadas";
import Tablero from "./vistas/Tablero";
import Obras from "./vistas/Obras";
import ObrasMovil from "./vistas/ObrasMovil";

// Tornería: el circuito de los materiales de Mecánica que van y vuelven de los
// talleres externos. Dos áreas, con el mismo lenguaje que Muebles y Compras:
//
//   Panel general → todas las obras puestas en las etapas del circuito
//                   (Compras → Preparar → Para enviar → En el taller → Para retirar).
//   Obras         → lista + detalle de cada obra: qué toca hacer ahora, sus
//                   piezas por etapa, materiales, pasos e historial.
//
// Esta pantalla carga los datos, guarda los cambios y abre los diálogos; lo que
// se ve vive en vistas/ y las reglas de lectura en torneriaEstado.js.
const AREAS = [
  ["panel", "Panel", LayoutDashboard],
  ["obras", "Obras", Factory],
];

function HelpModal({ onClose }) {
  const pasos = [
    ["Una pieza, una etapa", "Cada material de una obra está en una etapa: Compras, Preparar, Para enviar, En el taller o Para retirar. El botón de cada pieza es siempre el que la pasa a la etapa siguiente."],
    ["Panel general", "Muestra todas las obras en esas etapas, en orden. En el celular se elige la etapa con los chips de arriba. Para enviar y Para retirar se eligen piezas de varias obras y se registran en un solo flete."],
    ["Obras", "Cada obra abre con «Ahora»: lo que toca hacer, en orden de urgencia, con su botón. Debajo, las piezas por etapa; tocá una pieza para ver su recorrido completo."],
    ["Compras", "Los materiales se piden a Compras desde la obra o desde el Panel, un pedido por obra. Cuando Pañol los recibe pasan solos a Preparar."],
    ["Salidas y regresos parciales", "Se cargan sólo las cantidades que viajan. Un paso termina cuando volvieron todas las piezas."],
    ["Conjuntos", "Núcleo+cachas forman la Pata de gallo; pala+mecha, el Timón; bridas+caño, la Limera. El conjunto espera a que vuelvan sus componentes."],
    ["Insumos", "Bulones o broncería que se entregan y se quedan en el taller: su circuito termina en la entrega."],
    ["Terminadas", "Cuando todo el circuito de una obra vuelve al astillero, pasa sola a Terminadas. Para cerrar una antes de tiempo: ⋯ → Archivar obra; desde ahí también se reabre."],
  ];
  return (
    <Modal title="Cómo funciona Tornería" subtitle="El circuito de los materiales que van y vuelven de los talleres." onClose={onClose}>
      <div style={{ display: "grid", gap: 8 }}>
        {pasos.map(([titulo, texto], i) => (
          <div key={titulo} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gap: 10, padding: 11, borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel }}>
            <span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, background: C.blueL, color: C.blue, fontSize: 12.5, fontWeight: 650, fontFamily: C.mono }}>{i + 1}</span>
            <div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 650 }}>{titulo}</div>
              <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{texto}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function TorneriaScreen({ profile }) {
  const { isMobile } = useResponsive(900);
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processes, setProcesses] = useState([]);
  const [obras, setObras] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(() => window.localStorage.getItem("torneria.proceso") || "");
  // El área se recuerda por dispositivo: el celular suele vivir en el Panel y la
  // computadora de la oficina en Obras.
  const [area, setAreaState] = useState(() => {
    const guardada = window.localStorage.getItem("torneria.area");
    return guardada === "obras" || guardada === "panel" ? guardada : "panel";
  });
  // En el celular la lista y el detalle se alternan; en escritorio están juntos.
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [lista, setLista] = useState("curso");
  const [seccion, setSeccion] = useState("piezas");
  // En el celular la obra se ve como siempre: Circuito / Materiales / Historial.
  const [tabMovil, setTabMovil] = useState("circuito");
  const [modal, setModal] = useState(null);
  const [pedidoCompra, setPedidoCompra] = useState(null);

  function setArea(valor) {
    setAreaState(valor);
    window.localStorage.setItem("torneria.area", valor);
  }

  const load = useCallback(async ({ quiet = false, preferId = null } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [context, rows] = await Promise.all([
        fetchTorneriaContexto(),
        fetchTorneriaProcesos(),
      ]);
      setObras(context.obras);
      setTemplates(context.plantillas);
      setProcesses(rows);
      const requested = preferId || window.localStorage.getItem("torneria.proceso") || "";
      const exists = rows.some((row) => row.id === requested);
      // Sin una obra pedida se abre la primera en curso: lo terminado no es lo
      // primero que alguien quiere ver.
      const nextId = exists ? requested : (rows.find((row) => !enArchivo(row)) || rows[0])?.id || "";
      setSelectedId(nextId);
      if (nextId) window.localStorage.setItem("torneria.proceso", nextId);
    } catch (loadError) {
      setError(loadError.message || "No se pudo cargar Tornería.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let timer;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => load({ quiet: true }), 350);
    };
    const channel = supabase.channel("torneria-recepciones")
      .on("postgres_changes", { event: "*", schema: "public", table: "torneria_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "torneria_recepciones_panol" }, refresh)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = window.setInterval(onVisible, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const resumen = useMemo(() => resumenProcesos(processes), [processes]);
  const piezasPorObra = useMemo(
    () => new Map(processes.map((process) => [process.id, piezasDeObra(process)])),
    [processes],
  );
  const piezasDe = useCallback((process) => piezasPorObra.get(process.id) || [], [piezasPorObra]);
  const selected = processes.find((row) => row.id === selectedId) || null;

  function seleccionar(id) {
    const proceso = processes.find((row) => row.id === id);
    if (id !== selectedId) { setSeccion("piezas"); setTabMovil("circuito"); }
    setSelectedId(id);
    window.localStorage.setItem("torneria.proceso", id);
    if (proceso) setLista(enArchivo(proceso) ? "archivo" : "curso");
    setDetalleAbierto(true);
  }

  function abrirObra(id) {
    seleccionar(id);
    setArea("obras");
  }

  async function createProcess(payload) {
    try {
      const id = await crearProcesoTorneria(payload);
      setModal(null);
      await load({ quiet: true, preferId: id });
      setLista("curso");
      setArea("obras");
      setDetalleAbierto(true);
      setSeccion("piezas");
      toast.success("Seguimiento creado con el circuito de su línea.");
    } catch (createError) {
      toast.error(createError.message);
    }
  }

  // Borrar es irreversible y arrastra movimientos, fotos y remitos, así que
  // pide escribir el código de la obra: un "¿estás seguro?" se acepta sin leer,
  // y acá el costo de equivocarse es perder el historial entero.
  async function deleteProcess(process) {
    if (!process) return;
    const codigo = process.obra?.codigo || "";
    const escrito = window.prompt(
      `Esto borra TODO el seguimiento de tornería de ${codigo}:\n` +
      `· los pasos del circuito\n· las salidas y regresos\n· las fotos y remitos cargados\n\n` +
      `No se puede deshacer.\n\nEscribí "${codigo}" para confirmar:`
    );
    if (escrito === null) return;
    if (escrito.trim().toUpperCase() !== codigo.trim().toUpperCase()) {
      toast.error("El código no coincide. No se borró nada.");
      return;
    }
    try {
      await borrarProcesoTorneria(process.id);
      window.localStorage.removeItem("torneria.proceso");
      setSelectedId(null);
      setDetalleAbierto(false);
      await load({ quiet: true });
      toast.success(`Seguimiento de ${codigo} borrado.`);
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function saveProcess(patch) {
    try {
      await actualizarProceso(selected.id, patch);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Seguimiento actualizado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function saveItem(item, payload) {
    try {
      await guardarItemDefinicion({
        item,
        proceso: selected,
        ...payload,
      });
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(payload.alcance === "linea"
        ? `Material actualizado para toda la línea ${selected.obra?.linea_nombre || ""}.`.trim()
        : item?.id ? "Material actualizado para esta obra." : "Material agregado a esta obra.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function archiveCurrentItem(item, alcance = "obra") {
    const accepted = await confirm({
      title: "¿Archivar material?",
      message: alcance === "linea"
        ? `Dejará de aparecer en las obras activas y futuras de la línea ${selected.obra?.linea_nombre || ""}. El historial conservará el cambio.`
        : "Dejará de aparecer sólo en este proceso. El historial conservará el cambio.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await archivarItemConAlcance({ item, proceso: selected, alcance });
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(alcance === "linea"
        ? "Material archivado para toda la línea."
        : "Material archivado en esta obra.");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function saveOperation(operation, payload) {
    try {
      await guardarOperacion({
        id: operation?.id || null,
        procesoId: selected.id,
        ...payload,
      });
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(operation?.id ? "Paso actualizado." : "Paso agregado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function archiveCurrentOperation(operation) {
    const accepted = await confirm({
      title: "¿Archivar paso?",
      message: "El paso dejará de contarse en el avance. Sus movimientos seguirán en el historial.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await archivarOperacion(operation.id);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Paso archivado.");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function saveMovement(operation, movement, payload) {
    const proceso = modal?.process || selected;
    try {
      const movimientoId = await guardarMovimiento({
        id: movement?.id || null,
        operacionId: operation.id,
        ...payload,
        fecha: payload.fecha ? new Date(payload.fecha).toISOString() : new Date().toISOString(),
      });
      if (payload.files?.length) {
        await subirArchivosMovimiento({
          procesoId: proceso.id,
          movimientoId,
          files: payload.files,
        });
      }
      setModal(null);
      await load({ quiet: true, preferId: proceso.id });
      toast.success(payload.tipo === "salida" ? "Salida registrada." : "Regreso registrado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function updatePreparation(components, etapa, listo = true) {
    const ids = (components || []).map((row) => row?.id).filter(Boolean);
    if (!ids.length) return;
    try {
      await marcarPreparacion({
        operacionItemIds: ids,
        etapa,
        listo,
      });
      await load({ quiet: true, preferId: selectedId || null });
      const label = etapa === "envio" ? "enviar" : "retirar";
      toast.success(listo
        ? `${ids.length === 1 ? "Material listo" : "Materiales listos"} para ${label}.`
        : "Preparación reabierta.");
    } catch (preparationError) {
      toast.error(preparationError.message);
    }
  }

  async function saveFreight(payload) {
    try {
      await guardarFlete({
        ...payload,
        fecha: payload.fecha ? new Date(payload.fecha).toISOString() : new Date().toISOString(),
      });
      setModal(null);
      await load({ quiet: true, preferId: selectedId || null });
      toast.success(payload.tipo === "salida"
        ? "Flete de salida registrado."
        : "Retiro conjunto registrado.");
    } catch (freightError) {
      toast.error(freightError.message);
    }
  }

  async function deleteMovement(movement) {
    const proceso = modal?.process || selected;
    const accepted = await confirm({
      title: "¿Eliminar movimiento?",
      message: "Se recalcularán automáticamente las cantidades del paso. La eliminación quedará registrada.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await eliminarMovimiento(movement, proceso.id);
      setModal(null);
      await load({ quiet: true, preferId: proceso.id });
      toast.success("Movimiento eliminado y avance recalculado.");
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function deleteFile(file) {
    const proceso = modal?.process || selected;
    const accepted = await confirm({
      title: "¿Eliminar archivo?",
      message: file.nombre,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await eliminarArchivo(file);
      await load({ quiet: true, preferId: proceso.id });
      setModal(null);
      toast.success("Archivo eliminado.");
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function quickItemStatus(item, compraEstado) {
    try {
      await actualizarItem(item.id, { compra_estado: compraEstado });
      await load({ quiet: true, preferId: selected.id });
      toast.success("Estado de compra actualizado.");
    } catch (statusError) {
      toast.error(statusError.message);
    }
  }

  async function skipPurchase(item) {
    if (!selected || !item) return;
    const pedidoYaCreado = item.compra_estado === "solicitado";
    const accepted = await confirm({
      title: pedidoYaCreado ? "¿Cancelar el pedido y saltear?" : "¿Saltear el paso de compra?",
      message: pedidoYaCreado
        ? "Este material ya fue pedido por error. Se cancelará únicamente esa línea en Compras, se desvinculará de Tornería y quedará En astillero. La corrección quedará registrada en el historial."
        : "Usalo si el material ya está disponible o llegó por otra vía. Se marcará En astillero, no se creará ningún pedido ni aviso a Compras y la excepción quedará registrada en el historial.",
      confirmLabel: pedidoYaCreado ? "Cancelar y saltear" : "Saltear compra",
    });
    if (!accepted) return;
    try {
      await saltearCompraTorneria({ procesoId: selected.id, item });
      await load({ quiet: true, preferId: selected.id });
      toast.success(pedidoYaCreado
        ? "Línea cancelada en Compras. El material quedó En astillero."
        : "Compra salteada. El material quedó En astillero.");
    } catch (skipError) {
      await load({ quiet: true, preferId: selected.id });
      toast.error(skipError.message);
    }
  }

  // Abre el mismo modal que usan inventario, laminación y muebles. Tornería era
  // el único módulo que no pedía a compras desde el sistema.
  async function pedirACompras(items, proceso = selected) {
    if (!proceso) return;
    try {
      // Una recepción puede haberse confirmado mientras la pantalla estaba abierta.
      const rows = await fetchTorneriaProcesos();
      setProcesses(rows);
      const actual = rows.find((row) => row.id === proceso.id);
      const ids = new Set((items || []).filter(Boolean).map((item) => item.id));
      const lista = (actual?.items || []).filter((item) => ids.has(item.id)
        && item.activo !== false && !item.no_lleva && !item.es_resultado
        && item.compra_estado === "pendiente_solicitud" && !recepcionAnticipada(item).completa);
      if (!lista.length) { toast.success("Los materiales ya fueron recibidos o pedidos."); return; }
      setPedidoCompra({ items: lista, proceso: actual });
    } catch (purchaseError) {
      toast.error(purchaseError.message);
    }
  }

  async function toggleNoLleva(item) {
    const marcando = !item.no_lleva;
    if (marcando) {
      const accepted = await confirm({
        title: `¿${item.descripcion} no va en esta obra?`,
        message: "Sale de los pendientes y de las compras, y se apagan los viajes que existían sólo por esta pieza. Se puede volver atrás cuando quieras.",
        confirmLabel: "No lleva",
      });
      if (!accepted) return;
    }
    try {
      await marcarNoLleva(item.id, marcando);
      await load({ quiet: true, preferId: selected.id });
      toast.success(marcando ? "Marcado como no lleva." : "Vuelve al circuito.");
    } catch (noLlevaError) {
      toast.error(noLlevaError.message);
    }
  }

  // Insumo: sale una vez y se queda en el taller. Se avisa que la marca vale
  // para toda la línea porque no es una decisión sobre este barco —como "no
  // lleva"— sino sobre qué es ese material.
  async function toggleInsumo(item) {
    const marcando = !item.es_insumo;
    if (marcando) {
      const accepted = await confirm({
        title: `¿${item.descripcion} es insumo del taller?`,
        message: "Su circuito termina al entregarlo: no se espera el regreso. Como es una propiedad del material y no de esta obra, queda marcado también en las demás obras de la línea.",
        confirmLabel: "Es insumo",
      });
      if (!accepted) return;
    }
    try {
      await actualizarItem(item.id, { es_insumo: marcando });
      await load({ quiet: true, preferId: selected.id });
      toast.success(marcando ? "Marcado como insumo: no vuelve." : "Vuelve a tratarse como pieza.");
    } catch (insumoError) {
      toast.error(insumoError.message);
    }
  }

  async function confirmItem(item, value) {
    try {
      await actualizarItem(item.id, {
        confirmado_at: value ? new Date().toISOString() : null,
        confirmado_por: value ? profile?.id || null : null,
      });
      await load({ quiet: true, preferId: selected.id });
      toast.success(value ? "Dato confirmado." : "Confirmación reabierta.");
    } catch (confirmError) {
      toast.error(confirmError.message);
    }
  }

  function openMovement(operation, movement = null, tipo = null, process = null) {
    setModal({ type: "movement", operation, movement, tipo, process });
  }

  // Archivar es cerrar a mano una obra que todavía no terminó su circuito
  // (las que sí lo terminaron ya están en el Archivo solas). Guarda el estado
  // "completado": sale del Panel y de los pendientes, y el historial queda.
  async function archiveProcess(process) {
    const codigo = process.obra?.codigo || "la obra";
    const accepted = await confirm({
      title: `¿Archivar ${codigo}?`,
      message: "Sale del Panel y de los pendientes, y queda en Archivo con todo su historial. Si todavía faltaban materiales, también se liberan las asignaciones de stock del pañol para esta obra. Se puede reabrir cuando quieras.",
      confirmLabel: "Archivar",
    });
    if (!accepted) return;
    try {
      await actualizarProceso(process.id, { estado: "completado" });
      await load({ quiet: true, preferId: process.id });
      toast.success(`${codigo} archivada. La encontrás en Archivo.`);
      setLista("archivo");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function reopenProcess(process) {
    try {
      await actualizarProceso(process.id, { estado: "activo" });
      await load({ quiet: true, preferId: process.id });
      setLista("curso");
      toast.success(`${process.obra?.codigo || "La obra"} volvió a En curso.`);
    } catch (reopenError) {
      toast.error(reopenError.message);
    }
  }

  const setupMissing = /torneria_|schema cache|does not exist|relation/i.test(error);
  const upgradeMissing = /es_resultado|resultado_de|origen/i.test(error);

  const acciones = {
    onReady: updatePreparation,
    onMove: openMovement,
    onOpenMovement: openMovement,
    onBatch: (tipo, selecciones) => setModal({ type: "flete", tipo, selecciones }),
    onPedir: (process, items) => pedirACompras(items, process),
    onSkipPurchase: skipPurchase,
    onInsumo: toggleInsumo,
    onNoLleva: toggleNoLleva,
    onConfirm: confirmItem,
    onStatus: quickItemStatus,
    onEditItem: (item) => setModal({ type: "item", item }),
    onNewItem: () => setModal({ type: "item", item: null }),
    onEditOperation: (operation) => setModal({ type: "operation", operation }),
    onNewOperation: () => setModal({ type: "operation", operation: null }),
    onEditProcess: () => setModal({ type: "process" }),
    onArchive: () => archiveProcess(selected),
    onReopen: () => reopenProcess(selected),
    onDelete: () => deleteProcess(selected),
  };

  return (
    <div className="tor">
      <style href="klasea-torneria" precedence="default">{CSS}</style>

      <nav className="tor-nav" aria-label="Tornería">
        <span className="tor-nav-marca"><Wrench size={17} /> Tornería</span>
        <span className="tor-nav-sep" />
        <div className="ui-tabs" role="tablist">
          {AREAS.map(([key, label, Icono]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={area === key}
              className="ui-tab"
              onClick={() => setArea(key)}
            >
              {createElement(Icono, { size: 15 })}
              {key === "panel" && !isMobile ? "Panel general" : label}
            </button>
          ))}
        </div>
        <div className="tor-nav-der">
          <button type="button" className="tor-btn-ic tor-solo-escritorio" onClick={() => load()} aria-label="Actualizar" title="Actualizar">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="tor-btn-ic" onClick={() => setModal({ type: "help" })} aria-label="Cómo funciona" title="Cómo funciona">
            <CircleHelp size={17} />
          </button>
        </div>
      </nav>

      <div className={`tor-vista${area === "obras" && detalleAbierto && selected ? " en-detalle" : ""}`} key={area}>
        {loading ? (
          <Cargando llenar texto="Cargando circuitos…" />
        ) : error ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 20 }}>
            <div className="tor-aviso" data-tono="rojo" style={{ width: "min(560px,100%)" }}>
              <AlertTriangle size={18} />
              <span>
                <b>{setupMissing ? "Falta aplicar la migración de Tornería." : "No se pudo cargar el módulo."}</b>{" "}
                {error}
                {setupMissing && (
                  <code style={{ display: "block", marginTop: 8, fontSize: 12, overflowWrap: "anywhere" }}>
                    {upgradeMissing
                      ? "supabase/migrations/20260729150000_torneria_conjuntos_y_origenes.sql"
                      : "supabase/migrations/20260728230000_torneria_seguimiento.sql"}
                  </code>
                )}
              </span>
              <button type="button" className="ui-btn chico" onClick={() => load()}>
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          </div>
        ) : area === "panel" ? (
          <Tablero
            resumen={resumen}
            onAbrirObra={abrirObra}
            onReady={updatePreparation}
            onBatch={acciones.onBatch}
            onPedir={acciones.onPedir}
          />
        ) : isMobile ? (
          <ObrasMovil
            processes={processes}
            selected={selected}
            onSelect={seleccionar}
            detalleAbierto={detalleAbierto}
            onVolver={() => setDetalleAbierto(false)}
            onNuevo={() => setModal({ type: "create" })}
            lista={lista}
            setLista={setLista}
            tab={tabMovil}
            setTab={setTabMovil}
            acciones={acciones}
          />
        ) : (
          <Obras
            processes={processes}
            piezasDe={piezasDe}
            selected={selected}
            onSelect={seleccionar}
            detalleAbierto={detalleAbierto}
            onVolver={() => setDetalleAbierto(false)}
            onNuevo={() => setModal({ type: "create" })}
            isMobile={isMobile}
            lista={lista}
            setLista={setLista}
            seccion={seccion}
            setSeccion={setSeccion}
            acciones={acciones}
          />
        )}
      </div>

      {modal?.type === "create" && (
        <CrearProcesoModal
          obras={obras}
          plantillas={templates}
          procesos={processes}
          onClose={() => setModal(null)}
          onCreate={createProcess}
        />
      )}
      {modal?.type === "process" && selected && (
        <ProcesoModal proceso={selected} onClose={() => setModal(null)} onSave={saveProcess} />
      )}
      {modal?.type === "item" && selected && (
        <ItemModal
          item={modal.item}
          proceso={selected}
          onClose={() => setModal(null)}
          onSave={(payload) => saveItem(modal.item, payload)}
          onArchive={(alcance) => archiveCurrentItem(modal.item, alcance)}
        />
      )}
      {modal?.type === "operation" && selected && (
        <OperacionModal
          operacion={modal.operation}
          proceso={selected}
          onClose={() => setModal(null)}
          onSave={(payload) => saveOperation(modal.operation, payload)}
          onArchive={() => archiveCurrentOperation(modal.operation)}
        />
      )}
      {modal?.type === "movement" && (modal.process || selected) && (
        <MovimientoModal
          operacion={modal.operation}
          movimiento={modal.movement}
          tipoInicial={modal.tipo}
          dependenciasPendientes={dependencyRows(modal.process || selected, modal.operation)}
          onClose={() => setModal(null)}
          onSave={(payload) => saveMovement(modal.operation, modal.movement, payload)}
          onDelete={() => deleteMovement(modal.movement)}
          onDeleteFile={deleteFile}
        />
      )}
      {modal?.type === "flete" && (
        <FleteModal
          tipo={modal.tipo}
          selecciones={modal.selecciones}
          onClose={() => setModal(null)}
          onSave={saveFreight}
        />
      )}
      {modal?.type === "help" && <HelpModal onClose={() => setModal(null)} />}

      {/* Pedido a compras: el mismo modal de siempre. Al volver con el pedido
          creado se vinculan los items, y de ahí en adelante el avance de compras
          sincroniza solo — nadie carga el estado dos veces. */}
      <PedirAComprasModal
        open={Boolean(pedidoCompra)}
        profile={profile}
        origen="torneria"
        onClose={async (created, itemsCreados) => {
          const actual = pedidoCompra;
          setPedidoCompra(null);
          if (!created || !actual) return;
          try {
            if (created?.id) {
              // Se empareja por la descripción con la que salió cada material,
              // que es lo único que sobrevive el paso por el modal (ahí se pueden
              // agregar o quitar ítems a mano).
              const porDescripcion = new Map(
                (itemsCreados || []).map((entry) => [entry?.draft?.description, entry?.requestItem?.id]),
              );
              await vincularItemsAPedidoCompra(
                actual.items.map((item) => ({
                  itemId: item.id,
                  requestItemId: porDescripcion.get(descripcionPrincipalParaCompras(item)) || null,
                })),
                created.id,
              );

              // Y el mismo pedido se engancha a la lista de la obra, por
              // material. Sin esto el renglón de la obra se queda en "pendiente"
              // para siempre: el que mira la obra ve que falta algo que ya está
              // pedido y lo vuelve a pedir. De acá en adelante el estado lo mueve
              // sync_obra_snapshot_from_purchase_item, que ya existía.
              //
              // Va aparte y con su propio catch: si falla, el pedido ya se mandó
              // y los renglones de Tornería ya quedaron vinculados. Perder el
              // reflejo en la obra es molesto; tirar todo el bloque por eso sería
              // peor.
              const obraId = actual.proceso?.obra?.id || null;
              if (obraId) {
                try {
                  await engancharPedidoALaObra(created.id, obraId);
                } catch (obraError) {
                  toast.error(
                    `El pedido se envió, pero la lista de la obra no se actualizó: ${obraError.message}`,
                  );
                }
              }
            }
            await load({ quiet: true, preferId: actual.proceso.id });
          } catch (linkError) {
            // El pedido ya viajó a compras: lo único que falló es el vínculo, así
            // que se avisa sin hacer creer que no se pidió nada.
            toast.error(`El pedido se envió, pero no se pudo vincular: ${linkError.message}`);
          }
        }}
        prefilled={pedidoCompra ? {
          title: `Tornería · ${pedidoCompra.proceso.obra?.codigo || "Obra"}`,
          description: descripcionPedidoCompras(pedidoCompra.proceso, pedidoCompra.items),
          priority: "alta",
          tipo_pedido: "estandar",
          source: "torneria",
          source_ref: pedidoCompra.proceso.id,
          source_url: "/torneria",
          attachments: planosParaCompras(pedidoCompra.items),
          defaultDestination: `Obra ${pedidoCompra.proceso.obra?.codigo || ""}`.trim(),
          items: pedidoCompra.items.flatMap((item) => {
            const entregaDirecta = entregaDirectaParaCompras(pedidoCompra.proceso, item);
            const lista = materialesDelRenglon(item);

            // Si está vinculado al catálogo, el pedido va con el nombre del
            // catálogo y no con el de tornería. "Nucleo de pata de gallo" es
            // cómo lo llamamos acá adentro; al proveedor hay que pedirle el
            // material como figura en el catálogo, con su código y su unidad.
            const armar = (cat, cantidad, dentroDelLote) => ({
              description: descripcionParaCompras(item, cat),
              quantity: String(cantidad ?? ""),
              unit: cat?.unidad_medida || item.unidad || "unidad",
              destination: entregaDirecta?.destino || undefined,
              // Con el id del catálogo, la recepción en pañol lo empareja exacto
              // (scorePedidoMaterial le da el puntaje máximo) en vez de adivinar
              // por parecido de texto.
              material_id: cat?.id || null,
              catalogSource: cat ? "panol" : null,
              link_url: item.planos?.[0]?.url || null,
              notes: [
                entregaDirecta?.nota || "",
                // El nombre interno queda de referencia: es con el que el taller
                // reconoce la pieza cuando llega.
                cat
                  ? (dentroDelLote
                    ? `Parte del lote: ${item.descripcion}`
                    : `En Tornería: ${item.descripcion}`)
                  : "",
                // El peso, cuando el material se cotiza por kilo. La broncería
                // de Parra se factura a USD/kg y la pieza se corta de una barra:
                // sin el peso, el proveedor tiene el diámetro -"130x50"- pero no
                // cuánto material lleva, que es lo que necesita para cotizar.
                pesoParaCompras(cat),
                item.grupo ? `Grupo: ${item.grupo}` : "",
                (cat?.proveedor || item.proveedor_compra)
                  ? `Proveedor: ${cat?.proveedor || item.proveedor_compra}`
                  : "",
                !cat ? "Sin vincular al catálogo del pañol." : "",
                item.planos?.length
                  ? `${item.planos.length} ${item.planos.length === 1 ? "plano adjunto" : "planos adjuntos"} al pedido.`
                  : "",
                item.alerta || "",
              ].filter(Boolean).join(" · ") || undefined,
            });

            // Un renglón con varios materiales sale como varios renglones del
            // pedido. Al proveedor hay que pedirle cada pieza con su código y su
            // cantidad, y Pañol necesita el id de catálogo de cada una para
            // emparejar la recepción: un "lote" en una sola línea no se puede ni
            // cotizar ni recibir pieza por pieza.
            if (lista.length > 1) {
              return lista.map((row) => ({
                row, pendiente: cantidadPendienteDeCompra(item, row.material_id),
              })).filter(({ pendiente }) => pendiente > 0)
                .map(({ row, pendiente }) => armar(row.material, pendiente, true));
            }
            const pendiente = cantidadPendienteDeCompra(item, item.material_id);
            return pendiente > 0 ? [armar(item.material || null, pendiente, false)] : [];
          }),
        } : null}
      />

    </div>
  );
}
