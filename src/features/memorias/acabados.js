// Muestras de acabados (maderas, pisos, mesadas, telas, lonas y pinturas de
// casco). Las usan los campos de la memoria para proponer opciones con su foto
// y el showroom para el cliente. Cada muestra tiene `tex`: un fondo CSS (la foto
// real o, si no hay, una textura de respaldo).
import stoneBlackImg from "@/assets/textures/stone-black.png";
import stoneEntzoImg from "@/assets/textures/stone-entzo.png";
import stoneTravertinoImg from "@/assets/textures/stone-travertino.png";
import stoneAriaImg from "@/assets/textures/stone-aria.png";
import stoneDessertImg from "@/assets/textures/stone-dessert.png";
import woodSilverImg from "@/assets/textures/wood-silver.png";
import woodOakImg from "@/assets/textures/wood-oak.png";
import woodWalnutImg from "@/assets/textures/wood-walnut.png";
import woodGreyImg from "@/assets/textures/wood-grey.png";
import woodChocoImg from "@/assets/textures/wood-choco.png";
import woodCedarImg from "@/assets/textures/wood-cedar.png";
import floorWhiteImg from "@/assets/textures/floor-white.png";
import floorInfinityImg from "@/assets/textures/floor-infinity.png";
import floorSeadekImg from "@/assets/textures/floor-seadek.png";
import floorSandImg from "@/assets/textures/floor-sand.png";
import fabricShaniImg from "@/assets/textures/fabric-shani.jpg";
import fabricBhanuImg from "@/assets/textures/fabric-bhanu.jpg";
import fabricCharcoalImg from "@/assets/textures/fabric-charcoal.jpg";
import fabricBlackImg from "@/assets/textures/fabric-black.jpg";
import fabricPearlImg from "@/assets/textures/fabric-pearl.jpg";
import fabricNavyImg from "@/assets/textures/fabric-navy.jpg";
import canvasBlackImg from "@/assets/textures/canvas-black.jpg";
import canvasCharcoalImg from "@/assets/textures/canvas-charcoal.jpg";
import canvasGreyImg from "@/assets/textures/canvas-grey.jpg";
import canvasWhiteImg from "@/assets/textures/canvas-white.jpg";
import canvasBeigeImg from "@/assets/textures/canvas-beige.jpg";
import { texPiso } from "./memoriaAcabados";

const foto = (img) => `url(${img}) center/cover`;
const TECA = texPiso("#b08d5f", "#a37d4f", "#6b4e37");

export const PALETAS = {
  pintura: {
    titulo: "Color de casco",
    muestras: [
      { nombre: "Blanco Klase A", tex: "linear-gradient(155deg,#f4f4f2,#dfe0e2)" },
      { nombre: "Azul oscuro", tex: "linear-gradient(155deg,#1c2d4a,#0d1830)" },
      { nombre: "Gris Marbella", tex: "linear-gradient(155deg,#9aa0a8,#7c828a)" },
      { nombre: "Negro brillante", tex: "linear-gradient(155deg,#1a1b1e,#0c0d10)" },
      { nombre: "Verde inglés", tex: "linear-gradient(155deg,#1f4633,#12301f)" },
    ],
  },
  maderas: {
    titulo: "Maderas",
    muestras: [
      { nombre: "Roble Plata Rayado", tex: foto(woodSilverImg) },
      { nombre: "Roble Tinte Rayado", tex: foto(woodOakImg) },
      { nombre: "Nogal Natural", tex: foto(woodWalnutImg) },
      { nombre: "Gris Terso", tex: foto(woodGreyImg) },
      { nombre: "Chocolate", tex: foto(woodChocoImg) },
      { nombre: "Cedro satin", tex: foto(woodCedarImg) },
    ],
  },
  pisos: {
    titulo: "Pisos",
    muestras: [
      { nombre: "La Europea White", tex: foto(floorWhiteImg) },
      { nombre: "Infinity gris c/rayas negras", tex: foto(floorInfinityImg) },
      { nombre: "Seadek gris", tex: foto(floorSeadekImg) },
      { nombre: "Teca", tex: TECA },
      { nombre: "Arena náutica", tex: foto(floorSandImg) },
    ],
  },
  piedras: {
    titulo: "Mesadas",
    muestras: [
      { nombre: "Negro", tex: foto(stoneBlackImg) },
      { nombre: "Dekton Entzo Natural", tex: foto(stoneEntzoImg) },
      { nombre: "Travertino", tex: foto(stoneTravertinoImg) },
      { nombre: "Purastone Aria Pulido", tex: foto(stoneAriaImg) },
      { nombre: "Dessert black mate", tex: foto(stoneDessertImg) },
    ],
  },
  telas: {
    titulo: "Telas",
    muestras: [
      { nombre: "Shani 07", tex: foto(fabricShaniImg) },
      { nombre: "Bhanu 01", tex: foto(fabricBhanuImg) },
      { nombre: "Charcoal", tex: foto(fabricCharcoalImg) },
      { nombre: "Negro", tex: foto(fabricBlackImg) },
      { nombre: "Gris perla", tex: foto(fabricPearlImg) },
      { nombre: "Azul navy", tex: foto(fabricNavyImg) },
    ],
  },
  lonas: {
    titulo: "Lonas",
    muestras: [
      { nombre: "Negro", tex: foto(canvasBlackImg) },
      { nombre: "Charcoal con mosquitero", tex: foto(canvasCharcoalImg) },
      { nombre: "Gris", tex: foto(canvasGreyImg) },
      { nombre: "Blanco", tex: foto(canvasWhiteImg) },
      { nombre: "Beige", tex: foto(canvasBeigeImg) },
    ],
  },
};

