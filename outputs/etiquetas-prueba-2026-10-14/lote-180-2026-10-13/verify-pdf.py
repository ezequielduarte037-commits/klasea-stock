from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
import json, re, subprocess
from PIL import Image, ImageDraw

directory=Path(__file__).parent
products=json.loads((directory/'products.json').read_text(encoding='utf8'))
dom=(directory/'chrome-fonts-dom.html').read_text(encoding='utf8')
assert 'data-fonts-ready="true"' in dom
geometry=json.loads(re.search(r'<script type="application/json" id="label-geometry">(.*?)</script>',dom,re.S)[1])
assert len(geometry)==len(products)
for r in geometry:
    assert r['boxSizing']=='border-box'
    for part in ['qr','bars','name']:
        b=r[part]
        assert b['x']>=-0.1 and b['y']>=-0.1, (r['index'],part,b)
        assert b['right']<=r['page']['width']+0.1 and b['bottom']<=r['page']['height']+0.1,(r['index'],part,b)
    # Chrome's printed page is slightly truncated; all ink must fit inside it.
    assert r['bars']['bottom']<=29.972*96/25.4+0.1
    assert r['qr']['right']<=39.878*96/25.4+0.1
(directory/'label-geometry.json').write_text(json.dumps(geometry,indent=2),encoding='utf8')
reader=PdfReader(directory/'etiquetas-movimientos-chrome.pdf')
assert len(reader.pages)==len(products),(len(reader.pages),len(products))
writer=PdfWriter()
writer.clone_document_from_reader(reader)
for page in writer.pages:
    page.mediabox=RectangleObject([0,0,40*72/25.4,30*72/25.4])
    page.cropbox=RectangleObject([0,0,40*72/25.4,30*72/25.4])
target=directory/'etiquetas-movimientos.pdf'
with target.open('wb') as out: writer.write(out)
verified=PdfReader(target)
for old,new in zip(reader.pages,verified.pages):
    assert old.get_contents().get_data()==new.get_contents().get_data()
    assert abs(float(new.mediabox.width)*25.4/72-40)<1e-6
    assert abs(float(new.mediabox.height)*25.4/72-30)<1e-6
poppler=Path(r'C:/Users/ezequ/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
subprocess.run([str(poppler),'-r','203','-png',str(target),str(directory/'etiqueta')],check=True,stdout=subprocess.DEVNULL)
for p in products:
    with Image.open(p['bitmap']) as img: assert img.size==(320,240),(p['codigoEtiqueta'],img.size)
for start in range(0,len(products),30):
    group=products[start:start+30]
    sheet=Image.new('RGB',(5*330,6*270),'#ddd')
    draw=ImageDraw.Draw(sheet)
    for i,p in enumerate(group):
        x=(i%5)*330;y=(i//5)*270
        with Image.open(p['bitmap']) as img: sheet.paste(img.convert('RGB'),(x,y+20))
        draw.text((x+4,y+4),f"{p['orden']} | {p['codigoEtiqueta']}",fill='black')
    sheet.save(directory/f'vista-lote-{start//30+1}.png')
report={'labels':len(products),'pages':len(verified.pages),'sizeMm':[40,30],'bitmapPx':[320,240],'dpi':203,'fontsLoaded':True,'qrAndBarsInside':True,'graphicsUnscaled':True}
(directory/'pdf-verification.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
