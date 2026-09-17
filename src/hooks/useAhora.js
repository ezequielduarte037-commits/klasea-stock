import { useEffect, useState } from "react";

// La hora actual, renovada cada `cadaMs`. Para saludos y fechas alcanza con
// minutos: un reloj con segundos redibuja la pantalla entera cada segundo.
export function useAhora(cadaMs = 10 * 60 * 1000) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
