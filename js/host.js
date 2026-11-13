// 선생님 화면: 방을 만들고 게임 상태를 관리합니다.
import { flagSvg } from './flag.js';
import { RES, RES_INFO, STAGES, PHASE_NAME, MAX_COUNTRIES, COUNTRY_RANGE, PEACE, GOODS, GOODS_INFO, ITEMS, ITEM_INFO } from './config.js';
import { territorySvg, announceHtml, crisisHtml, newsHtml, unlockHtml } from './territory.js';
import { settingsPanel, qrBlock, openTutorial, openTools, worldMapView, endExtras, downloadCsv, badgesCard, showHighlight, highlightOpen, openRace } from './host-tools.js';
import { Game, newGameState, traitOf } from './game.js';
import { hostRoom, pickTransport } from './net.js';
import { updateMusic, mountMusicWidget } from './music.js';
import { $, esc, fmtTime, toast, store, icons, sfx, won } from './ui.js';

const SAVE_KEY = 'tradeciv-host-' + pickTransport();
const app = $('#app');

let game;
let net;
const cidToPid = new Map();

/* ---------- 시작: 이어하기 또는 새 방 ---------- */
async function boot() {
  // 시험 페이지(test.html)는 테스트 모드에서 방 번호를 정해서 보내요. 이때는 이어하기를 묻지 않아요.
  const fixedRoom = pickTransport() === 'local' ? new URLSearchParams(location.search).get('room') : null;
  const saved = fixedRoom ? null : store(SAVE_KEY);
  let state;
  if (saved && saved.phase !== 'end' && confirm(`진행 중이던 게임(방 ${saved.code})이 있어요. 이어서 할까요?\n(취소를 누르면 새 방을 만들어요)`)) {
    state = saved;
    for (const c of Object.values(state.countries)) c.online = false;
  }
  for (let tries = 0; tries < 5; tries++) {
    const code = state ? state.code : fixedRoom || String(Math.floor(1000 + Math.random() * 9000));
    try {
      net = await hostRoom(code, { onMessage, onConnect() {}, onDisconnect, onError: (e) => toast('연결 문제: ' + (e.type || e), 'bad') });
      if (!state) state = newGameState(code);
      break;
    } catch (e) {
      if (state) { alert('이 방 번호를 다시 열 수 없어서 새 방을 만들어요.'); state = null; }
      if (tries === 4) { app.innerHTML = `<div class="card"><h2>방을 만들지 못했어요 😢</h2><p>인터넷 연결을 확인하고 새로고침해 주세요.</p><p class="muted">${esc(e.type || e.message || e)}</p></div>`; return; }
    }
  }
  game = new Game(state, { onChange: scheduleSync, notify, removed: kick });
  if (pickTransport() === 'local' || /net=fbmock/.test(location.search)) window.__game = game; // 테스트 모드에서만 디버깅용
  lastAnnounce = state.announce?.id ?? null; // 이어하기 때 지난 공지를 다시 띄우지 않게
  lastCrisis = state.crisisMsg?.id ?? null;
  lastWorld = state.worldMsg?.id ?? null;
  lastUnlock = state.unlockMsg?.id ?? null;
  lastNotice = state.notice?.id ?? null;
  state.tutorial = null; // 튜토리얼은 새로 열 때만
  state.freeze = false;
  lastFx = state.fx?.length ? state.fx[state.fx.length - 1].id : null;
  await initExtras?.(game);
  mountMusicWidget();
  render();
  setInterval(() => { game.tick(); updateClock(); }, 250);
}

