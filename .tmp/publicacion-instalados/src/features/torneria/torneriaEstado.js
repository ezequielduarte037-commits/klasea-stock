// Reglas de lectura de Tornería. Son funciones puras sobre lo que devuelve
// `fetchTorneriaProcesos`: el tablero, la lista de obras y el detalle de una
// obra leen todo de acá, así no pueden contar distinto.
//
// La idea que ordena el módulo: cada pieza de una obra está en UNA etapa.
//
//   Compras → Preparar → Para enviar → En taller → Para retirar → Terminada
//
// (más "Espera", cuando un paso anterior todavía no volvió). La etapa sale del
// estado de compra del material y de su viaje actual; la acción que se ofrece
// en pantalla es siempre la que mueve la pieza a la etapa siguiente.
import { operationDestinationLabel } from "./torneriaLabels";

// ─── Formato ────────────────────────────────────────────────────────────────

export function fmtDate(value, withTime = true) {
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

export function qty(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : "0";
}

// "2 unidad" se lee mal: la unidad genérica va en plural.
export function cantidadTexto(cantidad, unidad) {
  const numero = qty(cantidad);
  if (!unidad || unidad === "unidad") return `${numero} ${Number(cantidad) === 1 ? "unidad" : "unidades"}`;
  return `${numero} ${unidad}`;
}

export const plural = (n, uno, varios) => (n === 1 ? uno : varios);

// Días transcurridos desde una fecha. Vive a nivel de módulo: `Date.now()`
// llamado directo en el cuerpo de un componente es impuro.
const MS_DIA = 86400000;
export function diasDesde(fecha) {
  if (!fecha) return null;
  const desde = new Date(fecha);
  if (Number.isNaN(desde.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  desde.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - desde.getTime()) / MS_DIA));
}

export function diasEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  const a = new Date(desde);
  const b = new Date(hasta);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MS_DIA));
}

// Días afuera a partir de los cuales una pieza se marca como demorada. Es una
// pauta de planta, no un dato de la base.
export const DEMORA_DIAS = 15;

export function workshopName(operation) {
  return operationDestinationLabel(operation);
}

export function operationStatusLabel(operation) {
  if (operation.estado === "enviado") return `En ${workshopName(operation)}`;
  if (operation.estado === "parcial") return `Regreso parcial · ${workshopName(operation)}`;
  return null;
}

export function groupRows(rows, key = "grupo") {
  const map = new Map();
  rows.forEach((row) => {
    const group = row[key] || "Otros";
    const list = map.get(group) ?? [];
    list.push(row);
    map.set(group, list);
  });
  return [...map.entries()];
}

// ─── Insumos y tramos ───────────────────────────────────────────────────────

// Un insumo es materia prima que se entrega al taller y no vuelve (migración
// de insumos): su circuito termina en la entrega, así que "enviado" es su
// estado final. Una `cantidad_recibida` en cero no quiere decir que falte nada.
export function esInsumo(item) {
  return !!item?.es_insumo;
}

export function tramoCerrado(operation, item) {
  if (operation.estado === "recibido") return true;
  return esInsumo(item) && ["enviado", "parcial"].includes(operation.estado);
}

// `[].every(...)` devuelve true: una ruta sin tramos se leía como terminada.
export function routeIsComplete(row) {
  return row.tramos.length > 0
    && row.tramos.every((operation) => tramoCerrado(operation, row.item));
}

// ─── Avance ─────────────────────────────────────────────────────────────────

function componenteCumplido(component) {
  const requerida = Number(component.cantidad_requerida || 0);
  const hecha = component.item?.es_insumo
    ? Number(component.cantidad_enviada || 0)
    : Number(component.cantidad_recibida || 0);
  return Math.min(hecha, requerida);
}

export function operationProgress(operation) {
  const components = operation.componentes?.filter((row) => row.item?.activo !== false) || [];
  const required = components.reduce((sum, row) => sum + Number(row.cantidad_requerida || 0), 0);
  const received = components.reduce((sum, row) => sum + componenteCumplido(row), 0);
  return required > 0 ? Math.round((received / required) * 100) : 0;
}

// Un paso que sólo lleva insumos ya entregados no es una pieza afuera.
export function esEntregaDeInsumos(operation) {
  const components = (operation.componentes || []).filter(
    (row) => row.item?.activo !== false && !row.item?.no_lleva,
  );
  return components.length > 0 && components.every((row) => row.item?.es_insumo);
}

export function processProgress(process) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  if (!operations.length) return 0;
  return Math.round(
    operations.reduce((sum, operation) => sum + operationProgress(operation), 0) / operations.length,
  );
}

export function currentOperation(process) {
  return (process.operaciones || [])
    .filter((row) => row.activa !== false)
    .find((row) => row.estado !== "recibido") || null;
}

