import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Boxes, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, Clock3,
  Edit3, Factory, FileText, GitMerge, History, Link2, Loader2,
  MapPin, PackageCheck, PackageOpen, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Repeat, Search,
  Settings2, Trash2, Truck, Wrench,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { C } from "@/theme";
import {
  actualizarItem,
  actualizarProceso,
  archivarItem,
  archivarOperacion,
  crearItem,
  borrarProcesoTorneria,
  crearProcesoTorneria,
  eliminarArchivo,
  eliminarMovimiento,
  fetchTorneriaContexto,
  fetchTorneriaProcesos,
  guardarMovimiento,
  guardarOperacion,
  subirArchivosMovimiento,
} from "./torneriaApi";
import {
  CrearProcesoModal, EmptyCatalogHint, ItemModal, MovimientoModal, OperacionModal, ProcesoModal,
} from "./TorneriaModals";
import {
  Modal, ProgressBar, StatusBadge,
} from "./torneriaUi";
import { BUTTON, PRIMARY_BUTTON } from "./torneriaStyles";

const TABS = [
  ["circuito", "Circuito", Factory],
  ["materiales", "Materiales", Boxes],
  ["historial", "Historial", History],
];

const GROUP_COLORS = {
  "Pata de gallo": C.blue,
  Timon: C.violet,
  Limera: C.teal,
  Escape: C.red,
  Bocina: C.green,
  Manchon: C.indigo,
  Otros: C.dim,
};

const RESULT_OPERATION_META = {
  pata_conjunto_t2: { clave: "pata_gallo", descripcion: "Pata de gallo", grupo: "Pata de gallo" },
  timon_conjunto_t2: { clave: "timon", descripcion: "Timon", grupo: "Timon" },
  limera_conjunto_t2: { clave: "limera_timon", descripcion: "Limera de timon", grupo: "Limera" },
};

const PROCESS_STATE = {
  borrador: "Borrador",
  activo: "Activo",
  completado: "Completado",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

const PURCHASE_STATES = [
  ["pendiente_solicitud", "Por solicitar"],
  ["solicitado", "Solicitado"],
  ["comprado", "Comprado"],
  ["recibido_astillero", "En astillero"],
  ["no_aplica", "No aplica"],
];

function fmtDate(value, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function qty(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : "0";
}

function operationProgress(operation) {
  const components = operation.componentes?.filter((row) => row.item?.activo !== false) || [];
  const required = components.reduce((sum, row) => sum + Number(row.cantidad_requerida || 0), 0);
  const received = components.reduce(
    (sum, row) => sum + Math.min(Number(row.cantidad_recibida || 0), Number(row.cantidad_requerida || 0)),
    0,
  );
  return required > 0 ? Math.round((received / required) * 100) : 0;
}

function processProgress(process) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  if (!operations.length) return 0;
  return Math.round(
    operations.reduce((sum, operation) => sum + operationProgress(operation), 0) / operations.length,
  );
}

function currentOperation(process) {
  return (process.operaciones || [])
    .filter((row) => row.activa !== false)
    .find((row) => row.estado !== "recibido") || null;
}

// Días transcurridos desde una fecha. Vive a nivel de módulo, como los helpers
// equivalentes del resto del proyecto: `Date.now()` llamado directo en el
// cuerpo de un componente es impuro y da resultados inestables entre renders.
const MS_DIA = 86400000;
function diasDesde(fecha) {
  if (!fecha) return null;
  const desde = new Date(fecha);
  if (Number.isNaN(desde.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  desde.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - desde.getTime()) / MS_DIA));
}

function dependencyRows(process, operation) {
  const deps = new Set(operation.depende_de || []);
  return (process.operaciones || []).filter(
    (row) => deps.has(row.clave) && row.estado !== "recibido",
  );
}

function groupRows(rows, key = "grupo") {
  const map = new Map();
  rows.forEach((row) => {
    const group = row[key] || "Otros";
    const list = map.get(group) ?? [];
    list.push(row);
    map.set(group, list);
  });
  return [...map.entries()];
}

// Los colores del theme son variables CSS ("var(--blue)"), así que NO se les
// puede concatenar un alfa hex: `var(--blue)18` es CSS inválido y el navegador
// lo descarta — el ícono quedaba sin fondo. Cada color va con su par del theme.
const KPI_TONOS = {
  [C.blue]: { soft: C.blueL, borde: C.blueB },
  [C.violet]: { soft: C.violetL, borde: C.violetB },
  [C.green]: { soft: C.greenL, borde: C.greenB },
  [C.red]: { soft: C.redL, borde: C.redB },
};

// El KPI es un botón: en el celular es la forma más rápida de filtrar sin
// abrir menús, y en escritorio evita tener el número acá y el filtro en otro
// lado. Si no filtra nada (onClick nulo) se renderiza como texto plano.
function Kpi({ icon, value, label, color, activo = false, onClick, compacto = false }) {
  const tono = KPI_TONOS[color] ?? { soft: C.panel2, borde: C.border };
  const clickable = typeof onClick === "function";
  return createElement(
    clickable ? "button" : "div",
    {
      type: clickable ? "button" : undefined,
      onClick,
      "aria-pressed": clickable ? activo : undefined,
      title: clickable ? `Ver sólo: ${label}` : undefined,
      className: clickable ? "tor-kpi" : undefined,
      style: {
        minWidth: compacto ? 0 : 118,
        flex: compacto ? "1 1 0" : "0 0 auto",
        display: "grid",
        gridTemplateColumns: compacto ? "minmax(0,1fr)" : "30px minmax(0,1fr)",
        gap: compacto ? 2 : 9,
        alignItems: "center",
        justifyItems: compacto ? "center" : "stretch",
        textAlign: compacto ? "center" : "left",
        padding: compacto ? "7px 6px" : "8px 10px",
        borderRadius: 11,
        border: `1px solid ${activo ? tono.borde : C.border}`,
        background: activo ? tono.soft : C.panel,
        cursor: clickable ? "pointer" : "default",
        fontFamily: C.sans,
      },
    },
    // En el celular se cae el ícono y queda número + etiqueta: entran los
    // cuatro sin scroll horizontal, que era lo que hacía perder información.
    compacto ? null : createElement(
      "div",
      {
        style: {
          width: 30, height: 30, display: "grid", placeItems: "center",
          borderRadius: 9, background: tono.soft, color,
        },
      },
      createElement(icon, { size: 15 }),
    ),
    createElement(
      "div",
      { style: { minWidth: 0 } },
      createElement("div", { style: { color: activo ? color : C.text, fontSize: compacto ? 16 : 15, fontWeight: 900, lineHeight: 1 } }, value),
      createElement("div", {
        style: {
          color: activo ? color : C.dim, fontSize: 9.5, fontWeight: 750, marginTop: 4,
          textTransform: "uppercase", letterSpacing: "0.05em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        },
      }, label),
    ),
  );
}

function ProcessCard({ process, selected, onClick }) {
  const progress = processProgress(process);
  const current = currentOperation(process);
  const unresolved = (process.items || []).filter(
    (item) => item.activo !== false && item.requiere_confirmacion && !item.confirmado_at,
  ).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="tor-process-card"
      style={{
        width: "100%",
        display: "grid",
        gap: 9,
        padding: 12,
        borderRadius: 13,
        border: `1px solid ${selected ? C.blueB : C.border}`,
        background: selected ? C.blueL : C.panel,
        color: C.text,
        cursor: "pointer",
        textAlign: "left",
        boxShadow: selected ? "0 8px 24px -18px var(--shadow-strong)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
              {process.obra?.codigo || process.nombre}
            </span>
            <span style={{
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              color: C.dim,
              fontSize: 9.5,
              fontWeight: 800,
            }}>
              {process.obra?.linea_nombre || "Sin línea"}
            </span>
          </div>
          <div style={{
            marginTop: 4,
            color: current ? C.muted : C.green,
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {current?.nombre || "Circuito recibido"}
          </div>
        </div>
        <ChevronRight size={16} color={selected ? C.blue : C.dim} style={{ flexShrink: 0 }} />
      </div>
      <ProgressBar value={progress} color={progress === 100 ? C.green : C.blue} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: C.dim, fontSize: 10.5 }}>{PROCESS_STATE[process.estado] || process.estado}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {unresolved > 0 && (
            <span style={{ color: C.red, fontSize: 10.5, fontWeight: 850 }}>
              {unresolved} por confirmar
            </span>
          )}
          <span style={{ color: progress === 100 ? C.green : C.blue, fontSize: 11, fontWeight: 900 }}>
            {progress}%
          </span>
        </div>
      </div>
    </button>
  );
}

function ProcessList({
  processes,
  selectedId,
  search,
  setSearch,
  status,
  setStatus,
  onSelect,
  onNew,
}) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 9 }}>
        <button type="button" onClick={onNew} style={{ ...PRIMARY_BUTTON, width: "100%" }}>
          <Plus size={15} /> Nuevo seguimiento
        </button>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: 12, color: C.dim }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar obra o línea…"
            style={{
              width: "100%",
              minHeight: 39,
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              padding: "8px 10px 8px 34px",
              fontSize: 12,
              fontFamily: C.sans,
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {[
            ["todos", "Todos"],
            ["activo", "Activos"],
            ["completado", "Completados"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              style={{
                ...BUTTON,
                minHeight: 30,
                padding: "4px 9px",
                flexShrink: 0,
                borderColor: status === value ? C.blueB : C.border,
                color: status === value ? C.blue : C.dim,
                background: status === value ? C.blueL : "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "grid", alignContent: "start", gap: 7 }}>
        {!processes.length ? (
          <div style={{
            display: "grid",
            placeItems: "center",
            gap: 8,
            padding: "36px 16px",
            color: C.dim,
            fontSize: 12,
            textAlign: "center",
          }}>
            <Factory size={24} />
            No hay seguimientos con este filtro.
          </div>
        ) : processes.map((process) => (
          <ProcessCard
            key={process.id}
            process={process}
            selected={process.id === selectedId}
            onClick={() => onSelect(process.id)}
          />
        ))}
      </div>
    </div>
  );
}

function OperationCard({ process, operation, onMove, onEdit, onEditItem }) {
  const progress = operationProgress(operation);
  const dependencies = dependencyRows(process, operation);
  const alerts = operation.componentes
    .map((row) => row.item)
    .filter((item) => item?.requiere_confirmacion && !item.confirmado_at);
  const ready = operation.estado === "pendiente" && dependencies.length === 0;
  // Las piezas que viajan en esta operación. Es el título real de la tarjeta:
  // el mecánico reconoce la pieza, no el nombre del proceso.
  const piezas = (operation.componentes || [])
    .map((row) => row.item?.descripcion)
    .filter(Boolean)
    .join(" + ");

  // Par completo del theme: el alfa hex sobre var(--…) no funciona.
  const accent = operation.tipo === "plegadora" ? C.violet : C.blue;
  const accentSoft = operation.tipo === "plegadora" ? C.violetL : C.blueL;
  const accentBorde = operation.tipo === "plegadora" ? C.violetB : C.blueB;
  const actionLabel = operation.estado === "pendiente"
    ? "Registrar salida"
    : operation.estado === "recibido"
      ? "Registrar movimiento"
      : "Registrar regreso";

  return (
    <div className="tor-operation" style={{
      position: "relative",
      display: "grid",
      gap: 11,
      padding: 13,
      borderRadius: 14,
      border: `1px solid ${operation.estado === "recibido" ? C.greenB : C.border}`,
      background: operation.estado === "recibido" ? C.greenL : C.panel,
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 12,
        bottom: 12,
        width: 3,
        borderRadius: "0 3px 3px 0",
        background: operation.estado === "recibido" ? C.green : accent,
      }} />
      {/* El ÍTEM manda; la acción ("plegar", "mecanizar") es un detalle que se
          agrega después. Arrancar por el verbo confundía: al principio nadie
          sabe todavía qué se le hace a cada pieza, pero sí sabe qué pieza es y
          si va o vuelve. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, paddingLeft: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>
              {piezas || operation.nombre}
            </span>
            {/* El viaje va en su propio chip y con número grande: es lo que
                distingue "la primera salida" de "la segunda", que era justo lo
                que no se entendía en las piezas que van y vuelven dos veces. */}
            {operation.viaje ? (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999,
                border: `1px solid ${accentBorde}`, background: accentSoft, color: accent,
                fontSize: 10, fontWeight: 900, whiteSpace: "nowrap",
              }}>
                <Repeat size={10} />
                Viaje {operation.viaje}
              </span>
            ) : null}
            <span style={{
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.dim,
              fontSize: 9.5,
              fontWeight: 850,
              textTransform: "uppercase",
            }}>
              {operation.tipo === "plegadora" ? "Plegadora" : operation.tipo === "torneria" ? "Tornería" : operation.tipo}
            </span>
          </div>
          {/* La acción baja a segundo renglón, en gris: sigue estando para quien
              la necesite, pero deja de ser el título. */}
          {piezas && operation.nombre && (
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginTop: 3 }}>
              {operation.nombre}
            </div>
          )}
          {operation.descripcion && (
            <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>
              {operation.descripcion}
            </div>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: C.dim,
            fontSize: 9.5,
            fontWeight: 750,
            marginTop: 5,
          }}>
            <MapPin size={10} />
            {operation.origen || "Astillero"} → {workshopName(operation)} → Astillero
          </div>
        </div>
        <StatusBadge status={operation.estado} compact />
      </div>

      {dependencies.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 7,
          padding: "8px 9px",
          borderRadius: 9,
          border: `1px solid ${C.redB}`,
          background: C.redL,
          color: C.red,
          fontSize: 10.5,
          lineHeight: 1.4,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          Espera: {dependencies.map((row) => row.nombre).join(", ")}
        </div>
      )}
      {ready && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.green, fontSize: 10.5, fontWeight: 800 }}>
          <Check size={13} /> Listo para enviar
        </div>
      )}
      {alerts.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onEditItem(item)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 7,
            width: "100%",
            padding: "8px 9px",
            borderRadius: 9,
            border: `1px solid ${C.redB}`,
            background: C.redL,
            color: C.red,
            cursor: "pointer",
            textAlign: "left",
            fontSize: 10.5,
            lineHeight: 1.4,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span><b>{item.descripcion}:</b> {item.alerta || "requiere confirmación antes de salir."}</span>
        </button>
      ))}

      <div style={{ display: "grid", gap: 6 }}>
        {operation.componentes.filter((row) => row.item?.activo !== false).map((row) => {
          const rowPct = Number(row.cantidad_requerida) > 0
            ? Math.min(100, Math.round((Number(row.cantidad_recibida) / Number(row.cantidad_requerida)) * 100))
            : 0;
          return (
            <div key={row.id} style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 9,
              alignItems: "center",
              padding: "7px 8px",
              borderRadius: 9,
              background: C.panelSolid,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  color: C.muted,
                  fontSize: 11.5,
                  fontWeight: 750,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {row.item?.descripcion || "Pieza"}
                </div>
                <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2 }}>
                  Sale {qty(row.cantidad_enviada)} · volvió {qty(row.cantidad_recibida)}
                </div>
              </div>
              <span style={{ color: rowPct === 100 ? C.green : C.dim, fontSize: 10.5, fontWeight: 850 }}>
                {qty(row.cantidad_recibida)}/{qty(row.cantidad_requerida)} {row.item?.unidad}
              </span>
            </div>
          );
        })}
      </div>

      <ProgressBar value={progress} color={progress === 100 ? C.green : accent} />

      {!!operation.movimientos?.length && (
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 1 }}>
          {operation.movimientos.slice(0, 6).map((movement) => (
            <button
              key={movement.id}
              type="button"
              onClick={() => onMove(operation, movement)}
              style={{
                ...BUTTON,
                minHeight: 29,
                flexShrink: 0,
                padding: "4px 8px",
                color: movement.tipo === "salida" ? C.blue : C.green,
                fontSize: 9.5,
              }}
            >
              {movement.tipo === "salida" ? <ArrowRight size={11} /> : <ArrowLeft size={11} />}
              {fmtDate(movement.fecha, false)}
              {!!movement.archivos?.length && <FileText size={11} />}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 7 }}>
        <button type="button" onClick={() => onMove(operation, null)} style={{ ...PRIMARY_BUTTON, width: "100%" }}>
          {operation.estado === "pendiente" ? <Truck size={15} /> : <PackageOpen size={15} />}
          {actionLabel}
        </button>
        <button type="button" onClick={() => onEdit(operation)} aria-label="Editar paso" style={{ ...BUTTON, width: 41, padding: 0 }}>
          <Edit3 size={14} />
        </button>
      </div>
    </div>
  );
}

