// Muestras de acabados que se eligen en la memoria (y en el showroom).
//
// Los nombres salen de lo que de verdad se cargó en las memorias de los barcos
// (planilla vieja + sistema), no de un catálogo inventado. Cada muestra tiene
// `tex`: la foto real o, cuando el nombre dice el color (blanco, gris, nogal),
// un fondo aproximado. Si no se sabe cómo es, `tex` queda en null y se muestra
// una muestra neutra en vez de un color inventado.
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
import floorWhiteImg from "@/assets/textures/floor-white.png";
import floorInfinityImg from "@/assets/textures/floor-infinity.png";
import floorSeadekImg from "@/assets/textures/floor-seadek.png";
import fabricShaniImg from "@/assets/textures/fabric-shani.jpg";
import fabricBhanuImg from "@/assets/textures/fabric-bhanu.jpg";
import canvasBlackImg from "@/assets/textures/canvas-black.jpg";
import canvasCharcoalImg from "@/assets/textures/canvas-charcoal.jpg";
import canvasGreyImg from "@/assets/textures/canvas-grey.jpg";
import canvasWhiteImg from "@/assets/textures/canvas-white.jpg";
import canvasBeigeImg from "@/assets/textures/canvas-beige.jpg";
import { texPiso } from "./memoriaAcabados";

const foto = (img) => `url(${img}) center/cover`;
const liso = (a, b = a) => `linear-gradient(155deg, ${a}, ${b})`;
const veta = (a, b, c) => `repeating-linear-gradient(92deg, ${a} 0 9px, ${b} 9px 13px, ${c} 13px 22px)`;
const TECA = texPiso("#b08d5f", "#a37d4f", "#6b4e37");

const m = (nombre, tex = null, alias = []) => ({ nombre, tex, alias });

