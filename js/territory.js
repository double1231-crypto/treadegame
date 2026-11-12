// 나라마다 섬 모양 영토를 그립니다. 같은 나라는 언제나 같은 모양이고, 발전할수록 섬이 커져요.
// 자원마다 땅(구역)이 있고, 라운드당 생산량만큼 시설이 생깁니다.
import { RES, STAGES } from './config.js';
import { flagShapes, flagSvg } from './flag.js';
import { josa } from './ui.js';

export const FACILITY = {
  food:  { icon: '🌾', name: '농장',   land: '#7cc56a' },
  wood:  { icon: '🌲', name: '숲',     land: '#2f9a5c' },
  stone: { icon: '⛰️', name: '채석장', land: '#9aa6b2' },
  iron:  { icon: '⛏️', name: '광산',   land: '#b8774f' },
  gold:  { icon: '🪙', name: '금광',   land: '#e2bb52' },
};
const MAX_ICONS = 7;

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// c: { pid, color, stage, rich, poor, workshops, prod, atWar }
export function territorySvg(c, { small = false } = {}) {
  const seed = hash(c.pid);
  const r0 = rng(seed);
  const W = 400, H = 300, cx = 200, cy = 152;
  const lv = c.stage || 0;
  // 단계가 오를수록 섬이 확 넓어져요 (마을 74 → 도시 91 → 왕국 108 → 제국 125)
  const R = 74 + lv * 17;
  // 섬 테두리: 몇 개의 물결을 겹쳐서 울퉁불퉁하게
  const waves = [2, 3, 5].map((k) => ({ k, a: 0.04 + r0() * 0.05, p: r0() * 6.28 }));
  const rot = r0() * 6.28;
  const rad = (t) => R * (1 + waves.reduce((s, w) => s + w.a * Math.sin(w.k * t + w.p), 0));
  const pt = (t, f = 1) => [cx + Math.cos(t) * rad(t) * f, cy + Math.sin(t) * rad(t) * f * 0.82];
  const coast = Array.from({ length: 90 }, (_, i) => pt((i / 90) * Math.PI * 2)).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';
  // 같은 나라 지도가 한 화면에 여러 장 있어도 서로 섞이지 않게, 크기·단계까지 넣은 고유 이름
  const id = `isl${seed}${small ? 's' : 'b'}${lv}`;

  // 자원 구역 순서도 나라마다 다르게 (항상 같게)
  const order = [...RES].sort((a, b) => hash(c.pid + a) - hash(c.pid + b));
  const span = (Math.PI * 2) / order.length;
  const trait = (r) => (c.rich?.includes(r) ? 'rich' : c.poor?.includes(r) ? 'poor' : 'normal');

  let lands = '', icons = '', marks = '';
  order.forEach((r, i) => {
    const a0 = rot + i * span, a1 = a0 + span;
    const f = FACILITY[r];
    const tr = trait(r);
    const wedge = [[cx, cy], ...Array.from({ length: 13 }, (_, j) => pt(a0 + (span * j) / 12, 1.25))]
      .map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';
    lands += `<path d="${wedge}" fill="${f.land}" opacity="${tr === 'rich' ? 0.62 : tr === 'poor' ? 0.16 : 0.36}"/>`;
    // 구역 경계선
    const e = pt(a0, 1.1);
    lands += `<line x1="${cx}" y1="${cy}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" stroke="rgba(5,10,20,.35)" stroke-width="1.5"/>`;

    // 시설 자리: 바깥 줄 4칸 + 안쪽 줄 3칸. 자리를 미리 정해 두어서 겹치지 않고, 늘어나도 원래 시설은 그대로예요.
    const pr = rng(hash(c.pid + r));
    const spots = [
      ...[0, 1, 2, 3].map((k) => [(k + 0.5) / 4, 0.84]),
      ...[0, 1, 2].map((k) => [(k + 0.5) / 3, 0.63]),
    ].map(([fa, fr]) => pt(a0 + span * (0.08 + fa * 0.84) + (pr() - 0.5) * 0.06, fr + (pr() - 0.5) * 0.05))
      .sort(() => pr() - 0.5);
    const fs = (small ? 24 : 18) + lv * 1.5;
    const ws = Math.min(2, c.workshops?.[r] || 0);
    const n = Math.min(MAX_ICONS - ws, c.prod?.[r] ?? 0);
    const put = (icon, [x, y], size) => { icons += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${icon}</text>`; };
    for (let j = 0; j < ws; j++) put('🏭', spots[j], fs + 4);
    for (let j = 0; j < n; j++) put(f.icon, spots[ws + j], fs);
    if (tr === 'poor' && !small) {
      const [x, y] = pt(a0 + span / 2, lv >= 2 ? 0.86 : 0.66);
      marks += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="15" font-weight="700" fill="#ffc2c2" text-anchor="middle" dominant-baseline="central">부족</text>`;
    }
  });

  const st = STAGES[lv];
  const capSize = 32 + lv * 7;
  const capR = capSize * 0.72;
  const war = c.atWar
    ? `<path d="${coast}" fill="rgba(255,80,80,.18)"/><text x="${cx + capSize * 0.75}" y="${cy - capSize * 0.6}" font-size="26" text-anchor="middle" dominant-baseline="central">⚔️</text>`
    : '';
  const deco = stageDeco({ lv, cx, cy, R, rot, span, order, pt, capR, small, seed, id });
  return `<svg class="territory ${small ? 'small' : ''}" viewBox="${small ? '40 24 320 256' : `0 0 ${W} ${H}`}" role="img" aria-label="${esc(c.name || '')} 영토">
    <defs>
      <radialGradient id="${id}sea" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#13365e"/><stop offset="1" stop-color="#071528"/></radialGradient>
      <clipPath id="${id}clip"><path d="${coast}"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" rx="22" fill="url(#${id}sea)"/>
    ${deco.sea}
    ${deco.aura}
    <path d="${coast}" transform="translate(0 6)" fill="rgba(0,0,0,.35)"/>
    <path d="${coast}" fill="#e9d8a6" stroke="#f6ecc9" stroke-width="${8 + lv * 2}" stroke-linejoin="round" opacity=".9"/>
    <path d="${coast}" fill="#2a4a33"/>
    <g clip-path="url(#${id}clip)">${lands}${deco.roads}</g>
    <path d="${coast}" fill="none" stroke="${esc(c.color || '#7fb6ff')}" stroke-width="${2.5 + lv * 0.8}" stroke-dasharray="${c.atWar ? '8 6' : 'none'}"/>
    ${marks}${icons}
    ${deco.town}
    <circle cx="${cx}" cy="${cy}" r="${capR}" fill="${lv === 3 ? 'rgba(80,60,10,.6)' : 'rgba(5,10,20,.55)'}" stroke="${lv === 3 ? '#ffd76a' : esc(c.color || '#7fb6ff')}" stroke-width="${3 + (lv === 3 ? 1 : 0)}"/>
    <text x="${cx}" y="${cy + 1}" font-size="${capSize}" text-anchor="middle" dominant-baseline="central">${st.icon}</text>
    <g transform="translate(${(cx - capSize * 0.62 - 30).toFixed(1)} ${(cy - capSize * 1.25).toFixed(1)})">
      <line x1="0" y1="0" x2="0" y2="${(capSize * 0.9 + 14).toFixed(1)}" stroke="#e8e2d0" stroke-width="2.5" stroke-linecap="round"/>
      <g transform="translate(1.5 1) scale(0.5)">${flagShapes(c)}<rect width="60" height="40" fill="none" stroke="rgba(0,0,0,.3)"/></g>
    </g>
    ${deco.top}
    ${war}
  </svg>`;
}

