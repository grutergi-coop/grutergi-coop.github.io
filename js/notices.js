// 공고 게시판 · 공고 원문 — 관리자 화면에서 저장한 공고(notices)를 보여 줍니다.
// 데이터베이스에 연결되지 않으면 기본 공고(defaults.js)를 보여 줍니다.
import { db, el, setText } from "./fb.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { NOTICES } from "./defaults.js";

const statusClass = (s) => /게시 중/.test(s) ? "pill-live" : /마감|종료|비공개/.test(s) ? "pill-off" : "pill-info";
const fmt = (d) => String(d || "").replace(/-/g, ".");
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 예약 게시: 게시일 전에는 목록과 원문에 보이지 않음
const waiting = (n) => !!n.scheduled && !!n.postedAt && kstToday() < n.postedAt;

async function loadAll() {
  try {
    const snap = await getDocs(query(collection(db, "notices"), where("published", "==", true)));
    if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => !waiting(n));
  } catch {}
  return Object.entries(NOTICES).filter(([, n]) => n.published && !waiting(n)).map(([id, n]) => ({ id, ...n }));
}

async function renderList() {
  const tbody = document.getElementById("notice-rows");
  if (!tbody) return;
  const list = (await loadAll()).sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)) || String(b.no).localeCompare(String(a.no)));
  tbody.textContent = "";
  list.forEach((n) => {
    const tr = el("tr");
    tr.append(el("td", { class: "num" }, n.kind === "공고" ? n.no : n.kind));
    const td = el("td"); const a = el("a", { href: "view.html?id=" + encodeURIComponent(n.id) });
    a.append(el("b", null, n.title)); td.append(a); tr.append(td);
    const st = el("td"); st.append(el("span", { class: "pill " + statusClass(n.status) }, n.status)); tr.append(st);
    tr.append(el("td", { class: "date" }, fmt(n.postedAt)));
    tbody.append(tr);
  });
  if (!list.length) { const tr = el("tr"); const td = el("td", { colspan: "4" }, "게시 중인 공고가 없습니다."); tr.append(td); tbody.append(tr); }
}

async function renderView() {
  const box = document.getElementById("notice-paper");
  if (!box) return;
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) { setText(document.getElementById("n-title"), "공고를 찾을 수 없습니다."); return; }
  let n = null;
  try { const s = await getDoc(doc(db, "notices", id)); if (s.exists()) n = s.data(); } catch {}
  if (!n && NOTICES[id]) n = NOTICES[id];
  if (!n || n.published === false) { setText(document.getElementById("n-title"), "공고를 찾을 수 없습니다."); return; }
  if (waiting(n)) { setText(document.getElementById("n-title"), "이 공고는 " + fmt(n.postedAt) + "에 게시됩니다."); return; }
  document.title = n.title + " · 그루터기 사회적협동조합(가칭)";
  setText(document.getElementById("n-no"), n.kind === "공고" ? "공고 제" + n.no + "호" : n.kind);
  setText(document.getElementById("n-period"), n.periodEnd ? "게시 기간 " + fmt(n.postedAt) + " ~ " + fmt(n.periodEnd) : "게시 " + fmt(n.postedAt));
  setText(document.getElementById("n-org"), n.org || "");
  setText(document.getElementById("n-title"), n.title);
  setText(document.getElementById("n-intro"), n.intro);
  const dl = document.getElementById("n-items"); dl.textContent = "";
  (n.items || []).filter((it) => !it.hidden).forEach((it) => { dl.append(el("dt", null, it.label), el("dd", null, it.text)); });
  setText(document.getElementById("n-sign"), n.sign);
  const h = document.getElementById("n-history"); h.textContent = "";
  h.append("변경 이력: ");
  (n.history || []).forEach((x, i) => { if (i) h.append(" · "); h.append(fmt(x.at) + " " + x.note); });
}

renderList();
renderView();
