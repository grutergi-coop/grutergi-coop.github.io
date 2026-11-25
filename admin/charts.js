// 관리자 화면 그래프 — 바깥 라이브러리 없이 SVG로 그립니다 (보안 규칙상 외부 스크립트 금지).
// 모든 글자는 textContent로만 넣습니다. 화면 폭이 바뀌면 다시 그립니다.
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
};
const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export const fmt = (v) => Number(v || 0).toLocaleString("ko-KR");
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// 보기 좋은 눈금 (0 · 중간 · 위)
function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// 떠 있는 설명 상자 (하나만 씀)
let tipEl = null;
function tip() {
  if (!tipEl) { tipEl = h("div", "cx-tip"); tipEl.setAttribute("role", "status"); tipEl.hidden = true; document.body.append(tipEl); }
  return tipEl;
}
export function showTip(x, y, title, rows) {
  const t = tip(); t.textContent = "";
  t.append(h("b", null, title));
  rows.forEach(([label, value, cls]) => {
    const r = h("div", "cx-tip-row");
    const k = h("span", null, label); if (cls) { const d = h("i", "cx-key " + cls); k.prepend(d); }
    r.append(k, h("em", null, value)); t.append(r);
  });
  t.hidden = false;
  const w = t.offsetWidth, hh = t.offsetHeight;
  let left = x + 14, top = y - hh - 12;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  t.style.left = Math.max(8, left) + "px"; t.style.top = top + "px";
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }
addEventListener("scroll", hideTip, { passive: true });

// 폭이 바뀌면 다시 그리기
function responsive(host, draw) {
  let last = 0;
  const run = () => { const w = Math.round(host.clientWidth); if (!w || w === last) return; last = w; host.textContent = ""; draw(w); };
  run();
  const ro = new ResizeObserver(() => run()); ro.observe(host);
  requestAnimationFrame(run);
}

// ── 꺾은선(면) 그래프: 날짜별 추이. series[0]이 이번 기간, series[1](선택)이 지난 기간(점선)
export function lineChart(host, { labels, series, height = 220, unit = "회", title = (i) => labels[i] }) {
  responsive(host, (W) => {
    const H = height, L = 40, R = 20, T = 14, B = 28;
    const iw = W - L - R, ih = H - T - B, n = labels.length;
    const max = niceMax(Math.max(1, ...series.flatMap((x) => x.values)));
    const X = (i) => L + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => T + ih - (v / max) * ih;
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "cx-svg", role: "img", "aria-label": series[0].name + " 추이 그래프" });
    // 눈금 (가로선은 옅게)
    [0, max / 2, max].forEach((v) => {
      svg.append(s("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v ? "cx-grid" : "cx-base" }));
      svg.append(s("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end", class: "cx-axis" }, fmt(v)));
    });
    // 날짜 글자: 겹치지 않게 간격을 두고
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
    labels.forEach((lb, i) => { if ((i % every === 0 && n - 1 - i >= every * 0.6) || i === n - 1) svg.append(s("text", { x: X(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle", class: "cx-axis" }, lb)); });
    // 선 (지난 기간 먼저 → 이번 기간이 위)
    [...series].reverse().forEach((se) => {
      const pts = se.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
      if (!se.dashed) svg.append(s("path", { d: `M${X(0)},${Y(0)} L${pts.join(" L")} L${X(n - 1)},${Y(0)} Z`, class: "cx-area " + se.cls }));
      svg.append(s("polyline", { points: pts.join(" "), class: "cx-line " + se.cls + (se.dashed ? " cx-dash" : "") }));
    });
    // 마지막 값 표시 (점 하나 + 숫자 하나만)
    const lastV = series[0].values[n - 1];
    svg.append(s("circle", { cx: X(n - 1), cy: Y(lastV), r: 4.5, class: "cx-dot " + series[0].cls }));
    // 따라다니는 세로선
    const cross = s("line", { y1: T, y2: T + ih, class: "cx-cross", visibility: "hidden" });
    const hot = s("circle", { r: 5, class: "cx-dot " + series[0].cls, visibility: "hidden" });
    svg.append(cross, hot);
    const hit = s("rect", { x: L, y: T, width: iw, height: ih, fill: "transparent" });
    const move = (ev) => {
      const r = svg.getBoundingClientRect(); const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / iw) * (n - 1))));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      hot.setAttribute("cx", X(i)); hot.setAttribute("cy", Y(series[0].values[i])); hot.setAttribute("visibility", "visible");
      showTip(r.left + X(i), r.top + Y(series[0].values[i]), title(i), series.map((se) => [se.name, fmt(se.values[i]) + unit, se.cls]));
    };
    const out = () => { cross.setAttribute("visibility", "hidden"); hot.setAttribute("visibility", "hidden"); hideTip(); };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move); hit.addEventListener("pointerleave", out);
    svg.append(hit);
    host.append(svg);
  });
  if (series.length > 1) {
    const lg = h("div", "cx-legend");
    series.forEach((se) => { const it = h("span", null, se.name); it.prepend(h("i", "cx-key " + se.cls + (se.dashed ? " cx-key-dash" : ""))); lg.append(it); });
    host.after(lg);
  }
}

