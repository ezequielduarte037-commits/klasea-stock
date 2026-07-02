import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { C } from "@/theme";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, LBL } from "@/features/rrhh/ui";
import { MODELOS, norm } from "./materialesParser";
import {
  actualizarMatrizCondicionante,
  agregarMatrizCondicionanteItem,
  borrarMatrizCondicionante,
  borrarMatrizCondicionanteItem,
  crearMatrizCondicionante,
  fetchMatrizCondicionantes,
} from "./materialesConfig";

const TIPOS = [
  ["opcional_estandar", "Opcional estandar"],
  ["configuracion", "Configuracion"],
  ["motorizacion", "Motorizacion"],
  ["equipamiento", "Equipamiento"],
  ["otro", "Otro"],
];

const ITEM_TIPOS = [
  ["matriz", "Suma cantidad"],
  ["extra", "Agrega item"],
  ["quita", "Resta cantidad"],
];

function tipoLabel(value) {
  return TIPOS.find(([key]) => key === value)?.[1] || value || "Condicionante";
}

function itemTipoLabel(value) {
  return ITEM_TIPOS.find(([key]) => key === value)?.[1] || value || "Item";
}

function fmtQty(value, unidad) {
  if (value == null || value === "") return unidad || "-";
  const n = Number(value);
  const qty = Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : String(value);
  return [qty, unidad].filter(Boolean).join(" ");
}

