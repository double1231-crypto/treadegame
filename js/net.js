// 통신 모듈. 게임 코드는 이 파일의 hostRoom / joinRoom 만 사용합니다.
// 나중에 Firebase 로 바꾸려면 같은 모양의 함수를 하나 더 만들고 pickTransport() 에 추가하면 됩니다.
//
// hostRoom(code, { onMessage(clientId, msg), onConnect(clientId), onDisconnect(clientId), onError(err) })
//   -> Promise<{ send(clientId, msg), broadcast(msg), clients(), close() }>
// joinRoom(code, { onMessage(msg), onStatus(status) })   status: 'connecting' | 'open' | 'closed' | 'notfound'
//   -> { send(msg), close() }

import { firebaseConfig } from './firebase-config.js';

const PREFIX = 'tradeciv6-';

// ?net=local → 한 컴퓨터 시험용, ?net=peer → PeerJS 강제, 그 밖에는 Firebase 설정이 있으면 Firebase
export function pickTransport() {
  const n = new URLSearchParams(location.search).get('net');
  if (n === 'local') return 'local';
  if (n === 'peer') return 'peer';
  if (n === 'fbmock' && window.top.__fbMock) return 'fire'; // 개발용: 가짜 Firebase로 시험
  return firebaseConfig && firebaseConfig.databaseURL ? 'fire' : 'peer';
}

export function hostRoom(code, h) {
  const t = pickTransport();
  return t === 'local' ? localHost(code, h) : t === 'fire' ? fireHost(code, h) : peerHost(code, h);
}

export function joinRoom(code, h) {
  const t = pickTransport();
  return t === 'local' ? localJoin(code, h) : t === 'fire' ? fireJoin(code, h) : peerJoin(code, h);
}

/* ---------------- Firebase Realtime Database ----------------
   선생님 PC와 태블릿이 모두 Google 서버를 거쳐 메시지를 주고받아요. (학교 와이파이·LTE 어디서나)
   rooms/<방>/host          선생님 화면이 켜져 있으면 있음
   rooms/<방>/clients/<id>  접속한 태블릿
   rooms/<방>/up            태블릿 → 선생님 (읽으면 지움)
   rooms/<방>/view/<id>     선생님 → 태블릿 게임 화면 (최신 것만 덮어씀)
   rooms/<방>/down/<id>     선생님 → 태블릿 알림·오류 (읽으면 지움) */

