/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · contenido
   Todo el texto del manual vive acá, separado del diseño, para que
   postventa pueda corregirlo sin tocar componentes. Está escrito para
   alguien que no sabe de náutica: primero qué es, después qué hacer.
═══════════════════════════════════════════════════════════════ */

export const CAPITULOS = [
  { id: "tu-barco",       n: "01", t: "Tu barco",        k: "Las partes del barco, las palabras básicas y sus datos." },
  { id: "antes-de-salir", n: "02", t: "Antes de salir",  k: "Lo que se revisa en el amarre antes de soltar amarras." },
  { id: "motores",        n: "03", t: "Motores",         k: "Arrancar, leer el tablero y apagar sin dañar nada." },
  { id: "energia",        n: "04", t: "Energía",         k: "De dónde sale la electricidad y qué se puede enchufar." },
  { id: "a-bordo",        n: "05", t: "Vida a bordo",    k: "Agua, baños, ancla y bombas." },
  { id: "regreso",        n: "06", t: "Al volver",       k: "Cómo dejar el barco en puerto." },
  { id: "problemas",      n: "07", t: "Si algo falla",   k: "Los problemas más comunes y qué revisar primero." },
  { id: "seguridad",      n: "08", t: "Seguridad",       k: "Emergencias paso a paso y el equipo que tiene que haber a bordo." },
  { id: "mantenimiento",  n: "09", t: "Mantenimiento",   k: "Próximo service y estado de cada equipo." },
  { id: "glosario",       n: "10", t: "Glosario",        k: "Todas las palabras náuticas, explicadas simple." },
  { id: "videos",         n: "11", t: "Videos",          k: "Procedimientos filmados, de dos a diez minutos." },
  { id: "postventa",      n: "12", t: "Postventa",       k: "Reportar una falla con fotos y ver cómo sigue." },
];

export const capituloPorId = id => CAPITULOS.find(c => c.id === id) || null;

/* ── Lo esencial: las cuatro reglas que evitan casi todos los problemas ── */
export const ESENCIAL = [
  {
    n: "01",
    t: "Grifos de fondo abiertos",
    d: "Dejan entrar el agua que enfría los motores. Si están cerrados, el motor recalienta en minutos.",
    cap: "motores",
  },
  {
    n: "02",
    t: "Selector apagado antes del cable",
    d: "Antes de enchufar o desenchufar la corriente del muelle, la selectora del tablero va en apagado.",
    cap: "energia",
  },
  {
    n: "03",
    t: "Se apaga con la llave",
    d: "El botón rojo de STOP es sólo para emergencias. Usarlo seguido daña la inyección del motor.",
    cap: "motores",
  },
  {
    n: "04",
    t: "Canal 16 y 106",
    d: "Ante cualquier emergencia: radio VHF en canal 16 o Prefectura Naval al 106.",
    cap: "seguridad",
  },
];

/* ── Anatomía: cómo se llama cada parte ── */
export const ANATOMIA = [
  { id: "proa",     t: "Proa",     d: "La parte de adelante del barco. Hacia donde avanza." },
  { id: "popa",     t: "Popa",     d: "La parte de atrás, donde está la plataforma de baño y salen los motores." },
  { id: "babor",    t: "Babor",    d: "El lado izquierdo mirando hacia proa. De noche lleva luz roja." },
  { id: "estribor", t: "Estribor", d: "El lado derecho mirando hacia proa. De noche lleva luz verde." },
  { id: "eslora",   t: "Eslora",   d: "El largo total del barco. Define la amarra que se alquila y la tasa." },
  { id: "manga",    t: "Manga",    d: "El ancho máximo del barco. Importa para entrar en una amarra o un travel lift." },
];

/* Truco para recordar babor y estribor */
export const TRUCO_BABOR =
  "Babor y rojo tienen menos letras que estribor y verde: lo corto va con lo corto.";

/* ── Datos de la unidad (se guardan sólo en este dispositivo) ──
   Las claves son las mismas del panel anterior (prefijo ka_) para no
   perder lo que el cliente ya cargó. */
