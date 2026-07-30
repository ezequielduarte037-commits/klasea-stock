import { Fragment, createElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Boxes, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, Clock3,
  Edit3, Factory, FileText, GitMerge, History, LayoutDashboard, Link2, Loader2,
  MapPin, PackageCheck, PackageOpen, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Repeat, Search,
  Settings2, ShoppingCart, Trash2, Truck, Wrench,
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
  marcarNoLleva,
  subirArchivosMovimiento,
  vincularItemsAPedidoCompra,
} from "./torneriaApi";
import PedirAComprasModal from "@/features/compras/PedirAComprasModal";
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

function diasEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  const a = new Date(desde);
  const b = new Date(hasta);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_DIA));
}

// El tramo de compra no aplica en dos casos, y son los dos que pidió el usuario:
// los conjuntos (no se compran, se forman de sus componentes) y los materiales
// que arrancan en un proveedor, que van del proveedor derecho al taller y nunca
// paran en el astillero.
function compraAplica(item, tramos = []) {
  if (!item || item.es_resultado || item.no_lleva) return false;
  if (item.compra_estado === "no_aplica") return false;
  const origen = String(tramos[0]?.origen || "Astillero").trim().toLowerCase();
  return origen === "astillero";
}

// Cuándo el material dejó de esperar en el astillero: su primera salida real.
function primeraSalida(tramos = []) {
  return tramos
    .flatMap((operation) => (operation.movimientos || [])
      .filter((movement) => movement.tipo === "salida")
      .map((movement) => movement.fecha))
    .filter(Boolean)
    .sort()[0] || null;
}

// La descripción con la que el material sale al pedido. Si está vinculado al
// catálogo va el nombre del catálogo con su código: "Nucleo de pata de gallo" es
// cómo lo llamamos acá adentro, al proveedor hay que pedirle el material como
// figura en el catálogo.
//
// Vive en una sola función porque se usa dos veces: para armar el pedido y
// después para reconocer cada ítem creado y vincularlo. Si los dos lados armaran
// el texto por separado, cualquier cambio los desincroniza y el vínculo por ítem
// se pierde en silencio.
function descripcionParaCompras(item) {
  const cat = item.material || null;
  return cat
    ? [cat.codigo, cat.descripcion].filter(Boolean).join(" — ")
    : item.descripcion;
}

