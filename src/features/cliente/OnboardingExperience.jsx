import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  AlertTriangle,
  Anchor,
  Battery,
  Check,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Gauge,
  Play,
  Power,
  Radio,
  Shield,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import logoK from "@/assets/logos/logo-k.png";
import {
  getOnboardingStorageKeys,
  readOnboardingStorage,
  writeOnboardingStorage,
} from "@/features/cliente/onboardingStorage";
import * as THREE from "three"; // npm install three  (si no esta instalado)

// NOTA FUTURO: cada modulo tiene un campo `visual3D` reservado para renders interactivos.
// Cuando esten listos, reemplazar VisualSystem con un componente <Model3D src={current.visual3D} />.
const modules = [
  {
    id: "welcome",
    nav: "Inicio",
    eyebrow: "Klase A OS",
    title: "Bienvenido a bordo del K52 HT",
    subtitle: "Una introduccion guiada por los sistemas esenciales de la embarcacion. Cada modulo corresponde a un paso de la puesta en marcha. Se recomienda completar la secuencia antes del primer zarpe.",
    icon: Anchor,
    color: "#D8C3A5",
    signal: "Engineering the Future of Navigation",
    caption: "K52 HT · 14,62 m · Navegacion costera restringida C1 · Hasta 8 personas.",
    visual3D: null, // futuro: "/models/k52-exterior.glb"
    steps: [
      "Antes de subir: verifique que tiene los elementos de seguridad obligatorios — chaleco salvavidas por persona, extintor y bengalas. Sin esto, no zarpa.",
      "Suba por la banda de ESTRIBOR — es el lado DERECHO del barco mirando hacia adelante. En cubierta va a encontrar una puertita pequeña de acrilico negro: ahi estan los cortes de baterias.",
      "Sin activar los cortes de baterias, absolutamente NADA funciona en el barco: ni luces, ni tableros, ni motores. Es siempre el primer paso de cualquier salida, sin excepcion.",
      "Este manual interactivo lo guia por los 10 sistemas del K52 HT en el orden correcto de encendido. Completar esta secuencia una vez es suficiente para operar el barco de forma segura.",
    ],
    hotspots: [
      { x: 30, y: 38, label: "K52 HT · Klase A", text: "Eslora 14,62 m · Manga 4,30 m · 8 personas · Navegacion costera restringida C1. Fabricado en PRFV (fibra de vidrio)." },
      { x: 68, y: 52, label: "Capacidades del barco", text: "Combustible: 1910 L · Agua potable: 480 L · Aguas negras: 150 L · Carga maxima: 2814 kg." },
    ],
    stats: [
      ["Combustible", "1910 L"],
      ["Agua potable", "480 L"],
      ["Personas max", "8"],
    ],
  },
  {
    id: "batteries",
    nav: "Baterias",
    eyebrow: "Primer paso · obligatorio",
    title: "Activacion de baterias",
    subtitle: "El gabinete de cortes es el punto de partida de cualquier operacion a bordo. Sin los bancos habilitados, ningun tablero, bomba ni sistema electrico puede funcionar.",
    icon: Battery,
    color: "#34d399",
    signal: "Motor · Servicio · Grupo · Bow",
    caption: "Al retirarse de la embarcacion, todos los cortes deben quedar en posicion OFF sin excepcion.",
    visual3D: null, // futuro: "/models/gabinete-baterias.glb"
    steps: [
      "Ubique la puertita de acrilico negro en la banda de ESTRIBOR (lado derecho mirando hacia la proa). Abra la puerta — adentro va a ver una fila de interruptores con etiquetas: MOTOR, SERVICIO, GRUPO, BOW.",
      "Para ENCENDER un banco: presione el boton rojo que dice 'ON' con firmeza. Un solo accionamiento es suficiente. Empiece siempre por el corte 'MOTOR'.",
      "Active tambien el corte 'SERVICIO' — este es el que alimenta todos los tableros del salon: luces, bombas, el tablero de 12V y el de 220V. Sin el, no funciona nada en el interior del barco.",
      "Active el corte 'GRUPO' solo si va a usar el generador electrogeno. Active 'BOW' solo si va a usar el ancla. Los demas dejelos apagados si no los necesita — las baterias se agotan.",
      "Para APAGAR un corte: primero deslice hacia abajo la barra negra de seguridad (esa barrita que bloquea el boton rojo), y LUEGO presione el boton rojo 'OFF'. Si no desliza la barra primero, el boton no se mueve.",
      "MUY IMPORTANTE: cuando se retire del barco — aunque sea por 10 minutos — apague TODOS los cortes sin excepcion. Las baterias se descargan rapidamente si quedan activas sin uso.",
    ],
    hotspots: [
      { x: 36, y: 35, label: "Boton ON", text: "Activa el banco seleccionado. La barra de bloqueo debe estar en posicion superior para permitir el accionamiento." },
      { x: 60, y: 62, label: "Barra de seguridad", text: "Deslizar hacia abajo antes de presionar OFF. Previene apagados involuntarios durante la navegacion." },
    ],
    stats: [
      ["Motor", "activar primero"],
      ["Servicio", "12V y 220V"],
      ["Grupo", "segun necesidad"],
    ],
  },
  {
    id: "twelve",
    nav: "12V",
    eyebrow: "Segundo paso · tablero DC",
    title: "Tablero de 12 voltios",
    subtitle: "El tablero de 12V distribuye la corriente continua hacia luces, bombas, ventiladores y consumos de baja tension. Su operacion es por circuito individual, no como un encendido general.",
    icon: Zap,
    color: "#D8C3A5",
    signal: "DC distribution · Amperimetro · Voltimetro",
    caption: "Activar unicamente las termicas correspondientes a los circuitos en uso. El resto permanece en OFF.",
    visual3D: null, // futuro: "/models/tablero-12v.glb"
    steps: [
      "Entre al salon. Va a ver DOS puertas de acrilico negro en la pared. La del LADO IZQUIERDO es el tablero de 12V — el que controla luces, bombas, malacate y la mayoria de los sistemas del barco.",
      "Abra la puerta. Vera una serie de interruptores llamados 'termicas', cada uno con una etiqueta indicando a que circuito corresponde. Para activar un circuito: deslice la termica hacia ARRIBA (posicion ON).",
      "Active SOLO las termicas que va a usar en ese momento. Por ejemplo: si va a usar agua, suba 'BOMBA POTABLE'. Si va a fondear, suba 'MALACATE'. El resto dejelas abajo para no consumir bateria innecesariamente.",
      "El VOLTIMETRO (el instrumento redondo) muestra el estado de las baterias de servicio. Mas de 12.6V = cargadas bien. Entre 12 y 12.6V = uso normal. Menos de 12V = RECARGAR URGENTE antes de pedir mas consumo.",
      "El AMPERIMETRO muestra cuanta energia estan consumiendo los circuitos en este momento. Si el numero es muy alto, apague algunas termicas para no agotar la bateria antes de llegar a puerto.",
    ],
    hotspots: [
      { x: 42, y: 28, label: "Voltimetro", text: "Lectura por debajo de 12V indica baterias de servicio bajas. No solicitar consumos adicionales hasta completar la carga." },
      { x: 63, y: 58, label: "Termicas 12V", text: "Cada termica protege un circuito independiente. Activar solo las necesarias y mantener el resto en OFF." },
    ],
    stats: [
      ["Tension", "12 V DC"],
      ["Indicador", "Voltimetro"],
      ["Consumo", "Amperimetro"],
    ],
  },
  {
    id: "twenty",
    nav: "220V",
    eyebrow: "Tercer paso · tablero AC",
    title: "Tablero de 220 voltios",
    subtitle: "El tablero de 220V gestiona los artefactos de corriente alterna: climatizacion, cocina, cargador de baterias y tomas de uso general. La fuente de alimentacion debe seleccionarse antes de habilitar cualquier carga.",
    icon: Power,
    color: "#a78bfa",
    signal: "AC bus · Selector de fuente · Cargas",
    caption: "La seleccion de fuente es previa a la habilitacion de termicas. El orden no es opcional.",
    visual3D: null, // futuro: "/models/tablero-220v.glb"
    steps: [
      "La puerta de acrilico negro del LADO DERECHO del salon es el tablero de 220V. Antes de tocar cualquier termica de este tablero, primero tiene que decidir DE DONDE va a obtener la corriente.",
      "Las dos 'selectoras' (botones rotatorios grandes en la parte superior del tablero) deben estar SIEMPRE en la misma posicion entre si. Tienen tres opciones: C.A.TIERRA (enchufado al muelle), C.A.GRUPO (con el generador) o C.A.CONVERTIDOR (con el inverter).",
      "El orden es OBLIGATORIO: PRIMERO posicione las dos selectoras en la fuente que va a usar, y DESPUES levante las termicas de los artefactos. Si hace esto al reves, los artefactos no van a funcionar.",
      "Las termicas de 220V controlan: aire acondicionado, cocina, heladera, tomas de corriente y fabricadora de hielo. Active solo lo que vaya a usar realmente.",
      "Si algo no enciende: verifique que las DOS selectoras esten en la misma posicion, que la termica correspondiente este en ON, y que tenga la fuente de 220V activa. El 90% de los problemas son por una selectora mal puesta.",
    ],
    hotspots: [
      { x: 30, y: 48, label: "Selectoras de fuente", text: "Ambas selectoras deben estar en la misma posicion: C.A.TIERRA, C.A.GRUPO o C.A.CONVERTIDOR segun el modo activo." },
      { x: 68, y: 48, label: "Termicas de artefactos", text: "Climatizacion, cocina, heladera, tomas y fabricadora de hielo. Activar unicamente los circuitos en uso." },
    ],
    stats: [
      ["C.A. Tierra", "desde puerto"],
      ["C.A. Grupo", "desde generador"],
      ["C.A. Convertidor", "desde inverter"],
    ],
  },
  {
    id: "energy",
    nav: "Modos",
    eyebrow: "Secuencia 04 · fuentes de 220V",
    title: "Modos de energia",
    subtitle: "El K52 dispone de tres fuentes de corriente alterna. Cada modo responde a un escenario distinto de operacion y requiere una secuencia de activacion especifica.",
    icon: Zap,
    color: "#fbbf24",
    signal: "Puerto · Grupo Electrogeno · Inverter",
    caption: "El cargador de baterias puede operar en modo Puerto o Grupo. Se recomienda activarlo siempre que haya 220V disponible a bordo.",
    visual3D: null, // futuro: "/models/fuentes-energia.glb"
    steps: [
      "MODO PUERTO (la opcion mas comoda en amarre): enchufe el cable amarillo que dio el astillero entre el tomacorriente del muelle y la toma del barco en cubierta. En el tablero de 220V ponga las DOS selectoras en 'C.A.TIERRA' y levante las termicas que necesite.",
      "MODO GRUPO ELECTROGENO (para cuando esta anclado o navegando sin enchufarse): active el corte 'GRUPO' en el gabinete de baterias. Vaya al salon, localice el tablero pequeno del grupo y presione su tecla UNA SOLA VEZ. Espere que arranque, luego ponga las selectoras en 'C.A.GRUPO'.",
      "MODO INVERTER (para usar 220V sin enchufarse a nada, consumiendo baterias): ponga el tablero del Cargador/Inversor en posicion 'ON' y coloque la selectora PEQUENA en 'C.A.CONVERTIDOR'. Maximo 2000W — solo heladera, microondas, TV, tomas y fabricadora. Monitoree el voltimetro constantemente.",
      "CARGADOR DE BATERIAS (aproveche siempre que tenga 220V disponible): cuando este en Modo Puerto o Modo Grupo, suba la termica que dice 'CARGADOR DE BAT' y verifique que el tablero del cargador/inversor este en ON o ChargerOnly. El proceso es automatico en tres etapas: BULK, ABSORCION y FLOAT.",
    ],
    hotspots: [
      { x: 22, y: 34, label: "Modo Puerto", text: "Confort completo en amarre. Permite climatizacion, cocina y carga de baterias de forma simultanea." },
      { x: 50, y: 56, label: "Modo Grupo", text: "Autonomia energetica total. Recomendado para fondeo prolongado o navegacion sin acceso a puerto." },
      { x: 78, y: 34, label: "Modo Inverter", text: "Operacion sin fuente externa. Consume baterias de servicio — monitorear el voltimetro de forma continua." },
    ],
    stats: [
      ["Inverter max", "2000 W"],
      ["Cargador", "3 etapas"],
      ["Grupo", "220V autonomo"],
    ],
  },
  {
    id: "engines",
    nav: "Motores",
    eyebrow: "Secuencia 05 · propulsion",
    title: "Encendido de motores",
    subtitle: "El arranque de los motores sigue una secuencia fija. Cada paso es condicion del siguiente. Omitir alguno puede impedir el arranque o generar un accionamiento no controlado.",
    icon: Gauge,
    color: "#fb7185",
    signal: "Twin engine · Linea de eje · MORSE control",
    caption: "Para el apagado: palanca en NEUTRAL, llave girada en sentido contrario al arranque. El orden es indispensable.",
    visual3D: null, // futuro: "/models/llave-arranque.glb"
    steps: [
      "Primero vuelva al gabinete de baterias en estribor y active el corte que dice 'MOTOR'. Si el barco tiene dos motores, hay un corte por motor — activelos todos.",
      "Vaya al puente de mando. Verifique que la PALANCA de acelerador/cambio este en posicion NEUTRAL — debe estar centrada, sin inclinarse hacia ningun lado. Si no esta en neutral, el motor NO va a arrancar: es un sistema de seguridad incorporado.",
      "Gire la llave a la posicion UNO (primer clic). NO la gire mas todavia. Espere a que la pantalla del motor se encienda completamente — tarda unos segundos. Es importante dejarla inicializar.",
      "Una vez que la pantalla este encendida y lista, gire la llave hasta el TOPE para arrancar el motor. Suelte la llave cuando escuche que el motor prendio. Repita el mismo procedimiento para el segundo motor.",
      "Con los motores andando, presione el boton MORSE (ubicado en la palanca de acelerador/cambio) para transferir el control al puente de mando. Recien despues de esto tiene control del acelerador y el cambio.",
      "Para APAGAR los motores: ponga la palanca en NEUTRAL primero, y luego gire la llave en sentido contrario al arranque. El orden importa — siempre neutral antes de girar la llave.",
    ],
    hotspots: [
      { x: 36, y: 52, label: "Palanca NEUTRAL", text: "La posicion NEUTRAL es condicion de arranque. El sistema cuenta con proteccion que impide el encendido fuera de esta posicion." },
      { x: 67, y: 35, label: "Llave de arranque", text: "Posicion 1: inicializa la pantalla del motor. Posicion 2 (tope): ejecuta el arranque. No omitir la posicion 1." },
    ],
    stats: [
      ["Potencia max", "838 kW"],
      ["Propulsion", "Linea de eje"],
      ["Control", "MORSE"],
    ],
  },
  {
    id: "generator",
    nav: "Grupo",
    eyebrow: "Secuencia 06 · generador",
    title: "Grupo electrogeno",
    subtitle: "El grupo electrogeno es un generador diesel que produce 220V de forma independiente. Se utiliza cuando la embarcacion no esta conectada a puerto y se requiere mayor potencia que la disponible por inverter.",
    icon: Radio,
    color: "#f59e0b",
    signal: "Generador autonomo · 220V independiente",
    caption: "Si el grupo se detiene al poco tiempo de arrancar, es posible leer el codigo de falla contando los destellos de la luz en la tecla de encendido.",
    visual3D: null, // futuro: "/models/grupo-electrogeno.glb"
    steps: [
      "El grupo electrogeno esta en la sala de maquinas pero se controla desde el salon. Primer paso: abra el gabinete de baterias y active el corte que dice 'GRUPO'. Sin esto el grupo no tiene bateria para arrancar.",
      "En el salon, localice el tablero pequeno del grupo electrogeno (es diferente al tablero de 220V). Presione su tecla de encendido UNA SOLA VEZ. Si la presiona dos veces puede apagarla — un solo toque y espere.",
      "Espere tranquilo a que el grupo arranque y se estabilice. No haga nada mas durante este tiempo. El equipo necesita entre 30 segundos y 1 minuto para estabilizarse antes de poder usarlo.",
      "Una vez que el grupo este funcionando establemente, vaya al tablero de 220V y ponga las DOS selectoras en la posicion 'C.A.GRUPO'. Luego levante las termicas de los artefactos que quiera usar.",
      "Si el grupo arranca pero se apaga solo a los pocos segundos: hay una falla. Cuente los destellos de la luz en el boton de encendido — cada patron de destellos corresponde a un codigo de falla del manual del grupo.",
    ],
    hotspots: [
      { x: 42, y: 42, label: "Tecla de encendido", text: "Un unico accionamiento. Presionar dos veces puede provocar un apagado o reinicio del sistema." },
      { x: 66, y: 66, label: "Termica interna", text: "Si el grupo esta en funcionamiento pero no hay 220V en el tablero, verificar la termica dentro del gabinete del grupo en sala de maquinas." },
    ],
    stats: [
      ["Salida", "220V AC"],
      ["Encendido", "1 accionamiento"],
      ["Diagnostico", "destellos / display"],
    ],
  },
  {
    id: "water",
    nav: "Agua",
    eyebrow: "Secuencia 07 · sistema sanitario",
    title: "Agua potable y sistema sanitario",
    subtitle: "El K52 cuenta con un sistema de agua potable presurizado automatico. Los tanques estan interconectados y mantienen el mismo nivel independientemente del punto de carga utilizado.",
    icon: Droplets,
    color: "#B7C8A4",
    signal: "Potable 480L · Grises · Negras · Pump",
    caption: "Los tanques de aguas negras y grises cuentan con indicadores de nivel. Se recomienda no operar cerca del limite de capacidad.",
    visual3D: null, // futuro: "/models/sistema-agua.glb"
    steps: [
      "Para CARGAR agua potable: busque en los pasillos laterales de cubierta las tapas que dicen 'AGUA'. Conecte la manguera ahi. Los dos tanques estan comunicados entre si, asi que puede cargar por cualquiera de los dos — el nivel sube igual en ambos. Capacidad total: 480 litros.",
      "Para que salga agua de las canillas y la ducha: entre al salon, abra el tablero de 12V y suba la termica que dice 'BOMBA POTABLE'. La bomba es automatica — se activa sola cuando abre una canilla y se apaga sola cuando la cierra.",
      "Para usar los inodoros y las duchas: ademas de la bomba potable, asegurese de que las termicas de esos sistemas esten activas en el tablero de 12V. Los inodoros tienen su propio circuito.",
      "Para VACIAR los tanques en puerto: busque en cubierta las tapas que dicen 'WASTE'. El personal del puerto conecta ahi una manguera de aspiracion especial. Siga las indicaciones de cada marina — cada una tiene su procedimiento.",
      "Para vaciar en navegacion (en aguas abiertas, lejos de la costa): habilite la bomba de descarga en el tablero de 12V y gire la llave correspondiente a la posicion 'I'. Aplica igual para los tanques de aguas grises.",
    ],
    hotspots: [
      { x: 35, y: 33, label: "Tomas de agua", text: "Dos puntos de carga en cubierta, pasillos laterales. Al estar interconectados, el llenado es equivalente desde cualquiera de los dos." },
      { x: 68, y: 62, label: "Tomas WASTE", text: "Ubicadas sobre cubierta. La manguera de aspiracion es provista por el puerto. Seguir el procedimiento indicado en cada instalacion." },
    ],
    stats: [
      ["Potable", "480 L"],
      ["Aguas negras", "2 tanques"],
      ["Aguas grises", "2 tanques"],
    ],
  },
  {
    id: "safety",
    nav: "Seguridad",
    eyebrow: "Secuencia 08 · sistemas criticos",
    title: "Seguridad a bordo",
    subtitle: "Los sistemas de contra incendios, achique y calefaccion son criticos para la seguridad de la embarcacion. Su comprension y correcta operacion son parte obligatoria del protocolo de a bordo.",
    icon: Shield,
    color: "#ef4444",
    signal: "Contra incendios · Achique automatico · Calefactor supervisado",
    caption: "El VHF debe permanecer en Canal 16 durante toda la navegacion. Es el canal internacional de escucha y socorro.",
    visual3D: null, // futuro: "/models/panel-seguridad.glb"
    steps: [
      "INCENDIO EN SALA DE MAQUINAS — el barco tiene un sistema automatico: cuando la temperatura llega a 70°C, el matafuego se dispara solo y corta el suministro de combustible. No tiene que hacer nada para que funcione.",
      "ATENCION CRITICA: si hay fuego en sala de maquinas, NUNCA abra la tapa. Abrir la tapa introduce oxigeno y aviva las llamas. Los disparadores manuales estan EN EL EXTERIOR de la sala para usarlos sin abrir.",
      "INCENDIO EN OTRO LUGAR: hay extintores portatiles en cada ambiente del barco. Identificar donde estan ANTES de zarpar — cuando hay humo y panico no hay tiempo para buscarlos.",
      "ACHIQUE (entrada de agua al barco): las bombas funcionan automaticamente. Si se activan, vera una LUZ AZUL y escuchara una alarma sonora en la consola de mando. Verifique siempre que cada bomba este en posicion automatica antes de salir.",
      "CALEFACTOR DIESEL: presione el boton 'O' UNA VEZ para encender el display, y rapidamente UNA SEGUNDA VEZ para arrancar el equipo. Tarda 4-5 minutos en calentar. Para apagarlo: mismo procedimiento. NUNCA abandone el barco con el calefactor encendido.",
    ],
    hotspots: [
      { x: 44, y: 30, label: "70°C · activacion automatica", text: "El sistema de sala de maquinas actua de forma autonoma. Ante presencia de humo, utilizar los disparadores manuales exteriores sin abrir la tapa." },
      { x: 66, y: 64, label: "Indicador de achique", text: "Luz azul y alarma activa indican que una bomba de achique se ha accionado. Verificar nivel en sentinas y evaluar la situacion." },
    ],
    stats: [
      ["Incendio", "70°C auto"],
      ["Achique", "auto + manual"],
      ["Calefactor", "supervisado"],
    ],
  },
  {
    id: "emergency",
    nav: "Emergencia",
    eyebrow: "Secuencia 09 · protocolo SOS",
    title: "Protocolo de emergencia",
    subtitle: "Ante una situacion de emergencia, la actuacion ordenada y el conocimiento previo de los procedimientos son determinantes. Esta informacion debe estar memorizada antes de zarpar.",
    icon: AlertTriangle,
    color: "#f43f5e",
    signal: "VHF Canal 16 · Prefectura 106 · SOS",
    caption: "El acceso directo a la pantalla SOS esta disponible desde cualquier modulo del panel.",
    visual3D: null, // futuro: "/models/panel-emergencia.glb"
    steps: [
      "HOMBRE AL AGUA: marque la posicion en el GPS INMEDIATAMENTE (boton MOB si lo tiene), reduzca la velocidad ya, lance el aro salvavidas, y NUNCA pierda contacto visual con la persona. Asigne a alguien solo para ese rol.",
      "ENTRADA DE AGUA AL BARCO: active las bombas de achique en modo MANUAL desde el tablero, intente identificar de donde viene el agua e intente taponarlo. Si no puede controlarlo en minutos, llame a Prefectura.",
      "INCENDIO A BORDO: apague los motores, use el extintor adecuado (CO2 para fuego electrico, polvo para combustible). Si no puede controlarlo en 30 segundos: llame por VHF Canal 16 e inicie el protocolo de abandono.",
      "LLAMADA DE SOCORRO POR VHF CANAL 16: diga 'MAYDAY MAYDAY MAYDAY' — nombre del barco — posicion GPS exacta (latitud y longitud) — tipo de emergencia — cantidad de personas a bordo. Hable lento y claro.",
      "NUMEROS DE EMERGENCIA: Prefectura Naval Argentina 106 — Guardia Costera 0800-999-0106. Tenga siempre visible la posicion GPS en el plotter y el nombre del barco escrito donde todos puedan verlo.",
    ],
    hotspots: [
      { x: 29, y: 52, label: "Acceso SOS", text: "Despliega los protocolos de incendio, hombre al agua e ingreso de agua con instrucciones paso a paso." },
      { x: 72, y: 42, label: "VHF Canal 16", text: "Canal internacional de emergencia y escucha. Debe permanecer encendido durante toda la navegacion." },
    ],
    stats: [
      ["Prefectura", "106"],
      ["Guardia", "0800-999-0106"],
      ["Radio", "Canal 16"],
    ],
  },
  {
    id: "troubleshoot",
    nav: "Fallas",
    eyebrow: "Secuencia 10 · resolucion de problemas",
    title: "Resolucion de problemas frecuentes",
    subtitle: "Las fallas mas comunes cuentan con procedimientos de recuperacion a bordo. Se recomienda seguir los pasos en el orden indicado antes de solicitar asistencia tecnica.",
    icon: Wrench,
    color: "#c084fc",
    signal: "Baja de bateria · Sin 220V · Falla de grupo",
    caption: "Los cortes de PARALELO son recursos de recuperacion temporales. Deben desconectarse una vez resuelto el problema.",
    visual3D: null, // futuro: "/models/panel-paralelos.glb"
    steps: [
      "UN MOTOR NO ARRANCA (bateria baja): active los cortes de AMBOS motores + el que dice 'PARALELO DE MOTOR'. Esto une las baterias de ambos motores para que se ayuden entre si. Arranque los dos, espere unos minutos funcionando, y recien ahi APAGUE el corte de paralelo.",
      "LOS DOS MOTORES NO ARRANCAN (baterias muy bajas): active MOTOR + PARALELO MOTOR + SERVICIO + PARALELO SERVICIO e intente arrancar. Si tampoco responde, conecte el barco a puerto o grupo, active el cargador de baterias y espere — puede llevar varias horas recargar.",
      "EL GRUPO NO ARRANCA (bateria baja): active los cortes SERVICIO + GRUPO + PARALELO GRUPO e intente arrancar. Una vez que arranque, espere 5 minutos y recien entonces apague el corte PARALELO GRUPO. SIEMPRE apague los paralelos cuando resuelva el problema.",
      "ENCHUFADO A PUERTO PERO SIN 220V: repita los pasos del modo puerto. Si sigue sin funcionar, vaya a la sala de maquinas (en popa). Encontrara un disyuntor que es para el cable de puerto. ANTES de accionarlo, apague TODOS los consumos de 220V. Si salta de nuevo, llame a un tecnico.",
      "GRUPO PRENDIDO PERO SIN 220V EN EL TABLERO: coloque todas las termicas de 220V en OFF y vaya a la sala de maquinas. Dentro del gabinete del grupo hay una termica — pongala en ON y revise si volvio el 220V en el tablero. Si no volvio: llame a un tecnico especializado.",
    ],
    hotspots: [
      { x: 38, y: 43, label: "Cortes de Paralelo", text: "Puentean bancos de baterias entre si para permitir arranque o carga. Uso exclusivo para recuperacion — no deben permanecer activos de forma permanente." },
      { x: 70, y: 62, label: "Disyuntor de sala", text: "Ubicado en popa, dentro de sala de maquinas. Llevar todos los consumos de 220V a OFF antes de manipularlo." },
    ],
    stats: [
      ["Motor bajo", "paralelo motor"],
      ["Grupo bajo", "paralelo grupo"],
      ["Sin 220V", "ver disyuntor"],
    ],
  },
];

