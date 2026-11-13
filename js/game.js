// 게임 규칙과 상태 관리 (선생님 PC에서만 실행됩니다)
import {
  RES, RES_INFO, STAGES, UPGRADE_COST, PRODUCTION, START_AMOUNT, WORKSHOP,
  TIMES, TOTAL_ROUNDS, MAX_COUNTRIES, COUNTRY_RANGE, MAX_PENDING_OFFERS, FLAGS, GDP, PEACE,
  GOODS, GOODS_INFO, GOODS_RULE, ITEMS, ITEM_INFO, LENGTHS, FEATURE_DEFAULTS, UNLOCK, FEATURE_INFO,
  REFLECT_QS, TARIFF, PORT,
} from './config.js';
import { josa, won } from './ui.js';
import { cleanDesign, nationColor } from './flag.js';

// 학생이 보낸 국기 정보 정리: 문장은 정해진 그림 중 하나이거나 없음, 나라 색은 국기에서 뽑아요.
function flagInfo(info) {
  const design = cleanDesign(info.design, typeof info.color === 'string' ? info.color : undefined);
  const flag = FLAGS.includes(info.flag) ? info.flag : '';
  return { flag, design, color: nationColor(design) };
}

export function newGameState(code) {
  return {
    code,
    phase: 'lobby',
    round: 0,
    totalRounds: TOTAL_ROUNDS,
    maxCountries: MAX_COUNTRIES,
    phaseEndsAt: 0,
    pausedRemaining: null,
    tradeBan: false,
    warBan: false,
    peace: PEACE.start,   // 세계 평화 점수
    crisis: false,        // 세계대공황 중인지
    crisisMsg: null,      // 대공황 시작·끝 알림
    fx: [],               // 선생님 화면의 자원 이동 효과
    settings: { length: 30, features: { ...FEATURE_DEFAULTS }, qset: 'nature' }, // 선생님 설정
    countries: {},
    order: [],
    offers: [],
    log: [],
    nextId: 1,
    minigame: null,
    event: null,
    usedEvents: [],
  };
}

export const emptyRes = () => Object.fromEntries(RES.map((r) => [r, 0]));
// 자원 + 공산품
export const emptyItems = () => Object.fromEntries(ITEMS.map((r) => [r, 0]));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const cleanName = (s) => Array.from(String(s || '').trim()).slice(0, 8).join('');
export const resText = (obj) => ITEMS.filter((r) => obj?.[r] > 0).map((r) => `${ITEM_INFO[r].icon}${obj[r]}`).join(' ') || '없음';
const sum = (obj) => ITEMS.reduce((a, r) => a + (obj?.[r] || 0), 0);
// 수출·수입 기록 (자원별 개수)
const addTo = (book, amounts) => { for (const r of ITEMS) if (amounts?.[r]) book[r] = (book[r] || 0) + amounts[r]; };

export function traitOf(c, r) {
  if (c.rich.includes(r)) return 'rich';
  if (c.poor.includes(r)) return 'poor';
  return 'normal';
}

// 풍부한 자원 1~2개, 같은 수만큼 부족한 자원. 모든 자원이 누군가에게는 특산품이 되도록 돌려가며 배정.
export function assignTraits(n) {
  const order = shuffle(RES);
  const richs = [];
  for (let i = 0; i < n; i++) richs.push([order[i % RES.length]]);
  // 아무도 많이 갖지 못한 자원이 남으면 두 번째 특산품으로 먼저 나눠 줌
  const uncovered = order.slice(n);
  uncovered.forEach((r, i) => { if (i < n) richs[i].push(r); });
  for (const rich of richs) {
    if (rich.length === 1 && Math.random() < 0.4) rich.push(shuffle(RES.filter((r) => !rich.includes(r)))[0]);
  }
  const list = richs.map((rich) => ({ rich, poor: shuffle(RES.filter((r) => !rich.includes(r))).slice(0, rich.length) }));
  return shuffle(list);
}

export class Game {
  constructor(state, hooks = {}) {
    this.s = state;
    this.hooks = hooks; // onChange(), notify(pid, text, kind)
  }

  /* ---------- 공통 ---------- */
  changed() { this.funCheck?.(); this.hooks.onChange?.(); }
  notify(pid, text, kind = 'info') { this.hooks.notify?.(pid, text, kind); }
  c(pid) { return this.s.countries[pid]; }
  get list() { return this.s.order.map((p) => this.s.countries[p]).filter(Boolean); }
  addLog(kind, text, pub = true) {
    this.s.log.push({ id: this.s.nextId++, kind, text, round: this.s.round, time: Date.now(), pub });
    if (this.s.log.length > 300) this.s.log.shift();
  }
  remaining(now = Date.now()) {
    if (this.s.pausedRemaining != null) return this.s.pausedRemaining;
    return this.s.phaseEndsAt ? Math.max(0, this.s.phaseEndsAt - now) : 0;
  }
  atWar(c) { return c.warUntil >= this.s.round && this.s.round > 0 && c.warUntil > 0; }

