// "Taller" solo es ambiguo en una app donde también existe el taller interno
// de Mecánica. Este helper deja explícito el destino externo y normaliza los
// valores genéricos que ya están guardados en procesos anteriores.
export function operationDestinationLabel(operation = {}) {
  const destination = String(operation.destino || "").trim();
  const normalized = destination
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (operation.tipo === "torneria") {
    if (!destination || ["torneria", "taller", "taller de torneria"].includes(normalized)) {
      return "Taller de Tornería";
    }
    return destination;
  }
  if (operation.tipo === "plegadora") {
    if (!destination || ["plegadora", "taller", "taller de plegadora"].includes(normalized)) {
      return "Plegadora";
    }
    return destination;
  }
  return destination || "Destino externo";
}
