# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
    Spacer, Table, TableStyle, PageBreak, NextPageTemplate, Flowable, HRFlowable)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas as pdfcanvas
import os

OUT = r'D:\proyectos\klasea-stock\klasea-stock-presentacion-v2.pdf'
BASE = r'D:\proyectos\klasea-stock'
WM     = os.path.join(BASE, '_wm.png')        # wordmark blanco (cover)
K_WHITE= os.path.join(BASE, '_k_white.png')   # K blanca (headers)
K_NAVY = os.path.join(BASE, '_k_navy.png')    # K navy (footer)

# ── Paleta ────────────────────────────────────────────────────────────────────
NAVY      = colors.HexColor('#1e3a5f')
NAVY_DK   = colors.HexColor('#162c47')
AZUL      = colors.HexColor('#2563eb')
AZUL_BRIL = colors.HexColor('#3b82f6')
AZUL_CLAR = colors.HexColor('#eff6ff')
AZUL_MED  = colors.HexColor('#cdddf5')
GRIS_FOND = colors.HexColor('#f6f8fb')
GRIS_BORD = colors.HexColor('#e2e8f0')
GRIS_TEXT = colors.HexColor('#64748b')
VERDE     = colors.HexColor('#16a34a')
AMBAR     = colors.HexColor('#d97706')
BLANCO    = colors.white
NEGRO     = colors.HexColor('#0f172a')
W, H = A4
ML = 2.0*cm   # margen lateral
CONTENT_W = W - 2*ML

# ── Estilos de párrafo ────────────────────────────────────────────────────────
def ps(name, **kw): return ParagraphStyle(name, **kw)
P_BODY  = ps('body',  fontName='Helvetica', fontSize=11, textColor=NEGRO, leading=17, spaceAfter=4)
P_SMALL = ps('small', fontName='Helvetica', fontSize=9,  textColor=GRIS_TEXT, leading=13)
P_BOLD  = ps('bold',  fontName='Helvetica-Bold', fontSize=11, textColor=NEGRO, leading=17)
P_SEC   = ps('sec',   fontName='Helvetica-Bold', fontSize=12.5, textColor=NAVY, leading=17, spaceBefore=8, spaceAfter=4)
P_CTR   = ps('ctr',   fontName='Helvetica', fontSize=9, textColor=GRIS_TEXT, alignment=TA_CENTER)
# celdas de tabla
TH   = ps('th',  fontName='Helvetica-Bold', fontSize=9.5, textColor=BLANCO, leading=12)
TD   = ps('td',  fontName='Helvetica', fontSize=9.7, textColor=NEGRO, leading=13)
TDB  = ps('tdb', fontName='Helvetica-Bold', fontSize=9.7, textColor=NAVY, leading=13)
TDI  = ps('tdi', fontName='Helvetica-Oblique', fontSize=9.7, textColor=NEGRO, leading=13)
TDC  = ps('tdc', fontName='Helvetica', fontSize=9.7, textColor=NEGRO, leading=13, alignment=TA_CENTER)

def th(t):  return Paragraph(t, TH)
def td(t, style=TD): return Paragraph(t, style)

# ── Canvas con footer + numeración (2 pasadas) ────────────────────────────────
class DocCanvas(pdfcanvas.Canvas):
    def __init__(self, *a, **k):
        pdfcanvas.Canvas.__init__(self, *a, **k)
        self._saved = []
    def showPage(self):
        self._saved.append(dict(self.__dict__)); self._startPage()
    def save(self):
        n = len(self._saved)
        for st in self._saved:
            self.__dict__.update(st)
            if self._pageNumber > 1:
                self._footer(n)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)
    def _footer(self, total):
        self.setStrokeColor(GRIS_BORD); self.setLineWidth(0.5)
        self.line(ML, 1.45*cm, W-ML, 1.45*cm)
        try: self.drawImage(K_NAVY, ML, 1.0*cm, 11, 11, mask='auto')
        except Exception: pass
        self.setFont('Helvetica', 8); self.setFillColor(GRIS_TEXT)
        self.drawString(ML+16, 1.07*cm, 'Klasea Stock  ·  Confidencial')
        self.drawRightString(W-ML, 1.07*cm, 'Pág. %d / %d' % (self._pageNumber, total))

