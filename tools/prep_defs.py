"""표준국어대사전 XML(spellcheck-ko/korean-dict-nikl-stdict, 2019)에서 뜻풀이를 뽑아
tools/raw/stdict_defs.jsonl 로 저장한다.

  python tools/prep_defs.py <XML 폴더>

XML 폴더는 아래 87개 파일을 받아 둔 곳:
  https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl-stdict/master/{5000,10000,...,430000,434240}.xml
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'raw', 'stdict_defs.jsonl')


def txt(el, path):
    x = el.find(path)
    return (x.text or '').strip() if x is not None and x.text else ''


def main(xml_dir):
    files = sorted(glob.glob(os.path.join(xml_dir, '*.xml')), key=lambda p: int(os.path.basename(p)[:-4]))
    n = 0
    with open(OUT, 'w', encoding='utf-8') as out:
        for fp in files:
            root = ET.parse(fp).getroot()
            for item in root.iter('item'):
                wi = item.find('word_info')
                if wi is None:
                    continue
                raw = txt(wi, 'word')
                m = re.match(r'^(.*?)(\d{2,3})?$', raw)
                base, sup = m.group(1), m.group(2) or ''
                key = re.sub(r'[-^ ㆍ－]', '', base)
                orig = ''.join((o.text or '') for o in wi.iter('original_language'))
                for pi in wi.findall('pos_info'):
                    pos = txt(pi, 'pos')
                    senses = []
                    for si in pi.iter('sense_info'):
                        cats = [c.text.strip() for c in si.iter('cat') if c.text and c.text.strip() != '없음']
                        d = re.sub(r'\s+', ' ', txt(si, 'definition'))
                        if d:
                            senses.append([','.join(cats), d])
                    if not senses:
                        continue
                    out.write(json.dumps({'k': key, 'w': base, 'sup': sup, 'unit': txt(wi, 'word_unit'),
                                          'pos': pos, 'orig': orig, 's': senses[:3]}, ensure_ascii=False) + '\n')
                    n += 1
            print(os.path.basename(fp), n, flush=True)
    print('saved', OUT, n)


if __name__ == '__main__':
    main(sys.argv[1])
