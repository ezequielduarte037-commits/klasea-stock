import { supabase } from "@/supabaseClient";
import {
  aplicarPrecioMaterial,
  precioVencido,
  proveedoresDeMaterial,
} from "@/features/materiales/api";

/**
 * Cuánto sale el material de un barco.
 *
 * La cuenta en sí es trivial -cantidad por precio- y ya estaba hecha en la
 * pestaña Costos de Materiales. Lo que faltaba, y es todo el punto de este
 * archivo, es contestar la segunda pregunta: CUÁNTO VALE ESE NÚMERO.
 *
 * Un total de materiales al que le faltan cincuenta precios no es un costo, es
 * una cota inferior disfrazada. Así que cada renglón sale clasificado y el total
 * nunca se muestra sin su cobertura al lado.
 *
 * Los cuatro estados salen de dónde está el precio, no de qué tan lindo es:
 *
 *   firme        hay precio y tiene menos de seis meses
 *   viejo        hay precio pero pasó el semestre: entra al total y se avisa
 *   recuperable  no hay precio, pero un remito YA ESCANEADO lo trae adentro
 *   falta        no hay precio en ninguna parte: hay que pedirlo
 *
 * "Recuperable" es el estado que más importa. Cuando el pañolero confirma el
 * ingreso de un remito ya emparejó cada renglón con su material y el renglón ya
 * tiene el precio unitario que leyó la IA. Ese dato nunca se escribió en la
 * lista de precios, así que hoy figura como faltante algo que el sistema ya
 * sabe. `aplicarPreciosRecuperados` lo pasa en limpio de una sola vez.
 */

export const MODELOS_BARCO = [
  { id: "37", label: "K37" },
  { id: "52", label: "K52" },
  { id: "55", label: "K55" },
];

export const SIN_PROVEEDOR = "__sin_proveedor__";
export const SIN_RUBRO = "__sin_rubro__";