# ── Portada (full-bleed, coords absolutas) ────────────────────────────────────
def draw_cover(c, doc):
    c.setFillColor(NAVY); c.rect(0, 0, W, H, fill=1, stroke=0)
    # banda inferior decorativa
    c.setFillColor(NAVY_DK); c.rect(0, 0, W, 2.4*cm, fill=1, stroke=0)
    # acentos azules a media altura
    yb = H*0.40
    c.setFillColor(AZUL);      c.rect(0, yb, W, 3, fill=1, stroke=0)
    c.setFillColor(AZUL_BRIL); c.rect(0, yb+5, W, 1, fill=1, stroke=0)
    # wordmark (Ⓚ KLASE A)
    try:
        wm = ImageReader(WM); iw, ih = wm.getSize()
        ww = 8.0*cm; wh = ww * ih/iw
        c.drawImage(wm, (W-ww)/2, H*0.66, ww, wh, mask='auto')
    except Exception: pass
    # título producto
    c.setFillColor(BLANCO); c.setFont('Helvetica-Bold', 44)
    c.drawCentredString(W/2, H*0.555, 'KLASEA STOCK')
    # acento corto centrado
    c.setFillColor(AZUL_BRIL); c.rect(W/2-30, H*0.532, 60, 2.5, fill=1, stroke=0)
    # subtítulo
    c.setFillColor(AZUL_MED); c.setFont('Helvetica', 16)
    c.drawCentredString(W/2, H*0.485, 'Sistema de Gestión Interna del Astillero')
    # fecha
    c.setFillColor(colors.HexColor('#8aa2c2')); c.setFont('Helvetica', 12)
    c.drawCentredString(W/2, H*0.45, 'Astillero Klase A   ·   Junio 2026')
    # footer strip
    c.setFillColor(colors.HexColor('#6b86a8'))
    c.setFont('Helvetica', 9)
    c.drawCentredString(W/2, 1.05*cm, 'Presentación interna  —  Confidencial')

# ── Header de sección (barra navy + K blanca a la derecha) ────────────────────
class SectionHeader(Flowable):
    def __init__(self, text): Flowable.__init__(self); self._t = text
    def wrap(self, aW, aH): self._w = aW; return (aW, 40)
    def draw(self):
        c = self.canv
        c.setFillColor(NAVY); c.roundRect(0, 0, self._w, 40, 5, fill=1, stroke=0)
        c.setFillColor(AZUL_BRIL); c.roundRect(0, 0, 5, 40, 2, fill=1, stroke=0)
        c.setFillColor(NAVY); c.rect(4, 0, 4, 40, fill=1, stroke=0)
        c.setFillColor(BLANCO); c.setFont('Helvetica-Bold', 16)
        c.drawString(16, 13, self._t)
        try: c.drawImage(K_WHITE, self._w-34, 9, 22, 22, mask='auto')
        except Exception: pass

# ── Caja de métrica ───────────────────────────────────────────────────────────
class MetricBox(Flowable):
    def __init__(self, num, label, w, h=94):
        Flowable.__init__(self); self._n=num; self._l=label; self._bw=w; self._bh=h
    def wrap(self, aW, aH): return (self._bw, self._bh)
    def draw(self):
        c = self.canv
        c.setFillColor(AZUL_CLAR); c.setStrokeColor(AZUL_BRIL); c.setLineWidth(1.3)
        c.roundRect(0, 0, self._bw, self._bh, 7, fill=1, stroke=1)
        c.setFillColor(AZUL); c.setFont('Helvetica-Bold', 30)
        c.drawCentredString(self._bw/2, self._bh-44, self._n)
        c.setFillColor(NAVY); c.setFont('Helvetica', 8.3)
        for i, ln in enumerate(self._l.split('\n')):
            c.drawCentredString(self._bw/2, 22 - i*11, ln)

