// 📖 학생 각자 튜토리얼 (태블릿에서 혼자 넘겨 봐요)
// - 처음 들어오면 한 번 자동으로 떠요. 화면 위 「📖 방법」으로 언제든 다시 볼 수 있어요.
// - 선생님이 「📱 태블릿에서 각자 보기」를 누르면 모두의 태블릿에 다시 떠요.
import { RES_INFO, STAGES, GDP, UNLOCK, FEATURE_INFO } from './config.js';
import { flagSvg } from './flag.js';
import { esc, won } from './ui.js';

let box = null;
let slides = [];
let idx = 0;

function chips(list, cls) {
  return list.map((r) => `<span class="st-chip ${cls}">${RES_INFO[r].icon} ${RES_INFO[r].name}</span>`).join('');
}

let allowPractice = false;
let practiceHandler = null;
export function onPractice(fn) { practiceHandler = fn; }

function build(v) {
  const me = v.me;
  const on = v.on || {};
  const S = [];
  S.push({ icon: '👋', title: `${esc(me.name)} 나라의 대표가 되었어요!`, body: `
    <div class="st-flag">${flagSvg(me, 'big')}</div>
    <p class="st-lead">다른 나라와 <b>무역</b>해서 우리 나라를 <b>발전</b>시켜요.</p>
    <p class="st-box">💵 <b>1인당 GDP</b>가 우리 나라 점수예요.<br>처음에는 ${won(GDP.start)}에서 시작해요.</p>` });

  S.push({ icon: '🪨', title: '우리 나라 자원', body: me.rich?.length ? `
    <div class="st-row"><b class="st-good">많아요 👍</b><div>${chips(me.rich, 'good')}</div></div>
    <div class="st-row"><b class="st-bad">없어요 😢</b><div>${chips(me.poor, 'bad')}</div></div>
    <p class="st-lead">없는 자원은 <b>무역</b>으로만 구할 수 있어요!</p>
    <p class="muted">화면 위 자원 칸에서 <b class="st-good">초록 = 많은 것</b>, <b class="st-bad">빨강 = 없는 것</b>이에요.</p>` : `
    <p class="st-lead">게임이 시작되면 나라마다<br><b class="st-good">많은 자원(초록)</b>과 <b class="st-bad">없는 자원(빨강)</b>이 정해져요.</p>
    <p>없는 자원은 <b>무역</b>으로만 구할 수 있어요!</p>` });

  S.push({ icon: '🤝', title: '무역은 3단계', body: `
    <ol class="st-steps">
      <li><span>1</span><div><b>「🤝 무역」 탭</b>에서<br>무역할 나라를 골라요</div></li>
      <li><span>2</span><div><b>줄 것</b>과 <b>받을 것</b>의<br>개수를 정해요</div></li>
      <li><span>3</span><div><b>📨 제안 보내기</b>!<br>상대가 ✅ 수락하면 성공</div></li>
    </ol>
    <p class="st-box">🎉 무역에 성공하면 두 나라 모두 1인당 GDP ${won(GDP.trade, true)}</p>
    <p class="muted">제안을 받으면 ✅ 수락 / ❌ 거절 / ↩️ 조건 바꿔 다시 제안</p>` });

  S.push({ icon: '🏗️', title: '모아서 발전해요', body: `
    <div class="st-stages">${STAGES.map((s, i) => `${i ? '<i>→</i>' : ''}<div><span>${s.icon}</span>${s.name}</div>`).join('')}</div>
    <p class="st-lead">자원이 다 모이면<br><b>「🗺️ 영토·건설」 탭 → 발전하기</b></p>
    <p class="muted">발전할수록 자원이 더 많이 나오고, GDP도 더 많이 벌어요.</p>` });

  if (on.minigame) S.push({ icon: '🎯', title: '미니게임', body: `
    <p class="st-lead">라운드가 시작될 때마다<br><b>사회 문제</b>가 나와요.</p>
    <p class="st-box">맞히면 <b>자원</b>과 <b>1인당 GDP</b>를 받아요!</p>
    <p class="muted">🔊 버튼을 누르면 문제를 읽어 줘요.</p>` });

  if (on.mission) S.push({ icon: '🕵️', title: '비밀 임무', body: `
    <p class="st-lead">라운드마다 우리 나라만 아는<br><b>비밀 임무</b>가 생겨요.</p>
    <div class="st-mission">🕵️ 예) 무역 3번 성공하기 <i style="width:66%"></i></div>
    <p class="st-box">「🤝 무역」 탭 맨 위 보라색 카드를 봐요. 성공하면 ${won(100, true)}!</p>` });

  const later = Object.entries(UNLOCK).filter(([f]) => on[f]);
  if (later.length) S.push({ icon: '🔓', title: '새 기능은 천천히 열려요', body: `
    <p class="st-lead">처음에는 <b>무역</b>만 잘하면 돼요!</p>
    <div class="st-unlock">${later.map(([f, r]) => `<div><b>${FEATURE_INFO[f].icon} ${FEATURE_INFO[f].name}</b><small>${on.unlock ? `${r}라운드부터` : '처음부터'}</small></div>`).join('')}</div>
    <p class="muted">새 기능이 열리면 화면에 안내가 떠요.</p>` });

  S.push({ icon: '🚀', title: allowPractice ? '이제 직접 해 볼까요?' : '준비 끝!', body: `
    ${allowPractice ? `<p class="st-lead">🤖 연습나라와 <b>진짜 화면 그대로</b><br>무역하고 발전해 봐요!</p>
      <button class="good st-practice" data-st="practice">🧪 직접 해 보기 (연습)</button>
      <p class="muted">연습은 내 태블릿에서만 해요. 진짜 게임에는 영향이 없어요.</p>`
      : '<p class="st-lead">서로 돕는 나라가 함께 발전해요. 🤝</p>'}
    <p class="st-box">헷갈리면 화면 위 <b>📖 방법</b> 버튼을 눌러<br>언제든 다시 볼 수 있어요.</p>` });
  return S;
}

