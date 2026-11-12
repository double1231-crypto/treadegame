// 라운드 끝에 나오는 사건 카드. apply(g) 는 효과를 적용하고 결과 문장을 돌려줍니다.
// g.list = 모든 나라, g.round = 지금 라운드, g.atWar(c), g.tradesThisRound(c)
const dec = (c, r, n) => { c.res[r] = Math.max(0, c.res[r] - n); };
const pickSome = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const names = (list) => list.map((c) => `${c.flag}${c.name}`).join(', ');

export const EVENTS = [
  {
    id: 'tariff', icon: '🧱', title: '관세 부과',
    desc: '한 나라가 자기 나라 산업을 지키려고, 다른 나라에서 들어오는 자원에 세금(관세)을 매겼어요.',
    apply(g) {
      // 보통으로 나는 자원(많지도 부족하지도 않은 것)을 보호해요
      const cand = g.list.filter((c) => c.rich.length);
      const c = cand[Math.floor(Math.random() * cand.length)];
      if (!c) return '관세를 매긴 나라가 없어요.';
      const normal = ['food', 'wood', 'stone', 'iron', 'gold'].filter((r) => !c.rich.includes(r) && !c.poor.includes(r));
      const r = normal[Math.floor(Math.random() * normal.length)] || c.poor[0];
      const NAME = { food: '🌾식량', wood: '🪵목재', stone: '🪨돌', iron: '🔩철', gold: '🪙금' };
      const OBJ = { food: '🌾식량을', wood: '🪵목재를', stone: '🪨돌을', iron: '🔩철을', gold: '🪙금을' };
      g.s.tariff = { pid: c.pid, res: r, until: g.s.round + 1, name: c.name, flag: c.flag };
      return `${c.flag}${c.name} 나라가 수입 ${NAME[r]}에 관세를 매겼어요! 다음 라운드까지 ${c.name} 나라의 ${NAME[r]} 생산은 늘지만, ${c.name} 나라에 ${OBJ[r]} 수출하는 나라는 이익이 줄어요.`;
    },
  },
  {
    id: 'drought', icon: '🌵', title: '가뭄', desc: '비가 오지 않아 농사가 어려워졌어요.',
    apply(g) { for (const c of g.list) c.res.food = Math.floor(c.res.food / 2); return '모든 나라의 🌾식량이 절반으로 줄었어요.'; },
  },
  {
    id: 'harvest', icon: '🌾', title: '풍년', desc: '날씨가 좋아 곡식이 잘 자랐어요.',
    apply(g) { for (const c of g.list) c.res.food += 3; return '모든 나라가 🌾식량 3개를 얻었어요.'; },
  },
  {
    id: 'pirates', icon: '🏴‍☠️', title: '해적 출몰', desc: '바다에 해적이 나타나 배를 습격했어요!',
    apply(g) {
      const hit = pickSome(g.list, Math.min(2, g.list.length));
      for (const c of hit) { dec(c, 'gold', 3); dec(c, 'wood', 1); }
      return `${names(hit)} 나라가 🪙금 3개, 🪵목재 1개를 빼앗겼어요.`;
    },
  },
  {
    id: 'fire', icon: '🔥', title: '산불', desc: '건조한 날씨에 큰 산불이 났어요.',
    apply(g) { for (const c of g.list) dec(c, 'wood', 2); return '모든 나라의 🪵목재가 2개씩 줄었어요.'; },
  },
  {
    id: 'mine', icon: '⛏️', title: '새 광산 발견', desc: '땅속에서 새 광산을 찾았어요!',
    apply(g) {
      const [c] = pickSome(g.list, 1);
      c.res.iron += 4; c.res.stone += 2;
      return `${c.flag}${c.name} 나라가 🔩철 4개, 🪨돌 2개를 얻었어요.`;
    },
  },
  {
    id: 'tech', icon: '💡', title: '기술 발전', desc: '새로운 도구가 발명되어 일을 더 잘하게 되었어요.',
    apply(g) { for (const c of g.list) c.res[c.rich[0]] += 2; return '모든 나라가 특산 자원을 2개씩 더 얻었어요.'; },
  },
  {
    id: 'peace', icon: '🕊️', title: '평화의 시대', desc: '세계가 평화로워 사람들이 마음 놓고 일해요.',
    apply(g) {
      const ok = g.list.filter((c) => !g.atWar(c));
      for (const c of ok) c.res.gold += 2;
      return ok.length ? `전쟁 중이 아닌 나라(${names(ok)})가 🪙금 2개를 얻었어요.` : '모든 나라가 전쟁 중이라 아무도 얻지 못했어요.';
    },
  },
  {
    id: 'flood', icon: '🌊', title: '홍수', desc: '큰비로 강물이 넘쳤어요.',
    apply(g) { for (const c of g.list) { dec(c, 'food', 2); dec(c, 'stone', 1); } return '모든 나라의 🌾식량 2개, 🪨돌 1개가 사라졌어요.'; },
  },
  {
    id: 'fair', icon: '🎪', title: '세계 무역 박람회', desc: '여러 나라가 모여 물건을 자랑하는 박람회가 열렸어요.',
    apply(g) {
      const ok = g.list.filter((c) => g.tradesThisRound(c) > 0);
      for (const c of ok) c.res[c.rich[0]] += 2;
      return ok.length ? `이번 라운드에 무역을 한 나라(${names(ok)})가 특산 자원 2개를 얻었어요.` : '이번 라운드에 무역한 나라가 없어서 아무도 얻지 못했어요.';
    },
  },
];
