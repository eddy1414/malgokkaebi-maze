/* 말도깨비 미로 — 화면과 게임 진행 */
(function () {
  'use strict';

  var E = window.KMEngine;
  var Gob = window.KMGoblin;
  var Snd = window.KMSound;
  var KM = window.KM = window.KM || {};
  var DATA_VER = '12';   // 데이터 파일 버전 (고칠 때마다 올린다 — 브라우저가 옛 파일을 쓰지 않게)
  var $ = function (s) { return document.querySelector(s); };
  var last = function (w) { return w[w.length - 1]; };

  /* ---------- 저장 (브라우저에만, 실패해도 게임은 된다) ---------- */
  var LS_KEY = 'km-maze-v1';
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  var saved = loadSaved();
  delete saved.cleared;   // 전시용: 관람객이 계속 바뀌므로 통과 기록은 남기지 않는다
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch (e) { /* 저장 안 됨 */ } }

  /* ---------- 랜덤 대결 난이도 (사전마다 이기기까지 걸리는 수 구간) ---------- */
  var LEVELS = {
    // loseSlack: 오답은 가장 빠른 승리 + 이만큼 수 이하로 끝남 / extraWin: 정답이 둘 나오는 차례의 비율
    std: [
      { name: '입문', depths: [3], n: 3, correct: 1, extraWin: 0.6, loseSlack: 1, top: 4 },
      { name: '초급', depths: [5], n: 3, correct: 1, extraWin: 0.5, loseSlack: 1, top: 6 },
      { name: '중급', depths: [7], n: 4, correct: 1, extraWin: 0.4, loseSlack: 3, top: 8 },
      { name: '고급', depths: [9], n: 4, correct: 1, extraWin: 0.2, top: 10 },
      { name: '극한', depths: [11, 13], n: 4, correct: 1, top: 12 }
    ],
    ext: [
      { name: '입문', depths: [3, 5], n: 3, correct: 1, extraWin: 0.6, loseSlack: 1, top: 4 },
      { name: '초급', depths: [7, 9], n: 4, correct: 1, extraWin: 0.5, loseSlack: 3, top: 6 },
      { name: '중급', depths: [11, 13], n: 4, correct: 1, extraWin: 0.4, loseSlack: 3, top: 8 },
      { name: '고급', depths: [15, 17], n: 4, correct: 1, extraWin: 0.2, top: 10 },
      { name: '극한', depths: [19, 21, 23], n: 4, correct: 1, top: 12 }
    ]
  };

  /* ---------- 데이터 불러오기 ---------- */
  var App = { dicts: {}, words: null, files: new Set(), dictId: saved.dict || 'std' };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error(src + ' 파일을 읽지 못했어요.')); };
      document.body.appendChild(s);
    });
  }

  function setLoad(frac, msg) {
    $('#load-bar').style.width = Math.round(frac * 100) + '%';
    if (msg) $('#load-msg').textContent = msg;
  }

  function loadDict(id) {
    var d = App.dicts[id];
    if (d.ready) return Promise.resolve(d);
    var files = [d.meta.graph].concat(d.meta.wordFiles).concat(['stages_' + id + '.js'])
      .filter(function (f) { return !App.files.has(f); });
    var i = 0;
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        setLoad(i / files.length, d.meta.name + ' 불러오는 중… (' + (i + 1) + '/' + files.length + ')');
        // 스테이지 파일이 없으면(아직 안 만들었으면) 스테이지 없이 랜덤 대결만 쓸 수 있게 넘어간다
        if (/^stages_/.test(f)) return loadScript('data/' + f + '?v=' + DATA_VER).catch(function () { /* 없음 */ });
        return loadScript('data/' + f + '?v=' + DATA_VER);
      }).then(function () {
        App.files.add(f);
        i++;
        while (KM.words && KM.words.length) App.words.add(KM.words.shift());
      });
    });
    return chain.then(function () {
      setLoad(1, '승패를 분석하는 중…');
      return new Promise(function (r) { setTimeout(r, 30); });
    }).then(function () {
      d.base = E.parseGraph(KM.graphs[id]);
      d.stages = (KM.stages && KM.stages[id]) || [];
      indexDict(d);
      d.ready = true;
      return d;
    });
  }

  /** 랜덤 대결용: 깊이별 승리 음절과, 글자마다 쓸 수 있는 제시어(루트/패배 음절 → 승리 음절) */
  function indexDict(d) {
    var g = new E.Game(d.base, App.words, d.meta.bit);
    var r = g.solve();
    d.byDepth = {};
    r.typeMap[0].forEach(function (t, c) {
      if (t !== 'win' && t !== 'loopwin') return;
      var dp = r.depth[0].get(c);
      (d.byDepth[dp] = d.byDepth[dp] || []).push(c);
    });
    var headOk = new Map();
    d.starts = new Map();
    App.words.info.forEach(function (w) {
      if (!(w.dicts & d.meta.bit) || w.blocked) return;
      var t = last(w.word), h = w.word[0];
      var tt = r.typeMap[0].get(t);
      if (tt !== 'win' && tt !== 'loopwin') return;
      if (!headOk.has(h)) headOk.set(h, g.charState(h).type !== 'win');
      if (!headOk.get(h)) return;
      var arr = d.starts.get(t);
      if (!arr) { arr = []; d.starts.set(t, arr); }
      arr.push(w);
    });
    d.starts.forEach(function (arr) { arr.sort(function (a, b) { return b.score - a.score; }); });
  }

  /* ---------- 화면 전환 ---------- */
  var SCREENS = ['load', 'title', 'stages', 'random', 'help', 'game'];
  function show(name) {
    SCREENS.forEach(function (s) { $('#scr-' + s).hidden = s !== name; });
    if (name !== 'game' && name !== 'load') Snd.bgm('lobby');
    $('#result').hidden = true;
    $('#ask').hidden = true;
    window.scrollTo(0, 0);
    if (name === 'title') { Gob.set($('#scr-title .goblin-slot'), 'idle'); renderDictChoice(); }
    if (name === 'stages') renderStages();
    if (name === 'random') renderRandom();
  }

  function withDict(id, then) {
    var d = App.dicts[id];
    if (d.ready) { then(d); return; }
    var back = SCREENS.filter(function (s) { return !$('#scr-' + s).hidden; })[0];
    show('load');
    loadDict(id).then(then, function (err) {
      alert(err.message);
      show(back || 'title');
    });
  }

  /* ---------- 글자 도우미 ---------- */
  function hasBatchim(ch) {
    var k = ch.charCodeAt(0) - 0xAC00;
    return k >= 0 && k <= 11171 && k % 28 !== 0;
  }
  /** ‘탕’으로 / ‘사’로 / ‘물’로 */
  function euro(ch) {
    var k = ch.charCodeAt(0) - 0xAC00;
    var jong = k % 28;
    return (hasBatchim(ch) && jong !== 8) ? '으로' : '로';
  }
  /** 두음 법칙이 안 되는데 헷갈리기 쉬운 글자 안내: ㄹ+ㅓ(러)·ㅔ(레)… 계열, 끄투에서 안 바뀌는 냐 계열 */
  var NO_DUEUM_R = [4, 5, 9, 10, 14, 15, 16, 19];   // ㅓ ㅔ ㅘ ㅙ ㅝ ㅞ ㅟ ㅢ
  function syl(cho, jung) { return String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28); }
  function noDueumNote(c) {
    var k = c.charCodeAt(0) - 0xAC00;
    if (k < 0 || k > 11171) return '';
    var cho = Math.floor(k / 588), jung = Math.floor(k / 28) % 21;
    var fam = syl(cho, jung) === c ? '' : '(' + c + ')';
    if (cho === 5 && NO_DUEUM_R.indexOf(jung) >= 0) {
      return '‘' + syl(5, jung) + '’ 계열' + fam + '은 두음 법칙이 적용되지 않아요. ‘' + syl(2, jung) + '’·‘' + syl(11, jung) + '’로 바꿔 시작할 수 없어요.';
    }
    if (cho === 2 && jung === 2) {
      return '‘냐’ 계열' + fam + '은 끄투에서 두음 법칙이 적용되지 않아요. ‘야’로 바꿔 시작할 수 없어요.';
    }
    return '';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function defHtml(w) {
    if (!w.def && w.typed) return '<span class="muted">직접 입력한 단어예요. (뜻풀이는 보기로 나오는 단어에만 들어 있어요)</span>';
    if (!w.def) return '<span class="muted">뜻풀이를 찾지 못한 단어예요.</span>';
    return esc(w.def).replace(/〔([^〕]+)〕/g, '<span class="cat">〔$1〕</span>');
  }
  function posHtml(w) { return w.pos ? '<span class="pos">「' + esc(w.pos) + '」</span>' : ''; }
  function tiles(word, cls) {
    return word.split('').map(function (ch) { return '<span class="tile ' + (cls || '') + '">' + esc(ch) + '</span>'; }).join('');
  }
  function label(result, depth) {
    if (result === 'win') return '<span class="chip win">' + depth + '수 승리</span>';
    if (result === 'lose') return '<span class="chip lose">' + depth + '수 패배</span>';
    return '<span class="chip">?</span>';
  }

  /* ---------- 첫 화면: 사전 선택 ---------- */
  function ruleText(d) {
    var src = d.id === 'ext' ? '우리말샘' : '표준국어대사전';
    return '<p><strong>이 게임은 끄투룰</strong>(' + src + '의 용언(동사·형용사) 제외 모든 단어 허용)<strong>을 기반으로 만들었습니다.</strong></p>' +
      '<p><strong>컴퓨터는 항상 최적의 수를 플레이합니다.</strong> 이길 수 있으면 가장 빨리 이기고, 질 수밖에 없으면 가장 오래 버팁니다.</p>' +
      '<p class="small muted">단어 목록: ' + esc(d.name) + ' · 두 글자 이상 · 두음 법칙 적용 · 한 판에서 같은 단어는 한 번만</p>';
  }
  function renderDictChoice() {
    var box = $('#dict-choices-title');
    var metaDicts = KM.meta.dicts;
    box.innerHTML = metaDicts.map(function (d) {
      var on = d.id === App.dictId;
      return '<button class="choice" role="radio" aria-checked="' + on + '" data-dict="' + d.id + '">' +
        '<span class="choice-t">' + esc(d.name) + (d.id === 'std' ? ' <span class="chip win">추천</span>' : '') + '</span>' +
        '<span class="choice-d">' + esc(d.desc) + ' · ' + d.words.toLocaleString('ko-KR') + '단어</span></button>';
    }).join('');
    var cur = metaDicts.filter(function (d) { return d.id === App.dictId; })[0];
    $('#rule-note').innerHTML = ruleText(cur);
  }
  function chooseDict(id) {
    if (id === App.dictId) return;
    withDict(id, function () {
      App.dictId = id;
      saved.dict = id; save();
      show('title');
    });
  }

  /* ---------- 스테이지 목록 ---------- */
  /** 모든 단계는 처음부터 열려 있다 (전시용이라 통과 기록을 남기지 않음) */
  function stageUnlocked() {
    return true;
  }
  function stageTile(st, unlocked) {
    return '<button class="stage" data-stage="' + st.id + '"' + (unlocked ? '' : ' disabled') + '>' +
      (st.tutorial
        ? '<span class="stage-name">' + esc(st.name) + '</span><span class="stage-start">' + esc(st.sub) + '</span>'
        : '<span class="stage-no">' + st.no + '</span><span class="chip">' + st.depth + '수 · 보기 ' + st.n + '개</span>') +
      '<span class="stage-start">' + (unlocked ? '‘' + esc(st.start) + '’부터' : '잠김') + '</span>' +
      '</button>';
  }
  function renderStages() {
    var d = App.dicts[App.dictId];
    var list = d.stages.filter(function (s) { return !s.tutorial; });   // 튜토리얼은 첫 화면에서만
    $('#stage-grid').innerHTML = list.map(function (s, i) { return stageTile(s, stageUnlocked(list, i)); }).join('');
    $('#stage-progress').textContent = d.meta.name + ' · ' + list.length + '단계';
  }
  function findStage(id) {
    var all = App.dicts.std.stages.concat(App.dicts.ext.ready ? App.dicts.ext.stages : []);
    return all.filter(function (s) { return s.id === id; })[0];
  }
  function stageDict(st) { return st.tutorial || st.id.indexOf('std') === 0 ? 'std' : 'ext'; }
  function startStage(st) {
    var did = stageDict(st);
    withDict(did, function () {
      startSession({
        kind: 'stage', stage: st, dictId: did, start: st.start, n: st.n, correct: st.correct, seed: st.seed,
        fixed: st.fixed, prefer: st.prefer, coach: st.coach, loseSlack: st.loseSlack, extraWin: st.extraWin,
        title: st.tutorial ? st.name : st.name + ' · ' + st.depth + '수'
      });
    });
  }

  /* ---------- 랜덤 대결 ---------- */
  function levelPool(d, lv) {
    var pool = [];
    lv.depths.forEach(function (dp) {
      (d.byDepth[dp] || []).forEach(function (c) { pool.push(c); });
    });
    return pool;
  }
  function renderRandom() {
    var d = App.dicts[App.dictId];
    var levels = LEVELS[App.dictId];
    if (saved.level == null) saved.level = 0;
    $('#random-dict').textContent = d.meta.name;
    $('#level-choices').innerHTML = levels.map(function (lv, i) {
      var pool = levelPool(d, lv);
      var on = i === saved.level;
      var dep = lv.depths.length > 1 ? lv.depths[0] + '~' + lv.depths[lv.depths.length - 1] + '수' : lv.depths[0] + '수';
      return '<button class="choice" role="radio" aria-checked="' + on + '" data-level="' + i + '"' + (pool.length ? '' : ' disabled') + '>' +
        '<span class="choice-t">' + (i + 1) + '단계 ' + lv.name + '</span>' +
        '<span class="choice-d">' + dep + ' 승리 · 보기 ' + lv.n + '개' + (lv.extraWin ? ' · 정답이 둘인 차례도 있음' : '') + '</span>' +
        '<span class="choice-d">시작 글자 ' + pool.length + '가지</span></button>';
    }).join('');
  }
  function startRandom(levelIdx, replay) {
    var d = App.dicts[App.dictId];
    var lv = LEVELS[App.dictId][levelIdx];
    if (replay) { startSession(replay); return; }
    var pool = levelPool(d, lv);
    if (!pool.length) return;
    for (var tries = 0; tries < 20; tries++) {
      var c = pool[Math.floor(Math.random() * pool.length)];
      // 루트/패배 음절 → 승리 음절 제시어가 없으면 글자만 제시
      var cands = d.starts.has(c) ? d.starts.get(c).slice(0, lv.top) : [{ word: c }];
      var sw = cands[Math.floor(Math.random() * cands.length)];
      var g = new E.Game(d.base, App.words, d.meta.bit);
      if (!E.isGoodStart(g, sw.word)) continue;
      if (sw.word.length > 1) g.use(sw.word);
      var st = g.charState(c);
      if (st.type !== 'win' || lv.depths.indexOf(st.depth) < 0) continue;
      startSession({
        kind: 'random', dictId: App.dictId, level: levelIdx, start: sw.word, n: lv.n, correct: lv.correct,
        loseSlack: lv.loseSlack, extraWin: lv.extraWin,
        seed: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
        title: '랜덤 ' + (levelIdx + 1) + '단계 ' + lv.name + ' · ' + st.depth + '수'
      });
      return;
    }
    alert('알맞은 시작 단어를 찾지 못했어요. 다시 눌러 주세요.');
  }

  /* ---------- 한 판 ---------- */
  var S = null;

  function startSession(opts) {
    var d = App.dicts[opts.dictId];
    var game = new E.Game(d.base, App.words, d.meta.bit);
    S = {
      opts: opts, game: game, chain: [], log: [], over: false, prefer: new Set(opts.prefer || []),
      coachIdx: 0, timer: null, token: {}, history: []
    };
    show('game');
    Snd.bgm('game');
    $('#game-title').textContent = opts.title;
    $('#game-dict').textContent = d.meta.name;
    Gob.set($('#game-goblin'), 'idle');
    var syllable = opts.start.length === 1;   // 알맞은 제시어가 없으면 글자 하나만 제시한다
    var w = syllable
      ? { word: opts.start, pos: '', def: '', syllable: true }
      : (App.words.info.get(opts.start) || { word: opts.start, pos: '', def: '' });
    if (!syllable) game.use(opts.start);
    S.chain.push(opts.start);
    S.log.push({ who: 'cpu', word: w, opening: true });
    S.c = last(opts.start);
    renderCpu(w);
    renderChain();
    $('#options').innerHTML = '';
    $('#item-note').hidden = true;
    renderItems();
    mapInit();
    later(playerTurn, 380);
  }

  function later(fn, ms) {
    var tok = S.token;
    S.timer = setTimeout(function () { if (S && S.token === tok) fn(); }, ms);
  }
  function stopSession() {
    if (!S) return;
    clearTimeout(S.timer);
    S.token = null;
    S = null;
  }

  function turnRand() { return E.rng(E.hashStr(S.opts.seed + '|' + S.chain.join(','))); }

  function renderCpu(w) {
    $('#cpu-word').innerHTML = '<span class="stamp" style="display:contents">' + tiles(w.word) + '</span>';
    var t = $('#cpu-word').querySelectorAll('.tile');
    for (var i = 0; i < t.length; i++) { t[i].classList.add('stamp'); t[i].style.animationDelay = (i * 45) + 'ms'; }
    if (t.length) t[t.length - 1].classList.add('hot');
    $('#cpu-def').innerHTML = w.syllable
      ? '제시 글자예요. ‘' + esc(w.word) + '’' + euro(w.word) + ' 시작하는 단어로 이어 주세요.'
      : posHtml(w) + defHtml(w);
  }

  function renderChain() {
    var html = S.log.map(function (e) {
      return '<li class="' + e.who + '" title="' + esc(e.word.def || '') + '">' + esc(e.word.word) + '</li>';
    }).join('');
    $('#chain').innerHTML = html;
    var ch = $('#chain');
    ch.scrollLeft = ch.scrollWidth;
    $('#game-turn').textContent = S.chain.length + '번째 단어';
  }

  function renderPrompt(c) {
    $('#prompt-char').textContent = c;
    $('#prompt-char').classList.remove('stamp'); void $('#prompt-char').offsetWidth; $('#prompt-char').classList.add('stamp');
    $('#prompt-line').innerHTML = '<b>‘' + esc(c) + '’</b>' + euro(c) + ' 시작하는 단어를 고르세요';
    var alt = E.dueum(c);
    var d = App.dicts[S.opts.dictId];
    $('#prompt-alt').textContent = (alt && d.base.has(alt)) ? '두음 법칙: ‘' + alt + '’' + euro(alt) + ' 시작해도 돼요' : noDueumNote(c);
  }

  /**
   * 튜토리얼 안내. coach = { start, win, finish, lose }
   * 처음엔 start, 그다음부터는 지금 받은 글자의 형세에 맞춰:
   * 이기는 중이면 win(한 수 남았으면 finish), 길을 잃었으면 lose(한 번만)
   */
  function renderCoach() {
    var co = S.opts.coach;
    var box = $('#coach');
    var text = null;
    if (co && !S.coachStarted) {
      text = co.start;
      S.coachStarted = true;
    } else if (co) {
      var st = S.game.charState(S.c);
      if (st.type === 'win') text = st.depth <= 1 ? co.finish : co.win;
      else if (st.type === 'lose' && !S.coachLost) { text = co.lose; S.coachLost = true; }
    }
    if (!text) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="chip">안내</span><p>' + esc(text) + '</p>';
  }

  /** 내 차례가 시작될 때의 상태 (전 턴으로 돌아가기용) */
  function snapshot() {
    return {
      used: new Set(S.game.used), usedPair: new Map(S.game.usedPair), chain: S.chain.slice(), logLen: S.log.length,
      c: S.c, coachStarted: S.coachStarted, coachLost: S.coachLost,
      map: S.map ? { x: S.map.x, y: S.map.y, W: S.map.W, sideDir: S.map.sideDir, html: $('#map-svg').innerHTML } : null
    };
  }

  function playerTurn() {
    S.history.push(snapshot());
    var opts = S.game.options(S.c, {
      n: S.opts.n, correct: S.opts.correct, fixed: (S.opts.fixed || {})[S.c], loseSlack: S.opts.loseSlack,
      extraWin: S.opts.extraWin
    }, turnRand());
    S.cur = opts;
    renderPrompt(S.c);
    Gob.set($('#game-goblin'), 'idle');
    if (!opts.length) { mapDeadEnd(function () { endGame('lose'); }); return; }
    mapFork(opts);
    renderCoach();
    var alt = E.dueum(S.c);
    $('#options').className = 'options';
    $('#options').innerHTML = opts.map(function (o, i) {
      var w = o.word.word;
      var headLen = (w[0] === S.c || w[0] === alt) ? 1 : 0;
      return '<button class="opt" data-i="' + i + '">' +
        '<span class="key">' + (i + 1) + '</span>' +
        '<span class="w"><span class="head">' + esc(w.slice(0, headLen)) + '</span>' + esc(w.slice(headLen)) + '</span>' +
        '<span class="d">' + posHtml(o.word) + defHtml(o.word) + '</span>' +
        '<span class="peek" hidden></span>' +
        '</button>';
    }).join('');
    S.usedItems = {};
    hideTip();
    $('#item-note').hidden = true;
    renderItems();
    resetDirect();
    placeOptions();
    followMap();
    var first = $('#options .opt');
    if (first && document.activeElement && document.activeElement.classList.contains('opt')) first.focus();
  }

  function pick(i) {
    if (!S || S.over || !S.cur || !S.cur[i] || $('#options').classList.contains('busy')) return;
    playMove(S.cur[i], i);
  }

  /** 보기(i)나 직접 입력(i = -1)으로 단어를 낸다 */
  function playMove(o, i) {
    $('#options').classList.add('busy');
    $('#direct').hidden = true;
    var btns = document.querySelectorAll('#options .opt');
    for (var k = 0; k < btns.length; k++) {
      btns[k].disabled = true;
      btns[k].classList.add(k === i ? 'chosen' : 'faded');
    }
    S.log.push({ who: 'me', word: o.word, result: o.result, depth: o.depth, opts: S.cur, typed: !!o.typed });
    S.game.use(o.word.word);
    S.chain.push(o.word.word);
    S.c = last(o.word.word);
    S.cur = null;
    renderChain();
    renderItems();
    $('#item-note').hidden = true;
    $('#coach').hidden = true;
    Gob.set($('#game-goblin'), 'think');

    // 말도깨비의 대답을 미리 정해 두고, 갈림길까지 멈추지 않고 걸어간다
    var mv = S.game.computerMove(S.c, S.prefer);
    if (mv) {
      S.log.push({ who: 'cpu', word: mv.word, result: mv.move.result, depth: mv.move.depth });
      S.game.use(mv.word.word);
      S.chain.push(mv.word.word);
      S.c = last(mv.word.word);
    }
    mapAdvance(i, o.word.word, mv, function () {
      if (mv) playerTurn();
      else endGame('win');
    });
  }

  /* ---------- 직접 입력 (랜덤 대결) ---------- */
  App.wordSets = {};

  /** 직접 입력 확인용 전체 단어 목록을 처음 쓸 때 불러온다 */
  function loadWordSet(dictId) {
    if (App.wordSets[dictId]) return Promise.resolve(App.wordSets[dictId]);
    var d = App.dicts[dictId];
    var chain = Promise.resolve();
    d.meta.listFiles.forEach(function (f) {
      chain = chain.then(function () { return App.files.has(f) ? null : loadScript('data/' + f + '?v=' + DATA_VER).then(function () { App.files.add(f); }); });
    });
    return chain.then(function () {
      var set = new Set();
      d.meta.listFiles.forEach(function (f) {
        var id = f.replace(/^list_|\.js$/g, '');
        (KM.lists[id] || '').split('\n').forEach(function (w) { if (w) set.add(w); });
      });
      App.wordSets[dictId] = set;
      return set;
    });
  }

  function resetDirect() {
    var on = S && S.opts.kind === 'random' && S.cur && S.cur.length && !S.over;
    $('#direct').hidden = !on;
    $('#direct-row').hidden = true;
    $('#direct-toggle').hidden = false;
    $('#direct-err').textContent = '';
    $('#direct-input').value = '';
  }

  function openDirect() {
    $('#direct-toggle').hidden = true;
    $('#direct-row').hidden = false;
    $('#direct-input').focus();
    // 목록을 미리 불러 둔다
    if (!App.wordSets[S.opts.dictId]) {
      $('#direct-err').textContent = '사전 목록을 불러오는 중…';
      loadWordSet(S.opts.dictId).then(function () {
        if ($('#direct-err').textContent === '사전 목록을 불러오는 중…') $('#direct-err').textContent = '';
      });
    }
  }

  function submitDirect() {
    if (!S || S.over || !S.cur || $('#options').classList.contains('busy')) return;
    var err = function (m) { $('#direct-err').textContent = m; $('#direct-input').focus(); };
    var word = $('#direct-input').value.replace(/\s+/g, '');
    var c = S.c, alt = E.dueum(c);
    var d = App.dicts[S.opts.dictId];
    if (!word) return;
    if (!/^[가-힣]+$/.test(word)) { err('한글로 된 단어만 낼 수 있어요.'); return; }
    if (word.length < 2) { err('두 글자 이상이어야 해요.'); return; }
    if (word[0] !== c && !(alt && word[0] === alt)) {
      err('‘' + c + '’' + euro(c) + ' 시작해야 해요.' + ((alt && d.base.has(alt)) ? ' (두음 법칙으로 ‘' + alt + '’도 돼요)' : ''));
      return;
    }
    if (S.game.used.has(word)) { err('이번 판에 이미 나온 단어예요.'); return; }
    var dictId = S.opts.dictId, tok = S.token;
    loadWordSet(dictId).then(function (set) {
      if (!S || S.token !== tok) return;
      if (!set.has(word)) { err('‘' + word + '’은(는) ' + d.meta.name + '에 없는 단어예요.'); return; }
      var g = S.game.clone();
      g.use(word);
      var st = g.charState(last(word));
      if (st.type === 'route') {
        err('‘' + last(word) + '’은(는) 승패가 정해지지 않는 루트 글자라서, 이 게임에서는 그리로 이어지는 단어를 쓸 수 없어요.');
        return;
      }
      var info = App.words.info.get(word);
      var w = info ? Object.assign({}, info, { typed: true }) : { word: word, pos: '', def: '', typed: true };
      playMove({ word: w, result: st.type === 'lose' ? 'win' : 'lose', depth: st.depth + 1, typed: true }, -1);
    });
  }


  /* ---------- 미로 지도 (아래에서 위로 올라간다) ----------
   * 한 차례 = 갈림길(보기마다 길 하나) + 말도깨비가 낸 단어가 바닥에 적힌 복도.
   * 좌표는 지도 안의 픽셀. 위로 갈수록 y 가 작아진다.
   */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAP_H = 9000, FORK_H = 176, CORR_H = 150;
  var SIDE = 98;             // 길이 지도 가장자리에서 떨어지는 거리 (팻말 절반 너비 + 여유)
  var DRIFT = 3400;          // 옆길로 계속 가도 지도가 끊기지 않게 좌우로 두는 여유 폭
  var CAM_Y = 0.62;          // 캐릭터가 서 있는 화면 높이 비율
  var SPEED = 0.26;          // 걷는 속도 (픽셀/ms) — 길이와 상관없이 일정

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function addTo(layer, name, attrs) {
    var el = svgEl(name, attrs);
    $('#mp-' + layer).appendChild(el);
    return el;
  }
  function mapWidth() {
    var view = $('#map').clientWidth || 640;
    return Math.max(1600, view + DRIFT * 2);   // 갈림길마다 옆으로 흘러가도 지도가 남아 있게
  }
  /** 팻말 절반 너비 (CSS 가 화면 폭에 따라 정하므로 실제 값을 재서 쓴다) */
  function sideMargin() {
    var b = document.querySelector('#options .opt');
    var w = b ? b.getBoundingClientRect().width : 0;
    return Math.max(SIDE, Math.round(w / 2) + 14);
  }

  /** 판 시작: 지도를 비우고 입구에 세운다 */
  function mapInit() {
    var svg = $('#map-svg'), W = mapWidth();
    svg.setAttribute('width', W);
    svg.setAttribute('height', MAP_H);
    svg.innerHTML = '<g id="mp-walls"></g><g id="mp-floors"></g><g id="mp-marks"></g>';
    $('#map-inner').style.width = W + 'px';
    $('#map-inner').style.height = MAP_H + 'px';
    S.map = { W: W, x: Math.round(W / 2), y: MAP_H - 150, branches: [] };
    segment('M' + S.map.x + ',' + (MAP_H + 30) + ' L' + S.map.x + ',' + S.map.y);
    mapSign(S.map.x, MAP_H - 76, '입구', '');
    $('#walker').hidden = false;
    if (!$('#walker').firstChild) $('#walker').innerHTML = Gob.hero();
    $('#walker').className = 'walker idle';
    placeWalker(S.map.x, S.map.y);
  }

  /** 복도 하나 (벽 + 바닥) */
  function segment(d, cls) {
    var wall = addTo('walls', 'path', { d: d, class: 'mp-wall' });
    var floor = addTo('floors', 'path', { d: d, class: 'mp-floor' + (cls ? ' ' + cls : '') });
    return { wall: wall, floor: floor, d: d };
  }
  function mapSign(x, y, text, cls) {
    var t = addTo('marks', 'text', { x: x, y: y, class: 'mp-sign ' + (cls || '') });
    t.textContent = text;
    return t;
  }
  /** 지나온 길 바닥에 단어를 적는다 */
  function floorWord(seg, word, who, hidden) {
    var len = seg.floor.getTotalLength(), p = seg.floor.getPointAtLength(len * 0.5);
    var g = addTo('marks', 'g', { class: 'mp-label mp-' + who + (hidden ? ' mp-hide' : ''), 'data-word': word });
    var w = Math.max(46, word.length * 16 + 18);
    g.appendChild(svgEl('rect', { x: Math.round(p.x - w / 2), y: Math.round(p.y - 14), width: w, height: 28, rx: 8, class: 'mp-plate' }));
    var t = svgEl('text', { x: Math.round(p.x), y: Math.round(p.y + 5), class: 'mp-word', 'text-anchor': 'middle' });
    t.textContent = word;
    g.appendChild(t);
    return g;
  }
  function reveal(el) { if (el) el.classList.remove('mp-hide'); }

  /** 갈림길 그리기 — 보기 수만큼 길이 갈라진다 */
  function mapFork(opts) {
    var m = S.map, n = opts.length;
    // 화면에 보이는 폭 안에서만 길을 벌린다 (지도는 보는 사람을 따라 움직인다)
    var visW = $('#map').clientWidth || m.W;
    var side = sideMargin();
    var half = Math.max(110, visW / 2 - side);
    var step = Math.min(215, (half * 2) / Math.max(1, n - 1));
    var xs = [], i;
    var base = m.x;   // 캐릭터가 선 자리에서 갈라진다. 화면이 캐릭터를 늘 가운데 두니 갈림길은 매번 같은 자리(왼쪽/앞/오른쪽)에 보인다
    for (i = 0; i < n; i++) xs.push(n === 1 ? base : base + (i - (n - 1) / 2) * step);
    var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs), shift = 0;
    if (lo < side) shift = side - lo;
    else if (hi > m.W - side) shift = (m.W - side) - hi;
    xs = xs.map(function (x) { return Math.round(Math.max(side, Math.min(m.W - side, x + shift))); });
    var fh = forkHeight();
    m.branches = opts.map(function (o, k) {
      var x = xs[k], y = Math.round(m.y - fh - (k % 2 ? 24 : 0));
      var d = 'M' + m.x + ',' + m.y +
        ' C' + m.x + ',' + Math.round(m.y - fh * 0.55) + ' ' + x + ',' + Math.round(y + fh * 0.5) + ' ' + x + ',' + y;
      return { seg: segment(d), x: x, y: y };
    });
    return m.branches;
  }

  /** 팻말이 화면 위로 잘리지 않을 만큼의 갈림길 높이 */
  function forkHeight() {
    var viewH = $('#map').clientHeight || 460;
    return Math.round(Math.max(112, Math.min(FORK_H, viewH * CAM_Y - 150)));
  }

  /** 직접 입력으로 낸 단어 — 팻말에 없던 좁은 샛길이 옆으로 열린다 */
  function sideWay(fh) {
    var m = S.map, edge = sideMargin();
    var outer = m.branches.length ? Math.max.apply(null, m.branches.map(function (b) { return Math.abs(b.x - m.x); })) : 0;
    var off = Math.min(Math.max(outer + 72, 150), 300);   // 어떤 팻말보다도 바깥쪽으로
    m.sideDir = m.sideDir === 1 ? -1 : 1;                 // 쓸 때마다 반대쪽으로
    var dir = m.sideDir;
    if (m.x + dir * off > m.W - edge || m.x + dir * off < edge) dir = -dir;
    m.sideDir = dir;
    var x = Math.round(m.x + dir * off), y = Math.round(m.y - fh);
    return {
      x: x, y: y, dir: dir, off: off,
      d: 'M' + m.x + ',' + m.y + ' C' + m.x + ',' + Math.round(m.y - fh * 0.5) +
        ' ' + x + ',' + Math.round(y + fh * 0.55) + ' ' + x + ',' + y
    };
  }

  /** (x,y) 에서 곧장 위로 뻗는 복도. 길은 제자리로 돌아오지 않고, 화면이 캐릭터를 따라 옆으로 움직인다 */
  function corridor(x, y, h) {
    var y2 = Math.round(y - h);
    return { d: 'M' + x + ',' + y + ' L' + x + ',' + y2, x: x, y: y2 };
  }

  /**
   * 길을 고른 뒤 다음 갈림길까지 쉬지 않고 걸어간다.
   * 지나가는 중간에 바닥 글씨(내 단어 → 말도깨비 단어)가 하나씩 나타난다.
   */
  function mapAdvance(i, myWord, mv, done) {
    var m = S.map, br = m.branches[i], segs = [];
    m.branches.forEach(function (b, k) {
      if (k === i) return;
      b.seg.floor.classList.add('dim');
      b.seg.wall.classList.add('dim');
      addTo('marks', 'path', { d: 'M' + (b.x - 20) + ',' + (b.y - 4) + ' L' + (b.x + 20) + ',' + (b.y - 4), class: 'mp-cap' });
    });

    var seg1, end1;
    if (br) {
      seg1 = br.seg;
      seg1.floor.classList.add('taken');
      end1 = { x: br.x, y: br.y };
    } else {   // 직접 입력: 팻말에 없던 샛길이 열린다
      var fh = forkHeight(), way = sideWay(fh);
      end1 = { x: way.x, y: way.y };
      seg1 = segment(way.d, 'taken narrow');
      seg1.wall.classList.add('narrow');
      mapSign(way.x + way.dir * 36, way.y + 5, '샛길', '');   // 길 끝 옆에 작게
    }
    var myLabel = floorWord(seg1, myWord, 'me', true);
    segs.push({
      path: seg1.floor, end: end1, at: 0.5,
      show: function () {
        reveal(myLabel);
        var card = document.querySelector('#options .opt.chosen');
        if (card) card.classList.add('gone');
      }
    });

    if (mv) {
      var back = corridor(end1.x, end1.y, CORR_H);
      var seg2 = segment(back.d);
      var cpuLabel = floorWord(seg2, mv.word.word, 'cpu', true);
      segs.push({
        path: seg2.floor, end: { x: back.x, y: back.y }, at: 0.45,
        show: function () {
          reveal(cpuLabel);
          renderCpu(mv.word);
          renderChain();
          Gob.set($('#game-goblin'), 'idle');
        }
      });
    } else {   // 말도깨비가 막혔다 = 출구
      var exit = corridor(end1.x, end1.y, 120);
      var seg3 = segment(exit.d, 'taken');
      var gate = addTo('marks', 'g', { class: 'mp-hide' });
      gate.appendChild(svgEl('rect', { x: exit.x - 46, y: exit.y - 18, width: 92, height: 26, rx: 8, class: 'mp-gate' }));
      var gt = svgEl('text', { x: exit.x, y: exit.y + 1, class: 'mp-sign good' });
      gt.textContent = '출구';
      gate.appendChild(gt);
      segs.push({ path: seg3.floor, end: { x: exit.x, y: exit.y }, at: 0.45, show: function () { reveal(gate); } });
    }

    walkSegs(segs, function () {
      var e = segs[segs.length - 1].end;
      m.x = e.x; m.y = e.y;
      done();
    });
  }

  /** 내가 막혔다 = 막다른 길 (도착하고 나서 드러난다) */
  function mapDeadEnd(after) {
    var m = S.map;
    var g = addTo('marks', 'g', { class: 'mp-hide' });
    g.appendChild(svgEl('rect', { x: m.x - 46, y: m.y - 36, width: 92, height: 18, rx: 5, class: 'mp-block' }));
    var t = svgEl('text', { x: m.x, y: m.y - 48, class: 'mp-sign bad' });
    t.textContent = '막다른 길';
    g.appendChild(t);
    $('#walker').className = 'walker idle';
    setTimeout(function () { reveal(g); if (after) after(); }, reduceMotion ? 0 : 420);
  }

  function placeWalker(x, y) {
    $('#walker').style.transform = 'translate(' + x + 'px,' + y + 'px)';
    if (S.map) { S.map.wx = x; S.map.wy = y; }
    followMap();
  }
  /** 카메라는 캐릭터에 고정 — 캐릭터는 제자리, 지도가 움직인다 */
  function followMap() {
    if (!S || !S.map) return;
    var map = $('#map'), inner = $('#map-inner');
    var viewH = map.clientHeight || 460, viewW = map.clientWidth || S.map.W;
    inner.style.transition = 'none';
    inner.style.transform = 'translate(' +
      Math.round(viewW / 2 - S.map.wx) + 'px,' + Math.round(viewH * CAM_Y - S.map.wy) + 'px)';
  }

  /** 여러 구간을 일정한 속도로 이어서 걷는다 (갈림길에서만 멈춘다) */
  function walkSegs(segs, done) {
    var w = $('#walker'), k = 0;
    function next() {
      if (k >= segs.length) { w.className = 'walker idle'; done(); return; }
      var seg = segs[k++];
      walkPath(seg.path, seg.at, seg.show, next);
    }
    w.className = 'walker walking';
    next();
  }

  /** 길 하나를 일정한 속도로 걷는다. at 지점에서 show() 를 부른다. */
  function walkPath(path, at, show, done) {
    var len = path.getTotalLength ? path.getTotalLength() : 0;
    var fired = false, shown = false;
    function finish() {
      if (fired) return;
      fired = true;
      if (!shown && show) { shown = true; show(); }
      if (len) { var e = path.getPointAtLength(len); placeWalker(e.x, e.y); }
      done();
    }
    if (!len || reduceMotion) { if (show) show(); setTimeout(finish, 60); return; }
    var dur = Math.max(220, len / SPEED);
    var t0 = Date.now();
    setTimeout(finish, dur + 600);
    (function frame() {
      if (fired || !S) { finish(); return; }
      var t = Math.min(1, (Date.now() - t0) / dur);
      if (!shown && show && t >= (at || 0.5)) { shown = true; show(); }
      var pt = path.getPointAtLength(len * t);     // 일정한 속도
      placeWalker(pt.x, pt.y);
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    })();
  }

  /* ---------- 길게 누르기(또는 마우스 올리기) → 뜻 전체 보기 ----------
   * 갈림길 팻말과, 지나온 길 바닥에 적힌 단어 모두에서 쓴다.
   * 한 번 뜬 설명창은 다른 곳을 누르거나 다음 차례가 될 때까지 그대로 둔다.
   */
  var tipTimer = null, tipMode = null, tipFrom = null, pressShowed = false;

  /** 설명창에 넣을 단어 정보 찾기 */
  function tipWord(el) {
    if (el.classList.contains('opt')) {
      var o = S && S.cur && S.cur[+el.dataset.i];
      return o && o.word;
    }
    var w = el.getAttribute('data-word');
    if (!w) return null;
    return App.words.info.get(w) || { word: w, pos: '', def: '' };
  }

  function showTip(el, mode) {
    var w = tipWord(el);
    if (!w) return;
    var tip = $('#tip');
    tip.innerHTML = '<div class="tw">' + esc(w.word) + '</div>' +
      '<div class="td">' + posHtml(w) + defHtml(w) + '</div>' +
      '<div class="tc">다른 곳을 누르면 닫혀요</div>';
    tip.hidden = false;
    var r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    var left = Math.max(12, Math.min(window.innerWidth - t.width - 12, r.left + r.width / 2 - t.width / 2));
    var top = r.top - t.height - 10;
    if (top < 12) top = Math.min(window.innerHeight - t.height - 12, r.bottom + 10);
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tipMode = mode;
    tipFrom = el;
  }
  function hideTip() {
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    $('#tip').hidden = true;
    tipMode = null;
    tipFrom = null;
  }
  function armTip(el, delay, mode) {
    if (tipTimer) clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      tipTimer = null;
      showTip(el, mode);
      if (mode === 'press') pressShowed = true;
    }, delay);
  }

  document.addEventListener('pointerdown', function (ev) {
    var tip = $('#tip');
    if (!tip.hidden && ev.target.closest && ev.target.closest('#tip')) return;   // 설명창 안쪽은 그대로
    pressShowed = false;
    var el = ev.target.closest && ev.target.closest('.opt, .mp-label');
    if (!tip.hidden && el !== tipFrom) hideTip();      // 다른 곳을 누르면 닫힌다
    if (el && !el.disabled) armTip(el, 420, 'press');
  });
  ['pointerup', 'pointercancel'].forEach(function (e) {
    document.addEventListener(e, function () {
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    });
  });
  // 길게 눌렀다 뗄 때는 그 길이 선택되지 않게
  document.addEventListener('click', function (ev) {
    if (!pressShowed) return;
    pressShowed = false;
    var b = ev.target.closest && ev.target.closest('.opt');
    if (b) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);
  // 마우스는 올려만 둬도 보여 주고, 벗어나면 닫는다
  document.addEventListener('mouseover', function (ev) {
    var el = ev.target.closest && ev.target.closest('.opt, .mp-label');
    if (el && !el.disabled && (tipMode !== 'press')) armTip(el, 520, 'hover');
  });
  document.addEventListener('mouseout', function (ev) {
    if (tipMode === 'press') return;
    if (ev.target.closest && ev.target.closest('.opt, .mp-label')) hideTip();
  });

  /** 팻말(보기 버튼)을 길 끝에 놓는다 */
  function placeOptions() {
    var btns = document.querySelectorAll('#options .opt');
    S.map.branches.forEach(function (b, i) {
      if (btns[i]) {
        btns[i].style.left = b.x + 'px';
        btns[i].style.top = (b.y - 14) + 'px';
      }
    });
  }

  window.addEventListener('resize', function () { followMap(); });

  /* ---------- 아이템 (모든 스테이지·랜덤 대결이 함께 쓰는 수량) ---------- */
  var ITEMS = { state: '형세 판단', peek: '수 읽기', best: '최선의 수', undo: '전 턴으로 돌아가기' };
  saved.items = saved.items || {};
  Object.keys(ITEMS).forEach(function (k) { saved.items[k] = saved.items[k] || 0; });

  /** 튜토리얼에서는 아이템을 쓰지 않는다 (규칙을 배우는 자리라서) */
  function isTutorial() { return !!(S && S.opts.stage && S.opts.stage.tutorial); }

  function renderItems() {
    var busy = $('#options').classList.contains('busy');
    $('#items').hidden = isTutorial();
    if ($('#items').hidden) return;
    Object.keys(ITEMS).forEach(function (k) {
      $('#n-' + k).textContent = saved.items[k];
      var b = document.querySelector('.item[data-item="' + k + '"]');
      var used = !!(S && S.usedItems && S.usedItems[k]);
      var usable = !!(S && S.cur && S.cur.length && !S.over && !busy && !used);
      if (k === 'undo') usable = !!(S && S.cur && !S.over && !busy && canUndo());
      b.disabled = !(usable && saved.items[k] > 0);
      b.classList.toggle('on', used);
    });
  }

  function useItem(k) {
    if (isTutorial()) return;
    if (k === 'undo') { undoTurn(); return; }
    if (!S || !S.cur || !S.cur.length || S.over || S.usedItems[k] || !(saved.items[k] > 0)) return;
    saved.items[k]--;
    save();
    S.usedItems[k] = true;
    renderItems();
    if (k === 'state') {
      var st = S.game.charState(S.c);
      var note = $('#item-note');
      note.hidden = false;
      note.className = 'item-note ' + st.type;
      note.innerHTML = '<span class="chip">형세 판단</span> ' + (
        st.type === 'win' ? '둘 다 최선을 다하면 <b>' + st.depth + '수 후 당신이 이겨요.</b>'
          : st.type === 'lose' ? '둘 다 최선을 다하면 <b>' + st.depth + '수 후 말도깨비가 이겨요.</b>'
            : '아직 승패가 정해지지 않은 글자예요.');
    } else if (k === 'best') {
      var wins = S.cur.filter(function (o) { return o.result === 'win'; });
      var pool = wins.length ? wins : S.cur.filter(function (o) { return o.result === 'lose'; });
      var target = wins.length
        ? Math.min.apply(null, pool.map(function (o) { return o.depth; }))
        : Math.max.apply(null, pool.map(function (o) { return o.depth; }));
      var btns = document.querySelectorAll('#options .opt');
      S.cur.forEach(function (o, i) {
        if (pool.indexOf(o) >= 0 && o.depth === target && btns[i]) {
          btns[i].classList.add('best');
          btns[i].querySelector('.w').insertAdjacentHTML('beforeend', '<span class="badge">최선</span>');
        }
      });
    } else if (k === 'peek') {
      peekAll();
    }
  }

  /** 돌아갈 전 내 차례가 있는가 (지금 차례 + 그 전 차례) */
  function canUndo() { return !!(S && S.history && S.history.length >= 2); }

  /** 전 턴으로 돌아가기: 내가 낸 단어와 말도깨비의 대답을 취소하고 바로 전 내 차례로 (졌을 때 결과 화면에서도) */
  function undoTurn() {
    if (!canUndo() || !(saved.items.undo > 0)) return;
    if (!S.over && (!S.cur || $('#options').classList.contains('busy'))) return;
    saved.items.undo--;
    save();
    clearTimeout(S.timer);
    S.token = {};
    S.history.pop();                 // 지금 차례
    var snap = S.history.pop();      // 바로 전 내 차례 (playerTurn 이 다시 넣는다)
    S.game.used = new Set(snap.used);
    S.game.usedPair = new Map(snap.usedPair);
    S.game.res = null;
    S.chain = snap.chain.slice();
    S.log.length = snap.logLen;
    S.c = snap.c;
    S.coachStarted = snap.coachStarted;
    S.coachLost = snap.coachLost;
    if (snap.map) {
      $('#map-svg').innerHTML = snap.map.html;
      S.map = { W: snap.map.W, x: snap.map.x, y: snap.map.y, sideDir: snap.map.sideDir, branches: [] };
      $('#walker').hidden = false;
      $('#walker').className = 'walker idle';
      placeWalker(snap.map.x, snap.map.y);
    }
    S.over = false;
    S.cur = null;
    $('#result').hidden = true;
    $('#ask').hidden = true;
    var cpu = S.log.filter(function (e) { return e.who === 'cpu'; }).pop();
    renderCpu(cpu.word);
    renderChain();
    toast('전 턴으로 돌아왔어요. (전 턴으로 돌아가기 ' + saved.items.undo + '개 남음)');
    playerTurn();
  }

  /** 보기마다: 이 단어를 내면 말도깨비가 무엇으로 받아칠까 */
  function peekAll() {
    var tok = S.token, cur = S.cur, i = 0;
    var btns = document.querySelectorAll('#options .opt');
    for (var k = 0; k < btns.length; k++) {
      var p = btns[k].querySelector('.peek');
      p.hidden = false;
      p.textContent = '말도깨비의 대답을 읽는 중…';
    }
    (function next() {
      if (!S || S.token !== tok || S.cur !== cur || i >= cur.length) return;
      var o = cur[i];
      var g = S.game.clone();
      g.use(o.word.word);
      var mv = g.computerMove(last(o.word.word), S.prefer);
      btns[i].querySelector('.peek').innerHTML = mv
        ? '→ 말도깨비: <b>' + esc(mv.word.word) + '</b>'
        : '→ 말도깨비가 이을 단어가 없어요!';
      i++;
      setTimeout(next, 16);
    })();
  }

  /* ---------- 관리자: 아이템 추가 ---------- */
  var ADMIN_KEY = 'km-maze-admin';
  function loadAdmin() { try { return JSON.parse(localStorage.getItem(ADMIN_KEY)); } catch (e) { return null; } }
  function saveAdmin(a) { try { localStorage.setItem(ADMIN_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function hashPw(salt, pw) { return window.KMSha256(salt + '|' + pw); }
  function newSalt() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  var adminStep = null;
  var ADMIN_TEXT = {
    setup: ['관리자 암호 정하기', '처음 한 번만 정하면 돼요. 관람객이 보지 않을 때 정해 주세요. 암호는 이 컴퓨터의 이 브라우저에만 저장돼요.', '저장'],
    grant: ['아이템 추가', '관리자 암호를 넣고, 추가할 아이템과 개수를 고르세요. 아이템은 모든 스테이지와 랜덤 대결에서 함께 써요.', '추가'],
    change: ['관리자 암호 바꾸기', '지금 암호를 확인한 뒤 새 암호로 바꿔요.', '저장']
  };
  function setAdminStep(step) {
    adminStep = step;
    var els = document.querySelectorAll('.admin-step');
    for (var i = 0; i < els.length; i++) els[i].hidden = els[i].dataset.step !== step;
    $('#admin-title').textContent = ADMIN_TEXT[step][0];
    $('#admin-msg').textContent = ADMIN_TEXT[step][1];
    $('#adm-ok').textContent = ADMIN_TEXT[step][2];
    $('#admin-err').textContent = '';
    ['#adm-new1', '#adm-new2', '#adm-pw', '#adm-old', '#adm-c1', '#adm-c2'].forEach(function (s) { $(s).value = ''; });
    var first = document.querySelector('.admin-step[data-step="' + step + '"] input');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function openAdmin() {
    setAdminStep(loadAdmin() ? 'grant' : 'setup');
    $('#adm-count').value = 1;
    $('#admin').hidden = false;
  }
  function closeAdmin() { $('#admin').hidden = true; }
  function adminErr(msg) { $('#admin-err').textContent = msg; }

  function submitAdmin() {
    var a = loadAdmin();
    if (adminStep === 'setup' || adminStep === 'change') {
      var p1 = adminStep === 'setup' ? $('#adm-new1').value : $('#adm-c1').value;
      var p2 = adminStep === 'setup' ? $('#adm-new2').value : $('#adm-c2').value;
      if (adminStep === 'change' && (!a || hashPw(a.salt, $('#adm-old').value) !== a.hash)) { adminErr('지금 암호가 맞지 않아요.'); return; }
      if (p1.length < 4) { adminErr('암호는 4자 이상으로 정해 주세요.'); return; }
      if (p1 !== p2) { adminErr('두 번 넣은 암호가 달라요.'); return; }
      var salt = newSalt();
      if (!saveAdmin({ salt: salt, hash: hashPw(salt, p1) })) { adminErr('이 브라우저에서는 저장이 막혀 있어요. 다른 브라우저(크롬·엣지)로 열어 주세요.'); return; }
      toast(adminStep === 'setup' ? '관리자 암호를 정했어요.' : '관리자 암호를 바꿨어요.');
      setAdminStep('grant');
      return;
    }
    if (!a) { setAdminStep('setup'); return; }
    if (hashPw(a.salt, $('#adm-pw').value) !== a.hash) { adminErr('암호가 맞지 않아요.'); $('#adm-pw').value = ''; $('#adm-pw').focus(); return; }
    var item = document.querySelector('input[name="adm-item"]:checked').value;
    var n = parseInt($('#adm-count').value, 10);
    if (!n) { adminErr('0이 아닌 개수를 넣어 주세요. 빼려면 앞에 -를 붙여요 (예: -2).'); return; }
    n = Math.max(-99, Math.min(99, n));
    var before = saved.items[item];
    saved.items[item] = Math.max(0, before + n);   // 빼서 0보다 작아지면 0
    var delta = saved.items[item] - before;
    save();
    closeAdmin();
    renderItems();
    toast(delta === 0 ? ITEMS[item] + '은(는) 이미 0개예요.'
      : ITEMS[item] + ' ' + Math.abs(delta) + '개를 ' + (delta > 0 ? '추가했어요' : '뺐어요') + '. (지금 ' + saved.items[item] + '개)');
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- 결과와 복기 ---------- */
  function endGame(result) {
    S.over = true;
    var won = result === 'win';
    var c = S.c, alt = E.dueum(c);
    var d = App.dicts[S.opts.dictId];
    var cc = '‘' + c + '’' + ((alt && d.base.has(alt)) ? '(또는 ‘' + alt + '’)' : '');
    Gob.set($('#game-goblin'), won ? 'shock' : 'smug');
    Gob.set($('#result-goblin'), won ? 'shock' : 'smug');
    $('#options').innerHTML = '';
    $('#direct').hidden = true;
    $('#coach').hidden = true;

    var head = $('#result .result-head');
    head.className = 'result-head ' + (won ? 'win' : 'lose');
    $('#result-kicker').textContent = S.opts.title;
    $('#result-title').textContent = won ? '탈출 성공!' : '말도깨비의 승리';
    var mistake = firstMistake();
    var msg;
    if (won) msg = '말도깨비가 ' + cc + euro(c) + ' 시작하는 단어를 찾지 못했어요. 공격 단어만 골라 미로를 빠져나왔어요!';
    else if (mistake) msg = cc + euro(c) + ' 시작하는 단어가 더 없어요. ' + (mistake.n) + '번째 단어 ‘' + mistake.e.word.word + '’에서 길을 잃었어요.';
    else msg = cc + euro(c) + ' 시작하는 단어가 더 없어요.';
    $('#result-msg').textContent = msg;
    var dn = noDueumNote(c);
    $('#result-note').textContent = dn;
    $('#result-note').hidden = !dn;
    renderReview(mistake);
    renderItems();

    var next = $('#res-next');
    if (S.opts.kind === 'stage') {
      var tut = !!S.opts.stage.tutorial;
      var ns = nextStage(S.opts.stage);
      next.textContent = ns ? (tut ? ns.name : '다음 단계') : '';
      next.hidden = !won || !ns;   // 다음 판이 없으면(마지막 단계·마지막 튜토리얼) 버튼을 숨긴다
      $('#res-retry').textContent = '다시 하기';
      $('#res-list').textContent = tut ? '처음으로' : '목록으로';
    } else {
      next.hidden = false;
      next.textContent = '새 미로';
      $('#res-retry').textContent = '같은 미로 다시';
      $('#res-list').textContent = '난이도 고르기';
    }
    // 졌고 되돌릴 수 있으면 복기(게임 오버 화면)보다 먼저 '전 턴으로 돌아갈까요?'를 묻는다
    var askUndo = !won && !isTutorial() && canUndo() && saved.items.undo > 0;
    later(function () {
      if (askUndo) openAsk(cc + euro(c) + ' 시작하는 단어가 더 없어요.');
      else showResult(won);
    }, 700);
  }

  function showResult(won, silent) {
    $('#result').hidden = false;
    if (!silent) { if (won) Snd.win(); else Snd.lose(); }
    var next = $('#res-next');
    (won && !next.hidden ? next : $('#res-list')).focus();
  }
  function openAsk(msg) {
    Snd.lose();
    Gob.set($('#ask-goblin'), 'smug');
    $('#ask-msg').textContent = msg + ' 전 턴으로 돌아갈까요?';
    $('#ask-left').textContent = '전 턴으로 돌아가기 아이템 ' + saved.items.undo + '개 남음';
    $('#ask').hidden = false;
    $('#ask-yes').focus();
  }
  function closeAsk() { $('#ask').hidden = true; }

  function firstMistake() {
    var n = 0;
    for (var i = 0; i < S.log.length; i++) {
      var e = S.log[i];
      n++;
      if (e.who === 'me' && e.result === 'lose' && e.opts.some(function (o) { return o.result === 'win'; })) return { e: e, n: n };
    }
    return null;
  }

  function renderReview(mistake) {
    $('#review').innerHTML = S.log.map(function (e) {
      var isMistake = mistake && mistake.e === e;
      var who = e.opening ? '말도깨비<br>(' + (e.word.syllable ? '제시 글자' : '제시어') + ')' : e.who === 'cpu' ? '말도깨비' : '나';
      var alts = '';
      if (e.who === 'me') {
        alts = '<div class="alts">' + e.opts.filter(function (o) { return o.word.word !== e.word.word; }).map(function (o) {
          var r = o.result === 'win' ? o.depth + '수 승리' : o.result === 'lose' ? o.depth + '수 패배' : '미확정';
          return '<span class="chip ' + o.result + '"><b>' + esc(o.word.word) + '</b> ' + r + '</span>';
        }).join('') + '</div>';
      }
      return '<li class="' + (isMistake ? 'mistake' : '') + '">' +
        '<span class="who">' + who + '</span>' +
        '<div class="rw"><b>' + esc(e.word.word) + '</b>' + (e.opening ? '' : label(e.result, e.depth)) +
        (e.typed ? '<span class="typed">직접 입력</span>' : '') +
        (isMistake ? '<span class="flag">여기서 길을 잃었어요</span>' : '') + '</div>' +
        (e.word.syllable ? '' : '<p class="rd">' + posHtml(e.word) + defHtml(e.word) + '</p>') +
        (e.who === 'me' && e.opts.length > 1 ? alts : '') +
        '</li>';
    }).join('');
  }

  /** 다음 판: 튜토리얼은 튜토리얼끼리만 이어지고(마지막 튜토리얼 뒤에는 없음), 스테이지는 다음 단계 */
  function nextStage(st) {
    if (st.tutorial) {
      var tut = App.dicts.std.stages.filter(function (s) { return s.tutorial; });
      var i = tut.indexOf(st);
      return (i >= 0 && i + 1 < tut.length) ? tut[i + 1] : null;
    }
    var list = App.dicts[stageDict(st)].stages.filter(function (s) { return !s.tutorial; });
    return list[list.indexOf(st) + 1] || null;
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.go) {
      var go = t.dataset.go;
      stopSession();
      if (go === 'tutorial') { startStage(App.dicts.std.stages[0]); return; }
      show(go);
      return;
    }
    if (t.dataset.dict) { chooseDict(t.dataset.dict); return; }
    if (t.dataset.stage) { var st = findStage(t.dataset.stage); if (st) startStage(st); return; }
    if (t.dataset.level != null) { saved.level = +t.dataset.level; save(); renderRandom(); return; }
    if (t.dataset.i != null) { pick(+t.dataset.i); return; }
    if (t.dataset.item) { useItem(t.dataset.item); return; }
  });
  function renderMute() {
    var b = $('#mute'), off = Snd.isMuted();
    b.classList.toggle('off', off);
    b.setAttribute('aria-pressed', off ? 'true' : 'false');
    var label = off ? '소리 켜기' : '소리 끄기';
    b.textContent = off ? '🔇' : '🔈';
    b.title = label;
    b.setAttribute('aria-label', label);
  }
  $('#mute').addEventListener('click', function () {
    Snd.setMuted(!Snd.isMuted());
    renderMute();
    if (!Snd.isMuted()) Snd.click();
  });
  // 어떤 버튼을 누르든 가벼운 타격음 (마우스·터치·키보드 모두)
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button');
    if (b && b.id !== 'mute' && !b.disabled) Snd.click();
  }, true);

  $('#item-add').addEventListener('click', openAdmin);
  $('#direct-toggle').addEventListener('click', openDirect);
  $('#direct').addEventListener('submit', function (ev) { ev.preventDefault(); submitDirect(); });
  $('#adm-cancel').addEventListener('click', closeAdmin);
  $('#adm-to-change').addEventListener('click', function () { setAdminStep('change'); });
  $('#admin-form').addEventListener('submit', function (ev) { ev.preventDefault(); submitAdmin(); });
  $('#random-start').addEventListener('click', function () { startRandom(saved.level || 0); });
  /** 판에서 나갈 곳: 튜토리얼은 첫 화면, 스테이지는 목록, 랜덤은 난이도 고르기 */
  function leaveGame() {
    var o = S && S.opts;
    stopSession();
    Snd.bgm('lobby');
    if (!o) { show('title'); return; }
    if (o.kind === 'random') show('random');
    else show(o.stage.tutorial ? 'title' : 'stages');
  }
  /** 같은 판(같은 단계 / 같은 미로)을 처음부터 */
  function restartGame() {
    if (!S) return;
    var o = S.opts;
    stopSession();
    if (o.kind === 'stage') startStage(o.stage);
    else startSession(o);
  }
  $('#game-exit').addEventListener('click', leaveGame);
  $('#game-retry').addEventListener('click', restartGame);
  $('#ask-yes').addEventListener('click', function () { closeAsk(); undoTurn(); });
  $('#ask-no').addEventListener('click', function () { closeAsk(); showResult(false, true); });
  $('#res-list').addEventListener('click', leaveGame);
  $('#res-retry').addEventListener('click', restartGame);
  $('#res-next').addEventListener('click', function () {
    var o = S.opts;
    stopSession();
    if (o.kind === 'stage') {
      var ns = nextStage(o.stage);
      if (ns) startStage(ns); else show(o.stage.tutorial ? 'title' : 'stages');
    } else startRandom(o.level);
  });
  document.addEventListener('keydown', function (ev) {
    if (!$('#admin').hidden) { if (ev.key === 'Escape') closeAdmin(); return; }
    if (!$('#ask').hidden) { if (ev.key === 'Escape') $('#ask-no').click(); return; }
    if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
    if (!S || $('#scr-game').hidden) return;
    if (!$('#result').hidden) {
      if (ev.key === 'Escape') $('#res-list').click();
      return;
    }
    var k = parseInt(ev.key, 10);
    if (k >= 1 && k <= 4) { Snd.click(); pick(k - 1); }
    if (ev.key === 'Escape') $('#game-exit').click();
  });

  /* ---------- 시작 ---------- */
  function boot() {
    Gob.setAll('idle');
    Snd.init();
    renderMute();
    loadScript('data/meta.js?v=' + DATA_VER).then(function () {
      App.words = new E.WordStore(KM.meta.posLabels);
      KM.meta.dicts.forEach(function (m) { App.dicts[m.id] = { meta: m, ready: false }; });
      if (!App.dicts[App.dictId]) App.dictId = 'std';
      // 튜토리얼은 표준 사전으로 하므로 표준 사전은 늘 불러 둔다
      return loadDict('std').then(function () { return App.dictId === 'std' ? null : loadDict(App.dictId); });
    }).then(function () {
      show('title');
    }, function (err) {
      $('#load-msg').textContent = err.message + ' 게임 폴더(data)가 그대로 있는지 확인해 주세요.';
    });
  }
  boot();
})();
