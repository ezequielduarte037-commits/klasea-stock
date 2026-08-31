import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";
import { fetchRequisitoProductos } from "@/features/materiales/productosAsignadosApi";
import { fetchMatrizCondicionantes } from "@/features/materiales/materialesConfig";

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

const SNAPSHOT_SELECT = "id,material_id,requisito_material_id,obra_id,cantidad,cantidad_egresada,estado,source,tipo,tipo_label,es_adicional,especificaciones,recepcion_estado,panol_envio_id,panol_envio_item_id,created_at";
const SNAPSHOT_SELECT_COMPATIBLE = "id,material_id,requisito_material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,panol_envio_id,panol_envio_item_id,created_at";

async function traerLedgerPlanilla() {
  try {
    return await traerTodo("panol_obra_materiales_snapshot", SNAPSHOT_SELECT);
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(" ");
    const esCampoNoDisponible = ["42703", "PGRST204"].includes(String(error?.code || ""))
      || /(?:column|schema cache).*(?:tipo_label|es_adicional|tipo)/i.test(mensaje);
    if (!esCampoNoDisponible) throw error;
    return traerTodo("panol_obra_materiales_snapshot", SNAPSHOT_SELECT_COMPATIBLE);
  }
}

async function traerConfiguracionObras() {
  try {
    return await traerTodo(
      "panol_obra_matriz_condicionantes",
      "obra_id,condicionante_id,activo,notas,created_at,updated_at",
    );
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    if (["42P01", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache/i.test(mensaje)) return [];
    throw error;
  }
}

async function traerExclusionesObras() {
  try {
    return await traerTodo("panol_obra_material_exclusiones", "obra_id,material_id,motivo");
  } catch (error) {
    const mensaje = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
    if (["42P01", "PGRST205"].includes(String(error?.code || "")) || /does not exist|schema cache/i.test(mensaje)) return [];
    throw error;
  }
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
    snapshotId: null,
    configuracionSnapshotId: null,
    avisoPendiente: false,
    productoMaterialId: null,
    productoDefinido: false,
    productoEstandar: false,
    requiereProductoConcreto: false,
    especificaciones: {},
    origenes: [desdeMatriz ? "matriz" : "fuera_matriz"],
    baseRequerido: redondear(cantidad),
    ajusteConfiguracion: 0,
    configuraciones: [],
  };
}

function clasificarOrigenSnapshot(fila) {
  const source = String(fila?.source || "").trim().toLowerCase();
  const tipo = String(fila?.tipo || fila?.tipo_label || "").trim().toLowerCase();

  if (source.includes("condicionante") || tipo.includes("condicionante") || tipo.includes("opcional")) {
    return "opcional";
  }
  if (
    fila?.es_adicional === true
    || source === "addon"
    || tipo === "addon"
    || tipo.includes("adicional")
  ) {
    return "adicional";
  }
  if (
    source.includes("panol")
    || source.includes("pañol")
    || source === "stock_general"
    || source === "remito"
    || source.includes("ingreso_manual")
    || source.includes("egreso_general")
    || source.includes("egreso_directo")
    || source.includes("solicitud")
  ) {
    return "panol";
  }
  return "fuera_matriz";
}

