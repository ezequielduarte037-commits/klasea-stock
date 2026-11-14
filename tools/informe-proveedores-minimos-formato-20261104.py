# Versión con formato y gráficos del informe de proveedores y mínimos (04/11/2026).
# Lee el JSON que deja informe-proveedores-minimos-20261104.mjs.
#   python tools/informe-proveedores-minimos-formato-20261104.py datos.json salida.xlsx
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import DataPoint
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

# Colores de la marca (sin ámbar ni amarillo).
NAVY = "0B1F3A"
BLUE = "2563EB"
CYAN = "0891B2"
TEAL = "0D9488"
GREEN = "16A34A"
RED = "DC2626"
VIOLET = "7C3AED"
GRIS = "64748B"
CLARO = {BLUE: "DBEAFE", CYAN: "CFFAFE", TEAL: "CCFBF1", GREEN: "DCFCE7", RED: "FEE2E2", VIOLET: "EDE9FE"}
FUENTE = "Calibri"

entrada, salida = sys.argv[1], sys.argv[2]
d = json.load(open(entrada, encoding="utf8"))
generado = datetime.fromisoformat(d["generado"].replace("Z", "+00:00")).astimezone().replace(tzinfo=None)


def fill(c):
    return PatternFill("solid", start_color=c, end_color=c)


def local(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().replace(tzinfo=None)


def fecha_dmy(s):
    return datetime.strptime(s, "%d/%m/%Y") if s else None


wb = Workbook()

# ───────────────────────── hojas de datos ─────────────────────────


def hoja_tabla(nombre, titulo, subtitulo, columnas, filas, nombre_tabla, estilo="TableStyleMedium2"):
    """columnas: [(encabezado, ancho, formato|None, alineación|None)]"""
    ws = wb.create_sheet(nombre)
    ws.sheet_view.showGridLines = False
    n = len(columnas)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n)
    ws["A1"] = titulo
    ws["A1"].font = Font(name=FUENTE, size=15, bold=True, color="FFFFFF")
    ws["A1"].fill = fill(NAVY)
    ws["A1"].alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[1].height = 30
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=n)
    ws["A2"] = subtitulo
    ws["A2"].font = Font(name=FUENTE, size=10, italic=True, color=GRIS)
    ws["A2"].alignment = Alignment(indent=1)
    ws.row_dimensions[2].height = 20
    fila0 = 4
    for j, (enc, ancho, _, _) in enumerate(columnas, 1):
        c = ws.cell(row=fila0, column=j, value=enc)
        c.font = Font(name=FUENTE, bold=True, color="FFFFFF")
        c.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = ancho
    ws.row_dimensions[fila0].height = 32
    for i, valores in enumerate(filas, fila0 + 1):
        for j, ((_, _, fmt, al), v) in enumerate(zip(columnas, valores), 1):
            c = ws.cell(row=i, column=j, value=v if v != "" else None)
            c.font = Font(name=FUENTE, size=10)
            c.alignment = Alignment(vertical="center", horizontal=al)
            if fmt:
                c.number_format = fmt
    ultima = fila0 + max(len(filas), 1)
    ref = f"A{fila0}:{get_column_letter(n)}{ultima}"
    t = Table(displayName=nombre_tabla, ref=ref)
    t.tableStyleInfo = TableStyleInfo(name=estilo, showRowStripes=True)
    ws.add_table(t)
    ws.freeze_panes = ws.cell(row=fila0 + 1, column=1)
    return ws, fila0, ultima


def pintar_por_valor(ws, col, desde, hasta, colores, n_cols):
    """Colorea la celda (texto y fondo) según su valor exacto."""
    letra = get_column_letter(col)
    for valor, color in colores.items():
        ws.conditional_formatting.add(
            f"{letra}{desde}:{letra}{hasta}",
            FormulaRule(formula=[f'${letra}{desde}="{valor}"'], fill=fill(CLARO[color]), font=Font(color=color, bold=True)),
        )


