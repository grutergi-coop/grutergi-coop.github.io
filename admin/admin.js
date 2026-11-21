// ═══════════════════════════════════════════════════════════════
// 관리자 화면 — 그루터기 사회적협동조합
// 대시보드 · 홈 화면 · 공고 · 문의 · 조합원 · 보안·기록(접속 현황/로그인 기록/활동 기록/오류 알림판/보안 설정)
// 권한은 화면이 아니라 데이터베이스 보안 규칙(admins 목록)이 지킵니다.
// 모든 내용은 글자로만 넣습니다(HTML 해석 없음). 저장 직전 내용은 타임머신(snapshots)에 보관합니다.
// ═══════════════════════════════════════════════════════════════
import { auth, db, el } from "../js/fb.js";
import { usePersistence, googleSignIn, pinProof, lockAdmin, startSession, endSession, logLogin } from "../js/session.js";
import { HOME, NOTICES } from "../js/defaults.js";
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
  ({ dash, home, notices, inq, members, sec })[tab]();
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

  const p = panel("최근 14일 방문 (같은 기기의 같은 화면은 하루 1번)");
  const bars = el("div", { class: "bars" }); const max = Math.max(1, ...days.map((d) => byDay[d]?.total || 0));
  days.forEach((d) => {
    const v = byDay[d]?.total || 0; const col = el("div");
    const bar = el("i"); bar.style.height = Math.round((v / max) * 100) + "%";
    col.append(el("em", null, v ? String(v) : ""), bar, el("small", null, d.slice(5).replace("-", ".")));
    bars.append(col);
  });
  p.append(bars);
  const sum = (k) => days.slice(7).reduce((s, d) => s + (byDay[d]?.[k] || 0), 0);
  p.append(el("p", { class: "sub muted" }, `최근 7일 기기: 폰 ${sum("mobile")} · 패드 ${sum("tablet")} · 컴퓨터 ${sum("desktop")}  |  화면: 첫 화면 ${sum("home")} · 공고 ${sum("notice")} · 조합원 ${sum("member")}`));

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

// ═══ 홈 화면 내용
const HOME_TEXT = [
  ["eyebrow", "맨 위 작은 글씨", 80], ["heroTitle", "큰 제목 (줄바꿈 가능)", 80, true], ["heroText", "첫 화면 소개 글", 400, true],
  ["cta1", "첫 번째 단추 글자", 20], ["ctaNotice", "두 번째 단추 글자 (공고 게시판으로 연결)", 20],
  ["sayText", "중심 말씀 (스크롤하면 한 단어씩 밝아짐)", 200, true], ["sayRef", "말씀 출처", 40], ["sayNote", "말씀 아래 한 줄", 80],
  ["callTitle", "시대와 부르심 · 큰 문장 (줄바꿈 가능)", 80, true], ["callText", "시대와 부르심 · 설명", 300, true],
  ["keysIntro", "일곱 가지 키워드 제목", 60],
  ["ringsTitle", "연혁(나이테) 제목", 60], ["ringsText", "연혁(나이테) 설명", 300, true],
  ["inquiryTitle", "문의 제목", 60], ["inquiryText", "문의 안내 글", 300, true],
  ["footNote", "맨 아래 안내", 120]
];
async function home() {
  const snap = await getDoc(doc(db, "site", "home")).catch(() => null);
  const exists = snap && snap.exists();
  const data = exists ? snap.data() : structuredClone(HOME);
  h2("홈 화면 내용");
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
      const { updatedAt, ...old } = data; await snapshot("site/home", old);
      await setDoc(doc(db, "site", "home"), next);
      await audit("홈 화면 저장", "site/home"); toast("저장했습니다. 첫 화면에 바로 반영됩니다.");
    } catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); return false; }
  }, el("a", { href: "../", target: "_blank", rel: "noopener" }, "첫 화면 열기 ↗"));
  timeMachine("site/home", async (old) => { await setDoc(doc(db, "site", "home"), { ...old, updatedAt: serverTimestamp(), updatedBy: me.email }); await audit("홈 화면 되돌리기", "site/home"); toast("되돌렸습니다"); go("home"); });
}

