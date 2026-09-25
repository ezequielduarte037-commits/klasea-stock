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
const MODELOS_3D = {
  64: "/models/k64.glb",
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
