export const TOURS = {
  "compras-etapa": {
    titulo: "Compras por etapa",
    descripcion: "Cómo armar una tanda de compra y convertirla en un pedido.",
    roles: ["admin", "oficina", "tecnica", "compras"],
    pasos: [
      {
        target: '[data-tour="compras-tabs"]',
        titulo: "Todo el circuito, en una pantalla",
        cuerpo: "Trabajás por obra, mantenés plantillas reutilizables, agrupás lo pendiente por proveedor y después seguís los pedidos generados.",
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
        cuerpo: "Podés generar la tanda desde acá o abrir Por proveedor para reunir materiales de varias etapas de una misma obra. Si activás Pedido automático, se crea al vencer su tolerancia. El historial conserva quién hizo cada cambio.",
      },
    ],
  },
  "obras-planificacion": {
    titulo: "Planta y configuración de obras",
    descripcion: "Cómo leer la planta, reportar el avance de una obra y armar lo que toma cada línea.",
    roles: ["admin", "oficina", "tecnica"],
    pasos: [
      {
        target: '[data-tour="obras-planta-filtros"]',
        titulo: "Filtrá la planta",
        cuerpo: "Elegí el estado y la línea. La línea queda guardada para la próxima vez. Calendario muestra las fechas reales; Por desmolde alinea todas las obras en su S0.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-planta-gantt"]',
        titulo: "Todas las obras en el tiempo",
        cuerpo: "Cada fila es un barco: la barra va del inicio al fin del plan, el degradé es el avance reportado, el recuadro azul la etapa en la que debería estar hoy y el rombo violeta el desmolde.",
      },
      {
        target: '[data-tour="obras-panel"]',
        titulo: "Una obra sin perder la planta",
        cuerpo: "Al tocar una obra se despliegan sus etapas en el Gantt y se abre este panel. Con el botón de enfocar queda sólo esa obra en pantalla.",
      },
      {
        target: '[data-tour="obras-etapa-estado"]',
        titulo: "El avance se reporta por etapa",
        cuerpo: "Pendiente, En curso o Terminada con un toque. Las tareas son la lista de control: al tildar la primera, la etapa pasa sola a En curso. Si el plan dice que una etapa ya debería estar terminada, la obra lo pregunta.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-vacaciones"]',
        titulo: "Vacaciones propias de cada obra",
        cuerpo: "Cargá vacaciones, pausas o feriados: el plan saltea esos días sin cambiar el desmolde.",
      },
      {
        target: '[data-tour="obras-config-pasos"]',
        prepararClicks: ['[data-tour="obras-nav-config"]'],
        titulo: "Lo que toma cada obra",
        cuerpo: "Cada línea se configura una vez en tres pasos, con su avance a la vista: el recorrido de etapas, las tareas de cada etapa y los productos que usa cada etapa.",
      },
      {
        target: '[data-tour="obras-config-recorrido"]',
        prepararClicks: ['[data-tour="obras-config-paso-recorrido"]'],
        titulo: "El recorrido se arrastra",
        cuerpo: "Cada etapa se ubica en semanas respecto del desmolde. Arrastrá la barra para moverla y estirá el borde para cambiar los días. Todas las obras de la línea toman el cambio.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-config-productos"]',
        prepararClicks: ['[data-tour="obras-config-paso-productos"]'],
        titulo: "Productos por etapa",
        cuerpo: "La bandeja trae la matriz del modelo. Elegí productos y asignalos a una etapa, o arrastralos encima de la etapa. Lo asignado viaja a Compras cuando la etapa está vinculada a una tanda.",
        interactivo: true,
      },
    ],
  },
  muebles: {
    titulo: "Muebles",
    descripcion: "Cómo seguir la fabricación, el enchapado, los herrajes, el stock y la recepción.",
    roles: ["admin", "oficina", "tecnica", "muebles", "compras"],
    pasos: [
      {
        target: '[data-tour="muebles-tabs"]',
        titulo: "Tres áreas, un solo circuito",
        cuerpo: "Seguimiento concentra la fabricación completa. Stock guarda muebles todavía sin obra y Recepción contiene el checklist final cuando ya llegaron.",
      },
      {
        target: '[data-tour="muebles-resumen"]',
        titulo: "La situación general",
        cuerpo: "Estos indicadores muestran cuántos procesos están activos, quién los fabrica, cuáles están en logística y cuántos conjuntos ya fueron recibidos.",
      },
      {
        target: '[data-tour="muebles-nuevo"]',
        titulo: "Crear un proceso",
        cuerpo: "Elegí Oberti o Morph y definí si los muebles se fabrican para una obra o para stock. Morph tiene un recorrido corto; Oberti incluye preparación, enchapado, herrajes y flete.",
      },
      {
        target: '[data-tour="muebles-procesos"]',
        titulo: "Elegí los muebles que querés gestionar",
        cuerpo: "Cada tarjeta identifica mueblero, obra o stock, línea, chapa y avance. Los filtros permiten separar rápidamente Oberti, Morph y muebles para stock.",
        interactivo: true,
      },
      {
        target: '[data-tour="muebles-recorrido"]',
        titulo: "El recorrido de fabricación",
        cuerpo: "Acá ves la etapa actual y la próxima acción. Podés seleccionar cualquier etapa: si se omiten pasos o quedan pendientes, el sistema muestra una advertencia y registra la decisión.",
      },
      {
        target: '[data-tour="muebles-preparacion"]',
        titulo: "La OT se entrega a Banco",
        cuerpo: "El carpintero de banco recibe una sola OT para preparar chapas y tablones. Cuando termina, Oficina Técnica digitaliza la parte de chapas dentro del sistema.",
        interactivo: true,
      },
      {
        target: '[data-tour="muebles-enchapado-herrajes"]',
        titulo: "Cada destino recibe lo necesario",
        cuerpo: "La OT de chapas digitalizada se imprime y acompaña el material a la enchapadora. A Oberti se le envía solamente el aviso de la OT de tablones para que sepa qué recibirá. Los herrajes se gestionan en paralelo.",
        interactivo: true,
      },
      {
        target: '[data-tour="muebles-tabs"]',
        titulo: "Cómo termina el circuito",
        cuerpo: "Cuando los muebles empiezan a volver, pasalos a Recibido: la recepción puede quedar parcial durante varios envíos. El checklist indica cuándo está completa. Los muebles Morph de stock se asignan a una obra desde Stock.",
      },
    ],
  },
};

export function puedeVerTour(tour, role) {
  if (!tour) return false;
  if (!tour.roles?.length) return true;
  return tour.roles.includes(role);
}
