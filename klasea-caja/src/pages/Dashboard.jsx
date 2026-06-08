import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { Card, Kpi, Spinner, SectionTitle } from '../lib/ui'
import { fmtMonto, fmtFecha, MESES } from '../lib/format'

const MESES_C = MESES.map(m => m.slice(0, 3))

/* Paleta discreta para el donut */
const PALETTE = [
  '#5b6ef5','#2dd4aa','#f0b429','#f06f87',
  '#7c86f9','#38d9b0','#f7c94d','#f590a3',
  '#a5adfb','#70e6c4',
]

function fmtK(v) {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000)     return '$' + (n / 1_000).toFixed(0)     + 'K'
  return '$' + n.toFixed(0)
}

/* Tooltip personalizado compartido */
function ChartTooltip({ active, payload, label, moneda = 'ARS', valueKey = 'value' }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(14,20,36,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '9px 13px',
      fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ color:'var(--faint)', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text)', fontWeight:600 }}>
          {fmtMonto(p.value, moneda)}
        </div>
      ))}
    </div>
  )
}

/* ── KPI derivados de datos ── */
function useKpis(movCaja, movClientes, categorias) {
  return useMemo(() => {
    const ahora    = new Date()
    const mesAct   = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`
    const mesAnt   = new Date(ahora.getFullYear(), ahora.getMonth()-1, 1)
    const mesAntStr = `${mesAnt.getFullYear()}-${String(mesAnt.getMonth()+1).padStart(2,'0')}`

    let saldoARS=0, saldoUSD=0
    let gastosActARS=0, gastosAntARS=0, gastosActUSD=0
    for (const mv of movCaja) {
      const s   = mv.tipo === 'entrada' ? 1 : -1
      const mes = String(mv.fecha).slice(0,7)
      if (mv.moneda === 'ARS') { saldoARS += s * Number(mv.monto) }
      else                     { saldoUSD += s * Number(mv.monto) }
      if (mv.tipo === 'salida') {
        if (mes === mesAct) {
          if (mv.moneda === 'ARS') gastosActARS += Number(mv.monto)
          else gastosActUSD += Number(mv.monto)
        }
        if (mes === mesAntStr && mv.moneda === 'ARS') gastosAntARS += Number(mv.monto)
      }
    }

    const trendGastos = gastosAntARS
      ? ((gastosActARS - gastosAntARS) / gastosAntARS) * 100
      : null

    // deuda = lo que los clientes nos deben = debe - haber (positivo = nos deben)
    let deuda = 0
    for (const mv of movClientes) deuda += Number(mv.debe||0) - Number(mv.haber||0)

    return { saldoARS, saldoUSD, gastosActARS, gastosActUSD, trendGastos, deuda }
  }, [movCaja, movClientes])
}

/* ── Evolución saldo ARS (últimos N meses) ── */
function useEvolucion(movCaja, n = 8) {
  return useMemo(() => {
    const porMes = {}
    let acum = 0
    for (const mv of movCaja) {
      if (mv.moneda !== 'ARS') continue
      const mes = String(mv.fecha).slice(0,7)
      acum += (mv.tipo === 'entrada' ? 1 : -1) * Number(mv.monto)
      porMes[mes] = acum
    }
    return Object.entries(porMes)
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(-n)
      .map(([mes, saldo]) => {
        const [y,m] = mes.split('-')
        return { mes: MESES_C[Number(m)-1] + " '" + y.slice(2), saldo }
      })
  }, [movCaja])
}

/* ── Gastos ARS por mes (últimos N meses) ── */
function useGastosMes(movCaja, n = 7) {
  return useMemo(() => {
    const acc = {}
    for (const mv of movCaja) {
      if (mv.tipo !== 'salida' || mv.moneda !== 'ARS') continue
      const mes = String(mv.fecha).slice(0,7)
      acc[mes] = (acc[mes]||0) + Number(mv.monto)
    }
    return Object.entries(acc)
      .sort(([a],[b]) => a.localeCompare(b))
      .slice(-n)
      .map(([mes, gastos]) => {
        const [y,m] = mes.split('-')
        return { mes: MESES_C[Number(m)-1] + " '" + y.slice(2), gastos }
      })
  }, [movCaja])
}

/* ── Donut categorías (mes actual, ARS) ── */
function useDonut(movCaja, categorias) {
  return useMemo(() => {
    const ahora  = new Date()
    const mesAct = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`
    const catMap = Object.fromEntries(categorias.map(c => [c.id, c.nombre]))
    const acc = {}
    for (const mv of movCaja) {
      if (mv.tipo !== 'salida' || mv.moneda !== 'ARS') continue
      if (String(mv.fecha).slice(0,7) !== mesAct) continue
      const n = catMap[mv.categoria_id] || 'Sin categoría'
      acc[n] = (acc[n]||0) + Number(mv.monto)
    }
    return Object.entries(acc)
      .sort(([,a],[,b]) => b - a)
      .slice(0,10)
      .map(([name,value]) => ({ name, value }))
  }, [movCaja, categorias])
}

