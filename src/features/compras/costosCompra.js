import { normalizeUnidadMedida } from "../materiales/api";

export const importeCompraValido = (value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0.01;

export const centavosCompra = (value) => Math.round(Number(value) * (1 + Number.EPSILON) * 100);

export function importeGuardadoCompra(request, item, cantidadItems) {
  if (importeCompraValido(item.actual_amount)) return item.actual_amount;
  if (cantidadItems === 1 && !request.itemized_costs && importeCompraValido(request.actual_amount)) return request.actual_amount;
  return "";
}

function medidaDeCompra(item) {
  const cantidad = String(item.quantity ?? "").trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*([\p{L}][\p{L}\p{N} .]*))?$/u);
  if (!cantidad) return null;
  const numero = Number(cantidad[1].replace(",", "."));
  const unidad = normalizeUnidadMedida(item.unit, "");
  const sufijo = normalizeUnidadMedida(cantidad[2], "");
  if (!Number.isFinite(numero) || numero <= 0 || (unidad && sufijo && unidad !== sufijo)) return null;
  return { cantidad: numero, unidad: sufijo || unidad || "unidad" };
}

function claveMaterial(item) {
  return `${item.catalog_source || "panol"}:${item.material_id}`;
}

export function referenciasCompra(items, historial, productos) {
  const ultimoPorUnidad = new Map();
  for (const item of historial) {
    const medida = medidaDeCompra(item);
    if (!medida || !importeCompraValido(item.actual_amount)) continue;
    const clave = `${claveMaterial(item)}:${medida.unidad}`;
    if (!ultimoPorUnidad.has(clave)) ultimoPorUnidad.set(clave, Number(item.actual_amount) / medida.cantidad);
  }

  const catalogo = new Map(productos.map((producto) => [producto.id, producto]));
  const referencias = {};
  for (const item of items) {
    const medida = medidaDeCompra(item);
    if (!medida) continue;
    const { cantidad, unidad } = medida;
    const anterior = ultimoPorUnidad.get(`${claveMaterial(item)}:${unidad}`);
    if (anterior) {
      referencias[item.id] = { precio: anterior, moneda: "ARS", cantidad, unidad, origen: "Última compra" };
      continue;
    }

    const producto = (!item.catalog_source || item.catalog_source === "panol") && catalogo.get(item.material_id);
    const precio = Number(producto?.precio_unitario);
    const moneda = producto?.moneda || "ARS";
    if (precio > 0 && Number.isFinite(precio) && ["ARS", "USD"].includes(moneda)
      && normalizeUnidadMedida(producto.unidad_medida) === unidad) {
      referencias[item.id] = { precio, moneda, cantidad, unidad, origen: "Catálogo" };
    }
  }
  return referencias;
}

export function importeDeReferencia(referencia, cotizacion) {
  if (!referencia) return "";
  const cambio = referencia.moneda === "USD" ? Number(cotizacion?.venta) : 1;
  const importe = centavosCompra(referencia.precio * referencia.cantidad * cambio) / 100;
  return importeCompraValido(importe) ? importe : "";
}
