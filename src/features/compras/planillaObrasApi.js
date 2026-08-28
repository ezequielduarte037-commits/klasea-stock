import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";

/**
 * Planilla operativa de una linea.
 *
 * La necesidad nace en `panol_material_modelo` (la matriz viva). El snapshot
 * de cada obra solamente completa el estado operativo: pedido, recibido o
 * entregado. De esta manera una obra nueva ya muestra todo lo que necesita,
 * aunque todavia no haya tenido ningun movimiento en Panol.
 */

const ESTADOS_EGRESADO = new Set(["egresado"]);
const ESTADOS_EN_PANOL = new Set(["en_panol", "recibido", "parcial"]);
const ESTADOS_PENDIENTE = new Set(["pendiente", "pedido", "comprado"]);

const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;
const normalizarModelo = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "")
  .replace(/^K/, "");

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

async function traerRubros() {
  const { data, error } = await supabase.from("panol_categorias").select("id,nombre").limit(500);
  if (error) return new Map();
  return new Map((data ?? []).map((c) => [c.id, c.nombre]));
}

function celdaVacia(cantidad, requisitoId, desdeMatriz = true) {
  return {
    requerido: redondear(cantidad),
    egresado: 0,
    enPanol: 0,
    pendiente: redondear(cantidad),
    requisitoId,
    desdeMatriz,
  };
}

function sumarEstado(celda, fila) {
  const cantidad = Number(fila.cantidad_egresada || fila.cantidad || 0);
  if (!cantidad) return;
  if (ESTADOS_EGRESADO.has(fila.estado)) celda.egresado += cantidad;
  else if (ESTADOS_EN_PANOL.has(fila.estado)) celda.enPanol += cantidad;
  else if (ESTADOS_PENDIENTE.has(fila.estado)) celda.pendiente += cantidad;
}

function materialMeta(material, rubros, imagenes) {
  return {
    descripcion: material?.descripcion || "Material sin identificar",
    codigo: material?.codigo || "",
    proveedor: String(material?.proveedor || "").trim(),
    rubro: rubros.get(material?.categoria_id) || "Sin rubro",
    unidad: material?.unidad_medida || "unidad",
    esConsumible: material?.es_consumible === true,
    imagenUrl: material?.imagen_url || imagenes.get(material?.id) || "",
  };
}

