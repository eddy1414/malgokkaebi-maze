// 스테이지 만들기:  node tools/make_stages.js [std|ext]   (인자가 없으면 둘 다)
// 게임과 같은 엔진(js/engine.js)으로 정답 경로를 끝까지 둬 보고, 직관적인 단어가 많은 경로부터 고른다.
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const { loadDict, DATA } = require('./load_data.js');

const last = w => w[w.length - 1];

// 스테이지 설계: [깊이, 보기 수, 정답 수, 개수, loseSlack, extraWin] — 사전마다 10단계
//  loseSlack: 오답은 '가장 빠른 승리 + 이만큼' 수 이하로 끝나는 것만 (쉬운 단계에서 틀리면 금방 끝나게)
//  extraWin : 차례마다 정답(돌아가서 이기는 수)을 하나 더 넣을 확률 — 초중반에 '정답 하나 + 오답 둘'만 계속 나오지 않게
const PLANS = {
  std: [
    [3, 3, 1, 2, 1, 0.6],
    [5, 3, 1, 2, 1, 0.5],
    [7, 4, 1, 2, 3, 0.4],
    [9, 4, 1, 1, 3, 0.3],
    [11, 3, 1, 2, null, 0],   // 흑설탕 + 1
    [13, 4, 1, 1, null, 0],
  ],
  ext: [
    [3, 3, 1, 1, 1, 0.6],
    [5, 3, 1, 1, 1, 0.5],
    [7, 4, 1, 1, 3, 0.4],
    [9, 4, 1, 1, 3, 0.3],
    [11, 4, 1, 1, 3, 0.2],
    [13, 4, 1, 1, null, 0],
    [15, 4, 1, 1, null, 0],
    [17, 4, 1, 1, null, 0],
    [19, 4, 1, 1, null, 0],
    [23, 4, 1, 1, null, 0],
  ],
};

