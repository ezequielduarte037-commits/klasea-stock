export const TOURS = {
  "compras-etapa": {
    titulo: "Compras por etapa",
    descripcion: "Cómo armar una tanda de compra y convertirla en un pedido.",
    roles: ["admin", "oficina", "tecnica", "compras"],
    pasos: [
      {
        target: '[data-tour="compras-tabs"]',
        titulo: "Todo el circuito, en una pantalla",
        cuerpo: "Trabajás por obra, podés mantener plantillas reutilizables y después seguir los pedidos generados.",
      },
      {
        target: '[data-tour="obra-selector"]',
        titulo: "1. Elegí la obra",
        cuerpo: "Cada obra tiene sus propias tandas de compra. Elegí una ahora para continuar con el recorrido.",
        interactivo: true,
      },
      {
        target: '[data-tour="nueva-etapa"]',
        titulo: "2. Creá una etapa de compra",
        cuerpo: "Una etapa agrupa materiales que conviene comprar juntos. Podés crearla de cero o copiar la plantilla del modelo.",
        interactivo: true,
      },
      {
        target: '[data-tour="etapas-lista"]',
        titulo: "3. Organizá las tandas",
        cuerpo: "Acá aparecen las etapas de compra de la obra. Elegí una para editarla; también podés reordenarlas.",
        interactivo: true,
      },
      {
        target: '[data-tour="agregar-materiales"]',
        titulo: "4. Cargá los materiales",
        cuerpo: "Desde esta sección agregás varios materiales juntos, ajustás cantidades y los vinculás opcionalmente con una etapa de producción.",
        interactivo: true,
      },
      {
        target: '[data-tour="generar-pedido"]',
        titulo: "5. Mandalo a Compras",
        cuerpo: "Cuando la tanda esté lista, generá el pedido. El historial conserva quién hizo cada cambio.",
      },
    ],
  },
};

export function puedeVerTour(tour, role) {
  if (!tour) return false;
  if (!tour.roles?.length) return true;
  return tour.roles.includes(role);
}
