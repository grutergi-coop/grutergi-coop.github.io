// 첫 화면 빛 효과 — 새싹에서 피어오르는 빛 알갱이
//   낮: 나뭇잎 사이로 햇살이 비쳤다 가려졌다 하며, 해와 빛줄기·빛 얼룩이 아주 천천히 옮겨 감
//   밤(저녁 7시~새벽 6시): 은은하게 깜빡이며 제멋대로 떠다니는 반딧불이
// 화면을 가리지 않음 · 글자 아래 그림 위에서만 움직임 · '동작 줄이기' 존중 · 화면 밖이거나 다른 탭이면 멈춤
// 관리자 화면 › 홈 화면 › "첫 화면 빛 효과"로 켜고 끔. 확인용: 주소 끝에 ?time=day 또는 ?time=night
import { db } from "./fb.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const hero = document.querySelector(".hero");
const fx = hero && hero.querySelector(".hero-fx");
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

if (hero && fx && !reduce) start();

function start() {
  const night = document.documentElement.classList.contains("night");   // daynight.js가 화면 그리기 전에 정함
  if (night) hero.classList.add("is-night");

  const IMG = { w: 1280, h: 720, sprout: [0.594, 0.444], sun: [0.74, 0.15] };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let raf = 0, running = false, last = 0, items = [];

  // 배경 그림의 한 점이 지금 화면 어디에 있는지 (화면 크기마다 그림 배치가 다름)
  function spot([px, py]) {
    const W = hero.clientWidth, H = hero.clientHeight, cs = getComputedStyle(hero);
    let iw, ih;
    if (cs.backgroundSize === "cover") { const s = Math.max(W / IMG.w, H / IMG.h); iw = IMG.w * s; ih = IMG.h * s; }
    else { const m = cs.backgroundSize.match(/auto\s+([\d.]+)%/); ih = H * (m ? +m[1] / 100 : 1); iw = ih * IMG.w / IMG.h; }
    const pos = cs.backgroundPosition.split(" ").map((v) => parseFloat(v) / 100);
    return { x: (W - iw) * pos[0] + px * iw, y: (H - ih) * pos[1] + py * ih, iw, ih };
  }
  // 움직일 영역: 그림이 보이는 부분(글자 쪽은 피함)
  function area() {
    const W = hero.clientWidth, H = hero.clientHeight, s = spot(IMG.sprout);
    return W >= 768 ? { x0: W * 0.46, x1: W - 20, y0: 20, y1: H * 0.85 } : { x0: 16, x1: W - 16, y0: Math.max(H * 0.5, s.y - 160), y1: H - 30 };
  }
  // 부드러운 불규칙 값: 목표값을 가끔 새로 정하고 천천히 따라감 + 잎이 떨리는 잔물결
  function flicker(o, dt, { lo, hi, slow = [0.6, 2.2], fast = 0, rate = [1.2, 3.5] }) {
    o.wait -= dt;
    if (o.wait <= 0) { o.target = Math.random() < 0.18 ? lo : rnd(lo, hi); o.wait = rnd(slow[0], slow[1]); o.rate = rnd(rate[0], rate[1]); }
    o.v += (o.target - o.v) * Math.min(1, dt * o.rate);
    o.ph += dt * rnd(6, 11);
    return clamp(o.v + (fast ? Math.sin(o.ph) * fast * Math.random() : 0), 0, 1);
  }

  function motes(s) {
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
  }

  function build() {
    fx.textContent = ""; items = [];
    const s = spot(IMG.sprout), A = area(), W = hero.clientWidth;
    if (night) {
      motes(s);
      // 반딧불이 12마리: 각자 속도·방향·쉬는 때·깜빡이는 때가 다름
      for (let i = 0; i < 12; i++) {
        const el = document.createElement("i"); el.className = "fx-fly"; fx.append(el);
        items.push({ kind: "fly", el, A, x: rnd(A.x0, A.x1), y: rnd(A.y0, A.y1), ang: rnd(0, 6.28), sp: rnd(6, 16), want: rnd(6, 16),
          rest: 0, nextTurn: rnd(0.5, 2), turn: 0, glow: 0, phase: "off", t: rnd(0.5, 5), peak: rnd(0.35, 0.7) });
      }
    } else {
      // 나뭇잎 햇살 (아주 천천히 움직임)
      //  · 해 둘레의 은은한 빛무리가 1~2분에 한 바퀴 작게 돌며 숨 쉬듯 밝아졌다 어두워짐
      //  · 빛줄기 6줄이 해를 따라 함께 옮겨 가고, 각자 40~90초 박자로 몇 도씩 천천히 기울어짐
      //  · 빛 얼룩 7개가 30~80초에 걸쳐 그림 위를 미끄러지듯 옮겨 가며 잎에 가렸다 드러남
      const sun = spot(IMG.sun), unit = Math.max(0.6, Math.min(1.4, W / 1200)), H = hero.clientHeight;
      const TAU = Math.PI * 2;
      const glow = document.createElement("i"); glow.className = "fx-glow";
      const gs = Math.max(260, H * 0.9) * unit; glow.style.width = gs + "px"; glow.style.height = gs + "px";
      glow.style.left = (sun.x - gs / 2) + "px"; glow.style.top = (sun.y - gs / 2) + "px";
      fx.append(glow);
      const drift = { ax: 26 * unit, ay: 12 * unit, px: rnd(90, 120), py: rnd(70, 95), p0: rnd(0, TAU) };
      items.push({ kind: "glow", el: glow, drift, pb: rnd(18, 26), pp: rnd(0, TAU) });
      const rays = [[22, 34], [30, 22], [37, 46], [45, 28], [52, 40], [60, 24]];   // [기울기(도), 굵기]
      rays.forEach(([deg, wd]) => {
        const el = document.createElement("div"); el.className = "fx-beam";
        const w = wd * unit * rnd(0.85, 1.2), len = H * rnd(1.1, 1.6);
        el.style.width = w + "px"; el.style.height = len + "px";
        el.style.left = (sun.x - w / 2 + rnd(-30, 30)) + "px"; el.style.top = (sun.y - 20) + "px";
        fx.append(el);
        items.push({ kind: "beam", el, drift, deg: deg + rnd(-3, 3), sway: rnd(2.5, 5), per: rnd(40, 90), ph: rnd(0, TAU),
          f: { v: rnd(0.1, 0.4), target: 0.3, wait: rnd(0, 3), rate: 0.3, ph: 0 } });
      });
      const pts = [[0.70, 0.30], [0.80, 0.45], [0.62, 0.40], [0.88, 0.25], [0.66, 0.58], [0.76, 0.62], [0.56, 0.22]];
      pts.forEach(([px, py]) => {
        const p = spot([px + rnd(-0.03, 0.03), py + rnd(-0.03, 0.03)]);
        const el = document.createElement("i"); el.className = "fx-sun";
        const w = rnd(110, 220) * unit, hgt = w * rnd(0.55, 0.85);
        el.style.width = w + "px"; el.style.height = hgt + "px";
        el.style.left = (p.x - w / 2) + "px"; el.style.top = (p.y - hgt / 2) + "px";
        fx.append(el);
        items.push({ kind: "sun", el, rot: rnd(-25, 25), f: { v: rnd(0, 0.5), target: 0, wait: 0, rate: 0.3, ph: rnd(0, 6) },
          ax: rnd(30, 70) * unit, ay: rnd(16, 40) * unit, px: rnd(30, 80), py: rnd(36, 90), p0: rnd(0, TAU), sp: rnd(50, 80) });
      });
      motes(s);
    }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const t = now / 1000;
    for (const it of items) {
      if (it.kind === "fly") {
        // 방향을 가끔 바꾸고, 가끔 멈춰 떠 있다가 다시 날아감
        it.nextTurn -= dt;
        if (it.nextTurn <= 0) { it.turn = rnd(-1.6, 1.6); it.nextTurn = rnd(0.4, 2.5); it.want = Math.random() < 0.2 ? rnd(0.5, 2) : rnd(5, 20); }
        it.ang += it.turn * dt + rnd(-0.6, 0.6) * dt;
        it.sp += (it.want - it.sp) * Math.min(1, dt * 1.5);
        const A = it.A, cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2;
        if (it.x < A.x0 || it.x > A.x1 || it.y < A.y0 || it.y > A.y1) {   // 영역 밖이면 부드럽게 안쪽으로
          const to = Math.atan2(cy - it.y, cx - it.x); let d = to - it.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d)); it.ang += d * Math.min(1, dt * 2);
        }
        it.x += Math.cos(it.ang) * it.sp * dt; it.y += Math.sin(it.ang) * it.sp * dt + Math.sin(t * 1.3 + it.peak * 9) * 2 * dt;
        // 깜빡임: 꺼져 있다가 → 천천히 켜지고 → 잠시 머물고 → 천천히 꺼짐 (반딧불이마다 다른 박자)
        it.t -= dt;
        if (it.phase === "off" && it.t <= 0) { it.phase = "up"; it.t = rnd(0.4, 0.9); }
        else if (it.phase === "up") { it.glow = Math.min(1, it.glow + dt / 0.6); if (it.t <= 0) { it.phase = "hold"; it.t = rnd(0.3, 1.4); } }
        else if (it.phase === "hold" && it.t <= 0) { it.phase = "down"; }
        else if (it.phase === "down") { it.glow = Math.max(0, it.glow - dt / 1.1); if (it.glow <= 0) { it.phase = "off"; it.t = rnd(1.5, 6); it.peak = rnd(0.35, 0.7); } }
        it.el.style.opacity = (0.03 + it.glow * it.peak).toFixed(3);
        it.el.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`;
      } else if (it.kind === "sun") {
        const TAU = Math.PI * 2;
        const v = flicker(it.f, dt, { lo: 0.06, hi: 0.8, slow: [6, 12], rate: [0.12, 0.3] });   // 아주 천천히 밝아지고 가려짐
        const dx = Math.sin(t * TAU / it.px + it.p0) * it.ax, dy = Math.sin(t * TAU / it.py + it.p0 * 1.7) * it.ay;   // 그림 위를 천천히 미끄러짐
        const sc = 1 + Math.sin(t * TAU / it.sp + it.p0) * 0.08;
        it.el.style.opacity = v.toFixed(3);
        it.el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${(it.rot + Math.sin(t * TAU / it.sp) * 6).toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      } else if (it.kind === "beam") {
        const TAU = Math.PI * 2, d = it.drift;
        const gx = Math.sin(t * TAU / d.px + d.p0) * d.ax, gy = Math.sin(t * TAU / d.py + d.p0) * d.ay;   // 해를 따라 함께 옮겨 감
        const deg = it.deg + Math.sin(t * TAU / it.per + it.ph) * it.sway;                           // 천천히 기울어짐
        it.el.style.opacity = flicker(it.f, dt, { lo: 0.12, hi: 0.7, slow: [7, 14], rate: [0.1, 0.25] }).toFixed(3);
        it.el.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px) rotate(${deg.toFixed(2)}deg)`;
      } else if (it.kind === "glow") {
        const TAU = Math.PI * 2, d = it.drift;
        const gx = Math.sin(t * TAU / d.px + d.p0) * d.ax, gy = Math.sin(t * TAU / d.py + d.p0) * d.ay;
        it.el.style.opacity = (0.55 + Math.sin(t * TAU / it.pb + it.pp) * 0.2).toFixed(3);
        it.el.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px)`;
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function play() { if (running) return; running = true; last = 0; fx.classList.remove("paused"); raf = requestAnimationFrame(tick); }
  function pause() { running = false; cancelAnimationFrame(raf); fx.classList.add("paused"); }

  build(); play();
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting && !document.hidden ? play() : pause()))).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 250); });

  // 관리자가 꺼 두었으면 걷기
  getDoc(doc(db, "site", "home")).then((s) => {
    if (s.exists() && s.data().introShow === false) { pause(); fx.textContent = ""; hero.classList.remove("is-night"); }
  }).catch(() => {});
}
