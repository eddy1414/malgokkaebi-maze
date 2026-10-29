/*
 * 말도깨비 미로 — 끝말잇기 승패 분석 엔진
 *
 * 끝말잇기 엔진(끄글, github.com/singrum/ggeugle)의 분류 방식을 그대로 따른다.
 *  - 이분 그래프: 0번 = 받은 글자(char), 1번 = 단어 첫 글자(head)
 *    char -> head : 두음 법칙으로 시작할 수 있는 글자,  head -> char : 단어(개수 = 간선 수)
 *  - 승/패가 정해지는 음절을 거꾸로 채워 나가고(역추적),
 *    짝수 개의 돌림 단어(자기 자신으로 돌아오는 단어)와 서로 맞물린 두 갈래 순환(2-사이클)을 짝지어 지운 뒤
 *    다시 채우기를 반복한다. 끝까지 정해지지 않은 음절은 '루트'.
 *  - 깊이(수): 받은 글자 기준, 이긴 쪽이 가장 빨리 이기고 진 쪽이 가장 오래 버틸 때 남은 단어 수.
 *
 * 쓰인 단어는 그래프에서 빼고 다시 분류하므로, 한 판 안에서 단어를 다시 쓸 수 없는 규칙이 반영된다.
 * 브라우저(window.KMEngine)와 Node(module.exports) 양쪽에서 쓴다.
 */
