// 서면 문의 — 누구나 남길 수 있고, 관리자 화면 › 문의에서 목록으로 봅니다.
import { db } from "./fb.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const form = document.getElementById("inq-form");
if (form) {
  const opened = Date.now();
  const msgBox = document.getElementById("inq-msg");
  const body = document.getElementById("inq-body");
  const count = document.getElementById("inq-count");
  const btn = form.querySelector("button[type=submit]");
  const say = (t, ok) => { msgBox.textContent = t; msgBox.className = "msg " + (ok ? "msg-ok" : "msg-err"); msgBox.hidden = false; };
  body.addEventListener("input", () => { count.textContent = body.value.length + " / 2000"; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get("website")) return;                       // 자동 등록 프로그램 차단(사람에게는 보이지 않는 칸)
    if (Date.now() - opened < 3000) { say("잠시 후 다시 눌러 주세요.", false); return; }
    const name = String(f.get("name") || "").trim();
    const contact = String(f.get("contact") || "").trim();
    const message = String(f.get("message") || "").trim();
    const isMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact);
    const isPhone = /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(contact.replace(/\s/g, ""));
    if (!name) return say("이름을 적어 주세요.", false);
    if (!isMail && !isPhone) return say("답변 받을 이메일 주소나 전화번호를 정확히 적어 주세요. 예: name@example.com 또는 010-1234-5678", false);
    if (message.length < 10) return say("문의 내용을 10자 이상 적어 주세요.", false);
    if (!f.get("agree")) return say("개인정보 수집·이용에 동의해야 문의를 남길 수 있습니다.", false);
    btn.disabled = true; btn.textContent = "보내는 중";
    try {
      await addDoc(collection(db, "inquiries"), {
        name: name.slice(0, 40), contact: contact.slice(0, 100),
        category: String(f.get("category")), message: message.slice(0, 2000),
        agree: true, status: "new", createdAt: serverTimestamp(), page: location.pathname.slice(0, 100)
      });
      form.reset(); count.textContent = "0 / 2000";
      say("문의가 접수되었습니다. 남겨 주신 연락처로 답변드리겠습니다.", true);
    } catch (err) {
      say("문의를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", false);
    } finally {
      btn.disabled = false; btn.textContent = "문의 남기기";
    }
  });
}
