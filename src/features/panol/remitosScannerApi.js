import { supabase } from "@/supabaseClient";
import { leerPresupuestoConIA, normalizeUnidadMedida } from "@/features/materiales/api";
import { fetchPanolCatalogFull } from "@/features/panol/panolApi";
import { materialMatchIsStrong, materialMatchScore } from "@/features/panol/materialMatch";
import { assertRemitoExtraction } from "@/features/panol/remitoDocument";

const BUCKET = "panol-comprobantes";
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

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function sha256(file) {
  const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function bestCatalogMatch(catalog, item) {
  let best = null;
  let bestScore = 0;
  for (const material of catalog || []) {
    if (!material?.id || material.es_requisito === true) continue;
    const score = materialMatchScore(material, item);
    if (score > bestScore) {
      best = material;
      bestScore = score;
    }
  }
  return { material: best, score: Math.round(bestScore * 100) / 100 };
}

function normalizedAiItems(data, catalog) {
  return (data?.items || data?.lineas || [])
    .map((raw) => {
      const descripcion = String(raw.descripcion || raw.description || raw.nombre || "").trim();
      if (!descripcion) return null;
      const candidateInput = {
        descripcion,
        codigo: raw.codigo || raw.code || "",
        proveedor: data?.proveedor || "",
      };
      const { material, score } = bestCatalogMatch(catalog, candidateInput);
      const strong = material && materialMatchIsStrong(score);
      return {
        descripcion,
        descripcion_original: descripcion,
        codigo: String(raw.codigo || raw.code || material?.codigo || "").trim(),
        cantidad: numberOrNull(raw.cantidad ?? raw.quantity),
        unidad: normalizeUnidadMedida(raw.unidad || raw.unit || material?.unidad, "unidad"),
        precio_unitario: numberOrNull(raw.precio_unitario ?? raw.precio),
        total: numberOrNull(raw.total),
        moneda: String(raw.moneda || data?.moneda || "ARS").toUpperCase() === "USD" ? "USD" : "ARS",
        proveedor: String(data?.proveedor || "").trim(),
        material_id: strong ? material.id : null,
        material_sugerido_id: material?.id || null,
        confianza: material ? score : null,
        revision: strong ? "vinculado" : material ? "revisar" : "sin_coincidencia",
      };
    })
    .filter(Boolean);
}

async function fetchScannerReceiptById(id) {
  const { data: receipt, error } = await supabase
    .from("panol_comprobantes")
    .select("id,proveedor,numero,fecha,archivo_url,archivo_nombre,archivo_mime,sede,recepcion_estado,panol_envio_id,created_at,procesado_at")
    .eq("id", id)
    .single();
  if (error) throwFriendly(error);
  const { data: items, error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .select("id,comprobante_id,material_id,descripcion,descripcion_original,cantidad,scanner_confianza,scanner_material_sugerido_id,scanner_revision,scanner_unidad,scanner_ingreso_envio_id")
    .eq("comprobante_id", id)
    .order("id");
  if (itemsError) throwFriendly(itemsError);
  return { ...receipt, items: items || [] };
}

export async function processScannedReceipt(file, { sede = null, proveedor = "" } = {}) {
  validateFile(file);
  const hash = await sha256(file);

  const { data: existing, error: existingError } = await supabase
    .from("panol_comprobantes")
    .select("id")
    .eq("origen_carga", "scanner_panol")
    .eq("archivo_hash", hash)
    .maybeSingle();
  if (existingError) throwFriendly(existingError);
  if (existing?.id) {
    return { ...(await fetchScannerReceiptById(existing.id)), duplicate: true };
  }

  const [parsed, catalog] = await Promise.all([
    // El proveedor que eligio la persona antes de escanear entra como contexto:
    // ayuda a interpretar descripciones abreviadas y le saca a la IA la parte
    // que peor hace, que es adivinar de quien es el remito.
    leerPresupuestoConIA({ file, tipoEsperado: "remito", proveedor }),
    fetchPanolCatalogFull(),
  ]);
  assertRemitoExtraction(parsed);
  const items = normalizedAiItems(parsed, catalog);
  if (!items.length) throw new Error("La IA no encontró renglones en este remito.");

  const extension = String(file.name || "").split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg");
  const storagePath = `scanner-panol/${safePart(sede || "sin-sede")}/${new Date().toISOString().slice(0, 10)}/${hash.slice(0, 16)}-${safePart(file.name || `remito.${extension}`)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || (extension === "pdf" ? "application/pdf" : "image/jpeg"),
  });
  if (uploadError) throw uploadError;

  let receiptId = null;
  try {
    const linked = items.filter((item) => item.material_id).length;
    const receptionState = linked === items.length ? "listo_ingreso" : "requiere_revision";
    const total = numberOrNull(parsed?.total)
      ?? items.reduce((sum, item) => sum + (numberOrNull(item.total) || 0), 0)
      ?? null;
    const { data: receipt, error: receiptError } = await supabase
      .from("panol_comprobantes")
      .insert({
        proveedor: String(parsed?.proveedor || "").trim() || null,
        numero: String(parsed?.numero || "").trim() || null,
        fecha: parsed?.fecha || new Date().toISOString().slice(0, 10),
        moneda: String(parsed?.moneda || "ARS").toUpperCase() === "USD" ? "USD" : "ARS",
        archivo_url: storagePath,
        archivo_hash: hash,
        archivo_nombre: file.name || `remito.${extension}`,
        archivo_mime: file.type || (extension === "pdf" ? "application/pdf" : "image/jpeg"),
        sede: sede || null,
        estado: "borrador",
        recepcion_estado: receptionState,
        origen_carga: "scanner_panol",
        total: total || null,
      })
      .select("id")
      .single();
    if (receiptError) throwFriendly(receiptError);
    receiptId = receipt.id;

    const rows = items.map((item) => ({
      comprobante_id: receipt.id,
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
    const { error: itemsError } = await supabase.from("panol_comprobante_items").insert(rows);
    if (itemsError) throwFriendly(itemsError);
    return fetchScannerReceiptById(receipt.id);
  } catch (error) {
    if (receiptId) {
      await supabase.from("panol_comprobante_items").delete().eq("comprobante_id", receiptId);
      await supabase.from("panol_comprobantes").delete().eq("id", receiptId);
    }
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function fetchScannedReceipts({ sede = null, limit = 60 } = {}) {
  let query = supabase
    .from("panol_comprobantes")
    .select("id,proveedor,numero,fecha,archivo_url,archivo_nombre,archivo_mime,sede,recepcion_estado,panol_envio_id,created_at,procesado_at")
    .eq("origen_carga", "scanner_panol")
    .neq("recepcion_estado", "archivado")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sede) query = query.eq("sede", sede);
  const { data: receipts, error } = await query;
  if (error) throwFriendly(error);
  if (!receipts?.length) return [];

  const ids = receipts.map((row) => row.id);
  const { data: items, error: itemsError } = await supabase
    .from("panol_comprobante_items")
    .select("id,comprobante_id,material_id,descripcion,descripcion_original,cantidad,scanner_confianza,scanner_material_sugerido_id,scanner_revision,scanner_unidad,scanner_ingreso_envio_id")
    .in("comprobante_id", ids)
    .order("id");
  if (itemsError) throwFriendly(itemsError);
  const byReceipt = new Map();
  for (const item of items || []) {
    const bucket = byReceipt.get(item.comprobante_id) || [];
    bucket.push(item);
    byReceipt.set(item.comprobante_id, bucket);
  }
  return receipts.map((row) => ({ ...row, items: byReceipt.get(row.id) || [] }));
}

export function scannerReceiptPrefill(receipt) {
  const provider = String(receipt?.proveedor || "").trim();
  const number = String(receipt?.numero || "").trim();
  return {
    origen: "remito",
    modo: "remito",
    scannerReceiptId: receipt?.id || null,
    scannerStrict: true,
    sede: receipt?.sede || "",
    titulo: ["Remito", provider, number].filter(Boolean).join(" · "),
    observaciones: `Documento escaneado${number ? ` Nº ${number}` : ""}${provider ? ` · ${provider}` : ""}. Original archivado en el sistema.`,
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
  if (!id) return;
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