// ═══ 공고
async function notices() {
  h2("공고", btn("새 공고 쓰기", "btn-primary", () => editNotice(null)));
  const p = panel(); p.append(el("p", { class: "sub muted" }, "공식 공고는 지우지 않습니다. 내리려면 비공개로 바꿉니다. 게시일 전에는 자유롭게 고치고, 게시일부터는 고칠 때마다 사유가 변경 이력에 공개됩니다."));
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

// 공고 미리보기 — 공개 화면(notice/view.html)과 같은 모양
function renderPaper(box, n) {
  box.textContent = "";
  const paper = el("article", { class: "paper" });
  const meta = el("div", { class: "meta" });
  meta.append(el("span", null, n.kind === "공고" ? "공고 제" + (n.no || "○") + "호" : n.kind || ""), el("span", null, n.periodEnd ? "게시 기간 " + dot(n.postedAt) + " ~ " + dot(n.periodEnd) : "게시 " + dot(n.postedAt)));
  paper.append(meta);
  if (n.org) paper.append(el("p", { class: "p-org" }, n.org));
  paper.append(el("h1", null, n.title || "(제목)"));
  if (n.intro) paper.append(el("p", { class: "pre" }, n.intro));
  const dl = el("dl"); (n.items || []).filter((i) => !i.hidden && (i.label || i.text)).forEach((i) => dl.append(el("dt", null, i.label), el("dd", null, i.text)));
  paper.append(dl);
  if (n.sign) paper.append(el("p", { class: "sign" }, n.sign));
  paper.append(el("p", { class: "history" }, "변경 이력: " + (n.history || []).map((h) => dot(h.at) + " " + h.note).join(" · ")));
  box.append(paper);
}

function editNotice(n) {
  clear();
  const isNew = !n, today = kstDay();
  const d = n ? structuredClone(n) : { no: "", kind: "공고", title: "", status: "게시 중", postedAt: today, periodEnd: "", published: false, scheduled: true, org: "그루터기 사회적협동조합", intro: "", items: [{ label: "1. ", text: "" }], sign: "", history: [] };
  // 게시일 전 = 아직 공식 게시 전 → 고쳐도 변경 이력을 남기지 않음 (내부 활동 기록·타임머신에는 그대로 남음)
  const preNow = () => isNew || (!!d.postedAt && today < d.postedAt);
  const firstPost = (d.history || [])[0];

  h2(isNew ? "새 공고" : "공고 편집", btn("← 목록", null, () => go("notices")));
  const seg = el("div", { class: "seg", role: "tablist", "aria-label": "보기 방식" });
  const segE = el("button", { type: "button", role: "tab", "aria-selected": "true" }, "편집");
  const segP = el("button", { type: "button", role: "tab", "aria-selected": "false" }, "미리보기");
  seg.append(segE, segP); view.append(seg);

  const wrap = el("div", { class: "ne", "data-mode": "edit" }); view.append(wrap);
  const ed = el("div", { class: "ne-edit" }), pv = el("div", { class: "ne-prev" }); wrap.append(ed, pv);
  const pvHead = el("div", { class: "ne-prev-head" }); const pvNote = el("span", null, "공개 화면과 같은 모양 · 입력하는 대로 바뀝니다");
  const pvBack = btn("지금 내용으로 돌아가기", null, () => { pvBack.hidden = true; pvNote.textContent = "공개 화면과 같은 모양 · 입력하는 대로 바뀝니다"; refresh(); }); pvBack.hidden = true;
  pvHead.append(pvNote, pvBack); const pvBox = el("div", { class: "ne-paper" }); pv.append(pvHead, pvBox);
  const setMode = (m) => { wrap.dataset.mode = m; segE.setAttribute("aria-selected", String(m === "edit")); segP.setAttribute("aria-selected", String(m === "prev")); if (m === "edit") requestAnimationFrame(sizeAll); };
  segE.onclick = () => setMode("edit"); segP.onclick = () => { refresh(); setMode("prev"); };

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

  // ── 본문 (항목 블록: 순서 바꾸기 · 잠시 숨기기 · 빼기)
  const pB = panel("본문", "항목은 ▲▼로 순서를 바꾸고, ‘숨기기’로 지우지 않고 잠시 감출 수 있습니다.", ed);
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

  // ── 변경 이력
  const pH = panel("변경 이력", null, ed);
  const hBox = el("div"); pH.append(hBox);
  const reason = field("이번 변경 사유 (공개됨)", "", { max: 120, placeholder: "예: 장소 확정", help: "공고 아래 ‘변경 이력’에 날짜와 함께 공개됩니다." }); pH.append(reason.w);

  const collect = () => ({
    kind: f.kind.input.value.trim(), no: f.no.input.value.trim(), title: f.title.input.value.trim(), status: f.status.input.value.trim(),
    postedAt: f.postedAt.input.value, periodEnd: f.periodEnd.input.value, org: f.org.input.value.trim(),
    published: pub.input.checked, scheduled: sch.input.checked,
    intro: intro.input.value.trim(), items: [...box.children].map((i) => i._get()).filter((i) => i.label || i.text), sign: sign.input.value.trim()
  });
  // 저장할 때 붙을 변경 이력
  const nextHistory = (c) => {
    if (preNow()) return [{ at: c.postedAt || today, note: (firstPost && firstPost.note) || "최초 게시" }];   // 게시 전: 첫 줄 하나만, 날짜는 게시일에 맞춤
    return [...(d.history || []), { at: today, note: reason.input.value.trim().slice(0, 120) }];
  };
  function refresh() {
    const c = collect(), pre = preNow();
    const st = noticeState(c);
    stLine.textContent = ""; stLine.append(el("span", { class: "pill " + st.cls }, st.label));
    stLine.append(el("span", null, !c.published ? "홈페이지에 보이지 않습니다." : pre && c.scheduled ? dot(c.postedAt) + "부터 홈페이지에 보입니다. 그 전에는 공고 목록에 나타나지 않습니다." : pre ? "지금도 홈페이지에 보입니다. 게시일 전에 숨기려면 ‘예약 게시’를 켜세요." : "홈페이지에 게시 중입니다."));
    hBox.textContent = "";
    if (pre) {
      hBox.append(el("p", { class: "callout" }, "아직 게시일(" + dot(c.postedAt) + ") 전이라 자유롭게 고칠 수 있고, 변경 이력이 남지 않습니다. 공개 이력은 ‘" + dot(c.postedAt) + " 최초 게시’ 한 줄입니다. 게시일이 지나면 고칠 때마다 사유를 적어야 합니다."));
      reason.w.hidden = true;
    } else {
      hBox.append(el("p", { class: "sub" }, (d.history || []).map((h) => dot(h.at) + " " + h.note).join(" · ") || "아직 없음"));
      reason.w.hidden = false;
    }
    if (!pvBack.hidden) return;
    renderPaper(pvBox, { ...c, history: pre ? nextHistory(c) : [...(d.history || []), ...(reason.input.value.trim() ? [{ at: today, note: reason.input.value.trim() }] : [])] });
  }
  let rt; ed.addEventListener("input", () => { clearTimeout(rt); rt = setTimeout(refresh, 120); });
  ed.addEventListener("change", () => refresh());
  refresh();

  saveBar(async () => {
    const id = (isNew ? idF.input.value : n.id).trim();
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) { toast("주소에 쓸 이름은 영문·숫자·-만 쓸 수 있습니다"); return false; }
    const c = collect();
    if (!c.title) { toast("제목을 적어 주세요"); return false; }
    if (!c.postedAt) { toast("게시일을 정해 주세요"); return false; }
    if (!preNow() && !reason.input.value.trim()) { toast("변경 사유를 적어 주세요 (게시일이 지나 공개 이력에 남습니다)"); reason.input.focus(); return false; }
    try {
      const ref = doc(db, "notices", id);
      const cur = await getDoc(ref);
      if (isNew && cur.exists()) { toast("같은 이름의 공고가 이미 있습니다"); return false; }
      const next = { ...c, history: nextHistory(c), updatedAt: serverTimestamp(), updatedBy: me.email };
      if (cur.exists()) { const { updatedAt, ...old } = cur.data(); await snapshot("notices/" + id, old); }
      await setDoc(ref, next);
      await audit(isNew ? "공고 작성" : preNow() ? "공고 수정(게시 전)" : "공고 수정", "notices/" + id, preNow() ? "" : reason.input.value);
      toast("저장했습니다"); cleanState(); editNotice({ id, ...next, updatedAt: null });
    } catch (e) { toast("저장하지 못했습니다: " + (e.code || "오류")); return false; }
  }, ...(isNew ? [] : [el("a", { href: "../notice/view.html?id=" + encodeURIComponent(n.id), target: "_blank", rel: "noopener" }, "공개 화면 열기 ↗")]));

  if (!isNew) timeMachine("notices/" + n.id, async (old) => {
    const pre = !!old.postedAt && today < old.postedAt;
    const history = pre ? [{ at: old.postedAt, note: ((old.history || [])[0] || {}).note || "최초 게시" }] : [...(old.history || []), { at: today, note: "이전 내용으로 되돌림" }];
    await setDoc(doc(db, "notices", n.id), { ...old, history, updatedAt: serverTimestamp(), updatedBy: me.email });
    await audit("공고 되돌리기", "notices/" + n.id); toast("되돌렸습니다"); cleanState(); go("notices");
  }, (r) => {
    pvBack.hidden = false; pvNote.textContent = when(r.at) + " 보관본을 보고 있습니다";
    renderPaper(pvBox, r.data); setMode("prev"); window.scrollTo({ top: 0, behavior: "smooth" });
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
