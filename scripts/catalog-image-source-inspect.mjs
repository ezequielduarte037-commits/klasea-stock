function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decode(value) {
  return compact(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/");
}

function absoluteUrl(value, base) {
  try {
    return new URL(decode(value), base).href;
  } catch {
    return "";
  }
}

function collectJsonImages(value, images) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonImages(item, images);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "image" || key === "images" || key === "thumbnailUrl") {
      if (typeof item === "string") images.add(item);
      else collectJsonImages(item, images);
    } else {
      collectJsonImages(item, images);
    }
  }
}

const requestedUrl = arg("url");
if (!requestedUrl) throw new Error("Usá --url=https://...");
const token = arg("token");
const response = await fetch(requestedUrl, {
  redirect: "follow",
  headers: { "user-agent": "KlaseA catalog source inspector/1.0" },
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const html = await response.text();
const rawImages = new Set();

for (const match of html.matchAll(/<(?:meta|img|source|a)[^>]+(?:content|src|href|data-src|data-original)=["']([^"']+)["']/gi)) {
  rawImages.add(match[1]);
}
for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try {
    collectJsonImages(JSON.parse(match[1]), rawImages);
  } catch {
    // Algunas tiendas publican JSON-LD no estricto; los atributos HTML siguen siendo inspeccionados.
  }
}

const images = [...rawImages]
  .map((value) => absoluteUrl(value, response.url))
  .filter(Boolean)
  .filter((value) => /(?:\.(?:avif|jpe?g|png|webp)(?:\?|$)|\/is\/image\/)/i.test(value))
  .filter((value) => !/(?:logo|icon|sprite|badge|flag|favicon|placeholder)/i.test(value))
  .filter((value, index, all) => all.indexOf(value) === index);
const productImages = images
  .filter((value) => /(?:p6pim|\/product(?:s|images?)?\/|gallery|product-image|main-image)/i.test(value))
  .slice(0, 60);

console.log(JSON.stringify({
  url: response.url,
  status: response.status,
  token,
  hasToken: !token || html.toLowerCase().includes(token.toLowerCase()),
  title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
  bytes: Buffer.byteLength(html),
  productImages,
  images: images.slice(0, 40),
}, null, 2));
