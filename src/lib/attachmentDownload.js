export function storageDownloadUrl(url, name) {
  if (!name) return null;

  let fileUrl;
  try {
    fileUrl = new URL(url);
  } catch {
    return null;
  }

  if (!['https:', 'http:'].includes(fileUrl.protocol)
    || !/^\/storage\/v1\/object\/(public|sign)\//.test(fileUrl.pathname)) return null;

  // El navegador ignora `download` en enlaces de otro dominio. Supabase
  // usa este parámetro para devolver el nombre del archivo en la respuesta.
  fileUrl.searchParams.set('download', name);
  return fileUrl.href;
}

export function canPreviewAttachment(name) {
  return /\.(pdf|jpe?g|png|gif|webp|avif|bmp)$/i.test(name || '');
}
