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
  if (f.stockMinimo !== inicial.stockMinimo) {
    const n = numero(f.stockMinimo);
    if (n !== numero(inicial.stockMinimo)) cambios.stockMinimo = n;
  }
  if (texto(f.ubicacion).toUpperCase() !== texto(inicial.ubicacion).toUpperCase()) cambios.ubicacion = texto(f.ubicacion).toUpperCase() || null;
  if (texto(f.alias) !== texto(inicial.alias)) cambios.alias = texto(f.alias) || null;
  if (Object.keys(config).length) cambios.config = config;
  return cambios;
}
