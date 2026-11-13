// 게임 규칙 숫자는 모두 여기에서 바꿀 수 있어요.

export const RES = ['food', 'wood', 'stone', 'iron', 'gold'];

export const RES_INFO = {
  food:  { name: '식량', icon: '🌾' },
  wood:  { name: '목재', icon: '🪵' },
  stone: { name: '돌',   icon: '🪨' },
  iron:  { name: '철',   icon: '🔩' },
  gold:  { name: '금',   icon: '🪙' },
};

export const STAGES = [
  { name: '마을', icon: '🛖' },
  { name: '도시', icon: '🏘️' },
  { name: '왕국', icon: '🏰' },
  { name: '제국', icon: '👑' },
];

// UPGRADE_COST[n] = n단계로 올라갈 때 필요한 자원
export const UPGRADE_COST = [
  null,
  { food: 5, wood: 5, stone: 3 },                    // 마을 → 도시
  { food: 6, wood: 4, stone: 5, iron: 4 },           // 도시 → 왕국
  { food: 8, wood: 4, stone: 6, iron: 6, gold: 6 },  // 왕국 → 제국
];

// 라운드마다 생산량 [마을, 도시, 왕국, 제국]
export const PRODUCTION = {
  rich:   [3, 4, 5, 6], // 풍부한 자원(특산 자원)
  normal: [1, 1, 2, 2], // 보통 자원
  poor:   [0, 0, 0, 0], // 부족한 자원
};

export const START_AMOUNT = { rich: 5, normal: 2, poor: 0 };

// 특산품 공방: 특산 자원 생산 +2 (나라마다 최대 2개)
export const WORKSHOP = { cost: { food: 2, wood: 2, stone: 2 }, bonus: 2, max: 2 };

export const TIMES = {      // 초 단위
  prep: 120,
  minigame: 60,
  trade: 210,   // 3분 30초 → 준비 2분 + 6라운드 × (1분 + 3분 30초 + 10초) = 30분
  event: 10,
};

// 게임 길이 (선생님 설정에서 고르기) - 초 단위
export const LENGTHS = {
  20: { prep: 90, minigame: 45, trade: 120, event: 8 },   // 약 19분
  30: { prep: 120, minigame: 60, trade: 210, event: 10 }, // 30분
  40: { prep: 150, minigame: 75, trade: 290, event: 10 }, // 40분
};

// 기능 켜고 끄기 (선생님 설정) - 처음 값
export const FEATURE_DEFAULTS = {
  minigame: true, events: true, goods: true, world: true, aid: true, war: true,
  unlock: true,     // 라운드마다 기능이 하나씩 열려요
  mission: true,    // 🕵️ 라운드마다 나라별 비밀 임무
  tutorial: true,   // 📱 학생이 각자 튜토리얼(연습)을 끝내야 게임을 시작할 수 있어요
  sound: true,      // 선생님 화면 효과음
  studentSound: false, // 학생 태블릿 효과음
};
// 기능이 열리는 라운드 (unlock 이 켜져 있을 때). 준비 시간(0라운드)에는 무역만 할 수 있어요.
export const UNLOCK = { goods: 2, world: 2, aid: 3, war: 4 };
export const FEATURE_INFO = {
  goods: { icon: '🏭', name: '공장', how: '「영토·건설」 탭의 공장에서 원료로 🚗 자동차·💾 반도체를 만들어 수출해 보세요.' },
  world: { icon: '🤝', name: '세계 과제', how: '「무역」 탭 맨 위의 협동 프로젝트에 자원을 보태거나, 국제 입찰에 참여해 보세요.' },
  aid:   { icon: '🎁', name: '원조와 도움 요청', how: '「무역」 탭에서 🎁 원조 보내기 / 🙏 도움 요청을 고를 수 있어요.' },
  war:   { icon: '⚔️', name: '전쟁', how: '「전쟁」 탭이 생겼어요. 하지만 전쟁은 모두에게 손해예요!' },
};

// 미니게임 문제 세트 (선생님 설정에서 고르기)
export const QSETS = {
  nature: { file: 'questions.json', name: '세계의 자연환경 (2학기 1단원)' },
  market: { file: 'questions-market.json', name: '시장경제와 경제성장 (60~93쪽)' },
  review: { file: 'questions-review.json', name: '세계 속의 무역 정리 (94~111쪽, 수업 뒤)' },
};

