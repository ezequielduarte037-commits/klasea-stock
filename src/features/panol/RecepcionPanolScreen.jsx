import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  PackageCheck,
  PackageOpen,
  PackagePlus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  ScanLine,
  Search,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import PageHeader from "@/components/ui/PageHeader";
import Cargando from "@/components/ui/Cargando";
import { EmptyState } from "@/components/ui/motion";
import {
  fetchEnvios, ENVIO_ESTADO_META, ITEM_ESTADO_META, resumenItems, SEDES_PANOL,
} from "@/features/panol/panolApi";
import PanolEnvioDetail from "@/features/panol/PanolEnvioDetail";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import CrearProductoTab from "@/features/panol/CrearProductoTab";
import ConsumiblesPanolTab from "@/features/panol/ConsumiblesPanolTab";
import ScannerRemitosTab from "@/features/panol/ScannerRemitosTab";
import RemitosArchivoTab from "@/features/panol/RemitosArchivoTab";
import SolicitudPanolPrintable from "@/features/panol/SolicitudPanolPrintable";
import { linkScannedReceiptToIngreso, scannerReceiptPrefill } from "@/features/panol/remitosScannerApi";
import { leerIngresosPendientes, borrarIngresoPendiente, leerPapeleraIngresos, restaurarIngresoPendiente, vaciarPapeleraIngresos } from "@/features/panol/ingresosPendientes";
import { hasAdminAccess } from "@/lib/permissions";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const STATE_FILTERS = [
  ["activos", "Por recibir"],
  ["enviado", "Enviados"],
  ["parcial", "Parciales"],
  ["recibido", "Recibidos"],
  ["todos", "Todos"],
];

const PRIO_FILTERS = [
  ["todas", "Todas"],
  ["urgente", "Urgente"],
  ["alta", "Alta"],
  ["media", "Media"],
  ["baja", "Baja"],
];
const PANOL_TAB_STORAGE_KEY = "klasea.panol.recepcion.tab";
const PANOL_TABS = new Set(["recepcion", "scanner", "remitos", "ingresar", "consumibles", "crear"]);

const TABS_PRINCIPALES = [
  { key: "recepcion", label: "Recepción" },
  { key: "scanner", label: "Remitos", Icon: ScanLine },
];
const TABS_MAS = [
  { key: "remitos", label: "Archivo", hint: "Papeles guardados por barco, proveedor o carpeta", Icon: FileText },
  { key: "ingresar", label: "Ingreso directo", hint: "Cargar materiales sin un pedido previo", Icon: PackageOpen },
  { key: "consumibles", label: "Consumibles", hint: "Tornillos, lijas y el resto del fondo", Icon: Scale },
  { key: "crear", label: "Crear producto", hint: "Alta rápida al catálogo, no a la matriz", Icon: PackagePlus },
];
const TAB_LABELS = Object.fromEntries([...TABS_PRINCIPALES, ...TABS_MAS].map((t) => [t.key, t.label]));

const ENVIO_TONO = {
  borrador: { color: C.dim, bg: C.panel2, border: C.border },
  enviado: { color: C.cyan, bg: C.cyanL, border: C.cyanB },
  en_preparacion: { color: C.blue, bg: C.blueL, border: C.blueB },
  parcial: { color: C.violet, bg: C.violetL, border: C.violetB },
  recibido: { color: C.green, bg: C.greenL, border: C.greenB },
  cerrado: { color: C.dim, bg: C.panel2, border: C.border },
  cancelado: { color: C.red, bg: C.redL, border: C.redB },
};
const ITEM_TONO = {
  pendiente: C.dim,
  recibido: C.green,
  parcial: C.violet,
  sin_info: C.blue,
  falta_stock: C.cyan,
  rechazado: C.red,
};

