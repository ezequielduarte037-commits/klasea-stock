/* Plano de cada modelo. Los PNG no vienen todos orientados igual: los que
   tienen la proa a la derecha se espejan para que siempre apunte a la izquierda
   (así proa, popa, babor y estribor caen en el mismo lugar en cualquier modelo). */
import k37 from "@/assets/boats/k37.png";
import k42 from "@/assets/boats/k42.png";
import k43 from "@/assets/boats/k43.png";
import k52 from "@/assets/boats/k52.png";
import k55 from "@/assets/boats/k55.png";
import k64 from "@/assets/boats/k64.png";
import k85 from "@/assets/boats/K85.png";

// ?probar habilita el probador del recorrido 3D por esta sesión: el manual
// reescribe la dirección al navegar entre capítulos y el parámetro se pierde.
try {
  if (new URLSearchParams(window.location.search).has("probar")) sessionStorage.setItem("ka_probar", "1");
} catch { /* sin almacenamiento */ }

const PLANOS = {
  37: { src: k37, espejo: true },
  42: { src: k42, espejo: false },
  43: { src: k43, espejo: false },
  52: { src: k52, espejo: false },
  55: { src: k55, espejo: true },
  64: { src: k64, espejo: false },
  85: { src: k85, espejo: true },
};

/* Modelos 3D exportados desde Rhino (public/models). Los que no están acá
   usan el casco armado con el plano. */
// lineas: dibujar contornos (modelos sin materiales ni detalle, como el K64).
const MODELOS_3D = {
  // interior: el interior solo, para la vista interior (sin cortar el exterior).
  // flotacion: la pintura antiincrustante del K43 termina a 0,726 m sobre la
  // quilla (línea de flotación de diseño); el agua va a 0,72 m y la franja
  // oscura asoma apenas, como en las fotos.
  // pov: lugares del interior para el configurador, como una persona parada
  // adentro (ojos a 1,55 m del piso; coordenadas de la escena, 1 = 1,36 m).
  43: {
    url: "/models/k43.glb", lineas: false, interior: "/models/k43-interior.glb", flotacion: 0.72,
    pov: [
      { id: "salon", t: "Salón", ojo: [0.75, 1.17, -0.22], mira: [2.9, 0.5, 0.0] },
      { id: "cocina", t: "Cocina", ojo: [1.75, 1.15, 0.3], mira: [0.75, 0.42, -0.9] },
      { id: "proa", t: "Comedor", ojo: [1.72, 1.1, 0.32], mira: [3.2, 0.26, -0.1] },
      { id: "popa", t: "Hacia popa", ojo: [2.6, 1.05, -0.1], mira: [0.6, 0.6, 0.1] },
      { id: "camarote", t: "Camarote", ojo: [0.05, 0.32, 0.0], mira: [-1.35, -0.08, 0.0] },
      { id: "bano", t: "Baño", ojo: [0.3, 0.98, 0.45], mira: [0.8, 0.62, 0.98] },
    ],
    // Plafones del interior: salón, comedor de proa y camarote de popa.
    plafones: [[1.1, 1.12, -0.15], [2.75, 1.05, 0], [-0.75, 0.22, 0]],
    // Decoración del interior (decoracion.js): objetos sueltos (p: dónde
    // apoyan; r: giro en grados), tiras LED con la luz que dejan en pared y
    // mesada (o, u, v: cada superficie), el espejo del botiquín y la pantalla.
    decoracion: {
      objetos: [
        // Cocina: equipada como las de los astilleros (anafe, bacha con
        // grifería, cafetera y pava) y una orquídea.
        { q: "cafetera", p: [0.98, 0.526, -0.9] },
        { q: "anafe", p: [1.25, 0.526, -0.77] },
        { q: "pava", p: [1.5, 0.526, -0.945], r: -20 },
        { q: "bacha", p: [1.66, 0.526, -0.76] },
        { q: "orquidea", p: [1.86, 0.526, -0.7], r: 40 },
        // Mesa del comedor puesta para dos, la botella y una frutera.
        { q: "puesto", p: [2.3, 0.399, 0.175] },
        { q: "puesto", p: [2.3, 0.399, -0.175], r: 180 },
        { q: "botella", p: [2.3, 0.399, 0.0] },
        { q: "frutera", p: [2.62, 0.399, 0.0], semilla: 3 },
        // Baño
        { q: "toallas", p: [0.58, 0.497, 0.95], r: 90 },
        { q: "jabonera", p: [0.972, 0.497, 0.98], r: -90 },
        { q: "planta", p: [0.982, 0.497, 0.868], semilla: 5 },
        // Camarote de popa: camas tendidas y los nichos de las cabeceras.
        { q: "cama", p: [-1.303, -0.058, 0.25], largo: 1.42, ancho: 0.55, lado: 1, semilla: 5 },
        { q: "cama", p: [-1.303, -0.058, -0.25], largo: 1.42, ancho: 0.55, lado: -1, semilla: 9 },
        { q: "difusor", p: [-0.88, 0.256, 0.98], semilla: 4 },
        { q: "libros", p: [-1.06, 0.256, 0.99], r: 8, tapas: 3 },
        { q: "florero", p: [-0.9, 0.256, -0.99], semilla: 6 },
        { q: "estante", p: [-1.13, 0.256, -0.875], n: 5, tapas: 1 },
      ],
      leds: [
        // Bajo las alacenas de la cocina, junto a la pared.
        { tira: [[0.88, 0.884, -0.995], [1.9, 0.884, -0.995]], banos: [
          { o: [0.86, 0.526, -1.019], u: [1.06, 0, 0], v: [0, 0.36, 0] },
          { o: [0.86, 0.5275, -1.02], u: [1.06, 0, 0], v: [0, 0, 0.32], fv: [0, 0.07], sombraV: 0.3 },
        ] },
        // Bajo el botiquín del baño.
        { tira: [[0.575, 0.768, 1.05], [1.015, 0.768, 1.05]], banos: [
          { o: [0.56, 0.497, 1.0715], u: [0.47, 0, 0], v: [0, 0.272, 0] },
          { o: [0.52, 0.4985, 1.072], u: [0.51, 0, 0], v: [0, 0, -0.24], fv: [0, 0.05], sombraV: 0.2 },
        ] },
      ],
      espejo: { c: [0.7955, 1.0125, 0.9255], n: [0, 0, -1], ancho: 0.457, alto: 0.475 },
      pantalla: { c: [1.824, 0.6995, 0.7145], n: [0.962, 0, -0.272], ancho: 0.444, alto: 0.263 },
    },
  },
  // corte: altura (m, sobre la base del .3dm) de la vista interior; el K64
  // no tiene piso de camarotes, se corta bajo el salón para ver los de abajo.
  64: { url: "/models/k64.glb", lineas: true, corte: 2.0 },
};

export function modelo3dDe(modelo) {
  const m = String(modelo || "").match(/(\d{2})/);
  return MODELOS_3D[m?.[1]] || null;
}

export function planoDe(modelo) {
  const m = String(modelo || "").match(/(\d{2})/);
  return PLANOS[m?.[1]] || PLANOS[52];
}

/* "K52 HT" → { base: "K52", sufijo: "HT" } */
export function partesModelo(modelo) {
  const limpio = String(modelo || "").trim();
  if (!limpio) return { base: "Klase A", sufijo: "" };
  const [base, ...resto] = limpio.split(/\s+/);
  return { base, sufijo: resto.join(" ") };
}
