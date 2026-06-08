import { useEffect } from 'react'

/* Modal genérico */
export function Modal({ open, onClose, title, children, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        width, maxWidth: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        animation: 'fadeup .18s ease both',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--faint)',
            fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}

/* Modal de confirmación */
export function Confirm({ open, onClose, onConfirm, mensaje = '¿Confirmar acción?', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title="Confirmar" width={380}>
      <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: 13 }}>{mensaje}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button
          className="btn btn-sm"
          style={danger ? { background: 'var(--red)', boxShadow: 'none' } : {}}
          onClick={() => { onConfirm(); onClose() }}
        >
          Confirmar
        </button>
      </div>
    </Modal>
  )
}