export const DATOS_UNIDAD = [
  { grupo: "Identificación", campos: [
    { k: "mat",   l: "Matrícula",             ph: "RP-123456" },
    { k: "mmsi",  l: "MMSI de la radio",      ph: "701000452", ayuda: "El número que identifica tu radio VHF. Lo pide Prefectura en una llamada." },
    { k: "senal", l: "Señal distintiva",      ph: "LW 9844" },
  ]},
  { grupo: "Seguro", campos: [
    { k: "scia", l: "Compañía",              ph: "Nombre de la aseguradora" },
    { k: "spol", l: "Número de póliza",      ph: "Número" },
    { k: "svto", l: "Vencimiento",           ph: "", tipo: "date" },
  ]},
  { grupo: "WiFi a bordo", campos: [
    { k: "wssid", l: "Red",                  ph: "Nombre de la red" },
    { k: "wpass", l: "Clave",                ph: "Contraseña", tipo: "password" },
  ]},
  { grupo: "Contactos", campos: [
    { k: "tmec", l: "Mecánico o técnico",    ph: "+54 9 11 ···· ····", tipo: "tel" },
    { k: "trem", l: "Asistencia y remolque", ph: "+54 9 ···· ···· ····", tipo: "tel" },
  ]},
];

/* ── Antes de salir ──
   Los id c1…c10 son los del panel anterior: el progreso guardado se mantiene. */
export const PRE_ZARPE = [
  { id: "c10", t: "Consultar el pronóstico",          d: "Viento, tormentas y altura del río o del mar para toda la salida, no sólo para la ida." },
  { id: "c1",  t: "Baterías con carga",               d: "El voltímetro del tablero tiene que marcar 12,5 V o más con todo apagado." },
  { id: "c2",  t: "Cable del muelle desconectado",    d: "Primero la selectora en apagado, después el cable. Salir con el cable puesto lo arranca.", critico: true },
  { id: "c3",  t: "Aceite y refrigerante",            d: "Varillas de ambos motores entre mínimo y máximo, con el motor frío." },
  { id: "c4",  t: "Grifos de fondo abiertos",         d: "Mirarlos, no sólo tocarlos: la manija alineada con el caño quiere decir abierto.", critico: true },
  { id: "c5",  t: "Sentina seca",                     d: "Levantar la tapa y mirar. Un poco de agua es normal; mucha agua es una pérdida." },
  { id: "c7",  t: "Combustible suficiente",           d: "Planificar con la regla de los tercios: un tercio para ir, uno para volver y uno de reserva.", critico: true },
  { id: "c6",  t: "Chalecos a mano",                  d: "Uno por persona, a la vista, y los chicos siempre con el suyo puesto." },
  { id: "c8",  t: "Electrónica y luces",              d: "GPS, radio VHF y luces de navegación encendidas y funcionando." },
  { id: "c9",  t: "Documentación a bordo",            d: "Matrícula, seguro vigente y registro de quien va al timón." },
];

/* ── Motores ── */
export const ARRANQUE = [
  { id: "p1", t: "Aceite y refrigerante",  d: "Varillas en ambos motores. Nivel entre mínimo y máximo con el motor frío." },
  { id: "p2", t: "Grifos de fondo abiertos", d: "Apertura completa. Verificarlo con la vista, no sólo al tacto.", critico: true },
  { id: "p3", t: "Palancas en neutral",    d: "Las dos palancas en el medio (punto muerto) antes de dar contacto." },
  { id: "p4", t: "Contacto y prueba de alarmas", d: "Girar la llave sin arrancar y esperar 5 segundos. Las alarmas suenan un momento y se callan: eso es normal." },
  { id: "p5", t: "Arrancar y controlar",   d: "Arrancar y mirar la presión de aceite antes de 10 segundos. La temperatura se normaliza a los 2 o 3 minutos." },
];

