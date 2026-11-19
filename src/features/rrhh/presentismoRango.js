export const claveJornada = (empleadoId, fecha) => `${empleadoId}::${fecha}`;

export function filasAusentesDelRango({ dias, empleados, marcaciones, justificaciones }) {
  const empleadosQueFichan = empleados.filter((emp) => emp.activo !== false && emp.ficha !== false);
  const presentes = new Set(marcaciones.map((fila) => claveJornada(fila.emp.id, fila.fecha)));
  const ausencias = [];

  for (const fecha of dias) {
    for (const emp of empleadosQueFichan) {
      const clave = claveJornada(emp.id, fecha);
      if (presentes.has(clave)) continue;
      ausencias.push({
        key: `ausencia:${clave}`,
        fecha,
        emp,
        sede: emp.sede,
        marcacion: null,
        ausencia: true,
        justificacion: justificaciones.get(clave) ?? null,
      });
    }
  }

  return ausencias;
}
