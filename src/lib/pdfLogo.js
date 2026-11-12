import logoKUrl from "@/assets/logos/logo-k.png";
import logoKlaseaUrl from "@/assets/logos/logo-klasea.png";

// El logo-k.png es una "K" clara pensada para fondo oscuro. Sobre el blanco de
// un PDF se pierde, así que se reconstruye: lo claro pasa a navy y el resto a
// transparente. Es el mismo tratamiento que ya usaban la hoja de ruta del
// cadete y la rendición de caja chica.

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadNavyLogo() {
  const img = await loadImage(logoKUrl);
  if (!img) return null;
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum > 90) { px[i] = 15; px[i + 1] = 23; px[i + 2] = 42; px[i + 3] = 255; }
      else { px[i + 3] = 0; }
    }
    ctx.putImageData(data, 0, 0);
    return { dataUrl: cvs.toDataURL("image/png"), aspect: h / w };
  } catch { return null; }
}

// El logotipo completo (K en su círculo + "KLASE A") en navy y recortado a lo
// que ocupa el dibujo: el PNG original es blanco y trae mucho margen vacío.
// Así los papeles usan la marca de verdad y no "KLASE A" escrito en Helvetica.
export async function loadNavyWordmark(color = [14, 54, 83]) {
  const img = await loadImage(logoKlaseaUrl);
  if (!img) return null;
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < px.length; i += 4) {
      // La opacidad del trazo blanco es la tinta: se conserva el borde suave.
      const tinta = Math.round(px[i + 3] * ((px[i] + px[i + 1] + px[i + 2]) / 765));
      px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = tinta;
      if (tinta > 40) {
        const p = i / 4, x = p % w, y = (p - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    ctx.putImageData(data, 0, 0);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    out.getContext("2d").drawImage(cvs, x0, y0, cw, ch, 0, 0, cw, ch);
    return { dataUrl: out.toDataURL("image/png"), aspect: ch / cw };
  } catch { return null; }
}

// Las dos marcas que usa el papel de la casa (lib/pdfKlasea): la K sola y el
// logotipo completo, en el color de acento. Si alguna no carga, el papel sale
// igual (la cabecera dibuja la K o escribe el nombre).
export async function cargarMarcasPdf() {
  const { ACENTO } = await import("./pdfKlasea.js");
  const [k, logotipo] = await Promise.all([
    loadNavyLogo().catch(() => null),
    loadNavyWordmark(ACENTO).catch(() => null),
  ]);
  return { logo: k?.dataUrl || null, logotipo: logotipo || null };
}
