import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";

/**
 * La planilla de una linea: los materiales como filas, las obras como columnas,
 * y en cada cruce en que anda ese material para ese barco.
 *
 * Son las tres preguntas que hoy hay que ir a buscar de a una: que ya se
 * entrego, que sigue esperando, y si el pañol lo tiene o hay que comprarlo.
 *
 * Nada de esto se carga: sale del mismo ledger que usa el pañol, que se escribe
 * solo cada vez que alguien recibe o entrega algo.
 */

/** Lo que ya se le dio al barco: salio del pañol y no vuelve. */
const ESTADOS_EGRESADO = new Set(["egresado"]);
/** Reservado para esa obra y fisicamente en el pañol. */
const ESTADOS_EN_PANOL = new Set(["en_panol", "recibido", "parcial"]);
/** Todavia no llego: falta comprarlo o esta en camino. */
const ESTADOS_PENDIENTE = new Set(["pendiente", "pedido", "comprado"]);

const redondear = (n) => Math.round(n * 100) / 100;

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

/** Los rubros del catalogo, para poder agrupar como se piensa al comprar. */
async function traerRubros() {
  const { data, error } = await supabase.from("panol_categorias").select("id,nombre").limit(500);
  if (error) return new Map();
  return new Map((data ?? []).map((c) => [c.id, c.nombre]));
}

