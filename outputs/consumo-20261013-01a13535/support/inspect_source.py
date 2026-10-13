import json, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

source = Path(r'C:\Users\ezequ\Downloads\consumo-consumibles-2026-10-13.xlsx')
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(source) as z:
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        strings = [''.join(t.text or '' for t in si.iterfind('.//s:t', ns)) for si in ss]
    relations = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in relations}
    book = ET.fromstring(z.read('xl/workbook.xml'))
    result = []
    for s in book.find('s:sheets', ns):
        target = rels[s.attrib['{%s}id' % ns['r']]]
        path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        root = ET.fromstring(z.read(path))
        rows = []
        formulas = []
        for row in root.findall('s:sheetData/s:row', ns):
            cells = {}
            for c in row.findall('s:c', ns):
                v = c.find('s:v', ns)
                val = v.text if v is not None else None
                typ = c.get('t')
                if typ == 's' and val is not None:
                    val = strings[int(val)]
                elif typ == 'inlineStr':
                    val = ''.join(t.text or '' for t in c.findall('.//s:t', ns))
                elif val is not None and typ not in ['str', 'e']:
                    val = float(val)
                    if val.is_integer(): val = int(val)
                cells[c.get('r')] = val
                f = c.find('s:f', ns)
                if f is not None: formulas.append([c.get('r'), f.text])
            if cells: rows.append({'row': int(row.get('r')), 'cells': cells})
        result.append({'name': s.get('name'), 'dimension': root.find('s:dimension', ns).get('ref'), 'rows': rows, 'formulas': formulas, 'merges': [m.get('ref') for m in root.findall('s:mergeCells/s:mergeCell', ns)], 'tables': len(root.findall('s:tableParts/s:tablePart', ns)), 'drawings': len(root.findall('s:drawing', ns))})
    out = Path(__file__).with_name('source-data.json')
    out.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    for sheet in result:
        print(json.dumps({k:v for k,v in sheet.items() if k != 'rows'}, ensure_ascii=False)[:2500])
        print('row_count', len(sheet['rows']))
        print(json.dumps(sheet['rows'][:12], ensure_ascii=False))
        print('last_rows', json.dumps(sheet['rows'][-3:], ensure_ascii=False))
    print('native_parts', [n for n in z.namelist() if any(x in n for x in ['/tables/', '/charts/', 'pivot', 'comments', 'externalLink'])])
