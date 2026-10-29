"""게임 데이터 만들기.

  python tools/build_data.py            # data/meta.js, data/graph_*.js, data/words_*_*.js 생성
  python tools/build_data.py --fetch    # 뜻풀이가 없는 표시 단어를 표준국어대사전·우리말샘 누리집에서 받아 캐시한 뒤 생성

입력 (tools/raw/):
  kkutu3/kkutu3-표준사전, kkutu3-복합사전
                         끄투3 사전 단어 목록 (끝말잇기 엔진 '끄글'이 쓰는 것)
                         https://singrum.github.io/KoreanDict/kkutu3/<이름>
  stdict_words/<품사>     (신)표준국어대사전 품사별 단어 목록 (품사 표시용)
                         https://singrum.github.io/KoreanDict/stdict/db/<품사>
  stdict_defs.jsonl       prep_defs.py 로 뽑은 표준국어대사전 뜻풀이
  opendict_defs.jsonl     prep_opendict.py 로 뽑은 우리말샘 뜻풀이
  web_defs.jsonl          --fetch 로 받아 둔 누리집 뜻풀이 캐시
  dict-ko-data.yaml       hunspell-dict-ko 낱말 목록 (흔한 단어 판정용)

규칙: 두 글자 이상, 한글 음절로만 된 단어. 두음 법칙은 엔진(js/engine.js)이 처리한다.
"""
import collections
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
DATA = os.path.join(os.path.dirname(HERE), 'data')

# (id, 화면 이름, 파일, 한 줄 설명) — 앞의 사전이 뒤 사전의 부분집합이어야 한다(표준 ⊂ 복합)
DICTS = [
    ('std', '끄투3 표준 사전', 'kkutu3-표준사전', '표준국어대사전에 있는 동사·형용사 제외 모든 품사의 단어 기반'),
    ('ext', '끄투3 복합 사전', 'kkutu3-복합사전', '우리말샘에 있는 동사·형용사 제외 모든 품사의 단어 기반'),
]

POS9 = ['명사', '의존명사', '대명사', '수사', '부사', '관형사', '감탄사', '구', '무품사']
POS_LABEL = ['명사', '의존 명사', '대명사', '수사', '부사', '관형사', '감탄사', '구', '품사 없음']
STD_POS = {'명사': '명사', '의존명사': '의존 명사', '대명사': '대명사', '수사': '수사', '부사': '부사',
           '관형사': '관형사', '감탄사': '감탄사', '구': '구', '무품사': '품사 없음'}
POS_FROM_STD = {v: i for i, v in enumerate(POS_LABEL)}
BANNED_STD_POS = {'동사', '형용사', '보조 동사', '보조 형용사', '어미', '조사', '접사'}

K_PER_PAIR = 2        # (첫 글자, 끝 글자) 조합마다 화면에 쓸 단어 수
DEF_MAX = 72          # 뜻풀이 한 항목 최대 글자 수
CHUNK_ROWS = 45000    # words_*.js 한 파일의 단어 수

# 튜토리얼·예시 스테이지에서 반드시 써야 하는 단어
FORCE = set('사기 사이 사기꾼 흑설탕 탕솥 탕탕 탕수육 육가크로뮴 솥단지 솥뚜껑 '
            '덮밥 밥그릇 밥상 밥알 늣치 치읓 치마 치약 슘페터'.split())


def ishg(w):
    return all(0xAC00 <= ord(c) <= 0xD7A3 for c in w)


def read_list(path):
    with open(path, encoding='utf-8') as f:
        return [w.strip() for w in f.read().split('\n') if w.strip()]


def load_dicts():
    members = collections.defaultdict(int)
    sizes = {}
    for bit, (did, _, fname, _) in enumerate(DICTS):
        n = 0
        for w in read_list(os.path.join(RAW, 'kkutu3', fname)):
            if len(w) >= 2 and ishg(w):
                members[w] |= 1 << bit
                n += 1
        sizes[did] = n
    return members, sizes


def load_stdict_pos():
    wpos = collections.defaultdict(list)
    for i, p in enumerate(POS9):
        for w in read_list(os.path.join(RAW, 'stdict_words', p)):
            if i not in wpos[w]:
                wpos[w].append(i)
    return wpos


