// Firebase 설정 (README의 「Firebase 연결하기」 참고)
// Firebase 콘솔에서 복사한 firebaseConfig 내용을 아래 { } 안에 그대로 붙여 넣으세요.
// databaseURL 줄이 꼭 있어야 해요. 비워 두면(null) 예전 방식(PeerJS)으로 연결해요.

export const firebaseConfig = {
  apiKey: "AIzaSyCaWfYxQzP5RqCG3vsPPHw-BiXzpa6leXE",
  authDomain: "tradegame-oga2026.firebaseapp.com",
  databaseURL: "https://tradegame-oga2026-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tradegame-oga2026",
  storageBucket: "tradegame-oga2026.firebasestorage.app",
  messagingSenderId: "955502603410",
  appId: "1:955502603410:web:63c2e7f633a58af44cca4b"
};

/* 붙여 넣은 모습 예시:
export const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "trade-game-1234.firebaseapp.com",
  databaseURL: "https://trade-game-1234-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "trade-game-1234",
  storageBucket: "trade-game-1234.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/
