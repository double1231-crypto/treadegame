// 선생님 화면 확장: 미니게임, 사건 카드 (이후 전쟁·통계가 붙습니다)
import { flagSvg } from './flag.js';
import { RES, RES_INFO, STAGES, WAR, GDP, PEACE } from './config.js';
import { EVENTS } from './events.js';
import { resText } from './game.js';
import { esc, toast, josa, won } from './ui.js';
import { installWorld, handleWorld } from './world.js';
import { installFun } from './fun.js';
import { ITEMS, ITEM_INFO, GOODS, QSETS } from './config.js';

const QS = {};  // 문제 세트들 (questions*.json)
const curQ = () => QS[G?.s.settings?.qset] || QS.nature || null; // 지금 고른 문제 세트
let G = null;   // Game

const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function install(register) {
  register({ init, handle, render });
}

async function init(game) {
  G = game;
  // 문제 세트를 모두 읽어 두고, 선생님 설정에 따라 골라 써요
  for (const [key, def] of Object.entries(QSETS)) {
    try {
      const res = await fetch(def.file, { cache: 'no-store' });
      QS[key] = await res.json();
    } catch (e) {
      if (key === 'nature') toast(`${def.file} 을 읽지 못했어요.`, 'bad', 8000);
    }
  }
  game.startMinigame = startMinigame;
  game.finishMinigame = finishMinigame;
  game.minigameView = minigameView;
  game.runEvent = runEvent;
  game.tradesThisRound = (c) => game.s.offers.filter((o) => o.status === 'accepted' && o.kind !== 'request' && o.round === game.s.round && (o.from === c.pid || o.to === c.pid)).length;
  game.s.wars ||= [];
  game.warBetween = (a, b) => enemiesOf(a).includes(b.pid);
  game.enemiesOf = enemiesOf;
  installWorld(game);
  installFun(game);
}

function handle(pid, msg) {
  const wr = handleWorld(pid, msg);
  if (wr !== undefined) return wr;
  if (msg.t === 'answer') return answer(pid, msg);
  if (msg.t === 'war') return declareWar(pid, msg.target);
  return null;
}

/* ---------------- 전쟁 ---------------- */
// 지금 나와 전쟁 중인 나라들 (선포한 라운드 + 2라운드 동안)
function enemiesOf(c) {
  const s = G.s;
  return (s.wars || [])
    .filter((w) => s.round <= w.round + WAR.halfRounds && (w.a === c.pid || w.b === c.pid))
    .map((w) => (w.a === c.pid ? w.b : w.a));
}

