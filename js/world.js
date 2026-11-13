// 세계 과제 (선생님 PC에서 실행): 협동 프로젝트(상호 의존)와 국제 입찰(경쟁)
// 교과서 106~107쪽 「무역을 통한 세계 여러 나라의 상호 의존과 경쟁 관계」를 미리 겪어 보는 활동이에요.
import { ITEMS, ITEM_INFO, WORLD_TASKS, PROJECTS, BIDS, BID_TECH_BONUS, PEACE } from './config.js';
import { resText } from './game.js';
import { won } from './ui.js';

let G = null;
const total = (obj) => ITEMS.reduce((a, r) => a + (obj?.[r] || 0), 0);
const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

export function installWorld(game) {
  G = game;
  game.s.worldLog ||= [];
  game.s.worldCount ||= { project: 0, bid: 0 };
  game.startWorld = startWorld;
  game.closeWorld = closeWorld;
  game.worldView = worldView;
}

export function handleWorld(pid, msg) {
  if (msg.t === 'contribute') return contribute(pid, msg.give);
  if (msg.t === 'bid') return placeBid(pid, msg.give);
  if (msg.t === 'cancelbid') return cancelBid(pid);
  return undefined; // 세계 과제 메시지가 아니에요
}

const approved = () => G.list.filter((c) => c.approved && c.rich.length);

function startWorld(round) {
  const s = G.s;
  s.world = null;
  const type = WORLD_TASKS[round];
  const n = approved().length;
  if (!type || n < 2) return;
  const scale = Math.max(1, n / 6); // 나라가 많으면 필요한 양도 늘어나요
  if (type === 'project') {
    const def = PROJECTS[s.worldCount.project++ % PROJECTS.length];
    const need = Object.fromEntries(Object.entries(def.need).map(([k, v]) => [k, Math.ceil(v * scale)]));
    const minCountries = Math.min(def.minCountries, n);
    const sumNeed = total(need);
    s.world = {
      id: s.nextId++, type, round, icon: def.icon, name: def.name, desc: def.desc,
      need, got: zero(Object.keys(need)), by: {}, minCountries,
      cap: Math.ceil(sumNeed / minCountries), // 한 나라가 보탤 수 있는 최대 개수 → 여러 나라가 꼭 힘을 모아야 해요
      gdp: def.gdp, peace: def.peace, done: false, success: null,
    };
  } else {
    const def = BIDS[s.worldCount.bid++ % BIDS.length];
    s.world = {
      id: s.nextId++, type, round, icon: def.icon, name: def.name, desc: def.desc,
      res: def.res, bids: {}, gdp: def.gdp, done: false, winner: null,
    };
  }
  G.addLog('world', `${s.world.icon} 세계 과제가 열렸어요: 「${s.world.name}」`);
}

function active(type) {
  const w = G.s.world;
  return w && w.type === type && !w.done && w.round === G.s.round && G.s.phase === 'trade' ? w : null;
}

/* ---------- 협동 프로젝트 ---------- */
function contribute(pid, giveIn) {
  const w = active('project');
  if (!w) return '지금은 보탤 수 있는 프로젝트가 없어요.';
  const c = G.c(pid);
  const give = G.readAmounts(giveIn);
  if (!c || !give) return '숫자를 다시 확인해 주세요.';
  const mine = (w.by[pid] ||= {});
  let room = w.cap - total(mine);
  const real = {};
  for (const r of Object.keys(w.need)) {
    const n = Math.min(give[r] || 0, w.need[r] - w.got[r], c.res[r] || 0, room);
    if (n > 0) { real[r] = n; room -= n; }
  }
  if (!total(real)) return room <= 0 ? `한 나라는 ${w.cap}개까지만 보탤 수 있어요. 다른 나라와 힘을 모아요!` : '보탤 수 있는 자원이 없어요.';
  for (const r of Object.keys(real)) { c.res[r] -= real[r]; w.got[r] += real[r]; mine[r] = (mine[r] || 0) + real[r]; }
  G.addLog('world', `${w.icon} ${c.flag}${c.name} 나라가 「${w.name}」에 보탰어요: ${resText(real)}`, false);
  G.notify(pid, `${w.icon} 「${w.name}」에 보탰어요: ${resText(real)}`, 'good');
  const complete = Object.keys(w.need).every((r) => w.got[r] >= w.need[r]);
  if (complete && Object.keys(w.by).length >= w.minCountries) finishProject(true);
  G.changed();
  return null;
}

function finishProject(success) {
  const s = G.s; const w = s.world;
  w.done = true; w.success = success;
  const people = Object.keys(w.by).map((p) => G.c(p)).filter(Boolean);
  if (success) {
    for (const c of people) {
      G.addGdp(c, w.gdp);
      G.notify(c.pid, `${w.icon} 「${w.name}」 완성! 1인당 GDP ${won(w.gdp, true)}`, 'good');
    }
    G.changePeace(w.peace, 'project');
    G.addLog('world', `${w.icon} ${people.length}개 나라가 힘을 모아 완성했어요: 「${w.name}」 (참여한 나라 1인당 GDP ${won(w.gdp, true)}, 세계 평화 +${w.peace})`);
  } else {
    // 실패하면 보탠 자원은 돌려줘요
    for (const c of people) for (const [r, n] of Object.entries(w.by[c.pid])) c.res[r] = (c.res[r] || 0) + n;
    G.addLog('world', `${w.icon} 「${w.name}」 실패: 자원이 다 모이지 않아 보탠 자원은 돌려줬어요.`);
  }
  s.worldLog.push({ type: 'project', icon: w.icon, name: w.name, success, countries: people.map((c) => c.pid), round: w.round });
  s.worldMsg = {
    id: s.nextId++, time: Date.now(), icon: w.icon, good: success,
    title: success ? `「${w.name}」 완성!` : `「${w.name}」 실패`,
    text: success
      ? `${people.map((c) => c.flag + c.name).join(', ')} 나라가 서로 가진 것을 모아 완성했어요. 참여한 나라 모두 1인당 GDP ${won(w.gdp, true)}!`
      : `필요한 자원이 다 모이지 않았어요. ${w.minCountries}개 나라 이상이 힘을 모아야 해요.`,
    note: '여러 나라가 서로 필요한 것을 주고받으며 함께 만들어요 → 상호 의존',
  };
}

