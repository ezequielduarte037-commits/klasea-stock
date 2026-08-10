import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  ClipboardList,
  Clock3,
  Inbox,
  MapPin,
  Nfc,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Scale,
  ScanLine,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { canonicalPanolSede, fetchEnvios, resumenItems } from "@/features/panol/panolApi";
import { leerIngresosPendientes } from "@/features/panol/ingresosPendientes";
import useNfcBridge from "@/features/panol/useNfcBridge";
import { useBalanza } from "@/hooks/useBalanza";

const CLOSED_ENVIO_STATES = new Set(["recibido", "cerrado", "cancelado"]);
const CLOSED_REQUEST_STATES = new Set(["recibido", "cancelado"]);
const PRIORITY_WEIGHT = { urgente: 4, alta: 3, media: 2, baja: 1 };

function needsReception(envio) {
  if (CLOSED_ENVIO_STATES.has(envio?.estado)) return false;
  const summary = resumenItems(envio?.items || []);
  return summary.pendientes > 0 || summary.problemas > 0 || summary.by?.parcial > 0;
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function ActionLink({ to, icon, label, detail, color }) {
  return (
    <Link
      to={to}
      className="panol-action"
      style={{
        minWidth: 0,
        minHeight: 76,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.panelSolid,
        color: C.text,
        padding: 13,
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr) 18px",
        alignItems: "center",
        gap: 11,
        textDecoration: "none",
      }}
    >
      <span style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        color,
        background: `${color}12`,
        border: `1px solid ${color}30`,
      }}>
        {createElement(icon, { size: 17 })}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 900, color: C.text }}>{label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: C.dim, marginTop: 3, lineHeight: 1.3 }}>{detail}</span>
      </span>
      <ArrowRight size={15} style={{ color: C.dim }} />
    </Link>
  );
}

function WorkRow({ icon, color, value, label, detail, to }) {
  return (
    <Link
      to={to}
      className="panol-work-row"
      style={{
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1fr) auto 18px",
        alignItems: "center",
        gap: 11,
        padding: "12px 14px",
        color: C.text,
        textDecoration: "none",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", color, background: `${color}12` }}>
        {createElement(icon, { size: 17 })}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 850 }}>{label}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 11.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 18, lineHeight: 1, fontWeight: 950, color }}>{value}</span>
      <ArrowRight size={14} style={{ color: C.dim }} />
    </Link>
  );
}

