import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ChevronDown,
  PackageOpen,
  PackagePlus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import PageHeader from "@/components/ui/PageHeader";
import BandejaPedidos from "@/features/panol/pedidos/BandejaPedidos";
import PedidoDetalle from "@/features/panol/pedidos/PedidoDetalle";
import { CSS_PEDIDOS } from "@/features/panol/pedidos/estilosPedidos";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";
import CrearProductoTab from "@/features/panol/CrearProductoTab";
import { puedeCrearProductosDeBarco } from "@/features/panol/productosACrear";
import ConsumiblesPanolTab from "@/features/panol/ConsumiblesPanolTab";
import SolicitudPanolPrintable from "@/features/panol/SolicitudPanolPrintable";
import { linkScannedReceiptToIngreso } from "@/features/panol/remitosScannerApi";
import { leerIngresosPendientes, borrarIngresoPendiente, leerPapeleraIngresos, restaurarIngresoPendiente, vaciarPapeleraIngresos } from "@/features/panol/ingresosPendientes";
import { hasAdminAccess, puedeVerPrecios } from "@/lib/permissions";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const PANOL_TAB_STORAGE_KEY = "klasea.panol.recepcion.tab";
// Las pestañas de remitos ("scanner" y "remitos") se mudaron a /remitos-panol:
// guardar papeles no es parte de recibir pedidos.
const PANOL_TABS = new Set(["recepcion", "ingresar", "consumibles", "crear"]);
const TABS_DE_REMITOS = { scanner: "escanear", remitos: "archivo" };

const TABS_PRINCIPALES = [
  { key: "recepcion", label: "Pedidos" },
];
const TABS_MAS = [
  { key: "ingresar", label: "Ingreso directo", hint: "Cargar materiales sin un pedido previo", Icon: PackageOpen },
  { key: "consumibles", label: "Consumibles", hint: "Tornillos, lijas y el resto del fondo", Icon: Scale },
  { key: "crear", label: "Crear producto", hint: "Alta rápida al catálogo, no a la matriz", Icon: PackagePlus },
];

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
    .rp-filtros > * { flex-shrink: 0; }
  }
