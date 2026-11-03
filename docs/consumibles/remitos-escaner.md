# Remitos y escáner en Consumibles

En **Consumibles → Ingresos** se puede escanear desde la impresora de la PC,
elegir vidrio o alimentador, o seguir cargando una foto/PDF. Reutiliza el puente
y el código de vinculación que ya usa Pañol; no requiere cambios de base de datos.

## Uso

1. Con el puente instalado y abierto en la PC de la impresora, colocar el remito.
2. Si no está vinculada, abrir **Vincular escáner** y pegar el código del acceso
   **Klase A - Código scanner**. La vinculación existente de Pañol sirve también.
3. Elegir vidrio o alimentador y usar **Escanear desde la impresora**.
4. Revisar productos y cantidades; resolver o descartar los renglones dudosos y
   usar **Confirmar ingreso**.

Los originales quedan en `C:\KlaseA\Remitos\Pendientes\Consumibles\<sede>`.
Si falla la lectura, **Ver escaneos pendientes → Leer / reintentar** vuelve a leer
el archivo sin mover el escáner. Un archivo ya incorporado al borrador aparece
marcado y no se incorpora otra vez. El original se mueve a Procesados solo
después de confirmar el ingreso. Si falla ese movimiento, se avisa que el stock
ya se guardó para evitar volver a ingresarlo.

El borrador conserva los escaneos incorporados y los renglones por resolver al
recargar la página. Escanear o leer no modifica stock.

## Lectura de PDF

Con Gemini, el PDF completo se envía por la vía nativa, que incluye imágenes y
texto. Se elimina la dependencia inicial de `pdf-text`, actualmente obsoleto y
redirigido a otro parser. Si falla la primera vía, se intenta el archivo completo
con un segundo modelo, Gemini Flash por defecto, antes del respaldo por OCR.
Para modelos configurados sin PDF nativo se usa `cloudflare-ai`.

Referencia: [configuración oficial de PDF en OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/pdfs).

Las respuestas con renglones inválidos se reintentan completas. Los fallos de
lectura quedan visibles en Ingresos; no se agregan líneas parciales al borrador.

## Validación y publicación

- Pruebas de extracción: PDF nativo, respuesta truncada, filas inválidas,
  recuperación por OCR, parser saturado, crédito agotado y modelo sin PDF nativo.
- Pruebas de ingreso: códigos Rebollar, cantidades, presentaciones, conservación
  del borrador, duplicación de escaneo y bloqueo de renglones pendientes.
- Pruebas del puente con dispositivo simulado: carpeta por sede, archivos de
  otras obras, descarga, error de dispositivo y código de vinculación incorrecto.
- Prueba de interfaz con puente simulado: vinculación, lectura fallida,
  reintento del mismo archivo y marca de archivo ya cargado.

No se accionó la impresora física ni se contó con el archivo exacto del incidente.

## Corrección del 2 de noviembre de 2026

Los registros del servidor de las 14:40 y 14:43 (Argentina) muestran dos
timeouts consecutivos en la lectura nativa. Consumían todo el plazo global de
110 segundos; el OCR fallaba por falta de tiempo sin llegar a hacer una llamada.

Se mantiene el límite global, con reservas por etapa:

- Lectura principal: hasta 55 segundos, con un máximo de 35 por llamada.
- Segundo modelo: hasta el segundo 90, con un máximo de 45 por llamada.
- OCR: conserva al menos 20 segundos y hace un solo intento.

Un timeout pasa al siguiente método sin repetir el mismo pedido bloqueado.
Los JSON truncados, respuestas inválidas y fallos transitorios todavía pueden
reintentarse dentro de la reserva de su etapa. Gemini Flash usa razonamiento
desactivado para esta extracción. El modelo de respaldo se configura con
`OPENROUTER_MODEL_PDF_FALLBACK`; no cambia el modelo de fotos, texto o chat.

Las 52 pruebas de extracción, ingresos y puente pasan, incluidas las regresiones
de agotamiento de tiempo. También se comprobó el respaldo contra OpenRouter real
inyectando un timeout en el primer intento: el PDF de diagnóstico con códigos
Rebollar devolvió sus dos renglones en 3 segundos y un remito escaneado real
devolvió sus dos códigos y cantidades en 4 segundos. No se registraron ingresos
ni se modificaron existencias. La función privada de diagnóstico se retiró
después de la validación.

La publicación requiere desplegar la aplicación y `extraer-comprobante`, que
importa el helper compartido modificado:

```powershell
npx supabase functions deploy extraer-comprobante --project-ref fiwugzjeegzlgclfayfd --use-api
```

No hace falta reinstalar el puente si ya está funcionando la versión con carpetas.

## Vinculación con pedidos al leer el remito (3 de noviembre de 2026)

La lectura de IA sigue reconociendo códigos, productos y cantidades. Con ese
resultado se consultan los pedidos confirmados de la sede y se vincula el remito
al pedido pendiente del mismo proveedor con una coincidencia clara de productos.
No se agrega otra llamada a IA ni se confunde el número de remito con el de pedido.
CMR Insumos Industriales y Rebollar se reconocen como el mismo proveedor.

Si hay dos pedidos con los mismos productos, se ofrecen para elegir: ni las
cantidades ni elegir el más reciente prueban cuál corresponde a una entrega
parcial. La pantalla muestra el pedido detectado y permite cambiarlo o registrar
explícitamente un ingreso sin pedido. Si falla consultar pedidos, la lectura del
remito queda conservada para reintentar la búsqueda.

Cada producto coincidente conserva su cantidad entregada y recibe el
`pedido_item_id` existente. La vista de recepción actualiza automáticamente
cuánto llegó y cuánto falta; los productos extra se muestran como ingresos aparte.
Antes de guardar se comprueba que el pedido y los renglones sigan pendientes.
Los reintentos de envíos ya preparados conservan sus mismos identificadores.

Al escanear después de pulsar **Recibir**, las cantidades precargadas del pedido
se reemplazan por lo efectivamente leído del remito. No se suman ambas listas
ni se reciben productos que no aparezcan en la entrega.

También se reconocen coincidencias con pedidos que ya tienen todos sus productos
recibidos: se avisa para revisar la recepción anterior y no volver a sumar stock.
No se modificaron ingresos históricos ni se conciliaron existencias durante
esta implementación. No requiere migraciones.

Verificado con pruebas de lógica y navegación en la pantalla real con respuestas
de servidor simuladas: detección automática, selección ambigua, entrega parcial,
escaneo posterior a Recibir y aviso de pedido ya recibido.
