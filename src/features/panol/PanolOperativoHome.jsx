/**
 * PanolOperativoHome — el inicio del pañol.
 *
 * Arriba, la franja de la marca con el saludo, el estado del lector NFC y la
 * balanza, y lo que está esperando: ítems por recibir, ingresos en borrador,
 * pedidos a compras y productos sin ubicación (cada número lleva a su bandeja).
 * Abajo, las tareas como tarjetas, las próximas recepciones de la sede y los
 * accesos para consultar.
 *
 * Usa las mismas piezas que el Home y Obras (components/ui/Portada). Antes los
 * pendientes aparecían dos veces (en una lista y en las tarjetas de acciones) y
 * el saludo decía "Buen día" también a la noche.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  ClipboardList,
  Clock3,
  FileScan,
  MapPin,
  Nfc,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Scale,
  ScanLine,
  ShoppingCart,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import {
  ColumnasPortada,
  EnlacePortada,
  FilaPortada,
  Indicador,
  PanelPortada,
  Portada,
  PortadaHero,
  SeccionPortada,
  TarjetaModulo,
  VacioPortada,
} from "@/components/ui/Portada";
import { supabase } from "@/supabaseClient";
import { canonicalPanolSede, fetchEnvios, resumenItems } from "@/features/panol/panolApi";
import { leerIngresosPendientes } from "@/features/panol/ingresosPendientes";
import useNfcBridge from "@/features/panol/useNfcBridge";
import { useBalanza } from "@/hooks/useBalanza";
import { useAhora } from "@/hooks/useAhora";
import { fechaLarga, primerNombre, saludoSegunHora } from "@/lib/saludo";

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

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Lector y balanza: un punto verde cuando están conectados.
function Dispositivo({ label, connected, available = true }) {
  const color = connected ? "var(--green)" : available ? "var(--subtle)" : "var(--violet)";
  const estado = connected ? "Conectado" : available ? "Disponible" : "No compatible";
  return (
    <span className="ui-chip" style={{ minHeight: 30, background: "var(--topbar-soft)" }} title={`${label}: ${estado}`}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color: "var(--text)" }}>{label}</span>
      <span style={{ color: connected ? "var(--green)" : "var(--dim)", fontWeight: 500 }}>{estado}</span>
    </span>
  );
}

export default function PanolOperativoHome({ profile }) {
  const navigate = useNavigate();
  const toast = useToast();
  const nfc = useNfcBridge();
  const balanza = useBalanza();
  const ahora = useAhora();
  const sede = canonicalPanolSede(profile?.sede);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [envios, setEnvios] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sinUbicacion, setSinUbicacion] = useState(0);
  const [movimientosHoy, setMovimientosHoy] = useState(0);
  const [drafts, setDrafts] = useState(() => leerIngresosPendientes());
  const [sobrantesPendientes, setSobrantesPendientes] = useState(0);

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

      const [enviosResult, requestsResult, locationResult, movementResult, sobrantesResult] = await Promise.allSettled([
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
        supabase.rpc("panol_cierre_contar_pendientes"),
      ]);

      if (enviosResult.status === "fulfilled") setEnvios(enviosResult.value || []);
      else throw enviosResult.reason;

      if (requestsResult.status === "fulfilled" && !requestsResult.value?.error) {
        setRequests((requestsResult.value?.data || []).filter((row) => !CLOSED_REQUEST_STATES.has(row.status)));
      }
      if (locationResult.status === "fulfilled" && !locationResult.value?.error) setSinUbicacion(locationResult.value.count || 0);
      if (movementResult.status === "fulfilled" && !movementResult.value?.error) setMovimientosHoy(movementResult.value.count || 0);
      if (sobrantesResult.status === "fulfilled" && !sobrantesResult.value?.error) {
        setSobrantesPendientes(Number(sobrantesResult.value.data) || 0);
      }
      setDrafts(leerIngresosPendientes());
    } catch (error) {
      toast.error(error?.message || "No se pudo cargar el inicio de pañol.");
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
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
  const nombre = primerNombre(profile?.username);
  const saludo = saludoSegunHora(ahora);

  const bajada = requestUrgent
    ? `Tenés ${plural(requestUrgent, "pedido urgente", "pedidos urgentes")} en compras.`
    : summary.problemas
      ? `Hay ${plural(summary.problemas, "ítem con novedad", "ítems con novedad")} en recepción.`
      : "Entrá directo al trabajo que vas a hacer.";

  const indicadores = [
    { clave: "recibir", label: "Ítems por recibir", valor: summary.openItems, tono: "violeta", to: "/recepcion-panol?tab=recepcion" },
    { clave: "borradores", label: "Ingresos en borrador", valor: drafts.length, tono: "azul", to: "/recepcion-panol?tab=ingresar" },
    { clave: "compras", label: "Pedidos a compras", valor: requests.length, tono: requestUrgent ? "rojo" : "violeta", destacar: requestUrgent > 0, to: "/compras" },
    { clave: "ubicacion", label: "Sin ubicación", valor: sinUbicacion, tono: "cian", to: "/stock-panol?tab=mapa" },
  ];

  const acciones = [
    { to: "/recepcion-panol?tab=recepcion", Icono: PackageCheck, titulo: "Recepcionar", tono: "verde",
      descripcion: summary.activos.length ? `${plural(summary.activos.length, "pedido", "pedidos")} por revisar` : "No hay pedidos esperando" },
    { to: "/recepcion-panol?tab=scanner", Icono: FileScan, titulo: "Escanear remito", tono: "violeta",
      descripcion: "USB · lectura IA · revisión antes del stock" },
    { to: "/recepcion-panol?tab=ingresar", Icono: PackagePlus, titulo: "Ingreso directo", tono: "azul",
      descripcion: drafts.length ? `${plural(drafts.length, "borrador", "borradores")} para retomar` : "Carga manual, ajuste o remito ya digital" },
    { to: "/egresos-panol", Icono: ScanLine, titulo: "Egresar", tono: "rojo",
      descripcion: "Buscar, escanear o abrir el carrito" },
    { to: "/stock-panol?tab=sobrantes", Icono: ClipboardList, titulo: "Sobrantes de obra", tono: "cian",
      descripcion: sobrantesPendientes ? `${plural(sobrantesPendientes, "obra", "obras")} por conciliar` : "Materiales de obras terminadas" },
    { to: "/recepcion-panol?tab=consumibles", Icono: Scale, titulo: "Consumibles", tono: "teal",
      descripcion: "Ingreso, egreso y registro por peso" },
    { to: "/inicio-panol/tarjetas", Icono: Nfc, titulo: "Asignar tarjeta NFC", tono: "neutro",
      descripcion: "Vincular una tarjeta a un empleado de RRHH" },
  ];

  const consultas = [
    { to: "/stock-panol?tab=maestro", Icono: Box, titulo: "Stock maestro", detalle: "Todo lo que hay, por producto", tono: "azul" },
    { to: "/stock-panol?tab=mapa", Icono: MapPin, titulo: "Mapa y ubicaciones", detalle: sinUbicacion ? `${plural(sinUbicacion, "producto", "productos")} sin ubicar` : "Dónde está cada cosa", tono: "cian" },
    { to: "/stock-panol?tab=movimientos", Icono: Clock3, titulo: "Movimientos", detalle: movimientosHoy ? `${plural(movimientosHoy, "movimiento", "movimientos")} hoy` : "Ingresos y egresos recientes", tono: "violeta" },
    { to: "/scan-pedido", Icono: ShoppingCart, titulo: "Pedir reposición", detalle: "Escanear y mandar a compras", tono: "verde" },
  ];

  return (
    <Portada>
      <PortadaHero
        eyebrow={`${sede ? `Pañol ${sede}` : "Pañol · todas las sedes"} · ${fechaLarga(ahora)}`}
        titulo={nombre ? `${saludo},` : saludo}
        acento={nombre}
        bajada={bajada}
        acciones={(
          <>
            <Dispositivo label="Lector NFC" connected={nfc.connected} />
            <Dispositivo label="Balanza" connected={balanza.conectado} available={balanza.soportado} />
            <button
              type="button"
              className="ui-btn ui-btn-icono"
              onClick={cargar}
              disabled={loading}
              title="Actualizar"
              aria-label="Actualizar"
              style={{ minHeight: 30, width: 30, borderRadius: 999, background: "var(--topbar-soft)" }}
            >
              <RefreshCw size={14} />
            </button>
          </>
        )}
        indicadores={indicadores.map(({ clave, to, ...resto }) => (
          <Indicador key={clave} cargando={primeraCarga} {...resto} onClick={() => navigate(to)} />
        ))}
      />

      <SeccionPortada titulo="Tareas" cantidad={acciones.length}>
        {acciones.map(({ to, ...accion }, i) => (
          <TarjetaModulo key={to} indice={i} {...accion} onClick={() => navigate(to)} />
        ))}
      </SeccionPortada>

      <ColumnasPortada>
        <PanelPortada
          titulo="Próximas recepciones"
          subtitulo={sede ? `Pedidos enviados a ${sede}` : "Pedidos de todas las sedes"}
          accion={<EnlacePortada onClick={() => navigate("/recepcion-panol?tab=recepcion")}>Ver bandeja</EnlacePortada>}
        >
          {primeraCarga ? (
            <Cargando texto="Buscando pedidos…" />
          ) : summary.ordered.length === 0 ? (
            <VacioPortada Icono={PackageCheck} titulo="Recepción al día" detalle="No hay pedidos pendientes para tu sede." />
          ) : (
            summary.ordered.slice(0, 6).map((envio) => {
              const current = resumenItems(envio.items || []);
              const abiertos = current.pendientes + (current.by?.parcial || 0);
              return (
                <FilaPortada
                  key={envio.id}
                  titulo={envio.titulo || "Pedido a recepción"}
                  detalle={`${envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}${envio.sede || "Sin sede"} · ${fmtDate(envio.created_at)}`}
                  valor={abiertos}
                  valorLabel="abiertos"
                  tono={abiertos ? "violeta" : "verde"}
                  alerta={envio.prioridad === "urgente"}
                  onClick={() => navigate(`/recepcion-panol?tab=recepcion&envio=${encodeURIComponent(envio.id)}`)}
                />
              );
            })
          )}
        </PanelPortada>

        <PanelPortada titulo="Consultar" subtitulo="Stock, ubicaciones y movimientos">
          {consultas.map(({ to, ...consulta }) => (
            <FilaPortada key={to} {...consulta} onClick={() => navigate(to)} />
          ))}
        </PanelPortada>
      </ColumnasPortada>
    </Portada>
  );
}
