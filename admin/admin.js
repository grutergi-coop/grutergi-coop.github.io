// ═══════════════════════════════════════════════════════════════
// 관리자 화면 — 그루터기 사회적협동조합(가칭)
// 대시보드 · 방문 통계 · 홈 화면 · 공고 · 문의 · 조합원 · 보안·기록(접속 현황/로그인 기록/활동 기록/오류 알림판/보안 설정)
// 권한은 화면이 아니라 데이터베이스 보안 규칙(admins 목록)이 지킵니다.
// 모든 내용은 글자로만 넣습니다(HTML 해석 없음). 저장 직전 내용은 타임머신(snapshots)에 보관합니다.
// ═══════════════════════════════════════════════════════════════
import { auth, db, el } from "../js/fb.js";
import { usePersistence, googleSignIn, pinProof, lockAdmin, startSession, endSession, logLogin } from "../js/session.js";
import { HOME, NOTICES } from "../js/defaults.js";
import { renderA4, LAYOUTS, FORMS } from "../js/paper.js";
import { TEMPLATES } from "./templates.js";
import { lineChart, barChart, hBars, donut, heatmap, tileMap, funnel, table, fmt, pct } from "./charts.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, documentId, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
let me = null;

// ── 공통 도구
function toast(t) { const b = $("toast"); b.textContent = t; b.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { b.hidden = true; }, 2600); }
const say = (t, ok) => { const m = $("login-msg"); m.textContent = t; m.className = "msg " + (ok ? "msg-ok" : "msg-err"); m.hidden = false; };
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const when = (ts) => { if (!ts) return "-"; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }); };
function clear() { view.textContent = ""; dirty = false; currentSave = null; dirtyNote = null; }
function h2(t, ...tools) { const bar = el("div", { class: "adm-bar" }); bar.append(el("h2", null, t)); const tb = el("div", { class: "tools" }); tools.forEach((x) => tb.append(x)); bar.append(tb); view.append(bar); }
function btn(t, cls, fn) { const b = el("button", { class: "btn btn-sm " + (cls || "btn-ghost"), type: "button" }, t); b.addEventListener("click", fn); return b; }
function panel(title, hint, host) {
  const p = el("section", { class: "panel" });
  if (title) { const hd = el("div", { class: "panel-head" }); hd.append(el("h3", null, title)); if (hint) hd.append(el("p", null, hint)); p.append(hd); }
  (host || view).append(p); return p;
}
function field(label, value, opts = {}) {
  const id = "f" + Math.random().toString(36).slice(2, 8);
  const w = el("div", { class: "field" + (opts.wide ? " wide" : "") });
  const head = el("div", { class: "field-head" }); head.append(el("label", { for: id }, label)); w.append(head);
  const input = opts.multi ? el("textarea", { id, rows: String(opts.rows || 2) }) : el("input", { id });
  if (opts.max) input.setAttribute("maxlength", String(opts.max));
  if (opts.type) input.setAttribute("type", opts.type);
  if (opts.placeholder) input.setAttribute("placeholder", opts.placeholder);
  input.value = value == null ? "" : String(value);
  if (opts.max && !opts.type) counter(head, input, opts.max);
  w.append(input); if (opts.help) w.append(el("small", null, opts.help));
  return { w, input };
}
// 글자 수 (90%를 넘으면 색이 바뀜)
function counter(host, input, max) {
  const c = el("span", { class: "count", "aria-hidden": "true" }); host.append(c);
  const upd = () => { const n = input.value.length; c.textContent = n + " / " + max; c.classList.toggle("near", n >= max * 0.9); };
  input.addEventListener("input", upd); upd();
}
// 입력한 만큼 늘어나는 글상자 (잘려 보이지 않게)
function autosize(t) { if (!t.offsetParent) return; t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; }
const sizeAll = () => view.querySelectorAll("textarea").forEach(autosize);
new MutationObserver(() => requestAnimationFrame(sizeAll)).observe(view, { childList: true, subtree: true });
view.addEventListener("input", (e) => { if (e.target.tagName === "TEXTAREA") autosize(e.target); markDirty(); });
view.addEventListener("change", (e) => { if (e.target.matches("input,select")) markDirty(); });
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(sizeAll, 150); });

// ── 저장 안 된 변경 표시 · 나가기 전 한 번 더 · ⌘S / Ctrl+S 저장
let dirty = false, currentSave = null, dirtyNote = null;
function markDirty() { if (!currentSave) return; dirty = true; if (dirtyNote) { dirtyNote.textContent = "저장하지 않은 변경이 있습니다"; dirtyNote.classList.add("on"); } }
function cleanState() { dirty = false; if (dirtyNote) { dirtyNote.textContent = "변경 사항 없음"; dirtyNote.classList.remove("on"); } }
addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && currentSave) { e.preventDefault(); currentSave(); } });
// 화면 아래에 붙는 저장 막대
function saveBar(onSave, ...left) {
  const bar = el("div", { class: "savebar" });
  dirtyNote = el("span", { class: "dirty" }, "변경 사항 없음");
  const l = el("div", { class: "savebar-l" }); l.append(dirtyNote, ...left);
  const save = btn("저장하기", "btn-primary", async () => { if (save.disabled) return; save.disabled = true; try { const ok = await onSave(); if (ok !== false) cleanState(); } finally { save.disabled = false; } });
  bar.append(l, save); currentSave = () => save.click(); view.append(bar);
  return save;
}

// ── 화면 밝기: 자동(기기 설정) · 밝게 · 어둡게
const THEMES = [["auto", "화면: 자동"], ["light", "화면: 밝게"], ["dark", "화면: 어둡게"]];
function applyTheme(k) { if (k === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", k); const b = $("theme"); if (b) b.textContent = THEMES.find((x) => x[0] === k)[1]; }
let theme = "auto"; try { theme = localStorage.getItem("gr-admin-theme") || "auto"; } catch {}
if (!THEMES.some((x) => x[0] === theme)) theme = "auto";
applyTheme(theme);
$("theme").addEventListener("click", () => { const i = THEMES.findIndex((x) => x[0] === theme); theme = THEMES[(i + 1) % 3][0]; applyTheme(theme); try { localStorage.setItem("gr-admin-theme", theme); } catch {} });
function check(label, on) { const l = el("label", { class: "toggle" }); const i = el("input", { type: "checkbox" }); i.checked = !!on; l.append(i, document.createTextNode(label)); return { w: l, input: i }; }
// 두 번 눌러야 실행되는 위험 버튼 (브라우저 확인창 대신)
function confirmBtn(t, fn) {
  const b = btn(t, "btn-danger", async () => {
    if (b.dataset.armed) { b.disabled = true; await fn(); return; }
    b.dataset.armed = "1"; b.textContent = "한 번 더 누르면 " + t; setTimeout(() => { delete b.dataset.armed; b.textContent = t; }, 4000);
  });
  return b;
}
// 작은 아이콘 단추 (danger면 두 번 눌러야 실행)
function iconBtn(sym, label, fn, danger) {
  const b = el("button", { class: "icon-btn" + (danger ? " danger" : ""), type: "button", "aria-label": label, title: label }, sym);
  b.addEventListener("click", () => {
    if (danger && !b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "빼기?"; b.classList.add("armed"); setTimeout(() => { delete b.dataset.armed; b.textContent = sym; b.classList.remove("armed"); }, 3000); return; }
    fn();
  });
  return b;
}
async function audit(action, target, detail = "") {
  try { await addDoc(collection(db, "auditLog"), { by: me.uid, email: me.email, action, target, detail: String(detail).slice(0, 300), at: serverTimestamp() }); } catch {}
}
async function snapshot(target, data) {
  if (!data) return;
  try { await addDoc(collection(db, "snapshots"), { target, data, by: me.uid, email: me.email, at: serverTimestamp() }); } catch {}
}
async function snapshotsOf(target) {
  const s = await getDocs(query(collection(db, "snapshots"), where("target", "==", target))).catch(() => null);
  if (!s) return [];
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).slice(0, 10);
}
function timeMachine(target, onRestore, onView, host) {
  const p = panel("타임머신", "저장할 때마다 바로 전 내용을 자동으로 보관합니다. 최근 10개까지 보여 줍니다.", host);
  const list = el("div", { class: "list" }); p.append(list);
  snapshotsOf(target).then((rows) => {
    if (!rows.length) { list.append(el("p", { class: "muted" }, "아직 보관된 내용이 없습니다.")); return; }
    rows.forEach((r) => {
      const row = el("div", { class: "row" });
      row.append(el("span", null, when(r.at) + " · " + (r.email || "")));
      const tools = el("span", { class: "row-tools" });
      if (onView) tools.append(btn("보기", null, () => onView(r)));
      tools.append(confirmBtn("되돌리기", async () => { await onRestore(r.data); }));
      row.append(tools); list.append(row);
    });
  });
}

// ── 로그인: Google 계정 → 6자리 PIN (PIN을 맞혀야 서버가 관리자 권한을 12시간 열어 줌, 보안 규칙 v3)
await usePersistence("member");   // Google 로그인은 이 기기에 유지 · 대신 앱을 열 때마다 PIN을 다시 물음
const pinSay = (t, ok) => { const m = $("pin-msg"); m.textContent = t; m.className = "msg " + (ok ? "msg-ok" : "msg-err"); m.hidden = false; };
let pinCreate = false, fails = 0, waitUntil = 0;
function setPinMode(create) {
  pinCreate = create;
  $("pin-title").textContent = create ? "PIN 만들기" : "PIN 입력";
  $("pin-help").textContent = create ? "처음 한 번만 만듭니다. 생일·전화번호·같은 숫자 반복은 피해 주세요." : "관리자 PIN 6자리를 입력하세요.";
  $("pin2-wrap").hidden = !create; $("pin2").required = create;
  $("pin-mode").textContent = create ? "이미 PIN이 있어요" : "처음이신가요? PIN 만들기";
  $("pin-msg").hidden = true; $("pin1").value = ""; $("pin2").value = "";
}
$("google").addEventListener("click", () => googleSignIn(say));
$("pin-mode").addEventListener("click", () => setPinMode(!pinCreate));
$("pin-out").addEventListener("click", async () => { await endSession(me, "logout"); location.reload(); });
$("logout").addEventListener("click", async () => { await lockAdmin(me, "logout"); await endSession(me, "logout"); location.reload(); });

const weak = (p) => /^(\d)\1{5}$/.test(p) || "0123456789012".includes(p) || "9876543210987".includes(p);
$("pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (Date.now() < waitUntil) return pinSay("잠시 후 다시 시도해 주세요.", false);
  const a = $("pin1").value.trim(), b = $("pin2").value.trim();
  if (!/^\d{6}$/.test(a)) return pinSay("숫자 6자리를 입력해 주세요.", false);
  const proof = await pinProof(me.uid, a);
  if (pinCreate) {
    if (a !== b) return pinSay("두 번 입력한 PIN이 다릅니다.", false);
    if (weak(a)) return pinSay("너무 쉬운 PIN입니다. 다른 숫자로 만들어 주세요.", false);
    try { await setDoc(doc(db, "adminPins", me.uid), { h: proof, at: serverTimestamp() }); }
    catch { setPinMode(false); return pinSay("이미 PIN이 있습니다. PIN을 입력해 주세요.", false); }
  }
  try {
    await setDoc(doc(db, "adminUnlock", me.uid), { p: proof, at: serverTimestamp() });
    fails = 0; try { sessionStorage.setItem("grUnlock-" + me.uid, String(Date.now())); } catch {}
    $("pin").hidden = true; enterApp();
  } catch {
    fails++;
    if (fails >= 5) { waitUntil = Date.now() + 60 * 1000 * Math.min(10, fails - 4); pinSay("PIN이 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.", false); }
    else pinSay("PIN이 맞지 않습니다.", false);
    try { logLogin(me, "denied"); } catch {}
  }
});

