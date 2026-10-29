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
  var tracks = { lobby: null, game: null };
  var VOL = { lobby: 0.18, game: 0.13 };    // 배경음악 음량 (게임 쪽 곡이 더 커서 더 낮춘다)
  var GAP = { lobby: 2500, game: 4000 };    // 한 번 끝나면 이만큼 쉬었다가 다시 (ms)
  var bgmWanted = null, started = false, gapTimer = null;

  /** 부드럽게 줄이고 멈춤 */
  function clearGap() { if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; } }

  function fadeOut(el) {
    var step = el.volume / 8;
    var t = setInterval(function () {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0.001) { clearInterval(t); el.pause(); el.currentTime = 0; }
    }, 40);
  }

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

  var Snd = {
    /** 버튼 누르는 소리 — 나무를 톡 치는 듯한 짧고 낮은 타격감 */
    click: function () {
      noise({ dur: 0.03, freq: 2600, q: 1.1, gain: 0.07 });    // 또렷하게 들리는 윗소리
      noise({ dur: 0.04, freq: 1400, q: 1.4, gain: 0.08 });
      tone({ freq: 200, to: 130, dur: 0.07, type: 'sine', gain: 0.11 });
    },
    /** 탈출 — 결과창이 뜰 때 */
    win: function () {
      [0, 1, 2, 4].forEach(function (d, i) {
        tone({ freq: note(d, 1), dur: 0.45, type: 'triangle', gain: 0.17, delay: i * 0.12 });
      });
      tone({ freq: note(0, 2), dur: 0.8, type: 'sine', gain: 0.12, delay: 0.48 });
    },
    /** 막다른 길 — 결과창이 뜰 때 */
    lose: function () {
      noise({ dur: 0.3, freq: 180, type: 'lowpass', q: 0.8, gain: 0.22 });
      tone({ freq: 150, to: 70, dur: 0.5, type: 'triangle', gain: 0.18 });
    },

    /* ---------- 배경음악 (화면마다 다른 곡) ---------- */
    bgm: function (which) {
      if (which !== bgmWanted) clearGap();
      bgmWanted = which || null;
      Object.keys(tracks).forEach(function (k) {
        var el = tracks[k];
        if (!el) return;
        if (k === bgmWanted && !muted) {
          if (gapTimer) return;                 // 쉬는 중이면 그대로 둔다
          el.volume = VOL[k];
          var p = el.play();
          if (p && p.catch) p.catch(function () { /* 아직 사람이 누르지 않음 */ });
        } else if (!el.paused) {
          fadeOut(el);
        }
      });
    },

    isMuted: function () { return muted; },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem(LS_KEY, muted ? 'off' : 'on'); } catch (e) { /* 저장 안 됨 */ }
      if (muted) {
        clearGap();
        Object.keys(tracks).forEach(function (k) { if (tracks[k]) tracks[k].pause(); });
        if (master) master.gain.value = 0;
      } else {
        if (master) master.gain.value = 0.85;
        ensure();
        if (bgmWanted) Snd.bgm(bgmWanted);
      }
      return muted;
    },

    /** 페이지에서 한 번 부른다 */
    init: function () {
      Object.keys(tracks).forEach(function (k) {
        var el = document.getElementById('bgm-' + k);
        if (!el) return;
        el.volume = VOL[k];
        el.loop = false;                        // 끝나면 잠깐 쉬었다가 다시 튼다
        el.addEventListener('error', function () { tracks[k] = null; });   // 파일이 없으면 조용히 넘어간다
        el.addEventListener('ended', function () {
          if (bgmWanted !== k || muted) return;
          clearGap();
          gapTimer = setTimeout(function () {
            gapTimer = null;
            if (bgmWanted !== k || muted) return;
            el.currentTime = 0;
            el.volume = VOL[k];
            var p = el.play();
            if (p && p.catch) p.catch(function () { /* 막힘 */ });
          }, GAP[k]);
        });
        tracks[k] = el;
      });
      var wake = function () {
        if (started) return;
        started = true;
        ensure();
        if (bgmWanted) Snd.bgm(bgmWanted);
      };
      document.addEventListener('pointerdown', wake);
      document.addEventListener('keydown', wake);
    }
  };

  root.KMSound = Snd;
})(window);
