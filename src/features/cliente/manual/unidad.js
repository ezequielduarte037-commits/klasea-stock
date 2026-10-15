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
      { id: "proa", t: "Comedor", ojo: [1.95, 1.08, 0.3], mira: [3.4, 0.4, -0.15] },
      { id: "popa", t: "Hacia popa", ojo: [2.6, 1.05, -0.1], mira: [0.6, 0.6, 0.1] },
      { id: "camarote", t: "Camarote", ojo: [-0.1, 0.2, 0.0], mira: [-1.4, -0.1, 0.0] },
    ],
    // Plafones del interior: salón, comedor de proa y camarote de popa.
    plafones: [[1.1, 1.12, -0.15], [2.75, 1.05, 0], [-0.75, 0.22, 0]],
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
