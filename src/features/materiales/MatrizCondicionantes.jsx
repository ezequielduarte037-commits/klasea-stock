import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { C } from "@/theme";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, LBL } from "@/features/rrhh/ui";
import { MODELOS, norm } from "./materialesParser";
import { crearMaterial } from "./api";
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

function matchMaterialSearch(material, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = norm([
    material.descripcion,
    material.alias,
    material.codigo,
    material.codigo_barra,
    material.proveedor,
    material.unidad_medida,
  ].filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

function materialSearchScore(material, query) {
  const phrase = norm(query);
  const desc = norm(material.descripcion || "");
  if (desc === phrase) return 0;
  if (desc.startsWith(phrase)) return 1;
  if (desc.includes(phrase)) return 2;
  return 3;
}

function fmtQty(value, unidad) {
  if (value == null || value === "") return unidad || "-";
  const n = Number(value);
  const qty = Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : String(value);
  return [qty, unidad].filter(Boolean).join(" ");
}

function CondicionanteItemForm({ condicionante, materiales, categorias = [], onDone, onMaterialCreated }) {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ material_id: "", descripcion: "", cantidad: "", unidad: "", tipo_item: "matriz", notas: "" });
  const [categoriaId, setCategoriaId] = useState("");
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!categoriaId && categorias[0]?.id) setCategoriaId(categorias[0].id);
  }, [categorias, categoriaId]);

  const matches = useMemo(() => {
    if (norm(q).length < 2) return [];
    return (materiales || [])
      .filter((material) => material.activo !== false)
      .filter((material) => matchMaterialSearch(material, q))
      .sort((a, b) => materialSearchScore(a, q) - materialSearchScore(b, q) || String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es"))
      .slice(0, 8);
  }, [materiales, q]);

  const selectedMaterial = useMemo(
    () => (draft.material_id ? (materiales || []).find((material) => material.id === draft.material_id) : null),
    [draft.material_id, materiales],
  );

  function selectMaterial(material) {
    setQ(material.descripcion || "");
    setMatchesOpen(false);
    setDraft((prev) => ({
      ...prev,
      material_id: material.id,
      descripcion: material.descripcion || "",
      unidad: material.unidad_medida || prev.unidad || "unidad",
    }));
  }

  async function createCatalogOnly() {
    const desc = String(draft.descripcion || q || "").trim();
    if (!desc || creatingMaterial) return;
    if (!categoriaId) {
      setError("Elegi un rubro para crear el item en catalogo.");
      return;
    }
    setCreatingMaterial(true);
    setError("");
    try {
      const id = await crearMaterial({
        descripcion: desc,
        categoria_id: categoriaId,
        unidad_medida: draft.unidad || "unidad",
        revisado: false,
        origen: "condicionante",
        notas: `Creado desde condicionante: ${condicionante.nombre}`,
      }, {});
      setQ(desc);
      setMatchesOpen(false);
      setDraft((prev) => ({
        ...prev,
        material_id: id,
        descripcion: desc,
        unidad: prev.unidad || "unidad",
      }));
      await onMaterialCreated?.();
    } catch (e) {
      setError(e?.message || "No se pudo crear el item en catalogo.");
    } finally {
      setCreatingMaterial(false);
    }
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
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ position: "relative", minWidth: 0 }}>
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setMatchesOpen(true);
              setDraft((prev) => ({ ...prev, material_id: "", descripcion: event.target.value }));
            }}
            onFocus={() => setMatchesOpen(true)}
            placeholder="Buscar item base o escribir item condicionado..."
            style={{ ...INP, width: "100%", height: 40, fontWeight: 750 }}
          />
          {matchesOpen && matches.length > 0 && !draft.material_id && (
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", border: `1px solid ${draft.material_id ? C.greenB : C.b0}`, background: draft.material_id ? C.greenL : C.s0, borderRadius: 10, padding: "8px 9px" }}>
          {draft.material_id ? (
            <>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 850 }}>Item vinculado:</span>
              <span style={{ fontSize: 12, color: C.t1, fontWeight: 850, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedMaterial?.descripcion || draft.descripcion}
              </span>
              <span style={{ fontSize: 11, color: C.t3 }}>
                {[selectedMaterial?.codigo, selectedMaterial?.proveedor].filter(Boolean).join(" · ") || "catalogo completo"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, material_id: "" }));
                  setMatchesOpen(true);
                }}
                style={{ ...BTN, padding: "5px 8px", marginLeft: "auto", fontSize: 11 }}
              >
                Cambiar
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: C.t2, fontWeight: 750 }}>No existe en catalogo?</span>
              <select value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} style={{ ...INP, flex: "0 1 240px", minWidth: 180, height: 34 }}>
                <option value="">Rubro para catalogo</option>
                {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
              </select>
              <button
                type="button"
                onClick={createCatalogOnly}
                disabled={creatingMaterial || !categoriaId || !(draft.descripcion || q).trim()}
                style={{ ...BTN, padding: "7px 10px", color: C.blue, opacity: creatingMaterial || !categoriaId || !(draft.descripcion || q).trim() ? 0.6 : 1 }}
              >
                <Plus size={13} /> {creatingMaterial ? "Creando..." : "Crear en catalogo completo"}
              </button>
              <span style={{ fontSize: 11, color: C.t2 }}>Se crea sin cantidad de matriz; la cantidad va aca abajo.</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={draft.cantidad} onChange={(event) => setDraft((prev) => ({ ...prev, cantidad: event.target.value }))} placeholder="Cant." style={{ ...INP, width: 110, height: 38, fontFamily: C.mono }} />
          <input value={draft.unidad} onChange={(event) => setDraft((prev) => ({ ...prev, unidad: event.target.value }))} placeholder="Unidad" style={{ ...INP, width: 140, height: 38 }} />
          <select value={draft.tipo_item} onChange={(event) => setDraft((prev) => ({ ...prev, tipo_item: event.target.value }))} style={{ ...INP, flex: "1 1 210px", minWidth: 190, height: 38 }}>
            {ITEM_TIPOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button type="button" onClick={save} disabled={saving || !(draft.descripcion || q).trim()} style={{ ...BTN_GREEN, height: 38, padding: "0 14px", whiteSpace: "nowrap", marginLeft: "auto", opacity: saving ? 0.65 : 1 }}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      </div>
      <input value={draft.notas} onChange={(event) => setDraft((prev) => ({ ...prev, notas: event.target.value }))} placeholder="Ej: si hay vestidor suma 9 bisagras sobre la base" style={{ ...INP, width: "100%" }} />
      {error && <div style={{ color: C.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function CondicionanteCard({ condicionante, materiales, categorias, modelos, onReload, onMaterialCreated }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    modelo: String(condicionante.modelo || ""),
    nombre: condicionante.nombre || "",
    tipo: condicionante.tipo || "opcional_estandar",
    descripcion: condicionante.descripcion || "",
    activo_por_defecto: condicionante.activo_por_defecto ?? true,
  }));

  useEffect(() => {
    setDraft({
      modelo: String(condicionante.modelo || ""),
      nombre: condicionante.nombre || "",
      tipo: condicionante.tipo || "opcional_estandar",
      descripcion: condicionante.descripcion || "",
      activo_por_defecto: condicionante.activo_por_defecto ?? true,
    });
    setEditing(false);
  }, [condicionante]);

  async function update(patch) {
    setBusy(true);
    try {
      await actualizarMatrizCondicionante(condicionante.id, patch);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!draft.nombre.trim() || busy) return;
    await update({
      modelo: draft.modelo,
      nombre: draft.nombre,
      tipo: draft.tipo,
      descripcion: draft.descripcion,
      activo_por_defecto: draft.activo_por_defecto,
    });
    setEditing(false);
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
        <div style={{ minWidth: 0, flex: "1 1 360px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: C.violet, border: `1px solid ${C.violet}55`, background: `${C.violet}14`, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>K{condicionante.modelo}</span>
            <div style={{ fontSize: 15, fontWeight: 950, color: C.t0 }}>{condicionante.nombre}</div>
            <span style={{ fontSize: 10.5, color: C.blue, border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>{tipoLabel(condicionante.tipo)}</span>
            <span style={{ fontSize: 10.5, color: condicionante.activo_por_defecto ? C.green : C.amber, border: `1px solid ${condicionante.activo_por_defecto ? C.greenB : C.amberB}`, background: condicionante.activo_por_defecto ? C.greenL : C.amberL, borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>
              {condicionante.activo_por_defecto ? "Activo por defecto" : "No viene por defecto"}
            </span>
          </div>
          {condicionante.descripcion && <div style={{ color: C.t2, fontSize: 12, marginTop: 5, lineHeight: 1.4 }}>{condicionante.descripcion}</div>}
          {editing ? (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "90px minmax(190px, 1fr) minmax(150px, .65fr)", gap: 8 }}>
              <select value={draft.modelo} onChange={(event) => setDraft((prev) => ({ ...prev, modelo: event.target.value }))} style={{ ...INP, height: 34 }}>
                {modelos.map((modelo) => <option key={modelo} value={modelo}>K{modelo}</option>)}
              </select>
              <input value={draft.nombre} onChange={(event) => setDraft((prev) => ({ ...prev, nombre: event.target.value }))} placeholder="Nombre del condicionante" style={{ ...INP, height: 34 }} />
              <select value={draft.tipo} onChange={(event) => setDraft((prev) => ({ ...prev, tipo: event.target.value }))} style={{ ...INP, height: 34 }}>
                {TIPOS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input value={draft.descripcion} onChange={(event) => setDraft((prev) => ({ ...prev, descripcion: event.target.value }))} placeholder="Detalle / cuando aplica" style={{ ...INP, height: 34, gridColumn: "1 / -1" }} />
              <label style={{ display: "inline-flex", gap: 7, alignItems: "center", color: C.t1, fontSize: 12, fontWeight: 750, gridColumn: "1 / -1" }}>
                <input type="checkbox" checked={!!draft.activo_por_defecto} onChange={(event) => setDraft((prev) => ({ ...prev, activo_por_defecto: event.target.checked }))} />
                Activo por defecto en esta linea
              </label>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <button type="button" disabled={busy || !draft.nombre.trim()} onClick={saveEdit} style={{ ...BTN_GREEN, padding: "6px 9px", fontSize: 11 }}>
                <Save size={13} /> Guardar
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(false)} style={{ ...BTN, padding: "6px 8px" }} title="Cancelar">
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => update({ activo_por_defecto: !condicionante.activo_por_defecto })} style={{ ...BTN, padding: "6px 9px", fontSize: 11 }}>
                {condicionante.activo_por_defecto ? "Pasar a opcional" : "Activar por defecto"}
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(true)} style={{ ...BTN, padding: "6px 8px", color: C.blue }} title="Editar">
                <Pencil size={13} />
              </button>
              <button type="button" disabled={busy} onClick={remove} style={{ ...BTN, padding: "6px 8px", color: C.red }} title="Borrar">
                <Trash2 size={13} />
              </button>
            </>
          )}
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
        <CondicionanteItemForm condicionante={condicionante} materiales={materiales} categorias={categorias} onDone={onReload} onMaterialCreated={onMaterialCreated} />
      </div>
    </section>
  );
}

export default function MatrizCondicionantesTab({ materiales = [], categorias = [], onChanged }) {
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
            <CondicionanteCard key={condicionante.id} condicionante={condicionante} materiales={materiales} categorias={categorias} modelos={modelos} onReload={load} onMaterialCreated={onChanged} />
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
