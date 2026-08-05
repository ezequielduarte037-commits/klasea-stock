import { createElement, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FilePenLine,
  Layers3,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
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
  nombreLinea,
  nombreMuebles,
  nombreObra,
  PROVEEDORES_MUEBLES,
} from "../mueblesProduccion";

const input = {
  width: "100%",
  minHeight: 38,
  padding: "8px 11px",
  borderRadius: 9,
  border: `1px solid ${C.b0}`,
  background: C.s0,
  color: C.t0,
  font: `500 13px ${C.sans}`,
  outline: "none",
};

const label = {
  display: "block",
  marginBottom: 6,
  color: C.t2,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: "uppercase",
};

const OBERTI_TASKS = [
  ["tablones_preparados", "Banco: tablones preparados"],
  ["chapas_preparadas", "Banco: preparación de chapas completada"],
  ["medidas_adjuntas", "Oficina Técnica: OT de chapas digitalizada"],
];

// Paleta de la pantalla. El ámbar hacía doble trabajo —marcaba al proveedor
// Oberti Y el estado "parcial"— y además chillaba de más. Ahora cada cosa tiene
// su color y ninguno es amarillo:
//   · proveedor  → teal (Oberti) / violeta (Morph)
//   · estado     → azul (en curso o parcial) / verde (completo) / gris (sin arrancar)
const TONO_OBERTI = { color: C.teal, bg: C.tealL, border: C.tealB };
const TONO_MORPH = { color: C.violet, bg: C.violetL, border: C.violetB };

function proveedorTone(proveedor) {
  return proveedor === "Morph" ? TONO_MORPH : TONO_OBERTI;
}