// 서버의 관리자 권한(PIN 확인)이 아직 살아 있는지 — 관리자만 읽을 수 있는 자료를 하나 읽어 봄
async function stillUnlocked() {
  try { await getDocs(query(collection(db, "inquiries"), limit(1))); return true; } catch { return false; }
}

onAuthStateChanged(auth, async (user) => {
  me = user;
  $("logout").hidden = !user;
  $("who").textContent = user ? user.email : "";
  $("app").hidden = true; $("pin").hidden = true; $("denied").hidden = true;
  if (!user) { $("login").hidden = false; return; }
  $("login").hidden = true;
  const ok = await getDoc(doc(db, "admins", user.uid)).then((s) => s.exists()).catch(() => false);
  if (!ok) {
    $("denied").hidden = false; $("denied-uid").textContent = "UID: " + user.uid;
    try { if (!sessionStorage.getItem("gr-denied")) { sessionStorage.setItem("gr-denied", "1"); logLogin(user, "denied"); } } catch {}
    return;
  }
  let flag = null; try { flag = sessionStorage.getItem("grUnlock-" + user.uid); } catch {}
  if (flag && await stillUnlocked()) return enterApp();
  setPinMode(false); $("pin").hidden = false; setTimeout(() => $("pin1").focus(), 50);
});

let entered = false;
function enterApp() {
  $("app").hidden = false;
  startSession(me, "admin", () => { location.reload(); });
  if (!entered) { entered = true; bindTabs(); }
  go("dash"); refreshInqBadge();
}

