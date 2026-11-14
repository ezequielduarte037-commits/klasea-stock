import {
  Check, Factory, MapPin, PackageCheck, PackageOpen, ShoppingCart, Wrench,
} from "lucide-react";
import { C } from "@/theme";
import { operationDestinationLabel } from "./torneriaLabels";
import { esInsumo, preparacionVigente, workshopName } from "./torneriaEstado";

// Datos del circuito que usan varias vistas: colores de grupo, estados de
// compra, el armado del riel de un material y los textos del pedido a Compras.

export const GROUP_COLORS = {
  "Pata de gallo": C.blue,
  Timon: C.violet,
  Limera: C.teal,
  Escape: C.red,
  Bocina: C.green,
  Manchon: C.indigo,
  Otros: C.dim,
};

export function descripcionParaCompras(item, material = undefined) {
  const cat = material !== undefined ? material : (item.material || null);
  return cat
    ? [cat.codigo, cat.descripcion].filter(Boolean).join(" — ")
    : item.descripcion;
}

// El peso de la pieza, para los materiales que el proveedor cotiza por kilo.
// Se dice "aprox." porque es peso nominal: el mismo buje 75x45 pesó 8,000 /
// 8,200 / 7,900 kg en tres barcos. Es pieza fundida y cada una sale distinta.
export function pesoParaCompras(material) {
  const peso = Number(material?.peso_kg);
  if (!Number.isFinite(peso) || peso <= 0) return "";
  const kg = peso.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  // Para lo que se compra por metro, peso_kg son kilos POR METRO: así lo dejó la
  // migración de las tuercas de limera. Decir "peso aprox. 99 kg" de una pieza de
  // 65 mm manda al proveedor a cotizar quince veces el material que lleva.
  const porMetro = String(material?.unidad_medida || "").trim().toLowerCase() === "metro";
  return porMetro
    ? `Peso aprox. ${kg} kg por metro (se cotiza por kg)`
    : `Peso aprox. ${kg} kg (se cotiza por kg)`;
}

