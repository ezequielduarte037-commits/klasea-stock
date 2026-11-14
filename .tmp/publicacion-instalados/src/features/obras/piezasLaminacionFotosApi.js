export const PIEZAS_FOTOS_BUCKET = "piezas-laminacion";
export const FOTOS_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
export const FOTO_MAX_BYTES = 20 * 1024 * 1024;

const FORMATOS = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/avif": "avif", "image/gif": "gif",
};

export function validarFotoPieza(file) {
  if (!FORMATOS[file.type]) throw new Error("Usá una foto JPG, PNG, WebP, AVIF o GIF. Si está en HEIC, exportala como JPG.");
  if (!file.size) throw new Error("La foto está vacía. Elegí otro archivo.");
  if (file.size > FOTO_MAX_BYTES) throw new Error("La foto supera los 20 MB. Elegí una de menor tamaño.");
}

export async function firmarFotoPieza(client, foto) {
  const { data, error } = await client.storage.from(PIEZAS_FOTOS_BUCKET).createSignedUrl(foto.storage_path, 3600);
  if (error || !data?.signedUrl) throw new Error("No se pudo abrir la foto. Volvé a intentarlo.");
  return { ...foto, url: data.signedUrl };
}

export async function subirFotoPieza(client, { obraId, lineaKey, pieza, file }) {
  validarFotoPieza(file);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) throw new Error("Iniciá sesión para cargar fotos.");
  const safe = pieza.pieza_id.replace(/\//g, "_");
  const path = `${obraId}/${lineaKey ?? "x"}/${safe}/${crypto.randomUUID()}.${FORMATOS[file.type]}`;
  const storage = client.storage.from(PIEZAS_FOTOS_BUCKET);
  // Se conserva el archivo original: sin recortar ni reducir la resolución.
  const { error: uploadError } = await storage.upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw new Error("No se pudo subir la foto: " + uploadError.message);
  const { data, error } = await client.from("piezas_laminacion_imagenes").insert({
    obra_id: obraId, pieza_id: pieza.pieza_id, pieza_num: pieza.num,
    storage_path: path, nombre: file.name, created_by: session.user.id,
  }).select("*").single();
  if (error) {
    await storage.remove([path]);
    throw new Error("No se pudo guardar la referencia: " + error.message);
  }
  // La referencia queda guardada aun si falla temporalmente la vista previa.
  try { return await firmarFotoPieza(client, data); }
  catch { return { ...data, url: null }; }
}

export async function eliminarFotoPieza(client, foto) {
  // Primero confirmar el permiso de borrado; no dejar referencias rotas si falla.
  const { error } = await client.from("piezas_laminacion_imagenes").delete()
    .eq("id", foto.id).select("id").single();
  if (error) throw new Error("No se pudo quitar la foto: " + error.message);
  const { error: storageError } = await client.storage.from(PIEZAS_FOTOS_BUCKET).remove([foto.storage_path]);
  return storageError ? "Se quitó la referencia, pero no se pudo limpiar el archivo almacenado." : "";
}
