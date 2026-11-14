import { corregirRechazo, fechaRequiereRevision, finalizarOperacion, reclamarOperacion, resolverOperacion, todosLosIdsPresentes } from "./operacionesMostrador.js";

/** El resultado se puede mostrar recién después del commit y de quitar el borrador. */
export async function cerrarOperacion(id, { almacen, borrarBorrador = () => {} }) {
  const terminada = await almacen.actualizar(id, finalizarOperacion);
  await borrarBorrador();
  return terminada;
}

/** La UI y el reintento usan el mismo camino; ninguna escritura precede al diario. */
export async function procesarOperacion(id, { almacen, enviar, consultar, token, online = true, ahora = () => Date.now() }) {
  if (!online) return almacen.actualizar(id, (e) => e);
  const envio = await almacen.actualizar(id, (e) => reclamarOperacion(e, token, ahora()));
  if (envio.candado?.token !== token) return envio;
  try {
    // Consultar también evita reenviar ids ya grabados cuando la respuesta del
    // intento anterior se perdió. Un error de lectura conserva el resultado incierto.
    const existentes = await consultar(envio.filas.map((f) => f.id));
    const actual = await almacen.actualizar(id, (e) => e);
    if (actual.candado?.token !== token) return actual;
    if (actual.candado.hasta <= ahora() && !fechaRequiereRevision(envio, ahora())) return actual;
    if (!todosLosIdsPresentes(envio, existentes)) {
      if (fechaRequiereRevision(envio, ahora())) {
        return almacen.actualizar(id, (e) => e.candado?.token === token
          ? { ...e, estado: "vencido", candado: null, error: "La fecha requiere regularización. Conservamos la hora original." } : e);
      }
      await enviar(envio.filas);
    }
  } catch (error) {
    return almacen.actualizar(id, (e) => resolverOperacion(e, token, { error, online }));
  }
  // Si este commit local falla, se rechaza la promesa: jamás se anuncia Listo.
  return almacen.actualizar(id, (e) => resolverOperacion(e, token, { enviado: true }));
}

export async function revisarOperacion(id, cambios, { almacen, consultar, token, ahora = () => Date.now() }) {
  const envio = await almacen.actualizar(id, (e) => reclamarOperacion(e, token, ahora(), true));
  if (envio.estado === "enviado") return envio;
  if (envio.candado?.token !== token) throw new Error("Otra pestaña está revisando este envío.");
  try {
    const existentes = await consultar(envio.filas.map((f) => f.id));
    return await almacen.actualizar(id, (actual) => {
      if (actual.candado?.token !== token) throw new Error("La revisión cambió en otra pestaña. Volvé a abrirla.");
      if (todosLosIdsPresentes(actual, existentes)) return resolverOperacion(actual, token, { enviado: true });
      if (!cambios) return { ...actual, candado: null, error: existentes.length ? "Hay parte del retiro registrada. Revisá los ids del original." : "No se encontraron estos ids en el registro. Conservamos el original para regularizar." };
      return corregirRechazo(actual, cambios, existentes, ahora());
    });
  } catch (error) {
    await almacen.actualizar(id, (e) => e.candado?.token === token ? { ...e, candado: null } : e);
    throw error;
  }
}
