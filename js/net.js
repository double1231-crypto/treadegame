// 통신 모듈. 게임 코드는 이 파일의 hostRoom / joinRoom 만 사용합니다.
// 나중에 Firebase 로 바꾸려면 같은 모양의 함수를 하나 더 만들고 pickTransport() 에 추가하면 됩니다.
//
// hostRoom(code, { onMessage(clientId, msg), onConnect(clientId), onDisconnect(clientId), onError(err) })
//   -> Promise<{ send(clientId, msg), broadcast(msg), clients(), close() }>
// joinRoom(code, { onMessage(msg), onStatus(status) })   status: 'connecting' | 'open' | 'closed' | 'notfound'
//   -> { send(msg), close() }

const PREFIX = 'tradeciv6-';

export function pickTransport() {
  const p = new URLSearchParams(location.search);
  return p.get('net') === 'local' ? 'local' : 'peer';
}

export function hostRoom(code, h) {
  return pickTransport() === 'local' ? localHost(code, h) : peerHost(code, h);
}

export function joinRoom(code, h) {
  return pickTransport() === 'local' ? localJoin(code, h) : peerJoin(code, h);
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
