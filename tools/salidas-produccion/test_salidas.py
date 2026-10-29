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


def test_fichada_cierra_salida():
    eventos = [
        _ev("2026-10-22T06:50:00", "fichada", "Ana Paz", "fichero") | {"dni": "30111222"},   # entrada al turno: no cierra nada
        _ev("2026-10-22T10:00:00", "salida", "Ana Paz") | {"dni": "30111222"},
        _ev("2026-10-22T10:25:00", "fichada", "Ana Paz", "fichero") | {"dni": "30111222"},   # volvió por la principal
        _ev("2026-10-22T13:00:00", "salida", "Ana Paz") | {"dni": "30111222"},
        _ev("2026-10-22T13:08:00", "entrada", "Ana Paz") | {"dni": "30111222"},              # la cámara gana a la fichada
        _ev("2026-10-22T16:00:00", "fichada", "Ana Paz", "fichero") | {"dni": "30111222"},
        _ev("2026-10-21T15:00:00", "salida", "Ana Paz") | {"dni": "30111222"},               # ayer, sin regreso
    ]
    filas = s.calcular_tiempos(eventos, datetime(2026, 10, 22, 17))
    hoy = filas[("30111222", datetime(2026, 10, 22).date())]
    assert hoy["salidas"] == 2 and hoy["minutos"] == 33 and hoy["por_fichero"] == 1
    assert hoy["fuera_desde"] is None and hoy["nombre"] == "Ana Paz"
    ayer = filas[("30111222", datetime(2026, 10, 21).date())]
    assert ayer["sin_regreso"] == 1 and ayer["minutos"] == 0, "una fichada de otro día no cierra la salida"


def test_eventos_de_fichadas():
    rrhh = {"empleados": [{"dni": "30111222", "nombre": "Ana Paz"}],
            "fichadas": [{"dni": "30111222", "fecha": "2026-10-22", "sede": "Chubut",
                          "fichadas": ["06:52", "06:53", "7:40", "16:00", "basura"]},
                         {"dni": "30111222", "fecha": "2026-10-21", "sede": "Pampa", "fichadas": ["07:00"]}]}
    eventos = s.eventos_de_fichadas(rrhh)
    assert [e["hora"] for e in eventos if e["hora"].startswith("2026-10-22")] == \
        ["2026-10-22T06:52:00", "2026-10-22T07:40:00", "2026-10-22T16:00:00"], "la doble fichada cuenta una vez"
    assert all(e["persona"] == "Ana Paz" and e["sentido"] == "fichada" for e in eventos)
    anterior, s.SEDE_FICHERO = s.SEDE_FICHERO, "Chubut"
    try:
        assert {e["hora"][:10] for e in s.eventos_de_fichadas(rrhh)} == {"2026-10-22"}
    finally:
        s.SEDE_FICHERO = anterior


def test_buscar_empleados():
    empleados = [{"dni": "30111222", "nombre": "PAZ, Ana Matías"}, {"dni": "28999000", "nombre": "Gómez Luis"}]
    assert s.buscar_empleados(empleados, "matias paz") == [empleados[0]]
    assert s.buscar_empleados(empleados, "GOMEZ") == [empleados[1]]
    assert s.buscar_empleados(empleados, "2899") == [empleados[1]]
    assert s.buscar_empleados(empleados, "nadie") == []


def test_personas_formato_viejo():
    p = s.normalizar_personas({"Ezequiel": [[0.1]], "30111222": {"nombre": "Ana", "dni": "30111222", "rasgos": [[0.2]]}})
    assert p["Ezequiel"] == {"nombre": "Ezequiel", "dni": "", "rasgos": [[0.1]]}
    assert p["30111222"]["nombre"] == "Ana"


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
        ana = {"30111222": {"nombre": "Ana", "dni": "30111222", "rasgos": [[0.1, 0.2]]}}
        d.guardar_personas(ana)
        crudo = (Path(tmp) / "personas.enc").read_bytes()
        assert b"Ana" not in crudo, "las plantillas no pueden quedar en texto plano"
        assert s.Datos(tmp).leer_personas() == ana

        img = np.full((60, 40, 3), 200, np.uint8)
        archivo = d.guardar_pendiente(datetime(2026, 10, 22, 9, 30), "lateral", "salida", img)
        assert archivo.read_bytes()[:3] != b"\xff\xd8\xff", "el recorte no puede quedar como JPEG legible"
        assert d.leer_pendiente(archivo).shape == img.shape
        assert s.leer_clave_pendiente(archivo) == (datetime(2026, 10, 22, 9, 30), "lateral", "salida")
        assert d.purgar_pendientes(ahora=archivo.stat().st_mtime + 47 * 3600) == 0
        assert d.purgar_pendientes(ahora=archivo.stat().st_mtime + 49 * 3600) == 1

        d.guardar_rrhh({"sincronizado": "2026-10-22T10:00:00", "empleados": [{"dni": "30111222"}]})
        assert b"30111222" not in (Path(tmp) / "rrhh.enc").read_bytes()
        assert d.leer_rrhh()["empleados"] == [{"dni": "30111222"}]


def test_vincular_registro_viejo():
    import builtins
    from types import SimpleNamespace
    with tempfile.TemporaryDirectory() as tmp:
        d = s.Datos(tmp)
        d.guardar_personas({"Ezequiel": [[0.1, 0.2]]})                 # formato de la primera versión
        d.guardar_rrhh({"sincronizado": datetime.now().isoformat(timespec="seconds"),
                        "empleados": [{"dni": "35000111", "nombre": "DUARTE Ezequiel"}], "fichadas": []})
        d.anotar_evento(datetime(2026, 10, 22, 9, 0), "lateral", "salida", "Ezequiel", 0.6, "camara")
        respuestas = iter(["s"])
        original, builtins.input = builtins.input, lambda _="": next(respuestas)
        try:
            s.cmd_vincular(SimpleNamespace(datos=tmp, quien=None))
        finally:
            builtins.input = original
        personas = d.leer_personas()
        assert list(personas) == ["35000111"] and personas["35000111"]["rasgos"] == [[0.1, 0.2]]
        assert d.leer_eventos()[0]["dni"] == "35000111"
        assert d.leer_eventos()[0]["persona"] == "DUARTE Ezequiel"


def test_eventos_viejos_ganan_columna_dni():
    with tempfile.TemporaryDirectory() as tmp:
        d = s.Datos(tmp)
        d.eventos_f.write_text("hora,puerta,sentido,persona,similitud,origen\n"
                               "2026-10-22T09:00:00,lateral,salida,Ezequiel,0.600,camara\n", encoding="utf-8")
        d.anotar_evento(datetime(2026, 10, 22, 9, 5), "lateral", "entrada", "Ana", 0.7, "camara", "30111222")
        eventos = d.leer_eventos()
        assert [e["dni"] for e in eventos] == ["", "30111222"]
        assert eventos[0]["persona"] == "Ezequiel"


if __name__ == "__main__":
    pruebas = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for prueba in pruebas:
        prueba()
        print(f"ok  {prueba.__name__}")
    print(f"{len(pruebas)} pruebas bien")