// 게임이 끝난 뒤 학생 태블릿에 나오는 되돌아보기 질문 (답은 선생님 화면에 모여요)
export const REFLECT_QS = [
  '우리 나라에 없거나 부족한 자원은 어떻게 구했나요?',
  '다른 나라와 서로 도움을 주고받은 일이 있었나요? 그때 어떤 생각이 들었나요?',
  '게임을 하며 새로 알게 되거나 궁금해진 점을 써 봐요.',
];

// 관세 사건: 한 나라가 수입하는 자원에 관세를 매겨요 (교과서 108쪽)
export const TARIFF = { exporterLoss: 100, importerGain: 50, protectBonus: 1 };
// 무역항 나라: 다른 나라끼리 무역할 때마다 수수료를 받아요 (교과서 104쪽 싱가포르)
export const PORT = { fee: 30, perCountries: 10 }; // 10개 나라마다 1곳 (최소 1곳, 나라가 3개 이상일 때)

export const TOTAL_ROUNDS = 6;
export const MAX_COUNTRIES = 6;   // 처음 정해진 나라 수 (선생님 화면에서 바꿀 수 있어요)
export const COUNTRY_RANGE = [2, 30];
export const MAX_PENDING_OFFERS = 3;

export const WAR = {
  lossRate: 0.4,     // 양쪽 자원 40% 손실
  lootRate: 0.1,     // 승자가 상대 남은 자원의 10% 획득
  halfRounds: 2,     // 2라운드 동안 생산 반감
};

// 공산품: 원료를 가공해서 만드는 상품 (교과서 100~101쪽: 원료를 수입해 상품을 만들어 수출)
// round: 이 라운드부터 공장에서 만들 수 있어요 (라운드마다 새 공장이 열려요)
export const GOODS = ['car', 'chip', 'snack', 'chair', 'ship', 'ring', 'robot'];
export const GOODS_INFO = {
  car:   { name: '자동차', icon: '🚗', round: 2, recipe: { iron: 3, stone: 1 }, techRecipe: { iron: 2, stone: 1 }, gdp: 200 },
  chip:  { name: '반도체', icon: '💾', round: 2, recipe: { gold: 2, stone: 2 }, techRecipe: { gold: 1, stone: 2 }, gdp: 250 },
  snack: { name: '과자', icon: '🍪', round: 3, recipe: { food: 3, wood: 1 }, techRecipe: { food: 2, wood: 1 }, gdp: 150 },
  chair: { name: '가구', icon: '🪑', round: 3, recipe: { wood: 3, iron: 1 }, techRecipe: { wood: 2, iron: 1 }, gdp: 180 },
  ship:  { name: '배', icon: '🚢', round: 4, recipe: { iron: 3, wood: 2 }, techRecipe: { iron: 2, wood: 2 }, gdp: 300 },
  ring:  { name: '장신구', icon: '💍', round: 5, recipe: { gold: 3, iron: 1 }, techRecipe: { gold: 2, iron: 1 }, gdp: 280 },
  robot: { name: '로봇', icon: '🤖', round: 6, recipe: { iron: 2, gold: 2, stone: 1 }, techRecipe: { iron: 1, gold: 2, stone: 1 }, gdp: 350 },
};
// 지금 라운드에 열린 공산품인가요? (기능 하나씩 열기를 끄면 첫 공장들은 처음부터 열려요)
export function goodsOpen(g, round, unlockOn = true) {
  const r = GOODS_INFO[g]?.round ?? 1;
  return round >= (unlockOn ? r : r - 1);
}
export const GOODS_RULE = {
  importGdp: 50,     // 공산품을 수입한 나라: 생활이 풍족해져 1개당 +50만 원
  marketGdp: 100,    // 세계 시장에 그냥 팔면 1개당 +100만 원 (다른 나라에 수출하면 위 gdp만큼)
  techShare: 1 / 3,  // 기술 나라 비율 (자원은 부족해도 공산품을 적은 원료로 만들어요)
};
// 자원 + 공산품 (무역할 수 있는 모든 것)
export const ITEMS = [...RES, ...GOODS];
export const ITEM_INFO = { ...RES_INFO, ...GOODS_INFO };