  /* ---------- 참가 ---------- */
  join(pid, info) {
    const s = this.s;
    let c = s.countries[pid];
    const name = cleanName(info.name);
    if (!name) return '나라 이름을 적어 주세요.';
    if (!c) {
      const max = s.maxCountries || MAX_COUNTRIES;
      if (s.order.length >= max) return `이미 ${max}개 나라가 모두 찼어요.`;
      c = {
        pid, name, ...flagInfo(info),
        approved: false, online: true,
        rich: [], poor: [], res: emptyItems(), stage: 0, workshops: emptyRes(), exp: {}, imp: {}, tech: false, made: 0,
        warUntil: 0, wars: 0, warsDeclared: 0, trades: 0, history: [], lastProd: null,
        mgCorrect: 0, gdp: GDP.start, aidGiven: 0, aidGot: 0,
      };
      s.countries[pid] = c;
      s.order.push(pid);
      if (s.phase !== 'lobby') this.setupCountry(c);
      this.addLog('join', `${c.flag} ${name} 나라가 참가 신청했어요.`, false);
    } else {
      // 승인 전에는 다시 고칠 수 있음
      if (!c.approved) { c.name = name; Object.assign(c, flagInfo(info)); }
    }
    this.changed();
    return null;
  }

  approve(pid, newName) {
    const c = this.c(pid); if (!c) return;
    if (newName != null && cleanName(newName)) c.name = cleanName(newName);
    c.approved = true;
    this.notify(pid, '선생님이 나라를 승인했어요! 🎉', 'good');
    this.changed();
  }

  rename(pid, newName) {
    const c = this.c(pid); const n = cleanName(newName);
    if (!c || !n) return;
    c.name = n;
    this.changed();
  }

  remove(pid) {
    const s = this.s;
    if (!s.countries[pid]) return;
    delete s.countries[pid];
    s.order = s.order.filter((p) => p !== pid);
    s.offers = s.offers.filter((o) => o.from !== pid && o.to !== pid);
    this.hooks.removed?.(pid);
    this.changed();
  }

  setMaxCountries(n) {
    const [lo, hi] = COUNTRY_RANGE;
    // 이미 들어온 나라 수보다 적게는 줄일 수 없어요.
    this.s.maxCountries = Math.max(lo, Math.min(hi, n), this.s.order.length);
    this.changed();
  }

  // 📱 학생 튜토리얼(연습)을 끝냈어요
  tutDone(pid) {
    const c = this.c(pid);
    if (!c || c.tutDone) return;
    c.tutDone = true;
    this.addLog('tutorial', `✅ ${c.flag}${c.name} 나라가 튜토리얼을 끝냈어요.`, false);
    this.changed();
  }
  // 튜토리얼을 기다려야 하나요? (게임 시작 전, 설정이 켜져 있고, 선생님이 건너뛰지 않았을 때)
  tutWaiting() {
    const s = this.s;
    if (s.phase !== 'lobby' || !this.on('tutorial') || s.tutSkip) return null;
    const cs = this.list.filter((c) => c.approved);
    const done = cs.filter((c) => c.tutDone).length;
    return { done, total: cs.length, all: cs.length > 0 && done === cs.length };
  }

  setOnline(pid, on) { const c = this.c(pid); if (c && c.online !== on) { c.online = on; this.changed(); } }

  setupCountry(c, traits) {
    const t = traits || assignTraits(1)[0];
    c.rich = t.rich; c.poor = t.poor;
    for (const r of RES) c.res[r] = START_AMOUNT[traitOf(c, r)];
    for (const g of GOODS) c.res[g] = 0;
    c.exp = {}; c.imp = {};
    c.gdp = GDP.start;
    c.history = [this.score(c)];
    c.approved = true;
  }

  /* ---------- 진행 ---------- */
  start() {
    const s = this.s;
    if (s.phase !== 'lobby') return;
    const cs = this.list;
    if (!cs.length) return;
    const traits = assignTraits(cs.length);
    cs.forEach((c, i) => this.setupCountry(c, traits[i]));
    // 기술 나라: 많은 자원이 1개뿐인 나라를 먼저 골라요 (자원은 부족해도 기술로 성장 - 우리나라처럼)
    const nTech = cs.length >= 3 ? Math.max(1, Math.round(cs.length * GOODS_RULE.techShare)) : cs.length >= 2 ? 1 : 0;
    const pick = shuffle(cs).sort((a, b) => a.rich.length - b.rich.length).slice(0, nTech);
    for (const c of cs) c.tech = pick.includes(c);
    // 무역항 나라: 기술 나라가 아닌 나라에서 골라요 (교과서 104쪽 싱가포르)
    const nPort = cs.length >= 3 ? Math.max(1, Math.round(cs.length / PORT.perCountries)) : 0;
    const ports = shuffle(cs.filter((c) => !c.tech)).slice(0, nPort);
    for (const c of cs) { c.port = ports.includes(c); c.portFees = 0; }
    this.addLog('system', `🎬 게임 시작! 내 나라의 풍부한 자원과 부족한 자원을 확인하세요. 🔬 기술 나라: ${pick.map((c) => c.flag + c.name).join(', ') || '없음'}`);
    this.setPhase('prep', this.t('prep'));
  }

