import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Field } from '../lib/ui'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function ingresar(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20 }}>
      <div className="fadeup" style={{
        width:360, maxWidth:'100%',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Mark */}
        <div style={{
          width:40, height:40, borderRadius:11,
          background:'var(--accent)',
          display:'grid', placeItems:'center',
          marginBottom:20,
          boxShadow:'0 6px 20px rgba(91,110,245,.5)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3"/>
          </svg>
        </div>
        <h1 style={{ fontSize:20, fontWeight:700, margin:'0 0 4px' }}>Caja Klase A</h1>
        <p style={{ color:'var(--faint)', margin:'0 0 26px', fontSize:13 }}>Ingresá con tu usuario</p>

        <form onSubmit={ingresar} style={{ display:'grid', gap:14 }}>
          <Field label="Email">
            <input className="inp" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Contraseña">
            <input className="inp" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </Field>
          {error && <div style={{ color:'var(--red)', fontSize:12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ marginTop:4, width:'100%', padding:'10px' }}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
