import { supabase } from "@/supabaseClient";
import { calcularPlanillaDeLinea, cargarBasePlanilla } from "@/features/compras/planillaObrasApi";
import { claveProveedor, normalizarTexto } from "./calendario";

// Tablas de 20261103200000_compras_calendario.sql y 20261105120000 (semana de
// compra por proveedor).

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
// Laminación y madera van por su propio circuito de pedidos, y los consumibles
// los pide el pañol a Rebollar: no son parte del calendario de Compras.
const RUBROS_FUERA = new Set(["laminacion", "maderas"]);
// Desde cuándo hay registro confiable de llegadas: para sugerir semanas sólo
// sirven los barcos desmoldados después (antes, todo figura "llegado tarde").
const DESMOLDE_DESDE_PARA_SUGERIR = "2026-06-15";

async function traerTodo(construir) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await construir().range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

async function traerOpcional(tabla, select) {
  const { data, error } = await supabase.from(tabla).select(select).limit(5000);
  if (error) {
    // 42703: falta la columna (la base todavía no tiene la última migración).
    if (["42P01", "PGRST205", "42703"].includes(error.code)) return { filas: [], falta: true };
    throw error;
  }
  return { filas: data ?? [], falta: false };
}

function lineaDe(lineaNombre) {
  const m = String(lineaNombre || "").toUpperCase().match(/^K(\d+)$/);
  return m ? m[1] : null;
}

/**
 * Lo que falta comprar sale de la planilla de cada línea, la misma cuenta que
 * muestra la lista de la obra (configuraciones, exclusiones, modelo elegido,
 * familias de productos, lo pedido y lo avisado). Así, cuando se hace el aviso
 * de ingreso de un pedido, desaparece de acá y de la lista a la vez.
 */