// Los materiales de catálogo que compone un renglón, en orden. Un lote tiene
// varios; una pieza suelta, uno o ninguno.
export function materialesDelRenglon(item) {
  return (Array.isArray(item?.materiales) ? [...item.materiales] : [])
    .filter((row) => row?.material)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

// Con qué descripción sale la PRIMERA línea del renglón en el pedido. Es la que
// se usa después para reencontrarla y colgarle el seguimiento: un renglón de
// Tornería guarda un solo purchase_request_item_id, así que un lote se engancha
// a su primera línea y las demás viajan como renglones sueltos del pedido.
export function descripcionPrincipalParaCompras(item) {
  const lista = materialesDelRenglon(item);
  return lista.length > 1
    ? descripcionParaCompras(item, lista[0].material)
    : descripcionParaCompras(item);
}

export function planosParaCompras(items = []) {
  const unique = new Map();
  items.forEach((item) => {
    (Array.isArray(item?.planos) ? item.planos : []).forEach((plano) => {
      if (!plano?.url) return;
      const key = plano.path || plano.url;
      if (unique.has(key)) return;
      unique.set(key, {
        ...plano,
        name: `${item.descripcion} · ${plano.name || "Plano"}`,
      });
    });
  });
  return [...unique.values()];
}

export function entregaDirectaParaCompras(process, item) {
  const operation = (process?.operaciones || [])
    .filter((row) => row.activa !== false)
    .find((row) => (
      String(row.origen || "").trim().toLowerCase().startsWith("proveedor")
      && (row.componentes || []).some((component) => component.item_id === item.id)
    ));

  if (!operation) return null;

  const destino = operationDestinationLabel(operation);
  return {
    destino,
    nota: `IMPORTANTE — ENTREGA DIRECTA: el proveedor debe enviar este material a ${destino}; no debe pasar primero por el astillero.`,
  };
}

export function descripcionPedidoCompras(process, items = []) {
  const obra = process?.obra?.codigo || "la obra";
  const linea = process?.obra?.linea_nombre ? ` (${process.obra.linea_nombre})` : "";
  const entregasDirectas = items
    .map((item) => entregaDirectaParaCompras(process, item))
    .filter(Boolean);
  const destinos = [...new Set(entregasDirectas.map((row) => row.destino))];
  const partes = [`Material para el circuito de tornería de ${obra}${linea}.`];

  if (entregasDirectas.length < items.length) {
    partes.push("Avisar a Tornería cuando los materiales destinados al astillero sean recibidos.");
  }
  if (destinos.length) {
    partes.push(
      `IMPORTANTE: los ítems marcados como entrega directa deben enviarse desde el proveedor a ${destinos.join(" / ")}; revisar la observación de cada ítem.`,
    );
  }

  return partes.join(" ");
}


//
// Los colores siguen la semántica del resto de la app: cyan es "falta hacer",
// azul es "en curso", violeta es "casi", verde es "listo". El rojo queda para lo
// que está bloqueado — "sin pedir" no es un error, es una tarea.
// La foto del producto del catálogo vinculado, si tiene. En un lote, la del
// primer material que tenga foto.
export function fotoDelMaterial(item) {
  const candidatos = [item?.material, ...materialesDelRenglon(item).map((row) => row.material)].filter(Boolean);
  return candidatos.find((material) => material.imagen_url) || null;
}

export const COMPRA_META = {
  pendiente_solicitud: { label: "Sin pedir", color: C.cyan, soft: C.cyanL, borde: C.cyanB, paso: 0 },
  solicitado: { label: "Pedido", color: C.blue, soft: C.blueL, borde: C.blueB, paso: 1 },
  comprado: { label: "Comprado", color: C.violet, soft: C.violetL, borde: C.violetB, paso: 2 },
  recibido_astillero: { label: "En astillero", color: C.green, soft: C.greenL, borde: C.greenB, paso: 3 },
};


// Cadena completa del circuito de un material, en un solo riel:
//
//   Compras → Comprado → Astillero → Listo → Tornería → Retiro → ⌂
//
// Antes cada tramo era una card aparte y una pieza con dos viajes ocupaba tres
// cards para contar un solo recorrido. El astillero al que vuelve después de
// cada viaje va como nodo compacto: se repite en cada vuelta y escribirlo entero
// tres veces empujaba el riel fuera de la card.
export function circuitoNodos({ item, tramos, conCompra }) {
  const nodos = [];
  const insumo = esInsumo(item);
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
    const directComponents = (operation.componentes || []).filter(
      (component) => component.item_id === item.id,
    );
    const components = directComponents.length
      ? directComponents
      : item.virtual
        ? (operation.componentes || []).filter((component) => component.item?.activo !== false)
        : [];
    const listoEnvio = components.length > 0 && components.every((component) => (
      Number(component.cantidad_enviada) >= Number(component.cantidad_requerida)
      || preparacionVigente(component, operation, "envio")
    ));
    const listoRetiro = components.length > 0 && components.every((component) => (
      (
        Number(component.cantidad_enviada) > 0
        && Number(component.cantidad_recibida) >= Number(component.cantidad_enviada)
      )
      || preparacionVigente(component, operation, "retiro")
    ));

    nodos.push({
      key: `listo-envio-${operation.id}`,
      label: "Listo",
      Icon: Check,
      activo: listoEnvio || salioAlguna,
      color: C.green, soft: C.greenL, borde: C.greenB,
      railHecho: listoEnvio || salioAlguna,
      railCurso: operation.estado === "pendiente" && compraPaso >= 3 && !listoEnvio,
      railColor: C.green,
    });

    nodos.push({
      key: `taller-${operation.id}`,
      label: workshopName(operation),
      // Un insumo tiene un solo destino, no una secuencia de viajes: numerarlo
      // sugiere que después viene otro.
      viaje: insumo ? null : (operation.viaje || i + 1),
      Icon: Wrench,
      activo: salioAlguna,
      color: taller, soft: tallerSoft, borde: tallerBorde,
      railHecho: salioAlguna,
      railCurso: listoEnvio && !salioAlguna,
      railColor: taller,
    });

    // Acá termina el circuito de un insumo: llegó al taller y se queda ahí. Los
    // nodos de retiro y de vuelta al astillero describen un regreso que nunca
    // va a pasar, y dejarlos hace que el material figure eternamente pendiente.
    if (insumo) return;

    nodos.push({
      key: `listo-retiro-${operation.id}`,
      label: "Retiro",
      Icon: PackageOpen,
      activo: listoRetiro || recibido,
      color: C.violet, soft: C.violetL, borde: C.violetB,
      railHecho: listoRetiro || recibido,
      railCurso: afuera && !listoRetiro,
      railColor: C.violet,
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
      railCurso: listoRetiro && !recibido,
      railColor: recibido ? C.green : taller,
    });
  });

  return nodos;
}


