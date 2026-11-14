import { supabase } from "@/supabaseClient";

// El contrato común corta a 1.000 filas. El tablero pagina para que un mes
// ocupado no dé totales menores sin avisar; también incluye productos inactivos.
const PAGINA = 500;
const CAMPOS = `id,material_id,sede,tipo,cantidad,costo_unitario_ars,created_at,
  empleado_id,empleado_nombre,empleado_dni,empleado_empresa,empleado_externo,obra_id,sector,carril,lote,solicitud_id,
  fuera_cupo,canje,autorizado_por,contado,teorico,
  obra:produccion_obras(id,codigo),
  material:panol_materiales(id,descripcion,unidad_medida,
    categoria:panol_categorias!panol_materiales_categoria_id_fkey(id,nombre),config:consumibles_config(unidad_entrega))`;

async function leerPaginas({ sede, desde, hasta, tipos, campos, signal }) {
  const filas = new Map();
  let offset = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Consulta cancelada", "AbortError");
    let q = supabase.from("consumibles_movimientos")
      .select(campos, { count: "exact" })
      .is("anulado_at", null)
      .in("tipo", tipos)
      .lt("created_at", hasta)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (sede) q = q.eq("sede", sede);
    if (desde) q = q.gte("created_at", desde);
    if (signal) q = q.abortSignal(signal);
    const { data, error, count } = await q;
    if (error) throw error;
    const pagina = data ?? [];
    for (const fila of pagina) filas.set(fila.id, fila);
    offset += pagina.length;
    // Se avanza por las filas recibidas, incluso si el servidor tiene un
    // límite menor a 500. Nunca se interpreta ese recorte como fin de datos.
    if (count !== null && count !== undefined && offset >= count) break;
    if (!pagina.length) {
      if (count > offset) throw new Error("La consulta quedó incompleta. Volvé a actualizar el tablero.");
      break;
    }
    if (count == null && pagina.length < PAGINA) break;
  }
  return [...filas.values()];
}

export async function fetchDatosTablero({ sede = null, desde, hasta, signal }) {
  const [movimientos, conteos] = await Promise.all([
    leerPaginas({ sede, desde, hasta, signal, tipos: ["retiro", "inventario"], campos: CAMPOS }),
    // Se mira todo el historial de conteos hasta el cierre del período: el
    // primer conteo puede quedar fuera del rango, y no es una merma.
    leerPaginas({ sede, hasta, signal, tipos: ["inventario"], campos: "id,material_id,sede,created_at" }),
  ]);
  return { movimientos, conteos };
}