# ── Paso numerado ─────────────────────────────────────────────────────────────
class Step(Flowable):
    def __init__(self, n, text): Flowable.__init__(self); self._n=str(n); self._t=text
    def wrap(self, aW, aH): self._w=aW; return (aW, 30)
    def draw(self):
        c = self.canv
        c.setFillColor(AZUL); c.circle(12, 11, 11, fill=1, stroke=0)
        c.setFillColor(BLANCO); c.setFont('Helvetica-Bold', 10.5)
        c.drawCentredString(12, 7, self._n)
        c.setFillColor(NEGRO); c.setFont('Helvetica', 10.5)
        c.drawString(32, 6.5, self._t)

# ── Tarjeta de bloque (altura automática) ─────────────────────────────────────
class BlockCard(Flowable):
    def __init__(self, title, body): Flowable.__init__(self); self._title=title; self._body=body
    def _lines(self, c):
        out, line = [], []
        for wd in self._body.split():
            if c.stringWidth(' '.join(line+[wd]), 'Helvetica', 9.7) < self._w - 30:
                line.append(wd)
            else:
                out.append(' '.join(line)); line=[wd]
        if line: out.append(' '.join(line))
        return out
    def wrap(self, aW, aH):
        self._w = aW
        # estima líneas para altura
        from reportlab.pdfbase.pdfmetrics import stringWidth
        out, line = [], []
        for wd in self._body.split():
            if stringWidth(' '.join(line+[wd]), 'Helvetica', 9.7) < aW - 30:
                line.append(wd)
            else: out.append(' '.join(line)); line=[wd]
        if line: out.append(' '.join(line))
        self._nlines = len(out)
        self._h = 30 + self._nlines*13.5 + 14
        return (aW, self._h)
    def draw(self):
        c = self.canv
        c.setFillColor(GRIS_FOND); c.setStrokeColor(GRIS_BORD); c.setLineWidth(0.6)
        c.roundRect(0, 0, self._w, self._h, 5, fill=1, stroke=1)
        c.setFillColor(AZUL); c.roundRect(0, 0, 4.5, self._h, 2, fill=1, stroke=0)
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 12)
        c.drawString(16, self._h-23, self._title)
        c.setFillColor(NEGRO); c.setFont('Helvetica', 9.7)
        t = c.beginText(16, self._h-40)
        for ln in self._lines(c): t.textLine(ln)
        c.drawText(t)

# ── Estilo base de tabla ──────────────────────────────────────────────────────
def base_table(data, cw, header=True):
    ts = [
        ('BACKGROUND',(0,0),(-1,0), NAVY),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [BLANCO, GRIS_FOND]),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),9),
        ('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),
        ('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('BOX',(0,0),(-1,-1),0.5,GRIS_BORD),
        ('LINEBELOW',(0,0),(-1,-1),0.4,GRIS_BORD),
    ]
    t = Table(data, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle(ts))
    return t

def info_box(html):
    p = Paragraph(html, ps('ib', fontName='Helvetica', fontSize=10, textColor=NAVY, leading=15))
    t = Table([[p]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),AZUL_CLAR),
        ('LINEBEFORE',(0,0),(-1,-1),3,AZUL_BRIL),
        ('BOX',(0,0),(-1,-1),0.6,AZUL_BRIL),
        ('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),
    ]))
    return t

def estado_par(txt):
    c = VERDE if 'producción' in txt.lower() else (AMBAR if 'adopción' in txt.lower() else AZUL)
    return Paragraph(txt, ps('ep', fontName='Helvetica-Bold', fontSize=9, textColor=c, leading=12))

