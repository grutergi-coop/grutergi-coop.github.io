// 방문 수 · 오류 알림판 — 모든 화면에 넣습니다.
// 개인정보 없음: 하루 단위 '숫자'만 셉니다. 누가 왔는지는 알 수 없습니다.
//  · 화면 종류, 기기 크기 갈래(폰·패드·컴퓨터), 들어온 시각(한국 시간, 몇 시)
//  · 하루 첫 방문일 때만: 처음 온 기기인지/다시 온 기기인지, 운영체제·브라우저 종류, 들어온 경로(직접·검색·SNS 등),
//    지역(시·도), 기기 종류(아이폰·갤럭시 등), 화면 폭 갈래
//  · 머문 시간(10초·30초·1분·3분을 넘겼는지), 첫 화면을 얼마나 내려 보았는지(25·50·75·100%)
//  IP·주소·이름·입력 내용·기기 고유번호·기기 모델명은 보내지 않습니다.
//  지역은 /api/where 가 시·도 이름 하나만 알려 주고, 여기서는 그 칸의 숫자 하나만 1 올립니다.
import { db } from "./fb.js";
import { doc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const kst = () => new Date(Date.now() + 9 * 3600e3);
const today = () => kst().toISOString().slice(0, 10); // 한국 날짜
const hourKey = () => "h" + String(kst().getUTCHours()).padStart(2, "0"); // 한국 시간 몇 시
const REGIONS = ["seoul", "busan", "daegu", "incheon", "gwangju", "daejeon", "ulsan", "sejong", "gyeonggi", "gangwon", "chungbuk", "chungnam", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju", "abroad", "etc"];
const wait = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

export function deviceType() {
  const w = Math.min(screen.width, screen.height), ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (w >= 600 && /Android|Mobile/i.test(ua))) return "tablet";
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
// 기기 종류: 모델명은 이 기기 안에서 갈래를 고르는 데만 쓰고 보내지 않습니다
async function modelKind(dt) {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "dv_ipad";
  if (/iPhone|iPod/.test(ua)) return "dv_iphone";
  if (/Android/.test(ua)) {
    let model = (ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/|\))/) || [])[1] || "";
    if ((!model || model === "K") && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const v = await wait(navigator.userAgentData.getHighEntropyValues(["model"]), 800, null);
      model = (v && v.model) || "";
    }
    const galaxy = /^(SM-|SAMSUNG|Galaxy)/i.test(model) || /SamsungBrowser/.test(ua);
    return galaxy ? (dt === "tablet" ? "dv_galtab" : "dv_galaxy") : "dv_android";
  }
  if (/Windows/.test(ua)) return "dv_win";
  if (/Macintosh|Mac OS X/.test(ua)) return "dv_mac";
  return "dv_etc";
}
// 화면 폭 갈래 (지금 보이는 창의 가로 폭)
function screenKind() {
  const w = innerWidth || screen.width;
  return w < 380 ? "sc_1" : w < 600 ? "sc_2" : w < 1024 ? "sc_3" : w < 1600 ? "sc_4" : "sc_5";
}
// 지역(시·도): 이 사이트의 /api/where 만 묻고, 정해진 이름이 아니면 '알 수 없음'
async function regionKind() {
  const r = await wait(fetch("/api/where", { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
    .then((res) => (res.ok ? res.json() : null)), 1500, null);
  return "rg_" + (r && REGIONS.includes(r.r) ? r.r : "etc");
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
let visitDone = Promise.resolve();

// 1) 방문 수: 같은 기기에서 같은 화면 종류는 하루 한 번만 셉니다.
async function countVisit() {
  const day = today(), kind = pageKind(), key = "gr-visit-" + day + "-" + kind;
  if (store.get(key)) return;
  store.set(key, "1");
  const dt = deviceType();
  const data = { total: increment(1), [kind]: increment(1), [dt]: increment(1), [hourKey()]: increment(1) };
  let more = null;
  // 오늘 이 기기의 첫 방문이면: 방문자 수와 처음/다시, 운영체제, 브라우저, 들어온 경로, 지역, 기기 종류, 화면 폭
  const dayKey = "gr-visitor-" + day;
  if (!store.get(dayKey)) {
    store.set(dayKey, "1");
    const seen = store.get("gr-seen"); store.set("gr-seen", "1");
    const [rg, dv] = await Promise.all([regionKind(), modelKind(dt)]);
    Object.assign(data, { uv: increment(1), [seen ? "rv" : "nv"]: increment(1), [osKind()]: increment(1), [browserKind()]: increment(1), [sourceKind()]: increment(1) });
    more = { [rg]: increment(1), [dv]: increment(1), [screenKind()]: increment(1) };
  }
  try { await setDoc(doc(db, "visits", day), data, { merge: true }); } catch {}
  // 지역·기기 종류·화면 폭은 칸이 많아 '방문 수 더 보기' 문서(visitx)에 따로 셉니다
  if (more) { try { await setDoc(doc(db, "visitx", day), more, { merge: true }); } catch {} }
}

// 2) 한 칸만 1 올리기 (머문 시간·내려 본 정도). 같은 기기에서 하루 한 번만
async function bump(k) {
  const day = today(), key = "gr-" + k + "-" + day;
  if (store.get(key)) return;
  store.set(key, "1");
  await visitDone;
  try { await setDoc(doc(db, "visitx", day), { [k]: increment(1) }, { merge: true }); } catch {}
}

// 3) 머문 시간: 화면이 실제로 보이는 동안만 셉니다 (10초·30초·1분·3분)
function watchStay() {
  const marks = [[10, "st_10"], [30, "st_30"], [60, "st_60"], [180, "st_180"]];
  let sec = 0;
  const t = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    sec++;
    marks.forEach(([s, k]) => { if (sec === s) bump(k); });
    if (sec >= 180) clearInterval(t);
  }, 1000);
}

// 4) 첫 화면을 얼마나 내려 보았는지 (25·50·75·100%)
function watchDepth() {
  if (pageKind() !== "home") return;
  const marks = [[0.25, "sd_25"], [0.5, "sd_50"], [0.75, "sd_75"], [0.97, "sd_100"]];
  let best = 0, tick = 0;
  const check = () => {
    tick = 0;
    const h = document.documentElement.scrollHeight - innerHeight;
    if (h <= 0) return;
    const r = Math.min(1, scrollY / h);
    marks.forEach(([m, k]) => { if (r >= m && best < m) bump(k); });
    best = Math.max(best, r);
    if (best >= 0.97) removeEventListener("scroll", onScroll);
  };
  const onScroll = () => { if (!tick) tick = requestAnimationFrame(check); };
  addEventListener("scroll", onScroll, { passive: true });
}

// 5) 오류 알림판: 같은 오류는 기기마다 하루 한 번, 화면마다 최대 5가지만 올립니다.
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

visitDone = countVisit();
watchStay();
watchDepth();