/* ---------- 통신 ---------- */
function onMessage(cid, msg) {
  if (!msg || typeof msg !== 'object') return;
  const pid = typeof msg.pid === 'string' ? msg.pid.slice(0, 40) : cidToPid.get(cid);
  if (!pid) return;
  if (msg.t === 'hello' || msg.t === 'join') {
    cidToPid.set(cid, pid);
    if (msg.t === 'join') {
      const err = game.join(pid, msg);
      if (err) return net.send(cid, { t: 'error', text: err });
    }
    game.setOnline(pid, !!game.c(pid));
    net.send(cid, game.viewFor(pid));
    return;
  }
  if (cidToPid.get(cid) !== pid) return;
  const c = game.c(pid);
  if (!c || !c.approved) return;
  let err = null;
  switch (msg.t) {
    case 'offer': err = game.offer(pid, msg.to, msg.give, msg.get); break;
    case 'respond': err = game.respond(pid, msg.offerId, !!msg.accept); break;
    case 'cancel': err = game.cancelOffer(pid, msg.offerId); break;
    case 'counter': err = game.counter(pid, msg.offerId, msg.give, msg.get); break;
    case 'aid': err = game.aid(pid, msg.to, msg.give); break;
    case 'reflect': err = game.reflect(pid, msg.answers); break;
    case 'make': err = game.make(pid, msg.product); break;
    case 'sell': err = game.sellMarket(pid, msg.product); break;
    case 'request': err = game.offer(pid, msg.to, {}, msg.get, null, 'request'); break;
    case 'build': err = game.build(pid, msg.kind, msg.res); break;
    default: err = handleExtra?.(pid, msg) ?? null;
  }
  if (err) net.send(cid, { t: 'error', text: err });
}

function onDisconnect(cid) {
  const pid = cidToPid.get(cid);
  cidToPid.delete(cid);
  if (pid && ![...cidToPid.values()].includes(pid)) game.setOnline(pid, false);
}

function cidsOf(pid) { return [...cidToPid].filter(([, p]) => p === pid).map(([c]) => c); }

function notify(pid, text, kind) {
  for (const cid of cidsOf(pid)) net.send(cid, { t: 'toast', text, kind });
}

function kick(pid) {
  for (const cid of cidsOf(pid)) net.send(cid, { t: 'state', phase: game.s.phase, unknown: true, kicked: true });
}

let syncQueued = false;
function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  setTimeout(() => {
    syncQueued = false;
    for (const [cid, pid] of cidToPid) net.send(cid, game.viewFor(pid));
    store(SAVE_KEY, game.s);
    render();
    checkAnnounce();
    checkCrisis();
    checkWorldMsg();
    checkHighlight();
    checkUnlock();
    checkNotice();
    checkFx();
  }, 30);
}

/* ---------- 확장(미니게임·사건·전쟁)이 붙는 자리 ---------- */
let initExtras = null;
let handleExtra = null;
let renderExtra = null;
export function registerExtras(x) {
  initExtras = x.init || initExtras;
  handleExtra = x.handle || handleExtra;
  renderExtra = x.render || renderExtra;
}

/* ---------- 화면 ---------- */
function playUrl() {
  const base = location.href.replace(/host\.html.*$/, '');
  const q = new URLSearchParams(location.search);
  q.set('room', game.s.code);
  return `${base}play.html?${q}`;
}