# Proveedores de noviembre / historial
COLS_PROV = [
    ("Fecha", 16, "dd/mm/yyyy hh:mm", "left"),
    ("Quién", 14, None, None),
    ("Tipo", 11, None, "center"),
    ("Código", 11, None, None),
    ("Descripción", 52, None, None),
    ("Rubro", 22, None, None),
    ("Proveedor anterior", 22, None, None),
    ("Proveedor nuevo", 22, None, None),
    ("Proveedor hoy", 18, None, None),
    ("En la lista estándar", 20, None, None),
]


def filas_prov(arr):
    return [[local(r["_iso"]), r["Quién"], r["Tipo"], r["Código"], r["Descripción"], r["Rubro"],
             r["Proveedor anterior"], r["Proveedor nuevo"], r["Proveedor hoy"], r["En la lista estándar"]] for r in arr]


def hoja_prov(nombre, titulo, sub, arr, tabla):
    ws, f0, fin = hoja_tabla(nombre, titulo, sub, COLS_PROV, filas_prov(arr), tabla)
    pintar_por_valor(ws, 3, f0 + 1, fin, {"Agregado": GREEN, "Cambiado": BLUE, "Quitado": RED}, len(COLS_PROV))
    for i in range(f0 + 1, fin + 1):
        ws.cell(row=i, column=8).font = Font(name=FUENTE, size=10, bold=True)
        if ws.cell(row=i, column=9).value == "(igual)":
            ws.cell(row=i, column=9).font = Font(name=FUENTE, size=10, color="94A3B8", italic=True)
    return ws


desde_txt = datetime.strptime(d["desdeReciente"], "%Y-%m-%d").strftime("%d/%m/%Y")
hoja_prov("Proveedores noviembre", "Proveedores cargados en noviembre",
          f"Cambios del proveedor en el catálogo desde el {desde_txt}. «Proveedor hoy» dice si después se volvió a tocar.",
          d["recientes"], "ProveedoresNoviembre")

# Sin proveedor
COLS_SIN = [
    ("Código", 11, None, None),
    ("Descripción", 50, None, None),
    ("Rubro", 24, None, None),
    ("Unidad", 9, None, None),
    ("Líneas (cant. por barco)", 22, None, None),
    ("Obras activas que lo llevan", 13, "0", "center"),
    ("Ficha genérica", 11, None, "center"),
    ("Precio USD", 11, '"USD" #,##0', None),
    ("Stock libre", 10, "General", "center"),
]
ws_sin, f0, fin = hoja_tabla(
    "Sin proveedor", "Lista estándar sin proveedor",
    "Ítems de la matriz K37, K52 y K55 sin proveedor (sin laminación, maderas ni consumibles). "
    "«Ficha genérica»: el producto concreto se elige en cada obra.",
    COLS_SIN,
    [[r["Código"], r["Descripción"], r["Rubro"], r["Unidad"], r["Líneas (cant. por barco)"], r["Obras activas que lo llevan"],
      r["Ficha genérica (el producto se elige por obra)"], r["Precio USD"], r["Stock libre"]] for r in d["sinProveedor"]],
    "SinProveedor", estilo="TableStyleMedium3",
)
# Barra de datos en "obras activas": cuánto apura conseguirle proveedor.
from openpyxl.formatting.rule import DataBarRule  # noqa: E402

ws_sin.conditional_formatting.add(f"F{f0 + 1}:F{fin}", DataBarRule(start_type="num", start_value=0, end_type="max", color="F87171"))