const CSS_RECEPCION = `
  .rp-tabs { display: flex; align-items: center; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .rp-tabs::-webkit-scrollbar { display: none; }
  .rp-tab {
    min-height: 34px; display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
    padding: 0 12px; border: 1px solid transparent; border-radius: 9px;
    background: transparent; color: var(--dim);
    font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap;
    transition: color .15s, background-color .15s, border-color .15s;
  }
  .rp-tab:hover { color: var(--text); background: var(--panel); }
  .rp-tab.is-activa { color: var(--blue); background: var(--blue-soft); border-color: var(--blue-border); font-weight: 600; }
  .rp-tab-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; color: var(--cyan); }
  .rp-menu {
    position: fixed; z-index: 61; overflow-y: auto; padding: 6px;
    border: 1px solid var(--border-2); border-radius: 14px;
    background: var(--panel-solid); box-shadow: var(--elev-2);
    animation: rp-menu-in .16s cubic-bezier(.22,1,.36,1);
  }
  .rp-menu-item {
    width: 100%; display: flex; align-items: center; gap: 11px; padding: 8px 10px;
    border: 0; border-radius: 10px; background: transparent; color: var(--text);
    font: inherit; text-align: left; transition: background-color .12s;
  }
  .rp-menu-item:hover { background: var(--panel-2); }
  .rp-menu-item svg { flex-shrink: 0; color: var(--dim); }
  .rp-menu-item.is-activa { background: var(--blue-soft); color: var(--blue); }
  .rp-menu-item.is-activa svg { color: var(--blue); }
  .rp-menu-titulo { display: block; font-size: 13px; font-weight: 600; }
  .rp-menu-ayuda { display: block; margin-top: 1px; color: var(--dim); font-size: 11.5px; line-height: 1.35; }
  .rp-filtros { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .rp-chip-cuenta { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--dim); }
  @keyframes rp-menu-in { from { opacity: 0; transform: translateY(-4px); } }
  @media (max-width: 899px) {
    .rp-tab { min-height: 38px; }
    .rp-menu-item { padding: 11px 10px; }
    .rp-filtros {
      flex-wrap: nowrap; overflow-x: auto;
      margin: 0 -12px; padding: 0 12px;
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 28px), transparent 100%);
      mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 28px), transparent 100%);
    }
    .rp-filtros::-webkit-scrollbar { display: none; }
  }
`;