const slideVariants = {
  enter: { opacity: 0, scale: 0.985, y: 18, filter: "blur(10px)" },
  center: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 1.012, y: -16, filter: "blur(10px)" },
};

function clampStep(value) {
  return Math.max(0, Math.min(modules.length - 1, value));
}

function useTone(enabled) {
  const ctxRef = useRef(null);
  return useCallback(
    (freq = 520, duration = 0.08) => {
      if (!enabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = ctxRef.current || new AudioContext();
        ctxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.015);
      } catch {
        /* Audio is optional and can be blocked by the browser. */
      }
    },
    [enabled]
  );
}

export default function OnboardingExperience({
  open,
  userId = "anon",
  vesselName,
  onClose,
  onGoTo,
  onEmergency,
}) {
  const keys = useMemo(() => getOnboardingStorageKeys(userId), [userId]);
  const savedStep = Number(readOnboardingStorage(keys.step, "0"));
  const [step, setStep] = useState(clampStep(Number.isFinite(savedStep) ? savedStep : 0));
  const completedFromStorage = useMemo(() => {
    const raw = readOnboardingStorage(keys.completed, "[]");
    try {
      return new Set(JSON.parse(raw));
    } catch {
      return new Set();
    }
  }, [keys.completed]);
  const [activeHotspot, setActiveHotspot] = useState(0);
  const [openStep, setOpenStep] = useState(0);
  const [sound, setSound] = useState(false);
  const tone = useTone(sound);

  const current = modules[step];
  const progress = Math.round(((step + 1) / modules.length) * 100);

  const close = useCallback((done = false) => {
    if (done) writeOnboardingStorage(keys.done, "1");
    onClose?.(done);
  }, [keys.done, onClose]);

    const go = useCallback((delta) => {
    if (delta > 0) {
      if (openStep < current.steps.length - 1) {
        setOpenStep(prev => prev + 1);
        tone(620);
      } else if (step < modules.length - 1) {
        setStep(prev => prev + 1);
        setOpenStep(0);
        tone(620);
      }
    } else {
      if (openStep > 0) {
        setOpenStep(prev => prev - 1);
        tone(390);
      } else if (step > 0) {
        const prevModule = modules[step - 1];
        setStep(prev => prev - 1);
        setOpenStep(prevModule.steps.length - 1);
        tone(390);
      }
    }
    setActiveHotspot(0);
  }, [step, openStep, tone, current]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    writeOnboardingStorage(keys.step, String(step));
    const next = new Set(completedFromStorage);
    next.add(step);
    writeOnboardingStorage(keys.completed, JSON.stringify([...next]));
  }, [completedFromStorage, keys.completed, keys.step, open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close(false);
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, open]);

  const jumpTo = (index) => {
    tone(520 + index * 18, 0.06);
    setStep(clampStep(index));
    setActiveHotspot(0);
    setOpenStep(0);
  };

  const finish = () => {
    tone(760, 0.14);
    writeOnboardingStorage(keys.step, String(modules.length - 1));
    writeOnboardingStorage(keys.done, "1");
    onClose?.(true);
  };

  const skip = () => {
    writeOnboardingStorage(keys.done, "1");
    onClose?.(true);
  };

  if (!open) return null;

  const Icon = current.icon;

  return (
    <AnimatePresence>
      <Motion.div
        className="ka-onboarding"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 1, 0.35, 1] }}
      >
        <style>{ONBOARDING_CSS}</style>

        <div className="ka-orb ka-orb-a" />
        <div className="ka-orb ka-orb-b" />
        <div className="ka-grid" />
        <ParticleField />

        <header className="ka-on-topbar">
          <div className="ka-brand-mark">
            <img src={logoK} alt="Klase A" />
            <div>
              <span>Klase A</span>
              <small>Marcando tendencia</small>
            </div>
          </div>
          <div className="ka-top-status">
            <span>{vesselName || "K52 HT"}</span>
            <span>{String(step + 1).padStart(2, "0")} / {String(modules.length).padStart(2, "0")}</span>
            <button type="button" onClick={() => { setSound((v) => !v); tone(500); }} aria-label="Alternar sonido">
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" onClick={() => close(false)} aria-label="Cerrar introduccion">
              <X size={18} />
            </button>
          </div>
        </header>

        <main className="ka-on-main">
          <aside className="ka-module-rail" aria-label="Modulos de introduccion">
            {modules.map((item, index) => {
              const DoneIcon = index <= step || completedFromStorage.has(index) ? Check : item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={index === step ? "is-active" : ""}
                  onClick={() => jumpTo(index)}
                  style={{ "--module-color": item.color }}
                >
                  <span className="ka-rail-index">{String(index + 1).padStart(2, "0")}</span>
                  <DoneIcon size={15} />
                  <span>{item.nav}</span>
                </button>
              );
            })}
          </aside>

          <section className="ka-stage" style={{ "--accent": current.color }}>
            <AnimatePresence mode="wait">
              <Motion.article
                key={current.id}
                className="ka-slide"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.62, ease: [0.25, 1, 0.35, 1] }}
              >
                <div className="ka-slide-visual">
                  <div className="ka-hero-image">
                    <div className="ka-holo-ring" />
                    <div className="ka-scanline" />
                    <Model3D moduleId={current.id} color={current.color} />
                    {current.hotspots.map((spot, index) => (
                      <button
                        key={spot.label}
                        type="button"
                        className={`ka-hotspot ${activeHotspot === index ? "is-hot" : ""}`}
                        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                        onClick={() => { setActiveHotspot(index); tone(560 + index * 70, 0.06); }}
                      >
                        <span />
                      </button>
                    ))}
                  </div>

                  <div className="ka-hotspot-panel">
                    <span>{current.hotspots[activeHotspot]?.label}</span>
                    <p>{current.hotspots[activeHotspot]?.text}</p>
                  </div>
                </div>

                <div className="ka-slide-copy">
                  <div className="ka-kicker">
                    <span><Icon size={16} /></span>
                    {current.eyebrow}
                  </div>
                  <h1>{current.title}</h1>
                  <p className="ka-lead">{current.subtitle}</p>

                  <div className="ka-signal">
                    <span />
                    <p>{current.signal}</p>
                  </div>

                  <div className="ka-step-list">
                    {current.steps.map((item, index) => {
                      const isOpen = openStep === index;
                      const preview = item.length > 62 ? item.slice(0, 60) + "…" : item;
                      return (
                        <Motion.div
                          key={`${current.id}-${index}`}
                          className={`ka-step-item${isOpen ? " is-open" : ""}`}
                          initial={{ opacity: 0, x: 18 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.08 + index * 0.045 }}
                          onClick={() => {
                            tone(560 + index * 30, 0.05);
                            setOpenStep(index);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === "Enter" && setOpenStep(index)}
                        >
                          <div className="ka-step-header">
                            <span className="ka-step-num">{String(index + 1).padStart(2, "0")}</span>
                            <p className="ka-step-preview">{isOpen ? item : preview}</p>
                          </div>
                        </Motion.div>
                      );
                    })}
                  </div>

                  <div className="ka-stats-row">
                    {current.stats.map(([label, value]) => (
                      <div key={label}>
                        <strong>{value}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>

                  <p className="ka-caption">{current.caption}</p>
                </div>
              </Motion.article>
            </AnimatePresence>
          </section>
        </main>

        <footer className="ka-on-footer">
          <div className="ka-progress-wrap">
            <span>{progress}% completado</span>
            <div className="ka-progress"><div style={{ width: `${progress}%`, background: current.color }} /></div>
          </div>
          <div className="ka-actions">
            <button type="button" className="ka-ghost" onClick={skip}>Saltar introduccion</button>
            {current.id === "emergency" && (
              <button type="button" className="ka-danger" onClick={onEmergency}>
                <AlertTriangle size={15} /> Abrir SOS
              </button>
            )}
            {current.id === "troubleshoot" && (
              <button type="button" className="ka-ghost" onClick={() => onGoTo?.("soporte")}>
                Soporte tecnico
              </button>
            )}
            <button type="button" className="ka-icon-btn" onClick={() => go(-1)} disabled={step === 0} aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
                        {!(step === modules.length - 1 && openStep === current.steps.length - 1) ? (
              <button type="button" className="ka-primary" onClick={() => go(1)}>
                Continuar <ChevronRight size={17} />
              </button>
            ) : (
              <button type="button" className="ka-primary" onClick={finish}>
                Entrar al panel <Play size={16} />
              </button>
            )}
          </div>
        </footer>
      </Motion.div>
    </AnimatePresence>
  );
}

function ParticleField() {
  return (
    <div className="ka-particles" aria-hidden="true">
      {Array.from({ length: 34 }).map((_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 29) % 100}%`,
            top: `${(index * 47) % 100}%`,
            animationDelay: `${(index % 9) * 0.35}s`,
            animationDuration: `${5 + (index % 7)}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function mk(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}
// Etiqueta un mesh como interactivo
function tag(mesh, label, info) {
  mesh.userData = { label, info };
  return mesh;
}

// ─── per-module 3D scenes ────────────────────────────────────────────────────
function buildModuleScene(moduleId, color, scene) {
  const C = new THREE.Color(color);
  const mPanel  = () => new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.4 });
  const mAccent = () => new THREE.MeshStandardMaterial({ color: C, roughness: 0.3, metalness: 0.6, emissive: C, emissiveIntensity: 0.35 });
  const mGrey   = () => new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, metalness: 0.3 });
  const mOn     = () => new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.3, metalness: 0.5, emissive: 0x22c55e, emissiveIntensity: 0.7 });
  const mOff    = () => new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.1 });
  const mRed    = () => new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, metalness: 0.4, emissive: 0xef4444, emissiveIntensity: 0.5 });
  const add     = (...meshes) => meshes.forEach(m => scene.add(m));
  const PI2     = Math.PI / 2;

  if (moduleId === "welcome") {
    // ── Canvas texture con el texto "KLASE A" ────────────────────────────────
    const cvs = document.createElement("canvas");
    cvs.width = 1024; cvs.height = 256;
    const ctx2d = cvs.getContext("2d");

    // Fondo transparente
    ctx2d.clearRect(0, 0, 1024, 256);

    // Gradiente horizontal para el texto
    const grad = ctx2d.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, "#ffffff");

    ctx2d.font = "bold 148px 'Arial', sans-serif";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillStyle = grad;
    ctx2d.fillText("KLASE  A", 512, 128);

    // Linea inferior decorativa
    ctx2d.fillStyle = color;
    ctx2d.fillRect(120, 210, 784, 4);

    const tex = new THREE.CanvasTexture(cvs);

    // Material frontal con el texto
    const frontMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.3, roughness: 0.25 });
    // Material de los cantos (extrusion)
    const sideMat  = new THREE.MeshStandardMaterial({ color: C, metalness: 0.9, roughness: 0.15, emissive: C, emissiveIntensity: 0.45 });
    // BoxGeometry: orden de materiales → +X, -X, +Y, -Y, +Z(frente), -Z(atras)
    const mats = [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat];
    const block = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.35, 0.52), mats);
    scene.add(block);

    // Linea glow debajo del bloque
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: C, emissive: C, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 })
    );
    glow.position.set(0, -0.95, 0.28);
    scene.add(glow);

    // Anillos orbitales decorativos
    const rMat1 = new THREE.MeshStandardMaterial({ color: C, emissive: C, emissiveIntensity: 0.5, transparent: true, opacity: 0.55 });
    const rMat2 = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    add(
      mk(new THREE.TorusGeometry(3.6, 0.035, 8, 80), rMat1, [0, 0, 0], [Math.PI / 2 * 0.35, 0.5, 0]),
      mk(new THREE.TorusGeometry(3.9, 0.018, 8, 80), rMat2, [0, 0, 0], [-Math.PI / 2 * 0.25, 1.1, 0]),
    );

    // Puntos de acento orbitando
    [
      [3.2,  1.0,  0.0],
      [-3.1, 0.5,  0.2],
      [1.8, -2.8,  0.0],
      [-2.0, 2.5,  0.1],
      [0.0,  3.5, -0.2],
    ].forEach(pos => {
      add(mk(new THREE.SphereGeometry(0.07, 12, 12),
        new THREE.MeshStandardMaterial({ color: C, emissive: C, emissiveIntensity: 1.8 }), pos));
    });
  }

  else if (moduleId === "batteries") {
    add(mk(new THREE.BoxGeometry(3.2, 4.4, 0.2), mPanel(), [0, 0, -0.1]));
    const switchDefs = [
      ["Corte MOTOR",    "Activa el banco de arranque del motor. Sin este paso, la llave no hace nada. Activarlo antes de cualquier intento de encendido."],
      ["Corte SERVICIO", "Alimenta todos los consumos de 12V y 220V del salon. Tableros, bombas, iluminacion y el cargador/inversor dependen de este banco."],
      ["Corte GRUPO",    "Necesario antes de encender el generador. Sin este corte activo, el grupo no tiene alimentacion para arrancar."],
      ["Corte BOW",      "Alimenta el molinete del ancla en proa. Activarlo solo cuando se va a fondear — consume mucho si queda encendido."],
      ["Corte PARALELO", "Puentea dos bancos entre si para emergencias de baja carga. SOLO para rescate — desconectarlo siempre al resolver el problema."],
    ];
    switchDefs.forEach(([label, info], i) => {
      const y = 1.6 - i * 0.75;
      const on = i < 2;
      const sw = tag(mk(new THREE.BoxGeometry(2.4, 0.55, 0.3), mGrey(), [0, y, 0]), label, info);
      add(sw,
        mk(new THREE.CylinderGeometry(0.13, 0.13, 0.18, 16), on ? mOn() : mOff(), [0.8, y, 0.2], [PI2, 0, 0]),
        mk(new THREE.BoxGeometry(0.12, 0.12, 0.12), on ? mOn() : mGrey(), [-0.5, y, 0.18]),
      );
    });
    const bar = tag(mk(new THREE.BoxGeometry(2.2, 0.15, 0.35), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }), [0, -2, 0.1]),
      "Barra de bloqueo (OFF)",
      "Deslizarla hacia abajo antes de presionar OFF. Evita apagados accidentales. Al salir del barco: bajar todos los cortes uno por uno."
    );
    add(bar);
  }

  else if (moduleId === "twelve") {
    add(mk(new THREE.BoxGeometry(3.8, 3.4, 0.3), mPanel(), [0, 0, 0]));
    const breakerDefs = [
      "Termica LUCES · Controla toda la iluminacion interior y de navegacion. Bajarla al anclar para ahorrar bateria.",
      "Termica BOMBA POTABLE · Habilita el agua en canillas y ducha. La bomba es automatica por presion — arranca sola al abrir una canilla.",
      "Termica BOMBA ACHIQUE · Normalmente en automatico. Solo bajarla si hay una alarma de achique falsa.",
      "Termica MALACATE · Alimenta el molinete del ancla. Solo levantar cuando se va a fondear.",
      "Termica LUCES NAV · Luces de navegacion obligatorias de noche y con visibilidad reducida.",
      "Termica AUX 1 · Circuito auxiliar para accesorios varios. Ver etiqueta en el tablero fisico.",
      "Termica AUX 2 · Segundo circuito auxiliar. Ver etiqueta en el tablero fisico.",
      "Termica OFF · No usar — no conectada en esta unidad.",
      "Termica OFF · No usar — no conectada en esta unidad.",
      "Termica OFF · No usar — no conectada en esta unidad.",
      "Termica OFF · No usar — no conectada en esta unidad.",
      "Termica OFF · No usar — no conectada en esta unidad.",
    ];
    let bIdx = 0;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 4; row++) {
        const on = col * 4 + row < 7;
        const b = tag(mk(new THREE.BoxGeometry(0.7, 0.48, 0.25), on ? mAccent() : mOff(), [-1 + col, 1.1 - row * 0.65, 0.15]),
          on ? "Termica ON" : "Termica OFF",
          breakerDefs[bIdx++]
        );
        add(b);
      }
    }
    const volt = tag(mk(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x0f1629, roughness: 0.3, metalness: 0.7 }), [-1, -1.5, 0.17], [PI2, 0, 0]),
      "Voltimetro",
      "Indica el estado del banco de servicio. Mas de 12,6V = cargado. Entre 12 y 12,6V = uso normal. Menos de 12V = bateria baja, recargar urgente."
    );
    const amp = tag(mk(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x0f1629, roughness: 0.3, metalness: 0.7 }), [0.8, -1.5, 0.17], [PI2, 0, 0]),
      "Amperimetro",
      "Muestra el consumo actual en amperios. Sirve para no sobrecargar el banco. Si marca negativo, las baterias se estan cargando."
    );
    add(volt, amp,
      mk(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32), mAccent(), [-1, -1.5, 0.24], [PI2, 0, 0]),
      mk(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.5 }), [0.8, -1.5, 0.24], [PI2, 0, 0]),
    );
  }

  else if (moduleId === "twenty") {
    add(mk(new THREE.BoxGeometry(3.8, 3.8, 0.3), mPanel(), [0, 0, 0]));
    const selectorLabels = ["Selectora izquierda", "Selectora derecha"];
    const selectorInfo = [
      "Posicionarla en C.A.TIERRA (puerto), C.A.GRUPO (generador) o C.A.CONVERTIDOR (inverter). Ambas selectoras siempre en la misma posicion.",
      "Identica a la izquierda — deben coincidir. Si una queda distinta a la otra, el 220V no circula correctamente.",
    ];
    [-1, 1].forEach((x, si) => {
      const sel = tag(mk(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 32), mGrey(), [x, 0.7, 0.2], [PI2, 0, 0]),
        selectorLabels[si], selectorInfo[si]
      );
      add(sel,
        mk(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 8), mAccent(), [x, 0.7, 0.28], [PI2, 0, 0]),
        mk(new THREE.BoxGeometry(0.07, 0.55, 0.1), new THREE.MeshStandardMaterial({ color: 0xf8fafc }), [x, 0.98, 0.35]),
      );
    });
    const breakerNames = ["Aire acond.", "Cocina", "Calefactor", "Tomas 220V", "Cargador bat."];
    for (let i = 0; i < 5; i++) {
      const b = tag(mk(new THREE.BoxGeometry(0.72, 0.42, 0.22), i < 3 ? mAccent() : mOff(), [(-2 + i) * 0.68, -0.9, 0.17]),
        `Termica ${breakerNames[i]}`,
        `Levantar DESPUES de posicionar correctamente las selectoras. Si esta arriba sin fuente activa, el artefacto no arranca y puede quedar en falla.`
      );
      add(b);
    }
    add(mk(new THREE.BoxGeometry(3.5, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x1e293b }), [0, 1.55, 0.18]));
  }

  else if (moduleId === "energy") {
    const srcColors = [0x3b82f6, 0xf59e0b, 0xa78bfa];
    const srcLabels = ["Modo PUERTO", "Modo GRUPO", "Modo INVERTER"];
    const srcInfo = [
      "Cable amarillo del astillero enchufado en cubierta. Da confort total: clima, cocina y carga de baterias simultaneos. Selectoras a C.A.TIERRA.",
      "Generador diesel autonomo. Ideal para fondeo o navegacion sin enchufes. Activar corte GRUPO → encender grupo → selectoras a C.A.GRUPO.",
      "Usa las baterias de servicio como fuente. Maximo 2000W. Monitorear el voltimetro constantemente. Selectora chica a C.A.CONVERTIDOR.",
    ];
    [-2.5, 0, 2.5].forEach((x, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: srcColors[i], roughness: 0.4, metalness: 0.5, emissive: srcColors[i], emissiveIntensity: 0.25 });
      const src = tag(mk(new THREE.BoxGeometry(1.3, 1.9, 0.7), mat, [x, 0.9, 0]), srcLabels[i], srcInfo[i]);
      add(src);
      if (i !== 1) add(mk(new THREE.BoxGeometry(Math.abs(x) - 0.65, 0.08, 0.08), mAccent(), [x / 2, -0.35, 0]));
    });
    const bus = tag(mk(new THREE.BoxGeometry(5.8, 0.22, 0.44), mAccent(), [0, -0.35, 0]),
      "Bus de distribucion AC",
      "Punto comun que conecta la fuente elegida con todos los consumos de 220V. Las selectoras determinan cual fuente se conecta al bus."
    );
    add(bus,
      mk(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: C, emissive: C, emissiveIntensity: 0.9 }), [0, -1.45, 0]),
      mk(new THREE.ConeGeometry(0.28, 0.45, 8), mAccent(), [0, -2.38, 0]),
    );
  }

  else if (moduleId === "engines") {
    const engineInfo = [
      ["Motor BABOR (PORT)", "Motor izquierdo. Secuencia: corte MOTOR activo → palanca en NEUTRAL → llave pos 1 (pantalla enciende) → llave al tope (arranque)."],
      ["Motor ESTRIBOR (STBD)", "Motor derecho. Mismo procedimiento que babor. Encenderlos en secuencia, no simultaneamente."],
    ];
    [-1.2, 1.2].forEach((x, i) => {
      const eng = tag(mk(new THREE.BoxGeometry(1.5, 1.0, 2.4), mGrey(), [x, 0.1, 0]), ...engineInfo[i]);
      add(eng,
        mk(new THREE.BoxGeometry(1.3, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.5 }), [x, 0.65, 0.6]),
        mk(new THREE.CylinderGeometry(0.11, 0.11, 1.3, 12), mGrey(), [x + Math.sign(x) * 0.5, 0.3, -0.9]),
        mk(new THREE.SphereGeometry(0.13, 16, 16), mOn(), [x, 0.78, 0.6]),
      );
    });
    const morse = tag(mk(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 12), mAccent(), [0, -0.25, 0.25]),
      "Palanca MORSE",
      "Debe estar en NEUTRAL antes del arranque — es una proteccion de seguridad. Presionar el boton MORSE en la palanca para transferir el control al puente de mando."
    );
    const key = tag(mk(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 8), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.2, metalness: 0.9 }), [2.2, 0.5, 0], [PI2, 0, 0]),
      "Llave de arranque",
      "Posicion 1: energiza la pantalla del motor. Hay que esperar que la pantalla encienda antes de girar al tope. Posicion 2 (tope): arranca el motor."
    );
    add(morse, key,
      mk(new THREE.BoxGeometry(0.35, 0.18, 1.8), mPanel(), [0, -0.65, 0]),
      mk(new THREE.BoxGeometry(0.09, 0.55, 0.09), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9 }), [2.2, 0.78, 0]),
    );
  }

  else if (moduleId === "generator") {
    add(
      mk(new THREE.BoxGeometry(3.0, 1.8, 2.0), mGrey(), [0, 0.2, 0]),
      mk(new THREE.BoxGeometry(2.8, 1.6, 1.8), mPanel(), [0, 0.2, 0]),
    );
    const startBtn = tag(mk(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 16), mAccent(), [-0.5, 0.65, 1.06], [PI2, 0, 0]),
      "Boton de arranque",
      "Un solo click. Si presionas dos veces puede apagarse o resetear. Presar una vez y esperar que el grupo estabilice antes de tocar cualquier selectora."
    );
    const display = tag(mk(new THREE.BoxGeometry(0.65, 0.38, 0.06), new THREE.MeshStandardMaterial({ color: 0x0d2137, emissive: 0x0d4f6e, emissiveIntensity: 0.9 }), [-0.5, 0.15, 1.06]),
      "Display del grupo",
      "Muestra voltaje de salida, frecuencia y codigos de falla. Si el grupo se apaga solo, contar los destellos de la luz indicadora — cada patron es un codigo de falla."
    );
    const light = tag(mk(new THREE.SphereGeometry(0.11, 16, 16), mOn(), [0.2, 0.65, 1.06]),
      "Luz de estado",
      "Verde = grupo en marcha y dando 220V. Si parpadea o se apaga, leer el display para identificar el codigo de falla antes de intentar reiniciar."
    );
    const exhaust = tag(mk(new THREE.CylinderGeometry(0.2, 0.17, 2.0, 16), new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9, metalness: 0.3 }), [1.1, 1.15, 0.6]),
      "Caño de escape",
      "Verificar que no haya obstrucciones antes de encender el grupo. Si hay humo negro o el escape esta bloqueado, apagar inmediatamente."
    );
    add(startBtn, display, light, exhaust,
      mk(new THREE.BoxGeometry(1.0, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }), [-0.5, 0.3, 1.02]),
    );
    [-1, 1].forEach(x => [-0.7, 0.7].forEach(z => add(mk(new THREE.BoxGeometry(0.3, 0.25, 0.3), mGrey(), [x, -0.7, z]))));
  }

  else if (moduleId === "water") {
    [-1.3, 1.3].forEach((x, ti) => {
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x0f2744, roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.8 });
      const fillMat = new THREE.MeshStandardMaterial({ color: C, transparent: true, opacity: 0.45, emissive: C, emissiveIntensity: 0.15 });
      const tank = tag(mk(new THREE.BoxGeometry(1.7, 2.6, 1.3), tankMat, [x, 0, 0]),
        `Tanque de agua ${ti === 0 ? "izquierdo" : "derecho"}`,
        "Los dos tanques estan interconectados — llenar por cualquier carga lateral en cubierta es igual. Capacidad total: 480 litros. El indicador lateral muestra el nivel actual."
      );
      add(tank,
        mk(new THREE.BoxGeometry(1.5, 2.0, 1.1), fillMat, [x, -0.25, 0]),
        mk(new THREE.CylinderGeometry(0.055, 0.055, 2.4, 8), mGrey(), [x + 0.75, 0, 0]),
        mk(new THREE.SphereGeometry(0.1, 16, 16), mAccent(), [x + 0.75, 0.7, 0]),
      );
    });
    const pipe = tag(mk(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 12), mGrey(), [0, -1.0, 0], [0, 0, PI2]),
      "Caño de interconexion",
      "Une los dos tanques. Permite llenar o vaciar por cualquiera de los dos lados indistintamente. Siempre mantener las valvulas de interconexion abiertas."
    );
    const pump = tag(mk(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 16), new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.6 }), [0, -1.8, 0.6], [PI2, 0, 0]),
      "Bomba de agua potable",
      "Automatica por presion — arranca sola al abrir una canilla. Habilitarla levantando la termica BOMBA POTABLE en el tablero de 12V del salon."
    );
    add(pipe, pump, mk(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), mAccent(), [0, -1.8, 1.05]));
  }

  else if (moduleId === "safety") {
    const extinguisher = tag(mk(new THREE.CylinderGeometry(0.32, 0.38, 2.1, 16), mRed(), [-1.9, 0.1, 0]),
      "Extintor portatil",
      "Revisar la presion del manometro antes de cada salida — debe estar en zona verde. Hay uno en el salon, uno en cabina y uno en cubierta. Conoce donde estan antes de zarpar."
    );
    const bilgeLight = tag(mk(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.3 }), [0.5, 0.6, 0.2]),
      "Indicador de achique",
      "Luz azul + alarma sonora = una bomba de sentina se activo. Verificar el nivel de agua en la sentina. Si persiste, llamar a servicio tecnico."
    );
    const tempSensor = tag(mk(new THREE.CylinderGeometry(0.22, 0.22, 0.65, 16), mRed(), [2.3, 0.5, 0.3], [PI2, 0, 0]),
      "Sensor termostatico 70°C",
      "En sala de maquinas. Disparo automatico a 70°C: corta el combustible y acciona el matafuego fijo. NUNCA abrir la tapa de sala de maquinas si hay fuego adentro."
    );
    add(extinguisher, bilgeLight, tempSensor,
      mk(new THREE.CylinderGeometry(0.22, 0.32, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x1e293b }), [-1.9, 1.2, 0]),
      mk(new THREE.TorusGeometry(0.26, 0.045, 8, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8 }), [-1.9, 1.45, 0], [PI2, 0, 0]),
      mk(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), mGrey(), [-1.5, 1.3, 0.4], [0, 0, -0.5]),
      mk(new THREE.BoxGeometry(1.6, 2.0, 0.3), mPanel(), [0.5, 0, 0]),
      mk(new THREE.BoxGeometry(0.07, 1.6, 0.07), mGrey(), [2.3, 0.5, 0.3]),
    );
    for (let i = 0; i < 3; i++) {
      const sw = tag(mk(new THREE.BoxGeometry(1.0, 0.32, 0.18), mAccent(), [0.5, 0.05 - i * 0.44, 0.2]),
        "Switch de achique (AUTO)",
        "En posicion AUTO, la bomba se activa sola si detecta agua en la sentina. Nunca dejarlo en OFF en navegacion — es la primera linea de defensa contra inundacion."
      );
      add(sw);
    }
  }

  else if (moduleId === "emergency") {
    const vhf = tag(mk(new THREE.BoxGeometry(1.3, 2.4, 0.55), mPanel(), [-2.0, 0, 0]),
      "VHF Radio · Canal 16",
      "Canal 16 siempre en escucha durante la navegacion. Para emergencia: presionar PTT y decir 'MAYDAY MAYDAY MAYDAY + nombre del barco + posicion GPS + tipo de emergencia + personas a bordo'."
    );
    const sos = tag(mk(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 24), mRed(), [0.5, 0.5, 0.3], [PI2, 0, 0]),
      "Boton SOS",
      "Abre los protocolos visuales paso a paso: incendio, hombre al agua e ingreso de agua. Presionar para ver el procedimiento especifico segun el tipo de emergencia."
    );
    const gps = tag(mk(new THREE.BoxGeometry(1.9, 1.3, 0.2), mPanel(), [1.6, -0.5, 0]),
      "Pantalla GPS / Plotter",
      "Siempre tener la posicion GPS visible. Es el dato mas critico en una emergencia — sin coordenadas exactas, los servicios de rescate tardan mucho mas en llegar."
    );
    const lifeRing = tag(mk(new THREE.TorusGeometry(0.55, 0.16, 8, 24), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }), [2.5, 1.3, 0.3]),
      "Aro salvavidas",
      "Lanzarlo INMEDIATAMENTE en un hombre al agua. Nunca perder contacto visual con la persona. Reducir velocidad, marcar posicion en el GPS y virar hacia el punto marcado."
    );
    add(vhf, sos, gps, lifeRing,
      mk(new THREE.BoxGeometry(1.1, 0.8, 0.12), new THREE.MeshStandardMaterial({ color: 0x0d2137, emissive: 0x0d4f6e, emissiveIntensity: 0.7 }), [-2.0, 0.6, 0.3]),
      mk(new THREE.CylinderGeometry(0.055, 0.055, 2.0, 8), mGrey(), [-2.0, 2.1, 0]),
      mk(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0x7f1d1d }), [0.5, 0.5, 0.2], [PI2, 0, 0]),
      mk(new THREE.BoxGeometry(1.7, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x0d4f6e, emissive: 0x0d4f6e, emissiveIntensity: 0.5 }), [1.6, -0.5, 0.12]),
      mk(new THREE.TorusGeometry(0.55, 0.17, 8, 4), new THREE.MeshStandardMaterial({ color: 0xef4444 }), [2.5, 1.3, 0.31]),
    );
  }

  else if (moduleId === "troubleshoot") {
    const batDefs = [
      ["Banco MOTOR · BAJA CARGA", "Bateria del motor con carga insuficiente para arrancar. Activar corte PARALELO MOTOR para puentearlo con el banco de estribor y poder arrancar ambos motores."],
      ["Banco SERVICIO", "Si esta bajo, usar PARALELO SERVICIO para cruzar energia desde los motores. Cargarlo con el cargador de baterias una vez que los motores arranquen."],
      ["Banco GRUPO", "Si el grupo no arranca por bateria baja: activar SERVICIO + GRUPO + PARALELO GRUPO. Una vez que arranque, esperar 5 minutos y desconectar el paralelo."],
      ["Banco BOW", "Generalmente no necesita paralelo — el molinete del ancla tiene baja demanda de arranque. Verificar el corte BOW antes de concluir que esta bajo."],
    ];
    [[-2.5, 1], [-0.8, 1], [0.8, 1], [2.5, 1]].forEach(([x, y], i) => {
      const low = i === 0;
      const bat = tag(mk(new THREE.BoxGeometry(1.3, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: low ? 0x7f1d1d : 0x1e3a5f, roughness: 0.6, metalness: 0.4 }), [x, y, 0]),
        batDefs[i][0], batDefs[i][1]
      );
      add(bat,
        mk(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8), mGrey(), [x - 0.3, y + 0.48, 0]),
        mk(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8), mGrey(), [x + 0.3, y + 0.48, 0]),
        mk(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshStandardMaterial({ color: low ? 0xef4444 : 0x22c55e, emissive: low ? 0xef4444 : 0x22c55e, emissiveIntensity: 1.1 }), [x, y + 0.38, 0.47]),
      );
    });
    const bar = tag(mk(new THREE.BoxGeometry(5.8, 0.12, 0.17), mAccent(), [0, 1.6, 0]),
      "Barra de paralelo",
      "Conecta los bancos temporalmente para transferir energia entre ellos. SIEMPRE desconectarla una vez resuelto el problema — dejarla conectada puede danar los bancos."
    );
    add(bar);
    [-2.5, -0.8, 0.8, 2.5].forEach(x => add(mk(new THREE.BoxGeometry(0.09, 0.55, 0.09), mAccent(), [x, 1.33, 0])));
    add(mk(new THREE.BoxGeometry(2.8, 1.1, 0.32), mPanel(), [0, -0.5, 0]));
    for (let i = 0; i < 3; i++) {
      const sw = tag(mk(new THREE.BoxGeometry(0.56, 0.52, 0.22), i === 1 ? mAccent() : mOff(), [-0.88 + i * 0.88, -0.5, 0.22]),
        i === 1 ? "Switch PARALELO activo" : "Switch PARALELO inactivo",
        i === 1 ? "Este paralelo esta activo (ON). Indica que hay un banco bajo siendo rescatado. Desconectarlo en cuanto el banco recupere carga suficiente para operar solo." : "Switch de paralelo en OFF. Estado normal de operacion — los bancos trabajan de forma independiente."
      );
      add(sw);
    }
  }
}