# Mínimos
COLS_MIN = [
    ("Tipo", 11, None, None),
    ("Código", 11, None, None),
    ("Descripción", 50, None, None),
    ("Rubro", 22, None, None),
    ("Unidad", 9, None, None),
    ("Mínimo", 9, "General", "center"),
    ("Stock libre", 10, "General", "center"),
    ("Reponer", 9, None, "center"),
    ("Para llegar al mínimo", 11, "General", "center"),
    ("Proveedor", 20, None, None),
    ("Precio USD", 11, '"USD" #,##0', None),
    ("Quién lo cargó", 14, None, None),
    ("Cómo", 20, None, None),
    ("Fecha", 11, "dd/mm/yyyy", "center"),
]
mins = sorted(d["minimos"], key=lambda r: (r["Tipo"] != "De barco", r["Reponer"] != "Sí", r["Rubro"], r["Descripción"]))
ws_min, f0, fin = hoja_tabla(
    "Mínimos cargados", "Mínimos de stock cargados",
    "Todo lo que tiene stock mínimo mayor a 0. «Reponer»: el stock libre está en el mínimo o por debajo. "
    "Lo de barco que va asignado a cada obra no tiene mínimo: avisa en «Falta para obras».",
    COLS_MIN,
    [[r["Tipo"], r["Código"], r["Descripción"], r["Rubro"], r["Unidad"], r["Mínimo"], r["Stock libre"], r["Reponer"],
      r["Para llegar al mínimo"], r["Proveedor"], r["Precio USD"], r["Quién lo cargó"], r["Cómo"], fecha_dmy(r["Fecha"])] for r in mins],
    "MinimosCargados", estilo="TableStyleMedium9",
)
ws_min.conditional_formatting.add(
    f"A{f0 + 1}:N{fin}",
    FormulaRule(formula=[f'$H{f0 + 1}="Sí"'], fill=fill("FEF2F2")),
)
pintar_por_valor(ws_min, 8, f0 + 1, fin, {"Sí": RED}, len(COLS_MIN))
for i in range(f0 + 1, fin + 1):
    ws_min.cell(row=i, column=6).font = Font(name=FUENTE, size=10, bold=True)
    if (ws_min.cell(row=i, column=9).value or 0) > 0:
        ws_min.cell(row=i, column=9).font = Font(name=FUENTE, size=10, bold=True, color=RED)

hoja_prov("Proveedores historial", "Historial de proveedores",
          "Todos los cambios del proveedor en el catálogo desde que hay registro (julio 2026).",
          d["cambios"], "ProveedoresHistorial")

# ───────────────────────── datos para gráficos ─────────────────────────
wd = wb.create_sheet("Datos de gráficos")
wd.sheet_view.showGridLines = False
wd.column_dimensions["A"].width = 30
for col in "BCDEFGH":
    wd.column_dimensions[col].width = 14


def bloque(fila, titulo, encabezados, filas):
    wd.cell(row=fila, column=1, value=titulo).font = Font(name=FUENTE, bold=True, size=12, color=NAVY)
    for j, e in enumerate(encabezados, 1):
        c = wd.cell(row=fila + 1, column=j, value=e)
        c.font = Font(name=FUENTE, bold=True, color="FFFFFF")
        c.fill = fill(NAVY)
    for i, r in enumerate(filas, fila + 2):
        for j, v in enumerate(r, 1):
            wd.cell(row=i, column=j, value=v).font = Font(name=FUENTE, size=10)
    return fila + 1, fila + 1 + len(filas)  # fila de encabezado, última fila


# 1. Proveedores cargados en noviembre, por proveedor (de menor a mayor: en la
#    barra horizontal el mayor queda arriba).
por_prov = sorted(Counter(r["Proveedor nuevo"] for r in d["recientes"]).items(), key=lambda x: (x[1], x[0]))
h1, u1 = bloque(1, "Proveedores cargados en noviembre", ["Proveedor", "Ítems"], por_prov)
f = u1 + 3
# 2. Sin proveedor por rubro
por_rubro = sorted(Counter(r["Rubro"] or "Sin rubro" for r in d["sinProveedor"]).items(), key=lambda x: (x[1], x[0]))
h2, u2 = bloque(f, "Lista estándar sin proveedor, por rubro", ["Rubro", "Ítems"], por_rubro)
f = u2 + 3
# 3. Mínimos de barco: reponer vs con stock
barco = [r for r in d["minimos"] if r["Tipo"] == "De barco"]
rep = sum(1 for r in barco if r["Reponer"] == "Sí")
h3, u3 = bloque(f, "Mínimos de barco: estado hoy", ["Estado", "Ítems"], [["Para reponer", rep], ["Con stock", len(barco) - rep]])
f = u3 + 3
# 4. Mínimos de barco por rubro, apilado
rub = defaultdict(lambda: [0, 0])
for r in barco:
    rub[r["Rubro"] or "Sin rubro"][0 if r["Reponer"] == "Sí" else 1] += 1