// 세계 과제: 라운드마다 무역·건설 시간에 열려요 (교과서 106~107쪽: 상호 의존과 경쟁)
export const WORLD_TASKS = { 2: 'project', 3: 'bid', 5: 'project', 6: 'bid' };
export const PROJECTS = [
  { id: 'phone', icon: '📱', name: '스마트폰 만들기',
    desc: '여러 나라의 부품과 자원을 모아야 만들 수 있어요. 전 세계 무역의 결과로 만들어지는 스마트폰!',
    need: { chip: 1, gold: 3, iron: 3, stone: 2 }, minCountries: 3, gdp: 300, peace: 5 },
  { id: 'battery', icon: '🔋', name: '전기차 배터리 만들기',
    desc: '흑연(돌)과 광물을 모아 배터리를 만들고, 자동차에 달아요. 서로 잘하는 것을 모아 함께 만들어요!',
    need: { car: 1, stone: 4, iron: 3, gold: 2 }, minCountries: 3, gdp: 300, peace: 5 },
];
export const BIDS = [
  { id: 'bridge', icon: '🌉', name: '인도에 큰 다리 건설', desc: '다리를 지을 나라를 뽑아요. 자원을 가장 많이 걸고 입찰한 나라가 공사를 맡아요!',
    res: ['stone', 'iron', 'wood'], gdp: 600 },
  { id: 'port', icon: '⚓', name: '자동화 항만 건설', desc: '배가 머무는 최신 항만을 지을 나라를 뽑아요. 기술 나라는 입찰 점수가 1.2배예요!',
    res: ['iron', 'gold', 'stone'], gdp: 600 },
];
export const BID_TECH_BONUS = 1.2;

// 1인당 GDP (단위: 만 원, 1000 = 1,000만 원) - 게임의 점수예요.
export const GDP = {
  start: 1000,
  perRound: [100, 250, 450, 700], // 라운드마다 버는 GDP [마을, 도시, 왕국, 제국] - 발전할수록 많이 벌어요
  perCorrect: 50,    // 미니게임 정답 1개당
  firstBonus: 100,   // 미니게임 1등
  coopBonus: 100,    // 협동 미션 성공 시 모든 나라
  trade: 150,        // 무역 성공 시 두 나라 모두
};

// 🌍 우리 나라 1인당 GDP는 어느 나라와 비슷할까? (1년 기준, 2024년 무렵 대략의 값, 단위: 만 원)
// 이 단계를 넘을 때마다 학생에게 알려 줘요. 처음(1,000만 원)은 태국과 비슷해요.
export const GDP_COMPARE = [
  { at: 1000, name: '태국' },
  { at: 1400, name: '브라질' },
  { at: 1750, name: '중국' },
  { at: 2300, name: '칠레' },
  { at: 3000, name: '폴란드' },
  { at: 3900, name: '포르투갈' },
  { at: 4500, name: '일본' },
  { at: 5000, name: '대한민국', korea: true },
  { at: 6400, name: '프랑스' },
  { at: 7600, name: '독일' },
  { at: 11800, name: '미국' },
];

// 세계 평화 점수 (0~100) - 선생님 화면에서 볼 수 있어요.
export const PEACE = {
  start: 60,
  trade: 3,          // 무역 성공
  aid: 5,            // 원조
  tradeFail: -2,     // 무역 거절·실패
  war: -15,          // 전쟁
  crisisBelow: 30,   // 이 점수 밑으로 떨어지면 세계대공황
  recoverAt: 40,     // 이 점수 이상으로 오르면 대공황 끝
  crisisRate: 0.5,   // 대공황 동안 생산량 (0.5 = 절반)
};

export const FLAGS = [
  '🦁', '🐯', '🐉', '🦅', '🐻', '🐺', '🦊', '🐬', '🐢', '🦄', '🐘', '🦉',
  '🌸', '🌻', '🍀', '🌙', '⭐', '🔥', '🌊', '⛰️', '🌋', '🍎', '⚓', '🛡️',
];

export const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e84393', '#c8a26a', '#cfd8e3',
];

export const PHASE_NAME = {
  lobby: '참가 대기',
  prep: '준비 시간',
  minigame: '미니게임',
  trade: '무역·건설',
  event: '사건 카드',
  end: '게임 끝',
};
