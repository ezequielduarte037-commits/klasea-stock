import { supabase } from "@/supabaseClient";

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "un", "una"]);

const GROUP_ORDER = ["obras", "materiales", "compras", "solicitudes", "personas"];

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanIlike(value = "") {
  return String(value)
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenVariants(token) {
  const variants = new Set([token]);
  if (token.length > 4 && token.endsWith("es")) variants.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));
  return [...variants].filter((value) => value.length >= 2 || /^\d+$/.test(value));
}

function searchTokens(query) {
  const normalized = normalize(query);
  const tokens = normalized
    .split(" ")
    .filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !STOPWORDS.has(token));
  return (tokens.length ? tokens : normalized ? [normalized] : [])
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

function searchClauses(fields, tokens) {
  const values = [...new Set(tokens.flatMap(tokenVariants))]
    .map(cleanIlike)
    .filter(Boolean);
  return fields.flatMap((field) => values.map((value) => `${field}.ilike.%${value}%`)).join(",");
}

function relevance(row, tokens, fields) {
  const haystack = normalize(fields.map((field) => row?.[field]).filter(Boolean).join(" "));
  if (!haystack) return 0;
  return tokens.reduce((score, token) => {
    const variants = tokenVariants(token);
    const found = variants.some((variant) => haystack.includes(variant));
    const starts = variants.some((variant) => haystack.startsWith(variant));
    return score + (found ? 12 : 0) + (starts ? 7 : 0);
  }, 0);
}

function rankRows(rows, tokens, fields, limit = 6) {
  return [...(rows ?? [])]
    .map((row) => ({ row, score: relevance(row, tokens, fields) }))
    .sort((a, b) => b.score - a.score || String(a.row?.[fields[0]] || "").localeCompare(String(b.row?.[fields[0]] || ""), "es", { numeric: true }))
    .slice(0, limit)
    .map(({ row }) => row);
}

function roleAccess(profile) {
  const role = profile?.role || "";
  const admin = !!profile?.is_admin || role === "admin";
  return {
    obras: admin || ["oficina", "tecnica"].includes(role),
    materiales: admin || ["tecnica", "compras", "panol"].includes(role),
    compras: admin || ["oficina", "tecnica", "panol", "compras"].includes(role),
    solicitudes: admin || ["oficina", "tecnica", "panol", "compras"].includes(role),
    personas: admin || ["rrhh", "tecnica", "administracion"].includes(role),
  };
}

export function globalSearchScopes(profile) {
  const access = roleAccess(profile);
  return GROUP_ORDER.filter((key) => access[key]);
}

async function searchObras(tokens) {
  const fields = ["codigo", "descripcion", "linea_nombre"];
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,descripcion,estado,linea_nombre")
    .eq("solo_stock", false)
    .or(searchClauses(fields, tokens))
    .order("codigo", { ascending: true })
    .limit(24);
  if (error) throw error;
  return rankRows(data, tokens, fields).map((obra) => ({
    id: obra.id,
    type: "obra",
    title: obra.codigo || "Obra sin código",
    subtitle: [obra.linea_nombre, obra.descripcion].filter(Boolean).join(" · ") || "Producción",
    meta: obra.estado || "",
    status: obra.estado || "",
    path: `/obras?obra=${encodeURIComponent(obra.id)}`,
  }));
}

async function searchMateriales(tokens) {
  const fields = ["descripcion", "alias", "codigo", "codigo_barra", "notas", "proveedor"];
  const { data, error } = await supabase
    .from("panol_materiales")
    .select("id,descripcion,alias,codigo,codigo_barra,notas,proveedor,unidad_medida,ubicacion,ubicacion_obs,activo")
    .neq("activo", false)
    .or(searchClauses(fields, tokens))
    .order("descripcion", { ascending: true })
    .limit(36);
  if (error) throw error;
  return rankRows(data, tokens, fields).map((material) => ({
    id: material.id,
    type: "material",
    title: material.descripcion || "Producto sin nombre",
    subtitle: [material.codigo || material.codigo_barra, material.proveedor].filter(Boolean).join(" · ") || "Catálogo maestro",
    meta: [material.unidad_medida, material.ubicacion_obs || material.ubicacion].filter(Boolean).join(" · "),
    unit: material.unidad_medida || "unidad",
    location: material.ubicacion_obs || material.ubicacion || "",
    path: `/catalogo-maestro?material=${encodeURIComponent(material.id)}`,
    stockPath: `/stock-panol?tab=maestro&material=${encodeURIComponent(material.id)}&q=${encodeURIComponent(material.descripcion || "")}`,
  }));
}

