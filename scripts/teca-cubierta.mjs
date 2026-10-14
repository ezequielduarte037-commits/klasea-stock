// Hornea la cubierta de teca del recorrido y el configurador (public/textures/recorrido/teca_cubierta_*).
// Fuente: Poly Haven teak_veneer (CC0), mapas 2k jpg: Diffuse, nor_gl y Rough en una carpeta.
//   npm i --no-save sharp
//   node scripts/teca-cubierta.mjs carpeta   → escribe teca_cubierta_{diff,nor,rough}.jpg en esa carpeta
import sharp from "sharp";
const D = process.argv[2];
const T = 2048;
const leer = async f => { const { data, info } = await sharp(f).resize(T, T).raw().toBuffer({ resolveWithObject: true }); return { data, ch: info.channels }; };
const dif = await leer(`${D}/teak_Diffuse.jpg`);
const nor = await leer(`${D}/teak_nor_gl.jpg`);
const rug = await leer(`${D}/teak_Rough.jpg`);
let s = 7;
const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const paso = T / (1000 / 60);           // tabla + junta = 60 mm
const junta = Math.round(T * 0.005);     // 5 mm
const bisel = 3;
const nT = Math.round(T / paso);
const alto = T / nT;
const outD = Buffer.alloc(T * T * 3), outN = Buffer.alloc(T * T * 3), outR = Buffer.alloc(T * T);
const altura = new Float32Array(T * T);
for (let t = 0; t < nT; t++) {
  const y0 = Math.round(t * alto), y1 = Math.round((t + 1) * alto);
  const desde = Math.floor(azar() * (T - alto)); // franja de veta al azar
  const corrX = Math.floor(azar() * T);          // corrimiento a lo largo
  const tono = 0.93 + azar() * 0.16;             // cada tabla con su tono
  const calido = (azar() - 0.5) * 0.06;
  const tope = azar() < 0.55 ? Math.floor(azar() * T) : -1; // junta a tope (empalme)
  for (let y = y0; y < y1; y++) {
    const fy = desde + (y - y0);
    const dy = Math.min(y - y0, y1 - 1 - y);
    for (let x = 0; x < T; x++) {
      const sx = (x + corrX) % T;
      const si = (fy * T + sx);
      const o = (y * T + x);
      const dx = tope >= 0 ? Math.min(Math.abs(x - tope), T - Math.abs(x - tope)) : 1e9;
      const d = Math.min(dy - junta / 2, dx - junta / 2);
      if (d < 0) {
        // calafateo: negro mate, apenas irregular
        const v = 26 + azar() * 6;
        outD[o * 3] = v; outD[o * 3 + 1] = v - 1; outD[o * 3 + 2] = v - 2;
        outR[o] = 235; altura[o] = 0;
      } else {
        // teca: más clara que la foto y con el tono de la tabla
        const r = dif.data[si * dif.ch], g = dif.data[si * dif.ch + 1], b = dif.data[si * dif.ch + 2];
        const k = 1.12 * tono;
        outD[o * 3] = Math.min(255, r * k * (1 + calido) + 8);
        outD[o * 3 + 1] = Math.min(255, g * k + 6);
        outD[o * 3 + 2] = Math.min(255, b * k * (1 - calido) + 2);
        outR[o] = Math.min(255, rug.data[si * rug.ch] * 0.9 + 20);
        altura[o] = Math.min(1, d / bisel);
      }
      outN[o * 3] = nor.data[si * nor.ch]; outN[o * 3 + 1] = nor.data[si * nor.ch + 1]; outN[o * 3 + 2] = nor.data[si * nor.ch + 2];
    }
  }
}
// Relieve de las juntas sumado a la veta (normal OpenGL: verde hacia +v).
for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
  const o = y * T + x;
  const h = (xx, yy) => altura[((yy + T) % T) * T + ((xx + T) % T)];
  const gx = (h(x + 1, y) - h(x - 1, y)) * 1.6, gy = (h(x, y + 1) - h(x, y - 1)) * 1.6;
  let nx = (outN[o * 3] / 255) * 2 - 1, ny = (outN[o * 3 + 1] / 255) * 2 - 1, nz = (outN[o * 3 + 2] / 255) * 2 - 1;
  nx -= gx; ny += gy; // la imagen va de arriba hacia abajo y la v de abajo hacia arriba
  const l = Math.hypot(nx, ny, nz) || 1;
  outN[o * 3] = Math.round(((nx / l) + 1) * 127.5);
  outN[o * 3 + 1] = Math.round(((ny / l) + 1) * 127.5);
  outN[o * 3 + 2] = Math.round(((nz / l) + 1) * 127.5);
}
const raw = (b, c) => ({ raw: { width: T, height: T, channels: c } });
await sharp(outD, raw(outD, 3)).jpeg({ quality: 86, mozjpeg: true }).toFile(`${D}/teca_cubierta_diff.jpg`);
await sharp(outN, raw(outN, 3)).jpeg({ quality: 90, mozjpeg: true }).toFile(`${D}/teca_cubierta_nor.jpg`);
await sharp(outR, raw(outR, 1)).resize(1024, 1024).jpeg({ quality: 85 }).toFile(`${D}/teca_cubierta_rough.jpg`);
console.log("ok", nT, "tablas");
