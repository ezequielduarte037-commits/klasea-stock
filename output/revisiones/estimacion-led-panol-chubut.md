# LED para el pañol de Chubut: estimación preliminar

5 de octubre de 2026. Importes en pesos argentinos; materiales sin mano de obra, envíos ni programación. No es una cotización cerrada.

## Base del cálculo

El plano usado por la aplicación (`src/features/panol/panolLayout.js` y `MapaPanolTab.jsx`) tiene 19,65 × 9,50 m. Se consultó la tabla actual `panol_estanterias` en modo de solo lectura el 5 de octubre de 2026 a las 14:25 (Argentina): hay 48 muebles activos, con 85,40 m de frente sumado, 185 niveles de estantería y 20 cajones en N. El largo de cada estantería multiplicado por sus niveles suma 316,70 m, sin iluminación de la cajonera N. La consulta no modificó la base. El resultado está guardado en `estanterias-led-chubut-actual.json`, junto a este informe.

Frente al respaldo del 15 de agosto, G3 pasó de cuatro a siete niveles (+2,70 m de LED), K1 ahora tiene tres niveles (+16,80 m) y se agregó la cajonera N de 1,30 m y 20 cajones. Las dimensiones registradas de N son aproximadas según la migración que la creó; los datos del sistema deben contrastarse con medidas en sitio antes de comprar el total.

No se tomó la dimensión máxima de los rectángulos del plano como largo de cada estante: el dibujo y las medidas físicas registradas difieren en varios muebles. Los cálculos usan `largo_cm` y `niveles_cm` de la base actual, no el tamaño del dibujo.

## Opciones

| Alcance | LED instalado | Compra estimada con margen | Salidas independientes | Reserva de materiales |
|---|---:|---:|---:|---:|
| Señalización con 50 cm por mueble | 24 m | 25–30 m | 48 | $450.000–$750.000 |
| Una línea que ilumine el frente de cada mueble | 85,40 m | 95–100 m | 48 | $1.000.000–$1.700.000 |
| Una línea por nivel, seleccionable individualmente | 316,70 m + iluminación de N | 350–380 m, sujeto a medir | 186 con indicador común en N; 205 con uno por cajón | $3.000.000–$5.000.000 |

No incluye iluminar dos caras adicionales, techo ni sustituir la iluminación general. La opción por nivel depende de si N lleva un indicador común o uno por cajón. El metraje de N debe medirse: no equivale a colocar 1,30 m por cada cajón. El margen de compra cubre cortes, desperdicio y esa reserva preliminar; las tiras se cortan en los puntos que permite el modelo elegido.

## Distribución de las medidas actuales

| Zona | Muebles | Frente sumado (m) | Todos los niveles registrados (m) |
|---|---:|---:|---:|
| A | 3 | 7,90 | 19,60 |
| B | 2 | 6,80 | 27,20 |
| C | 4 | 9,00 | 36,00 |
| D | 4 | 9,00 | 36,00 |
| E | 2 | 2,10 | 9,60 |
| F | 2 | 7,20 | 28,80 |
| G | 6 | 7,50 | 32,70 |
| H | 9 | 8,10 | 32,40 |
| I | 2 | 4,70 | 18,80 |
| J | 3 | 6,00 | 24,00 |
| K | 1 | 5,60 | 16,80 |
| N | 1 | 1,30 | Cajonera: 20 cajones, sin metraje definido |
| P | 1 | 3,00 | 6,00 |
| V | 8 | 7,20 | 28,80 |
| Total | 48 | 85,40 | 316,70 + iluminación de N |

## Integración propuesta

Klase o el robot envían el código del mueble → controlador Wi-Fi cercano al sector → salida asignada → LED. Un tiempo límite apaga la indicación. La iluminación general conserva su funcionamiento independiente del robot.

Para 48 muebles se pueden distribuir 6–8 controladores Wi-Fi con 8 salidas cada uno (48–64 disponibles). Otra posibilidad es menos controladores con expansión de salidas; todavía no se eligió el hardware final. No se necesita un robot por estante.

El relé comprado de dos canales alcanza para dos ubicaciones de prueba. En la instalación definitiva se requieren fuentes distribuidas, fusibles por ramal, cajas, cable de cobre, canaletas y perfiles. Los cables Dupont quedan para prototipos. Como reserva inicial de trazado, calcular 100–200 m de cable para señalización; sección y metraje definitivos dependen de rutas y consumo.

Muchos relés necesitan alimentación regulada dedicada para sus bobinas: no tomarla del regulador de 3,3 V del robot. No unir en paralelo las salidas de fuentes distintas. Para la ampliación comparar 12 V con 24 V antes de comprar todo; la tira y fuente de 12 V existentes sirven para el piloto.

## Potencia

- 24 m a 4 W/m: 96 W con todo encendido. A 12 W/m: 288 W.
- 85,40 m a 12 W/m: aproximadamente 1.025 W.
- 316,70 m a 12 W/m: aproximadamente 3.800 W, más la iluminación de N.

El diseño debe fijar cuántas luces pueden encenderse simultáneamente. Si se dimensionan fuentes para menos que el total, ese límite debe cumplirse también en el software. Reservar alrededor de 25 % adicional de capacidad como hipótesis de presupuesto y verificar las condiciones térmicas del modelo elegido. Las conexiones a 220 V y el montaje definitivo de fuentes deben resolverse con una instalación eléctrica adecuada.

## Referencias consultadas de precios

Referencias para el rango; no constituyen una lista con disponibilidad confirmada:

- [Tira de 5 m y 12 W/m Demasled](https://www.mercadolibre.com.ar/tira-led-smd2835-12v-12wm-blanco-neutro-5m-1080lm-60-ledsm/up/MLAU231400021): unos $28.405; tienda propia con promociones menores.
- [Fuente 12 V, 30 A, 360 W](https://www.mercadolibre.com.ar/fuente-switching-12v-30a-360w-tira-led-cinta-led/p/MLA2039362618): referencia de $25.650–$30.000. No es una elección definitiva.
- [ESP32 de desarrollo](https://www.mercadolibre.com.ar/esp32devkitc-wroom32-placa-de-desarrollo-similar-arduino/up/MLAU3145184073): unos $18.044, sin expansión ni caja.
- [Relé de ocho canales 3,3 V](https://hobbytronica.com.ar/productos/modulo-relay-8-canales-mecanico-bestep-3-3v-optoacoplado-250v-10a-ac/): referencia de catálogo $19.500; stock sin confirmar.
- [Perfil Demasled de 2 m](https://articulo.mercadolibre.com.ar/MLA-1172834622-perfil-aluminio-de-aplicar-o-embutir-para-tira-x-2m-demasled-_JM): referencia aproximada $7.022, según variante y accesorios.

Los totales reservan también cableado, protecciones, conversores, gabinetes y accesorios aún no cotizados individualmente. La elección de placas integradas o expansión puede modificar el costo.

## Recomendación

Empezar con dos ubicaciones reales usando el relé, tira y fuente existentes. Probar búsqueda desde Klase/robot, encendido del mueble correcto y apagado automático. Después ampliar por sectores. La señalización con 50 cm por mueble ofrece la utilidad de encontrar materiales con menos LED y menor consumo que iluminar todos los niveles.
