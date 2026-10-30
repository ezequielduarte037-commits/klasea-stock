// Los documentos se conservan junto a los enlaces del producto. No se borran
// del almacenamiento al desvincularlos: los pedidos históricos siguen abriendo.
export function documentLineScope(linea) {
  return String(linea || '').replace(/^K/i, '').split('-')[0];
}

export function normalizeMaterialDocuments(links = [], linea = null) {
  const scope = documentLineScope(linea);
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .filter(item => item?.kind === 'documento' && /^https?:\/\//i.test(item.url || ''))
    .filter(item => !scope || !item.linea || documentLineScope(item.linea) === scope)
    .filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true; })
    .map(item => ({ url: item.url, path: item.path || '', name: item.name || item.label || 'Plano / archivo', type: item.type || 'application/octet-stream', size: Number(item.size) || 0, linea: item.linea || null }));
}

export function documentToMaterialLink(file, linea = null) {
  if (!/^https?:\/\//i.test(file?.url || '')) throw new Error('El archivo no tiene una dirección válida.');
  return { kind: 'documento', label: file.name, url: file.url, nota: '', name: file.name, path: file.path || '', type: file.type || 'application/octet-stream', size: Number(file.size) || 0, linea: documentLineScope(linea) || null };
}

export function mergeDocumentAttachments(...groups) {
  const seen = new Set();
  return groups.flat().filter(item => item && /^https?:\/\//i.test(item.url || '')).filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url); return true;
  });
}
