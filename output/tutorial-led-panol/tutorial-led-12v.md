# Primera luz del pañol: robot ESP32 + relé + tira de 12 V

Guía del 7 de octubre de 2026. Referencia para el módulo BESTEP mecánico de dos canales **alimentado a 3,3 V**, el que vimos en la publicación. Todavía falta confirmar que el módulo recibido sea ese. Una entrada compatible con señales de 3,3 V no significa necesariamente que el módulo se alimente a 3,3 V: si recibiste otro, revisamos su modelo antes de alimentarlo.

![Cableado de la tira](01-tira-led-12v.png)

![Control desde el robot](02-control-esp32-rele.png)

## Qué vamos a probar

Una tira común de dos cables, de un solo color, de 20–50 cm, con su fuente de 12 V. El robot ordena encender y apagar el canal 1. No es todavía la instalación de las 48 ubicaciones ni una integración ya publicada con Klase. Esta conexión no regula brillo.

Necesitás el relé con pines y borneras ya soldados, cables hembra–hembra para el control, cable de cobre aislado para la tira y un destornillador chico. Si compartís un pin en la protoboard, usá hembra–macho (o hembra–hembra unido a macho–macho). Si la tira tiene solo pads de cobre, necesitás soldarle cables o usar un conector sin soldadura de dos contactos del ancho correcto. Si tu fuente termina en un enchufe redondo DC, necesitás su adaptador hembra a bornera compatible, con polaridad identificada.

**No hay que soldar el relé si llegó armado.** Las borneras se aprietan con tornillo. Los cables Dupont son para las señales del prototipo; no los uses para alimentar una tira larga.

## 1. Desenchufar

Desconectá el USB del robot y la fuente de 12 V de la pared. Dejá pantalla, micrófono, parlante y pulsador como estaban. Esta guía trabaja únicamente con la salida de 12 V: no intervengas los bornes de entrada de 220 V de una fuente abierta.

## 2. Conectar los cables de la tira

Buscá las etiquetas del **mismo canal 1**: COM1, NO1 y NC1. El orden físico puede variar; seguí la serigrafía de tu módulo y no una posición de la ilustración.

| Desde | Hasta | Cable |
|---|---|---|
| Positivo de la fuente (+12 V) | Fusible en serie y luego COM1 | Cobre aislado |
| NO1 del relé | Positivo de la tira (+12 V) | Cobre aislado |
| Negativo de la fuente (− / 0 V) | Negativo de la tira (−) | Cobre aislado |

NC1 queda libre. Los tres bornes del canal 2 quedan libres. Para esta prueba de hasta 50 cm y una tira de hasta 12 W/m, un fusible de 1 A en el positivo protege el ramal; para otra longitud o potencia hay que recalcularlo junto con la sección del cable.

Aflojá el tornillo de la bornera, pelá unos 5–6 mm (ajustá según la profundidad real), meté el cobre por la abertura lateral debajo de la abrazadera y ajustá. Tironeá suave para comprobar que quedó agarrado. No dejes hebras sueltas ni cobre descubierto que pueda tocar el borne vecino. El tornillo aprieta: el cable no se enrolla arriba de él.

## 3. Conectar el control del relé

**Solo para la versión con alimentación de 3,3 V confirmada.** El programa actual del robot no usa GPIO17; la placa lo identifica con el número **17**. Seguí las etiquetas, no el número de posición del conector.

| ESP32 | Relé | Cable |
|---|---|---|
| 3V3 | DC+ | Hembra–hembra si los dos tienen pines |
| GND | DC− | Hembra–hembra si los dos tienen pines |
| 17 (GPIO17) | IN1 | Hembra–hembra si los dos tienen pines |

IN2 queda libre. Con todo desenchufado, poné el selector de activación del canal 1 en **H / HIGH**, siguiendo las letras de tu placa. El ejemplo de programa de abajo supone esa configuración. Si no tiene ese selector o las etiquetas difieren, revisamos el módulo antes de usarlo.

