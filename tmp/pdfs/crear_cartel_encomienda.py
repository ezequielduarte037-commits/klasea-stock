from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pathlib import Path

OUT = Path("output/pdf/cartel_encomienda_miguel_jose_toledo.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

w, h = A4
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle("Rotulo de encomienda - Miguel Jose Toledo")

# Etiqueta postal simple de aproximadamente 15 x 10 cm, lista para recortar.
x = 78
y = h - 355
label_w = 439
label_h = 265

c.setLineWidth(1)
c.rect(x, y, label_w, label_h, stroke=1, fill=0)

left = x + 28
top = y + label_h - 32
c.setFont("Helvetica-Bold", 11)
c.drawString(left, top, "DESTINATARIO")

c.setFont("Helvetica-Bold", 18)
c.drawString(left, top - 40, "MIGUEL JOSE TOLEDO")

c.setFont("Helvetica", 11)
c.drawString(left, top - 68, "DNI 35.493.960")
c.drawString(left + 180, top - 68, "TEL 2944 551614")

c.setFont("Helvetica-Bold", 17)
c.drawString(left, top - 112, "MUTICIAS N° 105")
c.drawString(left, top - 145, "8407 VILLA LA ANGOSTURA")
c.drawString(left, top - 178, "NEUQUEN")

c.setFont("Helvetica", 8)
c.drawString(x, y - 14, "RECORTAR POR EL BORDE Y PEGAR EN EL FRENTE DEL PAQUETE")

c.showPage()
c.save()
print(OUT.resolve())
