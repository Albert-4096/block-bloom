// Presentation timing only. Game rules and point calculation live in game.js.
export const FX = {
  scale: 1, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  drag: { threshold: 1, fingerOffsetCells: 1.75, mouseOffsetCells: .45, snap: 80 },
  debug: { longPress: 600 },
  strip: { start: 40, full: 130, fade: 300, end: 450, thinScale: .035 },
  glow: { plain: 350, combo: 850, rise: 100 },
  combo: { start: 420, burst: 400, popPeak: 115, settle: 150, hold: 400, exit: 45, peak: 1.23, digitPeak: 1.4, digitBase: 1.5, maxLevel: 6 },
  popup: { plainStart: 300, comboStart: 660, pop: 50, hold: 200, fly: 200 },
  score: { tick: 25, divisor: 100, pulse: 180 },
  badge: { start: 50, pulse: 100 },
  refill: { halo: 300, sparks: 4 },
  particle: { cap: 150, stripPerLine: 12, borderBase: 8, borderPerCombo: 3, speed: 35, size: 4 },
  shake: { minCombo: 4, duration: 70, pixels: 3 },
  haptic: { pickup: 10, place: 15, clear: 30, combo: [45, 30, 55] },
  audio: { clickHz: 1700, placeHz: 510, clearHz: 720, comboHz: 820, noteMs: 85, gain: .045, maxSemitones: 7 },
  easing: { popOvershoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)', flyToScore: 'cubic-bezier(0.4, 0, 1, 1)', fade: 'ease-out' },
};

const COLORS = { teal: '#56c7c2', coral: '#f4867b', gold: '#f6c15c', violet: '#ad91df', mint: '#91d3a1' };
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const easeOut = t => 1 - (1 - t) ** 3;
const easeIn = t => t * t * t;