`;

function RecepcionTabs({ tab, onTab, ingresarCount = 0, tabsMas = TABS_MAS }) {
  const [menu, setMenu] = useState(null);
  const botonMas = useRef(null);
  const enMenu = tabsMas.some((t) => t.key === tab);

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
        {enMenu ? tabsMas.find((t) => t.key === tab)?.label : "Más"}
        {tab === "ingresar" && ingresarCount > 0 && <span className="rp-tab-cuenta">{ingresarCount}</span>}
        <ChevronDown size={13} style={{ transform: menu ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {/* En un portal: esta tira vive dentro de PageHeader, que usa
          backdrop-filter, y eso hace que un position: fixed se ubique respecto
          del encabezado (corrido y tapado por la lista) en vez de la pantalla. */}
      {menu && createPortal(
        <>
          <div onClick={() => setMenu(null)} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 60 }} />
          <div className="rp-menu" role="menu" style={{ top: menu.top, left: menu.left, width: menu.ancho, maxHeight: menu.alto }}>
            {tabsMas.map((t) => {
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
        </>,
        document.body,
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
  // Pañol no da de alta productos de los barcos: lo nuevo entra sin ficha desde
  // el ingreso y Técnica lo crea desde Stock → Movimientos → Productos a crear.
  const soloConsumibles = profile ? !puedeCrearProductosDeBarco(profile) : false;
  const tabsMas = soloConsumibles ? TABS_MAS.map((t) => t.key === "crear"
    ? { ...t, label: "Producto pendiente", hint: "Ingresar un producto nuevo para que Técnica lo confirme" }
    : t) : TABS_MAS;

  // Sube cada vez que algo cambió los pedidos (un ingreso, volver de la ficha): la bandeja se relee.
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const [sel, setSel] = useState(() => (requestedTab === "recepcion" && requestedEnvio ? requestedEnvio : null));
  const [ingresoKey, setIngresoKey] = useState(0); // bump → remonta el form inline de ingreso (reset/retomar)
  const [tab, setTabState] = useState(() => {
    const inicial = readStoredPanolTab(requestedTab);
    return inicial;
  });
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
    if (value !== "crear") nextParams.delete("descripcion");
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
    () => modalPrefill || {
      origen: "remito", modo: "remito", sede: sedeLocked || "",
      descripcionPendiente: tab === "crear" && soloConsumibles ? searchParams.get("descripcion") || "" : "",
    },
    [modalPrefill, sedeLocked, tab, soloConsumibles, searchParams],
  );

  // Links viejos (menú guardado, notificaciones, buscador) a las pestañas de
  // remitos: van a la pantalla nueva, con la búsqueda si la traían.
  useEffect(() => {
    const vista = TABS_DE_REMITOS[requestedTab];
    if (!vista) return;
    const q = requestedQuery ? `&q=${encodeURIComponent(requestedQuery)}` : "";
    nav(`/remitos-panol?vista=${vista}${q}`, { replace: true });
  }, [requestedTab, requestedQuery, nav]);

  useEffect(() => {
    if (requestedTab === "egresos") nav("/egresos-panol", { replace: true });
  }, [nav, requestedTab]);

  // Si la URL pide otra pestaña u otro pedido (un link, el buscador, una
  // notificación), la pantalla se acomoda en el mismo render.
  const [pedidoEnUrl, setPedidoEnUrl] = useState({ tab: requestedTab, envio: requestedEnvio });
  if (pedidoEnUrl.tab !== requestedTab || pedidoEnUrl.envio !== requestedEnvio) {
    setPedidoEnUrl({ tab: requestedTab, envio: requestedEnvio });
    const value = readStoredPanolTab(requestedTab);
    if (value !== tab) setTabState(value);
    if (requestedTab === "recepcion" && requestedEnvio) setSel(requestedEnvio);
  }
  useEffect(() => {
    try { window.localStorage.setItem(PANOL_TAB_STORAGE_KEY, tab); } catch { /* sin almacenamiento */ }
  }, [tab]);

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
      <div className="pdd-root">
        <style>{CSS_PEDIDOS}</style>
        <PedidoDetalle
          key={sel}
          envioId={sel}
          materialInicial={requestedMaterial}
          itemInicial={requestedItem}
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
            recargar();
          }}
        />
      </div>,
    );
  }

  return shell(
    <>
      <PageHeader
        icon={Warehouse}
        eyebrow="Pañol"
        title="Pedidos"
        subtitle={sedeLocked ? `Pañol ${sedeLocked}` : "Bandeja operativa · Pampa y Chubut"}
        actions={(
          <>
            <button type="button" className="ui-btn ui-btn-primario" onClick={() => nav("/ingresos-panol")} title="El mostrador de entrada: lo de los pedidos y lo que llega sin pedido, con el lector">
              <ArrowDownToLine size={15} />
              Ingresar materiales
            </button>
            <button type="button" className="ui-btn ui-btn-suave" onClick={() => setSolicitudOpen(true)} title="Imprimir solicitud manual para pañol">
              <Printer size={15} />
              Imprimible
            </button>
            {tab === "recepcion" && (
              <button type="button" className="ui-btn ui-btn-icono" onClick={recargar} title="Actualizar" aria-label="Actualizar">
                <RefreshCw size={15} />
              </button>
            )}
          </>
        )}
      >
        <RecepcionTabs
          tab={tab}
          tabsMas={tabsMas}
          ingresarCount={pendientes.length}
          onTab={(next) => {
            if (next === "ingresar") refreshPendientes();
            setTab(next);
          }}
        />
      </PageHeader>

      {tab === "recepcion" ? (
        <div className="pdd-root">
          <style>{CSS_PEDIDOS}</style>
          <BandejaPedidos sedeFija={sedeLocked} onAbrir={setSel} version={version} />
        </div>
      ) : tab === "consumibles" ? (
        <ConsumiblesPanolTab isMobile={isMobile} toast={toast} sedeLocked={sedeLocked} canReceive={canReceive} isAdmin={isAdmin} />
      ) : tab === "crear" && !soloConsumibles ? (
        <CrearProductoTab isMobile={isMobile} toast={toast} verPrecios={puedeVerPrecios(profile)} />
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
                key={`${ingresoKey}-${tab}`}
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
                  if (saved) recargar();
                  if (volverAlScanner) nav("/remitos-panol?vista=archivo");
                  else if (saved && tab === "crear") setTab("ingresar");
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
