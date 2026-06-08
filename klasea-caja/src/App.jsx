import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login       from './auth/Login'
import Dashboard   from './pages/Dashboard'
import Caja        from './pages/Caja'
import Distribucion from './pages/Distribucion'
import Clientes    from './pages/Clientes'
import { Spinner } from './lib/ui'

const NAV = [
  { to: '/dashboard',    label: 'Dashboard'    },
  { to: '/caja',         label: 'Caja'         },
  { to: '/distribucion', label: 'Distribución' },
  { to: '/clientes',     label: 'Clientes'     },
]

/* ── Hook de tema ── */
function useTema() {
  const [tema, setTema] = useState(() => localStorage.getItem('tema') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    localStorage.setItem('tema', tema)
  }, [tema])

  const toggle = () => setTema(t => t === 'dark' ? 'light' : 'dark')
  return { tema, toggle }
}

/* ── Toggle switch visual ── */
function ThemeToggle({ tema, onToggle }) {
  const isLight = tema === 'light'
  return (
    <button
      onClick={onToggle}
      title={isLight ? 'Cambiar a oscuro' : 'Cambiar a claro'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: 99,
        padding: '5px 10px',
        cursor: 'pointer',
        color: 'var(--muted)',
        fontSize: 12,
        fontWeight: 500,
        transition: 'all .15s',
        width: '100%',
      }}
    >
      {/* Track */}
      <div style={{
        width: 32, height: 18, borderRadius: 99,
        background: isLight ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
        position: 'relative',
        flexShrink: 0,
        transition: 'background .2s',
      }}>
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          top: 3, left: isLight ? 15 : 3,
          width: 12, height: 12,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .18s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <span>{isLight ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  )
}

/* ── Sidebar ── */
function Sidebar({ sesion, tema, onToggleTema }) {
  const isLight = tema === 'light'
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.025)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 12px',
      position: 'sticky',
      top: 0,
      height: '100vh',
    }}>

      {/* Logo */}
      <div style={{ padding:'6px 10px 22px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'var(--accent)',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 4px 14px rgba(91,110,245,.4)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13.5, lineHeight:1, color:'var(--text)' }}>Klase A</div>
            <div style={{ fontSize:10.5, color:'var(--faint)', marginTop:1 }}>Control de caja</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
        {NAV.map(t => (
          <NavLink key={t.to} to={t.to} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center',
            padding: '8px 12px', borderRadius: 9,
            textDecoration: 'none', fontSize: 13,
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#fff' : 'var(--muted)',
            background: isActive ? 'var(--accent)' : 'transparent',
            transition: 'all .12s',
          })}>
            {t.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, display:'flex', flexDirection:'column', gap:8 }}>
        <ThemeToggle tema={tema} onToggle={onToggleTema} />
        <div style={{ fontSize:11, color:'var(--faint)', padding:'0 8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {sesion?.user?.email}
        </div>
        <button className="btn-ghost btn btn-sm" onClick={() => supabase.auth.signOut()} style={{ textAlign:'left' }}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

/* ── App ── */
export default function App() {
  const [sesion,   setSesion]   = useState(null)
  const [cargando, setCargando] = useState(true)
  const { tema, toggle }        = useTema()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); setCargando(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (cargando) return <Spinner />
  if (!sesion)  return <Login tema={tema} />

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar sesion={sesion} tema={tema} onToggleTema={toggle} />
      <main style={{ flex:1, padding:'28px 32px', maxWidth:1300, width:'100%' }}>
        <Routes>
          <Route path="/"             element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"    element={<Dashboard />} />
          <Route path="/caja"         element={<Caja />} />
          <Route path="/distribucion" element={<Distribucion />} />
          <Route path="/clientes"     element={<Clientes />} />
          <Route path="*"             element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
