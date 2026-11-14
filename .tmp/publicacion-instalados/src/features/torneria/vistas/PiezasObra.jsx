import { createElement, useState } from "react";
import {
  ArrowRight, Check, CheckCircle2, CircleDashed, Clock3, Edit3, Hourglass, PackageOpen, ShoppingCart, SkipForward, Truck,
  Undo2, Wrench,
} from "lucide-react";
import { recepcionAnticipada } from "../recepcionesAnticipadas";
import {
  DEMORA_DIAS, ETAPAS, cantidadTexto, contarEtapas, diasEntre, groupRows, plural, primeraSalida, workshopName,
} from "../torneriaEstado";
import { GROUP_COLORS, circuitoNodos } from "../circuitoDatos";
import { CatalogTechnicalName, CircuitoRail, FotoMaterial, RecepcionAnticipada } from "../circuito";
import { Dias } from "../torneriaUi";

const ICONO_ETAPA = {
  comprar: ShoppingCart,
  compra: Clock3,
  espera: Hourglass,
  preparar: Check,
  enviar: Truck,
  taller: Wrench,
  retirar: PackageOpen,
  sin_viaje: CircleDashed,
  terminado: CheckCircle2,
};

const ORDEN_CHIPS = ["comprar", "compra", "preparar", "enviar", "taller", "retirar", "espera", "sin_viaje", "terminado"];

// Qué se dice de una pieza según su etapa, en una línea.
function detalleEtapa(pieza) {
  const { etapa, item, operation } = pieza;
  const destino = operation ? workshopName(operation) : pieza.taller ? workshopName(pieza.taller) : null;
  switch (etapa) {
    case "comprar":
      return recepcionAnticipada(item).tieneIngreso ? "Sin pedir · hay ingreso parcial en Pañol" : `Sin pedir${item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}`;
    case "compra":
      return `${item.compra_estado === "comprado" ? "Comprado" : "Pedido"}${pieza.dias != null ? ` hace ${pieza.dias} d` : ""}${item.proveedor_compra ? ` · ${item.proveedor_compra}` : ""}`;
    case "espera":
      if (pieza.formaEnAstillero) return "Se arma cuando vuelvan sus componentes";
      return `Espera: ${pieza.dependencias.map((d) => d.nombre).join(", ")}`;
    case "preparar":
      return `En el astillero · viaje ${operation.viaje || 1} a ${destino}`;
    case "enviar":
      return `Lista para ${pieza.insumo ? "entregar" : "enviar"} a ${destino}`;
    case "taller":
      return `En ${destino} · viaje ${operation.viaje || 1}${operation.estado === "parcial" ? " · volvió una parte" : ""}`;
    case "retirar":
      return `Lista para retirar de ${destino}`;
    case "terminado":
      if (pieza.formaEnAstillero) return "Armado en el astillero";
      return pieza.insumo ? "Entregado en el taller" : "Volvió al astillero";
    default:
      return "Sin viajes cargados para este material";
  }
}

