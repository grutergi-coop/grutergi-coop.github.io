// 파이어베이스 공통 초기화 — 모든 화면이 이 파일 하나로 연결합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 링크 값 검사: 사이트 안 경로, #앵커, https 주소만 허용 (javascript: 같은 위험한 주소 차단)
export function safeHref(v) {
  const s = String(v || "").trim();
  return /^(https:\/\/|\/|#|notice\/|member\/|\.\.\/)/.test(s) && !/^\/\//.test(s) ? s : "#";
}

// 글자만 넣기 (HTML로 해석하지 않음 → 스크립트 삽입 차단)
export function setText(el, v) { if (el) el.textContent = v == null ? "" : String(v); }

export function el(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "href") e.setAttribute("href", safeHref(v));
    else e.setAttribute(k, v);
  }
  if (text != null) e.textContent = String(text);
  return e;
}
