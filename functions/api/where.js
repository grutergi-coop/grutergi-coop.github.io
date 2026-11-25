// 방문 통계용 '시·도' 알려 주기 (Cloudflare Pages Functions, 무료)
// 접속한 인터넷 주소(IP)로 Cloudflare가 추정한 지역을 시·도 이름 하나로만 바꿔 돌려줍니다.
//  · IP 주소, 도시·동네, 통신사, 위도·경도는 돌려주지도 저장하지도 않습니다.
//  · 이 함수는 아무것도 기록하지 않습니다. 숫자 세기는 화면(track.js)이 시·도 칸 하나만 1 올립니다.
//  · 다른 사이트에서는 결과를 읽을 수 없습니다(CORS 허용 머리글 없음).

// ISO 3166-2:KR 지역 번호 → 칸 이름 (강원·전북은 특별자치도 전환 뒤 번호 51·52도 함께)
const BY_CODE = {
  "11": "seoul", "26": "busan", "27": "daegu", "28": "incheon", "29": "gwangju", "30": "daejeon", "31": "ulsan", "50": "sejong",
  "41": "gyeonggi", "42": "gangwon", "51": "gangwon", "43": "chungbuk", "44": "chungnam", "45": "jeonbuk", "52": "jeonbuk",
  "46": "jeonnam", "47": "gyeongbuk", "48": "gyeongnam", "49": "jeju"
};
// 번호가 없을 때 영어 지역 이름으로 한 번 더 찾기
const BY_NAME = [
  [/seoul/, "seoul"], [/busan|pusan/, "busan"], [/daegu|taegu/, "daegu"], [/incheon|inchon/, "incheon"],
  [/gwangju|kwangju/, "gwangju"], [/daejeon|taejon/, "daejeon"], [/ulsan/, "ulsan"], [/sejong/, "sejong"],
  [/gyeonggi|kyonggi/, "gyeonggi"], [/gangwon|kangwon/, "gangwon"],
  [/chungcheongbuk|chungbuk|north chungcheong/, "chungbuk"], [/chungcheongnam|chungnam|south chungcheong/, "chungnam"],
  [/jeollabuk|jeonbuk|north jeolla/, "jeonbuk"], [/jeollanam|jeonnam|south jeolla/, "jeonnam"],
  [/gyeongsangbuk|gyeongbuk|north gyeongsang/, "gyeongbuk"], [/gyeongsangnam|gyeongnam|south gyeongsang/, "gyeongnam"],
  [/jeju|cheju/, "jeju"]
];

function regionOf(cf) {
  if (!cf || !cf.country) return "etc";
  if (cf.country !== "KR") return "abroad";
  const code = String(cf.regionCode || "").replace(/^KR-/, "");
  if (BY_CODE[code]) return BY_CODE[code];
  const name = String(cf.region || "").toLowerCase();
  for (const [re, key] of BY_NAME) if (re.test(name)) return key;
  return "etc";
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin"
};

export function onRequestGet({ request }) {
  return new Response(JSON.stringify({ r: regionOf(request.cf) }), { headers: HEADERS });
}

// 읽기(GET) 말고는 받지 않습니다
export function onRequest() {
  return new Response("", { status: 405, headers: { ...HEADERS, allow: "GET" } });
}
