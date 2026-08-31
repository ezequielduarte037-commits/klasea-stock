import { supabase } from "@/supabaseClient";
import { leerPresupuestoConIA, normalizeUnidadMedida } from "@/features/materiales/api";
import { fetchPanolCatalogFull } from "@/features/panol/panolApi";
import { materialMatchIsStrong, materialMatchScore } from "@/features/panol/materialMatch";
import { validateRemitoExtraction } from "@/features/panol/remitoDocument";
import {
  asignarObrasDeRemito,
  fetchObrasDeRemitos,
  normalizarObraIds,
} from "@/features/panol/remitosObrasApi";

/**
 * Remitos escaneados en el pañol.
 *
 * REGLA CENTRAL, y el motivo de que este archivo este escrito asi: EL PAPEL SE
 * GUARDA SIEMPRE. Antes la IA leia primero y recien despues se subia el archivo,
 * asi que un escaneo torcido, un remito escrito a mano o una hoja de la que el
 * modelo no estaba seguro terminaban en un cartel rojo y en NADA guardado: el
 * remito no quedaba digitalizado ni siquiera como PDF. Ahora es al reves:
 *
 *   1. guardarRemitoEscaneado -> sube el archivo y crea la fila. No usa IA.
 *   2. leerRemitoConIA        -> lee los renglones. Puede fallar y no pasa nada:
 *                                el documento ya esta guardado y se reintenta.
 *
 * Lo que la IA aporta es el ingreso automatico de stock, que es una comodidad.
 * Tener el remito archivado y buscable es el piso, y el piso no puede depender
 * de que un modelo se anime a clasificar una fotocopia.
 */

const BUCKET = "panol-comprobantes";
const COLS_COMPROBANTE = "id,proveedor,numero,fecha,total,moneda,notas,archivo_url,archivo_nombre,archivo_mime,sede,recepcion_estado,panol_envio_id,created_at,procesado_at";
// Las de la migracion 20260826150000. Si no esta corrida, se cae a las de arriba.
const COLS_COMPROBANTE_PLUS = `${COLS_COMPROBANTE},es_consumible,titulo,carpeta_local,obra_id,solo_archivo`;
const COLS_ITEM = "id,comprobante_id,material_id,descripcion,descripcion_original,cantidad,precio_unitario,total,scanner_confianza,scanner_material_sugerido_id,scanner_revision,scanner_unidad,scanner_ingreso_envio_id";

/** Trae los comprobantes con las columnas nuevas, o sin ellas si no existen. */
async function selectComprobantes(construir) {
  const conNuevas = await construir(COLS_COMPROBANTE_PLUS);
  if (!conNuevas.error) return conNuevas;
  if (!esColumnaFaltante(conNuevas.error)) return conNuevas;
  return construir(COLS_COMPROBANTE);
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
]);

function scannerSchemaError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42703"
    || message.includes("archivo_hash")
    || message.includes("origen_carga")
    || message.includes("scanner_unidad")
    || message.includes("scanner_ingreso_envio_id")
    || message.includes("scanner_revision");
}

function throwFriendly(error) {
  if (scannerSchemaError(error)) {
    throw new Error("Falta aplicar la migración del scanner de remitos en Supabase.");
  }
  throw error;
}

function safePart(value = "archivo") {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "archivo";
}

/**
 * Numero escrito como lo escribe un proveedor argentino, un proveedor yanqui o
 * la IA cuando devuelve texto.
 *
 * La version anterior hacia `.replace(",", ".")` y nada mas: "1.234,56" quedaba
 * en "1.234.56" -> NaN -> null. O sea que toda cantidad o precio con separador
 * de miles se perdia en silencio, que es la peor forma de perderla. El criterio
 * correcto es mirar el ULTIMO separador: el que esta mas a la derecha es el
 * decimal y el otro es de miles.
 */
