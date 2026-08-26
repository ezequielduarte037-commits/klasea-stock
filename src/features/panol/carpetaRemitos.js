/**
 * En que carpeta de la PC del panol se archiva un remito escaneado.
 *
 * La linea es la carpeta madre y la obra la de adentro: "K55/55-1". Asi el
 * pañolero abre Remitos, entra a K55 y ve los cinco barcos de esa linea, en vez
 * de una sola carpeta con cientos de PDFs mezclados.
 *
 * El puente vuelve a sanear esto de su lado: lo que llega de la web nunca se usa
 * como ruta tal cual.
 */
export function carpetaDeObra(obra) {
  if (!obra?.codigo) return "";
  const linea = String(obra.linea_nombre || "").trim();
  const codigo = String(obra.codigo).trim();
  return linea ? `${linea}/${codigo}` : codigo;
}

/** Como se muestra la carpeta en pantalla, con las barras de Windows. */
export function carpetaParaMostrar(carpeta) {
  const limpia = String(carpeta || "").trim();
  return limpia ? `Remitos\\${limpia.replace(/\//g, "\\")}` : "Remitos\\Pendientes";
}