export async function calcularPlanillaDeLinea(linea) {
  const [materiales, modelos, obras, ledger, rubros, imagenesRows] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,proveedor,unidad_medida,categoria_id,es_consumible,activo,imagen_url"),
    traerTodo("panol_material_modelo", "material_id,modelo,cantidad,variante,producto_predeterminado_id"),
    traerTodo("produccion_obras", "id,codigo,linea_nombre,estado,fecha_inicio"),
    traerTodo("panol_obra_materiales_snapshot", "material_id,requisito_material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,created_at"),
    traerRubros(),
    traerTodo("panol_material_imagenes", "material_id,url,created_at"),
  ]);

  const porMaterial = new Map(materiales.filter((m) => m.activo !== false).map((m) => [m.id, m]));
  const imagenes = new Map();
  for (const imagen of imagenesRows) {
    if (imagen.material_id && imagen.url && !imagenes.has(imagen.material_id)) {
      imagenes.set(imagen.material_id, imagen.url);
    }
  }
  const modeloElegido = normalizarModelo(linea);
  const matriz = modelos
    .filter((row) => normalizarModelo(row.modelo) === modeloElegido)
    .filter((row) => String(row.variante || "standard").toLowerCase() === "standard")
    .filter((row) => Number(row.cantidad || 0) > 0)
    .filter((row) => porMaterial.has(row.material_id));
  const matrizPorRequisito = new Map(matriz.map((row) => [row.material_id, row]));

  const lineasDisponibles = [...new Set(
    obras.map((o) => String(o.linea_nombre || "").trim()).filter(Boolean),
  )].sort();

  const obrasDeLinea = obras
    .filter((o) => normalizarModelo(o.linea_nombre) === modeloElegido)
    .filter((o) => o.estado === "activa")
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  const idsDeObra = new Set(obrasDeLinea.map((o) => o.id));

  // El stock libre es el unico que puede cubrir una necesidad nueva. Lo ya
  // reservado a otra obra se muestra, pero no descuenta compras.
  const stockLibre = new Map();
  const stockReservado = new Map();
  for (const fila of ledger) {
    if (!fila.material_id) continue;
    const delta = rowDelta(fila);
    if (!delta) continue;
    const bolsa = fila.obra_id ? stockReservado : stockLibre;
    bolsa.set(fila.material_id, (bolsa.get(fila.material_id) || 0) + delta);
  }

  // Agrupamos primero los snapshots por requisito y obra. El requisito es la
  // identidad estable; el producto concreto puede cambiar entre barcos.
  const snapshotPorRequisitoObra = new Map();
  const adicionales = [];
  for (const fila of ledger) {
    if (!fila.obra_id || !idsDeObra.has(fila.obra_id) || !fila.material_id) continue;
    const requisitoId = fila.requisito_material_id || fila.material_id;
    if (!matrizPorRequisito.has(requisitoId)) {
      adicionales.push(fila);
      continue;
    }
    const clave = `${requisitoId}|${fila.obra_id}`;
    const grupo = snapshotPorRequisitoObra.get(clave) ?? [];
    grupo.push(fila);
    snapshotPorRequisitoObra.set(clave, grupo);
  }

  // material concreto x obra. Todas las obras reciben primero la necesidad de
  // la matriz; si ya existe snapshot, ese estado reemplaza el pendiente base.
  const celdas = new Map();
  for (const obra of obrasDeLinea) {
    for (const item of matriz) {
      const requisitoId = item.material_id;
      const snapshots = snapshotPorRequisitoObra.get(`${requisitoId}|${obra.id}`) ?? [];
      const productoId = snapshots.find((row) => row.material_id)?.material_id
        || item.producto_predeterminado_id
        || requisitoId;
      const clave = `${productoId}|${obra.id}`;
      const celda = celdaVacia(item.cantidad, requisitoId, true);
      if (snapshots.length) {
        celda.egresado = 0;
        celda.enPanol = 0;
        celda.pendiente = 0;
        for (const fila of snapshots) sumarEstado(celda, fila);
      }
      const existente = celdas.get(clave);
      if (existente) {
        existente.requerido = redondear(existente.requerido + celda.requerido);
        existente.egresado = redondear(existente.egresado + celda.egresado);
        existente.enPanol = redondear(existente.enPanol + celda.enPanol);
        existente.pendiente = redondear(existente.pendiente + celda.pendiente);
      } else {
        celdas.set(clave, celda);
      }
    }
  }

  // Los adicionales y filas historicas fuera de la matriz siguen visibles:
  // no deben desaparecer solo porque no sean estandar de linea.
  for (const fila of adicionales) {
    const clave = `${fila.material_id}|${fila.obra_id}`;
    const celda = celdas.get(clave) ?? celdaVacia(fila.cantidad, fila.requisito_material_id || fila.material_id, false);
    if (!celdas.has(clave)) celda.pendiente = 0;
    sumarEstado(celda, fila);
    celda.requerido = redondear(Math.max(celda.requerido, celda.egresado + celda.enPanol + celda.pendiente));
    celdas.set(clave, celda);
  }

  const filas = new Map();
  for (const [clave, celdaRaw] of celdas) {
    const [materialId, obraId] = clave.split("|");
    const material = porMaterial.get(materialId) || porMaterial.get(celdaRaw.requisitoId);
    if (!material) continue;
    const celda = {
      requerido: redondear(celdaRaw.requerido),
      egresado: redondear(celdaRaw.egresado),
      enPanol: redondear(celdaRaw.enPanol),
      pendiente: redondear(celdaRaw.pendiente),
      desdeMatriz: celdaRaw.desdeMatriz,
      requisitoId: celdaRaw.requisitoId,
    };

    if (!filas.has(materialId)) {
      filas.set(materialId, {
        id: materialId,
        requisitoId: celda.requisitoId,
        ...materialMeta(material, rubros, imagenes),
        enPanolLibre: redondear(Math.max(0, stockLibre.get(materialId) || 0)),
        reservado: redondear(Math.max(0, stockReservado.get(materialId) || 0)),
        porObra: {},
        totales: { requerido: 0, egresado: 0, enPanol: 0, pendiente: 0 },
      });
    }
    const fila = filas.get(materialId);
    fila.porObra[obraId] = celda;
    for (const campo of ["requerido", "egresado", "enPanol", "pendiente"]) {
      fila.totales[campo] = redondear(fila.totales[campo] + celda[campo]);
    }
  }

  for (const fila of filas.values()) {
    fila.faltaComprar = redondear(Math.max(0, fila.totales.pendiente - fila.enPanolLibre));
  }

  const listaFilas = [...filas.values()].sort((a, b) => {
    if ((b.faltaComprar > 0) !== (a.faltaComprar > 0)) return b.faltaComprar > 0 ? 1 : -1;
    if ((b.totales.pendiente > 0) !== (a.totales.pendiente > 0)) return b.totales.pendiente > 0 ? 1 : -1;
    const porRubro = a.rubro.localeCompare(b.rubro, "es");
    return porRubro !== 0 ? porRubro : a.descripcion.localeCompare(b.descripcion, "es");
  });

  const obrasConResumen = obrasDeLinea.map((obra) => {
    const celdasObra = listaFilas.map((fila) => fila.porObra[obra.id]).filter(Boolean);
    const pendientes = celdasObra.filter((celda) => celda.pendiente > 0).length;
    const enPanol = celdasObra.filter((celda) => celda.enPanol > 0).length;
    const entregados = celdasObra.filter((celda) => celda.egresado > 0).length;
    return {
      ...obra,
      filasCargadas: celdasObra.length,
      pendientes,
      enPanol,
      entregados,
      carga: !matriz.length && !celdasObra.length
        ? "sin_matriz"
        : pendientes > 0
          ? "con_pendientes"
          : "todo_llego",
    };
  });

  return {
    linea,
    lineasDisponibles,
    matrizMateriales: matriz.length,
    obras: obrasConResumen,
    filas: listaFilas,
    resumen: {
      materiales: listaFilas.length,
      matrizMateriales: matriz.length,
      obras: obrasDeLinea.length,
      conPendiente: listaFilas.filter((fila) => fila.totales.pendiente > 0).length,
      sinProveedor: listaFilas.filter((fila) => !fila.proveedor && fila.totales.pendiente > 0).length,
      cubiertos: listaFilas.filter((fila) => fila.totales.pendiente > 0 && fila.enPanolLibre >= fila.totales.pendiente).length,
      aComprar: listaFilas.filter((fila) => fila.faltaComprar > 0).length,
      sinMatriz: matriz.length ? 0 : obrasDeLinea.length,
      rubros: new Set(listaFilas.map((fila) => fila.rubro)).size,
    },
  };
}