export const INSTRUMENTOS = [
  { t: "RPM",                u: "rev/min", d: "Las vueltas del motor. En neutral queda cerca de 600–700. Navegando, la mayoría del tiempo conviene ir por debajo del máximo." },
  { t: "Temperatura",        u: "°C",      d: "Normal entre 75 y 90 °C. Si sube de golpe: cortar el motor y revisar el grifo de fondo." },
  { t: "Presión de aceite",  u: "bar",     d: "Tiene que subir en los primeros segundos después de arrancar. Si no sube, apagar enseguida." },
  { t: "Voltaje",            u: "V",       d: "Con el motor en marcha marca entre 13,8 y 14,4 V: eso quiere decir que está cargando las baterías." },
];

export const MANDO_ELECTRONICO = [
  { t: "Tomar el mando",     d: "Palancas en neutral y mantener COMMAND 1,5 segundos." },
  { t: "Calentar",           d: "Mantener WARM 1,5 segundos: la luz parpadea y la palanca acelera sin meter marcha." },
  { t: "Sincronizar",        d: "Mantener ENGINE 1,5 segundos: una sola palanca maneja los dos motores." },
  { t: "Si falla la electrónica", d: "Pasar a override: el mando queda en modo mecánico de emergencia." },
];

/* ── Energía ── */
export const FUENTES = [
  {
    id: "puerto",
    t: "Corriente del muelle",
    corto: "Muelle",
    resumen: "Estás amarrado y enchufado a la marina. Es la opción más cómoda: podés usar todo.",
    pasos: [
      "Poner la selectora del tablero en apagado antes de tocar el cable.",
      "Conectar el cable del muelle a la toma del barco.",
      "Mover la selectora a C.A. TIERRA. Testigo verde: la polaridad está bien.",
      "Si el testigo está rojo, la fase está invertida: dar vuelta la ficha del lado del muelle.",
      "Recién con el testigo verde, encender equipos de alto consumo.",
    ],
    nota: "La polaridad invertida daña el inverter y los equipos electrónicos. Mirar siempre el testigo antes de encender cargas.",
  },
  {
    id: "grupo",
    t: "Grupo electrógeno",
    corto: "Generador",
    resumen: "Estás fondeado o navegando y necesitás aire acondicionado, anafe u horno.",
    pasos: [
      "Apagar todos los aires acondicionados antes de arrancar.",
      "Revisar el gasoil y el refrigerante del grupo.",
      "Arrancar y esperar 30 segundos a que se estabilice.",
      "Mover la selectora a C.A. GRUPO. Recién ahora se encienden las cargas.",
      "Para apagar: bajar las cargas, dejarlo 3 minutos sin consumo y apagar.",
    ],
    nota: "Arrancar el grupo con los aires encendidos genera un pico de corriente que lo daña.",
  },
  {
    id: "inverter",
    t: "Inverter",
    corto: "Baterías",
    resumen: "Sin muelle y sin generador: usás la energía guardada en las baterías, en silencio.",
    pasos: [
      "Controlar las baterías de servicio: mínimo 12,2 V para usar el inverter.",
      "Encender el inverter desde su panel (botón verde).",
      "Mover la selectora chica a C.A. CONVERTIDOR.",
      "Mirar el voltaje de vez en cuando y cortar si baja de 12,0 V.",
      "Para apagar: cortar cargas, apagar el inverter y la selectora en apagado.",
    ],
    nota: "Nunca usar aire acondicionado ni estufas eléctricas con el inverter: consumen más de lo que las baterías pueden dar.",
  },
];

export const CONSUMOS = [
  { t: "Sólo con muelle o generador", items: ["Aire acondicionado", "Anafe eléctrico", "Termotanque", "Horno", "Lavavajillas"] },
  { t: "Se puede con inverter",       items: ["Heladera", "TV y audio", "Cargadores y teléfonos", "Microondas por poco tiempo", "Luces LED"] },
];