function bindTabs() {
  document.querySelectorAll(".adm-side [data-tab]").forEach((b) => b.onclick = () => {
    if (dirty && b.dataset.armed !== "1") { b.dataset.armed = "1"; toast("저장하지 않은 변경이 있습니다. 한 번 더 누르면 저장하지 않고 나갑니다."); setTimeout(() => { delete b.dataset.armed; }, 4000); return; }
    delete b.dataset.armed; go(b.dataset.tab);
  });
}
function go(tab) {
  document.querySelectorAll(".adm-side [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  clear();
  ({ dash, stats, home, notices, inq, members, sec })[tab]();
  window.scrollTo({ top: 0 });
}
async function refreshInqBadge() {
  const s = await getDocs(query(collection(db, "inquiries"), where("status", "==", "new"))).catch(() => null);
  const n = s ? s.size : 0; const b = $("inq-badge"); b.textContent = String(n); b.hidden = n === 0;
}

// ═══ 대시보드
async function dash() {
  h2("대시보드", btn("새로 고침", null, () => go("dash")));
  const kpis = el("div", { class: "kpis" }); view.append(kpis);
  const kpi = (label) => { const k = el("div", { class: "kpi" }); const b = el("b", null, "…"); k.append(el("span", null, label), b); kpis.append(k); return b; };
  const kToday = kpi("오늘 방문"), kWeek = kpi("최근 7일 방문"), kInq = kpi("새 문의"), kLive = kpi("지금 접속 중"), kErr = kpi("오류(7일)");

  const start = kstDay(new Date(Date.now() - 13 * 864e5));
  const vs = await getDocs(query(collection(db, "visits"), where(documentId(), ">=", start))).catch(() => null);
  const byDay = {}; if (vs) vs.forEach((d) => { byDay[d.id] = d.data(); });
  const days = [...Array(14)].map((_, i) => kstDay(new Date(Date.now() - (13 - i) * 864e5)));
  kToday.textContent = String(byDay[days[13]]?.total || 0);
  const last7 = days.slice(7).reduce((s, d) => s + (byDay[d]?.total || 0), 0);
  kWeek.textContent = String(last7);

  const p = panel("최근 14일 방문", "같은 기기의 같은 화면은 하루 1번만 셉니다");
  const box = el("div", { class: "cx-box" }); p.append(box);
  lineChart(box, { labels: days.map((d) => d.slice(5).replace("-", ".")), series: [{ name: "방문", values: days.map((d) => byDay[d]?.total || 0), cls: "c1" }], height: 180, title: (i) => dayTitle(days[i]) });
  const sum = (k) => days.slice(7).reduce((s, d) => s + (byDay[d]?.[k] || 0), 0);
  const more = el("div", { class: "cx-more" });
  more.append(el("span", { class: "sub muted" }, `최근 7일 기기: 폰 ${sum("mobile")} · 패드 ${sum("tablet")} · 컴퓨터 ${sum("desktop")}`), btn("방문 통계 자세히", null, () => openTab("stats")));
  p.append(more);

  const inqs = await getDocs(query(collection(db, "inquiries"), where("status", "==", "new"))).catch(() => null);
  kInq.textContent = String(inqs ? inqs.size : 0);
  const ss = await getDocs(collection(db, "sessions")).catch(() => null);
  const live = ss ? ss.docs.filter((d) => d.data().lastSeen && Date.now() - d.data().lastSeen.toMillis() < 5 * 60e3).length : 0;
  kLive.textContent = String(live);
  const es = await getDocs(collection(db, "errors")).catch(() => null);
  kErr.textContent = String(es ? es.docs.filter((d) => d.data().lastAt && Date.now() - d.data().lastAt.toMillis() < 7 * 864e5).length : 0);

  if (inqs && inqs.size) {
    const q = panel("답변이 필요한 문의"); const list = el("div", { class: "list" }); q.append(list);
    inqs.docs.slice(0, 5).forEach((d) => { const v = d.data(); const row = el("div", { class: "row" }); const a = el("button", { class: "link", type: "button" }, `[${v.category}] ${v.name}`); a.onclick = () => { document.querySelectorAll(".adm-side [data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === "inq"))); openInq(d.id); }; row.append(a, el("span", { class: "sub" }, when(v.createdAt))); list.append(row); });
  }
}

// ═══ 방문 통계 (그래프)
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dayTitle = (d) => { const [y, m, dd] = d.split("-").map(Number); const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return `${m}월 ${dd}일 (${WEEK[w]})`; };
function openTab(tab) { document.querySelectorAll(".adm-side [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab))); clear(); ({ dash, stats, home, notices, inq, members, sec })[tab](); window.scrollTo({ top: 0 }); }
let statRange = 30;
const HOURS = [...Array(24)].map((_, i) => "h" + String(i).padStart(2, "0"));
const LABEL = {
  home: "첫 화면", notice: "공고", member: "조합원 화면", admin: "관리자 화면", other: "기타",
  mobile: "휴대폰", tablet: "태블릿", desktop: "컴퓨터",
  os_ios: "iOS (아이폰·아이패드)", os_android: "안드로이드", os_win: "윈도우", os_mac: "맥", os_etc: "기타",
  br_safari: "사파리", br_chrome: "크롬", br_samsung: "삼성 인터넷", br_naver: "네이버 앱·웨일", br_kakao: "카카오톡 안", br_edge: "엣지", br_etc: "기타",
  src_direct: "주소 직접 입력·즐겨찾기", src_search: "검색 (네이버·구글 등)", src_sns: "카카오톡·SNS 공유", src_etc: "다른 사이트 링크",
  dv_iphone: "아이폰", dv_ipad: "아이패드", dv_galaxy: "갤럭시 폰", dv_galtab: "갤럭시 탭", dv_android: "다른 안드로이드 폰·패드", dv_mac: "맥 컴퓨터", dv_win: "윈도우 컴퓨터", dv_etc: "기타",
  sc_1: "작은 폰 (380px 미만)", sc_2: "보통·큰 폰 (380~599px)", sc_3: "패드 세로·작은 창 (600~1023px)", sc_4: "패드 가로·노트북 (1024~1599px)", sc_5: "큰 모니터 (1600px 이상)",
  st_10: "10초 넘게 봄", st_30: "30초 넘게 봄", st_60: "1분 넘게 봄", st_180: "3분 넘게 봄",
  sd_25: "4분의 1까지", sd_50: "절반까지", sd_75: "4분의 3까지", sd_100: "끝까지 (문의 칸)",
  rg_abroad: "해외", rg_etc: "알 수 없음"
};
// 시·도 칸 지도 배치 [칸 이름, 이름, 짧은 이름, 열, 행]
const REGION_TILES = [
  ["gyeonggi", "경기도", "경기", 1, 0], ["gangwon", "강원특별자치도", "강원", 2, 0],
  ["incheon", "인천광역시", "인천", 0, 1], ["seoul", "서울특별시", "서울", 1, 1], ["chungbuk", "충청북도", "충북", 2, 1], ["gyeongbuk", "경상북도", "경북", 3, 1],
  ["chungnam", "충청남도", "충남", 0, 2], ["sejong", "세종특별자치시", "세종", 1, 2], ["daejeon", "대전광역시", "대전", 2, 2], ["daegu", "대구광역시", "대구", 3, 2], ["ulsan", "울산광역시", "울산", 4, 2],
  ["jeonbuk", "전북특별자치도", "전북", 1, 3], ["gyeongnam", "경상남도", "경남", 3, 3], ["busan", "부산광역시", "부산", 4, 3],
  ["gwangju", "광주광역시", "광주", 0, 4], ["jeonnam", "전라남도", "전남", 1, 4],
  ["jeju", "제주특별자치도", "제주", 0, 5]
];
REGION_TILES.forEach(([k, name]) => { LABEL["rg_" + k] = name; });
const SINCE_V5 = "11월 25일부터 셉니다";
async function stats() {
  const seg = el("div", { class: "seg keep", role: "radiogroup", "aria-label": "기간" });
  [[7, "7일"], [30, "30일"], [90, "90일"]].forEach(([n, l]) => { const b = el("button", { type: "button", "aria-selected": String(n === statRange) }, l); b.onclick = () => { statRange = n; openTab("stats"); }; seg.append(b); });
  h2("방문 통계", seg, btn("새로 고침", null, () => openTab("stats")));
  view.append(el("p", { class: "sub muted cx-note" }, "누가 왔는지는 기록하지 않고, 하루 단위 숫자만 셉니다. 같은 기기의 같은 화면은 하루 1번만 셉니다. 시간은 한국 시간입니다."));

  const N = statRange;
  const days = [...Array(N)].map((_, i) => kstDay(new Date(Date.now() - (N - 1 - i) * 864e5)));
  const prev = [...Array(N)].map((_, i) => kstDay(new Date(Date.now() - (2 * N - 1 - i) * 864e5)));
  const vs = await getDocs(query(collection(db, "visits"), where(documentId(), ">=", prev[0]))).catch(() => null);
  if (!vs) { view.append(el("p", { class: "muted" }, "통계를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.")); return; }
  const by = {}; vs.forEach((d) => { by[d.id] = d.data(); });
  // 지역·기기 종류·화면 폭·머문 시간은 '방문 수 더 보기'(visitx)에 따로 있어 날짜별로 합칩니다
  const xs = await getDocs(query(collection(db, "visitx"), where(documentId(), ">=", prev[0]))).catch(() => null);
  if (xs) xs.forEach((d) => { by[d.id] = Object.assign(by[d.id] || {}, d.data()); });
  const tot = (list, k) => list.reduce((s, d) => s + (by[d]?.[k] || 0), 0);

  // 1) 숫자 요약
  const cur = tot(days, "total"), before = tot(prev, "total");
  const uv = tot(days, "uv"), nv = tot(days, "nv");
  const hourSum = HOURS.map((hk) => tot(days, hk));
  const peak = hourSum.some((v) => v) ? hourSum.indexOf(Math.max(...hourSum)) : -1;
  const kpis = el("div", { class: "kpis" }); view.append(kpis);
  const kpi = (label, value, note, up) => {
    const k = el("div", { class: "kpi" }); k.append(el("span", null, label), el("b", null, value));
    if (note) k.append(el("small", { class: "kpi-note" + (up === true ? " up" : up === false ? " down" : "") }, note));
    kpis.append(k);
  };
  const diff = before ? Math.round(((cur - before) / before) * 100) : null;
  kpi(`방문 (${N}일)`, fmt(cur), diff === null ? "지난 기간 자료 없음" : `지난 ${N}일보다 ${diff >= 0 ? "▲ " + diff : "▼ " + Math.abs(diff)}%`, diff === null ? null : diff >= 0);
  kpi("하루 평균", fmt(Math.round((cur / N) * 10) / 10), `오늘 ${fmt(by[days[N - 1]]?.total || 0)}회`);
  kpi("방문한 기기", uv ? fmt(uv) : "–", uv ? `처음 온 기기 ${pct(nv, uv)}%` : "11월 22일부터 셉니다");
  kpi("가장 많이 오는 시간", peak < 0 ? "–" : `${peak}시`, peak < 0 ? "11월 22일부터 셉니다" : `${peak}시~${peak + 1}시`);

  // 2) 날짜별 추이 (이번 기간 · 지난 기간)
  const pT = panel("날짜별 방문", `최근 ${N}일 (실선)과 그 전 ${N}일 (점선) 비교`);
  const bT = el("div", { class: "cx-box" }); pT.append(bT);
  const lbl = days.map((d) => d.slice(5).replace("-", "."));
  lineChart(bT, { labels: lbl, series: [{ name: `최근 ${N}일`, values: days.map((d) => by[d]?.total || 0), cls: "c1" }, { name: `그 전 ${N}일`, values: prev.map((d) => by[d]?.total || 0), cls: "cprev", dashed: true }], title: (i) => dayTitle(days[i]) });
  const tWrap = el("details", { class: "cx-details" }); tWrap.append(el("summary", null, "표로 보기"));
  table(tWrap, ["날짜", "방문", "휴대폰", "태블릿", "컴퓨터", "첫 화면", "공고"], [...days].reverse().map((d) => [dayTitle(d), fmt(by[d]?.total || 0), fmt(by[d]?.mobile || 0), fmt(by[d]?.tablet || 0), fmt(by[d]?.desktop || 0), fmt(by[d]?.home || 0), fmt(by[d]?.notice || 0)]));
  pT.append(tWrap);

  const grid = el("div", { class: "cx-grid2" }); view.append(grid);
  // 3) 시간대
  const pH = panel("시간대별 방문", "한국 시간 기준, 몇 시에 많이 들어오는지", grid);
  const bH = el("div", { class: "cx-box" }); pH.append(bH);
  if (hourSum.some((v) => v)) barChart(bH, { labels: [...Array(24)].map((_, i) => String(i)), values: hourSum, title: (i) => `${i}시 ~ ${i + 1}시`, highlight: peak });
  else bH.append(el("p", { class: "cx-empty" }, "11월 22일부터 시간대를 셉니다. 방문이 쌓이면 여기에 그래프가 나옵니다."));
  // 4) 기기
  const pD = panel("기기 크기", "휴대폰·태블릿·컴퓨터", grid);
  donut(pD, [["mobile", "c1"], ["tablet", "c2"], ["desktop", "c3"]].map(([k, c]) => ({ label: LABEL[k], value: tot(days, k), cls: c })), { center: `${N}일 방문` });

  // 5) 요일 × 시간
  const pW = panel("요일 · 시간대", "칸이 진할수록 그 요일 그 시간에 많이 들어왔습니다");
  const hv = WEEK.map(() => Array(24).fill(0));
  days.forEach((d) => { const [y, m, dd] = d.split("-").map(Number); const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); HOURS.forEach((hk, i) => { hv[w][i] += by[d]?.[hk] || 0; }); });
  const order = [1, 2, 3, 4, 5, 6, 0];
  if (hourSum.some((v) => v)) heatmap(pW, { rows: order.map((i) => WEEK[i]), cols: [...Array(24)].map((_, i) => String(i)), values: order.map((i) => hv[i]) });
  else pW.append(el("p", { class: "cx-empty" }, "11월 22일부터 셉니다."));

  // 6) 갈래별 비율
  const grid2 = el("div", { class: "cx-grid4" }); view.append(grid2);
  const list = (title, hint, keys, unit) => { const pp = panel(title, hint, grid2); hBars(pp, keys.map((k) => ({ label: LABEL[k], value: tot(days, k) })), { unit }); };
  list("많이 본 화면", "화면 종류별 방문", ["home", "notice", "member", "admin", "other"], "회");
  list("들어온 경로", "하루 첫 방문 기준 · 주소는 기록하지 않음", ["src_direct", "src_search", "src_sns", "src_etc"], "대");
  list("운영체제", "하루 첫 방문 기준", ["os_ios", "os_android", "os_win", "os_mac", "os_etc"], "대");
  list("브라우저", "하루 첫 방문 기준", ["br_safari", "br_chrome", "br_samsung", "br_naver", "br_kakao", "br_edge", "br_etc"], "대");

  // 7) 지역 (시·도)
  const rgKeys = [...REGION_TILES.map(([k]) => "rg_" + k), "rg_abroad", "rg_etc"];
  const rgTotal = rgKeys.reduce((a, k) => a + tot(days, k), 0);
  const pR = panel("어느 지역에서 들어왔나", "하루 첫 방문 기준 · 시·도까지만 셉니다 (IP 주소·동네는 기록하지 않음)");
  if (!rgTotal) pR.append(el("p", { class: "cx-empty" }, SINCE_V5 + ". 방문이 쌓이면 지도와 목록이 나옵니다."));
  else {
    const split = el("div", { class: "cx-split" }); pR.append(split);
    const mapBox = el("div"); const listBox = el("div"); split.append(mapBox, listBox);
    tileMap(mapBox, REGION_TILES.map(([k, name, short, col, row]) => ({ label: name, short, col, row, value: tot(days, "rg_" + k) })));
    hBars(listBox, rgKeys.map((k) => ({ label: LABEL[k], value: tot(days, k) })), { unit: "대" });
  }
  pR.append(el("p", { class: "cx-caveat" }, "인터넷 주소로 추정한 지역이라 정확하지 않을 수 있습니다. 특히 휴대폰 데이터(LTE·5G)로 들어오면 통신사 위치(주로 서울·경기)로 잡히는 일이 많고, 와이파이로 들어오면 더 정확합니다."));

  // 8) 기기 종류 · 화면 폭
  const grid3 = el("div", { class: "cx-grid2" }); view.append(grid3);
  const list3 = (title, hint, keys) => { const pp = panel(title, hint, grid3); const t = keys.reduce((a, k) => a + tot(days, k), 0);
    if (!t) pp.append(el("p", { class: "cx-empty" }, SINCE_V5 + "."));
    else hBars(pp, keys.map((k) => ({ label: LABEL[k], value: tot(days, k) })), { unit: "대" }); };
  list3("기기 종류", "하루 첫 방문 기준 · 모델명은 보내지 않고 갈래만 셉니다", ["dv_iphone", "dv_ipad", "dv_galaxy", "dv_galtab", "dv_android", "dv_mac", "dv_win", "dv_etc"]);
  list3("화면 폭", "하루 첫 방문 기준 · 화면을 어느 크기로 보는지 (디자인 점검용)", ["sc_1", "sc_2", "sc_3", "sc_4", "sc_5"]);

  // 9) 얼마나 머물렀나 · 첫 화면을 얼마나 읽었나
  const grid4 = el("div", { class: "cx-grid2" }); view.append(grid4);
  const stBase = tot(days, "uv");
  const pS = panel("얼마나 머물렀나", "화면을 실제로 보고 있던 시간 · 기기마다 하루 한 번", grid4);
  const stHas = ["st_10", "st_30", "st_60", "st_180"].some((k) => tot(days, k));
  if (!stHas) pS.append(el("p", { class: "cx-empty" }, SINCE_V5 + "."));
  else funnel(pS, ["st_10", "st_30", "st_60", "st_180"].map((k) => ({ label: LABEL[k], value: tot(days, k) })), stBase, { baseLabel: "방문한 기기" });
  const sdBase = tot(days, "home");
  const pS2 = panel("첫 화면을 얼마나 내려 보았나", "첫 화면 방문 중 그 지점까지 내려 본 비율", grid4);
  const sdHas = ["sd_25", "sd_50", "sd_75", "sd_100"].some((k) => tot(days, k));
  if (!sdHas) pS2.append(el("p", { class: "cx-empty" }, SINCE_V5 + "."));
  else funnel(pS2, ["sd_25", "sd_50", "sd_75", "sd_100"].map((k) => ({ label: LABEL[k], value: tot(days, k) })), sdBase, { unit: "회", baseLabel: "첫 화면 방문" });
}

// ═══ 홈 화면 내용
const HOME_TEXT = [
  ["eyebrow", "맨 위 작은 글씨", 80], ["heroTitle", "큰 제목 (줄바꿈 가능)", 80, true], ["heroText", "첫 화면 소개 글", 400, true],
  ["cta1", "첫 번째 단추 글자", 20], ["ctaNotice", "두 번째 단추 글자 (공고 게시판으로 연결)", 20],
  ["sayText", "중심 문장 (스크롤하면 한 단어씩 밝아짐)", 200, true], ["sayRef", "중심 문장 아래 작은 제목", 40], ["sayNote", "중심 문장 아래 한 줄", 80],
  ["callTitle", "시대와 부르심 · 큰 문장 (줄바꿈 가능)", 80, true], ["callText", "시대와 부르심 · 설명", 300, true],
  ["keysIntro", "일곱 가지 키워드 제목", 60],
  ["ringsTitle", "연혁(나이테) 제목", 60], ["ringsText", "연혁(나이테) 설명", 300, true],
  ["inquiryTitle", "문의 제목", 60], ["inquiryText", "문의 안내 글", 300, true],
  ["footNote", "맨 아래 안내", 120]
];
// fill: true면 저장된 내용 위에 '기본 문구'(js/defaults.js)를 채워 보여 줌 — 저장을 눌러야 반영
async function home(fill = false) {
  const snap = await getDoc(doc(db, "site", "home")).catch(() => null);
  const exists = snap && snap.exists();
  const orig = exists ? snap.data() : structuredClone(HOME);
  const data = fill ? { ...orig, ...Object.fromEntries([...HOME_TEXT.map(([k]) => k), "keys", "timeline"].map((k) => [k, structuredClone(HOME[k])])) } : orig;
  h2("홈 화면 내용", btn("기본 문구로 채우기", null, () => { clear(); home(true); }));
  if (fill) view.append(el("p", { class: "sub cx-note" }, "글 · 일곱 가지 · 연혁 칸을 기본 문구로 채웠습니다. 확인한 뒤 맨 아래 ‘저장’을 눌러야 첫 화면에 반영됩니다. 지금 내용은 저장할 때 타임머신에 보관됩니다."));
  if (!exists) {
    const p = panel("처음 설정");
    p.append(el("p", null, "아직 데이터베이스에 저장된 내용이 없습니다. 지금 화면에 보이는 기본 내용과 공고 2건을 한 번에 넣습니다."));
    p.append(btn("기본 내용 넣기", "btn-primary", async () => {
      await setDoc(doc(db, "site", "home"), { ...HOME, updatedAt: serverTimestamp(), updatedBy: me.email });
      for (const [id, n] of Object.entries(NOTICES)) { const s = await getDoc(doc(db, "notices", id)); if (!s.exists()) await setDoc(doc(db, "notices", id), { ...n, updatedAt: serverTimestamp(), updatedBy: me.email }); }
      await audit("기본 내용 넣기", "site/home, notices"); toast("기본 내용을 넣었습니다"); go("home");
    }));
    return;
  }
  const inputs = {};
  const pStrip = panel("공고 알림 (첫 화면 제목 위)");
  const sShow = check("공고 알림 보이기", data.stripShow !== false); pStrip.append(sShow.w);
  const g0 = el("div", { class: "grid-2" }); pStrip.append(g0);
  for (const [k, l, m] of [["stripTag", "작은 표시", 10], ["stripText", "띠 문구", 120], ["stripLink", "연결 주소", 200]]) {
    const f = field(l, data[k], { max: m, help: k === "stripLink" ? "예: notice/view.html?id=2026-01" : "" }); inputs[k] = f.input; g0.append(f.w);
  }
  const pIntro = panel("첫 화면 빛 효과");
  const iShow = check("빛 알갱이 · 낮에는 나뭇잎 햇살 · 밤(저녁 7시~새벽 6시)에는 반딧불이 보이기", data.introShow !== false); pIntro.append(iShow.w);
  pIntro.append(el("p", { class: "sub muted" }, "낮·밤 모습을 미리 보려면 첫 화면 주소 끝에 ?time=day 또는 ?time=night 를 붙여 여세요."));
  const pText = panel("글");
  const g = el("div", { class: "grid-2" }); pText.append(g);
  HOME_TEXT.forEach(([k, l, m, multi]) => { const f = field(l, data[k] ?? HOME[k], { max: m, multi }); inputs[k] = f.input; g.append(f.w); });

  const pair = (title, key) => {
    const p = panel(title); const rows = [];
    (data[key] || HOME[key] || []).forEach((it, i) => { const g2 = el("div", { class: "grid-2" }); const a = field((i + 1) + " 제목", it.title, { max: 60 }); const b = field((i + 1) + " 설명", it.text, { max: 300, multi: true }); g2.append(a.w, b.w); p.append(g2); rows.push([a.input, b.input]); });
    return () => rows.map(([a, b]) => ({ title: a.value.trim(), text: b.value.trim() }));
  };
  const getKeys = pair("일곱 가지 키워드 (터널 속에서 하나씩 밝아짐)", "keys");

  const pTl = panel("연혁 (나이테 · 내려갈수록 한 줄씩 밝아짐)"); const tlBox = el("div", { class: "repeat" }); pTl.append(tlBox);
  const addTl = (t = { when: "", what: "", now: false }) => {
    const item = el("div", { class: "tl-row" }); const a = el("input", { maxlength: "30", "aria-label": "때", placeholder: "때 (예: 2010.4)" }); a.value = t.when;
    const b = el("input", { maxlength: "120", "aria-label": "내용", placeholder: "내용" }); b.value = t.what;
    const c = check("지금 단계", t.now); c.w.classList.add("mini"); const rm = iconBtn("×", "이 줄 빼기", () => { item.remove(); markDirty(); }, true);
    const right = el("div", { class: "row-tools" }); right.append(c.w, rm);
    item.append(a, b, right); item._get = () => ({ when: a.value.trim(), what: b.value.trim(), now: c.input.checked }); tlBox.append(item);
  };
  (data.timeline || HOME.timeline || []).forEach(addTl); pTl.append(btn("+ 연혁 한 줄 더하기", "btn-add", () => { addTl(); markDirty(); }));
  saveBar(async () => {
    const next = { stripShow: sShow.input.checked, introShow: iShow.input.checked };
    for (const k of Object.keys(inputs)) next[k] = inputs[k].value.trim();
    next.keys = getKeys();
    next.timeline = [...tlBox.children].map((i) => i._get()).filter((t) => t.when || t.what);
    next.updatedAt = serverTimestamp(); next.updatedBy = me.email;
    try {
      const { updatedAt, ...old } = orig; await snapshot("site/home", old);
      await setDoc(doc(db, "site", "home"), next);
      await audit("홈 화면 저장", "site/home"); toast("저장했습니다. 첫 화면에 바로 반영됩니다.");
    } catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); return false; }
  }, el("a", { href: "../", target: "_blank", rel: "noopener" }, "첫 화면 열기 ↗"));
  if (fill) markDirty();
  timeMachine("site/home", async (old) => { await setDoc(doc(db, "site", "home"), { ...old, updatedAt: serverTimestamp(), updatedBy: me.email }); await audit("홈 화면 되돌리기", "site/home"); toast("되돌렸습니다"); go("home"); });
}

// ═══ 공고
async function notices() {
  h2("공고", btn("새 공고 쓰기", "btn-primary", () => editNotice(null)));
  const p = panel(); p.append(el("p", { class: "sub muted" }, "공식 공고는 지우지 않습니다. 내리려면 비공개로 바꿉니다. 게시 전후 언제든 고칠 수 있고, 고치기 전 내용은 타임머신에 보관됩니다."));
  const list = el("div", { class: "list" }); p.append(list);
  const s = await getDocs(collection(db, "notices")).catch(() => null);
  const rows = s ? s.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  rows.sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
  if (!rows.length) list.append(el("p", { class: "muted" }, "공고가 없습니다. 홈 화면 메뉴에서 ‘기본 내용 넣기’를 먼저 누르세요."));
  rows.forEach((n) => {
    const row = el("div", { class: "row" });
    const a = el("button", { class: "link", type: "button" }, (n.kind === "공고" ? "제" + n.no + "호 " : "[" + n.kind + "] ") + n.title); a.onclick = () => editNotice(n);
    const st = noticeState(n);
    const right = el("span", { class: "sub" }); right.append(el("span", { class: "pill " + st.cls }, st.label), document.createTextNode(" " + (n.postedAt || "").replace(/-/g, ".")));
    row.append(a, right); list.append(row);
  });
}
// 공고 상태: 비공개 / 예약(게시일 전, 숨김) / 게시 전(게시일 전, 보임) / 게시 중
function noticeState(n) {
  const today = kstDay();
  if (!n.published) return { label: "비공개", cls: "pill-off", pre: !!n.postedAt && today < n.postedAt };
  if (n.postedAt && today < n.postedAt) return n.scheduled ? { label: "예약 · " + n.postedAt.slice(5).replace("-", ".") + " 공개", cls: "pill-info", pre: true } : { label: "게시일 전", cls: "pill-info", pre: true };
  return { label: "게시 중", cls: "pill-live", pre: false };
}
const dot = (s) => String(s || "").replace(/-/g, ".");

function editNotice(n) {
  clear();
  const isNew = !n, today = kstDay();
  const d = n ? structuredClone(n) : { no: "", kind: "공고", title: "", status: "게시 중", postedAt: today, periodEnd: "", published: false, scheduled: true, org: "그루터기 사회적협동조합(가칭)", intro: "", items: [{ label: "1. ", text: "" }], sign: "", history: [], layout: "number" };
  let layout = LAYOUTS.some((l) => l[0] === d.layout) ? d.layout : "number";
  let form = FORMS.some((x) => x[0] === d.form) ? d.form : "notice";
  const L0 = d.letter || {}, H0 = d.home || {}, R0 = H0.reply || {};
  const titleOf = (p, s) => { const h = p.querySelector(".panel-head h3"); if (h) h.textContent = s; };
  const labelOf = (fl, s) => { const l = fl.w.querySelector("label"); if (l) l.textContent = s; };
  // 공고는 게시 전후 언제든 고칠 수 있고, 공개 화면에 변경 이력을 남기지 않음
  // (고치기 전 내용은 타임머신에, 누가 언제 고쳤는지는 관리자 활동 기록에 그대로 남음)
  const preNow = () => isNew || (!!d.postedAt && today < d.postedAt);

  h2(isNew ? "새 공고" : "공고 편집", btn("← 목록", null, () => go("notices")));
  const seg = el("div", { class: "seg", role: "tablist", "aria-label": "보기 방식" });
  const segE = el("button", { type: "button", role: "tab", "aria-selected": "true" }, "편집");
  const segP = el("button", { type: "button", role: "tab", "aria-selected": "false" }, "미리보기");
  seg.append(segE, segP); view.append(seg);

  const wrap = el("div", { class: "ne", "data-mode": "edit" }); view.append(wrap);
  const ed = el("div", { class: "ne-edit" }), pv = el("div", { class: "ne-prev" }); wrap.append(ed, pv);
  const NOTE = "A4 실제 규격 · 입력하는 대로 바뀝니다";
  const pvHead = el("div", { class: "ne-prev-head" }); const pvNote = el("span", null, NOTE);
  const pvTools = el("span", { class: "row-tools" });
  const pvBack = btn("지금 내용으로 돌아가기", null, () => { pvBack.hidden = true; refresh(); }); pvBack.hidden = true;
  pvTools.append(pvBack, btn("인쇄 · PDF로 보기", null, () => { refresh(); window.print(); }));
  pvHead.append(pvNote, pvTools); const pvBox = el("div", { class: "ne-paper" }); pv.append(pvHead, pvBox);
  const showPaper = (data, note) => { const pages = renderA4(pvBox, data, { forceA4: true }); pvNote.textContent = (note || NOTE) + " · " + pages + "쪽"; };
  const setMode = (m) => { wrap.dataset.mode = m; segE.setAttribute("aria-selected", String(m === "edit")); segP.setAttribute("aria-selected", String(m === "prev")); if (m === "edit") requestAnimationFrame(sizeAll); };
  segE.onclick = () => setMode("edit"); segP.onclick = () => { setMode("prev"); refresh(); };

  // ── 문서 종류: 공고·안내 / 공문 / 가정통신문
  const pK = panel("문서 종류", null, ed);
  const kSeg = el("div", { class: "seg", role: "radiogroup", "aria-label": "문서 종류", style: "display:inline-flex" }); pK.append(kSeg);
  FORMS.forEach(([k, name]) => { const b = el("button", { type: "button", "data-k": k, "aria-selected": "false" }, name); b.addEventListener("click", () => { if (form !== k) { setForm(k, true); markDirty(); } }); kSeg.append(b); });

  // ── 규격틀 고르기 (새 문서만): 고르면 항목 이름·예시 문구·모양이 미리 채워짐
  let applyTpl = null, picks = null;
  const paintTpl = () => {
    if (!picks) return; picks.textContent = "";
    TEMPLATES.filter((tp) => tp.form === form).forEach((tp) => {
      const b = el("button", { class: "tpl-pick", type: "button", "aria-pressed": "false" });
      b.append(el("b", null, tp.name), el("small", null, tp.desc));
      b.addEventListener("click", () => {
        if (dirty && b.dataset.armed !== "1") { b.dataset.armed = "1"; toast("한 번 더 누르면 지금 적은 내용 대신 이 틀로 바뀝니다"); setTimeout(() => delete b.dataset.armed, 4000); return; }
        delete b.dataset.armed;
        picks.querySelectorAll(".tpl-pick").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        applyTpl(tp);
      });
      picks.append(b);
    });
  };
  if (isNew) {
    const pT = panel("규격틀 고르기", "틀을 고르면 항목과 예시 문구가 채워집니다. [ ] 안만 바꿔 적으면 됩니다.", ed);
    picks = el("div", { class: "tpl-picks" }); pT.append(picks);
  }

  // ── 게시 상태
  const pS = panel("게시", null, ed);
  const stLine = el("div", { class: "state-line" }); pS.append(stLine);
  const g0 = el("div", { class: "grid-3" }); pS.append(g0);
  const f = {
    postedAt: field("게시일", d.postedAt, { type: "date" }),
    periodEnd: field("게시 마감일", d.periodEnd, { type: "date", help: "없으면 비워 둡니다" }),
    status: field("상태 표시", d.status, { max: 20, placeholder: "게시 중 / 마감" })
  };
  g0.append(f.postedAt.w, f.periodEnd.w, f.status.w);
  const tg = el("div", { class: "toggles" }); pS.append(tg);
  const pub = check("홈페이지에 게시", d.published);
  const sch = check("게시일 전에는 숨기기 (예약 게시)", d.scheduled ?? preNow());
  tg.append(pub.w, sch.w);

  // ── 문서 모양 (A4 출력 디자인)
  const pL = panel("문서 모양", "고르면 오른쪽 미리보기가 바로 바뀝니다. 글 내용은 그대로입니다.", ed);
  const lPicks = el("div", { class: "lay-picks", role: "radiogroup", "aria-label": "문서 모양" }); pL.append(lPicks);
  const paintLayout = () => lPicks.querySelectorAll(".lay-pick").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.k === layout)));
  LAYOUTS.forEach(([k, name, desc]) => {
    const b = el("button", { class: "lay-pick", type: "button", "data-k": k, "aria-pressed": "false" });
    const mini = el("span", { class: "lay-mini m-" + k, "aria-hidden": "true" }); for (let i = 0; i < 5; i++) mini.append(el("i"));
    b.append(mini, el("b", null, name), el("small", null, desc));
    b.addEventListener("click", () => { layout = k; paintLayout(); markDirty(); refresh(); });
    lPicks.append(b);
  });
  paintLayout();

  // ── 기본 정보
  const pI = panel("기본 정보", null, ed);
  const g = el("div", { class: "grid-2" }); pI.append(g);
  const idF = field("주소에 쓸 이름", n ? n.id : "", { max: 60, placeholder: "예: 2026-02", help: isNew ? "영문·숫자·- 만. 저장 후에는 바꿀 수 없습니다." : "저장 후에는 바꿀 수 없습니다." }); if (!isNew) idF.input.disabled = true;
  Object.assign(f, {
    kind: field("종류", d.kind, { max: 10, placeholder: "공고 / 안내" }), no: field("공고 번호", d.no, { max: 20, placeholder: "예: 2026-2" }),
    org: field("공고 주체", d.org, { max: 100 })
  });
  f.title = field("제목", d.title, { max: 200, wide: true });
  g.append(f.title.w, idF.w, f.kind.w, f.no.w, f.org.w);

  // ── 공문 입력 (두문 · 본문 · 결문 · 기관 정보)
  const lt = {};
  const pLH = panel("공문 머리 (두문)", "행정기관명 자리에는 위 '공고 주체'(기관명)가 들어갑니다.", ed);
  const gLH = el("div", { class: "grid-2" }); pLH.append(gLH);
  lt.slogan = field("기관 표어 (선택)", L0.slogan, { max: 60, wide: true, placeholder: "예: 아이와 부모와 교사가 함께 자라는 마을" });
  lt.to = field("수신", L0.to, { max: 120, placeholder: "예: 경기도지사(사회적경제과장) / 조합원 여러분" });
  lt.via = field("(경유)", L0.via, { max: 120, help: "거치는 기관이 있을 때만 적습니다" });
  gLH.append(lt.slogan.w, lt.to.w, lt.via.w);
  const pLB = panel("공문 본문", "본문이 끝나면(붙임이 있으면 붙임 끝에) 두 칸 띄우고 '끝.'이 자동으로 붙습니다.", ed);
  const lHelp = el("div", { class: "fmt-help" });
  lHelp.append(el("span", null, "항목 기호 순서:"));
  ["1.", "가.", "1)", "가)", "(1)", "(가)", "①"].forEach((c, i) => { lHelp.append(el("code", null, c)); if (i < 6) lHelp.append(el("span", null, "→")); });
  lHelp.append(el("span", null, "· 단계마다 자동으로 들여씁니다"));
  pLB.append(lHelp);
  lt.body = field("본문", L0.body, { max: 6000, multi: true, rows: 8 });
  lt.attach = field("붙임 (한 줄에 하나씩)", L0.attach, { max: 1000, multi: true, rows: 2, placeholder: "예: 정관(안) 1부." });
  pLB.append(lt.body.w, lt.attach.w);
  const pLF = panel("결문 · 결재", null, ed);
  const gLF = el("div", { class: "grid-2" }); pLF.append(gLF);
  lt.sender = field("발신명의", L0.sender, { max: 80, wide: true, placeholder: "예: 그루터기 사회적협동조합(가칭) 이사장" });
  lt.drafter = field("기안자 (직위 성명)", L0.drafter, { max: 40 });
  lt.reviewer = field("검토자 (직위 성명)", L0.reviewer, { max: 40 });
  lt.approver = field("결재권자 (직위 성명)", L0.approver, { max: 40 });
  lt.coop = field("협조자 (선택)", L0.coop, { max: 60 });
  lt.docNo = field("시행 번호", L0.docNo, { max: 40, placeholder: "예: 그루터기-2026-001" });
  lt.docDate = field("시행일", L0.docDate, { type: "date" });
  lt.recvNo = field("접수 (받은 곳에서 적음, 선택)", L0.recvNo, { max: 40 });
  gLF.append(lt.sender.w, lt.drafter.w, lt.reviewer.w, lt.approver.w, lt.coop.w, lt.docNo.w, lt.docDate.w, lt.recvNo.w);
  const pLO = panel("기관 정보", "한 번 적어 저장하면 이 기기에서 새 공문을 쓸 때 자동으로 채워집니다.", ed);
  const gLO = el("div", { class: "grid-2" }); pLO.append(gLO);
  lt.zip = field("우편번호", L0.zip, { max: 10 });
  lt.addr = field("주소", L0.addr, { max: 120 });
  lt.web = field("홈페이지", L0.web, { max: 80 });
  lt.tel = field("전화", L0.tel, { max: 30 });
  lt.fax = field("전송 (팩스)", L0.fax, { max: 30 });
  lt.email = field("전자우편", L0.email, { max: 80 });
  lt.open = field("공개 구분", L0.open || "공개", { max: 20, placeholder: "공개 / 부분공개 / 비공개" });
  gLO.append(lt.zip.w, lt.addr.w, lt.web.w, lt.tel.w, lt.fax.w, lt.email.w, lt.open.w);
  const ORG_KEYS = ["slogan", "zip", "addr", "web", "tel", "fax", "email"];
  const lettersPanels = [pLH, pLB, pLF, pLO];

  // ── 본문 (항목 블록: 순서 바꾸기 · 잠시 숨기기 · 빼기)
  const pB = panel("본문", "항목은 ▲▼로 순서를 바꾸고, ‘숨기기’로 지우지 않고 잠시 감출 수 있습니다.", ed);
  const help = el("div", { class: "fmt-help" });
  help.append(el("span", null, "줄 앞머리에 이렇게 쓰면 문서에서 자동으로 정돈됩니다:"));
  [["가. 나. 다.", "들여쓴 목록"], ["1) ①", "하위 목록"], ["제1호", "안건 목록"], ["- ·", "점 목록"], ["※", "참고 글"], ["일시: 내용", "이름표"]].forEach(([c, d2]) => { help.append(el("code", null, c), el("span", null, d2)); });
  pB.append(help);
  const intro = field("머리말", d.intro, { max: 2000, multi: true, rows: 3 }); pB.append(intro.w);
  const box = el("div", { class: "clauses" }); pB.append(box);
  const addItem = (it = { label: "", text: "" }, focus) => {
    const item = el("div", { class: "clause" + (it.hidden ? " is-hidden" : "") });
    const side = el("div", { class: "clause-side" });
    side.append(iconBtn("▲", "위로", () => { if (item.previousElementSibling) { box.insertBefore(item, item.previousElementSibling); markDirty(); refresh(); } }),
      iconBtn("▼", "아래로", () => { if (item.nextElementSibling) { box.insertBefore(item.nextElementSibling, item); markDirty(); refresh(); } }));
    const body = el("div", { class: "clause-body" });
    const a = el("input", { class: "clause-label", maxlength: "60", "aria-label": "항목 이름", placeholder: "항목 이름 (예: 7. 문의처)" }); a.value = it.label;
    const b = el("textarea", { class: "clause-text", rows: "1", maxlength: "3000", "aria-label": "항목 내용", placeholder: "내용" }); b.value = it.text;
    body.append(a, b);
    const tools = el("div", { class: "clause-tools" });
    const hid = check("숨기기", it.hidden); hid.w.classList.add("mini"); hid.input.addEventListener("change", () => { item.classList.toggle("is-hidden", hid.input.checked); refresh(); });
    tools.append(hid.w, iconBtn("×", "이 항목 빼기", () => { item.remove(); markDirty(); refresh(); }, true));
    item.append(side, body, tools);
    item._get = () => ({ label: a.value.trim(), text: b.value.trim(), ...(hid.input.checked ? { hidden: true } : {}) });
    box.append(item); if (focus) a.focus();
  };
  (d.items || []).forEach((it) => addItem(it));
  pB.append(btn("+ 항목 더하기", "btn-add", () => { addItem({ label: (box.children.length + 1) + ". ", text: "" }, true); markDirty(); }));
  const sign = field("맺음 (날짜와 명의, 줄바꿈 가능)", d.sign, { max: 300, multi: true, rows: 3 }); pB.append(sign.w);

  // ── 가정통신문 회신서 (절취선)
  const pR = panel("회신서 (절취선)", "켜면 문서 맨 아래에 잘라서 보내는 회신서가 붙습니다. ____ 는 빈칸 줄, □ 는 체크 상자로 나옵니다.", ed);
  const rOn = check("회신서 붙이기", !!R0.on); pR.append(rOn.w);
  const rTitle = field("회신서 제목", R0.title || "회 신 서", { max: 30 });
  const rText = field("회신서 내용 (한 줄씩)", R0.text, { max: 800, multi: true, rows: 4, placeholder: "원아 이름: ____    반: ____" });
  pR.append(rTitle.w, rText.w);

  // 규격틀 적용: 칸을 틀 내용으로 채움
  applyTpl = (tp) => {
    setForm(tp.form, true);
    f.kind.input.value = tp.kind; f.title.input.value = tp.title;
    if (tp.org) f.org.input.value = tp.org;
    if (tp.form === "letter") {
      Object.entries(tp.letter || {}).forEach(([k, v]) => { if (lt[k]) lt[k].input.value = v; });
    } else {
      intro.input.value = tp.intro || ""; sign.input.value = tp.sign || "";
      box.textContent = ""; (tp.items || []).forEach(([label, text]) => addItem({ label, text }));
      if (tp.layout) { layout = tp.layout; paintLayout(); }
      if (tp.reply) { rOn.input.checked = !!tp.reply.on; rTitle.input.value = tp.reply.title || "회 신 서"; rText.input.value = tp.reply.text || ""; }
    }
    view.querySelectorAll("input,textarea").forEach((x) => x.dispatchEvent(new Event("input", { bubbles: true })));
    requestAnimationFrame(sizeAll); markDirty(); refresh();
  };

  // ── 수정 안내 (변경 이력은 남기지 않음)
  const pH = panel("수정 안내", null, ed);
  pH.append(el("p", { class: "callout" }, "게시한 뒤에도 언제든 고칠 수 있고, 공개 화면에 변경 이력은 표시하지 않습니다. 고치기 전 내용은 아래 타임머신에 자동으로 보관되어 언제든 되돌릴 수 있습니다."));
  const warn = el("p", { class: "sub" }, "참고: 일시·장소, 조합원 자격요건, 의결 사항을 게시 후에 바꾸면, 바뀐 내용이 총회 7일 전까지 게시되어 있어야 합니다(시행령 제17조)."); pH.append(warn);

  // 문서 종류 바꾸기: 종류에 맞는 입력 상자만 보이게
  function setForm(k, fillOrg) {
    form = k;
    kSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === k)));
    pL.hidden = k !== "notice"; pB.hidden = k === "letter"; pR.hidden = k !== "home"; pH.hidden = false;
    lettersPanels.forEach((p) => { p.hidden = k !== "letter"; });
    f.no.w.hidden = k === "letter"; f.periodEnd.w.hidden = k !== "notice";
    labelOf(f.no, k === "home" ? "통신문 호수" : "공고 번호");
    labelOf(f.org, k === "letter" ? "행정기관명 (발신 기관)" : k === "home" ? "기관명 (머리띠)" : "공고 주체");
    labelOf(f.postedAt, k === "notice" ? "게시일" : "작성일");
    labelOf(intro, k === "home" ? "인사말" : "머리말");
    titleOf(pB, k === "home" ? "가정통신문 본문" : "본문");
    if (k === "letter") f.kind.input.value = "공문"; else if (k === "home") f.kind.input.value = "가정통신문"; else if (/공문|가정통신문/.test(f.kind.input.value)) f.kind.input.value = "공고";
    // 새 공문이면 이 기기에 기억해 둔 기관 정보를 채움
    if (k === "letter" && fillOrg !== false) {
      let mem = {}; try { mem = JSON.parse(localStorage.getItem("gr-letter-org") || "{}"); } catch {}
      ORG_KEYS.forEach((key) => { if (lt[key] && !lt[key].input.value && typeof mem[key] === "string") lt[key].input.value = mem[key].slice(0, 120); });
    }
    paintTpl(); requestAnimationFrame(sizeAll); refresh();
  }

  const collect = () => ({
    kind: f.kind.input.value.trim(), no: f.no.input.value.trim(), title: f.title.input.value.trim(), status: f.status.input.value.trim(),
    postedAt: f.postedAt.input.value, periodEnd: f.periodEnd.input.value, org: f.org.input.value.trim(),
    published: pub.input.checked, scheduled: sch.input.checked, layout,
    intro: form === "letter" ? "" : intro.input.value.trim(),
    items: form === "letter" ? [] : [...box.children].map((i) => i._get()).filter((i) => i.label || i.text),
    sign: form === "letter" ? "" : sign.input.value.trim(),
    form,
    ...(form === "letter" ? { letter: Object.fromEntries(Object.entries(lt).map(([k, x]) => [k, x.input.value.trim()])) } : {}),
    ...(form === "home" ? { home: { no: f.no.input.value.trim(), reply: { on: rOn.input.checked, title: rTitle.input.value.trim(), text: rText.input.value.replace(/\s+$/, "") } } } : {})
  });
  // 보안 규칙상 history 칸이 필요해 '최초 게시' 한 줄만 둠 (날짜는 게시일에 맞춤, 화면에는 표시하지 않음)
  const nextHistory = (c) => [{ at: c.postedAt || today, note: "최초 게시" }];
  function refresh() {
    const c = collect(), pre = preNow();
    const st = noticeState(c);
    stLine.textContent = ""; stLine.append(el("span", { class: "pill " + st.cls }, st.label));
    stLine.append(el("span", null, !c.published ? "홈페이지에 보이지 않습니다." : pre && c.scheduled ? dot(c.postedAt) + "부터 홈페이지에 보입니다. 그 전에는 공고 목록에 나타나지 않습니다." : pre ? "지금도 홈페이지에 보입니다. 게시일 전에 숨기려면 ‘예약 게시’를 켜세요." : "홈페이지에 게시 중입니다."));
    warn.hidden = pre || form !== "notice";
    if (!pvBack.hidden || !pv.offsetParent) return;   // 미리보기가 보일 때만 다시 그림 (안 보이면 쪽 나눔을 잴 수 없음)
    showPaper(c);
  }
  let rt; ed.addEventListener("input", () => { clearTimeout(rt); rt = setTimeout(refresh, 120); });
  ed.addEventListener("change", () => refresh());
  setForm(form, isNew);

  saveBar(async () => {
    const id = (isNew ? idF.input.value : n.id).trim();
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) { toast("주소에 쓸 이름은 영문·숫자·-만 쓸 수 있습니다"); return false; }
    const c = collect();
    if (!c.title) { toast("제목을 적어 주세요"); return false; }
    if (!c.postedAt) { toast("게시일을 정해 주세요"); return false; }
    try {
      const ref = doc(db, "notices", id);
      const cur = await getDoc(ref);
      if (isNew && cur.exists()) { toast("같은 이름의 공고가 이미 있습니다"); return false; }
      const next = { ...c, history: nextHistory(c), updatedAt: serverTimestamp(), updatedBy: me.email };
      if (cur.exists()) { const { updatedAt, ...old } = cur.data(); await snapshot("notices/" + id, old); }
      await setDoc(ref, next);
      await audit(isNew ? "문서 작성" : "문서 수정", "notices/" + id);
      if (c.form === "letter") { try { localStorage.setItem("gr-letter-org", JSON.stringify(Object.fromEntries(ORG_KEYS.map((k) => [k, c.letter[k] || ""])))); } catch {} }
      toast("저장했습니다"); cleanState(); editNotice({ id, ...next, updatedAt: null });
    } catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); return false; }
  }, ...(isNew ? [] : [el("a", { href: "../notice/view.html?id=" + encodeURIComponent(n.id), target: "_blank", rel: "noopener" }, "공개 화면 열기 ↗")]));

  if (!isNew) timeMachine("notices/" + n.id, async (old) => {
    const history = [{ at: old.postedAt || today, note: "최초 게시" }];
    await setDoc(doc(db, "notices", n.id), { ...old, history, updatedAt: serverTimestamp(), updatedBy: me.email });
    await audit("공고 되돌리기", "notices/" + n.id); toast("되돌렸습니다"); cleanState(); go("notices");
  }, (r) => {
    pvBack.hidden = false; setMode("prev");
    showPaper(r.data, when(r.at) + " 보관본"); window.scrollTo({ top: 0, behavior: "smooth" });
  }, ed);
}

