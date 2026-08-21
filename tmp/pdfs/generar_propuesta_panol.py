from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "propuesta_integracion_panol_compras.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#102A43")
BLUE = colors.HexColor("#1769AA")
CYAN = colors.HexColor("#36A9E1")
PALE = colors.HexColor("#EAF4FB")
INK = colors.HexColor("#243B53")
MUTED = colors.HexColor("#627D98")
LINE = colors.HexColor("#CBD5E1")
WHITE = colors.white
GREEN = colors.HexColor("#11845B")
AMBER = colors.HexColor("#C77B00")
RED = colors.HexColor("#C2413B")

font_dir = Path("C:/Windows/Fonts")
regular = font_dir / "arial.ttf"
bold = font_dir / "arialbd.ttf"
if regular.exists() and bold.exists():
    pdfmetrics.registerFont(TTFont("KlaseSans", str(regular)))
    pdfmetrics.registerFont(TTFont("KlaseSans-Bold", str(bold)))
    FONT, FONT_BOLD = "KlaseSans", "KlaseSans-Bold"
else:
    FONT, FONT_BOLD = "Helvetica", "Helvetica-Bold"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", fontName=FONT_BOLD, fontSize=27, leading=31,
    textColor=WHITE, alignment=TA_LEFT, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName=FONT, fontSize=12.5, leading=18,
    textColor=colors.HexColor("#D9ECF7"), alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="H1x", fontName=FONT_BOLD, fontSize=19, leading=23,
    textColor=NAVY, spaceAfter=9, spaceBefore=3,
))
styles.add(ParagraphStyle(
    name="H2x", fontName=FONT_BOLD, fontSize=12.5, leading=16,
    textColor=BLUE, spaceAfter=5, spaceBefore=10,
))
styles.add(ParagraphStyle(
    name="Bodyx", fontName=FONT, fontSize=9.4, leading=13.4,
    textColor=INK, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Smallx", fontName=FONT, fontSize=7.8, leading=10.2,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Callout", fontName=FONT_BOLD, fontSize=12, leading=17,
    textColor=NAVY, leftIndent=6, rightIndent=6,
))
styles.add(ParagraphStyle(
    name="Cell", fontName=FONT, fontSize=7.4, leading=9.4, textColor=INK,
))
styles.add(ParagraphStyle(
    name="CellBold", fontName=FONT_BOLD, fontSize=7.4, leading=9.4, textColor=INK,
))
styles.add(ParagraphStyle(
    name="WhiteCell", fontName=FONT_BOLD, fontSize=7.6, leading=9.4, textColor=WHITE,
))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"<font color='#1769AA'>●</font>&nbsp;&nbsp;{text}", styles["Bodyx"])


def on_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 12 * mm, w, 12 * mm, fill=1, stroke=0)
    canvas.setFont(FONT_BOLD, 8)
    canvas.setFillColor(WHITE)
    canvas.drawString(16 * mm, h - 7.6 * mm, "KLASE A  |  PROPUESTA OPERATIVA")
    canvas.setStrokeColor(LINE)
    canvas.line(16 * mm, 13 * mm, w - 16 * mm, 13 * mm)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 8.5 * mm, "Integración Pañol + Compras")
    canvas.drawRightString(w - 16 * mm, 8.5 * mm, f"Página {doc.page}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.circle(w + 15 * mm, h - 35 * mm, 75 * mm, fill=1, stroke=0)
    canvas.setFillColor(CYAN)
    canvas.circle(w - 10 * mm, h - 15 * mm, 34 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#0B1F33"))
    canvas.rect(0, 0, w, 34 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawString(20 * mm, h - 25 * mm, "KLASE A")
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.HexColor("#B9D8EA"))
    canvas.drawString(20 * mm, h - 31 * mm, "ASTILLERO · GESTIÓN DE MATERIALES")
    canvas.setFont(FONT, 8)
    canvas.drawString(20 * mm, 19 * mm, "Documento de trabajo · Agosto 2026")
    canvas.restoreState()


def page_decor(canvas, doc):
    if doc.page == 1:
        cover(canvas, doc)
    else:
        on_page(canvas, doc)


doc = BaseDocTemplate(
    str(OUT), pagesize=A4,
    leftMargin=16 * mm, rightMargin=16 * mm,
    topMargin=20 * mm, bottomMargin=18 * mm,
    title="Propuesta de Integración Pañol y Compras",
    author="Klase A",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="document", frames=frame, onPage=page_decor)])

