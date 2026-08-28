import { supabase } from "@/supabaseClient";

/**
 * Cuanta plata lleva puesta cada obra en materiales.
 *
 * ADVERTENCIA QUE LA PANTALLA TIENE QUE MOSTRAR: hoy solo el 47% de los
 * renglones con obra tienen precio. Este numero es un PISO, no el costo real, y
 * presentarlo como "el costo de la obra" seria mentir por la mitad. Por eso
 * cada obra viene con su cobertura y con los renglones sin precio contados: eso
 * ultimo es, ademas, la lista de lo que hay que ir a cargar.
 *
 * El precio sale de la fila del ledger si la tiene (es el que se pago de verdad
 * en ese remito) y si no del catalogo, que es el ultimo conocido.
 */

const ESTADOS_EGRESADO = new Set(["egresado"]);
const ESTADOS_EN_PANOL = new Set(["en_panol", "recibido", "parcial"]);
const ESTADOS_PENDIENTE = new Set(["pendiente", "pedido", "comprado"]);

const redondear = (n) => Math.round(n * 100) / 100;

function numero(valor) {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

async function traerTodo(tabla, select) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(select).range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

export async function calcularCostoDeObras() {
  const [materiales, obras, ledger, categorias] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,proveedor,unidad_medida,categoria_id,precio_unitario"),
    traerTodo("produccion_obras", "id,codigo,linea_nombre,estado"),
    traerTodo("panol_obra_materiales_snapshot", "material_id,obra_id,cantidad,cantidad_egresada,estado,precio_unitario"),
    supabase.from("panol_categorias").select("id,nombre").limit(500).then(({ data }) => data ?? []),
  ]);

  const porMaterial = new Map(materiales.map((m) => [m.id, m]));
  const rubroPorId = new Map(categorias.map((c) => [c.id, c.nombre]));
  const activas = obras.filter((o) => o.estado === "activa");

  const acumulado = new Map();
  for (const o of activas) {
    acumulado.set(o.id, {
      id: o.id,
      codigo: o.codigo,
      linea: String(o.linea_nombre || "").trim() || "Sin línea",
      entregado: 0,
      enPanol: 0,
      pendiente: 0,
      renglones: 0,
      conPrecio: 0,
      sinPrecio: 0,
      porRubro: new Map(),
      faltanPrecio: new Map(),
    });
  }

  for (const f of ledger) {
    const obra = acumulado.get(f.obra_id);
    if (!obra || !f.material_id) continue;
    const material = porMaterial.get(f.material_id);
    if (!material) continue;

    // Igual que en la planilla: hay filas egresadas con cantidad_egresada en 0
    // y el numero real en "cantidad".
    const cantidad = numero(f.cantidad_egresada || f.cantidad);
    if (!cantidad) continue;

    obra.renglones += 1;
    // El precio de la fila es el que se pago en ese remito; el del catalogo es
    // el ultimo conocido. Si no hay ninguno, el renglon no suma y se anota.
    const precio = numero(f.precio_unitario) || numero(material.precio_unitario);
    if (!precio) {
      obra.sinPrecio += 1;
      const clave = f.material_id;
      const actual = obra.faltanPrecio.get(clave) ?? { id: clave, descripcion: material.descripcion || "", cantidad: 0 };
      actual.cantidad += cantidad;
      obra.faltanPrecio.set(clave, actual);
      continue;
    }
    obra.conPrecio += 1;

    const plata = cantidad * precio;
    if (ESTADOS_EGRESADO.has(f.estado)) obra.entregado += plata;
    else if (ESTADOS_EN_PANOL.has(f.estado)) obra.enPanol += plata;
    else if (ESTADOS_PENDIENTE.has(f.estado)) obra.pendiente += plata;
    else continue;

    const rubro = rubroPorId.get(material.categoria_id) || "Sin rubro";
    obra.porRubro.set(rubro, redondear((obra.porRubro.get(rubro) || 0) + plata));
  }

  const lista = [...acumulado.values()]
    .map((o) => ({
      ...o,
      entregado: redondear(o.entregado),
      enPanol: redondear(o.enPanol),
      pendiente: redondear(o.pendiente),
      total: redondear(o.entregado + o.enPanol + o.pendiente),
      cobertura: o.renglones ? o.conPrecio / o.renglones : 0,
      porRubro: [...o.porRubro.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, monto]) => ({ nombre, monto })),
      faltanPrecio: [...o.faltanPrecio.values()].sort((a, b) => b.cantidad - a.cantidad),
    }))
    .sort((a, b) => b.total - a.total);

  const renglones = lista.reduce((s, o) => s + o.renglones, 0);
  const conPrecio = lista.reduce((s, o) => s + o.conPrecio, 0);

  return {
    obras: lista,
    lineas: [...new Set(lista.map((o) => o.linea))].sort(),
    resumen: {
      obras: lista.length,
      total: redondear(lista.reduce((s, o) => s + o.total, 0)),
      entregado: redondear(lista.reduce((s, o) => s + o.entregado, 0)),
      enPanol: redondear(lista.reduce((s, o) => s + o.enPanol, 0)),
      pendiente: redondear(lista.reduce((s, o) => s + o.pendiente, 0)),
      renglones,
      conPrecio,
      cobertura: renglones ? conPrecio / renglones : 0,
      materialesSinPrecio: new Set(lista.flatMap((o) => o.faltanPrecio.map((m) => m.id))).size,
    },
  };
}
