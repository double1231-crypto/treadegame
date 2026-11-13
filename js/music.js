// 🎵 배경음악 (선생님 화면에서만)
// 기본: 파일 없이 브라우저가 단계마다 분위기가 다른 음악을 만들어요 (저작권 걱정 없음).
// 원하는 음악이 있으면 music 폴더에 mp3를 넣으세요: lobby.mp3, minigame.mp3, trade.mp3, crisis.mp3, end.mp3
//   (있는 파일만 그 음악으로 바뀌고, 없는 단계는 만든 음악이 나와요)
import { audioCtx, onSfx, store } from './ui.js';

// 분위기: bpm, 음계, 화음 진행(으뜸음에서 반음 수), 악기 느낌
const MOODS = {
  lobby:    { bpm: 76,  root: 57, scale: [0, 2, 4, 7, 9], prog: [0, 5, 7, 5], lead: 'sine', density: 0.35, hat: false, label: '잔잔한 항구' },
  minigame: { bpm: 132, root: 62, scale: [0, 2, 4, 7, 9], prog: [0, 0, 5, 7], lead: 'square', density: 0.7, hat: true, label: '두근두근 미니게임' },
  trade:    { bpm: 104, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 9, 5, 7], lead: 'triangle', density: 0.5, hat: true, label: '활기찬 시장' },
  crisis:   { bpm: 70,  root: 57, scale: [0, 2, 3, 7, 8], prog: [0, 8, 3, 7], lead: 'sawtooth', density: 0.3, hat: false, label: '세계대공황', minor: true },
  end:      { bpm: 84,  root: 60, scale: [0, 2, 4, 7, 9, 11], prog: [0, 5, 0, 7], lead: 'triangle', density: 0.45, hat: false, label: '축하' },
};
const FILES = ['lobby', 'minigame', 'trade', 'crisis', 'end'];

const saved = store('tradeciv-music') || {};
let on = saved.on !== false;
let volume = typeof saved.vol === 'number' ? saved.vol : 0.5;
let mood = null;          // 지금 분위기
let endsAt = 0;           // 미니게임 끝나는 시각 (마지막 10초 째깍째깍)
let quiet = false;        // 튜토리얼 등: 소리를 오래 줄임
let master = null, duckGain = null;
let timer = null, nextTime = 0, step = 0;
let fileAudio = null;     // mp3를 쓰는 경우
const fileOk = {};        // 단계별 mp3가 있는지
let unlocked = false;
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function save() { store('tradeciv-music', { on, vol: volume }); }

function ensureGraph() {
  const ctx = audioCtx();
  if (!ctx) return null;
  if (!master) {
    master = ctx.createGain();
    duckGain = ctx.createGain();
    master.connect(duckGain).connect(ctx.destination);
    master.gain.value = on ? volume * 0.35 * (quiet ? 0.35 : 1) : 0;
  }
  return ctx;
}

function applyVolume() {
  const ctx = ensureGraph();
  const target = on ? volume * 0.35 * (quiet ? 0.35 : 1) : 0;
  if (ctx && master) master.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
  if (fileAudio) fileAudio.volume = on ? Math.min(1, volume * (quiet ? 0.35 : 1)) : 0;
}

// 효과음이 날 때 음악을 잠깐 줄여요
function duck() {
  const ctx = audioCtx();
  if (!ctx || !duckGain) return;
  const t = ctx.currentTime;
  duckGain.gain.cancelScheduledValues(t);
  duckGain.gain.setTargetAtTime(0.3, t, 0.05);
  duckGain.gain.setTargetAtTime(1, t + 1.2, 0.4);
  if (fileAudio) { fileAudio.volume *= 0.3; setTimeout(applyVolume, 1300); }
}
onSfx(duck);

/* ---------- 만든 음악 ---------- */
function note(ctx, type, freq, t, dur, gain, attack = 0.01) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
let noiseBuf = null;
function hat(ctx, t, gain = 0.05, len = 0.04) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + len + 0.02);
}

function scheduleStep(ctx, m, t) {
  const eighth = 60 / m.bpm / 2;
  const bar = Math.floor(step / 8) % m.prog.length;
  const pos = step % 8;
  const root = m.root + m.prog[bar];
  const third = m.minor || m.prog[bar] === 9 ? 3 : 4;
  // 화음 (마디 처음에 부드럽게)
  if (pos === 0) for (const iv of [0, third, 7]) note(ctx, 'sine', hz(root + iv), t, eighth * 8, 0.035, 0.25);
  // 베이스
  if (pos === 0 || pos === 4) note(ctx, 'triangle', hz(root - 12), t, eighth * 3.5, 0.09, 0.02);
  // 멜로디 (매번 조금씩 다르게)
  if (rnd() < m.density) {
    const sc = m.scale[Math.floor(rnd() * m.scale.length)];
    const oct = rnd() < 0.3 ? 24 : 12;
    note(ctx, m.lead, hz(m.root + sc + oct), t, eighth * (rnd() < 0.3 ? 2 : 1), m.lead === 'square' || m.lead === 'sawtooth' ? 0.025 : 0.06);
  }
  if (m.hat && pos % 2 === 1) hat(ctx, t);
  // 미니게임 마지막 10초: 째깍째깍
  if (mood === 'minigame' && endsAt) {
    const left = endsAt - Date.now() - (t - ctx.currentTime) * 1000;
    if (left > 0 && left < 10000 && pos % 2 === 0) note(ctx, 'square', pos % 4 === 0 ? 1760 : 1320, t, 0.05, 0.03);
  }
  step++;
  return eighth;
}

