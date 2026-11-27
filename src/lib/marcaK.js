// La marca de Klase A: la K en su círculo, en vector y con los trazos ya
// pasados a contorno (sirve para imprenta, ploteo y para meter en HTML).
// Calcada de logo-k.png sobre un cuadrado de 100 × 100: todos los trazos de
// 4,2 de grueso. components/ui/LogoK.jsx dibuja la misma idea más fina y con
// trazos, para poder animarla.
//
// El logo con "KLASE A" escrito al lado no se usa más: estaba mal hecho.

export const MARCA_K_VIEWBOX = "2.6 2.6 94.8 94.8";

// Anillo, palo vertical y la curva (brazo de arriba, rulo de 270° y brazo de
// abajo, con las dos puntas cortadas en horizontal). Cada uno va en su propio
// <path> para que donde se pisan no se agujereen.
export const MARCA_K_PATHS = [
  "M2.6 50A47.4 47.4 0 1 1 97.4 50A47.4 47.4 0 1 1 2.6 50ZM6.8 50A43.2 43.2 0 1 0 93.2 50A43.2 43.2 0 1 0 6.8 50Z",
  "M30.9 22.3H35.1V77.7H30.9Z",
  "M76.19 22.3L40.4 58.1A11.45 11.45 0 1 1 40.4 41.9L76.19 77.7H70.25L37.43 44.87A7.25 7.25 0 1 0 37.43 55.13L70.25 22.3Z",
];

/** La marca como texto SVG, para papeles armados en HTML. */
export function marcaKSvg({ color = "currentColor", tam = null, titulo = "Klase A", clase = "" } = {}) {
  const medida = tam ? ` width="${tam}" height="${tam}"` : "";
  const cls = clase ? ` class="${clase}"` : "";
  const rol = titulo ? ` role="img" aria-label="${titulo}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARCA_K_VIEWBOX}"${medida}${cls}${rol} fill="${color}">`
    + MARCA_K_PATHS.map((d) => `<path d="${d}"/>`).join("")
    + "</svg>";
}
