import { createContext, useContext } from "react";

export const TourContext = createContext(null);

export function useTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error("useTour debe usarse dentro de TourProvider.");
  return context;
}