// ── 세로 막대: 시간대별 (0~23시)
export function barChart(host, { labels, values, height = 180, unit = "회", title = (i) => labels[i], every = 3, highlight = -1 }) {
  responsive(host, (W) => {
    const H = height, L = 34, R = 6, T = 12, B = 24;
    const iw = W - L - R, ih = H - T - B, n = values.length;
    const max = niceMax(Math.max(1, ...values));
    const slot = iw / n, bw = Math.max(3, Math.min(22, slot - 2));
    const Y = (v) => T + ih - (v / max) * ih;
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "cx-svg", role: "img", "aria-label": "막대 그래프" });
    [0, max / 2, max].forEach((v) => {
      svg.append(s("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v ? "cx-grid" : "cx-base" }));
      svg.append(s("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", class: "cx-axis" }, fmt(v)));
    });
    values.forEach((v, i) => {
      const x = L + i * slot + (slot - bw) / 2, y = Y(v), hgt = T + ih - y;
      if (v > 0) {
        const r = Math.min(4, bw / 2, hgt);
        svg.append(s("path", { d: `M${x},${T + ih} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${T + ih} Z`, class: "cx-bar" + (i === highlight ? " cx-bar-hi" : "") }));
      }
      if (i % every === 0) svg.append(s("text", { x: L + i * slot + slot / 2, y: H - 6, "text-anchor": "middle", class: "cx-axis" }, labels[i]));
      const hit = s("rect", { x: L + i * slot, y: T, width: slot, height: ih, fill: "transparent" });
      const show = () => { const r = svg.getBoundingClientRect(); showTip(r.left + L + i * slot + slot / 2, r.top + y, title(i), [["방문", fmt(v) + unit]]); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hideTip);
      svg.append(hit);
    });
    host.append(svg);
  });
}

// ── 가로 막대 목록: 비율 비교 (화면·운영체제·브라우저·들어온 경로)
export function hBars(host, items, { unit = "회" } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const max = Math.max(1, ...items.map((x) => x.value));
  const list = h("div", "cx-hbars");
  if (!total) { list.append(h("p", "cx-empty", "아직 모인 자료가 없습니다")); host.append(list); return; }
  items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).forEach((it) => {
    const row = h("div", "cx-hrow");
    const head = h("div", "cx-hhead");
    head.append(h("span", null, it.label), h("em", null, `${fmt(it.value)}${unit} · ${pct(it.value, total)}%`));
    const track = h("div", "cx-htrack"); const bar = h("i"); bar.style.width = Math.max(1.5, (it.value / max) * 100) + "%";
    track.append(bar); row.append(head, track); list.append(row);
  });
  host.append(list);
}

// ── 도넛: 세 가지 이하 비율 (기기). 숫자는 옆 목록에 직접 표시
export function donut(host, items, { center = "합계", unit = "회" } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const wrap = h("div", "cx-donut");
  const S = 168, R = 70, W = 22, C = 2 * Math.PI * R;
  const svg = s("svg", { width: S, height: S, viewBox: `0 0 ${S} ${S}`, class: "cx-svg", role: "img", "aria-label": items.map((x) => `${x.label} ${pct(x.value, total)}%`).join(", ") });
  svg.append(s("circle", { cx: S / 2, cy: S / 2, r: R, class: "cx-ring" , "stroke-width": W }));
  let off = 0; const gap = total && items.filter((x) => x.value).length > 1 ? 3 : 0;
  items.forEach((it) => {
    if (!it.value) return;
    const len = (it.value / total) * C;
    const seg = s("circle", { cx: S / 2, cy: S / 2, r: R, class: "cx-seg " + it.cls, "stroke-width": W,
      "stroke-dasharray": `${Math.max(0.1, len - gap)} ${C}`, "stroke-dashoffset": -off, transform: `rotate(-90 ${S / 2} ${S / 2})` });
    const show = (ev) => showTip(ev.clientX, ev.clientY, it.label, [["방문", `${fmt(it.value)}${unit} (${pct(it.value, total)}%)`, it.cls]]);
    seg.addEventListener("pointermove", show); seg.addEventListener("pointerdown", show); seg.addEventListener("pointerleave", hideTip);
    svg.append(seg); off += len;
  });
  svg.append(s("text", { x: S / 2, y: S / 2 - 4, "text-anchor": "middle", class: "cx-center-n" }, fmt(total)));
  svg.append(s("text", { x: S / 2, y: S / 2 + 16, "text-anchor": "middle", class: "cx-axis" }, center));
  const lg = h("ul", "cx-dlist");
  items.forEach((it) => {
    const li = h("li"); const k = h("span", null, it.label); k.prepend(h("i", "cx-key " + it.cls));
    li.append(k, h("b", null, pct(it.value, total) + "%"), h("em", null, fmt(it.value) + unit)); lg.append(li);
  });
  wrap.append(svg, lg); host.append(wrap);
}