  setPhase(phase, secs = 0) {
    const s = this.s;
    s.phase = phase;
    s.pausedRemaining = null;
    s.phaseEndsAt = secs ? Date.now() + secs * 1000 : 0;
    this.changed();
  }

  tick(now = Date.now()) {
    const s = this.s;
    if (s.pausedRemaining != null || !s.phaseEndsAt) return;
    if (now >= s.phaseEndsAt) this.advance();
  }

  pause() {
    const s = this.s;
    if (s.pausedRemaining != null || !s.phaseEndsAt) return;
    s.pausedRemaining = this.remaining();
    this.changed();
  }

  resume() {
    const s = this.s;
    if (s.pausedRemaining == null) return;
    s.phaseEndsAt = Date.now() + s.pausedRemaining;
    s.pausedRemaining = null;
    this.changed();
  }

  addTime(sec) {
    const s = this.s;
    if (s.pausedRemaining != null) s.pausedRemaining += sec * 1000;
    else if (s.phaseEndsAt) s.phaseEndsAt += sec * 1000;
    this.changed();
  }

  advance() {
    const s = this.s;
    switch (s.phase) {
      case 'lobby': this.start(); break;
      case 'prep': this.startRound(1); break;
      case 'minigame': this.finishMinigame?.(); this.setPhase('trade', this.t('trade')); break;
      case 'trade':
        this.expireOffers();
        this.closeWorld?.(); // 협동 프로젝트·국제 입찰 마감
        if (this.on('events') && this.runEvent?.()) this.setPhase('event', this.t('event'));
        else this.endRound();
        break;
      case 'event': this.endRound(); break;
      default: break;
    }
  }

  endRound() {
    const s = this.s;
    this.funEnd?.(); // 라운드 하이라이트
    for (const c of this.list) c.history[s.round] = this.score(c);
    if (s.round >= s.totalRounds) this.finish();
    else this.startRound(s.round + 1);
  }

  finish() {
    const s = this.s;
    this.expireOffers();
    for (const c of this.list) c.history[s.round] = this.score(c);
    this.funBadges?.(); // 칭찬 배지
    this.addLog('system', '🏁 게임이 끝났어요!');
    this.setPhase('end');
  }

  startRound(r) {
    const s = this.s;
    s.round = r;
    s.event = null;
    this.produce();
    this.funStart?.(r); // 비밀 임무·하이라이트 기록 시작
    this.addLog('system', `📅 ${r}라운드 시작! 자원이 생산되었어요.`);
    // 이번 라운드에 새로 열린 기능 알림
    const opened = Object.keys(UNLOCK).filter((f) => this.on(f) && this.s.settings?.features?.unlock !== false && UNLOCK[f] === r);
    if (opened.length) {
      s.unlockMsg = { id: s.nextId++, time: Date.now(), round: r, items: opened.map((f) => ({ f, ...FEATURE_INFO[f] })) };
      this.addLog('unlock', `🔓 새 기능이 열렸어요: ${opened.map((f) => FEATURE_INFO[f].icon + FEATURE_INFO[f].name).join(', ')}`);
    }
    if (this.can('world')) this.startWorld?.(r); // 이번 라운드의 협동 프로젝트·국제 입찰 준비
    else s.world = null;
    if (this.on('minigame') && this.startMinigame?.()) this.setPhase('minigame', this.t('minigame'));
    else this.setPhase('trade', this.t('trade'));
  }

  /* ---------- 되돌아보기 ---------- */
  reflect(pid, answers) {
    const c = this.c(pid);
    if (!c || this.s.phase !== 'end' || !Array.isArray(answers)) return null;
    c.reflect = REFLECT_QS.map((_, i) => String(answers[i] ?? '').slice(0, 300));
    this.addLog('reflect', `💬 ${c.flag}${c.name} 나라가 되돌아보기를 제출했어요.`, false);
    this.changed();
    return null;
  }

  /* ---------- 선생님 도구 ---------- */
  sendNotice(text) {
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return;
    this.s.notice = { id: this.s.nextId++, text: t, time: Date.now() };
    this.addLog('notice', `📢 선생님 공지: ${t}`);
    this.changed();
  }
  setFreeze(on) {
    this.s.freeze = !!on;
    if (on) this.pause(); else this.resume();
    this.changed();
  }
  adjust(pid, item, delta) {
    const c = this.c(pid);
    if (!c || !ITEMS.includes(item)) return;
    c.res[item] = Math.max(0, (c.res[item] || 0) + delta);
    const nm = ITEM_INFO[item];
    this.notify(pid, delta > 0 ? `🎁 선생님이 ${nm.icon}${nm.name} ${delta}개를 주셨어요.` : `선생님이 ${nm.icon}${nm.name} ${-delta}개를 가져가셨어요.`, delta > 0 ? 'good' : 'bad');
    this.addLog('teacher', `🧰 선생님: ${c.flag}${c.name} ${nm.icon}${delta > 0 ? '+' : ''}${delta}`, false);
    this.changed();
  }