function show() {
  const s = slides[idx];
  const last = idx === slides.length - 1;
  box.className = 'stut-wrap';
  box.innerHTML = `<div class="stut-sheet" role="dialog" aria-label="게임 방법">
    <div class="stut-top"><span>📖 게임 방법 ${idx + 1} / ${slides.length}</span><button class="ghost small" data-st="skip">건너뛰기 ✕</button></div>
    <div class="stut-icon">${s.icon}</div>
    <h2 class="stut-title">${s.title}</h2>
    <div class="stut-body">${s.body}</div>
    <div class="stut-dots">${slides.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</div>
    <div class="stut-nav">
      <button class="ghost" data-st="prev" ${idx === 0 ? 'disabled' : ''}>◀ 이전</button>
      <button class="good" data-st="next">${last ? '시작하기 ✓' : '다음 ▶'}</button>
    </div></div>`;
}

export function closeStudentTutorial() {
  if (!box) return;
  box.className = ''; box.innerHTML = '';
}
export function studentTutorialOpen() { return !!box?.innerHTML; }

export function openStudentTutorial(v, canPractice = false) {
  if (!v?.me) return;
  allowPractice = !!canPractice && !!practiceHandler;
  if (!box) {
    box = document.createElement('div');
    box.id = 'stut';
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-st]');
      if (!b || b.disabled) return;
      const a = b.dataset.st;
      if (a === 'skip') return closeStudentTutorial();
      if (a === 'practice') { closeStudentTutorial(); practiceHandler?.(); return; }
      if (a === 'prev' && idx > 0) idx--;
      else if (a === 'next') { if (idx >= slides.length - 1) return closeStudentTutorial(); idx++; }
      show();
    });
    // 손가락으로 옆으로 밀어서 넘기기
    let x0 = null;
    box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 60) return;
      if (dx < 0 && idx < slides.length - 1) idx++;
      else if (dx > 0 && idx > 0) idx--;
      else return;
      show();
    });
  }
  slides = build(v);
  idx = 0;
  show();
}