export const PALETAS = {
  pintura: {
    titulo: "Color de casco",
    muestras: [
      m("Blanco", liso("#f6f6f4", "#dfe1e4")),
      m("Gris", liso("#a3a8ae", "#7d838a")),
      m("Gris plomo", liso("#6c7178", "#4c5056")),
      m("Azul oscuro", liso("#1c2d4a", "#0d1830")),
      m("Negro", liso("#1a1b1e", "#0b0c0e")),
    ],
  },
  maderas: {
    titulo: "Maderas",
    muestras: [
      m("Gris Terso", foto(woodGreyImg)),
      m("Roble Plata Rayado", foto(woodSilverImg)),
      m("Roble Tinte Rayado", foto(woodOakImg), ["Roble Tinte Rallado"]),
      m("Nogal Italiano Rayado", veta("#5b3a24", "#3b2416", "#6e4a30")),
      m("Nogal natural", foto(woodWalnutImg), ["Nogal"]),
      m("Nogal poro cerrado", veta("#5a3a26", "#47301f", "#664430"), ["Nogal (Poro cerrado)", "Nogal por cerrado"]),
      m("Nogal poro abierto", veta("#5e3d27", "#3a2416", "#70492f")),
      m("Nocce Milano (melamina)", veta("#6b4a33", "#563a27", "#7a5539"), ["Nocce Milano"]),
      m("Milán Fumé", veta("#6f665e", "#58504a", "#7c736a"), ["Roble de Milan Fume", "Milan Fume"]),
      m("Chocolate Floreado", foto(woodChocoImg)),
      m("Avorio Milán", liso("#efe6d2", "#ddd2bb"), ["Avorio Milan"]),
      m("Melamina Camelia", null, ["Melamina Camellia"]),
    ],
  },
  // Pisos de adentro (salón y camarotes): vinílicos y SPC.
  pisos: {
    titulo: "Pisos interiores",
    muestras: [
      m("Orbis Floor OFXP 452-13", null, ["OFXP 452-13", "Orbis Floor OFXP 452-13", "OXFP 452-13", "OXFP 452-13 Orbis Floor"]),
      m("La Europea White", foto(floorWhiteImg), ["Europea White"]),
      m("Europea Nature Álamo", null, ["Europea Alamo", "Europea Nature Alamo"]),
      m("Europea Cream", liso("#ece2cc", "#dccfb3")),
      m("Europea SPC Foster Maple", null, ["Europea Spc foster Maple"]),
      m("Valvi Floor", null),
    ],
  },
  // Lo que se pisa afuera: cockpit, planchada, pasillos.
  cubiertas: {
    titulo: "Piso del cockpit",
    muestras: [
      m("Teca", TECA, ["Si / Teka", "Teka"]),
      m("Infinity gris claro", liso("#c9cbcd", "#aeb1b4")),
      m("Infinity gris oscuro", liso("#6f7377", "#55595d")),
      m("Infinity gris c/rayas negras", foto(floorInfinityImg), ["Infinity gris c/rayas"]),
      m("Seadek gris", foto(floorSeadekImg), ["Seadeck gris"]),
    ],
  },
  piedras: {
    titulo: "Mesadas",
    muestras: [
      m("Purastone Aria Pulido", foto(stoneAriaImg), ["Purastone Aria 25 Pulido", "Aria Pulido", "Puraprima Aria Pulido"]),
      m("Purastone Travertino Navona", foto(stoneTravertinoImg), ["Travertino Navona", "Prima travertino navona", "Travertino"]),
      m("Purastone Macchia Vecchia", null, ["Macchia Vecchia", "Macchia Vecchia Pulido"]),
      m("Purastone Blanco Zen Mate", liso("#f4f3ef", "#e6e4de"), ["Blanco Zen Mate", "Blanco ZEN Mate (Purastone)"]),
      m("Purastone Ora Gold", null, ["Ora Gold", "Purastone Ora Gold Pulido"]),
      m("Purastone Metro Grey Mate", liso("#9a9c9e", "#7f8285"), ["Metro Grey Mate"]),
      m("Purastone Desert Black", foto(stoneDessertImg), ["Desert Black", "Dessert black mate"]),
      m("Dekton Olimpo", null, ["Olimpo", "Dekton Olimpo Stonika"]),
      m("Dekton Entzo Natural", foto(stoneEntzoImg), ["Entzo natural"]),
      m("Dekton Kira Natural", null, ["Kira Natural", "Dekton Kira"]),
      m("Negro Marquina", foto(stoneBlackImg), ["Negro", "Dekton Negro Marquina"]),
      m("Neolith Calacata", null, ["Calacata Brillante Neolita", "Calacata"]),
    ],
  },
  // Mamparos, techos interiores y tapizado exterior.
  vinilos: {
    titulo: "Vinilos y cuerinas",
    muestras: [
      m("Alplast Hielo", liso("#eef1f2", "#dde2e4"), ["Hielo", "Alplast hielo", "Hielo Alplast"]),
      m("Vértigo blanco", liso("#f7f7f5", "#e5e5e2"), ["Vertigo blanco"]),
      m("Vértigo gris claro", liso("#cfd2d4", "#b6babd"), ["Vertigo Gris Claro"]),
      m("Vértigo blanco con vivo chocolate", "linear-gradient(90deg, #f3f2ef 0 78%, #4a2e1f 78% 86%, #f3f2ef 86%)", ["Vértigo blanco con vivos chocolate", "Vertigo Blanco con Hilo Chocolate"]),
      m("Pranna gris medio", liso("#8e9296", "#73777b")),
      m("Capra Perla", liso("#e9e4da", "#d6cfc2")),
      m("Jagger Ivory", liso("#efe7d4", "#ddd2ba"), ["Jagger color ivory"]),
      m("Cuerina blanca", liso("#f7f7f5", "#e7e7e4")),
    ],
  },
  // Almohadones, respaldos y dinette (Interdiseño).
  telas: {
    titulo: "Telas",
    muestras: [
      m("Interdiseño Anila 01", null, ["Anila 01"]),
      m("Interdiseño Shani 07", foto(fabricShaniImg), ["Shani 07"]),
      m("Interdiseño Shani 06", null, ["Shani 06"]),
      m("Interdiseño Shani 03", null, ["Shani 03"]),
      m("Interdiseño Bhanu 01", foto(fabricBhanuImg), ["Bhanu 01"]),
      m("Interdiseño Bhanu 11", null, ["Bhanu 11"]),
      m("Interdiseño Samsara 01", null, ["Samsara 01", "Samsahara"]),
      m("Interdiseño Lina Folk 09 blanco", null, ["Lina Folk 09 Blanco"]),
      m("Interdiseño Bortice color 1", null, ["Bortice color 1", "Bortice 01", "Liso Bortice Color 1"]),
      m("Interdiseño Sohan 01", null, ["Sohan 01"]),
    ],
  },
  lonas: {
    titulo: "Lonas",
    muestras: [
      m("Negro", foto(canvasBlackImg)),
      m("Charcoal", foto(canvasCharcoalImg), ["Charcoal grey"]),
      m("Gris", foto(canvasGreyImg)),
      m("Cadet Grey", liso("#8f9aa4", "#76818b")),
      m("Blanco", foto(canvasWhiteImg)),
      m("Beige", foto(canvasBeigeImg)),
    ],
  },
};

