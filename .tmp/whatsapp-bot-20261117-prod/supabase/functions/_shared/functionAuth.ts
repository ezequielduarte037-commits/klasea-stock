import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FunctionAuth = {
  userId: string | null;
  isService: boolean;
  profile: { username?: string | null; role?: string | null; is_admin?: boolean | null } | null;
};

export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

export async function authenticateFunctionRequest(
  req: Request,
  admin: SupabaseClient,
  options: { allowServiceRole?: boolean } = {},
): Promise<FunctionAuth> {
  const token = bearerToken(req);
  if (!token) throw new ResponseError("No autenticado", 401);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (options.allowServiceRole && serviceKey && token === serviceKey) {
    return { userId: null, isService: true, profile: null };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new ResponseError("Sesion invalida", 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("username, role, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  return { userId: data.user.id, isService: false, profile: profile ?? null };
}

export async function assertPurchaseRequestAccess(
  admin: SupabaseClient,
  requestId: string,
  auth: FunctionAuth,
): Promise<void> {
  if (auth.isService) return;
  if (!auth.userId) throw new ResponseError("No autenticado", 401);

  const { data, error } = await admin.rpc("can_access_purchase_request", {
    p_request_id: requestId,
    p_uid: auth.userId,
  });
  if (error) throw error;
  if (data !== true) throw new ResponseError("No autorizado para este pedido", 403);
}

export async function assertComprasAvisoAccess(
  admin: SupabaseClient,
  avisoId: string,
  auth: FunctionAuth,
): Promise<void> {
  if (auth.isService) return;
  if (!auth.userId) throw new ResponseError("No autenticado", 401);

  const { data, error } = await admin.rpc("can_access_compras_aviso", {
    p_aviso: avisoId,
    p_uid: auth.userId,
  });
  if (error) throw error;
  if (data !== true) throw new ResponseError("No autorizado para este aviso", 403);
}

export class ResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ResponseError";
    this.status = status;
  }
}
