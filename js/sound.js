/*
 * 말도깨비 미로 — 소리
 *  효과음: 브라우저 내장 합성(Web Audio)으로 그때그때 만든다. 음원 파일이 없어 저작권 걱정이 없고 지연도 없다.
 *  배경음악: audio/bgm.mp3 파일이 있으면 틀고, 없으면 조용히 넘어간다.
 *  소리는 사람이 처음 누른 뒤에 켜진다 (브라우저가 그 전에는 소리를 막는다).
 */
(function (root) {
  'use strict';

  var LS_KEY = 'km-maze-sound';
  var muted = false;
  try { muted = localStorage.getItem(LS_KEY) === 'off'; } catch (e) { /* 저장 못 읽음 */ }

  var AC = root.AudioContext || root.webkitAudioContext;
  var ctx = null, master = null;
  var bgm = null, bgmWanted = false, started = false;

  /* 국악 느낌의 5음계 (평조) — 효과음 음높이를 여기서 고른다 */
  var SCALE = [0, 2, 4, 7, 9];
  function note(deg, oct) {
    var i = ((deg % SCALE.length) + SCALE.length) % SCALE.length;
    var up = Math.floor(deg / SCALE.length) + (oct || 0);
    return 220 * Math.pow(2, (SCALE[i] + up * 12) / 12);
  }

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  /** 소리 하나 (sine/triangle/square) */
  function tone(opt) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opt.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(opt.to, t0 + opt.dur);
    var peak = (opt.gain == null ? 0.25 : opt.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.03, opt.dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0);
    osc.stop(t0 + opt.dur + 0.05);
  }

  /** 잡음 한 조각 (발소리·새김 소리의 재료) */
  function noise(opt) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opt.delay || 0);
    var n = Math.floor(c.sampleRate * opt.dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = opt.type || 'bandpass';
    f.frequency.value = opt.freq || 900;
    f.Q.value = opt.q || 1;
    var g = c.createGain();
    g.gain.value = opt.gain == null ? 0.2 : opt.gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  var stepTimer = null, stepFlip = false;

  var Snd = {
    /** 팻말 고르기 */
    click: function () {
      tone({ freq: note(2, 1), dur: 0.09, type: 'triangle', gain: 0.22 });
      tone({ freq: note(4, 1), dur: 0.12, type: 'sine', gain: 0.14, delay: 0.05 });
    },
    /** 걷기 시작/끝 — 일정한 간격으로 발소리 */
    stepsStart: function () {
      Snd.stepsStop();
      var beat = function () {
        stepFlip = !stepFlip;
        noise({ dur: 0.07, freq: stepFlip ? 620 : 520, q: 1.2, gain: 0.1 });
        tone({ freq: stepFlip ? 110 : 96, dur: 0.07, type: 'sine', gain: 0.1 });
      };
      beat();
      stepTimer = setInterval(beat, 330);
    },
    stepsStop: function () {
      if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    },
    /** 바닥에 단어가 새겨질 때 — 내 단어는 높게, 말도깨비 단어는 낮게 */
    carve: function (who) {
      var me = who === 'me';
      noise({ dur: 0.12, freq: me ? 1400 : 900, q: 2, gain: 0.12 });
      tone({ freq: me ? note(3, 1) : note(0, 0), dur: 0.22, type: 'triangle', gain: 0.16 });
    },
    /** 갈림길 도착 */
    fork: function () {
      tone({ freq: note(0, 1), dur: 0.16, type: 'sine', gain: 0.12 });
      tone({ freq: note(2, 1), dur: 0.22, type: 'sine', gain: 0.1, delay: 0.09 });
    },
    /** 탈출 */
    win: function () {
      [0, 1, 2, 4].forEach(function (d, i) {
        tone({ freq: note(d, 1), dur: 0.5, type: 'triangle', gain: 0.2, delay: i * 0.12 });
      });
      tone({ freq: note(0, 2), dur: 0.9, type: 'sine', gain: 0.14, delay: 0.48 });
    },
    /** 막다른 길 */
    lose: function () {
      noise({ dur: 0.3, freq: 180, type: 'lowpass', q: 0.8, gain: 0.3 });
      tone({ freq: 150, to: 70, dur: 0.5, type: 'triangle', gain: 0.22 });
    },
    /** 아이템 */
    item: function () {
      tone({ freq: note(2, 1), dur: 0.1, type: 'sine', gain: 0.16 });
      tone({ freq: note(4, 1), dur: 0.1, type: 'sine', gain: 0.16, delay: 0.07 });
      tone({ freq: note(0, 2), dur: 0.2, type: 'sine', gain: 0.13, delay: 0.14 });
    },
    /** 전 턴으로 돌아가기 */
    undo: function () {
      tone({ freq: note(4, 1), to: note(0, 0), dur: 0.35, type: 'triangle', gain: 0.18 });
    },

    /* ---------- 배경음악 ---------- */
    bgmStart: function () {
      bgmWanted = true;
      if (!bgm || muted) return;
      var p = bgm.play();
      if (p && p.catch) p.catch(function () { /* 아직 사람이 누르지 않음 */ });
    },
    bgmStop: function () {
      bgmWanted = false;
      if (bgm) bgm.pause();
    },

    isMuted: function () { return muted; },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem(LS_KEY, muted ? 'off' : 'on'); } catch (e) { /* 저장 안 됨 */ }
      if (muted) {
        Snd.stepsStop();
        if (bgm) bgm.pause();
        if (master) master.gain.value = 0;
      } else {
        if (master) master.gain.value = 0.85;
        ensure();
        if (bgmWanted) Snd.bgmStart();
      }
      return muted;
    },

    /** 페이지에서 한 번 부른다 */
    init: function () {
      bgm = document.getElementById('bgm');
      if (bgm) {
        bgm.volume = 0.3;
        bgm.addEventListener('error', function () { bgm = null; });   // 음원 파일이 없으면 조용히 넘어간다
      }
      var wake = function () {
        if (started) return;
        started = true;
        ensure();
        if (bgmWanted) Snd.bgmStart();
      };
      document.addEventListener('pointerdown', wake);
      document.addEventListener('keydown', wake);
    }
  };

  root.KMSound = Snd;
})(window);