// localhost 로 열었으면 학생 태블릿에서는 그 주소로 들어올 수 없어요 (테스트 모드는 제외)
function localOnly() {
  return pickTransport() !== 'local' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

function updateClock() {
  const el = $('#clock');
  if (el) el.textContent = game.s.phaseEndsAt || game.s.pausedRemaining != null ? fmtTime(game.remaining()) : '--:--';
}

function phaseLabel(s) {
  if (s.phase === 'lobby' || s.phase === 'end' || s.phase === 'prep') return PHASE_NAME[s.phase];
  return `${s.round}/${s.totalRounds}라운드 · ${PHASE_NAME[s.phase]}`;
}

function topBar(s) {
  const paused = s.pausedRemaining != null;
  const timed = !!s.phaseEndsAt || paused;
  let main;
  if (s.phase === 'lobby') main = `<button class="good" data-act="start" ${game.list.length ? '' : 'disabled'}>▶ 게임 시작 (준비 2분)</button>`;
  else if (s.phase === 'end') main = `<button class="ghost" data-act="newgame">🔄 새 게임</button>`;
  else main = `<button data-act="next">⏭ 다음 단계</button>`;
  return `
  <div class="host-top">
    <div class="code">방 번호<b>${esc(s.code)}</b></div>
    <div><div class="phase">${phaseLabel(s)}${paused ? ' <span class="pill warn">일시정지</span>' : ''}</div>
      <div class="muted">${pickTransport() === 'local' ? '테스트 모드(같은 컴퓨터)' : localOnly() ? '⚠️ 학생은 GitHub Pages 주소로 들어와야 해요' : '학생 접속 주소: ' + esc(playUrl().split('?')[0])}</div></div>
    <div class="clock" id="clock">--:--</div>
    ${s.phase !== 'lobby' ? peaceGauge(s) : ''}
    <div class="controls">
      ${main}
      ${timed ? `<button class="ghost" data-act="${paused ? 'resume' : 'pause'}">${paused ? '▶ 계속' : '⏸ 일시정지'}</button>
      <button class="ghost" data-act="addtime">+30초</button>` : ''}
      ${s.phase !== 'lobby' ? `<div class="seg">
        <button class="${hostView === 'board' ? 'on' : ''}" data-act="hostview" data-v="board">📋 현황판</button>
        <button class="${hostView === 'map' ? 'on' : ''}" data-act="hostview" data-v="map">🗺️ 영토 지도</button>
        <button class="${hostView === 'world' ? 'on' : ''}" data-act="hostview" data-v="world">🌐 세계 지도</button></div>` : ''}
      ${s.phase === 'lobby' || s.phase === 'prep' ? '<button class="ghost" data-act="tutorial">📖 튜토리얼</button>' : ''}
      ${s.phase !== 'lobby' ? `<button class="ghost ${s.freeze ? 'warn' : ''}" data-act="tools">🧰 선생님 도구${s.freeze ? ' (멈춤)' : ''}</button>` : ''}
      <label class="switch ${s.tradeBan ? 'on' : ''}"><input type="checkbox" data-act="tradeban" ${s.tradeBan ? 'checked' : ''}>🚫 무역 금지</label>
      <label class="switch"><input type="checkbox" data-act="announce" ${s.announceOn !== false ? 'checked' : ''}>📣 발전 공지</label>
      ${renderExtra?.('switches', game) ?? ''}
      ${s.phase !== 'lobby' && s.phase !== 'end' ? '<button class="ghost small" data-act="finish">게임 종료</button>' : ''}
    </div>
  </div>`;
}

// 세계 평화 점수 막대 (선생님 화면에서만 보여요)
function peaceGauge(s) {
  const p = Math.round(s.peace ?? PEACE.start);
  const tone = s.crisis ? 'crisis' : p < PEACE.recoverAt ? 'low' : 'ok';
  const lp = s.lastPeace && Date.now() - s.lastPeace.time < 4000 ? s.lastPeace : null;
  return `<div class="peace ${tone}" title="무역 +${PEACE.trade} · 원조 +${PEACE.aid} · 무역 거절/실패 ${PEACE.tradeFail} · 전쟁 ${PEACE.war} · ${PEACE.crisisBelow}점 밑이면 세계대공황">
    <div class="peace-hd"><span class="plabel">🕊️ 세계 평화<small>${s.crisis ? '대공황' : p < PEACE.recoverAt ? '불안해요' : p >= 80 ? '아주 평화로워요' : '평화로워요'}</small></span><b>${p}</b>${lp ? `<span class="pdelta ${lp.delta > 0 ? 'up' : 'down'}">${lp.delta > 0 ? '+' : ''}${lp.delta}</span>` : ''}</div>
    <div class="pbar"><i style="width:${p}%"></i><em style="left:${PEACE.crisisBelow}%"></em></div>
    ${s.crisis ? '<div class="pcrisis">📉 세계대공황 · 생산량 감소</div>' : ''}
  </div>`;
}

const gdpText = (c) => `${won(game.score(c))}`;

function countryCard(c) {
  const st = STAGES[c.stage];
  const atWar = game.atWar(c);
  const ws = RES.filter((r) => c.workshops[r]).map((r) => `🏭${RES_INFO[r].icon}×${c.workshops[r]}`).join(' ');
  return `
  <div class="ccard ${atWar ? 'war' : ''}" data-pid-card="${esc(c.pid)}" style="border-top-color:${esc(c.color)}">
    ${c.online ? '' : '<span class="offline pill bad">연결 끊김</span>'}
    <div class="hd">${flagSvg(c, 'cardflag')}<div><div class="nm">${esc(c.name)}</div>
      <div>${st.icon} ${st.name} ${atWar ? '<span class="war-mark">⚔️ 전쟁 중</span>' : ''}</div></div>
      ${c.rich.length ? `<div class="gdp-chip">💵 1인당 GDP<b>${gdpText(c)}</b>${game.gdpLike ? `<span class="like">🌍 ${esc(game.gdpLike(c).name)} 수준</span>` : ''}</div>` : ''}</div>
    ${c.rich.length && game.list.length <= 12 ? territorySvg({ ...c, prod: game.productionOf(c, game.s.round + 1), atWar }, { small: true }) : ''}
    ${c.rich.length ? `<div class="mini-res">${RES.map((r) => `<div class="${traitOf(c, r)}">${RES_INFO[r].icon}<br>${c.res[r]}</div>`).join('')}</div>` : ''}
    ${c.rich.length ? `<div class="goods-line">${c.tech ? '<span class="pill tech-pill">🔬 기술 나라</span>' : ''}${c.port ? '<span class="pill port-pill">⚓ 무역항</span>' : ''}
      ${GOODS.map((gk) => `<span>${GOODS_INFO[gk].icon}${c.res[gk] || 0}</span>`).join('')}
      <span class="muted">📤${Object.values(c.exp || {}).reduce((a, n) => a + n, 0)} 📥${Object.values(c.imp || {}).reduce((a, n) => a + n, 0)}</span></div>` : ''}
    <div class="muted" style="margin-top:6px;font-size:.9rem">🤝 무역 ${c.trades}회 ${c.aidGiven ? `· 🎁 원조 ${c.aidGiven}회` : ''} ${c.wars ? `· ⚔️ 전쟁 ${c.wars}회` : ''} ${ws ? '· ' + ws : ''}</div>
    ${renderExtra?.('card', game, c) ?? ''}
  </div>`;
}

// 실시간 1인당 GDP 순위 띠 (현황판 맨 위)
let lastRank = new Map();
function rankStrip() {
  const list = game.list.filter((c) => c.approved && c.rich.length).sort((a, b) => game.score(b) - game.score(a));
  if (!list.length) return '';
  const now = new Map(list.map((c, i) => [c.pid, i]));
  const html = `<div class="rank-strip"><span class="rk-title">🏆 1인당 GDP 순위</span>${list.slice(0, 8).map((c, i) => {
    const before = lastRank.get(c.pid);
    const mv = before == null || before === i ? '' : before > i ? '<i class="up">▲</i>' : '<i class="down">▼</i>';
    return `<span class="rk ${i < 3 ? 'top' : ''}"><em>${['🥇', '🥈', '🥉'][i] || i + 1}</em>${flagSvg(c, 'inline')}<b>${esc(c.name)}</b><span>${won(game.score(c))}</span>${mv}</span>`;
  }).join('')}${list.length > 8 ? `<span class="muted">외 ${list.length - 8}개 나라</span>` : ''}</div>`;
  // 순위가 바뀐 화살표는 다음 변화 때까지 보여요
  if ([...now].some(([p, i]) => lastRank.get(p) !== i)) setTimeout(() => { lastRank = now; }, 6000);
  return html;
}

function approvals() {
  const max = game.s.maxCountries || MAX_COUNTRIES;
  const pend = game.list.filter((c) => !c.approved);
  const ok = game.list.filter((c) => c.approved);
  return `
  <div class="card">
    <div class="count-hd">
      <h3>참가한 나라 (${game.list.length}/${max})</h3>
      ${game.s.phase === 'lobby' ? `<div class="count-ctl" title="나라 수 정하기">
      <button class="ghost small" data-act="maxdown" data-step="5" ${max <= Math.max(COUNTRY_RANGE[0], game.list.length) ? 'disabled' : ''}>−5</button>
      <button class="ghost small" data-act="maxdown" ${max <= Math.max(COUNTRY_RANGE[0], game.list.length) ? 'disabled' : ''}>−</button>
      <b>${max}</b>
      <button class="ghost small" data-act="maxup" ${max >= COUNTRY_RANGE[1] ? 'disabled' : ''}>＋</button>
      <button class="ghost small" data-act="maxup" data-step="5" ${max >= COUNTRY_RANGE[1] ? 'disabled' : ''}>＋5</button></div>` : ''}
    </div>
    ${pend.length ? `<button class="good small" data-act="approveall">모두 승인</button>` : ''}
    ${[...pend, ...ok].map((c) => `
      <div class="approve-item">
        ${flagSvg(c, 'pick')}        <b class="grow">${esc(c.name)}</b>
        ${c.approved ? '<span class="pill good">승인됨</span>' : '<span class="pill warn">승인 대기</span>'}
        <button class="ghost small" data-act="rename" data-pid="${esc(c.pid)}">이름 수정</button>
        ${c.approved ? '' : `<button class="good small" data-act="approve" data-pid="${esc(c.pid)}">승인</button>`}
        <button class="bad small" data-act="remove" data-pid="${esc(c.pid)}">빼기</button>
      </div>`).join('') || '<p class="muted">아직 아무도 들어오지 않았어요.</p>'}
  </div>`;
}

// 영토 지도 보기: 모든 나라의 영토를 한 화면에 (나라 수에 맞춰 칸을 나눠요)
let hostView = 'board';
function mapWall() {
  const cs = game.list.filter((c) => c.approved && c.rich.length);
  if (!cs.length) return '<div class="card" style="margin-top:16px">아직 영토가 있는 나라가 없어요.</div>';
  const n = cs.length;
  const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const rows = Math.ceil(n / cols);
  return `<div class="mapwall" style="--cols:${cols};--rows:${rows}">${cs.map((c) => {
    const st = STAGES[c.stage];
    const atWar = game.atWar(c);
    return `<div class="mapcell ${atWar ? 'war' : ''}" data-pid-card="${esc(c.pid)}" style="border-top-color:${esc(c.color)}">
      <div class="mc-hd">${flagSvg(c, 'pick')}<b>${esc(c.name)}</b>
        <span class="pill stage-pill stage-${c.stage}">${st.icon} ${st.name}</span>
        <span class="pill gdp-pill">💵 ${gdpText(c)}</span>
        ${atWar ? '<span class="war-mark">⚔️</span>' : ''}${c.online ? '' : '<span class="pill bad">연결 끊김</span>'}</div>
      ${territorySvg({ ...c, prod: game.productionOf(c, game.s.round + 1), atWar }, { small: rows >= 3 })}
    </div>`;
  }).join('')}</div>`;
}

// 발전 공지: 선생님 화면에도 6초 동안 크게 띄워요
let lastAnnounce = null;
let annTimer = null;
const annBox = document.createElement('div');
annBox.id = 'announce';
document.body.appendChild(annBox);
annBox.addEventListener('click', (e) => { if (e.target === annBox || e.target.closest('[data-act=closeann]')) hideAnnounce(); });
function hideAnnounce() { annBox.innerHTML = ''; annBox.className = ''; clearTimeout(annTimer); }
function checkAnnounce() {
  const a = game.s.announce;
  if (!a || a.id === lastAnnounce) return;
  lastAnnounce = a.id;
  const c = game.c(a.pid);
  if (!c || Date.now() - a.time > 15000) return;
  annBox.className = 'overlay ann-wrap';
  annBox.innerHTML = announceHtml({ ...c, prod: game.productionOf(c, game.s.round + 1) }, a.stage, { big: true });
  sfx('level', game.on('sound'));
  clearTimeout(annTimer);
  annTimer = setTimeout(hideAnnounce, 6000);
}

// 세계대공황 시작·끝 알림 (선생님 화면, 8초)
let lastCrisis = null;
function checkCrisis() {
  const m = game.s.crisisMsg;
  if (!m || m.id === lastCrisis) return;
  lastCrisis = m.id;
  if (Date.now() - m.time > 20000) return;
  annBox.className = 'overlay ann-wrap';
  annBox.innerHTML = crisisHtml(m.type, { big: true });
  sfx(m.type === 'start' ? 'crisis' : 'good', game.on('sound'));
  clearTimeout(annTimer);
  annTimer = setTimeout(hideAnnounce, 8000);
}

// 새 기능이 열렸을 때 (선생님 화면, 8초)
let lastUnlock = null;
function checkUnlock() {
  const m = game.s.unlockMsg;
  if (!m || m.id === lastUnlock) return;
  if (highlightOpen()) return; // 하이라이트를 닫은 뒤에 보여요
  lastUnlock = m.id;
  if (Date.now() - m.time > 45000) return;
  annBox.className = 'overlay ann-wrap';
  annBox.innerHTML = unlockHtml(m, { big: true });
  sfx('unlock', game.on('sound'));
  clearTimeout(annTimer);
  annTimer = setTimeout(hideAnnounce, 8000);
}
// 🎤 라운드 하이라이트 (마지막 라운드는 결과 화면의 GDP 레이스로 대신해요)
let lastHighlight = null;
function checkHighlight() {
  const h = game.s.highlight;
  if (!h || h.id === lastHighlight) return;
  lastHighlight = h.id;
  if (h.last || Date.now() - h.time > 20000) return;
  hideAnnounce();
  showHighlight(game, h, () => { checkUnlock(); });
}
// 게임이 끝나면 GDP 레이스를 한 번 자동으로 보여줘요
let raceShown = false;

// 선생님 공지는 소리만 (화면에는 위쪽 띠로 보여요)
let lastNotice = null;
function checkNotice() {
  const m = game.s.notice;
  if (!m || m.id === lastNotice) return;
  lastNotice = m.id;
  setTimeout(render, 15500); // 15초 뒤 공지 띠를 지워요
}

// 협동 프로젝트·국제 입찰 결과 알림 (선생님 화면, 7초)
let lastWorld = null;
function checkWorldMsg() {
  const m = game.s.worldMsg;
  if (!m || m.id === lastWorld) return;
  lastWorld = m.id;
  if (Date.now() - m.time > 15000) return;
  annBox.className = 'overlay ann-wrap';
  annBox.innerHTML = newsHtml(m, { big: true });
  sfx('news', game.on('sound'));
  clearTimeout(annTimer);
  annTimer = setTimeout(hideAnnounce, 7000);
}

// 무역·원조가 이루어지면 두 나라 사이로 자원이 날아가는 효과
let lastFx = null;
const fxLayer = document.createElement('div');
fxLayer.id = 'fxlayer';
document.body.appendChild(fxLayer);
function checkFx() {
  for (const f of game.s.fx || []) {
    if (lastFx != null && f.id <= lastFx) continue;
    lastFx = f.id;
    if (Date.now() - f.time < 8000) playFx(f);
  }
}
function cardCenter(pid) {
  const el = [...app.querySelectorAll('[data-pid-card]')].find((x) => x.dataset.pidCard === pid);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { el, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) };
}
function playFx(f) {
  sfx(f.kind === 'aid' ? 'good' : 'trade', game.on('sound'));
  const A = cardCenter(f.from); const B = cardCenter(f.to);
  if (!A || !B) return;
  for (const el of [A.el, B.el]) { el.classList.remove('fx-glow'); void el.offsetWidth; el.classList.add('fx-glow'); }
  const items = [];
  const add = (amounts, dir) => ITEMS.forEach((r) => { for (let i = 0; i < Math.min(5, amounts?.[r] || 0); i++) items.push({ icon: ITEM_INFO[r].icon, dir }); });
  add(f.give, 1); add(f.get, -1);
  if (f.kind === 'aid') items.unshift({ icon: '🎁', dir: 1, big: true });
  items.forEach((it, i) => {
    const [p, q] = it.dir > 0 ? [A, B] : [B, A];
    const lift = 70 + (i % 4) * 18;
    const mx = (p.x + q.x) / 2 + (it.dir > 0 ? -1 : 1) * 30;
    const my = Math.min(p.y, q.y) - lift;
    const e = document.createElement('div');
    e.className = `fx-item ${it.big ? 'big' : ''}`;
    e.textContent = it.icon;
    fxLayer.appendChild(e);
    const at = (x, y, s, o) => ({ transform: `translate(${x}px, ${y}px) scale(${s})`, opacity: o });
    e.animate([at(p.x, p.y, 0.5, 0), { ...at(p.x, p.y - 10, 1.2, 1), offset: 0.12 }, { ...at(mx, my, 1.5, 1), offset: 0.5 }, { ...at(q.x, q.y, 1, 1), offset: 0.88 }, at(q.x, q.y, 0.4, 0)],
      { duration: 1700, delay: i * 110, easing: 'ease-in-out', fill: 'both' }).onfinish = () => e.remove();
  });
  // 가운데 말풍선
  const tag = document.createElement('div');
  tag.className = `fx-tag ${f.kind}`;
  tag.textContent = f.kind === 'aid' ? '🎁 원조!' : '🤝 무역 성공!';
  tag.style.left = `${(A.x + B.x) / 2}px`;
  tag.style.top = `${Math.min(A.y, B.y) - 60}px`;
  fxLayer.appendChild(tag);
  setTimeout(() => tag.remove(), 2200 + items.length * 110);
}

