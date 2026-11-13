// 학생 화면 확장: 미니게임, 사건 카드, 결과 화면 (이후 전쟁이 붙습니다)
import { flagSvg } from './flag.js';
import { RES_INFO, STAGES, ITEM_INFO } from './config.js';
import { esc, fmtTime, resChips, josa, speak, won } from './ui.js';

let api;
const mg = { round: -1, idx: 0, fb: null };
const seenResult = new Set();

let warTarget = null;

export function install(a) {
  api = a;
  api.overlay = overlayHtml;
  api.warTab = warTab;
  api.click = onClick;
  api.tick = () => {
    const el = document.getElementById('mgtimer');
    const v = api.view;
    if (el && v) el.textContent = fmtTime(v.paused ? v.remaining : v.remaining - (Date.now() - (api.receivedAt || 0)));
  };
}

function remaining() {
  const t = document.getElementById('ptimer');
  return t ? t.textContent : '';
}

function overlayHtml(v) {
  if (!v || !v.me) return '';
  const m = v.minigame;
  if (warTarget && v.phase === 'trade') return warConfirmHtml(v);
  warTarget = null;
  if (v.phase === 'minigame' && m && !m.done) return minigameHtml(v, m);
  if (v.phase === 'event' && v.event) return eventHtml(v.event);
  if (v.phase === 'trade' && m && m.done && m.results && !seenResult.has(m.round)) return resultHtml(v, m);
  if (v.phase === 'end') return endHtml(v);
  return '';
}

/* ---------- 미니게임 ---------- */
function minigameHtml(v, m) {
  if (mg.round !== m.round) {
    mg.round = m.round;
    mg.fb = null;
    const given = m.my?.given || {};
    mg.idx = 0;
    while (given[mg.idx] !== undefined) mg.idx++;
  }
  const head = `<div class="row"><span style="font-size:2.4rem">${m.icon}</span>
    <div class="grow" style="text-align:left"><b style="font-size:1.4rem">${esc(m.title)}</b><div class="muted">${esc(m.intro)}</div></div>
    <b style="font-size:1.8rem" id="mgtimer">${remaining()}</b></div>`;
  const coop = m.coop ? `<div style="margin-top:8px;font-weight:800">🤝 모든 나라 정답 ${m.total} / 목표 ${m.goal}</div>
    <div class="bar"><div style="width:${Math.min(100, (m.total / Math.max(1, m.goal)) * 100)}%"></div></div>` : '';
  let body;
  if (mg.idx >= m.questions.length) {
    body = `<div style="font-size:4rem;margin-top:16px">🎉</div><h2>다 풀었어요!</h2>
      <p style="font-size:1.3rem">맞힌 문제 <b>${m.my?.correct ?? '…'}</b>개</p><p class="muted">시간이 끝나면 보상을 받아요.</p>`;
  } else {
    const q = m.questions[mg.idx];
    const ox = q.choices.length === 2 && q.choices.every((c) => c === 'O' || c === 'X');
    body = `<div class="muted" style="margin-top:10px">${mg.idx + 1} / ${m.questions.length}번 문제</div>
      <div class="q">${esc(q.q)}</div>
      <button class="ghost small speak-btn" data-act="speak">🔊 문제 읽어 주기</button>
      <div class="choices ${ox ? 'two' : q.choices.some((c) => c.length > 20) ? 'long' : ''}">${q.choices.map((c, i) => {
        let cls = '';
        if (mg.fb) { if (i === q.answer) cls = 'right'; else if (i === mg.fb.c) cls = 'wrong'; }
        return `<button data-act="mgans" data-i="${i}" class="${cls}" ${mg.fb ? 'disabled' : ''}>${esc(c)}</button>`;
      }).join('')}</div>
      <div class="explain">${mg.fb ? (mg.fb.right ? '⭕ 정답! ' : '❌ 아쉬워요. ') + esc(q.explain) : ''}</div>`;
  }
  return `<div class="overlay"><div class="sheet mg">${head}${coop}${body}</div></div>`;
}

function onClick(act, b) {
  const v = api.view;
  if (act === 'mgans') {
    const m = v?.minigame;
    if (!m || mg.fb || mg.idx >= m.questions.length) return;
    const i = Number(b.dataset.i);
    const q = m.questions[mg.idx];
    const right = i === q.answer;
    mg.fb = { c: i, right };
    api.send({ t: 'answer', qi: mg.idx, choice: i });
    api.render();
    setTimeout(() => { mg.idx++; mg.fb = null; api.render(); }, right ? (m.coop ? 500 : 900) : (m.coop ? 900 : 1800));
  } else if (act === 'reflect') {
    const answers = (v?.reflectQs || []).map((_, i) => document.getElementById(`rf${i}`)?.value || '');
    if (!answers.some((x) => x.trim())) return api.toast('한 가지 이상 써 주세요.', 'bad');
    api.send({ t: 'reflect', answers });
  } else if (act === 'speak') {
    const m = v?.minigame; const q = m?.questions?.[mg.idx];
    if (q && !speak(`${q.q}. ${q.choices.map((c, i) => `${i + 1}번, ${c}`).join('. ')}`)) api.toast('이 기기에서는 읽어 주기를 쓸 수 없어요.', 'bad');
  } else if (act === 'closeresult') {
    seenResult.add(Number(b.dataset.r));
    api.render();
  } else if (act === 'warpick') {
    warTarget = b.dataset.v;
    api.render();
  } else if (act === 'warcancel') {
    warTarget = null;
    api.toast('🕊️ 평화를 선택했어요. 무역으로 함께 발전해 봐요!', 'good');
    api.render();
  } else if (act === 'warconfirm') {
    api.send({ t: 'war', target: warTarget });
    warTarget = null;
    api.render();
  }
}

