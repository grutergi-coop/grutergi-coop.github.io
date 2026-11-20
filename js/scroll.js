// 스크롤 연출 (스크롤텔링) — 장면을 화면에 붙잡아 두고, 내려가는 만큼 그림과 글이 바뀝니다.
//   첫 화면: 그림이 천천히 다가오고 글이 위로 사라짐
//   중심 말씀: 한 단어씩 밝아짐 · 비전: 그림과 글이 차례로 바뀜
//   나이테: 한 해씩 고리가 퍼짐 · 어린이집: 사진이 화면 가득 펼쳐짐 · 나머지: 화면에 들어오면 한 번 떠오름
// '동작 줄이기'를 켠 기기, 아주 낮은 화면에서는 붙잡지 않고 모두 펼쳐 보여 줌 (CSS가 처리)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const root = document.documentElement;
const mqReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const mqShort = window.matchMedia ? matchMedia("(max-height: 479px)") : { matches: false };
const still = () => mqReduce.matches || mqShort.matches;

const hdr = $("#hdr"), hero = $("#s-hero"), about = $("#about"), vis = $("#s-vision"), ringsSec = $("#rings"), kids = $("#kids");
const GOLD = ["지혜", "빛", "별", "영원토록"];
let words = [], rings = [], tlItems = [];
const darks = [about, $("#inquiry"), $(".site-footer")].filter(Boolean);

// 중심 말씀을 단어로 나눔 (글자만 다룸)
function splitSay() {
  const p = $("#say"); if (!p) return;
  const text = p.textContent.trim().replace(/\s+/g, " ");
  p.textContent = "";
  text.split(" ").forEach((w, i, a) => {
    const s = document.createElement("span");
    s.className = "w" + (GOLD.some((g) => w.indexOf(g) === 0) ? " gold" : "");
    s.textContent = w;
    p.append(s);
    if (i < a.length - 1) p.append(document.createTextNode(" "));
  });
  words = $$(".w", p);
}
// 연혁 개수만큼 나이테 고리를 그림
function buildRings() {
  const svg = $(".ring-art"); if (!svg) return;
  $$("circle:not(.core)", svg).forEach((c) => c.remove());
  tlItems = $$("#timeline li");
  const n = Math.max(1, tlItems.length), step = Math.min(56, 240 / n);
  rings = tlItems.map((li, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", "300"); c.setAttribute("cy", "300"); c.setAttribute("r", String(Math.round(58 + i * step)));
    if (li.classList.contains("now")) c.setAttribute("class", "hot");
    svg.append(c);
    return c;
  });
}
function setup() { splitSay(); buildRings(); root.classList.toggle("still", still()); frame(); }

// 장면 안에서 얼마나 내려왔는지 0~1
function prog(el) {
  const r = el.getBoundingClientRect(), h = el.offsetHeight - innerHeight;
  return h > 0 ? clamp(-r.top / h) : (r.top < innerHeight ? 1 : 0);
}
const on = (el, v) => el.classList.toggle("on", v);

let queued = false;
function frame() {
  queued = false;
  if (hdr) {
    hdr.classList.toggle("solid", scrollY > 40);
    // 짙은 장면(중심 말씀·문의·맨 아래) 위에서는 머리글도 어둡게
    const y = 34, dark = darks.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    hdr.classList.toggle("dark", dark);
  }
  if (still()) { words.forEach((w) => on(w, true)); rings.forEach((c) => on(c, true)); tlItems.forEach((l) => on(l, true)); $$("#vision .item, #s-vision .pics img").forEach((e) => on(e, true)); return; }

  if (hero) hero.style.setProperty("--p", prog(hero).toFixed(4));

  if (about && words.length) {
    const n = Math.round(clamp(prog(about) * 1.2) * words.length);
    words.forEach((w, i) => on(w, i < n));
  }
  if (vis) {
    const p = prog(vis), items = $$("#vision .item"), pics = $$("#s-vision .pics img");
    const k = Math.min(items.length - 1, Math.floor(p * items.length));
    items.forEach((e, i) => on(e, i === k)); pics.forEach((e, i) => on(e, i === k));
    $$("#s-vision .dots b").forEach((b, i) => { b.style.width = (clamp(p * items.length - i) * 100).toFixed(1) + "%"; });
  }
  if (ringsSec && rings.length) {
    const m = Math.min(rings.length - 1, Math.floor(prog(ringsSec) * rings.length * 1.05));
    rings.forEach((c, i) => on(c, i <= m));
    tlItems.forEach((l, i) => { on(l, i <= m); l.classList.toggle("cur", i === m); });
  }
  if (kids) {
    const p = prog(kids);
    kids.style.setProperty("--e", ease(clamp(p / 0.55)).toFixed(4));
    kids.style.setProperty("--t", clamp((p - 0.5) / 0.3).toFixed(3));
  }
}
const ask = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
addEventListener("scroll", ask, { passive: true });
addEventListener("resize", () => { root.classList.toggle("still", still()); ask(); });

// 화면에 들어오면 한 번 떠오름
const rises = $$(".rise");
if ("IntersectionObserver" in window && !still()) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  rises.forEach((el) => io.observe(el));
} else rises.forEach((el) => el.classList.add("in"));

root.classList.add("js-scroll");
setup();
// 관리자 화면에서 저장한 내용이 채워지면 다시 나눔
document.addEventListener("home:filled", setup);
