import { supabase } from "@/supabaseClient";

const redondear = (value) => Math.round(Number(value || 0) * 10000) / 10000;

const REFERENCIA_MADERAS_POR_LINEA = Object.freeze({
  K55: "55-1",
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
      .select("id,material_id,delta,obra,produccion_obra_id")
      .lt("delta", 0)
      .in("produccion_obra_id", obraIds));
  }
  if (codigos.length) {
    consultas.push(supabase
      .from("movimientos")
      .select("id,material_id,delta,obra,produccion_obra_id")
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
  const referenciaMaderasCodigo = REFERENCIA_MADERAS_POR_LINEA[codigoLinea] || "";
  const referenciaMaderasObra = referenciaMaderasCodigo
    ? obraPorCodigo.get(normalizarCodigoObra(referenciaMaderasCodigo)) || null
    : null;

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
    traerMovimientosMadera(obras),
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
  for (const movimiento of movimientosMadera || []) {
    const obra = obraPorId.get(movimiento.produccion_obra_id)
      || obraPorCodigo.get(normalizarCodigoObra(movimiento.obra));
    if (!obra) continue;
    const clave = `${movimiento.material_id}|${obra.id}`;
    consumoMadera.set(clave, redondear((consumoMadera.get(clave) || 0) + Math.abs(Number(movimiento.delta || 0))));
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
      ? redondear(consumoMadera.get(`${material.id}|${referenciaMaderasObra.id}`) || 0)
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
