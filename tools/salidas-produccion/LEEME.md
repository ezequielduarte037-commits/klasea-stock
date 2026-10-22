# Salidas de producción: prueba de reconocimiento facial

Mide cuánto tiempo pasa cada persona fuera del área de producción. Usa YuNet y SFace (OpenCV, licencia Apache 2.0). Corre en la PC; la cámara sólo manda el video.

## Qué guarda

- `datos/personas.enc`: las plantillas de cada cara, encriptadas con una clave atada a tu usuario de Windows (`datos/clave.dpapi`). **No se guardan fotos.**
- `datos/eventos.csv`: hora, puerta, sentido (salida o entrada), persona y similitud.
- `datos/pendientes/`: los pasos que no se pudieron identificar, encriptados. Se borran solos a las 48 h.
- `datos/medicion.csv`: cuadros por segundo, CPU y RAM cada 10 s.

`datos/` no se sube al repositorio. Si se borra `clave.dpapi`, lo encriptado no se puede abrir más.

## Uso

Los comandos se escriben en una terminal abierta en esta carpeta.

```
salidas modelos                      (una sola vez: baja y verifica los modelos)
salidas registrar "Nombre Apellido"  (mirar a la cámara; toma 8 muestras)
salidas registrar "Nombre" --desde-fotos C:\fotos\nombre   (3 a 8 fotos, una cara por foto)
salidas personas
salidas borrar "Nombre"
salidas reconocer                    (cámara de la notebook; teclas s = salida, e = entrada, q = salir)
salidas reconocer --fuente rtsp://usuario:clave@IP:554/Streaming/Channels/101 --puerta lateral --sentido salida --sin-ventana
salidas revisar                      (asignar o descartar los pasos sin identificar)
salidas informe --desde 2026-10-22
python test_salidas.py               (pruebas sin cámara; usar el python de .venv)
```

En la puerta real hay dos cámaras, y cada una corre su propio `reconocer`: la de adentro con `--sentido salida` y la de afuera con `--sentido entrada`.

## Ajustes (al principio de `salidas.py`)

- `UMBRAL_SIMILITUD` (0.45): si se equivoca de persona, subirlo; si deja demasiados sin identificar, bajarlo de a 0.02. OpenCV sugiere 0.363 como mínimo.
- `CARA_MIN_PX` (60): en la puerta real conviene 80.
- La regla es no poner nunca un nombre equivocado: si duda, anota "no identificado".

## Falta

- Sumar los registros del fichero de la entrada principal.
- Mandar los eventos a Supabase y armar la pantalla en KlaseA.
- Aviso escrito y consentimiento de cada persona antes de registrarla.