// Sin viajes cargados y "todos los viajes volvieron" dan los dos
// `currentOperation === null`. Son estados opuestos y no pueden leerse igual.
export function tieneCircuito(process) {
  return (process.operaciones || []).some((row) => row.activa !== false);
}

// ─── Archivo ────────────────────────────────────────────────────────────────

// Una obra deja de estar en curso cuando se archivó a mano (`completado` o
// `cancelado`) o cuando su circuito volvió entero al astillero. Lo segundo no se
// escribe en la base: se lee. El 100% exige circuito.
export function circuitoCompleto(process) {
  return tieneCircuito(process) && processProgress(process) === 100;
}

export function enArchivo(process) {
  return process.estado === "completado"
    || process.estado === "cancelado"
    || circuitoCompleto(process);
}

export function motivoArchivo(process) {
  if (process.estado === "cancelado") return "cancelada";
  if (circuitoCompleto(process)) return "terminada";
  if (process.estado === "completado") return "archivada";
  return null;
}

// ─── Datos por confirmar ────────────────────────────────────────────────────

export function itemPorConfirmar(item) {
  return item.activo !== false && !item.no_lleva && item.requiere_confirmacion && !item.confirmado_at;
}

export function datosPorConfirmar(process) {
  return (process.items || []).filter(itemPorConfirmar);
}

export const ESTADOS_AFUERA = ["enviado", "parcial"];

// ─── Compras y preparación ──────────────────────────────────────────────────

// El tramo de compra no aplica a los conjuntos (se forman de sus componentes)
// ni a los materiales que arrancan en un proveedor (van derecho al taller).
export function compraAplica(item, tramos = []) {
  if (!item || item.es_resultado || item.no_lleva) return false;
  if (item.compra_estado === "no_aplica") return false;
  const origen = String(tramos[0]?.origen || "Astillero").trim().toLowerCase();
  return origen === "astillero";
}

const COMPRA_PASO = {
  pendiente_solicitud: 0,
  solicitado: 1,
  comprado: 2,
  recibido_astillero: 3,
};

export function fechasMovimientoComponente(operation, componentId, tipo) {
  return (operation?.movimientos || [])
    .filter((movement) => (
      movement.tipo === tipo
      && (movement.items || []).some((row) => row.operacion_item_id === componentId)
    ))
    .map((movement) => movement.fecha)
    .filter(Boolean)
    .sort();
}

// "Listo para enviar/retirar" vale hasta el próximo movimiento.
export function preparacionVigente(component, operation, etapa) {
  const listoAt = etapa === "envio" ? component?.listo_envio_at : component?.listo_retiro_at;
  if (!listoAt) return false;
  const tipo = etapa === "envio" ? "salida" : "recepcion";
  const ultimoMovimiento = fechasMovimientoComponente(operation, component.id, tipo).at(-1);
  return !ultimoMovimiento || new Date(listoAt) > new Date(ultimoMovimiento);
}

export function dependencyRows(process, operation) {
  const deps = new Set(operation.depende_de || []);
  return (process.operaciones || []).filter(
    (row) => deps.has(row.clave) && row.estado !== "recibido",
  );
}

export function primeraSalida(tramos = []) {
  return tramos
    .flatMap((operation) => (operation.movimientos || [])
      .filter((movement) => movement.tipo === "salida")
      .map((movement) => movement.fecha))
    .filter(Boolean)
    .sort()[0] || null;
}

// ─── Recorridos por material ────────────────────────────────────────────────

// Procesos viejos: el viaje 2 de un conjunto apunta todavía a sus piezas de
// origen. Se muestra como un conjunto virtual para conservar el historial.
export const RESULT_OPERATION_META = {
  pata_conjunto_t2: { clave: "pata_gallo", descripcion: "Pata de gallo", grupo: "Pata de gallo" },
  timon_conjunto_t2: { clave: "timon", descripcion: "Timon", grupo: "Timon" },
  limera_conjunto_t2: { clave: "limera_timon", descripcion: "Limera de timon", grupo: "Limera" },
};

