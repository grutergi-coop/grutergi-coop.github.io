// 조합원 전용 화면 — 이메일 링크 로그인 → 확인 신청 → 사무국 승인 → 자료 열람
import { auth, db, el } from "./fb.js";
import { usePersistence, sendLink, finishLinkIfAny, startSession, endSession } from "./session.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const show = (id) => ["login", "apply", "pending", "dash"].forEach((k) => { $(k).hidden = k !== id; });
const say = (box) => (t, ok) => { const m = $(box); m.textContent = t; m.className = "msg " + (ok ? "msg-ok" : "msg-err"); m.hidden = false; };

await usePersistence("member");
await finishLinkIfAny(say("login-msg"));

$("login-form").addEventListener("submit", (e) => { e.preventDefault(); sendLink($("email").value.trim(), say("login-msg")); });
$("logout").addEventListener("click", () => endSession(auth.currentUser, "logout"));

$("apply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser; const name = $("apply-name").value.trim().slice(0, 40);
  if (!user || !name) return;
  try {
    await setDoc(doc(db, "members", user.uid), { email: user.email, name, approved: false, createdAt: serverTimestamp() });
    $("pending-email").textContent = user.email; show("pending");
  } catch { say("apply-msg")("신청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", false); }
});

onAuthStateChanged(auth, async (user) => {
  $("logout").hidden = !user;
  if (!user) { show("login"); return; }
  startSession(user, "member", (mins) => { say("login-msg")(mins + "분 동안 움직임이 없어 로그아웃되었습니다.", false); });
  const snap = await getDoc(doc(db, "members", user.uid)).catch(() => null);
  const m = snap && snap.exists() ? snap.data() : null;
  if (!m) { $("apply-email").textContent = user.email; show("apply"); return; }
  if (m.approved !== true) { $("pending-email").textContent = user.email; show("pending"); return; }
  show("dash");
  $("member-name").textContent = m.name || "";
  $("member-type").textContent = (m.type || "") + (m.shares ? " · 출자 " + m.shares + "좌" : "");
  $("share").textContent = m.shares ? m.shares + "좌 · " + (m.shares * 50000).toLocaleString("ko-KR") + "원" + (m.paid ? " · 납입 완료" : " · 인가 후 납입") : "출자 정보가 아직 없습니다.";
  const list = $("meetings"); list.textContent = "";
  const rows = await getDocs(query(collection(db, "meetings"), orderBy("date", "desc"))).catch(() => null);
  if (!rows || rows.empty) { list.append(el("li", null, "아직 올라온 자료가 없습니다.")); return; }
  rows.forEach((r) => { const d = r.data(); const li = el("li"); li.append(el("a", { href: d.url, rel: "noopener noreferrer", target: "_blank" }, d.date + " · " + d.title)); list.append(li); });
});