function declareWar(pid, target) {
  const s = G.s;
  const a = G.c(pid); const b = G.c(target);
  if (s.warBan) return '선생님이 전쟁을 금지했어요.';
  if (!G.can('war')) return G.lockedMsg('war');
  if (s.phase !== 'trade') return '전쟁은 무역·건설 시간에만 선포할 수 있어요.';
  if (!a || !b || a === b || !b.approved) return '상대 나라를 다시 골라 주세요.';
  if ((s.wars || []).some((w) => w.a === pid && w.round === s.round)) return '한 라운드에 한 번만 선포할 수 있어요.';
  if (enemiesOf(a).includes(b.pid)) return '이미 그 나라와 전쟁 중이에요.';

  // 1) 양쪽 모두 자원 40% 손실
  const loss = (c) => { const out = {}; for (const r of RES) { out[r] = Math.floor(c.res[r] * WAR.lossRate); c.res[r] -= out[r]; } return out; };
  const lossA = loss(a); const lossB = loss(b);
  // 2) 승부: 발전 단계 + 남은 철·목재 + 운
  const power = (c) => (c.stage + 1) * 5 + Math.floor(c.res.iron / 2) + Math.floor(c.res.wood / 3) + Math.floor(Math.random() * 6);
  const pa = power(a); const pb = power(b);
  const [win, lose] = pa > pb ? [a, b] : [b, a]; // 같으면 지키는 나라 승리
  // 3) 승자는 진 나라 남은 자원의 10%만 가져감
  const loot = {};
  for (const r of RES) { loot[r] = Math.floor(lose.res[r] * WAR.lootRate); lose.res[r] -= loot[r]; win.res[r] += loot[r]; }
  // 4) 2라운드 생산 반감 + 전쟁국 표시
  a.warUntil = b.warUntil = s.round + WAR.halfRounds;
  a.wars++; b.wars++; a.warsDeclared = (a.warsDeclared || 0) + 1;
  for (const o of s.offers) if (o.status === 'pending' && ((o.from === a.pid && o.to === b.pid) || (o.from === b.pid && o.to === a.pid))) o.status = 'cancelled';
  s.wars.push({ round: s.round, a: a.pid, b: b.pid, winner: win.pid, lossA, lossB, loot, time: Date.now() });

  const lootTxt = resText(loot);
  G.addLog('war', `⚔️ ${a.flag}${a.name} 나라가 ${b.flag}${b.name} 나라에 전쟁을 선포! 두 나라 모두 자원 40%를 잃었어요. 승리: ${win.flag}${win.name} (얻은 것 ${lootTxt}) · 세계 평화 ${PEACE.war}`);
  G.changePeace(PEACE.war, 'war');
  for (const c of G.list) {
    if (c === a || c === b) continue;
    G.notify(c.pid, `⚔️ ${a.name} 나라가 ${b.name} 나라에 전쟁을 선포했어요!`, 'bad');
  }
  const msg = (me, other, myLoss) => `⚔️ ${other.name} 나라와 전쟁! 잃은 자원 ${resText(myLoss)}. ${win === me ? `이겼지만 얻은 것은 ${lootTxt}뿐이에요.` : '졌어요.'} 2라운드 동안 생산이 절반이에요.`;
  G.notify(a.pid, msg(a, b, lossA), 'bad');
  G.notify(b.pid, msg(b, a, lossB), 'bad');
  G.changed();
  return null;
}

/* ---------------- 미니게임 ---------------- */
function normQ(q) {
  if (!q || !q.q || !Array.isArray(q.choices) || q.choices.length < 2) return null;
  const orig = q.choices.map(String);
  let ai = orig.indexOf(String(q.answer));
  if (ai < 0 && Number.isInteger(q.answer) && q.answer < orig.length) ai = q.answer;
  if (ai < 0) { console.warn('정답이 보기에 없어요:', q); return null; }
  // 보기 순서를 섞어요 (정답이 늘 1번에 있지 않게). O/X 문제는 O, X 순서 그대로.
  const isOX = orig.length === 2 && orig.every((c) => /^\s*[OXㅇ×⭕❌]/.test(c));
  const choices = isOX ? orig : shuffle(orig);
  const answer = choices.indexOf(orig[ai]);
  return { q: String(q.q), choices, answer, explain: q.explain ? String(q.explain) : '' };
}

// 지금 게임 속 나라로 "누가 수출할까?" 문제 만들기
function exportQs() {
  const cs = G.list.filter((c) => c.approved && c.rich.length);
  const out = [];
  for (const r of shuffle(RES)) {
    const rich = cs.filter((c) => c.rich.includes(r));
    const others = cs.filter((c) => !c.rich.includes(r));
    if (!rich.length || !others.length) continue;
    const right = shuffle(rich)[0];
    const opts = shuffle([right, ...shuffle(others).slice(0, 2)]);
    const choices = opts.map((c) => `${c.flag} ${c.name}`);
    out.push({
      q: `우리 게임에서 ${RES_INFO[r].icon}${josa(RES_INFO[r].name, '이/가')} 많이 나서\n수출하기 좋은 나라는?`,
      choices, answer: opts.indexOf(right),
      explain: `${right.name} 나라는 ${josa(RES_INFO[r].name, '이/가')} 풍부해요. 무역 상대로 기억해 두세요!`,
    });
    if (out.length >= 2) break;
  }
  return out;
}