# ══════════════════════════════════════════════════════════════════════════════
# CONTENIDO
# ══════════════════════════════════════════════════════════════════════════════
story = [NextPageTemplate('body'), PageBreak()]

# ── PÁG 2: EL PROBLEMA ─────────────────────────────────────────────────────────
story += [SectionHeader('El problema que resolvimos'), Spacer(1, 14)]
story.append(Paragraph(
    'Antes de este sistema, la operación del astillero dependía de información fragmentada y '
    'procesos manuales que generaban pérdidas de tiempo, errores y falta de visibilidad.', P_BODY))
story.append(Spacer(1, 10))
ba = [[th('ANTES'), th('AHORA')]]
for a, b in [
    ('Pedidos de materiales por WhatsApp manual, sin registro ni seguimiento',
     'Pedidos centralizados, con historial completo y seguimiento de estado en tiempo real'),
    ('El pañol registraba ingresos y egresos en papel o en planillas de Excel',
     '920 movimientos digitales registrados, trazables por obra y por material'),
    ('Para saber el estado de un barco había que preguntar o ir al galpón',
     'Mapa de producción interactivo: qué barco está en cada puesto del galpón'),
    ('Sin aviso cuando llegaba un material pedido',
     'Notificaciones automáticas a compras cuando el pañol confirma la recepción'),
    ('La información vivía en la cabeza de cada persona',
     'Pedidos, materiales, etapas y tareas en un solo lugar, siempre actualizado'),
]:
    ba.append([td(a), td(b)])
t = base_table(ba, [CONTENT_W/2]*2)
t.setStyle(TableStyle([('LINEAFTER',(0,0),(0,-1),1.2,AZUL_BRIL)]))
story.append(t)

# ── PÁG 3: QUÉ ES ──────────────────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('¿Qué es Klasea Stock?'), Spacer(1, 14)]
story.append(Paragraph(
    'Klasea Stock es un sistema de gestión interna desarrollado a medida para Astillero Klase A. '
    'Corre en la nube, accesible desde cualquier dispositivo —incluido el celular— y centraliza '
    'la operación de producción, inventario y compras en un solo lugar.', P_BODY))
story += [Spacer(1, 8), Paragraph('Módulos del sistema', P_SEC)]
mods = [[th('MÓDULO'), th('QUÉ HACE'), th('ESTADO')]]
for n, q, e in [
    ('Obras & Gantt',        'Seguimiento de etapas y tareas por barco, con avance porcentual', 'En producción'),
    ('Mapa de Producción',   'Plano interactivo del galpón: qué barco está en cada puesto',     'En producción'),
    ('Pañol / Inventario',   'Registro de ingresos y egresos de materiales, por obra',          'En producción · 920 mov.'),
    ('Madera',               'Control de stock de maderas y pedidos a proveedores',             'En producción'),
    ('Compras',              'Pedidos desde cualquier área, con seguimiento completo de estado','En producción'),
    ('Bot de WhatsApp',      'Pedidos a compras desde el celular por texto, foto o audio',      'En producción'),
    ('Laminación',           'Gestión de materiales y pedidos del área de laminación',          'En adopción'),
    ('Fechas de producción', 'Planificación de eventos según la fecha de desmolde del barco',   'Nuevo'),
    ('Planificación',        'Timeline de obras, avisos y órdenes de compra',                   'En producción'),
    ('Marmolería & Muebles', 'Control de materiales por especialidad',                          'En producción'),
]:
    mods.append([td(n, TDB), td(q), estado_par(e)])
story.append(base_table(mods, [3.9*cm, 9.0*cm, 3.6*cm]))

# ── PÁG 4: MÉTRICAS ────────────────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('Métricas de uso real — Pañol & Madera'), Spacer(1, 5)]
story.append(Paragraph('Datos extraídos directamente del sistema al 5 de junio de 2026', P_SMALL))
story.append(Spacer(1, 14))
bw = (CONTENT_W - 3*8)/4
mrow = [[MetricBox('920','Movimientos\nregistrados', bw),
         MetricBox('766','Egresos de\nmateriales', bw),
         MetricBox('154','Ingresos de\nmateriales', bw),
         MetricBox('59','Obras distintas\ncon actividad', bw)]]