La alimentación 3V3 directa es para comprobar **un canal** en este prototipo; la capacidad real del regulador de la placa clon y su consumo restante no están medidos. Si el robot se reinicia al activar el relé, detené la prueba: se necesita revisar la alimentación y posiblemente alimentar las bobinas con una fuente regulada dedicada. Para ampliar a muchos canales se diseña esa alimentación aparte.

Los contactos COM/NO son un interruptor separado del control. En este montaje no hace falta unir el negativo de la fuente de 12 V al GND de la ESP32. **Los 12 V nunca van a 3V3, 5V, GPIO17, DC+ ni IN1 de este relé de 3,3 V.**

## 4. Si 3V3 ya está ocupado

Podés repartir **ese mismo 3V3** en un carril de alimentación libre de la protoboard. No lo mezcles con un carril que ya tenga 5 V.

1. Con todo desenchufado, sacá del pin 3V3 el cable que estaba conectado y conservá su otro extremo.
2. ESP32 3V3 → carril libre: hembra al pin, macho al agujero del carril.
3. Reconectá la alimentación que retiraste a ese mismo segmento del carril, usando el adaptador de cables necesario.
4. Ese mismo segmento → DC+ del relé: macho al carril y hembra al pin del módulo.

El color rojo de la protoboard no fija el voltaje: lo determina lo que conectás. Algunos carriles están divididos a la mitad; usá agujeros del mismo tramo. Para compartir GND se puede hacer lo mismo en otro carril destinado solo a GND. No conectes dos salidas de fuentes distintas al mismo carril.

## 5. Revisar antes de probar

La tira debe coincidir con la tensión de la fuente: 12 V DC. Revisá polaridad, que NC1 esté vacío, que COM1 y NO1 pertenezcan al mismo canal y que no haya conductores sueltos. Mandá una foto donde se lean los pines del relé, sus bornes y la conexión en la ESP32 antes de energizarlo.

## 6. Prueba de software

Preparé `PruebaLed12V/PruebaLed12V.ino`: es una prueba independiente que empieza apagada. Una orden `1` en el monitor serie enciende tres segundos; `0` apaga. El pin es 17 y el selector debe estar en HIGH. No activa periódicamente la luz por sí sola.

**No está cargada en el robot.** Cargar este ejemplo sustituye temporalmente el programa de la carita; hay que restaurar `tools/robot-panol/KlasePanol/KlasePanol.ino` después. Para conservar la carita se puede incorporar la prueba al programa actual una vez confirmado el cableado. No se modificó ese firmware ni se cambió su comportamiento con el botón.

Al ejecutar una prueba verificada, primero se comprueba el clic del relé con USB y sin conectar la fuente de la tira; luego, con todo desenchufado y revisado, se conecta la fuente de 12 V para comprobar la luz. Si el relé hace clic pero no enciende, revisar el circuito COM/NO, polaridad y fuente. Si enciende siempre, revisar que no se haya usado NC. Si la tira titila o se reinicia el robot, detener y revisar alimentación y conexiones.

## Fuentes y láminas

- Modelo de referencia: [HobbyTronica BESTEP de dos canales, 3,3 V](https://hobbytronica.com.ar/productos/modulo-relay-2-canales-mecanico-bestep-3-3v-optoacoplado-250v-10a-ac/). La página identifica la variante; no confirma el modelo entregado.
- Identificación de GPIO17 y 3V3: [documentación ESP32-S3 de Espressif](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.0.html). Nuestra placa es una variante; los pines deben identificarse por sus etiquetas reales.

Láminas generadas con la herramienta integrada de imágenes. Son ilustraciones de referencia, no fotografías del montaje del usuario. Prompts: lámina 1, componentes realistas, COM1 como entrada del positivo de 12 V con fusible, NO1 hacia positivo de tira y negativo directo; lámina 2, control condicional para BESTEP alimentado a 3,3 V, 3V3→DC+, GND→DC− y GPIO17→IN1, selector HIGH, alternativa de reparto del mismo 3V3 en un carril libre. El texto de las tablas y las etiquetas reales del módulo determinan las conexiones.
