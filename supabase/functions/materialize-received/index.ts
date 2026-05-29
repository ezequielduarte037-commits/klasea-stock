import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
}

function parseQty(value: unknown) {
  const raw = String(value ?? "").replace(",", ".")
  const match = raw.match(/-?\d+(\.\d+)?/)
  if (!match) return 0
  const qty = Number(match[0])
  return Number.isFinite(qty) ? qty : 0
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

function extractLinea(obra: Record<string, unknown>) {
  const byName = String(obra.nombre ?? "").match(/^K?(\d+)/i)
  if (byName) return `K${byName[1]}`
  const byDescription = String(obra.descripcion ?? "").match(/\b(K\d+)\b/i)
  if (byDescription) return byDescription[1].toUpperCase()
  return null
}

function obraCandidates(obra: Record<string, unknown>) {
  const nombre = String(obra.nombre ?? "").trim()
  const descripcion = String(obra.descripcion ?? "").trim()
  const linea = extractLinea(obra)
  const values = new Set<string>()
  for (const value of [nombre, descripcion]) {
    if (value) values.add(normalize(value))
  }
  if (linea) {
    values.add(normalize(linea))
    if (nombre) {
      values.add(normalize(`${linea}-${nombre}`))
      values.add(normalize(`${linea} ${nombre}`))
      values.add(normalize(`${linea}/${nombre}`))
    }
  }
  return values
}

async function findObra(supabase: ReturnType<typeof createClient>, destino: string) {
  const wanted = normalize(destino.replace(/^Obra\s+/i, ""))
  const { data, error } = await supabase
    .from("laminacion_obras")
    .select("id,nombre,descripcion,estado")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []).find((obra: Record<string, unknown>) => obraCandidates(obra).has(wanted)) ?? null
}

async function findLaminacionMaterialId(
  supabase: ReturnType<typeof createClient>,
  item: Record<string, unknown>,
) {
  if (item.material_id) return String(item.material_id)
  const desc = String(item.description ?? "").trim()
  if (!desc) return null

  const { data, error } = await supabase
    .from("laminacion_materiales")
    .select("id,nombre")
    .ilike("nombre", desc)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

async function markItem(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  result: Record<string, unknown>,
) {
  await supabase
    .from("purchase_request_items")
    .update({
      materialized_at: new Date().toISOString(),
      materialized_result: result,
    })
    .eq("id", itemId)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const { requestId } = await req.json()
    if (!requestId) return json({ error: "requestId es obligatorio" }, 400)

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: request, error: reqError } = await supabase
      .from("purchase_requests")
      .select("id,title,status,proveedor,created_by")
      .eq("id", requestId)
      .single()
    if (reqError) throw reqError
    if (!request) return json({ error: "Pedido no encontrado" }, 404)

    const { data: items, error: itemsError } = await supabase
      .from("purchase_request_items")
      .select("id,description,quantity,unit,destination,material_id,materialized_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true })
    if (itemsError) throw itemsError

    let created = 0
    let skipped = 0
    const errors: string[] = []
    const fecha = todayISODate()
    const prRef = `PR-${request.id}`

    for (const item of items ?? []) {
      const itemId = String(item.id)
      const description = String(item.description ?? "").trim()
      const destination = String(item.destination ?? "").trim()
      const qty = parseQty(item.quantity)

      if (item.materialized_at) {
        skipped += 1
        continue
      }
      if (!destination) {
        skipped += 1
        errors.push(`${description || itemId}: sin destino`)
        continue
      }
      if (qty <= 0) {
        skipped += 1
        errors.push(`${description || itemId}: cantidad invalida`)
        continue
      }

      if (/^Obra\s+/i.test(destination)) {
        const obra = await findObra(supabase, destination)
        if (!obra) {
          skipped += 1
          errors.push(`${description || itemId}: obra no encontrada para "${destination}"`)
          continue
        }

        const materialId = await findLaminacionMaterialId(supabase, item)
        if (!materialId) {
          skipped += 1
          errors.push(`${description || itemId}: sin material de laminacion asociado`)
          continue
        }

        const observaciones = `Auto desde compras ${prRef} item ${itemId}`
        const { data: existing, error: existingError } = await supabase
          .from("laminacion_movimientos")
          .select("id")
          .eq("material_id", materialId)
          .ilike("observaciones", `%${itemId}%`)
          .limit(1)
        if (existingError) throw existingError
        if ((existing ?? []).length > 0) {
          skipped += 1
          await markItem(supabase, itemId, { type: "laminacion", skipped: true, reason: "ya_existia" })
          continue
        }

        const { error: insertError } = await supabase.from("laminacion_movimientos").insert({
          material_id: materialId,
          tipo: "ingreso",
          cantidad: qty,
          fecha,
          proveedor: request.proveedor || null,
          obra: obra.nombre,
          observaciones,
          creado_por: request.created_by || null,
        })
        if (insertError) throw insertError

        created += 1
        await markItem(supabase, itemId, {
          type: "laminacion",
          movimiento: "ingreso",
          obra: obra.nombre,
          material_id: materialId,
          cantidad: qty,
        })
        continue
      }

      if (/^Stock\s+(Pampa|Chubut)/i.test(destination)) {
        // Stock Pampa/Chubut: el ingreso al pañol lo dispara el pañolero
        // desde PanolScreen → panel "Pedidos pendientes" → "Llegó todo".
        // Eso usa el RPC registrar_movimiento y un trigger DB sincroniza
        // automáticamente este purchase_request_item.
        // Acá no hacemos nada — el pedido legacy ya existe (lo crea
        // PedirAComprasModal al enviar) y aparece en el panel del pañol.
        skipped += 1
        continue
      }

      skipped += 1
      errors.push(`${description || itemId}: destino no reconocido "${destination}"`)
    }

    return json({ created, skipped, errors })
  } catch (error) {
    console.error("materialize-received error:", error)
    const message = error instanceof Error ? error.message : "Error materializando pedido recibido"
    return json({ error: message }, 400)
  }
})
