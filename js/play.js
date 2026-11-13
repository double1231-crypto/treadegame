// 학생 화면 (태블릿 세로)
import { flagSvg, FLAG_PATTERNS, FLAG_COLORS, COLOR_COUNT, cleanDesign, nationColor } from './flag.js';
import { RES, RES_INFO, STAGES, UPGRADE_COST, WORKSHOP, FLAGS, PHASE_NAME, GOODS, GOODS_INFO, GOODS_RULE, ITEMS, ITEM_INFO } from './config.js';
import { joinRoom, pickTransport } from './net.js';
import { $, esc, fmtTime, toast, store, uid, icons, resChips, josa, sfx, won } from './ui.js';
import { territorySvg, facilityLegend, announceHtml, crisisHtml, newsHtml, unlockHtml } from './territory.js';
import { openStudentTutorial, closeStudentTutorial, onPractice } from './tutorial.js';
import { startPractice } from './practice.js';

const app = $('#app');
const overlay = $('#overlay');
const params = new URLSearchParams(location.search);

// 기기마다 고유 번호(새로고침해도 같은 나라로 다시 들어감). 테스트 모드에서는 탭마다 다르게.
// 시험 페이지에서는 한 탭 안에 학생 화면이 여러 개라서 자리 번호(seat)로 구분해요.
const testMode = ['local', 'fbmock'].includes(params.get('net'));
const seat = testMode ? params.get('seat') : null;
const idStore = testMode ? sessionStorage : localStorage;
const pidKey = 'tradeciv-pid' + (seat ? '-' + seat : '');
let pid = idStore.getItem(pidKey);
if (!pid) { pid = uid(); idStore.setItem(pidKey, pid); }

let room = (params.get('room') || store('tradeciv-room') || '').toString();
let conn = null;
let connStatus = 'idle';
let sawBlocked = false;
let view = null;
let receivedAt = 0;
let screen = 'code';
const saved = seat ? { name: `시험나라${seat}` } : store('tradeciv-setup') || {};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomColors = () => [...FLAG_COLORS].sort(() => Math.random() - 0.5).slice(0, 3);
const setup = {
  name: saved.name || '',
  flag: saved.flag !== undefined && (saved.flag === '' || FLAGS.includes(saved.flag)) ? saved.flag : pick(FLAGS),
  design: saved.design?.p ? cleanDesign(saved.design) : { p: pick(FLAG_PATTERNS).id, c: randomColors() },
};
// 무늬마다 쓰는 색 수
let tab = 'trade';
const emptyRes = () => Object.fromEntries(ITEMS.map((r) => [r, 0])); // 자원 + 공산품
let draft = { to: null, give: emptyRes(), get: emptyRes() };
let wdraft = {};      // 세계 과제(협동 프로젝트·입찰)에 보탤/걸 자원
let wdraftId = null;  // 어느 세계 과제의 칸인지
let wOpen = false;    // 보태기·입찰 칸을 펼쳤는지
let unlockSeen = null, unlockShow = null, unlockTimer = null, unlockPending = null; // 새 기능 알림
let noticeSeen = null, noticeShow = null, noticeTimer = null; // 선생님 공지
let worldSeen = null, worldShow = null, worldTimer = null; // 세계 과제 결과 알림
let prevRes = null;
let prevStage = null;
let celebrate = null; // 축하 화면에 보여 줄 단계
// 다른 나라 발전 공지: 받는 순간의 나라 모습을 저장해 두고 5초 동안 보여 줘요 (화면이 갱신돼도 깜빡이지 않게)
let annSeen = null;   // 마지막으로 처리한 공지 번호
let annShow = null;   // { id, stage, c }
let annTimer = null;
let crisisSeen = null, crisisShow = null, crisisTimer = null; // 세계대공황 알림

/* ---------- 연결 ---------- */
function connect(code) {
  room = code.trim();
  store('tradeciv-room', room);
  if (conn) conn.close();
  connStatus = 'connecting';
  screen = 'connecting';
  render();
  conn = joinRoom(room, {
    onStatus(st) {
      if (st === 'blocked') sawBlocked = true;
      if (st === 'open' || st === 'notfound') sawBlocked = false;
      connStatus = st;
      if (st === 'open') conn.send({ t: 'hello', pid });
      if (st === 'notfound' && screen === 'connecting') screen = 'connecting';
      renderConn();
      if (screen === 'connecting') render();
    },
    onMessage,
  });
}

function send(msg) {
  if (practice) return practice.handle({ ...msg, pid }); // 🧪 연습 중에는 태블릿 안의 연습 게임으로
  if (!conn || !conn.send({ ...msg, pid })) toast('연결이 끊겼어요. 잠시 후 다시 해 보세요.', 'bad');
}

/* ---------- 🧪 직접 해 보는 연습 ---------- */
let practice = null;
let realView = null;
// 연습은 게임 시작 전에 해요 (게임 시간이 흐르는 동안에는 안 돼요). 늦게 들어와 승인을 기다리는 학생은 할 수 있어요.
const canPractice = () => !!view?.me && !view.unknown && (!view.me.approved || view.phase === 'lobby');
const tutKey = () => 'tradeciv-tutdone-' + room + (seat ? '-' + seat : '');
function realSend(msg) { return conn?.send({ ...msg, pid }); }
// 연습까지 끝내면 선생님 화면에 「튜토리얼 완료」를 알려요
function markTutDone() {
  idStore.setItem(tutKey(), '1');
  realSend({ t: 'tutdone' });
}
function beginPractice() {
  if (practice) return;
  if (!canPractice()) return toast('연습은 게임 시작 전이나 준비 시간에만 할 수 있어요.', 'bad');
  closeStudentTutorial();
  realView = view;
  tab = 'trade';
  resetScreenFx();
  document.body.classList.add('practicing');
  practice = startPractice({
    pid, me: view.me, toast, onComplete: markTutDone,
    deliver: (m) => { m.__practice = true; onMessage(m); },
    onEnd: () => {
      practice = null;
      document.body.classList.remove('practicing');
      tab = 'trade';
      resetScreenFx();
      const rv = realView; realView = null;
      if (rv) onMessage(rv); else render();
    },
  });
}

// 게임 시작 전: 튜토리얼(연습)을 끝냈는지 알려 주는 띠
function tutBanner(v) {
  if (!v?.tutRequired) return '';
  return v.tutDone
    ? '<div class="banner good tut-banner">✅ 튜토리얼 완료! 친구들이 끝낼 때까지 기다려요. 모두 끝나면 선생님이 시작해요.</div>'
    : `<div class="banner info tut-banner">📌 <b>직접 해 보기(연습)</b>까지 끝내야 게임을 시작할 수 있어요.
        <button class="good" data-act="practice">🧪 직접 해 보기</button><button class="ghost small" data-act="howto">📖 게임 방법</button></div>`;
}

// 연습 화면과 진짜 화면을 오갈 때 축하·알림이 남지 않게
function resetScreenFx() {
  celebrate = null; prevStage = null; prevRes = null; annShow = null; crisisShow = null;
}

function onMessage(msg) {
  if (!msg) return;
  // 연습 중에 온 진짜 게임 소식은 모아 두었다가 연습이 끝나면 보여요
  if (practice && !msg.__practice) {
    if (msg.t === 'state') {
      realView = msg;
      if (msg.me?.approved && msg.phase !== 'lobby') {
        toast('🎬 진짜 게임이 시작됐어요! 연습을 마쳐요.', 'good');
        practice.stop();
      }
    }
    return;
  }
  if (msg.t === 'toast') { if (msg.kind === 'good') sfx('good', !!view?.studentSound); return toast(msg.text, msg.kind); }
  if (msg.t === 'error') return toast('⚠️ ' + msg.text, 'bad');
  if (msg.t !== 'state') return;
  const before = view;
  view = msg;
  receivedAt = Date.now();
  if (msg.unknown) {
    if (msg.kicked) toast('선생님이 나라를 뺐어요. 다시 만들어 주세요.', 'bad');
    if (screen !== 'setup') { screen = 'setup'; render(); }
    return;
  }
  screen = msg.me.approved ? 'game' : 'waiting';
  onStateExtra?.(before, msg);
  render();
  if (!msg.__practice) autoTutorial();
}

