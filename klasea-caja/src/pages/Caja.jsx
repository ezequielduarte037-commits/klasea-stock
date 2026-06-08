import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Field, Badge, Spinner, Vacio, Kpi, SectionTitle } from '../lib/ui'
import { Modal, Confirm } from '../lib/Modal'
import { useToast } from '../lib/toast'
import { exportCSV } from '../lib/csv'
import { fmtMonto, fmtFecha, hoyISO } from '../lib/format'

const formVacio = () => ({
  fecha: hoyISO(), moneda: 'ARS', tipo: 'salida',
  monto: '', tipo_cambio: '', descripcion: '', categoria_id: '',
  cliente_id: '',   // si es entrada de un cliente
})

const filtrosVacios = {
  q: '', desde: '', hasta: '', categoria_id: '', tipo: '', moneda: '',
}


function usdEquiv(mv) {
  if (mv.moneda === 'USD') return Number(mv.monto)
  if (mv.tipo_cambio)      return Number(mv.monto) / Number(mv.tipo_cambio)
  return null
}

export default function Caja() {
  const toast = useToast()
  const [movs,       setMovs]       = useState([])
  const [categorias, setCategorias] = useState([])
  const [clientes,   setClientes]   = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [form,       setForm]       = useState(formVacio)
  const [guardando,  setGuardando]  = useState(false)
  const [filtros,    setFiltros]    = useState(filtrosVacios)
  const [editando,   setEditando]   = useState(null)   // { mv } o null
  const [borrar,     setBorrar]     = useState(null)   // id o null
  const [nuevaCat,   setNuevaCat]   = useState('')     // texto nueva categoría
  const [creandoCat, setCreandoCat] = useState(false)  // muestra el input inline

  async function cargar() {
    setCargando(true)
    const [m, c, cl] = await Promise.all([
      supabase.from('movimientos_caja').select('*')
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('categorias_gasto').select('*').order('orden'),
      supabase.from('clientes').select('id,nombre').order('nombre'),
    ])
    setMovs(m.data || [])
    setCategorias(c.data || [])
    setClientes(cl.data || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  /* ── Saldos acumulados totales + filas con saldo corriente ── */
  const filasConSaldo = useMemo(() => {
    const acum = { ARS: 0, USD: 0 }
    return movs.map(mv => {
      const s = mv.tipo === 'entrada' ? 1 : -1
      acum[mv.moneda] = (acum[mv.moneda] || 0) + s * Number(mv.monto)
      return { ...mv, saldo: acum[mv.moneda] }
    }).slice().reverse()
  }, [movs])

  const catPorId = useMemo(
    () => Object.fromEntries(categorias.map(c => [c.id, c.nombre])), [categorias]
  )

  /* ── Filtrado ── */
  const filtradas = useMemo(() => {
    const q = filtros.q.toLowerCase().trim()
    return filasConSaldo.filter(mv => {
      if (q && !mv.descripcion?.toLowerCase().includes(q) && !catPorId[mv.categoria_id]?.toLowerCase().includes(q)) return false
      if (filtros.desde && mv.fecha < filtros.desde) return false
      if (filtros.hasta && mv.fecha > filtros.hasta) return false
      if (filtros.categoria_id && mv.categoria_id !== filtros.categoria_id) return false
      if (filtros.tipo && mv.tipo !== filtros.tipo) return false
      if (filtros.moneda && mv.moneda !== filtros.moneda) return false
      return true
    })
  }, [filasConSaldo, filtros, catPorId])

  const hayFiltros = Object.values(filtros).some(v => v !== '')

  /* ── KPIs del período visible (sobre filtradas) ── */
  const kpisPeriodo = useMemo(() => {
    const r = { entradasARS:0, salidasARS:0, entradasUSD:0, salidasUSD:0 }
    for (const mv of filtradas) {
      if (mv.moneda === 'ARS') {
        if (mv.tipo === 'entrada') r.entradasARS += Number(mv.monto)
        else r.salidasARS += Number(mv.monto)
      } else {
        if (mv.tipo === 'entrada') r.entradasUSD += Number(mv.monto)
        else r.salidasUSD += Number(mv.monto)
      }
    }
    return { ...r, netARS: r.entradasARS - r.salidasARS, netUSD: r.entradasUSD - r.salidasUSD }
  }, [filtradas])

function setF(k, v) { setFiltros(f => ({ ...f, [k]: v })) }
  function setForm_(k, v) { setForm(f => ({ ...f, [k]: v })) }

  /* ── Crear categoría nueva ── */
  async function guardarNuevaCat(e) {
    e.preventDefault()
    const nombre = nuevaCat.trim()
    if (!nombre) return
    const maxOrden = categorias.reduce((m, c) => Math.max(m, c.orden || 0), 0)
    const { data, error } = await supabase
      .from('categorias_gasto')
      .insert({ nombre, orden: maxOrden + 1 })
      .select().single()
    if (error) { toast.error(error.message); return }
    toast.ok(`Categoría "${nombre}" creada.`)
    setNuevaCat('')
    setCreandoCat(false)
    await cargar()
    // seleccionarla automáticamente en el form
    if (data) setForm(f => ({ ...f, categoria_id: data.id }))
  }

  /* ── Guardar nuevo ── */
  async function guardar(e) {
    e.preventDefault()
    const monto = Number(form.monto)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido.'); return }
    setGuardando(true)
    const { error } = await supabase.from('movimientos_caja').insert({
      fecha: form.fecha, moneda: form.moneda, tipo: form.tipo, monto,
      tipo_cambio: form.moneda === 'ARS' && form.tipo_cambio ? Number(form.tipo_cambio) : null,
      descripcion: form.descripcion.trim(),
      categoria_id: form.tipo === 'salida' && form.categoria_id ? form.categoria_id : null,
    })
    setGuardando(false)
    if (error) { toast.error(error.message); return }
    // Si es entrada de un cliente → impacta su cuenta corriente
    if (form.tipo === 'entrada' && form.cliente_id) {
      await supabase.from('movimientos_cliente').insert({
        cliente_id: form.cliente_id,
        fecha: form.fecha,
        detalle: form.descripcion.trim() || 'Pago registrado en caja',
        debe: 0,
        haber: monto,
        moneda: form.moneda,
      })
    }
    toast.ok('Movimiento agregado.' + (form.tipo === 'entrada' && form.cliente_id ? ' Cuenta corriente del cliente actualizada.' : ''))
    setForm(formVacio())
    cargar()
  }

  /* ── Guardar edición ── */
  async function guardarEdicion(e) {
    e.preventDefault()
    const mv = editando
    const monto = Number(mv.monto)
    if (!monto || monto <= 0) { toast.error('Monto inválido.'); return }
    const { error } = await supabase.from('movimientos_caja').update({
      fecha: mv.fecha, moneda: mv.moneda, tipo: mv.tipo, monto,
      tipo_cambio: mv.moneda === 'ARS' && mv.tipo_cambio ? Number(mv.tipo_cambio) : null,
      descripcion: mv.descripcion?.trim() || '',
      categoria_id: mv.tipo === 'salida' && mv.categoria_id ? mv.categoria_id : null,
    }).eq('id', mv.id)
    if (error) { toast.error(error.message); return }
    toast.ok('Movimiento actualizado.')
    setEditando(null)
    cargar()
  }

  /* ── Borrar ── */
  async function confirmarBorrar() {
    const { error } = await supabase.from('movimientos_caja').delete().eq('id', borrar)
    if (error) toast.error(error.message)
    else { toast.ok('Movimiento eliminado.'); cargar() }
  }

  /* ── Export CSV ── */
  function exportar() {
    const filas = filtradas.map(mv => ({
      Fecha:       mv.fecha,
      Descripcion: mv.descripcion,
      Categoria:   catPorId[mv.categoria_id] || '',
      Moneda:      mv.moneda,
      Tipo:        mv.tipo,
      Monto:       mv.monto,
      TipoCambio:  mv.tipo_cambio || '',
      'USD equiv': usdEquiv(mv)?.toFixed(2) || '',
      Saldo:       mv.saldo,
    }))
    exportCSV(filas, 'caja-klasea')
    toast.ok(`${filas.length} registros exportados.`)
  }

  return (
    <div style={{ display:'grid', gap:18 }} className="fadeup">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>Caja</h1>
        <button className="btn btn-ghost btn-sm" onClick={exportar}>
          ↓ Exportar CSV
        </button>
      </div>

      {/* KPIs — muestran el período activo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        <Kpi
          label="Entradas"
          color="green"
          value={fmtMonto(kpisPeriodo.entradasARS, 'ARS')}
          sub={kpisPeriodo.entradasUSD > 0 ? `+ ${fmtMonto(kpisPeriodo.entradasUSD,'USD')}` : undefined}
        />
        <Kpi
          label="Salidas"
          color="red"
          value={fmtMonto(kpisPeriodo.salidasARS, 'ARS')}
          sub={kpisPeriodo.salidasUSD > 0 ? `+ ${fmtMonto(kpisPeriodo.salidasUSD,'USD')}` : undefined}
        />
        <Kpi
          label="Neto período"
          color={kpisPeriodo.netARS < 0 ? 'red' : 'green'}
          value={fmtMonto(kpisPeriodo.netARS, 'ARS')}
          sub={kpisPeriodo.netUSD !== 0 ? `${kpisPeriodo.netUSD > 0 ? '+' : ''} ${fmtMonto(kpisPeriodo.netUSD,'USD')}` : undefined}
        />
        <Kpi
          label="Saldo acumulado total"
          color="accent"
          value={fmtMonto(filtradas[filtradas.length - 1]?.saldo ?? 0, 'ARS')}
          sub="Al final del período"
        />
      </div>

      {/* Formulario nuevo movimiento */}
      <Card>
        <SectionTitle>Nuevo movimiento</SectionTitle>
        <form onSubmit={guardar} style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, alignItems:'end' }}>
          <Field label="Fecha">
            <input className="inp" type="date" value={form.fecha} onChange={e => setForm_('fecha', e.target.value)} />
          </Field>
          <Field label="Moneda">
            <select className="inp" value={form.moneda} onChange={e => setForm_('moneda', e.target.value)}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Field>
          <Field label="Tipo">
            <select className="inp" value={form.tipo} onChange={e => setForm_('tipo', e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </Field>
          <Field label="Monto">
            <input className="inp" type="number" step="0.01" min="0" value={form.monto}
              onChange={e => setForm_('monto', e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="T. cambio USD">
            <input className="inp" type="number" step="0.01" min="0" value={form.tipo_cambio}
              onChange={e => setForm_('tipo_cambio', e.target.value)}
              placeholder={form.moneda === 'ARS' ? '$ por USD' : '—'}
              disabled={form.moneda !== 'ARS'} />
          </Field>
          <Field label={
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Categoría</span>
              {form.tipo === 'salida' && !creandoCat && (
                <button type="button" onClick={() => setCreandoCat(true)}
                  style={{ background:'none', border:'none', color:'var(--accent-2)', fontSize:11, cursor:'pointer', padding:0, fontWeight:600 }}>
                  + Nueva
                </button>
              )}
            </div>
          }>
            {creandoCat ? (
              <form onSubmit={guardarNuevaCat} style={{ display:'flex', gap:4 }}>
                <input className="inp" autoFocus value={nuevaCat}
                  onChange={e => setNuevaCat(e.target.value)}
                  placeholder="Nombre de categoría…" style={{ flex:1 }} />
                <button type="submit" className="btn btn-sm">✓</button>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => { setCreandoCat(false); setNuevaCat('') }}>✕</button>
              </form>
            ) : (
              <select className="inp" value={form.categoria_id}
                onChange={e => setForm_('categoria_id', e.target.value)}
                disabled={form.tipo !== 'salida'}>
                <option value="">— ninguna —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </Field>
          {/* Cliente origen — solo visible en entradas */}
          {form.tipo === 'entrada' && (
            <Field label="Pago de cliente" style={{ gridColumn:'span 2' }}>
              <select className="inp" value={form.cliente_id}
                onChange={e => setForm_('cliente_id', e.target.value)}>
                <option value="">— sin asignar —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Field>
          )}

          <Field label="Descripción" style={{ gridColumn: form.tipo === 'entrada' ? 'span 3' : 'span 5' }}>
            <input className="inp" value={form.descripcion}
              onChange={e => setForm_('descripcion', e.target.value)}
              placeholder={form.tipo === 'entrada' ? 'Ej: cuota 3, seña, pago parcial…' : 'Ej: levy herrero, abono alquiler…'} />
          </Field>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button className="btn" disabled={guardando}>
              {guardando ? 'Guardando…' : '+ Agregar'}
            </button>
          </div>
        </form>
      </Card>

      {/* Filtros */}
      <Card style={{ padding:'14px 18px' }}>
<div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr auto', gap:10, alignItems:'end' }}>
          <Field label="Buscar">
            <input className="inp" value={filtros.q}
              onChange={e => setF('q', e.target.value)} placeholder="Descripción o categoría…" />
          </Field>
          <Field label="Desde">
            <input className="inp" type="date" value={filtros.desde} onChange={e => setF('desde', e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input className="inp" type="date" value={filtros.hasta} onChange={e => setF('hasta', e.target.value)} />
          </Field>
          <Field label="Categoría">
            <select className="inp" value={filtros.categoria_id} onChange={e => setF('categoria_id', e.target.value)}>
              <option value="">Todas</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="inp" value={filtros.tipo} onChange={e => setF('tipo', e.target.value)}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </Field>
          <Field label="Moneda">
            <select className="inp" value={filtros.moneda} onChange={e => setF('moneda', e.target.value)}>
              <option value="">Todas</option>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Field>
          <div style={{ paddingBottom:1 }}>
            {hayFiltros && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFiltros(filtrosVacios)}>
                Limpiar
              </button>
            )}
          </div>
        </div>
        {hayFiltros && (
          <div style={{ marginTop:8, fontSize:12, color:'var(--faint)' }}>
            Mostrando <strong style={{ color:'var(--accent-2)' }}>{filtradas.length}</strong> de {filasConSaldo.length} movimientos
          </div>
        )}
      </Card>

      {/* Tabla */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        {cargando ? <Spinner /> : filtradas.length === 0 ? (
          <Vacio texto={hayFiltros ? 'Sin resultados para ese filtro.' : 'Sin movimientos.'} />
        ) : (
          <div style={{ maxHeight:'60vh', overflow:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Mon.</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                  <th className="num">≈ USD</th>
                  <th className="num">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(mv => {
                  const usd = usdEquiv(mv)
                  return (
                    <tr key={mv.id}>
                      <td style={{ whiteSpace:'nowrap', color:'var(--muted)', fontSize:12 }}>{fmtFecha(mv.fecha)}</td>
                      <td style={{ maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {mv.descripcion}
                      </td>
                      <td style={{ color:'var(--faint)', fontSize:12 }}>{catPorId[mv.categoria_id] || '—'}</td>
                      <td>
                        <Badge
                          color={mv.moneda==='USD' ? 'var(--green)' : 'var(--accent-2)'}
                          soft={mv.moneda==='USD' ? 'var(--green-soft)' : 'var(--accent-soft)'}
                        >{mv.moneda}</Badge>
                      </td>
                      <td className="num" style={{ color:'var(--green)' }}>
                        {mv.tipo==='entrada' ? fmtMonto(mv.monto, mv.moneda) : ''}
                      </td>
                      <td className="num" style={{ color:'var(--red)' }}>
                        {mv.tipo==='salida' ? fmtMonto(mv.monto, mv.moneda) : ''}
                      </td>
                      <td className="num" style={{ color:'var(--faint)', fontSize:12 }}>
                        {usd != null ? fmtMonto(usd,'USD') : '—'}
                      </td>
                      <td className="num" style={{ color: mv.saldo < 0 ? 'var(--red)' : 'var(--text)' }}>
                        {fmtMonto(mv.saldo, mv.moneda)}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => setEditando({ ...mv })}>✎</button>
                          <button className="btn btn-ghost btn-sm"
                            style={{ color:'var(--red)' }}
                            onClick={() => setBorrar(mv.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal editar */}
      <Modal open={!!editando} onClose={() => setEditando(null)} title="Editar movimiento">
        {editando && (
          <form onSubmit={guardarEdicion} style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Fecha">
                <input className="inp" type="date" value={editando.fecha}
                  onChange={e => setEditando(v => ({ ...v, fecha: e.target.value }))} />
              </Field>
              <Field label="Moneda">
                <select className="inp" value={editando.moneda}
                  onChange={e => setEditando(v => ({ ...v, moneda: e.target.value }))}>
                  <option value="ARS">Pesos</option>
                  <option value="USD">Dólares</option>
                </select>
              </Field>
              <Field label="Tipo">
                <select className="inp" value={editando.tipo}
                  onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}>
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                </select>
              </Field>
              <Field label="Monto">
                <input className="inp" type="number" step="0.01" min="0" value={editando.monto}
                  onChange={e => setEditando(v => ({ ...v, monto: e.target.value }))} />
              </Field>
              <Field label="T. cambio USD">
                <input className="inp" type="number" step="0.01" min="0"
                  value={editando.tipo_cambio || ''}
                  disabled={editando.moneda !== 'ARS'}
                  onChange={e => setEditando(v => ({ ...v, tipo_cambio: e.target.value }))} />
              </Field>
              <Field label="Categoría">
                <select className="inp" value={editando.categoria_id || ''}
                  disabled={editando.tipo !== 'salida'}
                  onChange={e => setEditando(v => ({ ...v, categoria_id: e.target.value }))}>
                  <option value="">— ninguna —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <input className="inp" value={editando.descripcion || ''}
                onChange={e => setEditando(v => ({ ...v, descripcion: e.target.value }))} />
            </Field>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className="btn btn-sm">Guardar cambios</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm borrar */}
      <Confirm
        open={!!borrar}
        onClose={() => setBorrar(null)}
        onConfirm={confirmarBorrar}
        mensaje="¿Borrar este movimiento? Esta acción no se puede deshacer."
      />
    </div>
  )
}
