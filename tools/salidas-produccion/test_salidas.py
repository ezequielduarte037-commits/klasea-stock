"""Pruebas de la lógica sin cámara: python test_salidas.py"""
import tempfile
from datetime import datetime
from pathlib import Path

import numpy as np

import salidas as s


def _unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


def _vecino(base, ruido, rng):
    return _unit(base + rng.normal(0, ruido, base.shape))


def test_galeria():
    rng = np.random.default_rng(1)
    ana, beto = _unit(rng.normal(size=128)), _unit(rng.normal(size=128))
    g = s.Galeria({"Ana": [_vecino(ana, 0.02, rng).tolist()], "Beto": [_vecino(beto, 0.02, rng).tolist()]})
    assert g.identificar(_vecino(ana, 0.03, rng))[0] == "Ana"
    assert g.identificar(_vecino(beto, 0.03, rng))[0] == "Beto"
    desconocido = _unit(rng.normal(size=128))
    assert g.identificar(desconocido)[0] is None, "un desconocido no tiene que tomar un nombre"
    # A mitad de camino entre los dos: no alcanza el margen, mejor no decidir.
    assert g.identificar(_unit(ana + beto))[0] is None
    assert s.Galeria({}).identificar(ana) == (None, 0.0)


def test_votos():
    p = s.Paso([0, 0, 10, 10], 0.0)
    assert p.votar("Ana", 0.6) is None
    assert p.votar(None, 0.3) is None
    assert p.votar("Ana", 0.62) is None
    assert p.votar("Ana", 0.7) == "Ana"
    assert abs(p.similitud - 0.7) < 1e-9
    q = s.Paso([0, 0, 10, 10], 0.0)
    for nombre in ["Ana", "Beto", "Ana", "Beto", None]:
        q.votar(nombre, 0.5)
    assert q.decidido is None, "votos repartidos no deciden"


def test_seguidor():
    seg = s.Seguidor()
    a = seg.asignar([100, 100, 80, 80], 0.0)
    b = seg.asignar([400, 100, 80, 80], 0.0)
    assert a is not b
    assert seg.asignar([105, 102, 80, 80], 0.1) is a
    assert seg.asignar([398, 99, 80, 80], 0.1) is b
    cerrados = seg.cerrar_viejos(0.1 + s.PERDIDO_SEG + 0.01)
    assert set(cerrados) == {a, b} and not seg.pasos


def _ev(hora, sentido, persona="Ana", origen="camara"):
    return {"hora": hora, "puerta": "lateral", "sentido": sentido, "persona": persona,
            "similitud": "0.6", "origen": origen}


def test_tiempos():
    eventos = [
        _ev("2026-10-22T09:00:00", "salida"), _ev("2026-10-22T09:12:00", "entrada"),
        _ev("2026-10-22T11:00:00", "salida"), _ev("2026-10-22T11:05:30", "entrada"),
        _ev("2026-10-22T15:00:00", "salida"),                        # sigue fuera
        _ev("2026-10-21T10:00:00", "salida"),                        # ayer, nunca volvió
        _ev("2026-10-22T10:00:00", "entrada", "Beto"),               # entrada sin salida: se ignora
    ]
    ahora = datetime(2026, 10, 22, 15, 20)
    filas = s.calcular_tiempos(eventos, ahora)
    hoy = filas[("Ana", ahora.date())]
    assert hoy["salidas"] == 3 and round(hoy["minutos"], 1) == 17.5
    assert hoy["fuera_desde"] == datetime(2026, 10, 22, 15, 0)
    assert filas[("Ana", datetime(2026, 10, 21).date())]["sin_regreso"] == 1
    assert ("Beto", ahora.date()) not in filas
    assert s.fuera_ahora(eventos, ahora) == [("Ana", datetime(2026, 10, 22, 15, 0))]


def test_revision_reemplaza_no_identificado():
    eventos = [
        _ev("2026-10-22T09:00:00", "salida", s.NO_IDENTIFICADO),
        _ev("2026-10-22T09:00:00", "salida", "Ana", "revision"),
        _ev("2026-10-22T09:10:00", "entrada"),
    ]
    assert len(s.eventos_resueltos(eventos)) == 2
    fila = s.calcular_tiempos(eventos, datetime(2026, 10, 22, 12))[("Ana", datetime(2026, 10, 22).date())]
    assert fila["minutos"] == 10


def test_datos_encriptados():
    with tempfile.TemporaryDirectory() as tmp:
        d = s.Datos(tmp)
        d.guardar_personas({"Ana": [[0.1, 0.2]]})
        crudo = (Path(tmp) / "personas.enc").read_bytes()
        assert b"Ana" not in crudo, "las plantillas no pueden quedar en texto plano"
        assert s.Datos(tmp).leer_personas() == {"Ana": [[0.1, 0.2]]}

        img = np.full((60, 40, 3), 200, np.uint8)
        archivo = d.guardar_pendiente(datetime(2026, 10, 22, 9, 30), "lateral", "salida", img)
        assert archivo.read_bytes()[:3] != b"\xff\xd8\xff", "el recorte no puede quedar como JPEG legible"
        assert d.leer_pendiente(archivo).shape == img.shape
        assert s.leer_clave_pendiente(archivo) == (datetime(2026, 10, 22, 9, 30), "lateral", "salida")
        assert d.purgar_pendientes(ahora=archivo.stat().st_mtime + 47 * 3600) == 0
        assert d.purgar_pendientes(ahora=archivo.stat().st_mtime + 49 * 3600) == 1


if __name__ == "__main__":
    pruebas = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for prueba in pruebas:
        prueba()
        print(f"ok  {prueba.__name__}")
    print(f"{len(pruebas)} pruebas bien")
