import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Package, Plus, Send, Trash2, X } from "lucide-react";
import {
  addRequestItem,
  createPurchaseRequest,
  fetchProjects,
  notifyComprasEmail,
} from "@/features/compras/purchaseRequestsApi";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { useResponsive } from "@/hooks/useResponsive";

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
  const { isMobile } = useResponsive();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
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
    setSaving(true);
    try {
      // El project_id del pedido lo dejamos null (los destinos viven en los items).
      const created = await createPurchaseRequest({
        form: {
          title: title.trim(),
          description: description.trim(),
          priority,
          project_id: null,
          source: prefilled?.source || null,
          source_ref: prefilled?.source_ref || null,
          source_url: prefilled?.source_url || null,
        },
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
      if (origenEfectivo === "laminacion") {
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
      onClose(true);
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--overlay-strong)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid", placeItems: isMobile ? "end center" : "center",
        padding: isMobile ? 0 : 20,
        fontFamily: C.sans,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: C.panelSolid,
          border: `1px solid ${C.border}`,
          borderRadius: isMobile ? "14px 14px 0 0" : 14,
          padding: 0,
          width: "100%",
          maxWidth: isMobile ? "100%" : 720,
          maxHeight: isMobile ? "94vh" : "90vh",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          color: C.text,
          boxShadow: "0 30px 80px var(--shadow-strong)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "16px 18px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <Send size={17} color={C.blue} />
          <div style={{ fontSize: 15, fontWeight: 800 }}>Pedir a compras</div>
          {prefilled?.source && (
            <span style={{
              fontSize: 9, color: C.dim,
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "2px 6px",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginLeft: 6,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              {prefilled.sourceLabel || prefilled.source}
              {prefilled.source_url && (
                <a href={prefilled.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: C.blue, marginLeft: 4 }}>
                  <ExternalLink size={9} />
                </a>
              )}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => onClose()}
            style={{
              border: "none", background: "transparent",
              color: C.dim, cursor: "pointer", padding: 4,
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Body scrolleable ──────────────────────────────────────── */}
        <div style={{ overflowY: "auto", padding: 18, display: "grid", gap: 16 }}>

          {/* Título + Descripción */}
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={labelStyle}>Título</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Ej: "Solicitud Compra Materiales Laminación K52-26 y stock"'
                required
                style={inp()}
              />
            </div>
            <div>
              <div style={labelStyle}>Descripción (opcional)</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notas generales para compras"
                rows={2}
                style={inp({ resize: "vertical", minHeight: 50 })}
              />
            </div>
          </div>

          {/* Cargar plantilla de obra (reemplaza el modal-selector previo) */}
          {onLoadObraPlantilla && obrasPlantilla.length > 0 && (
            <div style={{
              border: `1px dashed ${C.border2}`,
              borderRadius: 9,
              padding: 11,
              background: "rgba(52,211,153,0.05)",
              display: "grid",
              gap: 8,
            }}>
              <div style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={12} color={C.teal} /> Cargar plantilla de obra (opcional)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                <select
                  value={plantillaObra}
                  onChange={(e) => setPlantillaObra(e.target.value)}
                  style={inp({ padding: "7px 9px", fontSize: 12 })}
                >
                  <option value="">Elegí una obra…</option>
                  {obrasPlantilla.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLoadPlantilla}
                  disabled={!plantillaObra || loadingPlantilla}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: plantillaObra && !loadingPlantilla ? C.teal : C.panel2,
                    color: plantillaObra && !loadingPlantilla ? "#04201a" : C.dim,
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 14px",
                    cursor: plantillaObra && !loadingPlantilla ? "pointer" : "default",
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: C.sans,
                    whiteSpace: "nowrap",
                  }}
                >
                  {loadingPlantilla ? "Cargando…" : "Cargar ítems"}
                </button>
              </div>
            </div>
          )}

          {/* Ítems ya agregados, agrupados por destino */}
          {items.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>Ítems del pedido — {items.length}</div>
              {itemsByDest.map(([dest, list]) => (
                <div
                  key={dest}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 9,
                    background: C.panel,
                    overflow: "hidden",
                  }}
                >
                  <div style={{
                    padding: "7px 11px",
                    background: C.panel2,
                    fontSize: 11,
                    fontWeight: 750,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    color: dest === "Sin destino" ? C.dim : C.text,
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    {dest}
                  </div>
                  {list.map((it) => {
                    const realIdx = items.indexOf(it);
                    const extra = isExtraItem(it);
                    return (
                      <div key={realIdx} style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr 1fr auto" : "minmax(0, 1fr) 90px 100px 110px auto",
                        gap: 6,
                        padding: "6px 8px",
                        borderTop: `1px solid ${C.border}`,
                        background: extra ? `${C.amber}0d` : "transparent",
                        alignItems: "center",
                        fontSize: 12,
                      }}>
                        <div style={{ display: "grid", gap: 4, minWidth: 0, gridColumn: isMobile ? "1 / -1" : undefined }}>
                          {extra && (
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              width: "fit-content",
                              color: C.amber,
                              background: `${C.amber}18`,
                              border: `1px solid ${C.amber}44`,
                              borderRadius: 5,
                              padding: "2px 6px",
                              fontSize: 10,
                              fontWeight: 850,
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                            }}>
                              Extra - Stock Pampa 1050
                            </span>
                          )}
                          <input
                            value={it.description}
                            onChange={(e) => updateItem(realIdx, { description: e.target.value })}
                          placeholder="Descripción"
                            style={inp({ padding: "5px 7px", fontSize: 12 })}
                          />
                          {it.material_id && (() => {
                            // catalogSource viene del caller que precargó el ítem
                            // ("laminacion" / "madera"). Si no llegó, lo inferimos del
                            // destino del ítem.
                            const src = (it.catalogSource || "").toLowerCase();
                            const isMadera = src
                              ? src === "madera"
                              : /^Stock\s+(Chubut|Pampa)/i.test(it.destination || "");
                            const label = isMadera ? "Catálogo maderas" : "Catálogo laminación";
                            return (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                width: "fit-content",
                                color: C.teal,
                                background: C.panel2,
                                border: `1px solid ${C.border}`,
                                borderRadius: 5,
                                padding: "2px 6px",
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.6,
                                textTransform: "uppercase",
                              }}>
                                <Package size={10} /> {label}
                              </span>
                            );
                          })()}
                        </div>
                        <input
                          value={it.quantity}
                          onChange={(e) => updateItem(realIdx, { quantity: e.target.value })}
                          placeholder="Cant."
                          style={inp({ padding: "5px 7px", fontSize: 12 })}
                        />
                        <select
                          value={it.unit || "unidad"}
                          onChange={(e) => updateItem(realIdx, { unit: e.target.value })}
                          style={inp({ padding: "5px 7px", fontSize: 12 })}
                        >
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <input
                          value={it.destination || ""}
                          onChange={(e) => updateItem(realIdx, { destination: e.target.value })}
                          list="dest-options"
                          placeholder="Destino (obra o stock…)"
                          autoComplete="off"
                          style={inp({ padding: "5px 7px", fontSize: 12, gridColumn: isMobile ? "1 / 3" : undefined })}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(realIdx)}
                          title="Eliminar ítem"
                          style={{
                            border: "none", background: "transparent",
                            color: C.dim, cursor: "pointer", padding: 4,
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Form para agregar ítem nuevo */}
          <div
            style={{
              border: `1px dashed ${C.border2}`,
              borderRadius: 9,
              padding: 11,
              background: "rgba(96,165,250,0.04)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 0 }}>
              + Agregar ítem
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 90px 100px",
              gap: 6,
            }}>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={inp({ padding: "7px 9px", fontSize: 12, gridColumn: isMobile ? "1 / -1" : undefined })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newDesc.trim()) {
                    e.preventDefault();
                    addCurrentItem();
                  }
                }}
                placeholder="Descripción (ej. GELCOAT MN2000B)"
              />
              <input
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder='Cant. (ej. "260")'
                style={inp({ padding: "7px 9px", fontSize: 12 })}
              />
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                style={inp({ padding: "7px 9px", fontSize: 12 })}
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <datalist id="dest-options">
              {destinationOptions.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </datalist>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}>
              <input
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
                list="dest-options"
                placeholder="Destino (obra o stock…)"
                autoComplete="off"
                style={inp({ padding: "7px 9px", fontSize: 12 })}
              />
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder='Notas (opcional, ej. "para Hernán López")'
                style={inp({ padding: "7px 9px", fontSize: 12 })}
              />
            </div>
            <button
              type="button"
              onClick={addCurrentItem}
              disabled={!newDesc.trim()}
              style={{
                justifySelf: "start",
                display: "inline-flex", alignItems: "center", gap: 5,
                background: newDesc.trim() ? C.blue : C.panel2,
                color: newDesc.trim() ? "#fff" : C.dim,
                border: "none",
                borderRadius: 7,
                padding: "6px 12px",
                cursor: newDesc.trim() ? "pointer" : "default",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: C.sans,
              }}
            >
              <Plus size={13} /> Agregar al pedido
            </button>
          </div>

          {/* Prioridad */}
          <div>
            <div style={labelStyle}>Prioridad</div>
            <div style={{ display: "flex", gap: 5 }}>
              {[
                { v: "baja",    l: "Baja",    c: C.dim    },
                { v: "media",   l: "Media",   c: C.blue   },
                { v: "alta",    l: "Alta",    c: C.amber  },
                { v: "urgente", l: "Urgente", c: C.red    },
              ].map((p) => {
                const active = priority === p.v;
                return (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => setPriority(p.v)}
                    style={{
                      border: `1px solid ${active ? p.c + "66" : C.border}`,
                      background: active ? `${p.c}1c` : "transparent",
                      color: active ? p.c : C.dim,
                      borderRadius: 7,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}
                  >
                    {p.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          padding: "12px 18px",
          borderTop: `1px solid ${C.border}`,
          background: C.panel,
        }}>
          <button
            type="button"
            onClick={() => onClose()}
            style={{
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.dim,
              borderRadius: 7,
              padding: "9px 16px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: C.sans,
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || items.length === 0}
            style={{
              border: "none",
              background: saving || !title.trim() || items.length === 0 ? C.panel2 : C.blue,
              color: saving || !title.trim() || items.length === 0 ? C.dim : "#fff",
              borderRadius: 7,
              padding: "9px 16px",
              cursor: saving || !title.trim() || items.length === 0 ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: C.sans,
              letterSpacing: 0.3,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {saving ? "Enviando…" : <><Send size={13} /> Enviar a compras</>}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle = {
  color: "var(--dim)",
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontWeight: 750,
  marginBottom: 6,
};

function inp(over) {
  return {
    width: "100%",
    border: `1px solid var(--border)`,
    borderRadius: 7,
    background: "var(--panel)",
    color: "var(--text)",
    padding: "8px 11px",
    fontSize: 13,
    fontFamily: "var(--font-sans, 'Outfit', system-ui, sans-serif)",
    outline: "none",
    ...over,
  };
}
