import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Link as LinkIcon, PackagePlus, RefreshCw, Save, Search, SkipForward, Trash2, Upload } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import {
  borrarMaterial,
  crearMaterial,
  fetchCatalogo,
  guardarProveedor,
  guardarMaterial,
  importarCatalogo,
  isMissingTable,
  precioVigente,
} from "./api";
import ComprobantesTab from "./ComprobantesTab";
import { MaterialImageUploader, MaterialThumb, PriceBadge, PriceHistory } from "./MaterialExtras";
import { fmtMoney } from "./format";
import ProveedoresTab from "./ProveedoresTab";
import { csvCell, MODELOS, norm, parseMaterialesWorkbook, toBomMap } from "./materialesParser";
import { fetchOpciones } from "./materialesConfig";
import { AreasEditor, CondicionSelect, VariantesTab } from "./MaterialVariantes";
import { BTN, BTN_GREEN, BTN_PRIMARY, Cargando, ErrorBox, INP, KpiCard, LBL, Td, Th } from "@/features/rrhh/ui";

// Un material puede estar en varias áreas (campo m.areas); si todavía no hay
// M2M cargada, cae a su categoría principal.
function materialEnArea(m, catId) {
  return (m.areas ?? [m.categoria_id]).includes(catId);
}

const TABS = [
  { key: "importar", label: "Importar" },
  { key: "comprobantes", label: "Comprobantes" },
  { key: "revision", label: "Revisión guiada" },
  { key: "variantes", label: "Variantes" },
  { key: "proveedores", label: "Proveedores" },
  { key: "resumen", label: "Resumen" },
];

const MONEDAS = ["", "USD", "ARS"];

function materialActivo(material) {
  return material.activo !== false;
}

function categoriaNombre(categorias, id) {
  return categorias.find((c) => c.id === id)?.nombre ?? "Sin sector";
}

function inputNumberValue(value) {
  return value == null ? "" : String(value);
}

function proveedorNombre(proveedores, id, fallback = "") {
  return proveedores.find((p) => p.id === id)?.nombre ?? fallback ?? "";
}

function ProveedorSelect({ value, textValue, proveedores, onChange, onCreated }) {
  const [creating, setCreating] = useState(false);
  const activos = proveedores.filter((p) => p.activo !== false);

  async function vincularOCrear() {
    const nombre = String(textValue || "").trim();
    if (!nombre || creating) return;
    setCreating(true);
    try {
      const match = activos.find((p) => norm(p.nombre) === norm(nombre));
      const id = match?.id ?? await guardarProveedor({ nombre, activo: true });
      await onCreated?.();
      onChange(id, match?.nombre ?? nombre);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 5 }}>
      <select
        value={value || ""}
        onChange={(e) => {
          const nombre = proveedorNombre(proveedores, e.target.value, "");
          onChange(e.target.value || null, nombre);
        }}
        style={{ ...INP, width: "100%" }}
      >
        <option value="">Sin proveedor vinculado</option>
        {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {!value && textValue && (
        <button type="button" onClick={vincularOCrear} disabled={creating} style={{ ...BTN, padding: "5px 8px", fontSize: 11 }}>
          <LinkIcon size={12} /> {creating ? "Vinculando…" : `Vincular "${textValue}"`}
        </button>
      )}
    </div>
  );
}

function SetupPendienteMateriales({ onRetry }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 22, maxWidth: 620 }}>
        <div style={{ fontSize: 14, color: C.amber, fontWeight: 700, marginBottom: 8 }}>Faltan crear las tablas de Materiales</div>
        <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, marginBottom: 14 }}>
          No se pudieron leer las tablas <code style={{ fontFamily: C.mono, fontSize: 12 }}>panol_*</code>.
          Cuando estén disponibles en Supabase, tocá Reintentar.
        </div>
        <button type="button" onClick={onRetry} style={BTN_PRIMARY}>Reintentar</button>
      </div>
    </div>
  );
}