// ═══ 문의
let inqFilter = "new";
async function inq() {
  h2("서면 문의");
  const tabs = el("div", { class: "tools" });
  [["new", "새 문의"], ["answering", "답변 중"], ["done", "답변 완료"], ["all", "전체"]].forEach(([k, l]) => { const b = btn(l, k === inqFilter ? "btn-primary" : null, () => { inqFilter = k; go("inq"); }); tabs.append(b); });
  view.append(tabs);
  const p = panel(); const list = el("div", { class: "list" }); p.append(list);
  const s = await getDocs(query(collection(db, "inquiries"), orderBy("createdAt", "desc"), limit(200))).catch(() => null);
  const rows = s ? s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => inqFilter === "all" || r.status === inqFilter) : [];
  if (!rows.length) list.append(el("p", { class: "muted" }, "문의가 없습니다."));
  rows.forEach((r) => {
    const row = el("div", { class: "row" });
    const a = el("button", { class: "link", type: "button" }, `[${r.category}] ${r.name} — ${String(r.message).slice(0, 30)}${r.message.length > 30 ? "…" : ""}`); a.onclick = () => openInq(r.id);
    row.append(a, el("span", { class: "sub" }, when(r.createdAt) + " · " + ({ new: "새 문의", answering: "답변 중", done: "답변 완료" }[r.status] || r.status)));
    list.append(row);
  });
  p.append(el("p", { class: "sub muted" }, "개인정보 보유 기간: 답변 완료 후 1년. 기간이 지난 문의는 상세 화면에서 파기하세요."));
}
async function openInq(id) {
  clear();
  const s = await getDoc(doc(db, "inquiries", id)).catch(() => null);
  if (!s || !s.exists()) { h2("문의를 찾을 수 없습니다", btn("← 목록", null, () => go("inq"))); return; }
  const r = s.data();
  h2("문의 보기", btn("← 목록", null, () => go("inq")));
  const p = panel(`[${r.category}] ${r.name}`);
  p.append(el("p", { class: "sub" }, "접수 " + when(r.createdAt)));
  const c = el("div", { class: "adm-bar" }); c.append(el("span", { class: "code" }, "답변 연락처: " + r.contact));
  const copy = btn("연락처 복사", null, async () => { try { await navigator.clipboard.writeText(r.contact); toast("복사했습니다"); } catch { toast("복사하지 못했습니다"); } });
  c.append(copy); p.append(c);
  p.append(el("div", { class: "inq-text" }, r.message));
  const g = el("div", { class: "grid-2" }); p.append(g);
  const st = el("select", { id: "inq-st", "aria-label": "처리 상태" }); [["new", "새 문의"], ["answering", "답변 중"], ["done", "답변 완료"]].forEach(([v, l]) => { const o = el("option", { value: v }, l); if (r.status === v) o.selected = true; st.append(o); });
  const stW = el("div", { class: "field" }); stW.append(el("label", { for: "inq-st" }, "처리 상태"), st); g.append(stW);
  const memo = field("처리 메모 (내부용, 공개되지 않음)", r.memo || "", { max: 1000, multi: true }); g.append(memo.w);
  if (r.status === "done" && r.answeredAt) {
    const until = new Date(r.answeredAt.toMillis() + 365 * 864e5);
    p.append(el("p", { class: "sub" }, "답변 완료 " + when(r.answeredAt) + " · 파기 예정일 " + until.toLocaleDateString("ko-KR")));
  }
  const bar = el("div", { class: "adm-bar" });
  bar.append(confirmBtn("이 문의 파기", async () => { await deleteDoc(doc(db, "inquiries", id)); await audit("문의 파기", "inquiries/" + id); toast("파기했습니다"); refreshInqBadge(); go("inq"); }));
  bar.append(btn("저장하기", "btn-primary", async () => {
    const upd = { status: st.value, memo: memo.input.value.trim().slice(0, 1000), handledBy: me.email, handledAt: serverTimestamp() };
    if (st.value === "done" && r.status !== "done") upd.answeredAt = serverTimestamp();
    try { await updateDoc(doc(db, "inquiries", id), upd); await audit("문의 처리", "inquiries/" + id, st.value); toast("저장했습니다"); refreshInqBadge(); go("inq"); }
    catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); }
  }));
  view.append(bar);
}