// 📖 처음 들어오면 게임 방법을 한 번 보여 줘요. 선생님이 「태블릿에서 각자 보기」를 누르면 다시 떠요.
let selfTutSeen = null;
let lastTutPhase = null;
onPractice(() => beginPractice());
function autoTutorial() {
  const v = view;
  if (!v?.me) return;
  if (v.phase === 'minigame') { closeStudentTutorial(); return; }
  if (v.phase === 'end') return;
  const key = 'tradeciv-tut-' + room + (seat ? '-' + seat : '');
  // 이미 연습을 끝냈는데 선생님 화면이 모르면(새로고침 등) 다시 알려요
  if (v.tutRequired && !v.tutDone && idStore.getItem(tutKey())) realSend({ t: 'tutdone' });
  // 게임이 시작되는 순간에는 튜토리얼 화면을 닫아요 (게임 중에 「📖 방법」으로 다시 여는 건 괜찮아요)
  if (lastTutPhase === 'lobby' && v.phase !== 'lobby') closeStudentTutorial();
  lastTutPhase = v.phase;
  if (v.selfTut && v.selfTut.id !== selfTutSeen) {
    selfTutSeen = v.selfTut.id;
    idStore.setItem(key, '1');
    openStudentTutorial(v, canPractice());
    return;
  }
  if (!idStore.getItem(key) && (v.phase === 'lobby' || !v.me.approved)) {
    idStore.setItem(key, '1');
    openStudentTutorial(v, canPractice());
  }
}

/* ---------- 확장(미니게임·사건·전쟁) 자리 ---------- */
let onStateExtra = null;
let renderOverlayExtra = null;
let clickExtra = null;
let warTab = null;

/* ---------- 그리기 ---------- */
function render() {
  if (screen === 'code' || (screen === 'connecting' && connStatus === 'idle')) return renderCode();
  if (screen === 'connecting') return renderConnecting();
  if (screen === 'setup') return renderSetup();
  if (screen === 'waiting') return renderWaiting();
  renderGame();
}

function renderCode() {
  app.innerHTML = `
  <div class="join-wrap stack center">
    <div><div class="kicker">Trade Civilization</div><h1 class="join-title">World Traders</h1></div>
    <div class="card stack">
      <h2>방 번호를 입력하세요</h2>
      <input type="text" id="code" class="code-input" inputmode="numeric" maxlength="6" value="${esc(room)}" placeholder="1234" autocomplete="off">
      <button data-act="join" style="width:100%;font-size:1.4rem;min-height:70px">들어가기 ➜</button>
    </div>
  </div>`;
  const inp = $('#code');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinClick(); });
}

function joinClick() {
  const code = $('#code').value.trim();
  if (!code) return toast('방 번호를 적어 주세요.', 'bad');
  connect(code);
}

function renderConnecting() {
  let icon = '📡', msg = '선생님 컴퓨터에 연결하는 중…', help = '';
  if (connStatus === 'notfound') {
    icon = '🔍'; msg = `${esc(room)}번 방을 찾을 수 없어요`;
    help = '① 방 번호가 맞는지 확인해요.<br>② 선생님 화면(방 만들기)이 켜져 있는지 확인해요.';
  } else if (connStatus === 'noserver') {
    icon = '🌐'; msg = '연결 서버에 닿지 않아요';
    help = '태블릿이 인터넷(와이파이)에 연결되어 있는지 확인해 주세요.';
  } else if (sawBlocked || connStatus === 'blocked') {
    icon = '🚧'; msg = '방은 찾았는데 연결이 열리지 않아요';
    help = '학교 와이파이가 기기끼리 직접 연결하는 것을 막고 있을 수 있어요.<br>선생님께 이 화면을 보여 주세요. (계속 다시 시도하는 중)';
  }
  app.innerHTML = `
  <div class="join-wrap stack center">
    <div class="card stack">
      <div style="font-size:4rem">${icon}</div>
      <h2>${msg}</h2>
      ${help ? `<p style="font-size:1.1rem;line-height:1.7">${help}</p>` : ''}
      <p class="muted">방 번호: <b>${esc(room)}</b></p>
      <button class="ghost" data-act="changeroom">방 번호 다시 입력</button>
    </div>
  </div>`;
}

function renderSetup() {
  app.innerHTML = `
  <div class="join-wrap stack">
    <div class="center"><div class="kicker">Create your nation</div><h1 class="join-title" style="font-size:2rem">우리 나라 만들기</h1></div>
    <div class="card center setup-preview">
      ${flagSvg(setup, 'big')}
      <div style="font-size:1.8rem;font-weight:800" id="pname">${esc(setup.name) || '이름을 지어 주세요'}</div>
    </div>
    <div class="card stack">
      <h3>1. 나라 이름 (8글자까지)</h3>
      <input type="text" id="cname" maxlength="8" value="${esc(setup.name)}" placeholder="예) 햇살나라" autocomplete="off">
      <h3>2. 국기 무늬</h3>
      <div class="pattern-grid">${FLAG_PATTERNS.map((p) => `<button data-act="fpat" data-v="${p.id}" class="${p.id === setup.design.p ? 'on' : ''}">
        ${flagSvg({ design: { p: p.id, c: setup.design.c }, flag: '' })}<small>${p.name}</small></button>`).join('')}</div>
      <h3>3. 국기 색깔</h3>
      ${setup.design.c.slice(0, COLOR_COUNT[setup.design.p]).map((cur, i) => `
        <div class="color-row"><span class="muted">색 ${i + 1}</span>
          <div class="color-grid">${FLAG_COLORS.map((c) => `<button data-act="fcol" data-i="${i}" data-v="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}" aria-label="색 ${i + 1}"></button>`).join('')}</div>
        </div>`).join('')}
      <h3>4. 가운데 그림</h3>
      <div class="flag-grid">
        <button data-act="flag" data-v="" class="${setup.flag === '' ? 'on' : ''}" style="font-size:1rem">없음</button>
        ${FLAGS.map((f) => `<button data-act="flag" data-v="${f}" class="${f === setup.flag ? 'on' : ''}">${f}</button>`).join('')}</div>
    </div>
    <button class="good" data-act="create" style="width:100%;font-size:1.5rem;min-height:76px">🏳️ 나라 만들기</button>
    <div class="conn muted" id="conn"></div>
  </div>`;
  const inp = $('#cname');
  inp.addEventListener('input', () => {
    setup.name = Array.from(inp.value).slice(0, 8).join('');
    $('#pname').textContent = setup.name || '이름을 지어 주세요';
  });
  renderConn();
}

function renderWaiting() {
  const me = view.me;
  app.innerHTML = `
  <div class="join-wrap stack center">
    <div class="card stack" style="--nation:${esc(me.color)}">
      ${flagSvg(me, 'big')}
      <div style="font-size:2rem;font-weight:800">${esc(me.name)}</div>
      <h2>⏳ 선생님이 승인하면 시작해요</h2>
      ${view.tutRequired && view.tutDone ? tutBanner(view) : `<button class="good" data-act="practice" style="font-size:1.25rem">🧪 직접 해 보기 (연습)</button>
      ${view.tutRequired ? '<div class="muted">📌 연습까지 끝내야 게임을 시작할 수 있어요.</div>' : ''}`}
      <button class="ghost" data-act="howto">📖 게임 방법 보기</button>
      <p class="muted">이름을 바꾸고 싶으면 아래 버튼을 눌러요.</p>
      <button class="ghost" data-act="editsetup">✏️ 다시 고치기</button>
    </div>
    <div class="conn muted" id="conn"></div>
  </div>`;
  renderConn();
  renderOverlay(); // 기다리는 동안에도 튜토리얼·화면 멈춤·공지가 보여요
}

function renderConn() {
  const el = $('#conn');
  if (!el) return;
  el.textContent = {
    open: '🟢 연결됨', connecting: '🟡 연결 중…', closed: '🔴 연결 끊김 - 다시 연결 중…', notfound: '🔴 방을 찾는 중…',
    blocked: '🔴 연결이 막혀 있어요 - 다시 시도 중…', noserver: '🔴 인터넷 연결을 확인해 주세요',
  }[connStatus] || '';
}

function remainingMs() {
  if (!view) return 0;
  return view.paused ? view.remaining : Math.max(0, view.remaining - (Date.now() - receivedAt));
}

function canTrade() { return view && (view.phase === 'trade' || view.phase === 'prep') && !view.tradeBan; }
function canBuild() { return view && (view.phase === 'trade' || view.phase === 'prep'); }