story = []

# Cover
story += [Spacer(1, 78 * mm), P("PROPUESTA DE<br/>INTEGRACIÓN OPERATIVA", "CoverTitle"),
          Spacer(1, 5 * mm), P("Pañol + Compras", "CoverTitle"),
          Spacer(1, 8 * mm), P("Un nuevo modelo para validar necesidades, anticipar materiales, ordenar prioridades y convertir al pañol en el centro operativo de la gestión de abastecimiento.", "CoverSub"),
          PageBreak()]

# Executive summary
story += [P("1. Resumen ejecutivo", "H1x")]
callout = Table([[P("El pañol deja de ser solamente un punto de recepción y entrega: pasa a ser el centro de validación, planificación y control del ciclo completo de materiales.", "Callout")]], colWidths=[doc.width])
callout.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 1, CYAN),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
]))
story += [callout, Spacer(1, 7 * mm), P("Objetivo", "H2x"),
          P("Integrar Pañol y Compras para que toda necesidad de material llegue validada, completa y priorizada antes de iniciar una compra. El resultado buscado es reducir urgencias evitables, compras duplicadas, errores de especificación, tiempos muertos y diferencias de inventario."),
          P("Resultados esperados", "H2x")]
for text in [
    "Solicitudes completas y técnicamente claras desde el primer envío.",
    "Mayor utilización del stock existente y de materiales equivalentes.",
    "Recepciones anticipadas, organizadas y con responsables asignados.",
    "Menos compras urgentes y mejor consolidación de pedidos.",
    "Responsabilidades, reemplazos y autorizaciones claramente definidos.",
    "Decisiones apoyadas en prioridades e indicadores, no solamente en urgencias percibidas.",
]: story.append(bullet(text))
story += [Spacer(1, 4 * mm), P("Principio de implementación", "H2x"),
          P("La integración debe sumar control sin transformar al pañol en un nuevo cuello de botella. Para lograrlo se establecen niveles de prioridad, responsables alternativos, tiempos de respuesta y un canal de excepción para emergencias reales."), PageBreak()]

# Workflow
story += [P("2. Nuevo circuito de materiales", "H1x"),
          P("Toda solicitud pasa por Pañol antes de llegar a Compras. Pañol valida la necesidad operativa y Compras conserva la responsabilidad comercial: cotización, negociación, orden de compra y seguimiento del proveedor."), Spacer(1, 3 * mm)]
steps = [
    ("1", "SOLICITUD", "Sector solicitante informa material, cantidad, obra, fecha y motivo."),
    ("2", "VALIDACIÓN", "Pañol revisa stock, reservas, equivalentes, unidad, cantidad y prioridad."),
    ("3", "RESOLUCIÓN", "Si hay stock se reserva y entrega; si falta, se envía una solicitud validada."),
    ("4", "COMPRA", "Compras cotiza, consolida necesidades, obtiene aprobación y emite la orden."),
    ("5", "RECEPCIÓN", "Pañol recibe aviso anticipado, asigna responsable, controla e ingresa."),
    ("6", "ENTREGA", "Se distribuye al destino y queda trazabilidad de consumo, obra y responsable."),
]
data = []
for n, title, desc in steps:
    data.append([P(n, "WhiteCell"), P(title, "CellBold"), P(desc, "Cell")])
