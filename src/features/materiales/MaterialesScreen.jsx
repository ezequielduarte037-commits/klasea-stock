import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Link as LinkIcon, PackagePlus, RefreshCw, Save, Search, SkipForward, Trash2, Upload } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import {
  aplicarPrecioMaterial,
  borrarMaterial,
  borrarSubsector,
  crearCategoria,
  crearMaterial,
  fetchCatalogo,
  fetchObrasAvance,
  guardarProveedor,
  guardarMaterial,
  importarCatalogo,
  isMissingTable,
  leerPresupuestoConIA,
  precioVigente,
  renombrarCategoria,
  setCantidadModelo,
} from "./api";
import AvanceTab from "./AvanceTab";
import ComprobantesTab from "./ComprobantesTab";
import BandejaTab from "./BandejaTab";
import { MaterialImageUploader, MaterialThumb, PriceBadge, PriceHistory } from "./MaterialExtras";
import { fmtMoney } from "./format";
import ProveedoresTab from "./ProveedoresTab";
import { csvCell, MODELOS, norm, parseMaterialesWorkbook, toBomMap } from "./materialesParser";
import { fetchOpciones, setMaterialAreas } from "./materialesConfig";
import { AreasEditor, CondicionSelect, VariantesTab } from "./MaterialVariantes";
import { BTN, BTN_GREEN, BTN_PRIMARY, Cargando, ErrorBox, INP, KpiCard, LBL, Td, Th } from "@/features/rrhh/ui";

// Un material puede estar en varias áreas (campo m.areas); si todavía no hay
// M2M cargada, cae a su categoría principal.
function materialEnArea(m, catId) {
  return (m.areas ?? [m.categoria_id]).includes(catId);
}

// ─── Jerarquía de sectores (padre → subsectores) ──────────────────────
const esRaiz = (c) => !c.parent_id;
const hijosDe = (categorias, parentId) => categorias.filter((c) => c.parent_id === parentId);

// Ids "en juego" al pararse en un sector: él mismo + sus subsectores (si es padre).
function idsScope(categorias, catId) {
  const hijos = hijosDe(categorias, catId).map((c) => c.id);
  return new Set([catId, ...hijos]);
}
function materialEnScope(m, scopeIds) {
  return (m.areas ?? [m.categoria_id]).some((a) => scopeIds.has(a));
}

// Subdivisiones náuticas sugeridas. Se matchean por nombre normalizado del sector
// padre (si el nombre contiene la clave). El usuario igual puede crear/borrar a mano.
const SUBDIVISIONES_SUGERIDAS = {
  mecanic: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  propuls: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  motor: ["Motores", "Transmisión", "Hélices y ejes", "Combustible", "Escape", "Refrigeración"],
  electric: ["Baterías", "Cargadores/Inversores", "Tablero y disyuntores", "Iluminación", "Cableado", "Alternadores", "Solar"],
  electron: ["GPS/Plotter", "Radar", "Sonda", "Piloto automático", "VHF/Radio", "Instrumental"],
  naveg: ["GPS/Plotter", "Radar", "Sonda", "Piloto automático", "VHF/Radio", "Instrumental"],
  plomer: ["Agua dulce", "Aguas grises/negras", "Achique/Sentina", "Inodoros"],
  agua: ["Agua dulce", "Aguas grises/negras", "Achique/Sentina", "Inodoros"],
  hidraul: ["Dirección", "Flaps/Trim", "Pasarela/Plataforma"],
  cubierta: ["Malacate/Ancla", "Herrajes y cornamusas", "Cabos/Drizas", "Defensas"],
  fondeo: ["Malacate/Ancla", "Herrajes y cornamusas", "Cabos/Drizas", "Defensas"],
  casco: ["Obra viva", "Pintura/antifouling", "Pasacascos", "Ánodos"],
  estructura: ["Obra viva", "Pintura/antifouling", "Pasacascos", "Ánodos"],
  confort: ["A/C", "Calefacción", "Heladera", "Cocina"],
  clima: ["A/C", "Calefacción", "Heladera", "Cocina"],
  interior: ["Muebles", "Tapizados", "Pisos", "Grifería"],
  carpinter: ["Muebles", "Tapizados", "Pisos", "Grifería"],
  segurid: ["Balsa", "Chalecos", "Extintores", "Luces de navegación"],
};
function subdivisionesSugeridas(nombre) {
  const n = norm(nombre || "");
  for (const [clave, subs] of Object.entries(SUBDIVISIONES_SUGERIDAS)) {
    if (n.includes(clave)) return subs;
  }
  return [];
}

// ─── Matcheo difuso contra la lista matriz (mismo criterio que Comprobantes) ──
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
    .sort((a, b) => b.score - a.score || (a.material.descripcion || "").localeCompare(b.material.descripcion || "", "es"))
    .slice(0, 12)
    .map((r) => r.material);
}
function bestMatchId(materiales, desc) {
  const tops = topMateriales(materiales.filter((m) => m.activo !== false), desc);
  return tops.length && scoreMaterial(tops[0], desc) >= 70 ? tops[0].id : "";
}
function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Mapea el nombre de sector que sugiere la IA a una categoría real (por nombre).
function catIdPorNombre(categorias, nombre) {
  if (!nombre) return "";
  const n = norm(nombre);
  const exacto = categorias.find((c) => norm(c.nombre) === n);
  if (exacto) return exacto.id;
  const incl = categorias.find((c) => { const cn = norm(c.nombre); return cn && (cn.includes(n) || n.includes(cn)); });
  return incl?.id || "";
}

