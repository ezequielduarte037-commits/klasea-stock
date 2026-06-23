import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  FileSpreadsheet,
  Layers3,
  PencilLine,
  Printer,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import {
  loadMemoriasFromSupabase,
  saveMemoriaToSupabase,
  subscribeMemorias,
} from "@/features/obras/mapa/persistence";
import { getLineaTipo, MEMORIA_FIELDS_BY_TIPO } from "@/features/obras/mapa/memoriaFields";
import { MEMORIA_EXCEL_SEED } from "./memoriaExcelSeed";

const BOOL_KEYS = new Set([
  "starlink",
  "sternthruster",
  "fabricadora_hielo",
  "radar",
  "pluma",
  "planchada",
  "mesa_fly",
  "aire_acondicionado",
  "calefactor",
  "bow_thruster",
  "plotter",
  "faro",
  "flaps",
]);

const FEATURE_FIELDS = [
  "madera_muebles",
  "piso",
  "color_mesadas",
  "tapiceria_mamparos",
  "color_acolchados",
  "color_cerramientos",
  "teca_tipo",
];

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isFilled(value) {
  if (typeof value === "boolean") return value;
  return String(value || "").trim() !== "";
}

function parseToggle(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (/^(si|sí|true|x|p)\b/.test(text)) return true;
  if (/^(no|false|o)\b/.test(text)) return false;
  return false;
}

function normalizeMemoryFields(raw, descriptors) {
  const next = { ...(raw || {}) };
  for (const field of descriptors) {
    if (!BOOL_KEYS.has(field.key)) continue;
    const value = next[field.key];
    if (typeof value === "string" && value.trim()) {
      if (!next[`${field.key}_obs`] && !/^(si|sí|true|false|no|x|p|o)$/i.test(value.trim())) {
        next[`${field.key}_obs`] = value;
      }
      next[field.key] = parseToggle(value);
    }
  }
  return next;
}

function mergeMemory({ obra, dbMemorias }) {
  const code = normalizeCode(obra?.codigo);
  const fromExcel = MEMORIA_EXCEL_SEED[code] || {};
  const fromDb = dbMemorias?.[obra?.id] || dbMemorias?.[code] || {};
  const descriptors = MEMORIA_FIELDS_BY_TIPO[getLineaTipo(obra)] || MEMORIA_FIELDS_BY_TIPO.default;
  return normalizeMemoryFields({ ...fromExcel, ...fromDb }, descriptors);
}

function completionFor(fields, descriptors) {
  const editable = descriptors.filter((field) => field.type !== "toggle" || BOOL_KEYS.has(field.key));
  const total = editable.length || 1;
  const done = editable.filter((field) => isFilled(fields[field.key])).length;
  return { done, total, pct: Math.round((done / total) * 100), pending: total - done };
}

function groupBySection(fields) {
  return fields.reduce((acc, field) => {
    const section = field.section || "General";
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});
}

function lineName(obra) {
  if (obra?.linea_nombre) return obra.linea_nombre;
  const code = normalizeCode(obra?.codigo);
  if (/^H/i.test(code)) return "K34";
  const m = code.match(/^(\d+)/);
  return m ? `K${m[1]}` : "Sin linea";
}