function workshopName(operation) {
  if (operation.destino?.trim()) return operation.destino.trim();
  if (operation.tipo === "plegadora") return "Plegadora";
  if (operation.tipo === "torneria") return "Tornería";
  return operation.tipo || "Taller";
}

function JourneyCard({ process, operation, index, current, onMove }) {
  const dependencies = dependencyRows(process, operation);
  const outside = ["enviado", "parcial"].includes(operation.estado);
  const received = operation.estado === "recibido";
  const partial = operation.estado === "parcial";
  const pending = operation.estado === "pendiente";
  const destination = workshopName(operation);
  const origin = operation.origen?.trim() || "Astillero";
  const supplierOrigin = origin.toLowerCase() !== "astillero";
  const originColor = supplierOrigin ? C.teal : C.green;
  const originSoft = supplierOrigin ? C.tealL : C.greenL;
  const originBorder = supplierOrigin ? C.tealB : C.greenB;
  const workshopColor = operation.tipo === "plegadora" ? C.violet : C.blue;
  const workshopSoft = operation.tipo === "plegadora" ? C.violetL : C.blueL;
  const workshopBorder = operation.tipo === "plegadora" ? C.violetB : C.blueB;
  const latestDeparture = [...(operation.movimientos || [])]
    .filter((movement) => movement.tipo === "salida")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  const daysOutside = outside ? diasDesde(latestDeparture?.fecha) : null;
  const actionLabel = pending ? "Registrar salida" : outside ? "Registrar regreso" : null;

  let stateLabel = "Pendiente de salida";
  let stateColor = C.dim;
  let stateSoft = C.panel2;
  let stateBorder = C.border;
  if (received) {
    stateLabel = "Recibido en astillero";
    stateColor = C.green;
    stateSoft = C.greenL;
    stateBorder = C.greenB;
  } else if (partial) {
    stateLabel = "Regreso parcial";
    stateColor = C.violet;
    stateSoft = C.violetL;
    stateBorder = C.violetB;
  } else if (outside) {
    stateLabel = `En ${destination}`;
    stateColor = workshopColor;
    stateSoft = workshopSoft;
    stateBorder = workshopBorder;
  } else if (dependencies.length) {
    stateLabel = "Espera pasos anteriores";
    stateColor = C.red;
    stateSoft = C.redL;
    stateBorder = C.redB;
  } else if (pending) {
    stateLabel = "Listo para enviar";
    stateColor = C.blue;
    stateSoft = C.blueL;
    stateBorder = C.blueB;
  }

  const returnColor = received ? C.green : partial ? C.violet : C.dim;
  const returnSoft = received ? C.greenL : partial ? C.violetL : C.panel2;
  const returnBorder = received ? C.greenB : partial ? C.violetB : C.border;

  return (
    <div className="tor-journey-card" style={{
      display: "grid",
      alignContent: "start",
      gap: 10,
      minWidth: 0,
      padding: 11,
      borderRadius: 12,
      border: `1px solid ${current ? stateBorder : C.border}`,
      background: current ? stateSoft : C.panelSolid,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          color: current ? stateColor : C.dim,
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          Viaje {operation.viaje || index + 1}
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          minHeight: 23,
          padding: "2px 7px",
          borderRadius: 999,
          border: `1px solid ${stateBorder}`,
          background: stateSoft,
          color: stateColor,
          fontSize: 9.5,
          fontWeight: 850,
          whiteSpace: "nowrap",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateColor }} />
          {stateLabel}
        </span>
      </div>

      <div className="tor-journey-path">
        <span className="tor-route-node" style={{
          borderColor: originBorder,
          background: originSoft,
          color: originColor,
        }}>
          <MapPin size={11} /> {origin}
        </span>
        <ArrowRight size={12} style={{ color: C.dim, flexShrink: 0 }} />
        <span className="tor-route-node" style={{
          borderColor: outside || received ? workshopBorder : C.border,
          background: outside || received ? workshopSoft : C.panel2,
          color: outside || received ? workshopColor : C.dim,
        }}>
          <Wrench size={11} /> {destination}
        </span>
        <ArrowRight size={12} style={{ color: C.dim, flexShrink: 0 }} />
        <span className="tor-route-node" style={{
          borderColor: returnBorder,
          background: returnSoft,
          color: returnColor,
        }}>
          {received ? <Check size={11} /> : <MapPin size={11} />}
          Astillero
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 850, lineHeight: 1.35 }}>
          {operation.nombre}
        </div>
        {operation.descripcion && (
          <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 3 }}>
            {operation.descripcion}
          </div>
        )}
        {daysOutside != null && (
          <div style={{
            color: daysOutside >= 15 ? C.red : C.dim,
            fontSize: 10.5,
            fontWeight: daysOutside >= 15 ? 850 : 700,
            marginTop: 4,
          }}>
            Fuera del astillero hace {daysOutside} {daysOutside === 1 ? "día" : "días"}.
          </div>
        )}
        {dependencies.length > 0 && pending && (
          <div style={{ color: C.red, fontSize: 10.5, lineHeight: 1.4, marginTop: 4 }}>
            Antes debería volver: {dependencies.map((row) => row.nombre).join(", ")}.
          </div>
        )}
      </div>

      {actionLabel && (
        <button
          type="button"
          onClick={() => onMove(operation, null)}
          className="tor-route-action"
          style={{
            ...PRIMARY_BUTTON,
            width: "100%",
            minHeight: 36,
            marginTop: "auto",
            ...(outside ? {
              borderColor: C.violetB,
              background: C.violetL,
              color: C.violet,
            } : {}),
          }}
        >
          {outside ? <PackageOpen size={14} /> : <Truck size={14} />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function routeCurrentId(tramos) {
  return tramos.find((operation) => operation.estado !== "recibido")?.id || null;
}

function routeIsComplete(row) {
  return row.tramos.every((operation) => operation.estado === "recibido");
}

function RouteJourneyCards({ process, tramos, onMove }) {
  const currentId = routeCurrentId(tramos);
  return (
    <div className="tor-journey-grid">
      {tramos.map((operation, index) => (
        <JourneyCard
          key={operation.id}
          process={process}
          operation={operation}
          index={index}
          current={operation.id === currentId}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

function StandaloneRouteCard({ process, row, onMove }) {
  const { item, tramos } = row;
  const complete = routeIsComplete(row);
  return (
    <article className="tor-route-card" style={{
      display: "grid",
      gap: 11,
      padding: 12,
      borderRadius: 14,
      border: `1px solid ${complete ? C.greenB : C.border}`,
      background: complete ? C.greenL : C.panel,
      minWidth: 0,
    }}>
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 13.5, fontWeight: 900, lineHeight: 1.3 }}>
            {item.descripcion}
          </div>
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>
            {qty(item.cantidad)} {item.unidad} · {tramos.length === 1 ? "1 viaje" : `${tramos.length} viajes`}
          </div>
        </div>
        {complete && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.green, fontSize: 10.5, fontWeight: 850 }}>
            <Check size={13} /> Circuito completo
          </span>
        )}
      </div>
      <RouteJourneyCards process={process} tramos={tramos} onMove={onMove} />
    </article>
  );
}

function TransformationSource({ process, row, onMove }) {
  const complete = routeIsComplete(row);
  return (
    <div className="tor-transform-source" style={{
      display: "grid",
      gap: 9,
      minWidth: 0,
      padding: 10,
      borderRadius: 12,
      border: `1px solid ${complete ? C.greenB : C.border}`,
      background: complete ? C.greenL : C.panelSolid,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, lineHeight: 1.3 }}>
            {row.item.descripcion}
          </div>
          <div style={{ color: C.dim, fontSize: 10, marginTop: 2 }}>
            {qty(row.item.cantidad)} {row.item.unidad}
          </div>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          color: complete ? C.green : C.dim,
          fontSize: 9.5,
          fontWeight: 850,
        }}>
          {complete ? <Check size={11} /> : <Repeat size={11} />}
          {complete ? "Listo" : "En proceso"}
        </span>
      </div>
      <RouteJourneyCards process={process} tramos={row.tramos} onMove={onMove} />
    </div>
  );
}

function TransformationFlow({ process, result, sources, onMove }) {
  const sourcesReady = sources.length > 0 && sources.every(routeIsComplete);
  const resultReady = routeIsComplete(result);
  const complete = sourcesReady && resultReady;
  const pendingSources = sources.filter((row) => !routeIsComplete(row)).length;
  const resultItem = result.item;

  return (
    <article className="tor-transform-card" style={{
      display: "grid",
      gap: 11,
      padding: 12,
      borderRadius: 15,
      border: `1px solid ${complete ? C.greenB : C.blueB}`,
      background: complete ? C.greenL : C.panel,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>
              Formación de {resultItem.descripcion}
            </span>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 999,
              border: `1px solid ${C.blueB}`,
              background: C.blueL,
              color: C.blue,
              fontSize: 9,
              fontWeight: 900,
              textTransform: "uppercase",
            }}>
              <GitMerge size={10} /> {sources.length} componentes
            </span>
          </div>
          <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 3 }}>
            Los componentes completan su primer recorrido y convergen en un único ítem para el viaje siguiente.
          </div>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: complete ? C.green : sourcesReady ? C.blue : C.dim,
          fontSize: 10.5,
          fontWeight: 850,
        }}>
          {complete ? <Check size={13} /> : <GitMerge size={13} />}
          {complete ? "Circuito completo" : sourcesReady ? "Conjunto listo" : `${pendingSources} componente${pendingSources === 1 ? "" : "s"} pendiente${pendingSources === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="tor-transform-flow">
        <div style={{ display: "grid", alignContent: "start", gap: 7, minWidth: 0 }}>
          <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Preparación de componentes
          </div>
          <div className="tor-transform-sources">
            {sources.map((source) => (
              <TransformationSource
                key={source.item.id}
                process={process}
                row={source}
                onMove={onMove}
              />
            ))}
          </div>
        </div>

        {/* Solo la flecha: verde cuando los componentes ya completaron su recorrido. */}
        <div className="tor-transform-connector" style={{ color: sourcesReady ? C.green : C.dim }}>
          <ArrowRight className="tor-transform-arrow" size={18} />
        </div>

        <div style={{
          display: "grid",
          alignContent: "start",
          gap: 9,
          minWidth: 0,
          padding: 10,
          borderRadius: 13,
          border: `1px solid ${resultReady ? C.greenB : C.blueB}`,
          background: resultReady ? C.greenL : C.panelSolid,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.blue, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Conjunto resultante
              </div>
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 950, marginTop: 3 }}>
                {resultItem.descripcion}
              </div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                {qty(resultItem.cantidad)} {resultItem.unidad} · cantidad manual
              </div>
            </div>
            <Boxes size={17} style={{ color: resultReady ? C.green : C.blue, flexShrink: 0 }} />
          </div>
          {resultItem.requiere_confirmacion && !resultItem.confirmado_at && (
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "7px 8px",
              borderRadius: 8,
              border: `1px solid ${C.redB}`,
              background: C.redL,
              color: C.red,
              fontSize: 9.5,
              lineHeight: 1.35,
            }}>
              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
              Falta confirmar la cantidad resultante.
            </div>
          )}
          <RouteJourneyCards process={process} tramos={result.tramos} onMove={onMove} />
        </div>
      </div>
    </article>
  );
}

function RecorridosPorItem({ process, onMove, query = "" }) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  const items = (process.items || []).filter((row) => row.activo !== false);
  const itemRoutes = items
    .map((item) => {
      const tramos = operations
        .filter((op) => {
          const includesItem = (op.componentes || []).some((c) => c.item_id === item.id);
          if (!includesItem) return false;
          // En procesos anteriores, el viaje 2 todavia apunta a sus piezas de
          // origen. Lo ocultamos de esas rutas y lo mostramos como un conjunto
          // virtual para conservar el historial sin duplicar el viaje.
          return !RESULT_OPERATION_META[op.clave] || item.es_resultado;
        })
        .sort((a, b) => (a.viaje ?? 99) - (b.viaje ?? 99) || (a.orden ?? 0) - (b.orden ?? 0));
      return { ...item, item, tramos };
    })
    .filter((row) => row.tramos.length > 0);
  const legacyResultRoutes = operations
    .filter((operation) => {
      const meta = RESULT_OPERATION_META[operation.clave];
      return meta && !(operation.componentes || []).some((row) => row.item?.es_resultado);
    })
    .map((operation) => {
      const meta = RESULT_OPERATION_META[operation.clave];
      const sourceItems = (operation.componentes || []).map((row) => row.item).filter(Boolean);
      const virtualItem = {
        id: `resultado-${operation.id}`,
        clave: meta.clave,
        descripcion: meta.descripcion,
        grupo: meta.grupo,
        cantidad: Math.max(1, ...(operation.componentes || []).map((row) => Number(row.cantidad_requerida) || 0)),
        unidad: "conjunto",
        es_resultado: true,
        resultado_de: sourceItems.map((item) => item.clave),
        virtual: true,
      };
      return { ...virtualItem, item: virtualItem, tramos: [operation] };
    });
  const allRoutes = [...itemRoutes, ...legacyResultRoutes];
  const term = query.trim().toLowerCase();
  const matchesRoute = (row) => {
    const operationText = row.tramos
      .map((operation) => `${operation.nombre || ""} ${operation.descripcion || ""} ${workshopName(operation)}`)
      .join(" ");
    return `${row.item.descripcion || ""} ${row.item.grupo || ""} ${row.item.proveedor_compra || ""} ${operationText}`
      .toLowerCase()
      .includes(term);
  };
  const visibleGroups = groupRows(allRoutes)
    .map(([group, rows]) => {
      const results = rows.filter((row) => row.item.es_resultado && row.item.resultado_de?.length > 0);
      const claimedSourceKeys = new Set(results.flatMap((row) => row.item.resultado_de || []));
      const transformations = results.map((result) => ({
        type: "transformation",
        key: `transform-${result.item.id}`,
        result,
        sources: (result.item.resultado_de || [])
          .map((key) => rows.find((row) => row.item.clave === key))
          .filter(Boolean),
      }));
      const standalone = rows
        .filter((row) => !row.item.es_resultado && !claimedSourceKeys.has(row.item.clave))
        .map((row) => ({
          type: "standalone",
          key: `route-${row.item.id}`,
          row,
        }));
      const blocks = [...transformations, ...standalone];
      const visibleBlocks = term
        ? blocks.filter((block) => {
          if (block.type === "standalone") return matchesRoute(block.row);
          return matchesRoute(block.result) || block.sources.some(matchesRoute);
        })
        : blocks;
      return [group, visibleBlocks];
    })
    .filter(([, blocks]) => blocks.length > 0);

  if (!allRoutes.length) return null;
  if (!visibleGroups.length) {
    return (
      <div style={{
        display: "grid",
        placeItems: "center",
        gap: 8,
        padding: "34px 16px",
        borderRadius: 14,
        border: `1px dashed ${C.border}`,
        background: C.panel,
        color: C.dim,
        textAlign: "center",
      }}>
        <Search size={20} />
        <div style={{ color: C.muted, fontSize: 12.5, fontWeight: 850 }}>No encontramos ese material</div>
        <div style={{ fontSize: 11 }}>Probá con el nombre, el grupo o el taller.</div>
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: 13 }}>
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Circuito por material</div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>
            Cada viaje muestra su origen real y termina cuando el material vuelve al astillero.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          {[
            [C.blue, "Tornería"],
            [C.violet, "Plegadora"],
            [C.green, "En astillero"],
            [C.teal, "Origen proveedor"],
          ].map(([color, label]) => (
            <span key={label} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: C.dim,
              fontSize: 9.5,
              fontWeight: 750,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {visibleGroups.map(([group, blocks]) => {
        const completed = blocks.filter((block) => {
          if (block.type === "standalone") return routeIsComplete(block.row);
          return routeIsComplete(block.result) && block.sources.every(routeIsComplete);
        }).length;
        return (
          <section key={group} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: GROUP_COLORS[group] || C.dim,
              }} />
              <span style={{
                color: C.muted,
                fontSize: 10.5,
                fontWeight: 900,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
              }}>
                {group}
              </span>
              <span style={{ color: completed === blocks.length ? C.green : C.dim, fontSize: 10, fontWeight: 800 }}>
                {completed}/{blocks.length} circuitos completos
              </span>
            </div>

            {/* Las transformaciones van en su propia pila y las cards sueltas en
                su propio mosaico. Mezclarlas obligaba a la transformación a
                ocupar todos los tracks con grid-column: 1/-1, y eso impedía que
                auto-fit los colapsara: con 2 piezas sueltas en 3 tracks quedaban
                510px de aire al final de la fila. Separadas, el track sobrante
                colapsa y las cards se estiran a lo que hay. */}
            {blocks.some((block) => block.type === "transformation") && (
              <div style={{ display: "grid", gap: 10 }}>
                {blocks.filter((block) => block.type === "transformation").map((block) => (
                  <TransformationFlow
                    key={block.key}
                    process={process}
                    result={block.result}
                    sources={block.sources}
                    onMove={onMove}
                  />
                ))}
              </div>
            )}

            {blocks.some((block) => block.type === "standalone") && (
              <div className="tor-circuit-blocks">
                {blocks.filter((block) => block.type === "standalone").map((block) => (
                  <StandaloneRouteCard
                    key={block.key}
                    process={process}
                    row={block.row}
                    onMove={onMove}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}

function CircuitSearch({ value, onChange, compact = false }) {
  return (
    <div style={{ position: "relative" }}>
      <Search size={compact ? 14 : 15} style={{
        position: "absolute",
        left: compact ? 11 : 12,
        top: "50%",
        transform: "translateY(-50%)",
        color: C.dim,
        pointerEvents: "none",
      }} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar material, conjunto o taller…"
        aria-label="Buscar dentro del circuito"
        style={{
          width: "100%",
          minHeight: compact ? 36 : 42,
          borderRadius: compact ? 9 : 11,
          border: `1px solid ${value ? C.blueB : C.border}`,
          background: C.panelSolid,
          color: C.text,
          padding: value
            ? compact ? "6px 38px 6px 34px" : "8px 42px 8px 36px"
            : compact ? "6px 10px 6px 34px" : "8px 12px 8px 36px",
          outline: "none",
          fontSize: compact ? 11.5 : 12.5,
          fontFamily: C.sans,
          boxShadow: "0 8px 24px -24px var(--shadow-strong)",
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          style={{
            position: "absolute",
            right: 5,
            top: compact ? 5 : 6,
            width: compact ? 26 : 30,
            height: compact ? 26 : 30,
            display: "grid",
            placeItems: "center",
            borderRadius: 7,
            border: 0,
            background: C.panel2,
            color: C.dim,
            cursor: "pointer",
            fontSize: compact ? 16 : 18,
            fontFamily: C.sans,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function CircuitTab({
  process,
  onMove,
  onEditOperation,
  onNewOperation,
  onEditItem,
  search,
  onSearch,
  showSearch = true,
}) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  const [showManagement, setShowManagement] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {showSearch && <CircuitSearch value={search} onChange={onSearch} />}

      <RecorridosPorItem process={process} onMove={onMove} query={search} />

      <section style={{
        display: "grid",
        overflow: "hidden",
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        background: C.panel,
      }}>
        <button
          type="button"
          onClick={() => setShowManagement((value) => !value)}
          className="tor-management-toggle"
          aria-expanded={showManagement}
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "34px minmax(0,1fr) auto",
            alignItems: "center",
            gap: 10,
            padding: "11px 12px",
            border: 0,
            background: "transparent",
            color: C.text,
            textAlign: "left",
            cursor: "pointer",
            fontFamily: C.sans,
          }}
        >
          <span style={{
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.panel2,
            color: C.dim,
          }}>
            <Settings2 size={15} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 850 }}>
              Gestión de envíos y pasos
            </span>
            <span style={{ display: "block", color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 2 }}>
              Editar talleres, piezas, cantidades y movimientos anteriores.
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 10.5, fontWeight: 800 }}>
            {operations.length}
            <ChevronRight size={15} style={{
              transform: showManagement ? "rotate(90deg)" : "none",
              transition: "transform .16s ease",
            }} />
          </span>
        </button>

        {showManagement && (
          <div style={{
            display: "grid",
            gap: 14,
            padding: 12,
            borderTop: `1px solid ${C.border}`,
            background: C.panelSolid,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>Envíos configurados</div>
                <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.4, marginTop: 2 }}>
                  Un envío puede reunir varias piezas en el mismo viaje.
                </div>
              </div>
              <button type="button" onClick={onNewOperation} style={{ ...BUTTON, minHeight: 34, flexShrink: 0 }}>
                <Plus size={14} /> Paso
              </button>
            </div>

            {!operations.length ? (
              <EmptyCatalogHint />
            ) : groupRows(operations).map(([group, rows]) => (
              <section key={group} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: GROUP_COLORS[group] || C.dim,
                  }} />
                  <span style={{
                    color: C.muted,
                    fontSize: 10.5,
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>
                    {group}
                  </span>
                  <span style={{ color: C.dim, fontSize: 10 }}>
                    {rows.filter((row) => row.estado === "recibido").length}/{rows.length}
                  </span>
                </div>
                <div className="tor-operation-grid">
                  {rows.map((operation) => (
                    <OperationCard
                      key={operation.id}
                      process={process}
                      operation={operation}
                      onMove={onMove}
                      onEdit={onEditOperation}
                      onEditItem={onEditItem}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MaterialTab({ process, onEdit, onNew, onStatus, onConfirm }) {
  const items = (process.items || []).filter((row) => row.activo !== false);
  const itemsByKey = new Map(items.map((row) => [row.clave, row]));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Materiales del proceso</div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>
            Materiales comprados y conjuntos que se forman durante el circuito.
          </div>
        </div>
        <button type="button" onClick={onNew} style={{ ...BUTTON, flexShrink: 0 }}>
          <Plus size={14} /> Material
        </button>
      </div>
      {!items.length ? <EmptyCatalogHint /> : groupRows(items).map(([group, rows]) => (
        <section key={group} style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: GROUP_COLORS[group] || C.dim,
            }} />
            <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              {group}
            </span>
          </div>
          {rows.map((item) => {
            const unresolved = item.requiere_confirmacion && !item.confirmado_at;
            return (
              <div key={item.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 10,
                padding: 11,
                borderRadius: 12,
                border: `1px solid ${unresolved ? C.redB : C.border}`,
                background: unresolved ? C.redL : C.panel,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ color: C.text, fontSize: 12.5, fontWeight: 850 }}>{item.descripcion}</span>
                    {item.es_resultado ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: C.blue,
                        fontSize: 9.5,
                        fontWeight: 850,
                      }}>
                        <Boxes size={12} /> Conjunto resultante
                      </span>
                    ) : item.material_id ? (
                      <span title="Vinculado al catálogo" style={{ display: "inline-flex", color: C.green }}>
                        <Link2 size={12} />
                      </span>
                    ) : (
                      <span style={{ color: C.red, fontSize: 9.5, fontWeight: 800 }}>Sin catálogo</span>
                    )}
                  </div>
                  <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>
                    {qty(item.cantidad)} {item.unidad}
                    {item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}
                    {item.solicitado_por_torneria ? " · solicitado por Tornería" : ""}
                  </div>
                  {item.es_resultado && item.resultado_de?.length > 0 && (
                    <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4, marginTop: 5 }}>
                      Se arma con: {item.resultado_de
                        .map((key) => itemsByKey.get(key)?.descripcion || key)
                        .join(" + ")}
                    </div>
                  )}
                  {unresolved && (
                    <div style={{ color: C.red, fontSize: 10.5, lineHeight: 1.4, marginTop: 5 }}>
                      <b>Confirmar:</b> {item.alerta || "dato pendiente antes del envío."}
                    </div>
                  )}
                  {item.confirmado_at && (
                    <div style={{ color: C.green, fontSize: 10, marginTop: 5 }}>
                      Confirmado {fmtDate(item.confirmado_at)}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: 7 }}>
                  {item.es_resultado ? (
                    <span style={{
                      minHeight: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: `1px solid ${C.blueB}`,
                      background: C.blueL,
                      color: C.blue,
                      fontSize: 9.5,
                      fontWeight: 850,
                      whiteSpace: "nowrap",
                    }}>
                      Cantidad manual
                    </span>
                  ) : (
                    <select
                      value={item.compra_estado}
                      onChange={(event) => onStatus(item, event.target.value)}
                      style={{
                        minHeight: 30,
                        maxWidth: 128,
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.panelSolid,
                        color: C.muted,
                        padding: "4px 7px",
                        fontSize: 10.5,
                        fontFamily: C.sans,
                      }}
                    >
                      {PURCHASE_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: 5 }}>
                    {item.requiere_confirmacion && (
                      <button
                        type="button"
                        onClick={() => onConfirm(item, !item.confirmado_at)}
                        title={item.confirmado_at ? "Reabrir confirmación" : "Confirmar dato"}
                        style={{
                          ...BUTTON,
                          minHeight: 31,
                          padding: "4px 8px",
                          color: item.confirmado_at ? C.green : C.red,
                        }}
                      >
                        <Check size={12} />
                      </button>
                    )}
                    <button type="button" onClick={() => onEdit(item)} style={{ ...BUTTON, minHeight: 31, padding: "4px 8px" }}>
                      <Edit3 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function HistoryTab({ process, onOpenMovement }) {
  const movementEvents = (process.operaciones || []).flatMap((operation) =>
    (operation.movimientos || []).map((movement) => ({
      id: `movement-${movement.id}`,
      date: movement.fecha,
      title: movement.tipo === "salida" ? "Envío al taller" : "Regreso al astillero",
      description: operation.nombre,
      actor: movement.responsable || "Sin responsable",
      color: movement.tipo === "salida" ? C.blue : C.green,
      // El fondo va aparte porque no se puede derivar del color: son variables
      // CSS y no admiten alfa concatenado.
      soft: movement.tipo === "salida" ? C.blueL : C.greenL,
      movement,
      operation,
    })),
  );
  const auditEvents = (process.historial || [])
    .filter((event) => event.entidad !== "movimiento")
    .map((event) => {
      const labels = {
        items: "Material actualizado",
        operaciones: "Circuito actualizado",
        proceso: "Seguimiento actualizado",
      };
      return {
        id: `audit-${event.id}`,
        date: event.created_at,
        title: labels[event.entidad] || "Cambio registrado",
        description: event.accion,
        actor: event.actor?.username || "Usuario",
        color: C.violet,
        soft: C.violetL,
      };
    });
  const rows = [...movementEvents, ...auditEvents]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!rows.length) return <EmptyCatalogHint />;
  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ marginBottom: 5 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Registro de actividad</div>
        <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3 }}>
          Salidas, regresos y ediciones con usuario y fecha.
        </div>
      </div>
      {rows.slice(0, 120).map((event) => (
        <button
          key={event.id}
          type="button"
          disabled={!event.movement}
          onClick={() => event.movement && onOpenMovement(event.operation, event.movement)}
          style={{
            display: "grid",
            gridTemplateColumns: "30px minmax(0,1fr) auto",
            gap: 10,
            alignItems: "center",
            width: "100%",
            padding: 10,
            borderRadius: 11,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.text,
            textAlign: "left",
            cursor: event.movement ? "pointer" : "default",
          }}
        >
          <div style={{
            width: 30,
            height: 30,
            display: "grid",
            placeItems: "center",
            borderRadius: 9,
            background: event.soft ?? C.panel2,
            color: event.color,
          }}>
            {event.movement?.tipo === "salida" ? <ArrowRight size={14} /> : event.movement ? <ArrowLeft size={14} /> : <Edit3 size={14} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 11.5, fontWeight: 850 }}>{event.title}</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.description} · {event.actor}
            </div>
          </div>
          <span style={{ color: C.dim, fontSize: 9.5, whiteSpace: "nowrap" }}>{fmtDate(event.date)}</span>
        </button>
      ))}
    </div>
  );
}

function HelpModal({ onClose }) {
  const steps = [
    ["1", "Compra y llegada", "Actualizá cada material hasta “En astillero”. Por ahora es seguimiento manual."],
    ["2", "Salida parcial", "Entrá al paso, elegí Salida y cargá solamente las cantidades que realmente viajan."],
    ["3", "Regreso parcial", "Registrá lo que vuelve. El paso termina únicamente cuando regresaron todas las piezas."],
    ["4", "Conjuntos resultantes", "Núcleo+cachas forman Pata de gallo; pala+mecha forman Timón; bridas+caño forman Limera de timón. La cantidad final se carga manualmente."],
    ["5", "Origen proveedor", "Bulones y el lote de broncería/bujes se registran como Proveedor → Tornería → Astillero."],
    ["6", "Caso K55", "La Palma de pata de gallo vuelve de Tornería y después realiza otro viaje a Plegadora."],
    ["7", "Excepciones", "Se puede avanzar con pasos pendientes; aparece una advertencia y queda registro del usuario."],
  ];
  return (
    <Modal title="Cómo usar Tornería" subtitle="Guía breve para operar desde el celular." onClose={onClose}>
      <div style={{ display: "grid", gap: 9 }}>
        {steps.map(([number, title, text]) => (
          <div key={number} style={{
            display: "grid",
            gridTemplateColumns: "30px minmax(0,1fr)",
            gap: 10,
            padding: 11,
            borderRadius: 11,
            border: `1px solid ${C.border}`,
            background: C.panel,
          }}>
            <span style={{
              width: 30,
              height: 30,
              display: "grid",
              placeItems: "center",
              borderRadius: 9,
              background: C.blueL,
              color: C.blue,
              fontSize: 12,
              fontWeight: 900,
            }}>{number}</span>
            <div>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 850 }}>{title}</div>
              <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.45, marginTop: 2 }}>{text}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// Versión chip de los KPI para el header de escritorio: número + etiqueta en
// una sola pastilla clickeable, en vez de la fila de tarjetas de antes.
function KpiChip({ icon, value, label, color, activo = false, onClick }) {
  const tono = KPI_TONOS[color] ?? { soft: C.panel2, borde: C.border };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={`Ver sólo: ${label}`}
      className="tor-kpi"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 32,
        padding: "4px 11px",
        borderRadius: 999,
        border: `1px solid ${activo ? tono.borde : C.border}`,
        background: activo ? tono.soft : C.panel,
        cursor: "pointer",
        fontFamily: C.sans,
        flexShrink: 0,
      }}
    >
      {createElement(icon, { size: 13, style: { color, flexShrink: 0 } })}
      <span style={{ color: activo ? color : C.text, fontSize: 13, fontWeight: 900, fontFamily: C.mono }}>{value}</span>
      <span style={{ color: activo ? color : C.dim, fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

// Tablero transversal de escritorio: TODAS las piezas que están fuera del
// astillero (de todas las obras filtradas), agrupadas por taller y ordenadas
// por días afuera. Es la vista de destino del KPI "Fuera del astillero".
function TallerBoard({ processes, onSelectProcess, onMove }) {
  const rows = processes.flatMap((process) =>
    (process.operaciones || [])
      .filter((op) => op.activa !== false && ["enviado", "parcial"].includes(op.estado))
      .map((op) => {
        const lastOut = [...(op.movimientos || [])]
          .filter((movement) => movement.tipo === "salida")
          .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        return { process, op, dias: diasDesde(lastOut?.fecha) };
      }),
  ).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));

  if (!rows.length) {
    return (
      <div style={{
        display: "grid",
        placeItems: "center",
        gap: 9,
        padding: "48px 20px",
        borderRadius: 14,
        border: `1px dashed ${C.border}`,
        background: C.panel,
        color: C.dim,
        textAlign: "center",
      }}>
        <PackageCheck size={26} style={{ color: C.green }} />
        <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>No hay piezas fuera del astillero</div>
        <div style={{ fontSize: 11.5 }}>Cuando algo salga a Tornería o Plegadora, aparece acá con sus días afuera.</div>
      </div>
    );
  }

  const talleres = new Map();
  rows.forEach((row) => {
    const taller = workshopName(row.op);
    const list = talleres.get(taller) ?? [];
    list.push(row);
    talleres.set(taller, list);
  });

  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          width: 34,
          height: 34,
          display: "grid",
          placeItems: "center",
          borderRadius: 10,
          border: `1px solid ${C.violetB}`,
          background: C.violetL,
          color: C.violet,
          flexShrink: 0,
        }}>
          <Truck size={16} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Fuera del astillero ahora</div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
            Todas las piezas en taller, ordenadas por días afuera. Las de 15 días o más piden reclamo.
          </div>
        </div>
        <span style={{
          padding: "3px 10px",
          borderRadius: 999,
          border: `1px solid ${C.violetB}`,
          background: C.violetL,
          color: C.violet,
          fontSize: 11,
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}>
          {rows.length} afuera
        </span>
      </div>

      {[...talleres.entries()].map(([taller, list]) => (
        <section key={taller} style={{ display: "grid", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wrench size={12} style={{ color: C.dim }} />
            <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              {taller}
            </span>
            <span style={{ color: C.dim, fontSize: 10 }}>{list.length}</span>
          </div>
          {list.map(({ process, op, dias }) => {
            const piezas = (op.componentes || [])
              .map((row) => row.item?.descripcion)
              .filter(Boolean)
              .join(" + ");
            const demorada = dias != null && dias >= 15;
            return (
              <div
                key={op.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(90px,130px) minmax(0,1fr) auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${demorada ? C.redB : C.border}`,
                  background: demorada ? C.redL : C.panel,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {process.obra?.codigo || process.nombre}
                  </div>
                  <div style={{ color: C.dim, fontSize: 9.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {process.obra?.linea_nombre || "Sin línea"}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {piezas || op.nombre}
                    </span>
                    <StatusBadge status={op.estado} compact />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 10, flexWrap: "wrap" }}>
                    {dias != null && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: demorada ? C.red : C.dim,
                        fontWeight: demorada ? 900 : 700,
                      }}>
                        <Clock3 size={10} />
                        Fuera hace {dias} {dias === 1 ? "día" : "días"}
                      </span>
                    )}
                    <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.nombre}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectProcess(process.id)}
                  title="Abrir esta obra"
                  style={{ ...BUTTON, minHeight: 32, padding: "4px 10px", flexShrink: 0 }}
                >
                  Ver obra <ArrowRight size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(process, op)}
                  style={{
                    ...PRIMARY_BUTTON,
                    minHeight: 32,
                    padding: "4px 10px",
                    flexShrink: 0,
                    borderColor: C.violetB,
                    background: C.violetL,
                    color: C.violet,
                  }}
                >
                  <PackageOpen size={13} /> Registrar regreso
                </button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export default function TorneriaScreen({ profile, signOut }) {
  const { isMobile } = useResponsive(860);
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processes, setProcesses] = useState([]);
  const [obras, setObras] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(() => window.localStorage.getItem("torneria.proceso") || "");
  const [mobileList, setMobileList] = useState(true);
  const [mobileTopbarOpen, setMobileTopbarOpen] = useState(
    () => window.localStorage.getItem("torneria.mobileTopbar") !== "closed",
  );
  const [desktopCircuitFocus, setDesktopCircuitFocus] = useState(
    () => window.localStorage.getItem("torneria.desktopCircuitFocus") === "true",
  );
  const [tab, setTab] = useState("circuito");
  const [search, setSearch] = useState("");
  const [circuitSearch, setCircuitSearch] = useState("");
  const [status, setStatus] = useState("todos");
  // Filtro rápido que disparan los KPI. Es una dimensión aparte de `status`
  // porque los KPI no miden todos lo mismo: uno cuenta procesos, otro cuenta
  // operaciones fuera del astillero y otro ítems sin confirmar.
  const [vista, setVista] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async ({ quiet = false, preferId = null } = {}) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [context, rows] = await Promise.all([
        fetchTorneriaContexto(),
        fetchTorneriaProcesos(),
      ]);
      setObras(context.obras);
      setTemplates(context.plantillas);
      setProcesses(rows);
      const requested = preferId || window.localStorage.getItem("torneria.proceso") || "";
      const exists = rows.some((row) => row.id === requested);
      const nextId = exists ? requested : rows[0]?.id || "";
      setSelectedId(nextId);
      if (nextId) window.localStorage.setItem("torneria.proceso", nextId);
    } catch (loadError) {
      setError(loadError.message || "No se pudo cargar Tornería.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isMobile) return;
    window.localStorage.setItem("torneria.mobileTopbar", mobileTopbarOpen ? "open" : "closed");
  }, [isMobile, mobileTopbarOpen]);

  useEffect(() => {
    if (isMobile) return;
    window.localStorage.setItem("torneria.desktopCircuitFocus", desktopCircuitFocus ? "true" : "false");
  }, [desktopCircuitFocus, isMobile]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return processes.filter((process) => {
      if (status !== "todos" && process.estado !== status) return false;

      // El filtro del KPI se aplica sobre el proceso: "fuera del astillero" y
      // "por confirmar" dejan pasar el proceso si TIENE al menos una operación
      // o ítem en ese estado, que es lo que el mecánico está buscando.
      if (vista === "activos" && !["activo", "borrador", "pausado"].includes(process.estado)) return false;
      if (vista === "taller" && !process.operaciones.some((row) => ["enviado", "parcial"].includes(row.estado))) return false;
      if (vista === "confirmar" && !process.items.some(
        (item) => item.activo !== false && item.requiere_confirmacion && !item.confirmado_at,
      )) return false;
      if (vista === "completos" && processProgress(process) !== 100) return false;

      if (!term) return true;
      return `${process.obra?.codigo || ""} ${process.obra?.linea_nombre || ""} ${process.nombre || ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [processes, search, status, vista]);

  const selected = processes.find((row) => row.id === selectedId) || null;
  const stats = useMemo(() => {
    const active = processes.filter((row) => ["activo", "borrador", "pausado"].includes(row.estado));
    const workshop = processes.reduce(
      (sum, process) => sum + process.operaciones.filter((row) => ["enviado", "parcial"].includes(row.estado)).length,
      0,
    );
    const unresolved = processes.reduce(
      (sum, process) => sum + process.items.filter(
        (item) => item.activo !== false && item.requiere_confirmacion && !item.confirmado_at,
      ).length,
      0,
    );
    const completed = processes.filter((row) => processProgress(row) === 100).length;
    return { active: active.length, workshop, unresolved, completed };
  }, [processes]);

  function selectProcess(id) {
    setSelectedId(id);
    window.localStorage.setItem("torneria.proceso", id);
    setMobileList(false);
    setCircuitSearch("");
    if (isMobile) setMobileTopbarOpen(false);
  }

  async function createProcess(payload) {
    try {
      const id = await crearProcesoTorneria(payload);
      setModal(null);
      await load({ quiet: true, preferId: id });
      setMobileList(false);
      setCircuitSearch("");
      if (isMobile) setMobileTopbarOpen(false);
      toast.success("Seguimiento creado con el circuito de su línea.");
    } catch (createError) {
      toast.error(createError.message);
    }
  }

  // Borrar es irreversible y arrastra movimientos, fotos y remitos, así que
  // pide escribir el código de la obra: un "¿estás seguro?" se acepta sin leer,
  // y acá el costo de equivocarse es perder el historial entero.
  async function deleteProcess(process) {
    if (!process) return;
    const codigo = process.obra?.codigo || "";
    const escrito = window.prompt(
      `Esto borra TODO el seguimiento de tornería de ${codigo}:\n` +
      `· los pasos del circuito\n· las salidas y regresos\n· las fotos y remitos cargados\n\n` +
      `No se puede deshacer.\n\nEscribí "${codigo}" para confirmar:`
    );
    if (escrito === null) return;
    if (escrito.trim().toUpperCase() !== codigo.trim().toUpperCase()) {
      toast.error("El código no coincide. No se borró nada.");
      return;
    }
    try {
      await borrarProcesoTorneria(process.id);
      window.localStorage.removeItem("torneria.proceso");
      setSelectedId(null);
      setMobileList(true);
      await load({ quiet: true });
      toast.success(`Seguimiento de ${codigo} borrado.`);
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function saveProcess(patch) {
    try {
      await actualizarProceso(selected.id, patch);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Seguimiento actualizado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function saveItem(item, patch) {
    try {
      if (item?.id) await actualizarItem(item.id, patch);
      else await crearItem(selected.id, patch);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(item?.id ? "Material actualizado." : "Material agregado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function archiveCurrentItem(item) {
    const accepted = await confirm({
      title: "¿Archivar material?",
      message: "Dejará de aparecer en este proceso. El historial conservará el cambio.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await archivarItem(item.id);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Material archivado.");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function saveOperation(operation, payload) {
    try {
      await guardarOperacion({
        id: operation?.id || null,
        procesoId: selected.id,
        ...payload,
      });
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(operation?.id ? "Paso actualizado." : "Paso agregado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function archiveCurrentOperation(operation) {
    const accepted = await confirm({
      title: "¿Archivar paso?",
      message: "El paso dejará de contarse en el avance. Sus movimientos seguirán en el historial.",
      confirmLabel: "Archivar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await archivarOperacion(operation.id);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Paso archivado.");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  }

  async function saveMovement(operation, movement, payload) {
    try {
      const movimientoId = await guardarMovimiento({
        id: movement?.id || null,
        operacionId: operation.id,
        ...payload,
        fecha: payload.fecha ? new Date(payload.fecha).toISOString() : new Date().toISOString(),
      });
      if (payload.files?.length) {
        await subirArchivosMovimiento({
          procesoId: selected.id,
          movimientoId,
          files: payload.files,
        });
      }
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success(payload.tipo === "salida" ? "Salida registrada." : "Regreso registrado.");
    } catch (saveError) {
      toast.error(saveError.message);
    }
  }

  async function deleteMovement(movement) {
    const accepted = await confirm({
      title: "¿Eliminar movimiento?",
      message: "Se recalcularán automáticamente las cantidades del paso. La eliminación quedará registrada.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await eliminarMovimiento(movement, selected.id);
      setModal(null);
      await load({ quiet: true, preferId: selected.id });
      toast.success("Movimiento eliminado y avance recalculado.");
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function deleteFile(file) {
    const accepted = await confirm({
      title: "¿Eliminar archivo?",
      message: file.nombre,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      await eliminarArchivo(file);
      await load({ quiet: true, preferId: selected.id });
      setModal(null);
      toast.success("Archivo eliminado.");
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  }

  async function quickItemStatus(item, compraEstado) {
    try {
      await actualizarItem(item.id, { compra_estado: compraEstado });
      await load({ quiet: true, preferId: selected.id });
      toast.success("Estado de compra actualizado.");
    } catch (statusError) {
      toast.error(statusError.message);
    }
  }

  async function confirmItem(item, value) {
    try {
      await actualizarItem(item.id, {
        confirmado_at: value ? new Date().toISOString() : null,
        confirmado_por: value ? profile?.id || null : null,
      });
      await load({ quiet: true, preferId: selected.id });
      toast.success(value ? "Dato confirmado." : "Confirmación reabierta.");
    } catch (confirmError) {
      toast.error(confirmError.message);
    }
  }

  function openMovement(operation, movement = null) {
    setModal({ type: "movement", operation, movement });
  }

  const setupMissing = /torneria_|schema cache|does not exist|relation/i.test(error);
  const upgradeMissing = /es_resultado|resultado_de|origen/i.test(error);
  const selectedProgress = selected ? processProgress(selected) : 0;
  const selectedUnresolved = selected?.items.filter(
    (item) => item.activo !== false && item.requiere_confirmacion && !item.confirmado_at,
  ) || [];

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "grid",
      gridTemplateColumns: isMobile
        ? "1fr"
        : desktopCircuitFocus
          ? "minmax(0,1fr)"
          : "280px minmax(0,1fr)",
      overflow: "hidden",
      background: C.bg,
      color: C.text,
      fontFamily: C.sans,
    }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        .spin{animation:tor-spin .8s linear infinite}
        @keyframes tor-spin{to{transform:rotate(360deg)}}
        .tor-process-card,.tor-operation{transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease}
        .tor-process-card:hover{transform:translateY(-1px);border-color:var(--border-2)!important}
        .tor-operation:hover{border-color:var(--border-2)!important;box-shadow:0 10px 26px -24px var(--shadow-strong)}
        .tor-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .tor-route-card,.tor-journey-card{transition:border-color .16s ease,box-shadow .16s ease}
        .tor-route-card:hover{border-color:var(--border-2)!important;box-shadow:0 12px 30px -28px var(--shadow-strong)}
        /* auto-FIT y no auto-fill: auto-fill deja los tracks vacíos ocupando
           lugar, y con 2 viajes en una card ancha quedaba media card en blanco.
           auto-fit los colapsa y lo que hay se estira. */
        .tor-journey-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px}
        /* container-type para poder preguntar por el ancho REAL de la card. El
           media query de viewport se equivocaba: con el sidebar y la lista de
           obras abiertos, a 1400px de pantalla al circuito le quedan ~830px, el
           query no se activaba y el grid de 3 columnas se desbordaba. */
        .tor-transform-card{container-type:inline-size;transition:border-color .16s ease,box-shadow .16s ease}
        .tor-transform-card:hover{box-shadow:0 14px 34px -30px var(--shadow-strong)}
        /* Grid y no flex: el panel del conjunto es un track con ancho propio, así
           los componentes se quedan con TODO el resto en vez de cortarse a 380px
           y dejar el hueco a la derecha. */
        .tor-transform-flow{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(300px,420px);align-items:center;gap:12px;min-width:0}
        .tor-transform-connector{display:grid;place-items:center;align-self:center;padding:0 2px}
        /* Por debajo de esto no entran dos componentes al lado del conjunto: se
           apila y la flecha gira. */
        @container (max-width:960px){
          .tor-transform-flow{grid-template-columns:minmax(0,1fr);align-items:stretch}
          .tor-transform-connector{padding:3px 10px}
          .tor-transform-arrow{transform:rotate(90deg)}
        }
        /* Mosaico del circuito: las cards simples entran de a 2-4 por fila según
           el ancho disponible, para no dejar el slab gris a la derecha. */
        .tor-circuit-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:10px;align-items:start}
        /* Los componentes del conjunto se reparten el ancho en partes iguales. */
        .tor-transform-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:8px;align-items:start}
        .tor-journey-path{display:flex;align-items:center;gap:5px;min-width:0;overflow-x:auto;padding-bottom:2px}
        .tor-route-node{min-height:28px;display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:4px 7px;border:1px solid var(--border);border-radius:8px;font-size:9.5px;font-weight:850;white-space:nowrap}
        .tor-route-action,.tor-management-toggle{transition:filter .14s ease,transform .1s ease,background .14s ease}
        .tor-route-action:hover,.tor-management-toggle:hover{filter:brightness(1.05)}
        .tor-route-action:active{transform:scale(.985)}
        .tor-kpi{transition:border-color .14s ease,background .14s ease,transform .1s ease}
        .tor-kpi:hover{border-color:var(--border-2)}
        .tor-kpi:active{transform:scale(.97)}
        .tor-operation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        input:focus,select:focus,textarea:focus{border-color:var(--blue-border)!important}
        select option{background:var(--panel-solid);color:var(--text)}
        @media(max-width:1120px){.tor-operation-grid{grid-template-columns:1fr}}
        @media(max-width:620px){
          .tor-form-grid{grid-template-columns:1fr}
          .tor-form-grid>*{grid-column:1!important}
          .tor-operation-grid{grid-template-columns:1fr}
        }
      `}</style>

      {(isMobile || !desktopCircuitFocus) && <Sidebar profile={profile} signOut={signOut} />}

      <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{
          flexShrink: 0,
          display: "grid",
          gap: isMobile && !mobileTopbarOpen ? 0 : 10,
          padding: isMobile
            ? mobileTopbarOpen ? "12px 12px 10px 54px" : "8px 10px 8px 54px"
            : "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          background: C.topbarSoft,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}>
          {isMobile && !mobileTopbarOpen ? (
            <div style={{ minHeight: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              {!mobileList && selected ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileList(true)}
                    aria-label="Volver a las obras"
                    style={{ ...BUTTON, width: 34, minHeight: 34, padding: 0, flexShrink: 0 }}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: C.text,
                      fontSize: 14,
                      fontWeight: 950,
                    }}>
                      {selected.obra?.codigo}
                    </span>
                    <span style={{ color: C.blue, fontSize: 9.5, fontWeight: 850, whiteSpace: "nowrap" }}>
                      {selected.obra?.linea_nombre || "Sin línea"}
                    </span>
                  </div>
                  {selectedUnresolved.length > 0 && (
                    <span
                      title={`${selectedUnresolved.length} datos por confirmar`}
                      style={{
                        minWidth: 23,
                        height: 23,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 7,
                        border: `1px solid ${C.redB}`,
                        background: C.redL,
                        color: C.red,
                        fontSize: 9.5,
                        fontWeight: 900,
                      }}
                    >
                      {selectedUnresolved.length}
                    </span>
                  )}
                  <span style={{
                    color: selectedProgress === 100 ? C.green : C.blue,
                    fontSize: 10.5,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}>
                    {selectedProgress}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileTopbarOpen(true)}
                    aria-label="Mostrar resumen superior"
                    title="Mostrar resumen"
                    style={{ ...BUTTON, width: 34, minHeight: 34, padding: 0, flexShrink: 0 }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Wrench size={15} style={{ color: C.blue, flexShrink: 0 }} />
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Tornería</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileTopbarOpen(true)}
                    aria-label="Mostrar resumen superior"
                    title="Mostrar resumen"
                    style={{ ...BUTTON, width: 36, minHeight: 36, padding: 0, flexShrink: 0 }}
                  >
                    <ChevronDown size={15} />
                  </button>
                </>
              )}
            </div>
          ) : !isMobile ? (
            /* Escritorio: una sola fila. Título, KPI como chips clickeables y
               acciones. Antes eran dos filas (título + tarjetas KPI grandes). */
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 11,
                  border: `1px solid ${C.blueB}`,
                  background: C.blueL,
                  color: C.blue,
                }}>
                  <Wrench size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ margin: 0, color: C.text, fontSize: 18, lineHeight: 1.1, fontWeight: 900 }}>
                    Tornería
                  </h1>
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 2, whiteSpace: "nowrap" }}>
                    Materiales de Mecánica · salidas y regresos
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <KpiChip
                  icon={Factory} value={stats.active} label="En seguimiento" color={C.blue}
                  activo={vista === "activos"}
                  onClick={() => setVista((v) => (v === "activos" ? null : "activos"))}
                />
                <KpiChip
                  icon={Truck} value={stats.workshop} label="Fuera del astillero" color={C.violet}
                  activo={vista === "taller"}
                  onClick={() => setVista((v) => (v === "taller" ? null : "taller"))}
                />
                <KpiChip
                  icon={AlertTriangle} value={stats.unresolved} label="Por confirmar"
                  color={stats.unresolved ? C.red : C.green}
                  activo={vista === "confirmar"}
                  onClick={() => setVista((v) => (v === "confirmar" ? null : "confirmar"))}
                />
                <KpiChip
                  icon={PackageCheck} value={stats.completed} label="Completados" color={C.green}
                  activo={vista === "completos"}
                  onClick={() => setVista((v) => (v === "completos" ? null : "completos"))}
                />
                {vista && (
                  <button
                    type="button"
                    onClick={() => setVista(null)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      minHeight: 32, padding: "4px 11px", borderRadius: 999,
                      border: `1px solid ${C.blueB}`, background: C.blueL,
                      color: C.blue, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: C.sans,
                    }}
                  >
                    {filtered.length} de {processes.length} ✕
                  </button>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setDesktopCircuitFocus((focused) => !focused)}
                  title={desktopCircuitFocus ? "Volver a mostrar la navegación y las obras" : "Ocultar paneles y darle todo el ancho al circuito"}
                  style={{
                    ...BUTTON,
                    minHeight: 39,
                    color: desktopCircuitFocus ? C.blue : C.muted,
                    borderColor: desktopCircuitFocus ? C.blueB : C.border,
                    background: desktopCircuitFocus ? C.blueL : C.panel,
                  }}
                >
                  {desktopCircuitFocus ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                  {desktopCircuitFocus ? "Mostrar paneles" : "Enfocar circuito"}
                </button>
                <button type="button" onClick={() => setModal({ type: "help" })} aria-label="Ayuda" style={{ ...BUTTON, width: 39, padding: 0 }}>
                  <CircleHelp size={16} />
                </button>
                <button type="button" onClick={() => load()} aria-label="Actualizar" style={{ ...BUTTON, width: 39, padding: 0 }}>
                  <RefreshCw size={15} />
                </button>
                <button type="button" onClick={() => setModal({ type: "create" })} style={PRIMARY_BUTTON}>
                  <Plus size={15} /> Nuevo
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 11,
                    border: `1px solid ${C.blueB}`,
                    background: C.blueL,
                    color: C.blue,
                  }}>
                    <Wrench size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h1 style={{ margin: 0, color: C.text, fontSize: isMobile ? 17 : 19, lineHeight: 1.1, fontWeight: 900 }}>
                      Tornería
                    </h1>
                    <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Materiales de Mecánica · salidas y regresos al astillero
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!isMobile && (
                    <button
                      type="button"
                      onClick={() => setDesktopCircuitFocus((focused) => !focused)}
                      title={desktopCircuitFocus ? "Volver a mostrar la navegación y las obras" : "Ocultar paneles y darle todo el ancho al circuito"}
                      style={{
                        ...BUTTON,
                        minHeight: 39,
                        color: desktopCircuitFocus ? C.blue : C.muted,
                        borderColor: desktopCircuitFocus ? C.blueB : C.border,
                        background: desktopCircuitFocus ? C.blueL : C.panel,
                      }}
                    >
                      {desktopCircuitFocus ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                      {desktopCircuitFocus ? "Mostrar paneles" : "Enfocar circuito"}
                    </button>
                  )}
                  <button type="button" onClick={() => setModal({ type: "help" })} aria-label="Ayuda" style={{ ...BUTTON, width: 39, padding: 0 }}>
                    <CircleHelp size={16} />
                  </button>
                  <button type="button" onClick={() => load()} aria-label="Actualizar" style={{ ...BUTTON, width: 39, padding: 0 }}>
                    <RefreshCw size={15} />
                  </button>
                  {isMobile ? (
                    <button
                      type="button"
                      onClick={() => setMobileTopbarOpen(false)}
                      aria-label="Ocultar resumen superior"
                      title="Ocultar resumen"
                      style={{ ...BUTTON, width: 39, padding: 0 }}
                    >
                      <ChevronUp size={15} />
                    </button>
                  ) : (
                    <button type="button" onClick={() => setModal({ type: "create" })} style={PRIMARY_BUTTON}>
                      <Plus size={15} /> Nuevo
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: isMobile ? 5 : 7, paddingBottom: 1, overflowX: isMobile ? "visible" : "auto" }}>
                <Kpi
                  icon={Factory} value={stats.active} label={isMobile ? "Activos" : "En seguimiento"} color={C.blue}
                  compacto={isMobile} activo={vista === "activos"}
                  onClick={() => setVista((v) => (v === "activos" ? null : "activos"))}
                />
                <Kpi
                  icon={Truck} value={stats.workshop} label={isMobile ? "Afuera" : "Fuera del astillero"} color={C.violet}
                  compacto={isMobile} activo={vista === "taller"}
                  onClick={() => setVista((v) => (v === "taller" ? null : "taller"))}
                />
                <Kpi
                  icon={AlertTriangle} value={stats.unresolved} label="Por confirmar"
                  color={stats.unresolved ? C.red : C.green}
                  compacto={isMobile} activo={vista === "confirmar"}
                  onClick={() => setVista((v) => (v === "confirmar" ? null : "confirmar"))}
                />
                <Kpi
                  icon={PackageCheck} value={stats.completed} label={isMobile ? "Listos" : "Completados"} color={C.green}
                  compacto={isMobile} activo={vista === "completos"}
                  onClick={() => setVista((v) => (v === "completos" ? null : "completos"))}
                />
              </div>

              {vista && (
                <button
                  type="button"
                  onClick={() => setVista(null)}
                  style={{
                    marginTop: 7, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 11px", borderRadius: 999, border: `1px solid ${C.blueB}`, background: C.blueL,
                    color: C.blue, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: C.sans,
                  }}
                >
                  Mostrando {filtered.length} de {processes.length} · quitar filtro ✕
                </button>
              )}
            </>
          )}
        </header>

        {loading ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: C.dim }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
              <Loader2 className="spin" size={17} /> Cargando circuitos…
            </div>
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 20 }}>
            <div style={{
              width: "min(560px,100%)",
              display: "grid",
              gap: 12,
              padding: 18,
              borderRadius: 16,
              border: `1px solid ${C.redB}`,
              background: C.redL,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.red, fontSize: 14, fontWeight: 900 }}>
                <AlertTriangle size={18} />
                {setupMissing ? "Falta aplicar la migración de Tornería" : "No se pudo cargar el módulo"}
              </div>
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{error}</div>
              {setupMissing && (
                <code style={{ color: C.text, fontSize: 11, padding: 10, borderRadius: 9, background: C.panelSolid, overflowWrap: "anywhere" }}>
                  {upgradeMissing
                    ? "supabase/migrations/20260729150000_torneria_conjuntos_y_origenes.sql"
                    : "supabase/migrations/20260728230000_torneria_seguimiento.sql"}
                </code>
              )}
              <button type="button" onClick={() => load()} style={{ ...PRIMARY_BUTTON, width: "fit-content" }}>
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : desktopCircuitFocus
                ? "minmax(0,1fr)"
                : "260px minmax(0,1fr)",
          }}>
            <aside style={{
              minHeight: 0,
              overflow: "hidden",
              borderRight: isMobile ? "none" : `1px solid ${C.border}`,
              display: isMobile
                ? mobileList ? "block" : "none"
                : desktopCircuitFocus ? "none" : "block",
            }}>
              <ProcessList
                processes={filtered}
                selectedId={selectedId}
                search={search}
                setSearch={setSearch}
                status={status}
                setStatus={setStatus}
                onSelect={selectProcess}
                onNew={() => setModal({ type: "create" })}
              />
            </aside>

            <section style={{
              minWidth: 0,
              minHeight: 0,
              display: isMobile && mobileList ? "none" : "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}>
              {!isMobile && vista === "taller" ? (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
                  <TallerBoard
                    processes={filtered}
                    onSelectProcess={selectProcess}
                    onMove={(process, operation) => {
                      selectProcess(process.id);
                      openMovement(operation, null);
                    }}
                  />
                </div>
              ) : !selected ? (
                <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 20, color: C.dim, textAlign: "center" }}>
                  <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
                    <Factory size={30} />
                    <div style={{ fontSize: 13 }}>Creá o elegí una obra para comenzar.</div>
                    <button type="button" onClick={() => setModal({ type: "create" })} style={PRIMARY_BUTTON}>
                      <Plus size={15} /> Nuevo seguimiento
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {(isMobile && mobileTopbarOpen) && (
                  <div style={{
                    flexShrink: 0,
                    display: "grid",
                    gap: isMobile ? 7 : 10,
                    padding: isMobile ? "8px 10px" : "12px 16px",
                    borderBottom: `1px solid ${C.border}`,
                    background: C.panel,
                  }}>
                    <div style={{ display: "flex", alignItems: isMobile ? "center" : "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: isMobile ? "center" : "flex-start", gap: 8, minWidth: 0 }}>
                        {isMobile && (
                          <button
                            type="button"
                            onClick={() => setMobileList(true)}
                            aria-label="Volver a las obras"
                            style={{ ...BUTTON, width: 36, minHeight: 36, padding: 0, flexShrink: 0 }}
                          >
                            <ArrowLeft size={15} />
                          </button>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, flexWrap: "wrap" }}>
                            <span style={{ color: C.text, fontSize: isMobile ? 16 : 17, fontWeight: 950 }}>{selected.obra?.codigo}</span>
                            <span style={{ color: C.blue, fontSize: 10.5, fontWeight: 850 }}>
                              {selected.obra?.linea_nombre || "Sin línea"}
                            </span>
                            <span style={{ color: C.dim, fontSize: 10.5, display: isMobile ? "none" : "inline" }}>
                              {PROCESS_STATE[selected.estado] || selected.estado}
                            </span>
                          </div>
                          {!isMobile && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, color: C.dim, fontSize: 10.5, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> {selected.taller_torneria}</span>
                              {selected.responsable && <span>{selected.responsable}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setModal({ type: "process" })}
                          aria-label="Editar seguimiento"
                          style={{
                            ...BUTTON,
                            flexShrink: 0,
                            width: isMobile ? 36 : undefined,
                            minHeight: isMobile ? 36 : BUTTON.minHeight,
                            padding: isMobile ? 0 : BUTTON.padding,
                          }}
                        >
                          <Settings2 size={14} /> {!isMobile && "Editar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProcess(selected)}
                          title="Borrar todo el seguimiento de esta obra"
                          aria-label="Borrar seguimiento"
                          style={{
                            ...BUTTON,
                            flexShrink: 0,
                            width: isMobile ? 36 : undefined,
                            minHeight: isMobile ? 36 : BUTTON.minHeight,
                            padding: isMobile ? 0 : BUTTON.padding,
                            borderColor: C.redB, background: C.redL, color: C.red,
                          }}
                        >
                          <Trash2 size={14} /> {!isMobile && "Borrar"}
                        </button>
                      </div>
                    </div>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile && selectedUnresolved.length > 0
                        ? "minmax(0,1fr) auto auto"
                        : "minmax(0,1fr) auto",
                      gap: isMobile ? 7 : 10,
                      alignItems: "center",
                    }}>
                      <ProgressBar value={selectedProgress} color={selectedProgress === 100 ? C.green : C.blue} />
                      <span style={{ color: selectedProgress === 100 ? C.green : C.blue, fontSize: 11, fontWeight: 900 }}>{selectedProgress}%</span>
                      {isMobile && selectedUnresolved.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab("materiales");
                            setModal({ type: "item", item: selectedUnresolved[0] });
                          }}
                          aria-label={`${selectedUnresolved.length} datos por confirmar`}
                          style={{
                            minHeight: 30,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: `1px solid ${C.redB}`,
                            background: C.redL,
                            color: C.red,
                            cursor: "pointer",
                            fontSize: 9.5,
                            fontWeight: 850,
                            fontFamily: C.sans,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <AlertTriangle size={12} />
                          {selectedUnresolved.length} pendiente{selectedUnresolved.length === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                    {!isMobile && selectedUnresolved.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTab("materiales");
                          setModal({ type: "item", item: selectedUnresolved[0] });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          width: "fit-content",
                          padding: "6px 9px",
                          borderRadius: 9,
                          border: `1px solid ${C.redB}`,
                          background: C.redL,
                          color: C.red,
                          cursor: "pointer",
                          fontSize: 10.5,
                          fontWeight: 800,
                        }}
                      >
                        <AlertTriangle size={13} />
                        {selectedUnresolved.length} dato{selectedUnresolved.length === 1 ? "" : "s"} por confirmar
                      </button>
                    )}
                  </div>
                  )}

                  {/* Barra de obra slim (escritorio): toda la info del proceso en
                      una sola línea, en vez del panel grande de antes. */}
                  {!isMobile && (
                    <div style={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 16px",
                      borderBottom: `1px solid ${C.border}`,
                      background: C.panel,
                      flexWrap: "wrap",
                    }}>
                      <span style={{ color: C.text, fontSize: 15, fontWeight: 950, whiteSpace: "nowrap" }}>{selected.obra?.codigo}</span>
                      <span style={{ color: C.blue, fontSize: 10.5, fontWeight: 850, whiteSpace: "nowrap" }}>
                        {selected.obra?.linea_nombre || "Sin línea"}
                      </span>
                      <span style={{ color: C.dim, fontSize: 10.5, whiteSpace: "nowrap" }}>
                        {PROCESS_STATE[selected.estado] || selected.estado}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.dim, fontSize: 10.5, whiteSpace: "nowrap" }}>
                        <MapPin size={11} /> {selected.taller_torneria}
                      </span>
                      {selected.responsable && (
                        <span style={{ color: C.dim, fontSize: 10.5, whiteSpace: "nowrap" }}>{selected.responsable}</span>
                      )}
                      <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <ProgressBar value={selectedProgress} color={selectedProgress === 100 ? C.green : C.blue} />
                        </div>
                        <span style={{ color: selectedProgress === 100 ? C.green : C.blue, fontSize: 11, fontWeight: 900 }}>
                          {selectedProgress}%
                        </span>
                      </div>
                      {selectedUnresolved.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab("materiales");
                            setModal({ type: "item", item: selectedUnresolved[0] });
                          }}
                          style={{ ...BUTTON, minHeight: 30, padding: "4px 9px", borderColor: C.redB, background: C.redL, color: C.red, fontSize: 10.5 }}
                        >
                          <AlertTriangle size={12} /> {selectedUnresolved.length} por confirmar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setModal({ type: "process" })}
                        aria-label="Editar seguimiento"
                        style={{ ...BUTTON, minHeight: 32, width: 34, padding: 0 }}
                      >
                        <Settings2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProcess(selected)}
                        title="Borrar todo el seguimiento de esta obra"
                        aria-label="Borrar seguimiento"
                        style={{ ...BUTTON, minHeight: 32, width: 34, padding: 0, borderColor: C.redB, background: C.redL, color: C.red }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}

                  <div style={{
                    flexShrink: 0,
                    display: "flex",
                    gap: 5,
                    padding: isMobile ? "6px 8px" : "7px 10px",
                    borderBottom: `1px solid ${C.border}`,
                    overflowX: "auto",
                  }}>
                    {TABS.map(([value, label, TabIcon]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTab(value)}
                        style={{
                          ...BUTTON,
                          minHeight: isMobile ? 38 : 34,
                          flex: isMobile ? "1 1 0" : undefined,
                          flexShrink: isMobile ? 1 : 0,
                          padding: "5px 10px",
                          color: tab === value ? C.blue : C.dim,
                          borderColor: tab === value ? C.blueB : "transparent",
                          background: tab === value ? C.blueL : "transparent",
                        }}
                      >
                        {createElement(TabIcon, { size: 13 })} {label}
                      </button>
                    ))}
                  </div>

                  {isMobile && tab === "circuito" && (
                    <div style={{
                      flexShrink: 0,
                      padding: "6px 8px",
                      borderBottom: `1px solid ${C.border}`,
                      background: C.panel,
                    }}>
                      <CircuitSearch value={circuitSearch} onChange={setCircuitSearch} compact />
                    </div>
                  )}

                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 10 : 16 }}>
                    {tab === "circuito" && (
                      <CircuitTab
                        key={selected.id}
                        process={selected}
                        onMove={openMovement}
                        onEditOperation={(operation) => setModal({ type: "operation", operation })}
                        onNewOperation={() => setModal({ type: "operation", operation: null })}
                        onEditItem={(item) => setModal({ type: "item", item })}
                        search={circuitSearch}
                        onSearch={setCircuitSearch}
                        showSearch={!isMobile}
                      />
                    )}
                    {tab === "materiales" && (
                      <MaterialTab
                        process={selected}
                        onEdit={(item) => setModal({ type: "item", item })}
                        onNew={() => setModal({ type: "item", item: null })}
                        onStatus={quickItemStatus}
                        onConfirm={confirmItem}
                      />
                    )}
                    {tab === "historial" && (
                      <HistoryTab process={selected} onOpenMovement={openMovement} />
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      {modal?.type === "create" && (
        <CrearProcesoModal
          obras={obras}
          plantillas={templates}
          procesos={processes}
          onClose={() => setModal(null)}
          onCreate={createProcess}
        />
      )}
      {modal?.type === "process" && selected && (
        <ProcesoModal proceso={selected} onClose={() => setModal(null)} onSave={saveProcess} />
      )}
      {modal?.type === "item" && selected && (
        <ItemModal
          item={modal.item}
          proceso={selected}
          onClose={() => setModal(null)}
          onSave={(patch) => saveItem(modal.item, patch)}
          onArchive={() => archiveCurrentItem(modal.item)}
        />
      )}
      {modal?.type === "operation" && selected && (
        <OperacionModal
          operacion={modal.operation}
          proceso={selected}
          onClose={() => setModal(null)}
          onSave={(payload) => saveOperation(modal.operation, payload)}
          onArchive={() => archiveCurrentOperation(modal.operation)}
        />
      )}
      {modal?.type === "movement" && selected && (
        <MovimientoModal
          operacion={modal.operation}
          movimiento={modal.movement}
          dependenciasPendientes={dependencyRows(selected, modal.operation)}
          onClose={() => setModal(null)}
          onSave={(payload) => saveMovement(modal.operation, modal.movement, payload)}
          onDelete={() => deleteMovement(modal.movement)}
          onDeleteFile={deleteFile}
        />
      )}
      {modal?.type === "help" && <HelpModal onClose={() => setModal(null)} />}

      {/* Acción principal al alcance del pulgar. Los mecánicos entran desde el
          celular y con una mano; un botón arriba a la derecha queda lejos. */}
      {isMobile && !modal && (
        <button
          type="button"
          onClick={() => setModal({ type: "create" })}
          aria-label="Nuevo seguimiento"
          style={{
            position: "fixed", right: 18, bottom: 22, zIndex: 60,
            width: 54, height: 54, borderRadius: 999, border: "none",
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff",
            boxShadow: "0 10px 26px -8px rgba(37,99,235,.6)",
          }}
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
