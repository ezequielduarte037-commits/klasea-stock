// Campo de texto cuyo valor guardado se relee transformado (recortado, partido
// en renglones, reconocido como una opción, armado con otros datos). Mientras
// se escribe muestra lo tipeado tal cual y recién al salir del campo vuelve a
// mostrar lo guardado. Sin esto el espacio del final se pierde en cada tecla
// ("Gris" + " " vuelve como "Gris") y no se puede escribir "Gris perla", el
// Enter de un renglón nuevo desaparece, o el campo se vacía de golpe cuando
// lo escrito coincide con una opción.
//
// Usarlo siempre que `value` no sea exactamente lo último que entregó onChange.
import { useState } from "react";

export default function TextoLibre({ valor, onCambio, multilinea = false, onFocus, onBlur, ...props }) {
  const [borrador, setBorrador] = useState(null);
  const Campo = multilinea ? "textarea" : "input";
  return (
    <Campo
      {...props}
      value={borrador ?? valor ?? ""}
      onFocus={(e) => { setBorrador(e.target.value); onFocus?.(e); }}
      onChange={(e) => { setBorrador(e.target.value); onCambio(e.target.value); }}
      onBlur={(e) => { setBorrador(null); onBlur?.(e); }}
    />
  );
}