// Cada material de la obra con sus viajes, en orden. Los conjuntos aparecen
// como un material más; sus componentes llevan `parteDe` para poder decirlo.
export function recorridosDeObra(process) {
  const operations = (process.operaciones || []).filter((row) => row.activa !== false);
  // Lo que esta obra no lleva no entra al circuito (queda tachado en Materiales).
  const items = (process.items || []).filter((row) => row.activo !== false && !row.no_lleva);
  const clavesDeConjunto = new Set(
    items.filter((row) => row.es_resultado).flatMap((row) => row.resultado_de || []),
  );
  const itemRoutes = items
    .map((item) => {
      const tramos = operations
        .filter((op) => {
          const includesItem = (op.componentes || []).some((c) => c.item_id === item.id);
          if (!includesItem) return false;
          return !RESULT_OPERATION_META[op.clave] || item.es_resultado;
        })
        .sort((a, b) => (a.viaje ?? 99) - (b.viaje ?? 99) || (a.orden ?? 0) - (b.orden ?? 0));
      return { item, tramos };
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
      return { item: virtualItem, tramos: [operation] };
    });

  const rutas = [...itemRoutes, ...legacyResultRoutes];
  const porClave = new Map(rutas.map((row) => [row.item.clave, row]));
  return rutas.map((row) => {
    const conjunto = rutas.find((otra) => otra.item.es_resultado && (otra.item.resultado_de || []).includes(row.item.clave));
    return {
      ...row,
      grupo: row.item.grupo || "Otros",
      parteDe: conjunto?.item || null,
      componentes: row.item.es_resultado
        ? (row.item.resultado_de || []).map((clave) => porClave.get(clave)).filter(Boolean)
        : [],
    };
  });
}

// ─── Etapas ─────────────────────────────────────────────────────────────────

// Orden, nombre y tono de cada etapa. El tono sigue la semántica de la app:
// cian = hay que hacer algo nosotros, violeta = en camino / esperando a otro,
// azul = en el taller, verde = listo para moverse, neutro = nada que hacer.
export const ETAPAS = {
  comprar: { orden: 0, nombre: "Sin pedir", corto: "Sin pedir", tono: "cian" },
  compra: { orden: 1, nombre: "En compra", corto: "En compra", tono: "violeta" },
  espera: { orden: 2, nombre: "Espera un paso anterior", corto: "Espera", tono: "neutro" },
  preparar: { orden: 3, nombre: "Preparar", corto: "Preparar", tono: "cian" },
  enviar: { orden: 4, nombre: "Lista para enviar", corto: "Para enviar", tono: "verde" },
  taller: { orden: 5, nombre: "En el taller", corto: "En taller", tono: "azul" },
  retirar: { orden: 6, nombre: "Lista para retirar", corto: "Para retirar", tono: "verde" },
  sin_viaje: { orden: 7, nombre: "Sin viaje cargado", corto: "Sin viaje", tono: "neutro" },
  terminado: { orden: 8, nombre: "Terminada", corto: "Terminadas", tono: "neutro" },
};

// En qué etapa está un material y qué datos necesita la acción de esa etapa.
// Es la regla que antes vivía en la tarjeta de cada material ("tramo actual").
export function etapaMaterial(process, row) {
  const { item, tramos } = row;
  const conCompra = compraAplica(item, tramos);
  const compraPaso = conCompra ? (COMPRA_PASO[item.compra_estado] ?? 0) : 3;
  const base = { item, tramos, conCompra, compraPaso };

  if (conCompra && compraPaso < 3) {
    return {
      ...base,
      etapa: compraPaso === 0 ? "comprar" : "compra",
      dias: compraPaso === 0 ? null : diasDesde(item.solicitado_at),
      taller: tramos[0] || null,
    };
  }

  if (!tramos.length) {
    // Un conjunto sin viaje propio se forma en el astillero cuando vuelven sus
    // componentes: está terminado cuando ellos lo están.
    if (item.es_resultado) {
      const listos = (row.componentes || []).length > 0 && row.componentes.every(routeIsComplete);
      return { ...base, etapa: listos ? "terminado" : "espera", formaEnAstillero: true };
    }
    return { ...base, etapa: "sin_viaje" };
  }

  // Un insumo se cierra al entregarlo: se mira lo enviado, no lo recibido.
  const insumo = esInsumo(item);
  const operation = tramos.find((op) => {
    const componentes = (op.componentes || []).filter((component) => component.item_id === item.id);
    if (!componentes.length) return !tramoCerrado(op, item);
    return componentes.some((component) => (
      insumo
        ? Number(component.cantidad_enviada) < Number(component.cantidad_requerida)
        : Number(component.cantidad_recibida) < Number(component.cantidad_requerida)
    ));
  });
  if (!operation) return { ...base, etapa: "terminado", insumo };

  const directos = (operation.componentes || []).filter((component) => component.item_id === item.id);
  const components = directos.length
    ? directos
    : item.virtual
      ? (operation.componentes || []).filter((component) => component.item?.activo !== false)
      : [];
  const pendientesEnvio = components.filter(
    (component) => Number(component.cantidad_enviada) < Number(component.cantidad_requerida),
  );
  const pendientesRetiro = insumo ? [] : components.filter(
    (component) => Number(component.cantidad_enviada) > Number(component.cantidad_recibida),
  );
  const afuera = pendientesRetiro.length > 0;
  const listoEnvio = pendientesEnvio.length > 0
    && pendientesEnvio.every((component) => preparacionVigente(component, operation, "envio"));
  const listoRetiro = afuera
    && pendientesRetiro.every((component) => preparacionVigente(component, operation, "retiro"));
  const dependencias = dependencyRows(process, operation);
  const ultimaSalida = components
    .flatMap((component) => fechasMovimientoComponente(operation, component.id, "salida"))
    .sort()
    .at(-1);
  const marca = (lista, campo) => lista.map((c) => c[campo]).filter(Boolean).sort().at(-1);

  let etapa;
  if (afuera) etapa = listoRetiro ? "retirar" : "taller";
  else if (listoEnvio) etapa = "enviar";
  else if (dependencias.length) etapa = "espera";
  else etapa = "preparar";

  return {
    ...base,
    etapa,
    insumo,
    operation,
    components,
    pendientesEnvio,
    pendientesRetiro,
    dependencias,
    dias: afuera ? diasDesde(ultimaSalida) : null,
    desdeListo: etapa === "enviar"
      ? diasDesde(marca(pendientesEnvio, "listo_envio_at"))
      : etapa === "retirar"
        ? diasDesde(marca(pendientesRetiro, "listo_retiro_at"))
        : null,
  };
}