function startSynth() {
  stopSynth();
  const ctx = ensureGraph();
  if (!ctx || !mood) return;
  const m = MOODS[mood];
  seed = 7 + FILES.indexOf(mood) * 101;
  step = 0;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(() => {
    while (nextTime < ctx.currentTime + 0.3) nextTime += scheduleStep(ctx, m, nextTime);
  }, 80);
  if (mood === 'end') fanfare(ctx);
}
function stopSynth() { clearInterval(timer); timer = null; }
function fanfare(ctx) {
  const t = ctx.currentTime + 0.05;
  [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [72, 0.75]].forEach(([n, at]) => note(ctx, 'triangle', hz(n + 12), t + at, 0.5, 0.12));
}

/* ---------- mp3 파일 ---------- */
async function hasFile(name) {
  if (name in fileOk) return fileOk[name];
  fileOk[name] = false;
  try {
    const r = await fetch(`music/${name}.mp3`, { method: 'HEAD', cache: 'no-store' });
    fileOk[name] = r.ok && !/text\/html/.test(r.headers.get('content-type') || '');
  } catch { fileOk[name] = false; }
  return fileOk[name];
}
function stopFile() { if (fileAudio) { fileAudio.pause(); fileAudio = null; } }

async function play() {
  if (!unlocked || !on || !mood) { stopSynth(); stopFile(); return; }
  const want = mood;
  if (await hasFile(want)) {
    if (mood !== want) return;
    stopSynth();
    if (!fileAudio || !fileAudio.src.endsWith(`music/${want}.mp3`)) {
      stopFile();
      fileAudio = new Audio(`music/${want}.mp3`);
      fileAudio.loop = want !== 'end';
      applyVolume();
      fileAudio.play().catch(() => {});
    }
  } else {
    if (mood !== want) return;
    stopFile();
    startSynth();
  }
}

/* ---------- 바깥에서 쓰는 함수 ---------- */
// 게임 상태를 보고 분위기를 정해요
export function updateMusic(s) {
  let m = 'trade';
  if (s.phase === 'lobby' || s.phase === 'prep') m = 'lobby';
  else if (s.phase === 'end') m = 'end';
  else if (s.crisis) m = 'crisis';
  else if (s.phase === 'minigame') m = 'minigame';
  endsAt = s.phase === 'minigame' && s.pausedRemaining == null ? s.phaseEndsAt || 0 : 0;
  const q = !!s.tutorial || !!s.freeze || s.pausedRemaining != null;
  if (q !== quiet) { quiet = q; applyVolume(); }
  if (m !== mood) { mood = m; play(); renderWidget(); }
}

// 브라우저는 화면을 한 번 눌러야 소리를 낼 수 있어요
function unlock() {
  if (unlocked) return;
  const ctx = audioCtx();
  if (ctx?.state === 'suspended') ctx.resume();
  unlocked = true;
  play();
  renderWidget();
}

let widget = null;
function renderWidget() {
  if (!widget) return;
  const label = mood ? MOODS[mood].label : '';
  widget.querySelector('.mw-toggle').textContent = on ? '🎵 배경음악 켜짐' : '🔇 배경음악 꺼짐';
  widget.querySelector('.mw-toggle').classList.toggle('off', !on);
  widget.querySelector('.mw-mood').textContent = !on ? '' : !unlocked ? '화면을 한 번 누르면 시작해요' : label;
  widget.querySelector('input').value = Math.round(volume * 100);
}

// 화면 왼쪽 아래 작은 음악 조절 (다시 그려지지 않는 곳에 둬서 슬라이더가 끊기지 않아요)
export function mountMusicWidget() {
  if (widget) return;
  widget = document.createElement('div');
  widget.className = 'music-widget';
  widget.innerHTML = `<button class="mw-toggle" type="button"></button>
    <input type="range" min="0" max="100" step="5" aria-label="배경음악 소리 크기">
    <span class="mw-mood"></span>`;
  document.body.appendChild(widget);
  widget.querySelector('.mw-toggle').addEventListener('click', () => {
    on = !on; save(); unlock(); applyVolume(); play(); renderWidget();
  });
  widget.querySelector('input').addEventListener('input', (e) => {
    volume = Number(e.target.value) / 100; save(); unlock(); applyVolume();
  });
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
  renderWidget();
}
