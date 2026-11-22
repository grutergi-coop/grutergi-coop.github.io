// 홈페이지 주소가 grutergi.pages.dev로 바뀌었습니다.
// 예전 주소(grutergi-coop.github.io)로 들어오면 같은 화면의 새 주소로 바로 넘겨 줍니다.
(function () {
  if (/\.github\.io$/.test(location.hostname)) {
    location.replace("https://grutergi.pages.dev" + location.pathname + location.search + location.hash);
  }
})();
