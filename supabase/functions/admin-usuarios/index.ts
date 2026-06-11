import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─────────────────────────────────────────────────────────────────────────────
// admin-usuarios
// Operaciones de auth que requieren service_role, ejecutadas en el server (la
// key NUNCA viaja al frontend). Verifica que el que llama sea admin antes de
// hacer nada. Reemplaza el viejo getAdminClient() que exponía la service key
// bundleada en el JS del navegador.
//   action: "create_user"      { username, password, role, is_admin }  → { uid }
//   action: "delete_user"      { user_id }                              → { ok }
//   action: "update_password"  { user_id, password }                   → { ok }
// ─────────────────────────────────────────────────────────────────────────────

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

function validatePassword(password: string, username = ""): string | null {
  const value = String(password || "")
  const normalized = value.toLowerCase()
  const user = String(username || "").trim().toLowerCase().replace(/\s+/g, "")
  const weak = new Set([
    "1234567890",
    "123456789",
    "contraseña",
    "contrasena",
    "password",
    "password123",
    "klasea123",
    "astillero123",
  ])

  if (value.length < 10) return "La contraseña debe tener al menos 10 caracteres"
  if (!/[a-záéíóúñ]/.test(normalized)) return "La contraseña debe incluir una minúscula"
  if (!/[A-ZÁÉÍÓÚÑ]/.test(value)) return "La contraseña debe incluir una mayúscula"
  if (!/\d/.test(value)) return "La contraseña debe incluir un número"
  if (user && normalized.includes(user)) return "La contraseña no puede contener el usuario"
  if (weak.has(normalized)) return "La contraseña es demasiado fácil de adivinar"
  return null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // ── 1. Verificar que el que llama esté autenticado y sea admin ──────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim()
    if (!jwt) return json({ error: "No autenticado" }, 401)

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userData?.user) return json({ error: "Sesión inválida" }, 401)

    const callerId = userData.user.id
    const { data: prof } = await admin
      .from("profiles")
      .select("is_admin, role")
      .eq("id", callerId)
      .single()

    const isAdmin = !!prof && (prof.is_admin === true || prof.role === "admin")
    if (!isAdmin) return json({ error: "No autorizado (se requiere admin)" }, 403)

    // ── 2. Ejecutar la acción pedida ────────────────────────────────────────────
    const body = await req.json()
    const action = body?.action

    if (action === "create_user") {
      const username = String(body.username ?? "").trim()
      const password = String(body.password ?? "")
      const role = String(body.role ?? "")
      const isAdminFlag = body.is_admin === true
      if (!username || !password || !role) return json({ error: "Faltan datos (username/password/role)" }, 400)
      const passwordError = validatePassword(password, username)
      if (passwordError) return json({ error: passwordError }, 400)

      const email = `${username.toLowerCase()}@klasea.local`
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username },
      })
      if (createErr) return json({ error: "Error auth: " + createErr.message }, 400)
      const uid = created.user.id

      const { error: profErr } = await admin
        .from("profiles")
        .upsert({
          id: uid,
          username,
          role,
          is_admin: isAdminFlag,
          must_change_password: role !== "cliente",
        }, { onConflict: "id" })
      if (profErr) {
        // rollback: borrar el usuario auth recién creado
        await admin.auth.admin.deleteUser(uid)
        return json({ error: "Error perfil: " + profErr.message }, 400)
      }

      return json({ uid })
    }

    if (action === "delete_user") {
      const userId = String(body.user_id ?? "")
      if (!userId) return json({ error: "Falta user_id" }, 400)
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === "update_password") {
      const userId = String(body.user_id ?? "")
      const password = String(body.password ?? "")
      if (!userId || !password) return json({ error: "Falta user_id o password" }, 400)
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("username, role")
        .eq("id", userId)
        .maybeSingle()
      const passwordError = validatePassword(password, targetProfile?.username ?? "")
      if (passwordError) return json({ error: passwordError }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", userId)
        .neq("role", "cliente")
      return json({ ok: true })
    }

    return json({ error: "Acción desconocida: " + action }, 400)
  } catch (error) {
    console.error("admin-usuarios error:", error)
    const message = error instanceof Error ? error.message : "Error interno"
    return json({ error: message }, 400)
  }
})