// Todas las piezas de una obra con su etapa.
export function piezasDeObra(process) {
  return recorridosDeObra(process).map((row) => ({
    ...row,
    key: `${process.id}:${row.item.id}`,
    process,
    ...etapaMaterial(process, row),
  }));
}

export function contarEtapas(piezas) {
  const cuenta = Object.fromEntries(Object.keys(ETAPAS).map((key) => [key, 0]));
  piezas.forEach((pieza) => { cuenta[pieza.etapa] = (cuenta[pieza.etapa] || 0) + 1; });
  return cuenta;
}

// Lo que conviene decir de una obra en una línea, por orden de urgencia.
export function titularObra(process, piezas = piezasDeObra(process)) {
  if (!tieneCircuito(process)) return { texto: "Sin circuito cargado", tono: "rojo" };
  const motivo = motivoArchivo(process);
  if (motivo === "terminada") return { texto: "Todo el circuito volvió al astillero", tono: "verde" };
  if (motivo === "archivada") return { texto: "Archivada antes de terminar", tono: "neutro" };
  if (motivo === "cancelada") return { texto: "Seguimiento cancelado", tono: "neutro" };
  const n = contarEtapas(piezas);
  const enTaller = piezas.filter((p) => p.etapa === "taller" || p.etapa === "retirar");
  const masVieja = enTaller.reduce((max, p) => Math.max(max, p.dias ?? -1), -1);
  if (n.retirar) return { texto: `${n.retirar} ${plural(n.retirar, "lista", "listas")} para retirar del taller`, tono: "verde" };
  if (n.enviar) return { texto: `${n.enviar} ${plural(n.enviar, "lista", "listas")} para enviar`, tono: "verde" };
  if (n.taller) {
    return {
      texto: `${n.taller} en el taller${masVieja >= 0 ? ` · hace ${masVieja} d` : ""}`,
      tono: masVieja >= DEMORA_DIAS ? "rojo" : "azul",
    };
  }
  if (n.preparar) return { texto: `${n.preparar} para preparar`, tono: "cian" };
  if (n.comprar) return { texto: `${n.comprar} ${plural(n.comprar, "material", "materiales")} sin pedir`, tono: "cian" };
  if (n.compra) return { texto: `${n.compra} en compra`, tono: "violeta" };
  if (n.espera) return { texto: `${n.espera} ${plural(n.espera, "espera", "esperan")} un paso anterior`, tono: "neutro" };
  return { texto: "Sin novedades", tono: "neutro" };
}

// Los números del módulo. Las obras archivadas no suman pendientes; lo que sigue
// físicamente en un taller sí cuenta aunque la obra esté archivada.
export function resumenProcesos(processes) {
  const vivos = processes.filter((row) => row.estado !== "cancelado");
  const enCurso = processes.filter((row) => !enArchivo(row));
  const piezas = vivos.flatMap((process) => {
    const archivada = enArchivo(process);
    return piezasDeObra(process).filter((p) => !archivada || p.etapa === "taller" || p.etapa === "retirar");
  });
  const n = contarEtapas(piezas);
  return {
    enCurso: enCurso.length,
    archivo: processes.length - enCurso.length,
    porConfirmar: enCurso.reduce((sum, row) => sum + datosPorConfirmar(row).length, 0),
    afuera: n.taller + n.retirar,
    demoradas: piezas.filter((p) => (p.etapa === "taller" || p.etapa === "retirar") && (p.dias ?? -1) >= DEMORA_DIAS).length,
    etapas: n,
    piezas,
  };
}
