import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { marcarTourCompletado } from "@/features/ayuda/ayudaStorage";
import { TOURS, puedeVerTour } from "@/features/ayuda/tours";
import { TourContext } from "@/features/ayuda/useTour";

const TourOverlay = lazy(() => import("@/features/ayuda/Tour"));

export default function TourProvider({ children }) {
  const [activo, setActivo] = useState(null);

  const cerrar = useCallback((completado = false) => {
    setActivo((actual) => {
      if (completado && actual) marcarTourCompletado(actual.id, actual.userId);
      return null;
    });
  }, []);

  const iniciarTour = useCallback((id, { role = "", userId = "anon" } = {}) => {
    const tour = TOURS[id];
    if (!tour || !puedeVerTour(tour, role)) return false;
    setActivo({ id, tour, paso: 0, userId });
    return true;
  }, []);

  const siguiente = useCallback(() => {
    setActivo((actual) => {
      if (!actual) return null;
      if (actual.paso >= actual.tour.pasos.length - 1) {
        marcarTourCompletado(actual.id, actual.userId);
        return null;
      }
      return { ...actual, paso: actual.paso + 1 };
    });
  }, []);

  const anterior = useCallback(() => {
    setActivo((actual) => actual ? { ...actual, paso: Math.max(0, actual.paso - 1) } : null);
  }, []);

  const value = useMemo(() => ({
    tourActivo: activo?.id ?? null,
    iniciarTour,
    cerrarTour: () => cerrar(false),
  }), [activo?.id, cerrar, iniciarTour]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {activo && (
          <TourOverlay
            key={`${activo.id}-${activo.paso}`}
            tour={activo.tour}
            pasoIndex={activo.paso}
            onAnterior={anterior}
            onSiguiente={siguiente}
            onCerrar={() => cerrar(false)}
          />
        )}
      </Suspense>
    </TourContext.Provider>
  );
}
