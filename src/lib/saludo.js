// Saludo de las pantallas de inicio (Home, pañol): según la hora, con el primer
// nombre del usuario y la fecha escrita.

export function saludoSegunHora(fecha = new Date()) {
  const hora = fecha.getHours();
  return hora < 12 ? "Buen día" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

// "ezequiel.adm" → "Ezequiel". Para saludar alcanza con el primer nombre.
export function primerNombre(username) {
  const base = String(username || "").split(/[.\s_@-]/).find(Boolean) || "";
  return base ? base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() : "";
}

// "Jueves, 17 de septiembre": mayúscula sólo en la primera letra (con
// text-transform: capitalize quedaba "17 De Septiembre").
export function fechaLarga(fecha = new Date()) {
  const texto = fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
