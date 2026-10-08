import { Fragment, createElement, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Boxes, Check, ChevronRight, Clock3, Edit3, Factory, FileText, GitMerge,
  History, Link2, MapPin, PackageCheck, PackageOpen, Plus, Repeat, Search, Settings2, ShoppingCart, SkipForward,
  Truck, Wrench,
} from "lucide-react";
import { C } from "@/theme";
import { EmptyCatalogHint } from "../TorneriaModals";
import { ProgressBar, StatusBadge } from "../torneriaUi";
import { BUTTON, PRIMARY_BUTTON } from "../torneriaStyles";
import { recepcionAnticipada } from "../recepcionesAnticipadas";
import {
  RESULT_OPERATION_META, compraAplica, currentOperation, datosPorConfirmar, dependencyRows, diasDesde,
  diasEntre, enArchivo, esInsumo, fechasMovimientoComponente, fmtDate, groupRows, motivoArchivo, preparacionVigente,
  primeraSalida, processProgress, qty, routeIsComplete, tramoCerrado, workshopName,
} from "../torneriaEstado";
import { COMPRA_META, GROUP_COLORS, circuitoNodos } from "../circuitoDatos";
import { CatalogTechnicalName, CircuitoRail, FotoMaterial, OperationCard, RecepcionAnticipada } from "../circuito";
import { fotoDelMaterial } from "../circuitoDatos";
import { MenuDeObra } from "./ObraDetalle";

// Las obras en el celular, como las conocía el mecánico: la lista de obras y,
// adentro, Circuito / Materiales / Historial con una tarjeta por material, su
// riel y un botón. Son los componentes de siempre (traídos tal cual del diseño
// anterior); en la computadora se ve la vista nueva. Lo único distinto: la
// lista separa En curso de Terminadas y la letra es un poco más grande.

const TABS = [
  ["circuito", "Circuito", Factory],
  ["materiales", "Materiales", Boxes],
  ["historial", "Historial", History],
];