export async function cargarDatosCalendario() {
  const base = cargarBasePlanilla({ obrasSelect: "id,codigo,linea_nombre,estado,fecha_inicio,desmolde_real,desmolde_estimado" });
  const [{ obras: obrasRaw, materiales, modelos }, rubrosCfg, itemsCfg, proveedoresCfg] = await Promise.all([
    base,
    traerOpcional("compras_calendario_rubros", "linea,categoria_id,semana,updated_at"),
    traerOpcional("compras_calendario_items", "linea,material_id,semana,nota"),
    traerOpcional("compras_plazos_proveedor", "proveedor,nombre,semana"),
  ]);

  const catalogo = new Map(materiales.map((m) => [m.id, m]));
  const lineasConMatriz = new Set(modelos.map((m) => String(m.modelo).toUpperCase().replace(/^K/, "")));
  const desmoldeDe = new Map(obrasRaw.map((o) => [o.id, o.desmolde_real || o.desmolde_estimado || null]));
  const lineas = [...new Set(obrasRaw.filter((o) => o.estado === "activa").map((o) => lineaDe(o.linea_nombre)).filter(Boolean))]
    .filter((l) => lineasConMatriz.has(l))
    .sort();

  const planillas = await Promise.all(lineas.map((l) => calcularPlanillaDeLinea(`K${l}`, { base, sinSecundarios: true })));

  const necesidades = [];
  const libre = new Map();
  const matriz = [];
  const obras = [];
  let cubiertas = 0;
  let fueraDelCalendario = 0;
  planillas.forEach((planilla, i) => {
    const linea = lineas[i];
    const obraPorId = new Map();
    for (const o of planilla.obras) {
      const obra = { id: o.id, codigo: o.codigo, linea, desmolde: desmoldeDe.get(o.id) || null };
      obraPorId.set(o.id, obra);
      obras.push(obra);
    }
    for (const fila of planilla.filas) {
      if (fila.secundario || fila.esConsumible) continue;
      const mat = catalogo.get(fila.id);
      const rubro = fila.rubro || "Sin rubro";
      if (RUBROS_FUERA.has(normalizarTexto(rubro))) { fueraDelCalendario += 1; continue; }
      const celdas = Object.entries(fila.porObra).filter(([, c]) => c.desdeMatriz);
      if (!celdas.length) continue;
      matriz.push({ linea, material_id: fila.id, categoria_id: mat?.categoria_id || null, rubro, proveedor: String(fila.proveedor || "").trim() });
      const libreKey = fila.familiaId || fila.id;
      if (!libre.has(libreKey)) libre.set(libreKey, Number(fila.enPanolLibreFamilia ?? fila.enPanolLibre) || 0);
      for (const [obraId, c] of celdas) {
        const obra = obraPorId.get(obraId);
        if (!obra) continue;
        if (!(Number(c.pendiente) > 0) || c.avisoPendiente || c.pedidoAbierto) { cubiertas += 1; continue; }
        const productoId = c.productoMaterialId || fila.id;
        const producto = catalogo.get(productoId);
        necesidades.push({
          linea,
          filaId: fila.id,
          material_id: productoId,
          requisito_material_id: c.requisitoId || fila.requisitoId || fila.id,
          snapshotId: c.snapshotId || null,
          descripcion: producto?.descripcion || fila.descripcion,
          codigo: producto?.codigo || fila.codigo || "",
          unidad: producto?.unidad_medida || fila.unidad || "unidad",
          proveedor: String(producto?.proveedor || fila.proveedor || "").trim(),
          categoria_id: mat?.categoria_id || null,
          rubro,
          obraId,
          obra: obra.codigo,
          desmolde: obra.desmolde,
          cantidad: Number(c.pendiente),
          sinModelo: c.requiereProductoConcreto === true && c.productoDefinido !== true,
          libreKey,
        });
      }
    }
  });

  // Historia para sugerir semanas: cuándo llegó cada ítem de la matriz en los
  // barcos desmoldados desde que hay registro.
  const obrasHistoria = obras.filter((o) => o.desmolde && o.desmolde >= DESMOLDE_DESDE_PARA_SUGERIR);
  const ledger = obrasHistoria.length
    ? await traerTodo(() => supabase.from("panol_obra_materiales_snapshot").select("obra_id,material_id,requisito_material_id,created_at").in("estado", LEDGER_STATES).neq("source", "matriz").in("obra_id", obrasHistoria.map((o) => o.id)))
    : [];
  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const matrizPorLinea = new Map();
  for (const m of matriz) {
    if (!matrizPorLinea.has(m.linea)) matrizPorLinea.set(m.linea, new Map());
    matrizPorLinea.get(m.linea).set(m.material_id, m);
  }
  const primeraLlegada = new Map();
  for (const r of ledger) {
    for (const id of new Set([r.material_id, r.requisito_material_id])) {
      if (!id) continue;
      const k = `${r.obra_id}|${id}`;
      const prev = primeraLlegada.get(k);
      if (!prev || r.created_at < prev) primeraLlegada.set(k, r.created_at);
    }
  }
  const llegadas = [];
  for (const [k, at] of primeraLlegada) {
    const [obraId, matId] = k.split("|");
    const obra = obraPorId.get(obraId);
    const item = obra && matrizPorLinea.get(obra.linea)?.get(matId);
    if (!item) continue;
    const semanas = (new Date(at) - new Date(`${obra.desmolde}T00:00:00`)) / (7 * 86400000);
    llegadas.push({ linea: obra.linea, categoria_id: item.categoria_id, semanas });
  }

  return {
    obras,
    matriz,
    necesidades,
    libre,
    cubiertas,
    llegadas,
    semanasRubro: new Map(rubrosCfg.filas.map((r) => [`${r.linea}|${r.categoria_id}`, r.semana])),
    semanasItem: new Map(itemsCfg.filas.map((r) => [`${r.linea}|${r.material_id}`, r.semana])),
    semanasProveedor: new Map(proveedoresCfg.filas.filter((r) => r.semana != null).map((r) => [r.proveedor, r.semana])),
    fueraDelCalendario,
    sinMigracion: rubrosCfg.falta || itemsCfg.falta || proveedoresCfg.falta,
  };
}

export async function guardarSemanaRubro(linea, categoriaId, semana) {
  const q = semana == null
    ? supabase.from("compras_calendario_rubros").delete().eq("linea", linea).eq("categoria_id", categoriaId)
    : supabase.from("compras_calendario_rubros").upsert({ linea, categoria_id: categoriaId, semana }, { onConflict: "linea,categoria_id" });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarSemanasRubro(filas = []) {
  if (!filas.length) return;
  const { error } = await supabase.from("compras_calendario_rubros").upsert(filas, { onConflict: "linea,categoria_id" });
  if (error) throw error;
}

export async function guardarSemanaItem(linea, materialId, semana) {
  const q = semana == null
    ? supabase.from("compras_calendario_items").delete().eq("linea", linea).eq("material_id", materialId)
    : supabase.from("compras_calendario_items").upsert({ linea, material_id: materialId, semana }, { onConflict: "linea,material_id" });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarSemanaProveedor(nombre, semana) {
  const proveedor = claveProveedor(nombre);
  if (!proveedor) return;
  const q = semana == null
    ? supabase.from("compras_plazos_proveedor").delete().eq("proveedor", proveedor)
    : supabase.from("compras_plazos_proveedor").upsert({ proveedor, nombre: String(nombre).trim(), semana }, { onConflict: "proveedor" });
  const { error } = await q;
  if (error) throw error;
}
