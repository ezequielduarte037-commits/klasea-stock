import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Bell,
  ChevronDown,
  Grid3x3,
  Inbox,
  LayoutList,
  LoaderCircle,
  MoreHorizontal,
  Package,
  PackageSearch,
  Plus,
  RotateCcw,
  ShoppingCart,
  Table2,
  TrendingDown,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import AdditionalPurchasesPanel from "@/features/compras/AdditionalPurchasesPanel";
import CajaChicaPanel from "@/features/compras/CajaChicaPanel";
import CadeteRutaScreen from "@/features/cadete/CadeteRutaScreen";
import PurchaseRequestDetail from "@/features/compras/PurchaseRequestDetail";
import PurchaseLogPanel from "@/features/compras/PurchaseLogPanel";
import FaltantesComprasPanel from "@/features/compras/FaltantesComprasPanel";
import ReposicionPanel from "@/features/compras/ReposicionPanel";
import MatrizLineasPanel from "@/features/compras/MatrizLineasPanel";
import PlanillaObrasPanel from "@/features/compras/PlanillaObrasPanel";
import {
  fetchComprasAvisos,
  fetchProfiles,
  fetchProjects,
  fetchPurchaseRequests,
  isPurchaseManager,
} from "@/features/compras/purchaseRequestsApi";
import { CSS_COMPRAS_MODULO } from "./estilos";
import {
  AVISO_ACTIVOS,
  CLAVES_FILTRO,
  FILTROS_VACIOS,
  RaizCompras,
  TABS_GESTION,
  TABS_PEDIDOR,
  armarBandeja,
  estaCerrado,
} from "./modulo";
import Bandeja from "./vistas/Bandeja";
import Pedidos from "./vistas/Pedidos";
import MisPedidos from "./vistas/MisPedidos";
import Avisos from "./vistas/Avisos";
import Tablero from "./vistas/Tablero";
import NuevoPedido from "./pedir/NuevoPedido";
import { Cabecera } from "./ui";

// Pestañas de la gestión: las de todos los días a la vista y el resto en «Más».
const TABS_DIARIO = [
  { key: "pendientes", label: "Bandeja", corto: "Bandeja", Icon: Inbox, badge: "atencion" },
  { key: "lista", label: "Pedidos", corto: "Pedidos", Icon: LayoutList },
  { key: "comprar", label: "Qué comprar", corto: "Comprar", Icon: TrendingDown },
  { key: "avisos", label: "Avisos", corto: "Avisos", Icon: Bell, badge: "avisos" },
];
const TABS_MAS = [
  {
    grupo: "Planificar",
    items: [
      { key: "planilla", label: "Planilla por obra", Icon: Table2, hint: "Los materiales de cada barco" },
      { key: "matriz", label: "Matriz por línea", Icon: Grid3x3, hint: "La receta base de cada modelo" },
      { key: "faltantes", label: "Faltantes", Icon: PackageSearch, hint: "Lo que el pañol reportó que falta" },
    ],
  },
  {
    grupo: "Gastos y logística",
    items: [
      { key: "registro", label: "Registro", Icon: Package, hint: "Lo comprado y lo mandado al pañol" },
      { key: "adicionales", label: "Adicionales", Icon: Table2, hint: "Lo que se suma fuera de la matriz" },
      { key: "caja", label: "Caja chica", Icon: Wallet, hint: "Gastos menores y cierres" },
      { key: "ruta", label: "Hoja de ruta", Icon: Truck, hint: "Lo que el cadete retira hoy" },
    ],
  },
  {
    grupo: "Consultar",
    items: [{ key: "dashboard", label: "Tablero", Icon: BarChart3, hint: "Gasto, tiempos y quién pide" }],
  },
];
const ETIQUETA_MAS = Object.fromEntries(TABS_MAS.flatMap((g) => g.items.map((t) => [t.key, t.label])));
const ICONO_MAS = Object.fromEntries(TABS_MAS.flatMap((g) => g.items.map((t) => [t.key, t.Icon])));
const TABS_PEDIDOR_UI = [
  { key: "mine", label: "Mis pedidos", corto: "Míos", Icon: Inbox },
  { key: "cc", label: "En copia", corto: "Copia", Icon: Users },
  { key: "avisos", label: "Mis avisos", corto: "Avisos", Icon: Bell },
];
// Solapas con tablas anchas: usan todo el ancho.
const ANCHAS = new Set(["comprar", "planilla", "matriz", "faltantes", "registro", "adicionales", "caja", "ruta"]);

