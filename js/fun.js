// 재미 요소: 🕵️ 비밀 임무, 🎤 라운드 하이라이트, 🏅 칭찬 배지 (선생님 PC에서 계산)
import { ITEMS, ITEM_INFO, STAGES, GDP_COMPARE } from './config.js';
import { won, josa } from './ui.js';

let G = null;
const sum = (book) => Object.values(book || {}).reduce((a, n) => a + (n || 0), 0);

export function installFun(game) {
  G = game;
  game.funStart = funStart;
  game.funEnd = funEnd;
  game.funTrade = funTrade;
  game.funCheck = funCheck;
  game.missionView = missionView;
  game.funBadges = computeBadges;
  game.gdpLike = gdpLike;
}

/* ================= 🌍 비슷한 나라 (1인당 GDP) ================= */
function likeIndex(score) {
  let k = 0;
  GDP_COMPARE.forEach((x, i) => { if (score >= x.at) k = i; });
  return k;
}
function gdpLike(c) {
  const i = likeIndex(G.score(c));
  const next = GDP_COMPARE[i + 1];
  return { name: GDP_COMPARE[i].name, korea: !!GDP_COMPARE[i].korea, next: next ? { name: next.name, at: next.at } : null };
}
// 새 단계를 넘으면 알려 줘요 (매번이 아니라 단계마다 한 번)
function checkLike(c) {
  const i = likeIndex(G.score(c));
  if (c.likeIdx == null) { c.likeIdx = i; return; }
  if (i <= c.likeIdx) return;
  c.likeIdx = i;
  const x = GDP_COMPARE[i];
  const msg = x.korea
    ? `🎉 우와! 우리 나라 1인당 GDP가 ${won(x.at)}을 넘어 대한민국과 비슷해졌어요!`
    : `🌍 우리 나라 1인당 GDP가 ${won(x.at)}을 넘었어요. 이제 ${josa(x.name, '과/와')} 비슷해요!`;
  G.notify(c.pid, msg, 'good');
  G.addLog('like', `🌍 ${c.flag}${c.name} 나라의 1인당 GDP가 ${josa(x.name, '과/와')} 비슷해졌어요! (${won(x.at)} 넘음)`);
  c.likeMsg = { id: G.s.nextId++, name: x.name, at: x.at, korea: !!x.korea, time: Date.now() };
}

/* ================= 🕵️ 비밀 임무 ================= */
export const MISSION_REWARD = 100; // 성공하면 1인당 GDP +100만 원
const MISSIONS = [
  { id: 'trade3', icon: '🤝', text: '무역 3번 성공하기', goal: 3, prog: (c, s) => c.trades - s.trades },
  { id: 'partners2', icon: '🌐', text: '서로 다른 나라 2곳과 무역하기', goal: 2, ok: () => G.list.length >= 3, prog: (c) => (c.partnersR || []).length },
  { id: 'import5', icon: '📥', text: '다른 나라에서 자원·상품 5개 이상 사 오기(수입)', goal: 5, prog: (c, s) => sum(c.imp) - s.imp },
  { id: 'export5', icon: '📤', text: '다른 나라에 자원·상품 5개 이상 팔기(수출)', goal: 5, prog: (c, s) => sum(c.exp) - s.exp },
  { id: 'gdp300', icon: '💵', text: `1인당 GDP ${won(300)} 넘게 올리기`, goal: 300, money: true, prog: (c, s) => G.score(c) - s.gdp },
  { id: 'build1', icon: '🏗️', text: '발전하거나 공방 짓기', goal: 1, prog: (c, s) => (c.builds || 0) - s.builds },
  { id: 'aid1', icon: '🎁', text: '다른 나라에 원조 1번 보내기', goal: 1, ok: () => G.can('aid'), prog: (c, s) => (c.aidGiven || 0) - s.aid },
  { id: 'make1', icon: '🏭', text: '공장에서 공산품 1개 만들기', goal: 1, ok: () => G.can('goods'), prog: (c, s) => (c.made || 0) - s.made },
];
const MDEF = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

function snapshot(c) {
  return {
    gdp: G.score(c), trades: c.trades || 0, aid: c.aidGiven || 0, mg: c.mgCorrect || 0, made: c.made || 0,
    builds: c.builds || 0, stage: c.stage, imp: sum(c.imp), exp: sum(c.exp),
  };
}