  /* ---------- 선생님 설정 ---------- */
  t(phase) { return (LENGTHS[this.s.settings?.length] || LENGTHS[30])[phase]; }
  // 기능을 켰는지 (선생님 설정)
  on(f) { return (this.s.settings?.features?.[f] ?? FEATURE_DEFAULTS[f]) !== false; }
  // 지금 쓸 수 있는지 (켰고, 열리는 라운드가 되었는지)
  can(f) {
    if (!this.on(f)) return false;
    if (this.s.settings?.features?.unlock === false || !UNLOCK[f]) return true;
    return this.s.round >= UNLOCK[f];
  }
  features() { return Object.fromEntries(Object.keys(UNLOCK).map((f) => [f, this.can(f)])); }
  setSetting(path, value) {
    const st = (this.s.settings ||= { length: 30, features: { ...FEATURE_DEFAULTS }, qset: 'nature' });
    st.features ||= { ...FEATURE_DEFAULTS };
    if (path === 'length' && LENGTHS[value]) st.length = Number(value);
    else if (path === 'qset') st.qset = value;
    else if (path.startsWith('f.')) st.features[path.slice(2)] = !!value;
    this.changed();
  }

  productionOf(c, round = this.s.round) {
    const halved = c.warUntil > 0 && round <= c.warUntil;
    const out = emptyRes();
    for (const r of RES) {
      let n = PRODUCTION[traitOf(c, r)][c.stage] + (c.workshops[r] || 0) * WORKSHOP.bonus;
      if (halved) n = Math.floor(n / 2);
      // 관세로 보호받는 자원은 생산이 늘어요 (국내 산업 보호)
      const tf = this.s.tariff;
      if (tf && tf.pid === c.pid && tf.res === r && round <= tf.until) n += TARIFF.protectBonus;
      if (this.s.crisis) n = Math.floor(n * PEACE.crisisRate); // 세계대공황
      out[r] = n;
    }
    return out;
  }

  produce() {
    for (const c of this.list) {
      const p = this.productionOf(c);
      for (const r of RES) c.res[r] += p[r];
      c.lastProd = p;
      const earn = GDP.perRound[c.stage] || 0;
      this.addGdp(c, earn);
      this.notify(c.pid, `${this.s.round}라운드 생산: ${resText(p)} · 1인당 GDP ${won(earn, true)}`, 'good');
    }
  }

  // 1인당 GDP = 이 게임의 점수
  score(c) { return Math.round(c.gdp ?? GDP.start); }
  addGdp(c, n) { c.gdp = Math.max(0, Math.round((c.gdp ?? GDP.start) + n)); }

  // 세계 평화 점수를 바꾸고, 기준보다 낮아지면 세계대공황을 일으켜요.
  changePeace(delta, why) {
    const s = this.s;
    s.peace = Math.max(0, Math.min(100, (s.peace ?? PEACE.start) + delta));
    if (!s.crisis && s.peace < PEACE.crisisBelow) {
      s.crisis = true;
      s.crisisMsg = { id: s.nextId++, type: 'start', time: Date.now() };
      this.addLog('crisis', `📉 세계대공황! 세계 평화 점수가 ${s.peace}점까지 떨어져 모든 나라의 생산량이 줄어요.`);
    } else if (s.crisis && s.peace >= PEACE.recoverAt) {
      s.crisis = false;
      s.crisisMsg = { id: s.nextId++, type: 'end', time: Date.now() };
      this.addLog('crisis', `📈 세계 경제 회복! 세계 평화 점수가 ${s.peace}점으로 올라 생산량이 돌아왔어요.`);
    }
    if (why) s.lastPeace = { delta, why, time: Date.now() };
  }

  // 세계 지도용: 나라 사이에 무역·원조가 몇 번 있었는지
  addLink(a, b, kind) {
    const s = this.s;
    const key = [a, b].sort().join('|');
    const l = ((s.links ||= {})[key] ||= { trade: 0, aid: 0 });
    l[kind]++;
  }

  // 시장 시세판: 무역에서 각 자원 1개를 주고 평균 몇 개를 받았는지 (높을수록 귀한 자원)
  prices() {
    const acc = {};
    for (const o of this.s.offers) {
      if (o.status !== 'accepted' || o.kind === 'request') continue;
      const tg = sum(o.give); const tr = sum(o.get);
      if (!tg || !tr) continue;
      for (const [side, other] of [[o.give, tr / tg], [o.get, tg / tr]]) {
        for (const r of ITEMS) {
          const n = side[r] || 0;
          if (!n) continue;
          const a = (acc[r] ||= { units: 0, value: 0 });
          a.units += n; a.value += n * other;
        }
      }
    }
    return ITEMS.filter((r) => acc[r]?.units).map((r) => ({ r, rate: Math.round((acc[r].value / acc[r].units) * 10) / 10, n: acc[r].units }))
      .sort((x, y) => y.rate - x.rate);
  }

