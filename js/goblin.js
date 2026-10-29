/* 말도깨비 — 표정: idle(기본) · think(생각 중) · smug(이길 때) · shock(질 때) · cheer(칭찬) */
(function (root) {
  'use strict';

  var EYES = {
    idle: { lx: 44, rx: 76, y: 66, px: 0, py: 1 },
    think: { lx: 44, rx: 76, y: 66, px: 3, py: -4 },
    smug: { lx: 44, rx: 76, y: 67, px: 2, py: 1 },
    shock: { lx: 44, rx: 76, y: 64, px: 0, py: 0 },
    cheer: { lx: 44, rx: 76, y: 66, px: 0, py: 1 }
  };

  function eyes(m) {
    var e = EYES[m] || EYES.idle;
    if (m === 'smug' || m === 'cheer') {
      // 웃는 눈 (반달)
      var d = m === 'smug' ? 'M34 67 Q44 58 54 67' : 'M34 66 Q44 56 54 66';
      var d2 = m === 'smug' ? 'M66 67 Q76 58 86 67' : 'M66 66 Q76 56 86 66';
      return '<path d="' + d + '" class="gb-line" stroke-width="4"/><path d="' + d2 + '" class="gb-line" stroke-width="4"/>';
    }
    var r = m === 'shock' ? 12 : 11;
    return '<ellipse cx="' + e.lx + '" cy="' + e.y + '" rx="' + r + '" ry="' + (r + 1) + '" class="gb-eye"/>' +
      '<ellipse cx="' + e.rx + '" cy="' + e.y + '" rx="' + r + '" ry="' + (r + 1) + '" class="gb-eye"/>' +
      '<circle cx="' + (e.lx + e.px) + '" cy="' + (e.y + e.py) + '" r="' + (m === 'shock' ? 3.5 : 5) + '" class="gb-pupil"/>' +
      '<circle cx="' + (e.rx + e.px) + '" cy="' + (e.y + e.py) + '" r="' + (m === 'shock' ? 3.5 : 5) + '" class="gb-pupil"/>' +
      '<circle cx="' + (e.lx + e.px + 2) + '" cy="' + (e.y + e.py - 2) + '" r="1.6" class="gb-shine"/>' +
      '<circle cx="' + (e.rx + e.px + 2) + '" cy="' + (e.y + e.py - 2) + '" r="1.6" class="gb-shine"/>';
  }

  function brows(m) {
    var b = {
      idle: ['M33 49 L53 51', 'M67 51 L87 49'],
      think: ['M33 47 L53 52', 'M67 49 L87 46'],
      smug: ['M33 52 L53 48', 'M67 48 L87 52'],
      shock: ['M34 44 L52 44', 'M68 44 L86 44'],
      cheer: ['M33 48 L53 48', 'M67 48 L87 48']
    }[m] || [];
    return b.map(function (d) { return '<path d="' + d + '" class="gb-line" stroke-width="4.5"/>'; }).join('');
  }

  function mouth(m) {
    switch (m) {
      case 'smug':
        return '<path d="M40 86 Q60 104 80 86 Z" class="gb-mouth"/>' +
          '<path d="M47 88 L50 95 L53 89 Z M67 89 L70 95 L73 88 Z" class="gb-fang"/>';
      case 'shock':
        return '<ellipse cx="60" cy="92" rx="8" ry="10" class="gb-mouth"/>';
      case 'think':
        return '<path d="M50 90 Q58 87 68 91" class="gb-line" stroke-width="4"/>';
      case 'cheer':
        return '<path d="M42 85 Q60 102 78 85 Z" class="gb-mouth"/>';
      default:
        return '<path d="M44 87 Q60 97 76 87" class="gb-line" stroke-width="4"/>' +
          '<path d="M51 89 L53 94 L56 90 Z" class="gb-fang"/>';
    }
  }

  function svg(mood) {
    var m = mood || 'idle';
    return '<svg class="goblin mood-' + m + '" viewBox="0 0 120 120" aria-hidden="true">' +
      '<path d="M60 4 C64 14 70 24 72 36 L48 36 C50 24 56 14 60 4 Z" class="gb-horn"/>' +
      '<path d="M53 36 L67 36" class="gb-hornband"/>' +
      '<path d="M18 58 C14 40 30 30 44 32 C52 26 68 26 76 32 C90 30 106 40 102 58 C112 70 108 100 86 108 C72 114 48 114 34 108 C12 100 8 70 18 58 Z" class="gb-skin"/>' +
      '<path d="M26 46 L20 36 L32 42 M94 46 L100 36 L88 42" class="gb-tuft"/>' +
      '<circle cx="30" cy="84" r="7" class="gb-cheek"/><circle cx="90" cy="84" r="7" class="gb-cheek"/>' +
      brows(m) + eyes(m) + mouth(m) +
      (m === 'shock' ? '<path d="M100 52 C104 60 104 64 100 66 C96 64 96 60 100 52 Z" class="gb-sweat"/>' : '') +
      '</svg>' +
      (m === 'think' ? '<span class="goblin-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : '');
  }

  function set(el, mood) {
    if (!el) return;
    if (el.dataset.mood === mood) return;
    el.dataset.mood = mood;
    el.innerHTML = svg(mood);
  }

  function setAll(mood) {
    var els = document.querySelectorAll('.goblin-slot');
    for (var i = 0; i < els.length; i++) set(els[i], mood);
  }

  /** 미로를 걷는 플레이어 캐릭터 (등불을 든 나그네) */
  function hero() {
    return '<svg class="hero" viewBox="0 0 44 50" aria-hidden="true">' +
      '<ellipse cx="21" cy="47" rx="11" ry="2.6" class="hr-shadow"/>' +
      '<path d="M15 46 L16 33 M27 46 L26 33" class="hr-leg"/>' +
      '<path d="M12 21 Q21 17 30 21 L32 34 Q21 37 10 34 Z" class="hr-coat"/>' +
      '<circle cx="21" cy="13" r="7.5" class="hr-head"/>' +
      '<path d="M11 11 Q21 1 31 11 Z" class="hr-hat"/>' +
      '<circle cx="18" cy="13.5" r="1.5" class="hr-eye"/>' +
      '<circle cx="24" cy="13.5" r="1.5" class="hr-eye"/>' +
      '<path d="M31 25 L36 27" class="hr-arm"/>' +
      '<circle cx="37" cy="29" r="5" class="hr-glow"/>' +
      '<path d="M34 27 L40 27 L39 32 L35 32 Z" class="hr-lamp"/>' +
      '</svg>';
  }

  root.KMGoblin = { svg: svg, set: set, setAll: setAll, hero: hero };
})(window);