function FilaPieza({ pieza, acciones }) {
  const [abierta, setAbierta] = useState(false);
  const { etapa, item, operation, process } = pieza;
  const meta = ETAPAS[etapa];
  const hecha = etapa === "terminado";
  const insumo = pieza.insumo;

  // La acción que mueve la pieza a la etapa siguiente. Una sola por fila.
  let principal = null;
  if (etapa === "comprar" && acciones.onPedir) {
    principal = { texto: recepcionAnticipada(item).tieneIngreso ? "Pedir faltante" : "Pedir", Icono: ShoppingCart, fn: () => acciones.onPedir(process, [item]) };
  } else if (etapa === "preparar") {
    principal = { texto: "Marcar lista", Icono: Check, fn: () => acciones.onReady(pieza.pendientesEnvio, "envio", true) };
  } else if (etapa === "enviar") {
    principal = { texto: insumo ? "Registrar entrega" : "Registrar salida", Icono: Truck, fn: () => acciones.onMove(operation, null, "salida"), primario: true };
  } else if (etapa === "taller") {
    principal = { texto: "Lista para retirar", Icono: Check, fn: () => acciones.onReady(pieza.pendientesRetiro, "retiro", true) };
  } else if (etapa === "retirar") {
    principal = { texto: "Registrar regreso", Icono: PackageOpen, fn: () => acciones.onMove(operation, null, "recepcion"), primario: true };
  }

  const diasCompra = diasEntre(item.solicitado_at, item.recibido_astillero_at);
  const diasEspera = diasEntre(item.recibido_astillero_at, primeraSalida(pieza.tramos));
  const conCompra = pieza.conCompra;
  const nodos = pieza.tramos.length || conCompra ? circuitoNodos({ item, tramos: pieza.tramos, conCompra }) : [];
  const puedeSaltear = ["comprar", "compra"].includes(etapa) && ["pendiente_solicitud", "solicitado"].includes(item.compra_estado);

  return (
    <div className={`tor-pieza${abierta ? " abierta" : ""}${hecha ? " hecha" : ""}`}>
      <div className="tor-pieza-fila">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="tor-pieza-ic" data-tono={etapa === "taller" && operation?.tipo === "plegadora" ? "violeta" : meta.tono}>
            {createElement(ICONO_ETAPA[etapa] || CircleDashed, { size: 16 })}
          </span>
          <FotoMaterial item={item} size={46} />
        </div>
        <button type="button" className="tor-pieza-txt" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          <div className="tor-pieza-nom">
            {item.descripcion}
            {item.es_resultado && <span className="tor-tag" data-tono="azul">Conjunto</span>}
            {insumo && <span className="tor-tag" data-tono="teal">Insumo</span>}
            {item.requiere_confirmacion && !item.confirmado_at && <span className="tor-tag" data-tono="cian">Confirmar dato</span>}
          </div>
          <div className="tor-pieza-sub">
            <span>{detalleEtapa(pieza)}</span>
            {(etapa === "taller" || etapa === "retirar") && <Dias dias={pieza.dias} demora={DEMORA_DIAS} />}
          </div>
          <div style={{ marginTop: 3 }}><CatalogTechnicalName item={item} /></div>
        </button>
        {principal && (
          <div className="tor-pieza-acc">
            <button type="button" className={`ui-btn chico ${principal.primario ? "ui-btn-primario" : "ui-btn-suave"}`} onClick={principal.fn}>
              <principal.Icono size={15} /> {principal.texto}
            </button>
          </div>
        )}
      </div>

      {/* El recorrido a la vista: de dónde viene la pieza y adónde va, sin tocar
          nada. Sólo se esconde en las terminadas, que ya no tienen novedad. */}
      {!hecha && (nodos.length > 0 || pieza.componentes?.length > 0) && (
        <div className="tor-pieza-riel">
          {pieza.componentes?.length > 0 && (
            <div className="tor-forma">
              {pieza.componentes.map((c) => c.item.descripcion).join(" + ")}
              <ArrowRight size={13} />
              <b>{item.descripcion}</b>
            </div>
          )}
          {nodos.length > 0 && <CircuitoRail nodos={nodos} />}
        </div>
      )}

      {abierta && (
        <div className="tor-pieza-mas">
          {hecha && nodos.length > 0 && <CircuitoRail nodos={nodos} />}
          <RecepcionAnticipada item={item} />
          <div className="linea">
            {cantidadTexto(item.cantidad, item.unidad)}
            {pieza.tramos.length > 0 && !insumo && ` · ${pieza.tramos.length} ${plural(pieza.tramos.length, "viaje", "viajes")}`}
            {insumo && " · se entrega y no vuelve"}
            {diasCompra != null && <> · compra: <b>{diasCompra} {plural(diasCompra, "día", "días")}</b></>}
            {diasEspera != null && <> · esperó {diasEspera} {plural(diasEspera, "día", "días")} antes de salir</>}
          </div>
          {pieza.parteDe && <div className="linea">Parte de: <b>{pieza.parteDe.descripcion}</b></div>}
          {pieza.componentes?.length > 0 && (
            <div className="linea">Se forma con: <b>{pieza.componentes.map((c) => c.item.descripcion).join(" + ")}</b></div>
          )}
          {etapa === "espera" && pieza.dependencias?.length > 0 && (
            <div className="linea">Antes tiene que volver: <b>{pieza.dependencias.map((d) => d.nombre).join(", ")}</b>. Se puede adelantar igual; la excepción queda registrada.</div>
          )}
          {item.requiere_confirmacion && !item.confirmado_at && (
            <div className="linea alerta">Confirmar: {item.alerta || "dato pendiente antes del envío."}</div>
          )}
          <div className="acciones">
            {etapa === "espera" && pieza.pendientesEnvio?.length > 0 && (
              <button type="button" className="ui-btn chico" onClick={() => acciones.onReady(pieza.pendientesEnvio, "envio", true)}>
                <Check size={14} /> Marcar lista igual
              </button>
            )}
            {(etapa === "enviar" || etapa === "retirar") && (
              <button
                type="button"
                className="ui-btn chico"
                onClick={() => acciones.onReady(etapa === "enviar" ? pieza.pendientesEnvio : pieza.pendientesRetiro, etapa === "enviar" ? "envio" : "retiro", false)}
              >
                <Undo2 size={14} /> Quitar listo
              </button>
            )}
            {puedeSaltear && acciones.onSkipPurchase && (
              <button type="button" className="ui-btn chico" onClick={() => acciones.onSkipPurchase(item)}>
                <SkipForward size={14} /> {item.compra_estado === "solicitado" ? "Cancelar pedido y saltear" : "Saltear compra"}
              </button>
            )}
            {!item.es_resultado && !item.virtual && acciones.onInsumo && (
              <button type="button" className="ui-btn chico" onClick={() => acciones.onInsumo(item)} title={insumo ? "Sale, lo trabajan y vuelve" : "Se entrega al taller y no vuelve"}>
                {insumo ? "Tratar como pieza" : "Es insumo"}
              </button>
            )}
            {!item.virtual && (
              <button type="button" className="ui-btn chico ui-btn-fantasma" onClick={() => acciones.onEditItem(item)}>
                <Edit3 size={14} /> Editar material
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PiezasObra({ piezas, acciones }) {
  const [filtro, setFiltro] = useState("todas");
  const cuenta = contarEtapas(piezas);
  const visibles = filtro === "todas" ? piezas : piezas.filter((p) => p.etapa === filtro);
  // Dentro de cada grupo: primero lo que hay que hacer, al final lo terminado.
  const grupos = groupRows(visibles).map(([grupo, filas]) => [
    grupo,
    [...filas].sort((a, b) => ETAPAS[a.etapa].orden - ETAPAS[b.etapa].orden),
  ]);

  if (!piezas.length) {
    return <div className="tor-vacio chico">Esta obra no tiene materiales en el circuito.</div>;
  }

  return (
    <div className="tor-piezas">
      <div className="tor-scroll-x" role="group" aria-label="Filtrar por etapa" style={{ marginBottom: 4 }}>
        <button type="button" className={`tor-chip${filtro === "todas" ? " on" : ""}`} onClick={() => setFiltro("todas")}>
          Todas <span className="n">{piezas.length}</span>
        </button>
        {ORDEN_CHIPS.filter((key) => cuenta[key] > 0).map((key) => (
          <button
            key={key}
            type="button"
            className={`tor-chip${filtro === key ? " on" : ""}`}
            data-tono={ETAPAS[key].tono}
            onClick={() => setFiltro(filtro === key ? "todas" : key)}
          >
            <span className="pto" />{ETAPAS[key].corto} <span className="n">{cuenta[key]}</span>
          </button>
        ))}
      </div>
      {grupos.map(([grupo, filas]) => {
        const hechas = filas.filter((p) => p.etapa === "terminado").length;
        return (
          <div key={grupo} style={{ display: "grid", gap: 6 }}>
            <div className="tor-grupo-cab" style={{ "--g": GROUP_COLORS[grupo] || "var(--dim)" }}>
              <span className="pto" />
              <span className="nom">{grupo}</span>
              <span className="n">{hechas}/{filas.length}</span>
              <span className="regla" />
            </div>
            {filas.map((pieza) => <FilaPieza key={pieza.key} pieza={pieza} acciones={acciones} />)}
          </div>
        );
      })}
    </div>
  );
}
