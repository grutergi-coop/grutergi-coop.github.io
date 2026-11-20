// 방문 수 · 오류 알림판 — 모든 화면에 넣습니다.
// 개인정보 없음: 화면 종류와 기기 종류(폰·패드·컴퓨터)만 하루 단위 숫자로 셉니다. IP·이름·입력 내용은 보내지 않습니다.
import { db } from "./fb.js";
import { doc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
export function deviceType() {
  const w = Math.min(screen.width, screen.height), ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (w >= 600 && /Android|Mobile/i.test(ua))) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua) || w < 600) return "mobile";
  return "desktop";
}
function pageKind() {
  const p = location.pathname;
  if (/\/admin\//.test(p)) return "admin";
  if (/\/member\//.test(p)) return "member";
  if (/\/notice\//.test(p)) return "notice";
  if (/\/(index\.html)?$/.test(p)) return "home";
  return "other";
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

// 1) 방문 수: 같은 기기에서 같은 화면 종류는 하루 한 번만 셉니다.
async function countVisit() {
  const day = today(), kind = pageKind(), key = "gr-visit-" + day + "-" + kind;
  if (store.get(key)) return;
  store.set(key, "1");
  const data = { total: increment(1), [kind]: increment(1), [deviceType()]: increment(1) };
  try { await setDoc(doc(db, "visits", day), data, { merge: true }); } catch {}
}

// 2) 오류 알림판: 같은 오류는 기기마다 하루 한 번, 화면마다 최대 5가지만 올립니다.
let sent = 0;
async function reportError(message) {
  if (sent >= 5) return;
  const msg = String(message || "").slice(0, 300);
  if (!msg) return;
  const page = location.pathname.slice(0, 100);
  let h = 0; for (const c of msg + page) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const id = "e" + h.toString(36), key = "gr-err-" + today() + "-" + id;
  if (store.get(key)) return;
  store.set(key, "1"); sent++;
  const ref = doc(db, "errors", id);
  // 읽기 권한 없이 동작: 먼저 횟수 올리기를 시도하고, 처음 보는 오류면 새로 만듭니다.
  try { await updateDoc(ref, { count: increment(1), lastAt: serverTimestamp() }); }
  catch { try { await setDoc(ref, { msg, page, count: 1, firstAt: serverTimestamp(), lastAt: serverTimestamp() }); } catch {} }
}
addEventListener("error", (e) => reportError((e.message || "오류") + (e.filename ? " @" + e.filename.split("/").pop() + ":" + e.lineno : "")));
addEventListener("unhandledrejection", (e) => reportError("Promise: " + (e.reason && e.reason.message || e.reason)));

countVisit();