t = Table(data, colWidths=[12 * mm, 32 * mm, doc.width - 44 * mm], repeatRows=0)
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), BLUE), ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), .35, LINE),
    ("ROWBACKGROUNDS", (1, 0), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [t, Spacer(1, 6 * mm), P("Datos obligatorios de una solicitud", "H2x")]
reqs = [
    ["Descripción y código", "Cantidad y unidad", "Obra o sector"],
    ["Fecha de necesidad", "Responsable solicitante", "Prioridad justificada"],
    ["Especificación técnica", "Alternativa aceptable", "Adjuntos o referencia"],
]
rt = Table([[P(x, "Cell") for x in row] for row in reqs], colWidths=[doc.width / 3] * 3)
rt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE), ("GRID", (0, 0), (-1, -1), .5, WHITE),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [rt, Spacer(1, 6 * mm), P("Control interno mínimo", "H2x"),
          P("Pañol valida necesidad y recepción; Compras gestiona proveedor y orden; el solicitante confirma la necesidad técnica; y la aprobación se asigna según monto o criticidad. Se evita que una sola persona solicite, apruebe, compre y confirme la recepción sin un control adicional."), PageBreak()]

# Planning
story += [P("3. Sistema de planificación", "H1x")]
planning = [
    [P("FRECUENCIA", "WhiteCell"), P("PROPÓSITO", "WhiteCell"), P("CONTENIDO Y RESULTADO", "WhiteCell")],
    [P("DIARIA", "CellBold"), P("Organizar la operación del día", "Cell"), P("Recepciones previstas; responsables y reemplazos; entregas a producción; solicitudes nuevas; urgencias; conteos y mejoras. Duración objetivo: 10-15 minutos. Resultado: tablero diario asignado.", "Cell")],
    [P("SEMANAL", "CellBold"), P("Cerrar pendientes y anticipar", "Cell"), P("Viernes: pendientes, necesidades de las próximas dos semanas, demoras, diferencias de stock, errores de información, tiempos perdidos y mejoras. Resultado: acciones con responsable y fecha.", "Cell")],
    [P("MENSUAL", "CellBold"), P("Medir y corregir el sistema", "Cell"), P("Objetivos, compras urgentes, exactitud de inventario, cumplimiento de proveedores, capital inmovilizado, material sin movimiento y desvíos por obra. Resultado: metas del mes siguiente.", "Cell")],
]
pt = Table(planning, colWidths=[26 * mm, 46 * mm, doc.width - 72 * mm], repeatRows=1)
pt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), .45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story += [pt, Spacer(1, 7 * mm), P("Guardia operativa", "H2x"),
          P("Cada día debe existir al menos una persona disponible para entregas, consultas, urgencias e imprevistos. No debe quedar todo el equipo comprometido simultáneamente con recepciones extensas o conteos físicos."),
          P("Formato obligatorio para las acciones", "H2x")]
action = Table([[P("PROBLEMA", "WhiteCell"), P("ACCIÓN", "WhiteCell"), P("RESPONSABLE", "WhiteCell"), P("FECHA", "WhiteCell"), P("ESTADO", "WhiteCell")],
                [P("Perfiles recibidos sin obra", "Cell"), P("Hacer obligatorio el destino en la OC", "Cell"), P("Compras", "Cell"), P("Viernes", "Cell"), P("Pendiente", "Cell")]],
               colWidths=[38 * mm, 57 * mm, 30 * mm, 22 * mm, 25 * mm])