export function createEffects({ board, frame, layer, flash, score, scoreCard, badge, overlay, debug, fps }) {
  const timelines = [];
  const pool = [];
  const particlePool = [];
  const particles = [];
  let audio = null;
  let displayed = Number(score.textContent.replace(/\D/g, '')) || 0;
  let roll = null;
  let last = performance.now();
  let fpsFrames = 0;
  let fpsTime = 0;
  let live = true;
  const motion = () => !FX.reduced;
  const nowLog = (name, started) => console.debug(`[FX] ${name}`, Math.round(performance.now()), `offset ${Math.round((performance.now() - started) * FX.scale)}ms`);
  const setScore = n => { displayed = n; score.textContent = n.toLocaleString(); };
  const vibrate = pattern => { if (navigator.vibrate) navigator.vibrate(pattern); };
  const unlock = () => {
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
  };
  const sound = (kind, level = 1) => {
    if (!audio || audio.state !== 'running') return;
    const t = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const hz = kind === 'click' ? FX.audio.clickHz : kind === 'place' ? FX.audio.placeHz : kind === 'clear' ? FX.audio.clearHz : FX.audio.comboHz * 2 ** (Math.min(level - 1, FX.audio.maxSemitones) / 12);
    oscillator.type = kind === 'click' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hz, t);
    oscillator.frequency.exponentialRampToValueAtTime(hz * (kind === 'combo' ? 1.25 : .65), t + FX.audio.noteMs / 1000);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(FX.audio.gain, t + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, t + FX.audio.noteMs / 1000);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(t); oscillator.stop(t + FX.audio.noteMs / 1000 + .01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  };
  const particle = (x, y, color, vx, vy, life, parent = layer) => {
    if (!motion() || particles.length >= FX.particle.cap) return;
    const el = pool.pop() || document.createElement('i');
    el.className = 'fx-spark'; el.style.background = color; el.style.width = el.style.height = `${FX.particle.size}px`;
    parent.append(el);
    const p = particlePool.pop() || {};
    p.el = el; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.age = 0;
    particles.push(p);
  };
  const colorFor = (cells) => {
    const counts = Object.create(null);
    for (const c of cells) counts[c] = (counts[c] || 0) + 1;
    let winner = 'gold';
    for (const c of Object.keys(counts)) if (counts[c] > (counts[winner] || 0)) winner = c;
    return COLORS[winner];
  };
  const scoreSnap = value => { roll = null; setScore(value); };
  const pulseScore = () => {
    score.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: FX.score.pulse / FX.scale, easing: FX.easing.popOvershoot });
  };
  const startRoll = target => {
    if (target <= displayed) return;
    roll = { target, step: Math.max(1, Math.round((target - displayed) / FX.score.divisor)), clock: 0 };
    pulseScore();
  };
  const makeTimeline = ({ rows, cols, rowColors, colColors, center, points, streak, target, demo = false }) => {
    const t = { elapsed: 0, started: performance.now(), rows, cols, rowColors, colColors, center, points, streak, target, demo, strips: [], burst: null, label: null, popup: null, fired: 0, glowLife: streak > 1 ? FX.glow.combo : FX.glow.plain };
    timelines.push(t);
    nowLog('clear t=0', t.started);
    if (!demo) vibrate(streak > 1 ? FX.haptic.combo : FX.haptic.clear);
    if (streak === 1) sound('clear');
    if (streak > 1 && motion()) {
      const rect = board.getBoundingClientRect();
      const count = Math.min(FX.particle.cap, FX.particle.borderBase + Math.min(streak, FX.combo.maxLevel) * FX.particle.borderPerCombo);
      for (let i = 0; i < count; i++) {
        const side = i % 4; const along = ((i * .618033) % 1);
        const x = rect.left + (side < 2 ? along * rect.width : side === 2 ? 0 : rect.width);
        const y = rect.top + (side >= 2 ? along * rect.height : side === 0 ? 0 : rect.height);
        particle(x, y, i % 2 ? COLORS.teal : COLORS.gold, side === 2 ? -FX.particle.speed : side === 3 ? FX.particle.speed : 0, side === 0 ? -FX.particle.speed : side === 1 ? FX.particle.speed : 0, t.glowLife, overlay);
      }
    }
    if (streak >= FX.shake.minCombo && motion()) frame.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${FX.shake.pixels}px)` }, { transform: `translateX(-${FX.shake.pixels}px)` }, { transform: 'translateX(0)' }], { duration: FX.shake.duration / FX.scale });
    return t;
  };
  const startStrips = t => {
    const box = board.getBoundingClientRect();
    const cell = box.width / 8;
    for (const row of t.rows) t.strips.push(makeStrip('row', row, t.rowColors[row], cell));
    for (const col of t.cols) t.strips.push(makeStrip('col', col, t.colColors[col], cell));
    if (motion()) {
      for (const s of t.strips) for (let i = 0; i < FX.particle.stripPerLine; i++) {
        const along = (i + .5) / FX.particle.stripPerLine * box.width;
        particle(s.axis === 'row' ? along : (s.index + .5) * cell, s.axis === 'row' ? (s.index + .5) * cell : along, s.color, s.axis === 'row' ? (i % 2 ? 1 : -1) * FX.particle.speed : 0, s.axis === 'col' ? (i % 2 ? 1 : -1) * FX.particle.speed : 0, FX.strip.end - FX.strip.start);
      }
    }
    nowLog('strip.start', t.started);
  };
  const makeStrip = (axis, index, color, cell) => {
    const el = document.createElement('div'); el.className = `fx-strip fx-strip-${axis}`;
    el.style.background = color; el.style.boxShadow = `0 0 16px ${color}`;
    el.style.transform = axis === 'row' ? `translateY(${index * cell}px) scaleY(${FX.strip.thinScale})` : `translateX(${index * cell}px) scaleX(${FX.strip.thinScale})`;
    el.style.width = axis === 'row' ? '100%' : `${cell}px`;
    el.style.height = axis === 'row' ? `${cell}px` : '100%';
    layer.append(el); return { el, axis, index, color, cell };
  };
  const startCombo = t => {
    if (t.streak < 2) return;
    const burst = document.createElement('div'); burst.className = 'fx-burst';
    burst.style.left = `${t.center.x}px`; burst.style.top = `${t.center.y}px`; layer.append(burst); t.burst = burst;
    const label = document.createElement('div'); label.className = 'fx-combo';
    label.innerHTML = `<span>Combo</span><b>${t.streak}</b>`;
    label.style.left = `${t.center.x}px`; label.style.top = `${t.center.y}px`; layer.append(label); t.label = label;
    for (let i = 0; i < FX.refill.sparks; i++) particle(t.center.x + (i % 2 ? 1 : -1) * 20, t.center.y + (i > 1 ? 1 : -1) * 15, COLORS.gold, (i % 2 ? 1 : -1) * 20, (i > 1 ? 1 : -1) * 20, FX.combo.burst);
    sound('combo', t.streak); nowLog('combo.pop', t.started);
  };
  const startPopup = t => {
    const el = document.createElement('div'); el.className = 'fx-popup'; el.textContent = `+${t.points}`;
    const boardBox = board.getBoundingClientRect(); const scoreBox = scoreCard.getBoundingClientRect();
    const x = boardBox.left + t.center.x; const y = boardBox.top + Math.max(14, t.center.y - 20);
    el.style.left = `${x}px`; el.style.top = `${y}px`; overlay.append(el); t.popup = el;
    t.popupDx = scoreBox.left + scoreBox.width / 2 - x;
    t.popupDy = scoreBox.top + scoreBox.height / 2 - y;
    nowLog('scorePopup', t.started);
  };
  const update = (time) => {
    const dt = Math.min(50, time - last); last = time;
    const scaled = dt * FX.scale;
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 500) { fps.textContent = `${Math.round(fpsFrames * 1000 / fpsTime)} fps`; fpsFrames = 0; fpsTime = 0; }
    if (roll) {
      roll.clock += scaled;
      while (roll.clock >= FX.score.tick) { roll.clock -= FX.score.tick; setScore(Math.min(roll.target, displayed + roll.step)); if (displayed >= roll.target) { roll = null; break; } }
    }
    for (let j = timelines.length - 1; j >= 0; j--) {
      const t = timelines[j]; t.elapsed += scaled; const e = t.elapsed;
      if (!(t.fired & 1) && e >= FX.strip.start) { t.fired |= 1; startStrips(t); }
      if (!(t.fired & 16) && e >= FX.badge.start) {
        t.fired |= 16;
        if (t.streak >= 2) {
          badge.classList.add('is-active');
          badge.animate([{ opacity: .55, transform: 'rotate(-18deg) scale(.85)' }, { opacity: 1, transform: 'rotate(-18deg) scale(1.18)' }, { opacity: .72, transform: 'rotate(-18deg) scale(1)' }], { duration: FX.badge.pulse / FX.scale });
          nowLog('badge.pulse', t.started);
        }
      }
      if (!(t.fired & 2) && e >= FX.combo.start) { t.fired |= 2; startCombo(t); }
      const popStart = t.streak > 1 ? FX.popup.comboStart : FX.popup.plainStart;
      if (!(t.fired & 4) && e >= popStart) { t.fired |= 4; startPopup(t); }
      const arrive = popStart + FX.popup.pop + FX.popup.hold + FX.popup.fly;
      if (!(t.fired & 8) && e >= arrive) { t.fired |= 8; if (!t.demo) startRoll(t.target); nowLog('scoreRoll', t.started); }
      const glow = e < FX.glow.rise ? e / FX.glow.rise : clamp((t.glowLife - e) / (t.glowLife - FX.glow.rise));
      if (e < t.glowLife && motion()) {
        flash.style.opacity = `${glow * (t.streak > 1 ? .85 : .6)}`;
        flash.style.color = t.streak > 2 ? '#b9efee' : COLORS.gold;
        flash.style.borderColor = flash.style.color;
      }
      for (const s of t.strips) {
        const grow = clamp((e - FX.strip.start) / (FX.strip.full - FX.strip.start));
        const fade = e > FX.strip.fade ? clamp((FX.strip.end - e) / (FX.strip.end - FX.strip.fade)) : 1;
        s.el.style.opacity = `${fade * .48}`;
        s.el.style.transform = s.axis === 'row' ? `translateY(${s.index * s.cell}px) scaleY(${FX.strip.thinScale + grow * (1 - FX.strip.thinScale)})` : `translateX(${s.index * s.cell}px) scaleX(${FX.strip.thinScale + grow * (1 - FX.strip.thinScale)})`;
      }
      if (t.burst) { const p = clamp((e - FX.combo.start) / FX.combo.burst); t.burst.style.opacity = `${1 - p}`; t.burst.style.transform = `translate(-50%, -50%) scale(${.4 + p * 1.3})`; }
      if (t.label) {
        const a = e - FX.combo.start;
        const end = FX.combo.settle + FX.combo.hold;
        let size = a < FX.combo.popPeak ? .3 + easeOut(clamp(a / FX.combo.popPeak)) * (FX.combo.peak - .3) : a < FX.combo.settle ? FX.combo.peak - (FX.combo.peak - 1) * clamp((a - FX.combo.popPeak) / (FX.combo.settle - FX.combo.popPeak)) : a < end ? 1 : a < end + FX.combo.exit ? 1.2 * (1 - clamp((a - end) / FX.combo.exit)) : 0;
        t.label.style.transform = `translate(-50%, -50%) scale(${size})`;
        t.label.style.opacity = `${a < end + FX.combo.exit ? 1 : 0}`;
        const digitPop = a < FX.combo.popPeak ? .3 + easeOut(clamp(a / FX.combo.popPeak)) * (FX.combo.digitPeak - .3) : a < FX.combo.settle ? FX.combo.digitPeak - (FX.combo.digitPeak - 1) * clamp((a - FX.combo.popPeak) / (FX.combo.settle - FX.combo.popPeak)) : 1;
        t.label.lastElementChild.style.transform = `scale(${digitPop * (FX.combo.digitBase + Math.min(t.streak, FX.combo.maxLevel) * .025)})`;
      }
      if (t.popup) {
        const a = e - popStart;
        const p = clamp(a / FX.popup.pop);
        const f = clamp((a - FX.popup.pop - FX.popup.hold) / FX.popup.fly);
        t.popup.style.opacity = `${f ? 1 - f : 1}`;
        t.popup.style.transform = `translate(calc(-50% + ${t.popupDx * easeIn(f)}px), calc(-50% + ${t.popupDy * easeIn(f)}px)) scale(${f ? 1 - .65 * f : .35 + .65 * easeOut(p)})`;
      }
      if (e > Math.max(arrive, t.glowLife, FX.strip.end, FX.combo.start + FX.combo.settle + FX.combo.hold + FX.combo.exit) + 20) {
        t.strips.forEach(s => s.el.remove()); t.burst?.remove(); t.label?.remove(); t.popup?.remove(); timelines.splice(j, 1);
        if (!timelines.length) flash.style.opacity = 0;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.age += scaled;
      if (p.age >= p.life) { p.el.remove(); pool.push(p.el); particlePool.push(p); particles.splice(i, 1); continue; }
      p.el.style.transform = `translate(${p.x + p.vx * p.age / 1000}px, ${p.y + p.vy * p.age / 1000}px)`;
      p.el.style.opacity = `${1 - p.age / p.life}`;
    }
    if (live) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
  return {
    unlock, sound, vibrate, scoreSnap,
    breakStreak() { badge.classList.remove('is-active'); },
    clear({ before, placedCells, pieceColor, result, gain, target }) {
      const placed = new Map(placedCells.map(([r, c]) => [r * 8 + c, pieceColor]));
      const rowColors = {}, colColors = {};
      for (const r of result.rows) rowColors[r] = colorFor(Array.from({ length: 8 }, (_, c) => placed.get(r * 8 + c) || before[r][c]).filter(Boolean));
      for (const c of result.cols) colColors[c] = colorFor(Array.from({ length: 8 }, (_, r) => placed.get(r * 8 + c) || before[r][c]).filter(Boolean));
      const minR = Math.min(...result.rows, ...(result.cols.length ? [0] : []));
      const maxR = Math.max(...result.rows, ...(result.cols.length ? [7] : []));
      const minC = Math.min(...result.cols, ...(result.rows.length ? [0] : []));
      const maxC = Math.max(...result.cols, ...(result.rows.length ? [7] : []));
      const cell = board.getBoundingClientRect().width / 8;
      makeTimeline({ rows: result.rows, cols: result.cols, rowColors, colColors, center: { x: (minC + maxC + 1) * cell / 2, y: (minR + maxR + 1) * cell / 2 }, points: gain, streak: result.streak, target });
    },
    refill() {
      if (!motion()) return;
      for (const slot of document.querySelectorAll('.piece-arrived')) {
        const glow = document.createElement('span'); glow.className = 'refill-halo'; slot.append(glow);
        glow.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: FX.refill.halo / FX.scale }).onfinish = () => glow.remove();
        for (let i = 0; i < FX.refill.sparks; i++) {
          const dot = document.createElement('i'); dot.className = 'refill-spark';
          dot.style.left = `${20 + (i % 2) * 60}%`; dot.style.top = `${20 + Math.floor(i / 2) * 60}%`; slot.append(dot);
          dot.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.4)' }], { duration: FX.refill.halo / FX.scale }).onfinish = () => dot.remove();
        }
      }
    },
    reset(value) {
      timelines.forEach(t => { t.strips.forEach(s => s.el.remove()); t.burst?.remove(); t.label?.remove(); t.popup?.remove(); }); timelines.length = 0;
      particles.forEach(p => { p.el.remove(); pool.push(p.el); particlePool.push(p); }); particles.length = 0; flash.style.opacity = 0; badge.classList.remove('is-active'); scoreSnap(value);
    },
    debug(kind) {
      const row = kind === 'clear' ? 3 : 4;
      const level = kind === 'clear' ? 1 : kind === 'large' ? 6 : Number(debug.querySelector('#debug-combo').value);
      makeTimeline({ rows: [row], cols: kind === 'large' ? [4] : [], rowColors: { [row]: COLORS.teal }, colColors: { 4: COLORS.coral }, center: { x: board.clientWidth / 2, y: board.clientHeight / 2 }, points: kind === 'large' ? 1847 : 100 + level * 25, streak: level, target: displayed, demo: true });
    },
  };
}