let appPhaseKey = null;
function renderGame() {
  const v = view; const me = v.me;
  // 미니게임 중에는 문제 화면이 다 가리고 있어요. 뒤 화면은 처음 한 번만 그려서 깜빡임을 막아요.
  const phaseKey = `${v.phase}-${v.round}-${practice ? 'p' : 'r'}`;
  if (v.phase === 'minigame' && appPhaseKey === phaseKey && app.firstElementChild) { renderOverlay(); return; }
  appPhaseKey = phaseKey;
  const st = STAGES[me.stage];
  const incoming = v.offers.filter((o) => o.to === pid && o.status === 'pending');
  const phaseTxt = v.phase === 'prep' || v.phase === 'end' || v.phase === 'lobby' ? PHASE_NAME[v.phase] : `${v.round}라운드 · ${PHASE_NAME[v.phase]}`;
  const flashes = new Set(prevRes ? RES.filter((r) => me.res[r] > prevRes[r]) : []);
  prevRes = { ...me.res };
  if (prevStage != null && me.stage > prevStage) { celebrate = me.stage; sfx('level', !!v.studentSound); }
  // 새 기능이 열렸어요 (10초 동안)
  const um = v.unlockMsg;
  if (um && um.id !== unlockSeen) {
    unlockSeen = um.id;
    if (prevStage != null) unlockPending = um; // 미니게임을 가리지 않게, 무역 시간에 보여 줘요
  }
  if (v.phase === 'end') { unlockPending = null; unlockShow = null; } // 게임이 끝나면 지난 알림은 버려요
  if (unlockPending && v.phase === 'trade') {
    unlockShow = unlockPending; unlockPending = null; sfx('unlock', !!v.studentSound);
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => { unlockShow = null; render(); }, 10000);
  }
  // 선생님 공지 (8초 동안)
  const nt = v.notice;
  if (nt && nt.id !== noticeSeen) {
    noticeSeen = nt.id;
    noticeShow = nt; sfx('notice', !!v.studentSound);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { noticeShow = null; render(); }, 8000);
  }
  const firstView = prevStage == null;
  prevStage = me.stage;
  // 세계대공황 시작·끝 알림 (처음 들어온 화면에서는 띄우지 않아요)
  const cm = v.crisisMsg;
  if (cm && cm.id !== crisisSeen) {
    crisisSeen = cm.id;
    if (!firstView) {
      crisisShow = cm.type;
      sfx(cm.type === 'start' ? 'crisis' : 'good', !!v.studentSound);
      clearTimeout(crisisTimer);
      crisisTimer = setTimeout(() => { crisisShow = null; render(); }, 7000);
    }
  }
  // 협동 프로젝트·국제 입찰 결과 알림 (7초)
  const wm = v.worldMsg;
  if (wm && wm.id !== worldSeen) {
    worldSeen = wm.id;
    if (!firstView) {
      worldShow = wm;
      sfx('news', !!v.studentSound);
      clearTimeout(worldTimer);
      worldTimer = setTimeout(() => { worldShow = null; render(); }, 7000);
    }
  }
  const a = v.announce;
  if (a && a.id !== annSeen) {
    annSeen = a.id;
    const c = v.countries.find((x) => x.pid === a.pid);
    // 처음 들어왔을 때 받은 지난 공지와 내 나라 공지(축하 화면이 대신 떠요)는 띄우지 않아요
    if (!firstView && c && a.pid !== pid) {
      annShow = { id: a.id, stage: a.stage, c: { ...c } };
      clearTimeout(annTimer);
      annTimer = setTimeout(() => { annShow = null; render(); }, 5000);
    }
  }

  let banner = '';
  if (v.phase === 'lobby') banner = '<div class="banner info">선생님이 게임을 시작하면 자원이 생겨요. 잠시 기다려 주세요!</div>';
  else if (v.phase === 'prep') banner = '<div class="banner info">🧭 준비 시간! 초록색은 우리 나라에 많은 자원, 빨간색은 부족한 자원이에요. 무역 계획을 세워 보세요.</div>';
  if (v.crisis) banner += '<div class="banner bad">📉 <b>세계대공황</b> 중이에요! 모든 나라의 생산량이 절반으로 줄었어요. 🤝 무역과 🎁 원조로 세계 평화를 되찾아요.</div>';
  if (v.tradeBan) banner += '<div class="banner bad">🚫 지금은 선생님이 무역을 금지했어요. (🎁 원조와 🙏 도움 요청은 할 수 있어요)</div>';
  if (me.warUntil > v.round) banner += `<div class="banner bad">⚔️ 전쟁 때문에 ${me.warUntil}라운드까지 생산이 절반으로 줄어요.</div>`;
  if (v.paused) banner += '<div class="banner warn">⏸ 선생님이 잠시 멈췄어요.</div>';
  if (!practice && v.tutRequired) banner += tutBanner(v);

  const tabs = [
    ['trade', '🤝', '무역', incoming.length],
    ['build', '🗺️', '영토·건설', 0],
    ['nations', '🌍', '나라들', 0],
    ...(warTab && v.features?.war !== false ? [['war', '⚔️', '전쟁', 0]] : []),
  ];

  app.innerHTML = `
  <div class="player">
    <div class="topbar">
      <div class="mybar" style="--nation:${esc(me.color)}">
        ${flagSvg(me, 'bar')}
        <div><div class="name">${esc(me.name)} <button class="ghost small howto-btn" data-act="howto" aria-label="게임 방법">📖 방법</button></div><div class="stage">${st.icon} ${st.name}</div>
          <div class="my-gdp">💵 1인당 GDP <b>${won((me.gdp ?? 0))}</b></div>
          ${me.like ? `<div class="gdp-like">🌍 ${me.like.korea ? '대한민국(우리나라)과' : esc(josa(me.like.name, '과/와'))} 비슷해요${me.like.next ? ` <span>· 다음: ${esc(me.like.next.name)} ${won(me.like.next.at)}</span>` : ' 🏆'}</div>` : ''}</div>
        <div class="timer"><span>${phaseTxt}</span><b id="ptimer">${fmtTime(remainingMs())}</b></div>
      </div>
      <div class="resgrid">${RES.map((r) => {
        const t = me.rich.includes(r) ? 'rich' : me.poor.includes(r) ? 'poor' : '';
        const next = UPGRADE_COST[me.stage + 1];
        const need = next?.[r] || 0;
        const have = me.res[r];
        const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 0;
        const p = me.prod?.[r] ?? 0;
        return `<div class="res ${t} ${flashes.has(r) ? 'flash' : ''}">
          ${p ? `<span class="rprod">+${p}</span>` : ''}
          <div class="ic">${RES_INFO[r].icon}</div><div class="n">${have}</div>
          <div class="lb">${RES_INFO[r].name}${t ? ` · <b class="tag">${t === 'rich' ? '풍부' : '부족'}</b>` : ''}</div>
          ${next ? (need
            ? `<div class="rbar ${have >= need ? 'ok' : ''}"><i style="width:${pct}%"></i></div><div class="rneed">${have >= need ? '✓ 충분' : `${STAGES[me.stage + 1].icon} ${have}/${need}`}</div>`
            : '<div class="rbar none"></div><div class="rneed dim">필요 없음</div>') : ''}
        </div>`;
      }).join('')}</div>
      <div class="goodsbar ${v.features?.goods === false ? 'hidden' : ''}">
        <span class="gb-lb">🏭 공산품</span>
        ${GOODS.filter((g) => (v.goodsOpen || GOODS).includes(g) || me.res[g] > 0).map((g) => `<span class="gb-item">${GOODS_INFO[g].icon} ${GOODS_INFO[g].name} <b>${me.res[g] || 0}</b></span>`).join('') || '<span class="muted">공장이 열리면 여기에 보여요</span>'}
        ${me.tech ? '<span class="pill tech-pill">🔬 기술 나라</span>' : ''}
      </div>
      <div class="conn muted" id="conn"></div>
    </div>
    ${banner}
    <div class="tabs" style="grid-template-columns:repeat(${tabs.length},1fr)">
      ${tabs.map(([k, i, n, badge]) => `<button data-act="tab" data-v="${k}" class="${tab === k ? 'on' : ''}"><span class="ti">${i}</span>${n}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('')}
    </div>
    <div id="tabbody">${tab === 'trade' ? tradeTab() : tab === 'build' ? buildTab() : tab === 'war' && warTab ? warTab(v) : nationsTab()}</div>
  </div>`;
  renderConn();
  renderOverlay();
}

// 발전 단계가 오르면 축하 화면
const STAGE_NEWS = [
  '',
  '흙길이 나고 집이 지어졌어요. 바다에 배가 다니기 시작했어요!',
  '돌길과 성벽, 망루가 생기고 바다 건너 작은 섬까지 영토가 넓어졌어요!',
  '금빛 길과 궁전, 큰 배와 섬 위의 탑까지! 온 세계가 우리 제국을 알아봐요!',
];
function celebrateHtml() {
  const me = view?.me;
  if (celebrate == null || !me) return '';
  const st = STAGES[celebrate];
  return `<div class="overlay"><div class="sheet center stack cele cele-${celebrate}">
    <div class="cele-icon">${st.icon}</div>
    <h2>🎉 ${esc(josa(st.name, '으로/로'))} 발전했어요!</h2>
    ${territorySvg(me)}
    <p style="font-size:1.15rem">${STAGE_NEWS[celebrate]}</p>
    <p class="muted">라운드마다 생산되는 자원도 늘어나요.</p>
    <button class="good" data-act="closecele" style="width:100%;font-size:1.3rem">계속하기 →</button>
  </div></div>`;
}

function renderOverlay() {
  const ann = annShow ? `<div class="overlay ann-wrap">${announceHtml(annShow.c, annShow.stage)}</div>` : '';
  const cri = crisisShow ? `<div class="overlay ann-wrap">${crisisHtml(crisisShow)}</div>` : '';
  const wn = worldShow ? `<div class="overlay ann-wrap">${newsHtml(worldShow)}</div>` : '';
  // 선생님이 멈추거나 튜토리얼을 보여 줄 때는 이 화면이 가장 먼저예요
  const stop = view?.freeze || view?.tutorial
    ? `<div class="overlay look-wrap"><div class="look-sheet"><div class="look-icon">${view.freeze ? '👀' : '📺'}</div>
        <h1>${view.freeze ? '선생님을 봐요!' : '선생님 화면을 봐요!'}</h1>
        <p>${view.freeze ? '선생님이 설명하고 있어요. 잠시 태블릿을 내려놓아요.' : `튜토리얼로 게임 방법을 함께 배워요 (${view.tutorial.i} / ${view.tutorial.n})`}</p></div></div>` : '';
  const ntc = noticeShow ? `<div class="notice-pop">📢 <b>선생님 공지</b> ${esc(noticeShow.text)}</div>` : '';
  const unl = unlockShow ? `<div class="overlay ann-wrap">${unlockHtml(unlockShow)}</div>` : '';
  // 미니게임 중에는 문제 화면만 보여요 (다른 알림이 문제를 가리지 않게)
  const quiz = view?.phase === 'minigame';
  const html = (stop || (quiz ? '' : celebrateHtml() || cri || unl || wn || ann) || renderOverlayExtra?.(view) || '') + ntc;
  setOverlay(html);
}

// 겹쳐 뜨는 화면을 바꿀 때 깜빡이지 않게:
// - 남은 시간 숫자만 다르면 다시 그리지 않아요 (시계는 따로 움직여요)
// - 같은 종류의 화면이면 바깥 틀(흐린 배경)은 그대로 두고 안쪽만 바꿔요
function setOverlay(html) {
  const key = html.replace(/(id="mgtimer"[^>]*>)[^<]*</, '$1<');
  if (overlay.dataset.key === key) return;
  overlay.dataset.key = key;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const oldEls = [...overlay.children]; const newEls = [...tmp.children];
  const same = oldEls.length && oldEls.length === newEls.length
    && oldEls.every((el, i) => el.tagName === newEls[i].tagName && el.className === newEls[i].className);
  if (!same) { overlay.innerHTML = html; return; }
  oldEls.forEach((el, i) => {
    const a = el.firstElementChild; const b = newEls[i].firstElementChild;
    if (a && b && a.className === b.className && el.children.length === 1 && newEls[i].children.length === 1) {
      if (a.innerHTML !== b.innerHTML) {
        const timer = a.querySelector('#mgtimer')?.textContent;
        a.innerHTML = b.innerHTML;
        const t = a.querySelector('#mgtimer'); if (t && timer) t.textContent = timer;
      }
    } else if (el.innerHTML !== newEls[i].innerHTML) el.innerHTML = newEls[i].innerHTML;
  });
}

/* ---------- 무역 탭 ---------- */
function others() { return view.countries.filter((c) => c.pid !== pid); }
function countryOf(p) { return view.countries.find((c) => c.pid === p); }

function canAid() { return view && (view.phase === 'trade' || view.phase === 'prep'); }

// 도움 요청 카드: 받은 쪽은 「보내 주기」로 원조할 수 있어요
function requestCard(o, incoming) {
  const other = countryOf(incoming ? o.from : o.to) || { flag: '❓', name: '?' };
  const lack = incoming && RES.some((r) => view.me.res[r] < o.get[r]);
  return `
  <div class="card offer request" style="border-left-color:${esc(other.color || '#999')}">
    <div>🙏 ${flagSvg(other, 'inline')} <b>${esc(other.name)}</b> ${incoming ? '나라가 도움을 요청했어요' : '나라에 도움을 요청했어요'}</div>
    <div class="swap one"><div><small>${incoming ? '보내 주면 좋은 것' : '요청한 것'}</small>${resChips(o.get)}</div></div>
    ${incoming ? `<div class="row">
        <button class="good grow" data-act="accept" data-id="${o.id}" ${lack || !canAid() ? 'disabled' : ''}>🎁 보내 주기</button>
        <button class="ghost grow" data-act="reject" data-id="${o.id}">지금은 어려워요</button></div>
        <div class="muted" style="margin-top:6px">${lack ? '보낼 자원이 모자라요.' : '도와주면 세계 평화 점수가 올라가요. 🕊️'}</div>`
      : `<div class="row"><span class="pill warn">답을 기다리는 중</span><span class="grow"></span><button class="ghost small" data-act="cancel" data-id="${o.id}">요청 취소</button></div>`}
  </div>`;
}

function offerCard(o, incoming) {
  if (o.kind === 'request') return requestCard(o, incoming);
  const other = countryOf(incoming ? o.from : o.to) || { flag: '❓', name: '?' };
  const meGets = incoming ? o.give : o.get;
  const meGives = incoming ? o.get : o.give;
  const lack = RES.some((r) => view.me.res[r] < meGives[r]);
  return `
  <div class="card offer" style="border-left-color:${esc(other.color || '#999')}">
    <div>${flagSvg(other, 'inline')} <b>${esc(other.name)}</b> ${incoming ? '나라가 제안했어요' : '나라에 보낸 제안'}
      ${o.counterOf ? '<span class="pill warn">↩️ 다시 온 제안</span>' : ''}</div>
    <div class="swap">
      <div><small>내가 받을 것 (수입)</small>${resChips(meGets)}</div>
      <div class="arrow">⇄</div>
      <div><small>내가 줄 것 (수출)</small>${resChips(meGives)}</div>
    </div>
    ${incoming ? `<div class="row">
        <button class="good grow" data-act="accept" data-id="${o.id}" ${lack || !canTrade() ? 'disabled' : ''}>✅ 수락</button>
        <button class="bad grow" data-act="reject" data-id="${o.id}">❌ 거절</button></div>
        <button class="ghost counter-btn" data-act="counter" data-id="${o.id}" ${canTrade() ? '' : 'disabled'}>↩️ 조건을 바꿔서 다시 제안하기</button>
        ${lack ? '<div class="muted" style="margin-top:6px">줄 자원이 모자라서 수락할 수 없어요. 조건을 바꿔서 다시 제안해 보세요.</div>' : ''}`
      : `<div class="row"><span class="pill warn">답을 기다리는 중</span><span class="grow"></span><button class="ghost small" data-act="cancel" data-id="${o.id}">제안 취소</button></div>`}
  </div>`;
}

function stepper(side, r) {
  const v = draft[side][r] || 0;
  const have = view.me.res[r] || 0;
  const max = side === 'give' ? have : 20;
  const target = countryOf(draft.to);
  const isGood = GOODS.includes(r);
  let hint = '';
  if (side === 'give') hint = `가진 것 ${have}개${isGood ? ` · 수출하면 ${won(GOODS_INFO[r].gdp, true)}` : ''}`;
  else if (isGood) hint = '공산품이에요';
  else if (target) hint = target.rich.includes(r) ? '이 나라에 많아요 👍' : target.poor.includes(r) ? '이 나라에 부족해요' : '';
  return `<div class="stepper ${isGood ? 'good-row' : ''}">
    <span class="ic">${ITEM_INFO[r].icon}</span>
    <span class="lb">${ITEM_INFO[r].name}<small>${hint}</small></span>
    <button data-act="step" data-side="${side}" data-res="${r}" data-d="-1" ${v <= 0 ? 'disabled' : ''}>−</button>
    <span class="v">${v}</span>
    <button data-act="step" data-side="${side}" data-res="${r}" data-d="1" ${v >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

function tradeTab() {
  const v = view;
  const incoming = v.offers.filter((o) => o.to === pid && o.status === 'pending');
  const outgoing = v.offers.filter((o) => o.from === pid && o.status === 'pending');
  const done = v.offers.filter((o) => o.status !== 'pending').slice(-5).reverse();
  const list = others();
  if (draft.to && !countryOf(draft.to)) draft.to = null;
  const target = countryOf(draft.to);
  const blocked = target && (v.me.enemies || []).includes(target.pid);
  const giveSum = RES.reduce((a, r) => a + draft.give[r], 0);
  const getSum = RES.reduce((a, r) => a + draft.get[r], 0);
  // 다시 제안하는 중인데 원래 제안이 끝났으면 일반 제안으로 돌아가요
  if (draft.counterOf && !incoming.some((o) => o.id === draft.counterOf)) draft.counterOf = null;
  const counting = !!draft.counterOf;
  const mode = counting || v.features?.aid === false ? 'trade' : draft.mode || 'trade';
  const lackGive = mode !== 'request' && ITEMS.some((r) => (draft.give[r] || 0) > (v.me.res[r] || 0));
  // 줄 것: 자원 5가지 + 가진 공산품만 / 받을 것: 자원 + 공산품 모두
  const goodsOn = v.features?.goods !== false;
  const giveList = ITEMS.filter((r) => RES.includes(r) || (goodsOn && (v.me.res[r] > 0 || draft.give[r] > 0)));
  const getList = ITEMS.filter((r) => RES.includes(r) || (goodsOn && ((v.goodsOpen || GOODS).includes(r) || draft.get[r] > 0)));
  const allowed = mode === 'trade' ? canTrade() : canAid();
  const ready = mode === 'trade' ? giveSum && getSum : mode === 'aid' ? giveSum : getSum;
  const TITLE = { trade: counting ? '↩️ 다시 제안하기' : '✉️ 무역 제안 보내기', aid: '🎁 원조 보내기', request: '🙏 도움 요청하기' };
  const SEND = { trade: counting ? '↩️ 다시 제안 보내기' : '📨 제안 보내기', aid: '🎁 원조 보내기', request: '🙏 도움 요청 보내기' };

  return `<div class="stack">
    ${missionCard(v.mission)}
    ${worldCard(v.world)}
    ${incoming.length ? `<h2>📩 받은 제안 ${incoming.length}개</h2>${incoming.map((o) => offerCard(o, true)).join('')}` : ''}
    <div class="card stack ${counting ? 'counter-form' : ''} mode-${mode}" id="tradeform">
      ${counting || v.features?.aid === false ? '' : `<div class="seg mode-seg">
        <button class="${mode === 'trade' ? 'on' : ''}" data-act="mode" data-v="trade">🤝 무역</button>
        <button class="${mode === 'aid' ? 'on' : ''}" data-act="mode" data-v="aid">🎁 원조 보내기</button>
        <button class="${mode === 'request' ? 'on' : ''}" data-act="mode" data-v="request">🙏 도움 요청</button></div>`}
      <h2>${TITLE[mode]}</h2>
      ${mode === 'aid' ? '<div class="banner info">🎁 대가 없이 자원을 나눠 주는 거예요. 자원이 부족한 친구 나라를 도우면 <b>세계 평화 점수</b>가 올라가요.</div>' : ''}
      ${mode === 'request' ? '<div class="banner info">🙏 꼭 필요한 자원이 없을 때, 그 자원이 많은 나라에 도움을 부탁해 보세요.</div>' : ''}
      ${counting ? `<div class="banner info">${flagSvg(target, 'inline')} <b>${esc(target.name)}</b> 나라의 제안을 불러왔어요. 원하는 대로 숫자를 바꾼 뒤 보내세요.
        <button class="ghost small" data-act="cancelcounter" style="margin-left:6px">그만두기</button></div>` : ''}
      ${!allowed ? `<div class="banner warn">${mode === 'trade' && v.tradeBan ? '지금은 무역 금지 시간이에요. 🎁 원조와 🙏 도움 요청은 할 수 있어요.' : '「무역·건설」 시간에 할 수 있어요.'}</div>` : ''}
      <h3>1. ${mode === 'trade' ? '어느 나라와 무역할까요?' : mode === 'aid' ? '어느 나라를 도와줄까요?' : '어느 나라에 부탁할까요?'}</h3>
      ${list.length ? `<div class="pick-country">${list.map((c) => `
        <button data-act="pick" data-v="${esc(c.pid)}" class="${draft.to === c.pid ? 'on' : ''}" style="border-bottom:6px solid ${esc(c.color)}">
          ${flagSvg(c, 'pick')}<span>${esc(c.name)}</span>
          <small>많음 ${icons(c.rich) || '?'} · 부족 ${icons(c.poor) || '?'}</small>
          ${c.atWar ? '<small class="war-mark">⚔️ 전쟁 중</small>' : ''}
        </button>`).join('')}</div>` : '<p class="muted">아직 다른 나라가 없어요.</p>'}
      ${target ? `
        ${blocked ? '<div class="banner bad">전쟁 중인 나라와는 무역·원조를 할 수 없어요.</div>' : ''}
        <div class="trade-cols ${mode !== 'trade' ? 'single' : ''}">
          ${mode !== 'request' ? `<div><h3>2. ${mode === 'aid' ? '보낼 것 🎁' : '내가 줄 것 = <span class="term">수출</span> 📤'}</h3><div class="stepper-list">${giveList.map((r) => stepper('give', r)).join('')}</div></div>` : ''}
          ${mode !== 'aid' ? `<div><h3>${mode === 'trade' ? '3. 내가 받을 것 = <span class="term">수입</span> 📥' : '2. 도움받고 싶은 것 📥'}</h3><div class="stepper-list">${getList.map((r) => stepper('get', r)).join('')}</div></div>` : ''}
        </div>
        <div class="card summary">
          ${flagSvg(target, 'inline')} <b>${esc(target.name)}</b>${mode === 'trade' ? `에게 <b>${resChips(draft.give)}</b> 주고 <b>${resChips(draft.get)}</b> 받기`
            : mode === 'aid' ? `에 <b>${resChips(draft.give)}</b> 보내 주기` : `에 <b>${resChips(draft.get)}</b> 도움 부탁하기`}
        </div>
        <div class="row">
          <button class="ghost" data-act="cleardraft">다시</button>
          <button class="good grow" data-act="sendoffer" style="font-size:1.3rem" ${!allowed || blocked || !ready || lackGive ? 'disabled' : ''}>${SEND[mode]}</button>
        </div>
        ${lackGive ? '<div class="banner warn">줄 자원이 모자라요. 숫자를 줄여 주세요.</div>' : ''}` : ''}
    </div>
    ${outgoing.length ? `<h2>⏳ 내가 보낸 제안</h2>${outgoing.map((o) => offerCard(o, false)).join('')}` : ''}
    ${done.length ? `<div class="card"><h3>이번 라운드 결과</h3>${done.map((o) => {
      const mine = o.from === pid;
      const other = countryOf(mine ? o.to : o.from) || { flag: '', name: '?' };
      if (o.kind === 'request') {
        const lbl = { accepted: '<span class="pill good">🎁 원조</span>', rejected: '<span class="pill">어려움</span>', expired: '<span class="pill">시간 끝</span>', cancelled: '<span class="pill">취소</span>' }[o.status] || '';
        return `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${lbl} 🙏 ${flagSvg(other, 'inline')} ${esc(other.name)} · ${mine ? '받은' : '보낸'} 도움 ${o.status === 'accepted' ? resChips(o.get) : '없음'}</div>`;
      }
      const label = { accepted: '<span class="pill good">성공</span>', rejected: '<span class="pill bad">거절</span>', expired: '<span class="pill">시간 끝</span>', cancelled: '<span class="pill">취소</span>', failed: '<span class="pill bad">실패</span>', countered: '<span class="pill warn">↩️ 다시 제안함</span>' }[o.status] || '';
      return `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${label} ${flagSvg(other, 'inline')} ${esc(other.name)} · 받은 것 ${resChips(mine ? o.get : o.give)} / 준 것 ${resChips(mine ? o.give : o.get)}</div>`;
    }).join('')}</div>` : ''}
  </div>`;
}

/* ---------- 세계 과제 카드 (무역 탭 맨 위) ---------- */
function wstepper(r, max) {
  const v = Math.min(wdraft[r] || 0, max);
  return `<div class="stepper">
    <span class="ic">${ITEM_INFO[r].icon}</span>
    <span class="lb">${ITEM_INFO[r].name}<small>가진 것 ${view.me.res[r] || 0}개</small></span>
    <button data-act="wstep" data-res="${r}" data-d="-1" data-max="${max}" ${v <= 0 ? 'disabled' : ''}>−</button>
    <span class="v">${v}</span>
    <button data-act="wstep" data-res="${r}" data-d="1" data-max="${max}" ${v >= max ? 'disabled' : ''}>+</button>
  </div>`;
}

// 🕵️ 비밀 임무 (우리 나라만 보여요)
function missionCard(m) {
  if (!m) return '';
  const pct = Math.round((m.now / m.goal) * 100);
  const nowTxt = m.money ? `${won(m.now)} / ${won(m.goal)}` : `${m.now} / ${m.goal}`;
  return `<div class="card mission-card ${m.done ? 'done' : ''}">
    <div class="m-hd"><span class="m-tag">🕵️ 비밀 임무</span><span class="muted">다른 나라에는 비밀!</span></div>
    <div class="m-body"><span class="m-icon">${m.icon}</span><b>${esc(m.text)}</b></div>
    <div class="m-bar"><i style="width:${pct}%"></i></div>
    <div class="m-foot">${m.done ? `✅ 성공! 1인당 GDP ${won(m.reward, true)}` : `${nowTxt} · 성공하면 1인당 GDP ${won(m.reward, true)}`}</div>
  </div>`;
}

function worldCard(w) {
  if (!w) return '';
  if (wdraftId !== w.id) { wdraftId = w.id; wdraft = {}; wOpen = false; }
  const me = view.me;
  const open = view.phase === 'trade' && !w.done;
  const flags = (pids) => pids.map((p) => countryOf(p)).filter(Boolean).map((c) => flagSvg(c, 'inline')).join(' ');
  if (w.type === 'project') {
    const mineTotal = Object.values(w.mine || {}).reduce((a, n) => a + n, 0);
    const room = Math.max(0, w.cap - mineTotal);
    const keys = Object.keys(w.need);
    const rows = keys.map((r) => {
      const max = Math.max(0, Math.min(w.need[r] - w.got[r], me.res[r] || 0, room));
      return wstepper(r, max);
    }).join('');
    const sumDraft = keys.reduce((a, r) => a + (wdraft[r] || 0), 0);
    return `<div class="card world-card project ${w.done ? (w.success ? 'ok' : 'fail') : ''}">
      <div class="row"><span class="wicon">${w.icon}</span><div class="grow">
        <div class="kicker">🤝 협동 프로젝트 · 함께 만들어요</div><h2 style="margin:0">${esc(w.name)}</h2></div>
        ${w.done ? `<span class="pill ${w.success ? 'good' : 'bad'}">${w.success ? '완성!' : '실패'}</span>` : ''}</div>
      <p style="margin:8px 0">${esc(w.desc)}</p>
      <div class="wneeds">${keys.map((r) => {
        const pct = Math.min(100, Math.round((w.got[r] / w.need[r]) * 100));
        return `<div class="wneed"><span>${ITEM_INFO[r].icon} ${ITEM_INFO[r].name}</span><div class="bar"><div style="width:${pct}%"></div></div><b>${w.got[r]}/${w.need[r]}</b></div>`;
      }).join('')}</div>
      <div class="muted" style="margin:6px 0">참여한 나라 ${w.helpers.length}/${w.minCountries} ${flags(w.helpers)} · 완성하면 참여한 나라 모두 1인당 GDP ${won(w.gdp, true)} · 한 나라는 ${w.cap}개까지 (우리 나라 ${mineTotal}개 보탬)</div>
      ${open ? (room ? `<button class="ghost wtoggle" data-act="wtoggle">${wOpen ? '▲ 접기' : '➕ 우리 나라 자원 보태기'}</button>
        ${wOpen ? `<div class="wform"><div class="stepper-list">${rows}</div>
        <button class="good" style="width:100%;margin-top:8px" data-act="contribute" ${sumDraft ? '' : 'disabled'}>🤝 보태기</button>
        <div class="muted" style="margin-top:6px">💾 반도체·🚗 자동차 같은 공산품이 필요하면 만들 수 있는 나라와 무역하거나 부탁해 보세요.</div></div>` : ''}`
        : '<div class="banner info">우리 나라는 보탤 만큼 다 보탰어요. 다른 나라에 함께하자고 말해 보세요!</div>') : ''}
    </div>`;
  }
  // 국제 입찰
  const sumDraft = w.res.reduce((a, r) => a + (wdraft[r] || 0), 0);
  const win = w.winner && countryOf(w.winner);
  return `<div class="card world-card bid ${w.done ? 'ok' : ''}">
    <div class="row"><span class="wicon">${w.icon}</span><div class="grow">
      <div class="kicker">🏗️ 국제 입찰 · 서로 겨뤄요</div><h2 style="margin:0">${esc(w.name)}</h2></div></div>
    <p style="margin:8px 0">${esc(w.desc)} 낙찰되면 1인당 GDP <b>${won(w.gdp, true)}</b>!</p>
    <div class="muted">입찰한 나라 ${w.count}개 · 얼마를 걸었는지는 마감 때 공개돼요. 진 나라는 건 자원을 돌려받아요.${me.tech ? ' 우리는 🔬 기술 나라라서 점수가 ' + w.techBonus + '배!' : ''}</div>
    ${w.done ? `<div class="banner ${win && w.winner === pid ? 'info' : 'warn'}" style="margin-top:8px">${win ? `🏆 낙찰: ${flagSvg(win, 'inline')} <b>${esc(win.name)}</b>` : '입찰한 나라가 없었어요.'}</div>`
      : w.mine ? `<div class="banner info" style="margin-top:8px">✅ 입찰했어요: <b>${resChips(w.mine)}</b>
          ${open ? '<button class="ghost small" data-act="cancelbid" style="margin-left:8px">입찰 취소</button>' : ''}</div>` : ''}
    ${open && !w.mine ? `<button class="ghost wtoggle" data-act="wtoggle">${wOpen ? '▲ 접기' : '✋ 입찰하기'}</button>
      ${wOpen ? `<div class="wform"><div class="stepper-list">${w.res.map((r) => wstepper(r, me.res[r] || 0)).join('')}</div>
      <button class="good" style="width:100%;margin-top:8px" data-act="bid" ${sumDraft ? '' : 'disabled'}>🏗️ 이 자원을 걸고 입찰하기</button></div>` : ''}` : ''}
  </div>`;
}

/* ---------- 공장: 원료로 공산품 만들기 ---------- */
function factoryCard(me) {
  return `<div class="card build-card factory">
    <h3>🏭 공장: 원료로 공산품 만들기 ${me.tech ? '<span class="pill tech-pill">🔬 기술 나라</span>' : ''}</h3>
    <div class="muted" style="margin-bottom:10px">원료를 가공해서 만든 공산품은 다른 나라에 <b>수출</b>하면 1인당 GDP가 크게 올라요.
      ${me.tech ? '우리는 <b>기술 나라</b>라서 원료가 덜 들어요!' : '🔬 기술 나라는 원료가 덜 들어요.'} 원료가 없으면 다른 나라에서 <b>수입</b>해 보세요.</div>
    <div class="goods-grid">${GOODS.map((g) => {
      const info = GOODS_INFO[g];
      const need = me.tech ? info.techRecipe : info.recipe;
      const ok = RES.every((r) => (me.res[r] || 0) >= (need[r] || 0));
      const have = me.res[g] || 0;
      // 아직 열리지 않은 공장은 잠겨 있어요
      if (view.goodsOpen && !view.goodsOpen.includes(g)) {
        return `<div class="good-card locked"><div class="gc-icon">🔒</div>
          <div class="gc-name">${info.icon} ${info.name}</div><div class="muted">${info.round}라운드에 열려요</div></div>`;
      }
      return `<div class="good-card">
        <div class="gc-icon">${info.icon}</div>
        <div class="gc-name">${info.name} <span class="muted">· 가진 것 ${have}</span></div>
        ${costHtml(need)}
        <div class="muted gc-val">수출 ${won(info.gdp, true)} · 세계 시장 ${won(GOODS_RULE.marketGdp, true)}</div>
        <button class="good" data-act="make" data-g="${g}" ${ok && canBuild() ? '' : 'disabled'}>🏭 만들기</button>
        <button class="ghost small" data-act="sell" data-g="${g}" ${have && canBuild() ? '' : 'disabled'}>🌐 세계 시장에 팔기</button>
      </div>`;
    }).join('')}</div>
  </div>`;
}

/* ---------- 건설 탭 ---------- */
function costHtml(cost) {
  return `<div class="cost">${RES.filter((r) => cost[r]).map((r) => {
    const lack = view.me.res[r] < cost[r];
    return `<span class="${lack ? 'lack' : ''}">${RES_INFO[r].icon} ${view.me.res[r]}/${cost[r]}</span>`;
  }).join('')}</div>`;
}

function buildTab() {
  const me = view.me;
  const next = UPGRADE_COST[me.stage + 1];
  const okNext = next && RES.every((r) => me.res[r] >= (next[r] || 0));
  const wsTotal = RES.reduce((a, r) => a + (me.workshops[r] || 0), 0);
  const okWs = RES.every((r) => me.res[r] >= (WORKSHOP.cost[r] || 0)) && wsTotal < WORKSHOP.max;
  return `<div class="stack">
    <div class="card territory-card">
      <h3>🗺️ ${esc(me.name)} 영토</h3>
      ${territorySvg(me)}
      ${facilityLegend(me)}
      <div class="muted" style="margin-top:8px;font-size:.9rem">시설 수 = 라운드마다 생산하는 자원 수. 발전하면 영토가 넓어지고 시설이 늘어나요.</div>
    </div>
    <div class="card build-card">
      <h3>우리 나라 발전 단계</h3>
      <div class="stage-track">${STAGES.map((s, i) => `<div class="${i <= me.stage ? 'done' : ''}"><span class="si">${s.icon}</span>${s.name}</div>`).join('')}</div>
    </div>
    ${next ? `<div class="card build-card">
      <h3>${STAGES[me.stage + 1].icon} ${josa(STAGES[me.stage + 1].name, '으로/로')} 발전하기</h3>
      <div>필요한 자원 (가진 것/필요한 것)</div>
      ${costHtml(next)}
      ${!okNext ? '<div class="muted" style="margin-bottom:10px">빨간 자원이 모자라요. 다른 나라와 무역해서 모아 보세요!</div>' : ''}
      <button class="good" style="width:100%;font-size:1.3rem" data-act="build" data-kind="stage" ${okNext && canBuild() ? '' : 'disabled'}>🏗️ 발전하기</button>
      <div class="muted" style="margin-top:8px">발전하면 라운드마다 생산하는 자원이 늘어나요.</div>
    </div>` : '<div class="card center"><h2>👑 제국 완성! 축하해요!</h2></div>'}
    ${view.features?.goods === false
      ? `<div class="card build-card locked"><h3>🔒 🏭 공장</h3><div class="muted">${view.round < 2 ? '2라운드부터 열려요. 지금은 무역에 집중해요!' : '이번 게임에서는 공장을 쓰지 않아요.'}</div></div>`
      : factoryCard(me)}
    <div class="card build-card">
      <h3>🛠️ 특산품 공방 (${wsTotal}/${WORKSHOP.max})</h3>
      <div>우리 나라에 많은 자원의 생산이 <b>+${WORKSHOP.bonus}</b> 늘어나요. 잘하는 것에 집중하는 <b>특화</b>예요!</div>
      ${costHtml(WORKSHOP.cost)}
      <div class="row wrap">${me.rich.map((r) => `<button class="grow" data-act="build" data-kind="workshop" data-res="${r}" ${okWs && canBuild() ? '' : 'disabled'}>${RES_INFO[r].icon} ${RES_INFO[r].name} 공방 짓기 ${me.workshops[r] ? `(${me.workshops[r]}개)` : ''}</button>`).join('')}</div>
    </div>
    <div class="card">
      <h3>📦 다음 라운드에 생산될 자원</h3>
      <div style="font-size:1.4rem;font-weight:800">${resChips(me.prod)}</div>
      ${!canBuild() ? '<div class="muted">건설은 「무역·건설」 시간에 할 수 있어요.</div>' : ''}
    </div>
  </div>`;
}

/* ---------- 나라들 탭 ---------- */
function priceBoard() {
  const ps = view.prices || [];
  const max = Math.max(1, ...ps.map((p) => p.rate));
  return `<div class="card"><h3>📊 시장 시세판</h3>
    <div class="muted" style="margin-bottom:8px">무역에서 1개를 주고 평균 몇 개를 받았는지예요. 많이 받을수록 사려는 나라가 많은 <b>귀한 자원</b>이에요.</div>
    ${ps.length ? ps.map((p) => `<div class="price-row"><span>${ITEM_INFO[p.r].icon} ${ITEM_INFO[p.r].name}</span>
      <div class="bar"><div style="width:${Math.round(p.rate / max * 100)}%"></div></div><b>×${p.rate}</b></div>`).join('') : '<p class="muted">아직 무역 기록이 없어요.</p>'}
  </div>`;
}

function nationsTab() {
  const tf = view.tariff;
  const tfc = tf && view.countries.find((c) => c.pid === tf.pid);
  return `<div class="stack">
    ${tfc ? `<div class="banner warn">🧱 관세: ${flagSvg(tfc, 'inline')} <b>${esc(tfc.name)}</b> 나라에 ${ITEM_INFO[tf.res].icon}${josa(ITEM_INFO[tf.res].name, '을/를')} 수출하면 이익이 줄어요. (${tf.until}라운드까지)</div>` : ''}
    ${priceBoard()}
    <div class="muted">어느 나라에 어떤 자원이 많은지 보고 무역 상대를 골라요.</div>
    ${view.countries.map((c) => `
    <div class="card nation" style="border-left-color:${esc(c.color)}">
      ${c.prod ? `<div class="nation-map">${territorySvg(c, { small: true })}</div>` : flagSvg(c, 'pick')}
      <div class="grow">
        <div class="nm">${flagSvg(c, 'inline')} ${esc(c.name)} ${c.pid === pid ? '<span class="pill">우리 나라</span>' : ''} ${c.tech ? '<span class="pill tech-pill">🔬 기술</span>' : ''} ${c.port ? '<span class="pill port-pill">⚓ 무역항</span>' : ''} ${c.online ? '' : '<span class="pill">연결 끊김</span>'}</div>
        <div>${STAGES[c.stage].icon} ${STAGES[c.stage].name} ${c.atWar ? '<span class="war-mark">⚔️ 전쟁 중</span>' : ''}</div>
        <div>많은 자원 <b>${icons(c.rich) || '-'}</b> · 부족한 자원 <b>${icons(c.poor) || '-'}</b></div>
        <div>💵 1인당 GDP <b>${won((c.gdp ?? 0))}</b>${c.aidGiven ? ` · 🎁 원조 ${c.aidGiven}회` : ''}</div>
      </div>
    </div>`).join('')}
    ${view.news?.length ? `<div class="card"><h3>📰 소식</h3>${view.news.slice().reverse().map((n) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${esc(n.text)}</div>`).join('')}</div>` : ''}
  </div>`;
}

/* ---------- 버튼 ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  switch (act) {
    case 'join': joinClick(); break;
    case 'changeroom': if (conn) conn.close(); conn = null; connStatus = 'idle'; screen = 'code'; render(); break;
    case 'flag': setup.flag = b.dataset.v; renderSetup(); break;
    case 'fpat': setup.design.p = b.dataset.v; renderSetup(); break;
    case 'fcol': setup.design.c[Number(b.dataset.i)] = b.dataset.v; renderSetup(); break;
    case 'create':
      if (!setup.name.trim()) return toast('나라 이름을 적어 주세요.', 'bad');
      store('tradeciv-setup', setup);
      send({ t: 'join', name: setup.name, flag: setup.flag, design: setup.design, color: nationColor(setup.design) });
      break;
    case 'editsetup': screen = 'setup'; renderSetup(); break;
    case 'howto': openStudentTutorial(practice ? realView : view, canPractice() && !practice); break;
    case 'practice': beginPractice(); break;
    case 'tab': tab = b.dataset.v; render(); window.scrollTo(0, 0); break;
    case 'pick': draft = { to: b.dataset.v, give: emptyRes(), get: emptyRes(), mode: draft.mode }; render(); break;
    case 'mode': draft = { to: draft.to, give: emptyRes(), get: emptyRes(), mode: b.dataset.v }; render(); break;
    case 'step': {
      const { side, res } = b.dataset;
      const max = side === 'give' ? (view.me.res[res] || 0) : 20;
      draft[side][res] = Math.max(0, Math.min(max, (draft[side][res] || 0) + Number(b.dataset.d)));
      render();
      break;
    }
    case 'cleardraft': draft = { to: draft.to, give: emptyRes(), get: emptyRes(), counterOf: draft.counterOf, mode: draft.mode }; render(); break;
    case 'sendoffer':
      if (draft.counterOf) {
        send({ t: 'counter', offerId: draft.counterOf, give: draft.give, get: draft.get });
        toast('↩️ 다시 제안했어요!', 'offer');
      } else if (draft.mode === 'aid') {
        send({ t: 'aid', to: draft.to, give: draft.give });
      } else if (draft.mode === 'request') {
        send({ t: 'request', to: draft.to, get: draft.get });
        toast('🙏 도움을 요청했어요!', 'offer');
      } else {
        send({ t: 'offer', to: draft.to, give: draft.give, get: draft.get });
        toast('📨 제안을 보냈어요!', 'offer');
      }
      draft = { to: draft.to, give: emptyRes(), get: emptyRes(), mode: draft.mode };
      render();
      break;
    case 'counter': {
      // 받은 제안을 거꾸로 채워 넣기: 상대가 달라던 것 = 내가 줄 것, 상대가 주겠다던 것 = 내가 받을 것
      const o = view.offers.find((x) => x.id === Number(b.dataset.id));
      if (!o) break;
      draft = { to: o.from, give: { ...o.get }, get: { ...o.give }, counterOf: o.id, mode: 'trade' };
      tab = 'trade';
      render();
      document.getElementById('tradeform')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'cancelcounter': draft = { to: draft.to, give: emptyRes(), get: emptyRes(), mode: 'trade' }; render(); break;
    case 'closecele': celebrate = null; render(); break;
    case 'closeann':
      if (crisisShow) { crisisShow = null; clearTimeout(crisisTimer); }
      else if (unlockShow) { unlockShow = null; clearTimeout(unlockTimer); }
      else if (worldShow) { worldShow = null; clearTimeout(worldTimer); }
      else { annShow = null; clearTimeout(annTimer); }
      render();
      break;
    case 'accept': send({ t: 'respond', offerId: Number(b.dataset.id), accept: true }); break;
    case 'reject': send({ t: 'respond', offerId: Number(b.dataset.id), accept: false }); break;
    case 'cancel': send({ t: 'cancel', offerId: Number(b.dataset.id) }); break;
    case 'build': send({ t: 'build', kind: b.dataset.kind, res: b.dataset.res }); break;
    case 'make': send({ t: 'make', product: b.dataset.g }); break;
    case 'sell': send({ t: 'sell', product: b.dataset.g }); break;
    case 'wstep': {
      const r = b.dataset.res;
      wdraft[r] = Math.max(0, Math.min(Number(b.dataset.max), (wdraft[r] || 0) + Number(b.dataset.d)));
      render();
      break;
    }
    case 'wtoggle': wOpen = !wOpen; render(); break;
    case 'contribute': send({ t: 'contribute', give: wdraft }); wdraft = {}; wOpen = false; render(); break;
    case 'bid': send({ t: 'bid', give: wdraft }); wdraft = {}; wOpen = false; render(); break;
    case 'cancelbid': send({ t: 'cancelbid' }); break;
    default: clickExtra?.(act, b);
  }
});

setInterval(() => {
  const el = $('#ptimer');
  if (el && view) el.textContent = fmtTime(remainingMs());
  tickExtra?.();
  updateHint();
}, 500);
let tickExtra = null;

/* ---------- 💡 가만히 있을 때: 다음에 할 일을 작게 알려 줘요 ---------- */
const IDLE_MS = 20000;
let lastAct = Date.now();
let hintEl = null;
let hintTab = null;
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('#hint')) { lastAct = Date.now(); hideHint(); } }, true);

function nextHint(v) {
  const me = v.me;
  const has = (cost) => Object.entries(cost || {}).every(([r, n]) => (me.res[r] || 0) >= n);
  const next = STAGES[me.stage + 1];
  const cost = UPGRADE_COST[me.stage + 1];
  if (next && cost && has(cost)) return { tab: 'build', text: `🏗️ 지금 <b>${next.icon} ${josa(next.name, '으로/로')} 발전</b>할 수 있어요! 「영토·건설」 탭을 눌러 봐요` };
  const goods = v.features?.goods ? (v.goodsOpen || []) : [];
  const makeable = goods.find((g) => has(me.tech ? GOODS_INFO[g].techRecipe : GOODS_INFO[g].recipe));
  if (makeable) return { tab: 'build', text: `🏭 공장에서 <b>${GOODS_INFO[makeable].icon} ${josa(GOODS_INFO[makeable].name, '을/를')}</b> 만들 수 있어요` };
  const owned = GOODS.find((g) => me.res[g] > 0);
  if (owned) return { tab: 'trade', text: `🚢 만든 <b>${GOODS_INFO[owned].icon} ${josa(GOODS_INFO[owned].name, '을/를')}</b> 다른 나라에 수출해 봐요 (GDP ${won(GOODS_INFO[owned].gdp, true)})` };
  if (v.mission && !v.mission.done) return { tab: 'trade', text: `🕵️ 비밀 임무: <b>${esc(v.mission.text)}</b>` };
  if (next && cost) {
    const lack = RES.filter((r) => (me.res[r] || 0) < (cost[r] || 0)).map((r) => `${RES_INFO[r].icon}${cost[r] - (me.res[r] || 0)}`);
    return { tab: 'trade', text: `💡 ${next.icon} ${next.name}까지 <b>${lack.join(' ')}</b> 더 필요해요. 「무역」으로 구해 봐요` };
  }
  return { tab: 'trade', text: '🤝 다른 나라에 무역을 제안해 봐요!' };
}

function hideHint() { if (hintEl) hintEl.className = ''; }
function updateHint() {
  const v = view;
  const ok = v?.me && !v.unknown && screen === 'game' && (v.phase === 'trade' || v.phase === 'prep')
    && !overlay.innerHTML.trim() && !document.getElementById('stut')?.innerHTML && Date.now() - lastAct > IDLE_MS;
  if (!ok) { hideHint(); return; }
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.id = 'hint';
    document.body.appendChild(hintEl);
    hintEl.addEventListener('click', () => {
      lastAct = Date.now(); hideHint();
      if (hintTab && tab !== hintTab) { tab = hintTab; render(); }
    });
  }
  const h = nextHint(v);
  hintTab = h.tab;
  if (hintEl.dataset.t !== h.text) { hintEl.dataset.t = h.text; hintEl.innerHTML = h.text; }
  hintEl.className = 'show';
}

/* ---------- 시작 ---------- */
export const api = {
  get view() { return view; }, get pid() { return pid; }, get receivedAt() { return receivedAt; }, send, render, toast,
  set onState(f) { onStateExtra = f; }, set overlay(f) { renderOverlayExtra = f; },
  set click(f) { clickExtra = f; }, set warTab(f) { warTab = f; },
  set tick(f) { tickExtra = f; },
};

import('./play-extras.js').then((m) => m.install(api)).catch(() => {}).finally(() => {
  if (room && params.get('room')) connect(room);
  else render();
});
