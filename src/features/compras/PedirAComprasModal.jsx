import { useEffect, useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, Package, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import {
  addRequestItem,
  createPurchaseRequest,
  fetchProjects,
  notifyComprasEmail,
} from "@/features/compras/purchaseRequestsApi";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { PRIORIDADES } from "./modulo";
import { Modal } from "./ui";
import SelectorDestino from "./SelectorDestino";

// ─────────────────────────────────────────────────────────────────────────────
// RUTEO DE PEDIDOS LEGACY — POR ORIGEN, no por texto del destino.
//
// El modal recibe `origen` ("laminacion" | "maderas" | null):
//   · origen "laminacion" → TODOS los ítems crean laminacion_pedidos (aparecen
//     en la tab Pedidos de Laminación y se reciben ahí). Nunca tocan madera.
//   · origen "maderas"    → TODOS los ítems crean el pedido legacy `pedidos` +
//     `pedido_items` (panel "Pedidos pendientes" del pañol de maderas).
//   · sin origen (genérico) → heurística vieja por destino: "Stock …" → madera,
//     "Obra …" → laminación.
//
// Los triggers DB siguen igual: al recibir, sincronizan el purchase_request_item
// (migraciones 20260605000000 y 20260606000000).
// ─────────────────────────────────────────────────────────────────────────────
async function createLegacyPedidoMaderas({ purchaseRequest, entries, title, profileId }) {
  if (entries.length === 0) return;

  // Match de material_id en el catálogo `materiales` por nombre (case-insensitive)
  // para que el item del pedido legacy quede ligado al stock real.
  const { data: matRows } = await supabase
    .from("materiales")
    .select("id, nombre, unidad_medida");
  const materialesByName = new Map(
    (matRows ?? []).map((m) => [String(m.nombre || "").trim().toLowerCase(), m]),
  );

  const { data: pedRow, error: pedErr } = await supabase
    .from("pedidos")
    .insert({
      proveedor: "Pendiente",
      nota: title || "Pedido a compras",
      estado: "pedido",
      fecha_pedido: new Date().toISOString(),
      creado_por: profileId || null,
      purchase_request_id: purchaseRequest.id,
    })
    .select("id")
    .single();

  if (pedErr || !pedRow) {
    console.warn("[PedirAComprasModal] no se pudo crear pedido legacy:", pedErr);
    return;
  }

  const rows = entries.map(({ draft, requestItem }) => {
    const matchedMat = materialesByName.get((draft.description || "").trim().toLowerCase());
    return {
      pedido_id: pedRow.id,
      material_id: matchedMat?.id || draft.material_id || null,
      descripcion: draft.description || "",
      cantidad: Number.isFinite(Number(draft.quantity)) ? Number(draft.quantity) : null,
      unidad: draft.unit || matchedMat?.unidad_medida || "unidad",
      purchase_request_item_id: requestItem?.id || null,
    };
  });

  const { error: itemsErr } = await supabase.from("pedido_items").insert(rows);
  if (itemsErr) {
    console.warn("[PedirAComprasModal] no se pudieron insertar pedido_items:", itemsErr);
  }
}

// Un row de laminacion_pedidos por ítem. laminacion_pedidos exige material_id
// (la recepción genera el ingreso por material), así que:
//   1) usamos el material_id del draft si viene del catálogo de laminación;
//   2) si no, matcheamos laminacion_materiales por nombre;
//   3) si tampoco existe, lo CREAMOS en el catálogo (así el circuito
//      pedido → recepción → ingreso cierra completo, sin ítems invisibles).
async function createLaminacionPedidos({ entries, profileId }) {
  if (entries.length === 0) return { created: 0, failed: 0 };

  const { data: lamMats } = await supabase
    .from("laminacion_materiales")
    .select("id, nombre");
  const byName = new Map(
    (lamMats ?? []).map((m) => [String(m.nombre || "").trim().toLowerCase(), m]),
  );

  let created = 0;
  let failed = 0;

  for (const { draft, requestItem } of entries) {
    try {
      let matId = draft.material_id || null;
      if (!matId) {
        const key = (draft.description || "").trim().toLowerCase();
        const match = key ? byName.get(key) : null;
        if (match) {
          matId = match.id;
        } else if (key) {
          const { data: nuevoMat, error: matErr } = await supabase
            .from("laminacion_materiales")
            .insert({
              nombre: (draft.description || "").trim(),
              categoria: "General",
              unidad: draft.unit || "unidad",
              stock_minimo: 0,
            })
            .select("id")
            .single();
          if (matErr || !nuevoMat) throw matErr || new Error("sin material");
          matId = nuevoMat.id;
          byName.set(key, { id: matId, nombre: (draft.description || "").trim() });
        }
      }
      if (!matId) { failed += 1; continue; }

      const cantNum = Number(draft.quantity);
      const dest = String(draft.destination || "").trim();
      const obraDestino = /^Obra\s+/i.test(dest)
        ? dest.replace(/^Obra\s+/i, "").trim()
        : (dest || "Stock");

      const { error } = await supabase.from("laminacion_pedidos").insert({
        material_id: matId,
        cantidad: Number.isFinite(cantNum) && cantNum > 0 ? cantNum : 1,
        estado: "pendiente",
        solicitado_por: profileId || null,
        observaciones: itemNotesForSubmit(draft),
        categoria: draft.category || (isExtraItem(draft) ? "extra" : "estándar"),
        obra_destino: obraDestino,
        purchase_request_item_id: requestItem?.id || null,
      });
      if (error) throw error;
      created += 1;
    } catch (e) {
      console.warn("[PedirAComprasModal] laminacion_pedidos item falló:", e);
      failed += 1;
    }
  }

  return { created, failed };
}

async function linkExistingLaminacionPedidos({ entries }) {
  let linked = 0;
  let failed = 0;

  for (const { draft, requestItem } of entries) {
    const pedidoId = draft.laminacionPedidoId || draft.laminacion_pedido_id;
    if (!pedidoId) continue;
    try {
      const dest = String(draft.destination || "").trim();
      const obraDestino = /^Obra\s+/i.test(dest)
        ? dest.replace(/^Obra\s+/i, "").trim()
        : (dest || null);
      const { error } = await supabase
        .from("laminacion_pedidos")
        .update({
          purchase_request_item_id: requestItem?.id || null,
          obra_destino: obraDestino,
          categoria: draft.category || (isExtraItem(draft) ? "extra" : "estándar"),
        })
        .eq("id", pedidoId);
      if (error) throw error;
      linked += 1;
    } catch (e) {
      console.warn("[PedirAComprasModal] no se pudo vincular laminacion_pedidos existente:", e);
      failed += 1;
    }
  }

  return { linked, failed };
}

// Destinos "fijos" para stock — además se suman dinámicamente las obras
// activas (vienen de produccion_obras).
const STOCK_DESTINATIONS = [
  { value: "Stock Chubut 2120", label: "Stock Chubut 2120" },
  { value: "Stock Pampa 1050",  label: "Stock Pampa 1050"  },
];

const UNITS = ["unidad", "kg", "litro", "metro", "pies", "m²", "lata", "rollo", "par", "juego", "caja", "placa"];

function isExtraItem(item) {
  return item?.isExtra || item?.category === "extra" || /^EXTRA\b/i.test(String(item?.notes || "").trim());
}

function itemNotesForSubmit(item) {
  const notes = String(item?.notes || "").trim();
  if (!isExtraItem(item)) return notes || null;
  return /^EXTRA\b/i.test(notes)
    ? notes
    : ["EXTRA", notes].filter(Boolean).join(" - ");
}

// Normaliza un ítem (venga de prefilled o de una plantilla cargada en el modal)
// al shape interno único. Conserva los ids de los pedidos legacy existentes para
// poder VINCULAR en vez de duplicar (laminacionPedidoId / maderaPedidoItemId).
function normalizeDraft(it, fallbackDest = "") {
  return {
    description: it.description || "",
    quantity: it.quantity ?? "",
    unit: it.unit || "unidad",
    destination: it.destination || fallbackDest || "",
    notes: it.notes || "",
    link_url: it.link_url || "",
    image_url: it.image_url || "",
    material_id: it.material_id || null,
    laminacionPedidoId: it.laminacionPedidoId || it.laminacion_pedido_id || null,
    maderaPedidoItemId: it.maderaPedidoItemId || it.madera_pedido_item_id || null,
    maderaPedidoId: it.maderaPedidoId || it.madera_pedido_id || null,
    catalogSource: it.catalogSource || it.catalog_source || "",
    category: it.category || "",
    isExtra: Boolean(it.isExtra || it.category === "extra"),
    supplier_id: it.supplier_id || null,
    supplier_name: it.supplier_name || "",
    supplier_description: it.supplier_description || "",
    supplier_code: it.supplier_code || "",
    supplier_components: Array.isArray(it.supplier_components) ? it.supplier_components : [],
  };
}

// Vincula ítems de un pedido de maderas YA EXISTENTE al purchase_request recién
// creado, en vez de crear un pedido `pedidos` nuevo (evita duplicados). Marca cada
// pedido_item con su purchase_request_item_id y el pedido padre con el request id.
async function linkExistingMaderaPedido({ purchaseRequest, entries }) {
  let linked = 0;
  let failed = 0;
  const pedidoIds = new Set();

  for (const { draft, requestItem } of entries) {
    const itemId = draft.maderaPedidoItemId || draft.madera_pedido_item_id;
    if (!itemId) continue;
    try {
      const { error } = await supabase
        .from("pedido_items")
        .update({ purchase_request_item_id: requestItem?.id || null })
        .eq("id", itemId);
      if (error) throw error;
      if (draft.maderaPedidoId) pedidoIds.add(draft.maderaPedidoId);
      linked += 1;
    } catch (e) {
      console.warn("[PedirAComprasModal] no se pudo vincular pedido_items existente:", e);
      failed += 1;
    }
  }

  for (const pid of pedidoIds) {
    try {
      await supabase.from("pedidos").update({ purchase_request_id: purchaseRequest.id }).eq("id", pid);
    } catch (e) {
      console.warn("[PedirAComprasModal] no se pudo vincular pedido padre:", e);
    }
  }

  return { linked, failed };
}

/**
 * Modal para crear un pedido a compras con ítems.
 *
 * Props:
 *   open                  bool
 *   onClose(savedBool)
 *   profile               { id, username, role, is_admin }
 *   prefilled             {
 *     title?: string,
 *     description?: string,
 *     priority?: string,           // default "media"
 *     defaultDestination?: string, // string libre; se selecciona si matchea, sino se agrega
 *     source?: string,
 *     source_ref?: string,
 *     source_url?: string,
 *     sourceLabel?: string,
 *     attachments?: [{ url, path?, name?, type?, size? }],
 *     items?: [{ material_id?, description, quantity, unit, destination?, notes? }],
 *   }
 */
export default function PedirAComprasModal({
  open,
  onClose,
  prefilled,
  profile,
  origen = null,
  // Carga de plantillas de obra DENTRO del modal (reemplaza el modal-selector
  // previo de Laminación). `obrasPlantilla` = [{ id, label }]; `onLoadObraPlantilla`
  // = async (obraId) => ({ items, title?, defaultDestination?, message? }).
  obrasPlantilla = [],
  onLoadObraPlantilla = null,
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [tipoPedido, setTipoPedido] = useState(null);
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);

  // Form interno para agregar un ítem
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("unidad");
  const [newDest, setNewDest] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Carga de plantilla de obra (in-modal)
  const [plantillaObra, setPlantillaObra] = useState("");
  const [loadingPlantilla, setLoadingPlantilla] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(prefilled?.title || "");
    setDescription(prefilled?.description || "");
    setPriority(prefilled?.priority || "media");
    setTipoPedido(typeof prefilled?.tipo_pedido === "string" ? prefilled.tipo_pedido : (prefilled?.es_adicional === true ? "adicional" : prefilled?.es_adicional === false ? "estandar" : null));
    setItems(
      Array.isArray(prefilled?.items)
        ? prefilled.items.map((it) => normalizeDraft(it, prefilled?.defaultDestination))
        : [],
    );
    setNewDest(prefilled?.defaultDestination || "");
    setPlantillaObra("");
    setLoadingPlantilla(false);
    fetchProjects().then(setProjects).catch((err) => {
      toast.error(err.message || "No se pudieron cargar las obras.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilled]);

  // Opciones del dropdown destino: stocks + obras activas
  const destinationOptions = useMemo(() => {
    const obraOpts = (projects || []).map((p) => ({
      value: `Obra ${p.codigo}`,
      label: `Obra ${p.codigo}${p.descripcion ? ` — ${p.descripcion}` : ""}`,
    }));
    const customDefault = prefilled?.defaultDestination
      && !STOCK_DESTINATIONS.some((d) => d.value === prefilled.defaultDestination)
      && !obraOpts.some((d) => d.value === prefilled.defaultDestination)
      ? [{ value: prefilled.defaultDestination, label: prefilled.defaultDestination }]
      : [];
    return [
      ...STOCK_DESTINATIONS,
      ...customDefault,
      ...obraOpts,
    ];
  }, [projects, prefilled?.defaultDestination]);

  // Agrupar items por destino (memoizado).
  // Lo dejamos ANTES del early-return de !open para no romper la regla
  // "hooks call order" de React.
  const itemsByDest = useMemo(() => {
    const groups = new Map();
    for (const it of items) {
      const key = it.destination || "Sin destino";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    return Array.from(groups.entries());
  }, [items]);

  if (!open) return null;

  function addCurrentItem() {
    const desc = newDesc.trim();
    if (!desc) {
      toast.warning("Cargá una descripción para el ítem.");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        description: desc,
        quantity: newQty.trim(),
        unit: newUnit,
        destination: newDest.trim(),
        notes: newNotes.trim(),
        link_url: "",
        image_url: "",
        material_id: null,
        catalogSource: "",
      },
    ]);
    setNewDesc("");
    setNewQty("");
    setNewUnit("unidad");
    setNewNotes("");
    // Mantenemos newDest para que sumar items al mismo destino sea ágil
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function handleLoadPlantilla() {
    if (!plantillaObra || !onLoadObraPlantilla) return;
    setLoadingPlantilla(true);
    try {
      const res = await onLoadObraPlantilla(plantillaObra);
      const rawItems = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      if (!rawItems.length) {
        toast.warning(res?.message || "Esa obra no tiene plantilla de materiales cargada.");
        return;
      }
      const nuevos = rawItems.map((it) => normalizeDraft(it, res?.defaultDestination));
      setItems((prev) => [...prev, ...nuevos]);
      if (res?.title && !title.trim()) setTitle(res.title);
      if (res?.defaultDestination && !newDest.trim()) setNewDest(res.defaultDestination);
      toast.success(`${nuevos.length} ítem${nuevos.length > 1 ? "s" : ""} cargado${nuevos.length > 1 ? "s" : ""} de la plantilla.`);
      setPlantillaObra("");
    } catch (err) {
      toast.error(err.message || "No se pudo cargar la plantilla.");
    } finally {
      setLoadingPlantilla(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      toast.warning("Cargá un título para el pedido.");
      return;
    }
    if (items.length === 0) {
      toast.warning("Agregá al menos un ítem.");
      return;
    }
    if (!tipoPedido) {
      toast.warning("Elegí el tipo de pedido.");
      return;
    }
    setSaving(true);
    try {
      // El project_id del pedido lo dejamos null (los destinos viven en los items).
      const created = await createPurchaseRequest({
        form: {
          title: title.trim(),
          description: description.trim(),
          priority,
          es_adicional: tipoPedido === "adicional",
          tipo_pedido: tipoPedido,
          project_id: null,
          source: prefilled?.source || null,
          source_ref: prefilled?.source_ref || null,
          source_url: prefilled?.source_url || null,
        },
        existingAttachments: prefilled?.attachments || [],
      });

      // Insertar los ítems del purchase_request y guardar la respuesta para
      // vincular con el pedido legacy si hay items de Stock.
      const requestItemsByDraft = await Promise.all(
        items.map(async (it) => {
          const requestItem = await addRequestItem(created.id, {
            description: it.description,
            quantity: it.quantity || null,
            unit: it.unit || "unidad",
            destination: it.destination || null,
            notes: itemNotesForSubmit(it),
            link_url: it.link_url || null,
            image_url: it.image_url || null,
            material_id: it.material_id || null,
            catalog_source: it.catalogSource || null,
            supplier_id: it.supplier_id || null,
            supplier_name: it.supplier_name || null,
            supplier_description: it.supplier_description || null,
            supplier_code: it.supplier_code || null,
            supplier_components: it.supplier_components || [],
          });
          return { draft: it, requestItem };
        }),
      );

      // Ruteo del pedido legacy según ORIGEN (no según el texto del destino):
      //   laminacion → todo a laminacion_pedidos · maderas → todo a pedidos/pañol
      //   sin origen → heurística vieja por destino (Stock→madera, Obra→laminación)
      const origenEfectivo = origen || prefilled?.origen || null;
      let entriesMadera = [];
      let entriesMaderaExistentes = [];
      let entriesLam = [];
      let entriesLamExistentes = [];
      if (origenEfectivo === "muebles" || origenEfectivo === "torneria") {
        // Muebles y Tornería ya quedan representados de forma completa en
        // purchase_requests (Tornería además guarda el purchase_request_id en sus
        // items). Sin esta rama caían en la heurística de abajo y, como su destino
        // empieza con "Obra ", terminaban duplicados en laminacion_pedidos.
      } else if (origenEfectivo === "laminacion") {
        entriesLamExistentes = requestItemsByDraft.filter((entry) =>
          entry?.draft?.laminacionPedidoId || entry?.draft?.laminacion_pedido_id);
        entriesLam = requestItemsByDraft.filter((entry) =>
          !(entry?.draft?.laminacionPedidoId || entry?.draft?.laminacion_pedido_id));
      } else if (origenEfectivo === "maderas") {
        // Ítems que ya existen como pedido de maderas → se VINCULAN (no se duplican).
        entriesMaderaExistentes = requestItemsByDraft.filter((entry) =>
          entry?.draft?.maderaPedidoItemId || entry?.draft?.madera_pedido_item_id);
        entriesMadera = requestItemsByDraft.filter((entry) =>
          !(entry?.draft?.maderaPedidoItemId || entry?.draft?.madera_pedido_item_id));
      } else {
        entriesMadera = requestItemsByDraft.filter((entry) =>
          /^Stock\s/i.test(String(entry?.draft?.destination || "").trim()));
        entriesLam = requestItemsByDraft.filter((entry) =>
          /^Obra\s+/i.test(String(entry?.draft?.destination || "").trim()));
      }

      try {
        await createLegacyPedidoMaderas({
          purchaseRequest: created,
          entries: entriesMadera,
          title: title.trim(),
          profileId: profile?.id,
        });
      } catch (e) {
        // No bloquea: el purchase_request ya está creado.
        console.warn("[PedirAComprasModal] error creando pedido legacy:", e);
      }

      try {
        const linkedMadera = await linkExistingMaderaPedido({
          purchaseRequest: created,
          entries: entriesMaderaExistentes,
        });
        if (linkedMadera?.failed > 0) {
          toast.warning(`${linkedMadera.failed} ítem${linkedMadera.failed > 1 ? "s" : ""} no se pudo vincular con el pedido de maderas existente (sí quedó en el pedido a compras).`);
        }
      } catch (e) {
        console.warn("[PedirAComprasModal] error vinculando pedido de maderas existente:", e);
      }

      try {
        const linkedRes = await linkExistingLaminacionPedidos({
          entries: entriesLamExistentes,
        });
        if (linkedRes?.failed > 0) {
          toast.warning(`${linkedRes.failed} ítem${linkedRes.failed > 1 ? "s" : ""} no se pudo vincular con Pedidos de Laminación (sí quedó en el pedido a compras).`);
        }
      } catch (e) {
        console.warn("[PedirAComprasModal] error vinculando laminacion_pedidos existentes:", e);
      }

      try {
        const res = await createLaminacionPedidos({
          entries: entriesLam,
          profileId: profile?.id,
        });
        if (res?.failed > 0) {
          toast.warning(`${res.failed} ítem${res.failed > 1 ? "s" : ""} no se pudo registrar en Pedidos de Laminación (sí quedó en el pedido a compras).`);
        }
      } catch (e) {
        console.warn("[PedirAComprasModal] error creando laminacion_pedidos:", e);
      }

      notifyComprasEmail({
        type: "new_request",
        requestId: created.id,
        requestTitle: title.trim(),
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: prefilled?.source || undefined,
      });

      toast.success(`Pedido a compras enviado · ${items.length} ítem${items.length > 1 ? "s" : ""}`);
      // Se devuelve el pedido creado y no `true`: quien llama puede necesitar el
      // id para vincularlo (tornería lo guarda en sus items para que el avance de
      // compras sincronice solo). Los llamadores viejos sólo miran si es truthy,
      // y un objeto lo sigue siendo.
      //
      // El segundo argumento son los ítems creados con su id. Tornería los usa
      // para vincular material por material: la recepción en pañol es por ítem,
      // y con un pedido de cuatro materiales que llegan en fechas distintas el
      // estado del pedido entero no alcanza. Los llamadores viejos reciben un
      // argumento y este lo ignoran.
      onClose(created ?? true, requestItemsByDraft);
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  const faltaAlgo = saving || !title.trim() || items.length === 0 || !tipoPedido;
  const otrosDestinos = destinationOptions
    .filter((d) => !/^Obra\s+/i.test(d.value))
    .map((d) => ({ valor: d.value, label: d.label, detalle: /^Stock/i.test(d.value) ? "para el stock del galpón" : "" }));
  const tipos = [
    { value: "stock", label: "Stock del pañol", detail: "Material general, sin obra", tono: "verde" },
    { value: "estandar", label: "Estándar", detail: "Lo que lleva el barco por matriz", tono: "azul" },
    { value: "adicional", label: "Adicional u opcional", detail: "Un extra para esta obra", tono: "violeta" },
  ].filter((o) => !(o.value === "estandar" && newDest.toLowerCase().includes("pampa")));
  const origenTexto = prefilled?.sourceLabel || prefilled?.source;

  return (
    <Modal
      capa={9999}
      ancho
      icono={Send}
      titulo="Pedir a Compras"
      sub={(
        <>
          {origenTexto && (
            <span className="cmp-tag" data-tono="teal" style={{ marginRight: 6 }}>
              {origenTexto}
              {prefilled?.source_url && (
                <a href={prefilled.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", display: "inline-flex" }} aria-label="Abrir el origen">
                  <ExternalLink size={10} />
                </a>
              )}
            </span>
          )}
          Compras recibe el pedido con sus ítems y lo seguís desde Compras.
        </>
      )}
      onCerrar={() => onClose()}
      bloqueado={saving}
      pie={(
        <>
          <div className="izq">
            {items.length ? <span><b className="mono" style={{ color: "var(--text)" }}>{items.length}</b> {items.length === 1 ? "ítem" : "ítems"}</span> : <span>Sumá al menos un ítem.</span>}
            {items.length > 0 && !tipoPedido && <span>· Falta elegir el tipo</span>}
          </div>
          <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => onClose()} disabled={saving}>Cancelar</button>
          <button type="submit" form="cmp-pedir-compras" className="ui-btn ui-btn-primario" disabled={faltaAlgo}>
            {saving ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
            {saving ? "Enviando…" : "Enviar a Compras"}
          </button>
        </>
      )}
    >
      <form id="cmp-pedir-compras" onSubmit={handleSubmit} className="cmp-pasos-form">
        {/* 1 · Qué es */}
        <section className={`cmp-paso${title.trim() ? " hecho" : ""}`}>
          <span className="cmp-paso-n">1</span>
          <div className="cmp-form" style={{ minWidth: 0 }}>
            <div className="cmp-paso-tit cmp-campo c6" style={{ margin: "4px 0 0" }}>¿Qué es el pedido?</div>
            <label className="cmp-campo c6">
              <span>Título <span className="req">*</span></span>
              <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Materiales de laminación para el 52-26 y stock" required />
            </label>
            <label className="cmp-campo c6">
              <span>Notas para Compras <span style={{ fontWeight: 500, color: "var(--subtle)" }}>· opcional</span></span>
              <textarea className="ui-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Algo que Compras tenga que saber" />
            </label>
            {!!prefilled?.attachments?.length && (
              <div className="cmp-campo c6">
                <span>Planos que van con el pedido · {prefilled.attachments.length}</span>
                <div className="cmp-personas">
                  {prefilled.attachments.map((attachment, index) => (
                    <a key={attachment.path || attachment.url || index} className="cmp-persona" href={attachment.url} target="_blank" rel="noreferrer" title={attachment.name} style={{ textDecoration: "none", paddingLeft: 10, maxWidth: 260 }}>
                      <Paperclip size={13} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachment.name || `Plano ${index + 1}`}</span>
                    </a>
                  ))}
                </div>
                <span className="cmp-ayuda">Compras los recibe junto con el pedido: no hace falta volver a cargarlos.</span>
              </div>
            )}
          </div>
        </section>

        {/* 2 · Ítems */}
        <section className={`cmp-paso${items.length ? " hecho" : ""}`}>
          <span className="cmp-paso-n">2</span>
          <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
            <div className="cmp-paso-tit" style={{ margin: "4px 0 0" }}>Ítems y a dónde va cada uno</div>

            {onLoadObraPlantilla && obrasPlantilla.length > 0 && (
              <div className="cmp-plantilla">
                <Package size={15} />
                <select className="ui-input" value={plantillaObra} onChange={(e) => setPlantillaObra(e.target.value)} aria-label="Plantilla de obra">
                  <option value="">Cargar los ítems de una plantilla de obra…</option>
                  {obrasPlantilla.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button type="button" className="ui-btn ui-btn-suave chico" onClick={handleLoadPlantilla} disabled={!plantillaObra || loadingPlantilla}>
                  {loadingPlantilla ? <LoaderCircle size={13} className="spin" /> : null}
                  {loadingPlantilla ? "Cargando…" : "Cargar"}
                </button>
              </div>
            )}

            {itemsByDest.map(([dest, list]) => (
              <div key={dest} className="cmp-items">
                <div className="cmp-items-dest">{dest}<span className="mono">{list.length}</span></div>
                {list.map((it) => {
                  const realIdx = items.indexOf(it);
                  const extra = isExtraItem(it);
                  const src = (it.catalogSource || "").toLowerCase()
                    || (origen === "torneria" ? "panol" : "")
                    || (origen === "maderas" ? "madera" : "")
                    || (origen === "laminacion" ? "laminacion" : "")
                    || (/^Stock\s+(Chubut|Pampa)/i.test(it.destination || "") ? "madera" : "laminacion");
                  const catalogo = { panol: "Catálogo pañol", madera: "Catálogo maderas", maderas: "Catálogo maderas", laminacion: "Catálogo laminación" }[src] || "Catálogo";
                  return (
                    <div key={realIdx} className={`cmp-pedir-fila${extra ? " extra" : ""}`}>
                      <div className="desc">
                        <input className="ui-input" value={it.description} onChange={(e) => updateItem(realIdx, { description: e.target.value })} placeholder="Descripción" aria-label="Descripción" />
                        {(extra || it.material_id) && (
                          <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {extra && <span className="cmp-tag" data-tono="cian">Extra · al stock</span>}
                            {it.material_id && <span className="cmp-tag" data-tono="teal"><Package size={10} /> {catalogo}</span>}
                          </span>
                        )}
                      </div>
                      <input className="ui-input num" value={it.quantity} onChange={(e) => updateItem(realIdx, { quantity: e.target.value })} placeholder="Cant." aria-label="Cantidad" />
                      <select className="ui-input" value={it.unit || "unidad"} onChange={(e) => updateItem(realIdx, { unit: e.target.value })} aria-label="Unidad">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <div className="dest">
                        <SelectorDestino
                          chico
                          obras={projects}
                          prefijoObra="Obra "
                          value={it.destination || ""}
                          onChange={(valor) => updateItem(realIdx, { destination: valor })}
                          otros={otrosDestinos}
                          placeholder="Destino…"
                        />
                      </div>
                      <button type="button" className="cmp-btn-ic chico peligro" onClick={() => removeItem(realIdx)} title="Quitar ítem" aria-label={`Quitar ${it.description}`}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="cmp-pedir-alta">
              <div className="cmp-rotulo">Sumar un ítem</div>
              <div className="cmp-pedir-alta-grilla">
                <input
                  className="ui-input desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newDesc.trim()) { e.preventDefault(); addCurrentItem(); } }}
                  placeholder="Qué es (ej.: Gelcoat MN2000B)"
                  aria-label="Descripción del ítem nuevo"
                />
                <input className="ui-input num" value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="Cant." aria-label="Cantidad" />
                <select className="ui-input" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} aria-label="Unidad">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <div className="dest">
                  <SelectorDestino
                    chico
                    obras={projects}
                    prefijoObra="Obra "
                    value={newDest}
                    onChange={(valor) => setNewDest(valor)}
                    otros={otrosDestinos}
                    placeholder="Para qué obra o stock…"
                  />
                </div>
                <input className="ui-input notas" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notas (opcional)" aria-label="Notas del ítem" />
                <button type="button" className="ui-btn ui-btn-suave" onClick={addCurrentItem} disabled={!newDesc.trim()}><Plus size={14} /> Sumar</button>
              </div>
              <span className="cmp-ayuda">El destino queda para los próximos ítems, así se cargan rápido varios para la misma obra.</span>
            </div>
          </div>
        </section>

        {/* 3 · Tipo y prioridad */}
        <section className={`cmp-paso${tipoPedido ? " hecho" : ""}`}>
          <span className="cmp-paso-n">3</span>
          <div style={{ minWidth: 0, display: "grid", gap: 12 }}>
            <div className="cmp-paso-tit" style={{ margin: "4px 0 0" }}>¿Qué tipo de pedido es?</div>
            <div className="cmp-tipos" role="radiogroup" aria-label="Tipo de pedido">
              {tipos.map((option) => {
                const active = tipoPedido === option.value;
                return (
                  <button key={option.value} type="button" role="radio" aria-checked={active} className={`cmp-tipo${active ? " on" : ""}`} data-tono={option.tono} onClick={() => setTipoPedido(option.value)}>
                    <b>{option.label}</b>
                    <small>{option.detail}</small>
                  </button>
                );
              })}
            </div>
            <div className="cmp-campo c6">
              <span>Prioridad</span>
              <div className="cmp-seg" role="radiogroup" aria-label="Prioridad">
                {PRIORIDADES.map((p) => (
                  <button key={p.value} type="button" role="radio" aria-checked={priority === p.value}
                    className={priority === p.value ? "on" : ""} data-tono={priority === p.value && p.value !== "media" ? p.tono : undefined}
                    onClick={() => setPriority(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </form>
    </Modal>
  );
}