// 라운드 시작: 기록을 찍어 두고, 비밀 임무를 나눠 줘요
function funStart(r) {
  const s = G.s;
  s.bestTrade = null;
  const pool = MISSIONS.filter((m) => !m.ok || m.ok());
  G.list.forEach((c, i) => {
    c.snap = snapshot(c);
    c.partnersR = [];
    c.mission = null;
    if (G.on('mission') && pool.length) {
      // 지난 라운드와 같은 임무는 피해요
      const choices = pool.filter((m) => m.id !== c.lastMission);
      const m = choices[(r * 7 + i * 3 + Math.floor(Math.random() * choices.length)) % choices.length];
      c.mission = { id: m.id, round: r, done: false };
      c.lastMission = m.id;
    }
  });
}

function progressOf(c) {
  const m = c.mission && MDEF[c.mission.id];
  if (!m || !c.snap) return 0;
  return Math.max(0, Math.min(m.goal, m.prog(c, c.snap)));
}

// 상태가 바뀔 때마다: 임무를 끝낸 나라에 바로 보상
function funCheck() {
  for (const c of G.list) if (c.approved && c.rich?.length) checkLike(c);
  if (!G.on('mission')) return;
  for (const c of G.list) {
    const m = c.mission && MDEF[c.mission.id];
    if (!m || c.mission.done || c.mission.round !== G.s.round) continue;
    if (progressOf(c) >= m.goal) {
      c.mission.done = true;
      c.missionsDone = (c.missionsDone || 0) + 1;
      G.addGdp(c, MISSION_REWARD);
      G.notify(c.pid, `🕵️ 비밀 임무 성공! 「${m.text}」 1인당 GDP ${won(MISSION_REWARD, true)}`, 'good');
      G.addLog('mission', `🕵️ ${c.flag}${c.name} 나라가 비밀 임무를 해냈어요!`);
    }
  }
}

function missionView(c) {
  if (!G.on('mission') || !c.mission || c.mission.round !== G.s.round || G.s.phase === 'end') return null;
  const m = MDEF[c.mission.id];
  if (!m) return null;
  const p = progressOf(c);
  return { icon: m.icon, text: m.text, goal: m.goal, now: c.mission.done ? m.goal : p, done: c.mission.done, money: !!m.money, reward: MISSION_REWARD };
}

// 무역이 이루어질 때: 이번 라운드 거래 상대·최고의 거래 기록
function funTrade(a, b, o) {
  for (const [x, y] of [[a, b], [b, a]]) {
    x.partnersR ||= [];
    if (!x.partnersR.includes(y.pid)) x.partnersR.push(y.pid);
    x.partners ||= [];
    if (!x.partners.includes(y.pid)) x.partners.push(y.pid);
  }
  const n = sum(o.give) + sum(o.get);
  const s = G.s;
  if (!s.bestTrade || n > s.bestTrade.n) s.bestTrade = { a: a.pid, b: b.pid, n, give: o.give, get: o.get };
}

/* ================= 🎤 라운드 하이라이트 ================= */
function funEnd() {
  const s = G.s;
  const cs = G.list.filter((c) => c.approved && c.snap);
  if (!cs.length) return;
  const items = [];
  const best = (f, min = 1) => {
    let top = null, v = -Infinity;
    for (const c of cs) { const x = f(c); if (x > v) { v = x; top = c; } }
    return v >= min ? { c: top, v, all: cs.filter((c) => f(c) === v).map((c) => c.pid) } : null;
  };
  const g = best((c) => G.score(c) - c.snap.gdp, 1);
  if (g) items.push({ icon: '📈', title: '쑥쑥 성장', pids: g.all.slice(0, 3), text: `1인당 GDP ${won(g.v, true)}` });
  const t = best((c) => c.trades - c.snap.trades, 1);
  if (t) items.push({ icon: '🤝', title: '무역 부지런', pids: t.all.slice(0, 3), text: `무역 ${t.v}번 성공` });
  if (s.bestTrade) {
    const bt = s.bestTrade;
    const txt = (book) => ITEMS.filter((r) => book[r]).map((r) => `${ITEM_INFO[r].icon}${book[r]}`).join(' ');
    items.push({ icon: '💎', title: '최고의 거래', pids: [bt.a, bt.b], text: `${txt(bt.give)} ⇄ ${txt(bt.get)} (모두 ${bt.n}개)` });
  }
  const a = best((c) => (c.aidGiven || 0) - c.snap.aid, 1);
  if (a) items.push({ icon: '🎁', title: '따뜻한 나눔', pids: a.all.slice(0, 3), text: `원조 ${a.v}번` });
  const up = cs.filter((c) => c.stage > c.snap.stage);
  if (up.length) items.push({ icon: '🏗️', title: '발전 성공', pids: up.map((c) => c.pid).slice(0, 4), text: up.length === 1 ? `${STAGES[up[0].stage].icon} ${josa(STAGES[up[0].stage].name, '으로/로')} 발전` : `${up.length}개 나라가 발전했어요` });
  const q = best((c) => (c.mgCorrect || 0) - c.snap.mg, 1);
  if (q) items.push({ icon: '🎯', title: '퀴즈 척척', pids: q.all.slice(0, 3), text: `미니게임 ${q.v}문제 정답` });
  const ms = cs.filter((c) => c.mission?.done && c.mission.round === s.round);
  if (ms.length) items.push({ icon: '🕵️', title: '비밀 임무 성공', pids: ms.map((c) => c.pid).slice(0, 4), text: `${ms.length}개 나라가 몰래 해냈어요` });
  s.highlight = { id: s.nextId++, round: s.round, time: Date.now(), last: s.round >= s.totalRounds, items };
}

