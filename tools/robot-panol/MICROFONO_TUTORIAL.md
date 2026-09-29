# Micrófono MAX9814 para el robot del pañol

## Conexiones

Apagar y desenchufar el USB antes de mover cables. Seguir las etiquetas impresas en los módulos, no sus colores.

| MAX9814 | ESP32-S3 / protoboard |
| --- | --- |
| `V+` | Carril positivo alimentado desde `3V3` de la ESP32 |
| `GND` | Un pin `GND` libre de la ESP32 |
| `Out` | Pin `1` (`GPIO1`) de la ESP32 |
| `G` o `Gain` | Sin conectar |
| `AR` | Sin conectar |

Los dos pines `3V3` de la ESP32 ya alimentaban `VCC` y `LED` de la pantalla. Para compartir uno de ellos, desconectar **solo** el cable `VCC` de la pantalla del pin `3V3` de la ESP32. Conectar ese pin `3V3` a un tramo del carril positivo de la protoboard. Llevar al **mismo tramo** el cable `VCC` de la pantalla y un cable nuevo desde `V+` del micrófono. `LED` de la pantalla se deja donde estaba.

Con los cables disponibles, cada extremo hembra que deba terminar en la protoboard se une con un jumper macho-macho: una punta del macho-macho entra en la ficha hembra y la otra entra en el carril. Asegurar esas uniones para que no se suelten. No colocar dos fichas sobre el mismo pin de la ESP32.

El módulo MAX9814 entrega una señal analógica con polarización DC; `Out` va directo a una entrada ADC y no al amplificador I2S del parlante. No unir `Out` a 5V, `3V3` ni GND. El micrófono no necesita soldadura adicional si sus cinco pines están firmemente soldados.

## Prueba

1. Revisar que ningún pin metálico suelto toque otro. Volver a conectar el USB.
2. La pantalla conserva la cara y los avisos. Abajo a la derecha de la cara aparecen cinco barras pequeñas del micrófono.
3. Hablar a unos 20 cm del micrófono y mirar si suben las barras. Comparar con el silencio, sin acercar el parlante al micrófono.
4. El diagnóstico serie `KLASE_MIC` informa `min`, `max`, `span` y `level` cada segundo. Lo importante es que `span` aumente al hablar o aplaudir.
5. Si no cambia, comprobar primero `Out→GPIO1`, `V+→3V3` y `GND→GND`; luego revisar las uniones del carril.

## Qué hace ahora el firmware

- El botón sigue recorriendo los avisos de recepción de Chubut.
- La llegada de avisos nuevos dispara un aviso sonoro corto, sin bloquear la pantalla.
- Mantener el pulsador externo apretado unos dos segundos reproduce la muestra de voz argentina para evaluar el parlante.
- El micrófono muestra intensidad y entrega un valor de diagnóstico. Todavía no interpreta palabras ni escucha órdenes: eso requiere una etapa separada de reconocimiento de voz y una decisión explícita sobre dónde se procesaría el audio.

La conexión de Wi-Fi del pañol sigue pendiente de la prueba acordada; estas funciones locales no dependen de esa red.
