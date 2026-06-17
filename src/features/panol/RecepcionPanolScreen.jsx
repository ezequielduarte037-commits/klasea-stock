import { C } from "@/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Warehouse,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import {
  fetchEnvios, ENVIO_ESTADO_META, ITEM_ESTADO_META, resumenItems, SEDES_PANOL,
} from "@/features/panol/panolApi";
import PanolEnvioDetail from "@/features/panol/PanolEnvioDetail";
import EnviarAPanolModal from "@/features/panol/EnviarAPanolModal";

const GLASS = {
  backdropFilter: "var(--glass-filter)",
  WebkitBackdropFilter: "var(--glass-filter)",
};

const STATE_FILTERS = [
  ["activos", "Activos"],
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

const PRIO_META = {
  baja: { label: "Baja", color: C.dim },
  media: { label: "Media", color: C.blue },
  alta: { label: "Alta", color: C.amber },
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

function iconBox(color, IconComponent) {
  const icon = IconComponent ? <IconComponent size={15} /> : null;
  return (
    <div style={{
      width: 30,
      height: 30,
      borderRadius: 9,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
      background: `${color}14`,
      border: `1px solid ${color}38`,
      color,
    }}>
      {icon}
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 128 }}>
      <span style={{ color: C.dim, fontSize: 10, fontWeight: 850, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: `1px solid ${C.border}`,
          background: C.panelSolid,
          color: C.text,
          padding: "8px 10px",
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 750,
          fontFamily: C.sans,
          outline: "none",
        }}
      >
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function SmallButton({ children, onClick, title, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        border: `1px solid ${C.border}`,
        background: C.panelSolid,
        color: C.muted,
        borderRadius: 9,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        height: 36,
        minWidth: 36,
        display: "grid",
        placeItems: "center",
        fontSize: 12,
        fontFamily: C.sans,
      }}
    >
      {children}
    </button>
  );
}

function KpiCard({ icon: Icon, label, value, color, detail }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      background: C.panelSolid,
      borderRadius: 12,
      padding: 13,
      display: "flex",
      alignItems: "center",
      gap: 10,
      minWidth: 0,
    }}>
      {iconBox(color, Icon)}
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontFamily: C.mono, fontSize: 21, lineHeight: 1, fontWeight: 850 }}>
          {value}
        </div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 800, marginTop: 4 }}>
          {label}
        </div>
        {detail && <div style={{ color: C.dim, fontSize: 11, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</div>}
      </div>
    </div>
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
            style={{ width: `${(n / resumen.total) * 100}%`, background: meta.color, minWidth: n ? 3 : 0 }}
          />
        );
      })}
    </div>
  );
}

function StatusPill({ estado }) {
  const meta = ENVIO_ESTADO_META[estado] ?? { label: estado, color: C.dim };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      color: meta.color,
      background: `${meta.color}14`,
      border: `1px solid ${meta.color}3d`,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 10,
      fontWeight: 850,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
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
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function DesktopRow({ envio, onOpen }) {
  const resumen = resumenItems(envio.items || []);
  const problemas = resumen.problemas || 0;
  const pendientes = resumen.pendientes || 0;
  const origen = envio.origen === "compra" ? "Compras" : "Manual";

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
            background: ENVIO_ESTADO_META[envio.estado]?.color || C.dim,
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.titulo}
            </div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {envio.obra?.codigo ? `Obra ${envio.obra.codigo}` : envio.destino || "Sin obra/destino"} · pedido {origen}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ color: C.dim, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>Sede</span>
        <span style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>{envio.sede}</span>
      </div>

      <StatusPill estado={envio.estado} />

      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <ProgressSegments resumen={resumen} />
        <div style={{ display: "flex", gap: 8, color: C.dim, fontSize: 11, minWidth: 0 }}>
          <span style={{ color: C.green, fontWeight: 800 }}>{resumen.recibidos}/{resumen.total}</span>
          <span>recibidos</span>
          {pendientes > 0 && <span>{pendientes} pend.</span>}
          {problemas > 0 && <span style={{ color: C.red, fontWeight: 850 }}>{problemas} problema{problemas === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <PriorityPill prioridad={envio.prioridad} />

      <div style={{ color: C.dim, fontSize: 12, fontFamily: C.mono }}>{fmtFecha(envio.created_at)}</div>

      <ChevronRight size={18} style={{ color: C.dim, justifySelf: "end" }} />
    </button>
  );
}

function MobileCard({ envio, onOpen }) {
  const resumen = resumenItems(envio.items || []);
  const problemas = resumen.problemas || 0;
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
        borderLeft: `4px solid ${ENVIO_ESTADO_META[envio.estado]?.color || C.dim}`,
        borderRadius: 12,
        padding: 13,
        display: "grid",
        gap: 10,
        fontFamily: C.sans,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: C.text, lineHeight: 1.2 }}>{envio.titulo}</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
            {envio.obra?.codigo ? `Obra ${envio.obra.codigo} · ` : ""}{envio.sede} · {fmtFecha(envio.created_at)}
          </div>
        </div>
        <StatusPill estado={envio.estado} />
      </div>
      <ProgressSegments resumen={resumen} />
      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: 12 }}>
        <span><strong style={{ color: C.green }}>{resumen.recibidos}/{resumen.total}</strong> recibidos</span>
        {problemas > 0 ? <span style={{ color: C.red, fontWeight: 850 }}>{problemas} problemas</span> : <PriorityPill prioridad={envio.prioridad} />}
      </div>
    </button>
  );
}

