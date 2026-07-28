import { CircleHelp } from "lucide-react";
import { C } from "@/theme";
import { useTour } from "@/features/ayuda/useTour";
import { TOURS, puedeVerTour } from "@/features/ayuda/tours";

export default function BotonAyuda({ tourId, profile, onBeforeStart }) {
  const { iniciarTour, tourActivo } = useTour();
  const tour = TOURS[tourId];
  const role = profile?.role ?? "";
  if (!puedeVerTour(tour, role)) return null;

  function iniciar() {
    onBeforeStart?.();
    window.setTimeout(() => {
      iniciarTour(tourId, {
        role,
        userId: profile?.user_id || profile?.id || profile?.username || "anon",
      });
    }, 160);
  }

  const disabled = !!tourActivo;
  return (
    <button
      type="button"
      onClick={iniciar}
      disabled={disabled}
      aria-label={`Ver ayuda de ${tour.titulo}`}
      title={`Ver tour de ${tour.titulo}`}
      style={{
        width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center",
        borderRadius: 10, border: `1px solid ${C.border}`, background: C.panelSolid,
        color: C.violet, cursor: disabled ? "default" : "pointer",
        boxShadow: "0 1px 2px var(--shadow)", opacity: disabled ? 0.55 : 1,
      }}
    >
      <CircleHelp size={17} strokeWidth={2} />
    </button>
  );
}
