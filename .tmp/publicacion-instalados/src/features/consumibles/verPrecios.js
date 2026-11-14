import { createContext, useContext } from "react";

/**
 * Si la persona ve precios y costos en Consumibles. El pañol no los ve
 * (puedeVerPrecios en lib/permissions). Lo provee ConsumiblesScreen; afuera de
 * esa pantalla vale true, que es como se comportaba antes.
 */
export const VerPreciosContext = createContext(true);

export function useVerPrecios() {
  return useContext(VerPreciosContext);
}
