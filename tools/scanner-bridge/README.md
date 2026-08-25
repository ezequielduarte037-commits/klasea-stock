# Klasea · Scanner de remitos USB

Puente local para la Pantum M6559NW conectada por USB.

```text
Pantum / Asistente de Windows
  → C:\KlaseA\Remitos\Pendientes
  → puente local Node
  → navegador autenticado
  → Supabase + lectura con IA
  → revisión humana
  → ingreso existente de Pañol
```

El puente no conoce claves de Supabase y no modifica stock. Sólo expone los
archivos locales a la sesión web mediante `127.0.0.1`. El stock cambia recién
cuando Pañol revisa los renglones y confirma el formulario normal de ingreso.

## Instalar en la PC de Pañol

Con Node.js ya instalado, ejecutar PowerShell como administrador:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\scanner-bridge\instalar-scanner.ps1
```

El instalador:

- copia el puente a `C:\klasea\scanner`;
- crea `C:\KlaseA\Remitos\Pendientes` y `Procesados`;
- lo inicia oculto;
- agrega arranque automático para el usuario de Windows.

Después, en Klase A:

1. Abrir **Pañol → Escanear remitos**.
2. Copiar el código de `%LOCALAPPDATA%\KlaseA\Scanner\codigo-vinculacion.txt`.
3. Vincular esta PC una sola vez.
4. Usar **Abrir Pantum Scan** y guardar el documento como PDF, 300 dpi, en
   `C:\KlaseA\Remitos\Pendientes`.

## Prueba manual

```powershell
node .\tools\scanner-bridge\scanner-bridge.mjs
```

Abrir `http://127.0.0.1:17778/health`. Debe responder JSON con `ok: true`.

## Seguridad

- Escucha exclusivamente en `127.0.0.1:17778`, no en la red del astillero.
- Lista y descarga requieren un código local aleatorio.
- CORS acepta localhost y despliegues `klasea-stock` de Vercel.
- El archivo se mueve a `Procesados` sólo después de guardarse en Supabase.
- La IA nunca crea un producto ni confirma stock automáticamente.