rub_filas = sorted(([k, v[0], v[1]] for k, v in rub.items()), key=lambda x: (x[1] + x[2], x[0]))
h4, u4 = bloque(f, "Mínimos de barco por rubro", ["Rubro", "Para reponer", "Con stock"], rub_filas)
f = u4 + 3
# 5. Proveedores agregados por semana (historial)
sem = Counter()
for r in d["cambios"]:
    dt = local(r["_iso"])
    lunes = dt.date().toordinal() - dt.weekday()
    sem[lunes] += 1
sem_filas = [[datetime.fromordinal(k).strftime("%d/%m"), v] for k, v in sorted(sem.items())]
h5, u5 = bloque(f, "Cambios de proveedor por semana (lunes)", ["Semana", "Cambios"], sem_filas)

# ───────────────────────── resumen ─────────────────────────
ws = wb.active
ws.title = "Resumen"
wb.move_sheet("Resumen", offset=-wb.index(ws))
ws.sheet_view.showGridLines = False
for j in range(1, 16):
    ws.column_dimensions[get_column_letter(j)].width = 11
ws.column_dimensions["A"].width = 2
ws.merge_cells("B1:M1")
ws["B1"] = "Pañol · Proveedores y mínimos de stock"
ws["B1"].font = Font(name=FUENTE, size=20, bold=True, color="FFFFFF")
for j in range(1, 14):
    ws.cell(row=1, column=j).fill = fill(NAVY)
    ws.cell(row=2, column=j).fill = fill(NAVY)
ws["B1"].alignment = Alignment(vertical="center")
ws.row_dimensions[1].height = 40
ws.merge_cells("B2:M2")
ws["B2"] = f"Datos al {generado:%d/%m/%Y %H:%M}"
ws["B2"].font = Font(name=FUENTE, size=11, color="BFDBFE")
ws.row_dimensions[2].height = 22

sin_rubro_top = max(Counter(r["Rubro"] for r in d["sinProveedor"]).items(), key=lambda x: x[1])
quien_rec = Counter(r["Quién"] for r in d["recientes"]).most_common(1)[0]
tarjetas = [
    ("PROVEEDORES CARGADOS", len(d["recientes"]), f"en noviembre · {quien_rec[1]} por {quien_rec[0]}", BLUE),
    ("SIN PROVEEDOR", len(d["sinProveedor"]), f"en la lista estándar · {sin_rubro_top[1]} de {sin_rubro_top[0]}", RED),
    ("MÍNIMOS DE BARCO", len(barco), "cargados por ezequiel.adm", TEAL),
    ("PARA REPONER HOY", rep, f"de {len(barco)} con mínimo", VIOLET),
]
borde = Side(style="thin", color="E2E8F0")
for k, (lab, val, nota, color) in enumerate(tarjetas):
    c0 = [2, 5, 8, 11][k]
    c1 = c0 + 2
    for fila, (texto, fuente, alto) in enumerate([
        (lab, Font(name=FUENTE, size=9, bold=True, color=GRIS), 20),
        (val, Font(name=FUENTE, size=28, bold=True, color=color), 44),
        (nota, Font(name=FUENTE, size=9, color=GRIS), 30),
    ], start=4):
        ws.merge_cells(start_row=fila, start_column=c0, end_row=fila, end_column=c1)
        cel = ws.cell(row=fila, column=c0, value=texto)
        cel.font = fuente
        cel.alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
        ws.row_dimensions[fila].height = alto
        for cc in range(c0, c1 + 1):
            x = ws.cell(row=fila, column=cc)
            x.fill = fill(CLARO[color])
            x.border = Border(
                top=Side(style="thick", color=color) if fila == 4 else None,
                bottom=borde if fila == 6 else None,
                left=Side(style="thick", color=color) if cc == c0 else None,
                right=borde if cc == c1 else None,
            )