// ── 요일 × 시간 열지도: 언제 많이 들어오는지 (진할수록 많음)
export function heatmap(host, { rows, cols, values, unit = "회", colEvery = 3 }) {
  const max = Math.max(1, ...values.flat());
  const grid = h("div", "cx-heat"); grid.style.setProperty("--cols", cols.length);
  grid.setAttribute("role", "img"); grid.setAttribute("aria-label", "요일과 시간대별 방문 열지도");
  grid.append(h("span", "cx-heat-corner"));
  cols.forEach((c, j) => grid.append(h("span", "cx-heat-col", j % colEvery === 0 ? c : "")));
  rows.forEach((r, i) => {
    grid.append(h("span", "cx-heat-row", r));
    cols.forEach((c, j) => {
      const v = values[i][j]; const cell = h("i", "cx-cell");
      const step = v ? Math.min(5, 1 + Math.floor((v / max) * 4.999)) : 0;
      cell.dataset.s = String(step);
      const show = (ev) => showTip(ev.clientX, ev.clientY, `${r}요일 ${c}시`, [["방문", fmt(v) + unit]]);
      cell.addEventListener("pointerenter", show); cell.addEventListener("pointerdown", show); cell.addEventListener("pointerleave", hideTip);
      grid.append(cell);
    });
  });
  const lg = h("div", "cx-heat-legend"); lg.append(h("span", null, "적음"));
  for (let k = 0; k <= 5; k++) { const c = h("i", "cx-cell"); c.dataset.s = String(k); lg.append(c); }
  lg.append(h("span", null, "많음"));
  host.append(grid, lg);
}

// ── 시·도 칸 지도: 대한민국 모양을 닮은 칸 배치, 진할수록 많이 들어온 지역
//   tiles: [{ label, short, value, col, row }]  (col·row는 0부터)
export function tileMap(host, tiles, { unit = "대" } = {}) {
  const max = Math.max(1, ...tiles.map((t) => t.value));
  const total = tiles.reduce((a, b) => a + b.value, 0);
  const cols = Math.max(...tiles.map((t) => t.col)) + 1, rows = Math.max(...tiles.map((t) => t.row)) + 1;
  const map = h("div", "cx-tiles"); map.style.setProperty("--cols", cols); map.style.setProperty("--rows", rows);
  map.setAttribute("role", "img");
  map.setAttribute("aria-label", "시·도별 방문 기기: " + tiles.filter((t) => t.value).map((t) => `${t.label} ${t.value}`).join(", ") || "자료 없음");
  tiles.forEach((t) => {
    const c = h("div", "cx-tile"); c.style.gridColumn = String(t.col + 1); c.style.gridRow = String(t.row + 1);
    c.dataset.s = String(t.value ? Math.min(5, 1 + Math.floor((t.value / max) * 4.999)) : 0);
    c.append(h("span", null, t.short), h("b", null, t.value ? fmt(t.value) : "·"));
    const show = (ev) => showTip(ev.clientX, ev.clientY, t.label, [["방문 기기", `${fmt(t.value)}${unit} (${pct(t.value, total)}%)`]]);
    c.addEventListener("pointerenter", show); c.addEventListener("pointerdown", show); c.addEventListener("pointerleave", hideTip);
    map.append(c);
  });
  host.append(map);
}

// ── 단계별 도달 비율: 기준(예: 방문한 기기) 중 몇 %가 그 단계까지 왔는지
export function funnel(host, items, base, { unit = "대", baseLabel = "기준" } = {}) {
  const list = h("div", "cx-hbars");
  if (!base || !items.some((x) => x.value)) { list.append(h("p", "cx-empty", "아직 모인 자료가 없습니다")); host.append(list); return; }
  items.forEach((it) => {
    const p = Math.min(100, pct(it.value, base));
    const row = h("div", "cx-hrow"); const head = h("div", "cx-hhead");
    head.append(h("span", null, it.label), h("em", null, `${p}% · ${fmt(it.value)}${unit}`));
    const track = h("div", "cx-htrack"); const bar = h("i"); bar.style.width = Math.max(1.5, p) + "%";
    track.append(bar); row.append(head, track); list.append(row);
  });
  list.append(h("p", "cx-foot", `${baseLabel} ${fmt(base)}${unit} 중 비율`));
  host.append(list);
}

// ── 표로 보기 (그래프를 읽기 어려운 분을 위해 같은 숫자를 표로)
export function table(host, head, rows) {
  const wrap = h("div", "cx-table-wrap"); const t = h("table", "cx-table");
  const tr = h("tr"); head.forEach((c) => tr.append(h("th", null, c))); const th = h("thead"); th.append(tr); t.append(th);
  const tb = h("tbody"); rows.forEach((r) => { const x = h("tr"); r.forEach((c, i) => x.append(h(i ? "td" : "th", null, c))); tb.append(x); }); t.append(tb);
  wrap.append(t); host.append(wrap);
}