action.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE), ("GRID", (0, 0), (-1, -1), .45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [action, PageBreak()]

# Priorities and roles
story += [P("4. Prioridades, roles y reemplazos", "H1x"), P("Matriz de prioridades", "H2x")]
priorities = [
    [P("NIVEL", "WhiteCell"), P("CRITERIO", "WhiteCell"), P("TRATAMIENTO", "WhiteCell")],
    [P("P1 · CRÍTICA", "CellBold"), P("Detiene producción, seguridad o una entrega comprometida.", "Cell"), P("Atención inmediata y análisis posterior de causa.", "Cell")],
    [P("P2 · ALTA", "CellBold"), P("Puede detener una tarea dentro de 24-48 horas.", "Cell"), P("Resolución prioritaria y seguimiento diario.", "Cell")],
    [P("P3 · PLANIFICADA", "CellBold"), P("Necesaria durante la semana o etapa programada.", "Cell"), P("Consolidación y compra programada.", "Cell")],
    [P("P4 · MEJORA", "CellBold"), P("Reposición preventiva, orden o mejora de proceso.", "Cell"), P("Se agenda sin desplazar tareas productivas.", "Cell")],
]
pr = Table(priorities, colWidths=[36 * mm, 70 * mm, doc.width - 106 * mm], repeatRows=1)
pr.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), .45, LINE),
    ("BACKGROUND", (0, 1), (0, 1), colors.HexColor("#FCE8E6")),
    ("BACKGROUND", (0, 2), (0, 2), colors.HexColor("#FFF3D6")),
    ("BACKGROUND", (0, 3), (0, 3), colors.HexColor("#E8F3FB")),
    ("BACKGROUND", (0, 4), (0, 4), colors.HexColor("#E7F6EF")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [pr, Spacer(1, 6 * mm), P("Matriz de responsabilidades", "H2x")]
roles = [
    [P("PROCESO", "WhiteCell"), P("TITULAR", "WhiteCell"), P("REEMPLAZO", "WhiteCell"), P("APROBACIÓN", "WhiteCell")],
    [P("Validar solicitudes", "Cell"), P("Encargado de Pañol", "Cell"), P("Segundo responsable", "Cell"), P("Jefatura ante excepción", "Cell")],
    [P("Recepcionar materiales", "Cell"), P("Responsable asignado", "Cell"), P("Guardia operativa", "Cell"), P("No aplica", "Cell")],
    [P("Ajustar stock", "Cell"), P("Encargado autorizado", "Cell"), P("Segundo responsable", "Cell"), P("Responsable definido", "Cell")],
    [P("Emitir compras", "Cell"), P("Comprador", "Cell"), P("Reemplazo Compras", "Cell"), P("Según monto", "Cell")],
    [P("Reclamar proveedor", "Cell"), P("Comprador", "Cell"), P("Encargado de Pañol", "Cell"), P("No aplica", "Cell")],
]
rr = Table(roles, colWidths=[48 * mm, 44 * mm, 44 * mm, doc.width - 136 * mm], repeatRows=1)
rr.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE), ("GRID", (0, 0), (-1, -1), .4, LINE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [rr, Spacer(1, 6 * mm), P("Regla operativa", "H2x"),
          P("Cada proceso debe tener titular, reemplazo y criterio de intervención excepcional. Además de quién lo realiza, debe documentarse qué significa completarlo correctamente."), PageBreak()]

# KPIs + reception
story += [P("5. Recepción, control e indicadores", "H1x"), P("Aviso anticipado de recepción", "H2x"),
          P("Compras informa a Pañol antes de cada entrega: proveedor, orden, material, cantidad, fecha probable, obra o destino, descarga especial, controles técnicos, certificados y contacto. Pañol asigna responsable y reemplazo antes del arribo."),
          P("Control en la recepción", "H2x")]
for text in [
    "Coincidencia contra la orden de compra y remito.",
    "Cantidad, estado, medidas y especificación.",
    "Certificados o documentación requerida.",
    "Obra, ubicación y destino interno.",
    "Registro fotográfico ante diferencias o daños.",
    "Rechazo parcial o total documentado cuando corresponda.",
]: story.append(bullet(text))
story += [P("Indicadores iniciales", "H2x")]
kpis = [
    [P("INDICADOR", "WhiteCell"), P("QUÉ PERMITE VER", "WhiteCell")],
    [P("Solicitudes completas al primer envío", "CellBold"), P("Calidad de información y madurez del circuito.", "Cell")],
    [P("Porcentaje de compras urgentes", "CellBold"), P("Nivel real de planificación y recurrencia de incendios.", "Cell")],
    [P("Tiempo solicitud → compra", "CellBold"), P("Velocidad del proceso y puntos de espera.", "Cell")],
    [P("Exactitud de inventario", "CellBold"), P("Confiabilidad del stock físico frente al sistema.", "Cell")],
    [P("Entregas de proveedores en fecha", "CellBold"), P("Cumplimiento y riesgo de abastecimiento.", "Cell")],
    [P("Diferencias o rechazos en recepción", "CellBold"), P("Calidad de compra, proveedor y control de ingreso.", "Cell")],
]
kt = Table(kpis, colWidths=[76 * mm, doc.width - 76 * mm], repeatRows=1)
kt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), .4, LINE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [kt, Spacer(1, 6 * mm), P("Aprendizaje de urgencias", "H2x"),
          P("Toda urgencia debe resolverse, pero también clasificarse: imprevisible, solicitud tardía, mala planificación, stock mínimo incorrecto, error de inventario, demora del proveedor, error de compra o cambio técnico. El objetivo no es eliminar la excepción, sino impedir que se repita sin aprendizaje."), PageBreak()]

