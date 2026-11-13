// 🧪 직접 해 보는 연습 (학생 태블릿 안에서만 돌아가요. 진짜 게임에는 아무 영향이 없어요)
// 로봇 나라 2곳과 진짜 화면 그대로 ① 무역 제안 보내기 → ② 받은 제안 수락하기 → ③ 발전하기 를 해 봐요.
import { Game, newGameState } from './game.js';
import { RES, RES_INFO, UPGRADE_COST, STAGES } from './config.js';
import { josa } from './ui.js';

const BOTS = [
  { pid: 'bot1', name: '연습나라1', flag: '⭐', design: { p: 'h3', c: ['#5b8def', '#ffffff', '#5b8def'] } },
  { pid: 'bot2', name: '연습나라2', flag: '🌙', design: { p: 'v3', c: ['#2fa36b', '#ffd23f', '#2fa36b'] } },
];
const chip = (r) => `${RES_INFO[r].icon}${RES_INFO[r].name}`;

export function startPractice({ pid, me, deliver, toast, onEnd, onComplete }) {
  const state = newGameState('practice');
  state.settings.features = {
    minigame: false, events: false, goods: false, world: false, aid: false, war: false,
    mission: false, unlock: false, sound: false, studentSound: false,
  };
  state.announceOn = false;
  let ready = false, stopped = false, queued = false;
  let step = 0;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => { if (!stopped) fn(); }, ms));

  const game = new Game(state, {
    onChange() {
      if (!ready || queued) return;
      queued = true;
      setTimeout(() => { queued = false; if (stopped) return; deliver(game.viewFor(pid)); check(); }, 30);
    },
    notify(p, text, kind) { if (ready && p === pid) toast(text, kind); },
  });

  // 나라 만들기: 나 + 로봇 2곳
  game.join(pid, { name: me.name, flag: me.flag, design: me.design, color: me.color });
  for (const b of BOTS) game.join(b.pid, b);
  for (const p of [pid, ...BOTS.map((b) => b.pid)]) game.approve(p);
  game.start();
  const c = game.c(pid);
  // 진짜 게임에서 정해진 자원이 있으면 그대로 써요
  if (me.rich?.length) { c.rich = [...me.rich]; c.poor = [...me.poor]; }
  for (const r of RES) c.res[r] = c.rich.includes(r) ? 5 : c.poor.includes(r) ? 0 : 2;
  for (const b of BOTS) {
    const x = game.c(b.pid);
    // 로봇 나라에는 우리 나라에 없는 자원이 많고, 우리 나라에 많은 자원이 없어요 → 서로 필요해요!
    x.rich = c.poor.length ? [...c.poor] : [RES[0]]; x.poor = [...c.rich]; x.tech = false; x.port = false;
    for (const r of RES) x.res[r] = 8;
  }
  c.tech = false; c.port = false;
  state.offers = [];
  state.log = [];
  state.phaseEndsAt = Date.now() + 20 * 60 * 1000; // 연습은 시간 제한 없이
  const myRich = c.rich[0] || RES[0];
  const myPoor = c.poor[0] || RES.find((r) => !c.rich.includes(r)) || RES[1];

  /* ---------- 코치 안내 ---------- */
  const STEPS = [
    {
      title: '① 무역 제안 보내기',
      html: `<ol>
        <li>아래 <b>「🤝 무역」</b> 탭에서 <b>⭐ 연습나라1</b>을 눌러요.</li>
        <li><b>줄 것</b>: 우리 나라에 많은 <b>${josa(chip(myRich), '을/를')}</b> ＋로 1개</li>
        <li><b>받을 것</b>: 우리 나라에 없는 <b>${josa(chip(myPoor), '을/를')}</b> ＋로 1개</li>
        <li><b>📨 제안 보내기</b>를 눌러요!</li></ol>`,
      done: () => state.offers.some((o) => o.from === pid && o.status === 'accepted'),
    },
    {
      title: '② 받은 제안 수락하기',
      html: `<p><b>🌙 연습나라2</b>가 우리 나라에 제안을 보냈어요.</p>
        <p>화면 위쪽 <b>📩 받은 제안</b>에서 무엇을 주고받는지 보고 <b>✅ 수락</b>을 눌러요.</p>
        <p class="muted">(진짜 게임에서는 마음에 안 들면 ❌ 거절하거나 ↩️ 다시 제안할 수 있어요)</p>`,
      done: () => state.offers.some((o) => o.from === 'bot2' && o.to === pid && o.status === 'accepted'),
    },
    {
      title: '③ 발전하기',
      html: `<p>무역으로 자원을 모았어요! (연습이라 조금 더 넣어 줬어요)</p>
        <p>아래 <b>「🗺️ 영토·건설」</b> 탭에서 <b>${STAGES[1].icon} ${josa(STAGES[1].name, '으로/로')} 발전하기</b>를 눌러요.</p>`,
      done: () => c.stage >= 1,
    },
    {
      title: '🎉 연습 끝!',
      html: `<p>무역 보내기, 제안 수락하기, 발전하기를 모두 해 봤어요.</p>
        <p>진짜 게임에서도 <b>없는 자원은 무역으로</b> 구하고, <b>모아서 발전</b>하면 돼요!</p>`,
      done: () => false,
    },
  ];

  const coach = document.createElement('div');
  coach.id = 'coach';
  document.body.appendChild(coach);
  coach.addEventListener('click', (e) => {
    const b = e.target.closest('[data-coach]');
    if (!b) return;
    if (b.dataset.coach === 'stop' || b.dataset.coach === 'finish') stop();
    if (b.dataset.coach === 'min') coach.classList.toggle('min');
  });
  function drawCoach() {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    coach.className = last ? 'done' : coach.classList.contains('min') ? 'min' : '';
    coach.innerHTML = `<div class="coach-top"><span class="coach-tag">🧪 연습 중 · 진짜 게임에는 영향 없어요</span>
        <span class="coach-prog">${STEPS.slice(0, -1).map((_, i) => `<i class="${i < step ? 'ok' : i === step ? 'on' : ''}"></i>`).join('')}</span>
        ${last ? '' : '<button class="ghost small" data-coach="min" aria-label="안내 접기">▾</button>'}</div>
      <h3>${s.title}</h3><div class="coach-body">${s.html}</div>
      <div class="coach-foot">${last
        ? '<button class="good" data-coach="finish">✓ 진짜 게임으로 돌아가기</button>'
        : '<button class="ghost small" data-coach="stop">연습 그만하기</button>'}</div>`;
  }

  // 단계 시작할 때 할 일
  function enter(k) {
    step = k;
    drawCoach();
    if (k === 1) later(sendBotOffer, 900);
    if (k === 2) {
      for (const [r, n] of Object.entries(UPGRADE_COST[1] || {})) c.res[r] = Math.max(c.res[r] || 0, n);
      game.changed();
    }
    if (k === 3) { toast('🎉 연습 완료! 잘했어요!', 'good'); onComplete?.(); }
  }
  function sendBotOffer() {
    if ((c.res[myRich] || 0) < 1) c.res[myRich] = 1;
    game.offer('bot2', pid, { [myPoor]: 2 }, { [myRich]: 1 });
  }

  function check() {
    if (stopped) return;
    // 로봇은 받은 제안을 잠깐 뒤에 수락해요
    for (const o of state.offers) {
      if (o.status !== 'pending' || o.from !== pid || o.botSeen) continue;
      o.botSeen = true;
      later(() => {
        if (o.status !== 'pending') return;
        const err = game.respond(o.to, o.id, true);
        if (err) { o.status = 'rejected'; game.changed(); toast('🤖 연습나라에 그 자원이 모자라요. 다시 해 볼까요?', 'bad'); }
      }, 1300);
    }
    // 로봇 제안을 거절했으면 다시 보내요
    if (step === 1 && !state.offers.some((o) => o.from === 'bot2' && o.status === 'pending')
      && state.offers.some((o) => o.from === 'bot2' && o.status === 'rejected') && !STEPS[1].done()) {
      toast('거절도 할 수 있어요! 이번에는 ✅ 수락을 눌러 볼까요?', 'info');
      for (const o of state.offers) if (o.from === 'bot2' && o.status === 'rejected') o.status = 'expired';
      later(sendBotOffer, 1200);
    }
    if (step < STEPS.length - 1 && STEPS[step].done()) later(() => enter(step + 1), 700);
  }

  // 학생 화면에서 보낸 행동을 연습 게임이 받아요
  function handle(msg) {
    let err = null;
    switch (msg.t) {
      case 'offer': err = game.offer(pid, msg.to, msg.give, msg.get); break;
      case 'respond': err = game.respond(pid, msg.offerId, !!msg.accept); break;
      case 'cancel': err = game.cancelOffer(pid, msg.offerId); break;
      case 'counter': err = game.counter(pid, msg.offerId, msg.give, msg.get); break;
      case 'build': err = game.build(pid, msg.kind, msg.res); break;
      case 'hello': case 'join': break;
      default: err = '연습에서는 무역과 발전만 해 볼 수 있어요.';
    }
    if (err) toast('⚠️ ' + err, 'bad');
    return true;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    coach.remove();
    onEnd?.();
  }

  ready = true;
  enter(0);
  deliver(game.viewFor(pid));
  return { handle, stop, get step() { return step; }, game };
}