function CondicionanteItemForm({ condicionante, materiales, onDone }) {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ material_id: "", descripcion: "", cantidad: "", unidad: "", tipo_item: "matriz", notas: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    const term = norm(q);
    if (term.length < 2) return [];
    return (materiales || [])
      .filter((material) => material.activo !== false)
      .filter((material) => norm([material.descripcion, material.codigo, material.proveedor].filter(Boolean).join(" ")).includes(term))
      .slice(0, 8);
  }, [materiales, q]);

  function selectMaterial(material) {
    setQ(material.descripcion || "");
    setDraft((prev) => ({
      ...prev,
      material_id: material.id,
      descripcion: material.descripcion || "",
      unidad: material.unidad_medida || prev.unidad || "unidad",
    }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await agregarMatrizCondicionanteItem({
        ...draft,
        condicionante_id: condicionante.id,
        descripcion: draft.descripcion || q,
        orden: (condicionante.items?.length || 0) + 1,
      });
      setQ("");
      setDraft({ material_id: "", descripcion: "", cantidad: "", unidad: "", tipo_item: "matriz", notas: "" });
      await onDone?.();
    } catch (e) {
      setError(e?.message || "No se pudo agregar el item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 10, padding: 10, display: "grid", gap: 8, background: C.bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 7, alignItems: "start" }}>
        <div style={{ position: "relative", minWidth: 0 }}>
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setDraft((prev) => ({ ...prev, material_id: "", descripcion: event.target.value }));
            }}
            placeholder="Buscar item base o escribir item condicionado..."
            style={{ ...INP, width: "100%" }}
          />
          {matches.length > 0 && (
            <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "calc(100% + 4px)", border: `1px solid ${C.b1}`, background: C.panelSolid, borderRadius: 10, padding: 5, boxShadow: "0 10px 24px rgba(0,0,0,0.28)", maxHeight: 250, overflowY: "auto" }}>
              {matches.map((material) => (
                <button key={material.id} type="button" onClick={() => selectMaterial(material)} style={{ display: "grid", width: "100%", textAlign: "left", border: "none", background: "transparent", color: C.t1, cursor: "pointer", padding: "7px 9px", borderRadius: 7, fontFamily: C.sans }}>
                  <span style={{ fontSize: 12.5, fontWeight: 850 }}>{material.descripcion}</span>
                  <span style={{ fontSize: 10.5, color: C.t3 }}>{[material.codigo, material.proveedor].filter(Boolean).join(" · ") || "sin codigo"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input value={draft.cantidad} onChange={(event) => setDraft((prev) => ({ ...prev, cantidad: event.target.value }))} placeholder="Cant." style={{ ...INP, width: "100%", fontFamily: C.mono }} />
        <input value={draft.unidad} onChange={(event) => setDraft((prev) => ({ ...prev, unidad: event.target.value }))} placeholder="Unidad" style={{ ...INP, width: "100%" }} />
        <select value={draft.tipo_item} onChange={(event) => setDraft((prev) => ({ ...prev, tipo_item: event.target.value }))} style={{ ...INP, width: "100%" }}>
          {ITEM_TIPOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" onClick={save} disabled={saving || !(draft.descripcion || q).trim()} style={{ ...BTN_GREEN, height: 38, opacity: saving ? 0.65 : 1 }}>
          <Plus size={13} /> Agregar
        </button>
      </div>
      <input value={draft.notas} onChange={(event) => setDraft((prev) => ({ ...prev, notas: event.target.value }))} placeholder="Ej: si hay vestidor suma 9 bisagras sobre la base" style={{ ...INP, width: "100%" }} />
      {error && <div style={{ color: C.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function CondicionanteCard({ condicionante, materiales, onReload }) {
  const [busy, setBusy] = useState(false);

  async function update(patch) {
    setBusy(true);
    try {
      await actualizarMatrizCondicionante(condicionante.id, patch);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Borrar condicionante "${condicionante.nombre}"?`)) return;
    setBusy(true);
    try {
      await borrarMatrizCondicionante(condicionante.id);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item) {
    setBusy(true);
    try {
      await borrarMatrizCondicionanteItem(item.id);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: 13, borderBottom: `1px solid ${C.b0}`, display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 950, color: C.t0 }}>{condicionante.nombre}</div>
            <span style={{ fontSize: 10.5, color: C.blue, border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>{tipoLabel(condicionante.tipo)}</span>
            <span style={{ fontSize: 10.5, color: condicionante.activo_por_defecto ? C.green : C.amber, border: `1px solid ${condicionante.activo_por_defecto ? C.greenB : C.amberB}`, background: condicionante.activo_por_defecto ? C.greenL : C.amberL, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>
              {condicionante.activo_por_defecto ? "Activo por defecto" : "No viene por defecto"}
            </span>
          </div>
          {condicionante.descripcion && <div style={{ color: C.t2, fontSize: 12, marginTop: 5, lineHeight: 1.4 }}>{condicionante.descripcion}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => update({ activo_por_defecto: !condicionante.activo_por_defecto })} style={{ ...BTN, padding: "6px 9px", fontSize: 11 }}>
            {condicionante.activo_por_defecto ? "Pasar a opcional" : "Activar por defecto"}
          </button>
          <button type="button" disabled={busy} onClick={remove} style={{ ...BTN, padding: "6px 8px", color: C.red }} title="Borrar">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {condicionante.items?.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {condicionante.items.map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, alignItems: "center", border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: "8px 9px" }}>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 900, color: C.t0 }}>{fmtQty(item.cantidad, item.unidad)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                  <div style={{ color: C.t3, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.material?.codigo || item.notas || "item condicionado"}</div>
                </div>
                <span style={{ justifySelf: "start", fontSize: 10.5, color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "2px 7px" }}>{itemTipoLabel(item.tipo_item)}</span>
                <button type="button" disabled={busy} onClick={() => removeItem(item)} style={{ ...BTN, padding: "5px 7px", color: C.red }} title="Quitar item">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 10, padding: 14, color: C.t2, fontSize: 12, textAlign: "center" }}>
            Todavia no tiene items asociados.
          </div>
        )}
        <CondicionanteItemForm condicionante={condicionante} materiales={materiales} onDone={onReload} />
      </div>
    </section>
  );
}

export default function MatrizCondicionantesTab({ materiales = [] }) {
  const [modelo, setModelo] = useState("55");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ nombre: "", tipo: "opcional_estandar", descripcion: "", activo_por_defecto: true });
  const modelos = useMemo(() => MODELOS.map((m) => String(m)), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMatrizCondicionantes();
      setRows(res.condicionantes ?? []);
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los condicionantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => rows.filter((row) => String(row.modelo) === String(modelo)), [rows, modelo]);

  async function create() {
    try {
      await crearMatrizCondicionante({ ...draft, modelo, orden: filtered.length + 1 });
      setDraft({ nombre: "", tipo: "opcional_estandar", descripcion: "", activo_por_defecto: true });
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo crear el condicionante.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1180 }}>
      <div style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 14, padding: 16, display: "grid", gap: 13 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 950, color: C.t0 }}>Condicionantes de matriz</div>
          <div style={{ color: C.t2, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            Para opcionales estandar y configuraciones tecnicas de cada modelo. Ej: K55 base lleva 20 bisagras; si lleva vestidor, este condicionante suma 9 mas sobre el mismo item.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={LBL}>Modelo</span>
            <select value={modelo} onChange={(event) => setModelo(event.target.value)} style={{ ...INP, width: "100%" }}>
              {modelos.map((m) => <option key={m} value={m}>K{m}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={LBL}>Condicionante</span>
            <input value={draft.nombre} onChange={(event) => setDraft((prev) => ({ ...prev, nombre: event.target.value }))} placeholder="Ej. Camarote marinero" style={{ ...INP, width: "100%" }} />
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={LBL}>Tipo</span>
            <select value={draft.tipo} onChange={(event) => setDraft((prev) => ({ ...prev, tipo: event.target.value }))} style={{ ...INP, width: "100%" }}>
              {TIPOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={LBL}>Detalle</span>
            <input value={draft.descripcion} onChange={(event) => setDraft((prev) => ({ ...prev, descripcion: event.target.value }))} placeholder="Cuando aplica / que significa" style={{ ...INP, width: "100%" }} />
          </label>
          <button type="button" onClick={create} disabled={!draft.nombre.trim()} style={{ ...BTN_PRIMARY, height: 38, opacity: draft.nombre.trim() ? 1 : 0.6 }}>
            <Plus size={14} /> Crear
          </button>
        </div>

        <label style={{ display: "inline-flex", gap: 7, alignItems: "center", color: C.t1, fontSize: 12, fontWeight: 750 }}>
          <input type="checkbox" checked={draft.activo_por_defecto} onChange={(event) => setDraft((prev) => ({ ...prev, activo_por_defecto: event.target.checked }))} />
          Viene activo por defecto en la matriz del modelo
        </label>
      </div>

      {error && <div style={{ color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 10, padding: 10, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 24, color: C.t2, fontSize: 13 }}>Cargando condicionantes...</div>
      ) : filtered.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((condicionante) => (
            <CondicionanteCard key={condicionante.id} condicionante={condicionante} materiales={materiales} onReload={load} />
          ))}
        </div>
      ) : (
        <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 14, padding: 28, color: C.t2, textAlign: "center", fontSize: 13 }}>
          No hay condicionantes para K{modelo}. Crea el primero arriba.
        </div>
      )}
    </div>
  );
}
