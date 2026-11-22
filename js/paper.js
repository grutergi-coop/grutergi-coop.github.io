// 공고문을 A4 용지(210×297mm)로 그리기 — 공고 원문 화면과 관리자 미리보기가 함께 씁니다.
//  · 화면 폭에 맞춰 용지 전체를 줄여서 보여 줌 (글 줄바꿈은 실제 A4와 똑같음)
//  · 내용이 한 쪽을 넘으면 다음 쪽으로 넘김. 한 항목이 길면 문장 단위로 나눠 "(계속)"으로 이어 씀
//  · 휴대폰처럼 좁은 화면(공개 화면만)은 글자가 너무 작아지므로 한 장으로 흘려 보여 주고, 인쇄하면 A4로 나옴
//  · 글자는 모두 textContent로만 넣음 (HTML로 해석하지 않음 → 스크립트 삽입 차단)
export const A4 = { w: 794, h: 1123 };          // 96dpi 기준 A4 크기(px)
// 문서 모양 (관리자 화면에서 고름 · 기본은 번호형)
export const LAYOUTS = [
  ["number", "번호형", "공문서식 · 1. 일시 : …"],
  ["table", "표형", "왼쪽 항목 · 오른쪽 내용"],
  ["grid", "격자표형", "칸마다 테두리, 항목 칸 음영"],
  ["official", "관공서형", "기관명 머리 · 겹줄 · 오른쪽 명의"],
  ["guide", "안내형", "초록 막대 소제목"],
  ["card", "카드형", "항목마다 둥근 상자"]
];
const layoutOf = (n) => (LAYOUTS.some((l) => l[0] === n.layout) ? n.layout : "number");
const dot = (s) => String(s || "").replace(/-/g, ".");

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}

// ── 글 정돈: 입력은 그냥 줄글로, 줄 앞머리를 보고 자동으로 모양을 잡음
//   가. 나. 다.   → 들여쓴 목록        1) 2) / ① ②  → 한 단계 더 들여쓴 목록
//   제1호 …       → 안건 번호 목록     - · •       → 점 목록
//   ※ …           → 작은 참고 글       일시: …      → 이름표 + 내용
//   빈 줄         → 문단 사이 띄움     그 밖        → 보통 문단
const RULES = [
  [/^(제\s?\d+\s?호)\s*(.*)$/, "agenda"],
  [/^([가나다라마바사아자차카타파하])\.\s*(.*)$/, "l1"],
  [/^(\d{1,2}\))\s*(.*)$/, "l2"],
  [/^([①-⑳])\s*(.*)$/, "l2"],
  [/^([-·•∙])\s*(.*)$/, "bul"],
  [/^(※)\s*(.*)$/, "note"],
  [/^([^:：\s][^:：]{0,11})\s*[:：]\s+(.+)$/, "kv"]
];
export function formatText(text) {
  const box = mk("div", "rt");
  String(text || "").split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) { box.append(mk("div", "ln ln-gap")); return; }
    for (const [re, kind] of RULES) {
      const m = line.match(re);
      if (!m) continue;
      const row = mk("div", "ln ln-" + kind);
      row.append(mk("span", "mk", kind === "bul" ? "·" : kind === "l1" ? m[1] + "." : m[1]), mk("span", "tx", m[2]));
      box.append(row); return;
    }
    box.append(mk("div", "ln ln-p", line));
  });
  return box;
}

// 공고 내용 → 차례대로 놓을 덩어리들 (모양: table 표형 · number 번호형 · guide 안내형)
function blocks(n) {
  const out = [], layout = layoutOf(n);
  const head = mk("div", "a4-head");
  const meta = mk("div", "a4-meta");
  meta.append(mk("span", null, n.kind === "공고" ? "공고 제" + (n.no || "○") + "호" : n.kind || ""),
    mk("span", null, n.periodEnd ? "게시 기간 " + dot(n.postedAt) + " ~ " + dot(n.periodEnd) : n.postedAt ? "게시 " + dot(n.postedAt) : ""));
  head.append(meta);
  if (n.org) head.append(mk("p", "a4-org", n.org));
  head.append(mk("h1", "a4-title", n.title || "(제목)"));
  out.push({ node: head, head: true });
  if (n.intro) out.push({ text: n.intro, make: (t) => { const p = mk("div", "a4-intro"); p.append(formatText(t)); return p; } });
  (n.items || []).filter((i) => !i.hidden && (i.label || i.text)).forEach((it) => {
    const short = !/\n/.test(it.text || "") && (it.text || "").length <= 44;
    out.push({ row: true, text: it.text || "", make: (t, cont) => {
      const r = mk("div", "a4-row" + ((layout === "number" || layout === "official") && short && !cont ? " inline" : ""));
      r.append(mk("div", "a4-dt", cont ? (it.label || "") + " (계속)" : it.label || ""));
      const dd = mk("div", "a4-dd"); dd.append(formatText(t)); r.append(dd);
      return r;
    } });
  });
  if (n.sign) out.push({ node: mk("p", "a4-sign", n.sign) });
  return out;
}

// 글을 문장(줄·마침표·띄어쓰기) 단위 조각으로
// 여러 줄이면 줄 단위로(목록이 중간에 끊기지 않게), 한 줄짜리 긴 글이면 낱말 단위로
function pieces(t) {
  const s = String(t);
  if (/\n/.test(s)) return s.split(/(?<=\n)/);
  return s.match(/[^\s]+\s*|\s+/g) || [""];
}