const PROCESS_STATE = {
  borrador: "Borrador",
  activo: "Activo",
  completado: "Archivada",
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

function ProcessCard({ process, selected, onClick }) {
  const progress = processProgress(process);
  const current = currentOperation(process);
  // Sin viajes cargados y "todos los viajes volvieron" daban los dos
  // `currentOperation === null`, y la obra sin circuito se anunciaba en verde
  // como recibida. Son estados opuestos: uno está terminado, el otro ni empezó.
  const sinCircuito = !(process.operaciones || []).some((row) => row.activa !== false);
  const unresolved = (process.items || []).filter(
    (item) => item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at,
  ).length;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className="tor-process-card"
      style={{
        width: "100%",
        display: "grid",
        gridTemplateRows: "auto auto auto",
        gap: 9,
        padding: 12,
        minHeight: 92,
        height: "max-content",
        alignSelf: "start",
        borderRadius: 13,
        border: `1px solid ${selected ? C.blueB : C.border}`,
        background: selected ? C.blueL : C.panel,
        color: C.text,
        cursor: "pointer",
        textAlign: "left",
        boxShadow: selected ? "0 8px 24px -18px var(--shadow-strong)" : "none",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>
              {process.obra?.codigo || process.nombre}
            </span>
            <span style={{
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              color: C.dim,
              fontSize: 11,
              fontWeight: 650,
            }}>
              {process.obra?.linea_nombre || "Sin línea"}
            </span>
          </div>
          <div style={{
            marginTop: 4,
            color: current ? C.muted : sinCircuito ? C.red : C.green,
            fontSize: 12,
            fontWeight: sinCircuito ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {current?.nombre || (sinCircuito ? "Sin circuito cargado" : "Circuito recibido")}
          </div>
        </div>
        <ChevronRight size={16} color={selected ? C.blue : C.dim} style={{ flexShrink: 0 }} />
      </div>
      <ProgressBar value={progress} color={progress === 100 ? C.green : C.blue} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: enArchivo(process) ? C.green : C.dim, fontSize: 12 }}>{enArchivo(process) ? (motivoArchivo(process) === "terminada" ? "Terminada" : "Archivada") : PROCESS_STATE[process.estado] || process.estado}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {unresolved > 0 && (
            <span style={{ color: C.red, fontSize: 12, fontWeight: 700 }}>
              {unresolved} por confirmar
            </span>
          )}
          <span style={{ color: progress === 100 ? C.green : C.blue, fontSize: 12, fontWeight: 700 }}>
            {progress}%
          </span>
        </div>
      </div>
    </div>
  );
}

function ProcessList({
  processes,
  selectedId,
  search,
  setSearch,
  status,
  setStatus,
  conteos,
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
            ["curso", `En curso · ${conteos.curso}`],
            ["archivo", `Terminadas · ${conteos.archivo}`],
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
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: 10,
        display: "grid",
        gridAutoRows: "max-content",
        alignContent: "start",
        gap: 7,
      }}>
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


// Estado de una formación de conjunto. Vive en una sola función porque se lee
// en dos lugares —la card de la transformación y el contador del grupo— y
// mientras la regla estuvo escrita dos veces las dos se fueron por caminos
// distintos: el contador daba "1/1 completos" a un conjunto sin componentes
// (otra vez `[].every`) mientras la card decía que todavía no se había formado.
function transformationState({ result, sources }) {
  const sourcesReady = sources.length > 0 && sources.every(routeIsComplete);
  const resultHasJourney = result.tramos.length > 0;
  const resultReady = resultHasJourney ? routeIsComplete(result) : sourcesReady;
  return {
    sourcesReady,
    resultHasJourney,
    resultReady,
    complete: sourcesReady && resultReady,
    pendingSources: sources.filter((row) => !routeIsComplete(row)).length,
  };
}

function blockIsComplete(block) {
  return block.type === "standalone"
    ? routeIsComplete(block.row)
    : transformationState(block).complete;
}


// Dónde está parado el circuito ahora. Es lo único accionable, así que la card
// muestra un solo detalle y un solo botón en vez de uno por tramo.
function tramoActual({ process, item, tramos, conCompra }) {
  const compraPaso = conCompra
    ? (COMPRA_META[item.compra_estado] ?? COMPRA_META.pendiente_solicitud).paso
    : 3;
  if (conCompra && compraPaso < 3) return { tipo: "compra", compraPaso };
  // Un insumo se cierra al entregarlo: lo que hay que mirar es lo enviado, no lo
  // recibido. Si se mirara lo recibido —que para un insumo se queda en cero para
  // siempre— el tramo nunca se daría por terminado.
  const insumo = esInsumo(item);
  const operation = tramos.find((row) => {
    const componentes = (row.componentes || []).filter((component) => component.item_id === item.id);
    if (!componentes.length) return !tramoCerrado(row, item);
    return componentes.some((component) => (
      insumo
        ? Number(component.cantidad_enviada) < Number(component.cantidad_requerida)
        : Number(component.cantidad_recibida) < Number(component.cantidad_requerida)
    ));
  });
  if (!tramos.length) return { tipo: "sin_viaje" };
  if (!operation) return { tipo: "listo" };
  return { tipo: "viaje", operation, dependencias: dependencyRows(process, operation) };
}

function TramoActual({ process, item, tramos, conCompra, onMove, onReady, onPedirCompra, onSkipPurchase }) {
  const actual = tramoActual({ process, item, tramos, conCompra });
  const diasCompra = diasEntre(item.solicitado_at, item.recibido_astillero_at);
  const diasEspera = diasEntre(item.recibido_astillero_at, primeraSalida(tramos));

  // Los tiempos de compra se muestran siempre que existan, incluso con el
  // circuito terminado: es el dato que sirve para presupuestar la próxima obra.
  const tiempos = (
    <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
      {diasCompra != null && (
        <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>
          Compra: {diasCompra} {diasCompra === 1 ? "día" : "días"}
        </span>
      )}
      {diasEspera != null && (
        <span style={{ color: C.dim, fontSize: 12 }}>
          Esperó {diasEspera} {diasEspera === 1 ? "día" : "días"} antes de salir
        </span>
      )}
    </div>
  );

  // El material está en el astillero pero nadie definió por dónde tiene que
  // pasar: sin viajes cargados no hay nada que mover, y antes esto se mostraba
  // como "Circuito completo".
  if (actual.tipo === "sin_viaje") {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12.5, fontWeight: 700 }}>
          <Clock3 size={13} /> Sin viajes cargados para este material
        </span>
        {tiempos}
      </div>
    );
  }

  if (actual.tipo === "listo") {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.green, fontSize: 12.5, fontWeight: 700 }}>
          <Check size={13} /> {esInsumo(item) ? "Entregado en el taller" : "Circuito completo"}
        </span>
        {tiempos}
      </div>
    );
  }

  if (actual.tipo === "compra") {
    const meta = COMPRA_META[item.compra_estado] ?? COMPRA_META.pendiente_solicitud;
    const diasPidiendo = diasDesde(item.solicitado_at);
    const puedePedir = item.compra_estado === "pendiente_solicitud" && onPedirCompra;
    const puedeSaltear = ["pendiente_solicitud", "solicitado"].includes(item.compra_estado)
      && onSkipPurchase;
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, minHeight: 23,
            padding: "2px 8px", borderRadius: 999,
            border: `1px solid ${meta.borde}`, background: meta.soft, color: meta.color,
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />
            {meta.label}
          </span>
          {item.proveedor_compra && (
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 650 }}>{item.proveedor_compra}</span>
          )}
          {/* Un pedido que lleva mucho sin llegar es el dato que dispara el reclamo. */}
          {diasPidiendo != null && (
            <span style={{
              color: diasPidiendo >= 15 ? C.red : C.dim,
              fontSize: 12,
              fontWeight: diasPidiendo >= 15 ? 700 : 600,
            }}>
              Pedido hace {diasPidiendo} {diasPidiendo === 1 ? "día" : "días"}
            </span>
          )}
        </div>
        {(puedePedir || puedeSaltear) && (
          <div style={{ display: "grid", gridTemplateColumns: puedePedir && puedeSaltear ? "minmax(0,1fr) auto" : "1fr", gap: 6 }}>
            {puedePedir && (
              <button
                type="button"
                onClick={() => onPedirCompra([item])}
                className="tor-route-action"
                style={{ ...PRIMARY_BUTTON, width: "100%", minHeight: 36 }}
              >
                <ShoppingCart size={14} /> {recepcionAnticipada(item).tieneIngreso ? "Pedir faltante a compras" : "Pedir a compras"}
              </button>
            )}
            {puedeSaltear && (
              <button
                type="button"
                onClick={() => onSkipPurchase(item)}
                title={item.compra_estado === "solicitado"
                  ? "Cancelar la línea pedida por error y continuar"
                  : "Continuar sin crear un pedido a Compras"}
                style={{
                  ...BUTTON,
                  minHeight: 36,
                  padding: "6px 10px",
                  borderColor: C.border2,
                  color: C.muted,
                  background: C.panelSolid,
                  whiteSpace: "nowrap",
                }}
              >
                <SkipForward size={14} /> {item.compra_estado === "solicitado" ? "Cancelar y saltear" : "Saltear paso"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const { operation, dependencias } = actual;
  const directComponents = (operation.componentes || []).filter(
    (component) => component.item_id === item.id,
  );
  const components = directComponents.length
    ? directComponents
    : item.virtual
      ? (operation.componentes || []).filter((component) => component.item?.activo !== false)
      : [];
  const pendientesEnvio = components.filter(
    (component) => Number(component.cantidad_enviada) < Number(component.cantidad_requerida),
  );
  const pendientesRetiro = components.filter(
    (component) => Number(component.cantidad_enviada) > Number(component.cantidad_recibida),
  );
  // Para un insumo no hay nada pendiente de retiro: lo que salió, se entregó.
  const insumo = esInsumo(item);
  const afuera = !insumo && pendientesRetiro.length > 0;
  const listoEnvio = pendientesEnvio.length > 0
    && pendientesEnvio.every((component) => preparacionVigente(component, operation, "envio"));
  const listoRetiro = afuera
    && pendientesRetiro.every((component) => preparacionVigente(component, operation, "retiro"));
  const destino = workshopName(operation);
  const tallerColor = operation.tipo === "plegadora" ? C.violet : C.blue;
  const fechasSalida = components.flatMap(
    (component) => fechasMovimientoComponente(operation, component.id, "salida"),
  ).sort();
  const ultimaSalida = fechasSalida.at(-1);
  const diasAfuera = afuera ? diasDesde(ultimaSalida) : null;
  const listoEnvioAt = pendientesEnvio
    .map((component) => component.listo_envio_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const listoRetiroAt = pendientesRetiro
    .map((component) => component.listo_retiro_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const diasEsperandoFlete = listoEnvio ? diasDesde(listoEnvioAt) : null;
  const diasEsperandoRetiro = listoRetiro ? diasDesde(listoRetiroAt) : null;

  let label = listoEnvio
    ? (insumo ? "Listo para entregar" : "Listo para enviar")
    : `${operation.origen || "Astillero"} · preparar ${insumo ? "entrega" : "salida"}`;
  let color = listoEnvio ? C.green : C.blue;
  let soft = listoEnvio ? C.greenL : C.blueL;
  let borde = listoEnvio ? C.greenB : C.blueB;
  if (afuera && listoRetiro) {
    label = "Listo para retirar"; color = C.green; soft = C.greenL; borde = C.greenB;
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
          fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
          {insumo ? label : `Viaje ${operation.viaje || 1} · ${label}`}
        </span>
        {operation.nombre && (
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 650 }}>{operation.nombre}</span>
        )}
        {diasAfuera != null && (
          <span style={{
            color: diasAfuera >= 15 ? C.red : C.dim,
            fontSize: 12,
            fontWeight: diasAfuera >= 15 ? 700 : 600,
          }}>
            Afuera hace {diasAfuera} {diasAfuera === 1 ? "día" : "días"}
          </span>
        )}
        {diasEsperandoFlete != null && (
          <span style={{ color: diasEsperandoFlete >= 3 ? C.red : C.dim, fontSize: 12, fontWeight: 650 }}>
            Flete pendiente {diasEsperandoFlete}d
          </span>
        )}
        {diasEsperandoRetiro != null && (
          <span style={{ color: diasEsperandoRetiro >= 3 ? C.red : C.dim, fontSize: 12, fontWeight: 650 }}>
            Retiro pendiente {diasEsperandoRetiro}d
          </span>
        )}
      </div>

      {dependencias.length > 0 && (
        <div style={{ color: C.red, fontSize: 12, lineHeight: 1.4 }}>
          Antes debería volver: {dependencias.map((row) => row.nombre).join(", ")}.
        </div>
      )}

      {tiempos}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            if (afuera && !listoRetiro) onReady(pendientesRetiro, "retiro", true);
            else if (afuera) onMove(operation, null, "recepcion");
            else if (!listoEnvio) onReady(pendientesEnvio, "envio", true);
            else onMove(operation, null, "salida");
          }}
          className="tor-route-action"
          style={{
            ...PRIMARY_BUTTON,
            flex: "1 1 190px",
            minHeight: 36,
            ...(afuera ? { borderColor: C.violetB, background: C.violetL, color: C.violet } : {}),
            ...((listoEnvio || listoRetiro) ? {
              borderColor: C.greenB,
              background: C.greenL,
              color: C.green,
            } : {}),
          }}
        >
          {afuera
            ? listoRetiro ? <PackageOpen size={14} /> : <Check size={14} />
            : listoEnvio ? <Truck size={14} /> : <Check size={14} />}
          {afuera
            ? listoRetiro ? "Registrar regreso" : "Marcar listo para retirar"
            : listoEnvio
              ? (insumo ? "Registrar entrega" : "Registrar salida")
              : (insumo ? "Marcar listo para entregar" : "Marcar listo para enviar")}
        </button>
        {(listoEnvio || listoRetiro) && (
          <button
            type="button"
            onClick={() => onReady(
              afuera ? pendientesRetiro : pendientesEnvio,
              afuera ? "retiro" : "envio",
              false,
            )}
            style={{ ...BUTTON, minHeight: 36, padding: "6px 9px", fontSize: 11 }}
          >
            Quitar listo
          </button>
        )}
      </div>
    </div>
  );
}

function CircuitoMaterial({ process, item, tramos, onMove, onReady, onPedirCompra, onSkipPurchase, tono = null }) {
  const conCompra = compraAplica(item, tramos);
  const nodos = circuitoNodos({ item, tramos, conCompra });
  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <CircuitoRail nodos={nodos} />
      <RecepcionAnticipada item={item} />
      <TramoActual
        process={process}
        item={item}
        tramos={tramos}
        conCompra={conCompra}
        onMove={onMove}
        onReady={onReady}
        onPedirCompra={onPedirCompra}
        onSkipPurchase={onSkipPurchase}
      />
      {tono}
    </div>
  );
}
function StandaloneRouteCard({
  process,
  row,
  onMove,
  onReady,
  index = 0,
  onPedirCompra = null,
  onSkipPurchase = null,
  onInsumo = null,
}) {
  const { item, tramos } = row;
  const complete = routeIsComplete(row);
  // La pieza está afuera si alguno de sus tramos está en el taller. Da el color
  // de la espina, que es lo único que se lee sin acercarse a la pantalla.
  // Un insumo entregado no está "afuera": llegó a donde tenía que llegar.
  const outside = !complete && tramos.some((op) => ["enviado", "parcial"].includes(op.estado));
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
        <FotoMaterial item={item} size={48} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>
              {item.descripcion}
            </span>
            {esInsumo(item) && (
              <span title="Se entrega al taller y no vuelve" style={{
                padding: "2px 8px", borderRadius: 999,
                border: `1px solid ${C.tealB}`, background: C.tealL, color: C.teal,
                fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              }}>
                Insumo
              </span>
            )}
          </div>
          <CatalogTechnicalName item={item} />
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            {qty(item.cantidad)} {item.unidad} · {esInsumo(item)
              ? "entrega sin regreso"
              : tramos.length === 1 ? "1 viaje" : `${tramos.length} viajes`}
          </div>
        </div>
        {/* El botón vive acá y no sólo en Materiales porque es acá donde se ve
            el problema: mirás el riel, ves un Retiro que nunca va a pasar y lo
            corregís sin cambiar de pestaña. */}
        {!item.es_resultado && !item.no_lleva && onInsumo && (
          <button
            type="button"
            onClick={() => onInsumo(item)}
            title={esInsumo(item)
              ? "Volver a tratarlo como pieza: sale, lo trabajan y vuelve"
              : "Es materia prima del taller: se entrega y no vuelve"}
            style={{
              ...BUTTON,
              minHeight: 27,
              padding: "3px 8px",
              fontSize: 11,
              flexShrink: 0,
              color: esInsumo(item) ? C.teal : C.dim,
              borderColor: esInsumo(item) ? C.tealB : C.border,
            }}
          >
            {esInsumo(item) ? "Es pieza" : "Es insumo"}
          </button>
        )}
      </div>
      <CircuitoMaterial
        process={process}
        item={item}
        tramos={tramos}
        onMove={onMove}
        onReady={onReady}
        onPedirCompra={onPedirCompra}
        onSkipPurchase={onSkipPurchase}
      />
    </article>
  );
}

