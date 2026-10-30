import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { C } from '@/theme';
import { documentLineScope, normalizeMaterialDocuments } from './productDocuments';
import { saveMaterialDocumentLinks, uploadMaterialDocuments } from './materialDocumentsApi';

export default function MaterialDocuments({ materialId, links = [], linea = null, editable = false, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState(documentLineScope(linea));
  const files = normalizeMaterialDocuments(links, linea);
  async function upload(event) {
    const selected = [...(event.target.files || [])]; event.target.value = '';
    if (!selected.length) return;
    setBusy(true); setError('');
    try { const saved = await uploadMaterialDocuments(materialId, selected, scope); await onChanged?.(saved); }
    catch (e) { setError(e.message || 'No se pudieron adjuntar los archivos.'); }
    finally { setBusy(false); }
  }
  async function remove(url) {
    setBusy(true); setError('');
    try { const saved = await saveMaterialDocumentLinks(materialId, links, links.filter(item => item.url !== url)); await onChanged?.(saved); }
    catch (e) { setError(e.message || 'No se pudo desvincular el archivo.'); }
    finally { setBusy(false); }
  }
  if (!editable && !files.length) return null;
  const button = { border: `1px solid ${C.b0}`, borderRadius: 7, padding: '6px 9px', background: C.s0, color: C.t1, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 };
  return <section aria-label="Planos y archivos del producto" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
    <strong style={{ fontSize: 12, color: C.t1 }}>Planos y archivos {files.length ? `· ${files.length}` : ''}</strong>
    {files.map(file => <div key={file.url} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <FileText size={14} style={{ flexShrink: 0, color: C.blue }} />
      <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name} style={{ color: C.blue, fontSize: 12, overflowWrap: 'anywhere', flex: 1 }}>{file.name}{file.linea ? ` · K${file.linea}` : ''}</a>
      {editable && <button type="button" aria-label={`Desvincular ${file.name}`} disabled={busy} onClick={() => remove(file.url)} style={button}><X size={12}/></button>}
    </div>)}
    {editable && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <select aria-label="Línea de los planos a adjuntar" value={scope} disabled={busy} onChange={event => setScope(event.target.value)} style={button}>
          <option value="">Todas las líneas</option>{['37','42','43','52','55','64','85'].map(value => <option key={value} value={value}>K{value}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} style={button}><Paperclip size={13}/>{busy ? 'Guardando…' : 'Adjuntar planos / archivos'}</button>
        <input ref={input} type="file" multiple hidden onChange={upload} />
      </div>
      <span style={{ color: C.t2, fontSize: 11 }}>DXF, PDF, imágenes u otros archivos · hasta 50 MB cada uno. Disponibles en los pedidos de este producto.</span>
    </>}
    {error && <div role="alert" style={{ color: C.red, fontSize: 12 }}>{error}</div>}
  </section>;
}
