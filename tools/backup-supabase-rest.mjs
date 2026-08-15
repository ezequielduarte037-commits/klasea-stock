// Backup de datos de Supabase sin contraseña de Postgres.
//
// El otro backup (backup-supabase-public-data.mjs) necesita las credenciales
// directas de la base. Este usa la service_role key del dashboard, que se copia
// sin resetear nada, y lee todo por PostgREST salteando RLS.
//
// Alcance: los mismos datos que el otro (esquema public, sin DDL). No reemplaza
// un pg_dump, pero alcanza para no perder filas si algo sale mal.
//
// Uso:
//   1. Poné la clave en .env.backup.local (ya está ignorado por git):
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   2. node tools/backup-supabase-rest.mjs
//
// Salida: backups/rest-<stamp>/<tabla>.ndjson + _resumen.json

import fs from "node:fs";
import path from "node:path";

const PAGE = 1000;

function leerEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((linea) => linea.trim() && !linea.trim().startsWith("#") && linea.includes("="))
      .map((linea) => {
        const i = linea.indexOf("=");
        return [linea.slice(0, i).trim(), linea.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = { ...leerEnv(".env"), ...leerEnv(".env.local"), ...leerEnv(".env.backup.local"), ...process.env };
const URL_BASE = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || "";

if (!URL_BASE) {
  console.error("Falta VITE_SUPABASE_URL (en .env).");
  process.exit(1);
}
if (!KEY) {
  console.error([
    "Falta SUPABASE_SERVICE_ROLE_KEY.",
    "Copiala del dashboard: Project Settings > API Keys.",
    "  · pestaña 'API Keys'        -> sección Secret keys (sb_secret_...)",
    "  · pestaña 'Legacy API Keys' -> service_role (eyJ...)",
    "Cualquiera de las dos sirve. Guardala en .env.backup.local así:",
    "",
    "  SUPABASE_SERVICE_ROLE_KEY=eyJ...",
  ].join("\n"));
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// El stamp entra por argumento para poder repetir un backup con el mismo nombre.
const stamp = process.argv[2] || new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
const outDir = path.join("backups", `rest-${stamp}`);

// PostgREST publica un OpenAPI con todas las tablas y vistas visibles: de ahí
// sale la lista, así no hay que mantenerla a mano.
async function listarTablas() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers });
  if (!res.ok) {
    // Este endpoint sólo lo acepta la service_role. Si pegaste la anon key por
    // error, es acá donde se ve, y conviene que lo diga sin vueltas.
    const detalle = await res.text().catch(() => "");
    throw new Error([
      `No se pudo leer la lista de tablas (${res.status} ${res.statusText}).`,
      detalle.slice(0, 200),
      "Este endpoint sólo funciona con la service_role key, no con la anon key.",
    ].filter(Boolean).join("\n"));
  }
  const spec = await res.json();
  const defs = spec.definitions || spec.components?.schemas || {};
  return Object.entries(defs).map(([nombre, def]) => {
    const props = def.properties || {};
    // La descripción de la columna trae "<pk/>" cuando es clave primaria.
    const pk = Object.keys(props).find((col) => /<pk\/>/.test(props[col]?.description || ""));
    return { nombre, pk: pk || null };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function bajarTabla({ nombre, pk }) {
  const archivo = path.join(outDir, `${nombre}.ndjson`);
  const stream = fs.createWriteStream(archivo, { encoding: "utf8" });
  let desde = 0;
  let total = 0;

  try {
    for (;;) {
      // Sin un orden estable la paginación puede repetir o saltear filas. Si la
      // tabla no tiene PK (típico de una vista) se pide todo de una.
      const query = pk ? `?select=*&order=${encodeURIComponent(pk)}.asc` : "?select=*";
      const res = await fetch(`${URL_BASE}/rest/v1/${nombre}${query}`, {
        headers: pk
          ? { ...headers, Range: `${desde}-${desde + PAGE - 1}`, "Range-Unit": "items" }
          : headers,
      });

      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${detalle.slice(0, 160)}`);
      }

      const filas = await res.json();
      for (const fila of filas) stream.write(`${JSON.stringify(fila)}\n`);
      total += filas.length;

      if (!pk || filas.length < PAGE) break;
      desde += PAGE;
    }
    return { tabla: nombre, filas: total, pk, ok: true };
  } catch (error) {
    return { tabla: nombre, filas: total, pk, ok: false, error: String(error.message || error) };
  } finally {
    await new Promise((resolve) => stream.end(resolve));
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const tablas = await listarTablas();
  console.log(`${tablas.length} tablas/vistas encontradas. Bajando a ${outDir}\n`);

  const resumen = [];
  for (const tabla of tablas) {
    const resultado = await bajarTabla(tabla);
    resumen.push(resultado);
    const marca = resultado.ok ? "  " : "!!";
    console.log(`${marca} ${resultado.tabla.padEnd(46)} ${String(resultado.filas).padStart(8)}${resultado.ok ? "" : `  ${resultado.error}`}`);
    // Una tabla vacía puede ser real; una que falla, no. Se sigue igual para no
    // perder el resto del backup por una sola tabla.
  }

  const fallidas = resumen.filter((r) => !r.ok);
  const totalFilas = resumen.reduce((acc, r) => acc + r.filas, 0);
  const vacias = resumen.filter((r) => r.ok && r.filas === 0).map((r) => r.tabla);

  fs.writeFileSync(path.join(outDir, "_resumen.json"), JSON.stringify({
    generadoEn: new Date().toISOString(),
    origen: URL_BASE,
    metodo: "postgrest/service_role",
    alcance: "datos del esquema public, sin DDL",
    tablas: resumen.length,
    totalFilas,
    conError: fallidas.length,
    vacias,
    detalle: resumen,
  }, null, 2));

  console.log(`\nTotal: ${totalFilas} filas en ${resumen.length} tablas.`);
  if (vacias.length) console.log(`Vacías: ${vacias.length}`);
  if (fallidas.length) {
    console.log(`\nCON ERROR (${fallidas.length}): ${fallidas.map((r) => r.tabla).join(", ")}`);
    console.log("Revisá el _resumen.json antes de dar el backup por bueno.");
    process.exit(2);
  }
  console.log(`Listo: ${outDir}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