/* ---------- 전쟁 ---------- */
function warTab(v) {
  const me = v.me;
  const others = v.countries.filter((c) => c.pid !== api.pid);
  let block = '';
  if (v.warBan) block = '🕊️ 선생님이 전쟁을 금지했어요.';
  else if (v.phase !== 'trade') block = '전쟁은 「무역·건설」 시간에만 선포할 수 있어요.';
  else if (me.declaredThisRound) block = '이번 라운드에는 이미 전쟁을 선포했어요.';
  return `<div class="stack">
    <div class="card" style="border:4px solid var(--bad)">
      <h2>⚠️ 전쟁을 하면 어떻게 될까요?</h2>
      <div style="font-size:1.15rem;line-height:1.7">
        💥 <b>두 나라 모두</b> 가진 자원의 <b>40%</b>를 잃어요.<br>
        🌾 <b>2라운드 동안</b> 두 나라의 생산이 <b>절반</b>으로 줄어요.<br>
        🏆 이긴 나라도 상대 자원의 <b>10%</b>만 얻어요.<br>
        🚫 전쟁 중인 두 나라는 서로 <b>무역할 수 없어요</b>.<br>
        👀 다른 나라들에게 <b>⚔️ 전쟁 중</b> 표시가 보여요.
      </div>
    </div>
    ${block ? `<div class="banner warn">${block}</div>` : ''}
    ${others.map((c) => {
      const enemy = (me.enemies || []).includes(c.pid);
      return `<div class="card nation" style="border-left-color:${esc(c.color)}">
        ${flagSvg(c, 'pick')}
        <div class="grow"><div class="nm">${esc(c.name)}</div><div>${STAGES[c.stage].icon} ${STAGES[c.stage].name} ${c.atWar ? '<span class="war-mark">⚔️ 전쟁 중</span>' : ''}</div></div>
        <button class="bad" data-act="warpick" data-v="${esc(c.pid)}" ${block || enemy ? 'disabled' : ''}>${enemy ? '전쟁 중' : '⚔️ 선포'}</button>
      </div>`;
    }).join('')}
  </div>`;
}

function warConfirmHtml(v) {
  const t = v.countries.find((c) => c.pid === warTarget);
  if (!t) { warTarget = null; return ''; }
  const me = v.me;
  const lose = Object.fromEntries(Object.keys(me.res).map((r) => [r, Math.floor(me.res[r] * 0.4)]));
  return `<div class="overlay"><div class="sheet center stack">
    <div style="font-size:4rem">⚔️</div>
    <h2>정말 ${flagSvg(t, 'inline')} ${esc(josa(t.name, '과/와'))} 전쟁할까요?</h2>
    <p style="font-size:1.2rem">우리 나라도 자원을 잃어요: <b>${resChips(lose)}</b><br>2라운드 동안 생산이 절반이 되고, 이겨도 조금밖에 얻지 못해요.</p>
    <p class="muted">전쟁 대신 무역으로 필요한 자원을 얻을 수는 없을까요?</p>
    <button class="good" data-act="warcancel" style="width:100%;font-size:1.4rem;min-height:76px">🕊️ 그만두고 평화 선택</button>
    <button class="bad" data-act="warconfirm" style="width:100%">⚔️ 그래도 전쟁 선포</button>
  </div></div>`;
}

function resultHtml(v, m) {
  const mine = m.results.find((r) => r.pid === api.pid);
  const firstR = m.results.find((r) => r.first);
  const first = firstR && v.countries.find((c) => c.pid === firstR.pid);
  return `<div class="overlay"><div class="sheet center stack">
    <div style="font-size:3.5rem">${m.icon}</div>
    <h2>미니게임 결과</h2>
    ${m.coop ? `<h3>${m.success ? '🎉 협동 미션 성공! 모든 나라가 보상을 받아요.' : '😢 협동 미션 실패… 다음엔 함께 힘내요!'} (${m.total}/${m.goal})</h3>` : ''}
    ${mine && mine.reward ? `<p style="font-size:1.4rem">맞힌 문제 <b>${mine.correct}</b>개 → <b>${RES_INFO[mine.res].icon} ${RES_INFO[mine.res].name} +${mine.reward}</b>${mine.gdp ? `<br>💵 1인당 GDP <b style="color:var(--gold)">${won(mine.gdp, true)}</b>` : ''}</p>` : ''}
    ${mine && !mine.reward ? '<p style="font-size:1.3rem">이번에는 문제를 풀지 않아서 보상이 없어요. 다음엔 꼭 참여해요!</p>' : ''}
    ${first ? `<p>🥇 1등: ${flagSvg(first, 'inline')} ${esc(first.name)}</p>` : ''}
    <button class="good" data-act="closeresult" data-r="${m.round}" style="width:100%;font-size:1.3rem">🤝 무역·건설 하러 가기</button>
  </div></div>`;
}