function DeviceState({ label, connected, available = true }) {
  const color = connected ? C.green : available ? C.dim : C.violet;
  const text = connected ? "Conectado" : available ? "Disponible" : "No compatible";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 28, padding: "0 9px", border: `1px solid ${C.border}`, borderRadius: 999, background: C.panel, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: connected ? `0 0 7px ${color}` : "none" }} />
      <span style={{ fontSize: 10.5, fontWeight: 850, color: C.text }}>{label}</span>
      <span style={{ fontSize: 10, color }}>{text}</span>
    </span>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <section style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panelSolid, minWidth: 0, overflow: "hidden" }}>
      <header style={{ minHeight: 58, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{title}</div>
          {subtitle && <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function PanolOperativoHome({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const nfc = useNfcBridge();
  const balanza = useBalanza();
  const sede = canonicalPanolSede(profile?.sede);
  const [loading, setLoading] = useState(true);
  const [envios, setEnvios] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sinUbicacion, setSinUbicacion] = useState(0);
  const [movimientosHoy, setMovimientosHoy] = useState(0);
  const [drafts, setDrafts] = useState(() => leerIngresosPendientes());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const requestQuery = supabase
        .from("purchase_requests")
        .select("id,title,status,priority,created_at,updated_at,project_id")
        .eq("created_by", profile?.id)
        .order("updated_at", { ascending: false })
        .limit(30);

      const [enviosResult, requestsResult, locationResult, movementResult] = await Promise.allSettled([
        fetchEnvios({ sede: sede || null }),
        profile?.id ? requestQuery : Promise.resolve({ data: [], error: null }),
        supabase
          .from("panol_materiales")
          .select("id", { count: "exact", head: true })
          .eq("activo", true)
          .is("ubicacion", null),
        supabase
          .from("panol_obra_materiales_snapshot")
          .select("id", { count: "exact", head: true })
          .gte("updated_at", start.toISOString()),
      ]);

      if (enviosResult.status === "fulfilled") setEnvios(enviosResult.value || []);
      else throw enviosResult.reason;

      if (requestsResult.status === "fulfilled" && !requestsResult.value?.error) {
        setRequests((requestsResult.value?.data || []).filter((row) => !CLOSED_REQUEST_STATES.has(row.status)));
      }
      if (locationResult.status === "fulfilled" && !locationResult.value?.error) setSinUbicacion(locationResult.value.count || 0);
      if (movementResult.status === "fulfilled" && !movementResult.value?.error) setMovimientosHoy(movementResult.value.count || 0);
      setDrafts(leerIngresosPendientes());
    } catch (error) {
      toast.error(error?.message || "No se pudo cargar el inicio de pañol.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id, sede, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const summary = useMemo(() => {
    const activos = envios.filter(needsReception);
    let openItems = 0;
    let problemas = 0;
    for (const envio of activos) {
      const current = resumenItems(envio.items || []);
      openItems += current.pendientes + (current.by?.parcial || 0);
      problemas += current.problemas;
    }
    const ordered = [...activos].sort((a, b) => {
      const priority = (PRIORITY_WEIGHT[b.prioridad] || 0) - (PRIORITY_WEIGHT[a.prioridad] || 0);
      if (priority) return priority;
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
    return { activos, openItems, problemas, ordered };
  }, [envios]);

  const requestUrgent = requests.filter((row) => row.priority === "urgente").length;
  const username = profile?.username || "Pañol";

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: C.bg, color: C.text, fontFamily: C.sans }}>
      <style>{`
        .panol-action,.panol-work-row,.panol-reception-row,.panol-consult-link {
          transition: background .16s ease, border-color .16s ease, transform .16s ease;
        }
        .panol-action:hover { background: var(--panel-2) !important; border-color: var(--border-2) !important; transform: translateY(-1px); }
        .panol-work-row:hover,.panol-reception-row:hover { background: var(--panel-2) !important; }
        .panol-consult-link:hover { color: var(--blue) !important; border-color: var(--blue-border) !important; background: var(--blue-soft) !important; }
        @media (prefers-reduced-motion: reduce) {
          .panol-action,.panol-work-row,.panol-reception-row,.panol-consult-link { transition: none !important; }
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px minmax(0, 1fr)", height: "100%" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={{ minWidth: 0, minHeight: 0, overflowY: "auto" }}>
          <header style={{
            minHeight: 74,
            padding: isMobile ? "13px 12px 13px 58px" : "15px 22px",
            borderBottom: `1px solid ${C.border}`,
            background: C.topbar,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}>
            <span style={{ width: 38, height: 38, borderRadius: 8, display: "grid", placeItems: "center", background: C.blueL, color: C.blue, border: `1px solid ${C.blueB}`, flexShrink: 0 }}>
              <Warehouse size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 19, lineHeight: 1.1, fontWeight: 950, color: C.text }}>Buen día, {username}</div>
              <div style={{ marginTop: 5, fontSize: 11, color: C.dim, fontWeight: 750, letterSpacing: 0.8, textTransform: "uppercase" }}>
                Inicio operativo {sede ? `· Pañol ${sede}` : "· Todas las sedes"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <DeviceState label="Lector NFC" connected={nfc.connected} />
              <DeviceState label="Balanza" connected={balanza.conectado} available={balanza.soportado} />
              <button
                type="button"
                onClick={cargar}
                disabled={loading}
                title="Actualizar inicio"
                style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, background: C.panelSolid, color: C.text, cursor: loading ? "default" : "pointer", opacity: loading ? 0.55 : 1 }}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </header>

          <div style={{ width: "min(1260px, 100%)", margin: "0 auto", padding: isMobile ? "14px 12px 36px" : "20px 22px 42px", boxSizing: "border-box" }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 900 }}>Acciones de pañol</div>
              <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>Entrá directo al trabajo que vas a realizar.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(205px, 1fr))", gap: 8 }}>
              <ActionLink to="/recepcion-panol?tab=recepcion" icon={PackageCheck} label="Recepcionar" detail={`${summary.activos.length} pedidos por revisar`} color={C.green} />
              <ActionLink to="/recepcion-panol?tab=ingresar" icon={PackagePlus} label="Ingresar" detail={drafts.length ? `${drafts.length} borradores para retomar` : "Remito, escáner o ingreso manual"} color={C.blue} />
              <ActionLink to="/recepcion-panol?tab=egresos" icon={ScanLine} label="Egresar" detail="Buscar, escanear o abrir carrito" color={C.red} />
              <ActionLink to="/recepcion-panol?tab=consumibles" icon={Scale} label="Consumibles" detail="Ingreso, egreso y registro por peso" color={C.violet} />
              <ActionLink to="/inicio-panol/tarjetas" icon={Nfc} label="Asignar tarjeta NFC" detail="Vincular una tarjeta a un empleado de RRHH" color={C.violet} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, .9fr) minmax(380px, 1.25fr)", gap: 12, marginTop: 18 }}>
              <Section title="Trabajo pendiente" subtitle="Lo que conviene resolver primero">
                <WorkRow icon={Inbox} color={C.violet} value={summary.openItems} label="Ítems por recibir" detail={`${summary.activos.length} pedidos abiertos${summary.problemas ? ` · ${summary.problemas} con novedad` : ""}`} to="/recepcion-panol?tab=recepcion" />
                <WorkRow icon={ClipboardList} color={C.blue} value={drafts.length} label="Ingresos en borrador" detail={drafts.length ? "Podés retomarlos sin volver a cargar los productos" : "No hay ingresos pendientes"} to="/recepcion-panol?tab=ingresar" />
                <WorkRow icon={ShoppingCart} color={requestUrgent ? C.red : C.violet} value={requests.length} label="Pedidos a compras abiertos" detail={requestUrgent ? `${requestUrgent} urgentes requieren seguimiento` : "Solicitudes realizadas por tu cuenta"} to="/compras" />
                <WorkRow icon={MapPin} color={sinUbicacion ? C.violet : C.green} value={sinUbicacion} label="Productos sin ubicación" detail="Revisalos desde el mapa o el stock maestro" to="/stock-panol?tab=mapa" />
              </Section>

              <Section
                title="Próximas recepciones"
                subtitle={sede ? `Pedidos enviados a ${sede}` : "Pedidos de todas las sedes"}
                action={<Link to="/recepcion-panol?tab=recepcion" style={{ color: C.blue, fontSize: 11.5, fontWeight: 850, textDecoration: "none" }}>Ver bandeja</Link>}
              >
                {loading ? (
                  <div style={{ padding: 28, color: C.dim, fontSize: 12, textAlign: "center" }}>Actualizando recepción...</div>
                ) : summary.ordered.length === 0 ? (
                  <div style={{ minHeight: 210, display: "grid", placeItems: "center", padding: 20 }}>
                    <div style={{ textAlign: "center" }}>
                      <PackageCheck size={28} style={{ color: C.green }} />
                      <div style={{ color: C.text, fontSize: 13.5, fontWeight: 850, marginTop: 8 }}>Recepción al día</div>
                      <div style={{ color: C.dim, fontSize: 11.5, marginTop: 4 }}>No hay pedidos pendientes para tu sede.</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {summary.ordered.slice(0, 6).map((envio) => {
                      const current = resumenItems(envio.items || []);
                      const open = current.pendientes + (current.by?.parcial || 0);
                      const urgent = envio.prioridad === "urgente";
                      return (
                        <Link
                          key={envio.id}
                          to={`/recepcion-panol?tab=recepcion&envio=${encodeURIComponent(envio.id)}`}
                          className="panol-reception-row"
                          style={{
                            minHeight: 58,
                            padding: "9px 14px",
                            borderBottom: `1px solid ${C.border}`,
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto 18px",
                            gap: 12,
                            alignItems: "center",
                            color: C.text,
                            textDecoration: "none",
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                              {urgent && <AlertTriangle size={13} style={{ color: C.red, flexShrink: 0 }} />}
                              <span style={{ fontSize: 12.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{envio.titulo || "Pedido a recepción"}</span>
                            </span>
                            <span style={{ display: "block", color: C.dim, fontSize: 10.8, marginTop: 4 }}>
                              {envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}{envio.sede || "Sin sede"} · {fmtDate(envio.created_at)}
                            </span>
                          </span>
                          <span style={{ textAlign: "right" }}>
                            <span style={{ display: "block", fontFamily: C.mono, fontSize: 14, fontWeight: 950, color: open ? C.violet : C.green }}>{open}</span>
                            <span style={{ display: "block", color: C.dim, fontSize: 9.5, marginTop: 2 }}>abiertos</span>
                          </span>
                          <ArrowRight size={14} style={{ color: C.dim }} />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>

            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.dim, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 2 }}>Consultar</span>
              {[
                ["/stock-panol?tab=maestro", Box, "Stock maestro"],
                ["/stock-panol?tab=mapa", MapPin, "Mapa y ubicaciones"],
                ["/stock-panol?tab=movimientos", Clock3, `Movimientos${movimientosHoy ? ` · ${movimientosHoy} hoy` : ""}`],
                ["/scan-pedido", ShoppingCart, "Pedir reposición"],
              ].map(([to, icon, label]) => (
                <Link key={to} to={to} className="panol-consult-link" style={{ minHeight: 30, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, background: C.panel, textDecoration: "none", fontSize: 11.5, fontWeight: 800 }}>
                  {createElement(icon, { size: 13 })} {label}
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