export async function calcularPlanillaDeLinea(linea) {
  const [materiales, obras, ledger, rubros] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,proveedor,unidad_medida,categoria_id,es_consumible,activo"),
    traerTodo("produccion_obras", "id,codigo,linea_nombre,estado,fecha_inicio"),
    traerTodo("panol_obra_materiales_snapshot", "material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,created_at"),
    traerRubros(),
  ]);

  const porMaterial = new Map(materiales.filter((m) => m.activo !== false).map((m) => [m.id, m]));

  const lineasDisponibles = [...new Set(
    obras.map((o) => String(o.linea_nombre || "").trim()).filter(Boolean),
  )].sort();

  const obrasDeLinea = obras
    .filter((o) => String(o.linea_nombre || "").trim() === linea)
    // Solo las que estan en curso. Los estados reales de la tabla son "activa"
    // y "terminada": el filtro anterior descartaba "entregada" y "cancelada",
    // que no existen, asi que las terminadas se colaban en la planilla.
    .filter((o) => o.estado === "activa")
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

  const idsDeObra = new Set(obrasDeLinea.map((o) => o.id));

  const cargaDeObra = new Map(obrasDeLinea.map((o) => [o.id, { filas: 0, pendiente: 0 }]));
  for (const f of ledger) {
    const carga = cargaDeObra.get(f.obra_id);
    if (!carga) continue;
    carga.filas += 1;
    if (ESTADOS_PENDIENTE.has(f.estado)) carga.pendiente += Number(f.cantidad_egresada || f.cantidad || 0);
  }

  // El pañol tiene dos bolsas distintas y hasta ahora se mostraban sumadas:
  //
  //   LIBRE      - sin obra asignada. Es lo unico que sirve para cubrir un
  //                barco cualquiera, y por lo tanto lo unico que descuenta de
  //                lo que hay que comprar.
  //   RESERVADO  - ya tiene dueño. Esta fisicamente en el pañol, pero para
  //                comprar no cuenta: si esta apartado para otra obra, no esta.
  //
  // Ademas suma TODAS las filas y deja que rowDelta ponga el signo. Antes se
  // salteaba la fila cuando no era de stock, asi que los egresos nunca se
  // restaban y la columna mostraba el historico de ingresos en vez del saldo:
  // CABLE CHATO 3x4 figuraba con 200 cuando lo libre real era 0.
  const stockLibre = new Map();
  const stockReservado = new Map();
  for (const f of ledger) {
    if (!f.material_id) continue;
    const delta = rowDelta(f);
    if (!delta) continue;
    const bolsa = f.obra_id ? stockReservado : stockLibre;
    bolsa.set(f.material_id, (bolsa.get(f.material_id) || 0) + delta);
  }

  // El cruce material x obra.
  const celdas = new Map();  // "materialId|obraId"
  for (const f of ledger) {
    if (!f.material_id || !f.obra_id || !idsDeObra.has(f.obra_id)) continue;
    const clave = `${f.material_id}|${f.obra_id}`;
    const c = celdas.get(clave) ?? { egresado: 0, enPanol: 0, pendiente: 0 };
    // Si el estado dice egresado, lo que salio es la cantidad: hay filas con
    // cantidad_egresada en 0 y el numero real en el otro campo.
    const cant = Number(f.cantidad_egresada || f.cantidad || 0);
    if (!cant) { celdas.set(clave, c); continue; }
    if (ESTADOS_EGRESADO.has(f.estado)) c.egresado += cant;
    else if (ESTADOS_EN_PANOL.has(f.estado)) c.enPanol += cant;
    else if (ESTADOS_PENDIENTE.has(f.estado)) c.pendiente += cant;
    celdas.set(clave, c);
  }

  // Una fila por material que aparezca en alguna obra de la linea.
  const filas = new Map();
  for (const [clave, c] of celdas) {
    const [materialId, obraId] = clave.split("|");
    const material = porMaterial.get(materialId);
    if (!material) continue;
    if (!c.egresado && !c.enPanol && !c.pendiente) continue;

    if (!filas.has(materialId)) {
      filas.set(materialId, {
        id: materialId,
        descripcion: material.descripcion || "",
        codigo: material.codigo || "",
        proveedor: String(material.proveedor || "").trim(),
        rubro: rubros.get(material.categoria_id) || "Sin rubro",
        unidad: material.unidad_medida || "unidad",
        esConsumible: material.es_consumible === true,
        enPanolLibre: redondear(Math.max(0, stockLibre.get(materialId) || 0)),
        reservado: redondear(Math.max(0, stockReservado.get(materialId) || 0)),
        porObra: {},
        totales: { egresado: 0, enPanol: 0, pendiente: 0 },
      });
    }
    const fila = filas.get(materialId);
    fila.porObra[obraId] = {
      egresado: redondear(c.egresado),
      enPanol: redondear(c.enPanol),
      pendiente: redondear(c.pendiente),
    };
    fila.totales.egresado = redondear(fila.totales.egresado + c.egresado);
    fila.totales.enPanol = redondear(fila.totales.enPanol + c.enPanol);
    fila.totales.pendiente = redondear(fila.totales.pendiente + c.pendiente);
  }

  for (const fila of filas.values()) {
    fila.faltaComprar = redondear(Math.max(0, fila.totales.pendiente - fila.enPanolLibre));
  }

  const listaFilas = [...filas.values()].sort((a, b) => {
    // Lo que hay que comprar primero, que es a lo que se viene. Despues lo que
    // falta pero ya esta en el pañol, y al final lo que esta completo.
    if ((b.faltaComprar > 0) !== (a.faltaComprar > 0)) return b.faltaComprar > 0 ? 1 : -1;
    if ((b.totales.pendiente > 0) !== (a.totales.pendiente > 0)) return b.totales.pendiente > 0 ? 1 : -1;
    const porRubro = a.rubro.localeCompare(b.rubro);
    return porRubro !== 0 ? porRubro : a.descripcion.localeCompare(b.descripcion);
  });

  return {
    linea,
    lineasDisponibles,
    obras: obrasDeLinea.map((o) => {
      const carga = cargaDeObra.get(o.id) ?? { filas: 0, pendiente: 0 };
      return {
        id: o.id,
        codigo: o.codigo,
        estado: o.estado,
        filasCargadas: carga.filas,
        carga: !carga.filas ? "sin_cargar" : carga.pendiente > 0 ? "con_pendientes" : "todo_llego",
      };
    }),
    filas: listaFilas,
    resumen: {
      materiales: listaFilas.length,
      obras: obrasDeLinea.length,
      conPendiente: listaFilas.filter((f) => f.totales.pendiente > 0).length,
      sinProveedor: listaFilas.filter((f) => !f.proveedor && f.totales.pendiente > 0).length,
      cubiertos: listaFilas.filter((f) => f.totales.pendiente > 0 && f.enPanolLibre >= f.totales.pendiente).length,
      aComprar: listaFilas.filter((f) => f.faltaComprar > 0).length,
      sinCargar: obrasDeLinea.filter((o) => !(cargaDeObra.get(o.id)?.filas)).length,
      rubros: new Set(listaFilas.map((f) => f.rubro)).size,
    },
  };
}
