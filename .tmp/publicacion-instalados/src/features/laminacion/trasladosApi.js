import { supabase } from "@/supabaseClient";

/**
 * Traslados de material entre los galpones de laminación.
 *
 * Es el único lugar donde Pampa y Chubut se tocan. Todo lo demás en laminación
 * es de un galpón y de ninguno más.
 *
 * La regla que ordena todo: el stock de cada galpón sale de sumar SUS
 * movimientos. Un traslado no es un tipo nuevo de movimiento ni una excepción
 * en el cálculo; son dos movimientos comunes -un egreso allá, un ingreso acá-
 * atados por una fila en laminacion_traslados. Así ninguna pantalla necesita
 * saber que los traslados existen para que el stock le dé bien.
 *
 * Entre uno y otro el material está en tránsito y no cuenta para nadie, que es
 * la verdad: está arriba de un camión.
 *
 * PostgREST no da transacciones, así que cada operación que escribe dos filas
 * revierte a mano la primera si la segunda falla. Sin eso, un error de red en
 * el momento justo deja un egreso sin traslado y el material desaparece del
 * sistema sin dejar rastro.
 */

export const SEDES = ["Pampa", "Chubut"];
export const OTRA_SEDE = { Pampa: "Chubut", Chubut: "Pampa" };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function idUsuario() {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return data?.session?.user?.id ?? null;
}

/** Lo que le entra y lo que le sale a este galpón, con el material resuelto. */
export async function cargarTraslados(sede) {
  const { data, error } = await supabase
    .from("laminacion_traslados")
    .select("*, laminacion_materiales(nombre, unidad)")
    .or(`sede_origen.eq.${sede},sede_destino.eq.${sede}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const filas = data ?? [];
  return {
    entrando: filas.filter((t) => t.estado === "en_transito" && t.sede_destino === sede),
    saliendo: filas.filter((t) => t.estado === "en_transito" && t.sede_origen === sede),
    historial: filas.filter((t) => t.estado !== "en_transito"),
  };
}

/**
 * El stock del OTRO galpón, para poder contestar "me quedé en cero, ¿allá hay?".
 *
 * Se calcula igual que el propio -sumando movimientos- y no se cachea: un
 * número viejo acá hace que alguien pida algo que ya no está.
 */
export async function stockDeSede(sede) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("laminacion_movimientos")
      .select("material_id,tipo,cantidad")
      .eq("sede", sede)
      .range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  const stock = new Map();
  for (const m of filas) {
    if (!m.material_id) continue;
    // El ajuste ya viene firmado; el resto define el signo por el tipo.
    const delta = m.tipo === "ajuste" ? num(m.cantidad) : (m.tipo === "ingreso" ? num(m.cantidad) : -num(m.cantidad));
    stock.set(m.material_id, (stock.get(m.material_id) ?? 0) + delta);
  }
  return stock;
}

/** Sale del galpón de origen y queda en tránsito. */
export async function crearTraslado({ materialId, cantidad, origen, destino, observaciones = "" }) {
  const cant = num(cantidad);
  if (!materialId) throw new Error("Elegí el material.");
  if (cant <= 0) throw new Error("La cantidad tiene que ser mayor a cero.");
  if (origen === destino) throw new Error("El origen y el destino son el mismo galpón.");

  const userId = await idUsuario();
  const nota = String(observaciones || "").trim();
  const detalle = [`Traslado a ${destino}`, nota].filter(Boolean).join(" · ");

  const { data: egreso, error } = await supabase
    .from("laminacion_movimientos")
    .insert({
      material_id: materialId,
      tipo: "egreso",
      cantidad: cant,
      fecha: hoyLocal(),
      destino: `Traslado a ${destino}`,
      observaciones: detalle,
      creado_por: userId,
      sede: origen,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: traslado, error: errorTraslado } = await supabase
    .from("laminacion_traslados")
    .insert({
      material_id: materialId,
      cantidad: cant,
      sede_origen: origen,
      sede_destino: destino,
      observaciones: nota || null,
      movimiento_egreso_id: egreso.id,
      enviado_por: userId,
    })
    .select("id")
    .single();

  if (errorTraslado) {
    // Sin esto el material sale del origen y no llega a ningún lado.
    await supabase.from("laminacion_movimientos").delete().eq("id", egreso.id);
    throw errorTraslado;
  }
  return traslado;
}

/** El destino confirma que llegó: recién ahí suma a su stock. */
export async function confirmarTraslado(traslado) {
  const userId = await idUsuario();
  const { data: ingreso, error } = await supabase
    .from("laminacion_movimientos")
    .insert({
      material_id: traslado.material_id,
      tipo: "ingreso",
      cantidad: num(traslado.cantidad),
      fecha: hoyLocal(),
      proveedor: `Traslado desde ${traslado.sede_origen}`,
      observaciones: [`Traslado desde ${traslado.sede_origen}`, traslado.observaciones].filter(Boolean).join(" · "),
      creado_por: userId,
      sede: traslado.sede_destino,
    })
    .select("id")
    .single();
  if (error) throw error;

  // El filtro por estado es lo que evita el doble ingreso: si otro ya confirmó
  // este mismo traslado, la condición no matchea y no se actualiza nada.
  const { data: actualizado, error: errorUpdate } = await supabase
    .from("laminacion_traslados")
    .update({
      estado: "recibido",
      movimiento_ingreso_id: ingreso.id,
      recibido_por: userId,
      recibido_at: new Date().toISOString(),
    })
    .eq("id", traslado.id)
    .eq("estado", "en_transito")
    .select("id");

  if (errorUpdate || !actualizado?.length) {
    await supabase.from("laminacion_movimientos").delete().eq("id", ingreso.id);
    throw errorUpdate || new Error("Este traslado ya lo confirmó otra persona.");
  }
  return actualizado[0];
}

/**
 * El traslado no salió, o volvió.
 *
 * Se compensa con un ingreso en el origen en vez de borrar el egreso: el
 * material se movió de verdad y el registro tiene que poder contarlo. Borrar
 * deja la planilla prolija y la historia falsa.
 */
export async function cancelarTraslado(traslado, motivo = "") {
  const userId = await idUsuario();
  const razon = String(motivo || "").trim();

  const { data: devolucion, error } = await supabase
    .from("laminacion_movimientos")
    .insert({
      material_id: traslado.material_id,
      tipo: "ingreso",
      cantidad: num(traslado.cantidad),
      fecha: hoyLocal(),
      proveedor: `Traslado cancelado a ${traslado.sede_destino}`,
      observaciones: ["Traslado cancelado: el material vuelve al galpón", razon].filter(Boolean).join(" · "),
      creado_por: userId,
      sede: traslado.sede_origen,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: actualizado, error: errorUpdate } = await supabase
    .from("laminacion_traslados")
    .update({
      estado: "cancelado",
      cancelado_at: new Date().toISOString(),
      cancelado_motivo: razon || null,
    })
    .eq("id", traslado.id)
    .eq("estado", "en_transito")
    .select("id");

  if (errorUpdate || !actualizado?.length) {
    await supabase.from("laminacion_movimientos").delete().eq("id", devolucion.id);
    throw errorUpdate || new Error("Este traslado ya no está en tránsito.");
  }
  return actualizado[0];
}

/** Guarda el mínimo de reposición de un material para un galpón. */
export async function guardarMinimo({ materialId, sede, minimo }) {
  const { error } = await supabase
    .from("laminacion_stock_minimos")
    .upsert({ material_id: materialId, sede, minimo: num(minimo), updated_at: new Date().toISOString() },
      { onConflict: "material_id,sede" });
  if (error) throw error;
}
