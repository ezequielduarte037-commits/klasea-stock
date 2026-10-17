/* ═══════════════════════════════════════════════════════════════
   Configurador · interior
   Texturas de las terminaciones de adentro (se crean al elegirlas y quedan
   guardadas):
   · Mesadas: cuarzo Purastone. La foto de cada placa hecha textura
     repetible en su tamaño real (scripts/purastone-mesadas.mjs).
   · Maderas: el roble del recorrido en otros tonos (barco.js).
   · Pisos: las tablas de la foto del piso, llevadas a otro tono.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { texturaRoble } from "../recorrido/barco";
import { PURASTONE } from "./opciones";

/* Piso de tablas: la foto del piso (laminate_floor_02) con su dibujo de
   tablas y veta, llevada a otro tono (claro como en los renders, gris, nogal). */
const TONOS_PISO = {
  claro: { base: [206, 182, 154], veta: 1.1 },
  gris: { base: [176, 170, 162], veta: 1.0 },
  nogal: { base: [116, 88, 66], veta: 1.2 },
};
function piso(tono) {
  const { base, veta: contraste } = TONOS_PISO[tono] || TONOS_PISO.claro;
  const L = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = L;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = `rgb(${base.join(",")})`;
  ctx.fillRect(0, 0, L, L);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Igual que la foto original en el acabado del piso (1,6 m por imagen).
  tex.repeat.set(1 / 1.6, 1 / 1.6);
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, L, L);
    const datos = ctx.getImageData(0, 0, L, L);
    const d = datos.data;
    let suma = 0;
    for (let i = 0; i < d.length; i += 4) suma += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    const media = suma / (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722 - media) * contraste;
      d[i] = base[0] + v; d[i + 1] = base[1] + v * 0.95; d[i + 2] = base[2] + v * 0.88;
    }
    ctx.putImageData(datos, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = "/textures/recorrido/laminate_floor_02_diff.jpg";
  return tex;
}

/* Mesada de Purastone. Mientras baja la foto se ve el color medio de la
   piedra (no la mesada negra): el lienzo ya tiene el tamaño de la foto. */
function purastone(id) {
  const { px: [ancho, alto], m: [mx, my], c: medio } = PURASTONE[id];
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext("2d");
  ctx.fillStyle = medio;
  ctx.fillRect(0, 0, ancho, alto);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Las UV del modelo vienen en metros.
  tex.repeat.set(1 / mx, 1 / my);
  tex.anisotropy = 16;
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, ancho, alto);
    tex.needsUpdate = true;
  };
  img.src = `/textures/purastone/${id}.jpg`;
  return tex;
}

/* clave: "purastone-blanco-nube", "roble-nogal", "piso-claro"… */
export function texturaInterior(clave) {
  const [tipo, variante] = clave.split("-");
  if (tipo === "roble") return texturaRoble(0.6, variante);
  if (tipo === "piso") return piso(variante);
  return purastone(clave.slice(tipo.length + 1));
}
