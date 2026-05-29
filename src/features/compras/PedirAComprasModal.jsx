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

// Cuando un purchase_request tiene items con destino "Stock Chubut/Pampa",
// además de los purchase_request_items creamos un pedido legacy en `pedidos`
// + `pedido_items` para que aparezca en el panel "Pedidos pendientes" del
// pañol. Al marcar "Llegó todo" desde ahí, un trigger DB sincroniza el
// purchase_request_item correspondiente. Ver migración 20260605000000.
//
// Cuando hay items con destino "Obra <código>", creamos un laminacion_pedidos
// por item (en laminación NO hay tabla de items aparte). Cuando el pedido pasa
// a "entregado", otro trigger DB sincroniza el purchase_request_item.
// Ver migración 20260606000000.
async function createLegacyPedidoIfNeeded({ purchaseRequest, requestItemsByDraft, title, profileId }) {
  const stockEntries = requestItemsByDraft.filter((entry) => {
    const dest = String(entry?.draft?.destination || "").trim();
    return /^Stock\s/i.test(dest);
  });
  if (stockEntries.length === 0) return;

  // Buscar match de material_id en el catálogo `materiales` por nombre (case-insensitive).
  // Esto es para que el item del pedido legacy quede ligado al stock real.
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

  const rows = stockEntries.map(({ draft, requestItem }) => {
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

// Items con destino "Obra X" → un row por item en laminacion_pedidos.
// El material_id del item debe apuntar a laminacion_materiales (catalog_source = "laminacion").
async function createLaminacionPedidosIfNeeded({ requestItemsByDraft, profileId }) {
  const obraEntries = requestItemsByDraft.filter((entry) => {
    const dest = String(entry?.draft?.destination || "").trim();
    return /^Obra\s+/i.test(dest);
  });
  if (obraEntries.length === 0) return;

  const rows = obraEntries
    .map(({ draft, requestItem }) => {
      // Si no tenemos material_id, no podemos insertar en laminacion_pedidos
      // porque la tabla requiere FK al catálogo. Lo saltamos con warning.
      const matId = draft.material_id || null;
      if (!matId) return null;
      const cantNum = Number.isFinite(Number(draft.quantity)) ? Number(draft.quantity) : 0;
      if (cantNum <= 0) return null;
      const obraName = String(draft.destination || "").replace(/^Obra\s+/i, "").trim();
      return {
        material_id: matId,
        cantidad: cantNum,
        estado: "pendiente",
        solicitado_por: profileId || null,
        observaciones: draft.notes || null,
        categoria: "estándar",
        obra_destino: obraName,
        purchase_request_item_id: requestItem?.id || null,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return;

  const { error } = await supabase.from("laminacion_pedidos").insert(rows);
  if (error) {
    console.warn("[PedirAComprasModal] no se pudieron insertar laminacion_pedidos:", error);
  }
}

// Destinos "fijos" para stock — además se suman dinámicamente las obras
// activas (vienen de produccion_obras).
const STOCK_DESTINATIONS = [
  { value: "Stock Chubut 2120", label: "Stock Chubut 2120" },
  { value: "Stock Pampa 1050",  label: "Stock Pampa 1050"  },
];

const UNITS = ["unidad", "kg", "litro", "metro", "m²", "lata", "rollo", "par", "juego", "caja", "placa"];

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
export default function PedirAComprasModal({ open, onClose, prefilled, profile }) {
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

  useEffect(() => {
    if (!open) return;
    setTitle(prefilled?.title || "");
    setDescription(prefilled?.description || "");
    setPriority(prefilled?.priority || "media");
    setItems(
      Array.isArray(prefilled?.items)
        ? prefilled.items.map((it) => ({
            description: it.description || "",
            quantity: it.quantity ?? "",
            unit: it.unit || "unidad",
            destination: it.destination || prefilled?.defaultDestination || "",
            notes: it.notes || "",
            link_url: it.link_url || "",
            image_url: it.image_url || "",
            material_id: it.material_id || null,
            catalogSource: it.catalogSource || it.catalog_source || "",
          }))
        : [],
    );
    setNewDest(prefilled?.defaultDestination || "");
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
            notes: it.notes || null,
            link_url: it.link_url || null,
            image_url: it.image_url || null,
            material_id: it.material_id || null,
            catalog_source: it.catalogSource || null,
          });
          return { draft: it, requestItem };
        }),
      );

      // Para items de Stock Chubut/Pampa: crear pedido legacy que aparezca
      // en el panel "Pedidos pendientes" del pañol.
      try {
        await createLegacyPedidoIfNeeded({
          purchaseRequest: created,
          requestItemsByDraft,
          title: title.trim(),
          profileId: profile?.id,
        });
      } catch (e) {
        // No bloquea: el purchase_request ya está creado.
        console.warn("[PedirAComprasModal] error creando pedido legacy:", e);
      }

      // Para items con destino "Obra X": crear laminacion_pedidos por item
      // (en laminación cada row ES un item, no hay tabla aparte).
      try {
        await createLaminacionPedidosIfNeeded({
          requestItemsByDraft,
          profileId: profile?.id,
        });
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
                    return (
                      <div key={realIdx} style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr 1fr auto" : "minmax(0, 1fr) 90px 100px 110px auto",
                        gap: 6,
                        padding: "6px 8px",
                        borderTop: `1px solid ${C.border}`,
                        alignItems: "center",
                        fontSize: 12,
                      }}>
                        <div style={{ display: "grid", gap: 4, minWidth: 0, gridColumn: isMobile ? "1 / -1" : undefined }}>
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
                            const isMadera = src === "madera"
                              || /^Stock\s+(Chubut|Pampa)/i.test(it.destination || "");
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
                        <select
                          value={it.destination || ""}
                          onChange={(e) => updateItem(realIdx, { destination: e.target.value })}
                          style={inp({ padding: "5px 7px", fontSize: 12, gridColumn: isMobile ? "1 / 3" : undefined })}
                        >
                          <option value="">Sin destino</option>
                          {destinationOptions.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
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
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}>
              <select
                value={newDest}
                onChange={(e) => setNewDest(e.target.value)}
                style={inp({ padding: "7px 9px", fontSize: 12 })}
              >
                <option value="">Sin destino</option>
                {destinationOptions.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
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