function swatchFor(key, value) {
  const text = String(value || "").toLowerCase();
  if (!text) return { a: C.panel2, b: C.panel3, label: "Pendiente" };
  if (key.includes("madera") || key.includes("teca")) {
    if (text.includes("nogal")) return { a: "#7c4a28", b: "#c08b5c", label: value };
    if (text.includes("roble")) return { a: "#c8a16a", b: "#f0d8aa", label: value };
    if (text.includes("gris")) return { a: "#6b7280", b: "#d1d5db", label: value };
    if (text.includes("chocolate")) return { a: "#3f2418", b: "#8b5a3c", label: value };
    return { a: "#9a6b3f", b: "#e2c08b", label: value };
  }
  if (key.includes("piso")) {
    if (text.includes("white") || text.includes("blanco")) return { a: "#f8fafc", b: "#d1d5db", label: value };
    if (text.includes("gris")) return { a: "#4b5563", b: "#9ca3af", label: value };
    return { a: "#8a8175", b: "#e5ded5", label: value };
  }
  if (key.includes("mesada")) {
    if (text.includes("olimp")) return { a: "#f8fafc", b: "#cbd5e1", label: value };
    if (text.includes("negro") || text.includes("black")) return { a: "#0f172a", b: "#475569", label: value };
    if (text.includes("travertino")) return { a: "#cdbb9d", b: "#f5ecd8", label: value };
    return { a: "#e5e7eb", b: "#9ca3af", label: value };
  }
  if (key.includes("tapiceria") || key.includes("acolchado") || key.includes("cerramiento")) {
    if (text.includes("negro") || text.includes("charcoal")) return { a: "#111827", b: "#4b5563", label: value };
    if (text.includes("hielo") || text.includes("white")) return { a: "#f8fafc", b: "#cbd5e1", label: value };
    if (text.includes("gris")) return { a: "#6b7280", b: "#d1d5db", label: value };
    return { a: "#64748b", b: "#cbd5e1", label: value };
  }
  return { a: C.blue, b: C.teal, label: value };
}

function labelValue(value) {
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value || "").trim();
}

async function fetchActiveObras() {
  const base = "id,codigo,estado,linea_nombre,descripcion,fecha_inicio,fecha_fin_estimada,notas";
  const { data, error } = await supabase
    .from("produccion_obras")
    .select(base)
    .eq("estado", "activa")
    .order("codigo", { ascending: true });
  if (error) throw error;
  return data || [];
}