export const BATERIAS = [
  { t: "Banco de motores",  d: "Sólo sirve para arrancar. Está separado para que nunca te quedes sin poder arrancar." },
  { t: "Banco de servicio", d: "Alimenta luces, bombas, heladera y el inverter cuando estás sin muelle." },
  { t: "Paralelo",          d: "Une los dos bancos. Es para emergencias: cuando las de motor no alcanzan para arrancar." },
];

/* ── Vida a bordo ── */
export const MALACATE_ANTES = [
  "Motores encendidos: el malacate consume entre 600 y 800 A y vacía las baterías en segundos si no hay carga.",
  "La cadena bien guiada en su canal. Nunca operar con la cadena torcida.",
  "Nadie parado sobre la cadena ni cerca del ancla.",
  "Para fondear: posicionarse a 0–1 nudo sobre el punto elegido. Nunca soltar el ancla con el barco en velocidad.",
];

export const MALACATE_ERRORES = [
  { e: "Forzar el malacate con el ancla trabada", s: "Mover el barco con el motor para liberarla." },
  { e: "Usarlo más de 30 segundos seguidos",      s: "El motor se calienta. Pausa de 2 minutos cada 30 segundos." },
  { e: "Usarlo con los motores apagados",         s: "Las baterías de servicio no aguantan la descarga." },
  { e: "Subir el ancla a toda velocidad desde mucha profundidad", s: "Velocidad media y limpiar la cadena con la manguera mientras sube." },
];

export const EQUIPOS = [
  { t: "Bomba de achique",           d: "Saca el agua de la sentina sola. Si arranca muy seguido hay una filtración: avisar a postventa." },
  { t: "Bomba de agua potable",      d: "Si arranca sola cada tanto, hay una canilla abierta o una pérdida. Revisar la ducha de popa primero." },
  { t: "Escape de los motores",      d: "Tiene que salir agua junto con el humo. Si el chorro se corta, el motor va a recalentar." },
  { t: "Baño eléctrico",             d: "Sólo papel higiénico apto para embarcaciones. Nada de toallitas ni otros papeles." },
];

/* ── Al volver a puerto ── */
export const REGRESO = [
  { id: "r1", t: "Defensas y cabos listos",       d: "Colocar las defensas y preparar los cabos antes de entrar a la marina, no en la maniobra." },
  { id: "r2", t: "Amarrar",                        d: "Proa y popa bien sujetas, con un poco de juego para la marea o la crecida." },
  { id: "r3", t: "Motores en neutral unos minutos", d: "Dejarlos en marcha lenta para que se enfríen antes de cortar." },
  { id: "r4", t: "Apagar con la llave",            d: "Nunca con el botón rojo de STOP." },
  { id: "r5", t: "Conectar la corriente del muelle", d: "Selectora en apagado, cable, testigo verde, selectora a C.A. TIERRA." },
  { id: "r6", t: "Electrónica y luces apagadas",   d: "GPS, radio y luces de navegación." },
  { id: "r7", t: "Sentina revisada",               d: "Seca, y la bomba de achique en automático." },
  { id: "r8", t: "Escotillas y ventanas cerradas", d: "Lluvia y humedad son lo que más deteriora el interior." },
  { id: "r9", t: "Anotar las horas de motor",      d: "Sirve para saber cuándo toca el próximo service." },
  { id: "r10", t: "Enjuagar con agua dulce",       d: "Si navegaste en agua salada: cubierta, acero inoxidable y plataforma." },
];

