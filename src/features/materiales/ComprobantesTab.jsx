import { useMemo, useState } from "react";
import { Bot, FileText, Plus, Save, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  aplicarPreciosComprobante,
  borrarComprobanteItem,
  crearMaterial,
  guardarComprobante,
  guardarComprobanteItems,
  guardarProveedor,
  leerComprobanteConIA,
} from "./api";
import { norm } from "./materialesParser";
import { fmtMoney } from "./format";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, LBL, Td, Th } from "@/features/rrhh/ui";
import { C } from "@/theme";

const MONEDAS = ["ARS", "USD"];

function emptyComprobante() {
  return {
    id: null,
    proveedor_id: "",
    proveedor: "",
    numero: "",
    fecha: new Date().toISOString().slice(0, 10),
    moneda: "ARS",
    archivo_url: "",
    estado: "borrador",
    total: "",
  };
}

function emptyItem(comprobanteId = null) {
  return {
    id: null,
    comprobante_id: comprobanteId,
    material_id: "",
    descripcion: "",
    cantidad: "",
    precio_unitario: "",
    total: "",
    aplicado: false,
    _catId: "",
  };
}

function toInput(value) {
  return value == null ? "" : String(value);
}

function normalizeItems(items, comprobanteId) {
  return (items ?? []).map((item) => ({
    id: item.id ?? null,
    comprobante_id: item.comprobante_id ?? comprobanteId ?? null,
    material_id: item.material_id ?? "",
    descripcion: item.descripcion ?? "",
    cantidad: toInput(item.cantidad),
    precio_unitario: toInput(item.precio_unitario),
    total: toInput(item.total),
    aplicado: item.aplicado ?? false,
    _catId: "",
  }));
}

function parseNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function scoreMaterial(material, query) {
  const q = norm(query);
  if (!q) return 0;
  const d = norm(material.descripcion);
  if (d === q) return 100;
  if (d.includes(q) || q.includes(d)) return 70;
  const words = q.split(" ").filter((w) => w.length > 2);
  return words.reduce((acc, word) => acc + (d.includes(word) ? 6 : 0), 0);
}