function FieldCell({ field, value, obs, onValue, onObs }) {
  const isToggle = field.type === "toggle" || BOOL_KEYS.has(field.key);
  if (isToggle) {
    const active = !!value;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "150px minmax(180px, 1fr)", gap: 8, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {[
            { label: "Si", value: true, color: C.green },
            { label: "No", value: false, color: C.dim },
          ].map((opt) => {
            const selected = active === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onValue(opt.value)}
                style={{
                  border: `1px solid ${selected ? `${opt.color}66` : C.border}`,
                  background: selected ? `${opt.color}16` : C.panel,
                  color: selected ? opt.color : C.dim,
                  borderRadius: 7,
                  padding: "7px 9px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 850,
                  fontFamily: C.sans,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <input
          value={obs || ""}
          onChange={(e) => onObs(e.target.value)}
          placeholder="Observacion"
          style={cellInputStyle({ color: C.muted })}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, .75fr)", gap: 8 }}>
      <textarea
        value={value || ""}
        onChange={(e) => onValue(e.target.value)}
        rows={1}
        placeholder="Definir..."
        style={cellTextareaStyle()}
      />
      <input
        value={obs || ""}
        onChange={(e) => onObs(e.target.value)}
        placeholder="Obs."
        style={cellInputStyle({ color: C.muted })}
      />
    </div>
  );
}

function cellInputStyle(extra = {}) {
  return {
    width: "100%",
    minHeight: 36,
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    color: C.text,
    borderRadius: 8,
    padding: "8px 10px",
    outline: "none",
    fontSize: 13,
    fontFamily: C.sans,
    ...extra,
  };
}

function cellTextareaStyle() {
  return {
    ...cellInputStyle(),
    minHeight: 36,
    resize: "vertical",
    lineHeight: 1.35,
  };
}

function ActionButton({ children, onClick, color = C.blue, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        border: `1px solid ${color}44`,
        background: `${color}12`,
        color,
        borderRadius: 9,
        padding: "9px 12px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: 13,
        fontWeight: 850,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function MemoriasScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [obras, setObras] = useState([]);
  const [dbMemorias, setDbMemorias] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => obras.find((obra) => obra.id === selectedId) || obras[0] || null,
    [obras, selectedId],
  );
  const lineaTipo = getLineaTipo(selected);
  const descriptors = MEMORIA_FIELDS_BY_TIPO[lineaTipo] || MEMORIA_FIELDS_BY_TIPO.default;
  const grouped = useMemo(() => groupBySection(descriptors), [descriptors]);
  const completion = useMemo(() => completionFor(fields, descriptors), [fields, descriptors]);
  const filteredObras = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter((obra) => [
      obra.codigo,
      obra.descripcion,
      obra.linea_nombre,
      fields.propietario,
    ].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [obras, query, fields.propietario]);

  async function load() {
    setLoading(true);
    try {
      const [obraRows, memoriaRows] = await Promise.all([
        fetchActiveObras(),
        loadMemoriasFromSupabase(),
      ]);
      setObras(obraRows);
      setDbMemorias(memoriaRows);
      setSelectedId((current) => current || obraRows[0]?.id || "");
    } catch (error) {
      toast.error(error.message || "No se pudieron cargar las memorias.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const unsub = subscribeMemorias(async () => {
      const memoriaRows = await loadMemoriasFromSupabase();
      setDbMemorias(memoriaRows);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selected) return;
    setFields(mergeMemory({ obra: selected, dbMemorias }));
    setDirty(false);
  }, [selected?.id, dbMemorias]);

  function patchField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await saveMemoriaToSupabase(selected.id, selected.codigo, fields);
      const memoriaRows = await loadMemoriasFromSupabase();
      setDbMemorias(memoriaRows);
      setDirty(false);
      toast.success("Memoria guardada.");
    } catch (error) {
      toast.error(error.message || "No se pudo guardar la memoria.");
    } finally {
      setSaving(false);
    }
  }

  function copySummary() {
    if (!selected) return;
    const lines = [
      `Memoria descriptiva ${selected.codigo}`,
      `Linea: ${lineName(selected)}`,
      fields.propietario ? `Propietario: ${fields.propietario}` : null,
      "",
      ...descriptors
        .map((field) => {
          const value = labelValue(fields[field.key]);
          const obs = labelValue(fields[`${field.key}_obs`]);
          if (!value && !obs) return null;
          return `${field.label}: ${value || "-"}${obs ? ` (${obs})` : ""}`;
        })
        .filter(Boolean),
    ].filter((line) => line !== null);
    navigator.clipboard?.writeText(lines.join("\n"));
    toast.success("Resumen copiado.");
  }

  const seedExists = !!MEMORIA_EXCEL_SEED[normalizeCode(selected?.codigo)];
  const savedExists = !!(selected && (dbMemorias[selected.id] || dbMemorias[normalizeCode(selected.codigo)]));

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, color: C.text, fontFamily: C.sans, overflow: "hidden" }}>
      <style>{`
        @media print {
          aside, .mem-no-print { display: none !important; }
          .mem-shell { display: block !important; }
          .mem-main { overflow: visible !important; }
          .mem-table-scroll { overflow: visible !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="mem-shell" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0, 1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main className="mem-main" style={{ minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          <header className="mem-no-print" style={{
            borderBottom: `1px solid ${C.border}`,
            background: C.topbar,
            padding: isMobile ? "12px 12px 12px 62px" : "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: "var(--violet-soft)",
              border: "1px solid var(--violet-border)",
              color: C.violet,
              flexShrink: 0,
            }}>
              <FileSpreadsheet size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.text }}>Memorias descriptivas</h1>
              <div style={{ marginTop: 3, color: C.dim, fontSize: 12 }}>
                Barcos activos en producción · formato tipo planilla para iPad
              </div>
            </div>
            <ActionButton onClick={load} color={C.muted}>
              <RefreshCw size={14} /> Actualizar
            </ActionButton>
            <ActionButton onClick={copySummary} color={C.teal} disabled={!selected}>
              <ClipboardCopy size={14} /> Copiar
            </ActionButton>
            <ActionButton onClick={() => window.print()} color={C.amber} disabled={!selected}>
              <Printer size={14} /> PDF
            </ActionButton>
            <ActionButton onClick={save} color={C.green} disabled={!selected || saving || !dirty}>
              <Save size={14} /> {saving ? "Guardando..." : dirty ? "Guardar" : "Guardado"}
            </ActionButton>
          </header>

          <div style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "310px minmax(0, 1fr)",
            overflow: "hidden",
          }}>
            <aside className="mem-no-print" style={{
              borderRight: isMobile ? "none" : `1px solid ${C.border}`,
              borderBottom: isMobile ? `1px solid ${C.border}` : "none",
              padding: 12,
              overflow: "auto",
              maxHeight: isMobile ? 260 : "none",
            }}>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar barco, propietario..."
                  style={{ ...cellInputStyle(), paddingLeft: 32 }}
                />
              </div>
              {loading ? (
                <div style={{ color: C.dim, padding: 14, fontSize: 13 }}>Cargando memorias...</div>
              ) : filteredObras.length === 0 ? (
                <div style={{ color: C.dim, padding: 14, fontSize: 13 }}>No hay barcos activos para mostrar.</div>
              ) : (
                <div style={{ display: "grid", gap: 7 }}>
                  {filteredObras.map((obra) => {
                    const merged = mergeMemory({ obra, dbMemorias });
                    const ds = MEMORIA_FIELDS_BY_TIPO[getLineaTipo(obra)] || MEMORIA_FIELDS_BY_TIPO.default;
                    const pct = completionFor(merged, ds).pct;
                    const active = selected?.id === obra.id;
                    return (
                      <button
                        key={obra.id}
                        type="button"
                        onClick={() => setSelectedId(obra.id)}
                        style={{
                          textAlign: "left",
                          border: `1px solid ${active ? "var(--violet-border)" : C.border}`,
                          background: active ? C.panelSolid2 : C.panel,
                          borderRadius: 11,
                          padding: 11,
                          color: C.text,
                          cursor: "pointer",
                          fontFamily: C.sans,
                          display: "grid",
                          gap: 8,
                          boxShadow: active ? `inset 3px 0 0 ${C.violet}` : "none",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <strong style={{ fontSize: 15 }}>{obra.codigo}</strong>
                          <span style={{ color: C.dim, fontSize: 11, fontWeight: 800 }}>{lineName(obra)}</span>
                          <span style={{ marginLeft: "auto", color: pct >= 80 ? C.green : pct >= 45 ? C.amber : C.dim, fontSize: 11, fontFamily: C.mono }}>{pct}%</span>
                        </div>
                        <div style={{ color: C.dim, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {merged.propietario || obra.descripcion || "Sin propietario cargado"}
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: C.panel2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? C.green : C.violet }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            <section className="mem-table-scroll" style={{ minHeight: 0, overflow: "auto", padding: isMobile ? 12 : 18 }}>
              {!selected ? (
                <div style={{ border: `1px dashed ${C.border}`, borderRadius: 16, minHeight: 360, display: "grid", placeItems: "center", color: C.dim }}>
                  Selecciona un barco activo.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14, maxWidth: 1320, margin: "0 auto" }}>
                  <div style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    background: C.panelSolid,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 320px",
                      gap: 0,
                    }}>
                      <div style={{ padding: 16, display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 850 }}>
                              Barco
                            </div>
                            <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 950, letterSpacing: -0.8 }}>{selected.codigo}</h2>
                              <span style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 850 }}>
                                {lineName(selected)}
                              </span>
                              {savedExists && <span style={{ color: C.green, fontSize: 11, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={13} /> En sistema</span>}
                              {!savedExists && seedExists && <span style={{ color: C.amber, fontSize: 11, fontWeight: 850 }}>Base Excel</span>}
                            </div>
                          </div>
                          <div style={{
                            minWidth: 120,
                            display: "grid",
                            justifyItems: "end",
                            gap: 5,
                          }}>
                            <div style={{ color: completion.pct >= 80 ? C.green : C.amber, fontSize: 28, fontWeight: 950, fontFamily: C.mono }}>
                              {completion.pct}%
                            </div>
                            <div style={{ color: C.dim, fontSize: 11 }}>{completion.pending} pendientes</div>
                          </div>
                        </div>

                        <div style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(120px, 1fr))",
                          gap: 8,
                        }}>
                          <InfoBox label="Propietario" value={fields.propietario || "Pendiente"} />
                          <InfoBox label="Constructor" value={fields.constructor || "Pendiente"} />
                          <InfoBox label="Motorizacion" value={fields.motorizacion || "Pendiente"} />
                          <InfoBox label="Casco" value={fields.color_casco || "Pendiente"} />
                        </div>
                      </div>

                      <div style={{
                        borderLeft: isMobile ? "none" : `1px solid ${C.border}`,
                        borderTop: isMobile ? `1px solid ${C.border}` : "none",
                        padding: 14,
                        background: C.panel,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <Layers3 size={15} color={C.violet} />
                          <strong style={{ fontSize: 13 }}>Moodboard rapido</strong>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {FEATURE_FIELDS.map((key) => {
                            const sw = swatchFor(key, fields[key]);
                            return (
                              <div key={key} style={{
                                minHeight: 84,
                                border: `1px solid ${C.border}`,
                                borderRadius: 10,
                                overflow: "hidden",
                                background: C.panelSolid,
                              }}>
                                <div style={{ height: 34, background: `linear-gradient(135deg, ${sw.a}, ${sw.b})` }} />
                                <div style={{ padding: 8 }}>
                                  <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 850 }}>{key.replaceAll("_", " ")}</div>
                                  <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sw.label}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: C.panelSolid,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "minmax(140px, .8fr) minmax(220px, 1fr)" : "230px minmax(420px, 1fr)",
                      background: C.panel2,
                      borderBottom: `1px solid ${C.border}`,
                      color: C.dim,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      fontWeight: 900,
                    }}>
                      <div style={{ padding: "10px 12px" }}>Rubro</div>
                      <div style={{ padding: "10px 12px", borderLeft: `1px solid ${C.border}` }}>Definicion / observacion</div>
                    </div>

                    {Object.entries(grouped).map(([section, rows]) => (
                      <div key={section}>
                        <div style={{
                          padding: "8px 12px",
                          background: C.bg,
                          borderTop: `1px solid ${C.border}`,
                          borderBottom: `1px solid ${C.border}`,
                          color: C.violet,
                          fontSize: 11,
                          letterSpacing: 1.3,
                          textTransform: "uppercase",
                          fontWeight: 950,
                        }}>
                          {section}
                        </div>
                        {rows.map((field) => (
                          <div
                            key={`${section}-${field.key}-${field.label}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobile ? "minmax(140px, .8fr) minmax(220px, 1fr)" : "230px minmax(420px, 1fr)",
                              borderBottom: `1px solid ${C.border}`,
                              alignItems: "stretch",
                            }}
                          >
                            <div style={{
                              padding: "10px 12px",
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              color: C.text,
                              fontSize: 13,
                              fontWeight: 850,
                              background: C.panel,
                            }}>
                              <span style={{ color: isFilled(fields[field.key]) ? C.green : C.dim, display: "grid", placeItems: "center" }}>
                                {field.icon || <PencilLine size={12} />}
                              </span>
                              <span>{field.label}</span>
                            </div>
                            <div style={{ padding: 8, borderLeft: `1px solid ${C.border}`, minWidth: 0 }}>
                              <FieldCell
                                field={field}
                                value={fields[field.key]}
                                obs={fields[`${field.key}_obs`]}
                                onValue={(value) => patchField(field.key, value)}
                                onObs={(value) => patchField(`${field.key}_obs`, value)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.panel,
      padding: 10,
      minWidth: 0,
    }}>
      <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 850 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 13, fontWeight: 850, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