  // 선생님 화면에서 자원이 나라 사이를 날아가는 효과
  pushFx(kind, from, to, give, get) {
    const s = this.s;
    s.fx ||= [];
    s.fx.push({ id: s.nextId++, kind, from, to, give, get, time: Date.now() });
    if (s.fx.length > 20) s.fx = s.fx.slice(-20);
  }

  /* ---------- 무역 ---------- */
  canTrade() { return (this.s.phase === 'trade' || this.s.phase === 'prep') && !this.s.tradeBan; }

  readAmounts(obj) {
    const out = emptyItems();
    for (const r of ITEMS) {
      const n = Math.floor(Number(obj?.[r]) || 0);
      if (n < 0 || n > 99) return null;
      out[r] = n;
    }
    return out;
  }

  has(c, amounts) { return ITEMS.every((r) => (c.res[r] || 0) >= (amounts?.[r] || 0)); }

  /* ---------- 공산품 ---------- */
  recipeOf(c, g) { return c.tech ? GOODS_INFO[g].techRecipe : GOODS_INFO[g].recipe; }

  // 원료로 공산품 만들기
  make(pid, g) {
    const c = this.c(pid);
    if (!c || !GOODS.includes(g)) return '만들 수 없는 물건이에요.';
    if (!this.can('goods')) return this.lockedMsg('goods');
    if (!this.canBuild()) return '공장은 무역·건설 시간에 돌릴 수 있어요.';
    const need = this.recipeOf(c, g);
    if (!this.has(c, need)) return '원료가 모자라요. 다른 나라에서 수입해 보세요!';
    for (const r of RES) c.res[r] -= need[r] || 0;
    c.res[g] = (c.res[g] || 0) + 1;
    c.made = (c.made || 0) + 1;
    this.addLog('make', `🏭 ${c.flag}${c.name} 나라가 ${GOODS_INFO[g].icon}${josa(GOODS_INFO[g].name, '을/를')} 만들었어요.`, false);
    this.notify(pid, `🏭 ${GOODS_INFO[g].icon} ${GOODS_INFO[g].name} 완성! 다른 나라에 수출하면 1인당 GDP가 크게 올라요.`, 'good');
    this.changed();
    return null;
  }

  // 세계 시장에 팔기: 수출보다 GDP는 적지만 언제든 팔 수 있어요
  sellMarket(pid, g) {
    const c = this.c(pid);
    if (!c || !GOODS.includes(g) || !(c.res[g] > 0)) return '팔 물건이 없어요.';
    if (!this.can('goods')) return this.lockedMsg('goods');
    if (!this.canBuild()) return '무역·건설 시간에 팔 수 있어요.';
    c.res[g]--;
    this.addGdp(c, GOODS_RULE.marketGdp);
    c.marketSold = (c.marketSold || 0) + 1;
    this.notify(pid, `🌐 세계 시장에 ${GOODS_INFO[g].icon}${josa(GOODS_INFO[g].name, '을/를')} 팔았어요. 1인당 GDP ${won(GOODS_RULE.marketGdp, true)}`, 'good');
    this.changed();
    return null;
  }

  // 무역이 이루어질 때: 수출·수입 기록 + 공산품 수출 GDP
  recordTrade(exporter, importer, amounts) {
    exporter.exp ||= {}; importer.imp ||= {};
    addTo(exporter.exp, amounts); addTo(importer.imp, amounts);
    let gx = 0, gm = 0;
    for (const g of GOODS) {
      const n = amounts?.[g] || 0;
      gx += n * GOODS_INFO[g].gdp;
      gm += n * GOODS_RULE.importGdp;
    }
    if (gx) { this.addGdp(exporter, gx); this.notify(exporter.pid, `🚢 공산품 수출! 1인당 GDP ${won(gx, true)}`, 'good'); }
    if (gm) { this.addGdp(importer, gm); this.notify(importer.pid, `📦 공산품 수입으로 생활이 풍족해졌어요. 1인당 GDP ${won(gm, true)}`, 'good'); }
    // 관세: 관세를 매긴 나라로 그 자원을 수출하면 파는 나라는 손해, 관세를 매긴 나라는 관세 수입
    const tf = this.s.tariff;
    if (tf && this.s.round <= tf.until && importer.pid === tf.pid && amounts?.[tf.res] > 0) {
      this.addGdp(exporter, -TARIFF.exporterLoss); this.addGdp(importer, TARIFF.importerGain);
      const nm = ITEM_INFO[tf.res];
      this.notify(exporter.pid, `🧱 ${importer.name} 나라의 관세 때문에 ${nm.icon}${nm.name} 수출 이익이 줄었어요. 1인당 GDP ${won(-(TARIFF.exporterLoss))}`, 'bad');
      this.notify(importer.pid, `🧱 관세 수입 ${won(TARIFF.importerGain, true)}`, 'good');
    }
  }

  // 원조와 도움 요청은 무역 금지 중에도 할 수 있어요 (무역·건설 시간과 준비 시간에만).
  canAid() { return this.s.phase === 'trade' || this.s.phase === 'prep'; }