// ═══ 조합원
async function members() {
  h2("조합원");
  const p = panel(); p.append(el("p", { class: "sub muted" }, "조합원 로그인 화면에서 확인 신청을 하면 여기에 나타납니다. 조합원 명부와 확인한 뒤 승인하세요."));
  const list = el("div", { class: "list" }); p.append(list);
  const s = await getDocs(collection(db, "members")).catch(() => null);
  const rows = s ? s.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  rows.sort((a, b) => Number(a.approved) - Number(b.approved));
  if (!rows.length) list.append(el("p", { class: "muted" }, "아직 신청한 사람이 없습니다."));
  rows.forEach((m) => {
    const row = el("div", { class: "row" });
    const a = el("button", { class: "link", type: "button" }, (m.name || "(이름 없음)") + " · " + (m.email || "")); a.onclick = () => editMember(m);
    row.append(a, el("span", { class: "pill " + (m.approved ? "pill-info" : "pill-live") }, m.approved ? "승인" : "승인 대기"));
    list.append(row);
  });
}
function editMember(m) {
  clear(); h2("조합원 정보", btn("← 목록", null, () => go("members")));
  const p = panel(m.email || ""); const g = el("div", { class: "grid-2" }); p.append(g);
  const name = field("이름", m.name, { max: 40 }); const type = field("유형 (보호자/직원/후원자)", m.type || "", { max: 20 });
  const shares = field("출자 좌수", m.shares || "", { type: "number" }); g.append(name.w, type.w, shares.w);
  const paid = check("출자금 납입 완료", m.paid); const ap = check("승인 (조합원 화면 열람 허용)", m.approved); p.append(paid.w, ap.w);
  const bar = el("div", { class: "adm-bar" });
  bar.append(confirmBtn("명단에서 삭제", async () => { await deleteDoc(doc(db, "members", m.id)); await audit("조합원 삭제", "members/" + m.id); toast("삭제했습니다"); go("members"); }));
  bar.append(btn("저장하기", "btn-primary", async () => {
    const n = parseInt(shares.input.value, 10);
    try {
      await updateDoc(doc(db, "members", m.id), { name: name.input.value.trim().slice(0, 40), type: type.input.value.trim().slice(0, 20), shares: Number.isFinite(n) && n > 0 ? n : 0, paid: paid.input.checked, approved: ap.input.checked });
      await audit("조합원 수정", "members/" + m.id, ap.input.checked ? "승인" : "미승인"); toast("저장했습니다"); go("members");
    } catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); }
  }));
  view.append(bar);
}