// Nombre real del insumo en el catálogo. El nombre grande sigue siendo el que
// usa Mecánica dentro del circuito ("Núcleo para pata de gallo", por ejemplo);
// este segundo renglón aclara sutilmente qué producto físico hay que comprar.
function CatalogTechnicalName({ item, compact = false }) {
  const material = item?.material || null;
  if (!material?.descripcion && !material?.codigo) return null;
  return (
    <div
      title="Nombre técnico vinculado desde el catálogo de pañol"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        marginTop: compact ? 2 : 4,
        color: C.dim,
        fontSize: compact ? 9 : 9.5,
        lineHeight: 1.25,
      }}
    >
      <Link2 size={compact ? 9 : 10} style={{ flexShrink: 0, color: C.green }} />
      <span style={{ flexShrink: 0, fontWeight: 800 }}>Catálogo</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {[material.codigo, material.descripcion].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
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
    (item) => item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at,
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
                <CatalogTechnicalName item={row.item} compact />
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

//
// Los colores siguen la semántica del resto de la app: cyan es "falta hacer",
// azul es "en curso", violeta es "casi", verde es "listo". El rojo queda para lo
// que está bloqueado — "sin pedir" no es un error, es una tarea.
const COMPRA_META = {
  pendiente_solicitud: { label: "Sin pedir", color: C.cyan, soft: C.cyanL, borde: C.cyanB, paso: 0 },
  solicitado: { label: "Pedido", color: C.blue, soft: C.blueL, borde: C.blueB, paso: 1 },
  comprado: { label: "Comprado", color: C.violet, soft: C.violetL, borde: C.violetB, paso: 2 },
  recibido_astillero: { label: "En astillero", color: C.green, soft: C.greenL, borde: C.greenB, paso: 3 },
};

function routeIsComplete(row) {
  return row.tramos.every((operation) => operation.estado === "recibido");
}

// Cadena completa del circuito de un material, en un solo riel:
//
//   Compras → Comprado → Astillero → Tornería → ⌂ → Tornería → ⌂
//
// Antes cada tramo era una card aparte y una pieza con dos viajes ocupaba tres
// cards para contar un solo recorrido. El astillero al que vuelve después de
// cada viaje va como nodo compacto: se repite en cada vuelta y escribirlo entero
// tres veces empujaba el riel fuera de la card.
function circuitoNodos({ item, tramos, conCompra }) {
  const nodos = [];
  const compraPaso = conCompra
    ? (COMPRA_META[item.compra_estado] ?? COMPRA_META.pendiente_solicitud).paso
    : 3; // sin tramo de compra, el material ya está donde tiene que estar

  if (conCompra) {
    nodos.push({
      key: "compras",
      label: "Compras",
      Icon: ShoppingCart,
      activo: compraPaso >= 1,
      color: C.cyan, soft: C.cyanL, borde: C.cyanB,
    });
    nodos.push({
      key: "comprado",
      label: "Comprado",
      Icon: PackageCheck,
      activo: compraPaso >= 2,
      color: C.violet, soft: C.violetL, borde: C.violetB,
      railHecho: compraPaso >= 2,
      railCurso: compraPaso === 1,
      railColor: C.cyan,
    });
  }

  // Base del circuito: el astillero, o el proveedor cuando la pieza arranca ahí.
  const origen = String(tramos[0]?.origen || "Astillero").trim();
  const desdeProveedor = origen.toLowerCase() !== "astillero";
  nodos.push({
    key: "base",
    label: origen,
    Icon: desdeProveedor ? Factory : MapPin,
    activo: compraPaso >= 3,
    color: desdeProveedor ? C.teal : C.green,
    soft: desdeProveedor ? C.tealL : C.greenL,
    borde: desdeProveedor ? C.tealB : C.greenB,
    railHecho: compraPaso >= 3,
    railCurso: conCompra && compraPaso === 2,
    railColor: C.violet,
  });

  tramos.forEach((operation, i) => {
    const afuera = ["enviado", "parcial"].includes(operation.estado);
    const recibido = operation.estado === "recibido";
    const taller = operation.tipo === "plegadora" ? C.violet : C.blue;
    const tallerSoft = operation.tipo === "plegadora" ? C.violetL : C.blueL;
    const tallerBorde = operation.tipo === "plegadora" ? C.violetB : C.blueB;
    const salioAlguna = afuera || recibido;

    nodos.push({
      key: `taller-${operation.id}`,
      label: workshopName(operation),
      viaje: operation.viaje || i + 1,
      Icon: Wrench,
      activo: salioAlguna,
      color: taller, soft: tallerSoft, borde: tallerBorde,
      railHecho: salioAlguna,
      // El riel barre sólo si la pieza puede salir ahora: con el material sin
      // llegar no hay nada en movimiento.
      railCurso: operation.estado === "pendiente" && compraPaso >= 3,
      railColor: taller,
    });

    nodos.push({
      key: `vuelta-${operation.id}`,
      label: "Astillero",
      Icon: recibido ? Check : MapPin,
      compacto: true,
      activo: recibido,
      color: recibido ? C.green : operation.estado === "parcial" ? C.violet : C.dim,
      soft: recibido ? C.greenL : operation.estado === "parcial" ? C.violetL : C.panel2,
      borde: recibido ? C.greenB : operation.estado === "parcial" ? C.violetB : C.border,
      railHecho: recibido,
      railCurso: afuera,
      railColor: recibido ? C.green : taller,
    });
  });

  return nodos;
}

function CircuitoRail({ nodos }) {
  return (
    <div className="tor-journey-path">
      {nodos.map((nodo) => {
        const Icon = nodo.Icon;
        return (
          <Fragment key={nodo.key}>
            {nodo.railColor !== undefined && (
              <span
                className="tor-rail"
                data-hecho={nodo.railHecho ? "1" : "0"}
                data-curso={nodo.railCurso ? "1" : "0"}
                style={{ color: nodo.railColor }}
              />
            )}
            <span
              className="tor-route-node"
              title={nodo.compacto ? nodo.label : undefined}
              style={{
                borderColor: nodo.activo ? nodo.borde : C.border,
                background: nodo.activo ? nodo.soft : C.panel2,
                color: nodo.activo ? nodo.color : C.dim,
                padding: nodo.compacto ? "4px 6px" : "4px 8px",
              }}
            >
              <Icon size={11} />
              {!nodo.compacto && nodo.label}
              {nodo.viaje ? <span style={{ opacity: 0.7 }}>{nodo.viaje}</span> : null}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

// Dónde está parado el circuito ahora. Es lo único accionable, así que la card
// muestra un solo detalle y un solo botón en vez de uno por tramo.
function tramoActual({ process, item, tramos, conCompra }) {
  const compraPaso = conCompra
    ? (COMPRA_META[item.compra_estado] ?? COMPRA_META.pendiente_solicitud).paso
    : 3;
  if (conCompra && compraPaso < 3) return { tipo: "compra", compraPaso };
  const operation = tramos.find((row) => row.estado !== "recibido");
  if (!operation) return { tipo: "listo" };
  return { tipo: "viaje", operation, dependencias: dependencyRows(process, operation) };
}

function TramoActual({ process, item, tramos, conCompra, onMove, onPedirCompra }) {
  const actual = tramoActual({ process, item, tramos, conCompra });
  const salida = primeraSalida(tramos);
  const diasCompra = diasEntre(item.solicitado_at, item.recibido_astillero_at);
  const diasEspera = diasEntre(item.recibido_astillero_at, salida);

  // Los tiempos de compra se muestran siempre que existan, incluso con el
  // circuito terminado: es el dato que sirve para presupuestar la próxima obra.
  const tiempos = (
    <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
      {diasCompra != null && (
        <span style={{ color: C.muted, fontSize: 10.5, fontWeight: 700 }}>
          Compra: {diasCompra} {diasCompra === 1 ? "día" : "días"}
        </span>
      )}
      {diasEspera != null && (
        <span style={{ color: C.dim, fontSize: 10.5 }}>
          Esperó {diasEspera} {diasEspera === 1 ? "día" : "días"} antes de salir
        </span>
      )}
    </div>
  );

  if (actual.tipo === "listo") {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.green, fontSize: 11.5, fontWeight: 850 }}>
          <Check size={13} /> Circuito completo
        </span>
        {tiempos}
      </div>
    );
  }

  if (actual.tipo === "compra") {
    const meta = COMPRA_META[item.compra_estado] ?? COMPRA_META.pendiente_solicitud;
    const diasPidiendo = diasDesde(item.solicitado_at);
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, minHeight: 23,
            padding: "2px 8px", borderRadius: 999,
            border: `1px solid ${meta.borde}`, background: meta.soft, color: meta.color,
            fontSize: 9.5, fontWeight: 850, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
            {meta.label}
          </span>
          {item.proveedor_compra && (
            <span style={{ color: C.muted, fontSize: 11, fontWeight: 800 }}>{item.proveedor_compra}</span>
          )}
          {/* Un pedido que lleva mucho sin llegar es el dato que dispara el reclamo. */}
          {diasPidiendo != null && (
            <span style={{
              color: diasPidiendo >= 15 ? C.red : C.dim,
              fontSize: 10.5,
              fontWeight: diasPidiendo >= 15 ? 850 : 700,
            }}>
              Pedido hace {diasPidiendo} {diasPidiendo === 1 ? "día" : "días"}
            </span>
          )}
        </div>
        {item.compra_estado === "pendiente_solicitud" && onPedirCompra && (
          <button
            type="button"
            onClick={() => onPedirCompra([item])}
            className="tor-route-action"
            style={{ ...PRIMARY_BUTTON, width: "100%", minHeight: 36 }}
          >
            <ShoppingCart size={14} /> Pedir a compras
          </button>
        )}
      </div>
    );
  }

  const { operation, dependencias } = actual;
  const afuera = ["enviado", "parcial"].includes(operation.estado);
  const parcial = operation.estado === "parcial";
  const destino = workshopName(operation);
  const tallerColor = operation.tipo === "plegadora" ? C.violet : C.blue;
  const ultimaSalida = [...(operation.movimientos || [])]
    .filter((movement) => movement.tipo === "salida")
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  const diasAfuera = afuera ? diasDesde(ultimaSalida?.fecha) : null;

  let label = "Listo para enviar";
  let color = C.blue;
  let soft = C.blueL;
  let borde = C.blueB;
  if (parcial) {
    label = "Regreso parcial"; color = C.violet; soft = C.violetL; borde = C.violetB;
  } else if (afuera) {
    label = `En ${destino}`; color = tallerColor;
    soft = operation.tipo === "plegadora" ? C.violetL : C.blueL;
    borde = operation.tipo === "plegadora" ? C.violetB : C.blueB;
  } else if (dependencias.length) {
    label = "Espera pasos anteriores"; color = C.red; soft = C.redL; borde = C.redB;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, minHeight: 23,
          padding: "2px 8px", borderRadius: 999,
          border: `1px solid ${borde}`, background: soft, color,
          fontSize: 9.5, fontWeight: 850, whiteSpace: "nowrap",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
          Viaje {operation.viaje || 1} · {label}
        </span>
        {operation.nombre && (
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 750 }}>{operation.nombre}</span>
        )}
        {diasAfuera != null && (
          <span style={{
            color: diasAfuera >= 15 ? C.red : C.dim,
            fontSize: 10.5,
            fontWeight: diasAfuera >= 15 ? 850 : 700,
          }}>
            Afuera hace {diasAfuera} {diasAfuera === 1 ? "día" : "días"}
          </span>
        )}
      </div>

      {dependencias.length > 0 && (
        <div style={{ color: C.red, fontSize: 10.5, lineHeight: 1.4 }}>
          Antes debería volver: {dependencias.map((row) => row.nombre).join(", ")}.
        </div>
      )}

      {tiempos}

      <button
        type="button"
        onClick={() => onMove(operation, null)}
        className="tor-route-action"
        style={{
          ...PRIMARY_BUTTON,
          width: "100%",
          minHeight: 36,
          ...(afuera ? { borderColor: C.violetB, background: C.violetL, color: C.violet } : {}),
        }}
      >
        {afuera ? <PackageOpen size={14} /> : <Truck size={14} />}
        {afuera ? "Registrar regreso" : "Registrar salida"}
      </button>
    </div>
  );
}

// Un material = una card = un circuito. Rail arriba, el tramo donde está parado
// abajo, un solo botón.
function CircuitoMaterial({ process, item, tramos, onMove, onPedirCompra, tono = null }) {
  const conCompra = compraAplica(item, tramos);
  const nodos = circuitoNodos({ item, tramos, conCompra });
  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <CircuitoRail nodos={nodos} />
      <TramoActual
        process={process}
        item={item}
        tramos={tramos}
        conCompra={conCompra}
        onMove={onMove}
        onPedirCompra={onPedirCompra}
      />
      {tono}
    </div>
  );
}
function StandaloneRouteCard({ process, row, onMove, index = 0, onPedirCompra = null }) {
  const { item, tramos } = row;
  const complete = routeIsComplete(row);
  // La pieza está afuera si alguno de sus tramos está en el taller. Da el color
  // de la espina, que es lo único que se lee sin acercarse a la pantalla.
  const outside = tramos.some((op) => ["enviado", "parcial"].includes(op.estado));
  const spine = complete ? C.green : outside ? C.violet : C.blue;
  return (
    <article className="tor-route-card" style={{
      position: "relative",
      display: "grid",
      gap: 11,
      padding: 12,
      paddingLeft: 15,
      borderRadius: 14,
      border: `1px solid ${complete ? C.greenB : C.border}`,
      background: complete ? C.greenL : C.panel,
      minWidth: 0,
      overflow: "hidden",
      // Escalonado corto: da sensación de armado sin hacer esperar a nadie.
      animationDelay: `${Math.min(index, 6) * 35}ms`,
    }}>
      <span style={{
        position: "absolute",
        left: 0,
        top: 11,
        bottom: 11,
        width: 3,
        borderRadius: "0 3px 3px 0",
        background: spine,
      }} />
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
          <CatalogTechnicalName item={item} />
          <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>
            {qty(item.cantidad)} {item.unidad} · {tramos.length === 1 ? "1 viaje" : `${tramos.length} viajes`}
          </div>
        </div>
      </div>
      <CircuitoMaterial
        process={process}
        item={item}
        tramos={tramos}
        onMove={onMove}
        onPedirCompra={onPedirCompra}
      />
    </article>
  );
}

