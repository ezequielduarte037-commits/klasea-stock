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

    const baseUrl = "https://klasea-stock.vercel.app/compras";
    const link = safeAvisoId
      ? `${baseUrl}?tab=avisos&aviso=${encodeURIComponent(safeAvisoId)}`
      : (requestId ? `${baseUrl}?open=${encodeURIComponent(requestId)}` : baseUrl);
    const safeTitle = escapeHtml(requestTitle);
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
      subject = `[Compras] Nueva solicitud: ${subjectText(requestTitle)}`;
      html = `<h2>Nueva solicitud de compra</h2>
<p><strong>Titulo:</strong> ${safeTitle}</p>
${source ? `<p><strong>Origen:</strong> ${safeSource}</p>` : ""}
<p><strong>Creado por:</strong> ${safeActor}</p>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`;
    } else if (type === "new_message") {
      subject = `[Compras] Mensaje en: ${subjectText(requestTitle)}`;
      html = `<h2>Nuevo mensaje</h2>
<p><strong>Solicitud:</strong> ${safeTitle}</p>
<p><strong>De:</strong> ${safeActor}</p>
<p><strong>Mensaje:</strong></p><blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#666;margin:0">${safeMessage}</blockquote>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`;
    } else if (type === "status_update") {
      subject = `[Compras] Estado actualizado: ${subjectText(requestTitle)}`;
      html = `<h2>Estado actualizado</h2>
<p><strong>Solicitud:</strong> ${safeTitle}</p>
<p><strong>Cambio:</strong> ${escapeHtml(oldStatus || "?")} -&gt; <strong>${escapeHtml(newStatus)}</strong></p>
<p><strong>Por:</strong> ${safeActor}</p>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`;
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
      subject = `[Compras] Prioridad actualizada: ${subjectText(requestTitle)}`;
      html = `<h2>Prioridad actualizada</h2>
<p><strong>Solicitud:</strong> ${safeTitle}</p>
<p><strong>Cambio:</strong> ${oldP} -&gt; <strong>${newP}</strong></p>
<p><strong>Por:</strong> ${safeActor}</p>
<hr><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>`;
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