/* ---------- 국제 입찰 ---------- */
function placeBid(pid, giveIn) {
  const w = active('bid');
  if (!w) return '지금은 입찰할 수 없어요.';
  const c = G.c(pid);
  const give = G.readAmounts(giveIn);
  if (!c || !give) return '숫자를 다시 확인해 주세요.';
  const amounts = {};
  for (const r of w.res) if (give[r] > 0) amounts[r] = give[r];
  if (!total(amounts)) return '입찰할 자원을 1개 이상 정해 주세요.';
  // 이미 입찰했으면 먼저 돌려받고 새로 걸어요
  const old = w.bids[pid];
  if (old) for (const [r, n] of Object.entries(old.amounts)) c.res[r] += n;
  if (!G.has(c, amounts)) { if (old) for (const [r, n] of Object.entries(old.amounts)) c.res[r] -= n; return '자원이 모자라요.'; }
  for (const [r, n] of Object.entries(amounts)) c.res[r] -= n;
  w.bids[pid] = { amounts, time: Date.now() };
  G.addLog('world', `${w.icon} ${c.flag}${c.name} 나라가 「${w.name}」 입찰에 참여했어요.`, false);
  G.notify(pid, `${w.icon} 입찰했어요: ${resText(amounts)} (마감 때 결과가 나와요)`, 'good');
  G.changed();
  return null;
}

function cancelBid(pid) {
  const w = active('bid');
  const b = w?.bids[pid];
  if (!b) return null;
  const c = G.c(pid);
  for (const [r, n] of Object.entries(b.amounts)) c.res[r] += n;
  delete w.bids[pid];
  G.changed();
  return null;
}

const bidScore = (c, b) => total(b.amounts) * (c.tech ? BID_TECH_BONUS : 1);

function finishBid() {
  const s = G.s; const w = s.world;
  w.done = true;
  const entries = Object.entries(w.bids).map(([pid, b]) => ({ c: G.c(pid), b })).filter((e) => e.c);
  entries.sort((x, y) => bidScore(y.c, y.b) - bidScore(x.c, x.b) || x.b.time - y.b.time);
  const win = entries[0];
  // 낙찰된 나라는 건 자원을 쓰고, 나머지 나라는 돌려받아요
  for (const e of entries.slice(1)) for (const [r, n] of Object.entries(e.b.amounts)) e.c.res[r] += n;
  if (win) {
    w.winner = win.c.pid;
    G.addGdp(win.c, w.gdp);
    G.notify(win.c.pid, `${w.icon} 「${w.name}」 낙찰! 공사를 맡아 1인당 GDP ${won(w.gdp, true)}`, 'good');
    for (const e of entries.slice(1)) G.notify(e.c.pid, `${w.icon} 아쉽게도 ${win.c.name} 나라가 낙찰됐어요. 건 자원은 돌려받았어요.`, 'bad');
    G.addLog('world', `${w.icon} 「${w.name}」 입찰 결과: ${entries.length}개 나라가 경쟁해 ${win.c.flag}${win.c.name} 나라가 낙찰! (1인당 GDP ${won(w.gdp, true)})`);
  } else {
    G.addLog('world', `${w.icon} 「${w.name}」에 입찰한 나라가 없었어요.`);
  }
  s.worldLog.push({ type: 'bid', icon: w.icon, name: w.name, winner: win?.c.pid || null, count: entries.length, round: w.round });
  s.worldMsg = {
    id: s.nextId++, time: Date.now(), icon: w.icon, good: !!win,
    title: win ? `「${w.name}」 입찰 결과` : `「${w.name}」 입찰 없음`,
    text: win
      ? `${entries.length}개 나라가 경쟁해서 ${win.c.flag}${win.c.name} 나라가 공사를 맡았어요! 1인당 GDP ${won(w.gdp, true)}`
      : '이번에는 아무 나라도 입찰하지 않았어요.',
    note: '더 많은 이익을 얻으려고 여러 나라가 서로 겨뤄요 → 경쟁',
  };
}

function closeWorld() {
  const w = G.s.world;
  if (!w || w.done || w.round !== G.s.round) return;
  if (w.type === 'project') finishProject(false);
  else finishBid();
}

/* ---------- 학생 화면용 ---------- */
function worldView(pid) {
  const s = G.s; const w = s.world;
  if (!w || w.round !== s.round) return null;
  const base = { id: w.id, type: w.type, icon: w.icon, name: w.name, desc: w.desc, gdp: w.gdp, done: w.done };
  if (w.type === 'project') {
    return { ...base, need: w.need, got: w.got, mine: w.by[pid] || {}, cap: w.cap, minCountries: w.minCountries,
      helpers: Object.keys(w.by), success: w.success };
  }
  return { ...base, res: w.res, count: Object.keys(w.bids).length, mine: w.bids[pid]?.amounts || null,
    winner: w.winner, techBonus: BID_TECH_BONUS };
}
