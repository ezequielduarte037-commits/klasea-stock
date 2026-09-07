import os
import re
import sys

sys.path.insert(0, r"C:\klasea-stock\tmp\pydeps")
import psycopg2
from psycopg2.extras import RealDictCursor


def load_env(path):
    values = {}
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


env = load_env(r"C:\klasea-stock\.env.audit.local")
conn = psycopg2.connect(
    host=env["KLASEA_AUDIT_DB_HOST"],
    port=env.get("KLASEA_AUDIT_DB_PORT", "5432"),
    dbname=env["KLASEA_AUDIT_DB_NAME"],
    user=env["KLASEA_AUDIT_DB_USER"],
    password=env["KLASEA_AUDIT_DB_PASSWORD"],
    sslmode=env.get("KLASEA_AUDIT_DB_SSLMODE", "require"),
    connect_timeout=12,
)
conn.set_session(readonly=True, autocommit=True)


def query(label, sql, params=None):
    print(f"\n## {label}")
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params or ())
        for row in cur.fetchall():
            clean = {k: v for k, v in dict(row).items() if "password" not in k.lower() and "secret" not in k.lower()}
            print(clean)


tables = [
    "laminacion_materiales",
    "linea_plantillas",
    "linea_plantilla_items",
    "laminacion_obras",
    "laminacion_obra_materiales",
    "laminacion_movimientos",
    "materiales",
    "movimientos",
    "produccion_obras",
]
query(
    "columnas",
    """
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = any(%s)
    order by table_name, ordinal_position
    """,
    (tables,),
)

query(
    "plantillas laminacion vigentes K37/K52/K55",
    """
    select lp.linea, lp.nombre as plantilla, lp.activa, lpi.cantidad,
           lm.nombre as material, lm.categoria, lm.unidad
    from public.linea_plantillas lp
    join public.linea_plantilla_items lpi on lpi.plantilla_id = lp.id
    join public.laminacion_materiales lm on lm.id = lpi.material_id
    where upper(lp.linea) in ('K37','K52','K55')
    order by lp.linea, lp.activa desc, lp.nombre, lm.categoria, lm.nombre
    """,
)

query(
    "catalogo maderas candidato",
    """
    select id, nombre, unidad_medida
    from public.materiales
    where lower(nombre) ~ '(terci|carpinter|fibro|okum|lenga|roble|ebano|ébano)'
    order by lower(nombre)
    """,
)

query(
    "obras produccion activas K52/K55",
    """
    select id, codigo, linea, estado
    from public.produccion_obras
    where upper(coalesce(linea,'')) in ('K52','K55')
       or upper(coalesce(codigo,'')) ~ '^(K?52|K?55)'
    order by codigo
    """,
)

query(
    "obras laminacion",
    """
    select id, nombre, plantilla_id, estado, sede
    from public.laminacion_obras
    order by created_at desc nulls last
    limit 100
    """,
)

query(
    "destinos recientes laminacion",
    """
    select tipo, destino, obra, count(*) as cantidad_movimientos
    from public.laminacion_movimientos
    where tipo = 'egreso'
    group by tipo, destino, obra
    order by count(*) desc
    limit 80
    """,
)

query(
    "destinos recientes maderas",
    """
    select tipo, destino, obra, count(*) as cantidad_movimientos
    from public.movimientos
    where tipo = 'egreso'
      and (coalesce(destino,'') <> '' or coalesce(obra,'') <> '')
    group by tipo, destino, obra
    order by count(*) desc
    limit 80
    """,
)

conn.close()
