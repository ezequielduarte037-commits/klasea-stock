export const PROVEEDORES_MUEBLES = ["Oberti", "Morph"];

export const FLUJOS_MUEBLES = {
  Oberti: [
    { key: "definicion", label: "Definición", short: "Definir material y color" },
    { key: "compra_materiales", label: "Compra", short: "Comprar materiales" },
    { key: "materiales_astillero", label: "En astillero", short: "Recibir materiales" },
    { key: "preparacion_banco", label: "Preparación de chapas y tablones", short: "Entregar la OT al carpintero de banco y digitalizarla" },
    { key: "enchapadora", label: "En enchapadora", short: "Enviar la OT de chapas impresa y gestionar herrajes" },
    { key: "flete_oberti", label: "Listo para enviar a Oberti", short: "Coordinar y registrar el envío a Oberti" },
    { key: "fabricacion_oberti", label: "Fabricación", short: "Oberti fabrica los muebles" },
    { key: "transito_astillero", label: "En tránsito", short: "Recibir muebles terminados" },
    { key: "recibido", label: "Recibido", short: "Controlar la recepción parcial o completa" },
  ],
  Morph: [
    { key: "definicion", label: "Definición", short: "Definir línea, material y color" },
    { key: "compra_materiales", label: "Compra", short: "Comprar materiales" },
    { key: "envio_morph", label: "Envío a Morph", short: "Enviar materiales a fábrica" },
    { key: "fabricacion_morph", label: "Fabricación", short: "Morph enchapado y fabricación" },
    { key: "transito_astillero", label: "En tránsito", short: "Recibir muebles terminados" },
    { key: "recibido", label: "Recibido", short: "Asignar o controlar recepción" },
  ],
};

const ETAPAS_ANTERIORES = {
  "Pendiente Materiales": "compra_materiales",
  Preparación: "preparacion_banco",
  "En Enchapadora": "enchapadora",
  Flete: "flete_oberti",
  Producción: "fabricacion_oberti",
  Terminado: "recibido",
  Instalado: "recibido",
};

export function normalizarEtapa(lote) {
  const flujo = FLUJOS_MUEBLES[lote?.proveedor] ?? FLUJOS_MUEBLES.Oberti;
  const raw = lote?.etapa || lote?.estado_proceso || "definicion";
  const normalizada = ETAPAS_ANTERIORES[raw] || raw;
  return flujo.some((etapa) => etapa.key === normalizada)
    ? normalizada
    : flujo[0].key;
}

export function etapaMeta(lote) {
  const flujo = FLUJOS_MUEBLES[lote?.proveedor] ?? FLUJOS_MUEBLES.Oberti;
  const key = normalizarEtapa(lote);
  const index = Math.max(0, flujo.findIndex((etapa) => etapa.key === key));
  return {
    flujo,
    etapa: flujo[index],
    index,
    progreso: flujo.length <= 1 ? 100 : Math.round((index / (flujo.length - 1)) * 100),
    anterior: flujo[index - 1] ?? null,
    siguiente: flujo[index + 1] ?? null,
  };
}

export function destinoLote(lote) {
  return lote?.tipo_destino || (lote?.unidad_id || lote?.prod_unidades ? "obra" : "stock");
}

export function nombreObra(lote) {
  return lote?.prod_unidades?.codigo || "Sin asignar";
}

export function nombreLinea(lote) {
  return lote?.prod_lineas?.nombre || "Sin línea";
}

export function nombreMuebles(lote) {
  if (lote?.nombre_lote) return lote.nombre_lote;
  return destinoLote(lote) === "obra"
    ? `Muebles ${nombreObra(lote)}`
    : `Muebles ${nombreLinea(lote)}`;
}

export function cantidadMuebles(lote) {
  const cantidad = Math.max(1, Number(lote?.cantidad_juegos) || 1);
  return `${cantidad} ${cantidad === 1 ? "conjunto" : "conjuntos"} de muebles`;
}

export function fechaCorta(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
