// Portal de proveedores — acceso por token (link mágico), sin cuenta de usuario.
// El proveedor ve SUS pedidos activos, confirma entregas y sube facturas.
// Toda la seguridad pasa por acá: el front nunca consulta las tablas directo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version",
};

// El preflight tiene que permitir exactamente los headers que pide el navegador
// (supabase-js suma x-region / x-supabase-api-version según versión).
function withCors(req: Request) {
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  return requestedHeaders
    ? { ...corsHeaders, "Access-Control-Allow-Headers": requestedHeaders }
    : corsHeaders;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PEDIDO_ACTIVO = ["nuevo", "en_revision", "cotizando", "comprado"];
const BUCKET = "purchase-request-photos";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: withCors(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();
    const token = String(body?.token || "").trim();
    const action = String(body?.action || "get").trim();
    if (!token || token.length < 20) return json({ error: "Link inválido" }, 401);

    // ── Validar token ──
    const { data: tok, error: tokErr } = await admin
      .from("portal_proveedor_tokens")
      .select("id, proveedor, activo")
      .eq("token", token)
      .maybeSingle();
    if (tokErr || !tok || !tok.activo) return json({ error: "Link inválido o dado de baja. Pedile uno nuevo a compras." }, 401);
    admin.from("portal_proveedor_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id).then(() => {});

    // ── Pedidos del proveedor (match tolerante por nombre) ──
    async function pedidosDelProveedor() {
      const { data: reqs, error } = await admin
        .from("purchase_requests")
        .select("id, title, description, status, priority, needed_at, created_at, proveedor, project:produccion_obras!purchase_requests_project_id_fkey(codigo)")
        .ilike("proveedor", `%${tok.proveedor}%`)
        .in("status", PEDIDO_ACTIVO)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const ids = (reqs ?? []).map((r) => r.id);
      let itemsByReq = new Map<string, unknown[]>();
      let eventosByReq = new Map<string, unknown[]>();
      if (ids.length) {
        const [itemsRes, evRes] = await Promise.all([
          admin.from("purchase_request_items")
            .select("request_id, description, quantity, unit, status")
            .in("request_id", ids),
          admin.from("portal_proveedor_eventos")
            .select("request_id, tipo, mensaje, archivo_url, fecha_estimada, created_at")
            .in("request_id", ids)
            .order("created_at", { ascending: false }),
        ]);
        for (const it of itemsRes.data ?? []) {
          const list = itemsByReq.get(it.request_id) ?? [];
          list.push({ description: it.description, quantity: it.quantity, unit: it.unit, status: it.status });
          itemsByReq.set(it.request_id, list);
        }
        for (const ev of evRes.data ?? []) {
          const list = eventosByReq.get(ev.request_id) ?? [];
          list.push(ev);
          eventosByReq.set(ev.request_id, list);
        }
      }
      return (reqs ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
        needed_at: r.needed_at,
        created_at: r.created_at,
        obra: (r as { project?: { codigo?: string } }).project?.codigo ?? null,
        items: itemsByReq.get(r.id) ?? [],
        eventos: eventosByReq.get(r.id) ?? [],
      }));
    }

    if (action === "get") {
      const pedidos = await pedidosDelProveedor();
      return json({ proveedor: tok.proveedor, pedidos });
    }

    // ── Acciones sobre un pedido: verificar que el pedido sea del proveedor ──
    const requestId = String(body?.request_id || "").trim();
    if (!requestId) return json({ error: "Falta el pedido" }, 400);
    const { data: reqRow } = await admin
      .from("purchase_requests")
      .select("id, proveedor, title")
      .eq("id", requestId)
      .ilike("proveedor", `%${tok.proveedor}%`)
      .maybeSingle();
    if (!reqRow) return json({ error: "Ese pedido no corresponde a este proveedor" }, 403);

    if (action === "confirmar") {
      const fecha = String(body?.fecha_estimada || "").trim() || null;
      const mensaje = String(body?.mensaje || "").trim() || null;
      const { error } = await admin.from("portal_proveedor_eventos").insert({
        token_id: tok.id, request_id: requestId, proveedor: tok.proveedor,
        tipo: "entrega_confirmada", mensaje, fecha_estimada: fecha,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "comentario") {
      const mensaje = String(body?.mensaje || "").trim();
      if (!mensaje) return json({ error: "Escribí un mensaje" }, 400);
      const { error } = await admin.from("portal_proveedor_eventos").insert({
        token_id: tok.id, request_id: requestId, proveedor: tok.proveedor,
        tipo: "comentario", mensaje: mensaje.slice(0, 1000),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "factura") {
      const base64 = String(body?.base64 || "").trim();
      const mime = String(body?.mime_type || "application/pdf");
      const filename = String(body?.filename || "factura.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 80);
      if (!base64) return json({ error: "Falta el archivo" }, 400);
      if (base64.length > 11_000_000) return json({ error: "Archivo muy pesado (máx ~8MB)" }, 400);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `portal-facturas/${requestId}/${Date.now()}-${filename}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await admin.from("portal_proveedor_eventos").insert({
        token_id: tok.id, request_id: requestId, proveedor: tok.proveedor,
        tipo: "factura", mensaje: String(body?.mensaje || "").trim() || null, archivo_url: pub?.publicUrl ?? path,
      });
      if (error) throw error;
      return json({ ok: true, url: pub?.publicUrl ?? null });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (error) {
    console.error("[portal-proveedor]", error);
    return json({ error: error instanceof Error ? error.message : "Error del portal" }, 400);
  }
});
