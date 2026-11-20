// 시작 애니메이션 문지기 — 화면이 그려지기 전에 실행됩니다.
// 오늘 이미 봤거나, 기기에서 '동작 줄이기'를 켰으면 시작 장면을 건너뜁니다. (주소 끝에 ?intro=1 을 붙이면 다시 볼 수 있음)
(function () {
  try {
    var force = /[?&]intro=1/.test(location.search);
    var day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    var seen = localStorage.getItem("gr-intro") === day;
    var rm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!force && (seen || rm)) document.documentElement.classList.add("no-intro");
    else document.documentElement.classList.add("intro-on");
  } catch (e) {
    document.documentElement.classList.add("no-intro");
  }
})();
