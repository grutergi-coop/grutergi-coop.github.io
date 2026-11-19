// 조합원 전용 화면 — 이메일 링크 로그인 + Firestore 열람
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const show = (id, on) => { $(id).hidden = !on; };
const msg = (text, ok) => { const m = $("login-msg"); m.textContent = text; m.className = "msg " + (ok ? "msg-ok" : "msg-err"); m.hidden = false; };

if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  msg("조합원 로그인은 준비 중입니다.", false);
  $("login-form").hidden = true;
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (isSignInWithEmailLink(auth, location.href)) {
    let email = localStorage.getItem("grEmail") || prompt("로그인에 사용한 이메일을 다시 적어 주세요") || "";
    signInWithEmailLink(auth, email, location.href)
      .then(() => { localStorage.removeItem("grEmail"); history.replaceState(null, "", location.pathname); })
      .catch(() => msg("링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.", false));
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    try {
      await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
      localStorage.setItem("grEmail", email);
      msg(email + " 으로 로그인 링크를 보냈습니다. 메일함을 확인해 주세요.", true);
    } catch (err) {
      msg("링크를 보내지 못했습니다. 이메일 주소를 확인해 주세요.", false);
    }
  });

  $("logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    show("logout", !!user);
    if (!user) { show("login", true); show("pending", false); show("dash", false); return; }
    show("login", false);
    const snap = await getDoc(doc(db, "members", user.uid)).catch(() => null);
    const m = snap && snap.exists() ? snap.data() : null;
    if (!m || m.approved !== true) {
      $("pending-email").textContent = user.email;
      show("pending", true); show("dash", false); return;
    }
    show("pending", false); show("dash", true);
    $("member-name").textContent = m.name || "";
    $("member-type").textContent = (m.type || "") + (m.shares ? " · 출자 " + m.shares + "좌" : "");
    $("share").textContent = m.shares ? m.shares + "좌 · " + (m.shares * 50000).toLocaleString("ko-KR") + "원" + (m.paid ? " · 납입 완료" : " · 인가 후 납입") : "출자 정보가 아직 없습니다.";
    const list = $("meetings"); list.textContent = "";
    const rows = await getDocs(query(collection(db, "meetings"), orderBy("date", "desc"))).catch(() => null);
    if (!rows || rows.empty) { const li = document.createElement("li"); li.textContent = "아직 올라온 자료가 없습니다."; list.append(li); return; }
    rows.forEach((r) => {
      const d = r.data(); const li = document.createElement("li");
      const a = document.createElement("a"); a.href = d.url; a.textContent = d.date + " · " + d.title; a.rel = "noopener";
      li.append(a); list.append(li);
    });
  });
}
