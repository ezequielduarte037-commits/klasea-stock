from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
import json

directory = Path(r'C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14')
pdf = directory / 'etiquetas-5.pdf'
backup = directory / 'etiquetas-5-chrome-original.pdf'
if not backup.exists():
    backup.write_bytes(pdf.read_bytes())
source = directory / 'etiquetas-5-chrome-corrected.pdf'
reader = PdfReader(source if source.exists() else backup)
assert len(reader.pages) == 5
font_dom = (directory / ('chrome-fonts-dom-corrected.html' if source.exists() else 'chrome-fonts-dom.html')).read_text(encoding='utf8')
assert 'data-fonts-ready="true"' in font_dom, 'Browser did not confirm both app font families'
writer = PdfWriter()
writer.clone_document_from_reader(reader)
width, height = 40 * 72 / 25.4, 30 * 72 / 25.4
for page in writer.pages:
    # Chrome truncates the page size to hundredths of an inch. Restore the
    # requested page box only; keep the original component graphics at 100%.
    page.mediabox = RectangleObject([0, 0, width, height])
    page.cropbox = RectangleObject([0, 0, width, height])
with pdf.open('wb') as stream:
    writer.write(stream)
verified = PdfReader(pdf)
assert len(verified.pages) == 5
for old, new in zip(reader.pages, verified.pages):
    assert old.get_contents().get_data() == new.get_contents().get_data()
    assert abs(float(new.mediabox.width) * 25.4 / 72 - 40) < 1e-6
    assert abs(float(new.mediabox.height) * 25.4 / 72 - 30) < 1e-6
report = {'pages':5,'sizeMm':[40,30],'fonts':['Outfit','JetBrains Mono'],'fontsLoadedConfirmed':True,'componentGraphicsUnchanged':True,'pageBoxCorrectionOnly':True}
(directory / 'pdf-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