function startMinigame() {
  const Q = curQ();
  if (!Q?.games?.length) return false;
  const s = G.s;
  const def = Q.games[(s.round - 1) % Q.games.length];
  const st = Q.settings || {};
  const coop = def.type === 'coop';
  let qs = (def.questions || []).map(normQ).filter(Boolean);
  if (coop) qs = shuffle(qs);
  else {
    const n = st.questionsPerGame || 4;
    const dyn = def.type === 'export' ? exportQs() : [];
    qs = shuffle([...dyn, ...shuffle(qs).slice(0, Math.max(0, n - dyn.length))]);
  }
  if (!qs.length) return false;
  const count = G.list.filter((c) => c.approved).length;
  s.minigame = {
    round: s.round, type: def.type, icon: def.icon || '🎯', title: def.title || '미니게임', intro: def.intro || '',
    questions: qs, answers: {}, total: 0, coop,
    goal: coop ? (def.goalPerCountry || 4) * count : 0, reward: def.reward || 3,
    done: false, results: null, success: false,
  };
  G.addLog('mg', `🎯 미니게임: ${s.minigame.title}`);
  return true;
}

function answer(pid, msg) {
  const s = G.s; const m = s.minigame;
  if (s.phase !== 'minigame' || !m || m.done) return null;
  const qi = Number(msg.qi); const choice = Number(msg.choice);
  if (!Number.isInteger(qi) || qi < 0 || qi >= m.questions.length) return null;
  const a = (m.answers[pid] ||= { given: {}, correct: 0, n: 0, at: 0 });
  if (a.given[qi] !== undefined) return null;
  a.given[qi] = choice;
  a.n++;
  if (choice === m.questions[qi].answer) {
    a.correct++;
    a.at = Date.now();
    if (m.coop) m.total++;
  }
  G.changed();
  return null;
}

function finishMinigame() {
  const m = G.s.minigame;
  if (!m || m.done || m.round !== G.s.round) return;
  const st = curQ()?.settings || {};
  const base = st.baseReward ?? 1; const per = st.perCorrect ?? 1; const bonus = st.firstBonus ?? 2;
  const cs = G.list.filter((c) => c.approved);
  let first = null;
  if (!m.coop) {
    for (const c of cs) {
      const a = m.answers[c.pid];
      if (a && a.correct > 0 && (!first || a.correct > first.a.correct || (a.correct === first.a.correct && a.at < first.a.at))) first = { c, a };
    }
  }
  m.success = m.coop && m.total >= m.goal;
  m.results = cs.map((c) => {
    const a = m.answers[c.pid];
    const joined = a && a.n > 0;
    let reward = 0;
    if (joined) reward += m.coop ? base : base + a.correct * per;
    const isFirst = !!first && first.c === c;
    if (isFirst) reward += bonus;
    if (m.success) reward += m.reward;
    const r = c.rich[0];
    c.res[r] += reward;
    c.mgCorrect = (c.mgCorrect || 0) + (a?.correct || 0);
    // 1인당 GDP: 정답 수만큼 + 1등 보너스 + 협동 성공 보너스
    const gdp = (a?.correct || 0) * GDP.perCorrect + (isFirst ? GDP.firstBonus : 0) + (m.success ? GDP.coopBonus : 0);
    if (gdp) G.addGdp(c, gdp);
    if (reward || gdp) G.notify(c.pid, `🎯 미니게임 보상: ${RES_INFO[r].icon}${RES_INFO[r].name} +${reward}${gdp ? ` · 1인당 GDP ${won(gdp, true)}` : ''}`, 'good');
    return { pid: c.pid, correct: a?.correct || 0, n: a?.n || 0, reward, res: r, first: isFirst, gdp };
  });
  m.done = true;
  let text = `🎯 「${m.title}」 끝!`;
  if (m.coop) text += m.success ? ` 협동 성공 (${m.total}/${m.goal})! 모든 나라 보상` : ` 협동 아쉽게 실패 (${m.total}/${m.goal})`;
  if (first) text += ` 1등: ${first.c.flag}${first.c.name} (${first.a.correct}개)`;
  G.addLog('mg', text);
}

function minigameView(pid) {
  const s = G.s; const m = s.minigame;
  if (!m || m.round !== s.round) return null;
  const { answers, ...rest } = m;
  return { ...rest, my: answers[pid] || null };
}

