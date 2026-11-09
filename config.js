// ─────────────────────────────────────────────────────────────
// 몬컬 도감 체크 — 설정 (이 파일 한 곳만 고치면 됨)
// ─────────────────────────────────────────────────────────────
// SUPABASE_URL / SUPABASE_ANON_KEY 가 비어 있으면
//   → 로그인 없이 "이 기기에만 저장" 모드로 동작 (localStorage)
//
// anon key 는 공개돼도 괜찮음(RLS가 막아줌).
// service_role 키는 절대 여기에 넣지 말 것!
window.MONCOL_CONFIG = {
  SUPABASE_URL: "https://qwdsfwmimnfevlnfmedl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_7EYmrbfkzHkg4lqFRBfR0Q_1-mxfJW4",

  // 로그인 안 한 사람에게 내 기록을 보기 전용으로 보여줄지
  //   true 로 쓰려면: Supabase에서 "public read" 정책 실행 + 아래 OWNER_USER_ID 입력
  PUBLIC_VIEW: false,
  OWNER_USER_ID: "",       // 로그인 후 화면 맨 아래에 표시되는 내 사용자 ID
};