tm = Table(mrow, colWidths=[bw]*4, hAlign='LEFT')
tm.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-2),8),
                        ('RIGHTPADDING',(-1,0),(-1,0),0),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
story += [tm, Spacer(1, 18), Paragraph('Actividad reciente (últimos 7 días)', P_SEC), Spacer(1, 4)]
rec = [[th('Tipo de movimiento'), th('Cantidad')]]
for a, b in [('Movimientos totales registrados','72'),
             ('Egresos — entrega de materiales a obras','65'),
             ('Ingresos — recepción de materiales de proveedor','7')]:
    rec.append([td(a), td(b, TDC)])
tr = base_table(rec, [12.6*cm, CONTENT_W-12.6*cm])
story += [tr, Spacer(1, 14),
    info_box('<b>25 materiales distintos</b> trackeados en el sistema, con historial completo de cada '
             'movimiento: quién lo registró, para qué obra, fecha y cantidad exacta.')]

# ── PÁG 5: BOT ─────────────────────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('El bot de WhatsApp'), Spacer(1, 14)]
story.append(Paragraph(
    'Cualquier persona del astillero puede hacer un pedido a compras directamente desde WhatsApp, '
    'en lenguaje natural. No requiere abrir ninguna aplicación ni conocer el sistema.', P_BODY))
story += [Spacer(1, 8), Paragraph('Cómo funciona', P_SEC), Spacer(1, 6)]
for i, s in enumerate([
    'El operario manda un mensaje: "Necesito 6 tubos de adhesivo para el K52"',
    'El bot entiende el pedido y pregunta sólo lo que falta (la prioridad)',
    'Se crea automáticamente un pedido en el sistema con todos los datos',
    'Compras recibe una notificación por email al instante',
    'El pedido queda registrado con foto, enlace y seguimiento de estado'], 1):
    story += [Step(i, s), Spacer(1, 5)]
story += [Spacer(1, 10),
    info_box('<b>El bot entiende texto, fotos y audios.</b> Si el operario manda la foto de un producto, '
             'el sistema la adjunta automáticamente al pedido, para que compras sepa exactamente qué comprar.'),
    Spacer(1, 14), Paragraph('Ejemplo de conversación', P_SEC), Spacer(1, 4)]
conv = [[th('OPERARIO'), th('BOT — KLASEA STOCK')],
    [td('"Necesito 6 tubos de No Más Clavos para el K52"', TDI),
     td('"Anotado. ¿Prioridad alta, media o baja?"', TDI)],
    [td('"Alta"', TDI),
     td('"Listo. Pedido creado: 6 tubos No Más Clavos · K52 · prioridad alta. Compras fue notificado."', TDI)]]
tc = base_table(conv, [CONTENT_W/2]*2)
tc.setStyle(TableStyle([('LINEAFTER',(0,0),(0,-1),1.2,AZUL_BRIL)]))
story.append(tc)

# ── PÁG 6: SEGURIDAD ───────────────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('Seguridad, roles y acceso'), Spacer(1, 14)]
roles = [[th('ROL'), th('ACCESO')]]
for r, a in [
    ('Gestión / Admin',   'Acceso completo a todos los módulos y a la configuración del sistema'),
    ('Compras',           'Gestión de pedidos, órdenes de compra y proveedores'),
    ('Pañol',             'Registro de movimientos y confirmación de recepción de pedidos'),
    ('Laminación',        'Gestión de materiales y pedidos propios del área'),
    ('Encargado de obra', 'Seguimiento de su barco y creación de pedidos a compras'),
    ('Consulta',          'Vista del mapa de producción y estado de obras (sólo lectura)')]:
    roles.append([td(r, TDB), td(a)])