/* ---------------- 사건 카드 ---------------- */
function runEvent() {
  const s = G.s;
  let pool = EVENTS.filter((e) => !s.usedEvents.includes(e.id));
  if (!pool.length) { s.usedEvents = []; pool = EVENTS; }
  const e = pool[Math.floor(Math.random() * pool.length)];
  s.usedEvents.push(e.id);
  const effect = e.apply(G);
  s.event = { id: e.id, icon: e.icon, title: e.title, desc: e.desc, effect, round: s.round };
  G.addLog('event', `${e.icon} 사건 카드 「${e.title}」: ${effect}`);
  return true;
}

/* ---------------- 선생님 화면 그리기 ---------------- */
function render(kind, game, ...args) {
  switch (kind) {
    case 'phase': return phasePanel(game);
    case 'card': return cardExtra(game, args[0]);
    case 'switches':
      return `<label class="switch ${game.s.warBan ? 'on' : ''}"><input type="checkbox" data-act="warban" ${game.s.warBan ? 'checked' : ''}>🕊️ 전쟁 금지</label>`;
    case 'change':
      if (args[0] === 'warban') {
        game.s.warBan = args[1].checked;
        game.addLog('system', game.s.warBan ? '🕊️ 선생님이 전쟁을 금지했어요.' : '⚔️ 전쟁 금지가 풀렸어요.');
        game.changed();
      }
      return '';
    case 'end': return endStats(game);
    default: return '';
  }
}