function logPanel() {
  const items = game.s.log.slice().reverse();
  return `
  <div class="card">
    <h3>📜 기록 (무역·건설·사건)</h3>
    <div class="loglist">${items.map((l) => `<div><span class="r">${l.round ? l.round + 'R' : '준비'}</span>${esc(l.text)}</div>`).join('') || '<p class="muted">아직 기록이 없어요.</p>'}</div>
  </div>`;
}

function render() {
  const s = game.s;
  let body;
  if (s.phase === 'lobby') {
    body = `
    <div class="host-main">
      <div class="stack">
        <div class="card lobby-hero">
          <div class="kicker" style="margin-bottom:14px">World Traders · Room code</div>
          ${localOnly() ? `<div class="banner warn" style="text-align:left;margin:0 0 16px">
            ⚠️ 지금 주소(<b>${esc(location.host)}</b>)는 <b>이 컴퓨터에서만</b> 열려요. 학생 태블릿은 이 주소로 들어올 수 없어요.<br>
            학생은 <b>GitHub Pages 주소의 play.html</b>로 들어가서 아래 방 번호를 입력하면 돼요. (선생님 화면은 지금 이대로 써도 괜찮아요)</div>` : ''}
          <div style="font-size:1.4rem">태블릿에서 이 주소에 들어가 방 번호를 입력하세요</div>
          <div style="font-size:1.3rem;font-weight:700;word-break:break-all;margin-top:8px">${localOnly() ? 'https://(GitHub 아이디).github.io/(저장소 이름)/play.html' : esc(playUrl().split('?')[0])}</div>
          <div class="lobby-code-row"><div class="bigcode">${esc(s.code)}</div>
            ${pickTransport() !== 'local' && !localOnly() ? qrBlock(playUrl()) : ''}</div>
          <button class="good tut-start" data-act="tutorial">📖 튜토리얼 함께 보기 (게임 방법 설명)</button>
          ${pickTransport() === 'local' ? `<div class="banner info" style="margin:0 0 14px">🧪 <b>테스트 모드</b>예요. 같은 브라우저의 탭끼리만 연결돼요. 아래 버튼을 누를 때마다 학생 탭이 하나씩 열려요.</div>
          <a class="test-open" href="${esc(playUrl())}" target="_blank" rel="noopener">＋ 학생 탭 열기</a>` : ''}
          <div class="muted">나라 이름·국기를 정하면 오른쪽에 나타나요. 확인 후 승인해 주세요.</div>
          ${window.__gameVersion ? `<div class="muted" style="font-size:.8rem;margin-top:8px;opacity:.7">게임 버전 ${esc(window.__gameVersion)}</div>` : ''}
        </div>
        <div class="board">${game.list.map(countryCard).join('')}</div>
      </div>
      <div class="stack">${approvals()}${settingsPanel(game)}</div>
    </div>`;
  } else if (hostView === 'map') {
    body = mapWall();
  } else if (hostView === 'world') {
    body = worldMapView(game);
  } else if (s.phase === 'end') {
    body = renderExtra?.('end', game) ?? `<div class="card"><h2>게임 끝!</h2></div>`;
    if (!raceShown) { raceShown = true; setTimeout(() => openRace(game), 600); }
    body = `<div class="stack" style="margin-top:16px">${badgesCard(game)}${body}${endExtras(game)}<div class="board">${game.list.map(countryCard).join('')}</div>${logPanel()}</div>`;
  } else {
    body = `
    <div class="host-main">
      <div class="stack">
        ${rankStrip()}
        ${renderExtra?.('phase', game) ?? ''}
        <div class="board">${game.list.map(countryCard).join('')}</div>
      </div>
      <div class="stack">${game.list.some((c) => !c.approved) ? approvals() : ''}${logPanel()}</div>
    </div>`;
  }
  const scrollEls = [...app.querySelectorAll('.loglist')].map((e) => e.scrollTop);
  const strip = (s.notice && Date.now() - s.notice.time < 15000 ? `<div class="notice-strip">📢 ${esc(s.notice.text)}</div>` : '')
    + (s.freeze ? '<div class="notice-strip freeze">👀 학생 화면을 멈췄어요. 「🧰 선생님 도구」에서 다시 시작할 수 있어요.</div>' : '');
  app.innerHTML = topBar(s) + strip + body;
  updateMusic(s);
  [...app.querySelectorAll('.loglist')].forEach((e, i) => { e.scrollTop = scrollEls[i] || 0; });
  // 영토 지도는 화면 남은 높이에 딱 맞게 (위쪽 버튼 줄 높이를 재서)
  const wall = app.querySelector('.mapwall');
  if (wall) wall.style.setProperty('--top', `${Math.round(wall.getBoundingClientRect().top + scrollY)}px`);
  updateClock();
}