function Badge({ children, color = C.t1, bg = C.s1, border = C.b0 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 7, border: `1px solid ${border}`, background: bg, color, fontSize: 10, lineHeight: 1, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function Kpi({ icon, value, label: text, tone = C.blue }) {
  return (
    <div style={{ minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s0, display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ width: 29, height: 29, borderRadius: 8, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone, flexShrink: 0 }}>
        {createElement(icon, { size: 15 })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.t0, fontSize: 16, lineHeight: 1, fontWeight: 850 }}>{value}</div>
        <div style={{ color: C.t2, fontSize: 10, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd, canAdd }) {
  return (
    <div style={{ padding: "70px 20px", border: `1px dashed ${C.b1}`, borderRadius: 14, textAlign: "center", background: C.s0 }}>
      <Factory size={28} color={C.t2} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 750, color: C.t0 }}>No hay procesos con estos filtros</div>
      <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>Creá un proceso para una obra o para stock y seguí su recorrido.</div>
      {canAdd && <button onClick={onAdd} style={{ marginTop: 16, padding: "8px 13px", borderRadius: 9, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 750 }}>Crear proceso</button>}
    </div>
  );
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

export default function ProduccionTab({ esAdmin, profile, onOpenChecklist, onEnsureMueblesUnidad }) {
  const [lotes, setLotes] = useState([]);
  const [ots, setOts] = useState([]);
  const [comprasHerrajes, setComprasHerrajes] = useState([]);
  const [checklistRecepcion, setChecklistRecepcion] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // { lote, target, faltan[] } — lo que hay que confirmar antes de saltear pasos.
  const [avisoSalto, setAvisoSalto] = useState(null);
  const [q, setQ] = useState("");
  const [proveedor, setProveedor] = useState("Todos");
  const [destino, setDestino] = useState("Todos");
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gestionOt, setGestionOt] = useState(null);
  const [creandoOt, setCreandoOt] = useState(false);
  const [pedidoHerrajes, setPedidoHerrajes] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateLineaId, setTemplateLineaId] = useState("");
  const [form, setForm] = useState({
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
  });

  async function cargar() {
    setLoading(true);
    setError("");
    const [lotesRes, lineasRes, unidadesRes, otsRes, comprasRes, checklistRes] = await Promise.all([
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
  const filtrados = useMemo(() => {
    const text = q.trim().toLowerCase();
    return activos.filter((lote) => {
      if (proveedor !== "Todos" && lote.proveedor !== proveedor) return false;
      if (destino !== "Todos" && destinoLote(lote) !== destino) return false;
      if (!text) return true;
      return `${nombreLinea(lote)} ${nombreObra(lote)} ${lote.nombre_lote || ""} ${lote.color_chapa || ""} ${lote.material_base || ""}`.toLowerCase().includes(text);
    });
  }, [activos, destino, proveedor, q]);

  const seleccionado = filtrados.find((lote) => lote.id === seleccionadoId) ?? filtrados[0] ?? null;
  const meta = seleccionado ? etapaMeta(seleccionado) : null;
  const selectedOt = seleccionado ? otParaLote(seleccionado) : null;
  const selectedHerrajes = seleccionado?.proveedor === "Oberti"
    ? (herrajesForModelo(nombreLinea(seleccionado)) ?? [])
    : [];
  const enchapadoStageIndex = meta?.flujo.findIndex((etapa) => etapa.key === "preparacion_banco") ?? -1;
  const enchapadoEnEtapaRecomendada = seleccionado?.proveedor === "Oberti"
    && enchapadoStageIndex >= 0
    && meta?.index >= enchapadoStageIndex;
  const selectedCompraHerrajes = seleccionado
    ? comprasHerrajes.find((request) =>
      request.source_ref === selectedOt?.id || request.source_ref === seleccionado.id)
    : null;
  const selectedRecepcion = seleccionado ? recepcionMeta(seleccionado, checklistRecepcion) : null;
  const selectedChapa = selectedOt?.tipo_chapa || seleccionado?.color_chapa || seleccionado?.material_base || "";

  async function registrar(loteId, accion, extra = {}) {
    const { data } = await supabase.auth.getUser();
    await supabase.from("prod_muebles_lotes_historial").insert({
      lote_id: loteId,
      accion,
      usuario_id: data?.user?.id ?? null,
      ...extra,
    });
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
    const faltan = [];
    if (lote.proveedor !== "Oberti") return faltan;

    if (current.etapa.key === "preparacion_banco") {
      if (!lote.tablones_preparados) faltan.push("Los tablones no están marcados como preparados.");
      if (!lote.chapas_preparadas) faltan.push("Las chapas no están marcadas como preparadas.");
      if (!lote.medidas_adjuntas) faltan.push("Faltan adjuntar las medidas.");

      const ot = otParaLote(lote);
      if (!ot) {
        faltan.push("No hay OT de chapas digitalizada.");
      } else {
        if (!["Enviada", "Devuelta"].includes(ot.estado)) {
          faltan.push("La OT de chapas todavía no figura como “Enviada”.");
        }
        const plantilla = templateEnchapadoForModelo(nombreLinea(lote));
        const { data: itemsOt, error: itemsOtError } = await supabase
          .from("enchapado_ot_items")
          .select("item_id,chapas_descripcion")
          .eq("ot_id", ot.id);
        if (itemsOtError) {
          faltan.push(`No se pudo verificar la digitalización de la OT: ${itemsOtError.message}`);
        } else if (plantilla?.items?.length) {
          const sinDigitalizar = plantilla.items.filter((itemPlantilla) =>
            !itemsOt?.find((item) => item.item_id === itemPlantilla.id)?.chapas_descripcion?.trim());
          if (sinDigitalizar.length) {
            faltan.push(`${sinDigitalizar.length} ${sinDigitalizar.length === 1 ? "ítem no tiene" : "ítems no tienen"} descripción de chapas cargada.`);
          }
        }
        if (plantilla?.tablones && !ot.tablones_enviado) {
          faltan.push("No se envió a Oberti el aviso con la OT de tablones.");
        }
      }
    }

    if (current.etapa.key === "enchapadora") {
      const ot = otParaLote(lote);
      if (!ot || ot.estado !== "Devuelta") {
        faltan.push("La OT no figura como “Devuelta” (material enchapado y de vuelta en el astillero).");
      }
      const kit = herrajesForModelo(nombreLinea(lote)) ?? [];
      if (kit.length && !(lote.herrajes_enviado || ot?.herrajes_enviado)) {
        faltan.push("Los herrajes no están marcados como enviados a Oberti.");
      }
    }

    return faltan;
  }

  async function moverAEtapa(lote, targetIndex) {
    const current = etapaMeta(lote);
    const target = current.flujo[targetIndex];
    if (!target || targetIndex === current.index) return;

    if (targetIndex > current.index) {
      const faltan = [];
      for (let index = current.index; index < targetIndex; index += 1) {
        const etapa = current.flujo[index];
        const pendientes = await pendientesParaAvanzar(lote, { ...current, etapa, index });
        pendientes.forEach((pendiente) => faltan.push(`${etapa.label}: ${pendiente}`));
      }
      const etapasOmitidas = current.flujo
        .slice(current.index + 1, targetIndex)
        .map((etapa) => etapa.label);

      if (faltan.length || etapasOmitidas.length) {
        // La realidad del taller no siempre entra en el orden del sistema. Se
        // informa qué queda abierto, pero la persona conserva la decisión.
        setAvisoSalto({ lote, target, targetIndex, faltan, etapasOmitidas });
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

  async function crearLote() {
    const unidad = unidades.find((item) => item.id === form.unidad_id);
    const lineaId = form.tipo_destino === "obra" ? unidad?.linea_id : form.linea_id;
    if (!lineaId || (form.tipo_destino === "obra" && !form.unidad_id)) {
      setError("Elegí una obra o una línea para continuar.");
      return;
    }
    setSaving(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      ...form,
      linea_id: lineaId,
      unidad_id: form.tipo_destino === "obra" ? form.unidad_id : null,
      nombre_lote: form.nombre_lote.trim() || null,
      color_chapa: form.color_chapa.trim() || null,
      material_base: form.material_base.trim() || null,
      detalle_madera: form.detalle_madera.trim() || null,
      observaciones: form.observaciones.trim() || null,
      fecha_objetivo: form.fecha_objetivo || null,
      etapa: "definicion",
      estado_proceso: "Definición",
      creado_por: userData?.user?.id ?? null,
      actualizado_por: userData?.user?.id ?? null,
    };
    const { data, error: insertError } = await supabase.from("prod_muebles_lotes").insert(payload).select("id").single();
    if (insertError) setError(insertError.message);
    else {
      await registrar(data.id, "Proceso creado", { etapa_nueva: "definicion", detalle: { proveedor: form.proveedor, destino: form.tipo_destino } });
      setShowAdd(false);
      setForm((prev) => ({ ...prev, unidad_id: "", linea_id: "", nombre_lote: "", color_chapa: "", material_base: "", detalle_madera: "", fecha_objetivo: "", observaciones: "" }));
      await cargar();
      setSeleccionadoId(data.id);
    }
    setSaving(false);
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

  const obraOptions = form.linea_id ? unidades.filter((u) => u.linea_id === form.linea_id) : unidades;
  const recibidos = lotes.filter((lote) => etapaMeta(lote).etapa.key === "recibido").length;
  const templateLinea = lineas.find((linea) => linea.id === templateLineaId) ?? lineas[0] ?? null;

  return (
    <div className="muebles-flow" style={{ maxWidth: 1520, margin: "0 auto", padding: "20px 22px 44px" }}>
      <style>{`
        .muebles-flow button, .muebles-flow input, .muebles-flow select, .muebles-flow textarea { font-family: ${C.sans}; }
        .muebles-flow button:focus-visible, .muebles-flow input:focus-visible, .muebles-flow select:focus-visible, .muebles-flow textarea:focus-visible { outline:2px solid ${C.blue}; outline-offset:2px; }
        .muebles-kpis { display:grid; grid-template-columns:repeat(5,minmax(118px,1fr)); gap:7px; }
        .muebles-workspace { display:grid; grid-template-columns:minmax(330px, .72fr) minmax(560px, 1.28fr); gap:12px; align-items:start; }
        .muebles-form-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
        .muebles-stage-scroll { overflow-x:auto; padding-bottom:4px; scrollbar-width:thin; }
        .muebles-stage-track { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(118px,1fr); min-width:max-content; gap:6px; }
        .muebles-process-card { transition:border-color .16s ease, transform .16s ease, box-shadow .16s ease, background .16s ease; }
        .muebles-process-card:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(0,0,0,.08); }
        @media(max-width:1180px){ .muebles-kpis{grid-template-columns:repeat(3,1fr)} .muebles-workspace{grid-template-columns:1fr} }
        @media(max-width:720px){ .muebles-flow{padding:14px 10px 36px!important}.muebles-kpis{grid-template-columns:repeat(2,1fr)}.muebles-form-grid{grid-template-columns:1fr}.muebles-toolbar{align-items:stretch!important}.muebles-toolbar>div{width:100%}.muebles-search{min-width:0!important;width:100%}.muebles-title-row{align-items:flex-start!important}.muebles-title-row h1{font-size:21px!important}.muebles-detail-meta{grid-template-columns:1fr!important}.muebles-detail-head{align-items:flex-start!important}.muebles-detail-head>div:first-child{align-items:flex-start!important} }
      `}</style>

      <div className="muebles-title-row" style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", gap: 7, alignItems: "center", color: C.t2, fontSize: 10, fontWeight: 850, letterSpacing: 1.3, textTransform: "uppercase" }}>
            <Factory size={14} /> Operación de muebles
          </div>
          <h1 style={{ margin: "5px 0 0", color: C.t0, fontSize: 25, letterSpacing: -0.7 }}>Seguimiento de fabricación</h1>
          <div style={{ marginTop: 4, color: C.t2, fontSize: 12 }}>Una vista operativa desde la definición de la chapa hasta la recepción.</div>
        </div>
        {esAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setTemplateLineaId(seleccionado?.linea_id || lineas[0]?.id || ""); setShowTemplates(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.tealB}`, background: C.tealL, color: C.teal, cursor: "pointer", fontSize: 11.5, fontWeight: 850, flexShrink: 0 }}>
              <FilePenLine size={15} /> Plantillas OT y herrajes
            </button>
            <button data-tour="muebles-nuevo" onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 9, border: `1px solid ${C.blue}`, background: C.blue, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 800, flexShrink: 0, boxShadow: "0 6px 18px color-mix(in srgb, var(--blue) 22%, transparent)" }}>
              <Plus size={15} /> Nuevos muebles
            </button>
          </div>
        )}
      </div>

      <div data-tour="muebles-resumen" className="muebles-kpis" style={{ marginBottom: 12 }}>
        <Kpi icon={Layers3} value={activos.length} label="procesos activos" />
        <Kpi icon={Factory} value={activos.filter((l) => l.proveedor === "Oberti").length} label="en Oberti" tone={C.teal} />
        <Kpi icon={Warehouse} value={activos.filter((l) => l.proveedor === "Morph").length} label="en Morph" tone={C.violet} />
        <Kpi icon={Truck} value={activos.filter((l) => etapaMeta(l).etapa.key.includes("transito") || etapaMeta(l).etapa.key.includes("flete")).length} label="en logística" tone={C.teal} />
        <Kpi icon={PackageCheck} value={recibidos} label="en recepción" tone={C.green} />
      </div>

      <div className="muebles-toolbar" style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, padding: "10px 11px", borderRadius: 11, border: `1px solid ${C.b0}`, background: C.s0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 13, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ ...label, marginBottom: 5 }}>Mueblero</div>
            <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 8, background: C.s1, border: `1px solid ${C.b0}` }}>
              {["Todos", ...PROVEEDORES_MUEBLES].map((item) => (
                <button key={item} onClick={() => setProveedor(item)} style={{ padding: "5px 9px", borderRadius: 6, border: `1px solid ${proveedor === item ? C.b1 : "transparent"}`, background: proveedor === item ? C.s0 : "transparent", color: proveedor === item ? C.t0 : C.t2, cursor: "pointer", fontSize: 10.5, fontWeight: 750 }}>{item}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ ...label, marginBottom: 5 }}>Destino</div>
            <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 8, background: C.s1, border: `1px solid ${C.b0}` }}>
              {[["Todos", "Todos"], ["obra", "Obras"], ["stock", "Stock"]].map(([value, text]) => (
                <button key={value} onClick={() => setDestino(value)} style={{ padding: "5px 9px", borderRadius: 6, border: `1px solid ${destino === value ? C.b1 : "transparent"}`, background: destino === value ? C.s0 : "transparent", color: destino === value ? C.t0 : C.t2, cursor: "pointer", fontSize: 10.5, fontWeight: 750 }}>{text}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="muebles-search" style={{ position: "relative", minWidth: 260 }}>
          <div style={{ ...label, marginBottom: 5 }}>Buscar</div>
          <Search size={14} style={{ position: "absolute", left: 10, bottom: 10, color: C.t2 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Obra, línea, chapa..." style={{ ...input, paddingLeft: 32, minHeight: 34 }} />
        </div>
      </div>

      {error && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: C.t2 }}>Cargando procesos...</div>
      ) : filtrados.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} canAdd={esAdmin} />
      ) : (
        <div className="muebles-workspace">
          <div data-tour="muebles-procesos" style={{ display: "grid", gap: 8 }}>
            {filtrados.map((lote) => {
              const itemMeta = etapaMeta(lote);
              const itemRecepcion = recepcionMeta(lote, checklistRecepcion);
              const tone = proveedorTone(lote.proveedor);
              const selected = seleccionado?.id === lote.id;
              const itemChapa = otParaLote(lote)?.tipo_chapa || lote.color_chapa || lote.material_base;
              return (
                <button className="muebles-process-card" key={lote.id} onClick={() => setSeleccionadoId(lote.id)} style={{ width: "100%", padding: 0, borderRadius: 12, border: `1px solid ${selected ? tone.border : C.b0}`, background: selected ? `color-mix(in srgb, ${tone.color} 6%, ${C.s0})` : C.s0, textAlign: "left", cursor: "pointer", overflow: "hidden", boxShadow: selected ? `0 8px 26px color-mix(in srgb, ${tone.color} 10%, transparent)` : "none" }}>
                  <div style={{ padding: "13px 14px 11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 11, minWidth: 0, alignItems: "flex-start" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, display: "grid", placeItems: "center", background: C.s1, border: `1px solid ${C.b0}`, flexShrink: 0, overflow: "hidden" }}>
                          {itemChapa ? <ChapaSwatch tipo={itemChapa} size="md" /> : <Layers3 size={16} color={C.t2} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                          <Badge {...tone}>{lote.proveedor}</Badge>
                          <Badge color={destinoLote(lote) === "stock" ? C.green : C.t1} bg={destinoLote(lote) === "stock" ? C.greenL : C.s1} border={destinoLote(lote) === "stock" ? C.greenB : C.b0}>
                            {destinoLote(lote) === "stock" ? "Stock" : `Obra ${nombreObra(lote)}`}
                          </Badge>
                        </div>
                          <div style={{ color: C.t0, fontSize: 14, lineHeight: 1.2, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombreMuebles(lote)}</div>
                          <div style={{ color: C.t2, fontSize: 10.5, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombreLinea(lote)} · {itemChapa || "Chapa por definir"}</div>
                        </div>
                      </div>
                      <ChevronRight size={17} color={selected ? tone.color : C.t2} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: C.t1, fontSize: 11, fontWeight: 700 }}>
                      <span>{itemRecepcion ? `Recibido ${itemRecepcion.estado}` : itemMeta.etapa.label}</span>
                      <span>{itemMeta.progreso}%</span>
                    </div>
                  </div>
                  <div style={{ height: 3, background: C.s2 }}><div style={{ width: `${itemMeta.progreso}%`, height: "100%", background: tone.color, transition: "width .2s" }} /></div>
                </button>
              );
            })}
          </div>

          {seleccionado && meta && (
            <section data-tour="muebles-recorrido" style={{ border: `1px solid ${C.b0}`, borderRadius: 14, background: C.s0, overflow: "hidden", position: "sticky", top: 12 }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.b0}`, background: C.s1 }}>
                <div className="muebles-detail-head" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0 }}>
                    <div style={{ width: 54, height: 44, borderRadius: 11, display: "grid", placeItems: "center", background: C.s0, border: `1px solid ${C.b0}`, overflow: "hidden", flexShrink: 0 }}>
                      {selectedChapa ? <ChapaSwatch tipo={selectedChapa} size="lg" /> : <Layers3 size={20} color={C.t2} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                        <Badge {...proveedorTone(seleccionado.proveedor)}>{seleccionado.proveedor}</Badge>
                        <Badge>{destinoLote(seleccionado) === "stock" ? "Fabricación para stock" : `Obra ${nombreObra(seleccionado)}`}</Badge>
                      </div>
                      <h2 style={{ margin: 0, fontSize: 19, color: C.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombreMuebles(seleccionado)}</h2>
                      <div style={{ color: C.t2, fontSize: 11, marginTop: 3 }}>{nombreLinea(seleccionado)} · {cantidadMuebles(seleccionado)}</div>
                    </div>
                  </div>
                  {seleccionado.fecha_objetivo && <Badge color={C.blue} bg={C.blueL} border={C.blueB}><CalendarDays size={12} /> Objetivo {fechaCorta(seleccionado.fecha_objetivo)}</Badge>}
                </div>
              </div>

              <div style={{ padding: 18 }}>
                {seleccionado.proveedor === "Oberti" && (
                  <MueblesOrdenesTrabajoPanel
                    key={seleccionado.id}
                    loteId={seleccionado.id}
                    lineaId={seleccionado.linea_id}
                    obraCodigo={nombreObra(seleccionado)}
                    modelo={nombreLinea(seleccionado)}
                    canEdit={esAdmin}
                  />
                )}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", marginBottom: 10 }}>
                  <div>
                    <div style={{ ...label, marginBottom: 3 }}>Proceso {seleccionado.proveedor}</div>
                    <div style={{ color: C.t2, fontSize: 10.5 }}>{esAdmin ? "Seleccioná cualquier etapa. Si queda algo pendiente, te avisamos antes de guardar." : "Recorrido operativo de fabricación."}</div>
                  </div>
                  <Badge color={proveedorTone(seleccionado.proveedor).color} bg={proveedorTone(seleccionado.proveedor).bg} border={proveedorTone(seleccionado.proveedor).border}>{meta.progreso}%</Badge>
                </div>
                <div className="muebles-stage-scroll">
                  <div className="muebles-stage-track">
                  {meta.flujo.map((etapa, index) => {
                    const done = index < meta.index;
                    const active = index === meta.index;
                    return (
                      <button
                        key={etapa.key}
                        type="button"
                        disabled={!esAdmin || active}
                        onClick={() => moverAEtapa(seleccionado, index)}
                        title={esAdmin ? active ? "Etapa actual" : `Cambiar a ${etapa.label}` : etapa.short}
                        style={{
                          width: 124,
                          minHeight: 76,
                          padding: "9px 9px 8px",
                          borderRadius: 10,
                          border: `1px solid ${active ? proveedorTone(seleccionado.proveedor).border : done ? C.b1 : C.b0}`,
                          background: active ? proveedorTone(seleccionado.proveedor).bg : done ? C.s1 : "transparent",
                          color: active ? proveedorTone(seleccionado.proveedor).color : done ? C.t1 : C.t2,
                          textAlign: "left",
                          cursor: esAdmin && !active ? "pointer" : "default",
                          opacity: esAdmin || active || done ? 1 : 0.82,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, marginBottom: 8 }}>
                          <span style={{ width: 21, height: 21, borderRadius: 7, display: "grid", placeItems: "center", border: `1px solid ${done || active ? proveedorTone(seleccionado.proveedor).border : C.b0}`, background: done ? proveedorTone(seleccionado.proveedor).color : C.s0, color: done ? C.bg : active ? proveedorTone(seleccionado.proveedor).color : C.t2, fontSize: 9, fontWeight: 900 }}>
                            {done ? <Check size={12} strokeWidth={3} /> : index + 1}
                          </span>
                          {active && <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>Actual</span>}
                        </div>
                        <div style={{ fontSize: 10.5, lineHeight: 1.25, fontWeight: active ? 850 : 700 }}>{etapa.label}</div>
                      </button>
                    );
                  })}
                  </div>
                </div>

                <div style={{ marginTop: 11, padding: "10px 11px", borderRadius: 10, border: `1px solid ${proveedorTone(seleccionado.proveedor).border}`, background: proveedorTone(seleccionado.proveedor).bg }}>
                  <div style={{ color: proveedorTone(seleccionado.proveedor).color, fontSize: 10, fontWeight: 850, letterSpacing: 0.8, textTransform: "uppercase" }}>Etapa actual · {meta.etapa.label}</div>
                  <div style={{ color: C.t1, fontSize: 11.5, marginTop: 4 }}>{meta.etapa.short}</div>
                </div>

                <div className="muebles-detail-meta" style={{ marginTop: 12, paddingTop: 13, borderTop: `1px solid ${C.b0}`, display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 9 }}>
                  <div>
                    <span style={label}>Chapa de los muebles</span>
                    {selectedChapa ? <ChapaSwatch tipo={selectedChapa} size="sm" label /> : <div style={{ color: C.t2, fontSize: 11 }}>Pendiente de definición</div>}
                  </div>
                  <div><span style={label}>Material base</span><div style={{ color: C.t0, fontSize: 11.5 }}>{seleccionado.material_base || "Estándar de línea"}</div></div>
                  <div><span style={label}>Madera especial</span><div style={{ color: C.t0, fontSize: 11.5 }}>{seleccionado.detalle_madera || "Sin dependencia especial"}</div></div>
                </div>

                {selectedRecepcion && (
                  <div style={{ marginTop: 14, padding: 13, borderRadius: 11, border: `1px solid ${selectedRecepcion.estado === "completa" ? C.greenB : C.blueB}`, background: selectedRecepcion.estado === "completa" ? C.greenL : C.blueL }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div>
                        <div style={{ color: selectedRecepcion.estado === "completa" ? C.green : C.blue, fontSize: 12, fontWeight: 850 }}>
                          Recepción {selectedRecepcion.estado}
                        </div>
                        <div style={{ color: C.t2, fontSize: 10, marginTop: 3 }}>
                          {selectedRecepcion.total
                            ? `${selectedRecepcion.completos} de ${selectedRecepcion.total} muebles recibidos completos${selectedRecepcion.parciales ? ` · ${selectedRecepcion.parciales} parciales` : ""}`
                            : "Los muebles empezaron a llegar. Falta controlar los ítems en el checklist."}
                        </div>
                      </div>
                      <span style={{ color: selectedRecepcion.estado === "completa" ? C.green : C.blue, fontFamily: C.mono, fontSize: 13, fontWeight: 850 }}>{selectedRecepcion.pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: C.s2, marginTop: 9, overflow: "hidden" }}>
                      <div style={{ width: `${selectedRecepcion.pct}%`, height: "100%", background: selectedRecepcion.estado === "completa" ? C.green : C.blue }} />
                    </div>
                    {esAdmin && selectedRecepcion.total === 0 && (
                      <button
                        onClick={() => actualizarLote(
                          seleccionado,
                          { recepcion_estado: selectedRecepcion.estado === "completa" ? "parcial" : "completa" },
                          selectedRecepcion.estado === "completa" ? "Recepción reabierta" : "Recepción completada",
                        )}
                        style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8, border: `1px solid ${selectedRecepcion.estado === "completa" ? C.b0 : C.greenB}`, background: selectedRecepcion.estado === "completa" ? "transparent" : C.greenL, color: selectedRecepcion.estado === "completa" ? C.t2 : C.green, cursor: "pointer", fontSize: 10, fontWeight: 850 }}
                      >
                        {selectedRecepcion.estado === "completa" ? "Volver a recepción parcial" : "Marcar recepción completa"}
                      </button>
                    )}
                  </div>
                )}

                {seleccionado.proveedor === "Oberti" && (
                  <div data-tour="muebles-preparacion" style={{ marginTop: 16, padding: 13, borderRadius: 11, border: `1px solid ${C.b0}`, background: C.s1 }}>
                    <div style={{ ...label, marginBottom: 5 }}>OT de preparación · Carpintero de banco</div>
                    <div style={{ color: C.t2, fontSize: 10, lineHeight: 1.5, marginBottom: 10 }}>
                      Banco prepara chapas y tablones. Después Oficina Técnica digitaliza la parte de chapas para enviarla impresa a la enchapadora.
                    </div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {OBERTI_TASKS.map(([key, text]) => (
                        <label key={key} style={{ display: "flex", gap: 9, alignItems: "center", cursor: esAdmin ? "pointer" : "default", color: seleccionado[key] ? C.t1 : C.t2, fontSize: 11 }}>
                          <input type="checkbox" disabled={!esAdmin} checked={Boolean(seleccionado[key])} onChange={() => actualizarLote(seleccionado, { [key]: !seleccionado[key] }, text)} />
                          <span style={{ textDecoration: seleccionado[key] ? "line-through" : "none" }}>{text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {seleccionado.proveedor === "Oberti" && (
                  <div data-tour="muebles-enchapado-herrajes" style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 12,
                    border: `1px solid ${enchapadoEnEtapaRecomendada ? C.blueB : C.b0}`,
                    background: enchapadoEnEtapaRecomendada ? C.blueL : C.s1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 11 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, color: enchapadoEnEtapaRecomendada ? C.blue : C.t1, fontSize: 11, fontWeight: 850 }}>
                          <Layers3 size={15} /> Circuito de OT y herrajes
                        </div>
                        <div style={{ color: C.t2, fontSize: 10, marginTop: 4 }}>
                          {enchapadoEnEtapaRecomendada
                            ? "Banco recibe la OT completa; Enchapadora y Oberti reciben únicamente la parte que les corresponde."
                            : "Podés adelantar la OT y los herrajes. El momento recomendado es durante la preparación en Banco."}
                        </div>
                      </div>
                      {!enchapadoEnEtapaRecomendada && <Badge color={C.blue} bg={C.blueL} border={C.blueB}>Disponible</Badge>}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ padding: 11, borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div>
                              <div style={{ color: C.t0, fontSize: 12, fontWeight: 800 }}>1. OT de preparación de Banco</div>
                              <div style={{ color: C.t2, fontSize: 10, marginTop: 3 }}>
                                {selectedOt
                                  ? `${selectedOt.estado} · Digitalizar chapas, imprimir para Enchapadora y avisar tablones a Oberti`
                                  : "Creala para entregársela al carpintero de banco antes de comenzar la preparación."}
                              </div>
                            </div>
                            {selectedOt
                              ? <Badge color={selectedOt.estado === "Devuelta" ? C.green : C.blue} bg={selectedOt.estado === "Devuelta" ? C.greenL : C.blueL} border={selectedOt.estado === "Devuelta" ? C.greenB : C.blueB}>{selectedOt.estado}</Badge>
                              : <Badge>Pendiente</Badge>}
                          </div>
                          {esAdmin && (
                            <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                              {selectedOt ? (
                                <button onClick={() => setGestionOt(selectedOt)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontSize: 10, fontWeight: 850 }}>Abrir y gestionar OT</button>
                              ) : (
                                <button disabled={creandoOt || !seleccionado.unidad_id} onClick={() => crearOtEnchapado(seleccionado)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.blueB}`, background: C.blueL, color: seleccionado.unidad_id ? C.blue : C.t3, cursor: seleccionado.unidad_id ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 850 }}>
                                  {creandoOt ? "Creando OT..." : "Crear OT de preparación"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ padding: 11, borderRadius: 10, border: `1px solid ${C.b0}`, background: C.s0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div>
                              <div style={{ color: C.t0, fontSize: 12, fontWeight: 800 }}>2. Kit de herrajes para Oberti</div>
                              <div style={{ color: C.t2, fontSize: 10, marginTop: 3 }}>
                                {selectedHerrajes.length
                                  ? selectedCompraHerrajes
                                    ? `${selectedHerrajes.length} ítems · Compras: ${selectedCompraHerrajes.status}`
                                    : `${selectedHerrajes.length} ítems definidos para ${nombreLinea(seleccionado)}`
                                  : `No hay un kit cargado para ${nombreLinea(seleccionado)}.`}
                              </div>
                            </div>
                            <Badge
                              color={(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? C.green : (seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido) ? C.blue : C.t2}
                              bg={(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? C.greenL : (seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido) ? C.blueL : C.s1}
                              border={(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? C.greenB : (seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido) ? C.blueB : C.b0}
                            >
                              {(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado)
                                ? "Enviado a Oberti"
                                : (seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido)
                                  ? "Pedido a Compras"
                                  : "Pendiente"}
                            </Badge>
                          </div>
                          {selectedHerrajes.length > 0 && (
                            <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                              {esAdmin && !(seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido) && (
                                <button onClick={() => setPedidoHerrajes({ lote: seleccionado, ot: selectedOt, items: selectedHerrajes })} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontSize: 10, fontWeight: 850 }}>
                                  <ShoppingCart size={13} /> Enviar pedido a Compras
                                </button>
                              )}
                              {esAdmin && (seleccionado.herrajes_pedido || selectedOt?.herrajes_pedido) && (
                                <button
                                  disabled={!(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) && selectedCompraHerrajes?.status !== "recibido"}
                                  title={selectedCompraHerrajes?.status !== "recibido" ? "Compras debe marcar el pedido como recibido antes del envío a Oberti." : ""}
                                  onClick={() => toggleHerrajesEnviados(seleccionado, selectedOt)}
                                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? C.b0 : C.greenB}`, background: (seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? "transparent" : C.greenL, color: (seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) ? C.t2 : selectedCompraHerrajes?.status === "recibido" ? C.green : C.t3, cursor: (seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado) || selectedCompraHerrajes?.status === "recibido" ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 850 }}
                                >
                                  {(seleccionado.herrajes_enviado || selectedOt?.herrajes_enviado)
                                    ? "Revertir envío"
                                    : selectedCompraHerrajes?.status === "recibido"
                                      ? "Marcar enviados a Oberti"
                                      : `Compras: ${selectedCompraHerrajes?.status || "sin vincular"}`}
                                </button>
                              )}
                              {selectedCompraHerrajes && (
                                <a href={`/compras?open=${selectedCompraHerrajes.id}`} style={{ display: "inline-flex", alignItems: "center", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, textDecoration: "none", fontSize: 10, fontWeight: 800 }}>
                                  Abrir pedido en Compras
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                    </div>
                  </div>
                )}

                {seleccionado.observaciones && <div style={{ marginTop: 13, padding: 11, borderRadius: 9, background: C.s1, color: C.t1, fontSize: 11, lineHeight: 1.5 }}>{seleccionado.observaciones}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  {esAdmin && (
                    <>
                      <button disabled={!meta.anterior} onClick={() => mover(seleccionado, -1)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.b0}`, background: "transparent", color: meta.anterior ? C.t1 : C.t3, cursor: meta.anterior ? "pointer" : "default", fontWeight: 750, fontSize: 11 }}><ArrowLeft size={14} /> Volver</button>
                      <button disabled={!meta.siguiente} onClick={() => mover(seleccionado, 1)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.blueB}`, background: C.blueL, color: meta.siguiente ? C.blue : C.t3, cursor: meta.siguiente ? "pointer" : "default", fontWeight: 800, fontSize: 11 }}>
                        {meta.siguiente ? `Avanzar a ${meta.siguiente.label}` : `Recepción ${selectedRecepcion?.estado || "parcial"}`}
                        {meta.siguiente && <ArrowRight size={14} />}
                      </button>
                    </>
                  )}
                  {meta.etapa.key === "recibido" && destinoLote(seleccionado) === "obra" && <button onClick={() => onOpenChecklist?.(seleccionado)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 8, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, cursor: "pointer", fontWeight: 800, fontSize: 11 }}><ClipboardCheck size={14} /> Abrir recepción</button>}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Confirmación para saltear pasos. No es un error: es una advertencia con
          la lista de lo que falta, y la decisión queda del lado de la persona. */}
      {avisoSalto && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && setAvisoSalto(null)}
          style={{ position: "fixed", inset: 0, zIndex: 96, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.62)", backdropFilter: "blur(8px)" }}
        >
          <div style={{ width: "min(520px, 100%)", borderRadius: 15, border: `1px solid ${C.b1}`, background: C.bg1, boxShadow: "0 26px 80px rgba(0,0,0,.38)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 18px", borderBottom: `1px solid ${C.b0}` }}>
              <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
                <AlertTriangle size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 850, color: C.t0, fontSize: 14.5 }}>
                  Cambiar a {avisoSalto.target.label}
                </div>
                <div style={{ color: C.t2, fontSize: 11.5, marginTop: 2 }}>
                  Revisá la advertencia antes de actualizar el proceso.
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 18px", display: "grid", gap: 8 }}>
              {avisoSalto.etapasOmitidas?.length > 0 && (
                <div style={{ padding: "10px 11px", borderRadius: 9, border: `1px solid ${C.blueB}`, background: C.blueL }}>
                  <div style={{ color: C.blue, fontSize: 10, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase" }}>Etapas que se omiten</div>
                  <div style={{ color: C.t1, fontSize: 11.5, lineHeight: 1.45, marginTop: 4 }}>{avisoSalto.etapasOmitidas.join(" · ")}</div>
                </div>
              )}
              {avisoSalto.faltan.map((motivo, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12.5, color: C.t1, lineHeight: 1.45 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 99, background: C.t3, flexShrink: 0, marginTop: 6 }} />
                  {motivo}
                </div>
              ))}
              <div style={{ marginTop: 4, fontSize: 11.5, color: C.t2, lineHeight: 1.5 }}>
                Podés continuar igual. La etapa elegida, las omisiones y los pendientes quedarán registrados en el historial.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, padding: "12px 18px", borderTop: `1px solid ${C.b0}` }}>
              <button
                onClick={() => setAvisoSalto(null)}
                style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, cursor: "pointer", fontWeight: 750, fontSize: 12 }}
              >
                Volver
              </button>
              <button
                onClick={confirmarSalto}
                style={{ padding: "8px 15px", borderRadius: 9, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", fontWeight: 850, fontSize: 12 }}
              >
                Cambiar de etapa igual
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div onMouseDown={(e) => e.target === e.currentTarget && setShowAdd(false)} style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 16, background: "rgba(0,0,0,.62)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", borderRadius: 15, border: `1px solid ${C.b1}`, background: C.bg1, boxShadow: "0 26px 80px rgba(0,0,0,.38)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: `1px solid ${C.b0}` }}>
              <div><div style={{ fontWeight: 850, color: C.t0 }}>Nuevo proceso de muebles</div><div style={{ color: C.t2, fontSize: 11, marginTop: 3 }}>Definí quién lo fabrica y si nace para una obra o para stock.</div></div>
              <button onClick={() => setShowAdd(false)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, cursor: "pointer" }}><X size={15} /></button>
            </div>
            <div className="muebles-form-grid" style={{ padding: 18 }}>
              <div><label style={label}>Destino</label><select style={input} value={form.tipo_destino} onChange={(e) => setForm({ ...form, tipo_destino: e.target.value, unidad_id: "" })}><option value="obra">Obra específica</option><option value="stock">Fabricar para stock</option></select></div>
              <div><label style={label}>Mueblero</label><select style={input} value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>{PROVEEDORES_MUEBLES.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><label style={label}>Línea</label><select style={input} value={form.linea_id} onChange={(e) => setForm({ ...form, linea_id: e.target.value, unidad_id: "" })}><option value="">Seleccionar línea</option>{lineas.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div>
              {form.tipo_destino === "obra" && <div><label style={label}>Obra</label><select style={input} value={form.unidad_id} onChange={(e) => { const unidad = unidades.find((u) => u.id === e.target.value); setForm({ ...form, unidad_id: e.target.value, linea_id: unidad?.linea_id || form.linea_id }); }}><option value="">Seleccionar obra</option>{obraOptions.map((item) => <option key={item.id} value={item.id}>{item.codigo}</option>)}</select></div>}
              <div><label style={label}>Nombre interno</label><input style={input} value={form.nombre_lote} onChange={(e) => setForm({ ...form, nombre_lote: e.target.value })} placeholder="Ej: Muebles principales K37" /></div>
              <div><label style={label}>Cantidad de conjuntos de muebles</label><input style={input} type="number" min="1" value={form.cantidad_juegos} onChange={(e) => setForm({ ...form, cantidad_juegos: Math.max(1, Number(e.target.value) || 1) })} /></div>
              <div><label style={label}>Color / chapa</label><input style={input} value={form.color_chapa} onChange={(e) => setForm({ ...form, color_chapa: e.target.value })} placeholder="Ej: Roble plata" /></div>
              <div><label style={label}>Material base</label><input style={input} value={form.material_base} onChange={(e) => setForm({ ...form, material_base: e.target.value })} placeholder="Ej: estándar de línea" /></div>
              <div><label style={label}>Nogal / roble / detalle</label><input style={input} value={form.detalle_madera} onChange={(e) => setForm({ ...form, detalle_madera: e.target.value })} placeholder="Opcional" /></div>
              <div><label style={label}>Fecha objetivo</label><input style={input} type="date" value={form.fecha_objetivo} onChange={(e) => setForm({ ...form, fecha_objetivo: e.target.value })} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Observaciones</label><textarea style={{ ...input, minHeight: 72, resize: "vertical" }} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Dependencias, alcance de los muebles o acuerdos con el proveedor..." /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 18px", borderTop: `1px solid ${C.b0}` }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "8px 12px", border: `1px solid ${C.b0}`, borderRadius: 8, background: "transparent", color: C.t1, cursor: "pointer", fontWeight: 750 }}>Cancelar</button>
              <button disabled={saving} onClick={crearLote} style={{ padding: "8px 13px", border: `1px solid ${C.blueB}`, borderRadius: 8, background: C.blueL, color: C.blue, cursor: saving ? "wait" : "pointer", fontWeight: 850 }}>{saving ? "Creando..." : "Crear proceso"}</button>
            </div>
          </div>
        </div>
      )}

      {gestionOt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95, background: C.bg, overflowY: "auto" }}>
          <OTDetail
            ot={gestionOt}
            esAdmin={esAdmin}
            onBack={() => setGestionOt(null)}
            onEnsureMueblesUnidad={onEnsureMueblesUnidad}
            onUpdated={(updated) => {
              setGestionOt(updated);
              actualizarOtIntegrada(updated);
            }}
            onDeleted={(otId) => {
              setOts((prev) => prev.filter((ot) => ot.id !== otId));
              setLotes((prev) => prev.map((lote) => lote.enchapado_ot_id === otId ? { ...lote, enchapado_ot_id: null, enchapado_listo: false } : lote));
              setGestionOt(null);
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
