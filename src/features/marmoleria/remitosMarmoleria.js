const limpiar = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();
export const MAX_PLANTILLAS_REMITO = 100;

export function plantillasPendientesRemito(piezas, unidades, lineas) {
  const modelos = new Map(lineas.filter(l => l.activa !== false).map(l => [l.id, l.nombre]));
  const barcos = new Map(unidades.filter(u => u.activa !== false && modelos.has(u.linea_id)).map(u => [u.id, u]));
  return piezas.filter(p => p.estado === "Pendiente" && barcos.has(p.unidad_id))
    .map(p => ({ ...p, codigo_barco:barcos.get(p.unidad_id).codigo, linea:modelos.get(barcos.get(p.unidad_id).linea_id) }))
    .sort((a, b) => `${a.codigo_barco} ${a.sector} ${a.pieza}`.localeCompare(`${b.codigo_barco} ${b.sector} ${b.pieza}`, "es", { numeric:true }));
}

export function depurarSeleccionRemito(seleccion, catalogo) {
  const disponibles = new Set(catalogo.map(p => p.id));
  const vigentes = Object.entries(seleccion).filter(([id]) => disponibles.has(id));
  return vigentes.length === Object.keys(seleccion).length ? seleccion : Object.fromEntries(vigentes);
}

export function numeroRemitoMarmoleria(numero) {
  return numero == null ? "BORRADOR" : `MAR-${String(numero).padStart(6, "0")}`;
}

export function validarRemitoMarmoleria({ fecha, destinatario, entregado_por, retira, observaciones, items }) {
  const dia = new Date(`${fecha}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    return "Indicá la fecha de entrega.";
  }
  if (!limpiar(destinatario) || limpiar(destinatario).length > 200) return "Indicá la marmolería o destinatario (hasta 200 caracteres).";
  if (!limpiar(entregado_por) || limpiar(entregado_por).length > 150) return "Indicá quién entrega las plantillas (hasta 150 caracteres).";
  if (limpiar(retira).length > 150) return "El nombre de quien retira admite hasta 150 caracteres.";
  if (String(observaciones ?? "").trim().length > 1000) return "Las observaciones admiten hasta 1000 caracteres.";
  if (!Array.isArray(items) || !items.length) return "Seleccioná al menos una plantilla.";
  if (items.length > MAX_PLANTILLAS_REMITO) return `Podés incluir hasta ${MAX_PLANTILLAS_REMITO} plantillas por remito.`;
  if (new Set(items.map((i) => i.pieza_id)).size !== items.length || items.some((i) => !i.pieza_id)) {
    return "Revisá las plantillas seleccionadas: hay renglones repetidos o sin identificar.";
  }
  for (const item of items) {
    if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || Number(item.cantidad) > 999) {
      return "Cada cantidad debe ser un entero entre 1 y 999.";
    }
    if (!limpiar(item.material) || limpiar(item.material).length > 300) return "Completá el material de todas las plantillas (hasta 300 caracteres).";
  }
  return "";
}

export function datosSolicitudRemito(form, items) {
  return {
    fecha: form.fecha,
    destinatario: limpiar(form.destinatario),
    entregado_por: limpiar(form.entregado_por),
    retira: limpiar(form.retira),
    observaciones: String(form.observaciones ?? "").trim(),
    items: items.map((i) => ({ pieza_id: i.pieza_id, cantidad: Number(i.cantidad), material: limpiar(i.material) })),
  };
}

// Los filtros nunca modifican la selección. La captura es por id de pieza,
// porque dos barcos pueden tener una plantilla con el mismo nombre.
export function alternarPlantillaRemito(seleccion, pieza) {
  const siguiente = { ...seleccion };
  if (siguiente[pieza.id]) delete siguiente[pieza.id];
  else siguiente[pieza.id] = { ...pieza, pieza_id: pieza.id, cantidad: 1, material: limpiar(pieza.color) };
  return siguiente;
}