// Sin tildes ni mayúsculas: "Verde ingles" cargado antes es "Verde inglés".
export function sinTildes(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// Para comparar lo escrito a mano con una opción: sin tildes, sin espacios ni
// signos y sin letras repetidas ("Soft-Top", "Softop" y "SofTop" son lo mismo).
export function claveSimple(texto) {
  return sinTildes(texto).replace(/×/g, "x").replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
}

export function buscarMuestra(paleta, valor) {
  const clave = claveSimple(valor);
  if (!clave) return null;
  return PALETAS[paleta]?.muestras.find((x) => claveSimple(x.nombre) === clave || x.alias.some((a) => claveSimple(a) === clave)) || null;
}

// Familias del showroom (MemoriaSelector): sólo muestras con foto o color
// conocido, cada una con los campos de este barco que las aceptan.
const AMBIENTES = [
  { id: "pintura", hint: "Exterior", cover: 0, campos: [["color_casco", "Casco"]] },
  { id: "maderas", hint: "Interiores y mobiliario", cover: 1, campos: [["madera_muebles", "Madera muebles"]] },
  { id: "pisos", hint: "Salón y camarotes", cover: 1, campos: [["piso", "Piso interior"]] },
  { id: "cubiertas", hint: "Cockpit", cover: 0, campos: [["teca_tipo", "Piso del cockpit"]] },
  { id: "telas", hint: "Tapicería", cover: 1, campos: [["tapiceria_respaldos", "Respaldos"], ["tapiceria_dinette", "Dinette"], ["color_acolchados", "Acolchados"]] },
  { id: "lonas", hint: "Exterior y cerramientos", cover: 1, campos: [["loneria_toldo_proa", "Toldo proa"], ["loneria_cobertor", "Cobertor"], ["color_cerramientos", "Cerramientos"]] },
];

export function familiasShowroom(clavesDelBarco) {
  return AMBIENTES
    .map((a) => {
      const items = PALETAS[a.id].muestras.filter((x) => x.tex).map((x) => ({ nombre: x.nombre, tex: x.tex }));
      return {
        id: a.id,
        nombre: PALETAS[a.id].titulo,
        hint: a.hint,
        cover: Math.min(a.cover, items.length - 1),
        items,
        ambientes: a.campos.filter(([key]) => clavesDelBarco.has(key)).map(([key, label]) => ({ key, label })),
      };
    })
    .filter((f) => f.ambientes.length > 0 && f.items.length > 0);
}

export function seleccionesShowroom(familias, datos) {
  const out = {};
  for (const f of familias) {
    for (const amb of f.ambientes) {
      const muestra = buscarMuestra(f.id, datos[amb.key]);
      if (muestra?.tex) out[amb.key] = { fam: f.id, item: muestra.nombre };
    }
  }
  return out;
}
