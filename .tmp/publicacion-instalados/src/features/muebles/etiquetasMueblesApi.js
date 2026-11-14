import { codigoObraEtiqueta, prepararEtiquetasMuebles } from "./etiquetasMuebles.js";

async function leer(query) {
  const { data, error } = await query;
  if (error) throw Error(error.message);
  return data;
}

export async function cargarObrasEtiquetasMuebles(client) {
  const [unidades, lineas] = await Promise.all([
    leer(client.from("prod_unidades").select("id,codigo,linea_id").eq("activa", true)),
    leer(client.from("prod_lineas").select("id,nombre").eq("activa", true)),
  ]);
  return { unidades: (unidades ?? []).sort((a, b) => codigoObraEtiqueta(a.codigo).localeCompare(codigoObraEtiqueta(b.codigo), "es-AR", { numeric: true })), lineas: lineas ?? [] };
}

export async function cargarDatosEtiquetasMuebles(client, unidadId) {
  let respuesta = await client.from("prod_unidades").select("id,codigo,linea_id,chapa_manual").eq("id", unidadId).eq("activa", true).single();
  if (respuesta.error && String(respuesta.error.message).includes("chapa_manual")) {
    respuesta = await client.from("prod_unidades").select("id,codigo,linea_id").eq("id", unidadId).eq("activa", true).single();
  }
  if (respuesta.error) throw Error(respuesta.error.message);
  const unidad = respuesta.data;
  if (!unidad || unidad.id !== unidadId) throw Error("La obra ya no está disponible. Actualizá la lista.");
  const [linea, piezas, plantilla] = await Promise.all([
    leer(client.from("prod_lineas").select("id,nombre").eq("id", unidad.linea_id).single()),
    leer(client.from("prod_unidad_checklist").select("id,unidad_id,mueble_id,estado,prod_muebles(id,nombre,sector)").eq("unidad_id", unidad.id)),
    leer(client.from("prod_linea_muebles").select("linea_id,mueble_id,nro_pieza").eq("linea_id", unidad.linea_id)),
  ]);
  const patron = codigoObraEtiqueta(unidad.codigo).replace(/[\\%_]/g, "\\$&");
  const ots = await leer(client.from("enchapado_ots").select("id,modelo,barco,tipo_chapa,created_at")
    .ilike("barco", `%${patron}%`).order("created_at", { ascending: false }));
  return prepararEtiquetasMuebles({ unidad, linea, piezas: piezas ?? [], plantilla: plantilla ?? [], ots: ots ?? [] });
}
