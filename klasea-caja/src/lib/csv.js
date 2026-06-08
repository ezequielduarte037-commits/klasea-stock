export function exportCSV(filas, nombre = 'export') {
  if (!filas.length) return
  const cols = Object.keys(filas[0])
  const header = cols.join(',')
  const rows = filas.map(f =>
    cols.map(c => {
      const v = f[c] == null ? '' : String(f[c])
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v
    }).join(',')
  )
  const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${nombre}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
