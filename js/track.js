// 방문 수 · 오류 알림판 — 모든 화면에 넣습니다.
// 개인정보 없음: 하루 단위 '숫자'만 셉니다. 누가 왔는지는 알 수 없습니다.
//  · 화면 종류, 기기 종류(폰·패드·컴퓨터), 들어온 시각(한국 시간, 몇 시)
//  · 하루 첫 방문일 때만: 처음 온 기기인지/다시 온 기기인지, 운영체제·브라우저 종류, 들어온 경로(직접·검색·SNS 등)
//  IP·주소·이름·입력 내용·기기 고유번호는 보내지 않습니다.
import { db } from "./fb.js";
import { doc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const kst = () => new Date(Date.now() + 9 * 3600e3);
const today = () => kst().toISOString().slice(0, 10); // 한국 날짜
const hourKey = () => "h" + String(kst().getUTCHours()).padStart(2, "0"); // 한국 시간 몇 시
export function deviceType() {
  const w = Math.min(screen.width, screen.height), ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (w >= 600 && /Android|Mobile/i.test(ua))) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua) || w < 600) return "mobile";
  return "desktop";
}
function osKind() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "os_ios";
  if (/Android/.test(ua)) return "os_android";
  if (/Windows/.test(ua)) return "os_win";
  if (/Macintosh|Mac OS X/.test(ua)) return "os_mac";
  return "os_etc";
}
function browserKind() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "br_kakao";
  if (/NAVER|Whale/i.test(ua)) return "br_naver";
  if (/SamsungBrowser/.test(ua)) return "br_samsung";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "br_edge";
  if (/CriOS|Chrome\//.test(ua)) return "br_chrome";
  if (/Safari\//.test(ua)) return "br_safari";
  return "br_etc";
}
// 들어온 경로: 주소는 보내지 않고 갈래만 셉니다
function sourceKind() {
  let host = "";
  try { host = document.referrer ? new URL(document.referrer).hostname : ""; } catch { return "src_etc"; }
  if (!host) return /KAKAOTALK|Instagram|FBAN|FBAV|BAND/i.test(navigator.userAgent) ? "src_sns" : "src_direct";
  if (host === location.hostname || /grutergi/.test(host)) return "src_direct";
  if (/google\.|naver\.com$|search\.naver|daum\.net$|bing\.com$|yahoo\.|zum\.com$/.test(host) && !/blog\.naver|cafe\.naver|band\./.test(host)) return "src_search";
  if (/kakao|instagram|facebook|band\.us|blog\.naver|cafe\.naver|youtube|threads|t\.co$|x\.com$/.test(host)) return "src_sns";
  return "src_etc";
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
  const data = { total: increment(1), [kind]: increment(1), [deviceType()]: increment(1), [hourKey()]: increment(1) };
  // 오늘 이 기기의 첫 방문이면: 방문자 수와 처음/다시, 운영체제, 브라우저, 들어온 경로
  const dayKey = "gr-visitor-" + day;
  if (!store.get(dayKey)) {
    store.set(dayKey, "1");
    const seen = store.get("gr-seen"); store.set("gr-seen", "1");
    Object.assign(data, { uv: increment(1), [seen ? "rv" : "nv"]: increment(1), [osKind()]: increment(1), [browserKind()]: increment(1), [sourceKind()]: increment(1) });
  }
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
