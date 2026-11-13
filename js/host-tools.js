// 선생님 화면 도구 모음: 설정, 튜토리얼, 선생님 도구, QR 입장, 세계 지도, 되돌아보기·결과 내려받기
import { flagSvg, flagShapes } from './flag.js';
import {
  RES, RES_INFO, STAGES, ITEMS, ITEM_INFO, GOODS, GOODS_INFO, LENGTHS, UNLOCK, FEATURE_INFO, QSETS,
  REFLECT_QS, PEACE, GDP, WORLD_TASKS, TOTAL_ROUNDS, PORT, TARIFF,
} from './config.js';
import { territorySvg } from './territory.js';
import { esc, resChips, sfx, won } from './ui.js';

/* ================= 선생님 설정 (참가 대기 화면) ================= */
const FEATURE_LABEL = {
  minigame: '🎯 미니게임', events: '🃏 사건 카드', goods: '🏭 공장·공산품', world: '🌐 세계 과제(프로젝트·입찰)',
  aid: '🎁 원조·도움 요청', war: '⚔️ 전쟁', mission: '🕵️ 비밀 임무', tutorial: '📱 학생 튜토리얼 먼저 끝내기', unlock: '🔓 기능 하나씩 열기', sound: '🔊 선생님 효과음', studentSound: '📱 학생 태블릿 효과음',
};
const minutes = (len) => {
  const t = LENGTHS[len];
  return Math.round((t.prep + TOTAL_ROUNDS * (t.minigame + t.trade + t.event)) / 60);
};

export function settingsPanel(g) {
  const st = g.s.settings || {};
  const len = st.length || 30;
  const pill = (act, v, on, label) => `<button class="${on ? 'on' : ''}" data-act="${act}" data-v="${v}">${label}</button>`;
  return `<div class="card settings">
    <h3>⚙️ 게임 설정 <span class="muted" style="font-weight:400;font-size:.9rem">(게임 시작 전에 바꿀 수 있어요)</span></h3>
    <div class="set-row"><span>⏱️ 게임 길이</span><div class="seg">
      ${Object.keys(LENGTHS).map((l) => pill('setlen', l, Number(l) === len, `${l}분`)).join('')}</div>
      <span class="muted">무역·건설 ${Math.floor(LENGTHS[len].trade / 60)}분 ${LENGTHS[len].trade % 60 ? (LENGTHS[len].trade % 60) + '초' : ''} · 전체 약 ${minutes(len)}분</span></div>
    <div class="set-row"><span>📚 미니게임 문제</span><div class="seg wrap">
      ${Object.entries(QSETS).map(([k, d]) => pill('setq', k, (st.qset || 'nature') === k, d.name)).join('')}</div></div>
    <div class="set-row top"><span>🧩 기능</span><div class="feat-grid">
      ${Object.keys(FEATURE_LABEL).map((f) => `<button class="feat ${g.on(f) ? 'on' : ''}" data-act="setf" data-v="${f}">${g.on(f) ? '✅' : '⬜'} ${FEATURE_LABEL[f]}</button>`).join('')}</div></div>
    ${g.on('unlock') ? `<div class="muted" style="margin-top:6px">🔓 열리는 순서: 준비·1라운드 🤝 무역 → ${Object.entries(UNLOCK).filter(([f]) => g.on(f)).map(([f, r]) => `${r}라운드 ${FEATURE_INFO[f].icon}${FEATURE_INFO[f].name}`).join(' → ')}</div>` : ''}
  </div>`;
}

/* ================= QR 입장 ================= */
export function qrBlock(url) {
  try {
    if (!window.qrcode) return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return `<div class="qr-wrap">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}<div class="muted">📷 태블릿 카메라로 찍으면 바로 들어와요</div></div>`;
  } catch { return ''; }
}

/* ================= 튜토리얼 (선생님 화면에서 반 전체가 함께 봐요) ================= */
const tutBox = document.createElement('div');
tutBox.id = 'tutorial';
document.body.appendChild(tutBox);
let tutG = null;
let slides = [];
let idx = 0;

const sample = (stage, extra = {}) => ({
  pid: 'tutorial-sample', name: '햇살나라', stage, rich: ['iron', 'gold'], poor: ['food', 'wood'], color: '#56b4f5',
  design: { p: 'tri', c: ['#d62828', '#1d4ed8', '#ffffff'] }, flag: '⭐', workshops: { iron: stage >= 2 ? 1 : 0 },
  prod: { food: 0, wood: 0, stone: 1 + stage, iron: 3 + stage, gold: 3 + stage }, ...extra,
});

