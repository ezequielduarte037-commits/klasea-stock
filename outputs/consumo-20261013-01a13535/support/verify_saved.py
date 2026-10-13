import json, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import date

support = Path(__file__).parent
source = json.loads((support / 'source-data.json').read_text(encoding='utf-8'))
target = support.parent / 'consumo-consumibles-mejorado.xlsx'
ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'c':'http://schemas.openxmlformats.org/drawingml/2006/chart', 'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
changes = {('Detalle','O1'):'Mes', ('Detalle','P1'):'Solicita', ('Por producto','H1'):'Con valor'}
with zipfile.ZipFile(target) as z:
    ss = ET.fromstring(z.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in z.namelist() else []
    strings = [''.join(t.text or '' for t in si.iterfind('.//s:t', ns)) for si in ss]
    rels = {r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = list(wb.find('s:sheets', ns))
    assert [s.get('name') for s in sheets] == [s['name'] for s in source], 'Sheet order or names changed'
    checked = 0
    panes = {}
    for sheet, original in zip(sheets, source):
        name = sheet.get('name')
        raw_path = rels[sheet.get('{%s}id' % ns['r'])]
        path = raw_path.lstrip('/') if raw_path.startswith('/') else 'xl/' + raw_path
        root = ET.fromstring(z.read(path))
        cells = {}
        for c in root.findall('s:sheetData/s:row/s:c', ns):
            v = c.find('s:v', ns)
            val = v.text if v is not None else None
            typ = c.get('t')
            if typ == 's' and val is not None: val = strings[int(val)]
            elif typ == 'inlineStr': val = ''.join(t.text or '' for t in c.findall('.//s:t', ns))
            elif typ == 'd' and val is not None: val = (date.fromisoformat(val[:10])-date(1899,12,30)).days
            elif val is not None and typ not in ['str','e']: val = float(val)
            assert typ != 'e', f'Exported error: {name}!{c.get("r")}: {val}'
            cells[c.get('r')] = val
        if name != 'Resumen':
            for row in original['rows']:
                for address, expected in row['cells'].items():
                    if (name,address) in changes: expected=changes[(name,address)]
                    if name in ['Detalle','Registro nuevo (desde 13-10)'] and address.startswith('A') and row['row']>1:
                        expected=(date.fromisoformat(expected)-date(1899,12,30)).days
                    actual = cells.get(address)
                    if isinstance(expected,(int,float)):
                        assert isinstance(actual,(int,float)) and abs(actual-expected)<1e-8, f'Data altered: {name}!{address}: {expected} -> {actual}'
                    else:
                        assert actual == expected, f'Data altered: {name}!{address}: {expected!r} -> {actual!r}'
                    checked += 1
        else:
            assert abs(cells['B7']-12597073.93)<0.0001
            assert cells['G7']==1492 and cells['K7']==171 and cells['O7']==383
            assert cells['O50']==1109 and abs(cells['O53']-1109/1492)<1e-10
        pane=root.find('s:sheetViews/s:sheetView/s:pane',ns)
        if pane is not None: panes[name]=pane.attrib
    tables=[p for p in z.namelist() if p.startswith('xl/tables/') and p.endswith('.xml')]
    charts=[p for p in z.namelist() if '/charts/' in p and '/_rels/' not in p and p.endswith('.xml')]
    assert len(tables)==9, f'Table count: {len(tables)}'
    assert len(charts)==11, f'Chart count: {len(charts)}'
    chart_data=[]
    for p in charts:
        c = ET.fromstring(z.read(p))
        formulas=[f.text for f in c.findall('.//c:ser//c:f',ns)]
        assert formulas and len(formulas)>=2, f'Unbound chart {p}'
        colors=[f.get('val') for f in c.findall('.//c:ser/c:spPr/a:solidFill/a:srgbClr',ns)]
        dough = c.find('.//c:doughnutChart',ns)
        if dough is None: assert colors and all(f in ['2563A6','C88516'] for f in colors), f'Series colors: {p} {colors}'
        chart_data.append({'part':p,'bindings':formulas,'seriesColors':colors,'doughnut':dough is not None,'varyColors':[v.get('val') for v in c.findall('.//c:varyColors',ns)]})
    assert panes['Detalle'].get('ySplit')=='1' and panes['Detalle'].get('xSplit')=='4', panes['Detalle']
    fractions=[]
    for s,col in [('Por producto','E'),('Sin valorizar','D'),('Registro nuevo (desde 13-10)','L')]:
        original=next(x for x in source if x['name']==s)
        fractions += [(s,r['row'],r['cells'].get(col+str(r['row']))) for r in original['rows'][1:] if isinstance(r['cells'].get(col+str(r['row'])),(int,float)) and r['cells'][col+str(r['row'])]%1]
    assert not fractions, f'Quantity decimals require format adjustment: {fractions}'
    report={'dataCellsPreserved':checked,'sheets':len(sheets),'tables':len(tables),'charts':chart_data,'panes':panes,'bytes':target.stat().st_size}
    (support/'saved-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ['charts','panes']},ensure_ascii=False))
    print(json.dumps(chart_data[-2:],ensure_ascii=False))
