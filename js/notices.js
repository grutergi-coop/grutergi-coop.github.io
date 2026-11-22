// 공고 게시판 · 공고 원문 — 관리자 화면에서 저장한 공고(notices)를 보여 줍니다.
// 데이터베이스에 연결되지 않으면 기본 공고(defaults.js)를 보여 줍니다.
import { db, el, setText } from "./fb.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { NOTICES } from "./defaults.js";
import { renderA4 } from "./paper.js";

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
  const say = (m) => { box.textContent = ""; box.append(el("p", { class: "muted", style: "text-align:center;padding:48px 0" }, m)); };
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(id)) return say("공고를 찾을 수 없습니다.");
  let n = null;
  try { const s = await getDoc(doc(db, "notices", id)); if (s.exists()) n = s.data(); } catch {}
  if (!n && NOTICES[id]) n = NOTICES[id];
  if (!n || n.published === false) return say("공고를 찾을 수 없습니다.");
  if (waiting(n)) return say("이 공고는 " + fmt(n.postedAt) + "에 게시됩니다.");
  document.title = n.title + " · 그루터기 사회적협동조합(가칭)";
  renderA4(box, n);
  const pr = document.getElementById("n-print");
  if (pr) { pr.hidden = false; pr.addEventListener("click", () => window.print()); }
}

renderList();
renderView();