// ─── Model3D component ───────────────────────────────────────────────────────
function Model3D({ moduleId, color }) {
  const mountRef  = useRef(null);
  const [info, setInfo] = useState(null); // { label, text, x, y }
  const setInfoRef = useRef(setInfo);
  setInfoRef.current = setInfo;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    setInfoRef.current(null); // limpiar info al cambiar modulo

    const W = el.clientWidth  || 640;
    const H = el.clientHeight || 420;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();

    let theta = 0.4, phi = 1.25, radius = 8;
    // Para el modulo de bienvenida: camara mas frontal para ver la K
    if (moduleId === "welcome") { phi = 1.55; radius = 9; }
    let dragging = false, didDrag = false, lastX = 0, lastY = 0;

    function setCam() {
      camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(0, 0, 0);
    }
    setCam();

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir  = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 8, 4);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
    fill.position.set(-5, 2, -4);
    scene.add(fill);
    const apt = new THREE.PointLight(color, 1.8, 14);
    apt.position.set(-2, 2, 3);
    scene.add(apt);

    buildModuleScene(moduleId, color, scene);

    let animId, t = 0;
    function loop() {
      animId = requestAnimationFrame(loop);
      t += 0.016;
      if (!dragging) { theta += (moduleId === "welcome" ? 0.004 : 0.0025); setCam(); }
      apt.intensity = 1.5 + Math.sin(t * 2) * 0.4;
      renderer.render(scene, camera);
    }
    loop();

    const canvas  = renderer.domElement;
    const getXY   = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY];

    const onDown = e => {
      dragging = true;
      didDrag  = false;
      [lastX, lastY] = getXY(e);
    };
    const onMove = e => {
      if (!dragging) return;
      const [x, y] = getXY(e);
      const dx = x - lastX, dy = y - lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      theta -= dx * 0.012;
      phi = Math.max(0.3, Math.min(2.5, phi - dy * 0.012));
      [lastX, lastY] = [x, y];
      setCam();
    };
    const onUp = () => { dragging = false; };

    // Raycasting en click (solo si no fue un drag)
    const onClick = e => {
      if (didDrag) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const hit  = hits.find(h => h.object.userData?.label);
      if (hit) {
        // Posicionar el tooltip cerca del click, evitando bordes
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const tx = cx > rect.width  * 0.6 ? cx - 270 : cx + 16;
        const ty = cy > rect.height * 0.7 ? cy - 120  : cy + 12;
        setInfoRef.current({ label: hit.object.userData.label, text: hit.object.userData.info, x: tx, y: ty });
      } else {
        setInfoRef.current(null);
      }
    };

    canvas.addEventListener("mousedown",  onDown);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("mousemove",  onMove);
    window.addEventListener("touchmove",  onMove, { passive: true });
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchend",   onUp);
    canvas.addEventListener("click",      onClick);

    const ro = new ResizeObserver(() => {
      const W2 = el.clientWidth, H2 = el.clientHeight;
      if (!W2 || !H2) return;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown",  onDown);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("click",      onClick);
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("touchmove",  onMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchend",   onUp);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(canvas)) el.removeChild(canvas);
    };
  }, [moduleId, color]);

  return (
    <div style={{ position: "absolute", inset: "4% 2%", width: "96%", height: "92%", zIndex: 3 }}>
      {/* canvas container */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, cursor: "grab" }} />

      {/* hint de interactividad */}
      {!info && (
        <div style={{
          position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          background: "rgba(2,6,23,0.6)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "5px 14px",
          color: "rgba(148,163,184,0.7)", fontSize: 12, letterSpacing: "0.06em",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          Clickeá un componente · Arrastrá para rotar
        </div>
      )}

      {/* tooltip flotante */}
      {info && (
        <div
          onClick={() => setInfo(null)}
          style={{
            position: "absolute", left: info.x, top: info.y,
            minWidth: 200, maxWidth: 270,
            background: "rgba(2,6,23,0.95)",
            border: `1px solid ${color}55`,
            borderRadius: 14,
            padding: "13px 16px",
            zIndex: 10,
            cursor: "pointer",
            boxShadow: `0 0 28px ${color}22, 0 8px 32px rgba(0,0,0,0.6)`,
            backdropFilter: "blur(8px)",
            animation: "kaFadeIn 0.15s ease",
          }}
        >
          <div style={{
            color, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
            textTransform: "uppercase", marginBottom: 7,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>{info.label}</span>
            <span style={{ opacity: 0.4, fontSize: 14, fontWeight: 400 }}>✕</span>
          </div>
          <div style={{ color: "rgba(226,232,240,0.88)", fontSize: 13, lineHeight: 1.6 }}>
            {info.text}
          </div>
        </div>
      )}
    </div>
  );
}

const ONBOARDING_CSS = `
.ka-onboarding {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  color: #f8fafc;
  background:
    radial-gradient(circle at 18% 18%, rgba(216, 195, 161, .13), transparent 34%),
    radial-gradient(circle at 78% 24%, rgba(167, 139, 250, .11), transparent 32%),
    linear-gradient(135deg, #020617 0%, #07111f 48%, #020617 100%);
  font-family: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
}
.ka-onboarding * { box-sizing: border-box; }
.ka-grid {
  position: absolute;
  inset: 0;
  opacity: .18;
  background-image:
    linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(circle at center, black, transparent 75%);
}
.ka-orb {
  position: absolute;
  width: 42vw;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(70px);
  opacity: .24;
  pointer-events: none;
}
.ka-orb-a { left: -16vw; top: 10vh; background: #0891b2; }
.ka-orb-b { right: -12vw; bottom: -10vh; background: #7c3aed; }
.ka-particles { position:absolute; inset:0; pointer-events:none; }
.ka-particles span {
  position:absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(255,255,255,.7);
  box-shadow: 0 0 18px rgba(216,195,161,.65);
  animation: kaFloat linear infinite;
}
.ka-on-topbar, .ka-on-footer {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px clamp(18px, 3vw, 44px);
}
.ka-brand-mark { display:flex; align-items:center; gap:13px; }
.ka-brand-mark img { width: 32px; height: 32px; object-fit: contain; filter: grayscale(1) brightness(2.4); }
.ka-brand-mark span {
  display:block;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .34em;
}
.ka-brand-mark small {
  display:block;
  margin-top: 4px;
  color: rgba(148,163,184,.9);
  font-size: 11px;
  letter-spacing: .12em;
}
.ka-top-status { display:flex; align-items:center; gap:12px; }
.ka-top-status > span {
  color: rgba(226,232,240,.72);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  letter-spacing: .12em;
}
.ka-top-status button, .ka-icon-btn {
  width: 38px;
  height: 38px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.13);
  background: rgba(255,255,255,.045);
  color: rgba(226,232,240,.86);
  cursor: pointer;
  backdrop-filter: blur(18px);
}
.ka-on-main {
  position: relative;
  z-index: 3;
  height: calc(100vh - 148px);
  display: grid;
  grid-template-columns: minmax(150px, 190px) 1fr;
  gap: clamp(16px, 2vw, 28px);
  padding: 0 clamp(18px, 3vw, 44px);
}
.ka-module-rail {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.ka-module-rail button {
  min-height: 42px;
  display:grid;
  grid-template-columns: 28px 18px 1fr;
  align-items:center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,.07);
  background: rgba(255,255,255,.035);
  color: rgba(203,213,225,.64);
  border-radius: 10px;
  padding: 8px 10px;
  text-align:left;
  cursor:pointer;
  transition: transform .2s ease, border-color .2s ease, background .2s ease, color .2s ease;
}
.ka-module-rail button:hover,
.ka-module-rail button.is-active {
  color: #fff;
  border-color: color-mix(in srgb, var(--module-color) 52%, rgba(255,255,255,.18));
  background: color-mix(in srgb, var(--module-color) 14%, rgba(255,255,255,.045));
  transform: translateX(3px);
}
.ka-rail-index {
  color: color-mix(in srgb, var(--module-color) 78%, #fff);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 800;
}
.ka-module-rail button span:last-child {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.ka-stage {
  min-width: 0;
  display: grid;
  align-items: stretch;
}
.ka-slide {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 1.08fr) minmax(350px, .92fr);
  gap: clamp(22px, 3vw, 44px);
  align-items: center;
}
.ka-slide-visual {
  position: relative;
  min-height: min(66vh, 650px);
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(2,6,23,.34);
  overflow: hidden;
  box-shadow: 0 34px 110px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.08);
  backdrop-filter: blur(24px);
}
.ka-hero-image { position:absolute; inset:0; overflow:hidden; }
.ka-hero-image img { display: none; }
.ka-hero-image::after {
  content:"";
  position:absolute;
  inset:0;
  background:
    radial-gradient(circle at 50% 50%, transparent 0 28%, rgba(2,6,23,.72) 72%);
}
.ka-holo-ring {
  position:absolute;
  left:50%;
  top:50%;
  width:min(72%, 520px);
  aspect-ratio:1;
  border-radius:50%;
  transform: translate(-50%,-50%);
  border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: inset 0 0 40px color-mix(in srgb, var(--accent) 8%, transparent), 0 0 50px color-mix(in srgb, var(--accent) 9%, transparent);
  z-index:2;
  animation: kaRotate 28s linear infinite;
}
.ka-holo-ring::before,
.ka-holo-ring::after {
  content:"";
  position:absolute;
  inset: 12%;
  border-radius: inherit;
  border: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent);
}
.ka-holo-ring::after { inset: 28%; animation: kaRotate 16s linear reverse infinite; }
.ka-scanline {
  position:absolute;
  left:0;
  right:0;
  top:0;
  height:1px;
  z-index:3;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 80%, white), transparent);
  animation: kaScan 4.2s ease-in-out infinite;
}
.ka-visual-svg {
  position:absolute;
  inset: 6% 4%;
  width:92%;
  height:88%;
  z-index:3;
  opacity:.9;
}
.ka-hotspot {
  position:absolute;
  z-index:5;
  width:44px;
  height:44px;
  margin-left:-22px;
  margin-top:-22px;
  border:0;
  border-radius:50%;
  background: transparent;
  cursor:pointer;
}
.ka-hotspot span {
  position:absolute;
  inset:12px;
  border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 18px var(--accent);
}
.ka-hotspot::before {
  content:"";
  position:absolute;
  inset:0;
  border-radius:50%;
  border:1px solid var(--accent);
  animation: kaPulse 1.7s ease-out infinite;
}
.ka-hotspot.is-hot span { background:#fff; }
.ka-hotspot-panel {
  position:absolute;
  z-index:6;
  left:22px;
  right:22px;
  bottom:22px;
  padding:18px 20px;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.12);
  background: rgba(2,6,23,.68);
  backdrop-filter: blur(20px);
}
.ka-hotspot-panel span {
  display:block;
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .24em;
  text-transform: uppercase;
}
.ka-hotspot-panel p {
  margin:8px 0 0;
  color: rgba(226,232,240,.82);
  font-size: 14px;
  line-height: 1.55;
}
.ka-slide-copy {
  min-width:0;
  overflow-y: auto;
  max-height: 100%;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.12) transparent;
}
.ka-slide-copy::-webkit-scrollbar { width: 4px; }
.ka-slide-copy::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius:4px; }
.ka-kicker {
  display:inline-flex;
  align-items:center;
  gap:10px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.ka-kicker span {
  width:34px;
  height:34px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border:1px solid color-mix(in srgb, var(--accent) 36%, transparent);
}
.ka-slide-copy h1 {
  margin: 22px 0 0;
  color:#fff;
  max-width: 780px;
  font-size: clamp(44px, 6vw, 86px);
  line-height: .96;
  font-weight: 700;
  letter-spacing: 0;
}
.ka-lead {
  margin: 22px 0 0;
  max-width: 650px;
  color: rgba(226,232,240,.72);
  font-size: clamp(16px, 1.6vw, 20px);
  line-height: 1.65;
}
.ka-signal {
  margin-top: 22px;
  display:flex;
  align-items:center;
  gap:12px;
  color: rgba(255,255,255,.52);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ka-signal span {
  width:8px;
  height:8px;
  border-radius:50%;
  background: var(--accent);
  box-shadow: 0 0 18px var(--accent);
}
.ka-step-list {
  margin-top: 16px;
  display: grid;
  gap: 4px;
}
/* Focused step item */
.ka-step-item {
  border-radius: 13px;
  border: 1px solid rgba(255,255,255,.06);
  background: transparent;
  cursor: pointer;
  transition: background .18s, border-color .22s, opacity .22s;
  overflow: hidden;
  outline: none;
  user-select: none;
  opacity: 0.42;
}
.ka-step-item:hover {
  opacity: 0.65;
  border-color: rgba(255,255,255,.12);
}
.ka-step-item.is-open {
  background: rgba(255,255,255,.05);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  opacity: 1;
  border-left: 3px solid var(--accent);
}
/* Inactive header: compact */
.ka-step-header {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: start;
  gap: 10px;
  padding: 8px 12px;
}
/* Active header overrides */
.ka-step-item.is-open .ka-step-header {
  padding: 14px 16px;
  gap: 14px;
  grid-template-columns: 40px 1fr;
  align-items: start;
}
.ka-step-num {
  color: var(--accent);
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-weight: 900;
  flex-shrink: 0;
  padding-top: 2px;
  transition: font-size .22s, opacity .22s;
}
.ka-step-item.is-open .ka-step-num {
  font-size: 22px;
  line-height: 1;
  padding-top: 3px;
}
.ka-step-preview {
  margin: 0;
  color: rgba(241,245,249,.72);
  font-size: 12px;
  line-height: 1.4;
  min-width: 0;
  transition: font-size .22s, color .22s, line-height .22s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ka-step-item.is-open .ka-step-preview {
  font-size: 14.5px;
  line-height: 1.6;
  color: rgba(241,245,249,.95);
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
.ka-stats-row {
  margin-top:22px;
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:10px;
}
.ka-stats-row div {
  padding:14px;
  border-radius: 14px;
  border:1px solid rgba(255,255,255,.08);
  background: rgba(2,6,23,.4);
}
.ka-stats-row strong {
  display:block;
  color:#fff;
  font-family:"JetBrains Mono", monospace;
  font-size: 17px;
}
.ka-stats-row span {
  display:block;
  margin-top:6px;
  color: rgba(148,163,184,.78);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ka-caption {
  margin:18px 0 0;
  color: rgba(148,163,184,.7);
  font-size: 14px;
  line-height:1.55;
}
.ka-on-footer { gap:16px; }
.ka-progress-wrap {
  min-width: 240px;
  flex: 1;
  max-width: 560px;
}
.ka-progress-wrap span {
  display:block;
  margin-bottom:9px;
  color: rgba(203,213,225,.7);
  font-family:"JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ka-progress {
  height: 4px;
  border-radius: 999px;
  overflow:hidden;
  background: rgba(255,255,255,.08);
}
.ka-progress div {
  height:100%;
  border-radius: inherit;
  transition: width .52s cubic-bezier(.25,1,.35,1);
  box-shadow: 0 0 20px currentColor;
}
.ka-actions {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.ka-primary,
.ka-ghost,
.ka-danger {
  min-height: 42px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  border-radius: 999px;
  padding: 0 18px;
  cursor:pointer;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.ka-primary {
  border: 0;
  background: #f8fafc;
  color: #020617;
  box-shadow: 0 12px 36px rgba(255,255,255,.16);
}
.ka-ghost {
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.045);
  color: rgba(226,232,240,.76);
}
.ka-danger {
  border: 1px solid rgba(244,63,94,.34);
  background: rgba(244,63,94,.12);
  color: #fda4af;
}
.ka-icon-btn:disabled {
  opacity:.32;
  cursor:not-allowed;
}
@keyframes kaFloat {
  from { transform: translate3d(0, 0, 0); opacity:0; }
  20% { opacity:.7; }
  to { transform: translate3d(18px, -56px, 0); opacity:0; }
}
@keyframes kaKen {
  from { transform: scale(1.08); }
  to { transform: scale(1); }
}
@keyframes kaRotate {
  from { transform: translate(-50%,-50%) rotate(0deg); }
  to { transform: translate(-50%,-50%) rotate(360deg); }
}
@keyframes kaPulse {
  from { transform: scale(.55); opacity:.8; }
  to { transform: scale(1.5); opacity:0; }
}
@keyframes kaScan {
  0% { transform: translateY(-10px); opacity:0; }
  12% { opacity:.9; }
  88% { opacity:.9; }
  100% { transform: translateY(74vh); opacity:0; }
}
@media (max-width: 1100px) {
  .ka-on-main {
    height: calc(100vh - 162px);
    grid-template-columns: 1fr;
  }
  .ka-module-rail {
    order:2;
    flex-direction: row;
    justify-content:flex-start;
    overflow-x:auto;
    padding-bottom: 6px;
    scrollbar-width: none;
  }
  .ka-module-rail::-webkit-scrollbar { display:none; }
  .ka-module-rail button {
    min-width: 130px;
  }
  .ka-slide {
    grid-template-columns: 1fr;
    gap: 16px;
    align-content:start;
    overflow-y:auto;
    padding-right: 4px;
  }
  .ka-slide-visual { min-height: 36vh; }
  .ka-slide-copy h1 { font-size: clamp(32px, 7vw, 60px); }
  .ka-slide-copy { max-height: none; overflow-y: visible; }
  .ka-lead { font-size: clamp(14px, 2vw, 18px); }
}
@media (max-width: 720px) {
  .ka-on-topbar {
    padding: 12px 14px;
    gap: 8px;
  }
  .ka-brand-mark small,
  .ka-top-status > span:first-child {
    display:none;
  }
  .ka-on-main {
    height: calc(100dvh - 174px);
    padding: 0 12px;
    gap: 10px;
  }
  .ka-module-rail button {
    min-width: 110px;
    font-size: 11px;
    padding: 8px 10px;
    gap: 5px;
  }
  .ka-module-rail { gap: 6px; }
  .ka-slide {
    gap: 12px;
    padding-right: 2px;
  }
  .ka-slide-visual {
    min-height: 240px;
    border-radius: 20px;
  }
  .ka-slide-copy h1 {
    font-size: clamp(26px, 7.5vw, 48px);
    margin-top: 14px;
  }
  .ka-lead {
    font-size: 14px;
    margin-top: 12px;
  }
  .ka-signal { margin-top: 12px; }
  .ka-step-list { margin-top: 10px; gap: 3px; }
  .ka-step-header { padding: 7px 10px; }
  .ka-step-item.is-open .ka-step-header { padding: 12px 14px; }
  .ka-step-preview { font-size: 12px; }
  .ka-step-item.is-open .ka-step-preview { font-size: 14px; }
  .ka-step-item.is-open .ka-step-num { font-size: 18px; }
  .ka-stats-row {
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap: 7px;
    margin-top: 14px;
  }
  .ka-stats-row div { padding: 10px; }
  .ka-stats-row strong { font-size: 14px; }
  .ka-hotspot-panel { padding: 14px 16px; left: 12px; right: 12px; bottom: 12px; }
  .ka-hotspot-panel p { font-size: 13px; }
  .ka-on-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 10px 12px 14px;
    gap: 10px;
  }
  .ka-progress-wrap { max-width:none; width:100%; }
  .ka-actions { justify-content:space-between; }
  .ka-ghost { display:none; }
  .ka-primary { flex:1; }
  .ka-caption { font-size: 13px; margin-top: 12px; }
}
@media (max-width: 420px) {
  .ka-module-rail button {
    min-width: 92px;
    font-size: 10px;
  }
  .ka-slide-visual { min-height: 200px; }
  .ka-slide-copy h1 { font-size: clamp(22px, 8vw, 36px); }
  .ka-stats-row { grid-template-columns: 1fr 1fr; }
  .ka-step-body { padding-left: 40px; }


/* --- FIX M�VIL Y OVERFLOWS ONBOARDING --- */
@media (max-width: 820px) {
  .ka-onboarding { display: flex !important; flex-direction: column !important; }
  .ka-on-topbar, .ka-on-footer { flex-shrink: 0 !important; }
  .ka-on-main { flex: 1 !important; height: auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; }
  .ka-module-rail { flex-shrink: 0 !important; padding-bottom: 8px !important; }
  .ka-stage { flex: 1 !important; min-height: 0 !important; }
  .ka-slide { height: 100% !important; display: flex !important; flex-direction: column !important; overflow-y: auto !important; padding-bottom: 24px !important; gap: 16px !important; }
  .ka-slide-visual { min-height: 260px !important; flex-shrink: 0 !important; }
  .ka-slide-copy { overflow-y: visible !important; padding-bottom: 20px !important; }
  .ka-hotspot-panel { position: relative !important; margin: -15px 12px 12px !important; bottom: auto !important; left: auto !important; right: auto !important; z-index: 10 !important; }
  .ka-actions { width: 100% !important; }
  .ka-primary { flex: 1 !important; justify-content: center !important; }
}
}
`;



