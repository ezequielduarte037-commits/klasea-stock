"""Prueba de reconocimiento facial para medir el tiempo fuera del área de producción.

Cada cámara mira una puerta en un sentido (salida o entrada). Cuando reconoce a
alguien anota un evento; el tiempo fuera es de la salida al siguiente regreso.
No se guardan imágenes: sólo plantillas numéricas de cara (encriptadas) y
eventos. La única excepción son los pasos que no se pudieron identificar, que
quedan encriptados 48 h para que un supervisor los asigne o los descarte.

Uso (detalle en LEEME.md):
  python salidas.py modelos
  python salidas.py registrar "Nombre Apellido"
  python salidas.py reconocer --puerta lateral --sentido salida
  python salidas.py revisar
  python salidas.py informe
"""
import argparse
import csv
import ctypes
import ctypes.wintypes as wt
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter, deque
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np
import psutil
from cryptography.fernet import Fernet

cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)

BASE = Path(__file__).resolve().parent
MODELOS = {
    "yunet": (
        BASE / "modelos" / "face_detection_yunet_2023mar.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "sface": (
        BASE / "modelos" / "face_recognition_sface_2021dec.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}

# Ajustes. Ver LEEME.md antes de tocarlos.
UMBRAL_SIMILITUD = 0.45   # OpenCV sugiere 0.363 para SFace; más alto = menos nombres equivocados
MARGEN_SEGUNDO = 0.06     # el mejor candidato tiene que ganarle al segundo por este margen
VOTOS_NECESARIOS = 3      # cuadros que tienen que coincidir en el mismo nombre
VENTANA_VOTOS = 5
CARA_MIN_PX = 60          # ancho mínimo de la cara; en la puerta real conviene 80
NITIDEZ_MIN = 35.0
FRONTAL_MAX = 0.28        # cuánto puede correrse la nariz del centro de los ojos
CUADROS_MIN_PASO = 3      # detecciones mínimas para tomar un paso como real
PERDIDO_SEG = 1.0         # sin ver la cara este tiempo, el paso se cierra
ESPERA_REPETIDO_SEG = 30  # no repetir el mismo evento de la misma persona
HORAS_PENDIENTES = 48
MUESTRAS_REGISTRO = 8
MEDIR_CADA_SEG = 10
ANCHO_DETECCION = 960     # las caras se buscan en una copia de este ancho

NO_IDENTIFICADO = "(no identificado)"
CAMPOS_EVENTO = ["hora", "puerta", "sentido", "persona", "similitud", "origen"]

VERDE = (80, 190, 80)
GRIS = (170, 170, 170)
ROJO = (70, 70, 220)
BLANCO = (245, 245, 245)


# ---------- Encriptado ----------

class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(datos: bytes, proteger: bool) -> bytes:
    """Protege la clave con la cuenta de Windows: otro usuario u otra PC no la puede abrir."""
    if sys.platform != "win32":
        raise OSError("El cofre usa DPAPI y sólo funciona en Windows.")
    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    buf = ctypes.create_string_buffer(datos, len(datos))
    entrada = _Blob(len(datos), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    salida = _Blob()
    funcion = crypt32.CryptProtectData if proteger else crypt32.CryptUnprotectData
    if not funcion(ctypes.byref(entrada), None, None, None, None, 0x1, ctypes.byref(salida)):
        raise OSError("No se pudo abrir la clave (¿otro usuario de Windows?).")
    try:
        return ctypes.string_at(salida.pbData, salida.cbData)
    finally:
        kernel32.LocalFree(salida.pbData)


class Cofre:
    def __init__(self, carpeta: Path):
        archivo = carpeta / "clave.dpapi"
        if archivo.exists():
            clave = _dpapi(archivo.read_bytes(), proteger=False)
        else:
            clave = Fernet.generate_key()
            archivo.write_bytes(_dpapi(clave, proteger=True))
        self._fernet = Fernet(clave)

    def cifrar(self, datos: bytes) -> bytes:
        return self._fernet.encrypt(datos)

    def descifrar(self, datos: bytes) -> bytes:
        return self._fernet.decrypt(datos)


# ---------- Datos en disco ----------

def _limpiar(texto: str) -> str:
    return re.sub(r"[^A-Za-z0-9-]", "-", texto).strip("-") or "puerta"


class Datos:
    def __init__(self, carpeta):
        self.dir = Path(carpeta)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.pendientes = self.dir / "pendientes"
        self.pendientes.mkdir(exist_ok=True)
        self.cofre = Cofre(self.dir)
        self.personas_f = self.dir / "personas.enc"
        self.eventos_f = self.dir / "eventos.csv"
        self.medicion_f = self.dir / "medicion.csv"

    def leer_personas(self) -> dict:
        if not self.personas_f.exists():
            return {}
        return json.loads(self.cofre.descifrar(self.personas_f.read_bytes()))

    def guardar_personas(self, personas: dict):
        datos = json.dumps(personas).encode()
        temporal = self.personas_f.with_suffix(".tmp")
        temporal.write_bytes(self.cofre.cifrar(datos))
        temporal.replace(self.personas_f)

    def anotar_evento(self, hora: datetime, puerta, sentido, persona, similitud, origen):
        nuevo = not self.eventos_f.exists()
        with self.eventos_f.open("a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if nuevo:
                w.writerow(CAMPOS_EVENTO)
            w.writerow([hora.isoformat(timespec="seconds"), puerta, sentido, persona,
                        f"{similitud:.3f}", origen])

    def leer_eventos(self) -> list:
        if not self.eventos_f.exists():
            return []
        with self.eventos_f.open(newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def guardar_pendiente(self, hora: datetime, puerta, sentido, recorte) -> Path:
        ok, jpg = cv2.imencode(".jpg", recorte, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise ValueError("No se pudo codificar el recorte.")
        nombre = f"{hora:%Y%m%dT%H%M%S}_{_limpiar(puerta)}_{_limpiar(sentido)}.enc"
        destino = self.pendientes / nombre
        destino.write_bytes(self.cofre.cifrar(jpg.tobytes()))
        return destino

    def leer_pendiente(self, archivo: Path):
        jpg = np.frombuffer(self.cofre.descifrar(archivo.read_bytes()), np.uint8)
        return cv2.imdecode(jpg, cv2.IMREAD_COLOR)

    def purgar_pendientes(self, ahora: float = None) -> int:
        limite = (ahora or time.time()) - HORAS_PENDIENTES * 3600
        borrados = 0
        for archivo in self.pendientes.glob("*.enc"):
            if archivo.stat().st_mtime < limite:
                archivo.unlink()
                borrados += 1
        return borrados

    def anotar_medicion(self, fila: dict):
        nuevo = not self.medicion_f.exists()
        with self.medicion_f.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(fila))
            if nuevo:
                w.writeheader()
            w.writerow(fila)


def leer_clave_pendiente(archivo: Path):
    """De '20261022T104500_lateral_salida.enc' saca (hora, puerta, sentido)."""
    hora, puerta, sentido = archivo.stem.split("_")
    return datetime.strptime(hora, "%Y%m%dT%H%M%S"), puerta, sentido


# ---------- Reconocimiento ----------

class Motor:
    def __init__(self):
        for clave, (ruta, _, _) in MODELOS.items():
            if not ruta.exists():
                sys.exit(f"Falta el modelo {ruta.name}. Corré: python salidas.py modelos")
        self.det = cv2.FaceDetectorYN.create(str(MODELOS["yunet"][0]), "", (320, 320), 0.85, 0.3, 50)
        self.rec = cv2.FaceRecognizerSF.create(str(MODELOS["sface"][0]), "")
        self._tam = None

    def detectar(self, img) -> list:
        # Se busca en una copia achicada (es lo que más CPU consume) y se vuelve a la escala original.
        escala = min(1.0, ANCHO_DETECCION / img.shape[1])
        chica = cv2.resize(img, None, fx=escala, fy=escala) if escala < 1 else img
        h, w = chica.shape[:2]
        if self._tam != (w, h):
            self.det.setInputSize((w, h))
            self._tam = (w, h)
        _, caras = self.det.detect(chica)
        if caras is None:
            return []
        caras[:, :14] /= escala
        return list(caras)

    def calidad(self, img, cara):
        """Devuelve (sirve, motivo, cara_alineada, nitidez)."""
        if cara[2] < CARA_MIN_PX:
            return False, "lejos", None, 0.0
        ojo_d, ojo_i, nariz = np.array(cara[4:6]), np.array(cara[6:8]), np.array(cara[8:10])
        distancia_ojos = float(np.linalg.norm(ojo_i - ojo_d))
        if distancia_ojos < 1:
            return False, "de costado", None, 0.0
        centro = (ojo_d + ojo_i) / 2
        if abs(nariz[0] - centro[0]) / distancia_ojos > FRONTAL_MAX:
            return False, "de costado", None, 0.0
        alineada = self.rec.alignCrop(img, cara)
        nitidez = float(cv2.Laplacian(cv2.cvtColor(alineada, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
        if nitidez < NITIDEZ_MIN:
            return False, "movida", alineada, nitidez
        return True, "", alineada, nitidez

    def rasgo(self, alineada) -> np.ndarray:
        f = self.rec.feature(alineada).flatten().astype(np.float32)
        return f / np.linalg.norm(f)


class Galeria:
    def __init__(self, personas: dict):
        self.nombres, filas = [], []
        for nombre, rasgos in personas.items():
            for r in rasgos:
                self.nombres.append(nombre)
                filas.append(r)
        self.matriz = np.array(filas, np.float32) if filas else np.zeros((0, 128), np.float32)

    def identificar(self, rasgo: np.ndarray):
        """Devuelve (nombre o None, similitud del mejor candidato)."""
        if not len(self.matriz):
            return None, 0.0
        mejor = {}
        for nombre, sim in zip(self.nombres, self.matriz @ rasgo):
            mejor[nombre] = max(mejor.get(nombre, -1.0), float(sim))
        orden = sorted(mejor.items(), key=lambda x: -x[1])
        nombre, sim = orden[0]
        segundo = orden[1][1] if len(orden) > 1 else -1.0
        if sim >= UMBRAL_SIMILITUD and sim - segundo >= MARGEN_SEGUNDO:
            return nombre, sim
        return None, sim


class Paso:
    """Una persona pasando frente a la cámara, de que aparece hasta que se pierde."""
    _siguiente = 1

    def __init__(self, caja, t):
        self.id = Paso._siguiente
        Paso._siguiente += 1
        self.caja, self.visto, self.inicio = caja, t, t
        self.detecciones = 0
        self.votos = deque(maxlen=VENTANA_VOTOS)
        self.decidido = None
        self.similitud = 0.0
        self.mejor_sim = 0.0   # el candidato más parecido aunque no haya alcanzado el umbral
        self.motivo = ""
        self.recorte = None
        self._puntaje_recorte = -1.0

    def votar(self, nombre, sim):
        self.votos.append((nombre, sim))
        self.mejor_sim = max(self.mejor_sim, sim)
        cuenta = Counter(n for n, _ in self.votos if n)
        if cuenta:
            nombre_top, veces = cuenta.most_common(1)[0]
            if veces >= VOTOS_NECESARIOS:
                self.decidido = nombre_top
                self.similitud = max(s for n, s in self.votos if n == nombre_top)
        return self.decidido

    def ofrecer_recorte(self, recorte, puntaje):
        if puntaje > self._puntaje_recorte:
            self.recorte, self._puntaje_recorte = recorte, puntaje


def _iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


class Seguidor:
    def __init__(self):
        self.pasos = []

    def asignar(self, caja, t) -> Paso:
        libres = [p for p in self.pasos if p.visto < t]
        mejor, puntaje = None, 0.0
        for p in libres:
            iou = _iou(p.caja, caja)
            cerca = np.hypot(p.caja[0] + p.caja[2] / 2 - caja[0] - caja[2] / 2,
                             p.caja[1] + p.caja[3] / 2 - caja[1] - caja[3] / 2) < 0.6 * max(caja[2], p.caja[2])
            valor = iou if iou >= 0.3 else (0.29 if cerca else 0.0)
            if valor > puntaje:
                mejor, puntaje = p, valor
        if mejor is None:
            mejor = Paso(caja, t)
            self.pasos.append(mejor)
        mejor.caja, mejor.visto = caja, t
        mejor.detecciones += 1
        return mejor

    def cerrar_viejos(self, t) -> list:
        cerrados = [p for p in self.pasos if t - p.visto > PERDIDO_SEG]
        self.pasos = [p for p in self.pasos if p not in cerrados]
        return cerrados


def recorte_con_margen(img, cara, margen=0.35, lado_max=220):
    x, y, w, h = [int(v) for v in cara[:4]]
    mx, my = int(w * margen), int(h * margen)
    alto, ancho = img.shape[:2]
    r = img[max(0, y - my):min(alto, y + h + my), max(0, x - mx):min(ancho, x + w + mx)].copy()
    escala = lado_max / max(r.shape[:2]) if r.size else 1
    return cv2.resize(r, None, fx=escala, fy=escala) if r.size and escala < 1 else r


# ---------- Tiempo fuera ----------

def eventos_resueltos(eventos: list) -> list:
    """Saca los 'no identificado' que después un supervisor asignó a alguien."""
    revisados = {(e["hora"], e["puerta"], e["sentido"]) for e in eventos if e["origen"] == "revision"}
    return [e for e in eventos
            if not (e["persona"] == NO_IDENTIFICADO and (e["hora"], e["puerta"], e["sentido"]) in revisados)]


def calcular_tiempos(eventos: list, ahora: datetime = None) -> dict:
    """Por (persona, día de la salida): salidas, minutos fuera, sin regreso y si está fuera ahora."""
    ahora = ahora or datetime.now()
    por_persona = {}
    for e in eventos_resueltos(eventos):
        if e["persona"] == NO_IDENTIFICADO:
            continue
        por_persona.setdefault(e["persona"], []).append(e)

    filas = {}
    for persona, lista in por_persona.items():
        lista.sort(key=lambda e: e["hora"])
        salida = None
        for e in lista:
            hora = datetime.fromisoformat(e["hora"])
            if e["sentido"] == "salida":
                if salida is not None:
                    filas[(persona, salida.date())]["sin_regreso"] += 1
                salida = hora
                fila = filas.setdefault((persona, hora.date()),
                                        {"salidas": 0, "minutos": 0.0, "sin_regreso": 0, "fuera_desde": None})
                fila["salidas"] += 1
            elif e["sentido"] == "entrada" and salida is not None:
                filas[(persona, salida.date())]["minutos"] += (hora - salida).total_seconds() / 60
                salida = None
        if salida is not None:
            fila = filas[(persona, salida.date())]
            if salida.date() == ahora.date():
                fila["fuera_desde"] = salida
            else:
                fila["sin_regreso"] += 1
    return filas


def fuera_ahora(eventos: list, ahora: datetime = None) -> list:
    ahora = ahora or datetime.now()
    lista = [(persona, f["fuera_desde"]) for (persona, _), f in calcular_tiempos(eventos, ahora).items()
             if f["fuera_desde"]]
    return sorted(lista, key=lambda x: x[1])


# ---------- Cámara ----------

def abrir_fuente(fuente: str):
    if fuente.isdigit():
        cap = cv2.VideoCapture(int(fuente), cv2.CAP_DSHOW)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        return cap, False
    if fuente.lower().startswith("rtsp"):
        os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
    cap = cv2.VideoCapture(fuente)
    return cap, Path(fuente).exists()


def _texto(img, texto, xy, color=BLANCO, escala=0.55):
    cv2.putText(img, texto, xy, cv2.FONT_HERSHEY_SIMPLEX, escala, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(img, texto, xy, cv2.FONT_HERSHEY_SIMPLEX, escala, color, 1, cv2.LINE_AA)


def _panel(img, lineas):
    alto = 22 * len(lineas) + 12
    capa = img.copy()
    cv2.rectangle(capa, (0, 0), (min(img.shape[1], 460), alto), (30, 30, 30), -1)
    cv2.addWeighted(capa, 0.65, img, 0.35, 0, img)
    for i, (texto, color) in enumerate(lineas):
        _texto(img, texto, (10, 24 + 22 * i), color)


# ---------- Comandos ----------

def cmd_modelos(_args):
    for clave, (ruta, url, sha) in MODELOS.items():
        if ruta.exists() and hashlib.sha256(ruta.read_bytes()).hexdigest() == sha:
            print(f"{ruta.name}: ya está")
            continue
        ruta.parent.mkdir(exist_ok=True)
        print(f"Bajando {ruta.name}...")
        temporal = ruta.with_suffix(".parcial")
        urllib.request.urlretrieve(url, temporal)
        if hashlib.sha256(temporal.read_bytes()).hexdigest() != sha:
            temporal.unlink()
            sys.exit(f"{ruta.name}: la descarga no coincide con la huella esperada; no se usa.")
        temporal.replace(ruta)
        print(f"{ruta.name}: listo")


def cmd_registrar(args):
    datos, motor = Datos(args.datos), Motor()
    personas = datos.leer_personas()
    if args.nombre in personas and not args.reemplazar:
        sys.exit(f"'{args.nombre}' ya está registrado. Usá --reemplazar para cargarlo de nuevo.")

    rasgos = _rasgos_desde_fotos(motor, Path(args.desde_fotos)) if args.desde_fotos \
        else _rasgos_desde_camara(motor, args.fuente, args.nombre)
    if len(rasgos) < 3:
        sys.exit(f"Sólo salieron {len(rasgos)} muestras buenas; hacen falta al menos 3. No se guardó nada.")

    otros = {n: r for n, r in personas.items() if n != args.nombre}
    if otros:
        promedio = np.mean(rasgos, axis=0)
        nombre, sim = Galeria(otros).identificar(promedio / np.linalg.norm(promedio))
        if nombre:
            print(f"Atención: se parece a '{nombre}' (similitud {sim:.2f}). Revisá que no sea la misma persona.")

    personas[args.nombre] = [r.tolist() for r in rasgos]
    datos.guardar_personas(personas)
    print(f"Registrado '{args.nombre}' con {len(rasgos)} muestras. No se guardó ninguna foto.")
    if args.desde_fotos:
        print("Ya podés borrar las fotos de esa carpeta.")


def _rasgos_desde_camara(motor, fuente, nombre):
    cap, _ = abrir_fuente(fuente)
    if not cap.isOpened():
        sys.exit(f"No se pudo abrir la cámara '{fuente}'.")
    rasgos, ultima = [], 0.0
    ventana = "Registro (q cancela)"
    try:
        while len(rasgos) < MUESTRAS_REGISTRO:
            ok, img = cap.read()
            if not ok:
                break
            caras = motor.detectar(img)
            aviso, color = "Mirá a la cámara", GRIS
            if len(caras) > 1:
                aviso, color = "Tiene que haber una sola persona", ROJO
            elif len(caras) == 1:
                sirve, motivo, alineada, _ = motor.calidad(img, caras[0])
                x, y, w, h = [int(v) for v in caras[0][:4]]
                cv2.rectangle(img, (x, y), (x + w, y + h), VERDE if sirve else GRIS, 2)
                if sirve and time.time() - ultima > 0.4:
                    rasgos.append(motor.rasgo(alineada))
                    ultima = time.time()
                aviso = "Mové apenas la cabeza" if sirve else f"Cara {motivo}"
                color = VERDE if sirve else GRIS
            _panel(img, [(f"Registrando: {nombre}", BLANCO),
                         (f"Muestras {len(rasgos)}/{MUESTRAS_REGISTRO}", BLANCO),
                         (aviso, color)])
            cv2.imshow(ventana, img)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                return []
    finally:
        cap.release()
        cv2.destroyAllWindows()
    return rasgos


def _rasgos_desde_fotos(motor, carpeta: Path):
    rasgos = []
    for foto in sorted(carpeta.iterdir()):
        if foto.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            continue
        img = cv2.imdecode(np.fromfile(str(foto), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            print(f"  {foto.name}: no se pudo abrir")
            continue
        caras = motor.detectar(img)
        if len(caras) != 1:
            print(f"  {foto.name}: tiene {len(caras)} caras, hace falta una")
            continue
        sirve, motivo, alineada, _ = motor.calidad(img, caras[0])
        if not sirve:
            print(f"  {foto.name}: cara {motivo}")
            continue
        rasgos.append(motor.rasgo(alineada))
        print(f"  {foto.name}: ok")
    return rasgos


def cmd_personas(args):
    personas = Datos(args.datos).leer_personas()
    if not personas:
        print("No hay nadie registrado.")
    for nombre, rasgos in sorted(personas.items()):
        print(f"{nombre}  ({len(rasgos)} muestras)")


def cmd_borrar(args):
    datos = Datos(args.datos)
    personas = datos.leer_personas()
    if personas.pop(args.nombre, None) is None:
        sys.exit(f"'{args.nombre}' no está registrado.")
    datos.guardar_personas(personas)
    print(f"Borrada la plantilla de '{args.nombre}'. Sus eventos anteriores quedan en eventos.csv.")


def cmd_reconocer(args):
    datos, motor = Datos(args.datos), Motor()
    galeria = Galeria(datos.leer_personas())
    if not galeria.nombres:
        print("Aviso: no hay nadie registrado; todo va a salir como no identificado.")
    cap, es_archivo = abrir_fuente(args.fuente)
    if not cap.isOpened():
        sys.exit(f"No se pudo abrir la fuente '{args.fuente}'.")

    seguidor, sentido = Seguidor(), args.sentido
    ultimo_evento = {}
    eventos = datos.leer_eventos()
    proceso = psutil.Process()
    proceso.cpu_percent(None)
    inicio_real = time.time()
    cuadros, fps, marca_fps, marca_medicion, marca_purga = 0, 0.0, time.time(), time.time(), 0.0
    resumen = Counter()
    ventana = "Salidas de produccion (s salida / e entrada / q sale)"

    def anotar(paso, persona, sim):
        hora = datetime.now()
        datos.anotar_evento(hora, args.puerta, sentido, persona, sim, "camara")
        eventos.append({"hora": hora.isoformat(timespec="seconds"), "puerta": args.puerta,
                        "sentido": sentido, "persona": persona, "similitud": f"{sim:.3f}", "origen": "camara"})
        if persona == NO_IDENTIFICADO and paso.recorte is not None:
            datos.guardar_pendiente(hora, args.puerta, sentido, paso.recorte)
        resumen[persona] += 1
        print(f"{hora:%H:%M:%S}  {sentido:<7}  {persona}  ({sim:.2f})")

    try:
        while True:
            ok, img = cap.read()
            if not ok:
                break
            ahora = time.time()
            # Con un archivo de video el reloj es el del video, para que los tiempos tengan sentido.
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 if es_archivo else ahora - inicio_real

            for cara in motor.detectar(img):
                paso = seguidor.asignar(cara[:4].copy(), t)
                sirve, motivo, alineada, nitidez = motor.calidad(img, cara)
                paso.motivo = motivo
                paso.ofrecer_recorte(recorte_con_margen(img, cara), float(cara[14]) + (1.0 if sirve else 0.0))
                if sirve and paso.decidido is None:
                    nombre, sim = galeria.identificar(motor.rasgo(alineada))
                    if paso.votar(nombre, sim):
                        clave = (paso.decidido, sentido)
                        if ahora - ultimo_evento.get(clave, 0) > ESPERA_REPETIDO_SEG:
                            anotar(paso, paso.decidido, paso.similitud)
                            ultimo_evento[clave] = ahora
                if not args.sin_ventana:
                    _dibujar_paso(img, paso)

            for paso in seguidor.cerrar_viejos(t):
                if paso.decidido is None and paso.detecciones >= CUADROS_MIN_PASO:
                    anotar(paso, NO_IDENTIFICADO, paso.mejor_sim)

            cuadros += 1
            if ahora - marca_fps >= 1:
                fps, cuadros, marca_fps = cuadros / (ahora - marca_fps), 0, ahora
            if ahora - marca_medicion >= MEDIR_CADA_SEG:
                datos.anotar_medicion(_medicion(proceso, fps))
                marca_medicion = ahora
            if ahora - marca_purga >= 60:
                datos.purgar_pendientes(ahora)
                marca_purga = ahora
            if args.segundos and ahora - inicio_real >= args.segundos:
                break

            if not args.sin_ventana:
                memoria = proceso.memory_info().rss / 2**20
                lineas = [(f"Puerta: {args.puerta}  |  Sentido: {sentido.upper()}", BLANCO),
                          (f"{fps:4.1f} cuadros/s  |  RAM del programa {memoria:.0f} MB", GRIS),
                          ("Fuera ahora:", BLANCO)]
                ahora_dt = datetime.now()
                afuera = fuera_ahora(eventos, ahora_dt)
                for persona, desde in afuera[:6]:
                    minutos = int((ahora_dt - desde).total_seconds() // 60)
                    lineas.append((f"  {persona}: {minutos} min (desde {desde:%H:%M})", VERDE))
                if not afuera:
                    lineas.append(("  nadie", GRIS))
                _panel(img, lineas)
                cv2.imshow(ventana, img)
                tecla = cv2.waitKey(1) & 0xFF
                if tecla == ord("q"):
                    break
                if tecla in (ord("s"), ord("e")):
                    sentido = "salida" if tecla == ord("s") else "entrada"
    finally:
        cap.release()
        cv2.destroyAllWindows()
        datos.anotar_medicion(_medicion(proceso, fps))

    print("\nResumen de esta corrida:")
    for persona, veces in resumen.most_common():
        print(f"  {persona}: {veces}")
    if not resumen:
        print("  sin eventos")


def _dibujar_paso(img, paso):
    x, y, w, h = [int(v) for v in paso.caja]
    if paso.decidido:
        color, texto = VERDE, f"{paso.decidido} {paso.similitud:.2f}"
    elif paso.motivo:
        color, texto = GRIS, f"cara {paso.motivo}"
    else:
        color, texto = GRIS, "evaluando..."
    cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
    _texto(img, texto, (x, max(14, y - 8)), color)


def _medicion(proceso, fps):
    ram = psutil.virtual_memory()
    return {
        "hora": datetime.now().isoformat(timespec="seconds"),
        "cuadros_s": f"{fps:.1f}",
        "cpu_programa_pct": f"{proceso.cpu_percent(None) / psutil.cpu_count():.1f}",
        "ram_programa_mb": f"{proceso.memory_info().rss / 2**20:.0f}",
        "ram_sistema_pct": f"{ram.percent:.0f}",
        "ram_libre_mb": f"{ram.available / 2**20:.0f}",
    }


def cmd_revisar(args):
    datos = Datos(args.datos)
    datos.purgar_pendientes()
    archivos = sorted(datos.pendientes.glob("*.enc"))
    if not archivos:
        print("No hay pasos sin identificar para revisar.")
        return
    nombres = sorted(datos.leer_personas())
    print("Personas:")
    for i, n in enumerate(nombres, 1):
        print(f"  {i}. {n}")
    print("Para cada paso: número = es esa persona · d = descartar · Enter = dejar para después\n")
    for archivo in archivos:
        hora, puerta, sentido = leer_clave_pendiente(archivo)
        img = datos.leer_pendiente(archivo)
        cv2.imshow("Paso sin identificar", cv2.resize(img, None, fx=2, fy=2))
        cv2.waitKey(300)
        respuesta = input(f"{hora:%d/%m %H:%M:%S}  {puerta}  {sentido}: ").strip().lower()
        if respuesta == "d":
            archivo.unlink()
        elif respuesta.isdigit() and 1 <= int(respuesta) <= len(nombres):
            datos.anotar_evento(hora, puerta, sentido, nombres[int(respuesta) - 1], 0.0, "revision")
            archivo.unlink()
    cv2.destroyAllWindows()


def cmd_informe(args):
    datos = Datos(args.datos)
    eventos = datos.leer_eventos()
    desde = datetime.strptime(args.desde, "%Y-%m-%d").date() if args.desde else None
    hasta = datetime.strptime(args.hasta, "%Y-%m-%d").date() if args.hasta else None
    filas = calcular_tiempos(eventos)
    seleccion = sorted((k, v) for k, v in filas.items()
                       if (not desde or k[1] >= desde) and (not hasta or k[1] <= hasta))

    sin_id = Counter(datetime.fromisoformat(e["hora"]).date() for e in eventos_resueltos(eventos)
                     if e["persona"] == NO_IDENTIFICADO)
    if not seleccion and not sin_id:
        print("No hay eventos en ese período.")
        return

    salida_csv = datos.dir / "informe.csv"
    with salida_csv.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["dia", "persona", "salidas", "minutos_fuera", "sin_regreso", "fuera_desde"])
        print(f"{'Día':<11}{'Persona':<26}{'Salidas':>8}{'Min. fuera':>12}{'Sin regreso':>13}")
        for (persona, dia), f_ in seleccion:
            desde_txt = f_["fuera_desde"].strftime("%H:%M") if f_["fuera_desde"] else ""
            print(f"{dia:%d/%m/%Y} {persona:<26}{f_['salidas']:>8}{f_['minutos']:>12.0f}{f_['sin_regreso']:>13}"
                  + (f"   fuera desde {desde_txt}" if desde_txt else ""))
            w.writerow([dia.isoformat(), persona, f_["salidas"], f"{f_['minutos']:.0f}".replace(".", ","),
                        f_["sin_regreso"], desde_txt])
    for dia, veces in sorted(sin_id.items()):
        if (not desde or dia >= desde) and (not hasta or dia <= hasta):
            print(f"{dia:%d/%m/%Y} pasos sin identificar: {veces}")
    print(f"\nGuardado en {salida_csv}")


def main(argv=None):
    p = argparse.ArgumentParser(description="Prueba de reconocimiento facial para salidas de producción.")
    p.add_argument("--datos", default=str(BASE / "datos"), help="carpeta de datos (por defecto ./datos)")
    sub = p.add_subparsers(dest="comando", required=True)

    sub.add_parser("modelos", help="baja y verifica los modelos YuNet y SFace").set_defaults(fn=cmd_modelos)

    r = sub.add_parser("registrar", help="registra a una persona (con su consentimiento)")
    r.add_argument("nombre")
    r.add_argument("--fuente", default="0", help="0 = cámara de la notebook, o una URL rtsp://")
    r.add_argument("--desde-fotos", help="carpeta con 3 a 8 fotos de la persona, en lugar de la cámara")
    r.add_argument("--reemplazar", action="store_true")
    r.set_defaults(fn=cmd_registrar)

    sub.add_parser("personas", help="lista las personas registradas").set_defaults(fn=cmd_personas)

    b = sub.add_parser("borrar", help="borra la plantilla de una persona")
    b.add_argument("nombre")
    b.set_defaults(fn=cmd_borrar)

    c = sub.add_parser("reconocer", help="mira una cámara y anota salidas o entradas")
    c.add_argument("--fuente", default="0", help="0 = cámara de la notebook, una URL rtsp:// o un video")
    c.add_argument("--puerta", default="lateral")
    c.add_argument("--sentido", choices=["salida", "entrada"], default="salida")
    c.add_argument("--sin-ventana", action="store_true", help="no muestra la imagen (para dejarlo fijo)")
    c.add_argument("--segundos", type=float, default=0, help="cortar solo después de N segundos")
    c.set_defaults(fn=cmd_reconocer)

    sub.add_parser("revisar", help="asigna o descarta los pasos sin identificar").set_defaults(fn=cmd_revisar)

    i = sub.add_parser("informe", help="tiempo fuera por persona y por día")
    i.add_argument("--desde", help="AAAA-MM-DD")
    i.add_argument("--hasta", help="AAAA-MM-DD")
    i.set_defaults(fn=cmd_informe)

    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
