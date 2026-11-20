// 낮/밤 정하기 — 화면이 그려지기 전에 실행해서 밤 그림이 처음부터 보이게 합니다.
// 방문자 기기 시계 기준 저녁 7시~새벽 6시는 밤. 확인용: 주소 끝에 ?time=day 또는 ?time=night
(function () {
  try {
    var q = (location.search.match(/[?&]time=(day|night)/) || [])[1];
    var h = new Date().getHours();
    var night = q ? q === "night" : (h >= 19 || h < 6);
    if (night) document.documentElement.classList.add("night");
  } catch (e) {}
})();