/** Cuántas unidades de este material lleva ese barco. null = no lleva. */
export function cantidadDeModelo(material, modelo) {
  const fila = (material?.modelos || []).find((row) => String(row.modelo) === String(modelo));
  if (!fila) return null;
  const bruto = String(fila.cantidad ?? "").trim().replace(",", ".");
  if (!bruto) return null;
  const numero = Number(bruto);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function textoLimpio(valor) {
  const texto = String(valor ?? "").trim();
  return texto || null;
}

/**
 * Un renglón del costo, ya clasificado. `recuperables` es el mapa que devuelve
 * `fetchPreciosDeRemitos`: si el material no tiene precio pero aparece ahí,
 * el renglón sale como recuperable CON su importe, para que se vea cuánto del
 * total está a un botón de distancia.
 */
/**
 * Los precios que se le conocen a un material, uno por proveedor.
 *
 * Sale de `proveedoresDeMaterial`, que junta las tres fuentes en una lista
 * plana: no hay proveedor principal ni alternativos, hay proveedores. Acá sólo
 * se filtran los que todavía no cotizaron, porque para costear hace falta un
 * número.
 *
 * Vienen del más nuevo al más viejo, así que el primero es el último precio
 * conocido del material, sea de quien sea.
 */
export function preciosDeMaterial(material) {
  return proveedoresDeMaterial(material)
    .filter((row) => row.precio != null)
    .map((row) => ({
      proveedorId: row.proveedorId,
      proveedor: textoLimpio(row.proveedor),
      precio: row.precio,
      moneda: row.moneda,
      fecha: row.fecha,
    }));
}

/**
 * @param {"ultimo"|"barato"} criterio  con qué precio se costea. "ultimo" es el
 *   más reciente que se le conoce al material, de cualquier proveedor; "barato"
 *   toma el menor entre los que cotizaron en esa misma moneda.
 *
 * Comparar entre monedas distintas no se puede sin cotización, así que el más
 * barato se busca SÓLO entre los que están en la moneda del último precio.
 * Decir que 12 dólares es más barato que 15.000 pesos sería inventar un dato.
 */
export function evaluarMaterial(material, modelo, recuperables = new Map(), criterio = "ultimo") {
  const cantidad = cantidadDeModelo(material, modelo);
  if (cantidad == null) return null;

  const precios = preciosDeMaterial(material);
  const ultimo = precios[0] || null;
  const enMonedaUltimo = ultimo ? precios.filter((row) => row.moneda === ultimo.moneda) : [];
  const barato = enMonedaUltimo.length
    ? enMonedaUltimo.reduce((mejor, row) => (row.precio < mejor.precio ? row : mejor))
    : null;
  const elegido = criterio === "barato" ? (barato || ultimo) : ultimo;
  const deRemito = recuperables.get(material.id) || null;

  let estado = "falta";
  let usado = null;

  if (elegido) {
    // La antigüedad se mide sobre EL PRECIO QUE SE ESTÁ USANDO, no sobre el
    // último del material. Costeando "al más barato" puede entrar un precio de
    // hace un año mientras el más nuevo es de ayer: marcarlo como al día
    // porque el material tiene algo reciente sería mentir sobre este renglón.
    estado = precioVencido(elegido.fecha) ? "viejo" : "firme";
    usado = elegido;
  } else if (deRemito) {
    estado = "recuperable";
    usado = {
      proveedorId: null,
      proveedor: deRemito.proveedor || null,
      precio: deRemito.precio,
      moneda: deRemito.moneda === "USD" ? "USD" : "ARS",
      fecha: deRemito.fecha || null,
    };
  }

  // Cuánto se ahorraría comprándole al más barato en vez de al último que
  // cotizó. Sólo tiene sentido si los dos están en la misma moneda, que es lo
  // que garantiza `enMonedaUltimo`.
  const ahorro = ultimo && barato && barato.precio < ultimo.precio
    ? (ultimo.precio - barato.precio) * cantidad
    : 0;

  return {
    material,
    cantidad,
    estado,
    precio: usado?.precio ?? null,
    moneda: usado?.moneda || "ARS",
    fecha: usado?.fecha || null,
    origen: usado?.proveedor || null,
    costo: usado?.precio != null ? cantidad * usado.precio : 0,
    precios,
    ultimo,
    barato,
    ahorro,
    ahorroMoneda: ultimo?.moneda || "ARS",
    deRemito,
  };
}

/** El rubro con el que cuenta un material: su categoría raíz, una sola vez. */
function rubroDeMaterial(material, categorias) {
  const porId = categorias.porId;
  let actual = porId.get(material.categoria_id);
  // Sube hasta la raíz. El tope evita quedarse colgado si alguna categoría
  // quedó apuntándose a sí misma.
  for (let saltos = 0; actual?.parent_id && saltos < 8; saltos += 1) {
    const padre = porId.get(actual.parent_id);
    if (!padre) break;
    actual = padre;
  }
  return actual || null;
}

function acumuladorVacio() {
  return {
    ars: 0,
    usd: 0,
    arsRecuperable: 0,
    usdRecuperable: 0,
    ahorroArs: 0,
    ahorroUsd: 0,
    items: 0,
    firme: 0,
    viejo: 0,
    recuperable: 0,
    falta: 0,
    conVarios: 0,
  };
}

function sumar(acc, fila) {
  acc.items += 1;
  acc[fila.estado] += 1;
  if ((fila.precios?.length || 0) > 1) acc.conVarios += 1;
  if (fila.ahorro > 0) {
    if (fila.ahorroMoneda === "USD") acc.ahorroUsd += fila.ahorro;
    else acc.ahorroArs += fila.ahorro;
  }
  if (fila.estado === "recuperable") {
    if (fila.moneda === "USD") acc.usdRecuperable += fila.costo;
    else acc.arsRecuperable += fila.costo;
    return;
  }
  if (fila.estado === "falta") return;
  if (fila.moneda === "USD") acc.usd += fila.costo;
  else acc.ars += fila.costo;
}

/**
 * El costo del barco entero, con su desglose.
 *
 * A diferencia de la pestaña vieja, cada material cuenta UNA sola vez, en su
 * rubro raíz. Antes un material asignado a tres áreas sumaba en las tres y el
 * desglose no cerraba con el total, que es justo lo que hace que nadie confíe
 * en una planilla de costos.
 */
export function resumenDeModelo(materiales, modelo, { recuperables = new Map(), categorias = [], criterio = "ultimo" } = {}) {
  const indice = {
    porId: new Map((categorias || []).map((categoria) => [categoria.id, categoria])),
  };

  const filas = [];
  const total = acumuladorVacio();
  const porRubro = new Map();

  for (const material of materiales || []) {
    if (material?.activo === false) continue;
    const fila = evaluarMaterial(material, modelo, recuperables, criterio);
    if (!fila) continue;

    const rubro = rubroDeMaterial(material, indice);
    const claveRubro = rubro?.id || SIN_RUBRO;
    fila.rubro = rubro?.nombre || "Sin rubro";
    fila.rubroId = claveRubro;
    filas.push(fila);

    sumar(total, fila);
    if (!porRubro.has(claveRubro)) {
      porRubro.set(claveRubro, { id: claveRubro, nombre: fila.rubro, ...acumuladorVacio() });
    }
    sumar(porRubro.get(claveRubro), fila);
  }

  const conPrecio = total.firme + total.viejo;
  return {
    filas,
    total,
    cobertura: total.items ? conPrecio / total.items : 0,
    rubros: [...porRubro.values()].sort((a, b) => (b.ars + b.usd * 1000) - (a.ars + a.usd * 1000)),
  };
}

/**
 * Los faltantes agrupados por proveedor, que es la única forma en que este
 * trabajo avanza: no se completan precios material por material, se le manda
 * una lista a un proveedor y vuelven veinte de golpe.
 *
 * Los recuperables van en un grupo propio arriba de todo porque no hay que
 * pedirle nada a nadie: ya están en el sistema.
 */
export function agruparFaltantes(filas, { ademas = new Set() } = {}) {
  const recuperables = filas.filter((fila) => fila.estado === "recuperable");
  const porProveedor = new Map();

  for (const fila of filas) {
    // `ademas` son los que se acaban de cargar a mano: ya tienen precio, pero
    // se quedan en la lista hasta el próximo refresco para que cargar veinte
    // seguidos no sea una fila saltando cada vez que se escribe un número.
    if (fila.estado !== "falta" && !ademas.has(fila.material.id)) continue;

    // Un material aparece bajo CADA proveedor que lo vende: si el mismo racor
    // lo tienen Iriarte y Baron, se le pide a los dos y después se compara.
    // `proveedoresDeMaterial` ya los devuelve deduplicados y sin jerarquía.
    const destinos = proveedoresDeMaterial(fila.material)
      .map((row) => ({ id: row.proveedorId, nombre: textoLimpio(row.proveedor) }))
      .filter((destino) => destino.nombre);

    for (const destino of destinos.length ? destinos : [{ id: null, nombre: null }]) {
      const clave = destino.nombre ? destino.nombre.toLowerCase() : SIN_PROVEEDOR;
      if (!porProveedor.has(clave)) {
        porProveedor.set(clave, {
          clave,
          proveedor: destino.nombre,
          proveedorId: destino.id,
          items: [],
        });
      }
      porProveedor.get(clave).items.push(fila);
    }
  }

  const grupos = [...porProveedor.values()]
    .map((grupo) => ({
      ...grupo,
      items: grupo.items.sort((a, b) => b.cantidad - a.cantidad),
    }))
    .sort((a, b) => {
      // Los huérfanos al final: son los que hay que clasificar antes de poder
      // pedir nada, y arriba estorban.
      if ((a.clave === SIN_PROVEEDOR) !== (b.clave === SIN_PROVEEDOR)) {
        return a.clave === SIN_PROVEEDOR ? 1 : -1;
      }
      return b.items.length - a.items.length;
    });

  return { recuperables, grupos };
}

/**
 * El precio más reciente de cada material según los remitos ya escaneados.
 *
 * Dos consultas en vez de un join anidado: el resto del repo lo hace así porque
 * PostgREST necesita que la relación esté declarada y acá alcanza con dos
 * lecturas simples que no se rompen si mañana cambia el nombre del vínculo.
 */
export async function fetchPreciosDeRemitos({ limite = 5000 } = {}) {
  const { data: renglones, error } = await supabase
    .from("panol_comprobante_items")
    .select("material_id,precio_unitario,comprobante_id")
    .not("material_id", "is", null)
    .gt("precio_unitario", 0)
    .limit(limite);
  if (error) return new Map();

  const comprobanteIds = [...new Set((renglones || []).map((fila) => fila.comprobante_id).filter(Boolean))];
  const comprobantes = new Map();
  for (let i = 0; i < comprobanteIds.length; i += 150) {
    const { data } = await supabase
      .from("panol_comprobantes")
      .select("id,fecha,proveedor,moneda,created_at")
      .in("id", comprobanteIds.slice(i, i + 150));
    for (const fila of data || []) comprobantes.set(fila.id, fila);
  }

  // Se queda con el más nuevo por material: un precio de hace dos años no
  // sirve para costear, y si es lo único que hay igual se ve la fecha.
  const mejor = new Map();
  for (const renglon of renglones || []) {
    const comprobante = comprobantes.get(renglon.comprobante_id) || {};
    const cuando = comprobante.fecha || comprobante.created_at || "";
    const previo = mejor.get(renglon.material_id);
    if (previo && String(previo.fecha || "") >= String(cuando)) continue;
    mejor.set(renglon.material_id, {
      precio: Number(renglon.precio_unitario),
      moneda: comprobante.moneda === "USD" ? "USD" : "ARS",
      fecha: comprobante.fecha || null,
      proveedor: textoLimpio(comprobante.proveedor),
      comprobanteId: renglon.comprobante_id,
    });
  }
  return mejor;
}

/**
 * Pasa a la lista de precios lo que ya estaba adentro de los remitos.
 *
 * De a uno y no en lote a propósito: `aplicarPrecioMaterial` escribe en dos
 * tablas y ya está probado en el resto del sistema. Si uno falla, los demás
 * entran igual y se informa cuántos quedaron afuera.
 */
export async function aplicarPreciosRecuperados(filas) {
  let aplicados = 0;
  const fallidos = [];
  for (const fila of filas || []) {
    if (!fila?.material?.id || !(fila.precio > 0)) continue;
    try {
      await aplicarPrecioMaterial(fila.material.id, {
        precio: fila.precio,
        moneda: fila.moneda,
        proveedor: fila.origen || null,
        fuente: "remito",
      });
      aplicados += 1;
    } catch (error) {
      fallidos.push({ descripcion: fila.material.descripcion, motivo: error?.message || "error" });
    }
  }
  return { aplicados, fallidos };
}
