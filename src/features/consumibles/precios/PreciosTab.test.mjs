import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { normalizarLista } from "./normalizarLista.js";
import { leerExcel } from "./leerExcel.js";
import { armarItemsLista, compararCostos, fechaValida, filtrarComparacion, heredarMateriales, listaAnterior,
  mismoProveedor, numeroPrecio, pesos, planDeCostos, puedeGestionarPrecios, resumenComparacion } from "./preciosLogica.js";
import { crearPreciosRepositorio } from "./preciosRepositorio.js";

const producto = (codigo, costo, extra = {}) => ({ codigo, descripcion: `Producto ${codigo}`, precio: costo,
  moneda: "ARS", condicion: "+IVA", costo_ars: costo, medida: null, unidad_compra: "unidad", contenido: 1, ...extra });
const lista = (id, fecha, proveedor = "Rebollar", extra = {}) => ({ id, vigente_desde: fecha,
  proveedor_nombre: proveedor, created_at: `${fecha}T12:00:00Z`, ...extra });

test("permisos: admin, compras y técnica; pañol y oficina consultan", () => {
  for (const role of ["admin", "compras", "tecnica"]) assert.equal(puedeGestionarPrecios({ role }), true);
  for (const role of ["panol", "oficina", "cliente", undefined]) assert.equal(puedeGestionarPrecios({ role }), false);
  assert.equal(puedeGestionarPrecios({ role: "oficina", is_admin: true }), true);
});

test("no convierte campos vacíos a cero y acepta el dólar con coma argentina", () => {
  for (const valor of [null, undefined, "", " ", "Infinity", "NaN"]) assert.equal(numeroPrecio(valor), null);
  assert.equal(numeroPrecio("1.450,50"), 1450.5);
  assert.equal(numeroPrecio(0), 0);
  assert.equal(pesos(null), "—");
  assert.equal(fechaValida("2026-02-30"), false);
  assert.equal(fechaValida("2026-10-08"), true);
});

test("busca la lista inmediatamente anterior por proveedor, vigencia y hora", () => {
  const listas = [lista("futura", "2026-11-01"), lista("otra", "2026-10-08", "Otro"), lista("vieja", "2026-09-01"),
    lista("misma", "2026-10-08", "Rebollar", { created_at: "2026-10-08T13:00:00Z" }), lista("actual", "2026-10-08", "Rebollar", { created_at: "2026-10-08T14:00:00Z" })];
  assert.equal(listaAnterior(listas, listas[4]).id, "misma");
  assert.equal(listaAnterior(listas, lista("retroactiva", "2026-09-15")).id, "vieja");
  assert.equal(listaAnterior(listas, lista("primera", "2026-01-01")), null);
  assert.equal(mismoProveedor({ proveedor_nombre: "  TÉCNICA  Sur " }, { proveedor_nombre: "tecnica sur" }), true);
  assert.equal(mismoProveedor({ proveedor_id: "a", proveedor_nombre: "Igual" }, { proveedor_id: "b", proveedor_nombre: "Igual" }), false);
});

test("hereda sólo el vínculo del mismo código y sólo persiste columnas del esquema", () => {
  const originales = [producto("001", 100, { fila: 4, granel: true }), producto("nuevo", 3)];
  const heredadas = heredarMateriales(originales, [producto("001", 50, { material_id: "m1" })]);
  assert.equal(heredadas[0].material_id, "m1");
  assert.equal(heredadas[1].material_id, null);
  assert.equal(originales[0].material_id, undefined);
  const items = armarItemsLista(originales, "l1", [producto("001", 50, { material_id: "m1" })]);
  assert.equal(items[0].lista_id, "l1");
  assert.equal(items[0].material_id, "m1");
  assert.equal("granel" in items[0], false);
  assert.equal("fila" in items[0], false);
});

test("compara todos los estados sobre ARS, incluso cambios de moneda", () => {
  const antes = [producto("sube", 100), producto("baja", 200), producto("igual", 300), producto("fuera", 20),
    producto("usd", 1500, { precio: 1, moneda: "USD" })];
  const ahora = [producto("sube", 125), producto("baja", 100), producto("igual", 300), producto("entra", 20), producto("usd", 1800, { precio: 1, moneda: "USD" })];
  const filas = compararCostos(antes, ahora);
  assert.deepEqual(Object.fromEntries(filas.map((r) => [r.codigo, r.estado])), { sube: "subio", baja: "bajo", igual: "igual", entra: "nuevo", usd: "subio", fuera: "discontinuado" });
  assert.equal(filas.find((r) => r.codigo === "usd").pct, 20);
  assert.equal(resumenComparacion(filas).mediana, 22.5);
});