def load_defs():
    """표준국어대사전(+누리집 캐시) 항목, 우리말샘 항목을 따로 돌려준다."""
    defs = collections.defaultdict(list)
    with open(os.path.join(RAW, 'stdict_defs.jsonl'), encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            defs[r['k']].append(r)
    web = os.path.join(RAW, 'web_defs.jsonl')
    if os.path.exists(web):
        with open(web, encoding='utf-8') as f:
            for line in f:
                r = json.loads(line)
                if r.get('s') and r['k'] not in defs:
                    defs[r['k']].append(r)
    od = collections.defaultdict(list)
    path = os.path.join(RAW, 'opendict_defs.jsonl')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if len(od[r['k']]) < 4:
                    od[r['k']].append(r)
    return defs, od


def load_common():
    common = set()
    with open(os.path.join(RAW, 'dict-ko-data.yaml'), encoding='utf-8') as f:
        for m in re.finditer(r'- pos: (\S+)\n  word: (\S+)', f.read()):
            common.add(m.group(2))
    return common


# 학교 축제 전시용: 화면에 나오면 곤란한 뜻·단어. 규칙상 허용되는 단어라 승패 계산에는 그대로 쓰고, 화면에만 안 쓴다.
BLOCK_DEF = re.compile(r'강간|윤간|겁간|성폭행|성폭력|성추행|성희롱|성매매|매음|매춘|몸을 파|창녀|창기|유곽|음란|외설|섹스|성행위|성관계|성교|음경|음부(?!족)|정액|수음|포르노|음탕|간통|간음|불륜|오입|화냥|갈보|남색|사창|색주가|포주|기둥서방|계집질|욕으로 이르는|욕하여 이르는|욕으로 하는|비속하게 이르는')
BLOCK_WORD = re.compile(r'씹|좆|병신|지랄|^염병|썅|씨발|개새끼|거지새끼|개년|잡년|쌍년|쌍놈|^(보지|자지|섹스)$|강간|윤간|매춘|창녀|갈보|화냥|윤락|매음|음란|^오입|오입질')
BLOCKED_SCORE = -20.0

PUA = re.compile('[\ue000-\uf8ff]')   # 옛한글 등 사용자 정의 글자 (화면에서 깨짐)


def clean_markup(s):
    """사전 원문 표기 정리: <sp_no>…</sp_no>, <FL>…</FL>, <DR />, [Ⅱ], 끝의 _ 등"""
    s = re.sub(r'<(sp_no|each_sense_no)>.*?</\1>', '', s)
    s = re.sub(r'<DR\s*/?>', '. ', s)
    s = re.sub(r'</?(FL|sub|sup|i|b|u|br|span|font|equ|img|a)\b[^>]*>', '', s, flags=re.I)   # 서식 태그만 벗긴다
    s = re.sub(r'<([^<>]+)[>＞]', r'〈\1〉', s)   # 남은 <작품 이름> 은 책 이름 괄호로
    if PUA.search(s):   # 깨지는 글자가 든 문장은 뺀다
        s = ' '.join(p for p in re.split(r'(?<=\.)\s+', s) if not PUA.search(p))
    s = re.sub(r'\[[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\]', '', s)
    s = re.sub(r'(?<=[가-힣])_', '', s)
    s = re.sub(r'\s+([.,])', r'\1', s)
    s = re.sub(r'\.(\s*\.)+', '.', s)
    return re.sub(r'\s+', ' ', s).strip()


def tidy(s):
    """사전 내부 표기 정리: ‘땅땅02「1」’ → ‘땅땅’"""
    s = clean_markup(s)
    s = re.sub(r'「\d+」', '', s)
    s = re.sub(r'(?<=[가-힣])\d{2,3}(?=[’,.)\s]|$)', '', s)
    return s


def clip(s, n=DEF_MAX):
    s = tidy(s).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


def pick_entries(word, pos_idx, defs):
    """게임에서 허용되는 품사의 뜻풀이 항목을 일반어 우선으로 고른다."""
    allowed = {STD_POS[POS9[i]] for i in pos_idx}
    ents = [e for e in defs.get(word, []) if e['pos'] not in BANNED_STD_POS]
    good = [e for e in ents if e['pos'] in allowed]
    ents = good or ents

    def key(e):
        general = 0 if not e['s'][0][0] else 1
        return (general, e.get('sup') or '99')
    ents.sort(key=key)
    ok = [e for e in ents if not BLOCK_DEF.search(e['s'][0][1])]
    return ok or ents


def redirect_target(d):
    """‘→ 니나노.’ 같은 참조 항목이면 가리키는 단어(정리된 표제어)를 돌려준다."""
    m = re.match(r'^→\s*(.+?)\.?$', d)
    if not m:
        return None
    toks = clean_markup(m.group(1)).replace('‘', ' ').replace('’', ' ').split()
    if not toks:
        return None
    t = re.sub(r'「\d+」|\d{2,3}$', '', toks[0])
    return re.sub(r'[-^ ]', '', t) or None


def plain_def(key, defs, od):
    """참조가 아닌 실제 뜻풀이 하나 (표준국어대사전 → 우리말샘 순)."""
    for e in pick_entries(key, list(range(len(POS9))), defs):
        d = clean_markup(e['s'][0][1])
        if d and not d.startswith('→'):
            return re.sub(r'^『([^』]+)』\s*', r'〔\1〕 ', d)
    for e in od.get(key, []):
        d = clean_markup(e['d'])
        if d and not d.startswith('→') and e['pos'] not in BANNED_STD_POS:
            return d
    return ''


def render_std(word, pos_idx, defs, od):
    """표준국어대사전 뜻풀이. 돌려주는 값: (글, 대표 항목, 참조뿐인가)"""
    ents = pick_entries(word, pos_idx, defs)
    if not ents:
        return '', None, False
    parts, only_ref = [], True
    for e in ents[:2]:
        cat, d = e['s'][0]
        d = re.sub(r'^『([^』]+)』\s*', r'〔\1〕 ', clean_markup(d))
        tgt = redirect_target(d)
        if tgt:
            sub = plain_def(tgt, defs, od)
            d = f'→ ‘{tgt}’: {sub}' if sub else f'‘{tgt}’ 참고'
        else:
            only_ref = False
            if cat:
                d = f'〔{cat.split(",")[0]}〕 {d}'
        if d:
            parts.append(clip(d))
        if len(ents) == 1:
            break
    parts = list(dict.fromkeys(parts))
    if not parts:
        return '', None, False
    text = parts[0] if len(parts) == 1 else f'① {parts[0]} ② {parts[1]}'
    return text, ents[0], only_ref


def render_od(word, od):
    """우리말샘 항목: 일반어 우선, 방언·옛말·북한어는 갈래를 앞에 붙인다."""
    ents = [e for e in od.get(word, []) if e['d'] and e['pos'] not in BANNED_STD_POS]
    if not ents:
        return '', None
    ents = [e for e in ents if not BLOCK_DEF.search(e['d'])] or ents
    ents.sort(key=lambda e: (e['type'] != '일반어', bool(e['cat'])))
    e = ents[0]
    d = e['d']
    if e['type'] and e['type'] != '일반어':
        d = f'〔{e["type"]}〕 {d}'
    elif e['cat']:
        d = f'〔{e["cat"].split(",")[0]}〕 {d}'
    return clip(d), e


def score_word(word, pos, text, special, common, in_std):
    """높을수록 흔하고 직관적인 단어."""
    s = 0.0
    if word in common:
        s += 2.5
    if in_std:
        s += 1.0
    s += {0: 1.0, 1: 0.3, 2: 1.0, 3: 0.8, 4: 0.6, 5: 0.4, 6: 0.6, 7: -1.2, 8: -1.5, -1: -0.5}[pos]
    n = len(word)
    s += {2: 0.6, 3: 0.6, 4: 0.0}.get(n, -0.5 * (n - 4))
    if not text:
        s -= 3.0
    else:
        if special or text.startswith('〔'):
            s -= 0.8
        if text.startswith('→'):
            s -= 1.0
        if '어근' in text[:40]:
            s -= 1.2
        if re.search(r'옛말|방언|북한어|잘못', text):
            s -= 1.5
        # 규칙상 쓸 수 있지만, 같은 결과를 내는 다른 단어가 있으면 화면에 덜 나오게
        if re.search(r'성기|성교|음경|음부|음모(?!론)|자지|보지|정액|항문|똥구멍|비역|간음|매춘|창녀|욕으로 이르는|욕하여 이르는', text):
            s -= 5.0
        elif re.search(r'속되게 이르는|낮잡아 이르는|얕잡아 이르는|비하', text):
            s -= 0.6
    return round(s, 1)


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')


def fetch_stdict(w):
    page = _get('https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=' + urllib.parse.quote(w))
    senses, pos = [], ''
    for m in re.finditer(r'class="t_blue1">\s*(.*?)</a>(.*?)<font class="dataLine">(.*?)</font>', page, re.S):
        head = re.sub(r'<[^>]+>|\s', '', m.group(1))
        head = re.sub(r'\d+$', '', head)
        if re.sub(r'[-^]', '', head) != w:
            continue
        pm = re.search(r'「([^」]+)」', m.group(2))
        d = html.unescape(re.sub(r'<[^>]+>', '', m.group(3))).strip()
        d = re.sub(r'^「\d+」\s*', '', d)
        d = re.sub(r'\s+', ' ', d)
        if d:
            senses.append(['', d])
            pos = pos or (pm.group(1) if pm else '')
    return pos, senses


def fetch_opendict(w):
    page = _get('https://opendict.korean.go.kr/search/searchResult?query=' + urllib.parse.quote(w))
    senses = []
    for m in re.finditer(r'<span class="search_word_type3_15 mr5">(.*?)</span>(.*?)<span class="word_dis ml5">(.*?)</span>', page, re.S):
        head = re.sub(r'<[^>]+>|[\s^\-]', '', m.group(1))
        if head != w:
            continue
        cat = re.search(r'『([^』]+)』', m.group(2))
        d = html.unescape(re.sub(r'<[^>]+>', '', m.group(3))).strip()
        d = re.sub(r'\s+', ' ', d)
        if d:
            senses.append([cat.group(1) if cat else '', d])
    return '', senses


def fetch_web_defs(words):
    """표준국어대사전 → 우리말샘 순서로 첫 뜻풀이를 받아 캐시한다."""
    path = os.path.join(RAW, 'web_defs.jsonl')
    done = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                r = json.loads(line)
                if r.get('s') or r.get('od'):
                    done[r['k']] = r
                else:
                    done.setdefault(r['k'], r)
    todo = [w for w in words if w not in done or (not done[w].get('s') and not done[w].get('od'))]
    print('web fetch', len(todo), 'words', flush=True)
    with open(path, 'a', encoding='utf-8') as out:
        for i, w in enumerate(todo):
            rec = {'k': w, 'w': w, 'sup': '', 'pos': '', 's': []}
            try:
                if w not in done:
                    rec['pos'], rec['s'] = fetch_stdict(w)
                    time.sleep(0.2)
                if not rec['s']:
                    _, rec['s'] = fetch_opendict(w)
                    rec['od'] = 1
                    time.sleep(0.2)
            except Exception as ex:  # noqa: BLE001
                print('  fail', w, ex, flush=True)
                continue
            rec['s'] = rec['s'][:2]
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
            out.flush()
            if i % 50 == 0:
                print(f'  {i}/{len(todo)}', flush=True)


def write_js(name, comment, body):
    with open(os.path.join(DATA, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f'/* {comment} */\nwindow.KM = window.KM || {{}};\n{body}\n')


def main():
    members, sizes = load_dicts()
    print('words', len(members), sizes)
    wpos = load_stdict_pos()
    defs, od = load_defs()
    common = load_common()
    std_bit = 1

    def build_info(w):
        pi = wpos.get(w) or list(range(len(POS9)))
        text, ent, only_ref = render_std(w, pi, defs, od)
        special = bool(ent and ent['s'][0][0])
        if only_ref and render_od(w, od)[0]:
            # 표준국어대사전에는 ‘→ 다른 말’ 참조뿐이고 우리말샘에 제대로 된 뜻이 있으면 그쪽을 쓴다 (예: 늬나노)
            text = ''
        if not text:
            text, oent = render_od(w, od)
            pos = min(wpos[w]) if wpos.get(w) else (POS_FROM_STD.get(oent['pos'], -1) if oent else -1)
            special = bool(oent and (oent['type'] != '일반어' or oent['cat']))
        else:
            pos = min(wpos[w]) if wpos.get(w) else POS_FROM_STD.get(ent.get('pos'), -1)
        if BLOCK_WORD.search(w) or (text and BLOCK_DEF.search(text)):
            return text, BLOCKED_SCORE, pos
        return text, score_word(w, pos, text, special, common, bool(members[w] & std_bit)), pos

    info = {}

    def get_info(w):
        if w not in info:
            info[w] = build_info(w)
        return info[w]

    os.makedirs(DATA, exist_ok=True)
    for old in os.listdir(DATA):
        if old.startswith('words_') or old.startswith('graph') or old.startswith('list_'):
            os.remove(os.path.join(DATA, old))

    chosen_by = {}
    for bit, (did, name, _, _) in enumerate(DICTS):
        pairs = collections.defaultdict(list)
        for w, m in members.items():
            if m & (1 << bit):
                pairs[(w[0], w[-1])].append(w)
        heads = collections.defaultdict(dict)
        chosen = set()
        for (h, t), ws in pairs.items():
            heads[h][t] = len(ws)
            if len(ws) > K_PER_PAIR:
                ws = sorted(ws, key=lambda x: (-get_info(x)[1], len(x), x))
            else:
                for x in ws:
                    get_info(x)
            chosen.update(ws[:K_PER_PAIR])
            chosen.update(x for x in ws[K_PER_PAIR:] if x in FORCE)
        chosen_by[did] = chosen
        lines = [h + ''.join(f'{t}{n}' for t, n in sorted(heads[h].items())) for h in sorted(heads)]
        write_js(f'graph_{did}.js', f'{name} 단어 그래프: 줄마다 [첫 글자]([끝 글자][단어 수])...',
                 '(KM.graphs = KM.graphs || {})[' + json.dumps(did) + '] = '
                 + json.dumps('\n'.join(lines), ensure_ascii=False) + ';')
        print(did, 'pairs', len(pairs), 'heads', len(heads), 'display', len(chosen))

    allchosen = set().union(*chosen_by.values())
    missing = sorted(w for w in allchosen if not get_info(w)[0])
    print('display words', len(allchosen), 'without definition', len(missing))
    if '--fetch' in sys.argv:
        fetch_web_defs(missing)
        defs, od = load_defs()
        for w in missing:
            info[w] = build_info(w)
        print('still without definition', sum(1 for w in allchosen if not info[w][0]))

    # 표시 단어 파일: 앞 사전에서 고른 단어는 앞 사전 파일에, 뒤 사전에서만 고른 단어는 뒤 사전 파일에
    files = {}
    placed = set()
    for did, _, _, _ in DICTS:
        ws = sorted(chosen_by[did] - placed)
        placed.update(ws)
        rows = []
        for w in ws:
            text, sc, pos = info[w]
            text = text.replace('\t', ' ').replace('\n', ' ')
            rows.append(f'{w}\t{pos}\t{sc}\t{members[w]}\t{text}')
        names = []
        for i in range(0, len(rows), CHUNK_ROWS):
            fname = f'words_{did}_{i // CHUNK_ROWS}.js'
            write_js(fname, '표시 단어: 단어\\t품사번호\\t친숙도\\t사전 비트\\t뜻풀이 (표준국어대사전·우리말샘)',
                     '(KM.words = KM.words || []).push(' + json.dumps('\n'.join(rows[i:i + CHUNK_ROWS]), ensure_ascii=False) + ');')
            names.append(fname)
        files[did] = names
        print(did, 'word files', names, len(rows))

    # 직접 입력 검사용 전체 단어 목록 (앞 사전에 없는 단어만 뒤 사전 파일에)
    lists = {}
    seen = set()
    for bit, (did, name, _, _) in enumerate(DICTS):
        ws = sorted(w for w, m in members.items() if (m & (1 << bit)) and w not in seen)
        seen.update(ws)
        fname = f'list_{did}.js'
        write_js(fname, f'{name} 전체 단어 (직접 입력 확인용)',
                 '(KM.lists = KM.lists || {})[' + json.dumps(did) + '] = ' + json.dumps('\n'.join(ws), ensure_ascii=False) + ';')
        lists[did] = fname

    meta = {
        'blockedScore': BLOCKED_SCORE,
        'posLabels': POS_LABEL,
        'dicts': [{'id': d, 'name': n, 'desc': desc, 'bit': 1 << i, 'words': sizes[d],
                   'graph': f'graph_{d}.js',
                   # 이 사전을 쓰려면 불러야 하는 표시 단어 파일 (앞 사전 것 포함)
                   'wordFiles': sum((files[DICTS[j][0]] for j in range(i + 1)), []),
                   'listFiles': [lists[DICTS[j][0]] for j in range(i + 1)]}
                  for i, (d, n, _, desc) in enumerate(DICTS)],
        'built': time.strftime('%Y-%m-%d'),
    }
    write_js('meta.js', '데이터 목록', 'KM.meta = ' + json.dumps(meta, ensure_ascii=False) + ';')
    print('done')


if __name__ == '__main__':
    main()
