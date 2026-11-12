// 두 화면에서 같이 쓰는 작은 도구들
import { RES, RES_INFO, ITEMS, ITEM_INFO } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function fmtTime(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function toast(text, kind = 'info', ms = 3500) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), ms);
}

export function resChips(obj, { showZero = false } = {}) {
  const parts = ITEMS.filter((r) => showZero || obj?.[r] > 0).map((r) => `${ITEM_INFO[r].icon}${obj?.[r] || 0}`);
  return parts.join(' ') || '없음';
}

export const icons = (list) => list.map((r) => RES_INFO[r].icon).join('');

// 받침에 맞는 조사 붙이기: josa('철', '이/가') -> '철이', josa('도시', '으로/로') -> '도시로'
export function josa(word, pair) {
  const [withB, noB] = pair.split('/');
  const last = String(word).trim().slice(-1);
  // 숫자로 끝나면 읽는 소리로: 0영 1일 2이 3삼 4사 5오 6육 7칠 8팔 9구 (받침 있음: 0,1,3,6,7,8 / ㄹ받침: 1,7,8)
  if (/[0-9]/.test(last)) {
    if (pair === '으로/로') return word + ('0368'.includes(last) ? '으로' : '로');
    return word + ('013678'.includes(last) ? withB : noB);
  }
  const ch = last.charCodeAt(0) - 0xac00;
  if (ch < 0 || ch > 11171) return word + noB;
  const jong = ch % 28;
  if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? '로' : '으로');
  return word + (jong ? withB : noB);
}

// 효과음: 소리 파일 없이 브라우저에서 바로 만들어요
let actx = null;
const SFX = {
  trade:  [[660, 0, .12], [880, .1, .18]],
  level:  [[523, 0, .12], [659, .1, .12], [784, .2, .12], [1047, .3, .3]],
  news:   [[784, 0, .15], [1175, .12, .3]],
  crisis: [[392, 0, .3], [311, .25, .3], [233, .5, .5]],
  good:   [[880, 0, .12], [1320, .1, .2]],
  notice: [[988, 0, .1], [988, .18, .14]],
  unlock: [[659, 0, .1], [880, .1, .1], [1319, .2, .25]],
};
export function sfx(name, on = true) {
  if (!on || !SFX[name]) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime;
    for (const [f, at, dur] of SFX[name]) {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = name === 'crisis' ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(name === 'crisis' ? 0.08 : 0.15, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(actx.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    }
  } catch { /* 소리를 못 내는 기기면 그냥 넘어가요 */ }
}

// 글 읽어 주기 (한국어)
export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[\n○□]/g, ' '));
    u.lang = 'ko-KR'; u.rate = 0.95;
    const ko = synth.getVoices().find((v) => v.lang?.startsWith('ko'));
    if (ko) u.voice = ko;
    synth.speak(u);
    return true;
  } catch { return false; }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
  return val;
}