export function numeroDeTexto(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  // Se queda con la primera tirada de numero: "100,00 m." -> "100,00".
  const crudo = String(value).replace(/\s/g, "");
  const match = crudo.match(/-?\d[\d.,]*/);
  if (!match) return null;
  let texto = match[0];

  const ultimaComa = texto.lastIndexOf(",");
  const ultimoPunto = texto.lastIndexOf(".");
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Los dos separadores presentes: el de mas a la derecha es el decimal.
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    texto = texto.split(miles).join("").replace(decimal, ".");
  } else if (ultimaComa >= 0) {
    // Una sola coma. "1,5" es decimal; "1,500" con exactamente 3 digitos atras
    // es casi siempre separador de miles.
    const decimales = texto.length - ultimaComa - 1;
    texto = decimales === 3 ? texto.split(",").join("") : texto.replace(",", ".");
  } else if (ultimoPunto >= 0) {
    const decimales = texto.length - ultimoPunto - 1;
    // Varios puntos ("1.234.567") son siempre miles.
    if (decimales === 3 && (texto.split(".").length > 2 || texto.indexOf(".") <= 3)) {
      texto = texto.split(".").join("");
    }
  }

  const parsed = Number(texto);
  return Number.isFinite(parsed) ? parsed : null;
}

async function sha256(file) {
  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** PostgREST avisa una columna inexistente con PGRST204 o el 42703 de Postgres. */
function esColumnaFaltante(error) {
  const codigo = String(error?.code || "");
  const mensaje = String(error?.message || "").toLowerCase();
  return codigo === "PGRST204" || codigo === "42703" || (mensaje.includes("column") && mensaje.includes("does not exist"));
}

function validateFile(file) {
  if (!file) throw new Error("Elegí un remito para procesar.");
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_FILE_SIZE) throw new Error("El remito supera 20 MB. Escanealo a 300 dpi o dividilo.");
  const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
  if (!isPdf && file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error("Formato no compatible. Usá PDF, JPG, PNG, WEBP o TIFF.");
  }
}

// Debajo de esto no hay parecido real, hay ruido: dos palabras cortas que
// coinciden por casualidad. Ofrecerlo como sugerencia es peor que no ofrecer
// nada, porque manda a alguien a revisar un disparate.
const PUNTAJE_MINIMO_SUGERENCIA = 40;

function bestCatalogMatch(catalog, item, { esConsumibles = false } = {}) {
  let best = null;
  let bestScore = 0;
  for (const material of catalog || []) {
    if (!material?.id || material.es_requisito === true) continue;
    let score = materialMatchScore(material, item);
    // En un remito de consumibles, un consumible del catalogo le gana a un
    // material comun que puntue parecido: "Arandela 1/2" existe de las dos
    // formas. El empujon va SOLO sobre un parecido que ya existe; probandolo,
    // aplicado a cualquier puntaje convertia "GUANTES DE NITRILO" -que no esta
    // en el catalogo- en una sugerencia de "Rodillo Epoxy" con puntaje 4.
    if (esConsumibles && material.es_consumible === true && score >= PUNTAJE_MINIMO_SUGERENCIA) {
      score += 4;
    }
    if (score > bestScore) {
      best = material;
      bestScore = score;
    }
  }
  if (bestScore < PUNTAJE_MINIMO_SUGERENCIA) return { material: null, score: 0 };
  return { material: best, score: Math.round(bestScore * 100) / 100 };
}

function normalizedAiItems(data, catalog, { esConsumibles = false } = {}) {
  return (data?.items || data?.lineas || [])
    .map((raw) => {
      const descripcion = String(raw.descripcion || raw.description || raw.nombre || "").trim();
      if (!descripcion) return null;
      const candidateInput = {
        descripcion,
        codigo: raw.codigo || raw.code || "",
        proveedor: data?.proveedor || "",
      };
      const { material, score } = bestCatalogMatch(catalog, candidateInput, { esConsumibles });
      const strong = material && materialMatchIsStrong(score);
      return {
        descripcion,
        descripcion_original: descripcion,
        codigo: String(raw.codigo || raw.code || material?.codigo || "").trim(),
        cantidad: numeroDeTexto(raw.cantidad ?? raw.quantity),
        unidad: normalizeUnidadMedida(raw.unidad || raw.unit || material?.unidad, "unidad"),
        precio_unitario: numeroDeTexto(raw.precio_unitario ?? raw.precio),
        total: numeroDeTexto(raw.total),
        moneda: String(raw.moneda || data?.moneda || "ARS").toUpperCase() === "USD" ? "USD" : "ARS",
        proveedor: String(data?.proveedor || "").trim(),
        material_id: strong ? material.id : null,
        material_sugerido_id: material?.id || null,
        es_consumible: esConsumibles || material?.es_consumible === true,
        confianza: material ? score : null,
        revision: strong ? "vinculado" : material ? "revisar" : "sin_coincidencia",
      };
    })
    .filter(Boolean);
}

