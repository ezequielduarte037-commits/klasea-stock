/** El remito ya fue leído por IA: se cruzan sus productos con pedidos reales. */
const numero = (valor) => Number(String(valor ?? "").replace(",", ".")) || 0;
const normalizar = (valor) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function proveedorDelRemito(valor) {
  const nombre = normalizar(valor).replace(/\b(s r l|s a s|s a|srl|sa|sas)\b/g, "").replace(/\s+/g, " ").trim();
  if (/\brebollar\b/.test(nombre) || /^cmr(?: insumos(?: industriales)?)?$/.test(nombre)) return "rebollar";
  return nombre;
}

function fechaLocal(valor) {
  const fecha = new Date(valor);
  if (!valor || !Number.isFinite(fecha.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(fecha);
  return ["year", "month", "day"].map((tipo) => partes.find((p) => p.type === tipo).value).join("-");
}

const pendiente = (item) => numero(item.pendiente ?? item.cantidad) > 0;
const delMismoProveedor = (borrador, pedido) => {
  const proveedor = proveedorDelRemito(borrador.proveedor);
  return proveedor && proveedor === proveedorDelRemito(pedido.proveedor);
};

export function detectarPedidoRemito(borrador, pedidos = [], sede) {
  const materiales = new Set((borrador.lineas || []).map((l) => l.materialId).filter(Boolean));
  const total = materiales.size + (borrador.sinEmparejar?.length || 0);
  const candidatos = pedidos
    .filter((p) => p.estado === "pedido" && p.sede === sede && delMismoProveedor(borrador, p))
    .filter((p) => !borrador.fechaRemito || !fechaLocal(p.pedido_at || p.created_at) || fechaLocal(p.pedido_at || p.created_at) <= borrador.fechaRemito)
    .map((pedido) => {
      const ids = new Set((pedido.items || []).filter(pendiente).map((i) => i.material_id));
      const coincidencias = [...materiales].filter((id) => ids.has(id)).length;
      return { pedido, coincidencias, cobertura: total ? coincidencias / total : 0 };
    })
    .filter((c) => c.coincidencias > 0)
    .sort((a, b) => b.coincidencias - a.coincidencias);
  const [primero, segundo] = candidatos;
  // Cantidades y antigüedad no desempatan pedidos con los mismos productos:
  // cualquiera puede ser una entrega parcial. Ese caso lo elige una persona.
  const claro = !borrador.sinEmparejar?.length && primero && (candidatos.length === 1
    ? primero.cobertura >= 0.5
    : primero.coincidencias >= 2 && primero.cobertura >= 0.75 && primero.coincidencias > segundo.coincidencias);
  return { candidatos, automatico: claro ? primero.pedido : null };
}

function sinVinculo(linea) {
  const limpia = { ...linea };
  for (const campo of ["pedidoItemId", "pedidoCantidad", "pedidoUnidadCompra"]) delete limpia[campo];
  return limpia;
}

export function quitarPedidoDelRemito(borrador, sinPedido = true) {
  if (borrador.envio) return borrador;
  return { ...borrador, pedidoId: null, pedidoTitulo: null, pedidoAutomatico: false, sinPedido, lineas: (borrador.lineas || []).map(sinVinculo) };
}

export function vincularRemitoPedido(borrador, pedido, sede, automatico = false) {
  if (borrador.envio) return borrador;
  if (!pedido || pedido.estado !== "pedido" || pedido.sede !== sede || !delMismoProveedor(borrador, pedido)) {
    throw new Error("El pedido no está pendiente en esta sede y para este proveedor.");
  }
  const porMaterial = new Map((pedido.items || []).filter(pendiente).map((i) => [i.material_id, i]));
  return {
    ...borrador, pedidoId: pedido.id, pedidoTitulo: `Pedido N° ${pedido.numero}`, pedidoAutomatico: automatico, sinPedido: false,
    lineas: (borrador.lineas || []).map((l) => {
      const limpia = sinVinculo(l);
      const item = porMaterial.get(l.materialId);
      return item ? { ...limpia, pedidoItemId: item.id, pedidoCantidad: numero(item.pendiente ?? item.cantidad), pedidoUnidadCompra: item.unidad_compra || "unidad" } : limpia;
    }),
  };
}

export function asociarPedidoAlRemito(borrador, pedidos = [], sede) {
  if (borrador.envio || borrador.sinPedido) return borrador;
  if (borrador.pedidoId) {
    const elegido = pedidos.find((p) => p.id === borrador.pedidoId && p.estado === "pedido" && p.sede === sede && delMismoProveedor(borrador, p));
    if (elegido && !borrador.pedidoAutomatico) return vincularRemitoPedido(borrador, elegido, sede);
    borrador = quitarPedidoDelRemito(borrador, false);
  }
  if (!borrador.remitoLeido) return borrador;
  const { automatico } = detectarPedidoRemito(borrador, pedidos, sede);
  return automatico ? vincularRemitoPedido(borrador, automatico, sede, true) : borrador;
}

/** Se vuelve a consultar antes de guardar; no se reutiliza un pedido ya recibido. */
export function validarPedidoDelRemito(borrador, pedidos, sede) {
  if (borrador.envio || !borrador.pedidoId) return;
  const pedido = pedidos.find((p) => p.id === borrador.pedidoId && p.estado === "pedido" && p.sede === sede && delMismoProveedor(borrador, p));
  const vinculadas = (borrador.lineas || []).filter((l) => l.pedidoItemId);
  if (!pedido || !vinculadas.length || vinculadas.some((l) => !pedido.items.some((i) => pendiente(i) && i.id === l.pedidoItemId && i.material_id === l.materialId))) {
    throw new Error("El pedido cambió o ya se recibió. Volvé a buscar el pedido antes de confirmar este remito.");
  }
}
