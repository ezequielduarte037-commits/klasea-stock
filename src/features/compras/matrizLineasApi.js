import { supabase } from "@/supabaseClient";
import { rowCountsAsStock, rowDelta } from "@/features/panol/panolMovimientos";

/**
 * La matriz de que lleva cada linea de produccion, deducida del consumo real.
 *
 * Nadie va a cargar a mano que lleva un K37: es lo que se intento con las etapas
 * de compra y quedaron 7 en todo el sistema. Pero el dato ya esta escrito: cada
 * egreso del pañol esta atado a una obra, y cada obra a su linea. Si un extractor
 * salio para tres K37 distintos, es parte de la matriz del K37, lo diga o no una
 * planilla.
 *
 * El numero que importa es CUANTO LLEVA CADA BARCO, y se calcula dividiendo por
 * las obras que efectivamente lo usaron, no por todas las de la linea: las que
 * recien arrancan todavia no llegaron a esa etapa y meterlas en el promedio
 * hunde la cifra.
 *
 * La cobertura -cuantas de las obras de la linea ya lo consumieron- dice cuanta
 * confianza tenerle: 5 de 5 es una certeza, 1 de 7 puede ser una excepcion.
 */

const DIAS_POR_MES = 30.4;

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

export async function calcularMatrizDeLineas() {
  const [materiales, obras, ledger] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,proveedor,unidad_medida,es_consumible,activo"),
    traerTodo("produccion_obras", "id,codigo,linea_nombre,estado"),
    traerTodo("panol_obra_materiales_snapshot", "material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,created_at"),
  ]);

  const porMaterial = new Map(materiales.filter((m) => m.activo !== false).map((m) => [m.id, m]));
  const porObra = new Map(obras.map((o) => [o.id, o]));

  // Cuantas obras tiene cada linea, y cuantas siguen en curso: lo primero sirve
  // para la cobertura, lo segundo para proyectar lo que falta comprar.
  const lineas = new Map();
  for (const o of obras) {
    const nombre = String(o.linea_nombre || "").trim();
    if (!nombre) continue;
    if (!lineas.has(nombre)) lineas.set(nombre, { nombre, obras: [], activas: [] });
    const l = lineas.get(nombre);
    l.obras.push(o);
    if (!["entregada", "cancelada"].includes(o.estado)) l.activas.push(o);
  }

  // Stock actual, con la logica canonica del pañol.
  const stock = new Map();
  for (const f of ledger) {
    if (!f.material_id || !rowCountsAsStock(f)) continue;
    stock.set(f.material_id, (stock.get(f.material_id) || 0) + rowDelta(f));
  }

  // Consumo por material y por linea.
  const egresos = ledger.filter((f) => f.estado === "egresado" && f.material_id && f.obra_id);
  const celdas = new Map();   // "materialId|linea" -> { total, obras:Set }
  for (const f of egresos) {
    const obra = porObra.get(f.obra_id);
    const linea = String(obra?.linea_nombre || "").trim();
    if (!linea) continue;
    // Hay filas egresadas con cantidad_egresada en 0 y la cantidad real en el
    // otro campo: si el estado dice egresado, lo que salio es la cantidad.
    const cant = Number(f.cantidad_egresada || f.cantidad || 0);
    if (!cant) continue;
    const clave = `${f.material_id}|${linea}`;
    const c = celdas.get(clave) ?? { materialId: f.material_id, linea, total: 0, obras: new Set(), veces: 0 };
    c.total += cant;
    c.obras.add(f.obra_id);
    c.veces += 1;
    celdas.set(clave, c);
  }

  // Una fila por material, con una columna por linea.
  const filas = new Map();
  for (const c of celdas.values()) {
    const material = porMaterial.get(c.materialId);
    if (!material) continue;
    const linea = lineas.get(c.linea);
    const obrasDeLaLinea = linea?.obras.length || c.obras.size;

    if (!filas.has(c.materialId)) {
      filas.set(c.materialId, {
        id: c.materialId,
        descripcion: material.descripcion || "",
        codigo: material.codigo || "",
        proveedor: String(material.proveedor || "").trim(),
        unidad: material.unidad_medida || "unidad",
        esConsumible: material.es_consumible === true,
        hay: Math.round((stock.get(c.materialId) || 0) * 100) / 100,
        porLinea: {},
        lineasQueLoUsan: 0,
      });
    }
    const fila = filas.get(c.materialId);
    // Por barco: sobre las obras que YA lo consumieron. Las que recien arrancan
    // no llegaron a esa etapa y promediarlas da un numero falsamente bajo.
    const porBarco = c.total / c.obras.size;
    fila.porLinea[c.linea] = {
      total: Math.round(c.total * 100) / 100,
      porBarco: Math.round(porBarco * 100) / 100,
      obrasQueLoUsaron: c.obras.size,
      obrasDeLaLinea,
      cobertura: obrasDeLaLinea ? c.obras.size / obrasDeLaLinea : 0,
    };
    fila.lineasQueLoUsan += 1;
  }

  // Lo que va a hacer falta: por cada linea, las obras activas que todavia no
  // consumieron ese material, por lo que lleva cada barco. Es la pregunta que
  // hoy nadie contesta: "en las obras en curso, cuanto mas voy a necesitar".
  for (const fila of filas.values()) {
    let proyectado = 0;
    for (const [nombreLinea, celda] of Object.entries(fila.porLinea)) {
      const linea = lineas.get(nombreLinea);
      if (!linea) continue;
      // De las activas, las que todavia no lo pidieron.
      const pendientes = linea.activas.length - celda.obrasQueLoUsaron;
      if (pendientes > 0) proyectado += pendientes * celda.porBarco;
    }
    fila.proyectado = Math.round(proyectado * 10) / 10;
    fila.faltan = Math.round((proyectado - fila.hay) * 10) / 10;
  }

  const nombresDeLinea = [...lineas.values()]
    .filter((l) => [...celdas.values()].some((c) => c.linea === l.nombre))
    .sort((a, b) => b.obras.length - a.obras.length)
    .map((l) => ({ nombre: l.nombre, obras: l.obras.length, activas: l.activas.length }));

  const listaFilas = [...filas.values()].sort((a, b) => {
    // Primero lo que va a faltar; despues lo que mas lineas comparten.
    if ((b.faltan > 0) !== (a.faltan > 0)) return b.faltan > 0 ? 1 : -1;
    if (b.faltan !== a.faltan) return b.faltan - a.faltan;
    return b.lineasQueLoUsan - a.lineasQueLoUsan;
  });

  return {
    lineas: nombresDeLinea,
    filas: listaFilas,
    resumen: {
      materiales: listaFilas.length,
      lineas: nombresDeLinea.length,
      compartidos: listaFilas.filter((f) => f.lineasQueLoUsan > 1).length,
      conFaltante: listaFilas.filter((f) => f.faltan > 0).length,
      egresosUsados: egresos.length,
    },
  };
}