ws["B8"] = "Las tablas completas están en las otras hojas; se pueden filtrar y ordenar desde el encabezado."
ws["B8"].font = Font(name=FUENTE, size=9, italic=True, color=GRIS)


def etiquetas(posicion=None):
    dl = DataLabelList()
    dl.showVal = True
    dl.showSerName = False
    dl.showCatName = False
    dl.showLegendKey = False
    dl.showPercent = False
    if posicion:
        dl.position = posicion
    return dl


def estilo_grafico(ch, titulo, alto=9.5, ancho=17):
    ch.title = titulo
    ch.title.overlay = False
    ch.height = alto
    ch.width = ancho
    ch.legend = None
    ch.style = 2
    return ch


def barras(titulo, hdr, ult, color, horizontal=True, alto=9.5):
    ch = BarChart()
    ch.type = "bar" if horizontal else "col"
    estilo_grafico(ch, titulo, alto=alto)
    datos = Reference(wd, min_col=2, min_row=hdr, max_row=ult)
    cats = Reference(wd, min_col=1, min_row=hdr + 1, max_row=ult)
    ch.add_data(datos, titles_from_data=True)
    ch.set_categories(cats)
    s = ch.series[0]
    s.graphicalProperties.solidFill = color
    s.graphicalProperties.line.solidFill = color
    ch.gapWidth = 40
    ch.dataLabels = etiquetas("outEnd")
    ch.y_axis.majorGridlines = None
    ch.y_axis.delete = True
    ch.x_axis.delete = False
    # Aire a la derecha para que entre la etiqueta de la barra más larga.
    tope = max((wd.cell(row=i, column=2).value or 0) for i in range(hdr + 1, ult + 1))
    ch.y_axis.scaling.min = 0
    ch.y_axis.scaling.max = round(tope * 1.15 + 1)
    return ch


g1 = barras("Proveedores cargados en noviembre", h1, u1, BLUE, alto=11)
ws.add_chart(g1, "B10")
g2 = barras("Lista estándar sin proveedor, por rubro", h2, u2, RED, alto=11)
ws.add_chart(g2, "I10")

g3 = DoughnutChart()
estilo_grafico(g3, "Mínimos de barco: estado hoy", alto=9.5, ancho=12)
g3.add_data(Reference(wd, min_col=2, min_row=h3, max_row=u3), titles_from_data=True)
g3.set_categories(Reference(wd, min_col=1, min_row=h3 + 1, max_row=u3))
g3.holeSize = 55
for idx, color in enumerate([RED, TEAL]):
    pt = DataPoint(idx=idx)
    pt.graphicalProperties.solidFill = color
    pt.graphicalProperties.line.solidFill = "FFFFFF"
    g3.series[0].dPt.append(pt)
g3.dataLabels = etiquetas()
from openpyxl.chart.legend import Legend  # noqa: E402

g3.legend = Legend()
g3.legend.position = "b"
ws.add_chart(g3, "B33")

g4 = BarChart()
g4.type = "bar"
g4.grouping = "stacked"
g4.overlap = 100
estilo_grafico(g4, "Mínimos de barco por rubro", alto=9.5, ancho=21)
g4.add_data(Reference(wd, min_col=2, max_col=3, min_row=h4, max_row=u4), titles_from_data=True)
g4.set_categories(Reference(wd, min_col=1, min_row=h4 + 1, max_row=u4))
for s, color in zip(g4.series, [RED, TEAL]):
    s.graphicalProperties.solidFill = color
    s.graphicalProperties.line.solidFill = color
g4.gapWidth = 40
g4.legend = Legend()
g4.legend.position = "b"
g4.y_axis.majorGridlines = None
g4.x_axis.delete = False
g4.y_axis.delete = True
ws.add_chart(g4, "G33")

g5 = barras("Cambios de proveedor por semana", h5, u5, CYAN, horizontal=False, alto=8)
g5.width = 33
ws.add_chart(g5, "B53")

wb.save(salida)
print("ok", salida)
