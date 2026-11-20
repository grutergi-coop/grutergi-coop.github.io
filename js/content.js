// 첫 화면 내용 — 관리자 화면에서 저장한 내용(site/home)을 불러와 화면에 넣습니다.
// 데이터베이스에 연결되지 않으면 HTML에 적힌 기본 내용이 그대로 보입니다.
import { db, setText, safeHref, el } from "./fb.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);

function fillPairs(container, list) {
  if (!container || !Array.isArray(list)) return;
  const cards = container.querySelectorAll("[data-item]");
  list.forEach((it, i) => {
    const c = cards[i]; if (!c) return;
    setText(c.querySelector("[data-t]"), it.title);
    setText(c.querySelector("[data-x]"), it.text);
  });
}

try {
  const snap = await getDoc(doc(db, "site", "home"));
  if (snap.exists()) {
    const h = snap.data();
    document.querySelectorAll("[data-k]").forEach((node) => {
      const k = node.getAttribute("data-k");
      if (typeof h[k] === "string") setText(node, h[k]);
    });
    const strip = $("#strip");
    if (strip) {
      strip.hidden = h.stripShow === false;
      const a = $("#strip-link") || strip; if (a && h.stripLink) a.setAttribute("href", safeHref(h.stripLink));
    }
    fillPairs($("#keys"), h.keys);
    fillPairs($("#vision"), h.vision);
    fillPairs($("#values"), h.values);
    fillPairs($("#members"), h.members);
    if (Array.isArray(h.timeline)) {
      const ol = $("#timeline"); ol.textContent = "";
      h.timeline.forEach((t) => {
        const li = el("li", t.now ? { class: "now" } : null);
        li.append(el("b", null, t.when), el("span", null, t.what));
        ol.append(li);
      });
    }
    if (Array.isArray(h.kidsList)) {
      const ul = $("#kids-list"); ul.textContent = "";
      h.kidsList.forEach((t) => ul.append(el("li", null, t)));
    }
  }
} catch (e) {
  // 연결 실패 시 기본 HTML 내용 유지
}
// 스크롤 연출(scroll.js)에 내용이 다 채워졌다고 알림 — 문장 나누기·나이테 고리를 다시 그림
document.dispatchEvent(new Event("home:filled"));