function sumarOrigen(celda, origen) {
  if (!origen) return;
  celda.origenes = [...new Set([...(celda.origenes || []), origen])];
  if (celda.origenes.length > 1) {
    celda.origenes = celda.origenes.filter((item) => item !== "fuera_matriz");
  }
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
  const [materiales, modelos, obras, ledger, rubros, imagenesRows, condicionantesRes, configuracionObras, exclusionesObras] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,alias,codigo,codigo_barra,proveedor,unidad_medida,categoria_id,es_consumible,es_requisito,activo,imagen_url,notas"),
    traerTodo("panol_material_modelo", "material_id,modelo,cantidad,variante,producto_predeterminado_id"),
    traerTodo("produccion_obras", "id,codigo,linea_nombre,estado,fecha_inicio"),
    traerLedgerPlanilla(),
    traerRubros(),
    traerTodo("panol_material_imagenes", "material_id,url,created_at"),
    fetchMatrizCondicionantes(),
    traerConfiguracionObras(),
    traerExclusionesObras(),
  ]);

  const porMaterial = new Map(materiales.filter((m) => m.activo !== false).map((m) => [m.id, m]));
  const imagenes = new Map();
  for (const imagen of imagenesRows) {
    if (imagen.material_id && imagen.url && !imagenes.has(imagen.material_id)) {
      imagenes.set(imagen.material_id, imagen.url);
    }
  }
  const modeloElegido = normalizarModelo(linea);
  const matrizBase = modelos
    .filter((row) => normalizarModelo(row.modelo) === modeloElegido)
    .filter((row) => String(row.variante || "standard").toLowerCase() === "standard")
    .filter((row) => Number(row.cantidad || 0) > 0)
    .filter((row) => porMaterial.has(row.material_id));

  const lineasDisponibles = [...new Set(
    obras.map((o) => String(o.linea_nombre || "").trim()).filter(Boolean),
  )].sort();

  const obrasDeLinea = obras
    .filter((o) => normalizarModelo(o.linea_nombre) === modeloElegido)
    .filter((o) => o.estado === "activa")
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  const idsDeObra = new Set(obrasDeLinea.map((o) => o.id));

  const condicionantesLinea = (condicionantesRes?.condicionantes ?? [])
    .filter((condicionante) => condicionante.activo !== false)
    .filter((condicionante) => normalizarModelo(condicionante.modelo) === modeloElegido)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  const configuracionPorObra = new Map(
    configuracionObras
      .filter((row) => idsDeObra.has(row.obra_id))
      .map((row) => [`${row.obra_id}|${row.condicionante_id}`, row]),
  );
  const exclusionesPorObra = new Map();
  for (const exclusion of exclusionesObras) {
    if (!idsDeObra.has(exclusion.obra_id) || !exclusion.material_id) continue;
    const ids = exclusionesPorObra.get(exclusion.obra_id) ?? new Set();
    ids.add(exclusion.material_id);
    exclusionesPorObra.set(exclusion.obra_id, ids);
  }
  const condicionanteActivo = (obraId, condicionante) => {
    const override = configuracionPorObra.get(`${obraId}|${condicionante.id}`);
    return override ? override.activo === true : condicionante.activo_por_defecto === true;
  };

  // Cada obra obtiene su matriz efectiva: base + configuraciones activas.
  // Los ajustes pueden agregar, quitar o modificar cantidades sin alterar la
  // matriz de las demás obras.
  const matrizPorObra = new Map();
  const matrizPorRequisito = new Map();
  for (const obra of obrasDeLinea) {
    const exclusiones = exclusionesPorObra.get(obra.id) ?? new Set();
    const items = new Map(
      matrizBase
        .filter((row) => !exclusiones.has(row.material_id))
        .map((row) => [row.material_id, {
          ...row,
          cantidad: redondear(row.cantidad),
          baseCantidad: redondear(row.cantidad),
          ajusteConfiguracion: 0,
          ajustesConfiguracion: [],
          origenes: ["matriz"],
          soloConfiguracion: false,
        }]),
    );

    for (const condicionante of condicionantesLinea) {
      if (!condicionanteActivo(obra.id, condicionante)) continue;
      for (const item of condicionante.items ?? []) {
        if (item.activo === false || !item.material_id || !porMaterial.has(item.material_id)) continue;
        const cantidad = Math.abs(Number(item.cantidad ?? 1) || 1);
        const delta = item.tipo_item === "quita" ? -cantidad : cantidad;
        const ajuste = {
          id: item.id,
          configuracionId: condicionante.id,
          nombre: condicionante.nombre,
          delta: redondear(delta),
        };
        const existente = items.get(item.material_id);
        if (existente) {
          const siguiente = redondear(Math.max(0, Number(existente.cantidad || 0) + delta));
          if (siguiente <= 0) {
            items.delete(item.material_id);
          } else {
            items.set(item.material_id, {
              ...existente,
              cantidad: siguiente,
              ajusteConfiguracion: redondear(Number(existente.ajusteConfiguracion || 0) + delta),
              ajustesConfiguracion: [...(existente.ajustesConfiguracion || []), ajuste],
              origenes: [...new Set([...(existente.origenes || []), "opcional"])],
            });
          }
        } else if (delta > 0) {
          items.set(item.material_id, {
            material_id: item.material_id,
            modelo: modeloElegido,
            cantidad: redondear(delta),
            baseCantidad: 0,
            ajusteConfiguracion: redondear(delta),
            ajustesConfiguracion: [ajuste],
            variante: "standard",
            producto_predeterminado_id: null,
            origenes: ["opcional"],
            soloConfiguracion: true,
          });
        }
      }
    }

    const filasObra = [...items.values()];
    matrizPorObra.set(obra.id, filasObra);
    for (const item of filasObra) {
      if (!matrizPorRequisito.has(item.material_id)) matrizPorRequisito.set(item.material_id, item);
    }
  }

  const productosCompatibles = await fetchRequisitoProductos([...matrizPorRequisito.keys()]);
  const requisitosConProductos = new Set(productosCompatibles.map((row) => row.requisito_material_id));

  // Una FAMILIA es un requisito y todos los productos concretos que lo cumplen:
  // 'TV 24"' junto a 'TV 24" · Samsung', '· LG' y '· Noblex DB24X4000'.
  //
  // El sistema los guardaba como cuatro materiales sin relacion, asi que pedia
  // comprar un Samsung mientras habia ocho TV 24" y dos Noblex libres en el
  // pañol. No es un caso aislado: en K37 son 22 familias y 175 unidades que se
  // pedian de mas, y en K52 son 313.
  const raizDeFamilia = new Map();
  const miembrosDeFamilia = new Map();
  for (const row of productosCompatibles) {
    const raiz = row.requisito_material_id;
    if (!raiz || !row.producto_material_id) continue;
    if (!miembrosDeFamilia.has(raiz)) miembrosDeFamilia.set(raiz, new Set([raiz]));
    miembrosDeFamilia.get(raiz).add(row.producto_material_id);
    raizDeFamilia.set(row.producto_material_id, raiz);
    raizDeFamilia.set(raiz, raiz);
  }

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
    for (const item of matrizPorObra.get(obra.id) ?? []) {
      const requisitoId = item.material_id;
      const snapshots = snapshotPorRequisitoObra.get(`${requisitoId}|${obra.id}`) ?? [];
      const snapshotConProducto = snapshots.find((row) => row.material_id && row.material_id !== requisitoId) || null;
      const productoId = snapshotConProducto?.material_id || item.producto_predeterminado_id || requisitoId;
      const clave = `${productoId}|${obra.id}`;
      const celda = celdaVacia(item.cantidad, requisitoId, true);
      celda.baseRequerido = redondear(item.baseCantidad);
      celda.ajusteConfiguracion = redondear(item.ajusteConfiguracion);
      celda.configuraciones = item.ajustesConfiguracion ?? [];
      celda.origenes = item.origenes?.length ? [...item.origenes] : ["matriz"];
      celda.configuracionSnapshotId = snapshotConProducto?.id || snapshots.find((row) => row.id)?.id || null;
      celda.productoMaterialId = productoId !== requisitoId ? productoId : null;
      celda.productoDefinido = productoId !== requisitoId;
      celda.productoEstandar = !snapshotConProducto && !!item.producto_predeterminado_id;
      celda.requiereProductoConcreto = porMaterial.get(requisitoId)?.es_requisito === true
        || requisitosConProductos.has(requisitoId);
      // Preguntar "que modelo lleva" cuando el pañol ya tiene uno de la familia
      // es hacer elegir algo que en la practica ya esta resuelto: se retira lo
      // que hay. El cartel vuelve solo si el stock se agota.
      if (celda.requiereProductoConcreto && !celda.productoDefinido) {
        let libreFamilia = 0;
        for (const id of miembrosDeFamilia.get(requisitoId) ?? [requisitoId]) {
          libreFamilia += Math.max(0, stockLibre.get(id) || 0);
        }
        if (libreFamilia >= Number(item.cantidad || 0)) celda.requiereProductoConcreto = false;
      }
      celda.especificaciones = snapshotConProducto?.especificaciones
        || snapshots.find((row) => row.especificaciones)?.especificaciones
        || {};
      if (snapshots.length) {
        const disponiblesParaAviso = snapshots
          .filter((row) => ESTADOS_PENDIENTE.has(row.estado) && !row.panol_envio_item_id)
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        celda.snapshotId = disponiblesParaAviso[0]?.id || null;
        celda.avisoPendiente = snapshots.some((row) => (
          !!row.panol_envio_item_id
          && !["recibido", "parcial", "rechazado"].includes(String(row.recepcion_estado || "").toLowerCase())
        ));
        celda.egresado = 0;
        celda.enPanol = 0;
        celda.pendiente = 0;
        for (const fila of snapshots) sumarEstado(celda, fila);
        if (!item.soloConfiguracion && celda.pendiente > 0 && item.ajusteConfiguracion) {
          celda.pendiente = redondear(Math.max(0, celda.pendiente + item.ajusteConfiguracion));
        }
      }
      const existente = celdas.get(clave);
      if (existente) {
        existente.requerido = redondear(existente.requerido + celda.requerido);
        existente.egresado = redondear(existente.egresado + celda.egresado);
        existente.enPanol = redondear(existente.enPanol + celda.enPanol);
        existente.pendiente = redondear(existente.pendiente + celda.pendiente);
        existente.snapshotId = existente.snapshotId || celda.snapshotId;
        existente.configuracionSnapshotId = existente.configuracionSnapshotId || celda.configuracionSnapshotId;
        existente.avisoPendiente = existente.avisoPendiente || celda.avisoPendiente;
        existente.productoMaterialId = existente.productoMaterialId || celda.productoMaterialId;
        existente.productoDefinido = existente.productoDefinido || celda.productoDefinido;
        existente.productoEstandar = existente.productoEstandar || celda.productoEstandar;
        existente.requiereProductoConcreto = existente.requiereProductoConcreto || celda.requiereProductoConcreto;
        existente.baseRequerido = redondear(existente.baseRequerido + celda.baseRequerido);
        existente.ajusteConfiguracion = redondear(existente.ajusteConfiguracion + celda.ajusteConfiguracion);
        existente.configuraciones = [...(existente.configuraciones || []), ...(celda.configuraciones || [])];
        existente.especificaciones = Object.keys(existente.especificaciones || {}).length
          ? existente.especificaciones
          : celda.especificaciones;
        for (const origen of celda.origenes || []) sumarOrigen(existente, origen);
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
    sumarOrigen(celda, clasificarOrigenSnapshot(fila));
    if (ESTADOS_PENDIENTE.has(fila.estado) && !fila.panol_envio_item_id) celda.snapshotId = celda.snapshotId || fila.id;
    if (fila.panol_envio_item_id && !["recibido", "parcial", "rechazado"].includes(String(fila.recepcion_estado || "").toLowerCase())) {
      celda.avisoPendiente = true;
    }
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
    // Los consumibles no son materiales de barco: son insumos de taller -trapo,
    // lija, guantes, cinta- que aparecian con "comprar 1" cada uno y solo
    // ensuciaban la planilla. Se sacan de las filas, no del catalogo: el
    // selector de materiales los sigue teniendo por si hay que cargar uno.
    if (material.es_consumible === true) continue;
    const celda = {
      requerido: redondear(celdaRaw.requerido),
      egresado: redondear(celdaRaw.egresado),
      enPanol: redondear(celdaRaw.enPanol),
      pendiente: redondear(celdaRaw.pendiente),
      desdeMatriz: celdaRaw.desdeMatriz,
      requisitoId: celdaRaw.requisitoId,
      snapshotId: celdaRaw.snapshotId || null,
      configuracionSnapshotId: celdaRaw.configuracionSnapshotId || null,
      avisoPendiente: celdaRaw.avisoPendiente === true,
      productoMaterialId: celdaRaw.productoMaterialId || null,
      productoDefinido: celdaRaw.productoDefinido === true,
      productoEstandar: celdaRaw.productoEstandar === true,
      requiereProductoConcreto: celdaRaw.requiereProductoConcreto === true,
      especificaciones: celdaRaw.especificaciones || {},
      origenes: celdaRaw.origenes?.length ? celdaRaw.origenes : [celdaRaw.desdeMatriz ? "matriz" : "fuera_matriz"],
      baseRequerido: redondear(celdaRaw.baseRequerido),
      ajusteConfiguracion: redondear(celdaRaw.ajusteConfiguracion),
      configuraciones: celdaRaw.configuraciones || [],
    };

    if (!filas.has(materialId)) {
      filas.set(materialId, {
        id: materialId,
        requisitoId: celda.requisitoId,
        ...materialMeta(material, rubros, imagenes),
        enPanolLibre: redondear(Math.max(0, stockLibre.get(materialId) || 0)),
        reservado: redondear(Math.max(0, stockReservado.get(materialId) || 0)),
        porObra: {},
        origenes: [],
        totales: { requerido: 0, egresado: 0, enPanol: 0, pendiente: 0 },
      });
    }
    const fila = filas.get(materialId);
    fila.porObra[obraId] = celda;
    fila.origenes = [...new Set([...(fila.origenes || []), ...(celda.origenes || [])])];
    for (const campo of ["requerido", "egresado", "enPanol", "pendiente"]) {
      fila.totales[campo] = redondear(fila.totales[campo] + celda[campo]);
    }
  }

  // Lo libre de la familia entera, contando tambien a los miembros que no
  // tienen fila en esta linea: su stock igual sirve para cubrir la necesidad.
  const libreDeFamilia = new Map();
  for (const [raiz, miembros] of miembrosDeFamilia) {
    let total = 0;
    for (const id of miembros) total += Math.max(0, stockLibre.get(id) || 0);
    libreDeFamilia.set(raiz, redondear(total));
  }

  for (const fila of filas.values()) {
    fila.origenPrincipal = ["matriz", "opcional", "adicional", "panol", "fuera_matriz"]
      .find((origen) => fila.origenes.includes(origen)) || "fuera_matriz";
    fila.familiaId = raizDeFamilia.get(fila.id) || null;
    fila.enPanolLibreFamilia = fila.familiaId ? (libreDeFamilia.get(fila.familiaId) ?? fila.enPanolLibre) : fila.enPanolLibre;
  }

  // Fuera de una familia la cuenta es la de siempre.
  for (const fila of filas.values()) {
    if (fila.familiaId) continue;
    fila.faltaComprar = redondear(Math.max(0, fila.totales.pendiente - fila.enPanolLibre));
  }

  // Dentro de una familia se calcula UNA vez sobre el total y despues se
  // reparte, proporcional a lo que cada fila espera. Si se calculara fila por
  // fila, el mismo stock cubriria a todas y la suma daria de menos; y si no se
  // repartiera, el numero aparecería donde no se necesita.
  const filasDeFamilia = new Map();
  for (const fila of filas.values()) {
    if (!fila.familiaId) continue;
    if (!filasDeFamilia.has(fila.familiaId)) filasDeFamilia.set(fila.familiaId, []);
    filasDeFamilia.get(fila.familiaId).push(fila);
  }
  for (const [raiz, grupo] of filasDeFamilia) {
    const pendiente = grupo.reduce((suma, fila) => suma + (Number(fila.totales.pendiente) || 0), 0);
    const libre = libreDeFamilia.get(raiz) ?? 0;
    const comprar = Math.max(0, pendiente - libre);
    for (const fila of grupo) {
      const parte = pendiente > 0 ? (Number(fila.totales.pendiente) || 0) / pendiente : 0;
      fila.faltaComprar = redondear(comprar * parte);
      fila.cubiertoPorFamilia = comprar === 0 && (Number(fila.totales.pendiente) || 0) > 0;
    }
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
    const opcionesPendientes = celdasObra.filter((celda) => celda.requiereProductoConcreto && !celda.productoDefinido).length;
    return {
      ...obra,
      filasCargadas: celdasObra.length,
      pendientes,
      enPanol,
      entregados,
      opcionesPendientes,
      carga: !matrizBase.length && !celdasObra.length
        ? "sin_matriz"
        : pendientes > 0
          ? "con_pendientes"
          : "todo_llego",
    };
  });

  return {
    linea,
    lineasDisponibles,
    matrizMateriales: matrizBase.length,
    obras: obrasConResumen,
    filas: listaFilas,
    catalogo: [...porMaterial.values()].map((material) => ({
      ...material,
      imagen_url: material.imagen_url || imagenes.get(material.id) || "",
    })),
    productosCompatibles,
    resumen: {
      materiales: listaFilas.length,
      matrizMateriales: matrizBase.length,
      obras: obrasDeLinea.length,
      conPendiente: listaFilas.filter((fila) => fila.totales.pendiente > 0).length,
      sinProveedor: listaFilas.filter((fila) => !fila.proveedor && fila.totales.pendiente > 0).length,
      cubiertos: listaFilas.filter((fila) => fila.totales.pendiente > 0 && fila.enPanolLibre >= fila.totales.pendiente).length,
      aComprar: listaFilas.filter((fila) => fila.faltaComprar > 0).length,
      sinMatriz: matrizBase.length ? 0 : obrasDeLinea.length,
      rubros: new Set(listaFilas.map((fila) => fila.rubro)).size,
      opcionesPendientes: listaFilas.reduce((total, fila) => total + Object.values(fila.porObra)
        .filter((celda) => celda.requiereProductoConcreto && !celda.productoDefinido).length, 0),
      origenes: Object.fromEntries(
        ["matriz", "opcional", "adicional", "panol", "fuera_matriz"]
          .map((origen) => [origen, listaFilas.filter((fila) => fila.origenes.includes(origen)).length]),
      ),
    },
  };
}

export async function marcarAvisoPlanillaComoComprado(envioId) {
  if (!envioId) return 0;
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id,estado,recepcion_estado")
    .eq("panol_envio_id", envioId);
  if (error) throw error;

  const ids = (data ?? [])
    .filter((row) => row.estado !== "egresado")
    .filter((row) => !["recibido", "parcial"].includes(String(row.recepcion_estado || "").toLowerCase()))
    .map((row) => row.id)
    .filter(Boolean);
  if (!ids.length) return 0;

  const { error: updateError } = await supabase
    .from("panol_obra_materiales_snapshot")
    .update({ estado: "comprado" })
    .in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}
