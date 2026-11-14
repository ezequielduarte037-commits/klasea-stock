// Control del menú lateral desde una pantalla.
//
// Tornería ("Enfocar circuito") y Postventa ("ganar mapa") escondían el menú
// cuando cada pantalla montaba el suyo. Con el contenedor general el menú es
// uno solo, así que ahora lo pliegan a la columna de íconos por evento, sin
// tocar la preferencia que la persona guardó con Ctrl+B.
//
//   plegarMenu(true)  → plegado mientras la pantalla lo pida
//   plegarMenu(null)  → vuelve a lo que la persona tenía guardado
export const EVENTO_MENU_COMPACTO = "klasea:sidebar-compacto";

export function plegarMenu(plegado) {
  window.dispatchEvent(new CustomEvent(EVENTO_MENU_COMPACTO, { detail: plegado }));
}
