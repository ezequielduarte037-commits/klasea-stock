// Qué requisitos de la matriz piden elegir el producto barco por barco.
//
// Desde el 25/11/2026 son pocos y van marcados con `producto_por_obra`: caja de
// piso, motor, grupo electrógeno, color de la bacha y lo cromado o negro
// (grifería y accesorios Epuyén, picaportes Sardegna). El resto no frena:
// si tiene una sola opción la matriz ya trae el producto, y si tiene marcas
// equivalentes (Rule o Seaflo, LG o Samsung) la elige Compras al comprar.

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function productoSeDefinePorObra(material) {
  if (material?.producto_por_obra === true) return true;
  // Respaldo para que Caja de piso siga pendiente por barco aunque la ficha
  // venga sin la columna (lecturas viejas o un select que no la trae).
  return material?.es_requisito === true && normalizar(material?.descripcion) === "caja de piso";
}
