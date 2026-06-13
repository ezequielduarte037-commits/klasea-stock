# -*- coding: utf-8 -*-
"""
Genera el PDF "Plan de Implementacion — Sistema de Gestion Integral Klase A"
Ejecutar: python gen_plan_panol.py
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Flowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase.pdfmetrics import stringWidth


def draw_tracked(canvas, cx, y, text, font, size, tracking):
    """Texto centrado con letter-spacing (tracking) manual."""
    canvas.setFont(font, size)
    widths = [stringWidth(ch, font, size) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        canvas.drawString(x, y, ch)
        x += w + tracking

# ─── Colores ───────────────────────────────────────────────────────────────
NAVY    = colors.HexColor("#1a3a5c")
GREEN   = colors.HexColor("#1a4a2a")
RED     = colors.HexColor("#7a1a1a")
GOLD    = colors.HexColor("#c9a227")
GRAY    = colors.HexColor("#555555")
LGRAY   = colors.HexColor("#888888")
BG_BLUE = colors.HexColor("#eef3f8")
BG_GRN  = colors.HexColor("#eef5ee")
BG_RED  = colors.HexColor("#f8eeee")
BG_YELL = colors.HexColor("#fffaeb")
WHITE   = colors.white
BLACK   = colors.HexColor("#1a1a1a")
BORDER  = colors.HexColor("#d0d0d0")

W, H = A4
MARGIN = 20*mm
CW = W - 2*MARGIN  # content width

# ─── Estilos ───────────────────────────────────────────────────────────────
S = {
    "section_title": ParagraphStyle("section_title",
        fontName="Helvetica-Bold", fontSize=14, textColor=NAVY,
        spaceBefore=8, spaceAfter=4, leading=18),
    "module_title": ParagraphStyle("module_title",
        fontName="Helvetica-Bold", fontSize=11, textColor=NAVY,
        spaceBefore=8, spaceAfter=4, leading=15),
    "body": ParagraphStyle("body",
        fontName="Helvetica", fontSize=10, textColor=BLACK,
        spaceAfter=4, leading=14),
    "body_sm": ParagraphStyle("body_sm",
        fontName="Helvetica", fontSize=9, textColor=GRAY,
        spaceAfter=2, leading=13),
    "check": ParagraphStyle("check",
        fontName="Helvetica", fontSize=10, textColor=BLACK,
        spaceAfter=3, leading=14, leftIndent=6),
    "check_sub": ParagraphStyle("check_sub",
        fontName="Helvetica-Oblique", fontSize=9, textColor=GRAY,
        spaceAfter=2, leading=13, leftIndent=22),
    "sat_title": ParagraphStyle("sat_title",
        fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, leading=15),
    "warn": ParagraphStyle("warn",
        fontName="Helvetica", fontSize=10, textColor=RED,
        spaceAfter=3, leading=14, leftIndent=6),
    "table_hdr": ParagraphStyle("table_hdr",
        fontName="Helvetica-Bold", fontSize=9, textColor=WHITE,
        alignment=TA_LEFT, leading=12),
    "table_cell": ParagraphStyle("table_cell",
        fontName="Helvetica", fontSize=9, textColor=BLACK, leading=13),
    "check_glyph": ParagraphStyle("check_glyph",
        fontName="Helvetica", fontSize=11, alignment=TA_CENTER, leading=12),
}

# ─── Marcas vectoriales (se ven igual en cualquier visor / impresora) ──────
class CheckBox(Flowable):
    """Casillero vacío para tildar a mano."""
    def __init__(self, size=10, color=colors.HexColor("#8a8a8a")):
        Flowable.__init__(self); self.size = size; self.color = color
        self.width = size; self.height = size
    def wrap(self, *a): return (self.width, self.height)
    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color); c.setLineWidth(0.9)
        c.roundRect(0, 0, self.size, self.size, 1.6, stroke=1, fill=0)

class Check(Flowable):
    """Tilde (check) dibujada."""
    def __init__(self, size=11, color=GREEN):
        Flowable.__init__(self); self.size = size; self.color = color
        self.width = size; self.height = size
    def wrap(self, *a): return (self.width, self.height)
    def draw(self):
        c = self.canv; s = self.size
        c.setStrokeColor(self.color); c.setLineWidth(max(1.3, s*0.17))
        c.setLineCap(1); c.setLineJoin(1)
        p = c.beginPath(); p.moveTo(s*0.12, s*0.50); p.lineTo(s*0.40, s*0.20); p.lineTo(s*0.90, s*0.80)
        c.drawPath(p, stroke=1, fill=0)

class Cross(Flowable):
    """Cruz (X) dibujada."""
    def __init__(self, size=10, color=RED):
        Flowable.__init__(self); self.size = size; self.color = color
        self.width = size; self.height = size
    def wrap(self, *a): return (self.width, self.height)
    def draw(self):
        c = self.canv; s = self.size
        c.setStrokeColor(self.color); c.setLineWidth(max(1.3, s*0.17)); c.setLineCap(1)
        c.line(s*0.18, s*0.18, s*0.82, s*0.82)
        c.line(s*0.18, s*0.82, s*0.82, s*0.18)

def checklist(items, accent=None, bg=colors.HexColor("#fafafa")):
    """Tabla de ítems con casillero vacío para tildar a mano."""
    rows = [[CheckBox(10), Paragraph(it, S["check"])] for it in items]
    t = Table(rows, colWidths=[24, CW - 24])
    style = [
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("LEFTPADDING", (0,0), (0,-1), 12), ("RIGHTPADDING", (0,0), (0,-1), 0),
        ("LEFTPADDING", (1,0), (1,-1), 4), ("RIGHTPADDING", (1,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (0,-1), 5), ("TOPPADDING", (1,0), (1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]
    if accent:
        style.append(("LINEBEFORE", (0,0), (0,-1), 2.5, accent))
    t.setStyle(TableStyle(style))
    return t

# ─── Portada (dibujada en el canvas) ───────────────────────────────────────
def on_cover(canvas, doc):
    canvas.saveState()
    logo_path = r"D:\proyectos\klasea-stock\src\assets\logos\logo-k-cover.png"

    canvas.setFillColor(WHITE)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)

    # Banda superior simple
    band_h = 92
    canvas.setFillColor(NAVY)
    canvas.rect(0, H - band_h, W, band_h, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, H - band_h - 2, W, 2, fill=1, stroke=0)

    # Logo principal
    logo_size = 54 * mm
    logo_y = 510
    try:
        canvas.drawImage(logo_path, (W - logo_size) / 2, logo_y,
                         logo_size, logo_size, mask="auto")
    except Exception:
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 64)
        canvas.drawCentredString(W/2, logo_y + 50, "K")

    # Título principal
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 28)
    canvas.drawCentredString(W/2, 430, "Plan de Implementación")
    canvas.setFillColor(GRAY)
    canvas.setFont("Helvetica", 15)
    canvas.drawCentredString(W/2, 402, "Sistema de Gestión Integral Klase A")

    # Acento inferior
    canvas.setFillColor(GOLD)
    canvas.rect(W/2 - 34, 377, 68, 2, fill=1, stroke=0)
    canvas.restoreState()

# ─── Header / Footer de paginas de contenido ───────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    n = doc.page - 1  # la portada no cuenta
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, H - 14*mm, W - MARGIN, H - 14*mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(LGRAY)
    canvas.drawString(MARGIN, H - 11*mm, "Klase A  ·  Sistema de Gestión Integral")
    canvas.drawRightString(W - MARGIN, H - 11*mm, "Plan de Implementación")
    canvas.line(MARGIN, 12*mm, W - MARGIN, 12*mm)
    canvas.drawCentredString(W/2, 8*mm, f"Página {n}  ·  Documento interno — Confidencial")
    canvas.restoreState()

# ─── Helpers ───────────────────────────────────────────────────────────────
def hr(color=BORDER, thickness=0.5, sb=2, sa=8):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceAfter=sa, spaceBefore=sb)

def section_header(text):
    return [Spacer(1, 2), Paragraph(text, S["section_title"]), hr(NAVY, 1, 2, 6)]

# ─── PÁGINAS ───────────────────────────────────────────────────────────────
def page_cover():
    return [Spacer(1, 1), PageBreak()]

def page_vision():
    story = section_header("¿Qué vamos a construir?")
    story.append(Paragraph(
        "El sistema tiene <b>3 módulos principales</b> que se construyen en orden. "
        "Cada uno alimenta al siguiente — y cada uno ya entrega valor solo, sin esperar al que sigue. "
        "El primer paso es dejar conectados a todos los empleados y contratistas con el sistema, "
        "porque después cada retiro de material, fichada, vale, costo y movimiento necesita estar asociado "
        "a una persona real.",
        S["body"]))
    story.append(Spacer(1, 8))

    modules = [
        ("MÓDULO 1  —  RRHH / Presentismo", "Fase 1 — el arranque", BG_BLUE, NAVY, [
            "Base única de empleados, contratistas, grupos y áreas",
            "Importar CSV del fichero Hikvision",
            "Ver presentismo diario: entrada, salida, horas trabajadas",
            "Dejar lista la identidad de cada persona para usarla luego en Pañol",
            "Informes por rango de fechas, exportables a Excel/PDF",
            "Guardar histórico completo",
        ]),
        ("MÓDULO 2  —  Pañol + Inventario", "Fase 2", BG_GRN, GREEN, [
            "Maestro de materiales con costo unitario",
            "Ledger de movimientos — fuente de verdad auditable",
            "Vales / órdenes de salida por obra",
            "Identidad de empleados con tarjetas NFC",
            "Integración con balanza (despacho por peso / conteo de piezas)",
        ]),
        ("MÓDULO 3  —  Costos por Obra", "Fase 3 — el objetivo final", BG_YELL, colors.HexColor("#8a6400"), [
            "Costo real de materiales por barco",
            "Costo de mano de obra (cruzando las horas de RRHH)",
            "Dashboard para dirección: cuánto sale fabricar cada barco",
            "BOM por modelo que se refina con el consumo real",
        ]),
    ]
    for mod_title, mod_sub, bg, fg, items in modules:
        rows = [[Paragraph(mod_title, ParagraphStyle("mh", fontName="Helvetica-Bold",
                    fontSize=11, textColor=fg, leading=15))],
                [Paragraph(mod_sub, ParagraphStyle("ms", fontName="Helvetica-Oblique",
                    fontSize=9, textColor=fg, leading=13))]]
        for it in items:
            rows.append([Paragraph(f"•  {it}", ParagraphStyle("mi",
                fontName="Helvetica", fontSize=10, textColor=BLACK, leading=14, leftIndent=4))])
        t = Table(rows, colWidths=[CW])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), bg),
            ("LINEBEFORE", (0,0), (0,-1), 3, fg),
            ("BOX", (0,0), (-1,-1), 0.6, fg),
            ("LEFTPADDING", (0,0), (-1,-1), 12),
            ("RIGHTPADDING", (0,0), (-1,-1), 12),
            ("TOPPADDING", (0,0), (0,0), 8),
            ("BOTTOMPADDING", (0,-1), (-1,-1), 8),
            ("TOPPADDING", (0,1), (-1,-1), 2),
            ("BOTTOMPADDING", (0,0), (-1,-2), 2),
        ]))
        story.append(KeepTogether([t, Spacer(1, 8)]))

    story.append(Spacer(1, 2))
    story.append(hr())
    story.append(Paragraph(
        "<b>Por qué este orden:</b> primero se conecta a las personas con el sistema. "
        "Con esa base, Pañol puede registrar quién retira materiales y para qué obra, y Costos puede cruzar "
        "consumos con horas reales. No son tres proyectos separados: son tres fases del mismo sistema.",
        ParagraphStyle("note", fontName="Helvetica-Oblique", fontSize=9.5,
                       textColor=NAVY, leading=14)))
    story.append(PageBreak())
    return story

def page_hardware():
    story = section_header("Hardware — Estado Actual")
    story.append(Paragraph("<b>Lo que ya tenemos</b> (sin costo adicional):", S["module_title"]))

    tenemos = [
        ("2 PCs + 1 laptop", "Estaciones de pañol y administración"),
        ("Impresora de etiquetas térmicas", "QR y códigos de materiales — ya operativa"),
        ("2 colectores de datos Android", "Egresos móviles e identidad de empleados en el barco"),
        ("1 lector QR USB", "Identificación en el mostrador del pañol"),
        ("~200 tarjetas NFC", "Una por empleado — tipo Mifare/NTAG, antena visible"),
        ("Fichero Hikvision", "Ya instalado y funcionando — sólo falta conectarlo"),
    ]
    rows = [[Paragraph("", S["table_hdr"]),
             Paragraph("Ítem", S["table_hdr"]),
             Paragraph("Uso en el sistema", S["table_hdr"])]]
    for item, uso in tenemos:
        rows.append([Check(11),
                     Paragraph(item, S["table_cell"]),
                     Paragraph(uso, ParagraphStyle("tc2", fontName="Helvetica-Oblique",
                         fontSize=9, textColor=GRAY, leading=13))])
    t = Table(rows, colWidths=[24, 132, CW-24-132])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_BLUE]),
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("ALIGN", (0,1), (0,-1), "CENTER"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Lo que falta comprar:</b>", S["module_title"]))
    compras = [
        ("IMPRESCINDIBLE", colors.HexColor("#c0392b"), [
            ("Lector NFC USB  (tipo ACR122U o similar)", "$35 – 50",
             "Funciona igual que el lector QR: USB, sin drivers, “tipea” el UID de la tarjeta. "
             "Un solo lector para el mostrador del pañol."),
        ]),
        ("MUY RECOMENDADO", colors.HexColor("#b8860b"), [
            ("Balanza de precisión USB HID  (0–5 kg, 0,1 g)", "$100 – 200",
             "Para resinas, adhesivos, pinturas y conteo de piezas pequeñas por peso. "
             "Buscar modelos con “USB keyboard output” / “HID mode”."),
        ]),
    ]
    for cat, cat_color, items in compras:
        story.append(Paragraph(cat, ParagraphStyle("cs", fontName="Helvetica-Bold",
            fontSize=9, textColor=cat_color, spaceBefore=4, spaceAfter=3)))
        for nombre, precio, detalle in items:
            row_data = [
                [Paragraph(nombre, ParagraphStyle("cn", fontName="Helvetica-Bold",
                    fontSize=10, textColor=BLACK, leading=14)),
                 Paragraph(precio + " USD", ParagraphStyle("cp", fontName="Helvetica-Bold",
                    fontSize=11, textColor=cat_color, alignment=TA_RIGHT, leading=14))],
                [Paragraph(detalle, ParagraphStyle("cd", fontName="Helvetica-Oblique",
                    fontSize=9, textColor=GRAY, leading=13)), ""],
            ]
            rt = Table(row_data, colWidths=[CW-90, 90])
            rt.setStyle(TableStyle([
                ("BOX", (0,0), (-1,-1), 0.5, BORDER),
                ("LINEBEFORE", (0,0), (0,-1), 2.5, cat_color),
                ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fbfbfb")),
                ("LEFTPADDING", (0,0), (-1,-1), 10),
                ("RIGHTPADDING", (0,0), (-1,-1), 10),
                ("TOPPADDING", (0,0), (-1,0), 7),
                ("BOTTOMPADDING", (0,-1), (-1,-1), 7),
                ("TOPPADDING", (0,1), (-1,-1), 2),
                ("SPAN", (0,1), (1,1)),
                ("VALIGN", (0,0), (-1,-1), "TOP"),
            ]))
            story.append(KeepTogether([rt, Spacer(1, 6)]))

    story.append(Spacer(1, 2))
    story.append(hr())
    box = Table([[
        Paragraph("TOTAL HARDWARE A COMPRAR", ParagraphStyle("tl", fontName="Helvetica-Bold",
            fontSize=11, textColor=WHITE)),
        Paragraph("$135 – 250 USD", ParagraphStyle("tr", fontName="Helvetica-Bold",
            fontSize=13, textColor=WHITE, alignment=TA_RIGHT)),
    ]], colWidths=[CW*0.6, CW*0.4])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(box)
    story.append(Paragraph(
        "El lector NFC ($40) es lo único imprescindible para arrancar. La balanza es una mejora posterior.",
        ParagraphStyle("tot2", fontName="Helvetica-Oblique", fontSize=9,
                       textColor=GRAY, alignment=TA_RIGHT, spaceBefore=4)))
    story.append(PageBreak())
    return story

def page_costos():
    story = section_header("Costos Mensuales de Servicios")

    def st_tag(txt, color):
        return Paragraph(txt, ParagraphStyle("tag", fontName="Helvetica-Bold",
            fontSize=8.5, textColor=color, leading=11))

    rows = [
        [Paragraph("Servicio", S["table_hdr"]), Paragraph("Costo/mes", S["table_hdr"]),
         Paragraph("Estado", S["table_hdr"]), Paragraph("Detalle", S["table_hdr"])],
        [Paragraph("Claude Pro", S["table_cell"]), Paragraph("$20", S["table_cell"]),
         st_tag("YA SE PAGA", GREEN),
         Paragraph("Arquitectura, Codex y revisión de código", S["table_cell"])],
        [Paragraph("Vercel", S["table_cell"]), Paragraph("$0", S["table_cell"]),
         st_tag("GRATIS", GREEN),
         Paragraph("Deploy del frontend — el plan free alcanza", S["table_cell"])],
        [Paragraph("Supabase (Free)", S["table_cell"]), Paragraph("$0", S["table_cell"]),
         st_tag("GRATIS", GREEN),
         Paragraph("En uso hoy — límite de 500 MB de base", S["table_cell"])],
        [Paragraph("Supabase (plan pago)", S["table_cell"]),
         Paragraph("$10", ParagraphStyle("sp2", fontName="Helvetica-Bold", fontSize=10,
             textColor=colors.HexColor("#b8860b"))),
         st_tag("UPGRADE", colors.HexColor("#b8860b")),
         Paragraph("Más capacidad de base y backups — necesario al activar el pañol",
             S["table_cell"])],
        [Paragraph("OpenRouter (bot WhatsApp)", S["table_cell"]),
         Paragraph("$5 – 10", S["table_cell"]),
         st_tag("UPGRADE", colors.HexColor("#b8860b")),
         Paragraph("Sólo personal técnico y pañol — consumo muy bajo", S["table_cell"])],
        [Paragraph("OpenCode", S["table_cell"]),
         Paragraph("$5", S["table_cell"]),
         st_tag("A FUTURO", colors.HexColor("#b8860b")),
         Paragraph("Modelos económicos para construcción — se suma en la etapa final", S["table_cell"])],
        [Paragraph("ChatGPT Plus", S["table_cell"]),
         Paragraph("$20", S["table_cell"]),
         st_tag("EN USO", GREEN),
         Paragraph("Codex y asistencia de programación", S["table_cell"])],
    ]
    t = Table(rows, colWidths=[120, 56, 64, CW-120-56-64])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_BLUE]),
        ("BACKGROUND", (0,4), (-1,4), BG_YELL),
        ("BACKGROUND", (0,5), (-1,5), BG_YELL),
        ("BACKGROUND", (0,6), (-1,6), BG_YELL),
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))

    story += section_header("Resumen de Inversión")
    summary = [
        [Paragraph("Concepto", S["table_hdr"]), Paragraph("Hoy", S["table_hdr"]),
         Paragraph("Con el sistema completo", S["table_hdr"])],
        [Paragraph("Servicios / mes", S["table_cell"]), Paragraph("$40", S["table_cell"]),
         Paragraph("~$60 – 65 USD / mes", ParagraphStyle("s1", fontName="Helvetica-Bold",
             fontSize=10, textColor=NAVY))],
        [Paragraph("Hardware (por única vez)", S["table_cell"]), Paragraph("—", S["table_cell"]),
         Paragraph("$135 – 250 USD", ParagraphStyle("s2", fontName="Helvetica-Bold",
             fontSize=10, textColor=NAVY))],
    ]
    stt = Table(summary, colWidths=[150, 70, CW-150-70])
    stt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_BLUE, BG_GRN]),
        ("BOX", (0,0), (-1,-1), 0.8, NAVY),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(stt)
    story.append(PageBreak())
    return story

def page_sabados():
    story = section_header("Cronograma — Sesiones de Trabajo (Sábados)")

    equipo = [
        [Paragraph("Ezequiel", ParagraphStyle("e1", fontName="Helvetica-Bold",
            fontSize=10, textColor=NAVY)),
         Paragraph("Sistema, base de datos, prompting con IA y construcción", S["body_sm"])],
        [Paragraph("David", ParagraphStyle("e2", fontName="Helvetica-Bold",
            fontSize=10, textColor=GREEN)),
         Paragraph("Analista de recopilación de datos — normalización de información recibida, precios y validación con el negocio", S["body_sm"])],
    ]
    et = Table(equipo, colWidths=[120, CW-120])
    et.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("BACKGROUND", (0,0), (0,0), BG_BLUE),
        ("BACKGROUND", (0,1), (0,1), BG_GRN),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(et)
    story.append(Spacer(1, 10))

    BLUE  = colors.HexColor("#1a3a5c")
    GRN   = colors.HexColor("#1a4a2a")
    PURP  = colors.HexColor("#3a2a6a")
    OCHRE = colors.HexColor("#7a5300")
    sabados = [
        (0, "ALINEACIÓN INICIAL", "arranque ordenado", RED, [
            "Alinear el objetivo del sistema: conectar empleados, materiales y costos en una misma base",
            "Confirmar los insumos disponibles: CSV de RRHH, padrón de empleados, facturas y remitos recientes",
            "Acordar los criterios iniciales de codificación de materiales y unidades de medida",
            "Definir los responsables de validación por área: RRHH, pañol, compras y producción",
            "[Analista] Organizar la información recibida y separar lo que entra en la primera carga",
            "[Sistema] Preparar estructura inicial para empleados, materiales, movimientos y obras",
        ]),
        (1, "MÓDULO RRHH — Base de empleados conectada", "", BLUE, [
            "[Sistema] Crear la base inicial de empleados, contratistas, grupos y áreas",
            "[Sistema] Importar los CSV de RRHH / Hikvision con vista previa antes de confirmar",
            "[Sistema] Relacionar cada marcación con un empleado real mediante legajo o identificador",
            "[Analista] Revisar la información recibida y marcar diferencias simples: nombres, áreas, legajos o duplicados",
            "[Analista] Validar con RRHH los casos que no coincidan antes de tomarlos como definitivos",
            "[Ambos] Dejar armado el maestro de personas que después usará Pañol para vales, retiros y costos",
        ]),
        (2, "FIN MÓDULO RRHH + INICIO MATERIALES", "", BLUE, [
            "[Sistema] Cerrar la vista de presentismo: entradas, salidas, horas, ausentes y filtros por grupo",
            "[Sistema] Dejar exportables los informes básicos para RRHH",
            "[Analista] Validar con RRHH una muestra de días reales y ajustar criterios de tardanzas o fichadas faltantes",
            "[Ambos] Dar por cerrado el maestro inicial de empleados para que pueda usarse en Pañol",
            "[Analista] Empezar recopilación de materiales desde facturas, remitos y listados actuales",
            "[Analista] Separar materiales por rubro: laminación, maderas, herrajes, pintura, EPP y eléctrico",
            "[Analista] Identificar los materiales de mayor impacto para cargar primero con precio y unidad",
            "[Sistema] Preparar la planilla/base inicial donde se cargarán materiales, unidades y costos",
        ]),
        (3, "MAESTRO DE MATERIALES (top 20%)", "", GRN, [
            "[Sistema] Entregar la planilla modelo al analista con las columnas exactas",
            "[Analista] Listar los materiales críticos/caros: resina, gelcoat, maderas, herrajes clave",
            "[Analista] Cargar los precios unitarios desde las facturas recientes",
            "[Sistema] Crear las tablas de materiales + categorías en la base",
            "[Sistema] Pantalla de listado de materiales con costo y categoría",
        ]),
        (4, "STOCK INICIAL (conteo físico)", "", GRN, [
            "[Analista] Coordinar el conteo físico del top de materiales en el pañol",
            "[Pañol] Necesitamos que venga un empleado de pañol a ayudar con el conteo (conoce ubicaciones y cantidades)",
            "[Sistema] Ledger de movimientos (ingreso/egreso/ajuste) — la fuente de verdad",
            "[Sistema] Cargar el stock inicial como movimiento de tipo “apertura”",
            "[Sistema] Verificar que el stock se derive siempre del ledger, nunca de un campo suelto",
        ]),
        (5, "VALES / ÓRDENES DE SALIDA", "", PURP, [
            "[Analista] Mapear el circuito actual: quién pide, cómo avisa, cómo prepara el pañolero",
            "[Sistema] Pantalla de vale: crear › preparando › listo › entregado",
            "[Sistema] Al entregar: baja automática de stock + imputa el costo a la obra",
            "[Analista] Definir sectores/ubicaciones del pañol para preparar rápido",
        ]),
        (6, "IDENTIDAD NFC + EMPLEADOS", "", PURP, [
            "[Sistema] Tablas de credenciales: NFC UID › empleado",
            "[Sistema] Registro: asociar la tarjeta NFC a un empleado (tap › asignar)",
            "[Sistema] Mostrador: tap de tarjeta › muestra foto + nombre + área",
            "[Analista] Cargar fotos de la cuadrilla piloto (puede ser incremental)",
            "[Sistema] Integrar la identificación con el flujo de vales",
        ]),
        (7, "PILOTO EN 1 BARCO — LANZAMIENTO", "", OCHRE, [
            "[Sistema] Deploy y prueba en producción",
            "[Analista] Capacitar al pañolero del barco piloto",
            "[Ambos] Empezar a capturar vales reales de ese barco",
            "[Ambos] Registrar todo lo que falte o no funcione (lista de mejoras v1.1)",
        ]),
    ]
    for num, title, note, color, items in sabados:
        hdr_text = f"SÁBADO {num}   —   {title}"
        if note:
            hdr_text += f"   ({note})"
        hdr = Table([[Paragraph(hdr_text, S["sat_title"])]], colWidths=[CW])
        hdr.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), color),
            ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ]))
        inner = checklist(items, accent=color)
        story.append(KeepTogether([hdr, inner, Spacer(1, 9)]))

    story.append(PageBreak())
    return story

def page_principios():
    story = section_header("Principios del Proyecto")
    story.append(Paragraph("<b>Criterios de implementación</b>", S["module_title"]))
    rules = [
        ("1", "Arrancar conectando a las personas.",
         "La base de empleados y contratistas permite que cada fichada, vale, retiro y costo quede asociado a un responsable real."),
        ("2", "Trabajar por etapas con entregas visibles.",
         "Cada módulo debe dejar una mejora concreta funcionando antes de avanzar al siguiente."),
        ("3", "Usar información real desde el inicio.",
         "Los CSV de RRHH, facturas, remitos y listados existentes se toman como punto de partida para ordenar la base."),
        ("4", "Priorizar lo que más impacto tiene.",
         "Primero se cargan los materiales críticos y de mayor valor; luego se completa el detalle fino."),
        ("5", "Construir un sistema propio del astillero.",
         "El objetivo no es adaptar la empresa a un software genérico, sino ordenar los procesos reales de Klase A."),
    ]
    for num, rule, detail in rules:
        data = [
            [Paragraph(num, ParagraphStyle("rn", fontName="Helvetica-Bold", fontSize=15,
                textColor=WHITE, alignment=TA_CENTER)),
             Paragraph(f"<b>{rule}</b>", ParagraphStyle("rb", fontName="Helvetica-Bold",
                fontSize=10.5, textColor=GREEN, leading=14))],
            ["", Paragraph(detail, ParagraphStyle("rd", fontName="Helvetica-Oblique",
                fontSize=9, textColor=GRAY, leading=13))],
        ]
        rt = Table(data, colWidths=[30, CW-30])
        rt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,-1), GREEN),
            ("BACKGROUND", (1,0), (1,-1), BG_GRN),
            ("BOX", (0,0), (-1,-1), 0.5, GREEN),
            ("SPAN", (0,0), (0,1)),
            ("VALIGN", (0,0), (0,-1), "MIDDLE"), ("ALIGN", (0,0), (0,-1), "CENTER"),
            ("LEFTPADDING", (1,0), (1,-1), 10), ("RIGHTPADDING", (1,0), (1,-1), 10),
            ("TOPPADDING", (1,0), (1,0), 6), ("BOTTOMPADDING", (1,-1), (1,-1), 6),
            ("TOPPADDING", (1,1), (1,-1), 1),
        ]))
        story.append(KeepTogether([rt, Spacer(1, 6)]))

    story.append(PageBreak())
    return story

def page_argumento():
    story = section_header("¿Por qué hacer esto ahora?")
    story.append(Paragraph("Un resumen de la situación actual y de lo que aporta el sistema.",
        ParagraphStyle("intro", fontName="Helvetica-Oblique", fontSize=10,
                       textColor=GRAY, spaceAfter=10, leading=14)))

    col_w = (CW - 12) / 2
    probs = [
        "Todavía no se conoce al 100% el costo real de cada barco",
        "El retiro diario de materiales aún no queda registrado de forma centralizada",
        "Falta trazabilidad de los materiales (pérdidas y roturas difíciles de seguir)",
        "Aún no hay listas de materiales completas por modelo",
        "El software actual del fichero le resulta poco práctico a RRHH",
    ]
    SLATE = colors.HexColor("#5b6b7a")
    pr_style = ParagraphStyle("pr", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#33414d"), leading=14)
    dot_style = ParagraphStyle("dot", fontName="Helvetica", fontSize=11,
        textColor=SLATE, alignment=TA_CENTER)
    prob_rows = [[Paragraph("SITUACIÓN ACTUAL", ParagraphStyle("ph", fontName="Helvetica-Bold",
        fontSize=10, textColor=WHITE)), ""]]
    for p in probs:
        prob_rows.append([Paragraph("•", dot_style), Paragraph(p, pr_style)])
    pt = Table(prob_rows, colWidths=[20, col_w - 20])
    pt.setStyle(TableStyle([
        ("SPAN", (0,0), (1,0)),
        ("BACKGROUND", (0,0), (-1,0), SLATE),
        ("BACKGROUND", (0,1), (-1,-1), colors.HexColor("#f1f3f5")),
        ("BOX", (0,0), (-1,-1), 0.7, colors.HexColor("#cdd5dd")),
        ("ALIGN", (0,1), (0,-1), "CENTER"),
        ("LEFTPADDING", (0,0), (-1,0), 10),
        ("LEFTPADDING", (0,1), (0,-1), 8), ("RIGHTPADDING", (0,1), (0,-1), 0),
        ("LEFTPADDING", (1,1), (1,-1), 4), ("RIGHTPADDING", (1,1), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,0), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,1), (-1,-1), 5),
        ("VALIGN", (0,1), (-1,-1), "TOP"),
    ]))

    sols = [
        "Costo real de cada barco (materiales + mano de obra)",
        "Trazabilidad completa: quién retiró qué, para qué obra y cuándo",
        "Presentismo de los 250 empleados en una pantalla simple",
        "Control de stock con alertas de faltantes",
        "Base para detectar pérdidas, desvíos y sobreconsumo",
    ]
    sr_style = ParagraphStyle("sr", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#0d3a18"), leading=14)
    sol_rows = [[Paragraph("LO QUE EL SISTEMA RESUELVE", ParagraphStyle("sh",
        fontName="Helvetica-Bold", fontSize=10, textColor=WHITE)), ""]]
    for s in sols:
        sol_rows.append([Check(9, GREEN), Paragraph(s, sr_style)])
    stb = Table(sol_rows, colWidths=[20, col_w - 20])
    stb.setStyle(TableStyle([
        ("SPAN", (0,0), (1,0)),
        ("BACKGROUND", (0,0), (-1,0), GREEN),
        ("BACKGROUND", (0,1), (-1,-1), BG_GRN),
        ("BOX", (0,0), (-1,-1), 0.7, GREEN),
        ("ALIGN", (0,1), (0,-1), "CENTER"),
        ("LEFTPADDING", (0,0), (-1,0), 10),
        ("LEFTPADDING", (0,1), (0,-1), 8), ("RIGHTPADDING", (0,1), (0,-1), 0),
        ("LEFTPADDING", (1,1), (1,-1), 4), ("RIGHTPADDING", (1,1), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,0), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,1), (-1,-1), 5),
        ("VALIGN", (0,1), (-1,-1), "TOP"),
    ]))
    two_col = Table([[pt, "", stb]], colWidths=[col_w, 12, col_w])
    two_col.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
    story.append(two_col)
    story.append(Spacer(1, 16))

    story += section_header("La Inversión")
    inv = [
        [Paragraph("Concepto", S["table_hdr"]), Paragraph("Valor", S["table_hdr"])],
        [Paragraph("Hardware (por única vez)", S["table_cell"]),
         Paragraph("~$135 – 250 USD", ParagraphStyle("i1", fontName="Helvetica-Bold",
             fontSize=11, textColor=NAVY))],
        [Paragraph("Servicios mensuales", S["table_cell"]),
         Paragraph("~$60 – 65 USD / mes", ParagraphStyle("i2", fontName="Helvetica-Bold",
             fontSize=11, textColor=NAVY))],
    ]
    it = Table(inv, colWidths=[170, CW-170])
    it.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, BG_BLUE]),
        ("BOX", (0,0), (-1,-1), 0.8, NAVY),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(it)
    story.append(Spacer(1, 14))

    story += section_header("La Comparación")
    comp = [
        [Paragraph("Opción", S["table_hdr"]), Paragraph("Implementación", S["table_hdr"]),
         Paragraph("Costo mensual", S["table_hdr"]), Paragraph("Adaptación a Klase A", S["table_hdr"])],
        [Paragraph("ERP / sistema estándar configurable", S["table_cell"]),
         Paragraph("~$5.000 – $25.000+", ParagraphStyle("c1", fontName="Helvetica-Bold",
             fontSize=9, textColor=RED)),
         Paragraph("~$200 – $1.000+", ParagraphStyle("c2", fontName="Helvetica-Bold",
             fontSize=9, textColor=RED)),
         Paragraph("Requiere configuración y adaptación operativa", S["table_cell"])],
        [Paragraph("Este sistema", ParagraphStyle("c3", fontName="Helvetica-Bold",
             fontSize=10, textColor=GREEN)),
         Paragraph("Hardware inicial + desarrollo interno", ParagraphStyle("c4", fontName="Helvetica-Bold",
             fontSize=10, textColor=GREEN)),
         Paragraph("~$60 – 65", ParagraphStyle("c5", fontName="Helvetica-Bold",
             fontSize=10, textColor=GREEN)),
         Paragraph("Hecho sobre procesos reales de Klase A", ParagraphStyle("c6",
             fontName="Helvetica-Bold", fontSize=10, textColor=GREEN))],
    ]
    ct = Table(comp, colWidths=[135, 100, 78, CW-135-100-78])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("BACKGROUND", (0,2), (-1,2), BG_GRN),
        ("BOX", (0,0), (-1,-1), 0.8, NAVY),
        ("INNERGRID", (0,0), (-1,-1), 0.3, BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(ct)
    return story

# ─── BUILD ─────────────────────────────────────────────────────────────────
OUTPUT = r"D:\proyectos\klasea-stock\Plan_Sistema_Integral_KlaseA_v12.pdf"
doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=20*mm, bottomMargin=18*mm,
    title="Plan de Implementacion — Sistema de Gestion Integral Klase A",
    author="Area de Sistemas — Klase A", subject="Plan de trabajo y presupuesto",
)
story = []
story += page_cover()
story += page_vision()
story += page_hardware()
story += page_costos()
story += page_sabados()
story += page_principios()
story += page_argumento()
doc.build(story, onFirstPage=on_cover, onLaterPages=on_page)
print(f"PDF generado: {OUTPUT}")
