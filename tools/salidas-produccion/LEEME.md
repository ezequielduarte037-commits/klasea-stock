# Salidas de producción: prueba de reconocimiento facial

Mide cuánto tiempo pasa cada persona fuera del área de producción. Usa YuNet y SFace (OpenCV, licencia Apache 2.0). Corre en la PC; la cámara sólo manda el video.

## Qué guarda

- `datos/personas.enc`: las plantillas de cada cara, encriptadas con una clave atada a tu usuario de Windows (`datos/clave.dpapi`). Cada persona queda con su DNI de RRHH. **No se guardan fotos.**
- `datos/rrhh.enc`: copia encriptada de los empleados activos y de las fichadas de los últimos 45 días, sacadas de KlaseA.
- `datos/eventos.csv`: hora, puerta, sentido (salida o entrada), persona, DNI y similitud.
- `datos/pendientes/`: los pasos que no se pudieron identificar, encriptados. Se borran solos a las 48 h.
- `datos/medicion.csv`: cuadros por segundo, CPU y RAM cada 10 s.

`datos/` no se sube al repositorio. Si se borra `clave.dpapi`, lo encriptado no se puede abrir más.

## Uso

Lo más fácil es el acceso directo **Salidas de producción** del escritorio: abre `menu.py`, un menú con las opciones de abajo.

Si no, los comandos se escriben en una terminal abierta en esta carpeta.

```
salidas modelos                      (una sola vez: baja y verifica los modelos)
salidas sincronizar                  (trae empleados y fichadas de KlaseA; también se hace solo cada hora)
salidas registrar "duarte"           (busca en RRHH por nombre o DNI, se elige y se toman 8 muestras)
salidas registrar "Nombre" --sin-rrhh       (alguien que no está en RRHH)
salidas registrar "duarte" --desde-fotos C:\fotos\duarte   (3 a 8 fotos, una cara por foto)
salidas vincular                     (pasa a RRHH a los que se registraron sin DNI, sin volver a tomarles la cara)
salidas personas
salidas borrar 30111222              (DNI o nombre)
salidas reconocer                    (cámara de la notebook; teclas s = salida, e = entrada, q = salir)
salidas reconocer --fuente rtsp://usuario:clave@IP:554/Streaming/Channels/101 --puerta lateral --sentido salida --sin-ventana
salidas revisar                      (asignar o descartar los pasos sin identificar)
salidas informe --desde 2026-10-22
python test_salidas.py               (pruebas sin cámara; usar el python de .venv)
```

En la puerta real hay dos cámaras, y cada una corre su propio `reconocer`: la de adentro con `--sentido salida` y la de afuera con `--sentido entrada`.

## Fichadas de la entrada principal

La clave es el DNI: el mismo Employee ID del Hikvision, que KlaseA ya importa en `rrhh_marcaciones`.

- Si alguien sale por la lateral y no vuelve a pasar por la cámara, **la siguiente fichada de ese mismo día cierra la salida**.
- Ese tiempo es un máximo: la persona volvió en algún momento antes de fichar. El informe lo marca en la columna "Por fichero".
- Las fichadas llegan cuando alguien importa el export del fichero en KlaseA; hasta entonces la persona sigue figurando "fuera".
- Sólo cuentan las fichadas del fichero de **Chubut**, que es el de la entrada principal de producción (`SEDE_FICHERO`). Las de Pampa no cierran salidas.
- Para leer KlaseA usa el CLI de Supabase ya vinculado en este repo (`npx supabase db query --linked`). En otra PC habría que vincularlo o cambiar la forma de leer.

## Ajustes (al principio de `salidas.py`)

- `UMBRAL_SIMILITUD` (0.45): si se equivoca de persona, subirlo; si deja demasiados sin identificar, bajarlo de a 0.02. OpenCV sugiere 0.363 como mínimo.
- `CARA_MIN_PX` (60): en la puerta real conviene 80.
- La regla es no poner nunca un nombre equivocado: si duda, anota "no identificado".

## Falta

- Mandar los eventos a Supabase y armar la pantalla en KlaseA.
- Aviso escrito y consentimiento de cada persona antes de registrarla.
