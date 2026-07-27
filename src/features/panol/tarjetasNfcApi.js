import { supabase } from "@/supabaseClient";
import { normalizeNfcUid } from "@/features/rrhh/api";

const BUCKET_FOTOS = "rrhh-fotos";

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export async function buscarEmpleadoHabilitadoPorDni(value) {
  const dni = digits(value);
  if (!/^\d{5,10}$/.test(dni)) throw new Error("Ingresá un DNI válido.");

  const { data, error } = await supabase.rpc("panol_buscar_empleado_por_dni", { p_dni: dni });
  if (error) throw error;
  return firstRow(data);
}

export async function buscarAsignacionPorUid(value) {
  const uid = normalizeNfcUid(value);
  if (uid.length < 4) return null;

  const { data, error } = await supabase.rpc("panol_buscar_empleado_por_nfc", { p_nfc_uid: uid });
  if (error) throw error;
  return firstRow(data);
}

export async function subirFotoNfcEmpleado(empleadoId, archivo) {
  if (!empleadoId || !archivo) return null;
  const tipo = archivo.type || "image/jpeg";
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const path = `${empleadoId}/panol-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(path, archivo, { contentType: tipo, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function asignarTarjetaNfc({ empleadoId, uid, fotoUrl = null }) {
  const clean = normalizeNfcUid(uid);
  if (!empleadoId) throw new Error("Primero buscá un empleado por DNI.");
  if (clean.length < 4) throw new Error("Apoyá una tarjeta NFC válida.");

  const { data, error } = await supabase.rpc("panol_asignar_tarjeta_nfc", {
    p_empleado_id: empleadoId,
    p_nfc_uid: clean,
    p_foto_url: fotoUrl,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function desvincularTarjetaNfc(empleadoId) {
  if (!empleadoId) return;
  const { error } = await supabase.rpc("panol_desvincular_tarjeta_nfc", {
    p_empleado_id: empleadoId,
  });
  if (error) throw error;
}