// Qué paleta propone cada campo de la memoria.
const PALETA_DE_CAMPO = {
  color_casco: "pintura",
  madera_muebles: "maderas",
  piso: "pisos",
  color_mesadas: "piedras",
  tapiceria_mamparos: "telas",
  tapiceria_dinette: "telas",
  tapiceria_respaldos: "telas",
  tapiceria_exterior: "telas",
  color_acolchados: "telas",
  color_cerramientos: "lonas",
  loneria_toldo_proa: "lonas",
  loneria_cobertor: "lonas",
};

// Sin tildes ni mayúsculas: "Verde ingles" cargado antes es "Verde inglés".
export function sinTildes(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function paletaDeCampo(key) {
  const id = PALETA_DE_CAMPO[key];
  return id ? PALETAS[id] : null;
}

// La muestra que corresponde a un valor cargado (sin importar mayúsculas).
export function muestraDeValor(key, valor) {
  const texto = sinTildes(valor);
  if (!texto) return null;
  return paletaDeCampo(key)?.muestras.find((m) => sinTildes(m.nombre) === texto) || null;
}

// Familias del showroom (MemoriaSelector): cada una con los campos de este
// barco que aceptan sus muestras.
const AMBIENTES = [
  { id: "pintura", hint: "Exterior", cover: 0, campos: [["color_casco", "Casco"]] },
  { id: "maderas", hint: "Interiores y mobiliario", cover: 1, campos: [["madera_muebles", "Madera muebles"]] },
  { id: "pisos", hint: "Cubierta e interiores", cover: 0, campos: [["piso", "Piso"], ["alfombra", "Alfombra"]] },
  { id: "piedras", hint: "Piedras y superficies", cover: 2, campos: [["color_mesadas", "Mesadas"]] },
  {
    id: "telas", hint: "Tapicería", cover: 0,
    campos: [["tapiceria_mamparos", "Mamparos"], ["tapiceria_dinette", "Dinette"], ["tapiceria_respaldos", "Respaldos"], ["tapiceria_exterior", "Tapicería exterior"], ["color_acolchados", "Acolchados"]],
  },
  {
    id: "lonas", hint: "Exterior y cerramientos", cover: 4,
    campos: [["loneria_toldo_proa", "Toldo proa"], ["loneria_cobertor", "Cobertor"], ["color_cerramientos", "Cerramientos"]],
  },
];

export function familiasShowroom(clavesDelBarco) {
  return AMBIENTES
    .map((a) => ({
      id: a.id,
      nombre: PALETAS[a.id].titulo,
      hint: a.hint,
      cover: a.cover,
      items: PALETAS[a.id].muestras.map((m) => ({ nombre: m.nombre, tex: m.tex })),
      ambientes: a.campos.filter(([key]) => clavesDelBarco.has(key)).map(([key, label]) => ({ key, label })),
    }))
    .filter((f) => f.ambientes.length > 0);
}

export function seleccionesShowroom(familias, datos) {
  const out = {};
  for (const f of familias) {
    for (const amb of f.ambientes) {
      const valor = sinTildes(datos[amb.key]);
      const item = valor && f.items.find((i) => sinTildes(i.nombre) === valor);
      if (item) out[amb.key] = { fam: f.id, item: item.nombre };
    }
  }
  return out;
}