const FB_VER = '10.12.2';
let fbPromise = null;
function fb() {
  if (new URLSearchParams(location.search).get('net') === 'fbmock') return (fbPromise ||= Promise.resolve(window.top.__fbMock));
  fbPromise ||= Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-database.js`),
  ]).then(([app, d]) => ({ ...d, db: d.getDatabase(app.initializeApp(firebaseConfig)) }));
  return fbPromise;
}
const enc = (m) => JSON.stringify(m);
const dec = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function fireHost(code, h) {
  const F = await fb();
  const { ref, child, get, set, push, remove, onValue, onChildAdded, onChildRemoved, onDisconnect, serverTimestamp } = F;
  const root = ref(F.db, 'rooms/' + code);
  const hostRef = child(root, 'host');
  const me = 'h' + Math.random().toString(36).slice(2, 10);
  // 다른 선생님 화면이 이 방을 쓰는 중이면 안 돼요 (새로고침 직후엔 예전 화면 표시가 잠깐 남아 있어서 조금 기다려 봐요)
  for (let i = 0; ; i++) {
    if (!(await get(hostRef)).exists()) break;
    if (i >= 3) throw { type: 'unavailable-id' };
    await new Promise((r) => setTimeout(r, 1500));
  }
  await Promise.all(['up', 'view', 'down'].map((k) => remove(child(root, k))));

  // 인터넷이 잠깐 끊겼다 이어져도 다시 「선생님 있음」 표시
  onValue(ref(F.db, '.info/connected'), (s) => {
    if (!s.val()) return;
    onDisconnect(hostRef).remove().then(() => set(hostRef, { id: me, at: serverTimestamp() }));
  });

  const clients = new Set();
  onChildAdded(child(root, 'clients'), (s) => { if (!clients.has(s.key)) { clients.add(s.key); h.onConnect?.(s.key); } });
  onChildRemoved(child(root, 'clients'), (s) => { if (clients.delete(s.key)) h.onDisconnect?.(s.key); });
  onChildAdded(child(root, 'up'), (s) => {
    const v = s.val();
    remove(s.ref);
    const msg = v && dec(v.m);
    if (!msg || typeof v.f !== 'string') return;
    if (!clients.has(v.f)) { clients.add(v.f); h.onConnect?.(v.f); }
    h.onMessage(v.f, msg);
  });

  // 게임 화면(state)은 최신 것만 보내면 돼요: 너무 자주 보내지 않고, 같은 내용이면 건너뛰어요.
  const last = new Map(); const pending = new Map(); const timers = new Map();
  const flush = (cid) => {
    timers.delete(cid);
    const s = pending.get(cid); pending.delete(cid);
    if (s == null || last.get(cid) === s) return;
    last.set(cid, s);
    set(child(root, 'view/' + cid), s);
    timers.set(cid, setTimeout(() => { timers.delete(cid); if (pending.has(cid)) flush(cid); }, 150));
  };
  const send = (cid, msg) => {
    if (!clients.has(cid)) return;
    if (msg && msg.t === 'state') {
      pending.set(cid, enc(msg));
      if (!timers.has(cid)) flush(cid);
    } else push(child(root, 'down/' + cid), enc(msg));
  };
  return {
    send,
    broadcast(msg) { for (const cid of clients) send(cid, msg); },
    clients() { return [...clients]; },
    close() { remove(hostRef); },
  };
}

function fireJoin(code, h) {
  const me = 'c' + Math.random().toString(36).slice(2, 10);
  let closed = false, online = false, hostId, lastStatus = null;
  let api = null;
  const unsubs = [];
  const status = (st) => { if (!closed && st !== lastStatus) { lastStatus = st; h.onStatus?.(st); } };
  const update = () => {
    if (!online) status(hostId === undefined ? 'connecting' : 'closed');
    else if (hostId === undefined) status('connecting');
    else status(hostId ? 'open' : 'notfound');
  };
  setTimeout(() => status('connecting'), 0);

  fb().then((F) => {
    if (closed) return;
    const { ref, child, set, push, remove, onValue, onChildAdded, onDisconnect } = F;
    const root = ref(F.db, 'rooms/' + code);
    const pres = child(root, 'clients/' + me);
    const viewRef = child(root, 'view/' + me);
    const downRef = child(root, 'down/' + me);
    api = { F, root, pres, viewRef, downRef };

    unsubs.push(onValue(ref(F.db, '.info/connected'), (s) => {
      online = !!s.val();
      if (online) {
        // 태블릿이 사라지면 서버가 알아서 지워요
        onDisconnect(viewRef).remove();
        onDisconnect(downRef).remove();
        onDisconnect(pres).remove();
        set(pres, true);
      }
      update();
    }));
    // 선생님 화면이 새로 켜지면(새로고침) 'open' 을 다시 알려서 인사(hello)를 다시 해요
    unsubs.push(onValue(child(root, 'host'), (s) => {
      const id = s.exists() ? (s.val().id || 'host') : null;
      if (id && hostId && id !== hostId && lastStatus === 'open') lastStatus = null;
      hostId = id;
      if (id && online) set(pres, true);
      update();
    }));
    unsubs.push(onValue(viewRef, (s) => { const m = s.exists() && dec(s.val()); if (m && !closed) h.onMessage(m); }));
    unsubs.push(onChildAdded(downRef, (s) => { remove(s.ref); const m = dec(s.val()); if (m && !closed) h.onMessage(m); }));
    api.up = (msg) => push(child(root, 'up'), { f: me, m: enc(msg) });
  }).catch(() => status('noserver'));

  return {
    send(msg) {
      if (!api?.up || lastStatus !== 'open') return false;
      api.up(msg);
      return true;
    },
    close() {
      closed = true;
      unsubs.forEach((u) => u());
      if (api) { const { F } = api; for (const r of [api.pres, api.viewRef, api.downRef]) { F.onDisconnect(r).cancel(); F.remove(r); } }
    },
  };
}

/* ---------------- PeerJS (WebRTC) ---------------- */

function peerHost(code, h) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PREFIX + code);
    const conns = new Map();
    let opened = false;
    const api = {
      send(cid, msg) { const c = conns.get(cid); if (c && c.open) c.send(msg); },
      broadcast(msg) { for (const c of conns.values()) if (c.open) c.send(msg); },
      clients() { return [...conns.keys()]; },
      close() { peer.destroy(); },
    };
    peer.on('open', () => { opened = true; resolve(api); });
    peer.on('error', (e) => { if (!opened) reject(e); else h.onError?.(e); });
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000); });
    peer.on('connection', (conn) => {
      const cid = conn.connectionId;
      conn.on('open', () => { conns.set(cid, conn); h.onConnect?.(cid); });
      conn.on('data', (d) => h.onMessage(cid, d));
      const gone = () => { if (conns.delete(cid)) h.onDisconnect?.(cid); };
      conn.on('close', gone);
      conn.on('error', gone);
    });
  });
}

function peerJoin(code, h) {
  const peer = new window.Peer();
  let conn = null;
  let closed = false;
  let retryTimer = null;

  const retry = (ms = 2500) => {
    if (closed) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, ms);
  };

  let stuckTimer = null;
  function connect() {
    if (closed) return;
    if (peer.disconnected) { peer.reconnect(); return; }
    h.onStatus?.('connecting');
    const c = peer.connect(PREFIX + code, { reliable: true });
    conn = c;
    // 방은 있는데 10초 넘게 연결이 안 열리면: 학교 네트워크가 기기끼리 직접 연결(WebRTC)을 막는 경우가 많아요.
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => { if (conn === c && !c.open) h.onStatus?.('blocked'); }, 10000);
    c.on('open', () => { if (conn === c) { clearTimeout(stuckTimer); h.onStatus?.('open'); } });
    c.on('data', (d) => { if (conn === c) h.onMessage(d); });
    c.on('close', () => { if (conn === c) { conn = null; h.onStatus?.('closed'); retry(); } });
    c.on('error', () => { if (conn === c) { conn = null; h.onStatus?.('closed'); retry(); } });
  }

  peer.on('open', connect);
  peer.on('disconnected', () => { if (!closed) setTimeout(() => peer.reconnect(), 1000); });
  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') { conn = null; clearTimeout(stuckTimer); h.onStatus?.('notfound'); retry(3000); }
    else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { h.onStatus?.('noserver'); retry(4000); }
    else if (!conn) retry(3000);
  });

  // 태블릿이 잠들었다 깨어나면 연결 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !(conn && conn.open)) retry(100);
  });

  return {
    send(msg) { if (conn && conn.open) { conn.send(msg); return true; } return false; },
    close() { closed = true; peer.destroy(); },
  };
}

/* ---------------- 같은 브라우저 안에서 테스트용 (BroadcastChannel) ----------------
   주소 끝에 ?net=local 을 붙이면 인터넷 없이 같은 컴퓨터의 여러 탭으로 시험해 볼 수 있어요. */

function localHost(code, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  const clients = new Set();
  ch.onmessage = ({ data }) => {
    if (data.to !== 'host') return;
    if (data.type === 'connect') {
      clients.add(data.from);
      ch.postMessage({ to: data.from, type: 'welcome' });
      h.onConnect?.(data.from);
    } else if (data.type === 'bye') {
      if (clients.delete(data.from)) h.onDisconnect?.(data.from);
    } else if (clients.has(data.from)) {
      h.onMessage(data.from, data.msg);
    }
  };
  ch.postMessage({ to: '*', type: 'hostup' });
  return Promise.resolve({
    send(cid, msg) { ch.postMessage({ to: cid, type: 'msg', msg }); },
    broadcast(msg) { ch.postMessage({ to: '*', type: 'msg', msg }); },
    clients() { return [...clients]; },
    close() { ch.close(); },
  });
}

function localJoin(code, h) {
  const ch = new BroadcastChannel(PREFIX + code);
  const me = 'c' + Math.random().toString(36).slice(2, 10);
  let open = false;
  let timer = null;
  const hello = () => {
    if (open) return;
    h.onStatus?.('connecting');
    ch.postMessage({ to: 'host', from: me, type: 'connect' });
    timer = setTimeout(() => { if (!open) { h.onStatus?.('notfound'); hello(); } }, 2000);
  };
  ch.onmessage = ({ data }) => {
    if (data.to === me && data.type === 'welcome') { open = true; clearTimeout(timer); h.onStatus?.('open'); }
    else if (data.type === 'hostup') { open = false; clearTimeout(timer); hello(); } // 선생님 화면 새로고침
    else if (data.type === 'msg' && open && (data.to === me || data.to === '*')) h.onMessage(data.msg);
  };
  window.addEventListener('beforeunload', () => ch.postMessage({ to: 'host', from: me, type: 'bye' }));
  hello();
  return {
    send(msg) { if (!open) return false; ch.postMessage({ to: 'host', from: me, type: 'msg', msg }); return true; },
    close() { ch.close(); },
  };
}
