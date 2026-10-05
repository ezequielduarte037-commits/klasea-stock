import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FilePenLine,
  Hammer,
  History,
  Layers3,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Cargando from "@/components/ui/Cargando";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
import { ChapaSwatch } from "@/features/muebles/chapa";
import MueblesOrdenesTrabajoPanel from "@/features/muebles/MueblesOrdenesTrabajoPanel";
import {
  herrajesForModelo,
  OTDetail,
  templateEnchapadoForModelo,
} from "@/features/muebles/EnchapadoView";
import {
  cantidadMuebles,
  destinoLote,
  etapaMeta,
  fechaCorta,
  FLUJOS_MUEBLES,
  nombreLinea,
  nombreMuebles,
  nombreObra,
  PROVEEDORES_MUEBLES,
} from "../mueblesProduccion";
import { Aviso, Estado, Mini, Modal, Tag, Tarea, Vacio } from "../ui";

const EMPTY_FORM = {
  tipo_destino: "obra",
  proveedor: "Oberti",
  linea_id: "",
  unidad_id: "",
  nombre_lote: "",
  cantidad_juegos: 1,
  color_chapa: "",
  material_base: "",
  detalle_madera: "",
  fecha_objetivo: "",
  observaciones: "",
};

const OBERTI_TASKS = [
  ["tablones_preparados", "Banco: tablones preparados"],
  ["chapas_preparadas", "Banco: preparación de chapas completada"],
  ["medidas_adjuntas", "Oficina Técnica: OT de chapas digitalizada"],
];

// Proveedor → teal (Oberti) / violeta (Morph). Ninguno es amarillo.
const TONO_PROVEEDOR = { Oberti: "teal", Morph: "violeta" };

// Orden de las etapas de los dos recorridos juntos, para los chips de arriba.
const ORDEN_ETAPAS = [
  "definicion", "compra_materiales", "materiales_astillero", "preparacion_banco", "enchapadora",
  "envio_morph", "flete_oberti", "fabricacion_oberti", "fabricacion_morph", "transito_astillero", "recibido",
];

function etiquetaEtapa(key) {
  for (const flujo of Object.values(FLUJOS_MUEBLES)) {
    const etapa = flujo.find((item) => item.key === key);
    if (etapa) return key === "recibido" ? "Recepción" : etapa.label;
  }
  return key;
}

function normalizeKey(value = "") {
  return String(value).trim().toLowerCase().replace(/^k(?=\d)/, "");
}

function recepcionMeta(lote, checklistRows) {
  if (!lote || etapaMeta(lote).etapa.key !== "recibido") return null;
  const rows = checklistRows.filter((row) => row.unidad_id === lote.unidad_id);
  const completos = rows.filter((row) => row.estado === "Completo").length;
  const parciales = rows.filter((row) => row.estado === "Parcial").length;
  const completa = lote.recepcion_estado === "completa" || (rows.length > 0 && completos === rows.length);
  return {
    estado: completa ? "completa" : "parcial",
    total: rows.length,
    completos,
    parciales,
    pct: rows.length ? Math.round((completos / rows.length) * 100) : 0,
  };
}