/* ── Si algo falla ── */
export const DIAGNOSTICO = [
  { t: "El motor no arranca", d: "Revisar que los cortes de batería estén en ON. El paralelo se usa sólo si las baterías de motor no alcanzan. Si hay olor a combustible, ventilar 5 minutos con las escotillas abiertas antes de volver a intentar." },
  { t: "La temperatura del motor sube", d: "Cortar el motor enseguida. Revisar que el grifo de fondo esté abierto y sin algas ni bolsas. Controlar el refrigerante. No volver a arrancar hasta saber la causa." },
  { t: "La bomba de agua no se detiene", d: "Hay pérdida de presión. Lo más común: la ducha de popa mal cerrada o una canilla que gotea. Después, el acumulador de presión (lleva 2 bar de precarga)." },
  { t: "El baño no funciona o hay olor", d: "El grifo de fondo de salida tiene que estar abierto. Si el olor sigue, el tanque de aguas negras puede estar lleno o el venteo tapado: revisar el filtro de carbón." },
  { t: "El inverter se apaga solo", d: "Las baterías bajaron de 12,0 V y el inverter se protegió. Conectar al muelle o arrancar motores y esperar 30 minutos antes de volver a usarlo." },
  { t: "No hay 220 V en el muelle", d: "Revisar el testigo del tablero. Si está rojo, dar vuelta la ficha. Si está apagado, revisar la térmica del pilar del muelle antes que la del barco." },
];

export const FUSIBLES = [
  { s: "Hélice de proa y malacate", a: "630 A", u: "Sala de máquinas · caja principal" },
  { s: "Malacate (secundario)",     a: "250 A", u: "Sala de máquinas · panel de proa" },
  { s: "Inverter",                  a: "200 A", u: "Sala de máquinas · junto a las baterías de servicio" },
  { s: "Bomba de achique",          a: "40 A",  u: "Panel 12 V · sentinas" },
  { s: "Bomba de agua potable",     a: "20 A",  u: "Panel 12 V · servicios" },
];

/* ── Seguridad ── */
export const TELEFONOS = [
  { t: "Prefectura Naval Argentina", v: "106",            tel: "106" },
  { t: "Guardia costera",            v: "0800-666-3500",  tel: "08006663500" },
  { t: "Radio VHF",                  v: "Canal 16",       tel: null },
];

export const EMERGENCIAS = [
  {
    id: "incendio",
    t: "Incendio a bordo",
    pasos: [
      { t: "Cortar motores", d: "Llaves en OFF en los dos motores y cerrar las válvulas de combustible." },
      { t: "Extintor", d: "Apuntar a la base del fuego, no a las llamas. Barrer de costado, 3 a 5 segundos seguidos." },
      { t: "MAYDAY por canal 16", d: "«MAYDAY MAYDAY MAYDAY, aquí [nombre del barco], posición [GPS], incendio a bordo, [cantidad] personas»." },
      { t: "Si no cede en 60 segundos", d: "Chalecos puestos, balsa lista y radiobaliza EPIRB activada." },
    ],
  },
  {
    id: "mob",
    t: "Hombre al agua",
    pasos: [
      { t: "Aro salvavidas", d: "Tirarlo enseguida y gritar «hombre al agua». Una persona sólo se ocupa de no perderlo de vista." },
      { t: "Marcar MOB en el GPS", d: "Apretar el botón MOB: guarda la posición exacta donde cayó." },
      { t: "Volver despacio", d: "Reducir la velocidad y acercarse con el viento de frente. La persona siempre lejos de las hélices." },
      { t: "Subirla a bordo", d: "Por la escalera de popa, con el bichero o con un arnés. Motores en neutral durante el rescate." },
    ],
  },
  {
    id: "agua",
    t: "Entra agua",
    pasos: [
      { t: "Encontrar y frenar", d: "Buscar por dónde entra. Tapar con tapones de emergencia, ropa o madera. Todas las bombas de achique encendidas." },
      { t: "Evaluar", d: "Si las bombas mantienen el nivel: seguir y navegar al puerto más cercano." },
      { t: "Si no se controla", d: "MAYDAY enseguida. Chalecos, radiobaliza EPIRB, balsa y documentos en una bolsa estanca." },
      { t: "Abandonar sólo si se hunde", d: "Nunca dejar el barco mientras flote: es más fácil encontrar un barco que una persona." },
    ],
  },
];

