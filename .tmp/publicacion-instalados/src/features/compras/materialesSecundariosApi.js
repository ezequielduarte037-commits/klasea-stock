import { supabase } from "@/supabaseClient";

const redondear = (value) => Math.round(Number(value || 0) * 10000) / 10000;

/**
 * Casco cuyo consumo real de Maderas se toma como estándar de la línea.
 *
 * `hasta` congela ese consumo en una fecha: lo que el casco saque después no
 * cambia el estándar. `sinContar` deja afuera la madera de obra, que va en la
 * matriz de la línea porque se compra por barco; si no, se contaría dos veces.
 */
const REFERENCIA_MADERAS_POR_LINEA = Object.freeze({
  K52: {
    obra: "52-23",
    hasta: "2026-09-24",
    sinContar: [
      "16b3a341-11dd-44dc-b76e-8072cf8949af", // HoneyComb
      "54a2dc77-e2ab-4981-837a-bdbf5d53b28d", // Tablón Okumé
      "feb2447c-6a2c-420b-96ce-e639fed0b882", // PVC 20mm
      "b347aaeb-1e69-493b-91d2-eb56dc5a99a7", // Tablón de teca
    ],
  },
  K55: {
    obra: "55-1",
    sinContar: [
      "16b3a341-11dd-44dc-b76e-8072cf8949af", // HoneyComb: la matriz del K55 lleva 22 placas
      "54a2dc77-e2ab-4981-837a-bdbf5d53b28d", // Tablón Okumé: la matriz del K55 lleva 300 pies
    ],
  },
});

export function normalizarCodigoObra(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^K/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function lineaCodigo(value) {
  const normal = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normal.startsWith("K") ? normal : `K${normal}`;
}

function errorDeMigracion(error) {
  const texto = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error?.code || ""))
    || /does not exist|schema cache|column .* does not exist/i.test(texto);
}

async function traerPreciosSecundarios() {
  const { data, error } = await supabase
    .from("materiales_secundarios_precios")
    .select("catalogo,material_id,proveedor,precio_base,moneda,unidad_precio,factor_unidad_matriz,precio_unidad_matriz,incluye_iva,fecha,fuente,notas")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (errorDeMigracion(error)) return new Map();
    throw error;
  }
  const precios = new Map();
  for (const row of data || []) {
    const clave = `${row.catalogo}|${row.material_id}`;
    if (!precios.has(clave)) precios.set(clave, row);
  }
  return precios;
}

async function traerMovimientosLaminacion(codigos) {
  if (!codigos.length) return [];
  const consultas = ["destino", "obra"].map((campo) => supabase
    .from("laminacion_movimientos")
    .select("id,material_id,cantidad,destino,obra")
    .eq("tipo", "egreso")
    .in(campo, codigos));
  const resultados = await Promise.all(consultas);
  const filas = new Map();
  for (const resultado of resultados) {
    if (resultado.error) throw resultado.error;
    for (const row of resultado.data || []) filas.set(row.id, row);
  }
  return [...filas.values()];
}

async function traerMovimientosMadera(obras) {
  const codigos = obras.map((obra) => String(obra.codigo || "").trim()).filter(Boolean);
  const obraIds = obras.map((obra) => obra.id).filter(Boolean);
  const consultas = [];
  if (obraIds.length) {
    consultas.push(supabase
      .from("movimientos")
      .select("id,material_id,delta,obra,produccion_obra_id,created_at")
      .lt("delta", 0)
      .in("produccion_obra_id", obraIds));
  }
  if (codigos.length) {
    consultas.push(supabase
      .from("movimientos")
      .select("id,material_id,delta,obra,produccion_obra_id,created_at")
      .lt("delta", 0)
      .in("obra", codigos));
  }
  const resultados = await Promise.all(consultas);
  const filas = new Map();
  for (const resultado of resultados) {
    if (resultado.error) throw resultado.error;
    for (const row of resultado.data || []) filas.set(row.id, row);
  }
  return [...filas.values()];
}

/**
 * El casco de referencia puede estar terminado y no venir entre las obras
 * activas de la línea: se busca aparte para que la línea no pierda su estándar.
 */
async function traerObraPorCodigo(codigo) {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo")
    .eq("codigo", codigo)
    .limit(1);
  if (error) return null;
  return data?.[0] || null;
}

function costoVacio() {
  return { planificadoArs: 0, planificadoUsd: 0, consumidoArs: 0, consumidoUsd: 0, conPrecio: 0, sinPrecio: 0 };
}

