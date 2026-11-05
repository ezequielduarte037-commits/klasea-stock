const CLAVE = "klasea.consumibles.ingreso.catalogo.v1";

function valido(catalogo) {
  return Array.isArray(catalogo) && catalogo.every((item) => item && typeof item.id === "string" && typeof item.descripcion === "string");
}

/** La copia sólo permite preparar el remito; confirmar exige una lectura vigente. */
export function leerCatalogoIngreso(sede, storage = globalThis.localStorage) {
  try {
    const propio = JSON.parse(storage.getItem(`${CLAVE}.${sede}`) || "null");
    if (valido(propio)) return propio;
    // Aprovecha los equipos que ya abrieron Mostrador sin modificar su stock guardado.
    const mostrador = JSON.parse(storage.getItem(`klasea.consumibles.mostrador.datos.${sede}`) || "null");
    return valido(mostrador?.catalogo) ? mostrador.catalogo.filter((item) => item.activo !== false) : null;
  } catch { return null; }
}

export function guardarCatalogoIngreso(sede, catalogo, storage = globalThis.localStorage) {
  try {
    if (!valido(catalogo)) return false;
    storage.setItem(`${CLAVE}.${sede}`, JSON.stringify(catalogo));
    return true;
  } catch { return false; }
}
