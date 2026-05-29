// Fetch de metadata de URLs (Open Graph + title + description + price si está).
// Usa un fetch simple del HTML y regex sobre las meta tags más comunes.
// Funciona bien para Mercado Libre, MercadoShops, sitios estándar.

export interface UrlMeta {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  price?: string;
  site?: string;
  error?: string;
}

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX) ?? [];
  // Limpia paréntesis/coma finales
  return matches.map((u) => u.replace(/[).,;]+$/, ""));
}

export async function fetchUrlMeta(url: string): Promise<UrlMeta> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KlaseaBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "es-AR,es;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return { url, error: `HTTP ${res.status}` };
    }

    // Solo procesamos HTML
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return { url, error: `content-type no html: ${ct}` };
    }

    // Leer hasta 200KB (las meta tags suelen estar en los primeros KB)
    const html = (await res.text()).slice(0, 200_000);

    const meta: UrlMeta = { url };
    meta.title = pickMeta(html, "og:title") || pickMeta(html, "twitter:title") || pickTagContent(html, "title");
    meta.description = pickMeta(html, "og:description") || pickMeta(html, "twitter:description") || pickMeta(html, "description");
    meta.image = pickMeta(html, "og:image") || pickMeta(html, "twitter:image");
    meta.site = pickMeta(html, "og:site_name");

    // Mercado Libre + sitios similares usan product:price:amount o twitter:data1
    meta.price = pickMeta(html, "product:price:amount") ||
                 pickMeta(html, "product:price") ||
                 pickMeta(html, "twitter:data1") ||
                 pickPriceFromHtml(html);

    // Limpieza
    if (meta.title) meta.title = decode(meta.title).slice(0, 200);
    if (meta.description) meta.description = decode(meta.description).slice(0, 500);
    if (meta.price) meta.price = decode(meta.price).slice(0, 60);

    return meta;
  } catch (err) {
    return { url, error: String(err).slice(0, 200) };
  }
}

function pickMeta(html: string, property: string): string | undefined {
  // Soporta <meta property="x" content="y"> y <meta name="x" content="y">
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRe(property)}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${escapeRe(property)}["']`,
    "i",
  );
  return (html.match(re)?.[1]) || (html.match(re2)?.[1]);
}

function pickTagContent(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${escapeRe(tag)}[^>]*>([^<]+)</${escapeRe(tag)}>`, "i");
  return html.match(re)?.[1];
}

// Heurística para sitios que no exponen price en meta (busca $ + número o "ARS")
function pickPriceFromHtml(html: string): string | undefined {
  const re = /(?:ARS|US\$|UYU|\$)\s*([\d.,]+)/;
  const m = html.match(re);
  return m ? m[0] : undefined;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
