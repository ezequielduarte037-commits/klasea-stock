import { supabase } from "@/supabaseClient";

export const PURCHASE_PHOTOS_BUCKET = "purchase-request-photos";

export const REQUEST_STATUSES = [
  { value: "nuevo", label: "Nuevo" },
  { value: "en_revision", label: "En revision" },
  { value: "cotizando", label: "Cotizando" },
  { value: "comprado", label: "Comprado" },
  { value: "recibido", label: "Recibido" },
  { value: "cancelado", label: "Cancelado" },
];

export const REQUEST_PRIORITIES = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const REQUEST_SELECT = `
  *,
  creator:profiles!purchase_requests_created_by_fkey(id, username, role, is_admin),
  assignee:profiles!purchase_requests_assigned_to_fkey(id, username, role, is_admin),
  project:produccion_obras!purchase_requests_project_id_fkey(id, codigo, descripcion, estado),
  followers:request_followers(
    user_id,
    created_at,
    profile:profiles!request_followers_user_id_fkey(id, username, role, is_admin)
  )
`;

const DETAIL_SELECT = `
  ${REQUEST_SELECT},
  comments:request_comments(
    id,
    body,
    created_at,
    updated_at,
    author_id,
    author:profiles!request_comments_author_id_fkey(id, username, role, is_admin),
    mentions:request_comment_mentions(
      mentioned_user_id,
      profile:profiles!request_comment_mentions_mentioned_user_id_fkey(id, username, role)
    )
  )
`;

const ADDITIONAL_BOARD_SELECT = `
  *,
  project:produccion_obras!purchase_additional_boards_project_id_fkey(id, codigo, descripcion, estado)
`;

const ADDITIONAL_ITEM_SELECT = `
  *,
  request:purchase_requests!purchase_additional_items_purchase_request_id_fkey(id, title, status, priority, created_at, proveedor, estimated_amount, actual_amount, project_id)
`;

