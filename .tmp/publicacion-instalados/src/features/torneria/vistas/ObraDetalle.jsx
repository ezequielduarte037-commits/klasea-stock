import { createElement, useState } from "react";
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, Clock3, Edit3,
  Hourglass, MapPin, MoreHorizontal, PackageOpen, Plus, Settings2, ShoppingCart, Trash2, Truck, User, Wrench,
} from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  DEMORA_DIAS, circuitoCompleto, contarEtapas, datosPorConfirmar, enArchivo, fmtDate, groupRows, motivoArchivo,
  plural, processProgress, tieneCircuito, workshopName,
} from "../torneriaEstado";
import { GROUP_COLORS } from "../circuitoDatos";
import { OperationCard } from "../circuito";
import { operationDestinationLabel } from "../torneriaLabels";
import { Anillo, MenuAcciones, Opcion, Tag } from "../torneriaUi";
import PiezasObra from "./PiezasObra";
import MaterialesObra from "./MaterialesObra";

const ESTADO_PROCESO = {
  borrador: ["Borrador", "neutro"],
  pausado: ["Pausada", "violeta"],
  completado: ["Archivada", "neutro"],
  cancelado: ["Cancelada", "neutro"],
};

// Acciones de la obra que no son de todos los días. Archivar a mano y borrar
// van acá y no como botones sueltos: un tacho rojo al lado de "editar" es una
// invitación a equivocarse con el dedo.
export function MenuDeObra({ process, isMobile, onEdit, onArchive, onReopen, onDelete }) {
  const [abierto, setAbierto] = useState(false);
  const archivo = enArchivo(process);
  // Sólo se reabre lo que alguien cerró a mano: una obra con todo el circuito
  // de vuelta está en el Archivo por lo que es, no por su estado.
  const cerradaAMano = ["completado", "cancelado"].includes(process.estado) && !circuitoCompleto(process);
  const cerrar = (accion) => () => { setAbierto(false); accion(); };
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className={`tor-btn-ic${abierto ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones de la obra"
        onClick={() => setAbierto((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {abierto && (
        <MenuAcciones
          hoja={isMobile}
          titulo={`${process.obra?.codigo || "Obra"} · ${process.obra?.linea_nombre || "Sin línea"}`}
          onClose={() => setAbierto(false)}
        >
          <Opcion icon={Settings2} label="Editar seguimiento" hint="Estado, talleres, responsable y notas" onClick={cerrar(onEdit)} />
          {cerradaAMano ? (
            <Opcion icon={ArchiveRestore} label="Reabrir obra" hint="Vuelve a En curso y al Panel" onClick={cerrar(onReopen)} />
          ) : !archivo && (
            <Opcion icon={Archive} label="Archivar obra" hint="La cierra antes de terminar el circuito; se puede reabrir" onClick={cerrar(onArchive)} />
          )}
          <div className="tor-opcion-sep" />
          <Opcion
            icon={Trash2}
            peligro
            label="Borrar seguimiento"
            hint="Elimina el circuito, los movimientos y las fotos. No se puede deshacer"
            onClick={cerrar(onDelete)}
          />
        </MenuAcciones>
      )}
    </div>
  );
}

// "Ahora": lo que toca hacer en esta obra, en orden de urgencia, con la acción
// al lado. Es lo primero que se mira al abrir una obra.
function Ahora({ process, piezas, acciones, onVerMateriales }) {
  const confirm = useConfirm();
  const n = contarEtapas(piezas);
  const de = (etapa) => piezas.filter((p) => p.etapa === etapa);
  const motivo = motivoArchivo(process);
  const porConfirmar = enArchivo(process) ? [] : datosPorConfirmar(process);

  const lote = (lista, salida) => lista.flatMap((pieza) => (salida ? pieza.pendientesEnvio : pieza.pendientesRetiro).map((component) => ({
    process,
    operation: pieza.operation,
    component,
    cantidad: Math.max(0, salida
      ? Number(component.cantidad_requerida) - Number(component.cantidad_enviada)
      : Number(component.cantidad_enviada) - Number(component.cantidad_recibida)),
  })));
  const talleres = (lista) => [...new Set(lista.map((p) => workshopName(p.operation)))].join(" y ");
  const nombres = (lista) => {
    const n2 = lista.map((p) => p.item.descripcion);
    return n2.slice(0, 3).join(", ") + (n2.length > 3 ? ` y ${n2.length - 3} más` : "");
  };
  const maxDias = (lista) => lista.reduce((max, p) => Math.max(max, p.dias ?? -1), -1);

  const lineas = [];
  if (n.retirar) {
    const lista = de("retirar");
    lineas.push({
      key: "retirar", tono: "verde", Icono: PackageOpen,
      titulo: `Retirar ${n.retirar} ${plural(n.retirar, "pieza", "piezas")} de ${talleres(lista)}`,
      texto: `${n.retirar} ${plural(n.retirar, "lista", "listas")} para retirar del taller`,
      sub: nombres(lista),
      accion: { texto: "Registrar regreso", primario: true, fn: () => acciones.onBatch("recepcion", lote(lista, false)) },
    });
  }
  if (n.enviar) {
    const lista = de("enviar");
    lineas.push({
      key: "enviar", tono: "verde", Icono: Truck,
      titulo: `Mandar ${n.enviar} ${plural(n.enviar, "pieza", "piezas")} a ${talleres(lista)}`,
      texto: `${n.enviar} ${plural(n.enviar, "lista", "listas")} para enviar`,
      sub: nombres(lista),
      accion: { texto: "Registrar salida", primario: true, fn: () => acciones.onBatch("salida", lote(lista, true)) },
    });
  }
  if (n.comprar) {
    const lista = de("comprar");
    lineas.push({
      key: "comprar", tono: "cian", Icono: ShoppingCart,
      titulo: `Pedir ${n.comprar} ${plural(n.comprar, "material", "materiales")} a Compras`,
      texto: `${n.comprar} ${plural(n.comprar, "material", "materiales")} sin pedir`,
      sub: nombres(lista),
      accion: { texto: "Pedir a Compras", fn: () => acciones.onPedir(process, lista.map((p) => p.item)) },
    });
  }
  if (n.preparar) {
    const lista = de("preparar");
    lineas.push({
      key: "preparar", tono: "cian", Icono: Check,
      titulo: `Preparar ${n.preparar} ${plural(n.preparar, "pieza", "piezas")} para salir`,
      texto: `${n.preparar} en el astillero para preparar`,
      sub: nombres(lista),
      accion: {
        texto: n.preparar > 1 ? "Marcar todas listas" : "Marcar lista",
        fn: async () => {
          if (lista.length > 1) {
            const ok = await confirm({
              title: `¿Marcar ${lista.length} piezas como listas para enviar?`,
              message: "Quedan preparadas en el astillero esperando el flete.",
              confirmLabel: "Marcar todas",
            });
            if (!ok) return;
          }
          acciones.onReady(lista.flatMap((p) => p.pendientesEnvio), "envio", true);
        },
      },
    });
  }
  if (porConfirmar.length) {
    lineas.push({
      key: "confirmar", tono: "cian", Icono: AlertTriangle,
      titulo: `Confirmar ${porConfirmar.length} ${plural(porConfirmar.length, "dato", "datos")}`,
      texto: `${porConfirmar.length} ${plural(porConfirmar.length, "dato", "datos")} por confirmar antes de enviar`,
      sub: porConfirmar.slice(0, 3).map((i) => i.descripcion).join(", "),
      accion: { texto: "Revisar", fn: onVerMateriales },
    });
  }
  if (n.taller) {
    const lista = de("taller");
    const dias = maxDias(lista);
    lineas.push({
      key: "taller", tono: dias >= DEMORA_DIAS ? "rojo" : "azul", Icono: Wrench,
      titulo: `Esperando a ${talleres(lista)}`,
      texto: `${n.taller} en ${talleres(lista)}`,
      sub: dias >= 0 ? `La más vieja salió hace ${dias} ${plural(dias, "día", "días")}` : nombres(lista),
    });
  }
  if (n.compra) {
    const lista = de("compra");
    const dias = maxDias(lista);
    lineas.push({
      key: "compra", tono: dias >= DEMORA_DIAS ? "rojo" : "violeta", Icono: Clock3,
      titulo: "Esperando a Compras",
      texto: `${n.compra} en compra`,
      sub: dias >= 0 ? `El pedido más viejo es de hace ${dias} ${plural(dias, "día", "días")}` : nombres(lista),
    });
  }
  if (n.espera) {
    lineas.push({
      key: "espera", tono: "neutro", Icono: Hourglass,
      titulo: "Esperando pasos anteriores",
      texto: `${n.espera} ${plural(n.espera, "espera", "esperan")} que vuelva un paso anterior`,
      sub: nombres(de("espera")),
    });
  }

  if (motivo === "terminada" || (!lineas.length && n.terminado > 0)) {
    return (
      <section className="tor-ahora listo">
        <div className="tor-ahora-eyebrow">Ahora</div>
        <div className="tor-ahora-tit">Circuito completo</div>
        <div className="tor-ahora-txt">Todas las piezas volvieron al astillero. La obra ya figura en Terminadas y no suma al Panel.</div>
      </section>
    );
  }
  if (!lineas.length) return null;

  return (
    <section className="tor-ahora">
      <div className="tor-ahora-eyebrow">Ahora</div>
      <div className="tor-ahora-tit">{lineas[0].titulo}</div>
      <div className="tor-ahora-lineas">
        {lineas.map((linea) => (
          <div key={linea.key} className="tor-ahora-linea">
            <span className="tor-ahora-ic" data-tono={linea.tono}>{createElement(linea.Icono, { size: 16 })}</span>
            <div className="tor-ahora-linea-txt" style={{ minWidth: 0 }}>
              {linea.texto}
              {linea.sub && <small>{linea.sub}</small>}
            </div>
            {linea.accion && (
              <button
                type="button"
                className={`ui-btn chico ${linea.accion.primario ? "ui-btn-primario" : "ui-btn-suave"}`}
                onClick={linea.accion.fn}
              >
                {linea.accion.texto}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PasosObra({ process, acciones }) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p className="tor-bloque-txt" style={{ flex: "1 1 240px" }}>
          Los viajes del circuito: a qué taller va cada pieza, en qué orden y qué salió o volvió. Un paso puede llevar varias piezas en el mismo viaje.
        </p>
        <button type="button" className="ui-btn chico" onClick={acciones.onNewOperation}>
          <Plus size={15} /> Paso
        </button>
      </div>
      {!operations.length ? (
        <div className="tor-vacio chico">Todavía no hay pasos cargados.</div>
      ) : groupRows(operations).map(([grupo, filas]) => (
        <div key={grupo} style={{ display: "grid", gap: 8 }}>
          <div className="tor-grupo-cab" style={{ "--g": GROUP_COLORS[grupo] || "var(--dim)" }}>
            <span className="pto" />
            <span className="nom">{grupo}</span>
            <span className="n">{filas.filter((row) => row.estado === "recibido").length}/{filas.length}</span>
            <span className="regla" />
          </div>
          <div className="tor-pasos">
            {filas.map((operation) => (
              <OperationCard
                key={operation.id}
                process={process}
                operation={operation}
                onMove={acciones.onMove}
                onEdit={acciones.onEditOperation}
                onEditItem={acciones.onEditItem}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistorialObra({ process, onOpenMovement, limiteInicial = 30, paginar = true }) {
  // Un seguimiento junta cientos de eventos: se muestran los más nuevos.
  const [limite, setLimite] = useState(limiteInicial);
  const movimientos = (process.operaciones || []).flatMap((operation) =>
    (operation.movimientos || []).map((movement) => ({
      id: `movement-${movement.id}`,
      date: movement.fecha,
      title: movement.tipo === "salida" ? `Salió a ${workshopName(operation)}` : `Volvió de ${workshopName(operation)}`,
      description: movement.flete
        ? `${operation.nombre} · flete conjunto${movement.flete.remito ? ` · remito ${movement.flete.remito}` : ""}`
        : operation.nombre,
      actor: movement.responsable || "Sin responsable",
      tono: movement.tipo === "salida" ? "azul" : "verde",
      movement,
      operation,
    })),
  );
  const etiquetas = (event) => ({
    items: "Material actualizado",
    operaciones: "Circuito actualizado",
    proceso: "Seguimiento actualizado",
    preparacion: event.accion === "listo_para_retirar"
      ? "Marcado listo para retirar"
      : event.accion === "listo_para_enviar"
        ? "Marcado listo para enviar"
        : "Preparación reabierta",
    flete: event.accion === "flete_salida" ? "Flete de salida" : "Flete de retiro",
  }[event.entidad] || "Cambio registrado");
  const auditoria = (process.historial || [])
    .filter((event) => event.entidad !== "movimiento")
    .map((event) => ({
      id: `audit-${event.id}`,
      date: event.created_at,
      title: etiquetas(event),
      description: event.accion,
      actor: event.actor?.username || "Usuario",
      tono: "violeta",
    }));
  const rows = [...movimientos, ...auditoria].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!rows.length) return <div className="tor-vacio chico">Todavía no hay movimientos.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="tor-hist">
        {rows.slice(0, limite).map((event) => {
          const Elemento = event.movement ? "button" : "div";
          return (
            <Elemento
              key={event.id}
              {...(event.movement ? { type: "button", onClick: () => onOpenMovement(event.operation, event.movement) } : {})}
              className="tor-hist-item"
            >
              <span className="tor-hist-pto" data-tono={event.tono} />
              <div style={{ minWidth: 0 }}>
                <div className="tor-hist-acc">
                  {event.movement && (event.movement.tipo === "salida"
                    ? <ArrowRight size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                    : <ArrowLeft size={12} style={{ verticalAlign: -1, marginRight: 4 }} />)}
                  {event.title}
                </div>
                <div className="tor-hist-quien">{event.description} · {event.actor}</div>
              </div>
              <span className="tor-hist-fecha">{fmtDate(event.date)}</span>
            </Elemento>
          );
        })}
      </div>
      {paginar && rows.length > limite && (
        <button type="button" className="ui-btn chico" onClick={() => setLimite((v) => v + 30)}>
          Ver {Math.min(30, rows.length - limite)} más · quedan {rows.length - limite}
        </button>
      )}
    </div>
  );
}

function DatosObra({ process, onEditar }) {
  const datos = [
    ["Taller de Tornería", operationDestinationLabel({ tipo: "torneria", destino: process.taller_torneria })],
    ["Plegadora", operationDestinationLabel({ tipo: "plegadora", destino: process.taller_plegadora })],
    ["Responsable", process.responsable],
    ["Plantilla", process.plantilla?.nombre],
    ["Creado", process.created_at ? fmtDate(process.created_at, false) : null],
  ];
  return (
    <section className="tor-bloque">
      <div className="tor-bloque-cab">
        <h3>Datos de la obra</h3>
        <span className="der">
          <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={onEditar}><Edit3 size={14} /> Editar</button>
        </span>
      </div>
      <div className="tor-datos">
        {datos.map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <div className="tor-dato-et">{etiqueta}</div>
            <div className={`tor-dato-v${valor ? "" : " vacio"}`}>{valor || "—"}</div>
          </div>
        ))}
      </div>
      {process.notas && <div className="tor-obs">{process.notas}</div>}
    </section>
  );
}

const SECCIONES = [
  ["piezas", "Piezas"],
  ["materiales", "Materiales"],
  ["pasos", "Pasos"],
  ["historial", "Historial"],
];

export default function ObraDetalle({ process, piezas, isMobile, seccion, setSeccion, onVolver, acciones }) {
  const progreso = processProgress(process);
  const motivo = motivoArchivo(process);
  const estado = motivo === "terminada" ? ["Terminada", "verde"] : ESTADO_PROCESO[process.estado];
  const porConfirmar = enArchivo(process) ? 0 : datosPorConfirmar(process).length;
  const pasos = (process.operaciones || []).filter((row) => row.activa !== false).length;
  const cuentas = {
    piezas: piezas.length,
    materiales: (process.items || []).filter((row) => row.activo !== false).length,
    pasos,
  };
  const puedeReabrir = motivo && motivo !== "terminada" && ["completado", "cancelado"].includes(process.estado);

  return (
    <div className="tor-panel" key={process.id}>
      <button type="button" className="tor-volver-movil" onClick={onVolver}>
        <ChevronLeft size={18} /> Obras
      </button>

      <div className="tor-cab">
        <Anillo pct={progreso} size={58} grosor={5} />
        <div style={{ minWidth: 0 }}>
          <div className="tor-cab-tags">
            <Tag tono="azul">{process.obra?.linea_nombre || "Sin línea"}</Tag>
            {estado && <Tag tono={estado[1]}>{estado[0]}</Tag>}
          </div>
          <h2 className="tor-cab-tit">Obra <span className="mono">{process.obra?.codigo || process.nombre}</span></h2>
          <div className="tor-cab-sub">
            <span><MapPin size={13} /> {operationDestinationLabel({ tipo: "torneria", destino: process.taller_torneria })}</span>
            {process.responsable && <span><User size={13} /> {process.responsable}</span>}
            <span>{pasos} {plural(pasos, "paso", "pasos")} · {progreso}% del circuito</span>
          </div>
        </div>
        <div className="tor-cab-acc">
          <button type="button" className="ui-btn chico" onClick={acciones.onEditProcess}>
            <Edit3 size={14} /> Editar
          </button>
          <MenuDeObra
            process={process}
            isMobile={isMobile}
            onEdit={acciones.onEditProcess}
            onArchive={acciones.onArchive}
            onReopen={acciones.onReopen}
            onDelete={acciones.onDelete}
          />
        </div>
      </div>

      {motivo && motivo !== "terminada" && (
        <div className="tor-aviso" data-tono="neutro">
          <Archive size={16} />
          <span>
            <b>{motivo === "cancelada" ? "Seguimiento cancelado." : "Obra archivada."}</b>{" "}
            No suma al Panel ni a los pendientes. Todo su historial se conserva.
          </span>
          {puedeReabrir && (
            <button type="button" className="ui-btn chico" onClick={acciones.onReopen}>
              <ArchiveRestore size={14} /> Reabrir
            </button>
          )}
        </div>
      )}

      {/* La plantilla de la línea copia materiales y pasos por separado: una
          obra puede nacer con materiales y sin ningún viaje. */}
      {!tieneCircuito(process) && (
        <div className="tor-aviso" data-tono="rojo">
          <AlertTriangle size={16} />
          <span>
            <b>Esta obra no tiene viajes cargados.</b> La plantilla de {process.obra?.linea_nombre || "la línea"} trajo
            los materiales pero ningún paso del circuito, así que no hay nada que enviar ni recibir.
          </span>
          <button type="button" className="ui-btn chico" onClick={() => setSeccion("pasos")}>Cargar pasos</button>
        </div>
      )}

      {/* Con pantalla ancha el detalle va en dos columnas: lo que hay que hacer
          ("Ahora") queda fijo a la derecha mientras se recorren las piezas. En
          una columna, "Ahora" va primero. */}
      <div className="tor-panel-cuerpo">
        <aside className="tor-panel-lado">
          <Ahora process={process} piezas={piezas} acciones={acciones} onVerMateriales={() => setSeccion("materiales")} />
          <section className="tor-bloque tor-solo-ancho">
            <div className="tor-bloque-cab">
              <h3>Últimos movimientos</h3>
              <span className="der">
                <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => setSeccion("historial")}>Ver todo</button>
              </span>
            </div>
            <HistorialObra process={process} onOpenMovement={acciones.onOpenMovement} limiteInicial={8} paginar={false} />
          </section>
          <div className="tor-solo-ancho">
            <DatosObra process={process} onEditar={acciones.onEditProcess} />
          </div>
        </aside>

      <section className="tor-bloque tor-panel-main">
        <div className="tor-bloque-cab">
          <div className="tor-seg" role="tablist" aria-label="Secciones de la obra" style={{ maxWidth: "100%", overflowX: "auto" }}>
            {SECCIONES.map(([key, texto]) => (
              <button key={key} type="button" role="tab" aria-selected={seccion === key} className={seccion === key ? "on" : ""} onClick={() => setSeccion(key)}>
                {texto}
                {cuentas[key] != null && <span className="n">{cuentas[key]}</span>}
                {key === "materiales" && porConfirmar > 0 && <span className="n" style={{ color: "var(--cyan)" }}>· {porConfirmar}</span>}
              </button>
            ))}
          </div>
          {motivo === "terminada" && (
            <span className="der"><CheckCircle2 size={15} style={{ color: "var(--green)" }} /></span>
          )}
        </div>
        {seccion === "piezas" && <PiezasObra piezas={piezas} acciones={acciones} />}
        {seccion === "materiales" && (
          <MaterialesObra
            process={process}
            onEdit={acciones.onEditItem}
            onNew={acciones.onNewItem}
            onStatus={acciones.onStatus}
            onConfirm={acciones.onConfirm}
            onPedirCompra={(items) => acciones.onPedir(process, items)}
            onNoLleva={acciones.onNoLleva}
            onInsumo={acciones.onInsumo}
          />
        )}
        {seccion === "pasos" && <PasosObra process={process} acciones={acciones} />}
        {seccion === "historial" && <HistorialObra process={process} onOpenMovement={acciones.onOpenMovement} />}
      </section>
      </div>
    </div>
  );
}
