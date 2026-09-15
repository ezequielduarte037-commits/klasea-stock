import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BUCKET = "panol-materiales";
const APPLY = process.argv.includes("--apply");
const MANIFEST_PATH = path.join(ROOT, "scripts", "catalog-image-generic.sources.json");

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

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return compactText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safePathPart(value) {
  return normalized(value).replaceAll(" ", "-").slice(0, 90) || "generico";
}

function detectImage(bytes) {
  const signature = Buffer.from(bytes.subarray(0, 12));
  const isWebp = signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP";
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (isWebp) return { contentType: "image/webp", extension: "webp" };
  if (isJpeg) return { contentType: "image/jpeg", extension: "jpg" };
  if (isPng) return { contentType: "image/png", extension: "png" };
  return null;
}

async function loadImageBytes(entry) {
  if (entry.imagePath) {
    const full = path.isAbsolute(entry.imagePath)
      ? entry.imagePath
      : path.join(ROOT, entry.imagePath);
    if (!fs.existsSync(full)) throw new Error(`No existe la imagen local: ${entry.imagePath}`);
    const bytes = new Uint8Array(fs.readFileSync(full));
    const detected = detectImage(bytes);
    if (!detected) throw new Error("La imagen local no es JPEG/PNG/WebP.");
    if (bytes.byteLength < 4_000) throw new Error("La imagen local es demasiado pequeña.");
    return { ...detected, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), source: full };
  }

  if (!entry.imageUrl) throw new Error("Falta imagePath o imageUrl.");
  const response = await fetch(entry.imageUrl, {
    redirect: "follow",
    headers: { "user-agent": "KlaseA generic catalog image/1.0" },
  });
  if (!response.ok) throw new Error(`La imagen respondió HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected) throw new Error("La firma del archivo no corresponde a JPEG, PNG o WebP.");
  if (bytes.byteLength < 4_000) throw new Error("La imagen es demasiado pequeña.");
  return {
    ...detected,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: entry.imageUrl,
  };
}

async function attachImage(supabase, entry, material, image) {
  const digest = image.sha256.slice(0, 12);
  const storagePath = `${material.id}/representativas/${safePathPart(entry.label)}-${digest}.${image.extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, image.bytes, {
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
        nombre: `${entry.label} · foto representativa genérica · ${entry.category}`,
      })
      .select("id")
      .single();
    if (imageRowError) throw imageRowError;
    imageRowId = imageRow.id;

    const { data: updatedMaterial, error: materialError } = await supabase
      .from("panol_materiales")
      .update({ imagen_url: publicUrl })
      .eq("id", material.id)
      .is("imagen_url", null)
      .select("id,imagen_url")
      .maybeSingle();
    if (materialError) throw materialError;
    if (!updatedMaterial) throw new Error("El material recibió otra imagen mientras se procesaba.");
  } catch (error) {
    if (imageRowId) await supabase.from("panol_material_imagenes").delete().eq("id", imageRowId);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }

  return publicUrl;
}

function validateManifest(entries) {
  const ids = new Set();
  for (const entry of entries) {
    for (const field of ["materialId", "expectedDescription", "label", "category"]) {
      if (!compactText(entry[field])) throw new Error(`Entrada incompleta: falta ${field}.`);
    }
    if (!entry.imagePath && !entry.imageUrl) {
      throw new Error(`La entrada ${entry.label} necesita imagePath o imageUrl.`);
    }
    if (ids.has(entry.materialId)) throw new Error(`ID duplicado: ${entry.materialId}`);
    ids.add(entry.materialId);
  }
}

async function run() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const entries = manifest.entries ?? [];
  validateManifest(entries);

  const env = { ...readEnvFile(".env"), ...readEnvFile(".env.backup.local"), ...process.env };
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: materials, error } = await supabase
    .from("panol_materiales")
    .select("id,codigo,descripcion,proveedor,imagen_url,activo")
    .in(
      "id",
      entries.map((entry) => entry.materialId),
    );
  if (error) throw error;
  const materialById = new Map((materials ?? []).map((material) => [material.id, material]));

  const report = [];
  for (const entry of entries) {
    const material = materialById.get(entry.materialId);
    if (!material) {
      report.push({ label: entry.label, status: "omitido", reason: "el material ya no existe" });
      continue;
    }
    if (normalized(material.descripcion) !== normalized(entry.expectedDescription)) {
      report.push({ label: entry.label, status: "omitido", reason: "la descripción local cambió" });
      continue;
    }
    if (compactText(material.imagen_url)) {
      report.push({
        label: entry.label,
        status: "omitido",
        reason: "ya tiene imagen",
        publicUrl: material.imagen_url,
      });
      continue;
    }

    try {
      const image = await loadImageBytes(entry);
      if (!APPLY) {
        report.push({
          label: entry.label,
          status: "validado",
          category: entry.category,
          imageBytes: image.bytes.byteLength,
          sha256: image.sha256,
          source: image.source,
          preview: entry.imagePath || entry.imageUrl,
        });
        continue;
      }
      const publicUrl = await attachImage(supabase, entry, material, image);
      report.push({
        label: entry.label,
        status: "cargado",
        category: entry.category,
        publicUrl,
      });
    } catch (entryError) {
      report.push({ label: entry.label, status: "omitido", reason: entryError.message });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        policy: manifest.policy,
        configured: entries.length,
        successful: report.filter((item) => item.status === (APPLY ? "cargado" : "validado")).length,
        report,
      },
      null,
      2,
    ),
  );
}

await run();