function TransformationSource({ process, row, onMove, onReady, onPedirCompra = null, onSkipPurchase = null }) {
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
        <FotoMaterial item={row.item} size={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>
            {row.item.descripcion}
          </div>
          <CatalogTechnicalName item={row.item} compact />
          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
            {qty(row.item.cantidad)} {row.item.unidad}
          </div>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          color: complete ? C.green : C.dim,
          fontSize: 11,
          fontWeight: 700,
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
        onReady={onReady}
        onPedirCompra={onPedirCompra}
        onSkipPurchase={onSkipPurchase}
      />
    </div>
  );
}

function TransformationFlow({
  process,
  result,
  sources,
  onMove,
  onReady,
  onPedirCompra = null,
  onSkipPurchase = null,
}) {
  const { sourcesReady, resultHasJourney, resultReady, complete, pendingSources } =
    transformationState({ result, sources });
  const resultItem = result.item;
  // Un conjunto sin componentes no tiene "0 pendientes": no está armado. Decirlo
  // así evita que se lea como que no falta nada.
  const estadoTexto = complete
    ? "Circuito completo"
    : sourcesReady
      ? "Conjunto listo"
      : sources.length === 0
        ? "Sin componentes cargados"
        : `${pendingSources} componente${pendingSources === 1 ? "" : "s"} pendiente${pendingSources === 1 ? "" : "s"}`;

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
            <span style={{ color: C.text, fontSize: 14, fontWeight: 750 }}>
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
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}>
              <GitMerge size={10} /> {sources.length} componentes
            </span>
          </div>
          <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.4, marginTop: 3 }}>
            Los componentes completan su primer recorrido y convergen en un único ítem para el viaje siguiente.
          </div>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: complete ? C.green : sourcesReady ? C.blue : C.dim,
          fontSize: 12,
          fontWeight: 700,
        }}>
          {complete ? <Check size={13} /> : <GitMerge size={13} />}
          {estadoTexto}
        </span>
      </div>

      <div className="tor-transform-flow">
        <div style={{ display: "grid", alignContent: "start", gap: 7, minWidth: 0 }}>
          <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Preparación de componentes
          </div>
          <div className="tor-transform-sources">
            {sources.map((source) => (
              <TransformationSource
                key={source.item.id}
                process={process}
                row={source}
                onMove={onMove}
                onReady={onReady}
                onPedirCompra={onPedirCompra}
                onSkipPurchase={onSkipPurchase}
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
              <div style={{ color: C.blue, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Conjunto resultante
              </div>
              <div style={{ color: C.text, fontSize: 13.5, fontWeight: 750, marginTop: 3 }}>
                {resultItem.descripcion}
              </div>
              <CatalogTechnicalName item={resultItem} compact />
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
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
              fontSize: 11,
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
              onReady={onReady}
            />
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 9px",
              borderRadius: 9,
              border: `1px solid ${sourcesReady ? C.greenB : C.border}`,
              background: sourcesReady ? C.greenL : C.panel2,
              color: sourcesReady ? C.green : C.dim,
              fontSize: 12, fontWeight: 650,
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

function RecorridosPorItem({ process, onMove, onReady, query = "", onPedirCompra = null, onSkipPurchase = null, onInsumo = null }) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  // Lo que esta obra no lleva no entra al circuito: queda a la vista en
  // Materiales, tachado, para que se sepa que fue una decisión.
  const items = (process.items || []).filter((row) => row.activo !== false && !row.no_lleva);
  // Un componente sin viajes todavía es parte de su conjunto. Si se cae de la
  // lista, la formación queda "sin componentes" y —antes de blockIsComplete— el
  // grupo entero se daba por terminado sin que hubiera salido nada.
  const clavesDeConjunto = new Set(
    items.filter((row) => row.es_resultado).flatMap((row) => row.resultado_de || []),
  );
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
    .filter((row) => row.tramos.length > 0
      || (row.item.es_resultado && row.item.resultado_de?.length > 0)
      || clavesDeConjunto.has(row.item.clave));
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
        <div style={{ color: C.muted, fontSize: 12.5, fontWeight: 700 }}>No encontramos ese material</div>
        <div style={{ fontSize: 12 }}>Probá con el nombre, el grupo, Tornería o Plegadora.</div>
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
            <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Circuito por material</span>
          </div>
          <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.45, marginTop: 3 }}>
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
              fontSize: 11,
              fontWeight: 650,
              whiteSpace: "nowrap",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {visibleGroups.map(([group, blocks]) => {
        const completed = blocks.filter(blockIsComplete).length;
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
                fontSize: 12,
                fontWeight: 700,
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
                fontSize: 11,
                fontWeight: 700,
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
                    onReady={onReady}
                    onPedirCompra={onPedirCompra}
                    onSkipPurchase={onSkipPurchase}
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
                    onReady={onReady}
                    index={i}
                    onPedirCompra={onPedirCompra}
                    onSkipPurchase={onSkipPurchase}
                    onInsumo={onInsumo}
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
        placeholder="Buscar material, conjunto o destino…"
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
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 700 }}>Compra del material</span>
          </div>
          <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.45, marginTop: 3 }}>
            {promedio != null
              ? `Hasta ahora el material tardó ${promedio} ${promedio === 1 ? "día" : "días"} promedio en llegar.`
              : "Todavía no hay material recibido para calcular un promedio."}
          </div>
        </div>
        {sinPedir.length > 0 && onPedirCompra && (
          <button
            type="button"
            onClick={() => onPedirCompra(sinPedir)}
            style={{ ...PRIMARY_BUTTON, flexShrink: 0, minHeight: 36, fontWeight: 700 }}
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
            fontSize: 12,
            fontWeight: 700,
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
            fontSize: 12,
            fontWeight: 700,
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
  onReady,
  onEditOperation,
  onNewOperation,
  onEditItem,
  search,
  onSearch,
  showSearch = true,
  onPedirCompra,
  onSkipPurchase,
  onInsumo,
}) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  const [showManagement, setShowManagement] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {showSearch && <CircuitSearch value={search} onChange={onSearch} />}

      {/* La plantilla de la línea copia items y viajes por separado. Si alguien
          cargó los materiales y no los pasos, la obra queda sin circuito: no hay
          nada que mover y la pantalla no lo explicaba. */}
      {!operations.length && (
        <section style={{
          display: "grid",
          gap: 6,
          padding: "12px 13px",
          borderRadius: 13,
          border: `1px solid ${C.redB}`,
          background: C.redL,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.red, fontSize: 12.5, fontWeight: 700 }}>
            <AlertTriangle size={14} /> Esta obra no tiene viajes cargados
          </span>
          <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.45 }}>
            La plantilla de {process.obra?.linea_nombre || "la línea"} trajo los materiales pero
            ningún paso del circuito, así que no hay nada que enviar ni recibir. Cargalos desde
            «Gestión de envíos y pasos», acá abajo.
          </span>
        </section>
      )}

      <CompraResumen process={process} onPedirCompra={onPedirCompra} />

      <RecorridosPorItem
        process={process}
        onMove={onMove}
        onReady={onReady}
        query={search}
        onPedirCompra={onPedirCompra}
        onSkipPurchase={onSkipPurchase}
        onInsumo={onInsumo}
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
            <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 700 }}>
              Gestión de envíos y pasos
            </span>
            <span style={{ display: "block", color: C.dim, fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
              Editar destinos externos, piezas, cantidades y movimientos anteriores.
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 12, fontWeight: 650 }}>
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
                <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>Envíos configurados</div>
                <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
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
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>
                    {group}
                  </span>
                  <span style={{ color: C.dim, fontSize: 11 }}>
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