function sumarCosto(total, { precio, planificado, consumido }) {
  if (!precio?.precio_unidad_matriz) {
    total.sinPrecio += 1;
    return;
  }
  total.conPrecio += 1;
  const moneda = precio.moneda === "USD" ? "Usd" : "Ars";
  total[`planificado${moneda}`] += Number(planificado || 0) * Number(precio.precio_unidad_matriz || 0);
  total[`consumido${moneda}`] += Number(consumido || 0) * Number(precio.precio_unidad_matriz || 0);
}

function finalizarCosto(total) {
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, typeof value === "number" ? redondear(value) : value]));
}

export async function fetchMaterialesSecundariosPlanilla({ linea, obras }) {
  const codigoLinea = lineaCodigo(linea);
  if (!["K52", "K55"].includes(codigoLinea) || !obras?.length) {
    return { filas: [], resumen: { laminacion: 0, maderas: 0, costos: costoVacio() } };
  }

  const codigos = obras.map((obra) => String(obra.codigo || "").trim()).filter(Boolean);
  const obraPorCodigo = new Map(obras.map((obra) => [normalizarCodigoObra(obra.codigo), obra]));
  const obraPorId = new Map(obras.map((obra) => [obra.id, obra]));
  const referencia = REFERENCIA_MADERAS_POR_LINEA[codigoLinea] || null;
  const referenciaMaderasCodigo = referencia?.obra || "";
  const referenciaSinContar = new Set(referencia?.sinContar || []);
  let referenciaMaderasObra = referenciaMaderasCodigo
    ? obraPorCodigo.get(normalizarCodigoObra(referenciaMaderasCodigo)) || null
    : null;
  if (referenciaMaderasCodigo && !referenciaMaderasObra) {
    referenciaMaderasObra = await traerObraPorCodigo(referenciaMaderasCodigo);
    if (referenciaMaderasObra) {
      obraPorCodigo.set(normalizarCodigoObra(referenciaMaderasObra.codigo), referenciaMaderasObra);
      obraPorId.set(referenciaMaderasObra.id, referenciaMaderasObra);
    }
  }
  const obrasConReferencia = referenciaMaderasObra && !obras.some((obra) => obra.id === referenciaMaderasObra.id)
    ? [...obras, referenciaMaderasObra]
    : obras;

  const [{ data: plantillas, error: plantillaError }, precios] = await Promise.all([
    supabase.from("linea_plantillas").select("id,linea,nombre").eq("linea", codigoLinea).eq("activa", true).order("created_at", { ascending: false }).limit(1),
    traerPreciosSecundarios(),
  ]);
  if (plantillaError) throw plantillaError;
  const plantilla = plantillas?.[0] || null;

  const [itemsRes, movimientosLam, movimientosMadera] = await Promise.all([
    plantilla
      ? supabase.from("linea_plantilla_items").select("material_id,cantidad,orden").eq("plantilla_id", plantilla.id).order("orden")
      : Promise.resolve({ data: [], error: null }),
    traerMovimientosLaminacion(codigos),
    traerMovimientosMadera(obrasConReferencia),
  ]);
  if (itemsRes.error) throw itemsRes.error;

  const lamIds = [...new Set((itemsRes.data || []).map((row) => row.material_id).filter(Boolean))];
  const maderaIds = [...new Set((movimientosMadera || []).map((row) => row.material_id).filter(Boolean))];
  const [lamMaterialesRes, maderasRes] = await Promise.all([
    lamIds.length
      ? supabase.from("laminacion_materiales").select("id,nombre,categoria,unidad").in("id", lamIds)
      : Promise.resolve({ data: [], error: null }),
    maderaIds.length
      ? supabase.from("materiales").select("id,nombre,unidad_medida").in("id", maderaIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lamMaterialesRes.error) throw lamMaterialesRes.error;
  if (maderasRes.error) throw maderasRes.error;

  const lamPorId = new Map((lamMaterialesRes.data || []).map((row) => [row.id, row]));
  const maderaPorId = new Map((maderasRes.data || []).map((row) => [row.id, row]));
  const consumidoLam = new Map();
  for (const movimiento of movimientosLam) {
    const obra = obraPorCodigo.get(normalizarCodigoObra(movimiento.destino || movimiento.obra));
    if (!obra) continue;
    const clave = `${movimiento.material_id}|${obra.id}`;
    consumidoLam.set(clave, redondear((consumidoLam.get(clave) || 0) + Number(movimiento.cantidad || 0)));
  }

  const costos = costoVacio();
  const filasLam = (itemsRes.data || []).map((item) => {
    const material = lamPorId.get(item.material_id);
    if (!material) return null;
    const requerido = redondear(item.cantidad);
    const precio = precios.get(`laminacion|${material.id}`) || null;
    const porObra = {};
    let consumidoTotal = 0;
    for (const obra of obras) {
      const consumido = consumidoLam.get(`${material.id}|${obra.id}`) || 0;
      consumidoTotal += consumido;
      porObra[obra.id] = {
        secundario: true,
        circuito: "laminacion",
        requerido,
        consumido,
        restanteUso: redondear(Math.max(0, requerido - consumido)),
        excedente: redondear(Math.max(0, consumido - requerido)),
        egresado: consumido,
        enPanol: 0,
        pendiente: 0,
        origenes: ["secundario", "laminacion"],
      };
    }
    sumarCosto(costos, { precio, planificado: requerido * obras.length, consumido: consumidoTotal });
    return {
      id: `sec:laminacion:${material.id}`,
      materialSecundarioId: material.id,
      descripcion: material.nombre,
      codigo: "",
      proveedor: precio?.proveedor || "",
      rubro: `Laminación · ${material.categoria || "Sin categoría"}`,
      unidad: material.unidad || "unidad",
      enPanolLibre: 0,
      reservado: 0,
      faltaComprar: 0,
      secundario: true,
      circuito: "laminacion",
      soloCosto: true,
      origenes: ["secundario", "laminacion"],
      origenPrincipal: "secundario",
      precioInfo: precio,
      porObra,
      totales: { requerido: redondear(requerido * obras.length), egresado: redondear(consumidoTotal), enPanol: 0, pendiente: 0 },
    };
  }).filter(Boolean);

  const consumoMadera = new Map();
  const consumoReferencia = new Map();
  for (const movimiento of movimientosMadera || []) {
    const obra = obraPorId.get(movimiento.produccion_obra_id)
      || obraPorCodigo.get(normalizarCodigoObra(movimiento.obra));
    if (!obra) continue;
    const cantidad = Math.abs(Number(movimiento.delta || 0));
    const clave = `${movimiento.material_id}|${obra.id}`;
    consumoMadera.set(clave, redondear((consumoMadera.get(clave) || 0) + cantidad));
    if (obra.id !== referenciaMaderasObra?.id) continue;
    if (referencia?.hasta && String(movimiento.created_at || "").slice(0, 10) > referencia.hasta) continue;
    consumoReferencia.set(movimiento.material_id, redondear((consumoReferencia.get(movimiento.material_id) || 0) + cantidad));
  }

  const filasMadera = maderaIds.map((materialId) => {
    const material = maderaPorId.get(materialId);
    if (!material) return null;
    const precio = precios.get(`maderas|${material.id}`) || null;
    const porObra = {};
    let consumidoTotal = 0;
    for (const obra of obras) {
      const consumido = consumoMadera.get(`${material.id}|${obra.id}`) || 0;
      if (!(consumido > 0)) continue;
      consumidoTotal += consumido;
      porObra[obra.id] = {
        secundario: true,
        circuito: "maderas",
        soloConsumo: true,
        requerido: 0,
        consumido,
        restanteUso: 0,
        excedente: 0,
        egresado: consumido,
        enPanol: 0,
        pendiente: 0,
        origenes: ["secundario", "maderas"],
      };
    }
    const cantidadReferencia = referenciaMaderasObra
      ? (referenciaSinContar.has(material.id) ? 0 : consumoReferencia.get(material.id) || 0)
      : null;
    sumarCosto(costos, { precio, planificado: 0, consumido: consumidoTotal });
    return {
      id: `sec:maderas:${material.id}`,
      materialSecundarioId: material.id,
      descripcion: material.nombre,
      codigo: "",
      proveedor: precio?.proveedor || "",
      rubro: "Maderas · consumo real",
      unidad: material.unidad_medida || "unidad",
      enPanolLibre: 0,
      reservado: 0,
      faltaComprar: 0,
      secundario: true,
      circuito: "maderas",
      soloCosto: true,
      referenciaMaderasCodigo: referenciaMaderasObra?.codigo || referenciaMaderasCodigo || "",
      referenciaMaderasObraId: referenciaMaderasObra?.id || null,
      cantidadReferencia,
      origenes: ["secundario", "maderas"],
      origenPrincipal: "secundario",
      precioInfo: precio,
      porObra,
      totales: { requerido: 0, egresado: redondear(consumidoTotal), enPanol: 0, pendiente: 0 },
    };
  }).filter(Boolean);

  return {
    filas: [...filasLam, ...filasMadera],
    resumen: {
      laminacion: filasLam.length,
      maderas: filasMadera.length,
      costos: finalizarCosto(costos),
    },
  };
}
