/**
 * Achica la foto de la hoja antes de subirla. Una foto de celular pesa 3–6 MB
 * y la IA lee igual de bien una de 1.800 px de lado: subir menos es más
 * rápido con los datos del celular y más barato de leer. Si el navegador no
 * puede (formato raro, memoria), se sube la original y que decida el servidor.
 */
const LADO_MAX = 1800;
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"];

export async function prepararFotoHoja(archivo) {
  if (!archivo) return archivo;
  const chica = archivo.size <= 1.5 * 1024 * 1024 && TIPOS_OK.includes(archivo.type);
  if (chica || typeof createImageBitmap !== "function") return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();
    const blob = await new Promise((resolver) => lienzo.toBlob(resolver, "image/jpeg", 0.85));
    if (!blob) return archivo;
    const nombre = String(archivo.name || "hoja").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}