/* ---------- 사건 카드 ---------- */
function eventHtml(e) {
  return `<div class="overlay"><div class="sheet event-card">
    <div class="ei">${e.icon}</div><h2>${esc(e.title)}</h2><p>${esc(e.desc)}</p>
    <p class="effect"><b>${esc(e.effect)}</b></p>
    <p class="muted">잠시 후 다음 라운드가 시작돼요.</p></div></div>`;
}

/* ---------- 게임 끝 ---------- */
// 우리 나라가 한 일을 교과서 낱말(수출·수입)로 정리
function tradeWords(me) {
  const top = (book) => Object.entries(book || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([r, n]) => `${ITEM_INFO[r].icon}${ITEM_INFO[r].name} ${n}개`).join(', ');
  const ex = top(me.exp); const im = top(me.imp);
  if (!ex && !im) return '';
  return `<div class="words-box">
    ${ex ? `<div>📤 우리 나라는 다른 나라에 <b>${ex}</b>를 팔았어요 → 이것을 <b class="term">수출</b>이라고 해요.</div>` : ''}
    ${im ? `<div>📥 다른 나라에서 <b>${im}</b>를 사 왔어요 → 이것을 <b class="term">수입</b>이라고 해요.</div>` : ''}
    ${me.made ? `<div>🏭 원료로 공산품을 <b>${me.made}개</b> 만들었어요 → 원료를 수입해 상품을 만들어 수출하는 우리나라 무역과 닮았어요.</div>` : ''}
    <div class="muted">교과서 94쪽 「세계 속의 무역」에서 더 알아봐요!</div>
  </div>`;
}
function endHtml(v) {
  const me = v.me;
  const list = [...v.countries].sort((a, b) => (b.gdp ?? 0) - (a.gdp ?? 0));
  const myBadges = (v.badges || []).filter((b) => b.pid === me.pid);
  return `<div class="overlay"><div class="sheet center stack">
    <div style="font-size:4rem">🏁</div><h2>게임이 끝났어요!</h2>
    ${myBadges.length ? `<div class="my-badge"><div class="kicker">우리 나라 칭찬 배지 ${myBadges.length > 1 ? `${myBadges.length}개` : ''}</div>
      <div class="my-badge-list">${myBadges.map((b) => `<div><div class="b-icon">${b.icon}</div>
        <div class="b-title">${esc(b.title)}</div><div class="b-text">${esc(b.text)}</div></div>`).join('')}</div></div>` : ''}
    <p style="font-size:1.4rem">${flagSvg(me, 'inline')} <b>${esc(josa(me.name, '은/는'))}</b> <b>${STAGES[me.stage].icon} ${STAGES[me.stage].name}</b>까지 발전했어요.</p>
    <p style="font-size:1.3rem">💵 우리 나라 1인당 GDP <b style="color:var(--gold)">${won((me.gdp ?? 0))}</b></p>
    <p>🤝 무역 ${me.trades}번 ${me.aidGiven ? `· 🎁 원조 ${me.aidGiven}번` : ''} ${me.wars ? `· ⚔️ 전쟁 ${me.wars}번` : ''}</p>
    ${tradeWords(me)}
    ${v.reflectQs ? (v.reflected
      ? '<div class="banner info">💬 되돌아보기를 보냈어요. 선생님 화면에서 친구들의 생각과 함께 볼 수 있어요!</div>'
      : `<div class="reflect-form"><h3>💬 되돌아보기</h3>
        ${v.reflectQs.map((q, i) => `<label>${i + 1}. ${esc(q)}<textarea id="rf${i}" rows="2" maxlength="300" placeholder="생각을 짧게 써 봐요"></textarea></label>`).join('')}
        <button class="good" data-act="reflect" style="width:100%">📨 선생님께 보내기</button></div>`) : ''}
    <div style="text-align:left">${list.map((c, i) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)">${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${flagSvg(c, 'inline')} <b>${esc(c.name)}</b> — 💵 ${won((c.gdp ?? 0))} · ${STAGES[c.stage].icon} ${STAGES[c.stage].name}${(() => { const bs = (v.badges || []).filter((x) => x.pid === c.pid); return bs.length ? ` · ${bs.map((b) => b.icon).join('')}` : ''; })()}</div>`).join('')}</div>
    <p class="muted">무역으로 서로 도운 덕분에 함께 발전할 수 있었나요? 선생님 화면을 보며 이야기해 봐요.</p>
  </div></div>`;
}