# Implementation
story += [P("6. Implementación por etapas", "H1x"),
          P("La transformación se implementa gradualmente para incorporar disciplina sin frenar la operación."), Spacer(1, 4 * mm)]
phases = [
    ("01", "ORDENAR", "Semanas 1-2", "Definir responsables, reemplazos, prioridades y datos obligatorios. Centralizar solicitudes y avisos de recepción."),
    ("02", "PLANIFICAR", "Semanas 3-4", "Iniciar reunión diaria y semanal. Publicar tablero de tareas, recepciones, urgencias y pendientes."),
    ("03", "MEDIR", "Mes 2", "Registrar seis indicadores, causas de urgencia, diferencias de recepción y exactitud de inventario."),
    ("04", "ANTICIPAR", "Mes 3", "Definir stocks mínimos, puntos de reposición, consumos, materiales críticos y alertas por obra."),
    ("05", "MEJORAR", "Continuo", "Automatizar controles, revisar resultados mensuales y eliminar causas recurrentes de pérdida de tiempo."),
]
phase_rows = []
for num, name, time, desc in phases:
    phase_rows.append([P(num, "WhiteCell"), P(f"{name}<br/><font color='#627D98'>{time}</font>", "CellBold"), P(desc, "Cell")])
ph = Table(phase_rows, colWidths=[14 * mm, 44 * mm, doc.width - 58 * mm])
ph.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), BLUE), ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ("GRID", (0, 0), (-1, -1), .4, LINE), ("ROWBACKGROUNDS", (1, 0), (-1, -1), [WHITE, colors.HexColor("#F7FAFC")]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story += [ph, Spacer(1, 8 * mm), P("Criterios de éxito", "H2x")]
for text in [
    "Pañol puede rechazar o devolver solicitudes incompletas sin generar conflictos personales.",
    "Las urgencias reales tienen vía rápida, pero quedan registradas y se revisan.",
    "Las reuniones terminan con decisiones, responsables y fechas.",
    "Los datos del sistema reflejan el movimiento físico del material.",
    "Compras recibe necesidades consolidadas y puede concentrarse en negociar y abastecer.",
]: story.append(bullet(text))
story += [Spacer(1, 5 * mm)]
final_box = Table([[P("Resultado final", "H2x"), P("Un circuito integrado de necesidad, validación, planificación, compra, recepción, stock, entrega y análisis; orientado a anticiparse y mejorar continuamente.", "Bodyx")]], colWidths=[40 * mm, doc.width - 40 * mm])
final_box.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), 1, CYAN),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story.append(final_box)

doc.build(story)
print(OUT)