export const EQUIPO_SEGURIDAD = [
  "Un chaleco salvavidas por persona, de la talla correcta",
  "Aro salvavidas con cabo",
  "Extintores cargados y con fecha vigente",
  "Bengalas y señales pirotécnicas vigentes",
  "Botiquín de primeros auxilios",
  "Radio VHF y teléfono cargado en bolsa estanca",
  "Linterna y bocina",
  "Radiobaliza EPIRB registrada",
];

/* ── Mantenimiento ── */
export const BITACORA_ITEMS = ["Motores", "Generador", "Fondo y pintura", "Hélices", "Ánodos", "Timón y servo"];
export const BITACORA_ESTADOS = ["OK", "Atención", "Service pendiente"];

/* ── Glosario ── */
export const GLOSARIO = [
  { t: "Amarrar",            d: "Sujetar el barco al muelle o a una boya con cabos." },
  { t: "Ánodos",             d: "Piezas de zinc o aluminio que se gastan a propósito para que la corrosión no ataque hélices ni ejes. Se cambian en cada service de casco." },
  { t: "Babor",              d: "Lado izquierdo mirando hacia proa. Luz roja." },
  { t: "Bañera",             d: "El área abierta de popa, donde se está al aire libre." },
  { t: "Barlovento",         d: "El lado desde donde viene el viento." },
  { t: "Bichero",            d: "Vara con gancho para tomar un cabo o una boya desde a bordo." },
  { t: "Bomba de achique",   d: "Bomba que saca el agua acumulada en la sentina. Trabaja sola." },
  { t: "Bow thruster",       d: "Hélice de proa: empuja el barco de costado para maniobrar en espacios chicos." },
  { t: "Cabo",               d: "Cualquier cuerda a bordo. En un barco no se dice «soga»." },
  { t: "Calado",             d: "Lo que el casco se hunde bajo el agua. Hay que conocerlo para no tocar fondo." },
  { t: "Canal 16",           d: "Canal de la radio VHF para emergencias y primeras llamadas. Siempre en escucha." },
  { t: "Casco",              d: "El cuerpo del barco, la parte que flota." },
  { t: "Cubierta",           d: "El «piso» exterior del barco." },
  { t: "Defensas",           d: "Almohadones que se cuelgan del costado para que el casco no roce el muelle ni otros barcos." },
  { t: "EPIRB",              d: "Radiobaliza que manda la posición por satélite en una emergencia grave." },
  { t: "Eslora",             d: "El largo total del barco." },
  { t: "Estribor",           d: "Lado derecho mirando hacia proa. Luz verde." },
  { t: "Fondear",            d: "Detener el barco en un lugar sujetándolo con el ancla." },
  { t: "Grifo de fondo",     d: "Válvula en el casco que deja entrar agua para enfriar motores y otros equipos." },
  { t: "Grupo electrógeno",  d: "Motor diésel chico que genera 220 V a bordo, como en casa." },
  { t: "Hardtop",            d: "Techo rígido sobre el puesto de mando. La «HT» del nombre del modelo." },
  { t: "Inverter",           d: "Convierte la energía de las baterías en 220 V, sin ruido." },
  { t: "Malacate",           d: "Motor que sube y baja el ancla. También se le dice molinete." },
  { t: "Manga",              d: "El ancho máximo del barco." },
  { t: "MAYDAY",             d: "Llamada de socorro por radio cuando hay peligro grave para las personas." },
  { t: "Milla náutica",      d: "1.852 metros. Las distancias en el agua se miden en millas." },
  { t: "MMSI",               d: "Número que identifica a tu radio VHF, como un número de teléfono." },
  { t: "MOB",                d: "Man overboard, hombre al agua. Botón del GPS que guarda el punto donde cayó alguien." },
  { t: "Nudo",               d: "Unidad de velocidad: una milla náutica por hora, unos 1,85 km/h." },
  { t: "Paralelo",           d: "Interruptor que une los bancos de baterías. Sólo para emergencias." },
  { t: "Popa",               d: "La parte de atrás del barco." },
  { t: "Proa",               d: "La parte de adelante del barco." },
  { t: "Sala de máquinas",   d: "El compartimento donde están los motores, el grupo y las baterías." },
  { t: "Sentina",            d: "La parte más baja del interior del casco, donde se junta el agua." },
  { t: "Sotavento",          d: "El lado hacia donde va el viento. El lado protegido." },
  { t: "Trim",               d: "Ajuste de la inclinación del barco al navegar, con flaps en la popa." },
];

