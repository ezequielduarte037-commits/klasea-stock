import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertComprasAvisoAccess,
  assertPurchaseRequestAccess,
  authenticateFunctionRequest,
  createAdminClient,
  ResponseError,
} from "../_shared/functionAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function subjectText(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createAdminClient();
    const auth = await authenticateFunctionRequest(req, supabase, { allowServiceRole: true });
    const payload = await req.json();
    const {
      type,
      requestTitle,
      changedBy: requestedChangedBy,
      message,
      newStatus,
      oldStatus,
      newPriority,
      oldPriority,
      newPriorityLabel,
      oldPriorityLabel,
      createdByName,
      source,
      avisoId,
    } = payload;

    const requestId = payload.requestId ? String(payload.requestId) : "";
    const safeAvisoId = avisoId ? String(avisoId) : "";
    if (requestId) await assertPurchaseRequestAccess(supabase, requestId, auth);
    else if (safeAvisoId) await assertComprasAvisoAccess(supabase, safeAvisoId, auth);
    else if (!auth.isService) throw new ResponseError("Falta pedido o aviso para autorizar", 400);

    const changedBy = auth.isService ? requestedChangedBy : auth.userId;
    if (changedBy) {
      const { data: who } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", changedBy)
        .maybeSingle();
      if (who && (who.role === "compras" || who.role === "admin")) {
        return json({ message: "Cambio hecho por compras/admin, omitido" });
      }
    }

    // La ficha del pedido sale de la base, no del payload. El cliente manda el
    // título y nada más, pero la obra, la prioridad, la fecha y sobre todo QUÉ
    // se está pidiendo es lo que hace falta para decidir sin abrir la app.
    //
    // Los ítems se pueden leer acá porque la pantalla llama a esta función
    // después de crearlos; el trigger viejo de la base corría en el INSERT de
    // purchase_requests, cuando todavía no existía ni un renglón.
    let solicitud: Record<string, unknown> | null = null;
    let items: Array<Record<string, unknown>> = [];
    if (requestId) {
      const { data: fila } = await supabase
        .from("purchase_requests")
        .select("id,title,status,priority,needed_at,project:produccion_obras!purchase_requests_project_id_fkey(codigo)")
        .eq("id", requestId)
        .maybeSingle();
      solicitud = fila ?? null;
      const { data: filas } = await supabase
        .from("purchase_request_items")
        .select("description,quantity,unit,notes")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });
      items = filas ?? [];
    }

    const PRIORIDADES: Record<string, string> = {
      baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
    };
    const obraCodigo = (solicitud?.project as { codigo?: string } | null)?.codigo ?? null;
    const prioridadSolicitud = solicitud?.priority ? String(solicitud.priority) : "";

    // Bloque "de qué pedido hablamos", igual en todos los avisos.
    const ficha = [
      obraCodigo ? `<p style="margin:0 0 4px"><strong>Obra:</strong> ${escapeHtml(obraCodigo)}</p>` : "",
      prioridadSolicitud
        ? `<p style="margin:0 0 4px"><strong>Prioridad:</strong> ${escapeHtml(PRIORIDADES[prioridadSolicitud] ?? prioridadSolicitud)}</p>`
        : "",
      solicitud?.needed_at
        ? `<p style="margin:0 0 4px"><strong>Necesario para:</strong> ${escapeHtml(solicitud.needed_at)}</p>`
        : "",
    ].join("");

    // Los renglones del pedido. Sin esto el mail de "nueva solicitud" avisaba que
    // había un pedido pero no qué tenía adentro.
    const tablaItems = items.length
      ? `<p style="margin:14px 0 6px"><strong>Qué se pide (${items.length}):</strong></p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;font-size:13px">
${items.map((item) => `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#475569">${escapeHtml(item.quantity ?? "")} ${escapeHtml(item.unit ?? "")}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${escapeHtml(item.description)}${item.notes ? `<br><span style="color:#94a3b8">${escapeHtml(item.notes)}</span>` : ""}</td>
</tr>`).join("")}
</table>`
      : "";

    const baseUrl = "https://klasea-stock.vercel.app/compras";
    const link = safeAvisoId
      ? `${baseUrl}?tab=avisos&aviso=${encodeURIComponent(safeAvisoId)}`
      : (requestId ? `${baseUrl}?open=${encodeURIComponent(requestId)}` : baseUrl);
    const safeTitle = escapeHtml(solicitud?.title ?? requestTitle);
    const safeSource = escapeHtml(source);
    const actor = auth.isService ? (createdByName || changedBy) : (auth.profile?.username || changedBy);
    const safeActor = escapeHtml(actor || "Usuario");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    let subject = "";
    let html = "";
    if (type === "nuevo_aviso") {
      subject = `[Compras] Nuevo aviso: ${subjectText(requestTitle)}`;
      html = `<h2>Nuevo aviso a compras</h2>
<p><strong>Titulo:</strong> ${safeTitle}</p>
${source ? `<p><strong>Origen:</strong> ${safeSource}</p>` : ""}
<p><strong>Creado por:</strong> ${safeActor}</p>
${message ? `<p><strong>Detalle:</strong></p><blockquote style="border-left:3px solid #f59e0b;padding-left:12px;color:#666;margin:0">${safeMessage}</blockquote>` : ""}
<hr><a href="${link}" style="display:inline-block;background:#f59e0b;color:#111827;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver aviso</a>`;
    } else if (type === "new_request") {
      subject = `[Compras] Nueva solicitud: ${subjectText(solicitud?.title ?? requestTitle)}`;
      html = `<h2>Nueva solicitud de compra</h2>
<p style="margin:0 0 4px"><strong>Solicitud:</strong> ${safeTitle}</p>
${ficha}
${source ? `<p style="margin:0 0 4px"><strong>Origen:</strong> ${safeSource}</p>` : ""}
<p style="margin:0 0 4px"><strong>Creado por:</strong> ${safeActor}</p>
${tablaItems}
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver la solicitud</a>`;
    } else if (type === "new_message") {
      subject = `[Compras] Mensaje en: ${subjectText(solicitud?.title ?? requestTitle)}`;
      html = `<h2>Nuevo mensaje</h2>
<p style="margin:0 0 4px"><strong>Solicitud:</strong> ${safeTitle}</p>
${ficha}
<p style="margin:12px 0 4px"><strong>De:</strong> ${safeActor}</p>
<blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#666;margin:0">${safeMessage}</blockquote>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver la solicitud</a>`;
    } else if (type === "status_update") {
      subject = `[Compras] Estado actualizado: ${subjectText(solicitud?.title ?? requestTitle)}`;
      html = `<h2>Estado actualizado</h2>
<p style="margin:0 0 4px"><strong>Solicitud:</strong> ${safeTitle}</p>
${obraCodigo ? `<p style="margin:0 0 4px"><strong>Obra:</strong> ${escapeHtml(obraCodigo)}</p>` : ""}
<p style="margin:0 0 4px"><strong>Cambio:</strong> ${escapeHtml(oldStatus || "?")} -&gt; <strong>${escapeHtml(newStatus)}</strong></p>
<p style="margin:0 0 4px"><strong>Por:</strong> ${safeActor}</p>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver la solicitud</a>`;
    } else if (type === "pedido_recibido") {
      const origen = source === "laminacion" ? "laminacion" : "panol";
      subject = `[Compras] Pedido recibido en ${origen}: ${subjectText(requestTitle)}`;
      html = `<h2>Pedido recibido</h2>
<p>El pedido <strong>${safeTitle}</strong> fue recibido en <strong>${origen}</strong>.</p>
${message ? `<p style="color:#666">${safeMessage}</p>` : ""}
<hr><a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver el pedido</a>`;
    } else if (type === "priority_update") {
      const oldP = escapeHtml(oldPriorityLabel || oldPriority || "?");
      const newP = escapeHtml(newPriorityLabel || newPriority || "?");
      subject = `[Compras] Prioridad actualizada: ${subjectText(solicitud?.title ?? requestTitle)}`;
      html = `<h2>Prioridad actualizada</h2>
<p style="margin:0 0 4px"><strong>Solicitud:</strong> ${safeTitle}</p>
${obraCodigo ? `<p style="margin:0 0 4px"><strong>Obra:</strong> ${escapeHtml(obraCodigo)}</p>` : ""}
<p style="margin:0 0 4px"><strong>Cambio:</strong> ${oldP} -&gt; <strong>${newP}</strong></p>
<p style="margin:0 0 4px"><strong>Por:</strong> ${safeActor}</p>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ver la solicitud</a>`;
    } else {
      throw new ResponseError("Tipo de notificacion invalido", 400);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const comprasEmail = Deno.env.get("COMPRAS_EMAIL") ?? "compras@allyachts.com.ar";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Klase A Stock <notificaciones@envios.klasea.com>",
        to: [comprasEmail],
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend rechazo el email (${response.status}): ${detail.slice(0, 160)}`);
    }

    return json({ success: true, to: comprasEmail });
  } catch (error) {
    console.error("notificar-email-compras error:", error);
    const status = error instanceof ResponseError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Error interno";
    return json({ error: message }, status);
  }
});
