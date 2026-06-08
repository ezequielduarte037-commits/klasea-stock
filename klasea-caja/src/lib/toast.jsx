import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const Ctx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const id = useRef(0)

  const push = useCallback((msg, type = 'info', ms = 3200) => {
    const tid = ++id.current
    setToasts(t => [...t, { tid, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.tid !== tid)), ms)
  }, [])

  const toast = {
    ok:    (m, ms) => push(m, 'ok',    ms),
    error: (m, ms) => push(m, 'error', ms),
    info:  (m, ms) => push(m, 'info',  ms),
  }

  const COLORS = {
    ok:    { bg: 'var(--green-soft)',  border: 'var(--green)',  text: 'var(--green)'  },
    error: { bg: 'var(--red-soft)',    border: 'var(--red)',    text: 'var(--red)'    },
    info:  { bg: 'var(--accent-soft)', border: 'var(--accent)', text: 'var(--accent-2)' },
  }

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div style={{ position:'fixed', bottom:24, right:24, display:'flex', flexDirection:'column', gap:8, zIndex:9999 }}>
        {toasts.map(t => {
          const c = COLORS[t.type]
          return (
            <div key={t.tid} style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 340,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              animation: 'fadeup .2s ease both',
            }}>
              {t.msg}
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
