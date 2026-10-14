import { num } from "@/features/laminacion/obras";

// Borrador del pedido de maderas. Vive en el contenedor para que no se pierda
// al cambiar de pestaña.
//
//   { grupos: [{ uid, tipo: "stock" | "obra", obra, recibirEn, items: [...] }], para, urgente }
//   item = { uid, material_id | null, descripcion, cantidad, unidad }

export function nuevoUid() {
  return Math.random().toString(36).slice(2, 10);
}

export function borradorVacio() {
  return { grupos: [{ uid: "stock", tipo: "stock", obra: "", recibirEn: "", items: [] }], para: "", urgente: false };
}

// Suma (o reemplaza la cantidad de) un material en el grupo del stock.
export function conMaterialEnStock(borrador, mat, cantidad) {
  const grupos = borrador.grupos.some((g) => g.tipo === "stock")
    ? borrador.grupos
    : [borradorVacio().grupos[0], ...borrador.grupos];
  return {
    ...borrador,
    grupos: grupos.map((g) => {
      if (g.tipo !== "stock") return g;
      const ya = g.items.find((it) => String(it.material_id) === String(mat.id));
      if (ya) return { ...g, items: g.items.map((it) => (it === ya ? { ...it, cantidad: String(cantidad) } : it)) };
      return { ...g, items: [...g.items, { uid: nuevoUid(), material_id: mat.id, descripcion: mat.nombre, cantidad: String(cantidad), unidad: mat.unidad_medida || "u" }] };
    }),
  };
}

// Lo que se manda: renglones limpios y, si algo no cierra, por qué.
export function paraEnviar(borrador) {
  const problemas = [];
  const grupos = [];
  for (const g of borrador.grupos) {
    const items = [];
    for (const it of g.items) {
      const descripcion = String(it.descripcion || "").trim();
      const cantidad = num(it.cantidad);
      if (!it.material_id && !descripcion && !String(it.cantidad).trim()) continue; // renglón en blanco
      if (!it.material_id && !descripcion) problemas.push("Hay un renglón sin decir qué material es.");
      if (cantidad <= 0) problemas.push(`Falta la cantidad de ${descripcion || "un material"}.`);
      else if (!Number.isInteger(cantidad)) problemas.push(`${descripcion || "Un material"}: la cantidad va en números enteros.`);
      items.push({ ...it, descripcion, cantidad, unidad: String(it.unidad || "").trim() || "u" });
    }
    if (items.length) grupos.push({ ...g, recibirEn: String(g.recibirEn || "").trim(), items });
  }
  // Las obras primero y el stock al final, como en el mail.
  grupos.sort((a, b) => (a.tipo === "stock" ? 1 : 0) - (b.tipo === "stock" ? 1 : 0));
  return { grupos, total: grupos.reduce((s, g) => s + g.items.length, 0), problemas };
}
