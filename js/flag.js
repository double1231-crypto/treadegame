// 직사각형(3:2) 국기. 무늬 + 색 3개 + 가운데 문장(이모지)으로 만들어요.
// 국기 정보: c.design = { p: 무늬, c: [색1, 색2, 색3] },  c.flag = 문장 이모지 ('' 이면 없음)

export const FLAG_PATTERNS = [
  { id: 'h3',     name: '가로 세 줄' },
  { id: 'v3',     name: '세로 세 줄' },
  { id: 'h2',     name: '가로 두 줄' },
  { id: 'cross',  name: '십자' },
  { id: 'circle', name: '가운데 원' },
  { id: 'tri',    name: '삼각형' },
  { id: 'diag',   name: '대각선' },
  { id: 'plain',  name: '한 색' },
];

export const FLAG_COLORS = [
  '#d62828', '#f77f00', '#ffd23f', '#2b9348', '#1abc9c', '#1d4ed8',
  '#56b4f5', '#7b2cbf', '#e84393', '#8d5524', '#ffffff', '#111111',
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const okColor = (x) => (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x) ? x : null);

// 선생님 PC에서 받은 값을 안전하게 정리
export function cleanDesign(d, fallbackColor = '#1d4ed8') {
  const p = FLAG_PATTERNS.some((x) => x.id === d?.p) ? d.p : 'plain';
  const cs = Array.isArray(d?.c) ? d.c : [];
  return { p, c: [okColor(cs[0]) || fallbackColor, okColor(cs[1]) || '#ffffff', okColor(cs[2]) || '#111111'] };
}

// 어두운 배경에서도 잘 보이는 대표 색 (테두리·그래프에 쓰는 나라 색)
export function nationColor(design) {
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  return design.c.find((x) => lum(x) > 0.18 && lum(x) < 0.97) || design.c.find((x) => lum(x) > 0.18) || '#7fb6ff';
}

// 60x40 좌표의 국기 모양들 (다른 그림 안에 넣을 수도 있게 따로 둠)
export function flagShapes(c) {
  const d = c.design || { p: 'plain', c: [c.color || '#1d4ed8', '#ffffff', '#111111'] };
  const [a, b, k] = d.c;
  let s;
  switch (d.p) {
    case 'h3': s = `<rect width="60" height="40" fill="${a}"/><rect y="13.33" width="60" height="13.34" fill="${b}"/><rect y="26.67" width="60" height="13.33" fill="${k}"/>`; break;
    case 'v3': s = `<rect width="60" height="40" fill="${a}"/><rect x="20" width="20" height="40" fill="${b}"/><rect x="40" width="20" height="40" fill="${k}"/>`; break;
    case 'h2': s = `<rect width="60" height="40" fill="${a}"/><rect y="20" width="60" height="20" fill="${b}"/>`; break;
    case 'cross': s = `<rect width="60" height="40" fill="${a}"/><rect x="16" width="8" height="40" fill="${b}"/><rect y="16" width="60" height="8" fill="${b}"/>`; break;
    case 'circle': s = `<rect width="60" height="40" fill="${a}"/><circle cx="30" cy="20" r="11" fill="${b}"/>`; break;
    case 'tri': s = `<rect width="60" height="20" fill="${a}"/><rect y="20" width="60" height="20" fill="${k}"/><path d="M0 0 L26 20 L0 40Z" fill="${b}"/>`; break;
    case 'diag': s = `<rect width="60" height="40" fill="${a}"/><path d="M60 0 L60 40 L0 40Z" fill="${b}"/>`; break;
    default: s = `<rect width="60" height="40" fill="${a}"/>`;
  }
  const emb = c.flag && c.flag !== '🏳️' ? c.flag : '';
  // 무늬마다 문장이 잘 보이는 자리
  const ex = d.p === 'tri' ? 9 : d.p === 'cross' ? 20 : 30;
  if (emb) s += `<text x="${ex}" y="21" font-size="${d.p === 'tri' || d.p === 'cross' ? 11 : 17}" text-anchor="middle" dominant-baseline="central">${esc(emb)}</text>`;
  return s;
}

export function flagSvg(c, cls = '') {
  return `<svg class="nflag ${cls}" viewBox="0 0 60 40" role="img" aria-label="${esc(c.name || '')} 국기"><g>${flagShapes(c)}</g><rect width="60" height="40" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1"/></svg>`;
}
