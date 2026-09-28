export function canonicalSede(value) {
  const s = String(value || '').toLowerCase();
  return s.includes('chubut') ? 'Chubut' : s.includes('pampa') ? 'Pampa' : '';
}
export function makeFeed(rows, profile, snapshotObras = new Map()) {
  const sede = canonicalSede(profile?.sede);
  const open = rows.filter(r => ['enviado', 'en_preparacion', 'parcial'].includes(r.estado)
    && (!sede || canonicalSede(r.sede) === sede));
  open.sort((a, b) => Number(b.prioridad === 'urgente') - Number(a.prioridad === 'urgente')
    || String(b.created_at).localeCompare(String(a.created_at)));
  return {
    type: 'feed', status: 'ok', sede, total: open.length,
    urgent: open.filter(r => r.prioridad === 'urgente').length,
    notices: open.slice(0, 20).map(r => {
      const items = (r.items || []).filter(i => i.estado !== 'recibido');
      const obras = [...new Set(items.map(i => snapshotObras.get(i.obra_snapshot_item_id)).filter(Boolean))];
      return { id: r.id, title: String(r.titulo || '').slice(0, 120), obra: String(obras.join(' / ') || r.obra?.codigo || r.destino || 'Sin obra indicada').slice(0, 100),
        sede: r.sede, urgent: r.prioridad === 'urgente', items: items.length,
        detail: items.slice(0, 3).map(i => i.descripcion).join(' / ').slice(0, 180) };
    }), updated: new Date().toISOString(),
  };
}