function mockRes() {
  const me = { res: { food: 1, wood: 0, stone: 4, iron: 9, gold: 7 }, rich: ['iron', 'gold'], poor: ['food', 'wood'] };
  const need = { food: 5, wood: 5, stone: 3 };
  return `<div class="resgrid tut-res">${RES.map((r) => {
    const t = me.rich.includes(r) ? 'rich' : me.poor.includes(r) ? 'poor' : '';
    const n = need[r] || 0; const have = me.res[r];
    return `<div class="res ${t}"><div class="ic">${RES_INFO[r].icon}</div><div class="n">${have}</div>
      <div class="lb">${RES_INFO[r].name}${t ? ` · <b class="tag">${t === 'rich' ? '풍부' : '부족'}</b>` : ''}</div>
      ${n ? `<div class="rbar ${have >= n ? 'ok' : ''}"><i style="width:${Math.min(100, have / n * 100)}%"></i></div><div class="rneed">${have >= n ? '✓ 충분' : `🏘️ ${have}/${n}`}</div>` : '<div class="rbar none"></div><div class="rneed dim">필요 없음</div>'}</div>`;
  }).join('')}</div>`;
}

function buildSlides(g) {
  const t = LENGTHS[g.s.settings?.length || 30];
  const n = g.list.length || 6;
  const mm = (sec) => (sec % 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec / 60}분`).replace(/^0분 /, '');
  const S = [];
  S.push({ icon: '⛵', title: '벽란도처럼, 여러 나라가 모이는 바다', body: `
    <p class="tut-lead">고려 시대 개경 근처의 큰 항구 <b>벽란도</b>에는 가까운 송나라부터 멀리 아라비아까지 여러 나라 상인이 모여 물건을 사고팔았어요.</p>
    <p class="tut-lead">오늘 우리 반 바다에도 <b>${n}개 나라</b>가 모여요. 여러분은 한 나라의 대표예요!</p>
    <div class="tut-goal">🎯 목표: 다른 나라와 <b>무역</b>하며 우리 나라를 <b>🛖 마을 → 🏘️ 도시 → 🏰 왕국 → 👑 제국</b>으로 키우고, <b>💵 1인당 GDP</b>를 높여요.</div>` });
  S.push({ icon: '🧭', title: '우리 나라 화면 읽기', body: `
    ${mockRes()}
    <ul class="tut-list">
      <li><b class="g">초록 칸 = 풍부한 자원</b>: 우리 나라에서 많이 나요. 다른 나라에 팔 수 있어요.</li>
      <li><b class="r">빨간 칸 = 부족한 자원</b>: 우리 나라에서는 나지 않아요. <b>무역으로만</b> 구할 수 있어요!</li>
      <li>칸 아래 막대는 <b>다음 단계까지 얼마나 모았는지</b>예요. ✓ 충분이 되면 다 모은 거예요.</li>
    </ul>` });
  S.push({ icon: '⏱️', title: '게임은 이렇게 흘러가요', body: `
    <div class="tut-flow">
      <div><b>📦 자원 생산</b><small>라운드마다 자동</small></div><i>→</i>
      ${g.on('minigame') ? `<div><b>🎯 미니게임</b><small>${mm(t.minigame)}</small></div><i>→</i>` : ''}
      <div class="hl"><b>🤝 무역·건설</b><small>${mm(t.trade)}</small></div><i>→</i>
      ${g.on('events') ? '<div><b>🃏 사건 카드</b><small>잠깐</small></div>' : ''}
    </div>
    <p class="tut-lead">이것을 <b>${TOTAL_ROUNDS}라운드</b> 해요. 처음에는 <b>준비 시간 ${mm(t.prep)}</b> 동안 내 나라를 살펴봐요.</p>
    ${g.on('minigame') ? '<p>🎯 미니게임에서 문제를 맞히면 <b>특산 자원</b>과 <b>1인당 GDP</b>를 받아요.</p>' : ''}` });
  S.push({ icon: '🤝', title: '무역하는 법', body: `
    <ol class="tut-steps">
      <li><b>「🤝 무역」 탭</b>에서 무역할 나라를 골라요. (그 나라에 많은 자원이 보여요)</li>
      <li><b>내가 줄 것 = 수출 📤</b>, <b>내가 받을 것 = 수입 📥</b>의 개수를 정해요.</li>
      <li><b>📨 제안 보내기</b> → 상대가 <b>✅ 수락</b>하면 무역 성공!</li>
    </ol>
    <div class="card offer tut-offer"><div>🐬 <b>바다나라</b> 나라가 제안했어요</div>
      <div class="swap"><div><small>내가 받을 것 (수입)</small>🌾4</div><div class="arrow">⇄</div><div><small>내가 줄 것 (수출)</small>🔩3</div></div>
      <div class="row"><button class="good grow">✅ 수락</button><button class="bad grow">❌ 거절</button></div>
      <button class="ghost counter-btn">↩️ 조건을 바꿔서 다시 제안하기</button></div>
    <p>💡 조건이 마음에 안 들면 <b>↩️ 다시 제안</b>으로 흥정할 수 있어요. 무역에 성공하면 두 나라 모두 <b>1인당 GDP ${won(GDP.trade, true)}</b>!</p>` });
  S.push({ icon: '🏗️', title: '모은 자원으로 발전하기', body: `
    <div class="tut-stages">${[0, 1, 2, 3].map((st) => `<div><div class="tut-map">${territorySvg(sample(st), { small: true })}</div><b>${STAGES[st].icon} ${STAGES[st].name}</b></div>`).join('')}</div>
    <p class="tut-lead"><b>「🗺️ 영토·건설」 탭</b>에서 필요한 자원을 다 모으면 <b>발전하기</b>를 눌러요.</p>
    <p>발전할수록 영토가 넓어지고, <b>자원 생산</b>과 라운드마다 버는 <b>1인당 GDP</b>(마을 ${won(GDP.perRound[0])} → 제국 ${won(GDP.perRound[3])})가 늘어나요.</p>` });
  if (g.on('goods')) S.push({ icon: '🏭', title: '공장: 원료로 공산품 만들기', body: `
    <div class="tut-goods">${GOODS.map((k) => `<div class="good-card"><div class="gc-icon">${GOODS_INFO[k].icon}</div><b>${GOODS_INFO[k].name}</b> <small class="muted">${GOODS_INFO[k].round}R~</small>
      <div>${resChips(GOODS_INFO[k].recipe)} <span class="muted">(🔬 ${resChips(GOODS_INFO[k].techRecipe)})</span></div><div class="muted">수출하면 ${won(GOODS_INFO[k].gdp, true)}</div></div>`).join('')}</div>
    <p class="tut-lead">원료를 가공해 만든 <b>공산품</b>을 다른 나라에 <b>수출</b>하면 1인당 GDP가 크게 올라요.</p>
    <p><b>🔬 기술 나라</b>는 원료가 덜 들어요. 자원이 부족해도 <b>원료를 수입해서 상품을 만들어 수출</b>하면 크게 성장할 수 있어요!</p>
    ${g.on('unlock') ? `<p class="muted">🔓 ${UNLOCK.goods}라운드부터 열려요.</p>` : ''}` });
  if (g.on('aid')) S.push({ icon: '🎁', title: '원조와 도움 요청', body: `
    <div class="tut-two"><div class="card"><h3>🎁 원조 보내기</h3><p>대가 없이 자원을 나눠 줘요. 어려운 친구 나라를 도우면 <b>🕊️ 세계 평화 점수</b>가 올라요.</p></div>
      <div class="card"><h3>🙏 도움 요청</h3><p>꼭 필요한 자원이 없을 때, 그 자원이 많은 나라에 부탁해요. 상대가 <b>🎁 보내 주기</b>를 누르면 받아요.</p></div></div>
    <p>「🤝 무역」 탭 위쪽의 <b>🤝 무역 / 🎁 원조 보내기 / 🙏 도움 요청</b> 버튼으로 골라요. 무역 금지 중에도 할 수 있어요.</p>
    ${g.on('unlock') ? `<p class="muted">🔓 ${UNLOCK.aid}라운드부터 열려요.</p>` : ''}` });
  if (g.on('world')) S.push({ icon: '🌐', title: '세계 과제: 함께 만들고, 서로 겨뤄요', body: `
    <div class="tut-two"><div class="card world-card project"><h3>🤝 협동 프로젝트</h3><p>📱 스마트폰처럼 <b>여러 나라의 자원을 모아야</b> 만들 수 있어요. 3개 나라 이상이 보태야 완성! 참여한 나라 모두 보상.</p></div>
      <div class="card world-card bid"><h3>🏗️ 국제 입찰</h3><p>🌉 다리 공사를 맡을 나라를 뽑아요. <b>자원을 가장 많이 건 나라</b>가 낙찰! 진 나라는 자원을 돌려받아요.</p></div></div>
    <p>「🤝 무역」 탭 맨 위에 카드가 나와요. (${Object.entries(WORLD_TASKS).map(([r, k]) => `${r}R ${k === 'project' ? '🤝' : '🏗️'}`).join(' · ')})</p>` });
  S.push({ icon: '🕊️', title: '세계 평화를 지켜요', body: `
    <ul class="tut-list">
      <li>무역에 성공하거나 원조하면 <b>🕊️ 세계 평화 점수</b>가 올라요. 무역을 거절하거나 ${g.on('war') ? '<b>⚔️ 전쟁</b>을 하면' : ''} 내려가요.</li>
      <li>평화 점수가 <b>${PEACE.crisisBelow}점</b> 밑으로 떨어지면 <b>📉 세계대공황</b>! 모든 나라의 생산이 절반으로 줄어요.</li>
      ${g.on('war') ? '<li>⚔️ 전쟁을 하면 <b>두 나라 모두</b> 자원 40%를 잃고, 이겨도 조금밖에 못 얻어요. 정말 필요할까요?</li>' : ''}
      ${g.on('events') ? `<li>🧱 <b>관세</b> 사건이 나오면 한 나라가 수입품에 세금을 매겨요. ⚓ <b>무역항 나라</b>는 다른 나라끼리 무역할 때마다 수수료 ${won(PORT.fee)}을 받아요.</li>` : ''}
    </ul>` });
  if (g.on('unlock')) S.push({ icon: '🔓', title: '기능이 하나씩 열려요', body: `
    <div class="tut-flow"><div class="hl"><b>🤝 무역</b><small>준비·1라운드</small></div>
      ${Object.entries(UNLOCK).filter(([f]) => g.on(f)).map(([f, r]) => `<i>→</i><div><b>${FEATURE_INFO[f].icon} ${FEATURE_INFO[f].name}</b><small>${r}라운드</small></div>`).join('')}</div>
    <p class="tut-lead">처음에는 <b>무역</b>에 집중해요. 새 기능이 열리면 화면에 안내가 떠요!</p>` });
  S.push({ icon: '🚀', title: '준비됐나요?', body: `
    <p class="tut-lead">💵 <b>1인당 GDP</b>가 우리 나라의 점수예요. 하지만 가장 중요한 건 <b>서로 돕는 세계</b>예요!</p>
    <div class="tut-goal">📱 태블릿에서 <b>나라 이름과 국기</b>를 정하고, 선생님이 승인하면 시작해요.</div>
    <p class="muted">게임이 끝나면 우리가 한 일을 교과서 낱말(수출·수입·상호 의존·경쟁)로 정리해요.</p>` });
  return S;
}

export function openTutorial(g) {
  tutG = g;
  slides = buildSlides(g);
  idx = 0;
  showSlide();
}

function showSlide() {
  const s = slides[idx];
  tutG.s.tutorial = { i: idx + 1, n: slides.length };
  tutG.changed();
  tutBox.className = 'tut-wrap';
  tutBox.innerHTML = `<div class="tut-sheet">
    <div class="tut-top"><span class="kicker">📖 튜토리얼 ${idx + 1} / ${slides.length}</span>
      <button class="ghost small" data-tut="skip">건너뛰기 ✕</button></div>
    <div class="tut-icon">${s.icon}</div>
    <h1 class="tut-title">${s.title}</h1>
    <div class="tut-body">${s.body}</div>
    <div class="tut-nav">
      <button class="ghost" data-tut="prev" ${idx === 0 ? 'disabled' : ''}>◀ 이전</button>
      <div class="tut-dots">${slides.map((_, i) => `<i class="${i === idx ? 'on' : ''}" data-tut="go" data-i="${i}"></i>`).join('')}</div>
      <button class="good" data-tut="next">${idx === slides.length - 1 ? '시작하기 ✓' : '다음 ▶'}</button>
    </div></div>`;
}

export function closeTutorial() {
  tutBox.className = ''; tutBox.innerHTML = '';
  if (tutG) { tutG.s.tutorial = null; tutG.changed(); }
}

tutBox.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tut]');
  if (!b || b.disabled) return;
  const a = b.dataset.tut;
  if (a === 'skip') return closeTutorial();
  if (a === 'prev' && idx > 0) idx--;
  else if (a === 'next') { if (idx >= slides.length - 1) return closeTutorial(); idx++; }
  else if (a === 'go') idx = Number(b.dataset.i);
  showSlide();
});
document.addEventListener('keydown', (e) => {
  if (!tutBox.innerHTML) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (idx < slides.length - 1) { idx++; showSlide(); } else closeTutorial(); }
  else if (e.key === 'ArrowLeft' && idx > 0) { idx--; showSlide(); }
  else if (e.key === 'Escape') closeTutorial();
});

/* ================= 선생님 도구 ================= */
const toolBox = document.createElement('div');
toolBox.id = 'tools';
document.body.appendChild(toolBox);
let toolG = null;
const pick = { pid: null, item: 'food', n: 1 };

export function openTools(g) { toolG = g; drawTools(); }
function closeTools() { toolBox.className = ''; toolBox.innerHTML = ''; }

function drawTools() {
  const g = toolG;
  const cs = g.list.filter((c) => c.approved);
  if (!pick.pid || !g.c(pick.pid)) pick.pid = cs[0]?.pid || null;
  const sel = g.c(pick.pid);
  toolBox.className = 'overlay';
  toolBox.innerHTML = `<div class="sheet tools-sheet">
    <div class="row"><h2 class="grow" style="margin:0">🧰 선생님 도구</h2><button class="ghost small" data-tool="close">닫기 ✕</button></div>
    <div class="tool-sec"><h3>📢 모든 화면에 공지 보내기</h3>
      <div class="row"><input type="text" id="noticeText" maxlength="120" placeholder="예) 2분 남았어요! 아직 무역하지 않은 나라를 찾아보세요."><button data-tool="notice">보내기</button></div></div>
    <div class="tool-sec"><h3>👀 학생 화면 멈추기</h3>
      <p class="muted">설명할 때 누르면 타이머가 멈추고, 학생 태블릿에 「선생님을 봐요」가 떠요.</p>
      <button class="${g.s.freeze ? 'good' : 'warn'}" data-tool="freeze">${g.s.freeze ? '▶ 다시 시작하기' : '⏸ 학생 화면 멈추기'}</button></div>
    <div class="tool-sec"><h3>🎁 자원 주기 · 빼기</h3>
      ${cs.length ? `<div class="tool-countries">${cs.map((c) => `<button class="${c.pid === pick.pid ? 'on' : ''}" data-tool="pick" data-v="${esc(c.pid)}">${flagSvg(c, 'inline')} ${esc(c.name)}</button>`).join('')}</div>
      <div class="tool-items">${ITEMS.map((r) => `<button class="${r === pick.item ? 'on' : ''}" data-tool="item" data-v="${r}">${ITEM_INFO[r].icon} ${ITEM_INFO[r].name}<small>${sel?.res[r] || 0}</small></button>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="ghost" data-tool="n" data-v="-1">−</button><b style="font-size:1.4rem;min-width:2ch;text-align:center">${pick.n}</b><button class="ghost" data-tool="n" data-v="1">＋</button>
        <button class="good grow" data-tool="give">🎁 ${pick.n}개 주기</button><button class="bad" data-tool="take">빼기</button></div>` : '<p class="muted">아직 나라가 없어요.</p>'}
    </div></div>`;
}

toolBox.addEventListener('click', (e) => {
  if (e.target === toolBox) return closeTools();
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  const g = toolG; const a = b.dataset.tool;
  if (a === 'close') return closeTools();
  if (a === 'notice') { const t = toolBox.querySelector('#noticeText').value; if (t.trim()) { g.sendNotice(t); sfx('notice', g.on('sound')); closeTools(); } return; }
  if (a === 'freeze') g.setFreeze(!g.s.freeze);
  if (a === 'pick') pick.pid = b.dataset.v;
  if (a === 'item') pick.item = b.dataset.v;
  if (a === 'n') pick.n = Math.max(1, Math.min(20, pick.n + Number(b.dataset.v)));
  if (a === 'give') g.adjust(pick.pid, pick.item, pick.n);
  if (a === 'take') g.adjust(pick.pid, pick.item, -pick.n);
  drawTools();
});

/* ================= 세계 지도 + 시장 시세판 ================= */
export function worldMapView(g) {
  const cs = g.list.filter((c) => c.approved && c.rich.length);
  if (!cs.length) return '<div class="card" style="margin-top:16px">아직 나라가 없어요.</div>';
  const W = 1000, H = 620, cx = W / 2, cy = H / 2;
  const pos = {};
  const rings = cs.length > 12 ? [cs.slice(0, Math.ceil(cs.length / 2)), cs.slice(Math.ceil(cs.length / 2))] : [cs];
  rings.forEach((ring, k) => {
    const rx = k === 0 ? 400 : 230, ry = k === 0 ? 235 : 130;
    ring.forEach((c, i) => {
      const a = -Math.PI / 2 + (i / ring.length) * Math.PI * 2 + k * 0.3;
      pos[c.pid] = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    });
  });
  let lines = '';
  for (const [key, l] of Object.entries(g.s.links || {})) {
    const [a, b] = key.split('|');
    if (!pos[a] || !pos[b]) continue;
    const [x1, y1] = pos[a]; const [x2, y2] = pos[b];
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
    if (l.trade) lines += `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="#ffcf7a" stroke-width="${Math.min(12, 2 + l.trade * 1.5)}" stroke-linecap="round" opacity=".75"><title>무역 ${l.trade}번</title></path>`;
    if (l.aid) lines += `<path d="M${x1},${y1} Q${mx - 14},${my - 14} ${x2},${y2}" fill="none" stroke="#3ddc84" stroke-width="${Math.min(10, 2 + l.aid * 1.5)}" stroke-dasharray="2 8" stroke-linecap="round"><title>원조 ${l.aid}번</title></path>`;
  }
  for (const w of g.s.wars || []) {
    if (!pos[w.a] || !pos[w.b]) continue;
    const [x1, y1] = pos[w.a]; const [x2, y2] = pos[w.b];
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff6b6b" stroke-width="4" stroke-dasharray="10 8"><title>전쟁</title></line>`;
  }
  const nodes = cs.map((c) => {
    const [x, y] = pos[c.pid];
    const r = 26 + c.stage * 7;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle r="${r + 8}" fill="rgba(5,10,20,.55)" stroke="${esc(c.color)}" stroke-width="4"/>
      <text y="-2" font-size="${r}" text-anchor="middle" dominant-baseline="central">${STAGES[c.stage].icon}</text>
      <g transform="translate(${-r - 34} ${-r - 12}) scale(.55)">${flagShapes(c)}<rect width="60" height="40" fill="none" stroke="rgba(0,0,0,.3)"/></g>
      ${c.port ? `<text x="${r + 6}" y="${-r}" font-size="22">⚓</text>` : ''}${c.tech ? `<text x="${r + 6}" y="${-r + (c.port ? 24 : 0)}" font-size="20">🔬</text>` : ''}
      <text y="${r + 30}" font-size="20" font-weight="800" fill="#f2f5fb" text-anchor="middle">${esc(c.name)}</text>
      <text y="${r + 52}" font-size="16" fill="#ffcf7a" text-anchor="middle">${won(g.score(c))}</text></g>`;
  }).join('');
  const prices = g.prices();
  const maxRate = Math.max(1, ...prices.map((p) => p.rate));
  const totalTrades = Object.values(g.s.links || {}).reduce((a, l) => a + l.trade, 0);
  return `<div class="worldmap">
    <div class="card wm-map"><div class="row"><h2 class="grow" style="margin:0">🌐 우리 반 세계 지도</h2>
      <span class="legend-mini"><i class="lg-trade"></i>무역 <i class="lg-aid"></i>원조 <i class="lg-war"></i>전쟁</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="wm-svg"><defs><radialGradient id="wmsea"><stop offset="0" stop-color="#14345a"/><stop offset="1" stop-color="#06111f"/></radialGradient></defs>
        <rect width="${W}" height="${H}" rx="24" fill="url(#wmsea)"/>${lines}${nodes}</svg>
      <div class="muted">선이 굵을수록 무역을 많이 한 사이예요. 지금까지 무역 ${totalTrades}번.</div></div>
    <div class="card wm-price"><h3>📊 시장 시세판</h3>
      <div class="muted" style="margin-bottom:8px">무역에서 1개를 주고 평균 몇 개를 받았는지예요. 많이 받을수록 <b>귀한(사려는 나라가 많은)</b> 자원이에요.</div>
      ${prices.length ? prices.map((p) => `<div class="price-row"><span>${ITEM_INFO[p.r].icon} ${ITEM_INFO[p.r].name}</span>
        <div class="bar"><div style="width:${Math.round(p.rate / maxRate * 100)}%"></div></div><b>×${p.rate}</b></div>`).join('')
        : '<p class="muted">아직 무역 기록이 없어요.</p>'}
      ${g.s.tariff && g.s.round <= g.s.tariff.until ? `<div class="banner warn" style="margin-top:10px">🧱 관세: ${esc(g.s.tariff.flag)}${esc(g.s.tariff.name)} 나라 · 수입 ${RES_INFO[g.s.tariff.res].icon}${RES_INFO[g.s.tariff.res].name} (${g.s.tariff.until}라운드까지)</div>` : ''}
    </div></div>`;
}

/* ================= 되돌아보기 · 결과 내려받기 ================= */
export function endExtras(g) {
  const cs = g.list.filter((c) => c.approved);
  const done = cs.filter((c) => c.reflect);
  return `<div class="card reflect-card">
    <div class="row wrap"><h2 class="grow" style="margin:0">💬 학생들의 되돌아보기 (${done.length}/${cs.length})</h2>
      <button class="ghost" data-act="csv">📥 결과 내려받기 (엑셀)</button><button class="ghost" data-act="print">🖨️ 인쇄</button></div>
    <p class="muted">학생 태블릿에 질문이 떠 있어요. 제출하면 여기에 모여요.</p>
    ${REFLECT_QS.map((q, i) => `<div class="rq"><h3>${i + 1}. ${esc(q)}</h3>
      ${done.length ? done.map((c) => `<div class="ra">${flagSvg(c, 'inline')} <b>${esc(c.name)}</b> ${esc(c.reflect[i] || '-')}</div>`).join('') : '<p class="muted">아직 답이 없어요.</p>'}</div>`).join('')}
  </div>`;
}

export function downloadCsv(g) {
  const cs = [...g.list.filter((c) => c.approved)].sort((a, b) => g.score(b) - g.score(a));
  const top = (book) => Object.entries(book || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([r, n]) => `${ITEM_INFO[r].name} ${n}`).join(' / ');
  const total = (book) => Object.values(book || {}).reduce((a, n) => a + n, 0);
  const head = ['순위', '나라', '칭찬 배지', '1인당 GDP(만 원)', '발전 단계', '무역 횟수', '원조 보냄', '원조 받음', '전쟁', '미니게임 정답', '비밀 임무 성공', '수출 합계', '주요 수출품', '수입 합계', '주요 수입품', '기술 나라', '무역항 나라', ...REFLECT_QS.map((q, i) => `되돌아보기 ${i + 1}`)];
  const badgeOf = (c) => (g.s.badges || []).filter((x) => x.pid === c.pid).map((b) => `${b.title} (${b.text})`).join(' / ');
  const rows = cs.map((c, i) => [i + 1, c.name, badgeOf(c), g.score(c), STAGES[c.stage].name, c.trades, c.aidGiven || 0, c.aidGot || 0, c.wars || 0, c.mgCorrect || 0, c.missionsDone || 0,
    total(c.exp), top(c.exp), total(c.imp), top(c.imp), c.tech ? 'O' : '', c.port ? 'O' : '', ...REFLECT_QS.map((_, k) => c.reflect?.[k] || '')]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const d = new Date();
  a.download = `무역문명게임_결과_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ================= 🏅 칭찬 배지 (게임 끝, 선생님 화면) ================= */
// 같은 배지를 받은 나라끼리 묶어요
function groupBadges(bs) {
  const m = new Map();
  for (const b of bs) {
    if (!m.has(b.title)) m.set(b.title, { icon: b.icon, title: b.title, who: [] });
    m.get(b.title).who.push(b);
  }
  return [...m.values()];
}

export function badgesCard(g) {
  const bs = g.s.badges || [];
  if (!bs.length) return '';
  return `<div class="card badges-card">
    <div class="row wrap"><h2 class="grow" style="margin:0">🏅 칭찬 배지</h2>
      <button class="good" data-act="race">🏁 GDP 레이스 다시 보기</button></div>
    <p class="muted">조건을 채운 나라는 모두 받아요. 잘한 점을 크게 칭찬해 주세요!</p>
    <div class="badge-grid">${groupBadges(bs).map((gb, i) => `<div class="pbadge" style="--d:${i * 0.12}s">
        <div class="b-icon">${gb.icon}</div><div class="b-title">${esc(gb.title)}</div>
        ${gb.who.map((b) => { const c = g.c(b.pid); return c ? `<div class="b-who">${flagSvg(c, 'inline')} <b>${esc(c.name)}</b> <span class="b-text">${esc(b.text)}</span></div>` : ''; }).join('')}
      </div>`).join('')}</div></div>`;
}

/* ================= 🎤 라운드 하이라이트 (선생님 화면 팝업) ================= */
let hlBox = null, hlTimer = null, hlAfter = null;
export function highlightOpen() { return !!hlBox?.innerHTML; }
export function showHighlight(g, h, after) {
  hlBox ||= Object.assign(document.createElement('div'), { id: 'highlight' });
  if (!hlBox.isConnected) document.body.appendChild(hlBox);
  hlAfter = after;
  const who = (pids) => pids.map((p) => g.c(p)).filter(Boolean).map((c) => `<span class="hl-who">${flagSvg(c, 'inline')} ${esc(c.name)}</span>`).join('');
  hlBox.className = 'overlay ann-wrap';
  hlBox.innerHTML = `<div class="hl-sheet">
    <div class="kicker">Round ${h.round} Highlight</div>
    <h1>🎤 ${h.round}라운드 하이라이트</h1>
    ${h.items.length ? `<div class="hl-grid">${h.items.map((it, i) => `<div class="hl-item" style="--d:${0.2 + i * 0.25}s">
      <div class="hl-icon">${it.icon}</div><div><div class="hl-title">${esc(it.title)}</div>
      <div class="hl-names">${who(it.pids)}</div><div class="hl-text">${esc(it.text)}</div></div></div>`).join('')}</div>`
      : '<p style="font-size:1.4rem">이번 라운드는 조용했어요. 다음 라운드에는 무역을 더 해 볼까요? 🤝</p>'}
    <button class="ghost" data-hl="close">닫기</button></div>`;
  sfx('level', g.on('sound'));
  clearTimeout(hlTimer);
  hlTimer = setTimeout(closeHighlight, 9000 + h.items.length * 1500);
  hlBox.onclick = (e) => { if (e.target === hlBox || e.target.closest('[data-hl=close]')) closeHighlight(); };
}
export function closeHighlight() {
  if (!hlBox) return;
  hlBox.innerHTML = ''; hlBox.className = '';
  clearTimeout(hlTimer);
  const f = hlAfter; hlAfter = null; f?.();
}

/* ================= 🏁 GDP 레이스 애니메이션 (게임 끝) ================= */
export function openRace(g) {
  const cs = g.list.filter((c) => c.approved && c.history?.length);
  if (!cs.length) return;
  const R = Math.max(...cs.map((c) => c.history.length - 1));
  const val = (c, i) => { for (let k = i; k >= 0; k--) if (c.history[k] != null) return c.history[k]; return 0; };
  const max = Math.max(1, ...cs.flatMap((c) => c.history.filter((v) => v != null)));
  const rowH = Math.max(34, Math.min(64, Math.floor((window.innerHeight - 260) / cs.length)));
  const box = document.getElementById('race') || Object.assign(document.createElement('div'), { id: 'race' });
  document.body.appendChild(box);
  box.className = 'overlay race-wrap';
  box.innerHTML = `<div class="race-sheet">
    <div class="row"><h1 class="grow" style="margin:0">🏁 1인당 GDP 레이스</h1><div class="race-round" id="raceRound">시작</div>
      <button class="ghost" data-race="close">닫기</button></div>
    <div class="race-track" style="height:${cs.length * rowH}px">${cs.map((c) => `
      <div class="race-row" data-pid="${esc(c.pid)}" style="height:${rowH - 6}px">
        <div class="race-name">${flagSvg(c, 'inline')} <span>${esc(c.name)}</span></div>
        <div class="race-bar-wrap"><div class="race-bar" style="background:${esc(c.color)}"></div><b class="race-val"></b></div>
      </div>`).join('')}</div>
    <div class="race-foot" id="raceFoot"></div></div>`;
  const rows = new Map([...box.querySelectorAll('.race-row')].map((el) => [el.dataset.pid, el]));
  let i = 0, timer = null;
  const frame = () => {
    const order = [...cs].sort((a, b) => val(b, i) - val(a, i));
    order.forEach((c, k) => {
      const el = rows.get(c.pid);
      el.style.transform = `translateY(${k * rowH}px)`;
      el.querySelector('.race-bar').style.width = `${Math.max(2, (val(c, i) / max) * 100)}%`;
      el.querySelector('.race-val').textContent = won(val(c, i));
      el.classList.toggle('lead', k === 0);
      el.querySelector('.race-name span').textContent = (k < 3 && i === R ? ['🥇 ', '🥈 ', '🥉 '][k] : '') + c.name;
    });
    box.querySelector('#raceRound').textContent = i === 0 ? '시작' : `${i}라운드`;
    if (i === R) {
      clearInterval(timer);
      box.querySelector('#raceFoot').innerHTML = `🎉 <b>${esc(order[0].name)}</b> 나라가 1등! 모두 수고했어요!`;
      sfx('level', g.on('sound'));
    } else sfx('notice', false);
    i++;
  };
  frame();
  timer = setInterval(frame, 1600);
  box.onclick = (e) => { if (e.target === box || e.target.closest('[data-race=close]')) { clearInterval(timer); box.innerHTML = ''; box.className = ''; } };
}
