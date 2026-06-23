import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  FileSpreadsheet,
  FileText,
  Layers3,
  LayoutGrid,
  Menu,
  Palette,
  PencilLine,
  Printer,
  RefreshCw,
  Save,
  Search,
  Ship,
  Sparkles,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import logoKlasea from "@/assets/logos/logo-klasea.png";
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

const CLIENT_AREAS = [
  {
    id: "exterior",
    label: "Exterior",
    kicker: "Casco, cubierta y loneria",
    fields: ["color_casco", "teca_tipo", "loneria_toldo_proa", "loneria_cobertor", "loneria_otros"],
    accent: C.blue,
  },
  {
    id: "interior",
    label: "Interior",
    kicker: "Maderas, pisos y mesadas",
    fields: ["madera_muebles", "piso", "alfombra", "color_mesadas"],
    accent: C.amber,
  },
  {
    id: "tapiceria",
    label: "Tapiceria",
    kicker: "Telas, respaldos y cerramientos",
    fields: [
      "tapiceria_mamparos",
      "tapiceria_dinette",
      "tapiceria_respaldos",
      "tapiceria_exterior",
      "color_acolchados",
      "color_cerramientos",
    ],
    accent: C.violet,
  },
  {
    id: "equipamiento",
    label: "Equipamiento",
    kicker: "Confort, electronica y notas",
    fields: [
      "grupo_electrogeno",
      "aire_acondicionado",
      "calefactor",
      "bow_thruster",
      "sternthruster",
      "fabricadora_hielo",
      "starlink",
      "radar",
      "plotter",
      "faro",
      "flaps",
      "pluma",
      "mesa_fly",
      "electronica",
      "audio",
      "adicionales",
    ],
    accent: C.green,
  },
];

const PAINT_OPTIONS = [
  { label: "Blanco Klase A", meta: "Casco blanco premium", bg: "linear-gradient(135deg, #ffffff, #dfe7ef 48%, #9fb0c3)" },
  { label: "Azul oscuro", meta: "Banda nautica profunda", bg: "linear-gradient(135deg, #071426, #102a4a 54%, #4b77a8)" },
  { label: "Gris Marbella", meta: "Gris perla sobrio", bg: "linear-gradient(135deg, #d7d8d2, #8f9697 58%, #505861)" },
  { label: "Negro brillante", meta: "Look deportivo", bg: "linear-gradient(135deg, #050505, #2a2d33 58%, #8f96a3)" },
  { label: "Verde ingles", meta: "Clasico personalizado", bg: "linear-gradient(135deg, #071d16, #164836 56%, #71a289)" },
];

const WOOD_OPTIONS = [
  { label: "Roble Plata Rayado", meta: "Chapa clara, veta lineal", bg: "linear-gradient(90deg, #c8b894 0 10%, #e9dcc2 10% 18%, #9f8d72 18% 22%, #f4ead7 22% 37%, #b6a17e 37% 43%, #ead9b8 43% 65%, #8f7758 65% 70%, #d6c4a2 70% 100%)" },
  { label: "Roble Tinte Rayado", meta: "Calido y elegante", bg: "linear-gradient(90deg, #6f4526 0 12%, #b9824d 12% 22%, #5b351d 22% 28%, #d1a06c 28% 44%, #7c4b2a 44% 58%, #c89159 58% 74%, #4d2a17 74% 79%, #a86b3d 79% 100%)" },
  { label: "Nogal Natural", meta: "Nogal profundo", bg: "linear-gradient(90deg, #3b2115 0 9%, #7b4b2e 9% 21%, #2c180f 21% 27%, #a36a42 27% 43%, #57311f 43% 59%, #8d5a37 59% 75%, #301a10 75% 83%, #6d4229 83% 100%)" },
  { label: "Gris Terso", meta: "Moderno y neutro", bg: "linear-gradient(90deg, #454b52 0 14%, #8c949d 14% 27%, #5e646c 27% 39%, #c3c8cf 39% 55%, #6e747c 55% 70%, #aab0b7 70% 100%)" },
  { label: "Chocolate", meta: "Oscuro, calido", bg: "linear-gradient(90deg, #1f120c, #3d2518 20%, #6a432b 42%, #2c170f 60%, #8a5b3a 78%, #3b2115)" },
  { label: "Cedro satin", meta: "Luz rojiza", bg: "linear-gradient(90deg, #8f3f25, #cf7a43 25%, #a5502d 45%, #e5a064 60%, #73351f 82%, #bd6739)" },
];

const FLOOR_OPTIONS = [
  { label: "La Europea White", meta: "Vinilico claro", bg: "repeating-linear-gradient(90deg, #f8fafc 0 18px, #d9dee6 18px 20px, #eef1f4 20px 38px)" },
  { label: "Infinity gris c/rayas negras", meta: "Cubierta tecnica", bg: "repeating-linear-gradient(90deg, #7f858d 0 22px, #15181d 22px 25px, #a4a9af 25px 48px)" },
  { label: "Seadek gris", meta: "Textura antideslizante", bg: "radial-gradient(circle at 20% 20%, #c5ccd5 0 2px, transparent 3px), linear-gradient(135deg, #59626d, #afb6bf)" },
  { label: "Teca", meta: "Cubierta clasica", bg: "repeating-linear-gradient(90deg, #c49355 0 24px, #3e2413 24px 27px, #e0b777 27px 50px)" },
  { label: "Arena nautica", meta: "Beige tecnico", bg: "repeating-linear-gradient(90deg, #d4c3a2 0 20px, #7d6a4d 20px 22px, #efe4ca 22px 42px)" },
];