  // kind: 'trade' = 무역 제안, 'request' = 도움 요청 (받을 것만 정하고, 상대가 보내 주면 끝)
  offer(pid, to, giveIn, getIn, counterOf = null, kind = 'trade') {
    const s = this.s;
    const a = this.c(pid); const b = this.c(to);
    const isReq = kind === 'request';
    if (isReq && !this.can('aid')) return this.lockedMsg('aid');
    if (!isReq && !this.can('goods') && GOODS.some((g) => giveIn?.[g] > 0 || getIn?.[g] > 0)) return this.lockedMsg('goods');
    if (isReq ? !this.canAid() : !this.canTrade()) return !isReq && s.tradeBan ? '지금은 무역 금지 시간이에요.' : '지금은 무역 시간이 아니에요.';
    if (!a || !b || pid === to) return '나라를 다시 골라 주세요.';
    if (this.warBetween?.(a, b)) return '전쟁 중인 나라와는 무역할 수 없어요.';
    const give = this.readAmounts(isReq ? {} : giveIn); const get = this.readAmounts(getIn);
    if (!give || !get) return '숫자를 다시 확인해 주세요.';
    if (isReq) { if (!sum(get)) return '도움받고 싶은 자원을 1개 이상 정해 주세요.'; }
    else if (!sum(give) || !sum(get)) return '줄 것과 받을 것을 모두 1개 이상 정해 주세요.';
    if (!this.has(a, give)) return '줄 자원이 모자라요.';
    const pending = s.offers.filter((o) => o.from === pid && o.status === 'pending').length;
    if (pending >= MAX_PENDING_OFFERS) return `제안은 한 번에 ${MAX_PENDING_OFFERS}개까지 보낼 수 있어요.`;
    const o = { id: s.nextId++, kind, from: pid, to, give, get, status: 'pending', round: s.round, time: Date.now() };
    if (counterOf) o.counterOf = counterOf;
    s.offers.push(o);
    this.notify(to, isReq ? `🙏 ${a.flag} ${a.name} 나라가 도움을 요청했어요!`
      : counterOf ? `↩️ ${a.flag} ${a.name} 나라가 조건을 바꿔서 다시 제안했어요!` : `${a.flag} ${a.name} 나라가 무역을 제안했어요!`, 'offer');
    this.changed();
    return null;
  }

  // 원조: 대가 없이 바로 보내 줘요. 세계 평화 점수가 올라가요.
  lockedMsg(f) {
    const n = FEATURE_INFO[f].name;
    return this.on(f) ? `🔒 ${josa(n, '은/는')} ${UNLOCK[f]}라운드부터 할 수 있어요.` : `이번 게임에서는 ${josa(n, '을/를')} 쓰지 않아요.`;
  }

  aid(pid, to, giveIn) {
    if (!this.can('aid')) return this.lockedMsg('aid');
    const a = this.c(pid); const b = this.c(to);
    if (!this.canAid()) return '원조는 무역·건설 시간에 할 수 있어요.';
    if (!a || !b || pid === to || !b.approved) return '도와줄 나라를 다시 골라 주세요.';
    if (this.warBetween?.(a, b)) return '전쟁 중인 나라에는 원조할 수 없어요.';
    const give = this.readAmounts(giveIn);
    if (!give || !sum(give)) return '보낼 자원을 1개 이상 정해 주세요.';
    if (!this.has(a, give)) return '보낼 자원이 모자라요.';
    this.giveAid(a, b, give);
    this.changed();
    return null;
  }

  giveAid(donor, to, give) {
    for (const r of ITEMS) { const n = give[r] || 0; donor.res[r] = (donor.res[r] || 0) - n; to.res[r] = (to.res[r] || 0) + n; }
    donor.aidGiven = (donor.aidGiven || 0) + 1;
    to.aidGot = (to.aidGot || 0) + 1;
    this.changePeace(PEACE.aid, 'aid');
    this.pushFx('aid', donor.pid, to.pid, give, emptyRes());
    this.addLink(donor.pid, to.pid, 'aid');
    this.addLog('aid', `🎁 ${donor.flag}${donor.name} → ${to.flag}${to.name} 원조: ${resText(give)} (세계 평화 +${PEACE.aid})`);
    this.notify(donor.pid, `🎁 ${to.name} 나라에 원조를 보냈어요! 세계가 더 평화로워졌어요.`, 'good');
    this.notify(to.pid, `🎁 ${donor.name} 나라가 원조를 보내 줬어요: ${resText(give)}`, 'good');
  }

  // 받은 제안을 고쳐서 다시 보내기: 원래 제안은 '다시 제안함'으로 끝나고, 보낸 나라에게 새 제안이 가요.
  counter(pid, offerId, giveIn, getIn) {
    const o = this.s.offers.find((x) => x.id === offerId);
    if (!o || o.to !== pid || o.status !== 'pending') return '이미 끝난 제안이에요.';
    if (o.kind === 'request') return '도움 요청은 다시 제안할 수 없어요.';
    const err = this.offer(pid, o.from, giveIn, getIn, o.id);
    if (err) return err;
    o.status = 'countered';
    const a = this.c(o.from); const b = this.c(pid);
    this.addLog('trade-counter', `↩️ ${b.flag}${b.name} 나라가 ${a.flag}${a.name} 나라에게 조건을 바꿔 다시 제안했어요.`, false);
    this.changed();
    return null;
  }

