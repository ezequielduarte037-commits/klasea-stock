import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Field, Badge, Spinner, Vacio, Kpi, SectionTitle } from '../lib/ui'
import { Confirm } from '../lib/Modal'
import { useToast } from '../lib/toast'
import { exportCSV } from '../lib/csv'
import { fmtMonto, fmtFecha, hoyISO } from '../lib/format'

const ESTADOS = {
  en_proceso: { label: 'En proceso', color: 'var(--amber)', soft: 'var(--amber-soft)' },
  entregado:  { label: 'Entregado',  color: 'var(--green)', soft: 'var(--green-soft)'  },
}

function movInicial() {
  return { fecha: hoyISO(), detalle: '', tipo: 'haber', monto: '', moneda: 'ARS', impactaCaja: true }
}

export default function Clientes() {
  const toast = useToast()
  const [clientes,     setClientes]     = useState([])
  const [movs,         setMovs]         = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [seleccion,    setSeleccion]    = useState(null)
  const [nuevoCliente, setNuevoCliente] = useState('')
  const [busqueda,     setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')   // '' | 'en_proceso' | 'entregado'
  const [orden,        setOrden]        = useState('nombre') // 'nombre' | 'deuda'

  async function cargar() {
    setCargando(true)
    const [c, m] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('movimientos_cliente').select('*')
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    setClientes(c.data || [])
    setMovs(m.data || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const saldoPorCliente = useMemo(() => {
    const acc = {}
    for (const mv of movs)
      acc[mv.cliente_id] = (acc[mv.cliente_id] || 0) + Number(mv.haber || 0) - Number(mv.debe || 0)
    return acc
  }, [movs])

  const totales = useMemo(() => {
    let proceso = 0, entregado = 0
    for (const c of clientes) {
      const s = saldoPorCliente[c.id] || 0
      if (c.estado === 'entregado') entregado += s
      else proceso += s
    }
    return { proceso, entregado }
  }, [clientes, saldoPorCliente])

  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let lista = clientes.filter(c =>
      (!q || c.nombre.toLowerCase().includes(q)) &&
      (!filtroEstado || c.estado === filtroEstado)
    )
    if (orden === 'deuda') lista = [...lista].sort((a, b) => (saldoPorCliente[a.id] || 0) - (saldoPorCliente[b.id] || 0))
    return lista
  }, [clientes, busqueda, filtroEstado, orden, saldoPorCliente])

  async function crearCliente(e) {
    e.preventDefault()
    const nombre = nuevoCliente.trim()
    if (!nombre) return
    const { data, error } = await supabase.from('clientes')
      .insert({ nombre, estado: 'en_proceso' }).select().single()
    if (error) { toast.error(error.message); return }
    toast.ok(`Cliente "${nombre}" creado.`)
    setNuevoCliente('')
    await cargar()
    if (data) setSeleccion(data.id)
  }

  const clienteSel = clientes.find(c => c.id === seleccion)

  return (
    <div style={{ display:'grid', gap:18 }} className="fadeup">
      <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>Clientes</h1>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Kpi label="Deuda en proceso"  color="amber" value={fmtMonto(Math.abs(totales.proceso))}
          sub={`${clientes.filter(c=>c.estado==='en_proceso').length} clientes`} />
        <Kpi label="Deuda entregados"  color="green" value={fmtMonto(Math.abs(totales.entregado))}
          sub={`${clientes.filter(c=>c.estado==='entregado').length} clientes`} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:16, alignItems:'start' }}>
        {/* Panel izquierdo */}
        <Card style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:12, borderBottom:'1px solid rgba(255,255,255,0.06)', display:'grid', gap:8 }}>
            <input className="inp" placeholder="Buscar cliente…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <div style={{ display:'flex', gap:6 }}>
              {['', 'en_proceso', 'entregado'].map(e => (
                <button key={e} className="btn btn-sm"
                  style={{
                    flex:1, boxShadow:'none', fontSize:11,
                    background: filtroEstado===e ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    color: filtroEstado===e ? '#fff' : 'var(--muted)',
                  }}
                  onClick={() => setFiltroEstado(e)}>
                  {e==='' ? 'Todos' : ESTADOS[e].label}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--faint)' }}>Ordenar:</span>
              {[['nombre','A-Z'],['deuda','Por deuda']].map(([v,l]) => (
                <button key={v} className="btn btn-sm"
                  style={{
                    flex:1, boxShadow:'none', fontSize:11,
                    background: orden===v ? 'var(--accent-soft)' : 'transparent',
                    color: orden===v ? 'var(--accent-2)' : 'var(--faint)',
                    border: `1px solid ${orden===v ? 'var(--accent)' : 'transparent'}`,
                  }}
                  onClick={() => setOrden(v)}>{l}
                </button>
              ))}
            </div>
            <form onSubmit={crearCliente} style={{ display:'flex', gap:6 }}>
              <input className="inp" style={{ flex:1 }} placeholder="+ Nuevo cliente"
                value={nuevoCliente} onChange={e => setNuevoCliente(e.target.value)} />
              <button className="btn btn-sm">+</button>
            </form>
          </div>

          {cargando ? <Spinner /> : listaFiltrada.length === 0 ? <Vacio texto="Sin clientes." /> : (
            <div style={{ maxHeight:'52vh', overflow:'auto' }}>
              {listaFiltrada.map(c => {
                const s = saldoPorCliente[c.id] || 0
                const activo = c.id === seleccion
                return (
                  <button key={c.id} onClick={() => setSeleccion(c.id)} style={{
                    width:'100%', textAlign:'left', border:'none',
                    borderLeft: activo ? '3px solid var(--accent)' : '3px solid transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: activo ? 'var(--panel-hover)' : 'transparent',
                    color:'var(--text)', padding:'10px 14px', cursor:'pointer',
                    display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
                  }}>
                    <span style={{ minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {c.nombre}
                      </div>
                      <Badge color={ESTADOS[c.estado].color} soft={ESTADOS[c.estado].soft}>
                        {ESTADOS[c.estado].label}
                      </Badge>
                    </span>
                    <span style={{ color: s < 0 ? 'var(--red)':'var(--green)', fontWeight:700, fontSize:13, whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums' }}>
                      {fmtMonto(s)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {clienteSel
          ? <DetalleCliente cliente={clienteSel} movimientos={movs.filter(m => m.cliente_id===clienteSel.id)} onCambio={cargar} />
          : <Card><Vacio texto="Elegí un cliente para ver su cuenta." /></Card>
        }
      </div>
    </div>
  )
}

/* ── Detalle de un cliente ── */
function DetalleCliente({ cliente, movimientos, onCambio }) {
  const toast = useToast()
  const [form,       setForm]       = useState(() => movInicial())
  const [guardando,  setGuardando]  = useState(false)
  const [notas,      setNotas]      = useState(cliente.notas || '')
  const [notaOk,     setNotaOk]     = useState(false)
  const [borrar,     setBorrar]     = useState(null)

  useEffect(() => { setNotas(cliente.notas || '') }, [cliente.id])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const filas = useMemo(() => {
    let acum = 0
    return movimientos
      .map(mv => { acum += Number(mv.haber||0) - Number(mv.debe||0); return { ...mv, saldo: acum } })
      .slice().reverse()
  }, [movimientos])

  const saldoActual = movimientos.reduce((a, mv) => a + Number(mv.haber||0) - Number(mv.debe||0), 0)

  async function cambiarEstado(estado) {
    await supabase.from('clientes').update({ estado }).eq('id', cliente.id)
    toast.ok(`Estado cambiado a "${ESTADOS[estado].label}".`)
    onCambio()
  }

  async function guardarNotas() {
    await supabase.from('clientes').update({ notas }).eq('id', cliente.id)
    setNotaOk(true)
    setTimeout(() => setNotaOk(false), 1800)
  }

  async function guardar(e) {
    e.preventDefault()
    const monto = Number(form.monto)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido.'); return }
    setGuardando(true)
    const esHaber = form.tipo === 'haber'
    const { error } = await supabase.from('movimientos_cliente').insert({
      cliente_id: cliente.id, fecha: form.fecha,
      detalle: form.detalle.trim(),
      debe:  esHaber ? 0 : monto,
      haber: esHaber ? monto : 0,
      moneda: form.moneda,
    })
    if (error) { toast.error(error.message); setGuardando(false); return }
    if (esHaber && form.impactaCaja) {
      await supabase.from('movimientos_caja').insert({
        fecha: form.fecha, moneda: form.moneda, tipo: 'entrada', monto,
        descripcion: `Pago ${cliente.nombre}${form.detalle ? ' — ' + form.detalle : ''}`,
        categoria_id: null,
      })
    }
    toast.ok('Movimiento registrado.')
    setGuardando(false)
    setForm({ ...movInicial(), moneda: form.moneda, fecha: hoyISO() })
    onCambio()
  }

  async function confirmarBorrar() {
    const { error } = await supabase.from('movimientos_cliente').delete().eq('id', borrar)
    if (error) toast.error(error.message)
    else { toast.ok('Movimiento eliminado.'); onCambio() }
  }

  function exportarCuenta() {
    const filasCsv = [...filas].reverse().map(mv => ({
      Fecha:   mv.fecha,
      Detalle: mv.detalle,
      Debe:    mv.debe || '',
      Haber:   mv.haber || '',
      Moneda:  mv.moneda,
      Saldo:   mv.saldo,
    }))
    exportCSV(filasCsv, `cuenta-${cliente.nombre.replace(/\s+/g,'-').toLowerCase()}`)
    toast.ok('Cuenta exportada.')
  }

  return (
    <div style={{ display:'grid', gap:14, alignContent:'start' }}>
      {/* Header cliente */}
      <Card>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:'0 0 6px', fontSize:18 }}>{cliente.nombre}</h2>
            <div style={{ display:'flex', gap:6 }}>
              {Object.entries(ESTADOS).map(([k,v]) => (
                <button key={k} className="btn btn-sm"
                  style={{
                    boxShadow:'none',
                    background: cliente.estado===k ? v.color : 'transparent',
                    border: `1px solid ${v.color}`,
                    color: cliente.estado===k ? '#0b1120' : v.color, fontWeight:700,
                  }}
                  onClick={() => cambiarEstado(k)}>{v.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ color:'var(--faint)', fontSize:11, textTransform:'uppercase', letterSpacing:'.05em' }}>Saldo</div>
            <div style={{ fontSize:22, fontWeight:700, fontVariantNumeric:'tabular-nums', color: saldoActual<0?'var(--red)':'var(--green)' }}>
              {fmtMonto(saldoActual)}
            </div>
          </div>
        </div>
        <div style={{ marginTop:12 }}>
          <Field label="Notas / resumen de la operación">
            <textarea className="inp" rows={2} value={notas}
              onChange={e => setNotas(e.target.value)} onBlur={guardarNotas}
              placeholder="Ej: K42 completo, entrega en obra, 6 cuotas…" style={{ resize:'vertical' }} />
          </Field>
          {notaOk && <div style={{ color:'var(--green)', fontSize:11, marginTop:3 }}>Guardado</div>}
        </div>
      </Card>

      {/* Nuevo movimiento */}
      <Card>
        <SectionTitle>Nuevo movimiento</SectionTitle>
        <form onSubmit={guardar} style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, alignItems:'end' }}>
          <Field label="Fecha">
            <input className="inp" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
          </Field>
          <Field label="Tipo">
            <select className="inp" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="haber">Pago (Haber)</option>
              <option value="debe">Cargo (Debe)</option>
            </select>
          </Field>
          <Field label="Monto">
            <input className="inp" type="number" step="0.01" min="0" value={form.monto}
              onChange={e => set('monto', e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Moneda">
            <select className="inp" value={form.moneda} onChange={e => set('moneda', e.target.value)}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Field>
          <Field label="Detalle" style={{ gridColumn:'span 4' }}>
            <input className="inp" value={form.detalle} onChange={e => set('detalle', e.target.value)}
              placeholder="Seña, cuota 1, entrega…" />
          </Field>
          {form.tipo === 'haber' && (
            <label style={{ gridColumn:'span 4', display:'flex', gap:8, alignItems:'center', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={form.impactaCaja} onChange={e => set('impactaCaja', e.target.checked)} />
              Registrar también como entrada en Caja
            </label>
          )}
          <div style={{ gridColumn:'span 4', display:'flex', justifyContent:'flex-end' }}>
            <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : '+ Agregar'}</button>
          </div>
        </form>
      </Card>

      {/* Tabla cuenta corriente */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:13 }}>Cuenta corriente</span>
          <button className="btn btn-ghost btn-sm" onClick={exportarCuenta}>↓ Exportar</button>
        </div>
        {filas.length === 0 ? <Vacio texto="Sin movimientos." /> : (
          <div style={{ maxHeight:'40vh', overflow:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Detalle</th>
                  <th className="num">Debe</th>
                  <th className="num">Haber</th>
                  <th className="num">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map(mv => (
                  <tr key={mv.id}>
                    <td style={{ whiteSpace:'nowrap', color:'var(--muted)', fontSize:12 }}>{fmtFecha(mv.fecha)}</td>
                    <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mv.detalle}</td>
                    <td className="num" style={{ color:'var(--red)' }}>
                      {Number(mv.debe) ? fmtMonto(mv.debe, mv.moneda) : ''}
                    </td>
                    <td className="num" style={{ color:'var(--green)' }}>
                      {Number(mv.haber) ? fmtMonto(mv.haber, mv.moneda) : ''}
                    </td>
                    <td className="num" style={{ color: mv.saldo<0?'var(--red)':'var(--green)', fontWeight:600 }}>
                      {fmtMonto(mv.saldo, mv.moneda)}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }}
                        onClick={() => setBorrar(mv.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Confirm
        open={!!borrar} onClose={() => setBorrar(null)}
        onConfirm={confirmarBorrar}
        mensaje="¿Borrar este movimiento de la cuenta corriente?"
      />
    </div>
  )
}