(function (root) {
  'use strict';

  var RIEUL_TO_NIEUN = [0, 1, 8, 11, 13, 18];     // ㅏ ㅐ ㅗ ㅚ ㅜ ㅡ
  var RIEUL_TO_IEUNG = [2, 6, 7, 12, 17, 20];     // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
  var NIEUN_TO_IEUNG = [6, 12, 17, 20];           // ㅕ ㅛ ㅠ ㅣ

  /** 두음 법칙으로 바꿔 쓸 수 있는 글자 (없으면 null) — 끄투와 같은 범위 */
  function dueum(ch) {
    var k = ch.charCodeAt(0) - 0xAC00;
    if (k < 0 || k > 11171) return null;
    var cho = Math.floor(k / 588), jung = Math.floor(k / 28) % 21, jong = k % 28;
    if (cho === 5) {            // ㄹ
      if (RIEUL_TO_NIEUN.indexOf(jung) >= 0) cho = 2;
      else if (RIEUL_TO_IEUNG.indexOf(jung) >= 0) cho = 11;
      else return null;
    } else if (cho === 2) {     // ㄴ
      if (NIEUN_TO_IEUNG.indexOf(jung) >= 0) cho = 11;
      else return null;
    } else return null;
    return String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /** build_data.py 의 BLOCKED_SCORE(-20): 규칙상 쓸 수 있지만 학교 전시 화면에는 되도록 안 쓰는 단어 */
  var BLOCKED = -15;

  /* ---------- 이분 그래프 ---------- */
  function BG() {
    this.nodes = [new Set(), new Set()];
    this.succ = [new Map(), new Map()];
    this.pred = [new Map(), new Map()];
  }
  BG.prototype._m = function (arr, pos, n) {
    var m = arr[pos].get(n);
    if (!m) { m = new Map(); arr[pos].set(n, m); }
    return m;
  };
  BG.prototype.setEdge = function (pos, a, b, num) {
    var op = 1 - pos;
    this.nodes[pos].add(a); this.nodes[op].add(b);
    this._m(this.succ, pos, a).set(b, num);
    this._m(this.pred, op, b).set(a, num);
  };
  BG.prototype.increase = function (a, b, num) {
    this.nodes[1].add(a); this.nodes[0].add(b);
    if (num > 0) {
      var s = this._m(this.succ, 1, a), p = this._m(this.pred, 0, b);
      s.set(b, (s.get(b) || 0) + num);
      p.set(a, (p.get(a) || 0) + num);
    }
  };
  BG.prototype.decrease = function (a, b, num) {
    var s = this.succ[1].get(a), p = this.pred[0].get(b);
    var v = ((s && s.get(b)) || 0) - num;
    if (v <= 0) { if (s) s.delete(b); if (p) p.delete(a); }
    else { s.set(b, v); p.set(a, v); }
  };
  BG.prototype.edgeNum = function (a, b) {
    var s = this.succ[1].get(a);
    return (s && s.get(b)) || 0;
  };
  BG.prototype.has = function (pos, n) { return this.nodes[pos].has(n); };
  BG.prototype.successors = function (pos, n) {
    var m = this.succ[pos].get(n);
    return m ? Array.from(m.keys()) : [];
  };
  BG.prototype.predecessors = function (pos, n) {
    var m = this.pred[pos].get(n);
    return m ? Array.from(m.keys()) : [];
  };
  BG.prototype.outdeg = function (pos, n) { var m = this.succ[pos].get(n); return m ? m.size : 0; };
  BG.prototype.indeg = function (pos, n) { var m = this.pred[pos].get(n); return m ? m.size : 0; };
  BG.prototype.removeNode = function (pos, n) {
    var op = 1 - pos, out = [], inn = [], self = this;
    var sm = this.succ[pos].get(n);
    if (sm) sm.forEach(function (num, s) { out.push([n, s, num]); var pm = self.pred[op].get(s); if (pm) pm.delete(n); });
    this.succ[pos].delete(n);
    var pm2 = this.pred[pos].get(n);
    if (pm2) pm2.forEach(function (num, p) { inn.push([p, n, num]); var sm2 = self.succ[op].get(p); if (sm2) sm2.delete(n); });
    this.pred[pos].delete(n);
    this.nodes[pos].delete(n);
    var edges = [null, null];
    edges[pos] = out; edges[op] = inn;
    return edges;
  };
  BG.prototype.singleInOutEdges = function () {
    var seen = new Map(), self = this, res = [];
    var heads = Array.from(this.nodes[1]).sort(cmp), chars = Array.from(this.nodes[0]).sort(cmp);
    heads.forEach(function (f) {
      if (self.indeg(1, f) === 1) { var k = f + '' + self.predecessors(1, f)[0]; if (!seen.has(k)) { seen.set(k, 1); res.push([f, self.predecessors(1, f)[0]]); } }
    });
    chars.forEach(function (c) {
      if (self.outdeg(0, c) === 1) { var k = c + '' + self.successors(0, c)[0]; if (!seen.has(k)) { seen.set(k, 1); res.push([c, self.successors(0, c)[0]]); } }
    });
    return res;
  };
  BG.prototype.evenLoops = function () {
    var res = [], self = this;
    this.singleInOutEdges().forEach(function (e) {
      var num = self.edgeNum(e[1], e[0]);
      if (num >= 2) res.push([e[1], e[0], num - (num % 2)]);
    });
    return res;
  };
  BG.prototype.twoCycles = function () {
    var soe = this.singleInOutEdges(), res = [], cnt = new Map();
    function g(a, b) { return cnt.get(a + '' + b) || 0; }
    function inc(a, b, d) { var k = a + '' + b; cnt.set(k, (cnt.get(k) || 0) + d); }
    for (var i = 0; i < soe.length - 1; i++) {
      var h1 = soe[i][0], t1 = soe[i][1];
      var s1 = this.succ[1].get(t1);
      if (!s1 || s1.size === 0) continue;
      for (var j = i + 1; j < soe.length; j++) {
        var h2 = soe[j][0], t2 = soe[j][1];
        var n1 = (s1.get(h2) || 0) - g(t1, h2);
        if (n1 <= 0) continue;
        var n2 = this.edgeNum(t2, h1) - g(t2, h1);
        if (n2 > 0) {
          var d = Math.min(n1, n2);
          inc(t1, h2, d); inc(t2, h1, d);
          res.push([[t1, h2], [t2, h1], d]);
        }
      }
    }
    return res;
  };

  /* ---------- 분류 ---------- */
  function classify(g) {
    var parts = { route: g, winlose: new BG(), removed: new BG() };
    var route = g;
    var typeMap = [new Map(), new Map()];
    var loopMap = new Map();

    function transferNode(pos, n) {
      var edges = route.removeNode(pos, n);
      for (var p = 0; p < 2; p++) edges[p].forEach(function (e) { parts.winlose.setEdge(p, e[0], e[1], e[2]); });
    }
    function transferEdge(to, a, b, num) { route.decrease(a, b, num); parts[to].increase(a, b, num); }

    function prune() {
      var tm = [new Map(), new Map()], stack = [], changed = false;
      function seedType(pos, name) {
        if (pos === 0) return route.outdeg(0, name) === 0 ? 'lose' : 'route';
        var od = route.outdeg(1, name);
        if (od >= 2) return 'route';
        if (od === 0) return 'lose';
        var s = route.successors(1, name)[0];
        if (route.outdeg(0, s) !== 1 || route.successors(0, s)[0] !== name) return 'route';
        var num = route.edgeNum(name, s), par = num % 2;
        if (num - par > 0) { transferEdge('removed', name, s, num - par); changed = true; }
        if (par === 1) { loopMap.set(name, s); changed = true; return 'loopwin'; }
        return 'lose';
      }
      for (var pos = 0; pos < 2; pos++) {
        Array.from(route.nodes[pos]).sort(cmp).forEach(function (node) {
          var t = seedType(pos, node);
          if (t !== 'route') { tm[pos].set(node, t); stack.push([pos, node]); }
        });
      }
      while (stack.length) {
        var it = stack.pop(), p0 = it[0], name = it[1], op = 1 - p0;
        var preds = route.predecessors(p0, name).filter(function (x) { return !tm[op].has(x); }).sort(cmp);
        var typ = tm[p0].get(name);
        transferNode(p0, name);
        preds.forEach(function (pr) {
          if (tm[op].has(pr)) return;
          if (p0 === 0) {
            if (typ === 'lose') { tm[op].set(pr, 'win'); stack.push([op, pr]); }
            else { var pt = seedType(op, pr); if (pt !== 'route') { tm[op].set(pr, pt); stack.push([op, pr]); } }
          } else {
            if (typ === 'lose') { var pt2 = seedType(op, pr); if (pt2 !== 'route') { tm[op].set(pr, 'lose'); stack.push([op, pr]); } }
            else { tm[op].set(pr, typ); stack.push([op, pr]); }
          }
        });
      }
      for (var q = 0; q < 2; q++) tm[q].forEach(function (v, k) { typeMap[q].set(k, v); });
      return changed || tm[0].size > 0 || tm[1].size > 0;
    }
    function removeEven() {
      var el = route.evenLoops();
      el.forEach(function (e) { transferEdge('removed', e[0], e[1], e[2]); });
      return el.length > 0;
    }
    function removeTwo() {
      var tc = route.twoCycles();
      tc.forEach(function (e) { transferEdge('removed', e[0][0], e[0][1], e[2]); transferEdge('removed', e[1][0], e[1][1], e[2]); });
      return tc.length > 0;
    }
    var cnt = 0, changed = true;
    while (cnt < 200 && changed) {
      cnt++;
      changed = false;
      if (prune()) changed = true;
      if (removeEven()) changed = true;
      if (removeTwo()) changed = true;
    }
    return { parts: parts, typeMap: typeMap, loopMap: loopMap };
  }

  function depthMap(graph, typeMap) {
    var loseSt = [[], []], winSt = [[], []];
    var outdeg = [new Map(), new Map()], dm = [new Map(), new Map()];
    for (var pos = 0; pos < 2; pos++) graph.nodes[pos].forEach(function (n) { outdeg[pos].set(n, graph.outdeg(pos, n)); });
    function isSink(pos, n) {
      if (typeMap[pos].get(n) === 'lose' && outdeg[pos].get(n) === 0) return 'lose';
      if (pos === 1 && typeMap[pos].get(n) === 'loopwin' && outdeg[pos].get(n) === 1) return 'loopwin';
      return null;
    }
    for (var p = 0; p < 2; p++) {
      Array.from(graph.nodes[p]).sort(cmp).forEach(function (n) {
        var t = isSink(p, n);
        if (t === 'lose') { loseSt[p].push(n); dm[p].set(n, 0); }
        else if (t === 'loopwin') { winSt[p].push(n); dm[p].set(n, 1); }
      });
    }
    function dec(pos, n) { outdeg[pos].set(n, (outdeg[pos].get(n) || 0) - 1); }
    while (loseSt[1].length || loseSt[0].length || winSt[1].length || winSt[0].length) {
      var n, preds, i;
      while (loseSt[1].length) {
        n = loseSt[1].pop(); preds = graph.predecessors(1, n);
        for (i = 0; i < preds.length; i++) {
          if (dm[0].has(preds[i])) continue;
          dec(0, preds[i]);
          if (isSink(0, preds[i])) { loseSt[0].push(preds[i]); dm[0].set(preds[i], dm[1].get(n)); }
        }
      }
      while (loseSt[0].length) {
        n = loseSt[0].pop(); preds = graph.predecessors(0, n);
        for (i = 0; i < preds.length; i++) {
          if (dm[1].has(preds[i])) continue;
          dm[1].set(preds[i], dm[0].get(n) + 1); winSt[1].push(preds[i]);
        }
      }
      while (winSt[1].length) {
        n = winSt[1].pop(); preds = graph.predecessors(1, n);
        for (i = 0; i < preds.length; i++) {
          if (dm[0].has(preds[i])) continue;
          dm[0].set(preds[i], dm[1].get(n)); winSt[0].push(preds[i]);
        }
      }
      while (winSt[0].length) {
        n = winSt[0].pop(); preds = graph.predecessors(0, n);
        for (i = 0; i < preds.length; i++) {
          if (dm[1].has(preds[i])) continue;
          dec(1, preds[i]);
          var t = isSink(1, preds[i]);
          if (t === 'lose') { loseSt[1].push(preds[i]); dm[1].set(preds[i], dm[0].get(n) + 1); }
          else if (t === 'loopwin') { winSt[1].push(preds[i]); dm[1].set(preds[i], dm[0].get(n) + 2); }
        }
      }
    }
    return dm;
  }

  /* ---------- 단어 그래프 + 게임 상태 ---------- */
  function parseGraph(text) {
    var counts = new Map();
    text.split('\n').forEach(function (line) {
      if (!line) return;
      var h = line[0], m = new Map(), t = null, num = '';
      for (var i = 1; i < line.length; i++) {
        var c = line[i];
        if (c >= '0' && c <= '9') num += c;
        else { if (t !== null) m.set(t, parseInt(num, 10)); t = c; num = ''; }
      }
      if (t !== null) m.set(t, parseInt(num, 10));
      counts.set(h, m);
    });
    return counts;
  }

  /**
   * 표시 단어 모음. words_*.js 한 줄: 단어 \t 품사번호 \t 친숙도 \t 사전 비트 \t 뜻풀이
   * 사전을 더 불러오면 add() 로 덧붙인다.
   */
  function WordStore(posLabels) {
    this.posLabels = posLabels || null;
    this.byPair = new Map();
    this.info = new Map();
    this.loaded = new Set();
  }
  WordStore.prototype.add = function (chunk) {
    var self = this, touched = new Set();
    chunk.split('\n').forEach(function (line) {
      if (!line) return;
      var f = line.split('\t');
      if (self.info.has(f[0])) return;
      var pi = +f[1];
      var w = {
        word: f[0], pos: (self.posLabels && pi >= 0) ? self.posLabels[pi] : '', score: parseFloat(f[2]),
        dicts: +f[3], def: f[4] || ''
      };
      w.blocked = w.score <= BLOCKED;   // 전시용: 화면에 되도록 안 쓰는 단어
      self.info.set(w.word, w);
      var key = w.word[0] + w.word[w.word.length - 1];
      var arr = self.byPair.get(key);
      if (!arr) { arr = []; self.byPair.set(key, arr); }
      arr.push(w);
      touched.add(key);
    });
    touched.forEach(function (key) {
      self.byPair.get(key).sort(function (a, b) { return b.score - a.score || a.word.length - b.word.length || cmp(a.word, b.word); });
    });
  };
  function parseWords(chunks, posLabels) {
    var s = new WordStore(posLabels);
    chunks.forEach(function (c) { s.add(c); });
    return s;
  }

  /**
   * 한 판의 상태. counts(전체 단어 수)는 공유하고, 쓴 단어만 따로 센다.
   */
  function Game(base, words, dictBit) {
    this.base = base;           // Map head -> Map tail -> count (전체)
    this.words = words;         // parseWords 결과
    this.dictBit = dictBit || 1;
    this.used = new Set();      // 이번 판에 쓴 단어
    this.usedPair = new Map();  // head+tail -> 쓴 개수
    this.res = null;
  }
  /** 같은 판을 복사 (수 읽기: 이 단어를 내면 상대가 뭐라고 받을지 미리 보기) */
  Game.prototype.clone = function () {
    var g = new Game(this.base, this.words, this.dictBit);
    g.used = new Set(this.used);
    g.usedPair = new Map(this.usedPair);
    return g;
  };
  Game.prototype.remaining = function (h, t) {
    var m = this.base.get(h);
    var n = (m && m.get(t)) || 0;
    return n - (this.usedPair.get(h + t) || 0);
  };
  Game.prototype.use = function (word) {
    this.used.add(word);
    var k = word[0] + word[word.length - 1];
    this.usedPair.set(k, (this.usedPair.get(k) || 0) + 1);
    this.res = null;
  };
  /** 남은 단어로 그래프를 만들어 승패·깊이를 계산한다. */
  Game.prototype.solve = function () {
    if (this.res) return this.res;
    var g = new BG(), self = this;
    this.base.forEach(function (m, h) {
      m.forEach(function (n, t) {
        var r = n - (self.usedPair.get(h + t) || 0);
        if (r > 0) g.setEdge(1, h, t, r);
      });
    });
    Array.from(g.nodes[0]).forEach(function (c) {
      if (g.has(1, c)) g.setEdge(0, c, c, 1);
      var d = dueum(c);
      if (d && g.has(1, d)) g.setEdge(0, c, d, 1);
    });
    var cl = classify(g);
    var dm = depthMap(cl.parts.winlose, cl.typeMap);
    this.res = { typeMap: cl.typeMap, depth: dm, loopMap: cl.loopMap, removed: cl.parts.removed, route: cl.parts.route };
    return this.res;
  };
  /** 받은 글자 c 의 상태: {type:'win'|'lose'|'route', depth} (win = 받은 사람이 이김) */
  Game.prototype.charState = function (c) {
    var r = this.solve();
    var t = r.typeMap[0].get(c);
    if (!t) {
      // 어떤 단어의 끝 글자로도 나오지 않는 글자: 시작할 수 있는 첫 글자들의 상태로 판단
      var ts = [];
      this.headsOf(c).forEach(function (h) {
        var ht = r.typeMap[1].get(h);
        if (ht) ts.push({ t: ht, d: r.depth[1].get(h) });
        else if (r.route.has(1, h)) ts.push({ t: 'route' });
      });
      if (!ts.length) return { type: 'lose', depth: 0 };
      var w = ts.filter(function (x) { return x.t === 'win' || x.t === 'loopwin'; });
      if (w.length) return { type: 'win', depth: Math.min.apply(null, w.map(function (x) { return x.d; })) };
      if (ts.every(function (x) { return x.t === 'lose'; })) return { type: 'lose', depth: Math.max.apply(null, ts.map(function (x) { return x.d; })) };
      return { type: 'route', depth: null };
    }
    var type = t === 'loopwin' ? 'win' : t;
    return { type: type, depth: r.depth[0].get(c) };
  };
  Game.prototype.headsOf = function (c) {
    var hs = [], d = dueum(c);
    if (this.base.has(c)) hs.push(c);
    if (d && this.base.has(d)) hs.push(d);
    return hs;
  };
  /**
   * 글자 c 를 받은 사람이 낼 수 있는 수(끝 글자 단위) 목록.
   * result: 'win' (이 단어를 내면 이김) | 'lose' (지게 됨) | 'loop' (돌림 짝 단어, 승패에 영향 없음) | 'route' (미확정)
   * depth: 이 단어를 포함해 게임이 끝날 때까지의 수
   */
  Game.prototype.moves = function (c) {
    var r = this.solve(), self = this, out = [];
    this.headsOf(c).forEach(function (h) {
      self.base.get(h).forEach(function (n, t) {
        var rem = self.remaining(h, t);
        if (rem <= 0) return;
        var removed = r.removed.edgeNum(h, t);
        var live = rem - removed;
        var mv = { head: h, tail: t, count: rem };
        var tt = r.typeMap[0].get(t);
        var ht = r.typeMap[1].get(h);
        if (live <= 0) { mv.result = 'loop'; mv.depth = null; }
        else if (ht === 'loopwin' && r.loopMap.get(h) === t) { mv.result = 'win'; mv.depth = r.depth[1].get(h); mv.isLoop = true; }
        else if (tt === 'lose') { mv.result = 'win'; mv.depth = r.depth[0].get(t) + 1; }
        else if (tt === 'win' || tt === 'loopwin') { mv.result = 'lose'; mv.depth = r.depth[0].get(t) + 1; }
        else { mv.result = 'route'; mv.depth = null; }
        out.push(mv);
      });
    });
    return out;
  };
  /** 이 끝 글자 조합에서 아직 안 쓴 표시 단어 */
  Game.prototype.wordsFor = function (h, t) {
    var arr = this.words.byPair.get(h + t) || [], used = this.used, bit = this.dictBit;
    return arr.filter(function (w) { return (w.dicts & bit) && !used.has(w.word); });
  };

  /* 시드 난수 (mulberry32) */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * 컴퓨터의 최적 수: 이길 수 있으면 가장 빨리, 질 수밖에 없으면 가장 오래 버틴다.
   * 같은 깊이면 친숙한 단어를 고른다.
   */
  Game.prototype.bestMove = function (c) {
    var ms = this.moves(c), self = this;
    var cands = [];
    ms.forEach(function (m) {
      if (m.result !== 'win' && m.result !== 'lose') return;
      var ws = self.wordsFor(m.head, m.tail);
      if (!ws.length) return;
      cands.push({ move: m, word: ws[0] });
    });
    if (!cands.length) {
      // 확정된 수가 없으면(루트) 아무 단어나
      for (var i = 0; i < ms.length; i++) {
        var ws2 = this.wordsFor(ms[i].head, ms[i].tail);
        if (ws2.length) return { move: ms[i], word: ws2[0] };
      }
      return null;
    }
    var wins = cands.filter(function (x) { return x.move.result === 'win'; });
    if (wins.length) {
      wins.sort(function (a, b) { return a.move.depth - b.move.depth || b.word.score - a.word.score || cmp(a.word.word, b.word.word); });
      return wins[0];
    }
    cands.sort(function (a, b) { return b.move.depth - a.move.depth || b.word.score - a.word.score || cmp(a.word.word, b.word.word); });
    return cands[0];
  };

  /** 움직임 하나를 화면용 후보(단어 하나)로 */
  function cand(m, w) {
    return { word: w, move: m, result: m.result, depth: m.depth, isLoop: !!m.isLoop };
  }

  /**
   * 플레이어 선택지 만들기.
   * cfg: { n: 선택지 수, correct: 이기는 선택지 수(이길 수 있을 때), fixed: [단어...],
   *        loseSlack: 오답이 가장 빠른 승리보다 최대 몇 수 더 길 수 있는지 (없으면 제한 없음),
   *        extraWin: 차례마다 정답을 하나 더 넣을 확률 (0~1) }
   * 이길 수 있으면: 가장 빨리 이기는 단어(정답) + 지는 단어(가장 오래 버티는 것, 가장 빨리 지는 것, 중간)
   * 질 수밖에 없으면: 가장 오래 버티는 단어, 가장 빨리 지는 단어, 중간 단어
   */
  Game.prototype.options = function (c, cfg, rand) {
    var self = this, ms = this.moves(c);
    var n = cfg.n || 3, want = cfg.correct || 1;
    // extraWin: 이 확률로 이번 차례에 정답을 하나 더 (돌아가서 이기는 수) — '정답 하나 + 오답 둘'만 계속 나오지 않게
    if (cfg.extraWin && (rand ? rand() : Math.random()) < cfg.extraWin) want += 1;
    var wins = [], loses = [];
    ms.forEach(function (m) {
      if (m.result !== 'win' && m.result !== 'lose') return;
      self.wordsFor(m.head, m.tail).forEach(function (w) {
        (m.result === 'win' ? wins : loses).push(cand(m, w));
      });
    });
    // 전시용으로 막아 둔 단어는 빼되, 최적의 수(가장 빠른 승리 / 가장 오래 버티는 수)가 그 단어뿐이면 남긴다
    function unblock(list, keepDepth) {
      var ok = list.filter(function (x) { return !x.word.blocked; });
      if (keepDepth != null && !ok.some(function (x) { return x.depth === keepDepth; })) {
        ok = ok.concat(list.filter(function (x) { return x.word.blocked && x.depth === keepDepth; }).slice(0, 1));
      }
      return ok.length ? ok : list;
    }
    if (wins.length) {
      wins = unblock(wins, Math.min.apply(null, wins.map(function (x) { return x.depth; })));
      loses = unblock(loses, null);
    } else if (loses.length) {
      loses = unblock(loses, Math.max.apply(null, loses.map(function (x) { return x.depth; })));
    }
    // 보기끼리 끝 글자가 겹치지 않게 (같은 글자를 넘기는 보기 둘은 사실상 같은 수라서)
    var picked = [], seen = new Set(), tails = new Set();
    function tailOf(x) { var w = x.word.word; return w[w.length - 1]; }
    function free(x) { return !seen.has(x.word.word) && !tails.has(tailOf(x)); }
    function take(x) {
      if (x && free(x)) { seen.add(x.word.word); tails.add(tailOf(x)); picked.push(x); return true; }
      return false;
    }

    if (cfg.fixed && cfg.fixed.length) {
      cfg.fixed.forEach(function (fw) {
        var x = wins.concat(loses).filter(function (y) { return y.word.word === fw; })[0];
        take(x);
      });
    }
    // 같은 조건이면 친숙한 단어를 약간의 무작위와 함께 고른다
    function jitter(x) { return x.word.score + (rand ? rand() * 1.2 : 0); }
    function pickFrom(list, sorter) {
      var l = list.filter(free);
      if (!l.length) return null;
      l.forEach(function (x) { x._j = jitter(x); });
      l.sort(sorter);
      return l[0];
    }
    function pickDepth(list, asc) {
      return pickFrom(list, function (a, b) { return (asc ? a.depth - b.depth : b.depth - a.depth) || b._j - a._j; });
    }
    function pickMiddle(list) {
      var l = list.filter(free);
      if (!l.length) return null;
      var lo = Math.min.apply(null, l.map(function (x) { return x.depth; }));
      var hi = Math.max.apply(null, l.map(function (x) { return x.depth; }));
      var mid = (lo + hi) / 2;
      return pickFrom(l, function (a, b) { return Math.abs(a.depth - mid) - Math.abs(b.depth - mid) || b._j - a._j; });
    }

    if (wins.length) {
      var have = picked.filter(function (x) { return x.result === 'win'; }).length;
      var bestWin = Math.min.apply(null, wins.map(function (x) { return x.depth; }));
      // 첫 정답은 늘 가장 빠른 승리(최적의 수)
      if (!picked.some(function (x) { return x.result === 'win' && x.depth === bestWin; }) && have < want) {
        if (take(pickDepth(wins, true))) have++;
      }
      // 정답을 더 넣을 때는 '돌아가서 이기는 수'(더 오래 걸리지만 이기는 수)를 먼저
      while (have < want) {
        var slow = pickDepth(wins.filter(function (x) { return x.depth > bestWin; }), true);
        if (!take(slow || pickDepth(wins, true))) break;
        have++;
      }
      // 쉬운 단계: 오답은 '가장 빠른 승리 수 + loseSlack' 이하로 끝나는 것만 (틀리면 금방 끝나게)
      var losePool = loses;
      if (cfg.loseSlack != null && loses.length) {
        var cap = Math.min.apply(null, wins.map(function (x) { return x.depth; })) + cfg.loseSlack;
        var within = loses.filter(function (x) { return x.depth <= cap; });
        var need = n - picked.length;
        if (within.length < need) {
          var rest = loses.filter(function (x) { return x.depth > cap; }).sort(function (a, b) { return a.depth - b.depth; });
          within = within.concat(rest.slice(0, need - within.length));
        }
        losePool = within;
      }
      var order = [function () { return pickDepth(losePool, false); }, function () { return pickDepth(losePool, true); }, function () { return pickMiddle(losePool); }];
      var oi = 0;
      while (picked.length < n && oi < 12) { take(order[oi % 3]()); oi++; }
      while (picked.length < n && take(pickDepth(wins, true))) { /* 지는 단어가 모자라면 이기는 단어로 채움 */ }
    } else {
      var order2 = [function () { return pickDepth(loses, false); }, function () { return pickDepth(loses, true); }, function () { return pickMiddle(loses); }];
      var oj = 0;
      while (picked.length < n && oj < 12) { take(order2[oj % 3]()); oj++; }
    }
    // 안전장치: 확정된 수가 하나도 없는데 단어는 남아 있으면(쓴 단어 때문에 생기는 드문 경우) 남은 수를 보여 준다
    if (!picked.length) {
      ms.forEach(function (m) {
        if (picked.length >= n) return;
        var ws = self.wordsFor(m.head, m.tail);
        if (ws.length) take(cand(m, ws[0]));
      });
    }
    // 섞기
    for (var i = picked.length - 1; i > 0; i--) {
      var j = Math.floor((rand ? rand() : Math.random()) * (i + 1));
      var tmp = picked[i]; picked[i] = picked[j]; picked[j] = tmp;
    }
    return picked;
  };

  /** 컴퓨터가 고를 단어. prefer: 같은 깊이일 때 먼저 고를 단어 집합 */
  Game.prototype.computerMove = function (c, prefer) {
    var b = this.bestMove(c);
    if (!b || !prefer || !prefer.size) return b;
    var self = this, alt = null;
    this.moves(c).forEach(function (m) {
      if (m.result !== b.move.result || m.depth !== b.move.depth) return;
      self.wordsFor(m.head, m.tail).forEach(function (w) { if (!alt && prefer.has(w.word)) alt = { move: m, word: w }; });
    });
    return alt || b;
  };

  /**
   * 컴퓨터 제시어 조건: 첫 글자는 루트 또는 패배 음절(컴퓨터가 이길 수 없는 글자),
   * 끝 글자는 받는 플레이어가 이기는 승리 음절. (승리 음절 → 승리 음절은 컴퓨터의 실수라 쓰지 않는다)
   */
  function isGoodStart(game, word) {
    if (word.length === 1) return game.charState(word).type === 'win';   // 글자만 제시 (알맞은 제시어가 없을 때)
    if (game.charState(word[0]).type === 'win') return false;
    return game.charState(word[word.length - 1]).type === 'win';
  }
  /** 글자 s 로 끝나는 제시어 후보 (조건을 만족하는 것만, 친숙한 순) */
  function startWords(game, s, limit) {
    var out = [], headOk = new Map();
    game.words.info.forEach(function (w) {
      if (!(w.dicts & game.dictBit) || w.word[w.word.length - 1] !== s || game.used.has(w.word)) return;
      var h = w.word[0];
      if (w.blocked) return;
      if (!headOk.has(h)) headOk.set(h, game.charState(h).type !== 'win');
      if (headOk.get(h)) out.push(w);
    });
    out.sort(function (a, b) { return b.score - a.score || a.word.length - b.word.length || cmp(a.word, b.word); });
    return limit ? out.slice(0, limit) : out;
  }

  var api = {
    dueum: dueum, BG: BG, classify: classify, depthMap: depthMap,
    parseGraph: parseGraph, parseWords: parseWords, WordStore: WordStore, Game: Game, rng: rng, hashStr: hashStr,
    startWords: startWords, isGoodStart: isGoodStart
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KMEngine = api;
})(typeof window !== 'undefined' ? window : this);
