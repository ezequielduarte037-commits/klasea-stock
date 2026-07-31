# Informe de trabajo — Sistema de gestión del astillero
## Julio 2026

---

## Resumen en una carilla

Durante julio se publicaron **86 mejoras** del sistema, con **14 pantallas nuevas o reconstruidas por completo** y **10 procesos automáticos** creados o mejorados (lectura de comprobantes y remitos, avisos por correo y WhatsApp, portal para proveedores, entre otros).

El grueso del trabajo se concentró en cuatro frentes:

1. **Digitalizar el circuito de solicitudes de pañol**, que hoy funciona en hojas de papel.
2. **Ordenar las compras por etapas**, con fechas que se calculan solas a partir del desmolde.
3. **Abrir tornería como unidad de seguimiento**, pieza por pieza, con tiempos de ida y vuelta.
4. **Empezar a cargar documentos sin tipear**, leyendo comprobantes, remitos y las propias solicitudes en papel con inteligencia artificial.

Además se sumaron el control de consumibles por balanza, la identificación de quien retira material con tarjeta y firma, el archivado de pedidos viejos de laminación, el orden del catálogo de materiales y la reorganización completa de marmolería como centro de control.

Los módulos de pañol (balanza, egresos, tarjetas) y laminación ya están en uso. Los más nuevos —tornería, el calendario con coordinación y la lectura de solicitudes por foto— están en puesta en marcha.

---

## Panorama del mes

| Área | Qué se hizo |
|---|---|
| **Pañol** | Solicitudes digitalizadas, egreso con tarjeta y firma, balanza para consumibles, conteo físico, registro de quién cambió qué |
| **Compras** | Pedidos por etapas con fechas calculadas desde el desmolde, avisos automáticos, pedidos multi-obra |
| **Tornería** | Módulo nuevo: seguimiento pieza por pieza con demoras y estado de cada taller |
| **Producción y fechas** | Grilla con alcance por línea, botadura estimada, calendario con coordinación de grúa/camión/cuadrilla |
| **Materiales** | Catálogo ordenado: variantes por modelo, marcas, duplicados resueltos, adicionales |
| **Muebles** | Lotes de producción con recepción parcial, separados del checklist histórico |
| **Laminación y maderas** | Archivo de pedidos viejos nunca recibidos, recepción parcial |
| **Marmolería** | Reorganización completa: bandeja de acciones, línea de tiempo, vista por barcos |
| **Personal** | Ausencias programadas (vacaciones, reposos, licencias) combinadas con presentismo |

---

## Lo más importante

### 1. Las solicitudes de pañol dejan de ser un papel suelto

**El problema:** el circuito real de pedidos al pañol sigue siendo una hoja A4 que se llena a mano, se pierde, no deja rastro de quién pidió qué, y cuando falta material nadie se entera hasta que se lo va a buscar.

**Qué se hizo:** el pañol carga la solicitud en el sistema, arma los ítems e imprime la hoja completa para quien quiera seguir usando el papel. El retiro se confirma con la tarjeta del empleado y su firma, y genera el egreso real de stock en el momento. Lo que falta cae **automáticamente en la bandeja de Compras**, sin que nadie tenga que avisar. Hay tres formas de cargar una solicitud: transcribir el papel, cargarla directamente quien la pide, o **sacarle una foto al papel y que el sistema la lea y deje un borrador para revisar**.

**Qué cambia:** cada retiro queda registrado con nombre, foto y firma; los faltantes se convierten solos en trabajo para Compras; y el papel deja de ser la única fuente de verdad. El circuito en papel sigue vigente mientras se adopta la herramienta — la transición no obliga a nadie a cambiar de un día para el otro.

### 2. Las compras se ordenan solas desde la fecha de desmolde

**El problema:** los pedidos de materiales se armaban a mano, sin una lógica clara de cuándo hace falta cada cosa, y los atrasos se descubrían tarde.

**Qué se hizo:** las compras ahora nacen de **etapas de compra** (tandas que arma el encargado), con una plantilla por modelo que se copia a cada obra y se puede editar libremente. Cada etapa tiene su fecha calculada hacia atrás desde el desmolde (por ejemplo, "10 semanas antes"), y si el desmolde se corre, **la fecha se recalcula sola y los atrasos aparecen solos**. Los pedidos pueden juntar varias etapas, varios proveedores y hasta varias obras. La generación automática de pedidos está apagada por defecto y se prende por etapa; cada pedido nuevo deja un aviso en la bandeja que Compras ya mira.

**Qué cambia:** en vez de revisar planillas para adivinar qué falta pedir, el sistema muestra qué etapa está atrasada y qué pedido hay que hacer ahora. Cada cambio queda registrado en lenguaje llano ("Ezequiel cambió Resina epoxi de 100 a 120").

### 3. Tornería: cada pieza, dónde está y cuánto tardó

**El problema:** de lo que sale a tornería o plegadora no se sabía dónde estaba cada pieza ni cuánto tardaba en volver. El tramo donde más se pierde tiempo es la compra previa del material.

