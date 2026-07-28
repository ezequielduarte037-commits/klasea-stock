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
    titulo: "Planificación de producción",
    descripcion: "Cómo configurar líneas, etapas, tareas y vacaciones sin alterar el criterio del cronograma.",
    roles: ["admin", "oficina", "tecnica"],
    pasos: [
      {
        target: '[data-tour="obras-linea-foco"]',
        titulo: "Trabajá sobre una línea",
        cuerpo: "Primero enfocá una línea de producción. La selección queda guardada y filtra las obras, las etapas y los indicadores para que no se mezclen modelos.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-editar-linea"]',
        titulo: "La plantilla vive en la línea",
        cuerpo: "Desde Editar etapas configurás el plazo general, el orden del proceso y la duración prevista de cada etapa. Los cambios se reutilizan en las obras de esa línea.",
      },
      {
        target: '[data-tour="obras-linea-datos"]',
        prepararClicks: ['[data-tour="obras-editar-linea"]'],
        titulo: "Separá datos generales de etapas",
        cuerpo: "Datos de la línea contiene solamente nombre, orden, color y semanas totales estimadas. El recorrido y sus tareas se administran aparte para evitar confusiones.",
      },
      {
        target: '[data-tour="obras-semanas-linea"]',
        prepararClicks: ['[data-tour="obras-linea-datos"]'],
        titulo: "Plazo general de producción",
        cuerpo: "Cargá las semanas estimadas totales de la línea como referencia global. No reemplaza el detalle: cada etapa sigue teniendo su propia semana de inicio y su duración.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-etapas-lista"]',
        titulo: "El recorrido productivo",
        cuerpo: "Las etapas se ordenan acá. Cada una se ubica antes, durante o después del desmolde mediante S−, S0 o S+.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-duracion-etapa"]',
        prepararClicks: ['[data-tour="obras-etapa-item"]', '[data-tour="obras-editar-etapa"]'],
        titulo: "La duración de la etapa es la regla",
        cuerpo: "Indicá cuántos días debería durar la etapa completa. Esta duración define su fecha final y es obligatoria al crear o editar una etapa.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-tareas-etapa"]',
        titulo: "Las tareas pueden superponerse",
        cuerpo: "Las estimaciones de las tareas ayudan a asignar personas y esfuerzo, pero no se suman para calcular el final de la etapa. Varias tareas pueden ejecutarse al mismo tiempo.",
        interactivo: true,
      },
      {
        target: '[data-tour="obras-ruta-produccion"]',
        prepararClicks: ['[data-tour="obras-linea-modal-cerrar"]'],
        titulo: "El Project se calcula solo",
        cuerpo: "En cada obra, la ruta combina el desmolde, la semana relativa y la duración total de cada etapa. Las fechas manuales quedan únicamente como excepciones.",
      },
      {
        target: '[data-tour="obras-vacaciones"]',
        titulo: "Vacaciones propias de cada obra",
        cuerpo: "Cargá rangos de vacaciones, pausas o feriados. El cronograma saltea esos días sin cambiar el desmolde y muestra cuándo una fecha fue ajustada por calendario.",
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