function TransformationSource({ process, row, onMove, onPedirCompra = null }) {
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
          <CatalogTechnicalName item={row.item} compact />
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
      <CircuitoMaterial
        process={process}
        item={row.item}
        tramos={row.tramos}
        onMove={onMove}
        onPedirCompra={onPedirCompra}
      />
    </div>
  );
}

function TransformationFlow({ process, result, sources, onMove, onPedirCompra = null }) {
  const sourcesReady = sources.length > 0 && sources.every(routeIsComplete);
  const resultHasJourney = result.tramos.length > 0;
  const resultReady = resultHasJourney ? routeIsComplete(result) : sourcesReady;
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
                onPedirCompra={onPedirCompra}
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
              <CatalogTechnicalName item={resultItem} compact />
              <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                {qty(resultItem.cantidad)} {resultItem.unidad} · {resultItem.requiere_confirmacion ? "cantidad manual" : "cantidad definida"}
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
          {/* El conjunto no se compra, así que su circuito no lleva tramo de
              compra: compraAplica lo descarta por es_resultado. */}
          {resultHasJourney ? (
            <CircuitoMaterial
              process={process}
              item={resultItem}
              tramos={result.tramos}
              onMove={onMove}
            />
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 9px",
              borderRadius: 9,
              border: `1px solid ${sourcesReady ? C.greenB : C.border}`,
              background: sourcesReady ? C.greenL : C.panel2,
              color: sourcesReady ? C.green : C.dim,
              fontSize: 10.5, fontWeight: 800,
            }}>
              {sourcesReady ? <Check size={13} /> : <GitMerge size={13} />}
              {sourcesReady ? "Resultado terminado en el astillero" : "Se forma cuando regresan todos los componentes"}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RecorridosPorItem({ process, onMove, query = "", onPedirCompra = null }) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  // Lo que esta obra no lleva no entra al circuito: queda a la vista en
  // Materiales, tachado, para que se sepa que fue una decisión.
  const items = (process.items || []).filter((row) => row.activo !== false && !row.no_lleva);
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
    .filter((row) => row.tramos.length > 0 || (row.item.es_resultado && row.item.resultado_de?.length > 0));
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
    return `${row.item.descripcion || ""} ${row.item.grupo || ""} ${row.item.proveedor_compra || ""} ${row.item.material?.codigo || ""} ${row.item.material?.descripcion || ""} ${operationText}`
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
      {/* La leyenda se agrupa en una pastilla propia en vez de flotar como
          cuatro puntos sueltos: deja de competir con el título. */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Factory size={14} style={{ color: C.blue, flexShrink: 0 }} />
            <span style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Circuito por material</span>
          </div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>
            Cada viaje muestra su origen real y termina cuando el material vuelve al astillero.
          </div>
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          flexWrap: "wrap",
          padding: "5px 11px",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: C.panel,
        }}>
          {[
            [C.blue, "Tornería"],
            [C.violet, "Plegadora"],
            [C.green, "En astillero"],
            [C.teal, "Proveedor"],
          ].map(([color, label]) => (
            <span key={label} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: C.muted,
              fontSize: 9.5,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
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
          <section key={group} style={{ display: "grid", gap: 9 }}>
            <div className="tor-group-head">
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: GROUP_COLORS[group] || C.dim,
                boxShadow: `0 0 0 3px ${C.panel}`,
                flexShrink: 0,
              }} />
              <span style={{
                color: C.text,
                fontSize: 10.5,
                fontWeight: 900,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                {group}
              </span>
              <span style={{
                flexShrink: 0,
                padding: "1px 8px",
                borderRadius: 999,
                border: `1px solid ${completed === blocks.length ? C.greenB : C.border}`,
                background: completed === blocks.length ? C.greenL : C.panel,
                color: completed === blocks.length ? C.green : C.dim,
                fontSize: 9.5,
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
              }}>
                {completed}/{blocks.length} completos
              </span>
              <span className="tor-group-rule" />
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
                    onPedirCompra={onPedirCompra}
                  />
                ))}
              </div>
            )}

            {blocks.some((block) => block.type === "standalone") && (
              <div className="tor-circuit-blocks">
                {blocks.filter((block) => block.type === "standalone").map((block, i) => (
                  <StandaloneRouteCard
                    key={block.key}
                    process={process}
                    row={block.row}
                    onMove={onMove}
                    index={i}
                    onPedirCompra={onPedirCompra}
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

// Los materiales que todavía nadie pidió, juntos y en un solo pedido. Pedirlos
// de a uno era el camino seguro a diez pedidos sueltos para la misma obra, que es
// exactamente lo que compras no quiere.
function CompraResumen({ process, onPedirCompra }) {
  const items = (process.items || []).filter((row) => row.activo !== false && !row.no_lleva);
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  const tramosDe = (item) => operations.filter(
    (op) => (op.componentes || []).some((c) => c.item_id === item.id),
  );

  const conCompra = items.filter((item) => compraAplica(item, tramosDe(item)));
  const sinPedir = conCompra.filter((item) => item.compra_estado === "pendiente_solicitud");
  const enCamino = conCompra.filter(
    (item) => ["solicitado", "comprado"].includes(item.compra_estado),
  );
  const llegados = conCompra.filter((item) => item.compra_estado === "recibido_astillero");

  if (!conCompra.length) return null;

  // Promedio real de lo que ya llegó: sirve para prometer fechas con algo más
  // que una intuición.
  const cerrados = llegados
    .map((item) => diasEntre(item.solicitado_at, item.recibido_astillero_at))
    .filter((dias) => dias != null);
  const promedio = cerrados.length
    ? Math.round(cerrados.reduce((total, dias) => total + dias, 0) / cerrados.length)
    : null;

  // El pedido más viejo sin llegar: el que hay que reclamar.
  const masViejo = enCamino
    .map((item) => diasDesde(item.solicitado_at))
    .filter((dias) => dias != null)
    .sort((a, b) => b - a)[0] ?? null;

  return (
    <section style={{
      display: "grid",
      gap: 10,
      padding: 12,
      borderRadius: 14,
      border: `1px solid ${sinPedir.length ? C.cyanB : C.border}`,
      background: sinPedir.length ? C.cyanL : C.panel,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <ShoppingCart size={14} style={{ color: sinPedir.length ? C.cyan : C.dim, flexShrink: 0 }} />
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 900 }}>Compra del material</span>
          </div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>
            {promedio != null
              ? `Hasta ahora el material tardó ${promedio} ${promedio === 1 ? "día" : "días"} promedio en llegar.`
              : "Todavía no hay material recibido para calcular un promedio."}
          </div>
        </div>
        {sinPedir.length > 0 && onPedirCompra && (
          <button
            type="button"
            onClick={() => onPedirCompra(sinPedir)}
            style={{ ...PRIMARY_BUTTON, flexShrink: 0, minHeight: 36, fontWeight: 900 }}
          >
            <ShoppingCart size={14} />
            Pedir {sinPedir.length} {sinPedir.length === 1 ? "material" : "materiales"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {[
          [sinPedir.length, "sin pedir", C.red, C.redL, C.redB],
          [enCamino.length, "en camino", C.cyan, C.cyanL, C.cyanB],
          [llegados.length, "en astillero", C.green, C.greenL, C.greenB],
        ].filter(([count]) => count > 0).map(([count, label, color, soft, borde]) => (
          <span key={label} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 10px",
            borderRadius: 999,
            border: `1px solid ${borde}`,
            background: soft,
            color,
            fontSize: 10.5,
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
          }}>
            {count} {label}
          </span>
        ))}
        {masViejo != null && masViejo >= 15 && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 10px",
            borderRadius: 999,
            border: `1px solid ${C.redB}`,
            background: C.redL,
            color: C.red,
            fontSize: 10.5,
            fontWeight: 900,
          }}>
            <AlertTriangle size={11} /> Hay un pedido de hace {masViejo} días
          </span>
        )}
      </div>
    </section>
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
  onPedirCompra,
}) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  const [showManagement, setShowManagement] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {showSearch && <CircuitSearch value={search} onChange={onSearch} />}

      <CompraResumen process={process} onPedirCompra={onPedirCompra} />

      <RecorridosPorItem
        process={process}
        onMove={onMove}
        query={search}
        onPedirCompra={onPedirCompra}
      />

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

function MaterialTab({ process, onEdit, onNew, onStatus, onConfirm, onPedirCompra, onNoLleva }) {
  const items = (process.items || []).filter((row) => row.activo !== false);
  const itemsByKey = new Map(items.map((row) => [row.clave, row]));
  const sinPedir = items.filter(
    (row) => !row.es_resultado && !row.no_lleva && row.compra_estado === "pendiente_solicitud",
  );
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Materiales del proceso</div>
          <div style={{ color: C.dim, fontSize: 11.5, lineHeight: 1.45, marginTop: 3 }}>
            Materiales comprados y conjuntos que se forman durante el circuito.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {sinPedir.length > 0 && onPedirCompra && (
            <button
              type="button"
              onClick={() => onPedirCompra(sinPedir)}
              style={{ ...PRIMARY_BUTTON, fontWeight: 900 }}
            >
              <ShoppingCart size={14} /> Pedir {sinPedir.length}
            </button>
          )}
          <button type="button" onClick={onNew} style={{ ...BUTTON }}>
            <Plus size={14} /> Material
          </button>
        </div>
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
            const unresolved = item.requiere_confirmacion && !item.confirmado_at && !item.no_lleva;
            return (
              <div key={item.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                gap: 10,
                padding: 11,
                borderRadius: 12,
                border: `1px solid ${unresolved ? C.redB : C.border}`,
                background: unresolved ? C.redL : C.panel,
                // No lleva: sigue a la vista pero apagado. Esconderlo haría
                // dudar de si se decidió o si alguien lo borró.
                opacity: item.no_lleva ? 0.55 : 1,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{
                      color: C.text,
                      fontSize: 12.5,
                      fontWeight: 850,
                      textDecoration: item.no_lleva ? "line-through" : "none",
                    }}>
                      {item.descripcion}
                    </span>
                    {item.no_lleva && (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: `1px solid ${C.border2}`,
                        background: C.panel2,
                        color: C.muted,
                        fontSize: 9.5,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}>
                        No lleva
                      </span>
                    )}
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
                  <CatalogTechnicalName item={item} compact />
                  <div style={{ color: C.dim, fontSize: 10.5, marginTop: 3 }}>
                    {qty(item.cantidad)} {item.unidad}
                    {item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}
                    {item.solicitado_por_torneria ? " · solicitado por Tornería" : ""}
                  </div>
                  {/* El reloj de la compra, en una línea: hasta ahora no quedaba
                      registro de cuánto tardó nada. */}
                  {(item.solicitado_at || item.recibido_astillero_at) && (
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.solicitado_at && <span>Pedido {fmtDate(item.solicitado_at, false)}</span>}
                      {item.recibido_astillero_at && <span>· Llegó {fmtDate(item.recibido_astillero_at, false)}</span>}
                      {diasEntre(item.solicitado_at, item.recibido_astillero_at) != null && (
                        <span style={{ color: C.green, fontWeight: 850 }}>
                          · {diasEntre(item.solicitado_at, item.recibido_astillero_at)} días
                        </span>
                      )}
                      {item.purchase_request_id && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.blue, fontWeight: 800 }}>
                          <ShoppingCart size={10} /> vinculado a compras
                        </span>
                      )}
                    </div>
                  )}
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
                  {item.no_lleva ? (
                    <span style={{
                      minHeight: 30,
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.panel2,
                      color: C.dim,
                      fontSize: 9.5,
                      fontWeight: 850,
                      whiteSpace: "nowrap",
                    }}>
                      Fuera de esta obra
                    </span>
                  ) : item.es_resultado ? (
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
                    {/* No para los conjuntos: un conjunto no "no se lleva", se
                        deja de armar solo si sus componentes no van. */}
                    {!item.es_resultado && onNoLleva && (
                      <button
                        type="button"
                        onClick={() => onNoLleva(item)}
                        title={item.no_lleva ? "Volver a incluirla en esta obra" : "Esta obra no lleva esta pieza"}
                        style={{
                          ...BUTTON,
                          minHeight: 31,
                          padding: "4px 9px",
                          fontSize: 10.5,
                          color: item.no_lleva ? C.blue : C.dim,
                          borderColor: item.no_lleva ? C.blueB : C.border,
                        }}
                      >
                        {item.no_lleva ? "Sí lleva" : "No lleva"}
                      </button>
                    )}
                    {item.requiere_confirmacion && !item.no_lleva && (
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
function TallerBoard({ processes, onSelectProcess, onMove, isMobile = false }) {
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
            const nombresTecnicos = [...new Set((op.componentes || [])
              .map((row) => [row.item?.material?.codigo, row.item?.material?.descripcion].filter(Boolean).join(" · "))
              .filter(Boolean))].join(" · ");
            const demorada = dias != null && dias >= 15;
            return (
              <div
                key={op.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(90px,130px) minmax(0,1fr) auto auto",
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
                  {nombresTecnicos && (
                    <div style={{ color: C.dim, fontSize: 9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Catálogo · {nombresTecnicos}
                    </div>
                  )}
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
                  style={{ ...BUTTON, minHeight: 32, padding: "4px 10px", flexShrink: 0, display: isMobile ? "none" : BUTTON.display }}
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
                    width: isMobile ? "100%" : undefined,
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

function OperationalDashboard({ processes, onSelectProcess, onMove, isMobile = false }) {
  const [workshop, setWorkshop] = useState("todos");
  const [query, setQuery] = useState("");

  const allRows = useMemo(() => processes
    .filter((process) => process.estado !== "cancelado")
    .flatMap((process) => (process.operaciones || [])
      .filter((op) => op.activa !== false && op.estado !== "recibido")
      .map((op) => {
        const lastOut = [...(op.movimientos || [])]
          .filter((movement) => movement.tipo === "salida")
          .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const dependencias = dependencyRows(process, op);
        const componentes = (op.componentes || [])
          .filter((row) => row.item?.activo !== false && !row.item?.no_lleva);
        const materialesPendientes = componentes.filter(({ item }) => (
          compraAplica(item, [op])
          && !["recibido_astillero", "no_aplica"].includes(item?.compra_estado)
        ));
        return {
          process,
          op,
          dependencias,
          materialesPendientes,
          dias: diasDesde(lastOut?.fecha),
          afuera: ["enviado", "parcial"].includes(op.estado),
          listo: op.estado === "pendiente" && dependencias.length === 0 && materialesPendientes.length === 0,
        };
      })), [processes]);

  const matches = useCallback((row) => {
    if (workshop !== "todos" && row.op.tipo !== workshop) return false;
    const term = query.trim().toLowerCase();
    if (!term) return true;
    const items = (row.op.componentes || []).map(({ item }) => (
      `${item?.descripcion || ""} ${item?.material?.codigo || ""} ${item?.material?.descripcion || ""}`
    )).join(" ");
    return `${row.process.obra?.codigo || ""} ${row.process.obra?.linea_nombre || ""} ${row.op.nombre || ""} ${workshopName(row.op)} ${items}`
      .toLowerCase()
      .includes(term);
  }, [query, workshop]);

  const visibleRows = allRows.filter(matches);
  const filteredProcesses = processes
    .map((process) => ({
      ...process,
      operaciones: (process.operaciones || []).filter((op) => {
        const row = visibleRows.find((entry) => entry.op.id === op.id);
        return Boolean(row);
      }),
    }))
    .filter((process) => process.operaciones.length > 0);
  const ready = visibleRows.filter((row) => row.listo);
  const blocked = visibleRows.filter((row) => row.op.estado === "pendiente" && !row.listo);
  const outside = allRows.filter((row) => row.afuera);
  const stats = {
    torneria: outside.filter((row) => row.op.tipo === "torneria").length,
    plegadora: outside.filter((row) => row.op.tipo === "plegadora").length,
    parciales: outside.filter((row) => row.op.estado === "parcial").length,
    demorados: outside.filter((row) => row.dias != null && row.dias >= 15).length,
    listos: allRows.filter((row) => row.listo).length,
  };

  const pieces = (op) => (op.componentes || [])
    .map((row) => row.item?.descripcion)
    .filter(Boolean)
    .join(" + ") || op.nombre;

  const cards = [
    { key: "torneria", label: "En Tornería", value: stats.torneria, Icon: Wrench, color: C.blue, soft: C.blueL, border: C.blueB },
    { key: "plegadora", label: "En Plegadora", value: stats.plegadora, Icon: Factory, color: C.violet, soft: C.violetL, border: C.violetB },
    { key: "parciales", label: "Regresos parciales", value: stats.parciales, Icon: Repeat, color: C.teal, soft: C.tealL, border: C.tealB },
    {
      key: "demorados", label: "Demorados +15d", value: stats.demorados, Icon: Clock3,
      color: stats.demorados ? C.red : C.green,
      soft: stats.demorados ? C.redL : C.greenL,
      border: stats.demorados ? C.redB : C.greenB,
    },
    { key: "listos", label: "Listos para salir", value: stats.listos, Icon: Truck, color: C.green, soft: C.greenL, border: C.greenB },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 1540, margin: "0 auto", display: "grid", gap: 14, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 11,
          border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, flexShrink: 0,
        }}>
          <LayoutDashboard size={17} />
        </span>
        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Panel operativo de talleres</div>
          <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.45, marginTop: 2 }}>
            Tornería y plegadora en una sola vista. Las demoras se cuentan desde la última salida.
          </div>
        </div>
        <label style={{
          width: isMobile ? "100%" : 310, minHeight: 36, display: "flex", alignItems: "center", gap: 7,
          padding: "0 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel,
        }}>
          <Search size={13} style={{ color: C.dim, flexShrink: 0 }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar obra, pieza o nombre técnico..."
            style={{
              minWidth: 0, width: "100%", border: 0, outline: 0, background: "transparent",
              color: C.text, fontSize: 11, fontFamily: C.sans,
            }}
          />
        </label>
      </div>

      <div className="tor-dashboard-kpis">
        {cards.map(({ key, label, value, Icon, color, soft, border }) => {
          const selectable = key === "torneria" || key === "plegadora";
          const active = workshop === key;
          return (
            <button
              key={key}
              type="button"
              onClick={selectable ? () => setWorkshop((current) => current === key ? "todos" : key) : undefined}
              aria-pressed={selectable ? active : undefined}
              style={{
                display: "grid", gridTemplateColumns: "30px minmax(0,1fr) auto", alignItems: "center", gap: 8,
                minHeight: 52, padding: "8px 10px", textAlign: "left", borderRadius: 12,
                border: `1px solid ${active ? border : C.border}`, background: active ? soft : C.panel,
                cursor: selectable ? "pointer" : "default", fontFamily: C.sans,
              }}
            >
              <span style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: soft, color }}>
                {createElement(Icon, { size: 14 })}
              </span>
              <span style={{ minWidth: 0, color: active ? color : C.muted, fontSize: 9.5, fontWeight: 850, lineHeight: 1.25 }}>
                {label}
              </span>
              <span style={{ color, fontSize: 17, fontWeight: 950, fontFamily: C.mono }}>{value}</span>
            </button>
          );
        })}
      </div>

      {(workshop !== "todos" || query) && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", color: C.dim, fontSize: 10.5 }}>
          <span>
            Mostrando {workshop === "todos" ? "todos los talleres" : workshop === "torneria" ? "Tornería" : "Plegadora"}
          </span>
          <button type="button" onClick={() => { setWorkshop("todos"); setQuery(""); }} style={{ ...BUTTON, minHeight: 27, padding: "3px 8px", fontSize: 9.5 }}>
            Quitar filtros
          </button>
        </div>
      )}

      <div className="tor-dashboard-grid">
        <section style={{ minWidth: 0 }}>
          <TallerBoard
            processes={filteredProcesses}
            onSelectProcess={onSelectProcess}
            onMove={onMove}
            isMobile={isMobile}
          />
        </section>

        <aside style={{ minWidth: 0, display: "grid", gap: 12, alignContent: "start" }}>
          <section style={{ display: "grid", gap: 7, padding: 11, borderRadius: 13, border: `1px solid ${C.greenB}`, background: C.greenL }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Truck size={12} style={{ color: C.green }} />
              <span style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>Listos para salir</span>
              <span style={{ marginLeft: "auto", color: C.green, fontSize: 11, fontWeight: 950 }}>{ready.length}</span>
            </div>
            {!ready.length ? (
              <div style={{ color: C.dim, fontSize: 10, lineHeight: 1.4 }}>No hay una salida habilitada con estos filtros.</div>
            ) : ready.slice(0, 8).map(({ process, op }) => (
              <div key={op.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 8, paddingTop: 7, borderTop: `1px solid ${C.greenB}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 10.5, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {process.obra?.codigo} · {pieces(op)}
                  </div>
                  <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>Viaje {op.viaje || 1} · {workshopName(op)}</div>
                </div>
                <button type="button" onClick={() => onMove(process, op)} style={{ ...BUTTON, minHeight: 29, padding: "3px 7px", color: C.green, borderColor: C.greenB }}>
                  Salida <ArrowRight size={11} />
                </button>
              </div>
            ))}
          </section>

          <section style={{ display: "grid", gap: 7, padding: 11, borderRadius: 13, border: `1px solid ${C.border}`, background: C.panel }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AlertTriangle size={12} style={{ color: blocked.length ? C.red : C.dim }} />
              <span style={{ color: C.text, fontSize: 11.5, fontWeight: 900 }}>Esperando antes de salir</span>
              <span style={{ marginLeft: "auto", color: blocked.length ? C.red : C.dim, fontSize: 11, fontWeight: 950 }}>{blocked.length}</span>
            </div>
            {!blocked.length ? (
              <div style={{ color: C.dim, fontSize: 10 }}>No hay pasos bloqueados con estos filtros.</div>
            ) : blocked.slice(0, 8).map(({ process, op, dependencias, materialesPendientes }) => (
              <button
                key={op.id}
                type="button"
                onClick={() => onSelectProcess(process.id)}
                style={{
                  display: "grid", gap: 3, width: "100%", padding: "7px 0 0", textAlign: "left",
                  border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontFamily: C.sans,
                }}
              >
                <span style={{ color: C.text, fontSize: 10.5, fontWeight: 850 }}>{process.obra?.codigo} · {pieces(op)}</span>
                <span style={{ color: C.dim, fontSize: 9.5, lineHeight: 1.35 }}>
                  {dependencias.length
                    ? `Espera ${dependencias.map((row) => row.nombre).join(", ")}`
                    : `Falta recibir ${materialesPendientes.map((row) => row.item?.descripcion).filter(Boolean).join(", ")}`}
                </span>
              </button>
            ))}
          </section>
        </aside>
      </div>
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
  const [dashboardOpen, setDashboardOpen] = useState(
    () => window.localStorage.getItem("torneria.dashboard") !== "closed",
  );
  const [modal, setModal] = useState(null);
  const [pedidoCompra, setPedidoCompra] = useState(null);

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

  useEffect(() => {
    window.localStorage.setItem("torneria.dashboard", dashboardOpen ? "open" : "closed");
  }, [dashboardOpen]);

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
        (item) => item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at,
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
        (item) => item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at,
      ).length,
      0,
    );
    const completed = processes.filter((row) => processProgress(row) === 100).length;
    return { active: active.length, workshop, unresolved, completed };
  }, [processes]);

  function selectProcess(id) {
    setSelectedId(id);
    window.localStorage.setItem("torneria.proceso", id);
    setDashboardOpen(false);
    setMobileList(false);
    setCircuitSearch("");
    if (isMobile) setMobileTopbarOpen(false);
  }

  function openDashboard() {
    setDashboardOpen(true);
    setMobileList(false);
    if (isMobile) setMobileTopbarOpen(false);
  }

  function toggleProcessFilter(next) {
    setVista((current) => current === next ? null : next);
    setDashboardOpen(false);
    if (isMobile) setMobileList(true);
  }

  async function createProcess(payload) {
    try {
      const id = await crearProcesoTorneria(payload);
      setModal(null);
      await load({ quiet: true, preferId: id });
      setDashboardOpen(false);
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

  // Abre el mismo modal que usan inventario, laminación y muebles. Tornería era
  // el único módulo que no pedía a compras desde el sistema.
  function pedirACompras(items) {
    const lista = (items || []).filter(Boolean);
    if (!lista.length || !selected) return;
    setPedidoCompra({ items: lista, proceso: selected });
  }

  async function toggleNoLleva(item) {
    const marcando = !item.no_lleva;
    if (marcando) {
      const accepted = await confirm({
        title: `¿${item.descripcion} no va en esta obra?`,
        message: "Sale de los pendientes y de las compras, y se apagan los viajes que existían sólo por esta pieza. Se puede volver atrás cuando quieras.",
        confirmLabel: "No lleva",
      });
      if (!accepted) return;
    }
    try {
      await marcarNoLleva(item.id, marcando);
      await load({ quiet: true, preferId: selected.id });
      toast.success(marcando ? "Marcado como no lleva." : "Vuelve al circuito.");
    } catch (noLlevaError) {
      toast.error(noLlevaError.message);
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
    (item) => item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at,
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
      // Halo ambiental, igual que Obras: da profundidad sin agregar un div ni
      // pelear con el grid de columnas. Los alfas son bajos a propósito para
      // que en modo claro no se vea sucio.
      backgroundImage: `
        radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
        radial-gradient(ellipse 40% 28% at 92% 88%, rgba(139,92,246,0.03) 0%, transparent 55%)
      `,
      color: C.text,
      fontFamily: C.sans,
    }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box}
        /* Scrollbars finas, como en Obras y Muebles. */
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--panel-2);border-radius:99px}
        .spin{animation:tor-spin .8s linear infinite}
        @keyframes tor-spin{to{transform:rotate(360deg)}}
        /* Entradas: las mismas curvas que el resto de la app. */
        @keyframes torCardEnter{0%{opacity:0;transform:translateY(10px) scale(.985)}60%{opacity:1}100%{opacity:1;transform:none}}
        @keyframes torSlideUp{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}
        .tor-process-card,.tor-operation{transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease}
        .tor-process-card:hover{transform:translateY(-1px);border-color:var(--border-2)!important}
        .tor-operation:hover{border-color:var(--border-2)!important;box-shadow:0 10px 26px -24px var(--shadow-strong)}
        .tor-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .tor-route-card{transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
        .tor-route-card{animation:torCardEnter .28s cubic-bezier(.16,1,.3,1) backwards}
        .tor-route-card:hover{border-color:var(--border-2)!important;transform:translateY(-1px);box-shadow:0 14px 34px -28px var(--shadow-strong)}
        /* Encabezado de grupo: filete que ocupa el resto de la fila, para que el
           título no quede flotando en el aire. */
        .tor-group-head{display:flex;align-items:center;gap:8px}
        .tor-group-rule{flex:1;height:1px;min-width:12px;background:linear-gradient(90deg,var(--border),transparent)}
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
        /* Dos componentes al lado necesitan ~860px para que sus rieles no
           scrolleen. Por debajo va uno por fila: mejor una columna ancha que dos
           angostas con el recorrido cortado. */
        @container (max-width:900px){
          .tor-transform-sources{grid-template-columns:minmax(0,1fr)}
        }
        /* Mosaico del circuito: las cards simples entran de a 2-4 por fila según
           el ancho disponible, para no dejar el slab gris a la derecha. */
        /* 560px medido: es lo que ocupa la cadena más larga (compra + 2 viajes =
           7 nodos) sin scrollear. Con columnas más angostas el riel scrolleaba
           siempre, que es justo lo que la card unificada viene a evitar. */
        .tor-circuit-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:10px;align-items:start}
        /* Los componentes del conjunto se reparten el ancho en partes iguales.
           Su cadena es más corta (compra + 1 viaje = 5 nodos), de ahí los 420px. */
        .tor-transform-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:8px;align-items:start}
        /* El recorrido es LA imagen de esta pantalla. Flechas repetidas entre
           pastillas grises no dicen nada; un riel que se llena hasta donde
           llegó la pieza se lee de un vistazo y sin leer texto. */
        /* overflow-x como válvula: con espacio los rieles se estiran igual, y si
           el taller tiene un nombre largo scrollea en vez de recortarse. */
        .tor-journey-path{display:flex;align-items:center;gap:0;min-width:0;overflow-x:auto;padding-bottom:2px}
        .tor-route-node{min-height:26px;display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:4px 8px;border:1px solid var(--border);border-radius:999px;font-size:9.5px;font-weight:850;white-space:nowrap}
        .tor-rail{flex:1 1 10px;min-width:10px;height:3px;border-radius:99px;margin:0 4px;background:var(--panel-2);position:relative;overflow:hidden}
        .tor-rail[data-hecho="1"]{background:currentColor}
        /* Tramo en curso: el barrido corre hacia adelante, en el sentido del
           viaje. Sin loop infinito en lo que ya está cerrado. */
        .tor-rail[data-curso="1"]::after{content:"";position:absolute;inset:0;border-radius:99px;
          background:linear-gradient(90deg,transparent,currentColor,transparent);
          animation:torRail 1.5s linear infinite}
        @keyframes torRail{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @media (prefers-reduced-motion: reduce){
          .tor-route-card{animation:none}
          .tor-rail[data-curso="1"]::after{animation:none;background:currentColor;opacity:.45}
        }
        .tor-route-action,.tor-management-toggle{transition:filter .14s ease,transform .1s ease,background .14s ease}
        .tor-route-action:hover,.tor-management-toggle:hover{filter:brightness(1.05)}
        .tor-route-action:active{transform:scale(.985)}
        .tor-kpi{transition:border-color .14s ease,background .14s ease,transform .1s ease}
        .tor-kpi:hover{border-color:var(--border-2)}
        .tor-kpi:active{transform:scale(.97)}
        .tor-operation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .tor-dashboard-kpis{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:7px}
        .tor-dashboard-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,330px);gap:14px;align-items:start}
        input:focus,select:focus,textarea:focus{border-color:var(--blue-border)!important}
        select option{background:var(--panel-solid);color:var(--text)}
        @media(max-width:1120px){
          .tor-operation-grid{grid-template-columns:1fr}
          .tor-dashboard-kpis{grid-template-columns:repeat(3,minmax(130px,1fr))}
        }
        @media(max-width:860px){
          .tor-dashboard-grid{grid-template-columns:minmax(0,1fr)}
          .tor-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media(max-width:620px){
          .tor-form-grid{grid-template-columns:1fr}
          .tor-form-grid>*{grid-column:1!important}
          .tor-operation-grid{grid-template-columns:1fr}
          .tor-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
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
                  onClick={() => toggleProcessFilter("activos")}
                />
                <KpiChip
                  icon={Truck} value={stats.workshop} label="Fuera del astillero" color={C.violet}
                  activo={vista === "taller"}
                  onClick={() => {
                    setVista("taller");
                    openDashboard();
                  }}
                />
                <KpiChip
                  icon={AlertTriangle} value={stats.unresolved} label="Por confirmar"
                  color={stats.unresolved ? C.red : C.green}
                  activo={vista === "confirmar"}
                  onClick={() => toggleProcessFilter("confirmar")}
                />
                <KpiChip
                  icon={PackageCheck} value={stats.completed} label="Completados" color={C.green}
                  activo={vista === "completos"}
                  onClick={() => toggleProcessFilter("completos")}
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
                  onClick={dashboardOpen ? () => setDashboardOpen(false) : openDashboard}
                  aria-pressed={dashboardOpen}
                  style={{
                    ...BUTTON,
                    minHeight: 39,
                    color: dashboardOpen ? C.blue : C.muted,
                    borderColor: dashboardOpen ? C.blueB : C.border,
                    background: dashboardOpen ? C.blueL : C.panel,
                  }}
                >
                  <LayoutDashboard size={15} /> Panel general
                </button>
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
                  <button
                    type="button"
                    onClick={dashboardOpen ? () => setDashboardOpen(false) : openDashboard}
                    aria-label={dashboardOpen ? "Cerrar panel general" : "Abrir panel general"}
                    aria-pressed={dashboardOpen}
                    style={{
                      ...BUTTON, width: 39, padding: 0,
                      color: dashboardOpen ? C.blue : C.muted,
                      borderColor: dashboardOpen ? C.blueB : C.border,
                      background: dashboardOpen ? C.blueL : C.panel,
                    }}
                  >
                    <LayoutDashboard size={15} />
                  </button>
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
                  onClick={() => toggleProcessFilter("activos")}
                />
                <Kpi
                  icon={Truck} value={stats.workshop} label={isMobile ? "Afuera" : "Fuera del astillero"} color={C.violet}
                  compacto={isMobile} activo={vista === "taller"}
                  onClick={() => {
                    setVista("taller");
                    openDashboard();
                  }}
                />
                <Kpi
                  icon={AlertTriangle} value={stats.unresolved} label="Por confirmar"
                  color={stats.unresolved ? C.red : C.green}
                  compacto={isMobile} activo={vista === "confirmar"}
                  onClick={() => toggleProcessFilter("confirmar")}
                />
                <Kpi
                  icon={PackageCheck} value={stats.completed} label={isMobile ? "Listos" : "Completados"} color={C.green}
                  compacto={isMobile} activo={vista === "completos"}
                  onClick={() => toggleProcessFilter("completos")}
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
              {dashboardOpen ? (
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 10 : 16 }}>
                  <OperationalDashboard
                    processes={processes}
                    onSelectProcess={selectProcess}
                    onMove={(process, operation) => {
                      selectProcess(process.id);
                      openMovement(operation, null);
                    }}
                    isMobile={isMobile}
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
                        onPedirCompra={pedirACompras}
                      />
                    )}
                    {tab === "materiales" && (
                      <MaterialTab
                        process={selected}
                        onEdit={(item) => setModal({ type: "item", item })}
                        onNew={() => setModal({ type: "item", item: null })}
                        onStatus={quickItemStatus}
                        onConfirm={confirmItem}
                        onPedirCompra={pedirACompras}
                        onNoLleva={toggleNoLleva}
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

      {/* Pedido a compras: el mismo modal de siempre. Al volver con el pedido
          creado se vinculan los items, y de ahí en adelante el avance de compras
          sincroniza solo — nadie carga el estado dos veces. */}
      <PedirAComprasModal
        open={Boolean(pedidoCompra)}
        profile={profile}
        origen="torneria"
        onClose={async (created, itemsCreados) => {
          const actual = pedidoCompra;
          setPedidoCompra(null);
          if (!created || !actual) return;
          try {
            if (created?.id) {
              // Se empareja por la descripción con la que salió cada material,
              // que es lo único que sobrevive el paso por el modal (ahí se pueden
              // agregar o quitar ítems a mano).
              const porDescripcion = new Map(
                (itemsCreados || []).map((entry) => [entry?.draft?.description, entry?.requestItem?.id]),
              );
              await vincularItemsAPedidoCompra(
                actual.items.map((item) => ({
                  itemId: item.id,
                  requestItemId: porDescripcion.get(descripcionParaCompras(item)) || null,
                })),
                created.id,
              );
            }
            await load({ quiet: true, preferId: actual.proceso.id });
          } catch (linkError) {
            // El pedido ya viajó a compras: lo único que falló es el vínculo, así
            // que se avisa sin hacer creer que no se pidió nada.
            toast.error(`El pedido se envió, pero no se pudo vincular: ${linkError.message}`);
          }
        }}
        prefilled={pedidoCompra ? {
          title: `Tornería · ${pedidoCompra.proceso.obra?.codigo || "Obra"}`,
          description: `Material para el circuito de tornería de ${pedidoCompra.proceso.obra?.codigo || "la obra"}`
            + `${pedidoCompra.proceso.obra?.linea_nombre ? ` (${pedidoCompra.proceso.obra.linea_nombre})` : ""}.`
            + " Avisar a Tornería cuando llegue al astillero.",
          priority: "alta",
          tipo_pedido: "estandar",
          source: "torneria",
          source_ref: pedidoCompra.proceso.id,
          source_url: "/torneria",
          defaultDestination: `Obra ${pedidoCompra.proceso.obra?.codigo || ""}`.trim(),
          items: pedidoCompra.items.map((item) => {
            // Si está vinculado al catálogo, el pedido va con el nombre del
            // catálogo y no con el de tornería. "Nucleo de pata de gallo" es
            // cómo lo llamamos acá adentro; al proveedor hay que pedirle el
            // material como figura en el catálogo, con su código y su unidad.
            const cat = item.material || null;
            return {
              description: descripcionParaCompras(item),
              quantity: String(item.cantidad ?? ""),
              unit: cat?.unidad_medida || item.unidad || "unidad",
              // Con el id del catálogo, la recepción en pañol lo empareja exacto
              // (scorePedidoMaterial le da el puntaje máximo) en vez de adivinar
              // por parecido de texto.
              material_id: cat?.id || null,
              catalogSource: cat ? "panol" : null,
              notes: [
                // El nombre interno queda de referencia: es con el que el taller
                // reconoce la pieza cuando llega.
                cat ? `En Tornería: ${item.descripcion}` : "",
                item.grupo ? `Grupo: ${item.grupo}` : "",
                (cat?.proveedor || item.proveedor_compra)
                  ? `Proveedor: ${cat?.proveedor || item.proveedor_compra}`
                  : "",
                !cat ? "Sin vincular al catálogo del pañol." : "",
                item.alerta || "",
              ].filter(Boolean).join(" · ") || undefined,
            };
          }),
        } : null}
      />

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