/* ── Videos ── */
export const VIDEOS = [
  { id: "GRRk7-_oz98", t: "Chequeo de motores",   d: "Niveles, correas y revisión antes de arrancar.", c: "Mantenimiento" },
  { id: "nAECKiKmdZY", t: "Conexión al muelle",   d: "El cable de 220 V de forma segura.",             c: "Energía" },
  { id: "pEX04f1fR_4", t: "Generador marino",     d: "Conceptos básicos y uso.",                       c: "Energía" },
  { id: "Xc96Kgbv5w0", t: "Fondear",              d: "Técnica correcta para echar el ancla.",          c: "Navegación" },
  { id: "5Ylng2lJ6aQ", t: "Baño eléctrico",       d: "Cómo usarlo sin tapar el sistema.",              c: "A bordo" },
  { id: "rA5oHEjK3tE", t: "Hélice de proa",       d: "Consejos de uso y sus límites.",                 c: "Navegación" },
  { id: "6cPRVzIXDbM", t: "Purgar el motor",      d: "Sacar el aire del circuito de gasoil.",          c: "Mantenimiento" },
  { id: "kxwduznfXnQ", t: "Control de incendios", d: "Equipos y procedimiento.",                       c: "Seguridad" },
  { id: "5WoAT5RopNE", t: "Hombre al agua",       d: "Maniobra de recuperación.",                      c: "Seguridad" },
];

/* ── Postventa ── */
export const AREAS_SOPORTE = [
  "Electricidad y tableros",
  "Motores y propulsión",
  "Agua, baños y sanitarios",
  "Casco, fibra y filtraciones",
  "Malacate y hélice de proa",
  "Climatización",
  "Baterías e inverter",
  "Otros",
];

export const ESTADOS_TICKET = {
  pendiente:   "Recibido",
  en_proceso:  "En proceso",
  solucionado: "Solucionado",
};

/* ── Índice de búsqueda ──
   Capítulos, términos del glosario y procedimientos: todo lo que el
   cliente puede querer encontrar escribiendo dos letras. */
export function indiceBusqueda() {
  const items = [];
  CAPITULOS.forEach(c => items.push({ tipo: "Capítulo", t: c.t, d: c.k, cap: c.id }));
  FUENTES.forEach(f => items.push({ tipo: "Energía", t: f.t, d: f.resumen, cap: "energia", ancla: `fuente-${f.id}` }));
  DIAGNOSTICO.forEach(p => items.push({ tipo: "Si algo falla", t: p.t, d: p.d, cap: "problemas" }));
  EMERGENCIAS.forEach(e => items.push({ tipo: "Emergencia", t: e.t, d: e.pasos.map(p => p.t).join(" · "), emergencia: e.id }));
  GLOSARIO.forEach(g => items.push({ tipo: "Glosario", t: g.t, d: g.d, cap: "glosario", ancla: `g-${slug(g.t)}` }));
  VIDEOS.forEach(v => items.push({ tipo: "Video", t: v.t, d: v.d, cap: "videos" }));
  items.push({ tipo: "Motores", t: "Arrancar los motores", d: ARRANQUE.map(p => p.t).join(" · "), cap: "motores", ancla: "arranque" });
  items.push({ tipo: "A bordo", t: "Malacate y ancla", d: "Antes de usar y errores frecuentes.", cap: "a-bordo", ancla: "malacate" });
  items.push({ tipo: "Si algo falla", t: "Fusibles de alta potencia", d: FUSIBLES.map(f => f.s).join(" · "), cap: "problemas", ancla: "fusibles" });
  return items;
}

export function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
