// 첫 화면 빛 효과 — 새싹에서 피어오르는 빛 알갱이 + 낮에는 노란 나비, 밤에는 반딧불이
// 화면을 가리지 않음 · 글자 아래 그림 위에서만 움직임 · '동작 줄이기' 존중 · 화면 밖이거나 다른 탭이면 멈춤
// 관리자 화면 › 홈 화면 › "첫 화면 빛 효과"로 켜고 끔. 확인용: 주소 끝에 ?time=day 또는 ?time=night
import { db } from "./fb.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const hero = document.querySelector(".hero");
const fx = hero && hero.querySelector(".hero-fx");
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

if (hero && fx && !reduce) start();

function start() {
  const q = new URLSearchParams(location.search).get("time");
  const h = new Date().getHours();
  const night = q === "night" || (q !== "day" && (h >= 19 || h < 6));   // 방문자 기기 시계 기준 저녁 7시~새벽 6시
  if (night) hero.classList.add("is-night");

  const IMG = { w: 1280, h: 720, sprout: [0.594, 0.444] };
  const rnd = (a, b) => a + Math.random() * (b - a);
  let raf = 0, running = false, flyers = [];

  // 배경 그림에서 새싹이 지금 화면 어디에 있는지 계산 (화면 크기마다 그림 배치가 다름)
  function spot([px, py]) {
    const W = hero.clientWidth, H = hero.clientHeight, cs = getComputedStyle(hero);
    let iw, ih;
    if (cs.backgroundSize === "cover") { const s = Math.max(W / IMG.w, H / IMG.h); iw = IMG.w * s; ih = IMG.h * s; }
    else { const m = cs.backgroundSize.match(/auto\s+([\d.]+)%/); ih = H * (m ? +m[1] / 100 : 1); iw = ih * IMG.w / IMG.h; }
    const pos = cs.backgroundPosition.split(" ").map((v) => parseFloat(v) / 100);
    return { x: (W - iw) * pos[0] + px * iw, y: (H - ih) * pos[1] + py * ih, iw, ih, left: (W - iw) * pos[0], top: (H - ih) * pos[1] };
  }
  // 날아다닐 영역: 그림이 보이는 부분(글자 쪽은 피함)
  function area() {
    const W = hero.clientWidth, H = hero.clientHeight, s = spot(IMG.sprout);
    const wide = W >= 768;
    return wide ? { x0: W * 0.46, x1: W - 20, y0: 20, y1: H * 0.8 } : { x0: 16, x1: W - 16, y0: Math.max(H * 0.5, s.y - 160), y1: H - 30 };
  }

  function build() {
    fx.textContent = ""; flyers = [];
    if (night) fx.append(Object.assign(document.createElement("div"), { className: "fx-night" }));
    const s = spot(IMG.sprout);
    // 빛 알갱이
    for (let i = 0; i < 9; i++) {
      const m = document.createElement("i"); m.className = "fx-mote";
      m.style.left = (s.x + rnd(-24, 24)) + "px"; m.style.top = (s.y + rnd(-10, 20)) + "px";
      m.style.setProperty("--s", rnd(2.5, 5).toFixed(1) + "px");
      m.style.setProperty("--d", rnd(5, 8).toFixed(2) + "s");
      m.style.setProperty("--dl", (i * 0.7 + rnd(0, 0.5)).toFixed(2) + "s");
      m.style.setProperty("--dx", rnd(10, 70).toFixed(0) + "px");
      m.style.setProperty("--dy", -rnd(120, 220).toFixed(0) + "px");
      m.style.setProperty("--o", rnd(0.55, 0.9).toFixed(2));
      fx.append(m);
    }
    const A = area();
    if (night) {
      // 반딧불이: 천천히 떠다니며 깜빡임
      for (let i = 0; i < 12; i++) {
        const f = document.createElement("i"); f.className = "fx-fly";
        f.style.setProperty("--d", rnd(1.6, 3.4).toFixed(2) + "s");
        f.style.setProperty("--dl", rnd(0, 3).toFixed(2) + "s");
        fx.append(f);
        flyers.push({ el: f, kind: "fly", cx: rnd(A.x0, A.x1), cy: rnd(A.y0, A.y1), ax: rnd(30, 90), ay: rnd(20, 60), fx: rnd(0.08, 0.22), fy: rnd(0.07, 0.2), ph: rnd(0, 6.28), ph2: rnd(0, 6.28) });
      }
    } else {
      // 노란 나비 두 마리: 날개를 팔랑이며 그림 위를 돌아다님
      for (let i = 0; i < 2; i++) {
        const b = document.createElement("div"); b.className = "fx-bfly";
        b.innerHTML = '<svg viewBox="0 0 40 32"><g class="w l"><path d="M20 15 C14 2 3 1 2 8 C1 14 9 17 20 17Z"/><path d="M20 17 C12 18 6 24 9 28 C12 31 18 25 20 18Z"/></g><g class="w r"><path d="M20 15 C26 2 37 1 38 8 C39 14 31 17 20 17Z"/><path d="M20 17 C28 18 34 24 31 28 C28 31 22 25 20 18Z"/></g><path class="body" d="M19.3 10 Q20 8.5 20.7 10 L20.6 25 Q20 26.5 19.4 25Z"/></svg>';
        b.style.setProperty("--flap", rnd(0.22, 0.3).toFixed(2) + "s");
        fx.append(b);
        flyers.push({ el: b, kind: "bfly", cx: (A.x0 + A.x1) / 2 + rnd(-60, 60), cy: (A.y0 + A.y1) / 2 + rnd(-40, 40), ax: (A.x1 - A.x0) * rnd(0.32, 0.42), ay: (A.y1 - A.y0) * rnd(0.28, 0.38), fx: rnd(0.05, 0.08), fy: rnd(0.09, 0.14), ph: rnd(0, 6.28), ph2: rnd(0, 6.28), px: 0, py: 0 });
      }
    }
  }

  // 여러 사인 곡선을 겹쳐 불규칙하지만 부드럽게 움직이게
  function tick(now) {
    const t = now / 1000;
    for (const f of flyers) {
      const x = f.cx + f.ax * Math.sin(t * f.fx * 6.28 + f.ph) + f.ax * 0.35 * Math.sin(t * f.fx * 2.3 * 6.28 + f.ph2);
      const y = f.cy + f.ay * Math.sin(t * f.fy * 6.28 + f.ph2) + f.ay * 0.3 * Math.cos(t * f.fy * 1.7 * 6.28 + f.ph);
      if (f.kind === "bfly") {
        const ang = Math.max(-25, Math.min(25, (x - f.px) * 6));
        f.el.style.transform = `translate(${x}px,${y}px) rotate(${ang}deg)`;
        f.px = x; f.py = y;
      } else f.el.style.transform = `translate(${x}px,${y}px)`;
    }
    raf = requestAnimationFrame(tick);
  }
  function play() { if (running) return; running = true; fx.classList.remove("paused"); raf = requestAnimationFrame(tick); }
  function pause() { running = false; cancelAnimationFrame(raf); fx.classList.add("paused"); }

  build(); play();
  // 화면 밖·다른 탭에서는 멈춰 배터리 아끼기
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting && !document.hidden ? play() : pause()))).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 250); });

  // 관리자가 꺼 두었으면 걷기
  getDoc(doc(db, "site", "home")).then((s) => {
    if (s.exists() && s.data().introShow === false) { pause(); fx.textContent = ""; hero.classList.remove("is-night"); }
  }).catch(() => {});
}
