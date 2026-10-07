import { Fragment, useEffect, useRef } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, Edit3, FileText, Link2, MapPin, PackageOpen, Repeat, Truck,
} from "lucide-react";
import { C } from "@/theme";
import { ProgressBar, StatusBadge } from "./torneriaUi";
import { BUTTON, PRIMARY_BUTTON } from "./torneriaStyles";
import { recepcionAnticipada } from "./recepcionesAnticipadas";
import { materialesDelRenglon } from "./circuitoDatos";
import {
  dependencyRows, fmtDate, operationProgress, operationStatusLabel, qty, workshopName,
} from "./torneriaEstado";

// Piezas del circuito que comparten el detalle de una obra y el tablero: el riel
// del recorrido de un material, su nombre de catálogo, el ingreso anticipado en
// Pañol y la tarjeta de un paso (para la gestión del circuito).

// El riel se abre centrado en el tramo actual: en el celular no entra entero y
// arrancaba siempre mirando "Compras", lejos de lo que importa.
export function CircuitoRail({ nodos }) {
  const riel = useRef(null);
  const actual = nodos.reduce((ultimo, nodo, i) => (nodo.activo ? i : ultimo), 0);
  useEffect(() => {
    const el = riel.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    const nodo = el.querySelectorAll(".tor-riel-nodo")[actual];
    if (!nodo) return;
    const izquierda = nodo.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollLeft = Math.max(0, izquierda - el.clientWidth / 2 + nodo.offsetWidth / 2);
  }, [actual, nodos.length]);
  return (
    <div className="tor-riel" ref={riel}>
      {nodos.map((nodo) => {
        const Icon = nodo.Icon;
        return (
          <Fragment key={nodo.key}>
            {nodo.railColor !== undefined && (
              <span
                className="tor-riel-via"
                data-hecho={nodo.railHecho ? "1" : "0"}
                data-curso={nodo.railCurso ? "1" : "0"}
                style={{ color: nodo.railColor }}
              />
            )}
            <span
              className="tor-riel-nodo"
              title={nodo.compacto ? nodo.label : undefined}
              style={{
                borderColor: nodo.activo ? nodo.borde : C.border,
                background: nodo.activo ? nodo.soft : C.panel2,
                color: nodo.activo ? nodo.color : C.dim,
                padding: nodo.compacto ? "3px 7px" : undefined,
              }}
            >
              <Icon size={12} />
              {!nodo.compacto && nodo.label}
              {nodo.viaje ? <span style={{ opacity: 0.7 }}>{nodo.viaje}</span> : null}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

// Nombre real del material en el catálogo de Pañol. El nombre grande sigue
// siendo el de Mecánica ("Núcleo para pata de gallo"); este aclara qué producto
// físico es. Un lote lista todos sus materiales con su cantidad.
export function CatalogTechnicalName({ item }) {
  const lista = materialesDelRenglon(item);
  if (lista.length > 1) {
    return (
      <div style={{ display: "grid", gap: 2 }}>
        {lista.map((row) => (
          <div key={row.id || row.material_id} className="tor-cat" title="Material vinculado desde el catálogo de Pañol">
            <Link2 size={11} />
            <span><b className="mono" style={{ fontWeight: 600 }}>×{Number(row.cantidad) || 1}</b> {[row.material?.codigo, row.material?.descripcion].filter(Boolean).join(" · ")}</span>
          </div>
        ))}
      </div>
    );
  }
  const material = item?.material || null;
  if (!material?.descripcion && !material?.codigo) return null;
  return (
    <div className="tor-cat" title="Nombre técnico vinculado desde el catálogo de Pañol">
      <Link2 size={11} />
      <span>{[material.codigo, material.descripcion].filter(Boolean).join(" · ")}</span>
    </div>
  );
}

export function RecepcionAnticipada({ item }) {
  if (item.no_lleva || item.es_resultado) return null;
  const info = recepcionAnticipada(item);
  const general = item.stock_general || [];
  if (!info.tieneIngreso && !general.length) return null;
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 12, lineHeight: 1.4 }}>
      {info.tieneIngreso && (
        <span style={{ color: info.completa ? C.green : C.muted }}>
          {info.completa ? "Recibido en Pañol · compra anticipada" : "Ingreso anticipado parcial"}
          {info.materiales.map((row) => (
            <span key={row.materialId} style={{ display: "block" }}>
              {info.materiales.length > 1 ? `${row.material?.descripcion || "Material"}: ` : ""}
              {qty(row.recibida)}/{qty(row.cantidad)} {row.material?.unidad_medida || item.unidad}
              {row.faltante > 0 ? ` · falta ${qty(row.faltante)}` : " · reconocido para esta obra"}
            </span>
          ))}
        </span>
      )}
      {!info.completa && general.length > 0 && (
        <span style={{ color: C.teal }}>
          Stock general: {general.map((row) => {
            const material = info.materiales.find((entry) => entry.materialId === row.material_id)?.material;
            return `${info.materiales.length > 1 ? `${material?.descripcion || "Material"}: ` : ""}${qty(row.cantidad)} ${material?.unidad_medida || item.unidad} en ${row.sede}`;
          }).join(" · ")}. Asignalo a esta obra desde Pañol para usarlo.
        </span>
      )}
    </div>
  );
}


export function OperationCard({ process, operation, onMove, onEdit, onEditItem }) {
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
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 700 }}>
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
                fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
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
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}>
              {operation.tipo === "plegadora" ? "Plegadora" : operation.tipo === "torneria" ? "Tornería" : operation.tipo}
            </span>
          </div>
          {/* La acción baja a segundo renglón, en gris: sigue estando para quien
              la necesite, pero deja de ser el título. */}
          {piezas && operation.nombre && (
            <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginTop: 3 }}>
              {operation.nombre}
            </div>
          )}
          {operation.descripcion && (
            <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
              {operation.descripcion}
            </div>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: C.dim,
            fontSize: 11,
            fontWeight: 650,
            marginTop: 5,
          }}>
            <MapPin size={10} />
            {operation.origen || "Astillero"} → {workshopName(operation)} → Astillero
          </div>
        </div>
        <StatusBadge status={operation.estado} compact label={operationStatusLabel(operation)} />
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
          fontSize: 12,
          lineHeight: 1.4,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          Espera: {dependencies.map((row) => row.nombre).join(", ")}
        </div>
      )}
      {ready && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.green, fontSize: 12, fontWeight: 650 }}>
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
            fontSize: 12,
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
                  fontSize: 12.5,
                  fontWeight: 650,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {row.item?.descripcion || "Pieza"}
                </div>
                <CatalogTechnicalName item={row.item} compact />
                <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                  Sale {qty(row.cantidad_enviada)} · volvió {qty(row.cantidad_recibida)}
                </div>
              </div>
              <span style={{ color: rowPct === 100 ? C.green : C.dim, fontSize: 12, fontWeight: 700 }}>
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
                fontSize: 11,
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

