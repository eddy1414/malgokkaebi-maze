"""우리말샘 XML(spellcheck-ko/korean-dict-nikl 의 opendict/)을 하나씩 받아
끄투3 복합 사전에 있는 단어의 뜻풀이만 뽑아 tools/raw/opendict_defs.jsonl 로 저장한다.

  python tools/prep_opendict.py <임시 작업 폴더>

파일 26개(각 80MB 안팎)를 차례로 받아 읽고 바로 지운다. 이미 읽은 파일은 건너뛴다.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(RAW, 'opendict_defs.jsonl')
BASE = 'https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl/master/opendict/'
API = 'https://api.github.com/repos/spellcheck-ko/korean-dict-nikl/contents/opendict'
KEEP_POS = {'명사', '의존 명사', '대명사', '수사', '부사', '관형사', '감탄사', '품사 없음', '구', ''}


def text(el, path):
    x = el.find(path)
    return re.sub(r'\s+', ' ', x.text).strip() if x is not None and x.text else ''


def main(work):
    os.makedirs(work, exist_ok=True)
    with open(os.path.join(RAW, 'kkutu3', 'kkutu3-복합사전'), encoding='utf-8') as f:
        wanted = set(w.strip() for w in f.read().split('\n') if w.strip())
    done_path = os.path.join(work, 'done.txt')
    done = set(open(done_path).read().split()) if os.path.exists(done_path) else set()
    files = sorted(x['name'] for x in json.load(urllib.request.urlopen(API)) if x['name'].endswith('.xml'))
    seen = {}
    with open(OUT, 'a', encoding='utf-8') as out:
        for name in files:
            if name in done:
                continue
            tmp = os.path.join(work, name)
            subprocess.run(['curl', '-sS', '-m', '1800', '--retry', '3', '-o', tmp, BASE + name], check=True)
            n = 0
            for _, item in ET.iterparse(tmp, events=('end',)):
                if item.tag != 'item':
                    continue
                wi, si = item.find('wordInfo'), item.find('senseInfo')
                if wi is not None and si is not None:
                    word = text(wi, 'word')
                    key = re.sub(r'[-^ ㆍ－]|\d+$', '', word)
                    pos = text(si, 'pos')
                    if key in wanted and pos in KEEP_POS:
                        k2 = (key, pos)
                        if seen.get(k2, 0) < 2:
                            seen[k2] = seen.get(k2, 0) + 1
                            cats = [c.text.strip() for c in si.iter('cat') if c.text and c.text.strip()]
                            out.write(json.dumps({
                                'k': key, 'pos': pos, 'unit': text(wi, 'word_unit'), 'type': text(si, 'type'),
                                'cat': ','.join(cats), 'd': text(si, 'definition'),
                            }, ensure_ascii=False) + '\n')
                            n += 1
                item.clear()
            os.remove(tmp)
            with open(done_path, 'a') as d:
                d.write(name + '\n')
            out.flush()
            print(f'{name}: {n}', flush=True)
    print('끝')


if __name__ == '__main__':
    main(sys.argv[1])