test("costo ausente no es igual; suba desde cero cuenta sin inventar porcentaje", () => {
  const filas = compararCostos([producto("sin", null, { precio: 1, moneda: "USD" }), producto("cero", 0), producto("ambos", 0)],
    [producto("sin", 1400, { precio: 1, moneda: "USD" }), producto("cero", 20), producto("ambos", 0)]);
  assert.equal(filas[0].estado, "sin_costo");
  assert.equal(filas[0].antes, null);
  assert.equal(filas[0].pct, null);
  assert.equal(filas[1].estado, "subio");
  assert.equal(filas[1].pct, null);
  assert.equal(filas[2].estado, "igual");
  assert.equal(resumenComparacion(filas).subio, 1);
  assert.equal(resumenComparacion(filas).mediana, null);
});

test("respeta la tolerancia del normalizador y calcula mediana impar", () => {
  const filas = compararCostos([producto("redondeo", 100), producto("a", 100), producto("b", 100), producto("c", 100)],
    [producto("redondeo", 100.04), producto("a", 110), producto("b", 140), producto("c", 120)]);
  assert.equal(filas[0].estado, "igual");
  assert.equal(resumenComparacion(filas).mediana, 20);
});

test("filtra sin tildes y ordena porcentajes con nulos al final en ambas direcciones", () => {
  const filas = [{ codigo: "10", descripcion: "Técnica", estado: "subio", pct: 12 },
    { codigo: "2", descripcion: "Técnica", estado: "subio", pct: 3 }, { codigo: "1", descripcion: "Otro", estado: "nuevo", pct: null }];
  assert.deepEqual(filtrarComparacion(filas, { busqueda: "tecnica", orden: "codigo" }).map((r) => r.codigo), ["2", "10"]);
  assert.deepEqual(filtrarComparacion(filas, { orden: "pct", descendente: true }).map((r) => r.codigo), ["10", "2", "1"]);
  assert.deepEqual(filtrarComparacion(filas, { orden: "pct" }).map((r) => r.codigo), ["2", "10", "1"]);
  assert.equal(filtrarComparacion(filas, { estado: "nuevo" }).length, 1);
});

test("Excel: elige la hoja de lista, conserva códigos con ceros, USD y notas", async () => {
  const hoja = XLSX.utils.aoa_to_sheet([["Precios vigentes al 08/10/2026"], ["Código", "Descripción", "Unidad / Medida", "Precio unitario", "Moneda", "Condición"],
    [123, "Guantes x100unid", "L", 10, "USD", "+IVA"], ["A2", "Aguarrás x4Lts", null, 1000, "$", "Final"], ["Nota al pie: entrega a coordinar"]]);
  hoja.A3.z = "000000";
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Resumen"]]), "Resumen");
  XLSX.utils.book_append_sheet(libro, hoja, "Lista de precios");
  const bytes = XLSX.write(libro, { type: "array", bookType: "xlsx" });
  const leida = await leerExcel(bytes);
  const vista = normalizarLista(leida.filas, { dolar: 1450 });
  assert.equal(leida.hoja, "Lista de precios");
  assert.equal(vista.renglones[0].codigo, "000123");
  assert.equal(vista.renglones[0].costo_ars, 14500);
  assert.equal(vista.renglones[1].costo_ars, 1000);
  assert.equal(vista.notas.length, 1);
  assert.equal(vista.vigenteDesde, "2026-10-08");
  assert.equal(vista.avisos.length, 0);
});

test("Excel sin encabezado informa el problema y no ofrece renglones para cargar", async () => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Sin lista"]]), "Hoja 1");
  await assert.rejects(leerExcel(XLSX.write(libro, { type: "array", bookType: "xlsx" })), /encabezados/);
});