function MaterialTab({ process, onEdit, onNew, onStatus, onConfirm, onPedirCompra, onNoLleva, onInsumo }) {
  const items = (process.items || []).filter((row) => row.activo !== false);
  const itemsByKey = new Map(items.map((row) => [row.clave, row]));
  const sinPedir = items.filter(
    (row) => !row.es_resultado && !row.no_lleva && row.compra_estado === "pendiente_solicitud",
  );
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Materiales del proceso</div>
          <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.45, marginTop: 3 }}>
            Materiales comprados y conjuntos que se forman durante el circuito.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          {sinPedir.length > 0 && onPedirCompra && (
            <button
              type="button"
              onClick={() => onPedirCompra(sinPedir)}
              style={{ ...PRIMARY_BUTTON, fontWeight: 700 }}
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
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" }}>
              {group}
            </span>
          </div>
          {rows.map((item) => {
            const unresolved = item.requiere_confirmacion && !item.confirmado_at && !item.no_lleva;
            return (
              <div key={item.id} style={{
                display: "grid",
                gridTemplateColumns: fotoDelMaterial(item) ? "auto minmax(0,1fr) auto" : "minmax(0,1fr) auto",
                gap: 10,
                padding: 11,
                borderRadius: 12,
                border: `1px solid ${unresolved ? C.redB : C.border}`,
                background: unresolved ? C.redL : C.panel,
                // No lleva: sigue a la vista pero apagado. Esconderlo haría
                // dudar de si se decidió o si alguien lo borró.
                opacity: item.no_lleva ? 0.55 : 1,
              }}>
                <FotoMaterial item={item} size={48} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{
                      color: C.text,
                      fontSize: 12.5,
                      fontWeight: 700,
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
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}>
                        No lleva
                      </span>
                    )}
                    {item.es_insumo && (
                      <span title="Se entrega al taller y no vuelve" style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: `1px solid ${C.tealB}`,
                        background: C.tealL,
                        color: C.teal,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                      }}>
                        Insumo
                      </span>
                    )}
                    {item.es_resultado ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: C.blue,
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        <Boxes size={12} /> Conjunto resultante
                      </span>
                    ) : item.material_id ? (
                      <span title="Vinculado al catálogo" style={{ display: "inline-flex", color: C.green }}>
                        <Link2 size={12} />
                      </span>
                    ) : (
                      <span style={{ color: C.red, fontSize: 11, fontWeight: 650 }}>Sin catálogo</span>
                    )}
                  </div>
                  <CatalogTechnicalName item={item} compact />
                  <RecepcionAnticipada item={item} />
                  {!!item.planos?.length && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      flexWrap: "wrap",
                      marginTop: 6,
                    }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: C.blue,
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        <FileText size={11} /> {item.planos.length} {item.planos.length === 1 ? "plano" : "planos"}
                      </span>
                      {item.planos.slice(0, 3).map((plano, index) => (
                        <a
                          key={plano.path || plano.url || index}
                          href={plano.url}
                          target="_blank"
                          rel="noreferrer"
                          title={plano.name}
                          style={{
                            maxWidth: 150,
                            padding: "2px 7px",
                            borderRadius: 999,
                            border: `1px solid ${C.blueB}`,
                            background: C.blueL,
                            color: C.blue,
                            fontSize: 11,
                            fontWeight: 650,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textDecoration: "none",
                          }}
                        >
                          {plano.name || `Plano ${index + 1}`}
                        </a>
                      ))}
                      {item.planos.length > 3 && (
                        <span style={{ color: C.dim, fontSize: 11 }}>+{item.planos.length - 3}</span>
                      )}
                    </div>
                  )}
                  <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                    {qty(item.cantidad)} {item.unidad}
                    {item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}
                    {item.solicitado_por_torneria ? " · solicitado por Tornería" : ""}
                  </div>
                  {/* El reloj de la compra, en una línea: hasta ahora no quedaba
                      registro de cuánto tardó nada. */}
                  {(item.solicitado_at || item.recibido_astillero_at) && (
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {item.solicitado_at && <span>Pedido {fmtDate(item.solicitado_at, false)}</span>}
                      {item.recibido_astillero_at && <span>· Llegó {fmtDate(item.recibido_astillero_at, false)}</span>}
                      {diasEntre(item.solicitado_at, item.recibido_astillero_at) != null && (
                        <span style={{ color: C.green, fontWeight: 700 }}>
                          · {diasEntre(item.solicitado_at, item.recibido_astillero_at)} días
                        </span>
                      )}
                      {item.purchase_request_id && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.blue, fontWeight: 650 }}>
                          <ShoppingCart size={10} /> vinculado a compras
                        </span>
                      )}
                    </div>
                  )}
                  {item.es_resultado && item.resultado_de?.length > 0 && (
                    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.4, marginTop: 5 }}>
                      Se arma con: {item.resultado_de
                        .map((key) => itemsByKey.get(key)?.descripcion || key)
                        .join(" + ")}
                    </div>
                  )}
                  {unresolved && (
                    <div style={{ color: C.red, fontSize: 12, lineHeight: 1.4, marginTop: 5 }}>
                      <b>Confirmar:</b> {item.alerta || "dato pendiente antes del envío."}
                    </div>
                  )}
                  {item.confirmado_at && (
                    <div style={{ color: C.green, fontSize: 11, marginTop: 5 }}>
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
                      fontSize: 11,
                      fontWeight: 700,
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
                      fontSize: 11,
                      fontWeight: 700,
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
                        fontSize: 12,
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
                          fontSize: 12,
                          color: item.no_lleva ? C.blue : C.dim,
                          borderColor: item.no_lleva ? C.blueB : C.border,
                        }}
                      >
                        {item.no_lleva ? "Sí lleva" : "No lleva"}
                      </button>
                    )}
                    {/* Un conjunto es por definición algo que se arma y vuelve:
                        no puede ser insumo. */}
                    {!item.es_resultado && !item.no_lleva && onInsumo && (
                      <button
                        type="button"
                        onClick={() => onInsumo(item)}
                        title={item.es_insumo
                          ? "Volver a tratarla como pieza: sale, la trabajan y vuelve"
                          : "Es materia prima del taller: se entrega y no vuelve"}
                        style={{
                          ...BUTTON,
                          minHeight: 31,
                          padding: "4px 9px",
                          fontSize: 12,
                          color: item.es_insumo ? C.teal : C.dim,
                          borderColor: item.es_insumo ? C.tealB : C.border,
                        }}
                      >
                        {item.es_insumo ? "Es pieza" : "Es insumo"}
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
      title: movement.tipo === "salida" ? `Envío a ${workshopName(operation)}` : "Regreso al astillero",
      description: movement.flete
        ? `${operation.nombre} · Flete conjunto${movement.flete.remito ? ` · Remito ${movement.flete.remito}` : ""}`
        : operation.nombre,
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
        preparacion: event.accion === "listo_para_retirar"
          ? "Listo para retirar"
          : event.accion === "listo_para_enviar"
            ? "Listo para enviar"
            : "Preparación reabierta",
        flete: event.accion === "flete_salida" ? "Flete de salida" : "Flete de retiro",
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
        <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Registro de actividad</div>
        <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}>
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
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 700 }}>{event.title}</div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.description} · {event.actor}
            </div>
          </div>
          <span style={{ color: C.dim, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(event.date)}</span>
        </button>
      ))}
    </div>
  );
}