/**
 * La moneda del documento sale de los renglones, no del encabezado: el extractor
 * no devuelve moneda a nivel documento (nunca la devolvio), asi que leerla de
 * ahi daba ARS siempre, incluso en un remito facturado en dolares.
 */
function monedaDeItems(items) {
  return (items || []).some((item) => item.moneda === "USD") ? "USD" : "ARS";
}

function totalDeItems(items) {
  const suma = (items || []).reduce((acumulado, item) => acumulado + (numeroDeTexto(item.total) || 0), 0);
  return suma > 0 ? Math.round(suma * 100) / 100 : null;
}

async function fetchScannerReceiptById(id) {
  const { data: receipt, error } = await selectComprobantes((cols) => supabase
    .from("panol_comprobantes")
    .select(cols)
    .eq("id", id)
    .single());
  if (error) throwFriendly(error);
  const { data: items, error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .select(COLS_ITEM)
    .eq("comprobante_id", id)
    .order("id");
  if (itemsError) throwFriendly(itemsError);
  const [enriquecido] = await enriquecerRemitosConObras([{ ...receipt, items: items || [] }]);
  return enriquecido;
}

async function enriquecerRemitosConObras(receipts) {
  if (!receipts?.length) return [];
  const { disponible, porRemito } = await fetchObrasDeRemitos(receipts.map((row) => row.id));
  return receipts.map((row) => {
    const obras = disponible ? porRemito.get(String(row.id)) || [] : [];
    const obraIds = obras.length ? obras.map((obra) => obra.id) : normalizarObraIds([row.obra_id]);
    return { ...row, obras, obra_ids: obraIds, soporte_multiobra: disponible };
  });
}

/**
 * ¿Ya existe este mismo archivo?
 *
 * Antes usaba `.maybeSingle()`, que revienta con "multiple rows returned" si por
 * lo que sea hay dos filas con el mismo hash. El resultado era un error de
 * PostgREST crudo en la cara del pañolero por un caso que no le importa: le
 * alcanza con que le abramos el que ya esta.
 */
async function buscarDuplicado(hash) {
  const { data, error } = await supabase
    .from("panol_comprobantes")
    .select("id")
    .eq("origen_carga", "scanner_panol")
    .eq("archivo_hash", hash)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throwFriendly(error);
  return data?.[0]?.id || null;
}

/**
 * Guarda el remito. Sube el archivo y crea la fila, sin tocar la IA ni el stock.
 *
 * Devuelve el comprobante ya leido de la base. Si el mismo archivo ya estaba
 * cargado devuelve el existente con `duplicado: true` en vez de duplicarlo.
 */
export async function guardarRemitoEscaneado(file, {
  sede = null,
  proveedor = "",
  obraId = null,
  obraIds = [],
  carpetaLocal = "",
  titulo = "",
  notas = "",
  soloArchivar = false,
  esConsumibles = false,
} = {}) {
  validateFile(file);
  const obrasSeleccionadas = normalizarObraIds(Array.isArray(obraIds) && obraIds.length ? obraIds : [obraId]);
  const hash = await sha256(file);

  const yaExiste = await buscarDuplicado(hash);
  if (yaExiste) return { ...(await fetchScannerReceiptById(yaExiste)), duplicado: true };

  const extension = String(file.name || "").split(".").pop()?.toLowerCase()
    || (file.type === "application/pdf" ? "pdf" : "jpg");
  const storagePath = `scanner-panol/${safePart(sede || "sin-sede")}/${new Date().toISOString().slice(0, 10)}/${hash.slice(0, 16)}-${safePart(file.name || `remito.${extension}`)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || (extension === "pdf" ? "application/pdf" : "image/jpeg"),
  });
  if (uploadError) throw uploadError;

  // "pendiente" = el papel esta guardado y todavia no se leyo. No es un estado
  // de error: es exactamente lo que pasa cuando alguien archiva un remito y el
  // ingreso de stock lo hace otro dia, u otra persona.
  const base = {
    // Si alguien lo eligio antes de escanear, esa es la verdad: lo escribio
    // mirando el papel. Lo de la IA es una deduccion, y va despues.
    proveedor: String(proveedor || "").trim() || null,
    numero: null,
    fecha: new Date().toISOString().slice(0, 10),
    moneda: "ARS",
    archivo_url: storagePath,
    archivo_hash: hash,
    archivo_nombre: file.name || `remito.${extension}`,
    archivo_mime: file.type || (extension === "pdf" ? "application/pdf" : "image/jpeg"),
    sede: sede || null,
    estado: "borrador",
    recepcion_estado: "pendiente",
    origen_carga: "scanner_panol",
    notas: String(notas || "").trim() || null,
    total: null,
  };
  // La obra, la carpeta y el titulo sirven para BUSCAR el remito despues, no
  // para cargarlo. Si la migracion que agrega esas columnas todavia no se corrio
  // se guarda sin ellas: perder el archivo por eso seria absurdo.
  const extras = {
    ...(obrasSeleccionadas.length === 1 ? { obra_id: obrasSeleccionadas[0] } : {}),
    ...(carpetaLocal ? { carpeta_local: carpetaLocal } : {}),
    ...(titulo ? { titulo: String(titulo).trim() } : {}),
    ...(soloArchivar ? { solo_archivo: true } : {}),
    ...(esConsumibles ? { es_consumible: true } : {}),
  };

  let receipt = null;
  try {
    let receiptError = null;
    if (Object.keys(extras).length) {
      ({ data: receipt, error: receiptError } = await supabase
        .from("panol_comprobantes").insert({ ...base, ...extras }).select("id").single());
      if (receiptError && esColumnaFaltante(receiptError)) {
        receipt = null;
        receiptError = null;
      } else if (receiptError) {
        throwFriendly(receiptError);
      }
    }
    if (!receipt) {
      // Sin la columna `solo_archivo` no hay forma de marcar "esto es solo
      // papel", asi que se lo saca de la bandeja con el estado, como antes. Es
      // un mal menor conocido: si no, queda esperando para siempre un ingreso
      // que nadie va a hacer.
      const sinColumnas = soloArchivar ? { ...base, recepcion_estado: "ingresado" } : base;
      ({ data: receipt, error: receiptError } = await supabase
        .from("panol_comprobantes").insert(sinColumnas).select("id").single());
      if (receiptError) throwFriendly(receiptError);
    }

    if (obrasSeleccionadas.length) {
      const guardadas = await asignarObrasDeRemito(receipt.id, obrasSeleccionadas);
      if (!guardadas && obrasSeleccionadas.length > 1) {
        throw new Error("Falta aplicar la migración multiobra de remitos en Supabase.");
      }
    }
  } catch (error) {
    // La fila no se creo: el PDF suelto en el bucket no le sirve a nadie y
    // encima bloquea el hash para el proximo intento.
    if (receipt?.id) {
      await supabase.from("panol_comprobantes").delete().eq("id", receipt.id).catch(() => {});
    }
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }

  // Ya existe la fila. De acá en más NO se borra nada: si releerla falla, el
  // remito igual quedó guardado y se ve en cuanto se refresca la pantalla.
  // Borrar el archivo por un error de lectura sería tirar el documento que
  // acabamos de prometer que se guarda siempre.
  try {
    return { ...(await fetchScannerReceiptById(receipt.id)), duplicado: false };
  } catch {
    return { ...base, id: receipt.id, ...extras, items: [], duplicado: false };
  }
}

async function descargarArchivoDeRemito(receipt) {
  if (!receipt?.archivo_url) throw new Error("Este remito no conserva archivo original para leer.");
  const { data, error } = await supabase.storage.from(BUCKET).download(receipt.archivo_url);
  if (error) throw new Error("No se pudo bajar el archivo guardado del remito.");
  const nombre = receipt.archivo_nombre || "remito.pdf";
  return new File([data], nombre, { type: receipt.archivo_mime || data.type || "application/pdf" });
}

/**
 * Lee con IA un remito YA GUARDADO y le carga los renglones.
 *
 * Nunca borra el comprobante ni el archivo: si la lectura sale mal devuelve
 * `{ ok: false, mensaje }` y el remito queda como estaba, listo para reintentar.
 * Ese es todo el cambio de fondo respecto de la version anterior, donde un
 * documento que la IA no entendia se perdia entero.
 *
 * @param {object} receipt   fila de panol_comprobantes (o su id)
 * @param {File}   [archivo] el archivo ya en memoria, para no bajarlo de nuevo
 */
export async function leerRemitoConIA(receipt, { archivo = null, esConsumibles = null } = {}) {
  const fila = typeof receipt === "string" ? await fetchScannerReceiptById(receipt) : receipt;
  if (!fila?.id) throw new Error("Falta el remito a leer.");

  // Releer un remito rehace sus renglones. Si alguno ya se ingresó al stock,
  // ese renglón no se puede tocar y la lectura nueva lo duplicaría: la de la IA
  // más la que ya entró. Ahí no hay nada que releer, hay que seguir el ingreso.
  const yaIngresado = (fila.items || []).some((item) => item.scanner_ingreso_envio_id);
  if (yaIngresado) {
    throw new Error("Este remito ya tiene renglones ingresados al stock: no se puede volver a leer.");
  }

  const consumibles = esConsumibles == null ? fila.es_consumible === true : Boolean(esConsumibles);
  const file = archivo || await descargarArchivoDeRemito(fila);

  let parsed = null;
  try {
    parsed = await leerPresupuestoConIA({
      file,
      tipoEsperado: "remito",
      // El proveedor elegido antes de escanear entra como contexto: ayuda a
      // interpretar descripciones abreviadas y le saca a la IA la parte que peor
      // hace, que es adivinar de quien es el remito.
      proveedor: String(fila.proveedor || "").trim(),
    });
  } catch (error) {
    return {
      ok: false,
      motivo: "error_lectura",
      mensaje: error?.message || "No se pudo leer el remito con IA.",
      receipt: fila,
    };
  }

  const validacion = validateRemitoExtraction(parsed);
  if (!validacion.ok) {
    return {
      ok: false,
      motivo: validacion.motivo,
      // El texto de validateRemitoExtraction termina en "No se guardó ni
      // modificó stock", que ahora seria mentira al reves: el documento SI se
      // guardo, lo unico que no se pudo es leerlo.
      mensaje: `${validacion.message.replace(" No se guardó ni modificó stock.", "")} El remito quedó guardado igual: podés reintentar la lectura o cargarlo a mano.`,
      receipt: fila,
    };
  }

  const catalog = await fetchPanolCatalogFull();
  const items = normalizedAiItems(parsed, catalog, { esConsumibles: consumibles });
  if (!items.length) {
    return {
      ok: false,
      motivo: "sin_renglones",
      mensaje: "La IA no encontró renglones con producto y cantidad. El remito quedó guardado: revisá el escaneo o cargalo a mano.",
      receipt: fila,
    };
  }

  // Se rehacen los renglones: reintentar una lectura tiene que dejar el remito
  // como si fuera la primera vez, no sumarle una segunda tanda de items.
  const { error: limpiarError } = await supabase
    .from("panol_comprobante_items")
    .delete()
    .eq("comprobante_id", fila.id)
    .is("scanner_ingreso_envio_id", null);
  if (limpiarError) throwFriendly(limpiarError);

  const filas = items.map((item) => ({
    comprobante_id: fila.id,
    material_id: item.material_id,
    descripcion: item.descripcion,
    descripcion_original: item.descripcion_original,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    total: item.total,
    aplicado: false,
    scanner_confianza: item.confianza,
    scanner_material_sugerido_id: item.material_sugerido_id,
    scanner_revision: item.revision,
    scanner_unidad: item.unidad || "unidad",
  }));
  const { error: itemsError } = await supabase.from("panol_comprobante_items").insert(filas);
  if (itemsError) throwFriendly(itemsError);

  const vinculados = items.filter((item) => item.material_id).length;
  const patch = {
    // Lo que escribio una persona gana. La IA solo completa lo que esta vacio.
    proveedor: String(fila.proveedor || "").trim() || String(parsed?.proveedor || "").trim() || null,
    numero: String(fila.numero || "").trim() || String(parsed?.numero || "").trim() || null,
    fecha: parsed?.fecha || fila.fecha || new Date().toISOString().slice(0, 10),
    moneda: monedaDeItems(items),
    total: totalDeItems(items),
    recepcion_estado: vinculados === items.length ? "listo_ingreso" : "requiere_revision",
    updated_at: new Date().toISOString(),
  };
  const aplicarPatch = (cuerpo) => supabase
    .from("panol_comprobantes")
    .update(cuerpo)
    .eq("id", fila.id)
    .eq("origen_carga", "scanner_panol");

  // Leer un remito que se habia guardado como "solo archivo" es decir que
  // ahora si se quiere ingresar. Si la marca quedara puesta, el remito seguiria
  // filtrado de la bandeja y la lectura no serviria para nada: quedaria leido
  // en un lugar donde nadie lo puede confirmar.
  let { error: updateError } = await aplicarPatch({ ...patch, solo_archivo: false });
  if (updateError && esColumnaFaltante(updateError)) {
    ({ error: updateError } = await aplicarPatch(patch));
  }
  if (updateError) throwFriendly(updateError);

  return {
    ok: true,
    receipt: await fetchScannerReceiptById(fila.id),
    vinculados,
    total: items.length,
    dudas: Array.isArray(parsed?.dudas) ? parsed.dudas.filter(Boolean).map(String) : [],
  };
}

/**
 * Guarda y, si corresponde, lee. Es lo que usa la pantalla en un solo paso.
 *
 * Con `soloArchivar` ni siquiera llama a la IA: quien tildó esa opción dijo que
 * queria el papel en el sistema, no mover stock. Hacerlo pasar igual por el
 * modelo era gastar tiempo y arriesgar un error en algo que ya estaba resuelto.
 */
export async function archivarRemito(file, contexto = {}) {
  const receipt = await guardarRemitoEscaneado(file, contexto);
  if (receipt.duplicado) return { receipt, lectura: null, duplicado: true };
  if (contexto.soloArchivar) return { receipt, lectura: null, duplicado: false };

  const lectura = await leerRemitoConIA(receipt, {
    archivo: file,
    esConsumibles: Boolean(contexto.esConsumibles),
  });
  return { receipt: lectura.receipt || receipt, lectura, duplicado: false };
}

/**
 * La bandeja: lo que todavia espera una decision.
 *
 * Los "solo archivo" se filtran del lado del cliente a proposito. La columna es
 * opcional -depende de una migracion-, asi que filtrarla en la query rompería la
 * pantalla en las bases que no la tienen; si no existe, `solo_archivo` viene
 * `undefined` y no se esconde nada, que es el comportamiento de siempre.
 */
export async function fetchScannedReceipts({ sede = null, limit = 60 } = {}) {
  const { data: receipts, error } = await selectComprobantes((cols) => {
    let query = supabase
      .from("panol_comprobantes")
      .select(cols)
      .eq("origen_carga", "scanner_panol")
      .neq("recepcion_estado", "archivado")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (sede) query = query.eq("sede", sede);
    return query;
  });
  if (error) throwFriendly(error);
  const visibles = (receipts || []).filter((row) => row.solo_archivo !== true);
  if (!visibles.length) return [];

  const remitosConObras = await enriquecerRemitosConObras(visibles);

  const ids = remitosConObras.map((row) => row.id);
  const { data: items, error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .select(COLS_ITEM)
    .in("comprobante_id", ids)
    .order("id");
  if (itemsError) throwFriendly(itemsError);
  const byReceipt = new Map();
  for (const item of items || []) {
    const bucket = byReceipt.get(item.comprobante_id) || [];
    bucket.push(item);
    byReceipt.set(item.comprobante_id, bucket);
  }
  return remitosConObras.map((row) => ({ ...row, items: byReceipt.get(row.id) || [] }));
}

/**
 * Un remito guardado que todavia no tiene renglones = falta leerlo.
 *
 * Mira los renglones y el ingreso, no el estado: en una base sin la migracion
 * de `solo_archivo` los archivados quedan marcados "ingresado" aunque nunca se
 * hayan leido, y por el estado solo pareceria que ya esta todo hecho.
 */
export function remitoSinLeer(receipt) {
  if ((receipt?.items?.length || 0) > 0) return false;
  if (receipt?.panol_envio_id) return false;
  return receipt?.recepcion_estado !== "archivado";
}

export function scannerReceiptPrefill(receipt) {
  const provider = String(receipt?.proveedor || "").trim();
  const number = String(receipt?.numero || "").trim();
  const referencia = String(receipt?.titulo || "").trim();
  const obras = normalizarObraIds(receipt?.obra_ids?.length ? receipt.obra_ids : [receipt?.obra_id]);
  return {
    origen: "remito",
    modo: "remito",
    scannerReceiptId: receipt?.id || null,
    scannerStrict: true,
    sede: receipt?.sede || "",
    // La obra se eligio antes de escanear y se perdia justo acá: el formulario
    // de ingreso abría sin barco y habia que volver a elegirlo de memoria.
    // Un remito documental multiobra no implica que todo su contenido ingrese a
    // la primera obra. Solo se preselecciona cuando hay exactamente una.
    obraId: obras.length === 1 ? obras[0] : "",
    titulo: referencia || ["Remito", provider, number].filter(Boolean).join(" · "),
    observaciones: [
      `Documento escaneado${number ? ` Nº ${number}` : ""}${provider ? ` · ${provider}` : ""}. Original archivado en el sistema.`,
      String(receipt?.notas || "").trim(),
    ].filter(Boolean).join(" "),
    items: (receipt?.items || []).filter((item) => !item.scanner_ingreso_envio_id).map((item) => ({
      scanner_item_id: item.id,
      descripcion: item.descripcion || item.descripcion_original || "",
      cantidad: item.cantidad ?? "",
      unidad: item.scanner_unidad || "unidad",
      material_id: item.material_id || "",
      proveedor: provider,
      recepcion_estado: "recibido",
    })),
  };
}

export async function linkScannedReceiptToIngreso(receiptId, envioId, confirmedItems = []) {
  if (!receiptId || !envioId) return;
  for (const item of confirmedItems || []) {
    if (!item?.scanner_item_id) continue;
    const { error } = await supabase
      .from("panol_comprobante_items")
      .update({
        material_id: item.material_id || null,
        scanner_revision: item.material_id ? "vinculado" : "revisar",
        scanner_ingreso_envio_id: envioId,
      })
      .eq("id", item.scanner_item_id)
      .eq("comprobante_id", receiptId);
    if (error) throwFriendly(error);
  }
  const { data: receiptItems, error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .select("material_id,scanner_ingreso_envio_id")
    .eq("comprobante_id", receiptId);
  if (itemsError) throwFriendly(itemsError);
  const pending = (receiptItems || []).filter((item) => !item.scanner_ingreso_envio_id);
  const processedCount = (receiptItems || []).length - pending.length;
  const nextState = pending.length === 0
    ? "ingresado"
    : processedCount > 0
      ? "parcial"
      : pending.every((item) => item.material_id)
        ? "listo_ingreso"
        : "requiere_revision";
  const { error } = await supabase
    .from("panol_comprobantes")
    .update({
      panol_envio_id: envioId,
      recepcion_estado: nextState,
      procesado_at: nextState === "ingresado" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receiptId)
    .eq("origen_carga", "scanner_panol");
  if (error) throwFriendly(error);
}

export async function scannerReceiptFileUrl(path) {
  if (!path) throw new Error("Este remito no conserva archivo original.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 10 * 60);
  if (error) throw error;
  return data?.signedUrl;
}

export async function archiveScannedReceipt(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("panol_comprobantes")
    .update({
      recepcion_estado: "archivado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("origen_carga", "scanner_panol")
    .select("id,recepcion_estado")
    .maybeSingle();
  if (error) throwFriendly(error);
  if (!data?.id || data.recepcion_estado !== "archivado") {
    throw new Error("No se pudo archivar el documento. Revisá los permisos del usuario y volvé a intentar.");
  }
  return data;
}

/**
 * Borra de verdad un remito escaneado: renglones, fila y PDF.
 *
 * Hasta ahora lo unico posible era "archivarlo", que lo saca de la bandeja pero
 * lo deja en el archivo de Remitos para siempre. Un escaneo en blanco, la misma
 * hoja dos veces o el remito del vecino no son documentos que haya que
 * conservar. La politica de RLS ya impide borrar uno que genero un ingreso.
 */
export async function borrarRemitoEscaneado(id) {
  if (!id) return;
  const { data: fila, error: leerError } = await supabase
    .from("panol_comprobantes")
    .select("id,archivo_url,panol_envio_id")
    .eq("id", id)
    .eq("origen_carga", "scanner_panol")
    .maybeSingle();
  if (leerError) throwFriendly(leerError);
  if (!fila?.id) throw new Error("Ese remito ya no existe.");
  if (fila.panol_envio_id) {
    throw new Error("Este remito ya generó un ingreso de stock: no se puede borrar, archivalo.");
  }

  const { error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .delete()
    .eq("comprobante_id", id);
  if (itemsError) throwFriendly(itemsError);

  const { data: borradas, error } = await supabase
    .from("panol_comprobantes")
    .delete()
    .eq("id", id)
    .eq("origen_carga", "scanner_panol")
    .select("id");
  if (error) throwFriendly(error);
  if (!borradas?.length) {
    throw new Error("No se pudo borrar el remito. Revisá los permisos del usuario.");
  }
  if (fila.archivo_url) {
    await supabase.storage.from(BUCKET).remove([fila.archivo_url]).catch(() => {});
  }
}

/**
 * Actualiza los datos que se escriben a mano sobre un remito ya guardado.
 * Los campos opcionales se ignoran si la migracion que los agrega no corrio.
 */
export async function actualizarDatosDeRemito(id, cambios = {}) {
  if (!id) return false;
  const base = {};
  if ("proveedor" in cambios) base.proveedor = String(cambios.proveedor || "").trim() || null;
  if ("numero" in cambios) base.numero = String(cambios.numero || "").trim() || null;
  if ("notas" in cambios) base.notas = String(cambios.notas || "").trim() || null;
  if ("fecha" in cambios) base.fecha = cambios.fecha || null;
  const extras = {};
  if ("titulo" in cambios) extras.titulo = String(cambios.titulo || "").trim() || null;
  if ("obraId" in cambios) extras.obra_id = cambios.obraId || null;
  if ("carpetaLocal" in cambios) extras.carpeta_local = String(cambios.carpetaLocal || "").trim() || null;

  const aplicar = async (patch) => supabase
    .from("panol_comprobantes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("origen_carga", "scanner_panol")
    .select("id");

  if (Object.keys(extras).length) {
    const { data, error } = await aplicar({ ...base, ...extras });
    if (!error) return Boolean(data?.length);
    if (!esColumnaFaltante(error)) throwFriendly(error);
  }
  if (!Object.keys(base).length) return false;
  const { data, error } = await aplicar(base);
  if (error) throwFriendly(error);
  return Boolean(data?.length);
}
