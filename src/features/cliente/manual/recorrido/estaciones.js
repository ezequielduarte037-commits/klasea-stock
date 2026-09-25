/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · estaciones
   El texto viene del recorrido anterior (escrito sobre el K52 HT con
   el astillero), ordenado por estación. Las posiciones son de
   referencia: u = 0 popa … 1 proa, lado = −1 babor … +1 estribor
   (fracción de la manga en ese punto), alto en puntales sobre cubierta.

   sistemas: qué volúmenes del interior se resaltan.
   interior: si la estación se ve con el casco transparente.
   cam: dónde se para la cámara (az en grados alrededor del barco,
   el en grados de elevación, dist en esloras).
═══════════════════════════════════════════════════════════════ */

export const SISTEMAS = [
  // largo en esloras, ancho en fracción de la manga local, alto en puntales
  { id: "motores",   t: "Motores",               u: 0.2,  lado: 0.32,  alto: -0.42, largo: 0.12,  ancho: 0.26, h: 0.5, doble: true },
  { id: "grupo",     t: "Grupo electrógeno",     u: 0.08, lado: -0.5,  alto: -0.4,  largo: 0.06,  ancho: 0.22, h: 0.4 },
  { id: "baterias",  t: "Baterías",              u: 0.32, lado: 0.6,   alto: -0.42, largo: 0.05,  ancho: 0.2,  h: 0.3 },
  { id: "gasoil",    t: "Tanque de gasoil",      u: 0.35, lado: 0,     alto: -0.62, largo: 0.1,   ancho: 0.55, h: 0.28 },
  { id: "agua",      t: "Tanques de agua",       u: 0.64, lado: 0,     alto: -0.58, largo: 0.08,  ancho: 0.55, h: 0.26 },
  { id: "tableros",  t: "Tableros 12 V y 220 V", u: 0.5,  lado: 0,     alto: 0.22,  largo: 0.015, ancho: 0.9,  h: 0.4 },
];

