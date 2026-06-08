/* ─── Shared UI primitives ───────────────────────────────────── */

export const glassCard = {
  background:    'rgba(255,255,255,0.035)',
  backdropFilter:'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border:        '1px solid rgba(255,255,255,0.08)',
  borderRadius:  'var(--radius)',
  boxShadow:     'var(--shadow)',
}

export function Card({ children, style, className = '', ...rest }) {
  return (
    <div className={className} style={{ ...glassCard, padding: 18, ...style }} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', letterSpacing:.01 }}>
          {children}
        </span>
        {right}
      </div>
      {sub && <div style={{ fontSize:11, color:'var(--faint)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

const KPI_THEME = {
  accent: { accent:'var(--accent)',   soft:'var(--accent-soft)' },
  green:  { accent:'var(--green)',    soft:'var(--green-soft)'  },
  red:    { accent:'var(--red)',      soft:'var(--red-soft)'    },
  amber:  { accent:'var(--amber)',    soft:'var(--amber-soft)'  },
}

export function Kpi({ label, value, color = 'accent', sub, trend }) {
  const t = KPI_THEME[color] || KPI_THEME.accent
  return (
    <Card style={{ position:'relative', overflow:'hidden', padding:'16px 18px' }}>
      {/* Accent strip */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:2,
        background: `linear-gradient(90deg, ${t.accent}, transparent)`,
      }}/>
      <div style={{ color:'var(--faint)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
        {label}
      </div>
      <div style={{ fontSize:24, fontWeight:700, color: t.accent, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>
        {value}
      </div>
      {sub && <div style={{ color:'var(--faint)', fontSize:11, marginTop:6 }}>{sub}</div>}
      {trend != null && (
        <div style={{ fontSize:11, marginTop:4, color: trend >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}% vs mes anterior
        </div>
      )}
    </Card>
  )
}

export function Field({ label, children, style }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:5, ...style }}>
      <span style={{ fontSize:11, color:'var(--faint)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export function Badge({ children, color = 'var(--muted)', soft }) {
  return (
    <span style={{
      display:'inline-block',
      padding:'2px 8px',
      borderRadius:99,
      fontSize:11,
      fontWeight:600,
      letterSpacing:.02,
      color,
      background: soft || 'transparent',
      border: soft ? 'none' : `1px solid ${color}22`,
    }}>
      {children}
    </span>
  )
}

export function Spinner({ texto = 'Cargando…' }) {
  return (
    <div style={{ padding:48, textAlign:'center', color:'var(--faint)', fontSize:13 }}>{texto}</div>
  )
}

export function Vacio({ texto = 'Sin registros.', icon }) {
  return (
    <div style={{ padding:48, textAlign:'center', color:'var(--faint)', fontSize:13 }}>
      {icon && <div style={{ fontSize:24, marginBottom:8, opacity:.4 }}>{icon}</div>}
      {texto}
    </div>
  )
}

export function Divider() {
  return <div style={{ height:1, background:'var(--border-mid)', margin:'0 0 16px' }} />
}
