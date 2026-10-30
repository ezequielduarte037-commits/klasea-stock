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
redirigido a otro parser. Si falla la primera vía, se conserva la recuperación
por OCR y el límite total de tiempo. Para modelos configurados sin PDF nativo
se usa `cloudflare-ai` y se conserva el respaldo por OCR.

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

No se contó con el remito original que falló ni se accionó la impresora física.
Estas pruebas no confirman la causa exacta del incidente reportado.

La publicación requiere desplegar la aplicación y `extraer-comprobante`, que
importa el helper compartido modificado:

```powershell
npx supabase functions deploy extraer-comprobante --project-ref fiwugzjeegzlgclfayfd --use-api
```

No hace falta reinstalar el puente si ya está funcionando la versión con carpetas.