const STONE_OPTIONS = [
  { label: "Negro", meta: "Mesada negra", bg: "radial-gradient(circle at 20% 30%, #6b7280 0 1px, transparent 2px), linear-gradient(135deg, #030712, #111827 62%, #4b5563)" },
  { label: "Dekton Entzo Natural", meta: "Blanco marmolado", bg: "linear-gradient(135deg, #fbfaf4, #d6d2c4 45%, #f4efe3 46%, #b9b1a4 47%, #fffef9)" },
  { label: "Travertino", meta: "Veta piedra calida", bg: "repeating-linear-gradient(0deg, #dfcfad 0 12px, #b89e77 12px 14px, #f6ead0 14px 29px)" },
  { label: "Purastone Aria Pulido", meta: "Claro premium", bg: "linear-gradient(135deg, #f7f5ef, #ccd2d8 35%, #ffffff 55%, #bfc6cf)" },
  { label: "Dessert black mate", meta: "Oscuro mate", bg: "radial-gradient(circle at 70% 20%, #c9a874 0 2px, transparent 3px), linear-gradient(135deg, #15110e, #3f342a)" },
];

const FABRIC_OPTIONS = [
  { label: "Shani 07", meta: "Textil nautico claro", bg: "repeating-linear-gradient(45deg, #d7d9d4 0 6px, #eef0ea 6px 12px)" },
  { label: "Bhanu 01", meta: "Hielo elegante", bg: "repeating-linear-gradient(135deg, #f4f1e8 0 7px, #d8d2c5 7px 9px, #fffaf1 9px 16px)" },
  { label: "Charcoal", meta: "Gris profundo", bg: "repeating-linear-gradient(45deg, #20242b 0 8px, #3b424c 8px 16px)" },
  { label: "Negro", meta: "Exterior sobrio", bg: "linear-gradient(135deg, #050505, #22252b 55%, #090909)" },
  { label: "Gris perla", meta: "Neutro luminoso", bg: "repeating-linear-gradient(45deg, #b8bec5 0 8px, #e4e7eb 8px 16px)" },
  { label: "Azul navy", meta: "Acento nautico", bg: "repeating-linear-gradient(45deg, #061d36 0 8px, #123b63 8px 16px)" },
];

const CANVAS_OPTIONS = [
  { label: "Negro", meta: "Lona negra", bg: "linear-gradient(135deg, #060606, #202020)" },
  { label: "Charcoal con mosquitero", meta: "Cerramiento moderno", bg: "repeating-linear-gradient(90deg, #1f2933 0 8px, #4b5563 8px 10px, #111827 10px 18px)" },
  { label: "Gris", meta: "Lona gris", bg: "linear-gradient(135deg, #6b7280, #d1d5db)" },
  { label: "Blanco", meta: "Lona clara", bg: "linear-gradient(135deg, #ffffff, #dbe1e8)" },
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

function labelValue(value) {
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value || "").trim();
}

function materialPaletteFor(key) {
  if (key === "color_casco") return { title: "Color de casco", options: PAINT_OPTIONS, icon: Ship };
  if (key.includes("madera")) return { title: "Chapas de madera", options: WOOD_OPTIONS, icon: Layers3 };
  if (key.includes("piso") || key.includes("alfombra") || key.includes("teca")) return { title: "Pisos y cubiertas", options: FLOOR_OPTIONS, icon: LayoutGrid };
  if (key.includes("mesada")) return { title: "Mesadas", options: STONE_OPTIONS, icon: Palette };
  if (key.includes("cerramiento") || key.includes("loneria") || key.includes("toldo") || key.includes("cobertor")) {
    return { title: "Lonas y cerramientos", options: CANVAS_OPTIONS, icon: Layers3 };
  }
  if (key.includes("tapiceria") || key.includes("acolchado")) return { title: "Telas y tapiceria", options: FABRIC_OPTIONS, icon: Sparkles };
  return null;
}

function swatchFor(key, value) {
  const text = String(value || "").toLowerCase();
  const palette = materialPaletteFor(key);
  const found = palette?.options.find((opt) => text && opt.label.toLowerCase() === text);
  if (found) return { bg: found.bg, label: value };
  if (!text) return { bg: `linear-gradient(135deg, ${C.panel2}, ${C.panel3})`, label: "Pendiente" };
  if (key.includes("madera") || key.includes("teca")) return { bg: "linear-gradient(90deg, #7c4a28, #c08b5c, #3f2418)", label: value };
  if (key.includes("piso")) return { bg: "linear-gradient(135deg, #8a8175, #e5ded5)", label: value };
  if (key.includes("mesada")) return { bg: "linear-gradient(135deg, #e5e7eb, #9ca3af)", label: value };
  if (key.includes("tapiceria") || key.includes("acolchado") || key.includes("cerramiento")) return { bg: "linear-gradient(135deg, #64748b, #cbd5e1)", label: value };
  if (key === "color_casco") return { bg: "linear-gradient(135deg, #f8fafc, #4b5563)", label: value };
  return { bg: `linear-gradient(135deg, ${C.blue}, ${C.teal})`, label: value };
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

function cellInputStyle(extra = {}) {
  return {
    width: "100%",
    minHeight: 44,
    border: `1px solid ${C.border}`,
    background: C.panelSolid,
    color: C.text,
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontSize: 14,
    fontFamily: C.sans,
    ...extra,
  };
}

function cellTextareaStyle() {
  return {
    ...cellInputStyle(),
    minHeight: 46,
    resize: "vertical",
    lineHeight: 1.4,
  };
}

function ActionButton({ children, onClick, color = C.blue, disabled = false, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 44,
        border: `1px solid ${disabled ? C.border : `${color}55`}`,
        background: primary ? color : `${color}12`,
        color: primary ? "var(--bg)" : color,
        borderRadius: 14,
        padding: "10px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: 13,
        fontWeight: 900,
        fontFamily: C.sans,
        whiteSpace: "nowrap",
        transition: "transform .18s ease, border-color .18s ease, background .18s ease",
      }}
    >
      {children}
    </button>
  );
}