function ImportarTab({ batches, onImported }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function onFile(file) {
    if (!file) return;
    setParseErr(null);
    setResult(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseMaterialesWorkbook(buf));
    } catch (e) {
      setParseErr(e);
    }
  }

  async function confirmar() {
    if (!parsed || importing) return;
    setImporting(true);
    setParseErr(null);
    try {
      const stats = await importarCatalogo(parsed, fileName);
      setResult(stats);
      setParsed(null);
      onImported?.();
    } catch (e) {
      setParseErr(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#60a5fa" : C.b0}`,
          borderRadius: 14,
          padding: "34px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(59,130,246,0.05)" : C.s0,
          transition: "all .2s",
          marginBottom: 18,
        }}
      >
        <Upload size={30} style={{ marginBottom: 8, color: dragging ? "#60a5fa" : C.t2 }} />
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600 }}>Arrastrá el Excel de materiales acá</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
          Cada hoja se toma como sector. Sólo se importan modelos 37, 52 y 55.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>

      {parseErr && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#f87171" }}>
          {String(parseErr.message ?? parseErr)}
        </div>
      )}

      {result && (
        <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 6 }}>Importación completada</div>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.8 }}>
            {result.creados} materiales nuevos, {result.actualizados} actualizados y {result.cantidades_upsert} cantidades BOM cargadas/actualizadas.
          </div>
        </div>
      )}

      {parsed && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 12 }}>
            Vista previa — {fileName}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <KpiCard label="Sectores" value={parsed.sectores.length} />
            <KpiCard label="Materiales" value={parsed.totalMateriales} />
            <KpiCard label="Cantidades BOM" value={parsed.totalCantidades} sub="37 / 52 / 55" />
            <KpiCard label="Hojas salteadas" value={parsed.skipped.length} sub={parsed.skipped.join(" · ") || "ninguna"} />
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 10, marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <Th>Sector</Th>
                  <Th right>Materiales</Th>
                  <Th right>Cantidades</Th>
                  <Th>Hoja</Th>
                </tr>
              </thead>
              <tbody>
                {parsed.sectores.map((s) => {
                  const cant = s.materiales.reduce((sum, m) => sum + Object.keys(m.cantidades).length, 0);
                  return (
                    <tr key={s.sector.nombre}>
                      <Td>{s.sector.nombre}</Td>
                      <Td right mono>{s.materiales.length}</Td>
                      <Td right mono>{cant}</Td>
                      <Td color={C.t2}>{s.sector.sheetName}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={confirmar} disabled={importing} style={{ ...BTN_GREEN, opacity: importing ? 0.6 : 1, padding: "9px 22px", fontSize: 13 }}>
              {importing ? "Importando…" : "Confirmar e importar"}
            </button>
            <button type="button" onClick={() => setParsed(null)} disabled={importing} style={BTN}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 10 }}>
            Reimportar el mismo archivo no duplica: se actualiza por descripción dentro del sector.
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, margin: "20px 0 8px" }}>
        Importaciones anteriores
      </div>
      {!batches?.length ? (
        <div style={{ fontSize: 13, color: C.t2, padding: "14px 0" }}>Todavía no se importó ningún catálogo.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {batches.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: "9px 14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.t0, fontWeight: 600, flex: 1, minWidth: 160 }}>{b.filename}</span>
              <span style={{ fontSize: 12, color: C.t2 }}>{b.stats?.materiales ?? 0} materiales · {b.stats?.cantidades ?? 0} cantidades</span>
              <span style={{ fontSize: 11, color: C.t2 }}>
                {new Date(b.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectorSelector({ categorias, progressByCat, selectedId, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      {categorias.map((cat) => {
        const p = progressByCat.get(cat.id) ?? { total: 0, revisados: 0 };
        const on = selectedId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            style={{
              ...BTN,
              background: on ? "rgba(59,130,246,0.14)" : C.s0,
              border: `1px solid ${on ? "rgba(59,130,246,0.35)" : C.b0}`,
              color: on ? "#60a5fa" : C.t1,
              padding: "8px 12px",
            }}
          >
            {cat.nombre}
            <span style={{ marginLeft: 7, color: on ? "#93c5fd" : C.t2, fontFamily: C.mono }}>
              {p.revisados}/{p.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MaterialQueueCard({ material, categorias, opciones = [], ums, proveedores, onSave, onSkip, onDelete, onChanged }) {
  const [draft, setDraft] = useState(() => ({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) }));
  const [cantidades, setCantidades] = useState(() => toBomMap(material));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!draft.descripcion?.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(draft, cantidades);
    } catch (error) {
      setErr(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <MaterialThumb material={material} size={72} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 5 }}>
            Material sin revisar
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.t0, lineHeight: 1.25 }}>{material.descripcion}</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
            {categoriaNombre(categorias, material.categoria_id)} · origen {material.origen || "manual"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
            <PriceBadge material={material} />
            <PriceHistory material={material} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 7, justifyItems: "end" }}>
          <MaterialImageUploader material={material} onUploaded={onChanged} />
          <button type="button" onClick={onSkip} style={BTN} title="Saltar">
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{String(err.message ?? err)}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1fr)", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LBL}>Descripción</label>
          <input value={draft.descripcion || ""} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Proveedor</label>
          <ProveedorSelect
            value={draft.proveedor_id || ""}
            textValue={draft.proveedor || ""}
            proveedores={proveedores}
            onCreated={onChanged}
            onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
          />
          <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Texto proveedor" style={{ ...INP, width: "100%", marginTop: 6 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LBL}>UM</label>
          <input list="materiales-ums" value={draft.unidad_medida || ""} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Precio</label>
          <input type="number" step="any" value={draft.precio_unitario ?? ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
        <div>
          <label style={LBL}>Moneda</label>
          <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value || null }))} style={{ ...INP, width: "100%" }}>
            {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "Sin moneda"}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Código</label>
          <input value={draft.codigo || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={{ ...INP, width: "100%" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(80px, 1fr))", gap: 12, marginBottom: 16 }}>
        {MODELOS.map((modelo) => (
          <div key={modelo}>
            <label style={LBL}>Cantidad K{modelo}</label>
            <input type="number" step="any" value={cantidades[modelo] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 1fr)", gap: 14, marginBottom: 16, paddingTop: 14, borderTop: `1px solid ${C.b0}` }}>
        <AreasEditor material={material} categorias={categorias} />
        <CondicionSelect material={material} opciones={opciones} />
      </div>

      <datalist id="materiales-ums">
        {ums.map((u) => <option key={u} value={u} />)}
      </datalist>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving || !draft.descripcion?.trim()} style={{ ...BTN_GREEN, opacity: saving ? 0.6 : 1 }}>
          <Save size={14} /> {saving ? "Guardando…" : "Guardar y siguiente"}
        </button>
        <button type="button" onClick={onSkip} style={BTN}>
          <SkipForward size={14} /> Saltar
        </button>
        <button type="button" onClick={onDelete} style={{ ...BTN, color: C.red, borderColor: "rgba(239,68,68,0.25)" }}>
          <Trash2 size={14} /> Borrar
        </button>
      </div>
    </form>
  );
}

function AltaManual({ categorias, selectedId, ums, proveedores, onCreated }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ descripcion: "", proveedor_id: "", proveedor: "", unidad_medida: "", precio_unitario: "", moneda: "", codigo: "", categoria_id: selectedId });
  const [cantidades, setCantidades] = useState({ 37: "", 52: "", 55: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft((d) => ({ ...d, categoria_id: d.categoria_id || selectedId }));
  }, [selectedId]);

  async function submit(e) {
    e.preventDefault();
    if (!draft.descripcion.trim() || saving) return;
    setSaving(true);
    try {
      await crearMaterial(draft, cantidades);
      setDraft({ descripcion: "", proveedor_id: "", proveedor: "", unidad_medida: "", precio_unitario: "", moneda: "", codigo: "", categoria_id: selectedId });
      setCantidades({ 37: "", 52: "", 55: "" });
      setOpen(false);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...BTN_PRIMARY, marginBottom: 12 }}>
        <PackagePlus size={14} /> Alta manual
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(3, minmax(110px, 1fr))", gap: 8, marginBottom: 8 }}>
        <input autoFocus placeholder="Descripción" value={draft.descripcion} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={INP} />
        <ProveedorSelect
          value={draft.proveedor_id || ""}
          textValue={draft.proveedor || ""}
          proveedores={proveedores}
          onCreated={onCreated}
          onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
        />
        <input list="materiales-ums" placeholder="UM" value={draft.unidad_medida} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={INP} />
        <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={INP}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, marginBottom: 10 }}>
        <input placeholder="Precio" type="number" step="any" value={draft.precio_unitario} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={INP} />
        <select value={draft.moneda} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value }))} style={INP}>
          {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "Sin moneda"}</option>)}
        </select>
        <input placeholder="Código" value={draft.codigo} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={INP} />
        {MODELOS.map((modelo) => (
          <input key={modelo} placeholder={`K${modelo}`} type="number" step="any" value={cantidades[modelo]} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, fontFamily: C.mono }} />
        ))}
      </div>
      <datalist id="materiales-ums">
        {ums.map((u) => <option key={u} value={u} />)}
      </datalist>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={saving || !draft.descripcion.trim()} style={BTN_GREEN}>{saving ? "Guardando…" : "Crear material"}</button>
        <button type="button" onClick={() => setOpen(false)} style={BTN}>Cancelar</button>
      </div>
    </form>
  );
}