export function renderA4(host, n, opts = {}) {
  const narrow = !opts.forceA4 && host.clientWidth < 600;
  host.textContent = "";
  host.classList.add("a4-host");
  host.classList.toggle("a4-flow", narrow);
  LAYOUTS.forEach(([k]) => host.classList.toggle("lay-" + k, layoutOf(n) === k));
  // 항목 이름 칸 너비: 가장 긴 이름이 한 줄에 들어가게 (줄바꿈 없음)
  const probe = mk("article", "a4"); probe.style.cssText = "visibility:hidden;position:absolute;left:-9999px;top:0;height:auto;display:block";
  host.append(probe);
  let lw = 0;
  (n.items || []).filter((i) => !i.hidden && i.label).forEach((i) => { const s = mk("span", "a4-dt"); s.style.cssText = "display:inline-block;white-space:nowrap;padding:0"; s.textContent = i.label; probe.append(s); lw = Math.max(lw, s.offsetWidth); });
  probe.remove();
  host.style.setProperty("--lw", Math.round(Math.min(230, Math.max(90, lw + 22))) + "px");
  const pages = [];
  let body;
  const newPage = () => {
    const wrap = mk("div", "a4-wrap"), pg = mk("article", "a4"), b = mk("div", "a4-body"), foot = mk("div", "a4-foot");
    pg.append(b, foot); wrap.append(pg); host.append(wrap);
    pages.push({ wrap, pg, foot }); body = b; return b;
  };
  const fits = () => narrow || body.scrollHeight <= body.clientHeight + 1;
  const markFirstRow = (node) => { if (node.classList?.contains("a4-row") && !body.querySelector(".a4-row")) node.classList.add("first"); };
  const place = (node) => { markFirstRow(node); body.append(node); };

  newPage();
  for (const b of blocks(n)) {
    if (b.node) {
      place(b.node);
      if (b.head) fitTitle(b.node.querySelector(".a4-title"));
      if (!fits() && body.children.length > 1) {
        b.node.remove();
        // 맺음(날짜·명의)이 다음 쪽에 혼자 남지 않게 바로 앞 항목과 함께 넘김
        const prev = body.lastElementChild, carry = b.node.classList.contains("a4-sign") && prev && prev.classList.contains("a4-row") && body.querySelectorAll(".a4-row").length > 2 ? prev : null;
        if (carry) { carry.remove(); carry.classList.remove("first"); }
        newPage(); if (carry) place(carry); place(b.node);
      }
      continue;
    }
    // 글이 들어 있는 덩어리: 남은 자리에 들어가는 만큼 넣고 나머지는 다음 쪽으로
    let rest = pieces(b.text), cont = false;
    while (rest.length) {
      const fresh = body.children.length === 0;
      const node = b.make(rest.join(""), cont); place(node);
      if (fits()) break;
      // 들어가는 만큼만 찾기 (이분 탐색)
      let lo = 0, hi = rest.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        node.replaceWith(b.make(rest.slice(0, mid).join(""), cont));
        const cur = body.lastElementChild; markFirstRow(cur);
        if (fits()) lo = mid; else hi = mid - 1;
        cur.replaceWith(node);
      }
      node.remove();
      const minKeep = fresh ? 1 : b.row ? 3 : 1;   // 쪽 끝에 한두 단어만 남기지 않음
      if (lo >= minKeep && lo < rest.length) { place(b.make(rest.slice(0, lo).join("").trimEnd(), cont)); rest = rest.slice(lo); cont = true; }
      else if (fresh) { place(b.make(rest.join(""), cont)); break; }   // 빈 쪽에도 한 조각이 안 들어가면 그대로 둠
      newPage();
    }
  }
  pages.forEach((p, i) => { p.foot.textContent = pages.length > 1 ? (i + 1) + " / " + pages.length : ""; });
  fitScale(host);
  if (!host._a4Hooked) {
    host._a4Hooked = true;
    if ("ResizeObserver" in window) {
      let w = host.clientWidth;
      new ResizeObserver(() => {
        const nw = host.clientWidth; if (Math.abs(nw - w) < 2) return; w = nw;
        // 좁은 화면 ↔ 넓은 화면을 넘나들면 다시 그림, 아니면 크기만 맞춤
        if (!opts.forceA4 && ((nw < 600) !== host.classList.contains("a4-flow"))) renderA4(host, n, opts); else fitScale(host);
      }).observe(host);
    }
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => renderA4(host, n, opts));
  }
  return pages.length;
}

// 제목은 한 줄로: 넘치면 글자를 조금씩 줄임 (너무 길면 그때만 두 줄)
function fitTitle(h) {
  if (!h) return;
  h.style.whiteSpace = "nowrap"; let size = parseFloat(getComputedStyle(h).fontSize) || 27;
  while (h.scrollWidth > h.clientWidth + 1 && size > 19) { size -= 1; h.style.fontSize = size + "px"; }
  if (h.scrollWidth > h.clientWidth + 1) h.style.whiteSpace = "normal";
}

// 용지를 화면 폭에 맞게 줄이기 (줄바꿈은 그대로, 보이는 크기만)
export function fitScale(host) {
  if (host.classList.contains("a4-flow")) { host.querySelectorAll(".a4-wrap").forEach((w) => { w.style.width = ""; w.style.height = ""; w.firstChild.style.transform = ""; }); return; }
  const s = Math.min(1, (host.clientWidth || A4.w) / A4.w);
  host.style.setProperty("--a4s", s);
  host.querySelectorAll(".a4-wrap").forEach((w) => {
    w.style.width = (A4.w * s) + "px"; w.style.height = (A4.h * s) + "px";
    w.firstChild.style.transform = "scale(" + s + ")";
  });
}
