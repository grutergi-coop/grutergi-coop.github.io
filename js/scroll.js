// 스크롤 연출 (스크롤텔링) — 장면을 화면에 붙잡아 두고, 내려가는 만큼 그림과 글이 바뀝니다.
//   첫 화면: 그림이 천천히 다가오고 글이 위로 사라짐
//   중심 말씀: 한 단어씩 밝아짐 · 비전: 그림과 글이 차례로 바뀜
//   걸어온 길: 연혁 단계마다 그루터기가 커지고 나이테가 늘어남 · 어린이집: 사진이 화면 가득 펼쳐짐 · 나머지: 화면에 들어오면 한 번 떠오름
// '동작 줄이기'를 켠 기기, 아주 낮은 화면에서는 붙잡지 않고 모두 펼쳐 보여 줌 (CSS가 처리)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const root = document.documentElement;
const mqReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const mqShort = window.matchMedia ? matchMedia("(max-height: 479px)") : { matches: false };
const still = () => mqReduce.matches || mqShort.matches;

const hdr = $("#hdr"), hero = $("#s-hero"), about = $("#about"), vis = $("#s-vision"), ringsSec = $("#rings"), kids = $("#kids"), call = $("#s-call");
const GOLD = ["지혜", "빛", "별", "영원토록"];
let words = [], rings = [], tlItems = [];
const trees = $$("#tree-art img"); // 연혁 단계별 그루터기 그림 (작은 그루터기 → 나이테가 촘촘한 큰 그루터기)
const darks = [about, call, $("#inquiry"), $(".site-footer")].filter(Boolean);

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
  tlItems = $$("#timeline li");
  const svg = $("svg.ring-art"); if (!svg) { rings = []; return; }   // 지금은 수채화 그림(img)을 씀 — SVG일 때만 고리를 그림
  $$("circle:not(.core)", svg).forEach((c) => c.remove());
  const n = Math.max(1, tlItems.length), step = Math.min(56, 240 / n);
  rings = tlItems.map((li, i) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", "300"); c.setAttribute("cy", "300"); c.setAttribute("r", String(Math.round(58 + i * step)));
    if (li.classList.contains("now")) c.setAttribute("class", "hot");
    svg.append(c);
    return c;
  });
}
// 키워드 개수만큼 아래 작은 등불을 만듦
let keyItems = [], lamps = [];
function buildLamps() {
  const box = $("#s-call .lamps"); if (!box) return;
  box.textContent = ""; keyItems = $$("#keys li");
  lamps = keyItems.map((li) => { const l = document.createElement("li"); const s = document.createElement("span"); s.textContent = ($("[data-t]", li) || li).textContent; l.append(s); box.append(l); return l; });
}
function setup() { splitSay(); buildRings(); buildLamps(); root.classList.toggle("still", still()); frame(); }

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
  if (still()) { words.forEach((w) => on(w, true)); rings.forEach((c) => on(c, true)); trees.forEach((t, i) => on(t, i === trees.length - 1)); tlItems.forEach((l) => on(l, true)); $$("#vision .item, #s-vision .pics img, #keys li").forEach((e) => on(e, true)); return; }

  if (hero) hero.style.setProperty("--p", prog(hero).toFixed(4));

  if (about && words.length) {
    const n = Math.round(clamp(prog(about) * 1.2) * words.length);
    words.forEach((w, i) => on(w, i < n));
  }
  if (call && keyItems.length) {
    // 앞 18%: 시대와 부르심 문장 → 이후: 키워드가 하나씩, 터널 끝 빛으로 다가감
    const p = prog(call), a = clamp(1 - (p - 0.1) / 0.07), b = clamp((p - 0.18) / 0.05);
    const q = clamp((p - 0.2) / 0.78), k = Math.min(keyItems.length - 1, Math.floor(q * keyItems.length));
    call.style.setProperty("--a", a.toFixed(3)); call.style.setProperty("--b", b.toFixed(3)); call.style.setProperty("--q", clamp(p / 0.98).toFixed(4));
    call.classList.toggle("k-on", b > 0);
    keyItems.forEach((e, i) => on(e, i === k && b > 0));
    lamps.forEach((l, i) => { l.classList.toggle("lit", b > 0 && i <= k); l.classList.toggle("cur", b > 0 && i === k); });
  }
  if (vis) {
    const p = prog(vis), items = $$("#vision .item"), pics = $$("#s-vision .pics img");
    const k = Math.min(items.length - 1, Math.floor(p * items.length));
    items.forEach((e, i) => on(e, i === k)); pics.forEach((e, i) => on(e, i === k));
    $$("#s-vision .dots b").forEach((b, i) => { b.style.width = (clamp(p * items.length - i) * 100).toFixed(1) + "%"; });
  }
  if (ringsSec && tlItems.length) {
    // 내려갈수록 연혁이 하나씩 밝아지고, 그루터기가 그 단계만큼 커짐
    const p = prog(ringsSec), m = Math.min(tlItems.length - 1, Math.floor(p * tlItems.length * 1.05));
    ringsSec.style.setProperty("--r", ((m + 1) / tlItems.length).toFixed(3));
    rings.forEach((c, i) => on(c, i <= m));
    trees.forEach((t, i) => on(t, i === Math.min(m, trees.length - 1)));
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