// ── La pantalla de obras del celular ────────────────────────────────────────

export default function ObrasMovil({
  processes,
  selected,
  onSelect,
  detalleAbierto,
  onVolver,
  onNuevo,
  lista,
  setLista,
  tab,
  setTab,
  acciones,
}) {
  const [search, setSearch] = useState("");
  const [circuitSearch, setCircuitSearch] = useState("");
  const enCurso = processes.filter((p) => !enArchivo(p));
  const archivo = processes.filter(enArchivo);
  const term = search.trim().toLowerCase();
  const visibles = (lista === "archivo" ? archivo : enCurso).filter((p) => !term
    || `${p.obra?.codigo || ""} ${p.obra?.linea_nombre || ""} ${p.nombre || ""}`.toLowerCase().includes(term));

  if (!detalleAbierto || !selected) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ProcessList
          processes={visibles}
          selectedId={selected?.id}
          search={search}
          setSearch={setSearch}
          status={lista === "archivo" ? "archivo" : "curso"}
          setStatus={setLista}
          conteos={{ curso: enCurso.length, archivo: archivo.length }}
          onSelect={onSelect}
          onNew={onNuevo}
        />
      </div>
    );
  }

  const progreso = processProgress(selected);
  const pendientes = enArchivo(selected) ? [] : datosPorConfirmar(selected);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 52, padding: "6px 10px",
        borderBottom: `1px solid ${C.border}`, background: C.topbarSoft,
      }}>
        <button type="button" onClick={onVolver} aria-label="Volver a las obras" style={{ ...BUTTON, width: 40, minHeight: 40, padding: 0, flexShrink: 0 }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text, fontSize: 16, fontWeight: 700 }}>
            {selected.obra?.codigo}
          </span>
          <span style={{ color: C.blue, fontSize: 12, fontWeight: 650, whiteSpace: "nowrap" }}>
            {selected.obra?.linea_nombre || "Sin línea"}
          </span>
        </div>
        {pendientes.length > 0 && (
          <button
            type="button"
            onClick={() => { setTab("materiales"); acciones.onEditItem(pendientes[0]); }}
            title={`${pendientes.length} datos por confirmar`}
            style={{
              minWidth: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 12, fontWeight: 700, fontFamily: C.sans,
            }}
          >
            {pendientes.length}
          </button>
        )}
        <span style={{ color: progreso === 100 ? C.green : C.blue, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {progreso}%
        </span>
        <MenuDeObra
          process={selected}
          isMobile
          onEdit={acciones.onEditProcess}
          onArchive={acciones.onArchive}
          onReopen={acciones.onReopen}
          onDelete={acciones.onDelete}
        />
      </div>

      <div style={{ flexShrink: 0, display: "flex", gap: 5, padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(([value, label, TabIcon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{
              ...BUTTON,
              minHeight: 40,
              flex: "1 1 0",
              padding: "5px 10px",
              color: tab === value ? C.blue : C.dim,
              borderColor: tab === value ? C.blueB : "transparent",
              background: tab === value ? C.blueL : "transparent",
            }}
          >
            {createElement(TabIcon, { size: 14 })} {label}
          </button>
        ))}
      </div>

      {tab === "circuito" && (
        <div style={{ flexShrink: 0, padding: "6px 8px", borderBottom: `1px solid ${C.border}`, background: C.panel }}>
          <CircuitSearch value={circuitSearch} onChange={setCircuitSearch} compact />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
        {tab === "circuito" && (
          <CircuitTab
            key={selected.id}
            process={selected}
            onMove={acciones.onMove}
            onReady={acciones.onReady}
            onEditOperation={acciones.onEditOperation}
            onNewOperation={acciones.onNewOperation}
            onEditItem={acciones.onEditItem}
            search={circuitSearch}
            onSearch={setCircuitSearch}
            showSearch={false}
            onPedirCompra={(items) => acciones.onPedir(selected, items)}
            onSkipPurchase={acciones.onSkipPurchase}
            onInsumo={acciones.onInsumo}
          />
        )}
        {tab === "materiales" && (
          <MaterialTab
            process={selected}
            onEdit={acciones.onEditItem}
            onNew={acciones.onNewItem}
            onStatus={acciones.onStatus}
            onConfirm={acciones.onConfirm}
            onPedirCompra={(items) => acciones.onPedir(selected, items)}
            onNoLleva={acciones.onNoLleva}
            onInsumo={acciones.onInsumo}
          />
        )}
        {tab === "historial" && (
          <HistoryTab process={selected} onOpenMovement={acciones.onOpenMovement} />
        )}
      </div>
    </div>
  );
}