/* ── Top clientes ── */
function useTopClientes(movClientes, clientes) {
  return useMemo(() => {
    const saldos = {}
    for (const mv of movClientes)
      saldos[mv.cliente_id] = (saldos[mv.cliente_id]||0) + Number(mv.haber||0) - Number(mv.debe||0)
    const map = Object.fromEntries(clientes.map(c => [c.id, c]))
    return Object.entries(saldos)
      .map(([id,saldo]) => ({ ...map[id], saldo }))
      .filter(c => c?.nombre)
      .sort((a,b) => a.saldo - b.saldo)
      .slice(0,6)
  }, [movClientes, clientes])
}

/* ════════════════ COMPONENTE PRINCIPAL ════════════════ */
export default function Dashboard() {
  const [movCaja,      setMovCaja]      = useState([])
  const [movClientes,  setMovClientes]  = useState([])
  const [clientes,     setClientes]     = useState([])
  const [categorias,   setCategorias]   = useState([])
  const [cargando,     setCargando]     = useState(true)

  useEffect(() => {
    (async () => {
      setCargando(true)
      const [mc, mcli, cli, cat] = await Promise.all([
        supabase.from('movimientos_caja').select('*').order('fecha'),
        supabase.from('movimientos_cliente').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('categorias_gasto').select('*').order('orden'),
      ])
      setMovCaja(mc.data || [])
      setMovClientes(mcli.data || [])
      setClientes(cli.data || [])
      setCategorias(cat.data || [])
      setCargando(false)
    })()
  }, [])

  const kpis        = useKpis(movCaja, movClientes, categorias)
  const evolucion   = useEvolucion(movCaja)
  const gastosMes   = useGastosMes(movCaja)
  const donut       = useDonut(movCaja, categorias)
  const topClientes = useTopClientes(movClientes, clientes)

  const ultimos = useMemo(() => {
    const catMap = Object.fromEntries(categorias.map(c => [c.id, c.nombre]))
    return [...movCaja].reverse().slice(0, 8).map(mv => ({ ...mv, catNombre: catMap[mv.categoria_id] || '—' }))
  }, [movCaja, categorias])

  if (cargando) return <Spinner texto="Cargando…" />

  /* Recharts: ejes y tooltip compartidos */
  const axisProps = {
    tick:      { fill:'var(--faint)', fontSize:11 },
    axisLine:  false,
    tickLine:  false,
  }
  const gridProps = { stroke:'rgba(255,255,255,0.04)', vertical:false }

  return (
    <div style={{ display:'grid', gap:20 }} className="fadeup">

      {/* Header */}
      <div>
        <h1 style={{ fontSize:20, fontWeight:700, margin:'0 0 2px' }}>Dashboard</h1>
        <div style={{ color:'var(--faint)', fontSize:12 }}>
          {new Date().toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        <Kpi label="Saldo pesos"     color={kpis.saldoARS < 0 ? 'red':'green'} value={fmtMonto(kpis.saldoARS,'ARS')} />
        <Kpi label="Saldo dólares"   color={kpis.saldoUSD < 0 ? 'red':'green'} value={fmtMonto(kpis.saldoUSD,'USD')} />
        <Kpi label="Gastos del mes"  color="red"   value={fmtMonto(kpis.gastosActARS,'ARS')}
          sub={kpis.gastosActUSD > 0 ? `+ ${fmtMonto(kpis.gastosActUSD,'USD')} en USD` : undefined}
          trend={kpis.trendGastos} />
        <Kpi label="Deuda clientes"  color="amber" value={fmtMonto(kpis.deuda,'ARS')} sub={`${clientes.length} clientes activos`} />
      </div>

      {/* Gráficos fila 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:14 }}>

        {/* Área: evolución saldo */}
        <Card>
          <SectionTitle sub="Saldo acumulado en pesos por mes">Evolución del saldo</SectionTitle>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={evolucion} margin={{ top:4,right:4,left:-8,bottom:0 }}>
              <defs>
                <linearGradient id="gSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#5b6ef5" stopOpacity={.25}/>
                  <stop offset="100%" stopColor="#5b6ef5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="mes"   {...axisProps} />
              <YAxis tickFormatter={v => fmtK(v)} {...axisProps} width={52} />
              <Tooltip content={<ChartTooltip moneda="ARS" />} />
              <Area
                type="monotone" dataKey="saldo"
                stroke="#5b6ef5" strokeWidth={2}
                fill="url(#gSaldo)" dot={false}
                activeDot={{ r:4, fill:'#5b6ef5', stroke:'var(--bg)', strokeWidth:2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Donut: categorías del mes */}
        <Card>
          <SectionTitle sub="Pesos · mes actual">Distribución por categoría</SectionTitle>
          {donut.length === 0
            ? <div style={{ color:'var(--faint)', textAlign:'center', padding:'40px 0', fontSize:12 }}>Sin gastos este mes</div>
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={donut} cx="50%" cy="50%" innerRadius={42} outerRadius={64}
                      paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                      {donut.map((_,i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background:'rgba(14,20,36,0.95)',
                        border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:10, fontSize:12,
                      }}
                      formatter={v => [fmtMonto(v,'ARS')]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:'grid', gap:5, maxHeight:110, overflow:'auto' }}>
                  {donut.map((d,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                      <span style={{ width:8, height:8, borderRadius:2, background:PALETTE[i%PALETTE.length], flexShrink:0 }}/>
                      <span style={{ color:'var(--muted)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.name}</span>
                      <span style={{ color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>{fmtK(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </Card>
      </div>

      {/* Gráficos fila 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

        {/* Barras: gastos por mes */}
        <Card>
          <SectionTitle sub="Salidas en pesos · últimos meses">Gastos por mes</SectionTitle>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={gastosMes} margin={{ top:4,right:4,left:-8,bottom:0 }} barSize={28}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="mes" {...axisProps} />
              <YAxis tickFormatter={v => fmtK(v)} {...axisProps} width={52} />
              <Tooltip content={<ChartTooltip moneda="ARS" />} />
              <Bar dataKey="gastos" radius={[5,5,0,0]}>
                {gastosMes.map((_,i) => (
                  <Cell key={i}
                    fill={i === gastosMes.length-1 ? '#5b6ef5' : 'rgba(91,110,245,0.25)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Top clientes */}
        <Card>
          <SectionTitle sub="Saldo pendiente por cliente">Clientes con mayor saldo</SectionTitle>
          {topClientes.length === 0
            ? <div style={{ color:'var(--faint)', textAlign:'center', padding:'40px 0', fontSize:12 }}>Sin clientes</div>
            : (
              <div style={{ display:'grid', gap:1 }}>
                {topClientes.map((c,i) => {
                  const max = Math.max(...topClientes.map(x => Math.abs(x.saldo)), 1)
                  const pct = Math.abs(c.saldo) / max * 100
                  const col = c.saldo < 0 ? 'var(--red)' : 'var(--green)'
                  return (
                    <div key={i} style={{ padding:'9px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:500, color:'var(--text)' }}>{c.nombre}</span>
                        <span style={{ fontSize:12, color:col, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>
                          {fmtMonto(c.saldo)}
                        </span>
                      </div>
                      <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,0.06)' }}>
                        <div style={{ height:'100%', width:pct+'%', background:col, borderRadius:99, opacity:.7 }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </Card>
      </div>

      {/* Últimos movimientos */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <SectionTitle sub="Registros más recientes" style={{ marginBottom:0 }}>Últimos movimientos</SectionTitle>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Moneda</th>
              <th className="num">Monto</th>
            </tr>
          </thead>
          <tbody>
            {ultimos.map(mv => (
              <tr key={mv.id}>
                <td style={{ color:'var(--faint)', fontSize:12, whiteSpace:'nowrap' }}>{fmtFecha(mv.fecha)}</td>
                <td style={{ maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mv.descripcion}</td>
                <td style={{ color:'var(--faint)', fontSize:12 }}>{mv.catNombre}</td>
                <td>
                  <span style={{
                    display:'inline-block', padding:'1px 8px', borderRadius:99,
                    fontSize:11, fontWeight:600,
                    color:      mv.moneda==='USD' ? 'var(--green)' : 'var(--accent-2)',
                    background: mv.moneda==='USD' ? 'var(--green-soft)' : 'var(--accent-soft)',
                  }}>{mv.moneda}</span>
                </td>
                <td className="num" style={{
                  color:      mv.tipo==='entrada' ? 'var(--green)' : 'var(--red)',
                  fontWeight: 600,
                  fontSize:   13,
                }}>
                  {mv.tipo==='entrada' ? '+' : '−'}{fmtMonto(mv.monto, mv.moneda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

    </div>
  )
}
