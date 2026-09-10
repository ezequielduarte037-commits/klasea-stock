import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BUCKET = "panol-materiales";
const APPLY = process.argv.includes("--apply");
const PILOT_CODES = ["R05899", "R05788", "R05472"];

function readEnvFile(file) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

const env = {
  ...readEnvFile(".env"),
  ...readEnvFile(".env.backup.local"),
  ...process.env,
};

const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en los archivos .env locales.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function absoluteBaronUrl(value) {
  return new URL(value.replaceAll("&amp;", "&"), "https://www.baron.com.ar").href;
}

function findOfficialImage(html, code) {
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = [...html.matchAll(
    new RegExp(
      `(?:https?:\\/\\/www\\.baron\\.com\\.ar)?\\/articulos\\/${escapedCode}\\/${escapedCode}-(G1|E1|C1)\\.webp`,
      "gi",
    ),
  )].map((match) => ({
    size: match[1].toUpperCase(),
    url: absoluteBaronUrl(match[0]),
  }));
  const preferred = ["E1", "G1", "C1"];
  for (const size of preferred) {
    const found = candidates.find((item) => item.size === size);
    if (found) return found.url;
  }
  return null;
}

function findTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return compactText(
    title
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#039;", "'"),
  );
}

async function resolveOfficialSource(code) {
  const requestedPage = `https://www.baron.com.ar/articulo.php?code=${encodeURIComponent(code)}`;
  const pageResponse = await fetch(requestedPage, {
    headers: { "user-agent": "KlaseA catalog image verifier/1.0" },
  });
  if (!pageResponse.ok) {
    throw new Error(`La fuente oficial respondió HTTP ${pageResponse.status}.`);
  }
  const html = await pageResponse.text();
  const codePattern = new RegExp(`(?:Código|Codigo)[^<]{0,30}${code}`, "i");
  if (!codePattern.test(html) && !html.toUpperCase().includes(`>${code}<`)) {
    throw new Error("La página oficial no confirma el mismo código.");
  }
  const imageUrl = findOfficialImage(html, code);
  if (!imageUrl) {
    throw new Error("No se encontró una foto oficial asociada al código.");
  }
  return {
    sourcePage: pageResponse.url,
    imageUrl,
    sourceTitle: findTitle(html),
  };
}

async function downloadVerifiedImage(code, imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { "user-agent": "KlaseA catalog image verifier/1.0" },
  });
  if (!response.ok) {
    throw new Error(`La imagen respondió HTTP ${response.status}.`);
  }
  const contentType = compactText(response.headers.get("content-type")).toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`El recurso no es una imagen (${contentType || "sin MIME"}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = Buffer.from(bytes.subarray(0, 12));
  if (
    contentType.includes("webp") &&
    !(signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP")
  ) {
    throw new Error("La firma del archivo no corresponde a una imagen WebP.");
  }
  if (bytes.byteLength < 2_000) {
    throw new Error("La imagen descargada es demasiado pequeña para ser válida.");
  }
  return {
    bytes,
    contentType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function findMaterials() {
  const { data, error } = await supabase
    .from("panol_materiales")
    .select("id, codigo, descripcion, proveedor, imagen_url, activo")
    .in("codigo", PILOT_CODES)
    .order("codigo");
  if (error) throw error;
  return data ?? [];
}

async function attachImage(material, official, image) {
  const code = compactText(material.codigo).toUpperCase();
  const digest = image.sha256.slice(0, 12);
  const storagePath = `${material.id}/catalogadas/${code}-baron-${digest}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, image.bytes, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData.publicUrl;
  let imageRowId = null;
  try {
    const { data: imageRow, error: imageRowError } = await supabase
      .from("panol_material_imagenes")
      .insert({
        material_id: material.id,
        url: publicUrl,
        nombre: `${code} · foto oficial Barón · ${official.sourcePage}`,
      })
      .select("id")
      .single();
    if (imageRowError) throw imageRowError;
    imageRowId = imageRow.id;

    const { error: materialError } = await supabase
      .from("panol_materiales")
      .update({ imagen_url: publicUrl })
      .eq("id", material.id)
      .is("imagen_url", null);
    if (materialError) throw materialError;
  } catch (error) {
    if (imageRowId) {
      await supabase.from("panol_material_imagenes").delete().eq("id", imageRowId);
    }
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
  return publicUrl;
}

async function run() {
  const materials = await findMaterials();
  const grouped = new Map();
  for (const material of materials) {
    const code = compactText(material.codigo).toUpperCase();
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(material);
  }

  const report = [];
  for (const code of PILOT_CODES) {
    const matches = grouped.get(code) ?? [];
    if (matches.length !== 1) {
      report.push({ code, status: "omitido", reason: `${matches.length} coincidencias en catálogo` });
      continue;
    }
    const material = matches[0];
    if (compactText(material.imagen_url)) {
      report.push({ code, status: "omitido", reason: "ya tiene imagen", material: material.descripcion });
      continue;
    }
    try {
      const official = await resolveOfficialSource(code);
      const image = await downloadVerifiedImage(code, official.imageUrl);
      if (!APPLY) {
        report.push({
          code,
          status: "validado",
          material: material.descripcion,
          proveedor: material.proveedor,
          sourcePage: official.sourcePage,
          imageUrl: official.imageUrl,
          imageBytes: image.bytes.byteLength,
          sha256: image.sha256,
        });
        continue;
      }
      const publicUrl = await attachImage(material, official, image);
      report.push({
        code,
        status: "cargado",
        material: material.descripcion,
        sourcePage: official.sourcePage,
        publicUrl,
      });
    } catch (error) {
      report.push({ code, status: "omitido", reason: error.message });
    }
  }
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", report }, null, 2));
}

await run();