function RecepcionTabs({ tab, onTab, ingresarCount = 0 }) {
  const [menu, setMenu] = useState(null);
  const botonMas = useRef(null);
  const enMenu = TABS_MAS.some((t) => t.key === tab);

  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = () => setMenu(null);
    const alTeclear = (event) => { if (event.key === "Escape") cerrar(); };
    window.addEventListener("keydown", alTeclear);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("resize", cerrar);
    };
  }, [menu]);

  const alternarMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = botonMas.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(300, window.innerWidth - 16);
    setMenu({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
      ancho,
      alto: Math.min(window.innerHeight * 0.7, Math.max(220, window.innerHeight - r.bottom - 18)),
    });
  };

  return (
    <div className="rp-tabs">
      <style href="klasea-rp-tabs" precedence="default">{CSS_RECEPCION}</style>
      {TABS_PRINCIPALES.map((t) => {
        const activo = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className={`rp-tab${activo ? " is-activa" : ""}`}
            aria-current={activo ? "page" : undefined}
            onClick={() => onTab(t.key)}
          >
            {t.Icon ? <t.Icon size={14} /> : null} {t.label}
          </button>
        );
      })}
      <button
        ref={botonMas}
        type="button"
        className={`rp-tab${enMenu ? " is-activa" : ""}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        onClick={alternarMenu}
      >
        {enMenu ? TAB_LABELS[tab] : "Más"}
        {tab === "ingresar" && ingresarCount > 0 && <span className="rp-tab-cuenta">{ingresarCount}</span>}
        <ChevronDown size={13} style={{ transform: menu ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 60 }} />
          <div className="rp-menu" role="menu" style={{ top: menu.top, left: menu.left, width: menu.ancho, maxHeight: menu.alto }}>
            {TABS_MAS.map((t) => {
              const activo = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="menuitem"
                  className={`rp-menu-item${activo ? " is-activa" : ""}`}
                  onClick={() => { onTab(t.key); setMenu(null); }}
                >
                  <t.Icon size={15} />
                  <span style={{ minWidth: 0 }}>
                    <span className="rp-menu-titulo">
                      {t.label}
                      {t.key === "ingresar" && ingresarCount > 0 ? ` (${ingresarCount})` : ""}
                    </span>
                    <span className="rp-menu-ayuda">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function readStoredPanolTab(urlTab = "") {
  const requested = urlTab === "pendientes" ? "ingresar" : urlTab;
  if (PANOL_TABS.has(requested)) return requested;
  if (typeof window === "undefined") return "recepcion";
  let value = window.localStorage.getItem(PANOL_TAB_STORAGE_KEY);
  if (value === "pendientes") value = "ingresar"; // migración del nombre viejo de la pestaña
  return PANOL_TABS.has(value) ? value : "recepcion";
}

const PRIO_META = {
  baja: { label: "Baja", color: C.dim },
  media: { label: "Media", color: C.blue },
  alta: { label: "Alta", color: C.violet },
  urgente: { label: "Urgente", color: C.red },
};

const SEGMENTS = [
  ["recibido", "recibidos"],
  ["parcial", "parciales"],
  ["falta_stock", "faltantes"],
  ["sin_info", "sin info"],
  ["rechazado", "rechazados"],
  ["pendiente", "pendientes"],
];

const CLOSED_ENVIO_STATES = new Set(["recibido", "cerrado", "cancelado"]);
const PRIORITY_WEIGHT = { urgente: 4, alta: 3, media: 2, baja: 1 };

function fmtFecha(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function rowSearchText(envio) {
  return [
    envio.titulo,
    envio.obra?.codigo,
    envio.destino,
    envio.sede,
    envio.prioridad,
    envio.estado,
    envio.observaciones,
  ].filter(Boolean).join(" ").toLowerCase();
}

function actionResumen(envio) {
  const resumen = resumenItems(envio.items || []);
  const parciales = resumen.by?.parcial || 0;
  const accion = (resumen.pendientes || 0) + parciales + (resumen.problemas || 0);
  const completoPorItems = resumen.total > 0 && accion === 0 && resumen.recibidos === resumen.total;
  return { ...resumen, parciales, accion, completoPorItems };
}

function needsReception(envio) {
  if (CLOSED_ENVIO_STATES.has(envio.estado)) return false;
  const r = actionResumen(envio);
  if (r.completoPorItems) return false;
  return r.total === 0 || r.accion > 0;
}

function compareReceptionPriority(a, b) {
  const ra = actionResumen(a);
  const rb = actionResumen(b);
  const problemDiff = (rb.problemas || 0) - (ra.problemas || 0);
  if (problemDiff) return problemDiff;
  const pendingDiff = (rb.accion || 0) - (ra.accion || 0);
  if (pendingDiff) return pendingDiff;
  const prioDiff = (PRIORITY_WEIGHT[b.prioridad] || 0) - (PRIORITY_WEIGHT[a.prioridad] || 0);
  if (prioDiff) return prioDiff;
  return new Date(a.created_at || 0) - new Date(b.created_at || 0);
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 128 }}>
      <span style={{ color: C.dim, fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ui-input"
        style={{ minHeight: 36, padding: "0 10px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "auto" }}
      >
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function FilterChip({ active, onClick, children, tone }) {
  return (
    <button
      type="button"
      className="ui-chip"
      onClick={onClick}
      style={{
        minHeight: 34,
        cursor: "pointer",
        borderColor: active ? (tone?.border || C.blueB) : C.border,
        background: active ? (tone?.bg || C.blueL) : "transparent",
        color: active ? (tone?.color || C.blue) : C.muted,
      }}
    >
      {children}
    </button>
  );
}

function ProgressSegments({ resumen, height = 7 }) {
  if (!resumen?.total) {
    return <div style={{ height, borderRadius: 99, background: C.panel2 }} />;
  }
  return (
    <div style={{
      height,
      borderRadius: 99,
      background: C.panel2,
      overflow: "hidden",
      display: "flex",
      border: `1px solid ${C.border}`,
    }}>
      {SEGMENTS.map(([estado]) => {
        const n = resumen.by?.[estado] || 0;
        if (!n) return null;
        const meta = ITEM_ESTADO_META[estado] || ITEM_ESTADO_META.pendiente;
        return (
          <div
            key={estado}
            title={`${meta.label}: ${n}`}
            style={{ width: `${(n / resumen.total) * 100}%`, background: ITEM_TONO[estado] || meta.color, minWidth: n ? 3 : 0 }}
          />
        );
      })}
    </div>
  );
}

function StatusPill({ estado }) {
  const meta = ENVIO_ESTADO_META[estado] ?? { label: estado, color: C.dim };
  const tono = ENVIO_TONO[estado] || { color: meta.color || C.dim, bg: C.panel2, border: C.border };
  return (
    <span className="ui-chip" style={{
      color: tono.color,
      background: tono.bg,
      borderColor: tono.border,
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: tono.color }} />
      {meta.label}
    </span>
  );
}

function PriorityPill({ prioridad }) {
  const meta = PRIO_META[prioridad] ?? PRIO_META.media;
  return (
    <span style={{
      color: meta.color,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function DesktopRow({ envio, onOpen }) {
  const resumen = actionResumen(envio);
  const problemas = resumen.problemas || 0;
  const pendientes = resumen.pendientes || 0;
  const parciales = resumen.parciales || 0;
  const origen = envio.origen === "compra" ? "Compras" : "Manual";
  const pendienteTexto = [
    pendientes > 0 ? `${pendientes} pend.` : null,
    parciales > 0 ? `${parciales} parcial${parciales === 1 ? "" : "es"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(envio.id)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) 116px 116px minmax(190px, 240px) 120px 98px 34px",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: `1px solid ${problemas ? C.redB : C.border}`,
        background: problemas ? "var(--red-soft)" : C.panelSolid,
        borderRadius: 12,
        color: C.text,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: C.sans,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{
            width: 7,
            height: 28,
            borderRadius: 99,
            background: ENVIO_TONO[envio.estado]?.color || C.dim,
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.titulo}
            </div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : envio.destino || "Sin obra/destino"} · pedido {origen}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ color: C.dim, fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>Sede</span>
        <span style={{ color: C.text, fontSize: 12, fontWeight: 650 }}>{envio.sede}</span>
      </div>

      <StatusPill estado={envio.estado} />

      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <ProgressSegments resumen={resumen} />
        <div style={{ display: "flex", gap: 8, color: C.dim, fontSize: 11, minWidth: 0 }}>
          <span style={{ color: C.green, fontWeight: 650 }}>{resumen.recibidos}/{resumen.total}</span>
          <span>recibidos</span>
          {pendienteTexto && <span>{pendienteTexto}</span>}
          {problemas > 0 && <span style={{ color: C.red, fontWeight: 700 }}>{problemas} problema{problemas === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <PriorityPill prioridad={envio.prioridad} />

      <div style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{fmtFecha(envio.created_at)}</div>

      <ChevronRight size={18} style={{ color: C.dim, justifySelf: "end" }} />
    </button>
  );
}