**Qué se hizo:** un módulo completo que sigue **pieza por pieza**: qué salió, a qué taller, cuándo volvió, qué volvió incompleto. Incluye las plantillas por línea (armadas a partir de la planilla de procesos que ya se usaba), salidas y recepciones parciales, y el tramo de compra integrado (pedido → comprado → en el astillero) con recepción por ítem. El panel muestra los carriles por taller, las piezas listas, las bloqueadas y las que llevan **15 días o más demoradas**.

**Qué cambia:** la próxima acción concreta está a la vista: qué hay que retirar, qué hay que reclamar y qué está trabando a cada barco. El módulo está terminado y en puesta en marcha, con ajustes finos de presentación.

### 4. La lectura automática de documentos entró al taller

**El problema:** cargar comprobantes, remitos y solicitudes a mano consume horas y es la fuente de la mayoría de los errores de carga.

**Qué se hizo:** el sistema ahora lee comprobantes y remitos (foto o PDF), reconoce los materiales aunque el proveedor use abreviaturas distintas, y **recuerda los vínculos ya confirmados** para no volver a preguntar. Lo mismo con las solicitudes de pañol en papel: una foto alcanza para que quede un borrador armado, listo para revisar y confirmar. Las fotos originales quedan siempre guardadas como respaldo.

**Qué cambia:** la carga pasa de tipear a revisar. La persona confirma lo que el sistema propone en vez de cargarlo desde cero. La lectura de comprobantes ya está operativa; la de solicitudes por foto está en pruebas.

---

## El resto, por área

**Pañol.** Además de las solicitudes: egreso de consumibles por **balanza** con calibración de pesos (ya en uso), recepción por escaneo con varios códigos de barra por material, transferencias reales entre obras y stock con posibilidad de anular movimientos, conteo físico desde el lector, mapa de ubicaciones, y registro completo de quién cambió qué — se terminó el "Usuario: sin registrar".

**Compras.** Además de las etapas: pedidos con archivos adjuntos, semáforo por cobertura real de ítems, y un portal para que el proveedor responda sin intermediarios (en validación).

**Producción y fechas.** Grilla con alcance por línea, botadura estimada, atrasos a la vista y estados por barco y evento (pedido / gestionado). Se sumó un **calendario de producción** con vista de mes, feriados argentinos automáticos y avisos de conflicto: grúa doble un mismo día, cuadrilla en días corridos, viento fuerte. Cada evento puede llevar su checklist de coordinación (grúa, camión, cuadrilla). La parte de coordinación está construida y pendiente de habilitar.

**Materiales y catálogo.** Matriz de condicionantes por modelo (un K55 con o sin camarote marinero pide cosas distintas), variantes y marcas por ítem, asistente para resolver duplicados con decisiones que quedan guardadas, y adicionales vinculados al catálogo.

**Muebles.** Lotes de producción por juego completo con recepción parcial, separados del checklist histórico para no mezclar lo operativo con lo administrativo.

**Laminación y maderas.** Los pedidos viejos que nunca se recibieron —y probablemente no se reciban— se pueden **archivar** con un motivo, dejan de ensuciar los pendientes y los contadores, y se pueden restaurar si el material llega. Además, recepción parcial para los pedidos de maderas cargados antes del sistema nuevo.

**Marmolería.** La pantalla se reconstruyó como centro de control: bandeja de acciones prioritarias (qué plantillas pedir ahora, qué barcos tienen piezas demoradas, qué volvió incompleto), línea de tiempo desmolde → plantilla → envío → recepción, y vista de barcos como unidades operativas.

**Personal.** Ausencias programadas (vacaciones, reposos, licencias) combinadas con el presentismo, para no cruzar planillas a mano. Tarjetas de empleados vinculadas al legajo, que además usan los egresos de pañol.

**Cadete.** Hoja de ruta imprimible con los pedidos del día.

---

## En qué se está trabajando

- **Tornería:** módulo terminado, en puesta en marcha y ajuste fino del panel general.
- **Calendario con coordinación:** la vista de mes ya funciona; falta habilitar el checklist de coordinación (grúa/camión/cuadrilla) y los avisos de conflicto en el sistema.
- **Lectura de solicitudes por foto:** funciona como borrador a revisar; en pruebas con solicitudes reales.
- **Portal de proveedores y avisos automáticos:** listos, en validación con casos reales.
- **Semáforo de producción:** automatismo armado, en validación.

---

## Una aclaración honesta

Que algo esté construido no significa que ya se use todos los días. Está **en uso**: balanza y egresos de pañol, archivo de pedidos de laminación, lectura de comprobantes, presentismo con ausencias. Está **en puesta en marcha o pruebas**: tornería, solicitudes de pañol digitalizadas, calendario con coordinación, lectura por foto, portal de proveedores. El próximo paso natural es acompañar la adopción de lo que está en puesta en marcha antes de seguir construyendo.

*Informe elaborado a partir del registro completo de trabajo del 2 al 30 de julio de 2026 (86 publicaciones verificadas).*
