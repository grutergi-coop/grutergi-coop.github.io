// 로그인 공통 — 이메일 링크 로그인 · 로그인 기록 · 접속 현황(하트비트) · 자동 로그아웃
import { auth, db } from "./fb.js";
import { deviceType } from "./track.js";
import {
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut,
  setPersistence, browserSessionPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// 관리자는 브라우저를 닫으면 로그아웃, 조합원은 이 기기에 로그인 유지
export async function usePersistence(role) {
  await setPersistence(auth, role === "admin" ? browserSessionPersistence : browserLocalPersistence);
}

export async function sendLink(email, say) {
  try {
    await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
    store.set("grEmail", email);
    say(email + " 으로 로그인 링크를 보냈습니다. 같은 기기·같은 브라우저에서 메일의 링크를 눌러 주세요.", true);
  } catch (e) {
    say("링크를 보내지 못했습니다. 이메일 주소를 확인하거나 잠시 후 다시 시도해 주세요.", false);
  }
}

// 메일 링크로 들어온 경우 로그인 마무리 (다른 기기에서 열면 주소를 다시 묻지 않고 안내만 합니다)
export async function finishLinkIfAny(say) {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  const email = store.get("grEmail");
  if (!email) { say("로그인 링크는 요청한 기기와 같은 브라우저에서 열어 주세요. 이 기기에서 다시 요청해 주세요.", false); history.replaceState(null, "", location.pathname); return; }
  try {
    await signInWithEmailLink(auth, email, location.href);
    store.del("grEmail");
  } catch {
    say("링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.", false);
  }
  history.replaceState(null, "", location.pathname);
}

export async function logLogin(user, type) {
  try {
    await addDoc(collection(db, "loginLogs"), {
      uid: user.uid, email: user.email || "", type, at: serverTimestamp(),
      device: deviceType(), page: location.pathname.slice(0, 100)
    });
  } catch {}
}

let beatTimer = null, idleTimer = null, lastAct = Date.now();
export function startSession(user, role, onTimeout) {
  const beat = () => setDoc(doc(db, "sessions", user.uid), {
    uid: user.uid, email: user.email || "", page: location.pathname.slice(0, 100),
    device: deviceType(), lastSeen: serverTimestamp(), role
  }).catch(() => {});
  beat();
  clearInterval(beatTimer); beatTimer = setInterval(beat, 60 * 1000);

  const once = "gr-login-" + user.uid + "-" + role;
  try { if (!sessionStorage.getItem(once)) { sessionStorage.setItem(once, "1"); logLogin(user, "login"); } } catch {}

  getDoc(doc(db, "securityConfig", "main")).then((s) => {
    const mins = s.exists() && Number.isInteger(s.data().idleMinutes) ? s.data().idleMinutes : 30;
    const bump = () => { lastAct = Date.now(); };
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) => addEventListener(ev, bump, { passive: true }));
    clearInterval(idleTimer);
    idleTimer = setInterval(async () => {
      if (Date.now() - lastAct > mins * 60 * 1000) {
        clearInterval(idleTimer);
        await endSession(user, "timeout");
        if (onTimeout) onTimeout(mins);
      }
    }, 30 * 1000);
  }).catch(() => {});
}

export async function endSession(user, type = "logout") {
  clearInterval(beatTimer); clearInterval(idleTimer);
  if (user) {
    await logLogin(user, type);
    await deleteDoc(doc(db, "sessions", user.uid)).catch(() => {});
    try { sessionStorage.clear(); } catch {}
  }
  await signOut(auth).catch(() => {});
}
