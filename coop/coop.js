// 일반 협동조합안(검토용) 첫 화면
// 관리자 화면에 저장된 글(사회적협동조합 문구)은 불러오지 않고, 이 HTML에 적힌 글을 그대로 씁니다.
// 스크롤 연출(scroll.js)에 내용이 준비됐다고 알리기만 합니다.
document.dispatchEvent(new Event("home:filled"));
