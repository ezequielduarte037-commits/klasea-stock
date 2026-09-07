import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─────────────────────────────────────────────────────────────────────────────
// admin-usuarios
// Operaciones de auth que requieren service_role, ejecutadas en el server (la
// key NUNCA viaja al frontend). Verifica que el que llama sea admin antes de
// hacer nada. Reemplaza el viejo getAdminClient() que exponía la service key
// bundleada en el JS del navegador.
//   action: "create_user"      { username, password, role, is_admin, sede } → { uid }
//   action: "update_profile"   { user_id, role, is_admin, is_demo, sede }   → { ok }
//   action: "delete_user"      { user_id }                              → { ok }
//   action: "update_password"  { user_id, password }                   → { ok }
//
// POR QUE update_profile VIVE ACA Y NO EN EL FRONT. Antes la pantalla de
// Configuración hacía `supabase.from("profiles").update(...)` directo desde el
// navegador. RLS descarta esa escritura y PostgREST responde OK con 0 filas
// afectadas, así que la app decía "Permisos actualizados" y el rol no cambiaba
// nunca. Todo lo que toca perfiles ajenos pasa por acá, que corre con service
// key y valida que el que llama sea admin.
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

// Referencias a profiles con ON DELETE RESTRICT, o sea: lo que impide borrar a
// alguien que ya trabajó en el sistema. Si se agrega otra tabla con RESTRICT
// contra profiles, va acá para que el mensaje siga siendo completo.
const DEPENDENCIAS_USUARIO = [
  { tabla: "purchase_requests", columna: "created_by", nombre: "pedidos de compra" },
  { tabla: "request_comments", columna: "author_id", nombre: "comentarios en pedidos" },
  { tabla: "purchase_log", columna: "created_by", nombre: "registros de compra" },
  { tabla: "panol_envios", columna: "created_by", nombre: "envíos de pañol" },
  { tabla: "compras_avisos", columna: "created_by", nombre: "avisos de compras" },
  { tabla: "compras_aviso_comentarios", columna: "author_id", nombre: "comentarios en avisos" },
]

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
      const isDemo = body.is_demo === true
      const effectiveRole = isDemo ? "tecnica" : role
      const isAdminFlag = isDemo ? false : body.is_admin === true
      const sede = String(body.sede ?? "").trim()
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
          role: effectiveRole,
          is_admin: isAdminFlag,
          is_demo: isDemo,
          // La sede se guarda acá y no con un update posterior desde el front:
          // ese update lo comía RLS y la sede elegida se perdía sin avisar.
          sede: sede || null,
          must_change_password: !isDemo && effectiveRole !== "cliente",
        }, { onConflict: "id" })
      if (profErr) {
        // rollback: borrar el usuario auth recién creado
        await admin.auth.admin.deleteUser(uid)
        return json({ error: "Error perfil: " + profErr.message }, 400)
      }

      return json({ uid })
    }

    if (action === "update_profile") {
      const userId = String(body.user_id ?? "")
      const role = String(body.role ?? "").trim()
      if (!userId) return json({ error: "Falta user_id" }, 400)
      if (!role) return json({ error: "Falta el rol" }, 400)

      const isDemo = body.is_demo === true
      const isAdminFlag = isDemo ? false : body.is_admin === true
      // Sin esto un admin se puede sacar a sí mismo el acceso y quedar afuera
      // de la pantalla que necesita para devolvérselo.
      if (userId === callerId && !isAdminFlag) {
        return json({ error: "No podés quitarte a vos mismo el acceso de administrador" }, 400)
      }

      const sede = String(body.sede ?? "").trim()
      const patch: Record<string, unknown> = {
        role: isDemo ? "tecnica" : role,
        is_admin: isAdminFlag,
        is_demo: isDemo,
        sede: sede || null,
      }
      if (isDemo) patch.must_change_password = false

      const { data, error } = await admin
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("id")
      if (error) return json({ error: error.message }, 400)
      if (!data?.length) return json({ error: "No existe el perfil " + userId }, 404)
      return json({ ok: true })
    }

    if (action === "set_activo") {
      const userId = String(body.user_id ?? "")
      const activo = body.activo === true
      if (!userId) return json({ error: "Falta user_id" }, 400)
      if (userId === callerId) return json({ error: "No podés darte de baja a vos mismo" }, 400)

      // El ban es lo que corta el acceso de verdad: sin token no entra ni
      // aunque el front tuviera un bug. La columna `activo` es para las listas.
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: activo ? "none" : "876000h", // ~100 años
      })
      if (banErr) return json({ error: "No se pudo cortar el acceso: " + banErr.message }, 400)

      const { data, error } = await admin
        .from("profiles")
        .update({ activo })
        .eq("id", userId)
        .select("id")
      if (error) return json({ error: error.message }, 400)
      if (!data?.length) return json({ error: "No existe el perfil " + userId }, 404)
      return json({ ok: true })
    }

    if (action === "delete_user") {
      const userId = String(body.user_id ?? "")
      if (!userId) return json({ error: "Falta user_id" }, 400)
      if (userId === callerId) return json({ error: "No podés eliminar tu propio usuario" }, 400)

      // Estas seis tablas referencian profiles con ON DELETE RESTRICT: son la
      // historia del usuario (qué pidió, qué comentó, qué despachó) y la base
      // se niega a borrarlo para no dejarla sin autor. Se chequea ANTES para
      // poder decir qué lo bloquea; si no, GoTrue devuelve un opaco "Database
      // error deleting user" que no le sirve a nadie.
      const bloqueos: string[] = []
      for (const dep of DEPENDENCIAS_USUARIO) {
        const { count, error: cErr } = await admin
          .from(dep.tabla)
          .select("id", { count: "exact", head: true })
          .eq(dep.columna, userId)
        if (cErr) continue // tabla inexistente en este proyecto: no bloquea
        if (count) bloqueos.push(`${count} ${dep.nombre}`)
      }
      if (bloqueos.length) {
        return json({
          error: `No se puede eliminar: el usuario tiene ${bloqueos.join(", ")}. `
            + "Borrarlo dejaría ese historial sin autor. Usá \"Dar de baja\": le corta el acceso y conserva lo que hizo.",
        }, 409)
      }

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      // Por si profiles no tiene ON DELETE CASCADE contra auth.users: si ya se
      // fue con el cascade, este delete no encuentra nada y no molesta.
      await admin.from("profiles").delete().eq("id", userId)
      return json({ ok: true })
    }

    if (action === "update_password") {
      const userId = String(body.user_id ?? "")
      const password = String(body.password ?? "")
      if (!userId || !password) return json({ error: "Falta user_id o password" }, 400)
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("username, role, is_demo")
        .eq("id", userId)
        .maybeSingle()
      const passwordError = validatePassword(password, targetProfile?.username ?? "")
      if (passwordError) return json({ error: passwordError }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      if (targetProfile?.role !== "cliente") {
        await admin
          .from("profiles")
          .update({ must_change_password: targetProfile?.is_demo !== true })
          .eq("id", userId)
      }
      return json({ ok: true })
    }

    return json({ error: "Acción desconocida: " + action }, 400)
  } catch (error) {
    console.error("admin-usuarios error:", error)
    const message = error instanceof Error ? error.message : "Error interno"
    return json({ error: message }, 400)
  }
})