async function searchCompras(tokens) {
  const fields = ["title", "description", "proveedor", "source_ref"];
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id,title,description,status,priority,proveedor,source_ref,project_id,created_at,project:produccion_obras!purchase_requests_project_id_fkey(id,codigo)")
    .or(searchClauses(fields, tokens))
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return rankRows(data, tokens, fields).map((request) => ({
    id: request.id,
    type: "compra",
    title: request.title || "Pedido sin título",
    subtitle: [request.project?.codigo ? `Obra ${request.project.codigo}` : "Sin obra", request.proveedor].filter(Boolean).join(" · "),
    meta: request.priority ? `Prioridad ${request.priority}` : "",
    status: request.status || "",
    path: `/compras?open=${encodeURIComponent(request.id)}`,
  }));
}

async function searchSolicitudes(tokens, rawQuery) {
  const fields = ["solicita", "retira", "obra_texto", "sector", "tarea"];
  let clauses = searchClauses(fields, tokens);
  const numeric = String(rawQuery || "").trim();
  if (/^\d+$/.test(numeric)) clauses += `${clauses ? "," : ""}numero.eq.${numeric}`;
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .select("id,numero,obra_id,obra_texto,solicita,retira,sector,tarea,estado,prioridad,created_at,obra:produccion_obras(id,codigo)")
    .or(clauses)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const ranked = rankRows(data, tokens, fields);
  return ranked.map((solicitud) => ({
    id: solicitud.id,
    type: "solicitud",
    title: `Solicitud N° ${solicitud.numero ?? "—"}`,
    subtitle: [solicitud.obra?.codigo ? `Obra ${solicitud.obra.codigo}` : solicitud.obra_texto || "Sin obra", solicitud.solicita ? `pide ${solicitud.solicita}` : ""].filter(Boolean).join(" · "),
    meta: solicitud.sector || solicitud.tarea || "",
    status: solicitud.estado || "",
    path: `/solicitudes-panol?open=${encodeURIComponent(solicitud.id)}`,
  }));
}

async function searchPersonas(tokens) {
  const fields = ["nombre", "dni", "sede", "grupo"];
  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select("id,nombre,dni,sede,grupo,activo,ficha")
    .or(searchClauses(fields, tokens))
    .order("nombre", { ascending: true })
    .limit(24);
  if (error) throw error;
  return rankRows(data, tokens, fields).map((empleado) => ({
    id: empleado.id,
    type: "persona",
    title: empleado.nombre || "Persona sin nombre",
    subtitle: [empleado.dni ? `DNI ${empleado.dni}` : "Sin DNI", empleado.sede].filter(Boolean).join(" · "),
    meta: empleado.grupo || "",
    status: empleado.activo === false ? "ex empleado" : empleado.ficha === false ? "no ficha" : "activo",
    path: `/rrhh?tab=empleados&q=${encodeURIComponent(empleado.dni || empleado.nombre || "")}&vista=${empleado.activo === false ? "ex" : "activos"}`,
  }));
}

const SEARCHERS = {
  obras: (tokens) => searchObras(tokens),
  materiales: (tokens) => searchMateriales(tokens),
  compras: (tokens) => searchCompras(tokens),
  solicitudes: (tokens, query) => searchSolicitudes(tokens, query),
  personas: (tokens) => searchPersonas(tokens),
};

export async function searchGlobal(query, profile) {
  const tokens = searchTokens(query);
  if (!tokens.length) return { groups: [], errors: [] };

  const scopes = globalSearchScopes(profile);
  const settled = await Promise.allSettled(
    scopes.map(async (key) => ({ key, items: await SEARCHERS[key](tokens, query) }))
  );

  const groups = [];
  const errors = [];
  settled.forEach((result, index) => {
    const key = scopes[index];
    if (result.status === "fulfilled") {
      if (result.value.items.length) groups.push(result.value);
    } else {
      errors.push({ key, message: String(result.reason?.message || result.reason || "Error de búsqueda") });
    }
  });
  return { groups, errors };
}
