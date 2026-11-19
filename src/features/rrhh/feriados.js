// DNU 1103/2026, arts. 2 y 4. Las sedes del astillero están en Provincia de Buenos Aires.
const FERIADOS_VISITA_2026 = [
  { fecha: "2026-11-09", nombre: "Visita de Su Santidad el Papa León XIV", tipo: "feriado" },
  { fecha: "2026-11-11", nombre: "Visita de Su Santidad el Papa León XIV (Provincia de Buenos Aires)", tipo: "feriado" },
];

// Respaldo según el calendario nacional y la Resolución 164/2025.
const RESPALDO_2026 = {
  "01-01": "Año Nuevo",
  "02-16": "Carnaval",
  "02-17": "Carnaval",
  "03-23": ["Día no laborable con fines turísticos"],
  "03-24": "Día Nacional de la Memoria por la Verdad y la Justicia",
  "04-02": "Día del Veterano y de los Caídos en la Guerra de Malvinas",
  "04-03": "Viernes Santo",
  "05-01": "Día del Trabajador",
  "05-25": "Día de la Revolución de Mayo",
  "06-15": "Paso a la Inmortalidad del General Martín Miguel de Güemes",
  "06-20": "Paso a la Inmortalidad del General Manuel Belgrano",
  "07-09": "Día de la Independencia",
  "07-10": ["Día no laborable con fines turísticos"],
  "08-17": "Paso a la Inmortalidad del General José de San Martín",
  "10-12": "Día del Respeto a la Diversidad Cultural",
  "11-23": "Día de la Soberanía Nacional",
  "12-07": ["Día no laborable con fines turísticos"],
  "12-08": "Inmaculada Concepción de María",
  "12-25": "Navidad",
};

const RESPALDO = [...Object.entries(RESPALDO_2026).map(([dia, dato]) => ({
  fecha: `2026-${dia}`,
  nombre: Array.isArray(dato) ? dato[0] : dato,
  tipo: Array.isArray(dato) ? "no_laborable" : "feriado",
})), ...FERIADOS_VISITA_2026];

export const PREFIJO_CIERRE = "cierre_no_laborable:";

export function normalizarFeriados(anio, datos) {
  if (!Array.isArray(datos) || !datos.length) throw new Error("Calendario anual sin datos.");
  const dias = new Map();
  for (const dia of datos) {
    const { fecha, nombre, tipo } = dia ?? {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !fecha.startsWith(`${anio}-`) || !nombre) continue;
    if (tipo === "inamovible" || tipo === "trasladable") {
      dias.set(fecha, { fecha, nombre, tipo: "feriado" });
    } else if (tipo === "puente" || tipo === "nolaborable") {
      // Los puentes turísticos hasta 2024 eran feriados; desde 2025 la fuente
      // los identifica también con «no laborable» en el nombre.
      const esFeriado = tipo === "puente" && (anio <= 2024 || (/feriado/i.test(nombre) && !/no laborable/i.test(nombre)));
      if (dias.get(fecha)?.tipo !== "feriado") dias.set(fecha, { fecha, nombre, tipo: esFeriado ? "feriado" : "no_laborable" });
    }
  }
  // La API todavía lista el feriado del 12/10/2025 en su fecha original.
  if (anio === 2025) {
    dias.delete("2025-10-12");
    dias.set("2025-10-10", { fecha: "2025-10-10", nombre: "Día del Respeto a la Diversidad Cultural", tipo: "feriado" });
    dias.set("2025-04-17", { fecha: "2025-04-17", nombre: "Jueves Santo", tipo: "no_laborable" });
  }
  if (anio === 2026) {
    for (const feriado of FERIADOS_VISITA_2026) dias.set(feriado.fecha, feriado);
  }
  if (!dias.has(`${anio}-01-01`)) throw new Error("Calendario anual incompleto.");
  return [...dias.values()];
}

const solicitudes = new Map();

export function cargarFeriadosAnio(anio) {
  if (!solicitudes.has(anio)) {
    const solicitud = fetch(`https://api.argentinadatos.com/v1/feriados/${anio}`, { signal: AbortSignal.timeout(6000) })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error(`Calendario no disponible para ${anio}.`);
        return respuesta.json();
      })
      .then((datos) => normalizarFeriados(anio, datos))
      .catch((error) => {
        solicitudes.delete(anio);
        if (anio === 2026) return RESPALDO;
        throw error;
      });
    solicitudes.set(anio, solicitud);
  }
  return solicitudes.get(anio);
}

export function esCierre(dia, cierres) {
  return dia?.tipo === "feriado" || (dia?.tipo === "no_laborable" && cierres?.has(dia.fecha) === true);
}

export function estadoDiaEspecial(dia, ficho = false, incompleta = false) {
  const estado = dia.tipo === "feriado"
    ? (ficho ? "Feriado trabajado" : "Feriado")
    : (ficho ? "Día no laborable trabajado" : "Día no laborable");
  return incompleta ? `${estado} · fichada incompleta` : estado;
}