/* ---------------- 게임 끝 통계 ---------------- */
function endStats(g) {
  const cs = g.list.filter((c) => c.approved);
  const R = g.s.round;
  const trades = g.s.offers.filter((o) => o.status === 'accepted' && o.kind !== 'request').length;
  const aids = cs.reduce((a, c) => a + (c.aidGiven || 0), 0);
  const wars = (g.s.wars || []).length;
  const rows = [...cs].sort((a, b) => g.score(b) - g.score(a));
  const peace = Math.round(g.s.peace ?? PEACE.start);
  return `
  <div class="card center"><h1>🏁 게임 결과</h1>
    <div class="row wrap" style="justify-content:center;gap:12px;font-size:1.3rem">
      <span class="pill" style="font-size:1.2rem">🤝 전체 무역 ${trades}회</span>
      <span class="pill good" style="font-size:1.2rem">🎁 전체 원조 ${aids}회</span>
      <span class="pill ${wars ? 'bad' : 'good'}" style="font-size:1.2rem">⚔️ 전체 전쟁 ${wars}회</span>
      <span class="pill ${peace < PEACE.crisisBelow ? 'bad' : 'good'}" style="font-size:1.2rem">🕊️ 세계 평화 ${peace}점</span>
    </div></div>
  ${textbookLinks(g, cs)}
  <div class="card chart-wrap"><h2>📈 나라별 1인당 GDP 그래프</h2>
    <div class="muted">1인당 GDP는 라운드마다(발전할수록 더 많이), 무역에 성공할 때, 미니게임 문제를 맞힐 때 올라가요.</div>
    ${lineChart(cs, R)}
    <div class="legend">${cs.map((c) => `<span><i style="background:${esc(c.color)}"></i>${flagSvg(c, 'inline')} ${esc(c.name)}</span>`).join('')}</div>
  </div>
  <div class="card"><h2>📊 나라별 기록</h2>
    <table class="stats-table">
      <tr><th>순위</th><th>나라</th><th>💵 1인당 GDP</th><th>발전 단계</th><th>🤝 무역</th><th>🎁 원조(보냄/받음)</th><th>⚔️ 전쟁(선포)</th><th>🎯 정답</th></tr>
      ${rows.map((c, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${flagSvg(c, 'inline')} <b>${esc(c.name)}</b></td><td><b>${won(g.score(c))}</b></td>
        <td>${STAGES[c.stage].icon} ${STAGES[c.stage].name}</td>
        <td>${c.trades}회</td><td>${c.aidGiven || 0} / ${c.aidGot || 0}</td><td>${c.wars}회 (${c.warsDeclared || 0})</td><td>${c.mgCorrect || 0}개</td></tr>`).join('')}
    </table>
    <p style="font-size:1.1rem;margin-top:14px">💬 <b>함께 이야기해요:</b> 무역과 원조를 많이 한 나라와 전쟁을 한 나라는 1인당 GDP가 어떻게 달랐나요? 세계 평화 점수가 낮아졌을 때 모든 나라에 어떤 일이 생겼나요?</p>
  </div>`;
}

/* ---------------- 게임 → 교과서 낱말 연결 (94~111쪽 「세계 속의 무역」 도입) ---------------- */
const itemStr = (r, n) => `${ITEM_INFO[r].icon}${ITEM_INFO[r].name} ${n}개`;
const topOf = (book, k = 2) => Object.entries(book || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, k);
const sumBook = (book) => Object.values(book || {}).reduce((a, n) => a + n, 0);

function textbookLinks(g, cs) {
  const name = (c) => `${flagSvg(c, 'inline')} <b>${esc(c.name)}</b>`;
  const cards = [];
  const add = (icon, fact, word, page, meaning) => cards.push({ icon, fact, word, page, meaning });

  // 수입: 가장 많이 사 온 나라
  const imp = [...cs].sort((a, b) => sumBook(b.imp) - sumBook(a.imp))[0];
  if (imp && sumBook(imp.imp)) {
    const [r, n] = topOf(imp.imp, 1)[0];
    add('📥', `${name(imp)} 나라는 다른 나라에서 ${itemStr(r, n)}를 사 왔어요.`, '수입', '96쪽', '다른 나라에서 물자나 서비스를 사 오는 것');
  }
  // 수출: 가장 많이 판 나라
  const exp = [...cs].sort((a, b) => sumBook(b.exp) - sumBook(a.exp))[0];
  if (exp && sumBook(exp.exp)) {
    const [r, n] = topOf(exp.exp, 1)[0];
    add('📤', `${name(exp)} 나라는 다른 나라에 ${itemStr(r, n)}를 팔았어요.`, '수출', '96쪽', '다른 나라에 물자나 서비스를 파는 것');
  }
  // 무역하는 까닭: 부족한 자원을 무역으로 구함
  const needy = cs.map((c) => ({ c, n: (c.poor || []).reduce((a, r) => a + (c.imp?.[r] || 0), 0) })).sort((a, b) => b.n - a.n)[0];
  if (needy && needy.n) {
    const r = needy.c.poor.find((x) => needy.c.imp?.[x]) || needy.c.poor[0];
    add('🌏', `${name(needy.c)} 나라에는 ${ITEM_INFO[r].icon}${josa(ITEM_INFO[r].name, '이/가')} 나지 않아서, 무역으로만 구할 수 있었어요.`, '무역이 이루어지는 까닭', '97~99쪽', '나라마다 자연환경, 자원, 자본, 기술 등에 차이가 있어요');
  }
  // 가공 무역: 원료로 공산품을 만들어 수출
  const maker = cs.map((c) => ({ c, n: GOODS.reduce((a, gk) => a + (c.exp?.[gk] || 0), 0) })).sort((a, b) => b.n - a.n)[0];
  if (maker && maker.n) {
    const gk = GOODS.find((x) => maker.c.exp?.[x]);
    add('🏭', `${name(maker.c)} 나라는 원료를 모아 ${ITEM_INFO[gk].icon}${josa(ITEM_INFO[gk].name, '을/를')} 만들어 수출했어요${maker.c.tech ? ' (🔬 기술 나라)' : ''}.`, '원료를 수입해 상품을 만들어 수출', '100~101쪽', '우리나라처럼 천연자원은 부족해도 기술로 상품을 만들어 수출해요');
  }
  const wl = g.s.worldLog || [];
  // 상호 의존: 협동 프로젝트
  const proj = wl.filter((x) => x.type === 'project' && x.success);
  if (proj.length) {
    const p = proj[proj.length - 1];
    add('🤝', `${p.countries.length}개 나라가 가진 것을 모아 ${p.icon}${esc(josa(p.name.replace(' 만들기', ''), '을/를'))} 만들었어요.`, '상호 의존', '106쪽', '여러 나라가 서로 필요한 것을 주고받으며 기대어 살아가요');
  }
  // 경쟁: 국제 입찰
  const bid = wl.filter((x) => x.type === 'bid' && x.winner);
  if (bid.length) {
    const b = bid[bid.length - 1]; const w = g.c(b.winner);
    add('🏗️', `${b.count}개 나라가 ${b.icon}${esc(josa(b.name, '을/를'))} 두고 겨뤄서 ${w ? name(w) : '한'} 나라가 맡았어요.`, '경쟁', '107쪽', '더 많은 이익을 얻으려고 여러 나라가 서로 겨뤄요');
  }
  // 무역이 막히면?
  const wars = (g.s.wars || []).length;
  if (wars || g.s.crisisMsg) {
    add('📉', `${wars ? `전쟁이 ${wars}번 일어나 무역이 막혔고` : '세계 평화가 무너지자'} ${g.s.crisisMsg ? '세계대공황으로 모든 나라의 생산이 줄었어요.' : '전쟁한 나라들의 생산이 줄었어요.'}`, '상호 의존', '106쪽', '한 나라의 어려움이 다른 나라에도 영향을 줘요');
  }

  const rows = cs.map((c) => `<tr><td>${name(c)}${c.tech ? ' <span class="pill">🔬</span>' : ''}</td>
    <td>${topOf(c.exp).map(([r, n]) => `${ITEM_INFO[r].icon}${n}`).join(' ') || '-'}</td><td>${sumBook(c.exp)}</td>
    <td>${topOf(c.imp).map(([r, n]) => `${ITEM_INFO[r].icon}${n}`).join(' ') || '-'}</td><td>${sumBook(c.imp)}</td></tr>`).join('');

  return `<div class="card links-card">
    <div class="kicker">교과서 94~111쪽 「세계 속의 무역」으로 이어져요</div>
    <h2>📚 우리가 게임에서 한 일 → 교과서 낱말</h2>
    ${cards.length ? `<div class="links">${cards.map((k) => `<div class="link">
      <div class="lk-icon">${k.icon}</div>
      <div class="lk-fact">${k.fact}</div>
      <div class="lk-arrow">→</div>
      <div class="lk-word"><b>${esc(k.word)}</b><small>${esc(k.meaning)} · ${k.page}</small></div></div>`).join('')}</div>`
      : '<p class="muted">무역 기록이 적어서 연결할 장면이 없어요. 다음에는 무역을 더 많이 해 봐요!</p>'}
    <h3 style="margin-top:18px">🚢 나라별 주요 수출품·수입품 <span class="muted" style="font-weight:400;font-size:.9rem">(교과서 100쪽 「우리나라의 주요 수입품과 수출품」처럼)</span></h3>
    <table class="stats-table"><tr><th>나라</th><th>📤 주요 수출품</th><th>수출 합계</th><th>📥 주요 수입품</th><th>수입 합계</th></tr>${rows}</table>
  </div>`;
}

function lineChart(cs, R) {
  const W = 900, H = 340, L = 50, Rt = 130, T = 20, B = 40;
  const rounds = Math.max(1, R);
  const vals = cs.flatMap((c) => c.history.filter((v) => v != null));
  const max = Math.max(10, ...vals);
  const yMax = max > 200 ? Math.ceil(max / 1000) * 1000 : Math.ceil(max / 10) * 10;
  const x = (i) => L + (i / rounds) * (W - L - Rt);
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  let grid = '';
  for (let v = 0; v <= yMax; v += yMax / 5) {
    grid += `<line x1="${L}" x2="${W - Rt}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
      <text x="${L - 8}" y="${y(v) + 5}" text-anchor="end" font-size="14" fill="#9aa6bc">${Math.round(v)}</text>`;
  }
  for (let i = 0; i <= rounds; i++) {
    grid += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="14" fill="#9aa6bc">${i === 0 ? '시작' : i + 'R'}</text>`;
  }
  // 줄 끝 이름표가 겹치지 않게 조금씩 띄우기
  const ends = cs.map((c) => { const h = c.history; let i = h.length - 1; while (i > 0 && h[i] == null) i--; return { c, i, v: h[i] ?? 0, ly: y(h[i] ?? 0) }; })
    .sort((a, b) => a.ly - b.ly);
  for (let k = 1; k < ends.length; k++) if (ends[k].ly - ends[k - 1].ly < 22) ends[k].ly = ends[k - 1].ly + 22;
  const lines = cs.map((c) => {
    const pts = c.history.map((v, i) => (v == null ? null : [x(i), y(v), v, i])).filter(Boolean);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${esc(c.color)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${esc(c.color)}" stroke="#0d1526" stroke-width="2"><title>${esc(c.name)} · ${p[3] ? p[3] + '라운드' : '시작'}: ${won(p[2])}</title></circle>`).join('')}`;
  }).join('');
  // 나라가 많으면 줄 끝 이름표 대신 아래 범례만 써요 (겹치지 않게)
  const labels = cs.length > 10 ? '' : ends.map((e) => `<text x="${x(e.i) + 12}" y="${e.ly + 5}" font-size="15" font-weight="700" fill="#f2f5fb">${esc(e.c.name)} ${won(e.v)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="나라별 발전 점수 그래프">${grid}${lines}${labels}</svg>`;
}

function cardExtra(g, c) {
  const m = g.s.minigame;
  if (g.s.phase !== 'minigame' || !m || m.round !== g.s.round) return '';
  const a = m.answers[c.pid];
  return `<div class="pill ${a ? 'good' : ''}" style="margin-top:6px">✏️ ${a ? `${a.n}문제 풀이 · 정답 ${a.correct}` : '아직 안 풀었어요'}</div>`;
}

function phasePanel(g) {
  const s = g.s; const m = s.minigame;
  if (s.phase === 'prep') {
    return `<div class="card"><h2>🧭 준비 시간</h2>
      <div class="banner info" style="margin:0 0 10px">⛵ 고려 시대 벽란도에는 송나라부터 아라비아까지 여러 나라 상인이 모였어요. 오늘 우리 반 바다에도 ${g.list.length}개 나라가 모였어요!
        ${g.list.some((c) => c.port) ? `<br>⚓ 무역항 나라: ${g.list.filter((c) => c.port).map((c) => esc(c.flag + c.name)).join(', ')} (다른 나라끼리 무역할 때마다 수수료를 받아요)` : ''}</div>
      <div style="font-size:1.15rem">① 내 나라의 <b style="color:var(--good)">풍부한 자원</b>과 <b style="color:var(--bad)">부족한 자원</b>을 확인해요.<br>
      ② 「나라들」 탭에서 어느 나라에 어떤 자원이 많은지 살펴봐요.<br>
      ③ 「영토·건설」 탭에서 다음 단계에 필요한 자원과 🏭 공장(공산품)을 살펴봐요. 🔬 기술 나라는 적은 원료로 공산품을 만들어요.<br>
      라운드마다: 자원 생산 → 미니게임 1분 → 무역·건설 3분 30초 → 사건 카드<br>
      🤝 2·5라운드: 협동 프로젝트 · 🏗️ 3·6라운드: 국제 입찰</div></div>`;
  }
  if (s.phase === 'trade' && s.world && s.world.round === s.round) {
    const top = worldPanel(g, s.world);
    const mg = m && m.done && m.round === s.round ? mgResultPanel(g, m) : '';
    return top + mg;
  }
  if (s.phase === 'minigame' && m) {
    const done = g.list.filter((c) => m.answers[c.pid]).length;
    return `<div class="card center"><div style="font-size:3.5rem">${m.icon}</div><h2 style="font-size:2rem">${esc(m.title)}</h2>
      <div style="font-size:1.2rem">${esc(m.intro)}</div>
      ${m.coop ? coopBar(m) : `<div class="muted" style="margin-top:8px">참여한 나라 ${done}/${g.list.length}</div>`}</div>`;
  }
  if (s.phase === 'trade' && m && m.done && m.round === s.round) return mgResultPanel(g, m);
  if (s.phase === 'event' && s.event) {
    const e = s.event;
    return `<div class="card event-card"><div class="ei">${e.icon}</div><h2>사건 카드: ${esc(e.title)}</h2>
      <p>${esc(e.desc)}</p><p><b>${esc(e.effect)}</b></p></div>`;
  }
  return '';
}

// 선생님 화면: 협동 프로젝트 진행 / 국제 입찰 참여 현황 (입찰 금액은 마감 전까지 비밀)
function worldPanel(g, w) {
  const flags = (pids) => pids.map((p) => g.c(p)).filter(Boolean).map((c) => flagSvg(c, 'inline')).join(' ');
  if (w.type === 'project') {
    const bars = Object.keys(w.need).map((r) => {
      const pct = Math.min(100, Math.round((w.got[r] / w.need[r]) * 100));
      return `<div class="wneed"><span>${ITEM_INFO[r].icon} ${ITEM_INFO[r].name}</span><div class="bar"><div style="width:${pct}%"></div></div><b>${w.got[r]}/${w.need[r]}</b></div>`;
    }).join('');
    const helpers = Object.keys(w.by);
    return `<div class="card world-card project ${w.done ? (w.success ? 'ok' : 'fail') : ''}">
      <div class="row"><span class="wicon">${w.icon}</span><div class="grow"><div class="kicker">🤝 협동 프로젝트 · 상호 의존</div><h2 style="margin:0">${esc(w.name)}</h2>
      <div class="muted">${esc(w.desc)} ${w.minCountries}개 나라 이상이 힘을 모아야 해요. (한 나라는 ${w.cap}개까지)</div></div>
      ${w.done ? `<span class="pill ${w.success ? 'good' : 'bad'}">${w.success ? '완성!' : '실패'}</span>` : ''}</div>
      <div class="wneeds">${bars}</div>
      <div style="margin-top:6px">참여한 나라 (${helpers.length}/${w.minCountries}) ${flags(helpers)}</div></div>`;
  }
  const bidders = Object.keys(w.bids);
  const win = w.winner && g.c(w.winner);
  return `<div class="card world-card bid ${w.done ? 'ok' : ''}">
    <div class="row"><span class="wicon">${w.icon}</span><div class="grow"><div class="kicker">🏗️ 국제 입찰 · 경쟁</div><h2 style="margin:0">${esc(w.name)}</h2>
    <div class="muted">${esc(w.desc)} 걸 수 있는 자원: ${w.res.map((r) => ITEM_INFO[r].icon + ITEM_INFO[r].name).join(', ')} · 낙찰되면 1인당 GDP ${won(w.gdp, true)}</div></div></div>
    <div style="margin-top:8px;font-size:1.1rem">${win ? `🏆 낙찰: ${flagSvg(win, 'inline')} <b>${esc(win.name)}</b>` : `입찰한 나라 <b>${bidders.length}</b>개 ${flags(bidders)} <span class="muted">(얼마를 걸었는지는 마감 때 공개)</span>`}</div></div>`;
}

function mgResultPanel(g, m) {
  const parts = m.results.map((r) => {
    const c = g.c(r.pid); if (!c) return '';
    return `<span class="pill ${r.first ? 'warn' : ''}">${r.first ? '🥇' : ''}${flagSvg(c, 'inline')} ${esc(c.name)} 정답 ${r.correct} → ${RES_INFO[r.res].icon}+${r.reward}${r.gdp ? ` · 💵${won(r.gdp, true)}` : ''}</span>`;
  }).join(' ');
  return `<div class="card"><b>${m.icon} 미니게임 결과</b> ${m.coop ? (m.success ? '<span class="pill good">협동 성공!</span>' : '<span class="pill bad">협동 실패</span>') : ''}
    <div class="row wrap" style="margin-top:8px;gap:6px">${parts}</div></div>`;
}

export function coopBar(m) {
  const pct = Math.min(100, Math.round((m.total / Math.max(1, m.goal)) * 100));
  return `<div style="margin-top:10px;font-size:1.3rem;font-weight:800">함께 맞힌 정답 ${m.total} / 목표 ${m.goal}</div>
    <div class="mg"><div class="bar"><div style="width:${pct}%"></div></div></div>`;
}
