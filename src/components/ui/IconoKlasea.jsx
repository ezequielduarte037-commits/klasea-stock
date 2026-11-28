import { ICONO_GENERICO, trazosDeRuta } from "@/lib/iconosKlasea";

/**
 * Un ícono propio de Klase A, elegido por la ruta del módulo. Los dibujos
 * están en lib/iconosKlasea.js. Acepta size y strokeWidth como los de lucide,
 * así entra donde antes iba uno de ellos.
 */
export default function IconoKlasea({ ruta, size = 20, strokeWidth = 1.5, style, ...resto }) {
  const trazos = trazosDeRuta(ruta);
  // Sin dibujo propio cae un círculo pelado: en dev avisa para que se note al
  // agregar una ruta nueva.
  if (!trazos && import.meta.env.DEV) {
    console.warn(`[IconoKlasea] La ruta "${ruta}" no tiene ícono en lib/iconosKlasea.js; se dibuja el genérico.`);
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      {...resto}
    >
      {(trazos ?? ICONO_GENERICO).map((trazo, i) => (typeof trazo === "string"
        ? <path key={i} d={trazo} />
        : <path key={i} d={trazo.d} fill="currentColor" stroke="none" />))}
    </svg>
  );
}