function build(dictId) {
  const { KM, dict } = loadDict(dictId);
  const words = E.parseWords(KM.words, KM.meta.posLabels);
  const base = E.parseGraph(KM.graphs[dictId]);
  const newGame = () => new E.Game(base, words, dict.bit);
  // 복합 사전은 그래프가 커서 한 수 계산이 느리므로 후보를 줄인다
  const POOL = dictId === 'ext' ? 10 : 24, STARTS = dictId === 'ext' ? 1 : 2;

  /** 게임(js/game.js)과 똑같이: 선택지 난수는 스테이지 시드 + 지금까지의 단어로 정한다 */
  const turnRand = (seed, chain) => E.rng(E.hashStr(seed + '|' + chain.join(',')));

  /** 플레이어가 늘 가장 빠른 공격 단어를 고를 때의 진행 */
  function simulate(stage) {
    const g = newGame();
    if (!E.isGoodStart(g, stage.start)) return { ok: false, why: 'bad start word ' + stage.start };
    const chain = [stage.start];
    if (stage.start.length > 1) g.use(stage.start);   // 글자만 제시할 때는 쓴 단어가 없다
    let c = last(stage.start);
    const prefer = new Set(stage.prefer || []);
    const first = g.charState(c);
    const turns = [];
    for (let k = 0; k < 40; k++) {
      const opts = g.options(c, {
        n: stage.n, correct: stage.correct, fixed: (stage.fixed || {})[c], loseSlack: stage.loseSlack, extraWin: stage.extraWin,
      }, turnRand(stage.seed, chain));
      if (!opts.length) return { ok: false, why: 'player stuck', turns, first };
      const tailSet = new Set(opts.map(o => last(o.word.word)));
      if (tailSet.size !== opts.length) return { ok: false, why: 'duplicate ending syllable at ' + c, turns, first };
      const wins = opts.filter(o => o.result === 'win').sort((a, b) => a.depth - b.depth);
      const bestAll = g.moves(c).filter(m => m.result === 'win').reduce((a, m) => Math.min(a, m.depth), 99);
      if (!wins.length) return { ok: false, why: 'no correct option at ' + c, turns, first };
      if (wins[0].depth !== bestAll) return { ok: false, why: 'optimal move missing at ' + c, turns, first };
      if (opts.some(o => o.result !== 'win' && o.result !== 'lose')) return { ok: false, why: 'unresolved option at ' + c };
      const right = wins[0];
      turns.push({ c, opts, pick: right });
      g.use(right.word.word); chain.push(right.word.word); c = last(right.word.word);
      const mv = g.computerMove(c, prefer);
      if (!mv) return { ok: true, turns, first, chain };
      if (mv.move.result !== 'lose') return { ok: false, why: 'computer escaped at ' + c, turns, first };
      turns[turns.length - 1].reply = mv;
      g.use(mv.word.word); chain.push(mv.word.word); c = last(mv.word.word);
    }
    return { ok: false, why: 'too long', turns, first };
  }

  function lineScore(sim) {
    // 플레이어가 찾아야 하는 정답과 컴퓨터가 말하는 단어가 얼마나 친숙한가
    const xs = [];
    sim.turns.forEach(t => { xs.push(t.pick.word.score); if (t.reply) xs.push(t.reply.word.score); });
    const avg = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const minPick = Math.min(...sim.turns.map(t => t.pick.word.score));
    const choice = sim.turns.every(t => t.opts.some(o => o.result === 'lose')) ? 0 : -2;
    return avg + 0.3 * minPick + choice;
  }

  // 1) 처음 상태에서 받는 사람이 이기는 글자를 깊이별로
  const g0 = newGame();
  const r0 = g0.solve();
  const byDepth = {};
  r0.typeMap[0].forEach((t, c) => {
    if (t !== 'win' && t !== 'loopwin') return;
    const d = r0.depth[0].get(c);
    (byDepth[d] = byDepth[d] || []).push(c);
  });
  Object.keys(byDepth).forEach(d => byDepth[d].sort());
  console.log(dictId, 'win chars by depth', Object.keys(byDepth).map(d => d + ':' + byDepth[d].length).join(' '));

  /** 제시어 후보: 루트/패배 음절 → 승리 음절 단어, 없으면 글자 하나만 제시 */
  function openings(s, k) {
    const ws = E.startWords(g0, s, k);
    return ws.length ? ws : [{ word: s, score: 0 }];
  }

  function quickScore(s) {
    const sw = openings(s, 1)[0];
    let best = -99;
    g0.moves(s).forEach(m => {
      if (m.result !== 'win') return;
      const ws = g0.wordsFor(m.head, m.tail);
      if (ws.length) best = Math.max(best, ws[0].score);
    });
    return sw.score + best;
  }

  const cache = new Map();
  function candidates(depth, cfg, exclude) {
    const key = [depth, cfg.n, cfg.correct, cfg.loseSlack, cfg.extraWin].join('/');
    if (!cache.has(key)) cache.set(key, computeCandidates(depth, cfg));
    return cache.get(key).filter(x => !exclude.has(x.s));
  }
  function computeCandidates(depth, cfg) {
    const res = [];
    const pool = (byDepth[depth] || []).slice().sort((a, b) => quickScore(b) - quickScore(a)).slice(0, POOL);
    for (const s of pool) {
      let best = null;
      for (const sw of openings(s, STARTS)) {
        const st = { start: sw.word, n: cfg.n, correct: cfg.correct, loseSlack: cfg.loseSlack, extraWin: cfg.extraWin, seed: 'km-' + dictId + '-' + sw.word };
        const sim = simulate(st);
        if (!sim.ok || sim.first.type !== 'win' || sim.first.depth !== depth) continue;
        const sc = lineScore(sim) + 0.3 * sw.score;
        if (!best || sc > best.sc) best = { s, st, sim, sc };
      }
      if (best) res.push(best);
    }
    res.sort((a, b) => b.sc - a.sc);
    return res;
  }

  const used = new Set();
  const stages = [];

  if (dictId === 'std') {
    // 튜토리얼 1: 한방 단어 (사용자 설계: '사' → 사기 / 사이 / 사기꾼)
    const t1cands = E.startWords(g0, '사').map(w => w.word);
    const t1start = t1cands.includes('척척박사') ? '척척박사' : t1cands[0];
    used.add('사');
    stages.push({
      id: 't1', tutorial: true, name: '튜토리얼 1', sub: '한방 단어', start: t1start, n: 3, correct: 1, seed: 'km-t1',
      fixed: { '사': ['사기', '사이', '사기꾼'] },
      coach: {
        start: `말도깨비가 ‘${t1start}’라고 했어요. 이제 ‘사’로 시작하는 단어를 이어야 해요. 상대가 이어 말할 수 없는 글자로 끝나는 단어를 ‘한방 단어’라고 해요. 어떤 단어가 한방 단어일까요?`,
      },
    });
    // 튜토리얼 2 (사용자 설계): 상대의 대답이 하나뿐인 글자로 몰아넣기
    //   덮밥 → 밥그릇 (‘릇’은 두음 법칙 ‘늣’의 늣치 하나뿐) → 늣치 → 치읓 (‘읓’으로 시작하는 단어 없음)
    used.add('밥');
    stages.push({
      id: 't2', tutorial: true, name: '튜토리얼 2', sub: '몰아넣기', start: '덮밥', n: 3, correct: 1, loseSlack: 1, extraWin: 0,
      seed: 'km-t2',
      fixed: { '밥': ['밥그릇', '밥상', '밥알'], '치': ['치읓', '치마', '치약'] },
      prefer: ['늣치'],
      coach: {
        start: '이번엔 한 번에 끝낼 수 없어요. 대신 말도깨비가 낼 수 있는 단어가 딱 하나뿐인 글자를 넘겨 보세요. 예를 들어 ‘-그릇’으로 끝나는 단어를 받으면 ‘늣치’(두음 법칙으로 릇→늣)밖에 낼 수 없고, ‘-슘’으로 끝나는 단어를 받으면 ‘슘페터’밖에 낼 수 없어요.',
        win: '좋아요! 말도깨비가 버텼지만 형세는 여전히 당신 편이에요. 계속 몰아붙이세요.',
        finish: '보셨죠? 말도깨비는 그 단어 하나밖에 낼 수 없었어요. 이제 끝낼 차례예요. 이을 단어가 없는 글자로 끝나는 단어를 고르세요.',
        lose: '앗, 말도깨비에게 이기는 글자를 넘겨줬어요. 이제는 어떤 단어를 골라도 결국 지게 돼요. 끝까지 버텨 본 뒤, 복기에서 어디서 길을 잃었는지 확인해 보세요.',
      },
    });
  }

  // 흑설탕 스테이지 (사용자 예시) — 표준 사전 11수 구간 첫 스테이지
  const SUGAR = dictId === 'std' ? {
    start: '흑설탕', n: 3, correct: 1, seed: 'km-std-흑설탕',
    fixed: { '탕': ['탕솥', '탕탕', '탕수육'], '솥': ['솥단지', '솥뚜껑'] },
    prefer: ['육가크로뮴', '탕솥', '솥뚜껑'],
  } : null;
  if (SUGAR) used.add('탕');

  const pathWords = new Set();
  const lineWords = sim => {
    const ws = new Set();
    sim.turns.forEach(t => { ws.add(t.pick.word.word); if (t.reply) ws.add(t.reply.word.word); });
    return ws;
  };
  const overlap = sim => {
    const ws = lineWords(sim);
    let k = 0;
    ws.forEach(w => { if (pathWords.has(w)) k++; });
    return k / Math.max(1, ws.size);
  };

  let no = 0;
  for (const [depth, n, correct, count, loseSlack, extraWin] of PLANS[dictId]) {
    const list = candidates(depth, { n, correct, loseSlack, extraWin }, used);
    const bucket = [];
    if (SUGAR && depth === 11 && n === 3) {
      const sim = simulate(SUGAR);
      if (!sim.ok) throw new Error('흑설탕 스테이지 검증 실패: ' + sim.why);
      bucket.push({ s: '탕', st: SUGAR, sim, sc: 99 });
      lineWords(sim).forEach(w => pathWords.add(w));
    }
    // 이미 뽑은 단계와 정답 경로(내 정답 + 말도깨비 대답)가 많이 겹치는 후보는 뒤로 미룬다
    const fresh = list.filter(x => !used.has(x.s)).map(x => ({ x, ov: overlap(x.sim) }));
    const ordered = fresh.filter(y => y.ov <= 0.34).concat(fresh.filter(y => y.ov > 0.34).sort((a, b) => a.ov - b.ov));
    for (const { x } of ordered) {
      if (bucket.length >= count) break;
      if (used.has(x.s)) continue;
      bucket.push(x);
      used.add(x.s);
    }
    bucket.forEach(x => lineWords(x.sim).forEach(w => pathWords.add(w)));
    if (bucket.length < count) console.warn(`  depth ${depth}: ${bucket.length}/${count} 개만 만듦`);
    bucket.sort((a, b) => b.sc - a.sc);   // 같은 구간 안에서는 쉬운(친숙한) 것부터
    for (const x of bucket) {
      no++;
      stages.push({
        id: dictId + '-' + no, no, name: no + '단계', sub: depth + '수', start: x.st.start, n, correct, seed: x.st.seed,
        loseSlack: x.st === SUGAR ? null : loseSlack, extraWin: x.st === SUGAR ? 0 : extraWin,
        fixed: x.st.fixed, prefer: x.st.prefer, depth,
      });
    }
  }

  // 전부 다시 검증
  for (const st of stages) {
    const sim = simulate(st);
    if (!sim.ok) throw new Error(st.name + ' 검증 실패: ' + sim.why);
    st.depth = sim.first.depth;
    console.log(
      ' ', st.name.padEnd(6), String(st.depth).padStart(2) + '수', st.start.padEnd(6),
      sim.turns.map(t => `${t.c}→${t.pick.word.word}[${t.opts.map(o => (o.result === 'win' ? '승' : '패') + o.depth).join(',')}]` + (t.reply ? `/${t.reply.word.word}` : '')).join(' ')
    );
  }
  return stages;
}

const which = process.argv[2] ? [process.argv[2]] : ['std', 'ext'];
for (const d of which) {
  const stages = build(d);
  const out = '/* 스테이지 목록 — tools/make_stages.js 로 생성 */\nwindow.KM = window.KM || {};\n(KM.stages = KM.stages || {})['
    + JSON.stringify(d) + '] = ' + JSON.stringify(stages, null, 1) + ';\n';
  fs.writeFileSync(path.join(DATA, `stages_${d}.js`), out, 'utf8');
  console.log('saved', d, stages.length, 'stages');
}
