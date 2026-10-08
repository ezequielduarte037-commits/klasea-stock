# Cambiar el parlante del robot sin soldar

8 de octubre de 2026. Primera prueba con **un solo parlante nuevo**. El parlante ya trae sus dos cables soldados y sus fichas hembra. Usamos el amplificador MAX98357 que estaba conectado al robot y su bornera verde de dos tornillos.

![Conexiones del parlante](C:/klasea-stock/output/tutorial-parlante-nuevo/01-conexion-parlante.png)

![Cómo preparar los cables](C:/klasea-stock/output/tutorial-parlante-nuevo/02-preparar-cables.png)

## Qué necesitás

- Un parlante nuevo con sus dos cables y fichas hembra.
- Dos cables Dupont macho–macho, de los que ya tenés.
- Destornillador chico para la bornera verde.
- Alicate y pelacables para preparar un extremo de cada jumper.

No se cortan las fichas del parlante ni se tocan sus soldaduras. Se corta **una sola ficha de cada cable macho–macho** para obtener cobre que pueda agarrar bien la bornera.

## Paso a paso

1. **Desenchufá el USB del robot.** Si la prueba LED quedó conectada, dejá también su fuente desenchufada.
2. Aflojá los dos tornillos de la bornera verde del MAX98357 y sacá los dos cables del parlante viejo. El amplificador y sus cables hacia la ESP32 quedan como estaban.
3. Elegí dos cables macho–macho. Si podés, uno rojo y uno negro; si son de otros colores, seguí cada recorrido para no confundirlos.
4. Enchufá un extremo macho del primer jumper dentro de la ficha hembra del cable rojo del parlante. Enchufá un extremo macho del segundo jumper dentro de la ficha hembra del cable negro. Deben quedar bien encajados.
5. En el extremo que quedó libre de **cada jumper**, cortá la ficha macho. Ese extremo irá a la bornera. Conservá intacto el macho que acabás de enchufar al parlante.
6. Pelá unos 5 mm de funda del extremo cortado, sin cortar el cobre; ajustá esa longitud a la profundidad real de la bornera. Juntá las hebras para que no queden filamentos sueltos.
7. Buscá los signos **+ y − de salida del parlante** impresos en el amplificador. Aflojá el tornillo correspondiente, meté el cobre por la abertura lateral bajo la abrazadera y ajustá.

| Recorrido completo | Salida del MAX98357 |
|---|---|
| Cable rojo del parlante → ficha hembra → macho del jumper → extremo pelado | **+** |
| Cable negro del parlante → ficha hembra → macho del jumper → extremo pelado | **−** |

Los colores de los jumpers pueden ser diferentes. Lo que manda es que el cable del positivo del parlante llegue a la salida + y el negativo a la salida −. Las posiciones izquierda/derecha de una ilustración no reemplazan las etiquetas de tu módulo.

8. Tironeá muy suave cada cable para verificar que no salga de la bornera. No debe quedar cobre largo afuera ni hebras tocando el otro terminal.
9. Dejá el segundo parlante aparte. Mandá una foto donde se vean la bornera y las uniones macho–hembra antes de volver a conectar el USB; así revisamos el montaje y después probamos la voz.

**El − de salida del parlante no es GND.** Los dos cables del parlante van únicamente a las dos salidas de la bornera verde: nunca a VIN, GND ni a un pin de la ESP32. La fuente de 12 V de las luces no alimenta este circuito de audio.

## Cómo queda cada cable

```text
PARLANTE                         ADAPTADOR QUE PREPARAMOS                    AMPLIFICADOR
rojo soldado → [hembra] ← [macho intacto] ── cable ── [cobre pelado] → salida +
negro soldado → [hembra] ← [macho intacto] ── cable ── [cobre pelado] → salida −
```

Esto es una conexión de banco con jumpers cortos. Para el montaje definitivo se sujetan y aíslan bien las uniones y se evita que el peso del cable tire de las soldaduras del parlante.

## Referencia y láminas

El MAX98357 tiene salida puenteada: el parlante se conecta entre sus dos terminales de salida, sin conexión a masa. [Guía del MAX98357 de Adafruit](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts).

Láminas creadas con el generador integrado de imágenes, como ilustraciones de referencia. No son fotos del montaje recibido. Indicaciones usadas para generarlas:

- Conexión completa: parlante pequeño con cables rojo y negro ya soldados y fichas hembra; dos jumpers macho–macho conservan el extremo que entra en esas hembras y llevan el otro extremo pelado a la bornera verde del MAX98357; rojo a salida + y negro a salida −. Componentes realistas, fondo blanco, flechas y textos grandes en español, sin cambios en los cables del robot, USB desconectado y segundo parlante separado.
- Preparación: cuatro pasos con fotos macro para identificar fichas macho y hembra, cortar una sola ficha de cada jumper, pelar unos 5 mm y sujetar el cobre en la abertura lateral de la bornera. Mostrar las fichas del parlante intactas y distinguir la salida − de GND.

No se modificó ni cargó software para este cambio de parlante.
