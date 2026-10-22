// Imagen del televisor del interior (configurador): un atardecer en el mar con el logo de Klase A.
// Sale del cielo qwantani_dusk_2 de public/cielos (Poly Haven, CC0), recortado en 16:9 alrededor
// del resplandor del sol con el horizonte abajo, y el logo de la casa en blanco.
//   npm i --no-save sharp
//   node scripts/tv-interior.mjs public/cielos/qwantani_dusk_2_puresky.jpg src/assets/logos/logo-klasea.png public/textures/interior/tv.jpg
import sharp from "sharp";
const [, , cielo, logo, salida] = process.argv;
const { width: W, height: H } = await sharp(cielo).metadata();
// El horizonte del cielo está al 83,5 % de la altura; abajo queda el reflejo en el agua.
const hor = Math.round(H * 0.835), alto = Math.round((H - hor) / 0.3), ancho = Math.round(alto * 16 / 9);
const cx = Math.round(W * 0.585);
const foto = await sharp(cielo).extract({ left: cx - Math.round(ancho / 2), top: H - alto, width: ancho, height: alto })
  .resize(1280, 720, { kernel: "lanczos3" }).modulate({ brightness: 0.98, saturation: 1.25 }).linear(1.12, -14).toBuffer();
const lg = await sharp(logo).resize(520).toBuffer();
const { height: hl } = await sharp(lg).metadata();
const vineta = Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="55%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`);
await sharp(foto).composite([{ input: vineta }, { input: lg, left: Math.round((1280 - 520) / 2), top: Math.round(230 - hl / 2) }])
  .jpeg({ quality: 86, mozjpeg: true }).toFile(salida);