function FieldCell({ field, value, obs, onValue, onObs }) {
  const isToggle = field.type === "toggle" || BOOL_KEYS.has(field.key);
  if (isToggle) {
    const active = !!value;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(180px, 1fr)", gap: 10, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
                  borderRadius: 12,
                  minHeight: 42,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 900,
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
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, .75fr)", gap: 10 }}>
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

export default function MemoriasScreen({ profile, signOut }) {
  const { isMobile } = useResponsive(980);
  const toast = useToast();
  const [obras, setObras] = useState([]);
  const [dbMemorias, setDbMemorias] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [fields, setFields] = useState({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [railOpen, setRailOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 980 : true));
  const [view, setView] = useState("studio");
  const [activeArea, setActiveArea] = useState("interior");

  const selected = useMemo(
    () => obras.find((obra) => obra.id === selectedId) || obras[0] || null,
    [obras, selectedId],
  );
  const lineaTipo = selected ? getLineaTipo(selected) : "default";
  const descriptors = MEMORIA_FIELDS_BY_TIPO[lineaTipo] || MEMORIA_FIELDS_BY_TIPO.default;
  const descriptorMap = useMemo(() => new Map(descriptors.map((field) => [field.key, field])), [descriptors]);
  const grouped = useMemo(() => groupBySection(descriptors), [descriptors]);
  const completion = useMemo(() => completionFor(fields, descriptors), [fields, descriptors]);
  const visibleAreas = useMemo(
    () => CLIENT_AREAS.map((area) => ({
      ...area,
      fields: area.fields.map((key) => descriptorMap.get(key)).filter(Boolean),
    })).filter((area) => area.fields.length),
    [descriptorMap],
  );
  const selectedArea = visibleAreas.find((area) => area.id === activeArea) || visibleAreas[0] || CLIENT_AREAS[0];
  const filteredObras = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter((obra) => {
      const merged = mergeMemory({ obra, dbMemorias });
      return [
        obra.codigo,
        obra.descripcion,
        obra.linea_nombre,
        merged.propietario,
        merged.nombre_barco,
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [obras, query, dbMemorias]);

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
    setRailOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (!selected) return;
    setFields(mergeMemory({ obra: selected, dbMemorias }));
    setDirty(false);
  }, [selected?.id, dbMemorias]);

  useEffect(() => {
    if (!visibleAreas.some((area) => area.id === activeArea)) {
      setActiveArea(visibleAreas[0]?.id || "interior");
    }
  }, [activeArea, visibleAreas]);

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
      fields.nombre_barco ? `Nombre: ${fields.nombre_barco}` : null,
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
        .mem-touch-button:active, .mem-material-card:active, .mem-area-card:active { transform: scale(.985); }
        .mem-material-card:hover { transform: translateY(-3px); }
        .mem-boat-card:hover { transform: translateX(2px); }
        @keyframes memFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes memGlow { 0%, 100% { opacity: .55; transform: translate3d(0,0,0) scale(1); } 50% { opacity: .95; transform: translate3d(8px,-8px,0) scale(1.03); } }
        @keyframes memSheen { 0% { transform: translateX(-130%); } 100% { transform: translateX(130%); } }
        @media print {
          aside, .mem-no-print { display: none !important; }
          .mem-shell { display: block !important; }
          .mem-main { overflow: visible !important; }
          .mem-content { overflow: visible !important; padding: 0 !important; }
          .mem-sheet { display: block !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="mem-shell" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0, 1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />

        <main className="mem-main" style={{ minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden", position: "relative" }}>
          <PremiumHeader
            selected={selected}
            completion={completion}
            savedExists={savedExists}
            seedExists={seedExists}
            dirty={dirty}
            saving={saving}
            view={view}
            onView={setView}
            onToggleRail={() => setRailOpen((open) => !open)}
            onLoad={load}
            onCopy={copySummary}
            onPrint={() => window.print()}
            onSave={save}
          />

          <div style={{
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: railOpen && !isMobile ? "330px minmax(0, 1fr)" : "0 minmax(0, 1fr)",
            transition: "grid-template-columns .28s ease",
            overflow: "hidden",
            position: "relative",
          }}>
            <BoatRail
              open={railOpen}
              loading={loading}
              query={query}
              setQuery={setQuery}
              obras={filteredObras}
              selected={selected}
              dbMemorias={dbMemorias}
              onSelect={(obra) => {
                setSelectedId(obra.id);
                if (isMobile) setRailOpen(false);
              }}
            />

            {isMobile && railOpen && (
              <div className="mem-no-print" style={{ position: "absolute", inset: 0, zIndex: 50, display: "grid", gridTemplateColumns: "minmax(280px, 86vw) 1fr" }}>
                <BoatRail
                  open
                  floating
                  loading={loading}
                  query={query}
                  setQuery={setQuery}
                  obras={filteredObras}
                  selected={selected}
                  dbMemorias={dbMemorias}
                  onClose={() => setRailOpen(false)}
                  onSelect={(obra) => {
                    setSelectedId(obra.id);
                    setRailOpen(false);
                  }}
                />
                <button type="button" onClick={() => setRailOpen(false)} style={{ border: 0, background: "rgba(0,0,0,.45)" }} aria-label="Cerrar lista" />
              </div>
            )}

            <section className="mem-content" style={{ minHeight: 0, overflow: "auto", padding: isMobile ? 12 : 18 }}>
              {!selected ? (
                <EmptyState />
              ) : view === "studio" ? (
                <StudioView
                  selected={selected}
                  fields={fields}
                  descriptors={descriptors}
                  areas={visibleAreas}
                  selectedArea={selectedArea}
                  activeArea={activeArea}
                  onArea={setActiveArea}
                  onPatch={patchField}
                  isMobile={isMobile}
                />
              ) : (
                <SheetView
                  selected={selected}
                  fields={fields}
                  grouped={grouped}
                  onPatch={patchField}
                  isMobile={isMobile}
                />
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function PremiumHeader({
  selected,
  completion,
  savedExists,
  seedExists,
  dirty,
  saving,
  view,
  onView,
  onToggleRail,
  onLoad,
  onCopy,
  onPrint,
  onSave,
}) {
  return (
    <header className="mem-no-print" style={{
      position: "relative",
      overflow: "hidden",
      borderBottom: `1px solid ${C.border}`,
      background: `linear-gradient(135deg, ${C.topbar}, ${C.panelSolid2})`,
      padding: "14px 18px",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: 14,
      alignItems: "center",
    }}>
      <div style={{
        position: "absolute",
        width: 360,
        height: 120,
        right: 150,
        top: -60,
        borderRadius: 999,
        background: `radial-gradient(circle, ${C.blue}30, transparent 62%)`,
        filter: "blur(20px)",
        animation: "memGlow 6s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, position: "relative" }}>
        <button
          type="button"
          onClick={onToggleRail}
          className="mem-touch-button"
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.text,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          title="Barcos activos"
        >
          <Menu size={19} />
        </button>

        <div style={{
          width: 54,
          height: 54,
          borderRadius: 18,
          border: `1px solid ${C.border2}`,
          background: C.panelSolid,
          display: "grid",
          placeItems: "center",
          boxShadow: "0 16px 40px var(--shadow)",
          flexShrink: 0,
        }}>
          <img src={logoKlasea} alt="Klase A" style={{ maxWidth: 42, maxHeight: 38, objectFit: "contain" }} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ color: C.dim, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 900 }}>
              Klase A Configuration Studio
            </span>
            {selected && (
              <span style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 900 }}>
                {lineName(selected)}
              </span>
            )}
            {savedExists && <StatusPill color={C.green} label="En sistema" icon={<CheckCircle2 size={13} />} />}
            {!savedExists && seedExists && <StatusPill color={C.amber} label="Base Excel" />}
            {dirty && <StatusPill color={C.blue} label="Cambios sin guardar" />}
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, lineHeight: 1.1, fontWeight: 950, letterSpacing: 0, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? `${selected.codigo}${selected.descripcion ? ` · ${selected.descripcion}` : ""}` : "Memorias descriptivas"}
          </h1>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, flexWrap: "wrap", position: "relative" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          border: `1px solid ${C.border}`,
          background: C.panel,
          borderRadius: 15,
          padding: 4,
        }}>
          {[
            { id: "studio", label: "Vista cliente", icon: <Sparkles size={14} /> },
            { id: "sheet", label: "Planilla", icon: <FileSpreadsheet size={14} /> },
          ].map((opt) => {
            const active = view === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onView(opt.id)}
                className="mem-touch-button"
                style={{
                  minHeight: 38,
                  border: `1px solid ${active ? C.border2 : "transparent"}`,
                  background: active ? C.panelSolid2 : "transparent",
                  color: active ? C.text : C.dim,
                  borderRadius: 12,
                  padding: "8px 11px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                  fontFamily: C.sans,
                  whiteSpace: "nowrap",
                }}
              >
                {opt.icon} {opt.label}
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: 68, textAlign: "right", marginLeft: 2 }}>
          <div style={{ color: completion.pct >= 80 ? C.green : completion.pct >= 45 ? C.amber : C.blue, fontSize: 21, fontWeight: 950, fontFamily: C.mono }}>
            {completion.pct}%
          </div>
          <div style={{ color: C.dim, fontSize: 10, fontWeight: 850 }}>{completion.pending} pendientes</div>
        </div>

        <ActionButton onClick={onLoad} color={C.muted}><RefreshCw size={14} /></ActionButton>
        <ActionButton onClick={onCopy} color={C.teal} disabled={!selected}><ClipboardCopy size={14} /> Copiar</ActionButton>
        <ActionButton onClick={onPrint} color={C.amber} disabled={!selected}><Printer size={14} /> PDF</ActionButton>
        <ActionButton onClick={onSave} color={C.green} disabled={!selected || saving || !dirty} primary={dirty}>
          <Save size={14} /> {saving ? "Guardando..." : dirty ? "Guardar" : "Guardado"}
        </ActionButton>
      </div>
    </header>
  );
}

function BoatRail({ open, floating = false, loading, query, setQuery, obras, selected, dbMemorias, onSelect, onClose }) {
  if (!open) return <aside className="mem-no-print" style={{ overflow: "hidden" }} />;
  return (
    <aside className="mem-no-print" style={{
      minWidth: 0,
      borderRight: `1px solid ${C.border}`,
      background: floating ? C.panelSolid : `linear-gradient(180deg, ${C.panelSolid}, ${C.bg})`,
      padding: 14,
      overflow: "auto",
      boxShadow: floating ? "24px 0 70px rgba(0,0,0,.35)" : "none",
      zIndex: floating ? 60 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.25, textTransform: "uppercase", fontWeight: 900 }}>Barcos activos</div>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 950 }}>{obras.length} memorias</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={{ width: 42, height: 42, borderRadius: 13, border: `1px solid ${C.border}`, background: C.panel, color: C.text, display: "grid", placeItems: "center" }}>
            <X size={17} />
          </button>
        )}
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar barco, propietario..."
          style={{ ...cellInputStyle(), paddingLeft: 38, minHeight: 48 }}
        />
      </div>
      {loading ? (
        <div style={{ color: C.dim, padding: 14, fontSize: 14 }}>Cargando memorias...</div>
      ) : obras.length === 0 ? (
        <div style={{ color: C.dim, padding: 14, fontSize: 14 }}>No hay barcos activos para mostrar.</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {obras.map((obra, index) => {
            const merged = mergeMemory({ obra, dbMemorias });
            const ds = MEMORIA_FIELDS_BY_TIPO[getLineaTipo(obra)] || MEMORIA_FIELDS_BY_TIPO.default;
            const pct = completionFor(merged, ds).pct;
            const active = selected?.id === obra.id;
            return (
              <button
                key={obra.id}
                type="button"
                onClick={() => onSelect(obra)}
                className="mem-boat-card"
                style={{
                  textAlign: "left",
                  border: `1px solid ${active ? C.blue : C.border}`,
                  background: active ? `linear-gradient(135deg, ${C.blueL}, ${C.panelSolid})` : C.panel,
                  borderRadius: 18,
                  padding: 13,
                  color: C.text,
                  cursor: "pointer",
                  fontFamily: C.sans,
                  display: "grid",
                  gap: 9,
                  boxShadow: active ? `inset 4px 0 0 ${C.blue}, 0 16px 36px var(--shadow)` : "none",
                  minHeight: 106,
                  transition: "transform .18s ease, border-color .18s ease, background .18s ease",
                  animation: "memFadeUp .42s ease both",
                  animationDelay: `${Math.min(index * 28, 260)}ms`,
                }}
              >
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <strong style={{ fontSize: 18, lineHeight: 1 }}>{obra.codigo}</strong>
                  <span style={{ color: C.dim, fontSize: 11, fontWeight: 900 }}>{lineName(obra)}</span>
                  <span style={{ marginLeft: "auto", color: pct >= 80 ? C.green : pct >= 45 ? C.amber : C.blue, fontSize: 12, fontFamily: C.mono, fontWeight: 950 }}>{pct}%</span>
                </div>
                <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.25, minHeight: 32, overflow: "hidden" }}>
                  {merged.propietario || merged.nombre_barco || obra.descripcion || "Sin propietario cargado"}
                </div>
                <ProgressLine value={pct} color={pct >= 80 ? C.green : C.blue} />
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function StudioView({ selected, fields, descriptors, areas, selectedArea, activeArea, onArea, onPatch, isMobile }) {
  const summaryFields = descriptors.filter((field) => FEATURE_FIELDS.includes(field.key));
  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1480, margin: "0 auto", animation: "memFadeUp .36s ease both" }}>
      <section style={{
        position: "relative",
        minHeight: isMobile ? 360 : 410,
        border: `1px solid ${C.border}`,
        borderRadius: 28,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${C.panelSolid}, ${C.panelSolid2})`,
        boxShadow: "0 24px 80px var(--shadow)",
      }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 18% 18%, ${C.blue}24, transparent 32%), radial-gradient(circle at 82% 20%, ${C.violet}20, transparent 30%), radial-gradient(circle at 50% 100%, ${C.teal}12, transparent 42%)` }} />
        <div style={{ position: "absolute", inset: 0, opacity: .12, backgroundImage: "linear-gradient(90deg, transparent 0 95%, currentColor 95% 96%, transparent 96%), linear-gradient(0deg, transparent 0 95%, currentColor 95% 96%, transparent 96%)", backgroundSize: "48px 48px", color: C.text }} />
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, .95fr) minmax(380px, 1.05fr)", gap: 16, padding: isMobile ? 18 : 26, height: "100%" }}>
          <div style={{ display: "grid", alignContent: "space-between", gap: 22, minHeight: isMobile ? 300 : 360 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 999, padding: "7px 11px", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 950 }}>
                <Sparkles size={14} color={C.amber} /> Configuracion presencial
              </div>
              <h2 style={{ margin: "18px 0 0", color: C.text, fontSize: isMobile ? 36 : 56, lineHeight: .95, fontWeight: 950, letterSpacing: 0 }}>
                {selected.codigo}
              </h2>
              <div style={{ marginTop: 10, color: C.muted, fontSize: isMobile ? 15 : 17, lineHeight: 1.45, maxWidth: 560 }}>
                {fields.nombre_barco ? `${fields.nombre_barco} · ` : ""}{fields.propietario ? `Cliente: ${fields.propietario}` : "Memoria descriptiva del barco"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <LuxuryFact label="Linea" value={lineName(selected)} />
              <LuxuryFact label="Motor" value={fields.motorizacion || "Pendiente"} />
              <LuxuryFact label="Casco" value={fields.color_casco || "Pendiente"} />
              <LuxuryFact label="Constructor" value={fields.constructor || "Pendiente"} />
            </div>
          </div>

          <BoatPreview fields={fields} />
        </div>
      </section>

      <section style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "260px minmax(0, 1fr)",
        gap: 14,
        alignItems: "start",
      }}>
        <div className="mem-no-print" style={{
          display: "grid",
          gap: 10,
          position: isMobile ? "static" : "sticky",
          top: 14,
        }}>
          {areas.map((area, index) => {
            const active = activeArea === area.id;
            const filled = area.fields.filter((field) => isFilled(fields[field.key])).length;
            const pct = Math.round((filled / Math.max(area.fields.length, 1)) * 100);
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => onArea(area.id)}
                className="mem-area-card"
                style={{
                  minHeight: 88,
                  border: `1px solid ${active ? area.accent : C.border}`,
                  background: active ? `linear-gradient(135deg, ${area.accent}18, ${C.panelSolid})` : C.panel,
                  color: C.text,
                  borderRadius: 19,
                  padding: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: C.sans,
                  transition: "transform .18s ease, border-color .18s ease, background .18s ease",
                  animation: "memFadeUp .42s ease both",
                  animationDelay: `${index * 45}ms`,
                  boxShadow: active ? "0 16px 42px var(--shadow)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 99, background: area.accent, boxShadow: `0 0 18px ${area.accent}` }} />
                  <strong style={{ fontSize: 16 }}>{area.label}</strong>
                  <span style={{ marginLeft: "auto", color: area.accent, fontSize: 12, fontWeight: 950, fontFamily: C.mono }}>{pct}%</span>
                </div>
                <div style={{ color: C.dim, fontSize: 12, marginTop: 7, fontWeight: 750 }}>{area.kicker}</div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ color: selectedArea.accent, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 950 }}>Sector</div>
              <h3 style={{ margin: "3px 0 0", color: C.text, fontSize: 28, lineHeight: 1.1, fontWeight: 950 }}>{selectedArea.label}</h3>
              <div style={{ marginTop: 5, color: C.dim, fontSize: 14 }}>{selectedArea.kicker}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {summaryFields.slice(0, 5).map((field) => {
                const sw = swatchFor(field.key, fields[field.key]);
                return (
                  <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, background: C.panel, borderRadius: 999, padding: "7px 10px" }}>
                    <span style={{ width: 28, height: 18, borderRadius: 99, border: `1px solid ${C.border}`, background: sw.bg, flexShrink: 0 }} />
                    <span style={{ color: C.muted, fontSize: 12, fontWeight: 850, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sw.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {selectedArea.fields.map((field, index) => (
              <ClientFieldConfigurator
                key={field.key}
                field={field}
                value={fields[field.key]}
                obs={fields[`${field.key}_obs`]}
                onValue={(value) => onPatch(field.key, value)}
                onObs={(value) => onPatch(`${field.key}_obs`, value)}
                index={index}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function BoatPreview({ fields }) {
  const casco = swatchFor("color_casco", fields.color_casco);
  const wood = swatchFor("madera_muebles", fields.madera_muebles);
  const floor = swatchFor("piso", fields.piso || fields.teca_tipo);
  const fabric = swatchFor("tapiceria_mamparos", fields.tapiceria_mamparos || fields.color_acolchados);
  const stone = swatchFor("color_mesadas", fields.color_mesadas);

  return (
    <div style={{
      alignSelf: "stretch",
      minHeight: 330,
      border: `1px solid ${C.border}`,
      borderRadius: 26,
      background: `linear-gradient(180deg, ${C.panel}, ${C.panelSolid})`,
      overflow: "hidden",
      position: "relative",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 45%, ${C.blue}1f, transparent 34%)` }} />
      <div style={{
        position: "absolute",
        left: "7%",
        right: "7%",
        top: "25%",
        height: "34%",
        borderRadius: "48% 52% 28% 72% / 70% 72% 28% 30%",
        background: casco.bg,
        boxShadow: "0 36px 70px rgba(0,0,0,.34)",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: "18% 12% 42% 20%", borderRadius: "70% 30% 60% 40%", background: "linear-gradient(135deg, rgba(255,255,255,.72), rgba(255,255,255,.12))", border: "1px solid rgba(255,255,255,.35)" }} />
        <div style={{ position: "absolute", left: "18%", right: "22%", bottom: "18%", height: "14%", borderRadius: 99, background: floor.bg, border: "1px solid rgba(0,0,0,.18)" }} />
        <div style={{ position: "absolute", left: "46%", right: "24%", top: "48%", height: "18%", borderRadius: 99, background: fabric.bg, border: "1px solid rgba(0,0,0,.16)" }} />
      </div>
      <div style={{
        position: "absolute",
        left: "20%",
        right: "18%",
        top: "51%",
        height: 20,
        borderRadius: 999,
        background: wood.bg,
        boxShadow: "0 12px 26px rgba(0,0,0,.28)",
      }} />
      <div style={{
        position: "absolute",
        left: "62%",
        top: "58%",
        width: 72,
        height: 42,
        borderRadius: 14,
        background: stone.bg,
        border: "1px solid rgba(255,255,255,.25)",
        boxShadow: "0 12px 26px rgba(0,0,0,.22)",
      }} />
      <div style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        bottom: 30,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 8,
      }}>
        {[
          ["Madera", wood],
          ["Piso", floor],
          ["Tela", fabric],
          ["Mesada", stone],
        ].map(([label, sw]) => (
          <div key={label} style={{ minWidth: 0, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ height: 38, background: sw.bg }} />
            <div style={{ padding: 8 }}>
              <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
              <div style={{ color: C.text, fontSize: 11, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{sw.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientFieldConfigurator({ field, value, obs, onValue, onObs, index }) {
  const palette = materialPaletteFor(field.key);
  const isToggle = field.type === "toggle" || BOOL_KEYS.has(field.key);
  if (isToggle) {
    return (
      <FeatureSwitch
        field={field}
        value={value}
        obs={obs}
        onValue={onValue}
        onObs={onObs}
        index={index}
      />
    );
  }
  if (!palette) {
    return (
      <DetailEditor
        field={field}
        value={value}
        obs={obs}
        onValue={onValue}
        onObs={onObs}
        index={index}
      />
    );
  }
  const current = String(value || "").trim();
  const hasCurrent = current && !palette.options.some((opt) => opt.label.toLowerCase() === current.toLowerCase());
  const options = hasCurrent
    ? [{ label: current, meta: "Valor actual", bg: swatchFor(field.key, current).bg, current: true }, ...palette.options]
    : palette.options;
  const Icon = palette.icon;

  return (
    <article style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 24,
      overflow: "hidden",
      animation: "memFadeUp .48s ease both",
      animationDelay: `${Math.min(index * 70, 360)}ms`,
      boxShadow: "0 18px 52px var(--shadow)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 16, borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.panelSolid2}, ${C.panel})` }}>
        <div style={{ width: 46, height: 46, borderRadius: 16, border: `1px solid ${C.border}`, background: C.panel, color: C.blue, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.25, textTransform: "uppercase", fontWeight: 950 }}>{palette.title}</div>
          <h4 style={{ margin: "3px 0 0", color: C.text, fontSize: 20, lineHeight: 1.1, fontWeight: 950 }}>{field.label}</h4>
        </div>
        {current && <StatusPill color={C.green} label="Seleccionado" />}
      </div>

      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {options.map((opt, optIndex) => {
            const active = current && opt.label.toLowerCase() === current.toLowerCase();
            return (
              <button
                type="button"
                key={`${field.key}-${opt.label}`}
                onClick={() => onValue(opt.label)}
                className="mem-material-card"
                style={{
                  position: "relative",
                  minHeight: 158,
                  border: `1px solid ${active ? C.blue : C.border}`,
                  background: C.panel,
                  color: C.text,
                  borderRadius: 20,
                  padding: 0,
                  overflow: "hidden",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: C.sans,
                  transition: "transform .18s ease, border-color .18s ease, box-shadow .18s ease",
                  boxShadow: active ? `0 18px 46px ${C.blue}25, inset 0 0 0 2px ${C.blue}` : "none",
                  animation: "memFadeUp .42s ease both",
                  animationDelay: `${Math.min(optIndex * 45, 300)}ms`,
                }}
              >
                <div style={{ position: "relative", height: 92, background: opt.bg, overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg, transparent 0 32%, rgba(255,255,255,.28) 46%, transparent 60%)", animation: active ? "memSheen 2.8s ease-in-out infinite" : "none" }} />
                </div>
                <div style={{ padding: 13 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{opt.label}</strong>
                    {active && <CheckCircle2 size={16} color={C.blue} style={{ marginLeft: "auto", flexShrink: 0 }} />}
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.25, marginTop: 5 }}>{opt.meta}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, .55fr)", gap: 10 }}>
          <input
            value={value || ""}
            onChange={(e) => onValue(e.target.value)}
            placeholder="Escribir material personalizado..."
            style={cellInputStyle()}
          />
          <input
            value={obs || ""}
            onChange={(e) => onObs(e.target.value)}
            placeholder="Observacion"
            style={cellInputStyle({ color: C.muted })}
          />
        </div>
      </div>
    </article>
  );
}

function FeatureSwitch({ field, value, obs, onValue, onObs, index }) {
  const active = !!value;
  return (
    <article style={{
      border: `1px solid ${active ? `${field.color || C.green}77` : C.border}`,
      background: active ? `${field.color || C.green}12` : C.panelSolid,
      borderRadius: 22,
      padding: 15,
      display: "grid",
      gridTemplateColumns: "minmax(160px, .55fr) minmax(260px, 1fr)",
      gap: 12,
      alignItems: "center",
      animation: "memFadeUp .48s ease both",
      animationDelay: `${Math.min(index * 70, 360)}ms`,
    }}>
      <div>
        <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 950 }}>Equipamiento</div>
        <div style={{ color: C.text, fontSize: 17, fontWeight: 950, marginTop: 4 }}>{field.label}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "160px minmax(160px, 1fr)", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
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
                className="mem-touch-button"
                style={{
                  minHeight: 48,
                  border: `1px solid ${selected ? `${opt.color}66` : C.border}`,
                  background: selected ? `${opt.color}16` : C.panel,
                  color: selected ? opt.color : C.dim,
                  borderRadius: 14,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 950,
                  fontFamily: C.sans,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <input value={obs || ""} onChange={(e) => onObs(e.target.value)} placeholder="Detalle u observacion" style={cellInputStyle()} />
      </div>
    </article>
  );
}

function DetailEditor({ field, value, obs, onValue, onObs, index }) {
  return (
    <article style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 22,
      padding: 16,
      display: "grid",
      gap: 12,
      animation: "memFadeUp .48s ease both",
      animationDelay: `${Math.min(index * 70, 360)}ms`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, border: `1px solid ${C.border}`, background: C.panel, color: C.violet, display: "grid", placeItems: "center" }}>
          {field.icon || <FileText size={18} />}
        </div>
        <div>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 950 }}>{field.section || "Detalle"}</div>
          <div style={{ color: C.text, fontSize: 18, fontWeight: 950 }}>{field.label}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, .55fr)", gap: 10 }}>
        <textarea value={value || ""} onChange={(e) => onValue(e.target.value)} placeholder="Escribir definicion..." rows={2} style={cellTextareaStyle()} />
        <textarea value={obs || ""} onChange={(e) => onObs(e.target.value)} placeholder="Observacion" rows={2} style={cellTextareaStyle()} />
      </div>
    </article>
  );
}

function SheetView({ selected, fields, grouped, onPatch, isMobile }) {
  return (
    <div className="mem-sheet" style={{ display: "grid", gap: 14, maxWidth: 1320, margin: "0 auto", animation: "memFadeUp .32s ease both" }}>
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        background: C.panelSolid,
        overflow: "hidden",
      }}>
        <div style={{ padding: 18, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", fontWeight: 900 }}>Planilla tecnica</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 30, lineHeight: 1, fontWeight: 950, letterSpacing: 0 }}>{selected.codigo}</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(130px, 1fr))", gap: 8, flex: "1 1 560px" }}>
            <InfoBox label="Propietario" value={fields.propietario || "Pendiente"} />
            <InfoBox label="Constructor" value={fields.constructor || "Pendiente"} />
            <InfoBox label="Motorizacion" value={fields.motorizacion || "Pendiente"} />
            <InfoBox label="Casco" value={fields.color_casco || "Pendiente"} />
          </div>
        </div>
      </div>

      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        background: C.panelSolid,
        overflow: "hidden",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(150px, .8fr) minmax(260px, 1fr)" : "250px minmax(460px, 1fr)",
          background: C.panel2,
          borderBottom: `1px solid ${C.border}`,
          color: C.dim,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 950,
        }}>
          <div style={{ padding: "12px 14px" }}>Rubro</div>
          <div style={{ padding: "12px 14px", borderLeft: `1px solid ${C.border}` }}>Definicion / observacion</div>
        </div>

        {Object.entries(grouped).map(([section, rows]) => (
          <div key={section}>
            <div style={{
              padding: "9px 14px",
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
                  gridTemplateColumns: isMobile ? "minmax(150px, .8fr) minmax(260px, 1fr)" : "250px minmax(460px, 1fr)",
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: "stretch",
                }}
              >
                <div style={{
                  padding: "12px 14px",
                  display: "flex",
                  gap: 9,
                  alignItems: "center",
                  color: C.text,
                  fontSize: 14,
                  fontWeight: 900,
                  background: C.panel,
                }}>
                  <span style={{ color: isFilled(fields[field.key]) ? C.green : C.dim, display: "grid", placeItems: "center" }}>
                    {field.icon || <PencilLine size={13} />}
                  </span>
                  <span>{field.label}</span>
                </div>
                <div style={{ padding: 9, borderLeft: `1px solid ${C.border}`, minWidth: 0 }}>
                  <FieldCell
                    field={field}
                    value={fields[field.key]}
                    obs={fields[`${field.key}_obs`]}
                    onValue={(value) => onPatch(field.key, value)}
                    onObs={(value) => onPatch(`${field.key}_obs`, value)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      background: C.panel,
      padding: 12,
      minWidth: 0,
    }}>
      <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 900 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 900, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function LuxuryFact({ label, value }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panel,
      backdropFilter: "blur(18px)",
      borderRadius: 18,
      padding: 13,
      minWidth: 0,
    }}>
      <div style={{ color: C.dim, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 950 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function StatusPill({ color, label, icon }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      color,
      border: `1px solid ${color}44`,
      background: `${color}12`,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 11,
      fontWeight: 950,
      whiteSpace: "nowrap",
    }}>
      {icon} {label}
    </span>
  );
}

function ProgressLine({ value, color }) {
  return (
    <div style={{ height: 5, borderRadius: 99, background: C.panel2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, value))}%`, background: color, transition: "width .28s ease" }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ border: `1px dashed ${C.border}`, borderRadius: 24, minHeight: 420, display: "grid", placeItems: "center", color: C.dim, background: C.panel }}>
      <div style={{ textAlign: "center" }}>
        <Ship size={38} color={C.dim} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 900 }}>Selecciona un barco activo.</div>
      </div>
    </div>
  );
}