export const ESTACIONES = [
  {
    id: "bienvenida",
    nav: "Tu barco",
    titulo: "Un recorrido por tu barco",
    bajada: "Once estaciones, en el orden en que se prepara una salida. Tocá los números sobre el barco para ver qué hay en cada lugar, o activá la vista interior para ver lo que hay bajo cubierta.",
    cam: { az: 38, el: 24, dist: 1.75 },
    interior: false,
    sistemas: [],
    puntos: [
      { u: 0.99, lado: 0, alto: 0.2, t: "Proa", d: "La parte de adelante. Ahí está el ancla y el malacate." },
      { u: 0.02, lado: 0, alto: 0.2, t: "Popa", d: "La parte de atrás: plataforma de baño, toma de muelle y, debajo, la sala de máquinas." },
      { u: 0.5, lado: 1, alto: 0, t: "Estribor", d: "El lado derecho mirando hacia proa. Se sube por este lado." },
    ],
    pasos: [
      "Antes de subir, controlá que estén los elementos de seguridad obligatorios: un chaleco por persona, extintor y bengalas. Sin eso no se zarpa.",
      "Subí por la banda de estribor, el lado derecho mirando hacia adelante. Ahí está el gabinete de los cortes de baterías.",
      "Sin los cortes de baterías activados no funciona nada: ni luces, ni tableros, ni motores. Siempre es el primer paso.",
      "Hacer este recorrido una vez alcanza para entender el orden de encendido del barco.",
    ],
  },
  {
    id: "baterias",
    nav: "Baterías",
    titulo: "Cortes de baterías",
    bajada: "El punto de partida de cualquier salida. Sin los bancos habilitados, ningún tablero, bomba ni sistema eléctrico funciona.",
    cam: { az: 95, el: 34, dist: 1.35 },
    interior: true,
    sistemas: ["baterias"],
    foco: { u: 0.33, lado: 0.6, alto: 0 },
    puntos: [
      { u: 0.33, lado: 1, alto: 0.15, t: "Gabinete de cortes", d: "Puertita de acrílico negro en la banda de estribor. Adentro: MOTOR, SERVICIO, GRUPO y BOW." },
      { u: 0.33, lado: 0.55, alto: -0.42, t: "Bancos de baterías", d: "Bajo cubierta. Uno para arrancar los motores y otro para el servicio del barco." },
    ],
    pasos: [
      "Abrí la puertita de acrílico negro de estribor. Vas a ver una fila de interruptores: MOTOR, SERVICIO, GRUPO y BOW.",
      "Para encender un banco, presioná con firmeza el botón rojo ON. Empezá siempre por MOTOR.",
      "Activá también SERVICIO: alimenta los tableros del salón, las luces y las bombas.",
      "GRUPO sólo si vas a usar el generador; BOW sólo si vas a usar la hélice de proa o el ancla. El resto, apagado.",
      "Para apagar: primero bajá la barrita negra de seguridad y después presioná OFF. Sin bajar la barra, el botón no se mueve.",
      "Al dejar el barco, aunque sea diez minutos, apagá todos los cortes.",
    ],
  },
  {
    id: "doce",
    nav: "12 V",
    titulo: "Tablero de 12 voltios",
    bajada: "Distribuye la corriente de las baterías a luces, bombas y equipos. Se enciende circuito por circuito, no todo junto.",
    cam: { az: 145, el: 36, dist: 1.55 },
    interior: true,
    sistemas: ["tableros"],
    foco: { u: 0.5, lado: -0.2, alto: 0.3 },
    puntos: [
      { u: 0.5, lado: -0.45, alto: 0.4, t: "Tablero 12 V", d: "En el salón, la puerta de acrílico del lado izquierdo." },
      { u: 0.5, lado: -0.45, alto: 0.75, t: "Voltímetro", d: "Más de 12,6 V: bien cargadas. Entre 12 y 12,6 V: uso normal. Menos de 12 V: cargar antes de seguir." },
    ],
    pasos: [
      "En el salón hay dos puertas de acrílico negro. La de la izquierda es el tablero de 12 V: luces, bombas, malacate y la mayoría de los sistemas.",
      "Cada interruptor es una «térmica» con su etiqueta. Hacia arriba es ON.",
      "Subí sólo las que vas a usar: BOMBA POTABLE si vas a usar agua, MALACATE si vas a fondear.",
      "El voltímetro muestra las baterías de servicio: más de 12,6 V bien; menos de 12 V, recargar.",
      "El amperímetro muestra cuánto se está consumiendo ahora. Si es mucho, bajá algunas térmicas.",
    ],
  },
  {
    id: "doscientos",
    nav: "220 V",
    titulo: "Tablero de 220 voltios",
    bajada: "Maneja los artefactos de casa: aire, cocina, heladera y tomas. Primero se elige de dónde viene la corriente; después se encienden las cargas.",
    cam: { az: 215, el: 36, dist: 1.55 },
    interior: true,
    sistemas: ["tableros"],
    foco: { u: 0.5, lado: 0.2, alto: 0.3 },
    puntos: [
      { u: 0.5, lado: 0.45, alto: 0.4, t: "Tablero 220 V", d: "En el salón, la puerta de acrílico del lado derecho." },
      { u: 0.5, lado: 0.45, alto: 0.8, t: "Selectoras", d: "Las dos en la misma posición: C.A. TIERRA, C.A. GRUPO o C.A. CONVERTIDOR." },
    ],
    pasos: [
      "La puerta de la derecha del salón es el tablero de 220 V. Antes de tocar una térmica, decidí de dónde vas a sacar la corriente.",
      "Las dos selectoras giratorias van siempre en la misma posición: C.A. TIERRA (muelle), C.A. GRUPO (generador) o C.A. CONVERTIDOR (inverter).",
      "El orden es obligatorio: primero las selectoras, después las térmicas de los artefactos.",
      "Las térmicas controlan aire acondicionado, cocina, heladera, tomas y fabricadora de hielo. Encendé sólo lo que uses.",
      "Si algo no enciende: las dos selectoras en la misma posición, la térmica en ON y la fuente activa. Nueve de cada diez veces es una selectora.",
    ],
  },
  {
    id: "fuentes",
    nav: "Fuentes",
    titulo: "Muelle, generador o inverter",
    bajada: "Tres formas de tener 220 V a bordo, cada una para una situación distinta.",
    cam: { az: 200, el: 22, dist: 1.36 },
    interior: true,
    sistemas: ["grupo", "baterias"],
    foco: { u: 0.08, lado: 0.2, alto: 0 },
    puntos: [
      { u: 0.03, lado: 0.7, alto: 0.1, t: "Toma de muelle", d: "Donde se enchufa el cable amarillo que entrega el astillero." },
      { u: 0.07, lado: -0.45, alto: -0.35, t: "Grupo electrógeno", d: "Generador diésel en la sala de máquinas. Se maneja desde el salón." },
    ],
    pasos: [
      "Muelle: enchufá el cable amarillo entre el pilar del muelle y la toma del barco. Selectoras en C.A. TIERRA y levantá las térmicas que necesites.",
      "Generador: corte GRUPO activado, tecla del tablero del grupo una sola vez y, cuando esté estable, selectoras en C.A. GRUPO.",
      "Inverter: tablero del cargador/inversor en ON y la selectora chica en C.A. CONVERTIDOR. Sólo heladera, microondas, TV y tomas; mirá el voltímetro.",
      "Siempre que haya muelle o generador, subí la térmica CARGADOR DE BAT: carga las baterías solo, en tres etapas.",
    ],
  },
  {
    id: "motores",
    nav: "Motores",
    titulo: "Encendido de motores",
    bajada: "Una secuencia fija: cada paso es condición del siguiente.",
    cam: { az: 150, el: 26, dist: 1.33 },
    interior: true,
    sistemas: ["motores"],
    foco: { u: 0.3, lado: 0, alto: 0 },
    puntos: [
      { u: 0.2, lado: 0.4, alto: -0.35, t: "Motores", d: "En la sala de máquinas, bajo la bañera de popa." },
      { u: 0.48, lado: 0.4, alto: 0.7, t: "Puesto de mando", d: "Llave de arranque, pantallas del motor y palancas." },
    ],
    pasos: [
      "En el gabinete de estribor, activá el corte MOTOR (uno por motor si hay dos).",
      "En el puesto de mando, la palanca en NEUTRAL, bien centrada. Fuera de neutral el motor no arranca: es una protección.",
      "Girá la llave al primer clic y esperá a que la pantalla del motor termine de encenderse.",
      "Con la pantalla lista, girá la llave hasta el tope y soltala cuando el motor arranque. Igual con el segundo.",
      "Con los motores en marcha, presioná MORSE en la palanca para tomar el control del acelerador.",
      "Para apagar: palanca en NEUTRAL y después la llave al revés. Siempre en ese orden.",
    ],
  },
  {
    id: "grupo",
    nav: "Grupo",
    titulo: "Grupo electrógeno",
    bajada: "Un generador diésel que da 220 V sin estar enchufado al muelle.",
    cam: { az: 230, el: 30, dist: 1.12 },
    interior: true,
    sistemas: ["grupo"],
    foco: { u: 0.08, lado: -0.4, alto: 0 },
    puntos: [
      { u: 0.07, lado: -0.45, alto: -0.35, t: "Grupo", d: "Sala de máquinas. Adentro de su gabinete tiene una térmica propia." },
    ],
    pasos: [
      "Activá el corte GRUPO en el gabinete de baterías. Sin eso no tiene con qué arrancar.",
      "En el salón, en el tablero chico del grupo, presioná la tecla de encendido una sola vez. Dos veces puede apagarlo.",
      "Esperá entre 30 segundos y un minuto a que se estabilice.",
      "Después, las dos selectoras del tablero de 220 V en C.A. GRUPO y levantá las térmicas.",
      "Si arranca y se apaga solo, contá los destellos de la luz de la tecla: cada patrón es un código de falla.",
    ],
  },
  {
    id: "agua",
    nav: "Agua",
    titulo: "Agua y baños",
    bajada: "El agua potable es presurizada y automática. Los tanques están comunicados: se cargan por cualquiera de las dos tomas.",
    cam: { az: 25, el: 42, dist: 1.75 },
    interior: true,
    sistemas: ["agua"],
    foco: { u: 0.6, lado: 0, alto: 0 },
    puntos: [
      { u: 0.62, lado: 1, alto: 0.05, t: "Toma AGUA", d: "En los pasillos laterales de cubierta. Hay una por banda." },
      { u: 0.62, lado: 0, alto: -0.58, t: "Tanques", d: "Comunicados entre sí: el nivel sube parejo en los dos." },
      { u: 0.15, lado: -1, alto: 0.05, t: "Toma WASTE", d: "Para vaciar aguas negras en puerto, con la manguera de la marina." },
    ],
    pasos: [
      "Para cargar, buscá las tapas que dicen AGUA en los pasillos laterales y conectá la manguera.",
      "Para que salga agua, subí BOMBA POTABLE en el tablero de 12 V. Arranca y para sola.",
      "Los baños tienen su propio circuito: su térmica también tiene que estar activa.",
      "Para vaciar en puerto, el personal de la marina conecta su manguera en las tapas WASTE.",
      "En aguas abiertas, lejos de la costa: bomba de descarga activada en 12 V y la llave en posición I.",
    ],
  },
  {
    id: "seguridad",
    nav: "Seguridad",
    titulo: "Incendio y achique",
    bajada: "Sistemas que trabajan solos, pero que conviene conocer antes de salir.",
    cam: { az: 160, el: 40, dist: 1.5 },
    interior: true,
    sistemas: ["motores", "grupo"],
    foco: { u: 0.18, lado: 0, alto: 0 },
    puntos: [
      { u: 0.18, lado: 0, alto: 0.1, t: "Sala de máquinas", d: "Con fuego adentro, nunca abrir la tapa: los disparadores manuales están afuera." },
      { u: 0.4, lado: 0, alto: -0.75, t: "Sentina y achique", d: "Bombas automáticas. Si se activan, luz azul y alarma en el puesto de mando." },
    ],
    pasos: [
      "La sala de máquinas tiene extinción automática: a 70 °C el matafuego se dispara solo y corta el combustible.",
      "Con fuego en la sala de máquinas, nunca abras la tapa: entra oxígeno. Los disparadores manuales están afuera.",
      "Hay extintores portátiles en cada ambiente. Ubicalos antes de zarpar.",
      "Las bombas de achique son automáticas. Luz azul y alarma quieren decir que una se activó: revisá la sentina.",
      "Calefactor diésel: botón O una vez para el display y otra para arrancar. Nunca dejes el barco con el calefactor encendido.",
    ],
  },
  {
    id: "radio",
    nav: "Radio",
    titulo: "Radio y emergencias",
    bajada: "La radio VHF en canal 16 queda encendida durante toda la navegación: es el canal de escucha y socorro.",
    cam: { az: 125, el: 30, dist: 1.6 },
    interior: false,
    sistemas: [],
    foco: { u: 0.48, lado: 0.3, alto: 0.5 },
    puntos: [
      { u: 0.48, lado: 0.4, alto: 0.7, t: "Radio VHF", d: "En el puesto de mando. Canal 16 siempre en escucha." },
    ],
    pasos: [
      "Hombre al agua: botón MOB en el GPS, bajá la velocidad, tirá el aro y que alguien no lo pierda de vista.",
      "Entra agua: bombas de achique en manual, buscá por dónde entra y tapalo. Si no se controla en minutos, Prefectura.",
      "Incendio: motores apagados y extintor. Si no se controla en 30 segundos, canal 16 y preparar el abandono.",
      "MAYDAY por canal 16: nombre del barco, posición GPS, qué pasa y cuántas personas hay a bordo. Lento y claro.",
      "Prefectura Naval: 106. El modo emergencia del manual tiene todo esto en grande.",
    ],
  },
  {
    id: "fallas",
    nav: "Fallas",
    titulo: "Si algo no arranca",
    bajada: "Los cortes de PARALELO unen bancos de baterías para salir del paso. Se apagan apenas se resuelve el problema.",
    cam: { az: 60, el: 34, dist: 1.36 },
    interior: true,
    sistemas: ["baterias", "motores"],
    foco: { u: 0.28, lado: 0.3, alto: 0 },
    puntos: [
      { u: 0.33, lado: 1, alto: 0.15, t: "Paralelos", d: "En el mismo gabinete de cortes. Sólo para emergencias." },
      { u: 0.1, lado: 0.3, alto: -0.35, t: "Disyuntor de muelle", d: "En la sala de máquinas. Antes de tocarlo, todos los consumos de 220 V apagados." },
    ],
    pasos: [
      "Un motor no arranca: cortes de los dos motores más PARALELO DE MOTOR. Arrancá, esperá unos minutos y apagá el paralelo.",
      "Ninguno arranca: MOTOR, PARALELO MOTOR, SERVICIO y PARALELO SERVICIO. Si no responde, muelle o generador con el cargador, y esperar.",
      "El grupo no arranca: SERVICIO, GRUPO y PARALELO GRUPO. Cuando arranque, cinco minutos y apagá el paralelo.",
      "Enchufado pero sin 220 V: repetí el modo muelle. Si sigue, disyuntor de la sala de máquinas con todo el 220 V apagado. Si salta otra vez, técnico.",
      "Grupo andando pero sin 220 V: térmicas de 220 V en OFF y revisá la térmica dentro del gabinete del grupo.",
    ],
  },
];
