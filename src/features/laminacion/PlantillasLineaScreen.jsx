import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";

const emptyDraft = { linea: "", nombre: "", descripcion: "", activa: true };

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function tmpId() {
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newItemDraft(order = 0) {
  return { id: tmpId(), material_id: "", cantidad: "", notas: "", orden: order };
}

export default function PlantillasLineaScreen({ profile, signOut }) {
  const toast = useToast();
  const { isMobile } = useResponsive();
  const role = profile?.role ?? "invitado";
  const canEdit = hasAdminAccess(profile) || role === "admin" || role === "tecnica";

  const [plantillas, setPlantillas] = useState([]);
  const [items, setItems] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [itemDrafts, setItemDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [p, i, m] = await Promise.all([
        supabase.from("linea_plantillas").select("*").order("linea"),
        supabase
          .from("linea_plantilla_items")
          .select("*, material:laminacion_materiales(id,nombre,unidad,categoria)")
          .order("orden", { ascending: true }),
        supabase.from("laminacion_materiales").select("id,nombre,unidad,categoria").order("nombre"),
      ]);
      if (p.error) throw p.error;
      if (i.error) throw i.error;
      if (m.error) throw m.error;
      setPlantillas(p.data ?? []);
      setItems(i.data ?? []);
      setMateriales(m.data ?? []);
      if (!selectedId && (p.data ?? []).length) setSelectedId(p.data[0].id);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las plantillas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => plantillas.find((p) => p.id === selectedId) ?? null,
    [plantillas, selectedId],
  );

  const materialById = useMemo(() => {
    const map = new Map();
    materiales.forEach((m) => map.set(m.id, m));
    return map;
  }, [materiales]);

  const itemCountByPlantilla = useMemo(() => {
    const map = {};
    items.forEach((it) => {
      map[it.plantilla_id] = (map[it.plantilla_id] ?? 0) + 1;
    });
    return map;
  }, [items]);

  useEffect(() => {
    if (!selected) {
      setDraft(emptyDraft);
      setItemDrafts([]);
      return;
    }
    setDraft({
      linea: selected.linea || "",
      nombre: selected.nombre || "",
      descripcion: selected.descripcion || "",
      activa: selected.activa !== false,
    });
    const nextItems = items
      .filter((it) => it.plantilla_id === selected.id)
      .sort((a, b) => num(a.orden) - num(b.orden))
      .map((it, idx) => ({
        id: it.id,
        material_id: it.material_id || "",
        cantidad: it.cantidad ?? "",
        notas: it.notas || "",
        orden: it.orden ?? idx,
      }));
    setItemDrafts(nextItems.length ? nextItems : [newItemDraft(0)]);
  }, [selected, items]);

  function startNew() {
    setSelectedId(null);
    setDraft(emptyDraft);
    setItemDrafts([newItemDraft(0)]);
  }

  function updateItem(id, patch) {
    setItemDrafts((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    setItemDrafts((prev) => prev.filter((it) => it.id !== id));
  }

  async function savePlantilla() {
    if (!canEdit) return;
    const linea = draft.linea.trim().toUpperCase();
    if (!linea) {
      toast.warning("Cargá la linea.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        linea,
        nombre: draft.nombre.trim() || null,
        descripcion: draft.descripcion.trim() || null,
        activa: draft.activa !== false,
      };

      const res = selectedId
        ? await supabase.from("linea_plantillas").update(payload).eq("id", selectedId).select().single()
        : await supabase.from("linea_plantillas").insert(payload).select().single();
      if (res.error) throw res.error;

      const plantillaId = res.data.id;
      const dedup = new Map();
      itemDrafts.forEach((it, idx) => {
        if (!it.material_id) return;
        dedup.set(it.material_id, {
          plantilla_id: plantillaId,
          material_id: it.material_id,
          cantidad: num(it.cantidad),
          orden: idx + 1,
          notas: it.notas?.trim() || null,
        });
      });

      const del = await supabase.from("linea_plantilla_items").delete().eq("plantilla_id", plantillaId);
      if (del.error) throw del.error;

      const nextItems = Array.from(dedup.values());
      if (nextItems.length) {
        const ins = await supabase.from("linea_plantilla_items").insert(nextItems);
        if (ins.error) throw ins.error;
      }

      setSelectedId(plantillaId);
      toast.success("Plantilla guardada.");
      await load();
    } catch (err) {
      setError(err.message || "No se pudo guardar la plantilla.");
      toast.error(err.message || "No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePlantilla() {
    if (!canEdit || !selectedId) return;
    const ok = window.confirm("Vas a borrar la plantilla y todos sus items. No se puede deshacer.");
    if (!ok) return;
    setSaving(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("linea_plantillas").delete().eq("id", selectedId);
      if (deleteError) throw deleteError;
      setSelectedId(null);
      setDraft(emptyDraft);
      setItemDrafts([]);
      toast.success("Plantilla eliminada.");
      await load();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la plantilla.");
      toast.error(err.message || "No se pudo eliminar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <Sidebar profile={profile} signOut={signOut} />

      <main style={{ flex: 1, minWidth: 0, overflow: "auto", padding: isMobile ? 14 : 22 }}>
        <style>{`
          select option { background: var(--panel-solid); color: var(--text); }
          input:focus, textarea:focus, select:focus {
            border-color: var(--focus) !important;
            box-shadow: 0 0 0 3px rgba(126,179,255,0.08);
          }
        `}</style>

        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 850, color: C.text }}>
              Plantillas por linea
            </h1>
            <p style={{ margin: "5px 0 0", color: C.dim, fontSize: 13, lineHeight: 1.45 }}>
              Recetas base de materiales de laminacion para K34, K37, K42, K43, K52, K55, K64 y Antago.
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={startNew} style={buttonStyle(C.blue, true)}>
              <Plus size={14} /> Nueva
            </button>
          )}
        </header>

        {!canEdit && (
          <div style={{ ...cardStyle(), marginBottom: 14, color: C.amber, borderColor: C.amber }}>
            Solo administracion y tecnica pueden editar plantillas.
          </div>
        )}

        {error && (
          <div style={{ ...cardStyle(), marginBottom: 14, color: C.red, borderColor: C.red }}>
            {error}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
        }}>
          <aside style={cardStyle({ padding: 8 })}>
            {loading ? (
              <div style={{ padding: 12, color: C.dim, fontSize: 13 }}>Cargando plantillas...</div>
            ) : plantillas.length === 0 ? (
              <div style={{ padding: 12, color: C.dim, fontSize: 13 }}>No hay plantillas cargadas.</div>
            ) : (
              plantillas.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      width: "100%",
                      border: `1px solid ${active ? C.blue : "transparent"}`,
                      background: active ? C.panel2 : "transparent",
                      color: active ? C.text : C.muted,
                      borderRadius: 8,
                      padding: "9px 10px",
                      display: "grid",
                      gap: 3,
                      cursor: "pointer",
                      textAlign: "left",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 850 }}>{p.linea}</span>
                      <span style={{ color: p.activa ? C.green : C.dim, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.1 }}>
                        {p.activa ? "Activa" : "Inactiva"}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nombre || "Sin nombre"} · {itemCountByPlantilla[p.id] ?? 0} items
                    </span>
                  </button>
                );
              })
            )}
          </aside>

          <section style={cardStyle({ padding: 16 })}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px 1fr 150px", gap: 10, marginBottom: 12 }}>
              <Field label="Linea">
                <input
                  value={draft.linea}
                  onChange={(e) => setDraft((d) => ({ ...d, linea: e.target.value.toUpperCase() }))}
                  placeholder="K42 o ANTAGO"
                  disabled={!canEdit}
                  style={inputStyle({ fontFamily: C.mono, fontWeight: 800 })}
                />
              </Field>
              <Field label="Nombre">
                <input
                  value={draft.nombre}
                  onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))}
                  placeholder="Klase A 52"
                  disabled={!canEdit}
                  style={inputStyle()}
                />
              </Field>
              <Field label="Estado">
                <label style={{
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "0 10px",
                  background: C.panel,
                  color: C.muted,
                  fontSize: 13,
                  fontWeight: 700,
                }}>
                  <input
                    type="checkbox"
                    checked={draft.activa !== false}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, activa: e.target.checked }))}
                  />
                  Activa
                </label>
              </Field>
            </div>

            <Field label="Descripcion">
              <textarea
                value={draft.descripcion}
                onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
                placeholder="Notas internas de la plantilla"
                disabled={!canEdit}
                rows={2}
                style={inputStyle({ resize: "vertical", marginBottom: 14 })}
              />
            </Field>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 850, color: C.text }}>Items de la plantilla</h2>
              <span style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{itemDrafts.filter((it) => it.material_id).length}</span>
              <span style={{ flex: 1 }} />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setItemDrafts((prev) => [...prev, newItemDraft(prev.length + 1)])}
                  style={buttonStyle(C.muted)}
                >
                  <Plus size={13} /> Item
                </button>
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {itemDrafts.map((it) => {
                const mat = materialById.get(it.material_id);
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 110px minmax(150px, 0.6fr) auto",
                      gap: 6,
                      alignItems: "center",
                      padding: 8,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.panel,
                    }}
                  >
                    <select
                      value={it.material_id}
                      disabled={!canEdit}
                      onChange={(e) => updateItem(it.id, { material_id: e.target.value })}
                      style={inputStyle()}
                    >
                      <option value="">Seleccionar material</option>
                      {materiales.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                    <input
                      value={it.cantidad}
                      disabled={!canEdit}
                      onChange={(e) => updateItem(it.id, { cantidad: e.target.value })}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Cantidad"
                      style={inputStyle({ fontFamily: C.mono })}
                    />
                    <input
                      value={it.notas}
                      disabled={!canEdit}
                      onChange={(e) => updateItem(it.id, { notas: e.target.value })}
                      placeholder={mat?.unidad ? `Notas (${mat.unidad})` : "Notas"}
                      style={inputStyle()}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        title="Quitar item"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 7,
                          border: `1px solid ${C.border}`,
                          background: "transparent",
                          color: C.dim,
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {canEdit && (
              <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  disabled={!selectedId || saving}
                  onClick={deletePlantilla}
                  style={buttonStyle(C.red, false, !selectedId || saving)}
                >
                  <Trash2 size={13} /> Borrar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={savePlantilla}
                  style={buttonStyle(C.green, true, saving)}
                >
                  <Save size={14} /> {saving ? "Guardando..." : "Guardar plantilla"}
                </button>
              </footer>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function cardStyle(over = {}) {
  return {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    background: C.panel,
    boxShadow: "0 14px 36px var(--shadow)",
    ...over,
  };
}

function inputStyle(over = {}) {
  return {
    width: "100%",
    minWidth: 0,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.panelSolid,
    color: C.text,
    padding: "9px 10px",
    outline: "none",
    fontSize: 13,
    fontFamily: C.sans,
    boxSizing: "border-box",
    ...over,
  };
}

function buttonStyle(color, primary = false, disabled = false) {
  return {
    border: `1px solid ${primary ? color : C.border}`,
    background: primary ? C.panel2 : "transparent",
    color: disabled ? C.dim : color,
    borderRadius: 8,
    padding: "9px 12px",
    cursor: disabled ? "default" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 800,
    fontFamily: C.sans,
    opacity: disabled ? 0.55 : 1,
  };
}
