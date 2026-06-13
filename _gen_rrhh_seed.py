# -*- coding: utf-8 -*-
# Generador de seed SQL para el módulo RRHH (uso único, se borra después).
import pandas as pd, re, sys

OUT = r"D:\proyectos\klasea-stock\_rrhh_seed.sql"

def clean(s):
    if not isinstance(s, str): return None
    s = re.sub(r"\s+", " ", s).strip()
    return s or None

def fixname(s):
    if not s: return s
    s = s.replace("� n", "ñ")
    s = re.sub(r"�(?=n\b)", "ó", s)   # Ram?n -> Ramón
    s = s.replace("�", "ñ")            # resto -> ñ (Ludueña, Ibañez...)
    return s

def esc(s):
    return s.replace("'", "''")

# ── Jefes ──────────────────────────────────────────────────────────────
xl = pd.read_excel(r"D:\Descargas 2\contratistas.xlsx", sheet_name=None, header=None)
jefes = []  # (nombre, dni, celular)
for _, r in xl["DNI y CELULAR CONTRATISTA"].iterrows():
    nombre, dni, cel = clean(r[1]), r[2], r[4]
    if nombre and pd.notna(dni) and nombre.upper() != "NOMBRE":
        try: dni = str(int(float(dni)))
        except: continue
        cel = str(int(float(cel))) if pd.notna(cel) else None
        jefes.append((fixname(nombre.title()), dni, cel))

jefes_by_dni = {d: d for _, d, _ in jefes}
jefes_by_ape = {}
for n, d, _ in jefes:
    ape = n.split()[0].upper()
    jefes_by_ape.setdefault(ape, []).append(d)

# ── Bloques de empleados por contratista ──────────────────────────────
df = xl["CONTRATISTAS Y EMPLEADOS DNI"]
rows = []
for _, r in df.iterrows():
    nombre, dni = clean(r[0]), r[1]
    ok = nombre is not None and pd.notna(dni)
    if ok:
        try: dni = str(int(float(str(dni).replace(".", ""))))
        except: ok = False
    rows.append((fixname(nombre), dni) if ok else None)

blocks, cur = [], []
for item in rows:
    if item: cur.append(item)
    elif cur: blocks.append(cur); cur = []
if cur: blocks.append(cur)

# asignación: DNI del head > apellido único del head > sin asignar
worker_jefe = {}   # dni -> jefe_dni or None
worker_name = {}
sin_asignar_blocks = []
for b in blocks:
    hn, hd = b[0]
    jefe = None
    if hd in jefes_by_dni:
        jefe = hd
    else:
        ape = hn.split()[0].upper()
        cand = jefes_by_ape.get(ape, [])
        if len(cand) == 1: jefe = cand[0]
    members = b if jefe is None or hd not in jefes_by_dni else b[1:]
    if jefe is None: sin_asignar_blocks.append(hn)
    for n, d in members:
        if d in jefes_by_dni: continue
        worker_jefe[d] = jefe
        worker_name[d] = n

# ── Hikvision: enrolados ──────────────────────────────────────────────
hik = pd.read_excel(r"D:\Descargas 2\AllReport_0.xls", sheet_name="Attendance Summary", header=None)
hik_emps = {}
for _, r in hik.iloc[6:].iterrows():
    if pd.notna(r[0]) and pd.notna(r[1]):
        hik_emps[str(r[0]).strip()] = fixname(re.sub(r"\s+", " ", str(r[1])).strip())

# ── SQL ────────────────────────────────────────────────────────────────
L = []
L.append("-- ============ SEED RRHH (generado de contratistas.xlsx + AllReport_0.xls) ============")
L.append("-- Contratistas (jefes)")
L.append("insert into rrhh_contratistas (nombre, dni, celular) values")
vals = [f"  ('{esc(n)}', '{d}', {('NULL' if not c else chr(39)+c+chr(39))})" for n, d, c in jefes]
L.append(",\n".join(vals))
L.append("on conflict (dni) do nothing;")
L.append("")

def emp_insert(label, items):
    if not items: return
    L.append(f"-- {label} ({len(items)})")
    L.append("insert into rrhh_empleados (dni, nombre, grupo, contratista_id, ficha) values")
    vv = []
    for dni, nombre, grupo, jefe_dni, ficha in items:
        cid = f"(select id from rrhh_contratistas where dni = '{jefe_dni}')" if jefe_dni else "NULL"
        vv.append(f"  ('{dni}', '{esc(nombre)}', '{grupo}', {cid}, {str(ficha).lower()})")
    L.append(",\n".join(vv))
    L.append("on conflict (dni) do nothing;")
    L.append("")

hik_dnis = set(hik_emps)
worker_dnis = set(worker_jefe)

# 1) contratistas que fichan (en ambos) + jefes que fichan (a su propio grupo)
items = []
for d in sorted(hik_dnis & worker_dnis, key=lambda x: hik_emps[x]):
    items.append((d, hik_emps[d], "contratista", worker_jefe[d], True))
for d in sorted(hik_dnis & set(jefes_by_dni), key=lambda x: hik_emps[x]):
    items.append((d, hik_emps[d], "contratista", d, True))
emp_insert("Contratistas que FICHAN (cruzados Hikvision <-> lista)", items)

# 2) gente de la casa (solo Hikvision, y que no es jefe)
items = []
for d in sorted(hik_dnis - worker_dnis - set(jefes_by_dni), key=lambda x: hik_emps[x]):
    items.append((d, hik_emps[d], "casa", None, True))
emp_insert("Gente de la CASA (en fichero, no en lista de contratistas) - REVISAR con David", items)

# 3) contratistas que NO fichan (solo lista) -> ficha=false (ignorados en informes)
items = []
for d in sorted(worker_dnis - hik_dnis, key=lambda x: worker_name[x]):
    items.append((d, worker_name[d], "contratista", worker_jefe[d], False))
emp_insert("Contratistas que NO fichan (ficha=false, ignorados por ahora)", items)

sql = "\n".join(L)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(sql)

n_sin = sum(1 for v in worker_jefe.values() if v is None)
print(f"OK -> {OUT}")
print(f"jefes={len(jefes)}  contratistas_fichan={len(hik_dnis & worker_dnis)}  casa={len(hik_dnis - worker_dnis)}  no_fichan={len(worker_dnis - hik_dnis)}")
print(f"empleados sin contratista asignado (David valida): {n_sin}")
print("bloques ambiguos:", ", ".join(sin_asignar_blocks))
print("chars SQL:", len(sql))
