const numero = (v) => {
  const texto = String(v ?? "").trim().replace(",", ".");
  return texto ? Number(texto) : NaN;
};

/** Gramos netos de una pieza o de una muestra contada en una balanza externa. */
export function referenciaPeso({ modo = "pieza", gramos, piezas } = {}) {
  const g = numero(gramos);
  if (!Number.isFinite(g) || g <= 0) throw new Error("Ingresá un peso mayor que cero en gramos.");
  if (modo === "pieza") return { pesoUnitarioG: g, gramosMuestra: g, piezas: null };
  const n = numero(piezas);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Ingresá la cantidad entera de piezas de la muestra.");
  const pesoUnitarioG = g / n;
  if (!(pesoUnitarioG > 0)) throw new Error("Revisá el peso de la muestra.");
  return { pesoUnitarioG, gramosMuestra: g, piezas: n };
}