function MobileCard({ envio, onOpen }) {
  const resumen = actionResumen(envio);
  const problemas = resumen.problemas || 0;
  const accion = resumen.accion || 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(envio.id)}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        background: problemas ? "var(--red-soft)" : C.panelSolid,
        border: `1px solid ${problemas ? C.redB : C.border}`,
        borderLeft: `4px solid ${ENVIO_TONO[envio.estado]?.color || C.dim}`,
        borderRadius: 12,
        padding: 13,
        display: "grid",
        gap: 10,
        fontFamily: C.sans,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{envio.titulo}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}{envio.sede} · {fmtFecha(envio.created_at)}
          </div>
        </div>
        <StatusPill estado={envio.estado} />
      </div>
      <ProgressSegments resumen={resumen} />
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 12 }}>
        <span><strong style={{ color: C.green }}>{resumen.recibidos}/{resumen.total}</strong> recibidos</span>
        {problemas > 0
          ? <span style={{ color: C.red, fontWeight: 700 }}>{problemas} problemas</span>
          : accion > 0 ? <span style={{ color: C.violet, fontWeight: 700 }}>{accion} por revisar</span> : <PriorityPill prioridad={envio.prioridad} />}
      </div>
    </button>
  );
}

export default function RecepcionPanolScreen({ profile }) {
  const nav = useNavigate();
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "";
  const requestedEnvio = searchParams.get("envio") || "";
  const requestedQuery = searchParams.get("q") || "";
  const requestedMaterial = searchParams.get("material") || "";
  const requestedItem = searchParams.get("item") || "";


  const role = profile?.role;
  const isAdmin = hasAdminAccess(profile);
  const isManager = isAdmin || role === "compras";
  const userSede = profile?.sede || null;
  const sedeLocked = role === "panol" && (userSede === "Pampa" || userSede === "Chubut") ? userSede : null;
  const canReceive = isManager || role === "panol";

  const [envios, setEnvios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [ingresoKey, setIngresoKey] = useState(0); // bump → remonta el form inline de ingreso (reset/retomar)
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fEstado, setFEstado] = useState("activos");
  const [fPrio, setFPrio] = useState("todas");
  const [q, setQ] = useState("");
  const [tab, setTabState] = useState(() => readStoredPanolTab(requestedTab));
  const [solicitudOpen, setSolicitudOpen] = useState(false);
  const setTab = useCallback((nextTab) => {
    const requested = nextTab === "pendientes" ? "ingresar" : nextTab;
    const value = PANOL_TABS.has(requested) ? requested : "recepcion";
    setTabState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(PANOL_TAB_STORAGE_KEY, value);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", value);
    nextParams.delete("envio");
    nextParams.delete("material");
    nextParams.delete("item");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const [modalPrefill, setModalPrefill] = useState(null);
  const [pendientes, setPendientes] = useState(() => leerIngresosPendientes());
  const [papelera, setPapelera] = useState(() => leerPapeleraIngresos());
  // Cerrada por defecto: son borradores descartados, no trabajo pendiente.
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const refreshPendientes = useCallback(() => {
    setPendientes(leerIngresosPendientes());
    setPapelera(leerPapeleraIngresos());
  }, []);
  // Identidad estable: si fuera un objeto inline, cualquier re-render del padre
  // (p. ej. un toast) reiniciaría el form del modal y borraría los ítems cargados.
  const modalPrefillEstable = useMemo(
    () => modalPrefill || { origen: "remito", modo: "remito", sede: sedeLocked || "Pampa" },
    [modalPrefill, sedeLocked],
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const sede = sedeLocked || (fSede !== "todas" ? fSede : null);
      setEnvios(await fetchEnvios({ sede }));
    } catch (e) {
      toast.error(e.message || "No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [sedeLocked, fSede, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (requestedTab === "egresos") nav("/egresos-panol", { replace: true });
  }, [nav, requestedTab]);

  useEffect(() => {
    const value = readStoredPanolTab(requestedTab);
    if (value !== tab) {
      setTabState(value);
      if (typeof window !== "undefined") window.localStorage.setItem(PANOL_TAB_STORAGE_KEY, value);
    }
  }, [requestedTab, tab]);

  useEffect(() => {
    if (requestedTab === "recepcion" && requestedEnvio) setSel(requestedEnvio);
  }, [requestedEnvio, requestedTab]);

  const filtrados = useMemo(() => {
    let rows = envios;
    if (fEstado === "activos") rows = rows.filter(needsReception);
    else if (fEstado !== "todos") rows = rows.filter((e) => e.estado === fEstado);
    if (fPrio !== "todas") rows = rows.filter((e) => e.prioridad === fPrio);
    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((e) => rowSearchText(e).includes(term));
    return [...rows].sort(compareReceptionPriority);
  }, [envios, fEstado, fPrio, q]);

  const kpis = useMemo(() => {
    let pendientes = 0;
    let parciales = 0;
    let problemas = 0;
    let recibidos = 0;
    let accionItems = 0;
    for (const e of envios) {
      const r = actionResumen(e);
      pendientes += r.pendientes;
      parciales += r.parciales;
      problemas += r.problemas;
      accionItems += r.accion;
      if (e.estado === "recibido" || r.completoPorItems) recibidos += 1;
    }
    const activos = envios.filter(needsReception).length;
    const enviados = envios.filter((e) => e.estado === "enviado").length;
    const parcialesEnvio = envios.filter((e) => e.estado === "parcial").length;
    return { total: envios.length, activos, pendientes, problemas, recibidos, parciales, accionItems, enviados, parcialesEnvio };
  }, [envios]);

  // El aviso flotante de pendientes ahora vive en NotificacionesBell global.

  const shell = (children) => (
    <div style={{ background: C.bg, position: "absolute", inset: 0, overflow: "hidden", color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );

  if (sel) {
    return shell(
      <PanolEnvioDetail
        envioId={sel}
        initialMaterialId={requestedMaterial}
        initialItemId={requestedItem}
        profile={profile}
        canReceive={canReceive}
        isManager={isManager}
        onBack={() => {
          setSel(null);
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("envio");
          nextParams.delete("material");
          nextParams.delete("item");
          setSearchParams(nextParams, { replace: true });
          cargar();
        }}
      />,
    );
  }

  const cuentaEstado = {
    activos: kpis.activos,
    enviado: kpis.enviados,
    parcial: kpis.parcialesEnvio,
    recibido: kpis.recibidos,
    todos: kpis.total,
  };

  return shell(
    <>
      <PageHeader
        icon={Warehouse}
        eyebrow="Pañol"
        title="Recepción de materiales"
        subtitle={sedeLocked ? `Pañol ${sedeLocked}` : "Bandeja operativa · Pampa y Chubut"}
        actions={(
          <>
            <button type="button" className="ui-btn ui-btn-suave" onClick={() => setSolicitudOpen(true)} title="Imprimir solicitud manual para pañol">
              <Printer size={15} />
              Imprimible
            </button>
            {tab === "recepcion" && (
              <button type="button" className="ui-btn ui-btn-icono" onClick={cargar} disabled={loading} title="Actualizar">
                <RefreshCw size={15} />
              </button>
            )}
          </>
        )}
      >
        <RecepcionTabs
          tab={tab}
          ingresarCount={pendientes.length}
          onTab={(next) => {
            if (next === "ingresar") refreshPendientes();
            setTab(next);
          }}
        />
      </PageHeader>

      {tab === "recepcion" ? (
        <>
      <div style={{
        background: C.topbarSoft,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "10px 12px" : "10px 18px",
        display: "grid",
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: isMobile ? "100%" : 260 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pedido, obra, destino, sede…"
              className="ui-input"
              style={{ paddingLeft: 34, paddingRight: 34 }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                title="Limpiar"
                className="ui-btn ui-btn-fantasma ui-btn-icono"
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", minHeight: 32, width: 32 }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <SelectFilter label="Prioridad" value={fPrio} onChange={setFPrio} options={PRIO_FILTERS} />
          {!sedeLocked && (
            <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((s) => [s, s])]} />
          )}
        </div>

        <div className="rp-filtros">
          {STATE_FILTERS.map(([valor, texto]) => {
            const activo = fEstado === valor;
            const tono = valor === "activos" ? { color: C.violet, bg: C.violetL, border: C.violetB }
              : valor === "recibido" ? { color: C.green, bg: C.greenL, border: C.greenB }
              : valor === "parcial" ? { color: C.violet, bg: C.violetL, border: C.violetB }
              : valor === "enviado" ? { color: C.cyan, bg: C.cyanL, border: C.cyanB }
              : null;
            return (
              <FilterChip key={valor} active={activo} onClick={() => setFEstado(valor)} tone={tono}>
                {texto}
                <span className="rp-chip-cuenta">{cuentaEstado[valor] ?? 0}</span>
              </FilterChip>
            );
          })}
          {kpis.problemas > 0 && (
            <span className="ui-chip" style={{ color: C.red, background: C.redL, borderColor: C.redB }}>
              <AlertTriangle size={12} />
              {kpis.problemas} novedad{kpis.problemas === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!isMobile && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) 116px 116px minmax(190px, 240px) 120px 98px 34px",
            gap: 12,
            padding: "11px 32px 9px",
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            color: C.dim,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}>
            <span>Pedido</span>
            <span>Sede</span>
            <span>Estado</span>
            <span>Recepción</span>
            <span>Prioridad</span>
            <span>Fecha</span>
            <span />
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : "12px 18px 18px" }}>
          {loading ? (
            <Cargando llenar texto="Cargando pedidos…" />
          ) : filtrados.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              color={C.green}
              title={fEstado === "activos" ? "Todo al día en recepción" : "No hay pedidos para este filtro"}
              subtitle={fEstado === "activos"
                ? "Los pedidos ya recibidos quedan guardados en el filtro Recibidos."
                : isManager ? "Podés crear un pedido nuevo o cambiar los filtros." : "Cuando compras envíe algo a tu pañol, aparece acá."}
              style={{ margin: "18px auto", maxWidth: 520, background: C.panel }}
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtrados.map((envio) => (
                isMobile
                  ? <MobileCard key={envio.id} envio={envio} onOpen={setSel} />
                  : <DesktopRow key={envio.id} envio={envio} onOpen={setSel} />
              ))}
            </div>
          )}
        </div>
      </div>

        </>
      ) : tab === "remitos" ? (
        /* El `key` con la búsqueda: si el buscador global manda acá estando ya
           en la pantalla, React no remonta y el archivo se quedaba mostrando lo
           anterior. Con esto arranca de cero filtrado por lo que se buscó. */
        <RemitosArchivoTab key={`remitos-${requestedQuery}`} isMobile={isMobile} puedeReasignar={isAdmin} busquedaInicial={requestedQuery} />
      ) : tab === "scanner" ? (
        <ScannerRemitosTab
          profile={profile}
          sedeLocked={sedeLocked}
          canReceive={canReceive}
          isMobile={isMobile}
          onReview={(receipt) => {
            setModalPrefill(scannerReceiptPrefill(receipt));
            setIngresoKey((key) => key + 1);
            setTab("ingresar");
          }}
          onOpenIngreso={(envioId) => setSel(envioId)}
        />
      ) : tab === "consumibles" ? (
        <ConsumiblesPanolTab isMobile={isMobile} toast={toast} sedeLocked={sedeLocked} canReceive={canReceive} isAdmin={isAdmin} />
      ) : tab === "crear" ? (
        <CrearProductoTab isMobile={isMobile} toast={toast} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Tira de borradores para retomar (solo si hay) */}
          {(pendientes.length > 0 || papelera.length > 0) && (
            <div style={{ borderBottom: `1px solid ${C.border}`, background: C.topbarSoft, ...GLASS, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 12px" : "8px 18px", overflowX: "auto" }}>
                {pendientes.length > 0 && (
                  <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
                    Borradores ({pendientes.length}):
                  </span>
                )}
                {pendientes.map((d) => {
                  const nItems = Array.isArray(d.items) ? d.items.length : 0;
                  const esAviso = d.modo === "aviso";
                  return (
                    <div key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 5px 4px 11px", border: `1px solid ${C.blueB}`, background: "var(--blue-soft)", borderRadius: 999, flexShrink: 0 }}>
                      <button type="button" title={esAviso ? "Retomar este aviso a pañol" : "Retomar este ingreso"}
                        onClick={() => {
                          // El borrador se retoma como se cargó. Abrir un aviso en
                          // modo remito lo daría por recibido solo, sin que el
                          // pañolero llegue a verlo entrar.
                          const comun = { draftId: d.id, titulo: d.titulo, sede: d.sede, obraId: d.obraId, prioridad: d.prioridad, observaciones: d.observaciones, items: d.items };
                          setModalPrefill(esAviso ? { origen: "manual", ...comun } : { origen: "remito", modo: "remito", ...comun });
                          setIngresoKey((k) => k + 1);
                        }}
                        style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap", padding: 0 }}>
                        {d.titulo?.trim() || "(sin referencia)"} · {nItems} ít{nItems === 1 ? "em" : "ems"}
                      </button>
                      {esAviso && (
                        <span style={{ color: C.violet, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>aviso</span>
                      )}
                      <button type="button" title="Mandar a la papelera (se puede recuperar)"
                        onClick={() => {
                          borrarIngresoPendiente(d.id);
                          refreshPendientes();
                          toast.success("Borrador a la papelera. Podés recuperarlo desde el botón Papelera.");
                        }}
                        style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 2, flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {/* La papelera vive detrás de un botón: importa que esté, no que se
                    vea. Abierta siempre empujaba los borradores de verdad fuera de
                    la pantalla y dejaba la barra con scroll horizontal. */}
                {papelera.length > 0 && (
                  <button type="button" onClick={() => setPapeleraAbierta((v) => !v)}
                    title={papeleraAbierta ? "Ocultar la papelera" : "Borradores que mandaste a la papelera"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", border: `1px solid ${papeleraAbierta ? C.border2 : "transparent"}`, background: papeleraAbierta ? C.panelSolid : "transparent", borderRadius: 999, color: C.dim, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: C.sans, whiteSpace: "nowrap", flexShrink: 0, marginLeft: pendientes.length ? 4 : 0 }}>
                    <Trash2 size={12} />
                    Papelera ({papelera.length})
                  </button>
                )}
              </div>
              {papeleraAbierta && papelera.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "0 12px 8px" : "0 18px 8px", overflowX: "auto" }}>
                  {papelera.map((d) => {
                    const nItems = Array.isArray(d.items) ? d.items.length : 0;
                    const cuando = d.deletedAt ? new Date(d.deletedAt) : null;
                    const fecha = cuando && !Number.isNaN(cuando.getTime())
                      ? cuando.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : null;
                    return (
                      <button key={d.id} type="button" title={fecha ? `Recuperar · lo borraste el ${fecha}` : "Recuperar este borrador"}
                        onClick={() => {
                          restaurarIngresoPendiente(d.id);
                          refreshPendientes();
                          toast.success("Borrador recuperado.");
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", border: `1px dashed ${C.border2}`, background: "transparent", borderRadius: 999, color: C.dim, cursor: "pointer", fontSize: 12.5, fontWeight: 650, fontFamily: C.sans, whiteSpace: "nowrap", flexShrink: 0 }}>
                        <RotateCcw size={12} />
                        {d.titulo?.trim() || "(sin referencia)"} · {nItems} ít{nItems === 1 ? "em" : "ems"}
                      </button>
                    );
                  })}
                  <button type="button"
                    onClick={() => {
                      const n = papelera.length;
                      if (!window.confirm(`¿Vaciar la papelera?\n\nSe pierden ${n} borrador${n === 1 ? "" : "es"} descartado${n === 1 ? "" : "s"}. Los ingresos ya cargados no se tocan.`)) return;
                      vaciarPapeleraIngresos();
                      refreshPendientes();
                      setPapeleraAbierta(false);
                      toast.success("Papelera vacía.");
                    }}
                    style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 11.5, fontWeight: 650, fontFamily: C.sans, textDecoration: "underline", whiteSpace: "nowrap", flexShrink: 0, padding: "4px 2px" }}>
                    Vaciar
                  </button>
                  <span style={{ color: C.dim, fontSize: 11, whiteSpace: "nowrap", flexShrink: 0, opacity: 0.75 }}>
                    se vacía sola a los 7 días
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Form de ingreso inline (reemplaza al modal) */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {canReceive ? (
              <EnviarAPanolModal
                key={ingresoKey}
                open
                embedded
                profile={profile}
                prefill={modalPrefillEstable}
                showPrices={isAdmin && !modalPrefillEstable?.scannerStrict}
                requireCatalogLinks={Boolean(modalPrefillEstable?.scannerStrict)}
                onSaved={modalPrefillEstable?.scannerReceiptId
                  ? (envioId, context) => linkScannedReceiptToIngreso(
                    modalPrefillEstable.scannerReceiptId,
                    envioId,
                    context?.items || [],
                  )
                  : null}
                onClose={(saved) => {
                  const volverAlScanner = Boolean(modalPrefillEstable?.scannerReceiptId);
                  setModalPrefill(null);
                  setIngresoKey((k) => k + 1);
                  refreshPendientes();
                  if (saved) cargar();
                  if (volverAlScanner) setTab("scanner");
                }}
              />
            ) : (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.dim, fontSize: 13 }}>
                No tenés permisos para ingresar materiales.
              </div>
            )}
          </div>
        </div>
      )}
      <SolicitudPanolPrintable open={solicitudOpen} onClose={() => setSolicitudOpen(false)} />
    </>,
  );
}