test("plan: usa factor, ausencia de factor y costo cero; excluye materiales no consumibles", () => {
  const items = [producto("a", 1000, { id: "i1", material_id: "m1" }), producto("b", 120, { id: "i2", material_id: "m2" }),
    producto("c", 0, { id: "i3", material_id: "m3" }), producto("d", 2, { id: "i4", material_id: "obra" }), producto("e", null, { id: "i5", material_id: "m5" }), producto("f", 20)];
  const plan = planDeCostos(items, [{ material_id: "m1", factor_compra: 100 }], ["m1", "m2", "m3", "m5"].map((id) => ({ id, es_consumible: true })));
  assert.deepEqual(plan.actualizaciones.map((r) => r.costo_unitario_ars), [10, 120, 0]);
  assert.equal(plan.actualizaciones[1].sin_factor, true);
  assert.equal(plan.omitidos.length, 2);
});

test("plan: no elige arbitrariamente entre dos códigos del mismo consumible", () => {
  const plan = planDeCostos([producto("a", 2, { id: "i1", material_id: "m1" }), producto("b", 3, { id: "i2", material_id: "m1" })], [], [{ id: "m1", es_consumible: true }]);
  assert.deepEqual(plan.repetidos, ["m1"]);
  assert.equal(plan.actualizaciones.length, 0);
});

test("plan: rechaza factores inválidos y valores infinitos", () => {
  const items = [producto("a", 10, { id: "i1", material_id: "m1" }), producto("b", Infinity, { id: "i2", material_id: "m2" })];
  const plan = planDeCostos(items, [{ material_id: "m1", factor_compra: 0 }], ["m1", "m2"].map((id) => ({ id, es_consumible: true })));
  assert.equal(plan.actualizaciones.length, 0);
  assert.equal(plan.omitidos.length, 2);
});

// Este doble mantiene datos sólo en memoria. Permite simular que una respuesta
// se pierde después de guardar, una caída a mitad del lote o un cambio de ficha.
function baseFalsa(inicial = {}, { manager = true, fallar = () => null } = {}) {
  const tablas = structuredClone({ consumibles_listas: [], consumibles_lista_items: [], consumibles_config: [], panol_materiales: [], profiles: [], ...inicial });
  const llamadas = [];
  let secuencia = 0;
  const cliente = {
    auth: { getUser: async () => ({ data: { user: { id: "usuario" } } }) },
    rpc: async () => ({ data: manager, error: null }),
    from(tabla) {
      let operacion = "select";
      let payload;
      let opciones = {};
      let rango;
      let unica = false;
      const filtros = [];
      const ordenes = [];
      const consulta = {
        select() { return consulta; },
        eq(campo, valor) { filtros.push((r) => r[campo] === valor); return consulta; },
        is(campo, valor) { filtros.push((r) => (r[campo] ?? null) === valor); return consulta; },
        in(campo, valores) { filtros.push((r) => valores.includes(r[campo])); return consulta; },
        order(campo, opts = {}) { ordenes.push([campo, opts.ascending !== false]); return consulta; },
        range(desde, hasta) { rango = [desde, hasta]; return consulta; },
        single() { unica = true; return consulta; },
        upsert(datos, opts) { operacion = "upsert"; payload = datos; opciones = opts || {}; return consulta; },
        update(datos) { operacion = "update"; payload = datos; return consulta; },
        delete() { operacion = "delete"; return consulta; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const llamada = { tabla, operacion, payload, rango };
            llamadas.push(llamada);
            const falla = fallar(llamada, tablas);
            if (falla && !falla.aplicar) return { data: null, error: new Error(falla.mensaje || "Falla simulada") };
            let filas = tablas[tabla].filter((r) => filtros.every((f) => f(r)));
            if (operacion === "upsert") {
              filas = [];
              for (const dato of Array.isArray(payload) ? payload : [payload]) {
                const claves = (opciones.onConflict || "id").split(",");
                const existente = tablas[tabla].find((r) => claves.every((c) => r[c] === dato[c]));
                if (existente) { if (!opciones.ignoreDuplicates) Object.assign(existente, dato); filas.push(existente); }
                else {
                  const fila = { id: `auto-${++secuencia}`, ...dato };
                  if (tabla === "consumibles_config") fila.factor_compra ??= null;
                  tablas[tabla].push(fila);
                  filas.push(fila);
                }
              }
            } else if (operacion === "update") {
              for (const fila of filas) Object.assign(fila, payload);
            } else if (operacion === "delete") {
              tablas[tabla] = tablas[tabla].filter((r) => !filas.includes(r));
              if (tabla === "consumibles_listas") tablas.consumibles_lista_items = tablas.consumibles_lista_items.filter((r) => !filas.some((l) => l.id === r.lista_id));
            }
            for (const [campo, ascendente] of [...ordenes].reverse()) filas.sort((a, b) => (ascendente ? 1 : -1) * String(a[campo]).localeCompare(String(b[campo])));
            if (rango) filas = filas.slice(rango[0], rango[1] + 1);
            const data = filas.map((r) => tabla === "consumibles_listas" ? { ...r, items: [{ count: tablas.consumibles_lista_items.filter((i) => i.lista_id === r.id).length }] }
              : tabla === "consumibles_lista_items" ? { ...r, lista: tablas.consumibles_listas.find((l) => l.id === r.lista_id) } : { ...r });
            if (falla) return { data: null, error: new Error(falla.mensaje || "Se perdió la respuesta") };
            return unica ? (data.length === 1 ? { data: data[0], error: null } : { data: null, error: new Error("La ficha cambió") }) : { data, error: null };
          }).then(resolve, reject);
        },
      };
      return consulta;
    },
  };
  const asegurar = async (materialId) => {
    const resultado = await cliente.from("consumibles_config").upsert({ material_id: materialId }, { onConflict: "material_id", ignoreDuplicates: true });
    if (resultado.error) throw resultado.error;
  };
  return { tablas, llamadas, cliente, asegurar };
}

