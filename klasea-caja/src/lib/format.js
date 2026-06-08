// Helpers de formato y cálculo compartidos

export const MONEDAS = {
  ARS: { label: 'Pesos', simbolo: '$', locale: 'es-AR', codigo: 'ARS' },
  USD: { label: 'Dólares', simbolo: 'US$', locale: 'en-US', codigo: 'USD' },
}

export function fmtMonto(valor, moneda = 'ARS') {
  const n = Number(valor || 0)
  const cfg = MONEDAS[moneda] || MONEDAS.ARS
  return (
    cfg.simbolo +
    ' ' +
    n.toLocaleString(cfg.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function fmtFecha(valor) {
  if (!valor) return ''
  // Parsear manualmente para evitar el offset UTC en fechas ISO sin hora
  // (new Date('2026-05-01') = UTC midnight = 30/04 en Argentina UTC-3)
  const str = String(valor).slice(0, 10)
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return str
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`
}

export function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function claveMes(fecha) {
  // 'YYYY-MM'
  return String(fecha).slice(0, 7)
}

export function etiquetaMes(clave) {
  const [a, m] = String(clave).split('-')
  return `${MESES[Number(m) - 1] || ''} ${a}`
}
