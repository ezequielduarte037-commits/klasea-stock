import { supabase } from "@/supabaseClient";

export const TASK_FILES_BUCKET = "obra-archivos";
export const TASK_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const TASK_FILE_MAX_BATCH = 20;

function safeFilePart(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110) || "archivo";
}

function uploadId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function fetchPlantillaTareaArchivos(tareaId) {
  if (!tareaId) return [];
  const { data, error } = await supabase
    .from("linea_proceso_tarea_archivos")
    .select("id,linea_proceso_tarea_id,nombre_archivo,storage_path,url_publica,tipo_mime,tamano_bytes,created_by,created_at")
    .eq("linea_proceso_tarea_id", tareaId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function subirPlantillaTareaArchivos(tareaId, files) {
  if (!tareaId) throw new Error("Falta la tarea de producción.");
  const selected = Array.from(files || []).filter(Boolean);
  if (!selected.length) return [];
  if (selected.length > TASK_FILE_MAX_BATCH) {
    throw new Error(`Podés subir hasta ${TASK_FILE_MAX_BATCH} archivos por vez.`);
  }

  const { data: { session } = {}, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  if (!session?.user?.id) throw new Error("No hay usuario autenticado.");

  const uploaded = [];
  for (const file of selected) {
    if (Number(file.size || 0) > TASK_FILE_MAX_BYTES) {
      throw new Error(`“${file.name}” supera el límite de 50 MB.`);
    }

    const contentType = String(file.type || "").trim() || "application/octet-stream";
    const path = `plantillas-tareas/${tareaId}/${uploadId()}-${safeFilePart(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(TASK_FILES_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(TASK_FILES_BUCKET).getPublicUrl(path);
    const { data, error } = await supabase
      .from("linea_proceso_tarea_archivos")
      .insert({
        linea_proceso_tarea_id: tareaId,
        nombre_archivo: file.name,
        storage_path: path,
        url_publica: publicData.publicUrl,
        tipo_mime: contentType,
        tamano_bytes: Number(file.size || 0),
      })
      .select("id,linea_proceso_tarea_id,nombre_archivo,storage_path,url_publica,tipo_mime,tamano_bytes,created_by,created_at")
      .single();

    if (error) {
      await supabase.storage.from(TASK_FILES_BUCKET).remove([path]);
      throw error;
    }
    uploaded.push(data);
  }
  return uploaded;
}

export async function eliminarPlantillaTareaArchivo(archivo) {
  if (!archivo?.id) return;
  const { error } = await supabase
    .from("linea_proceso_tarea_archivos")
    .delete()
    .eq("id", archivo.id);
  if (error) throw error;

  if (archivo.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(TASK_FILES_BUCKET)
      .remove([archivo.storage_path]);
    if (storageError) {
      console.warn("No se pudo limpiar el archivo del storage:", storageError.message);
    }
  }
}

