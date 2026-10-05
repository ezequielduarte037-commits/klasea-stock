import { buscarFamilia, indexar, type MaterialCatalogo } from "./robotBuscador.ts";

export const normalizarCodigoObra = (codigo: string) => String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Registro = {
  id: string; material_id?: string | null; requisito_material_id?: string | null;
  descripcion: string; codigo?: string | null; cantidad?: number | string | null;
  cantidad_egresada?: number | string | null; unidad?: string | null;
  estado?: string | null; source?: string | null; notas?: string | null;
};

function cantidadRegistrada(valor: unknown): number | null {
  if (valor == null || String(valor).trim() === "") return null;
  const numero = Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** Consulta del registro de obra, no del stock general ni de la matriz base.
 * Incluye adicionales sin material_id. Una cantidad ausente sigue ausente:
 * contar un renglón de "Griferías negras" no prueba que haya una grifería.
 */
export function materialesRegistrados(filas: Registro[], catalogo: Map<string, MaterialCatalogo>, consulta: string) {
  const vigentes = filas.filter((f) => f.estado !== "cancelado"
    && !`${f.source || ""} ${f.notas || ""}`.toLowerCase().includes("[anulado]")
    && !["ajuste_ubicacion", "conteo_fisico_reversion", "reclasificacion_egreso"].includes(f.source || "")
    && !String(f.source || "").startsWith("transferencia_egreso"));
  const indice = indexar(vigentes.map((f) => {
    const producto = f.material_id ? catalogo.get(f.material_id) : null;
    const requisito = f.requisito_material_id ? catalogo.get(f.requisito_material_id) : null;
    return { id: f.id, descripcion: f.descripcion, codigo: f.codigo || producto?.codigo,
      alias: [producto?.descripcion, requisito?.descripcion, ...(Array.isArray(producto?.alias) ? producto.alias : [producto?.alias])].filter(Boolean).join(" ") };
  }));
  const ids = consulta.trim() ? new Set(buscarFamilia(indice, consulta).map((c) => c.material.id)) : new Set(vigentes.map((f) => f.id));
  const resultados = vigentes.filter((f) => ids.has(f.id));
  const porEstado = new Map<string, { estado: string; unidad: string; cantidad_conocida: number; registros_sin_cantidad: number }>();
  const materiales = resultados.map((f) => {
    const egresada = cantidadRegistrada(f.cantidad_egresada);
    const cantidad = cantidadRegistrada(f.estado === "egresado" && egresada != null && egresada > 0 ? egresada : f.cantidad);
    const unidad = /^(unid|unidad|unidades|u)$/i.test(f.unidad || "unidad") ? "unidad" : f.unidad || "unidad";
    const estado = f.estado || "sin estado";
    const llave = `${estado}|${unidad}`;
    const grupo = porEstado.get(llave) || { estado, unidad, cantidad_conocida: 0, registros_sin_cantidad: 0 };
    if (cantidad == null) grupo.registros_sin_cantidad++; else grupo.cantidad_conocida += cantidad;
    porEstado.set(llave, grupo);
    return { descripcion: f.descripcion, cantidad, unidad, estado };
  });
  return { registros: resultados.length, resumen_por_estado: [...porEstado.values()], materiales: materiales.slice(0, 30),
    detalle_truncado: materiales.length > 30,
    nota: "Son registros de materiales vinculados a esta obra, NO stock libre ni necesidad total de matriz. No sumes estados como si fueran stock. Cantidad null significa sin cantidad cargada, nunca cero ni una unidad. Sin registros no demuestra que la matriz no lo requiera." };
}

// Paginación estable: PostgREST normalmente devuelve como máximo 1000 filas.
export async function leerPaginas(crearConsulta: () => any): Promise<any[]> {
  const filas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await crearConsulta().order("id").range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
    if (filas.length >= 50000) throw new Error("Demasiados registros: acotá la consulta.");
  }
}

export async function consultarMaterialesObra(db: any, codigo: string, consulta: string, catalogo: Map<string, MaterialCatalogo>) {
  const buscado = normalizarCodigoObra(codigo);
  if (!buscado) return { error: "Falta el código del barco. Preguntá cuál." };
  const obras = await leerPaginas(() => db.from("produccion_obras").select("id,codigo,linea_nombre,estado"));
  const coincidencias = obras.filter((o) => normalizarCodigoObra(o.codigo) === buscado);
  if (coincidencias.length !== 1) return { obra_encontrada: false, nota: "No se identificó una única obra con ese código. Pedí el código exacto, sin adivinar." };
  const obra = coincidencias[0];
  const filas = await leerPaginas(() => db.from("panol_obra_materiales_snapshot")
    .select("id,material_id,requisito_material_id,descripcion,codigo,cantidad,cantidad_egresada,unidad,estado,source,notas")
    .eq("obra_id", obra.id));
  return { obra: obra.codigo, linea: obra.linea_nombre, ...materialesRegistrados(filas, catalogo, consulta) };
}