// ═══ 보안 · 기록
let secTab = "live";
async function sec() {
  h2("보안 · 기록");
  const tabs = el("div", { class: "tools" });
  [["live", "접속 현황"], ["login", "로그인 기록"], ["audit", "활동 기록"], ["err", "오류 알림판"], ["conf", "보안 설정"]].forEach(([k, l]) => tabs.append(btn(l, k === secTab ? "btn-primary" : null, () => { secTab = k; go("sec"); })));
  view.append(tabs);
  const p = panel(); const list = el("div", { class: "list" }); p.append(list);
  const row = (main, sub) => { const r = el("div", { class: "row" }); r.append(el("span", null, main), el("span", { class: "sub" }, sub)); list.append(r); };
  const empty = (t) => list.append(el("p", { class: "muted" }, t));

  if (secTab === "live") {
    const s = await getDocs(collection(db, "sessions")).catch(() => null);
    const rows = s ? s.docs.map((d) => d.data()).sort((a, b) => (b.lastSeen?.seconds || 0) - (a.lastSeen?.seconds || 0)) : [];
    p.prepend(el("p", { class: "sub muted" }, "로그인한 사람이 화면을 열어 두면 1분마다 신호를 보냅니다. 5분 안에 신호가 있으면 ‘접속 중’입니다."));
    if (!rows.length) empty("접속 기록이 없습니다.");
    rows.forEach((r) => { const on = r.lastSeen && Date.now() - r.lastSeen.toMillis() < 5 * 60e3; row(`${on ? "● 접속 중" : "○ 자리 비움"} · ${r.email} (${r.role === "admin" ? "관리자" : "조합원"})`, `${r.page} · ${({ mobile: "폰", tablet: "패드", desktop: "컴퓨터" })[r.device] || r.device} · ${when(r.lastSeen)}`); });
  }
  if (secTab === "login") {
    const s = await getDocs(query(collection(db, "loginLogs"), orderBy("at", "desc"), limit(100))).catch(() => null);
    if (!s || s.empty) empty("기록이 없습니다.");
    const label = { login: "로그인", logout: "로그아웃", timeout: "자동 로그아웃", denied: "권한 없음 접근" };
    if (s) s.forEach((d) => { const r = d.data(); row(`${label[r.type] || r.type} · ${r.email}`, `${when(r.at)} · ${r.page} · ${({ mobile: "폰", tablet: "패드", desktop: "컴퓨터" })[r.device] || r.device}`); });
  }
  if (secTab === "audit") {
    const s = await getDocs(query(collection(db, "auditLog"), orderBy("at", "desc"), limit(100))).catch(() => null);
    if (!s || s.empty) empty("기록이 없습니다.");
    if (s) s.forEach((d) => { const r = d.data(); row(`${r.action} · ${r.target}${r.detail ? " · " + r.detail : ""}`, `${when(r.at)} · ${r.email}`); });
  }
  if (secTab === "err") {
    p.prepend(el("p", { class: "sub muted" }, "방문자 화면에서 난 오류를 모읍니다. 같은 오류는 한 줄로 묶어 횟수만 셉니다. 입력한 내용은 보내지 않습니다."));
    const s = await getDocs(query(collection(db, "errors"), orderBy("lastAt", "desc"), limit(100))).catch(() => null);
    if (!s || s.empty) empty("오류가 없습니다.");
    if (s) s.forEach((d) => {
      const r = d.data(); const rr = el("div", { class: "row" });
      rr.append(el("span", { class: "code" }, r.msg), el("span", { class: "sub" }, `${r.count}회 · ${r.page} · 마지막 ${when(r.lastAt)}`));
      rr.append(btn("해결 표시(지우기)", null, async () => { await deleteDoc(doc(db, "errors", d.id)); await audit("오류 해결", "errors/" + d.id); go("sec"); }));
      list.append(rr);
    });
  }
  if (secTab === "conf") {
    const s = await getDoc(doc(db, "securityConfig", "main")).catch(() => null);
    const cur = s && s.exists() ? s.data().idleMinutes : 30;
    const f = field("자동 로그아웃까지 시간(분)", cur, { type: "number", help: "5~120분. 관리자와 조합원 화면 모두에 적용됩니다. 관리자는 시간이 지나면 PIN을 다시 묻습니다." });
    p.append(f.w, btn("저장하기", "btn-primary", async () => {
      const v = parseInt(f.input.value, 10); if (!(v >= 5 && v <= 120)) return toast("5~120 사이로 적어 주세요");
      try { await setDoc(doc(db, "securityConfig", "main"), { idleMinutes: v }); await audit("보안 설정", "securityConfig/main", v + "분"); toast("저장했습니다"); } catch (e) { toast("저장하지 못했습니다"); }
    }));
    p.append(el("h3", null, "PIN 바꾸기"));
    const n1 = field("새 PIN 6자리", "", { type: "password" }), n2 = field("한 번 더", "", { type: "password" });
    [n1, n2].forEach((f) => { f.input.inputMode = "numeric"; f.input.maxLength = 6; f.input.autocomplete = "off"; });
    p.append(n1.w, n2.w, btn("PIN 바꾸기", "btn-primary", async () => {
      const a = n1.input.value.trim();
      if (!/^\d{6}$/.test(a) || a !== n2.input.value.trim()) return toast("숫자 6자리를 두 번 똑같이 입력해 주세요");
      const proof = await pinProof(me.uid, a);
      try {
        await setDoc(doc(db, "adminPins", me.uid), { h: proof, at: serverTimestamp() });
        await setDoc(doc(db, "adminUnlock", me.uid), { p: proof, at: serverTimestamp() });
        await audit("PIN 변경", "adminPins/" + me.uid); n1.input.value = ""; n2.input.value = ""; toast("PIN을 바꿨습니다");
      } catch { toast("바꾸지 못했습니다. 다시 로그인해 주세요"); }
    }));
    p.append(el("h3", null, "관리자 추가 방법"));
    p.append(el("p", { class: "sub" }, "새 관리자가 이 화면에서 Google 계정으로 한 번 로그인하면 ‘관리자 권한이 없습니다’와 함께 UID가 보입니다. 파이어베이스 콘솔 › Firestore › admins 컬렉션에 그 UID로 문서를 만들면 관리자가 됩니다. 보안을 위해 관리자 추가는 이 화면에서 할 수 없습니다."));
    p.append(el("p", { class: "code" }, "내 UID: " + me.uid));
  }
}