story += [base_table(roles, [4.8*cm, CONTENT_W-4.8*cm]), Spacer(1, 18),
    info_box('<b>100% en la nube.</b> No requiere instalación en ningún equipo. Accesible desde PC, '
             'tablet y celular. Todos los cambios se sincronizan en tiempo real entre los usuarios conectados.')]

# ── PÁG 7: PRÓXIMOS PASOS ──────────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('Próximos pasos'), Spacer(1, 14)]
def pri(p):
    c = VERDE if p=='Alta' else AMBAR
    return Paragraph(p, ps('pr', fontName='Helvetica-Bold', fontSize=9.7, textColor=c, alignment=TA_CENTER))
prox = [[th('ÁREA'), th('MEJORA PLANIFICADA'), th('PRIORIDAD')]]
for a, m, p in [
    ('Bot WhatsApp',         'Mejora en la comprensión de pedidos con IA avanzada',            'Alta'),
    ('Fechas de producción', 'Completar los tiempos estimados para todos los modelos de barco','Alta'),
    ('Calendario',           'Integrar fechas de desmolde con la planificación de compras',    'Alta'),
    ('Laminación',           'Adopción completa del módulo por el área de laminación',          'Media'),
    ('Mobile',               'Optimización completa para celular en todos los módulos',         'Media'),
    ('Reportes',             'Exportación a Excel / PDF de movimientos e historial',            'Media')]:
    prox.append([td(a, TDB), td(m), pri(p)])
story.append(base_table(prox, [4.4*cm, 9.6*cm, 2.5*cm]))

# ── PÁG 8: RESUMEN EJECUTIVO ───────────────────────────────────────────────────
story += [PageBreak(), SectionHeader('Resumen ejecutivo'), Spacer(1, 16)]
for tt, bb in [
    ('Sistema propio, a medida',
     'Klasea Stock fue construido específicamente para Astillero Klase A. No es un software genérico '
     'adaptado: cada módulo refleja exactamente cómo trabaja el astillero, sin funciones innecesarias '
     'ni adaptaciones forzadas.'),
    ('Ya en uso, con datos reales',
     'El sistema está en producción. Pañol y Madera registran todos sus movimientos digitalmente: en los '
     'últimos 7 días se cargaron 72 movimientos de materiales. El bot de WhatsApp ya está activo y operativo. '
     'Los datos son de la operación real del astillero, no de prueba.'),
    ('Escalable y moderno',
     'El sistema puede crecer con el astillero: nuevos módulos, nuevos usuarios y nuevas integraciones. '
     'La infraestructura está diseñada para soportar el crecimiento sin costos fijos elevados, y cada '
     'mejora se refleja en todos los dispositivos de forma inmediata.')]:
    story += [BlockCard(tt, bb), Spacer(1, 12)]
story += [Spacer(1, 10), HRFlowable(width='100%', thickness=0.5, color=GRIS_BORD), Spacer(1, 8),
    Paragraph('Klasea Stock   ·   Desarrollado internamente para Astillero Klase A   ·   2026   ·   Confidencial', P_CTR)]

# ══════════════════════════════════════════════════════════════════════════════
# DOC con dos plantillas: cover (full-bleed) + body
# ══════════════════════════════════════════════════════════════════════════════
cover_frame = Frame(0, 0, W, H, id='cover', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
body_frame  = Frame(ML, 2.0*cm, CONTENT_W, H-2.0*cm-1.8*cm, id='body',
                    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

doc = BaseDocTemplate(OUT, pagesize=A4,
    title='Klasea Stock — Presentación Ejecutiva', author='Astillero Klase A')
doc.addPageTemplates([
    PageTemplate(id='cover', frames=[cover_frame], onPage=draw_cover),
    PageTemplate(id='body',  frames=[body_frame]),
])
doc.build(story, canvasmaker=DocCanvas)
print('OK:', OUT)
