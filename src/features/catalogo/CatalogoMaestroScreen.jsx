import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, Check, ChevronRight, Edit3, Eye, PackageSearch, RefreshCw, Save, Search, ShieldAlert, Warehouse, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import { hasAdminAccess } from "@/lib/permissions";
import { MaterialThumb } from "@/features/materiales/MaterialExtras";
import { actualizarMaterialDatos, fetchCatalogo } from "@/features/materiales/api";
import { materialMatchScore } from "@/features/panol/materialMatch";
import { actualizarStockMinimoPanol, fetchPanolCatalogMaterialImpact, invalidatePanolCatalogFullCache } from "@/features/panol/panolApi";
import { rowDelta, rowIsTransit, rowMovementAt } from "@/features/panol/panolMovimientos";
import CatalogoProductoOperacion from "./CatalogoProductoOperacion";

const PAGE_SIZE = 100;
const IDENTITY_FIELDS = ["descripcion", "codigo", "codigo_barra", "activo"];

function norm(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function qty(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function fmtQty(value) {
  const number = Number(value || 0);
  return Number(Math.round(number * 100) / 100).toLocaleString("es-AR");
}

function impactSummary(rows = []) {
  let saldo = 0;
  let enCamino = 0;
  const obras = new Set();
  const sedes = new Set();
  let ultimoMovimiento = null;
  rows.forEach((row) => {
    if (rowIsTransit(row)) enCamino += qty(row.cantidad);
    else saldo += rowDelta(row);
    if (row.obra_id) obras.add(row.obra_id);
    if (row.stock_sede) sedes.add(row.stock_sede);
    const date = rowMovementAt(row);
    if (date && (!ultimoMovimiento || new Date(date) > new Date(ultimoMovimiento))) ultimoMovimiento = date;
  });
  return { saldo, enCamino, obras: obras.size, sedes: [...sedes], movimientos: rows.filter((row) => !rowIsTransit(row)).length, ultimoMovimiento };
}

function emptyDraft(material = {}) {
  return {
    descripcion: material.descripcion || "",
    alias: material.alias || "",
    codigo: material.codigo || "",
    codigo_barra: material.codigo_barra || "",
    categoria_id: material.categoria_id || "",
    proveedor_id: material.proveedor_id || "",
    proveedor: material.proveedor || "",
    unidad_medida: material.unidad_medida || "unidad",
    notas: material.notas || "",
    stock_minimo: material.stock_minimo ?? "",
    activo: material.activo !== false,
  };
}

function fieldChanged(material, draft, field) {
  if (field === "activo") return (material.activo !== false) !== !!draft.activo;
  return String(material[field] ?? "").trim() !== String(draft[field] ?? "").trim();
}

function Metric({ label, value, color = C.text, hint = "" }) {
  return (
    <div style={{ minWidth: 0, padding: "9px 10px", border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10 }}>
      <div style={{ color: C.dim, fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontFamily: C.mono, fontSize: 16, fontWeight: 950, marginTop: 3 }}>{value}</div>
      {hint && <div style={{ color: C.dim, fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>}
    </div>
  );
}

function ImpactDialog({ open, material, summary, changes, busy, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }} style={{ position: "fixed", inset: 0, zIndex: 6000, display: "grid", placeItems: "center", padding: 18, background: "rgba(2,6,23,.72)", backdropFilter: "blur(5px)" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(560px, 100%)", border: `1px solid ${C.border}`, borderRadius: 16, background: C.panelSolid, boxShadow: "0 28px 90px rgba(0,0,0,.42)", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: 16, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, flexShrink: 0 }}><ShieldAlert size={17} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Confirmar cambio de identidad</div>
            <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>La ficha sigue siendo el mismo producto. El kardex y los documentos históricos no se reescriben.</div>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 3 }}><X size={17} /></button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>{material?.descripcion}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
            <Metric label="Movimientos" value={summary.movimientos} />
            <Metric label="Obras" value={summary.obras} />
            <Metric label="Saldo visible" value={fmtQty(summary.saldo)} color={summary.saldo < 0 ? C.red : C.green} />
          </div>
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 11, padding: 11, display: "grid", gap: 7 }}>
            <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.8 }}>Campos que cambian</div>
            {changes.map((change) => <div key={change.label} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr) 14px minmax(0,1fr)", gap: 7, alignItems: "center", color: C.text, fontSize: 11.5 }}><b>{change.label}</b><span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis" }}>{change.before || "—"}</span><ChevronRight size={13} color={C.blue} /><span style={{ color: C.blue, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis" }}>{change.after || "—"}</span></div>)}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontWeight: 850 }}>Volver</button>
          <button type="button" onClick={onConfirm} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.violetB}`, background: C.violet, color: "#fff", borderRadius: 9, padding: "8px 13px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.65 : 1, fontWeight: 900 }}><Check size={14} />{busy ? "Guardando…" : "Confirmar cambio"}</button>
        </div>
      </div>
    </div>
  );
}

export default function CatalogoMaestroScreen({ profile, signOut }) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMobile } = useResponsive(1120);
  const toast = useToast();
  const canEdit = hasAdminAccess(profile) || ["tecnica", "compras"].includes(profile?.role);
  const [data, setData] = useState({ materiales: [], categorias: [], proveedores: [] });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("todos");
  const [status, setStatus] = useState("activos");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(() => searchParams.get("material") || "");
  const [draft, setDraft] = useState(() => emptyDraft());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impactRows, setImpactRows] = useState([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [showImpact, setShowImpact] = useState(false);

  const load = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    try {
      const next = await fetchCatalogo({ force, includeExtras: false, includeDetails: false });
      setData(next);
    } catch (error) {
      toast.error(error.message || "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const categoryById = useMemo(() => new Map(data.categorias.map((item) => [item.id, item.nombre])), [data.categorias]);
  const selected = useMemo(() => data.materiales.find((material) => material.id === selectedId) || null, [data.materiales, selectedId]);
  const summary = useMemo(() => impactSummary(impactRows), [impactRows]);

  useEffect(() => {
    setDraft(emptyDraft(selected || {}));
    setEditing(false);
    setShowImpact(false);
    if (!selected?.id) {
      setImpactRows([]);
      return undefined;
    }
    let active = true;
    setImpactLoading(true);
    fetchPanolCatalogMaterialImpact(selected.id)
      .then((rows) => { if (active) setImpactRows(rows); })
      .catch((error) => { if (active) toast.warning(error.message || "No se pudo leer el impacto en stock."); })
      .finally(() => { if (active) setImpactLoading(false); });
    return () => { active = false; };
  }, [selected, toast]);

  const filtered = useMemo(() => {
    const term = norm(q);
    return data.materiales
      .filter((material) => status === "todos" || (status === "activos" ? material.activo !== false : material.activo === false))
      .filter((material) => category === "todos" || material.categoria_id === category)
      .filter((material) => !term || materialMatchScore(material, q) >= 42 || norm([material.descripcion, material.alias, material.codigo, material.codigo_barra, material.notas, material.proveedor].filter(Boolean).join(" ")).includes(term))
      .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true }));
  }, [category, data.materiales, q, status]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [category, q, status]);

  function selectMaterial(material) {
    setSelectedId(material.id);
    const next = new URLSearchParams(searchParams);
    next.set("material", material.id);
    setSearchParams(next, { replace: true });
  }

  function closeDetail() {
    setSelectedId("");
    const next = new URLSearchParams(searchParams);
    next.delete("material");
    setSearchParams(next, { replace: true });
  }

  const dirty = selected && Object.keys(draft).some((field) => fieldChanged(selected, draft, field));
  const identityChanges = selected ? IDENTITY_FIELDS.filter((field) => fieldChanged(selected, draft, field)) : [];
  const impactChanges = identityChanges.map((field) => ({
    label: ({ descripcion: "Nombre", codigo: "Código", codigo_barra: "Código barra", activo: "Estado" })[field],
    before: field === "activo" ? (selected.activo !== false ? "Activo" : "Archivado") : String(selected[field] || ""),
    after: field === "activo" ? (draft.activo ? "Activo" : "Archivado") : String(draft[field] || ""),
  }));

  async function persist() {
    if (!selected || !dirty || saving) return;
    setSaving(true);
    try {
      const minimumChanged = fieldChanged(selected, draft, "stock_minimo");
      const fichaChanged = Object.keys(draft).some((field) => field !== "stock_minimo" && fieldChanged(selected, draft, field));
      if (fichaChanged) {
        const { stock_minimo: _stockMinimo, ...draftFicha } = draft;
        await actualizarMaterialDatos({ ...selected, ...draftFicha, descripcion: draft.descripcion.trim() });
      }
      if (minimumChanged) await actualizarStockMinimoPanol(selected.id, draft.stock_minimo);
      invalidatePanolCatalogFullCache();
      await load({ force: true });
      setEditing(false);
      setShowImpact(false);
      toast.success("Ficha del producto actualizada.");
    } catch (error) {
      toast.error(error.message || "No se pudo actualizar el producto.");
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    if (!draft.descripcion.trim()) {
      toast.warning("El nombre del producto es obligatorio.");
      return;
    }
    if (identityChanges.length) setShowImpact(true);
    else persist();
  }

  const inputStyle = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 9, padding: "8px 10px", outline: "none", fontSize: 12.5, fontFamily: C.sans };
  const selectedVisible = !!selected;

  const detail = selected && (
    <section style={{ minWidth: 0, minHeight: 0, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 13, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "13px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <MaterialThumb material={selected} size={46} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950, lineHeight: 1.25 }}>{selected.descripcion}</div>
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 4 }}>{selected.codigo || "sin código"} · {categoryById.get(selected.categoria_id) || "Sin rubro"}</div>
        </div>
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 8, padding: "7px 9px", cursor: "pointer", fontSize: 11.5, fontWeight: 900 }}><Edit3 size={13} />Editar</button>}
        <button type="button" onClick={closeDetail} title="Cerrar" style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.dim, borderRadius: 8, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={15} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>Existencia vinculada</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>Sólo lectura. Las cantidades se mueven desde Pañol.</div>
          </div>
          <button type="button" onClick={() => nav(`/stock-panol?tab=maestro&material=${selected.id}&q=${encodeURIComponent(selected.descripcion)}`)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontSize: 11.5, fontWeight: 900 }}><Warehouse size={14} />Ver en pañol <ArrowRight size={13} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7, opacity: impactLoading ? 0.55 : 1 }}>
          <Metric label="Saldo" value={impactLoading ? "…" : fmtQty(summary.saldo)} color={summary.saldo < 0 ? C.red : summary.saldo > 0 ? C.green : C.dim} hint="ledger actual" />
          <Metric label="Por recibir" value={impactLoading ? "…" : fmtQty(summary.enCamino)} color={summary.enCamino > 0 ? C.violet : C.dim} hint="no recepcionado" />
          <Metric label="Movimientos" value={impactLoading ? "…" : summary.movimientos} hint={`${summary.obras} obras`} />
        </div>

        {editing ? (
          <div style={{ border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.8fr) minmax(130px,.7fr)", gap: 9 }}>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Nombre *</span><input value={draft.descripcion} onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))} style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Unidad</span><input value={draft.unidad_medida} onChange={(event) => setDraft((current) => ({ ...current, unidad_medida: event.target.value }))} style={inputStyle} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9 }}>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Código interno</span><input value={draft.codigo} onChange={(event) => setDraft((current) => ({ ...current, codigo: event.target.value }))} style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Código de barras</span><input value={draft.codigo_barra} onChange={(event) => setDraft((current) => ({ ...current, codigo_barra: event.target.value }))} style={inputStyle} /></label>
            </div>
            <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Alias de búsqueda</span><input value={draft.alias} onChange={(event) => setDraft((current) => ({ ...current, alias: event.target.value }))} placeholder="Sinónimos separados por coma" style={inputStyle} /></label>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 9 }}>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Rubro</span><select value={draft.categoria_id} onChange={(event) => setDraft((current) => ({ ...current, categoria_id: event.target.value }))} style={inputStyle}><option value="">Sin rubro</option>{data.categorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
              <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Proveedor</span><input list="catalogo-proveedores" value={draft.proveedor} onChange={(event) => setDraft((current) => ({ ...current, proveedor: event.target.value }))} style={inputStyle} /><datalist id="catalogo-proveedores">{data.proveedores.filter((item) => item.activo !== false).map((item) => <option key={item.id} value={item.nombre} />)}</datalist></label>
            </div>
            <label style={{ display: "grid", gap: 5, maxWidth: isMobile ? "none" : 220 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Stock mínimo</span><input inputMode="decimal" value={draft.stock_minimo} onChange={(event) => setDraft((current) => ({ ...current, stock_minimo: event.target.value }))} placeholder="Sin mínimo" style={inputStyle} /><span style={{ color: C.dim, fontSize: 9.5 }}>Define la alerta de reposición; no modifica el saldo.</span></label>
            <label style={{ display: "grid", gap: 5 }}><span style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase" }}>Notas y palabras de búsqueda</span><textarea rows={3} value={draft.notas} onChange={(event) => setDraft((current) => ({ ...current, notas: event.target.value }))} style={{ ...inputStyle, resize: "vertical" }} /></label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 12, fontWeight: 850 }}><input type="checkbox" checked={draft.activo} onChange={(event) => setDraft((current) => ({ ...current, activo: event.target.checked }))} />Producto activo</label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => { setDraft(emptyDraft(selected)); setEditing(false); }} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontWeight: 850 }}>Cancelar</button>
              <button type="button" onClick={requestSave} disabled={!dirty || saving} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${dirty ? C.greenB : C.border}`, background: dirty ? C.green : C.panel2, color: dirty ? "#fff" : C.dim, borderRadius: 9, padding: "8px 12px", cursor: dirty && !saving ? "pointer" : "default", fontWeight: 900 }}><Save size={14} />{saving ? "Guardando…" : "Guardar ficha"}</button>
            </div>
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12, display: "grid", gap: 9 }}>
            {[
              ["Alias", selected.alias || "Sin alias"], ["Proveedor", selected.proveedor || "Sin proveedor"], ["Unidad", selected.unidad_medida || "unidad"], ["Stock mínimo", selected.stock_minimo == null ? "Sin mínimo" : `${fmtQty(selected.stock_minimo)} ${selected.unidad_medida || "unidad"}`], ["Código de barras", selected.codigo_barra || "Sin código"], ["Notas", selected.notas || "Sin notas"],
            ].map(([label, value]) => <div key={label} style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 9, fontSize: 11.5 }}><span style={{ color: C.dim, fontWeight: 850 }}>{label}</span><span style={{ color: C.text, lineHeight: 1.4 }}>{value}</span></div>)}
          </div>
        )}
        <CatalogoProductoOperacion
          material={selected}
          rows={impactRows}
          loading={impactLoading}
          onOpenStock={() => nav(`/stock-panol?tab=maestro&material=${selected.id}&q=${encodeURIComponent(selected.descripcion)}`)}
          onReceive={(row) => nav(`/recepcion-panol?tab=recepcion&envio=${encodeURIComponent(row.panol_envio_id || "")}&material=${encodeURIComponent(selected.id)}&item=${encodeURIComponent(row.panol_envio_item_id || "")}`)}
        />
        {!canEdit && <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 11.5, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: "9px 10px" }}><Eye size={14} />Consulta de catálogo. Técnica, Compras y Administración pueden editar fichas.</div>}
      </div>
    </section>
  );

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0,1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "9px 12px 9px 54px" : "9px 18px", borderBottom: `1px solid ${C.border}`, background: C.topbar, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}` }}><PackageSearch size={17} /></div>
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ color: C.text, fontSize: 17, fontWeight: 950 }}>Catálogo maestro</div><div style={{ color: C.dim, fontSize: 10.5, marginTop: 1 }}>Identidad de productos · sin editar cantidades de stock</div></div>
            <button type="button" onClick={() => load({ force: true })} disabled={loading} title="Actualizar" style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 9, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}><RefreshCw size={15} /></button>
          </header>

          <div style={{ padding: isMobile ? 10 : "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
            <div style={{ position: "relative", flex: "1 1 340px" }}><Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar nombre, alias, código, notas o proveedor…" style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: "9px 34px", outline: "none", fontSize: 13 }} />{q && <button type="button" onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 3 }}><X size={14} /></button>}</div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 170 }}><option value="todos">Todos los rubros</option>{data.categorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 120 }}><option value="activos">Activos</option><option value="archivados">Archivados</option><option value="todos">Todos</option></select>
            <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11.5, fontWeight: 850 }}>{filtered.length} productos</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: isMobile ? 10 : 14, display: "grid", gridTemplateColumns: isMobile || !selectedVisible ? "minmax(0,1fr)" : "minmax(420px,1.15fr) minmax(360px,.85fr)", gap: 12, overflow: "hidden" }}>
            {!(isMobile && selectedVisible) && <section style={{ minWidth: 0, minHeight: 0, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 13, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.panelSolid, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><div style={{ display: "flex", alignItems: "center", gap: 7, color: C.text, fontSize: 12.5, fontWeight: 900 }}><Boxes size={14} color={C.blue} />Productos</div><span style={{ color: C.dim, fontSize: 10.5 }}>La existencia se consulta, no se edita acá</span></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 7, display: "grid", gap: 5, alignContent: "start" }}>
                {loading ? <div style={{ padding: 32, color: C.dim, textAlign: "center", fontSize: 12.5 }}>Cargando catálogo…</div> : filtered.length ? <>
                  {filtered.slice(0, limit).map((material) => {
                    const active = material.id === selectedId;
                    return <button key={material.id} type="button" onClick={() => selectMaterial(material)} style={{ width: "100%", display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", alignItems: "center", gap: 9, border: `1px solid ${active ? C.blueB : C.border}`, background: active ? C.blueL : C.panelSolid, borderRadius: 10, padding: "8px 9px", color: C.text, textAlign: "left", cursor: "pointer", fontFamily: C.sans }}><MaterialThumb material={material} size={36} /><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion}</span><span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.codigo || "sin código"}{material.alias ? ` · ${material.alias}` : ""} · {categoryById.get(material.categoria_id) || "Sin rubro"}</span></span><span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: material.activo === false ? C.dim : C.green, border: `1px solid ${material.activo === false ? C.border : C.greenB}`, background: material.activo === false ? C.panel2 : C.greenL, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 900 }}>{material.activo === false ? "Archivado" : "Activo"}<ChevronRight size={11} /></span></button>;
                  })}
                  {limit < filtered.length && <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: 9, cursor: "pointer", fontWeight: 900 }}>Mostrar {Math.min(PAGE_SIZE, filtered.length - limit)} más</button>}
                </> : <div style={{ padding: 32, textAlign: "center", color: C.dim, fontSize: 12.5 }}>No hay productos para esos filtros.</div>}
              </div>
            </section>}
            {selectedVisible ? detail : !isMobile && <section style={{ minHeight: 0, border: `1px dashed ${C.border}`, borderRadius: 13, display: "grid", placeItems: "center", padding: 24 }}><div style={{ textAlign: "center", maxWidth: 310 }}><PackageSearch size={34} color={C.blue} /><div style={{ color: C.text, fontSize: 16, fontWeight: 950, marginTop: 9 }}>Elegí un producto</div><div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>Vas a ver su identidad, el impacto y el saldo vinculado sin mezclarlo con el stock físico.</div></div></section>}
          </div>
        </main>
      </div>
      <ImpactDialog open={showImpact} material={selected} summary={summary} changes={impactChanges} busy={saving} onCancel={() => setShowImpact(false)} onConfirm={persist} />
    </div>
  );
}