export default function RecepcionPanolScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const toast = useToast();

  const role = profile?.role;
  const isAdmin = !!profile?.is_admin || role === "admin";
  const isManager = isAdmin || role === "compras";
  const userSede = profile?.sede || null;
  const sedeLocked = role === "panol" && (userSede === "Pampa" || userSede === "Chubut") ? userSede : null;
  const canReceive = isManager || role === "panol";

  const [envios, setEnvios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [fSede, setFSede] = useState(sedeLocked || "todas");
  const [fEstado, setFEstado] = useState("activos");
  const [fPrio, setFPrio] = useState("todas");
  const [q, setQ] = useState("");

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

  const filtrados = useMemo(() => {
    let rows = envios;
    if (fEstado === "activos") rows = rows.filter((e) => !["cerrado", "cancelado"].includes(e.estado));
    else if (fEstado !== "todos") rows = rows.filter((e) => e.estado === fEstado);
    if (fPrio !== "todas") rows = rows.filter((e) => e.prioridad === fPrio);
    const term = q.trim().toLowerCase();
    if (term) rows = rows.filter((e) => rowSearchText(e).includes(term));
    return rows;
  }, [envios, fEstado, fPrio, q]);

  const kpis = useMemo(() => {
    let pendientes = 0;
    let problemas = 0;
    let recibidos = 0;
    let parciales = 0;
    for (const e of envios) {
      const r = resumenItems(e.items || []);
      pendientes += r.pendientes;
      problemas += r.problemas;
      if (e.estado === "recibido") recibidos += 1;
      if (e.estado === "parcial") parciales += 1;
    }
    const activos = envios.filter((e) => !["cerrado", "cancelado", "recibido"].includes(e.estado)).length;
    return { total: envios.length, activos, pendientes, problemas, recibidos, parciales };
  }, [envios]);

  const shell = (children) => (
    <div style={{ background: C.bg, position: "fixed", inset: 0, overflow: "hidden", color: C.text, fontFamily: C.sans }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden" }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );

  if (sel) {
    return shell(
      <PanolEnvioDetail
        envioId={sel}
        profile={profile}
        canReceive={canReceive}
        isManager={isManager}
        onBack={() => { setSel(null); cargar(); }}
      />,
    );
  }

  return shell(
    <>
      <div style={{
        background: C.topbar,
        ...GLASS,
        borderBottom: `1px solid ${C.border}`,
        padding: isMobile ? "12px 12px 12px 54px" : "16px 18px",
        display: "grid",
        gap: 14,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {iconBox(C.blue, Warehouse)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.text, lineHeight: 1.1 }}>Recepción de Pañol</div>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.1, textTransform: "uppercase", marginTop: 4, fontWeight: 750 }}>
              {sedeLocked ? `Pañol ${sedeLocked}` : "Pedidos pendientes de recepción · Pampa y Chubut"}
            </div>
          </div>
          <SmallButton onClick={cargar} disabled={loading} title="Actualizar">
            <RefreshCw size={15} />
          </SmallButton>
          {isManager && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 13px",
                border: `1px solid ${C.blueB}`,
                background: "var(--blue-soft)",
                color: C.blue,
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 850,
                fontFamily: C.sans,
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={15} />
              Nuevo pedido
            </button>
          )}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(130px, 1fr))",
          gap: 10,
        }}>
          <KpiCard icon={Inbox} label="Pedidos" value={kpis.total} color={C.blue} detail={`${filtrados.length} visibles`} />
          <KpiCard icon={Clock3} label="En recepcion" value={kpis.activos} color={C.amber} detail={`${kpis.parciales} parciales`} />
          <KpiCard icon={PackageOpen} label="Items pend." value={kpis.pendientes} color={C.violet} detail="por recibir" />
          <KpiCard icon={AlertTriangle} label="Novedades" value={kpis.problemas} color={C.red} detail="faltantes / sin info" />
          <KpiCard icon={PackageCheck} label="Completados" value={kpis.recibidos} color={C.green} detail="recepcionados" />
        </div>
      </div>

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
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pedido, obra, destino, sede..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.panelSolid,
                border: `1px solid ${C.border}`,
                color: C.text,
                padding: "9px 34px",
                borderRadius: 10,
                fontSize: 13,
                fontFamily: C.sans,
                outline: "none",
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                title="Limpiar"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: C.dim,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 4,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <SelectFilter label="Estado" value={fEstado} onChange={setFEstado} options={STATE_FILTERS} />
          <SelectFilter label="Prioridad" value={fPrio} onChange={setFPrio} options={PRIO_FILTERS} />

          {!sedeLocked && (
            <SelectFilter label="Sede" value={fSede} onChange={setFSede} options={[["todas", "Todas"], ...SEDES_PANOL.map((s) => [s, s])]} />
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
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 1.1,
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
            <div style={{ padding: 44, textAlign: "center", color: C.dim, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800 }}>
              Cargando pedidos...
            </div>
          ) : filtrados.length === 0 ? (
            <div style={{
              margin: "18px auto",
              maxWidth: 520,
              border: `1px dashed ${C.border2}`,
              borderRadius: 14,
              padding: "42px 22px",
              textAlign: "center",
              color: C.dim,
              background: C.panel,
            }}>
              <CheckCircle2 size={34} style={{ color: C.green, marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 850, color: C.text }}>No hay pedidos para este filtro</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                {isManager ? "Podes crear un pedido nuevo o cambiar los filtros." : "Cuando compras envie algo a tu pañol, aparece aca."}
              </div>
            </div>
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

      {modalOpen && (
        <EnviarAPanolModal
          open={modalOpen}
          profile={profile}
          prefill={sedeLocked ? { sede: sedeLocked } : null}
          onClose={(saved) => { setModalOpen(false); if (saved) cargar(); }}
        />
      )}
    </>,
  );
}