function MaterialRow({ material, categorias, ums, proveedores, onChanged }) {
  const [draft, setDraft] = useState(() => ({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) }));
  const [cantidades, setCantidades] = useState(() => toBomMap(material));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...material, precio_unitario: inputNumberValue(material.precio_unitario) });
    setCantidades(toBomMap(material));
  }, [material]);

  async function save() {
    if (!draft.descripcion?.trim() || saving) return;
    setSaving(true);
    try {
      await guardarMaterial(draft, cantidades, { revisado: draft.revisado });
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Borrar "${material.descripcion}"?`)) return;
    await borrarMaterial(material.id);
    onChanged?.();
  }

  return (
    <tr>
      <Td style={{ minWidth: 78 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MaterialThumb material={material} size={38} />
          <MaterialImageUploader material={material} onUploaded={onChanged} compact />
        </div>
      </Td>
      <Td style={{ minWidth: 260 }}>
        <input value={draft.descripcion || ""} onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))} style={{ ...INP, width: "100%" }} />
      </Td>
      <Td style={{ minWidth: 150 }}>
        <ProveedorSelect
          value={draft.proveedor_id || ""}
          textValue={draft.proveedor || ""}
          proveedores={proveedores}
          onCreated={onChanged}
          onChange={(id, nombre) => setDraft((d) => ({ ...d, proveedor_id: id, proveedor: nombre }))}
        />
        <input value={draft.proveedor || ""} onChange={(e) => setDraft((d) => ({ ...d, proveedor: e.target.value }))} placeholder="Texto" style={{ ...INP, width: "100%", marginTop: 5 }} />
      </Td>
      <Td style={{ minWidth: 190 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <PriceBadge material={material} />
          <PriceHistory material={material} />
        </div>
      </Td>
      <Td style={{ minWidth: 90 }}>
        <input list="materiales-ums" value={draft.unidad_medida || ""} onChange={(e) => setDraft((d) => ({ ...d, unidad_medida: e.target.value }))} style={{ ...INP, width: "100%" }} />
        <datalist id="materiales-ums">
          {ums.map((u) => <option key={u} value={u} />)}
        </datalist>
      </Td>
      <Td style={{ minWidth: 90 }}>
        <input type="number" step="any" value={draft.precio_unitario ?? ""} onChange={(e) => setDraft((d) => ({ ...d, precio_unitario: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
      </Td>
      <Td style={{ minWidth: 86 }}>
        <select value={draft.moneda || ""} onChange={(e) => setDraft((d) => ({ ...d, moneda: e.target.value || null }))} style={{ ...INP, width: "100%" }}>
          {MONEDAS.map((m) => <option key={m || "null"} value={m}>{m || "—"}</option>)}
        </select>
      </Td>
      <Td style={{ minWidth: 110 }}>
        <input value={draft.codigo || ""} onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value }))} style={{ ...INP, width: "100%" }} />
      </Td>
      {MODELOS.map((modelo) => (
        <Td key={modelo} style={{ minWidth: 76 }}>
          <input type="number" step="any" value={cantidades[modelo] ?? ""} onChange={(e) => setCantidades((c) => ({ ...c, [modelo]: e.target.value }))} style={{ ...INP, width: "100%", fontFamily: C.mono }} />
        </Td>
      ))}
      <Td style={{ minWidth: 150 }}>
        <select value={draft.categoria_id || ""} onChange={(e) => setDraft((d) => ({ ...d, categoria_id: e.target.value }))} style={{ ...INP, width: "100%" }}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Td>
      <Td style={{ minWidth: 94 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: draft.revisado ? C.green : C.t2 }}>
          <input type="checkbox" checked={!!draft.revisado} onChange={(e) => setDraft((d) => ({ ...d, revisado: e.target.checked }))} />
          Revisado
        </label>
      </Td>
      <Td style={{ minWidth: 118 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GREEN, padding: "6px 8px" }} title="Guardar">
            <Save size={13} />
          </button>
          <button type="button" onClick={remove} style={{ ...BTN, color: C.red, padding: "6px 8px" }} title="Borrar">
            <Trash2 size={13} />
          </button>
        </div>
      </Td>
    </tr>
  );
}

function ListaMateriales({ categorias, materiales, selectedId, ums, proveedores, onChanged }) {
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const query = q.trim().toLowerCase();
    return materiales
      .filter(materialActivo)
      .filter((m) => materialEnArea(m, selectedId))
      .filter((m) => !soloPendientes || !m.revisado)
      .filter((m) => {
        if (!query) return true;
        return `${m.descripcion ?? ""} ${m.proveedor ?? ""}`.toLowerCase().includes(query);
      });
  }, [materiales, q, selectedId, soloPendientes]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", minWidth: 220, flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: C.t2 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descripción o proveedor" style={{ ...INP, width: "100%", paddingLeft: 30 }} />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.t1, fontSize: 13 }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Ver sólo no revisados
        </label>
        <span style={{ color: C.t2, fontSize: 12 }}>{visibles.length} materiales</span>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 1480, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Imagen</Th>
              <Th>Descripción</Th>
              <Th>Proveedor</Th>
              <Th>Último precio</Th>
              <Th>UM</Th>
              <Th>Precio</Th>
              <Th>Moneda</Th>
              <Th>Código</Th>
              <Th>K37</Th>
              <Th>K52</Th>
              <Th>K55</Th>
              <Th>Sector</Th>
              <Th>Estado</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((material) => (
              <MaterialRow key={material.id} material={material} categorias={categorias} ums={ums} proveedores={proveedores} onChanged={onChanged} />
            ))}
            {!visibles.length && (
              <tr>
                <td colSpan={14} style={{ padding: 18, fontSize: 13, color: C.t2, textAlign: "center" }}>
                  No hay materiales con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevisionTab({ categorias, materiales, proveedores, opciones = [], onChanged }) {
  const [selectedId, setSelectedId] = useState(categorias[0]?.id ?? "");
  const [modo, setModo] = useState("cola");
  const [queueIndex, setQueueIndex] = useState(0);
  const [err, setErr] = useState(null);
  const effectiveSelectedId = selectedId && categorias.some((c) => c.id === selectedId)
    ? selectedId
    : categorias[0]?.id ?? "";

  const progressByCat = useMemo(() => {
    const map = new Map(categorias.map((c) => [c.id, { total: 0, revisados: 0 }]));
    for (const material of materiales.filter(materialActivo)) {
      // Un material compartido cuenta en todas sus áreas.
      for (const catId of material.areas ?? [material.categoria_id]) {
        const p = map.get(catId);
        if (!p) continue;
        p.total += 1;
        if (material.revisado) p.revisados += 1;
      }
    }
    return map;
  }, [categorias, materiales]);

  const ums = useMemo(() => {
    return [...new Set(materiales.map((m) => m.unidad_medida).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es"));
  }, [materiales]);

  const selectedMaterials = useMemo(() => {
    return materiales.filter(materialActivo).filter((m) => materialEnArea(m, effectiveSelectedId));
  }, [materiales, effectiveSelectedId]);

  const queue = useMemo(() => selectedMaterials.filter((m) => !m.revisado), [selectedMaterials]);
  const current = queue.length ? queue[queueIndex % queue.length] : null;
  const progress = progressByCat.get(effectiveSelectedId) ?? { total: 0, revisados: 0 };

  async function saveQueue(draft, cantidades) {
    await guardarMaterial(draft, cantidades, { revisado: true });
    await onChanged?.();
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm(`¿Borrar "${current.descripcion}"?`)) return;
    try {
      setErr(null);
      await borrarMaterial(current.id);
      await onChanged?.();
    } catch (e) {
      setErr(e);
    }
  }

  return (
    <div>
      <SectorSelector
        categorias={categorias}
        progressByCat={progressByCat}
        selectedId={effectiveSelectedId}
        onSelect={(id) => { setSelectedId(id); setQueueIndex(0); }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: C.t0, fontWeight: 700 }}>
            {categoriaNombre(categorias, effectiveSelectedId)}: {progress.revisados} / {progress.total} revisados
          </div>
          <div style={{ height: 7, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 99, marginTop: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress.total ? Math.round((progress.revisados / progress.total) * 100) : 0}%`, background: C.green }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: 3 }}>
          {[
            ["cola", "Cola"],
            ["lista", "Lista"],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setModo(key)} style={{
              ...BTN,
              border: "none",
              background: modo === key ? C.s2 : "transparent",
              color: modo === key ? C.t0 : C.t2,
              padding: "6px 12px",
            }}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onChanged} style={BTN} title="Reintentar carga">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}

      {modo === "cola" ? (
        current ? (
          <MaterialQueueCard
            key={current.id}
            material={current}
            categorias={categorias}
            opciones={opciones}
            ums={ums}
            proveedores={proveedores}
            onSave={saveQueue}
            onSkip={() => setQueueIndex((i) => (i + 1) % Math.max(queue.length, 1))}
            onDelete={deleteCurrent}
            onChanged={onChanged}
          />
        ) : (
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 20, marginBottom: 18 }}>
            <div style={{ fontSize: 15, color: C.green, fontWeight: 700 }}>Sector revisado</div>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 6 }}>No quedan materiales pendientes en este sector.</div>
          </div>
        )
      ) : (
        <>
          <AltaManual categorias={categorias} selectedId={effectiveSelectedId} ums={ums} proveedores={proveedores} onCreated={onChanged} />
          <ListaMateriales categorias={categorias} materiales={materiales} selectedId={effectiveSelectedId} ums={ums} proveedores={proveedores} onChanged={onChanged} />
        </>
      )}
    </div>
  );
}