const carga = () => ({ cabecera: lista("l1", "2026-10-08"), renglones: [producto("a", 100)], anterior: [producto("a", 90, { material_id: "m1" })] });

test("repositorio: verifica permiso de base antes de cualquier escritura", async () => {
  const base = baseFalsa({}, { manager: false });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  await assert.rejects(api.guardarLista(carga()), /Solo administración/);
  await assert.rejects(api.aplicarCostos("l1", {}), /Solo administración/);
  assert.equal(base.llamadas.length, 0);
});

test("repositorio: guarda cabecera e ítems y reintentar no duplica la foto", async () => {
  const base = baseFalsa();
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  await api.guardarLista(carga());
  await api.guardarLista(carga());
  assert.equal(base.tablas.consumibles_listas.length, 1);
  assert.equal(base.tablas.consumibles_lista_items.length, 1);
  assert.equal(base.tablas.consumibles_lista_items[0].material_id, "m1");
});

test("repositorio: una respuesta perdida de ítems no borra una carga completa", async () => {
  const base = baseFalsa({}, { fallar: ({ tabla, operacion }) => tabla === "consumibles_lista_items" && operacion === "upsert" ? { aplicar: true } : null });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  assert.equal(await api.guardarLista(carga()), "l1");
  assert.equal(base.tablas.consumibles_listas.length, 1);
  assert.equal(base.llamadas.some((l) => l.operacion === "delete"), false);
});

test("repositorio: una falla de ítems limpia sólo la cabecera de esta carga", async () => {
  const base = baseFalsa({ consumibles_listas: [lista("existente", "2026-09-01")] }, { fallar: ({ tabla, operacion }) => tabla === "consumibles_lista_items" && operacion === "upsert" ? {} : null });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  await assert.rejects(api.guardarLista(carga()), /lista incompleta se retiró/);
  assert.deepEqual(base.tablas.consumibles_listas.map((l) => l.id), ["existente"]);
});

test("repositorio: conserva UUID y contenido si la cabecera llegó sin respuesta", async () => {
  let primera = true;
  const base = baseFalsa({}, { fallar: ({ tabla, operacion }) => {
    if (primera && tabla === "consumibles_listas" && operacion === "upsert") { primera = false; return { aplicar: true }; }
    return null;
  } });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  await assert.rejects(api.guardarLista(carga()), (error) => error.cargaPendiente === true);
  await api.guardarLista(carga());
  assert.equal(base.tablas.consumibles_listas.length, 1);
  assert.equal(base.tablas.consumibles_lista_items.length, 1);
});

test("repositorio: limpieza fallida deja una carga recuperable con el mismo UUID", async () => {
  let conFalla = true;
  const base = baseFalsa({}, { fallar: ({ operacion, tabla }) => conFalla && (operacion === "delete" || (operacion === "upsert" && tabla === "consumibles_lista_items")) ? {} : null });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  await assert.rejects(api.guardarLista(carga()), (error) => error.cargaPendiente === true);
  conFalla = false;
  await api.guardarLista(carga());
  assert.equal(base.tablas.consumibles_listas.length, 1);
  assert.equal(base.tablas.consumibles_lista_items.length, 1);
});