function topMateriales(materiales, query) {
  return [...materiales]
    .map((m) => ({ material: m, score: scoreMaterial(m, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.material.descripcion.localeCompare(b.material.descripcion, "es"))
    .slice(0, 18)
    .map((r) => r.material);
}

function ProveedorPicker({ value, textValue, proveedores, onChange, onCreate }) {
  const activos = (proveedores ?? []).filter((p) => p.activo !== false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    const nombre = newName.trim() || textValue?.trim();
    if (!nombre || creating) return;
    setCreating(true);
    try {
      const id = await guardarProveedor({ nombre, activo: true });
      await onCreate?.();
      onChange(id, nombre);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <select value={value || ""} onChange={(e) => {
        const p = activos.find((row) => row.id === e.target.value);
        onChange(e.target.value, p?.nombre || "");
      }} style={{ ...INP, width: "100%" }}>
        <option value="">Proveedor sin vincular</option>
        {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {!value && (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={textValue ? `Crear: ${textValue}` : "+ Crear proveedor"} style={{ ...INP, flex: 1 }} />
          <button type="button" onClick={create} disabled={creating || !(newName.trim() || textValue?.trim())} style={{ ...BTN, padding: "6px 9px" }}>
            {creating ? "…" : "Crear"}
          </button>
        </div>
      )}
    </div>
  );
}

function MaterialMatch({ item, materiales, categorias, onChange, onCreated }) {
  const [query, setQuery] = useState(item.descripcion || "");
  const suggestions = topMateriales(materiales.filter((m) => m.activo !== false), query || item.descripcion);
  const selected = materiales.find((m) => m.id === item.material_id);

  async function createMaterialFromItem() {
    const catId = item._catId || categorias[0]?.id;
    if (!catId || !item.descripcion?.trim()) return;
    const materialId = await crearMaterial({
      categoria_id: catId,
      descripcion: item.descripcion.trim(),
      proveedor: "",
      proveedor_id: null,
      unidad_medida: "",
      revisado: false,
    });
    onChange({ ...item, material_id: materialId, _catId: catId });
    await onCreated?.();
  }

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 260 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar material" style={{ ...INP, flex: 1 }} />
        {selected && <button type="button" onClick={() => onChange({ ...item, material_id: "" })} style={{ ...BTN, padding: "6px 8px" }}>x</button>}
      </div>
      <select value={item.material_id || ""} onChange={(e) => onChange({ ...item, material_id: e.target.value })} style={{ ...INP, width: "100%" }}>
        <option value="">{selected ? selected.descripcion : "Elegir material…"}</option>
        {suggestions.map((m) => <option key={m.id} value={m.id}>{m.descripcion}</option>)}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={item._catId || categorias[0]?.id || ""} onChange={(e) => onChange({ ...item, _catId: e.target.value })} style={{ ...INP, flex: 1 }}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button type="button" onClick={createMaterialFromItem} disabled={!item.descripcion?.trim()} style={{ ...BTN_PRIMARY, padding: "6px 9px" }}>
          <Plus size={13} /> Crear
        </button>
      </div>
    </div>
  );
}

function ComprobanteList({ comprobantes, selectedId, onSelect }) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (comprobantes ?? [])
      .filter((c) => !query || `${c.proveedor ?? ""} ${c.numero ?? ""}`.toLowerCase().includes(query))
      .slice(0, 80);
  }, [comprobantes, q]);

  return (
    <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <FileText size={15} color={C.t2} />
        <div style={{ fontSize: 13, color: C.t0, fontWeight: 700, flex: 1 }}>Comprobantes cargados</div>
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: C.t2 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ ...INP, width: "100%", paddingLeft: 28 }} />
      </div>
      <div style={{ display: "grid", gap: 6, maxHeight: 520, overflowY: "auto" }}>
        {visibles.map((c) => {
          const on = c.id === selectedId;
          return (
            <button key={c.id} type="button" onClick={() => onSelect(c)} style={{
              textAlign: "left",
              border: `1px solid ${on ? "rgba(59,130,246,.35)" : C.b0}`,
              background: on ? "rgba(59,130,246,.08)" : C.panel,
              borderRadius: 9,
              padding: 10,
              color: C.t0,
              cursor: "pointer",
              display: "block",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                <strong style={{ fontSize: 13 }}>{c.proveedor || "Sin proveedor"}</strong>
                <span style={{ fontSize: 10, color: c.estado === "procesado" ? C.green : C.amber, textTransform: "uppercase" }}>{c.estado || "borrador"}</span>
              </div>
              <div style={{ fontSize: 12, color: C.t2 }}>{c.fecha || "sin fecha"} · Nº {c.numero || "—"}</div>
              <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{c.items?.length ?? 0} ítems · {fmtMoney(c.total, c.moneda)}</div>
            </button>
          );
        })}
        {!visibles.length && <div style={{ color: C.t2, fontSize: 12, padding: 8 }}>Sin comprobantes.</div>}
      </div>
    </div>
  );
}

export default function ComprobantesTab({ categorias, materiales, proveedores, comprobantes, onChanged }) {
  const [form, setForm] = useState(emptyComprobante());
  const [items, setItems] = useState([]);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  function selectComprobante(c) {
    setForm({
      id: c.id,
      proveedor_id: c.proveedor_id || "",
      proveedor: c.proveedor || "",
      numero: c.numero || "",
      fecha: c.fecha || "",
      moneda: c.moneda || "ARS",
      archivo_url: c.archivo_url || "",
      estado: c.estado || "borrador",
      total: toInput(c.total),
    });
    setItems(normalizeItems(c.items, c.id));
    setFile(null);
    setMsg(null);
    setErr(null);
  }

  function nuevo() {
    setForm(emptyComprobante());
    setItems([]);
    setFile(null);
    setMsg(null);
    setErr(null);
  }

  function updateItem(idx, patch) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  async function saveAll() {
    if (saving) return null;
    setSaving(true);
    setErr(null);
    try {
      const saved = await guardarComprobante(form, file);
      const cleanItems = items
        .filter((item) => item.descripcion?.trim())
        .map((item) => ({ ...item, comprobante_id: saved.id }));
      const savedItems = await guardarComprobanteItems(saved.id, cleanItems);
      setForm({ ...saved, total: toInput(saved.total), proveedor_id: saved.proveedor_id || "", proveedor: saved.proveedor || "" });
      setItems(normalizeItems(savedItems, saved.id));
      setFile(null);
      await onChanged?.();
      setMsg("Comprobante guardado.");
      return { comprobante: saved, items: savedItems };
    } catch (e) {
      setErr(e);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function readWithAi() {
    if (!file || reading) return;
    setReading(true);
    setErr(null);
    setMsg(null);
    try {
      const data = await leerComprobanteConIA(file);
      if (data.proveedor && !form.proveedor) setForm((f) => ({ ...f, proveedor: data.proveedor }));
      if (data.numero && !form.numero) setForm((f) => ({ ...f, numero: data.numero }));
      if (data.fecha && !form.fecha) setForm((f) => ({ ...f, fecha: data.fecha }));
      const aiItems = normalizeItems(data.items, form.id).map((item) => ({ ...item, aplicado: false }));
      if (aiItems.length) setItems((prev) => [...prev, ...aiItems]);
      setMsg(`IA leyó ${aiItems.length} líneas. Revisalas antes de aplicar.`);
    } catch (e) {
      setErr(e);
    } finally {
      setReading(false);
    }
  }

  async function applyPrices() {
    setApplying(true);
    setErr(null);
    setMsg(null);
    try {
      const saved = await saveAll();
      if (!saved) return;
      const result = await aplicarPreciosComprobante(saved.comprobante, saved.items);
      await onChanged?.();
      setMsg(`${result.actualizados} precios actualizados. Comprobante marcado como procesado.`);
      const refreshed = (comprobantes ?? []).find((c) => c.id === saved.comprobante.id);
      if (refreshed) selectComprobante(refreshed);
    } catch (e) {
      setErr(e);
    } finally {
      setApplying(false);
    }
  }

  async function removeItem(idx) {
    const item = items[idx];
    if (item?.id) await borrarComprobanteItem(item.id);
    setItems((prev) => prev.filter((_, i) => i !== idx));
    await onChanged?.();
  }

  const totalCalc = items.reduce((sum, item) => sum + (parseNumber(item.total) ?? 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
      <ComprobanteList comprobantes={comprobantes} selectedId={form.id} onSelect={selectComprobante} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, color: C.t0, fontWeight: 700 }}>{form.id ? "Editar comprobante" : "Nuevo comprobante"}</div>
            <div style={{ fontSize: 12, color: C.t2 }}>Remitos, facturas o presupuestos para actualizar precios reales.</div>
          </div>
          <button type="button" onClick={nuevo} style={BTN_PRIMARY}><Plus size={14} /> Nuevo</button>
        </div>

        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <div>
              <label style={LBL}>Proveedor</label>
              <ProveedorPicker
                value={form.proveedor_id}
                textValue={form.proveedor}
                proveedores={proveedores}
                onCreate={onChanged}
                onChange={(id, nombre) => setForm((f) => ({ ...f, proveedor_id: id, proveedor: nombre }))}
              />
            </div>
            <div>
              <label style={LBL}>Proveedor texto</label>
              <input value={form.proveedor || ""} onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Número</label>
              <input value={form.numero || ""} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Fecha</label>
              <input type="date" value={form.fecha || ""} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Moneda</label>
              <select value={form.moneda || "ARS"} onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))} style={{ ...INP, width: "100%" }}>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Archivo</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...INP, width: "100%" }} />
              {form.archivo_url && <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Guardado: {form.archivo_url}</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" onClick={saveAll} disabled={saving} style={BTN_GREEN}>
              <Save size={14} /> {saving ? "Guardando…" : "Guardar comprobante"}
            </button>
            <button type="button" onClick={readWithAi} disabled={reading || !file || !file.type.startsWith("image/")} style={BTN_PRIMARY}>
              <Wand2 size={14} /> {reading ? "Leyendo…" : "Leer con IA"}
            </button>
            <button type="button" onClick={applyPrices} disabled={applying || !items.some((item) => item.material_id && !item.aplicado)} style={{ ...BTN_PRIMARY, borderColor: "rgba(16,185,129,.35)", color: C.green }}>
              <Sparkles size={14} /> {applying ? "Aplicando…" : "Aplicar al catálogo"}
            </button>
          </div>
          {msg && <div style={{ marginTop: 10, fontSize: 13, color: C.green }}>{msg}</div>}
          {err && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{String(err.message ?? err)}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: C.t0, fontWeight: 700 }}>
            Ítems del comprobante <span style={{ color: C.t2, fontFamily: C.mono }}>{items.length}</span>
          </div>
          <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem(form.id)])} style={BTN}>
            <Plus size={14} /> Agregar línea
          </button>
        </div>

        <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Descripción</Th>
                <Th>Cant.</Th>
                <Th>Unitario</Th>
                <Th>Total</Th>
                <Th>Material</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <Td style={{ minWidth: 260 }}>
                    <input value={item.descripcion || ""} onChange={(e) => updateItem(idx, { descripcion: e.target.value })} style={{ ...INP, width: "100%" }} />
                  </Td>
                  <Td style={{ minWidth: 90 }}>
                    <input type="number" step="any" value={item.cantidad ?? ""} onChange={(e) => {
                      const cantidad = e.target.value;
                      const total = parseNumber(cantidad) != null && parseNumber(item.precio_unitario) != null
                        ? String(Number(cantidad) * Number(item.precio_unitario))
                        : item.total;
                      updateItem(idx, { cantidad, total });
                    }} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
                  </Td>
                  <Td style={{ minWidth: 110 }}>
                    <input type="number" step="any" value={item.precio_unitario ?? ""} onChange={(e) => {
                      const precio_unitario = e.target.value;
                      const total = parseNumber(item.cantidad) != null && parseNumber(precio_unitario) != null
                        ? String(Number(item.cantidad) * Number(precio_unitario))
                        : item.total;
                      updateItem(idx, { precio_unitario, total });
                    }} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
                  </Td>
                  <Td style={{ minWidth: 110 }}>
                    <input type="number" step="any" value={item.total ?? ""} onChange={(e) => updateItem(idx, { total: e.target.value })} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
                  </Td>
                  <Td>
                    <MaterialMatch
                      item={item}
                      materiales={materiales}
                      categorias={categorias}
                      onChange={(next) => updateItem(idx, next)}
                      onCreated={onChanged}
                    />
                  </Td>
                  <Td color={item.aplicado ? C.green : C.t2}>{item.aplicado ? "Aplicado" : "Pendiente"}</Td>
                  <Td>
                    <button type="button" onClick={() => removeItem(idx)} style={{ ...BTN, color: C.red, padding: "6px 8px" }}>
                      <Trash2 size={13} />
                    </button>
                  </Td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 22, textAlign: "center", color: C.t2, fontSize: 13 }}>
                    Agregá líneas manualmente o subí una foto y tocá “Leer con IA”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: C.t2, fontSize: 12, gap: 8, flexWrap: "wrap" }}>
          <span><Bot size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />La IA sólo propone: revisá y corregí antes de aplicar.</span>
          <strong style={{ color: C.t0 }}>Total líneas: {fmtMoney(totalCalc, form.moneda)}</strong>
        </div>
      </div>
    </div>
  );
}