// 발전 단계별 꾸미기: 길, 집, 성벽, 배, 작은 섬, 빛
function stageDeco({ lv, cx, cy, rot, span, order, pt, capR, small, seed, id }) {
  const f1 = (n) => n.toFixed(1);
  const out = { sea: '', aura: '', roads: '', town: '', top: '' };
  if (lv === 0) return out;

  // 빛나는 둘레: 왕국은 은은하게, 제국은 금빛으로
  if (lv >= 2) {
    const col = lv === 3 ? '255,210,100' : '140,190,255';
    out.aura = `<defs><radialGradient id="${id}aura"><stop offset=".55" stop-color="rgba(${col},.35)"/><stop offset="1" stop-color="rgba(${col},0)"/></radialGradient></defs>
      <ellipse cx="${cx}" cy="${cy}" rx="190" ry="150" fill="url(#${id}aura)"/>`;
  }

  // 길: 도시는 흙길, 왕국은 돌길, 제국은 금빛 길
  const road = [null, { c: '#cdb48a', w: 3, d: '5 4' }, { c: '#d9d3c4', w: 4, d: 'none' }, { c: '#f2cf6b', w: 4.5, d: 'none' }][lv];
  order.forEach((_, i) => {
    const mid = rot + i * span + span / 2;
    const [x1, y1] = pt(mid, 0.12);
    const [x2, y2] = pt(mid, 0.92);
    out.roads += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${road.c}" stroke-width="${road.w}" stroke-dasharray="${road.d}" stroke-linecap="round" opacity=".85"/>`;
  });
  // 바깥 둘레 길 (왕국부터)
  if (lv >= 2) {
    const ring = Array.from({ length: 60 }, (_, i) => pt((i / 60) * Math.PI * 2, 0.74)).map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join('') + 'Z';
    out.roads += `<path d="${ring}" fill="none" stroke="${road.c}" stroke-width="${road.w - 1}" opacity=".6"/>`;
  }

  // 수도 둘레 집들
  const houses = [0, 5, 7, 9][lv];
  const hIcon = ['', '🏠', '🏡', '🏛️'][lv];
  const hr = capR + 13;
  for (let i = 0; i < houses; i++) {
    const t = (i / houses) * Math.PI * 2 + 0.3;
    out.town += `<text x="${f1(cx + Math.cos(t) * hr)}" y="${f1(cy + Math.sin(t) * hr * 0.82)}" font-size="${small ? 15 : 12}" text-anchor="middle" dominant-baseline="central">${hIcon}</text>`;
  }
  // 성벽과 탑 (왕국부터)
  if (lv >= 2) {
    const wr = capR + 25;
    const wall = lv === 3 ? '#ffd76a' : '#d8cfb8';
    out.town += `<ellipse cx="${cx}" cy="${cy}" rx="${f1(wr)}" ry="${f1(wr * 0.82)}" fill="none" stroke="${wall}" stroke-width="4" stroke-dasharray="7 3"/>`;
    const towers = lv === 3 ? 8 : 4;
    for (let i = 0; i < towers; i++) {
      const t = (i / towers) * Math.PI * 2 + Math.PI / towers;
      out.town += `<circle cx="${f1(cx + Math.cos(t) * wr)}" cy="${f1(cy + Math.sin(t) * wr * 0.82)}" r="4.5" fill="${wall}" stroke="rgba(0,0,0,.35)"/>`;
    }
  }

  // 바다의 배: 도시 1척 → 왕국 2척 → 제국 3척
  const ships = [[318, 252, '⛵'], [78, 70, '⛵'], [330, 52, '🚢']].slice(0, lv);
  for (const [x, y, s] of ships) {
    out.sea += `<path d="M${x - 16},${y + 12} q8,-4 16,0 t16,0" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>`;
    out.top += `<text x="${x}" y="${y}" font-size="${small ? 26 : 20}" text-anchor="middle" dominant-baseline="central">${lv === 3 && s === '⛵' ? '🛳️' : s}</text>`;
  }
  // 작은 섬 (왕국부터): 영토가 바다 건너까지 넓어져요
  const islets = lv >= 2 ? [[62, 236, 20, '🌴'], [346, 150, 17, lv === 3 ? '🗼' : '🌴'], ...(lv === 3 ? [[70, 140, 15, '⛲']] : [])] : [];
  for (const [x, y, r, s] of islets) {
    out.sea += `<ellipse cx="${x}" cy="${y + 3}" rx="${r + 3}" ry="${(r + 3) * 0.7}" fill="rgba(0,0,0,.3)"/>
      <ellipse cx="${x}" cy="${y}" rx="${r + 3}" ry="${(r + 3) * 0.7}" fill="#e9d8a6"/>
      <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.68}" fill="#3f7a4a"/>`;
    out.top += `<text x="${x}" y="${y - 2}" font-size="${small ? 22 : 17}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
  }
  // 제국: 반짝이는 불빛
  if (lv === 3) {
    const r = rng(seed + 7);
    for (let i = 0; i < 14; i++) {
      out.top += `<circle cx="${f1(20 + r() * 360)}" cy="${f1(16 + r() * 268)}" r="${f1(0.8 + r() * 1.6)}" fill="#ffe7a3" opacity="${f1(0.4 + r() * 0.5)}"/>`;
    }
  }
  return out;
}

// 다른 나라가 발전했을 때 띄우는 공지 카드 (학생·선생님 화면 공용)
const STAGE_SHORT = ['', '흙길과 집이 생기고 배가 다니기 시작했어요.', '성벽과 망루, 바다 건너 작은 섬까지 생겼어요.', '금빛 길과 궁전, 큰 배까지! 제국이 되었어요.'];
export function announceHtml(c, stage, { big = false } = {}) {
  const st = STAGES[stage] || STAGES[0];
  return `<div class="ann-sheet ann-${stage} ${big ? 'big' : ''}">
    <div class="kicker">📣 World News · 세계 소식</div>
    <div class="ann-icon">${st.icon}</div>
    <div class="ann-title">${flagSvg(c, 'inline')} <b>${esc(c.name)}</b> 나라가<br><b class="ann-stage">${esc(josa(st.name, '으로/로'))}</b> 발전했어요!</div>
    ${territorySvg({ ...c, stage })}
    <p class="ann-note">${STAGE_SHORT[stage] || ''}</p>
    <button class="ghost" data-act="closeann">확인</button>
  </div>`;
}

// 새 기능이 열렸을 때 카드 (학생·선생님 화면 공용)
export function unlockHtml(m, { big = false } = {}) {
  return `<div class="ann-sheet unlock-sheet ${big ? 'big' : ''}">
    <div class="kicker">🔓 ${m.round}라운드 · 새 기능</div>
    <div class="ann-icon">${m.items.map((x) => x.icon).join(' ')}</div>
    <div class="ann-title"><b>${m.items.map((x) => esc(x.name)).join(', ')}</b> 기능이 열렸어요!</div>
    ${m.items.map((x) => `<p class="ann-note" style="font-size:1.15rem;color:var(--ink)">${x.icon} ${esc(x.how)}</p>`).join('')}
    <button class="ghost" data-act="closeann">알겠어요</button>
  </div>`;
}

// 협동 프로젝트·국제 입찰 결과 등 세계 소식 카드 (학생·선생님 화면 공용)
export function newsHtml(m, { big = false } = {}) {
  return `<div class="ann-sheet news-sheet ${m.good ? 'news-good' : 'news-bad'} ${big ? 'big' : ''}">
    <div class="kicker">📣 World News · 세계 소식</div>
    <div class="ann-icon">${m.icon}</div>
    <div class="ann-title"><b>${esc(m.title)}</b></div>
    <p class="ann-note" style="font-size:1.2rem;color:var(--ink)">${esc(m.text)}</p>
    ${m.note ? `<p class="ann-note">💡 ${esc(m.note)}</p>` : ''}
    <button class="ghost" data-act="closeann">확인</button>
  </div>`;
}

// 세계대공황 시작·끝 알림 카드 (학생·선생님 화면 공용)
export function crisisHtml(type, { big = false } = {}) {
  const start = type === 'start';
  return `<div class="ann-sheet crisis-sheet ${start ? 'crisis-start' : 'crisis-end'} ${big ? 'big' : ''}">
    <div class="kicker">📣 World News · 세계 소식</div>
    <div class="ann-icon">${start ? '📉' : '📈'}</div>
    <div class="ann-title">${start ? '<b>세계대공황</b>이 일어났어요!' : '<b>세계 경제가 회복</b>되었어요!'}</div>
    <p class="ann-note" style="font-size:1.2rem;color:var(--ink)">${start
      ? '전쟁과 다툼으로 세계 평화가 무너져<br><b>모든 나라의 생산량이 절반</b>으로 줄어요.'
      : '무역과 원조로 세계 평화가 되살아나<br><b>모든 나라의 생산량이 원래대로</b> 돌아와요.'}</p>
    <p class="ann-note">${start ? '🤝 무역하고 🎁 서로 도와서 평화를 되찾아요!' : '앞으로도 서로 돕는 세계를 만들어요!'}</p>
    <button class="ghost" data-act="closeann">확인</button>
  </div>`;
}

// 지도 아래에 붙는 시설 설명
export function facilityLegend(c) {
  return `<div class="flegend">${RES.map((r) => {
    const f = FACILITY[r];
    const n = Math.min(MAX_ICONS, c.prod?.[r] ?? 0);
    const ws = c.workshops?.[r] || 0;
    return `<span class="${c.poor?.includes(r) ? 'poor' : c.rich?.includes(r) ? 'rich' : ''}">${f.icon} ${f.name} <b>${n}</b>${ws ? ` · 🏭${ws}` : ''}</span>`;
  }).join('')}</div>`;
}