  respond(pid, offerId, accept) {
    const o = this.s.offers.find((x) => x.id === offerId);
    if (!o || o.to !== pid || o.status !== 'pending') return '이미 끝난 제안이에요.';
    const a = this.c(o.from); const b = this.c(o.to);
    const isReq = o.kind === 'request';
    if (!accept) {
      o.status = 'rejected';
      if (isReq) {
        this.addLog('aid-no', `${b.flag}${b.name} 나라가 ${a.flag}${a.name} 나라의 도움 요청을 거절했어요.`, false);
        this.notify(o.from, `${b.flag} ${b.name} 나라가 지금은 도와주기 어렵대요.`, 'bad');
      } else {
        this.changePeace(PEACE.tradeFail, 'tradeFail');
        this.addLog('trade-no', `${b.flag}${b.name} 나라가 ${a.flag}${a.name} 나라의 제안을 거절했어요. (세계 평화 ${PEACE.tradeFail})`, false);
        this.notify(o.from, `${b.flag} ${b.name} 나라가 제안을 거절했어요.`, 'bad');
      }
      this.changed();
      return null;
    }
    if (isReq) {
      // 도움 요청을 들어주기 = 원조
      if (!this.canAid()) return '지금은 원조할 수 없어요.';
      if (!this.has(b, o.get)) return '보낼 자원이 모자라요.';
      o.status = 'accepted';
      o.doneAt = Date.now();
      this.giveAid(b, a, o.get);
      this.changed();
      return null;
    }
    if (!this.canTrade()) return '지금은 무역을 할 수 없어요.';
    if (!this.has(a, o.give)) {
      o.status = 'failed';
      this.changePeace(PEACE.tradeFail, 'tradeFail');
      this.changed();
      return `${a.name} 나라의 자원이 모자라서 무역이 취소됐어요.`;
    }
    if (!this.has(b, o.get)) return '내 자원이 모자라요.';
    for (const r of ITEMS) {
      const give = o.give[r] || 0; const get = o.get[r] || 0;
      a.res[r] = (a.res[r] || 0) + get - give;
      b.res[r] = (b.res[r] || 0) + give - get;
    }
    o.status = 'accepted';
    o.doneAt = Date.now();
    a.trades++; b.trades++;
    this.addGdp(a, GDP.trade); this.addGdp(b, GDP.trade);
    this.recordTrade(a, b, o.give); // a가 수출, b가 수입
    this.recordTrade(b, a, o.get);  // b가 수출, a가 수입
    this.funTrade?.(a, b, o);
    // 무역항 나라는 다른 나라끼리 무역할 때마다 수수료를 받아요
    for (const p of this.list) {
      if (p.port && p !== a && p !== b) { this.addGdp(p, PORT.fee); p.portFees = (p.portFees || 0) + PORT.fee; }
    }
    this.changePeace(PEACE.trade, 'trade');
    this.pushFx('trade', a.pid, b.pid, o.give, o.get);
    this.addLink(a.pid, b.pid, 'trade');
    this.addLog('trade', `🤝 ${a.flag}${a.name} → ${b.flag}${b.name} : ${resText(o.give)} ⇄ ${resText(o.get)}`);
    this.notify(o.from, `🤝 ${b.name} 나라와 무역 성공! 1인당 GDP ${won(GDP.trade, true)}`, 'good');
    this.notify(o.to, `🤝 ${a.name} 나라와 무역 성공! 1인당 GDP ${won(GDP.trade, true)}`, 'good');
    this.changed();
    return null;
  }

  cancelOffer(pid, offerId) {
    const o = this.s.offers.find((x) => x.id === offerId);
    if (!o || o.from !== pid || o.status !== 'pending') return null;
    o.status = 'cancelled';
    this.changed();
    return null;
  }

  expireOffers() {
    for (const o of this.s.offers) if (o.status === 'pending') o.status = 'expired';
    if (this.s.offers.length > 200) this.s.offers = this.s.offers.slice(-200);
  }

  /* ---------- 건설 ---------- */
  canBuild() { return this.s.phase === 'trade' || this.s.phase === 'prep'; }