const TABS = [
  { key: "importar", label: "Importar" },
  { key: "bandeja", label: "Bandeja" },
  { key: "comprobantes", label: "Comprobantes" },
  { key: "revision", label: "Revisión guiada" },
  { key: "variantes", label: "Variantes" },
  { key: "proveedores", label: "Proveedores" },
  { key: "avance", label: "Avance" },
  { key: "costos", label: "Costo de obra" },
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

function SectorChip({ cat, progressByCat, selectedId, onSelect, sub = false }) {
  const p = progressByCat.get(cat.id) ?? { total: 0, revisados: 0 };
  const on = selectedId === cat.id;
  const accent = sub ? "rgba(139,92,246,0.16)" : "rgba(59,130,246,0.14)";
  const accentBd = sub ? "rgba(139,92,246,0.4)" : "rgba(59,130,246,0.35)";
  const accentTx = sub ? "#a78bfa" : "#60a5fa";
  return (
    <button
      type="button"
      onClick={() => onSelect(cat.id)}
      style={{
        ...BTN,
        background: on ? accent : C.s0,
        border: `1px solid ${on ? accentBd : C.b0}`,
        color: on ? accentTx : C.t1,
        padding: sub ? "6px 10px" : "8px 12px",
        fontSize: sub ? 12 : 13,
      }}
    >
      {cat.nombre}
      <span style={{ marginLeft: 7, color: on ? accentTx : C.t2, fontFamily: C.mono }}>
        {p.revisados}/{p.total}
      </span>
    </button>
  );
}

function SectorSelector({ categorias, progressByCat, selectedId, onSelect, onAddSub, onSuggestSub, onDeleteSub }) {
  const raices = categorias.filter(esRaiz);
  const selected = categorias.find((c) => c.id === selectedId);
  const parentActivo = selected ? (selected.parent_id ? categorias.find((c) => c.id === selected.parent_id) : selected) : raices[0];
  const subs = parentActivo ? hijosDe(categorias, parentActivo.id) : [];
  const sugeridas = parentActivo ? subdivisionesSugeridas(parentActivo.nombre) : [];

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Sectores raíz */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {raices.map((cat) => (
          <SectorChip key={cat.id} cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>

      {/* Subsectores del sector activo + gestión */}
      {parentActivo && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 9, paddingLeft: 12, borderLeft: `2px solid ${C.b0}` }}>
          <button
            type="button"
            onClick={() => onSelect(parentActivo.id)}
            style={{ ...BTN, padding: "5px 10px", fontSize: 12, background: selectedId === parentActivo.id ? C.s2 : "transparent", border: `1px solid ${C.b0}`, color: selectedId === parentActivo.id ? C.t0 : C.t2 }}
            title="Ver todo el sector (incluye subsectores)"
          >
            Todos
          </button>
          {subs.map((cat) => (
            <span key={cat.id} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <SectorChip cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} sub />
              {selectedId === cat.id && (
                <button type="button" onClick={() => onDeleteSub(cat)} title="Borrar subsector (sus materiales vuelven al sector)" style={{ ...BTN, padding: "2px 6px", marginLeft: 4, fontSize: 11, color: C.red, border: `1px solid ${C.b0}`, background: "transparent" }}>
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          ))}
          <button type="button" onClick={() => onAddSub(parentActivo)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: C.t2, border: `1px dashed ${C.b1}`, background: "transparent" }}>
            + subsector
          </button>
          {subs.length === 0 && sugeridas.length > 0 && (
            <button type="button" onClick={() => onSuggestSub(parentActivo, sugeridas)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: "#a78bfa", border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.1)" }} title={`Crear: ${sugeridas.join(" · ")}`}>
              ✨ Sugerir {sugeridas.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Selector para asignar el material a un subsector (o dejarlo en el sector general).
// Solo aparece si el sector tiene subsectores; si no, muestra el nombre a secas.
function SubsectorSelect({ categorias, value, onChange }) {
  const cat = categorias.find((c) => c.id === value);
  const raizId = cat?.parent_id ?? value;
  const raiz = categorias.find((c) => c.id === raizId);
  const hijos = raiz ? hijosDe(categorias, raizId) : [];
  if (!raiz || hijos.length === 0) {
    return <span style={{ fontSize: 12, color: C.t2 }}>{categoriaNombre(categorias, value)}</span>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INP, padding: "4px 8px", fontSize: 12, width: "auto", color: C.t1 }}
      title="Asignar a subsector"
    >
      <option value={raiz.id}>{raiz.nombre} · (general)</option>
      {hijos.map((h) => <option key={h.id} value={h.id}>{raiz.nombre} › {h.nombre}</option>)}
    </select>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <SubsectorSelect categorias={categorias} value={draft.categoria_id} onChange={(id) => setDraft((d) => ({ ...d, categoria_id: id }))} />
            <span style={{ fontSize: 11, color: C.t2 }}>origen {material.origen || "manual"}</span>
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
    const scope = idsScope(categorias, selectedId);
    return materiales
      .filter(materialActivo)
      .filter((m) => materialEnScope(m, scope))
      .filter((m) => !soloPendientes || !m.revisado)
      .filter((m) => {
        if (!query) return true;
        return `${m.descripcion ?? ""} ${m.proveedor ?? ""}`.toLowerCase().includes(query);
      });
  }, [materiales, categorias, q, selectedId, soloPendientes]);

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

// Cargar presupuesto (texto pegado o archivo PDF/foto) con IA, matchear cada ítem
// contra la lista matriz y: si coincide → actualizar su precio; si no → crear en el
// sector/subsector actual. Todo dentro de la Revisión guiada.
// Selector de sector/subsector (para asignar el destino de un ítem).
// Los <optgroup> nativos NO respetan el color en Chrome/Windows → títulos ilegibles en
// tema oscuro. Por eso evitamos optgroup y usamos opciones planas (sí respetan el style),
// con el sector padre en negrita y los subsectores con el path completo.
const OPT_ST = { background: C.panelSolid, color: C.t0 };
const OPT_HEAD = { background: C.panelSolid, color: C.t0, fontWeight: 800 };

function SectorPicker({ categorias, value, onChange, invalid }) {
  const raices = categorias.filter(esRaiz);
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INP, flex: 1, fontSize: 12, border: `1px solid ${invalid ? C.red : C.b0}` }}
    >
      <option value="" style={OPT_ST}>— Elegir sector —</option>
      {raices.flatMap((r) => [
        <option key={r.id} value={r.id} style={OPT_HEAD}>{r.nombre}</option>,
        ...hijosDe(categorias, r.id).map((s) => (
          <option key={s.id} value={s.id} style={OPT_ST}>{"   "}{r.nombre} › {s.nombre}</option>
        )),
      ])}
    </select>
  );
}

// Buscador por ítem para vincular con un material del catálogo aunque se llame distinto y
// la IA no lo haya detectado. Busca en TODO el catálogo (no solo en las sugerencias de la IA).
function VincularItem({ activos, categorias, item, onChange }) {
  const [q, setQ] = useState("");
  const sel = activos.find((m) => m.id === item.material_id);
  const query = q.trim();
  const resultados = useMemo(() => {
    if (sel) return [];
    return topMateriales(activos, query.length >= 2 ? query : item.descripcion).slice(0, 6);
  }, [q, sel, activos, item.descripcion]);

  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.t2, minWidth: 78 }}>Vincular</span>
        {sel ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ flex: 1, fontSize: 12, color: C.green, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {sel.descripcion} <span style={{ color: C.t2, fontWeight: 400 }}>· {categoriaNombre(categorias, sel.categoria_id)}</span>
            </div>
            <button type="button" onClick={() => { onChange(""); setQ(""); }} style={{ ...BTN, padding: "5px 10px", whiteSpace: "nowrap" }}>Cambiar</button>
          </div>
        ) : (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar un material del catálogo para vincular (si la IA no lo encontró)…" style={{ ...INP, flex: 1, fontSize: 12 }} />
        )}
        <span style={{ fontSize: 11, color: sel ? C.green : C.amber, fontWeight: 700, whiteSpace: "nowrap", minWidth: 104, textAlign: "right" }}>
          {sel ? "↻ actualiza precio" : "✦ crea uno nuevo"}
        </span>
      </div>
      {!sel && resultados.length > 0 && (
        <div style={{ display: "grid", gap: 3, marginTop: 5, marginLeft: 86 }}>
          {resultados.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m.id); setQ(""); }}
              style={{ textAlign: "left", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 10px", color: C.t1, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 10 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</span>
              <span style={{ color: C.t2, whiteSpace: "nowrap" }}>{categoriaNombre(categorias, m.categoria_id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PRESUP_DRAFT_KEY = "klasea:presupuesto-draft";

function CargarPresupuestoModal({ categorias, materiales, onChanged, onClose }) {
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [items, setItems] = useState(null);
  const [proveedor, setProveedor] = useState("");
  const [linea, setLinea] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [restaurado, setRestaurado] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const activos = useMemo(() => materiales.filter(materialActivo), [materiales]);
  const nombresSectores = useMemo(() => categorias.map((c) => c.nombre), [categorias]);

  // Borrador persistente: si cerrás, clickeás afuera o recargás, no se pierde lo cargado.
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(PRESUP_DRAFT_KEY) || "null");
      if (d && (d.texto || (Array.isArray(d.items) && d.items.length))) {
        if (d.texto) setTexto(d.texto);
        if (d.proveedor) setProveedor(d.proveedor);
        if (d.linea) setLinea(d.linea);
        if (Array.isArray(d.items) && d.items.length) { setItems(d.items); setRestaurado(true); }
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (resultado) return; // ya se aplicó; no re-guardar
    try { localStorage.setItem(PRESUP_DRAFT_KEY, JSON.stringify({ texto, proveedor, linea, items })); } catch { /* ignore */ }
  }, [texto, proveedor, linea, items, resultado]);
  const limpiarBorrador = () => { try { localStorage.removeItem(PRESUP_DRAFT_KEY); } catch { /* ignore */ } };
  function descartar() {
    if (!window.confirm("¿Descartar el presupuesto en curso y empezar de cero?")) return;
    limpiarBorrador();
    setTexto(""); setFile(null); setItems(null); setProveedor(""); setLinea(""); setErr(null); setRestaurado(false);
  }

  async function leer() {
    if (!texto.trim() && !file) { setErr(new Error("Pegá el texto del presupuesto o subí un archivo.")); return; }
    setLeyendo(true); setErr(null); setResultado(null);
    try {
      const data = await leerPresupuestoConIA({ text: texto, file, sectores: nombresSectores });
      setProveedor(data.proveedor || "");
      const parsed = (data.items || []).map((it) => {
        const material_id = bestMatchId(activos, it.descripcion || "");
        const mat = activos.find((m) => m.id === material_id);
        // El destino: si matchea un material, hereda su sector; si no, el que sugirió la IA.
        const _catId = mat ? mat.categoria_id : catIdPorNombre(categorias, it.sector);
        // Backstop de precio, SOLO HACIA ARRIBA: el error de formato (coma decimal) hace que el
        // precio se lea más chico de lo real (33 en vez de 33.000), nunca más grande. Si el
        // importe/cantidad da claramente MÁS que el precio leído, lo subimos; nunca bajamos un
        // precio ya leído (eso "dividía" precios correctos cuando la IA leía mal el importe).
        const cant = toNum(it.cantidad);
        const total = toNum(it.total);
        let precio = it.precio_unitario ?? "";
        const leido = toNum(precio);
        if (cant && cant > 1 && total != null && total > 0) {
          const calc = total / cant;
          if (leido == null || calc > leido * 1.5) {
            precio = String(Math.round(calc * 100) / 100);
          }
        }
        return {
          descripcion: it.descripcion || "",
          cantidad: it.cantidad ?? "",
          precio_unitario: precio,
          moneda: it.moneda || "ARS",
          material_id,
          _catId,
        };
      });
      setItems(parsed);
      if (!parsed.length) setErr(new Error("La IA no encontró ítems. Probá con más detalle o un archivo."));
    } catch (e) { setErr(e); } finally { setLeyendo(false); }
  }

  const setItem = (idx, patch) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const quitar = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Inválido: es "crear nuevo" (sin match) y no tiene sector asignado.
  const faltaSector = (it) => !it.material_id && it.descripcion.trim() && !it._catId;

  async function aplicar() {
    if (items.some(faltaSector)) { setErr(new Error("Asigná sector a los ítems marcados en rojo antes de aplicar.")); return; }
    setAplicando(true); setErr(null);
    let actualizados = 0, creados = 0, movidos = 0, bom = 0;
    try {
      for (const it of items) {
        if (!it.descripcion.trim()) continue;
        let materialId = it.material_id;
        if (materialId) {
          const mat = activos.find((m) => m.id === materialId);
          const corregir = it._catId && mat && mat.categoria_id !== it._catId ? it._catId : null;
          await aplicarPrecioMaterial(materialId, { precio: it.precio_unitario, moneda: it.moneda, proveedor, categoria_id: corregir });
          actualizados += 1;
          if (corregir) movidos += 1;
        } else if (it._catId) {
          materialId = await crearMaterial({
            categoria_id: it._catId,
            descripcion: it.descripcion.trim(),
            precio_unitario: toNum(it.precio_unitario),
            moneda: it.moneda,
            proveedor: proveedor || "",
            revisado: false,
          });
          creados += 1;
        } else continue;
        if (linea && materialId && toNum(it.cantidad) != null) {
          await setCantidadModelo(materialId, linea, it.cantidad);
          bom += 1;
        }
      }
      setResultado({ actualizados, creados, movidos, bom });
      limpiarBorrador();
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setAplicando(false); }
  }

  // Crea una subdivisión (subsector) bajo el sector raíz del ítem, sin salir del modal.
  async function crearSubsectorPara(idx) {
    const cat = categorias.find((c) => c.id === items[idx]._catId);
    const raizId = cat ? (cat.parent_id || cat.id) : null;
    if (!raizId) { setErr(new Error("Elegí primero un sector para crearle una subdivisión.")); return; }
    const raiz = categorias.find((c) => c.id === raizId);
    const nombre = window.prompt(`Nueva subdivisión de "${raiz?.nombre || "sector"}":`);
    if (!nombre || !nombre.trim()) return;
    try {
      setErr(null);
      const nueva = await crearCategoria(nombre, { parentId: raizId, orden: hijosDe(categorias, raizId).length });
      setItem(idx, { _catId: nueva.id });
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  const coinciden = items?.filter((it) => it.material_id).length ?? 0;
  const nuevos = items?.filter((it) => !it.material_id && it.descripcion.trim()).length ?? 0;
  const sinSector = items?.filter(faltaSector).length ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2200, background: "rgba(0,0,0,0.66)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3vh 12px", overflowY: "auto" }}>
      <div style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 16, padding: 22, width: "min(1180px, 97vw)", maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.t0 }}>Cargar presupuesto</div>
            {restaurado && !resultado && <span style={{ fontSize: 10.5, color: "#a78bfa", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>● borrador restaurado</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(items || texto) && !resultado && <button type="button" onClick={descartar} style={{ ...BTN, padding: "4px 10px", color: C.red }}>Descartar</button>}
            <button type="button" onClick={onClose} style={{ ...BTN, padding: "4px 9px" }} title="Cerrar — el borrador se guarda y lo recuperás al volver">✕</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>
          Lo que coincide con la matriz actualiza su precio; lo nuevo lo clasifica la IA por sector (lo confirmás vos). Se guarda un borrador automático: si cerrás sin querer, lo recuperás al volver a abrir.
        </div>

        {err && <div style={{ marginBottom: 12 }}><ErrorBox error={err} onRetry={() => setErr(null)} /></div>}

        {resultado ? (
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 15, color: C.green, fontWeight: 700 }}>Presupuesto cargado ✓</div>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 6 }}>
              {resultado.actualizados} precios actualizados · {resultado.creados} creados
              {resultado.movidos ? ` · ${resultado.movidos} reasignados de sector` : ""}
              {resultado.bom ? ` · ${resultado.bom} cantidades cargadas a la línea` : ""}.
            </div>
            <button type="button" onClick={onClose} style={{ ...BTN_PRIMARY, marginTop: 14 }}>Listo</button>
          </div>
        ) : items === null ? (
          <>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Pegá acá el texto del presupuesto…\nEj:\nBow thruster Side-Power 12V   1u   US$ 1.250\nCable 2.5mm rollo   x3   $45.000\nFiltro Racor combustible   2u   US$ 38"}
              style={{ ...INP, width: "100%", minHeight: 160, resize: "vertical", fontFamily: C.mono, fontSize: 12.5, lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", color: C.t2, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: C.b0 }} /> o subí un archivo <div style={{ flex: 1, height: 1, background: C.b0 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={BTN}><Upload size={14} /> {file ? "Cambiar archivo" : "PDF o foto"}</button>
              {file && <span style={{ fontSize: 12, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div style={{ flex: 1 }} />
              <button type="button" onClick={leer} disabled={leyendo} style={{ ...BTN_PRIMARY, opacity: leyendo ? 0.6 : 1 }}>
                {leyendo ? "Leyendo con IA…" : "Leer con IA"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.t2 }}>Proveedor:</span>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor" style={{ ...INP, width: 190 }} />
              <span style={{ fontSize: 12, color: C.t2, marginLeft: 6 }}>Línea de producción:</span>
              <select value={linea} onChange={(e) => setLinea(e.target.value)} style={{ ...INP, width: 140 }}>
                <option value="">— Sin línea —</option>
                {MODELOS.map((m) => <option key={m} value={m}>K{m}</option>)}
              </select>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{coinciden} coinciden · {nuevos} nuevos{sinSector ? ` · ${sinSector} sin sector` : ""}</span>
            </div>
            <div style={{ fontSize: 11, color: linea ? "#a78bfa" : C.t2, marginBottom: 10 }}>
              {linea ? `Las cantidades se cargan al BOM de la línea K${linea} (alimenta el Costo de obra de esa línea).` : "Sin línea: solo se crean/actualizan materiales y precios; las cantidades no se guardan."}
            </div>

            <div style={{ display: "grid", gap: 8, maxHeight: "58vh", overflowY: "auto", paddingRight: 4 }}>
              {items.map((it, idx) => {
                const malSector = faltaSector(it);
                return (
                  <div key={idx} style={{ border: `1px solid ${malSector ? "rgba(239,68,68,0.5)" : it.material_id ? "rgba(16,185,129,0.3)" : C.b0}`, borderRadius: 10, padding: 10, background: C.s0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input value={it.descripcion} onChange={(e) => setItem(idx, { descripcion: e.target.value })} style={{ ...INP, flex: 1, fontWeight: 600 }} />
                      <input value={it.cantidad} onChange={(e) => setItem(idx, { cantidad: e.target.value })} placeholder="Cant" type="number" step="any" title="Cantidad para el BOM de la línea" style={{ ...INP, width: 62, fontFamily: C.mono }} />
                      <input value={it.precio_unitario} onChange={(e) => setItem(idx, { precio_unitario: e.target.value })} placeholder="Precio" type="number" step="any" style={{ ...INP, width: 100, fontFamily: C.mono }} />
                      <select value={it.moneda} onChange={(e) => setItem(idx, { moneda: e.target.value })} style={{ ...INP, width: 72 }}>
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                      <button type="button" onClick={() => quitar(idx)} title="Quitar" style={{ ...BTN, padding: "6px 8px", color: C.red }}>✕</button>
                    </div>
                    <VincularItem
                      activos={activos}
                      categorias={categorias}
                      item={it}
                      onChange={(mid) => {
                        const mat = activos.find((m) => m.id === mid);
                        setItem(idx, mat ? { material_id: mid, _catId: mat.categoria_id } : { material_id: "" });
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 7 }}>
                      <span style={{ fontSize: 11, color: C.t2, minWidth: 78 }}>Sector</span>
                      <SectorPicker categorias={categorias} value={it._catId} onChange={(v) => setItem(idx, { _catId: v })} invalid={malSector} />
                      <button type="button" onClick={() => crearSubsectorPara(idx)} title="Crear una subdivisión en este sector" style={{ ...BTN, padding: "6px 9px", whiteSpace: "nowrap" }}>＋ sub</button>
                    </div>
                    {it.material_id && (() => {
                      const mat = activos.find((m) => m.id === it.material_id);
                      return mat && it._catId && mat.categoria_id !== it._catId ? (
                        <div style={{ fontSize: 11, color: C.amber, marginTop: 4, paddingLeft: 84 }}>↗ se mueve de “{categoriaNombre(categorias, mat.categoria_id)}” a “{categoriaNombre(categorias, it._catId)}”</div>
                      ) : null;
                    })()}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => { setItems(null); setResultado(null); }} style={BTN}>← Volver</button>
              {sinSector > 0 && <span style={{ fontSize: 11, color: C.red }}>{sinSector} ítem(s) sin sector</span>}
              <div style={{ flex: 1 }} />
              <button type="button" onClick={aplicar} disabled={aplicando || !items.length} style={{ ...BTN_PRIMARY, opacity: aplicando || !items.length ? 0.6 : 1 }}>
                {aplicando ? "Aplicando…" : `Aplicar (${coinciden + nuevos})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Buscador global: busca en TODO el catálogo y suma el material al sector/subsector
// actual (multi-área, sin sacarlo de donde estaba) o crea uno nuevo ahí.
function BuscadorAgregar({ categorias, materiales, selectedId, onChanged }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const query = q.trim().toLowerCase();
  const scope = useMemo(() => idsScope(categorias, selectedId), [categorias, selectedId]);
  const destino = categoriaNombre(categorias, selectedId);

  const resultados = useMemo(() => {
    if (query.length < 2) return [];
    return materiales
      .filter(materialActivo)
      .filter((m) => `${m.descripcion ?? ""} ${m.proveedor ?? ""} ${m.codigo ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? "", "es"))
      .slice(0, 40);
  }, [materiales, query]);

  async function agregar(m) {
    setBusy(m.id); setErr(null);
    try {
      const extras = (m.areas ?? [m.categoria_id]).filter((a) => a !== m.categoria_id && a !== selectedId);
      await setMaterialAreas(m.id, [...new Set([...extras, selectedId])]);
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  }

  async function crearNuevo() {
    const desc = q.trim();
    if (!desc) return;
    setBusy("nuevo"); setErr(null);
    try {
      await crearMaterial({ descripcion: desc, categoria_id: selectedId, revisado: false });
      setQ("");
      await onChanged?.();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  }

  return (
    <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.t2, fontWeight: 700, marginBottom: 9 }}>
        Buscar en el catálogo y agregar a <span style={{ color: "#60a5fa" }}>{destino}</span>
      </div>
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: C.t2 }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material por descripción, proveedor o código…" style={{ ...INP, width: "100%", paddingLeft: 34 }} />
      </div>
      {err && <div style={{ marginTop: 8 }}><ErrorBox error={err} onRetry={() => setErr(null)} /></div>}

      {query.length >= 2 && (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {resultados.map((m) => {
            const yaEsta = materialEnScope(m, scope);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: C.panelSolid, border: `1px solid ${C.b0}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.t0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.descripcion}</div>
                  <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
                    {categoriaNombre(categorias, m.categoria_id)}{m.proveedor ? ` · ${m.proveedor}` : ""}
                  </div>
                </div>
                <PriceBadge material={m} />
                {yaEsta ? (
                  <span style={{ fontSize: 11, color: C.green, fontWeight: 700, padding: "5px 10px", whiteSpace: "nowrap" }}>✓ ya está acá</span>
                ) : (
                  <button type="button" disabled={busy === m.id} onClick={() => agregar(m)} style={{ ...BTN_PRIMARY, padding: "6px 12px", fontSize: 12, opacity: busy === m.id ? 0.6 : 1, whiteSpace: "nowrap" }}>
                    {busy === m.id ? "Agregando…" : "Agregar acá"}
                  </button>
                )}
              </div>
            );
          })}

          <button type="button" disabled={busy === "nuevo"} onClick={crearNuevo} style={{ ...BTN, marginTop: 4, justifyContent: "center", border: `1px dashed ${C.b1}`, color: "#60a5fa", padding: "9px" }}>
            <PackagePlus size={14} /> {busy === "nuevo" ? "Creando…" : <>Crear nuevo <strong style={{ marginLeft: 4 }}>“{q.trim()}”</strong> en {destino}</>}
          </button>

          {resultados.length === 0 && (
            <div style={{ fontSize: 12, color: C.t2, textAlign: "center", padding: "6px 0" }}>
              No hay materiales que coincidan. Podés crearlo nuevo ↑
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionTab({ categorias, materiales, proveedores, opciones = [], onChanged }) {
  const [selectedId, setSelectedId] = useState(categorias[0]?.id ?? "");
  const [modo, setModo] = useState("cola");
  const [queueIndex, setQueueIndex] = useState(0);
  const [showBuscar, setShowBuscar] = useState(false);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const [err, setErr] = useState(null);
  const effectiveSelectedId = selectedId && categorias.some((c) => c.id === selectedId)
    ? selectedId
    : categorias[0]?.id ?? "";

  const progressByCat = useMemo(() => {
    // Cada sector cuenta sus materiales por "scope" (él + subsectores), únicos.
    // Así el padre hace roll-up de los hijos sin doble conteo.
    const activos = materiales.filter(materialActivo);
    const map = new Map();
    for (const c of categorias) {
      const scope = idsScope(categorias, c.id);
      let total = 0, revisados = 0;
      for (const m of activos) {
        if (materialEnScope(m, scope)) { total += 1; if (m.revisado) revisados += 1; }
      }
      map.set(c.id, { total, revisados });
    }
    return map;
  }, [categorias, materiales]);

  const ums = useMemo(() => {
    return [...new Set(materiales.map((m) => m.unidad_medida).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es"));
  }, [materiales]);

  const selectedMaterials = useMemo(() => {
    const scope = idsScope(categorias, effectiveSelectedId);
    return materiales.filter(materialActivo).filter((m) => materialEnScope(m, scope));
  }, [materiales, categorias, effectiveSelectedId]);

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

  async function addSubsector(parent) {
    const nombre = window.prompt(`Nuevo subsector de "${parent.nombre}":`);
    if (!nombre?.trim()) return;
    try {
      setErr(null);
      const c = await crearCategoria(nombre, { parentId: parent.id, orden: hijosDe(categorias, parent.id).length });
      await onChanged?.();
      setSelectedId(c.id);
      setQueueIndex(0);
    } catch (e) { setErr(e); }
  }

  async function suggestSubsectores(parent, sugeridas) {
    if (!sugeridas?.length) return;
    if (!window.confirm(`Crear ${sugeridas.length} subsectores en "${parent.nombre}":\n\n${sugeridas.join(" · ")}`)) return;
    try {
      setErr(null);
      let orden = hijosDe(categorias, parent.id).length;
      for (const nombre of sugeridas) await crearCategoria(nombre, { parentId: parent.id, orden: orden++ });
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  async function deleteSubsector(cat) {
    if (!window.confirm(`¿Borrar el subsector "${cat.nombre}"? Sus materiales vuelven al sector padre.`)) return;
    try {
      setErr(null);
      await borrarSubsector(cat.id, cat.parent_id);
      if (effectiveSelectedId === cat.id) { setSelectedId(cat.parent_id); setQueueIndex(0); }
      await onChanged?.();
    } catch (e) { setErr(e); }
  }

  return (
    <div>
      <SectorSelector
        categorias={categorias}
        progressByCat={progressByCat}
        selectedId={effectiveSelectedId}
        onSelect={(id) => { setSelectedId(id); setQueueIndex(0); }}
        onAddSub={addSubsector}
        onSuggestSub={suggestSubsectores}
        onDeleteSub={deleteSubsector}
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
        <button
          type="button"
          onClick={() => setShowBuscar((v) => !v)}
          style={{ ...BTN, background: showBuscar ? "rgba(59,130,246,0.14)" : C.s0, border: `1px solid ${showBuscar ? "rgba(59,130,246,0.35)" : C.b0}`, color: showBuscar ? "#60a5fa" : C.t1 }}
          title="Buscar en el catálogo y agregar al sector"
        >
          <Search size={14} /> {showBuscar ? "Cerrar buscador" : "Buscar y agregar"}
        </button>
        <button
          type="button"
          onClick={() => setShowPresupuesto(true)}
          style={{ ...BTN, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
          title="Cargar un presupuesto (texto o PDF/foto) con IA y matchearlo contra la matriz"
        >
          <Upload size={14} /> Cargar presupuesto
        </button>
        <button type="button" onClick={onChanged} style={BTN} title="Reintentar carga">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {err && <ErrorBox error={err} onRetry={() => setErr(null)} />}

      {showBuscar && (
        <BuscadorAgregar
          categorias={categorias}
          materiales={materiales}
          selectedId={effectiveSelectedId}
          onChanged={onChanged}
        />
      )}

      {showPresupuesto && (
        <CargarPresupuestoModal
          categorias={categorias}
          materiales={materiales}
          onChanged={onChanged}
          onClose={() => setShowPresupuesto(false)}
        />
      )}

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

// Costo de un material para un modelo: cantidad (BOM del modelo) × precio vigente.
function costoMaterialModelo(m, modelo) {
  const cant = Number(toBomMap(m)[modelo]);
  const tieneCant = Number.isFinite(cant) && cant > 0;
  const price = precioVigente(m);
  const pu = price?.precio_unitario != null && price.precio_unitario !== "" ? Number(price.precio_unitario) : null;
  const tienePrecio = pu != null && Number.isFinite(pu) && pu > 0;
  return {
    tieneCant,
    moneda: price?.moneda === "USD" ? "USD" : "ARS",
    costo: tieneCant && tienePrecio ? cant * pu : 0,
    faltaPrecio: tieneCant && !tienePrecio,
  };
}

function CostoObraTab({ categorias, materiales }) {
  const [modelo, setModelo] = useState(MODELOS[0]);
  const activos = useMemo(() => (materiales ?? []).filter(materialActivo), [materiales]);

  const aggScope = useCallback((scope) => {
    const acc = { usd: 0, ars: 0, items: 0, sinPrecio: 0 };
    for (const m of activos) {
      if (!materialEnScope(m, scope)) continue;
      const c = costoMaterialModelo(m, modelo);
      if (!c.tieneCant) continue;
      acc.items += 1;
      if (c.faltaPrecio) { acc.sinPrecio += 1; continue; }
      if (c.moneda === "USD") acc.usd += c.costo; else acc.ars += c.costo;
    }
    return acc;
  }, [activos, modelo]);

  // Total global: cada material cuenta una sola vez (no infla por multi-área).
  const total = useMemo(() => {
    const acc = { usd: 0, ars: 0, items: 0, sinPrecio: 0 };
    for (const m of activos) {
      const c = costoMaterialModelo(m, modelo);
      if (!c.tieneCant) continue;
      acc.items += 1;
      if (c.faltaPrecio) { acc.sinPrecio += 1; continue; }
      if (c.moneda === "USD") acc.usd += c.costo; else acc.ars += c.costo;
    }
    return acc;
  }, [activos, modelo]);

  const filas = useMemo(() => categorias.filter(esRaiz).map((r) => ({
    cat: r,
    agg: aggScope(idsScope(categorias, r.id)),
    subs: hijosDe(categorias, r.id).map((s) => ({ cat: s, agg: aggScope(new Set([s.id])) })),
  })), [categorias, aggScope]);

  const money = (v, mon) => (v ? fmtMoney(v, mon) : "—");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.t2 }}>Modelo de barco:</span>
        <div style={{ display: "flex", gap: 4, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: 3 }}>
          {MODELOS.map((mod) => (
            <button key={mod} type="button" onClick={() => setModelo(mod)} style={{ ...BTN, border: "none", background: modelo === mod ? C.s2 : "transparent", color: modelo === mod ? C.t0 : C.t2, padding: "6px 16px", fontWeight: modelo === mod ? 700 : 500 }}>
              K{mod}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label={`Costo materiales USD · K${modelo}`} value={fmtMoney(total.usd, "USD")} color={C.green} />
        <KpiCard label={`Costo materiales ARS · K${modelo}`} value={fmtMoney(total.ars, "ARS")} color={C.t0} />
        <KpiCard label="Ítems con cantidad" value={total.items} color={C.t1} />
        <KpiCard label="Sin precio (faltan cotizar)" value={total.sinPrecio} color={total.sinPrecio ? C.amber : C.green} />
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Sector</Th>
              <Th right>Ítems</Th>
              <Th right>Sin precio</Th>
              <Th right>Costo USD</Th>
              <Th right>Costo ARS</Th>
            </tr>
          </thead>
          <tbody>
            {filas.flatMap((f) => [
              <tr key={f.cat.id}>
                <Td>{f.cat.nombre}</Td>
                <Td right mono>{f.agg.items || "—"}</Td>
                <Td right mono color={f.agg.sinPrecio ? C.amber : C.t2}>{f.agg.sinPrecio || "—"}</Td>
                <Td right mono>{money(f.agg.usd, "USD")}</Td>
                <Td right mono>{money(f.agg.ars, "ARS")}</Td>
              </tr>,
              ...f.subs.map((s) => (
                <tr key={s.cat.id} style={{ background: C.s0 }}>
                  <Td><span style={{ paddingLeft: 18, color: C.t2 }}>↳ {s.cat.nombre}</span></Td>
                  <Td right mono color={C.t2}>{s.agg.items || "—"}</Td>
                  <Td right mono color={s.agg.sinPrecio ? C.amber : C.t2}>{s.agg.sinPrecio || "—"}</Td>
                  <Td right mono color={C.t2}>{money(s.agg.usd, "USD")}</Td>
                  <Td right mono color={C.t2}>{money(s.agg.ars, "ARS")}</Td>
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.b1}` }}>
              <Td><strong>Total obra K{modelo}</strong></Td>
              <Td right mono><strong>{total.items}</strong></Td>
              <Td right mono color={total.sinPrecio ? C.amber : C.t2}><strong>{total.sinPrecio || "—"}</strong></Td>
              <Td right mono><strong>{fmtMoney(total.usd, "USD")}</strong></Td>
              <Td right mono><strong>{fmtMoney(total.ars, "ARS")}</strong></Td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize: 11, color: C.t2, marginTop: 10, lineHeight: 1.6 }}>
        USD y ARS van por separado (no se convierten). Un material en varios sectores suma en cada uno, así que la suma por sector puede superar el total (el total cuenta cada material una vez). “Sin precio” = ítems con cantidad en K{modelo} pero sin precio vigente; cargá la cotización del proveedor en <strong>Comprobantes</strong> y el costo se completa solo.
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
  const [obrasAvance, setObrasAvance] = useState([]);
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
      setObrasAvance(await fetchObrasAvance());
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
    fetchObrasAvance().then((rows) => { if (active) setObrasAvance(rows); }).catch(() => {});
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
              {tab === "bandeja" && <BandejaTab categorias={categorias} materiales={materiales} onChanged={cargar} />}
              {tab === "comprobantes" && <ComprobantesTab categorias={categorias} materiales={materiales} proveedores={proveedores} comprobantes={comprobantes} onChanged={cargar} />}
              {tab === "revision" && <RevisionTab categorias={categorias} materiales={materiales} proveedores={proveedores} opciones={opciones} onChanged={cargar} />}
              {tab === "variantes" && <VariantesTab opciones={opciones} onChanged={cargar} />}
              {tab === "proveedores" && <ProveedoresTab proveedores={proveedores} onChanged={cargar} />}
              {tab === "avance" && <AvanceTab categorias={categorias} materiales={materiales} batches={batches} obras={obrasAvance} />}
              {tab === "costos" && <CostoObraTab categorias={categorias} materiales={materiales} />}
              {tab === "resumen" && <ResumenTab categorias={categorias} materiales={materiales} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