test("repositorio: pagina más de 1000 ítems y conserva el autor y el conteo", async () => {
  const items = Array.from({ length: 1501 }, (_, i) => producto(String(i).padStart(4, "0"), i, { id: `i${i}`, lista_id: "l1" }));
  const base = baseFalsa({ consumibles_listas: [lista("l1", "2026-10-08", "Rebollar", { created_by: "usuario" })], consumibles_lista_items: items, profiles: [{ id: "usuario", username: "Compras" }] });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  assert.equal((await api.fetchItems("l1")).length, 1501);
  const listas = await api.fetchListas();
  assert.equal(listas[0].renglones, 1501);
  assert.equal(listas[0].autor, "Compras");
});

test("repositorio: historial del código separado por proveedor y ordenado por vigencia", async () => {
  const base = baseFalsa({ consumibles_listas: [lista("nueva", "2026-10-08"), lista("vieja", "2026-09-01"), lista("otro", "2026-10-01", "Otro")],
    consumibles_lista_items: ["nueva", "vieja", "otro"].map((id) => producto("a", 10, { id: `i-${id}`, lista_id: id })) });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  assert.deepEqual((await api.fetchHistorial("a", lista("nueva", "2026-10-08"))).map((r) => r.lista.id), ["vieja", "nueva"]);
});

const baseCostos = (opciones) => baseFalsa({ consumibles_lista_items: [producto("a", 1000, { id: "i1", lista_id: "l1", material_id: "m1" }), producto("b", 200, { id: "i2", lista_id: "l1", material_id: "m2" })],
  panol_materiales: [{ id: "m1", es_consumible: true }, { id: "m2", es_consumible: true }],
  consumibles_config: [{ material_id: "m1", factor_compra: 100, notas: "Conservar", codigo_etiqueta: "KA0001" }] }, opciones);

test("repositorio: actualiza sólo costo, ítem de origen y fecha; crea config faltante", async () => {
  const base = baseCostos();
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  const plan = await api.prepararCostos("l1");
  assert.equal(await api.aplicarCostos("l1", plan), 2);
  assert.equal(base.tablas.consumibles_config[0].costo_unitario_ars, 10);
  assert.equal(base.tablas.consumibles_config[0].notas, "Conservar");
  assert.equal(base.tablas.consumibles_config[0].codigo_etiqueta, "KA0001");
  assert.equal(base.tablas.consumibles_config[1].costo_unitario_ars, 200);
  assert.equal(base.tablas.consumibles_config[1].costo_lista_item_id, "i2");
  assert.ok(base.tablas.consumibles_config[1].costo_actualizado_at);
  const cambios = base.llamadas.filter((l) => l.operacion === "update");
  assert.deepEqual(Object.keys(cambios[0].payload).sort(), ["costo_actualizado_at", "costo_lista_item_id", "costo_unitario_ars"]);
});

test("repositorio: cambia el factor durante la confirmación y exige revisar sin escribir", async () => {
  const base = baseCostos();
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  const plan = await api.prepararCostos("l1");
  base.tablas.consumibles_config[0].factor_compra = 50;
  await assert.rejects(api.aplicarCostos("l1", plan), /Cambiaron los vínculos/);
  assert.equal(base.llamadas.some((l) => l.operacion === "update"), false);
});

test("repositorio: detecta la carrera del factor justo antes del update", async () => {
  const base = baseCostos();
  const api = crearPreciosRepositorio(base.cliente, async (id) => {
    await base.asegurar(id);
    base.tablas.consumibles_config[0].factor_compra = 20;
  });
  const plan = await api.prepararCostos("l1");
  await assert.rejects(api.aplicarCostos("l1", plan), /Se actualizaron 0 de 2/);
  assert.equal(base.tablas.consumibles_config[0].costo_unitario_ars, undefined);
});

test("repositorio: informa cuántos se grabaron ante una falla parcial", async () => {
  const base = baseCostos({ fallar: ({ operacion, payload }) => operacion === "update" && payload.costo_lista_item_id === "i2" ? {} : null });
  const api = crearPreciosRepositorio(base.cliente, base.asegurar);
  const plan = await api.prepararCostos("l1");
  await assert.rejects(api.aplicarCostos("l1", plan), (error) => error.actualizados === 1 && /1 de 2/.test(error.message));
  assert.equal(base.tablas.consumibles_config[0].costo_unitario_ars, 10);
  assert.equal(base.tablas.consumibles_config[1].costo_unitario_ars, undefined);
});