function leerMapaLeidos() {
  try { return JSON.parse(localStorage.getItem("pr_readMap") || "{}"); } catch { return {}; }
}

export default function PurchaseRequestsScreen({ profile }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [raiz, setRaiz] = useState(null);
  const [datos, setDatos] = useState({ requests: [], avisos: [], users: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [avisosError, setAvisosError] = useState("");
  const [leidos, setLeidos] = useState(leerMapaLeidos);
  const [nuevo, setNuevo] = useState(null); // null o { key, prefill }
  const [menu, setMenu] = useState(null);
  const botonMas = useRef(null);

  const manager = isPurchaseManager(profile);
  const puedeCrearAvisos = manager || ["tecnica", "oficina", "panol"].includes(profile?.role);
  const { requests, avisos, users, projects } = datos;

  // La URL manda: pestaña, pedido abierto, aviso y filtros. Así los links de
  // las notificaciones y del buscador funcionan aunque la pantalla ya esté abierta.
  const abiertoId = searchParams.get("open") || null;
  const avisoId = searchParams.get("aviso") || null;
  const tabParam = searchParams.get("tab") || "";
  const tab = manager
    ? (TABS_GESTION.includes(tabParam) ? tabParam : "pendientes")
    : (TABS_PEDIDOR.includes(tabParam) ? tabParam : "mine");
  const tabInicial = manager ? "pendientes" : "mine";

  const cambiarURL = useCallback((fn) => {
    const next = new URLSearchParams(searchParams);
    fn(next);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const irA = useCallback((t) => {
    cambiarURL((p) => {
      if (t === tabInicial) p.delete("tab"); else p.set("tab", t);
      if (t !== "avisos") p.delete("aviso");
      p.delete("open");
    });
    setMenu(null);
  }, [cambiarURL, tabInicial]);

  const filtros = useMemo(() => Object.fromEntries(CLAVES_FILTRO.map((k) => [k, searchParams.get(k) || FILTROS_VACIOS[k]])), [searchParams]);
  const setFiltros = useCallback((fn) => {
    const siguientes = fn(filtros);
    cambiarURL((p) => {
      for (const k of CLAVES_FILTRO) {
        const v = siguientes[k];
        if (v && v !== FILTROS_VACIOS[k]) p.set(k, v); else p.delete(k);
      }
    });
  }, [filtros, cambiarURL]);

  const cargar = useCallback(async () => {
    const [req, usr, prj, avs] = await Promise.allSettled([fetchPurchaseRequests(), fetchProfiles(), fetchProjects(), fetchComprasAvisos()]);
    setDatos((d) => ({
      requests: req.status === "fulfilled" ? req.value : d.requests,
      users: usr.status === "fulfilled" ? usr.value : d.users,
      projects: prj.status === "fulfilled" ? prj.value : d.projects,
      avisos: avs.status === "fulfilled" ? avs.value : d.avisos,
    }));
    setError(req.status === "rejected" ? (req.reason?.message || "No se pudo cargar Compras.") : "");
    setAvisosError(avs.status === "rejected" ? (avs.reason?.message || "No se pudieron cargar los avisos.") : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  async function refrescar() {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }

  // Sin leer: el último mensaje lo escribió otro y todavía no se abrió el pedido.
  const sinLeer = useMemo(() => {
    const s = new Set();
    for (const r of requests) {
      if (r.last_comment_author_id && r.last_comment_author_id !== profile?.id && r.last_comment_author_id !== leidos[r.id]) s.add(r.id);
    }
    return s;
  }, [requests, leidos, profile?.id]);

  const bandeja = useMemo(() => armarBandeja(requests, avisos, sinLeer), [requests, avisos, sinLeer]);
  const atencion = bandeja.grupos.critico.length + bandeja.grupos.revisar.length + bandeja.avisosActivos.length;
  const avisosNuevos = avisos.filter((a) => a.estado === "nuevo").length;
  const misAvisos = useMemo(() => avisos.filter((a) => a.created_by === profile?.id), [avisos, profile?.id]);
  const cuentasPedidor = useMemo(() => ({
    mine: requests.filter((r) => r.created_by === profile?.id && !estaCerrado(r)).length,
    cc: requests.filter((r) => !estaCerrado(r) && (r.followers || []).some((f) => f.user_id === profile?.id)).length,
    avisos: misAvisos.filter((a) => AVISO_ACTIVOS.includes(a.estado)).length,
  }), [requests, misAvisos, profile?.id]);

  function abrirPedido(r) {
    if (r?.last_comment_author_id) {
      setLeidos((prev) => {
        const next = { ...prev, [r.id]: r.last_comment_author_id };
        try { localStorage.setItem("pr_readMap", JSON.stringify(next)); } catch { /* opcional */ }
        return next;
      });
    }
    cambiarURL((p) => p.set("open", r.id));
  }

  function abrirAviso(id) {
    cambiarURL((p) => {
      p.set("tab", "avisos");
      if (id) p.set("aviso", id); else p.delete("aviso");
      p.delete("open");
    });
  }

  function nuevoPedido(prefill = null) {
    setNuevo({ key: Date.now(), prefill });
  }

  function convertirAviso(aviso) {
    nuevoPedido({
      title: aviso.titulo || aviso.material || "Aviso a compras",
      description: aviso.detalle || aviso.titulo || "",
      priority: aviso.prioridad || "media",
      project_id: aviso.project_id || "",
      destino: aviso.project?.codigo || aviso.destino || "",
      items: aviso.material ? [{ description: aviso.material }] : [],
    });
  }

  function alternarMenu() {
    if (menu) { setMenu(null); return; }
    const r = botonMas.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(300, window.innerWidth - 16);
    const abajo = r.top > window.innerHeight / 2;
    setMenu({
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
      ancho,
      top: abajo ? null : r.bottom + 6,
      bottom: abajo ? window.innerHeight - r.top + 6 : null,
      alto: abajo ? r.top - 18 : window.innerHeight - r.bottom - 18,
    });
  }

  useEffect(() => {
    if (!menu) return undefined;
    const cerrar = () => setMenu(null);
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    window.addEventListener("resize", cerrar);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("resize", cerrar); };
  }, [menu]);

  const enMas = Boolean(ETIQUETA_MAS[tab]);
  const IconoMas = enMas ? ICONO_MAS[tab] : MoreHorizontal;

  function vista() {
    if (manager) {
      switch (tab) {
        case "lista":
          return <Pedidos requests={requests} users={users} projects={projects} sinLeer={sinLeer} filtros={filtros} setFiltros={setFiltros} loading={loading} error={error} onAbrir={abrirPedido} />;
        case "avisos":
          return (
            <Avisos
              profile={profile} avisos={avisos} projects={projects} selectedId={avisoId} error={avisosError}
              canManage canCreate onSelect={(id) => abrirAviso(id)} onRefresh={cargar} onConvertir={convertirAviso}
            />
          );
        case "dashboard":
          return <Tablero requests={requests} onAbrir={abrirPedido} />;
        case "comprar":
          return <ReposicionPanel />;
        case "planilla":
          return (
            <PlanillaObrasPanel
              isMobile={isMobile}
              profile={profile}
              onPedir={({ titulo, descripcion, obraId, obraCodigo, proveedorSugerido }) => nuevoPedido({
                title: titulo,
                description: proveedorSugerido ? `Proveedor sugerido: ${proveedorSugerido}\n\n${descripcion}` : descripcion,
                project_id: obraId || "",
                destino: obraCodigo || "",
              })}
            />
          );
        case "matriz":
          return <MatrizLineasPanel />;
        case "faltantes":
          return <FaltantesComprasPanel toast={toast} />;
        case "registro":
          return <PurchaseLogPanel profile={profile} />;
        case "adicionales":
          return <AdditionalPurchasesPanel profile={profile} projects={projects} requests={requests} onSelectRequest={(id) => abrirPedido({ id })} onRequestCreated={cargar} />;
        case "caja":
          return <CajaChicaPanel profile={profile} />;
        case "ruta":
          return (
            <>
              <Cabecera eyebrow="Compras · Logística" titulo="Hoja de" acento="ruta" sub="Las paradas que el cadete tiene que hacer, lo que retira y su caja." />
              <CadeteRutaScreen embedded profile={profile} />
            </>
          );
        default:
          return (
            <Bandeja
              bandeja={bandeja} sinLeer={sinLeer} loading={loading} error={error || avisosError}
              onAbrir={abrirPedido} onAbrirAviso={abrirAviso}
              onIrLista={(patch) => { setFiltros((f) => ({ ...f, ...patch })); irA("lista"); }}
            />
          );
      }
    }
    if (tab === "avisos") {
      return (
        <Avisos
          propios profile={profile} avisos={misAvisos} projects={projects} selectedId={avisoId} error={avisosError}
          canCreate={puedeCrearAvisos} onSelect={(id) => abrirAviso(id)} onRefresh={cargar}
        />
      );
    }
    return <MisPedidos modo={tab} requests={requests} profile={profile} sinLeer={sinLeer} loading={loading} error={error} onAbrir={abrirPedido} onNuevo={() => nuevoPedido()} />;
  }

  const tabsVisibles = manager ? TABS_DIARIO : TABS_PEDIDOR_UI;
  const cuentaDe = (t) => (manager
    ? (t.badge === "atencion" ? atencion : t.badge === "avisos" ? avisosNuevos : 0)
    : cuentasPedidor[t.key] || 0);

  return (
    <div className={`cmp${abiertoId ? " con-detalle" : ""}`} ref={setRaiz}>
      <style href="klasea-compras" precedence="default">{CSS_COMPRAS_MODULO}</style>
      {/* Las solapas de planillas y gastos usan el `spin` de siempre. */}
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <RaizCompras.Provider value={raiz}>
        <nav className="cmp-nav" aria-label="Compras">
          <span className="cmp-nav-marca"><ShoppingCart size={17} /><span className="cmp-nav-txt">{manager ? "Compras" : "Pedidos a Compras"}</span></span>
          <span className="cmp-nav-sep" />
          <div className="ui-tabs" role="tablist">
            {tabsVisibles.map((t) => {
              const n = cuentaDe(t);
              return (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key && !abiertoId} className="ui-tab" style={{ position: "relative" }} onClick={() => irA(t.key)}>
                  <t.Icon size={15} />
                  <span><span className="txt-largo">{t.label}</span><span className="txt-corto">{t.corto}</span></span>
                  {n > 0 && <span className="n">{n}</span>}
                </button>
              );
            })}
            {manager && (
              <button
                ref={botonMas}
                type="button"
                role="tab"
                aria-selected={enMas && !abiertoId}
                aria-haspopup="menu"
                aria-expanded={Boolean(menu)}
                className="ui-tab"
                style={{ position: "relative" }}
                onClick={alternarMenu}
              >
                <IconoMas size={15} />
                <span><span className="txt-largo">{enMas ? ETIQUETA_MAS[tab] : "Más"}</span><span className="txt-corto">{enMas ? ETIQUETA_MAS[tab].split(" ")[0] : "Más"}</span></span>
                <ChevronDown size={13} className="chev" />
              </button>
            )}
          </div>
          <div className="cmp-nav-acc">
            <button type="button" className="cmp-btn-ic chico cmp-nav-refrescar" onClick={refrescar} disabled={refrescando} title="Volver a leer" aria-label="Volver a leer los pedidos">
              {refrescando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
            </button>
            <button type="button" className="ui-btn ui-btn-primario chico cmp-nuevo" onClick={() => nuevoPedido()}>
              <Plus size={15} /><span className="txt-largo">Nuevo pedido</span><span className="txt-corto">Pedir</span>
            </button>
          </div>
        </nav>

        {menu && (
          <>
            <div className="cmp-menu-fondo" onClick={() => setMenu(null)} />
            <div
              className="cmp-menu"
              role="menu"
              style={{ left: menu.left, width: menu.ancho, top: menu.top ?? "auto", bottom: menu.bottom ?? "auto", maxHeight: menu.alto }}
            >
              {TABS_MAS.map((g) => (
                <div key={g.grupo} className="cmp-menu-grupo">
                  <div className="cmp-menu-tit">{g.grupo}</div>
                  {g.items.map((t) => (
                    <button key={t.key} type="button" role="menuitem" className={`cmp-menu-op${tab === t.key ? " on" : ""}`} onClick={() => irA(t.key)}>
                      <t.Icon size={16} />
                      <span style={{ minWidth: 0 }}><b>{t.label}</b><small>{t.hint}</small></span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {abiertoId ? (
          <div className="cmp-det-cont">
            <PurchaseRequestDetail
              key={abiertoId}
              requestId={abiertoId}
              profile={profile}
              users={users}
              onBack={() => cambiarURL((p) => p.delete("open"))}
              onRequestUpdated={cargar}
              onDeleteLocal={(id) => setDatos((d) => ({ ...d, requests: d.requests.filter((r) => r.id !== id) }))}
            />
          </div>
        ) : (
          <main className="cmp-vista" key={tab}>
            <div className={`cmp-pagina${ANCHAS.has(tab) ? " ancha" : ""}`}>
              {vista()}
            </div>
          </main>
        )}

        {nuevo && (
          <NuevoPedido
            key={nuevo.key}
            profile={profile}
            projects={projects}
            users={users}
            prefill={nuevo.prefill}
            onCerrar={() => setNuevo(null)}
            onCreado={async (request) => {
              setNuevo(null);
              await cargar();
              abrirPedido(request);
            }}
          />
        )}
      </RaizCompras.Provider>
    </div>
  );
}
