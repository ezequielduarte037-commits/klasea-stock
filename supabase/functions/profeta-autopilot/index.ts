// EL PROFETA — Autopiloto nocturno.
// Corre por pg_cron todas las madrugadas: consulta vw_profeta_alertas y, para
// cada producto con quiebre inminente (requiere_compra_urgente), genera un
// borrador de pedido en compras (si no existe ya uno abierto del Profeta para
// ese material) y manda el parte de guerra por WhatsApp.
//
// Secrets necesarios (además de los de siempre):
//   PROFETA_USER_ID  → uuid del usuario "sistema" que firma los pedidos
//   PROFETA_WA_TO    → número de WhatsApp que recibe el resumen (ej: 549298...)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendText } from "../_shared/whatsapp.ts";

const MARCA = "[Profeta]";

function fmt(n: unknown): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // 1 ── Consultar al oráculo
    const { data: alertas, error } = await admin
      .from("vw_profeta_alertas")
      .select("*")
      .eq("requiere_compra_urgente", true)
      .order("dias_para_quiebre", { ascending: true, nullsFirst: false })
      .limit(25);
    if (error) throw error;

    if (!alertas?.length) {
      return Response.json({ ok: true, urgentes: 0, creados: 0, msg: "Sin quiebres a la vista." });
    }

    // 2 ── Evitar duplicados: pedidos del Profeta aún abiertos (últimos 21 días)
    const { data: abiertos } = await admin
      .from("purchase_requests")
      .select("id, title, description, status")
      .ilike("title", `${MARCA}%`)
      .not("status", "in", '("recibido","cancelado")')
      .gte("created_at", new Date(Date.now() - 21 * 86400_000).toISOString());
    const yaAvisados = new Set(
      (abiertos ?? [])
        .map((r) => String(r.description || "").match(/material:([0-9a-f-]{36})/)?.[1])
        .filter(Boolean),
    );

    const systemUser = Deno.env.get("PROFETA_USER_ID") || null;
    const creados: string[] = [];
    const omitidos: string[] = [];

    // 3 ── Generar borradores para los que no tienen pedido abierto
    for (const a of alertas) {
      if (yaAvisados.has(a.material_id)) {
        omitidos.push(a.descripcion);
        continue;
      }
      const cantidad = Math.max(1, Number(a.cantidad_sugerida) || 1);
      const { data: reqRow, error: reqErr } = await admin
        .from("purchase_requests")
        .insert({
          title: `${MARCA} ${a.descripcion} ×${cantidad} — quiebre en ${fmt(a.dias_para_quiebre)} días`,
          description: [
            "Borrador generado automáticamente por El Profeta (autopiloto nocturno).",
            `material:${a.material_id}`,
            `Stock actual: ${fmt(a.stock_actual)} ${a.unidad_medida || "unidad"} · consumo diario: ${fmt(a.burn_rate_diario)}.`,
            `Lead time ${a.proveedor || "proveedor"}: ~${fmt(a.lead_time_proveedor)} días.`,
            Number(a.demanda_obras_activas) > 0 ? `Demanda pendiente de obras activas: ${fmt(a.demanda_obras_activas)}.` : "",
          ].filter(Boolean).join("\n"),
          status: "nuevo",
          priority: Number(a.dias_para_quiebre ?? 0) <= Number(a.lead_time_proveedor ?? 7) ? "urgente" : "alta",
          proveedor: a.proveedor || null,
          tipo_pedido: "stock",
          es_adicional: false,
          source: "profeta",
          ...(systemUser ? { created_by: systemUser } : {}),
        })
        .select("id")
        .single();
      if (reqErr) {
        console.error("[profeta] no pude crear pedido:", a.descripcion, reqErr.message);
        continue;
      }
      await admin.from("purchase_request_items").insert({
        request_id: reqRow.id,
        description: a.descripcion,
        quantity: String(cantidad),
        unit: a.unidad_medida || "unidad",
      });
      creados.push(`${a.descripcion} ×${cantidad} (${fmt(a.dias_para_quiebre)}d)`);
    }

    // 4 ── Parte de guerra por WhatsApp
    const waTo = Deno.env.get("PROFETA_WA_TO");
    if (waTo && (creados.length || alertas.length)) {
      const lineas = [
        "🔮 *EL PROFETA — parte de la madrugada*",
        "",
        `⚠️ ${alertas.length} producto(s) con quiebre inminente.`,
        creados.length ? `📝 Generé ${creados.length} borrador(es) de compra:` : "",
        ...creados.map((c) => `  • ${c}`),
        omitidos.length ? `⏭ ${omitidos.length} ya tenían pedido abierto.` : "",
        "",
        "Entrá a Compras para revisar y confirmar.",
      ].filter(Boolean);
      try {
        await sendText(waTo, lineas.join("\n"));
      } catch (waErr) {
        console.warn("[profeta] WhatsApp falló (sigo igual):", (waErr as Error).message);
      }
    }

    return Response.json({ ok: true, urgentes: alertas.length, creados: creados.length, omitidos: omitidos.length });
  } catch (error) {
    console.error("[profeta-autopilot]", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
});
