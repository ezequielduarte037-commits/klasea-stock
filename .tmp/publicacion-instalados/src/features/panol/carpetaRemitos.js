/**
 * Donde queda un remito escaneado: en la PC del pañol y en el sistema.
 *
 * Son dos cosas distintas y conviene no mezclarlas:
 *
 *  - EL ARCHIVO FISICO vive en UNA carpeta. Un PDF no puede estar en dos lugares
 *    de un disco, asi que hay que elegir una y `carpetaFisicaDeRemito` decide
 *    cual con un orden fijo.
 *  - EN EL SISTEMA el mismo remito aparece en varios lados a la vez: en cada
 *    obra, en cada carpeta propia y en la del proveedor. No se duplica nada:
 *    son vistas del mismo documento.
 *
 * El puente vuelve a sanear la ruta de su lado: lo que llega de la web nunca se
 * usa como ruta tal cual.
 */

/** La carpeta madre de los proveedores, dentro de Remitos. */
export const CARPETA_PROVEEDORES = "Proveedores";

/** Cuanto puede medir el nombre de una carpeta propia (lo mismo que la base). */
export const MAX_NOMBRE_CARPETA = 60;

/**
 * La linea es la carpeta madre y la obra la de adentro: "K55/55-1". Asi el
 * pañolero abre Remitos, entra a K55 y ve los cinco barcos de esa linea, en vez
 * de una sola carpeta con cientos de PDFs mezclados.
 */
export function carpetaDeObra(obra) {
  if (!obra?.codigo) return "";
  const linea = String(obra.linea_nombre || "").trim();
  const codigo = String(obra.codigo).trim();
  return linea ? `${linea}/${codigo}` : codigo;
}

/**
 * El archivo fisico de la PC solo puede vivir en una carpeta. Cuando el mismo
 * PDF corresponde a varios barcos se guarda en Multiobra; dentro del sistema
 * aparece en cada obra gracias a la tabla de asociaciones.
 */
export function carpetaDeObras(obras) {
  const unicas = [...new Map((obras || []).filter((obra) => obra?.id).map((obra) => [String(obra.id), obra])).values()];
  if (unicas.length === 1) return carpetaDeObra(unicas[0]);
  if (unicas.length > 1) return "Multiobra";
  return "";
}

/**
 * El nombre de una carpeta propia como se guarda y se muestra.
 *
 * Las barras se sacan porque una carpeta propia es UN nivel: si alguien escribe
 * "Ferreteria/2026" no queremos una carpeta adentro de otra que despues nadie
 * encuentra. Los acentos se conservan: esto es el nombre que se lee en pantalla.
 */
export function normalizarCarpeta(valor) {
  return String(valor || "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOMBRE_CARPETA)
    .trim();
}

/** Lista de carpetas sin repetidos ni distinciones de mayusculas. */
export function normalizarCarpetas(valores) {
  const vistas = new Map();
  for (const valor of valores || []) {
    const nombre = normalizarCarpeta(valor);
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (!vistas.has(clave)) vistas.set(clave, nombre);
  }
  return [...vistas.values()];
}

/**
 * El mismo nombre pero como lo puede escribir Windows a traves del puente.
 *
 * El puente borra todo lo que no sea `A-Z a-z 0-9 espacio _ . -`, asi que
 * "Garantías" llegaria como "Garantas". Se pasan los acentos a su letra base
 * antes de mandarlo para que la carpeta del disco se llame "Garantias" y no una
 * palabra rota.
 */
export function carpetaParaDisco(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _.\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** La carpeta del proveedor: "Proveedores/Iriarte". Sale sola del nombre. */
export function carpetaDeProveedor(proveedor) {
  const nombre = carpetaParaDisco(normalizarCarpeta(proveedor));
  return nombre ? `${CARPETA_PROVEEDORES}/${nombre}` : "";
}

/**
 * En que carpeta de la PC del pañol se deja el PDF.
 *
 * El orden importa y es el que usa el pañolero cuando busca un papel a mano:
 * primero el barco, porque es lo primero que se pregunta; despues la carpeta que
 * eligio; y si no hay ninguna de las dos, la del proveedor, que es mejor que
 * dejarlo suelto en Pendientes con otros veinte.
 *
 * El puente acepta dos niveles, asi que todas las opciones caben.
 */
export function carpetaFisicaDeRemito({ obras = [], carpetas = [], proveedor = "" } = {}) {
  const deObras = carpetaDeObras(obras);
  if (deObras) return carpetaParaDisco(deObras);
  const propias = normalizarCarpetas(carpetas);
  if (propias.length) return carpetaParaDisco(propias[0]);
  return carpetaDeProveedor(proveedor);
}

/**
 * Todos los lugares del sistema donde va a estar el remito, para poder mostrarlo
 * antes de guardar. Que alguien vea "55-1 · Proveedores\Iriarte" antes de
 * confirmar es lo que evita el remito que despues no aparece en ningun lado.
 */
export function destinosDeRemito({ obras = [], carpetas = [], proveedor = "" } = {}) {
  const salida = [];
  const vistas = new Set();
  for (const obra of obras || []) {
    if (!obra?.codigo || vistas.has(`o:${obra.id}`)) continue;
    vistas.add(`o:${obra.id}`);
    salida.push({ tipo: "obra", clave: String(obra.id), etiqueta: obra.codigo, ruta: carpetaDeObra(obra) });
  }
  for (const nombre of normalizarCarpetas(carpetas)) {
    salida.push({ tipo: "carpeta", clave: `c:${nombre.toLowerCase()}`, etiqueta: nombre, ruta: nombre });
  }
  const delProveedor = normalizarCarpeta(proveedor);
  if (delProveedor) {
    salida.push({
      tipo: "proveedor",
      clave: `p:${delProveedor.toLowerCase()}`,
      etiqueta: delProveedor,
      ruta: `${CARPETA_PROVEEDORES}/${delProveedor}`,
    });
  }
  return salida;
}

/** Como se muestra la carpeta en pantalla, con las barras de Windows. */
export function carpetaParaMostrar(carpeta) {
  const limpia = String(carpeta || "").trim();
  return limpia ? `Remitos\\${limpia.replace(/\//g, "\\")}` : "Remitos\\Pendientes";
}
