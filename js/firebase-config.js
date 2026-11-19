// 파이어베이스 웹 앱 설정 — 파이어베이스 콘솔 > 프로젝트 설정 > 내 앱에서 복사한 값으로 바꿉니다.
// 이 값은 공개되어도 되는 식별 정보입니다. 데이터 보호는 firestore.rules가 맡습니다.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