function exportCatalogoCsv(categorias, materiales) {
  const catById = new Map(categorias.map((c) => [c.id, c.nombre]));
  const headers = ["Descripción", "Sector", "Proveedor", "UM", "Precio", "Moneda", "Código", "Cant 37", "Cant 52", "Cant 55", "Revisado"];
  const rows = materiales.filter(materialActivo).map((m) => {
    const bom = toBomMap(m);
    const price = precioVigente(m);
    return [
      m.descripcion,
      catById.get(m.categoria_id) ?? "",
      m.proveedor,
      m.unidad_medida,
      price?.precio_unitario ?? m.precio_unitario,
      price?.moneda ?? m.moneda,
      m.codigo,
      bom[37],
      bom[52],
      bom[55],
      m.revisado ? "sí" : "no",
    ];
  });
  const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `catalogo-materiales-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ResumenTab({ categorias, materiales }) {
  const activos = useMemo(() => materiales.filter(materialActivo), [materiales]);
  const total = activos.length;
  const revisados = activos.filter((m) => m.revisado).length;
  const sinPrecio = activos.filter((m) => !precioVigente(m)?.precio_unitario).length;
  const sinUm = activos.filter((m) => !m.unidad_medida).length;
  const sinCodigo = activos.filter((m) => !m.codigo).length;
  const pct = total ? Math.round((revisados / total) * 100) : 0;

  const rows = categorias.map((cat) => {
    const list = activos.filter((m) => materialEnArea(m, cat.id));
    const rev = list.filter((m) => m.revisado).length;
    const precios = list.map((m) => precioVigente(m)?.precio_unitario).filter((v) => v != null).map(Number).filter(Number.isFinite);
    return {
      ...cat,
      total: list.length,
      revisados: rev,
      pct: list.length ? Math.round((rev / list.length) * 100) : 0,
      sinPrecio: list.filter((m) => !precioVigente(m)?.precio_unitario).length,
      sinUm: list.filter((m) => !m.unidad_medida).length,
      sinCodigo: list.filter((m) => !m.codigo).length,
      promedio: precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : null,
    };
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Materiales" value={total} />
        <KpiCard label="Revisados" value={`${pct}%`} sub={`${revisados} de ${total}`} color={pct === 100 ? C.green : "#60a5fa"} />
        <KpiCard label="Sin precio" value={sinPrecio} color={sinPrecio ? C.amber : C.green} />
        <KpiCard label="Sin UM" value={sinUm} color={sinUm ? C.amber : C.green} />
        <KpiCard label="Sin código" value={sinCodigo} color={sinCodigo ? C.t2 : C.green} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" onClick={() => exportCatalogoCsv(categorias, activos)} style={BTN_PRIMARY}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Sector</Th>
              <Th right>Total</Th>
              <Th right>Revisados</Th>
              <Th>Progreso</Th>
              <Th right>Sin precio</Th>
              <Th right>Precio prom.</Th>
              <Th right>Sin UM</Th>
              <Th right>Sin código</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{row.nombre}</Td>
                <Td right mono>{row.total}</Td>
                <Td right mono>{row.revisados}</Td>
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 170 }}>
                    <div style={{ flex: 1, height: 7, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${row.pct}%`, background: row.pct === 100 ? C.green : "#60a5fa" }} />
                    </div>
                    <span style={{ fontFamily: C.mono, color: C.t2, fontSize: 12 }}>{row.pct}%</span>
                  </div>
                </Td>
                <Td right mono color={row.sinPrecio ? C.amber : C.t2}>{row.sinPrecio}</Td>
                <Td right mono color={row.promedio ? C.t1 : C.t2}>{row.promedio ? fmtMoney(row.promedio, "") : "—"}</Td>
                <Td right mono color={row.sinUm ? C.amber : C.t2}>{row.sinUm}</Td>
                <Td right mono color={row.sinCodigo ? C.t2 : C.green}>{row.sinCodigo}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MaterialesScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const [tab, setTab] = useState("importar");
  const [categorias, setCategorias] = useState(null);
  const [materiales, setMateriales] = useState(null);
  const [batches, setBatches] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [comprobantes, setComprobantes] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [setupPendiente, setSetupPendiente] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCatalogo();
      setCategorias(data.categorias);
      setMateriales(data.materiales);
      setBatches(data.batches);
      setProveedores(data.proveedores ?? []);
      setComprobantes(data.comprobantes ?? []);
      const ops = await fetchOpciones();      // tolerante: [] si falta el SQL
      setOpciones(ops.opciones ?? []);
      setSetupPendiente(false);
    } catch (e) {
      if (isMissingTable(e)) setSetupPendiente(true);
      else setError(e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchOpciones().then((r) => { if (active) setOpciones(r.opciones ?? []); }).catch(() => {});
    fetchCatalogo()
      .then((data) => {
        if (!active) return;
        setCategorias(data.categorias);
        setMateriales(data.materiales);
        setBatches(data.batches);
        setProveedores(data.proveedores ?? []);
        setComprobantes(data.comprobantes ?? []);
        setSetupPendiente(false);
      })
      .catch((e) => {
        if (!active) return;
        if (isMissingTable(e)) setSetupPendiente(true);
        else setError(e);
      });
    return () => { active = false; };
  }, []);

  const listo = categorias != null && materiales != null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, color: C.t0, fontFamily: C.sans, display: "flex", overflow: "hidden" }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--panel-2); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; }
        select option { background: var(--panel-solid); color: var(--muted); }
        button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      `}</style>

      <Sidebar profile={profile} signOut={signOut} />

      <div style={{ flex: 1, height: "100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ padding: isMobile ? "16px 14px 50px 14px" : "26px 30px 60px" }}>
          <div style={{ marginBottom: 18, paddingLeft: isMobile ? 40 : 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>Materiales · Catálogo y BOM</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
              Carga guiada por sectores para preparar Pañol y costos, sin movimientos operativos.
            </div>
          </div>

          {setupPendiente ? (
            <SetupPendienteMateriales onRetry={cargar} />
          ) : error ? (
            <ErrorBox error={error} onRetry={cargar} />
          ) : !listo ? (
            <Cargando />
          ) : (
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${C.b0}` }}>
                {TABS.map((t) => {
                  const on = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      style={{
                        padding: "9px 16px",
                        cursor: "pointer",
                        fontSize: 13,
                        fontFamily: C.sans,
                        fontWeight: on ? 700 : 500,
                        color: on ? C.t0 : C.t2,
                        background: "transparent",
                        border: "none",
                        borderBottom: `2px solid ${on ? "#60a5fa" : "transparent"}`,
                        marginBottom: -1,
                        transition: "all .15s",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {tab === "importar" && <ImportarTab batches={batches} onImported={cargar} />}
              {tab === "comprobantes" && <ComprobantesTab categorias={categorias} materiales={materiales} proveedores={proveedores} comprobantes={comprobantes} onChanged={cargar} />}
              {tab === "revision" && <RevisionTab categorias={categorias} materiales={materiales} proveedores={proveedores} opciones={opciones} onChanged={cargar} />}
              {tab === "variantes" && <VariantesTab opciones={opciones} onChanged={cargar} />}
              {tab === "proveedores" && <ProveedoresTab proveedores={proveedores} onChanged={cargar} />}
              {tab === "resumen" && <ResumenTab categorias={categorias} materiales={materiales} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