/* ================= 🏅 칭찬 배지 (게임 끝) ================= */
const BADGES = [
  { icon: '👑', title: '1인당 GDP 1등', stat: (c) => G.score(c), text: (v) => `1인당 GDP ${won(v)}` },
  { icon: '🤝', title: '무역왕', stat: (c) => c.trades || 0, text: (v) => `무역 ${v}번 성공` },
  { icon: '🌐', title: '친구가 많은 나라', stat: (c) => (c.partners || []).length, text: (v) => `${v}개 나라와 무역` },
  { icon: '😇', title: '나눔 천사', stat: (c) => c.aidGiven || 0, text: (v) => `원조 ${v}번 보냄` },
  { icon: '🎯', title: '퀴즈 박사', stat: (c) => c.mgCorrect || 0, text: (v) => `미니게임 ${v}문제 정답` },
  { icon: '🚢', title: '수출 대장', stat: (c) => sum(c.exp), text: (v) => `${v}개 수출` },
  { icon: '🛍️', title: '수입 대장', stat: (c) => sum(c.imp), text: (v) => `${v}개 수입` },
  { icon: '🏭', title: '공장장', stat: (c) => c.made || 0, text: (v) => `공산품 ${v}개 생산` },
  { icon: '🏗️', title: '건축가', stat: (c) => (c.builds || 0) + c.stage, text: (_, c) => `${STAGES[c.stage].icon} ${STAGES[c.stage].name}까지 발전` },
  { icon: '🕵️', title: '비밀 요원', stat: (c) => c.missionsDone || 0, text: (v) => `비밀 임무 ${v}번 성공` },
  { icon: '🚀', title: '역전의 명수', stat: (c) => climb(c), text: (v) => `순위 ${v}계단 상승` },
  { icon: '🕊️', title: '평화 지킴이', stat: (c) => ((c.warsDeclared || 0) ? 0 : (c.trades || 0) + (c.aidGiven || 0) * 2), text: () => '전쟁 없이 사이좋게' },
  { icon: '⚓', title: '바다의 상인', stat: (c) => c.portFees || 0, text: (v) => `항구 수수료 ${won(v)}` },
  { icon: '🙏', title: '도움을 잘 구한 나라', stat: (c) => c.aidGot || 0, text: (v) => `원조 ${v}번 받음` },
];
// 1라운드 끝 순위 → 마지막 순위가 몇 계단 올랐는지
function climb(c) {
  const cs = G.list.filter((x) => x.approved);
  const rankAt = (x, i) => 1 + cs.filter((y) => (y.history?.[i] ?? 0) > (x.history?.[i] ?? 0)).length;
  const last = G.s.round;
  if (last < 2) return 0;
  return Math.max(0, rankAt(c, 1) - rankAt(c, last));
}

// 모든 나라가 하나씩 받아요 (같은 배지는 한 번만)
function computeBadges() {
  const cs = G.list.filter((c) => c.approved);
  const out = [];
  const has = new Set();
  for (const b of BADGES) {
    const cand = cs.filter((c) => !has.has(c.pid)).map((c) => ({ c, v: b.stat(c) })).filter((x) => x.v > 0)
      .sort((x, y) => y.v - x.v);
    if (!cand.length) continue;
    const { c, v } = cand[0];
    has.add(c.pid);
    out.push({ pid: c.pid, icon: b.icon, title: b.title, text: b.text(v, c) });
  }
  for (const c of cs) {
    if (has.has(c.pid)) continue;
    out.push({ pid: c.pid, icon: '💪', title: '끝까지 최선', text: `${STAGES[c.stage].icon} ${STAGES[c.stage].name}까지 함께 했어요` });
  }
  G.s.badges = out;
}