function safeFilePart(value) {
  return String(value || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function isPurchaseManager(profile) {
  return !!profile?.is_admin || profile?.role === "admin" || profile?.role === "compras";
}

export function usernameOf(profile) {
  return profile?.username || profile?.nombre_completo || "Sin nombre";
}

export async function uploadPurchaseRequestPhoto(file, userId) {
  if (!file) return { photoUrl: null, photoPath: null };

  const ext = safeFilePart(file.name.split(".").pop() || "jpg").toLowerCase();
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${Date.now()}-${id}.${ext}`;

  const { error } = await supabase.storage
    .from(PURCHASE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PURCHASE_PHOTOS_BUCKET).getPublicUrl(path);
  return { photoUrl: data.publicUrl, photoPath: path };
}

export async function createPurchaseRequest({ form, ccUserIds = [], photoFile }) {
  // Usamos getSession (lee de localStorage) en vez de getUser (golpea servidor y
  // puede gatillar un refresh que invalide la sesión si el refresh token está roto).
  const { data: { session } = {}, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const userId = session?.user?.id;
  if (!userId) throw new Error("No hay usuario autenticado.");

  const { photoUrl, photoPath } = await uploadPurchaseRequestPhoto(photoFile, userId);

  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    photo_url: photoUrl,
    photo_path: photoPath,
    priority: form.priority || "media",
    status: "nuevo",
    project_id: form.project_id || null,
    needed_at: form.needed_at || null,
    source: form.source || null,
    source_ref: form.source_ref || null,
    source_url: form.source_url || null,
    created_by: userId,
  };

  const { data: request, error } = await supabase
    .from("purchase_requests")
    .insert(payload)
    .select(REQUEST_SELECT)
    .single();

  if (error) throw error;

  const followerRows = [...new Set(ccUserIds)]
    .filter((id) => id && id !== userId)
    .map((id) => ({ request_id: request.id, user_id: id, added_by: userId }));

  if (followerRows.length) {
    const { error: followersError } = await supabase
      .from("request_followers")
      .upsert(followerRows, { onConflict: "request_id,user_id", ignoreDuplicates: true });
    if (followersError) throw followersError;
  }

  return request;
}

export async function fetchPurchaseRequests() {
  // last_comment_author_id viaja denormalizado en la fila (trigger).
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchPurchaseRequestDetail(requestId) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(DETAIL_SELECT)
    .eq("id", requestId)
    .single();

  if (error) throw error;
  return {
    ...data,
    comments: [...(data.comments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  };
}

export async function updatePurchaseRequest(requestId, patch) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .update(patch)
    .eq("id", requestId)
    .select(REQUEST_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function addRequestFollower(requestId, userId) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  const { error } = await supabase
    .from("request_followers")
    .upsert(
      { request_id: requestId, user_id: userId, added_by: session?.user?.id || null },
      { onConflict: "request_id,user_id", ignoreDuplicates: true },
    );

  if (error) throw error;
}

export async function removeRequestFollower(requestId, userId) {
  const { error } = await supabase
    .from("request_followers")
    .delete()
    .eq("request_id", requestId)
    .eq("user_id", userId);

  if (error) throw error;
}

export function extractMentionUserIds(text, users) {
  const found = new Set();
  const lowered = text.toLowerCase();

  users.forEach((user) => {
    const username = user.username?.toLowerCase();
    if (username && lowered.includes(`@${username}`)) found.add(user.id);
  });

  return [...found];
}

export async function addRequestComment(requestId, body, users = []) {
  const clean = body.trim();
  if (!clean) return null;

  // getSession lee localStorage (no dispara refresh ni cierra sesión si el
  // refresh token está vencido). Solo necesitamos el uid para llenar author_id;
  // la validación real la hace RLS contra auth.uid() del JWT del request.
  const { data: { session } = {}, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const userId = session?.user?.id;
  if (!userId) throw new Error("No hay usuario autenticado.");

  const { data: comment, error } = await supabase
    .from("request_comments")
    .insert({ request_id: requestId, author_id: userId, body: clean })
    .select("id")
    .single();

  if (error) throw error;

  const mentionRows = extractMentionUserIds(clean, users)
    .filter((id) => id !== userId)
    .map((id) => ({ comment_id: comment.id, mentioned_user_id: id }));

  if (mentionRows.length) {
    const { error: mentionsError } = await supabase
      .from("request_comment_mentions")
      .upsert(mentionRows, { onConflict: "comment_id,mentioned_user_id", ignoreDuplicates: true });
    if (mentionsError) throw mentionsError;
  }

  return comment;
}

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, is_admin")
    .neq("role", "cliente")
    .order("username");

  if (error) throw error;
  return data || [];
}

export async function fetchProjects() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id, codigo, descripcion, estado")
    .order("codigo");

  if (error) throw error;
  return (data || []).filter((project) => project.estado !== "archivada");
}

// --- ADICIONALES -----------------------------------------------------------

export async function fetchAdditionalBoards() {
  const { data, error } = await supabase
    .from("purchase_additional_boards")
    .select(ADDITIONAL_BOARD_SELECT)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createAdditionalBoard(fields) {
  const payload = {
    name: fields.name?.trim(),
    project_id: fields.project_id || null,
    notes: fields.notes?.trim() || null,
    status: fields.status || "activo",
  };

  const { data, error } = await supabase
    .from("purchase_additional_boards")
    .insert(payload)
    .select(ADDITIONAL_BOARD_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateAdditionalBoard(id, patch) {
  const { data, error } = await supabase
    .from("purchase_additional_boards")
    .update(patch)
    .eq("id", id)
    .select(ADDITIONAL_BOARD_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAdditionalBoard(id) {
  const { error } = await supabase
    .from("purchase_additional_boards")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function fetchAdditionalItems(boardId = null) {
  let query = supabase
    .from("purchase_additional_items")
    .select(ADDITIONAL_ITEM_SELECT)
    .order("entry_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (boardId) query = query.eq("board_id", boardId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createAdditionalItem(fields) {
  const payload = {
    board_id: fields.board_id,
    purchase_request_id: fields.purchase_request_id || null,
    entry_date: fields.entry_date || null,
    provider: fields.provider?.trim() || null,
    detail: fields.detail?.trim(),
    amount: fields.amount === "" || fields.amount === undefined || fields.amount === null ? null : Number(fields.amount),
    notes: fields.notes?.trim() || null,
  };

  const { data, error } = await supabase
    .from("purchase_additional_items")
    .insert(payload)
    .select(ADDITIONAL_ITEM_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateAdditionalItem(id, patch) {
  const payload = { ...patch };
  if (payload.provider !== undefined) payload.provider = payload.provider?.trim() || null;
  if (payload.detail !== undefined) payload.detail = payload.detail?.trim();
  if (payload.notes !== undefined) payload.notes = payload.notes?.trim() || null;
  if (payload.amount !== undefined) {
    payload.amount = payload.amount === "" || payload.amount === null ? null : Number(payload.amount);
  }

  const { data, error } = await supabase
    .from("purchase_additional_items")
    .update(payload)
    .eq("id", id)
    .select(ADDITIONAL_ITEM_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAdditionalItem(id) {
  const { error } = await supabase
    .from("purchase_additional_items")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// --- FACTURAS / COMPROBANTES ----------------------------------------------

export async function uploadInvoice(file, userId) {
  if (!file) return { invoiceUrl: null, invoicePath: null };

  const ext = safeFilePart(file.name.split(".").pop() || "pdf").toLowerCase();
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `invoices/${userId}/${Date.now()}-${id}.${ext}`;

  const { error } = await supabase.storage
    .from(PURCHASE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/pdf",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PURCHASE_PHOTOS_BUCKET).getPublicUrl(path);
  return { invoiceUrl: data.publicUrl, invoicePath: path };
}

// ─── ANALYTICS / DASHBOARD ────────────────────────────────────────────

export async function fetchMonthlySpending() {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("actual_amount, created_at")
    .not("actual_amount", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const byMonth = {};
  (data || []).forEach((r) => {
    const month = r.created_at?.slice(0, 7);
    if (!month) return;
    byMonth[month] = (byMonth[month] || 0) + Number(r.actual_amount);
  });

  return Object.entries(byMonth).map(([month, total]) => ({ month, total }));
}

export async function fetchOverdueRequests() {
  // Vencidos = fecha estimada de entrega ya pasó (estrictamente menor a hoy).
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(REQUEST_SELECT)
    .not("estimated_delivery_at", "is", null)
    .not("status", "in", `("recibido","cancelado")`)
    .lt("estimated_delivery_at", today)
    .order("estimated_delivery_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchAnalyticsStats() {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("status, priority, estimated_amount, actual_amount, created_at");

  if (error) throw error;
  const rows = data || [];

  const totalEstimated = rows.reduce((s, r) => s + (Number(r.estimated_amount) || 0), 0);
  const totalActual = rows.reduce((s, r) => s + (Number(r.actual_amount) || 0), 0);
  const pending = rows.filter((r) => !["recibido", "cancelado"].includes(r.status)).length;
  const urgentes = rows.filter((r) => r.priority === "urgente" && !["recibido", "cancelado"].includes(r.status)).length;

  // Tiempo promedio nuevo → comprado
  const completed = rows.filter((r) => r.status === "comprado" || r.status === "recibido");
  let avgDays = 0;
  if (completed.length > 0) {
    const totalDays = completed.reduce((s, r) => {
      const created = r.created_at ? new Date(r.created_at) : null;
      const updated = r.updated_at ? new Date(r.updated_at) : null;
      if (!created || !updated) return s;
      return s + Math.round((updated - created) / (1000 * 60 * 60 * 24));
    }, 0);
    avgDays = Math.round(totalDays / completed.length);
  }

  return { totalEstimated, totalActual, pending, urgentes, avgDays, totalRequests: rows.length };
}

// ─── Purchase Log (manual purchases) ───────────────────────────────────────────

const LOG_SELECT = `
  *,
  creator:profiles!purchase_log_created_by_fkey(id, username, role, is_admin)
`;

export async function fetchPurchaseLog() {
  const { data, error } = await supabase
    .from("purchase_log")
    .select(LOG_SELECT)
    .order("purchased_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createPurchaseLog(entry) {
  const { data, error } = await supabase
    .from("purchase_log")
    .insert(entry)
    .select(LOG_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseLog(id, patch) {
  const { data, error } = await supabase
    .from("purchase_log")
    .update(patch)
    .eq("id", id)
    .select(LOG_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deletePurchaseLog(id) {
  const { error } = await supabase
    .from("purchase_log")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function deletePurchaseRequest(id) {
  const { error } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function uploadPurchaseLogInvoice(file, userId) {
  if (!file) return { url: null, path: null };
  const rawExt = (file.name.split(".").pop() || "pdf").toLowerCase();
  const ext = safeFilePart(rawExt) || "pdf";
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `invoices/${userId}/${Date.now()}-${id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PURCHASE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage
    .from(PURCHASE_PHOTOS_BUCKET)
    .getPublicUrl(path);
  return { url: urlData.publicUrl, path };
}

export async function notifyComprasEmail(payload) {
  const { error } = await supabase.functions.invoke("notificar-email-compras", {
    body: payload,
  })
  if (error) console.warn("notifyComprasEmail error:", error)
}

// Notifica vía WhatsApp AL CREADOR del pedido cuando alguien que NO es él hace
// una actualización (cambio de status, prioridad, ítem, comentario, etc).
// Fire-and-forget: si falla (ej. ventana de 24h cerrada), no rompe el flow.
//
// payload: { requestId, eventType, payload, actorId }
//   eventType: "status" | "priority" | "comment" | "item_status"
//            | "amount" | "delivery_date" | "received"
export async function notifyWaUpdate(payload) {
  try {
    const { error } = await supabase.functions.invoke("notify-wa-update", { body: payload });
    if (error) console.warn("notifyWaUpdate error:", error);
  } catch (e) {
    console.warn("notifyWaUpdate exception:", e);
  }
}

// ─── PURCHASE REQUEST ITEMS ─────────────────────────────────────────────

export const ITEM_STATUSES = [
  { value: "pendiente",  label: "Pendiente",  color: "#a1a1aa" },
  { value: "en_panol",   label: "En pañol",   color: "#3b82f6" },
  { value: "pedido",     label: "Pedido",     color: "#f59e0b" },
  { value: "recibido",   label: "Recibido",   color: "#10b981" },
  { value: "cancelado",  label: "Cancelado",  color: "#ef4444" },
];

export async function fetchRequestItems(requestId) {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addRequestItem(requestId, fields) {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .insert({ request_id: requestId, ...fields })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRequestItem(itemId, patch) {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRequestItem(itemId) {
  const { error } = await supabase
    .from("purchase_request_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

export async function uploadItemImage(file, requestId) {
  if (!file) return { imageUrl: null, imagePath: null };
  const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const ext = rawExt.replace(/[^a-z0-9]/g, "") || "jpg";
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `items/${safeFilePart(requestId)}/${Date.now()}-${id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(PURCHASE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(PURCHASE_PHOTOS_BUCKET).getPublicUrl(path);
  return { imageUrl: data.publicUrl, imagePath: path };
}
