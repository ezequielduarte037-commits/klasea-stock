# Klasea · Puente NFC (ACR122U → navegador)

El lector **ACS ACR122U** es PC/SC, no emula teclado: hace beep pero no escribe nada.
El navegador no puede leerlo directo, así que este proceso hace de puente.

```
[ Tarjeta ] → ACR122U → (PC/SC) → este puente → (WebSocket) → klasea-stock en el navegador
```

La app web **no necesita ningún cambio**: `useNfcBridge` ya escucha
`ws://127.0.0.1:17777/nfc`.

## Qué expone

| Endpoint | Para qué |
|---|---|
| `ws://127.0.0.1:17777/nfc` | Emite un JSON por cada tarjeta apoyada |
| `http://127.0.0.1:17777/health` | Estado del lector, para diagnosticar |

Mensaje que emite:

```json
{ "type": "card", "uid": "04AABBCCDD", "reader": "ACS ACR122U ...", "at": "2026-07-18T12:00:00Z" }
```

## Compilar

Necesita el **SDK de .NET 8** (no alcanza el runtime):
https://dotnet.microsoft.com/download/dotnet/8.0

```powershell
cd tools\nfc-bridge
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

El exe queda en:

```
tools\nfc-bridge\bin\Release\net8.0\win-x64\publish\KlaseaNfcBridge.exe
```

Es **self-contained**: en la PC del pañol no hay que instalar .NET ni nada.

## Instalar en la PC del pañol

1. Copiar `KlaseaNfcBridge.exe` a una carpeta, por ejemplo `C:\klasea\nfc\`.
2. Enchufar el ACR122U (Windows le pone el driver CCID solo).
3. Doble click al exe. Tiene que decir `OK Lector detectado: ACS ACR122U...`.
4. Abrir klasea-stock en el navegador y apoyar una tarjeta.

### Que arranque solo con Windows

Pegar un acceso directo del exe en:

```
shell:startup
```

(Win+R → pegar eso → Enter → arrastrar ahí el acceso directo.)

## Verificar que anda

Con el puente abierto, en el navegador:

```
http://127.0.0.1:17777/health
```

Tiene que devolver `"connected": true` y el nombre del lector.

## Problemas comunes

| Síntoma | Causa |
|---|---|
| `No se pudo abrir el puerto 17777` | Ya hay otra copia corriendo. Cerrala. |
| `No se detecta ningun lector` | El USB no está enchufado, o falta el driver CCID. |
| `No se pudo hablar con el servicio de tarjetas` | El servicio `SCardSvr` está parado. Iniciarlo desde `services.msc`. |
| Lee la tarjeta pero la web no reacciona | La web no está conectada al puente. Revisar `/health` → `clients`. |
| La misma tarjeta dispara muchas veces | No debería: hay un debounce de 1,2 s. Si pasa, subir `Debounce` en `Program.cs`. |

## Notas

- No guarda nada ni habla con Supabase: sólo emite el UID. La web resuelve el
  empleado buscando por `nfc_uid`.
- Escucha únicamente en `127.0.0.1`, así que no queda expuesto en la red.
- El UID sale en hexadecimal mayúsculas sin separadores (ej. `04AABBCCDD`), que es
  lo que espera `normalizeNfcUid` en la app.