/* ---------- 버튼 ---------- */
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act; const pid = b.dataset.pid;
  switch (act) {
    case 'start': game.start(); break;
    case 'next': game.advance(); break;
    case 'pause': game.pause(); break;
    case 'resume': game.resume(); break;
    case 'addtime': game.addTime(30); break;
    case 'hostview': hostView = b.dataset.v; render(); break;
    case 'tutorial': openTutorial(game); break;
    case 'race': openRace(game); break;
    case 'tools': openTools(game); break;
    case 'setlen': game.setSetting('length', Number(b.dataset.v)); break;
    case 'setq': game.setSetting('qset', b.dataset.v); break;
    case 'setf': game.setSetting('f.' + b.dataset.v, !game.on(b.dataset.v)); break;
    case 'csv': downloadCsv(game); break;
    case 'print': window.print(); break;
    case 'maxup': game.setMaxCountries((game.s.maxCountries || MAX_COUNTRIES) + (b.dataset.step ? Number(b.dataset.step) : 1)); break;
    case 'maxdown': game.setMaxCountries((game.s.maxCountries || MAX_COUNTRIES) - (b.dataset.step ? Number(b.dataset.step) : 1)); break;
    case 'approve': game.approve(pid); break;
    case 'approveall': game.list.filter((c) => !c.approved).forEach((c) => game.approve(c.pid)); break;
    case 'rename': {
      const c = game.c(pid);
      const n = prompt('새 나라 이름 (8글자까지)', c.name);
      if (n != null) game.rename(pid, n);
      break;
    }
    case 'remove': if (confirm(`${game.c(pid).name} 나라를 뺄까요?`)) game.remove(pid); break;
    case 'finish': if (confirm('게임을 지금 끝낼까요?')) game.finish(); break;
    case 'newgame':
      if (confirm('새 게임을 만들까요? (지금 결과 화면은 사라져요)')) { store(SAVE_KEY, null); location.reload(); }
      break;
    default: renderExtra?.('click', game, act, b);
  }
});

app.addEventListener('change', (e) => {
  const act = e.target.dataset?.act;
  if (act === 'tradeban') {
    game.s.tradeBan = e.target.checked;
    game.addLog('system', e.target.checked ? '🚫 선생님이 무역을 금지했어요.' : '✅ 무역 금지가 풀렸어요.');
    if (e.target.checked) game.expireOffers();
    game.changed();
  } else if (act === 'announce') {
    game.s.announceOn = e.target.checked;
    if (!e.target.checked) game.s.announce = null;
    game.changed();
  } else if (act) renderExtra?.('change', game, act, e.target);
});

window.addEventListener('beforeunload', (e) => {
  if (window !== window.top) return; // 시험 페이지 안에서는 묻지 않아요
  if (game && game.s.phase !== 'lobby' && game.s.phase !== 'end') { e.preventDefault(); e.returnValue = ''; }
});

// 확장 모듈을 먼저 불러온 뒤 시작
import('./extras.js').then((m) => m.install(registerExtras)).catch(() => {}).finally(boot);
