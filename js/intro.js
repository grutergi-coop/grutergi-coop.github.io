// 시작 애니메이션 — 안개 숲이 걷히고, 그루터기 위에서 새싹이 자랍니다(원화 8장 사이를 화면이 매끄럽게 채움).
// 하루 한 번 · 누르면 바로 넘어감 · '동작 줄이기' 존중 · 관리자 화면 › 홈 화면에서 켜고 끌 수 있음
import { db } from "./fb.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const root = document.documentElement;
const box = document.getElementById("intro");
const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function remove() { if (box) box.remove(); root.classList.remove("intro-on"); }

if (!box || root.classList.contains("no-intro")) {
  remove();
} else {
  // 원화 시트(4칸×2줄, 칸 384×512)에서 각 단계를 줄기 밑동 기준으로 맞춰 보여 줍니다.
  const W = 301, H = 274, PAD = 6;
  const base = [188.5, 206, 200.5, 195, 195.5, 194, 191, 186.5];
  const bottom = [429, 427, 427, 428, 418, 418, 418, 418];
  const sprout = box.querySelector(".intro-sprout");
  const frames = [];
  base.forEach((bx, i) => {
    const c = i % 4, r = Math.floor(i / 4);
    const ox = Math.round(W / 2 - bx), oy = H - PAD - bottom[i];
    const f = document.createElement("div"); f.className = "f";
    const img = document.createElement("img"); img.src = "assets/wc-stages.webp"; img.alt = "";
    img.style.left = ((ox - c * 384) / W * 100) + "%";
    img.style.top = ((oy - r * 512) / H * 100) + "%";
    f.append(img); sprout.append(f); frames.push(f);
  });

  let closed = false, raf = 0, timer = 0;
  const close = (remember = true) => {
    if (closed) return; closed = true;
    cancelAnimationFrame(raf); clearTimeout(timer);
    if (remember) { try { localStorage.setItem("gr-intro", day); } catch {} }
    box.classList.add("out");
    setTimeout(remove, 650);
  };
  box.addEventListener("click", () => close());
  addEventListener("keydown", () => close(), { once: true });

  // 관리자가 꺼 두었으면 바로 닫기
  getDoc(doc(db, "site", "home")).then((s) => { if (s.exists() && s.data().introShow === false) close(false); }).catch(() => {});

  // 그림이 준비되면 재생 (느린 연결에서 2.5초 안에 준비되지 않으면 건너뜀)
  const imgs = [...box.querySelectorAll("img")];
  const ready = Promise.all(imgs.map((im) => im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
  const late = new Promise((res) => setTimeout(() => res("late"), 2500));
  Promise.race([ready, late]).then((v) => {
    if (closed) return;
    if (v === "late") { close(false); return; }
    box.classList.add("play");
    const start = performance.now() + 1150, dur = 1500;
    const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur)), p = ease(t) * 7, i = Math.floor(p), k = p - i;
      frames.forEach((f, n) => { f.style.opacity = n === i ? (k < .5 ? 1 : 2 - 2 * k) : (n === i + 1 ? Math.min(1, 2 * k) : 0); });
      if (t < 1) raf = requestAnimationFrame(tick);
      else { frames.forEach((f, n) => { f.style.opacity = n === 7 ? 1 : 0; }); sprout.classList.add("sway"); }
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => close(), 4200);
  });
}