  build(pid, kind, res) {
    const c = this.c(pid); if (!c) return '나라를 찾을 수 없어요.';
    if (!this.canBuild()) return '건설은 무역·건설 시간에만 할 수 있어요.';
    if (kind === 'stage') {
      const cost = UPGRADE_COST[c.stage + 1];
      if (!cost) return '이미 제국이에요!';
      const need = { ...emptyRes(), ...cost };
      if (!this.has(c, need)) return '자원이 모자라요. 다른 나라와 무역해 보세요!';
      for (const r of RES) c.res[r] -= need[r];
      c.stage++;
      c.builds = (c.builds || 0) + 1;
      const st = STAGES[c.stage];
      this.addLog('build', `${st.icon} ${c.flag}${c.name} 나라가 ${josa(st.name, '으로/로')} 발전했어요!`);
      this.notify(pid, `${st.icon} ${josa(st.name, '으로/로')} 발전! 생산량이 늘어나요.`, 'good');
      // 다른 나라와 선생님 화면에 띄울 발전 공지 (선생님이 끌 수 있어요)
      if (this.s.announceOn !== false) this.s.announce = { id: this.s.nextId++, pid, stage: c.stage, time: Date.now() };
    } else if (kind === 'workshop') {
      if (!c.rich.includes(res)) return '공방은 특산 자원에만 지을 수 있어요.';
      const total = RES.reduce((a, r) => a + c.workshops[r], 0);
      if (total >= WORKSHOP.max) return `공방은 ${WORKSHOP.max}개까지 지을 수 있어요.`;
      const need = { ...emptyRes(), ...WORKSHOP.cost };
      if (!this.has(c, need)) return '자원이 모자라요.';
      for (const r of RES) c.res[r] -= need[r];
      c.workshops[res]++;
      c.builds = (c.builds || 0) + 1;
      this.addLog('build', `🏭 ${c.flag}${c.name} 나라가 ${RES_INFO[res].icon}${RES_INFO[res].name} 공방을 지었어요.`);
      this.notify(pid, `🏭 공방 완성! ${RES_INFO[res].name} 생산 +${WORKSHOP.bonus}`, 'good');
    } else return '알 수 없는 건설이에요.';
    this.changed();
    return null;
  }

  /* ---------- 화면용 데이터 ---------- */
  pub(c) {
    return {
      pid: c.pid, name: c.name, flag: c.flag, color: c.color, approved: c.approved, online: c.online,
      stage: c.stage, rich: c.rich, poor: c.poor, atWar: this.atWar(c), warUntil: c.warUntil,
      design: c.design, workshops: c.workshops, trades: c.trades, wars: c.wars,
      gdp: this.score(c), aidGiven: c.aidGiven || 0, aidGot: c.aidGot || 0, tech: !!c.tech, port: !!c.port,
      prod: c.rich.length ? this.productionOf(c, this.s.round + 1) : null,
    };
  }

  viewFor(pid) {
    const s = this.s;
    const c = this.c(pid);
    if (!c) return { t: 'state', phase: s.phase, unknown: true };
    return {
      t: 'state',
      phase: s.phase, round: s.round, totalRounds: s.totalRounds,
      remaining: this.remaining(), paused: s.pausedRemaining != null,
      tradeBan: s.tradeBan, warBan: s.warBan,
      me: {
        ...this.pub(c), res: c.res, prod: this.productionOf(c, s.round + 1), lastProd: c.lastProd, history: c.history,
        exp: c.exp || {}, imp: c.imp || {}, made: c.made || 0, like: this.gdpLike?.(c) ?? null,
        enemies: this.enemiesOf?.(c) ?? [], declaredThisRound: (s.wars || []).some((w) => w.a === pid && w.round === s.round),
      },
      countries: this.list.filter((x) => x.approved).map((x) => this.pub(x)),
      offers: s.offers.filter((o) => (o.from === pid || o.to === pid) && (o.status === 'pending' || o.round === s.round)).slice(-12),
      news: s.log.filter((l) => l.pub).slice(-6),
      minigame: this.minigameView?.(pid) ?? null,
      event: s.event,
      // 최근 15초 안의 발전 공지만 보내요 (늦게 들어온 학생에게 오래된 공지가 뜨지 않게)
      announce: s.announce && Date.now() - s.announce.time < 15000 ? s.announce : null,
      // 세계대공황: 학생에게는 평화 점수 대신 대공황 여부와 알림만 보내요
      crisis: !!s.crisis,
      crisisMsg: s.crisisMsg && Date.now() - s.crisisMsg.time < 20000 ? s.crisisMsg : null,
      world: this.worldView?.(pid) ?? null,
      features: this.features(),
      prices: this.prices(),
      unlockMsg: s.unlockMsg && Date.now() - s.unlockMsg.time < 90000 ? s.unlockMsg : null,
      notice: s.notice && Date.now() - s.notice.time < 15000 ? s.notice : null,
      freeze: !!s.freeze,
      tutorial: s.tutorial ?? null,
      studentSound: this.on('studentSound'),
      tariff: s.tariff && s.round <= s.tariff.until ? s.tariff : null,
      port: !!c.port,
      reflectQs: s.phase === 'end' ? REFLECT_QS : null, reflected: !!c.reflect,
      worldMsg: s.worldMsg && Date.now() - s.worldMsg.time < 15000 ? s.worldMsg : null,
      mission: this.missionView?.(c) ?? null,
      on: Object.fromEntries(['minigame', 'mission', 'goods', 'aid', 'world', 'war', 'unlock', 'events'].map((f) => [f, this.on(f)])),
      selfTut: s.selfTut && Date.now() - s.selfTut.time < 120000 ? s.selfTut : null,
      tutRequired: s.phase === 'lobby' && this.on('tutorial') && !s.tutSkip,
      tutDone: !!c.tutDone,
      badges: s.phase === 'end' ? s.badges || null : null,
    };
  }
}