function fechaHora(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function tonoHistorial(accion = "") {
  const texto = accion.toLowerCase();
  if (texto.includes("advertencia") || texto.includes("revertido")) return "violeta";
  if (texto.includes("creado") || texto.includes("recepción completada") || texto.includes("enviados a oberti")) return "verde";
  if (texto.includes("etapa")) return "azul";
  return "neutro";
}

export default function ProduccionTab({ esAdmin, profile, onOpenChecklist, onEnsureMueblesUnidad }) {
  const confirmar = useConfirm();
  const [lotes, setLotes] = useState([]);
  const [ots, setOts] = useState([]);
  const [comprasHerrajes, setComprasHerrajes] = useState([]);
  const [checklistRecepcion, setChecklistRecepcion] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [obrasProduccion, setObrasProduccion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // { lote, target, faltan[] } — lo que hay que confirmar antes de saltear pasos.
  const [avisoSalto, setAvisoSalto] = useState(null);
  const [q, setQ] = useState("");
  const [proveedor, setProveedor] = useState("Todos");
  const [destino, setDestino] = useState("Todos");
  const [etapaFiltro, setEtapaFiltro] = useState("todas");
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  // En el celular la lista y el detalle se alternan.
  const [detalleMovil, setDetalleMovil] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [vinculandoObra, setVinculandoObra] = useState(false);
  const [gestionOt, setGestionOt] = useState(null);
  const [creandoOt, setCreandoOt] = useState(false);
  const [pedidoHerrajes, setPedidoHerrajes] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateLineaId, setTemplateLineaId] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // Datos que se leen aparte para el proceso elegido. Se guardan junto con la
  // clave para la que se pidieron: si cambia la selección, se descartan solos.
  const [chapasOt, setChapasOt] = useState(null);
  const [faltanAhora, setFaltanAhora] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [refresco, setRefresco] = useState(0);
  const rutaRef = useRef(null);

  async function cargar() {
    setLoading(true);
    setError("");
    const [lotesRes, lineasRes, unidadesRes, obrasRes, otsRes, comprasRes, checklistRes] = await Promise.all([
      supabase.from("prod_muebles_lotes").select(`
        id, proveedor, unidad_id, linea_id, tipo_destino, nombre_lote, cantidad_juegos,
        color_chapa, material_base, detalle_madera, etapa, estado_proceso, fecha_objetivo,
        observaciones, tablones_preparados, chapas_preparadas, medidas_adjuntas,
        enchapado_listo, flete_solicitado, enchapado_ot_id, herrajes_pedido,
        herrajes_enviado, recepcion_estado, creado_el, actualizado_el,
        prod_unidades (id, codigo, color, linea_id),
        prod_lineas (id, nombre)
      `).order("actualizado_el", { ascending: false }),
      supabase.from("prod_lineas").select("id,nombre").eq("activa", true).order("nombre"),
      supabase.from("prod_unidades").select("id,codigo,linea_id,color").eq("activa", true).order("codigo"),
      supabase.from("produccion_obras")
        .select("id,codigo,linea_nombre,estado")
        .eq("estado", "activa")
        .order("codigo"),
      supabase.from("enchapado_ots").select(`
        id,modelo,barco,tipo_chapa,fecha,responsable,estado,notas,
        fecha_desmolde_est,fecha_desmolde_real,fecha_botada,
        tablones_pedido,tablones_enviado,herrajes_pedido,herrajes_enviado,created_at
      `).order("created_at", { ascending: false }),
      supabase.from("purchase_requests")
        .select("id,title,status,source_ref,created_at")
        .eq("source", "muebles_herrajes")
        .order("created_at", { ascending: false }),
      supabase.from("prod_unidad_checklist").select("unidad_id,estado"),
    ]);
    if (lotesRes.error) {
      setError(`No se pudo abrir el flujo nuevo. Aplicá la migración 20260727220000_muebles_flujo_operativo.sql. ${lotesRes.error.message}`);
    }
    const otRows = otsRes.data ?? [];
    const loteRows = (lotesRes.data ?? []).map((lote) => {
      if (lote.enchapado_ot_id || lote.proveedor !== "Oberti") return lote;
      const match = otRows.find((ot) =>
        normalizeKey(ot.modelo) === normalizeKey(lote.prod_lineas?.nombre)
        && normalizeKey(ot.barco) === normalizeKey(lote.prod_unidades?.codigo));
      if (!match) return lote;
      supabase.from("prod_muebles_lotes").update({ enchapado_ot_id: match.id }).eq("id", lote.id).then(() => {});
      return { ...lote, enchapado_ot_id: match.id };
    });
    const linkedOtIds = new Set(loteRows.map((lote) => lote.enchapado_ot_id).filter(Boolean));
    const importedRows = [];
    for (const ot of otRows.filter((item) => !linkedOtIds.has(item.id))) {
      let linea = (lineasRes.data ?? []).find((item) => normalizeKey(item.nombre) === normalizeKey(ot.modelo));
      let unidad = (unidadesRes.data ?? []).find((item) =>
        item.linea_id === linea?.id && normalizeKey(item.codigo) === normalizeKey(ot.barco));
      if ((!linea || !unidad) && onEnsureMueblesUnidad) {
        try {
          const ensured = await onEnsureMueblesUnidad({ modelo: ot.modelo, barco: ot.barco });
          linea = ensured?.linea ?? linea;
          unidad = ensured?.unidad ?? unidad;
        } catch {
          // La OT sigue visible en su tabla original y podrá vincularse cuando
          // la línea/obra exista en Producción.
        }
      }
      if (!linea?.id || !unidad?.id) continue;
      const { data: imported, error: importError } = await supabase.from("prod_muebles_lotes").insert({
        proveedor: "Oberti",
        unidad_id: unidad.id,
        linea_id: linea.id,
        tipo_destino: "obra",
        nombre_lote: `Muebles ${linea.nombre}`,
        color_chapa: ot.tipo_chapa || null,
        etapa: "enchapadora",
        estado_proceso: "En enchapadora",
        enchapado_ot_id: ot.id,
        enchapado_listo: ot.estado === "Devuelta",
        herrajes_pedido: Boolean(ot.herrajes_pedido),
        herrajes_enviado: Boolean(ot.herrajes_enviado),
      }).select().single();
      if (!importError && imported) {
        importedRows.push({
          ...imported,
          prod_lineas: { id: linea.id, nombre: linea.nombre },
          prod_unidades: { id: unidad.id, codigo: unidad.codigo, color: unidad.color, linea_id: linea.id },
        });
      }
    }
    setLotes([...loteRows, ...importedRows]);
    setOts(otRows);
    setComprasHerrajes(comprasRes.data ?? []);
    setChecklistRecepcion(checklistRes.data ?? []);
    setLineas(lineasRes.data ?? []);
    setUnidades(unidadesRes.data ?? []);
    setObrasProduccion(obrasRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => cargar(), 0);
    return () => window.clearTimeout(timer);
    // `cargar` reúne la sincronización inicial y no debe reejecutarse por cada
    // cambio de selección o callback del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activos = useMemo(() => lotes.filter((lote) => {
    const recepcion = recepcionMeta(lote, checklistRecepcion);
    return !recepcion || recepcion.estado !== "completa";
  }), [checklistRecepcion, lotes]);

  // Proveedor, destino y búsqueda. La etapa se filtra aparte para que los
  // chips de etapa muestren cuántos hay en cada una con los demás filtros.
  const base = useMemo(() => {
    const text = q.trim().toLowerCase();
    return activos.filter((lote) => {
      if (proveedor !== "Todos" && lote.proveedor !== proveedor) return false;
      if (destino !== "Todos" && destinoLote(lote) !== destino) return false;
      if (!text) return true;
      return `${nombreLinea(lote)} ${nombreObra(lote)} ${lote.nombre_lote || ""} ${lote.color_chapa || ""} ${lote.material_base || ""}`.toLowerCase().includes(text);
    });
  }, [activos, destino, proveedor, q]);

  const porEtapa = useMemo(() => {
    const cuenta = new Map();
    for (const lote of base) {
      const key = etapaMeta(lote).etapa.key;
      cuenta.set(key, (cuenta.get(key) || 0) + 1);
    }
    return ORDEN_ETAPAS.filter((key) => cuenta.has(key)).map((key) => ({ key, n: cuenta.get(key) }));
  }, [base]);

  const filtrados = useMemo(() => (etapaFiltro === "todas"
    ? base
    : base.filter((lote) => etapaMeta(lote).etapa.key === etapaFiltro)), [base, etapaFiltro]);

  const seleccionado = filtrados.find((lote) => lote.id === seleccionadoId) ?? filtrados[0] ?? null;
  const meta = seleccionado ? etapaMeta(seleccionado) : null;
  const selectedOt = seleccionado ? otParaLote(seleccionado) : null;
  const selectedHerrajes = seleccionado?.proveedor === "Oberti"
    ? (herrajesForModelo(nombreLinea(seleccionado)) ?? [])
    : [];
  const selectedCompraHerrajes = seleccionado
    ? comprasHerrajes.find((request) =>
      request.source_ref === selectedOt?.id || request.source_ref === seleccionado.id)
    : null;
  const selectedRecepcion = seleccionado ? recepcionMeta(seleccionado, checklistRecepcion) : null;
  const selectedChapa = selectedOt?.tipo_chapa || seleccionado?.color_chapa || seleccionado?.material_base || "";
  const herrajesEnviados = Boolean(seleccionado?.herrajes_enviado || selectedOt?.herrajes_enviado);
  const herrajesPedidos = Boolean(seleccionado?.herrajes_pedido || selectedOt?.herrajes_pedido);
  const plantillaOt = selectedOt ? templateEnchapadoForModelo(selectedOt.modelo) : null;

  // Hojas de chapa cargadas en la OT del proceso elegido.
  useEffect(() => {
    if (!selectedOt?.id || !plantillaOt?.items?.length) return undefined;
    let activo = true;
    const otId = selectedOt.id;
    supabase.from("enchapado_ot_items").select("item_id,chapas_descripcion").eq("ot_id", otId)
      .then(({ data, error: itemsError }) => {
        if (!activo || itemsError) return;
        const cargadas = plantillaOt.items.filter((item) =>
          data?.find((row) => row.item_id === item.id)?.chapas_descripcion?.trim()).length;
        setChapasOt({ otId, refresco, cargadas, total: plantillaOt.items.length });
      });
    return () => { activo = false; };
  }, [selectedOt?.id, plantillaOt, refresco]);
  const chapas = chapasOt && chapasOt.otId === selectedOt?.id ? chapasOt : null;

  // Lo que falta para dejar la etapa actual: el mismo chequeo que se hace al
  // avanzar, pero a la vista antes de tocar el botón.
  const firmaFaltan = seleccionado && meta ? JSON.stringify([
    seleccionado.id, meta.etapa.key, seleccionado.tablones_preparados, seleccionado.chapas_preparadas,
    seleccionado.medidas_adjuntas, seleccionado.herrajes_enviado, selectedOt?.id, selectedOt?.estado,
    selectedOt?.tablones_enviado, selectedOt?.herrajes_enviado, refresco,
  ]) : "";
  useEffect(() => {
    if (!firmaFaltan || !seleccionado || !meta?.siguiente) return undefined;
    let activo = true;
    pendientesParaAvanzar(seleccionado, meta).then((faltan) => {
      if (activo) setFaltanAhora({ firma: firmaFaltan, faltan });
    });
    return () => { activo = false; };
    // La firma resume todo lo que cambia el resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaFaltan]);
  const faltan = faltanAhora && faltanAhora.firma === firmaFaltan ? faltanAhora.faltan : null;

  // Últimos movimientos del proceso elegido, con quién los hizo.
  useEffect(() => {
    if (!seleccionado?.id) return undefined;
    let activo = true;
    const loteId = seleccionado.id;
    (async () => {
      const { data, error: histError } = await supabase
        .from("prod_muebles_lotes_historial")
        .select("id,accion,usuario_id,creado_el")
        .eq("lote_id", loteId)
        .order("creado_el", { ascending: false })
        .limit(12);
      if (!activo || histError) return;
      const ids = [...new Set((data ?? []).map((row) => row.usuario_id).filter(Boolean))];
      let nombres = new Map();
      if (ids.length) {
        const { data: perfiles } = await supabase.from("profiles").select("id,username").in("id", ids);
        nombres = new Map((perfiles ?? []).map((perfil) => [perfil.id, perfil.username]));
      }
      if (!activo) return;
      setHistorial({
        loteId,
        refresco,
        filas: (data ?? []).map((row) => ({ ...row, quien: nombres.get(row.usuario_id) || null })),
      });
    })();
    return () => { activo = false; };
  }, [seleccionado?.id, refresco]);
  const filasHistorial = historial && historial.loteId === seleccionado?.id ? historial.filas : null;

  // Si el recorrido no entra (celular), se centra en la etapa actual.
  useEffect(() => {
    const ruta = rutaRef.current;
    const actual = ruta?.querySelector(".mbl-paso.actual");
    if (!ruta || !actual || ruta.scrollWidth <= ruta.clientWidth) return;
    ruta.scrollLeft = actual.offsetLeft - ruta.clientWidth / 2 + actual.clientWidth / 2;
  }, [seleccionado?.id, meta?.index, detalleMovil]);

  async function registrar(loteId, accion, extra = {}) {
    const { data } = await supabase.auth.getUser();
    await supabase.from("prod_muebles_lotes_historial").insert({
      lote_id: loteId,
      accion,
      usuario_id: data?.user?.id ?? null,
      ...extra,
    });
    setRefresco((n) => n + 1);
  }

  async function actualizarLote(lote, patch, accion = "Actualización", detalleExtra = {}) {
    const anterior = etapaMeta(lote).etapa.key;
    setLotes((prev) => prev.map((item) => item.id === lote.id ? { ...item, ...patch } : item));
    const { data } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("prod_muebles_lotes")
      .update({ ...patch, actualizado_el: new Date().toISOString(), actualizado_por: data?.user?.id ?? null })
      .eq("id", lote.id);
    if (updateError) {
      setError(updateError.message);
      await cargar();
      return;
    }
    await registrar(lote.id, accion, {
      etapa_anterior: anterior,
      etapa_nueva: patch.etapa ?? anterior,
      detalle: { ...patch, ...detalleExtra },
    });
  }

  // Junta lo que FALTA para avanzar, sin decidir si se puede o no. Antes cada
  // chequeo cortaba con un `return` y dejaba al usuario trabado; ahora sólo
  // informa, y quien decide es la persona.
  async function pendientesParaAvanzar(lote, current) {
    const faltanLista = [];
    if (lote.proveedor !== "Oberti") return faltanLista;

    if (current.etapa.key === "preparacion_banco") {
      if (!lote.tablones_preparados) faltanLista.push("Los tablones no están marcados como preparados.");
      if (!lote.chapas_preparadas) faltanLista.push("Las chapas no están marcadas como preparadas.");
      if (!lote.medidas_adjuntas) faltanLista.push("Faltan adjuntar las medidas.");

      const ot = otParaLote(lote);
      if (!ot) {
        faltanLista.push("No hay OT de chapas digitalizada.");
      } else {
        if (!["Enviada", "Devuelta"].includes(ot.estado)) {
          faltanLista.push("La OT de chapas todavía no figura como “Enviada”.");
        }
        const plantilla = templateEnchapadoForModelo(nombreLinea(lote));
        const { data: itemsOt, error: itemsOtError } = await supabase
          .from("enchapado_ot_items")
          .select("item_id,chapas_descripcion")
          .eq("ot_id", ot.id);
        if (itemsOtError) {
          faltanLista.push(`No se pudo verificar la digitalización de la OT: ${itemsOtError.message}`);
        } else if (plantilla?.items?.length) {
          const sinDigitalizar = plantilla.items.filter((itemPlantilla) =>
            !itemsOt?.find((item) => item.item_id === itemPlantilla.id)?.chapas_descripcion?.trim());
          if (sinDigitalizar.length) {
            faltanLista.push(`${sinDigitalizar.length} ${sinDigitalizar.length === 1 ? "ítem no tiene" : "ítems no tienen"} descripción de chapas cargada.`);
          }
        }
        if (plantilla?.tablones && !ot.tablones_enviado) {
          faltanLista.push("No se envió a Oberti el aviso con la OT de tablones.");
        }
      }
    }

    if (current.etapa.key === "enchapadora") {
      const ot = otParaLote(lote);
      if (!ot || ot.estado !== "Devuelta") {
        faltanLista.push("La OT no figura como “Devuelta” (material enchapado y de vuelta en el astillero).");
      }
      const kit = herrajesForModelo(nombreLinea(lote)) ?? [];
      if (kit.length && !(lote.herrajes_enviado || ot?.herrajes_enviado)) {
        faltanLista.push("Los herrajes no están marcados como enviados a Oberti.");
      }
    }

    return faltanLista;
  }

  async function moverAEtapa(lote, targetIndex) {
    const current = etapaMeta(lote);
    const target = current.flujo[targetIndex];
    if (!target || targetIndex === current.index) return;

    if (targetIndex > current.index) {
      const faltanLista = [];
      for (let index = current.index; index < targetIndex; index += 1) {
        const etapa = current.flujo[index];
        const pendientes = await pendientesParaAvanzar(lote, { ...current, etapa, index });
        pendientes.forEach((pendiente) => faltanLista.push(`${etapa.label}: ${pendiente}`));
      }
      const etapasOmitidas = current.flujo
        .slice(current.index + 1, targetIndex)
        .map((etapa) => etapa.label);

      if (faltanLista.length || etapasOmitidas.length) {
        // La realidad del taller no siempre entra en el orden del sistema. Se
        // informa qué queda abierto, pero la persona conserva la decisión.
        setAvisoSalto({ lote, target, targetIndex, faltan: faltanLista, etapasOmitidas });
        return;
      }
    }

    setError("");
    await actualizarLote(lote, {
      etapa: target.key,
      estado_proceso: target.label,
      ...(target.key === "recibido" ? { recepcion_estado: "parcial" } : {}),
    }, targetIndex < current.index ? `Etapa corregida: ${target.label}` : `Etapa: ${target.label}`);
  }

  async function mover(lote, direction) {
    const current = etapaMeta(lote);
    await moverAEtapa(lote, current.index + direction);
  }

  // Avanza aunque falten cosas, dejando registrado QUÉ se salteó: si después
  // aparece un problema, el historial explica por dónde se pasó de largo.
  async function confirmarSalto() {
    const aviso = avisoSalto;
    if (!aviso) return;
    setAvisoSalto(null);
    setError("");
    await actualizarLote(aviso.lote, {
      etapa: aviso.target.key,
      estado_proceso: aviso.target.label,
      ...(aviso.target.key === "recibido" ? { recepcion_estado: "parcial" } : {}),
    }, `Etapa ajustada con advertencia: ${aviso.target.label}`, {
      advertencias: aviso.faltan,
      etapas_omitidas: aviso.etapasOmitidas,
    });
  }

  function abrirNuevoProceso() {
    setEditandoId(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setShowAdd(true);
  }

  function abrirEditarProceso(lote) {
    setEditandoId(lote.id);
    setForm({
      tipo_destino: destinoLote(lote),
      proveedor: lote.proveedor || "Oberti",
      linea_id: lote.linea_id || lote.prod_lineas?.id || "",
      unidad_id: lote.unidad_id || lote.prod_unidades?.id || "",
      nombre_lote: lote.nombre_lote || "",
      cantidad_juegos: Math.max(1, Number(lote.cantidad_juegos) || 1),
      color_chapa: lote.color_chapa || "",
      material_base: lote.material_base || "",
      detalle_madera: lote.detalle_madera || "",
      fecha_objetivo: lote.fecha_objetivo || "",
      observaciones: lote.observaciones || "",
    });
    setError("");
    setShowAdd(true);
  }

  function cerrarFormulario() {
    if (saving || vinculandoObra) return;
    setShowAdd(false);
    setEditandoId(null);
    setForm({ ...EMPTY_FORM });
  }

  async function guardarLote() {
    const unidad = unidades.find((item) => item.id === form.unidad_id);
    const lineaId = form.tipo_destino === "obra" ? unidad?.linea_id : form.linea_id;
    if (!lineaId || (form.tipo_destino === "obra" && !form.unidad_id)) {
      setError("Elegí una obra o una línea para continuar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payloadComun = {
        tipo_destino: form.tipo_destino,
        proveedor: form.proveedor,
        linea_id: lineaId,
        unidad_id: form.tipo_destino === "obra" ? form.unidad_id : null,
        nombre_lote: form.nombre_lote.trim() || null,
        cantidad_juegos: Math.max(1, Number(form.cantidad_juegos) || 1),
        color_chapa: form.color_chapa.trim() || null,
        material_base: form.material_base.trim() || null,
        detalle_madera: form.detalle_madera.trim() || null,
        observaciones: form.observaciones.trim() || null,
        fecha_objetivo: form.fecha_objetivo || null,
        actualizado_el: new Date().toISOString(),
        actualizado_por: userData?.user?.id ?? null,
      };
      let advertenciaGuardado = "";

      if (editandoId) {
        const loteActual = lotes.find((item) => item.id === editandoId);
        if (!loteActual) throw new Error("El proceso que querés editar ya no está disponible.");
        const etapaCorregida = etapaMeta({ ...loteActual, proveedor: form.proveedor });
        const patch = {
          ...payloadComun,
          etapa: etapaCorregida.etapa.key,
          estado_proceso: etapaCorregida.etapa.label,
        };
        const { error: updateError } = await supabase
          .from("prod_muebles_lotes")
          .update(patch)
          .eq("id", editandoId);
        if (updateError) throw updateError;

        if (loteActual.enchapado_ot_id && form.tipo_destino === "obra") {
          const linea = lineas.find((item) => item.id === lineaId);
          const { error: otUpdateError } = await supabase
            .from("enchapado_ots")
            .update({ modelo: linea?.nombre || nombreLinea(loteActual), barco: unidad?.codigo || nombreObra(loteActual) })
            .eq("id", loteActual.enchapado_ot_id);
          if (otUpdateError) advertenciaGuardado = `El proceso se corrigió, pero la OT vinculada no pudo actualizarse: ${otUpdateError.message}`;
        }

        await registrar(editandoId, "Datos del proceso corregidos", {
          etapa_anterior: etapaMeta(loteActual).etapa.key,
          etapa_nueva: etapaCorregida.etapa.key,
          detalle: payloadComun,
        });
        setSeleccionadoId(editandoId);
      } else {
        const payload = {
          ...payloadComun,
          etapa: "definicion",
          estado_proceso: "Definición",
          creado_por: userData?.user?.id ?? null,
        };
        const { data, error: insertError } = await supabase
          .from("prod_muebles_lotes")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        await registrar(data.id, "Proceso creado", {
          etapa_nueva: "definicion",
          detalle: { proveedor: form.proveedor, destino: form.tipo_destino },
        });
        setSeleccionadoId(data.id);
        setEtapaFiltro("todas");
      }

      setShowAdd(false);
      setEditandoId(null);
      setForm({ ...EMPTY_FORM });
      await cargar();
      if (advertenciaGuardado) setError(advertenciaGuardado);
    } catch (e) {
      setError(e?.message || "No se pudo guardar el proceso.");
    } finally {
      setSaving(false);
    }
  }

  async function eliminarProceso(lote) {
    const incluyeOt = Boolean(lote.enchapado_ot_id);
    const ok = await confirmar({
      title: `¿Eliminar “${nombreMuebles(lote)}”?`,
      message: `Se borran el proceso, su historial y sus OT internas${incluyeOt ? ", y también la OT de enchapado vinculada" : ""}. ${destinoLote(lote) === "obra" ? `La obra ${nombreObra(lote)} y su checklist de recepción no se eliminan.` : ""}`.trim(),
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;

    setEliminandoId(lote.id);
    setError("");
    try {
      if (lote.enchapado_ot_id) {
        const { error: otError } = await supabase
          .from("enchapado_ots")
          .delete()
          .eq("id", lote.enchapado_ot_id);
        if (otError) throw otError;
      }
      const { error: deleteError } = await supabase
        .from("prod_muebles_lotes")
        .delete()
        .eq("id", lote.id);
      if (deleteError) throw deleteError;

      setLotes((prev) => prev.filter((item) => item.id !== lote.id));
      setOts((prev) => prev.filter((item) => item.id !== lote.enchapado_ot_id));
      setSeleccionadoId(null);
      setDetalleMovil(false);
    } catch (e) {
      await cargar();
      setError(e?.message || "No se pudo eliminar el proceso.");
    } finally {
      setEliminandoId(null);
    }
  }

  function otParaLote(lote) {
    if (!lote) return null;
    return ots.find((ot) => ot.id === lote.enchapado_ot_id)
      ?? ots.find((ot) =>
        normalizeKey(ot.modelo) === normalizeKey(nombreLinea(lote))
        && normalizeKey(ot.barco) === normalizeKey(nombreObra(lote)))
      ?? null;
  }

  async function crearOtEnchapado(lote) {
    if (!lote?.unidad_id) {
      setError("La OT de preparación necesita una obra asignada.");
      return;
    }
    setCreandoOt(true);
    setError("");
    const modelo = nombreLinea(lote);
    const barco = nombreObra(lote);
    const { data: ot, error: otError } = await supabase.from("enchapado_ots").insert({
      modelo,
      barco,
      tipo_chapa: lote.color_chapa || lote.material_base || null,
      fecha: new Date().toISOString().slice(0, 10),
      responsable: profile?.username || profile?.nombre_completo || null,
      estado: "Pendiente",
    }).select().single();
    if (otError) {
      setError(otError.message);
      setCreandoOt(false);
      return;
    }
    const template = templateEnchapadoForModelo(modelo);
    if (template?.items?.length) {
      const { error: itemsError } = await supabase.from("enchapado_ot_items").insert(
        template.items.map((item) => ({
          ot_id: ot.id,
          item_id: item.id,
          chapas_descripcion: "",
        })),
      );
      if (itemsError) setError(`La OT se creó, pero no se cargaron sus ítems: ${itemsError.message}`);
    }
    await actualizarLote(lote, { enchapado_ot_id: ot.id }, "OT de preparación creada");
    setOts((prev) => [ot, ...prev]);
    setGestionOt(ot);
    setCreandoOt(false);
  }

  async function actualizarOtIntegrada(updatedOt) {
    setOts((prev) => prev.map((ot) => ot.id === updatedOt.id ? updatedOt : ot));
    const lote = lotes.find((item) => item.enchapado_ot_id === updatedOt.id)
      ?? lotes.find((item) =>
        normalizeKey(nombreLinea(item)) === normalizeKey(updatedOt.modelo)
        && normalizeKey(nombreObra(item)) === normalizeKey(updatedOt.barco));
    if (!lote) return;
    const patch = {
      enchapado_ot_id: updatedOt.id,
      enchapado_listo: updatedOt.estado === "Devuelta",
      herrajes_pedido: Boolean(updatedOt.herrajes_pedido),
      herrajes_enviado: Boolean(updatedOt.herrajes_enviado),
    };
    await actualizarLote(lote, patch, "OT de preparación actualizada");
  }

  async function marcarHerrajesPedidos(lote, ot) {
    await actualizarLote(lote, { herrajes_pedido: true }, "Herrajes enviados a Compras");
    if (ot) {
      await supabase.from("enchapado_ots").update({ herrajes_pedido: true }).eq("id", ot.id);
      setOts((prev) => prev.map((item) => item.id === ot.id ? { ...item, herrajes_pedido: true } : item));
    }
  }

  async function toggleHerrajesEnviados(lote, ot) {
    const next = !(lote.herrajes_enviado || ot?.herrajes_enviado);
    await actualizarLote(lote, { herrajes_enviado: next }, next ? "Herrajes enviados a Oberti" : "Envío de herrajes revertido");
    if (ot) {
      await supabase.from("enchapado_ots").update({ herrajes_enviado: next }).eq("id", ot.id);
      setOts((prev) => prev.map((item) => item.id === ot.id ? { ...item, herrajes_enviado: next } : item));
    }
  }

  const obraOptions = useMemo(() => {
    const unidadesLinea = form.linea_id
      ? unidades.filter((unidad) => unidad.linea_id === form.linea_id)
      : unidades;
    if (!form.linea_id) return unidadesLinea;

    const linea = lineas.find((item) => item.id === form.linea_id);
    if (!linea) return unidadesLinea;

    const codigosExistentes = new Set(unidadesLinea.map((unidad) => normalizeKey(unidad.codigo)));
    const pendientesDeVincular = obrasProduccion
      .filter((obra) => normalizeKey(obra.linea_nombre) === normalizeKey(linea.nombre))
      .filter((obra) => !codigosExistentes.has(normalizeKey(obra.codigo)))
      .map((obra) => ({
        id: `produccion:${obra.id}`,
        codigo: obra.codigo,
        linea_id: linea.id,
        linea_nombre: obra.linea_nombre,
        pendienteVincular: true,
      }));

    return [...unidadesLinea, ...pendientesDeVincular]
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  }, [form.linea_id, lineas, obrasProduccion, unidades]);

  async function seleccionarObra(value) {
    const opcion = obraOptions.find((item) => item.id === value);
    if (!opcion) {
      setForm((prev) => ({ ...prev, unidad_id: "" }));
      return;
    }
    if (!opcion.pendienteVincular) {
      setForm((prev) => ({ ...prev, unidad_id: opcion.id, linea_id: opcion.linea_id || prev.linea_id }));
      return;
    }
    if (!onEnsureMueblesUnidad) {
      setError("La obra existe en Producción, pero no se pudo vincular con Muebles.");
      return;
    }

    setVinculandoObra(true);
    setError("");
    try {
      const vinculada = await onEnsureMueblesUnidad({
        modelo: opcion.linea_nombre,
        barco: opcion.codigo,
      });
      if (!vinculada?.unidad?.id || !vinculada?.linea?.id) {
        throw new Error("No se recibió la vinculación de la obra.");
      }
      const unidad = { ...vinculada.unidad, linea_id: vinculada.linea.id };
      setUnidades((prev) => prev.some((item) => item.id === unidad.id)
        ? prev.map((item) => item.id === unidad.id ? { ...item, ...unidad } : item)
        : [...prev, unidad]);
      setForm((prev) => ({ ...prev, unidad_id: unidad.id, linea_id: unidad.linea_id }));
    } catch (e) {
      setError(e?.message || "No se pudo vincular la obra con Muebles.");
    } finally {
      setVinculandoObra(false);
    }
  }

  function elegirProceso(id) {
    setSeleccionadoId(id);
    setDetalleMovil(true);
  }

  function cerrarOt() {
    setGestionOt(null);
    setRefresco((n) => n + 1);
  }

  const enRecepcion = activos.filter((lote) => etapaMeta(lote).etapa.key === "recibido").length;
  const templateLinea = lineas.find((linea) => linea.id === templateLineaId) ?? lineas[0] ?? null;
  const cuentaProveedor = (item) => activos.filter((lote) => (item === "Todos" || lote.proveedor === item)
    && (destino === "Todos" || destinoLote(lote) === destino)).length;

  return (
    <div className={`mbl-tab${detalleMovil ? " en-detalle" : ""}`} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <header className="mbl-barra">
        <div className="mbl-barra-fila">
          <div className="mbl-titulos">
            <div className="mbl-eyebrow">Muebles · Fabricación</div>
            <h1 className="mbl-h1">Seguimiento de <span className="acento">fabricación</span></h1>
            <p className="mbl-sub">
              {loading
                ? "Leyendo procesos…"
                : <><b className="mono">{activos.length}</b> {activos.length === 1 ? "proceso activo" : "procesos activos"}{enRecepcion > 0 && <> · <b className="mono">{enRecepcion}</b> en recepción</>}</>}
            </p>
          </div>
          {esAdmin && (
            <div className="mbl-acciones">
              <button type="button" className="ui-btn ui-btn-fantasma mbl-solo-escritorio" onClick={() => { setTemplateLineaId(seleccionado?.linea_id || lineas[0]?.id || ""); setShowTemplates(true); }}>
                <FilePenLine size={15} /> Plantillas OT y herrajes
              </button>
              <button type="button" data-tour="muebles-nuevo" className="ui-btn ui-btn-primario" onClick={abrirNuevoProceso}>
                <Plus size={15} /> Nuevos muebles
              </button>
            </div>
          )}
        </div>

        <div className="mbl-filtros">
          <div className="mbl-seg" role="group" aria-label="Mueblero">
            {["Todos", ...PROVEEDORES_MUEBLES].map((item) => (
              <button key={item} type="button" className={proveedor === item ? "on" : ""} onClick={() => setProveedor(item)}>
                {item} <span className="n">{cuentaProveedor(item)}</span>
              </button>
            ))}
          </div>
          <div className="mbl-seg" role="group" aria-label="Destino">
            {[["Todos", "Todos"], ["obra", "Obras"], ["stock", "Stock"]].map(([value, text]) => (
              <button key={value} type="button" className={destino === value ? "on" : ""} onClick={() => setDestino(value)}>{text}</button>
            ))}
          </div>
          <div className="mbl-sp" />
          <label className="mbl-buscar">
            <Search size={15} />
            <input className="ui-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Obra, línea, chapa…" aria-label="Buscar procesos" />
          </label>
        </div>

        <div data-tour="muebles-resumen" className="mbl-scroll-x" style={{ marginTop: 10 }}>
          <button type="button" className={`mbl-chip${etapaFiltro === "todas" ? " on" : ""}`} onClick={() => setEtapaFiltro("todas")}>
            Todas las etapas <span className="n">{base.length}</span>
          </button>
          {porEtapa.map(({ key, n }) => (
            <button
              key={key}
              type="button"
              className={`mbl-chip${etapaFiltro === key ? " on" : ""}`}
              data-tono={key === "recibido" ? "cian" : key === "definicion" ? "neutro" : "azul"}
              onClick={() => setEtapaFiltro(etapaFiltro === key ? "todas" : key)}
            >
              <span className="pto" /> {etiquetaEtapa(key)} <span className="n">{n}</span>
            </button>
          ))}
        </div>
      </header>

      {error && !showAdd && (
        <div style={{ padding: "0 24px 12px" }}>
          <Aviso onCerrar={() => setError("")}>{error}</Aviso>
        </div>
      )}

      {loading ? (
        <Cargando llenar texto="Cargando procesos…" />
      ) : filtrados.length === 0 ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: "1px solid var(--border)" }}>
          <Vacio
            icono={Factory}
            titulo={activos.length ? "No hay procesos con estos filtros" : "Todavía no hay procesos de muebles"}
            texto={activos.length ? "Probá con otro mueblero, destino o etapa." : "Creá un proceso para una obra o para stock y seguí su recorrido hasta la recepción."}
          >
            {activos.length > 0 ? (
              <button type="button" className="ui-btn" onClick={() => { setProveedor("Todos"); setDestino("Todos"); setEtapaFiltro("todas"); setQ(""); }}>Quitar filtros</button>
            ) : esAdmin && (
              <button type="button" className="ui-btn ui-btn-primario" onClick={abrirNuevoProceso}><Plus size={15} /> Nuevos muebles</button>
            )}
          </Vacio>
        </div>
      ) : (
        <div className={`mbl-dos${detalleMovil ? " con-detalle" : ""}`}>
          <div className="mbl-lista" data-tour="muebles-procesos">
            {filtrados.map((lote, idx) => (
              <ItemProceso
                key={lote.id}
                lote={lote}
                indice={idx}
                selected={seleccionado?.id === lote.id}
                chapa={otParaLote(lote)?.tipo_chapa || lote.color_chapa || lote.material_base}
                recepcion={recepcionMeta(lote, checklistRecepcion)}
                onClick={() => elegirProceso(lote.id)}
              />
            ))}
          </div>

          <div className="mbl-detalle">
            {seleccionado && meta && (
              <div className="mbl-panel" key={seleccionado.id}>
                <button type="button" className="mbl-volver-movil" onClick={() => setDetalleMovil(false)}>
                  <ChevronLeft size={18} /> Procesos
                </button>

                <div className="mbl-cab">
                  <div className="mbl-cab-sw">
                    {selectedChapa ? <ChapaSwatch tipo={selectedChapa} size="lg" /> : <Layers3 size={22} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mbl-cab-tags">
                      <Tag tono={TONO_PROVEEDOR[seleccionado.proveedor] || "teal"} icono={Factory}>{seleccionado.proveedor}</Tag>
                      <Tag tono={destinoLote(seleccionado) === "stock" ? "verde" : "neutro"}>
                        {destinoLote(seleccionado) === "stock" ? "Para stock" : `Obra ${nombreObra(seleccionado)}`}
                      </Tag>
                      {seleccionado.fecha_objetivo && <Tag tono="azul">Objetivo {fechaCorta(seleccionado.fecha_objetivo)}</Tag>}
                    </div>
                    <h2 className="mbl-cab-tit">{nombreMuebles(seleccionado)}</h2>
                    <div className="mbl-cab-sub">Línea {nombreLinea(seleccionado)} · {cantidadMuebles(seleccionado)}</div>
                  </div>
                  {esAdmin && (
                    <div className="mbl-cab-acc">
                      <button type="button" className="ui-btn chico" onClick={() => abrirEditarProceso(seleccionado)}>
                        <FilePenLine size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        className="mbl-btn-ic peligro"
                        disabled={eliminandoId === seleccionado.id}
                        onClick={() => eliminarProceso(seleccionado)}
                        aria-label="Eliminar proceso"
                        title="Eliminar proceso"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <section className="mbl-bloque" data-tour="muebles-recorrido" style={{ "--i": 1 }}>
                  <div className="mbl-bloque-cab">
                    <h3>Recorrido {seleccionado.proveedor}</h3>
                    <div className="der">
                      <span className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>{meta.index + 1}/{meta.flujo.length}</span>
                      <Mini pct={meta.progreso} style={{ width: 80 }} />
                    </div>
                  </div>
                  <div className="mbl-ruta" ref={rutaRef}>
                    {meta.flujo.map((etapa, index) => {
                      const hecho = index < meta.index;
                      const actual = index === meta.index;
                      return (
                        <button
                          key={etapa.key}
                          type="button"
                          className={`mbl-paso${hecho ? " hecho" : ""}${actual ? " actual" : ""}`}
                          disabled={!esAdmin || actual}
                          onClick={() => moverAEtapa(seleccionado, index)}
                          title={actual ? "Etapa actual" : esAdmin ? `Cambiar a ${etapa.label}` : etapa.short}
                          aria-current={actual ? "step" : undefined}
                        >
                          <span className="mbl-paso-nodo">{hecho ? <Check size={14} strokeWidth={3} /> : index + 1}</span>
                          <span className="mbl-paso-et">{etapa.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {esAdmin && <p className="mbl-bloque-txt" style={{ marginTop: 6 }}>Tocá cualquier etapa para corregirla. Si queda algo pendiente, te avisamos antes de guardar.</p>}
                </section>

                <BloqueAhora
                  lote={seleccionado}
                  meta={meta}
                  esAdmin={esAdmin}
                  faltan={faltan}
                  recepcion={selectedRecepcion}
                  onAvanzar={() => mover(seleccionado, 1)}
                  onVolver={() => mover(seleccionado, -1)}
                  onAbrirRecepcion={() => onOpenChecklist?.(seleccionado)}
                  onToggleRecepcion={() => actualizarLote(
                    seleccionado,
                    { recepcion_estado: selectedRecepcion?.estado === "completa" ? "parcial" : "completa" },
                    selectedRecepcion?.estado === "completa" ? "Recepción reabierta" : "Recepción completada",
                  )}
                />

                {seleccionado.proveedor === "Oberti" && (
                  <section className="mbl-bloque" data-tour="muebles-enchapado-herrajes" style={{ "--i": 3 }}>
                    <div className="mbl-bloque-cab">
                      <h3>OT y herrajes</h3>
                      <span className="der" style={{ fontSize: 12, color: "var(--dim)" }}>
                        {meta.index >= meta.flujo.findIndex((etapa) => etapa.key === "preparacion_banco")
                          ? "Banco recibe la OT completa; Enchapadora y Oberti, sólo su parte."
                          : "Se pueden adelantar: el momento recomendado es la preparación en Banco."}
                      </span>
                    </div>
                    <div className="mbl-filas">
                      <MueblesOrdenesTrabajoPanel
                        key={seleccionado.id}
                        loteId={seleccionado.id}
                        lineaId={seleccionado.linea_id}
                        obraCodigo={nombreObra(seleccionado)}
                        modelo={nombreLinea(seleccionado)}
                        canEdit={esAdmin}
                      />

                      <div className="mbl-fila" data-tour="muebles-preparacion">
                        <span className="mbl-fila-ic" data-tono="azul"><Hammer size={16} /></span>
                        <div style={{ minWidth: 0 }}>
                          <div className="mbl-fila-tit">OT de preparación · Banco → Enchapadora</div>
                          <div className="mbl-fila-txt">
                            {selectedOt
                              ? [
                                chapas ? `Hojas de chapa cargadas: ${chapas.cargadas} de ${chapas.total}` : null,
                                plantillaOt?.tablones ? (selectedOt.tablones_enviado ? "aviso de tablones enviado a Oberti" : "falta avisar los tablones a Oberti") : null,
                              ].filter(Boolean).join(" · ") || "Digitalizá las chapas, imprimí para la Enchapadora y avisá los tablones a Oberti."
                              : "Creala para entregársela al carpintero de banco antes de empezar la preparación."}
                          </div>
                          <div className="mbl-tareas">
                            {OBERTI_TASKS.map(([key, text]) => (
                              <Tarea
                                key={key}
                                hecha={seleccionado[key]}
                                disabled={!esAdmin}
                                onClick={() => actualizarLote(seleccionado, { [key]: !seleccionado[key] }, text)}
                              >
                                {text}
                              </Tarea>
                            ))}
                          </div>
                          {esAdmin && (
                            <div className="mbl-fila-acc">
                              {selectedOt ? (
                                <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setGestionOt(selectedOt)}>
                                  Abrir OT: chapas e impresión <ArrowRight size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-suave chico"
                                  disabled={creandoOt || !seleccionado.unidad_id}
                                  title={seleccionado.unidad_id ? "" : "La OT necesita una obra asignada"}
                                  onClick={() => crearOtEnchapado(seleccionado)}
                                >
                                  <Plus size={14} /> {creandoOt ? "Creando OT…" : "Crear OT de preparación"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mbl-fila-der">
                          {selectedOt
                            ? <Estado tono={selectedOt.estado === "Devuelta" ? "verde" : selectedOt.estado === "Rehacer" ? "rojo" : selectedOt.estado === "Enviada" ? "azul" : "neutro"}>{selectedOt.estado}</Estado>
                            : <Estado tono="neutro">Sin crear</Estado>}
                        </div>
                      </div>

                      <div className="mbl-fila">
                        <span className="mbl-fila-ic" data-tono="violeta"><PackagePlus size={16} /></span>
                        <div style={{ minWidth: 0 }}>
                          <div className="mbl-fila-tit">Kit de herrajes para Oberti</div>
                          <div className="mbl-fila-txt">
                            {selectedHerrajes.length
                              ? selectedCompraHerrajes
                                ? `${selectedHerrajes.length} ítems · Compras: ${selectedCompraHerrajes.status}`
                                : `${selectedHerrajes.length} ítems definidos para ${nombreLinea(seleccionado)}`
                              : `No hay un kit cargado para ${nombreLinea(seleccionado)}.`}
                          </div>
                          {selectedHerrajes.length > 0 && (esAdmin || selectedCompraHerrajes) && (
                            <div className="mbl-fila-acc">
                              {esAdmin && !herrajesPedidos && (
                                <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => setPedidoHerrajes({ lote: seleccionado, ot: selectedOt, items: selectedHerrajes })}>
                                  <ShoppingCart size={14} /> Enviar pedido a Compras
                                </button>
                              )}
                              {esAdmin && herrajesPedidos && (
                                <button
                                  type="button"
                                  className={`ui-btn chico${herrajesEnviados ? " ui-btn-fantasma" : ""}`}
                                  disabled={!herrajesEnviados && selectedCompraHerrajes?.status !== "recibido"}
                                  title={!herrajesEnviados && selectedCompraHerrajes?.status !== "recibido" ? "Compras debe marcar el pedido como recibido antes del envío a Oberti." : ""}
                                  onClick={() => toggleHerrajesEnviados(seleccionado, selectedOt)}
                                >
                                  {herrajesEnviados
                                    ? "Revertir envío"
                                    : selectedCompraHerrajes?.status === "recibido"
                                      ? <><Check size={14} /> Marcar enviados a Oberti</>
                                      : `Compras: ${selectedCompraHerrajes?.status || "sin vincular"}`}
                                </button>
                              )}
                              {selectedCompraHerrajes && (
                                <a className="ui-btn ui-btn-fantasma chico" href={`/compras?open=${selectedCompraHerrajes.id}`}>Abrir pedido en Compras</a>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="mbl-fila-der">
                          <Estado tono={herrajesEnviados ? "verde" : herrajesPedidos ? "azul" : "neutro"}>
                            {herrajesEnviados ? "Enviado a Oberti" : herrajesPedidos ? "Pedido a Compras" : "Pendiente"}
                          </Estado>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section className="mbl-bloque" style={{ "--i": 4 }}>
                  <div className="mbl-bloque-cab"><h3>Datos de los muebles</h3></div>
                  <div className="mbl-datos">
                    <div>
                      <div className="mbl-dato-et">Chapa</div>
                      {selectedChapa ? <ChapaSwatch tipo={selectedChapa} size="sm" label /> : <div className="mbl-dato-v vacio">Pendiente de definición</div>}
                    </div>
                    <div>
                      <div className="mbl-dato-et">Material base</div>
                      <div className={`mbl-dato-v${seleccionado.material_base ? "" : " vacio"}`}>{seleccionado.material_base || "Estándar de línea"}</div>
                    </div>
                    <div>
                      <div className="mbl-dato-et">Madera especial</div>
                      <div className={`mbl-dato-v${seleccionado.detalle_madera ? "" : " vacio"}`}>{seleccionado.detalle_madera || "Sin dependencia especial"}</div>
                    </div>
                  </div>
                  {seleccionado.observaciones && <div className="mbl-obs">{seleccionado.observaciones}</div>}
                </section>

                <section className="mbl-bloque" style={{ "--i": 5 }}>
                  <div className="mbl-bloque-cab"><h3>Últimos movimientos</h3><History size={14} className="der" style={{ color: "var(--subtle)" }} /></div>
                  {!filasHistorial ? (
                    <Cargando compacto texto="Leyendo historial…" />
                  ) : filasHistorial.length === 0 ? (
                    <p className="mbl-bloque-txt">Sin movimientos registrados.</p>
                  ) : (
                    <div className="mbl-hist">
                      {filasHistorial.map((fila) => (
                        <div key={fila.id} className="mbl-hist-item" data-tono={tonoHistorial(fila.accion)}>
                          <span className="mbl-hist-pto" />
                          <div style={{ minWidth: 0 }}>
                            <div className="mbl-hist-acc">{fila.accion}</div>
                            {fila.quien && <div className="mbl-hist-quien">{fila.quien}</div>}
                          </div>
                          <span className="mbl-hist-fecha">{fechaHora(fila.creado_el)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmación para saltear pasos. No es un error: es una advertencia con
          la lista de lo que falta, y la decisión queda del lado de la persona. */}
      {avisoSalto && (
        <Modal
          onCerrar={() => setAvisoSalto(null)}
          icono={AlertTriangle}
          tono="violeta"
          titulo={`Cambiar a ${avisoSalto.target.label}`}
          sub="Revisá lo que queda abierto antes de actualizar el proceso."
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={() => setAvisoSalto(null)}>Volver</button>
              <button type="button" className="ui-btn ui-btn-primario" onClick={confirmarSalto}>Cambiar de etapa igual</button>
            </>
          )}
        >
          {avisoSalto.etapasOmitidas?.length > 0 && (
            <Aviso tono="azul"><b>Etapas que se omiten:</b> {avisoSalto.etapasOmitidas.join(" · ")}</Aviso>
          )}
          {avisoSalto.faltan.length > 0 && (
            <ul className="mbl-lista-puntos">
              {avisoSalto.faltan.map((motivo, i) => <li key={i}>{motivo}</li>)}
            </ul>
          )}
          <p className="mbl-bloque-txt">Podés continuar igual. La etapa elegida, las omisiones y los pendientes quedan registrados en el historial.</p>
        </Modal>
      )}

      {showAdd && (
        <Modal
          ancho
          onCerrar={cerrarFormulario}
          bloqueado={saving || vinculandoObra}
          icono={editandoId ? FilePenLine : Plus}
          titulo={editandoId ? "Editar proceso de muebles" : "Nuevo proceso de muebles"}
          sub={editandoId ? "Corregí la obra, el proveedor y los datos del proceso." : "Definí quién lo fabrica y si nace para una obra o para stock."}
          pie={(
            <>
              <button type="button" className="ui-btn" onClick={cerrarFormulario} disabled={saving || vinculandoObra}>Cancelar</button>
              <button type="button" className="ui-btn ui-btn-primario" disabled={saving || vinculandoObra} onClick={guardarLote}>
                {saving ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear proceso"}
              </button>
            </>
          )}
        >
          {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}
          <div className="mbl-form tres">
            <label className="mbl-campo"><span>Destino</span>
              <select className="ui-input" value={form.tipo_destino} onChange={(e) => setForm({ ...form, tipo_destino: e.target.value, unidad_id: "" })}>
                <option value="obra">Obra específica</option>
                <option value="stock">Fabricar para stock</option>
              </select>
            </label>
            <label className="mbl-campo"><span>Mueblero</span>
              <select className="ui-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>
                {PROVEEDORES_MUEBLES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="mbl-campo"><span>Línea</span>
              <select className="ui-input" value={form.linea_id} onChange={(e) => setForm({ ...form, linea_id: e.target.value, unidad_id: "" })}>
                <option value="">Seleccionar línea</option>
                {lineas.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            {form.tipo_destino === "obra" && (
              <label className="mbl-campo"><span>Obra</span>
                <select className="ui-input" value={form.unidad_id} disabled={vinculandoObra} onChange={(e) => seleccionarObra(e.target.value)}>
                  <option value="">{vinculandoObra ? "Vinculando obra…" : "Seleccionar obra"}</option>
                  {obraOptions.map((item) => <option key={item.id} value={item.id}>{item.codigo}</option>)}
                </select>
              </label>
            )}
            <label className="mbl-campo"><span>Nombre interno</span>
              <input className="ui-input" value={form.nombre_lote} onChange={(e) => setForm({ ...form, nombre_lote: e.target.value })} placeholder="Ej: Muebles principales K37" />
            </label>
            <label className="mbl-campo"><span>Conjuntos de muebles</span>
              <input className="ui-input" type="number" min="1" value={form.cantidad_juegos} onChange={(e) => setForm({ ...form, cantidad_juegos: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label className="mbl-campo"><span>Color / chapa</span>
              <input className="ui-input" value={form.color_chapa} onChange={(e) => setForm({ ...form, color_chapa: e.target.value })} placeholder="Ej: Roble plata" />
            </label>
            <label className="mbl-campo"><span>Material base</span>
              <input className="ui-input" value={form.material_base} onChange={(e) => setForm({ ...form, material_base: e.target.value })} placeholder="Ej: estándar de línea" />
            </label>
            <label className="mbl-campo"><span>Nogal / roble / detalle</span>
              <input className="ui-input" value={form.detalle_madera} onChange={(e) => setForm({ ...form, detalle_madera: e.target.value })} placeholder="Opcional" />
            </label>
            <label className="mbl-campo"><span>Fecha objetivo</span>
              <input className="ui-input" type="date" value={form.fecha_objetivo} onChange={(e) => setForm({ ...form, fecha_objetivo: e.target.value })} />
            </label>
            <label className="mbl-campo ancho"><span>Observaciones</span>
              <textarea className="ui-input" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Dependencias, alcance de los muebles o acuerdos con el proveedor…" />
            </label>
          </div>
        </Modal>
      )}

      {gestionOt && (
        <div className="mbl-capa">
          <OTDetail
            ot={gestionOt}
            esAdmin={esAdmin}
            onBack={cerrarOt}
            onEnsureMueblesUnidad={onEnsureMueblesUnidad}
            onUpdated={(updated) => {
              setGestionOt(updated);
              actualizarOtIntegrada(updated);
            }}
            onDeleted={(otId) => {
              setOts((prev) => prev.filter((ot) => ot.id !== otId));
              setLotes((prev) => prev.map((lote) => lote.enchapado_ot_id === otId ? { ...lote, enchapado_ot_id: null, enchapado_listo: false } : lote));
              cerrarOt();
            }}
          />
        </div>
      )}

      <MueblesOrdenesTrabajoPanel
        templateOnly
        externalOpen={showTemplates}
        onExternalClose={() => setShowTemplates(false)}
        lineaId={templateLinea?.id || ""}
        modelo={templateLinea?.nombre || ""}
        canEdit={esAdmin}
        lineOptions={lineas}
        onLineChange={setTemplateLineaId}
      />

      <PedirAComprasModal
        open={Boolean(pedidoHerrajes)}
        profile={profile}
        origen="muebles"
        onClose={async (created) => {
          const current = pedidoHerrajes;
          setPedidoHerrajes(null);
          if (created && current) {
            await marcarHerrajesPedidos(current.lote, current.ot);
            await cargar();
          }
        }}
        prefilled={pedidoHerrajes ? {
          title: `Herrajes ${nombreLinea(pedidoHerrajes.lote)} · Obra ${nombreObra(pedidoHerrajes.lote)}`,
          description: `Kit de herrajes para muebles fabricados por Oberti. Enviar el kit completo a Oberti una vez recibido.`,
          priority: "alta",
          tipo_pedido: "estandar",
          source: "muebles_herrajes",
          source_ref: pedidoHerrajes.ot?.id || pedidoHerrajes.lote.id,
          source_url: "/muebles",
          defaultDestination: `Obra ${nombreObra(pedidoHerrajes.lote)}`,
          items: pedidoHerrajes.items.map((item) => ({
            description: item.name,
            quantity: String(item.q ?? ""),
            unit: "unidad",
            destination: `Obra ${nombreObra(pedidoHerrajes.lote)}`,
            notes: `Kit de herrajes ${nombreLinea(pedidoHerrajes.lote)} · entregar a Oberti`,
          })),
        } : null}
      />
    </div>
  );
}

function ItemProceso({ lote, indice, selected, chapa, recepcion, onClick }) {
  const meta = etapaMeta(lote);
  const stock = destinoLote(lote) === "stock";
  return (
    <button type="button" className={`mbl-item${selected ? " on" : ""}`} style={{ "--i": Math.min(indice, 12) }} onClick={onClick} aria-current={selected ? "true" : undefined}>
      <span className="mbl-item-sw">{chapa ? <ChapaSwatch tipo={chapa} size="md" /> : <Layers3 size={17} />}</span>
      <span style={{ minWidth: 0, display: "block" }}>
        <span className="mbl-item-l1">
          <Tag tono={TONO_PROVEEDOR[lote.proveedor] || "teal"}>{lote.proveedor}</Tag>
          <Tag tono={stock ? "verde" : "neutro"}>{stock ? "Stock" : nombreObra(lote)}</Tag>
        </span>
        <span className="mbl-item-nom" style={{ display: "block" }}>{nombreMuebles(lote)}</span>
        <span className="mbl-item-sub" style={{ display: "block" }}>Línea {nombreLinea(lote)} · {chapa || "Chapa por definir"}</span>
        <span className="mbl-item-av">
          <span style={{ minWidth: 0, display: "grid", gap: 5 }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {recepcion ? `Recepción ${recepcion.estado} · ${recepcion.completos}/${recepcion.total}` : meta.etapa.label}
            </span>
            <Mini pct={recepcion ? recepcion.pct : meta.progreso} />
          </span>
          <span className="mono">{meta.index + 1}/{meta.flujo.length}</span>
        </span>
      </span>
      <ChevronRight size={16} className="mbl-item-flecha" />
    </button>
  );
}

// La etapa actual en grande: qué hay que hacer, qué falta y cómo avanzar.
function BloqueAhora({ lote, meta, esAdmin, faltan, recepcion, onAvanzar, onVolver, onAbrirRecepcion, onToggleRecepcion }) {
  const enRecepcion = meta.etapa.key === "recibido";
  return (
    <section className="mbl-ahora">
      <div className="mbl-ahora-eyebrow">Ahora · etapa {meta.index + 1} de {meta.flujo.length}</div>
      <div className="mbl-ahora-tit">{enRecepcion ? `Recepción ${recepcion?.estado || "parcial"}` : meta.etapa.label}</div>
      <div className="mbl-ahora-txt">{meta.etapa.short}.</div>

      <div className="mbl-ahora-cuerpo">
        {enRecepcion && recepcion && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-.03em" }}>{recepcion.pct}%</span>
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>
                {recepcion.total
                  ? `${recepcion.completos} de ${recepcion.total} muebles recibidos completos${recepcion.parciales ? ` · ${recepcion.parciales} parciales` : ""}`
                  : "Los muebles empezaron a llegar. Falta controlar los ítems en el checklist."}
              </span>
            </div>
            <Mini pct={recepcion.pct} />
          </div>
        )}
        {!enRecepcion && meta.siguiente && faltan && (
          faltan.length ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 7 }}>Falta para avanzar:</div>
              <ul className="mbl-lista-puntos">
                {faltan.map((motivo, i) => <li key={i}>{motivo}</li>)}
              </ul>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--green)", fontWeight: 600 }}>
              <Check size={16} strokeWidth={2.6} /> Todo listo para avanzar a la etapa siguiente.
            </div>
          )
        )}
      </div>

      <div className="mbl-ahora-acc">
        {enRecepcion && destinoLote(lote) === "obra" && (
          <button type="button" className="ui-btn ui-btn-primario" onClick={onAbrirRecepcion}>
            <ClipboardCheck size={15} /> Abrir recepción
          </button>
        )}
        {enRecepcion && esAdmin && recepcion?.total === 0 && (
          <button type="button" className="ui-btn" onClick={onToggleRecepcion}>
            {recepcion.estado === "completa" ? "Volver a recepción parcial" : "Marcar recepción completa"}
          </button>
        )}
        {esAdmin && meta.siguiente && (
          <button type="button" className="ui-btn ui-btn-primario" onClick={onAvanzar}>
            Avanzar: {meta.siguiente.label} <ArrowRight size={15} />
          </button>
        )}
        {esAdmin && meta.anterior && (
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={onVolver}>
            <ArrowLeft size={15} /> Volver: {meta.anterior.label}
          </button>
        )}
      </div>
    </section>
  );
}
