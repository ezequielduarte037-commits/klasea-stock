const aTexto = (v) => (v == null ? "" : String(v).replace(".", ","));
const texto = (v) => String(v ?? "").trim();
const numero = (v) => {
  const s = texto(v).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error("Revisá los números: tienen que ser de cero para arriba.");
  return n;
};

export function estadoInicial(item) {
  const c = item.config ?? {};
  return {
    forma_entrega: c.forma_entrega ?? item.formaEntrega ?? "unidad",
    unidad_entrega: c.unidad_entrega ?? item.unidad ?? "unidad",
    unidad_compra: c.unidad_compra ?? "",
    factor_compra: aTexto(c.factor_compra),
    lote_compra: aTexto(c.lote_compra),
    stock_maximo: aTexto(c.stock_maximo),
    cupo_diario: aTexto(c.cupo_diario),
    favorito_orden: aTexto(c.favorito_orden),
    activo_mostrador: c.activo_mostrador !== false,
    notas: c.notas ?? "",
    stockMinimo: aTexto(item.stockMinimo),
    ubicacion: item.ubicacion ?? "",
    alias: item.alias ?? "",
    info: item.info ?? "",
  };
}

/** La referencia es la ficha al abrirla: una recarga no vuelve propios los cambios ajenos. */
export function cambiosDeFicha(f, inicial) {
  const config = {};
  const cambios = {};
  for (const k of ["forma_entrega", "unidad_entrega", "unidad_compra", "notas"]) {
    if (texto(f[k]) !== texto(inicial[k])) config[k] = texto(f[k]) || null;
  }
  if (config.unidad_entrega === null) config.unidad_entrega = "unidad";
  if (f.activo_mostrador !== inicial.activo_mostrador) config.activo_mostrador = f.activo_mostrador;
  for (const k of ["factor_compra", "lote_compra", "stock_maximo", "cupo_diario", "favorito_orden"]) {
    if (f[k] === inicial[k]) continue;
    const n = numero(f[k]);
    if (n === numero(inicial[k])) continue;
    if (n === 0 && ["factor_compra", "lote_compra", "cupo_diario"].includes(k)) {
      throw new Error("El factor, el lote y el cupo tienen que ser mayores que cero (o vacíos).");
    }
    config[k] = k === "favorito_orden" && n != null ? Math.round(n) : n;
  }
  // Al cambiar la unidad o pasar a fraccionado: si se entrega en otra unidad
  // que la de compra, sin factor cada metro (o hoja, o kilo) valdría el envase
  // entero. Pasó con el cartón en rollo el 13/10.
  if ("unidad_entrega" in config || config.forma_entrega === "fraccionado") {
    const sinPlural = (v) => texto(v).toLowerCase().replace(/(es|s)$/, "");
    const entrega = texto(f.unidad_entrega) || "unidad";
    const compra = texto(f.unidad_compra) || "unidad";
    const factor = numero(f.factor_compra) ?? 1;
    if (sinPlural(entrega) !== sinPlural(compra) && factor <= 1) {
      throw new Error(`Se entrega por ${entrega} y se compra por ${compra}: cargá el factor (cuántos ${entrega} trae cada ${compra}). Si se entrega entero, poné la misma unidad en los dos.`);
    }
  }
  if (f.stockMinimo !== inicial.stockMinimo) {
    const n = numero(f.stockMinimo);
    if (n !== numero(inicial.stockMinimo)) cambios.stockMinimo = n;
  }
  if (texto(f.ubicacion).toUpperCase() !== texto(inicial.ubicacion).toUpperCase()) cambios.ubicacion = texto(f.ubicacion).toUpperCase() || null;
  if (texto(f.alias) !== texto(inicial.alias)) cambios.alias = texto(f.alias) || null;
  if (texto(f.info) !== texto(inicial.info)) cambios.info = texto(f.info) || null;
  if (Object.keys(config).length) cambios.config = config;
  return cambios;
}
