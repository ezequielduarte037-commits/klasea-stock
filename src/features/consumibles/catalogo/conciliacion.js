import sugerenciasCsv from "./sugerenciasRebollar.json";
import { candidatos, indiceDeRareza, prepararConsumible, prepararRenglon } from "./emparejar.js";

export const NOTA_FUERA_REBOLLAR = "Fuera de la lista de Rebollar (10/10/2026)";

export function esPendienteRebollar(item) {
  const notas = item.config?.notas ?? "";
  // La fusión conserva la nota de baja y agrega su resolución al final.
  return item.activo === false && notas.includes(NOTA_FUERA_REBOLLAR) && !notas.includes('Fusionado en "');
}

export function prepararDestinos(catalogo, lista) {
  const activos = new Map(catalogo.filter((i) => i.activo !== false).map((i) => [i.id, i]));
  return (lista?.items ?? [])
    .filter((r) => activos.has(r.material_id))
    .map((r) => prepararRenglon({ ...r, material: activos.get(r.material_id) }));
}

export function pendientesConCandidatos(catalogo, destinos, retiros = {}) {
  const porCodigo = new Map(destinos.map((r) => [r.codigo, r]));
  const rareza = indiceDeRareza(destinos);
  return catalogo.filter(esPendienteRebollar).map((item) => {
    // El CSV conserva el cruce revisado antes de las altas. Si cambió la lista,
    // completamos las sugerencias con el mismo emparejador, sobre todos sus productos.
    const delCsv = (sugerenciasCsv[item.id] ?? [])
      .filter((s) => porCodigo.has(s.codigo))
      .map((s) => ({ renglon: porCodigo.get(s.codigo), puntaje: s.puntaje / 100 }));
    const calculados = candidatos(prepararConsumible(item), destinos, { max: 3, minimo: 0.3, rareza });
    const vistos = new Set();
    const sug = [...delCsv, ...calculados].filter((s) => {
      const id = s.renglon.material_id;
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    }).slice(0, 3);
    return { item, sug, retiros: retiros[item.id] ?? 0 };
  }).sort((a, b) => b.retiros - a.retiros || a.item.descripcion.localeCompare(b.item.descripcion, "es", { numeric: true }));
}
