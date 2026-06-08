import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Field, Spinner, Vacio, Kpi, SectionTitle, Badge } from '../lib/ui'
import { fmtMonto, MESES } from '../lib/format'

export default function Distribucion() {
  const [salidas, setSalidas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [moneda, setMoneda] = useState('USD') // el jefe lo quiere en dólares
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [tcRef, setTcRef] = useState('1000') // tipo de cambio de referencia

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const [m, c] = await Promise.all([
        supabase
          .from('movimientos_caja')
          .select('fecha, monto, moneda, categoria_id, tipo_cambio')
          .eq('tipo', 'salida'),
        supabase.from('categorias_gasto').select('*').order('orden'),
      ])
      setSalidas(m.data || [])
      setCategorias(c.data || [])
      setCargando(false)
    }
    cargar()
  }, [])

  const anios = useMemo(() => {
    const set = new Set(salidas.map((s) => new Date(s.fecha).getFullYear()))
    set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [salidas])

const { matriz, totalPorMes, totalPorCat, totalGeneral } = useMemo(() => {
    const rate = Number(tcRef) || 1

    function _valorEn(s) {
      if (moneda === 'USD') {
        if (s.moneda === 'USD') return Number(s.monto)
        return Number(s.monto) / (Number(s.tipo_cambio) || rate)
      }
      return s.moneda === 'ARS' ? Number(s.monto) : 0
    }

    const matriz = {}
    const totalPorMes = Array(12).fill(0)
    const totalPorCat = {}
    let totalGeneral = 0
    for (const s of salidas) {
      const anioFecha = Number(String(s.fecha).slice(0, 4))
      if (anioFecha !== Number(anio)) continue
      const val = _valorEn(s)
      if (!val) continue
      const cat = s.categoria_id || 'sin'
      const mes = Number(String(s.fecha).slice(5, 7)) - 1
      if (!matriz[cat]) matriz[cat] = Array(12).fill(0)
      matriz[cat][mes] += val
      totalPorMes[mes] += val
      totalPorCat[cat] = (totalPorCat[cat] || 0) + val
      totalGeneral += val
    }
    return { matriz, totalPorMes, totalPorCat, totalGeneral }
  }, [salidas, anio, moneda, tcRef])

  const filas = useMemo(() => {
    const base = categorias.map((c) => ({ id: c.id, nombre: c.nombre }))
    if (matriz['sin']) base.push({ id: 'sin', nombre: '(sin categoría)' })
    return base.filter((f) => matriz[f.id])
  }, [categorias, matriz])

  return (
    <div style={{ display: 'grid', gap: 18 }} className="fadeup">
      <h1 style={{ fontSize: 22, margin: 0 }}>Distribución de gastos</h1>

      <Card>
        <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Expresar en" style={{ minWidth: 140 }}>
            <select className="inp" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="USD">Dólares (USD)</option>
              <option value="ARS">Pesos (ARS)</option>
            </select>
          </Field>
          <Field label="Año" style={{ minWidth: 120 }}>
            <select className="inp" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          {moneda === 'USD' && (
            <Field label="T. cambio de referencia" style={{ minWidth: 170 }}>
              <input
                className="inp"
                type="number"
                value={tcRef}
                onChange={(e) => setTcRef(e.target.value)}
                title="Se usa para los gastos en pesos que no tengan su propio tipo de cambio cargado"
              />
            </Field>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <Kpi
              label={`Total gastado ${anio}`}
              color="red"
              icon="🧾"
              value={fmtMonto(totalGeneral, moneda)}
            />
          </div>
        </div>
        {moneda === 'USD' && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--faint)' }}>
            Los gastos con su propio tipo de cambio del día usan ese valor; el resto se convierte
            con el de referencia (<Badge soft="var(--accent-soft)" color="var(--accent-2)">${tcRef}</Badge> por USD).
          </div>
        )}
      </Card>

      <Card style={{ padding: 0, overflow: 'auto' }}>
        {cargando ? (
          <Spinner />
        ) : filas.length === 0 ? (
          <Vacio texto="No hay gastos cargados para este año." icon="📊" />
        ) : (
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2 }}>Categoría</th>
                {MESES.map((m) => (
                  <th key={m} className="num">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--panel)', fontWeight: 600, zIndex: 1 }}>
                    {f.nombre}
                  </td>
                  {matriz[f.id].map((v, i) => (
                    <td key={i} className="num" style={{ color: v ? 'var(--text)' : 'var(--border)' }}>
                      {v ? fmtMonto(v, moneda) : '·'}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 700, color: 'var(--accent-2)' }}>
                    {fmtMonto(totalPorCat[f.id], moneda)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--panel-soft)' }}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--panel-soft)', fontWeight: 700, zIndex: 1 }}>
                  TOTAL
                </td>
                {totalPorMes.map((v, i) => (
                  <td key={i} className="num" style={{ fontWeight: 700 }}>
                    {v ? fmtMonto(v, moneda) : '·'}
                  </td>
                ))}
                <td className="num" style={{ fontWeight: 800, color: 'var(--red)' }}>
                  {fmtMonto(totalGeneral, moneda)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
