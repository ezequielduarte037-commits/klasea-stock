import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BUCKET = "panol-materiales";
const APPLY = process.argv.includes("--apply");
const AUTO_BARON = process.argv.includes("--auto-baron");
const DEFAULT_CODES = ["R05899", "R05788", "R05472", "R05066"];

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const REQUESTED_CODES = [...new Set(
  arg("codes", DEFAULT_CODES.join(","))
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
)];
const SUCCESS_LIMIT = Math.max(1, Number.parseInt(arg("limit", "20"), 10) || 20);
const ATTEMPT_LIMIT = Math.max(SUCCESS_LIMIT, Number.parseInt(arg("attempts", String(SUCCESS_LIMIT * 5)), 10) || SUCCESS_LIMIT * 5);

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
  let contentType = compactText(response.headers.get("content-type")).toLowerCase();
  if (!contentType && new URL(response.url).pathname.toLowerCase().endsWith(".webp")) {
    contentType = "image/webp";
  }
  if (!contentType.startsWith("image/")) {
    throw new Error(`El recurso no es una imagen (${contentType || "sin MIME"}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = Buffer.from(bytes.subarray(0, 12));
  const isWebp = signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP";
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const detected = isWebp
    ? { contentType: "image/webp", extension: "webp" }
    : isJpeg
      ? { contentType: "image/jpeg", extension: "jpg" }
      : isPng
        ? { contentType: "image/png", extension: "png" }
        : null;
  if (!detected) throw new Error("La firma del archivo no corresponde a una imagen válida.");
  if (bytes.byteLength < 2_000) {
    throw new Error("La imagen descargada es demasiado pequeña para ser válida.");
  }
  return {
    bytes,
    contentType: detected.contentType,
    extension: detected.extension,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function findMaterialsAndStockRows() {
  const { data: materials, error } = await supabase
    .from("panol_materiales")
    .select("id, codigo, descripcion, proveedor, imagen_url, activo, variantes, variantes_precios")
    .order("codigo");
  if (error) throw error;
  if (!AUTO_BARON) {
    const { data: stockRows, error: stockError } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("id, material_id, codigo, descripcion, variante, proveedor")
      .in("codigo", REQUESTED_CODES);
    if (stockError) throw stockError;
    return { materials: materials ?? [], stockRows: stockRows ?? [] };
  }

  const stockRows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: pageError } = await supabase
      .from("panol_obra_materiales_snapshot")
      .select("id, material_id, codigo, descripcion, variante, proveedor")
      .not("codigo", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (pageError) throw pageError;
    stockRows.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }
  return { materials: materials ?? [], stockRows };
}

function codeCandidates(material) {
  const candidates = [];
  const mainCode = compactText(material.codigo).toUpperCase();
  if (mainCode) candidates.push({ code: mainCode, variantName: "", variant: null });
  const variantInfo =
    material.variantes_precios && typeof material.variantes_precios === "object"
      ? material.variantes_precios
      : {};
  for (const [variantName, variant] of Object.entries(variantInfo)) {
    const configuredCode = compactText(variant?.codigo).toUpperCase();
    const nameCode = compactText(variantName).toUpperCase().match(/^([A-Z]\d{4,})\b/)?.[1] ?? "";
    const code = configuredCode || nameCode;
    if (code) candidates.push({ code, variantName, variant });
  }
  return candidates;
}

function existingImageUrl(match) {
  if (match.variantName) {
    return compactText(match.variant?.imagen_url || match.variant?.imagenUrl);
  }
  return compactText(match.material.imagen_url);
}

function safePathPart(value) {
  return compactText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "standard";
}

async function attachImage(match, official, image) {
  const { material, code, variantName } = match;
  const digest = image.sha256.slice(0, 12);
  const variantFolder = variantName ? `variantes/${safePathPart(variantName)}` : "catalogadas";
  const storagePath = `${material.id}/${variantFolder}/${code}-baron-${digest}.${image.extension}`;
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
        nombre: `${code}${variantName ? ` · ${variantName}` : ""} · foto oficial Barón · ${official.sourcePage}`,
      })
      .select("id")
      .single();
    if (imageRowError) throw imageRowError;
    imageRowId = imageRow.id;

    const patch = variantName
      ? {
        variantes_precios: {
          ...(material.variantes_precios ?? {}),
          [variantName]: {
            ...(material.variantes_precios?.[variantName] ?? {}),
            imagen_url: publicUrl,
          },
        },
      }
      : { imagen_url: publicUrl };
    const { error: materialError } = await supabase
      .from("panol_materiales")
      .update(patch)
      .eq("id", material.id);
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
  const { materials, stockRows } = await findMaterialsAndStockRows();
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const grouped = new Map();
  const pushMatch = (candidate) => {
    if (!AUTO_BARON && !REQUESTED_CODES.includes(candidate.code)) return;
    if (!candidate.code) return;
    if (!grouped.has(candidate.code)) grouped.set(candidate.code, []);
    const list = grouped.get(candidate.code);
    const identity = `${candidate.material.id}::${compactText(candidate.variantName).toLowerCase()}`;
    const existing = list.find((item) => item.identity === identity);
    if (!existing) {
      list.push({ ...candidate, identity });
    } else {
      existing.stockProvider ||= candidate.stockProvider;
      existing.stockDescription ||= candidate.stockDescription;
    }
  };
  for (const material of materials) {
    for (const candidate of codeCandidates(material)) {
      pushMatch({ material, ...candidate });
    }
  }
  for (const row of stockRows) {
    const code = compactText(row.codigo).toUpperCase();
    const material = materialById.get(row.material_id);
    if (!material) continue;
    const variantName = compactText(row.variante);
    const variantEntry = Object.entries(material.variantes_precios ?? {})
      .find(([name]) => compactText(name).toLowerCase() === variantName.toLowerCase());
    pushMatch({
      material,
      code,
      variantName,
      variant: variantEntry?.[1] ?? null,
      stockDescription: row.descripcion,
      stockProvider: row.proveedor,
    });
  }

  const report = [];
  const uniqueMissingCodes = [...grouped.entries()]
    .filter(([, matches]) => matches.length === 1 && !existingImageUrl(matches[0]))
    .filter(([code]) => /^[A-Z]\d{5}$/.test(code))
    .sort(([, a], [, b]) => {
      const aBaron = compactText(`${a[0].material.proveedor} ${a[0].stockProvider}`).toLowerCase().includes("baron") ? 0 : 1;
      const bBaron = compactText(`${b[0].material.proveedor} ${b[0].stockProvider}`).toLowerCase().includes("baron") ? 0 : 1;
      return aBaron - bBaron || a[0].material.descripcion.localeCompare(b[0].material.descripcion, "es", { numeric: true });
    })
    .map(([code]) => code);
  const codesToProcess = AUTO_BARON
    ? uniqueMissingCodes.slice(0, ATTEMPT_LIMIT)
    : REQUESTED_CODES;
  let successful = 0;
  for (const code of codesToProcess) {
    if (AUTO_BARON && successful >= SUCCESS_LIMIT) break;
    const matches = grouped.get(code) ?? [];
    if (matches.length !== 1) {
      report.push({ code, status: "omitido", reason: `${matches.length} coincidencias en catálogo` });
      continue;
    }
    const match = matches[0];
    const { material } = match;
    if (existingImageUrl(match)) {
      report.push({ code, status: "omitido", reason: "ya tiene imagen", material: material.descripcion, variant: match.variantName || null });
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
          variant: match.variantName || null,
          proveedor: material.proveedor,
          sourcePage: official.sourcePage,
          imageUrl: official.imageUrl,
          imageBytes: image.bytes.byteLength,
          sha256: image.sha256,
        });
        successful += 1;
        continue;
      }
      const publicUrl = await attachImage(match, official, image);
      report.push({
        code,
        status: "cargado",
        material: material.descripcion,
        variant: match.variantName || null,
        sourcePage: official.sourcePage,
        publicUrl,
      });
      successful += 1;
    } catch (error) {
      report.push({ code, status: "omitido", reason: error.message });
    }
  }
  const ambiguous = [...grouped.values()].filter((matches) => matches.length > 1).length;
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    selection: AUTO_BARON ? "auto-baron" : "manual",
    candidateCodes: grouped.size,
    uniqueWithoutImage: uniqueMissingCodes.length,
    ambiguousCodes: ambiguous,
    attempted: report.length,
    successful,
    report,
  }, null, 2));
}

await run();
